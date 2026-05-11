import { classifyTransaction, type MoneyClassificationInput } from "./money-classification-engine"
import {
  buildOwnerCapitalSnapshot,
  type AmbiguousOwnerMovement,
  type OwnerCapitalReturnMovement,
  type OwnerCapitalReturnWithoutTrackedContribution,
  type OwnerContributionMovement,
  type OwnerProfitWithdrawalMovement,
  type OwnerCapitalSnapshot,
} from "./owner-capital-engine"

export type ProfitPeriodPreset =
  | "today"
  | "current_month"
  | "last_7_days"
  | "last_30_days"
  | "year_to_date"
  | "all_time"
  | "custom"

export type ProfitAvailabilityPeriod = {
  preset: ProfitPeriodPreset
  startDate: string
  endDate: string
  label: string
}

export type PartiallyTracedSale = {
  saleId: string
  saleLabel?: string | null
  expectedRevenue: number
  tracedRevenue: number
  tracedRatio: number
  reason: string
}

export type ProfitAvailabilitySnapshot = {
  period: ProfitAvailabilityPeriod
  realizedProfitInPeriod: number
  projectedInventoryProfitInPeriod: number
  ownerWithdrawalsInPeriod: number
  ownerContributionsInPeriod: number
  ownerCapitalReturnsInPeriod: number
  untracedOwnerCapitalReturnsInPeriod: number
  ownerProfitWithdrawalsInPeriod: number
  ownerCapitalBalanceInPeriod: number
  ownerCapitalBalanceAllTime: number
  operatingExpensesInPeriod: number
  inventoryPurchasesInPeriod: number
  receivablesInPeriod: number
  payablesInPeriod: number
  cashInflowInPeriod: number
  cashOutflowInPeriod: number
  netCashMovementInPeriod: number
  profitAfterWithdrawals: number
  availableCashNow: number
  upcomingBills: number
  protectedOperationalCapital: number
  withdrawableProfitToday: number
  safeReinvestmentAmount: number
  movementBreakdown: {
    salesProfit: number
    ownerWithdrawals: number
    ownerContributions: number
    ownerCapitalReturns: number
    untracedOwnerCapitalReturns: number
    ownerProfitWithdrawals: number
    operatingExpenses: number
    inventoryPurchases: number
    receivables: number
    payables: number
    transfers: number
    adjustments: number
  }
  partiallyTracedSales: PartiallyTracedSale[]
  ambiguousOwnerMovements: AmbiguousOwnerMovement[]
  ownerCapitalReturnWithoutTrackedContribution: OwnerCapitalReturnWithoutTrackedContribution[]
  ownerProfitWithdrawalMovements: OwnerProfitWithdrawalMovement[]
  ownerCapitalReturnMovements: OwnerCapitalReturnMovement[]
  ownerContributionMovements: OwnerContributionMovement[]
  ownerProfitWithdrawalMovementsHasMore: boolean
  ownerCapitalReturnMovementsHasMore: boolean
  ownerContributionMovementsHasMore: boolean
  ambiguousOwnerMovementsHasMore: boolean
  availabilityStatus: "available" | "partially_available" | "not_available" | "insufficient_data"
  confidence: "low" | "medium" | "high"
  warnings: string[]
  reasoning: string[]
}

export type ProfitAvailabilitySaleInput = {
  saleId: string
  saleLabel?: string | null
  economicRevenue?: number | string | null
  operationalProfit?: number | string | null
  projectedInventoryProfit?: number | string | null
  reconciliationDate?: string | Date | null
  saleDate?: string | Date | null
  tracedRevenue?: number | string | null
  hasSalePayment?: boolean | null
  hasTransaction?: boolean | null
  hasLedgerMovement?: boolean | null
}

export type ProfitAvailabilityTransactionInput = MoneyClassificationInput & {
  date?: string | Date | null
  dueDate?: string | Date | null
  due_date?: string | Date | null
  createdAt?: string | Date | null
  created_at?: string | Date | null
  accountName?: string | null
  account_name?: string | null
  paymentMethod?: string | null
  payment_method?: string | null
}

