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

type Sale = {
  id: string
  sale_date: string
  sale_price: number
  net_amount?: number | null
  supplier_cost?: number | null
  payment_method?: string | null
  inventory?: { purchase_price?: number | null; type?: string | null; catalog?: { model?: string | null } | null } | null
  sales_additional_items?: { type: "upsell" | "free"; cost_price: number; sale_price?: number | null; profit?: number | null }[]
}

const expenseColors = ["#ef4444", "#f97316", "#eab308", "#2563eb", "#14b8a6", "#8b5cf6"]

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const start = `${month}-01`
  const end = new Date(year, monthNumber, 0).toISOString().split("T")[0]
  return { start, end }
}

function saleCost(sale: Sale) {
  const baseCost = Number(sale.supplier_cost ?? sale.inventory?.purchase_price ?? 0)
  const additionalCost = (sale.sales_additional_items || []).reduce((sum, item) => sum + Number(item.cost_price || 0), 0)
  return baseCost + additionalCost
}

function saleNetRevenue(sale: Sale) {
  const base = Number(sale.net_amount ?? sale.sale_price ?? 0)
  const additions = (sale.sales_additional_items || []).reduce((sum, item) => sum + Number(item.sale_price || 0), 0)
  return base + additions
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export default function FinanceiroPage() {
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7))
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountName, setAccountName] = useState("Conta principal")
  const [accountInstitution, setAccountInstitution] = useState("")
  const [openingBalance, setOpeningBalance] = useState("")
  const [reconcilingId, setReconcilingId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchFinance()
  }, [month])

  const fetchFinance = async () => {
    setLoading(true)
    try {
      const { start, end } = monthRange(month)
      const [accountsRes, transactionsRes, salesRes] = await Promise.all([
        (supabase.from("finance_accounts") as any).select("*").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("transactions") as any).select("*").gte("date", start).lte("date", end).order("date", { ascending: false }),
        (supabase.from("sales") as any)
          .select("*, inventory:inventory_id(*, catalog:catalog_id(model)), sales_additional_items(*)")
          .gte("sale_date", start)
          .lte("sale_date", end)
          .order("sale_date", { ascending: false }),
      ])

      setAccounts(accountsRes.data || [])
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
      const balance = Number(account.current_balance ?? account.opening_balance ?? 0) + ledger
      return { ...account, balance }
    })
  }, [accounts, transactions])

  const metrics = useMemo(() => {
    const manualIncome = transactions.filter((t) => t.type === "income" && t.source_type !== "sale").reduce((sum, t) => sum + Number(t.amount), 0)
    const manualExpenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0)
    const salesRevenue = sales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0)
    const cmv = sales.reduce((sum, sale) => sum + saleCost(sale), 0)
    const netRevenue = salesRevenue + manualIncome
    const grossProfit = salesRevenue - cmv
    const netProfit = netRevenue - cmv - manualExpenses
    const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0
    const fixedExpenses = transactions
      .filter((t) => t.type === "expense" && !["Estoque (Peças/Acessórios)", "Impostos / Taxas", "Retirada de Lucro"].includes(t.category))
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const grossMarginRate = salesRevenue > 0 ? grossProfit / salesRevenue : 0
    const breakEvenRevenue = grossMarginRate > 0 ? fixedExpenses / grossMarginRate : fixedExpenses
    const accountTotal = accountBalances.reduce((sum, account) => sum + account.balance, 0)
    const pendingSales = sales.filter((sale) => !reconciledSaleIds.has(sale.id))
    const pendingTransactions = transactions.filter((t) => t.status !== "reconciled" && t.status !== "cancelled")
    const pendingAmount =
      pendingSales.reduce((sum, sale) => sum + saleNetRevenue(sale), 0) +
      pendingTransactions.reduce((sum, t) => sum + Number(t.amount), 0)

    return {
      manualIncome,
      manualExpenses,
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
  }, [accountBalances, reconciledSaleIds, sales, transactions])

  const flowChart = useMemo(() => {
    const days = new Map<string, { date: string; entradas: number; saidas: number; saldo: number }>()
    for (const sale of sales) {
      const key = sale.sale_date
      const row = days.get(key) || { date: key, entradas: 0, saidas: 0, saldo: 0 }
      row.entradas += saleNetRevenue(sale)
      days.set(key, row)
    }
    for (const t of transactions) {
      const row = days.get(t.date) || { date: t.date, entradas: 0, saidas: 0, saldo: 0 }
      if (t.source_type !== "sale") {
        if (t.type === "income") row.entradas += Number(t.amount)
        else row.saidas += Number(t.amount)
      }
      days.set(t.date, row)
    }
    let running = 0
    return Array.from(days.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        running += row.entradas - row.saidas
        return { ...row, dia: row.date.slice(8, 10), saldo: running }
      })
  }, [sales, transactions])

  const expensesByCategory = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const t of transactions.filter((item) => item.type === "expense")) {
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
    const manual = transactions.slice(0, 8).map((t) => ({
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

  const defaultAccount = accountBalances[0]

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!accountName.trim()) return
    setSavingAccount(true)
    try {
      const { error } = await (supabase.from("finance_accounts") as any).insert({
        name: accountName.trim(),
        institution: accountInstitution.trim() || null,
        account_type: "checking",
        opening_balance: Number(openingBalance.replace(",", ".") || 0),
      })
      if (error) throw error
      toast({ title: "Conta cadastrada", type: "success" })
      setShowAccountForm(false)
      setAccountName("Conta principal")
      setAccountInstitution("")
      setOpeningBalance("")
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
        const { error } = await (supabase.from("transactions") as any).insert({
          account_id: defaultAccount.id,
          type: "income",
          category: "Venda",
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

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Financeiro</h2>
          <p className="text-sm text-gray-500">Caixa, conciliação, DRE gerencial e ponto de equilíbrio da loja.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-[160px] bg-white" />
          <Button variant="outline" onClick={() => setShowAccountForm(true)}>
            <Landmark className="mr-2 h-4 w-4" /> Cadastrar conta
          </Button>
          <Link href="/financeiro/transacoes">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Lançamento
            </Button>
          </Link>
        </div>
      </div>

      {showAccountForm && (
        <Card className="p-4 border-royal-100 bg-royal-50/40">
          <form onSubmit={createAccount} className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end">
            <Input label="Nome da conta" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            <Input label="Banco / instituição" placeholder="Ex: Inter, Itaú, Caixa da loja" value={accountInstitution} onChange={(event) => setAccountInstitution(event.target.value)} />
            <Input label="Saldo inicial" inputMode="decimal" placeholder="0,00" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" isLoading={savingAccount}>Salvar</Button>
              <Button type="button" variant="ghost" onClick={() => setShowAccountForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Saldo em contas" value={formatBRL(metrics.accountTotal)} icon={Wallet} tone="navy" hint={`${accountBalances.length} conta(s) cadastrada(s)`} />
        <MetricCard title="Entradas do mês" value={formatBRL(metrics.netRevenue)} icon={ArrowUpRight} tone="green" hint={`${sales.length} venda(s) + lançamentos`} />
        <MetricCard title="Saídas do mês" value={formatBRL(metrics.cmv + metrics.manualExpenses)} icon={ArrowDownRight} tone="red" hint={`CMV ${formatBRL(metrics.cmv)} · despesas ${formatBRL(metrics.manualExpenses)}`} />
        <MetricCard title="Lucro líquido" value={formatBRL(metrics.netProfit)} icon={LineChart} tone={metrics.netProfit >= 0 ? "green" : "red"} hint={`Margem bruta ${metrics.grossMargin.toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Saúde financeira</h3>
              <p className="text-sm text-gray-500">Quanto precisa vender para a empresa se manter de pé.</p>
            </div>
            <Badge variant={metrics.netProfit >= 0 ? "green" : "red"}>{metrics.netProfit >= 0 ? "No azul" : "Atenção"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Ponto de equilíbrio</p>
              <p className="mt-2 text-2xl font-bold text-navy-900">{formatBRL(metrics.breakEvenRevenue)}</p>
              <p className="mt-1 text-xs text-gray-500">Meta mínima de vendas no mês</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Despesas fixas</p>
              <p className="mt-2 text-2xl font-bold text-navy-900">{formatBRL(metrics.fixedExpenses)}</p>
              <p className="mt-1 text-xs text-gray-500">Base usada no cálculo</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">A conciliar</p>
              <p className="mt-2 text-2xl font-bold text-navy-900">{formatBRL(metrics.pendingAmount)}</p>
              <p className="mt-1 text-xs text-gray-500">{metrics.pendingSales.length + metrics.pendingTransactions.length} movimento(s)</p>
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
                  <Tooltip formatter={(value) => formatBRL(Number(value || 0))} labelFormatter={(label) => `Dia ${label}`} />
                  <Area type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} fill="url(#saldoColor)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={LineChart} title="Sem fluxo no mês" text="Registre vendas ou lançamentos para acompanhar a curva do caixa." />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Contas da empresa</h3>
              <p className="text-sm text-gray-500">Saldo calculado por conta conciliada.</p>
            </div>
            <Building2 className="h-5 w-5 text-royal-500" />
          </div>
          {accountBalances.length === 0 ? (
            <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" text="Cadastre a conta PJ ou o caixa físico para iniciar a conciliação." action={<Button size="sm" onClick={() => setShowAccountForm(true)}>Cadastrar conta</Button>} />
          ) : (
            <div className="space-y-3">
              {accountBalances.map((account) => (
                <div key={account.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-navy-900">{account.name}</p>
                        <p className="text-xs text-gray-500">{account.institution || "Instituição não informada"}</p>
                      </div>
                    </div>
                    <p className="text-right font-bold text-navy-900">{formatBRL(account.balance)}</p>
                  </div>
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
          <DreLine label="(-) Despesas operacionais" value={-metrics.manualExpenses} />
          <DreLine label="= Lucro líquido" value={metrics.netProfit} highlight />
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
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Movimentos recentes</h3>
            <p className="text-sm text-gray-500">Vendas e lançamentos para conciliar com a conta da empresa.</p>
          </div>
          <Link href="/financeiro/transacoes" className="text-sm font-semibold text-royal-500">Ver todos</Link>
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
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
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
      <p className="text-2xl font-bold text-navy-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{hint}</p>
    </Card>
  )
}

function DreLine({ label, value, strong, highlight }: { label: string; value: number; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-gray-100 py-3 last:border-0", highlight && "rounded-xl border-0 bg-royal-50 px-3", strong && "font-semibold")}>
      <span className={cn("text-sm", highlight ? "text-royal-700" : "text-gray-600")}>{label}</span>
      <span className={cn("font-bold", value < 0 ? "text-red-600" : highlight ? "text-royal-700" : "text-navy-900")}>
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
