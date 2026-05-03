"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  DollarSign,
  FileText,
  Filter,
  Link2,
  Megaphone,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Target,
  TrendingUp,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/helpers"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"

type Campaign = {
  id: string
  name: string
  channel: string
  objective: string | null
  start_date: string | null
  end_date: string | null
  budget_amount: number
  actual_spend: number
  status: string
  notes: string | null
}

type LeadRow = {
  id: string
  campaign_id?: string | null
  marketing_campaign_id?: string | null
  sale_id?: string | null
  converted_sale_id?: string | null
  name?: string | null
  full_name?: string | null
  product_interest: string | null
  status: string
  next_action: string | null
  next_action_at?: string | null
  next_action_date?: string | null
  source?: string | null
  origin?: string | null
  source_channel?: string | null
  created_at: string | null
}

type SaleRow = {
  id: string
  marketing_campaign_id: string | null
  marketing_lead_id: string | null
  sale_origin: string | null
  sale_price: number
  net_amount: number | null
  supplier_cost: number | null
  payment_method: string | null
  card_fee_pct: number | null
  warranty_months: number | null
  notes: string | null
  sale_date: string
  inventory?: { purchase_price?: number | null } | null
  sales_additional_items?: { type: string; cost_price: number | null; sale_price: number | null; profit?: number | null }[]
}

type CampaignForm = {
  name: string
  channel: string
  objective: string
  start_date: string
  end_date: string
  budget_amount: string
  actual_spend: string
  status: string
  notes: string
}

type DisplayCampaign = {
  id: string
  name: string
  status: string
  statusLabel: string
  channel: string
  period: string
  spend: number
  leadsCount: number
  costPerLead: number
  contactedCount: number
  soldCount: number
  revenue: number
  roi: number
  isDemo?: boolean
  source?: Campaign
}

type DisplayLead = {
  id: string
  name: string
  product: string
  origin: string
  status: string
  statusLabel: string
  nextAction: string
  linked: boolean
  saleId?: string | null
  isDemo?: boolean
}

const EMPTY_FORM: CampaignForm = {
  name: "",
  channel: "instagram",
  objective: "",
  start_date: "",
  end_date: "",
  budget_amount: "",
  actual_spend: "",
  status: "active",
  notes: "",
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  google: "Google",
  tiktok: "TikTok",
  indicacao: "Indicação",
  loja: "Loja",
  trafego_pago: "Meta Ads",
  outro: "Outro",
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planejada",
  active: "Ativa",
  paused: "Pausada",
  finished: "Finalizada",
  cancelled: "Cancelada",
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  in_service: "Em atendimento",
  table_sent: "Tabela enviada",
  hot_negotiation: "Negociação quente",
  sold: "Vendido",
  lost: "Perdido",
  contacted: "Em atendimento",
  qualified: "Negociação quente",
  proposal: "Tabela enviada",
  converted: "Vendido",
}

const LEAD_STATUS_CLASSES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  in_service: "bg-violet-100 text-violet-700",
  table_sent: "bg-amber-100 text-amber-700",
  hot_negotiation: "bg-orange-100 text-orange-700",
  sold: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
  contacted: "bg-violet-100 text-violet-700",
  qualified: "bg-orange-100 text-orange-700",
  proposal: "bg-amber-100 text-amber-700",
  converted: "bg-emerald-100 text-emerald-700",
}

const FUNNEL_STEPS = [
  { key: "new", label: "Novos", count: 2, width: "w-full", tone: "bg-blue-50 text-blue-700 border-blue-100", icon: UserRound },
  { key: "in_service", label: "Em atendimento", count: 2, width: "w-[92%]", tone: "bg-violet-50 text-violet-700 border-violet-100", icon: MessageCircle },
  { key: "table_sent", label: "Tabela enviada", count: 1, width: "w-[82%]", tone: "bg-amber-50 text-amber-700 border-amber-100", icon: FileText },
  { key: "hot_negotiation", label: "Negociação quente", count: 1, width: "w-[72%]", tone: "bg-orange-50 text-orange-700 border-orange-100", icon: ShoppingCart },
  { key: "sold", label: "Vendidos", count: 1, width: "w-[62%]", tone: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: Target },
  { key: "lost", label: "Perdidos", count: 1, width: "w-[52%]", tone: "bg-rose-50 text-rose-700 border-rose-100", icon: X },
]

