"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, ChevronRight, Clock3, Database, ExternalLink, Filter, Import, Layers3, Plus, Search, Trash2, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toaster"
import { CATEGORIES, PRODUCT_CATALOG } from "@/lib/constants"
import { formatBRL } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type SupplierPrice = {
  id: string
  supplier_name?: string | null
  category: string
  model: string
  storage?: string | null
  color?: string | null
  price: number | string
  source_url?: string | null
  notes?: string | null
  created_at?: string | null
}

type ModelAverage = {
  key: string
  model: string
  storage: string
  category: string
  prices: number[]
  count: number
  min: number
  max: number
  avg: number
}

type GenerationSummary = {
  generation: string
  count: number
  models: number
  avg: number
  min: number
  max: number
  status: "Alta" | "Boa" | "Baixa" | "Novo"
}

const categoryLabels: Record<string, string> = Object.fromEntries(CATEGORIES.map((category) => [category.value, category.label]))

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getPriceDate(value?: string | null) {
  if (!value) return "Sem data"
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value))
}

function productName(price: SupplierPrice) {
  return [price.model, price.storage, price.color].filter(Boolean).join(" ")
}

function modelGeneration(model: string) {
  const match = model.match(/iPhone\s+(Air|\d+)/i)
  if (!match) return "Outros"
  return match[1].toLowerCase() === "air" ? "iPhone Air" : `Linha ${match[1]}`
}

