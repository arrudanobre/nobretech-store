"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, DollarSign, Megaphone, Pencil, Plus, Save, Target, TrendingUp, X, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
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

type SaleRow = {
  id: string
  marketing_campaign_id: string | null
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
  outro: "Outro",
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planejada",
  active: "Ativa",
  paused: "Pausada",
  finished: "Finalizada",
  cancelled: "Cancelada",
}

const ORIGIN_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  trafego_pago: "Tráfego pago",
  indicacao: "Indicação",
  loja: "Loja física",
  recorrente: "Cliente recorrente",
  outro: "Outro",
  unknown: "Não informado",
}

function parseMoney(value: string) {
  if (!value) return 0
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  return Number(normalized) || 0
}

function parseCampaignDate(value?: string | null) {
  if (!value) return null

  const trimmed = String(value).trim()
  if (!trimmed) return null

  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnly ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00`) : new Date(trimmed)

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
  icon: Icon,
  tone = "blue",
}: {
  label: string
  value: string
	  helper: string
	  icon: LucideIcon
	  tone?: "blue" | "green" | "yellow" | "dark"
	}) {
  const toneClass = {
    blue: "bg-royal-100 text-royal-600",
    green: "bg-success-100 text-success-600",
    yellow: "bg-warning-100 text-warning-700",
    dark: "bg-navy-900 text-white",
  }[tone]

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-4 text-3xl font-bold text-navy-900">{value}</p>
          <p className="mt-2 text-sm text-gray-500">{helper}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function MarketingRoiPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
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
      const [campaignsRes, salesRes] = await Promise.all([
        supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
        supabase
          .from("sales")
          .select("id, marketing_campaign_id, sale_origin, sale_price, net_amount, supplier_cost, payment_method, card_fee_pct, warranty_months, notes, sale_date, inventory:inventory_id(id, purchase_price), sales_additional_items(type,cost_price,sale_price,profit)")
          .neq("sale_status", "cancelled")
          .order("sale_date", { ascending: false }),
      ])

      if (campaignsRes.error) throw campaignsRes.error
      if (salesRes.error) throw salesRes.error

      setCampaigns((campaignsRes.data || []) as Campaign[])
      setSales((salesRes.data || []) as SaleRow[])
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined
      toast({
        title: "Erro ao carregar ROI",
        description: message || "Não foi possível carregar campanhas e vendas.",
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

  const rows = useMemo(() => {
    return campaigns.map((campaign) => {
      const campaignSales = sales.filter((sale) => sale.marketing_campaign_id === campaign.id)
      const revenue = campaignSales.reduce((sum, sale) => sum + (Number(sale.sale_price) || 0), 0)
      const profit = campaignSales.reduce((sum, sale) => sum + saleProfit(sale), 0)
      const spend = Number(campaign.actual_spend || campaign.budget_amount || 0)
      const roi = spend > 0 ? revenue / spend : 0
      const profitRoi = spend > 0 ? profit / spend : 0

      return {
        campaign,
        salesCount: campaignSales.length,
        revenue,
        profit,
        spend,
        roi,
        profitRoi,
      }
    })
  }, [campaigns, sales])

  const originRows = useMemo(() => {
    const groups = new Map<string, { count: number; revenue: number; profit: number }>()
    sales.forEach((sale) => {
      const key = sale.sale_origin || "unknown"
      const current = groups.get(key) || { count: 0, revenue: 0, profit: 0 }
      current.count += 1
      current.revenue += Number(sale.sale_price) || 0
      current.profit += saleProfit(sale)
      groups.set(key, current)
    })

    return Array.from(groups.entries())
      .map(([origin, data]) => ({ origin, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [sales])

  const totals = useMemo(() => {
    const spend = rows.reduce((sum, row) => sum + row.spend, 0)
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
    const profit = rows.reduce((sum, row) => sum + row.profit, 0)
    return {
      spend,
      revenue,
      profit,
      roi: spend > 0 ? revenue / spend : 0,
    }
  }, [rows])

  const updateForm = (partial: Partial<CampaignForm>) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }

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
      let companyId = ""
      if (!editingId) {
        const { data: company, error } = await supabase.from("companies").select("id").limit(1).single()
        if (error || !company?.id) throw new Error("Empresa não encontrada para criar a campanha.")
        companyId = company.id
      }

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
        ...(editingId ? {} : { company_id: companyId }),
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
      toast({
        title: "Erro ao salvar campanha",
        description: message || "Revise os dados e tente novamente.",
        type: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">ROI de Marketing</h1>
          <p className="mt-1 text-gray-500">Campanhas, origem das vendas e retorno real do investimento comercial.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nova campanha
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Investimento" value={formatBRL(totals.spend)} helper="gasto registrado em campanhas" icon={DollarSign} tone="dark" />
        <KpiCard label="Receita atribuída" value={formatBRL(totals.revenue)} helper="vendas ligadas a campanhas" icon={TrendingUp} tone="green" />
        <KpiCard label="Lucro atribuído" value={formatBRL(totals.profit)} helper="lucro das vendas vinculadas" icon={Target} tone="blue" />
        <KpiCard label="ROI médio" value={totals.roi ? `${totals.roi.toFixed(1)}x` : "0x"} helper="receita dividida pelo investimento" icon={BarChart3} tone="yellow" />
      </div>

      {showForm && (
        <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Campanha</p>
              <h2 className="text-xl font-bold text-navy-900">{editingId ? "Editar campanha" : "Nova campanha"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Input label="Nome" placeholder="Ex: Meta Ads Abril" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-900">Canal</label>
              <select value={form.channel} onChange={(event) => updateForm({ channel: event.target.value })} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20">
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Input label="Orçamento" placeholder="R$ 0,00" value={form.budget_amount} onChange={(event) => updateForm({ budget_amount: event.target.value })} />
            <Input label="Gasto real" placeholder="R$ 0,00" value={form.actual_spend} onChange={(event) => updateForm({ actual_spend: event.target.value })} />
            <Input label="Início" type="date" value={form.start_date} onChange={(event) => updateForm({ start_date: event.target.value })} />
            <Input label="Fim" type="date" value={form.end_date} onChange={(event) => updateForm({ end_date: event.target.value })} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-900">Status</label>
              <select value={form.status} onChange={(event) => updateForm({ status: event.target.value })} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20">
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Input label="Objetivo" placeholder="Vender iPhone, aquecer leads..." value={form.objective} onChange={(event) => updateForm({ objective: event.target.value })} />
          </div>

          <div className="mt-4">
            <Textarea label="Notas" placeholder="Público, criativo, observações de campanha..." value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} />
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={saveCampaign} isLoading={saving}>
              <Save className="h-4 w-4" />
              Salvar campanha
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
            <div>
              <h2 className="text-xl font-bold text-navy-900">Campanhas</h2>
              <p className="text-sm text-gray-500">{campaigns.length} campanha(s) cadastrada(s)</p>
            </div>
            <Megaphone className="h-5 w-5 text-royal-500" />
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Carregando campanhas...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Nenhuma campanha cadastrada ainda.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.campaign.id} className="grid gap-4 p-5 md:grid-cols-[1.5fr_repeat(4,0.7fr)_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-navy-900">{row.campaign.name}</h3>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{STATUS_LABELS[row.campaign.status] || row.campaign.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{CHANNEL_LABELS[row.campaign.channel] || row.campaign.channel} · {formatPeriod(row.campaign.start_date, row.campaign.end_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Gasto</p>
                    <p className="font-bold text-navy-900">{formatBRL(row.spend)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Receita</p>
                    <p className="font-bold text-success-600">{formatBRL(row.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Lucro</p>
                    <p className="font-bold text-navy-900">{formatBRL(row.profit)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ROI</p>
                    <p className="font-bold text-royal-600">{row.roi ? `${row.roi.toFixed(1)}x` : "0x"}</p>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => editCampaign(row.campaign)} title="Editar campanha">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
          <div className="border-b border-gray-100 p-5">
            <h2 className="text-xl font-bold text-navy-900">Origem das vendas</h2>
            <p className="text-sm text-gray-500">Ajuda a separar tráfego pago, indicação e recorrência.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {originRows.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nenhuma venda com origem registrada.</div>
            ) : originRows.map((row) => (
              <div key={row.origin} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy-900">{ORIGIN_LABELS[row.origin] || row.origin}</p>
                    <p className="text-sm text-gray-500">{row.count} venda(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-navy-900">{formatBRL(row.revenue)}</p>
                    <p className="text-sm text-success-600">{formatBRL(row.profit)} lucro</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
