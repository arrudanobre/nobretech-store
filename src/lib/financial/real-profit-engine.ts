import { buildFeeModelAudit, type FeeModelAuditBreakdown, type FeeModelAuditTransactionInput, type FeeResponsibility } from "./fee-model-audit"

export type ProfitabilityLevel = "negative" | "low" | "healthy" | "excellent"
export type RealProfitRevenueSource = "sale_payments" | "sale_price"
export type RealProfitLiquidityQuality = "low" | "medium" | "high"

export type RealProfitPaymentInput = {
  id?: string | null
  paymentMethod?: string | null
  amount?: number | string | null
  status?: string | null
  isFinancial?: boolean | null
}

export type NegativeSaleEvidence = {
  saleId: string
  saleLabel?: string | null
  productName?: string | null
  operationalProfit: number
  reason: string
}

export type RealProfitItemInput = {
  id?: string | null
  type: "main" | "upsell" | "free"
  salePrice?: number | string | null
  cost?: number | string | null
  quantity?: number | string | null
  daysInStock?: number | string | null
  liquidityQuality?: RealProfitLiquidityQuality | null
  costStructured?: boolean | null
}

export type RealProfitSaleInput = {
  saleId: string
  saleLabel?: string | null
  salePrice?: number | string | null
  netAmount?: number | string | null
  warrantyMonths?: number | string | null
  mainItem?: Omit<RealProfitItemInput, "type"> | null
  additionalItems?: Array<Omit<RealProfitItemInput, "type"> & { type: "upsell" | "free" }>
  payments?: RealProfitPaymentInput[]
  settings?: Record<string, unknown> | null
  operationalCosts?: Array<{ amount?: number | string | null; status?: string | null; linked?: boolean | null }>
  feeTransactions?: FeeModelAuditTransactionInput[]
  feeAudit?: Partial<FeeModelAuditBreakdown> | null
  tradeIn?: {
    creditAmount?: number | string | null
    linkedInventoryId?: string | null
    expectedResaleValue?: number | string | null
  } | null
}

export type RealProfitAnalysis = {
  saleId: string
  saleLabel?: string | null
  revenueSource: RealProfitRevenueSource
  grossRevenue: number
  economicRevenue: number
  cashReceived: number
  tradeInCredit: number
  futureInventoryValue: number
  netRevenue: number
  inventoryCost: number
  accessoryCost: number
  bonusCost: number
  warrantyReserveCost: number
  optionalWarrantyReserveRecommendation: number
  warrantyReserveAdvisory: string | null
  warrantyReserveWouldConsumeProfit: boolean
  rawPaymentFeeCost: number
  effectivePaymentFeeCost: number
  paymentFeeResponsibility: FeeResponsibility
  paymentFeeShouldAffectProfit: boolean
  feeIgnoredFromProfit: boolean
  feeModelConfidence: "low" | "medium" | "high"
  paymentFeeCost: number
  operationalCost: number
  totalCost: number
  grossProfit: number
  operationalProfitBeforeReserve: number
  operationalProfitAfterReserve: number
  profitAfterOptionalWarrantyReserve: number
  operationalProfit: number
  protectedCapital: number
  availableProfit: number
  grossMarginPct: number
  operationalMarginPct: number
  profitabilityLevel: ProfitabilityLevel
  recompositionRequired: boolean
  safeWithdrawalAmount: number
  safeReinvestmentAmount: number
  inventoryPressure: "low" | "medium" | "high"
  lowMarginWarnings: string[]
  reasoning: string[]
}

export type RealProfitSnapshot = {
  generatedAt: string
  sales: RealProfitAnalysis[]
  totals: {
    grossRevenue: number
    netRevenue: number
    protectedCapital: number
    availableProfit: number
    operationalProfit: number
    rawPaymentFeeCost: number
    effectivePaymentFeeCost: number
    paymentFeeCost: number
    warrantyReserveCost: number
    optionalWarrantyReserveRecommendation: number
    totalCost: number
    safeWithdrawalAmount: number
    safeReinvestmentAmount: number
    realizedProfitFromSales: number
    projectedProfitFromActiveInventory: number
    potentialProfitFromInventory: number
  }
  realProfitability: {
    averageOperationalMarginPct: number
    profitabilityLevel: ProfitabilityLevel
    negativeSalesCount: number
    lowMarginSalesCount: number
    warrantyReserveAdvisoryCount: number
  }
  protectedCapital: number
  availableProfit: number
  realizedProfitFromSales: number
  projectedProfitFromActiveInventory: number
  potentialProfitFromInventory: number
  negativeSales: NegativeSaleEvidence[]
  warrantyReserveAdvisorySales: NegativeSaleEvidence[]
  inventoryPressure: "low" | "medium" | "high"
  lowMarginWarnings: string[]
  reasoning: string[]
}

