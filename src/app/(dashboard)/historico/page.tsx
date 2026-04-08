"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { FileText, Search, Download, ShieldCheck, Loader2 } from "lucide-react"

interface HistoryDocument {
  id: string
  type: "checklist" | "warranty"
  date: string
  product: string
  customer: string
  status: "active" | "expired" | "expiring_soon"
}

export default function HistoryPage() {
  const [filter, setFilter] = useState("both")
  const [search, setSearch] = useState("")
  const [documents, setDocuments] = useState<HistoryDocument[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      
      // 1. Fetch Checklists
      const { data: checklists, error: cError } = await (supabase
        .from("checklists") as any)
        .select(`
          id,
          created_at,
          inventory:inventory_id(
            product_catalog(model, variant, storage),
            sales(customer_id, customers(full_name))
          )
        `)
        .order("created_at", { ascending: false })

      if (cError) console.error("Error fetching checklists:", cError)

      // 2. Fetch Sales (Warranties)
      const { data: sales, error: sError } = await (supabase
        .from("sales") as any)
        .select(`
          id,
          sale_date,
          warranty_end,
          customers(full_name),
          inventory:inventory_id(
            product_catalog(model, variant, storage)
          )
        `)
        .order("sale_date", { ascending: false })

      if (sError) console.error("Error fetching warranties:", sError)

      // 3. Map Checklists
      const mappedChecklists: HistoryDocument[] = (checklists || []).map((c: any) => {
        const inv = c.inventory
        const catalog = inv?.product_catalog
        const sale = inv?.sales?.[0] // Get first sale if exists
        
        const productName = catalog 
          ? `${catalog.model}${catalog.variant ? " " + catalog.variant : ""}${catalog.storage ? " " + catalog.storage : ""}`
          : "Dispositivo"
          
        const customerName = sale?.customers?.full_name || "Estoque"
        
        return {
          id: `c-${c.id}`,
          type: "checklist",
          date: c.created_at,
          product: productName,
          customer: customerName,
          status: "active"
        }
      })

      // 4. Map Warranties
      const mappedWarranties: HistoryDocument[] = (sales || []).map((s: any) => {
        const inv = s.inventory
        const catalog = inv?.product_catalog
        const customerName = s.customers?.full_name || "Cliente"
        
        const productName = catalog 
          ? `${catalog.model}${catalog.variant ? " " + catalog.variant : ""}${catalog.storage ? " " + catalog.storage : ""}`
          : "Dispositivo"

        // Calc status
        const today = new Date().toISOString().split("T")[0]
        let status: any = "active"
        if (s.warranty_end) {
          if (s.warranty_end < today) status = "expired"
          else {
            const end = new Date(s.warranty_end).getTime()
            const now = new Date().getTime()
            const diffDays = (end - now) / (1000 * 60 * 60 * 24)
            if (diffDays < 30) status = "expiring_soon"
          }
        }

        return {
          id: `w-${s.id}`,
          type: "warranty",
          date: s.sale_date,
          product: productName,
          customer: customerName,
          status: status
        }
      })

      // Combined results
      const combined = [...mappedChecklists, ...mappedWarranties].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      
      setDocuments(combined)
    } catch (err) {
      console.error("Unexpected error fetching history:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const filtered = documents.filter((d) => {
    const matchFilter =
      filter === "both" ||
      (filter === "checklist" && d.type === "checklist") ||
      (filter === "warranty" && d.type === "warranty")
    const matchSearch =
      !search ||
      d.product.toLowerCase().includes(search.toLowerCase()) ||
      d.customer.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const counts = {
    checklists: documents.filter((d) => d.type === "checklist").length,
    warranties: documents.filter((d) => d.type === "warranty").length,
    total: documents.length,
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Histórico de Laudos</h2>
        <p className="text-sm text-gray-500">{counts.checklists} laudos · {counts.warranties} garantias emitidos</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { key: "both", label: "Ambos" },
          { key: "checklist", label: "Laudos" },
          { key: "warranty", label: "Garantias" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-navy-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-navy-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Input
        placeholder="Buscar por produto ou cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 bg-card rounded-2xl border border-gray-100 italic text-gray-400">
          Nenhum registro encontrado.
        </div>
      )}

      {/* Document list */}
      {!loading && (
        <div className="space-y-2">
          {filtered.map((d) => (
            <div
              key={d.id}
              className="bg-card rounded-xl border border-gray-100 p-4 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-royal-100">
                  {d.type === "checklist" ? (
                    <FileText className="w-5 h-5 text-royal-500" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-success-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{d.product}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    {d.customer} · {formatDate(d.date)}
                    <Badge variant={d.type === "checklist" ? "blue" : "green"} className="text-[10px]">
                      {d.type === "checklist" ? "Laudo" : "Garantia"}
                    </Badge>
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <Download className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
