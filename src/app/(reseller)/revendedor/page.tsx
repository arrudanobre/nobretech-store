"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { formatBRL } from "@/lib/helpers"
import { formatPhoneBR } from "@/lib/marketing-format"
import {
  CheckCircle2,
  Clock3,
  Copy,
  FileSpreadsheet,
  Loader2,
  MessageCircle,
  Search,
  ShoppingBag,
  Tag,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

type Offer = {
  offerId: string
  sourceType: "inventory" | "supplier"
  originLabel: string
  productName: string
  storage: string | null
  color: string | null
  grade: string | null
  batteryHealth: number | null
  warrantyMonths: number | null
  iosVersion: string | null
  imageUrl: string | null
  resellerPrice: number
  suggestedSalePrice: number | null
  visibleNotes: string | null
  availableUntil: string | null
  requestStatus: RequestStatus | null
  requestType: RequestType | null
  requestCreatedAt: string | null
  requestUpdatedAt: string | null
  availabilityLabel: string
}

type RequestType = "interest" | "reservation_requested" | "sold_reported"
type RequestStatus = "pending" | "approved" | "rejected" | "completed" | "canceled"
type CatalogFilter = "all" | "inventory" | "supplier" | "with_request" | "without_request"

type ApiEnvelope<T> = {
  data: T | null
  error: { message: string } | null
}

const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  interest: "Cliente interessado",
  reservation_requested: "Reserva solicitada",
  sold_reported: "Venda informada",
}

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Aguardando análise da Nobretech",
  approved: "Aprovada pela Nobretech",
  rejected: "Recusada pela Nobretech",
  completed: "Concluída",
  canceled: "Cancelada",
}

const FILTERS: { key: CatalogFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "inventory", label: "Estoque Nobretech" },
  { key: "supplier", label: "Produto com fornecedor" },
  { key: "with_request", label: "Com solicitação" },
  { key: "without_request", label: "Sem solicitação" },
]

function apiErrorMessage(status: number): string {
  if (status === 401) return "Sua sessão expirou. Entre novamente para acessar o portal."
  if (status === 403) return "Seu acesso ao portal de revendedor não está autorizado."
  return "Não foi possível carregar os dados do portal. Tente novamente em instantes."
}

async function readApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const contentType = response.headers.get("content-type") || ""
  const fallbackMessage = apiErrorMessage(response.status)

  if (!contentType.includes("application/json")) {
    return { data: null, error: { message: fallbackMessage } }
  }

  try {
    const payload = (await response.json()) as ApiEnvelope<T>
    const technicalMessage = payload.error?.message?.toLowerCase()

    if (!response.ok && (technicalMessage === "forbidden" || technicalMessage === "unauthorized")) {
      return { data: null, error: { message: fallbackMessage } }
    }

    return payload
  } catch {
    return { data: null, error: { message: fallbackMessage } }
  }
}

function requestSummary(o: Pick<Offer, "requestType" | "requestStatus">): string | null {
  if (!o.requestType || !o.requestStatus) return null

  if (o.requestType === "reservation_requested" && o.requestStatus === "rejected") {
    return "Reserva recusada pela Nobretech"
  }
  if (o.requestType === "reservation_requested" && o.requestStatus === "canceled") {
    return "Reserva cancelada"
  }
  if (o.requestType === "sold_reported" && o.requestStatus === "pending") {
    return "Venda informada · Aguardando confirmação"
  }
  if (o.requestStatus === "completed") return "Solicitação concluída"

  return `${REQUEST_TYPE_LABEL[o.requestType]} · ${REQUEST_STATUS_LABEL[o.requestStatus]}`
}

