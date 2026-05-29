"use client"

import { useEffect, useRef, useState, type Key as ReactKey, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { daysBetween, formatBRL, getProductName } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import { getInventoryCapitalValue, getInventoryQuantity, getInventoryUnitCost } from "@/lib/inventory/costing"
import { isValidCommercialSale, isCommercialSale } from "@/lib/finance/finance-source-of-truth"
import {
  DollarSign,
  Package,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ShoppingCart,
  Percent,
  Loader2,
  Clock3,
  TimerReset,
  PackageSearch,
  Gauge,
  Activity,
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  Sparkles,
  CalendarDays,
  Target,
  Rocket,
  Trophy,
  Info,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts"
import Link from "next/link"
import { OperationalAlertsCard } from "@/components/notifications/notification-bell"

const CATEGORY_COLORS: Record<string, string> = {
  iPhone: "#3B82F6", // Royal Blue
  iPad: "#10B981", // Emerald
  "Apple Watch": "#F59E0B", // Amber
  AirPods: "#EF4444", // Rose
  MacBook: "#8B5CF6", // Violet
  Garmin: "#06B6D4", // Cyan
  Outros: "#64748B", // Slate
}

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
const CACHE_KEY = "dashboard_data_v6"
const CACHE_TTL = 3 * 60 * 1000 // 3 minutos

type DashboardPeriodPreset = "current_month" | "previous_month" | "last_30_days" | "custom"

function ChartSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full animate-pulse items-end gap-2 rounded-2xl bg-slate-50/80 p-4">
      <div className="h-[24%] flex-1 rounded-t-xl bg-slate-200/70" />
      <div className="h-[44%] flex-1 rounded-t-xl bg-slate-200/70" />
      <div className="h-[62%] flex-1 rounded-t-xl bg-slate-200/70" />
      <div className="h-[38%] flex-1 rounded-t-xl bg-slate-200/70" />
      <div className="h-[72%] flex-1 rounded-t-xl bg-slate-200/70" />
      <div className="h-[52%] flex-1 rounded-t-xl bg-slate-200/70" />
      <div className="h-[66%] flex-1 rounded-t-xl bg-slate-200/70" />
    </div>
  )
}

type ChartSize = { width: number; height: number }

function LazyChart({ children, className, fallback }: { children: ReactNode | ((size: ChartSize) => ReactNode); className: string; fallback?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 })

  useEffect(() => {
    let frame = 0
    let resizeFrame = 0

    const checkSize = () => {
      const element = containerRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const nextSize = {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      }
      if (nextSize.width > 0 && nextSize.height > 0) {
        setSize(nextSize)
        setReady(true)
      }
    }

    frame = requestAnimationFrame(checkSize)
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame)
          resizeFrame = requestAnimationFrame(checkSize)
        })
      : null

    if (containerRef.current && observer) {
      observer.observe(containerRef.current)
    }

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(resizeFrame)
      observer?.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className={className}>
      {ready ? (typeof children === "function" ? children(size) : children) : fallback ?? <ChartSkeleton />}
    </div>
  )
}

const DASHBOARD_PERIOD_OPTIONS: Array<{ label: string; value: DashboardPeriodPreset }> = [
  { label: "Este mês", value: "current_month" },
  { label: "Mês passado", value: "previous_month" },
  { label: "Últimos 30 dias", value: "last_30_days" },
  { label: "Personalizado", value: "custom" },
]

type SalesComparisonPoint = {
  label: string
  gross: number
  net: number
}

type MonthRhythmPoint = {
  day: number
  currentRevenue: number | null
  currentProfit: number | null
  previousRevenue: number | null
  previousProfit: number | null
}

type RhythmSaleRow = {
  sale_price?: number | null
  net_amount?: number | null
  sale_date?: string | null
  created_at?: string | null
  source_type?: string | null
  sale_status?: string | null
  supplier_cost?: number | null
  notes?: string | null
  inventory?: { purchase_price?: number | null; type?: string | null } | null
  sales_additional_items?: unknown
}

type MonthRhythmData = {
  points: MonthRhythmPoint[]
  currentMonthLabel: string
  previousMonthLabel: string
  currentDay: number
  daysInCurrentMonth: number
  daysInPreviousMonth: number
  currentAccumRevenue: number
  currentAccumProfit: number
  previousAccumAtSameDayRevenue: number
  previousAccumAtSameDayProfit: number
  previousTotalRevenue: number
  previousTotalProfit: number
  bestDay: { day: number; revenue: number; profit: number } | null
}

type StockTurnoverItem = {
  id: string
  name: string
  category: string
  days: number
  quantity: number
  unitCost: number
  value: number
  suggested: number
  tone: "healthy" | "watch" | "stuck"
}

type StockTurnoverSummary = {
  avgActiveDays: number
  avgSoldDays: number
  stuckCount: number
  stuckValue: number
  watchCount: number
  fastestLabel: string
  fastestDays: number
  priorityItems: StockTurnoverItem[]
}

const EMPTY_TURNOVER_SUMMARY: StockTurnoverSummary = {
  avgActiveDays: 0,
  avgSoldDays: 0,
  stuckCount: 0,
  stuckValue: 0,
  watchCount: 0,
  fastestLabel: "Sem histórico",
  fastestDays: 0,
  priorityItems: [],
}

function turnoverTone(days: number): StockTurnoverItem["tone"] {
  if (days >= 45) return "stuck"
  if (days >= 20) return "watch"
  return "healthy"
}

function turnoverBadge(tone: StockTurnoverItem["tone"]) {
  if (tone === "stuck") return { label: "Girar agora", className: "bg-danger-100 text-danger-700" }
  if (tone === "watch") return { label: "Monitorar", className: "bg-warning-100 text-warning-700" }
  return { label: "Saudável", className: "bg-success-100 text-success-700" }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} min atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  const days = Math.floor(hrs / 24)
  return `${days} dia${days > 1 ? "s" : ""} atrás`
}

function saleCustomerLabel(sale: { customer_type?: string | null; walk_in_label?: string | null; customer?: { full_name?: string | null } | null }) {
  if (sale.customer_type === "walk_in") return sale.walk_in_label || "Cliente avulso"
  return sale.customer?.full_name || "Cliente"
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getPresetRange(preset: DashboardPeriodPreset) {
  const today = new Date()

  if (preset === "previous_month") {
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return {
      start: dateKey(previousMonth),
      end: dateKey(new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0)),
    }
  }

  if (preset === "last_30_days") {
    return {
      start: dateKey(addDays(today, -29)),
      end: dateKey(today),
    }
  }

  return {
    start: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: dateKey(today),
  }
}

function normalizeDateRange(start: string, end: string) {
  const fallback = getPresetRange("current_month")
  const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : fallback.start
  const safeEnd = /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : fallback.end

  return safeStart <= safeEnd
    ? { start: safeStart, end: safeEnd }
    : { start: safeEnd, end: safeStart }
}

function formatDateBR(date: string) {
  const [year, month, day] = date.split("-")
  if (!year || !month || !day) return date
  return `${day}/${month}/${year}`
}

function formatPeriodLabel(start: string, end: string) {
  if (start === end) return formatDateBR(start)
  return `${formatDateBR(start)} até ${formatDateBR(end)}`
}

function saleDateDayLabel(saleDate?: string, createdAt?: string) {
  if (saleDate && /^\d{4}-\d{2}-\d{2}/.test(saleDate)) return saleDate.slice(8, 10)
  return String(new Date(createdAt || Date.now()).getDate()).padStart(2, "0")
}

function isCompletedSale(sale: { sale_status?: string | null }) {
  return isValidCommercialSale({ sale_status: sale.sale_status || "completed" })
}

type DashboardTone = "navy" | "green" | "blue" | "yellow" | "red" | "gray"

const toneClasses: Record<DashboardTone, { card: string; icon: string; iconText: string; value: string }> = {
  navy: {
    card: "bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white border-transparent",
    icon: "bg-white/10",
    iconText: "text-white/85",
    value: "text-white",
  },
  green: {
    card: "bg-white border-gray-100",
    icon: "bg-success-100",
    iconText: "text-success-600",
    value: "text-navy-900",
  },
  blue: {
    card: "bg-white border-gray-100",
    icon: "bg-royal-100",
    iconText: "text-royal-600",
    value: "text-navy-900",
  },
  yellow: {
    card: "bg-white border-gray-100",
    icon: "bg-warning-100",
    iconText: "text-warning-600",
    value: "text-navy-900",
  },
  red: {
    card: "bg-white border-gray-100",
    icon: "bg-danger-100",
    iconText: "text-danger-600",
    value: "text-navy-900",
  },
  gray: {
    card: "bg-white border-gray-100",
    icon: "bg-gray-100",
    iconText: "text-gray-500",
    value: "text-navy-900",
  },
}

