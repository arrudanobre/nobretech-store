"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Wallet } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

type FinanceAccount = { id: string; name: string; institution?: string | null }
type Transaction = {
  id: string
  account_id?: string | null
  category: string
  description?: string | null
  amount: number
  date: string
  due_date?: string | null
  payment_method?: string | null
  status?: "pending" | "reconciled" | "cancelled" | null
}

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

function toDateOnly(date?: string | null) {
  if (!date) return todayISO()
  const value = String(date)
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return todayISO()
  return parsed.toISOString().split("T")[0]
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
        (supabase.from("finance_accounts") as any).select("id, name, institution").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("transactions") as any).select("*").eq("type", "expense").neq("status", "cancelled").order("due_date", { ascending: true }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (transactionsRes.error) throw new Error(transactionsRes.error.message)
      setAccounts(accountsRes.data || [])
      setItems(transactionsRes.data || [])
    } catch (error: any) {
      toast({ title: "Erro ao carregar contas a pagar", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const due = toDateOnly(item.due_date || item.date)
      const delta = daysUntil(due)
      if (filter === "paid") return item.status === "reconciled"
      if (item.status === "reconciled") return false
      if (filter === "overdue") return delta < 0
      if (filter === "week") return delta >= 0 && delta <= 7
      return true
    })
  }, [filter, items])

  const totals = useMemo(() => {
    const open = items.filter((item) => item.status !== "reconciled").reduce((sum, item) => sum + Number(item.amount), 0)
    const overdue = items.filter((item) => item.status !== "reconciled" && daysUntil(item.due_date || item.date) < 0).reduce((sum, item) => sum + Number(item.amount), 0)
    const week = items.filter((item) => item.status !== "reconciled" && daysUntil(item.due_date || item.date) >= 0 && daysUntil(item.due_date || item.date) <= 7).reduce((sum, item) => sum + Number(item.amount), 0)
    return { open, overdue, week }
  }, [items])

  const markPaid = async (item: Transaction) => {
    if (!selectedAccountId) {
      toast({ title: "Selecione uma conta", description: "A baixa precisa indicar de qual conta saiu o dinheiro.", type: "error" })
      return
    }
    setPayingId(item.id)
    try {
      const { error } = await (supabase.from("transactions") as any)
        .update({ account_id: selectedAccountId, status: "reconciled", reconciled_at: new Date().toISOString() })
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
          <p className="text-sm text-gray-500">Despesas pendentes, vencimentos e baixa por conta bancária.</p>
        </div>
        <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 shadow-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10">
          <option value="">Selecione uma conta</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Em aberto" value={formatBRL(totals.open)} icon={Clock3} tone="navy" />
        <Metric title="Vencidas" value={formatBRL(totals.overdue)} icon={AlertTriangle} tone="red" />
        <Metric title="Próx. 7 dias" value={formatBRL(totals.week)} icon={CalendarClock} tone="yellow" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "open", label: "Em aberto" },
            { key: "overdue", label: "Vencidas" },
            { key: "week", label: "Próx. 7 dias" },
            { key: "paid", label: "Pagas" },
          ].map((item) => (
            <button key={item.key} onClick={() => setFilter(item.key as any)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", filter === item.key ? "bg-navy-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Carregando contas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Nenhuma conta encontrada nesse filtro.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((item) => {
              const due = toDateOnly(item.due_date || item.date)
              const delta = daysUntil(due)
              const paid = item.status === "reconciled"
              return (
                <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_150px_140px_130px] lg:items-center">
                  <div>
                    <p className="font-semibold text-navy-900">{item.description || item.category}</p>
                    <p className="text-xs text-gray-500">{item.category} · venc. {formatDueDate(due)}</p>
                  </div>
                  <Badge variant={paid ? "green" : delta < 0 ? "red" : "yellow"}>{paid ? "Pago" : delta < 0 ? "Vencida" : delta === 0 ? "Vence hoje" : `${delta} dia(s)`}</Badge>
                  <p className="font-bold text-red-600 lg:text-right">-{formatBRL(Number(item.amount))}</p>
                  <div className="lg:text-right">
                    {paid ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span> : <Button size="sm" variant="outline" onClick={() => markPaid(item)} isLoading={payingId === item.id}>Pagar</Button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: "navy" | "red" | "yellow" }) {
  const toneClass = { navy: "bg-navy-900 text-white", red: "bg-red-50 text-red-600", yellow: "bg-yellow-50 text-yellow-600" }[tone]
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass)}><Icon className="h-5 w-5" /></div>
      </div>
      <p className="text-2xl font-bold text-navy-900">{value}</p>
    </Card>
  )
}
