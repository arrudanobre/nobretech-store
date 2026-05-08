import type { OrionAnalysis, OrionInsight, OrionSnapshot } from "@/lib/orion/types"

// ─── Confidence Engine ──────────────────────────────────────────────────────
// Calculates confidence scores for insights based on data quality,
// quantity, and operational validity. Low-confidence insights should
// trigger validation instead of bold recommendations.

export type ConfidenceLevel = "high" | "medium" | "low"

export type InsightConfidence = {
  level: ConfidenceLevel
  score: number
  reason: string
}

/**
 * Determine confidence level from a numeric score.
 */
function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 0.7) return "high"
  if (score >= 0.4) return "medium"
  return "low"
}

/**
 * Calculate confidence for a stock-related insight.
 */
function stockInsightConfidence(snapshot: OrionSnapshot): InsightConfidence {
  let score = 0
  let factors = 0
  const reasons: string[] = []

  // Has active stock items
  factors++
  if (snapshot.stock.activeItems > 0) {
    score++
    reasons.push("estoque ativo presente")
  } else {
    reasons.push("sem estoque ativo")
  }

  // Has pricing data
  factors++
  const hasPrice = snapshot.stock.stuckItems.some(
    (item) => item.purchasePrice > 0 && item.suggestedPrice > 0
  )
  if (hasPrice) {
    score++
    reasons.push("preços cadastrados")
  } else {
    reasons.push("preços incompletos")
  }

  // Has enough items for meaningful analysis
  factors++
  if (snapshot.stock.activeItems >= 3) {
    score++
    reasons.push("volume suficiente")
  } else {
    reasons.push("volume limitado")
  }

  const finalScore = factors > 0 ? score / factors : 0
  return {
    level: scoreToLevel(finalScore),
    score: Math.round(finalScore * 100) / 100,
    reason: reasons.join("; "),
  }
}

/**
 * Calculate confidence for a financial insight.
 */
function financialInsightConfidence(snapshot: OrionSnapshot): InsightConfidence {
  let score = 0
  let factors = 0
  const reasons: string[] = []

  // Has reconciled cash balance
  factors++
  if (snapshot.finance.cashBalanceSource === "reconciled_balance_after") {
    score++
    reasons.push("saldo reconciliado")
  } else {
    score += 0.5
    reasons.push("saldo estimado pelas contas")
  }

  // Has sales data
  factors++
  if (snapshot.executive.sales30d > 0) {
    score++
    reasons.push("vendas recentes disponíveis")
  } else {
    reasons.push("sem vendas recentes")
  }

  // Has expense data
  factors++
  if (snapshot.finance.expenseCategories.length > 0) {
    score++
    reasons.push("despesas categorizadas")
  } else {
    reasons.push("sem categorização de despesas")
  }

  const finalScore = factors > 0 ? score / factors : 0
  return {
    level: scoreToLevel(finalScore),
    score: Math.round(finalScore * 100) / 100,
    reason: reasons.join("; "),
  }
}

/**
 * Calculate confidence for a CRM insight.
 */
function crmInsightConfidence(snapshot: OrionSnapshot): InsightConfidence {
  let score = 0
  let factors = 0
  const reasons: string[] = []

  // Has leads
  factors++
  if (snapshot.executive.leadsOpen > 0) {
    score++
    reasons.push("leads cadastrados")
  } else {
    reasons.push("sem leads no CRM")
  }

  // Has conversion data
  factors++
  if (snapshot.executive.conversionRate30d > 0) {
    score++
    reasons.push("taxa de conversão disponível")
  } else {
    score += 0.3
    reasons.push("taxa de conversão insuficiente")
  }

  const finalScore = factors > 0 ? score / factors : 0
  return {
    level: scoreToLevel(finalScore),
    score: Math.round(finalScore * 100) / 100,
    reason: reasons.join("; "),
  }
}

/**
 * Calculate confidence for a campaign insight.
 */
