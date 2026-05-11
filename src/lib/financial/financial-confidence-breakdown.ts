import type { FinancialSafetyAuditBreakdown } from "./financial-safety-audit"
import type { FinancialScenarioSnapshot } from "./financial-scenario-separation"
import type { InventoryLiquidityQuality } from "./inventory-liquidity-quality"
import type { RealProfitSnapshot } from "./real-profit-engine"

export type FinancialConfidenceLevel = "low" | "medium" | "high"

export type FinancialConfidenceBreakdown = {
  structuralConfidence: number
  liquidityConfidence: number
  projectionConfidence: number
  inventoryConfidence: number
  auditConfidence: number
  consistencyConfidence: number
  overallConfidence: number
  level: FinancialConfidenceLevel
  warnings: string[]
  reasoning: string[]
}

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function level(score: number): FinancialConfidenceLevel {
  if (score >= 0.75) return "high"
  if (score >= 0.45) return "medium"
  return "low"
}

function auditScore(audit?: FinancialSafetyAuditBreakdown | null) {
  if (!audit) return 0.7
  if (audit.confidence === "high") return 0.95
  if (audit.confidence === "medium") return 0.75
  return 0.45
}

export function buildFinancialConfidenceBreakdown(input: {
  financialScenario?: FinancialScenarioSnapshot | null
  inventoryLiquidityQuality?: InventoryLiquidityQuality | null
  financialSafetyAudit?: FinancialSafetyAuditBreakdown | null
  realProfitSnapshot?: RealProfitSnapshot | null
  staleAccountBalance?: boolean | null
  ledgerVsAccountDiff?: number | null
  pendingReceivables?: number | null
  pendingPayables?: number | null
}): FinancialConfidenceBreakdown {
  const warnings: string[] = []
  const reasoning: string[] = []
  const inventory = input.inventoryLiquidityQuality || null
  const scenario = input.financialScenario || null
  const realProfit = input.realProfitSnapshot || null
  const hasUnknownFeeModel = Boolean(realProfit?.sales.some((sale) => sale.feeModelConfidence === "low" && sale.rawPaymentFeeCost > 0))

  const structuralConfidence = realProfit && realProfit.sales.length > 0 ? 0.9 : 0.55
  const liquidityConfidence = input.staleAccountBalance ? 0.45 : 0.9
  const projectionConfidence = scenario?.scenarioConfidence === "high" ? 0.88 : scenario?.scenarioConfidence === "medium" ? 0.68 : 0.45
  const inventoryConfidence = inventory?.inventoryQuality === "stressed"
    ? 0.45
    : inventory?.inventoryQuality === "attention"
      ? 0.76
      : inventory?.inventoryQuality === "healthy"
        ? 0.9
        : 0.65
  const auditConfidence = auditScore(input.financialSafetyAudit)
  const consistencyConfidence = input.staleAccountBalance || Math.abs(Number(input.ledgerVsAccountDiff || 0)) > 1 || hasUnknownFeeModel
    ? 0.45
    : 0.9

  if (inventory?.inventoryQuality === "healthy") reasoning.push("Estoque premium saudável não reduz confiança apenas por ser maior que o caixa.")
  if (Number(input.pendingReceivables || 0) > 0) reasoning.push("Recebíveis normais entram como projeção, não reduzem confiança da liquidez realizada.")
  if (realProfit?.sales.some((sale) => sale.feeIgnoredFromProfit)) reasoning.push("Taxa absorvida pelo cliente não reduz confiança financeira nem lucro operacional.")
  if ((realProfit?.negativeSales.length || 0) > 0) warnings.push("Há prejuízo real rastreado em venda concluída.")
  if (hasUnknownFeeModel) warnings.push("Há taxa com responsabilidade desconhecida; confiança reduzida.")
  if (inventory?.inventoryQuality === "stressed") warnings.push("Aging alto com margem baixa e baixa liquidez reduz confiança.")
  if (input.staleAccountBalance) warnings.push("Ledger e cache de conta divergem; confiança de consistência reduzida.")

  const scores = [
    structuralConfidence,
    liquidityConfidence,
    projectionConfidence,
    inventoryConfidence,
    auditConfidence,
    consistencyConfidence,
  ]
  const overallConfidence = round(clamp(scores.reduce((sum, score) => sum + score, 0) / scores.length))

  return {
    structuralConfidence: round(structuralConfidence),
    liquidityConfidence: round(liquidityConfidence),
    projectionConfidence: round(projectionConfidence),
    inventoryConfidence: round(inventoryConfidence),
    auditConfidence: round(auditConfidence),
    consistencyConfidence: round(consistencyConfidence),
    overallConfidence,
    level: level(overallConfidence),
    warnings,
    reasoning,
  }
}
