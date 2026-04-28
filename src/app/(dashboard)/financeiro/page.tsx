"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts"
import { Banknote, Building2, CheckCircle2, Landmark, LineChart, Plus, ReceiptText, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

type FinanceAccount = {
  id: string
  name: string
  institution?: string | null
  account_type?: string | null
  opening_balance?: number
  current_balance?: number | null
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
  sale_price: number
  net_amount?: number | null
  supplier_cost?: number | null
  payment_method?: string | null
  sale_status?: "reserved" | "completed" | "cancelled" | null
  inventory?: { purchase_price?: number | null; type?: string | null; catalog?: { model?: string | null } | null } | null
  sales_additional_items?: { type: "upsell" | "free"; cost_price: number; sale_price?: number | null; profit?: number | null }[]
}

const expenseColors = ["#ef4444", "#f97316", "#eab308", "#2563eb", "#14b8a6", "#8b5cf6"]

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const start = `${month}-01`
  const end = new Date(year, monthNumber, 0).toISOString().split("T")[0]
  const endOfDay = `${end}T23:59:59.999Z`
  return { start, end, endOfDay }
}

function saleCost(sale: Sale) {
  const baseCost = Number(sale.supplier_cost ?? sale.inventory?.purchase_price ?? 0)
  const additionalCost = (sale.sales_additional_items || []).reduce((sum, item) => sum + Number(item.cost_price || 0), 0)
  return baseCost + additionalCost
}

