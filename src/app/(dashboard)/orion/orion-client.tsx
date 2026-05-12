"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Database,
  Flame,
  Loader2,
  MessageSquareText,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { humanizeChartLabel, humanizeOrionText } from "@/lib/orion/executive-translation"
import { isActionableLead } from "@/lib/orion/lead-classification"
import { cn } from "@/lib/utils"
import type {
  OrionApiPayload,
  OrionChartInterpretation,
  OrionExecutionBundle,
  OrionExecutionProduct,
  OrionExecutionScenario,
  OrionInsight,
  OrionOperationalConversationState,
  OrionPriority,
} from "@/lib/orion/types"

type ApiResponse = {
  data: OrionApiPayload | null
  error: { message: string } | null
}

type ChatMessage = {
  role: "user" | "orion"
  content: string
  source?: "operational" | "overview" | "strategic"
}

type SelectedFinancialPeriod = {
  preset: "today" | "current_month" | "last_7_days" | "last_30_days" | "year_to_date" | "all_time" | "custom"
  startDate?: string
  endDate?: string
}

const FINANCIAL_PERIOD_OPTIONS: Array<{ value: SelectedFinancialPeriod["preset"]; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "current_month", label: "Mês atual" },
  { value: "last_7_days", label: "Últimos 7 dias" },
  { value: "last_30_days", label: "Últimos 30 dias" },
  { value: "year_to_date", label: "Ano atual" },
  { value: "all_time", label: "Todo o histórico" },
  { value: "custom", label: "Personalizado" },
]

const chartColors = ["#38BDF8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6"]

function toDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function periodParams(period: SelectedFinancialPeriod) {
  const params = new URLSearchParams()
  params.set("periodPreset", period.preset)
  if (period.preset === "custom") {
    if (period.startDate) params.set("startDate", period.startDate)
    if (period.endDate) params.set("endDate", period.endDate)
  }
  return params.toString()
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatUSD(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)
}

function priorityClasses(priority: OrionPriority) {
  if (priority === "critical") return "border-red-400/55 bg-red-950/35 text-red-100 shadow-red-950/20"
  if (priority === "high") return "border-amber-400/50 bg-amber-950/35 text-amber-100 shadow-amber-950/20"
  if (priority === "medium") return "border-sky-400/45 bg-sky-950/35 text-sky-100 shadow-sky-950/20"
  return "border-emerald-400/35 bg-emerald-950/25 text-emerald-100 shadow-emerald-950/10"
}

function PriorityGlyph({ priority, className }: { priority: OrionPriority; className?: string }) {
  if (priority === "critical") return <AlertTriangle className={className} />
  if (priority === "high") return <Flame className={className} />
  if (priority === "medium") return <Activity className={className} />
  return <CheckCircle2 className={className} />
}

function areaLabel(area: string) {
  const normalized = area.toLowerCase()
  if (normalized.includes("finance") || normalized.includes("financeiro")) return "Financeiro"
  if (normalized.includes("cashflow") || normalized.includes("fluxo")) return "Fluxo de caixa"
  if (normalized.includes("crm") || normalized.includes("commercial") || normalized.includes("comercial")) return "Comercial"
  if (normalized.includes("growth") || normalized.includes("crescimento")) return "Crescimento"
  if (normalized.includes("marketing") || normalized.includes("campanha")) return "Marketing"
  if (normalized.includes("operations") || normalized.includes("operação") || normalized.includes("operacao")) return "Operação"
  if (normalized.includes("inventory") || normalized.includes("estoque")) return "Estoque"
  if (normalized.includes("sale") || normalized.includes("venda")) return "Vendas"
  if (normalized.includes("caixa")) return "Caixa"
  return area || "Operação"
}

function metricLabel(metric: string) {
  const normalized = metric.toLowerCase()
  if (normalized.includes("revenue")) return "Vendas"
  if (normalized.includes("margin")) return "Margem"
  if (normalized.includes("lead")) return "CRM"
  if (normalized.includes("item") || normalized.includes("stock")) return "Estoque"
  if (normalized.includes("cash")) return "Caixa"
  return areaLabel(metric)
}

function analysisTypeLabel(type: string) {
  if (type === "chat") return "Consulta"
  if (type === "executive") return "Análise executiva"
  return "Análise"
}

function statusLabel(status: string) {
  if (status === "success") return "Concluída"
  if (status === "local") return "Local"
  if (status === "error") return "Fallback"
  return status
}

function toneClasses(tone: "neutral" | "positive" | "warning" | "danger") {
  if (tone === "positive") return "text-emerald-300"
  if (tone === "warning") return "text-amber-300"
  if (tone === "danger") return "text-red-300"
  return "text-sky-200"
}

