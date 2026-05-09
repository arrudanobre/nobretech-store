import type { InventoryContextItem } from "./business-query-engine"
import type { OperationalHealthScore } from "./operational-health-engine"
import type { OrionSnapshot } from "./types"

type SignalProduct = {
  product: string
  profit?: number
  revenue?: number
  sales?: number
}

type ScenarioMode = "conservative" | "balanced" | "aggressive"

type Scenario = {
  title: string
  objective: string
  products: InventoryContextItem[]
  mixSummary: string
  idealPrice: number
  floorPrice: number
  unitProfit: number
  totalProfit: number
  finalMarginPct: number
  requiredUnits: number
  feasibleUnits: number
  maxPossibleProfit: number
  capacityGap: number
  trafficBudgetDaily: number
  trafficDurationDays: number
  healthyCac: number
  healthyCpl: number
  qualifiedConversations: number
  channel: string
  campaignType: string
  cta: string
  creative: string
  audience: string
  remarketing: string
  expectedTerm: string
  conversionProbability: string
  operationalEffort: string
  liquidityImpact: string
  risk: string
  pauseTrigger: string
  scaleTrigger: string
  justifiedWhen: string
}

type PortfolioSku = {
  product: InventoryContextItem
  name: string
  quantity: number
  ticket: number
  unitProfit: number
  marginPct: number
  velocityScore: number
  absoluteMarginScore: number
  marginQualityScore: number
  ticketPsychologyScore: number
  priceElasticityScore: number
  bundleCompatibilityScore: number
  adEaseScore: number
  whatsappEaseScore: number
  agingRiskScore: number
  trafficPotentialScore: number
  commercialExecutionScore: number
}

type PortfolioRoles = {
  giro: PortfolioSku
  premium: PortfolioSku
  anchor: PortfolioSku
  liquidity: PortfolioSku
}

type BuildScenarioParams = {
  products: InventoryContextItem[]
  snapshot: OrionSnapshot
  health: OperationalHealthScore
  targetProfit?: number | null
  signalProducts?: SignalProduct[]
  context?: string
}

const BUNDLE_COST_ESTIMATE = 40

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value)
}

function pct(value: number) {
  return `${round(value, 1).toLocaleString("pt-BR")}%`
}

function productName(product: InventoryContextItem) {
  return product.name.replace(/\s+/g, " ").replace(/\bAcessórios\s+/i, "").trim()
}

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function pressureLevel(snapshot: OrionSnapshot, health: OperationalHealthScore) {
  const forecast = snapshot.executive.liquidityForecast
  const immediatePressure = forecast.pressureWindowStartDays === 0
    || forecast.overduePayables > forecast.overdueReceivables
    || (forecast.pressureWindowStartDays !== null && forecast.pressureWindowStartDays <= 7)

  if (health.level === "critical" || immediatePressure) return "high"
  if (health.level === "attention" || forecast.payables15d > forecast.receivables15d + snapshot.finance.reconciledCashBalance) return "medium"
  return "low"
}

function scenarioPrice(product: InventoryContextItem, mode: ScenarioMode) {
  const idealPrice = product.suggestedPrice || product.purchasePrice * 1.2
  const safeFloor = product.minimumSafePrice || product.purchasePrice * 1.08
  const discountRoom = Math.max(0, idealPrice - safeFloor)

  if (mode === "conservative") return Math.round(idealPrice)
  if (mode === "balanced") return Math.round(idealPrice - discountRoom * 0.35)
  return Math.round(idealPrice - discountRoom * 0.75)
}

function scenarioTrafficBudget(mode: ScenarioMode, pressure: "low" | "medium" | "high") {
  if (mode === "conservative") return pressure === "high" ? 25 : 15
  if (mode === "balanced") return pressure === "high" ? 55 : 40
  return pressure === "high" ? 90 : 65
}

function scenarioHealthyCac(mode: ScenarioMode, unitProfitValue: number, pressure: "low" | "medium" | "high") {
  const pressureMultiplier = pressure === "high" ? 0.9 : pressure === "medium" ? 0.8 : 0.7
  const modeMultiplier = mode === "conservative" ? 0.16 : mode === "balanced" ? 0.14 : 0.1
  return Math.max(15, Math.round(unitProfitValue * modeMultiplier * pressureMultiplier))
}

function scenarioCloseRate(mode: ScenarioMode) {
  if (mode === "conservative") return 0.16
  if (mode === "balanced") return 0.2
  return 0.25
}

function scenarioHealthyCpl(healthyCac: number, mode: ScenarioMode) {
  return Math.max(6, Math.round(healthyCac * scenarioCloseRate(mode)))
}

function scenarioDuration(mode: ScenarioMode) {
  if (mode === "conservative") return 3
  if (mode === "balanced") return 3
  return 2
}

