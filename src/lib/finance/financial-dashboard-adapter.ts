import { addMonthsISO, monthRangeISO, todayISO } from "@/lib/helpers"
import {
  buildOwnerCapitalSnapshot,
  getActiveLedgerMovements,
  isCanceledTransaction,
  isOwnerCapitalReimbursement,
  isOwnerEquityMovement,
  isPendingTransaction,
  isProfitWithdrawal,
  isReconciledTransaction,
  isSalePaymentTransaction,
  isValidCommercialSale,
  type TransactionLike,
} from "@/lib/finance/finance-source-of-truth"
import { buildWorkingCapitalSnapshot, type WorkingCapitalSnapshot } from "@/lib/financial/working-capital-engine"

export type FinancialDashboardFinanceAccount = {
  id: string
  name?: string | null
  is_active?: boolean | null
}

export type FinancialDashboardTransaction = {
  id: string
  account_id?: string | null
  chart_account_id?: string | null
  type: "income" | "expense"
  category?: string | null
  description?: string | null
  amount: number
  date: string
  payment_method?: string | null
  status?: string | null
  source_type?: string | null
  source_id?: string | null
  due_date?: string | null
  credit_card_id?: string | null
}

export type FinancialDashboardMovement = {
  id: string
  account_id?: string | null
  amount: number
  movement_date: string
  type?: string | null
  source?: string | null
  source_id?: string | null
  balance_after?: number | null
  is_canceled?: boolean | null
  reversal_of_id?: string | null
  created_at?: string | null
}

export type FinancialDashboardChartAccount = {
  id: string
  code?: string | null
  name?: string | null
  cash_flow_type?: string | null
  financial_type?: string | null
  statement_section?: string | null
  affects_cash?: boolean | null
  affects_dre?: boolean | null
  affects_inventory?: boolean | null
  affects_owner_equity?: boolean | null
  is_active?: boolean | null
}

export type FinancialDashboardSale = {
  id: string
  sale_date: string
  payment_due_date?: string | null
  sale_price: number
  net_amount?: number | null
  supplier_cost?: number | null
  payment_method?: string | null
  sale_status?: string | null
  inventory?: { purchase_price?: number | null; type?: string | null; catalog?: { model?: string | null } | null } | null
  sales_additional_items?: { type?: string | null; cost_price: number; sale_price?: number | null; profit?: number | null }[]
}

export type FinancialDashboardSalePayment = {
  id: string
  sale_id: string
  payment_method?: string | null
  amount: number
  status?: string | null
  due_date?: string | null
  received_date?: string | null
  transaction_id?: string | null
}

export type FinancialDashboardInventoryItem = {
  id: string
  purchase_price: number
  suggested_price?: number | null
  status?: string | null
  quantity?: number | null
  type?: string | null
}

export type FinancialDashboardProjectionItem = {
  id: string
  type: "income" | "expense"
  date: string
  originalDate: string
  description: string
  category: string
  amount: number
  signedAmount: number
  isOverdue: boolean
  isCardInvoice: boolean
}

export type FinancialDashboardLegacyMetrics = {
  manualIncome: number
  cashInflows: number
  cashOutflows: number
  reconciledInventoryPurchases: number
  reconciledOperatingOutflows: number
  reconciledOwnerWithdrawals: number
  inventoryPurchases: number
  ownerWithdrawals: number
  ownerContributions: number
  operatingExpenses: number
  paidOperatingExpenses: number
  plannedOperatingExpenses: number
  pendingOperatingExpenses: number
  salesRevenue: number
  cmv: number
  netRevenue: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  fixedExpenses: number
  breakEvenRevenue: number
  breakEvenGap: number
  profitCoverage: number
  profitGap: number
  breakEvenProgress: number
  averageTicket: number
  salesNeeded: number
  accountTotal: number
  ownerProfitWithdrawals: number
  ownerCapitalReturns: number
  profitAvailable: number
  profitWithdrawalRate: number
  profitAvailabilityStatus: "exceeded" | "attention" | "available"
  pendingSales: FinancialDashboardSale[]
  pendingSalePayments: FinancialDashboardSalePayment[]
  pendingTransactions: FinancialDashboardTransaction[]
  pendingAmount: number
}

export type FinancialDashboardMoneyLine = {
  label: string
  amount: number
  description: string
  kind: "inventory" | "owner_equity" | "asset" | "reserve" | "receivable" | "payable"
}

