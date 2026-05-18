"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Edit2,
  ExternalLink,
  Filter,
  History,
  Layers,
  Loader2,
  Megaphone,
  Package,
  Plus,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { SupplierOfferStatus, SupplierOfferCondition, SupplierOfferWarrantyType } from "@/lib/supplier-offers/types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierOffer {
  id: string
  batch_id: string | null
  supplier_id: string | null
  supplier_name: string | null
  source_line: string
  category: string | null
  brand: string | null
  model: string | null
  variant: string | null
  storage: string | null
  size: string | null
  color: string | null
  condition: SupplierOfferCondition | null
  battery_health: number | null
  warranty_type: SupplierOfferWarrantyType | null
  warranty_label: string | null
  warranty_until: string | null
  supplier_price: number | null
  suggested_sale_price: number | null
  estimated_margin: number | null
  confidence: string | null
  status: SupplierOfferStatus
  warnings: string[]
  duplicate_candidate: boolean
  created_at: string
  updated_at: string
  batch_created_at: string | null
}

interface Batch {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  source: string | null
  parser_mode: string | null
  ai_succeeded_blocks: number | null
  ai_failed_blocks: number | null
  local_fallback_blocks: number | null
  saved_count: number | null
  created_at: string
  offer_count: number
  available_count: number
  superseded_count: number
  needs_review_count: number
}