function finalMargin(salePrice: number, cost: number) {
  return salePrice > 0 ? ((salePrice - cost) / salePrice) * 100 : 0
}

function unitProfit(product: InventoryContextItem, salePrice: number, mode: ScenarioMode) {
  const bundleCost = mode === "aggressive" ? 0 : BUNDLE_COST_ESTIMATE
  return Math.max(0, Math.round(salePrice - product.purchasePrice - bundleCost))
}

function productQuantity(product: InventoryContextItem) {
  return Math.max(1, Math.floor(product.quantity || 1))
}

function historicalVelocityScore(product: InventoryContextItem, signalProducts?: SignalProduct[]) {
  const productText = normalize(productName(product))
  const matchedSignal = (signalProducts || []).find((signal) => {
    const signalText = normalize(signal.product)
    return productText.includes(signalText) || signalText.includes(productText.split(" ")[0] || "")
  })

  const signalBoost = matchedSignal ? clamp((matchedSignal.sales || 1) * 18, 18, 70) : 0
  const modelBoost = /iphone\s?14|iphone\s?13|iphone\s?15|iphone\s?16/i.test(productText)
    ? 24
    : /ipad|airpods|watch/i.test(productText)
      ? 14
      : 8
  const stockAgePenalty = product.daysInStock > 45 ? -8 : product.daysInStock <= 20 ? 10 : 0

  return clamp(28 + signalBoost + modelBoost + stockAgePenalty)
}

function ticketPsychologyScore(product: InventoryContextItem) {
  const ticket = product.suggestedPrice || product.purchasePrice * 1.2
  if (ticket <= 0) return 30
  if (ticket <= 3200) return 88
  if (ticket <= 5200) return 76
  if (ticket <= 8000) return 58
  return 42
}

function priceElasticityScore(product: InventoryContextItem) {
  const ticket = product.suggestedPrice || product.purchasePrice * 1.2
  const room = product.maxSafeDiscount || Math.max(0, ticket - (product.minimumSafePrice || product.purchasePrice * 1.08))
  const roomPct = ticket > 0 ? (room / ticket) * 100 : 0
  return clamp(35 + roomPct * 6 + (ticket <= 4500 ? 12 : 0))
}

function bundleCompatibilityScore(product: InventoryContextItem) {
  const text = normalize(`${product.name} ${product.category} ${product.productType || ""}`)
  if (/iphone|ipad/.test(text)) return 88
  if (/watch|airpods/.test(text)) return 68
  if (/acessorio|accessory|capa|pelicula/.test(text)) return 42
  return 58
}

function adEaseScore(product: InventoryContextItem) {
  const text = normalize(product.name)
  if (/iphone\s?14|iphone\s?15|iphone\s?16|pro max/.test(text)) return 88
  if (/ipad|macbook|airpods/.test(text)) return 74
  return 60
}

function whatsappEaseScore(product: InventoryContextItem) {
  const ticket = product.suggestedPrice || product.purchasePrice * 1.2
  const text = normalize(product.name)
  if (/iphone\s?14|iphone\s?13/.test(text)) return 92
  if (ticket <= 4200) return 84
  if (/pro max|macbook/.test(text)) return 62
  return 72
}

function agingRiskScore(product: InventoryContextItem) {
  if (product.daysInStock >= 46) return 92
  if (product.daysInStock >= 31) return 78
  if (product.daysInStock >= 16) return 56
  return 32
}

function buildPortfolio(products: InventoryContextItem[], signalProducts?: SignalProduct[]) {
  return products.map((product) => {
    const ticket = product.suggestedPrice || product.purchasePrice * 1.2
    const conservativeProfit = unitProfit(product, scenarioPrice(product, "conservative"), "conservative")
    const velocityScore = historicalVelocityScore(product, signalProducts)
    const absoluteMarginScore = clamp(conservativeProfit / 35)
    const marginQualityScore = clamp(product.marginPct * 2.2)
    const quantityScore = clamp(productQuantity(product) * 18)
    const ticketScore = ticketPsychologyScore(product)
    const elasticityScore = priceElasticityScore(product)
    const bundleScore = bundleCompatibilityScore(product)
    const adScore = adEaseScore(product)
    const whatsappScore = whatsappEaseScore(product)
    const agingScore = agingRiskScore(product)
    const trafficScore = clamp((adScore * 0.55) + (ticketScore * 0.25) + (velocityScore * 0.2))
    const commercialExecutionScore = round(
      velocityScore * 0.2
      + quantityScore * 0.1
      + absoluteMarginScore * 0.15
      + marginQualityScore * 0.06
      + ticketScore * 0.1
      + elasticityScore * 0.09
      + bundleScore * 0.08
      + adScore * 0.08
      + whatsappScore * 0.08
      + agingScore * 0.03
      + trafficScore * 0.03,
      1
    )

    return {
      product,
      name: productName(product),
      quantity: productQuantity(product),
      ticket,
      unitProfit: conservativeProfit,
      marginPct: product.marginPct,
      velocityScore,
      absoluteMarginScore,
      marginQualityScore,
      ticketPsychologyScore: ticketScore,
      priceElasticityScore: elasticityScore,
      bundleCompatibilityScore: bundleScore,
      adEaseScore: adScore,
      whatsappEaseScore: whatsappScore,
      agingRiskScore: agingScore,
      trafficPotentialScore: trafficScore,
      commercialExecutionScore,
    }
  })
}

