"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatBRL, formatDate, daysBetween } from "@/lib/helpers"
import { getAIScoreColor } from "@/lib/helpers"
import { useToast } from "@/components/ui/toaster"
import { Plus, Search, Sparkles } from "lucide-react"

const mockQuotes = [
  {
    id: "1",
    supplier: "Fornecedor A — São Paulo",
    product: "iPhone 15 Pro Max 256GB Titânio",
    grade: "A",
    price: 2800,
    validUntil: "2026-04-15",
    aiScore: 8,
    aiAnalysis: "Boa cotação. Preço abaixo do mercado. Margem estimada de 15%. Recomendo fechar.",
    status: "pending" as const,
  },
  {
    id: "2",
    supplier: "Fornecedor B — Recife",
    product: "iPhone 15 Pro Max 256GB Titânio",
    grade: "A-",
    price: 2600,
    validUntil: "2026-04-10",
    aiScore: 6,
    aiAnalysis: "Preço bom mas grade A- pode reduzir margem. Verificar estado antes de comprar.",
    status: "pending" as const,
  },
  {
    id: "3",
    supplier: "Fornecedor C — Brasília",
    product: "iPad Pro 11 256GB",
    grade: "A+",
    price: 3100,
    validUntil: "2026-04-20",
    aiScore: 9,
    aiAnalysis: "Excelente oportunidade. iPad Pro tem alta demanda e boa margem.",
    status: "accepted" as const,
  },
  {
    id: "4",
    supplier: "Fornecedor A — São Paulo",
    product: "MacBook Air M3 256GB",
    grade: "A",
    price: 4200,
    validUntil: "2026-03-30",
    aiScore: 4,
    aiAnalysis: "Preço acima do mercado. Margem muito apertada. Não recomendado.",
    status: "rejected" as const,
  },
]

export default function QuotesPage() {
  const [showAnalysis, setShowAnalysis] = useState<string | null>(null)
  const { toast } = useToast()

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Cotações</h2>
          <p className="text-sm text-gray-500">{mockQuotes.filter((q) => q.status === "pending").length} pendentes</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="w-4 h-4" /> Nova Cotação
        </Button>
      </div>

      <Input
        placeholder="Buscar por produto ou fornecedor…"
        icon={<Search className="w-4 h-4" />}
      />

      <div className="space-y-3">
        {mockQuotes.map((q) => {
          const statusVariant = q.status === "pending" ? "yellow" : q.status === "accepted" ? "green" : "red"
          const statusLabel = q.status === "pending" ? "Pendente" : q.status === "accepted" ? "Aceita" : "Rejeitada"
          const daysToExpire = daysBetween(new Date().toISOString(), q.validUntil)

          return (
            <div
              key={q.id}
              className="bg-card rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-navy-900 truncate">{q.product}</p>
                    <p className="text-xs text-gray-500">{q.supplier}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Grade {q.grade} · Válido até {formatDate(q.validUntil)}
                      {daysToExpire > 0 ? ` (${daysToExpire} dias)` : " (expirado)"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg text-navy-900">{formatBRL(q.price)}</p>
                    <Badge variant={statusVariant} dot className="mt-1">{statusLabel}</Badge>
                  </div>
                </div>

                {/* AI Score */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${getAIScoreColor(q.aiScore)}`}>
                    <Sparkles className="w-3.5 h-3.5" />
                    IA {q.aiScore}/10
                  </div>
                  {q.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAnalysis(showAnalysis === q.id ? null : q.id)}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Análise
                    </Button>
                  )}
                </div>

                {/* AI Analysis expandable */}
                {showAnalysis === q.id && (
                  <div className="mt-3 bg-royal-100 rounded-xl p-3 text-sm text-royal-600 animate-fade-in">
                    {q.aiAnalysis}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
