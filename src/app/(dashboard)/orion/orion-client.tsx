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
  ArrowRight,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Database,
  Flame,
  Gauge,
  Loader2,
  Megaphone,
  MessageSquareText,
  PackageCheck,
  PhoneCall,
  RadioTower,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { humanizeChartLabel, humanizeOrionText } from "@/lib/orion/executive-translation"
import { isActionableLead } from "@/lib/orion/lead-classification"
import { cn } from "@/lib/utils"
import type {
  OrionActionPlanItem,
  OrionApiPayload,
  OrionChart,
  OrionChartInterpretation,
  OrionInsight,
  OrionPriority,
  OrionPriorityFocus,
} from "@/lib/orion/types"

type ApiResponse = {
  data: OrionApiPayload | null
  error: { message: string } | null
}

type ChatMessage = {
  role: "user" | "orion"
  content: string
  source?: "operational" | "overview"
}

const chartColors = ["#38BDF8", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#F472B6"]

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

function priorityLabel(priority: OrionPriority) {
  if (priority === "critical") return "Crítico"
  if (priority === "high") return "Alta"
  if (priority === "medium") return "Média"
  return "Baixa"
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
  if (normalized.includes("crm") || normalized.includes("commercial") || normalized.includes("comercial")) return "Comercial / CRM"
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

function buildProactiveMessage(payload: OrionApiPayload) {
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

type ExecutiveSectionId =
  | "diagnosis"
  | "bestScenario"
  | "alternativeScenarios"
  | "products"
  | "commercial"
  | "whatsapp"
  | "traffic"
  | "bundle"
  | "timeline"
  | "risk"
  | "goal"
  | "pauseScale"

type ParsedScenarioCard = {
  title: string
  tone: "conservative" | "balanced" | "aggressive" | "neutral"
  body: string
}

type ParsedExecutiveResponse = {
  sections: Map<ExecutiveSectionId, string>
  scenarios: ParsedScenarioCard[]
  isStructured: boolean
}

const SECTION_ALIASES: Array<[ExecutiveSectionId, string[]]> = [
  ["diagnosis", ["diagnostico executivo"]],
  ["bestScenario", ["melhor cenario recomendado"]],
  ["alternativeScenarios", ["cenario alternativo", "cenarios alternativos"]],
  ["products", ["produtos prioritarios", "produtos priorizados", "papel de cada sku"]],
  ["commercial", ["estrategia comercial", "mix ideal de execucao"]],
  ["whatsapp", ["estrategia whatsapp", "estrategia de whatsapp"]],
  ["traffic", ["estrategia de trafego", "trafego pago"]],
  ["bundle", ["estrategia de bundle", "bundle estrategico"]],
  ["timeline", ["timeline de execucao", "plano de execucao 72h"]],
  ["risk", ["risco operacional", "riscos operacionais"]],
  ["goal", ["meta esperada", "objetivo financeiro"]],
  ["pauseScale", ["condicao de pausa escala", "condicao de pausa/escala"]],
]

function normalizeExecutiveLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^#+\s*/, "")
    .replace(/^\d{1,2}[.)]\s*/, "")
    .replace(/[—–-]/g, " ")
    .replace(/[:/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function sectionIdFor(line: string): ExecutiveSectionId | null {
  const normalized = normalizeExecutiveLabel(line)
  for (const [id, aliases] of SECTION_ALIASES) {
    if (aliases.some((alias) => normalized === alias)) return id
  }
  return null
}

function appendSectionLine(sections: Map<ExecutiveSectionId, string[]>, id: ExecutiveSectionId, line: string) {
  const existing = sections.get(id) || []
  existing.push(line)
  sections.set(id, existing)
}

function scenarioTone(title: string): ParsedScenarioCard["tone"] {
  const normalized = normalizeExecutiveLabel(title)
  if (normalized.includes("conservador")) return "conservative"
  if (normalized.includes("balanceado")) return "balanced"
  if (normalized.includes("agressivo")) return "aggressive"
  return "neutral"
}

function parseScenarioCards(content: string) {
  const lines = content.split(/\r?\n/)
  const scenarios: ParsedScenarioCard[] = []
  let current: ParsedScenarioCard | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const normalized = normalizeExecutiveLabel(trimmed)
    const isScenarioTitle = /^cenario\s+\d+\s+(conservador|balanceado|agressivo)\.?$/.test(normalized)

    if (isScenarioTitle) {
      if (current) scenarios.push({ ...current, body: current.body.trim() })
      current = { title: trimmed, tone: scenarioTone(trimmed), body: "" }
      continue
    }

    if (current && sectionIdFor(trimmed)) {
      scenarios.push({ ...current, body: current.body.trim() })
      current = null
      continue
    }

    if (current) {
      current.body = `${current.body}${current.body ? "\n" : ""}${line}`
    }
  }

  if (current) scenarios.push({ ...current, body: current.body.trim() })

  const seen = new Set<string>()
  return scenarios.filter((scenario) => {
    const key = normalizeExecutiveLabel(scenario.title)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseExecutiveResponse(content: string): ParsedExecutiveResponse {
  const sections = new Map<ExecutiveSectionId, string[]>()
  let activeSection: ExecutiveSectionId | null = null

  for (const line of content.split(/\r?\n/)) {
    const nextSection = sectionIdFor(line.trim())
    if (nextSection) {
      activeSection = nextSection
      if (!sections.has(nextSection)) sections.set(nextSection, [])
      continue
    }
    if (activeSection) appendSectionLine(sections, activeSection, line)
  }

  const normalizedSections = new Map<ExecutiveSectionId, string>()
  sections.forEach((lines, key) => {
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
    if (text) normalizedSections.set(key, text)
  })

  const scenarios = parseScenarioCards(content)
  const isStructured = normalizedSections.size >= 3 || scenarios.length >= 2
  return { sections: normalizedSections, scenarios, isStructured }
}

function sectionText(parsed: ParsedExecutiveResponse, ids: ExecutiveSectionId[]) {
  return ids
    .map((id) => parsed.sections.get(id))
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function displayLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function metricFromScenario(scenario: ParsedScenarioCard, labels: string[]) {
  const normalizedLabels = labels.map(normalizeExecutiveLabel)
  for (const line of displayLines(scenario.body)) {
    const [label, ...valueParts] = line.split(":")
    if (!valueParts.length) continue
    if (normalizedLabels.includes(normalizeExecutiveLabel(label))) {
      return valueParts.join(":").trim()
    }
  }
  return null
}

function sentencePreview(text: string, fallback: string) {
  const firstLine = displayLines(text)[0]
  if (!firstLine) return fallback
  return firstLine.replace(/^[-*\d.)\s]+/, "").trim()
}

function ExecutiveTextBlock({ text, dense = false }: { text: string; dense?: boolean }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  if (!blocks.length) {
    return <p className="text-sm leading-relaxed text-slate-400">Sem conteúdo executivo específico para este módulo.</p>
  }

  return (
    <div className={cn("space-y-3", dense ? "text-xs" : "text-sm")}>
      {blocks.map((block, blockIndex) => {
        const lines = displayLines(block)
        const listLike = lines.length > 1 || lines.some((line) => /^[-*\d]+[.)]?\s/.test(line))
        if (listLike) {
          return (
            <div key={`${block.slice(0, 24)}-${blockIndex}`} className="space-y-2">
              {lines.map((line, lineIndex) => (
                <div key={`${line}-${lineIndex}`} className="flex gap-2 leading-relaxed text-slate-200">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300/70" />
                  <span>{line.replace(/^[-*\d.)\s]+/, "")}</span>
                </div>
              ))}
            </div>
          )
        }
        return <p key={`${block.slice(0, 24)}-${blockIndex}`} className="leading-relaxed text-slate-200">{block}</p>
      })}
    </div>
  )
}

function ExecutiveModuleCard({
  title,
  eyebrow,
  icon,
  children,
  className,
}: {
  title: string
  eyebrow: string
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-2xl border border-[#243044] bg-[#0b1220] p-4 shadow-lg shadow-black/20", className)}>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/10 bg-sky-300/10 text-sky-200">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-slate-500">{eyebrow}</p>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-white">{title}</h3>
        </div>
      </div>
      {children}
    </section>
  )
}

function scenarioClasses(tone: ParsedScenarioCard["tone"]) {
  if (tone === "conservative") return "border-emerald-300/25 bg-emerald-300/5 text-emerald-100"
  if (tone === "balanced") return "border-sky-300/30 bg-sky-300/5 text-sky-100"
  if (tone === "aggressive") return "border-amber-300/30 bg-amber-300/5 text-amber-100"
  return "border-slate-500/30 bg-slate-500/5 text-slate-100"
}

function scenarioBadge(tone: ParsedScenarioCard["tone"]) {
  if (tone === "conservative") return "Margem alta"
  if (tone === "balanced") return "Melhor ROI"
  if (tone === "aggressive") return "Liquidez rápida"
  return "Cenário"
}

function ScenarioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/15 p-3">
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs leading-relaxed text-slate-100">{value}</p>
    </div>
  )
}

function ScenarioCard({ scenario, defaultOpen = false }: { scenario: ParsedScenarioCard; defaultOpen?: boolean }) {
  const objective = metricFromScenario(scenario, ["Objetivo"]) || sentencePreview(scenario.body, "Objetivo definido pela ORION.")
  const profit = metricFromScenario(scenario, ["Lucro total esperado"]) || metricFromScenario(scenario, ["Lucro unitário"]) || "Projetado no cenário."
  const margin = metricFromScenario(scenario, ["Margem final"]) || "Margem preservada conforme piso seguro."
  const traffic = metricFromScenario(scenario, ["Tráfego"]) || "Canal definido conforme mix operacional."
  const healthyCac = metricFromScenario(scenario, ["CAC máximo saudável"]) || "Controlar abaixo do lucro incremental por conversa qualificada."
  const term = metricFromScenario(scenario, ["Prazo esperado"]) || "Janela de execução definida no plano."
  const risk = metricFromScenario(scenario, ["Risco"]) || "Risco calibrado pela pressão operacional."
  const products = metricFromScenario(scenario, ["Produtos"]) || "Mix de produtos ativo aplicado ao cenário."
  const impact = metricFromScenario(scenario, ["Impacto na liquidez"]) || "Impacto financeiro projetado pela estratégia."
  const pause = metricFromScenario(scenario, ["Gatilho de pausa"]) || "Pausar se os indicadores comerciais perderem eficiência."
  const scale = metricFromScenario(scenario, ["Gatilho de escala"]) || "Escalar quando conversas qualificadas e retorno sustentarem a verba."

  return (
    <details className={cn("group overflow-hidden rounded-2xl border", scenarioClasses(scenario.tone))} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/70">
              {scenarioBadge(scenario.tone)}
            </span>
            <h4 className="text-sm font-semibold text-white">{scenario.title}</h4>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{objective}</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/10 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <ScenarioMetric label="Lucro" value={profit} />
          <ScenarioMetric label="Margem" value={margin} />
          <ScenarioMetric label="Velocidade" value={term} />
          <ScenarioMetric label="Verba e CAC" value={`${traffic} ${healthyCac}`} />
          <ScenarioMetric label="Produtos" value={products} />
          <ScenarioMetric label="Impacto" value={impact} />
          <ScenarioMetric label="Risco" value={risk} />
          <ScenarioMetric label="Pausa / escala" value={`${pause} ${scale}`} />
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
          <ExecutiveTextBlock text={scenario.body} dense />
        </div>
      </div>
    </details>
  )
}

function TimelineModule({ parsed }: { parsed: ParsedExecutiveResponse }) {
  const best = parsed.scenarios.find((scenario) => scenario.tone === "balanced") || parsed.scenarios[0]
  const pause = best ? metricFromScenario(best, ["Gatilho de pausa"]) : null
  const scale = best ? metricFromScenario(best, ["Gatilho de escala"]) : null
  const traffic = sectionText(parsed, ["traffic"])
  const whatsapp = sectionText(parsed, ["whatsapp"])
  const bundle = sectionText(parsed, ["bundle"])
  const steps = [
    { time: "Hora 0", action: "Confirmar estoque operacional, preço e mix da campanha.", kpi: "Capacidade real validada", pause: "Pausar se algum item não estiver disponível.", scale: "Liberar campanha após validação." },
    { time: "0-6h", action: sentencePreview(bundle || traffic, "Montar oferta, bundle e criativo principal."), kpi: "Oferta pronta para WhatsApp e tráfego", pause: "Pausar se o preço romper o piso seguro.", scale: "Publicar quando o CTA estiver claro." },
    { time: "6-24h", action: sentencePreview(whatsapp, "Ativar conversas qualificadas no WhatsApp."), kpi: "Conversas qualificadas", pause: pause || "Pausar sem intenção real de compra.", scale: scale || "Escalar com sinais fortes de conversão." },
    { time: "24-48h", action: "Reforçar remarketing e priorizar fechamento dos leads compatíveis.", kpi: "Propostas em negociação", pause: "Pausar verba se o custo por conversa perder eficiência.", scale: "Aumentar verba apenas com ROI preservado." },
    { time: "48-72h", action: "Decidir entre proteção de margem, giro balanceado ou liquidez agressiva.", kpi: "Venda fechada ou cenário recalibrado", pause: "Pausar o agressivo sem pressão financeira real.", scale: "Escalar o cenário vencedor." },
  ]

  return (
    <div className="grid gap-3">
      {steps.map((step) => (
        <div key={step.time} className="rounded-xl border border-white/10 bg-black/15 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold text-sky-200">{step.time}</p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{step.kpi}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-100">{step.action}</p>
          <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <p><span className="text-amber-200">Pausa:</span> {step.pause}</p>
            <p><span className="text-emerald-200">Escala:</span> {step.scale}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ExecutiveDecisionResponse({ content }: { content: string }) {
  const safeContent = useMemo(() => humanizeOrionText(content), [content])
  const parsed = useMemo(() => parseExecutiveResponse(safeContent), [safeContent])

  if (!parsed.isStructured) {
    return (
      <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-3 text-sm leading-relaxed text-slate-200">
        <ExecutiveTextBlock text={safeContent} />
      </div>
    )
  }

  const bestScenario = parsed.scenarios.find((scenario) => {
    const bestText = sectionText(parsed, ["bestScenario"])
    return bestText && bestText.includes(scenario.title)
  }) || parsed.scenarios.find((scenario) => scenario.tone === "balanced") || parsed.scenarios[0]
  const alternatives = parsed.scenarios.filter((scenario) => scenario.title !== bestScenario?.title)
  const productText = sectionText(parsed, ["products"])
  const commercialText = sectionText(parsed, ["commercial"])
  const trafficText = sectionText(parsed, ["traffic"])
  const whatsappText = sectionText(parsed, ["whatsapp"])
  const bundleText = sectionText(parsed, ["bundle"])
  const riskText = sectionText(parsed, ["risk"])
  const goalText = sectionText(parsed, ["goal"])
  const pauseScaleText = sectionText(parsed, ["pauseScale"])

  return (
    <div className="space-y-3">
      <ExecutiveModuleCard title="Diagnóstico Executivo" eyebrow="Leitura de decisão" icon={<BrainCircuit className="h-4 w-4" />} className="bg-[#0a1322]">
        <ExecutiveTextBlock text={sectionText(parsed, ["diagnosis"]) || safeContent} />
      </ExecutiveModuleCard>

      {bestScenario ? (
        <ExecutiveModuleCard title="Melhor Cenário Recomendado" eyebrow="Cenário vencedor" icon={<TrendingUp className="h-4 w-4" />}>
          <ScenarioCard scenario={bestScenario} defaultOpen />
        </ExecutiveModuleCard>
      ) : null}

      <ExecutiveModuleCard title="Cenários Alternativos" eyebrow="Comparação operacional" icon={<Gauge className="h-4 w-4" />}>
        <div className="grid gap-3">
          {alternatives.length ? alternatives.map((scenario) => (
            <ScenarioCard key={scenario.title} scenario={scenario} />
          )) : (
            <ExecutiveTextBlock text={sectionText(parsed, ["alternativeScenarios"]) || "Sem cenário alternativo detalhado nesta resposta."} dense />
          )}
        </div>
      </ExecutiveModuleCard>

      <div className="grid gap-3 xl:grid-cols-2">
        <ExecutiveModuleCard title="Produtos Prioritários" eyebrow="Mix de portfólio" icon={<PackageCheck className="h-4 w-4" />}>
          <ExecutiveTextBlock text={productText} dense />
        </ExecutiveModuleCard>
        <ExecutiveModuleCard title="Estratégia Comercial" eyebrow="Engenharia de oferta" icon={<Target className="h-4 w-4" />}>
          <ExecutiveTextBlock text={commercialText} dense />
        </ExecutiveModuleCard>
        <ExecutiveModuleCard title="Estratégia WhatsApp" eyebrow="Conversão" icon={<PhoneCall className="h-4 w-4" />}>
          <ExecutiveTextBlock text={whatsappText} dense />
        </ExecutiveModuleCard>
        <ExecutiveModuleCard title="Estratégia de Tráfego" eyebrow="Mídia paga" icon={<Megaphone className="h-4 w-4" />}>
          <ExecutiveTextBlock text={trafficText} dense />
        </ExecutiveModuleCard>
        <ExecutiveModuleCard title="Estratégia de Bundle" eyebrow="Ticket e margem" icon={<Sparkles className="h-4 w-4" />}>
          <ExecutiveTextBlock text={bundleText} dense />
        </ExecutiveModuleCard>
        <ExecutiveModuleCard title="Meta Esperada" eyebrow="Projeção" icon={<WalletCards className="h-4 w-4" />}>
          <ExecutiveTextBlock text={goalText} dense />
        </ExecutiveModuleCard>
      </div>

      <ExecutiveModuleCard title="Timeline de Execução" eyebrow="72 horas" icon={<Route className="h-4 w-4" />}>
        <TimelineModule parsed={parsed} />
      </ExecutiveModuleCard>

      <div className="grid gap-3 xl:grid-cols-2">
        <ExecutiveModuleCard title="Riscos Operacionais" eyebrow="Controle" icon={<AlertTriangle className="h-4 w-4" />}>
          <ExecutiveTextBlock text={riskText} dense />
        </ExecutiveModuleCard>
        <ExecutiveModuleCard title="Condição de Pausa/Escala" eyebrow="Governança" icon={<RadioTower className="h-4 w-4" />}>
          <ExecutiveTextBlock text={pauseScaleText} dense />
        </ExecutiveModuleCard>
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
      <p className="mb-1 font-semibold text-white/80">{label}</p>
      {payload.map((item, index) => (
        <p key={`${item.name}-${index}`} className="font-mono" style={{ color: item.color || "#E2E8F0" }}>
          {item.name}: {formatNumber(Number(item.value || 0))}
        </p>
      ))}
    </div>
  )
}

function InsightCard({ insight }: { insight: OrionInsight }) {
  const category = areaLabel(insight.category)
  const summary = humanizeOrionText(insight.insight)
  const situation = humanizeOrionText(insight.evidence)
  const impact = humanizeOrionText(insight.expected_impact)
  const suggestion = humanizeOrionText(insight.recommended_action)
  const actionTitle = humanizeOrionText(insight.action_title || insight.recommended_action)
  const actionSummary = humanizeOrionText(insight.action_summary || insight.expected_impact)

  return (
    <article className={cn("rounded-2xl border p-4 shadow-lg backdrop-blur", priorityClasses(insight.priority))}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <PriorityGlyph priority={insight.priority} className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{category}</p>
            <h3 className="mt-2 text-sm font-semibold leading-snug text-white">{humanizeOrionText(insight.title)}</h3>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold uppercase text-white/70">
          {priorityLabel(insight.priority)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-100">{summary}</p>
      <div className="mt-4 grid gap-3 text-xs leading-relaxed text-slate-300">
        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
          <p className="font-semibold text-white">Impacto</p>
          <p className="mt-1">{impact}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
          <p className="font-semibold text-white">Situação atual</p>
          <p className="mt-1">{situation}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
          <p className="font-semibold text-white">Sugestão da ORION</p>
          <p className="mt-1">{suggestion}</p>
        </div>
        {insight.future_actionable ? (
          <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3">
            <p className="font-semibold text-emerald-100">{actionTitle}</p>
            <p className="mt-1 text-emerald-100/75">{actionSummary}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function PriorityFocusCard({ focus }: { focus: OrionPriorityFocus }) {
  return (
    <section className={cn("rounded-3xl border p-5 shadow-2xl backdrop-blur", priorityClasses(focus.priority))}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
            <PriorityGlyph priority={focus.priority} className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Prioridade máxima da ORION</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{humanizeOrionText(focus.title)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{humanizeOrionText(focus.reason)}</p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
          {priorityLabel(focus.priority)}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Área</p>
          <p className="mt-2 text-sm font-semibold text-white">{areaLabel(focus.area)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Risco se ignorar</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{humanizeOrionText(focus.risk_if_ignored)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Próxima ação</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{humanizeOrionText(focus.next_action)}</p>
        </div>
      </div>
    </section>
  )
}

function DailyActionPlan({ actions, loading }: { actions: OrionActionPlanItem[]; loading: boolean }) {
  return (
    <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Plano de ação do dia</h2>
          <p className="mt-1 text-sm text-slate-400">A ORION organizou o que deve ser tratado primeiro.</p>
        </div>
        <ClipboardList className="h-5 w-5 text-sky-200" />
      </div>
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-sky-300/10 bg-slate-800/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {actions.map((action, index) => {
            return (
              <article key={`${action.title}-${index}`} className={cn("rounded-2xl border p-4 shadow-lg", priorityClasses(action.priority))}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 font-mono text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityGlyph priority={action.priority} className="h-4 w-4" />
                        <h3 className="text-sm font-semibold text-white">{humanizeOrionText(action.title)}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-200">{humanizeOrionText(action.reason)}</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-300"><span className="font-semibold text-white">Impacto:</span> {humanizeOrionText(action.expected_impact)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">
                      {areaLabel(action.area)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">
                      {priorityLabel(action.priority)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-relaxed text-slate-300">{humanizeOrionText(action.recommended_action)}</p>
                  <Button type="button" variant="outline" className="h-9 shrink-0 border-white/15 bg-white/5 text-xs text-white hover:bg-white/10">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Tratar agora
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function OrionChartPanel({ chart, interpretation }: { chart: OrionChart; interpretation?: OrionChartInterpretation }) {
  const height = 210
  const chartData = chart.data.map((point) => ({ ...point, label: humanizeChartLabel(point.label) }))
  return (
    <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-4 shadow-2xl shadow-black/25">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{chart.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{humanizeOrionText(interpretation?.interpretation || chart.insight)}</p>
        </div>
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
          {metricLabel(chart.metric)}
        </span>
      </div>
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height={height}>
          {chart.type === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={38} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="value" stroke="#38BDF8" strokeWidth={2.5} dot={false} />
            </LineChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={3}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
            </PieChart>
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
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke="#38BDF8" strokeWidth={2.5} fill={`url(#orion-${chart.metric})`} />
            </AreaChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={38} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[8, 8, 2, 2]} fill="#38BDF8" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="mt-4 rounded-2xl border border-sky-300/15 bg-sky-300/5 p-3">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-200">
          <RadioTower className="h-3.5 w-3.5" />
          Leitura ORION
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">{humanizeOrionText(interpretation?.interpretation || chart.insight)}</p>
      </div>
    </section>
  )
}

export function OrionClient() {
  const [payload, setPayload] = useState<OrionApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [question, setQuestion] = useState("")
  const [error, setError] = useState<string | null>(null)
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
    const response = await fetch("/api/orion/analysis", { cache: "no-store" })
    const json = await response.json() as ApiResponse
    if (!response.ok || !json.data) {
      setError(json.error?.message || "Não foi possível carregar a ORION AI.")
    } else {
      setPayload(json.data)
      primeChat(json.data)
    }
    setLoading(false)
  }

  async function runExecutive(force = true) {
    setGenerating(true)
    setError(null)
    try {
      const response = await fetch("/api/orion/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "executive", force }),
      })
      const json = await response.json() as ApiResponse
      if (json.data) setPayload(json.data)
      if (json.error?.message) setError(json.error.message)
    } catch {
      setError("A ORION não conseguiu concluir a análise agora. Tente novamente em instantes.")
    } finally {
      setGenerating(false)
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
        body: JSON.stringify({ mode: "chat", message: trimmed }),
      })
      const json = await response.json() as ApiResponse
      if (json.data) {
        setPayload(json.data)
        setMessages((current) => [...current, {
          role: "orion",
          content: humanizeOrionText(json.data?.analysis.executive_summary || json.data?.analysis.summary || "Análise concluída."),
          source: json.data?.operationalContext ? "operational" : "overview",
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
    fetch("/api/orion/analysis", { cache: "no-store" })
      .then((response) => response.json().then((json: ApiResponse) => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return
        if (!ok || !json.data) {
          setError(json.error?.message || "Não foi possível carregar a ORION AI.")
        } else {
          setPayload(json.data)
          primeChat(json.data)
        }
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar a ORION AI.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const allInsights = useMemo(() => {
    if (!payload) return []
    const raw = [
      ...payload.analysis.alerts,
      ...payload.analysis.recommendations,
      ...payload.analysis.risks,
      ...payload.analysis.opportunities,
    ]
    // The server already limits and clusters this using Dominant Thesis.
    // Client-side just enforces the strict max visible cards (5).
    return raw.slice(0, 5)
  }, [payload])

  const chartInterpretations = useMemo(() => {
    const map = new Map<string, OrionChartInterpretation>()
    for (const item of payload?.analysis.chart_interpretations || []) {
      map.set(`${item.title}-${item.metric}`, item)
      map.set(item.metric, item)
    }
    return map
  }, [payload])

  const executive = payload?.snapshot.executive

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

  if (!payload || !executive) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || "ORION AI indisponível."}
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] overflow-hidden bg-[#05070d] text-slate-100 shadow-2xl shadow-black/30">
      <div className="border-b border-[#1e293b] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-300/10 shadow-lg shadow-sky-500/10">
                <BrainCircuit className="h-6 w-6 text-sky-200" />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">ORION AI</h1>
                <p className="text-sm font-semibold text-slate-400">by NOBRETECH</p>
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-200">
              Inteligência estratégica para decisões melhores.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-semibold text-sky-100">
                Dados internos da Nobretech
              </span>
              {(generating || chatLoading) ? (
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100 shadow-lg shadow-emerald-500/10">
                  <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                  Analisando estoque, CRM, campanhas e caixa...
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={loadOverview}
              className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar dados
            </Button>
            <Button
              type="button"
              onClick={() => runExecutive(true)}
              isLoading={generating}
              className="bg-sky-300 text-slate-950 hover:bg-sky-200"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "ORION analisando..." : "Gerar análise"}
            </Button>
          </div>
        </div>
        {error ? (
          <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-4 lg:p-8">
        {payload.analysis.metrics.map((metric) => (
          <section key={metric.label} className="rounded-3xl border border-[#243044] bg-[#0b1220] p-4 shadow-lg shadow-black/15">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{metric.label}</p>
            <p className={cn("mt-3 text-2xl font-semibold", toneClasses(metric.tone))}>{metric.value}</p>
            <p className="mt-2 min-h-4 text-xs text-slate-400">{metric.delta || "Monitorado pela ORION"}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)] lg:px-8">
        <main className="space-y-6">
          <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5 shadow-2xl shadow-black/20">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-300/10 text-sky-200">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Resumo executivo</p>
                <p className="mt-2 text-lg leading-relaxed text-slate-100">{humanizeOrionText(payload.analysis.executive_summary || payload.analysis.summary)}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-4">
                <WalletCards className="h-4 w-4 text-emerald-300" />
                <p className="mt-3 text-xs text-slate-400">Caixa</p>
                <p className="mt-1 font-mono text-lg text-white">{formatBRL(executive.cashBalance)}</p>
              </div>
              <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-4">
                <Gauge className="h-4 w-4 text-sky-300" />
                <p className="mt-3 text-xs text-slate-400">Ticket médio</p>
                <p className="mt-1 font-mono text-lg text-white">{formatBRL(executive.averageTicket30d)}</p>
              </div>
              <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-4">
                <Target className="h-4 w-4 text-amber-300" />
                <p className="mt-3 text-xs text-slate-400">Conversão CRM</p>
                <p className="mt-1 font-mono text-lg text-white">{executive.conversionRate30d}%</p>
              </div>
              <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-4">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                <p className="mt-3 text-xs text-slate-400">Estoque parado</p>
                <p className="mt-1 font-mono text-lg text-white">{executive.stuckStockCount}</p>
              </div>
            </div>
          </section>

          <PriorityFocusCard focus={payload.analysis.priority_focus} />

          <DailyActionPlan actions={payload.analysis.daily_action_plan} loading={generating} />

          <section className="grid gap-4 xl:grid-cols-2">
            {payload.analysis.charts.slice(0, 4).map((chart) => (
              <OrionChartPanel
                key={`${chart.title}-${chart.metric}`}
                chart={chart}
                interpretation={chartInterpretations.get(`${chart.title}-${chart.metric}`) || chartInterpretations.get(chart.metric)}
              />
            ))}
          </section>

          <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Central de recomendações</h2>
                <p className="mt-1 text-sm text-slate-400">Prioridades práticas para a operação desta semana.</p>
              </div>
              <Zap className="h-5 w-5 text-amber-200" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {allInsights.length ? allInsights.map((insight) => (
                <InsightCard key={`${insight.category}-${insight.title}`} insight={insight} />
              )) : (
                <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-5 text-sm text-slate-300">
                  Sem alertas críticos no momento. Gere uma nova análise para aprofundar.
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5 shadow-2xl shadow-black/25">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Chat ORION</h2>
                <p className="mt-1 text-xs text-slate-400">Pergunte sobre estoque, CRM, margem, campanhas ou caixa.</p>
              </div>
              <MessageSquareText className="h-5 w-5 text-sky-200" />
            </div>
            <div className="h-[560px] max-h-[74vh] space-y-3 overflow-y-auto rounded-2xl border border-[#243044] bg-[#060b14] p-3 sm:h-[620px]">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "text-sm leading-relaxed",
                    message.role === "user" ? "max-w-[88%] rounded-2xl bg-sky-300 px-3 py-2 text-slate-950" : "w-full max-w-full"
                  )}>
                    {message.role === "orion" && message.source === "operational" ? (
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                        <Database className="h-3 w-3" />
                        Consulta operacional
                      </div>
                    ) : null}
                    {message.role === "orion" ? (
                      <ExecutiveDecisionResponse content={message.content} />
                    ) : humanizeOrionText(message.content)}
                  </div>
                </div>
              ))}
              {chatLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-[#243044] bg-[#111a2b] px-3 py-2 text-sm text-slate-300">
                    <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                    ORION analisando dados internos
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendQuestion()
                }}
                placeholder="Qual produto devo priorizar hoje?"
                className="min-w-0 flex-1 rounded-2xl border border-[#243044] bg-[#060b14] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/70"
              />
              <Button type="button" size="icon" onClick={sendQuestion} disabled={chatLoading || !question.trim()} className="h-12 w-12 bg-sky-300 text-slate-950 hover:bg-sky-200">
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Controle de uso</h2>
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-3">
                <p className="text-[11px] text-slate-400">Chamadas no mês</p>
                <p className="mt-2 font-mono text-xl text-white">{payload.usage.callsThisMonth}</p>
              </div>
              <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-3">
                <p className="text-[11px] text-slate-400">Processamento</p>
                <p className="mt-2 font-mono text-xl text-white">{formatNumber(payload.usage.totalTokensThisMonth)}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs text-slate-400">
              <p className="flex items-center gap-2"><Database className="h-3.5 w-3.5" /> Histórico: {payload.config.logTableReady ? "ativo" : "aguardando configuração"}</p>
              <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Atualização inteligente: {payload.config.cacheMinutes} min</p>
              <p>Modo: {payload.config.openaiConfigured ? "Análise completa" : "Análise local"}</p>
              <p>Custo estimado: {payload.usage.estimatedCostUsdThisMonth == null ? "sem chamadas externas registradas este mês" : formatUSD(payload.usage.estimatedCostUsdThisMonth)}</p>
            </div>
          </section>

          <section className="rounded-3xl border border-[#243044] bg-[#0b1220] p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Histórico de análises</h2>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-3">
              {payload.history.length ? payload.history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#243044] bg-[#111a2b] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{analysisTypeLabel(item.analysisType)}</p>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{statusLabel(item.status)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300">{humanizeOrionText(item.question || item.summary)}</p>
                  <p className="mt-2 font-mono text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-[#243044] bg-[#111a2b] p-4 text-sm text-slate-400">
                  Nenhum histórico salvo ainda.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
