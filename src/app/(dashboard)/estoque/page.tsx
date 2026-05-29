"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Eye,
  Filter,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProductAssetImage } from "@/components/products/product-asset-image"
import { CATEGORIES, GRADES } from "@/lib/constants"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/toaster"
import { useBadgeCount } from "@/components/layout/sidebar"
import { cn } from "@/lib/utils"
import { formatBRL, formatDate, getProductName } from "@/lib/helpers"
import {
  buildInventoryBatchReceiptUpdate,
  getInventoryArrivalAlerts,
  getInventoryAvailabilityLabel,
  getInventoryAvailabilityTone,
  getInventoryCommercialStatus,
  getInventoryCommercialStatusLabel,
  getInventoryCommercialStatusTone,
  getInventoryItemQuantity,
  getInventoryLogisticsStatus,
  getInventoryPurchaseBatchCode,
  getInventoryPurchaseBatchStatusLabel,
  getInventoryPurchaseBatchTimingLabel,
  getInventoryPurchaseBatchValue,
  getInventorySummary,
  getInventoryTimingLabel,
  isInventoryItemOfferable,
  isOngoingInventoryPurchase,
  type InventoryPurchaseBatch,
  type InventoryStatusTone,
} from "@/lib/inventory-logistics"

const INVENTORY_DELETE_ALLOWED_EMAIL = "arrudanobre@gmail.com"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ItemVariant = { color_name: string; quantity: number }

function variantSummaryLine(variants: ItemVariant[]): string | null {
  if (variants.length === 0) return null
  const total = variants.reduce((s, v) => s + v.quantity, 0)
  const parts = variants.slice(0, 3).map((v) => `${v.color_name} ${v.quantity}`)
  const more = variants.length > 3 ? ` +${variants.length - 3}` : ""
  return `${total} un. · ${parts.join(" · ")}${more}`
}

type QuickFilter = "all" | "in_stock" | "in_transit" | "reservable" | "reserved" | "pending_review" | "sold"

type DbError = { message: string }
type DbResult<T> = { data: T[] | null; error: DbError | null }
type DbSingleResult<T> = { data: T | null; error: DbError | null }
type DbValue = string | number | boolean | null | undefined
type DbPayload = Record<string, DbValue>

interface QueryBuilder<T> extends PromiseLike<DbResult<T>> {
  select(columns: string): QueryBuilder<T>
  in(column: string, values: readonly DbValue[]): QueryBuilder<T>
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  eq(column: string, value: DbValue): QueryBuilder<T>
  range(from: number, to: number): QueryBuilder<T>
  or(filter: string): QueryBuilder<T>
  update(values: DbPayload): QueryBuilder<T>
  delete(): QueryBuilder<T>
  single(): PromiseLike<DbSingleResult<T>>
}

function dbTable<T>(name: string): QueryBuilder<T> {
  return supabase.from(name) as unknown as QueryBuilder<T>
}

interface CatalogRow {
  id: string
  category?: string
  model?: string
  variant?: string
  storage?: string
  color?: string
  brand?: string
  year?: string | number
}

interface PurchaseLink {
  id: string
  supplier_name?: string | null
  purchase_date?: string | null
  ordered_at?: string | null
  expected_arrival_date?: string | null
  logistics_status?: string | null
  total_amount?: number | null
  products_amount?: number | null
  freight_amount?: number | null
  notes?: string | null
}

interface InventoryItem {
  id: string
  catalog_id?: string | null
  imei?: string | null
  serial_number?: string | null
  grade?: string | null
  status?: string | null
  logistics_status?: string | null
  commercial_status?: string | null
  inventory_purchase_id?: string | null
  expected_arrival_date?: string | null
  received_at?: string | null
  reserved_at?: string | null
  reservation_note?: string | null
  purchase_price: number
  suggested_price?: number | null
  purchase_date: string
  quantity?: number | null
  type?: "own" | "supplier"
  supplier_name?: string | null
  battery_health?: number | null
  condition_notes?: string | null
  notes?: string | null
  catalog?: CatalogRow | null
  product_catalog?: CatalogRow | null
  operational_image_url?: string | null
  operational_thumbnail_url?: string | null
  purchase?: PurchaseLink | null
  created_at: string
}

interface PurchaseItemLinkRow {
  inventory_id?: string | null
  purchase_id?: string | null
  quantity?: number | string | null
}

interface IdRow {
  id: string
}

function toneClass(tone: InventoryStatusTone) {
  const map: Record<InventoryStatusTone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-royal-100 text-royal-700",
    yellow: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-700",
    purple: "bg-purple-100 text-purple-700",
  }
  return map[tone]
}

