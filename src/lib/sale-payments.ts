import { PAYMENT_METHODS } from "@/lib/constants"
import { calculatePaymentPrice, formatPaymentMethod } from "@/lib/helpers"

export type SalePaymentStatus = "pending" | "received" | "cancelled"

export type SalePayment = {
  id?: string
  sale_id?: string
  payment_method: string
  amount: number
  status?: SalePaymentStatus | null
  due_date?: string | null
  received_date?: string | null
  financial_account_id?: string | null
  transaction_id?: string | null
  notes?: string | null
}

export type SalePaymentDraft = {
  id: string
  payment_method: string
  amount: string
  due_date: string
  financial_account_id: string
  notes?: string
}

export type SalePaymentValidation = {
  ok: boolean
  message?: string
}

export const NON_FINANCIAL_PAYMENT_METHODS = new Set(["trade_in_credit"])

export const SPLIT_PAYMENT_METHODS = [
  ...PAYMENT_METHODS.map((item) => ({ value: item.value, label: item.label })),
  { value: "trade_in_credit", label: "Crédito / trade-in" },
] as const

const METHOD_VALUES = new Set<string>(SPLIT_PAYMENT_METHODS.map((item) => item.value))

export function roundCurrency(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function currencyToCents(value: number): number {
  return Math.round(roundCurrency(value) * 100)
}

export function parseCurrencyLike(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const cleaned = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .trim()

  if (!cleaned) return 0

  const sign = cleaned.startsWith("-") ? -1 : 1
  const unsigned = cleaned.replace(/-/g, "")
  const hasComma = unsigned.includes(",")
  const hasDot = unsigned.includes(".")

  let normalized = unsigned
  if (hasComma) {
    normalized = unsigned.replace(/\./g, "").replace(",", ".")
  } else if (hasDot) {
    const parts = unsigned.split(".")
    const last = parts[parts.length - 1] || ""
    normalized = parts.length === 2 && last.length > 0 && last.length <= 2
      ? `${parts[0]}.${last}`
      : parts.join("")
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? sign * parsed : 0
}

export function isCreditPayment(method?: string | null) {
  return String(method || "").startsWith("credit_")
}

export function isFinancialPayment(method?: string | null) {
  return !NON_FINANCIAL_PAYMENT_METHODS.has(String(method || ""))
}

export function normalizeSalePaymentMethod(method?: string | null) {
  const value = String(method || "").trim()
  if (!value) return ""
  if (METHOD_VALUES.has(value)) return value
  if (value === "transferencia" || value === "transferência") return "transfer"
  if (value === "credit_card") return "credit_1x"
  if (value === "debit_card") return "debit"
  return "other"
}

export function paymentMethodSummary(payments?: SalePayment[] | null, legacyMethod?: string | null) {
  const active = (payments || []).filter((payment) => payment.status !== "cancelled")
  if (active.length === 0) return formatPaymentMethod(legacyMethod)

  const methods = Array.from(new Set(active.map((payment) => payment.payment_method).filter(Boolean)))
  if (methods.length === 0) return formatPaymentMethod(legacyMethod)
  if (methods.length === 1) return formatPaymentMethod(methods[0])
  if (methods.length === 2) return methods.map((method) => formatPaymentMethod(method)).join(" + ")
  return "Pagamento misto"
}

export function salePaymentStatusSummary(payments?: SalePayment[] | null) {
  const active = (payments || []).filter((payment) => payment.status !== "cancelled")
  const total = active.reduce((sum, payment) => sum + currencyToCents(Number(payment.amount || 0)), 0)
  const received = active
    .filter((payment) => payment.status === "received")
    .reduce((sum, payment) => sum + currencyToCents(Number(payment.amount || 0)), 0)

  if (total <= 0) return { status: "pending" as const, total: 0, received: 0, pending: 0, label: "Pendente" }
  const pending = Math.max(0, total - received)
  if (received >= total) return { status: "paid" as const, total, received, pending, label: "Pago" }
  if (received > 0) return { status: "partially_paid" as const, total, received, pending, label: "Parcialmente recebido" }
  return { status: "pending" as const, total, received, pending, label: "Pendente" }
}

export function validateSalePayments(input: {
  payments: Array<Pick<SalePaymentDraft, "payment_method" | "amount" | "due_date" | "financial_account_id">>
  expectedTotal: number
  requireAccount?: boolean
}) {
  const expectedCents = currencyToCents(input.expectedTotal)
  let totalCents = 0

  if (expectedCents < 0) return { ok: false, message: "Total da venda inválido." }

  for (const payment of input.payments) {
    const method = normalizeSalePaymentMethod(payment.payment_method)
    const amount = parseCurrencyLike(payment.amount)
    const amountCents = currencyToCents(amount)

    if (!method) return { ok: false, message: "Informe a forma de pagamento de todos os lançamentos." }
    if (amountCents <= 0) return { ok: false, message: "Todo pagamento precisa ter valor maior que zero." }
    if (!payment.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(payment.due_date)) {
      return { ok: false, message: "Informe uma data prevista válida para todos os pagamentos." }
    }
    if (input.requireAccount && isFinancialPayment(method) && !payment.financial_account_id) {
      return { ok: false, message: "Selecione a conta de destino dos pagamentos financeiros." }
    }

    totalCents += amountCents
  }

  if (totalCents < expectedCents) return { ok: false, message: "A soma dos pagamentos é menor que o total da venda." }
  if (totalCents > expectedCents) return { ok: false, message: "A soma dos pagamentos é maior que o total da venda." }
  return { ok: true }
}

export function calculateSplitPaymentEconomics(input: {
  saleRevenue: number
  payments: Array<Pick<SalePayment, "payment_method" | "amount" | "status">>
  settings?: Record<string, unknown> | null
  costTotal: number
  riskReserve?: number
}) {
  const active = input.payments.filter((payment) => payment.status !== "cancelled")
  const saleRevenue = roundCurrency(input.saleRevenue)
  const costTotal = roundCurrency(input.costTotal)
  const riskReserve = roundCurrency(Number(input.riskReserve || 0))

  const financialPayments = active.filter((payment) => isFinancialPayment(payment.payment_method))
  const nonFinancialTotal = roundCurrency(
    active
      .filter((payment) => !isFinancialPayment(payment.payment_method))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  )
  const storeCashReceives = roundCurrency(financialPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
  const customerCashPays = roundCurrency(financialPayments.reduce((sum, payment) => {
    const calculated = calculatePaymentPrice(Number(payment.amount || 0), payment.payment_method, input.settings || {})
    return sum + calculated.price
  }, 0))
  const embeddedFee = roundCurrency(Math.max(0, customerCashPays - storeCashReceives))
  const customerTotalPays = roundCurrency(nonFinancialTotal + customerCashPays)
  const grossProfit = roundCurrency(saleRevenue - costTotal)
  const conservativeProfit = roundCurrency(grossProfit - riskReserve)
  const realMarginPct = customerTotalPays > 0 ? (grossProfit / customerTotalPays) * 100 : 0
  const conservativeMarginPct = customerTotalPays > 0 ? (conservativeProfit / customerTotalPays) * 100 : 0

  return {
    saleRevenue,
    cashAmountDue: storeCashReceives,
    tradeInCredit: nonFinancialTotal,
    customerCashPays,
    customerTotalPays,
    storeCashReceives,
    storeReceives: saleRevenue,
    embeddedFee,
    feePct: 0,
    installments: 1,
    installmentValue: customerCashPays,
    costTotal,
    grossProfit,
    riskReserve,
    conservativeProfit,
    realMarginPct,
    conservativeMarginPct,
  }
}