function campaignInsightConfidence(snapshot: OrionSnapshot): InsightConfidence {
  const hasCampaigns = snapshot.marketing.campaigns.length > 0
  const hasROI = snapshot.marketing.campaigns.some((c) => c.roi > 0)

  if (hasCampaigns && hasROI) {
    return { level: "high", score: 0.85, reason: "campanhas com ROI disponível" }
  }
  if (hasCampaigns) {
    return { level: "medium", score: 0.55, reason: "campanhas sem ROI claro" }
  }
  return { level: "low", score: 0.2, reason: "sem campanhas cadastradas" }
}

/**
 * Map an insight's category to a confidence calculator.
 */
function calculateInsightConfidence(
  insight: OrionInsight,
  snapshot: OrionSnapshot
): InsightConfidence {
  const normalizedCategory = (insight.category || "").toLowerCase()

  if (normalizedCategory.includes("estoque") || normalizedCategory.includes("inventory")) {
    return stockInsightConfidence(snapshot)
  }
  if (
    normalizedCategory.includes("financeiro") ||
    normalizedCategory.includes("caixa") ||
    normalizedCategory.includes("finance")
  ) {
    return financialInsightConfidence(snapshot)
  }
  if (normalizedCategory.includes("crm") || normalizedCategory.includes("comercial")) {
    return crmInsightConfidence(snapshot)
  }
  if (normalizedCategory.includes("campanha") || normalizedCategory.includes("marketing")) {
    return campaignInsightConfidence(snapshot)
  }

  // Default: moderate confidence
  return {
    level: "medium",
    score: 0.6,
    reason: "confiança moderada baseada nos dados disponíveis",
  }
}

/**
 * Enrich an insight with a calculated confidence score.
 */
function enrichInsightConfidence(
  insight: OrionInsight,
  snapshot: OrionSnapshot
): OrionInsight {
  const confidence = calculateInsightConfidence(insight, snapshot)
  return {
    ...insight,
    confidence_score: confidence.score,
  }
}

/**
 * Enrich all insights in an analysis with confidence scores.
 */
export function enrichAnalysisWithConfidence(
  analysis: OrionAnalysis,
  snapshot: OrionSnapshot
): OrionAnalysis {
  return {
    ...analysis,
    alerts: analysis.alerts.map((i) => enrichInsightConfidence(i, snapshot)),
    recommendations: analysis.recommendations.map((i) => enrichInsightConfidence(i, snapshot)),
    risks: analysis.risks.map((i) => enrichInsightConfidence(i, snapshot)),
    opportunities: analysis.opportunities.map((i) => enrichInsightConfidence(i, snapshot)),
    confidence_score: calculateOverallConfidence(snapshot),
  }
}

/**
 * Calculate overall analysis confidence based on data quality signals.
 */
function calculateOverallConfidence(snapshot: OrionSnapshot): number {
  let score = 0
  let factors = 0

  // Has sales data
  factors++
  if (snapshot.executive.sales30d > 0) score++

  // Has active stock
  factors++
  if (snapshot.stock.activeItems > 0) score++

  // Has reconciled balance
  factors++
  if (snapshot.finance.cashBalanceSource === "reconciled_balance_after") score++

  // Has leads
  factors++
  if (snapshot.executive.leadsOpen > 0) score++

  // Has campaigns
  factors++
  if (snapshot.marketing.campaigns.length > 0) score++

  return factors > 0 ? Math.round((score / factors) * 100) / 100 : 0.5
}

/**
 * Generate a low-confidence fallback message for the chat.
 */
export function lowConfidenceMessage(category: string): string {
  const normalized = (category || "").toLowerCase()
  if (normalized.includes("estoque")) {
    return "Não encontrei esse produto ativo no estoque operacional. Deseja revisar cadastro ou procurar outro item?"
  }
  if (normalized.includes("financeiro") || normalized.includes("caixa")) {
    return "Os dados financeiros estão incompletos para uma recomendação segura. Posso montar o cenário quando houver mais informações reconciliadas."
  }
  if (normalized.includes("crm")) {
    return "O CRM precisa de mais dados para uma análise confiável. Cadastre próxima ação e interesse do lead para eu decidir melhor."
  }
  return "Não encontrei dados suficientes para afirmar isso com segurança. Posso ajudar de outra forma?"
}
