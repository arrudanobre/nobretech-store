"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
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
  X,
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
  reinvestmentDecision?: OrionApiPayload["reinvestmentDecision"]
  orionResponse?: OrionApiPayload["orionResponse"]
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

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) return "Sem dado"
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`
}

function formatDays(value: number | null | undefined) {
  if (value === null || value === undefined) return "Sem dado"
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} dias`
}

function confidenceCopy(value: "low" | "medium" | "high") {
  if (value === "high") return "boa amostra"
  if (value === "medium") return "sinal consistente"
  return "sinal inicial"
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function pluralizePt(count: number, singular: string, plural: string) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}

function sentenceCasePt(value: string) {
  let shouldCapitalize = true
  let lastWasSentencePunctuation = false
  return Array.from(value).map((char) => {
    const isLetter = char.toLocaleLowerCase("pt-BR") !== char.toLocaleUpperCase("pt-BR")
    const isDigit = char >= "0" && char <= "9"
    if (isDigit) {
      if (shouldCapitalize && !lastWasSentencePunctuation) shouldCapitalize = false
      lastWasSentencePunctuation = false
      return char
    }
    if (isLetter && shouldCapitalize) {
      shouldCapitalize = false
      lastWasSentencePunctuation = false
      return char.toLocaleUpperCase("pt-BR")
    }
    if (isLetter) {
      shouldCapitalize = false
      lastWasSentencePunctuation = false
    }
    if (char === "." || char === "!" || char === "?") {
      lastWasSentencePunctuation = true
    } else if (lastWasSentencePunctuation && char === " ") {
      shouldCapitalize = true
    } else if (char !== " ") {
      lastWasSentencePunctuation = false
    }
    return char
  }).join("")
}

