"use client"

import Link from "next/link"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarClock, CheckCircle2, Flame, MessageSquareText, Package, Plus, Save, ShoppingCart, UserRound, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  FormBlock,
  LeadStatusBadge,
  LeadTemperatureBadge,
  PhoneInputBR,
  ProductSelect,
  SelectField,
  TextareaField,
  type ProductOption,
} from "@/components/marketing/commercial-fields"
import { useToast } from "@/components/ui/toaster"
import { getProductName } from "@/lib/helpers"
import { formatPhoneBR, isValidEmail } from "@/lib/marketing-format"
import { supabase } from "@/lib/supabase"

type Campaign = {
  id: string
  name: string
  channel: string
}

type Lead = {
  id: string
  campaign_id?: string | null
  marketing_campaign_id?: string | null
  customer_id?: string | null
  sale_id?: string | null
  converted_sale_id?: string | null
  product_id?: string | null
  lead_temperature?: string | null
  name?: string | null
  full_name?: string | null
  phone: string | null
  email: string | null
  source?: string | null
  origin?: string | null
  source_channel?: string | null
  product_interest: string | null
  status: string
  next_action: string | null
  next_action_at?: string | null
  next_action_date?: string | null
  notes: string | null
  lost_reason: string | null
  response_draft: string | null
  created_at: string | null
}

type LeadForm = {
  full_name: string
  phone: string
  email: string
  marketing_campaign_id: string
  source_channel: string
  product_id: string
  product_interest: string
  lead_temperature: string
  status: string
  next_action: string
  next_action_date: string
  notes: string
}

type InventoryLeadProduct = {
  id: string
  imei?: string | null
  imei2?: string | null
  serial_number?: string | null
  grade?: string | null
  status?: string | null
  notes?: string | null
  condition_notes?: string | null
  catalog?: { model?: string | null; variant?: string | null; storage?: string | null; color?: string | null } | null
}

const EMPTY_FORM: LeadForm = {
  full_name: "",
  phone: "",
  email: "",
  marketing_campaign_id: "",
  source_channel: "whatsapp",
  product_id: "",
  product_interest: "",
  lead_temperature: "warm",
  status: "new",
  next_action: "",
  next_action_date: "",
  notes: "",
}

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  in_service: "Em atendimento",
  table_sent: "Tabela enviada",
  hot_negotiation: "Negociação quente",
  sold: "Vendido",
  lost: "Perdido",
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS)

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  trafego_pago: "Meta Ads",
  cliente_recorrente: "Cliente recorrente",
  indicacao: "Indicação",
  manual: "Manual",
  outro: "Outro",
}

const TEMPERATURE_LABELS: Record<string, string> = {
  cold: "Frio",
  warm: "Morno",
  hot: "Quente",
}

const NEXT_ACTION_OPTIONS = [
  "Responder agora",
  "Enviar tabela de parcelamento",
  "Fazer follow-up",
  "Enviar proposta",
  "Confirmar disponibilidade",
  "Negociar desconto",
  "Criar venda",
  "Outro",
]

const DEMO_CAMPAIGNS: Campaign[] = [
  { id: "demo-meta", name: "Meta Ads", channel: "trafego_pago" },
  { id: "demo-instagram", name: "Instagram orgânico", channel: "instagram" },
]

