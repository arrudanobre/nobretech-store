import type { OrionSnapshot } from "@/lib/orion/types"

export type OperationalHealthLevel = "critical" | "attention" | "stable" | "growth"

export type OperationalHealthScore = {
  score: number
  level: OperationalHealthLevel

  liquidityScore: number
  revenueScore: number
  inventoryScore: number
  conversionScore: number
  marginScore: number
  crmScore: number

  consolidatedBalance: number
  monthlyCashflowDelta: number
  operationalAvailableCash: number
  pendingReceivables: number

  healthReason: string
}

/**
 * Calculates a consolidated operational health score (0-100) and assigns a level.
 * Prevents isolated negative accounts from triggering a systemic crisis.
 */
export function calculateOperationalHealth(snapshot: OrionSnapshot): OperationalHealthScore {
  const { executive, finance, marketing } = snapshot

  // 1. Finance & Liquidity Setup
  const consolidatedBalance = finance.reconciledCashBalance
  const operationalAvailableCash = Math.max(0, consolidatedBalance)
  const pendingReceivables = executive.pendingReceivables
  // Approximate delta using revenue vs previous
  const monthlyCashflowDelta = executive.revenue30d - executive.revenuePrevious30d

  // 2. Score Components (out of 100 max per component initially)

  // Liquidity (Max 25 points - High Weight)
  let liquidityScore = 0
  if (consolidatedBalance >= 10000) liquidityScore = 25
  else if (consolidatedBalance >= 2000) liquidityScore = 20
  else if (consolidatedBalance > 0) liquidityScore = 15

  // Revenue (Max 30 points - High Weight)
  let revenueScore = 0
  if (executive.revenue30d >= 40000) revenueScore = 30
  else if (executive.revenue30d >= 20000) revenueScore = 20
  else if (executive.revenue30d >= 10000) revenueScore = 10
  else if (executive.revenue30d > 0) revenueScore = 5

  // Receivables (Max 15 points - Medium-High Weight)
  let conversionScore = 0
  if (pendingReceivables >= 10000) conversionScore = 15
  else if (pendingReceivables >= 5000) conversionScore = 10
  else if (pendingReceivables > 0) conversionScore = 5

  // Active Inventory (Max 10 points - Medium Weight, not liquid cash)
  let inventoryScore = 0
  if (executive.activeStockValue >= 30000) inventoryScore = 10
  else if (executive.activeStockValue >= 10000) inventoryScore = 5

  // CRM / Conversion (Max 10 points)
  let crmScore = 0
  if (marketing.forgottenLeads.length === 0) crmScore = 10
  else if (marketing.forgottenLeads.length <= 5) crmScore = 5

  // Margin (Max 10 points)
  let marginScore = 0
  if (executive.marginPct30d >= 15) marginScore = 10
  else if (executive.marginPct30d >= 5) marginScore = 5

  // Penalties
  let penalty = 0
  if (snapshot.stock.stuckItems.length >= 5) penalty += 10 // Medium penalty
  else if (snapshot.stock.stuckItems.length >= 2) penalty += 5

  if (consolidatedBalance < 0) {
    penalty += 15 // Medium penalty
  }

  if (monthlyCashflowDelta < 0) {
    penalty += 5 // Low penalty
  }

  // Regra 3 & 4 — Pressure Window Penalties
  const { pressureWindowStartDays, overduePayables, overdueReceivables } = executive.liquidityForecast
  const overdueGap = Math.max(0, overduePayables - overdueReceivables)
  if (overdueGap > 0) {
    penalty += overdueGap > 5000 ? 20 : 10
  }
  if (pressureWindowStartDays !== null) {
    if (pressureWindowStartDays === 0) {
      penalty += 20 // Immediate pressure from overdue/today obligations
    } else if (pressureWindowStartDays <= 7) {
      penalty += 20 // High pressure
    } else if (pressureWindowStartDays <= 15) {
      penalty += 10 // Medium pressure
    }
  }

  // Cash gap vs future payables
  if (executive.liquidityForecast.payables7d + overduePayables > consolidatedBalance + executive.liquidityForecast.receivables7d + overdueReceivables) {
    penalty += 10
  }

  // Total Score (0-100)
  const baseScore = liquidityScore + revenueScore + inventoryScore + conversionScore + marginScore + crmScore
  const totalScore = Math.min(100, Math.max(0, baseScore - penalty))

  // Determine Level
  let level: OperationalHealthLevel = "growth"
  if (totalScore <= 20) level = "critical"
  else if (totalScore <= 45) level = "attention"
  else if (totalScore <= 70) level = "stable"
  else level = "growth"

  // Build the healthReason
  let reason = ""
  if (level === "critical") {
    reason = overdueGap > 0
      ? `Ajuste imediato: vencimentos pendentes pressionam liquidez e exigem foco em recebimento, controle de custos e capital de giro.`
      : `Ajuste imediato: Déficit de liquidez exige controle de custos e foco em capital de giro.`
  } else if (level === "attention") {
    const strengths = []
    if (revenueScore >= 10) strengths.push("receita recente")
    if (marginScore > 0) strengths.push("margem positiva")
    if (inventoryScore > 0) strengths.push("estoque saudável")
    if (conversionScore >= 5) strengths.push("recebíveis futuros")

    const sustentation = strengths.length > 0 ? ` sustentada por ${strengths.join(", ")}` : " a operação segue rodando"
    reason = `Liquidez operacional exige atenção moderada, mas${sustentation}.`
  } else if (level === "stable") {
    reason = `Operação estável: A estrutura de giro mantém o negócio saudável sem gargalos graves.`
  } else {
    reason = `Crescimento pragmático: Receita sólida, caixa protegido e conversão sustentável.`
  }

  // Final refinements to the reason based on pressure window
  if (pressureWindowStartDays !== null && pressureWindowStartDays <= 15 && level !== "critical") {
    reason += pressureWindowStartDays === 0
      ? " Existe uma pressão de caixa imediata por vencimentos pendentes."
      : ` Existe uma janela de pressão de caixa prevista para daqui a ${pressureWindowStartDays} dias.`
  }

  return {
    score: totalScore,
    level,
    liquidityScore,
    revenueScore,
    inventoryScore,
    conversionScore,
    marginScore,
    crmScore,
    consolidatedBalance,
    monthlyCashflowDelta,
    operationalAvailableCash,
    pendingReceivables,
    healthReason: reason,
  }
}