function polishBusinessDecisionText(value: string) {
  return sentenceCasePt(humanizeOrionText(value))
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

function MessageParagraphs({ content }: { content: string }) {
  const paragraphs = humanizeOrionText(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`} className="text-sm leading-6 text-slate-200">{paragraph}</p>
      ))}
    </div>
  )
}

function ReinvestmentDecisionMessage({ decision, fallback }: {
  decision: NonNullable<OrionApiPayload["reinvestmentDecision"]>
  fallback: string
}) {
  const product = decision.recommendedProducts[0]
  const avoid = decision.avoid[0]
  const decisionLabel = decision.decision === "reinvest_recommended"
    ? "Recomprar de forma seletiva"
    : decision.decision === "reinvest_with_cap"
      ? "Recomprar com teto"
      : decision.capitalStatus === "demand_without_safe_capital"
        ? "Demanda existe, capital ainda não"
        : "Segurar recompra agora"

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Decisão</p>
        <p className="mt-2 text-base font-semibold leading-6 text-white">{decisionLabel}</p>
        <p className="mt-2 text-sm leading-6 text-cyan-50">{humanizeOrionText(decision.recommendedAction)}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3">
          <p className="text-[11px] text-emerald-200">Recompra recomendada</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatBRL(decision.recommendedReinvestmentAmount)}</p>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
          <p className="text-[11px] text-amber-200">Reserva mínima</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatBRL(decision.preserveCashAmount)}</p>
        </div>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-3">
          <p className="text-[11px] text-sky-200">Teto teórico</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatBRL(decision.safeReinvestmentCap)}</p>
        </div>
      </div>

      {product ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Prioridade</p>
          <p className="mt-2 text-base font-semibold text-white">{product.label}</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">{humanizeOrionText(product.reason)}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
            <span className="rounded-xl bg-white/[0.05] px-3 py-2">{pluralizePt(product.recentSalesCount, "venda recente", "vendas recentes")}</span>
            <span className="rounded-xl bg-white/[0.05] px-3 py-2">{formatPct(product.historicalMargin)} margem média</span>
            <span className="rounded-xl bg-white/[0.05] px-3 py-2">{formatDays(product.averageDaysInStock)} em estoque</span>
            <span className="rounded-xl bg-white/[0.05] px-3 py-2">{confidenceCopy(product.confidence)}</span>
          </div>
        </div>
      ) : null}

      {avoid ? (
        <div className="rounded-2xl border border-red-300/15 bg-red-300/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-200">Evitar como prioridade</p>
          <p className="mt-2 text-sm font-semibold text-white">{avoid.label}</p>
          <p className="mt-1 text-sm leading-6 text-red-50">{humanizeOrionText(avoid.reason)}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Observação</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{humanizeOrionText(decision.leadContext.note)}</p>
        {decision.precisionWarnings[0] ? (
          <p className="mt-2 text-xs leading-5 text-amber-200">{humanizeOrionText(decision.precisionWarnings[0])}</p>
        ) : null}
      </div>

      {!product && !avoid ? <MessageParagraphs content={fallback} /> : null}
    </div>
  )
}

function BusinessReviewMessage({ review, fallback }: {
  review: NonNullable<NonNullable<OrionApiPayload["orionResponse"]>["structured"]>["businessReview"]
  fallback: string
}) {
  if (!review) return <MessageParagraphs content={fallback} />
  const topProduct = review.sales.topProducts[0]
  const stuckItem = review.inventory.stuckItems[0]
  const recommendation = review.recommendations[0]

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Resultado do período</p>
        <p className="mt-2 text-sm text-slate-300">{review.timeframeLabel}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <span className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white">{pluralizePt(review.sales.totalSales, "venda", "vendas")}</span>
          <span className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white">{formatBRL(review.sales.totalRevenue)} receita</span>
          <span className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white">{review.sales.realizedProfit === null ? "Lucro sem dado" : `${formatBRL(review.sales.realizedProfit)} lucro`}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Produtos que performaram</p>
        {topProduct ? (
          <p className="mt-2 text-sm leading-6 text-slate-200">
            {topProduct.label}: {pluralizePt(topProduct.salesCount, "venda", "vendas")}, {formatBRL(topProduct.revenue)} de receita{topProduct.profit !== null ? ` e ${formatBRL(topProduct.profit)} de lucro` : ""}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Sem produto vendido suficiente no snapshot atual.</p>
        )}
      </div>

      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">Estoque preso</p>
        {stuckItem ? (
          <p className="mt-2 text-sm leading-6 text-amber-50">
            {stuckItem.label}: {stuckItem.daysInStock === null ? "tempo sem dado" : `${stuckItem.daysInStock} dias`} em estoque{stuckItem.investedCapital !== null ? `, ${formatBRL(stuckItem.investedCapital)} imobilizado` : ""}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-50">Sem estoque preso relevante no snapshot atual.</p>
        )}
      </div>

      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200">Minha recomendação</p>
        <p className="mt-2 text-sm leading-6 text-emerald-50">
          {recommendation ? `${recommendation.title}: ${recommendation.action}` : "Manter leitura comercial cautelosa até haver mais dados do período."}
        </p>
      </div>

      {review.caveats[0] ? (
        <p className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-xs leading-5 text-slate-400">{review.caveats[0]}</p>
      ) : null}
    </div>
  )
}

function CashHealthMessage({ summary, fallback }: {
  summary: NonNullable<NonNullable<OrionApiPayload["orionResponse"]>["structured"]>["cashHealthSummary"]
  fallback: string
}) {
  if (!summary) return <MessageParagraphs content={fallback} />
  return (
    <div className="space-y-3">
      {summary.blocks.slice(0, 4).map((block) => (
        <div key={block.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{block.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">{block.body}</p>
        </div>
      ))}
    </div>
  )
}

function decisionTypeLabel(type: string) {
  switch (type) {
    case "capital_allocation": return "Capital"
    case "business_strategy": return "Estratégia"
    case "marketing_strategy": return "Tráfego"
    case "inventory_priority": return "Estoque"
    case "cash_health": return "Caixa"
    case "sales_performance": return "Vendas"
    case "operational_action": return "Ação operacional"
    default: return "Decisão"
  }
}

function decisionStatusLabel(status: string) {
  switch (status) {
    case "open": return "Aberta"
    case "in_progress": return "Em andamento"
    case "done": return "Concluída"
    case "ignored": return "Ignorada"
    case "superseded": return "Substituída"
    default: return status
  }
}

function resultStatusLabel(status: string) {
  switch (status) {
    case "successful": return "Bem-sucedida"
    case "failed": return "Falhou"
    case "mixed": return "Mista"
    case "inconclusive": return "Inconclusiva"
    case "pending": return "Pendente"
    default: return status
  }
}

function priorityLabelStr(priority: string) {
  switch (priority) {
    case "critical": return "Crítica"
    case "high": return "Alta"
    case "medium": return "Média"
    case "low": return "Baixa"
    default: return priority
  }
}

function confidenceLabelStr(confidence: string) {
  switch (confidence) {
    case "high": return "Alta"
    case "medium": return "Média"
    case "low": return "Baixa"
    default: return confidence
  }
}

function reviewDateLabel(value: string | null) {
  if (!value) return "Sem data"
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return "Sem data"
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function decisionMemoryDedupeKey(decision: NonNullable<OrionApiPayload["decisionMemory"]>["open"][number]) {
  const rawKey = typeof decision.decisionPayload?.decisionKey === "string" && decision.decisionPayload.decisionKey.trim()
    ? decision.decisionPayload.decisionKey.trim().toLowerCase()
    : decision.id
  return `${decision.decisionType}:${rawKey}:${decision.status}`
}

function dedupeDecisionMemoryItems(items: NonNullable<OrionApiPayload["decisionMemory"]>["open"]) {
  const byKey = new Map<string, NonNullable<OrionApiPayload["decisionMemory"]>["open"][number]>()
  for (const item of items) {
    const key = decisionMemoryDedupeKey(item)
    const current = byKey.get(key)
    if (!current || String(item.updatedAt || item.createdAt || "") >= String(current.updatedAt || current.createdAt || "")) {
      byKey.set(key, item)
    }
  }
  return Array.from(byKey.values())
}

function DecisionMemoryReviewMessage({ review, fallback }: {
  review: NonNullable<NonNullable<OrionApiPayload["orionResponse"]>["structured"]>["decisionMemoryReview"]
  fallback: string
}) {
  if (!review) return <MessageParagraphs content={fallback} />
  const decisions = review.openDecisions.slice(0, 5)
  if (!decisions.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-sm leading-6 text-slate-200">Não tenho decisões abertas em acompanhamento agora.</p>
      </div>
    )
  }
  const mainDecision = decisions.find((d) => d.decisionType === "business_strategy" || d.decisionType === "capital_allocation") || decisions[0]
  const actionDecision = decisions.find((d) => d.decisionType === "operational_action")
  const count = decisions.length
  const summaryParts = [
    mainDecision !== actionDecision ? mainDecision.title : null,
    actionDecision ? `ação: ${actionDecision.recommendation.split(".")[0].split(";")[0]}` : null,
  ].filter(Boolean)
  const summary = `Você tem ${count} ${count === 1 ? "decisão" : "decisões"} em acompanhamento.${summaryParts.length ? ` ${summaryParts.join(" · ")}.` : ""}`
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">
          <ClipboardList className="size-4" />
          <span>Decisões em acompanhamento</span>
        </div>
        <p className="text-sm leading-6 text-slate-200">{summary}</p>
      </div>
      {decisions.map((decision) => (
        <div key={decision.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[11px] font-semibold text-cyan-100">{decisionTypeLabel(decision.decisionType)}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-slate-300">{decisionStatusLabel(decision.status)}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-slate-300">Prioridade: {priorityLabelStr(decision.priority)}</span>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-white">{decision.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-200">{polishBusinessDecisionText(decision.recommendation)}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> Revisão: {reviewDateLabel(decision.reviewAfter)}</span>
            <span>Confiança: {confidenceLabelStr(decision.confidence)}</span>
            <span>Resultado: {resultStatusLabel(decision.resultStatus)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function BusinessDecisionMessage({ decision, fallback }: {
  decision: NonNullable<NonNullable<OrionApiPayload["orionResponse"]>["structured"]>["businessDecision"]
  fallback: string
}) {
  if (!decision) return <MessageParagraphs content={fallback} />
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Decisão</p>
        <p className="mt-2 text-base font-semibold leading-6 text-white">{decision.recommendation.title}</p>
        <p className="mt-2 text-sm leading-6 text-cyan-50">{polishBusinessDecisionText(decision.recommendation.action)}</p>
        <p className="mt-2 text-xs leading-5 text-cyan-100/80">{polishBusinessDecisionText(decision.recommendation.reason)}</p>
      </div>

      {decision.keyFindings.length ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Evidências principais</p>
          <div className="mt-3 space-y-2">
            {decision.keyFindings.slice(0, 5).map((finding) => (
              <div key={`${finding.label}-${finding.value || finding.evidence}`} className="rounded-xl bg-white/[0.05] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{finding.label}</p>
                  {finding.value ? <span className="text-xs text-cyan-200">{finding.value}</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-300">{polishBusinessDecisionText(finding.evidence)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {decision.alternatives.length ? (
        <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200">Alternativas</p>
          <div className="mt-3 space-y-2">
            {decision.alternatives.slice(0, 3).map((item) => (
              <p key={item.title} className="text-sm leading-6 text-sky-50"><span className="font-semibold text-white">{item.title}:</span> {polishBusinessDecisionText(item.tradeoff)}</p>
            ))}
          </div>
        </div>
      ) : null}

      {decision.avoid.length ? (
        <div className="rounded-2xl border border-red-300/15 bg-red-300/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-200">Evitar</p>
          <div className="mt-3 space-y-2">
            {decision.avoid.slice(0, 3).map((item) => (
              <p key={item.title} className="text-sm leading-6 text-red-50"><span className="font-semibold text-white">{item.title}:</span> {polishBusinessDecisionText(item.reason)}</p>
            ))}
          </div>
        </div>
      ) : null}

      {decision.nextSteps.length ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200">Próximos passos</p>
          <div className="mt-3 space-y-2">
            {decision.nextSteps.slice(0, 3).map((step) => (
              <p key={`${step.priority}-${step.action}`} className="text-sm leading-6 text-emerald-50">{polishBusinessDecisionText(step.action)}</p>
            ))}
          </div>
        </div>
      ) : null}

      {decision.caveats.length ? (
        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-xs leading-5 text-slate-400">
          <p className="font-bold uppercase tracking-[0.16em] text-slate-500">Limitações</p>
          <div className="mt-2 space-y-1">
            {decision.caveats.slice(0, 3).map((caveat) => (
              <p key={caveat}>{polishBusinessDecisionText(caveat)}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AuditBlockItem({ item, isProduct }: { item: string; isProduct: boolean }) {
  if (!isProduct) {
    return <li className="text-sm leading-6 text-slate-200">{item}</li>
  }
  const colonIdx = item.indexOf(": ")
  if (colonIdx === -1) return <li className="text-sm leading-6 text-slate-200">{item}</li>
  const name = item.slice(0, colonIdx)
  const detail = item.slice(colonIdx + 2)
  return (
    <li className="rounded-xl bg-white/[0.05] px-3 py-2">
      <p className="text-sm font-semibold text-white">{name}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-300">{detail}</p>
    </li>
  )
}

function AuditTraceabilityMessage({ text }: { text: string }) {
  const blocks = text.split("\n\n").map((block) => block.trim()).filter(Boolean)
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)
        const rawTitle = lines[0] ?? ""
        const title = rawTitle.replace(/:$/, "")
        const items = lines.slice(1).map((l) => l.replace(/^-\s*/, ""))
        const isProductBlock = /produto|recomendad|evitar/i.test(title)
        if (index === 0 && items.length === 0) {
          return (
            <div key="audit-header" className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
              <p className="text-sm font-semibold text-cyan-100">{title}</p>
            </div>
          )
        }
        return (
          <div key={`${index}-${title.slice(0, 16)}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</p>
            {items.length > 0 ? (
              <ul className={isProductBlock ? "mt-2 space-y-2" : "mt-2 space-y-1"}>
                {items.map((item, i) => (
                  <AuditBlockItem key={i} item={item} isProduct={isProductBlock} />
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function OrionMessageContent({ message }: { message: ChatMessage }) {
  const response = message.orionResponse
  if (response?.responseKind === "reinvestment_decision" && response.structured?.reinvestmentDecision) {
    return <ReinvestmentDecisionMessage decision={response.structured.reinvestmentDecision} fallback={response.text || message.content} />
  }
  if (response?.responseKind === "business_decision") {
    return <BusinessDecisionMessage decision={response.structured?.businessDecision} fallback={response.text || message.content} />
  }
  if (response?.responseKind === "decision_memory_review") {
    return <DecisionMemoryReviewMessage review={response.structured?.decisionMemoryReview} fallback={response.text || message.content} />
  }
  if (response?.responseKind === "business_review") {
    return <BusinessReviewMessage review={response.structured?.businessReview} fallback={response.text || message.content} />
  }
  if (response?.responseKind === "cash_health_summary") {
    return <CashHealthMessage summary={response.structured?.cashHealthSummary} fallback={response.text || message.content} />
  }
  if (response?.responseKind === "audit_traceability") {
    return <AuditTraceabilityMessage text={response.structured?.auditBreakdown?.text || response.text || message.content} />
  }
  if (message.reinvestmentDecision) {
    return <ReinvestmentDecisionMessage decision={message.reinvestmentDecision} fallback={message.content} />
  }
  return <MessageParagraphs content={message.source === "strategic" ? message.content : humanizeOrionText(message.content)} />
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

function DecisionMemoryPanel({ payload }: { payload: OrionApiPayload }) {
  const decisions = dedupeDecisionMemoryItems(payload.decisionMemory?.open || []).slice(0, 3)
  if (decisions.length === 0) return null
  return (
    <section className="rounded-3xl border border-emerald-300/20 bg-[#08111f] p-5 shadow-xl shadow-emerald-950/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Decisões em acompanhamento</h2>
          <p className="mt-0.5 text-xs text-slate-400">Recomendações registradas que ainda esperam resultado.</p>
        </div>
        <CheckCircle2 className="h-5 w-5 text-emerald-300" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {decisions.map((decision) => (
          <article key={decision.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase text-slate-400">
              <span>{decision.status === "in_progress" ? "Em andamento" : "Em acompanhamento"}</span>
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">{decision.resultStatus !== "pending" ? decision.resultStatus : "aguardando resultado"}</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-white">{humanizeOrionText(decision.title)}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-300">{polishBusinessDecisionText(decision.recommendation)}</p>
            {decision.reflection ? (
              <p className="mt-2 text-[11px] leading-5 text-emerald-200">{polishBusinessDecisionText(decision.reflection)}</p>
            ) : null}
            {decision.reviewAfter ? (
              <p className="mt-2 text-[11px] text-slate-400">Próxima revisão: {decision.reviewAfter.slice(0, 10)}</p>
            ) : null}
          </article>
        ))}
      </div>
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
  const reinvestmentDecision = payload.reinvestmentDecision
  const tone = goal.urgencyLevel === "urgent" ? "red" : goal.urgencyLevel === "attention" ? "amber" : "green"
  const label = goal.urgencyLevel === "urgent" ? "Urgente" : goal.urgencyLevel === "attention" ? "Atenção" : "Coberto"
  const reserveValue = reinvestmentDecision?.preserveCashAmount ?? goal.protectedWorkingCapital
  const recompositionValue = reinvestmentDecision?.recommendedReinvestmentAmount ?? goal.safeReinvestmentAmount
  const recompositionLabel = reinvestmentDecision ? "Recompra recomendada" : "Potencial projetado"
  const executiveReading = reinvestmentDecision
    ? reinvestmentDecision.recommendedAction
    : goal.strategy
  const riskReading = reinvestmentDecision?.rationale[0] || goal.replacementCapitalBasis

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
        <BoardMetric label="Caixa disponível" value={formatBRL(goal.grossCash)} tone="blue" helper="Saldo conciliado hoje." />
        <BoardMetric label="Reserva mínima" value={formatBRL(reserveValue)} tone="amber" helper="Capital preservado." />
        <BoardMetric label="Contas próximas" value={formatBRL(goal.payables30d)} tone={goal.payables30d > 0 ? "amber" : "neutral"} helper="Próximos 30 dias." />
        <BoardMetric label="Recebíveis pendentes" value={formatBRL(payload.snapshot.executive.pendingReceivables)} tone="blue" helper="A conciliar." />
        <BoardMetric label={recompositionLabel} value={formatBRL(recompositionValue)} tone={recompositionValue > 0 ? "green" : "neutral"} helper={reinvestmentDecision ? "Teto seletivo." : "Estoque ativo."} />
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Leitura executiva</p>
        <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-200">{humanizeOrionText(executiveReading)}</p>
        {riskReading ? <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-400">{humanizeOrionText(riskReading)}</p> : null}
      </div>
      <details className="mt-4 rounded-2xl border border-white/10 bg-black/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-slate-300 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-slate-500" />
            Ver composição
          </span>
          <span className="text-xs font-normal text-slate-500">lucro, recebíveis, proteção e vencimentos</span>
        </summary>
        <div className="grid gap-3 border-t border-white/10 p-5 md:grid-cols-2 xl:grid-cols-3">
          <BoardMetric label="Lucro realizado" value={formatBRL(goal.liquidProfitAvailable)} tone={goal.liquidProfitAvailable >= goal.payables30d ? "green" : "amber"} helper="Vendas conciliadas." />
          <BoardMetric label="Caixa projetado" value={formatBRL(goal.projectedCashAfterCommitments)} tone={goal.projectedCashAfterCommitments >= 0 ? "green" : "red"} helper="Após contas e recebíveis." />
          <BoardMetric label="Sobra operacional" value={formatBRL(goal.profitBufferAfterPayables)} tone={goal.profitBufferAfterPayables >= 0 ? "green" : "red"} helper="Lucro menos contas." />
          <BoardMetric label="Capital protegido" value={formatBRL(goal.protectedWorkingCapital)} tone="amber" helper="Estoque e operação." />
          <BoardMetric label="Necessidade adicional" value={goal.requiredNewProfit > 0 ? formatBRL(goal.requiredNewProfit) : "Coberto"} tone={goal.requiredNewProfit > 0 ? "red" : "green"} helper="Para contas próximas." />
          <BoardMetric
            label="Próximo vencimento"
            value={goal.nextDueDays === null ? "Sem vencimento" : `${goal.nextDueDays} dia${goal.nextDueDays === 1 ? "" : "s"}`}
            tone={goal.nextDueDays !== null && goal.nextDueDays <= 7 ? "amber" : "neutral"}
            helper={goal.nextDueLabel || "Sem pressão registrada."}
          />
        </div>
      </details>
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
        {(() => {
          const cash = payload.snapshot.executive.cashBalance
          const reserveMin = Math.max(1000, Math.round(Math.max(0, cash) * 0.25))
          const payables = payload.snapshot.executive.liquidityForecast?.payables7d ?? 0
          const receivables = payload.snapshot.executive.pendingReceivables
          return (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <BoardMetric label="Caixa disponível" value={formatBRL(cash)} tone={cash >= 0 ? "green" : "red"} helper="Saldo conciliado." />
              <BoardMetric label="Reserva mínima" value={formatBRL(reserveMin)} tone="amber" helper="Caixa protegido." />
              <BoardMetric label="Contas próximas" value={formatBRL(payables)} tone={payables > 0 ? "amber" : "neutral"} helper="Próximos 7 dias." />
              <BoardMetric label="Recebíveis pendentes" value={formatBRL(receivables)} tone="blue" helper="A conciliar." />
              <BoardMetric label="Potencial projetado" value={formatBRL(execution.objective.maxPossibleProfit)} tone="green" helper="Estoque ativo." />
            </div>
          )
        })()}
        {hasTarget ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{operationalTarget.label}: {target}</span>
            {gapToOperationalTarget.amount !== null ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Cobertura por lucro realizado: {formatBRL(gapToOperationalTarget.amount)} {gapToOperationalTarget.amount > 0 ? "faltando" : "coberto"}
              </span>
            ) : null}
          </div>
        ) : null}
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
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPortalReady, setChatPortalReady] = useState(false)
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
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
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
    setChatOpen(true)
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
        const data = json.data
        setPayload(data)
        setOperationalConversationState(data.operationalConversationState || operationalConversationState)
        const strategicResponse = data.strategicCopilotAnswer || null
        setMessages((current) => [...current, {
          role: "orion",
          content: strategicResponse || humanizeOrionText(data.analysis.executive_summary || data.analysis.summary || "Análise concluída."),
          source: strategicResponse ? "strategic" : data.operationalContext ? "operational" : "overview",
          reinvestmentDecision: data.reinvestmentDecision,
          orionResponse: data.orionResponse,
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

  useEffect(() => {
    setChatPortalReady(true)
  }, [])

  useEffect(() => {
    if (!chatOpen) return
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [chatOpen, messages, chatLoading])

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

  const chatPortal = (
    <>
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="Abrir Chat ORION"
        style={{ position: "fixed", right: 24, bottom: 24, zIndex: 9999 }}
        className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 rounded-2xl border border-cyan-200/50 bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 shadow-2xl shadow-cyan-950/40 ring-1 ring-white/20 backdrop-blur hover:bg-cyan-200"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-cyan-200">
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-cyan-300 bg-emerald-300" />
          <MessageSquareText className="h-4 w-4" />
        </span>
        <span>Chat ORION</span>
      </button>

      {chatOpen ? (
        <div className="fixed inset-0 z-[10000]" style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
          <button
            type="button"
            aria-label="Fechar painel do Chat ORION"
            onClick={() => setChatOpen(false)}
            className="absolute inset-0 z-0 bg-black/45 backdrop-blur-[2px]"
          />
          <aside className="absolute bottom-2 right-2 top-2 z-10 flex w-[min(calc(100vw-1rem),520px)] flex-col rounded-3xl border border-white/10 bg-[#07111f]/95 shadow-2xl shadow-black/50 backdrop-blur-xl sm:bottom-4 sm:right-4 sm:top-4">
            <section className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Chat ORION</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Pergunte sobre estoque, leads, margem ou campanha.</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setChatOpen(false)}
                  className="h-10 w-10 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  aria-label="Fechar Chat ORION"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#050914]">
                <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.map((msg, index) => {
                    const isUser = msg.role === "user"
                    return (
                      <div key={`${msg.role}-${index}`} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "rounded-2xl px-4 py-3 text-sm leading-6",
                          isUser
                            ? "max-w-[88%] whitespace-pre-line bg-cyan-300 text-slate-950"
                            : "w-full max-w-full border border-white/10 bg-white/[0.05] text-slate-200"
                        )}>
                          {isUser ? msg.content : <OrionMessageContent message={msg} />}
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
      ) : null}
    </>
  )

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

        {/* Main dashboard */}
        <div className="space-y-5">
            <ProactiveAlertsPanel payload={payload} />
            <DecisionMemoryPanel payload={payload} />
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

        {chatPortalReady && typeof document !== "undefined" ? createPortal(chatPortal, document.body) : null}
      </div>
    </div>
  )
}