function ToneBadge({ tone, children }: { tone: InventoryStatusTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", toneClass(tone))}>
      {children}
    </span>
  )
}

function manualCategoryLabel(item: InventoryItem) {
  const text = `${item.notes || ""} ${item.condition_notes || ""}`.toLowerCase()
  return /capa|pel[ií]cula|pencil|caneta|cabo|fonte|carregador|acess[oó]rio|fone/.test(text) ? "Acessório" : "Outros"
}

function manualCategoryValue(item: InventoryItem) {
  return manualCategoryLabel(item) === "Acessório" ? "accessories" : "other"
}

function compactAvailabilityLabel(item: InventoryItem) {
  const label = getInventoryAvailabilityLabel(item)
  const labels: Record<string, string> = {
    "Em estoque fisico": "Em estoque",
    "Aguardando revisao": "Em revisão",
    "Recebimento parcial": "Parcial",
    Pedido: "A caminho",
  }
  return labels[label] || label
}

function maskedItemIdentity(item: InventoryItem) {
  const value = item.imei || item.serial_number
  if (!value) return ""
  const normalized = value.replace(/\s+/g, "")
  const prefix = item.imei ? "IMEI" : "Serial"
  return normalized.length > 4 ? `${prefix} ...${normalized.slice(-4)}` : `${prefix} ${normalized}`
}

function productMetaLine(item: InventoryItem, cat: CatalogRow | null | undefined, quantity: number) {
  return [
    cat?.color,
    item.grade,
    item.battery_health != null ? `${item.battery_health}%` : null,
    quantity > 1 ? `Qtd ${quantity}` : null,
  ].filter(Boolean).join(" · ")
}

