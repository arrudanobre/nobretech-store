"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, Clock3, FileText, Pencil, Plus, ReceiptText, Search, Trash2, Wallet, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

const ENTRADAS_CATEGORIES = ["Venda", "Reembolso", "Aporte do proprietário", "Outros"]

const SAIDAS_CATEGORIES = [
  "Aluguel",
  "Energia / Água / Internet",
  "Funcionários / Comissões",
  "Marketing / Tráfego",
  "Estoque (Peças/Acessórios)",
  "Impostos / Taxas",
  "Retirada de Lucro",
  "Outros",
]

const METHODS = ["Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito", "Transferência"]

type MovementStatus = "pending" | "reconciled" | "cancelled"

type ChartAccount = {
  id: string
  code: string
  name: string
  cash_flow_type: "income" | "expense" | "none"
  financial_type: string
  statement_section: string
  sort_order: number
}

type FinanceAccount = {
  id: string
  name: string
  institution?: string | null
  is_active?: boolean
}

type UnifiedTransaction = {
  id: string
  account_id?: string | null
  chart_account_id?: string | null
  type: "income" | "expense"
  category: string
  description: string
  amount: number
  date: string
  due_date?: string | null
  payment_method: string
  status: MovementStatus
  source: "sale" | "manual"
  notes?: string | null
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const start = `${month}-01`
  const end = new Date(year, monthNumber, 0).toISOString().split("T")[0]
  return { start, end, endOfDay: `${end}T23:59:59.999Z` }
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

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  const cents = Number(digits || "0")
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, "") || "0") / 100
}