export type BuildFinancialDashboardSnapshotInput = {
  month: string
  monthLabel: string
  accounts: FinancialDashboardFinanceAccount[]
  chartAccounts: FinancialDashboardChartAccount[]
  transactions: FinancialDashboardTransaction[]
  accountMovements: FinancialDashboardMovement[]
  projectionTransactions: FinancialDashboardTransaction[]
  projectionSales: FinancialDashboardSale[]
  projectionSalePayments: FinancialDashboardSalePayment[]
  sales: FinancialDashboardSale[]
  inventory: FinancialDashboardInventoryItem[]
  reconciledSaleIds: Set<string>
  saleIdsWithSplitPayments: Set<string>
}

const STOCK_PURCHASE_CATEGORY = "Estoque (Peças/Acessórios)"

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function toDateOnly(value?: string | null) {
  return String(value || "").slice(0, 10)
}

function addDaysISO(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(year, month - 1, day))
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))
  return label.replace(/^\w/, (letter) => letter.toUpperCase())
}

function saleCost(sale: FinancialDashboardSale) {
  const baseCost = number(sale.supplier_cost ?? sale.inventory?.purchase_price ?? 0)
  const additionalCost = (sale.sales_additional_items || []).reduce((sum, item) => sum + number(item.cost_price), 0)
  return baseCost + additionalCost
}

function saleNetRevenue(sale: FinancialDashboardSale) {
  return number(sale.net_amount ?? sale.sale_price ?? 0)
}

function saleBusinessRevenue(sale: FinancialDashboardSale) {
  return number(sale.sale_price ?? sale.net_amount ?? 0)
}

function isInventoryPurchaseTransaction(transaction: FinancialDashboardTransaction) {
  const text = normalize(`${transaction.category || ""} ${transaction.description || ""}`)
  return transaction.source_type === "inventory_purchase"
    || transaction.category === STOCK_PURCHASE_CATEGORY
    || text.includes("compra de estoque")
}

function chartAccountMaps(chartAccounts: FinancialDashboardChartAccount[]) {
  return {
    byId: new Map(chartAccounts.map((account) => [String(account.id), account])),
    byName: new Map(chartAccounts.map((account) => [String(account.name || ""), account])),
    stockAccount: chartAccounts.find((account) => account.code === "7.01") || null,
  }
}

function resolveTransactionAccount(
  transaction: FinancialDashboardTransaction,
  maps: ReturnType<typeof chartAccountMaps>
) {
  if (transaction.type === "expense" && isInventoryPurchaseTransaction(transaction)) return maps.stockAccount
  return (
    (transaction.chart_account_id ? maps.byId.get(String(transaction.chart_account_id)) : undefined)
    || maps.byName.get(String(transaction.category || ""))
    || null
  )
}

function toFinanceSourceEntry(
  transaction: FinancialDashboardTransaction,
  account: FinancialDashboardChartAccount | null
): TransactionLike {
  return {
    ...transaction,
    sourceType: transaction.source_type,
    sourceId: transaction.source_id,
    financialType: account?.financial_type,
    financial_type: account?.financial_type,
    statementSection: account?.statement_section,
    statement_section: account?.statement_section,
    affectsCash: account?.affects_cash,
    affects_cash: account?.affects_cash,
    affectsDre: account?.affects_dre,
    affects_dre: account?.affects_dre,
    affectsInventory: account?.affects_inventory,
    affects_inventory: account?.affects_inventory,
    affectsOwnerEquity: account?.affects_owner_equity,
    affects_owner_equity: account?.affects_owner_equity,
  }
}

function isInventoryCashOut(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  if (transaction.type !== "expense") return false
  if (isInventoryPurchaseTransaction(transaction)) return true
  return account?.financial_type === "inventory_asset" || account?.affects_inventory === true || account?.statement_section === "inventory"
}

function isOwnerWithdrawal(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  if (transaction.type !== "expense") return false
  const financeEntry = toFinanceSourceEntry(transaction, account)
  return isOwnerEquityMovement(financeEntry) || isProfitWithdrawal(financeEntry) || isOwnerCapitalReimbursement(financeEntry)
}

function isOwnerContribution(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  return transaction.type === "income" && (account?.financial_type === "owner_equity" || account?.affects_owner_equity === true)
}

function isRevenueIncome(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  return transaction.type === "income" && account?.financial_type === "revenue"
}

function isResultExpense(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  if (transaction.type !== "expense") return false
  if (isInventoryCashOut(transaction, account)) return false
  if (isOwnerWithdrawal(transaction, account)) return false
  if (account) {
    if (account.affects_dre === false) return false
    return account.affects_dre === true
      || ["operating_expense", "financial_expense", "deduction", "cogs", "tax"].includes(String(account.financial_type || ""))
      || account.statement_section === "dre"
  }
  const label = normalize(`${transaction.category || ""} ${transaction.description || ""}`)
  if (/(estoque|inventory|compra de estoque|pecas|peças)/.test(label)) return false
  return true
}

