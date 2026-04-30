"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { daysBetween, formatBRL, getProductName } from "@/lib/helpers"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
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
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Sparkles,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts"
import Link from "next/link"

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
const CACHE_KEY = "dashboard_data_v5"
const CACHE_TTL = 3 * 60 * 1000 // 3 minutos

type SalesComparisonPoint = {
  label: string
  gross: number
  net: number
}

type StockTurnoverItem = {
  id: string
  name: string
  category: string
  days: number
  quantity: number
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

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatChartLabel(value: number) {
  if (!value) return ""
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const compact = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(".", ",")
    return `${value < 0 ? "-" : ""}R$ ${compact}k`
  }
  return formatBRL(value)
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

function DashboardMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "blue",
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof DollarSign
  tone?: DashboardTone
}) {
  const classes = toneClasses[tone]
  const muted = tone === "navy" ? "text-white/60" : "text-gray-500"
  const label = tone === "navy" ? "text-white/55" : "text-gray-400"

  return (
    <div className={`min-w-0 rounded-2xl border p-4 shadow-sm ${classes.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider ${label}`}>{title}</p>
          <p className={`mt-3 break-words text-xl font-semibold leading-tight tracking-normal sm:text-2xl ${classes.value}`}>
            {value}
          </p>
          <p className={`mt-2 text-xs leading-snug ${muted}`}>{subtitle}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${classes.icon}`}>
          <Icon className={`h-5 w-5 ${classes.iconText}`} />
        </div>
      </div>
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
  children: React.ReactNode
  action?: React.ReactNode
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

  const [totalInvested, setTotalInvested] = useState(0)
  const [monthlySales, setMonthlySales] = useState(0)
  const [monthlyProfit, setMonthlyProfit] = useState(0)
  const [avgMargin, setAvgMargin] = useState(0)

  const [salesChartData, setSalesChartData] = useState<{ month: string; value: number }[]>([])
  const [salesComparisonMode, setSalesComparisonMode] = useState<"day" | "month">("day")
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

      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL) {
          setTotalInvested(data.totalInvested)
          setMonthlySales(data.monthlySales)
          setMonthlyProfit(data.monthlyProfit)
          setAvgMargin(data.avgMargin)
          setSalesChartData(data.salesChartData)
          const cachedDailyComparison = data.dailySalesComparison || []
          const cachedMonthlyComparison = data.monthlySalesComparison || []
          const hasComparisonData =
            [...cachedDailyComparison, ...cachedMonthlyComparison].some((point: SalesComparisonPoint) => point.gross > 0 || point.net > 0) ||
            !data.monthlySales

          if (!hasComparisonData) {
            localStorage.removeItem(CACHE_KEY)
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
          if (hasComparisonData) {
            setLoading(false)
            return
          }
        }
      }

      const now = new Date()
      const startOfMonth = dateKey(new Date(now.getFullYear(), now.getMonth(), 1))
      const in30Days = dateKey(new Date(now.getTime() + 30 * 86400000))

      const [
        inventoryRes,
        salesMonthRes,
        salesLast6Res,
        salesCategoryRes,
        turnoverSalesRes,
        warrantiesRes,
        problemsRes,
        recentSalesRes,
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
          .select("sale_price, net_amount, sale_date, created_at, source_type, supplier_cost, notes, inventory:inventory_id(purchase_price, type), sales_additional_items(*)")
          .gte("sale_date", startOfMonth),

        (supabase.from("sales") as any)
          .select("sale_price, net_amount, sale_date, source_type, supplier_cost, notes, inventory:inventory_id(purchase_price, type), sales_additional_items(*)")
          .gte("sale_date", dateKey(new Date(now.getFullYear(), now.getMonth() - 5, 1)))
          .order("sale_date", { ascending: true })
          .limit(200),

        (supabase.from("sales") as any)
          .select("inventory:inventory_id(catalog:catalog_id(category))")
          .gte("sale_date", new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split("T")[0]),

        (supabase.from("sales") as any)
          .select(`
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
          .gte("sale_date", new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split("T")[0])
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
          .select("sale_price, created_at, customer:customer_id(full_name), inventory:inventory_id(catalog:catalog_id(model, brand))")
          .order("created_at", { ascending: false })
          .limit(6),
      ])

      const inventory = ((inventoryRes.data as any[]) ?? []).filter((i) => (i.type || "own") === "own")
      const invested = inventory.reduce((acc, i) => acc + (i.purchase_price ?? 0), 0)
      setTotalInvested(invested)
      setStockCount(inventory.length)

      const activeTurnoverItems: StockTurnoverItem[] = inventory.map((item: any) => {
        const quantity = Math.max(1, Number(item.quantity || 1))
        const days = Math.max(0, daysBetween(item.purchase_date))
        const category = item.catalog?.category
          ? String(item.catalog.category).charAt(0).toUpperCase() + String(item.catalog.category).slice(1)
          : "Outros"

        return {
          id: item.id,
          name: getProductName(item),
          category,
          days,
          quantity,
          value: Number(item.purchase_price || 0) * quantity,
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

      const salesMonth = ((salesMonthRes.data as any[]) ?? []).filter((s) => (s.source_type || "own") === "own")
      const totalSales = salesMonth.reduce((acc, s) => acc + (s.sale_price ?? 0), 0)
      setMonthlySales(totalSales)

      const getSaleProfit = (s: any) => {
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

      const profits = salesMonth.map(getSaleProfit)
      const totalProfit = profits.reduce((a, b) => a + b, 0)
      setMonthlyProfit(totalProfit)

      if (totalSales > 0) {
        setAvgMargin(Math.round((totalProfit / totalSales) * 100 * 10) / 10)
      }

      const salesLast6 = (salesLast6Res.data as any[]) ?? []
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

      const daysInMonth = now.getDate()
      const dayMap: Record<string, SalesComparisonPoint> = {}
      for (let day = 1; day <= daysInMonth; day++) {
        const label = String(day).padStart(2, "0")
        dayMap[label] = { label, gross: 0, net: 0 }
      }
      salesMonth.forEach((s: any) => {
        const day = String(new Date(s.sale_date || s.created_at).getDate()).padStart(2, "0")
        if (!dayMap[day]) dayMap[day] = { label: day, gross: 0, net: 0 }
        dayMap[day].gross += Number(s.sale_price || 0)
        dayMap[day].net += getSaleProfit(s)
      })
      const nextDailyComparison = Object.values(dayMap).filter((point) => point.gross > 0 || point.net > 0)
      setDailySalesComparison(nextDailyComparison)

      const monthComparisonMap: Record<string, SalesComparisonPoint> = {}
      Object.keys(monthMap).forEach((key) => {
        monthComparisonMap[key] = {
          label: MONTHS_PT[parseInt(key.split("-")[1]) - 1],
          gross: 0,
          net: 0,
        }
      })
      salesLast6
        .filter((s: any) => (s.source_type || "own") === "own")
        .forEach((s: any) => {
          const key = s.sale_date.slice(0, 7)
          if (!monthComparisonMap[key]) return
          monthComparisonMap[key].gross += Number(s.sale_price || 0)
          monthComparisonMap[key].net += getSaleProfit(s)
        })

      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      if (
        salesMonth.length > 0 &&
        monthComparisonMap[currentMonthKey] &&
        monthComparisonMap[currentMonthKey].gross === 0
      ) {
        monthComparisonMap[currentMonthKey].gross = totalSales
        monthComparisonMap[currentMonthKey].net = totalProfit
      }
      const nextMonthlyComparison = Object.values(monthComparisonMap)
      setMonthlySalesComparison(nextMonthlyComparison)

      const catRaw = (salesCategoryRes.data as any[]) ?? []
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
          detail: `${s.inventory?.catalog?.brand ?? ""} ${s.inventory?.catalog?.model ?? "—"} → ${s.customer?.full_name ?? "Cliente"}`,
          time: relativeTime(s.created_at),
        }))
      )

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: {
          totalInvested: invested,
          monthlySales: totalSales,
          monthlyProfit: totalProfit,
          avgMargin: totalSales > 0 ? Math.round((totalProfit / totalSales) * 100 * 10) / 10 : 0,
          salesChartData: nextSalesChartData,
          dailySalesComparison: nextDailyComparison,
          monthlySalesComparison: nextMonthlyComparison,
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
            detail: `${s.inventory?.catalog?.brand ?? ""} ${s.inventory?.catalog?.model ?? "—"} → ${s.customer?.full_name ?? "Cliente"}`,
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
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
        <p className="text-sm">Carregando dados do banco...</p>
      </div>
    )
  }

  const healthTone: "green" | "yellow" | "red" =
    monthlyProfit < 0 || problemsCount > 0 ? "red" : turnoverSummary.watchCount > 0 || turnoverSummary.stuckCount > 0 ? "yellow" : "green"
  const healthLabel =
    healthTone === "red" ? "Atenção" : healthTone === "yellow" ? "Monitorar" : "Operação saudável"
  const topCategory = categoryData[0]
  const stockPressure =
    turnoverSummary.stuckCount > 0
      ? `${turnoverSummary.stuckCount} item(ns) acima de 45 dias`
      : turnoverSummary.watchCount > 0
        ? `${turnoverSummary.watchCount} item(ns) em observação`
        : "Estoque sem alerta crítico"
  const decisionItems = [
    turnoverSummary.priorityItems[0]
      ? `Priorize ${turnoverSummary.priorityItems[0].name}, com ${turnoverSummary.priorityItems[0].days} dias em estoque.`
      : "Sem item prioritário para giro neste momento.",
    topCategory
      ? `${topCategory.name} concentra ${topCategory.value}% das vendas recentes.`
      : "Ainda não há mix suficiente para analisar categorias vendidas.",
    problemsCount > 0
      ? `${problemsCount} problema(s) aberto(s) podem afetar pós-venda.`
      : "Pós-venda sem problemas abertos.",
  ]
  const salesComparisonData =
    salesComparisonMode === "day" ? dailySalesComparison : monthlySalesComparison

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                  <Sparkles className="h-5 w-5 text-white/80" />
                </span>
                <Badge variant={healthTone}>{healthLabel}</Badge>
              </div>
              <h2 className="font-syne text-2xl font-semibold tracking-normal">Painel de decisão</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Visão rápida do caixa operacional, vendas, margem e pontos que precisam de ação hoje.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Resultado</p>
                <p className="mt-2 text-2xl font-semibold tracking-normal">{formatBRL(monthlyProfit)}</p>
                <p className="mt-1 text-xs text-white/55">{avgMargin}% margem no mês</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Estoque</p>
                <p className="mt-2 text-2xl font-semibold tracking-normal">{stockCount}</p>
                <p className="mt-1 text-xs text-white/55">{stockPressure}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-2 border-t border-white/10 p-5 sm:grid-cols-3 sm:p-6">
            {decisionItems.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-2xl bg-white/[0.06] p-3 text-sm text-white/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <DashboardMetricCard
            title="Investido"
            value={formatBRL(totalInvested)}
            subtitle="capital em estoque"
            icon={CircleDollarSign}
            tone="blue"
          />
          <DashboardMetricCard
            title="Vendas"
            value={formatBRL(monthlySales)}
            subtitle="faturamento do mês"
            icon={ShoppingCart}
            tone="green"
          />
          <DashboardMetricCard
            title="Lucro"
            value={formatBRL(monthlyProfit)}
            subtitle="resultado das vendas"
            icon={TrendingUp}
            tone={monthlyProfit >= 0 ? "green" : "red"}
          />
          <DashboardMetricCard
            title="Margem"
            value={`${avgMargin}%`}
            subtitle="média no mês"
            icon={Percent}
            tone="yellow"
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
              <h3 className="font-display font-semibold text-navy-900 font-syne">Giro de estoque</h3>
              <p className="text-sm text-gray-500">
                Enxerga capital parado, tempo médio em estoque e quais itens precisam ser priorizados.
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
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Parado</p>
                <PackageSearch className="w-4 h-4 text-gray-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-normal text-navy-900">{turnoverSummary.stuckCount}</p>
              <p className="mt-1 text-xs text-gray-500">+45 dias · {formatBRL(turnoverSummary.stuckValue)}</p>
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
                  return (
                    <Link key={item.id} href={`/estoque/${item.id}`} className="rounded-2xl border border-gray-100 bg-white p-4 hover:border-royal-200 hover:shadow-sm transition-all">
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
                          <p className="font-semibold text-navy-900">{item.days}d</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Custo</p>
                          <p className="font-semibold text-navy-900">{formatBRL(item.value)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Sugerido</p>
                          <p className="font-semibold text-navy-900">{item.suggested ? formatBRL(item.suggested) : "—"}</p>
                        </div>
                      </div>
                    </Link>
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
        action={<Badge variant={monthlySales > 0 ? "green" : "gray"}>{monthlySales > 0 ? "Com vendas" : "Sem vendas"}</Badge>}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
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
                <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-royal-100 px-3 py-1 text-royal-700">Receita bruta</span>
                  <span className="rounded-full bg-success-100 px-3 py-1 text-success-700">Lucro líquido</span>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={salesComparisonData} barGap={8} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        formatBRL(Number(value)),
                        name === "gross" ? "Receita bruta" : "Lucro líquido",
                      ]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                    />
                    <Bar dataKey="gross" fill="#3A6BC4" radius={[8, 8, 0, 0]}>
                      <LabelList
                        dataKey="gross"
                        position="top"
                        formatter={(value: unknown) => formatChartLabel(Number(value))}
                        fill="#2F5EB6"
                        fontSize={11}
                        fontWeight={700}
                      />
                    </Bar>
                    <Bar dataKey="net" fill="#36B37E" radius={[8, 8, 0, 0]}>
                      <LabelList
                        dataKey="net"
                        position="top"
                        formatter={(value: unknown) => formatChartLabel(Number(value))}
                        fill="#169B62"
                        fontSize={11}
                        fontWeight={700}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
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
                </ResponsiveContainer>
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