export default function SupplierPricesPage() {
  const { toast } = useToast()
  const [prices, setPrices] = useState<SupplierPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [expandedGenerations, setExpandedGenerations] = useState<Record<string, boolean>>({})
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
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("supplier_prices")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      setPrices(data || [])
    } catch (err) {
      console.error("Erro ao carregar preços:", err)
      toast({ title: "Erro ao carregar preços", type: "error" })
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
      const { data: userData } = await (supabase
        .from("users")
        .select("company_id")
        .single() as any)

      const { error } = await ((supabase.from("supplier_prices") as any).insert({
        supplier_name: entry.supplier_name || null,
        category: entry.category,
        model: entry.model,
        storage: entry.storage || null,
        color: entry.color || null,
        price: parseFloat(entry.price),
        source_url: entry.source_url || null,
        company_id: userData?.company_id,
      }))
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
    const lines = bulkText.trim().split("\n").map((line) => line.trim()).filter(Boolean)
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
      se: "iPhone SE",
    }

    let i = 0
    while (i < lines.length) {
      const cleaned = lines[i].replace(/[📲📱⌚💻🎧]/g, "").trim()
      const priceMatch = cleaned.match(/([\d.]+),(\d{2})\s*$/)
      if (!priceMatch) {
        i += 1
        continue
      }

      const price = parseFloat(priceMatch[1] + "." + priceMatch[2])
      const gradeMatch = cleaned.match(/grade\s+([A-B][+-]?)/i)
      const grade = gradeMatch ? gradeMatch[1] : null
      const dataPart = gradeMatch ? cleaned.replace(/grade\s+[A-B][+-]?\s*/i, "").trim() : cleaned.replace(/\s*[\d.]+,\d{2}\s*$/, "").trim()
      const words = dataPart.split(/\s+/).filter((word) => !/[\d.]+,\d{2}/.test(word))
      let storage = ""
      const storageIdx = words.findIndex((word) => /^\d{3,4}$/.test(word))
      if (storageIdx >= 0) {
        storage = `${words[storageIdx]}GB`
        words.splice(storageIdx, 1)
      }

      const modelKey = words.join(" ").trim().toLowerCase()
      const fullModel = modelMap[modelKey] || null
      if (!fullModel) {
        i += 1
        continue
      }

      const nextLine = lines[i + 1]
      const colors: string[] = []
      if (nextLine && !nextLine.match(/[📲📱⌚💻🎧]/)) {
        colors.push(...nextLine.split("/").map((color) => color.trim()).filter(Boolean).map((color) => color.charAt(0).toUpperCase() + color.slice(1)))
        i += 2
      } else {
        colors.push("")
        i += 1
      }

      for (const color of colors) {
        items.push({ model: fullModel, storage, grade, color: color || null, price })
      }
    }

    if (items.length === 0) {
      toast({
        title: "Nenhum item válido encontrado",
        description: "Cole sua lista: 12 128 grade A+ 1330,00 seguido das cores na linha abaixo",
        type: "error",
      })
      return
    }

    try {
      const { data: userData } = await (supabase
        .from("users")
        .select("company_id")
        .single() as any)

      const { error } = await ((supabase.from("supplier_prices") as any).insert(
        items.map((item) => ({
          category: "iphone",
          model: item.model,
          storage: item.storage || null,
          color: item.color,
          price: item.price,
          notes: item.grade ? `Grade: ${item.grade}` : null,
          company_id: userData?.company_id || null,
        }))
      ))
      if (error) throw error
      toast({ title: `${items.length} preços importados!`, type: "success" })
      setBulkText("")
      setShowBulk(false)
      fetchPrices()
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, type: "error" })
    }
  }

  const suppliers = useMemo(() => {
    return Array.from(new Set(prices.map((price) => price.supplier_name).filter(Boolean) as string[])).sort()
  }, [prices])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return prices.filter((price) => {
      const matchesSearch = !term || [
        price.model,
        price.storage,
        price.color,
        price.category,
        price.supplier_name,
        price.notes,
      ].filter(Boolean).join(" ").toLowerCase().includes(term)
      const matchesCategory = categoryFilter === "all" || price.category === categoryFilter
      const matchesSupplier = supplierFilter === "all" || price.supplier_name === supplierFilter
      return matchesSearch && matchesCategory && matchesSupplier
    })
  }, [categoryFilter, prices, search, supplierFilter])

  const modelAverages = useMemo(() => {
    const grouped = new Map<string, ModelAverage>()
    for (const price of prices) {
      const key = `${price.category}/${price.model}/${price.storage || ""}`
      const value = toNumber(price.price)
      const current = grouped.get(key) || {
        key,
        model: price.model,
        storage: price.storage || "",
        category: price.category,
        prices: [],
        count: 0,
        min: value,
        max: value,
        avg: value,
      }
      current.prices.push(value)
      current.count += 1
      current.min = Math.min(current.min, value)
      current.max = Math.max(current.max, value)
      current.avg = current.prices.reduce((sum, item) => sum + item, 0) / current.prices.length
      grouped.set(key, current)
    }
    return Array.from(grouped.values()).sort((a, b) => {
      const generation = modelGeneration(b.model).localeCompare(modelGeneration(a.model), "pt-BR", { numeric: true })
      if (generation !== 0) return generation
      return a.model.localeCompare(b.model, "pt-BR", { numeric: true }) || a.storage.localeCompare(b.storage, "pt-BR", { numeric: true })
    })
  }, [prices])

  const modelGroups = useMemo(() => {
    return modelAverages.reduce((acc, item) => {
      const generation = modelGeneration(item.model)
      if (!acc[generation]) acc[generation] = []
      acc[generation].push(item)
      return acc
    }, {} as Record<string, ModelAverage[]>)
  }, [modelAverages])

  const generationSummaries = useMemo(() => {
    return Object.entries(modelGroups).map(([generation, items]) => {
      const count = items.reduce((sum, item) => sum + item.count, 0)
      const weightedTotal = items.reduce((sum, item) => sum + item.avg * item.count, 0)
      const min = Math.min(...items.map((item) => item.min))
      const max = Math.max(...items.map((item) => item.max))
      const status = count >= 20 ? "Alta" : count >= 10 ? "Boa" : count >= 5 ? "Baixa" : "Novo"
      return {
        generation,
        count,
        models: items.length,
        avg: count > 0 ? weightedTotal / count : 0,
        min,
        max,
        status,
      } satisfies GenerationSummary
    }).sort((a, b) => b.generation.localeCompare(a.generation, "pt-BR", { numeric: true }))
  }, [modelGroups])

  const globalAverage = prices.length > 0 ? prices.reduce((sum, price) => sum + toNumber(price.price), 0) / prices.length : 0
  const topCovered = modelAverages.reduce<ModelAverage | null>((best, item) => !best || item.count > best.count ? item : best, null)
  const lastUpdate = prices[0]?.created_at ? getPriceDate(prices[0].created_at) : "Sem dados"
  const selectedCategoryModels = entry.category ? (PRODUCT_CATALOG as any)[entry.category]?.models || [] : []
  const toggleGeneration = (generation: string) => {
    setExpandedGenerations((previous) => ({ ...previous, [generation]: !previous[generation] }))
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <h2 className="font-display font-syne text-2xl font-bold text-navy-900">Preços de Fornecedores</h2>
          <p className="mt-1 text-sm text-gray-500">Referência viva para compra, trade-in e negociação. Os dados ficam separados por modelo, fornecedor e variação.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setShowBulk((value) => !value)} className="h-11">
            <Import className="h-4 w-4" /> Importar lista
          </Button>
          <Button variant="primary" onClick={() => setShowForm((value) => !value)} className="h-11 shadow-lg shadow-royal-600/20">
            <Plus className="h-4 w-4" /> Novo preço
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Database} label="Registros" value={String(prices.length)} helper={`${filtered.length} visíveis`} />
        <MetricCard icon={TrendingUp} label="Média geral" value={formatBRL(globalAverage)} helper="Base de referência" />
        <MetricCard icon={Layers3} label="Modelo mais coberto" value={topCovered ? `${topCovered.model} ${topCovered.storage}` : "Sem dados"} helper={topCovered ? `${topCovered.count} preço(s)` : "Cadastre preços"} />
        <MetricCard icon={Clock3} label="Última atualização" value={lastUpdate} helper="Registro mais recente" />
      </div>

      {(showBulk || showForm) && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          {showBulk && (
            <Card className="overflow-hidden border-royal-500/20">
              <div className="border-b border-gray-100 bg-royal-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold text-navy-900 font-syne">Importação rápida</h3>
                    <p className="mt-1 text-xs text-gray-500">Cole a lista do fornecedor; cada cor vira um registro separado.</p>
                  </div>
                  <Badge variant="blue">iPhone</Badge>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <textarea
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder={`12 128 grade A+ 1330,00\nbranco / preto / lilás\n\n13 pro 128 grade A+ 2290,00\nprata / gold / preto / azul\n\n15 pro max 256 grade A+ 3950,00\nsilver / natural / preto`}
                  className="h-52 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 font-mono text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowBulk(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleBulkImport}>Importar preços</Button>
                </div>
              </div>
            </Card>
          )}

          {showForm && (
            <Card className="overflow-hidden border-royal-500/20">
              <div className="border-b border-gray-100 bg-gray-50/70 p-4">
                <h3 className="font-display font-bold text-navy-900 font-syne">Novo preço de referência</h3>
                <p className="mt-1 text-xs text-gray-500">Use quando quiser registrar uma cotação específica com origem e fornecedor.</p>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Input label="Fornecedor" placeholder="Ex: Victor, ML, Kabum" value={entry.supplier_name} onChange={(event) => setEntry((previous) => ({ ...previous, supplier_name: event.target.value }))} />
                  <Field label="Categoria">
                    <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20" value={entry.category} onChange={(event) => setEntry((previous) => ({ ...previous, category: event.target.value, model: "" }))}>
                      <option value="">Selecione</option>
                      {CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Modelo">
                    <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:bg-gray-50" disabled={!entry.category} value={entry.model} onChange={(event) => setEntry((previous) => ({ ...previous, model: event.target.value }))}>
                      <option value="">Selecione</option>
                      {selectedCategoryModels.map((model: any, index: number) => (
                        <option key={index} value={model.name}>{model.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Input label="Armazenamento" placeholder="128GB" value={entry.storage} onChange={(event) => setEntry((previous) => ({ ...previous, storage: event.target.value }))} />
                  <Input label="Cor" placeholder="Titânio natural" value={entry.color} onChange={(event) => setEntry((previous) => ({ ...previous, color: event.target.value }))} />
                  <Input label="Preço (R$)" type="number" placeholder="0,00" value={entry.price} onChange={(event) => setEntry((previous) => ({ ...previous, price: event.target.value }))} />
                </div>
                <Input label="URL de origem" placeholder="https://..." value={entry.source_url} onChange={(event) => setEntry((previous) => ({ ...previous, source_url: event.target.value }))} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleAdd}>Adicionar preço</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Mapa de preços por modelo (média)</h3>
              <p className="mt-1 text-xs text-gray-500">Visão por geração com cobertura, faixa de preço e leitura de confiança.</p>
            </div>
            <Badge variant="gray">{modelAverages.length} variações</Badge>
          </div>
          <div className="overflow-x-auto p-4">
            {generationSummaries.length > 0 ? (
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-3">Modelo</th>
                    <th className="px-3 py-3 text-right">Média</th>
                    <th className="px-3 py-3 text-center">Cobertura</th>
                    <th className="px-3 py-3 text-right">Faixa de preço (mín - máx)</th>
                    <th className="px-3 py-3 text-right">Tendência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {generationSummaries.map((summary) => (
                    <GenerationPriceGroup
                      key={summary.generation}
                      summary={summary}
                      items={modelGroups[summary.generation] || []}
                      expanded={Boolean(expandedGenerations[summary.generation])}
                      onToggle={() => toggleGeneration(summary.generation)}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-14 text-center text-sm text-gray-400">Nenhuma referência cadastrada ainda.</div>
            )}
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-white"><Filter className="h-4 w-4" /></div>
              <div>
                <h3 className="font-display font-bold text-navy-900 font-syne">Filtros</h3>
                <p className="text-xs text-gray-500">Refine sem perder contexto.</p>
              </div>
            </div>
            <div className="space-y-3">
              <Input placeholder="Buscar modelo, cor, fornecedor..." value={search} onChange={(event) => setSearch(event.target.value)} icon={<Search className="h-4 w-4" />} />
              <div className="grid grid-cols-2 gap-2">
                <FilterButton active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>Tudo</FilterButton>
                {CATEGORIES.slice(0, 5).map((category) => (
                  <FilterButton key={category.value} active={categoryFilter === category.value} onClick={() => setCategoryFilter(category.value)}>
                    {category.label}
                  </FilterButton>
                ))}
              </div>
              <Field label="Fornecedor">
                <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-navy-900 p-4 text-white">
              <BarChart3 className="mb-8 h-5 w-5 text-royal-200" />
              <p className="text-sm font-semibold">Leitura rápida</p>
              <p className="mt-1 text-xs leading-5 text-white/60">Use a média para cotação inicial e a faixa min/max para saber onde há margem de negociação.</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-4">
                <p className="text-xs text-gray-400">Fornecedores</p>
                <p className="mt-1 text-xl font-bold text-navy-900">{suppliers.length || "—"}</p>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-400">Categorias</p>
                <p className="mt-1 text-xl font-bold text-navy-900">{new Set(prices.map((price) => price.category)).size || "—"}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-navy-900 font-syne">Importação rápida</h3>
                <p className="mt-1 text-xs text-gray-500">Cole a lista no formato do fornecedor.</p>
              </div>
              <span className="text-gray-300">ⓘ</span>
            </div>
            <button
              type="button"
              onClick={() => setShowBulk(true)}
              className="flex w-full items-center justify-between rounded-xl border border-royal-100 bg-royal-50 px-4 py-4 text-left transition hover:border-royal-200 hover:bg-royal-100/70"
            >
              <span>
                <span className="block text-xs font-semibold text-royal-700">Cole sua lista no formato:</span>
                <span className="mt-1 block whitespace-pre-line font-mono text-xs leading-5 text-royal-900">12 128 grade A+ 1330,00{"\n"}branco / preto / lilás</span>
              </span>
              <ChevronRight className="h-5 w-5 text-royal-600" />
            </button>
          </Card>
        </aside>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Registros de preço</h3>
            <p className="text-xs text-gray-500">{filtered.length} registro(s) no recorte atual.</p>
          </div>
          {(search || categoryFilter !== "all" || supplierFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCategoryFilter("all"); setSupplierFilter("all") }}>Limpar filtros</Button>
          )}
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">Carregando preços...</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-medium text-navy-900">Nenhum preço encontrado</p>
            <p className="mt-1 text-sm text-gray-400">Ajuste os filtros ou cadastre uma nova referência.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Preço</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((price) => (
                  <tr key={price.id} className="transition hover:bg-royal-50/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-900">{productName(price)}</p>
                      {price.notes && <p className="mt-0.5 text-xs text-gray-400">{price.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{price.supplier_name || "Sem fornecedor"}</td>
                    <td className="px-4 py-3"><Badge variant="gray">{categoryLabels[price.category] || price.category}</Badge></td>
                    <td className="px-4 py-3 text-right text-base font-bold text-navy-900">{formatBRL(toNumber(price.price))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{getPriceDate(price.created_at)}</span>
                        {price.source_url && (
                          <a href={price.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-royal-600 hover:text-royal-700">
                            Link <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button title="Excluir preço" onClick={() => handleDelete(price.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-danger-100 hover:text-danger-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, helper }: { icon: any; label: string; value: string; helper: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="mt-2 truncate text-xl font-bold text-navy-900">{value}</p>
          <p className="mt-1 text-xs text-gray-400">{helper}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

function GenerationPriceGroup({
  summary,
  items,
  expanded,
  onToggle,
}: {
  summary: GenerationSummary
  items: ModelAverage[]
  expanded: boolean
  onToggle: () => void
}) {
  const statusVariant = summary.status === "Alta" ? "green" : summary.status === "Boa" ? "blue" : summary.status === "Baixa" ? "yellow" : "gray"

  return (
    <>
      <tr className="group transition hover:bg-royal-50/40">
        <td className="px-3 py-3">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Recolher" : "Expandir"} ${summary.generation.replace("Linha", "iPhone")}`}
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-royal-500/30"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition group-hover:bg-white group-hover:text-royal-600">
              <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90 text-royal-600")} />
            </span>
            <span>
              <span className="block font-bold text-navy-900">{summary.generation.replace("Linha", "iPhone")}</span>
              <span className="mt-0.5 block text-xs text-gray-400">{summary.models} modelo(s)</span>
            </span>
          </button>
        </td>
        <td className="px-3 py-3 text-right font-bold text-navy-900">{formatBRL(summary.avg)}</td>
        <td className="px-3 py-3 text-center">
          <Badge variant={statusVariant as any}>{summary.count} preços</Badge>
        </td>
        <td className="px-3 py-3 text-right text-gray-600">{formatBRL(summary.min)} <span className="px-2 text-gray-300">-</span> {formatBRL(summary.max)}</td>
        <td className="px-3 py-3 text-right">
          <Badge variant={statusVariant as any}>{summary.status}</Badge>
        </td>
      </tr>
      {expanded && items.map((item) => (
        <tr key={item.key} className="bg-royal-50/30">
          <td className="py-2 pl-14 pr-3">
            <p className="font-semibold text-navy-900">{item.model}{item.storage ? ` ${item.storage}` : ""}</p>
            <p className="mt-0.5 text-xs text-gray-400">{categoryLabels[item.category] || item.category}</p>
          </td>
          <td className="px-3 py-2 text-right font-semibold text-navy-900">{formatBRL(item.avg)}</td>
          <td className="px-3 py-2 text-center">
            <Badge variant={item.count >= 5 ? "green" : item.count >= 3 ? "blue" : "gray"}>{item.count} preço(s)</Badge>
          </td>
          <td className="px-3 py-2 text-right text-gray-500">{formatBRL(item.min)} <span className="px-2 text-gray-300">-</span> {formatBRL(item.max)}</td>
          <td className="px-3 py-2 text-right text-xs font-semibold text-gray-400">
            {item.max - item.min > 0 ? `${formatBRL(item.max - item.min)} var.` : "Sem var."}
          </td>
        </tr>
      ))}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-navy-900">{label}</span>
      {children}
    </label>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-xl border px-3 text-xs font-semibold transition",
        active ? "border-navy-900 bg-navy-900 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-royal-200 hover:text-navy-900"
      )}
    >
      {children}
    </button>
  )
}