const DEMO_CAMPAIGNS: DisplayCampaign[] = [
  {
    id: "demo-ipad",
    name: "Campanha de Vendas do iPad",
    status: "active",
    statusLabel: "Ativa",
    channel: "Instagram",
    period: "30 de abr - 07 de mai",
    spend: 1186,
    leadsCount: 6,
    costPerLead: 197.66,
    contactedCount: 2,
    soldCount: 1,
    revenue: 2750,
    roi: 2.3,
    isDemo: true,
  },
  {
    id: "demo-iphone",
    name: "Campanha de iPhone 13",
    status: "paused",
    statusLabel: "Pausada",
    channel: "Meta Ads",
    period: "15 de abr - 29 de abr",
    spend: 398,
    leadsCount: 3,
    costPerLead: 132.66,
    contactedCount: 1,
    soldCount: 0,
    revenue: 0,
    roi: 0,
    isDemo: true,
  },
]

const DEMO_LEADS: DisplayLead[] = [
  { id: "demo-thalita", name: "Thalita", product: "iPad 11", origin: "Meta Ads", status: "table_sent", statusLabel: "Tabela enviada", nextAction: "Follow-up hoje", linked: false, isDemo: true },
  { id: "demo-carlos", name: "Carlos", product: "iPhone 13", origin: "Instagram", status: "in_service", statusLabel: "Em atendimento", nextAction: "Responder agora", linked: false, isDemo: true },
  { id: "demo-mariana", name: "Mariana", product: "iPad 11", origin: "Meta Ads", status: "sold", statusLabel: "Vendido", nextAction: "Venda #0241", linked: true, saleId: "0241", isDemo: true },
  { id: "demo-rafael", name: "Rafael", product: "MacBook Air", origin: "Instagram", status: "hot_negotiation", statusLabel: "Negociação quente", nextAction: "Enviar proposta", linked: false, isDemo: true },
  { id: "demo-juliana", name: "Juliana", product: "iPhone 13", origin: "Instagram", status: "new", statusLabel: "Novo", nextAction: "Qualificar lead", linked: false, isDemo: true },
]

const DEMO_ORIGINS = [
  { origin: "Meta Ads", pct: 50, count: 4 },
  { origin: "Instagram orgânico", pct: 25, count: 2 },
  { origin: "Cliente recorrente", pct: 12.5, count: 1 },
  { origin: "Indicação", pct: 12.5, count: 1 },
]

function parseMoney(value: string) {
  if (!value) return 0
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  return Number(normalized) || 0
}

function isMissingMarketingLeadsTable(error: unknown) {
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error || "")
  return message.includes('relation "marketing_leads" does not exist')
}

