"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Pencil, ReceiptText, Save, Search, Wallet, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

type FinanceAccount = { id: string; name: string; institution?: string | null }
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

export default function ContasPagarPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [dueDateInput, setDueDateInput] = useState("")
  const [savingDueId, setSavingDueId] = useState<string | null>(null)
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
      const [accountsRes, transactionsRes] = await Promise.all([
        (supabase.from("finance_accounts") as any)
          .select("id, name, institution")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (supabase.from("transactions") as any)
          .select("*")
          .eq("type", "expense")
          .neq("status", "cancelled")
          .order("due_date", { ascending: true }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
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
          <Link href="/financeiro/transacoes">
            <Button variant="primary" className="w-full sm:w-auto">Novo lançamento</Button>
          </Link>
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
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item) => (
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
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {filtered.map((item) => (
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
                />
              ))}
            </div>
          </>
        )}
      </Card>
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
        {item.payment_method && <p className="text-xs text-gray-400">{item.payment_method}</p>}
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
        {paid ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onPay(item)} isLoading={payingId === item.id}>Pagar</Button>
        )}
      </td>
    </tr>
  )
}

function PayableMobileCard(props: PayableItemProps) {
  const { item, payingId, onPay } = props
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
          <Button size="sm" variant="outline" onClick={() => onPay(item)} isLoading={payingId === item.id}>Pagar</Button>
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
}: Omit<PayableItemProps, "payingId" | "onPay"> & { due: string; paid: boolean }) {
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
