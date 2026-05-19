"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatBRL, formatDate } from "@/lib/helpers"
import { formatPhoneBR } from "@/lib/marketing-format"
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  Package,
  PackagePlus,
  Search,
  Store,
  Trash2,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

type Reseller = {
  id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  email: string
  status: string
}

type Eligible = {
  sourceType: "inventory" | "supplier"
  sourceId: string
  productName: string
  nameIncomplete?: boolean
  storage: string | null
  color: string | null
  grade: string | null
  condition: string | null
  batteryHealth: number | null
  warrantyMonths: number | null
  identifier: string | null
  originLabel: string
  supplierName: string | null
  supplierReferencePrice: number | null
  suggestedPrice: number | null
  availabilityLabel: string
  status: string | null
  imageUrl: string | null
  alreadyOffered: boolean
  offerActive: boolean | null
}

type Offer = {
  id: string
  sourceType: "inventory" | "supplier"
  productName: string
  imei: string | null
  storage: string | null
  color: string | null
  grade: string | null
  isActive: boolean
  resellerPrice: number
  suggestedSalePrice: number | null
  visibleNotes: string | null
  internalNotes: string | null
  availableUntil: string | null
  stillAvailable: boolean
  originLabel: string
  supplierName: string | null
  supplierReferencePrice: number | null
  availabilityLabel: string
}

type ResellerRequest = {
  id: string
  type: string
  status: string
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  productName: string
  imei: string | null
  sourceType: "inventory" | "supplier"
  originLabel: string
  createdAt: string
}

// ─── Labels & Badges ──────────────────────────────────────────────────────────

const REQUEST_TYPE_LABEL: Record<string, string> = {
  interest: "Cliente interessado",
  reservation_requested: "Reserva solicitada",
  sold_reported: "Venda informada",
  canceled: "Cancelada",
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  completed: "Concluída",
  canceled: "Cancelada",
}

const REQUEST_STATUS_VARIANT: Record<string, "yellow" | "green" | "red" | "blue" | "gray"> = {
  pending: "yellow",
  approved: "green",
  rejected: "red",
  completed: "blue",
  canceled: "gray",
}

const REQUEST_STATUSES = ["pending", "approved", "rejected", "completed", "canceled"] as const

// ─── Money parser ─────────────────────────────────────────────────────────────

