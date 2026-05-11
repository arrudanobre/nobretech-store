import type {
  OrionAnalysis,
  OrionExecutionBundle,
  OrionExecutionPayload,
  OrionExecutionProduct,
  OrionExecutionScenario,
  OrionOperationalContext,
  OrionSnapshot,
} from "./types"
import { isActionableLead } from "./lead-classification"
import { resolveOperationalTarget } from "./operational-target"

type StockItem = OrionSnapshot["stock"]["availableItems"][number]
type PromotionMode = OrionExecutionBundle["promotionMode"]

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

function round(value: number, places = 0) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function moneyFromText(text: string) {
  const match = text.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i)
  if (!match) return null
  return Number(match[1].replace(/\./g, "").replace(",", "."))
}

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function basePrice(item: StockItem) {
  return Math.max(0, Math.round(item.suggestedPrice || item.purchasePrice * 1.2))
}

function baseProfit(item: StockItem) {
  return Math.max(0, basePrice(item) - item.purchasePrice)
}

function marginPct(price: number, cost: number) {
  return price > 0 ? round(((price - cost) / price) * 100, 1) : 0
}

function productQuantity(item: StockItem) {
  return Math.max(1, Math.floor(item.quantity || 1))
}

function isAccessory(item: Pick<StockItem, "category" | "name">) {
  const text = normalize(`${item.category} ${item.name}`)
  return /acessor|accessor|pelicula|capa|case|carregador|cabo|fonte|caneta/.test(text)
}

function operationalItems(snapshot: OrionSnapshot) {
  return snapshot.stock.availableItems.filter((item) => item.status === "active" || item.status === "in_stock")
}

function stockToExecutionProduct(item: StockItem, role: OrionExecutionProduct["role"], reason: string): OrionExecutionProduct {
  const price = basePrice(item)
  const profit = Math.max(0, price - item.purchasePrice)
  return {
    id: item.id,
    name: item.name,
    quantity: productQuantity(item),
    price,
    cost: item.purchasePrice,
    profit,
    marginPct: marginPct(price, item.purchasePrice),
    daysInStock: item.daysInStock,
    status: item.status,
    role,
    reason,
    conversionSpeed: price <= 3500 || /iphone\s?14|iphone\s?13/i.test(item.name) ? "alta" : price <= 6000 ? "media" : "baixa",
  }
}

function salesSignalScore(item: StockItem, snapshot: OrionSnapshot) {
  const itemName = normalize(item.name)
  const match = snapshot.sales.topProducts.find((product) => {
    const label = normalize(product.label)
    return label && (itemName.includes(label) || label.includes(itemName.split(" ")[0] || ""))
  })
  return match ? match.value * 12 : 0
}

function scoreFor(item: StockItem, snapshot: OrionSnapshot, mode: "anchor" | "turnover" | "liquidity") {
  const price = basePrice(item)
  const profit = baseProfit(item)
  const quantity = productQuantity(item)
  const signal = salesSignalScore(item, snapshot)
  if (mode === "turnover") {
    return signal + quantity * 20 + (price <= 3500 ? 35 : 0) + (/iphone\s?14|iphone\s?13/i.test(item.name) ? 20 : 0)
  }
  if (mode === "liquidity") {
    return signal + quantity * 15 + Math.min(item.daysInStock, 70) + (price <= 4500 ? 20 : 0)
  }
  return signal + profit / 25 + quantity * 12 + (price <= 6500 ? 12 : 0) - Math.max(0, price - 8000) / 200
}