function saleNetRevenue(sale: Sale) {
  return Number(sale.net_amount ?? sale.sale_price ?? 0)
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

export default function FinanceiroPage() {
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7))
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountName, setAccountName] = useState("Conta principal")
  const [accountInstitution, setAccountInstitution] = useState("")
  const [openingBalance, setOpeningBalance] = useState("R$ 0,00")
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [reconcilingId, setReconcilingId] = useState<string | null>(null)
  const [undoConfirmId, setUndoConfirmId] = useState<string | null>(null)
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null)
  const [accountBalanceInput, setAccountBalanceInput] = useState("R$ 0,00")
  const [savingBalanceId, setSavingBalanceId] = useState<string | null>(null)
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
      const { start, end, endOfDay } = monthRange(month)
      const [accountsRes, chartAccountsRes, transactionsRes, salesRes] = await Promise.all([
        (supabase.from("finance_accounts") as any).select("*").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("finance_chart_accounts") as any).select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        (supabase.from("transactions") as any).select("*").gte("date", start).lte("date", end).order("date", { ascending: false }),
        (supabase.from("sales") as any)
          .select("*, inventory:inventory_id(*, catalog:catalog_id(model)), sales_additional_items(*)")
          .gte("sale_date", start)
          .lte("sale_date", endOfDay)
          .order("sale_date", { ascending: false }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      if (transactionsRes.error) throw new Error(transactionsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)

      setAccounts(accountsRes.data || [])
      setChartAccounts(chartAccountsRes.data || [])
      setTransactions(transactionsRes.data || [])
      setSales(salesRes.data || [])
    } catch (error: any) {
      toast({ title: "Erro ao carregar financeiro", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const reconciledSaleIds = useMemo(() => {
    return new Set(transactions.filter((t) => t.source_type === "sale" && t.source_id).map((t) => String(t.source_id)))
  }, [transactions])

  const accountBalances = useMemo(() => {
    return accounts.map((account) => {
      const ledger = transactions
        .filter((t) => t.account_id === account.id && t.status === "reconciled")
        .reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0)
      const baseBalance = Number(account.current_balance ?? account.opening_balance ?? 0)
      const balance = baseBalance + ledger
      return { ...account, baseBalance, ledger, balance }
    })
  }, [accounts, transactions])

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

  const getTransactionAccount = (transaction: Transaction) => {
    return (
      (transaction.chart_account_id ? chartAccountById.get(transaction.chart_account_id) : undefined) ||
      chartAccountByName.get(transaction.category) ||
      null
    )
  }

  const hasFinancialType = (transaction: Transaction, type: ChartAccount["financial_type"]) => {
    const account = getTransactionAccount(transaction)
    if (account) return account.financial_type === type
    if (type === "inventory_asset") return transaction.type === "expense" && transaction.category === "Estoque (Peças/Acessórios)"
    if (type === "owner_equity") return ["Retirada de Lucro", "Aporte do proprietário"].includes(transaction.category)
    if (type === "tax") return transaction.category === "Impostos / Taxas"
    if (type === "revenue") return transaction.type === "income" && !["Aporte do proprietário"].includes(transaction.category)
    if (type === "operating_expense") return transaction.type === "expense" && !["Estoque (Peças/Acessórios)", "Retirada de Lucro", "Impostos / Taxas"].includes(transaction.category)
    return false
  }

  const isResultExpense = (transaction: Transaction) => hasFinancialType(transaction, "operating_expense") || hasFinancialType(transaction, "tax")
  const isInventoryCashOut = (transaction: Transaction) => hasFinancialType(transaction, "inventory_asset")
  const isOwnerWithdrawal = (transaction: Transaction) => transaction.type === "expense" && hasFinancialType(transaction, "owner_equity")
  const isOwnerContribution = (transaction: Transaction) => transaction.type === "income" && hasFinancialType(transaction, "owner_equity")
  const isRevenueIncome = (transaction: Transaction) => transaction.type === "income" && hasFinancialType(transaction, "revenue")
  const salesRevenueAccount = chartAccounts.find((account) => account.code === "1.01") || chartAccounts.find((account) => account.financial_type === "revenue" && account.cash_flow_type === "income")

  const metrics = useMemo(() => {
    const completedSales = sales.filter((sale) => (sale.sale_status || "completed") === "completed")
    const reconciledTransactions = transactions.filter((t) => t.status === "reconciled")
    const manualIncome = reconciledTransactions.filter((t) => t.source_type !== "sale" && isRevenueIncome(t)).reduce((sum, t) => sum + Number(t.amount), 0)
    const cashInflows = reconciledTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0)
    const cashOutflows = reconciledTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0)
    const reconciledInventoryPurchases = reconciledTransactions.filter(isInventoryCashOut).reduce((sum, t) => sum + Number(t.amount), 0)
    const reconciledOperatingOutflows = reconciledTransactions.filter(isResultExpense).reduce((sum, t) => sum + Number(t.amount), 0)
    const reconciledOwnerWithdrawals = reconciledTransactions.filter(isOwnerWithdrawal).reduce((sum, t) => sum + Number(t.amount), 0)
    const inventoryPurchases = reconciledTransactions.filter(isInventoryCashOut).reduce((sum, t) => sum + Number(t.amount), 0)
    const ownerWithdrawals = reconciledTransactions.filter(isOwnerWithdrawal).reduce((sum, t) => sum + Number(t.amount), 0)
    const ownerContributions = reconciledTransactions.filter(isOwnerContribution).reduce((sum, t) => sum + Number(t.amount), 0)
    const operatingExpenses = reconciledTransactions.filter(isResultExpense).reduce((sum, t) => sum + Number(t.amount), 0)
    const salesRevenue = completedSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0)
    const cmv = completedSales.reduce((sum, sale) => sum + saleCost(sale), 0)
    const netRevenue = salesRevenue + manualIncome
    const grossProfit = salesRevenue - cmv
    const netProfit = netRevenue - cmv - operatingExpenses
    const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0
    const fixedExpenses = reconciledTransactions
      .filter((t) => isResultExpense(t) && t.category !== "Impostos / Taxas")
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const grossMarginRate = salesRevenue > 0 ? grossProfit / salesRevenue : 0
    const breakEvenRevenue = grossMarginRate > 0 ? fixedExpenses / grossMarginRate : fixedExpenses
    const accountTotal = accountBalances.reduce((sum, account) => sum + account.balance, 0)
    const pendingSales = sales.filter((sale) => (sale.sale_status || "completed") !== "cancelled" && !reconciledSaleIds.has(sale.id))
    const pendingTransactions = transactions.filter((t) => t.source_type !== "sale" && t.status !== "reconciled" && t.status !== "cancelled")
    const pendingAmount =
      pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0) +
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
      operatingExpenses,
      salesRevenue,
      cmv,
      netRevenue,
      grossProfit,
      netProfit,
      grossMargin,
      fixedExpenses,
      breakEvenRevenue,
      accountTotal,
      pendingSales,
      pendingTransactions,
      pendingAmount,
    }
  }, [accountBalances, chartAccountById, chartAccountByName, reconciledSaleIds, sales, transactions])

  const flowChart = useMemo(() => {
    const days = new Map<string, { date: string; entradas: number; saidas: number; saldo: number }>()
    for (const t of transactions) {
      if (t.status !== "reconciled") continue
      const row = days.get(t.date) || { date: t.date, entradas: 0, saidas: 0, saldo: 0 }
      if (t.type === "income") row.entradas += Number(t.amount)
      else row.saidas += Number(t.amount)
      days.set(t.date, row)
    }
    let running = accountBalances.reduce((sum, account) => sum + account.baseBalance, 0)
    return Array.from(days.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        running += row.entradas - row.saidas
        return { ...row, dia: row.date.slice(8, 10), saldo: running }
      })
  }, [accountBalances, transactions])

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
    const saleMovements = sales.slice(0, 8).map((sale) => ({
      id: sale.id,
      kind: "sale" as const,
      date: sale.sale_date,
      description: `Venda${sale.inventory?.catalog?.model ? ` · ${sale.inventory.catalog.model}` : ""}`,
      category: "Venda",
      amount: saleNetRevenue(sale),
      status: reconciledSaleIds.has(sale.id) ? "reconciled" : "pending",
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
        status: t.status || "pending",
      }))
    return [...saleMovements, ...manual]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
  }, [reconciledSaleIds, sales, transactions])

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
        if (reconciledSaleIds.has(movement.id)) {
          toast({ title: "Venda já conciliada", type: "success" })
          return
        }
        const sale = sales.find((item) => item.id === movement.id)
        if (!sale) return
        const { error } = await (supabase.from("transactions") as any).insert({
          account_id: defaultAccount.id,
          chart_account_id: salesRevenueAccount?.id || null,
          type: "income",
          category: salesRevenueAccount?.name || "Venda",
          description: movement.description,
          amount: saleNetRevenue(sale),
          date: sale.sale_date,
          payment_method: sale.payment_method || null,
          status: "reconciled",
          reconciled_at: new Date().toISOString(),
          source_type: "sale",
          source_id: sale.id,
        })
        if (error) throw error
      } else {
        const { error } = await (supabase.from("transactions") as any)
          .update({ account_id: defaultAccount.id, status: "reconciled", reconciled_at: new Date().toISOString() })
          .eq("id", movement.id)
        if (error) throw error
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
        const { error } = await (supabase.from("transactions") as any)
          .delete()
          .eq("source_type", "sale")
          .eq("source_id", movement.id)
        if (error) throw error
      } else {
        const { error } = await (supabase.from("transactions") as any)
          .update({ account_id: null, status: "pending", reconciled_at: null })
          .eq("id", movement.id)
        if (error) throw error
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

  const startEditingBalance = (account: (typeof accountBalances)[number]) => {
    setEditingBalanceId(account.id)
    setAccountBalanceInput(formatBRL(account.balance))
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

  const saveAccountBalance = async (account: (typeof accountBalances)[number]) => {
    const desiredBalance = parseCurrencyInput(accountBalanceInput)
    const baseBalance = desiredBalance - account.ledger
    setSavingBalanceId(account.id)
    try {
      const { error } = await (supabase.from("finance_accounts") as any)
        .update({ current_balance: baseBalance })
        .eq("id", account.id)
      if (error) throw error
      setEditingBalanceId(null)
      toast({ title: "Saldo ajustado", description: `Novo saldo: ${formatBRL(desiredBalance)}`, type: "success" })
      fetchFinance()
    } catch (error: any) {
      toast({ title: "Erro ao ajustar saldo", description: error.message, type: "error" })
    } finally {
      setSavingBalanceId(null)
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Saldo em contas" value={formatBRL(metrics.accountTotal)} icon={Wallet} tone="navy" hint={`${accountBalances.length} conta(s) cadastrada(s)`} />
        <MetricCard title="Entradas conciliadas" value={formatBRL(metrics.cashInflows)} icon={ArrowUpRight} tone="green" hint={`Receita do mês: ${formatBRL(metrics.netRevenue)}`} />
        <MetricCard title="Saídas de caixa" value={formatBRL(metrics.cashOutflows)} icon={ArrowDownRight} tone="red" hint={`Estoque ${formatBRL(metrics.reconciledInventoryPurchases)} · retiradas ${formatBRL(metrics.reconciledOwnerWithdrawals)}`} />
        <MetricCard title="Resultado líquido" value={formatBRL(metrics.netProfit)} icon={LineChart} tone={metrics.netProfit >= 0 ? "green" : "red"} hint="Lucro bruto menos despesas operacionais" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-display font-bold text-navy-900 font-syne">Saúde financeira</h3>
              <p className="text-sm text-gray-500">Ponto de equilíbrio usa despesas fixas e margem bruta. Resultado líquido não trata compra de estoque como despesa.</p>
            </div>
            <div className="shrink-0 self-start">
              <Badge variant={metrics.netProfit >= 0 ? "green" : "red"}>{metrics.netProfit >= 0 ? "No azul" : "Atenção"}</Badge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Ponto de equilíbrio</p>
              <p className="mt-2 whitespace-nowrap text-xl font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{formatBRL(metrics.breakEvenRevenue)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {metrics.fixedExpenses > 0 ? "Meta mínima de vendas no mês" : "Lance despesas fixas para calcular"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Lucro bruto</p>
              <p className="mt-2 whitespace-nowrap text-xl font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{formatBRL(metrics.grossProfit)}</p>
              <p className="mt-1 text-xs text-gray-500">Antes das despesas lançadas</p>
            </div>
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">A conciliar</p>
              <p className="mt-2 whitespace-nowrap text-xl font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{formatBRL(metrics.pendingAmount)}</p>
              <p className="mt-1 text-xs text-gray-500">{metrics.pendingSales.length + metrics.pendingTransactions.length} movimento(s)</p>
            </div>
            <div className="min-w-0 rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Sócios</p>
              <p className="mt-2 whitespace-nowrap text-xl font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{formatBRL(metrics.ownerContributions - metrics.ownerWithdrawals)}</p>
              <p className="mt-1 text-xs text-gray-500">Aportes menos retiradas</p>
            </div>
          </div>
          <div className="mt-5 h-56">
            {flowChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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
                  <Tooltip formatter={(value) => formatBRL(Number(value || 0))} labelFormatter={(label) => `Saldo conciliado no dia ${label}`} />
                  <Area type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} fill="url(#saldoColor)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={LineChart} title="Sem saldo conciliado no mês" text="Concilie vendas ou lançamentos para acompanhar a curva real do caixa." />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Contas da empresa</h3>
              <p className="text-sm text-gray-500">Saldo atual da conta mais movimentos conciliados.</p>
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
                        <button type="button" onClick={() => startEditingBalance(account)} className="text-gray-400 hover:text-navy-900">Saldo</button>
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
                  {editingBalanceId === account.id && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-end">
                      <Input
                        label="Saldo atual no banco"
                        inputMode="numeric"
                        value={accountBalanceInput}
                        onChange={(event) => setAccountBalanceInput(formatCurrencyInput(event.target.value))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveAccountBalance(account)} isLoading={savingBalanceId === account.id}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingBalanceId(null)}>Cancelar</Button>
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
          <DreLine label="(-) Despesas operacionais" value={-metrics.operatingExpenses} />
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
              <h3 className="font-display font-bold text-navy-900 font-syne">Despesas por categoria</h3>
              <p className="text-sm text-gray-500">Onde o dinheiro está saindo.</p>
            </div>
            <Link href="/financeiro/gastos" className="text-sm font-semibold text-royal-500">Ver gastos</Link>
          </div>
          <div className="h-64">
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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
                <Badge variant={movement.status === "reconciled" ? "green" : "yellow"}>{movement.status === "reconciled" ? "Conciliado" : "Pendente"}</Badge>
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
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="whitespace-nowrap text-[1.55rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{hint}</p>
    </Card>
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
