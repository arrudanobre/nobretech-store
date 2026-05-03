"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, Clock3, CreditCard, FileText, Pencil, Plus, ReceiptText, Search, Trash2, Wallet, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { addMonthsISO, currentMonthKey, formatBRL, formatDate, formatPaymentMethod, monthRangeISO, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"

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
  affects_cash?: boolean
  affects_dre?: boolean
  parent_code?: string | null
  level?: number | null
}

type FinanceAccount = {
  id: string
  name: string
  institution?: string | null
  is_active?: boolean
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
  is_active?: boolean | null
}

type UnifiedTransaction = {
  id: string
  account_id?: string | null
  account_name?: string | null
  chart_account_id?: string | null
  credit_card_id?: string | null
  type: "income" | "expense"
  category: string
  description: string
  amount: number
  date: string
  operational_date?: string | null
  operational_label?: string | null
  financial_date?: string | null
  due_date?: string | null
  payment_method: string
  status: MovementStatus
  source: "sale" | "manual"
  source_type?: string | null
  source_id?: string | null
  notes?: string | null
}

type FilterScope = "all" | "sales" | "manual" | "stock" | "owners"
type RepeatMode = "single" | "installments" | "recurring"

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

function movementDate(item: Pick<UnifiedTransaction, "date" | "due_date" | "status">) {
  return item.status === "reconciled" ? item.date : item.due_date || item.date
}

function financialDate(item: Pick<UnifiedTransaction, "date" | "due_date" | "status" | "financial_date">) {
  return item.financial_date || movementDate(item)
}

function operationalDate(item: Pick<UnifiedTransaction, "operational_date" | "date">) {
  return item.operational_date || item.date
}

function isLinkedOrigin(item: Pick<UnifiedTransaction, "source" | "source_type">) {
  return item.source === "sale" || item.source_type === "inventory_purchase"
}

function dateOnly(value?: string | null) {
  return String(value || "").slice(0, 10)
}

