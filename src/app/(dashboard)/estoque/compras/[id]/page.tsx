"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Building2, CalendarDays, Loader2, PackageCheck, Pencil, Save, Truck, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SupplierCombobox } from "@/components/products/supplier-combobox"
import { formatBRL, formatDate } from "@/lib/helpers"

type SupplierProfile = {
  id: string
  name: string
  city: string | null
  contact: string | null
}

type PurchaseItem = {
  id: string
  inventory_id: string | null
  product_name: string | null
  category: string | null
  grade: string | null
  quantity: number
  unit_cost: number
  freight_allocated: number
  landed_unit_cost: number
  suggested_price: number | null
  inventory_logistics_status: string | null
  inventory_commercial_status: string | null
  inventory_status: string | null
  inventory_received_at: string | null
}

type PurchaseDetail = {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  supplier: SupplierProfile | null
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
  amount: number
  notes: string | null
  items_count: number
  items: PurchaseItem[]
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
    in_stock: "Recebido",
    received_pending_review: "Aguardando revisão",
  }
  return labels[status || ""] || "Sem status"
}

function statusVariant(status?: string | null): "green" | "red" | "blue" | "yellow" | "gray" {
  if (status === "received" || status === "in_stock") return "green"
  if (status === "cancelled") return "red"
  if (status === "received_pending_review") return "yellow"
  if (status === "ordered" || status === "in_transit" || status === "partially_received") return "blue"
  return "gray"
}

const CATEGORY_LABELS: Record<string, string> = {
  accessories: "Acessório",
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  apple_watch: "Apple Watch",
  airpods: "AirPods",
  mac: "Mac",
  imac: "iMac",
  mac_mini: "Mac Mini",
  mac_pro: "Mac Pro",
  mac_studio: "Mac Studio",
}

function categoryLabel(raw?: string | null) {
  if (!raw) return "-"
  return CATEGORY_LABELS[raw.toLowerCase()] || raw.replace(/_/g, " ")
}

const COMMERCIAL_STATUS_LABELS: Record<string, string> = {
  available: "Disponível",
  bookable: "Reservável",
  reserved: "Reservado",
  blocked: "Bloqueado",
  sold: "Vendido",
  in_transit: "A caminho",
  pending_review: "Em revisão",
  under_repair: "Em reparo",
  returned: "Devolvido",
  inactive: "Inativo",
}

function commercialStatusLabel(raw?: string | null) {
  if (!raw) return "-"
  return COMMERCIAL_STATUS_LABELS[raw.toLowerCase()] || raw.replace(/_/g, " ")
}

type ItemGroup = {
  key: string
  productName: string
  category: string | null
  grades: string[]
  quantity: number
  unitCost: number
  landedUnitCost: number
  totalCost: number
  logisticsStatuses: string[]
  commercialStatuses: string[]
  inventoryIds: string[]
  items: PurchaseItem[]
}

type ItemVariant = { color_name: string; quantity: number }

function variantSummaryLine(variants: ItemVariant[]): string | null {
  if (variants.length === 0) return null
  const parts = variants.slice(0, 4).map((v) => `${v.color_name} ${v.quantity}`)
  const more = variants.length > 4 ? ` +${variants.length - 4}` : ""
  return `${parts.join(" · ")}${more}`
}