function portfolioRoles(portfolio: PortfolioSku[]): PortfolioRoles {
  const fallback = portfolio[0]
  const giro = [...portfolio].sort((a, b) => {
    const aScore = a.velocityScore * 0.38 + a.whatsappEaseScore * 0.3 + a.ticketPsychologyScore * 0.2 + a.quantity * 6
    const bScore = b.velocityScore * 0.38 + b.whatsappEaseScore * 0.3 + b.ticketPsychologyScore * 0.2 + b.quantity * 6
    return bScore - aScore
  })[0] || fallback
  const premium = [...portfolio].sort((a, b) => b.unitProfit - a.unitProfit || b.ticket - a.ticket)[0] || fallback
  const liquidity = [...portfolio].sort((a, b) => {
    const aScore = a.velocityScore * 0.28 + a.whatsappEaseScore * 0.25 + a.priceElasticityScore * 0.18 + a.agingRiskScore * 0.16 + a.quantity * 7
    const bScore = b.velocityScore * 0.28 + b.whatsappEaseScore * 0.25 + b.priceElasticityScore * 0.18 + b.agingRiskScore * 0.16 + b.quantity * 7
    return bScore - aScore
  })[0] || fallback
  const anchor = [...portfolio].sort((a, b) => {
    const aScore = a.commercialExecutionScore + a.unitProfit / 80 + a.quantity * 3
    const bScore = b.commercialExecutionScore + b.unitProfit / 80 + b.quantity * 3
    return bScore - aScore
  })[0] || fallback

  return { giro, premium, anchor, liquidity }
}