// Accepts "2.250,00", "2250,5", "2250" or "2250.00".
function parseMoney(input: string): number | null {
  const cleaned = input.trim()
  if (!cleaned) return null
  const normalized = cleaned.replace(/\./g, "").replace(",", ".")
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function moneyInputValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ""
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManageResellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  // Core data
  const [reseller, setReseller] = useState<Reseller | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [requests, setRequests] = useState<ResellerRequest[]>([])
  const [loading, setLoading] = useState(true)

  // Source tab (for "Liberar produto" section)
  const [sourceTab, setSourceTab] = useState<"all" | "inventory" | "supplier">("all")

  // Inventory eligible products
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [eligible, setEligible] = useState<Eligible[]>([])
  const [inventoryLoaded, setInventoryLoaded] = useState(false)

  // Offer creation form
  const [picked, setPicked] = useState<Eligible | null>(null)
  const [offerForm, setOfferForm] = useState({
    resellerPrice: "",
    suggestedSalePrice: "",
    visibleNotes: "",
    internalNotes: "",
    availableUntil: "",
  })
  const [savingOffer, setSavingOffer] = useState(false)

  // Inline edit for existing offers
  const [editOfferId, setEditOfferId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    resellerPrice: "",
    suggestedSalePrice: "",
    visibleNotes: "",
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // Computed stats
  const activeOffers = offers.filter((o) => o.isActive && o.stillAvailable).length
  const pendingRequests = requests.filter((r) => r.status === "pending").length

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const [r, o, q] = await Promise.all([
      fetch(`/api/resellers/${id}`).then((x) => x.json()),
      fetch(`/api/resellers/${id}/offers`).then((x) => x.json()),
      fetch(`/api/resellers/${id}/requests`).then((x) => x.json()),
    ])
    if (r.error) toast.error(r.error.message)
    else setReseller(r.data)
    setOffers(o.data || [])
    setRequests(q.data || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetch(`/api/resellers/${id}`).then((x) => x.json()),
      fetch(`/api/resellers/${id}/offers`).then((x) => x.json()),
      fetch(`/api/resellers/${id}/requests`).then((x) => x.json()),
    ])
      .then(([r, o, q]) => {
        if (!mounted) return
        if (r.error) toast.error(r.error.message)
        else setReseller(r.data)
        setOffers(o.data || [])
        setRequests(q.data || [])
        setLoading(false)
      })
      .catch(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [id])

  const fetchEligible = useCallback(
    async (searchTerm: string, sourceFilter: "all" | "inventory" | "supplier" = sourceTab) => {
      setSearching(true)
      try {
        const res = await fetch(
          `/api/resellers/${id}/eligible-products?source=${sourceFilter}&search=${encodeURIComponent(searchTerm)}`
        )
        const json = await res.json()
        if (json.error) toast.error(json.error.message)
        else setEligible(json.data || [])
        setInventoryLoaded(true)
      } finally {
        setSearching(false)
      }
    },
    [id, sourceTab]
  )

  // Auto-load eligible products on mount and when the source tab changes.
  useEffect(() => {
    fetchEligible(search, sourceTab)
  }, [fetchEligible, search, sourceTab])

  const searchEligible = useCallback(() => {
    fetchEligible(search, sourceTab)
  }, [fetchEligible, search, sourceTab])

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function toggleResellerStatus() {
    if (!reseller) return
    const next = reseller.status === "active" ? "inactive" : "active"
    const res = await fetch(`/api/resellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    const json = await res.json()
    if (json.error) return toast.error(json.error.message)
    toast.success(next === "active" ? "Revendedor reativado" : "Revendedor inativado")
    loadAll()
  }

  async function createOffer(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) return
    const price = parseMoney(offerForm.resellerPrice)
    if (price === null) return toast.error("Informe o preço de repasse em reais")
    if (
      picked.sourceType === "supplier" &&
      picked.supplierReferencePrice != null &&
      price < picked.supplierReferencePrice
    ) {
      return toast.error("O repasse não pode ser menor que o preço de fornecedor")
    }
    const suggested = offerForm.suggestedSalePrice ? parseMoney(offerForm.suggestedSalePrice) : null
    if (offerForm.suggestedSalePrice && suggested === null)
      return toast.error("Preço sugerido inválido")
    if (suggested !== null && suggested < price)
      return toast.error("O preço sugerido deve ser maior ou igual ao preço de repasse")

    setSavingOffer(true)
    const res = await fetch(`/api/resellers/${id}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: picked.sourceType,
        sourceId: picked.sourceId,
        resellerPrice: price,
        suggestedSalePrice: suggested,
        visibleNotes: offerForm.visibleNotes || null,
        internalNotes: offerForm.internalNotes || null,
        availableUntil: offerForm.availableUntil || null,
      }),
    })
    const json = await res.json()
    setSavingOffer(false)
    if (json.error) return toast.error(json.error.message)
    toast.success("Produto liberado para o revendedor")
    setPicked(null)
    setOfferForm({
      resellerPrice: "",
      suggestedSalePrice: "",
      visibleNotes: "",
      internalNotes: "",
      availableUntil: "",
    })
    setInventoryLoaded(false)
    fetchEligible(search, sourceTab)
    loadAll()
  }

  async function patchOffer(offerId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/resellers/${id}/offers/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.error) return toast.error(json.error.message)
    toast.success("Oferta atualizada")
    loadAll()
  }

  async function saveEditOffer(e: React.FormEvent) {
    e.preventDefault()
    if (!editOfferId) return
    const rp = parseMoney(editForm.resellerPrice)
    if (rp === null) return toast.error("Informe o preço de repasse em reais")
    const sp = editForm.suggestedSalePrice ? parseMoney(editForm.suggestedSalePrice) : null
    if (editForm.suggestedSalePrice && sp === null) return toast.error("Preço sugerido inválido")
    if (sp !== null && sp < rp)
      return toast.error("O preço sugerido deve ser maior ou igual ao preço de repasse")
    setSavingEdit(true)
    const res = await fetch(`/api/resellers/${id}/offers/${editOfferId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resellerPrice: rp,
        suggestedSalePrice: sp,
        visibleNotes: editForm.visibleNotes || null,
      }),
    })
    const json = await res.json()
    setSavingEdit(false)
    if (json.error) return toast.error(json.error.message)
    toast.success("Oferta atualizada")
    setEditOfferId(null)
    loadAll()
  }

  async function deleteOffer(offerId: string) {
    if (!confirm("Remover esta oferta do revendedor? O estoque não é afetado.")) return
    const res = await fetch(`/api/resellers/${id}/offers/${offerId}`, { method: "DELETE" })
    const json = await res.json()
    if (json.error) return toast.error(json.error.message)
    toast.success("Oferta removida")
    loadAll()
  }

  async function updateRequestStatus(requestId: string, status: string) {
    const res = await fetch(`/api/resellers/${id}/requests`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, status }),
    })
    const json = await res.json()
    if (json.error) return toast.error(json.error.message)
    toast.success("Solicitação atualizada")
    loadAll()
  }

  // ─── Loading / Not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!reseller) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-slate-500">
        Revendedor não encontrado.
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/revendedores"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Header card */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{reseller.name}</h1>
            <Badge variant={reseller.status === "active" ? "green" : "gray"}>
              {reseller.status === "active" ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {reseller.email}
            {reseller.phone ? ` · ${formatPhoneBR(reseller.phone)}` : ""}
            {[reseller.city, reseller.state].filter(Boolean).length
              ? ` · ${[reseller.city, reseller.state].filter(Boolean).join("/")}`
              : ""}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Área administrativa. O revendedor acessa apenas a vitrine externa em /revendedor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#liberar-produto"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-royal-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-royal-600 active:scale-[0.97]"
          >
            <PackagePlus className="h-4 w-4" /> Liberar produto
          </a>
          <Button
            variant={reseller.status === "active" ? "secondary" : "primary"}
            onClick={toggleResellerStatus}
          >
            {reseller.status === "active" ? "Inativar revendedor" : "Reativar revendedor"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Ofertas ativas
          </p>
          <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            {activeOffers}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Produtos liberados
          </p>
          <div className="mt-2 text-2xl font-bold text-slate-900">{offers.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Solicitações pendentes
          </p>
          <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Clock3 className="h-5 w-5 text-amber-500" />
            {pendingRequests}
          </div>
        </div>
      </div>

      {/* Cost isolation banner */}
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        O <strong>preço de custo continua interno</strong> e nunca aparece para o revendedor. O{" "}
        <strong>preço de repasse</strong> é o que o revendedor paga à Nobretech. O{" "}
        <strong>preço sugerido</strong> é referência para o cliente final. Liberar um produto não
        significa vendê-lo — a venda oficial continua no fluxo normal.
      </div>

      {/* ── Liberar produto ───────────────────────────────────────────────────── */}
      <section
        id="liberar-produto"
        className="mb-8 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <PackagePlus className="h-5 w-5 text-royal-500" /> Liberar produto para revenda
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Selecione um item disponível, defina o preço de repasse e a referência para o cliente final.
          </p>
        </div>

        <div className="mb-4 grid gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-3">
          {[
            { key: "all", label: "Todos", icon: Package },
            { key: "inventory", label: "Estoque Nobretech", icon: Store },
            { key: "supplier", label: "Catálogo parceiro", icon: Truck },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setPicked(null)
                  setSourceTab(tab.key as "all" | "inventory" | "supplier")
                }}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                  sourceTab === tab.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" /> {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchEligible())}
            placeholder="Buscar por modelo, capacidade, cor, IMEI, serial ou fornecedor"
          />
          <Button type="button" variant="secondary" onClick={searchEligible} isLoading={searching}>
            <Search className="h-4 w-4" /> Buscar
          </Button>
        </div>

        {searching && (
          <div className="mt-3 flex items-center gap-2 py-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando produtos...
          </div>
        )}

        {!picked && !searching && inventoryLoaded && eligible.length === 0 && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Nenhum produto disponível encontrado para esta origem. Itens indisponíveis não aparecem
            para liberação.
          </p>
        )}

        {!picked && eligible.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {eligible.map((it) => (
              <button
                key={`${it.sourceType}:${it.sourceId}`}
                type="button"
                disabled={it.alreadyOffered}
                onClick={() => {
                  setPicked(it)
                  setOfferForm((f) => ({
                    ...f,
                    resellerPrice:
                      it.sourceType === "supplier" && it.supplierReferencePrice != null
                        ? moneyInputValue(it.supplierReferencePrice)
                        : "",
                    suggestedSalePrice: moneyInputValue(it.suggestedPrice),
                  }))
                }}
                className="flex items-start justify-between rounded-lg border border-slate-200 p-3 text-left text-sm transition hover:border-royal-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        it.sourceType === "supplier"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-royal-50 text-royal-600"
                      }`}
                    >
                      {it.originLabel}
                    </span>
                    <span className="text-[10px] text-slate-500">{it.availabilityLabel}</span>
                  </div>
                  <div className="mt-1 font-medium text-slate-900">{it.productName}</div>
                  {it.nameIncomplete && (
                    <div className="mt-1">
                      <Badge variant="yellow">Cadastro incompleto</Badge>
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    {[
                      it.storage,
                      it.color,
                      it.grade || it.condition,
                      it.batteryHealth ? `Bateria ${it.batteryHealth}%` : null,
                      it.identifier ? `ID: ${it.identifier}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {it.sourceType === "supplier" && (
                    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                      {it.supplierName && <p>Fornecedor: {it.supplierName}</p>}
                      {it.supplierReferencePrice != null && (
                        <p>Referência fornecedor: {formatBRL(it.supplierReferencePrice)}</p>
                      )}
                      <p className="text-amber-700">O revendedor não verá o custo do fornecedor.</p>
                    </div>
                  )}
                </div>
                <div className="ml-2 shrink-0">
                  {it.alreadyOffered ? (
                    <Badge variant="gray">Já liberado</Badge>
                  ) : (
                    <span className="text-xs font-medium text-royal-500">Liberar para revenda</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {picked && (
          (() => {
            const repasse = parseMoney(offerForm.resellerPrice)
            const supplierPrice = picked.sourceType === "supplier" ? picked.supplierReferencePrice : null
            const supplierGain = supplierPrice != null && repasse != null ? repasse - supplierPrice : null
            const supplierGainNegative = supplierGain != null && supplierGain < 0

            return (
          <form
            onSubmit={createOffer}
            className="mt-4 grid gap-3 rounded-lg border border-royal-100 bg-royal-50/30 p-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2 flex items-start justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500">Produto selecionado</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant={picked.sourceType === "supplier" ? "blue" : "green"}>
                    {picked.originLabel}
                  </Badge>
                  <p className="font-medium text-slate-800">{picked.productName}</p>
                </div>
                {picked.sourceType === "supplier" && (
                  <p className="mt-1 text-xs text-slate-500">
                    {picked.supplierName ? `Fornecedor: ${picked.supplierName}. ` : ""}
                    Disponibilidade sujeita à confirmação antes da venda oficial.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-slate-400 underline hover:text-slate-600"
                onClick={() => setPicked(null)}
              >
                trocar
              </button>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Preço de repasse (R$) *
              </label>
              <Input
                value={offerForm.resellerPrice}
                onChange={(e) => setOfferForm({ ...offerForm, resellerPrice: e.target.value })}
                placeholder="2.650,00"
                required
              />
              <p className="mt-0.5 text-[10px] text-slate-400">
                Valor que o revendedor paga à Nobretech. Nunca expõe custo interno.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Preço sugerido (R$)
              </label>
              <Input
                value={offerForm.suggestedSalePrice}
                onChange={(e) =>
                  setOfferForm({ ...offerForm, suggestedSalePrice: e.target.value })
                }
                placeholder="2.999,00"
              />
              <p className="mt-0.5 text-[10px] text-slate-400">
                Referência ao cliente final. Deve ser maior ou igual ao repasse.
              </p>
            </div>
            {picked.sourceType === "supplier" && (
              <div
                className={`sm:col-span-2 rounded-lg border p-3 ${
                  supplierGainNegative
                    ? "border-red-200 bg-red-50 text-red-900"
                    : supplierGain === 0
                      ? "border-slate-200 bg-white text-slate-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Resumo da operação</p>
                  {supplierGainNegative && (
                    <Badge variant="red">Repasse abaixo do fornecedor</Badge>
                  )}
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-slate-500">Preço fornecedor</p>
                    <p className="font-bold">
                      {supplierPrice != null ? formatBRL(supplierPrice) : "Não informado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Repasse ao revendedor</p>
                    <p className="font-bold">{repasse != null ? formatBRL(repasse) : "Informe o repasse"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Ganho Nobretech</p>
                    <p className="font-bold">
                      {supplierGain != null ? formatBRL(supplierGain) : "Aguardando repasse"}
                    </p>
                  </div>
                </div>
                <p className={`mt-2 text-[11px] ${supplierGainNegative ? "text-red-700" : "text-slate-500"}`}>
                  {supplierGainNegative
                    ? "A oferta não pode ser salva com repasse menor que o preço de fornecedor."
                    : "Informativo interno do admin. O revendedor nunca vê fornecedor, custo ou ganho da Nobretech."}
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Disponível até</label>
              <Input
                type="date"
                value={offerForm.availableUntil}
                onChange={(e) => setOfferForm({ ...offerForm, availableUntil: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Observação visível ao revendedor
              </label>
              <Input
                value={offerForm.visibleNotes}
                onChange={(e) => setOfferForm({ ...offerForm, visibleNotes: e.target.value })}
                placeholder={
                  picked.sourceType === "supplier"
                    ? "Ex: disponibilidade sob confirmação da Nobretech"
                    : "Ex: aparelho revisado e pronto para oferta"
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Observação interna (somente administrador)
              </label>
              <Textarea
                value={offerForm.internalNotes}
                onChange={(e) => setOfferForm({ ...offerForm, internalNotes: e.target.value })}
                rows={2}
                placeholder="Nunca aparece para o revendedor"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={savingOffer} disabled={supplierGainNegative} fullWidth>
                Salvar oferta para o revendedor
              </Button>
            </div>
          </form>
            )
          })()
        )}
      </section>

      {/* ── Produtos liberados ────────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Produtos liberados ({offers.length})
          </h2>
          <a
            href="#liberar-produto"
            className="text-xs font-semibold text-royal-600 hover:text-royal-700"
          >
            + Liberar outro produto
          </a>
        </div>

        {offers.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nenhum produto liberado ainda.</p>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <div key={o.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant={o.sourceType === "supplier" ? "blue" : "green"}>
                        {o.originLabel}
                      </Badge>
                      <span className="text-xs text-slate-500">{o.availabilityLabel}</span>
                    </div>
                    <div className="font-medium text-slate-900">{o.productName}</div>
                    <div className="text-xs text-slate-400">
                      {[o.storage, o.color, o.grade, o.imei].filter(Boolean).join(" · ")}
                    </div>
                    {o.sourceType === "supplier" && (
                      <div className="mt-1 text-xs text-slate-500">
                        {o.supplierName && <span>Fornecedor: {o.supplierName}</span>}
                        {o.supplierReferencePrice != null && (
                          <span className="ml-2">
                            Referência fornecedor: {formatBRL(o.supplierReferencePrice)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!o.stillAvailable && (
                      <Badge variant="red">
                        {o.sourceType === "supplier" ? "Indisponível no fornecedor" : "Saiu do estoque"}
                      </Badge>
                    )}
                    <Badge variant={o.isActive ? "green" : "gray"}>
                      {o.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-slate-500">Preço de repasse</span>
                    <div className="font-semibold text-slate-900">{formatBRL(o.resellerPrice)}</div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Preço sugerido</span>
                    <div className="text-slate-700">
                      {o.suggestedSalePrice ? formatBRL(o.suggestedSalePrice) : "—"}
                    </div>
                  </div>
                </div>
                {(o.visibleNotes || o.internalNotes) && (
                  <div className="mt-2 space-y-1 text-xs">
                    {o.visibleNotes && <p className="text-slate-500">Visível: {o.visibleNotes}</p>}
                    {o.internalNotes && (
                      <p className="text-amber-700">Interna: {o.internalNotes}</p>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => patchOffer(o.id, { isActive: !o.isActive })}
                  >
                    {o.isActive ? "Inativar oferta" : "Ativar oferta"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditOfferId(o.id)
                      setEditForm({
                        resellerPrice: String(o.resellerPrice),
                        suggestedSalePrice: o.suggestedSalePrice ? String(o.suggestedSalePrice) : "",
                        visibleNotes: o.visibleNotes || "",
                      })
                    }}
                  >
                    Editar oferta
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteOffer(o.id)}>
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                </div>

                {editOfferId === o.id && (
                  <form
                    onSubmit={saveEditOffer}
                    className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
                  >
                    <div className="sm:col-span-2 text-xs font-semibold text-slate-700">
                      Editar oferta
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Preço de repasse (R$) *
                      </label>
                      <Input
                        value={editForm.resellerPrice}
                        onChange={(e) =>
                          setEditForm({ ...editForm, resellerPrice: e.target.value })
                        }
                        placeholder="2.250,00"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Preço sugerido (R$)
                      </label>
                      <Input
                        value={editForm.suggestedSalePrice}
                        onChange={(e) =>
                          setEditForm({ ...editForm, suggestedSalePrice: e.target.value })
                        }
                        placeholder="2.599,00"
                      />
                      <p className="mt-0.5 text-[10px] text-slate-400">Deve ser ≥ preço de repasse</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Observação visível ao revendedor
                      </label>
                      <Input
                        value={editForm.visibleNotes}
                        onChange={(e) =>
                          setEditForm({ ...editForm, visibleNotes: e.target.value })
                        }
                        placeholder="Aparece na vitrine do revendedor"
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button type="submit" size="sm" isLoading={savingEdit}>
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditOfferId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Solicitações ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Solicitações do revendedor ({requests.length})
        </h2>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
            <Package className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhuma solicitação recebida.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((q) => (
              <div key={q.id} className="rounded-lg border border-slate-200 p-4 text-sm">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{q.productName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <Badge variant={q.sourceType === "supplier" ? "blue" : "green"}>
                        {q.originLabel}
                      </Badge>
                      <span className="text-xs font-medium text-slate-600">
                        {REQUEST_TYPE_LABEL[q.type] ?? q.type}
                      </span>
                      <span className="text-xs text-slate-400">{formatDate(q.createdAt)}</span>
                    </div>
                  </div>
                  <Badge variant={REQUEST_STATUS_VARIANT[q.status] ?? "gray"}>
                    {REQUEST_STATUS_LABEL[q.status] ?? q.status}
                  </Badge>
                </div>

                {/* Customer info */}
                {(q.customerName || q.customerPhone || q.notes) && (
                  <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-0.5">
                    {q.customerName && (
                      <p>
                        <span className="font-medium text-slate-700">Cliente:</span>{" "}
                        {q.customerName}
                      </p>
                    )}
                    {q.customerPhone && (
                      <p>
                        <span className="font-medium text-slate-700">Telefone:</span>{" "}
                        {formatPhoneBR(q.customerPhone)}
                      </p>
                    )}
                    {q.notes && (
                      <p>
                        <span className="font-medium text-slate-700">Observação:</span>{" "}
                        {q.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Status select */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Atualizar status:</span>
                  <Select
                    value={q.status}
                    onChange={(e) => updateRequestStatus(q.id, e.target.value)}
                    className="w-40 text-sm"
                  >
                    {REQUEST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {REQUEST_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
