"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts"
import { AlertTriangle, Banknote, Building2, CalendarClock, CheckCircle2, Landmark, LineChart, Plus, ReceiptText, Shield, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Sparkles, Info } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { addMonthsISO, currentMonthKey, formatBRL, formatDate, getProductName, monthRangeISO, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"
import { upsertSaleReceivable } from "@/lib/finance/sale-receivable-client"
import { getActiveLedgerMovements } from "@/lib/financial/ledger-balance-engine"
import { buildOwnerCapitalSnapshot } from "@/lib/financial/owner-capital-engine"

type FinanceAccount = {
  id: string
  name: string
  institution?: string | null
  account_type?: string | null
  opening_balance?: number
  color?: string | null
  is_active?: boolean
}

type Transaction = {
  id: string
  account_id?: string | null
  chart_account_id?: string | null
  type: "income" | "expense"
  category: string
  description?: string | null
  amount: number
  date: string
  payment_method?: string | null
  status?: "pending" | "reconciled" | "cancelled" | null
  source_type?: string | null
  source_id?: string | null
  due_date?: string | null
  credit_card_id?: string | null
}

type FinancialAccountMovement = {
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

type ChartAccount = {
  id: string
  code: string
  name: string
  cash_flow_type: "income" | "expense" | "none"
  financial_type: "revenue" | "operating_expense" | "inventory_asset" | "cogs" | "tax" | "owner_equity" | "transfer" | "adjustment"
  statement_section: "cash" | "dre" | "inventory" | "equity" | "transfer" | "adjustment"
  affects_cash: boolean
  affects_dre: boolean
  affects_inventory: boolean
  affects_owner_equity: boolean
  sort_order: number
  is_active?: boolean
}

type Sale = {
  id: string
  sale_date: string
  payment_due_date?: string | null
  sale_price: number
  net_amount?: number | null
  supplier_cost?: number | null
  payment_method?: string | null
  sale_status?: "reserved" | "completed" | "cancelled" | null
  inventory?: { purchase_price?: number | null; type?: string | null; catalog?: { model?: string | null } | null } | null
  sales_additional_items?: { type: "upsell" | "free"; cost_price: number; sale_price?: number | null; profit?: number | null }[]
}

type SalePayment = {
  id: string
  sale_id: string
  payment_method?: string | null
  amount: number
  status?: "pending" | "received" | "cancelled" | null
  due_date?: string | null
  received_date?: string | null
  transaction_id?: string | null
}

type InventoryItem = {
  id: string
  purchase_price: number
  suggested_price?: number | null
  status?: string | null
  quantity?: number | null
  type?: string | null
  notes?: string | null
  condition_notes?: string | null
  catalog?: { model?: string | null; storage?: string | null; color?: string | null; category?: string | null } | null
}

type DashboardMovementStatus = "reconciled" | "pending" | "cancelled" | "reversed" | "reversal"

const expenseColors = ["#ef4444", "#f97316", "#eab308", "#2563eb", "#14b8a6", "#8b5cf6"]
const STOCK_PURCHASE_CATEGORY = "Estoque (Peças/Acessórios)"

function isInventoryPurchaseTransaction(transaction: Transaction) {
  return transaction.source_type === "inventory_purchase" || transaction.category === STOCK_PURCHASE_CATEGORY
}

function saleCost(sale: Sale) {
  const baseCost = Number(sale.supplier_cost ?? sale.inventory?.purchase_price ?? 0)
  const additionalCost = (sale.sales_additional_items || []).reduce((sum, item) => sum + Number(item.cost_price || 0), 0)
  return baseCost + additionalCost
}

function saleNetRevenue(sale: Sale) {
  return Number(sale.net_amount ?? sale.sale_price ?? 0)
}

function saleBusinessRevenue(sale: Sale) {
  return Number(sale.sale_price ?? sale.net_amount ?? 0)
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  const cents = Number(digits || "0")
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, "") || "0") / 100
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function movementStatusLabel(status: DashboardMovementStatus) {
  if (status === "reconciled") return "Conciliado"
  if (status === "cancelled") return "Cancelado"
  if (status === "reversed") return "Estornado"
  if (status === "reversal") return "Movimento de estorno"
  return "Pendente"
}

function movementStatusVariant(status: DashboardMovementStatus): "green" | "yellow" | "red" | "gray" {
  if (status === "reconciled") return "green"
  if (status === "cancelled" || status === "reversed") return "red"
  if (status === "reversal") return "gray"
  return "yellow"
}

function buildMonthOptions() {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - index)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const label = formatter.format(date).replace(/^\w/, (letter) => letter.toUpperCase())
    return { value, label }
  })
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

function LazyChart({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])
  if (!ready) return <>{fallback ?? null}</>
  return <>{children}</>
}

function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1))
  return label.replace(/^\w/, (l) => l.toUpperCase())
}

function timelineDateParts(value: string) {
  const [year, monthN, day] = value.split("-").map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(monthN) || !Number.isFinite(day)) return { day: "", monthAbbr: "" }
  const monthAbbr = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(year, monthN - 1, day)).replace(/\./g, "").toUpperCase()
  return { day: String(day).padStart(2, "0"), monthAbbr }
}

