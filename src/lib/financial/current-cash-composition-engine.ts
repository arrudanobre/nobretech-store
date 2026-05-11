import type { ProfitAvailabilitySnapshot } from "./profit-availability-engine"

export type CashAccountSnapshot = {
  accountId: string
  accountName: string
  reconciledBalance: number
  availableLiquidity: number
}

export type CurrentCashCompositionSnapshot = {
  asOf: string
  cashByAccount: CashAccountSnapshot[]
  consolidatedCash: number
  estimatedAvailableProfit: number
  operationalRecompositionCapital: number
  ownerCapital: number
  committedToUpcomingBills: number
  pendingReceivables: number
  pendingPayables: number
  ownerWithdrawalsInSelectedPeriod: number
  ownerContributionsInSelectedPeriod: number
  ownerCapitalReturnsInSelectedPeriod: number
  untracedOwnerCapitalReturnsInSelectedPeriod: number
  ownerProfitWithdrawalsInSelectedPeriod: number
  availableForWithdrawal: number
  availableForReinvestment: number
  compositionConfidence: "low" | "medium" | "high"
  compositionBasis: {
    realizedProfit: number
    withdrawals: number
    contributions: number
    capitalReturns: number
    untracedCapitalReturns: number
    profitWithdrawals: number
    inventoryPurchases: number
    operatingExpenses: number
    upcomingBills: number
    protectedCapital: number
  }
  ownerCapitalDetails: {
    ownerProfitWithdrawalMovements: ProfitAvailabilitySnapshot["ownerProfitWithdrawalMovements"]
    ownerCapitalReturnMovements: ProfitAvailabilitySnapshot["ownerCapitalReturnMovements"]
    ownerContributionMovements: ProfitAvailabilitySnapshot["ownerContributionMovements"]
    ambiguousOwnerMovements: ProfitAvailabilitySnapshot["ambiguousOwnerMovements"]
    hasMore: boolean
  }
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

export function buildCurrentCashCompositionSnapshot(input: {
  asOf?: string | Date | null
  cashByAccount?: CashAccountSnapshot[] | null
  consolidatedCash?: number | string | null
  profitAvailability: ProfitAvailabilitySnapshot
  protectedOperationalCapital?: number | string | null
  pendingReceivables?: number | string | null
  pendingPayables?: number | string | null
  upcomingBills?: number | string | null
}): CurrentCashCompositionSnapshot {
  const warnings: string[] = []
  const reasoning: string[] = []
  const accounts = input.cashByAccount || []
  const consolidatedCash = roundCurrency(positive(input.consolidatedCash ?? accounts.reduce((sum, account) => sum + account.availableLiquidity, 0)))
  const profitAvailability = input.profitAvailability
  const committedToUpcomingBills = roundCurrency(positive(input.upcomingBills ?? profitAvailability.upcomingBills))
  const protectedOperationalCapital = roundCurrency(positive(input.protectedOperationalCapital ?? profitAvailability.protectedOperationalCapital))
  const profitAfterWithdrawals = Math.max(0, profitAvailability.profitAfterWithdrawals)
  const practicalCashAfterBills = Math.max(0, consolidatedCash - committedToUpcomingBills)
  const estimatedAvailableProfit = roundCurrency(Math.max(0, Math.min(
    consolidatedCash,
    practicalCashAfterBills,
    profitAfterWithdrawals
  )))
  const availableForWithdrawal = roundCurrency(Math.max(0, Math.min(
    estimatedAvailableProfit,
    profitAvailability.withdrawableProfitToday
  )))
  const availableForReinvestment = roundCurrency(Math.max(0, Math.min(
    practicalCashAfterBills,
    profitAvailability.safeReinvestmentAmount
  )))
  const ownerCapital = roundCurrency(Math.max(0, profitAvailability.ownerCapitalBalanceAllTime))
  const operationalRecompositionCapital = roundCurrency(Math.max(0, Math.min(
    protectedOperationalCapital,
    consolidatedCash - estimatedAvailableProfit
  )))

  if (!accounts.length) warnings.push("Sem contas financeiras estruturadas para detalhar localização do caixa.")
  if (profitAvailability.partiallyTracedSales.length) warnings.push("Composição usa lucro com venda parcialmente rastreada; confiança reduzida.")
  if (profitAvailability.untracedOwnerCapitalReturnsInPeriod > 0) warnings.push("Há devolução de aporte sem lastro rastreado suficiente; composição financeira tem confiança reduzida.")
  if (estimatedAvailableProfit > consolidatedCash) warnings.push("Lucro disponível estimado não pode exceder caixa consolidado.")

  reasoning.push("CashByAccount mostra localização do dinheiro; composição financeira é consolidada porque dinheiro é fungível.")
  reasoning.push("Saídas ao proprietário são separadas entre devolução de aporte e retirada de lucro.")
  reasoning.push("Aportes entram como capital do dono, não como lucro; somente retiradas de lucro reduzem lucro disponível.")
  reasoning.push("Compras de estoque representam capital operacional imobilizado, não despesa operacional pura.")

  const compositionConfidence = warnings.length
    ? profitAvailability.partiallyTracedSales.length || profitAvailability.untracedOwnerCapitalReturnsInPeriod > 0 || !accounts.length ? "medium" as const : "high" as const
    : profitAvailability.confidence === "high" ? "high" as const : "medium" as const

  return {
    asOf: input.asOf instanceof Date ? input.asOf.toISOString() : String(input.asOf || new Date().toISOString()),
    cashByAccount: accounts.map((account) => ({
      accountId: account.accountId,
      accountName: account.accountName,
      reconciledBalance: roundCurrency(account.reconciledBalance),
      availableLiquidity: roundCurrency(account.availableLiquidity),
    })),
    consolidatedCash,
    estimatedAvailableProfit,
    operationalRecompositionCapital,
    ownerCapital,
    committedToUpcomingBills,
    pendingReceivables: roundCurrency(positive(input.pendingReceivables)),
    pendingPayables: roundCurrency(positive(input.pendingPayables)),
    ownerWithdrawalsInSelectedPeriod: profitAvailability.ownerWithdrawalsInPeriod,
    ownerContributionsInSelectedPeriod: profitAvailability.ownerContributionsInPeriod,
    ownerCapitalReturnsInSelectedPeriod: profitAvailability.ownerCapitalReturnsInPeriod,
    untracedOwnerCapitalReturnsInSelectedPeriod: profitAvailability.untracedOwnerCapitalReturnsInPeriod,
    ownerProfitWithdrawalsInSelectedPeriod: profitAvailability.ownerProfitWithdrawalsInPeriod,
    availableForWithdrawal,
    availableForReinvestment,
    compositionConfidence,
    compositionBasis: {
      realizedProfit: profitAvailability.realizedProfitInPeriod,
      withdrawals: profitAvailability.ownerWithdrawalsInPeriod,
      contributions: profitAvailability.ownerContributionsInPeriod,
      capitalReturns: profitAvailability.ownerCapitalReturnsInPeriod,
      untracedCapitalReturns: profitAvailability.untracedOwnerCapitalReturnsInPeriod,
      profitWithdrawals: profitAvailability.ownerProfitWithdrawalsInPeriod,
      inventoryPurchases: profitAvailability.inventoryPurchasesInPeriod,
      operatingExpenses: profitAvailability.operatingExpensesInPeriod,
      upcomingBills: committedToUpcomingBills,
      protectedCapital: protectedOperationalCapital,
    },
    ownerCapitalDetails: {
      ownerProfitWithdrawalMovements: profitAvailability.ownerProfitWithdrawalMovements,
      ownerCapitalReturnMovements: profitAvailability.ownerCapitalReturnMovements,
      ownerContributionMovements: profitAvailability.ownerContributionMovements,
      ambiguousOwnerMovements: profitAvailability.ambiguousOwnerMovements,
      hasMore: Boolean(
        profitAvailability.ownerProfitWithdrawalMovementsHasMore
        || profitAvailability.ownerCapitalReturnMovementsHasMore
        || profitAvailability.ownerContributionMovementsHasMore
        || profitAvailability.ambiguousOwnerMovementsHasMore
      ),
    },
    warnings,
    reasoning,
  }
}