function isMarketingInvestment(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  const label = normalize(`${transaction.category || ""} ${account?.name || ""}`)
  return /marketing|trafego|anuncio|ads|campanha/.test(label)
}

function buildPatrimonialMovement(input: {
  inventoryOutsideDre: number
  ownerContributions: number
  ownerWithdrawals: number
}) {
  const lines: FinancialDashboardMoneyLine[] = []
  if (input.inventoryOutsideDre > 0) {
    lines.push({
      label: "Investimento em estoque",
      amount: input.inventoryOutsideDre,
      description: "Capital imobilizado em produtos. Sem impacto no lucro do período.",
      kind: "inventory",
    })
  }
  if (input.ownerContributions > 0) {
    lines.push({
      label: "Aportes societários",
      amount: input.ownerContributions,
      description: "Entrada patrimonial dos sócios. Reforça caixa, mas não é receita operacional.",
      kind: "owner_equity",
    })
  }
  if (input.ownerWithdrawals > 0) {
    lines.push({
      label: "Movimentação societária",
      amount: input.ownerWithdrawals,
      description: "Saída patrimonial dos sócios. Afeta caixa, não performance operacional.",
      kind: "owner_equity",
    })
  }
  const total = roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0))
  return {
    total,
    lines,
    primaryLabel: lines[0]?.label || "Movimentação patrimonial",
    description: lines.length > 0
      ? "Movimentos que afetam caixa e patrimônio, mas ficam fora do resultado do período."
      : "Sem movimentação patrimonial relevante no período.",
  }
}

function buildSafeWithdrawalBreakdown(input: {
  workingCapitalSnapshot: WorkingCapitalSnapshot
  pendingReceivables: number
}) {
  const audit = input.workingCapitalSnapshot.financialSafetyAudit
  const protectedWorkingCapital = roundCurrency(Math.max(
    0,
    input.workingCapitalSnapshot.protectedOperationalCapital - input.workingCapitalSnapshot.activeInventoryCapital
  ))
  const pendingPayablesReserve = roundCurrency(audit.pendingPayablesReserve)
  return {
    formula: [
      {
        label: "Caixa reconciliado",
        amount: input.workingCapitalSnapshot.availableCash,
        description: "Saldo real em contas ativas, vindo do extrato reconciliado.",
        kind: "asset" as const,
      },
      {
        label: "Estoque protegido",
        amount: -input.workingCapitalSnapshot.activeInventoryCapital,
        description: "Capital de produtos ativos preservado para manter a operação girando.",
        kind: "inventory" as const,
      },
      {
        label: "Reserva operacional estruturada",
        amount: -protectedWorkingCapital,
        description: "Reserva adicional configurada fora do estoque ativo.",
        kind: "reserve" as const,
      },
      {
        label: "Compromissos previstos",
        amount: -input.workingCapitalSnapshot.upcomingBills30d,
        description: "Contas próximas já mapeadas para o próximo ciclo.",
        kind: "payable" as const,
      },
      {
        label: "Reserva conservadora de pagáveis",
        amount: -pendingPayablesReserve,
        description: "Margem de 25% sobre pagáveis pendentes aplicada pela engine.",
        kind: "reserve" as const,
      },
      {
        label: "Recebíveis pendentes",
        amount: input.pendingReceivables,
        description: "Mostrados para decisão, mas não entram como caixa até conciliação.",
        kind: "receivable" as const,
      },
    ] satisfies FinancialDashboardMoneyLine[],
    estimatedAccumulatedProfit: input.workingCapitalSnapshot.estimatedOperationalProfit,
    cashAfterProtectedCapital: roundCurrency(input.workingCapitalSnapshot.availableCash - input.workingCapitalSnapshot.protectedOperationalCapital),
    cashAfterBills: audit.cashAfterBills,
    profitAfterBills: audit.profitAfterBills,
    withdrawalBase: audit.withdrawalBase,
    pendingPayablesReserve,
    confidence: audit.confidence,
    result: input.workingCapitalSnapshot.safeWithdrawalAmount,
    explanation: "Retirada segura usa o menor valor entre caixa, base operacional estimada, caixa após contas e base operacional após contas; depois aplica reserva de pagáveis.",
  }
}

