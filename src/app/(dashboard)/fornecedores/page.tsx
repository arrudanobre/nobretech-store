"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatBRL, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { ArrowRight, Clock, Edit, Loader2, Mail, MapPin, PackageCheck, Plus, Search, Star, Truck, X } from "lucide-react"
import { toast } from "sonner"

type SupplierProfile = {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  city: string | null
  notes: string | null
  rating: number | null
  created_at: string | null
}

type SupplierMetrics = {
  totalPurchases: number
  openPurchases: number
  inTransitItems: number
  receivedItems: number
  totalPurchasedAmount: number
  purchasedAmountCurrentMonth: number
  lastPurchaseDate: string | null
  averageReceiptDays: number | null
}

type PurchaseSummary = {
  id: string
  supplier_name: string | null
  purchase_date: string | null
  ordered_at: string | null
  expected_arrival_date: string | null
  received_at: string | null
  logistics_status: string | null
  source_type: string | null
  freight_amount: number
  freight_cost: number
  products_amount: number
  total_amount: number
  items_count: number
  amount: number
}

type SupplierCard = {
  supplier: SupplierProfile | null
  legacyName: string | null
  isLegacy: boolean
  metrics: SupplierMetrics
  purchases: PurchaseSummary[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TraceabilityPayload = {
  summary: {
    activeSuppliers: number
    openPurchases: number
    purchasedAmountCurrentMonth: number
    totalPurchasedAmount: number
    inTransitItems: number
    topSupplierByAmount: string | null
  }
  suppliers: SupplierCard[]
}

type SupplierForm = {
  id?: string
  name: string
  contact: string
  phone: string
  email: string
  city: string
  notes: string
  rating: number
}

const emptyForm: SupplierForm = {
  name: "",
  contact: "",
  phone: "",
  email: "",
  city: "",
  notes: "",
  rating: 5,
}

function RatingStars({ rating }: { rating: number | null }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-3.5 w-3.5", i < (rating || 0) ? "fill-warning-500 text-warning-500" : "text-gray-200")}
        />
      ))}
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-navy-900">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-gray-500">{detail}</p> : null}
    </div>
  )
}

function numberOrDash(value: number | null) {
  return value == null ? "-" : `${value}d`
}

function purchaseCode(id: string) {
  return `Pedido #${id.slice(0, 4).toUpperCase()}`
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    ordered: "Pedido",
    in_transit: "A caminho",
    partially_received: "Recebido parcial",
    received: "Recebido",
    cancelled: "Cancelado",
  }
  return labels[status || ""] || "Sem status"
}

function supplierItemsHref(purchase: PurchaseSummary, supplierName: string) {
  return UUID_RE.test(purchase.id)
    ? `/estoque?purchase=${purchase.id}`
    : `/estoque?supplier=${encodeURIComponent(supplierName)}`
}

