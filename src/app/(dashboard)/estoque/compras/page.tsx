"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  Search,
  Truck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatBRL, formatDate } from "@/lib/helpers"

type PurchaseSummary = {
  id: string
  supplier_id: string | null
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
  notes: string | null
  created_at: string | null
  items_count: number
  in_transit_items: number
  received_items: number
  amount: number
}

const STATUS_LABELS: Record<string, string> = {
  ordered: "Pedido",
  in_transit: "A caminho",
  partially_received: "Parcial",
  received: "Recebido",
  cancelled: "Cancelado",
  in_stock: "Em estoque",
  received_pending_review: "Aguardando revisão",
}

const STATUS_VARIANTS: Record<string, "green" | "red" | "blue" | "yellow" | "gray"> = {
  ordered: "blue",
  in_transit: "blue",
  partially_received: "yellow",
  received: "green",
  in_stock: "green",
  cancelled: "red",
  received_pending_review: "yellow",
}

function statusLabel(s?: string | null) {
  return STATUS_LABELS[s || ""] || "Sem status"
}

function statusVariant(s?: string | null): "green" | "red" | "blue" | "yellow" | "gray" {
  return STATUS_VARIANTS[s || ""] || "gray"
}

function purchaseCode(id: string) {
  return `#${id.slice(0, 4).toUpperCase()}`
}

type SummaryCardProps = {
  label: string
  value: string
  sub?: string
}

function SummaryCard({ label, value, sub }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-navy-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-400">{sub}</p> : null}
    </div>
  )
}

const ALL_STATUSES = [
  { value: "", label: "Todos os status" },
  { value: "ordered", label: "Pedido" },
  { value: "in_transit", label: "A caminho" },
  { value: "partially_received", label: "Recebido parcial" },
  { value: "received", label: "Recebido" },
  { value: "in_stock", label: "Em estoque" },
  { value: "received_pending_review", label: "Aguardando revisão" },
  { value: "cancelled", label: "Cancelado" },
]

export default function InventoryPurchasesPage() {
  const router = useRouter()
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [supplierFilter, setSupplierFilter] = useState("")

  const loadPurchases = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/inventory-purchases")
      const payload = await res.json().catch(() => null)
      if (res.ok && payload?.data?.purchases) {
        setPurchases(payload.data.purchases)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPurchases()
  }, [loadPurchases])

  const suppliers = useMemo(() => {
    const names = new Set<string>()
    for (const p of purchases) {
      const name = p.supplier_name?.trim()
      if (name) names.add(name)
    }
    return Array.from(names).sort()
  }, [purchases])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return purchases.filter((p) => {
      if (statusFilter && p.logistics_status !== statusFilter) return false
      if (supplierFilter && p.supplier_name !== supplierFilter) return false
      if (q) {
        const code = purchaseCode(p.id).toLowerCase()
        const supplier = (p.supplier_name || "").toLowerCase()
        if (!code.includes(q) && !supplier.includes(q)) return false
      }
      return true
    })
  }, [purchases, search, statusFilter, supplierFilter])

  const summary = useMemo(() => {
    const total = purchases.length
    const open = purchases.filter((p) => ["ordered", "in_transit", "partially_received"].includes(p.logistics_status || "")).length
    const inTransit = purchases.filter((p) => p.logistics_status === "in_transit").length
    const received = purchases.filter((p) => ["received", "in_stock"].includes(p.logistics_status || "")).length
    const totalValue = purchases.reduce((acc, p) => acc + p.amount, 0)
    const totalFreight = purchases.reduce((acc, p) => acc + (p.freight_amount || p.freight_cost || 0), 0)
    return { total, open, inTransit, received, totalValue, totalFreight }
  }, [purchases])

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/estoque")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-navy-900">Compras de Estoque</h2>
            <p className="text-sm text-gray-500">Rastreie pedidos, fornecedores, fretes e recebimentos.</p>
          </div>
        </div>
        <Link href="/estoque/compras/nova">
          <Button variant="primary" size="sm">
            <Plus className="h-4 w-4" /> Nova compra em lote
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total" value={String(summary.total)} sub="pedidos" />
        <SummaryCard label="Em aberto" value={String(summary.open)} sub="pedidos" />
        <SummaryCard label="A caminho" value={String(summary.inTransit)} sub="pedidos" />
        <SummaryCard label="Recebidas" value={String(summary.received)} sub="pedidos" />
        <SummaryCard label="Valor comprado" value={formatBRL(summary.totalValue)} />
        <SummaryCard label="Frete total" value={formatBRL(summary.totalFreight)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar por pedido ou fornecedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-royal-500"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {suppliers.length > 0 && (
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-royal-500"
          >
            <option value="">Todos os fornecedores</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-gray-400">
          <Loader2 className="h-7 w-7 animate-spin text-royal-500" />
          <p className="text-sm">Carregando compras…</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Data da compra</th>
                  <th className="px-4 py-3">Previsão</th>
                  <th className="px-4 py-3">Recebido em</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3">Produtos</th>
                  <th className="px-4 py-3">Frete</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-navy-900">{purchaseCode(p.id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Truck className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate max-w-[160px] text-gray-700">{p.supplier_name || <span className="text-gray-400">—</span>}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.ordered_at || p.purchase_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.expected_arrival_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.received_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.items_count || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-navy-900">{formatBRL(p.products_amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatBRL(p.freight_amount || p.freight_cost)}</td>
                    <td className="px-4 py-3 font-semibold text-navy-900">{formatBRL(p.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(p.logistics_status)} dot>
                        {statusLabel(p.logistics_status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Link href={`/estoque/compras/${p.id}`}>
                          <Button variant="outline" size="sm">
                            <Package className="h-3.5 w-3.5" /> Abrir
                          </Button>
                        </Link>
                        <Link href={`/estoque?purchase=${p.id}`}>
                          <Button variant="ghost" size="sm">
                            <PackageCheck className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-gray-500">
                      {purchases.length === 0 ? "Nenhuma compra registrada ainda." : "Nenhuma compra corresponde aos filtros aplicados."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