function polishOrionCopy(value: string) {
  return humanizeOrionText(value)
    .replace(/\(only ACTIONABLE PRODUCTS\)/gi, "")
    .replace(/only ACTIONABLE PRODUCTS/gi, "somente produtos disponíveis")
    .replace(/ACTIONABLE PRODUCTS/gi, "produtos disponíveis")
    .replace(/Realidade operacional do estoque ativo/gi, "Produtos que podem vender agora")
    .replace(/\bCRM\b/g, "comercial")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function buildProactiveMessage(payload: OrionApiPayload) {
  const alert = payload.snapshot.orionProactiveAlerts?.[0]
  if (alert) {
    return `Vinícius, antes de você perguntar: ${alert.message} Minha sugestão: ${alert.recommendedAction}`
  }
  const executive = payload.snapshot.executive
  const lead = payload.snapshot.marketing.forgottenLeads.find((item) => isActionableLead(item.status) && item.classification !== "lost")
  const leadProduct = lead?.productInterest ? ` sobre ${lead.productInterest}` : ""
  const leadCampaign = lead?.campaignName ? ` vindo da campanha ${lead.campaignName}` : ""
  const leadMessage = lead
    ? `Comece por ${lead.name}${leadProduct}${leadCampaign}. Mensagem sugerida: "Oi, ${lead.name}. Vi que você tinha interesse${leadProduct}. Tenho uma condição pronta entrega com garantia e parcelamento. Quer que eu te mande as opções agora?"`
    : null
  if (executive.cashBalance < 0 && executive.leadsWithoutFollowUp > 0) {
    return `Vinícius, já analisei seu cenário atual. O ponto de maior atenção agora é caixa e follow-up. Preserve liquidez e trate os leads parados antes de abrir nova campanha. ${leadMessage || ""}`
  }
  if (executive.cashBalance < 0) {
    return "Vinícius, seu caixa pede cautela. Posso detalhar uma sequência segura para preservar liquidez e ainda buscar venda hoje."
  }
  if (executive.leadsWithoutFollowUp > 0) {
    const leadCount = executive.leadsWithoutFollowUp === 1 ? "existe 1 lead" : `existem ${executive.leadsWithoutFollowUp} leads`
    return `Vinícius, o CRM merece prioridade: ${leadCount} sem retorno claro. ${leadMessage || "Minha sugestão é começar pelos leads mais recentes e mandar uma oferta objetiva com garantia, parcelamento e pronta entrega."}`
  }
  if (executive.stuckStockCount > 0) {
    return `Vinícius, o estoque tem ${executive.stuckStockCount} item(ns) parado(s). Posso sugerir uma campanha segura sem sacrificar margem.`
  }
  return "Vinícius, o cenário está sem bloqueio crítico no momento. Posso apontar a melhor oportunidade de crescimento para hoje."
}

function priorityLabel(priority: OrionPriority) {
  if (priority === "critical") return "Crítico"
  if (priority === "high") return "Alta"
  if (priority === "medium") return "Média"
  return "Baixa"
}

function ProactiveAlertsPanel({ payload }: { payload: OrionApiPayload }) {
  const alerts = payload.snapshot.orionProactiveAlerts || []

  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-[#08111f] p-5 shadow-xl shadow-cyan-950/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Antes de você perguntar</h2>
          <p className="mt-0.5 text-xs text-slate-400">Observações operacionais baseadas no snapshot atual.</p>
        </div>
        <RadioTower className="h-5 w-5 text-cyan-300" />
      </div>

      {alerts.length ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {alerts.map((alert) => (
            <article key={alert.id} className={cn("rounded-2xl border p-4", priorityClasses(alert.priority))}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                  <PriorityGlyph priority={alert.priority} className="h-4 w-4" />
                  {priorityLabel(alert.priority)}
                </div>
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] uppercase text-current/80">{areaLabel(alert.category)}</span>
              </div>
              <h3 className="text-sm font-semibold text-white">{humanizeOrionText(alert.title)}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-200">{humanizeOrionText(alert.message)}</p>
              <p className="mt-3 text-xs font-semibold uppercase text-slate-400">Ação</p>
              <p className="mt-1 text-sm leading-5 text-slate-100">{humanizeOrionText(alert.recommendedAction)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.evidence.slice(0, 3).map((item) => (
                  <span key={`${alert.id}-${item.label}`} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-200">
                    {item.label}: {item.value}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
          Sem alerta operacional relevante agora.
        </p>
      )}
    </section>
  )
}

// ─── Operational execution board ───────────────────────────────────────────

function scenarioLabel(mode: OrionExecutionScenario["mode"] | OrionApiPayload["execution"]["objective"]["recommendedScenario"]) {
  if (mode === "conservative") return "Conservador"
  if (mode === "aggressive") return "Agressivo"
  return "Balanceado"
}

function scenarioClasses(mode: OrionExecutionScenario["mode"]) {
  if (mode === "conservative") return "border-emerald-400/25 bg-emerald-950/20 text-emerald-200"
  if (mode === "aggressive") return "border-red-400/25 bg-red-950/20 text-red-200"
  return "border-yellow-400/35 bg-yellow-950/25 text-yellow-100"
}

function roleLabel(role: OrionExecutionProduct["role"]) {
  if (role === "premium") return "Produto premium"
  if (role === "anchor") return "Produto âncora"
  if (role === "turnover") return "Produto de giro"
  return "Produto de liquidez"
}

function BoardSection({ title, subtitle, children, className }: {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-3xl border border-white/10 bg-[#0b1220] p-6 shadow-xl shadow-black/20", className)}>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">{title}</p>
        {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function BoardMetric({ label, value, tone = "neutral", helper }: {
  label: string
  value: string
  tone?: "neutral" | "green" | "blue" | "amber" | "red"
  helper?: string
}) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.04] text-white",
    green: "border-emerald-400/20 bg-emerald-950/20 text-emerald-300",
    blue: "border-sky-400/20 bg-sky-950/20 text-sky-200",
    amber: "border-amber-400/20 bg-amber-950/20 text-amber-300",
    red: "border-red-400/25 bg-red-950/20 text-red-300",
  }
  return (
    <div className={cn("rounded-2xl border p-5", tones[tone])}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  )
}

function PriorityActionCard({ payload }: { payload: OrionApiPayload }) {
  const action = payload.execution.priorityAction
  if (!action?.product) {
    return (
      <section className="rounded-3xl border border-amber-400/25 bg-amber-950/15 p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Ação prioritária</p>
        <p className="mt-3 text-xl font-semibold text-white">Sem estoque operacional ativo para campanha agora.</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">A ORION não vai montar oferta com produto vendido, reservado ou indisponível.</p>
      </section>
    )
  }

  const product = action.product
  return (
    <section className="rounded-3xl border border-amber-400/35 bg-gradient-to-br from-amber-950/45 via-[#0b1220] to-[#07111f] p-7 shadow-2xl shadow-amber-950/20">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-300" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Ação prioritária agora</span>
          </div>
          <h2 className="text-3xl font-semibold leading-tight text-white md:text-4xl">{product.name}</h2>
          <p className="mt-3 text-base leading-7 text-slate-300">{action.salesArgument}</p>
          <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">CTA de fechamento</p>
            <p className="mt-2 text-lg font-semibold text-white">{action.cta}</p>
          </div>
        </div>
        <div className="grid min-w-full gap-3 sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-1">
          <BoardMetric label="Preço de venda" value={formatBRL(action.price)} tone="blue" />
          <BoardMetric label="Lucro unitário" value={formatBRL(action.profit)} tone="green" helper={`${product.marginPct}% de margem`} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Urgência</p>
          <p className="mt-2 text-sm leading-6 text-white">{action.urgency}</p>
        </div>
        {action.bundleName ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-slate-400">Bundle sugerido</p>
            <p className="mt-2 text-sm leading-6 text-white">{action.bundleName}</p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Risco</p>
          <p className="mt-2 text-sm leading-6 text-white">{action.risk}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-4">
          <p className="text-xs text-slate-400">Retorno previsto</p>
          <p className="mt-2 text-lg font-semibold text-emerald-300">{formatBRL(action.expectedReturn)}</p>
        </div>
      </div>
    </section>
  )
}

function FinancialGoalCard({ payload }: { payload: OrionApiPayload }) {
  const goal = payload.execution.objective.financialGoal
  const tone = goal.urgencyLevel === "urgent" ? "red" : goal.urgencyLevel === "attention" ? "amber" : "green"
  const label = goal.urgencyLevel === "urgent" ? "Urgente" : goal.urgencyLevel === "attention" ? "Atenção" : "Coberto"
  return (
    <section className={cn(
      "rounded-3xl border p-6 shadow-xl shadow-black/20",
      tone === "red" ? "border-red-400/35 bg-red-950/20" : tone === "amber" ? "border-amber-400/35 bg-amber-950/20" : "border-emerald-400/25 bg-emerald-950/15"
    )}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Meta de caixa e dívidas</p>
          <h3 className="mt-3 text-2xl font-semibold leading-tight text-white">{goal.headline}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">{goal.strategy}</p>
        </div>
        <span className={cn(
          "w-fit rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.16em]",
          tone === "red" ? "bg-red-400 text-slate-950" : tone === "amber" ? "bg-amber-300 text-slate-950" : "bg-emerald-300 text-slate-950"
        )}>
          {label}
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <BoardMetric label="Caixa disponível agora" value={formatBRL(goal.grossCash)} tone="blue" helper="Saldo reconciliado disponível hoje, consolidado das contas financeiras." />
        <BoardMetric label="Capital operacional protegido" value={formatBRL(goal.protectedWorkingCapital)} tone="amber" helper="Inclui estoque ativo ainda não convertido em caixa." />
        <BoardMetric label="Lucro realizado no período" value={formatBRL(goal.liquidProfitAvailable)} tone={goal.liquidProfitAvailable >= goal.payables30d ? "green" : "amber"} helper={`Lucro das vendas conciliadas no período selecionado. ${goal.replacementCapitalBasis}`} />
        <BoardMetric label="Contas próximas" value={formatBRL(goal.payables30d)} tone={goal.payables30d > 0 ? "amber" : "neutral"} helper="Obrigações previstas nos próximos 30 dias." />
        <BoardMetric label="Necessidade operacional adicional" value={goal.requiredNewProfit > 0 ? formatBRL(goal.requiredNewProfit) : "Coberto"} tone={goal.requiredNewProfit > 0 ? "red" : "green"} helper={goal.requiredNewProfit > 0 ? undefined : "Nenhum lucro adicional necessário para as contas próximas."} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Caixa projetado com recebíveis</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatBRL(goal.projectedCashAfterCommitments)}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">Sobra na conta após contas e recebíveis, mas parte pode ser dinheiro de recompra.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sobra operacional após contas</p>
          <p className={cn("mt-2 text-lg font-semibold", goal.profitBufferAfterPayables >= 0 ? "text-emerald-300" : "text-red-300")}>{formatBRL(goal.profitBufferAfterPayables)}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">Lucro realizado no período, menos retiradas e contas próximas.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Próximo vencimento</p>
          <p className="mt-2 text-lg font-semibold text-white">{goal.nextDueDays === null ? "Sem vencimento" : `${goal.nextDueDays} dia${goal.nextDueDays === 1 ? "" : "s"}`}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{goal.nextDueLabel || "Sem pressão imediata registrada."}</p>
        </div>
      </div>
    </section>
  )
}

function RoleCard({ product }: { product: OrionExecutionProduct }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{roleLabel(product.role)}</p>
      <h3 className="mt-3 text-lg font-semibold text-white">{product.name}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{product.reason}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 font-semibold text-emerald-300">{formatBRL(product.profit)} lucro/un</span>
        <span className="rounded-full bg-sky-400/10 px-3 py-1 font-semibold text-sky-200">{product.quantity} un</span>
        <span className="rounded-full bg-white/5 px-3 py-1 font-semibold text-slate-300">Conversão {product.conversionSpeed}</span>
      </div>
    </article>
  )
}

function BundleExecutionCard({ bundle }: { bundle: OrionExecutionBundle }) {
  const addOnTotal = bundle.addOns.reduce((sum, item) => sum + item.price * item.quantity, 0)
  return (
    <article className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/25 via-white/[0.035] to-white/[0.015] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">{bundle.tag}</span>
          <h3 className="mt-3 text-xl font-semibold text-white">{bundle.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{bundle.items.join(" + ")}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-slate-400">Preço final</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatBRL(bundle.price)}</p>
        </div>
      </div>
      <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">{bundle.objective}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Composição do preço</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="flex justify-between gap-4">
              <span>Aparelho no preço do estoque</span>
              <span className="font-semibold text-white">{formatBRL(bundle.productPrice)}</span>
            </div>
            {bundle.addOns.map((item) => (
              <div key={item.name} className="flex justify-between gap-4">
                <span>{item.quantity}x {item.name}</span>
                <span className="font-semibold text-white">{formatBRL(item.price * item.quantity)}</span>
              </div>
            ))}
            {bundle.discount > 0 ? (
              <div className="flex justify-between gap-4 text-emerald-300">
                <span>Desconto promocional</span>
                <span className="font-semibold">-{formatBRL(bundle.discount)}</span>
              </div>
            ) : null}
            {!bundle.addOns.length ? (
              <p className="text-xs text-slate-500">Sem acessório ativo vinculado a este pacote.</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Custo do bundle</p>
          <p className="mt-3 text-sm text-slate-300">Aparelho + acessórios: <span className="font-semibold text-white">{formatBRL(bundle.cost)}</span></p>
          <p className="mt-2 text-sm text-slate-300">Acessórios no pacote: <span className="font-semibold text-white">{formatBRL(addOnTotal)}</span></p>
          <p className="mt-2 text-sm text-slate-300">Piso seguro: <span className="font-semibold text-white">{formatBRL(bundle.minimumSafePrice)}</span></p>
          <p className="mt-2 text-sm text-slate-300">Lucro mínimo promocional: <span className="font-semibold text-emerald-300">{formatBRL(bundle.safeProfitFloor)}</span></p>
        </div>
      </div>
      <p className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100">{bundle.promotionNote}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <BoardMetric label="Custo" value={formatBRL(bundle.cost)} />
        <BoardMetric label="Lucro" value={formatBRL(bundle.profit)} tone="green" />
        <BoardMetric label="Margem" value={`${bundle.marginPct}%`} tone="amber" />
        <BoardMetric label="Meta" value={`${bundle.goalUnits} venda${bundle.goalUnits === 1 ? "" : "s"}`} helper={formatBRL(bundle.projectedProfit)} />
      </div>
    </article>
  )
}

function TrafficPlanCard({ payload }: { payload: OrionApiPayload }) {
  const plan = payload.execution.trafficPlan
  if (!plan) return null
  return (
    <BoardSection title="Campanha recomendada" subtitle={`${plan.channel} · ${plan.campaignType}`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BoardMetric label="Orçamento" value={`${formatBRL(plan.budgetDaily)}/dia`} tone="green" helper={`${plan.durationDays} dias · ${formatBRL(plan.totalBudget)} total`} />
        <BoardMetric label="CPL máximo" value={formatBRL(plan.maxCpl)} tone="blue" helper={`${plan.qualifiedConversationTarget} conversas`} />
        <BoardMetric label="CAC máximo" value={formatBRL(plan.maxCac)} tone="amber" helper={`${plan.expectedSales} venda${plan.expectedSales === 1 ? "" : "s"} esperada${plan.expectedSales === 1 ? "" : "s"}`} />
        <BoardMetric label="Canal" value="WhatsApp" helper="Meta Ads mensagens" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Escalar se</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{plan.scaleIf}</p>
        </div>
        <div className="rounded-2xl border border-red-400/15 bg-red-400/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Pausar se</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{plan.pauseIf}</p>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Base do cálculo</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {plan.calculationBasis.map((item) => (
            <p key={item} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs leading-5 text-slate-300">{item}</p>
          ))}
        </div>
      </div>
    </BoardSection>
  )
}

function WhatsAppExecutionCard({ payload }: { payload: OrionApiPayload }) {
  const plan = payload.execution.whatsappPlan
  if (!plan) return null
  const rows = [
    ["Público", plan.audience],
    ["Primeira abordagem", plan.firstApproach],
    ["Follow-up", plan.followUp],
    ["SLA", plan.sla],
    ["Gatilho de fechamento", plan.closingTrigger],
  ]
  return (
    <BoardSection title="Execução WhatsApp" subtitle="Ordem de ataque para transformar conversa em fechamento.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-sm leading-6 text-slate-200">{value}</p>
            </div>
          ))}
        </div>
        <ol className="space-y-3">
          {plan.operationalOrder.map((step, index) => (
            <li key={`${step}-${index}`} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-sm font-bold text-cyan-300">{index + 1}</span>
              <p className="text-sm leading-6 text-slate-300">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </BoardSection>
  )
}

function Timeline72hCard({ payload }: { payload: OrionApiPayload }) {
  const timeline = payload.execution.timeline72h
  if (!timeline.length) return null
  return (
    <BoardSection title="Timeline operacional 72h" subtitle="Ações concretas, KPI e meta esperada por janela.">
      <div className="grid gap-3 md:grid-cols-5">
        {timeline.map((item) => (
          <div key={item.window} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0 text-cyan-300" />
              <p className="text-xs font-bold text-cyan-300">{item.window}</p>
            </div>
            <p className="text-sm leading-5 text-slate-300">{item.action}</p>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs text-slate-500">KPI: {item.kpi}</p>
              <p className="mt-1 text-xs font-semibold text-emerald-300">{item.expectedTarget}</p>
            </div>
          </div>
        ))}
      </div>
    </BoardSection>
  )
}

function ScenarioCard({ scenario, bundle, recommended }: { scenario: OrionExecutionScenario; bundle?: OrionExecutionBundle; recommended: boolean }) {
  return (
    <article className={cn("rounded-3xl border p-5", scenarioClasses(scenario.mode))}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{scenario.title}</p>
          <p className="mt-1 text-xs text-slate-400">{scenario.channel}</p>
        </div>
        {recommended ? <span className="rounded-full bg-yellow-400 px-2.5 py-1 text-[10px] font-bold text-slate-950">Recomendado</span> : null}
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-slate-500">Lucro</span><p className="font-semibold text-white">{formatBRL(scenario.expectedProfit)}</p></div>
        <div><span className="text-slate-500">Margem</span><p className="font-semibold text-white">{scenario.marginPct}%</p></div>
        <div><span className="text-slate-500">Velocidade</span><p className="font-semibold text-white">{scenario.speed}</p></div>
        <div><span className="text-slate-500">Risco</span><p className="font-semibold text-white">{scenario.risk}</p></div>
        <div><span className="text-slate-500">Verba</span><p className="font-semibold text-white">{formatBRL(scenario.budgetDaily)}/dia</p></div>
        <div><span className="text-slate-500">CAC máximo</span><p className="font-semibold text-white">{formatBRL(scenario.maxCac)}</p></div>
      </div>
      {bundle ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3 text-xs leading-5 text-slate-300">
          <p className="font-semibold text-white">{bundle.name}</p>
          <p className="mt-2">Preço: {formatBRL(bundle.price)} · Custo: {formatBRL(bundle.cost)} · Lucro: {formatBRL(bundle.profit)}</p>
          <p className="mt-1">Composição: {bundle.items.join(" + ")}</p>
          <p className="mt-2 text-amber-100">{bundle.promotionNote}</p>
        </div>
      ) : scenario.bundleName ? <p className="mt-4 text-xs leading-5 text-slate-400">Oferta: {scenario.bundleName}</p> : null}
    </article>
  )
}

function ExecutionBoard({ payload }: { payload: OrionApiPayload }) {
  const { execution } = payload
  const operationalTarget = execution.objective.operationalTarget
  const gapToOperationalTarget = execution.objective.gapToOperationalTarget
  const hasTarget = operationalTarget.source !== "no_active_target" && operationalTarget.targetAmount !== null
  const target = hasTarget && operationalTarget.targetAmount !== null
    ? formatBRL(operationalTarget.targetAmount)
    : "Sem meta ativa"
  const targetTone = hasTarget ? "blue" : "neutral"
  const gapTone = gapToOperationalTarget.tone
  const inventoryUnits = execution.inventory.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <main className="space-y-5">
      <BoardSection title="Diagnóstico executivo" subtitle={execution.objective.title}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-4xl text-lg font-medium leading-8 text-white line-clamp-2">{execution.objective.diagnosis}</p>
          <span className="w-fit shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-300">
            Cenário recomendado: {scenarioLabel(execution.objective.recommendedScenario)}
          </span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <BoardMetric label={operationalTarget.label} value={target} tone={targetTone} helper={operationalTarget.explanation} />
          <BoardMetric label="Potencial projetado estoque" value={formatBRL(execution.objective.maxPossibleProfit)} tone="green" helper="Cenário potencial do estoque, não lucro realizado." />
          <BoardMetric
            label="Gap para meta"
            value={gapToOperationalTarget.amount !== null ? formatBRL(gapToOperationalTarget.amount) : "Sem meta ativa"}
            tone={gapTone}
            helper={gapToOperationalTarget.explanation}
          />
          <BoardMetric label="Caixa atual" value={formatBRL(payload.snapshot.executive.cashBalance)} tone={payload.snapshot.executive.cashBalance >= 0 ? "green" : "red"} />
          <BoardMetric label="Recebíveis" value={formatBRL(payload.snapshot.executive.pendingReceivables)} tone="blue" />
        </div>
      </BoardSection>

      <FinancialGoalCard payload={payload} />

      <PriorityActionCard payload={payload} />

      {execution.products.length ? (
        <BoardSection title="Mix ideal de execução" subtitle="Papel comercial de cada SKU no plano.">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {execution.products.map((product) => <RoleCard key={`${product.role}-${product.id}`} product={product} />)}
          </div>
        </BoardSection>
      ) : null}

      {execution.inventory.length ? (
        <BoardSection title="Estoque operacional" subtitle={`${inventoryUnits} unidade${inventoryUnits === 1 ? "" : "s"} ativa${inventoryUnits === 1 ? "" : "s"} e em estoque.`}>
          <div className="grid gap-3 xl:grid-cols-2">
            {execution.inventory.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-white">{item.quantity}x {item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.daysInStock} dias em estoque · margem {item.marginPct}%</p>
                </div>
                <div className="flex gap-4 text-sm sm:text-right">
                  <div><p className="text-slate-500">Preço</p><p className="font-semibold text-white">{formatBRL(item.price)}</p></div>
                  <div><p className="text-slate-500">Lucro</p><p className="font-semibold text-emerald-300">{formatBRL(item.profit)}</p></div>
                </div>
              </div>
            ))}
          </div>
        </BoardSection>
      ) : null}

      <TrafficPlanCard payload={payload} />

      {execution.bundles.length ? (
        <BoardSection title="Bundles executáveis" subtitle="Pacotes calculados a partir do estoque operacional ativo.">
          <div className="space-y-4">
            {execution.bundles.map((bundle) => <BundleExecutionCard key={bundle.id} bundle={bundle} />)}
          </div>
        </BoardSection>
      ) : null}

      <WhatsAppExecutionCard payload={payload} />
      <Timeline72hCard payload={payload} />

      {execution.scenarios.length ? (
        <BoardSection title="Cenários de execução" subtitle="Comparação objetiva de margem, velocidade, risco e verba.">
          <div className="grid gap-4 lg:grid-cols-3">
            {execution.scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.mode}
                scenario={scenario}
                bundle={execution.bundles.find((bundle) => bundle.name === scenario.bundleName)}
                recommended={scenario.mode === execution.objective.recommendedScenario}
              />
            ))}
          </div>
        </BoardSection>
      ) : null}
    </main>
  )
}

