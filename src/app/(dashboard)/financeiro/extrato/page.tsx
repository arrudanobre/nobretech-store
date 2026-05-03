"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, Banknote, CalendarDays, Download, Eraser, Filter, History, Landmark, Link2, Plus, RotateCcw, Scale, Search, ShieldCheck, SlidersHorizontal, TrendingUp, Wallet, type LucideIcon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toaster"
import { formatBRL, formatDate, formatPaymentMethod, todayISO } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type MovementType = "income" | "expense" | "adjustment" | "reversal"

type Movement = {
  id: string
  account_id?: string | null
  movement_date: string
  type: MovementType
  category: string
  description: string
  amount: number
  balance_after?: number | null
  payment_method?: string | null
  source: string
  source_id?: string | null
  notes?: string | null
  adjustment_reason?: string | null
  previous_balance?: number | null
  target_balance?: number | null
  difference_amount?: number | null
  is_canceled?: boolean | null
  canceled_at?: string | null
  canceled_reason?: string | null
  reversal_of_id?: string | null
  created_at?: string | null
  created_by?: string | null
}

type MovementWithBalance = Movement & {
  computed_balance_after: number
}

type DbRequestBody = {
  table: string
  action: "insert" | "update"
  values: Record<string, unknown>
  filters?: Array<{ op: "eq"; column: string; value: unknown }>
}

type FinanceAccount = {
  id: string
  name: string
  institution?: string | null
}

type QueryResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

const INCOME_CATEGORIES = ["Venda", "Aporte do proprietário", "Reembolso", "Correção manual", "Outros"]
const EXPENSE_CATEGORIES = ["Compra de estoque", "Taxa de maquininha", "Frete / entrega", "Embalagem", "Manutenção", "Marketing / anúncios", "Despesa operacional", "Retirada do proprietário", "Correção manual", "Outros"]
const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Transferência", "Boleto"]
const SOURCE_LABELS: Record<string, string> = {
  manual_entry: "Entrada manual",
  manual_expense: "Saída manual",
  manual_balance_adjustment: "Correção manual",
  sale: "Venda",
  purchase: "Compra",
  card_fee: "Taxa de cartão",
  refund: "Reembolso",
  reversal: "Movimento de estorno",
  system_generated: "Sistema",
  transaction: "Transação",
  inventory_purchase: "Compra de estoque",
  account_payable: "Conta a pagar",
  account_receivable: "Conta a receber",
}

const EMPTY_FILTERS = {
  type: "all",
  category: "all",
  source: "all",
  payment: "all",
  account: "all",
  search: "",
  min: "",
  max: "",
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  const cents = Number(digits || "0")
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function parseCurrencyInput(value: string) {
  return Number(value.replace(/\D/g, "") || "0") / 100
}

function currentMonthKey() {
  return todayISO().slice(0, 7)
}

function firstDayOfMonth(month: string) {
  return `${month}-01`
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  return `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`
}

function defaultDateRange() {
  const month = currentMonthKey()
  return { start: firstDayOfMonth(month), end: lastDayOfMonth(month) }
}

function formatPeriodLabel(start: string, end: string) {
  if (!start || !end) return "Período personalizado"
  if (start.slice(0, 7) === end.slice(0, 7) && start.endsWith("-01") && end === lastDayOfMonth(start.slice(0, 7))) {
    const [year, month] = start.slice(0, 7).split("-")
    return `${month}/${year}`
  }
  return `${formatDate(start)} a ${formatDate(end)}`
}

function sortMovementsAsc(a: Movement, b: Movement) {
  const dateCompare = String(a.movement_date).localeCompare(String(b.movement_date))
  if (dateCompare !== 0) return dateCompare
  return String(a.created_at || "").localeCompare(String(b.created_at || ""))
}

function movementTone(type: MovementType, amount: number) {
  if (type === "adjustment") return "yellow"
  if (type === "reversal") return "gray"
  return amount >= 0 ? "green" : "red"
}

function typeLabel(type: MovementType) {
  if (type === "income") return "Entrada"
  if (type === "expense") return "Saída"
  if (type === "adjustment") return "Correção"
  return "Movimento de estorno"
}

function sourceLabel(source?: string | null) {
  return SOURCE_LABELS[String(source || "")] || source || "—"
}

function movementIcon(type: MovementType, amount: number) {
  if (type === "adjustment") return SlidersHorizontal
  if (type === "reversal") return RotateCcw
  return amount >= 0 ? ArrowUpRight : ArrowDownRight
}

function movementStatus(movement: Movement) {
  if (movement.is_canceled) return { label: "Estornado", variant: "red" as const }
  if (movement.type === "reversal") return { label: "Movimento de estorno", variant: "gray" as const }
  if (movement.type === "adjustment") return { label: "Auditado", variant: "yellow" as const }
  return { label: "Ativo", variant: "green" as const }
}

type HistoryScope = "all" | "active" | "audit"

function movementMatchesHistoryScope(movement: Movement, scope: HistoryScope) {
  if (scope === "all") return true
  if (scope === "active") return !movement.is_canceled && movement.type !== "adjustment" && movement.type !== "reversal"
  return !!(movement.is_canceled || movement.type === "reversal")
}

function shortMovementId(id: string) {
  return id.slice(0, 8)
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado"
}

async function dbRequest<T = unknown>(body: DbRequestBody): Promise<T> {
  const response = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || "Erro ao salvar no banco")
  }
  return payload.data as T
}