function requestTone(status: RequestStatus | null): string {
  if (status === "pending") return "border-amber-500/20 bg-amber-500/10 text-amber-300"
  if (status === "approved" || status === "completed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  if (status === "rejected" || status === "canceled") return "border-red-500/20 bg-red-500/10 text-red-300"
  return "border-white/10 bg-white/[0.04] text-slate-300"
}

function requestIcon(status: RequestStatus | null) {
  if (status === "approved" || status === "completed") return CheckCircle2
  if (status === "rejected" || status === "canceled") return XCircle
  return Clock3
}

function searchableText(o: Offer): string {
  return [
    o.productName,
    o.storage,
    o.color,
    o.grade,
    o.originLabel,
    o.availabilityLabel,
    o.batteryHealth == null ? null : String(o.batteryHealth),
    o.visibleNotes,
    requestSummary(o),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function matchesFilter(o: Offer, filter: CatalogFilter): boolean {
  if (filter === "inventory") return o.sourceType === "inventory"
  if (filter === "supplier") return o.sourceType === "supplier"
  if (filter === "with_request") return Boolean(o.requestStatus)
  if (filter === "without_request") return !o.requestStatus
  return true
}

function matchesSearch(o: Offer, q: string): boolean {
  const tokens = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return true

  const haystack = searchableText(o)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  return tokens.every((token) => haystack.includes(token))
}

function normalizeCommercialText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function commercialConditionLabel(value: string | null): "Lacrado" | "Seminovo" | null {
  if (!value) return null
  const normalized = normalizeCommercialText(value)
  if (!normalized) return null
  return normalized.includes("lacrado") || normalized === "sealed" ? "Lacrado" : "Seminovo"
}

function shouldShowVisibleNoteInWhatsApp(note: string | null, condition: string | null): boolean {
  if (!note) return false
  if (condition !== "Lacrado") return true

  const normalized = normalizeCommercialText(note).replace(/\s+/g, "")
  return normalized !== "lacrado" && normalized !== "estadolacrado"
}

function buildAdCopy(o: Offer): string {
  const lines: string[] = []
  const condition = commercialConditionLabel(o.grade)

  lines.push(`*${o.productName} disponível*`)
  lines.push("")
  if (condition) lines.push(`• Estado: ${condition}`)
  if (o.batteryHealth) lines.push(`• Bateria: ${o.batteryHealth}%`)
  if (o.sourceType === "supplier") {
    lines.push("• Produto com fornecedor")
    lines.push("• Disponibilidade sob confirmação")
  } else {
    lines.push("• Disponível com a Nobretech")
  }
  if (shouldShowVisibleNoteInWhatsApp(o.visibleNotes, condition)) lines.push(`• ${o.visibleNotes}`)
  lines.push("")
  lines.push(o.suggestedSalePrice ? `*Valor: ${formatBRL(o.suggestedSalePrice)}*` : "*Valor: Consulte condições*")
  lines.push("")
  lines.push("Produto sujeito à disponibilidade.")
  lines.push("Me chama para confirmar disponibilidade e condições.")

  return lines.join("\n")
}

function buildBulkWhatsAppCopy(offers: Offer[]): string {
  const lines = ["*Catálogo Nobretech disponível*", ""]

  offers.forEach((o, index) => {
    const condition = commercialConditionLabel(o.grade)
    lines.push(`${index + 1}. *${o.productName}*`)
    if (condition) lines.push(`• Estado: ${condition}`)
    if (o.batteryHealth) lines.push(`• Bateria: ${o.batteryHealth}%`)
    if (o.sourceType === "supplier") {
      lines.push("• Produto com fornecedor")
      lines.push("• Disponibilidade sob confirmação")
    } else {
      lines.push("• Disponível com a Nobretech")
    }
    if (shouldShowVisibleNoteInWhatsApp(o.visibleNotes, condition)) lines.push(`• ${o.visibleNotes}`)
    lines.push(o.suggestedSalePrice ? `*Valor: ${formatBRL(o.suggestedSalePrice)}*` : "*Valor: Consulte condições*")
    lines.push("")
  })

  lines.push("Produtos sujeitos à disponibilidade.")
  lines.push("Me chama para confirmar condições.")
  return lines.join("\n")
}

function todayFileDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function compactDate(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("pt-BR")
}

export default function RevendedorPage() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<CatalogFilter>("all")
  const [action, setAction] = useState<{ offer: Offer; type: RequestType } | null>(null)
  const [formCustomer, setFormCustomer] = useState({ name: "", phone: "", notes: "" })
  const [manualCopy, setManualCopy] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadOffers = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/reseller-portal/offers", { signal })
      const json = await readApiEnvelope<Offer[]>(response)

      if (json.error) {
        setErrorMessage(json.error.message)
        toast.error(json.error.message)
        return
      }

      setErrorMessage(null)
      setOffers(json.data || [])
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      const message = "Não foi possível carregar os produtos de revenda."
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    loadOffers(controller.signal)
    return () => controller.abort()
  }, [loadOffers, refreshKey])

  const filteredOffers = useMemo(() => {
    return offers.filter((offer) => matchesFilter(offer, filter) && matchesSearch(offer, search))
  }, [filter, offers, search])

  async function copyText(text: string, successMessage: string) {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          toast.success(successMessage)
          return
        } catch {
          // Some embedded browsers block clipboard access; fallback below.
        }
      }

      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.setAttribute("readonly", "")
      textarea.style.position = "fixed"
      textarea.style.left = "-9999px"
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand("copy")
      document.body.removeChild(textarea)
      if (!copied) throw new Error("copy_failed")
      toast.success(successMessage)
    } catch {
      setManualCopy(text)
      toast.success("Texto pronto para copiar")
    }
  }

  async function copyAd(o: Offer) {
    await copyText(buildAdCopy(o), "Anúncio copiado")
  }

  async function copyVisibleOffers() {
    if (!filteredOffers.length) {
      toast.error("Nenhuma oferta visível para copiar.")
      return
    }
    await copyText(buildBulkWhatsAppCopy(filteredOffers), "Ofertas visíveis copiadas para WhatsApp")
  }

  async function exportExcel() {
    if (!filteredOffers.length) {
      toast.error("Nenhuma oferta visível para exportar.")
      return
    }

    setExporting(true)
    try {
      const ExcelJS = await import("exceljs")
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet("Catálogo")

      sheet.columns = [
        { header: "Produto", key: "productName", width: 34 },
        { header: "Origem", key: "origin", width: 22 },
        { header: "Disponibilidade", key: "availability", width: 28 },
        { header: "Cor", key: "color", width: 18 },
        { header: "Capacidade", key: "storage", width: 16 },
        { header: "Estado", key: "grade", width: 16 },
        { header: "Bateria", key: "battery", width: 12 },
        { header: "Preço de repasse", key: "resellerPrice", width: 18 },
        { header: "Preço sugerido", key: "suggestedPrice", width: 18 },
        { header: "Observação", key: "notes", width: 36 },
        { header: "Status da solicitação", key: "request", width: 34 },
        { header: "Última solicitação", key: "requestDate", width: 18 },
      ]

      filteredOffers.forEach((offer) => {
        sheet.addRow({
          productName: offer.productName,
          origin: offer.originLabel,
          availability: offer.availabilityLabel,
          color: offer.color || "",
          storage: offer.storage || "",
          grade: offer.grade || "",
          battery: offer.batteryHealth ? `${offer.batteryHealth}%` : "",
          resellerPrice: formatBRL(offer.resellerPrice),
          suggestedPrice: offer.suggestedSalePrice ? formatBRL(offer.suggestedSalePrice) : "",
          notes: offer.visibleNotes || "",
          request: requestSummary(offer) || "",
          requestDate: compactDate(offer.requestUpdatedAt || offer.requestCreatedAt),
        })
      })

      sheet.getRow(1).font = { bold: true }
      sheet.views = [{ state: "frozen", ySplit: 1 }]

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `catalogo-revendedor-nobretech-${todayFileDate()}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success("Excel exportado com dados sanitizados")
    } catch {
      toast.error("Não foi possível exportar o Excel.")
    } finally {
      setExporting(false)
    }
  }

  async function submitRequest() {
    if (!action) return

    if (action.offer.requestStatus === "pending" && action.offer.requestType === action.type) {
      toast.error(
        "Você já tem uma solicitação deste tipo pendente para este produto. Aguarde a resposta da Nobretech."
      )
      return
    }

    setSending(true)
    const res = await fetch("/api/reseller-portal/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: action.offer.offerId,
        type: action.type,
        customerName: formCustomer.name || null,
        customerPhone: formCustomer.phone || null,
        notes: formCustomer.notes || null,
      }),
    })
    const json = await readApiEnvelope<{ id: string }>(res)
    setSending(false)
    if (json.error) return toast.error(json.error.message)
    toast.success("Solicitação enviada à Nobretech")
    setAction(null)
    setFormCustomer({ name: "", phone: "", notes: "" })
    setRefreshKey((k) => k + 1)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (offers.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-20 text-center">
        <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-slate-600" />
        <p className="text-sm text-slate-400">
          {errorMessage || "Nenhum produto liberado para revenda no momento."}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Produtos para revenda</h1>
          <p className="text-sm text-slate-400">Vitrine privada. Valores exclusivos para você.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyVisibleOffers}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.08]"
          >
            <Copy className="h-4 w-4" /> Copiar ofertas para WhatsApp
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-royal-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-royal-600 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por modelo, cor, capacidade, origem, status ou observação"
            className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-royal-500/50 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === item.key
                  ? "bg-white text-slate-950"
                  : "border border-white/10 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {filteredOffers.length} de {offers.length} produtos
          </span>
        </div>
      </div>

      {filteredOffers.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center text-slate-500">
          <p className="text-sm">Nenhum produto encontrado para os filtros atuais.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredOffers.map((offer) => {
          const statusText = requestSummary(offer)
          const StatusIcon = requestIcon(offer.requestStatus)

          return (
            <article
              key={offer.offerId}
              className="flex min-h-[270px] flex-col rounded-2xl border border-white/5 bg-white/[0.035] p-3 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    offer.sourceType === "supplier"
                      ? "border border-blue-500/20 bg-blue-500/15 text-blue-300"
                      : "border border-emerald-500/20 bg-emerald-500/15 text-emerald-300"
                  }`}
                >
                  {offer.originLabel}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                  {offer.availabilityLabel}
                </span>
              </div>

              <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white">
                {offer.productName}
              </h2>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                {offer.storage && <span>{offer.storage}</span>}
                {offer.color && <span>{offer.color}</span>}
                {offer.grade && <span>{offer.grade}</span>}
                {offer.batteryHealth ? <span>Bat. {offer.batteryHealth}%</span> : null}
              </div>

              {offer.sourceType === "supplier" && (
                <p className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
                  Confirme com a Nobretech antes de fechar com o cliente.
                </p>
              )}

              {statusText && (
                <div className={`mt-2 inline-flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${requestTone(offer.requestStatus)}`}>
                  <StatusIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{statusText}</span>
                </div>
              )}

              {offer.visibleNotes && (
                <p className="mt-2 line-clamp-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-[11px] text-slate-300">
                  {offer.visibleNotes}
                </p>
              )}

              <div className="mt-auto pt-3">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-2">
                  <div>
                    <p className="text-[10px] text-slate-500">Repasse</p>
                    <p className="text-sm font-bold text-white">{formatBRL(offer.resellerPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Sugerido</p>
                    <p className="text-sm font-semibold text-slate-200">
                      {offer.suggestedSalePrice ? formatBRL(offer.suggestedSalePrice) : "Consultar"}
                    </p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => copyAd(offer)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-royal-500 px-2 py-2 text-xs font-semibold text-white transition hover:bg-royal-600"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                  <button
                    onClick={() => setAction({ offer, type: "reservation_requested" })}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.08]"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" /> Reserva
                  </button>
                  <button
                    onClick={() => setAction({ offer, type: "interest" })}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/5"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Interesse
                  </button>
                  <button
                    onClick={() => setAction({ offer, type: "sold_reported" })}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/5"
                  >
                    <Tag className="h-3.5 w-3.5" /> Venda
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {action && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12151C] p-5">
            <h3 className="text-sm font-semibold text-white">
              {action.type === "interest"
                ? "Tenho cliente interessado"
                : action.type === "reservation_requested"
                  ? "Solicitar reserva"
                  : "Informar venda para validação"}
            </h3>
            <p className="mb-4 mt-1 text-xs text-slate-400">{action.offer.productName}</p>

            <div className="space-y-2">
              <input
                value={formCustomer.name}
                onChange={(e) => setFormCustomer({ ...formCustomer, name: e.target.value })}
                placeholder="Nome do cliente (opcional)"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-royal-500/50 focus:outline-none"
              />
              <input
                type="tel"
                inputMode="tel"
                value={formCustomer.phone}
                onChange={(e) =>
                  setFormCustomer({ ...formCustomer, phone: formatPhoneBR(e.target.value) })
                }
                placeholder="(98) 98168-0080 (opcional)"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-royal-500/50 focus:outline-none"
              />
              <textarea
                value={formCustomer.notes}
                onChange={(e) => setFormCustomer({ ...formCustomer, notes: e.target.value })}
                placeholder="Observações (opcional)"
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-royal-500/50 focus:outline-none"
              />
            </div>

            {action.type === "sold_reported" && (
              <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
                Isto não registra uma venda. A Nobretech confirma a operação no fluxo oficial.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setAction(null)
                  setFormCustomer({ name: "", phone: "", notes: "" })
                }}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={submitRequest}
                disabled={sending}
                className="flex-1 rounded-xl bg-royal-500 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-600 disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {manualCopy && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12151C] p-5">
            <h3 className="text-sm font-semibold text-white">Texto pronto</h3>
            <p className="mb-3 mt-1 text-xs text-slate-400">
              Selecione o texto abaixo para copiar manualmente.
            </p>
            <textarea
              value={manualCopy}
              readOnly
              rows={12}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => setManualCopy(null)}
              className="mt-4 w-full rounded-xl bg-royal-500 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-600"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
