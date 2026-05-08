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
  idealPrice: number
  floorPrice: number
  unitProfit: number
  totalProfit: number
  finalMarginPct: number
  requiredUnits: number
  trafficBudgetDaily: number
  trafficDurationDays: number
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

function scenarioFor(
  mode: ScenarioMode,
  product: InventoryContextItem,
  products: InventoryContextItem[],
  targetProfit: number,
  pressure: "low" | "medium" | "high"
): Scenario {
  const price = scenarioPrice(product, mode)
  const floor = product.minimumSafePrice || product.purchasePrice * 1.08
  const profit = unitProfit(product, price, mode)
  const requiredUnits = Math.max(1, Math.ceil(targetProfit / Math.max(profit, 1)))
  const duration = scenarioDuration(mode)
  const trafficBudgetDaily = scenarioTrafficBudget(mode, pressure)

  if (mode === "conservative") {
    return {
      title: "CENÁRIO 1 — Conservador",
      objective: "Preservar margem máxima e vender com percepção de valor antes de desconto.",
      products: products.slice(0, 2),
      idealPrice: price,
      floorPrice: floor,
      unitProfit: profit,
      totalProfit: profit * requiredUnits,
      finalMarginPct: finalMargin(price, product.purchasePrice),
      requiredUnits,
      trafficBudgetDaily,
      trafficDurationDays: duration,
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
      products: products.slice(0, 3),
      idealPrice: price,
      floorPrice: floor,
      unitProfit: profit,
      totalProfit: profit * requiredUnits,
      finalMarginPct: finalMargin(price, product.purchasePrice),
      requiredUnits,
      trafficBudgetDaily,
      trafficDurationDays: duration,
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
    products: products.slice(0, 3),
    idealPrice: price,
    floorPrice: floor,
    unitProfit: profit,
    totalProfit: profit * requiredUnits,
    finalMarginPct: finalMargin(price, product.purchasePrice),
    requiredUnits,
    trafficBudgetDaily,
    trafficDurationDays: duration,
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
  const productList = scenario.products.map((product, index) => `${index + 1}. ${productName(product)}`).join("; ")
  return [
    scenario.title,
    `Objetivo: ${scenario.objective}`,
    `Produtos: ${productList || "sem produto ativo liberado"}.`,
    main ? `Produto principal: ${productName(main)}.` : null,
    `Preço ideal: ${brl(scenario.idealPrice)}. Piso seguro: ${brl(scenario.floorPrice)}.`,
    `Lucro unitário: ${brl(scenario.unitProfit)}. Margem final: ${pct(scenario.finalMarginPct)}.`,
    `Quantidade necessária: ${scenario.requiredUnits} venda${scenario.requiredUnits === 1 ? "" : "s"}. Lucro total esperado: ${brl(scenario.totalProfit)}.`,
    `Tráfego: ${scenario.channel}, ${brl(scenario.trafficBudgetDaily)}/dia por ${scenario.trafficDurationDays} dia${scenario.trafficDurationDays === 1 ? "" : "s"}.`,
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

function signalLine(signalProducts?: SignalProduct[]) {
  const signals = (signalProducts || []).slice(0, 3)
  if (!signals.length) return "Sem sinal histórico forte suficiente; a ação nasce do estoque ativo e da margem atual."
  return signals
    .map((item) => `${item.product}${item.sales ? ` (${item.sales} venda${item.sales === 1 ? "" : "s"})` : ""}`)
    .join("; ")
}

function productsLine(products: InventoryContextItem[]) {
  if (!products.length) return "Nenhum produto ativo seguro encontrado para campanha."
  return products.slice(0, 3).map((product, index) => {
    const price = product.suggestedPrice || product.purchasePrice * 1.2
    const profit = Math.max(0, Math.round(price - product.purchasePrice - BUNDLE_COST_ESTIMATE))
    return `${index + 1}. ${productName(product)}: preço ideal ${brl(price)}, piso ${brl(product.minimumSafePrice || product.purchasePrice * 1.08)}, lucro esperado ${brl(profit)}, ${product.daysInStock} dias em estoque.`
  }).join("\n")
}

export function buildScenarioExecutionPlan(params: BuildScenarioParams) {
  const products = params.products.filter((product) => product.status === "active" || product.status === "in_stock")
  const primary = products[0]

  if (!primary) {
    return [
      "1. Diagnóstico Executivo",
      "Não existe produto operacional ativo suficiente para simular campanha com segurança. Histórico pode sinalizar demanda, mas não é estoque vendável.",
      "",
      "2. Cenário Conservador",
      "Travado: sem produto ativo, não há oferta segura.",
      "",
      "3. Cenário Balanceado",
      "Travado: sem produto ativo, não há campanha de remarketing segura.",
      "",
      "4. Cenário Agressivo",
      "Proibido: não use produto vendido, reservado, em reparo, arquivado ou inativo para gerar liquidez.",
      "",
      "5. Melhor Cenário Recomendado",
      "Regularizar estoque ativo antes de vender.",
      "",
      "6. Produtos Prioritários",
      `Sinais históricos: ${signalLine(params.signalProducts)}`,
      "",
      "7. Estratégia de Oferta",
      "Sem oferta liberada até validar custo, preço e disponibilidade operacional.",
      "",
      "8. Estratégia de Tráfego",
      "Não investir em tráfego sem produto ativo.",
      "",
      "9. Estratégia de Conversão",
      "Responder interessados apenas com produtos disponíveis.",
      "",
      "10. Risco Operacional",
      "Prometer item indisponível quebra confiança e gera follow-up incompatível.",
      "",
      "11. Meta Esperada",
      "Meta pausada até existir produto vendável.",
      "",
      "12. Plano de Execução 72h",
      "1. Auditar estoque ativo.\n2. Validar custo e preço sugerido.\n3. Voltar para campanha somente com produto disponível.",
    ].join("\n")
  }

  const pressure = pressureLevel(params.snapshot, params.health)
  const targetProfit = Math.max(
    1,
    params.targetProfit || Math.max(1, Math.round(unitProfit(primary, scenarioPrice(primary, "balanced"), "balanced")))
  )
  const scenarios = [
    scenarioFor("conservative", primary, products, targetProfit, pressure),
    scenarioFor("balanced", primary, products, targetProfit, pressure),
    scenarioFor("aggressive", primary, products, targetProfit, pressure),
  ]
  const recommended = [...scenarios].sort((a, b) => scenarioScore(b, pressure) - scenarioScore(a, pressure))[0]
  const recommendedName = recommended.title.replace("CENÁRIO ", "Cenário ").replace(" — ", " - ")
  const totalExpectedProfit = recommended.totalProfit

  return [
    "1. Diagnóstico Executivo",
    `${params.context || "Execução comercial estratégica"} A ORION separou sinal histórico de produto acionável: ${signalLine(params.signalProducts)}. A ação abaixo usa apenas estoque ativo.`,
    "",
    "2. Cenário Conservador",
    formatScenario(scenarios[0]),
    "",
    "3. Cenário Balanceado",
    formatScenario(scenarios[1]),
    "",
    "4. Cenário Agressivo",
    formatScenario(scenarios[2]),
    "",
    "5. Melhor Cenário Recomendado",
    `${recommendedName}. Justificativa: melhor equilíbrio entre margem, velocidade, esforço comercial e pressão de liquidez atual.`,
    "",
    "6. Produtos Prioritários",
    productsLine(products),
    "",
    "7. Estratégia de Oferta",
    `${productName(primary)} como produto âncora. Comece pelo preço ideal, adicione bundle de alta percepção e só use desconto dentro do piso seguro. Bundle recomendado: película premium + capa anti-impacto ou acessório de alta margem.`,
    "",
    "8. Estratégia de Tráfego",
    `${recommended.channel}. Orçamento: ${brl(recommended.trafficBudgetDaily)}/dia por ${recommended.trafficDurationDays} dia${recommended.trafficDurationDays === 1 ? "" : "s"}. Objetivo: mensagens no WhatsApp. Público: ${recommended.audience}. Pausa: ${recommended.pauseTrigger}. Escala: ${recommended.scaleTrigger}`,
    "",
    "9. Estratégia de Conversão",
    `Atendimento no mesmo dia, CTA direto e negociação por valor antes de preço. Use PIX apenas para travar fechamento; parcelamento segue saudável no modelo Nobretech. Não acione lead perdido, incompatível ou encerrado.`,
    "",
    "10. Risco Operacional",
    `${recommended.risk} Cenário agressivo só é autorizado quando houver pressão financeira, caixa crítico, excesso de estoque ou contas próximas.`,
    "",
    "11. Meta Esperada",
    `Meta: ${recommended.requiredUnits} venda${recommended.requiredUnits === 1 ? "" : "s"} com lucro unitário médio de ${brl(recommended.unitProfit)}, buscando ${brl(totalExpectedProfit)} de lucro e impacto de liquidez ${recommended.liquidityImpact.toLowerCase()}.`,
    "",
    "12. Plano de Execução 72h",
    [
      `1. Hoje: publicar a oferta do ${productName(primary)} com preço ${brl(recommended.idealPrice)}, garantia, pronta entrega e CTA de WhatsApp.`,
      `2. Próximas 24h: acionar leads compatíveis e rodar ${recommended.channel} com orçamento de ${brl(recommended.trafficBudgetDaily)}/dia.`,
      `3. Até 72h: pausar ou escalar pela regra definida; fechar sem ultrapassar o piso de ${brl(recommended.floorPrice)}.`,
    ].join("\n"),
  ].join("\n")
}