function activeLedgerBalanceByAccount(
  accounts: FinancialDashboardFinanceAccount[],
  accountMovements: FinancialDashboardMovement[]
) {
  const activeAccountIds = new Set(accounts.filter((account) => account.is_active !== false).map((account) => String(account.id)))
  const latestByAccount = new Map<string, FinancialDashboardMovement>()
  for (const movement of getActiveLedgerMovements(accountMovements) as FinancialDashboardMovement[]) {
    const accountId = movement.account_id ? String(movement.account_id) : ""
    if (activeAccountIds.size > 0 && accountId && !activeAccountIds.has(accountId)) continue
    if (!accountId || movement.balance_after == null) continue
    const current = latestByAccount.get(accountId)
    const currentKey = `${current?.movement_date || ""}T${current?.created_at || ""}`
    const nextKey = `${movement.movement_date || ""}T${movement.created_at || ""}`
    if (!current || nextKey >= currentKey) latestByAccount.set(accountId, movement)
  }
  return roundCurrency(Array.from(latestByAccount.values()).reduce((sum, movement) => sum + number(movement.balance_after), 0))
}

function buildCashProjection(input: BuildFinancialDashboardSnapshotInput, startingBalance: number) {
  const today = todayISO()
  const horizon = addDaysISO(today, 60)
  const saleById = new Map(input.projectionSales.map((sale) => [String(sale.id), sale]))
  const transactionById = new Map(
    input.projectionTransactions
      .filter((transaction) => !isCanceledTransaction(transaction))
      .map((transaction) => [String(transaction.id), transaction])
  )
  const transactionBySaleId = new Map(
    input.projectionTransactions
      .filter((transaction) => transaction.source_type === "sale" && transaction.source_id && !isCanceledTransaction(transaction))
      .map((transaction) => [String(transaction.source_id), transaction])
  )
  const transactionBySalePaymentId = new Map(
    input.projectionTransactions
      .filter((transaction) => isSalePaymentTransaction(transaction) && transaction.source_id && !isCanceledTransaction(transaction))
      .map((transaction) => [String(transaction.source_id), transaction])
  )
  const transactionItems = input.projectionTransactions
    .filter((transaction) => isPendingTransaction(transaction))
    .map((transaction): FinancialDashboardProjectionItem => {
      const rawDate = toDateOnly(transaction.due_date || transaction.date)
      const dueDate = rawDate && rawDate < today ? today : rawDate
      const amount = number(transaction.amount)
      return {
        id: transaction.id,
        type: transaction.type,
        date: dueDate,
        originalDate: rawDate,
        description: transaction.description || transaction.category || "Movimento financeiro",
        category: transaction.category || "Sem categoria",
        amount,
        signedAmount: transaction.type === "income" ? amount : -amount,
        isOverdue: Boolean(rawDate && rawDate < today),
        isCardInvoice: transaction.payment_method === "Cartão de Crédito" || Boolean(transaction.credit_card_id),
      }
    })
  const salePaymentItems = input.projectionSalePayments
    .filter((payment) =>
      isPendingTransaction({ status: payment.status })
      && !transactionBySalePaymentId.has(String(payment.id))
      && !(payment.transaction_id && transactionById.has(String(payment.transaction_id)))
    )
    .map((payment): FinancialDashboardProjectionItem => {
      const sale = saleById.get(String(payment.sale_id))
      const rawDate = toDateOnly(payment.due_date || sale?.payment_due_date || sale?.sale_date)
      const dueDate = rawDate && rawDate < today ? today : rawDate
      const amount = number(payment.amount)
      const method = payment.payment_method ? ` · ${payment.payment_method}` : ""
      return {
        id: payment.id,
        type: "income",
        date: dueDate,
        originalDate: rawDate,
        description: `Venda${sale?.inventory?.catalog?.model ? ` · ${sale.inventory.catalog.model}` : ""}${method}`,
        category: "Venda",
        amount,
        signedAmount: amount,
        isOverdue: Boolean(rawDate && rawDate < today),
        isCardInvoice: false,
      }
    })
  const saleItems = input.projectionSales
    .filter((sale) => {
      const transaction = transactionBySaleId.get(String(sale.id))
      return !transaction
        && !input.saleIdsWithSplitPayments.has(String(sale.id))
        && !isCanceledTransaction({ status: sale.sale_status })
    })
    .map((sale): FinancialDashboardProjectionItem => {
      const rawDate = toDateOnly(sale.payment_due_date || sale.sale_date)
      const dueDate = rawDate && rawDate < today ? today : rawDate
      const amount = saleNetRevenue(sale)
      return {
        id: sale.id,
        type: "income",
        date: dueDate,
        originalDate: rawDate,
        description: `Venda${sale.inventory?.catalog?.model ? ` · ${sale.inventory.catalog.model}` : ""}`,
        category: "Venda",
        amount,
        signedAmount: amount,
        isOverdue: Boolean(rawDate && rawDate < today),
        isCardInvoice: false,
      }
    })
  const pendingItems = [...transactionItems, ...salePaymentItems, ...saleItems]
    .filter((item) => item.date && item.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date))

  const byDate = new Map<string, { date: string; entradas: number; saidas: number; saldo: number }>()
  for (const item of pendingItems) {
    const row = byDate.get(item.date) || { date: item.date, entradas: 0, saidas: 0, saldo: startingBalance }
    if (item.type === "income") row.entradas += item.amount
    else row.saidas += item.amount
    byDate.set(item.date, row)
  }

  let running = startingBalance
  const chart = [{ date: today, label: "Hoje", entradas: 0, saidas: 0, saldo: startingBalance }]
  for (const row of Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))) {
    running += row.entradas - row.saidas
    chart.push({ ...row, label: formatShortDate(row.date), saldo: running })
  }
  const lastKnownBalanceAt = (days: number) => {
    const limit = addDaysISO(today, days)
    return roundCurrency(startingBalance + pendingItems
      .filter((item) => item.date <= limit)
      .reduce((sum, item) => sum + item.signedAmount, 0))
  }
  const totalByWindow = (days: number, type: "income" | "expense") => {
    const limit = addDaysISO(today, days)
    return roundCurrency(pendingItems
      .filter((item) => item.date <= limit && item.type === type)
      .reduce((sum, item) => sum + item.amount, 0))
  }
  const overdue = roundCurrency(pendingItems
    .filter((item) => item.isOverdue)
    .reduce((sum, item) => sum + item.signedAmount, 0))
  const minBalance = roundCurrency(chart.reduce((min, item) => Math.min(min, item.saldo), startingBalance))

  return {
    today,
    startingBalance,
    pendingItems,
    chart,
    balance15: lastKnownBalanceAt(15),
    balance30: lastKnownBalanceAt(30),
    balance60: lastKnownBalanceAt(60),
    income30: totalByWindow(30, "income"),
    expense30: totalByWindow(30, "expense"),
    overdue,
    nextSevenOut: totalByWindow(7, "expense"),
    nextSevenIn: totalByWindow(7, "income"),
    minBalance,
  }
}

