"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatBRL, formatDate, daysBetween, todayISO, addDaysISO, getProductName, getAdditionalItemDisplayName, getTradeInDisplayName } from "@/lib/helpers"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import { calculateSaleEconomics } from "@/lib/sale-economics"
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

function getSaleFeeSettings(sale: any) {
  if (!sale?.payment_method || sale.card_fee_pct === null || sale.card_fee_pct === undefined) {
    return {}
  }

  return { [sale.payment_method]: Number(sale.card_fee_pct) }
}

function getWarrantyPeriod(sale: any) {
  const start = sale.sale_date || sale.warranty_start
  const months = Number(sale.warranty_months || 0)
  const totalDays = Math.max(0, months * 30)
  const end = totalDays > 0 ? addDaysISO(start, totalDays) : sale.warranty_end

  return {
    start,
    end,
    totalDays,
    remainingDays: Math.max(0, daysBetween(todayISO(), end)),
  }
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

  if (!Number(sale.warranty_months || 0)) {
    return { label: "Sem garantia", variant: "gray" as const }
  }

  const warranty = getWarrantyPeriod(sale)
  return {
    label: `${warranty.remainingDays}d restantes`,
    variant: warranty.remainingDays > 15 ? "green" as const : warranty.remainingDays > 0 ? "yellow" as const : "red" as const,
  }
}

function getTradeInName(sale: any) {
  if (!sale?.trade_in) return ""
  return getTradeInDisplayName({
    model: sale.trade_in.notes || sale.trade_in_inventory?.catalog?.model || undefined,
    storage: sale.trade_in_inventory?.catalog?.storage || undefined,
    color: sale.trade_in_inventory?.catalog?.color || undefined,
    fallback: "Aparelho recebido",
  })
}