interface SupplierOption {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: number | null | undefined) {
  if (value == null) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function offerTitle(offer: SupplierOffer) {
  return [offer.model, offer.storage, offer.size, offer.color].filter(Boolean).join(" ") || "Produto não identificado"
}

const STATUS_CONFIG: Record<SupplierOfferStatus, { label: string; variant: "green" | "yellow" | "gray" | "red" | "blue" }> = {
  available:               { label: "Disponível",              variant: "green" },
  needs_review:            { label: "Para revisar",            variant: "yellow" },
  draft:                   { label: "Rascunho",                variant: "gray" },
  ignored:                 { label: "Ignorado",                variant: "gray" },
  unavailable:             { label: "Indisponível",            variant: "gray" },
  reserved_with_supplier:  { label: "Reservado c/ fornecedor", variant: "blue" },
  converted_to_inventory:  { label: "Convertido em estoque",   variant: "blue" },
  canceled:                { label: "Cancelado",               variant: "red" },
  superseded:              { label: "Substituído",             variant: "gray" },
}

function StatusBadge({ status }: { status: SupplierOfferStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "gray" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  offer: SupplierOffer
  onClose: () => void
  onSaved: (updated: Partial<SupplierOffer>) => void
}

const conditionOptions: Array<{ value: SupplierOfferCondition; label: string }> = [
  { value: "sealed", label: "Lacrado" },
  { value: "used", label: "Seminovo/usado" },
  { value: "unknown", label: "Condição incerta" },
]

const warrantyOptions: Array<{ value: SupplierOfferWarrantyType; label: string }> = [
  { value: "none", label: "Sem garantia informada" },
  { value: "apple", label: "Apple" },
  { value: "nobretech", label: "Nobretech" },
  { value: "supplier", label: "Fornecedor" },
  { value: "unknown", label: "Outra/Revisar" },
]

const editableStatusOptions: Array<{ value: SupplierOfferStatus; label: string }> = [
  { value: "available", label: "Disponível" },
  { value: "needs_review", label: "Para revisar" },
  { value: "unavailable", label: "Indisponível" },
  { value: "reserved_with_supplier", label: "Reservado c/ fornecedor" },
  { value: "draft", label: "Rascunho" },
  { value: "ignored", label: "Ignorado" },
  { value: "superseded", label: "Substituído" },
  { value: "canceled", label: "Cancelado" },
]

function EditModal({ offer, onClose, onSaved }: EditModalProps) {
  const [model, setModel] = useState(offer.model || "")
  const [category, setCategory] = useState(offer.category || "")
  const [storage, setStorage] = useState(offer.storage || "")
  const [size, setSize] = useState(offer.size || "")
  const [color, setColor] = useState(offer.color || "")
  const [condition, setCondition] = useState<SupplierOfferCondition>(offer.condition ?? "unknown")
  const [batteryHealth, setBatteryHealth] = useState(offer.battery_health != null ? String(offer.battery_health) : "")
  const [warrantyType, setWarrantyType] = useState<SupplierOfferWarrantyType>(offer.warranty_type ?? "none")
  const [warrantyLabel, setWarrantyLabel] = useState(offer.warranty_label || "")
  const [supplierPrice, setSupplierPrice] = useState(offer.supplier_price != null ? String(offer.supplier_price) : "")
  const [suggestedSalePrice, setSuggestedSalePrice] = useState(offer.suggested_sale_price != null ? String(offer.suggested_sale_price) : "")
  const [status, setStatus] = useState<SupplierOfferStatus>(offer.status)
  const [saving, setSaving] = useState(false)

  const parsePrice = (v: string) => {
    const n = Number(v.replace(/\./g, "").replace(",", "."))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const handleSave = async () => {
    const sprice = parsePrice(supplierPrice)
    const ssale = parsePrice(suggestedSalePrice)

    if (sprice !== null && sprice < 0) { toast.error("Preço não pode ser negativo."); return }
    if (ssale !== null && ssale < 0) { toast.error("Preço sugerido não pode ser negativo."); return }
    const bat = batteryHealth.trim() ? Number(batteryHealth) : null
    if (bat !== null && (bat < 0 || bat > 100)) { toast.error("Bateria deve ser de 0 a 100."); return }

    setSaving(true)
    try {
      const response = await fetch(`/api/supplier-offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || null,
          category: category || null,
          storage: storage || null,
          size: size || null,
          color: color || null,
          condition,
          batteryHealth: bat,
          warrantyType,
          warrantyLabel: warrantyLabel || null,
          supplierPrice: sprice,
          suggestedSalePrice: ssale,
          status,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data) {
        toast.error(payload?.error?.message || "Erro ao salvar alterações.")
        return
      }
      toast.success("Oferta atualizada.")
      onSaved({
        model: model || null, category: category || null, storage: storage || null,
        size: size || null, color: color || null, condition,
        battery_health: bat, warranty_type: warrantyType, warranty_label: warrantyLabel || null,
        supplier_price: sprice, suggested_sale_price: ssale, status,
        updated_at: payload.data.updated_at,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="font-bold text-navy-900">Editar oferta</h3>
            <p className="text-xs text-gray-500">Fornecedor: {offer.supplier_name || "Não informado"}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Linha original:</span> {offer.source_line}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Modelo</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Categoria</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Armazenamento</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" placeholder="128GB, 1TB..." value={storage} onChange={(e) => setStorage(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Tamanho</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" placeholder="42mm, 11&quot;..." value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Cor</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Condição</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" value={condition} onChange={(e) => setCondition(e.target.value as SupplierOfferCondition)}>
                {conditionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Saúde da bateria (%)</label>
              <input type="number" min={0} max={100} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" placeholder="88" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Tipo de garantia</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" value={warrantyType} onChange={(e) => setWarrantyType(e.target.value as SupplierOfferWarrantyType)}>
                {warrantyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Label de garantia</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" placeholder="Garantia Apple Out/26" value={warrantyLabel} onChange={(e) => setWarrantyLabel(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Preço fornecedor (R$)</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" placeholder="0,00" value={supplierPrice} onChange={(e) => setSupplierPrice(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Preço sugerido de venda (R$)</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" placeholder="0,00" value={suggestedSalePrice} onChange={(e) => setSuggestedSalePrice(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Status</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100" value={status} onChange={(e) => setStatus(e.target.value as SupplierOfferStatus)}>
                {editableStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>Salvar alterações</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Quick status action ──────────────────────────────────────────────────────

async function patchOfferStatus(offerId: string, status: SupplierOfferStatus): Promise<boolean> {
  const response = await fetch(`/api/supplier-offers/${offerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  return response.ok
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "offers" | "batches"

export default function SupplierOffersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const batchIdParam = searchParams.get("batchId")

  const [tab, setTab] = useState<Tab>("offers")

  // Batch filter — set when arriving via "Ver ofertas deste lote".
  const [batchFilter, setBatchFilter] = useState<string | null>(batchIdParam)

  // Filters
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [filterSupplier, setFilterSupplier] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterSearch, setFilterSearch] = useState("")
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false)
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Offers list
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [offersTotal, setOffersTotal] = useState(0)
  const [offersOffset, setOffersOffset] = useState(0)
  const [loadingOffers, setLoadingOffers] = useState(false)

  // Batches
  const [batches, setBatches] = useState<Batch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)

  // Edit
  const [editOffer, setEditOffer] = useState<SupplierOffer | null>(null)

  const LIMIT = 50

  useEffect(() => {
    fetch("/api/suppliers/traceability")
      .then((r) => r.json())
      .then((p) => {
        if (!p?.data?.suppliers) return
        const opts = (p.data.suppliers as Array<{ supplier: SupplierOption | null }>)
          .map((item) => item.supplier)
          .filter((s): s is SupplierOption => Boolean(s?.id))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        setSuppliers(opts)
      })
      .catch(() => {})
  }, [])

  // Honor ?batchId= when arriving from "Ver ofertas deste lote", including
  // client-side navigation while this page is already mounted.
  useEffect(() => {
    if (batchIdParam) {
      setBatchFilter(batchIdParam)
      setTab("offers")
    }
  }, [batchIdParam])

  const clearBatchFilter = useCallback(() => {
    setBatchFilter(null)
    if (batchIdParam) router.replace("/fornecedores/ofertas")
  }, [batchIdParam, router])

  const buildOffersUrl = useCallback((offset: number) => {
    const params = new URLSearchParams()
    if (filterSupplier) params.set("supplierId", filterSupplier)
    if (batchFilter) params.set("batchId", batchFilter)
    if (onlyAvailable) params.set("onlyAvailable", "1")
    else if (onlyNeedsReview) params.set("onlyNeedsReview", "1")
    else if (filterStatus) params.set("status", filterStatus)
    if (onlyDuplicates) params.set("onlyDuplicates", "1")
    if (filterSearch.trim()) params.set("search", filterSearch.trim())
    params.set("limit", String(LIMIT))
    params.set("offset", String(offset))
    return `/api/supplier-offers?${params}`
  }, [filterSupplier, batchFilter, filterStatus, onlyAvailable, onlyNeedsReview, onlyDuplicates, filterSearch])

  const loadOffers = useCallback(async (offset: number) => {
    setLoadingOffers(true)
    try {
      const res = await fetch(buildOffersUrl(offset))
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.data) {
        toast.error(body?.error?.message || "Erro ao carregar ofertas.")
        return
      }
      setOffers(body.data.offers)
      setOffersTotal(body.data.total)
      setOffersOffset(offset)
    } catch {
      toast.error("Falha de conexão ao carregar ofertas.")
    } finally {
      setLoadingOffers(false)
    }
  }, [buildOffersUrl])

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const params = new URLSearchParams()
      if (filterSupplier) params.set("supplierId", filterSupplier)
      params.set("limit", "20")
      const res = await fetch(`/api/supplier-offer-batches?${params}`)
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) setBatches(body.data)
    } catch {
      // non-critical
    } finally {
      setLoadingBatches(false)
    }
  }, [filterSupplier])

  useEffect(() => {
    if (tab === "offers") loadOffers(0)
    else loadBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterSupplier, batchFilter, filterStatus, onlyAvailable, onlyNeedsReview, onlyDuplicates])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { if (tab === "offers") loadOffers(0) }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSearch])

  const handleOfferSaved = (offerId: string, updated: Partial<SupplierOffer>) => {
    setOffers((current) => current.map((o) => o.id === offerId ? { ...o, ...updated } : o))
  }

  const quickStatus = async (offer: SupplierOffer, status: SupplierOfferStatus) => {
    const ok = await patchOfferStatus(offer.id, status)
    if (ok) {
      toast.success(`Oferta marcada como ${STATUS_CONFIG[status]?.label || status}.`)
      setOffers((current) => current.map((o) => o.id === offer.id ? { ...o, status } : o))
    } else {
      toast.error("Erro ao atualizar status.")
    }
  }

  const activeFilters = [filterSupplier, filterStatus, filterSearch.trim(), onlyAvailable && "disponíveis", onlyNeedsReview && "revisar", onlyDuplicates && "duplicados"].filter(Boolean)

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-syne text-xl font-bold text-navy-900">Ofertas de fornecedor</h2>
          <p className="text-sm text-gray-500">Produtos disponíveis em fornecedores, separados do estoque próprio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/fornecedores/ofertas/importar">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" /> Importar lista
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => tab === "offers" ? loadOffers(offersOffset) : loadBatches()}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm w-fit">
        <button
          onClick={() => setTab("offers")}
          className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === "offers" ? "bg-navy-900 text-white" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Package className="h-4 w-4" /> Ofertas
        </button>
        <button
          onClick={() => setTab("batches")}
          className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === "batches" ? "bg-navy-900 text-white" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <History className="h-4 w-4" /> Importações
        </button>
      </div>

      {/* Filters (offers tab) */}
      {tab === "offers" ? (
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                placeholder="Buscar modelo, cor, categoria..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
              {filterSearch ? (
                <button onClick={() => setFilterSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <Select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className="lg:w-52">
              <option value="">Todos os fornecedores</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>

            <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)} className={cn(activeFilters.length > 0 && "border-royal-300 text-royal-600")}>
              <Filter className="h-4 w-4" />
              Filtros{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
              <ChevronDown className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
            </Button>
          </div>

          {batchFilter ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-royal-200 bg-royal-50 px-3 py-1 text-xs font-medium text-royal-700">
                <Layers className="h-3.5 w-3.5" />
                Lote selecionado
                <button onClick={clearBatchFilter} className="ml-0.5 rounded-full p-0.5 text-royal-500 hover:bg-royal-100 hover:text-royal-700" title="Limpar filtro de lote">
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : null}

          {filtersOpen ? (
            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="Status"
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setOnlyAvailable(false); setOnlyNeedsReview(false) }}
              >
                <option value="">Todos os status</option>
                {(Object.entries(STATUS_CONFIG) as Array<[SupplierOfferStatus, (typeof STATUS_CONFIG)[SupplierOfferStatus]]>).map(([value, cfg]) => (
                  <option key={value} value={value}>{cfg.label}</option>
                ))}
              </Select>

              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-medium text-gray-700">Filtros rápidos</span>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-royal-500" checked={onlyAvailable} onChange={(e) => { setOnlyAvailable(e.target.checked); if (e.target.checked) { setOnlyNeedsReview(false); setFilterStatus("") } }} />
                  Somente disponíveis
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-yellow-500" checked={onlyNeedsReview} onChange={(e) => { setOnlyNeedsReview(e.target.checked); if (e.target.checked) { setOnlyAvailable(false); setFilterStatus("") } }} />
                  Somente para revisar
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-amber-500" checked={onlyDuplicates} onChange={(e) => setOnlyDuplicates(e.target.checked)} />
                  Somente duplicados
                </label>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Offers list */}
      {tab === "offers" ? (
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-navy-900">{offersTotal} oferta(s) encontrada(s)</span>
            </div>
            {loadingOffers ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
          </div>

          {loadingOffers && !offers.length ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
            </div>
          ) : !offers.length ? (
            <div className="min-h-48 px-4 py-16 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <p className="font-semibold text-navy-900">Nenhuma oferta encontrada</p>
              <p className="mt-1 text-sm text-gray-500">Tente ajustar os filtros ou importe uma nova lista.</p>
              <Link href="/fornecedores/ofertas/importar" className="mt-4 inline-block">
                <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Importar lista</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {offers.map((offer) => (
                  <OfferRow
                    key={offer.id}
                    offer={offer}
                    onEdit={() => setEditOffer(offer)}
                    onQuickStatus={quickStatus}
                  />
                ))}
              </div>

              {/* Pagination */}
              {offersTotal > LIMIT ? (
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                  <p className="text-xs text-gray-500">
                    Mostrando {offersOffset + 1}–{Math.min(offersOffset + LIMIT, offersTotal)} de {offersTotal}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={offersOffset === 0} onClick={() => loadOffers(Math.max(0, offersOffset - LIMIT))}>
                      Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={offersOffset + LIMIT >= offersTotal} onClick={() => loadOffers(offersOffset + LIMIT)}>
                      Próxima
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* Batches list */}
      {tab === "batches" ? (
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-bold text-navy-900">Últimas importações</h3>
            <p className="text-sm text-gray-500">Histórico de lotes importados por fornecedor.</p>
          </div>

          {loadingBatches ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
            </div>
          ) : !batches.length ? (
            <div className="min-h-48 px-4 py-16 text-center">
              <History className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <p className="font-semibold text-navy-900">Nenhuma importação encontrada</p>
              <Link href="/fornecedores/ofertas/importar" className="mt-4 inline-block">
                <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Importar lista</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {batches.map((batch) => (
                <BatchRow key={batch.id} batch={batch} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Edit modal */}
      {editOffer ? (
        <EditModal
          offer={editOffer}
          onClose={() => setEditOffer(null)}
          onSaved={(updated) => {
            handleOfferSaved(editOffer.id, updated)
            setEditOffer(null)
          }}
        />
      ) : null}
    </div>
  )
}

// ─── Offer row ────────────────────────────────────────────────────────────────

function OfferRow({
  offer,
  onEdit,
  onQuickStatus,
}: {
  offer: SupplierOffer
  onEdit: () => void
  onQuickStatus: (offer: SupplierOffer, status: SupplierOfferStatus) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hasPrice = offer.supplier_price != null
  const hasSuggested = offer.suggested_sale_price != null
  const margin = hasSuggested && hasPrice
    ? ((offer.suggested_sale_price! - offer.supplier_price!) / offer.suggested_sale_price! * 100)
    : null

  return (
    <div className={cn("group px-4 py-3 transition-colors hover:bg-gray-50", offer.status === "superseded" || offer.status === "ignored" ? "opacity-50" : "")}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={offer.status} />
            {offer.condition ? <Badge variant="gray">{offer.condition === "sealed" ? "Lacrado" : offer.condition === "used" ? "Seminovo" : "Incerto"}</Badge> : null}
            {offer.duplicate_candidate ? <Badge variant="yellow">Duplicado</Badge> : null}
          </div>
          <p className="font-semibold text-navy-900 leading-tight">
            {offerTitle(offer)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {offer.supplier_name ? <span>Fornecedor: <span className="font-medium text-gray-700">{offer.supplier_name}</span></span> : null}
            {offer.battery_health != null ? <span>Bat. {offer.battery_health}%</span> : null}
            {offer.warranty_label ? <span>{offer.warranty_label}</span> : null}
            <span>Lista: {formatDate(offer.batch_created_at || offer.created_at)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Prices */}
          <div className="text-right">
            {hasPrice ? (
              <p className="text-sm font-semibold text-navy-900">{formatBRL(offer.supplier_price)}</p>
            ) : null}
            {hasSuggested ? (
              <p className="text-xs text-gray-500">Venda: {formatBRL(offer.suggested_sale_price)}</p>
            ) : null}
            {margin != null ? (
              <p className={cn("text-xs font-medium", margin >= 15 ? "text-green-600" : margin >= 5 ? "text-amber-600" : "text-red-500")}>
                Margem ~{margin.toFixed(0)}%
              </p>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit} title="Editar oferta">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Link href={`/marketing/divulgacao?supplierOfferId=${offer.id}`} title="Usar na divulgação">
              <Button variant="ghost" size="sm">
                <Megaphone className="h-4 w-4" />
              </Button>
            </Link>
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setMenuOpen((v) => !v)} title="Mais ações">
                <ChevronDown className="h-4 w-4" />
              </Button>
              {menuOpen ? (
                <div className="absolute right-0 top-8 z-20 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  {offer.status !== "available" ? (
                    <button
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => { onQuickStatus(offer, "available"); setMenuOpen(false) }}
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500" /> Marcar disponível
                    </button>
                  ) : null}
                  {offer.status !== "unavailable" ? (
                    <button
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => { onQuickStatus(offer, "unavailable"); setMenuOpen(false) }}
                    >
                      <XCircle className="h-4 w-4 text-gray-400" /> Marcar indisponível
                    </button>
                  ) : null}
                  {offer.status !== "reserved_with_supplier" ? (
                    <button
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => { onQuickStatus(offer, "reserved_with_supplier"); setMenuOpen(false) }}
                    >
                      <ArrowRight className="h-4 w-4 text-blue-500" /> Reservar c/ fornecedor
                    </button>
                  ) : null}
                  {offer.status !== "superseded" ? (
                    <button
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      onClick={() => { onQuickStatus(offer, "superseded"); setMenuOpen(false) }}
                    >
                      <AlertTriangle className="h-4 w-4" /> Marcar substituído
                    </button>
                  ) : null}
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:bg-gray-50"
                    onClick={() => { setMenuOpen(false) }}
                    title={offer.source_line}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver linha original
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Batch row ────────────────────────────────────────────────────────────────

function BatchRow({ batch }: { batch: Batch }) {
  const parserLabel = batch.parser_mode === "ai" ? "IA" : batch.parser_mode === "hybrid" ? "IA + fallback" : batch.parser_mode === "local" ? "Local" : null

  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {parserLabel ? <Badge variant="blue">{parserLabel}</Badge> : null}
            {batch.supplier_name ? <span className="text-sm font-semibold text-navy-900">{batch.supplier_name}</span> : <span className="text-sm text-gray-400">Fornecedor não selecionado</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>{formatDate(batch.created_at)}</span>
            <span>{batch.offer_count} item(s) importado(s)</span>
            {batch.available_count ? <span className="text-green-600">{batch.available_count} disponível(s)</span> : null}
            {batch.needs_review_count ? <span className="text-amber-600">{batch.needs_review_count} para revisar</span> : null}
            {batch.superseded_count ? <span className="text-gray-400">{batch.superseded_count} substituído(s)</span> : null}
          </div>
        </div>
        <Link href={`/fornecedores/ofertas?batchId=${batch.id}`} onClick={() => {}}>
          <Button variant="outline" size="sm">
            Ver ofertas deste lote <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
