"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatBRL, formatDate, daysBetween, getProductName, getAdditionalItemDisplayName } from "@/lib/helpers"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import { supabase } from "@/lib/supabase"
import { Plus, Search, TrendingUp, ShoppingCart, Calendar, CreditCard, ChevronRight } from "lucide-react"

function formatPayment(method?: string) {
  if (!method) return "—"
  return method
    .replace("credit_", "Crédito ")
    .replace("debit", "Débito")
    .replace("pix", "PIX")
    .replace("cash", "Dinheiro")
}

function getWarrantyDays(warrantyEnd?: string | null) {
  if (!warrantyEnd) return null
  const today = new Date().toISOString().split("T")[0]
  return Math.max(0, daysBetween(today, warrantyEnd))
}

function getSaleStatusMeta(status?: string | null) {
  switch (status || "completed") {
    case "reserved":
      return { label: "Pendente pagamento", variant: "yellow" as const }
    case "cancelled":
      return { label: "Cancelada", variant: "red" as const }
    default:
      return { label: "Concluída", variant: "green" as const }
  }
}

function getWarrantyBadge(sale: any) {
  if ((sale.sale_status || "completed") === "reserved") {
    return { label: "Após pagamento", variant: "gray" as const }
  }

  if (!Number(sale.warranty_months || 0) || !sale.warranty_end) {
    return { label: "Sem garantia", variant: "gray" as const }
  }

  const warrantyDays = getWarrantyDays(sale.warranty_end) ?? 0
  return {
    label: `${warrantyDays}d`,
    variant: warrantyDays > 15 ? "green" as const : warrantyDays > 0 ? "yellow" as const : "red" as const,
  }
}

export default function SalesPage() {
  const [search, setSearch] = useState("")
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const { data, error } = await (supabase
          .from("sales") as any)
          .select(`
            *,
            source_type,
            supplier_name,
            supplier_cost,
            customers:customer_id (id, full_name, cpf, phone),
            inventory:inventory_id (
              id,
              purchase_price,
              imei,
              status,
              catalog:catalog_id (id, brand, model, variant, storage, color)
            ),
            sales_additional_items (id, type, name, cost_price, sale_price, profit)
          `)
          .order("sale_date", { ascending: false })
          .limit(100)

        if (error) throw error
        setSales(data || [])
      } catch (err: any) {
        console.error("Erro ao carregar vendas:", err?.message)
      } finally {
        setLoading(false)
      }
    }
    fetchSales()
  }, [])

  const filtered = sales.filter((s) => {
    const productName = getProductName(s.inventory || {}) || ""
    const customerName = s.customers?.full_name || ""
    return (
      !search ||
      productName.toLowerCase().includes(search.toLowerCase()) ||
      customerName.toLowerCase().includes(search.toLowerCase())
    )
  })

  const totalMonth = sales
    .filter((s) => {
      const saleMonth = (s.sale_date || "").slice(0, 7)
      const now = new Date()
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      return saleMonth === thisMonth && (s.sale_status || "completed") === "completed"
    })
    .reduce((sum, s) => sum + Number(s.sale_price || 0), 0)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Vendas</h2>
          <p className="text-sm text-gray-500">
            {sales.length} vendas · {loading ? "carregando..." : `${formatBRL(totalMonth)} no mês`}
          </p>
        </div>
        <Link href="/vendas/nova">
          <Button variant="primary" size="sm">
            <Plus className="w-4 h-4" /> Nova Venda
          </Button>
        </Link>
      </div>

      <Input
        placeholder="Buscar por produto ou cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando vendas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-3">Nenhuma venda encontrada.</p>
          <Link href="/vendas/nova">
            <Button variant="primary" size="sm">
              <Plus className="w-4 h-4" /> Nova Venda
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden lg:block bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Produto / Cliente</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Itens</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Pagamento</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Lucro</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Garantia</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s) => {
                  const additionalItems = s.sales_additional_items || []
                  const totals = calcSaleTotals({
                    salePrice: s.sale_price,
                    mainCost: s.inventory?.purchase_price,
                    qty: parseQtyFromNotes(s.notes),
                    additionalItems,
                    supplierCost: s.supplier_cost,
                  })
                  const statusMeta = getSaleStatusMeta(s.sale_status)
                  const warrantyMeta = getWarrantyBadge(s)
                  const productName = getProductName(s.inventory || {})
                  const customerName = s.customers?.full_name || "—"
                  const upsellItems = additionalItems.filter((i: any) => i.type === "upsell")
                  return (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/vendas/${s.id}`)}
                      className="hover:bg-gray-50/60 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(s.sale_date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy-900 truncate max-w-[200px]">{productName}</p>
                        <p className="text-xs text-gray-400">{customerName}</p>
                        {upsellItems.length > 0 && (
                          <p className="text-xs text-royal-500 mt-0.5">
                            + {upsellItems.map((i: any) => getAdditionalItemDisplayName(i.name)).join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {totals.quantidadeTotalItens}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatPayment(s.payment_method)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Badge variant={statusMeta.variant} dot>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-navy-900 whitespace-nowrap">{formatBRL(totals.valorTotal)}</td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${totals.lucroTotal >= 0 ? "text-success-600" : "text-danger-500"}`}>
                        {totals.lucroTotal >= 0 ? "+" : ""}{formatBRL(totals.lucroTotal)}
                        <span className="text-xs font-normal text-gray-400 ml-1">({totals.margemTotal.toFixed(1)}%)</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={warrantyMeta.variant} dot>
                          {warrantyMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / Tablet: cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map((s) => {
              const additionalItems = s.sales_additional_items || []
              const totals = calcSaleTotals({
                salePrice: s.sale_price,
                mainCost: s.inventory?.purchase_price,
                qty: parseQtyFromNotes(s.notes),
                additionalItems,
                supplierCost: s.supplier_cost,
              })
              const statusMeta = getSaleStatusMeta(s.sale_status)
              const warrantyMeta = getWarrantyBadge(s)
              const productName = getProductName(s.inventory || {})
              const customerName = s.customers?.full_name || "—"
              const upsellItems = additionalItems.filter((i: any) => i.type === "upsell")

              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/vendas/${s.id}`)}
                  className="w-full bg-card rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-royal-200/50 transition-all text-left cursor-pointer active:scale-[0.995]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-navy-900 truncate">{productName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {customerName} · {formatPayment(s.payment_method)} · {formatDate(s.sale_date)}
                      </p>
                      {upsellItems.length > 0 && (
                        <p className="text-xs text-royal-500 mt-0.5">
                          Inclui: {upsellItems.map((i: any) => getAdditionalItemDisplayName(i.name)).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-navy-900">{formatBRL(totals.valorTotal)}</p>
                      {totals.quantidadeTotalItens > 1 && (
                        <p className="text-xs text-gray-400">{totals.quantidadeTotalItens} itens</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={statusMeta.variant} dot>
                      {statusMeta.label}
                    </Badge>
                    <Badge variant={warrantyMeta.variant} dot>
                      Garantia: {warrantyMeta.label}
                    </Badge>
                    {totals.lucroTotal !== 0 && (
                      <Badge variant={totals.lucroTotal > 0 ? "green" : "red"} dot>
                        Lucro: {totals.lucroTotal > 0 ? "+" : ""}{formatBRL(totals.lucroTotal)}
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
