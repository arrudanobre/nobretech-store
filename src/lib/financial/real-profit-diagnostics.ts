import type { RealProfitAnalysis, RealProfitSnapshot } from "./real-profit-engine"

export type RealProfitIssueReason =
  | "real_loss"
  | "duplicated_fee"
  | "missing_cost"
  | "aggressive_warranty_reserve"
  | "misclassified_bonus_or_upsell"
  | "wrong_revenue_source"
  | "trade_in_cash_downgrade"
  | "low_margin_sale"

export type RealProfitDiagnosticSale = {
  saleId: string
  saleLabel?: string | null
  grossRevenue: number
  cashReceived: number
  tradeInCredit: number
  inventoryCost: number
  futureInventoryValue: number
  accessoryCost: number
  bonusCost: number
  warrantyReserveCost: number
  optionalWarrantyReserveRecommendation: number
  warrantyReserveAdvisory: string | null
  warrantyReserveWouldConsumeProfit: boolean
  rawPaymentFeeCost: number
  effectivePaymentFeeCost: number
  paymentFeeResponsibility: RealProfitAnalysis["paymentFeeResponsibility"]
  paymentFeeShouldAffectProfit: boolean
  feeIgnoredFromProfit: boolean
  feeModelConfidence: RealProfitAnalysis["feeModelConfidence"]
  paymentFeeCost: number
  operationalCost: number
  availableProfit: number
  operationalProfit: number
  operationalProfitBeforeReserve: number
  operationalProfitAfterReserve: number
  operationalMarginPct: number
  profitabilityLevel: RealProfitAnalysis["profitabilityLevel"]
  probableReason: RealProfitIssueReason
  reasoning: string[]
}

export type RealProfitDiagnostics = {
  realLossSales: RealProfitDiagnosticSale[]
  negativeSales: RealProfitDiagnosticSale[]
  lowMarginSales: RealProfitDiagnosticSale[]
  warrantyReserveAdvisorySales: RealProfitDiagnosticSale[]
  tradeInSales: RealProfitDiagnosticSale[]
  tradeInDowngrades: RealProfitDiagnosticSale[]
}

function probableReason(sale: RealProfitAnalysis): RealProfitIssueReason {
  if (sale.cashReceived < 0 && sale.tradeInCredit > 0) return "trade_in_cash_downgrade"
  if (sale.inventoryCost <= 0) return "missing_cost"
  if (sale.warrantyReserveWouldConsumeProfit) return "aggressive_warranty_reserve"
  if (sale.effectivePaymentFeeCost > Math.max(0, sale.grossRevenue * 0.2)) return "duplicated_fee"
  if (sale.grossRevenue <= 0 && sale.cashReceived > 0) return "wrong_revenue_source"
  if (sale.bonusCost > sale.grossRevenue * 0.25 || sale.accessoryCost > sale.grossRevenue * 0.5) return "misclassified_bonus_or_upsell"
  if (sale.operationalProfit >= 0 && sale.profitabilityLevel === "low") return "low_margin_sale"
  return "real_loss"
}

function diagnosticSale(sale: RealProfitAnalysis): RealProfitDiagnosticSale {
  return {
    saleId: sale.saleId,
    saleLabel: sale.saleLabel,
    grossRevenue: sale.grossRevenue,
    cashReceived: sale.cashReceived,
    tradeInCredit: sale.tradeInCredit,
    inventoryCost: sale.inventoryCost,
    futureInventoryValue: sale.futureInventoryValue,
    accessoryCost: sale.accessoryCost,
    bonusCost: sale.bonusCost,
    warrantyReserveCost: sale.warrantyReserveCost,
    optionalWarrantyReserveRecommendation: sale.optionalWarrantyReserveRecommendation,
    warrantyReserveAdvisory: sale.warrantyReserveAdvisory,
    warrantyReserveWouldConsumeProfit: sale.warrantyReserveWouldConsumeProfit,
    rawPaymentFeeCost: sale.rawPaymentFeeCost,
    effectivePaymentFeeCost: sale.effectivePaymentFeeCost,
    paymentFeeResponsibility: sale.paymentFeeResponsibility,
    paymentFeeShouldAffectProfit: sale.paymentFeeShouldAffectProfit,
    feeIgnoredFromProfit: sale.feeIgnoredFromProfit,
    feeModelConfidence: sale.feeModelConfidence,
    paymentFeeCost: sale.paymentFeeCost,
    operationalCost: sale.operationalCost,
    availableProfit: sale.availableProfit,
    operationalProfit: sale.operationalProfit,
    operationalProfitBeforeReserve: sale.operationalProfitBeforeReserve,
    operationalProfitAfterReserve: sale.operationalProfitAfterReserve,
    operationalMarginPct: sale.operationalMarginPct,
    profitabilityLevel: sale.profitabilityLevel,
    probableReason: probableReason(sale),
    reasoning: sale.reasoning,
  }
}

export function buildRealProfitDiagnostics(snapshot: RealProfitSnapshot): RealProfitDiagnostics {
  const tradeInDowngrades = snapshot.sales
    .filter((sale) => sale.tradeInCredit > 0 && sale.cashReceived < 0)
    .map(diagnosticSale)
  const realLossSales = snapshot.sales
    .filter((sale) => sale.profitabilityLevel === "negative" && !(sale.tradeInCredit > 0 && sale.cashReceived < 0))
    .map(diagnosticSale)

  return {
    realLossSales,
    negativeSales: realLossSales,
    lowMarginSales: snapshot.sales
      .filter((sale) => sale.profitabilityLevel === "low" && !(sale.tradeInCredit > 0 && sale.cashReceived < 0))
      .map(diagnosticSale),
    warrantyReserveAdvisorySales: snapshot.sales
      .filter((sale) => sale.warrantyReserveWouldConsumeProfit)
      .map(diagnosticSale),
    tradeInSales: snapshot.sales
      .filter((sale) => sale.tradeInCredit > 0 && sale.cashReceived >= 0)
      .map(diagnosticSale),
    tradeInDowngrades,
  }
}
