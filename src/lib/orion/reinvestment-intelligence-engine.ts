import type { OrionSnapshot } from "./types"

export type ReinvestmentDecisionKind = "do_not_reinvest" | "reinvest_with_cap" | "reinvest_recommended"
export type ReinvestmentDecisionConfidence = "low" | "medium" | "high"
export type ReinvestmentCapitalStatus =
  | "cash_tight"
  | "financial_slack"
  | "sku_slack"
  | "demand_without_safe_capital"

export type ReinvestmentDecision = {
  decision: ReinvestmentDecisionKind
  confidence: ReinvestmentDecisionConfidence
  capitalStatus: ReinvestmentCapitalStatus
  safeReinvestmentCap: number
  theoreticalCap: number
  capAfterPayables: number
  recommendedReinvestmentAmount: number
  preserveCashAmount: number
  currentCash: number
  nearTermReceivables: number
  shortTermReceivables: number
  futureReceivables: number
  undatedReceivables: number
  receivablesDetailAvailable: boolean
  upcomingPayables: number
  operationalReserve: number
  rationale: string[]
  precisionWarnings: string[]
  recommendedAction: string
  recommendedCategories: Array<{
    category: string
    reason: string
    suggestedBudget: number | null
    confidence: ReinvestmentDecisionConfidence
  }>
  recommendedProducts: Array<{
    label: string
    productType: string | null
    model: string | null
    reason: string
    historicalMargin: number | null
    averageDaysInStock: number | null
    recentSalesCount: number
    priority: "high" | "medium" | "low"
    probableUnitCost: number | null
    sampleSize: number
    sampleWarning: "small_sample" | null
    periodLabel: string
    confidence: ReinvestmentDecisionConfidence
  }>
  analysisWindow: {
    label: string
    startDate: string | null
    endDate: string | null
    salesCount: number
    source: "selected_period" | "last_30_days" | "last_90_days" | "all_loaded" | "unknown"
  }
  avoid: Array<{
    label: string
    reason: string
  }>
  leadContext: {
    activeOpportunities: number
    lostLeads: number
    shouldFollowUpLostLeads: boolean
    note: string
  }
}

type Candidate = OrionSnapshot["sales"]["reinvestmentCandidates"][number]

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positive(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function candidateCost(candidate: Candidate) {
  return positive(candidate.minRecentCost || candidate.probableUnitCost)
}

function candidateScore(candidate: Candidate) {
  const marginScore = candidate.averageMarginPct >= 18 ? 30 : candidate.averageMarginPct >= 12 ? 20 : candidate.averageMarginPct >= 8 ? 10 : 0
  const days = candidate.averageDaysInStock
  const velocityScore = days === null ? 5 : days <= 15 ? 25 : days <= 30 ? 15 : days <= 45 ? 5 : -5
  const sampleScore = candidate.sampleSize >= 3 ? 20 : candidate.sampleSize === 2 ? 12 : 6
  const demandScore = candidate.campaignDemandLeads > 0 ? Math.min(15, 5 + candidate.campaignDemandLeads) : 0
  const stockPenalty = candidate.stuckStockCount > 0 ? 10 : 0
  const lowProfitPenalty = candidate.averageProfit < 200 || candidate.averageMarginPct < 8 ? 25 : 0
  return marginScore + velocityScore + sampleScore + demandScore - stockPenalty - lowProfitPenalty
}

function confidenceFromSignals(input: {
  base: ReinvestmentDecisionConfidence
  receivablesDetailAvailable: boolean
  hasSmallSample: boolean
}) {
  if (!input.receivablesDetailAvailable) return "low"
  if (input.hasSmallSample && input.base === "high") return "medium"
  if (input.hasSmallSample && input.base === "medium") return "low"
  return input.base
}

function leadContext(snapshot: OrionSnapshot): ReinvestmentDecision["leadContext"] {
  const activeOpportunities = snapshot.marketing.forgottenLeads.filter((lead) => lead.classification !== "lost").length
  const lostLeads = snapshot.marketing.campaigns.reduce((sum, campaign) => sum + positive(campaign.lostLeads), 0)
  return {
    activeOpportunities,
    lostLeads,
    shouldFollowUpLostLeads: false,
    note: activeOpportunities > 0
      ? "Há oportunidades ativas no funil; follow-up vale apenas nelas, não em leads perdidos."
      : lostLeads > 0
        ? "Leads perdidos indicam demanda ou falha de conversão, mas não são oportunidade ativa de follow-up."
        : "Sem sinal relevante de leads para sustentar recompra por CRM.",
  }
}

function receivableWindows(snapshot: OrionSnapshot) {
  const receivables = snapshot.executive.liquidityForecast.nextReceivables || []
  const receivablesDetailAvailable = receivables.length > 0
  if (!receivablesDetailAvailable) {
    return {
      receivablesDetailAvailable,
      nearTermReceivables: 0,
      shortTermReceivables: 0,
      futureReceivables: 0,
      undatedReceivables: positive(snapshot.executive.pendingReceivables || snapshot.finance.pendingBalance),
    }
  }
  return {
    receivablesDetailAvailable,
    nearTermReceivables: roundCurrency(receivables.filter((item) => item.daysUntilDue <= 3).reduce((sum, item) => sum + positive(item.amount), 0)),
    shortTermReceivables: roundCurrency(receivables.filter((item) => item.daysUntilDue <= 7).reduce((sum, item) => sum + positive(item.amount), 0)),
    futureReceivables: roundCurrency(receivables.filter((item) => item.daysUntilDue > 7).reduce((sum, item) => sum + positive(item.amount), 0)),
    undatedReceivables: 0,
  }
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value)
}