const DEMO_LEADS: Lead[] = [
  {
    id: "demo-thalita",
    campaign_id: "demo-meta",
    sale_id: null,
    name: "Thalita",
    phone: "(85) 99999-1001",
    email: null,
    source: "trafego_pago",
    origin: "Meta Ads",
    product_interest: "iPad 11",
    lead_temperature: "hot",
    status: "table_sent",
    next_action: "Follow-up hoje",
    next_action_at: "2026-05-02T12:00:00.000Z",
    notes: "Recebeu tabela e pediu condição no Pix.",
    lost_reason: null,
    response_draft: null,
    created_at: null,
  },
  {
    id: "demo-carlos",
    campaign_id: "demo-instagram",
    sale_id: null,
    name: "Carlos",
    phone: "(85) 99999-1002",
    email: null,
    source: "instagram",
    origin: "Instagram",
    product_interest: "iPhone 13",
    lead_temperature: "warm",
    status: "in_service",
    next_action: "Responder agora",
    next_action_at: "2026-05-02T12:00:00.000Z",
    notes: "Chamou no direct perguntando bateria e garantia.",
    lost_reason: null,
    response_draft: null,
    created_at: null,
  },
  {
    id: "demo-mariana",
    campaign_id: "demo-meta",
    sale_id: "0241",
    name: "Mariana",
    phone: "(85) 99999-1003",
    email: null,
    source: "trafego_pago",
    origin: "Meta Ads",
    product_interest: "iPad 11",
    lead_temperature: "hot",
    status: "sold",
    next_action: "Venda #0241",
    next_action_at: null,
    notes: "Lead convertido.",
    lost_reason: null,
    response_draft: null,
    created_at: null,
  },
  {
    id: "demo-rafael",
    campaign_id: "demo-instagram",
    sale_id: null,
    name: "Rafael",
    phone: "(85) 99999-1004",
    email: null,
    source: "instagram",
    origin: "Instagram",
    product_interest: "MacBook Air",
    lead_temperature: "hot",
    status: "hot_negotiation",
    next_action: "Enviar proposta",
    next_action_at: "2026-05-02T12:00:00.000Z",
    notes: "Quer comparar 8GB e 16GB.",
    lost_reason: null,
    response_draft: null,
    created_at: null,
  },
  {
    id: "demo-juliana",
    campaign_id: "demo-instagram",
    sale_id: null,
    name: "Juliana",
    phone: "(85) 99999-1005",
    email: null,
    source: "instagram",
    origin: "Instagram",
    product_interest: "iPhone 13",
    lead_temperature: "cold",
    status: "new",
    next_action: "Qualificar lead",
    next_action_at: "2026-05-02T12:00:00.000Z",
    notes: "Lead novo para atendimento.",
    lost_reason: null,
    response_draft: null,
    created_at: null,
  },
]

function isMissingMarketingLeadsTable(error: unknown) {
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error || "")
  return message.includes('relation "marketing_leads" does not exist')
}

function encodeLeadForSale(lead: Lead) {
  return encodeURIComponent(btoa(JSON.stringify({
    id: lead.id,
    name: lead.name || lead.full_name,
    phone: lead.phone,
    email: lead.email,
    campaignId: lead.campaign_id || lead.marketing_campaign_id,
    sourceChannel: lead.source || lead.source_channel,
    productInterest: lead.product_interest,
    productId: lead.product_id,
    notes: lead.notes,
  })))
}

function buildResponseDraft(lead: Lead) {
  const firstName = (lead.name || lead.full_name || "").trim().split(/\s+/)[0] || "tudo bem"
  const product = lead.product_interest ? ` sobre ${lead.product_interest}` : ""
  const action = lead.next_action ? ` ${lead.next_action}` : " Posso te ajudar com valores, disponibilidade e formas de pagamento."
  return `Oi, ${firstName}! Vi seu interesse${product}.${action}`
}

function getLeadProductLabel(lead: Lead, productsById: Map<string, ProductOption>) {
  if (lead.product_id && productsById.has(lead.product_id)) return productsById.get(lead.product_id)!.name
  return lead.product_interest || "Não informado"
}

function getNextActionMeta(lead: Lead) {
  if (lead.status === "lost" || lead.status === "sold") return null
  const action = (lead.next_action || "").toLowerCase()
  const rawDate = lead.next_action_at || lead.next_action_date
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const actionDate = rawDate ? new Date(String(rawDate).slice(0, 10) + "T12:00:00") : null
  if (action.includes("responder agora")) return { label: "Responder agora", className: "bg-blue-100 text-blue-700" }
  if (!actionDate || Number.isNaN(actionDate.getTime())) return null
  const compareDate = new Date(actionDate)
  compareDate.setHours(0, 0, 0, 0)
  if (compareDate.getTime() < today.getTime()) return { label: "Atrasado", className: "bg-red-100 text-red-700" }
  if (compareDate.getTime() === today.getTime()) return { label: "Follow-up hoje", className: "bg-amber-100 text-amber-700" }
  return null
}

function getDisplayNextAction(lead: Lead) {
  const saleId = lead.sale_id || lead.converted_sale_id
  if (lead.status === "lost") return "Sem próxima ação"
  if (lead.status === "sold") return saleId ? `Venda #${String(saleId).slice(0, 8)}` : "Venda vinculada"
  return lead.next_action || (lead.status === "new" ? "Qualificar lead" : "Definir próxima ação")
}

function normalizeNextActionForStatus(status: string, nextAction: string, saleId?: string | null) {
  if (status === "lost") return null
  if (status === "sold") return saleId ? `Venda #${String(saleId).slice(0, 8)}` : null
  return nextAction || null
}