export default function TransacoesPage() {
  const [data, setData] = useState<UnifiedTransaction[]>([])
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().substring(0, 7))
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all")
  const [filterStatus, setFilterStatus] = useState<"all" | MovementStatus>("all")
  const [search, setSearch] = useState("")

  const [modalOpen, setModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingItem, setEditingItem] = useState<UnifiedTransaction | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [formType, setFormType] = useState<"income" | "expense">("expense")
  const [formChartAccountId, setFormChartAccountId] = useState("")
  const [formAccountId, setFormAccountId] = useState("")
  const [formCategory, setFormCategory] = useState(SAIDAS_CATEGORIES[0])
  const [formDesc, setFormDesc] = useState("")
  const [formAmount, setFormAmount] = useState("R$ 0,00")
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0])
  const [formDueDate, setFormDueDate] = useState("")
  const [formPayment, setFormPayment] = useState("Pix")
  const [formNotes, setFormNotes] = useState("")
  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [filterMonth])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { start, end, endOfDay } = monthRange(filterMonth)

      const [accountsRes, chartAccountsRes, salesRes, transRes] = await Promise.all([
        (supabase.from("finance_accounts") as any)
          .select("id, name, institution, is_active")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (supabase.from("finance_chart_accounts") as any)
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        (supabase.from("sales") as any)
          .select("id, sale_date, sale_price, net_amount, payment_method, inventory:inventory_id(catalog:catalog_id(model))")
          .gte("sale_date", start)
          .lte("sale_date", endOfDay)
          .order("sale_date", { ascending: false }),
        (supabase.from("transactions") as any)
          .select("*")
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: false }),
      ])

      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)
      if (transRes.error) throw new Error(transRes.error.message)

      setFinanceAccounts(accountsRes.data || [])
      const chartAccountsData = chartAccountsRes.data || []
      setChartAccounts(chartAccountsData)
      const transactions = transRes.data || []
      const reconciledSaleIds = new Set(
        transactions
          .filter((t: any) => t.source_type === "sale" && t.source_id)
          .map((t: any) => String(t.source_id))
      )

      const manual: UnifiedTransaction[] = transactions
        .filter((t: any) => t.source_type !== "sale")
        .map((t: any) => ({
          id: t.id,
          account_id: t.account_id,
          chart_account_id: t.chart_account_id,
          type: t.type,
          category: t.category,
          description: t.description || t.category,
          amount: Number(t.amount),
          date: t.date,
          due_date: t.due_date,
          payment_method: t.payment_method || "-",
          status: t.status || "pending",
          source: "manual",
          notes: t.notes,
        }))

      const sales: UnifiedTransaction[] = (salesRes.data || []).map((s: any) => {
        const modelName = s.inventory?.catalog?.model || "Produto"
        return {
          id: s.id,
          type: "income",
          category: "Venda",
          description: `Venda · ${modelName}`,
          amount: Number(s.net_amount ?? s.sale_price ?? 0),
          date: s.sale_date,
          payment_method: s.payment_method || "Não informado",
          status: reconciledSaleIds.has(String(s.id)) ? "reconciled" : "pending",
          source: "sale",
        }
      })

      setData([...manual, ...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
    } catch (error: any) {
      toast({ title: "Erro ao carregar movimentações", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const chartAccountById = useMemo(() => {
    return new Map(chartAccounts.map((account) => [account.id, account]))
  }, [chartAccounts])

  const selectableChartAccounts = useMemo(() => {
    return chartAccounts.filter((account) => account.cash_flow_type === formType)
  }, [chartAccounts, formType])

  const findFallbackChartAccount = (type: "income" | "expense", category: string) => {
    return chartAccounts.find((account) => account.cash_flow_type === type && account.name === category)
      || chartAccounts.find((account) => account.cash_flow_type === type && account.name === (type === "income" ? "Venda de produtos" : "Outras despesas operacionais"))
      || chartAccounts.find((account) => account.cash_flow_type === type)
      || null
  }

  const openNewTransaction = () => {
    setEditingItem(null)
    setFormType("expense")
    const account = findFallbackChartAccount("expense", "Aluguel")
    setFormChartAccountId(account?.id || "")
    setFormAccountId("")
    setFormCategory(account?.name || SAIDAS_CATEGORIES[0])
    setFormDesc("")
    setFormAmount("R$ 0,00")
    setFormDate(new Date().toISOString().split("T")[0])
    setFormDueDate("")
    setFormPayment("Pix")
    setFormNotes("")
    setModalOpen(true)
  }

  const openEditTransaction = (item: UnifiedTransaction) => {
    if (item.source !== "manual") {
      toast({ title: "Venda automática", description: "Edite vendas pela tela de vendas para manter o histórico correto.", type: "error" })
      return
    }
    setEditingItem(item)
    setFormType(item.type)
    const account = item.chart_account_id ? chartAccountById.get(item.chart_account_id) : findFallbackChartAccount(item.type, item.category)
    setFormChartAccountId(account?.id || "")
    setFormAccountId(item.account_id || "")
    setFormCategory(account?.name || item.category)
    setFormDesc(item.description)
    setFormAmount(formatCurrencyInput(String(Math.round(item.amount * 100))))
    setFormDate(item.date.slice(0, 10))
    setFormDueDate(item.due_date?.slice(0, 10) || "")
    setFormPayment(item.payment_method === "-" ? "Pix" : item.payment_method)
    setFormNotes(item.notes || "")
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingItem(null)
  }

  const handleSaveTransaction = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = parseCurrencyInput(formAmount)
    const selectedAccount = formChartAccountId ? chartAccountById.get(formChartAccountId) : findFallbackChartAccount(formType, formCategory)
    if (!selectedAccount || !formDesc.trim() || amount <= 0 || !formDate) {
      toast({ title: "Preencha categoria, descrição, valor e data", type: "error" })
      return
    }

    setIsSubmitting(true)
    try {
      const nextStatus = formAccountId ? "reconciled" : "pending"
      const payload = {
        type: formType,
        account_id: formAccountId || null,
        chart_account_id: selectedAccount.id,
        category: selectedAccount.name,
        description: formDesc.trim(),
        amount,
        date: formDate,
        due_date: formDueDate || null,
        payment_method: formPayment,
        status: nextStatus,
        reconciled_at: formAccountId ? new Date().toISOString() : null,
        notes: formNotes.trim() || null,
      }
      const { error } = editingItem
        ? await (supabase.from("transactions") as any).update(payload).eq("id", editingItem.id)
        : await (supabase.from("transactions") as any).insert(payload)

      if (error) throw error

      closeModal()
      const nextAccount = findFallbackChartAccount(formType, formType === "income" ? "Venda de produtos" : "Aluguel")
      setFormChartAccountId(nextAccount?.id || "")
      setFormCategory(nextAccount?.name || (formType === "income" ? ENTRADAS_CATEGORIES[0] : SAIDAS_CATEGORIES[0]))
      setFormDesc("")
      setFormAmount("R$ 0,00")
      setFormDueDate("")
      setFormNotes("")
      toast({ title: editingItem ? "Lançamento atualizado" : "Lançamento registrado", type: "success" })
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao salvar lançamento", description: error.message, type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTransaction = async (item: UnifiedTransaction) => {
    if (item.source !== "manual") {
      toast({ title: "Venda automática", description: "Exclua ou ajuste vendas pela tela de vendas.", type: "error" })
      return
    }
    if (deleteConfirmId !== item.id) {
      setDeleteConfirmId(item.id)
      return
    }
    setDeletingId(item.id)
    try {
      const { error } = await (supabase.from("transactions") as any).delete().eq("id", item.id)
      if (error) throw error
      setDeleteConfirmId(null)
      toast({ title: "Lançamento excluído", type: "success" })
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao excluir lançamento", description: error.message, type: "error" })
    } finally {
      setDeletingId(null)
    }
  }

  const filteredData = useMemo(() => {
    const query = search.toLowerCase().trim()
    return data.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false
      if (filterStatus !== "all" && item.status !== filterStatus) return false
      if (!query) return true
      return [
        item.description,
        item.category,
        item.payment_method,
        item.notes || "",
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [data, filterStatus, filterType, search])

  const totals = useMemo(() => {
    const income = filteredData.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0)
    const expense = filteredData.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0)
    const pending = filteredData.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0)
    const topCategory = filteredData
      .filter((item) => item.type === "expense")
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + item.amount
        return acc
      }, {})
    const [topCategoryName = "Nenhuma"] = Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0] || []
    return { income, expense, balance: income - expense, pending, topCategory: topCategoryName }
  }, [filteredData])

  const statusCounts = useMemo(() => ({
    all: data.length,
    pending: data.filter((item) => item.status === "pending").length,
    reconciled: data.filter((item) => item.status === "reconciled").length,
    cancelled: data.filter((item) => item.status === "cancelled").length,
  }), [data])

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Entradas e Saídas</h2>
          <p className="text-sm text-gray-500">Livro-caixa da loja, com vendas automáticas e lançamentos manuais.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterMonth}
            onChange={(event) => setFilterMonth(event.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 shadow-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
          >
            {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button onClick={openNewTransaction}>
            <Plus className="mr-2 h-4 w-4" /> Novo lançamento
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Entradas" value={formatBRL(totals.income)} hint="Vendas + receitas manuais" icon={ArrowUpIcon} tone="green" />
        <Metric title="Saídas" value={formatBRL(totals.expense)} hint="Despesas registradas" icon={ArrowDownIcon} tone="red" />
        <Metric title="Saldo do filtro" value={formatBRL(totals.balance)} hint="Entradas menos saídas" icon={Wallet} tone={totals.balance >= 0 ? "navy" : "red"} />
        <Metric title="A conciliar" value={formatBRL(totals.pending)} hint={`${statusCounts.pending} movimento(s) pendente(s)`} icon={Clock3} tone="yellow" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por descrição, categoria, pagamento ou observação..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "Todos" },
              { key: "income", label: "Entradas" },
              { key: "expense", label: "Saídas" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilterType(item.key as any)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                  filterType === item.key ? "border-navy-900 bg-navy-900 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {[
            { key: "all", label: "Todos", count: statusCounts.all },
            { key: "pending", label: "Pendentes", count: statusCounts.pending },
            { key: "reconciled", label: "Conciliados", count: statusCounts.reconciled },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilterStatus(item.key as any)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                filterStatus === item.key ? "bg-royal-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {item.label} <span className="opacity-70">({item.count})</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Movimentações</h3>
            <p className="text-sm text-gray-500">{filteredData.length} item(ns) no filtro · maior gasto: {totals.topCategory}</p>
          </div>
          <ReceiptText className="h-5 w-5 text-royal-500" />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-royal-500 border-t-transparent" />
          </div>
        ) : filteredData.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Movimento</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Categoria</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Data</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Pagamento</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Valor</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.map((item) => (
                    <MovementRow
                      key={`${item.source}-${item.id}`}
                      item={item}
                      onEdit={openEditTransaction}
                      onDelete={handleDeleteTransaction}
                      deleteConfirmId={deleteConfirmId}
                      deletingId={deletingId}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {filteredData.map((item) => (
                <MovementCard
                  key={`${item.source}-${item.id}`}
                  item={item}
                  onEdit={openEditTransaction}
                  onDelete={handleDeleteTransaction}
                  deleteConfirmId={deleteConfirmId}
                  deletingId={deletingId}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
              <div>
                <h3 className="font-display text-lg font-bold text-navy-900 font-syne">{editingItem ? "Editar lançamento" : "Novo lançamento"}</h3>
                <p className="text-sm text-gray-500">{editingItem ? "Atualize categoria, valor, data e observações." : "Registre despesas fixas, receitas manuais e ajustes de caixa."}</p>
              </div>
              <button onClick={closeModal} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    const account = findFallbackChartAccount("income", "Venda de produtos")
                    setFormType("income")
                    setFormChartAccountId(account?.id || "")
                    setFormCategory(account?.name || ENTRADAS_CATEGORIES[0])
                  }}
                  className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold", formType === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500")}
                >
                  <ArrowUpIcon className="h-4 w-4" /> Entrada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const account = findFallbackChartAccount("expense", "Aluguel")
                    setFormType("expense")
                    setFormChartAccountId(account?.id || "")
                    setFormCategory(account?.name || SAIDAS_CATEGORIES[0])
                  }}
                  className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold", formType === "expense" ? "bg-white text-red-600 shadow-sm" : "text-gray-500")}
                >
                  <ArrowDownIcon className="h-4 w-4" /> Saída
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-navy-900">Categoria</span>
                  <select
                    value={formChartAccountId || formCategory}
                    onChange={(event) => {
                      const account = chartAccountById.get(event.target.value)
                      setFormChartAccountId(account?.id || "")
                      setFormCategory(account?.name || event.target.value)
                    }}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                  >
                    {selectableChartAccounts.length > 0
                      ? selectableChartAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                      ))
                      : (formType === "income" ? ENTRADAS_CATEGORIES : SAIDAS_CATEGORIES).map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                  </select>
                </label>
                <Input label="Descrição" placeholder="Ex: Aluguel da loja" value={formDesc} onChange={(event) => setFormDesc(event.target.value)} />
                <Input label="Valor" inputMode="numeric" value={formAmount} onChange={(event) => setFormAmount(formatCurrencyInput(event.target.value))} />
                <Input label="Data" type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
                <Input label="Vencimento" type="date" value={formDueDate} onChange={(event) => setFormDueDate(event.target.value)} />
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-navy-900">Forma de pagamento</span>
                  <select
                    value={formPayment}
                    onChange={(event) => setFormPayment(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                  >
                    {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-navy-900">Conta</span>
                  <select
                    value={formAccountId}
                    onChange={(event) => setFormAccountId(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                  >
                    <option value="">Não conciliar agora</option>
                    {financeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}{account.institution ? ` · ${account.institution}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs text-gray-400">
                    Com conta selecionada, o lançamento entra como conciliado.
                  </span>
                </label>
                <Input label="Observações" value={formNotes} onChange={(event) => setFormNotes(event.target.value)} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={closeModal}>Cancelar</Button>
                <Button type="submit" fullWidth isLoading={isSubmitting}>{editingItem ? "Salvar alterações" : "Salvar lançamento"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ title, value, hint, icon: Icon, tone }: { title: string; value: string; hint: string; icon: any; tone: "green" | "red" | "navy" | "yellow" }) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    navy: "bg-navy-900 text-white",
    yellow: "bg-yellow-50 text-yellow-600",
  }[tone]
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
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

function MovementRow({
  item,
  onEdit,
  onDelete,
  deleteConfirmId,
  deletingId,
}: {
  item: UnifiedTransaction
  onEdit: (item: UnifiedTransaction) => void
  onDelete: (item: UnifiedTransaction) => void
  deleteConfirmId: string | null
  deletingId: string | null
}) {
  const canManage = item.source === "manual"
  return (
    <tr className="transition-colors hover:bg-gray-50/70">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <MovementIcon item={item} />
          <div>
            <p className="font-semibold text-navy-900">{item.description}</p>
            <p className="text-xs text-gray-500">{item.source === "sale" ? "Venda do sistema" : "Lançamento manual"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{item.category}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatDate(item.date)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{item.payment_method}</td>
      <td className="px-4 py-4 text-center"><StatusBadge status={item.status} /></td>
      <td className={cn("px-5 py-4 text-right font-bold", item.type === "income" ? "text-emerald-600" : "text-red-600")}>
        {item.type === "income" ? "+" : "-"}{formatBRL(item.amount)}
      </td>
      <td className="px-5 py-4">
        <MovementActions
          item={item}
          canManage={canManage}
          onEdit={onEdit}
          onDelete={onDelete}
          deleteConfirmId={deleteConfirmId}
          deletingId={deletingId}
        />
      </td>
    </tr>
  )
}

function MovementCard({
  item,
  onEdit,
  onDelete,
  deleteConfirmId,
  deletingId,
}: {
  item: UnifiedTransaction
  onEdit: (item: UnifiedTransaction) => void
  onDelete: (item: UnifiedTransaction) => void
  deleteConfirmId: string | null
  deletingId: string | null
}) {
  const canManage = item.source === "manual"
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <MovementIcon item={item} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-900">{item.description}</p>
            <p className="text-xs text-gray-500">{item.category} · {formatDate(item.date)}</p>
            <div className="mt-2"><StatusBadge status={item.status} /></div>
          </div>
        </div>
        <p className={cn("shrink-0 font-bold", item.type === "income" ? "text-emerald-600" : "text-red-600")}>
          {item.type === "income" ? "+" : "-"}{formatBRL(item.amount)}
        </p>
      </div>
      <div className="mt-3 flex justify-end">
        <MovementActions
          item={item}
          canManage={canManage}
          onEdit={onEdit}
          onDelete={onDelete}
          deleteConfirmId={deleteConfirmId}
          deletingId={deletingId}
        />
      </div>
    </div>
  )
}

function MovementActions({
  item,
  canManage,
  onEdit,
  onDelete,
  deleteConfirmId,
  deletingId,
}: {
  item: UnifiedTransaction
  canManage: boolean
  onEdit: (item: UnifiedTransaction) => void
  onDelete: (item: UnifiedTransaction) => void
  deleteConfirmId: string | null
  deletingId: string | null
}) {
  if (!canManage) {
    return <span className="block text-right text-xs text-gray-300">Sistema</span>
  }

  const confirming = deleteConfirmId === item.id
  const deleting = deletingId === item.id

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onEdit(item)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-royal-200 hover:bg-royal-50 hover:text-royal-600"
        title="Editar lançamento"
        aria-label="Editar lançamento"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(item)}
        disabled={deleting}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-colors disabled:opacity-60",
          confirming ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100" : "w-9 border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        )}
        title={confirming ? "Confirmar exclusão" : "Excluir lançamento"}
        aria-label={confirming ? "Confirmar exclusão" : "Excluir lançamento"}
      >
        {confirming ? (deleting ? "..." : "Confirmar") : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  )
}

function MovementIcon({ item }: { item: UnifiedTransaction }) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", item.type === "income" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
      {item.type === "income" ? <ArrowUpIcon className="h-5 w-5" /> : <ArrowDownIcon className="h-5 w-5" />}
    </div>
  )
}

function StatusBadge({ status }: { status: MovementStatus }) {
  if (status === "reconciled") return <Badge variant="green" dot>Conciliado</Badge>
  if (status === "cancelled") return <Badge variant="red" dot>Cancelado</Badge>
  return <Badge variant="yellow" dot>Pendente</Badge>
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
        <FileText className="h-7 w-7" />
      </div>
      <h3 className="font-semibold text-navy-900">Nenhuma movimentação</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">Não encontramos entradas ou saídas para os filtros selecionados.</p>
    </div>
  )
}
