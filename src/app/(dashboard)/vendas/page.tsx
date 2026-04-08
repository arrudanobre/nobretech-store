"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatBRL, formatDate, daysBetween, getProductName } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { Plus, Search } from "lucide-react"

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
            customers:customer_id (id, full_name, cpf, phone),
            inventory:inventory_id (
              id,
              purchase_price,
              imei,
              status,
              catalog:catalog_id (id, brand, model, variant, storage, color)
            ),
            sales_additional_items (type, cost_price, sale_price, profit)
          `)
          .order("sale_date", { ascending: false })
          .limit(50)

        if (error) throw error
        setSales(data || [])
      } catch (err: any) {
        console.error("Erro detalhado ao carregar vendas:", {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code
        })
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
      const d = daysBetween(s.sale_date.slice(0, 7) + "-01")
      return d < 31
    })
    .reduce((sum, s) => sum + Number(s.sale_price), 0)

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
        <div className="space-y-2">
          {filtered.map((s) => {
            const customerName = s.customers?.full_name || "—"
            const productName = getProductName(s.inventory || {})
            const warrantyDays = daysBetween(s.warranty_end)
            // sale_price stored may be total (qty * unit) or unit. Parse notes for qty hint.
            const salePrice = Number(s.sale_price) || 0
            const costPrice = s.inventory?.purchase_price || 0
            // Detect quantity from notes format "[Nx ...]"
            const notes = s.notes || ""
            const qtyMatch = notes.match(/^\[(\d+)x/)
            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1
            const baseProfit = salePrice - (costPrice * qty)
            const additionalProfit = (s.sales_additional_items || []).reduce((sum: number, item: any) => sum + Number(item.profit || 0), 0)
            const totalProfit = baseProfit + additionalProfit

            return (
              <button
                key={s.id}
                onClick={() => router.push(`/vendas/${s.id}`)}
                className="w-full bg-card rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-royal-200/50 hover:bg-gray-50/30 transition-all text-left cursor-pointer active:scale-[0.995]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-navy-900 truncate">{productName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {customerName} · {s.payment_method ? s.payment_method.replace("credit_", "Crédito ").replace("debit", "Débito").replace("pix", "PIX").replace("cash", "Dinheiro") : "—"} · {formatDate(s.sale_date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-navy-900">{formatBRL(s.sale_price)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    variant={
                      warrantyDays > 15 ? "green" : warrantyDays > 0 ? "yellow" : "red"
                    }
                    dot
                  >
                    Garantia: {Math.max(0, warrantyDays)} dias
                  </Badge>
                  {totalProfit !== 0 && (
                    <Badge variant={totalProfit > 0 ? "green" : "red"} dot>
                      Lucro: {totalProfit > 0 ? "+" : ""}{formatBRL(totalProfit)}
                    </Badge>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
