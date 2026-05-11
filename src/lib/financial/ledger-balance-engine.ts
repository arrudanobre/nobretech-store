export type LedgerMovementInput = {
  id?: string | null
  accountId?: string | null
  account_id?: string | null
  movementDate?: string | Date | null
  movement_date?: string | Date | null
  createdAt?: string | Date | null
  created_at?: string | Date | null
  amount?: string | number | null
  balanceAfter?: string | number | null
  balance_after?: string | number | null
  type?: string | null
  source?: string | null
  transactionStatus?: string | null
  transaction_status?: string | null
  txStatus?: string | null
  tx_status?: string | null
  reversalOfId?: string | null
  reversal_of_id?: string | null
  isCanceled?: boolean | null
  is_canceled?: boolean | null
}

export type PendingTransactionInput = {
  id?: string | null
  type?: string | null
  status?: string | null
  amount?: string | number | null
  dueDate?: string | Date | null
  due_date?: string | Date | null
  date?: string | Date | null
}

export type LedgerAccountInput = {
  id?: string | null
  name?: string | null
  currentBalance?: string | number | null
  current_balance?: string | number | null
  isActive?: boolean | null
  is_active?: boolean | null
}

export type LedgerBalance = {
  reconciledBalance: number
  pendingBalance: number
  pendingReceivables: number
  pendingPayables: number
  availableLiquidity: number
  movementCount: number
  activeMovementCount: number
  staleAccountBalance: boolean
  ledgerVsAccountDiff: number
  balanceAfterDrift: number
  balanceAfterIsConsistent: boolean
  cashBalanceSource: "ledger" | "empty_ledger"
  accountBalances: Array<{
    id: string
    name: string
    ledgerBalance: number
    cachedBalance: number
    diff: number
    stale: boolean
  }>
}

export type LedgerSnapshot = LedgerBalance & {
  generatedAt: string
}

export type LedgerDbClient = {
  query<T extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>
}

const CENTS = 100

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * CENTS) / CENTS
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function bool(value: unknown) {
  return value === true
}

function text(value: unknown) {
  return value == null ? "" : String(value)
}

function time(value: unknown) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  const parsed = new Date(String(value)).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function movementAccountId(movement: LedgerMovementInput) {
  return text(movement.accountId ?? movement.account_id) || null
}

function movementDate(movement: LedgerMovementInput) {
  return movement.movementDate ?? movement.movement_date ?? null
}

function movementCreatedAt(movement: LedgerMovementInput) {
  return movement.createdAt ?? movement.created_at ?? null
}

function movementBalanceAfter(movement: LedgerMovementInput) {
  return movement.balanceAfter ?? movement.balance_after ?? null
}

function movementTransactionStatus(movement: LedgerMovementInput) {
  return text(movement.transactionStatus ?? movement.transaction_status ?? movement.txStatus ?? movement.tx_status)
}

function isActiveMovement(movement: LedgerMovementInput) {
  if (bool(movement.isCanceled ?? movement.is_canceled)) return false
  if (movement.type === "reversal" || movement.source === "reversal") return false

  const status = movementTransactionStatus(movement)
  if (
    (movement.source === "account_receivable" || movement.source === "account_payable") &&
    status &&
    status !== "reconciled"
  ) {
    return false
  }

  return true
}

function sortMovementsAsc(a: LedgerMovementInput, b: LedgerMovementInput) {
  const dateDiff = time(movementDate(a)) - time(movementDate(b))
  if (dateDiff !== 0) return dateDiff

  const createdDiff = time(movementCreatedAt(a)) - time(movementCreatedAt(b))
  if (createdDiff !== 0) return createdDiff

  return text(a.id).localeCompare(text(b.id))
}

export function getActiveLedgerMovements(movements: LedgerMovementInput[]) {
  return movements.filter(isActiveMovement).sort(sortMovementsAsc)
}

export function calculateReconciledBalance(movements: LedgerMovementInput[]) {
  return roundCurrency(getActiveLedgerMovements(movements).reduce((sum, movement) => sum + number(movement.amount), 0))
}

export function calculatePendingBalance(transactions: PendingTransactionInput[]) {
  const totals = transactions.reduce(
    (acc, transaction) => {
      if (text(transaction.status || "pending") === "reconciled") return acc
      if (text(transaction.status) === "cancelled") return acc

      const amount = Math.abs(number(transaction.amount))
      if (transaction.type === "income") acc.receivables += amount
      if (transaction.type === "expense") acc.payables += amount
      return acc
    },
    { receivables: 0, payables: 0 }
  )

  return {
    pendingBalance: roundCurrency(totals.receivables - totals.payables),
    pendingReceivables: roundCurrency(totals.receivables),
    pendingPayables: roundCurrency(totals.payables),
  }
}

export function calculateAvailableLiquidity(balance: Pick<LedgerBalance, "reconciledBalance"> | number) {
  const reconciledBalance = typeof balance === "number" ? balance : balance.reconciledBalance
  return roundCurrency(reconciledBalance)
}

function calculateBalanceAfterDrift(movements: LedgerMovementInput[]) {
  let running = 0
  let maxDrift = 0

  for (const movement of getActiveLedgerMovements(movements)) {
    running = roundCurrency(running + number(movement.amount))
    const stored = movementBalanceAfter(movement)
    if (stored == null) continue
    maxDrift = Math.max(maxDrift, Math.abs(roundCurrency(running - number(stored))))
  }

  return roundCurrency(maxDrift)
}