export default function AccountStatementPage() {
  const { toast } = useToast()
  const [movements, setMovements] = useState<Movement[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [reversalTarget, setReversalTarget] = useState<MovementWithBalance | null>(null)
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [movementForm, setMovementForm] = useState({
    type: "income" as "income" | "expense",
    category: "Venda",
    description: "",
    amount: "R$ 0,00",
    date: todayISO(),
    payment_method: "Pix",
    account_id: "",
    notes: "",
  })
  const [adjustmentForm, setAdjustmentForm] = useState({
    targetBalance: "R$ 0,00",
    reason: "",
    notes: "",
  })
  const [confirmAdjustment, setConfirmAdjustment] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [historyScope, setHistoryScope] = useState<HistoryScope>("all")
  const [flashRowId, setFlashRowId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const pendingScrollId = useRef<string | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [movementsRes, accountsRes] = await Promise.all([
        supabase.from("financial_account_movements")
          .select("*")
          .order("movement_date", { ascending: true }) as Promise<QueryResult<Movement>>,
        supabase.from("finance_accounts")
          .select("id, name, institution")
          .eq("is_active", true)
          .order("created_at", { ascending: true }) as Promise<QueryResult<FinanceAccount>>,
      ])
      if (movementsRes.error) throw new Error(movementsRes.error.message)
      if (accountsRes.error) throw new Error(accountsRes.error.message)
      const loadedMovements = (movementsRes.data || []).map((item) => ({
        ...item,
        movement_date: String(item.movement_date || "").slice(0, 10),
        amount: Number(item.amount || 0),
      }))
      setMovements(loadedMovements)
      const defaultRange = defaultDateRange()
      const currentMonthHasMovements = loadedMovements.some((movement: Movement) => movement.movement_date >= defaultRange.start && movement.movement_date <= defaultRange.end)
      if (dateRange.start === defaultRange.start && dateRange.end === defaultRange.end && !currentMonthHasMovements && loadedMovements.length > 0) {
        const latestMovement = [...loadedMovements].sort(sortMovementsAsc).at(-1)
        if (latestMovement?.movement_date) {
          const latestMonth = String(latestMovement.movement_date).slice(0, 7)
          setDateRange({ start: firstDayOfMonth(latestMonth), end: lastDayOfMonth(latestMonth) })
        }
      }
      const loadedAccounts = accountsRes.data || []
      setAccounts(loadedAccounts)
      setMovementForm((previous) => previous.account_id || loadedAccounts.length === 0 ? previous : { ...previous, account_id: loadedAccounts[0].id })
    } catch (error: unknown) {
      toast({ title: "Erro ao carregar extrato", description: getErrorMessage(error), type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const movementsWithBalance = useMemo<MovementWithBalance[]>(() => {
    let balance = 0
    return [...movements].sort(sortMovementsAsc).map((movement) => {
      balance += Number(movement.amount || 0)
      return { ...movement, computed_balance_after: balance }
    })
  }, [movements])

  const currentBalance = movementsWithBalance.at(-1)?.computed_balance_after || 0
  const startDate = dateRange.start <= dateRange.end ? dateRange.start : dateRange.end
  const endDate = dateRange.start <= dateRange.end ? dateRange.end : dateRange.start
  const periodLabel = formatPeriodLabel(startDate, endDate)

  const filterOptions = useMemo(() => {
    const paymentsByLabel = new Map<string, string>()
    for (const movement of movements) {
      if (!movement.payment_method) continue
      const label = formatPaymentMethod(movement.payment_method)
      if (!paymentsByLabel.has(label)) paymentsByLabel.set(label, movement.payment_method)
    }
    return {
      categories: Array.from(new Set(movements.map((movement) => movement.category).filter(Boolean))).sort(),
      sources: Array.from(new Set(movements.map((movement) => movement.source).filter(Boolean))).sort(),
      payments: Array.from(paymentsByLabel.values()).sort((a, b) => formatPaymentMethod(a).localeCompare(formatPaymentMethod(b))),
    }
  }, [movements])

  const accountById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]))
  }, [accounts])

  const movementById = useMemo(() => {
    const map = new Map<string, MovementWithBalance>()
    for (const m of movementsWithBalance) map.set(m.id, m)
    return map
  }, [movementsWithBalance])

  const reversalByOriginalId = useMemo(() => {
    const map = new Map<string, MovementWithBalance>()
    for (const m of movementsWithBalance) {
      if (m.type === "reversal" && m.reversal_of_id) map.set(m.reversal_of_id, m)
    }
    return map
  }, [movementsWithBalance])

  const periodMovements = useMemo(() => {
    return movementsWithBalance.filter((movement) => movement.movement_date >= startDate && movement.movement_date <= endDate)
  }, [endDate, movementsWithBalance, startDate])

  const filteredMovements = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    const min = filters.min ? parseCurrencyInput(filters.min) : null
    const max = filters.max ? parseCurrencyInput(filters.max) : null
    return periodMovements
      .filter((movement) => {
        if (!movementMatchesHistoryScope(movement, historyScope)) return false
        const absolute = Math.abs(Number(movement.amount || 0))
        const matchesType = filters.type === "all" || movement.type === filters.type
        const matchesCategory = filters.category === "all" || movement.category === filters.category
        const matchesSource = filters.source === "all" || movement.source === filters.source
        const matchesPayment = filters.payment === "all" || movement.payment_method === filters.payment
        const matchesAccount = filters.account === "all" || movement.account_id === filters.account
        const matchesMin = min === null || absolute >= min
        const matchesMax = max === null || absolute <= max
        const matchesSearch = !term || [
          movement.description,
          movement.category,
          movement.notes,
          movement.adjustment_reason,
          movement.id,
          movement.source_id,
          movement.reversal_of_id,
        ].filter(Boolean).join(" ").toLowerCase().includes(term)
        return matchesType && matchesCategory && matchesSource && matchesPayment && matchesAccount && matchesMin && matchesMax && matchesSearch
      })
      .sort((a, b) => -sortMovementsAsc(a, b))
  }, [filters, historyScope, periodMovements])

  const scrollToMovementRow = (id: string) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    setFlashRowId(id)
    requestAnimationFrame(() => {
      rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    flashTimeoutRef.current = setTimeout(() => setFlashRowId(null), 2600)
  }

  const focusLinkedMovement = (id: string) => {
    const target = movementById.get(id)
    if (!target) return
    if (target.movement_date < startDate || target.movement_date > endDate) {
      toast({ title: "Lançamento fora do período", description: "Ajuste o range de datas para localizar o movimento vinculado.", type: "error" })
      return
    }
    if (!movementMatchesHistoryScope(target, historyScope)) {
      setHistoryScope("all")
      pendingScrollId.current = id
      toast({ title: "Mostrando todo o histórico", description: "O lançamento vinculado estava oculto pelo filtro de linhas.", type: "success" })
      return
    }
    scrollToMovementRow(id)
  }

  useEffect(() => {
    const id = pendingScrollId.current
    if (!id) return
    if (!filteredMovements.some((m) => m.id === id)) return
    pendingScrollId.current = null
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    setFlashRowId(id)
    requestAnimationFrame(() => {
      rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    flashTimeoutRef.current = setTimeout(() => setFlashRowId(null), 2600)
  }, [filteredMovements])

  const metrics = useMemo(() => {
    const activeOperationalMovements = periodMovements.filter((movement) => !movement.is_canceled && movement.type !== "adjustment" && movement.type !== "reversal")
    const auditMovements = periodMovements.filter((movement) => movement.is_canceled || movement.type === "adjustment" || movement.type === "reversal")
    const income = activeOperationalMovements.filter((movement) => movement.amount > 0).reduce((sum, movement) => sum + movement.amount, 0)
    const expense = activeOperationalMovements.filter((movement) => movement.amount < 0).reduce((sum, movement) => sum + Math.abs(movement.amount), 0)
    const adjustments = periodMovements.filter((movement) => movement.type === "adjustment" || movement.type === "reversal").reduce((sum, movement) => sum + movement.amount, 0)
    const netPeriod = income - expense
    const averageTicket = activeOperationalMovements.length ? (income + expense) / activeOperationalMovements.length : 0
    return {
      currentBalance,
      income,
      expense,
      adjustments,
      netPeriod,
      averageTicket,
      count: periodMovements.length,
      activeCount: activeOperationalMovements.length,
      auditCount: auditMovements.length,
      canceledCount: periodMovements.filter((movement) => movement.is_canceled).length,
    }
  }, [currentBalance, periodMovements])

  const balanceChartData = useMemo(() => {
    const grouped = new Map<string, { date: string; entrada: number; saida: number; saldo: number }>()
    for (const movement of periodMovements) {
      const current = grouped.get(movement.movement_date) || { date: movement.movement_date, entrada: 0, saida: 0, saldo: movement.computed_balance_after }
      if (movement.amount >= 0) current.entrada += movement.amount
      if (movement.amount < 0) current.saida += Math.abs(movement.amount)
      current.saldo = movement.computed_balance_after
      grouped.set(movement.movement_date, current)
    }
    return Array.from(grouped.values()).map((item) => ({
      ...item,
      label: item.date.slice(8, 10),
    }))
  }, [periodMovements])

  const recentAuditMovements = useMemo(() => {
    return movementsWithBalance
      .filter((movement) => movement.type === "adjustment" || movement.type === "reversal" || movement.is_canceled)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 4)
  }, [movementsWithBalance])

  const hasActiveFilters = useMemo(() => {
    const defaultRange = defaultDateRange()
    return (
      historyScope !== "all"
      || dateRange.start !== defaultRange.start
      || dateRange.end !== defaultRange.end
      || Object.entries(filters).some(([key, value]) => value !== EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS])
    )
  }, [dateRange.end, dateRange.start, filters, historyScope])

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS)
    setDateRange(defaultDateRange())
    setHistoryScope("all")
  }

  const exportStatement = () => {
    const rows = filteredMovements.map((movement) => [
      movement.movement_date,
      typeLabel(movement.type),
      movement.description,
      movement.category,
      sourceLabel(movement.source),
      accountById.get(String(movement.account_id || ""))?.name || "",
      formatPaymentMethod(movement.payment_method),
      movement.amount,
      movement.computed_balance_after,
      movementStatus(movement).label,
      movement.id,
    ])
    const header = ["Data", "Tipo", "Descrição", "Categoria", "Origem", "Conta", "Pagamento", "Valor", "Saldo após", "Status", "ID"]
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `extrato-nobretech-${startDate}-a-${endDate}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast({ title: "Extrato exportado", description: `${rows.length} movimentação(ões) no arquivo CSV.`, type: "success" })
  }

  const resetMovementForm = (type: "income" | "expense" = "income") => {
    setMovementForm({
      type,
      category: type === "income" ? "Venda" : "Despesa operacional",
      description: "",
      amount: "R$ 0,00",
      date: todayISO(),
      payment_method: "Pix",
      account_id: accounts[0]?.id || "",
      notes: "",
    })
  }

  const openMovementModal = (type: "income" | "expense" = "income") => {
    resetMovementForm(type)
    setShowMovementModal(true)
  }

  const createMovement = async () => {
    const amountValue = parseCurrencyInput(movementForm.amount)
    if (amountValue <= 0) {
      toast({ title: "Informe um valor maior que zero", type: "error" })
      return
    }
    if (!movementForm.description.trim()) {
      toast({ title: "Informe uma descrição", type: "error" })
      return
    }

    const signedAmount = movementForm.type === "income" ? amountValue : -amountValue
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await dbRequest({
        table: "financial_account_movements",
        action: "insert",
        values: {
          account_id: movementForm.account_id || null,
          movement_date: movementForm.date,
          type: movementForm.type,
          category: movementForm.category,
          description: movementForm.description.trim(),
          amount: signedAmount,
          balance_after: currentBalance + signedAmount,
          payment_method: movementForm.payment_method || null,
          source: movementForm.type === "income" ? "manual_entry" : "manual_expense",
          notes: movementForm.notes || null,
          created_by: user?.id || null,
        },
      })
      toast({ title: "Movimentação adicionada", type: "success" })
      setShowMovementModal(false)
      fetchData()
    } catch (error: unknown) {
      toast({ title: "Erro ao adicionar movimentação", description: getErrorMessage(error), type: "error" })
    } finally {
      setSubmitting(false)
    }
  }

  const openAdjustmentModal = () => {
    setAdjustmentForm({ targetBalance: formatBRL(currentBalance), reason: "", notes: "" })
    setConfirmAdjustment(false)
    setShowAdjustmentModal(true)
  }

  const adjustmentPreview = useMemo(() => {
    const target = parseCurrencyInput(adjustmentForm.targetBalance)
    const difference = Math.round((target - currentBalance + Number.EPSILON) * 100) / 100
    return { target, difference }
  }, [adjustmentForm.targetBalance, currentBalance])

  const createAdjustment = async () => {
    if (!adjustmentForm.reason.trim()) {
      toast({ title: "Motivo obrigatório", description: "Informe o motivo da correção manual.", type: "error" })
      return
    }
    if (adjustmentPreview.difference === 0) {
      toast({ title: "Saldo já confere", description: "O saldo informado é igual ao saldo atual do sistema.", type: "error" })
      return
    }
    if (!confirmAdjustment) {
      setConfirmAdjustment(true)
      return
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await dbRequest({
        table: "financial_account_movements",
        action: "insert",
        values: {
          movement_date: todayISO(),
          type: "adjustment",
          category: "Correção manual",
          description: "Correção manual de saldo",
          amount: adjustmentPreview.difference,
          balance_after: adjustmentPreview.target,
          source: "manual_balance_adjustment",
          notes: adjustmentForm.notes || null,
          adjustment_reason: adjustmentForm.reason.trim(),
          previous_balance: currentBalance,
          target_balance: adjustmentPreview.target,
          difference_amount: adjustmentPreview.difference,
          created_by: user?.id || null,
        },
      })
      toast({ title: "Saldo corrigido", description: `Novo saldo: ${formatBRL(adjustmentPreview.target)}`, type: "success" })
      setShowAdjustmentModal(false)
      fetchData()
    } catch (error: unknown) {
      toast({ title: "Erro ao corrigir saldo", description: getErrorMessage(error), type: "error" })
    } finally {
      setSubmitting(false)
    }
  }

  const createReversal = async () => {
    if (!reversalTarget) return
    const reason = reversalTarget.canceled_reason || "Estorno solicitado no extrato"
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const reversalAmount = -Number(reversalTarget.amount || 0)
      await dbRequest({
        table: "financial_account_movements",
        action: "insert",
        values: {
          account_id: reversalTarget.account_id || null,
          movement_date: todayISO(),
          type: "reversal",
          category: "Estorno",
          description: `Estorno de: ${reversalTarget.description}`,
          amount: reversalAmount,
          balance_after: currentBalance + reversalAmount,
          payment_method: reversalTarget.payment_method || null,
          source: "reversal",
          source_id: reversalTarget.id,
          reversal_of_id: reversalTarget.id,
          notes: reason,
          created_by: user?.id || null,
        },
      })

      await dbRequest({
        table: "financial_account_movements",
        action: "update",
        values: { is_canceled: true, canceled_at: new Date().toISOString(), canceled_reason: reason },
        filters: [{ op: "eq", column: "id", value: reversalTarget.id }],
      })

      toast({ title: "Movimento estornado", description: "O lançamento original foi mantido e um movimento de estorno foi criado.", type: "success" })
      setReversalTarget(null)
      fetchData()
    } catch (error: unknown) {
      toast({ title: "Erro ao estornar", description: getErrorMessage(error), type: "error" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Link href="/financeiro" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-royal-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Painel financeiro
          </Link>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Extrato da Conta da Empresa</h2>
          <p className="text-sm text-gray-500">Saldo auditável por movimentos. Correções viram lançamentos e ficam registradas no histórico.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={openAdjustmentModal}>
            <Scale className="h-4 w-4" /> Corrigir saldo
          </Button>
          <Button onClick={() => openMovementModal("income")}>
            <Plus className="h-4 w-4" /> Adicionar movimentação
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
        <MetricCard title="Saldo no sistema" value={formatBRL(metrics.currentBalance)} icon={Wallet} tone={metrics.currentBalance >= 0 ? "navy" : "red"} hint="Saldo acumulado global" detail="Independente do filtro" />
        <MetricCard title="Variação no período" value={`${metrics.netPeriod >= 0 ? "+" : "-"}${formatBRL(Math.abs(metrics.netPeriod))}`} icon={TrendingUp} tone={metrics.netPeriod >= 0 ? "green" : "red"} hint={periodLabel} detail="Entradas menos saídas válidas no período filtrado." />
        <MetricCard title="Entradas ativas" value={formatBRL(metrics.income)} icon={ArrowUpRight} tone="green" hint="Sem cancelados e estornos" detail={`${metrics.activeCount} lançamento(s) ativo(s)`} />
        <MetricCard title="Saídas ativas" value={formatBRL(metrics.expense)} icon={ArrowDownRight} tone="red" hint="Sem cancelados e estornos" detail={`Ticket médio ${formatBRL(metrics.averageTicket)}`} />
        <MetricCard title="Auditoria" value={formatBRL(metrics.adjustments)} icon={SlidersHorizontal} tone={metrics.adjustments >= 0 ? "blue" : "red"} hint={`${metrics.auditCount} movimento(s)`} detail="Cancelados, estornos e correções. Não representam saldo ativo." />
      </div>

      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Conferencia:</span> o saldo acima e contabil, calculado pelos movimentos gravados. Se o PagBank mostrar outro valor, registre uma correcao de saldo para guardar a diferenca no historico.
      </div>

      <Card className="overflow-hidden border-gray-100 shadow-sm">
        <div className="border-b border-gray-100 bg-white p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white shadow-sm">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display font-bold text-navy-900 font-syne">Filtros e ações</h3>
                  <Badge variant="gray">{filteredMovements.length} na tabela</Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">O saldo atual continua global. O range altera cards do período, gráfico e listagem.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters}>
                <Eraser className="h-4 w-4" /> Limpar filtros
              </Button>
              <Button variant="outline" onClick={exportStatement}>
                <Download className="h-4 w-4" /> Exportar extrato
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1.25fr_1fr] xl:grid-cols-[1.25fr_1fr_auto] xl:items-end">
            <Input placeholder="Buscar descrição, ID, motivo..." value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} icon={<Search className="h-4 w-4" />} />
            <div className="rounded-2xl border border-gray-100 bg-surface/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                <CalendarDays className="h-4 w-4 text-royal-500" /> Período
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DateInput label="Início" value={dateRange.start} onChange={(value) => setDateRange((previous) => ({ ...previous, start: value || previous.start }))} />
                <DateInput label="Fim" value={dateRange.end} onChange={(value) => setDateRange((previous) => ({ ...previous, end: value || previous.end }))} />
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm xl:min-w-[190px]">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Resumo do filtro</p>
              <p className="mt-1 font-bold text-navy-900">{periodLabel}</p>
              <p className="text-xs text-gray-500">{periodMovements.length} movimento(s) no período</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Escopo da tabela</p>
            <div className="grid gap-2 md:grid-cols-3">
              {([
                ["all", "Todos", "Mostra ativos, cancelados, estornos e correções"],
                ["active", "Somente ativos", "Oculta auditoria, IDs e vínculos de estorno"],
                ["audit", "Auditoria", "Cancelados, estornos, correções e vínculos"],
              ] as [HistoryScope, string, string][]).map(([scope, title, description]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setHistoryScope(scope)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    historyScope === scope ? "border-royal-200 bg-royal-50 text-navy-900 shadow-sm" : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                  )}
                >
                  <span className="text-sm font-bold">{title}</span>
                  <span className="mt-0.5 block text-xs">{description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SelectField value={filters.type} onChange={(value) => setFilters((previous) => ({ ...previous, type: value }))} options={[["all", "Todos os tipos"], ["income", "Entrada"], ["expense", "Saída"], ["adjustment", "Correção"], ["reversal", "Movimento de estorno"]]} />
            <SelectField value={filters.category} onChange={(value) => setFilters((previous) => ({ ...previous, category: value }))} options={[["all", "Categorias"], ...filterOptions.categories.map((item) => [item, item] as [string, string])]} />
            <SelectField value={filters.source} onChange={(value) => setFilters((previous) => ({ ...previous, source: value }))} options={[["all", "Origens"], ...filterOptions.sources.map((item) => [item, sourceLabel(item)] as [string, string])]} />
            <SelectField value={filters.payment} onChange={(value) => setFilters((previous) => ({ ...previous, payment: value }))} options={[["all", "Pagamentos"], ...filterOptions.payments.map((item) => [item, formatPaymentMethod(item)] as [string, string])]} />
            <SelectField value={filters.account} onChange={(value) => setFilters((previous) => ({ ...previous, account: value }))} options={[["all", "Contas"], ...accounts.map((account) => [account.id, account.name] as [string, string])]} />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Input placeholder="Valor mín." value={filters.min} onChange={(event) => setFilters((previous) => ({ ...previous, min: formatCurrencyInput(event.target.value) }))} />
            <Input placeholder="Valor máx." value={filters.max} onChange={(event) => setFilters((previous) => ({ ...previous, max: formatCurrencyInput(event.target.value) }))} />
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
              Valores filtram pelo módulo do lançamento.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-royal-500" />
                <h3 className="font-display font-bold text-navy-900 font-syne">Evolução do saldo acumulado</h3>
              </div>
              <p className="mt-1 text-sm text-gray-500">Mostra o saldo após movimentos válidos no período.</p>
            </div>
            <Badge variant={metrics.netPeriod >= 0 ? "green" : "red"}>Variação: {metrics.netPeriod >= 0 ? "+" : "-"}{formatBRL(Math.abs(metrics.netPeriod))}</Badge>
          </div>
          <div className="h-48">
            {balanceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceChartData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="statementBalance" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e8eef7" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={76} tickFormatter={(value) => formatBRL(Number(value)).replace("R$", "R$ ")} />
                  <Tooltip formatter={(value) => formatBRL(Number(value || 0))} labelFormatter={(label) => `Dia ${label}`} />
                  <Area type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2.2} fill="url(#statementBalance)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-surface text-sm text-gray-400">Sem dados no período.</div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="font-display font-bold text-navy-900 font-syne">Auditoria recente</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">Últimas correções e estornos registrados.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {recentAuditMovements.length === 0 ? (
              <div className="p-5 text-sm text-gray-400">Nenhuma correção ou estorno recente.</div>
            ) : recentAuditMovements.map((movement) => {
              const status = movementStatus(movement)
              return (
                <div key={movement.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900">{movement.description}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatDateTime(movement.created_at)} · {movement.created_by ? movement.created_by.slice(0, 8) : "usuário não identificado"}</p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className={cn("mt-2 text-sm font-bold", movement.amount >= 0 ? "text-emerald-600" : "text-red-600")}>{movement.amount >= 0 ? "+" : "-"}{formatBRL(Math.abs(movement.amount))}</p>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border-navy-100 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gradient-to-r from-white to-royal-50/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-royal-500" />
              <h3 className="font-display font-bold text-lg text-navy-900 font-syne">Movimentos financeiros</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">Data, origem, conta, valor, status e saldo acumulado após cada movimento (saldo sempre com histórico completo).</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={metrics.currentBalance >= 0 ? "green" : "red"}>{metrics.currentBalance >= 0 ? "Saldo positivo" : "Saldo negativo"}</Badge>
            <Badge variant="gray">{filteredMovements.length} na tabela · {periodMovements.length} no período</Badge>
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">Carregando extrato...</div>
        ) : filteredMovements.length === 0 ? (
          <EmptyState onAdd={() => openMovementModal("income")} onClear={resetFilters} hasFilters={hasActiveFilters} />
        ) : (
          <div className="overflow-x-auto">
            <table className={cn("w-full text-sm", historyScope === "active" ? "min-w-[980px]" : "min-w-[1180px]")}>
              <thead>
                {historyScope === "active" ? (
                  <tr className="border-b border-gray-100 bg-gray-50/90 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Conta</th>
                    <th className="px-4 py-3">Pagamento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-right">Saldo após</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                ) : (
                  <tr className="border-b border-gray-100 bg-gray-50/90 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3">Movimento</th>
                    <th className="px-4 py-3">Detalhes</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-right">Saldo após</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredMovements.map((movement) => {
                  const Icon = movementIcon(movement.type, movement.amount)
                  const status = movementStatus(movement)
                  const account = accountById.get(String(movement.account_id || ""))
                  const linkedReversal = reversalByOriginalId.get(movement.id)
                  const originalForReversal = movement.reversal_of_id ? movementById.get(movement.reversal_of_id) : undefined
                  const isCanceledOriginal = !!movement.is_canceled
                  const isReversalRow = movement.type === "reversal"
                  if (historyScope === "active") {
                    return (
                      <tr key={movement.id} ref={(el) => { rowRefs.current[movement.id] = el }} className={cn("transition hover:bg-royal-50/30", flashRowId === movement.id && "ring-2 ring-inset ring-royal-400")}>
                        <td className="px-4 py-3 font-medium text-gray-700">{formatDate(movement.movement_date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-navy-900">{movement.description}</p>
                          <p className="mt-1 text-xs text-gray-500">{movement.category} · {sourceLabel(movement.source)}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{account?.name || "Sem conta"}</td>
                        <td className="px-4 py-3 text-gray-600">{formatPaymentMethod(movement.payment_method)}</td>
                        <td className={cn("px-4 py-3 text-right text-base font-bold tabular-nums", movement.amount >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {movement.amount >= 0 ? "+" : "-"}{formatBRL(Math.abs(movement.amount))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-navy-900">{formatBRL(movement.computed_balance_after)}</td>
                        <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      </tr>
                    )
                  }
                  return (
                  <tr
                    key={movement.id}
                    ref={(el) => { rowRefs.current[movement.id] = el }}
                    className={cn(
                      "transition",
                      flashRowId === movement.id && "ring-2 ring-inset ring-royal-400",
                      isCanceledOriginal && "bg-gray-50/70 opacity-[0.78] hover:bg-gray-50/90",
                      isReversalRow && "border-l-[3px] border-l-violet-500 bg-violet-50/30 hover:bg-violet-50/45",
                      !isCanceledOriginal && !isReversalRow && "hover:bg-royal-50/30",
                    )}
                  >
                    <td className={cn("px-4 py-3", isCanceledOriginal && "text-gray-500")}>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                            isCanceledOriginal && "scale-95 opacity-60",
                            !isCanceledOriginal && movement.amount >= 0 && !isReversalRow && "bg-emerald-50 text-emerald-600",
                            !isCanceledOriginal && movement.amount < 0 && !isReversalRow && "bg-red-50 text-red-600",
                            movement.type === "adjustment" && "bg-amber-50 text-amber-700",
                            isReversalRow && "bg-violet-100 text-violet-700",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className={cn("font-semibold", isCanceledOriginal ? "text-gray-600" : "text-navy-900")}>{formatDate(movement.movement_date)}</p>
                          <div className="mt-1">
                            <Badge
                              variant={(isReversalRow ? "gray" : movementTone(movement.type, movement.amount)) as "green" | "red" | "yellow" | "gray"}
                              dot
                              className={isReversalRow ? "bg-violet-100 text-violet-800" : undefined}
                            >
                              {typeLabel(movement.type)}
                            </Badge>
                            {isCanceledOriginal && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-gray-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                                Não conta como entrada ativa
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={cn("px-4 py-3", isCanceledOriginal && "text-gray-500")}>
                      <p className={cn("font-semibold", isCanceledOriginal ? "text-gray-600" : "text-navy-900")}>{movement.description}</p>
                      <p className="mt-1 text-xs text-gray-500">{movement.category} · {sourceLabel(movement.source)} · {account?.name || "Sem conta"} · {formatPaymentMethod(movement.payment_method)}</p>
                      {movement.adjustment_reason && <p className="mt-1 text-xs text-amber-700">Motivo: {movement.adjustment_reason}</p>}
                      {movement.notes && <p className="mt-1 text-xs text-gray-400">{movement.notes}</p>}
                      {isCanceledOriginal && (
                        <p className="mt-1 text-xs font-medium text-red-600/90">Motivo do estorno: {movement.canceled_reason || "não informado"}</p>
                      )}
                      {isReversalRow && (
                        <p className="mt-1 text-xs font-medium text-violet-700">Movimento de auditoria. Não conta como entrada ativa.</p>
                      )}
                      {isReversalRow && movement.reversal_of_id && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-violet-100 bg-white/60 px-2 py-1.5 text-xs text-violet-900">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                          <span>Estorno do lançamento <code className="rounded bg-violet-100 px-1 font-mono text-[10px]">{shortMovementId(movement.reversal_of_id)}</code></span>
                          {originalForReversal && (
                            <span className="text-gray-500">({originalForReversal.description})</span>
                          )}
                          <button
                            type="button"
                            onClick={() => focusLinkedMovement(movement.reversal_of_id!)}
                            className="font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                          >
                            Ver lançamento original
                          </button>
                        </div>
                      )}
                      {isCanceledOriginal && linkedReversal && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <span>Há movimento de estorno vinculado <code className="rounded bg-gray-100 px-1 font-mono text-[10px]">{shortMovementId(linkedReversal.id)}</code></span>
                          <button
                            type="button"
                            onClick={() => focusLinkedMovement(linkedReversal.id)}
                            className="font-semibold text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-navy-900"
                          >
                            Ver estorno
                          </button>
                        </div>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        isCanceledOriginal && "text-sm font-medium text-gray-400",
                        !isCanceledOriginal && isReversalRow && "text-base font-bold text-violet-800",
                        !isCanceledOriginal && !isReversalRow && "text-base font-bold",
                        !isCanceledOriginal && !isReversalRow && movement.amount >= 0 && "text-emerald-600",
                        !isCanceledOriginal && !isReversalRow && movement.amount < 0 && "text-red-600",
                      )}
                    >
                      {movement.amount >= 0 ? "+" : "-"}{formatBRL(Math.abs(movement.amount))}
                    </td>
                    <td className={cn("px-4 py-3 text-right font-bold tabular-nums", isCanceledOriginal ? "text-gray-500" : "text-navy-900")}>{formatBRL(movement.computed_balance_after)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={status.variant}
                        className={isReversalRow ? "bg-violet-100 text-violet-800" : isCanceledOriginal ? "bg-red-50 text-red-700/90" : undefined}
                      >
                        {status.label}
                      </Badge>
                    </td>
                    <td className={cn("px-4 py-3", isCanceledOriginal && "text-gray-500")}>
                      <code className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-500">{shortMovementId(movement.id)}</code>
                      <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(movement.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {movement.type !== "reversal" && !movement.reversal_of_id && !movement.is_canceled ? (
                        <button type="button" onClick={() => setReversalTarget({ ...movement, canceled_reason: "" })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-400 transition hover:bg-red-50 hover:text-red-600">
                          <RotateCcw className="h-3.5 w-3.5" /> Estornar
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-300"><History className="h-3.5 w-3.5" /> Histórico</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showMovementModal && (
        <Modal title="Adicionar movimentação" onClose={() => setShowMovementModal(false)}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-royal-100 bg-royal-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-royal-600 shadow-sm">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-navy-900">Novo movimento auditável</p>
                  <p className="mt-1 text-sm text-gray-600">O lançamento entra no extrato e passa a compor o saldo acumulado da empresa.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-1.5">
              {(["income", "expense"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setMovementForm((previous) => ({ ...previous, type, category: type === "income" ? "Venda" : "Despesa operacional" }))}
                  className={cn("rounded-xl px-3 py-2.5 text-sm font-semibold transition", movementForm.type === type ? "bg-white text-navy-900 shadow-sm" : "text-gray-500 hover:text-navy-900")}
                >
                  {type === "income" ? "Entrada" : "Saída"}
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Categoria" value={movementForm.category} onChange={(value) => setMovementForm((previous) => ({ ...previous, category: value }))} options={(movementForm.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((item) => [item, item])} />
                <Input label="Valor" value={movementForm.amount} onChange={(event) => setMovementForm((previous) => ({ ...previous, amount: formatCurrencyInput(event.target.value) }))} />
                <Input label="Data" type="date" value={movementForm.date} onChange={(event) => setMovementForm((previous) => ({ ...previous, date: event.target.value }))} />
                <SelectField label="Forma de pagamento" value={movementForm.payment_method} onChange={(value) => setMovementForm((previous) => ({ ...previous, payment_method: value }))} options={PAYMENT_METHODS.map((item) => [item, item])} />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-surface p-4">
                <p className="text-xs font-semibold uppercase text-gray-400">Impacto no saldo</p>
                <p className="mt-3 text-sm text-gray-500">Saldo atual</p>
                <p className="text-lg font-bold text-navy-900">{formatBRL(currentBalance)}</p>
                <p className="mt-3 text-sm text-gray-500">Após lançamento</p>
                <p className={cn("text-2xl font-bold", movementForm.type === "income" ? "text-emerald-600" : "text-red-600")}>{formatBRL(currentBalance + (movementForm.type === "income" ? parseCurrencyInput(movementForm.amount) : -parseCurrencyInput(movementForm.amount)))}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Conta" value={movementForm.account_id} onChange={(value) => setMovementForm((previous) => ({ ...previous, account_id: value }))} options={[["", "Sem conta vinculada"], ...accounts.map((account) => [account.id, account.name] as [string, string])]} />
              <Input label="Descrição" value={movementForm.description} onChange={(event) => setMovementForm((previous) => ({ ...previous, description: event.target.value }))} />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-900">Observação opcional</span>
              <textarea value={movementForm.notes} onChange={(event) => setMovementForm((previous) => ({ ...previous, notes: event.target.value }))} className="h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20" />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowMovementModal(false)}>Cancelar</Button>
              <Button onClick={createMovement} isLoading={submitting}>Salvar movimentação</Button>
            </div>
          </div>
        </Modal>
      )}

      {showAdjustmentModal && (
        <Modal title="Corrigir saldo" onClose={() => setShowAdjustmentModal(false)}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">Correção manual é auditada</p>
                  <p className="mt-1 text-sm text-amber-800">Ela não altera movimentos antigos. O sistema criará um novo lançamento chamado “Correção manual de saldo”.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ReadOnlyBox label="Saldo do sistema" value={formatBRL(currentBalance)} />
              <div className="rounded-xl border border-gray-100 bg-white p-3">
                <Input label="Saldo real informado" value={adjustmentForm.targetBalance} onChange={(event) => { setConfirmAdjustment(false); setAdjustmentForm((previous) => ({ ...previous, targetBalance: formatCurrencyInput(event.target.value) })) }} />
              </div>
              <div className="rounded-xl border border-gray-100 bg-surface p-3">
                <p className="text-xs font-semibold uppercase text-gray-400">Diferença calculada</p>
                <p className={cn("mt-2 text-2xl font-bold", adjustmentPreview.difference >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {adjustmentPreview.difference >= 0 ? "+" : "-"}{formatBRL(Math.abs(adjustmentPreview.difference))}
                </p>
              </div>
            </div>

            <Input label="Motivo da correção (obrigatório)" value={adjustmentForm.reason} onChange={(event) => { setConfirmAdjustment(false); setAdjustmentForm((previous) => ({ ...previous, reason: event.target.value })) }} placeholder="Ex: Ajuste conforme saldo real da conta bancária" />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-navy-900">Observação opcional</span>
              <textarea value={adjustmentForm.notes} onChange={(event) => setAdjustmentForm((previous) => ({ ...previous, notes: event.target.value }))} className="h-20 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20" />
            </label>
            <div className="grid gap-3 rounded-2xl border border-gray-100 bg-surface p-4 sm:grid-cols-3">
              <ReadOnlyBox label="Origem" value="manual_balance_adjustment" />
              <ReadOnlyBox label="Descrição" value="Correção manual de saldo" />
              <ReadOnlyBox label="Saldo final" value={formatBRL(adjustmentPreview.target)} />
            </div>
            {confirmAdjustment && (
              <div className="rounded-2xl border border-royal-200 bg-royal-50 p-4 text-sm text-navy-900">
                Você está prestes a ajustar o saldo do sistema de <b>{formatBRL(currentBalance)}</b> para <b>{formatBRL(adjustmentPreview.target)}</b>. Será criada uma movimentação de correção manual no valor de <b>{adjustmentPreview.difference >= 0 ? "+" : "-"}{formatBRL(Math.abs(adjustmentPreview.difference))}</b>. Essa ação ficará registrada no histórico.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAdjustmentModal(false)}>Cancelar</Button>
              <Button onClick={createAdjustment} isLoading={submitting}>{confirmAdjustment ? "Confirmar correção" : "Revisar correção"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {reversalTarget && (
        <Modal title="Estornar movimentação" onClose={() => setReversalTarget(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
              O lançamento original será mantido no histórico e um <strong>movimento de estorno</strong> será criado. Nada será apagado definitivamente.
            </div>
            <ReadOnlyBox label="Lançamento" value={reversalTarget.description} />
            <ReadOnlyBox label="Valor do estorno" value={`${reversalTarget.amount >= 0 ? "-" : "+"}${formatBRL(Math.abs(reversalTarget.amount))}`} />
            <Input label="Motivo do estorno" value={reversalTarget.canceled_reason || ""} onChange={(event) => setReversalTarget((previous) => previous ? { ...previous, canceled_reason: event.target.value } : previous)} placeholder="Ex: lançamento duplicado" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReversalTarget(null)}>Cancelar</Button>
              <Button variant="danger" onClick={createReversal} isLoading={submitting}>Confirmar estorno</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MetricCard({ title, value, hint, detail, icon: Icon, tone }: { title: string; value: string; hint: string; detail: string; icon: LucideIcon; tone: "navy" | "green" | "red" | "blue" }) {
  const toneClass = {
    navy: "bg-navy-900 text-white",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-royal-50 text-royal-600",
  }[tone]
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", toneClass)}><Icon className="h-[18px] w-[18px]" /></div>
      </div>
      <p className="text-xl font-bold leading-tight text-navy-900 tabular-nums">{value}</p>
      <p className="mt-2 text-xs font-medium text-gray-400">{detail}</p>
    </Card>
  )
}

function SelectField({ label, value, onChange, options }: { label?: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-navy-900">{label}</span>}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20">
        {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
      />
    </label>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-400 hover:bg-gray-50 hover:text-navy-900">Fechar</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ReadOnlyBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-surface p-3">
      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
      <p className="mt-1 font-bold text-navy-900">{value}</p>
    </div>
  )
}

function EmptyState({ onAdd, onClear, hasFilters }: { onAdd: () => void; onClear: () => void; hasFilters: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto max-w-md rounded-3xl border border-dashed border-royal-200 bg-royal-50/40 p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-royal-600 shadow-sm">
          <Landmark className="h-7 w-7" />
        </div>
        <p className="font-display text-lg font-bold text-navy-900 font-syne">Nenhum movimento encontrado</p>
        <p className="mt-2 text-sm text-gray-500">Adicione uma movimentação ao extrato ou ajuste os filtros para ampliar a consulta.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Adicionar movimentação</Button>
          <Button size="sm" variant="outline" onClick={onClear} disabled={!hasFilters}><Eraser className="h-4 w-4" /> Ajustar filtros</Button>
        </div>
      </div>
    </div>
  )
}