export type ResolveProfitAvailabilityPeriodInput = {
  preset?: ProfitPeriodPreset | string | null
  startDate?: string | null
  endDate?: string | null
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function positive(value: unknown) {
  return Math.max(0, number(value))
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function parseDateKey(value: string | Date | null | undefined) {
  if (!value) return ""
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? dateKey(value) : ""
  const raw = String(value)
  const directKey = raw.slice(0, 10)
  if (directKey.length === 10 && directKey[4] === "-" && directKey[7] === "-") return directKey
  const parsed = new Date(raw)
  if (!Number.isFinite(parsed.getTime())) return ""
  return dateKey(parsed)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function firstDayOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1)
}

function preset(value: unknown): ProfitPeriodPreset {
  const candidate = String(value || "current_month") as ProfitPeriodPreset
  if ([
    "today",
    "current_month",
    "last_7_days",
    "last_30_days",
    "year_to_date",
    "all_time",
    "custom",
  ].includes(candidate)) {
    return candidate
  }
  return "current_month"
}

function labelForPeriod(period: ProfitAvailabilityPeriod) {
  if (period.preset === "today") return "Hoje"
  if (period.preset === "current_month") return "Mês atual"
  if (period.preset === "last_7_days") return "Últimos 7 dias"
  if (period.preset === "last_30_days") return "Últimos 30 dias"
  if (period.preset === "year_to_date") return "Ano atual"
  if (period.preset === "all_time") return "Todo o histórico"
  return `${period.startDate} a ${period.endDate}`
}

export function resolveProfitAvailabilityPeriod(
  input: ResolveProfitAvailabilityPeriodInput | null | undefined,
  now = new Date()
): { period: ProfitAvailabilityPeriod; error: string | null } {
  const selected = preset(input?.preset)
  const today = dateKey(now)

  let period: ProfitAvailabilityPeriod
  if (selected === "today") {
    period = { preset: selected, startDate: today, endDate: today, label: "" }
  } else if (selected === "last_7_days") {
    period = { preset: selected, startDate: dateKey(addDays(now, -6)), endDate: today, label: "" }
  } else if (selected === "last_30_days") {
    period = { preset: selected, startDate: dateKey(addDays(now, -29)), endDate: today, label: "" }
  } else if (selected === "year_to_date") {
    period = { preset: selected, startDate: dateKey(firstDayOfYear(now)), endDate: today, label: "" }
  } else if (selected === "all_time") {
    period = { preset: selected, startDate: "0001-01-01", endDate: today, label: "" }
  } else if (selected === "custom") {
    const startDate = parseDateKey(input?.startDate || null)
    const endDate = parseDateKey(input?.endDate || null)
    if (!startDate || !endDate) {
      return {
        period: {
          preset: "current_month",
          startDate: dateKey(firstDayOfMonth(now)),
          endDate: today,
          label: "Mês atual",
        },
        error: "Período personalizado exige data inicial e final válidas.",
      }
    }
    if (startDate > endDate) {
      return {
        period: {
          preset: "current_month",
          startDate: dateKey(firstDayOfMonth(now)),
          endDate: today,
          label: "Mês atual",
        },
        error: "Data inicial do período personalizado não pode ser maior que a data final.",
      }
    }
    period = { preset: selected, startDate, endDate, label: "" }
  } else {
    period = { preset: "current_month", startDate: dateKey(firstDayOfMonth(now)), endDate: today, label: "" }
  }

  return {
    period: {
      ...period,
      label: labelForPeriod(period),
    },
    error: null,
  }
}

function inPeriod(date: string | Date | null | undefined, period: ProfitAvailabilityPeriod) {
  const key = parseDateKey(date)
  if (!key) return false
  return key >= period.startDate && key <= period.endDate
}

function txDate(tx: ProfitAvailabilityTransactionInput) {
  return tx.date ?? tx.dueDate ?? tx.due_date ?? null
}

function signedAmount(tx: ProfitAvailabilityTransactionInput) {
  const amount = Math.abs(number(tx.amount))
  return tx.type === "expense" ? -amount : amount
}

function tracedSale(input: ProfitAvailabilitySaleInput) {
  return Boolean(input.hasSalePayment && input.hasTransaction && input.hasLedgerMovement)
}

function tracedRatio(input: ProfitAvailabilitySaleInput) {
  const expectedRevenue = positive(input.economicRevenue)
  if (expectedRevenue <= 0) return tracedSale(input) ? 1 : 0
  return Math.max(0, Math.min(1, positive(input.tracedRevenue) / expectedRevenue))
}

export function buildProfitAvailabilitySnapshot(input: {
  period: ProfitAvailabilityPeriod
  sales?: ProfitAvailabilitySaleInput[] | null
  transactions?: ProfitAvailabilityTransactionInput[] | null
  availableCashNow?: number | string | null
  upcomingBills?: number | string | null
  protectedOperationalCapital?: number | string | null
  safeWithdrawalAmount?: number | string | null
  safeReinvestmentAmount?: number | string | null
  projectedInventoryProfit?: number | string | null
  ownerCapitalSnapshot?: OwnerCapitalSnapshot | null
}): ProfitAvailabilitySnapshot {
  const warnings: string[] = []
  const reasoning: string[] = []
  const period = input.period
  const sales = input.sales || []
  const transactions = input.transactions || []
  const partiallyTracedSales: PartiallyTracedSale[] = []

  let realizedProfitInPeriod = 0
  for (const sale of sales) {
    const saleTouchesPeriod = inPeriod(sale.reconciliationDate || sale.saleDate, period)
    if (!saleTouchesPeriod) continue
    const ratio = tracedRatio(sale)
    const complete = tracedSale(sale) && ratio >= 0.999
    if (!complete) {
      partiallyTracedSales.push({
        saleId: sale.saleId,
        saleLabel: sale.saleLabel,
        expectedRevenue: roundCurrency(positive(sale.economicRevenue)),
        tracedRevenue: roundCurrency(positive(sale.tracedRevenue)),
        tracedRatio: roundCurrency(ratio),
        reason: tracedSale(sale)
          ? "Venda possui elo reconciliado parcial; lucro disponível reconhecido apenas pela parcela rastreada."
          : "Venda sem vínculo completo entre venda, pagamento/transação e movimento reconciliado no ledger.",
      })
    }
    if (tracedSale(sale) && ratio > 0) {
      realizedProfitInPeriod += number(sale.operationalProfit) * ratio
    }
  }

  const periodTransactions = transactions.filter((tx) => inPeriod(txDate(tx), period))
  const reconciledTransactions = periodTransactions.filter((tx) => tx.status === "reconciled")

  let operatingExpensesInPeriod = 0
  let inventoryPurchasesInPeriod = 0
  let receivablesInPeriod = 0
  let payablesInPeriod = 0
  let transfers = 0
  let adjustments = 0

  for (const tx of periodTransactions) {
    const classification = classifyTransaction(tx)
    const amount = Math.abs(number(tx.amount))
    if (classification.movementType === "receivable") receivablesInPeriod += amount
    if (classification.movementType === "payable") payablesInPeriod += amount
    if (classification.movementType === "transfer") transfers += amount
    if (classification.movementType === "adjustment") adjustments += signedAmount(tx)
    if (tx.status !== "reconciled") continue
    if (classification.movementType === "operating_expense") operatingExpensesInPeriod += amount
    if (classification.movementType === "inventory_purchase") inventoryPurchasesInPeriod += amount
  }

  const ownerCapitalSnapshot = input.ownerCapitalSnapshot ?? buildOwnerCapitalSnapshot({
    period,
    movements: transactions,
  })
  const ownerContributionsInPeriod = ownerCapitalSnapshot.ownerContributionsInPeriod
  const ownerCapitalReturnsInPeriod = ownerCapitalSnapshot.ownerCapitalReturnsInPeriod
  const untracedOwnerCapitalReturnsInPeriod = ownerCapitalSnapshot.untracedOwnerCapitalReturnsInPeriod
  const ownerProfitWithdrawalsInPeriod = ownerCapitalSnapshot.ownerProfitWithdrawalsInPeriod
  const ownerWithdrawalsInPeriod = ownerProfitWithdrawalsInPeriod

  const cashInflowInPeriod = reconciledTransactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + Math.abs(number(tx.amount)), 0)
  const cashOutflowInPeriod = reconciledTransactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + Math.abs(number(tx.amount)), 0)
  const netCashMovementInPeriod = cashInflowInPeriod - cashOutflowInPeriod
  const projectedInventoryProfitInPeriod = roundCurrency(positive(input.projectedInventoryProfit))
  const profitAfterWithdrawals = roundCurrency(realizedProfitInPeriod - ownerProfitWithdrawalsInPeriod)
  const availableCashNow = roundCurrency(positive(input.availableCashNow))
  const upcomingBills = roundCurrency(positive(input.upcomingBills))
  const protectedOperationalCapital = roundCurrency(positive(input.protectedOperationalCapital))
  const safeWithdrawalAmount = positive(input.safeWithdrawalAmount)
  const withdrawableProfitToday = roundCurrency(Math.max(0, Math.min(
    profitAfterWithdrawals,
    availableCashNow - upcomingBills,
    safeWithdrawalAmount
  )))
  const safeReinvestmentAmount = roundCurrency(Math.max(0, Math.min(
    positive(input.safeReinvestmentAmount),
    availableCashNow - upcomingBills
  )))

  if (partiallyTracedSales.length) {
    warnings.push(`${partiallyTracedSales.length} venda${partiallyTracedSales.length === 1 ? "" : "s"} parcialmente rastreada${partiallyTracedSales.length === 1 ? "" : "s"}; não trate lucro como disponibilidade definitiva.`)
  }
  if (profitAfterWithdrawals < 0) {
    warnings.push("Retiradas de lucro superaram o lucro realizado no período; isso não é prejuízo operacional, mas reduz nova retirada.")
  }
  warnings.push(...ownerCapitalSnapshot.warnings)
  if (projectedInventoryProfitInPeriod > 0) {
    reasoning.push("Lucro potencial de estoque permanece separado e não alimenta lucro disponível, saque ou reinvestimento.")
  }
  reasoning.push(`Lucro realizado calculado por movimentos reconciliados no período ${period.label}.`)
  reasoning.push("Retiradas de lucro reduzem lucro disponível para nova retirada; devoluções de aporte reduzem capital do proprietário, não lucro disponível.")
  reasoning.push(...ownerCapitalSnapshot.reasoning)

  const hasOwnerTraceWarning = ownerCapitalSnapshot.untracedOwnerCapitalReturnsInPeriod > 0 || ownerCapitalSnapshot.ambiguousOwnerMovements.length > 0
  const confidence = partiallyTracedSales.length
    ? realizedProfitInPeriod > 0 ? "medium" as const : "low" as const
    : hasOwnerTraceWarning
      ? "medium" as const
    : realizedProfitInPeriod > 0 || reconciledTransactions.length > 0 ? "high" as const : "medium" as const
  const availabilityStatus = confidence === "low"
    ? "insufficient_data" as const
    : withdrawableProfitToday > 0
      ? partiallyTracedSales.length ? "partially_available" as const : "available" as const
      : "not_available" as const

  return {
    period,
    realizedProfitInPeriod: roundCurrency(realizedProfitInPeriod),
    projectedInventoryProfitInPeriod,
    ownerWithdrawalsInPeriod: roundCurrency(ownerWithdrawalsInPeriod),
    ownerContributionsInPeriod: roundCurrency(ownerContributionsInPeriod),
    ownerCapitalReturnsInPeriod: roundCurrency(ownerCapitalReturnsInPeriod),
    untracedOwnerCapitalReturnsInPeriod: roundCurrency(untracedOwnerCapitalReturnsInPeriod),
    ownerProfitWithdrawalsInPeriod: roundCurrency(ownerProfitWithdrawalsInPeriod),
    ownerCapitalBalanceInPeriod: roundCurrency(ownerCapitalSnapshot.ownerCapitalBalanceInPeriod),
    ownerCapitalBalanceAllTime: roundCurrency(ownerCapitalSnapshot.ownerCapitalBalanceAllTime),
    operatingExpensesInPeriod: roundCurrency(operatingExpensesInPeriod),
    inventoryPurchasesInPeriod: roundCurrency(inventoryPurchasesInPeriod),
    receivablesInPeriod: roundCurrency(receivablesInPeriod),
    payablesInPeriod: roundCurrency(payablesInPeriod),
    cashInflowInPeriod: roundCurrency(cashInflowInPeriod),
    cashOutflowInPeriod: roundCurrency(cashOutflowInPeriod),
    netCashMovementInPeriod: roundCurrency(netCashMovementInPeriod),
    profitAfterWithdrawals,
    availableCashNow,
    upcomingBills,
    protectedOperationalCapital,
    withdrawableProfitToday,
    safeReinvestmentAmount,
    movementBreakdown: {
      salesProfit: roundCurrency(realizedProfitInPeriod),
      ownerWithdrawals: roundCurrency(ownerWithdrawalsInPeriod),
      ownerContributions: roundCurrency(ownerContributionsInPeriod),
      ownerCapitalReturns: roundCurrency(ownerCapitalReturnsInPeriod),
      untracedOwnerCapitalReturns: roundCurrency(untracedOwnerCapitalReturnsInPeriod),
      ownerProfitWithdrawals: roundCurrency(ownerProfitWithdrawalsInPeriod),
      operatingExpenses: roundCurrency(operatingExpensesInPeriod),
      inventoryPurchases: roundCurrency(inventoryPurchasesInPeriod),
      receivables: roundCurrency(receivablesInPeriod),
      payables: roundCurrency(payablesInPeriod),
      transfers: roundCurrency(transfers),
      adjustments: roundCurrency(adjustments),
    },
    partiallyTracedSales,
    ambiguousOwnerMovements: ownerCapitalSnapshot.ambiguousOwnerMovements,
    ownerCapitalReturnWithoutTrackedContribution: ownerCapitalSnapshot.ownerCapitalReturnWithoutTrackedContribution,
    ownerProfitWithdrawalMovements: ownerCapitalSnapshot.ownerProfitWithdrawalMovements,
    ownerCapitalReturnMovements: ownerCapitalSnapshot.ownerCapitalReturnMovements,
    ownerContributionMovements: ownerCapitalSnapshot.ownerContributionMovements,
    ownerProfitWithdrawalMovementsHasMore: ownerCapitalSnapshot.ownerProfitWithdrawalMovementsHasMore,
    ownerCapitalReturnMovementsHasMore: ownerCapitalSnapshot.ownerCapitalReturnMovementsHasMore,
    ownerContributionMovementsHasMore: ownerCapitalSnapshot.ownerContributionMovementsHasMore,
    ambiguousOwnerMovementsHasMore: ownerCapitalSnapshot.ambiguousOwnerMovementsHasMore,
    availabilityStatus,
    confidence,
    warnings,
    reasoning,
  }
}
