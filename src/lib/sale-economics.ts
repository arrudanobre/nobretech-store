import { calculatePaymentPrice } from "@/lib/helpers"
import type { FinancialSettings } from "@/types/database"

type SettingsLike = Partial<FinancialSettings> | Record<string, unknown>

export type SaleEconomicsInput = {
  saleRevenue: number
  cashAmountDue?: number
  paymentMethod?: string | null
  settings?: SettingsLike | null
  costTotal: number
  riskReserve?: number
}

export type RiskReserveInput = {
  cost: number
  category?: string | null
  grade?: string | null
  batteryHealth?: number | null
  warrantyMonths?: number | null
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function estimateRiskReserve(input: RiskReserveInput): number {
  const cost = Number(input.cost || 0)
  if (cost <= 0) return 0

  const category = String(input.category || "").toLowerCase()
  const grade = String(input.grade || "").toLowerCase()
  const battery = Number(input.batteryHealth || 0)
  const warrantyMonths = Number(input.warrantyMonths || 0)

  const isAccessory = /acess[oó]rio|accessory|capa|pel[ií]cula|cabo|fonte|carregador|fone|caneta/.test(category)
  const isSealed = grade === "lacrado"

  if (isAccessory || isSealed || warrantyMonths <= 0) return 0

  let pct = 0.02
  if (battery > 0 && battery < 85) pct += 0.015
  if (["b", "b+", "c"].includes(grade)) pct += 0.015

  return roundCurrency(Math.max(50, cost * pct))
}

export function calculateSaleEconomics(input: SaleEconomicsInput) {
  const saleRevenue = roundCurrency(Number(input.saleRevenue || 0))
  const cashAmountDue = roundCurrency(Number(input.cashAmountDue ?? saleRevenue))
  const tradeInCredit = roundCurrency(Math.max(0, saleRevenue - cashAmountDue))
  const costTotal = roundCurrency(Number(input.costTotal || 0))
  const method = input.paymentMethod || ""
  const settings = input.settings || {}

  const payment = method && cashAmountDue > 0
    ? calculatePaymentPrice(cashAmountDue, method, settings)
    : { price: cashAmountDue, fee: 0, installments: 1, installmentValue: cashAmountDue }

  const customerCashPays = roundCurrency(payment.price)
  const embeddedFee = roundCurrency(Math.max(0, customerCashPays - cashAmountDue))
  const customerTotalPays = roundCurrency(tradeInCredit + customerCashPays)
  const storeCashReceives = cashAmountDue
  const storeReceives = saleRevenue
  const grossProfit = roundCurrency(storeReceives - costTotal)
  const riskReserve = roundCurrency(Number(input.riskReserve || 0))
  const conservativeProfit = roundCurrency(grossProfit - riskReserve)
  const realMarginPct = customerTotalPays > 0 ? (grossProfit / customerTotalPays) * 100 : 0
  const conservativeMarginPct = customerTotalPays > 0 ? (conservativeProfit / customerTotalPays) * 100 : 0

  return {
    saleRevenue,
    cashAmountDue,
    tradeInCredit,
    customerCashPays,
    customerTotalPays,
    storeCashReceives,
    storeReceives,
    embeddedFee,
    feePct: payment.fee,
    installments: payment.installments,
    installmentValue: payment.installmentValue,
    costTotal,
    grossProfit,
    riskReserve,
    conservativeProfit,
    realMarginPct,
    conservativeMarginPct,
  }
}
