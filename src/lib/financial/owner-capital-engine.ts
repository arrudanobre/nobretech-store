import { classifyTransaction, type MoneyClassificationInput } from "./money-classification-engine"
import type { ProfitAvailabilityPeriod } from "./profit-availability-engine"

export type OwnerCapitalMovementInput = MoneyClassificationInput & {
  date?: string | Date | null
  dueDate?: string | Date | null
  due_date?: string | Date | null
  createdAt?: string | Date | null
  created_at?: string | Date | null
  description?: string | null
  accountName?: string | null
  account_name?: string | null
  paymentMethod?: string | null
  payment_method?: string | null
}

export type AmbiguousOwnerMovement = {
  movementId: string
  date: string
  description: string
  accountName: string
  paymentMethod?: string
  amount: number
  reason: string
}

export type OwnerCapitalReturnWithoutTrackedContribution = {
  movementId: string
  date: string
  amount: number
  tracedAmount: number
  untracedAmount: number
  category?: string
  reason: string
}

export type OwnerProfitWithdrawalMovement = {
  movementId: string
  date: string
  description: string
  accountName: string
  paymentMethod?: string
  amount: number
  classification: "owner_profit_withdrawal"
}

export type OwnerCapitalReturnMovement = {
  movementId: string
  date: string
  description: string
  accountName: string
  paymentMethod?: string
  amount: number
  tracedAmount: number
  untracedAmount: number
  classification: "owner_capital_return" | "untraced_owner_capital_return"
}

export type OwnerContributionMovement = {
  movementId: string
  date: string
  description: string
  accountName: string
  paymentMethod?: string
  amount: number
  classification: "owner_contribution"
}

