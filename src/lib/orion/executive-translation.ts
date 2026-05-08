import type {
  OrionActionPlanItem,
  OrionAnalysis,
  OrionChart,
  OrionChartInterpretation,
  OrionInsight,
  OrionMetric,
  OrionPriorityFocus,
} from "@/lib/orion/types"

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

const TECHNICAL_LABELS: Record<string, string> = {
  hot_negotiation: "negociação avançada",
  warm_negotiation: "negociação em aquecimento",
  cold_lead: "lead frio",
  table_sent: "tabela enviada",
  in_service: "em atendimento",
  new_lead: "lead novo",
  contacted: "contato realizado",
  lost: "perdidos",
  sold: "convertidos",
  active: "ativo",
  in_stock: "em estoque",
  reserved: "reservado",
  pending: "pendente",
  owner_equity: "movimentação societária",
  reconciled_balance_after: "saldo real reconciliado",
  finance_accounts: "saldo das contas financeiras",
}

const FORBIDDEN_TERMS = [
  "reconciledCashBalance",
  "operationalCashFlow30d",
  "ownerEquityMovement30d",
  "accountCashBalance",
  "marginPct",
  "daysInStock",
  "quantity",
  "leadFunnel",
  "hot_negotiation",
  "skuScore",
  "inventoryScore",
  "campaignSpend",
  "roiPct",
  "weeklyRevenue",
  "marginTrend",
  "activeItems",
  "totalItems",
  "agingBuckets",
  "reconciledIncome30d",
]

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function formatCurrency(value: number) {
  return moneyFormatter.format(value)
}

