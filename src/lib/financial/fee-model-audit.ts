import { calculatePaymentPrice, getPaymentFeePct } from "@/lib/helpers"

export type FeeResponsibility =
  | "merchant_absorbed_fee"
  | "customer_absorbed_fee"
  | "mixed_fee_model"
  | "unknown_fee_model"
  | "duplicated_fee"

export type FeeOrigin =
  | "none"
  | "payment_method_settings"
  | "sales_net_amount_diff"
  | "transaction_fee"
  | "mixed"
  | "duplicated"

export type FeeModelAuditPaymentInput = {
  id?: string | null
  paymentMethod?: string | null
  amount?: number | string | null
  status?: string | null
  isFinancial?: boolean | null
}

export type FeeModelAuditTransactionInput = {
  id?: string | null
  sourceType?: string | null
  sourceId?: string | null
  type?: "income" | "expense" | string | null
  amount?: number | string | null
  fee?: number | string | null
  status?: string | null
}

export type BuildFeeModelAuditInput = {
  saleId: string
  grossRevenue?: number | string | null
  salePrice?: number | string | null
  netAmount?: number | string | null
  inventoryCost?: number | string | null
  accessoryCost?: number | string | null
  bonusCost?: number | string | null
  operationalCost?: number | string | null
  tradeInCredit?: number | string | null
  payments?: FeeModelAuditPaymentInput[]
  transactions?: FeeModelAuditTransactionInput[]
  settings?: Record<string, unknown> | null
}