export type OwnerCapitalSnapshot = {
  period: ProfitAvailabilityPeriod
  ownerContributionsInPeriod: number
  ownerCapitalReturnsInPeriod: number
  untracedOwnerCapitalReturnsInPeriod: number
  ownerProfitWithdrawalsInPeriod: number
  ownerCapitalBalanceInPeriod: number
  ownerCapitalBalanceAllTime: number
  profitWithdrawalsAffectingAvailability: number
  ambiguousOwnerMovements: AmbiguousOwnerMovement[]
  ownerCapitalReturnWithoutTrackedContribution: OwnerCapitalReturnWithoutTrackedContribution[]
  ownerProfitWithdrawalMovements: OwnerProfitWithdrawalMovement[]
  ownerCapitalReturnMovements: OwnerCapitalReturnMovement[]
  ownerContributionMovements: OwnerContributionMovement[]
  ownerProfitWithdrawalMovementsHasMore: boolean
  ownerCapitalReturnMovementsHasMore: boolean
  ownerContributionMovementsHasMore: boolean
  ambiguousOwnerMovementsHasMore: boolean
  warnings: string[]
  reasoning: string[]
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

function movementDate(movement: OwnerCapitalMovementInput) {
  return movement.date ?? movement.dueDate ?? movement.due_date ?? null
}

function createdAtKey(movement: OwnerCapitalMovementInput) {
  const value = movement.createdAt ?? movement.created_at ?? null
  if (!value) return ""
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : ""
  const parsed = new Date(String(value))
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : String(value)
}

function inPeriod(date: string, period: ProfitAvailabilityPeriod) {
  return Boolean(date && date >= period.startDate && date <= period.endDate)
}

function isReconciled(movement: OwnerCapitalMovementInput) {
  return movement.status === "reconciled"
}

function structuredValue(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function structuredKey(value: unknown) {
  return structuredValue(value).toLowerCase()
}

const CAPITAL_RETURN_CATEGORIES = new Set([
  "reembolso de aporte",
  "reembolso de aporte temporário",
  "devolução de aporte",
  "devolucao de aporte",
  "retorno de capital",
  "reembolso nubank",
  "aporte temporário devolvido",
  "aporte temporario devolvido",
])

const PROFIT_WITHDRAWAL_CATEGORIES = new Set([
  "retirada de lucro",
  "pro-labore",
  "pró-labore",
  "distribuição de lucro",
  "distribuicao de lucro",
])

function isExplicitCapitalReturn(movement: OwnerCapitalMovementInput) {
  return structuredValue(movement.sourceType) === "owner_capital_return"
    || structuredValue(movement.source_type) === "owner_capital_return"
    || structuredValue(movement.source) === "owner_capital_return"
    || structuredValue(movement.financialType) === "owner_capital_return"
    || structuredValue(movement.financial_type) === "owner_capital_return"
    || structuredValue(movement.statementSection) === "owner_capital_return"
    || structuredValue(movement.statement_section) === "owner_capital_return"
    || CAPITAL_RETURN_CATEGORIES.has(structuredKey(movement.category))
}

function isExplicitProfitWithdrawal(movement: OwnerCapitalMovementInput) {
  return structuredValue(movement.sourceType) === "owner_profit_withdrawal"
    || structuredValue(movement.source_type) === "owner_profit_withdrawal"
    || structuredValue(movement.source) === "owner_profit_withdrawal"
    || structuredValue(movement.financialType) === "owner_profit_withdrawal"
    || structuredValue(movement.financial_type) === "owner_profit_withdrawal"
    || structuredValue(movement.statementSection) === "owner_profit_withdrawal"
    || structuredValue(movement.statement_section) === "owner_profit_withdrawal"
    || PROFIT_WITHDRAWAL_CATEGORIES.has(structuredKey(movement.category))
}

function movementId(movement: OwnerCapitalMovementInput) {
  return String(movement.movementId || movement.id || "owner-movement")
}

function movementDescription(movement: OwnerCapitalMovementInput) {
  return structuredValue(movement.description) || structuredValue(movement.category) || "Movimento do proprietário"
}

function movementAccountName(movement: OwnerCapitalMovementInput) {
  return structuredValue(movement.accountName ?? movement.account_name) || structuredValue(movement.category) || "Não informado"
}

function movementPaymentMethod(movement: OwnerCapitalMovementInput) {
  return structuredValue(movement.paymentMethod ?? movement.payment_method) || undefined
}

function movementBase(movement: OwnerCapitalMovementInput, date: string) {
  return {
    movementId: movementId(movement),
    date,
    description: movementDescription(movement),
    accountName: movementAccountName(movement),
    paymentMethod: movementPaymentMethod(movement),
  }
}

function limitList<T>(items: T[], limit = 20) {
  return {
    items: items.slice(0, limit),
    hasMore: items.length > limit,
  }
}

export function buildOwnerCapitalSnapshot(input: {
  period: ProfitAvailabilityPeriod
  movements?: OwnerCapitalMovementInput[] | null
}): OwnerCapitalSnapshot {
  const warnings: string[] = []
  const reasoning: string[] = []
  const ambiguousOwnerMovements: AmbiguousOwnerMovement[] = []
  const untracedOwnerCapitalReturns: OwnerCapitalReturnWithoutTrackedContribution[] = []
  const ownerProfitWithdrawalMovements: OwnerProfitWithdrawalMovement[] = []
  const ownerCapitalReturnMovements: OwnerCapitalReturnMovement[] = []
  const ownerContributionMovements: OwnerContributionMovement[] = []
  const movements = (input.movements || [])
    .map((movement) => ({ movement, date: parseDateKey(movementDate(movement)) }))
    .filter((item) => item.date && isReconciled(item.movement))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      const aCreatedAt = createdAtKey(a.movement)
      const bCreatedAt = createdAtKey(b.movement)
      if (aCreatedAt !== bCreatedAt) return aCreatedAt < bCreatedAt ? -1 : 1
      return movementId(a.movement).localeCompare(movementId(b.movement))
    })

  let ownerCapitalBalanceAllTime = 0
  let ownerCapitalBalanceAtPeriodEnd = 0
  let ownerContributionsInPeriod = 0
  let ownerCapitalReturnsInPeriod = 0
  let untracedOwnerCapitalReturnsInPeriod = 0
  let ownerProfitWithdrawalsInPeriod = 0

  for (const item of movements) {
    const movement = item.movement
    const classification = classifyTransaction(movement)
    const amount = positive(movement.amount)
    if (amount <= 0) continue

    const isOwnerMovement = classification.movementType === "owner_contribution"
      || classification.movementType === "owner_withdrawal"
      || classification.movementType === "owner_capital_return"
      || classification.movementType === "owner_profit_withdrawal"
    if (!isOwnerMovement) continue

    let contribution = 0
    let capitalReturn = 0
    let untracedCapitalReturn = 0
    let profitWithdrawal = 0

    if (classification.movementType === "owner_contribution") {
      contribution = amount
      ownerCapitalBalanceAllTime += amount
    } else if (classification.movementType === "owner_profit_withdrawal" || isExplicitProfitWithdrawal(movement)) {
      profitWithdrawal = amount
    } else if (classification.movementType === "owner_capital_return" || isExplicitCapitalReturn(movement)) {
      capitalReturn = Math.min(amount, ownerCapitalBalanceAllTime)
      untracedCapitalReturn = Math.max(0, amount - capitalReturn)
      ownerCapitalBalanceAllTime = Math.max(0, ownerCapitalBalanceAllTime - capitalReturn)
      if (untracedCapitalReturn > 0) {
        untracedOwnerCapitalReturns.push({
          movementId: movementId(movement),
          date: item.date,
          amount: roundCurrency(amount),
          tracedAmount: roundCurrency(capitalReturn),
          untracedAmount: roundCurrency(untracedCapitalReturn),
          category: movement.category || undefined,
          reason: "Devolução de aporte excedeu os aportes rastreados; excedente mantido como retorno de capital sem lastro rastreado, não retirada de lucro.",
        })
      }
    } else if (classification.movementType === "owner_withdrawal") {
      if (ownerCapitalBalanceAllTime > 0) {
        capitalReturn = Math.min(amount, ownerCapitalBalanceAllTime)
        ownerCapitalBalanceAllTime = Math.max(0, ownerCapitalBalanceAllTime - capitalReturn)
        const excess = Math.max(0, amount - capitalReturn)
        if (excess > 0) {
          ambiguousOwnerMovements.push({
            ...movementBase(movement, item.date),
            amount: roundCurrency(excess),
            reason: "Saída ao proprietário excedeu aportes pendentes, mas não possui classificação explícita de retirada de lucro.",
          })
        }
      } else {
        ambiguousOwnerMovements.push({
          ...movementBase(movement, item.date),
          amount: roundCurrency(amount),
          reason: "Saída ao proprietário sem aporte pendente e sem classificação explícita de retirada de lucro.",
        })
      }
    }

    if (inPeriod(item.date, input.period)) {
      ownerContributionsInPeriod += contribution
      ownerCapitalReturnsInPeriod += capitalReturn
      untracedOwnerCapitalReturnsInPeriod += untracedCapitalReturn
      ownerProfitWithdrawalsInPeriod += profitWithdrawal
      if (contribution > 0) {
        ownerContributionMovements.push({
          ...movementBase(movement, item.date),
          amount: roundCurrency(contribution),
          classification: "owner_contribution",
        })
      }
      if (profitWithdrawal > 0) {
        ownerProfitWithdrawalMovements.push({
          ...movementBase(movement, item.date),
          amount: roundCurrency(profitWithdrawal),
          classification: "owner_profit_withdrawal",
        })
      }
      if (capitalReturn > 0 || untracedCapitalReturn > 0) {
        ownerCapitalReturnMovements.push({
          ...movementBase(movement, item.date),
          amount: roundCurrency(capitalReturn + untracedCapitalReturn),
          tracedAmount: roundCurrency(capitalReturn),
          untracedAmount: roundCurrency(untracedCapitalReturn),
          classification: untracedCapitalReturn > 0 ? "untraced_owner_capital_return" : "owner_capital_return",
        })
      }
    }

    if (item.date <= input.period.endDate) {
      ownerCapitalBalanceAtPeriodEnd = ownerCapitalBalanceAllTime
    }
  }

  const ambiguousInPeriod = ambiguousOwnerMovements.filter((movement) => inPeriod(movement.date, input.period))
  const untracedReturnsInPeriod = untracedOwnerCapitalReturns.filter((movement) => inPeriod(movement.date, input.period))
  if (ambiguousInPeriod.length) {
    warnings.push(`${ambiguousInPeriod.length} movimento${ambiguousInPeriod.length === 1 ? "" : "s"} do proprietário ambíguo${ambiguousInPeriod.length === 1 ? "" : "s"}; não foi tratado como retirada de lucro com alta confiança.`)
  }
  if (untracedReturnsInPeriod.length) {
    warnings.push(`${untracedReturnsInPeriod.length} ${untracedReturnsInPeriod.length === 1 ? "devolução" : "devoluções"} de aporte excede${untracedReturnsInPeriod.length === 1 ? "" : "m"} os aportes rastreados; o excedente não foi tratado como retirada de lucro.`)
  }
  if (ownerCapitalReturnsInPeriod > 0) {
    reasoning.push("Saídas ao proprietário compensaram primeiro aportes pendentes antes de afetar lucro disponível.")
  }
  if (untracedOwnerCapitalReturnsInPeriod > 0) {
    reasoning.push("Devoluções de aporte sem lastro rastreado reduzem confiança, mas não reduzem lucro disponível.")
  }
  if (ownerProfitWithdrawalsInPeriod > 0) {
    reasoning.push("Somente retiradas de lucro reduzem lucro disponível para nova retirada.")
  }
  if (ownerContributionsInPeriod > 0) {
    reasoning.push("Aportes do proprietário aumentam capital/caixa, mas não são receita operacional.")
  }
  const limitedProfitWithdrawals = limitList(ownerProfitWithdrawalMovements)
  const limitedCapitalReturns = limitList(ownerCapitalReturnMovements)
  const limitedContributions = limitList(ownerContributionMovements)
  const limitedAmbiguous = limitList(ambiguousInPeriod)

  return {
    period: input.period,
    ownerContributionsInPeriod: roundCurrency(ownerContributionsInPeriod),
    ownerCapitalReturnsInPeriod: roundCurrency(ownerCapitalReturnsInPeriod),
    untracedOwnerCapitalReturnsInPeriod: roundCurrency(untracedOwnerCapitalReturnsInPeriod),
    ownerProfitWithdrawalsInPeriod: roundCurrency(ownerProfitWithdrawalsInPeriod),
    ownerCapitalBalanceInPeriod: roundCurrency(ownerCapitalBalanceAtPeriodEnd),
    ownerCapitalBalanceAllTime: roundCurrency(ownerCapitalBalanceAllTime),
    profitWithdrawalsAffectingAvailability: roundCurrency(ownerProfitWithdrawalsInPeriod),
    ambiguousOwnerMovements: limitedAmbiguous.items,
    ownerCapitalReturnWithoutTrackedContribution: untracedReturnsInPeriod,
    ownerProfitWithdrawalMovements: limitedProfitWithdrawals.items,
    ownerCapitalReturnMovements: limitedCapitalReturns.items,
    ownerContributionMovements: limitedContributions.items,
    ownerProfitWithdrawalMovementsHasMore: limitedProfitWithdrawals.hasMore,
    ownerCapitalReturnMovementsHasMore: limitedCapitalReturns.hasMore,
    ownerContributionMovementsHasMore: limitedContributions.hasMore,
    ambiguousOwnerMovementsHasMore: limitedAmbiguous.hasMore,
    warnings,
    reasoning,
  }
}