/** Analytics recolhido */
function AnalyticsDrawer({ payload, chartInterpretations, allInsights, generating }: {
  payload: OrionApiPayload
  chartInterpretations: Map<string, OrionChartInterpretation>
  allInsights: OrionInsight[]
  generating: boolean
}) {
  return (
    <details className="rounded-3xl border border-white/10 bg-[#0b1220] shadow-xl shadow-black/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-slate-400">
          <ChevronDown className="h-4 w-4" />
          Sinais, gráficos e alertas de apoio
        </span>
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-400">
          {allInsights.length} alertas
        </span>
      </summary>
      <div className="space-y-6 border-t border-white/10 p-5">
        {/* KPI metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {payload.analysis.metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-bold uppercase text-slate-500">{metric.label}</p>
              <p className={cn("mt-3 text-2xl font-semibold", toneClasses(metric.tone))}>{metric.value}</p>
              <p className="mt-2 min-h-4 text-xs text-slate-400">{metric.delta || "Monitorado pela ORION"}</p>
            </div>
          ))}
        </div>

        {/* Priority focus */}
        {payload.analysis.priority_focus ? (
          <section className={cn("rounded-3xl border p-5 shadow-2xl backdrop-blur", priorityClasses(payload.analysis.priority_focus.priority))}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                <PriorityGlyph priority={payload.analysis.priority_focus.priority} className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Prioridade máxima</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{humanizeOrionText(payload.analysis.priority_focus.title)}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-200">{humanizeOrionText(payload.analysis.priority_focus.reason)}</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Daily action plan */}
        <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-sky-200" />
            <h3 className="text-sm font-semibold text-white">Plano de ação do dia</h3>
          </div>
          {generating ? (
            <div className="h-16 animate-pulse rounded-2xl border border-sky-300/10 bg-slate-800/40" />
          ) : (
            <div className="space-y-3">
              {payload.analysis.daily_action_plan.map((action, index) => {
                const offer = payload.execution.bundles[index % Math.max(payload.execution.bundles.length, 1)]
                return (
                  <article key={`${action.title}-${index}`} className={cn("rounded-2xl border p-4", priorityClasses(action.priority))}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 font-mono text-xs font-semibold">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{polishOrionCopy(action.title)}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-200">{polishOrionCopy(action.reason)}</p>
                        <p className="mt-2 text-xs text-slate-300"><span className="font-semibold text-white">Impacto:</span> {polishOrionCopy(action.expected_impact)}</p>
                        {offer ? (
                          <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs leading-5 text-slate-200">
                            <p className="font-semibold text-emerald-300">Oferta segura sugerida</p>
                            <p className="mt-1">Vender {offer.name} por <span className="font-semibold text-white">{formatBRL(offer.price)}</span>, com custo de <span className="font-semibold text-white">{formatBRL(offer.cost)}</span> e lucro de <span className="font-semibold text-white">{formatBRL(offer.profit)}</span>.</p>
                            <p className="mt-1">Composição: {offer.items.join(" + ")}.</p>
                            <p className="mt-1">{offer.promotionNote}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* Insight cards */}
        {allInsights.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {allInsights.map((insight) => (
              <article key={`${insight.category}-${insight.title}`} className={cn("rounded-2xl border p-4 shadow-lg backdrop-blur", priorityClasses(insight.priority))}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                    <PriorityGlyph priority={insight.priority} className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{areaLabel(insight.category)}</p>
                    <h3 className="mt-1 text-sm font-semibold text-white">{polishOrionCopy(insight.title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{polishOrionCopy(insight.insight)}</p>
                    <p className="mt-2 text-xs text-slate-300"><span className="font-semibold text-white">Ação:</span> {polishOrionCopy(insight.recommended_action)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Charts */}
        <div className="grid gap-4 xl:grid-cols-2">
          {payload.analysis.charts.slice(0, 4).map((chart) => {
            const interpretation = chartInterpretations.get(`${chart.title}-${chart.metric}`) || chartInterpretations.get(chart.metric)
            const height = 200
            const chartData = chart.data.map((point) => ({ ...point, label: humanizeChartLabel(point.label) }))
            return (
              <section key={`${chart.title}-${chart.metric}`} className="rounded-3xl border border-[#243044] bg-[#0b1220] p-4 shadow-2xl shadow-black/25">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{chart.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{humanizeOrionText(interpretation?.interpretation || chart.insight)}</p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">{metricLabel(chart.metric)}</span>
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height={height}>
                    {chart.type === "line" ? (
                      <LineChart data={chartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={38} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
                              <p className="mb-1 font-semibold text-white/80">{label}</p>
                              {payload.map((item, i) => <p key={i} className="font-mono" style={{ color: item.color || "#E2E8F0" }}>{item.name}: {formatNumber(Number(item.value || 0))}</p>)}
                            </div>
                          )
                        }} />
                        <Line type="monotone" dataKey="value" stroke="#38BDF8" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    ) : chart.type === "area" ? (
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id={`orion-${chart.metric}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={38} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
                              <p className="mb-1 font-semibold text-white/80">{label}</p>
                              {payload.map((item, i) => <p key={i} className="font-mono" style={{ color: item.color || "#E2E8F0" }}>{item.name}: {formatNumber(Number(item.value || 0))}</p>)}
                            </div>
                          )
                        }} />
                        <Area type="monotone" dataKey="value" stroke="#38BDF8" strokeWidth={2.5} fill={`url(#orion-${chart.metric})`} />
                      </AreaChart>
                    ) : chart.type === "pie" ? (
                      <PieChart>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
                              {payload.map((item, i) => <p key={i} className="font-mono" style={{ color: item.color || "#E2E8F0" }}>{item.name}: {formatNumber(Number(item.value || 0))}</p>)}
                            </div>
                          )
                        }} />
                        <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={3}>
                          {chartData.map((entry, i) => <Cell key={entry.label} fill={chartColors[i % chartColors.length]} />)}
                        </Pie>
                      </PieChart>
                    ) : (
                      <BarChart data={chartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={38} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
                              <p className="mb-1 font-semibold text-white/80">{label}</p>
                              {payload.map((item, i) => <p key={i} className="font-mono" style={{ color: item.color || "#E2E8F0" }}>{item.name}: {formatNumber(Number(item.value || 0))}</p>)}
                            </div>
                          )
                        }} />
                        <Bar dataKey="value" radius={[8, 8, 2, 2]} fill="#38BDF8" />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 rounded-2xl border border-sky-300/15 bg-sky-300/5 p-3">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-200">
                    <RadioTower className="h-3.5 w-3.5" />
                    Leitura ORION
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">{humanizeOrionText(interpretation?.interpretation || chart.insight)}</p>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </details>
  )
}

// ─── Main export ────────────────────────────────────────────────────────────

export function OrionClient() {
  const [payload, setPayload] = useState<OrionApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const generating = false
  const [chatLoading, setChatLoading] = useState(false)
  const [question, setQuestion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [operationalConversationState, setOperationalConversationState] = useState<OrionOperationalConversationState | null>(null)
  const [selectedFinancialPeriod, setSelectedFinancialPeriod] = useState<SelectedFinancialPeriod>({
    preset: "current_month",
    startDate: toDateInputValue(new Date()),
    endDate: toDateInputValue(new Date()),
  })
  const periodRequestKey = useMemo(() => periodParams(selectedFinancialPeriod), [selectedFinancialPeriod])
  const chatPrimedRef = useRef(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "orion",
      content: "Estou carregando estoque, CRM, campanhas e caixa para apontar a prioridade do momento.",
      source: "overview",
    },
  ])

  function primeChat(data: OrionApiPayload) {
    if (chatPrimedRef.current) return
    chatPrimedRef.current = true
    setMessages([{ role: "orion", content: buildProactiveMessage(data), source: "overview" }])
  }

  async function loadOverview() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/orion/analysis?${periodRequestKey}`, { cache: "no-store" })
      const json = await response.json() as ApiResponse
      if (!response.ok || !json.data) {
        setError(json.error?.message || "Não foi possível carregar a ORION AI.")
      } else {
        setPayload(json.data)
        setOperationalConversationState(json.data.operationalConversationState || null)
        primeChat(json.data)
      }
    } catch {
      setError("Não foi possível carregar a ORION AI.")
    } finally {
      setLoading(false)
    }
  }

  async function sendQuestion() {
    const trimmed = question.trim()
    if (!trimmed || chatLoading) return
    setQuestion("")
    setMessages((current) => [...current, { role: "user", content: trimmed }])
    setChatLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/orion/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", message: trimmed, operationalConversationState, selectedFinancialPeriod }),
      })
      const json = await response.json() as ApiResponse
      if (json.data) {
        setPayload(json.data)
        setOperationalConversationState(json.data.operationalConversationState || operationalConversationState)
        const strategicResponse = json.data.strategicCopilotAnswer || null
        setMessages((current) => [...current, {
          role: "orion",
          content: strategicResponse || humanizeOrionText(json.data?.analysis.executive_summary || json.data?.analysis.summary || "Análise concluída."),
          source: strategicResponse ? "strategic" : json.data?.operationalContext ? "operational" : "overview",
        }])
      }
      if (json.error?.message) setError(json.error.message)
    } catch {
      setError("A ORION não conseguiu responder agora. Tente novamente em instantes.")
    } finally {
      setChatLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/orion/analysis?${periodRequestKey}`, { cache: "no-store" })
      .then((res) => res.json().then((json: ApiResponse) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return
        if (!ok || !json.data) {
          setError(json.error?.message || "Não foi possível carregar a ORION AI.")
        } else {
          setPayload(json.data)
          setOperationalConversationState(json.data.operationalConversationState || null)
          primeChat(json.data)
        }
      })
      .catch(() => { if (active) setError("Não foi possível carregar a ORION AI.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [periodRequestKey])

  const allInsights = useMemo(() => {
    if (!payload) return []
    return [
      ...payload.analysis.alerts,
      ...payload.analysis.recommendations,
      ...payload.analysis.risks,
      ...payload.analysis.opportunities,
    ].slice(0, 5)
  }, [payload])

  const chartInterpretations = useMemo(() => {
    const map = new Map<string, OrionChartInterpretation>()
    for (const item of payload?.analysis.chart_interpretations || []) {
      map.set(`${item.title}-${item.metric}`, item)
      map.set(item.metric, item)
    }
    return map
  }, [payload])

  if (loading) {
    return (
      <div className="flex min-h-[72vh] items-center justify-center bg-[#05070d] text-white">
        <div className="flex items-center gap-3 text-sm text-white/60">
          <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
          Inicializando ORION AI
        </div>
      </div>
    )
  }

  if (!payload || !payload.snapshot.executive) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || "ORION AI indisponível."}
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-[#050914] text-slate-100">
      <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">

        {/* Header */}
        <header className="mb-6 rounded-3xl border border-white/10 bg-gradient-to-r from-[#0b1830] to-[#050914] p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">ORION Execution Board</h1>
                <p className="mt-0.5 text-sm text-slate-400">Central operacional comercial · Nobretech</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                Período financeiro
                <select
                  value={selectedFinancialPeriod.preset}
                  onChange={(event) => setSelectedFinancialPeriod((current) => ({
                    ...current,
                    preset: event.target.value as SelectedFinancialPeriod["preset"],
                  }))}
                  className="bg-transparent text-slate-100 outline-none"
                >
                  {FINANCIAL_PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">{option.label}</option>
                  ))}
                </select>
              </label>
              {selectedFinancialPeriod.preset === "custom" ? (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                  <input
                    type="date"
                    value={selectedFinancialPeriod.startDate || ""}
                    onChange={(event) => setSelectedFinancialPeriod((current) => ({ ...current, startDate: event.target.value }))}
                    className="bg-transparent text-slate-100 outline-none"
                  />
                  <span className="text-slate-500">até</span>
                  <input
                    type="date"
                    value={selectedFinancialPeriod.endDate || ""}
                    onChange={(event) => setSelectedFinancialPeriod((current) => ({ ...current, endDate: event.target.value }))}
                    className="bg-transparent text-slate-100 outline-none"
                  />
                </div>
              ) : null}
              {(generating || chatLoading) ? (
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                  <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                  Recalculando
                </span>
              ) : null}
              <Button type="button" variant="outline" onClick={loadOverview} className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
              <Button type="button" onClick={loadOverview} isLoading={loading} className="bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-400/10 hover:bg-cyan-200">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Atualizando..." : "Atualizar plano"}
              </Button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{error}</div>
        ) : null}

        {/* Main grid: content + chat */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">

          {/* Left: execution flow */}
          <div className="space-y-5">
            <ProactiveAlertsPanel payload={payload} />
            <ExecutionBoard payload={payload} />

            {/* 8. Analytics recolhido */}
            <AnalyticsDrawer
              payload={payload}
              chartInterpretations={chartInterpretations}
              allInsights={allInsights}
              generating={generating}
            />

            {/* 9. Histórico recolhido */}
            <details className="rounded-3xl border border-white/10 bg-[#0b1220] shadow-xl shadow-black/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm text-slate-400 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4" />
                  Histórico de análises
                </span>
              </summary>
              <div className="grid gap-3 border-t border-white/10 p-5 md:grid-cols-2 xl:grid-cols-4">
                {payload.history.length ? payload.history.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">{analysisTypeLabel(item.analysisType)}</p>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{statusLabel(item.status)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">{humanizeOrionText(item.question || item.summary)}</p>
                    <p className="mt-2 font-mono text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">Nenhum histórico salvo ainda.</div>
                )}
              </div>
            </details>
          </div>

          {/* Right: chat */}
          <aside className="xl:sticky xl:top-5 xl:h-[calc(100vh-2.5rem)]">
            <section className="flex h-full min-h-[480px] flex-col rounded-3xl border border-white/10 bg-[#0b1220] p-4 shadow-2xl shadow-black/25">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Chat ORION</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Pergunte sobre estoque, leads, margem ou campanha.</p>
                </div>
                <MessageSquareText className="h-4 w-4 text-cyan-300" />
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#050914]">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.slice(-6).map((msg, index) => {
                    const isUser = msg.role === "user"
                    const text = msg.source === "strategic" ? msg.content : humanizeOrionText(msg.content)
                    return (
                      <div key={`${msg.role}-${index}`} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6",
                          isUser ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/[0.05] text-slate-200"
                        )}>
                          {text}
                        </div>
                      </div>
                    )
                  })}
                  {chatLoading ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-cyan-100">
                        <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                        Recalculando
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-white/10 p-3">
                  <div className="flex gap-2">
                    <input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendQuestion() }}
                      placeholder="Pergunte para a ORION..."
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
                    />
                    <Button type="button" size="icon" onClick={sendQuestion} disabled={chatLoading || !question.trim()} className="h-12 w-12 bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                      {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Controle técnico recolhido */}
              <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs text-slate-500 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-3.5 w-3.5" />
                  Controle técnico
                </summary>
                <div className="space-y-2 border-t border-white/10 p-4 text-xs text-slate-400">
                  <p className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Chamadas no mês: {payload.usage.callsThisMonth}</p>
                  <p className="flex items-center gap-2"><Database className="h-3.5 w-3.5" /> Histórico: {payload.config.logTableReady ? "ativo" : "aguardando"}</p>
                  <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Cache: {payload.config.cacheMinutes} min</p>
                  <p>Modo: {payload.config.openaiConfigured ? "Análise completa" : "Análise local"}</p>
                  <p>Custo: {payload.usage.estimatedCostUsdThisMonth == null ? "sem chamadas externas" : formatUSD(payload.usage.estimatedCostUsdThisMonth)}</p>
                </div>
              </details>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
