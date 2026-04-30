"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { CategoryIcon } from "@/components/ui/icon-helpers"
import { daysBetween, formatBRL, getProductName, getInventoryStatusMeta, getComputedInventoryStatus, isPendingInventoryStatus, normalizeInventoryStatus } from "@/lib/helpers"
import { CATEGORIES, GRADES } from "@/lib/constants"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/toaster"
import { useBadgeCount } from "@/components/layout/sidebar"
import { Plus, Search, Package, Loader2, Trash2, Eye, Pencil } from "lucide-react"

const INVENTORY_DELETE_ALLOWED_EMAIL = "arrudanobre@gmail.com"

interface InventoryItem {
  id: string
  catalog_id?: string | null
  imei?: string
  serial_number?: string
  grade?: string
  status?: string
  purchase_price: number
  suggested_price?: number
  purchase_date: string
  quantity?: number
  type?: "own" | "supplier"
  supplier_name?: string | null
  foto_url?: string | null
  photos?: string[]
  battery_health?: number
  ios_version?: string
  condition_notes?: string
  notes?: string
  catalog?: any
  product_catalog?: any
  sales?: any
  created_at: string
}


export default function InventoryPage() {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [activeStatus, setActiveStatus] = useState("all")
  const [activeGrade, setActiveGrade] = useState("all")
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [canDeleteInventory, setCanDeleteInventory] = useState(false)
  const { toast } = useToast()
  const { refresh: refreshBadge } = useBadgeCount()

  const pageRef = useRef(1)

  const getManualCategoryLabel = (item: InventoryItem) => {
    const text = `${item.notes || ""} ${item.condition_notes || ""}`.toLowerCase()
    return /capa|pel[ií]cula|pencil|caneta|cabo|fonte|carregador|acess[oó]rio/.test(text) ? "Acessório" : "Outros"
  }

  const getManualCategoryValue = (item: InventoryItem) => {
    return getManualCategoryLabel(item) === "Acessório" ? "accessories" : "other"
  }

  const getTurnoverMeta = (item: InventoryItem) => {
    const days = Math.max(0, daysBetween(item.purchase_date))
    if (getComputedInventoryStatus(item) !== "active") {
      return { days, label: "—", className: "bg-gray-100 text-gray-500" }
    }
    if (days >= 45) return { days, label: `${days}d`, className: "bg-danger-100 text-danger-700" }
    if (days >= 20) return { days, label: `${days}d`, className: "bg-warning-100 text-warning-700" }
    return { days, label: `${days}d`, className: "bg-success-100 text-success-700" }
  }

  const fetchInventory = useCallback(async (loadMore = false) => {
    const currentPage = loadMore ? pageRef.current + 1 : 1
    const itemsPerPage = 20

    try {
      if (loadMore) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }

      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      let categoryCatalogIds: string[] | null = null
      if (activeCategory !== "all" && activeCategory !== "accessories") {
        const { data: categoryCatalogs, error: categoryError } = await (supabase
          .from("product_catalog") as any)
          .select("id")
          .eq("category", activeCategory)

        if (categoryError) throw categoryError
        categoryCatalogIds = (categoryCatalogs || []).map((catalog: any) => catalog.id)

        if (categoryCatalogIds && categoryCatalogIds.length === 0) {
          setItems([])
          setPage(1)
          pageRef.current = 1
          setHasMore(false)
          return
        }
      }

      let query = (supabase.from("inventory") as any)
        .select(`
          id,
          catalog_id,
          imei,
          serial_number,
          grade,
          status,
          purchase_price,
          suggested_price,
          purchase_date,
          quantity,
          type,
          supplier_name,
          battery_health,
          ios_version,
          condition_notes,
          notes,
          created_at
        `)
        .order("created_at", { ascending: false })

      if (activeGrade !== "all") query = query.eq("grade", activeGrade)
      if (activeStatus !== "all") {
        if (activeStatus === "active") {
          query = query.in("status", ["active", "in_stock"])
        } else {
          query = query.eq("status", activeStatus)
        }
      }
      if (categoryCatalogIds) query = query.in("catalog_id", categoryCatalogIds)

      const searchTerm = search.trim()
      if (searchTerm) {
        query = query.or(`imei.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%,condition_notes.ilike.%${searchTerm}%`)
      }

      const { data: inventoryData, error: inventoryError } = await query
        .range(from, to)
        .limit(itemsPerPage)

      if (inventoryError) throw inventoryError

      const catalogIds = Array.from(new Set((inventoryData || []).map((item: any) => item.catalog_id).filter(Boolean)))

      let catalogsById: Record<string, any> = {}
      if (catalogIds.length > 0) {
        const { data: catalogsData, error: catalogError } = await (supabase
          .from("product_catalog") as any)
          .select("id, category, model, variant, storage, color, brand, year")
          .in("id", catalogIds)

        if (catalogError) throw catalogError

        catalogsById = (catalogsData || []).reduce((acc: Record<string, any>, catalog: any) => {
          acc[catalog.id] = catalog
          return acc
        }, {})
      }

      const hydratedData = (inventoryData || []).map((item: any) => ({
        ...item,
        catalog: item.catalog_id ? catalogsById[item.catalog_id] || null : null,
      }))

      if (loadMore) {
        setItems(prev => [...prev, ...hydratedData])
        setPage(currentPage)
        pageRef.current = currentPage
      } else {
        setItems(hydratedData)
        setPage(1)
        pageRef.current = 1
      }

      setHasMore(hydratedData.length === itemsPerPage)
    } catch (err: any) {
      console.error("Erro ao carregar estoque:", err?.message)
      const isTimeout = err?.message?.includes("statement timeout")

      toast({
        title: isTimeout ? "Consulta demorou demais" : "Erro ao carregar estoque",
        description: isTimeout
          ? "A busca de estoque excedeu o tempo limite. Tente refinar filtros e recarregar."
          : "Não foi possível carregar os dados. Tente novamente.",
        type: "error",
      })
    } finally {
      setLoading(false)
      setLoadingMore(false)
      refreshBadge()
    }
  }, [activeCategory, activeGrade, activeStatus, refreshBadge, search, toast])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchInventory(false)
    }, search.trim() ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [fetchInventory, search])

  useEffect(() => {
    let mounted = true
    const loadDeletePermission = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setCanDeleteInventory(data.user?.email === INVENTORY_DELETE_ALLOWED_EMAIL)
    }
    loadDeletePermission()
    return () => {
      mounted = false
    }
  }, [])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      if (!canDeleteInventory) {
        toast({
          title: "Acesso negado",
          description: `Apenas ${INVENTORY_DELETE_ALLOWED_EMAIL} pode excluir itens do estoque.`,
          type: "error",
        })
        return
      }

      // 1. Check permissions (Admin only)
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email !== INVENTORY_DELETE_ALLOWED_EMAIL) {
        toast({
          title: "Acesso negado",
          description: `Apenas ${INVENTORY_DELETE_ALLOWED_EMAIL} pode excluir itens do estoque.`,
          type: "error",
        })
        return
      }

      if (!confirm("Tem certeza que deseja excluir? Isso removerá permanentemente a venda, garantia e histórico vinculados.")) return

      setDeletingId(id)

      // 2. Sequential Cleanup (Cascading)
      // Delete problems
      await (supabase.from("problems") as any).delete().eq("inventory_id", id)
      // Delete warranties
      await (supabase.from("warranties") as any).delete().eq("inventory_id", id)
      // Delete sales
      await (supabase.from("sales") as any).delete().eq("inventory_id", id)
      
      // 3. Delete Main Record
      const { error } = await (supabase.from("inventory") as any).delete().eq("id", id)
      if (error) throw error

      setItems((prev) => prev.filter((i) => i.id !== id))
      refreshBadge()
      toast({
        title: "Item e histórico excluídos",
        description: "O aparelho e todos os seus registros foram removidos.",
        type: "success",
      })
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err?.message || "Não foi possível realizar a exclusão completa.",
        type: "error",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const cat = item.catalog || item.product_catalog
      const categoryLabel = CATEGORIES.find((category) => category.value === cat?.category)?.label || cat?.category || getManualCategoryLabel(item)
      const categoryValue = cat?.category || getManualCategoryValue(item)
      const searchText = [
        getProductName(item),
        cat?.model,
        item.imei,
        item.serial_number,
        categoryLabel,
        cat?.category,
        item.notes,
        item.condition_notes,
      ].filter(Boolean).join(" ").toLowerCase()
      const matchCategory = activeCategory === "all" || categoryValue === activeCategory
      const matchStatus = activeStatus === "all" || normalizeInventoryStatus(getComputedInventoryStatus(item)) === activeStatus
      const matchGrade = activeGrade === "all" ? true : item.grade === activeGrade
      const matchSearch = search ? searchText.includes(search.toLowerCase()) : true
      return matchCategory && matchStatus && matchSearch && matchGrade
    })
  }, [items, activeCategory, activeStatus, activeGrade, search])

  const inStockCount = useMemo(() => items.filter((i) => getComputedInventoryStatus(i) === "active").length, [items])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Estoque</h2>
          <p className="text-sm text-gray-500">{inStockCount} disponíveis · {items.length} total</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/estoque/compras/nova">
            <Button variant="outline" size="sm">
              <Package className="w-4 h-4" /> Compra em lote
            </Button>
          </Link>
          <Link href="/estoque/novo">
            <Button variant="primary" size="sm">
              <Plus className="w-4 h-4" /> Novo Aparelho
            </Button>
          </Link>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-card rounded-2xl border border-gray-100 p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Buscar por IMEI, modelo, serial…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <select
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm min-w-[110px]"
            value={activeStatus}
            onChange={(e) => setActiveStatus(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="active">Disponível</option>
            <option value="reserved">Reservado</option>
            <option value="sold">Vendido</option>
            <option value="under_repair">Em reparo</option>
          </select>
        </div>
        {/* Filter Tabs */}
        <div className="flex flex-col gap-3">
          {/* Grade/Condition Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide border-b border-gray-50 pb-2">
            <button
              onClick={() => setActiveGrade("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                activeGrade === "all"
                  ? "bg-navy-900 text-white border-navy-900 shadow-sm"
                  : "bg-white text-gray-400 border-gray-100 hover:border-gray-300"
              }`}
            >
              Qualquer Grade
            </button>
            {GRADES.map((g) => (
              <button
                key={g.value}
                onClick={() => setActiveGrade(g.value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                  activeGrade === g.value
                    ? g.value === 'Lacrado' ? "bg-royal-600 text-white border-royal-600 shadow-sm" : "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-gray-500 border-gray-100 hover:border-gray-200"
                }`}
              >
                {g.value === 'Lacrado' && <span>📦</span>}
                {g.label}
              </button>
            ))}
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setActiveCategory("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                activeCategory === "all"
                  ? "bg-navy-900 text-white border-navy-900 shadow-sm"
                  : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
              }`}
            >
              Toda Loja
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveCategory(c.value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                  activeCategory === c.value
                    ? "bg-navy-900 text-white border-navy-900 shadow-sm"
                    : "bg-white text-gray-500 border-gray-100 hover:border-navy-900"
                }`}
              >
                <CategoryIcon category={c.value} className="!w-3.5 !h-3.5" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="grid grid-cols-2 lg:grid-cols-10 gap-3 p-4 border-b border-gray-50 animate-pulse">
              <div className="h-4 bg-gray-100 rounded col-span-2" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {loadingMore && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 text-center text-sm text-gray-500">
          <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
          Carregando mais itens...
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-12 shadow-sm text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-navy-900 font-medium">Nenhum aparelho encontrado</p>
          <p className="text-sm text-gray-500 mt-1">Tente ajustar os filtros ou cadastre um novo produto</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/estoque/compras/nova">
              <Button variant="outline" size="sm">
                <Package className="w-4 h-4" /> Compra em lote
              </Button>
            </Link>
            <Link href="/estoque/novo">
              <Button variant="primary" size="sm">
                <Plus className="w-4 h-4" /> Cadastrar Aparelho
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Inventory table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1.6fr_0.75fr_1.05fr_0.7fr_0.55fr_0.5fr_0.75fr_0.75fr_0.65fr_0.75fr_0.75fr] gap-3 px-4 py-3 bg-gray-50 text-[11px] uppercase tracking-wider font-bold text-gray-500">
            <span>Produto</span>
            <span>Categoria</span>
            <span>IMEI / Serial</span>
            <span>Condição</span>
            <span>Bateria</span>
            <span>Qtd</span>
            <span>Custo</span>
            <span>Sugerido</span>
            <span>Giro</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="divide-y divide-gray-100">
            {filtered.map((item: any) => {
              const computedStatus = getComputedInventoryStatus(item)
              const status = getInventoryStatusMeta(computedStatus)
              const cat = item.catalog || item.product_catalog
              const categoryLabel = CATEGORIES.find((category) => category.value === cat?.category)?.label || cat?.category || getManualCategoryLabel(item)
              const product = getProductName(item)
              const identity = [item.imei ? `IMEI ${item.imei}` : null, item.serial_number ? `Serial ${item.serial_number}` : null].filter(Boolean).join(" · ") || "—"
              const quantity = item.type === "supplier" ? "—" : Math.max(1, item.quantity || 1)
              const turnover = getTurnoverMeta(item)

              return (
                <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.75fr_1.05fr_0.7fr_0.55fr_0.5fr_0.75fr_0.75fr_0.65fr_0.75fr_0.75fr] gap-2 lg:gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                  <div className="min-w-0">
                    <Link href={`/estoque/${item.id}`} className="font-semibold text-sm text-navy-900 hover:text-royal-500 truncate block">{product}</Link>
                    <p className="text-xs text-gray-500 truncate lg:hidden">{categoryLabel} · {identity}</p>
                    {item.type === "supplier" && <p className="text-xs text-gray-400">Fornecedor{item.supplier_name ? `: ${item.supplier_name}` : ""}</p>}
                  </div>
                  <div className="hidden lg:flex items-center text-sm text-gray-600">{categoryLabel}</div>
                  <div className="hidden lg:flex items-center text-xs text-gray-500">{identity}</div>
                  <div className="flex items-center">
                    <span className="lg:hidden text-xs text-gray-400 mr-2">Condição:</span>
                    <span className="text-sm font-medium text-navy-900">{item.grade || "—"}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="lg:hidden text-xs text-gray-400 mr-2">Bateria:</span>
                    {item.battery_health ? `${item.battery_health}%` : "—"}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="lg:hidden text-xs text-gray-400 mr-2">Qtd:</span>
                    {quantity}
                  </div>
                  <div className="flex items-center text-sm font-semibold text-navy-900">
                    <span className="lg:hidden text-xs text-gray-400 mr-2">Custo:</span>
                    {formatBRL(item.purchase_price)}
                  </div>
                  <div className="flex items-center text-sm font-semibold text-royal-500">
                    <span className="lg:hidden text-xs text-gray-400 mr-2">Sugerido:</span>
                    {item.suggested_price ? formatBRL(item.suggested_price) : "—"}
                  </div>
                  <div className="flex items-center">
                    <span className="lg:hidden text-xs text-gray-400 mr-2">Giro:</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${turnover.className}`}>
                      {turnover.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={status.badge} dot>{status.label}</Badge>
                    {isPendingInventoryStatus(computedStatus) && <span className="text-[11px] text-amber-700">Incompleto</span>}
                  </div>
                  <div className="flex items-center justify-start lg:justify-end gap-1">
                    <Link href={`/estoque/${item.id}`}>
                      <Button variant="ghost" size="icon" title="Ver detalhes">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/estoque/${item.id}/editar`}>
                      <Button variant="ghost" size="icon" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </Link>
                    {canDeleteInventory && (
                      <button onClick={(e) => handleDelete(item.id, e)} disabled={deletingId === item.id} className="h-10 w-10 rounded-xl text-gray-400 hover:bg-danger-500 hover:text-white inline-flex items-center justify-center transition-colors" title="Excluir item">
                        {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )}

        {!loading && filtered.length > 0 && hasMore && (
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              onClick={() => fetchInventory(true)}
              disabled={loadingMore}
              className="px-6"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                'Carregar mais'
              )}
            </Button>
          </div>
        )}

        {/* Mostrando quando não há mais itens */}
        {!loading && filtered.length > 0 && !hasMore && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">Todos os itens foram carregados.</p>
          </div>
        )}
    </div>
  )
}