function number(value: string | undefined) {
  if (!value) return 0
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function humanizeDaysInStock(days: number) {
  if (days <= 0) return "produto recém-adicionado"
  if (days <= 3) return "entrada recente"
  if (days <= 10) return `há ${days} dias em estoque`
  if (days <= 17) return "há quase 2 semanas em estoque"
  if (days <= 30) return "há algumas semanas em estoque"
  if (days <= 45) return "há mais de 1 mês em estoque"
  return "há mais de 45 dias em estoque"
}

export function humanizeMargin(value: number) {
  if (value < 8) return "margem apertada"
  if (value < 15) return "margem moderada"
  if (value <= 25) return "margem saudável"
  return "margem muito confortável"
}

export function humanizeStockQuantity(quantity: number) {
  if (quantity <= 1) return "última unidade disponível"
  if (quantity <= 3) return "estoque limitado"
  if (quantity <= 10) return "estoque saudável"
  return "estoque amplo"
}

export function humanizeCashPosition(cashBalance: number, activeStockValue = 0) {
  if (cashBalance <= 0) return "Evite campanhas agressivas e preserve liquidez"
  if (activeStockValue > 0 && cashBalance < activeStockValue * 0.18) return "Priorize ações comerciais leves antes de recomprar"
  if (cashBalance < 3000) return "Seu caixa atual suporta apenas ações comerciais leves"
  return "Há espaço para acelerar aquisição e tráfego com controle"
}

export function humanizeChartLabel(label: string) {
  const normalized = normalizeKey(label).replace(/\s+/g, "_")
  return TECHNICAL_LABELS[normalized] || label.replace(/_/g, " ")
}

export function hasForbiddenOrionTerm(value: string) {
  return FORBIDDEN_TERMS.some((term) => new RegExp(`\\b${term}\\b`, "i").test(value))
}

function humanizeTechnicalCashText(text: string) {
  if (!/\b(reconciledCashBalance|operationalCashFlow30d|accountCashBalance)\b/i.test(text)) return text
  const cash = number(text.match(/reconciledCashBalance\s*R?\$?\s*([\d.,-]+)/i)?.[1])
  const flow = number(text.match(/operationalCashFlow30d\s*R?\$?\s*([\d.,-]+)/i)?.[1])
  const parts = []
  if (cash) parts.push(`Caixa real reconciliado em ${formatCurrency(cash)}.`)
  if (flow) {
    parts.push(flow > 0
      ? "Fluxo operacional recente segue positivo."
      : "Fluxo operacional recente pede atenção.")
  }
  parts.push(`${humanizeCashPosition(cash)}.`)
  return parts.join(" ")
}

export function humanizeOrionText(value: string | null | undefined) {
  if (!value) return ""
  const cashTranslated = humanizeTechnicalCashText(value)
  return cashTranslated
    .replace(/\bSKUs?\b/gi, "produtos")
    .replace(/\bdaysInStock\s*[:=]?\s*(\d+)/gi, (_match, days) => humanizeDaysInStock(Number(days)))
    .replace(/\bmarginPct\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/gi, (_match, margin) => humanizeMargin(Number(String(margin).replace(",", "."))))
    .replace(/\bquantity\s*[:=]?\s*(\d+)/gi, (_match, qty) => humanizeStockQuantity(Number(qty)))
    .replace(/\breconciledCashBalance\b/gi, "caixa real reconciliado")
    .replace(/\boperationalCashFlow30d\b/gi, "fluxo operacional recente")
    .replace(/\bownerEquityMovement30d\b/gi, "movimentações societárias recentes")
    .replace(/\baccountCashBalance\b/gi, "saldo das contas financeiras")
    .replace(/\bleadFunnel\b/gi, "funil comercial")
    .replace(/\bcampaignSpend\b/gi, "investimento de campanha")
    .replace(/\broiPct\b/gi, "retorno da campanha")
    .replace(/\bskuScore\b|\binventoryScore\b/gi, "prioridade comercial")
    .replace(/\bweeklyRevenue\b/gi, "receita semanal inconsistente")
    .replace(/\bmarginTrend\b/gi, "dados financeiros incompletos")
    .replace(/\bactiveItems\b/gi, "status operacional precisa validação")
    .replace(/\btotalItems\b|\bagingBuckets\b/gi, "relatórios divergentes")
    .replace(/\breconciledIncome30d\b/gi, "fluxo operacional sem confirmação")
    .replace(/\b30d\b/gi, "últimos 30 dias")
    .replace(/dia\(s\)/gi, "dias")
    .replace(/lead\(s\)/gi, "leads")
    .replace(/venda\(s\)/gi, "vendas")
    .replace(/item\(ns\)/gi, "itens")
    .replace(/\b[A-Za-z]+(?:\.[A-Za-z0-9_]+)+\b/g, "dados internos")
    .replace(/\b[a-z]+_[a-z0-9_]+\b/g, (match) => humanizeChartLabel(match))
    .replace(/\s*;\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
}

function translateInsight(insight: OrionInsight): OrionInsight {
  return {
    ...insight,
    title: humanizeOrionText(insight.title),
    category: humanizeChartLabel(insight.category),
    insight: humanizeOrionText(insight.insight),
    evidence: humanizeOrionText(insight.evidence),
    recommended_action: humanizeOrionText(insight.recommended_action),
    expected_impact: humanizeOrionText(insight.expected_impact),
    risk: humanizeOrionText(insight.risk),
    action_title: humanizeOrionText(insight.action_title),
    action_summary: humanizeOrionText(insight.action_summary),
  }
}

function translateAction(action: OrionActionPlanItem): OrionActionPlanItem {
  return {
    ...action,
    title: humanizeOrionText(action.title),
    area: humanizeChartLabel(action.area),
    reason: humanizeOrionText(action.reason),
    expected_impact: humanizeOrionText(action.expected_impact),
    recommended_action: humanizeOrionText(action.recommended_action),
  }
}

function translateFocus(focus: OrionPriorityFocus): OrionPriorityFocus {
  return {
    ...focus,
    title: humanizeOrionText(focus.title),
    area: humanizeChartLabel(focus.area),
    reason: humanizeOrionText(focus.reason),
    risk_if_ignored: humanizeOrionText(focus.risk_if_ignored),
    next_action: humanizeOrionText(focus.next_action),
  }
}

function translateMetric(metric: OrionMetric): OrionMetric {
  return {
    ...metric,
    label: humanizeChartLabel(humanizeOrionText(metric.label)),
    value: humanizeOrionText(metric.value),
    delta: metric.delta ? humanizeOrionText(metric.delta) : undefined,
  }
}

function translateChart(chart: OrionChart): OrionChart {
  return {
    ...chart,
    title: humanizeOrionText(chart.title),
    metric: humanizeChartLabel(chart.metric),
    insight: humanizeOrionText(chart.insight),
    data: chart.data.map((point) => ({
      ...point,
      label: humanizeChartLabel(point.label),
    })),
  }
}

function translateChartInterpretation(interpretation: OrionChartInterpretation): OrionChartInterpretation {
  return {
    ...interpretation,
    title: humanizeOrionText(interpretation.title),
    metric: humanizeChartLabel(interpretation.metric),
    interpretation: humanizeOrionText(interpretation.interpretation),
  }
}

export function translateOrionAnalysisForExecutive(analysis: OrionAnalysis): OrionAnalysis {
  return {
    ...analysis,
    summary: humanizeOrionText(analysis.summary),
    executive_summary: humanizeOrionText(analysis.executive_summary),
    priority_focus: translateFocus(analysis.priority_focus),
    daily_action_plan: analysis.daily_action_plan.map(translateAction),
    alerts: analysis.alerts.map(translateInsight),
    recommendations: analysis.recommendations.map(translateInsight),
    chart_interpretations: analysis.chart_interpretations.map(translateChartInterpretation),
    risks: analysis.risks.map(translateInsight),
    opportunities: analysis.opportunities.map(translateInsight),
    metrics: analysis.metrics.map(translateMetric),
    charts: analysis.charts.map(translateChart),
  }
}
