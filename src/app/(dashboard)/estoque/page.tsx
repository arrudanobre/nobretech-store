"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { CategoryIcon } from "@/components/ui/icon-helpers"
import { formatBRL, daysBetween } from "@/lib/helpers"
import { CATEGORIES, GRADES } from "@/lib/constants"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/toaster"
import { useBadgeCount } from "@/components/layout/sidebar"
import { Plus, Search, Package, Loader2, Trash2 } from "lucide-react"

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
  photos?: string[]
  battery_health?: number
  ios_version?: string
  condition_notes?: string
  catalog?: any
  product_catalog?: any
  sales?: any
  created_at: string
}

const statusLabels: Record<string, { label: string; badge: "green" | "red" | "yellow" | "gray" }> = {
  in_stock: { label: "Disponível", badge: "green" },
  sold: { label: "Vendido", badge: "gray" },
  under_repair: { label: "Em reparo", badge: "red" },
  returned: { label: "Devolvido", badge: "red" },
  trade_in_received: { label: "Trade-In", badge: "yellow" },
}

export default function InventoryPage() {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [activeStatus, setActiveStatus] = useState("all")
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toast } = useToast()
  const { refresh: refreshBadge } = useBadgeCount()

  const fetchInventory = useCallback(async () => {
    try {
      const { data, error } = await (supabase
        .from("inventory") as any)
        .select(`
          *,
          catalog:catalog_id (id, category, model, variant, storage, color, brand, year),
          sales(sale_price)
        `)
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setItems(data || [])
    } catch (err: any) {
      console.error("Erro detalhado ao carregar estoque:", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      })
    } finally {
      setLoading(false)
      refreshBadge()
    }
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm("Tem certeza que deseja excluir este item?")) return

    setDeletingId(id)
    try {
      const { error } = await (supabase.from("inventory") as any).delete().eq("id", id)
      if (error) throw error

      setItems((prev) => prev.filter((i) => i.id !== id))
      refreshBadge()
      toast({
        title: "Item excluído",
        description: "O aparelho foi removido do estoque.",
        type: "success",
      })
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err?.message || "Não foi possível excluir o item.",
        type: "error",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = items.filter((item) => {
    const matchCategory = activeCategory === "all" || item.catalog?.category === activeCategory
    const matchStatus = activeStatus === "all" || item.status === activeStatus
    const matchSearch = search
      ? (item.catalog?.model || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.imei || "").includes(search) ||
        false
      : true
    return matchCategory && matchStatus && matchSearch
  })

  const inStockCount = items.filter((i) => i.status === "in_stock").length

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Estoque</h2>
          <p className="text-sm text-gray-500">{inStockCount} disponíveis · {items.length} total</p>
        </div>
        <Link href="/estoque/novo">
          <Button variant="primary" size="sm">
            <Plus className="w-4 h-4" /> Novo Aparelho
          </Button>
        </Link>
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
            <option value="in_stock">Disponível</option>
            <option value="sold">Vendido</option>
            <option value="under_repair">Em reparo</option>
          </select>
        </div>
        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeCategory === "all"
                ? "bg-navy-900 text-white border-navy-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-navy-900"
            }`}
          >
            Todos
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setActiveCategory(c.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                activeCategory === c.value
                  ? "bg-navy-900 text-white border-navy-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-navy-900"
              }`}
            >
              <CategoryIcon category={c.value} className="!w-3.5 !h-3.5" />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-12 shadow-sm text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-navy-900 font-medium">Nenhum aparelho encontrado</p>
          <p className="text-sm text-gray-500 mt-1">Tente ajustar os filtros ou cadastre um novo produto</p>
          <Link href="/estoque/novo">
            <Button className="mt-4" variant="primary" size="sm">
              <Plus className="w-4 h-4" /> Cadastrar Aparelho
            </Button>
          </Link>
        </div>
      )}

      {/* Product Cards Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((item: any) => {
            const status = statusLabels[item.status as any] || { label: item.status, badge: "gray" as const }
            const gradeInfo = GRADES.find((g) => g.value === item.grade)
            const days = daysBetween(item.purchase_date)
            const cat = item.catalog || item.product_catalog
            const catalogName = cat ? `${cat.model}${cat.variant ? " " + cat.variant : ""}` : "Sem catálogo"
            const catalogStorage = cat?.storage || ""
            const catalogColor = cat?.color || ""
            
            const sale = item.sales?.[0] || item.sales
            const salePrice = sale?.sale_price

            let salePriceColor = "text-navy-900"
            if (salePrice && item.suggested_price) {
              if (salePrice >= item.suggested_price) {
                salePriceColor = "text-emerald-600"
              } else if (salePrice < item.suggested_price * 0.85) {
                salePriceColor = "text-red-600"
              }
            }

            return (
              <div
                key={item.id}
                className="group bg-card rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden animate-fade-in relative"
              >
                <Link href={`/estoque/${item.id}`} className="block">
                {/* Photo */}
                <div className="aspect-[4/3] relative">
                  {item.photos && item.photos.length > 0 ? (
                    <PhotoCarousel photos={item.photos} alt={catalogName}>
                      {item.status === "sold" && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                          <span className="bg-white text-navy-900 px-3 py-1 rounded-lg text-xs font-bold -rotate-12">
                            VENDIDO
                          </span>
                        </div>
                      )}
                      {item.status === "under_repair" && (
                        <div className="absolute inset-0 bg-red-900/20 flex items-center justify-center z-10">
                          <span className="bg-danger-500 text-white px-3 py-1 rounded-lg text-xs font-bold">
                            EM REPARO
                          </span>
                        </div>
                      )}
                      {item.grade && (
                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-xs font-bold z-10 ${gradeInfo?.color}`}>
                          {item.grade}
                        </span>
                      )}
                      {days > 30 && item.status === "in_stock" && (
                        <span className="absolute top-2 left-2 bg-danger-500 text-white px-2 py-0.5 rounded-md text-[10px] font-bold z-10">
                          {days} dias
                        </span>
                      )}
                    </PhotoCarousel>
                  ) : (
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 w-full h-full flex items-center justify-center">
                      <span className="text-4xl">
                        {item.catalog || item.product_catalog ? <CategoryIcon category={(item.catalog || item.product_catalog).category} className="!w-8 !h-8" /> : "📦"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="font-medium text-sm text-navy-900 truncate">{catalogName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {[catalogStorage, catalogColor].filter(Boolean).join(" · ")}
                  </p>
                  {/* Battery / iOS for phones */}
                  {item.battery_health && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Bateria {item.battery_health}%
                      {item.ios_version && ` · iOS ${item.ios_version}`}
                    </p>
                  )}

                  {/* Price info */}
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Custo</p>
                      <p className="text-sm font-bold text-navy-900">{formatBRL(item.purchase_price)}</p>
                    </div>
                    <div className="text-right">
                      {item.suggested_price && (
                        <div className={item.status === "sold" ? "mb-1" : ""}>
                          <p className="text-[10px] text-gray-400 leading-tight">Sugerido</p>
                          <p className={`font-bold ${item.status === "sold" ? "text-xs text-gray-400" : "text-sm text-royal-500"}`}>
                            {formatBRL(item.suggested_price)}
                          </p>
                        </div>
                      )}
                      {item.status === "sold" && salePrice && (
                        <div className="pt-1 border-t border-gray-50">
                          <p className="text-[10px] text-gray-500 leading-tight">Venda</p>
                          <p className={`text-sm font-bold ${salePriceColor}`}>{formatBRL(salePrice)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="mt-2">
                    <Badge variant={status.badge} dot>{status.label}</Badge>
                  </div>
                </div>
                </Link>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  disabled={deletingId === item.id}
                  className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-white/80 hover:bg-danger-500 hover:text-white text-gray-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="Excluir item"
                >
                  {deletingId === item.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PhotoCarousel({ photos, alt, children }: { photos: string[]; alt: string; children?: React.ReactNode }) {
  const [current, setCurrent] = useState(0)
  const [next, setNext] = useState<number | null>(null)
  const isTransitioning = next !== null
  const hasMultiple = photos.length > 1

  const goTo = (idx: number) => {
    if (idx === current || isTransitioning) return
    setNext(idx)
    setTimeout(() => {
      setCurrent(idx)
      setNext(null)
    }, 250)
  }

  const step = (dir: 1 | -1) => {
    goTo((current + dir + photos.length) % photos.length)
  }

  if (!hasMultiple) {
    return (
      <div className="relative w-full h-full">
        <img src={photos[0]} alt={alt} className="w-full h-full object-cover" />
        {children}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full select-none">
      {/* Current photo */}
      <img
        src={photos[current]}
        alt={alt}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-250 ${isTransitioning ? "opacity-0" : "opacity-100"}`}
      />
      {/* Next photo (crossfade layer) */}
      {isTransitioning && (
        <img
          src={photos[next!]}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover opacity-100"
        />
      )}

      {/* Arrow nav */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); step(-1) }}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 z-10"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); step(1) }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 z-10"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
        {photos.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); goTo(i) }}
            className={`h-1 rounded-full transition-all duration-200 ${
              i === current ? "w-4 bg-white" : "w-1 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>

      {/* Overlays (badges, etc) */}
      {children}
    </div>
  )
}
