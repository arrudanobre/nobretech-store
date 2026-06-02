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
  displayAmount?: number
}

export type FinancialDashboardRetainedProfitSnapshot = {
  accumulatedSalesProfit: number
  accumulatedNetProfitUntilPreviousMonth: number
  currentMonthNetProfit: number
  totalProfitWithdrawals: number
  pendingProfitWithdrawals: number
  retainedProfitAvailable: number
  ownerAvailableProfit: number
  cashBackedRetainedProfit: number
  cashLimitAfterCommitmentsAndReserve: number
  minimumOperationalReserve: number
  safeWithdrawableAmount: number
  activeInventoryCapital: number
  stockProtectionApplied: number
  auditedWindowStart: string
  auditedWindowEnd: string
  months: {
    month: string
    label: string
    salesCount: number
    profit: number
  }[]
}

export type FinancialDashboardOperationalCostLine = {
  id: string
  date: string
  amount: number
  label: string
  status: "reconciled" | "pending"
  timing: "paid" | "m1"
}

export type FinancialDashboardOperationalCostsSnapshot = {
  total: number
  paidTotal: number
  upcomingTotal: number
  lines: FinancialDashboardOperationalCostLine[]
  description: string
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

function isProfitWithdrawalTransaction(transaction: FinancialDashboardTransaction, account: FinancialDashboardChartAccount | null) {
  if (transaction.type !== "expense") return false
  if (account?.code === "8.02") return true
  const financeEntry = toFinanceSourceEntry(transaction, account)
  if (isProfitWithdrawal(financeEntry)) return true
  const label = normalize(`${transaction.category || ""} ${transaction.description || ""} ${account?.name || ""}`)
  return label.includes("retirada de lucro")
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
  retainedProfitSnapshot: FinancialDashboardRetainedProfitSnapshot
  operationalCosts: FinancialDashboardOperationalCostsSnapshot
}) {
  const retained = input.retainedProfitSnapshot
  return {
    formula: [
      {
        label: "Lucro acumulado operacional",
        amount: retained.accumulatedSalesProfit,
        description: "Lucro auditado das vendas do mês anterior e do mês atual.",
        kind: "asset" as const,
      },
      {
        label: "Retiradas do proprietário",
        amount: -retained.totalProfitWithdrawals,
        description: "Retiradas e pró-labore variável já reconciliados.",
        kind: "owner_equity" as const,
      },
      {
        label: "Custos da operação",
        amount: -input.operationalCosts.total,
        description: "Despesas operacionais reais e previstas em M+1 pagas com resultado operacional.",
        kind: "payable" as const,
      },
      {
        label: "Reserva mínima operacional",
        amount: -retained.minimumOperationalReserve,
        description: retained.minimumOperationalReserve > 0
          ? "Margem protegida configurada para preservar operação."
          : "Sem margem mínima configurada; nenhum valor foi inventado.",
        kind: "reserve" as const,
      },
      {
        label: "Caixa operacional",
        amount: retained.cashBackedRetainedProfit,
        displayAmount: input.workingCapitalSnapshot.availableCash,
        description: "Limitador final: nunca sugerir retirada maior que o caixa real após obrigações.",
        kind: "asset" as const,
      },
      {
        label: "Capital em estoque",
        amount: 0,
        displayAmount: retained.activeInventoryCapital,
        description: retained.stockProtectionApplied > 0
          ? "Estoque protegido por política explícita de capital de giro."
          : "Capital imobilizado em produtos; não é subtraído cegamente do lucro retido.",
        kind: "inventory" as const,
      },
      {
        label: "Recebíveis pendentes",
        amount: 0,
        displayAmount: input.pendingReceivables,
        description: "Mostrados para decisão, mas não entram como caixa até conciliação.",
        kind: "receivable" as const,
      },
    ] satisfies FinancialDashboardMoneyLine[],
    estimatedAccumulatedProfit: null,
    cashAfterProtectedCapital: retained.cashLimitAfterCommitmentsAndReserve,
    cashAfterBills: retained.cashLimitAfterCommitmentsAndReserve,
    profitAfterBills: retained.ownerAvailableProfit,
    withdrawalBase: Math.min(retained.ownerAvailableProfit, retained.cashLimitAfterCommitmentsAndReserve),
    pendingPayablesReserve: 0,
    confidence: "high" as const,
    result: retained.safeWithdrawableAmount,
    explanation: "Disponível para Vinícius usa lucro auditado das vendas menos retiradas, custos da operação e margem protegida; depois limita pelo caixa real após obrigações. Estoque e recebíveis ficam separados.",
  }
}