function parseCampaignDate(value?: string | null) {
  if (!value) return null
  const dateOnly = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnly ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00`) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function formatPeriod(start?: string | null, end?: string | null) {
  const startDate = parseCampaignDate(start)
  const endDate = parseCampaignDate(end)
  if (!startDate && !endDate) return "Sem período"
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
  const format = (date: Date) => formatter.format(date).replace(".", "")
  if (startDate && endDate) return `${format(startDate)} - ${format(endDate)}`
  if (startDate) return `Desde ${format(startDate)}`
  return `Até ${format(endDate!)}`
}

function saleProfit(sale: SaleRow) {
  return calcSaleTotals({
    salePrice: sale.sale_price,
    mainCost: sale.inventory?.purchase_price || 0,
    supplierCost: sale.supplier_cost,
    qty: parseQtyFromNotes(sale.notes),
    additionalItems: sale.sales_additional_items || [],
  }).lucroTotal
}

function KpiCard({
  label,
  value,
  helper,
  delta,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  delta: string
  icon: LucideIcon
  tone: string
}) {
  return (
    <div className="min-h-[118px] rounded-2xl border border-[#e2e8f0] bg-white p-3.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 break-words text-[1.15rem] font-bold leading-tight text-slate-950 2xl:text-xl">{value}</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{helper}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] font-medium leading-snug text-emerald-600">↑ {delta}</p>
    </div>
  )
}

function CampaignCard({ campaign, onEdit }: { campaign: DisplayCampaign; onEdit: (campaign: Campaign) => void }) {
  const statusClass = campaign.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"

  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-950">{campaign.name}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", statusClass)}>{campaign.statusLabel}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{campaign.channel} · {campaign.period}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl bg-white"
            onClick={() => campaign.source && onEdit(campaign.source)}
            disabled={!campaign.source}
            title="Editar campanha"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Link href={`/financeiro/marketing/leads?campaign=${campaign.id}`}>
            <Button variant="outline" className="h-9 rounded-xl bg-white px-3 text-xs font-bold text-royal-600">
              Ver leads
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-7">
        <MiniMetric label="Gasto" value={formatBRL(campaign.spend)} />
        <MiniMetric label="Leads" value={String(campaign.leadsCount)} />
        <MiniMetric label="CPL" value={formatBRL(campaign.costPerLead)} />
        <MiniMetric label="Em atendimento" value={String(campaign.contactedCount)} />
        <MiniMetric label="Vendidos" value={String(campaign.soldCount)} />
        <MiniMetric label="Receita" value={formatBRL(campaign.revenue)} />
        <MiniMetric label="ROI" value={campaign.roi ? `${campaign.roi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "0x"} highlight />
      </div>
    </div>
  )
}

function MiniMetric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-sm font-bold", highlight ? "text-emerald-600" : "text-slate-950")}>{value}</p>
    </div>
  )
}

function LeadFunnel({ leads, useDemo }: { leads: DisplayLead[]; useDemo: boolean }) {
  const steps = FUNNEL_STEPS.map((step) => {
    const count = useDemo ? step.count : leads.filter((lead) => lead.status === step.key || (step.key === "sold" && lead.linked)).length
    return { ...step, count }
  })
  const total = steps.reduce((sum, step) => sum + step.count, 0)

  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <SectionTitle icon={Filter} title="Funil de leads" subtitle="Situação atual dos leads desta campanha" />
      <div className="mt-4 space-y-3">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <div key={step.key} className={cn("rounded-xl border px-3 py-2", step.width, step.tone)}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm font-semibold">{step.label}</span>
                </div>
                <span className="text-sm font-bold text-slate-950">{step.count}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-sm font-bold text-slate-950">
        <span>Total de leads</span>
        <span>{total}</span>
      </div>
    </div>
  )
}

function LeadsTable({ leads, totalLeads }: { leads: DisplayLead[]; totalLeads: number }) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle icon={Users} title="Leads da campanha" subtitle="Lista de leads e próximos passos" />
        <Link href="/financeiro/marketing/leads">
          <Button variant="outline" className="h-9 rounded-xl bg-white px-3 text-xs font-bold text-royal-600">Ver todos os leads</Button>
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="py-3">Lead</th>
              <th className="py-3">Produto</th>
              <th className="py-3">Origem</th>
              <th className="py-3">Status</th>
              <th className="py-3">Próxima ação</th>
              <th className="py-3">Vínculo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead, index) => (
              <tr key={lead.id} className="transition hover:bg-slate-50">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", avatarClass(index))}>{lead.name.slice(0, 1)}</span>
                    <span className="font-semibold text-slate-950">{lead.name}</span>
                  </div>
                </td>
                <td className="py-3 font-medium text-slate-700">{lead.product}</td>
                <td className="py-3 text-slate-600">{lead.origin}</td>
                <td className="py-3">
                  <LeadStatusBadge status={lead.status} label={lead.statusLabel} />
                </td>
                <td className="py-3 font-medium text-slate-700">{lead.nextAction}</td>
                <td className="py-3">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold", lead.linked ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                    <Link2 className="h-3 w-3" />
                    {lead.linked ? "Vinculado" : "Não vinculado"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>Mostrando 1 a {Math.min(5, totalLeads)} de {totalLeads} leads</span>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-royal-500 px-3 py-1 text-xs font-bold text-white">1</span>
          <span className="text-xs font-bold text-slate-700">2</span>
          <ArrowRight className="h-4 w-4 text-slate-900" />
        </div>
      </div>
    </div>
  )
}

function LeadStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-bold", LEAD_STATUS_CLASSES[status] || "bg-slate-100 text-slate-600")}>
      {label}
    </span>
  )
}

function LeadOriginCard({ rows, total }: { rows: { origin: string; pct: number; count: number }[]; total: number }) {
  const colors = ["bg-royal-500", "bg-violet-500", "bg-emerald-600", "bg-amber-500"]

  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <SectionTitle icon={BarChart3} title="Origem dos leads" subtitle="De onde seus leads estão vindo" />
      <div className="mt-5 space-y-5">
        {rows.map((row, index) => (
          <div key={row.origin} className="grid grid-cols-[1fr_1.25fr_48px_24px] items-center gap-3 text-sm">
            <span className="truncate font-semibold text-slate-950">{row.origin}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", colors[index] || "bg-slate-500")} style={{ width: `${row.pct}%` }} />
            </div>
            <span className="text-right font-medium text-slate-600">{row.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            <span className="text-right font-bold text-slate-950">{row.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-between border-t border-slate-200 pt-4 font-bold text-slate-950">
        <span>Total</span>
        <span>{total}</span>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-bold leading-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

function avatarClass(index: number) {
  return ["bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-orange-100 text-orange-700", "bg-purple-100 text-purple-700"][index % 5]
}

export default function MarketingRoiPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM)
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const [campaignsRes, leadsRes, salesRes] = await Promise.all([
        supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
        supabase.from("marketing_leads").select("*").order("created_at", { ascending: false }),
        supabase
          .from("sales")
          .select("id, marketing_campaign_id, marketing_lead_id, sale_origin, sale_price, net_amount, supplier_cost, payment_method, card_fee_pct, warranty_months, notes, sale_date, inventory:inventory_id(id, purchase_price), sales_additional_items(type,cost_price,sale_price,profit)")
          .neq("sale_status", "cancelled")
          .order("sale_date", { ascending: false }),
      ])

      if (campaignsRes.error) throw campaignsRes.error
      if (salesRes.error) throw salesRes.error
      if (leadsRes.error && !isMissingMarketingLeadsTable(leadsRes.error)) throw leadsRes.error

      setCampaigns((campaignsRes.data || []) as Campaign[])
      setLeads(leadsRes.error ? [] : (leadsRes.data || []) as LeadRow[])
      setSales((salesRes.data || []) as SaleRow[])
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined
      toast({
        title: "Erro ao carregar marketing",
        description: message || "Não foi possível carregar campanhas e leads.",
        type: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const realCampaigns = useMemo<DisplayCampaign[]>(() => {
    return campaigns.map((campaign) => {
      const campaignLeads = leads.filter((lead) => (lead.campaign_id || lead.marketing_campaign_id) === campaign.id)
      const campaignLeadIds = new Set(campaignLeads.map((lead) => lead.id))
      const campaignSales = sales.filter((sale) => sale.marketing_campaign_id === campaign.id || (sale.marketing_lead_id && campaignLeadIds.has(sale.marketing_lead_id)))
      const spend = Number(campaign.actual_spend || campaign.budget_amount || 0)
      const revenue = campaignSales.reduce((sum, sale) => sum + (Number(sale.sale_price) || 0), 0)
      const soldCount = campaignLeads.filter((lead) => lead.status === "sold" || lead.status === "converted" || lead.sale_id || lead.converted_sale_id).length || campaignSales.length
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        statusLabel: STATUS_LABELS[campaign.status] || campaign.status,
        channel: CHANNEL_LABELS[campaign.channel] || campaign.channel,
        period: formatPeriod(campaign.start_date, campaign.end_date),
        spend,
        leadsCount: campaignLeads.length,
        costPerLead: campaignLeads.length > 0 ? spend / campaignLeads.length : 0,
        contactedCount: campaignLeads.filter((lead) => lead.status === "in_service" || lead.status === "contacted").length,
        soldCount,
        revenue,
        roi: spend > 0 ? revenue / spend : 0,
        source: campaign,
      }
    })
  }, [campaigns, leads, sales])

  const realLeads = useMemo<DisplayLead[]>(() => {
    return leads.map((lead) => {
      const campaignId = lead.campaign_id || lead.marketing_campaign_id
      const linkedSaleId = lead.sale_id || lead.converted_sale_id
      const leadName = lead.name || lead.full_name || "Lead sem nome"
      const leadOrigin = lead.origin || lead.source || lead.source_channel || "Sem origem"
      const campaign = campaigns.find((item) => item.id === campaignId)
      return {
        id: lead.id,
        name: leadName,
        product: lead.product_interest || "Não informado",
        origin: campaign?.name || CHANNEL_LABELS[leadOrigin] || leadOrigin,
        status: lead.status || "new",
        statusLabel: LEAD_STATUS_LABELS[lead.status] || lead.status || "Novo",
        nextAction: lead.next_action || "Qualificar lead",
        linked: Boolean(linkedSaleId),
        saleId: linkedSaleId,
      }
    })
  }, [campaigns, leads])

  const hasRealData = leads.length > 0
  const displayCampaigns = hasRealData ? realCampaigns : DEMO_CAMPAIGNS
  const displayLeads = hasRealData ? realLeads.slice(0, 5) : DEMO_LEADS
  const displayTotalLeads = hasRealData ? realLeads.length : 8

  const originRows = useMemo(() => {
    if (!hasRealData) return DEMO_ORIGINS
    const groups = new Map<string, number>()
    realLeads.forEach((lead) => groups.set(lead.origin, (groups.get(lead.origin) || 0) + 1))
    return Array.from(groups.entries())
      .map(([origin, count]) => ({
        origin,
        count,
        pct: realLeads.length > 0 ? (count / realLeads.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }, [hasRealData, realLeads])

  const kpis = useMemo(() => {
    const primaryCampaign = displayCampaigns[0]
    const spend = hasRealData ? displayCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0) : primaryCampaign?.spend || 0
    const leadsCount = hasRealData ? realLeads.length : primaryCampaign?.leadsCount || 0
    const salesCount = hasRealData ? displayCampaigns.reduce((sum, campaign) => sum + campaign.soldCount, 0) : primaryCampaign?.soldCount || 0
    const revenue = hasRealData ? displayCampaigns.reduce((sum, campaign) => sum + campaign.revenue, 0) : primaryCampaign?.revenue || 0
    const profit = sales.reduce((sum, sale) => sum + saleProfit(sale), 0)
    const roi = spend > 0 ? revenue / spend : 0
    return {
      spend,
      leadsCount,
      costPerLead: hasRealData ? (leadsCount > 0 ? spend / leadsCount : 0) : primaryCampaign?.costPerLead || 0,
      salesCount,
      revenue,
      profit,
      roi,
    }
  }, [displayCampaigns, hasRealData, realLeads.length, sales])

  const updateForm = (partial: Partial<CampaignForm>) => setForm((prev) => ({ ...prev, ...partial }))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  const editCampaign = (campaign: Campaign) => {
    setEditingId(campaign.id)
    setForm({
      name: campaign.name,
      channel: campaign.channel || "instagram",
      objective: campaign.objective || "",
      start_date: campaign.start_date || "",
      end_date: campaign.end_date || "",
      budget_amount: String(campaign.budget_amount || ""),
      actual_spend: String(campaign.actual_spend || ""),
      status: campaign.status || "active",
      notes: campaign.notes || "",
    })
    setShowForm(true)
  }

  const saveCampaign = async () => {
    if (!form.name.trim()) {
      toast({ title: "Informe o nome da campanha", type: "warning" })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        channel: form.channel,
        objective: form.objective || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget_amount: parseMoney(form.budget_amount),
        actual_spend: parseMoney(form.actual_spend),
        status: form.status,
        notes: form.notes || null,
      }
      const request = editingId
        ? supabase.from("marketing_campaigns").update(payload).eq("id", editingId)
        : supabase.from("marketing_campaigns").insert(payload)
      const { error } = await request
      if (error) throw error
      toast({ title: editingId ? "Campanha atualizada" : "Campanha criada", type: "success" })
      resetForm()
      await loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined
      toast({ title: "Erro ao salvar campanha", description: message || "Revise os dados e tente novamente.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 bg-[#f5f7fb] px-0 pb-2">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-950">
              Marketing e Leads
              <TrendingUp className="h-6 w-6 text-slate-400" />
            </h1>
            {!hasRealData && !loading ? (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Dados demonstrativos</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">Acompanhe suas campanhas, leads, origem das vendas e o retorno comercial.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="h-10 rounded-xl bg-white px-4 text-slate-700">
            <CalendarDays className="h-4 w-4" />
            30 de abr - 07 de mai
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button className="h-10 rounded-xl bg-blue-600 px-4 hover:bg-blue-700" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
          <Link href="/financeiro/marketing/leads">
            <Button variant="outline" className="h-10 rounded-xl bg-white px-4">
              <Plus className="h-4 w-4" />
              Novo lead
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard label="Investimento" value={formatBRL(kpis.spend)} helper="Gasto total em campanhas" delta="8% vs. período anterior" icon={DollarSign} tone="bg-blue-50 text-blue-600" />
        <KpiCard label="Leads gerados" value={String(kpis.leadsCount)} helper="Leads captados" delta="20% vs. período anterior" icon={Users} tone="bg-violet-50 text-violet-600" />
        <KpiCard label="Custo por lead" value={formatBRL(kpis.costPerLead)} helper="Investimento por lead" delta="12% vs. período anterior" icon={UserRound} tone="bg-emerald-50 text-emerald-600" />
        <KpiCard label="Vendas atribuídas" value={String(kpis.salesCount)} helper="Vendas vinculadas" delta="0% vs. período anterior" icon={ShoppingCart} tone="bg-orange-50 text-orange-600" />
        <KpiCard label="Receita atribuída" value={formatBRL(kpis.revenue)} helper="Receita das vendas" delta="35% vs. período anterior" icon={DollarSign} tone="bg-emerald-50 text-emerald-600" />
        <KpiCard label="ROI médio" value={kpis.roi ? `${kpis.roi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "0x"} helper="Retorno sobre investimento" delta="31% vs. período anterior" icon={BarChart3} tone="bg-amber-50 text-amber-600" />
      </section>

      {showForm ? (
        <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Campanha</p>
              <h2 className="text-xl font-bold text-slate-950">{editingId ? "Editar campanha" : "Nova campanha"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input label="Nome" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">Canal</label>
              <select value={form.channel} onChange={(event) => updateForm({ channel: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Input label="Orçamento" value={form.budget_amount} onChange={(event) => updateForm({ budget_amount: event.target.value })} />
            <Input label="Gasto real" value={form.actual_spend} onChange={(event) => updateForm({ actual_spend: event.target.value })} />
            <Input label="Início" type="date" value={form.start_date} onChange={(event) => updateForm({ start_date: event.target.value })} />
            <Input label="Fim" type="date" value={form.end_date} onChange={(event) => updateForm({ end_date: event.target.value })} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">Status</label>
              <select value={form.status} onChange={(event) => updateForm({ status: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Input label="Objetivo" value={form.objective} onChange={(event) => updateForm({ objective: event.target.value })} />
          </div>
          <div className="mt-3">
            <Textarea label="Notas" value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveCampaign} isLoading={saving}>
              <Save className="h-4 w-4" />
              Salvar campanha
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm md:col-span-8">
          <SectionTitle icon={Megaphone} title="Campanhas" subtitle="Desempenho das suas campanhas de marketing" />
          <div className="mt-4 space-y-2">
            {displayCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} onEdit={editCampaign} />
            ))}
          </div>
        </div>

        <div className="col-span-12 md:col-span-4">
          <LeadFunnel leads={displayLeads} useDemo={!hasRealData} />
        </div>

        <div className="col-span-12 md:col-span-8">
          <LeadsTable leads={displayLeads} totalLeads={displayTotalLeads} />
        </div>

        <div className="col-span-12 md:col-span-4">
          <LeadOriginCard rows={originRows} total={hasRealData ? realLeads.length : 8} />
        </div>
      </section>
    </div>
  )
}
