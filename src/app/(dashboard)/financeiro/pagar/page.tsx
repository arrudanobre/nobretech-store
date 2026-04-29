"use client"

import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Pencil, Plus, ReceiptText, Save, Search, Trash2, Wallet, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { FinanceTransactionModal } from "@/components/finance/transaction-modal"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate, formatPaymentMethod, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

type FinanceAccount = { id: string; name: string; institution?: string | null }
type ChartAccount = { id: string; name: string; cash_flow_type: string; financial_type: string; statement_section: string; level?: number | null; affects_dre?: boolean | null; sort_order?: number | null }
type PayableStatus = "pending" | "reconciled" | "cancelled"
type Transaction = {
  id: string
  account_id?: string | null
  account_name?: string | null
  category: string
  description?: string | null
  amount: number
  date: string
  due_date?: string | null
  payment_method?: string | null
  status?: PayableStatus | null
  source_type?: string | null
  notes?: string | null
}

const METHODS = ["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Transferência"]

function toDateOnly(date?: string | null) {
  if (!date) return todayISO()
  const value = String(date)
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return todayISO()
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function daysUntil(date?: string | null) {
  const start = new Date(`${todayISO()}T00:00:00`)
  const end = new Date(`${toDateOnly(date)}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

function formatDueDate(date?: string | null) {
  return formatDate(toDateOnly(date))
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  const cents = Number(digits || "0")
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, "") || "0") / 100
}

function monthGroupLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1))
  return label.replace(/^\w/, (letter) => letter.toUpperCase())
}

export default function ContasPagarPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingSeriesKey, setDeletingSeriesKey] = useState<string | null>(null)
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [dueDateInput, setDueDateInput] = useState("")
  const [savingDueId, setSavingDueId] = useState<string | null>(null)
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [sharedModalOpen, setSharedModalOpen] = useState(false)
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickChartAccountId, setQuickChartAccountId] = useState("")
  const [quickDesc, setQuickDesc] = useState("")
  const [quickAmount, setQuickAmount] = useState("R$ 0,00")
  const [quickDueDate, setQuickDueDate] = useState(todayISO())
  const [quickPayment, setQuickPayment] = useState("Pix")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"open" | "overdue" | "week" | "paid">("open")
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) setSelectedAccountId(accounts[0].id)
  }, [accounts, selectedAccountId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [accountsRes, chartAccountsRes, transactionsRes] = await Promise.all([
        (supabase.from("finance_accounts") as any)
          .select("id, name, institution")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (supabase.from("finance_chart_accounts") as any)
          .select("id, name, cash_flow_type, financial_type, statement_section, level, affects_dre, sort_order")
          .eq("is_active", true)
          .eq("cash_flow_type", "expense")
          .order("sort_order", { ascending: true }),
        (supabase.from("transactions") as any)
          .select("*")
          .eq("type", "expense")
          .neq("status", "cancelled")
          .order("due_date", { ascending: true }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      if (transactionsRes.error) throw new Error(transactionsRes.error.message)

      const accountNameById = new Map((accountsRes.data || []).map((account: FinanceAccount) => [
        account.id,
        account.institution ? `${account.name} · ${account.institution}` : account.name,
      ]))

      const transactions = (transactionsRes.data || []).map((transaction: any) => ({
        ...transaction,
        amount: Number(transaction.amount || 0),
        account_name: transaction.account_id ? accountNameById.get(transaction.account_id) || "Conta não encontrada" : null,
      }))

      setAccounts(accountsRes.data || [])
      const validChartAccounts = (chartAccountsRes.data || []).filter((account: ChartAccount) => account.level !== 1 && account.statement_section === "dre")
      setChartAccounts(validChartAccounts)
      if (!quickChartAccountId && validChartAccounts[0]?.id) setQuickChartAccountId(validChartAccounts[0].id)
      setItems(transactions)
    } catch (error: any) {
      toast({ title: "Erro ao carregar contas a pagar", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return items.filter((item) => {
      const due = toDateOnly(item.due_date || item.date)
      const delta = daysUntil(due)
      const paid = item.status === "reconciled"
      const matchesFilter =
        filter === "paid"
          ? paid
          : paid
            ? false
            : filter === "overdue"
              ? delta < 0
              : filter === "week"
                ? delta >= 0 && delta <= 7
                : true

      if (!matchesFilter) return false
      if (!normalizedSearch) return true

      const haystack = [
        item.description,
        item.category,
        item.payment_method,
        item.account_name,
        item.notes,
        item.source_type,
      ].filter(Boolean).join(" ").toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [filter, items, search])

  const totals = useMemo(() => {
    const unpaidItems = items.filter((item) => item.status !== "reconciled")
    const open = unpaidItems.reduce((sum, item) => sum + Number(item.amount), 0)
    const overdue = unpaidItems.filter((item) => daysUntil(item.due_date || item.date) < 0).reduce((sum, item) => sum + Number(item.amount), 0)
    const week = unpaidItems.filter((item) => {
      const delta = daysUntil(item.due_date || item.date)
      return delta >= 0 && delta <= 7
    }).reduce((sum, item) => sum + Number(item.amount), 0)
    const paid = items.filter((item) => item.status === "reconciled").reduce((sum, item) => sum + Number(item.amount), 0)
    return { open, overdue, week, paid }
  }, [items])

  const grouped = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; total: number; count: number; items: Transaction[] }>()

    for (const item of filtered) {
      const due = toDateOnly(item.due_date || item.date)
      const key = due.slice(0, 7)
      const current = groups.get(key) || { key, label: monthGroupLabel(key), total: 0, count: 0, items: [] }
      current.total += Number(item.amount || 0)
      current.count += 1
      current.items.push(item)
      groups.set(key, current)
    }

    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [filtered])

  const seriesMeta = (item: Transaction) => {
    const description = item.description || ""
    const match = description.match(/^(.*)\s\((\d+)\/(\d+)\)$/)
    if (!match) return null
    return { base: match[1], index: Number(match[2]), total: Number(match[3]), key: `${match[1]}|${match[3]}|${item.category}|${item.payment_method || ""}` }
  }

  const seriesItemsFor = (item: Transaction) => {
    const meta = seriesMeta(item)
    if (!meta) return []
    return items.filter((candidate) => {
      const candidateMeta = seriesMeta(candidate)
      return candidate.status !== "reconciled"
        && candidateMeta?.base === meta.base
        && candidateMeta?.total === meta.total
        && candidate.category === item.category
        && candidate.payment_method === item.payment_method
    })
  }

  const openQuickModal = () => {
    const account = chartAccounts[0]
    setQuickChartAccountId(account?.id || "")
    setQuickDesc("")
    setQuickAmount("R$ 0,00")
    setQuickDueDate(todayISO())
    setQuickPayment("Pix")
    setQuickModalOpen(true)
  }

  const saveQuickExpense = async (event: React.FormEvent) => {
    event.preventDefault()
    const chartAccount = chartAccounts.find((account) => account.id === quickChartAccountId)
    const amount = parseCurrencyInput(quickAmount)
    if (!chartAccount || !quickDesc.trim() || amount <= 0 || !quickDueDate) {
      toast({ title: "Preencha categoria, descrição, valor e vencimento", type: "error" })
      return
    }
    setQuickSaving(true)
    try {
      const { error } = await (supabase.from("transactions") as any).insert({
        type: "expense",
        chart_account_id: chartAccount.id,
        category: chartAccount.name,
        description: quickDesc.trim(),
        amount,
        date: quickDueDate,
        due_date: quickDueDate,
        payment_method: quickPayment,
        status: "pending",
      })
      if (error) throw error
      toast({ title: "Conta criada", type: "success" })
      setQuickModalOpen(false)
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao criar conta", description: error.message, type: "error" })
    } finally {
      setQuickSaving(false)
    }
  }

  const startEditDueDate = (item: Transaction) => {
    setEditingDueId(item.id)
    setDueDateInput(toDateOnly(item.due_date || item.date))
  }

  const cancelEditDueDate = () => {
    setEditingDueId(null)
    setDueDateInput("")
  }

  const saveDueDate = async (item: Transaction) => {
    if (!dueDateInput) {
      toast({ title: "Informe a data de vencimento", type: "error" })
      return
    }

    setSavingDueId(item.id)
    try {
      const { error } = await (supabase.from("transactions") as any)
        .update({ due_date: dueDateInput })
        .eq("id", item.id)
      if (error) throw error

      toast({ title: "Vencimento atualizado", type: "success" })
      cancelEditDueDate()
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao atualizar vencimento", description: error.message, type: "error" })
    } finally {
      setSavingDueId(null)
    }
  }

  const markPaid = async (item: Transaction) => {
    if (!selectedAccountId) {
      toast({ title: "Selecione uma conta", description: "A baixa precisa indicar de qual conta saiu o dinheiro.", type: "error" })
      return
    }

    setPayingId(item.id)
    try {
      const { error } = await (supabase.from("transactions") as any)
        .update({
          account_id: selectedAccountId,
          date: todayISO(),
          status: "reconciled",
          reconciled_at: new Date().toISOString(),
        })
        .eq("id", item.id)
      if (error) throw error

      toast({ title: "Conta paga", type: "success" })
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao baixar conta", description: error.message, type: "error" })
    } finally {
      setPayingId(null)
    }
  }

  const deleteOne = async (item: Transaction) => {
    if (item.status === "reconciled") {
      toast({ title: "Conta já paga", description: "Desfaça a conciliação em Entradas e Saídas antes de excluir.", type: "error" })
      return
    }
    if (!window.confirm(`Excluir "${item.description || item.category}"?`)) return
    setDeletingId(item.id)
    try {
      const { error } = await (supabase.from("transactions") as any).delete().eq("id", item.id)
      if (error) throw error
      toast({ title: "Conta excluída", type: "success" })
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao excluir conta", description: error.message, type: "error" })
    } finally {
      setDeletingId(null)
    }
  }

  const deleteSeries = async (item: Transaction) => {
    const related = seriesItemsFor(item)
    const meta = seriesMeta(item)
    if (!meta || related.length <= 1) {
      deleteOne(item)
      return
    }
    if (!window.confirm(`Excluir o lançamento inteiro "${meta.base}" com ${related.length} parcela(s) em aberto?`)) return
    setDeletingSeriesKey(meta.key)
    try {
      const { error } = await (supabase.from("transactions") as any).delete().in("id", related.map((entry) => entry.id))
      if (error) throw error
      toast({ title: "Lançamento excluído", description: `${related.length} parcela(s) removida(s).`, type: "success" })
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao excluir lançamento", description: error.message, type: "error" })
    } finally {
      setDeletingSeriesKey(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Contas a Pagar</h2>
          <p className="text-sm text-gray-500">Despesas pendentes, vencimentos e baixa por conta da empresa.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 shadow-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
          >
            <option value="">Selecione uma conta</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>
            ))}
          </select>
          <Button variant="primary" className="w-full sm:w-auto" onClick={() => setSharedModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo lançamento
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric title="A pagar" value={formatBRL(totals.open)} icon={Wallet} tone="navy" />
        <Metric title="Vencidas" value={formatBRL(totals.overdue)} icon={AlertTriangle} tone="red" />
        <Metric title="Próx. 7 dias" value={formatBRL(totals.week)} icon={CalendarClock} tone="yellow" />
        <Metric title="Pagas" value={formatBRL(totals.paid)} icon={CheckCircle2} tone="green" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "open", label: "Em aberto" },
              { key: "overdue", label: "Vencidas" },
              { key: "week", label: "Próx. 7 dias" },
              { key: "paid", label: "Pagas" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key as any)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", filter === item.key ? "bg-navy-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="w-full lg:max-w-sm">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por descrição, categoria ou conta..."
              icon={<Search className="h-4 w-4" />}
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Pagamentos</h3>
            <p className="text-sm text-gray-500">{filtered.length} item(ns) no filtro</p>
          </div>
          <ReceiptText className="h-5 w-5 text-royal-500" />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Carregando contas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Nenhuma conta encontrada nesse filtro.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Conta</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Origem</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Vencimento</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">Prazo</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Valor</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((group) => (
                    <FragmentGroup key={group.key} group={group}>
                      {group.items.map((item) => (
                        <PayableRow
                          key={item.id}
                          item={item}
                          editingDueId={editingDueId}
                          dueDateInput={dueDateInput}
                          savingDueId={savingDueId}
                          payingId={payingId}
                          onDueDateChange={setDueDateInput}
                          onStartEditDueDate={startEditDueDate}
                          onCancelEditDueDate={cancelEditDueDate}
                          onSaveDueDate={saveDueDate}
                          onPay={markPaid}
                          onDeleteOne={deleteOne}
                          onDeleteSeries={deleteSeries}
                          deletingId={deletingId}
                          deletingSeriesKey={deletingSeriesKey}
                          getSeriesMeta={seriesMeta}
                        />
                      ))}
                    </FragmentGroup>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {grouped.map((group) => (
                <div key={group.key}>
                  <MonthGroupHeader group={group} mobile />
                  {group.items.map((item) => (
                    <PayableMobileCard
                      key={item.id}
                      item={item}
                      editingDueId={editingDueId}
                      dueDateInput={dueDateInput}
                      savingDueId={savingDueId}
                      payingId={payingId}
                      onDueDateChange={setDueDateInput}
                      onStartEditDueDate={startEditDueDate}
                      onCancelEditDueDate={cancelEditDueDate}
                      onSaveDueDate={saveDueDate}
                      onPay={markPaid}
                      onDeleteOne={deleteOne}
                      onDeleteSeries={deleteSeries}
                      deletingId={deletingId}
                      deletingSeriesKey={deletingSeriesKey}
                      getSeriesMeta={seriesMeta}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      {quickModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
              <div>
                <h3 className="font-display text-lg font-bold text-navy-900 font-syne">Novo lançamento a pagar</h3>
                <p className="text-sm text-gray-500">Crie uma conta pendente sem sair desta tela.</p>
              </div>
              <button onClick={() => setQuickModalOpen(false)} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveQuickExpense} className="space-y-4 p-5">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-navy-900">Categoria DRE</span>
                <select
                  value={quickChartAccountId}
                  onChange={(event) => setQuickChartAccountId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                >
                  {chartAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Descrição" placeholder="Ex: Fatura Nubank" value={quickDesc} onChange={(event) => setQuickDesc(event.target.value)} />
                <Input label="Valor" inputMode="numeric" value={quickAmount} onChange={(event) => setQuickAmount(formatCurrencyInput(event.target.value))} />
                <Input label="Vencimento" type="date" value={quickDueDate} onChange={(event) => setQuickDueDate(event.target.value)} />
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-navy-900">Forma de pagamento</span>
                  <select
                    value={quickPayment}
                    onChange={(event) => setQuickPayment(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                  >
                    {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setQuickModalOpen(false)}>Cancelar</Button>
                <Button type="submit" fullWidth isLoading={quickSaving}>Salvar lançamento</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      <FinanceTransactionModal
        open={sharedModalOpen}
        defaultType="expense"
        onClose={() => setSharedModalOpen(false)}
        onSaved={fetchData}
      />
    </div>
  )
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: "navy" | "red" | "yellow" | "green" }) {
  const toneClass = {
    navy: "bg-navy-900 text-white",
    red: "bg-red-50 text-red-600",
    yellow: "bg-yellow-50 text-yellow-600",
    green: "bg-emerald-50 text-emerald-600",
  }[tone]
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass)}><Icon className="h-5 w-5" /></div>
      </div>
      <p className="whitespace-nowrap text-[1.55rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{value}</p>
    </Card>
  )
}

type PayableGroup = { key: string; label: string; total: number; count: number; items: Transaction[] }

function FragmentGroup({ group, children }: { group: PayableGroup; children: ReactNode }) {
  return (
    <Fragment>
      <MonthGroupHeader group={group} />
      {children}
    </Fragment>
  )
}

function MonthGroupHeader({ group, mobile = false }: { group: PayableGroup; mobile?: boolean }) {
  if (mobile) {
    return (
      <div className="flex items-center justify-between bg-navy-900 px-4 py-4 text-white">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider">{group.label}</p>
          <p className="text-xs text-white/60">{group.count} conta(s)</p>
        </div>
        <p className="text-sm font-bold text-red-200">-{formatBRL(group.total)}</p>
      </div>
    )
  }

  return (
    <tr className="bg-navy-900 text-white">
      <td colSpan={6} className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold uppercase tracking-wider">{group.label}</p>
            <p className="text-xs text-white/60">{group.count} conta(s) agrupada(s)</p>
          </div>
          <p className="text-lg font-bold text-red-200">-{formatBRL(group.total)}</p>
        </div>
      </td>
    </tr>
  )
}

function PayableRow({
  item,
  editingDueId,
  dueDateInput,
  savingDueId,
  payingId,
  onDueDateChange,
  onStartEditDueDate,
  onCancelEditDueDate,
  onSaveDueDate,
  onPay,
  onDeleteOne,
  onDeleteSeries,
  deletingId,
  deletingSeriesKey,
  getSeriesMeta,
}: PayableItemProps) {
  const due = toDateOnly(item.due_date || item.date)
  const delta = daysUntil(due)
  const paid = item.status === "reconciled"

  return (
    <tr className="transition-colors hover:bg-gray-50/70">
      <td className="px-5 py-4">
        <p className="font-semibold text-navy-900">{item.description || item.category}</p>
        <p className="text-xs text-gray-500">{item.category}</p>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {item.account_name || <span className="text-gray-400">Conta definida ao pagar</span>}
        {item.payment_method && <p className="text-xs text-gray-400">{formatPaymentMethod(item.payment_method)}</p>}
      </td>
      <td className="px-4 py-4">
        <DueDateEditor
          item={item}
          due={due}
          paid={paid}
          editingDueId={editingDueId}
          dueDateInput={dueDateInput}
          savingDueId={savingDueId}
          onDueDateChange={onDueDateChange}
          onStartEditDueDate={onStartEditDueDate}
          onCancelEditDueDate={onCancelEditDueDate}
          onSaveDueDate={onSaveDueDate}
        />
      </td>
      <td className="px-4 py-4 text-center">
        <DueBadge paid={paid} delta={delta} />
      </td>
      <td className="px-5 py-4 text-right font-bold text-red-600">-{formatBRL(Number(item.amount))}</td>
      <td className="px-5 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {paid ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onPay(item)} isLoading={payingId === item.id}>Pagar</Button>
              <button
                type="button"
                onClick={() => onDeleteOne(item)}
                disabled={deletingId === item.id}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Excluir esta parcela"
                aria-label="Excluir esta parcela"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {getSeriesMeta(item) && (
                <button
                  type="button"
                  onClick={() => onDeleteSeries(item)}
                  disabled={deletingSeriesKey === getSeriesMeta(item)?.key}
                  className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  Série
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function PayableMobileCard(props: PayableItemProps) {
  const { item, payingId, onPay, onDeleteOne, onDeleteSeries, deletingId, deletingSeriesKey, getSeriesMeta } = props
  const due = toDateOnly(item.due_date || item.date)
  const delta = daysUntil(due)
  const paid = item.status === "reconciled"

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy-900">{item.description || item.category}</p>
          <p className="text-xs text-gray-500">{item.category}</p>
          <p className="mt-1 text-xs text-gray-400">{item.account_name || "Conta definida ao pagar"}</p>
        </div>
        <p className="shrink-0 font-bold text-red-600">-{formatBRL(Number(item.amount))}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <DueDateEditor {...props} due={due} paid={paid} />
        <DueBadge paid={paid} delta={delta} />
        {paid ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onPay(item)} isLoading={payingId === item.id}>Pagar</Button>
            <Button size="sm" variant="outline" onClick={() => onDeleteOne(item)} isLoading={deletingId === item.id}>Excluir</Button>
            {getSeriesMeta(item) && (
              <Button size="sm" variant="outline" onClick={() => onDeleteSeries(item)} isLoading={deletingSeriesKey === getSeriesMeta(item)?.key}>Série</Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type PayableItemProps = {
  item: Transaction
  editingDueId: string | null
  dueDateInput: string
  savingDueId: string | null
  payingId: string | null
  onDueDateChange: (value: string) => void
  onStartEditDueDate: (item: Transaction) => void
  onCancelEditDueDate: () => void
  onSaveDueDate: (item: Transaction) => void
  onPay: (item: Transaction) => void
  onDeleteOne: (item: Transaction) => void
  onDeleteSeries: (item: Transaction) => void
  deletingId: string | null
  deletingSeriesKey: string | null
  getSeriesMeta: (item: Transaction) => { base: string; index: number; total: number; key: string } | null
}

function DueDateEditor({
  item,
  due,
  paid,
  editingDueId,
  dueDateInput,
  savingDueId,
  onDueDateChange,
  onStartEditDueDate,
  onCancelEditDueDate,
  onSaveDueDate,
}: Omit<PayableItemProps, "payingId" | "onPay" | "onDeleteOne" | "onDeleteSeries" | "deletingId" | "deletingSeriesKey" | "getSeriesMeta"> & { due: string; paid: boolean }) {
  if (editingDueId === item.id) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dueDateInput}
          onChange={(event) => onDueDateChange(event.target.value)}
          className="h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none focus:border-royal-500"
        />
        <button
          type="button"
          onClick={() => onSaveDueDate(item)}
          disabled={savingDueId === item.id}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-royal-500 text-white disabled:opacity-60"
          aria-label="Salvar vencimento"
          title="Salvar vencimento"
        >
          <Save className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onCancelEditDueDate}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500"
          aria-label="Cancelar edição"
          title="Cancelar edição"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>Venc. {formatDueDate(due)}</span>
      {!paid && (
        <button
          type="button"
          onClick={() => onStartEditDueDate(item)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-royal-200 hover:bg-royal-50 hover:text-royal-600"
          aria-label="Editar vencimento"
          title="Editar vencimento"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function DueBadge({ paid, delta }: { paid: boolean; delta: number }) {
  return (
    <span className={cn(
      "inline-flex h-7 min-w-[88px] items-center justify-center rounded-full px-3 text-xs font-bold",
      paid ? "bg-emerald-100 text-emerald-700" : delta < 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
    )}>
      {paid ? "Pago" : delta < 0 ? "Atrasado" : delta === 0 ? "Hoje" : `${delta} dia(s)`}
    </span>
  )
}