function buildAccountBalances(input: {
  movements: LedgerMovementInput[]
  accounts: LedgerAccountInput[]
}) {
  const activeAccounts = input.accounts.filter((account) => account.isActive ?? account.is_active ?? true)
  const activeMovements = getActiveLedgerMovements(input.movements)
  const unassignedBalance = activeMovements
    .filter((movement) => !movementAccountId(movement))
    .reduce((sum, movement) => sum + number(movement.amount), 0)

  return activeAccounts.map((account) => {
    const accountId = text(account.id)
    const linkedLedger = activeMovements
      .filter((movement) => movementAccountId(movement) === accountId)
      .reduce((sum, movement) => sum + number(movement.amount), 0)
    const ledgerBalance = roundCurrency(linkedLedger + (activeAccounts.length === 1 ? unassignedBalance : 0))
    const cachedBalance = roundCurrency(number(account.currentBalance ?? account.current_balance))
    const diff = roundCurrency(ledgerBalance - cachedBalance)

    return {
      id: accountId,
      name: text(account.name) || "Conta financeira",
      ledgerBalance,
      cachedBalance,
      diff,
      stale: Math.abs(diff) >= 0.01,
    }
  })
}

export function buildLedgerBalance(input: {
  movements: LedgerMovementInput[]
  pendingTransactions?: PendingTransactionInput[]
  accounts?: LedgerAccountInput[]
}): LedgerBalance {
  const movements = input.movements || []
  const pending = calculatePendingBalance(input.pendingTransactions || [])
  const reconciledBalance = calculateReconciledBalance(movements)
  const activeMovementCount = getActiveLedgerMovements(movements).length
  const balanceAfterDrift = calculateBalanceAfterDrift(movements)
  const accountBalances = buildAccountBalances({
    movements,
    accounts: input.accounts || [],
  })
  const accountCashBalance = roundCurrency(accountBalances.reduce((sum, account) => sum + account.cachedBalance, 0))
  const ledgerVsAccountDiff = roundCurrency(reconciledBalance - accountCashBalance)

  return {
    reconciledBalance,
    pendingBalance: pending.pendingBalance,
    pendingReceivables: pending.pendingReceivables,
    pendingPayables: pending.pendingPayables,
    availableLiquidity: calculateAvailableLiquidity(reconciledBalance),
    movementCount: movements.length,
    activeMovementCount,
    staleAccountBalance: Math.abs(ledgerVsAccountDiff) >= 0.01 || accountBalances.some((account) => account.stale),
    ledgerVsAccountDiff,
    balanceAfterDrift,
    balanceAfterIsConsistent: balanceAfterDrift < 0.01,
    cashBalanceSource: activeMovementCount > 0 ? "ledger" : "empty_ledger",
    accountBalances,
  }
}

export function buildLedgerSnapshot(input: Parameters<typeof buildLedgerBalance>[0]): LedgerSnapshot {
  return {
    ...buildLedgerBalance(input),
    generatedAt: new Date().toISOString(),
  }
}

export function logLedgerDebug(snapshot: LedgerBalance) {
  if (process.env.FINANCIAL_LEDGER_DEBUG !== "true") return

  console.info("[financial-ledger]", {
    reconciledBalance: snapshot.reconciledBalance,
    pendingBalance: snapshot.pendingBalance,
    availableLiquidity: snapshot.availableLiquidity,
    staleAccountBalance: snapshot.staleAccountBalance,
    ledgerVsAccountDiff: snapshot.ledgerVsAccountDiff,
    balanceAfterDrift: snapshot.balanceAfterDrift,
    cashBalanceSource: snapshot.cashBalanceSource,
  })
}

export async function syncAccountBalanceFromLedger(client: LedgerDbClient, companyId: string) {
  const accountsResult = await client.query<{
    id: string
    name: string
    current_balance: string | number | null
    is_active: boolean | null
  }>(
    `
      SELECT id, name, current_balance, is_active
      FROM finance_accounts
      WHERE company_id = $1::uuid
        AND COALESCE(is_active, TRUE) = TRUE
      ORDER BY created_at ASC, id ASC
    `,
    [companyId]
  )

  const movementsResult = await client.query<{
    id: string
    account_id: string | null
    movement_date: string
    created_at: string
    amount: string | number
    balance_after: string | number | null
    is_canceled: boolean | null
    source: string | null
    transaction_status: string | null
  }>(
    `
      SELECT
        movement.id,
        movement.account_id,
        movement.movement_date,
        movement.created_at,
        movement.amount,
        movement.balance_after,
        movement.is_canceled,
        movement.source,
        transaction.status AS transaction_status
      FROM financial_account_movements movement
      LEFT JOIN transactions transaction
        ON transaction.id = movement.source_id
       AND transaction.company_id IS NOT DISTINCT FROM movement.company_id
       AND movement.source IN ('account_payable', 'account_receivable')
      WHERE movement.company_id = $1::uuid
      ORDER BY movement.movement_date ASC, movement.created_at ASC, movement.id ASC
    `,
    [companyId]
  )

  const snapshot = buildLedgerSnapshot({
    accounts: accountsResult.rows,
    movements: movementsResult.rows,
  })

  for (const account of snapshot.accountBalances) {
    if (!account.id) continue
    await client.query(
      `
        UPDATE finance_accounts
        SET current_balance = $1,
            updated_at = NOW()
        WHERE id = $2::uuid
          AND company_id = $3::uuid
      `,
      [account.ledgerBalance, account.id, companyId]
    )
  }

  logLedgerDebug(snapshot)

  return snapshot
}
