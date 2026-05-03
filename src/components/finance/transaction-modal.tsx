"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, CreditCard, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { addMonthsISO, formatBRL, formatDate, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"

const METHODS = ["Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito", "Transferência"]

type MovementType = "income" | "expense"
type RepeatMode = "single" | "installments" | "recurring"

type ChartAccount = {
  id: string
  code: string
  name: string
  cash_flow_type: "income" | "expense" | "none"
  financial_type: string
  statement_section: string
  sort_order: number
  affects_cash?: boolean
  affects_dre?: boolean
  parent_code?: string | null
  level?: number | null
}

type FinanceAccount = {
  id: string
  name: string
  institution?: string | null
}

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
}

type ExistingTransaction = {
  id: string
  amount: number
  due_date?: string | null
  date: string
  status?: string | null
  credit_card_id?: string | null
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  const cents = Number(digits || "0")
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, "") || "0") / 100
}

function formatDreType(type: string) {
  const labels: Record<string, string> = {
    revenue: "Receita bruta",
    deduction: "Dedução da receita",
    cogs: "CMV",
    operating_expense: "Despesa operacional",
    financial_expense: "Despesa financeira",
    financial_revenue: "Receita financeira",
    tax: "Impostos",
    inventory_asset: "Estoque / caixa",
    owner_equity: "Sócios",
    transfer: "Transferência",
    adjustment: "Fora do DRE",
  }
  return labels[type] || type
}

function isDreAccountForMovement(account: ChartAccount, type: MovementType) {
  if (account.level === 1 || account.cash_flow_type !== type) return false
  if (account.affects_dre === false || account.statement_section !== "dre") return false
  const incomeTypes = ["revenue", "financial_revenue"]
  const expenseTypes = ["deduction", "cogs", "operating_expense", "financial_expense", "tax"]
  return type === "income" ? incomeTypes.includes(account.financial_type) : expenseTypes.includes(account.financial_type)
}

function isSelectableAccountForMovement(account: ChartAccount, type: MovementType) {
  if (isDreAccountForMovement(account, type)) return true
  if (account.level === 1 || account.cash_flow_type !== type) return false
  if (
    account.financial_type === "owner_equity"
    && account.affects_cash !== false
    && account.affects_dre === false
  ) return true
  return type === "income"
    && account.financial_type === "adjustment"
    && account.affects_dre === false
    && account.affects_cash !== false
}

function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(Math.max(1, day), new Date(year, monthIndex + 1, 0).getDate())
}