function getTradeInGrade(sale: any) {
  return sale?.trade_in?.grade || sale?.trade_in_inventory?.grade || null
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
              suggested_price,
              imei,
              grade,
              status,
              catalog:catalog_id (id, brand, model, variant, storage, color)
            ),
            card_fee_pct,
            sales_additional_items (id, type, name, cost_price, sale_price, profit)
          `)
          .order("sale_date", { ascending: false })
          .limit(100)

        if (error) throw error

        const rows = data || []
        const tradeInIds = rows.map((sale: any) => sale.trade_in_id).filter(Boolean)

        if (tradeInIds.length > 0) {
          const { data: tradeIns } = await (supabase
            .from("trade_ins") as any)
            .select("id, trade_in_value, notes, grade, linked_inventory_id")
            .in("id", tradeInIds)

          const tradeInMap = new Map((tradeIns || []).map((item: any) => [item.id, item]))
          const linkedInventoryIds = (tradeIns || [])
            .map((item: any) => item.linked_inventory_id)
            .filter(Boolean)

          let linkedInventoryMap = new Map()
          if (linkedInventoryIds.length > 0) {
            const { data: linkedInventory } = await (supabase
              .from("inventory") as any)
              .select("id, grade, status, catalog:catalog_id(id, model, storage, color)")
              .in("id", linkedInventoryIds)

            linkedInventoryMap = new Map((linkedInventory || []).map((item: any) => [item.id, item]))
          }

          setSales(rows.map((sale: any) => {
            const tradeIn = (tradeInMap.get(sale.trade_in_id) || null) as any
            return {
              ...sale,
              trade_in: tradeIn,
              trade_in_inventory: tradeIn?.linked_inventory_id ? linkedInventoryMap.get(tradeIn.linked_inventory_id) || null : null,
            }
          }))
        } else {
          setSales(rows)
        }
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
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Negociação</th>
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
                  const economics = calculateSaleEconomics({
                    saleRevenue: totals.valorTotal,
                    cashAmountDue: Math.max(0, totals.valorTotal - Number(s.trade_in?.trade_in_value || 0)),
                    paymentMethod: s.payment_method,
                    settings: getSaleFeeSettings(s),
                    costTotal: totals.custoTotal,
                  })
                  const statusMeta = getSaleStatusMeta(s.sale_status)
                  const warrantyMeta = getWarrantyBadge(s)
                  const productName = getProductName(s.inventory || {})
                  const customerName = s.customers?.full_name || "—"
                  const upsellItems = additionalItems.filter((i: any) => i.type === "upsell")
                  const tradeInValue = Number(s.trade_in?.trade_in_value || 0)
                  const suggestedMainValue = Number(s.inventory?.suggested_price || 0) * parseQtyFromNotes(s.notes)
                  const discountAmount = suggestedMainValue > 0 ? Math.max(0, suggestedMainValue - totals.valorPrincipal) : 0
                  const tradeInName = getTradeInName(s)
                  const tradeInGrade = getTradeInGrade(s)
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
                        {tradeInValue > 0 && (
                          <p className="text-xs text-amber-700 mt-1">
                            Trade-in: {tradeInName}
                            {tradeInGrade ? ` · Classe ${tradeInGrade}` : ""}
                            {" · "}recebido por {formatBRL(tradeInValue)}
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
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="font-bold text-navy-900">{formatBRL(economics.storeCashReceives)}</p>
                        <p className="text-[11px] text-gray-400">Saldo após trade-in</p>
                        {suggestedMainValue > 0 && (
                          <p className="text-[11px] text-gray-500">Tabela {formatBRL(suggestedMainValue)}</p>
                        )}
                        {discountAmount > 0 && (
                          <p className="text-[11px] text-amber-700">Desconto {formatBRL(discountAmount)}</p>
                        )}
                        {tradeInValue > 0 && (
                          <p className="text-[11px] text-gray-500">Trade-in -{formatBRL(tradeInValue)}</p>
                        )}
                        {economics.embeddedFee > 0 && (
                          <p className="text-[11px] text-gray-400">Cliente pagou {formatBRL(economics.customerCashPays)}</p>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${economics.grossProfit >= 0 ? "text-success-600" : "text-danger-500"}`}>
                        {economics.grossProfit >= 0 ? "+" : ""}{formatBRL(economics.grossProfit)}
                        <span className="text-xs font-normal text-gray-400 ml-1">({economics.realMarginPct.toFixed(1)}%)</span>
                        {economics.embeddedFee > 0 && (
                          <p className="text-[10px] font-normal text-gray-400">taxa embutida {formatBRL(economics.embeddedFee)}</p>
                        )}
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
              const economics = calculateSaleEconomics({
                saleRevenue: totals.valorTotal,
                cashAmountDue: Math.max(0, totals.valorTotal - Number(s.trade_in?.trade_in_value || 0)),
                paymentMethod: s.payment_method,
                settings: getSaleFeeSettings(s),
                costTotal: totals.custoTotal,
              })
              const statusMeta = getSaleStatusMeta(s.sale_status)
              const warrantyMeta = getWarrantyBadge(s)
              const productName = getProductName(s.inventory || {})
              const customerName = s.customers?.full_name || "—"
              const upsellItems = additionalItems.filter((i: any) => i.type === "upsell")
              const tradeInValue = Number(s.trade_in?.trade_in_value || 0)
              const suggestedMainValue = Number(s.inventory?.suggested_price || 0) * parseQtyFromNotes(s.notes)
              const discountAmount = suggestedMainValue > 0 ? Math.max(0, suggestedMainValue - totals.valorPrincipal) : 0
              const tradeInName = getTradeInName(s)
              const tradeInGrade = getTradeInGrade(s)

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
                      {tradeInValue > 0 && (
                        <p className="text-xs text-amber-700 mt-1">
                          Trade-in: {tradeInName}
                          {tradeInGrade ? ` · Classe ${tradeInGrade}` : ""}
                          {" · "}recebido por {formatBRL(tradeInValue)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-navy-900">{formatBRL(economics.storeCashReceives)}</p>
                      <p className="text-xs text-gray-400">saldo</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div className="rounded-lg bg-surface px-3 py-2">
                      <p className="text-gray-400">Tabela</p>
                      <p className="font-semibold text-navy-900">{formatBRL(suggestedMainValue || totals.valorPrincipal)}</p>
                    </div>
                    <div className="rounded-lg bg-surface px-3 py-2">
                      <p className="text-gray-400">Final</p>
                      <p className="font-semibold text-navy-900">{formatBRL(totals.valorTotal)}</p>
                      {discountAmount > 0 && <p className="text-amber-700">desc. {formatBRL(discountAmount)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={statusMeta.variant} dot>
                      {statusMeta.label}
                    </Badge>
                    <Badge variant={warrantyMeta.variant} dot>
                      Garantia: {warrantyMeta.label}
                    </Badge>
                    {economics.grossProfit !== 0 && (
                      <Badge variant={economics.grossProfit > 0 ? "green" : "red"} dot>
                        Lucro real: {economics.grossProfit > 0 ? "+" : ""}{formatBRL(economics.grossProfit)}
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