export function buildFinancialDashboardSnapshot(input: BuildFinancialDashboardSnapshotInput) {
  const maps = chartAccountMaps(input.chartAccounts)
  const activeAccountMovements = getActiveLedgerMovements(input.accountMovements) as FinancialDashboardMovement[]
  const { start, end } = monthRangeISO(input.month)
  const activePeriodAccountMovements = activeAccountMovements.filter((movement) => movement.movement_date >= start && movement.movement_date <= end)
  const ownerCapitalSnapshot = buildOwnerCapitalSnapshot({
    period: {
      preset: "custom",
      startDate: start,
      endDate: end,
      label: input.monthLabel || input.month,
    },
    movements: input.projectionTransactions.map((transaction) => {
      const account = resolveTransactionAccount(transaction, maps)
      return {
        ...transaction,
        date: transaction.date,
        dueDate: transaction.due_date,
        financialType: account?.financial_type,
        financial_type: account?.financial_type,
        statementSection: account?.statement_section,
        statement_section: account?.statement_section,
        affectsCash: account?.affects_cash,
        affects_cash: account?.affects_cash,
        affectsDre: account?.affects_dre,
        affects_dre: account?.affects_dre,
        affectsInventory: account?.affects_inventory,
        affects_inventory: account?.affects_inventory,
        affectsOwnerEquity: account?.affects_owner_equity,
        affects_owner_equity: account?.affects_owner_equity,
      }
    }),
  })

  const completedSales = input.sales.filter((sale) => isValidCommercialSale({ sale_status: sale.sale_status || "completed" }))
  const activeTransactions = input.transactions.filter((transaction) => !isCanceledTransaction(transaction))
  const reconciledTransactions = input.transactions.filter((transaction) => isReconciledTransaction(transaction))
  const accountFor = (transaction: FinancialDashboardTransaction) => resolveTransactionAccount(transaction, maps)
  const manualIncome = roundCurrency(reconciledTransactions
    .filter((transaction) => transaction.source_type !== "sale" && !isSalePaymentTransaction(transaction) && isRevenueIncome(transaction, accountFor(transaction)))
    .reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const cashInflows = roundCurrency(activePeriodAccountMovements.filter((movement) => number(movement.amount) > 0).reduce((sum, movement) => sum + number(movement.amount), 0))
  const cashOutflows = roundCurrency(activePeriodAccountMovements.filter((movement) => number(movement.amount) < 0).reduce((sum, movement) => sum + Math.abs(number(movement.amount)), 0))
  const reconciledInventoryPurchases = roundCurrency(reconciledTransactions.filter((transaction) => isInventoryCashOut(transaction, accountFor(transaction))).reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const reconciledOperatingOutflows = roundCurrency(reconciledTransactions.filter((transaction) => isResultExpense(transaction, accountFor(transaction))).reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const reconciledOwnerWithdrawals = roundCurrency(reconciledTransactions.filter((transaction) => isOwnerWithdrawal(transaction, accountFor(transaction))).reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const ownerContributions = roundCurrency(reconciledTransactions.filter((transaction) => isOwnerContribution(transaction, accountFor(transaction))).reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const paidOperatingExpenses = reconciledOperatingOutflows
  const plannedOperatingExpenses = roundCurrency(activeTransactions.filter((transaction) => isResultExpense(transaction, accountFor(transaction))).reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const pendingOperatingExpenses = roundCurrency(activeTransactions.filter((transaction) => isPendingTransaction(transaction) && isResultExpense(transaction, accountFor(transaction))).reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const salesRevenue = roundCurrency(completedSales.reduce((sum, sale) => sum + saleBusinessRevenue(sale), 0))
  const cmv = roundCurrency(completedSales.reduce((sum, sale) => sum + saleCost(sale), 0))
  const netRevenue = roundCurrency(salesRevenue + manualIncome)
  const grossProfit = roundCurrency(salesRevenue - cmv)
  const netProfit = roundCurrency(netRevenue - cmv - paidOperatingExpenses)
  const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0
  const fixedExpenses = roundCurrency(activeTransactions
    .filter((transaction) => isResultExpense(transaction, accountFor(transaction)) && !isMarketingInvestment(transaction, accountFor(transaction)))
    .reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const grossMarginRate = salesRevenue > 0 ? grossProfit / salesRevenue : 0
  const breakEvenRevenue = grossMarginRate > 0 ? fixedExpenses / grossMarginRate : fixedExpenses
  const breakEvenGap = Math.max(0, breakEvenRevenue - salesRevenue)
  const profitCoverage = roundCurrency(grossProfit - fixedExpenses)
  const profitGap = roundCurrency(Math.max(0, fixedExpenses - grossProfit))
  const breakEvenProgress = breakEvenRevenue > 0 ? Math.min(100, Math.round((salesRevenue / breakEvenRevenue) * 100)) : 0
  const averageTicket = completedSales.length > 0 ? salesRevenue / completedSales.length : 0
  const salesNeeded = averageTicket > 0 ? Math.ceil(breakEvenGap / averageTicket) : 0
  const accountTotal = activeLedgerBalanceByAccount(input.accounts, input.accountMovements)
  const ownerProfitWithdrawals = roundCurrency(ownerCapitalSnapshot.ownerProfitWithdrawalsInPeriod)
  const ownerCapitalReturns = roundCurrency(ownerCapitalSnapshot.ownerCapitalReturnsInPeriod + ownerCapitalSnapshot.untracedOwnerCapitalReturnsInPeriod)
  const profitAvailable = roundCurrency(netProfit - ownerProfitWithdrawals)
  const profitWithdrawalRate = netProfit > 0 ? Math.min(999, Math.round((ownerProfitWithdrawals / netProfit) * 100)) : ownerProfitWithdrawals > 0 ? 100 : 0
  const profitAvailabilityStatus: "exceeded" | "attention" | "available" = profitAvailable < 0 ? "exceeded" : profitWithdrawalRate >= 80 ? "attention" : "available"
  const pendingSales = input.sales.filter((sale) => !isCanceledTransaction({ status: sale.sale_status }) && !input.reconciledSaleIds.has(sale.id) && !input.saleIdsWithSplitPayments.has(sale.id))
  const pendingSalePayments = input.projectionSalePayments.filter((payment) => isPendingTransaction({ status: payment.status }))
  const pendingTransactions = input.transactions.filter((transaction) => transaction.source_type !== "sale" && !isSalePaymentTransaction(transaction) && isPendingTransaction(transaction))
  const pendingAmount = roundCurrency(
    pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0)
    + pendingSalePayments.reduce((sum, payment) => sum + number(payment.amount), 0)
    + pendingTransactions.reduce((sum, transaction) => sum + number(transaction.amount), 0)
  )
  const cashProjection = buildCashProjection(input, accountTotal)
  const nextMonthStartDate = addMonthsISO(`${input.month}-01`, 1)
  const nextMonthKey = nextMonthStartDate ? nextMonthStartDate.slice(0, 7) : ""
  const { start: nextMonthStart, end: nextMonthEnd } = nextMonthKey ? monthRangeISO(nextMonthKey) : { start: "", end: "" }
  const futureItems = nextMonthKey
    ? cashProjection.pendingItems
        .filter((item) => item.type === "expense" && item.originalDate && item.originalDate >= nextMonthStart && item.originalDate <= nextMonthEnd)
        .sort((a, b) => (a.originalDate || a.date).localeCompare(b.originalDate || b.date))
    : []
  const futureTotal = roundCurrency(futureItems.reduce((sum, item) => sum + item.amount, 0))
  const projectedCashAfter = nextMonthKey
    ? roundCurrency(cashProjection.startingBalance + cashProjection.pendingItems
        .filter((item) => item.date <= nextMonthEnd)
        .reduce((sum, item) => sum + item.signedAmount, 0))
    : null
  const cashImpactRate = accountTotal > 0
    ? Math.min(999, (futureTotal / accountTotal) * 100)
    : futureTotal > 0
      ? 100
      : 0
  const futureStatus: "critical" | "attention" | "clear" = projectedCashAfter !== null && projectedCashAfter < 0
    ? "critical"
    : cashImpactRate >= 30
      ? "attention"
      : "clear"
  const estimatedAccumulatedProfit = Math.max(0, accountTotal - input.inventory.reduce((sum, item) => sum + number(item.purchase_price) * Math.max(1, number(item.quantity) || 1), 0))
  const workingCapitalSnapshot: WorkingCapitalSnapshot = buildWorkingCapitalSnapshot({
    availableCash: accountTotal,
    activeInventoryItems: input.inventory.map((item) => ({
      id: item.id,
      status: item.status,
      purchasePrice: item.purchase_price,
      quantity: item.quantity,
    })),
    realProfitSnapshot: { availableProfit: Math.max(0, profitAvailable) },
    estimatedOperationalProfit: profitAvailable > 0
      ? null
      : {
          amount: estimatedAccumulatedProfit,
          confidence: estimatedAccumulatedProfit > 0 ? 0.8 : 0,
          reason: "Retirada estimada usa caixa acumulado acima do capital de estoque ativo quando não há lucro realizado no mês.",
        },
    upcomingBills30d: futureTotal,
    pendingReceivables: pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0) + pendingSalePayments.reduce((sum, payment) => sum + number(payment.amount), 0),
    pendingPayables: cashProjection.pendingItems.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0),
  })

  const safeWithdrawalAmount = workingCapitalSnapshot.safeWithdrawalAmount
  const pendingReceivables = roundCurrency(pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0) + pendingSalePayments.reduce((sum, payment) => sum + number(payment.amount), 0))
  const pendingPayables = roundCurrency(cashProjection.pendingItems.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0))
  const patrimonialMovement = buildPatrimonialMovement({
    inventoryOutsideDre: reconciledInventoryPurchases,
    ownerContributions,
    ownerWithdrawals: reconciledOwnerWithdrawals,
  })
  const safeWithdrawalBreakdown = buildSafeWithdrawalBreakdown({
    workingCapitalSnapshot,
    pendingReceivables,
  })
  const safeWithdrawalStatus: "critical" | "attention" | "available" = safeWithdrawalAmount <= 0
    ? "critical"
    : futureStatus === "critical"
      ? "attention"
      : "available"
  const insights = [
    netProfit === 0 && salesRevenue === 0 && manualIncome === 0 && paidOperatingExpenses === 0
      ? `${input.monthLabel} ainda está em formação, sem vendas ou despesas reconhecidas no resultado.`
      : null,
    futureTotal > 0 && accountTotal > 0 && futureStatus === "clear"
      ? "O caixa atual cobre com folga os compromissos previstos."
      : null,
    netProfit < 0 && accountTotal > 0
      ? `${input.monthLabel} ainda opera com resultado negativo, mas o caixa reconciliado segue positivo.`
      : null,
    netProfit === 0 && reconciledInventoryPurchases > 0
      ? "Compras de estoque elevaram a saída de caixa sem impactar o lucro do período."
      : null,
    futureTotal > 0 && accountTotal > 0
      ? `Compromissos de ${formatMonthLabel(nextMonthKey)} representam ${cashImpactRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do caixa operacional.`
      : null,
    pendingAmount > 0
      ? "Recebíveis pendentes podem melhorar o resultado quando forem reconhecidos e conciliados."
      : null,
    profitAvailable <= 0 && safeWithdrawalAmount > 0
      ? "Sem lucro realizado neste mês; retirada segura considera caixa acumulado acima do capital operacional protegido."
      : null,
  ].filter(Boolean) as string[]

  return {
    ownerCapitalSnapshot,
    cashProjection,
    periodResult: {
      month: input.month,
      label: input.monthLabel,
      salesRevenue,
      manualReconciledRevenue: manualIncome,
      commercialRevenue: salesRevenue,
      cmv,
      operatingExpenses: paidOperatingExpenses,
      netRevenue,
      grossProfit,
      netResult: netProfit,
      badge: netProfit === 0 ? "Mês em formação" as const : null,
      status: netProfit < 0 ? "negative" as const : netProfit > 0 ? "positive" as const : "forming" as const,
      description: netProfit === 0 && salesRevenue === 0 && manualIncome === 0 && paidOperatingExpenses === 0
        ? "Sem vendas ou despesas reconhecidas no período."
        : netProfit < 0
          ? "Saídas reconhecidas do mês ainda superam receitas reconhecidas."
          : netProfit > 0
            ? "Receitas reconhecidas superam CMV e despesas do período."
            : "Mês ainda em formação; sem lucro realizado reconhecido no período.",
    },
    patrimonialMovement,
    cashPosition: {
      reconciledCash: accountTotal,
      cashInflows,
      cashOutflows,
      description: "Saldo reconciliado disponível nas contas.",
    },
    safeWithdrawal: {
      amount: safeWithdrawalAmount,
      status: safeWithdrawalStatus,
      monthlyProfitAvailable: profitAvailable,
      noMonthlyProfit: profitAvailable <= 0,
      description: safeWithdrawalAmount > 0
        ? "Estimativa conservadora para não comprometer a operação."
        : "Retirada segura indisponível pelo contexto financeiro atual.",
      workingCapitalSnapshot,
      breakdown: safeWithdrawalBreakdown,
    },
    futureCommitments: {
      label: nextMonthKey ? formatMonthLabel(nextMonthKey) : "M+1",
      total: futureTotal,
      items: futureItems,
      projectedCashAfter,
      cashImpactRate,
      status: futureStatus,
      description: futureTotal > 0
        ? `Representam apenas ${cashImpactRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do caixa atual.`
        : "Sem compromissos M+1 mapeados.",
    },
    diagnostics: {
      inventoryOutsideDre: reconciledInventoryPurchases,
      ownerWithdrawals: reconciledOwnerWithdrawals,
      ownerContributions,
      pendingReceivables,
      pendingPayables,
      insights,
      warnings: workingCapitalSnapshot.warnings,
    },
    legacyMetrics: {
      manualIncome,
      cashInflows,
      cashOutflows,
      reconciledInventoryPurchases,
      reconciledOperatingOutflows,
      reconciledOwnerWithdrawals,
      inventoryPurchases: reconciledInventoryPurchases,
      ownerWithdrawals: reconciledOwnerWithdrawals,
      ownerContributions,
      operatingExpenses: paidOperatingExpenses,
      paidOperatingExpenses,
      plannedOperatingExpenses,
      pendingOperatingExpenses,
      salesRevenue,
      cmv,
      netRevenue,
      grossProfit,
      netProfit,
      grossMargin,
      fixedExpenses,
      breakEvenRevenue,
      breakEvenGap,
      profitCoverage,
      profitGap,
      breakEvenProgress,
      averageTicket,
      salesNeeded,
      accountTotal,
      ownerProfitWithdrawals,
      ownerCapitalReturns,
      profitAvailable,
      profitWithdrawalRate,
      profitAvailabilityStatus,
      pendingSales,
      pendingSalePayments,
      pendingTransactions,
      pendingAmount,
    } satisfies FinancialDashboardLegacyMetrics,
    legacyComparison: {
      buggyResultIfInventoryWasExpense: roundCurrency(netProfit - reconciledInventoryPurchases),
      commitmentRateAgainstMonthlyProfit: profitAvailable > 0
        ? Math.min(999, (futureTotal / profitAvailable) * 100)
        : futureTotal > 0
          ? 100
          : 0,
      commitmentRateAgainstCash: cashImpactRate,
    },
  }
}
