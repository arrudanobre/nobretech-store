"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Package, ShoppingCart, ShieldCheck, AlertTriangle, FileText, Users, Truck, DollarSign, Settings, Smartphone, Calculator, ListChecks, ChevronDown, Menu, X } from "lucide-react"
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
  items?: {
    label: string
    href: string
    disabled?: boolean
  }[]
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
  {
    label: "Financeiro",
    href: "/financeiro",
    icon: DollarSign,
    items: [
      { label: "Painel Financeiro", href: "/financeiro" },
      { label: "Entradas e Saídas", href: "/financeiro/transacoes" },
      { label: "Contas a Receber", href: "/financeiro/receber" },
      { label: "Contas a Pagar", href: "/financeiro/pagar" },
      { label: "Cartões", href: "/financeiro/cartoes" },
      { label: "Gastos Mensais", href: "/financeiro/gastos" },
      { label: "ROI de Marketing", href: "/financeiro/marketing" },
      { label: "Taxas da Maquininha", href: "/financeiro/taxas" },
      { label: "DRE", href: "/financeiro/dre" },
      { label: "Plano de DRE", href: "/financeiro/plano-dre" },
    ]
  },
  { label: "Laudos", href: "/historico", icon: FileText },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "/financeiro": pathname?.startsWith("/financeiro")
  })
  const { counts } = useBadgeCount()

  const toggleMenu = (href: string) => {
    setOpenMenus(prev => ({ ...prev, [href]: !prev[href] }))
  }

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
            const isExactActive = pathname === item.href
            const isChildActive = pathname !== item.href && pathname?.startsWith(item.href) && item.href !== "/dashboard"
            const isActive = isExactActive || isChildActive
            const isOpen = openMenus[item.href] || false
            const hasItems = item.items && item.items.length > 0

            return (
              <li key={item.href} className="flex flex-col">
                {hasItems && !collapsed ? (
                  <button
                    onClick={() => toggleMenu(item.href)}
                    className={cn(
                      "flex items-center w-full gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 group relative",
                      isActive && !isOpen
                        ? "bg-navy-800 text-white"
                        : "text-white/60 hover:bg-navy-800 hover:text-white"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-royal-500" : "")} />
                    <span className={cn("font-medium", isActive ? "text-white" : "")}>{item.label}</span>
                    <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", isOpen ? "rotate-180" : "")} />
                  </button>
                ) : (
                  <Link
                    href={hasItems && collapsed ? item.items![0].href : item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 group relative",
                      isActive && !hasItems
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
                )}

                {!collapsed && hasItems && isOpen && (
                  <ul className="mt-1 ml-9 space-y-1 pr-2">
	                    {item.items!.map((subItem) => {
	                      const isSubActive = pathname === subItem.href
                      const isSubItemDisabled = subItem.disabled === true
	                      if (isSubItemDisabled) {
	                        return (
	                          <li key={subItem.label}>
	                            <div className="flex items-center justify-between px-3 py-2 text-xs text-white/30 cursor-not-allowed">
	                              <span>{subItem.label}</span>
                              <span className="bg-navy-800 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">Em breve</span>
                            </div>
                          </li>
                        )
                      }
                      return (
                        <li key={subItem.href}>
                          <Link
                            href={subItem.href}
                            className={cn(
                              "block rounded-lg px-3 py-2 text-xs transition-colors",
                              isSubActive
                                ? "bg-royal-500/20 text-royal-400 font-medium"
                                : "text-white/50 hover:text-white hover:bg-navy-800/50"
                            )}
                          >
                            {subItem.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
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

export function MobileNav({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const { counts } = useBadgeCount()

  useEffect(() => {
    onOpenChange(false)
  }, [pathname, onOpenChange])

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

  const tabs = [
    { label: "Início", href: "/dashboard", icon: BarChart3 },
    { label: "Estoque", href: "/estoque", icon: Package },
    { label: "Avaliar", href: "/avaliacao", icon: Calculator, primary: true },
    { label: "Vendas", href: "/vendas", icon: ShoppingCart },
    { label: "Menu", href: "#menu", icon: Menu, menu: true },
  ]

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-navy-950/50"
            onClick={() => onOpenChange(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[86vw] max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-royal-500 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-display font-bold text-sm font-syne text-navy-900">NOBRETECH</p>
                  <p className="text-xs text-gray-400">Menu</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border border-gray-200 p-2 text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-gray-100 p-4">
              <Link
                href="/avaliacao"
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-2xl bg-navy-900 px-4 py-4 text-white shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-500">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Avaliação de Recebimento</p>
                  <p className="text-xs text-white/60">Consultar preço de entrada</p>
                </div>
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const isExactActive = pathname === item.href
                  const isChildActive = pathname !== item.href && pathname?.startsWith(item.href) && item.href !== "/dashboard"
                  const isActive = isExactActive || isChildActive
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => onOpenChange(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                          isActive ? "bg-royal-50 text-royal-600" : "text-gray-600 hover:bg-gray-50"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className="font-medium">{item.label}</span>
                        {item.badge && item.badge.count > 0 && (
                          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white", item.badge.color)}>
                            {item.badge.count}
                          </span>
                        )}
                      </Link>
	                      {item.items && (
	                        <div className="ml-8 mt-1 space-y-1">
	                          {item.items
                            .filter((subItem) => !subItem.disabled)
	                            .map((subItem) => (
	                            <Link
	                              key={subItem.href}
	                              href={subItem.href}
	                              onClick={() => onOpenChange(false)}
	                              className={cn(
                                "block rounded-lg px-3 py-2 text-xs",
                                pathname === subItem.href ? "bg-royal-50 text-royal-600 font-medium" : "text-gray-500 hover:bg-gray-50"
                              )}
	                            >
	                              {subItem.label}
	                            </Link>
	                          ))}
	                        </div>
	                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
          </aside>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden bg-white border-t border-gray-200 safe-bottom">
        {tabs.map((tab) => {
          const isActive = tab.menu ? isOpen : pathname === tab.href || (tab.href !== "/dashboard" && pathname?.startsWith(tab.href))
          const Icon = tab.icon
          const content = tab.primary ? (
            <>
              <div className="w-12 h-12 rounded-full bg-royal-500 flex items-center justify-center shadow-lg animate-pulse-glow">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <span className="mt-0.5 text-[11px] font-semibold text-royal-500">{tab.label}</span>
            </>
          ) : (
            <>
              <Icon className={cn("w-5 h-5 mt-0.5", isActive ? "text-royal-500" : "")} />
              <span className="mt-0.5">{tab.label}</span>
            </>
          )

          if (tab.menu) {
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => onOpenChange(!isOpen)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-2 text-xs transition-colors",
                  isActive ? "text-royal-500" : "text-gray-400"
                )}
              >
                {content}
              </button>
            )
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-2 text-xs transition-colors",
                tab.primary ? "-mt-5" : "",
                isActive && !tab.primary ? "text-royal-500" : tab.primary ? "" : "text-gray-400"
              )}
            >
              {content}
            </Link>
          )
        })}
      </nav>
    </>
  )
}

export function DashboardLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const [counts, setCounts] = useState<Record<string, number>>({ estoque: 0, garantias: 0 })
  const [refreshKey, setRefreshKey] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    const fetchCounts = async () => {
      try {
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

    fetchCounts()
    const interval = setInterval(fetchCounts, 5000)
    return () => clearInterval(interval)
  }, [refreshKey])

  return (
    <BadgeCountContext.Provider value={{ counts, refresh }}>
      <div className="min-h-screen bg-surface font-inter">
        <Sidebar />
        <MobileNav isOpen={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
        {/* Main content */}
        <main className="md:ml-64 pb-20 md:pb-0 min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl border-b border-gray-100">
            <div className="flex items-center justify-between h-14 px-4 sm:px-6">
              <div className="flex items-center gap-2 md:hidden">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  onClick={() => setMobileMenuOpen(true)}
                  className="mr-1 rounded-xl border border-gray-200 bg-white p-2 text-navy-900 shadow-sm"
                >
                  <Menu className="h-4 w-4" />
                </button>
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