export default function SuppliersPage() {
  const router = useRouter()
  const [payload, setPayload] = useState<TraceabilityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [legacyOrders, setLegacyOrders] = useState<SupplierCard | null>(null)
  const [validatingLegacyName, setValidatingLegacyName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<SupplierForm>(emptyForm)

  const loadSuppliers = async () => {
    setLoading(true)
    const response = await fetch("/api/suppliers/traceability")
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.data) {
      toast.error(result?.error?.message || "Erro ao carregar fornecedores")
      setLoading(false)
      return
    }
    setPayload(result.data)
    setLoading(false)
  }

  useEffect(() => {
    let mounted = true
    fetch("/api/suppliers/traceability")
      .then((response) => response.json().then((result) => ({ ok: response.ok, result })))
      .then(({ ok, result }) => {
        if (!mounted) return
        if (!ok || !result?.data) {
          toast.error(result?.error?.message || "Erro ao carregar fornecedores")
        } else {
          setPayload(result.data)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        toast.error("Erro ao carregar fornecedores")
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const suppliers = payload?.suppliers || []
    if (!term) return suppliers
    return suppliers.filter((item) => {
      const supplier = item.supplier
      return [
        supplier?.name,
        item.legacyName,
        supplier?.city,
        supplier?.contact,
        supplier?.email,
        supplier?.phone,
      ].filter(Boolean).join(" ").toLowerCase().includes(term)
    })
  }, [payload?.suppliers, search])

  const openNewSupplier = () => {
    setFormData(emptyForm)
    setShowModal(true)
  }

  const openEditSupplier = (supplier: SupplierProfile) => {
    setFormData({
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      city: supplier.city || "",
      notes: supplier.notes || "",
      rating: supplier.rating || 5,
    })
    setShowModal(true)
  }

  const saveSupplier = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!formData.name.trim()) return toast.error("Nome é obrigatório")
    setSaving(true)

    const values = {
      name: formData.name.trim(),
      contact: formData.contact || null,
      phone: formData.phone || null,
      email: formData.email || null,
      city: formData.city || null,
      notes: formData.notes || null,
      rating: formData.rating,
    }

    const body = formData.id
      ? {
        table: "suppliers",
        action: "update",
        values,
        filters: [{ op: "eq", column: "id", value: formData.id }],
      }
      : {
        table: "suppliers",
        action: "insert",
        values,
      }

    const response = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok || result?.error) {
      toast.error(result?.error?.message || "Erro ao salvar fornecedor")
      return
    }

    toast.success(formData.id ? "Fornecedor atualizado" : "Fornecedor cadastrado")
    setShowModal(false)
    await loadSuppliers()
  }

  const validateLegacySupplier = async (supplierName: string) => {
    const cleanName = supplierName.trim()
    if (!cleanName || validatingLegacyName) return
    setValidatingLegacyName(cleanName)
    const response = await fetch("/api/suppliers/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName }),
    })
    const result = await response.json().catch(() => null)
    setValidatingLegacyName(null)

    if (!response.ok || !result?.data?.supplier?.id) {
      toast.error(result?.error?.message || "Erro ao validar fornecedor")
      return
    }

    toast.success("Fornecedor validado")
    setLegacyOrders(null)
    await loadSuppliers()
    const supplierId = String(result.data.supplier.id || "")
    if (UUID_RE.test(supplierId)) {
      router.push(`/fornecedores/${supplierId}`)
    } else {
      toast.error("Fornecedor validado, mas o cadastro retornou um ID inválido.")
    }
  }

  const summary = payload?.summary

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-syne text-xl font-bold text-navy-900">Fornecedores</h2>
          <p className="text-sm text-gray-500">
            {summary ? `${summary.activeSuppliers} ativos · ${summary.openPurchases} pedidos em aberto · ${formatBRL(summary.purchasedAmountCurrentMonth)} comprados no mês` : "Central de compras e rastreabilidade"}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openNewSupplier}>
          <Plus className="h-4 w-4" /> Novo Fornecedor
        </Button>
      </div>

      <Input
        placeholder="Buscar por nome, cidade ou contato..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        icon={<Search className="h-4 w-4" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Fornecedores ativos" value={String(summary?.activeSuppliers || 0)} />
        <MetricCard label="Pedidos em aberto" value={String(summary?.openPurchases || 0)} />
        <MetricCard label="Comprado no mês" value={formatBRL(summary?.purchasedAmountCurrentMonth || 0)} />
        <MetricCard label="Comprado total" value={formatBRL(summary?.totalPurchasedAmount || 0)} />
        <MetricCard label="Itens a caminho" value={String(summary?.inTransitItems || 0)} />
        <MetricCard label="Maior volume" value={summary?.topSupplierByAmount || "-"} detail="por valor comprado total" />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
          <p className="text-sm">Consolidando compras por fornecedor...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Truck className="mx-auto mb-3 h-12 w-12 text-gray-200" />
          <p className="font-medium text-gray-500">Nenhum fornecedor encontrado</p>
          <p className="text-sm text-gray-400">Cadastre um fornecedor ou ajuste a busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((item) => {
            const supplier = item.supplier
            const name = supplier?.name || item.legacyName || "Fornecedor sem cadastro"
            const metrics = item.metrics
            return (
              <div key={supplier?.id || `legacy-${name}`} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold text-navy-900">{name}</h3>
                      {item.isLegacy ? <Badge variant="yellow">Legado</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                      {supplier?.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {supplier.city}</span> : null}
                      {supplier?.contact ? <span>{supplier.contact}</span> : null}
                      {supplier?.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {supplier.email}</span> : null}
                    </div>
                  </div>
                  <RatingStars rating={supplier?.rating || null} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Pedidos</p>
                    <p className="font-bold text-navy-900">{metrics.totalPurchases}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Comprado</p>
                    <p className="font-bold text-navy-900">{formatBRL(metrics.totalPurchasedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Mês</p>
                    <p className="font-bold text-navy-900">{formatBRL(metrics.purchasedAmountCurrentMonth)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                  {metrics.totalPurchases > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4 text-royal-500" /> {metrics.openPurchases} pedido(s) em aberto</span>
                      <span className="inline-flex items-center gap-2"><PackageCheck className="h-4 w-4 text-royal-500" /> {metrics.inTransitItems} item(ns) a caminho</span>
                      <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" /> Último: {formatDate(metrics.lastPurchaseDate)}</span>
                      <span>Recebimento médio: {numberOrDash(metrics.averageReceiptDays)}</span>
                    </div>
                  ) : (
                    <span>Sem pedidos registrados ainda.</span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {supplier ? (
                    <Link href={`/fornecedores/${supplier.id}`}>
                      <Button variant="outline" size="sm">
                        Ver pedidos <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setLegacyOrders(item)}>
                      Ver pedidos <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                  {supplier ? (
                    <Button variant="ghost" size="sm" onClick={() => openEditSupplier(supplier)}>
                      <Edit className="h-4 w-4" /> Editar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => validateLegacySupplier(name)} isLoading={validatingLegacyName === name}>
                      Validar fornecedor
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-royal-600 to-royal-700 p-6 text-white">
              <h3 className="font-syne text-lg font-bold">{formData.id ? "Editar Fornecedor" : "Novo Fornecedor"}</h3>
              <button onClick={() => setShowModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20" disabled={saving}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveSupplier} className="space-y-4 p-6">
              <Input label="Nome do Fornecedor / Empresa" placeholder="Ex: Tech Import SP" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Contato" placeholder="Nome da pessoa" value={formData.contact} onChange={(event) => setFormData({ ...formData, contact: event.target.value })} />
                <Input label="Telefone" placeholder="(00) 00000-0000" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="E-mail" placeholder="exemplo@email.com" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} />
                <Input label="Cidade/UF" placeholder="São Paulo/SP" value={formData.city} onChange={(event) => setFormData({ ...formData, city: event.target.value })} />
              </div>
              <Textarea label="Observações" value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} />
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-500">Avaliação</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} type="button" onClick={() => setFormData({ ...formData, rating: star })} className="transition-transform hover:scale-110">
                      <Star className={cn("h-6 w-6", star <= formData.rating ? "fill-warning-500 text-warning-500" : "text-gray-200")} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button>
                <Button type="submit" variant="primary" className="flex-1" isLoading={saving}>Salvar</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {legacyOrders && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onClick={() => setLegacyOrders(null)} />
          <div className="relative max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-syne text-lg font-bold text-navy-900">{legacyOrders.legacyName || "Fornecedor legado"}</h3>
                  <Badge variant="yellow">Legado</Badge>
                </div>
                <p className="mt-1 text-sm text-gray-500">Pedidos encontrados por nome em compras antigas, sem supplier_id real.</p>
              </div>
              <button onClick={() => setLegacyOrders(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-6">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Pedidos" value={String(legacyOrders.metrics.totalPurchases)} />
                <MetricCard label="Comprado" value={formatBRL(legacyOrders.metrics.totalPurchasedAmount)} />
                <MetricCard label="A caminho" value={String(legacyOrders.metrics.inTransitItems)} />
              </div>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                {legacyOrders.purchases.map((purchase) => {
                  const hasRealPurchaseId = UUID_RE.test(purchase.id)
                  const supplierName = legacyOrders.legacyName || purchase.supplier_name || ""
                  return (
                    <div key={purchase.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-bold text-navy-900">{purchaseCode(purchase.id)}</p>
                        <p className="text-sm text-gray-500">
                          {formatDate(purchase.ordered_at || purchase.purchase_date)} · {purchase.items_count} item(ns) · {statusLabel(purchase.logistics_status)}
                        </p>
                        {!hasRealPurchaseId ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">Pedido legado sem detalhe estruturado.</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-navy-900">{formatBRL(purchase.amount)}</span>
                        {hasRealPurchaseId ? (
                          <Link href={`/estoque/compras/${purchase.id}`}>
                            <Button variant="outline" size="sm">Abrir pedido</Button>
                          </Link>
                        ) : null}
                        <Link href={supplierItemsHref(purchase, supplierName)}>
                          <Button variant="ghost" size="sm">Ver itens</Button>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">Validar cria um fornecedor real só com nome. Compras antigas continuam sem update em massa.</p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => validateLegacySupplier(legacyOrders.legacyName || "")}
                isLoading={validatingLegacyName === legacyOrders.legacyName}
              >
                Validar fornecedor
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
