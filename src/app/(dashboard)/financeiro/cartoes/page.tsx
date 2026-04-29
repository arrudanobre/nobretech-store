"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, CreditCard, Eye, Pencil, Plus, ReceiptText, Save, Wallet, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

type CreditCardAccount = {
  id: string
  name: string
  issuer?: string | null
  last_four?: string | null
  due_day: number
  closing_day?: number | null
  closing_days_before_due?: number | null
  current_invoice_closed?: boolean | null
  current_invoice_closing_date?: string | null
  is_active?: boolean | null
}

type FinanceAccount = { id: string; name: string; institution?: string | null }

type Transaction = {
  id: string
  description?: string | null
  category?: string | null
  amount: number
  due_date?: string | null
  date: string
  status?: string | null
  credit_card_id?: string | null
  payment_method?: string | null
  notes?: string | null
}

function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(Math.max(1, day), new Date(year, monthIndex + 1, 0).getDate())
}

function dateWithDay(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(clampDay(year, monthIndex, day)).padStart(2, "0")}`
}

function addDays(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function getCurrentInvoice(card: CreditCardAccount) {
  const today = new Date(`${todayISO()}T00:00:00`)
  let dueMonth = today.getMonth()
  let dueYear = today.getFullYear()
  let dueDate = dateWithDay(dueYear, dueMonth, Number(card.due_day || 1))
  let closingDate = card.current_invoice_closing_date?.slice(0, 10) || (card.closing_day
    ? dateWithDay(dueYear, dueMonth, Number(card.closing_day))
    : addDays(dueDate, -Number(card.closing_days_before_due ?? 7)))

  if (todayISO() > closingDate || card.current_invoice_closed) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
    dueDate = dateWithDay(dueYear, dueMonth, Number(card.due_day || 1))
    closingDate = card.closing_day
      ? dateWithDay(dueYear, dueMonth, Number(card.closing_day))
      : addDays(dueDate, -Number(card.closing_days_before_due ?? 7))
  }

  return { dueDate, closingDate }
}

export default function CartoesPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [cards, setCards] = useState<CreditCardAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [payModalCard, setPayModalCard] = useState<CreditCardAccount | null>(null)
  const [invoiceModalCard, setInvoiceModalCard] = useState<CreditCardAccount | null>(null)
  const [editing, setEditing] = useState<CreditCardAccount | null>(null)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payAccountId, setPayAccountId] = useState("")
  const [formName, setFormName] = useState("")
  const [formIssuer, setFormIssuer] = useState("")
  const [formLastFour, setFormLastFour] = useState("")
  const [formDueDay, setFormDueDay] = useState("7")
  const [formClosingDay, setFormClosingDay] = useState("")
  const [formClosingDaysBeforeDue, setFormClosingDaysBeforeDue] = useState("7")
  const [formCurrentClosingDate, setFormCurrentClosingDate] = useState("")
  const [formInvoiceClosed, setFormInvoiceClosed] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [accountsRes, cardsRes, transRes] = await Promise.all([
        (supabase.from("finance_accounts") as any)
          .select("id, name, institution")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (supabase.from("finance_credit_cards") as any)
          .select("*")
          .order("created_at", { ascending: true }),
        (supabase.from("transactions") as any)
          .select("id, description, category, amount, date, due_date, status, credit_card_id, payment_method, notes")
          .eq("payment_method", "Cartão de Crédito")
          .neq("status", "cancelled"),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      const cardsTableMissing = Boolean(cardsRes.error?.message?.match(/finance_credit_cards|does not exist|relation/i))
      if (cardsRes.error && !cardsTableMissing) throw new Error(cardsRes.error.message)
      if (transRes.error) throw new Error(transRes.error.message)
      setAccounts(accountsRes.data || [])
      if (!payAccountId && accountsRes.data?.[0]?.id) setPayAccountId(accountsRes.data[0].id)
      setCards((cardsTableMissing ? [] : cardsRes.data || []).map((card: any) => ({
        ...card,
        due_day: Number(card.due_day || 1),
        closing_day: card.closing_day === null ? null : Number(card.closing_day),
        closing_days_before_due: Number(card.closing_days_before_due ?? 7),
      })))
      setTransactions((transRes.data || []).map((item: any) => ({ ...item, amount: Number(item.amount || 0) })))
    } catch (error: any) {
      toast({ title: "Erro ao carregar cartões", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => {
    const active = cards.filter((card) => card.is_active !== false)
    const openInvoiceTotal = active.reduce((sum, card) => {
      const invoice = getCurrentInvoice(card)
      return sum + transactions
        .filter((item) => item.credit_card_id === card.id && item.status !== "reconciled" && (item.due_date || item.date)?.slice(0, 10) === invoice.dueDate)
        .reduce((subtotal, item) => subtotal + Number(item.amount || 0), 0)
    }, 0)
    return { activeCount: active.length, openInvoiceTotal }
  }, [cards, transactions])

  const getInvoiceItems = (card: CreditCardAccount) => {
    const invoice = getCurrentInvoice(card)
    return transactions
      .filter((item) => item.credit_card_id === card.id && (item.due_date || item.date)?.slice(0, 10) === invoice.dueDate)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
  }

  const getPendingInvoiceTotal = (items: Transaction[]) => {
    return items
      .filter((item) => item.status !== "reconciled")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  }

  const openNew = () => {
    setEditing(null)
    setFormName("")
    setFormIssuer("")
    setFormLastFour("")
    setFormDueDay("7")
    setFormClosingDay("")
    setFormClosingDaysBeforeDue("7")
    setFormCurrentClosingDate("")
    setFormInvoiceClosed(false)
    setModalOpen(true)
  }

  const openEdit = (card: CreditCardAccount) => {
    setEditing(card)
    setFormName(card.name || "")
    setFormIssuer(card.issuer || "")
    setFormLastFour(card.last_four || "")
    setFormDueDay(String(card.due_day || 7))
    setFormClosingDay(card.closing_day ? String(card.closing_day) : "")
    setFormClosingDaysBeforeDue(String(card.closing_days_before_due ?? 7))
    setFormCurrentClosingDate(card.current_invoice_closing_date?.slice(0, 10) || "")
    setFormInvoiceClosed(Boolean(card.current_invoice_closed))
    setModalOpen(true)
  }

  const saveCard = async (event: React.FormEvent) => {
    event.preventDefault()
    const dueDay = Math.max(1, Math.min(31, Number(formDueDay) || 1))
    const closingDay = formClosingDay ? Math.max(1, Math.min(31, Number(formClosingDay) || 1)) : null
    const closingDaysBeforeDue = Math.max(0, Math.min(28, Number(formClosingDaysBeforeDue) || 7))

    if (!formName.trim()) {
      toast({ title: "Informe o nome do cartão", type: "error" })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: formName.trim(),
        issuer: formIssuer.trim() || null,
        last_four: formLastFour.replace(/\D/g, "").slice(0, 4) || null,
        due_day: dueDay,
        closing_day: closingDay,
        closing_days_before_due: closingDaysBeforeDue,
        current_invoice_closed: formInvoiceClosed,
        current_invoice_closing_date: formInvoiceClosed && formCurrentClosingDate ? formCurrentClosingDate : null,
        is_active: true,
      }
      const result = editing
        ? await (supabase.from("finance_credit_cards") as any).update(payload).eq("id", editing.id)
        : await (supabase.from("finance_credit_cards") as any).insert(payload)
      if (result.error) throw result.error
      toast({ title: editing ? "Cartão atualizado" : "Cartão cadastrado", type: "success" })
      setModalOpen(false)
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao salvar cartão", description: error.message, type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const openPayInvoice = (card: CreditCardAccount) => {
    setPayModalCard(card)
    setPayAccountId((current) => current || accounts[0]?.id || "")
  }

  const payInvoice = async () => {
    if (!payModalCard) return
    if (!payAccountId) {
      toast({ title: "Selecione a conta de pagamento", type: "error" })
      return
    }

    const invoice = getCurrentInvoice(payModalCard)
    setPaying(true)
    try {
      const { error: transError } = await (supabase.from("transactions") as any)
        .update({
          account_id: payAccountId,
          date: todayISO(),
          status: "reconciled",
          reconciled_at: new Date().toISOString(),
        })
        .eq("credit_card_id", payModalCard.id)
        .eq("due_date", invoice.dueDate)
        .eq("status", "pending")
      if (transError) throw transError

      const { error: cardError } = await (supabase.from("finance_credit_cards") as any)
        .update({
          current_invoice_closed: false,
          current_invoice_closing_date: null,
        })
        .eq("id", payModalCard.id)
      if (cardError) throw cardError

      toast({ title: "Fatura paga", description: "A marcação de fatura fechada foi zerada para o próximo ciclo.", type: "success" })
      setPayModalCard(null)
      fetchData()
    } catch (error: any) {
      toast({ title: "Erro ao pagar fatura", description: error.message, type: "error" })
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Cartões de Crédito</h2>
          <p className="text-sm text-gray-500">Cadastre vencimento, fechamento e acompanhe a fatura prevista.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo cartão</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Cartões ativos" value={String(totals.activeCount)} icon={CreditCard} />
        <Metric title="Faturas abertas" value={formatBRL(totals.openInvoiceTotal)} icon={CalendarClock} />
        <Metric title="Regra padrão" value="Fechamento + vencimento" icon={CheckCircle2} compact />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Cartões cadastrados</h3>
            <p className="text-sm text-gray-500">{cards.length} cartão(ões) no financeiro</p>
          </div>
          <CreditCard className="h-5 w-5 text-royal-500" />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Carregando cartões...</div>
        ) : cards.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Nenhum cartão cadastrado ainda.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {cards.map((card) => {
              const invoice = getCurrentInvoice(card)
              const invoiceItems = getInvoiceItems(card)
              const invoiceTotal = getPendingInvoiceTotal(invoiceItems)
              return (
                <div key={card.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_150px_150px_150px_140px_auto] lg:items-center">
                  <div>
                    <p className="font-semibold text-navy-900">{card.name}{card.last_four ? ` • final ${card.last_four}` : ""}</p>
                    <p className="text-sm text-gray-500">{card.issuer || "Instituição não informada"}</p>
                  </div>
                  <Info label="Vencimento" value={`Dia ${card.due_day}`} />
                  <Info label="Fechamento" value={card.closing_day ? `Dia ${card.closing_day}` : `${card.closing_days_before_due ?? 7} dias antes`} />
                  <Info label="Próxima fatura" value={formatDate(invoice.dueDate)} />
                  <Info label="Lançamentos" value={`${invoiceItems.length} item(ns)`} />
                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase text-gray-400">Previsto</p>
                      <p className="font-bold text-red-600">{formatBRL(invoiceTotal)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInvoiceModalCard(card)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-royal-200 hover:bg-royal-50 hover:text-royal-600"
                      aria-label="Ver lançamentos da fatura"
                      title="Ver lançamentos"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(card)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-royal-200 hover:bg-royal-50 hover:text-royal-600"
                      aria-label="Editar cartão"
                      title="Editar cartão"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <Button size="sm" variant="outline" onClick={() => openPayInvoice(card)} disabled={invoiceTotal <= 0}>
                      Pagar fatura
                    </Button>
                  </div>
                  {card.current_invoice_closed && (
                    <div className="rounded-xl bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-700 lg:col-span-6">
                      Fatura atual marcada como fechada. Novas compras entram na próxima fatura.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
              <div>
                <h3 className="font-display text-lg font-bold text-navy-900 font-syne">{editing ? "Editar cartão" : "Novo cartão"}</h3>
                <p className="text-sm text-gray-500">Configure vencimento e fechamento da fatura.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveCard} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Nome do cartão" placeholder="Ex: Nubank PJ" value={formName} onChange={(event) => setFormName(event.target.value)} />
                <Input label="Instituição" placeholder="Ex: Nubank" value={formIssuer} onChange={(event) => setFormIssuer(event.target.value)} />
                <Input label="Final" inputMode="numeric" placeholder="1234" value={formLastFour} onChange={(event) => setFormLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))} />
                <Input label="Dia de vencimento" inputMode="numeric" value={formDueDay} onChange={(event) => setFormDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} />
                <Input label="Dia padrão de fechamento" inputMode="numeric" placeholder="Opcional" value={formClosingDay} onChange={(event) => setFormClosingDay(event.target.value.replace(/\D/g, "").slice(0, 2))} />
                <Input label="Dias antes do vencimento" inputMode="numeric" value={formClosingDaysBeforeDue} onChange={(event) => setFormClosingDaysBeforeDue(event.target.value.replace(/\D/g, "").slice(0, 2))} />
                <div className="sm:col-span-2">
                  <Input label="Fechamento manual da fatura atual" type="date" value={formCurrentClosingDate} onChange={(event) => setFormCurrentClosingDate(event.target.value)} />
                  <p className="mt-1 text-xs text-gray-400">Opcional. Vale só para a fatura atual; ao pagar a fatura, esse campo será zerado.</p>
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span>
                  <span className="block text-sm font-bold text-navy-900">Fatura atual já fechou</span>
                  <span className="block text-xs text-gray-500">Quando ligado, novas despesas entram na próxima fatura.</span>
                </span>
                <input
                  type="checkbox"
                  checked={formInvoiceClosed}
                  onChange={(event) => setFormInvoiceClosed(event.target.checked)}
                  className="h-5 w-5 accent-royal-500"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" fullWidth isLoading={saving}><Save className="mr-2 h-4 w-4" /> Salvar</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payModalCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
              <div>
                <h3 className="font-display text-lg font-bold text-navy-900 font-syne">Pagar fatura</h3>
                <p className="text-sm text-gray-500">{payModalCard.name}</p>
              </div>
              <button onClick={() => setPayModalCard(null)} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {(() => {
                const invoice = getCurrentInvoice(payModalCard)
                const total = transactions
                  .filter((item) => item.credit_card_id === payModalCard.id && item.status !== "reconciled" && (item.due_date || item.date)?.slice(0, 10) === invoice.dueDate)
                  .reduce((sum, item) => sum + Number(item.amount || 0), 0)
                return (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-400">Fatura</p>
                    <p className="mt-1 text-sm text-gray-600">Vencimento em {formatDate(invoice.dueDate)}</p>
                    <p className="mt-2 text-2xl font-bold text-red-600">{formatBRL(total)}</p>
                  </div>
                )
              })()}
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-navy-900">Conta usada para pagar</span>
                <select
                  value={payAccountId}
                  onChange={(event) => setPayAccountId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setPayModalCard(null)}>Cancelar</Button>
                <Button type="button" fullWidth isLoading={paying} onClick={payInvoice}>
                  <Wallet className="mr-2 h-4 w-4" /> Confirmar pagamento
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {invoiceModalCard && (() => {
        const invoice = getCurrentInvoice(invoiceModalCard)
        const items = getInvoiceItems(invoiceModalCard)
        const pendingItems = items.filter((item) => item.status !== "reconciled")
        const pendingTotal = getPendingInvoiceTotal(items)
        const paidTotal = items
          .filter((item) => item.status === "reconciled")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0)

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
                <div>
                  <h3 className="font-display text-lg font-bold text-navy-900 font-syne">Lançamentos da fatura</h3>
                  <p className="text-sm text-gray-500">
                    {invoiceModalCard.name}{invoiceModalCard.last_four ? ` • final ${invoiceModalCard.last_four}` : ""} · venc. {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <button onClick={() => setInvoiceModalCard(null)} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InvoiceSummary title="Total em aberto" value={formatBRL(pendingTotal)} tone="danger" />
                  <InvoiceSummary title="Lançamentos" value={`${items.length} item(ns)`} />
                  <InvoiceSummary title="Fechamento" value={formatDate(invoice.closingDate)} />
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-100">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                    <div>
                      <p className="font-semibold text-navy-900">Detalhe da fatura</p>
                      <p className="text-xs text-gray-500">
                        {pendingItems.length} pendente(s) · {formatBRL(paidTotal)} já conciliado
                      </p>
                    </div>
                    <ReceiptText className="h-5 w-5 text-royal-500" />
                  </div>

                  {items.length === 0 ? (
                    <div className="p-10 text-center text-sm text-gray-400">Nenhum lançamento nesta fatura.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[1fr_120px_120px_120px] md:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-navy-900">{item.description || "Lançamento sem descrição"}</p>
                            <p className="truncate text-sm text-gray-500">{item.category || item.notes || "Categoria não informada"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-400">Compra</p>
                            <p className="text-sm font-semibold text-navy-900">{formatDate(item.date)}</p>
                          </div>
                          <InvoiceStatus status={item.status} />
                          <p className="text-right font-bold text-red-600 md:text-left">{formatBRL(Number(item.amount || 0))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/80 p-5 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => setInvoiceModalCard(null)}>Fechar</Button>
                <Button
                  type="button"
                  onClick={() => {
                    setInvoiceModalCard(null)
                    openPayInvoice(invoiceModalCard)
                  }}
                  disabled={pendingTotal <= 0}
                >
                  <Wallet className="mr-2 h-4 w-4" /> Pagar fatura
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Metric({ title, value, icon: Icon, compact }: { title: string; value: string; icon: any; compact?: boolean }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-white"><Icon className="h-5 w-5" /></div>
      </div>
      <p className={cn("font-bold leading-tight text-navy-900", compact ? "text-xl" : "text-2xl")}>{value}</p>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
      <p className="font-semibold text-navy-900">{value}</p>
    </div>
  )
}

function InvoiceSummary({ title, value, tone }: { title: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
      <p className={cn("mt-2 text-xl font-bold text-navy-900", tone === "danger" && "text-red-600")}>{value}</p>
    </div>
  )
}

function InvoiceStatus({ status }: { status?: string | null }) {
  const reconciled = status === "reconciled"
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-400">Status</p>
      <span className={cn(
        "mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold",
        reconciled ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700",
      )}>
        {reconciled ? "Conciliado" : "Pendente"}
      </span>
    </div>
  )
}