function uniqueProducts(items: Array<InventoryContextItem | undefined>) {
  const seen = new Set<string>()
  const result: InventoryContextItem[] = []
  for (const item of items) {
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

function scenarioMix(mode: ScenarioMode, portfolio: PortfolioSku[], roles: PortfolioRoles) {
  const byExecution = [...portfolio].sort((a, b) => b.commercialExecutionScore - a.commercialExecutionScore)
  if (mode === "conservative") {
    return uniqueProducts([
      roles.giro.product,
      roles.premium.product,
      roles.anchor.product,
      ...byExecution.map((item) => item.product),
    ])
  }
  if (mode === "balanced") {
    return uniqueProducts([
      roles.anchor.product,
      roles.giro.product,
      roles.premium.product,
      roles.liquidity.product,
      ...byExecution.map((item) => item.product),
    ])
  }
  return uniqueProducts([
    roles.liquidity.product,
    roles.giro.product,
    roles.anchor.product,
    roles.premium.product,
    ...byExecution.map((item) => item.product),
  ])
}

function portfolioMetrics(products: InventoryContextItem[], mode: ScenarioMode) {
  let units = 0
  let revenue = 0
  let cost = 0
  let profit = 0

  for (const product of products) {
    const quantity = productQuantity(product)
    const price = scenarioPrice(product, mode)
    const unit = unitProfit(product, price, mode)
    units += quantity
    revenue += price * quantity
    cost += product.purchasePrice * quantity
    profit += unit * quantity
  }

  return {
    units,
    revenue,
    cost,
    profit,
    averageProfit: units ? Math.max(1, Math.round(profit / units)) : 1,
    marginPct: revenue ? ((revenue - cost) / revenue) * 100 : 0,
  }
}

function scenarioFor(
  mode: ScenarioMode,
  product: InventoryContextItem,
  products: InventoryContextItem[],
  targetProfit: number,
  pressure: "low" | "medium" | "high",
  mixSummary: string
): Scenario {
  const price = scenarioPrice(product, mode)
  const floor = product.minimumSafePrice || product.purchasePrice * 1.08
  const portfolio = portfolioMetrics(products, mode)
  const profit = portfolio.averageProfit
  const requiredUnits = Math.max(1, Math.ceil(targetProfit / Math.max(profit, 1)))
  const feasibleUnits = Math.min(requiredUnits, portfolio.units)
  const possibleProfit = portfolio.profit
  const capacityGap = Math.max(0, requiredUnits - portfolio.units)
  const duration = scenarioDuration(mode)
  const trafficBudgetDaily = scenarioTrafficBudget(mode, pressure)
  const healthyCac = scenarioHealthyCac(mode, profit, pressure)
  const healthyCpl = scenarioHealthyCpl(healthyCac, mode)
  const qualifiedConversations = Math.max(1, Math.ceil(requiredUnits / scenarioCloseRate(mode)))

  if (mode === "conservative") {
    return {
      title: "CENÁRIO 1 — Conservador",
      objective: "Preservar margem máxima e vender com percepção de valor antes de desconto.",
      products,
      mixSummary,
      idealPrice: price,
      floorPrice: floor,
      unitProfit: profit,
      totalProfit: Math.min(targetProfit, possibleProfit),
      finalMarginPct: portfolio.marginPct || finalMargin(price, product.purchasePrice),
      requiredUnits,
      feasibleUnits,
      maxPossibleProfit: possibleProfit,
      capacityGap,
      trafficBudgetDaily,
      trafficDurationDays: duration,
      healthyCac,
      healthyCpl,
      qualifiedConversations,
      channel: "WhatsApp + Stories orgânico",
      campaignType: "Atendimento consultivo e prova de pronta entrega",
      cta: "Me chama para travar essa unidade com garantia e parcelamento.",
      creative: "Produto real em mãos, garantia Nobretech, condição premium e acessórios no combo.",
      audience: "Base atual, leads compatíveis e seguidores que já interagiram.",
      remarketing: "Somente lista quente de WhatsApp e visitantes recentes.",
      expectedTerm: "48h a 72h",
      conversionProbability: "Média, com margem mais forte.",
      operationalEffort: "Baixo: atendimento manual e follow-up seletivo.",
      liquidityImpact: "Entrada de caixa mais lenta, porém com margem protegida.",
      risk: "Demorar demais se o cliente estiver buscando preço.",
      pauseTrigger: "Pausar se não gerar conversas qualificadas em 72h.",
      scaleTrigger: "Escalar se gerar 3 conversas qualificadas ou ROAS acima de 3.",
      justifiedWhen: "Operação estável, sem pressão imediata de caixa e com margem como prioridade.",
    }
  }

  if (mode === "balanced") {
    return {
      title: "CENÁRIO 2 — Balanceado",
      objective: "Aumentar velocidade mantendo margem saudável.",
      products,
      mixSummary,
      idealPrice: price,
      floorPrice: floor,
      unitProfit: profit,
      totalProfit: Math.min(targetProfit, possibleProfit),
      finalMarginPct: portfolio.marginPct || finalMargin(price, product.purchasePrice),
      requiredUnits,
      feasibleUnits,
      maxPossibleProfit: possibleProfit,
      capacityGap,
      trafficBudgetDaily,
      trafficDurationDays: duration,
      healthyCac,
      healthyCpl,
      qualifiedConversations,
      channel: "Meta Ads — Mensagens WhatsApp + remarketing",
      campaignType: "Oferta 72h com urgência e bundle leve",
      cta: "Quero ver essa condição no WhatsApp.",
      creative: "Stories/Reels curto com preço, garantia, parcelamento até 18x e última unidade.",
      audience: "Público local de São Luís, engajados do Instagram e lookalike de compradores.",
      remarketing: "Reimpactar visitantes e engajados por 3 dias.",
      expectedTerm: "24h a 72h",
      conversionProbability: "Alta, com margem ainda saudável.",
      operationalEffort: "Médio: campanha, atendimento rápido e follow-up no mesmo dia.",
      liquidityImpact: "Boa entrada de caixa sem queimar toda a margem.",
      risk: "Desconto leve virar âncora se a equipe abrir negociação cedo demais.",
      pauseTrigger: "Pausar se CPL passar de R$25 ou se não houver conversa qualificada em 72h.",
      scaleTrigger: "Escalar 20% ao dia se CTR passar de 1,5% e ROAS ficar acima de 3.",
      justifiedWhen: "Meta comercial ativa, estoque com idade moderada ou necessidade de acelerar giro.",
    }
  }

  return {
    title: "CENÁRIO 3 — Agressivo",
    objective: "Gerar liquidez rápida e liberar capital parado.",
    products,
    mixSummary,
    idealPrice: price,
    floorPrice: floor,
    unitProfit: profit,
    totalProfit: Math.min(targetProfit, possibleProfit),
    finalMarginPct: portfolio.marginPct || finalMargin(price, product.purchasePrice),
    requiredUnits,
    feasibleUnits,
    maxPossibleProfit: possibleProfit,
    capacityGap,
    trafficBudgetDaily,
    trafficDurationDays: duration,
    healthyCac,
    healthyCpl,
    qualifiedConversations,
    channel: "Meta Ads — Mensagens WhatsApp + lista VIP",
    campaignType: "Liquidez 48h com escassez real",
    cta: "Responda EU QUERO para travar a unidade agora.",
    creative: "Oferta direta com prova de estoque, prazo curto, garantia e preço de fechamento.",
    audience: "Remarketing, leads compatíveis, engajados recentes e compradores anteriores.",
    remarketing: "Forte em 48h, sem ampliar para público frio se o CPL subir.",
    expectedTerm: "Hoje a 48h",
    conversionProbability: "Muito alta se houver pressão real e atendimento imediato.",
    operationalEffort: "Alto: resposta rápida, negociação no WhatsApp e limite claro de preço.",
    liquidityImpact: "Entrada rápida de caixa com maior erosão de margem.",
    risk: "Educar o cliente a esperar desconto e reduzir lucro unitário.",
    pauseTrigger: "Pausar se CPL passar de R$35 ou se gerar conversa sem intenção de compra.",
    scaleTrigger: "Escalar se fechar 1 venda ou ROAS passar de 2,5 em 24h.",
    justifiedWhen: "Use somente com janela de pressão financeira, caixa crítico, excesso de estoque ou contas próximas do vencimento.",
  }
}

function formatScenario(scenario: Scenario) {
  const main = scenario.products[0]
  const productList = aggregateProducts(scenario.products).map((product, index) => `${index + 1}. ${product.quantity}x ${product.name}`).join("; ")
  const capacityLine = scenario.capacityGap > 0
    ? `Capacidade: meta pede ${scenario.requiredUnits} vendas, mas o estoque permite ${scenario.feasibleUnits}. Gap: ${scenario.capacityGap} venda${scenario.capacityGap === 1 ? "" : "s"}.`
    : `Capacidade: meta cabe no estoque atual (${scenario.feasibleUnits} de ${scenario.requiredUnits} venda${scenario.requiredUnits === 1 ? "" : "s"} necessárias).`
  return [
    scenario.title,
    `Objetivo: ${scenario.objective}`,
    `Mix operacional: ${scenario.mixSummary}`,
    `Produtos: ${productList || "sem produto ativo liberado"}.`,
    main ? `Produto principal: ${productName(main)}.` : null,
    `Preço ideal: ${brl(scenario.idealPrice)}. Piso seguro: ${brl(scenario.floorPrice)}.`,
    `Lucro unitário: ${brl(scenario.unitProfit)}. Margem final: ${pct(scenario.finalMarginPct)}.`,
    `Quantidade necessária: ${scenario.requiredUnits} venda${scenario.requiredUnits === 1 ? "" : "s"}. ${capacityLine}`,
    `Lucro total esperado: ${brl(scenario.totalProfit)}. Teto de lucro com estoque atual: ${brl(scenario.maxPossibleProfit)}.`,
    `Tráfego: ${scenario.channel}, ${brl(scenario.trafficBudgetDaily)}/dia por ${scenario.trafficDurationDays} dia${scenario.trafficDurationDays === 1 ? "" : "s"}. Meta: ${scenario.qualifiedConversations} conversas qualificadas. CPL máximo saudável: ${brl(scenario.healthyCpl)}. CAC máximo saudável: ${brl(scenario.healthyCac)} por venda.`,
    `Campanha: ${scenario.campaignType}. Criativo: ${scenario.creative}`,
    `Público: ${scenario.audience}. Remarketing: ${scenario.remarketing}`,
    `CTA: ${scenario.cta}`,
    `Prazo esperado: ${scenario.expectedTerm}. Conversão: ${scenario.conversionProbability}. Esforço: ${scenario.operationalEffort}.`,
    `Impacto na liquidez: ${scenario.liquidityImpact}`,
    `Risco: ${scenario.risk}`,
    `Gatilho de pausa: ${scenario.pauseTrigger}`,
    `Gatilho de escala: ${scenario.scaleTrigger}`,
    `Quando usar: ${scenario.justifiedWhen}`,
  ].filter(Boolean).join("\n")
}

function scenarioScore(scenario: Scenario, pressure: "low" | "medium" | "high") {
  const speedWeight = scenario.title.includes("Agressivo") ? 3 : scenario.title.includes("Balanceado") ? 2 : 1
  const marginWeight = scenario.finalMarginPct
  const pressureBonus = pressure === "high" && scenario.title.includes("Agressivo")
    ? 20
    : pressure === "medium" && scenario.title.includes("Balanceado")
      ? 18
      : pressure === "low" && scenario.title.includes("Conservador")
        ? 14
        : 0

  return marginWeight + speedWeight * 8 + pressureBonus - scenario.trafficBudgetDaily * 0.08
}

function aggregateProducts(products: InventoryContextItem[]) {
  const map = new Map<string, {
    name: string
    quantity: number
    ticket: number
    cost: number
    marginPct: number
    daysInStock: number
    status: string
    product: InventoryContextItem
  }>()

  for (const product of products) {
    const name = productName(product)
    const quantity = productQuantity(product)
    const ticket = product.suggestedPrice || product.purchasePrice * 1.2
    const current = map.get(name)
    if (!current) {
      map.set(name, {
        name,
        quantity,
        ticket,
        cost: product.purchasePrice,
        marginPct: product.marginPct,
        daysInStock: product.daysInStock,
        status: product.status,
        product,
      })
      continue
    }
    const nextQuantity = current.quantity + quantity
    current.ticket = Math.round(((current.ticket * current.quantity) + (ticket * quantity)) / nextQuantity)
    current.cost = Math.round(((current.cost * current.quantity) + (product.purchasePrice * quantity)) / nextQuantity)
    current.marginPct = round(((current.marginPct * current.quantity) + (product.marginPct * quantity)) / nextQuantity, 1)
    current.daysInStock = Math.max(current.daysInStock, product.daysInStock)
    current.quantity = nextQuantity
  }

  return Array.from(map.values())
}

function skuLine(sku: PortfolioSku) {
  return `${sku.name} (${sku.quantity}x, ticket ${brl(sku.ticket)}, lucro unitário ${brl(sku.unitProfit)})`
}

function mixSummary(mode: ScenarioMode, roles: PortfolioRoles) {
  if (mode === "conservative") {
    return `giro com ${skuLine(roles.giro)}, proteção de margem do premium ${skuLine(roles.premium)} e bundle como complemento.`
  }
  if (mode === "balanced") {
    return `âncora em ${skuLine(roles.anchor)}, volume com ${skuLine(roles.giro)} e ancoragem premium com ${skuLine(roles.premium)}.`
  }
  return `liquidez com ${skuLine(roles.liquidity)}, fechamento rápido com ${skuLine(roles.giro)} e uso do premium ${skuLine(roles.premium)} apenas para ticket alto.`
}

function signalLine(signalProducts?: SignalProduct[]) {
  const signals = (signalProducts || []).slice(0, 3)
  if (!signals.length) return "Sem sinal histórico forte suficiente; a ação nasce do estoque ativo e da margem atual."
  return signals
    .map((item) => `${item.product}${item.sales ? ` (${item.sales} venda${item.sales === 1 ? "" : "s"})` : ""}`)
    .join("; ")
}

function productsLine(products: InventoryContextItem[]) {
  if (!products.length) return "Nenhum produto ativo seguro encontrado para campanha."
  return aggregateProducts(products).map((product, index) => {
    const price = product.ticket
    const profit = Math.max(0, Math.round(price - product.cost - BUNDLE_COST_ESTIMATE))
    return `${index + 1}. ${product.quantity}x ${product.name}: ticket ${brl(price)}, lucro unitário projetado ${brl(profit)}, margem ${pct(product.marginPct)}, ${product.daysInStock} dias em estoque, status operacional disponível.`
  }).join("\n")
}

function executableBundleLines(products: InventoryContextItem[]) {
  const sellable = aggregateProducts(products)
  if (!sellable.length) return "Nenhum bundle liberado sem estoque operacional ativo."

  const variants = [
    {
      label: "kit proteção premium",
      addOns: "película premium + capa anti-impacto",
      incrementalCost: BUNDLE_COST_ESTIMATE,
      priceLift: 140,
      perception: "proteção imediata sem reduzir preço do aparelho",
      customerType: "cliente que quer sair com o aparelho pronto para uso",
      speed: "alta",
    },
    {
      label: "kit fechamento WhatsApp",
      addOns: "película premium + condição de entrega rápida",
      incrementalCost: Math.round(BUNDLE_COST_ESTIMATE * 0.7),
      priceLift: 90,
      perception: "menor fricção para fechar no mesmo atendimento",
      customerType: "lead quente comparando preço e prazo",
      speed: "muito alta",
    },
    {
      label: "kit premium de valor",
      addOns: "capa magnética + película premium + prioridade de configuração",
      incrementalCost: Math.round(BUNDLE_COST_ESTIMATE * 1.35),
      priceLift: 210,
      perception: "oferta mais completa sem corroer margem do aparelho",
      customerType: "cliente premium buscando segurança e conveniência",
      speed: "média",
    },
  ]

  return variants.map((variant, index) => {
    const product = sellable[index % sellable.length]
    const finalPrice = Math.max(product.ticket, Math.round(product.ticket + variant.priceLift))
    const cost = Math.round(product.cost + variant.incrementalCost)
    const profit = Math.max(0, finalPrice - cost)
    const margin = finalPrice > 0 ? ((profit / finalPrice) * 100) : 0
    const targetSales = Math.min(product.quantity, 3)
    const projectedProfit = profit * targetSales

    return [
      `BUNDLE ${index + 1} — ${product.name} + ${variant.label}`,
      `Produtos: 1x ${product.name} + ${variant.addOns}.`,
      `Preço final: ${brl(finalPrice)}. Custo projetado: ${brl(cost)}.`,
      `Lucro unitário: ${brl(profit)}. Margem: ${pct(margin)}.`,
      `Meta: ${targetSales} venda${targetSales === 1 ? "" : "s"}. Lucro projetado: ${brl(projectedProfit)}.`,
      `Percepção de valor: ${variant.perception}.`,
      `Tipo de cliente: ${variant.customerType}. Velocidade esperada: ${variant.speed}.`,
    ].join("\n")
  }).join("\n\n")
}

function availableInventoryLine(products: InventoryContextItem[]) {
  const totalUnits = products.reduce((sum, product) => sum + productQuantity(product), 0)
  const items = aggregateProducts(products)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((product) => {
      return `- ${product.quantity}x ${product.name}: ticket ${brl(product.ticket)}, margem ${pct(product.marginPct)}, ${product.daysInStock} dias em estoque, status disponível.`
    })
    .join("\n")
  return `${totalUnits} unidade${totalUnits === 1 ? "" : "s"} operacionalmente disponível${totalUnits === 1 ? "" : "s"}:\n${items}`
}

function roleLines(roles: PortfolioRoles) {
  return [
    `Produto de giro: ${skuLine(roles.giro)}. Papel: menor fricção, WhatsApp mais fácil e velocidade de fechamento.`,
    `Produto premium: ${skuLine(roles.premium)}. Papel: maior lucro absoluto e ancoragem de valor.`,
    `Produto âncora: ${skuLine(roles.anchor)}. Papel: melhor equilíbrio entre lucro, velocidade, disponibilidade e risco.`,
    `Produto de liquidez: ${skuLine(roles.liquidity)}. Papel: maior chance de virar caixa rápido.`,
  ].join("\n")
}

function sellableUnitsLabel(units: number) {
  return `${units} unidade${units === 1 ? "" : "s"} vendável${units === 1 ? "" : "eis"}`
}

export function buildScenarioExecutionPlan(params: BuildScenarioParams) {
  const products = params.products.filter((product) => product.status === "active" || product.status === "in_stock")
  const portfolio = buildPortfolio(products, params.signalProducts)
  const roles = portfolio.length ? portfolioRoles(portfolio) : null
  const primary = roles?.anchor.product || products[0]

  if (!primary) {
    return [
      "1. Diagnóstico Executivo",
      "Não existe produto operacional ativo suficiente para simular campanha com segurança. Histórico pode sinalizar demanda, mas não é estoque vendável.",
      "",
      "2. Mix Ideal de Execução",
      "Sem mix liberado enquanto não houver estoque operacional ativo.",
      "",
      "3. Produtos Priorizados",
      "Nenhum produto ativo seguro encontrado.",
      "",
      "4. Papel de Cada SKU",
      "Sem SKU vendável para classificar.",
      "",
      "5. Estratégia de Tráfego",
      "Não investir em tráfego sem produto ativo.",
      "",
      "6. Estratégia WhatsApp",
      "Responder interessados apenas com produtos disponíveis.",
      "",
      "7. Estratégia de Bundle",
      "Sem oferta liberada até validar custo, preço e disponibilidade operacional.",
      "",
      "8. Meta Esperada",
      "Meta pausada até existir produto vendável.",
      "",
      "9. Risco Operacional",
      "Prometer item indisponível quebra confiança e gera follow-up incompatível.",
      "",
      "10. Melhor Cenário Recomendado",
      "Regularizar estoque ativo antes de vender.",
      "",
      "11. Cenário Alternativo",
      "Sem alternativa comercial segura com estoque indisponível.",
      "",
      "12. Condição de Pausa/Escala",
      "1. Auditar estoque ativo.\n2. Validar custo e preço sugerido.\n3. Voltar para campanha somente com produto disponível.",
    ].join("\n")
  }

  const activeRoles = roles
  if (!activeRoles) return "Estoque insuficiente para montar inteligência de portfólio."

  const pressure = pressureLevel(params.snapshot, params.health)
  const targetProfit = Math.max(
    1,
    params.targetProfit || Math.max(1, Math.round(unitProfit(primary, scenarioPrice(primary, "balanced"), "balanced")))
  )
  const conservativeMix = scenarioMix("conservative", portfolio, activeRoles)
  const balancedMix = scenarioMix("balanced", portfolio, activeRoles)
  const aggressiveMix = scenarioMix("aggressive", portfolio, activeRoles)
  const scenarios = [
    scenarioFor("conservative", activeRoles.giro.product, conservativeMix, targetProfit, pressure, mixSummary("conservative", activeRoles)),
    scenarioFor("balanced", activeRoles.anchor.product, balancedMix, targetProfit, pressure, mixSummary("balanced", activeRoles)),
    scenarioFor("aggressive", activeRoles.liquidity.product, aggressiveMix, targetProfit, pressure, mixSummary("aggressive", activeRoles)),
  ]
  const recommended = [...scenarios].sort((a, b) => scenarioScore(b, pressure) - scenarioScore(a, pressure))[0]
  const recommendedName = recommended.title.replace("CENÁRIO ", "Cenário ").replace(" — ", " - ")
  const totalExpectedProfit = recommended.totalProfit
  const inventoryUnits = products.reduce((sum, product) => sum + productQuantity(product), 0)
  const bestPossibleProfit = Math.max(...scenarios.map((scenario) => scenario.maxPossibleProfit))
  const alternatives = scenarios.filter((scenario) => scenario.title !== recommended.title)
  const capacityAlert = recommended.capacityGap > 0
    ? `Meta acima da capacidade atual: seriam necessárias ${recommended.requiredUnits} vendas, mas existem ${sellableUnitsLabel(inventoryUnits)}. É obrigatório aumentar ticket, adicionar cross-sell, recomprar ou buscar lucro complementar.`
    : `Meta compatível com a capacidade atual: ${sellableUnitsLabel(inventoryUnits)}.`

  return [
    "1. Diagnóstico Executivo",
    `${params.context || "Execução comercial estratégica"} A ORION primeiro mapeou todo o estoque operacional, depois priorizou. Sinal histórico: ${signalLine(params.signalProducts)}. ${capacityAlert}\n\nEstoque operacional disponível:\n${availableInventoryLine(products)}`,
    "",
    "2. Mix Ideal de Execução",
    `${mixSummary("balanced", activeRoles)} A meta não deve depender de um único SKU; o plano combina produto de giro, produto premium, âncora e liquidez.`,
    "",
    "3. Produtos Priorizados",
    productsLine(balancedMix),
    "",
    "4. Papel de Cada SKU",
    roleLines(activeRoles),
    "",
    "5. Execução de Tráfego",
    `${recommended.channel}. Orçamento: ${brl(recommended.trafficBudgetDaily)}/dia por ${recommended.trafficDurationDays} dia${recommended.trafficDurationDays === 1 ? "" : "s"}. Meta: ${recommended.qualifiedConversations} conversas qualificadas. CPL máximo saudável: ${brl(recommended.healthyCpl)}. CAC máximo saudável: ${brl(recommended.healthyCac)} por venda. Objetivo: mensagens no WhatsApp. Público: ${recommended.audience}. Criativo: ${recommended.creative}`,
    "",
    "6. Estratégia WhatsApp",
    [
      "1. Prioridade premium: abordar leads compatíveis com o produto premium para ancorar valor e lucro absoluto.",
      "2. Apresentar bundle: mostrar o kit completo com preço final, garantia, parcelamento e benefício claro.",
      "3. Gatilhos de fechamento: urgência real, pronta entrega, prova de estoque e garantia Nobretech.",
      "4. Follow-up: retornar em até 3 horas se houver abertura e parar se o lead estiver perdido, encerrado ou incompatível.",
      "Script rápido: Item premium -> Bundle completo -> Benefício -> Fechamento.",
    ].join("\n"),
    "",
    "7. Bundles Executáveis",
    executableBundleLines(balancedMix),
    "",
    "8. Meta Esperada",
    `Meta: ${recommended.requiredUnits} venda${recommended.requiredUnits === 1 ? "" : "s"} com lucro unitário médio de ${brl(recommended.unitProfit)}, buscando ${brl(totalExpectedProfit)} de lucro. Com o estoque operacional atual, o lucro máximo projetado é ${brl(bestPossibleProfit)}. ${recommended.capacityGap > 0 ? "A meta não fecha só com o estoque atual." : "A meta fecha dentro do estoque atual."}`,
    "",
    "9. Risco Operacional",
    `${recommended.risk} Cenário agressivo só é autorizado quando houver pressão financeira, caixa crítico, excesso de estoque ou contas próximas.`,
    "",
    "10. Melhor Cenário Recomendado",
    `${recommendedName}. Justificativa: melhor equilíbrio entre margem, velocidade, esforço comercial, capacidade real de estoque e pressão de liquidez atual.\n${formatScenario(recommended)}`,
    "",
    "11. Cenário Alternativo",
    alternatives.map(formatScenario).join("\n\n"),
    "",
    "12. Condição de Pausa/Escala",
    [
      `1. Hoje: publicar o mix com âncora em ${productName(activeRoles.anchor.product)}, giro em ${productName(activeRoles.giro.product)} e premium em ${productName(activeRoles.premium.product)}.`,
      `2. Próximas 24h: acionar leads compatíveis e rodar ${recommended.channel} com orçamento de ${brl(recommended.trafficBudgetDaily)}/dia.`,
      `3. Pausar: ${recommended.pauseTrigger}`,
      `4. Escalar: ${recommended.scaleTrigger}`,
    ].join("\n"),
  ].join("\n")
}