function dateWithDay(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(clampDay(year, monthIndex, day)).padStart(2, "0")}`
}

function addDaysISO(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function resolveCardInvoice(card: CreditCardAccount, purchaseDate: string, forceNextInvoice = false) {
  const base = new Date(`${purchaseDate}T00:00:00`)
  let dueMonth = base.getMonth()
  let dueYear = base.getFullYear()
  let dueDate = dateWithDay(dueYear, dueMonth, Number(card.due_day || 1))
  let closingDate = card.current_invoice_closing_date?.slice(0, 10) || (card.closing_day
    ? dateWithDay(dueYear, dueMonth, Number(card.closing_day))
    : addDaysISO(dueDate, -Number(card.closing_days_before_due ?? 7)))

  if (purchaseDate > closingDate || card.current_invoice_closed || forceNextInvoice) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
    dueDate = dateWithDay(dueYear, dueMonth, Number(card.due_day || 1))
    closingDate = card.closing_day
      ? dateWithDay(dueYear, dueMonth, Number(card.closing_day))
      : addDaysISO(dueDate, -Number(card.closing_days_before_due ?? 7))
  }

  return { dueDate, closingDate }
}

export function FinanceTransactionModal({
  open,
  defaultType = "expense",
  onClose,
  onSaved,
}: {
  open: boolean
  defaultType?: MovementType
  onClose: () => void
  onSaved?: () => void
}) {
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [creditCards, setCreditCards] = useState<CreditCardAccount[]>([])
  const [existingTransactions, setExistingTransactions] = useState<ExistingTransaction[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formType, setFormType] = useState<MovementType>(defaultType)
  const [formChartAccountId, setFormChartAccountId] = useState("")
  const [formAccountId, setFormAccountId] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formAmount, setFormAmount] = useState("R$ 0,00")
  const [formDate, setFormDate] = useState(todayISO())
  const [formDueDate, setFormDueDate] = useState("")
  const [formPayment, setFormPayment] = useState(defaultType === "expense" ? "Pix" : "Pix")
  const [formCreditCardId, setFormCreditCardId] = useState("")
  const [forceNextInvoice, setForceNextInvoice] = useState(false)
  const [formNotes, setFormNotes] = useState("")
  const [categoryQuery, setCategoryQuery] = useState("")
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("single")
  const [installmentCount, setInstallmentCount] = useState("2")
  const [recurringCount, setRecurringCount] = useState("3")
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setFormType(defaultType)
    setFormDesc("")
    setFormAmount("R$ 0,00")
    setFormDate(todayISO())
    setFormDueDate("")
    setFormPayment("Pix")
    setFormCreditCardId("")
    setForceNextInvoice(false)
    setFormNotes("")
    setCategoryQuery("")
    setRepeatMode("single")
    setInstallmentCount("2")
    setRecurringCount("3")
    fetchOptions(defaultType)
  }, [defaultType, open])

  const fetchOptions = async (typeForFallback: MovementType) => {
    setLoadingOptions(true)
    try {
      const [accountsRes, chartAccountsRes, cardsRes, transactionsRes] = await Promise.all([
        (supabase.from("finance_accounts") as any).select("id, name, institution").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("finance_chart_accounts") as any).select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        (supabase.from("finance_credit_cards") as any).select("*").eq("is_active", true).order("created_at", { ascending: true }),
        (supabase.from("transactions") as any).select("id, amount, date, due_date, status, credit_card_id").neq("status", "cancelled"),
      ])
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      const cardsTableMissing = Boolean(cardsRes.error?.message?.match(/finance_credit_cards|does not exist|relation/i))
      if (cardsRes.error && !cardsTableMissing) throw new Error(cardsRes.error.message)
      if (transactionsRes.error) throw new Error(transactionsRes.error.message)

      const accounts = accountsRes.data || []
      const charts = chartAccountsRes.data || []
      setFinanceAccounts(accounts)
      setChartAccounts(charts)
      setCreditCards((cardsTableMissing ? [] : cardsRes.data || []).map((card: any) => ({
        ...card,
        due_day: Number(card.due_day || 1),
        closing_day: card.closing_day === null ? null : Number(card.closing_day),
        closing_days_before_due: Number(card.closing_days_before_due ?? 7),
      })))
      setExistingTransactions((transactionsRes.data || []).map((item: any) => ({ ...item, amount: Number(item.amount || 0) })))
      const fallback = findFallbackChartAccount(charts, typeForFallback)
      setFormChartAccountId(fallback?.id || "")
    } catch (error: any) {
      toast({ title: "Erro ao carregar formulário", description: error.message, type: "error" })
    } finally {
      setLoadingOptions(false)
    }
  }

  const findFallbackChartAccount = (accounts: ChartAccount[], type: MovementType) => {
    return accounts.find((account) => isSelectableAccountForMovement(account, type) && account.name === (type === "income" ? "Receitas diversas" : "Outras despesas operacionais"))
      || accounts.find((account) => isSelectableAccountForMovement(account, type))
      || null
  }

  const selectableChartAccounts = useMemo(() => {
    return chartAccounts.filter((account) => isSelectableAccountForMovement(account, formType))
  }, [chartAccounts, formType])

  const selectedCreditCard = useMemo(() => {
    return creditCards.find((card) => card.id === formCreditCardId) || null
  }, [creditCards, formCreditCardId])

  const selectedCardInvoice = useMemo(() => {
    if (!selectedCreditCard || !formDate) return null
    return resolveCardInvoice(selectedCreditCard, formDate, forceNextInvoice)
  }, [forceNextInvoice, formDate, selectedCreditCard])

  const selectedCardInvoiceTotal = useMemo(() => {
    if (!selectedCardInvoice || !selectedCreditCard) return 0
    const currentAmount = parseCurrencyInput(formAmount)
    const existing = existingTransactions
      .filter((item) => item.credit_card_id === selectedCreditCard.id && (item.due_date || item.date)?.slice(0, 10) === selectedCardInvoice.dueDate && item.status !== "cancelled")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return existing + (Number.isFinite(currentAmount) ? currentAmount : 0)
  }, [existingTransactions, formAmount, selectedCardInvoice, selectedCreditCard])

  const changeType = (nextType: MovementType) => {
    setFormType(nextType)
    const fallback = findFallbackChartAccount(chartAccounts, nextType)
    setFormChartAccountId(fallback?.id || "")
    setCategoryQuery("")
    if (nextType === "income") {
      setRepeatMode("single")
      setFormCreditCardId("")
      setForceNextInvoice(false)
    }
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = parseCurrencyInput(formAmount)
    const selectedAccount = chartAccounts.find((account) => account.id === formChartAccountId)
    if (!selectedAccount || !formDesc.trim() || amount <= 0 || !formDate) {
      toast({ title: "Preencha categoria, descrição, valor e data", type: "error" })
      return
    }
    const isCreditCardExpense = formType === "expense" && formPayment === "Cartão de Crédito"
    if (isCreditCardExpense && !selectedCreditCard) {
      toast({ title: "Selecione o cartão de crédito", type: "error" })
      return
    }

    setIsSubmitting(true)
    try {
      const isMultiExpense = formType === "expense" && repeatMode !== "single"
      const totalRepeats = repeatMode === "installments"
        ? Math.max(2, Math.min(60, Number(installmentCount) || 2))
        : repeatMode === "recurring"
          ? Math.max(2, Math.min(120, Number(recurringCount) || 2))
          : 1
      const cardInvoice = selectedCreditCard ? resolveCardInvoice(selectedCreditCard, formDate, forceNextInvoice) : null
      const baseDueDate = cardInvoice?.dueDate || formDueDate || formDate
      const nextStatus = formAccountId && !isMultiExpense && !isCreditCardExpense ? "reconciled" : "pending"
      const basePayload = {
        type: formType,
        account_id: isMultiExpense || isCreditCardExpense ? null : formAccountId || null,
        chart_account_id: selectedAccount.id,
        credit_card_id: selectedCreditCard?.id || null,
        category: selectedAccount.name,
        description: formDesc.trim(),
        date: formDate,
        payment_method: formPayment,
        status: nextStatus,
        reconciled_at: formAccountId && !isMultiExpense && !isCreditCardExpense ? new Date().toISOString() : null,
      }

      let error: any = null
      const syncIds: string[] = []
      if (isMultiExpense) {
        const installmentAmount = repeatMode === "installments" ? Math.round((amount / totalRepeats) * 100) / 100 : amount
        const installmentRemainder = repeatMode === "installments" ? Math.round((amount - installmentAmount * (totalRepeats - 1)) * 100) / 100 : amount
        const rows = Array.from({ length: totalRepeats }, (_, index) => {
          const dueDate = addMonthsISO(baseDueDate, index) || baseDueDate
          const suffix = `${index + 1}/${totalRepeats}`
          const kindLabel = repeatMode === "installments" ? "Parcela" : "Recorrência"
          return {
            ...basePayload,
            amount: repeatMode === "installments" && index === totalRepeats - 1 ? installmentRemainder : installmentAmount,
            date: dueDate,
            due_date: dueDate,
            description: `${formDesc.trim()} (${suffix})`,
            notes: [formNotes.trim(), `${kindLabel}: ${suffix}`].filter(Boolean).join(" · ") || null,
          }
        })
        const result = await (supabase.from("transactions") as any).insert(rows).select("id")
        error = result.error
        if (!error) syncIds.push(...(result.data || []).map((row: { id: string }) => String(row.id)))
      } else {
        const result = await (supabase.from("transactions") as any).insert({
          ...basePayload,
          amount,
          due_date: baseDueDate || null,
          notes: formNotes.trim() || null,
        }).select("id")
        error = result.error
        if (!error && result.data?.[0]?.id) syncIds.push(String(result.data[0].id))
      }

      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      for (const id of syncIds) {
        await requestSyncTransactionMovement(id, { createdBy: user?.id ?? null })
      }
      toast({ title: repeatMode === "single" ? "Lançamento registrado" : "Lançamentos gerados", type: "success" })
      onClose()
      onSaved?.()
    } catch (error: any) {
      toast({ title: "Erro ao salvar lançamento", description: error.message, type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
          <div>
            <h3 className="font-display text-lg font-bold text-navy-900 font-syne">Novo lançamento</h3>
            <p className="text-sm text-gray-500">Registre despesas fixas, receitas manuais e ajustes de caixa.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => changeType("income")}
              className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold", formType === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500")}
            >
              <ArrowUpIcon className="h-4 w-4" /> Entrada
            </button>
            <button
              type="button"
              onClick={() => changeType("expense")}
              className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold", formType === "expense" ? "bg-white text-red-600 shadow-sm" : "text-gray-500")}
            >
              <ArrowDownIcon className="h-4 w-4" /> Saída
            </button>
          </div>

          {loadingOptions ? (
            <div className="rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">Carregando categorias...</div>
          ) : (
            <CategoryPicker
              accounts={selectableChartAccounts}
              selectedId={formChartAccountId}
              query={categoryQuery}
              onQueryChange={setCategoryQuery}
              onSelect={(account) => setFormChartAccountId(account.id)}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Descrição" placeholder={formType === "income" ? "Ex: Receita manual" : "Ex: Aluguel da loja"} value={formDesc} onChange={(event) => setFormDesc(event.target.value)} />
            <Input label="Valor" inputMode="numeric" value={formAmount} onChange={(event) => setFormAmount(formatCurrencyInput(event.target.value))} />
            <Input label="Data" type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
            <Input label={formType === "income" ? "Previsão" : "Vencimento"} type="date" value={formDueDate} onChange={(event) => setFormDueDate(event.target.value)} />

            {formType === "expense" && (
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:col-span-2">
                <div>
                  <p className="text-xs font-semibold text-navy-900">Repetição</p>
                  <p className="text-xs text-gray-500">Use para despesas parceladas ou recorrentes. Elas entram pendentes em Contas a Pagar.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { key: "single", label: "Única", hint: "Uma conta" },
                    { key: "installments", label: "Parcelada", hint: "Divide o valor total" },
                    { key: "recurring", label: "Recorrente", hint: "Repete o mesmo valor" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setRepeatMode(item.key as RepeatMode)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition-all",
                        repeatMode === item.key ? "border-royal-500 bg-white ring-2 ring-royal-500/10" : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                      )}
                    >
                      <span className="block text-sm font-bold text-navy-900">{item.label}</span>
                      <span className="block text-xs text-gray-500">{item.hint}</span>
                    </button>
                  ))}
                </div>
                {repeatMode === "installments" && (
                  <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
                    <Input label="Parcelas" inputMode="numeric" value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value.replace(/\D/g, "").slice(0, 2) || "2")} />
                    <p className="pb-3 text-xs text-gray-500">O valor total será dividido em {Math.max(2, Number(installmentCount) || 2)} parcelas mensais.</p>
                  </div>
                )}
                {repeatMode === "recurring" && (
                  <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
                    <Input label="Meses" inputMode="numeric" value={recurringCount} onChange={(event) => setRecurringCount(event.target.value.replace(/\D/g, "").slice(0, 3) || "2")} />
                    <p className="pb-3 text-xs text-gray-500">O mesmo valor será repetido mensalmente por {Math.max(2, Number(recurringCount) || 2)} meses.</p>
                  </div>
                )}
              </div>
            )}

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-navy-900">Forma de pagamento</span>
              <select
                value={formPayment}
                onChange={(event) => {
                  const method = event.target.value
                  setFormPayment(method)
                  if (method !== "Cartão de Crédito") {
                    setFormCreditCardId("")
                    setForceNextInvoice(false)
                  }
                }}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
              >
                {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>

            {formType === "expense" && formPayment === "Cartão de Crédito" && (
              <div className="space-y-3 rounded-xl border border-royal-100 bg-royal-50/40 p-3 sm:col-span-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-royal-600 shadow-sm">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy-900">Despesa no cartão de crédito</p>
                    <p className="text-xs text-gray-500">O vencimento será calculado pela fatura do cartão, não pela data da compra.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-navy-900">Cartão</span>
                    <select
                      value={formCreditCardId}
                      onChange={(event) => setFormCreditCardId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                    >
                      <option value="">Selecione o cartão</option>
                      {creditCards.map((card) => (
                        <option key={card.id} value={card.id}>{card.name}{card.last_four ? ` • final ${card.last_four}` : ""}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2">
                    <span>
                      <span className="block text-xs font-semibold text-navy-900">Lançar na próxima fatura</span>
                      <span className="block text-xs text-gray-500">Use quando a fatura já fechou manualmente.</span>
                    </span>
                    <input type="checkbox" checked={forceNextInvoice} onChange={(event) => setForceNextInvoice(event.target.checked)} className="h-5 w-5 accent-royal-500" />
                  </label>
                </div>
                {selectedCreditCard && selectedCardInvoice && (
                  <div className="grid gap-2 rounded-xl bg-white p-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-400">Fatura</p>
                      <p className="font-bold text-navy-900">Venc. {formatDate(selectedCardInvoice.dueDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-400">Fechamento</p>
                      <p className="font-bold text-navy-900">{formatDate(selectedCardInvoice.closingDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-400">Previsto na fatura</p>
                      <p className="font-bold text-red-600">{formatBRL(selectedCardInvoiceTotal)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-navy-900">Conta</span>
              <select
                value={formAccountId}
                onChange={(event) => setFormAccountId(event.target.value)}
                disabled={formType === "expense" && formPayment === "Cartão de Crédito"}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
              >
                <option value="">Não conciliar agora</option>
                {financeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>
                ))}
              </select>
              <span className="block text-xs text-gray-400">
                {formType === "expense" && formPayment === "Cartão de Crédito"
                  ? "Cartão entra como conta a pagar na data da fatura."
                  : "Com conta selecionada, o lançamento entra como conciliado."}
              </span>
            </label>
            <Input label="Observações" value={formNotes} onChange={(event) => setFormNotes(event.target.value)} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
            <Button type="submit" fullWidth isLoading={isSubmitting}>Salvar lançamento</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CategoryPicker({
  accounts,
  selectedId,
  query,
  onQueryChange,
  onSelect,
}: {
  accounts: ChartAccount[]
  selectedId: string
  query: string
  onQueryChange: (value: string) => void
  onSelect: (account: ChartAccount) => void
}) {
  const selected = accounts.find((account) => account.id === selectedId)
  const normalizedQuery = query.toLowerCase().trim()
  const filteredAccounts = accounts.filter((account) => {
    if (!normalizedQuery) return true
    return [account.code, account.name, formatDreType(account.financial_type)]
      .some((value) => value.toLowerCase().includes(normalizedQuery))
  })

  const priority: Record<string, number> = {
    operating_expense: 1,
    inventory_asset: 2,
    cogs: 3,
    tax: 4,
    financial_expense: 5,
    deduction: 6,
    revenue: 1,
    financial_revenue: 2,
    owner_equity: 7,
  }

  const groups = filteredAccounts
    .slice()
    .sort((a, b) => (priority[a.financial_type] || 99) - (priority[b.financial_type] || 99) || Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .reduce<Record<string, ChartAccount[]>>((acc, account) => {
      const label = formatDreType(account.financial_type)
      acc[label] = acc[label] || []
      acc[label].push(account)
      return acc
    }, {})

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-navy-900">Categoria</span>
        {selected && (
          <span className="truncate text-xs text-gray-400">
            Selecionado: <strong className="font-semibold text-navy-900">{selected.name}</strong>
          </span>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar categoria: internet, estoque, imposto, cartão..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="pl-10"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/70 p-2">
        {Object.keys(groups).length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">Nenhuma categoria encontrada.</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groups).map(([group, groupAccounts]) => (
              <div key={group}>
                <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{group}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {groupAccounts.map((account) => {
                    const isSelected = account.id === selectedId
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => onSelect(account)}
                        className={cn(
                          "rounded-xl border bg-white px-3 py-2 text-left transition-all hover:border-royal-300 hover:shadow-sm",
                          isSelected ? "border-royal-500 ring-2 ring-royal-500/10" : "border-gray-100"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold leading-snug text-navy-900">{account.name}</span>
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">{account.code}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{formatDreType(account.financial_type)}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Use o campo acima para achar a categoria. O plano completo pode ser editado em Financeiro &gt; Plano de DRE.
      </p>
    </div>
  )
}