export type FeeModelAuditBreakdown = {
  saleId: string
  grossRevenue: number
  cashReceived: number
  paymentFeeCost: number
  feeOrigin: FeeOrigin
  feeResponsibility: FeeResponsibility
  grossVsNetDiff: number
  netDiffExplainedByTradeIn: number
  unexplainedGrossVsNetDiff: number
  transactionFees: number
  paymentFees: number
  embeddedCustomerFees: number
  feeDuplicated: boolean
  operationalProfitBeforeFee: number
  operationalProfitAfterFee: number
  profitImpactingFeeCost: number
  paymentFeeShouldAffectProfit: boolean
  recommendedInterpretation: string
  evidence: string[]
  warnings: string[]
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positive(value: unknown) {
  return Math.max(0, number(value))
}

function nearlyEqual(a: number, b: number, tolerance = 0.02) {
  return Math.abs(roundCurrency(a) - roundCurrency(b)) <= tolerance
}

function activePayments(payments: FeeModelAuditPaymentInput[]) {
  return payments.filter((payment) => payment.status !== "cancelled")
}

function isTradeInPayment(payment: FeeModelAuditPaymentInput) {
  return payment.isFinancial === false || payment.paymentMethod === "trade_in_credit"
}

function paymentFeeEvidence(payment: FeeModelAuditPaymentInput, settings: Record<string, unknown> | null | undefined) {
  if (isTradeInPayment(payment)) return { feePct: 0, feeAmount: 0, customerPays: positive(payment.amount) }
  const amount = number(payment.amount)
  if (amount <= 0) return { feePct: 0, feeAmount: 0, customerPays: amount }
  const feePct = getPaymentFeePct(String(payment.paymentMethod || ""), settings || {})
  const customerPays = calculatePaymentPrice(amount, String(payment.paymentMethod || ""), settings || {}).price
  return {
    feePct,
    feeAmount: roundCurrency(Math.max(0, customerPays - amount)),
    customerPays,
  }
}

function transactionFeeAmount(transaction: FeeModelAuditTransactionInput) {
  if (transaction.status === "cancelled") return 0
  const explicitFee = positive(transaction.fee)
  if (explicitFee > 0) return explicitFee
  if (transaction.type === "expense" && transaction.sourceType === "card_fee") return positive(transaction.amount)
  return 0
}

function resolveFeeOrigin(input: {
  paymentFees: number
  transactionFees: number
  unexplainedGrossVsNetDiff: number
  feeDuplicated: boolean
}): FeeOrigin {
  if (input.feeDuplicated) return "duplicated"
  const origins = [
    input.paymentFees > 0 ? "payment_method_settings" : null,
    input.transactionFees > 0 ? "transaction_fee" : null,
    input.unexplainedGrossVsNetDiff > 0 ? "sales_net_amount_diff" : null,
  ].filter(Boolean)
  if (origins.length === 0) return "none"
  if (origins.length > 1) return "mixed"
  return origins[0] as FeeOrigin
}

function resolveFeeResponsibility(input: {
  paymentFees: number
  transactionFees: number
  unexplainedGrossVsNetDiff: number
  grossVsNetDiff: number
  tradeInCredit: number
  paymentsTotal: number
  grossRevenue: number
  feeDuplicated: boolean
}): FeeResponsibility {
  if (input.feeDuplicated) return "duplicated_fee"
  const hasMethodFee = input.paymentFees > 0
  const hasMerchantFee = input.transactionFees > 0 || input.unexplainedGrossVsNetDiff > 0
  if (hasMethodFee && !hasMerchantFee && nearlyEqual(input.paymentsTotal, input.grossRevenue)) {
    return "customer_absorbed_fee"
  }
  if (!hasMethodFee && !hasMerchantFee) return "unknown_fee_model"
  if (hasMerchantFee && !hasMethodFee) return "merchant_absorbed_fee"
  if (hasMerchantFee && hasMethodFee) return "mixed_fee_model"
  if (hasMethodFee && input.grossVsNetDiff <= input.tradeInCredit + 0.02) return "customer_absorbed_fee"
  return "unknown_fee_model"
}

export function buildFeeModelAudit(input: BuildFeeModelAuditInput): FeeModelAuditBreakdown {
  const payments = activePayments(input.payments || [])
  const salePrice = roundCurrency(number(input.salePrice ?? input.grossRevenue))
  const paymentsTotal = roundCurrency(payments.reduce((sum, payment) => sum + number(payment.amount), 0))
  const grossRevenue = paymentsTotal > 0 ? paymentsTotal : salePrice
  const financialPayments = payments.filter((payment) => !isTradeInPayment(payment))
  const nonFinancialPayments = payments.filter(isTradeInPayment)
  const cashReceived = roundCurrency(financialPayments.reduce((sum, payment) => sum + number(payment.amount), 0))
  const tradeInCredit = roundCurrency(Math.max(
    positive(input.tradeInCredit),
    nonFinancialPayments.reduce((sum, payment) => sum + positive(payment.amount), 0)
  ))
  const netAmount = input.netAmount === null || input.netAmount === undefined ? null : roundCurrency(number(input.netAmount))
  const grossVsNetDiff = netAmount === null ? 0 : roundCurrency(Math.max(0, salePrice - netAmount))
  const netDiffExplainedByTradeIn = roundCurrency(Math.min(grossVsNetDiff, tradeInCredit))
  const unexplainedGrossVsNetDiff = roundCurrency(Math.max(0, grossVsNetDiff - netDiffExplainedByTradeIn))
  const paymentFees = roundCurrency(financialPayments.reduce((sum, payment) => (
    sum + paymentFeeEvidence(payment, input.settings).feeAmount
  ), 0))
  const embeddedCustomerFees = paymentFees
  const transactionFees = roundCurrency((input.transactions || []).reduce((sum, transaction) => (
    sum + transactionFeeAmount(transaction)
  ), 0))
  const feeDuplicated = transactionFees > 0 && (paymentFees > 0 || unexplainedGrossVsNetDiff > 0)
  const feeOrigin = resolveFeeOrigin({
    paymentFees,
    transactionFees,
    unexplainedGrossVsNetDiff,
    feeDuplicated,
  })
  const feeResponsibility = resolveFeeResponsibility({
    paymentFees,
    transactionFees,
    unexplainedGrossVsNetDiff,
    grossVsNetDiff,
    tradeInCredit,
    paymentsTotal,
    grossRevenue,
    feeDuplicated,
  })
  const paymentFeeShouldAffectProfit = feeResponsibility === "merchant_absorbed_fee" || feeResponsibility === "mixed_fee_model" || feeResponsibility === "duplicated_fee"
  const operationalCostBase = positive(input.inventoryCost) + positive(input.accessoryCost) + positive(input.bonusCost) + positive(input.operationalCost)
  const operationalProfitBeforeFee = roundCurrency(grossRevenue - operationalCostBase)
  const profitImpactingFeeCost = paymentFeeShouldAffectProfit ? roundCurrency(Math.max(paymentFees, transactionFees, unexplainedGrossVsNetDiff)) : 0
  const operationalProfitAfterFee = roundCurrency(operationalProfitBeforeFee - profitImpactingFeeCost)
  const evidence: string[] = []
  const warnings: string[] = []

  if (paymentFees > 0) evidence.push("Taxa calculada a partir da tabela estruturada de métodos de pagamento.")
  if (transactionFees > 0) evidence.push("Há taxa explícita vinculada em transação estruturada.")
  if (grossVsNetDiff > 0 && netDiffExplainedByTradeIn > 0) evidence.push("Diferença entre sale_price e net_amount explicada por trade-in/crédito não financeiro.")
  if (unexplainedGrossVsNetDiff > 0) evidence.push("Diferença entre sale_price e net_amount não explicada por trade-in.")
  if (feeResponsibility === "customer_absorbed_fee") evidence.push("Pagamentos ativos preservam a receita econômica da venda; taxa aparece como valor cobrado do cliente acima do caixa protegido.")
  if (feeDuplicated) warnings.push("Possível duplicidade: taxa aparece em mais de uma origem financeira estruturada.")
  if (paymentFees > 0 && feeResponsibility === "customer_absorbed_fee") warnings.push("A taxa configurada do método não deve ser tratada como custo da loja sem evidência de absorção pelo lojista.")
  if (netAmount !== null && !nearlyEqual(netAmount, cashReceived) && tradeInCredit > 0) warnings.push("net_amount diverge do caixa financeiro recebido mesmo após trade-in; revisar lançamento.")

  return {
    saleId: input.saleId,
    grossRevenue,
    cashReceived,
    paymentFeeCost: paymentFees,
    feeOrigin,
    feeResponsibility,
    grossVsNetDiff,
    netDiffExplainedByTradeIn,
    unexplainedGrossVsNetDiff,
    transactionFees,
    paymentFees,
    embeddedCustomerFees,
    feeDuplicated,
    operationalProfitBeforeFee,
    operationalProfitAfterFee,
    profitImpactingFeeCost,
    paymentFeeShouldAffectProfit,
    recommendedInterpretation: paymentFeeShouldAffectProfit
      ? "Tratar a taxa como impacto potencial de margem somente porque existe evidência estruturada de absorção pela loja ou duplicidade a revisar."
      : "Não descontar taxa do lucro operacional: a evidência indica taxa absorvida pelo cliente ou ausência de fee real da loja.",
    evidence,
    warnings,
  }
}
