import {
  isLowAbsoluteProfit,
  isTrafficRiskyWithoutAnchor,
} from "./nobretech-decision-principles"
import type { OrionDecisionMemoryContext, OrionDecisionMemoryItem, OrionDecisionType } from "./orion-decision-memory-store"
import { runOrionTools, type OrionMetricPeriod, type OrionToolName, type OrionToolResult } from "./orion-tool-registry"
import type { ReinvestmentDecision } from "./reinvestment-intelligence-engine"
import type { OrionSemanticPlan } from "./semantic-planner"
import type { OrionAppliedOperationalMemoryContext } from "./operational-memory"
import type { OrionSnapshot } from "./types"

export type OrionBusinessDecisionType =
  | "capital_allocation"
  | "business_strategy"
  | "sales_performance"
  | "cash_health"
  | "inventory_priority"
  | "marketing_strategy"
  | "generic_business_review"

export type OrionBusinessDecision = {
  decisionType: OrionBusinessDecisionType
  timeframeLabel: string
  keyFindings: Array<{
    label: string
    value?: string
    severity?: "info" | "attention" | "critical"
    evidence: string
  }>
  recommendation: {
    title: string
    action: string
    reason: string
    confidence: "low" | "medium" | "high"
  }
  alternatives: Array<{
    title: string
    tradeoff: string
  }>
  avoid: Array<{
    title: string
    reason: string
  }>
  nextSteps: Array<{
    priority: "high" | "medium" | "low"
    action: string
  }>
  usedTools: OrionToolName[]
  caveats: string[]
}

export type BuildOrionBusinessDecisionInput = {
  semanticPlan: OrionSemanticPlan
  snapshot: OrionSnapshot
  userQuestion: string
  memoryContext?: OrionAppliedOperationalMemoryContext | null
  decisionMemoryContext?: OrionDecisionMemoryContext | null
}

type CashPositionData = {
  cash: number
  availableLiquidity: number
  protectedWorkingCapital: number
}

type SalesPerformanceData = {
  revenue: number
  profit: number
  salesCount: number
  marginPct: number | null
  timeframeLabel: string
  period: OrionMetricPeriod
  commercialProfit: number | null
  financialProfit: number | null
  profitBasis: "financial_traceability" | "commercial_sale_date" | "unavailable"
}

function periodLabelLowercase(period: { label: string }) {
  const label = period.label.trim()
  if (!label) return "período atual"
  const first = label.charAt(0)
  return first === first.toLowerCase() ? label : `${first.toLowerCase()}${label.slice(1)}`
}

function salesFindings(sales: SalesPerformanceData | null): OrionBusinessDecision["keyFindings"] {
  if (!sales) {
    return [{
      label: "Vendas comerciais",
      value: "sem dado",
      severity: "attention",
      evidence: "Performance de vendas não está completa no snapshot.",
    }]
  }
  const periodLabel = periodLabelLowercase(sales.period)
  const findings: OrionBusinessDecision["keyFindings"] = [{
    label: "Vendas comerciais",
    value: plural(sales.salesCount, "venda", "vendas"),
    severity: sales.salesCount > 0 ? "info" : "attention",
    evidence: `Receita de ${brl(sales.revenue)} no ${periodLabel}.`,
  }]
  const showSeparateProfit = sales.profitBasis === "financial_traceability"
    && sales.commercialProfit !== null
    && sales.financialProfit !== null
  const profitOnly = sales.profitBasis === "financial_traceability" && sales.financialProfit !== null
  if (showSeparateProfit || profitOnly) {
    findings.push({
      label: "Lucro rastreável",
      value: brl(sales.financialProfit ?? sales.profit),
      severity: "info",
      evidence: `Lucro apurado pelo fluxo financeiro do ${periodLabel}.`,
    })
  } else if (sales.profitBasis === "commercial_sale_date" && sales.commercialProfit !== null) {
    findings.push({
      label: "Lucro comercial",
      value: brl(sales.commercialProfit),
      severity: "info",
      evidence: `Lucro estimado a partir das vendas do ${periodLabel}.`,
    })
  }
  return findings
}

type MarginProduct = {
  label: string
  category: string
  salesCount: number
  sampleSize: number
  revenue: number
  profit: number
  averageProfit: number
  marginPct: number
  averageDaysInStock: number | null
  probableUnitCost: number | null
  currentStockCount: number
  campaignDemandLeads: number
  campaignLostLeads: number
  confidence: "low" | "medium" | "high"
  lowAbsoluteProfit: boolean
}

type MarginByProductData = {
  products: MarginProduct[]
  period: OrionMetricPeriod
}

type AvailableStockData = {
  items: Array<{
    label: string
    category: string
    estimatedGrossProfit: number
    purchasePrice: number
    suggestedPrice: number
    daysInStock: number
    quantity: number
  }>
}

type StuckItemsData = {
  items: Array<{
    label: string
    category: string
    daysInStock: number
    investedCapital: number
    risk: "low" | "medium" | "high"
  }>
}

type CampaignPerformanceData = {
  campaigns: Array<{
    name: string
    spend: number
    revenue: number
    leads: number
    sales: number
    lostLeads: number
    conversionRate: number | null
  }>
}

type FunnelHealthData = {
  activeOpportunities: number
  lostLeads: number
  leadsOpen: number
  leadsWithoutFollowUp: number
  shouldFollowUpLostLeads: boolean
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value)
}

