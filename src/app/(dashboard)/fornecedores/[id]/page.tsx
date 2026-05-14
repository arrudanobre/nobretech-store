"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatBRL, formatDate } from "@/lib/helpers"

type SupplierProfile = {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  city: string | null
  notes: string | null
  rating: number | null
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

type RecentItem = {
  id: string
  purchase_id: string
  inventory_id: string | null
  product_name: string | null
  category: string | null
  quantity: number
  unit_cost: number
  landed_unit_cost: number
  ordered_at: string | null
  purchase_date: string | null
}

type SupplierDetailPayload = {
  supplier: SupplierProfile
  metrics: SupplierMetrics
  purchases: PurchaseSummary[]
  recentItems: RecentItem[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function statusVariant(status?: string | null) {
  if (status === "received") return "green"
  if (status === "cancelled") return "red"
  if (status === "ordered" || status === "in_transit" || status === "partially_received") return "blue"
  return "gray"
}

function purchaseCode(id: string) {
  return `Pedido #${id.slice(0, 4).toUpperCase()}`
}

function supplierItemsHref(purchaseId: string, supplierName: string) {
  return UUID_RE.test(purchaseId)
    ? `/estoque?purchase=${purchaseId}`
    : `/estoque?supplier=${encodeURIComponent(supplierName)}`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-navy-900">{value}</p>
    </div>
  )
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<SupplierDetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSupplier() {
      setLoading(true)
      const response = await fetch(`/api/suppliers/${params.id}/traceability`)
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data) {
        setError(payload?.error?.message || "Fornecedor não encontrado. Se este fornecedor veio de compras antigas, volte para a lista e use 'Validar fornecedor' para criar o cadastro real.")
        setLoading(false)
        return
      }
      setData(payload.data)
      setLoading(false)
    }
    loadSupplier()
  }, [params.id])

  if (loading) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
        <p className="text-sm">Carregando histórico do fornecedor...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-10 text-center shadow-sm">
        <p className="font-semibold text-navy-900">{error || "Fornecedor não encontrado. Se este fornecedor veio de compras antigas, volte para a lista e use 'Validar fornecedor' para criar o cadastro real."}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/fornecedores")}>Voltar</Button>
      </div>
    )
  }

  const { supplier, metrics } = data

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/fornecedores">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h2 className="text-xl font-bold text-navy-900">{supplier.name}</h2>
            <p className="text-sm text-gray-500">
              {[supplier.city, supplier.contact, supplier.phone || supplier.email].filter(Boolean).join(" · ") || "Fornecedor cadastrado"}
            </p>
          </div>
        </div>
        <Badge variant={metrics.openPurchases > 0 ? "blue" : "green"} dot>
          {metrics.openPurchases > 0 ? `${metrics.openPurchases} pedido(s) em aberto` : "Sem pedidos em aberto"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total comprado" value={formatBRL(metrics.totalPurchasedAmount)} />
        <Metric label="Comprado no mês" value={formatBRL(metrics.purchasedAmountCurrentMonth)} />
        <Metric label="Total de pedidos" value={String(metrics.totalPurchases)} />
        <Metric label="Itens a caminho" value={String(metrics.inTransitItems)} />
        <Metric label="Itens recebidos" value={String(metrics.receivedItems)} />
        <Metric label="Recebimento médio" value={metrics.averageReceiptDays == null ? "-" : `${metrics.averageReceiptDays}d`} />
        <Metric label="Último pedido" value={formatDate(metrics.lastPurchaseDate)} />
        <Metric label="Pedidos em aberto" value={String(metrics.openPurchases)} />
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="font-bold text-navy-900">Pedidos / lotes</h3>
            <p className="text-sm text-gray-500">Histórico de compras vinculado ao fornecedor.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-auto text-sm">
            <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Previsão</th>
                <th className="px-4 py-3">Recebido em</th>
                <th className="px-4 py-3">Qtd itens</th>
                <th className="px-4 py-3">Produtos</th>
                <th className="px-4 py-3">Frete</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="px-4 py-3 font-bold text-navy-900">{purchaseCode(purchase.id)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(purchase.ordered_at || purchase.purchase_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(purchase.expected_arrival_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(purchase.received_at)}</td>
                  <td className="px-4 py-3 text-gray-600">{purchase.items_count}</td>
                  <td className="px-4 py-3 font-semibold text-navy-900">{formatBRL(purchase.products_amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatBRL(purchase.freight_amount || purchase.freight_cost)}</td>
                  <td className="px-4 py-3 font-bold text-navy-900">{formatBRL(purchase.amount)}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant(purchase.logistics_status)}>{statusLabel(purchase.logistics_status)}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={supplierItemsHref(purchase.id, supplier.name)}>
                        <Button variant="ghost" size="sm">Ver itens</Button>
                      </Link>
                      {UUID_RE.test(purchase.id) ? (
                        <Link href={`/estoque/compras/${purchase.id}`}>
                          <Button variant="outline" size="sm">Ver pedido <ArrowRight className="h-4 w-4" /></Button>
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {data.purchases.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Sem pedidos registrados ainda.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="font-bold text-navy-900">Itens comprados recentes</h3>
          <p className="text-sm text-gray-500">Últimos produtos vinculados a pedidos deste fornecedor.</p>
        </div>
        <div className="grid gap-2">
          {data.recentItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy-900">{item.product_name || item.category || "Produto sem nome"}</p>
                <p className="text-xs text-gray-500"><CalendarDays className="mr-1 inline h-3 w-3" /> {formatDate(item.ordered_at || item.purchase_date)} · Qtd {item.quantity}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold text-navy-900">{formatBRL(item.landed_unit_cost || item.unit_cost)}</span>
                {UUID_RE.test(item.purchase_id) ? (
                  <Link href={`/estoque/compras/${item.purchase_id}`} className="text-xs font-bold text-royal-600 hover:underline">Abrir pedido</Link>
                ) : (
                  <span className="text-xs font-medium text-amber-700">Pedido legado sem detalhe</span>
                )}
              </div>
            </div>
          ))}
          {data.recentItems.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
              <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              Nenhum item comprado registrado.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