function MonthRhythmBlock({ data, mode, onChangeMode }: { data: MonthRhythmData | null; mode: "revenue" | "profit"; onChangeMode: (m: "revenue" | "profit") => void }) {
  if (!data) {
    return (
      <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Radar de ritmo comercial</p>
        <p className="mt-3 text-sm text-gray-400 text-center py-10">Sem dados suficientes para comparar mês atual com mês anterior.</p>
      </div>
    )
  }

  const isRevenue = mode === "revenue"
  const currentAccum = isRevenue ? data.currentAccumRevenue : data.currentAccumProfit
  const previousAtSameDay = isRevenue ? data.previousAccumAtSameDayRevenue : data.previousAccumAtSameDayProfit
  const previousTotal = isRevenue ? data.previousTotalRevenue : data.previousTotalProfit
  const diff = currentAccum - previousAtSameDay
  const ratePct = previousAtSameDay > 0
    ? Math.round((diff / previousAtSameDay) * 1000) / 10
    : currentAccum > 0 ? 100 : 0
  const projection = data.currentDay > 0
    ? Math.round((currentAccum / data.currentDay) * data.daysInCurrentMonth)
    : 0
  const projectionSurplus = projection - previousTotal
  const remainingToBeatPrevious = Math.max(0, previousTotal - currentAccum)
  const remainingDays = Math.max(1, data.daysInCurrentMonth - data.currentDay)
  const dailyRateToBeat = remainingToBeatPrevious / remainingDays
  const status: "above" | "below" | "neutral" = diff > 0 ? "above" : diff < 0 ? "below" : "neutral"
  const bestDay = data.bestDay
  const bestValue = bestDay ? (isRevenue ? bestDay.revenue : bestDay.profit) : 0
  const currentMonthShort = data.currentMonthLabel.split(" ")[0]
  const previousMonthShort = data.previousMonthLabel.split(" ")[0]
  const currentMonthNumber = new Date().getMonth() + 1

  const lineData = data.points.map((p) => ({
    day: p.day,
    current: isRevenue ? p.currentRevenue : p.currentProfit,
    previous: isRevenue ? p.previousRevenue : p.previousProfit,
  }))

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm animate-fade-in">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-syne text-base font-bold text-navy-900">Radar de ritmo comercial</h4>
            <p className="mt-0.5 text-sm text-gray-500">Compare o desempenho acumulado do mês atual com o mês anterior.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
          <div className={`flex max-w-md items-start gap-2 rounded-2xl px-3 py-2 ring-1 ${
            status === "above" ? "bg-emerald-50/60 ring-emerald-100" : status === "below" ? "bg-amber-50/60 ring-amber-100" : "bg-slate-50 ring-slate-100"
          }`}>
            <TrendingUp className={`mt-0.5 h-4 w-4 shrink-0 ${status === "above" ? "text-emerald-600" : status === "below" ? "text-amber-600" : "text-slate-500"}`} />
            <div className="min-w-0">
              <p className={`text-sm font-bold ${status === "above" ? "text-emerald-700" : status === "below" ? "text-amber-700" : "text-slate-700"}`}>
                {status === "above" ? "Acima do mês passado" : status === "below" ? "Atenção · abaixo do mês passado" : "Empatando com o mês passado"}
              </p>
              <p className="text-[11px] leading-tight text-gray-500">
                Você está {Math.abs(ratePct).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% {status === "above" ? "acima" : status === "below" ? "abaixo" : "no mesmo nível"} de {previousMonthShort} no mesmo dia do mês.
              </p>
            </div>
          </div>
          <div className="flex rounded-full bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => onChangeMode("revenue")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${isRevenue ? "bg-navy-900 text-white shadow-sm" : "text-gray-500 hover:text-navy-900"}`}
            >Receita</button>
            <button
              type="button"
              onClick={() => onChangeMode("profit")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${!isRevenue ? "bg-navy-900 text-white shadow-sm" : "text-gray-500 hover:text-navy-900"}`}
            >Lucro</button>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <RhythmMetric
          icon={CalendarDays}
          iconTone="blue"
          label="Dia do mês"
          value={String(data.currentDay)}
          sub={`de ${data.daysInCurrentMonth}`}
        />
        <RhythmMetric
          icon={Activity}
          iconTone="emerald"
          label="Atual acumulado"
          value={formatBRL(currentAccum)}
          sub={data.currentMonthLabel}
        />
        <RhythmMetric
          icon={CalendarDays}
          iconTone="slate"
          label={`${previousMonthShort} no mesmo dia`}
          value={formatBRL(previousAtSameDay)}
          sub={data.previousMonthLabel}
        />
        <RhythmMetric
          icon={TrendingUp}
          iconTone={status === "above" ? "emerald" : status === "below" ? "rose" : "slate"}
          label="Diferença"
          value={`${diff >= 0 ? "+" : ""}${formatBRL(diff)}`}
          sub={`${ratePct >= 0 ? "+" : ""}${ratePct}%`}
          subTone={status === "above" ? "emerald" : status === "below" ? "rose" : "slate"}
        />
        <RhythmMetric
          icon={Rocket}
          iconTone="royal"
          label="Projeção do mês"
          value={formatBRL(projection)}
          sub="Se mantiver o ritmo"
        />
      </div>

      {/* Chart + insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <LazyChart className="relative h-[280px] min-w-0 rounded-2xl border border-slate-100 bg-white p-2">
          {({ width, height }) => (
            <>
            <LineChart width={width} height={height} data={lineData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rhythmFutureFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.45} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={42}
              />
              <Tooltip
                cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null
                  const current = payload.find((p) => p.dataKey === "current")?.value as number | null | undefined
                  const previous = payload.find((p) => p.dataKey === "previous")?.value as number | null | undefined
                  const tipDiff = (current ?? 0) - (previous ?? 0)
                  const tipRate = (previous ?? 0) > 0
                    ? Math.round((tipDiff / (previous as number)) * 1000) / 10
                    : null
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-md">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dia</p>
                      <p className="text-lg font-bold text-navy-900 leading-none">{label}</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-500">{currentMonthShort}</span>
                          <span className="font-semibold tabular-nums text-emerald-600">{current != null ? formatBRL(current) : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-500">{previousMonthShort}</span>
                          <span className="font-semibold tabular-nums text-slate-500">{previous != null ? formatBRL(previous) : "—"}</span>
                        </div>
                      </div>
                      {current != null && previous != null && (
                        <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 pt-2">
                          <span className="text-gray-500">Ritmo</span>
                          <span className={`font-bold tabular-nums ${tipDiff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {tipDiff >= 0 ? "+" : ""}{formatBRL(tipDiff)}{tipRate != null ? ` · ${tipRate >= 0 ? "+" : ""}${tipRate}%` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              <ReferenceLine
                y={previousTotal}
                stroke="#f59e0b"
                strokeDasharray="4 6"
                strokeOpacity={0.35}
                label={{
                  value: `Fechamento ${previousMonthShort} (${formatBRL(previousTotal)})`,
                  position: "insideTopLeft",
                  fill: "#d97706",
                  fontSize: 10,
                  fontWeight: 500,
                  fillOpacity: 0.75,
                  offset: 10,
                }}
              />
              {data.currentDay < data.daysInCurrentMonth && (
                <ReferenceLine
                  x={data.currentDay}
                  stroke="#cbd5e1"
                  strokeDasharray="2 3"
                  strokeOpacity={0.6}
                />
              )}
              <Line
                type="monotone"
                dataKey="previous"
                stroke="#94a3b8"
                strokeWidth={1.8}
                strokeDasharray="5 4"
                strokeOpacity={0.85}
                dot={false}
                activeDot={{ r: 4, fill: "#64748b" }}
                isAnimationActive
                animationDuration={700}
                connectNulls={false}
                name={`${previousMonthShort} acumulado`}
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="#10b981"
                strokeWidth={2.6}
                dot={(dotProps: { cx?: number; cy?: number; payload?: { day?: number }; key?: ReactKey | null }) => {
                  const { cx, cy, payload, key } = dotProps
                  if (!payload || cx == null || cy == null || payload.day !== data.currentDay) {
                    return <g key={key ?? undefined} />
                  }
                  return (
                    <g key={key ?? undefined}>
                      <circle cx={cx} cy={cy} r={6} fill="#10b981" fillOpacity={0.35}>
                        <animate attributeName="r" values="6;14;6" dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={cx} cy={cy} r={4.5} fill="#059669" stroke="#ffffff" strokeWidth={2.5} />
                    </g>
                  )
                }}
                activeDot={{ r: 5, fill: "#059669", stroke: "#a7f3d0", strokeWidth: 3 }}
                isAnimationActive
                animationDuration={900}
                connectNulls={false}
                name={`${currentMonthShort} acumulado`}
                fill="url(#rhythmFutureFill)"
              />
            </LineChart>
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">
                <span className="h-1.5 w-3 rounded-full bg-emerald-500" /> {currentMonthShort} acumulado
              </span>
              <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-100">
                <span className="h-1.5 w-3 rounded-full bg-slate-400" style={{ backgroundImage: "repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 7px)" }} /> {previousMonthShort} acumulado
              </span>
              <span className="flex items-center gap-1 rounded-full bg-amber-50/80 px-2 py-0.5 text-amber-700 ring-1 ring-amber-100">
                <span className="h-1.5 w-3 rounded-full bg-amber-500" style={{ backgroundImage: "repeating-linear-gradient(90deg, #f59e0b 0 4px, transparent 4px 7px)" }} /> Fechamento {previousMonthShort}
              </span>
            </div>
            </>
          )}
        </LazyChart>

        {/* Insights column */}
        <div className="grid grid-cols-1 gap-2.5 lg:h-[280px] lg:grid-rows-3">
          <InsightCard
            icon={TrendingUp}
            tone={status === "above" ? "emerald" : status === "below" ? "amber" : "slate"}
            title={`${currentMonthShort} está ${formatBRL(Math.abs(diff))} ${status === "above" ? "acima" : status === "below" ? "abaixo" : "no mesmo nível"} de ${previousMonthShort} no dia ${data.currentDay}.`}
            sub={`Ritmo: ${ratePct >= 0 ? "+" : ""}${ratePct}%`}
          />
          <InsightCard
            icon={Target}
            tone="amber"
            title={remainingToBeatPrevious > 0
              ? `Para superar ${previousMonthShort} (${formatBRL(previousTotal)}), faltam ${formatBRL(remainingToBeatPrevious)} em ${remainingDays} dia(s).`
              : `${currentMonthShort} já superou ${previousMonthShort} (${formatBRL(previousTotal)}).`}
            sub={remainingToBeatPrevious > 0 ? `Média necessária: ${formatBRL(Math.ceil(dailyRateToBeat))}/dia.` : `Excedente atual: ${formatBRL(currentAccum - previousTotal)}.`}
          />
          <InsightCard
            icon={Trophy}
            tone="violet"
            title="Melhor dia do mês"
            sub={bestDay && bestValue > 0
              ? `${String(bestDay.day).padStart(2, "0")}/${String(currentMonthNumber).padStart(2, "0")} · ${formatBRL(bestValue)} ${isRevenue ? "de receita" : "de lucro"}`
              : "Sem dia destacado ainda."}
          />
        </div>
      </div>

      {/* Executive strip */}
      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-royal-100/70 bg-royal-50/50 px-3 py-2.5 text-[12px] leading-relaxed text-royal-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-royal-500" />
        <p>
          {projection > 0
            ? <>Se mantiver o ritmo atual, a projeção é fechar {currentMonthShort} em <strong className="tabular-nums">{formatBRL(projection)}</strong>{projectionSurplus > 0
                ? <>, superando {previousMonthShort} em <strong className="tabular-nums text-emerald-700">{formatBRL(projectionSurplus)}</strong> ({Math.round((projectionSurplus / Math.max(1, previousTotal)) * 100)}%).</>
                : projectionSurplus < 0
                ? <>, ficando <strong className="tabular-nums text-rose-600">{formatBRL(Math.abs(projectionSurplus))}</strong> abaixo de {previousMonthShort}.</>
                : <>, empatando com {previousMonthShort}.</>}</>
            : <>Sem projeção disponível para {currentMonthShort} — aguarde mais movimentações no mês.</>}
        </p>
      </div>
    </div>
  )
}

function RhythmMetric({ icon: Icon, iconTone, label, value, sub, subTone }: {
  icon: React.ComponentType<{ className?: string }>
  iconTone: "emerald" | "slate" | "rose" | "blue" | "royal" | "amber"
  label: string
  value: string
  sub: string
  subTone?: "emerald" | "rose" | "slate"
}) {
  const iconClass =
    iconTone === "emerald" ? "bg-emerald-50 text-emerald-600 ring-emerald-100" :
    iconTone === "rose" ? "bg-rose-50 text-rose-600 ring-rose-100" :
    iconTone === "blue" ? "bg-sky-50 text-sky-600 ring-sky-100" :
    iconTone === "royal" ? "bg-royal-50 text-royal-600 ring-royal-100" :
    iconTone === "amber" ? "bg-amber-50 text-amber-600 ring-amber-100" :
    "bg-slate-100 text-slate-600 ring-slate-200"
  const subClass =
    subTone === "emerald" ? "text-emerald-600" :
    subTone === "rose" ? "text-rose-600" :
    subTone === "slate" ? "text-slate-500" :
    "text-gray-500"
  return (
    <div className="group min-w-0 rounded-2xl border border-slate-200/70 bg-white px-3 py-3 transition-all duration-200 hover:-translate-y-px hover:shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-tight text-gray-500">{label}</p>
          <p className="mt-1 break-words text-base font-bold tabular-nums text-navy-900 sm:text-[17px]">{value}</p>
          <p className={`mt-0.5 text-[11px] font-medium ${subClass}`}>{sub}</p>
        </div>
      </div>
    </div>
  )
}

function InsightCard({ icon: Icon, tone, title, sub }: {
  icon: React.ComponentType<{ className?: string }>
  tone: "emerald" | "amber" | "violet" | "slate"
  title: string
  sub: string
}) {
  const iconClass =
    tone === "emerald" ? "bg-emerald-50 text-emerald-600 ring-emerald-100" :
    tone === "amber" ? "bg-amber-50 text-amber-600 ring-amber-100" :
    tone === "violet" ? "bg-violet-50 text-violet-600 ring-violet-100" :
    "bg-slate-100 text-slate-600 ring-slate-200"
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200/70 bg-white px-3 py-2.5 transition-colors duration-200 hover:bg-slate-50/50">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold leading-snug text-navy-900">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{sub}</p>
      </div>
    </div>
  )
}

function DashboardMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "blue",
  status,
  statusTone,
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof DollarSign
  tone?: DashboardTone
  status?: string
  statusTone?: "green" | "yellow" | "red" | "blue" | "gray"
}) {
  const classes = toneClasses[tone]
  const muted = tone === "navy" ? "text-white/60" : "text-gray-500"
  const label = tone === "navy" ? "text-white/55" : "text-gray-400"
  const statusClass =
    statusTone === "green" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" :
    statusTone === "yellow" ? "bg-amber-50 text-amber-700 ring-amber-100" :
    statusTone === "red" ? "bg-rose-50 text-rose-700 ring-rose-100" :
    statusTone === "blue" ? "bg-sky-50 text-sky-700 ring-sky-100" :
    "bg-slate-50 text-slate-600 ring-slate-100"

  return (
    <div className={`group min-w-0 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md ${classes.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider ${label}`}>{title}</p>
          <p className={`mt-3 break-words text-xl font-semibold leading-tight tracking-normal tabular-nums sm:text-2xl ${classes.value}`}>
            {value}
          </p>
          <p className={`mt-2 text-xs leading-snug ${muted}`}>{subtitle}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${classes.icon}`}>
          <Icon className={`h-5 w-5 ${classes.iconText}`} />
        </div>
      </div>
      {status && (
        <div className="mt-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${statusClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {status}
          </span>
        </div>
      )}
    </div>
  )
}

function RuleDisclosure({ title = "Entenda esta recomendação", children, tone = "slate" }: { title?: string; children: ReactNode; tone?: "slate" | "white" | "navy" }) {
  const summaryToneClass =
    tone === "navy"
      ? "border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:ring-white/30"
    : tone === "white"
      ? "border-slate-200 bg-white text-gray-500 hover:border-slate-300 hover:text-navy-900 focus-visible:ring-royal-200"
      : "border-slate-200 bg-white text-gray-500 hover:border-slate-300 hover:text-navy-900 focus-visible:ring-royal-200"
  const titleToneClass =
    tone === "navy"
      ? "text-white"
      : "text-navy-900"
  const panelToneClass =
    tone === "navy"
      ? "border-white/10 bg-white/5 text-white/80"
      : "border-slate-200 bg-white text-gray-600"
  return (
    <details className="group relative">
      <summary
        aria-label="Entenda esta recomendação"
        title="Entenda esta recomendação"
        className={`list-none cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold shadow-sm transition-all hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden ${summaryToneClass}`}
      >
        <Info className="h-3.5 w-3.5" />
      </summary>
      <div className={`mt-2 rounded-xl border p-3 text-[12px] leading-relaxed shadow-sm ${panelToneClass}`}>
        <p className={`mb-2 text-[11px] font-bold uppercase tracking-[0.08em] ${titleToneClass}`}>{title}</p>
        {children}
      </div>
    </details>
  )
}

function suggestReprice({ cost, currentPrice, days }: { cost: number; currentPrice: number; days: number }): { proposed: number; discountPct: number; newMarginPct: number } | null {
  if (!currentPrice || currentPrice <= 0 || !cost || cost <= 0) return null
  let discountPct = 0
  if (days >= 45) discountPct = 0.08
  else if (days >= 30) discountPct = 0.05
  else if (days >= 15) discountPct = 0.025
  else return null
  let proposed = currentPrice * (1 - discountPct)
  proposed = Math.round(proposed / 10) * 10
  const minPrice = Math.ceil(cost * 1.08 / 10) * 10
  if (proposed < minPrice) {
    if (currentPrice <= minPrice) return null
    proposed = minPrice
  }
  if (proposed >= currentPrice) return null
  const newMarginPct = ((proposed - cost) / proposed) * 100
  if (newMarginPct < 8) return null
  return {
    proposed,
    discountPct: Math.round(discountPct * 1000) / 10,
    newMarginPct: Math.round(newMarginPct * 10) / 10,
  }
}

function PulsoDaLoja({ healthTone, healthLabel, periodSales, periodProfit, periodAvgMargin, monthRhythm, stuckCount, stuckValue, problemsCount, warrantiesCount }: {
  healthTone: "green" | "yellow" | "red"
  healthLabel: string
  periodSales: number
  periodProfit: number
  periodAvgMargin: number
  monthRhythm: MonthRhythmData | null
  stuckCount: number
  stuckValue: number
  problemsCount: number
  warrantiesCount: number
}) {
  const rhythmDiff = monthRhythm
    ? monthRhythm.currentAccumRevenue - monthRhythm.previousAccumAtSameDayRevenue
    : 0
  const rhythmRate = monthRhythm && monthRhythm.previousAccumAtSameDayRevenue > 0
    ? Math.round((rhythmDiff / monthRhythm.previousAccumAtSameDayRevenue) * 1000) / 10
    : 0
  const previousMonthShort = monthRhythm?.previousMonthLabel.split(" ")[0] ?? "mês anterior"
  const ringBg =
    healthTone === "green" ? "bg-emerald-50 ring-emerald-100/70 text-emerald-600" :
    healthTone === "yellow" ? "bg-amber-50 ring-amber-100/70 text-amber-600" :
    "bg-rose-50 ring-rose-100/70 text-rose-600"

  const hasCriticalCommercial = periodProfit < 0 || (periodAvgMargin <= 0 && periodSales > 0)
  const hasMarginRisk = periodAvgMargin > 0 && periodAvgMargin < 5
  const hasRhythmRisk = rhythmDiff < 0
  const hasPostSaleRisk = warrantiesCount > 0 || problemsCount > 0
  const hasStockRisk = stuckCount > 0

  const headlineText =
    hasCriticalCommercial
      ? "Crítico: resultado comercial exige ação imediata."
    : hasStockRisk && rhythmDiff > 0
      ? "Ritmo forte, com atenção ao estoque parado."
    : hasMarginRisk
      ? "Vendas saudáveis, mas margem está apertada."
    : hasRhythmRisk
      ? "Atenção: vendas abaixo do mês anterior."
    : healthTone === "green" && rhythmDiff > 0 && hasPostSaleRisk
      ? "Ritmo forte, com atenção ao pós-venda."
    : healthTone === "green" && rhythmDiff > 0
      ? "Ritmo forte de vendas com lucro saudável."
    : healthTone === "green"
      ? "Operação saudável. Sem alertas críticos no momento."
    : "Indicadores pedem monitoramento próximo."

  const rhythmStr = `${rhythmRate >= 0 ? "+" : ""}${rhythmRate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

  const risks: Array<{ text: ReactNode; cta?: { label: string; href: string }; weight: number }> = []
  if (hasCriticalCommercial) risks.push({ text: <><strong>{formatBRL(periodProfit)}</strong> de resultado negativo no período.</>, cta: { label: "Ver financeiro", href: "/financeiro" }, weight: 100 })
  if (hasStockRisk) risks.push({ text: <><strong>{stuckCount} item(ns)</strong> parados <strong>+45 dias</strong> travando <strong>{formatBRL(stuckValue)}</strong> em estoque.</>, cta: { label: "Ver estoque", href: "/estoque" }, weight: 80 })
  if (problemsCount > 0) risks.push({ text: <><strong>{problemsCount} problema(s)</strong> ativo(s) na assistência.</>, cta: { label: "Ver problemas", href: "/problemas" }, weight: 70 })
  if (hasMarginRisk) risks.push({ text: <>Margem apertada em <strong>{periodAvgMargin}%</strong>. Avaliar mix.</>, cta: { label: "Ver financeiro", href: "/financeiro" }, weight: 60 })
  if (warrantiesCount > 0) risks.push({ text: <><strong>{warrantiesCount} garantia(s)</strong> vencendo em <strong>30 dias</strong>.</>, cta: { label: "Ver garantias", href: "/garantias" }, weight: 40 })
  risks.sort((a, b) => b.weight - a.weight)

  const opps: ReactNode[] = []
  if (rhythmDiff > 0) opps.push(<>Mês atual <strong>{formatBRL(rhythmDiff)} acima</strong> de <strong>{previousMonthShort}</strong> no mesmo dia.</>)
  if (periodProfit > 0 && periodAvgMargin >= 10) opps.push(<>Lucro saudável: <strong>{formatBRL(periodProfit)}</strong> com margem <strong>{periodAvgMargin}%</strong>.</>)
  if (periodSales > 0 && rhythmDiff >= 0 && opps.length === 0) opps.push(<>Receita acumulada: <strong>{formatBRL(periodSales)}</strong> no período.</>)

  const primaryRisk = risks[0]?.text ?? <>Sem riscos relevantes mapeados agora.</>
  const primaryOpp = opps[0] ?? <>Continuar gerando vendas para manter o ritmo.</>

  const fallbackOppCta = rhythmDiff > 0 ? { label: "Criar divulgação", href: "/marketing/divulgacao" } : { label: "Ver prioridades", href: "/estoque" }
  const cta = risks[0]?.cta ?? fallbackOppCta

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* LEFT: header + 3 mini stats + CTA */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${ringBg}`}>
                <Activity className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-syne text-lg font-bold text-navy-900">Pulso da loja</h3>
                <Badge variant={healthTone === "green" ? "green" : healthTone === "yellow" ? "yellow" : "red"} className="mt-1">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
                  {healthLabel}
                </Badge>
              </div>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-emerald-50/70 px-3 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100/70 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Atualizado agora
            </span>
          </div>

          <div className="mt-4">
            <p className="text-lg font-semibold text-navy-900">{headlineText}</p>
            <p className="mt-1 text-sm text-gray-500">
              {monthRhythm && rhythmRate !== 0 ? (
                <>Mês atual está <strong className="font-semibold text-navy-700 tabular-nums">{rhythmStr}</strong> {rhythmDiff >= 0 ? "acima" : "abaixo"} de <strong className="font-semibold text-navy-700">{previousMonthShort}</strong> no mesmo dia. Lucro do período: <strong className="font-semibold text-navy-700 tabular-nums">{formatBRL(periodProfit)}</strong>.</>
              ) : (
                <>Comparativo com mês anterior ainda em formação.</>
              )}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PulsoMiniStat label="Vendas no período" value={formatBRL(periodSales)} hint={monthRhythm && rhythmDiff > 0 ? `↑ ${rhythmRate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% vs ${previousMonthShort}` : monthRhythm && rhythmDiff < 0 ? `↓ ${Math.abs(rhythmRate).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% vs ${previousMonthShort}` : "comparativo em formação"} tone={rhythmDiff >= 0 ? "emerald" : "rose"} />
            <PulsoMiniStat label="Lucro no período" value={formatBRL(periodProfit)} hint={`${periodAvgMargin}% de margem`} tone={periodProfit >= 0 ? "emerald" : "rose"} />
            <PulsoMiniStat label={`Ritmo vs ${previousMonthShort}`} value={`${rhythmRate >= 0 ? "+" : ""}${rhythmRate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} hint={rhythmDiff >= 0 ? `Acima de ${previousMonthShort}` : `Abaixo de ${previousMonthShort}`} tone={rhythmDiff >= 0 ? "emerald" : "rose"} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={cta.href}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <RuleDisclosure title="Como o status foi definido">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">O que foi detectado</p>
                  <p className="mt-1">
                    A loja está com status <strong className="text-navy-900">{healthLabel}</strong>, lucro de <strong className="tabular-nums text-navy-900">{formatBRL(periodProfit)}</strong> no período e margem média de <strong className="tabular-nums text-navy-900">{periodAvgMargin}%</strong>.
                    {monthRhythm ? <> O ritmo está <strong className="tabular-nums text-navy-900">{rhythmRate >= 0 ? "+" : ""}{rhythmRate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong> em relação a {previousMonthShort} no mesmo dia.</> : null}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Por que importa</p>
                  <p className="mt-1">
                    {healthTone === "red"
                      ? "Quando lucro ou margem entram em zona crítica, a operação pode vender sem gerar caixa suficiente para sustentar o mês."
                      : healthTone === "yellow"
                      ? "O painel encontrou pontos que ainda não travam a operação, mas já merecem acompanhamento para evitar perda de margem, capital parado ou ruído no pós-venda."
                      : "Os sinais principais estão equilibrados. O foco agora é manter o ritmo comercial e acompanhar oportunidades antes que virem urgência."}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">O que fazer agora</p>
                  <p className="mt-1">
                    {risks.length > 0
                      ? <>Comece pelo risco principal mostrado ao lado: {primaryRisk}</>
                      : <>Use o momento saudável para reforçar divulgação, revisar o mix vencedor e manter o acompanhamento do estoque.</>}
                  </p>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Como o sistema decidiu</p>
                  <p className="mt-1 text-gray-500">
                    O painel combina resultado, margem, ritmo de vendas, estoque parado, problemas em aberto e garantias próximas. Se algum ponto pede ação, o status sobe para atenção ou crítico; se os sinais estão sob controle, fica saudável.
                  </p>
                </div>
              </div>
            </RuleDisclosure>
          </div>
        </div>

        {/* RIGHT: risk + opportunity stacked */}
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-2xl border border-amber-100/70 bg-amber-50/40 p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">Principal risco</p>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-navy-900">{primaryRisk}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/40 p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">Melhor oportunidade</p>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-navy-900">{primaryOpp}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PulsoMiniStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "emerald" | "rose" }) {
  const hintClass = tone === "emerald" ? "text-emerald-600" : "text-rose-600"
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3 transition-colors hover:bg-slate-50/40">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-navy-900">{value}</p>
      <p className={`mt-1 text-[11px] font-medium ${hintClass}`}>{hint}</p>
    </div>
  )
}

function DashboardSection({
  title,
  description,
  icon: Icon,
  children,
  action,
}: {
  title: string
  description: string
  icon: typeof DollarSign
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-100">
            <Icon className="h-5 w-5 text-royal-500" />
          </div>
          <div>
            <h3 className="font-syne font-semibold text-navy-900">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function QuickLinkCard({
  href,
  title,
  subtitle,
  icon: Icon,
  tone,
}: {
  href: string
  title: string
  subtitle: string
  icon: typeof DollarSign
  tone: DashboardTone
}) {
  const classes = toneClasses[tone]
  return (
    <Link href={href} className="group rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:border-royal-200 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${classes.icon}`}>
            <Icon className={`h-5 w-5 ${classes.iconText}`} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-900">{title}</p>
            <p className="truncate text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-royal-500" />
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const initialPeriod = getPresetRange("current_month")
  const [periodPreset, setPeriodPreset] = useState<DashboardPeriodPreset>("current_month")
  const [periodStart, setPeriodStart] = useState(initialPeriod.start)
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end)

  const [totalInvested, setTotalInvested] = useState(0)
  const [periodSales, setPeriodSales] = useState(0)
  const [periodProfit, setPeriodProfit] = useState(0)
  const [periodAvgMargin, setPeriodAvgMargin] = useState(0)

  const [salesChartData, setSalesChartData] = useState<{ month: string; value: number }[]>([])
  const [salesComparisonMode, setSalesComparisonMode] = useState<"day" | "month">("day")
  const [monthRhythm, setMonthRhythm] = useState<MonthRhythmData | null>(null)
  const [rhythmMode, setRhythmMode] = useState<"revenue" | "profit">("revenue")
  const [dailySalesComparison, setDailySalesComparison] = useState<SalesComparisonPoint[]>([])
  const [monthlySalesComparison, setMonthlySalesComparison] = useState<SalesComparisonPoint[]>([])
  const [categoryData, setCategoryData] = useState<{ name: string; value: number; color: string }[]>([])

  const [expiringWarranties, setExpiringWarranties] = useState<
    { customer: string; product: string; days: number }[]
  >([])
  const [openProblems, setOpenProblems] = useState<
    { customer: string; product: string; tag: string; priority: string }[]
  >([])
  const [recentActivity, setRecentActivity] = useState<
    { action: string; detail: string; time: string }[]
  >([])
  const [turnoverSummary, setTurnoverSummary] = useState<StockTurnoverSummary>(EMPTY_TURNOVER_SUMMARY)
  const [stockCount, setStockCount] = useState(0)
  const [warrantiesCount, setWarrantiesCount] = useState(0)
  const [problemsCount, setProblemsCount] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const selectedRange = normalizeDateRange(periodStart, periodEnd)
      const cacheKey = `${CACHE_KEY}:${selectedRange.start}:${selectedRange.end}`

      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL) {
          setTotalInvested(data.totalInvested)
          setPeriodSales(data.periodSales)
          setPeriodProfit(data.periodProfit)
          setPeriodAvgMargin(data.periodAvgMargin)
          setSalesChartData(data.salesChartData)
          const cachedDailyComparison = data.dailySalesComparison || []
          const cachedMonthlyComparison = data.monthlySalesComparison || []
          const hasComparisonData =
            [...cachedDailyComparison, ...cachedMonthlyComparison].some((point: SalesComparisonPoint) => point.gross > 0 || point.net > 0) ||
            !data.periodSales

          if (!hasComparisonData) {
            localStorage.removeItem(cacheKey)
          } else {
            setDailySalesComparison(cachedDailyComparison)
            setMonthlySalesComparison(cachedMonthlyComparison)
          }
          setCategoryData(data.categoryData)
          setExpiringWarranties(data.expiringWarranties)
          setOpenProblems(data.openProblems)
          setRecentActivity(data.recentActivity)
          setTurnoverSummary(data.turnoverSummary || EMPTY_TURNOVER_SUMMARY)
          setStockCount(data.stockCount)
          setWarrantiesCount(data.warrantiesCount)
          setProblemsCount(data.problemsCount)
          if (data.monthRhythm) setMonthRhythm(data.monthRhythm)
          if (hasComparisonData) {
            setLoading(false)
            return
          }
        }
      }

      const now = new Date()
      const startOfMonth = dateKey(new Date(now.getFullYear(), now.getMonth(), 1))
      const startOfPrevMonth = dateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const endOfPrevMonth = dateKey(new Date(now.getFullYear(), now.getMonth(), 0))
      const today = dateKey(now)
      const in30Days = dateKey(new Date(now.getTime() + 30 * 86400000))

      const [
        inventoryRes,
        salesPeriodRes,
        salesMonthRes,
        salesLast6Res,
        salesCategoryRes,
        turnoverSalesRes,
        warrantiesRes,
        problemsRes,
        recentSalesRes,
        salesPrevMonthRes,
      ] = await Promise.all([
        (supabase.from("inventory") as any)
          .select(`
            id,
            catalog_id,
            purchase_price,
            suggested_price,
            purchase_date,
            quantity,
            status,
            type,
            notes,
            condition_notes,
            catalog:catalog_id(category, model, brand, storage, color)
          `)
          .in("status", ["active", "in_stock"] as any),

        (supabase.from("sales") as any)
          .select("sale_price, net_amount, sale_date, created_at, source_type, sale_status, supplier_cost, notes, inventory:inventory_id(purchase_price, type), sales_additional_items(*)")
          .gte("sale_date", selectedRange.start)
          .lte("sale_date", selectedRange.end),

        (supabase.from("sales") as any)
          .select("sale_price, net_amount, sale_date, created_at, source_type, sale_status, supplier_cost, notes, inventory:inventory_id(purchase_price, type), sales_additional_items(*)")
          .gte("sale_date", startOfMonth)
          .lte("sale_date", today),

        (supabase.from("sales") as any)
          .select("sale_price, net_amount, sale_date, source_type, sale_status, supplier_cost, notes, inventory:inventory_id(purchase_price, type), sales_additional_items(*)")
          .gte("sale_date", dateKey(new Date(now.getFullYear(), now.getMonth() - 5, 1)))
          .lte("sale_date", today)
          .order("sale_date", { ascending: true })
          .limit(200),

        (supabase.from("sales") as any)
          .select("source_type, sale_status, inventory:inventory_id(catalog:catalog_id(category))")
          .gte("sale_date", dateKey(new Date(now.getFullYear(), now.getMonth() - 2, 1)))
          .lte("sale_date", today),

        (supabase.from("sales") as any)
          .select(`
            source_type,
            sale_status,
            sale_date,
            inventory:inventory_id(
              id,
              purchase_date,
              purchase_price,
              suggested_price,
              quantity,
              type,
              notes,
              condition_notes,
              catalog:catalog_id(category, model, brand, storage, color)
            )
          `)
          .gte("sale_date", dateKey(new Date(now.getFullYear(), now.getMonth() - 2, 1)))
          .lte("sale_date", today)
          .order("sale_date", { ascending: false })
          .limit(200),

        (supabase.from("warranties") as any)
          .select("end_date, customer:customer_id(full_name), inventory:inventory_id(catalog:catalog_id(model, brand))")
          .lte("end_date", in30Days)
          .gte("end_date", dateKey(now))
          .eq("status", "active")
          .order("end_date", { ascending: true })
          .limit(5),

        (supabase.from("problems") as any)
          .select("priority, tags, status, customers(full_name), inventory(product_catalog(model))")
          .neq("status", "resolved")
          .neq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(6),

        (supabase.from("sales") as any)
          .select("sale_price, created_at, customer_type, walk_in_label, customer:customer_id(full_name), inventory:inventory_id(catalog:catalog_id(model, brand))")
          .order("created_at", { ascending: false })
          .limit(6),

        supabase.from("sales")
          .select("sale_price, net_amount, sale_date, created_at, source_type, sale_status, supplier_cost, notes, inventory:inventory_id(purchase_price, type), sales_additional_items(*)")
          .gte("sale_date", startOfPrevMonth)
          .lte("sale_date", endOfPrevMonth),
      ])

      const inventory = ((inventoryRes.data as any[]) ?? []).filter((i) => (i.type || "own") === "own")
      const invested = inventory.reduce((acc, item) => acc + getInventoryCapitalValue(item), 0)
      setTotalInvested(invested)
      setStockCount(inventory.length)

      const activeTurnoverItems: StockTurnoverItem[] = inventory.map((item: any) => {
        const quantity = getInventoryQuantity(item)
        const days = Math.max(0, daysBetween(item.purchase_date))
        const category = item.catalog?.category
          ? String(item.catalog.category).charAt(0).toUpperCase() + String(item.catalog.category).slice(1)
          : "Outros"

        const unitCost = getInventoryUnitCost(item)
        return {
          id: item.id,
          name: getProductName(item),
          category,
          days,
          quantity,
          unitCost,
          value: getInventoryCapitalValue(item),
          suggested: Number(item.suggested_price || 0),
          tone: turnoverTone(days),
        }
      })

      const activeUnits = activeTurnoverItems.reduce((acc, item) => acc + item.quantity, 0) || 1
      const avgActiveDays = Math.round(
        activeTurnoverItems.reduce((acc, item) => acc + item.days * item.quantity, 0) / activeUnits
      )
      const stuckItems = activeTurnoverItems.filter((item) => item.tone === "stuck")
      const watchItems = activeTurnoverItems.filter((item) => item.tone === "watch")

      const soldTurnoverRows = ((turnoverSalesRes.data as any[]) ?? [])
        .filter((sale) => (sale.source_type || "own") === "own" && isCompletedSale(sale))
        .map((sale) => {
          const item = sale.inventory
          if (!item || (item.type || "own") !== "own") return null
          const days = Math.max(0, daysBetween(item.purchase_date, sale.sale_date))
          return {
            name: getProductName(item),
            days,
          }
        })
        .filter(Boolean) as { name: string; days: number }[]

      const avgSoldDays = soldTurnoverRows.length
        ? Math.round(soldTurnoverRows.reduce((acc, item) => acc + item.days, 0) / soldTurnoverRows.length)
        : 0
      const fastest = [...soldTurnoverRows].sort((a, b) => a.days - b.days)[0]
      const nextTurnoverSummary: StockTurnoverSummary = {
        avgActiveDays,
        avgSoldDays,
        stuckCount: stuckItems.reduce((acc, item) => acc + item.quantity, 0),
        stuckValue: stuckItems.reduce((acc, item) => acc + item.value, 0),
        watchCount: watchItems.reduce((acc, item) => acc + item.quantity, 0),
        fastestLabel: fastest?.name || "Sem histórico",
        fastestDays: fastest?.days ?? 0,
        priorityItems: [...activeTurnoverItems]
          .sort((a, b) => {
            const severity = { stuck: 3, watch: 2, healthy: 1 }
            return severity[b.tone] - severity[a.tone] || b.value - a.value || b.days - a.days
          })
          .slice(0, 3),
      }
      setTurnoverSummary(nextTurnoverSummary)

      // Lucro comercial por venda (own e supplier). calcSaleTotals usa
      // supplierCost quando presente (venda intermediada: sale_price - supplier_cost),
      // senão o custo do estoque próprio (purchase_price). Sem double-count.
      const getCommercialSaleProfit = (s: any) => {
        const cost = (s.inventory as any)?.purchase_price ?? 0
        const revenue = s.sale_price ?? s.net_amount ?? 0
        const qty = parseQtyFromNotes(s.notes)
        const totals = calcSaleTotals({
          salePrice: revenue,
          mainCost: cost,
          qty,
          additionalItems: s.sales_additional_items || [],
          supplierCost: s.supplier_cost
        })
        return totals.lucroTotal
      }

      const salesPeriod = ((salesPeriodRes.data as any[]) ?? []).filter(
        (s) => isCommercialSale(s)
      )
      const totalSales = salesPeriod.reduce((acc, s) => acc + (s.sale_price ?? 0), 0)
      setPeriodSales(totalSales)

      const profits = salesPeriod.map(getCommercialSaleProfit)
      const totalProfit = profits.reduce((a, b) => a + b, 0)
      setPeriodProfit(totalProfit)

      const nextPeriodAvgMargin = totalSales > 0 ? Math.round((totalProfit / totalSales) * 100 * 10) / 10 : 0
      setPeriodAvgMargin(nextPeriodAvgMargin)

      const salesMonth = ((salesMonthRes.data as any[]) ?? []).filter(
        (s) => isCommercialSale(s)
      )
      const salesLast6 = ((salesLast6Res.data as any[]) ?? []).filter(
        (s) => isCommercialSale(s)
      )
      const monthMap: Record<string, number> = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        monthMap[key] = 0
      }
      salesLast6.forEach((s) => {
        const key = s.sale_date.slice(0, 7)
        if (key in monthMap) monthMap[key] += s.sale_price
      })
      const nextSalesChartData = Object.entries(monthMap).map(([key, value]) => ({
        month: MONTHS_PT[parseInt(key.split("-")[1]) - 1],
        value,
      }))
      setSalesChartData(nextSalesChartData)

      const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const dayMap: Record<string, SalesComparisonPoint> = {}
      for (let day = 1; day <= daysInCurrentMonth; day++) {
        const label = String(day).padStart(2, "0")
        dayMap[label] = { label, gross: 0, net: 0 }
      }
      salesMonth.forEach((s: any) => {
        const day = saleDateDayLabel(s.sale_date, s.created_at)
        if (!dayMap[day]) dayMap[day] = { label: day, gross: 0, net: 0 }
        dayMap[day].gross += Number(s.sale_price || 0)
        dayMap[day].net += getCommercialSaleProfit(s)
      })
      const nextDailyComparison = Object.values(dayMap)
        .filter((point) => point.gross > 0 || point.net > 0)
        .sort((a, b) => a.label.localeCompare(b.label))
      setDailySalesComparison(nextDailyComparison)

      const monthComparisonMap: Record<string, SalesComparisonPoint> = {}
      Object.keys(monthMap).forEach((key) => {
        monthComparisonMap[key] = {
          label: MONTHS_PT[parseInt(key.split("-")[1]) - 1],
          gross: 0,
          net: 0,
        }
      })
      salesLast6.forEach((s: any) => {
        const key = s.sale_date.slice(0, 7)
        if (!monthComparisonMap[key]) return
        monthComparisonMap[key].gross += Number(s.sale_price || 0)
        monthComparisonMap[key].net += getCommercialSaleProfit(s)
      })

      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      if (
        salesMonth.length > 0 &&
        monthComparisonMap[currentMonthKey] &&
        monthComparisonMap[currentMonthKey].gross === 0
      ) {
        monthComparisonMap[currentMonthKey].gross = salesMonth.reduce((acc, sale) => acc + Number(sale.sale_price || 0), 0)
        monthComparisonMap[currentMonthKey].net = salesMonth.reduce((acc, sale) => acc + getCommercialSaleProfit(sale), 0)
      }
      const nextMonthlyComparison = Object.values(monthComparisonMap)
      setMonthlySalesComparison(nextMonthlyComparison)

      const salesPrevMonth: RhythmSaleRow[] = ((salesPrevMonthRes.data as RhythmSaleRow[] | null) ?? []).filter(
        (s) => isCommercialSale(s)
      )
      const salesMonthForRhythm: RhythmSaleRow[] = salesMonth as RhythmSaleRow[]
      const currentMonthDayNow = now.getDate()
      const totalDaysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const totalDaysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
      const rhythmMaxDays = Math.max(totalDaysInCurrentMonth, totalDaysInPrevMonth)
      const currentDailyMap: Record<number, { revenue: number; profit: number }> = {}
      const previousDailyMap: Record<number, { revenue: number; profit: number }> = {}
      for (let d = 1; d <= rhythmMaxDays; d++) {
        currentDailyMap[d] = { revenue: 0, profit: 0 }
        previousDailyMap[d] = { revenue: 0, profit: 0 }
      }
      salesMonthForRhythm.forEach((s: RhythmSaleRow) => {
        const dayLabel = saleDateDayLabel(s.sale_date ?? undefined, s.created_at ?? undefined)
        const day = Number(dayLabel)
        if (!day || day < 1 || day > rhythmMaxDays) return
        currentDailyMap[day].revenue += Number(s.sale_price || 0)
        currentDailyMap[day].profit += getCommercialSaleProfit(s)
      })
      salesPrevMonth.forEach((s: RhythmSaleRow) => {
        const raw = String(s.sale_date || "").slice(0, 10)
        const dayStr = raw.split("-")[2]
        const day = Number(dayStr)
        if (!day || day < 1 || day > rhythmMaxDays) return
        previousDailyMap[day].revenue += Number(s.sale_price || 0)
        previousDailyMap[day].profit += getCommercialSaleProfit(s)
      })
      const rhythmPoints: MonthRhythmPoint[] = []
      let runCurrentRevenue = 0
      let runCurrentProfit = 0
      let runPreviousRevenue = 0
      let runPreviousProfit = 0
      for (let d = 1; d <= rhythmMaxDays; d++) {
        runCurrentRevenue += currentDailyMap[d]?.revenue ?? 0
        runCurrentProfit += currentDailyMap[d]?.profit ?? 0
        runPreviousRevenue += previousDailyMap[d]?.revenue ?? 0
        runPreviousProfit += previousDailyMap[d]?.profit ?? 0
        rhythmPoints.push({
          day: d,
          currentRevenue: d <= currentMonthDayNow && d <= totalDaysInCurrentMonth ? Math.round(runCurrentRevenue * 100) / 100 : null,
          currentProfit: d <= currentMonthDayNow && d <= totalDaysInCurrentMonth ? Math.round(runCurrentProfit * 100) / 100 : null,
          previousRevenue: d <= totalDaysInPrevMonth ? Math.round(runPreviousRevenue * 100) / 100 : null,
          previousProfit: d <= totalDaysInPrevMonth ? Math.round(runPreviousProfit * 100) / 100 : null,
        })
      }
      const sameDayLimit = Math.min(currentMonthDayNow, totalDaysInPrevMonth)
      const sameDayPrev = rhythmPoints.find((p) => p.day === sameDayLimit)
      const todayPoint = rhythmPoints.find((p) => p.day === currentMonthDayNow)
      const prevTotalsPoint = rhythmPoints[rhythmPoints.length - 1]
      let bestDay: { day: number; revenue: number; profit: number } | null = null
      for (let d = 1; d <= currentMonthDayNow; d++) {
        const entry = currentDailyMap[d]
        if (!entry) continue
        if (!bestDay || entry.revenue > bestDay.revenue) {
          bestDay = { day: d, revenue: entry.revenue, profit: entry.profit }
        }
      }
      const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
      const cap = (s: string) => s.replace(/^\w/, (l) => l.toUpperCase())
      const nextMonthRhythm: MonthRhythmData = {
        points: rhythmPoints,
        currentMonthLabel: cap(monthFormatter.format(new Date(now.getFullYear(), now.getMonth(), 1))),
        previousMonthLabel: cap(monthFormatter.format(new Date(now.getFullYear(), now.getMonth() - 1, 1))),
        currentDay: currentMonthDayNow,
        daysInCurrentMonth: totalDaysInCurrentMonth,
        daysInPreviousMonth: totalDaysInPrevMonth,
        currentAccumRevenue: todayPoint?.currentRevenue ?? runCurrentRevenue,
        currentAccumProfit: todayPoint?.currentProfit ?? runCurrentProfit,
        previousAccumAtSameDayRevenue: sameDayPrev?.previousRevenue ?? 0,
        previousAccumAtSameDayProfit: sameDayPrev?.previousProfit ?? 0,
        previousTotalRevenue: prevTotalsPoint?.previousRevenue ?? runPreviousRevenue,
        previousTotalProfit: prevTotalsPoint?.previousProfit ?? runPreviousProfit,
        bestDay,
      }
      setMonthRhythm(nextMonthRhythm)

      const catRaw = ((salesCategoryRes.data as any[]) ?? []).filter(
        (s) => isCommercialSale(s)
      )
      const catCount: Record<string, number> = {}
      
      const formatCat = (c: string) => {
        const m: Record<string, string> = {
          iphone: "iPhone",
          ipad: "iPad",
          applewatch: "Apple Watch",
          airpods: "AirPods",
          macbook: "MacBook",
          garmin: "Garmin",
        }
        const low = c.toLowerCase()
        return m[low] || c.charAt(0).toUpperCase() + c.slice(1)
      }

      catRaw.forEach((s: any) => {
        const raw = s.inventory?.catalog?.category ?? "Outros"
        const formatted = formatCat(raw)
        catCount[formatted] = (catCount[formatted] ?? 0) + 1
      })

      const total = Object.values(catCount).reduce((a, b) => a + b, 0) || 1
      setCategoryData(
        Object.entries(catCount).map(([name, count]) => ({
          name,
          value: Math.round((count / total) * 100),
          color: CATEGORY_COLORS[name] ?? CATEGORY_COLORS["Outros"],
        }))
      )

      const warranties = (warrantiesRes.data as any[]) ?? []
      setWarrantiesCount(warranties.length)
      setExpiringWarranties(
        warranties.map((w: any) => ({
          customer: w.customer?.full_name ?? "—",
          product: w.inventory?.catalog ? `${w.inventory.catalog.brand} ${w.inventory.catalog.model}` : "—",
          days: daysUntil(w.end_date),
        }))
      )

      const problems = (problemsRes.data as any[]) ?? []
      setProblemsCount(problems.length)
      setOpenProblems(
        problems.map((p: any) => ({
          customer: p.customers?.full_name ?? "—",
          product: p.inventory?.product_catalog?.model ?? "—",
          tag: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags[0] : "outro",
          priority: p.priority ?? "medium",
        }))
      )

      const recentSales = (recentSalesRes.data as any[]) ?? []
      setRecentActivity(
        recentSales.map((s: any) => ({
          action: "Venda realizada",
          detail: `${s.inventory?.catalog?.brand ?? ""} ${s.inventory?.catalog?.model ?? "—"} → ${saleCustomerLabel(s)}`,
          time: relativeTime(s.created_at),
        }))
      )

      localStorage.setItem(cacheKey, JSON.stringify({
        data: {
          totalInvested: invested,
          periodSales: totalSales,
          periodProfit: totalProfit,
          periodAvgMargin: nextPeriodAvgMargin,
          salesChartData: nextSalesChartData,
          dailySalesComparison: nextDailyComparison,
          monthlySalesComparison: nextMonthlyComparison,
          monthRhythm: nextMonthRhythm,
          categoryData: Object.entries(catCount).map(([name, count]) => ({
            name,
            value: Math.round((count / total) * 100),
            color: CATEGORY_COLORS[name] ?? CATEGORY_COLORS["Outros"],
          })),
          expiringWarranties: warranties.map((w: any) => ({
            customer: w.customer?.full_name ?? "—",
            product: w.inventory?.catalog ? `${w.inventory.catalog.brand} ${w.inventory.catalog.model}` : "—",
            days: daysUntil(w.end_date),
          })),
          openProblems: problems.map((p: any) => ({
            customer: p.customers?.full_name ?? "—",
            product: p.inventory?.product_catalog?.model ?? "—",
            tag: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags[0] : "outro",
            priority: p.priority ?? "medium",
          })),
          recentActivity: recentSales.map((s: any) => ({
            action: "Venda realizada",
            detail: `${s.inventory?.catalog?.brand ?? ""} ${s.inventory?.catalog?.model ?? "—"} → ${saleCustomerLabel(s)}`,
            time: relativeTime(s.created_at),
          })),
          turnoverSummary: nextTurnoverSummary,
          stockCount: inventory.length,
          warrantiesCount: warranties.length,
          problemsCount: problems.length,
        },
        timestamp: Date.now(),
      }))

      setLoading(false)
    }

    load()
  }, [periodEnd, periodStart])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
        <p className="text-sm">Carregando dados do banco...</p>
      </div>
    )
  }

  const selectedRange = normalizeDateRange(periodStart, periodEnd)
  const selectedPeriodLabel = formatPeriodLabel(selectedRange.start, selectedRange.end)
  const chartHasSales = [...dailySalesComparison, ...monthlySalesComparison].some((point) => point.gross > 0 || point.net > 0)
  const handlePeriodPresetChange = (value: DashboardPeriodPreset) => {
    setPeriodPreset(value)
    if (value === "custom") return

    const range = getPresetRange(value)
    setPeriodStart(range.start)
    setPeriodEnd(range.end)
  }

  const rhythmDiffForHealth = monthRhythm
    ? monthRhythm.currentAccumRevenue - monthRhythm.previousAccumAtSameDayRevenue
    : 0
  const isRhythmFallingSharply = Boolean(
    monthRhythm
    && monthRhythm.previousAccumAtSameDayRevenue > 0
    && monthRhythm.currentAccumRevenue < monthRhythm.previousAccumAtSameDayRevenue * 0.85
  )
  const isCritical = periodProfit < 0 || (periodAvgMargin <= 0 && periodSales > 0)
  const isAttention = !isCritical && (
    turnoverSummary.stuckCount > 0
    || problemsCount > 0
    || (periodAvgMargin > 0 && periodAvgMargin < 5)
    || isRhythmFallingSharply
  )
  const healthTone: "green" | "yellow" | "red" = isCritical ? "red" : isAttention ? "yellow" : "green"
  const healthLabel = healthTone === "red" ? "Crítico" : healthTone === "yellow" ? "Atenção" : "Saudável"
  const decisionTag = turnoverSummary.stuckCount > 0
    ? { label: "Girar estoque", variant: "yellow" as const }
    : problemsCount > 0
    ? { label: "Pós-venda", variant: "red" as const }
    : warrantiesCount > 0
    ? { label: "Pós-venda", variant: "yellow" as const }
    : periodProfit < 0
    ? { label: "Financeiro", variant: "red" as const }
    : rhythmDiffForHealth > 0
    ? { label: "Comercial", variant: "green" as const }
    : { label: "Ação sugerida", variant: "blue" as const }
  const topCategory = categoryData[0]
  const stockPressure =
    turnoverSummary.stuckCount > 0
      ? `${turnoverSummary.stuckCount} item(ns) acima de 45 dias`
      : turnoverSummary.watchCount > 0
        ? `${turnoverSummary.watchCount} item(ns) em observação`
        : "Estoque sem alerta crítico"
  const topPriorityStock = turnoverSummary.priorityItems[0]
  const operationalPriority = problemsCount > 0
    ? { title: "Ver problemas em aberto", reason: `${problemsCount} problema(s) ativo(s) na assistência.`, category: "Pós-venda", href: "/problemas", tone: "rose" as const }
    : warrantiesCount > 0
    ? { title: "Acompanhar garantias", reason: `${warrantiesCount} garantia(s) vencendo nos próximos 30 dias.`, category: "Pós-venda", href: "/garantias", tone: "amber" as const }
    : periodProfit < 0
    ? { title: "Revisar resultado financeiro", reason: `Resultado de ${formatBRL(periodProfit)} no período.`, category: "Financeiro", href: "/financeiro", tone: "rose" as const }
    : { title: "Sem prioridade operacional", reason: "Nenhum alerta operacional crítico no momento.", category: "Operação", href: "/financeiro", tone: "emerald" as const }

  const commercialOpportunity = topPriorityStock
    ? {
        title: `Priorizar ${topPriorityStock.name}`,
        reason: `${topPriorityStock.days} dias em estoque · custo unitário ${formatBRL(topPriorityStock.unitCost)}${topPriorityStock.quantity > 1 ? ` · capital ${formatBRL(topPriorityStock.value)}` : ""}.`,
        category: "Giro de estoque",
        href: topPriorityStock.tone === "stuck" ? "/marketing/divulgacao" : `/estoque/${topPriorityStock.id}/editar`,
        actionLabel: topPriorityStock.tone === "stuck" ? "Criar divulgação" : "Revisar preço",
      }
    : topCategory
    ? {
        title: `${topCategory.name} lidera o mix`,
        reason: `${topCategory.value}% das vendas recentes nessa categoria.`,
        category: "Comercial",
        href: "/marketing/divulgacao",
        actionLabel: "Criar divulgação",
      }
    : null
  const salesComparisonData =
    salesComparisonMode === "day" ? dailySalesComparison : monthlySalesComparison

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-2xl border border-gray-100 bg-card px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-royal-100">
              <CalendarDays className="h-4 w-4 text-royal-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Período</p>
              <p className="text-sm font-semibold text-navy-900">{selectedPeriodLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[540px]">
            <Select
              label="Período"
              value={periodPreset}
              onChange={(event) => handlePeriodPresetChange(event.target.value as DashboardPeriodPreset)}
              options={DASHBOARD_PERIOD_OPTIONS}
            />
            <Input
              label="De"
              type="date"
              value={periodStart}
              onChange={(event) => {
                setPeriodPreset("custom")
                setPeriodStart(event.target.value)
              }}
            />
            <Input
              label="Até"
              type="date"
              value={periodEnd}
              onChange={(event) => {
                setPeriodPreset("custom")
                setPeriodEnd(event.target.value)
              }}
            />
          </div>
        </div>
      </section>

      <PulsoDaLoja
        healthTone={healthTone}
        healthLabel={healthLabel}
        periodSales={periodSales}
        periodProfit={periodProfit}
        periodAvgMargin={periodAvgMargin}
        monthRhythm={monthRhythm}
        stuckCount={turnoverSummary.stuckCount}
        stuckValue={turnoverSummary.stuckValue}
        problemsCount={problemsCount}
        warrantiesCount={warrantiesCount}
      />

      <OperationalAlertsCard collapsible defaultCollapsed />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                  <Sparkles className="h-5 w-5 text-white/80" />
                </span>
                <Badge variant={decisionTag.variant}>{decisionTag.label}</Badge>
              </div>
              <h2 className="font-syne text-2xl font-semibold tracking-normal">Decisão de hoje</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Duas trilhas paralelas: prioridade operacional e oportunidade comercial.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Resultado</p>
                <p className="mt-2 text-2xl font-semibold tracking-normal">{formatBRL(periodProfit)}</p>
                <p className="mt-1 text-xs text-white/55">{periodAvgMargin}% margem no período</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Estoque</p>
                <p className="mt-2 text-2xl font-semibold tracking-normal">{stockCount}</p>
                <p className="mt-1 text-xs text-white/55">{stockPressure}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-2 sm:p-6">
            <div className={cn(
              "rounded-2xl p-4 ring-1",
              operationalPriority.tone === "rose" ? "bg-rose-500/10 ring-rose-400/20" :
              operationalPriority.tone === "amber" ? "bg-amber-500/10 ring-amber-400/20" :
              "bg-emerald-500/10 ring-emerald-400/20"
            )}>
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  operationalPriority.tone === "rose" ? "bg-rose-400/20 text-rose-200" :
                  operationalPriority.tone === "amber" ? "bg-amber-400/20 text-amber-200" :
                  "bg-emerald-400/20 text-emerald-200"
                )}>
                  Prioridade operacional · {operationalPriority.category}
                </span>
              </div>
              <p className="mt-2 text-sm font-bold text-white">{operationalPriority.title}</p>
              <p className="mt-1 text-xs leading-snug text-white/65">{operationalPriority.reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={operationalPriority.href} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/20">
                  Ver detalhes <ArrowRight className="h-3 w-3" />
                </Link>
                <RuleDisclosure title="Como essa prioridade foi definida" tone="navy">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">O que foi detectado</p>
                      <p className="mt-1 text-white/85">{operationalPriority.reason}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Por que importa</p>
                      <p className="mt-1 text-white/75">
                        {operationalPriority.category === "Pós-venda"
                          ? "Pontos de pós-venda precisam aparecer cedo, porque atrasos em assistência ou garantia podem gerar cobrança do cliente e perda de confiança."
                          : operationalPriority.category === "Financeiro"
                          ? "Quando o resultado do período fica negativo, a loja precisa revisar margem, despesas e ritmo antes que a pressão chegue no caixa."
                          : "Nenhum alerta operacional urgente apareceu agora. Isso libera a gestão para focar em venda, giro e acompanhamento preventivo."}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">O que fazer agora</p>
                      <p className="mt-1 text-white/75">
                        {operationalPriority.category === "Operação"
                          ? "Mantenha o acompanhamento e use a trilha comercial ao lado para buscar a próxima venda."
                          : "Abra os detalhes, confirme se há ação pendente e resolva o ponto antes que ele vire urgência operacional."}
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Como o sistema decidiu</p>
                      <p className="mt-1 text-white/60">
                        O painel olha primeiro para problemas abertos, depois para garantias próximas do vencimento e resultado financeiro. A prioridade exibida é o ponto que mais pede acompanhamento humano agora.
                      </p>
                    </div>
                  </div>
                </RuleDisclosure>
              </div>
            </div>
            <div className="rounded-2xl bg-royal-500/10 p-4 ring-1 ring-royal-400/20">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-royal-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-royal-100">
                  Oportunidade comercial · {commercialOpportunity?.category ?? "Comercial"}
                </span>
              </div>
              {commercialOpportunity ? (
                <>
                  <p className="mt-2 text-sm font-bold text-white">{commercialOpportunity.title}</p>
                  <p className="mt-1 text-xs leading-snug text-white/65">{commercialOpportunity.reason}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={commercialOpportunity.href} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-600">
                      {commercialOpportunity.actionLabel} <ArrowRight className="h-3 w-3" />
                    </Link>
                    <RuleDisclosure title="Por que essa oportunidade apareceu" tone="navy">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">O que foi detectado</p>
                          <p className="mt-1 text-white/85">{commercialOpportunity.reason}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Por que importa</p>
                          {topPriorityStock ? (
                            <p className="mt-1 text-white/75">
                              Esse item está há <strong className="text-white">{topPriorityStock.days} dias</strong> em estoque.
                              A partir de 10 dias, o painel começa a observar o giro com mais atenção; entre 10 e 44 dias, faz sentido revisar preço, anúncio ou exposição. Acima de 45 dias, o item passa a ser tratado como capital parado crítico.
                              {topPriorityStock.unitCost > 0 ? <> O custo unitário é <strong className="tabular-nums text-white">{formatBRL(topPriorityStock.unitCost)}</strong>{topPriorityStock.quantity > 1 ? <> e o capital total preso nesse item é <strong className="tabular-nums text-white">{formatBRL(topPriorityStock.value)}</strong></> : null}.</> : null}
                            </p>
                          ) : (
                            <p className="mt-1 text-white/75">
                              A categoria aparece porque lidera o mix recente. Quando uma linha vende bem, ela pode orientar a próxima divulgação e ajudar a manter o ritmo comercial.
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">O que fazer agora</p>
                          <p className="mt-1 text-white/75">
                            {topPriorityStock
                              ? "Reveja o preço, melhore a divulgação ou acompanhe mais de perto antes que o item prenda capital por tempo demais."
                              : "Use a categoria vencedora como base para uma divulgação mais direta e com maior chance de conversão."}
                          </p>
                        </div>
                      </div>
                    </RuleDisclosure>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm font-bold text-white">Sem oportunidade clara agora</p>
                  <p className="mt-1 text-xs leading-snug text-white/65">Continue acompanhando o ritmo de vendas.</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <DashboardMetricCard
            title="Capital em estoque"
            value={formatBRL(totalInvested)}
            subtitle={turnoverSummary.stuckCount > 0 ? `${stockCount} itens · ${formatBRL(turnoverSummary.stuckValue)} parados +45d` : `${stockCount} itens · sem capital travado`}
            icon={CircleDollarSign}
            tone="blue"
            status={turnoverSummary.stuckCount > 0 ? "Atenção" : "Saudável"}
            statusTone={turnoverSummary.stuckCount > 0 ? "yellow" : "green"}
          />
          <DashboardMetricCard
            title="Vendas"
            value={formatBRL(periodSales)}
            subtitle={monthRhythm && monthRhythm.previousAccumAtSameDayRevenue > 0
              ? `${monthRhythm.currentAccumRevenue >= monthRhythm.previousAccumAtSameDayRevenue ? "Acima" : "Abaixo"} de ${monthRhythm.previousMonthLabel.split(" ")[0]} no mesmo dia`
              : "faturamento no período"}
            icon={ShoppingCart}
            tone="green"
            status={monthRhythm && monthRhythm.previousAccumAtSameDayRevenue > 0
              ? monthRhythm.currentAccumRevenue >= monthRhythm.previousAccumAtSameDayRevenue ? "Ritmo forte" : "Abaixo"
              : "Em andamento"}
            statusTone={monthRhythm && monthRhythm.previousAccumAtSameDayRevenue > 0
              ? monthRhythm.currentAccumRevenue >= monthRhythm.previousAccumAtSameDayRevenue ? "green" : "yellow"
              : "gray"}
          />
          <DashboardMetricCard
            title="Lucro"
            value={formatBRL(periodProfit)}
            subtitle={`${periodAvgMargin}% de margem média no período`}
            icon={TrendingUp}
            tone={periodProfit >= 0 ? "green" : "red"}
            status={periodProfit < 0 ? "Crítico" : periodAvgMargin >= 10 ? "Saudável" : periodAvgMargin > 0 ? "Apertado" : "Monitorar"}
            statusTone={periodProfit < 0 ? "red" : periodAvgMargin >= 10 ? "green" : periodAvgMargin > 0 ? "yellow" : "gray"}
          />
          <DashboardMetricCard
            title="Margem média"
            value={`${periodAvgMargin}%`}
            subtitle="sobre vendas no período"
            icon={Percent}
            tone="yellow"
            status={periodAvgMargin >= 15 ? "Forte" : periodAvgMargin >= 8 ? "Saudável" : periodAvgMargin > 0 ? "Monitorar" : "Crítico"}
            statusTone={periodAvgMargin >= 15 ? "green" : periodAvgMargin >= 8 ? "green" : periodAvgMargin > 0 ? "yellow" : "red"}
          />
        </div>
      </div>

      <DashboardSection
        title="Atalhos operacionais"
        description="Os principais pontos de atenção da loja em um só lugar."
        icon={Activity}
        action={<Badge variant={problemsCount > 0 || warrantiesCount > 0 ? "yellow" : "green"}>{problemsCount + warrantiesCount} alerta(s)</Badge>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLinkCard
            href="/garantias"
            title={`${warrantiesCount} Garantia${warrantiesCount !== 1 ? "s" : ""}`}
            subtitle="vencendo nos próximos 30 dias"
            icon={ShieldCheck}
            tone="red"
          />
          <QuickLinkCard
            href="/problemas"
            title={`${problemsCount} Problema${problemsCount !== 1 ? "s" : ""}`}
            subtitle="em aberto na assistência"
            icon={AlertTriangle}
            tone="yellow"
          />
          <QuickLinkCard
            href="/estoque"
            title={`${stockCount} Item${stockCount !== 1 ? "s" : ""}`}
            subtitle="disponíveis no estoque"
            icon={Package}
            tone="blue"
          />
        </div>
      </DashboardSection>

      <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-royal-100 flex items-center justify-center shrink-0">
              <TimerReset className="w-5 h-5 text-royal-500" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-navy-900 font-syne">Radar de estoque</h3>
              <p className="text-sm text-gray-500">
                Capital parado, item prioritário e ação sugerida para girar mais rápido.
              </p>
            </div>
          </div>
          <Badge variant={turnoverSummary.stuckCount > 0 ? "red" : turnoverSummary.watchCount > 0 ? "yellow" : "green"}>
            {turnoverSummary.stuckCount > 0 ? "Atenção" : turnoverSummary.watchCount > 0 ? "Monitorar" : "Saudável"}
          </Badge>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Idade média</p>
                <Clock3 className="w-4 h-4 text-gray-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-normal text-navy-900">{turnoverSummary.avgActiveDays}d</p>
              <p className="mt-1 text-xs text-gray-500">dos itens disponíveis</p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tempo de venda</p>
                <Gauge className="w-4 h-4 text-gray-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-normal text-navy-900">
                {turnoverSummary.avgSoldDays ? `${turnoverSummary.avgSoldDays}d` : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-500">média dos últimos 90 dias</p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Parado crítico</p>
                <PackageSearch className="w-4 h-4 text-gray-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-normal text-navy-900 tabular-nums">{turnoverSummary.stuckCount}</p>
              <p className="mt-1 text-xs text-gray-500">+45 dias · <span className="tabular-nums">{formatBRL(turnoverSummary.stuckValue)}</span></p>
              <p className="mt-0.5 text-[11px] text-gray-400">{turnoverSummary.watchCount} em observação (10-44d)</p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Mais rápido</p>
                <TrendingUp className="w-4 h-4 text-gray-400" />
              </div>
              <p className="mt-3 text-lg font-semibold tracking-normal text-navy-900 truncate">{turnoverSummary.fastestLabel}</p>
              <p className="mt-1 text-xs text-gray-500">
                {turnoverSummary.fastestDays ? `vendeu em ${turnoverSummary.fastestDays} dia${turnoverSummary.fastestDays !== 1 ? "s" : ""}` : "sem vendas suficientes"}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Prioridade de venda</p>
                <p className="text-sm text-gray-500">Itens com mais capital preso e maior tempo em estoque.</p>
              </div>
              <Link href="/estoque">
                <Button variant="link" size="sm">Ver estoque</Button>
              </Link>
            </div>
            {turnoverSummary.priorityItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                Nenhum item disponível para analisar giro.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {turnoverSummary.priorityItems.map((item) => {
                  const tone = turnoverBadge(item.tone)
                  const reprice = suggestReprice({ cost: item.unitCost, currentPrice: item.suggested, days: item.days })
                  const baseAction = item.tone === "stuck"
                    ? { label: "Divulgar", href: "/marketing/divulgacao", className: "bg-emerald-600 text-white hover:bg-emerald-700" }
                    : item.tone === "watch"
                    ? (reprice
                        ? { label: "Reprecificar", href: `/estoque/${item.id}/editar`, className: "bg-amber-500 text-white hover:bg-amber-600" }
                        : { label: "Revisar preço", href: `/estoque/${item.id}/editar`, className: "bg-amber-500 text-white hover:bg-amber-600" })
                    : { label: "Monitorar", href: `/estoque/${item.id}`, className: "bg-slate-100 text-slate-700 hover:bg-slate-200" }
                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200/70 bg-white p-4 transition-all hover:-translate-y-px hover:shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-navy-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.category} · {item.quantity} un.</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone.className}`}>
                          {tone.label}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-gray-400">Estoque</p>
                          <p className="font-semibold text-navy-900 tabular-nums">{item.days}d</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Custo unitário</p>
                          <p className="font-semibold text-navy-900 tabular-nums">{formatBRL(item.unitCost)}</p>
                          {item.quantity > 1 && <p className="text-[10px] text-gray-400">Capital: <span className="tabular-nums">{formatBRL(item.value)}</span></p>}
                        </div>
                        <div>
                          <p className="text-gray-400">Sugerido</p>
                          <p className="font-semibold text-navy-900 tabular-nums">{item.suggested ? formatBRL(item.suggested) : "—"}</p>
                        </div>
                      </div>
                      {reprice ? (
                        <div className="mt-3 rounded-xl border border-amber-100/70 bg-amber-50/40 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">Sugestão de reprecificação</p>
                          <div className="mt-1 flex items-baseline justify-between gap-2">
                            <span className="text-[11px] text-gray-500">Atual <span className="font-semibold text-navy-900 tabular-nums line-through">{formatBRL(item.suggested)}</span></span>
                            <span className="text-sm font-bold tabular-nums text-amber-700">{formatBRL(reprice.proposed)}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-gray-500">Desconto sugerido <strong className="text-amber-700">-{reprice.discountPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong> · margem estimada <strong className="text-navy-900">{reprice.newMarginPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong></p>
                          <p className="mt-0.5 text-[10px] text-gray-400">Motivo: <strong className="text-gray-600">{item.days} dias em estoque</strong> · preserva margem mínima segura.</p>
                          <div className="mt-1.5">
                            <RuleDisclosure title="Como o preço sugerido foi calculado">
                              <div className="space-y-3">
                                <p>
                                  Essa sugestão não altera o preço automaticamente. Ela serve como referência para decidir se vale acelerar o giro sem abrir mão de uma margem mínima segura.
                                </p>
                                <div className="space-y-1.5 rounded-lg bg-slate-50/80 p-2.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Preço atual</span>
                                    <strong className="tabular-nums text-navy-900">{formatBRL(item.suggested)}</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Custo unitário</span>
                                    <strong className="tabular-nums text-navy-900">{formatBRL(item.unitCost)}</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Tempo em estoque</span>
                                    <strong className="text-navy-900">{item.days} dias</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Desconto sugerido pela faixa de dias</span>
                                    <strong className="tabular-nums text-amber-700">-{reprice.discountPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 pt-1.5">
                                    <span>Preço sugerido</span>
                                    <strong className="tabular-nums text-amber-700">{formatBRL(reprice.proposed)}</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Margem estimada</span>
                                    <strong className="tabular-nums text-navy-900">{reprice.newMarginPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong>
                                  </div>
                                </div>
                                <p className="border-t border-slate-100 pt-2 text-[11px] text-gray-500">
                                  O sistema usa faixas de tempo em estoque para sugerir uma redução gradual, arredonda o valor para facilitar a operação e preserva margem mínima de 8% para evitar um preço abaixo de um nível seguro.
                                </p>
                              </div>
                            </RuleDisclosure>
                          </div>
                        </div>
                      ) : item.tone === "watch" ? (
                        <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-gray-500">Sugestão indisponível: falta custo unitário ou preço atual válido para calcular reprecificação segura.</p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Link href={`/estoque/${item.id}`} className="text-[11px] font-semibold text-gray-500 hover:text-navy-900">Ver detalhe →</Link>
                        <Link href={baseAction.href} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-sm transition ${baseAction.className}`}>
                          {baseAction.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <DashboardSection
        title="Performance comercial"
        description="Faturamento recente e concentração de categorias vendidas."
        icon={BarChart3}
        action={<Badge variant={chartHasSales ? "green" : "gray"}>{chartHasSales ? "Com vendas" : "Sem vendas"}</Badge>}
      >
        <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Bruto x líquido</p>
                <p className="text-sm text-gray-500">
                  {salesComparisonMode === "day" ? "Resultado por dia no mês atual" : "Resultado mensal dos últimos 6 meses"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() => setSalesComparisonMode("day")}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      salesComparisonMode === "day"
                        ? "bg-navy-900 text-white shadow-sm"
                        : "text-gray-500 hover:text-navy-900"
                    }`}
                  >
                    Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesComparisonMode("month")}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      salesComparisonMode === "month"
                        ? "bg-navy-900 text-white shadow-sm"
                        : "text-gray-500 hover:text-navy-900"
                    }`}
                  >
                    Mês
                  </button>
                </div>
              </div>
            </div>
            {salesComparisonData.length === 0 || salesComparisonData.every((d) => d.gross === 0 && d.net === 0) ? (
              <p className="text-sm text-gray-400 text-center py-16">Nenhuma venda registrada para comparar.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-royal-50 px-3 py-1 text-royal-700 ring-1 ring-royal-100">
                      <span className="h-2 w-2 rounded-sm bg-royal-500" /> Receita bruta
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-success-700 ring-1 ring-success-100">
                      <span className="h-2 w-2 rounded-sm bg-success-500" /> Lucro líquido
                    </span>
                  </div>
                  <span className="text-[11px] font-normal text-gray-400">Passe o mouse para ver os valores por {salesComparisonMode === "day" ? "dia" : "mês"} · eixo cronológico</span>
                </div>
                <LazyChart className="relative h-[250px] min-w-0">
                  {({ width, height }) => (
                    <BarChart width={width} height={height} data={salesComparisonData} barGap={6} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.45} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        width={42}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(148,163,184,0.08)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || payload.length === 0) return null
                          const gross = payload.find((p) => p.dataKey === "gross")?.value as number | null | undefined
                          const net = payload.find((p) => p.dataKey === "net")?.value as number | null | undefined
                          return (
                            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-md">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{salesComparisonMode === "day" ? "Dia" : "Mês"}</p>
                              <p className="text-base font-bold text-navy-900 leading-none">{label}</p>
                              <div className="mt-2 space-y-1">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="flex items-center gap-1.5 text-gray-500"><span className="h-2 w-2 rounded-sm bg-royal-500" /> Receita bruta</span>
                                  <span className="font-semibold tabular-nums text-royal-700">{gross != null ? formatBRL(gross) : "—"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="flex items-center gap-1.5 text-gray-500"><span className="h-2 w-2 rounded-sm bg-success-500" /> Lucro líquido</span>
                                  <span className="font-semibold tabular-nums text-success-700">{net != null ? formatBRL(net) : "—"}</span>
                                </div>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="gross" fill="#3A6BC4" radius={[6, 6, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="net" fill="#36B37E" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  )}
                </LazyChart>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Mix vendido</p>
                <p className="text-sm text-gray-500">Últimos 3 meses</p>
              </div>
              {topCategory && <Badge variant="blue">{topCategory.name}</Badge>}
            </div>
            {categoryData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-16">Nenhuma venda com categoria nos últimos 3 meses.</p>
            ) : (
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_0.9fr]">
                <LazyChart className="relative h-[210px] min-w-0">
                  {({ width, height }) => (
                    <PieChart width={width} height={height}>
                      <Pie
                        data={categoryData}
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={8}
                        cornerRadius={10}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${Number(value)}%`} />
                    </PieChart>
                  )}
                </LazyChart>
                <div className="space-y-2 text-sm">
                  {categoryData.map((c) => (
                    <div key={c.name} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-gray-600">{c.name}</span>
                      <span className="font-semibold text-navy-900 ml-auto">{c.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <MonthRhythmBlock data={monthRhythm} mode={rhythmMode} onChangeMode={setRhythmMode} />
        </div>
      </DashboardSection>

      <DashboardSection
        title="Pós-venda e histórico"
        description="Garantias próximas, últimas vendas e sinalizações de atendimento."
        icon={ClipboardList}
        action={
          <Link href="/garantias">
            <Button variant="link" size="sm" className="gap-1">
              Ver garantias <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Garantias vencendo</p>
                <p className="text-sm text-gray-500">Próximos 30 dias</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-royal-500" />
            </div>
            {expiringWarranties.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma garantia vencendo nos próximos 30 dias.</p>
            ) : (
              <div className="space-y-2">
                {expiringWarranties.map((w, i) => (
                  <div key={`${w.customer}-${w.product}-${i}`} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900 truncate">{w.customer}</p>
                      <p className="text-xs text-gray-500 truncate">{w.product}</p>
                    </div>
                    <Badge variant={w.days <= 7 ? "red" : w.days <= 15 ? "yellow" : "blue"}>
                      {w.days} dias
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Atividade recente</p>
                <p className="text-sm text-gray-500">Últimos registros de venda</p>
              </div>
              <Activity className="h-5 w-5 text-royal-500" />
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda registrada ainda.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentActivity.map((a, i) => (
                  <div key={`${a.detail}-${i}`} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-royal-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-navy-900 font-medium">{a.action}</p>
                      <p className="text-xs text-gray-500 truncate">{a.detail}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{a.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DashboardSection>

      {openProblems.length > 0 && (
        <DashboardSection
          title="Assistência em aberto"
          description="Casos que podem impactar experiência do cliente, prazo e garantia."
          icon={AlertTriangle}
          action={
            <Link href="/problemas">
              <Button variant="link" size="sm" className="gap-1">
                Ver todos <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {openProblems.map((p, i) => (
              <Link
                key={`${p.product}-${p.customer}-${i}`}
                href="/problemas"
                className="rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:border-warning-200 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy-900">{p.product}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{p.customer}</p>
                  </div>
                  <Badge variant={p.priority === "high" ? "red" : "yellow"}>
                    {p.priority === "high" ? "Crítico" : "Acompanhar"}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                    {p.tag}
                  </span>
                  <span className="text-xs font-medium text-gray-400">Assistência técnica</span>
                </div>
              </Link>
            ))}
          </div>
        </DashboardSection>
      )}
    </div>
  )
}