function pluralPt(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural
}

function formatDaysPt(value: number) {
  const rounded = roundCurrency(value)
  const text = rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
  return `${text} ${pluralPt(rounded, "dia", "dias")}`
}

function productReason(candidate: Candidate) {
  const sales = candidate.recentSalesCount
  const leads = candidate.campaignDemandLeads
  const parts = [
    `${sales} ${pluralPt(sales, "venda recente", "vendas recentes")}`,
    `${roundCurrency(candidate.averageMarginPct)}% de margem média`,
    candidate.averageDaysInStock !== null ? `${formatDaysPt(candidate.averageDaysInStock)} médios em estoque` : null,
    leads > 0 ? `${leads} ${pluralPt(leads, "lead", "leads")} de campanha como sinal de demanda` : null,
    candidate.sampleSize <= 1 ? "amostra pequena, tratar como sinal e não prova" : null,
  ]
  return parts.filter(Boolean).join("; ")
}

export function buildReinvestmentDecision(snapshot: OrionSnapshot): ReinvestmentDecision {
  const cashComposition = snapshot.finance.currentCashCompositionSnapshot
  const currentCash = roundCurrency(positive(cashComposition?.consolidatedCash ?? snapshot.finance.reconciledCashBalance))
  const analysisWindow = snapshot.sales?.reinvestmentAnalysisWindow ?? {
    label: "Base não informada",
    startDate: null,
    endDate: null,
    salesCount: 0,
    source: "unknown" as const,
  }
  const windows = receivableWindows(snapshot)
  const upcomingPayables = roundCurrency(positive(snapshot.executive.liquidityForecast.payables7d))
  const operationalReserve = roundCurrency(Math.max(1000, currentCash * 0.25))
  const preserveCashAmount = roundCurrency(upcomingPayables + operationalReserve)
  const theoreticalCap = roundCurrency(Math.max(0, currentCash - operationalReserve))
  const capAfterPayables = roundCurrency(Math.max(0, currentCash - operationalReserve - upcomingPayables))
  const immediateCashRoom = capAfterPayables
  // safeReinvestmentCap exposes the teto teórico (cash - reserva mínima) to align with UI mental model.
  const safeReinvestmentCap = theoreticalCap

  const rankedCandidates = [...(snapshot.sales?.reinvestmentCandidates || [])]
    .sort((a, b) => candidateScore(b) - candidateScore(a))
  const lowProfitCandidates = rankedCandidates.filter((candidate) => candidate.averageProfit < 200 || candidate.averageMarginPct < 8)
  const viableCandidates = rankedCandidates.filter((candidate) => candidate.averageProfit >= 200 && candidate.averageMarginPct >= 8)
  const topCandidate = viableCandidates[0] || null
  const affordableCandidates = viableCandidates.filter((candidate) => {
    const cost = candidateCost(candidate)
    return cost > 0 && cost <= capAfterPayables
  })
  const recommendedBase = affordableCandidates[0] || null
  const topCandidateCost = topCandidate ? candidateCost(topCandidate) : 0
  const hasDemandWithoutCapital = Boolean(topCandidate && topCandidateCost > capAfterPayables)
  const hasSmallSample = Boolean((recommendedBase || topCandidate)?.sampleSize === 1)

  const recommendedProducts = affordableCandidates.slice(0, 3).map((candidate, index) => ({
    label: candidate.label,
    productType: candidate.productType,
    model: candidate.model,
    reason: productReason(candidate),
    historicalMargin: candidate.averageMarginPct,
    averageDaysInStock: candidate.averageDaysInStock,
    recentSalesCount: candidate.recentSalesCount,
    priority: index === 0 ? "high" as const : index === 1 ? "medium" as const : "low" as const,
    probableUnitCost: candidate.probableUnitCost,
    sampleSize: candidate.sampleSize,
    sampleWarning: candidate.sampleSize <= 1 ? "small_sample" as const : null,
    periodLabel: analysisWindow.label,
    confidence: candidate.confidence,
  }))

  const avoid = [
    ...lowProfitCandidates.slice(0, 3).map((candidate) => {
      const marginLow = candidate.averageMarginPct < 8
      const profitLow = candidate.averageProfit < 200
      const marginText = `${roundCurrency(candidate.averageMarginPct)}% de margem percentual`
      const profitText = `${formatBrl(candidate.averageProfit)} de lucro absoluto médio`
      const reason = marginLow && profitLow
        ? `Margem percentual e lucro absoluto baixos para prioridade de capital: ${marginText} e ${profitText}.`
        : marginLow
          ? `Margem percentual baixa para prioridade de capital: ${marginText}.`
          : `Margem percentual ok, mas lucro absoluto médio baixo para mover resultado: ${marginText} e ${profitText}. Vale como complemento, não como prioridade de recompra.`
      return { label: candidate.label, reason }
    }),
    topCandidate && hasDemandWithoutCapital ? {
      label: topCandidate.label,
      reason: `Há sinal comercial, mas o teto após contas (${formatBrl(capAfterPayables)}) não cobre o custo provável (${formatBrl(topCandidateCost)}). Aguarde recebível, negocie fornecedor ou escolha item de menor capital.`,
    } : null,
  ].filter(Boolean) as ReinvestmentDecision["avoid"]

  const recommendedCategories = recommendedProducts.length
    ? recommendedProducts.map((product) => ({
        category: product.productType || product.label,
        reason: product.reason,
        suggestedBudget: capAfterPayables > 0 ? roundCurrency(Math.min(capAfterPayables, Math.max(product.probableUnitCost || 0, capAfterPayables * 0.7))) : null,
        confidence: product.confidence,
      })).slice(0, 3)
    : topCandidate
      ? [{
          category: topCandidate.category,
          reason: hasDemandWithoutCapital
            ? "Há demanda, mas falta capital seguro para comprar o SKU ideal agora."
            : productReason(topCandidate),
          suggestedBudget: null,
          confidence: topCandidate.confidence,
        }]
      : []

  const recommendedCost = recommendedBase ? candidateCost(recommendedBase) : 0
  const recommendedReinvestmentAmount = recommendedBase
    ? roundCurrency(Math.min(capAfterPayables, Math.max(recommendedCost, Math.min(capAfterPayables * 0.7, immediateCashRoom || capAfterPayables))))
    : 0
  const decision: ReinvestmentDecisionKind = capAfterPayables <= 0 || !topCandidate
    ? "do_not_reinvest"
    : recommendedBase && capAfterPayables >= recommendedCost * 1.5
      ? "reinvest_recommended"
      : recommendedBase
        ? "reinvest_with_cap"
        : "do_not_reinvest"
  const capitalStatus: ReinvestmentCapitalStatus = capAfterPayables <= 0
    ? "cash_tight"
    : recommendedBase
      ? "sku_slack"
      : hasDemandWithoutCapital
        ? "demand_without_safe_capital"
        : "financial_slack"
  const baseConfidence: ReinvestmentDecisionConfidence = recommendedBase?.confidence || topCandidate?.confidence || "low"
  const confidence = confidenceFromSignals({
    base: baseConfidence,
    receivablesDetailAvailable: windows.receivablesDetailAvailable,
    hasSmallSample,
  })
  const precisionWarnings = [
    !windows.receivablesDetailAvailable && windows.undatedReceivables > 0
      ? "Recebíveis sem vencimento detalhado foram usados apenas como contexto; a janela de liquidez ficou menos precisa."
      : null,
    hasSmallSample ? "Amostra histórica pequena: trate a recomendação como sinal comercial, não prova estatística." : null,
    hasDemandWithoutCapital ? "Há demanda para o SKU ideal, mas falta capital seguro para recompra direta agora." : null,
  ].filter(Boolean) as string[]
  const leads = leadContext(snapshot)
  const rationale = [
    `Base analisada: ${analysisWindow.label}${analysisWindow.salesCount > 0 ? ` (${analysisWindow.salesCount} ${analysisWindow.salesCount === 1 ? "venda" : "vendas"})` : ""}.`,
    `Caixa atual ${formatBrl(currentCash)}; reserva operacional ${formatBrl(operationalReserve)}; contas em 7 dias ${formatBrl(upcomingPayables)}.`,
    windows.receivablesDetailAvailable
      ? `Recebíveis até 3 dias ${formatBrl(windows.nearTermReceivables)}; recebíveis após 7 dias ${formatBrl(windows.futureReceivables)}.`
      : `Recebíveis agregados ${formatBrl(windows.undatedReceivables)}; sem vencimento detalhado para liberar janela de recompra.`,
    topCandidate
      ? `${topCandidate.label}: ${productReason(topCandidate)}.`
      : "Sem candidato comercial forte para recompra no snapshot atual.",
    leads.note,
  ]

  return {
    decision,
    confidence,
    capitalStatus,
    safeReinvestmentCap,
    theoreticalCap,
    capAfterPayables,
    recommendedReinvestmentAmount,
    preserveCashAmount,
    currentCash,
    nearTermReceivables: windows.nearTermReceivables,
    shortTermReceivables: windows.shortTermReceivables,
    futureReceivables: windows.futureReceivables,
    undatedReceivables: windows.undatedReceivables,
    receivablesDetailAvailable: windows.receivablesDetailAvailable,
    upcomingPayables,
    operationalReserve,
    rationale,
    precisionWarnings,
    recommendedAction: decision === "do_not_reinvest"
      ? hasDemandWithoutCapital
        ? "Não compre o SKU ideal agora; aguarde recebível, negocie custo ou escolha item de menor capital."
        : "Preserve caixa até existir teto seguro e candidato de recompra com margem/giro."
      : decision === "reinvest_recommended"
        ? "Recomprar de forma seletiva dentro do teto, priorizando giro e margem comprovados."
        : "Recomprar com teto pequeno e seletivo; não ampliar estoque de forma agressiva.",
    recommendedCategories,
    recommendedProducts,
    avoid,
    leadContext: leads,
    analysisWindow,
  }
}