function uniqueProducts(products: OrionExecutionProduct[]) {
  const seen = new Set<string>()
  const result: OrionExecutionProduct[] = []
  for (const product of products) {
    const key = `${product.role}-${product.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(product)
  }
  return result
}

function pickBestItem(items: StockItem[], score: (item: StockItem) => number, excludedIds: Set<string>) {
  const preferred = items.filter((item) => !excludedIds.has(item.id))
  const pool = preferred.length ? preferred : items
  return [...pool].sort((a, b) => score(b) - score(a))[0]
}

function chooseProducts(snapshot: OrionSnapshot) {
  const items = operationalItems(snapshot).filter((item) => !isAccessory(item))
  if (!items.length) return []
  const usedIds = new Set<string>()
  const premium = pickBestItem(items, (item) => baseProfit(item) + basePrice(item) / 100, usedIds)
  usedIds.add(premium.id)
  const anchor = pickBestItem(items, (item) => scoreFor(item, snapshot, "anchor"), usedIds)
  usedIds.add(anchor.id)
  const turnover = pickBestItem(items, (item) => scoreFor(item, snapshot, "turnover"), usedIds)
  usedIds.add(turnover.id)
  const liquidity = pickBestItem(items, (item) => scoreFor(item, snapshot, "liquidity"), usedIds)
  return uniqueProducts([
    stockToExecutionProduct(premium, "premium", "Maior lucro absoluto no estoque operacional atual."),
    stockToExecutionProduct(anchor, "anchor", "Melhor equilíbrio entre lucro, preço e velocidade comercial."),
    stockToExecutionProduct(turnover, "turnover", "Maior chance de conversa rápida pelo ticket e sinal de demanda."),
    stockToExecutionProduct(liquidity, "liquidity", "Melhor combinação para virar caixa sem depender de desconto agressivo."),
  ])
}

function accessoryCompatibilityScore(product: OrionExecutionProduct, accessory: StockItem) {
  const productName = normalize(product.name)
  const accessoryName = normalize(accessory.name)
  const isIphone = /iphone/.test(productName)
  const isIpad = /ipad/.test(productName)
  let score = baseProfit(accessory)

  if (isIphone) {
    if (/iphone|carregador|cabo|usb|lightning|fonte/.test(accessoryName)) score += 120
    if (/ipad|trifold|stylus|caneta/.test(accessoryName)) score -= 160
  }

  if (isIpad) {
    if (/ipad|pelicula|trifold|stylus|caneta|capa/.test(accessoryName)) score += 120
    if (/iphone/.test(accessoryName) && !/carregador|cabo|usb|lightning|fonte/.test(accessoryName)) score -= 160
  }

  return score
}

function selectAddOns(accessories: StockItem[], count: number, product: OrionExecutionProduct) {
  const ranked = accessories
    .filter((item) => productQuantity(item) > 0)
    .map((item) => ({ item, score: accessoryCompatibilityScore(product, item) }))
    .sort((a, b) => b.score - a.score || baseProfit(b.item) - baseProfit(a.item) || basePrice(b.item) - basePrice(a.item))
  const compatible = ranked.filter((entry) => entry.score >= 0)
  const selected = (compatible.length ? compatible : ranked).slice(0, count)
  return selected
    .map((entry) => entry.item)
    .map((item) => ({
      name: item.name,
      quantity: 1,
      price: basePrice(item),
      cost: item.purchasePrice,
    }))
}

function makeBundle(product: OrionExecutionProduct, mode: PromotionMode, index: number, accessories: StockItem[]): OrionExecutionBundle {
  const variants: Record<PromotionMode, {
    tag: string
    label: string
    discountPct: number
    addOnCount: number
    addOnDiscountPct: number
    goalUnits: number
    objective: string
  }> = {
    conservative: {
      tag: "Conservador",
      label: "preço cheio com valor agregado",
      discountPct: 0,
      addOnCount: 2,
      addOnDiscountPct: 0,
      goalUnits: 1,
      objective: "Preservar o preço do aparelho e vender acessórios como percepção de valor, sem forçar desconto.",
    },
    balanced: {
      tag: "Balanceado",
      label: "combo com bônus leve",
      discountPct: 0.015,
      addOnCount: 2,
      addOnDiscountPct: 0.15,
      goalUnits: 1,
      objective: "Aumentar velocidade com desconto leve no pacote, mantendo margem saudável.",
    },
    aggressive: {
      tag: "Agressivo",
      label: "liquidez rápida",
      discountPct: 0.04,
      addOnCount: 1,
      addOnDiscountPct: 0.35,
      goalUnits: 1,
      objective: "Usar apenas quando a prioridade for caixa rápido ou liberação de capital parado.",
    },
  }
  const variant = variants[mode]
  const addOns = selectAddOns(accessories, variant.addOnCount, product)
  const addOnPrice = addOns.reduce((sum, item) => sum + item.price * (1 - variant.addOnDiscountPct), 0)
  const productDiscount = Math.round(product.price * variant.discountPct)
  const price = Math.max(0, Math.round(product.price - productDiscount + addOnPrice))
  const cost = Math.round(product.cost + addOns.reduce((sum, item) => sum + item.cost, 0))
  const profit = Math.max(0, price - cost)
  const safeProfitRatio = mode === "aggressive" ? 0.58 : mode === "balanced" ? 0.7 : 0.8
  const safeProfitFloor = Math.max(0, Math.min(profit, Math.round(product.profit * safeProfitRatio)))
  const minimumSafePrice = Math.max(cost, Math.round(cost + safeProfitFloor))
  const goalUnits = Math.min(product.quantity, variant.goalUnits)
  const items = [product.name, ...addOns.map((item) => item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name)]
  const promotionNote = `Lucro alvo ${brlFormatter.format(profit)}; promoção segura até ${brlFormatter.format(safeProfitFloor)} de lucro. Abaixo de ${brlFormatter.format(minimumSafePrice)}, a venda começa a consumir capital de reposição.`
  return {
    id: `${product.id}-${index}`,
    name: `${product.name} — ${variant.label}`,
    tag: variant.tag,
    promotionMode: mode,
    items,
    addOns,
    productPrice: product.price,
    discount: productDiscount,
    price,
    cost,
    profit,
    marginPct: marginPct(price, cost),
    minimumSafePrice,
    safeProfitFloor,
    promotionNote,
    goalUnits,
    projectedProfit: profit * goalUnits,
    objective: variant.objective,
  }
}

function compatibleLeadAudience(snapshot: OrionSnapshot, product: OrionExecutionProduct) {
  const productName = normalize(product.name)
  const firstToken = productName.split(" ")[0] || productName
  const matches = snapshot.marketing.forgottenLeads
    .filter((lead) => isActionableLead(lead.status) && lead.classification !== "lost")
    .filter((lead) => {
      const interest = normalize(`${lead.productInterest || ""} ${lead.originalIntent || ""}`)
      return !interest || interest.includes(firstToken) || productName.includes(interest.split(" ")[0] || "")
    })
    .slice(0, 3)

  if (matches.length) {
    return `Começar por ${matches.map((lead) => lead.name).join(", ")}; leads compatíveis com ${product.name}.`
  }
  return `Base Apple compatível com ${product.name}; sem acionar leads perdidos ou opt-out.`
}

function pressureLevel(snapshot: OrionSnapshot) {
  const forecast = snapshot.executive.liquidityForecast
  if (forecast.overduePayables > forecast.overdueReceivables || forecast.pressureWindowStartDays === 0) return "alta"
  if (forecast.pressureWindowStartDays !== null && forecast.pressureWindowStartDays <= 7) return "media"
  return "normal"
}

function targetProfitFrom(analysis: OrionAnalysis, operationalContext?: OrionOperationalContext | null) {
  void analysis
  return moneyFromText(`${operationalContext?.answer || ""} ${operationalContext?.summary || ""}`)
}

function buildFinancialGoal(snapshot: OrionSnapshot) {
  const forecast = snapshot.executive.liquidityForecast
  const workingCapital = snapshot.finance.workingCapitalSnapshot
  const financialScenario = snapshot.finance.financialScenarioSnapshot
  const profitAvailability = snapshot.finance.profitAvailabilitySnapshot
  const cashComposition = snapshot.finance.currentCashCompositionSnapshot
  const grossCash = Math.round(workingCapital.availableCash || snapshot.executive.cashBalance)
  const financialContext = snapshot.finance.financialOperationalContext
  const operationalProfitAvailable = Math.max(0, Math.round(profitAvailability.realizedProfitInPeriod || financialScenario.realizedProfit))
  const liquidProfitAvailable = operationalProfitAvailable
  const protectedWorkingCapital = Math.max(0, Math.round(workingCapital.protectedOperationalCapital))
  const estimatedReceivableProfit = Math.max(0, Math.round(forecast.receivables30d * Math.max(0, snapshot.executive.marginPct30d) / 100))
  const reserveTarget = forecast.payables30d > 0 ? Math.max(300, Math.round(forecast.payables30d * 0.25)) : 0
  const projectedCashAfterCommitments = Math.round(grossCash + forecast.receivables30d - forecast.payables30d)
  const requiredNewProfit = Math.max(0, Math.round(-(profitAvailability.profitAfterWithdrawals - forecast.payables30d)))
  const profitBufferAfterPayables = Math.round(profitAvailability.profitAfterWithdrawals - forecast.payables30d)
  const workingCapitalAfterPayables = Math.round(grossCash - forecast.payables30d)
  const nextDue = forecast.nextPayables[0] || null
  const nextDueDays = nextDue ? nextDue.daysUntilDue : null
  const coveredOnlyByGross = forecast.payables30d > 0 && projectedCashAfterCommitments >= 0 && profitBufferAfterPayables < reserveTarget
  const urgencyLevel = projectedCashAfterCommitments < 0 || (nextDueDays !== null && nextDueDays <= 3)
    ? "urgent" as const
    : requiredNewProfit > 0 || coveredOnlyByGross || (nextDueDays !== null && nextDueDays <= 10)
      ? "attention" as const
      : "stable" as const
  const headline = requiredNewProfit > 0
    ? `No período ${profitAvailability.period.label}, o lucro realizado após retiradas ainda precisa de ${brlFormatter.format(requiredNewProfit)} para cobrir contas próximas.`
    : forecast.payables30d > 0
      ? `O caixa atual cobre as obrigações próximas; no período ${profitAvailability.period.label}, o lucro após retiradas está em ${brlFormatter.format(profitAvailability.profitAfterWithdrawals)}.`
      : `Cenário equilibrado: caixa consolidado de ${brlFormatter.format(cashComposition.consolidatedCash)} e lucro realizado no período de ${brlFormatter.format(liquidProfitAvailable)}.`
  const strategy = requiredNewProfit > 0
    ? "Priorizar vendas cujo lucro cubra a conta, sem usar o custo de reposição do estoque como se fosse lucro. Toda promoção deve manter piso positivo e preservar capital de recompra."
    : coveredOnlyByGross
      ? "A conta cabe no caixa, mas retirada ou recompra deve respeitar lucro realizado, contas próximas e estoque ativo."
      : "Operação saudável com capital imobilizado típico; reinvestimento deve ser controlado e baseado em lucro realizado."

  return {
    headline,
    urgencyLevel,
    currentCash: grossCash,
    grossCash,
    protectedWorkingCapital,
    liquidProfitAvailable,
    estimatedReceivableProfit,
    payables30d: forecast.payables30d,
    receivables30d: forecast.receivables30d,
    reserveTarget,
    requiredNewProfit,
    projectedCashAfterCommitments,
    workingCapitalAfterPayables,
    profitBufferAfterPayables,
    safeWithdrawalAmount: Math.round(cashComposition.availableForWithdrawal),
    safeReinvestmentAmount: Math.round(cashComposition.availableForReinvestment),
    operationalSurplusAfterBills: profitBufferAfterPayables,
    replacementCapitalBasis: [
      `Estoque ativo protegido: ${brlFormatter.format(workingCapital.activeInventoryCapital)}.`,
      workingCapital.activeInventoryCapital > grossCash
        ? "Inclui estoque ativo ainda não convertido em caixa; isso não é dívida nem erro de caixa."
        : "Inclui estoque ativo ainda não convertido em caixa. Base atual, sem CMV histórico ou compras antigas já realizadas.",
      financialContext.profitInterpretation,
      `Retiradas de lucro no período: ${brlFormatter.format(profitAvailability.ownerProfitWithdrawalsInPeriod)}; devoluções de aporte: ${brlFormatter.format(profitAvailability.ownerCapitalReturnsInPeriod)}; devoluções sem lastro: ${brlFormatter.format(profitAvailability.untracedOwnerCapitalReturnsInPeriod)}; lucro após retiradas: ${brlFormatter.format(profitAvailability.profitAfterWithdrawals)}.`,
      `Potencial projetado de estoque: ${brlFormatter.format(financialScenario.projectedInventoryProfit)} separado do lucro realizado.`,
    ].filter(Boolean).join(" "),
    nextDueLabel: nextDue ? `${nextDue.label} · ${brlFormatter.format(nextDue.amount)} em ${nextDue.daysUntilDue} dia${nextDue.daysUntilDue === 1 ? "" : "s"}` : null,
    nextDueDays,
    strategy,
  }
}

export function buildOrionExecutionPayload(
  snapshot: OrionSnapshot,
  analysis: OrionAnalysis,
  operationalContext?: OrionOperationalContext | null
): OrionExecutionPayload {
  const products = chooseProducts(snapshot)
  const availableStock = operationalItems(snapshot)
  const accessories = availableStock.filter(isAccessory)
  const inventory = availableStock
    .map((item) => {
      const price = basePrice(item)
      return {
        id: item.id,
        name: item.name,
        quantity: productQuantity(item),
        price,
        cost: item.purchasePrice,
        profit: Math.max(0, price - item.purchasePrice),
        marginPct: marginPct(price, item.purchasePrice),
        daysInStock: item.daysInStock,
        status: item.status,
      }
    })

  const priority = products.find((product) => product.role === "anchor") || products[0] || null
  const offerProduct = priority || products[0] || null
  const secondaryProduct = offerProduct
    ? products.find((product) => product.id !== offerProduct.id && product.role === "premium")
      || products.find((product) => product.id !== offerProduct.id)
      || offerProduct
    : null
  const bundleSpecs = offerProduct
    ? [
        { product: offerProduct, mode: "conservative" as const },
        { product: offerProduct, mode: "balanced" as const },
        { product: secondaryProduct || offerProduct, mode: "aggressive" as const },
      ]
    : []
  const bundles = bundleSpecs.map((spec, index) => makeBundle(spec.product, spec.mode, index, accessories))
  const targetProfit = targetProfitFrom(analysis, operationalContext)
  const financialGoal = buildFinancialGoal(snapshot)
  const maxPossibleProfit = inventory.reduce((sum, item) => sum + item.profit * item.quantity, 0)
  const operationalTarget = resolveOperationalTarget({
    explicitUserGoal: targetProfit,
    realAvailableProfit: financialGoal.liquidProfitAvailable,
  })
  const goalProfit = operationalTarget.target.targetAmount || (priority ? priority.profit : 0)
  const gap = Math.max(0, goalProfit - maxPossibleProfit)
  const pressure = pressureLevel(snapshot)
  const recommendedScenario = pressure === "alta" ? "aggressive" : pressure === "media" ? "balanced" : "balanced"
  const maxCac = priority ? Math.max(20, Math.round(priority.profit * (pressure === "alta" ? 0.12 : 0.16))) : 0
  const maxCpl = Math.max(6, Math.round(maxCac * 0.18))
  const expectedSales = priority ? Math.max(1, Math.min(priority.quantity, Math.ceil((goalProfit || priority.profit) / Math.max(priority.profit, 1)))) : 0
  const qualifiedConversationTarget = expectedSales ? Math.max(3, expectedSales * 5) : 0
  const budgetDaily = maxCpl ? Math.max(15, Math.min(90, Math.round((qualifiedConversationTarget * maxCpl) / 3))) : 0
  const topBundle = bundles.find((bundle) => bundle.promotionMode === recommendedScenario) || bundles[0] || null

  const scenarios: OrionExecutionScenario[] = [
    {
      mode: "conservative",
      title: "Conservador",
      expectedProfit: bundles[0]?.projectedProfit || 0,
      marginPct: bundles[0]?.marginPct || 0,
      speed: "média",
      risk: "baixo",
      budgetDaily: Math.max(15, Math.round(budgetDaily * 0.45)),
      maxCac: Math.max(15, Math.round(maxCac * 0.85)),
      channel: "WhatsApp + base própria",
      bundleName: bundles[0]?.name || "",
      operationalEffort: "baixo",
    },
    {
      mode: "balanced",
      title: "Balanceado",
      expectedProfit: bundles[1]?.projectedProfit || 0,
      marginPct: bundles[1]?.marginPct || 0,
      speed: "alta",
      risk: "médio",
      budgetDaily,
      maxCac,
      channel: "Meta Ads + WhatsApp",
      bundleName: bundles[1]?.name || "",
      operationalEffort: "médio",
    },
    {
      mode: "aggressive",
      title: "Agressivo",
      expectedProfit: bundles[2]?.projectedProfit || 0,
      marginPct: bundles[2]?.marginPct || 0,
      speed: "muito alta",
      risk: "alto",
      budgetDaily: Math.max(25, Math.round(budgetDaily * 1.6)),
      maxCac: Math.max(20, Math.round(maxCac * 1.15)),
      channel: "Meta Ads + remarketing + lista quente",
      bundleName: bundles[2]?.name || "",
      operationalEffort: "alto",
    },
  ]

  return {
    objective: {
      title: targetProfit ? `Meta de ${brlFormatter.format(targetProfit)}` : "Meta de caixa protegido",
      diagnosis: priority
        ? `${financialGoal.headline} Estratégia: ${priority.name} lidera com preço de ${brlFormatter.format(priority.price)} e lucro unitário de ${brlFormatter.format(priority.profit)}.`
        : "Sem produto operacional ativo suficiente para montar plano comercial.",
      targetProfit,
      maxPossibleProfit,
      gap,
      operationalTarget: operationalTarget.target,
      gapToOperationalTarget: operationalTarget.gap,
      deadlineLabel: null,
      recommendedScenario,
      financialGoal,
    },
    priorityAction: priority ? {
      product: priority,
      price: priority.price,
      profit: priority.profit,
      urgency: pressure === "alta" ? "Executar hoje por pressão de caixa." : "Executar nas próximas 72h com margem protegida.",
      salesArgument: `${priority.name} em pronta entrega com garantia Nobretech, preço claro e fechamento via WhatsApp.`,
      cta: "Me chama no WhatsApp para travar essa unidade agora.",
      bundleName: topBundle?.name || null,
      risk: priority.daysInStock >= 45 ? "Capital parado exige velocidade sem liquidar margem." : "Risco principal é demora no atendimento.",
      expectedReturn: topBundle?.profit || priority.profit,
    } : null,
    products,
    inventory,
    bundles,
    trafficPlan: priority ? {
      budgetDaily,
      durationDays: 3,
      totalBudget: budgetDaily * 3,
      qualifiedConversationTarget,
      maxCpl,
      maxCac,
      channel: "Meta Ads — Mensagens WhatsApp",
      campaignType: "Campanha curta de conversa qualificada",
      pauseIf: `Pausar se CPL passar de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(maxCpl)} ou não gerar conversa qualificada em 24h.`,
      scaleIf: "Escalar se gerar 3 conversas qualificadas em 24h ou fechar 1 venda.",
      expectedSales,
      calculationBasis: [
        `Produto base: ${priority.name} com lucro unitário de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(priority.profit)}.`,
        `CAC máximo: ${pressure === "alta" ? "12%" : "16%"} do lucro unitário para não comprar venda sem margem.`,
        `CPL máximo: 18% do CAC, assumindo cerca de 5 conversas qualificadas por venda.`,
        `Verba diária: conversas necessárias x CPL máximo dividido por ${3} dias.`,
      ],
    } : null,
    whatsappPlan: priority ? {
      audience: compatibleLeadAudience(snapshot, priority),
      firstApproach: `Abrir com ${priority.name}, pronta entrega, garantia e condição de fechamento.`,
      followUp: "Retornar em até 3 horas se houver abertura ou pergunta de preço.",
      sla: "Responder conversa quente em até 15 minutos.",
      closingTrigger: "Última unidade, garantia Nobretech, parcelamento e retirada/entrega rápida.",
      operationalOrder: [
        `Abordar interessados compatíveis com ${priority.name}.`,
        topBundle ? `Apresentar ${topBundle.name}: ${topBundle.items.join(" + ")} antes de falar em desconto.` : "Apresentar oferta principal antes de desconto.",
        "Usar prova de estoque e garantia como gatilho de confiança.",
        "Encerrar follow-up ativo se o lead estiver perdido, cancelado ou incompatível.",
      ],
    } : null,
    timeline72h: priority ? [
      { window: "Hora 0", action: `Fotografar e publicar ${priority.name}.`, kpi: "Oferta pronta", expectedTarget: "1 criativo + 1 roteiro WhatsApp" },
      { window: "0-6h", action: "Publicar Stories e acionar base compatível.", kpi: "Respostas", expectedTarget: `${Math.max(3, Math.round(qualifiedConversationTarget / 2))} respostas` },
      { window: "6-24h", action: "Atender WhatsApp e qualificar intenção.", kpi: "Conversas quentes", expectedTarget: `${Math.max(2, expectedSales * 3)} conversas` },
      { window: "24-48h", action: "Rodar Meta Ads e remarketing.", kpi: "CPL", expectedTarget: `até ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(maxCpl)}` },
      { window: "48-72h", action: "Escalar campanha vencedora ou pausar.", kpi: "Venda", expectedTarget: `${expectedSales} venda${expectedSales === 1 ? "" : "s"}` },
    ] : [],
    scenarios,
    realProfitability: snapshot.finance.realProfitSnapshot.realProfitability,
    protectedCapital: snapshot.finance.realProfitSnapshot.protectedCapital,
    availableProfit: snapshot.finance.realProfitSnapshot.availableProfit,
    inventoryPressure: snapshot.finance.realProfitSnapshot.inventoryPressure,
    lowMarginWarnings: snapshot.finance.realProfitSnapshot.lowMarginWarnings,
  }
}