function groupItems(items: PurchaseItem[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>()
  for (const item of items) {
    const key = [
      (item.product_name || "").trim(),
      (item.category || "").trim(),
      Math.round((item.unit_cost || 0) * 100),
      Math.round((item.landed_unit_cost || 0) * 100),
    ].join("\x00")
    const ex = groups.get(key)
    if (ex) {
      ex.quantity += item.quantity
      ex.totalCost += (item.landed_unit_cost || item.unit_cost || 0) * item.quantity
      ex.items.push(item)
      if (item.inventory_id) ex.inventoryIds.push(item.inventory_id)
      if (item.grade && !ex.grades.includes(item.grade)) ex.grades.push(item.grade)
      const ls = item.inventory_logistics_status || ""
      if (ls && !ex.logisticsStatuses.includes(ls)) ex.logisticsStatuses.push(ls)
      const cs = item.inventory_commercial_status || item.inventory_status || ""
      if (cs && !ex.commercialStatuses.includes(cs)) ex.commercialStatuses.push(cs)
    } else {
      const ls = item.inventory_logistics_status || ""
      const cs = item.inventory_commercial_status || item.inventory_status || ""
      groups.set(key, {
        key,
        productName: item.product_name || "Produto sem nome",
        category: item.category,
        grades: item.grade ? [item.grade] : [],
        quantity: item.quantity,
        unitCost: item.unit_cost,
        landedUnitCost: item.landed_unit_cost,
        totalCost: (item.landed_unit_cost || item.unit_cost || 0) * item.quantity,
        logisticsStatuses: ls ? [ls] : [],
        commercialStatuses: cs ? [cs] : [],
        inventoryIds: item.inventory_id ? [item.inventory_id] : [],
        items: [item],
      })
    }
  }
  return Array.from(groups.values())
}

function toDateInputValue(value?: string | null) {
  if (!value) return ""
  return String(value).slice(0, 10)
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-base font-bold text-navy-900">{value}</p>
    </div>
  )
}

