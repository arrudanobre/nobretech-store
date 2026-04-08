"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL } from "@/lib/helpers"
import { PRODUCT_CATALOG, CATEGORIES } from "@/lib/constants"
import { Import, Plus, Search, Trash2, ChevronRight } from "lucide-react"

export default function SupplierPricesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [prices, setPrices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [search, setSearch] = useState("")
  const [entry, setEntry] = useState({
    supplier_name: "",
    category: "",
    model: "",
    storage: "",
    color: "",
    price: "",
    source_url: "",
  })
  const [bulkText, setBulkText] = useState("")

  useEffect(() => {
    fetchPrices()
  }, [])

  const fetchPrices = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_prices")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      setPrices(data || [])
    } catch (err) {
      console.error("Erro ao carregar preços:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!entry.category || !entry.model || !entry.price) {
      toast({ title: "Preencha categoria, modelo e preço", type: "error" })
      return
    }
    try {
      // Fetch company_id from users table
      const { data: userData } = await supabase
        .from("users")
        .select("company_id")
        .single()
      const companyId = userData?.company_id

      const { error } = await supabase.from("supplier_prices").insert({
        supplier_name: entry.supplier_name || null,
        category: entry.category,
        model: entry.model,
        storage: entry.storage || null,
        color: entry.color || null,
        price: parseFloat(entry.price),
        source_url: entry.source_url || null,
        company_id: companyId,
      })
      if (error) throw error
      toast({ title: "Preço adicionado!", type: "success" })
      setEntry({ supplier_name: "", category: "", model: "", storage: "", color: "", price: "", source_url: "" })
      setShowForm(false)
      fetchPrices()
    } catch (err: any) {
      toast({ title: "Erro ao adicionar preço", description: err.message, type: "error" })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("supplier_prices").delete().eq("id", id)
      if (error) throw error
      setPrices((prev) => prev.filter((p) => p.id !== id))
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, type: "error" })
    }
  }

  const handleBulkImport = async () => {
    // Format per user: groups of 2 lines
    // Line 1: 📲12 128 grade A+ 1330,00
    // Line 2: branco / preto / lilás /
    // Each color creates a separate entry
    const lines = bulkText.trim().split("\n").map(l => l.trim()).filter(Boolean)
    const items: any[] = []

    const modelMap: Record<string, string> = {
      "12": "iPhone 12",
      "12 mini": "iPhone 12 Mini",
      "12 pro": "iPhone 12 Pro",
      "12 pro max": "iPhone 12 Pro Max",
      "13": "iPhone 13",
      "13 mini": "iPhone 13 Mini",
      "13 pro": "iPhone 13 Pro",
      "13 pro max": "iPhone 13 Pro Max",
      "14": "iPhone 14",
      "14 plus": "iPhone 14 Plus",
      "14 pro": "iPhone 14 Pro",
      "14 pro max": "iPhone 14 Pro Max",
      "15": "iPhone 15",
      "15 plus": "iPhone 15 Plus",
      "15 pro": "iPhone 15 Pro",
      "15 pro max": "iPhone 15 Pro Max",
      "16": "iPhone 16",
      "16 plus": "iPhone 16 Plus",
      "16 pro": "iPhone 16 Pro",
      "16 pro max": "iPhone 16 Pro Max",
      "17": "iPhone 17",
      "17 air": "iPhone Air",
      "17 pro": "iPhone 17 Pro",
      "17 pro max": "iPhone 17 Pro Max",
      "se": "iPhone SE",
    }

    let i = 0
    while (i < lines.length) {
      const header = lines[i]

      // Strip emoji and extract parts
      const cleaned = header.replace(/[📲📱⌚💻🎧]/g, "").trim()

      // Price: last match of number with comma like 1330,00
      const priceMatch = cleaned.match(/([\d.]+),(\d{2})\s*$/)
      if (!priceMatch) { i++; continue }
      const price = parseFloat(priceMatch[1] + "." + priceMatch[2])

      // Grade
      const gradeMatch = cleaned.match(/grade\s+([A-B][+-]?)/i)
      const grade = gradeMatch ? gradeMatch[1] : null
      const dataPart = gradeMatch ? cleaned.replace(/grade\s+[A-B][+-]?\s*/i, "").trim() : cleaned.replace(/\s*[\d.]+,\d{2}\s*$/, "").trim()

      // Parse model words and storage
      const words = dataPart.split(/\s+/).filter(w => !/[\d.]+,\d{2}/.test(w))
      // Storage = 3-4 digit number among words
      let storage = ""
      const storageIdx = words.findIndex(w => /^\d{3,4}$/.test(w))
      if (storageIdx >= 0) {
        storage = words[storageIdx] + "GB"
        words.splice(storageIdx, 1)
      }

      const modelKey = words.join(" ").trim().toLowerCase()
      const fullModel = modelMap[modelKey] || null
      if (!fullModel) { i++; continue }

      // Colors: next line if it exists and isn't a new 📲 entry
      const nextLine = lines[i + 1]
      const colors: string[] = []
      if (nextLine && !nextLine.match(/[📲📱⌚💻🎧]/)) {
        colors.push(...nextLine.split("/").map(c => c.trim()).filter(Boolean).map(c => c.charAt(0).toUpperCase() + c.slice(1)))
        i += 2
      } else {
        colors.push("")
        i += 1
      }

      for (const color of colors) {
        items.push({
          model: fullModel,
          storage,
          grade,
          color: color || null,
          price,
        })
      }
    }

    if (items.length === 0) {
      toast({
        title: "Nenhum item válido encontrado",
        description: "Cole sua lista: 📲12 128 grade A+ 1330,00 seguido das cores na linha abaixo",
        type: "error",
      })
      return
    }

    try {
      // Fetch company_id from users table
      const { data: userData } = await supabase
        .from("users")
        .select("company_id")
        .single()
      const companyId = userData?.company_id

      const { error } = await supabase.from("supplier_prices").insert(
        items.map((item) => ({
          category: "iphone",
          model: item.model,
          storage: item.storage || null,
          color: item.color,
          price: item.price,
          notes: item.grade ? `Grade: ${item.grade}` : null,
          company_id: companyId || null,
        }))
      )
      if (error) throw error
      toast({ title: `${items.length} preços importados!`, type: "success" })
      setBulkText("")
      setShowBulk(false)
      fetchPrices()
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, type: "error" })
    }
  }

  const filtered = prices.filter((p) => {
    if (!search) return true
    return (
      p.model.toLowerCase().includes(search.toLowerCase()) ||
      (p.supplier_name || "").toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    )
  })

  // Stats
  const avgByModel = prices.reduce((acc, p) => {
    const key = `${p.category}/${p.model}/${p.storage || ""}`
    if (!acc[key]) acc[key] = { model: p.model, storage: p.storage, category: p.category, prices: [], count: 0 }
    acc[key].prices.push(Number(p.price))
    acc[key].count++
    return acc
  }, {})

  const globalAverage = prices.length > 0 ? prices.reduce((s, p) => s + Number(p.price), 0) / prices.length : 0

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Preços de Fornecedores</h2>
          <p className="text-sm text-gray-500">
            {prices.length} registros · Média geral: {formatBRL(globalAverage)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBulk(!showBulk)}>
            <Import className="w-4 h-4 mr-1" /> Importar
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" /> Novo Preço
          </Button>
        </div>
      </div>

      {/* Bulk import */}
      {showBulk && (
        <div className="bg-card rounded-2xl border border-royal-500/30 p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-navy-900">Importar Lista de Preços</h3>
          <p className="text-xs text-gray-500">
            Cole sua lista no formato abaixo. Cada cor na linha gera um registro separado:
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`📲12 128 grade A+ 1330,00\nbranco / preto / lilás\n\n📲13 pro 128 grade A+ 2290,00\nprata / gold / preto / azul\n\n📲15 pro max 256 grade A+ 3950,00\nsilver / natural / preto`}
            className="w-full h-48 px-3 py-2 text-sm border border-gray-200 rounded-xl font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-royal-500/20"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowBulk(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleBulkImport}>Importar</Button>
          </div>
        </div>
      )}

      {/* Single entry form */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-royal-500/30 p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-navy-900">Novo Preço de Referência</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input
              label="Fornecedor"
              placeholder="Ex: Mercado Livre, Kabum..."
              value={entry.supplier_name}
              onChange={(e) => setEntry((p) => ({ ...p, supplier_name: e.target.value }))}
            />
            <select
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={entry.category}
              onChange={(e) => setEntry((p) => ({ ...p, category: e.target.value, model: "" }))}
            >
              <option value="">Categoria</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {entry.category && (
              <select
                className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                value={entry.model}
                onChange={(e) => setEntry((p) => ({ ...p, model: e.target.value }))}
              >
                <option value="">Modelo</option>
                {(PRODUCT_CATALOG as any)[entry.category]?.models?.map((m: any, i: number) => (
                  <option key={i} value={m.name}>{m.name}</option>
                ))}
              </select>
            )}
            <Input
              label="Armazenamento"
              placeholder="128GB, 256GB..."
              value={entry.storage}
              onChange={(e) => setEntry((p) => ({ ...p, storage: e.target.value }))}
            />
            <Input
              label="Cor"
              placeholder="Azul, Preto..."
              value={entry.color}
              onChange={(e) => setEntry((p) => ({ ...p, color: e.target.value }))}
            />
            <Input
              label="Preço (R$)"
              type="number"
              placeholder="0,00"
              value={entry.price}
              onChange={(e) => setEntry((p) => ({ ...p, price: e.target.value }))}
            />
          </div>
          <Input
            label="URL de origem"
            placeholder="https://..."
            value={entry.source_url}
            onChange={(e) => setEntry((p) => ({ ...p, source_url: e.target.value }))}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd}>Adicionar Preço</Button>
          </div>
        </div>
      )}

      {/* Stats by model */}
      {Object.keys(avgByModel).length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm">
          <h3 className="font-semibold text-navy-900 mb-3">Média por Modelo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.values(avgByModel).map((item: any, idx) => {
              const avg = item.prices.reduce((a: number, b: number) => a + b, 0) / item.prices.length
              return (
                <div key={idx} className="bg-surface rounded-xl p-3">
                  <p className="text-sm font-medium text-navy-900 truncate">{item.model}{item.storage ? ` ${item.storage}` : ""}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-lg font-bold text-royal-500">{formatBRL(avg)}</p>
                    <Badge variant="blue">{item.count} preços</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Price list */}
      <Input
        placeholder="Buscar por modelo, fornecedor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">Nenhum preço cadastrado.</p>
          <p className="text-sm text-gray-300">Adicione preços de fornecedores para ter referência na avaliação de trade-in.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="bg-card rounded-xl border border-gray-100 p-3 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy-900">
                  {p.model}{p.storage ? ` ${p.storage}` : ""} {p.color ? `· ${p.color}` : ""}
                </p>
                <p className="text-xs text-gray-500">
                  {p.supplier_name || "—"} · {p.category}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="text-sm font-bold text-navy-900">{formatBRL(Number(p.price))}</p>
                <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-danger-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-royal-100/30 rounded-2xl border border-royal-500/20 p-4">
        <p className="text-sm font-medium text-navy-900">Dica</p>
        <p className="text-xs text-gray-500 mt-1">
          Quanto mais preços de referência você cadastrar, mais precisa será a avaliação de trade-in.
          Inclua preços de Mercado Livre, Kabum, Amazon, OLX e outros fornecedores.
        </p>
      </div>
    </div>
  )
}