function buildOperationalCostsSnapshot(input: {
  transactions: FinancialDashboardTransaction[]
  accountFor: (transaction: FinancialDashboardTransaction) => FinancialDashboardChartAccount | null
  auditedWindowStart: string
  currentEnd: string
  nextMonthStart: string
  nextMonthEnd: string
}) {
  const lines = input.transactions
    .filter((transaction) => {
      if (isCanceledTransaction(transaction)) return false
      if (!isResultExpense(transaction, input.accountFor(transaction))) return false
      const paidDate = toDateOnly(transaction.date)
      const dueDate = toDateOnly(transaction.due_date || transaction.date)
      const isPaidInWindow = isReconciledTransaction(transaction)
        && paidDate >= input.auditedWindowStart
        && paidDate <= input.currentEnd
      const isUpcomingM1 = isPendingTransaction(transaction)
        && dueDate >= input.nextMonthStart
        && dueDate <= input.nextMonthEnd
      return isPaidInWindow || isUpcomingM1
    })
    .map((transaction): FinancialDashboardOperationalCostLine => {
      const dueDate = toDateOnly(transaction.due_date || transaction.date)
      const isUpcomingM1 = isPendingTransaction(transaction)
        && dueDate >= input.nextMonthStart
        && dueDate <= input.nextMonthEnd
      return {
        id: transaction.id,
        date: isUpcomingM1 ? dueDate : toDateOnly(transaction.date),
        amount: roundCurrency(number(transaction.amount)),
        label: transaction.description || transaction.category || "Custo operacional",
        status: isUpcomingM1 ? "pending" : "reconciled",
        timing: isUpcomingM1 ? "m1" : "paid",
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
  const paidTotal = roundCurrency(lines.filter((line) => line.timing === "paid").reduce((sum, line) => sum + line.amount, 0))
  const upcomingTotal = roundCurrency(lines.filter((line) => line.timing === "m1").reduce((sum, line) => sum + line.amount, 0))
  const total = roundCurrency(paidTotal + upcomingTotal)
  return {
    total,
    paidTotal,
    upcomingTotal,
    lines,
    description: total > 0
      ? "Custos da empresa pagos com resultado operacional."
      : "Sem custos operacionais auditáveis na janela.",
  } satisfies FinancialDashboardOperationalCostsSnapshot
}

function buildRetainedProfitSnapshot(input: {
  sales: FinancialDashboardSale[]
  transactions: FinancialDashboardTransaction[]
  currentStart: string
  currentEnd: string
  accountFor: (transaction: FinancialDashboardTransaction) => FinancialDashboardChartAccount | null
  accountTotal: number
  operationalCosts: FinancialDashboardOperationalCostsSnapshot
  activeInventoryCapital: number
  minimumOperationalReserve: number
}) {
  const previousStart = addMonthsISO(input.currentStart, -1) || input.currentStart
  const previousEnd = addDaysISO(input.currentStart, -1)
  const auditedWindowStart = previousStart
  const auditedWindowEnd = input.currentEnd
  const validSales = input.sales.filter((sale) => isValidCommercialSale({ sale_status: sale.sale_status || "completed" }))
  const profitForWindow = (startDate: string, endDate: string) => {
    const sales = validSales.filter((sale) => {
      const saleDate = toDateOnly(sale.sale_date)
      return saleDate >= startDate && saleDate <= endDate
    })
    return {
      salesCount: sales.length,
      profit: roundCurrency(sales.reduce((sum, sale) => sum + saleBusinessRevenue(sale) - saleCost(sale), 0)),
    }
  }
  const previousMonth = profitForWindow(previousStart, previousEnd)
  const currentMonth = profitForWindow(input.currentStart, input.currentEnd)
  const months = [
    {
      month: previousStart.slice(0, 7),
      label: formatMonthLabel(previousStart.slice(0, 7)),
      salesCount: previousMonth.salesCount,
      profit: previousMonth.profit,
    },
    {
      month: input.currentStart.slice(0, 7),
      label: formatMonthLabel(input.currentStart.slice(0, 7)),
      salesCount: currentMonth.salesCount,
      profit: currentMonth.profit,
    },
  ]
  const accumulatedNetProfitUntilPreviousMonth = previousMonth.profit
  const accumulatedSalesProfit = roundCurrency(accumulatedNetProfitUntilPreviousMonth + currentMonth.profit)

  const transactionsUntilCurrentPeriodEnd = input.transactions
    .filter((transaction) => {
      const date = toDateOnly(transaction.date)
      return !isCanceledTransaction(transaction) && date >= auditedWindowStart && date <= input.currentEnd
    })
  const totalProfitWithdrawals = roundCurrency(transactionsUntilCurrentPeriodEnd
    .filter((transaction) => isReconciledTransaction(transaction) && isProfitWithdrawalTransaction(transaction, input.accountFor(transaction)))
    .reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const pendingProfitWithdrawals = roundCurrency(transactionsUntilCurrentPeriodEnd
    .filter((transaction) => isPendingTransaction(transaction) && isProfitWithdrawalTransaction(transaction, input.accountFor(transaction)))
    .reduce((sum, transaction) => sum + number(transaction.amount), 0))
  const retainedProfitAvailable = roundCurrency(Math.max(0, accumulatedSalesProfit - totalProfitWithdrawals))
  const ownerAvailableProfit = roundCurrency(Math.max(
    0,
    accumulatedSalesProfit - totalProfitWithdrawals - input.operationalCosts.total - input.minimumOperationalReserve
  ))
  const cashBackedRetainedProfit = roundCurrency(Math.min(retainedProfitAvailable, Math.max(0, input.accountTotal)))
  const cashLimitAfterCommitmentsAndReserve = roundCurrency(Math.max(
    0,
    input.accountTotal - input.operationalCosts.upcomingTotal - input.minimumOperationalReserve
  ))
  const safeWithdrawableAmount = roundCurrency(Math.min(ownerAvailableProfit, cashLimitAfterCommitmentsAndReserve))

  return {
    accumulatedSalesProfit,
    accumulatedNetProfitUntilPreviousMonth,
    currentMonthNetProfit: currentMonth.profit,
    totalProfitWithdrawals,
    pendingProfitWithdrawals,
    retainedProfitAvailable,
    ownerAvailableProfit,
    cashBackedRetainedProfit,
    cashLimitAfterCommitmentsAndReserve,
    minimumOperationalReserve: input.minimumOperationalReserve,
    safeWithdrawableAmount,
    activeInventoryCapital: input.activeInventoryCapital,
    stockProtectionApplied: 0,
    auditedWindowStart,
    auditedWindowEnd,
    months,
  } satisfies FinancialDashboardRetainedProfitSnapshot
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
  const activeInventoryCapital = roundCurrency(input.inventory.reduce((sum, item) => sum + number(item.purchase_price) * Math.max(1, number(item.quantity) || 1), 0))
  const minimumOperationalReserve = 0
  const operationalCosts = buildOperationalCostsSnapshot({
    transactions: input.projectionTransactions,
    accountFor,
    auditedWindowStart: addMonthsISO(start, -1) || start,
    currentEnd: end,
    nextMonthStart,
    nextMonthEnd,
  })
  const retainedProfitSnapshot = buildRetainedProfitSnapshot({
    sales: input.projectionSales,
    transactions: input.projectionTransactions,
    currentStart: start,
    currentEnd: end,
    accountFor,
    accountTotal,
    operationalCosts,
    activeInventoryCapital,
    minimumOperationalReserve,
  })
  const workingCapitalSnapshot: WorkingCapitalSnapshot = buildWorkingCapitalSnapshot({
    availableCash: accountTotal,
    activeInventoryItems: input.inventory.map((item) => ({
      id: item.id,
      status: item.status,
      purchasePrice: item.purchase_price,
      quantity: item.quantity,
    })),
    realProfitSnapshot: { availableProfit: retainedProfitSnapshot.retainedProfitAvailable },
    estimatedOperationalProfit: null,
    upcomingBills30d: futureTotal,
    pendingReceivables: pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0) + pendingSalePayments.reduce((sum, payment) => sum + number(payment.amount), 0),
    pendingPayables: cashProjection.pendingItems.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0),
  })

  const safeWithdrawalAmount = retainedProfitSnapshot.safeWithdrawableAmount
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
    retainedProfitSnapshot,
    operationalCosts,
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
    retainedProfitSnapshot.accumulatedNetProfitUntilPreviousMonth > 0 && retainedProfitSnapshot.retainedProfitAvailable > netProfit
      ? "Lucro de meses anteriores permaneceu no caixa e segue considerado na retirada segura."
      : null,
    operationalCosts.total > 0
      ? "Custos da operação reduzem o valor livre para o proprietário, sem serem confundidos com estoque ou retirada."
      : null,
    retainedProfitSnapshot.activeInventoryCapital > 0
      ? "Estoque ativo aparece como capital imobilizado, sem reduzir automaticamente o lucro acumulado retirável."
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
    operationalCosts,
    retainedProfitSnapshot,
    safeWithdrawal: {
      amount: safeWithdrawalAmount,
      status: safeWithdrawalStatus,
      monthlyProfitAvailable: profitAvailable,
      noMonthlyProfit: netProfit <= 0,
      description: safeWithdrawalAmount > 0
        ? "Quanto Vinícius pode retirar hoje sem sufocar a operação."
        : "Sem valor livre recomendado depois de custos e obrigações.",
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
      operationalCostsTotal: operationalCosts.total,
      operationalCostsUpcoming: operationalCosts.upcomingTotal,
      retainedProfitAvailable: retainedProfitSnapshot.retainedProfitAvailable,
      pendingProfitWithdrawals: retainedProfitSnapshot.pendingProfitWithdrawals,
      conservativeWorkingCapitalAmount: workingCapitalSnapshot.safeWithdrawalAmount,
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