const WARRANTY_RESERVE = {
  basePct: 0.02,
  longWarrantyExtraPct: 0.01,
  lowLiquidityExtraPct: 0.015,
  minimum: 50,
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function pct(part: number, total: number) {
  if (total <= 0) return 0
  return roundCurrency((part / total) * 100)
}

function activePayments(payments: RealProfitPaymentInput[]) {
  return payments.filter((payment) => payment.status !== "cancelled")
}

function isTradeInPayment(payment: RealProfitPaymentInput) {
  return payment.isFinancial === false || payment.paymentMethod === "trade_in_credit"
}

function itemTotalCost(item?: RealProfitItemInput | null) {
  if (!item) return 0
  return roundCurrency(Math.max(0, number(item.cost)) * Math.max(1, number(item.quantity) || 1))
}

function missingCostReasoning(item: RealProfitItemInput | null | undefined, label: string) {
  if (!item) return [`${label}: custo estruturado ausente; custo tratado como 0 sem estimativa.`]
  if (item.costStructured === false || number(item.cost) <= 0) {
    return [`${label}: custo estruturado ausente ou zerado; custo tratado como 0 sem estimativa.`]
  }
  return []
}

function warrantyReserve(input: RealProfitSaleInput, protectedBaseCost: number, inventoryPressure: "low" | "medium" | "high") {
  const months = number(input.warrantyMonths)
  if (months <= 0 || protectedBaseCost <= 0) return 0
  let reservePct = WARRANTY_RESERVE.basePct
  if (months > 3) reservePct += WARRANTY_RESERVE.longWarrantyExtraPct
  if (inventoryPressure === "high") reservePct += WARRANTY_RESERVE.lowLiquidityExtraPct
  return roundCurrency(Math.max(WARRANTY_RESERVE.minimum, protectedBaseCost * reservePct))
}

function itemPressure(items: Array<RealProfitItemInput | null | undefined>) {
  let highSignals = 0
  let mediumSignals = 0
  for (const item of items) {
    if (!item) continue
    if (item.liquidityQuality === "low" || number(item.daysInStock) >= 60) highSignals += 1
    else if (item.liquidityQuality === "medium" || number(item.daysInStock) >= 30) mediumSignals += 1
  }
  if (highSignals > 0) return "high" as const
  if (mediumSignals > 0) return "medium" as const
  return "low" as const
}

function profitabilityLevel(marginPct: number): ProfitabilityLevel {
  if (marginPct < 0) return "negative"
  if (marginPct < 8) return "low"
  if (marginPct < 22) return "healthy"
  return "excellent"
}

function effectiveFeeFromAudit(audit: FeeModelAuditBreakdown) {
  if (!audit.paymentFeeShouldAffectProfit) return 0
  return roundCurrency(number(audit.profitImpactingFeeCost))
}

function feeConfidence(audit: FeeModelAuditBreakdown): "low" | "medium" | "high" {
  if (audit.feeResponsibility === "unknown_fee_model" || audit.feeDuplicated) return "low"
  if (audit.feeResponsibility === "mixed_fee_model") return "medium"
  return "high"
}

function revenueFrom(input: RealProfitSaleInput) {
  const payments = activePayments(input.payments || [])
  if (payments.length) {
    const economicValue = roundCurrency(payments.reduce((sum, payment) => sum + number(payment.amount), 0))
    return {
      source: "sale_payments" as const,
      value: economicValue > 0 ? economicValue : roundCurrency(number(input.salePrice)),
      payments,
    }
  }
  return {
    source: "sale_price" as const,
    value: roundCurrency(number(input.salePrice)),
    payments,
  }
}

export function buildRealProfitAnalysis(input: RealProfitSaleInput): RealProfitAnalysis {
  const reasoning: string[] = []
  const additionalItems = input.additionalItems || []
  const mainItem = input.mainItem ? { ...input.mainItem, type: "main" as const } : null
  const upsells = additionalItems.filter((item) => item.type === "upsell")
  const bonuses = additionalItems.filter((item) => item.type === "free")
  const revenue = revenueFrom(input)
  const activePaymentRows = activePayments(input.payments || [])
  const tradeInCreditFromPayments = roundCurrency(activePaymentRows
    .filter(isTradeInPayment)
    .reduce((sum, payment) => sum + Math.max(0, number(payment.amount)), 0))
  const tradeInCredit = roundCurrency(Math.max(tradeInCreditFromPayments, number(input.tradeIn?.creditAmount)))
  const cashReceived = activePaymentRows.length
    ? roundCurrency(activePaymentRows
      .filter((payment) => !isTradeInPayment(payment))
      .reduce((sum, payment) => sum + number(payment.amount), 0))
    : roundCurrency(number(input.salePrice) - tradeInCredit)
  const futureInventoryValue = input.tradeIn?.linkedInventoryId ? tradeInCredit : 0

  reasoning.push(
    revenue.source === "sale_payments"
      ? "Receita principal definida pela soma de sale_payments não cancelados; sales.sale_price não foi somado para evitar duplicidade."
      : "Receita principal definida por sales.sale_price porque não há sale_payments ativos."
  )
  if (number(input.netAmount) > 0) {
    reasoning.push("sales.net_amount usado apenas como referência de receita líquida/valor recebido; nunca como lucro.")
  }

  const inventoryCost = itemTotalCost(mainItem)
  const accessoryCost = roundCurrency(upsells.reduce((sum, item) => sum + itemTotalCost(item), 0))
  const bonusCost = roundCurrency(bonuses.reduce((sum, item) => sum + itemTotalCost(item), 0))
  const operationalCost = roundCurrency((input.operationalCosts || [])
    .filter((cost) => cost.status !== "cancelled" && cost.linked !== false)
    .reduce((sum, cost) => sum + Math.max(0, number(cost.amount)), 0))
  const pressure = itemPressure([mainItem, ...additionalItems])
  const protectedWithoutWarranty = roundCurrency(inventoryCost + accessoryCost + bonusCost)
  const grossRevenue = revenue.value
  const computedFeeAudit = buildFeeModelAudit({
    saleId: input.saleId,
    salePrice: input.salePrice ?? grossRevenue,
    grossRevenue,
    netAmount: input.netAmount,
    inventoryCost,
    accessoryCost,
    bonusCost,
    operationalCost,
    tradeInCredit,
    payments: revenue.payments.map((payment) => ({
      id: payment.id,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      status: payment.status,
      isFinancial: payment.isFinancial,
    })),
    transactions: input.feeTransactions || [],
    settings: input.settings,
  })
  const feeAudit = {
    ...computedFeeAudit,
    ...input.feeAudit,
  } as FeeModelAuditBreakdown
  const rawPaymentFeeCost = roundCurrency(number(feeAudit.paymentFeeCost))
  const effectivePaymentFeeCost = effectiveFeeFromAudit(feeAudit)
  const paymentFeeResponsibility = feeAudit.feeResponsibility
  const paymentFeeShouldAffectProfit = Boolean(feeAudit.paymentFeeShouldAffectProfit)
  const feeIgnoredFromProfit = rawPaymentFeeCost > 0 && effectivePaymentFeeCost === 0
  const feeModelConfidence = feeConfidence(feeAudit)
  const hasFeeEvidence = rawPaymentFeeCost > 0 || number(feeAudit.transactionFees) > 0 || number(feeAudit.unexplainedGrossVsNetDiff) > 0
  const optionalWarrantyReserveRecommendation = warrantyReserve(input, protectedWithoutWarranty, pressure)
  const warrantyReserveCost = optionalWarrantyReserveRecommendation
  const protectedCapital = protectedWithoutWarranty
  const totalCost = roundCurrency(protectedCapital + effectivePaymentFeeCost + operationalCost)
  const economicRevenue = grossRevenue
  const netRevenue = roundCurrency(grossRevenue - effectivePaymentFeeCost)
  const grossProfit = roundCurrency(grossRevenue - inventoryCost - accessoryCost - bonusCost)
  const operationalProfitBeforeReserve = roundCurrency(grossRevenue - inventoryCost - accessoryCost - bonusCost - effectivePaymentFeeCost - operationalCost)
  const operationalProfitAfterReserve = roundCurrency(operationalProfitBeforeReserve - optionalWarrantyReserveRecommendation)
  const profitAfterOptionalWarrantyReserve = operationalProfitAfterReserve
  const operationalProfit = operationalProfitBeforeReserve
  const availableProfit = roundCurrency(Math.max(0, operationalProfit))
  const grossMarginPct = pct(grossProfit, grossRevenue)
  const operationalMarginPct = pct(operationalProfit, grossRevenue)
  const level = profitabilityLevel(operationalMarginPct)
  const warrantyReserveWouldConsumeProfit = operationalProfit >= 0 && profitAfterOptionalWarrantyReserve < 0
  const warrantyReserveAdvisory = optionalWarrantyReserveRecommendation > 0
    ? warrantyReserveWouldConsumeProfit
      ? "Reserva recomendada de garantia consumiria o lucro desta venda; tratar como alerta gerencial, não prejuízo real."
      : "Reserva recomendada de garantia calculada como alerta gerencial opcional."
    : null
  const lowMarginWarnings: string[] = []

  reasoning.push(...missingCostReasoning(mainItem, "Produto principal"))
  for (const item of upsells) reasoning.push(...missingCostReasoning(item, `Upsell ${item.id || "sem id"}`))
  for (const item of bonuses) reasoning.push(...missingCostReasoning(item, `Brinde ${item.id || "sem id"}`))
  if (input.tradeIn?.creditAmount) {
    reasoning.push("Trade-in tratado como pagamento não financeiro e não como desconto simples.")
    if (cashReceived < 0) {
      reasoning.push("Houve saída líquida de caixa por diferença de troca, mas aquisição de ativo futuro compensatório.")
    }
    if (input.tradeIn.linkedInventoryId) {
      reasoning.push("Trade-in possui inventory vinculado para recomposição/revenda futura.")
    }
  }
  if (operationalCost === 0) {
    reasoning.push("Sem custo operacional vinculado à venda; custo operacional tratado como 0 sem rateio.")
  }
  if (optionalWarrantyReserveRecommendation > 0) {
    reasoning.push("Reserva de garantia calculada como recomendação gerencial opcional; não reduz lucro real, liquidez, retirada ou reinvestimento seguro.")
  }
  if (feeIgnoredFromProfit) {
    reasoning.push("Taxa de pagamento auditada como absorvida pelo cliente; registrada como telemetria, sem reduzir lucro operacional da loja.")
  }
  if (paymentFeeResponsibility === "unknown_fee_model" && hasFeeEvidence) {
    reasoning.push("unknown_fee_model_confidence_low: responsabilidade da taxa não comprovada por dados estruturados; não deduzida automaticamente do lucro.")
  }

  if (level === "negative") lowMarginWarnings.push("Venda com lucro operacional negativo.")
  if (level === "low") lowMarginWarnings.push("Venda com margem operacional baixa.")
  if (paymentFeeResponsibility === "unknown_fee_model" && hasFeeEvidence) lowMarginWarnings.push("unknown_fee_model_confidence_low")
  if (warrantyReserveWouldConsumeProfit) lowMarginWarnings.push("Reserva recomendada de garantia consumiria lucro, mas não caracteriza prejuízo real.")
  if (pressure === "high") lowMarginWarnings.push("Produto com baixa liquidez ou muitos dias em estoque afeta qualidade do lucro.")

  return {
    saleId: input.saleId,
    saleLabel: input.saleLabel || null,
    revenueSource: revenue.source,
    grossRevenue,
    economicRevenue,
    cashReceived,
    tradeInCredit,
    futureInventoryValue,
    netRevenue,
    inventoryCost,
    accessoryCost,
    bonusCost,
    warrantyReserveCost,
    optionalWarrantyReserveRecommendation,
    warrantyReserveAdvisory,
    warrantyReserveWouldConsumeProfit,
    rawPaymentFeeCost,
    effectivePaymentFeeCost,
    paymentFeeResponsibility,
    paymentFeeShouldAffectProfit,
    feeIgnoredFromProfit,
    feeModelConfidence,
    paymentFeeCost: effectivePaymentFeeCost,
    operationalCost,
    totalCost,
    grossProfit,
    operationalProfitBeforeReserve,
    operationalProfitAfterReserve,
    profitAfterOptionalWarrantyReserve,
    operationalProfit,
    protectedCapital,
    availableProfit,
    grossMarginPct,
    operationalMarginPct,
    profitabilityLevel: level,
    recompositionRequired: protectedCapital > 0,
    safeWithdrawalAmount: availableProfit,
    safeReinvestmentAmount: availableProfit,
    inventoryPressure: pressure,
    lowMarginWarnings,
    reasoning,
  }
}

function combinedPressure(analyses: RealProfitAnalysis[]) {
  if (analyses.some((item) => item.inventoryPressure === "high")) return "high" as const
  if (analyses.some((item) => item.inventoryPressure === "medium")) return "medium" as const
  return "low" as const
}

export function buildRealProfitSnapshot(input: { sales: RealProfitSaleInput[] }): RealProfitSnapshot {
  const sales = input.sales.map(buildRealProfitAnalysis)
  const totalGrossRevenue = roundCurrency(sales.reduce((sum, sale) => sum + sale.grossRevenue, 0))
  const totalOperationalProfit = roundCurrency(sales.reduce((sum, sale) => sum + sale.operationalProfit, 0))
  const averageOperationalMarginPct = pct(totalOperationalProfit, totalGrossRevenue)
  const negativeSalesCount = sales.filter((sale) => sale.profitabilityLevel === "negative").length
  const lowMarginSalesCount = sales.filter((sale) => sale.profitabilityLevel === "low").length
  const warrantyReserveAdvisorySales = sales
    .filter((sale) => sale.warrantyReserveWouldConsumeProfit)
    .map((sale) => ({
      saleId: sale.saleId,
      saleLabel: sale.saleLabel,
      productName: sale.saleLabel,
      operationalProfit: sale.operationalProfit,
      reason: sale.warrantyReserveAdvisory || "Reserva recomendada de garantia consumiria lucro, sem caracterizar prejuízo real.",
    }))
  const aggregateLevel = profitabilityLevel(averageOperationalMarginPct)
  const lowMarginWarnings = Array.from(new Set(sales.flatMap((sale) => sale.lowMarginWarnings)))
  const reasoning = Array.from(new Set(sales.flatMap((sale) => sale.reasoning))).slice(0, 12)
  const negativeSales = sales
    .filter((sale) => sale.profitabilityLevel === "negative")
    .map((sale) => ({
      saleId: sale.saleId,
      saleLabel: sale.saleLabel,
      productName: sale.saleLabel,
      operationalProfit: sale.operationalProfit,
      reason: sale.reasoning.find((line) => line.includes("custo estruturado ausente")) || sale.lowMarginWarnings[0] || "Lucro operacional negativo rastreado pela Real Profit Engine.",
    }))

  const totals = {
    grossRevenue: totalGrossRevenue,
    netRevenue: roundCurrency(sales.reduce((sum, sale) => sum + sale.netRevenue, 0)),
    protectedCapital: roundCurrency(sales.reduce((sum, sale) => sum + sale.protectedCapital, 0)),
    availableProfit: roundCurrency(sales.reduce((sum, sale) => sum + sale.availableProfit, 0)),
    operationalProfit: totalOperationalProfit,
    rawPaymentFeeCost: roundCurrency(sales.reduce((sum, sale) => sum + sale.rawPaymentFeeCost, 0)),
    effectivePaymentFeeCost: roundCurrency(sales.reduce((sum, sale) => sum + sale.effectivePaymentFeeCost, 0)),
    paymentFeeCost: roundCurrency(sales.reduce((sum, sale) => sum + sale.paymentFeeCost, 0)),
    warrantyReserveCost: roundCurrency(sales.reduce((sum, sale) => sum + sale.warrantyReserveCost, 0)),
    optionalWarrantyReserveRecommendation: roundCurrency(sales.reduce((sum, sale) => sum + sale.optionalWarrantyReserveRecommendation, 0)),
    totalCost: roundCurrency(sales.reduce((sum, sale) => sum + sale.totalCost, 0)),
    safeWithdrawalAmount: roundCurrency(sales.reduce((sum, sale) => sum + sale.safeWithdrawalAmount, 0)),
    safeReinvestmentAmount: roundCurrency(sales.reduce((sum, sale) => sum + sale.safeReinvestmentAmount, 0)),
    realizedProfitFromSales: roundCurrency(sales.reduce((sum, sale) => sum + sale.operationalProfit, 0)),
    projectedProfitFromActiveInventory: 0,
    potentialProfitFromInventory: 0,
  }

  return {
    generatedAt: new Date().toISOString(),
    sales,
    totals,
    realProfitability: {
      averageOperationalMarginPct,
      profitabilityLevel: aggregateLevel,
      negativeSalesCount,
      lowMarginSalesCount,
      warrantyReserveAdvisoryCount: warrantyReserveAdvisorySales.length,
    },
    protectedCapital: totals.protectedCapital,
    availableProfit: totals.availableProfit,
    realizedProfitFromSales: totals.realizedProfitFromSales,
    projectedProfitFromActiveInventory: totals.projectedProfitFromActiveInventory,
    potentialProfitFromInventory: totals.potentialProfitFromInventory,
    negativeSales,
    warrantyReserveAdvisorySales,
    inventoryPressure: combinedPressure(sales),
    lowMarginWarnings,
    reasoning,
  }
}
