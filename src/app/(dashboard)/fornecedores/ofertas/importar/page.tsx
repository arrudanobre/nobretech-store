"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  CopyX,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  ReviewedSupplierOffer,
  SupplierOfferCondition,
  SupplierOfferReviewStatus,
  SupplierOfferStatus,
  SupplierOfferWarrantyType,
} from "@/lib/supplier-offers/types"

type SupplierOption = { id: string; name: string }
type TraceabilityPayload = { suppliers: Array<{ supplier: SupplierOption | null }> }

const conditionOptions: Array<{ value: SupplierOfferCondition; label: string }> = [
  { value: "sealed", label: "Lacrado" },
  { value: "used", label: "Seminovo/usado" },
  { value: "unknown", label: "Incerta" },
]

const warrantyOptions: Array<{ value: SupplierOfferWarrantyType; label: string }> = [
  { value: "none", label: "Sem garantia informada" },
  { value: "apple", label: "Apple" },
  { value: "nobretech", label: "Nobretech" },
  { value: "supplier", label: "Fornecedor" },
  { value: "unknown", label: "Outra/Revisar" },
]

const statusOptions: Array<{ value: SupplierOfferStatus; label: string }> = [
  { value: "available", label: "Disponível" },
  { value: "needs_review", label: "Revisar" },
  { value: "ignored", label: "Ignorado" },
  { value: "unavailable", label: "Indisponível" },
  { value: "reserved_with_supplier", label: "Reservado fornecedor" },
  { value: "draft", label: "Rascunho" },
]

