"use client"

import Link from "next/link"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, MessageSquareText, Plus, Save, ShoppingCart, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toaster"
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
  product_interest: string
  status: string
  next_action: string
  next_action_date: string
  notes: string
}

const EMPTY_FORM: LeadForm = {
  full_name: "",
  phone: "",
  email: "",
  marketing_campaign_id: "",
  source_channel: "whatsapp",
  product_interest: "",
  status: "new",
  next_action: "",
  next_action_date: "",
  notes: "",
}

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  in_service: "Atendido",
  table_sent: "Proposta",
  hot_negotiation: "Qualificado",
  sold: "Convertido",
  lost: "Perdido",
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS)

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  trafego_pago: "Tráfego pago",
  indicacao: "Indicação",
  loja: "Loja física",
  outro: "Outro",
}

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
    notes: lead.notes,
  })))
}

function buildResponseDraft(lead: Lead) {
  const firstName = (lead.name || lead.full_name || "").trim().split(/\s+/)[0] || "tudo bem"
  const product = lead.product_interest ? ` sobre ${lead.product_interest}` : ""
  const action = lead.next_action ? ` ${lead.next_action}` : " Posso te ajudar com valores, disponibilidade e formas de pagamento."
  return `Oi, ${firstName}! Vi seu interesse${product}.${action}`
}

function CRMContent() {
  const params = useSearchParams()
  const initialCampaign = params.get("campaign") || ""
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [usingDemoData, setUsingDemoData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [campaignFilter, setCampaignFilter] = useState(initialCampaign)
  const [form, setForm] = useState<LeadForm>({ ...EMPTY_FORM, marketing_campaign_id: initialCampaign })
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const [campaignsRes, leadsRes] = await Promise.all([
        supabase.from("marketing_campaigns").select("id, name, channel").order("created_at", { ascending: false }),
        supabase.from("marketing_leads").select("*").order("created_at", { ascending: false }),
      ])

      if (campaignsRes.error) throw campaignsRes.error
      if (leadsRes.error && !isMissingMarketingLeadsTable(leadsRes.error)) throw leadsRes.error
      const nextCampaigns = campaignsRes.data || []
      const nextLeads = leadsRes.error ? [] : (leadsRes.data || [])
      const shouldUseDemo = leadsRes.error || nextLeads.length === 0
      setCampaigns(shouldUseDemo ? DEMO_CAMPAIGNS : nextCampaigns)
      setLeads(shouldUseDemo ? DEMO_LEADS : nextLeads)
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

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter
      const matchesCampaign = !campaignFilter || (lead.campaign_id || lead.marketing_campaign_id) === campaignFilter
      return matchesStatus && matchesCampaign
    })
  }, [campaignFilter, leads, statusFilter])

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
      product_interest: lead.product_interest || "",
      status: lead.status || "new",
      next_action: lead.next_action || "",
      next_action_date: (lead.next_action_at || lead.next_action_date || "").slice(0, 10),
      notes: lead.notes || "",
    })
    setShowForm(true)
  }

  const saveLead = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Informe o nome do lead", type: "warning" })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        campaign_id: form.marketing_campaign_id || null,
        source: form.source_channel,
        origin: CHANNEL_LABELS[form.source_channel] || form.source_channel,
        product_interest: form.product_interest || null,
        status: form.status,
        next_action: form.next_action || null,
        next_action_at: form.next_action_date ? `${form.next_action_date}T12:00:00.000Z` : null,
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
          product_interest: payload.product_interest,
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Atendimento</p>
              <h2 className="text-xl font-bold text-navy-900">{editingId ? "Editar lead" : "Novo lead"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={resetForm}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Input label="Nome" value={form.full_name} onChange={(event) => updateForm({ full_name: event.target.value })} />
            <Input label="Telefone" value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} />
            <Input label="Email" value={form.email} onChange={(event) => updateForm({ email: event.target.value })} />
            <Input label="Produto de interesse" value={form.product_interest} onChange={(event) => updateForm({ product_interest: event.target.value })} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-900">Campanha de origem</label>
              <select value={form.marketing_campaign_id} onChange={(event) => updateForm({ marketing_campaign_id: event.target.value })} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20">
                <option value="">Sem campanha</option>
                {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.channel}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-900">Origem</label>
              <select value={form.source_channel} onChange={(event) => updateForm({ source_channel: event.target.value })} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20">
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-900">Status</label>
              <select value={form.status} onChange={(event) => updateForm({ status: event.target.value })} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20">
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Input label="Data da próxima ação" type="date" value={form.next_action_date} onChange={(event) => updateForm({ next_action_date: event.target.value })} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Textarea label="Próxima ação" value={form.next_action} onChange={(event) => updateForm({ next_action: event.target.value })} />
            <Textarea label="Observações" value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} />
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={saveLead} isLoading={saving}>
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
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500">
              <option value="">Todas as campanhas</option>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500">
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
              return (
                <div key={lead.id} className="grid gap-4 p-5 xl:grid-cols-[1.2fr_0.85fr_0.75fr_1fr_1fr_auto] xl:items-center">
                  <div>
                    <p className="font-bold text-navy-900">{leadName}</p>
                    <p className="text-sm text-gray-500">{lead.phone || "Sem telefone"}{lead.email ? ` · ${lead.email}` : ""}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Campanha</p>
                    <p className="font-semibold text-navy-900">{campaign?.name || "Sem campanha"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Produto</p>
                    <p className="font-semibold text-navy-900">{lead.product_interest || "Não informado"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                    <p className="font-semibold text-royal-600">{STATUS_LABELS[lead.status] || lead.status}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Próxima ação</p>
                    <p className="font-semibold text-navy-900">{lead.next_action || "Sem ação"}</p>
                    {nextActionDate ? <p className="text-xs text-gray-500">{String(nextActionDate).slice(0, 10)}</p> : null}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                    <Button variant="outline" size="sm" onClick={() => editLead(lead)}>Editar</Button>
                    <Button variant="outline" size="icon" onClick={() => generateResponse(lead)} title="Gerar resposta de atendimento">
                      <MessageSquareText className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => updateLead(lead, { status: "lost", lost_reason: "Marcado como perdido no CRM" } as Partial<Lead>)} title="Marcar perdido">
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
