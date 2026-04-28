"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, Clock3, TrendingUp, Wallet } from "lucide-react"
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
  source_type?: string | null
  source_id?: string | null
}
type Receivable = Transaction & { source: "manual" | "sale" }

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

export default function ContasReceberPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [items, setItems] = useState<Receivable[]>([])
  const [loading, setLoading] = useState(true)
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"open" | "today" | "week" | "received">("open")
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
      const [accountsRes, salesRes, transRes] = await Promise.all([
        (supabase.from("finance_accounts") as any).select("id, name, institution").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("sales") as any).select("id, sale_date, payment_due_date, sale_status, sale_price, net_amount, payment_method, inventory:inventory_id(catalog:catalog_id(model))").neq("sale_status", "cancelled").order("sale_date", { ascending: true }),
        (supabase.from("transactions") as any).select("*").eq("type", "income").neq("status", "cancelled").order("due_date", { ascending: true }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)
      if (transRes.error) throw new Error(transRes.error.message)

      const transactions = transRes.data || []
      const saleReceivableBySaleId = new Map(transactions.filter((t: any) => t.source_type === "sale" && t.source_id).map((t: any) => [String(t.source_id), t]))
      const reconciledSaleIds = new Set(transactions.filter((t: any) => t.source_type === "sale" && t.source_id && t.status === "reconciled").map((t: any) => String(t.source_id)))
      const manual = transactions
        .filter((t: any) => t.source_type !== "sale")
        .map((t: any) => ({ ...t, amount: Number(t.amount), source: "manual" as const }))
      const sales = (salesRes.data || []).map((sale: any) => {
        const receivable = saleReceivableBySaleId.get(String(sale.id)) as any
        const dueDate = receivable?.due_date || sale.payment_due_date || sale.sale_date
        return {
          id: sale.id,
          category: "Venda",
          description: `Venda · ${sale.inventory?.catalog?.model || "Produto"}`,
          amount: Number(sale.net_amount ?? sale.sale_price ?? 0),
          date: toDateOnly(sale.sale_date),
          due_date: toDateOnly(dueDate),
          payment_method: sale.payment_method || "Não informado",
          status: reconciledSaleIds.has(String(sale.id)) ? "reconciled" : "pending",
          account_id: receivable?.account_id || null,
          source_type: "sale",
          source_id: sale.id,
          source: "sale" as const,
        }
      })
      setAccounts(accountsRes.data || [])
      setItems([...manual, ...sales].sort((a, b) => String(a.due_date || a.date).localeCompare(String(b.due_date || b.date))))
    } catch (error: any) {
      toast({ title: "Erro ao carregar contas a receber", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const due = toDateOnly(item.due_date || item.date)
      const delta = daysUntil(due)
      if (filter === "received") return item.status === "reconciled"
      if (item.status === "reconciled") return false
      if (filter === "today") return delta === 0
      if (filter === "week") return delta >= 0 && delta <= 7
      return true
    })
  }, [filter, items])

  const totals = useMemo(() => {
    const open = items.filter((item) => item.status !== "reconciled").reduce((sum, item) => sum + Number(item.amount), 0)
    const today = items.filter((item) => item.status !== "reconciled" && daysUntil(item.due_date || item.date) === 0).reduce((sum, item) => sum + Number(item.amount), 0)
    const week = items.filter((item) => {
      const delta = daysUntil(item.due_date || item.date)
      return item.status !== "reconciled" && delta >= 0 && delta <= 7
    }).reduce((sum, item) => sum + Number(item.amount), 0)
    return { open, today, week }
  }, [items])

  const markReceived = async (item: Receivable) => {
    if (!selectedAccountId) {
      toast({ title: "Selecione uma conta", description: "O recebimento precisa indicar em qual conta entrou o dinheiro.", type: "error" })
      return
    }
    setReceivingId(item.id)
    try {
      if (item.source === "sale") {
        const { data: existingReceivable } = await (supabase.from("transactions") as any)
          .select("id")
          .eq("source_type", "sale")
          .eq("source_id", item.id)
          .maybeSingle()
        const receivablePayload = {
          account_id: selectedAccountId,
          type: "income",
          category: "Venda de produtos",
          description: item.description,
          amount: item.amount,
          date: item.date,
          due_date: item.due_date || item.date,
          payment_method: item.payment_method,
          status: "reconciled",
          reconciled_at: new Date().toISOString(),
          source_type: "sale",
          source_id: item.id,
        }
        const { error } = existingReceivable?.id
          ? await (supabase.from("transactions") as any).update(receivablePayload).eq("id", existingReceivable.id)
          : await (supabase.from("transactions") as any).insert(receivablePayload)
        if (error) throw error
        await completeReservedSale(item.id)
      } else {
        const { error } = await (supabase.from("transactions") as any)
          .update({ account_id: selectedAccountId, status: "reconciled", reconciled_at: new Date().toISOString() })
          .eq("id", item.id)
        if (error) throw error
      }
      toast({ title: "Recebimento confirmado", type: "success" })
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao receber", description: error.message, type: "error" })
    } finally {
      setReceivingId(null)
    }
  }

  const completeReservedSale = async (saleId: string) => {
    const { data: sale, error: saleError } = await (supabase.from("sales") as any)
      .select("id, company_id, inventory_id, customer_id, source_type, warranty_months, warranty_start, warranty_end, sale_date")
      .eq("id", saleId)
      .single()
    if (saleError || !sale) throw new Error(saleError?.message || "Venda não encontrada")

    const { error: updateSaleError } = await (supabase.from("sales") as any)
      .update({ sale_status: "completed" })
      .eq("id", saleId)
    if (updateSaleError) throw updateSaleError

    if ((sale as any).source_type === "own") {
      await (supabase.from("inventory") as any).update({ status: "sold" }).eq("id", (sale as any).inventory_id)
    }

    const { data: additionalItems } = await (supabase.from("sales_additional_items") as any)
      .select("product_id")
      .eq("sale_id", saleId)
    for (const item of additionalItems || []) {
      if ((item as any).product_id) {
        await (supabase.from("inventory") as any).update({ status: "sold" }).eq("id", (item as any).product_id)
      }
    }

    if (Number((sale as any).warranty_months || 0) > 0) {
      const { data: existingWarranty } = await (supabase.from("warranties") as any)
        .select("id")
        .eq("sale_id", saleId)
        .maybeSingle()
      if (!existingWarranty?.id) {
        await (supabase.from("warranties") as any).insert({
          company_id: (sale as any).company_id,
          sale_id: saleId,
          inventory_id: (sale as any).inventory_id,
          customer_id: (sale as any).customer_id,
          start_date: (sale as any).warranty_start || (sale as any).sale_date,
          end_date: (sale as any).warranty_end,
          status: "active",
        })
      }
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Contas a Receber</h2>
          <p className="text-sm text-gray-500">Vendas e receitas pendentes de entrada na conta da empresa.</p>
        </div>
        <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 shadow-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10">
          <option value="">Selecione uma conta</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="A receber" value={formatBRL(totals.open)} icon={Wallet} tone="navy" />
        <Metric title="Hoje" value={formatBRL(totals.today)} icon={Clock3} tone="green" />
        <Metric title="Próx. 7 dias" value={formatBRL(totals.week)} icon={CalendarClock} tone="blue" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "open", label: "Em aberto" },
            { key: "today", label: "Hoje" },
            { key: "week", label: "Próx. 7 dias" },
            { key: "received", label: "Recebidas" },
          ].map((item) => (
            <button key={item.key} onClick={() => setFilter(item.key as any)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", filter === item.key ? "bg-navy-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Carregando recebíveis...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Nenhuma conta encontrada nesse filtro.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((item) => {
              const due = toDateOnly(item.due_date || item.date)
              const delta = daysUntil(due)
              const received = item.status === "reconciled"
              return (
                <div key={`${item.source}-${item.id}`} className="grid gap-3 p-4 lg:grid-cols-[1fr_150px_140px_130px] lg:items-center">
                  <div>
                    <p className="font-semibold text-navy-900">{item.description || item.category}</p>
                    <p className="text-xs text-gray-500">{item.category} · prev. {formatDueDate(due)}</p>
                  </div>
                  <Badge variant={received ? "green" : delta < 0 ? "red" : "yellow"}>{received ? "Recebido" : delta < 0 ? "Atrasado" : delta === 0 ? "Hoje" : `${delta} dia(s)`}</Badge>
                  <p className="font-bold text-emerald-600 lg:text-right">+{formatBRL(Number(item.amount))}</p>
                  <div className="lg:text-right">
                    {received ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span> : <Button size="sm" variant="outline" onClick={() => markReceived(item)} isLoading={receivingId === item.id}>Receber</Button>}
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

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: "navy" | "green" | "blue" }) {
  const toneClass = { navy: "bg-navy-900 text-white", green: "bg-emerald-50 text-emerald-600", blue: "bg-royal-50 text-royal-600" }[tone]
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
