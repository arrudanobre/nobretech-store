"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { KPICard } from "@/components/ui/kpi-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/helpers"
import {
  DollarSign,
  Package,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ShoppingCart,
  Percent,
  Loader2,
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
} from "recharts"
import Link from "next/link"

// ── Category colours ────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  iPhone: "#3A6BC4",
  iPad: "#3ABF82",
  "Apple Watch": "#C9A84C",
  AirPods: "#E05C5C",
  MacBook: "#8B5CF6",
  Garmin: "#06B6D4",
  Outros: "#94a3b8",
}

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

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

// ── Page ────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)

  // KPIs
  const [totalInvested, setTotalInvested] = useState(0)
  const [monthlySales, setMonthlySales] = useState(0)
  const [monthlyProfit, setMonthlyProfit] = useState(0)
  const [avgMargin, setAvgMargin] = useState(0)

  // Charts
  const [salesChartData, setSalesChartData] = useState<{ month: string; value: number }[]>([])
  const [categoryData, setCategoryData] = useState<{ name: string; value: number; color: string }[]>([])

  // Widgets
  const [expiringWarranties, setExpiringWarranties] = useState<
    { customer: string; product: string; days: number }[]
  >([])
  const [openProblems, setOpenProblems] = useState<
    { customer: string; product: string; tag: string; priority: string }[]
  >([])
  const [recentActivity, setRecentActivity] = useState<
    { action: string; detail: string; time: string }[]
  >([])
  const [stockCount, setStockCount] = useState(0)
  const [warrantiesCount, setWarrantiesCount] = useState(0)
  const [problemsCount, setProblemsCount] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0]

      // ── Run all queries in parallel ──────────────────────────
      const [
        inventoryRes,
        salesMonthRes,
        salesLast6Res,
        salesCategoryRes,
        warrantiesRes,
        problemsRes,
        recentSalesRes,
      ] = await Promise.all([
        // Stock: items not yet sold
        supabase
          .from("inventory")
          .select("purchase_price, status")
          .in("status", ["available", "reserved", "in_stock"]),

        // This month's sales with cost price joined
        supabase
          .from("sales")
          .select("sale_price, net_amount, created_at, inventory:inventory_id(purchase_price)")
          .gte("sale_date", startOfMonth),

        // Last 6 months of sales for chart
        supabase
          .from("sales")
          .select("sale_price, sale_date")
          .gte("sale_date", new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split("T")[0])
          .order("sale_date", { ascending: true }),

        // Sales with category for donut chart
        supabase
          .from("sales")
          .select("inventory:inventory_id(catalog:catalog_id(category))")
          .gte("sale_date", new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split("T")[0]),

        // Warranties expiring in 30 days
        supabase
          .from("warranties")
          .select("end_date, customer:customer_id(full_name), inventory:inventory_id(catalog:catalog_id(model, brand))")
          .lte("end_date", in30Days)
          .gte("end_date", now.toISOString().split("T")[0])
          .eq("status", "active")
          .order("end_date", { ascending: true })
          .limit(5),

        // Open problems
        supabase
          .from("problems")
          .select("priority, tags, customer:customer_id(full_name), inventory:inventory_id(catalog:catalog_id(model))")
          .neq("status", "resolved")
          .order("created_at", { ascending: false })
          .limit(6),

        // Recent sales for activity feed
        supabase
          .from("sales")
          .select("sale_price, created_at, customer:customer_id(full_name), inventory:inventory_id(catalog:catalog_id(model, brand))")
          .order("created_at", { ascending: false })
          .limit(6),
      ])

      // ── KPIs ────────────────────────────────────────────────
      const inventory = inventoryRes.data ?? []
      const invested = inventory.reduce((acc, i) => acc + (i.purchase_price ?? 0), 0)
      setTotalInvested(invested)
      setStockCount(inventory.length)

      const salesMonth = salesMonthRes.data ?? []
      const totalSales = salesMonth.reduce((acc, s) => acc + (s.sale_price ?? 0), 0)
      setMonthlySales(totalSales)

      const profits = salesMonth.map((s) => {
        const cost = (s.inventory as any)?.purchase_price ?? 0
        const revenue = s.net_amount ?? s.sale_price ?? 0
        return revenue - cost
      })
      const totalProfit = profits.reduce((a, b) => a + b, 0)
      setMonthlyProfit(totalProfit)

      if (totalSales > 0) {
        setAvgMargin(Math.round((totalProfit / totalSales) * 100 * 10) / 10)
      }

      // ── Sales chart (last 6 months) ─────────────────────────
      const salesLast6 = salesLast6Res.data ?? []
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
      setSalesChartData(
        Object.entries(monthMap).map(([key, value]) => ({
          month: MONTHS_PT[parseInt(key.split("-")[1]) - 1],
          value,
        }))
      )

      // ── Category donut ──────────────────────────────────────
      const catRaw = salesCategoryRes.data ?? []
      const catCount: Record<string, number> = {}
      catRaw.forEach((s: any) => {
        const cat = s.inventory?.catalog?.category ?? "Outros"
        catCount[cat] = (catCount[cat] ?? 0) + 1
      })
      const total = Object.values(catCount).reduce((a, b) => a + b, 0) || 1
      setCategoryData(
        Object.entries(catCount).map(([name, count]) => ({
          name,
          value: Math.round((count / total) * 100),
          color: CATEGORY_COLORS[name] ?? CATEGORY_COLORS["Outros"],
        }))
      )

      // ── Warranties ──────────────────────────────────────────
      const warranties = warrantiesRes.data ?? []
      setWarrantiesCount(warranties.length)
      setExpiringWarranties(
        warranties.map((w: any) => ({
          customer: w.customer?.full_name ?? "—",
          product: w.inventory?.catalog ? `${w.inventory.catalog.brand} ${w.inventory.catalog.model}` : "—",
          days: daysUntil(w.end_date),
        }))
      )

      // ── Problems ────────────────────────────────────────────
      const problems = problemsRes.data ?? []
      setProblemsCount(problems.length)
      setOpenProblems(
        problems.map((p: any) => ({
          customer: p.customer?.full_name ?? "—",
          product: p.inventory?.catalog?.model ?? "—",
          tag: p.tags?.[0] ?? "outro",
          priority: p.priority ?? "medium",
        }))
      )

      // ── Recent activity (last sales) ─────────────────────────
      const recentSales = recentSalesRes.data ?? []
      setRecentActivity(
        recentSales.map((s: any) => ({
          action: "Venda realizada",
          detail: `${s.inventory?.catalog?.brand ?? ""} ${s.inventory?.catalog?.model ?? "—"} → ${s.customer?.full_name ?? "Cliente"}`,
          time: relativeTime(s.created_at),
        }))
      )

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard title="Investido em Estoque" value={totalInvested} icon={DollarSign} prefix="currency" gradient />
        <KPICard title="Vendas no Mês" value={monthlySales} icon={ShoppingCart} prefix="currency" />
        <KPICard title="Lucro Líquido" value={monthlyProfit} icon={TrendingUp} prefix="currency" />
        <KPICard title="Margem Média" value={avgMargin} icon={Percent} prefix="%" />
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Link href="/garantias">
          <div className="bg-card border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow transition-shadow cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-danger-500" />
              </div>
              <div>
                <p className="font-semibold text-navy-900">{warrantiesCount} Garantia{warrantiesCount !== 1 ? "s" : ""}</p>
                <p className="text-xs text-gray-500">Vencendo em 30 dias</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>
        </Link>
        <Link href="/problemas">
          <div className="bg-card border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow transition-shadow cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-warning-500" />
              </div>
              <div>
                <p className="font-semibold text-navy-900">{problemsCount} Problema{problemsCount !== 1 ? "s" : ""}</p>
                <p className="text-xs text-gray-500">Em aberto</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>
        </Link>
        <Link href="/estoque">
          <div className="bg-card border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow transition-shadow cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-royal-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-royal-500" />
              </div>
              <div>
                <p className="font-semibold text-navy-900">{stockCount} Aparelho{stockCount !== 1 ? "s" : ""}</p>
                <p className="text-xs text-gray-500">Em estoque</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>
        </Link>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales Chart */}
        <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-display font-semibold text-navy-900 mb-4 font-syne">Vendas — Últimos 6 meses</h3>
          {salesChartData.every((d) => d.value === 0) ? (
            <p className="text-sm text-gray-400 text-center py-16">Nenhuma venda registrada nos últimos 6 meses.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value))}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                />
                <Bar dataKey="value" fill="#3A6BC4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category Donut */}
        <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-display font-semibold text-navy-900 mb-4 font-syne">Categorias Vendidas</h3>
          {categoryData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">Nenhuma venda com categoria nos últimos 3 meses.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${Number(value)}%`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-xs">
                {categoryData.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
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

      {/* Expiring Warranties + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expiring Warranties */}
        <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-navy-900 font-syne">Garantias Vencendo</h3>
            <Link href="/garantias">
              <Button variant="link" size="sm">Ver todas</Button>
            </Link>
          </div>
          {expiringWarranties.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma garantia vencendo nos próximos 30 dias. 🎉</p>
          ) : (
            <div className="space-y-3">
              {expiringWarranties.map((w, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
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

        {/* Recent Activity */}
        <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-display font-semibold text-navy-900 mb-4 font-syne">Atividade Recente</h3>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda registrada ainda.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-royal-500" />
                  <div className="min-w-0">
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

      {/* Open Problems */}
      {openProblems.length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-navy-900 font-syne">Problemas em Aberto</h3>
            <Link href="/problemas">
              <Button variant="link" size="sm">Ver todos</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {openProblems.map((p, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border-l-4 ${
                  p.priority === "high" ? "border-l-orange-500" : "border-l-yellow-500"
                } bg-gray-50`}
              >
                <p className="text-sm font-medium text-navy-900">{p.product}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.customer}</p>
                <Badge variant={p.tag === "tela" ? "red" : "yellow"} className="mt-2">{p.tag}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