function numberInputValue(value: number | null | undefined) {
  return value == null ? "" : String(value)
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

function formatBRL(value: number | null | undefined) {
  if (value == null) return "Sem preço"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function itemTitle(item: ReviewedSupplierOffer) {
  return [item.model, item.storage, item.size, item.color].filter(Boolean).join(" ") || "Produto não identificado"
}

function categoryGroup(category: string | null | undefined) {
  const value = String(category || "").toLowerCase()
  if (["iphone", "ipad", "macbook"].includes(value)) return "device"
  if (["applewatch", "garmin"].includes(value)) return "watch"
  if (["gadgets", "airpods", "accessories"].includes(value)) return "gadget"
  return "unknown"
}

function needsBatteryField(item: ReviewedSupplierOffer) {
  if (item.condition !== "used") return false
  if (item.batteryHealth != null) return true
  return ["iphone", "ipad", "macbook", "applewatch"].includes(String(item.category || "").toLowerCase())
}

function needsStorageField(item: ReviewedSupplierOffer) {
  return categoryGroup(item.category) === "device"
}

function needsSizeField(item: ReviewedSupplierOffer) {
  if (categoryGroup(item.category) === "watch") return true
  return Boolean(item.size)
}

function statusFromParsed(item: ReviewedSupplierOffer): SupplierOfferStatus {
  if (item.status) return item.status
  if (item.reviewStatus === "needs_review") return "needs_review"
  if (item.availability === "available" && item.supplierPrice != null) return "available"
  if (item.availability === "unavailable") return "unavailable"
  return "needs_review"
}

function classifyReview(item: ReviewedSupplierOffer): SupplierOfferReviewStatus {
  if (statusFromParsed(item) === "ignored") return "ignored"
  if (item.duplicateCandidate) return "duplicate"
  if (item.reviewStatus) return item.reviewStatus
  if (statusFromParsed(item) === "needs_review") return "needs_review"
  return "ready"
}

// Separate from classifyReview: purely whether IA considers item ready
function isItemReady(item: ReviewedSupplierOffer): boolean {
  return classifyReview(item) === "ready"
}

function visualStatusBadge(item: ReviewedSupplierOffer, confirmed: boolean) {
  const review = classifyReview(item)
  if (review === "ignored") return <Badge variant="gray">Ignorado</Badge>
  if (review === "duplicate") return <Badge variant="yellow">Duplicado provável</Badge>
  if (confirmed) return <Badge variant="blue">Confirmado</Badge>
  if (review === "ready") return <Badge variant="green">Pronto</Badge>
  return <Badge variant="yellow">Para revisar</Badge>
}

function confidenceBadge(confidence: ReviewedSupplierOffer["confidence"]) {
  if (confidence === "high") return <Badge variant="green">Alta confiança</Badge>
  if (confidence === "low") return <Badge variant="red">Baixa confiança</Badge>
  return <Badge variant="yellow">Média confiança</Badge>
}

function conditionLabel(condition: SupplierOfferCondition) {
  if (condition === "sealed") return "Lacrado"
  if (condition === "used") return "Seminovo"
  return "Condição incerta"
}

function displayWarnings(item: ReviewedSupplierOffer) {
  const warnings = item.warnings.filter((w) => !/^IA\s/i.test(w))
  return item.condition === "sealed" ? warnings.filter((w) => !/bateria/i.test(w)) : warnings
}

function compactFacts(item: ReviewedSupplierOffer) {
  const facts = [conditionLabel(item.condition)]
  if (item.condition === "used" && item.batteryHealth != null) facts.push(`Bat. ${item.batteryHealth}%`)
  if (item.condition !== "sealed" && item.variant) facts.push(item.variant)
  facts.push(formatBRL(item.supplierPrice))
  if (item.warrantyLabel) facts.push(item.warrantyLabel)
  return facts.filter(Boolean).join(" · ")
}

function warrantyDetailValue(item: ReviewedSupplierOffer) {
  return (item.warrantyLabel || "")
    .replace(/^Garantia Apple\s*/i, "")
    .replace(/^Garantia Nobretech\s*/i, "")
    .replace(/^Garantia fornecedor\s*/i, "")
    .replace(/^Garantia a revisar\s*/i, "")
    .trim()
}

function warrantyLabelFromFields(type: SupplierOfferWarrantyType, detail: string) {
  const cleanDetail = detail.trim()
  if (type === "none") return null
  const prefix =
    type === "apple"
      ? "Garantia Apple"
      : type === "nobretech"
        ? "Garantia Nobretech"
        : type === "supplier"
          ? "Garantia fornecedor"
          : "Garantia a revisar"
  return [prefix, cleanDetail].filter(Boolean).join(" ")
}

export default function SupplierOfferImportPage() {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [supplierId, setSupplierId] = useState("")
  const [rawText, setRawText] = useState("")
  const [items, setItems] = useState<ReviewedSupplierOffer[]>([])
  // Indices of user-confirmed items (separate from IA readiness)
  const [confirmedIndices, setConfirmedIndices] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [batchWarnings, setBatchWarnings] = useState<string[]>([])
  const [parserMode, setParserMode] = useState<"ai" | "hybrid" | "local" | null>(null)
  const [parseMeta, setParseMeta] = useState({ aiFailedBlocks: 0, localFallbackBlocks: 0 })
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inactivatePrevious, setInactivatePrevious] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch("/api/suppliers/traceability")
      .then((r) => r.json().then((p) => ({ ok: r.ok, payload: p })))
      .then(({ ok, payload }) => {
        if (!mounted) return
        if (!ok || !payload?.data) {
          toast.error(payload?.error?.message || "Erro ao carregar fornecedores")
          return
        }
        const data = payload.data as TraceabilityPayload
        const options = data.suppliers
          .map((item) => item.supplier)
          .filter((s): s is SupplierOption => Boolean(s?.id))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        setSuppliers(options)
      })
      .catch(() => toast.error("Erro ao carregar fornecedores"))
      .finally(() => {
        if (mounted) setLoadingSuppliers(false)
      })
    return () => { mounted = false }
  }, [])

  const selectedSupplierName = suppliers.find((s) => s.id === supplierId)?.name || "Fornecedor não selecionado"

  const summary = useMemo(() => {
    const ready = items.filter((item) => isItemReady(item)).length
    const needsReview = items.filter((item) => classifyReview(item) === "needs_review").length
    const duplicates = items.filter((item) => classifyReview(item) === "duplicate").length
    const confirmed = confirmedIndices.size
    return { total: items.length, ready, needsReview, duplicates, confirmed }
  }, [items, confirmedIndices])

  // Deconfirm on field edit
  const updateItem = <K extends keyof ReviewedSupplierOffer>(index: number, key: K, value: ReviewedSupplierOffer[K]) => {
    setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
    setConfirmedIndices((current) => {
      if (!current.has(index)) return current
      const next = new Set(current)
      next.delete(index)
      return next
    })
  }

  const interpretList = async () => {
    if (!rawText.trim()) {
      toast.error("Cole a lista recebida no WhatsApp antes de interpretar.")
      return
    }
    setParsing(true)
    setBatchWarnings([])
    setParserMode(null)
    setParseMeta({ aiFailedBlocks: 0, localFallbackBlocks: 0 })
    const response = await fetch("/api/supplier-offers/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplierId || undefined, rawText }),
    })
    const payload = await response.json().catch(() => null)
    setParsing(false)

    if (!response.ok || !payload?.data?.items) {
      toast.error(payload?.error?.message || "Erro ao interpretar lista.")
      return
    }

    const parsedItems = (payload.data.items as ReviewedSupplierOffer[]).map((item) => ({
      ...item,
      // Set status but do NOT auto-confirm — user must confirm explicitly
      status: statusFromParsed(item),
    }))
    setItems(parsedItems)
    setConfirmedIndices(new Set()) // Reset confirmations on re-parse
    setExpanded({})
    setParserMode(payload.data.parserMode || null)
    setParseMeta({
      aiFailedBlocks: Number(payload.data.aiFailedBlocks || 0),
      localFallbackBlocks: Number(payload.data.localFallbackBlocks || 0),
    })
    setBatchWarnings(Array.isArray(payload.data.batchWarnings) ? payload.data.batchWarnings : [])
    const readyCount = parsedItems.filter((item) => isItemReady(item)).length
    toast.success(`${parsedItems.length} oportunidade(s) interpretada(s). ${readyCount} pronta(s) aguardando confirmação.`)
  }

  const confirmItem = (index: number) => {
    setConfirmedIndices((current) => {
      const next = new Set(current)
      next.add(index)
      return next
    })
  }

  const deconfirmItem = (index: number) => {
    setConfirmedIndices((current) => {
      const next = new Set(current)
      next.delete(index)
      return next
    })
  }

  const confirmAllReady = () => {
    const readyIndices = items.reduce<number[]>((acc, item, index) => {
      if (isItemReady(item)) acc.push(index)
      return acc
    }, [])
    if (!readyIndices.length) return
    setConfirmedIndices((current) => {
      const next = new Set(current)
      readyIndices.forEach((i) => next.add(i))
      return next
    })
    toast.success(`${readyIndices.length} oportunidade(s) pronta(s) confirmada(s).`)
  }

  const ignoreItem = (index: number) => {
    updateItem(index, "status", "ignored")
    setConfirmedIndices((current) => {
      const next = new Set(current)
      next.delete(index)
      return next
    })
  }

  const removeProbableDuplicates = () => {
    const keptIndices = new Set<number>()
    const seenKeys = new Set<string>()
    items.forEach((item, index) => {
      if (!item.duplicateCandidate || !item.duplicateKey) {
        keptIndices.add(index)
      } else if (!seenKeys.has(item.duplicateKey)) {
        seenKeys.add(item.duplicateKey)
        keptIndices.add(index)
      }
    })
    const newItems = items.filter((_, i) => keptIndices.has(i))
    const oldToNew = new Map<number, number>()
    let newIdx = 0
    items.forEach((_, oldIdx) => {
      if (keptIndices.has(oldIdx)) { oldToNew.set(oldIdx, newIdx); newIdx++ }
    })
    const newConfirmed = new Set<number>()
    confirmedIndices.forEach((oldIdx) => {
      const n = oldToNew.get(oldIdx)
      if (n !== undefined) newConfirmed.add(n)
    })
    setItems(newItems)
    setConfirmedIndices(newConfirmed)
    setExpanded({})
  }

  const saveOffers = async () => {
    if (!rawText.trim()) {
      toast.error("Texto bruto é obrigatório.")
      return
    }
    if (confirmedIndices.size === 0) {
      toast.error("Confirme pelo menos uma oportunidade antes de salvar. Use 'Confirmar' em cada item ou 'Confirmar todos prontos'.")
      return
    }
    if (inactivatePrevious && !supplierId) {
      toast.error("Selecione um fornecedor para substituir ofertas anteriores.")
      return
    }

    const toSave = items.filter((_, index) => confirmedIndices.has(index))

    if ((parserMode === "local" || parserMode === "hybrid") && items.length > 10) {
      const ok = window.confirm("A lista teve fallback local. Revise os itens antes de salvar. Deseja salvar apenas os itens confirmados agora?")
      if (!ok) return
    }

    setSaving(true)
    const response = await fetch("/api/supplier-offers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: supplierId || undefined,
        rawText,
        items: toSave,
        inactivatePrevious: inactivatePrevious && Boolean(supplierId),
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok || !payload?.data) {
      toast.error(payload?.error?.message || "Erro ao salvar oportunidades.")
      return
    }

    const supersededMsg = payload.data.supersededCount ? ` ${payload.data.supersededCount} oferta(s) anterior(es) marcada(s) como substituída(s).` : ""
    toast.success(`${payload.data.savedCount} oportunidade(s) salva(s).${supersededMsg}`)
    setItems([])
    setConfirmedIndices(new Set())
    setRawText("")
    setBatchWarnings([])
    setParserMode(null)
    setParseMeta({ aiFailedBlocks: 0, localFallbackBlocks: 0 })
    setExpanded({})
    setInactivatePrevious(false)
  }

  const clearAll = () => {
    setItems([])
    setConfirmedIndices(new Set())
    setRawText("")
    setBatchWarnings([])
    setParserMode(null)
    setParseMeta({ aiFailedBlocks: 0, localFallbackBlocks: 0 })
    setExpanded({})
  }

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/fornecedores/ofertas">
            <Button variant="ghost" size="icon" aria-label="Voltar para ofertas">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="font-syne text-xl font-bold text-navy-900">Importar ofertas de fornecedor</h2>
            <p className="text-sm text-gray-500">Cole a lista recebida no WhatsApp e confirme os itens antes de salvar.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={clearAll} disabled={parsing || saving || (!rawText && !items.length)}>
            <XCircle className="h-4 w-4" /> Limpar
          </Button>
          <Button variant="primary" size="sm" onClick={saveOffers} isLoading={saving} disabled={!items.length || parsing || confirmedIndices.size === 0}>
            <Save className="h-4 w-4" /> Salvar {confirmedIndices.size > 0 ? `${confirmedIndices.size} confirmado(s)` : "oportunidades"}
          </Button>
        </div>
      </div>

      {/* Input section */}
      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr_auto] lg:items-end">
          <Select
            label="Fornecedor"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={loadingSuppliers || parsing || saving}
          >
            <option value="">Fornecedor não selecionado</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Textarea
            label="Texto bruto"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Cole aqui a lista recebida no WhatsApp..."
            className="min-h-32"
            disabled={parsing || saving}
          />
          <Button className="h-11" variant="secondary" onClick={interpretList} isLoading={parsing} disabled={saving}>
            <Sparkles className="h-4 w-4" /> Interpretar lista com IA
          </Button>
        </div>

        {/* Status counters */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <Badge variant="blue" className="gap-2">
            <Bot className="h-3.5 w-3.5" />
            {parserMode === "ai" ? "IA estruturada" : parserMode === "hybrid" ? "IA + fallback" : parserMode === "local" ? "Parser local" : "Aguardando interpretação"}
          </Badge>
          <Badge variant="gray">{summary.total} total</Badge>
          <Badge variant="green">{summary.ready} pronto(s)</Badge>
          <Badge variant={summary.needsReview ? "yellow" : "gray"}>{summary.needsReview} para revisar</Badge>
          <Badge variant={summary.duplicates ? "yellow" : "gray"}>{summary.duplicates} duplicado(s)</Badge>
          <Badge variant={summary.confirmed > 0 ? "blue" : "gray"} className="font-semibold">
            {summary.confirmed} confirmado(s)
          </Badge>
          {parserMode === "hybrid" ? <Badge variant="yellow">{parseMeta.localFallbackBlocks} bloco(s) em fallback</Badge> : null}
        </div>

        {batchWarnings.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {batchWarnings.map((w) => (
              <p key={w} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
              </p>
            ))}
            <Button className="mt-3" variant="outline" size="sm" onClick={interpretList} isLoading={parsing} disabled={saving || !rawText.trim()}>
              <Sparkles className="h-4 w-4" /> Tentar IA novamente
            </Button>
          </div>
        ) : null}

        {/* Inactivate previous option */}
        {items.length > 0 ? (
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-royal-500"
                checked={inactivatePrevious}
                onChange={(e) => setInactivatePrevious(e.target.checked)}
                disabled={saving}
              />
              <div>
                <span className="text-sm font-semibold text-navy-900">Inativar ofertas anteriores disponíveis deste fornecedor</span>
                <p className="mt-0.5 text-xs text-gray-500">
                  Recomendado quando esta lista substitui a lista anterior do fornecedor. Marca como{" "}
                  <span className="font-medium">substituída</span> as ofertas com status disponível, rascunho e para revisar.
                  Reservadas com fornecedor não são afetadas.
                </p>
                {inactivatePrevious && !supplierId ? (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    Selecione um fornecedor acima para substituir ofertas anteriores.
                  </p>
                ) : null}
              </div>
            </label>
          </div>
        ) : null}
      </section>

      {/* Items list */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-bold text-navy-900">Prévia revisável</h3>
            <p className="text-sm text-gray-500">
              Confirme os itens que deseja salvar. Itens &quot;Pronto&quot; foram validados pela IA mas ainda precisam da sua confirmação.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={confirmAllReady} disabled={!summary.ready || parsing || saving}>
              <CheckCircle2 className="h-4 w-4" /> Confirmar todos prontos
            </Button>
            <Button variant="outline" size="sm" onClick={removeProbableDuplicates} disabled={!summary.duplicates || parsing || saving}>
              <CopyX className="h-4 w-4" /> Remover duplicados
            </Button>
          </div>
        </div>

        {parsing ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-royal-500" />
            <p className="text-sm">Interpretando seções, cores, preços e garantias...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="min-h-72 px-4 py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-gray-200" />
            <p className="font-semibold text-navy-900">Nenhuma prévia gerada ainda</p>
            <p className="text-sm text-gray-500">Cole a mensagem do fornecedor e interprete a lista para revisar item por item.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item, index) => {
              const isExpanded = Boolean(expanded[index])
              const currentStatus = statusFromParsed(item)
              const isConfirmed = confirmedIndices.has(index)
              const isIgnored = currentStatus === "ignored"
              const isReady = isItemReady(item)
              const itemWarnings = displayWarnings(item)
              return (
                <article
                  key={`${item.duplicateKey || item.sourceLine}-${index}`}
                  className={cn(
                    "p-4 transition-colors",
                    isIgnored && "bg-gray-50 opacity-60",
                    isConfirmed && !isIgnored && "bg-blue-50/30 border-l-2 border-blue-400"
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {confidenceBadge(item.confidence)}
                        <Badge variant={item.parserSource === "ai" ? "blue" : "gray"}>
                          {item.parserSource === "ai" ? "Interpretado por IA" : parserMode === "hybrid" ? "Fallback local" : "Parser local"}
                        </Badge>
                        {visualStatusBadge(item, isConfirmed)}
                        {item.duplicateCandidate ? <Badge variant="yellow">Duplicado provável</Badge> : null}
                      </div>
                      <h4 className="text-base font-bold text-navy-900">{itemTitle(item)}</h4>
                      <p className="mt-1 text-sm text-gray-600">{compactFacts(item)}</p>
                      <p className="mt-1 text-xs text-gray-400">Fornecedor: {selectedSupplierName}</p>
                      {itemWarnings.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {itemWarnings.map((w) => <Badge key={w} variant="yellow">{w}</Badge>)}
                        </div>
                      ) : (
                        <div className="mt-2"><Badge variant="green"><CheckCircle2 className="h-3 w-3" /> Sem alertas</Badge></div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {isConfirmed ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => deconfirmItem(index)}
                          className="gap-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Desfazer confirmação
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmItem(index)}
                          disabled={isIgnored}
                          className={cn(isReady && "border-green-200 text-green-700 hover:bg-green-50")}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Confirmar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded((current) => ({ ...current, [index]: !current[index] }))}
                      >
                        Editar <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => ignoreItem(index)}>
                        <Trash2 className="h-4 w-4" /> Ignorar
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                      {isConfirmed ? (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Editar um item confirmado remove a confirmação. Confirme novamente após os ajustes.
                        </div>
                      ) : null}
                      <div className="mb-3 text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">Linha original:</span> {item.sourceLine}
                        {item.sourceSection ? <span> · Seção: {item.sourceSection}</span> : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Input label="Categoria" value={item.category || ""} onChange={(e) => updateItem(index, "category", e.target.value || null)} />
                        <Input label="Modelo" value={item.model || ""} onChange={(e) => updateItem(index, "model", e.target.value || null)} />
                        {needsStorageField(item) ? (
                          <Input label="Armazenamento" value={item.storage || ""} onChange={(e) => updateItem(index, "storage", e.target.value || null)} placeholder="128GB, 1TB..." />
                        ) : null}
                        {needsSizeField(item) ? (
                          <Input label="Tamanho" value={item.size || ""} onChange={(e) => updateItem(index, "size", e.target.value || null)} placeholder="42mm, 46mm..." />
                        ) : null}
                        <Input label="Cor" value={item.color || ""} onChange={(e) => updateItem(index, "color", e.target.value || null)} />
                        {categoryGroup(item.category) === "watch" ? (
                          <Input label="Conectividade" value={item.variant || ""} onChange={(e) => updateItem(index, "variant", e.target.value || null)} placeholder="GPS + Cellular" />
                        ) : null}
                        <Select label="Condição" value={item.condition} onChange={(e) => updateItem(index, "condition", e.target.value as SupplierOfferCondition)}>
                          {conditionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                        {needsBatteryField(item) ? (
                          <Input
                            label="Bateria"
                            value={numberInputValue(item.batteryHealth)}
                            onChange={(e) => updateItem(index, "batteryHealth", parseOptionalNumber(e.target.value))}
                            placeholder="88"
                          />
                        ) : null}
                        <Select label="Garantia" value={item.warrantyType || "none"} onChange={(e) => {
                          const t = e.target.value as SupplierOfferWarrantyType
                          updateItem(index, "warrantyType", t)
                          updateItem(index, "warrantyLabel", warrantyLabelFromFields(t, warrantyDetailValue(item)))
                        }}>
                          {warrantyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                        {item.warrantyType && item.warrantyType !== "none" ? (
                          <Input
                            label="Detalhe da garantia"
                            value={warrantyDetailValue(item)}
                            onChange={(e) => updateItem(index, "warrantyLabel", warrantyLabelFromFields(item.warrantyType || "unknown", e.target.value))}
                            placeholder="Out/26, 1 ano..."
                          />
                        ) : null}
                        <Input
                          label="Preço fornecedor"
                          value={numberInputValue(item.supplierPrice)}
                          onChange={(e) => updateItem(index, "supplierPrice", parseOptionalNumber(e.target.value))}
                          placeholder="0"
                        />
                        <Select label="Status" value={currentStatus} onChange={(e) => updateItem(index, "status", e.target.value as SupplierOfferStatus)}>
                          {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