function numberPt(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value)
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "sem dado"
  return `${numberPt(value)}%`
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${numberPt(count, 0)} ${count === 1 ? singular : pluralLabel}`
}

function sentenceCase(value: string) {
  let shouldCapitalize = true
  let lastWasSentencePunctuation = false
  return Array.from(value).map((char) => {
    const isLetter = char.toLocaleLowerCase("pt-BR") !== char.toLocaleUpperCase("pt-BR")
    const isDigit = char >= "0" && char <= "9"
    if (isDigit) {
      if (shouldCapitalize && !lastWasSentencePunctuation) shouldCapitalize = false
      return char
    }
    if (isLetter && shouldCapitalize) {
      shouldCapitalize = false
      lastWasSentencePunctuation = false
      return char.toLocaleUpperCase("pt-BR")
    }
    if (isLetter) {
      shouldCapitalize = false
      lastWasSentencePunctuation = false
    }
    if (char === "." || char === "!" || char === "?") {
      lastWasSentencePunctuation = true
    } else if (lastWasSentencePunctuation && char === " ") {
      shouldCapitalize = true
    } else if (char !== " ") {
      lastWasSentencePunctuation = false
    }
    return char
  }).join("")
}

function resultFor(results: OrionToolResult[], tool: OrionToolName) {
  return results.find((result) => result.tool === tool) || null
}

function dataFor<TData>(results: OrionToolResult[], tool: OrionToolName): TData | null {
  return (resultFor(results, tool)?.data as TData | undefined) ?? null
}

function resultCaveats(results: OrionToolResult[]) {
  return Array.from(new Set(results.flatMap((result) => result.caveats).filter(Boolean)))
}

function confidenceFromTools(results: OrionToolResult[]): "low" | "medium" | "high" {
  if (results.some((result) => result.status === "unavailable")) return "low"
  if (results.some((result) => result.status === "partial")) return "medium"
  return "high"
}

function decisionTypeFor(plan: OrionSemanticPlan): OrionBusinessDecisionType {
  if (plan.primaryGoal === "capital_allocation") return "capital_allocation"
  if (plan.primaryGoal === "business_strategy") return "business_strategy"
  if (plan.primaryGoal === "marketing_strategy" || plan.primaryGoal === "campaign_review") return "marketing_strategy"
  if (plan.primaryGoal === "inventory_priority" || plan.primaryGoal === "inventory_review") return "inventory_priority"
  if (plan.primaryGoal === "sales_performance_review") return "sales_performance"
  if (plan.primaryGoal === "cash_health") return "cash_health"
  return "generic_business_review"
}

function topCommercialProduct(products: MarginProduct[]) {
  return [...products].sort((a, b) => commercialSignalScore(b) - commercialSignalScore(a))[0] || null
}

function commercialSignalScore(product: MarginProduct) {
  const sampleScore = product.sampleSize >= 4 ? 40 : product.sampleSize >= 2 ? 22 : 4
  const salesScore = Math.min(30, product.salesCount * 8)
  const demandScore = Math.min(20, product.campaignDemandLeads * 2)
  const marginScore = product.marginPct >= 18 ? 14 : product.marginPct >= 12 ? 10 : product.marginPct >= 8 ? 6 : -8
  const profitScore = product.averageProfit >= 800 ? 18 : product.averageProfit >= 400 ? 12 : product.averageProfit >= 200 ? 6 : -12
  const velocityScore = product.averageDaysInStock === null ? 0 : product.averageDaysInStock <= 15 ? 14 : product.averageDaysInStock <= 30 ? 7 : -6
  const weakSamplePenalty = product.sampleSize <= 1 ? 24 : 0
  const lowImpactPenalty = product.lowAbsoluteProfit ? 24 : 0
  return sampleScore + salesScore + demandScore + marginScore + profitScore + velocityScore - weakSamplePenalty - lowImpactPenalty
}

function smallSampleAlternatives(products: MarginProduct[], primary: MarginProduct | null) {
  return products
    .filter((product) => product.sampleSize <= 1 && product.label !== primary?.label)
    .sort((a, b) => commercialSignalScore(b) - commercialSignalScore(a))
}

const SECONDARY_TYPE_AFFINITY: Record<OrionDecisionType, OrionDecisionType[]> = {
  capital_allocation: ["inventory_priority", "business_strategy"],
  business_strategy: ["operational_action", "capital_allocation", "marketing_strategy", "inventory_priority"],
  marketing_strategy: ["business_strategy", "capital_allocation"],
  inventory_priority: ["capital_allocation", "business_strategy"],
  cash_health: ["capital_allocation", "business_strategy"],
  sales_performance: ["business_strategy", "capital_allocation"],
  operational_action: ["business_strategy", "capital_allocation"],
}

const TARGETS_PENALIZING_OPERATIONAL: ReadonlyArray<OrionDecisionType> = [
  "capital_allocation",
  "marketing_strategy",
  "inventory_priority",
]

function businessDecisionTypeToMemoryType(decisionType: OrionBusinessDecisionType): OrionDecisionType {
  if (decisionType === "generic_business_review") return "business_strategy"
  if (decisionType === "capital_allocation") return "capital_allocation"
  if (decisionType === "business_strategy") return "business_strategy"
  if (decisionType === "marketing_strategy") return "marketing_strategy"
  if (decisionType === "inventory_priority") return "inventory_priority"
  if (decisionType === "cash_health") return "cash_health"
  if (decisionType === "sales_performance") return "sales_performance"
  return "business_strategy"
}

export function decisionSubtypeFromStoredKey(decisionKey: unknown): string | null {
  if (typeof decisionKey !== "string") return null
  const normalized = decisionKey.trim().toLowerCase()
  if (!normalized) return null
  const segments = normalized.split(":")
  const subtype = segments[segments.length - 1]?.trim()
  return subtype || null
}

function memorySubtype(memory: OrionDecisionMemoryItem): string | null {
  const keySubtype = decisionSubtypeFromStoredKey(memory.decisionPayload?.decisionKey)
  if (keySubtype) return keySubtype
  return typeof memory.decisionPayload?.subtype === "string" ? memory.decisionPayload.subtype : null
}

function effectiveDecisionTypeForMemory(memory: OrionDecisionMemoryItem): OrionDecisionType {
  const subtype = memorySubtype(memory)
  return subtype === "first-move" || subtype === "act" ? "operational_action" : memory.decisionType
}

function normalizeContinuitySentence(value: string) {
  let normalized = value.trim()
  while (normalized.endsWith(".") || normalized.endsWith("!") || normalized.endsWith("?")) {
    normalized = normalized.slice(0, -1).trimEnd()
  }
  return normalized
}

function memoryRelevanceScore(memory: OrionDecisionMemoryItem, plan: OrionSemanticPlan, targetType: OrionDecisionType): number {
  let score = 0
  const effectiveDecisionType = effectiveDecisionTypeForMemory(memory)
  if (effectiveDecisionType === targetType) score += 100
  else if (SECONDARY_TYPE_AFFINITY[targetType]?.includes(effectiveDecisionType)) score += 40
  else score += 5

  const memTimeframeLabel = typeof memory.decisionPayload?.timeframeLabel === "string"
    ? memory.decisionPayload.timeframeLabel
    : null
  if (memTimeframeLabel && plan.timeframe.label && memTimeframeLabel === plan.timeframe.label) {
    score += 60
  }

  const memSubtype = memorySubtype(memory)
  const isTemporal = plan.timeframe.type === "next_n_days"
  const isFirstToday = plan.responseMode === "operational_plan" && !isTemporal
  if (isTemporal) {
    if (memSubtype === "anchor-product" || memSubtype === "buy" || memSubtype === "traffic-test" || memSubtype === "clear-stuck") score += 30
    if (memSubtype === "first-move" || memSubtype === "act") score -= 25
  }
  if (isFirstToday) {
    if (memSubtype === "first-move" || memSubtype === "act") score += 30
    if (memSubtype === "anchor-product") score += 10
    // For today-style questions, treat operational_action as a primary-equivalent type
    // when the plan goal stays as business_strategy (default orchestration).
    if (effectiveDecisionType === "operational_action" && targetType === "business_strategy") score += 60
  }

  if (memory.priority === "critical") score += 20
  else if (memory.priority === "high") score += 15
  else if (memory.priority === "medium") score += 8

  if (memory.status === "in_progress") score += 5
  else if (memory.status === "open") score += 3

  // Operational/first-move memories should not dominate capital/marketing/inventory decisions.
  if (
    TARGETS_PENALIZING_OPERATIONAL.includes(targetType) &&
    (effectiveDecisionType === "operational_action" || memSubtype === "first-move" || memSubtype === "act")
  ) {
    const memEntityLabel = typeof memory.decisionPayload?.entityLabel === "string"
      ? memory.decisionPayload.entityLabel
      : null
    score -= memEntityLabel ? 60 : 90
  }

  return score
}

export function selectRelevantDecisionMemories(
  plan: OrionSemanticPlan,
  openDecisions: OrionDecisionMemoryItem[],
  decisionType: OrionBusinessDecisionType,
  limit = 2
): OrionDecisionMemoryItem[] {
  const targetType = businessDecisionTypeToMemoryType(decisionType)
  const scored = openDecisions.map((memory) => ({ memory, score: memoryRelevanceScore(memory, plan, targetType) }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.memory.updatedAt || "").localeCompare(a.memory.updatedAt || "")
  })
  return scored.slice(0, limit).map((entry) => entry.memory)
}

function findingLabelForMemory(memory: OrionDecisionMemoryItem, isSecondary: boolean): string {
  if (isSecondary) return "Contexto anterior"
  switch (effectiveDecisionTypeForMemory(memory)) {
    case "business_strategy": return "Decisão estratégica pendente"
    case "operational_action": return "Ação operacional pendente"
    case "capital_allocation": return "Decisão de capital pendente"
    case "marketing_strategy": return "Decisão de tráfego pendente"
    case "inventory_priority": return "Decisão de estoque pendente"
    case "cash_health": return "Decisão de caixa pendente"
    case "sales_performance": return "Decisão sobre vendas pendente"
    default: return "Decisão anterior pendente"
  }
}

function memoryToFinding(memory: OrionDecisionMemoryItem, isSecondary: boolean): OrionBusinessDecision["keyFindings"][number] {
  const reflectionRecap = memory.resultStatus !== "pending" && memory.reflection
    ? ` Reflexão anterior: ${normalizeContinuitySentence(memory.reflection)}.`
    : ""
  const recommendation = normalizeContinuitySentence(memory.recommendation)
  return {
    label: findingLabelForMemory(memory, isSecondary),
    value: memory.title,
    severity: isSecondary ? "info" : "attention",
    evidence: `Continuidade da recomendação registrada (${memory.status}): ${recommendation}.${reflectionRecap}`,
  }
}

function priorDecisionFindings(
  memoryContext: OrionDecisionMemoryContext | null | undefined,
  decisionType: OrionBusinessDecisionType,
  plan: OrionSemanticPlan
): OrionBusinessDecision["keyFindings"] {
  if (!memoryContext || memoryContext.openDecisions.length === 0) return []
  const ranked = selectRelevantDecisionMemories(plan, memoryContext.openDecisions, decisionType, 2)
  if (ranked.length === 0) return []
  const primary = ranked[0]
  const targetType = businessDecisionTypeToMemoryType(decisionType)
  const primaryScore = memoryRelevanceScore(primary, plan, targetType)
  if (primaryScore < 50) return []
  const findings: OrionBusinessDecision["keyFindings"] = [memoryToFinding(primary, false)]
  const secondary = ranked[1]
  if (secondary && effectiveDecisionTypeForMemory(secondary) !== effectiveDecisionTypeForMemory(primary)) {
    const secondaryScore = memoryRelevanceScore(secondary, plan, targetType)
    if (secondaryScore >= 50) findings.push(memoryToFinding(secondary, true))
  }
  return findings
}


function buildCapitalAllocationDecision(input: {
  plan: OrionSemanticPlan
  results: OrionToolResult[]
  reinvestment: ReinvestmentDecision | null
  memoryContext?: OrionDecisionMemoryContext | null
}): OrionBusinessDecision {
  const margin = dataFor<MarginByProductData>(input.results, "sales.marginByProduct")
  const cash = dataFor<CashPositionData>(input.results, "finance.cashPosition")
  const products = margin?.products || []
  const topProduct = topCommercialProduct(products)
  const weakSampleAlternative = smallSampleAlternatives(products, topProduct)[0] || null
  const budget = input.plan.budgetAmount
  const safeCap = input.reinvestment?.capAfterPayables ?? input.reinvestment?.safeReinvestmentCap ?? 0
  const usableBudget = budget !== null ? Math.min(budget, safeCap) : safeCap
  const productCost = topProduct?.probableUnitCost ?? null
  const canBuyIdeal = productCost !== null && usableBudget >= productCost

  const priorFindings = priorDecisionFindings(input.memoryContext, "capital_allocation", input.plan)
  const keyFindings: OrionBusinessDecision["keyFindings"] = [
    ...priorFindings,
    {
      label: "Teto seguro",
      value: brl(safeCap),
      severity: safeCap > 0 ? "info" : "critical",
      evidence: "Baseado na Reinvestment Intelligence, preservando contas e reserva operacional.",
    },
    budget !== null ? {
      label: "Orçamento informado",
      value: brl(budget),
      severity: budget <= safeCap ? "info" : "attention",
      evidence: budget <= safeCap ? "Cabe no teto seguro calculado." : "Orçamento passa do teto seguro; não use tudo agora.",
    } : {
      label: "Orçamento",
      value: "não informado",
      severity: "attention",
      evidence: "A decisão usa o teto seguro como limite máximo.",
    },
    topProduct ? {
      label: "Melhor sinal comercial",
      value: topProduct.label,
      severity: topProduct.sampleSize <= 1 ? "attention" : "info",
      evidence: `${plural(topProduct.salesCount, "venda", "vendas")}, margem média ${pct(topProduct.marginPct)}, lucro médio ${brl(topProduct.averageProfit)} e ${plural(topProduct.campaignDemandLeads, "lead de campanha", "leads de campanha")}. Base de recompra: ${margin?.period.label || input.reinvestment?.analysisWindow.label || "não informada"}.`,
    } : {
      label: "Produto prioritário",
      value: "sem candidato forte",
      severity: "attention",
      evidence: "O snapshot não trouxe histórico comercial suficiente por SKU.",
    },
  ]

  const action = topProduct && canBuyIdeal
    ? `Comprar seletivamente ${topProduct.label}, respeitando limite de ${brl(usableBudget)}.`
    : topProduct && productCost !== null
      ? `Não comprar ${topProduct.label} agora; o custo provável (${brl(productCost)}) passa do capital seguro disponível (${brl(usableBudget)}).`
      : "Não travar capital em compra nova até existir candidato com giro, margem e custo claros."

  return {
    decisionType: "capital_allocation",
    timeframeLabel: input.plan.timeframe.label,
    keyFindings: keyFindings.slice(0, 5),
    recommendation: {
      title: canBuyIdeal ? "Comprar com teto" : "Segurar compra direta do SKU ideal",
      action: weakSampleAlternative && canBuyIdeal
        ? `${action} ${weakSampleAlternative.label} fica como alternativa de cautela, não como melhor decisão, porque tem amostra pequena.`
        : action,
      reason: canBuyIdeal
        ? "Há teto financeiro e candidato comercial com sinal de margem/giro."
        : "Há diferença entre ter caixa e ter folga suficiente para comprar o SKU certo.",
      confidence: confidenceFromTools(input.results),
    },
    alternatives: [
      weakSampleAlternative ? {
        title: `${weakSampleAlternative.label} com cautela`,
        tradeoff: `Cabe melhor no bolso e tem margem, mas exige cautela: só tem ${plural(weakSampleAlternative.salesCount, "venda", "vendas")}; tratar como teste pequeno, não prioridade principal.`,
      } : null,
      { title: "Negociar fornecedor", tradeoff: "Reduz custo de entrada e pode transformar uma compra insegura em recompra viável." },
      { title: "Aguardar recebível próximo", tradeoff: "Preserva caixa hoje e melhora margem de segurança." },
    ].filter(Boolean).slice(0, 3) as OrionBusinessDecision["alternatives"],
    avoid: [
      ...products.filter((product) => product.lowAbsoluteProfit || isLowAbsoluteProfit(product.averageProfit)).slice(0, 2).map((product) => ({
        title: product.label,
        reason: "Lucro absoluto baixo: pode complementar venda, mas não deve consumir o capital principal.",
      })),
      !canBuyIdeal && topProduct ? {
        title: topProduct.label,
        reason: "Produto tem sinal comercial, mas falta capital seguro para compra direta no custo provável atual.",
      } : null,
    ].filter(Boolean).slice(0, 3) as OrionBusinessDecision["avoid"],
    nextSteps: [
      { priority: "high", action: "Usar o teto seguro como limite, não o caixa bruto." },
      { priority: "medium", action: "Pedir cotação do produto prioritário e comparar com o capital seguro." },
      { priority: "low", action: "Se o custo não couber, escolher item de menor capital ou aguardar recebível." },
    ],
    usedTools: input.results.map((result) => result.tool),
    caveats: [
      ...resultCaveats(input.results),
      cash && cash.cash > safeCap ? "Caixa bruto é maior que o teto seguro; não tratar a diferença como lucro livre." : null,
    ].filter(Boolean).map((item) => sentenceCase(String(item))) as string[],
  }
}

function buildStrategyDecision(input: {
  plan: OrionSemanticPlan
  results: OrionToolResult[]
  memoryContext?: OrionDecisionMemoryContext | null
  decisionType: OrionBusinessDecisionType
}): OrionBusinessDecision {
  const cash = dataFor<CashPositionData>(input.results, "finance.cashPosition")
  const sales = dataFor<SalesPerformanceData>(input.results, "sales.performance")
  const margin = dataFor<MarginByProductData>(input.results, "sales.marginByProduct")
  const stock = dataFor<StuckItemsData>(input.results, "inventory.stuckItems")
  const campaigns = dataFor<CampaignPerformanceData>(input.results, "marketing.campaignPerformance")
  const leads = dataFor<FunnelHealthData>(input.results, "leads.funnelHealth")
  const availableStock = dataFor<AvailableStockData>(input.results, "inventory.availableStock")
  const reinvestment = dataFor<ReinvestmentDecision>(input.results, "reinvestment.decision")
  const topStuck = stock?.items[0] || null
  const topCampaign = campaigns?.campaigns[0] || null
  const activeOpportunities = leads?.activeOpportunities ?? 0
  const anchorProduct = topCommercialProduct(margin?.products || [])
  const anchorLabel = anchorProduct?.label || reinvestment?.recommendedProducts[0]?.label || availableStock?.items[0]?.label || "produto âncora"
  const trafficRisk = isTrafficRiskyWithoutAnchor({
    availableStockCount: availableStock?.items.length || 0,
    campaignSales: topCampaign?.sales || 0,
    activeLeadOpportunities: leads?.activeOpportunities || 0,
  })

  const asksTraffic = input.plan.toolsNeeded.includes("marketing.campaignPerformance")
    && input.plan.toolsNeeded.includes("leads.funnelHealth")
    && input.plan.responseMode === "decision"
  const isTemporalStrategy = input.plan.timeframe.type === "next_n_days"
  const isFirstToday = input.plan.responseMode === "operational_plan" && !isTemporalStrategy
  const priorFindings = priorDecisionFindings(input.memoryContext, input.decisionType, input.plan)
  const keyFindings: OrionBusinessDecision["keyFindings"] = [
    ...priorFindings,
    {
      label: "Caixa",
      value: cash ? brl(cash.cash) : "sem dado",
      severity: cash && cash.cash > 0 ? "info" : "attention",
      evidence: "Caixa precisa ser preservado antes de acelerar compra ou tráfego.",
    },
    ...salesFindings(sales),
    {
      label: "Estoque preso",
      value: topStuck ? topStuck.label : "sem bloqueio forte",
      severity: topStuck?.risk === "high" ? "critical" : topStuck ? "attention" : "info",
      evidence: topStuck ? `${topStuck.daysInStock} dias em estoque e ${brl(topStuck.investedCapital)} imobilizado.` : "Sem item parado crítico no snapshot.",
    },
    {
      label: "Tráfego",
      value: trafficRisk ? "usar com cautela" : "pode testar seletivo",
      severity: trafficRisk ? "attention" : "info",
      evidence: trafficRisk
        ? "Sem produto âncora/conversão clara, tráfego pode queimar caixa."
        : activeOpportunities > 0
          ? "Há estoque, venda ou lead ativo para apoiar campanha."
          : "Há sinal histórico de demanda, mas não há lead ativo agora.",
    },
  ]

  if (asksTraffic) {
    return {
      decisionType: "marketing_strategy",
      timeframeLabel: input.plan.timeframe.label,
      keyFindings: [
        {
          label: "Decisão de tráfego",
          value: trafficRisk ? "não rodar amplo" : "rodar seletivo",
          severity: trafficRisk ? "attention" : "info",
          evidence: trafficRisk
            ? "Tráfego sem produto âncora ou conversão clara tende a gerar lead sem venda."
            : activeOpportunities > 0
              ? `Usar ${anchorLabel} como produto âncora e medir conversão rápido.`
              : `Há sinal histórico de demanda para ${anchorLabel}, mas não há lead ativo agora; campanha precisa ser teste curto.`,
        },
        {
          label: "Produto âncora",
          value: anchorLabel,
          severity: anchorProduct && anchorProduct.sampleSize <= 1 ? "attention" : "info",
          evidence: anchorProduct
            ? `${plural(anchorProduct.salesCount, "venda", "vendas")}, margem ${pct(anchorProduct.marginPct)} e lucro médio ${brl(anchorProduct.averageProfit)}. Base de recompra: ${margin?.period.label || "não informada"}.`
            : "Produto âncora precisa ser validado antes de aumentar gasto.",
        },
        {
          label: "Funil",
          value: leads ? `${plural(leads.activeOpportunities, "oportunidade ativa", "oportunidades ativas")}` : "sem dado",
          severity: leads && leads.activeOpportunities > 0 ? "info" : "attention",
          evidence: leads && leads.activeOpportunities === 0
            ? "Não tratar lead perdido como oportunidade ativa de follow-up."
            : leads && leads.lostLeads > 0
              ? "Leads perdidos servem como diagnóstico de conversão, não como follow-up principal."
              : "Sem pressão de lead ativo suficiente no snapshot.",
        },
      ],
      recommendation: {
        title: trafficRisk ? "Não rodar tráfego amplo agora" : "Rodar tráfego curto e seletivo",
        action: trafficRisk
          ? `Primeiro defina oferta e produto âncora; depois rode tráfego pequeno focado em ${anchorLabel}.`
          : `Rodar campanha curta com ${anchorLabel}, limite baixo e checagem de conversão antes de ampliar.`,
        reason: "Tráfego só é bom quando existe produto âncora, oferta clara e capacidade de converter lead.",
        confidence: confidenceFromTools(input.results),
      },
      alternatives: [
        { title: "Teste pequeno", tradeoff: "Aprende rápido sem comprometer caixa." },
        { title: "Orgânico/direct", tradeoff: "Mais lento, mas valida oferta antes de pagar mídia." },
      ],
      avoid: [
        { title: "Tráfego sem produto âncora", reason: "Sem foco, aumenta lead ruim e confunde diagnóstico." },
        { title: "Tráfego sem estoque/oferta", reason: "Gera procura que a operação não converte." },
      ],
      nextSteps: [
        { priority: "high", action: `Definir ${anchorLabel} como produto âncora ou escolher outro com estoque real.` },
        { priority: "medium", action: "Montar oferta objetiva com preço, garantia e condição de pagamento." },
        { priority: "low", action: "Rodar teste curto e parar se lead não virar conversa qualificada." },
      ],
      usedTools: input.results.map((result) => result.tool),
      caveats: resultCaveats(input.results),
    }
  }

  if (isTemporalStrategy) {
    return {
      decisionType: "business_strategy",
      timeframeLabel: input.plan.timeframe.label,
      keyFindings: keyFindings.slice(0, 4),
      recommendation: {
        title: `Plano para ${input.plan.timeframe.label}`,
        action: `Primeiro viabilizar ${anchorLabel}; depois montar oferta e só então testar campanha curta.`,
        reason: "A sequência correta é produto âncora, oferta, prova comercial e tráfego. Inverter isso aumenta risco de lead sem conversão.",
        confidence: confidenceFromTools(input.results),
      },
      alternatives: [
        { title: "Recompra seletiva", tradeoff: "Melhora potencial de giro se o custo couber no teto seguro." },
        { title: "Liquidez primeiro", tradeoff: "Mais defensivo, útil se fornecedor não encaixar preço." },
      ],
      avoid: [
        { title: "Rodar tráfego antes da oferta", reason: "Sem produto âncora, mídia vira ruído e diagnóstico ruim." },
        { title: "Comprar item de baixo impacto", reason: "Ocupa caixa sem mudar o resultado dos próximos dias." },
      ],
      nextSteps: [
        { priority: "high", action: `Próximos 2-3 dias: cotar e tentar viabilizar ${anchorLabel} como produto âncora.` },
        { priority: "medium", action: "Próximos 7 dias: montar oferta com preço, garantia, parcelamento e prova comercial." },
        { priority: "low", action: "Próximos 15 dias: rodar campanha curta só se houver estoque e atendimento prontos." },
      ],
      usedTools: input.results.map((result) => result.tool),
      caveats: resultCaveats(input.results),
    }
  }

  if (isFirstToday) {
    return {
      decisionType: "business_strategy",
      timeframeLabel: input.plan.timeframe.label,
      keyFindings: keyFindings.slice(0, 3),
      recommendation: {
        title: "Primeiro movimento de hoje",
        action: `Cote ${anchorLabel} e valide se cabe no teto seguro antes de pensar em tráfego.`,
        reason: "A prioridade do dia é destravar o produto que pode gerar giro, não abrir várias frentes ao mesmo tempo.",
        confidence: confidenceFromTools(input.results),
      },
      alternatives: [],
      avoid: [
        { title: "Começar por campanha", reason: "Sem produto e oferta definidos, tráfego tende a gerar ruído." },
      ],
      nextSteps: [
        { priority: "high", action: `Cotar ${anchorLabel} com fornecedor e confirmar custo de entrada.` },
        { priority: "medium", action: "Definir oferta simples: preço, garantia, entrada e parcelamento." },
        { priority: "low", action: "Só depois decidir se vale tráfego ou venda direta." },
      ],
      usedTools: input.results.map((result) => result.tool),
      caveats: resultCaveats(input.results),
    }
  }

  return {
    decisionType: asksTraffic ? "marketing_strategy" : "business_strategy",
    timeframeLabel: input.plan.timeframe.label,
    keyFindings: keyFindings.slice(0, 5),
    recommendation: {
      title: asksTraffic ? (trafficRisk ? "Não abrir tráfego amplo agora" : "Rodar tráfego seletivo") : "Priorizar giro com caixa protegido",
      action: asksTraffic
        ? trafficRisk
          ? "Não rodar tráfego amplo; primeiro defina produto âncora e oferta de conversão."
          : "Rodar teste pequeno focado em produto âncora e medir conversão rapidamente."
        : "Começar pelo item que mais libera caixa ou pelo produto com melhor giro/margem, mantendo recompra seletiva.",
      reason: "A decisão boa preserva liquidez e aumenta velocidade comercial, não só movimenta caixa.",
      confidence: confidenceFromTools(input.results),
    },
    alternatives: [
      { title: "Recompra seletiva", tradeoff: "Aumenta potencial de venda, mas só faz sentido com margem/giro claro." },
      { title: "Campanha curta", tradeoff: "Pode gerar demanda, mas sem produto âncora aumenta risco de gasto improdutivo." },
      { title: "Liquidação controlada", tradeoff: "Libera caixa de estoque parado, mas desconto cedo demais destrói margem." },
    ],
    avoid: [
      { title: "Tráfego sem produto âncora", reason: "Pode gerar lead sem conversão e piorar o uso do caixa." },
      { title: "Comprar produto de baixo lucro como prioridade", reason: "Produto pequeno complementa, mas não muda o resultado da operação." },
      { title: "Confundir recebível futuro com caixa", reason: "Recebível distante serve para planejar, não para liberar gasto agressivo hoje." },
    ],
    nextSteps: [
      { priority: "high", action: topStuck ? `Atacar ${topStuck.label} antes de prender mais capital.` : "Escolher um produto âncora com margem e giro." },
      { priority: "medium", action: "Separar teto de recompra e não usar caixa bruto como orçamento." },
      { priority: "low", action: "Rodar ação comercial curta e medir resposta antes de ampliar gasto." },
    ],
    usedTools: input.results.map((result) => result.tool),
    caveats: resultCaveats(input.results),
  }
}

function buildBusinessReviewDecision(input: {
  plan: OrionSemanticPlan
  results: OrionToolResult[]
  memoryContext?: OrionDecisionMemoryContext | null
}): OrionBusinessDecision {
  const margin = dataFor<MarginByProductData>(input.results, "sales.marginByProduct")
  const stock = dataFor<StuckItemsData>(input.results, "inventory.stuckItems")
  const campaigns = dataFor<CampaignPerformanceData>(input.results, "marketing.campaignPerformance")
  const sales = dataFor<SalesPerformanceData>(input.results, "sales.performance")
  const weakProduct = margin?.products.find((product) => product.lowAbsoluteProfit || product.marginPct < 8) || null
  const stuck = stock?.items.find((item) => item.risk === "high") || stock?.items[0] || null
  const weakCampaign = campaigns?.campaigns.find((campaign) => campaign.leads > 0 && campaign.sales === 0) || null
  const priorFindings = priorDecisionFindings(input.memoryContext, "generic_business_review", input.plan)
  const keyFindings: OrionBusinessDecision["keyFindings"] = [
    ...priorFindings,
    {
      label: "Perda financeira total",
      value: "não conclusiva",
      severity: "attention",
      evidence: "Sem DRE, despesas e descontos completos, não dá para cravar perda financeira total.",
    },
    ...salesFindings(sales),
    weakProduct ? {
      label: weakProduct.lowAbsoluteProfit ? "Baixo impacto" : "Margem baixa",
      value: weakProduct.label,
      severity: "attention",
      evidence: weakProduct.lowAbsoluteProfit
        ? `Lucro médio de ${brl(weakProduct.averageProfit)}. Isso é complemento, não perda real nem prioridade de capital.`
        : `Margem ${pct(weakProduct.marginPct)}. Aqui pode existir perda de margem, não apenas baixo impacto.`,
    } : {
      label: "Margem/produto",
      value: "sem alerta forte",
      severity: "info",
      evidence: "Sem produto de margem/lucro baixo como principal perda no snapshot.",
    },
    stuck ? {
      label: "Estoque preso",
      value: stuck.label,
      severity: stuck.risk === "high" ? "critical" : "attention",
      evidence: `${stuck.daysInStock} dias em estoque e ${brl(stuck.investedCapital)} imobilizado.`,
    } : {
      label: "Estoque preso",
      value: "sem item crítico",
      severity: "info",
      evidence: "Sem estoque parado relevante na amostra carregada.",
    },
    weakCampaign ? {
      label: "Campanha",
      value: weakCampaign.name,
      severity: "attention",
      evidence: `${plural(weakCampaign.leads, "lead", "leads")}, sem venda registrada na campanha.`,
    } : {
      label: "Campanha",
      value: "sem perda clara",
      severity: "info",
      evidence: "Campanhas carregadas não mostram perda direta suficiente.",
    },
  ]

  const dreCaveat = "Sem DRE/despesas/descontos completos, esta leitura não fecha perda financeira total; com snapshot atual aponto baixo impacto, margem, estoque e campanha."

  return {
    decisionType: "generic_business_review",
    timeframeLabel: input.plan.timeframe.label,
    keyFindings: keyFindings.slice(0, 5),
    recommendation: {
      title: stuck ? "Liberar capital parado" : weakProduct ? "Corrigir mix de margem" : "Focar no melhor giro",
      action: stuck
        ? `Priorize ação direta sobre ${stuck.label} antes de aumentar compra.`
        : weakProduct
          ? `Classifique ${weakProduct.label} como baixo impacto/complemento; não como perda principal da operação.`
          : "Concentre energia nos produtos com melhor margem e recorrência.",
      reason: "Com os dados disponíveis, separo perda comprovada, baixo impacto, margem fraca, capital parado e campanha sem conversão.",
      confidence: confidenceFromTools(input.results),
    },
    alternatives: [
      { title: "Auditoria financeira", tradeoff: "Necessária para cravar despesas/DRE/descontos; esta resposta usa apenas snapshot operacional." },
      { title: "Ação de estoque", tradeoff: "Libera capital rápido, mas precisa preservar margem mínima." },
    ],
    avoid: [
      { title: "Inventar origem de perda", reason: "DRE, despesas detalhadas e descontos não estão completos neste snapshot." },
      { title: "Comprar mais do mesmo mix fraco", reason: "Reforça capital em produto que não move lucro." },
    ],
    nextSteps: [
      { priority: "high", action: stuck ? `Criar oferta direta para ${stuck.label}.` : "Separar produtos de baixo lucro dos produtos prioritários." },
      { priority: "medium", action: "Abrir auditoria se quiser detalhar DRE, despesas e descontos." },
      { priority: "low", action: "Revisar campanha que gera lead sem venda antes de aumentar tráfego." },
    ],
    usedTools: input.results.map((result) => result.tool),
    caveats: [
      dreCaveat,
      ...resultCaveats(input.results),
    ].map(sentenceCase),
  }
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function extractEntityLabelFromDecision(decision: OrionBusinessDecision): string | null {
  for (const finding of decision.keyFindings) {
    if (finding.label === "Melhor sinal comercial" || finding.label === "Produto âncora" || finding.label === "Estoque preso") {
      if (finding.value && finding.value !== "sem candidato forte" && finding.value !== "sem bloqueio forte" && finding.value !== "sem item crítico") {
        return finding.value
      }
    }
  }
  return null
}

export function decisionSubtypeFor(
  decisionType: import("./orion-decision-memory-store").OrionDecisionType,
  decision: OrionBusinessDecision,
  entityLabel: string | null
): string {
  const title = decision.recommendation.title.toLowerCase()
  const action = decision.recommendation.action.toLowerCase()
  switch (decisionType) {
    case "capital_allocation": {
      if (entityLabel && decision.avoid.some((item) => item.title === entityLabel)) return "hold"
      if (title.includes("segurar") || title.includes("não comprar") || action.startsWith("não comprar")) return "hold"
      if (title.includes("comprar") || action.includes("comprar seletivamente")) return "buy"
      return "buy"
    }
    case "marketing_strategy": {
      if (title.includes("não rodar") || title.includes("não abrir") || title.includes("não rode")) return "traffic-pause"
      if (title.includes("rodar tráfego") || title.includes("tráfego seletivo") || title.includes("rodar campanha")) return "traffic-test"
      return "traffic-review"
    }
    case "business_strategy": {
      if (title.includes("primeiro movimento")) return "first-move"
      if (title.includes("plano para")) return "anchor-product"
      if (title.includes("priorizar giro")) return "anchor-product"
      return "anchor-product"
    }
    case "inventory_priority": {
      if (entityLabel && decision.avoid.some((item) => item.title === entityLabel)) return "avoid-main-capital"
      if (title.includes("liberar")) return "clear-stuck"
      if (title.includes("corrigir mix")) return "rebalance-mix"
      return "clear-stuck"
    }
    case "cash_health":
      return "preserve"
    case "sales_performance":
      return "review"
    case "operational_action":
      return "act"
    default:
      return "general"
  }
}

export function reviewHorizonDaysFor(
  decisionType: import("./orion-decision-memory-store").OrionDecisionType
): number {
  switch (decisionType) {
    case "capital_allocation": return 7
    case "marketing_strategy": return 5
    case "business_strategy": return 15
    case "inventory_priority": return 14
    case "cash_health": return 7
    case "sales_performance": return 14
    case "operational_action": return 3
    default: return 7
  }
}

function reviewAfterIso(
  decisionType: import("./orion-decision-memory-store").OrionDecisionType,
  now: Date = new Date()
): string {
  const days = reviewHorizonDaysFor(decisionType)
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function buildDecisionMemoryCandidate(
  decision: OrionBusinessDecision,
  userQuestion: string,
  options?: { now?: Date }
): {
  decisionType: import("./orion-decision-memory-store").OrionDecisionType
  title: string
  recommendation: string
  reason: string
  priority: import("./orion-decision-memory-store").OrionDecisionPriority
  confidence: import("./orion-decision-memory-store").OrionDecisionConfidence
  sourceQuestion: string
  decisionPayload: Record<string, unknown>
  expectedOutcome: Record<string, unknown>
  reviewAfter: string
} | null {
  if (decision.decisionType === "generic_business_review" && !decision.keyFindings.some((f) => f.severity === "critical")) {
    return null
  }
  if (decision.recommendation.confidence === "low" && !decision.recommendation.action.trim()) {
    return null
  }
  const entityLabel = extractEntityLabelFromDecision(decision)
  const rawDecisionType: import("./orion-decision-memory-store").OrionDecisionType =
    decision.decisionType === "capital_allocation" ? "capital_allocation"
    : decision.decisionType === "business_strategy" ? "business_strategy"
    : decision.decisionType === "marketing_strategy" ? "marketing_strategy"
    : decision.decisionType === "inventory_priority" ? "inventory_priority"
    : decision.decisionType === "cash_health" ? "cash_health"
    : decision.decisionType === "sales_performance" ? "sales_performance"
    : "operational_action"
  const priority: import("./orion-decision-memory-store").OrionDecisionPriority =
    decision.keyFindings.some((f) => f.severity === "critical") ? "critical"
    : decision.keyFindings.some((f) => f.severity === "attention") ? "high"
    : "medium"
  const subtype = decisionSubtypeFor(rawDecisionType, decision, entityLabel)
  // Operational subtypes (first-move/act) belong to the operational_action memory type,
  // regardless of the broader plan goal that produced the decision.
  const decisionType: import("./orion-decision-memory-store").OrionDecisionType =
    (subtype === "first-move" || subtype === "act") && rawDecisionType !== "operational_action"
      ? "operational_action"
      : rawDecisionType
  const targetSlug = entityLabel ? slug(entityLabel) : slug(decision.timeframeLabel || "global")
  const decisionKey = `${targetSlug}:${subtype}`
  return {
    decisionType,
    title: decision.recommendation.title,
    recommendation: decision.recommendation.action,
    reason: decision.recommendation.reason,
    priority,
    confidence: decision.recommendation.confidence,
    sourceQuestion: userQuestion,
    decisionPayload: {
      decisionKey,
      subtype,
      timeframeLabel: decision.timeframeLabel,
      ...(entityLabel ? { entityLabel } : {}),
      usedTools: decision.usedTools,
    },
    expectedOutcome: {
      action: decision.recommendation.action,
      nextSteps: decision.nextSteps.map((step) => step.action),
      avoid: decision.avoid.map((item) => item.title),
    },
    reviewAfter: reviewAfterIso(decisionType, options?.now),
  }
}

export function buildOrionBusinessDecision(input: BuildOrionBusinessDecisionInput): OrionBusinessDecision {
  const tools = input.semanticPlan.toolsNeeded.length
    ? input.semanticPlan.toolsNeeded
    : (["finance.cashPosition", "sales.performance", "inventory.stuckItems"] as OrionToolName[])
  const results = runOrionTools({ tools, snapshot: input.snapshot, semanticPlan: input.semanticPlan })
  const reinvestment = dataFor<ReinvestmentDecision>(results, "reinvestment.decision")

  const memoryContext = input.decisionMemoryContext || null
  if (input.semanticPlan.primaryGoal === "capital_allocation") {
    return buildCapitalAllocationDecision({ plan: input.semanticPlan, results, reinvestment, memoryContext })
  }
  if (
    input.semanticPlan.primaryGoal === "business_strategy"
    || input.semanticPlan.primaryGoal === "marketing_strategy"
    || input.semanticPlan.primaryGoal === "campaign_review"
    || input.semanticPlan.primaryGoal === "inventory_priority"
    || input.semanticPlan.primaryGoal === "inventory_review"
  ) {
    const decisionType: OrionBusinessDecisionType = input.semanticPlan.primaryGoal === "marketing_strategy" || input.semanticPlan.primaryGoal === "campaign_review"
      ? "marketing_strategy"
      : input.semanticPlan.primaryGoal === "inventory_priority" || input.semanticPlan.primaryGoal === "inventory_review"
        ? "inventory_priority"
        : "business_strategy"
    return buildStrategyDecision({ plan: input.semanticPlan, results, memoryContext, decisionType })
  }
  if (input.semanticPlan.primaryGoal === "business_review" || input.semanticPlan.primaryGoal === "sales_performance_review") {
    return buildBusinessReviewDecision({ plan: input.semanticPlan, results, memoryContext })
  }

  return {
    decisionType: decisionTypeFor(input.semanticPlan),
    timeframeLabel: input.semanticPlan.timeframe.label,
    keyFindings: [],
    recommendation: {
      title: "Decisão provisória",
      action: "Preciso de uma pergunta mais específica para escolher a ferramenta certa.",
      reason: "O plano semântico não trouxe uma missão de negócio suficiente.",
      confidence: "low",
    },
    alternatives: [],
    avoid: [],
    nextSteps: [{ priority: "high", action: "Perguntar sobre compra, tráfego, estoque, vendas ou caixa." }],
    usedTools: results.map((result) => result.tool),
    caveats: resultCaveats(results),
  }
}
