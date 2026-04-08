"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/helpers"
import { FileText, Search, Download, ShieldCheck, Filter } from "lucide-react"

const mockDocuments = [
  { id: "1", type: "checklist", date: "2026-04-01", product: "MacBook Air M2 256GB", customer: "João Silva", status: "active" as const },
  { id: "2", type: "warranty", date: "2026-04-01", product: "MacBook Air M2 256GB", customer: "João Silva", status: "active" as const },
  { id: "3", type: "checklist", date: "2026-03-28", product: "AirPods Pro 2", customer: "Ana Oliveira", status: "active" as const },
  { id: "4", type: "warranty", date: "2026-03-28", product: "AirPods Pro 2", customer: "Ana Oliveira", status: "active" as const },
  { id: "5", type: "checklist", date: "2026-03-15", product: "iPad Air M1 64GB", customer: "Lucia Ferreira", status: "expired" as const },
  { id: "6", type: "warranty", date: "2026-03-15", product: "iPad Air M1 64GB", customer: "Lucia Ferreira", status: "expiring_soon" as const },
  { id: "7", type: "checklist", date: "2026-03-10", product: "iPhone 13 Pro 128GB", customer: "Carlos Mendes", status: "active" as const },
  { id: "8", type: "warranty", date: "2026-03-10", product: "iPhone 13 Pro 128GB", customer: "Carlos Mendes", status: "expiring_soon" as const },
  { id: "9", type: "checklist", date: "2026-01-05", product: "iPhone 12 64GB", customer: "Pedro Costa", status: "expired" as const },
  { id: "10", type: "checklist", date: "2025-12-20", product: "iPhone 14 128GB", customer: "Maria Santos", status: "expired" as const },
]

export default function HistoryPage() {
  const [filter, setFilter] = useState("both")
  const [search, setSearch] = useState("")

  const filtered = mockDocuments.filter((d) => {
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
    checklists: mockDocuments.filter((d) => d.type === "checklist").length,
    warranties: mockDocuments.filter((d) => d.type === "warranty").length,
    total: mockDocuments.length,
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

      {/* Document list */}
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
    </div>
  )
}