export default function InventoryPurchaseDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null)
  const [editSupplierName, setEditSupplierName] = useState("")
  const [editExpectedDate, setEditExpectedDate] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [variantsByInventoryId, setVariantsByInventoryId] = useState<Record<string, ItemVariant[]>>({})

  const itemGroups = useMemo(() => groupItems(purchase?.items ?? []), [purchase])
  const groupedItemsTotal = useMemo(
    () => itemGroups.reduce((sum, group) => sum + Math.max(0, Number(group.quantity || 0)), 0),
    [itemGroups]
  )

  async function loadPurchase() {
    setLoading(true)
    setError(null)
    const response = await fetch(`/api/inventory-purchases/${params.id}`)
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.data?.purchase) {
      setError(payload?.error?.message || "Pedido não encontrado ou não vinculado corretamente.")
      setLoading(false)
      return
    }
    const purchaseData = payload.data.purchase
    setPurchase(purchaseData)
    setLoading(false)

    const inventoryIds = (purchaseData.items as PurchaseItem[])
      .map((item) => item.inventory_id)
      .filter((id): id is string => Boolean(id))

    if (inventoryIds.length > 0) {
      fetch("/api/inventory/batch-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_ids: inventoryIds }),
      })
        .then((res) => res.json())
        .then((vPayload) => {
          if (vPayload?.data?.variants_by_id) {
            setVariantsByInventoryId(vPayload.data.variants_by_id)
          }
        })
        .catch(() => null)
    }
  }

  useEffect(() => {
    loadPurchase()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  function openEdit() {
    if (!purchase) return
    setEditSupplierId(purchase.supplier?.id || purchase.supplier_id || null)
    setEditSupplierName(purchase.supplier?.name || purchase.supplier_name || "")
    setEditExpectedDate(toDateInputValue(purchase.expected_arrival_date))
    setEditNotes(purchase.notes || "")
    setSaveError(null)
    setEditing(true)
  }

  async function handleSave() {
    if (!purchase) return
    if (!editSupplierName.trim()) {
      setSaveError("Nome do fornecedor é obrigatório.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/inventory-purchases/${purchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: editSupplierId,
          supplier_name: editSupplierName.trim(),
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setSaveError(payload?.error?.message || "Erro ao salvar.")
        setSaving(false)
        return
      }
      setEditing(false)
      await loadPurchase()
    } catch {
      setSaveError("Erro de conexão. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
        <p className="text-sm">Carregando detalhe do pedido...</p>
      </div>
    )
  }

  if (error || !purchase) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-10 text-center shadow-sm">
        <p className="font-semibold text-navy-900">{error || "Pedido não encontrado."}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/estoque/compras")}>Voltar</Button>
      </div>
    )
  }

  const supplierName = purchase.supplier?.name || purchase.supplier_name || "Fornecedor não informado"
  const freight = purchase.freight_amount || purchase.freight_cost

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/estoque/compras")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-navy-900">{purchaseCode(purchase.id)}</h2>
            <p className="text-sm text-gray-500">Lote de compra de estoque · {supplierName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(purchase.logistics_status)} dot>{statusLabel(purchase.logistics_status)}</Badge>
          {!editing && (
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <section className="rounded-xl border border-royal-200 bg-royal-50/40 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-navy-900">Editar pedido</p>
            <Button variant="ghost" size="icon" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <SupplierCombobox
                supplierId={editSupplierId}
                supplierName={editSupplierName}
                onChange={(id, name) => { setEditSupplierId(id); setEditSupplierName(name) }}
                label="Fornecedor da compra"
              />
            </div>
            <Input
              label="Previsão de chegada"
              type="date"
              value={editExpectedDate}
              onChange={(e) => setEditExpectedDate(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium mb-1.5 text-navy-900">Observações</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-royal-500 resize-none"
                placeholder="Observações sobre o pedido…"
              />
            </div>
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-navy-900">{supplierName}</p>
              <p className="text-sm text-gray-500">{purchase.supplier?.city || purchase.supplier?.contact || purchase.source_type || "Origem não informada"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {purchase.supplier ? (
              <Link href={`/fornecedores/${purchase.supplier.id}`}>
                <Button variant="outline" size="sm">Ver fornecedor</Button>
              </Link>
            ) : null}
            <Link href={`/estoque?purchase=${purchase.id}`}>
              <Button variant="primary" size="sm">Ver itens no estoque</Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Data do pedido" value={formatDate(purchase.ordered_at || purchase.purchase_date)} />
        <InfoCard label="Previsão" value={formatDate(purchase.expected_arrival_date)} />
        <InfoCard label="Recebido em" value={formatDate(purchase.received_at)} />
        <InfoCard label="Origem" value={purchase.source_type || "-"} />
        <InfoCard label="Valor produtos" value={formatBRL(purchase.products_amount)} />
        <InfoCard label="Frete" value={formatBRL(freight)} />
        <InfoCard label="Custo total" value={formatBRL(purchase.amount || purchase.total_amount)} />
        <InfoCard label="Itens" value={String(purchase.items_count || purchase.items.length)} />
      </div>

      {purchase.notes ? (
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Observações</p>
          <p className="mt-2 text-sm text-gray-600">{purchase.notes}</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-bold text-navy-900">Itens do pedido</h3>
          <p className="text-sm text-gray-500">
            {itemGroups.length} {itemGroups.length === 1 ? "produto" : "produtos"} · {groupedItemsTotal} {groupedItemsTotal === 1 ? "unidade" : "unidades"} no total
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 min-w-[300px]">Produto</th>
                <th className="px-4 py-3 whitespace-nowrap">Categoria</th>
                <th className="px-4 py-3 whitespace-nowrap">Qtd</th>
                <th className="px-4 py-3 whitespace-nowrap">Custo unit.</th>
                <th className="px-4 py-3 whitespace-nowrap">Unit. c/ frete</th>
                <th className="px-4 py-3 whitespace-nowrap">Total</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {itemGroups.map((group) => {
                const isExpanded = expandedGroup === group.key
                const mixedLogistics = group.logisticsStatuses.length > 1
                const primaryLogistics = group.logisticsStatuses[0] || null
                const gradeSubtitle = group.grades.length > 0 ? group.grades.join(" · ") : null
                return (
                  <tr key={group.key} className="hover:bg-gray-50/50 transition-colors align-top">
                    <td className="px-4 py-4 min-w-[300px] max-w-[520px]">
                      <p className="font-semibold leading-snug text-navy-900 whitespace-normal break-words">
                        {group.productName}
                      </p>
                      {gradeSubtitle ? (
                        <p className="mt-0.5 text-xs text-gray-500">{gradeSubtitle}</p>
                      ) : null}
                      {group.quantity > 1 ? (
                        <p className="mt-0.5 text-xs text-gray-400">{group.quantity} unidades no pedido</p>
                      ) : null}
                      {(() => {
                        const groupVariants = group.inventoryIds.flatMap((id) => variantsByInventoryId[id] || [])
                        const summary = variantSummaryLine(groupVariants)
                        return summary ? (
                          <p className="mt-0.5 text-xs font-medium text-royal-600">{summary}</p>
                        ) : null
                      })()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-gray-600">{categoryLabel(group.category)}</td>
                    <td className="px-4 py-4 whitespace-nowrap font-semibold text-navy-900">{group.quantity}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-gray-700">{formatBRL(group.unitCost)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-gray-700">{formatBRL(group.landedUnitCost || group.unitCost)}</td>
                    <td className="px-4 py-4 whitespace-nowrap font-semibold text-navy-900">{formatBRL(group.totalCost)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {mixedLogistics ? (
                        <Badge variant="yellow" dot>Parcial</Badge>
                      ) : (
                        <Badge variant={statusVariant(primaryLogistics)} dot>{statusLabel(primaryLogistics)}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {group.inventoryIds.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        >
                          {isExpanded ? "Fechar" : `Ver ${group.inventoryIds.length} unidades`}
                        </Button>
                      ) : group.inventoryIds.length === 1 ? (
                        <Link href={`/estoque/${group.inventoryIds[0]}/editar`}>
                          <Button variant="ghost" size="sm">Ver item</Button>
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">Sem vínculo</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {itemGroups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Nenhum item vinculado ao pedido.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded unit detail panel */}
        {expandedGroup !== null && (() => {
          const group = itemGroups.find((g) => g.key === expandedGroup)
          if (!group) return null
          return (
            <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                Unidades individuais — {group.productName}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="pr-4 py-1.5 whitespace-nowrap">Produto / Condição</th>
                      <th className="px-4 py-1.5 whitespace-nowrap">Custo unit.</th>
                      <th className="px-4 py-1.5 whitespace-nowrap">Custo c/ frete</th>
                      <th className="px-4 py-1.5 whitespace-nowrap">Disponibilidade</th>
                      <th className="px-4 py-1.5 whitespace-nowrap">Status comercial</th>
                      <th className="px-4 py-1.5 whitespace-nowrap">Recebido em</th>
                      <th className="px-4 py-1.5 whitespace-nowrap">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.items.map((item) => (
                      <tr key={item.id} className="hover:bg-white transition-colors">
                        <td className="pr-4 py-2.5">
                          <p className="font-medium text-navy-900 whitespace-normal break-words max-w-[280px]">{item.product_name || "—"}</p>
                          {item.grade ? <p className="text-xs text-gray-500">{item.grade}</p> : null}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatBRL(item.unit_cost)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatBRL(item.landed_unit_cost || item.unit_cost + item.freight_allocated)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Badge variant={statusVariant(item.inventory_logistics_status)}>{statusLabel(item.inventory_logistics_status)}</Badge>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{commercialStatusLabel(item.inventory_commercial_status || item.inventory_status)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatDate(item.inventory_received_at)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {item.inventory_id ? (
                            <Link href={`/estoque/${item.inventory_id}/editar`}>
                              <Button variant="ghost" size="sm">Ver item</Button>
                            </Link>
                          ) : <span className="text-xs text-gray-400">Sem vínculo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/estoque/compras"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Compras</Button></Link>
        <Link href="/fornecedores"><Button variant="ghost"><Truck className="h-4 w-4" /> Fornecedores</Button></Link>
        <Link href={`/estoque?purchase=${purchase.id}`}><Button variant="outline"><PackageCheck className="h-4 w-4" /> Estoque filtrado</Button></Link>
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <CalendarDays className="h-3 w-3" /> Pedido criado em {formatDate(purchase.ordered_at || purchase.purchase_date)}
        </span>
      </div>
    </div>
  )
}