function CRMContent() {
  const params = useSearchParams()
  const initialCampaign = params.get("campaignId") || params.get("campaign") || ""
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [usingDemoData, setUsingDemoData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [campaignFilter, setCampaignFilter] = useState(initialCampaign)
  const [originFilter, setOriginFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [useCustomProduct, setUseCustomProduct] = useState(false)
  const [form, setForm] = useState<LeadForm>({ ...EMPTY_FORM, marketing_campaign_id: initialCampaign })
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: company, error: companyError } = await supabase.from("companies").select("id").limit(1).single()
      if (companyError) throw companyError
      const companyId = company?.id
      if (!companyId) throw new Error("Empresa atual não encontrada.")

      const [campaignsRes, leadsRes, productsRes] = await Promise.all([
        supabase.from("marketing_campaigns").select("id, name, channel").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("marketing_leads").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase
          .from("inventory")
          .select("id, imei, imei2, serial_number, grade, status, quantity, notes, condition_notes, catalog:catalog_id(model, variant, storage, color)")
          .eq("company_id", companyId)
          .in("status", ["active", "in_stock"])
          .order("created_at", { ascending: false }),
      ])

      if (campaignsRes.error) throw campaignsRes.error
      if (productsRes.error) throw productsRes.error
      if (leadsRes.error && !isMissingMarketingLeadsTable(leadsRes.error)) throw leadsRes.error
      const nextCampaigns = campaignsRes.data || []
      const nextLeads = leadsRes.error ? [] : (leadsRes.data || [])
      const nextProducts = ((productsRes.data || []) as InventoryLeadProduct[]).map((item) => ({
        id: item.id,
        name: getProductName({
          catalog: item.catalog ? {
            model: item.catalog.model || undefined,
            storage: item.catalog.storage || undefined,
            color: item.catalog.color || undefined,
          } : null,
          notes: item.notes,
          condition_notes: item.condition_notes,
        }),
        meta: [item.imei || item.serial_number || item.imei2, item.grade, item.status].filter(Boolean).join(" · "),
      }))
      const shouldUseDemo = leadsRes.error || (nextCampaigns.length === 0 && nextLeads.length === 0)
      setCampaigns(shouldUseDemo ? DEMO_CAMPAIGNS : nextCampaigns)
      setLeads(shouldUseDemo ? DEMO_LEADS : nextLeads)
      setProducts(nextProducts)
      setUsingDemoData(shouldUseDemo)
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined
      toast({ title: "Erro ao carregar leads", description: message || "Não foi possível abrir o CRM.", type: "error" })
      setCampaigns(DEMO_CAMPAIGNS)
      setLeads(DEMO_LEADS)
      setUsingDemoData(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const campaignById = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns])
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const selectedCampaignName = campaignFilter ? campaignById.get(campaignFilter)?.name : null
  const origins = useMemo(() => {
    const values = new Set(leads.map((lead) => lead.origin || lead.source || lead.source_channel).filter(Boolean) as string[])
    return Array.from(values)
  }, [leads])

  const filteredLeads = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter
      const matchesCampaign = !campaignFilter || (lead.campaign_id || lead.marketing_campaign_id) === campaignFilter
      const leadOrigin = lead.origin || lead.source || lead.source_channel || ""
      const matchesOrigin = originFilter === "all" || leadOrigin === originFilter
      const leadProduct = getLeadProductLabel(lead, productById)
      const matchesProduct = productFilter === "all" || lead.product_id === productFilter || leadProduct === productFilter
      const searchable = `${lead.name || lead.full_name || ""} ${lead.phone || ""}`.toLowerCase()
      const matchesSearch = !searchTerm.trim() || searchable.includes(searchTerm.trim().toLowerCase())
      const createdAt = lead.created_at ? new Date(String(lead.created_at)) : null
      const matchesPeriod = periodFilter === "all" || (createdAt && (
        periodFilter === "today"
          ? createdAt.toDateString() === today.toDateString()
          : periodFilter === "7d"
            ? createdAt >= new Date(today.getTime() - 7 * 86400000)
            : periodFilter === "30d"
              ? createdAt >= new Date(today.getTime() - 30 * 86400000)
              : true
      ))
      return matchesStatus && matchesCampaign && matchesOrigin && matchesProduct && matchesSearch && matchesPeriod
    })
  }, [campaignFilter, leads, originFilter, periodFilter, productById, productFilter, searchTerm, statusFilter])

  const funnel = useMemo(() => {
    return STATUS_OPTIONS.map(([status, label]) => ({
      status,
      label,
      count: leads.filter((lead) => lead.status === status || (status === "sold" && (lead.sale_id || lead.converted_sale_id))).length,
    }))
  }, [leads])

  const updateForm = (partial: Partial<LeadForm>) => setForm((prev) => ({ ...prev, ...partial }))

  const resetForm = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, marketing_campaign_id: campaignFilter || "" })
    setProductSearch("")
    setUseCustomProduct(false)
    setShowForm(false)
  }

  const editLead = (lead: Lead) => {
    setEditingId(lead.id)
    setForm({
      full_name: lead.name || lead.full_name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      marketing_campaign_id: lead.campaign_id || lead.marketing_campaign_id || "",
      source_channel: lead.source || lead.source_channel || "whatsapp",
      product_id: lead.product_id || "",
      product_interest: lead.product_interest || "",
      lead_temperature: lead.lead_temperature || "warm",
      status: lead.status || "new",
      next_action: lead.next_action || "",
      next_action_date: (lead.next_action_at || lead.next_action_date || "").slice(0, 10),
      notes: lead.notes || "",
    })
    setUseCustomProduct(!lead.product_id)
    setProductSearch("")
    setShowForm(true)
  }

  const saveLead = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Informe o nome do lead", type: "warning" })
      return
    }
    if (!isValidEmail(form.email)) {
      toast({ title: "Email inválido", description: "Revise o formato do email informado.", type: "warning" })
      return
    }
    const typedProductInterest = form.product_interest.trim() || productSearch.trim()
    if (!form.product_id && !typedProductInterest) {
      toast({ title: "Informe o produto de interesse", description: "Selecione um produto real ou use Produto não cadastrado como exceção.", type: "warning" })
      return
    }

    setSaving(true)
    try {
      const selectedProduct = form.product_id ? productById.get(form.product_id) : null
      const normalizedNextAction = normalizeNextActionForStatus(form.status, form.next_action, editingId ? leads.find((lead) => lead.id === editingId)?.sale_id : null)
      const payload = {
        name: form.full_name.trim(),
        phone: form.phone ? formatPhoneBR(form.phone) : null,
        email: form.email || null,
        campaign_id: form.marketing_campaign_id || null,
        source: form.source_channel,
        origin: CHANNEL_LABELS[form.source_channel] || form.source_channel,
        product_id: form.product_id || null,
        product_interest: selectedProduct?.name || typedProductInterest || null,
        lead_temperature: form.lead_temperature || null,
        status: form.status,
        next_action: normalizedNextAction,
        next_action_at: normalizedNextAction && form.next_action_date ? `${form.next_action_date}T12:00:00.000Z` : null,
        notes: form.notes || null,
      }

      if (usingDemoData) {
        const nextLead: Lead = {
          id: `demo-${Date.now()}`,
          campaign_id: payload.campaign_id,
          sale_id: null,
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
          source: payload.source,
          origin: payload.origin,
          product_id: payload.product_id,
          product_interest: payload.product_interest,
          lead_temperature: payload.lead_temperature,
          status: payload.status,
          next_action: payload.next_action,
          next_action_at: payload.next_action_at,
          notes: payload.notes,
          lost_reason: null,
          response_draft: null,
          created_at: new Date().toISOString(),
        }
        setLeads((current) => editingId ? current.map((lead) => lead.id === editingId ? { ...lead, ...nextLead, id: editingId } : lead) : [nextLead, ...current])
        toast({ title: editingId ? "Lead demonstrativo atualizado" : "Lead demonstrativo criado", type: "success" })
        resetForm()
        return
      }

      const request = editingId
        ? supabase.from("marketing_leads").update(payload).eq("id", editingId)
        : supabase.from("marketing_leads").insert(payload)
      const { error } = await request
      if (error) throw error

      toast({ title: editingId ? "Lead atualizado" : "Lead criado", type: "success" })
      resetForm()
      await loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined
      toast({ title: "Erro ao salvar lead", description: message || "Revise os dados e tente novamente.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const updateLead = async (lead: Lead, values: Partial<Lead>) => {
    if (usingDemoData) {
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, ...values } : item))
      return
    }

    try {
      const { error } = await supabase.from("marketing_leads").update(values).eq("id", lead.id)
      if (error) throw error
      await loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined
      toast({ title: "Erro ao atualizar lead", description: message, type: "error" })
    }
  }

  const generateResponse = async (lead: Lead) => {
    const draft = buildResponseDraft(lead)
    await updateLead(lead, usingDemoData
      ? { response_draft: draft, status: lead.status === "new" ? "in_service" : lead.status } as Partial<Lead>
      : { status: lead.status === "new" ? "in_service" : lead.status } as Partial<Lead>)
    toast({ title: "Resposta de atendimento gerada", description: draft, type: "success" })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">CRM de Leads</h1>
          <p className="mt-1 text-gray-500">Acompanhe campanha, atendimento, próxima ação e conversão em venda.</p>
          {selectedCampaignName ? (
            <p className="mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              Filtrando por: {selectedCampaignName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/financeiro/marketing">
            <Button variant="outline">ROI de Marketing</Button>
          </Link>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Novo lead
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {funnel.map((step) => (
          <button key={step.status} onClick={() => setStatusFilter(step.status)} className="rounded-2xl border border-gray-100 bg-card p-4 text-left shadow-sm transition hover:border-royal-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{step.label}</p>
            <p className="mt-3 text-3xl font-bold text-navy-900">{step.count}</p>
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Atendimento comercial</p>
                <h2 className="text-xl font-bold text-navy-900">{editingId ? "Editar lead" : "Novo lead"}</h2>
                <p className="mt-1 text-sm text-gray-500">Registre a origem, produto de interesse e próxima ação comercial.</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={resetForm}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.15fr]">
            <FormBlock icon={<UserRound className="h-4 w-4" />} title="Cliente" subtitle="Dados mínimos para atendimento e venda.">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-900">Nome</span>
                  <input value={form.full_name} onChange={(event) => updateForm({ full_name: event.target.value })} placeholder="Ex: Thalita" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </label>
                <PhoneInputBR label="Telefone" value={form.phone} onValueChange={(value) => updateForm({ phone: value })} placeholder="(98) 99999-9999" />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-900">Email</span>
                  <input value={form.email} onChange={(event) => updateForm({ email: event.target.value })} placeholder="cliente@email.com" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </label>
              </div>
            </FormBlock>

            <FormBlock icon={<Package className="h-4 w-4" />} title="Origem comercial" subtitle="Vincule campanha e produto real para melhorar os relatórios.">
              <div className="grid gap-3 md:grid-cols-2">
                <SelectField label="Campanha de origem" value={form.marketing_campaign_id} onChange={(event) => updateForm({ marketing_campaign_id: event.target.value })}>
                  <option value="">Sem campanha</option>
                  {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.channel}</option>)}
                </SelectField>
                <SelectField label="Origem/canal" value={form.source_channel} onChange={(event) => updateForm({ source_channel: event.target.value })}>
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SelectField>
                <div className="md:col-span-2">
                  <ProductSelect
                    products={products}
                    value={form.product_id}
                    customValue={form.product_interest}
                    search={productSearch}
                    useCustom={useCustomProduct}
                    onSearchChange={setProductSearch}
                    onValueChange={(value) => updateForm({ product_id: value })}
                    onCustomValueChange={(value) => updateForm({ product_interest: value })}
                    onUseCustomChange={setUseCustomProduct}
                  />
                </div>
              </div>
            </FormBlock>

            <div className="xl:col-span-2">
              <FormBlock icon={<CalendarClock className="h-4 w-4" />} title="Atendimento" subtitle="Priorize temperatura, status e próximo passo do lead.">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SelectField label="Status" value={form.status} onChange={(event) => updateForm({ status: event.target.value })}>
                    {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </SelectField>
                  <SelectField label="Temperatura" value={form.lead_temperature} onChange={(event) => updateForm({ lead_temperature: event.target.value })}>
                    {Object.entries(TEMPERATURE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </SelectField>
                  <SelectField label="Próxima ação" value={form.next_action} onChange={(event) => updateForm({ next_action: event.target.value })}>
                    <option value="">Sem ação definida</option>
                    {NEXT_ACTION_OPTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
                  </SelectField>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-900">Data da próxima ação</span>
                    <input type="date" value={form.next_action_date} onChange={(event) => updateForm({ next_action_date: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </label>
                  <div className="md:col-span-2 xl:col-span-4">
                    <TextareaField
                      label="Observações"
                      value={form.notes}
                      onChange={(event) => updateForm({ notes: event.target.value })}
                      placeholder="Ex: Cliente pediu tabela, demonstrou interesse no iPad 11 e quer parcelar em 12x."
                    />
                  </div>
                </div>
              </FormBlock>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={saveLead} isLoading={saving} className="bg-blue-600 hover:bg-blue-700">
              <Save className="h-4 w-4" />
              Salvar lead
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-900">Leads</h2>
            <p className="text-sm text-gray-500">{filteredLeads.length} lead(s) no filtro atual</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nome ou telefone"
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500"
            />
            <select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500">
              <option value="">Todas as campanhas</option>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500">
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500">
              <option value="all">Todas as origens</option>
              {origins.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
            </select>
            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500">
              <option value="all">Todos os produtos</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              {Array.from(new Set(leads.map((lead) => lead.product_interest).filter(Boolean) as string[])).map((product) => <option key={product} value={product}>{product}</option>)}
            </select>
            <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 sm:col-span-2 xl:col-span-1">
              <option value="all">Todo período</option>
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum lead encontrado.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLeads.map((lead) => {
              const campaignId = lead.campaign_id || lead.marketing_campaign_id
              const saleId = lead.sale_id || lead.converted_sale_id
              const leadName = lead.name || lead.full_name || "Lead sem nome"
              const nextActionDate = lead.next_action_at || lead.next_action_date
              const campaign = campaignId ? campaignById.get(campaignId) : null
              const productLabel = getLeadProductLabel(lead, productById)
              const actionMeta = getNextActionMeta(lead)
              return (
                <div key={lead.id} className="grid gap-4 p-5 xl:grid-cols-[1.05fr_0.9fr_0.8fr_0.85fr_0.9fr_auto] xl:items-center">
                  <div>
                    <p className="font-bold text-navy-900">{leadName}</p>
                    <p className="text-sm text-gray-500">{lead.phone || "Sem telefone"}{lead.email ? ` · ${lead.email}` : ""}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Campanha</p>
                    <p className="font-semibold text-navy-900">{campaign?.name || "Sem campanha"}</p>
                    <p className="text-xs font-medium text-gray-500">{lead.origin || CHANNEL_LABELS[lead.source || lead.source_channel || ""] || "Sem origem"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Produto</p>
                    <p className="font-semibold text-navy-900">{productLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <LeadStatusBadge status={lead.status} label={STATUS_LABELS[lead.status] || lead.status} />
                      <LeadTemperatureBadge temperature={lead.lead_temperature} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Próxima ação</p>
                    <p className="font-semibold text-navy-900">{getDisplayNextAction(lead)}</p>
                    {nextActionDate && lead.status !== "lost" && lead.status !== "sold" ? <p className="text-xs text-gray-500">{String(nextActionDate).slice(0, 10)}</p> : null}
                    {actionMeta ? <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${actionMeta.className}`}>{actionMeta.label}</span> : null}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                    <Button variant="outline" size="sm" onClick={() => editLead(lead)}>Editar</Button>
                    <Button variant="outline" size="sm" onClick={() => updateLead(lead, { status: "table_sent", next_action: "Fazer follow-up" } as Partial<Lead>)}>Tabela</Button>
                    <Button variant="outline" size="sm" onClick={() => updateLead(lead, { status: "hot_negotiation", lead_temperature: "hot" } as Partial<Lead>)}>
                      <Flame className="h-3.5 w-3.5" />
                      Quente
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => generateResponse(lead)} title="Gerar resposta de atendimento">
                      <MessageSquareText className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => updateLead(lead, { status: "lost", next_action: null, next_action_at: null, lost_reason: "Marcado como perdido no CRM" } as Partial<Lead>)} title="Marcar perdido">
                      <XCircle className="h-4 w-4" />
                    </Button>
                    {saleId ? (
                      <Link href={`/vendas/${saleId}`}>
                        <Button variant="outline" size="icon" title="Ver venda">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/vendas/nova?lead=${encodeLeadForSale(lead)}`}>
                        <Button size="icon" title="Criar venda a partir do lead">
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                  {lead.notes || lead.response_draft ? (
                    <div className="xl:col-span-6 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                      {lead.notes ? <p>{lead.notes}</p> : null}
                      {lead.response_draft ? <p className="mt-2 font-medium text-navy-900">{lead.response_draft}</p> : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MarketingLeadsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando CRM...</div>}>
      <CRMContent />
    </Suspense>
  )
}
