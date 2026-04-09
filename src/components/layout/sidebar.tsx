"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Package, ShoppingCart, ShieldCheck, AlertTriangle, FileText, Users, Truck, DollarSign, Settings, Smartphone, Calculator, ListChecks } from "lucide-react"
import { useState, useEffect, createContext, useContext, useCallback } from "react"
import { supabase } from "@/lib/supabase"

export interface NavItem {
  label: string
  href: string
  icon: any
  badge?: {
    count: number
    color: string
  }
}

export interface BadgeCountContextType {
  counts: Record<string, number>
  refresh: () => void
}

export const BadgeCountContext = createContext<BadgeCountContextType>({
  counts: {},
  refresh: () => {},
})

export function useBadgeCount() {
  return useContext(BadgeCountContext)
}

const staticNavItems: (Omit<NavItem, "badge"> & { badge?: { count?: number; defaultCount?: number; color: string; source?: "db"; countKey?: string } })[] = [
  { label: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { label: "Estoque", href: "/estoque", icon: Package, badge: { defaultCount: 0, color: "bg-royal-500", source: "db", countKey: "estoque" } },
  { label: "Vendas", href: "/vendas", icon: ShoppingCart },
  { label: "Avaliação de Recebimento", href: "/avaliacao", icon: Calculator },
  { label: "Preços de Fornecedores", href: "/precos-fornecedor", icon: ListChecks },
  { label: "Garantias", href: "/garantias", icon: ShieldCheck, badge: { defaultCount: 0, color: "bg-danger-500", source: "db", countKey: "garantias" } },
  { label: "Problemas", href: "/problemas", icon: AlertTriangle, badge: { defaultCount: 0, color: "bg-warning-500", source: "db", countKey: "problemas" } },
  { label: "Cotações", href: "/cotacoes", icon: FileText },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Fornecedores", href: "/fornecedores", icon: Truck },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign },
  { label: "Laudos", href: "/historico", icon: FileText },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { counts } = useBadgeCount()

  const navItems: NavItem[] = staticNavItems.map((item) => {
    if (item.badge?.source === "db") {
      const dbCount = counts[item.badge.countKey || "estoque"] ?? item.badge.defaultCount ?? 0
      return { ...item, badge: { count: dbCount, color: item.badge.color } } as NavItem
    }
    if (item.badge?.defaultCount !== undefined && item.badge.source !== "db") {
      return { ...item, badge: { count: item.badge.defaultCount, color: item.badge.color } } as NavItem
    }
    return item as NavItem
  })

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 hidden md:flex flex-col h-screen bg-navy-900 text-white transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-navy-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-royal-500 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="font-display font-bold text-base tracking-tight block leading-tight font-syne">
                NOBRETECH
              </span>
              <span className="text-white/50 text-xs block -mt-0.5">Store</span>
            </div>
          )}
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 group relative",
                    isActive
                      ? "bg-royal-500 text-white"
                      : "text-white/60 hover:bg-navy-800 hover:text-white"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="font-medium">{item.label}</span>
                      {item.badge && (
                        <span
                          className={cn(
                            "ml-auto text-xs px-2 py-0.5 rounded-full font-bold",
                            item.badge.color,
                            "text-white"
                          )}
                        >
                          {item.badge.count}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge && (
                    <span
                      className={cn(
                        "absolute top-1 right-1 w-2 h-2 rounded-full",
                        item.badge.color
                      )}
                    />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-navy-800">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-white/40 hover:bg-navy-800 hover:text-white/60 transition-colors"
        >
          {collapsed ? "→" : "← Recolher"}
        </button>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const pathname = usePathname()

  const tabs = [
    { label: "Início", href: "/dashboard", icon: BarChart3 },
    { label: "Estoque", href: "/estoque", icon: Package },
    { label: "Vender", href: "/estoque/novo", icon: ShoppingCart, primary: true },
    { label: "Garantias", href: "/garantias", icon: ShieldCheck },
    { label: "Menu", href: "/dashboard#menu", icon: Settings },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden bg-white border-t border-gray-200 safe-bottom">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || (tab.href !== "/dashboard" && pathname?.startsWith(tab.href))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-2 text-xs transition-colors",
              tab.primary
                ? "-mt-4"
                : "",
              isActive && !tab.primary
                ? "text-royal-500"
                : tab.primary
                ? ""
                : "text-gray-400"
            )}
          >
            {tab.primary ? (
              <div className="w-12 h-12 rounded-full bg-royal-500 flex items-center justify-center shadow-lg animate-pulse-glow">
                <tab.icon className="w-6 h-6 text-white" />
              </div>
            ) : (
              <>
                <tab.icon className={cn("w-5 h-5 mt-0.5", isActive ? "text-royal-500" : "")} />
                <span className="mt-0.5">{tab.label}</span>
              </>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

import { useRouter } from "next/navigation"

export function DashboardLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const [counts, setCounts] = useState<Record<string, number>>({ estoque: 0, garantias: 0 })
  const [refreshKey, setRefreshKey] = useState(0)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const router = useRouter()

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      try {
        // 1. Guard check
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.push("/login")
          return
        }
        setCheckingAuth(false)

        // 2. Data fetching
        const { data, error } = await (supabase
          .from("inventory") as any)
          .select("id")
          .in("status", ["active", "in_stock"] as any)
        if (!error) {
          setCounts((prev) => ({ ...prev, estoque: data?.length ?? 0 }))
        }

        const today = new Date().toISOString().split("T")[0]
        const { data: warrantyData, error: warrantyError } = await (supabase
          .from("warranties") as any)
          .select("id")
          .gte("end_date", today)
          .neq("status", "expired")
          .neq("status", "voided")
        if (!warrantyError) {
          setCounts((prev) => ({ ...prev, garantias: warrantyData?.length ?? 0 }))
        }

        // Contagem de problemas (apenas não fechados)
        const { data: problemsData } = await (supabase
          .from("problems") as any)
          .select("id")
          .neq("status", "closed")
        if (!problemsData?.length) {
          setCounts((prev) => ({ ...prev, problemas: 0 }))
        } else {
          setCounts((prev) => ({ ...prev, problemas: problemsData.length }))
        }
      } catch {
        // ignore
      }
    }

    checkAuthAndFetch()
    const interval = setInterval(checkAuthAndFetch, 5000)
    return () => clearInterval(interval)
  }, [refreshKey, router])

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-royal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BadgeCountContext.Provider value={{ counts, refresh }}>
      <div className="min-h-screen bg-surface font-inter">
        <Sidebar />
        <MobileNav />
        {/* Main content */}
        <main className="md:ml-64 pb-20 md:pb-0 min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl border-b border-gray-100">
            <div className="flex items-center justify-between h-14 px-4 sm:px-6">
              <div className="flex items-center gap-2 md:hidden">
                <div className="w-8 h-8 rounded-lg bg-royal-500 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
                <span className="font-display font-bold text-sm font-syne text-navy-900">NOBRETECH</span>
              </div>
              <h1 className="hidden md:block font-display font-semibold text-navy-900 font-syne">
                {title}
              </h1>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-navy-900 text-white flex items-center justify-center text-sm font-bold">
                  V
                </div>
              </div>
            </div>
          </header>
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </BadgeCountContext.Provider>
  )
}
