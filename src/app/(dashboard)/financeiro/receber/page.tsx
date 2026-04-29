"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, Clock3, Eye, Pencil, Save, Wallet, X } from "lucide-react"
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
type ReceivableItem = Receivable & {
  account_name?: string | null
  customer_name?: string | null
  product_summary?: string | null
  additional_count?: number
  sale_status?: string | null
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

export default function ContasReceberPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [items, setItems] = useState<ReceivableItem[]>([])
  const [loading, setLoading] = useState(true)
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [dueDateInput, setDueDateInput] = useState("")
  const [savingDueId, setSavingDueId] = useState<string | null>(null)
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
        (supabase.from("sales") as any).select("id, sale_date, payment_due_date, sale_status, sale_price, net_amount, payment_method, customer_id, customer:customer_id(full_name, name), inventory:inventory_id(catalog:catalog_id(model)), sales_additional_items(id)").neq("sale_status", "cancelled").order("sale_date", { ascending: true }),
        (supabase.from("transactions") as any).select("*").eq("type", "income").neq("status", "cancelled").order("due_date", { ascending: true }),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)
      if (transRes.error) throw new Error(transRes.error.message)

      const transactions = transRes.data || []
      const accountNameById = new Map((accountsRes.data || []).map((account: FinanceAccount) => [
        account.id,
        account.institution ? `${account.name} · ${account.institution}` : account.name,
      ]))
      const saleReceivableBySaleId = new Map(transactions.filter((t: any) => t.source_type === "sale" && t.source_id).map((t: any) => [String(t.source_id), t]))
      const reconciledSaleIds = new Set(transactions.filter((t: any) => t.source_type === "sale" && t.source_id && t.status === "reconciled").map((t: any) => String(t.source_id)))
      const manual = transactions
        .filter((t: any) => t.source_type !== "sale")
        .map((t: any) => ({
          ...t,
          amount: Number(t.amount),
          account_name: t.account_id ? accountNameById.get(t.account_id) || "Conta não encontrada" : null,
          source: "manual" as const,
        }))
      const sales = (salesRes.data || []).map((sale: any) => {
        const receivable = saleReceivableBySaleId.get(String(sale.id)) as any
        const dueDate = receivable?.due_date || sale.payment_due_date || sale.sale_date
        const modelName = sale.inventory?.catalog?.model || "Produto"
        const additionalCount = Array.isArray(sale.sales_additional_items) ? sale.sales_additional_items.length : 0
        return {
          id: sale.id,
          category: "Venda",
          description: `Venda · ${modelName}`,
          customer_name: sale.customer?.full_name || sale.customer?.name || null,
          product_summary: `${modelName}${additionalCount > 0 ? ` + ${additionalCount} item${additionalCount > 1 ? "s" : ""}` : ""}`,
          additional_count: additionalCount,
          amount: Number(sale.net_amount ?? sale.sale_price ?? 0),
          date: toDateOnly(sale.sale_date),
          due_date: toDateOnly(dueDate),
          payment_method: sale.payment_method || "Não informado",
          status: reconciledSaleIds.has(String(sale.id)) ? "reconciled" : "pending",
          account_id: receivable?.account_id || null,
          account_name: receivable?.account_id ? accountNameById.get(receivable.account_id) || "Conta não encontrada" : null,
          sale_status: sale.sale_status || null,
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

  const startEditDueDate = (item: ReceivableItem) => {
    setEditingDueId(item.id)
    setDueDateInput(toDateOnly(item.due_date || item.date))
  }

  const cancelEditDueDate = () => {
    setEditingDueId(null)
    setDueDateInput("")
  }

  const saveDueDate = async (item: ReceivableItem) => {
    if (!dueDateInput) {
      toast({ title: "Informe a data prevista", type: "error" })
      return
    }
    setSavingDueId(item.id)
    try {
      if (item.source === "sale") {
        const { error: saleError } = await (supabase.from("sales") as any)
          .update({ payment_due_date: dueDateInput })
          .eq("id", item.id)
        if (saleError) throw saleError

        const { data: existingReceivable } = await (supabase.from("transactions") as any)
          .select("id")
          .eq("source_type", "sale")
          .eq("source_id", item.id)
          .maybeSingle()
        if (existingReceivable?.id) {
          const { error } = await (supabase.from("transactions") as any)
            .update({ due_date: dueDateInput })
            .eq("id", existingReceivable.id)
          if (error) throw error
        }
      } else {
        const { error } = await (supabase.from("transactions") as any)
          .update({ due_date: dueDateInput })
          .eq("id", item.id)
        if (error) throw error
      }
      toast({ title: "Data prevista atualizada", type: "success" })
      cancelEditDueDate()
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao atualizar data", description: error.message, type: "error" })
    } finally {
      setSavingDueId(null)
    }
  }

  const markReceived = async (item: ReceivableItem) => {
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
          date: todayISO(),
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
          .update({ account_id: selectedAccountId, date: todayISO(), status: "reconciled", reconciled_at: new Date().toISOString() })
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
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Recebíveis</h3>
            <p className="text-sm text-gray-500">{filtered.length} item(ns) no filtro</p>
          </div>
          <Wallet className="h-5 w-5 text-royal-500" />
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Carregando recebíveis...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Nenhuma conta encontrada nesse filtro.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Recebível</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Conta</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Previsão</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">Prazo</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Valor</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item) => (
                    <ReceivableRow
                      key={`${item.source}-${item.id}`}
                      item={item}
                      editingDueId={editingDueId}
                      dueDateInput={dueDateInput}
                      savingDueId={savingDueId}
                      receivingId={receivingId}
                      onDueDateChange={setDueDateInput}
                      onStartEditDueDate={startEditDueDate}
                      onCancelEditDueDate={cancelEditDueDate}
                      onSaveDueDate={saveDueDate}
                      onReceive={markReceived}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {filtered.map((item) => (
                <ReceivableMobileCard
                  key={`${item.source}-${item.id}`}
                  item={item}
                  editingDueId={editingDueId}
                  dueDateInput={dueDateInput}
                  savingDueId={savingDueId}
                  receivingId={receivingId}
                  onDueDateChange={setDueDateInput}
                  onStartEditDueDate={startEditDueDate}
                  onCancelEditDueDate={cancelEditDueDate}
                  onSaveDueDate={saveDueDate}
                  onReceive={markReceived}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: "navy" | "green" | "blue" }) {
  const toneClass = { navy: "bg-navy-900 text-white", green: "bg-emerald-50 text-emerald-600", blue: "bg-royal-50 text-royal-600" }[tone]
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

function ReceivableRow({
  item,
  editingDueId,
  dueDateInput,
  savingDueId,
  receivingId,
  onDueDateChange,
  onStartEditDueDate,
  onCancelEditDueDate,
  onSaveDueDate,
  onReceive,
}: ReceivableItemProps) {
  const due = toDateOnly(item.due_date || item.date)
  const delta = daysUntil(due)
  const received = item.status === "reconciled"

  return (
    <tr className="transition-colors hover:bg-gray-50/70">
      <td className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-navy-900">{item.source === "sale" ? item.customer_name || "Cliente não informado" : item.description || item.category}</p>
          {item.sale_status === "reserved" && <Badge variant="yellow">Reservada</Badge>}
        </div>
        <p className="text-xs text-gray-500">
          {item.source === "sale" ? `Venda · ${item.product_summary || item.description?.replace(/^Venda · /, "") || "Produto"}` : item.category}
        </p>
        {item.source === "sale" && (
          <Link href={`/vendas/${item.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:text-royal-700">
            <Eye className="h-3.5 w-3.5" /> Ver detalhes
          </Link>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">
        {item.account_name || <span className="text-gray-400">Conta definida ao receber</span>}
      </td>
      <td className="px-4 py-4">
        <DueDateEditor
          item={item}
          due={due}
          received={received}
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
        <DueBadge received={received} delta={delta} />
      </td>
      <td className="px-5 py-4 text-right font-bold text-emerald-600">+{formatBRL(Number(item.amount))}</td>
      <td className="px-5 py-4 text-right">
        {received ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onReceive(item)} isLoading={receivingId === item.id}>Receber</Button>
        )}
      </td>
    </tr>
  )
}

function ReceivableMobileCard(props: ReceivableItemProps) {
  const { item, receivingId, onReceive } = props
  const due = toDateOnly(item.due_date || item.date)
  const delta = daysUntil(due)
  const received = item.status === "reconciled"

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-navy-900">{item.source === "sale" ? item.customer_name || "Cliente não informado" : item.description || item.category}</p>
            {item.sale_status === "reserved" && <Badge variant="yellow">Reservada</Badge>}
          </div>
          <p className="text-xs text-gray-500">
            {item.source === "sale" ? `Venda · ${item.product_summary || item.description?.replace(/^Venda · /, "") || "Produto"}` : item.category}
          </p>
          {item.source === "sale" && (
            <Link href={`/vendas/${item.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:text-royal-700">
              <Eye className="h-3.5 w-3.5" /> Ver detalhes
            </Link>
          )}
          <p className="mt-1 text-xs text-gray-400">{item.account_name || "Conta definida ao receber"}</p>
        </div>
        <p className="shrink-0 font-bold text-emerald-600">+{formatBRL(Number(item.amount))}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <DueDateEditor {...props} due={due} received={received} />
        <DueBadge received={received} delta={delta} />
        {received ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> OK</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onReceive(item)} isLoading={receivingId === item.id}>Receber</Button>
        )}
      </div>
    </div>
  )
}

type ReceivableItemProps = {
  item: ReceivableItem
  editingDueId: string | null
  dueDateInput: string
  savingDueId: string | null
  receivingId: string | null
  onDueDateChange: (value: string) => void
  onStartEditDueDate: (item: ReceivableItem) => void
  onCancelEditDueDate: () => void
  onSaveDueDate: (item: ReceivableItem) => void
  onReceive: (item: ReceivableItem) => void
}

function DueDateEditor({
  item,
  due,
  received,
  editingDueId,
  dueDateInput,
  savingDueId,
  onDueDateChange,
  onStartEditDueDate,
  onCancelEditDueDate,
  onSaveDueDate,
}: Omit<ReceivableItemProps, "receivingId" | "onReceive"> & { due: string; received: boolean }) {
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
          aria-label="Salvar data prevista"
          title="Salvar data prevista"
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
      <span>Prev. {formatDueDate(due)}</span>
      {!received && (
        <button
          type="button"
          onClick={() => onStartEditDueDate(item)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-royal-200 hover:bg-royal-50 hover:text-royal-600"
          aria-label="Editar data prevista"
          title="Editar data prevista"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function DueBadge({ received, delta }: { received: boolean; delta: number }) {
  return (
    <span className={cn(
      "inline-flex h-7 min-w-[88px] items-center justify-center rounded-full px-3 text-xs font-bold",
      received ? "bg-emerald-100 text-emerald-700" : delta < 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
    )}>
      {received ? "Recebido" : delta < 0 ? "Atrasado" : delta === 0 ? "Hoje" : `${delta} dia(s)`}
    </span>
  )
}