function marginDisplay(item: InventoryItem) {
  const cost = Number(item.purchase_price || 0)
  const suggested = Number(item.suggested_price || 0)
  if (!cost || !suggested) return null

  const value = suggested - cost
  const percentage = (value / suggested) * 100
  return {
    value: formatBRL(value),
    percentage: `${percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    isPositive: value >= 0,
  }
}

function batchOrderedDate(batch: InventoryPurchaseBatch) {
  return batch.ordered_at || batch.purchase_date || null
}

export default function InventoryPage() {
  const routeSearchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")
  const [activeCategory, setActiveCategory] = useState("all")
  const [activeGrade, setActiveGrade] = useState("all")
  const [logisticsFilter, setLogisticsFilter] = useState("all")
  const [commercialFilter, setCommercialFilter] = useState("all")
  const [purchaseFilter, setPurchaseFilter] = useState("all")
  const [items, setItems] = useState<InventoryItem[]>([])
  const [ongoingBatches, setOngoingBatches] = useState<InventoryPurchaseBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [receivingBatchId, setReceivingBatchId] = useState<string | null>(null)
  const [variantsByItemId, setVariantsByItemId] = useState<Record<string, ItemVariant[]>>({})
  const [receivePromptBatch, setReceivePromptBatch] = useState<InventoryPurchaseBatch | null>(null)
  const [canDeleteInventory, setCanDeleteInventory] = useState(false)
  const { toast } = useToast()
  const { refresh: refreshBadge } = useBadgeCount()
  const pageRef = useRef(1)

  useEffect(() => {
    const purchaseId = routeSearchParams.get("purchase")
    if (purchaseId) setPurchaseFilter(purchaseId)
    const supplierName = routeSearchParams.get("supplier")
    if (supplierName) setSearch(supplierName)
  }, [routeSearchParams])

  const fetchOngoingBatches = useCallback(async () => {
    const { data, error } = await dbTable<InventoryPurchaseBatch>("inventory_purchases")
      .select("id, supplier_name, purchase_date, ordered_at, expected_arrival_date, logistics_status, total_amount, products_amount, freight_amount, notes")
      .in("logistics_status", ["ordered", "in_transit", "partially_received"])
      .order("expected_arrival_date", { ascending: true, nullsFirst: false })
      .limit(6)

    if (error) throw error

    const batches = (data || []) as InventoryPurchaseBatch[]
    const batchIds = batches.map((batch) => batch.id)
    let countsByPurchase: Record<string, number> = {}
    if (batchIds.length > 0) {
      const { data: rows, error: countError } = await dbTable<PurchaseItemLinkRow>("inventory_purchase_items")
        .select("purchase_id, quantity")
        .in("purchase_id", batchIds)
      if (countError) throw countError
      countsByPurchase = (rows || []).reduce((acc: Record<string, number>, row) => {
        if (row.purchase_id) acc[row.purchase_id] = (acc[row.purchase_id] || 0) + Number(row.quantity || 1)
        return acc
      }, {})
    }

    setOngoingBatches(batches.map((batch) => ({ ...batch, items_count: countsByPurchase[batch.id] || 0 })).filter(isOngoingInventoryPurchase))
  }, [])

  const fetchInventory = useCallback(async (loadMore = false) => {
    const currentPage = loadMore ? pageRef.current + 1 : 1
    const itemsPerPage = 20

    try {
      if (loadMore) setLoadingMore(true)
      else setLoading(true)

      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      let categoryCatalogIds: string[] | null = null
      if (activeCategory !== "all" && activeCategory !== "accessories" && activeCategory !== "other") {
        const { data: categoryCatalogs, error: categoryError } = await dbTable<IdRow>("product_catalog")
          .select("id")
          .eq("category", activeCategory)

        if (categoryError) throw categoryError
        categoryCatalogIds = (categoryCatalogs || []).map((catalog) => catalog.id)
        if (categoryCatalogIds && categoryCatalogIds.length === 0) {
          setItems([])
          pageRef.current = 1
          setHasMore(false)
          return
        }
      }

      let query = dbTable<InventoryItem>("inventory")
        .select(`
          id,
          catalog_id,
          imei,
          serial_number,
          grade,
          status,
          logistics_status,
          commercial_status,
          inventory_purchase_id,
          expected_arrival_date,
          received_at,
          reserved_at,
          reservation_note,
          purchase_price,
          suggested_price,
          purchase_date,
          quantity,
          type,
          supplier_name,
          battery_health,
          condition_notes,
          notes,
          operational_image_url,
          operational_thumbnail_url,
          created_at
        `)
        .order("created_at", { ascending: false })

      if (activeGrade !== "all") query = query.eq("grade", activeGrade)
      if (categoryCatalogIds) query = query.in("catalog_id", categoryCatalogIds)

      const searchTerm = search.trim()
      if (searchTerm) {
        query = query.or(`imei.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%,condition_notes.ilike.%${searchTerm}%`)
      }

      const { data: inventoryData, error: inventoryError } = await query.range(from, to).limit(itemsPerPage)
      if (inventoryError) throw inventoryError

      const inventoryRows = inventoryData || []
      const catalogIds = Array.from(new Set(inventoryRows.map((item) => item.catalog_id).filter((id): id is string => Boolean(id))))
      let catalogsById: Record<string, CatalogRow> = {}
      if (catalogIds.length > 0) {
        const { data: catalogsData, error: catalogError } = await dbTable<CatalogRow>("product_catalog")
          .select("id, category, model, variant, storage, color, brand, year")
          .in("id", catalogIds)
        if (catalogError) throw catalogError
        catalogsById = (catalogsData || []).reduce((acc: Record<string, CatalogRow>, catalog) => {
          acc[catalog.id] = catalog
          return acc
        }, {})
      }

      const inventoryIds = inventoryRows.map((item) => item.id)
      const explicitPurchaseIds = inventoryRows.map((item) => item.inventory_purchase_id).filter((id): id is string => Boolean(id))
      let purchaseIdByInventory: Record<string, string> = {}
      let purchasesById: Record<string, PurchaseLink> = {}

      if (inventoryIds.length > 0) {
        const { data: purchaseItems } = await dbTable<PurchaseItemLinkRow>("inventory_purchase_items")
          .select("inventory_id, purchase_id")
          .in("inventory_id", inventoryIds)
        purchaseIdByInventory = (purchaseItems || []).reduce((acc: Record<string, string>, row) => {
          if (row.inventory_id && row.purchase_id) acc[row.inventory_id] = row.purchase_id
          return acc
        }, {})
      }

      const purchaseIds = Array.from(new Set([...explicitPurchaseIds, ...Object.values(purchaseIdByInventory)]))
      if (purchaseIds.length > 0) {
        const { data: purchases } = await dbTable<PurchaseLink>("inventory_purchases")
          .select("id, supplier_name, purchase_date, ordered_at, expected_arrival_date, logistics_status, total_amount, products_amount, freight_amount, notes")
          .in("id", purchaseIds)
        purchasesById = (purchases || []).reduce((acc: Record<string, PurchaseLink>, purchase) => {
          acc[purchase.id] = purchase
          return acc
        }, {})
      }

      const hydrated: InventoryItem[] = inventoryRows.map((item) => {
        const purchaseId = item.inventory_purchase_id || purchaseIdByInventory[item.id] || null
        return {
          ...item,
          catalog: item.catalog_id ? catalogsById[item.catalog_id] || null : null,
          purchase: purchaseId ? purchasesById[purchaseId] || null : null,
        }
      })

      const pageInventoryIds = hydrated.map((item) => item.id)
      fetch("/api/inventory/batch-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_ids: pageInventoryIds }),
      })
        .then((res) => res.json())
        .then((payload) => {
          if (payload?.data?.variants_by_id) {
            setVariantsByItemId((prev) =>
              loadMore ? { ...prev, ...payload.data.variants_by_id } : payload.data.variants_by_id
            )
          }
        })
        .catch(() => null)

      if (loadMore) {
        setItems((prev) => [...prev, ...hydrated])
        pageRef.current = currentPage
      } else {
        setItems(hydrated)
        pageRef.current = 1
        await fetchOngoingBatches()
      }

      setHasMore(hydrated.length === itemsPerPage)
    } catch (err: unknown) {
      console.error("Erro ao carregar estoque:", err instanceof Error ? err.message : err)
      toast({
        title: "Erro ao carregar estoque",
        description: "Verifique se a migration de status logistico foi aplicada antes de usar esta tela.",
        type: "error",
      })
    } finally {
      setLoading(false)
      setLoadingMore(false)
      refreshBadge()
    }
  }, [activeCategory, activeGrade, fetchOngoingBatches, refreshBadge, search, toast])

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchInventory(false), search.trim() ? 250 : 0)
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
      if (!confirm("Tem certeza que deseja excluir? Isso removerá permanentemente a venda, garantia e histórico vinculados.")) return

      setDeletingId(id)
      await dbTable<IdRow>("problems").delete().eq("inventory_id", id)
      await dbTable<IdRow>("warranties").delete().eq("inventory_id", id)
      await dbTable<IdRow>("sales").delete().eq("inventory_id", id)
      const { error } = await dbTable<IdRow>("inventory").delete().eq("id", id)
      if (error) throw error

      setItems((prev) => prev.filter((item) => item.id !== id))
      refreshBadge()
      toast({ title: "Item e histórico excluídos", description: "O produto foi removido.", type: "success" })
    } catch (err: unknown) {
      toast({ title: "Erro ao excluir", description: err instanceof Error ? err.message : "Não foi possível excluir.", type: "error" })
    } finally {
      setDeletingId(null)
    }
  }

  const reserveItem = async (item: InventoryItem) => {
    const note = window.prompt("Observação da reserva", item.reservation_note || "")
    if (note === null) return

    const { error } = await dbTable<IdRow>("inventory")
      .update({
        commercial_status: "reserved",
        status: "reserved",
        reserved_at: new Date().toISOString(),
        reservation_note: note || null,
      })
      .eq("id", item.id)

    if (error) {
      toast({ title: "Erro ao reservar", description: error.message, type: "error" })
      return
    }

    toast({ title: "Produto reservado", description: "Item marcado como reservado sem gerar venda concluída.", type: "success" })
    fetchInventory(false)
  }

  const receiveBatch = async (batchId: string, mode: "available" | "pending_review") => {
    setReceivingBatchId(batchId)
    try {
      const update = buildInventoryBatchReceiptUpdate(mode)
      const { error: purchaseError } = await dbTable<IdRow>("inventory_purchases")
        .update(update.purchase)
        .eq("id", batchId)
      if (purchaseError) throw purchaseError

      const { error: inventoryError } = await dbTable<IdRow>("inventory")
        .update(update.inventory)
        .eq("inventory_purchase_id", batchId)
      if (inventoryError) throw inventoryError

      toast({
        title: "Lote recebido",
        description: mode === "available" ? "Itens liberados como estoque físico." : "Itens recebidos e bloqueados para revisão.",
        type: "success",
      })
      setReceivePromptBatch(null)
      fetchInventory(false)
    } catch (error) {
      toast({ title: "Erro ao receber lote", description: error instanceof Error ? error.message : "Erro inesperado", type: "error" })
    } finally {
      setReceivingBatchId(null)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const cat = item.catalog || item.product_catalog
      const categoryLabel = CATEGORIES.find((category) => category.value === cat?.category)?.label || cat?.category || manualCategoryLabel(item)
      const categoryValue = cat?.category || manualCategoryValue(item)
      const logistics = getInventoryLogisticsStatus(item)
      const commercial = getInventoryCommercialStatus(item)
      const searchText = [
        getProductName(item),
        cat?.model,
        cat?.storage,
        cat?.color,
        item.imei,
        item.serial_number,
        categoryLabel,
        item.notes,
        item.condition_notes,
        item.purchase?.supplier_name,
        item.purchase ? getInventoryPurchaseBatchCode(item.purchase as InventoryPurchaseBatch) : null,
      ].filter(Boolean).join(" ").toLowerCase()

      const matchQuick =
        quickFilter === "all" ||
        (quickFilter === "in_stock" && logistics === "in_stock" && commercial === "available") ||
        (quickFilter === "in_transit" && ["ordered", "in_transit", "partially_received"].includes(logistics)) ||
        (quickFilter === "reservable" && commercial === "reservable") ||
        (quickFilter === "reserved" && commercial === "reserved") ||
        (quickFilter === "pending_review" && (logistics === "received_pending_review" || commercial === "blocked")) ||
        (quickFilter === "sold" && commercial === "sold")

      return (
        matchQuick &&
        (activeCategory === "all" || categoryValue === activeCategory) &&
        (activeGrade === "all" || item.grade === activeGrade) &&
        (logisticsFilter === "all" || logistics === logisticsFilter) &&
        (commercialFilter === "all" || commercial === commercialFilter) &&
        (purchaseFilter === "all" || item.inventory_purchase_id === purchaseFilter || item.purchase?.id === purchaseFilter) &&
        (!search || searchText.includes(search.toLowerCase()))
      )
    })
  }, [items, activeCategory, activeGrade, commercialFilter, logisticsFilter, purchaseFilter, quickFilter, search])

  const summary = useMemo(() => getInventorySummary(items), [items])
  const alerts = useMemo(() => getInventoryArrivalAlerts(items), [items])

  const quickFilters = [
    { key: "all" as const, label: "Todos", count: summary.total },
    { key: "in_stock" as const, label: "Em estoque", count: summary.inStock },
    { key: "in_transit" as const, label: "A caminho", count: summary.inTransit },
    { key: "reservable" as const, label: "Reserváveis", count: summary.reservable },
    { key: "reserved" as const, label: "Reservados", count: summary.reserved },
    { key: "pending_review" as const, label: "Aguardando revisão", count: summary.pendingReview },
    { key: "sold" as const, label: "Vendidos", count: summary.sold },
  ]

  const summaryCards = [
    { key: "in_stock" as const, label: "Em estoque físico", value: summary.inStock, caption: "Disponíveis para venda", icon: Package, tone: "green" as const },
    { key: "in_transit" as const, label: "A caminho", value: summary.inTransit, caption: "Previsão de chegada", icon: Truck, tone: "blue" as const },
    { key: "reserved" as const, label: "Reservado", value: summary.reserved, caption: "Aguardando cliente", icon: CheckCircle2, tone: "yellow" as const },
    { key: "pending_review" as const, label: "Aguardando revisão", value: summary.pendingReview, caption: "Recebido, em análise", icon: ClipboardCheck, tone: "purple" as const },
    { key: "sold" as const, label: "Vendidos", value: summary.sold, caption: "Este mês", icon: CheckCircle2, tone: "gray" as const },
    { key: "in_stock" as const, label: "Valor em estoque", value: formatBRL(summary.stockValue), caption: "Custo total", icon: DollarSign, tone: "green" as const },
  ]

  const clearFilters = () => {
    setQuickFilter("all")
    setActiveCategory("all")
    setActiveGrade("all")
    setLogisticsFilter("all")
    setCommercialFilter("all")
    setPurchaseFilter("all")
    setSearch("")
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-hidden animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-navy-900 font-syne">Estoque</h2>
          <p className="text-sm text-gray-500">
            {summary.inStock} em estoque físico · {summary.inTransit} a caminho · {summary.reserved} reservado(s) · {summary.pendingReview} aguardando revisão · {summary.total} total
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/estoque/compras">
            <Button variant="outline" size="sm">
              <Truck className="w-4 h-4" /> Compras de Estoque
            </Button>
          </Link>
          <Link href="/estoque/novo">
            <Button variant="primary" size="sm">
              <Plus className="w-4 h-4" /> Novo Produto
            </Button>
          </Link>
        </div>
      </div>

      {(alerts.arrivingSoon > 0 || alerts.delayed > 0 || alerts.pendingReview > 0) && (
        <div className="grid gap-2 lg:grid-cols-3">
          {alerts.arrivingSoon > 0 && <AlertCard tone="blue" text={`Você tem ${alerts.arrivingSoon} itens com chegada prevista para esta semana.`} />}
          {alerts.delayed > 0 && <AlertCard tone="yellow" text={`${alerts.delayed} itens estão com chegada atrasada. Confirme com o fornecedor.`} />}
          {alerts.pendingReview > 0 && <AlertCard tone="purple" text={`${alerts.pendingReview} itens foram recebidos e aguardam revisão antes de liberar para venda.`} />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <button
            key={`${card.label}-${card.tone}`}
            type="button"
            onClick={() => setQuickFilter(card.key)}
            className="min-h-[104px] min-w-0 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-royal-100 hover:shadow-md"
          >
            <div className="flex h-full min-w-0 items-center gap-3">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", toneClass(card.tone))}>
                <card.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className={cn("font-bold leading-none text-navy-900", card.label === "Valor em estoque" ? "whitespace-nowrap text-[17px]" : "text-2xl")}>{card.value}</p>
                <p className="mt-2 text-xs font-bold leading-tight text-navy-900">{card.label}</p>
                <p className="mt-1 truncate text-[11px] leading-tight text-gray-500">{card.caption}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {quickFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setQuickFilter(filter.key)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition",
                quickFilter === filter.key
                  ? "border-royal-500 bg-royal-500 text-white shadow-sm"
                  : "border-gray-200 bg-white/70 text-navy-900 hover:bg-white hover:border-gray-300"
              )}
            >
              {filter.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", quickFilter === filter.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500")}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="min-w-0 xl:col-span-2">
              <Input placeholder="Buscar por produto, IMEI, serial..." value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
            </div>
            <FilterField label="Categoria">
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900" value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)}>
                <option value="all">Todos</option>
                {CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                <option value="other">Outros</option>
              </select>
            </FilterField>
            <FilterField label="Disponibilidade">
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900" value={logisticsFilter} onChange={(e) => setLogisticsFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="in_stock">Em estoque físico</option>
                <option value="in_transit">A caminho</option>
                <option value="received_pending_review">Aguardando revisão</option>
                <option value="unavailable">Indisponível</option>
              </select>
            </FilterField>
            <FilterField label="Status comercial">
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900" value={commercialFilter} onChange={(e) => setCommercialFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="available">Disponível</option>
                <option value="reservable">Reservável</option>
                <option value="reserved">Reservado</option>
                <option value="blocked">Bloqueado</option>
                <option value="sold">Vendido</option>
              </select>
            </FilterField>
            <FilterField label="Lote / Pedido">
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900" value={purchaseFilter} onChange={(e) => setPurchaseFilter(e.target.value)}>
                <option value="all">Todos</option>
                {ongoingBatches.map((batch) => <option key={batch.id} value={batch.id}>{getInventoryPurchaseBatchCode(batch)}</option>)}
              </select>
            </FilterField>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-11 whitespace-nowrap px-3 text-gray-500">Limpar filtros</Button>
            <Button variant="outline" size="sm" className="h-11 whitespace-nowrap px-4">
              <Filter className="w-4 h-4" /> Mais filtros
            </Button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button type="button" onClick={() => setActiveGrade("all")} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold", activeGrade === "all" ? "border-navy-900 bg-navy-900 text-white" : "border-gray-100 bg-white text-gray-500")}>Qualquer condição</button>
            {GRADES.map((grade) => (
              <button key={grade.value} type="button" onClick={() => setActiveGrade(grade.value)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold", activeGrade === grade.value ? "border-navy-900 bg-navy-900 text-white" : "border-gray-100 bg-white text-gray-500")}>{grade.label}</button>
            ))}
          </div>
        </div>
      </div>

      {ongoingBatches.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-bold text-navy-900">Pedidos em andamento</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {ongoingBatches.map((batch) => (
              <div key={batch.id} className="grid gap-4 p-4 xl:grid-cols-[1.7fr_0.7fr_0.8fr_1fr_0.8fr_auto] xl:items-center">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-600"><Truck className="h-5 w-5" /></span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-navy-900">{getInventoryPurchaseBatchCode(batch)}</p>
                      <ToneBadge tone="blue">A caminho</ToneBadge>
                    </div>
                    <p className="text-sm text-gray-500">Fornecedor: {batch.supplier_name || "—"}</p>
                    <p className="text-xs text-gray-500">Pedido em: {formatDate(batchOrderedDate(batch))}</p>
                  </div>
                </div>
                <Metric label="Itens" value={`${Number(batch.items_count || 0)} produtos`} />
                <Metric label="Valor total" value={getInventoryPurchaseBatchValue(batch)} />
                <Metric label="Previsão de chegada" value={getInventoryPurchaseBatchTimingLabel(batch)} accent />
                <Metric label="Status" value={getInventoryPurchaseBatchStatusLabel(batch)} />
                <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                  <Button variant="outline" size="sm" onClick={() => setPurchaseFilter(batch.id)}>
                    <Eye className="w-4 h-4" /> Ver itens
                  </Button>
                  <Button variant="primary" size="sm" disabled={receivingBatchId === batch.id} onClick={() => setReceivePromptBatch(batch)}>
                    {receivingBatchId === batch.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                    Marcar como recebido
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <div key={index} className="grid grid-cols-2 gap-3 border-b border-gray-50 p-4 lg:grid-cols-12">
              <div className="col-span-2 h-4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <Package className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-medium text-navy-900">Nenhum produto encontrado</p>
          <p className="mt-1 text-sm text-gray-500">Ajuste filtros ou cadastre uma nova compra.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="block w-full max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-[1545px] table-fixed">
              <colgroup>
                <col style={{ width: 340 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 55 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 135 }} />
                <col style={{ width: 210 }} />
              </colgroup>
              <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <tr className="border-b border-gray-100">
                  <th scope="col" className="px-4 py-3 text-left">Produto</th>
                  <th scope="col" className="px-4 py-3 text-left">Categoria</th>
                  <th scope="col" className="px-4 py-3 text-left">Disponibilidade</th>
                  <th scope="col" className="px-4 py-3 text-left">Status</th>
                  <th scope="col" className="px-4 py-3 text-left">Lote / Pedido</th>
                  <th scope="col" className="px-4 py-3 text-center">Qtd</th>
                  <th scope="col" className="px-4 py-3 text-left">Custo</th>
                  <th scope="col" className="px-4 py-3 text-left">Sugerido</th>
                  <th scope="col" className="px-4 py-3 text-left">Margem</th>
                  <th scope="col" className="px-4 py-3 text-left">Giro / Prazo</th>
                  <th scope="col" className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const cat = item.catalog || item.product_catalog
                  const categoryLabel = CATEGORIES.find((category) => category.value === cat?.category)?.label || cat?.category || manualCategoryLabel(item)
                  const product = getProductName(item)
                  const purchase = item.purchase as InventoryPurchaseBatch | null
                  const logistics = getInventoryLogisticsStatus(item)
                  const commercial = getInventoryCommercialStatus(item)
                  const offerable = isInventoryItemOfferable(item)
                  const quantity = getInventoryItemQuantity(item)
                  const productMeta = productMetaLine(item, cat, quantity)
                  const identity = maskedItemIdentity(item)
                  const margin = marginDisplay(item)
                  const showReserveAction = (logistics === "ordered" || logistics === "in_transit" || logistics === "partially_received") && commercial === "reservable"
                  const purchaseLinkId = item.inventory_purchase_id && UUID_RE.test(item.inventory_purchase_id)
                    ? item.inventory_purchase_id
                    : purchase?.id && UUID_RE.test(purchase.id)
                      ? purchase.id
                      : null

                  return (
                    <tr key={item.id} className="h-[72px] text-sm transition hover:bg-gray-50/70">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex min-w-0 items-center gap-3">
                          <ProductAssetImage
                            brand={cat?.brand}
                            category={cat?.category}
                            model={cat?.model || product}
                            color={cat?.color}
                            operationalImageUrl={item.operational_image_url || null}
                            operationalThumbnailUrl={item.operational_thumbnail_url || null}
                            imageContext="stock"
                            size={48}
                            className="rounded-xl bg-white"
                          />
                          <div className="min-w-0">
                            <Link prefetch={false} href={`/estoque/${item.id}`} className="block truncate font-semibold text-navy-900 hover:text-royal-600">{product}</Link>
                            {productMeta ? <p className="truncate text-xs text-gray-500">{productMeta}</p> : null}
                            {variantSummaryLine(variantsByItemId[item.id] || []) ? (
                              <p className="truncate text-xs font-medium text-royal-600">{variantSummaryLine(variantsByItemId[item.id] || [])}</p>
                            ) : null}
                            {identity ? <p className="truncate text-[11px] text-gray-400">{identity}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="truncate px-4 py-3 align-middle text-gray-600">{categoryLabel}</td>
                      <td className="px-4 py-3 align-middle">
                        <ToneBadge tone={getInventoryAvailabilityTone(item)}>{compactAvailabilityLabel(item)}</ToneBadge>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <ToneBadge tone={getInventoryCommercialStatusTone(item)}>{getInventoryCommercialStatusLabel(item)}</ToneBadge>
                      </td>
                      <td className="truncate px-4 py-3 align-middle">
                        {purchase && purchaseLinkId ? (
                          <Link href={`/estoque/compras/${purchaseLinkId}`} className="block max-w-full truncate text-xs font-bold text-royal-600 hover:underline">{getInventoryPurchaseBatchCode(purchase)}</Link>
                        ) : purchase ? (
                          <span className="block max-w-full truncate text-xs font-bold text-gray-500">{getInventoryPurchaseBatchCode(purchase)}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center align-middle text-gray-600">{quantity}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-semibold text-navy-900">{Number(item.purchase_price || 0) > 0 ? formatBRL(Number(item.purchase_price)) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-semibold text-royal-600">{item.suggested_price ? formatBRL(Number(item.suggested_price)) : "—"}</td>
                      <td className="px-4 py-3 align-middle">
                        {margin ? (
                          <div className={cn("leading-tight", margin.isPositive ? "text-emerald-700" : "text-red-700")}>
                            <p className="whitespace-nowrap font-semibold">{margin.value}</p>
                            <p className="text-xs">{margin.percentage}</p>
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="overflow-hidden px-4 py-3 align-middle">
                        <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", logistics === "in_transit" || logistics === "ordered" || logistics === "partially_received" ? "bg-royal-50 text-royal-700" : "bg-emerald-50 text-emerald-700")}>
                          {getInventoryTimingLabel(item)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Link prefetch={false} href={`/estoque/${item.id}`}>
                            <Button variant="ghost" size="icon" title="Ver" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
                          </Link>
                          <Link prefetch={false} href={`/estoque/${item.id}/editar`}>
                            <Button variant="ghost" size="icon" title={logistics === "in_transit" ? "Editar previsão" : "Editar"} className="h-8 w-8"><Pencil className="w-4 h-4" /></Button>
                          </Link>
                          {showReserveAction ? (
                            <Button variant="outline" size="sm" onClick={() => reserveItem(item)} className="h-8 px-2.5">Reservar</Button>
                          ) : null}
                          {offerable ? <span className="sr-only">Pode virar oferta futura</span> : null}
                          <Button variant="ghost" size="icon" title="Menu de ações" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                          {canDeleteInventory && (
                            <button onClick={(e) => handleDelete(item.id, e)} disabled={deletingId === item.id} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 transition hover:bg-danger-500 hover:text-white" title="Excluir item">
                              {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
            <span>Mostrando {filtered.length} de {items.length} itens carregados</span>
            {hasMore ? (
              <Button variant="outline" size="sm" onClick={() => fetchInventory(true)} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Carregar mais
              </Button>
            ) : <span>Todos os itens carregados.</span>}
          </div>
        </div>
      )}

      {receivePromptBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-royal-600">Recebimento de lote</p>
              <h3 className="mt-1 text-lg font-bold text-navy-900">Você recebeu os itens deste lote?</h3>
              <p className="mt-1 text-sm text-gray-500">{getInventoryPurchaseBatchCode(receivePromptBatch)} · {receivePromptBatch.supplier_name || "Fornecedor não informado"}</p>
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => receiveBatch(receivePromptBatch.id, "available")}
                disabled={receivingBatchId === receivePromptBatch.id}
                className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-left transition hover:border-emerald-200"
              >
                <span className="block font-bold text-emerald-800">Liberar como em estoque</span>
                <span className="mt-1 block text-sm text-emerald-700">Itens viram estoque físico e status comercial disponível.</span>
              </button>
              <button
                type="button"
                onClick={() => receiveBatch(receivePromptBatch.id, "pending_review")}
                disabled={receivingBatchId === receivePromptBatch.id}
                className="rounded-xl border border-purple-100 bg-purple-50 p-4 text-left transition hover:border-purple-200"
              >
                <span className="block font-bold text-purple-800">Recebido, aguardando revisão</span>
                <span className="mt-1 block text-sm text-purple-700">Itens ficam bloqueados até laudo/conferência.</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setReceivePromptBatch(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AlertCard({ tone, text }: { tone: InventoryStatusTone; text: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium", toneClass(tone), tone === "yellow" ? "border-amber-100" : "border-transparent")}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("mt-1 text-sm font-bold", accent ? "text-royal-600" : "text-navy-900")}>{value}</p>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="relative block h-11 min-w-0">
      <span className="absolute -top-2 left-3 z-10 max-w-[calc(100%-1.5rem)] truncate bg-white px-1 text-[11px] font-medium leading-none text-gray-500">{label}</span>
      {children}
    </label>
  )
}