function isInMonth(date: string, start: string, end: string) {
  const dateOnly = date.slice(0, 10)
  return dateOnly >= start && dateOnly <= end
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

function isDreAccountForMovement(account: ChartAccount, type: "income" | "expense") {
  if (account.level === 1 || account.cash_flow_type !== type) return false
  if (account.affects_dre === false || account.statement_section !== "dre") return false
  const incomeTypes = ["revenue", "financial_revenue"]
  const expenseTypes = ["deduction", "cogs", "operating_expense", "financial_expense", "tax"]
  return type === "income" ? incomeTypes.includes(account.financial_type) : expenseTypes.includes(account.financial_type)
}

function isSelectableAccountForMovement(account: ChartAccount, type: "income" | "expense") {
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

export default function TransacoesPage() {
  const [data, setData] = useState<UnifiedTransaction[]>([])
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([])
  const [creditCards, setCreditCards] = useState<CreditCardAccount[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState(currentMonthKey())
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all")
  const [filterStatus, setFilterStatus] = useState<"all" | MovementStatus>("all")
  const [filterScope, setFilterScope] = useState<FilterScope>("all")
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
  const [formDate, setFormDate] = useState(todayISO())
  const [formDueDate, setFormDueDate] = useState("")
  const [formPayment, setFormPayment] = useState("Pix")
  const [formCreditCardId, setFormCreditCardId] = useState("")
  const [forceNextInvoice, setForceNextInvoice] = useState(false)
  const [formNotes, setFormNotes] = useState("")
  const [categoryQuery, setCategoryQuery] = useState("")
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("single")
  const [installmentCount, setInstallmentCount] = useState("2")
  const [recurringCount, setRecurringCount] = useState("3")
  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [filterMonth])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { start, end, endOfDay } = monthRangeISO(filterMonth)

      const [accountsRes, creditCardsRes, chartAccountsRes, salesRes, transRes] = await Promise.all([
        (supabase.from("finance_accounts") as any)
          .select("id, name, institution, is_active")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (supabase.from("finance_credit_cards") as any)
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        (supabase.from("finance_chart_accounts") as any)
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        (supabase.from("sales") as any)
          .select("id, sale_date, payment_due_date, sale_status, sale_price, net_amount, payment_method, inventory:inventory_id(catalog:catalog_id(model))")
          .neq("sale_status", "cancelled")
          .or(`and(sale_date.gte.${start},sale_date.lte.${endOfDay}),and(payment_due_date.gte.${start},payment_due_date.lte.${end})`)
          .order("sale_date", { ascending: false }),
        (supabase.from("transactions") as any)
          .select("*")
          .or(`and(date.gte.${start},date.lte.${end}),and(due_date.gte.${start},due_date.lte.${end})`)
          .order("date", { ascending: false }),
      ])

      if (accountsRes.error) throw new Error(accountsRes.error.message)
      const creditCardsTableMissing = Boolean(creditCardsRes.error?.message?.match(/finance_credit_cards|does not exist|relation/i))
      if (creditCardsRes.error && !creditCardsTableMissing) throw new Error(creditCardsRes.error.message)
      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)
      if (transRes.error) throw new Error(transRes.error.message)

      setFinanceAccounts(accountsRes.data || [])
      setCreditCards((creditCardsTableMissing ? [] : creditCardsRes.data || []).map((card: any) => ({
        ...card,
        due_day: Number(card.due_day || 1),
        closing_day: card.closing_day === null ? null : Number(card.closing_day),
        closing_days_before_due: Number(card.closing_days_before_due ?? 7),
      })))
      const accountNameById = new Map((accountsRes.data || []).map((account: FinanceAccount) => [
        account.id,
        account.institution ? `${account.name} · ${account.institution}` : account.name,
      ]))
      const chartAccountsData = chartAccountsRes.data || []
      setChartAccounts(chartAccountsData)
      let transactions = transRes.data || []
      const operationalPurchasesRes = await (supabase.from("inventory_purchases") as any)
        .select("id, purchase_date, transaction_id")
        .gte("purchase_date", start)
        .lte("purchase_date", end)
      if (operationalPurchasesRes.error) throw new Error(operationalPurchasesRes.error.message)
      const operationalPurchases = operationalPurchasesRes.data || []
      const transactionIdsFromOperationalPurchases = operationalPurchases
        .map((purchase: any) => purchase.transaction_id)
        .filter(Boolean)
        .map(String)
      if (transactionIdsFromOperationalPurchases.length > 0) {
        const existingTransactionIds = new Set(transactions.map((transaction: any) => String(transaction.id)))
        const missingTransactionIds = transactionIdsFromOperationalPurchases.filter((id: string) => !existingTransactionIds.has(id))
        if (missingTransactionIds.length > 0) {
          const linkedPurchaseTransactionsRes = await (supabase.from("transactions") as any)
            .select("*")
            .in("id", missingTransactionIds)
          if (linkedPurchaseTransactionsRes.error) throw new Error(linkedPurchaseTransactionsRes.error.message)
          transactions = [...transactions, ...(linkedPurchaseTransactionsRes.data || [])]
        }
      }
      const salesData = [...(salesRes.data || [])]
      const salesById = new Map(salesData.map((sale: any) => [String(sale.id), sale]))
      const saleIdsFromFinancialMonth = transactions
        .filter((t: any) => t.source_type === "sale" && t.source_id)
        .map((t: any) => String(t.source_id))
        .filter((id: string) => !salesById.has(id))
      if (saleIdsFromFinancialMonth.length > 0) {
        const linkedSalesRes = await (supabase.from("sales") as any)
          .select("id, sale_date, payment_due_date, sale_status, sale_price, net_amount, payment_method, inventory:inventory_id(catalog:catalog_id(model))")
          .neq("sale_status", "cancelled")
          .in("id", saleIdsFromFinancialMonth)
        if (linkedSalesRes.error) throw new Error(linkedSalesRes.error.message)
        for (const sale of linkedSalesRes.data || []) {
          if (!salesById.has(String(sale.id))) {
            salesById.set(String(sale.id), sale)
            salesData.push(sale)
          }
        }
      }

      const saleIds = salesData.map((sale: any) => String(sale.id))
      let saleTransactions = transactions.filter((t: any) => t.source_type === "sale" && t.source_id)
      if (saleIds.length > 0) {
        const saleTransactionsRes = await (supabase.from("transactions") as any)
          .select("*")
          .eq("source_type", "sale")
          .in("source_id", saleIds)
        if (saleTransactionsRes.error) throw new Error(saleTransactionsRes.error.message)
        const saleTxById = new Map<string, any>()
        for (const tx of [...saleTransactions, ...(saleTransactionsRes.data || [])]) {
          saleTxById.set(String(tx.id), tx)
        }
        saleTransactions = Array.from(saleTxById.values())
      }

      const purchaseIds = transactions
        .filter((t: any) => t.source_type === "inventory_purchase" && t.source_id)
        .map((t: any) => String(t.source_id))
      const purchaseDateById = new Map<string, string>()
      for (const purchase of operationalPurchases) {
        purchaseDateById.set(String(purchase.id), purchase.purchase_date)
      }
      if (purchaseIds.length > 0) {
        const purchasesRes = await (supabase.from("inventory_purchases") as any)
          .select("id, purchase_date")
          .in("id", purchaseIds)
        if (purchasesRes.error) throw new Error(purchasesRes.error.message)
        for (const purchase of purchasesRes.data || []) {
          purchaseDateById.set(String(purchase.id), purchase.purchase_date)
        }
      }
      const saleTransactionById = new Map<string, any>(
        saleTransactions
          .filter((t: any) => t.source_id)
          .filter((t: any) => t.status !== "cancelled")
          .sort((a: any, b: any) => String(a.date || "").localeCompare(String(b.date || "")))
          .map((t: any) => [String(t.source_id), t])
      )

      const manual: UnifiedTransaction[] = transactions
        .filter((t: any) => t.source_type !== "sale")
        .map((t: any) => ({
          id: t.id,
          account_id: t.account_id,
          account_name: t.account_id ? String(accountNameById.get(t.account_id) || "Conta não encontrada") : null,
          chart_account_id: t.chart_account_id,
          credit_card_id: t.credit_card_id,
          type: t.type,
          category: t.category,
          description: t.description || t.category,
          amount: Number(t.amount),
          date: t.date,
          operational_date: t.source_type === "inventory_purchase" && t.source_id ? purchaseDateById.get(String(t.source_id)) || t.date : null,
          operational_label: t.source_type === "inventory_purchase" ? "Data de aquisição" : null,
          financial_date: t.date,
          due_date: t.due_date,
          payment_method: t.payment_method || "-",
          status: t.status || "pending",
          source: "manual",
          source_type: t.source_type || null,
          source_id: t.source_id || null,
          notes: t.notes,
        }))

      const sales: UnifiedTransaction[] = salesData.map((s: any) => {
        const modelName = s.inventory?.catalog?.model || "Produto"
        const saleTransaction = saleTransactionById.get(String(s.id))
        const status = saleTransaction?.status === "reconciled" ? "reconciled" : "pending"
        return {
          id: s.id,
          account_id: saleTransaction?.account_id || null,
          account_name: saleTransaction?.account_id ? String(accountNameById.get(saleTransaction.account_id) || "Conta não encontrada") : null,
          type: "income",
          category: "Venda",
          description: `Venda · ${modelName}`,
          amount: Number(s.net_amount ?? s.sale_price ?? 0),
          date: saleTransaction?.date || s.sale_date,
          operational_date: s.sale_date,
          operational_label: "Data da venda",
          financial_date: saleTransaction?.date || null,
          due_date: s.payment_due_date || null,
          payment_method: s.payment_method || "Não informado",
          status,
          source: "sale",
          source_type: "sale",
          source_id: s.id,
        }
      })

      setData(
        [...manual, ...sales]
          .filter((item) => isInMonth(financialDate(item), start, end) || (isLinkedOrigin(item) && isInMonth(operationalDate(item), start, end)))
          .sort((a, b) => new Date(financialDate(b)).getTime() - new Date(financialDate(a)).getTime())
      )
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
    return chartAccounts.filter((account) => isSelectableAccountForMovement(account, formType))
  }, [chartAccounts, formType])

  const findFallbackChartAccount = (type: "income" | "expense", category: string) => {
    return chartAccounts.find((account) => isSelectableAccountForMovement(account, type) && account.name === category)
      || chartAccounts.find((account) => isSelectableAccountForMovement(account, type) && account.name === (type === "income" ? "Receitas diversas" : "Outras despesas operacionais"))
      || chartAccounts.find((account) => isSelectableAccountForMovement(account, type))
      || null
  }

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
    const existing = data
      .filter((item) => item.source === "manual" && item.credit_card_id === selectedCreditCard.id && (item.due_date || item.date)?.slice(0, 10) === selectedCardInvoice.dueDate && item.status !== "cancelled")
      .filter((item) => item.id !== editingItem?.id)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return existing + (Number.isFinite(currentAmount) ? currentAmount : 0)
  }, [data, editingItem?.id, formAmount, selectedCardInvoice, selectedCreditCard])

  const openNewTransaction = () => {
    setEditingItem(null)
    setFormType("expense")
    const account = findFallbackChartAccount("expense", "Outras despesas operacionais")
    setFormChartAccountId(account?.id || "")
    setFormAccountId("")
    setFormCategory(account?.name || SAIDAS_CATEGORIES[0])
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
    setFormCreditCardId(item.credit_card_id || "")
    setForceNextInvoice(false)
    setFormNotes(item.notes || "")
    setCategoryQuery("")
    setRepeatMode("single")
    setInstallmentCount("2")
    setRecurringCount("3")
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
    const isCreditCardExpense = formType === "expense" && formPayment === "Cartão de Crédito"
    const creditCard = isCreditCardExpense ? selectedCreditCard : null
    if (isCreditCardExpense && !creditCard) {
      toast({ title: "Selecione o cartão de crédito", description: "Assim o sistema calcula a fatura e o vencimento correto.", type: "error" })
      return
    }

    setIsSubmitting(true)
    try {
      const isMultiExpense = !editingItem && formType === "expense" && repeatMode !== "single"
      const totalRepeats = repeatMode === "installments"
        ? Math.max(2, Math.min(60, Number(installmentCount) || 2))
        : repeatMode === "recurring"
          ? Math.max(2, Math.min(120, Number(recurringCount) || 2))
          : 1
      const cardInvoice = creditCard ? resolveCardInvoice(creditCard, formDate, forceNextInvoice) : null
      const baseDueDate = cardInvoice?.dueDate || formDueDate || formDate
      const nextStatus = formAccountId && !isMultiExpense && !isCreditCardExpense ? "reconciled" : "pending"
      const basePayload = {
        type: formType,
        account_id: isMultiExpense || isCreditCardExpense ? null : formAccountId || null,
        chart_account_id: selectedAccount.id,
        credit_card_id: creditCard?.id || null,
        category: selectedAccount.name,
        description: formDesc.trim(),
        date: formDate,
        payment_method: formPayment,
        status: nextStatus,
        reconciled_at: formAccountId && !isMultiExpense && !isCreditCardExpense ? new Date().toISOString() : null,
      }

      let error: any = null
      const syncIds: string[] = []
      if (editingItem) {
        const result = await (supabase.from("transactions") as any).update({
          ...basePayload,
          amount,
          due_date: baseDueDate || null,
          notes: formNotes.trim() || null,
        }).eq("id", editingItem.id).select("id")
        error = result.error
        if (!error) syncIds.push(String(editingItem.id))
      } else if (isMultiExpense) {
        const installmentAmount = repeatMode === "installments" ? Math.round((amount / totalRepeats) * 100) / 100 : amount
        const installmentRemainder = repeatMode === "installments" ? Math.round((amount - installmentAmount * (totalRepeats - 1)) * 100) / 100 : amount
        const rows = Array.from({ length: totalRepeats }, (_, index) => {
          const dueDate = addMonthsISO(baseDueDate, index) || baseDueDate
          const suffix = repeatMode === "installments" ? `${index + 1}/${totalRepeats}` : `${index + 1}/${totalRepeats}`
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

      closeModal()
      const nextAccount = findFallbackChartAccount(formType, formType === "income" ? "Receitas diversas" : "Outras despesas operacionais")
      setFormChartAccountId(nextAccount?.id || "")
      setFormCategory(nextAccount?.name || (formType === "income" ? ENTRADAS_CATEGORIES[0] : SAIDAS_CATEGORIES[0]))
      setFormDesc("")
      setFormAmount("R$ 0,00")
      setFormDueDate("")
      setFormCreditCardId("")
      setForceNextInvoice(false)
      setFormNotes("")
      setRepeatMode("single")
      toast({
        title: editingItem ? "Lançamento atualizado" : repeatMode === "single" ? "Lançamento registrado" : "Lançamentos gerados",
        description: !editingItem && repeatMode !== "single" ? `${totalRepeats} contas foram criadas em Contas a Pagar.` : undefined,
        type: "success",
      })
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
      if (filterScope === "sales" && item.source !== "sale") return false
      if (filterScope === "manual" && item.source !== "manual") return false
      if (filterScope === "stock" && item.source_type !== "inventory_purchase" && item.category !== "Estoque (Peças/Acessórios)") return false
      if (filterScope === "owners" && !["Retirada de Lucro", "Aporte do proprietário"].includes(item.category)) return false
      if (!query) return true
      return [
        item.description,
        item.category,
        formatPaymentMethod(item.payment_method),
        item.account_name || "",
        formatBRL(item.amount),
        item.notes || "",
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [data, filterScope, filterStatus, filterType, search])

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

  const scopeCounts = useMemo(() => ({
    all: data.length,
    sales: data.filter((item) => item.source === "sale").length,
    manual: data.filter((item) => item.source === "manual").length,
    stock: data.filter((item) => item.source_type === "inventory_purchase" || item.category === "Estoque (Peças/Acessórios)").length,
    owners: data.filter((item) => ["Retirada de Lucro", "Aporte do proprietário"].includes(item.category)).length,
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
              placeholder="Buscar por descrição, categoria, conta, valor ou observação..."
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
            { key: "all", label: "Tudo", count: scopeCounts.all },
            { key: "sales", label: "Vendas", count: scopeCounts.sales },
            { key: "manual", label: "Manuais", count: scopeCounts.manual },
            { key: "stock", label: "Estoque", count: scopeCounts.stock },
            { key: "owners", label: "Sócios", count: scopeCounts.owners },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilterScope(item.key as FilterScope)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                filterScope === item.key ? "bg-navy-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {item.label} <span className="opacity-70">({item.count})</span>
            </button>
          ))}
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
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Datas</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Conta</th>
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
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 p-5">
              <div>
                <h3 className="font-display text-lg font-bold text-navy-900 font-syne">{editingItem ? "Editar lançamento" : "Novo lançamento"}</h3>
                <p className="text-sm text-gray-500">{editingItem ? "Atualize categoria, valor, data e observações." : "Registre despesas fixas, receitas manuais e ajustes de caixa."}</p>
              </div>
              <button onClick={closeModal} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    const account = findFallbackChartAccount("income", "Receitas diversas")
                    setFormType("income")
                    setFormChartAccountId(account?.id || "")
                    setFormCategory(account?.name || ENTRADAS_CATEGORIES[0])
                    setCategoryQuery("")
                  }}
                  className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold", formType === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500")}
                >
                  <ArrowUpIcon className="h-4 w-4" /> Entrada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const account = findFallbackChartAccount("expense", "Outras despesas operacionais")
                    setFormType("expense")
                    setFormChartAccountId(account?.id || "")
                    setFormCategory(account?.name || SAIDAS_CATEGORIES[0])
                    setCategoryQuery("")
                  }}
                  className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold", formType === "expense" ? "bg-white text-red-600 shadow-sm" : "text-gray-500")}
                >
                  <ArrowDownIcon className="h-4 w-4" /> Saída
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <CategoryPicker
                    accounts={selectableChartAccounts}
                    selectedId={formChartAccountId}
                    query={categoryQuery}
                    onQueryChange={setCategoryQuery}
                    onSelect={(account) => {
                      setFormChartAccountId(account.id)
                      setFormCategory(account.name)
                    }}
                  />
                </div>
                <Input label="Descrição" placeholder="Ex: Aluguel da loja" value={formDesc} onChange={(event) => setFormDesc(event.target.value)} />
                <Input label="Valor" inputMode="numeric" value={formAmount} onChange={(event) => setFormAmount(formatCurrencyInput(event.target.value))} />
                <Input label="Data" type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
                <Input label="Vencimento" type="date" value={formDueDate} onChange={(event) => setFormDueDate(event.target.value)} />
                {formType === "expense" && !editingItem && (
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
                        <p className="pb-3 text-xs text-gray-500">
                          O valor total será dividido em {Math.max(2, Number(installmentCount) || 2)} parcelas mensais.
                        </p>
                      </div>
                    )}
                    {repeatMode === "recurring" && (
                      <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
                        <Input label="Meses" inputMode="numeric" value={recurringCount} onChange={(event) => setRecurringCount(event.target.value.replace(/\D/g, "").slice(0, 3) || "2")} />
                        <p className="pb-3 text-xs text-gray-500">
                          O mesmo valor será repetido mensalmente por {Math.max(2, Number(recurringCount) || 2)} meses.
                        </p>
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
                            <option key={card.id} value={card.id}>
                              {card.name}{card.last_four ? ` • final ${card.last_four}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2">
                        <span>
                          <span className="block text-xs font-semibold text-navy-900">Lançar na próxima fatura</span>
                          <span className="block text-xs text-gray-500">Use quando a fatura já fechou manualmente.</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={forceNextInvoice}
                          onChange={(event) => setForceNextInvoice(event.target.checked)}
                          className="h-5 w-5 accent-royal-500"
                        />
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
                    {creditCards.length === 0 && (
                      <p className="rounded-xl bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-700">
                        Cadastre um cartão em Financeiro &gt; Cartões para usar esta forma de pagamento.
                      </p>
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
                      <option key={account.id} value={account.id}>
                        {account.name}{account.institution ? ` · ${account.institution}` : ""}
                      </option>
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
            <p className="text-xs text-gray-500">{movementSourceLabel(item)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{item.category}</td>
      <td className="px-4 py-4 text-sm text-gray-600"><MovementDates item={item} /></td>
      <td className="px-4 py-4 text-sm text-gray-600">
        <AccountLabel item={item} />
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatPaymentMethod(item.payment_method)}</td>
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
            <p className="text-xs text-gray-500">{item.category}</p>
            <div className="mt-1"><MovementDates item={item} compact /></div>
            <p className="mt-1 text-xs text-gray-400"><AccountLabel item={item} /></p>
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

function AccountLabel({ item }: { item: UnifiedTransaction }) {
  if (item.account_name) return <span>{item.account_name}</span>
  if (item.status === "reconciled") return <span className="text-red-500">Conta não vinculada</span>
  return <span className="text-gray-400">{item.type === "income" ? "A receber" : "A pagar"}</span>
}

function movementSourceLabel(item: UnifiedTransaction) {
  if (item.source === "sale") return "Venda do sistema"
  if (item.source_type === "inventory_purchase") return "Compra de estoque"
  return "Lançamento manual"
}

function MovementDates({ item, compact = false }: { item: UnifiedTransaction; compact?: boolean }) {
  const opDate = operationalDate(item)
  const finDate = financialDate(item)
  const hasLinkedOrigin = isLinkedOrigin(item)
  const datesDiffer = dateOnly(opDate) !== dateOnly(finDate)
  const operationLabel = item.operational_label || "Data"

  if (!hasLinkedOrigin) {
    return <span>{formatDate(finDate)}</span>
  }

  return (
    <div className={cn("space-y-1", compact && "text-xs")}>
      <div>
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{operationLabel}</span>
        <span className="font-medium text-gray-700">{formatDate(opDate)}</span>
      </div>
      {datesDiffer ? (
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-royal-400">Data financeira</span>
          <span className="font-medium text-royal-700">{formatDate(finDate)}</span>
        </div>
      ) : null}
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