export default function FinanceiroPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accountMovements, setAccountMovements] = useState<FinancialAccountMovement[]>([])
  const [projectionTransactions, setProjectionTransactions] = useState<Transaction[]>([])
  const [projectionSales, setProjectionSales] = useState<Sale[]>([])
  const [projectionSalePayments, setProjectionSalePayments] = useState<SalePayment[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountName, setAccountName] = useState("Conta principal")
  const [accountInstitution, setAccountInstitution] = useState("")
  const [openingBalance, setOpeningBalance] = useState("R$ 0,00")
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [reconcilingId, setReconcilingId] = useState<string | null>(null)
  const [undoConfirmId, setUndoConfirmId] = useState<string | null>(null)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editAccountName, setEditAccountName] = useState("")
  const [editAccountInstitution, setEditAccountInstitution] = useState("")
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null)
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const { toast } = useToast()
  const monthOptions = useMemo(() => buildMonthOptions(), [])

  useEffect(() => {
    fetchFinance()
  }, [month])

  const fetchFinance = async () => {
    setLoading(true)
    try {
      const { start, end, endOfDay } = monthRangeISO(month)
      const [accountsRes, chartAccountsRes, transactionsRes, accountMovementsRes, projectionTransactionsRes, projectionSalesRes, projectionSalePaymentsRes, salesRes, inventoryRes] = await Promise.all([
        (supabase.from("finance_accounts") as any).select("*").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("finance_chart_accounts") as any).select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        (supabase.from("transactions") as any).select("*").gte("date", start).lte("date", end).order("date", { ascending: false }),
        (supabase.from("financial_account_movements") as any)
          .select("id, account_id, amount, movement_date, type, source, source_id, balance_after, is_canceled, reversal_of_id, created_at")
          .order("movement_date", { ascending: true }),
        (supabase.from("transactions") as any).select("*").or("status.is.null,status.neq.cancelled").order("due_date", { ascending: true }),
        (supabase.from("sales") as any)
          .select("id, sale_date, payment_due_date, sale_status, sale_price, net_amount, payment_method, inventory:inventory_id(catalog:catalog_id(model))")
          .neq("sale_status", "cancelled")
          .order("payment_due_date", { ascending: true }),
        (supabase.from("sale_payments") as any)
          .select("id, sale_id, payment_method, amount, status, due_date, received_date, transaction_id")
          .neq("status", "cancelled")
          .order("due_date", { ascending: true }),
        (supabase.from("sales") as any)
          .select("*, inventory:inventory_id(*, catalog:catalog_id(model)), sales_additional_items(*)")
          .gte("sale_date", start)
          .lte("sale_date", endOfDay)
          .order("sale_date", { ascending: false }),
        (supabase.from("inventory") as any)
          .select("id, purchase_price, suggested_price, status, quantity, type, notes, condition_notes, catalog:catalog_id(model, storage, color, category)")
          .in("status", ["active", "in_stock"])
          .order("created_at", { ascending: false }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      if (transactionsRes.error) throw new Error(transactionsRes.error.message)
      if (accountMovementsRes.error) throw new Error(accountMovementsRes.error.message)
      if (projectionTransactionsRes.error) throw new Error(projectionTransactionsRes.error.message)
      if (projectionSalesRes.error) throw new Error(projectionSalesRes.error.message)
      if (projectionSalePaymentsRes.error) throw new Error(projectionSalePaymentsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)
      if (inventoryRes.error) throw new Error(inventoryRes.error.message)

      const projectionSalesData = (projectionSalesRes.data || []).map((sale: any) => ({
        ...sale,
        sale_price: Number(sale.sale_price || 0),
        net_amount: sale.net_amount === null ? null : Number(sale.net_amount || 0),
      }))
      const validProjectionSaleIds = new Set(projectionSalesData.map((sale: any) => String(sale.id)))

      setAccounts(accountsRes.data || [])
      setChartAccounts(chartAccountsRes.data || [])
      setTransactions((transactionsRes.data || []).map((item: any) => ({ ...item, amount: Number(item.amount || 0) })))
      setAccountMovements((accountMovementsRes.data || []).map((item: any) => ({
        ...item,
        movement_date: toDateOnly(item.movement_date),
        amount: Number(item.amount || 0),
        balance_after: item.balance_after === null ? null : Number(item.balance_after || 0),
      })))
      setProjectionTransactions((projectionTransactionsRes.data || [])
        .filter((item: any) => item.source_type !== "sale" || validProjectionSaleIds.has(String(item.source_id)))
        .map((item: any) => ({ ...item, amount: Number(item.amount || 0) })))
      setProjectionSales(projectionSalesData)
      setProjectionSalePayments((projectionSalePaymentsRes.data || []).map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount || 0),
        due_date: toDateOnly(payment.due_date),
        received_date: toDateOnly(payment.received_date),
      })))
      setSales(salesRes.data || [])
      setInventory((inventoryRes.data || []).map((item: any) => ({
        ...item,
        purchase_price: Number(item.purchase_price || 0),
        suggested_price: item.suggested_price === null ? null : Number(item.suggested_price || 0),
        quantity: item.quantity === null ? null : Number(item.quantity || 1),
      })))
    } catch (error: any) {
      toast({ title: "Erro ao carregar financeiro", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const saleIdsWithSplitPayments = useMemo(() => {
    return new Set(projectionSalePayments.map((payment) => String(payment.sale_id)))
  }, [projectionSalePayments])

  const projectionTransactionById = useMemo(() => {
    return new Map(projectionTransactions.map((transaction) => [String(transaction.id), transaction]))
  }, [projectionTransactions])

  const projectionTransactionBySalePaymentId = useMemo(() => {
    return new Map(
      projectionTransactions
        .filter((transaction) => transaction.source_type === "sale_payment" && transaction.source_id)
        .map((transaction) => [String(transaction.source_id), transaction])
    )
  }, [projectionTransactions])

  const saleFinanceStatusBySaleId = useMemo(() => {
    const statuses = new Map<string, DashboardMovementStatus>()

    for (const transaction of [...projectionTransactions, ...transactions]) {
      if (transaction.source_type !== "sale" || !transaction.source_id) continue
      statuses.set(String(transaction.source_id), transaction.status === "reconciled" ? "reconciled" : transaction.status === "cancelled" ? "cancelled" : "pending")
    }

    const paymentsBySaleId = new Map<string, SalePayment[]>()
    for (const payment of projectionSalePayments) {
      const saleId = String(payment.sale_id)
      paymentsBySaleId.set(saleId, [...(paymentsBySaleId.get(saleId) || []), payment])
    }

    for (const [saleId, payments] of paymentsBySaleId) {
      const paymentStatuses = payments
        .map((payment) => {
          const transaction = (payment.transaction_id ? projectionTransactionById.get(String(payment.transaction_id)) : undefined)
            || projectionTransactionBySalePaymentId.get(String(payment.id))
          if (transaction?.status === "reconciled") return "reconciled" as DashboardMovementStatus
          if (transaction?.status === "cancelled" || payment.status === "cancelled") return "cancelled" as DashboardMovementStatus
          return "pending" as DashboardMovementStatus
        })

      if (paymentStatuses.length === 0) continue
      if (paymentStatuses.every((status) => status === "reconciled")) statuses.set(saleId, "reconciled")
      else if (paymentStatuses.every((status) => status === "cancelled")) statuses.set(saleId, "cancelled")
      else statuses.set(saleId, "pending")
    }

    return statuses
  }, [projectionSalePayments, projectionTransactionById, projectionTransactionBySalePaymentId, projectionTransactions, transactions])

  const reconciledSaleIds = useMemo(() => {
    return new Set(Array.from(saleFinanceStatusBySaleId.entries()).filter(([, status]) => status === "reconciled").map(([saleId]) => saleId))
  }, [saleFinanceStatusBySaleId])

  const activeAccountMovements = useMemo(() => {
    return getActiveLedgerMovements(accountMovements) as FinancialAccountMovement[]
  }, [accountMovements])

  const accountBalances = useMemo(() => {
    const unassignedLedger =
      accounts.length === 1
        ? activeAccountMovements
            .filter((movement) => !movement.account_id)
            .reduce((sum, movement) => sum + Number(movement.amount || 0), 0)
        : 0

    return accounts.map((account) => {
      const linkedLedger = activeAccountMovements
        .filter((movement) => movement.account_id === account.id)
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0)
      const baseBalance = 0
      const ledger = linkedLedger + unassignedLedger
      const balance = ledger
      return { ...account, baseBalance, ledger, balance }
    })
  }, [activeAccountMovements, accounts])

  const statementBalance = useMemo(() => {
    return activeAccountMovements.reduce((sum, movement) => sum + Number(movement.amount || 0), 0)
  }, [activeAccountMovements])

  useEffect(() => {
    if (accountBalances.length === 0) {
      setSelectedAccountId("")
      return
    }
    if (!selectedAccountId || !accountBalances.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(accountBalances[0].id)
    }
  }, [accountBalances, selectedAccountId])

  const chartAccountById = useMemo(() => {
    return new Map(chartAccounts.map((account) => [account.id, account]))
  }, [chartAccounts])

  const chartAccountByName = useMemo(() => {
    return new Map(chartAccounts.map((account) => [account.name, account]))
  }, [chartAccounts])

  const accountNameById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account.name]))
  }, [accounts])

  const getTransactionAccount = (transaction: Transaction) => {
    if (transaction.type === "expense" && isInventoryPurchaseTransaction(transaction)) {
      return chartAccounts.find((account) => account.code === "7.01") || null
    }
    return (
      (transaction.chart_account_id ? chartAccountById.get(transaction.chart_account_id) : undefined) ||
      chartAccountByName.get(transaction.category) ||
      null
    )
  }

  const hasFinancialType = (transaction: Transaction, type: ChartAccount["financial_type"]) => {
    const account = getTransactionAccount(transaction)
    if (account) return account.financial_type === type
    if (type === "inventory_asset") return transaction.type === "expense" && isInventoryPurchaseTransaction(transaction)
    if (type === "owner_equity") return ["Retirada de Lucro", "Aporte do proprietário"].includes(transaction.category)
    if (type === "tax") return transaction.category === "Impostos / Taxas"
    if (type === "revenue") return transaction.type === "income" && !["Aporte do proprietário"].includes(transaction.category)
    if (type === "operating_expense") return transaction.type === "expense" && !isInventoryPurchaseTransaction(transaction) && !["Retirada de Lucro", "Impostos / Taxas"].includes(transaction.category)
    return false
  }

  const isResultExpense = (transaction: Transaction) => hasFinancialType(transaction, "operating_expense") || hasFinancialType(transaction, "tax")
  const isMarketingInvestment = (transaction: Transaction) => {
    const account = getTransactionAccount(transaction)
    const label = `${transaction.category || ""} ${account?.name || ""}`.toLowerCase()
    return /marketing|tr[aá]fego|an[uú]ncio|ads|campanha/.test(label)
  }
  const isFixedExpense = (transaction: Transaction) =>
    isResultExpense(transaction) && !hasFinancialType(transaction, "tax") && !isMarketingInvestment(transaction)
  const isInventoryCashOut = (transaction: Transaction) => hasFinancialType(transaction, "inventory_asset")
  const isOwnerWithdrawal = (transaction: Transaction) => transaction.type === "expense" && hasFinancialType(transaction, "owner_equity")
  const isOwnerContribution = (transaction: Transaction) => transaction.type === "income" && hasFinancialType(transaction, "owner_equity")
  const isRevenueIncome = (transaction: Transaction) => transaction.type === "income" && hasFinancialType(transaction, "revenue")
  const salesRevenueAccount = chartAccounts.find((account) => account.code === "1.01") || chartAccounts.find((account) => account.financial_type === "revenue" && account.cash_flow_type === "income")

  const activePeriodAccountMovements = useMemo(() => {
    const { start, end } = monthRangeISO(month)
    return activeAccountMovements.filter((movement) => movement.movement_date >= start && movement.movement_date <= end)
  }, [activeAccountMovements, month])

  const ownerCapitalSnapshot = useMemo(() => {
    const { start, end } = monthRangeISO(month)
    return buildOwnerCapitalSnapshot({
      period: {
        preset: "custom",
        startDate: start,
        endDate: end,
        label: monthOptions.find((option) => option.value === month)?.label || month,
      },
      movements: projectionTransactions.map((transaction) => {
        const account = transaction.type === "expense" && isInventoryPurchaseTransaction(transaction)
          ? chartAccounts.find((item) => item.code === "7.01") || null
          : (transaction.chart_account_id ? chartAccountById.get(transaction.chart_account_id) : undefined) || chartAccountByName.get(transaction.category) || null
        return {
          ...transaction,
          date: transaction.date,
          dueDate: transaction.due_date,
          accountName: transaction.account_id ? accountNameById.get(transaction.account_id) : undefined,
          paymentMethod: transaction.payment_method,
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
  }, [accountNameById, chartAccountById, chartAccountByName, chartAccounts, month, monthOptions, projectionTransactions])

  const metrics = useMemo(() => {
    const completedSales = sales.filter((sale) => (sale.sale_status || "completed") === "completed")
    const activeTransactions = transactions.filter((t) => t.status !== "cancelled")
    const reconciledTransactions = transactions.filter((t) => t.status === "reconciled")
    const manualIncome = reconciledTransactions.filter((t) => t.source_type !== "sale" && t.source_type !== "sale_payment" && isRevenueIncome(t)).reduce((sum, t) => sum + Number(t.amount), 0)
    const cashInflows = activePeriodAccountMovements.filter((movement) => Number(movement.amount || 0) > 0).reduce((sum, movement) => sum + Number(movement.amount || 0), 0)
    const cashOutflows = activePeriodAccountMovements.filter((movement) => Number(movement.amount || 0) < 0).reduce((sum, movement) => sum + Math.abs(Number(movement.amount || 0)), 0)
    const reconciledInventoryPurchases = reconciledTransactions.filter(isInventoryCashOut).reduce((sum, t) => sum + Number(t.amount), 0)
    const reconciledOperatingOutflows = reconciledTransactions.filter(isResultExpense).reduce((sum, t) => sum + Number(t.amount), 0)
    const reconciledOwnerWithdrawals = reconciledTransactions.filter(isOwnerWithdrawal).reduce((sum, t) => sum + Number(t.amount), 0)
    const inventoryPurchases = reconciledTransactions.filter(isInventoryCashOut).reduce((sum, t) => sum + Number(t.amount), 0)
    const ownerWithdrawals = reconciledTransactions.filter(isOwnerWithdrawal).reduce((sum, t) => sum + Number(t.amount), 0)
    const ownerContributions = reconciledTransactions.filter(isOwnerContribution).reduce((sum, t) => sum + Number(t.amount), 0)
    const paidOperatingExpenses = reconciledTransactions.filter(isResultExpense).reduce((sum, t) => sum + Number(t.amount), 0)
    const plannedOperatingExpenses = activeTransactions.filter(isResultExpense).reduce((sum, t) => sum + Number(t.amount), 0)
    const pendingOperatingExpenses = activeTransactions.filter((t) => t.status !== "reconciled" && isResultExpense(t)).reduce((sum, t) => sum + Number(t.amount), 0)
    const salesRevenue = completedSales.reduce((sum, sale) => sum + saleBusinessRevenue(sale), 0)
    const cmv = completedSales.reduce((sum, sale) => sum + saleCost(sale), 0)
    const netRevenue = salesRevenue + manualIncome
    const grossProfit = salesRevenue - cmv
    const netProfit = netRevenue - cmv - paidOperatingExpenses
    const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0
    const fixedExpenses = activeTransactions.filter(isFixedExpense).reduce((sum, t) => sum + Number(t.amount), 0)
    const grossMarginRate = salesRevenue > 0 ? grossProfit / salesRevenue : 0
    const breakEvenRevenue = grossMarginRate > 0 ? fixedExpenses / grossMarginRate : fixedExpenses
    const breakEvenGap = Math.max(0, breakEvenRevenue - salesRevenue)
    const profitCoverage = grossProfit - fixedExpenses
    const profitGap = Math.max(0, fixedExpenses - grossProfit)
    const breakEvenProgress = breakEvenRevenue > 0 ? Math.min(100, Math.round((salesRevenue / breakEvenRevenue) * 100)) : 0
    const averageTicket = completedSales.length > 0 ? salesRevenue / completedSales.length : 0
    const salesNeeded = averageTicket > 0 ? Math.ceil(breakEvenGap / averageTicket) : 0
    const accountTotal = statementBalance
    const ownerProfitWithdrawals = ownerCapitalSnapshot.ownerProfitWithdrawalsInPeriod
    const ownerCapitalReturns = ownerCapitalSnapshot.ownerCapitalReturnsInPeriod + ownerCapitalSnapshot.untracedOwnerCapitalReturnsInPeriod
    const profitAvailable = roundCurrency(netProfit - ownerProfitWithdrawals)
    const profitWithdrawalRate = netProfit > 0 ? Math.min(999, Math.round((ownerProfitWithdrawals / netProfit) * 100)) : ownerProfitWithdrawals > 0 ? 100 : 0
    const profitAvailabilityStatus: "exceeded" | "attention" | "available" = profitAvailable < 0 ? "exceeded" : profitWithdrawalRate >= 80 ? "attention" : "available"
    const pendingSales = sales.filter((sale) => (sale.sale_status || "completed") !== "cancelled" && !reconciledSaleIds.has(sale.id) && !saleIdsWithSplitPayments.has(sale.id))
    const pendingSalePayments = projectionSalePayments.filter((payment) => payment.status === "pending")
    const pendingTransactions = transactions.filter((t) => t.source_type !== "sale" && t.source_type !== "sale_payment" && t.status !== "reconciled" && t.status !== "cancelled")
    const pendingAmount =
      pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0) +
      pendingSalePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) +
      pendingTransactions.reduce((sum, t) => sum + Number(t.amount), 0)

    return {
      manualIncome,
      cashInflows,
      cashOutflows,
      reconciledInventoryPurchases,
      reconciledOperatingOutflows,
      reconciledOwnerWithdrawals,
      inventoryPurchases,
      ownerWithdrawals,
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
    }
  }, [activePeriodAccountMovements, chartAccountById, chartAccountByName, ownerCapitalSnapshot, projectionSalePayments, reconciledSaleIds, saleIdsWithSplitPayments, sales, statementBalance, transactions])

  const cashProjection = useMemo(() => {
    const today = todayISO()
    const horizon = addDaysISO(today, 60)
    const startingBalance = metrics.accountTotal
    const saleById = new Map(projectionSales.map((sale) => [String(sale.id), sale]))
    const transactionById = new Map(
      projectionTransactions
        .filter((transaction) => transaction.status !== "cancelled")
        .map((transaction) => [String(transaction.id), transaction])
    )
    const transactionBySaleId = new Map(
      projectionTransactions
        .filter((transaction) => transaction.source_type === "sale" && transaction.source_id && transaction.status !== "cancelled")
        .map((transaction) => [String(transaction.source_id), transaction])
    )
    const transactionBySalePaymentId = new Map(
      projectionTransactions
        .filter((transaction) => transaction.source_type === "sale_payment" && transaction.source_id && transaction.status !== "cancelled")
        .map((transaction) => [String(transaction.source_id), transaction])
    )
    const transactionItems = projectionTransactions
      .filter((transaction) => transaction.status !== "reconciled" && transaction.status !== "cancelled")
      .map((transaction) => {
        const rawDate = toDateOnly(transaction.due_date || transaction.date)
        const dueDate = rawDate && rawDate < today ? today : rawDate
        return {
          id: transaction.id,
          type: transaction.type,
          date: dueDate,
          originalDate: rawDate,
          description: transaction.description || transaction.category,
          category: transaction.category,
          amount: Number(transaction.amount || 0),
          signedAmount: transaction.type === "income" ? Number(transaction.amount || 0) : -Number(transaction.amount || 0),
          isOverdue: Boolean(rawDate && rawDate < today),
          isCardInvoice: transaction.payment_method === "Cartão de Crédito" || Boolean(transaction.credit_card_id),
        }
      })
    const salePaymentItems = projectionSalePayments
      .filter((payment) =>
        payment.status === "pending" &&
        !transactionBySalePaymentId.has(String(payment.id)) &&
        !(payment.transaction_id && transactionById.has(String(payment.transaction_id)))
      )
      .map((payment) => {
        const sale = saleById.get(String(payment.sale_id))
        const rawDate = toDateOnly(payment.due_date || sale?.payment_due_date || sale?.sale_date)
        const dueDate = rawDate && rawDate < today ? today : rawDate
        const amount = Number(payment.amount || 0)
        const method = payment.payment_method ? ` · ${payment.payment_method}` : ""
        return {
          id: payment.id,
          type: "income" as const,
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
    const saleItems = projectionSales
      .filter((sale: Sale) => {
        const transaction = transactionBySaleId.get(String(sale.id))
        return !transaction && !saleIdsWithSplitPayments.has(String(sale.id)) && (sale.sale_status || "completed") !== "cancelled"
      })
      .map((sale: Sale) => {
        const rawDate = toDateOnly(sale.payment_due_date || sale.sale_date)
        const dueDate = rawDate && rawDate < today ? today : rawDate
        const amount = saleNetRevenue(sale)
        return {
          id: sale.id,
          type: "income" as const,
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
      return startingBalance + pendingItems
        .filter((item) => item.date <= limit)
        .reduce((sum, item) => sum + item.signedAmount, 0)
    }
    const totalByWindow = (days: number, type: "income" | "expense") => {
      const limit = addDaysISO(today, days)
      return pendingItems
        .filter((item) => item.date <= limit && item.type === type)
        .reduce((sum, item) => sum + item.amount, 0)
    }
    const overdue = pendingItems
      .filter((item) => item.isOverdue)
      .reduce((sum, item) => sum + item.signedAmount, 0)
    const nextSevenOut = totalByWindow(7, "expense")
    const nextSevenIn = totalByWindow(7, "income")
    const minBalance = chart.reduce((min, item) => Math.min(min, item.saldo), startingBalance)

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
      nextSevenOut,
      nextSevenIn,
      minBalance,
    }
  }, [metrics.accountTotal, projectionTransactions, projectionSalePayments, projectionSales, saleIdsWithSplitPayments])

  const profitFutureRisk = useMemo(() => {
    const nextMonthStartDate = addMonthsISO(`${month}-01`, 1)
    if (!nextMonthStartDate) return null
    const nextMonthKey = nextMonthStartDate.slice(0, 7)
    const { start: nmStart, end: nmEnd } = monthRangeISO(nextMonthKey)
    const futureExpenses = cashProjection.pendingItems
      .filter((item) => item.type === "expense" && item.originalDate && item.originalDate >= nmStart && item.originalDate <= nmEnd)
      .sort((a, b) => (a.originalDate || a.date).localeCompare(b.originalDate || b.date))
    if (futureExpenses.length === 0) {
      return { items: [], futureTotal: 0, projectedCashAfter: null as number | null, nextMonthKey, nextMonthLabel: "" }
    }
    const futureTotal = futureExpenses.reduce((sum, item) => sum + item.amount, 0)
    const projectedCashAfter = cashProjection.startingBalance + cashProjection.pendingItems
      .filter((item) => item.date <= nmEnd)
      .reduce((sum, item) => sum + item.signedAmount, 0)
    const monthDate = new Date(`${nextMonthKey}-01T00:00:00`)
    const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    const nextMonthLabel = monthFormatter.format(monthDate).replace(/^\w/, (letter) => letter.toUpperCase())
    return { items: futureExpenses, futureTotal, projectedCashAfter, nextMonthKey, nextMonthLabel }
  }, [cashProjection, month])

  const profitDecision = useMemo(() => {
    const committed = profitFutureRisk?.futureTotal ?? 0
    const availableToday = metrics.profitAvailable
    const availableAfter = roundCurrency(availableToday - committed)
    const impactRate = availableToday > 0
      ? Math.min(999, Math.round((committed / availableToday) * 100))
      : committed > 0
      ? 100
      : 0
    let status: "exceeded" | "attention" | "available"
    if (availableAfter < 0 || metrics.profitAvailabilityStatus === "exceeded") status = "exceeded"
    else if (impactRate >= 30 || metrics.profitAvailabilityStatus === "attention") status = "attention"
    else status = "available"
    return {
      availableToday,
      committed,
      availableAfter,
      impactRate,
      status,
      hasCommitments: committed > 0,
      nextMonthLabel: profitFutureRisk?.nextMonthLabel ?? "",
      projectedCashAfter: profitFutureRisk?.projectedCashAfter ?? null,
    }
  }, [metrics.profitAvailable, metrics.profitAvailabilityStatus, profitFutureRisk])

  const productRecommendations = useMemo(() => {
    return inventory
      .map((item) => {
        const suggestedPrice = Number(item.suggested_price || 0)
        const cost = Number(item.purchase_price || 0)
        const unitProfit = suggestedPrice - cost
        const marginPct = suggestedPrice > 0 ? (unitProfit / suggestedPrice) * 100 : 0
        const quantity = Math.max(1, Number(item.quantity || 1))
        return {
          id: item.id,
          name: getProductName({
            catalog: item.catalog ? {
              model: item.catalog.model || undefined,
              storage: item.catalog.storage || undefined,
              color: item.catalog.color || undefined,
            } : null,
            notes: item.notes,
            condition_notes: item.condition_notes,
          }),
          suggestedPrice,
          cost,
          unitProfit,
          marginPct,
          quantity,
          unitsToGoal: metrics.profitGap > 0 && unitProfit > 0 ? Math.ceil(metrics.profitGap / unitProfit) : 0,
          score: unitProfit * Math.min(quantity, 3) + marginPct * 10,
        }
      })
      .filter((item) => item.suggestedPrice > 0 && item.unitProfit > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }, [inventory, metrics.profitGap])

  const flowChart = useMemo(() => {
    const days = new Map<string, { date: string; entradas: number; saidas: number; saldo: number }>()
    const { start, end } = monthRangeISO(month)
    let running = activeAccountMovements
      .filter((movement) => movement.movement_date < start)
      .reduce((sum, movement) => sum + Number(movement.amount || 0), 0)

    for (const movement of activeAccountMovements) {
      if (movement.movement_date < start || movement.movement_date > end) continue
      const row = days.get(movement.movement_date) || { date: movement.movement_date, entradas: 0, saidas: 0, saldo: 0 }
      if (movement.amount >= 0) row.entradas += Number(movement.amount)
      else row.saidas += Math.abs(Number(movement.amount))
      days.set(movement.movement_date, row)
    }

    return Array.from(days.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        running += row.entradas - row.saidas
        return { ...row, dia: row.date.slice(8, 10), saldo: running }
      })
  }, [activeAccountMovements, month])

  const expensesByCategory = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const t of transactions.filter((item) => item.status === "reconciled" && item.type === "expense")) {
      grouped.set(t.category, (grouped.get(t.category) || 0) + Number(t.amount))
    }
    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [transactions])

  const recentMovements = useMemo(() => {
    const saleMovements = sales
      .filter((sale) => !saleIdsWithSplitPayments.has(String(sale.id)))
      .slice(0, 8)
      .map((sale) => ({
        id: sale.id,
        kind: "sale" as const,
        date: sale.sale_date,
        description: `Venda${sale.inventory?.catalog?.model ? ` · ${sale.inventory.catalog.model}` : ""}`,
        category: "Venda",
        amount: saleNetRevenue(sale),
        status: saleFinanceStatusBySaleId.get(String(sale.id)) || "pending" as DashboardMovementStatus,
      }))
    const manual = transactions
      .filter((t) => t.source_type !== "sale")
      .slice(0, 8)
      .map((t) => ({
        id: t.id,
        kind: "transaction" as const,
        date: t.date,
        description: t.description || t.category,
        category: t.category,
        amount: t.type === "income" ? Number(t.amount) : -Number(t.amount),
        status: (t.status === "reconciled" ? "reconciled" : t.status === "cancelled" ? "cancelled" : "pending") as DashboardMovementStatus,
      }))
    return [...saleMovements, ...manual]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
  }, [saleFinanceStatusBySaleId, saleIdsWithSplitPayments, sales, transactions])

  const profitWithdrawalTimeline = useMemo(() => {
    let running = 0
    return ownerCapitalSnapshot.ownerProfitWithdrawalMovements.map((movement) => {
      running += Number(movement.amount || 0)
      return { ...movement, accumulated: roundCurrency(running) }
    })
  }, [ownerCapitalSnapshot])

  const defaultAccount = accountBalances.find((account) => account.id === selectedAccountId) || accountBalances[0]

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!accountName.trim()) return
    setSavingAccount(true)
    try {
      const { data, error } = await (supabase.from("finance_accounts") as any).insert({
        name: accountName.trim(),
        institution: accountInstitution.trim() || null,
        account_type: "checking",
        opening_balance: parseCurrencyInput(openingBalance),
      })
      if (error) throw error
      const created = Array.isArray(data) ? data[0] : data
      if (created?.id) setSelectedAccountId(created.id)
      toast({ title: "Conta cadastrada", type: "success" })
      setShowAccountForm(false)
      setAccountName("Conta principal")
      setAccountInstitution("")
      setOpeningBalance("R$ 0,00")
      fetchFinance()
    } catch (error: any) {
      toast({ title: "Erro ao cadastrar conta", description: error.message, type: "error" })
    } finally {
      setSavingAccount(false)
    }
  }

  const reconcileMovement = async (movement: (typeof recentMovements)[number]) => {
    if (!defaultAccount) {
      setShowAccountForm(true)
      toast({ title: "Cadastre uma conta primeiro", description: "A conciliação precisa saber em qual conta o dinheiro entrou ou saiu.", type: "error" })
      return
    }
    setReconcilingId(movement.id)
    try {
      if (movement.kind === "sale") {
        const sale = sales.find((item) => item.id === movement.id)
        if (!sale) return
        const { data: { user } } = await supabase.auth.getUser()
        const transactionId = await upsertSaleReceivable({
          supabase,
          saleId: sale.id,
          accountId: defaultAccount.id,
          chartAccountId: salesRevenueAccount?.id || null,
          amount: saleNetRevenue(sale),
          saleDate: todayISO(),
          dueDate: sale.payment_due_date || sale.sale_date,
          paymentMethod: sale.payment_method || null,
          description: movement.description,
          status: "reconciled",
        })
        if (transactionId) {
          await requestSyncTransactionMovement(transactionId, { createdBy: user?.id ?? null })
        }
      } else {
        const { error } = await (supabase.from("transactions") as any)
          .update({ account_id: defaultAccount.id, status: "reconciled", reconciled_at: new Date().toISOString() })
          .eq("id", movement.id)
        if (error) throw error
        const { data: { user } } = await supabase.auth.getUser()
        await requestSyncTransactionMovement(movement.id, { createdBy: user?.id ?? null })
      }
      toast({ title: "Movimento conciliado", type: "success" })
      fetchFinance()
    } catch (error: any) {
      toast({ title: "Erro ao conciliar", description: error.message, type: "error" })
    } finally {
      setReconcilingId(null)
    }
  }

  const undoReconciliation = async (movement: (typeof recentMovements)[number]) => {
    setReconcilingId(movement.id)
    try {
      if (movement.kind === "sale") {
        const { data: saleTx } = await (supabase.from("transactions") as any)
          .select("id")
          .eq("source_type", "sale")
          .eq("source_id", movement.id)
          .neq("status", "cancelled")
          .limit(1)
          .maybeSingle()
        if (saleTx?.id) {
          const { error } = await (supabase.from("transactions") as any)
            .update({ account_id: null, status: "pending", reconciled_at: null })
            .eq("id", saleTx.id)
          if (error) throw error
          const { data: { user } } = await supabase.auth.getUser()
          await requestSyncTransactionMovement(String(saleTx.id), { createdBy: user?.id ?? null })
        }
      } else {
        const { error } = await (supabase.from("transactions") as any)
          .update({ account_id: null, status: "pending", reconciled_at: null })
          .eq("id", movement.id)
        if (error) throw error
        const { data: { user } } = await supabase.auth.getUser()
        await requestSyncTransactionMovement(movement.id, { createdBy: user?.id ?? null })
      }
      setUndoConfirmId(null)
      toast({ title: "Conciliação desfeita", type: "success" })
      fetchFinance()
    } catch (error: any) {
      toast({ title: "Erro ao desfazer conciliação", description: error.message, type: "error" })
    } finally {
      setReconcilingId(null)
    }
  }

  const startEditingAccount = (account: (typeof accountBalances)[number]) => {
    setEditingAccountId(account.id)
    setEditAccountName(account.name)
    setEditAccountInstitution(account.institution || "")
  }

  const saveAccountDetails = async (account: (typeof accountBalances)[number]) => {
    if (!editAccountName.trim()) {
      toast({ title: "Informe o nome da conta", type: "error" })
      return
    }
    setSavingAccountId(account.id)
    try {
      const { error } = await (supabase.from("finance_accounts") as any)
        .update({ name: editAccountName.trim(), institution: editAccountInstitution.trim() || null })
        .eq("id", account.id)
      if (error) throw error
      setEditingAccountId(null)
      toast({ title: "Conta atualizada", type: "success" })
      fetchFinance()
    } catch (error: any) {
      toast({ title: "Erro ao atualizar conta", description: error.message, type: "error" })
    } finally {
      setSavingAccountId(null)
    }
  }

  const archiveAccount = async (account: (typeof accountBalances)[number]) => {
    if (archiveConfirmId !== account.id) {
      setArchiveConfirmId(account.id)
      return
    }
    setSavingAccountId(account.id)
    try {
      const { error } = await (supabase.from("finance_accounts") as any)
        .update({ is_active: false })
        .eq("id", account.id)
      if (error) throw error
      setArchiveConfirmId(null)
      if (selectedAccountId === account.id) setSelectedAccountId("")
      toast({ title: "Conta arquivada", description: "Os movimentos antigos continuam preservados.", type: "success" })
      fetchFinance()
    } catch (error: any) {
      toast({ title: "Erro ao arquivar conta", description: error.message, type: "error" })
    } finally {
      setSavingAccountId(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Financeiro</h2>
          <p className="text-sm text-gray-500">Caixa, conciliação, DRE gerencial e ponto de equilíbrio da loja.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Mês do painel financeiro"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 shadow-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setShowAccountForm(true)}>
            <Landmark className="mr-2 h-4 w-4" /> Cadastrar conta
          </Button>
          <Link href="/financeiro/transacoes">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Lançar despesa/receita
            </Button>
          </Link>
        </div>
      </div>

      {showAccountForm && (
        <Card className="p-4 border-royal-100 bg-royal-50/40">
          <form onSubmit={createAccount} className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end">
            <Input label="Nome da conta" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            <Input label="Banco / instituição" placeholder="Ex: Inter, Itaú, Caixa da loja" value={accountInstitution} onChange={(event) => setAccountInstitution(event.target.value)} />
            <Input
              label="Saldo inicial"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(formatCurrencyInput(event.target.value))}
            />
            <div className="flex gap-2">
              <Button type="submit" isLoading={savingAccount}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setShowAccountForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="Saldo em contas" value={formatBRL(metrics.accountTotal)} icon={Wallet} tone="navy" hint={`Fonte: extrato · ${accountBalances.length} conta(s)`} />
        <MetricCard title="Entradas conciliadas" value={formatBRL(metrics.cashInflows)} icon={ArrowUpRight} tone="green" hint={`Receita do mês: ${formatBRL(metrics.netRevenue)}`} />
        <MetricCard title="Saídas de caixa" value={formatBRL(metrics.cashOutflows)} icon={ArrowDownRight} tone="red" hint={`Estoque ${formatBRL(metrics.reconciledInventoryPurchases)} · retiradas ${formatBRL(metrics.reconciledOwnerWithdrawals)}`} />
        <MetricCard title="Resultado líquido" value={formatBRL(metrics.netProfit)} icon={LineChart} tone={metrics.netProfit >= 0 ? "green" : "red"} hint="DRE gerencial: lucro bruto - despesas pagas" />
      </div>

      {loading ? (
        <ProfitAvailabilitySkeleton />
      ) : (
        <Card className="overflow-hidden border-gray-100 bg-white/95 shadow-sm">
          <div className="grid lg:grid-cols-[1.12fr_0.88fr]">
            <div className="border-b border-gray-100/80 p-5 lg:border-b-0 lg:border-r lg:p-6">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 sm:flex">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-navy-900 font-syne">Movimento de lucro</h3>
                    <p className="mt-1 text-sm text-gray-500">Acompanhe o lucro gerado, retiradas e compromissos futuros.</p>
                  </div>
                </div>
                <div className="rounded-xl bg-rose-50/40 px-3 py-1.5 text-left ring-1 ring-rose-100/70 sm:text-right">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-rose-600/70">Total retirado</span>
                  <span className="mt-0.5 block whitespace-nowrap text-[13px] font-bold tabular-nums text-rose-600">-{formatBRL(metrics.ownerProfitWithdrawals)}</span>
                </div>
              </div>

              <ProfitMovementTimeline
                netProfit={metrics.netProfit}
                withdrawals={profitWithdrawalTimeline}
                futureRisk={profitFutureRisk}
                currentMonthLabel={formatMonthLabel(month).toUpperCase()}
              />
              {profitWithdrawalTimeline.length > 5 && (
                <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">Há mais retiradas no período. Veja Entradas e Saídas para a lista completa.</p>
              )}

              {ownerCapitalSnapshot.ownerCapitalReturnWithoutTrackedContribution.length > 0 ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100/70 bg-amber-50/40 px-3 py-2 text-[11px] leading-relaxed text-amber-700/90">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  <p>
                    {ownerCapitalSnapshot.ownerCapitalReturnWithoutTrackedContribution.length} reembolso{ownerCapitalSnapshot.ownerCapitalReturnWithoutTrackedContribution.length === 1 ? "" : "s"} de aporte excederam os aportes rastreados e ficaram fora das retiradas de lucro.
                  </p>
                </div>
              ) : metrics.ownerCapitalReturns > 0 ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  <p>Reembolsos de aporte no período: {formatBRL(metrics.ownerCapitalReturns)}. Fora das retiradas de lucro.</p>
                </div>
              ) : null}
            </div>

            <div className="bg-gradient-to-br from-white via-emerald-50/15 to-white p-5 lg:p-6 animate-fade-in">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 sm:flex">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-navy-900 font-syne">Lucro disponível</h3>
                    <p className="mt-1 text-sm text-gray-500">Decisão de retirada considerando compromissos M+1.</p>
                  </div>
                </div>
                <Badge
                  className="shrink-0 whitespace-nowrap px-3 py-1 text-[11px]"
                  variant={profitDecision.status === "exceeded" ? "red" : profitDecision.status === "attention" ? "yellow" : "green"}
                >
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
                  {profitDecision.status === "exceeded" ? "Excedido" : profitDecision.status === "attention" ? "Atenção" : "Disponível"}
                </Badge>
              </div>

              {/* Block 1: white card — Disponível hoje */}
              <div className="rounded-3xl border border-gray-100/80 bg-white/95 p-3.5 sm:p-4">
                <ProfitSummaryLine label="Resultado líquido" value={metrics.netProfit} />
                <ProfitSummaryLine label="Retiradas de lucro" value={-metrics.ownerProfitWithdrawals} tone="red" />
                <div className="my-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                <ProfitSummaryLine label="Disponível hoje" value={metrics.profitAvailable} highlight tone={metrics.profitAvailable >= 0 ? "green" : "red"} />
              </div>

              {/* Block 2: amber card — Compromissos M+1 */}
              {profitDecision.hasCommitments && (
                <div className="relative mt-3 overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50/70 via-amber-50/40 to-white p-3.5 sm:p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">Compromissos · {profitDecision.nextMonthLabel} (M+1)</span>
                    <span className="relative flex h-6 w-6 items-center justify-center">
                      <span aria-hidden className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
                      <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    </span>
                  </div>
                  <ProfitSummaryLine label="Total compromissos M+1" value={-profitDecision.committed} tone="red" />
                  <ProfitSummaryLine
                    label="Disponível após compromissos"
                    value={profitDecision.availableAfter}
                    highlight
                    tone={profitDecision.availableAfter >= 0 ? "green" : "red"}
                  />
                  {profitDecision.projectedCashAfter !== null && (
                    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-1">
                      <span className="min-w-0 truncate text-[11px] text-gray-500">Caixa projetado M+1 (referência)</span>
                      <span className="whitespace-nowrap text-right text-[11px] font-semibold tabular-nums text-gray-600">{formatBRL(profitDecision.projectedCashAfter)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Block 3: emerald margem segura */}
              <div className={cn(
                "mt-3 flex items-start gap-3 rounded-2xl border p-3",
                profitDecision.status === "exceeded"
                  ? "border-rose-100 bg-rose-50/40"
                  : profitDecision.status === "attention"
                  ? "border-amber-100 bg-amber-50/40"
                  : "border-emerald-100 bg-emerald-50/40"
              )}>
                <div className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  profitDecision.status === "exceeded"
                    ? "bg-rose-100 text-rose-600"
                    : profitDecision.status === "attention"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                )}>
                  <Shield className="h-3.5 w-3.5" />
                </div>
                <p className={cn(
                  "text-[12px] leading-relaxed",
                  profitDecision.status === "exceeded"
                    ? "text-rose-900"
                    : profitDecision.status === "attention"
                    ? "text-amber-900"
                    : "text-emerald-900"
                )}>
                  {profitDecision.hasCommitments ? (
                    profitDecision.availableAfter < 0 ? (
                      <>
                        <strong>Atenção:</strong> compromissos de {profitDecision.nextMonthLabel} excedem o lucro disponível hoje em <span className="font-semibold tabular-nums">{formatBRL(Math.abs(profitDecision.availableAfter))}</span>. Retirar agora pode quebrar o caixa.
                      </>
                    ) : (
                      <>
                        <strong>Margem segura estimada: <span className="tabular-nums">{formatBRL(profitDecision.availableAfter)}</span></strong> após compromissos de {profitDecision.nextMonthLabel}. Você tem <span className="font-semibold tabular-nums">{formatBRL(profitDecision.availableToday)}</span> disponível hoje, mas <span className="font-semibold tabular-nums text-amber-700">{formatBRL(profitDecision.committed)}</span> já está reservado para contas futuras.
                      </>
                    )
                  ) : metrics.profitAvailable > 0 ? (
                    <>Sem compromissos M+1 mapeados. <strong>Margem segura: <span className="tabular-nums">{formatBRL(metrics.profitAvailable)}</span></strong>.</>
                  ) : (
                    <>Sem lucro disponível para retirada neste período.</>
                  )}
                </p>
              </div>

              {/* Progress bars */}
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1 text-gray-500">Lucro retirado <Info className="h-3 w-3 text-gray-300" /></span>
                    <span className={cn(
                      "tabular-nums",
                      metrics.profitAvailabilityStatus === "exceeded" ? "text-rose-600" :
                      metrics.profitAvailabilityStatus === "attention" ? "text-amber-600" :
                      "text-emerald-600"
                    )}>{metrics.profitWithdrawalRate}%</span>
                  </div>
                  <ProfitWithdrawalRateBar rate={metrics.profitWithdrawalRate} status={metrics.profitAvailabilityStatus} />
                </div>

                {profitDecision.hasCommitments && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1 text-gray-500">Comprometido em M+1 <Info className="h-3 w-3 text-gray-300" /></span>
                      <span className="tabular-nums text-amber-700">{Math.min(999, profitDecision.impactRate)}%</span>
                    </div>
                    <ProfitWithdrawalRateBar rate={profitDecision.impactRate} status={profitDecision.status === "exceeded" ? "exceeded" : "attention"} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="grid gap-4 border-b border-gray-100 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-royal-500" />
              <h3 className="font-display font-bold text-navy-900 font-syne">Fluxo de caixa futuro</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Projeção baseada em contas a pagar, contas a receber e faturas de cartão já lançadas. Cartão parcelado não vira parcelas a receber, porque a maquininha liquida no ato.
            </p>
          </div>
          <Badge variant={cashProjection.minBalance >= 0 ? "green" : "red"}>
            {cashProjection.minBalance >= 0 ? "Caixa saudável" : "Risco de caixa"}
          </Badge>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-3 sm:grid-cols-3">
            <ProjectionCard title="15 dias" value={cashProjection.balance15} hint={`Entradas ${formatBRL(cashProjection.nextSevenIn)} · saídas ${formatBRL(cashProjection.nextSevenOut)} em 7d`} />
            <ProjectionCard title="30 dias" value={cashProjection.balance30} hint={`${formatBRL(cashProjection.income30)} entra · ${formatBRL(cashProjection.expense30)} sai`} />
            <ProjectionCard title="60 dias" value={cashProjection.balance60} hint={`Menor saldo: ${formatBRL(cashProjection.minBalance)}`} />
          </div>
          <div className="relative h-48 min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-surface p-3">
            {cashProjection.chart.length > 1 ? (
              <LazyChart>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                  <AreaChart data={cashProjection.chart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="futureCashColor" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8eef7" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value) => formatBRL(Number(value || 0))} labelFormatter={(label) => `Saldo previsto em ${label}`} />
                    <Area type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} fill="url(#futureCashColor)" />
                  </AreaChart>
                </ResponsiveContainer>
              </LazyChart>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-gray-400">
                Sem entradas ou saídas futuras lançadas para os próximos 60 dias.
              </div>
            )}
          </div>
        </div>
        {cashProjection.pendingItems.length > 0 && (
          <div className="border-t border-gray-100 px-5 pb-5">
            <div className="mb-3 mt-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-gray-400">Próximos movimentos</p>
              <Link href="/financeiro/transacoes" className="text-xs font-semibold text-royal-500">Ver todos</Link>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {cashProjection.pendingItems.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">{item.description}</p>
                    <p className="text-xs text-gray-500">
                      {item.isOverdue ? "Vencido" : formatShortDate(item.date)}
                      {item.isCardInvoice ? " · cartão" : ""}
                    </p>
                  </div>
                  <p className={cn("shrink-0 text-sm font-bold", item.type === "income" ? "text-emerald-600" : "text-red-600")}>
                    {item.type === "income" ? "+" : "-"}{formatBRL(item.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card id="dre" className="scroll-mt-24 p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-display font-bold text-navy-900 font-syne">Saúde financeira</h3>
              <p className="text-sm text-gray-500">Ponto de equilíbrio usa despesas operacionais previstas e margem bruta real. Estoque e sócios ficam fora do resultado.</p>
            </div>
            <div className="shrink-0 self-start">
              <Badge variant={metrics.netProfit >= 0 ? "green" : "red"}>{metrics.netProfit >= 0 ? "No azul" : "Atenção"}</Badge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Ponto de equilíbrio</p>
              <p className="mt-2 min-w-0 text-[1.35rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-xl">{formatBRL(metrics.breakEvenRevenue)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {metrics.fixedExpenses > 0 ? "Meta mínima de vendas no mês" : "Lance despesas fixas para calcular"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Faturamento atual</p>
              <p className="mt-2 min-w-0 text-[1.35rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-xl">{formatBRL(metrics.salesRevenue)}</p>
              <p className="mt-1 text-xs text-gray-500">{metrics.breakEvenProgress}% do ponto de equilíbrio</p>
            </div>
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">{metrics.breakEvenGap > 0 ? "Falta vender" : "Folga sobre equilíbrio"}</p>
              <p className={cn("mt-2 min-w-0 text-[1.35rem] font-bold leading-tight tabular-nums 2xl:text-xl", metrics.breakEvenGap > 0 ? "text-navy-900" : "text-emerald-600")}>
                {metrics.breakEvenGap > 0 ? formatBRL(metrics.breakEvenGap) : formatBRL(Math.max(0, metrics.profitCoverage))}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {metrics.salesNeeded > 0 ? `Aprox. ${metrics.salesNeeded} venda(s) no ticket atual` : "Lucro bruto acima das despesas fixas"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Despesas fixas</p>
              <p className="mt-2 min-w-0 text-[1.35rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-xl">{formatBRL(metrics.fixedExpenses)}</p>
              <p className="mt-1 text-xs text-gray-500">{metrics.pendingOperatingExpenses > 0 ? `${formatBRL(metrics.pendingOperatingExpenses)} ainda em aberto` : "Sem pendências operacionais"}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
              <span>Progresso até o ponto de equilíbrio</span>
              <span>{metrics.breakEvenProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn("h-full rounded-full transition-all", metrics.breakEvenGap > 0 ? "bg-royal-500" : "bg-emerald-500")}
                style={{ width: `${metrics.breakEvenProgress}%` }}
              />
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-royal-100 bg-royal-50/40 p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-royal-600 shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-navy-900">Inteligência de venda</p>
                <p className="text-xs text-gray-500">
                  {metrics.profitGap > 0
                    ? `Ainda faltam ${formatBRL(metrics.profitGap)} de lucro para cobrir as despesas.`
                    : `Há ${formatBRL(Math.max(0, metrics.profitCoverage))} de lucro bruto acima das despesas fixas. Resultado líquido e retirada continuam no card de lucro disponível.`}
                </p>
              </div>
            </div>
            {productRecommendations.length > 0 ? (
              <div className="grid gap-2">
                {productRecommendations.map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-xl border border-white bg-white p-3 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-bold text-white">#{index + 1}</span>
                        <p className="truncate font-semibold text-navy-900">{item.name}</p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatBRL(item.suggestedPrice)} venda · {formatBRL(item.unitProfit)} lucro estimado · {item.marginPct.toFixed(1)}% margem · {item.quantity} em estoque
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-semibold uppercase text-gray-400">{metrics.profitGap > 0 ? "Para cobrir" : "Prioridade"}</p>
                      <p className="font-bold text-emerald-600">
                        {metrics.profitGap > 0 ? `${Math.max(1, item.unitsToGoal)} un.` : "Vender primeiro"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-white p-3 text-sm text-gray-500">Cadastre preço sugerido e custo nos produtos em estoque para o sistema recomendar o que vender primeiro.</p>
            )}
          </div>
          <div className="relative mt-5 h-56 min-w-0">
            {flowChart.length > 0 ? (
              <LazyChart>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                  <AreaChart data={flowChart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="saldoColor" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value) => formatBRL(Number(value || 0))} labelFormatter={(label) => `Saldo do extrato no dia ${label}`} />
                    <Area type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} fill="url(#saldoColor)" />
                  </AreaChart>
                </ResponsiveContainer>
              </LazyChart>
            ) : (
              <EmptyState icon={LineChart} title="Sem movimentos no extrato" text="Lance ou concilie movimentos no extrato para acompanhar a curva real do caixa." />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Contas da empresa</h3>
              <p className="text-sm text-gray-500">Valores vindos dos movimentos do extrato vinculados a cada conta.</p>
            </div>
            <Building2 className="h-5 w-5 text-royal-500" />
          </div>
          {accountBalances.length === 0 ? (
            <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" text="Cadastre a conta PJ ou o caixa físico para iniciar a conciliação." action={<Button size="sm" onClick={() => setShowAccountForm(true)}>Cadastrar conta</Button>} />
          ) : (
            <div className="space-y-3">
              {accountBalances.map((account) => (
                <div key={account.id} className={cn("rounded-xl border p-4", selectedAccountId === account.id ? "border-royal-200 bg-royal-50/30" : "border-gray-100")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-navy-900">{account.name}</p>
                        <p className="text-xs text-gray-500">{account.institution || "Instituição não informada"}</p>
                        {selectedAccountId === account.id && <p className="mt-1 text-xs font-semibold text-royal-600">Conta de conciliação</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-navy-900">{formatBRL(account.balance)}</p>
                      <div className="mt-1 flex flex-wrap justify-end gap-2 text-xs font-semibold">
                        <button type="button" onClick={() => setSelectedAccountId(account.id)} className="text-royal-500 hover:text-royal-700">Usar</button>
                        <button type="button" onClick={() => startEditingAccount(account)} className="text-gray-400 hover:text-navy-900">Editar</button>
                        <Link href="/financeiro/extrato" className="text-gray-400 hover:text-navy-900">Corrigir saldo</Link>
                        <button type="button" onClick={() => archiveAccount(account)} className="text-gray-400 hover:text-red-600">
                          {archiveConfirmId === account.id ? "Confirmar" : "Arquivar"}
                        </button>
                      </div>
                    </div>
                  </div>
                  {editingAccountId === account.id && (
                    <div className="mt-3 grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <Input label="Nome da conta" value={editAccountName} onChange={(event) => setEditAccountName(event.target.value)} />
                      <Input label="Banco / instituição" value={editAccountInstitution} onChange={(event) => setEditAccountInstitution(event.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveAccountDetails(account)} isLoading={savingAccountId === account.id}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingAccountId(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-5">
          <div className="mb-5">
            <h3 className="font-display font-bold text-navy-900 font-syne">DRE gerencial</h3>
            <p className="text-sm text-gray-500">Resumo de resultado do mês selecionado.</p>
          </div>
          <DreLine label="Receita líquida" value={metrics.netRevenue} strong />
          <DreLine label="(-) CMV / custo dos produtos" value={-metrics.cmv} />
          <DreLine label="= Lucro bruto" value={metrics.grossProfit} strong />
          <DreLine label="(-) Despesas operacionais pagas" value={-metrics.paidOperatingExpenses} />
          {metrics.pendingOperatingExpenses > 0 && (
            <DreLine label="Despesas operacionais em aberto (não DRE)" value={-metrics.pendingOperatingExpenses} muted />
          )}
          {metrics.inventoryPurchases > 0 && (
            <DreLine label="Compras de estoque (caixa, não DRE)" value={-metrics.inventoryPurchases} muted />
          )}
          {(metrics.ownerContributions > 0 || metrics.ownerWithdrawals > 0) && (
            <DreLine label="Movimentação dos sócios (caixa, não DRE)" value={metrics.ownerContributions - metrics.ownerWithdrawals} muted />
          )}
          <DreLine label="= Resultado líquido" value={metrics.netProfit} highlight />
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Saídas por categoria</h3>
              <p className="text-sm text-gray-500">Caixa conciliado: estoque, operação e demais saídas.</p>
            </div>
            <Link href="/financeiro/gastos" className="text-sm font-semibold text-royal-500">Ver gastos</Link>
          </div>
          <div className="relative h-64 min-w-0">
            {expensesByCategory.length > 0 ? (
              <LazyChart>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                  <BarChart data={expensesByCategory} layout="vertical" margin={{ left: 8, right: 18, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatBRL(Number(value || 0))} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {expensesByCategory.map((_, index) => <Cell key={index} fill={expenseColors[index % expenseColors.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </LazyChart>
            ) : (
              <EmptyState icon={ReceiptText} title="Sem despesas" text="As despesas registradas aparecerão agrupadas aqui." />
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b border-gray-100 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Movimentos recentes</h3>
            <p className="text-sm text-gray-500">Vendas e lançamentos para conciliar com a conta da empresa.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {accountBalances.length > 0 && (
              <select
                aria-label="Conta usada para conciliar movimentos"
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
              >
                {accountBalances.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            )}
            <Link href="/financeiro/transacoes" className="text-sm font-semibold text-royal-500">Ver todos</Link>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Carregando financeiro...</div>
          ) : recentMovements.length === 0 ? (
            <EmptyState icon={Banknote} title="Sem movimentos" text="Nenhuma venda ou lançamento no mês selecionado." />
          ) : recentMovements.map((movement) => (
            <div key={`${movement.kind}-${movement.id}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_130px_130px_150px] sm:items-center">
              <div className="flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", movement.amount >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
                  {movement.amount >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-semibold text-navy-900">{movement.description}</p>
                  <p className="text-xs text-gray-500">{movement.category} · {formatDate(movement.date)}</p>
                </div>
              </div>
              <p className={cn("font-bold sm:text-right", movement.amount >= 0 ? "text-emerald-600" : "text-red-600")}>{movement.amount >= 0 ? "+" : "-"}{formatBRL(Math.abs(movement.amount))}</p>
              <div className="sm:text-center">
                <Badge variant={movementStatusVariant(movement.status)}>{movementStatusLabel(movement.status)}</Badge>
              </div>
              <div className="sm:text-right">
                {movement.status === "reconciled" ? (
                  <div className="flex items-center justify-end gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
                    {undoConfirmId === movement.id ? (
                      <Button size="sm" variant="outline" onClick={() => undoReconciliation(movement)} isLoading={reconcilingId === movement.id}>
                        Confirmar
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setUndoConfirmId(movement.id)}
                        className="text-xs font-semibold text-gray-400 hover:text-red-600"
                      >
                        Desfazer
                      </button>
                    )}
                  </div>
                ) : movement.status === "cancelled" || movement.status === "reversed" || movement.status === "reversal" ? (
                  <span className="text-xs font-semibold text-gray-400">Sem ação</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => reconcileMovement(movement)} isLoading={reconcilingId === movement.id}>
                    Conciliar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function MetricCard({ title, value, hint, icon: Icon, tone }: { title: string; value: string; hint: string; icon: any; tone: "navy" | "green" | "red" }) {
  const toneClass = {
    navy: "bg-navy-900 text-white",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
  }[tone]
  return (
    <Card className="min-w-0 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="min-w-0 pr-3 text-xs font-semibold uppercase text-gray-400">{title}</p>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="min-w-0 text-[1.45rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{hint}</p>
    </Card>
  )
}

function ProjectionCard({ title, value, hint }: { title: string; value: number; hint: string }) {
  const positive = value >= 0
  return (
    <div className={cn(
      "min-w-0 rounded-2xl border p-4",
      positive ? "border-emerald-100 bg-emerald-50/40" : "border-red-100 bg-red-50/50"
    )}>
      <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
      <p className={cn("mt-2 text-[1.35rem] font-bold leading-tight tabular-nums", positive ? "text-navy-900" : "text-red-600")}>
        {formatBRL(value)}
      </p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  )
}

function DreLine({ label, value, strong, highlight, muted }: { label: string; value: number; strong?: boolean; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-gray-100 py-3 last:border-0", highlight && "rounded-xl border-0 bg-royal-50 px-3", strong && "font-semibold")}>
      <span className={cn("text-sm", highlight ? "text-royal-700" : muted ? "text-gray-400" : "text-gray-600")}>{label}</span>
      <span className={cn("font-bold", muted ? "text-gray-400" : value < 0 ? "text-red-600" : highlight ? "text-royal-700" : "text-navy-900")}>
        {value < 0 ? "-" : ""}{formatBRL(Math.abs(value))}
      </span>
    </div>
  )
}

function ProfitSummaryLine({ label, value, highlight, tone }: { label: string; value: number; highlight?: boolean; tone?: "green" | "red" | "navy" }) {
  const valueTone = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-600" : "text-navy-900"
  const highlightFrame = tone === "red"
    ? "bg-gradient-to-br from-rose-50/80 via-white to-white ring-rose-100"
    : "bg-gradient-to-br from-emerald-50/70 via-white to-white ring-emerald-100"
  return (
    <div className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2.5",
      highlight && cn("mt-1 rounded-2xl px-3 py-3 ring-1", highlightFrame)
    )}>
      <span className={cn(
        "min-w-0 truncate text-sm",
        highlight ? "font-semibold text-navy-700" : "text-gray-500"
      )}>{label}</span>
      <span className={cn(
        "whitespace-nowrap text-right font-bold tabular-nums",
        highlight ? "text-base sm:text-lg" : "text-sm",
        valueTone
      )}>
        {value < 0 ? "-" : ""}{formatBRL(Math.abs(value))}
      </span>
    </div>
  )
}

type ProfitWithdrawalRow = {
  movementId: string
  date: string
  description: string
  amount: number
  accumulated: number
}

type ProfitFutureRisk = {
  items: Array<{ id: string; originalDate: string | null; date: string; description: string; amount: number; isCardInvoice: boolean }>
  futureTotal: number
  projectedCashAfter: number | null
  nextMonthKey: string
  nextMonthLabel: string
} | null

function ProfitMovementTimeline({ netProfit, withdrawals, futureRisk, currentMonthLabel }: { netProfit: number; withdrawals: ProfitWithdrawalRow[]; futureRisk: ProfitFutureRisk; currentMonthLabel: string }) {
  const withdrawalsToShow = withdrawals.slice(0, 5)
  const futureItems = futureRisk?.items?.slice(0, 3) ?? []
  const hasNetProfit = netProfit > 0
  const hasAny = hasNetProfit || withdrawalsToShow.length > 0 || futureItems.length > 0

  if (!hasAny) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4 text-sm text-gray-500">
        Nenhuma movimentação de lucro ou compromisso futuro relevante neste período.
      </div>
    )
  }

  const lastWithdrawalIndex = withdrawalsToShow.length - 1
  const showCurrentSection = hasNetProfit || withdrawalsToShow.length > 0
  const showFutureSection = futureItems.length > 0

  return (
    <div className="relative mt-5">
      <span
        aria-hidden
        className="pointer-events-none absolute left-[76px] top-12 bottom-6 hidden w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent sm:block"
      />
      <div className="space-y-0.5">
        {showCurrentSection && (
          <TimelineSectionLabel tone="emerald">PERÍODO ATUAL · {currentMonthLabel}</TimelineSectionLabel>
        )}
        {hasNetProfit && (
          <TimelineEvent
            icon={TrendingUp}
            tone="green"
            label="Lucro gerado no período"
            sub="DRE gerencial · resultado líquido"
            value={`+${formatBRL(netProfit)}`}
          />
        )}
        {withdrawalsToShow.map((movement, index) => {
          const parts = timelineDateParts(movement.date)
          return (
            <TimelineEvent
              key={movement.movementId}
              icon={ArrowDownRight}
              tone="red"
              pulse={index === lastWithdrawalIndex}
              dateDay={parts.day}
              dateMonth={parts.monthAbbr}
              label={movement.description}
              sub={`Acumulado: ${formatBRL(movement.accumulated)}`}
              value={`-${formatBRL(movement.amount)}`}
            />
          )
        })}
        {showFutureSection && (
          <TimelineSectionLabel tone="amber" badge="ALERTA">
            COMPROMISSOS FUTUROS · {futureRisk?.nextMonthLabel || ""} (M+1)
          </TimelineSectionLabel>
        )}
        {futureItems.map((item) => {
          const parts = timelineDateParts(item.originalDate || item.date)
          return (
            <TimelineEvent
              key={`future-${item.id}`}
              icon={AlertTriangle}
              tone="amber"
              pulse
              badge="M+1"
              dateDay={parts.day}
              dateMonth={parts.monthAbbr}
              label={item.description}
              sub={`Conta a pagar prevista${item.isCardInvoice ? " · cartão" : ""}`}
              value={`-${formatBRL(item.amount)}`}
            />
          )
        })}
      </div>
    </div>
  )
}

function TimelineSectionLabel({ tone, badge, children }: { tone: "emerald" | "amber"; badge?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-5 flex items-center justify-between gap-3 px-2 sm:pl-[108px]">
      <span className={cn(
        "text-[11px] font-bold uppercase tracking-[0.08em]",
        tone === "amber" ? "text-amber-700" : "text-emerald-700"
      )}>{children}</span>
      {badge && (
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{badge}</span>
      )}
    </div>
  )
}

function TimelineEvent({ icon: Icon, tone, label, sub, value, pulse, badge, dateDay, dateMonth }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "green" | "red" | "amber";
  label: string;
  sub: string;
  value: string;
  pulse?: boolean;
  badge?: string;
  dateDay?: string;
  dateMonth?: string;
}) {
  const iconWrap =
    tone === "green" ? "bg-emerald-50 ring-emerald-100 text-emerald-600" :
    tone === "amber" ? "bg-amber-100 ring-amber-200 text-amber-700" :
    "bg-rose-50 ring-rose-100 text-rose-600"
  const pingColor =
    tone === "green" ? "bg-emerald-300/40" :
    tone === "amber" ? "bg-amber-400/45" :
    "bg-rose-400/50"
  const valueColor =
    tone === "green" ? "text-emerald-600" :
    tone === "amber" ? "text-amber-700" :
    "text-rose-600"
  const badgeClass =
    tone === "amber" ? "border-amber-200 bg-amber-100/80 text-amber-700" :
    "border-rose-200 bg-rose-100/80 text-rose-700"
  return (
    <div className="group grid grid-cols-[44px_40px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl px-2 py-2.5 transition-[background-color,transform] duration-200 hover:bg-gray-50/80 hover:translate-x-[1px]">
      <div className="pt-1 text-right tabular-nums">
        {dateDay ? (
          <>
            <div className="text-sm font-bold text-gray-700 leading-none">{dateDay}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{dateMonth}</div>
          </>
        ) : (
          <div className="text-sm font-bold text-gray-300 leading-none">—</div>
        )}
      </div>
      <div className="relative flex h-full justify-center pt-0.5">
        <span className="relative flex h-7 w-7 items-center justify-center">
          {pulse && <span aria-hidden className={cn("absolute inset-0 rounded-full animate-ping", pingColor)} />}
          <span className={cn("relative inline-flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white transition-transform duration-200 group-hover:scale-105", iconWrap)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        </span>
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p title={label} className="min-w-0 truncate text-sm font-semibold text-navy-900 transition-colors duration-200 group-hover:text-navy-950">{label}</p>
          {badge && (
            <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide", badgeClass)}>{badge}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500"><span className="tabular-nums">{sub}</span></p>
      </div>
      <p className={cn("self-center whitespace-nowrap text-sm font-bold tabular-nums transition-transform duration-200 group-hover:scale-[1.02]", valueColor)}>{value}</p>
    </div>
  )
}

function ProfitWithdrawalRateBar({ rate, status }: { rate: number; status: "exceeded" | "attention" | "available" }) {
  const [animatedRate, setAnimatedRate] = useState(0)
  useEffect(() => {
    const target = Math.min(100, Math.max(0, rate))
    const id = requestAnimationFrame(() => setAnimatedRate(target))
    return () => cancelAnimationFrame(id)
  }, [rate])
  const barColor = status === "exceeded" ? "bg-rose-500" : status === "attention" ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-white/90 ring-1 ring-gray-100">
      <div
        className={cn("relative h-full rounded-full transition-[width] duration-[1100ms] ease-out", barColor)}
        style={{ width: `${animatedRate}%` }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/55 to-transparent animate-bar-shine" />
      </div>
    </div>
  )
}

function ProfitAvailabilitySkeleton() {
  return (
    <Card className="overflow-hidden border-gray-100 bg-white/95 shadow-sm">
      <div className="grid animate-pulse lg:grid-cols-[1.12fr_0.88fr]">
        <div className="border-b border-gray-100/80 p-5 lg:border-b-0 lg:border-r lg:p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_132px]">
            <div>
              <div className="h-5 w-44 rounded-full bg-gray-100" />
              <div className="mt-3 h-4 w-72 max-w-full rounded-full bg-gray-100" />
            </div>
            <div className="h-14 rounded-full bg-gray-100" />
          </div>
          <div className="mt-7 space-y-5">
            {[0, 1, 2].map((item) => (
              <div key={item} className="grid gap-3 sm:grid-cols-[28px_minmax(0,1fr)_96px] sm:items-center">
                <div className="hidden h-3 w-3 rounded-full bg-gray-100 sm:block" />
                <div>
                  <div className="h-4 w-64 max-w-full rounded-full bg-gray-100" />
                  <div className="mt-2 h-3 w-32 rounded-full bg-gray-100" />
                </div>
                <div className="h-4 w-24 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 lg:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="h-5 w-40 rounded-full bg-gray-100" />
              <div className="mt-3 h-4 w-48 rounded-full bg-gray-100" />
            </div>
            <div className="h-7 w-24 rounded-full bg-gray-100" />
          </div>
          <div className="rounded-3xl bg-gray-50 p-4">
            <div className="h-5 rounded-full bg-gray-100" />
            <div className="mt-5 h-5 rounded-full bg-gray-100" />
            <div className="mt-6 h-12 rounded-2xl bg-gray-100" />
          </div>
          <div className="mt-5 h-2 rounded-full bg-gray-100" />
          <div className="mt-3 h-3 w-56 max-w-full rounded-full bg-gray-100" />
        </div>
      </div>
    </Card>
  )
}

function EmptyState({ icon: Icon, title, text, action }: { icon: any; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-semibold text-navy-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
