import "server-only"

import crypto from "crypto"
import { pool } from "@/lib/db"
import { buildLedgerSnapshot, logLedgerDebug } from "@/lib/financial/ledger-balance-engine"
import { buildMoneyClassificationSnapshot, classifyTransaction } from "@/lib/financial/money-classification-engine"
import { buildRealProfitSnapshot } from "@/lib/financial/real-profit-engine"
import { buildWorkingCapitalSnapshot } from "@/lib/financial/working-capital-engine"
import { buildFinancialScenarioSnapshot } from "@/lib/financial/financial-scenario-separation"
import { buildInventoryLiquidityQuality } from "@/lib/financial/inventory-liquidity-quality"
import { buildFinancialConfidenceBreakdown } from "@/lib/financial/financial-confidence-breakdown"
import {
  buildProfitAvailabilitySnapshot,
  resolveProfitAvailabilityPeriod,
  type ResolveProfitAvailabilityPeriodInput,
} from "@/lib/financial/profit-availability-engine"
import { buildCurrentCashCompositionSnapshot } from "@/lib/financial/current-cash-composition-engine"
import { buildOwnerCapitalSnapshot } from "@/lib/financial/owner-capital-engine"
import { buildFinancialOperationalContext } from "@/lib/orion/financial-context-consumer"
import { estimateOpenAICostUsd } from "@/lib/orion/cost"
import {
  humanizeChartLabel,
  humanizeDaysInStock,
  humanizeMargin,
  humanizeOrionText,
} from "@/lib/orion/executive-translation"
import { filterOperationalStock } from "@/lib/orion/inventory-filter"
import { classifyLead, isActionableLead } from "@/lib/orion/lead-classification"
import { enrichAnalysisWithConfidence } from "@/lib/orion/confidence-engine"
import { deduplicateAnalysis } from "@/lib/orion/insight-deduplication"
import { composeProductLabel } from "@/lib/orion/product-label"
import { getInventoryCapitalValue, getInventoryCostBreakdown } from "@/lib/inventory/costing"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import { calculateOperationalHealth } from "./operational-health-engine"
import type { OperationalHealthScore } from "./operational-health-engine"
import type {
  OrionActionPlanItem,
  OrionAnalysis,
  OrionChart,
  OrionChartInterpretation,
  OrionHistoryItem,
  OrionInsight,
  OrionOperationalContext,
  OrionPriorityFocus,
  OrionSnapshot,
  OrionUsageSummary,
} from "@/lib/orion/types"

const CACHE_MINUTES = 30

type SaleRow = {
  id: string
  inventory_id: string | null
  sale_date: string
  sale_price: string | number | null
  net_amount: string | number | null
  supplier_cost: string | number | null
  notes: string | null
  sale_status: string | null
  payment_method: string | null
  warranty_months: string | number | null
  trade_in_id: string | null
  trade_in_value: string | number | null
  trade_in_linked_inventory_id: string | null
  marketing_campaign_id: string | null
  marketing_lead_id: string | null
  sale_origin: string | null
  purchase_price: string | number | null
  purchase_date: string | null
  product_name: string | null
  product_category: string | null
}

type AdditionalItemRow = {
  id: string
  sale_id: string
  product_id: string | null
  type: string
  cost_price: string | number | null
  sale_price: string | number | null
  profit: string | number | null
  purchase_date: string | null
}

type SalePaymentRow = {
  id: string
  sale_id: string
  payment_method: string | null
  amount: string | number | null
  status: string | null
}

type CampaignRow = {
  id: string
  name: string
  channel: string
  budget_amount: string | number | null
  actual_spend: string | number | null
}

type LeadRow = {
  id: string
  campaign_id: string | null
  name: string
  source: string | null
  origin: string | null
  status: string
  product_interest: string | null
  next_action: string | null
  next_action_at: string | null
  created_at: string
}

type TransactionRow = {
  id: string
  type: string
  category: string | null
  description: string | null
  amount: string | number | null
  date: string | null
  due_date: string | null
  created_at: string | null
  status: string | null
  source_type: string | null
  source_id: string | null
  sale_id: string | null
  chart_account_name: string | null
  chart_financial_type: string | null
  chart_affects_inventory: boolean | null
  chart_affects_owner_equity: boolean | null
  chart_statement_section: string | null
}

type MovementRow = {
  id: string
  account_id: string | null
  movement_date: string
  created_at: string
  type: string
  category: string | null
  amount: string | number | null
  balance_after: string | number | null
  source: string | null
  source_id: string | null
  is_canceled: boolean | null
  transaction_status: string | null
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value)
}

function pct(value: number) {
  return `${round(value, 1).toLocaleString("pt-BR")}%`
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dateKeyFromValue(value: string | null | undefined) {
  if (!value) return ""
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return ""
  return dateKey(parsed)
}

function daysBetweenDates(from: string | null | undefined, to = new Date()) {
  if (!from) return 0
  const parsed = new Date(from)
  if (!Number.isFinite(parsed.getTime())) return 0
  return Math.max(0, Math.floor((to.getTime() - parsed.getTime()) / 86400000))
}

function safeName(parts: Array<string | null | undefined>) {
  const label = parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ")
  return label || "Produto sem nome"
}

export { composeProductLabel }

function normalizeBusinessKey(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase().normalize("NFD")
  const chars = Array.from(normalized).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= 768 && code <= 879) return ""
    if (char >= "a" && char <= "z") return char
    if (char >= "0" && char <= "9") return char
    return " "
  })
  return chars.join("").split(" ").filter(Boolean).join(" ")
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function weekLabel(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`
}

function pushInsight(
  list: OrionInsight[],
  input: Omit<OrionInsight, "action_title" | "action_summary" | "action_priority" | "future_actionable" | "confidence_score"> & {
    action_title?: string
    action_summary?: string
    action_priority?: OrionInsight["action_priority"]
    future_actionable?: boolean
    confidence_score?: number
  }
) {
  list.push({
    action_title: input.recommended_action.slice(0, 80),
    action_summary: input.expected_impact,
    action_priority: input.priority,
    future_actionable: true,
    confidence_score: 0.82,
    ...input,
  })
}

const priorityWeight = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const

function strongestInsight(analysis: Pick<OrionAnalysis, "alerts" | "risks" | "recommendations" | "opportunities">) {
  return [
    ...analysis.alerts,
    ...analysis.risks,
    ...analysis.recommendations,
    ...analysis.opportunities,
  ].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority])[0]
}

function buildChartInterpretations(snapshot: OrionSnapshot): OrionChartInterpretation[] {
  const revenue = snapshot.sales.weeklyRevenue
  const lastRevenue = revenue.at(-1)?.value || 0
  const previousRevenue = revenue.at(-2)?.value || 0
  const margin = snapshot.sales.marginTrend
  const lastMargin = margin.at(-1)?.value || 0
  const oldStock = snapshot.stock.agingBuckets.find((bucket) => bucket.label === "46+d")?.value || 0
  const leadFunnelTotal = snapshot.marketing.leadFunnel.reduce((sum, point) => sum + point.value, 0)
  const targetStock = snapshot.stock.stuckItems[0]
  const targetLead = snapshot.marketing.forgottenLeads[0]
  const leadDetail = targetLead
    ? `${targetLead.name}${targetLead.productInterest ? ` demonstrou interesse em ${targetLead.productInterest}` : ""}${targetLead.campaignName ? ` pela campanha ${targetLead.campaignName}` : ""}.`
    : ""

  return [
    {
      title: "Vendas por semana",
      metric: "revenue",
      interpretation: lastRevenue < previousRevenue
        ? "A última semana perdeu tração. Revise CRM e campanha antes de buscar novos gastos."
        : "Movimento recente monitorado. Use este gráfico para confirmar aceleração antes de ampliar campanha.",
    },
    {
      title: "Margem por semana",
      metric: "margin",
      interpretation: lastMargin < 15
        ? "Margem pressionada. Evite desconto agressivo até entender custo e condição de pagamento."
        : "Margem sob controle. O próximo ganho vem de priorizar produtos com melhor giro e lucro.",
    },
    {
      title: "Funil de leads",
      metric: "leads",
      interpretation: leadFunnelTotal
        ? targetLead
          ? `Comece pelo CRM: ${leadDetail} Envie uma mensagem direta hoje antes de abrir nova campanha.`
          : "O funil precisa virar rotina diária. Leads parados devem ser tratados antes de nova campanha."
        : "CRM sem volume suficiente para leitura segura. Cadastre origem, estágio e próxima ação dos leads.",
    },
    {
      title: "Estoque por idade",
      metric: "items",
      interpretation: oldStock
        ? targetStock
          ? `Sugiro campanha de 48h para ${targetStock.name}: anuncie por ${brl(targetStock.suggestedPrice)} e use garantia, parcelamento e pronta entrega antes de reduzir preço.`
          : "Itens acima de 46 dias pedem campanha controlada para liberar capital sem destruir margem."
        : snapshot.sales.topProducts[0]
          ? `Estoque saudável. Para acelerar sem desconto amplo, anuncie hoje ${snapshot.sales.topProducts[0].label} com CTA para WhatsApp e parcelamento.`
          : "Estoque saudável. Mantenha giro com ofertas seletivas e CTA direto para WhatsApp.",
    },
  ]
}

function makePriorityFocus(analysis: OrionAnalysis, snapshot: OrionSnapshot, health?: OperationalHealthScore): OrionPriorityFocus {
  const strongest = strongestInsight(analysis)
  if (strongest) {
    return {
      title: strongest.title,
      area: strongest.category,
      priority: strongest.priority,
      reason: strongest.insight,
      risk_if_ignored: strongest.risk,
      next_action: strongest.recommended_action,
    }
  }

  const operationalHealth = health || calculateOperationalHealth(snapshot)

  if (operationalHealth.level === "critical") {
    return {
      title: "Otimizar caixa e focar em giro",
      area: "caixa",
      priority: "critical",
      reason: operationalHealth.healthReason,
      risk_if_ignored: "Uma recompra agressiva pode pressionar liquidez e travar obrigações próximas.",
      next_action: purchaseAction(snapshot),
    }
  }

  if (operationalHealth.level === "attention" && snapshot.executive.cashBalance < 0) {
    return {
      title: "Otimizar caixa sem parar giro",
      area: "caixa",
      priority: "high",
      reason: operationalHealth.healthReason,
      risk_if_ignored: "Expandir despesas agora pode forçar desconto para gerar liquidez urgente.",
      next_action: purchaseAction(snapshot),
    }
  }

  return {
    title: "Aumentar ritmo comercial com controle",
    area: "venda",
    priority: "medium",
    reason: "A operação está funcional. O foco é converter melhor sem perder margem.",
    risk_if_ignored: "A operação pode ficar apenas reativa e perder oportunidades de giro saudável.",
    next_action: "Escolher um produto de boa margem, revisar leads ativos e rodar uma campanha segura.",
  }
}

function buildExecutiveSummary(focus: OrionPriorityFocus, snapshot: OrionSnapshot) {
  if (focus.area.toLowerCase().includes("crm")) {
    return `O principal gargalo hoje está no CRM. Existem ${snapshot.executive.leadsWithoutFollowUp} leads sem follow-up e isso precisa ser tratado antes de abrir nova campanha.`
  }
  if (focus.area.toLowerCase().includes("caixa") || focus.area.toLowerCase().includes("financeiro")) {
    return "O caixa pede cautela. A prioridade é preservar liquidez e transformar pipeline em venda antes de uma recompra agressiva."
  }
  if (focus.area.toLowerCase().includes("estoque")) {
    return "A ORION vê capital parado no estoque. O foco de hoje deve ser girar os itens mais antigos sem sacrificar margem."
  }
  if (focus.area.toLowerCase().includes("campanha")) {
    return "Campanhas precisam de ajuste fino. Escale apenas o que tem evidência de ROI e corte dispersão de verba."
  }
  return `A operação está monitorada. A prioridade agora é ${focus.title.toLowerCase()} com ação objetiva ainda hoje.`
}

function primaryCommercialProduct(snapshot: OrionSnapshot) {
  return snapshot.stock.stuckItems[0] || null
}

function leadActionText(snapshot: OrionSnapshot) {
  const lead = snapshot.marketing.forgottenLeads.find((item) => item.classification !== "lost")
  if (!lead) {
    return "Agora: mantenha o CRM limpo e cadastre próxima ação apenas para leads com intenção ativa."
  }
  const product = lead.productInterest ? ` sobre ${lead.productInterest}` : ""
  const campaign = lead.campaignName ? ` da campanha ${lead.campaignName}` : ""
  return `Agora: comece por ${lead.name}${product}${campaign}. Envie: "Oi, ${lead.name}. Vi seu interesse${product}. Tenho uma condição pronta entrega com garantia e parcelamento. Quer que eu te mande as opções agora?"`
}

function leadCountText(count: number) {
  return count === 1 ? "Existe 1 lead" : `Existem ${count} leads`
}

function calibratedStockPriority(
  item: OrionSnapshot["stock"]["stuckItems"][number],
  health: OperationalHealthScore,
  snapshot: OrionSnapshot
): OrionInsight["priority"] {
  const forecast = snapshot.executive.liquidityForecast
  const pressureImmediate = forecast.pressureWindowStartDays === 0
    || (forecast.pressureWindowStartDays !== null && forecast.pressureWindowStartDays <= 7)
    || forecast.overduePayables > forecast.overdueReceivables
  const remainingMarginPct = item.suggestedPrice > 0 && item.purchasePrice > 0
    ? ((item.suggestedPrice - item.purchasePrice) / item.suggestedPrice) * 100
    : 0
  const hasDiscountRoom = remainingMarginPct >= 8 && item.suggestedPrice > item.purchasePrice
  const slowSku = item.daysInStock >= 46

  if (slowSku && hasDiscountRoom && pressureImmediate && (health.level === "critical" || health.level === "attention")) {
    return "critical"
  }
  if (item.daysInStock >= 31) return "high"
  return "medium"
}

function stockCampaignAction(snapshot: OrionSnapshot) {
  const item = primaryCommercialProduct(snapshot)
  if (!item) {
    const demand = snapshot.sales.topProducts[0]?.label
    return demand
      ? `use ${demand} apenas como sinal de demanda histórica e anuncie somente produtos atualmente ativos no estoque.`
      : "anuncie somente produtos atualmente ativos no estoque, com garantia, parcelamento e chamada para WhatsApp."
  }
  const safePrice = item.suggestedPrice || item.purchasePrice
  return `faça uma campanha de 48h para ${item.name} por ${brl(safePrice)}. Use story + WhatsApp, destaque garantia, parcelamento e pronta entrega; só reduza preço se não houver resposta.`
}

function marginAction(snapshot: OrionSnapshot) {
  const item = primaryCommercialProduct(snapshot)
  if (item) {
    const minimumPrice = item.purchasePrice > 0 ? brl(item.purchasePrice * 1.08) : "o piso calculado pelo custo"
    return `Agora: antes de negociar ${item.name}, defina piso mínimo de ${minimumPrice} e ofereça brinde/parcelamento antes de desconto.`
  }
  const demand = snapshot.sales.topProducts.slice(0, 2).map((item) => item.label).join(" e ")
  return demand
    ? `Agora: use ${demand} apenas como referência de demanda e defina piso somente para itens ativos no estoque antes de autorizar oferta.`
    : "Agora: defina piso somente para itens ativos no estoque antes de autorizar oferta."
}

function purchaseAction(snapshot: OrionSnapshot) {
  const product = primaryCommercialProduct(snapshot)
  const fastProducts = snapshot.sales.topProducts.slice(0, 3).map((item) => item.label).filter(Boolean)
  const fastLine = fastProducts.length ? ` Histórico de vendas indica demanda por: ${fastProducts.join(", ")}.` : ""
  if (!product) {
    return `Agora: pause compras amplas e anuncie somente itens ativos no estoque. ${fastLine}`.trim()
  }
  return `Agora: pause compras amplas e libere caixa vendendo ${product.name} primeiro. Para acelerar, ${stockCampaignAction(snapshot)}${fastLine}`
}

function buildDailyActionPlan(snapshot: OrionSnapshot, health?: OperationalHealthScore): OrionActionPlanItem[] {
  const actions: OrionActionPlanItem[] = []

  if (snapshot.executive.leadsWithoutFollowUp > 0) {
    actions.push({
      title: "Reengajar leads acionáveis sem follow-up",
      area: "CRM",
      priority: snapshot.executive.leadsWithoutFollowUp >= 10 ? "high" : "medium",
      reason: snapshot.executive.leadsWithoutFollowUp === 1
        ? "Existe 1 lead interno sem próxima ação clara."
        : `Existem ${snapshot.executive.leadsWithoutFollowUp} leads internos sem próxima ação clara.`,
      expected_impact: "Aumentar chance de conversão ainda hoje com baixo custo incremental.",
      recommended_action: leadActionText(snapshot),
    })
  }

  const operationalHealth = health || calculateOperationalHealth(snapshot)
  if (operationalHealth.level === "critical" || operationalHealth.level === "attention") {
    actions.push({
      title: "Evitar recompra agressiva",
      area: "caixa",
      priority: operationalHealth.level === "critical" ? "critical" : "high",
      reason: operationalHealth.healthReason,
      expected_impact: "Preservar liquidez e reduzir risco de compra sem giro imediato.",
      recommended_action: purchaseAction(snapshot),
    })
  }

  if (snapshot.stock.stuckItems.length > 0) {
    const item = snapshot.stock.stuckItems[0]
    actions.push({
      title: "Girar estoque parado com campanha controlada",
      area: "estoque",
      priority: calibratedStockPriority(item, operationalHealth, snapshot),
      reason: `${item.name} está ${humanizeDaysInStock(item.daysInStock)}.`,
      expected_impact: "Liberar capital parado sem transformar desconto em hábito.",
      recommended_action: `Agora: ${stockCampaignAction(snapshot)}`,
    })
  }

  if (snapshot.marketing.campaigns.some((campaign) => campaign.roi > 1.5)) {
    const campaign = [...snapshot.marketing.campaigns].sort((a, b) => b.roi - a.roi)[0]
    actions.push({
      title: "Replicar campanha com melhor ROI",
      area: "campanha",
      priority: "medium",
      reason: `${campaign.name} concentra o melhor ROI do snapshot, com ${round(campaign.roi, 2)}x.`,
      expected_impact: "Escalar o que já provou retorno antes de testar novas mensagens.",
      recommended_action: "Agora: repetir o criativo vencedor por 48h com orçamento controlado e medir conversas no WhatsApp.",
    })
  }

  if (snapshot.executive.marginPct30d < 15) {
    actions.push({
      title: "Proteger margem antes de acelerar vendas",
      area: "financeiro",
      priority: "high",
      reason: `A operação está com ${humanizeMargin(snapshot.executive.marginPct30d)}.`,
      expected_impact: "Evitar crescimento com lucro fraco.",
      recommended_action: marginAction(snapshot),
    })
  }

  if (!actions.length) {
    actions.push({
      title: "Acelerar produto com maior potencial",
      area: "venda",
      priority: "medium",
      reason: "O cenário atual não mostra bloqueio crítico imediato.",
      expected_impact: "Gerar crescimento com controle de margem e caixa.",
      recommended_action: (() => {
        const product = primaryCommercialProduct(snapshot)
        return product
          ? `Agora: priorize ${product.name}. Poste oferta com garantia e parcelamento, chame leads antigos acionáveis e revise o resultado em 48h.`
          : "Agora: anuncie somente itens ativos no estoque, use o histórico de vendas como sinal de demanda e mantenha leads não acionáveis fora da abordagem ativa."
      })(),
    })
  }

  return actions
    .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority])
    .slice(0, 3)
}

function answerQuestionSummary(
  snapshot: OrionSnapshot,
  question: string,
  fallback: string,
  operationalContext?: OrionOperationalContext | null,
  health?: OperationalHealthScore
) {
  if (operationalContext?.answer) return operationalContext.answer

  const normalized = question.toLowerCase()
  if (normalized.includes("top") && normalized.includes("produto")) {
    const products = snapshot.sales.topProducts.slice(0, 3)
    if (!products.length) {
      return "Não encontrei dados suficientes para ranquear produtos com segurança. Posso usar vendas, margem ou estoque parado como critério quando houver histórico."
    }
    return [
      "Os 3 produtos mais relevantes agora são:",
      ...products.map((product, index) => `${index + 1}. ${product.label} - ${brl(product.value)} em vendas recentes`),
      "Minha sugestão: priorize o primeiro para caixa e cruze com estoque parado antes de aplicar desconto.",
    ].join("\n")
  }

  if (normalized.includes("lead") || normalized.includes("follow")) {
    if (!snapshot.marketing.forgottenLeads.length) {
      return "Não encontrei leads acionáveis esquecidos no momento. A próxima prioridade é manter próxima ação cadastrada em todos os leads novos."
    }
    return [
      `Existem ${snapshot.executive.leadsWithoutFollowUp} leads sem follow-up claro.`,
      ...snapshot.marketing.forgottenLeads.slice(0, 3).map((lead, index) => `${index + 1}. ${lead.name} - ${lead.productInterest || "produto não informado"} (${lead.daysWithoutAction} dia(s) sem ação)`),
      "Minha sugestão: trate estes antes de abrir nova campanha.",
    ].join("\n")
  }

  if (normalized.includes("caixa") || normalized.includes("recompra")) {
    const operationalHealth = health || calculateOperationalHealth(snapshot)
    if (operationalHealth.level === "critical") {
      return `A pressão de caixa exige ação imediata. ${operationalHealth.healthReason} Aja rápido: ${purchaseAction(snapshot)}`
    }
    if (operationalHealth.level === "attention" && snapshot.executive.cashBalance < 0) {
      return `O caixa contábil pede cautela, mas a operação resiste. ${operationalHealth.healthReason} ${purchaseAction(snapshot)}`
    }
    return "O caixa permite uma reposição seletiva. Priorize produtos com giro rápido e preserve margem antes de ampliar compra."
  }

  if (normalized.includes("estoque") || normalized.includes("parado")) {
    if (!snapshot.stock.stuckItems.length) return "O estoque não mostra itens críticos acima de 30 dias no momento. Mantenha monitoramento semanal para evitar capital parado."
    const item = snapshot.stock.stuckItems[0]
    return `O item mais urgente é ${item.name}, ${humanizeDaysInStock(item.daysInStock)}. Agora, ${stockCampaignAction(snapshot)}`
  }

  return fallback
}

function emptyAnalysis(snapshot: OrionSnapshot, precomputedHealth?: OperationalHealthScore): OrionAnalysis {
  const metrics = [
    { label: "Receita recente", value: brl(snapshot.executive.revenue30d), tone: "neutral" as const },
    { label: "Margem recente", value: pct(snapshot.executive.marginPct30d), tone: snapshot.executive.marginPct30d >= 18 ? "positive" as const : "warning" as const },
    {
      label: "Caixa",
      value: brl(snapshot.executive.cashBalance),
      delta: snapshot.finance.cashBalanceSource === "finance_accounts" ? "Saldo estimado pelas contas" : "Saldo reconciliado",
      tone: snapshot.executive.cashBalance > 0 ? "positive" as const : "danger" as const,
    },
    { label: "Leads sem follow-up", value: String(snapshot.executive.leadsWithoutFollowUp), tone: snapshot.executive.leadsWithoutFollowUp ? "warning" as const : "positive" as const },
  ]

  const charts: OrionChart[] = [
    {
      title: "Vendas por semana",
      type: "area",
      metric: "revenue",
      insight: "Movimento recente monitorado para identificar queda ou aceleração de vendas.",
      data: snapshot.sales.weeklyRevenue,
    },
    {
      title: "Margem por semana",
      type: "line",
      metric: "margin",
      insight: "Margem acompanhada junto com descontos, custo principal e itens adicionais.",
      data: snapshot.sales.marginTrend,
    },
    {
      title: "Funil de leads",
      type: "bar",
      metric: "leads",
      insight: "CRM agrupado por estágio para encontrar gargalos de conversão.",
      data: snapshot.marketing.leadFunnel,
    },
    {
      title: "Estoque por idade",
      type: "bar",
      metric: "items",
      insight: "Itens ativos por idade para priorizar campanha antes de desconto agressivo.",
      data: snapshot.stock.agingBuckets,
    },
  ]
  const health = precomputedHealth || calculateOperationalHealth(snapshot)
  const priorityFocus: OrionPriorityFocus = {
      title: snapshot.executive.leadsWithoutFollowUp
      ? "Recuperar leads sem follow-up"
      : health.level === "critical"
        ? "Otimizar caixa e focar em giro"
        : snapshot.executive.stuckStockCount
          ? "Girar estoque parado"
          : "Acelerar venda com margem",
    area: snapshot.executive.leadsWithoutFollowUp
      ? "CRM"
      : health.level === "critical" || health.level === "attention"
        ? "caixa"
        : snapshot.executive.stuckStockCount
          ? "estoque"
          : "venda",
    priority: health.level === "critical" || snapshot.executive.stuckStockCount >= 3 ? "high" : "medium",
    reason: snapshot.executive.leadsWithoutFollowUp
      ? `${leadCountText(snapshot.executive.leadsWithoutFollowUp)} sem próxima ação clara.`
      : health.level === "critical"
        ? health.healthReason
        : `Receita recente em ${brl(snapshot.executive.revenue30d)} e margem em ${pct(snapshot.executive.marginPct30d)}.`,
    risk_if_ignored: "A operação pode perder velocidade e transformar oportunidade quente em capital parado.",
    next_action: "Revisar CRM, caixa e estoque parado antes de abrir nova campanha.",
  }
  const executiveSummary = buildExecutiveSummary(priorityFocus, snapshot)

  return {
    summary: executiveSummary,
    executive_summary: executiveSummary,
    priority_focus: priorityFocus,
    daily_action_plan: [],
    alerts: [],
    recommendations: [],
    chart_interpretations: buildChartInterpretations(snapshot),
    risks: [],
    opportunities: [],
    metrics,
    charts,
    confidence_score: 0.78,
  }
}

export function buildLocalOrionAnalysis(
  snapshot: OrionSnapshot,
  question?: string | null,
  operationalContext?: OrionOperationalContext | null,
  precomputedHealth?: OperationalHealthScore
): OrionAnalysis {
  const health = precomputedHealth || calculateOperationalHealth(snapshot)
  const analysis = emptyAnalysis(snapshot, health)
  const revenueDelta = snapshot.executive.revenuePrevious30d
    ? ((snapshot.executive.revenue30d - snapshot.executive.revenuePrevious30d) / snapshot.executive.revenuePrevious30d) * 100
    : 0

  if (revenueDelta < -10) {
    pushInsight(analysis.alerts, {
      title: "Queda relevante de conversão em vendas",
      category: "vendas",
      priority: "high",
      insight: `A receita dos últimos 30 dias caiu ${pct(Math.abs(revenueDelta))} contra os 30 dias anteriores.`,
      evidence: `${brl(snapshot.executive.revenue30d)} agora versus ${brl(snapshot.executive.revenuePrevious30d)} no período anterior.`,
      recommended_action: "Revisar campanhas ativas, leads sem follow-up e itens de giro lento ainda hoje.",
      expected_impact: "Recuperar pipeline e reduzir perda de intenção de compra.",
      risk: "Sem ação rápida, estoque parado e CAC podem pressionar a margem.",
    })
  }

  if (snapshot.stock.stuckItems.length > 0) {
    const item = snapshot.stock.stuckItems[0]
    pushInsight(analysis.alerts, {
      title: "Estoque parado exige campanha",
      category: "estoque",
      priority: calibratedStockPriority(item, health, snapshot),
      insight: `${item.name} está ${humanizeDaysInStock(item.daysInStock)}.`,
      evidence: `${item.name} ainda pode ser trabalhado com preço de referência de ${brl(item.suggestedPrice)} antes de desconto agressivo.`,
      recommended_action: `Agora: ${stockCampaignAction(snapshot)}`,
      expected_impact: "Melhora de giro sem sacrificar margem além do necessário.",
      risk: "Quanto maior o tempo em estoque, maior a chance de desconto forçado.",
    })
  }

  if (snapshot.executive.leadsWithoutFollowUp > 0) {
    pushInsight(analysis.recommendations, {
      title: "Follow-ups pendentes no CRM",
      category: "crm",
      priority: snapshot.executive.leadsWithoutFollowUp >= 10 ? "high" : "medium",
      insight: `Você possui ${snapshot.executive.leadsWithoutFollowUp} leads sem follow-up claro.`,
      evidence: snapshot.marketing.forgottenLeads.slice(0, 3).map((lead) => `${lead.name}${lead.productInterest ? ` (${lead.productInterest})` : ""}${lead.campaignName ? ` via ${lead.campaignName}` : ""}`).join(", ") || "Leads internos sem próxima ação.",
      recommended_action: leadActionText(snapshot),
      expected_impact: "Aumenta a conversão com baixo custo incremental.",
      risk: "Leads quentes esfriam rápido quando ficam sem retorno.",
    })
  }

  if (health.level === "attention" || health.level === "critical") {
    pushInsight(analysis.risks, {
      title: health.level === "critical" ? "Crise de Liquidez" : "Liquidez ajustada",
      category: "caixa",
      priority: health.level === "critical" ? "critical" : "high",
      insight: health.healthReason,
      evidence: `Saldo reconciliado: ${brl(snapshot.finance.reconciledCashBalance)}. Recebíveis: ${brl(snapshot.executive.pendingReceivables)}.`,
      recommended_action: purchaseAction(snapshot),
      expected_impact: "Diminuir o estrangulamento financeiro.",
      risk: "Recomprar sem giro agora pode forçar parada operacional em 15 dias.",
    })
  } else {
    pushInsight(analysis.opportunities, {
      title: "Caixa permite reposição seletiva",
      category: "financeiro",
      priority: "medium",
      insight: "Há espaço para reposição seletiva se o foco for produto de giro rápido.",
      evidence: `Saldo reconciliado atual de ${brl(snapshot.finance.reconciledCashBalance)} e ${snapshot.executive.sales30d} vendas nos últimos 30 dias.`,
      recommended_action: `Se for recomprar, priorize os itens com venda recente: ${snapshot.sales.topProducts.slice(0, 3).map((item) => item.label).join(", ") || "produtos de maior saída"}.`,
      expected_impact: "Aumenta disponibilidade dos itens com maior chance de conversão.",
      risk: "Reposição ampla demais dilui caixa em produtos menos previsíveis.",
    })
  }

  if (snapshot.marketing.campaigns.some((campaign) => campaign.roi > 1.5)) {
    const campaign = [...snapshot.marketing.campaigns].sort((a, b) => b.roi - a.roi)[0]
    pushInsight(analysis.opportunities, {
      title: "Campanha com ROI positivo",
      category: "campanhas",
      priority: "medium",
      insight: `${campaign.name} está performando melhor que as demais campanhas.`,
      evidence: `ROI ${round(campaign.roi, 2)}x, ${campaign.sales} venda(s) e ${campaign.leads} lead(s).`,
      recommended_action: "Replicar criativo, oferta e canal antes de aumentar orçamento.",
      expected_impact: "Escala com menor risco de desperdiçar verba.",
      risk: "Aumentar verba sem isolar o motivo da performance pode reduzir ROI.",
    })
  }

  analysis.priority_focus = makePriorityFocus(analysis, snapshot, health)
  analysis.executive_summary = buildExecutiveSummary(analysis.priority_focus, snapshot)
  analysis.summary = analysis.executive_summary
  analysis.daily_action_plan = buildDailyActionPlan(snapshot, health)
  analysis.chart_interpretations = buildChartInterpretations(snapshot)

  if (question) {
    const answer = answerQuestionSummary(snapshot, question, analysis.executive_summary, operationalContext, health)
    analysis.summary = answer
    analysis.executive_summary = answer
  }

  // Apply deduplication → confidence enrichment pipeline
  const deduplicated = deduplicateAnalysis(analysis, snapshot, health)
  const enriched = enrichAnalysisWithConfidence(deduplicated, snapshot)
  return enriched
}

export async function collectOrionSnapshot(
  companyId: string,
  companyName: string,
  selectedFinancialPeriodInput?: ResolveProfitAvailabilityPeriodInput | null
): Promise<OrionSnapshot> {
  const today = new Date()
  const start30 = dateKey(addDays(today, -29))
  const previousStart = dateKey(addDays(today, -59))
  const previousEnd = dateKey(addDays(today, -30))
  const start90 = dateKey(addDays(today, -89))
  const selectedFinancialPeriod = resolveProfitAvailabilityPeriod(selectedFinancialPeriodInput, today).period
  const financialFetchStart = selectedFinancialPeriod.preset === "all_time"
    ? "0001-01-01"
    : selectedFinancialPeriod.startDate < previousStart
      ? selectedFinancialPeriod.startDate
      : previousStart
  const transactionFetchStart = selectedFinancialPeriod.preset === "all_time"
    ? "0001-01-01"
    : selectedFinancialPeriod.startDate < start90
      ? selectedFinancialPeriod.startDate
      : start90

  const [
    stockResult,
    salesResult,
    additionalItemsResult,
    salePaymentsResult,
    financialSettingsResult,
    campaignsResult,
    leadsResult,
    transactionsResult,
    movementsResult,
    accountsResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT
          i.id,
          i.status,
          i.purchase_price,
          i.suggested_price,
          i.purchase_date,
          i.quantity,
          COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS category,
          COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS product_model,
          COALESCE(i.color_name_snapshot, pc.color) AS color
        FROM inventory i
        LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
        WHERE i.company_id = $1::uuid
      `,
      [companyId]
    ),
    pool.query<SaleRow>(
      `
        SELECT
          s.id,
          s.inventory_id,
          s.sale_date,
          s.sale_price,
          s.net_amount,
          s.supplier_cost,
          s.notes,
          s.sale_status,
          s.payment_method,
          s.warranty_months,
          s.trade_in_id,
          ti.trade_in_value,
          ti.linked_inventory_id AS trade_in_linked_inventory_id,
          s.marketing_campaign_id,
          s.marketing_lead_id,
          s.sale_origin,
          i.purchase_price,
          i.purchase_date,
          COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS product_name,
          COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS product_category
        FROM sales s
        LEFT JOIN inventory i ON i.id = s.inventory_id
        LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
        LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
        WHERE s.company_id = $1::uuid
          AND s.sale_date >= $2::date
          AND LOWER(COALESCE(s.sale_status, 'completed')) NOT IN ('cancelled', 'canceled', 'refunded', 'estornado', 'void')
        ORDER BY s.sale_date ASC
      `,
      [companyId, financialFetchStart]
    ),
    pool.query<AdditionalItemRow>(
      `
        SELECT ai.id, ai.sale_id, ai.product_id, ai.type, ai.cost_price, ai.sale_price, ai.profit, i.purchase_date
        FROM sales_additional_items ai
        JOIN sales s ON s.id = ai.sale_id
        LEFT JOIN inventory i ON i.id = ai.product_id
        WHERE ai.company_id = $1::uuid
          AND s.sale_date >= $2::date
          AND LOWER(COALESCE(s.sale_status, 'completed')) NOT IN ('cancelled', 'canceled', 'refunded', 'estornado', 'void')
      `,
      [companyId, financialFetchStart]
    ),
    pool.query<SalePaymentRow>(
      `
        SELECT sp.id, sp.sale_id, sp.payment_method, sp.amount, sp.status
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id
        WHERE sp.company_id = $1::uuid
          AND s.sale_date >= $2::date
          AND LOWER(COALESCE(s.sale_status, 'completed')) NOT IN ('cancelled', 'canceled', 'refunded', 'estornado', 'void')
      `,
      [companyId, financialFetchStart]
    ),
    pool.query<Record<string, unknown>>(
      `
        SELECT *
        FROM financial_settings
        WHERE company_id = $1::uuid
        LIMIT 1
      `,
      [companyId]
    ),
    pool.query<CampaignRow>(
      `
        SELECT id, name, channel, budget_amount, actual_spend
        FROM marketing_campaigns
        WHERE company_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 24
      `,
      [companyId]
    ),
    pool.query<LeadRow>(
      `
        SELECT id, campaign_id, name, source, origin, status, product_interest, next_action, next_action_at, created_at
        FROM marketing_leads
        WHERE company_id = $1::uuid
          AND created_at >= $2::date
        ORDER BY created_at DESC
        LIMIT 200
      `,
      [companyId, transactionFetchStart]
    ),
    pool.query<TransactionRow>(
      `
        SELECT
          t.id,
          t.type,
          t.category,
          t.description,
          t.amount,
          t.date,
          t.due_date,
          t.created_at,
          t.status,
          t.source_type,
          t.source_id,
          CASE
            WHEN t.source_type = 'sale' THEN t.source_id
            WHEN t.source_type = 'sale_payment' THEN sp.sale_id
            ELSE NULL
          END AS sale_id,
          ca.name AS chart_account_name,
          ca.financial_type AS chart_financial_type,
          ca.affects_inventory AS chart_affects_inventory,
          ca.affects_owner_equity AS chart_affects_owner_equity,
          ca.statement_section AS chart_statement_section
        FROM transactions t
        LEFT JOIN finance_chart_accounts ca ON ca.id = t.chart_account_id
        LEFT JOIN sale_payments sp ON sp.id = t.source_id AND t.source_type = 'sale_payment'
        WHERE t.company_id = $1::uuid
          AND COALESCE(t.status, 'pending') <> 'cancelled'
          AND (
            t.date >= $2::date
            OR t.due_date >= $2::date
            OR (COALESCE(t.status, 'pending') = 'pending' AND t.due_date IS NOT NULL)
          )
        ORDER BY COALESCE(t.due_date, t.date) ASC
      `,
      [companyId, start90]
    ),
    pool.query<MovementRow>(
      `
        SELECT
          movement.id,
          movement.account_id,
          movement.movement_date,
          movement.created_at,
          movement.type,
          movement.category,
          movement.amount,
          movement.balance_after,
          movement.source,
          movement.source_id,
          movement.is_canceled,
          transaction.status AS transaction_status
        FROM financial_account_movements movement
        LEFT JOIN transactions transaction
          ON transaction.id = movement.source_id
         AND transaction.company_id IS NOT DISTINCT FROM movement.company_id
         AND movement.source IN ('account_payable', 'account_receivable')
        WHERE movement.company_id = $1::uuid
        ORDER BY movement.movement_date ASC, movement.created_at ASC, movement.id ASC
      `,
      [companyId]
    ),
    pool.query(
      `
        SELECT id, name, current_balance, is_active
        FROM finance_accounts
        WHERE company_id = $1::uuid
          AND COALESCE(is_active, TRUE) = TRUE
        ORDER BY name ASC
      `,
      [companyId]
    ),
  ])

  const additionalBySale = new Map<string, AdditionalItemRow[]>()
  for (const item of additionalItemsResult.rows) {
    const list = additionalBySale.get(item.sale_id) || []
    list.push(item)
    additionalBySale.set(item.sale_id, list)
  }
  const salePaymentsBySale = new Map<string, SalePaymentRow[]>()
  for (const payment of salePaymentsResult.rows) {
    const list = salePaymentsBySale.get(payment.sale_id) || []
    list.push(payment)
    salePaymentsBySale.set(payment.sale_id, list)
  }
  const financialSettings = financialSettingsResult.rows[0] || {}

  const saleFacts = salesResult.rows.map((sale) => {
    const totals = calcSaleTotals({
      salePrice: sale.sale_price,
      mainCost: sale.purchase_price,
      supplierCost: sale.supplier_cost,
      qty: parseQtyFromNotes(sale.notes),
      additionalItems: additionalBySale.get(sale.id) || [],
    })
    return {
      ...sale,
      revenue: number(sale.sale_price),
      netRevenue: number(sale.net_amount ?? sale.sale_price),
      profit: totals.lucroTotal,
      marginPct: totals.margemTotal,
    }
  })

  const commercialIncludedSaleStatuses = ["completed", "sold", "paid"]
  const commercialExcludedSaleStatuses = ["reserved", "cancelled", "canceled", "refunded", "estornado", "void"]
  const periodSource = selectedFinancialPeriod.preset === "current_month"
    ? "current_month" as const
    : selectedFinancialPeriod.preset === "last_30_days"
      ? "last_30_days" as const
      : selectedFinancialPeriod.preset === "all_time"
        ? "all_loaded" as const
        : selectedFinancialPeriod.preset === "custom" || selectedFinancialPeriod.preset === "today" || selectedFinancialPeriod.preset === "last_7_days" || selectedFinancialPeriod.preset === "year_to_date"
          ? "selected_period" as const
          : "unknown" as const
  const selectedPeriodCommercialSales = saleFacts.filter((sale) => {
    const saleDate = dateKeyFromValue(sale.sale_date)
    if (!saleDate) return false
    const status = String(sale.sale_status || "completed").toLowerCase()
    return saleDate >= selectedFinancialPeriod.startDate
      && saleDate <= selectedFinancialPeriod.endDate
      && commercialIncludedSaleStatuses.includes(status)
  })
  const selectedPeriodSaleDates = selectedPeriodCommercialSales
    .map((sale) => dateKeyFromValue(sale.sale_date))
    .filter(Boolean)
    .sort()
  const periodProductMap = new Map<string, {
    salesCount: number
    revenue: number
    profit: number
  }>()
  for (const sale of selectedPeriodCommercialSales) {
    const label = safeName([sale.product_category, sale.product_name]) || "Produto não informado"
    const entry = periodProductMap.get(label) || { salesCount: 0, revenue: 0, profit: 0 }
    entry.salesCount += 1
    entry.revenue += sale.revenue
    entry.profit += sale.profit
    periodProductMap.set(label, entry)
  }
  const selectedPeriodRevenue = selectedPeriodCommercialSales.reduce((sum, sale) => sum + sale.revenue, 0)
  const selectedPeriodNetRevenue = selectedPeriodCommercialSales.reduce((sum, sale) => sum + sale.netRevenue, 0)
  const selectedPeriodProfit = selectedPeriodCommercialSales.reduce((sum, sale) => sum + sale.profit, 0)
  const periodPerformance = {
    period: {
      label: selectedFinancialPeriod.label,
      startDate: selectedFinancialPeriod.startDate,
      endDate: selectedFinancialPeriod.endDate,
      source: periodSource,
    },
    salesCount: selectedPeriodCommercialSales.length,
    revenue: round(selectedPeriodRevenue),
    netRevenue: round(selectedPeriodNetRevenue),
    profit: selectedPeriodCommercialSales.length ? round(selectedPeriodProfit) : null,
    marginPct: selectedPeriodRevenue > 0 && selectedPeriodCommercialSales.length
      ? round((selectedPeriodProfit / selectedPeriodRevenue) * 100, 1)
      : null,
    includedStatuses: Array.from(new Set(selectedPeriodCommercialSales.map((sale) => String(sale.sale_status || "completed").toLowerCase()))).sort(),
    excludedStatuses: commercialExcludedSaleStatuses,
    firstSaleDate: selectedPeriodSaleDates[0] || null,
    lastSaleDate: selectedPeriodSaleDates.at(-1) || null,
    topProducts: Array.from(periodProductMap, ([label, value]) => ({
      label,
      salesCount: value.salesCount,
      revenue: round(value.revenue),
      profit: round(value.profit),
      marginPct: value.revenue > 0 ? round((value.profit / value.revenue) * 100, 1) : null,
    }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6),
  }

  const sales30 = saleFacts.filter((sale) => String(sale.sale_date) >= start30)
  const salesPrevious30 = saleFacts.filter((sale) => String(sale.sale_date) >= previousStart && String(sale.sale_date) <= previousEnd)
  const revenue30d = sales30.reduce((sum, sale) => sum + sale.revenue, 0)
  const revenuePrevious30d = salesPrevious30.reduce((sum, sale) => sum + sale.revenue, 0)
  const profit30d = sales30.reduce((sum, sale) => sum + sale.profit, 0)

  const stockRows = stockResult.rows.map((row) => {
    const costBreakdown = getInventoryCostBreakdown(row)
    return {
      id: String(row.id),
      status: String(row.status || ""),
      purchasePrice: costBreakdown.unitCost,
      unitCost: costBreakdown.unitCost,
      suggestedPrice: number(row.suggested_price),
      purchaseDate: String(row.purchase_date || ""),
      quantity: costBreakdown.quantity,
      capitalValue: costBreakdown.capitalValue,
      category: String(row.category || "Outros"),
      name: safeName([row.product_model || row.category, row.color]),
      color: row.color ? String(row.color) : null,
      daysInStock: daysBetweenDates(String(row.purchase_date || "")),
    }
  })
  const activeStock = filterOperationalStock(stockRows)
  const stuckItems = activeStock
    .filter((row) => row.daysInStock >= 30)
    .sort((a, b) => b.daysInStock - a.daysInStock)
    .slice(0, 12)

  const bucketDefs = [
    { label: "0-15d", min: 0, max: 15 },
    { label: "16-30d", min: 16, max: 30 },
    { label: "31-45d", min: 31, max: 45 },
    { label: "46+d", min: 46, max: 9999 },
  ]
  const agingBuckets = bucketDefs.map((bucket) => ({
    label: bucket.label,
    value: activeStock.filter((row) => row.daysInStock >= bucket.min && row.daysInStock <= bucket.max).length,
  }))

  const weeks = Array.from({ length: 8 }, (_, index) => startOfWeek(addDays(today, -7 * (7 - index))))
  const weeklyRevenue = weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6)
    const weekSales = saleFacts.filter((sale) => {
      const key = String(sale.sale_date)
      return key >= dateKey(weekStart) && key <= dateKey(weekEnd)
    })
    return {
      label: weekLabel(weekStart),
      value: round(weekSales.reduce((sum, sale) => sum + sale.revenue, 0)),
      secondary: weekSales.length,
    }
  })
  const marginTrend = weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6)
    const weekSales = saleFacts.filter((sale) => {
      const key = String(sale.sale_date)
      return key >= dateKey(weekStart) && key <= dateKey(weekEnd)
    })
    const revenue = weekSales.reduce((sum, sale) => sum + sale.revenue, 0)
    const profit = weekSales.reduce((sum, sale) => sum + sale.profit, 0)
    return {
      label: weekLabel(weekStart),
      value: revenue ? round((profit / revenue) * 100, 1) : 0,
      secondary: round(profit),
    }
  })

  const groupSales = (key: "product_name" | "product_category" | "payment_method") => {
    const map = new Map<string, { revenue: number; count: number }>()
    for (const sale of sales30) {
      const label = String(sale[key] || "Não informado")
      const entry = map.get(label) || { revenue: 0, count: 0 }
      entry.revenue += sale.revenue
      entry.count += 1
      map.set(label, entry)
    }
    return Array.from(map, ([label, value]) => ({ label, value: round(value.revenue), secondary: value.count }))
      .sort((a, b) => b.value - a.value)
  }

  const campaignMap = new Map(campaignsResult.rows.map((campaign) => [campaign.id, campaign]))
  const leadsByCampaign = new Map<string, number>()
  // lead.id → campaign_id reverse map, used to attribute sales via marketing_lead_id.
  // Mirrors the marketing ROI page which checks both sale.marketing_lead_id and lead.sale_id.
  const leadCampaignMap = new Map<string, string>()
  for (const lead of leadsResult.rows) {
    if (!lead.campaign_id) continue
    leadsByCampaign.set(lead.campaign_id, (leadsByCampaign.get(lead.campaign_id) || 0) + 1)
    leadCampaignMap.set(lead.id, lead.campaign_id)
  }
  const campaignSales = new Map<string, { revenue: number; sales: number }>()
  const countedCampaignSaleIds = new Set<string>()
  for (const sale of sales30) {
    const campaignId = sale.marketing_campaign_id
      || (sale.marketing_lead_id ? leadCampaignMap.get(sale.marketing_lead_id) : undefined)
      || null
    if (!campaignId || countedCampaignSaleIds.has(sale.id)) continue
    countedCampaignSaleIds.add(sale.id)
    const entry = campaignSales.get(campaignId) || { revenue: 0, sales: 0 }
    entry.revenue += sale.revenue
    entry.sales += 1
    campaignSales.set(campaignId, entry)
  }
  const campaigns = Array.from(campaignMap.values()).map((campaign) => {
    const salesData = campaignSales.get(campaign.id) || { revenue: 0, sales: 0 }
    const spend = number(campaign.actual_spend || campaign.budget_amount)
    const leadsCount = leadsByCampaign.get(campaign.id) || 0
    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      spend,
      revenue: round(salesData.revenue),
      leads: leadsCount,
      sales: salesData.sales,
      roi: spend > 0 ? round(salesData.revenue / spend, 2) : salesData.revenue > 0 ? 99 : 0,
      lostLeads: Math.max(0, leadsCount - salesData.sales),
    }
  })

  const leadStatusMap = new Map<string, number>()
  const leadOriginMap = new Map<string, number>()
  for (const lead of leadsResult.rows) {
    leadStatusMap.set(lead.status, (leadStatusMap.get(lead.status) || 0) + 1)
    const origin = lead.origin || lead.source || "Não informado"
    leadOriginMap.set(origin, (leadOriginMap.get(origin) || 0) + 1)
  }

  const forgottenLeads = leadsResult.rows
    .filter((lead) => isActionableLead(lead.status))
    .filter((lead) => !lead.next_action_at || new Date(lead.next_action_at).getTime() < today.getTime())
    .map((lead) => {
      const daysWithoutAction = daysBetweenDates(lead.next_action_at || lead.created_at)

      return {
        id: lead.id,
        name: lead.name,
        status: lead.status,
        campaignName: lead.campaign_id ? campaignMap.get(lead.campaign_id)?.name || null : null,
        productInterest: lead.product_interest,
        originalIntent: lead.product_interest, // Usando product_interest como proxy de intenção original
        classification: classifyLead(lead.status, daysWithoutAction),
        nextAction: lead.next_action,
        nextActionAt: lead.next_action_at,
        daysWithoutAction,
      }
    })
    .sort((a, b) => b.daysWithoutAction - a.daysWithoutAction)
    .slice(0, 20)

  const campaignLeadStatusByCampaign = new Map<string, { active: number; lost: number }>()
  for (const lead of leadsResult.rows) {
    if (!lead.campaign_id) continue
    const entry = campaignLeadStatusByCampaign.get(lead.campaign_id) || { active: 0, lost: 0 }
    const classification = classifyLead(lead.status, daysBetweenDates(lead.created_at))
    if (classification === "lost") entry.lost += 1
    else if (isActionableLead(lead.status)) entry.active += 1
    campaignLeadStatusByCampaign.set(lead.campaign_id, entry)
  }

  const activeStockByKey = new Map<string, typeof activeStock>()
  for (const item of activeStock) {
    const key = `${normalizeBusinessKey(item.category)}|${normalizeBusinessKey(item.name)}`
    const byCategoryKey = `${normalizeBusinessKey(item.category)}|`
    activeStockByKey.set(key, [...(activeStockByKey.get(key) || []), item])
    activeStockByKey.set(byCategoryKey, [...(activeStockByKey.get(byCategoryKey) || []), item])
  }

  const reinvestmentCandidateMap = new Map<string, {
    label: string
    category: string
    productType: string | null
    model: string | null
    sales: typeof saleFacts
    campaignDemandLeads: number
    campaignLostLeads: number
    activeLeadSignals: number
    lostLeadSignals: number
  }>()
  const reinvestmentWindowSales = saleFacts.filter((sale) => String(sale.sale_date) >= start90)
  const reinvestmentAnalysisWindow = {
    label: "Últimos 90 dias",
    startDate: start90,
    endDate: dateKey(today),
    salesCount: reinvestmentWindowSales.length,
    source: "last_90_days" as const,
  }
  for (const sale of reinvestmentWindowSales) {
    const category = String(sale.product_category || "Outros")
    const model = sale.product_name ? String(sale.product_name) : null
    const key = `${normalizeBusinessKey(category)}|${normalizeBusinessKey(model || category)}`
    const existing = reinvestmentCandidateMap.get(key) || {
      label: composeProductLabel(category, model),
      category,
      productType: category || null,
      model,
      sales: [],
      campaignDemandLeads: 0,
      campaignLostLeads: 0,
      activeLeadSignals: 0,
      lostLeadSignals: 0,
    }
    existing.sales.push(sale)
    const campaignId = sale.marketing_campaign_id
      || (sale.marketing_lead_id ? leadCampaignMap.get(sale.marketing_lead_id) : undefined)
      || null
    if (campaignId) {
      const leadSignals = campaignLeadStatusByCampaign.get(campaignId)
      existing.campaignDemandLeads += leadsByCampaign.get(campaignId) || 0
      existing.campaignLostLeads += Math.max(0, (leadsByCampaign.get(campaignId) || 0) - (campaignSales.get(campaignId)?.sales || 0))
      existing.activeLeadSignals += leadSignals?.active || 0
      existing.lostLeadSignals += leadSignals?.lost || 0
    }
    reinvestmentCandidateMap.set(key, existing)
  }

  const reinvestmentCandidates = Array.from(reinvestmentCandidateMap.values()).map((candidate) => {
    const sales = candidate.sales
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.revenue, 0)
    const totalProfit = sales.reduce((sum, sale) => sum + sale.profit, 0)
    const costs = sales
      .map((sale) => number(sale.supplier_cost ?? sale.purchase_price))
      .filter((cost) => cost > 0)
    const daysToSale = sales
      .map((sale) => sale.purchase_date ? daysBetweenDates(String(sale.purchase_date), new Date(String(sale.sale_date))) : null)
      .filter((days): days is number => days !== null)
    const stockKey = `${normalizeBusinessKey(candidate.category)}|${normalizeBusinessKey(candidate.model || candidate.category)}`
    const categoryStockKey = `${normalizeBusinessKey(candidate.category)}|`
    const matchingStock = activeStockByKey.get(stockKey) || activeStockByKey.get(categoryStockKey) || []
    const sampleSize = sales.length
    return {
      label: candidate.label,
      category: candidate.category,
      productType: candidate.productType,
      model: candidate.model,
      recentSalesCount: sampleSize,
      sampleSize,
      totalRevenue: round(totalRevenue),
      totalProfit: round(totalProfit),
      averageTicket: round(totalRevenue / Math.max(1, sampleSize)),
      averageProfit: round(totalProfit / Math.max(1, sampleSize)),
      averageMarginPct: round(sales.reduce((sum, sale) => sum + sale.marginPct, 0) / Math.max(1, sampleSize), 1),
      averageDaysInStock: daysToSale.length ? round(daysToSale.reduce((sum, days) => sum + days, 0) / daysToSale.length, 1) : null,
      probableUnitCost: costs.length ? round(costs.reduce((sum, cost) => sum + cost, 0) / costs.length) : null,
      minRecentCost: costs.length ? round(Math.min(...costs)) : null,
      currentStockCount: matchingStock.reduce((sum, item) => sum + item.quantity, 0),
      currentStockValue: round(matchingStock.reduce((sum, item) => sum + item.capitalValue, 0)),
      stuckStockCount: matchingStock.filter((item) => item.daysInStock >= 30).length,
      campaignDemandLeads: candidate.campaignDemandLeads,
      campaignLostLeads: candidate.campaignLostLeads,
      activeLeadSignals: candidate.activeLeadSignals,
      lostLeadSignals: candidate.lostLeadSignals,
      confidence: sampleSize >= 3 ? "high" as const : sampleSize === 2 ? "medium" as const : "low" as const,
    }
  }).sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 12)

  const transactionRows = transactionsResult.rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    category: String(row.category || "Não informado"),
    description: row.description ? String(row.description) : null,
    amount: number(row.amount),
    date: String(row.date || row.due_date || ""),
    dueDate: row.due_date ? String(row.due_date) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    status: String(row.status || "pending"),
    sourceType: row.source_type ? String(row.source_type) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    saleId: row.sale_id ? String(row.sale_id) : null,
    accountName: row.chart_account_name ? String(row.chart_account_name) : null,
    financialType: row.chart_financial_type ? String(row.chart_financial_type) : null,
    affectsInventory: Boolean(row.chart_affects_inventory),
    affectsOwnerEquity: Boolean(row.chart_affects_owner_equity),
    statementSection: row.chart_statement_section ? String(row.chart_statement_section) : null,
  }))
  const movementRows = movementsResult.rows.map((row) => ({
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : null,
    movementDate: String(row.movement_date || ""),
    createdAt: String(row.created_at || ""),
    type: String(row.type || ""),
    category: String(row.category || "Não informado"),
    amount: number(row.amount),
    balanceAfter: number(row.balance_after),
    source: String(row.source || ""),
    sourceId: row.source_id ? String(row.source_id) : null,
    transactionStatus: row.transaction_status ? String(row.transaction_status) : null,
    isCanceled: Boolean(row.is_canceled),
  }))
  const accountRows = accountsResult.rows.map((account) => ({
    id: String(account.id),
    name: String(account.name),
    currentBalance: number(account.current_balance),
    isActive: account.is_active ?? true,
  }))
  const ledgerSnapshot = buildLedgerSnapshot({
    movements: movementRows,
    pendingTransactions: transactionRows,
    accounts: accountRows,
  })
  logLedgerDebug(ledgerSnapshot)
  const derivedAccountBalances = ledgerSnapshot.accountBalances.map((account) => ({
    label: account.name,
    value: round(account.ledgerBalance),
  }))
  const accountCashBalance = accountRows.reduce((sum, account) => sum + account.currentBalance, 0)
  const reconciledCashBalance = ledgerSnapshot.reconciledBalance
  const pendingReceivables = ledgerSnapshot.pendingReceivables
  const pendingPayables = ledgerSnapshot.pendingPayables
  const cashBalanceSource = ledgerSnapshot.cashBalanceSource
  const moneyClassification = buildMoneyClassificationSnapshot({ transactions: transactionRows })
  const transactionClassificationById = new Map(moneyClassification.items.map((classification) => [classification.movementId, classification]))
  const classifyTx = (tx: typeof transactionRows[number]) => transactionClassificationById.get(tx.id) || classifyTransaction(tx)
  const reconciledTransactions30d = transactionRows
    .filter((tx) => tx.status === "reconciled" && tx.date >= start30)
  const isOwnerEquityTransaction = (tx: typeof transactionRows[number]) => {
    const classification = classifyTx(tx)
    return classification.affectsOwnerEquity
      || classification.movementType === "owner_contribution"
      || classification.movementType === "owner_withdrawal"
      || classification.movementType === "owner_capital_return"
      || classification.movementType === "owner_profit_withdrawal"
  }
  const isOperationalTransaction = (tx: typeof transactionRows[number]) => {
    const classification = classifyTx(tx)
    return classification.affectsCash
      && !["inventory_purchase", "owner_contribution", "owner_withdrawal", "owner_capital_return", "owner_profit_withdrawal", "transfer", "adjustment", "reversal", "receivable", "payable", "unknown"].includes(classification.movementType)
  }
  const isStockCapitalTransaction = (tx: typeof transactionRows[number]) => {
    return classifyTx(tx).movementType === "inventory_purchase"
  }
  const ownerEquityMovement30d = reconciledTransactions30d
    .filter(isOwnerEquityTransaction)
    .reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0)
  const operationalCashFlow30d = reconciledTransactions30d
    .filter(isOperationalTransaction)
    .reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0)
  const reconciledIncome30d = reconciledTransactions30d
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0)
  const reconciledExpense30d = reconciledTransactions30d
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0)
  const saleFactById = new Map(saleFacts.map((sale) => [String(sale.id), sale]))
  const ownerWithdrawalDates = reconciledTransactions30d
    .filter((tx) => tx.type === "expense" && isOwnerEquityTransaction(tx))
    .map((tx) => dateKeyFromValue(tx.date))
    .filter(Boolean)
    .sort()
  const profitWindowStart = ownerWithdrawalDates.at(-1) || start30
  const saleProfitFromTransaction = (tx: typeof transactionRows[number]) => {
    if (tx.type !== "income" || !tx.saleId) return 0
    if (tx.sourceType !== "sale" && tx.sourceType !== "sale_payment") return 0
    const sale = saleFactById.get(tx.saleId)
    if (!sale || sale.revenue <= 0 || sale.profit <= 0) return 0
    const paymentShare = Math.min(1, Math.max(0, tx.amount / sale.revenue))
    return sale.profit * paymentShare
  }
  const reconciledSalesRevenue30d = reconciledTransactions30d
    .filter((tx) => tx.type === "income" && (tx.sourceType === "sale" || tx.sourceType === "sale_payment"))
    .reduce((sum, tx) => sum + tx.amount, 0)
  const reconciledSalesProfit30d = reconciledTransactions30d.reduce((sum, tx) => sum + saleProfitFromTransaction(tx), 0)
  const availableProfitWindowTransactions = reconciledTransactions30d
    .filter((tx) => dateKeyFromValue(tx.date) > profitWindowStart)
  const salesProfitSinceLastOwnerWithdrawal = availableProfitWindowTransactions.reduce((sum, tx) => sum + saleProfitFromTransaction(tx), 0)
  const paidOperatingExpensesSinceLastOwnerWithdrawal = availableProfitWindowTransactions
    .filter((tx) => tx.type === "expense" && classifyTx(tx).affectsProfit && isOperationalTransaction(tx) && !isStockCapitalTransaction(tx))
    .reduce((sum, tx) => sum + tx.amount, 0)
  const availableSalesProfit = Math.max(0, salesProfitSinceLastOwnerWithdrawal - paidOperatingExpensesSinceLastOwnerWithdrawal)
  const availableOperationalProfitEstimate = {
    amount: round(availableSalesProfit),
    confidence: Math.min(0.72, moneyClassification.availableOperationalProfitEstimate.confidence),
    reason: "Estimativa operacional baseada em vendas conciliadas e despesas classificadas; não é lucro real por SKU/bundle até a Real Profit Engine.",
  }
  const liquidityQualityForDays = (days: number) => {
    if (days >= 60) return "low" as const
    if (days >= 30) return "medium" as const
    return "high" as const
  }
  const realProfitSaleInputs = saleFacts.map((sale) => {
      const quantity = parseQtyFromNotes(sale.notes)
      const purchaseDate = sale.purchase_date ? String(sale.purchase_date) : null
      const mainCost = number(sale.supplier_cost ?? sale.purchase_price)
      const salePayments = salePaymentsBySale.get(sale.id) || []
      const tradeInCredit = salePayments
        .filter((payment) => payment.payment_method === "trade_in_credit" && payment.status !== "cancelled")
        .reduce((sum, payment) => sum + number(payment.amount), 0)
      return {
        saleId: sale.id,
        saleLabel: safeName([sale.product_category, sale.product_name]),
        salePrice: sale.sale_price,
        netAmount: sale.net_amount,
        warrantyMonths: sale.warranty_months,
        mainItem: {
          id: sale.inventory_id,
          cost: mainCost,
          quantity,
          daysInStock: daysBetweenDates(purchaseDate),
          liquidityQuality: liquidityQualityForDays(daysBetweenDates(purchaseDate)),
          costStructured: mainCost > 0,
        },
        additionalItems: (additionalBySale.get(sale.id) || []).map((item) => {
          const days = daysBetweenDates(item.purchase_date ? String(item.purchase_date) : null)
          const cost = number(item.cost_price)
          return {
            id: item.id,
            type: item.type === "free" ? "free" as const : "upsell" as const,
            salePrice: item.sale_price,
            cost,
            quantity: 1,
            daysInStock: days,
            liquidityQuality: liquidityQualityForDays(days),
            costStructured: cost > 0,
          }
        }),
        payments: salePayments.map((payment) => ({
          id: payment.id,
          paymentMethod: payment.payment_method,
          amount: payment.amount,
          status: payment.status,
          isFinancial: payment.payment_method !== "trade_in_credit",
        })),
        settings: financialSettings,
        operationalCosts: transactionRows
          .filter((tx) => tx.saleId === sale.id && tx.type === "expense" && tx.status !== "cancelled" && tx.sourceType !== "card_fee" && classifyTx(tx).affectsProfit)
          .map((tx) => ({ amount: tx.amount, status: tx.status, linked: true })),
        feeTransactions: transactionRows
          .filter((tx) => tx.saleId === sale.id && tx.type === "expense" && tx.status !== "cancelled" && tx.sourceType === "card_fee")
          .map((tx) => ({
            sourceType: tx.sourceType,
            sourceId: tx.sourceId,
            type: tx.type,
            amount: tx.amount,
            status: tx.status,
          })),
        tradeIn: sale.trade_in_id || tradeInCredit > 0
          ? {
              creditAmount: tradeInCredit || number(sale.trade_in_value),
              linkedInventoryId: sale.trade_in_linked_inventory_id,
            }
          : null,
      }
    })
  const allRealProfitSnapshot = buildRealProfitSnapshot({ sales: realProfitSaleInputs })
  const saleReconciliation = new Map<string, {
    reconciliationDate: string
    tracedRevenue: number
    hasSalePayment: boolean
    hasTransaction: boolean
    hasLedgerMovement: boolean
  }>()
  for (const sale of saleFacts) {
    const salePayments = salePaymentsBySale.get(sale.id) || []
    const salePaymentIds = new Set(salePayments.map((payment) => payment.id))
    const saleTransactions = transactionRows.filter((tx) => tx.saleId === sale.id && tx.status === "reconciled")
    const saleTransactionIds = new Set(saleTransactions.map((tx) => tx.id))
    const saleMovements = movementRows.filter((movement) => {
      if (movement.isCanceled || movement.amount <= 0) return false
      if (!movement.sourceId) return false
      return movement.sourceId === sale.id || salePaymentIds.has(movement.sourceId) || saleTransactionIds.has(movement.sourceId)
    })
    const reconciliationDate = saleMovements.map((movement) => movement.movementDate).sort()[0]
      || saleTransactions.map((tx) => tx.date).sort()[0]
      || ""
    saleReconciliation.set(sale.id, {
      reconciliationDate,
      tracedRevenue: saleMovements.reduce((sum, movement) => sum + Math.max(0, movement.amount), 0),
      hasSalePayment: salePayments.some((payment) => payment.status !== "cancelled"),
      hasTransaction: saleTransactions.length > 0,
      hasLedgerMovement: saleMovements.length > 0,
    })
  }
  const selectedSaleInputs = realProfitSaleInputs.filter((sale) => {
    const reconciliation = saleReconciliation.get(sale.saleId)
    const reconciliationDate = reconciliation?.reconciliationDate || ""
    const saleDate = dateKeyFromValue(saleFacts.find((fact) => fact.id === sale.saleId)?.sale_date)
    const basisDate = reconciliationDate || saleDate
    return basisDate >= selectedFinancialPeriod.startDate && basisDate <= selectedFinancialPeriod.endDate
  })
  const realProfitSnapshot = buildRealProfitSnapshot({ sales: selectedSaleInputs })
  const activeInventoryForFinance = activeStock.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    purchasePrice: item.purchasePrice,
    unitCost: item.unitCost,
    suggestedPrice: item.suggestedPrice,
    quantity: item.quantity,
    capitalValue: item.capitalValue,
    daysInStock: item.daysInStock,
  }))
  const inventoryLiquidityQuality = buildInventoryLiquidityQuality({
    items: activeInventoryForFinance,
  })

  // Regra 3 — Liquidity Forecast Engine
  const todayKey = dateKey(today)
  const pendingDueTxs = transactionRows
    .filter((tx) => tx.status === "pending" && tx.dueDate)
    .map((tx) => ({ ...tx, dueKey: dateKeyFromValue(tx.dueDate) }))
    .filter((tx) => tx.dueKey)

  const dueSum = (type: "income" | "expense", predicate: (dueKey: string) => boolean) => {
    return pendingDueTxs
      .filter((tx) => tx.type === type && predicate(tx.dueKey))
      .reduce((sum, tx) => sum + tx.amount, 0)
  }

  const overduePayables = dueSum("expense", (dueKey) => dueKey < todayKey)
  const overdueReceivables = dueSum("income", (dueKey) => dueKey < todayKey)
  const todayPayables = dueSum("expense", (dueKey) => dueKey === todayKey)
  const todayReceivables = dueSum("income", (dueKey) => dueKey === todayKey)
  const getFutureSum = (type: "income" | "expense", days: number) => {
    const limitKey = dateKey(addDays(today, days))
    return dueSum(type, (dueKey) => dueKey >= todayKey && dueKey <= limitKey)
  }

  const payables7d = getFutureSum("expense", 7)
  const receivables7d = getFutureSum("income", 7)
  const payables15d = getFutureSum("expense", 15)
  const receivables15d = getFutureSum("income", 15)
  const payables30d = getFutureSum("expense", 30)
  const receivables30d = getFutureSum("income", 30)

  const futureCommitments = (type: "income" | "expense") => {
    const limitKey = dateKey(addDays(today, 30))
    return pendingDueTxs
      .filter((tx) => tx.type === type && tx.dueKey >= todayKey && tx.dueKey <= limitKey)
      .sort((a, b) => a.dueKey.localeCompare(b.dueKey))
      .slice(0, 8)
      .map((tx) => ({
        id: tx.id,
        label: tx.description || tx.category || (type === "expense" ? "Conta prevista" : "Recebível previsto"),
        amount: round(tx.amount),
        dueDate: tx.dueKey,
        daysUntilDue: Math.max(0, Math.round((new Date(`${tx.dueKey}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / 86400000)),
      }))
  }

  // Regra 4 — Time-Based Operational Pressure
  let pressureWindowStartDays: number | null = null
  let pressureWindowEndDays: number | null = null
  let runningBalance = reconciledCashBalance

  for (let d = 0; d <= 30; d++) {
    const dayKey = dateKey(addDays(today, d))
    const dayTxs = pendingDueTxs.filter((tx) => d === 0 ? tx.dueKey <= dayKey : tx.dueKey === dayKey)

    const dayIncome = dayTxs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0)
    const dayExpense = dayTxs.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0)

    runningBalance += (dayIncome - dayExpense)

    if (runningBalance < 0 && pressureWindowStartDays === null) {
      pressureWindowStartDays = d
    }
    if (runningBalance >= 0 && pressureWindowStartDays !== null && pressureWindowEndDays === null) {
      pressureWindowEndDays = d
    }
  }
  const cashFlowWeekly = weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6)
    const weekTxs = movementRows.filter((movement) => movement.movementDate >= dateKey(weekStart) && movement.movementDate <= dateKey(weekEnd))
    const income = weekTxs.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0)
    const expense = weekTxs.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    return { label: weekLabel(weekStart), value: round(income), secondary: round(expense), tertiary: round(income - expense) }
  })
  const expenseMap = new Map<string, number>()
  for (const tx of transactionRows.filter((item) => item.type === "expense" && item.status !== "cancelled")) {
    if (isOwnerEquityTransaction(tx)) continue
    expenseMap.set(tx.category, (expenseMap.get(tx.category) || 0) + tx.amount)
  }

  const openLeads = leadsResult.rows.filter((lead) => isActionableLead(lead.status)).length
  const convertedLeads = leadsResult.rows.filter((lead) => lead.status === "sold" || saleFacts.some((sale) => sale.marketing_lead_id === lead.id)).length
  const activeStockValue = activeStock.reduce((sum, row) => sum + getInventoryCapitalValue({
    unit_cost: row.unitCost,
    purchase_price: row.purchasePrice,
    quantity: row.quantity,
  }), 0)
  const nextPayables = futureCommitments("expense")
  const nextReceivables = futureCommitments("income")
  const liquidityForecast = {
    overduePayables: round(overduePayables),
    overdueReceivables: round(overdueReceivables),
    todayPayables: round(todayPayables),
    todayReceivables: round(todayReceivables),
    payables7d: round(payables7d),
    receivables7d: round(receivables7d),
    payables15d: round(payables15d),
    receivables15d: round(receivables15d),
    payables30d: round(payables30d),
    receivables30d: round(receivables30d),
    pressureWindowStartDays,
    pressureWindowEndDays,
    nextPayables,
    nextReceivables,
  }
  const financialScenarioSnapshot = buildFinancialScenarioSnapshot({
    realProfitSnapshot,
    activeInventoryItems: activeInventoryForFinance,
    availableLiquidity: ledgerSnapshot.availableLiquidity,
    pendingReceivables,
    upcomingBills30d: payables30d,
    inventoryLiquidityQuality,
  })
  const workingCapitalSnapshot = buildWorkingCapitalSnapshot({
    availableCash: ledgerSnapshot.availableLiquidity,
    reconciledCashBalance,
    activeInventoryItems: activeInventoryForFinance.map((item) => ({
      id: item.id,
      purchasePrice: item.purchasePrice,
      quantity: item.quantity,
      costStructured: item.purchasePrice > 0,
    })),
    financialScenarioSnapshot,
    realProfitSnapshot,
    estimatedOperationalProfit: availableOperationalProfitEstimate,
    upcomingBills30d: payables30d,
    pendingReceivables,
    pendingPayables,
  })
  const ownerMovementInputs = transactionRows.map((tx) => ({
    id: tx.id,
    type: tx.type,
    status: tx.status,
    amount: tx.amount,
    date: tx.date,
    dueDate: tx.dueDate,
    createdAt: tx.createdAt,
    category: tx.category,
    description: tx.description,
    accountName: tx.accountName,
    sourceType: tx.sourceType,
    sourceId: tx.sourceId,
    financialType: tx.financialType,
    statementSection: tx.statementSection,
    affectsInventory: tx.affectsInventory,
    affectsOwnerEquity: tx.affectsOwnerEquity,
  }))
  const ownerCapitalSnapshot = buildOwnerCapitalSnapshot({
    period: selectedFinancialPeriod,
    movements: ownerMovementInputs,
  })
  const profitAvailabilitySnapshot = buildProfitAvailabilitySnapshot({
    period: selectedFinancialPeriod,
    sales: allRealProfitSnapshot.sales.map((sale) => {
      const reconciliation = saleReconciliation.get(sale.saleId)
      const saleFact = saleFactById.get(sale.saleId)
      return {
        saleId: sale.saleId,
        saleLabel: sale.saleLabel,
        economicRevenue: sale.economicRevenue,
        operationalProfit: sale.operationalProfit,
        projectedInventoryProfit: 0,
        reconciliationDate: reconciliation?.reconciliationDate || null,
        saleDate: saleFact?.sale_date || null,
        tracedRevenue: reconciliation?.tracedRevenue || 0,
        hasSalePayment: reconciliation?.hasSalePayment || false,
        hasTransaction: reconciliation?.hasTransaction || false,
        hasLedgerMovement: reconciliation?.hasLedgerMovement || false,
      }
    }),
    transactions: ownerMovementInputs,
    availableCashNow: ledgerSnapshot.availableLiquidity,
    upcomingBills: payables30d,
    protectedOperationalCapital: workingCapitalSnapshot.protectedOperationalCapital,
    safeWithdrawalAmount: workingCapitalSnapshot.safeWithdrawalAmount,
    safeReinvestmentAmount: workingCapitalSnapshot.safeReinvestmentAmount,
    projectedInventoryProfit: financialScenarioSnapshot.projectedInventoryProfit,
    ownerCapitalSnapshot,
  })
  const currentCashCompositionSnapshot = buildCurrentCashCompositionSnapshot({
    asOf: new Date().toISOString(),
    cashByAccount: ledgerSnapshot.accountBalances.map((account) => ({
      accountId: account.id,
      accountName: account.name,
      reconciledBalance: account.ledgerBalance,
      availableLiquidity: account.ledgerBalance,
    })),
    consolidatedCash: ledgerSnapshot.availableLiquidity,
    profitAvailability: profitAvailabilitySnapshot,
    protectedOperationalCapital: workingCapitalSnapshot.protectedOperationalCapital,
    pendingReceivables,
    pendingPayables,
    upcomingBills: payables30d,
  })
  const financialConfidenceBreakdown = buildFinancialConfidenceBreakdown({
    financialScenario: financialScenarioSnapshot,
    inventoryLiquidityQuality,
    financialSafetyAudit: workingCapitalSnapshot.financialSafetyAudit,
    realProfitSnapshot,
    staleAccountBalance: ledgerSnapshot.staleAccountBalance,
    ledgerVsAccountDiff: ledgerSnapshot.ledgerVsAccountDiff,
    pendingReceivables,
    pendingPayables,
  })
  const financialOperationalContext = buildFinancialOperationalContext({
    finance: {
      reconciledCashBalance,
      availableLiquidity: ledgerSnapshot.availableLiquidity,
      pendingBalance: ledgerSnapshot.pendingBalance,
      availableOperationalProfitEstimate,
      moneyClassification,
      realProfitSnapshot,
      workingCapitalSnapshot,
      financialScenarioSnapshot,
      inventoryLiquidityQuality,
      financialConfidenceBreakdown,
      ownerCapitalSnapshot,
      profitAvailabilitySnapshot,
      currentCashCompositionSnapshot,
      staleAccountBalance: ledgerSnapshot.staleAccountBalance,
      ledgerVsAccountDiff: ledgerSnapshot.ledgerVsAccountDiff,
    },
    executive: {
      pendingReceivables,
      pendingPayables,
      activeStockValue,
      liquidityForecast,
    },
    stock: {
      stuckItems,
    },
  })

  return {
    generatedAt: new Date().toISOString(),
    companyName,
    dataBasis: "internal",
    executive: {
      revenue30d: round(revenue30d),
      revenuePrevious30d: round(revenuePrevious30d),
      sales30d: sales30.length,
      salesPrevious30d: salesPrevious30.length,
      averageTicket30d: sales30.length ? round(revenue30d / sales30.length) : 0,
      profit30d: round(profit30d),
      marginPct30d: revenue30d ? round((profit30d / revenue30d) * 100, 1) : 0,
      cashBalance: round(reconciledCashBalance),
      pendingReceivables: round(pendingReceivables),
      pendingPayables: round(pendingPayables),
      leadsOpen: openLeads,
      leadsWithoutFollowUp: forgottenLeads.length,
      conversionRate30d: leadsResult.rows.length ? round((convertedLeads / leadsResult.rows.length) * 100, 1) : 0,
      activeStockValue: round(activeStockValue),
      stuckStockCount: stuckItems.length,
      liquidityForecast,
    },
    stock: {
      totalItems: stockRows.length,
      activeItems: activeStock.length,
      reservedItems: stockRows.filter((row) => row.status === "reserved").length,
      soldItems: stockRows.filter((row) => row.status === "sold").length,
      averageActiveDays: activeStock.length ? round(activeStock.reduce((sum, row) => sum + row.daysInStock, 0) / activeStock.length, 1) : 0,
      stuckItems,
      availableItems: [...activeStock]
        .sort((a, b) => b.suggestedPrice - a.suggestedPrice || b.daysInStock - a.daysInStock)
        .slice(0, 24),
      agingBuckets,
      topSlowCategories: Array.from(activeStock.reduce((map, row) => {
        const current = map.get(row.category) || 0
        map.set(row.category, current + row.daysInStock)
        return map
      }, new Map<string, number>()), ([label, value]) => ({ label, value: round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    },
    sales: {
      weeklyRevenue,
      marginTrend,
      topProducts: groupSales("product_name").slice(0, 6),
      lowProducts: groupSales("product_name").filter((item) => item.secondary && item.secondary <= 1).slice(-6).reverse(),
      paymentMix: groupSales("payment_method").slice(0, 6),
      periodPerformance,
      reinvestmentAnalysisWindow,
      reinvestmentCandidates,
    },
    marketing: {
      campaigns,
      leadFunnel: Array.from(leadStatusMap, ([label, value]) => ({ label: humanizeChartLabel(label), value })),
      leadOrigins: Array.from(leadOriginMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      forgottenLeads,
    },
    finance: {
      cashBalanceSource,
      reconciledCashBalance: round(reconciledCashBalance),
      accountCashBalance: round(accountCashBalance),
      availableLiquidity: round(ledgerSnapshot.availableLiquidity),
      pendingBalance: round(ledgerSnapshot.pendingBalance),
      staleAccountBalance: ledgerSnapshot.staleAccountBalance,
      ledgerVsAccountDiff: round(ledgerSnapshot.ledgerVsAccountDiff),
      operationalCashFlow30d: round(operationalCashFlow30d),
      ownerEquityMovement30d: round(ownerEquityMovement30d),
      reconciledIncome30d: round(reconciledIncome30d),
      reconciledExpense30d: round(reconciledExpense30d),
      reconciledSalesRevenue30d: round(reconciledSalesRevenue30d),
      reconciledSalesProfit30d: round(reconciledSalesProfit30d),
      availableSalesProfit: round(availableSalesProfit),
      availableOperationalProfitEstimate,
      selectedFinancialPeriod,
      moneyClassification,
      realProfitSnapshot,
      financialScenarioSnapshot,
      inventoryLiquidityQuality,
      financialConfidenceBreakdown,
      ownerCapitalSnapshot,
      profitAvailabilitySnapshot,
      currentCashCompositionSnapshot,
      workingCapitalSnapshot,
      financialOperationalContext,
      profitWindowStart,
      cashFlowWeekly,
      expenseCategories: Array.from(expenseMap, ([label, value]) => ({ label, value: round(value) })).sort((a, b) => b.value - a.value).slice(0, 8),
      accountBalances: derivedAccountBalances,
    },
  }
}

export function getOrionCacheMinutes() {
  return CACHE_MINUTES
}

export function hashOrionPrompt(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function hasOrionLogTable() {
  return pool
    .query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'orion_ai_analysis_logs'
        ) AS exists
      `
    )
    .then((result) => Boolean(result.rows[0]?.exists))
    .catch(() => false)
}

export async function getCachedOrionAnalysis(companyId: string, analysisType: string, promptHash: string) {
  if (!(await hasOrionLogTable())) return null
  const result = await pool.query<{
    response_json: OrionAnalysis
    model: string | null
    created_at: string
  }>(
    `
      SELECT response_json, model, created_at
      FROM orion_ai_analysis_logs
      WHERE company_id = $1::uuid
        AND analysis_type = $2
        AND prompt_hash = $3
        AND status IN ('success', 'local')
        AND created_at >= NOW() - ($4::text || ' minutes')::interval
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [companyId, analysisType, promptHash, CACHE_MINUTES]
  )
  return result.rows[0] || null
}

export async function getLatestOrionAnalysis(companyId: string) {
  if (!(await hasOrionLogTable())) return null
  const result = await pool.query<{ response_json: OrionAnalysis }>(
    `
      SELECT response_json
      FROM orion_ai_analysis_logs
      WHERE company_id = $1::uuid
        AND status IN ('success', 'local')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [companyId]
  )
  return result.rows[0]?.response_json || null
}

export async function saveOrionAnalysisLog(input: {
  companyId: string
  userId: string
  analysisType: string
  question?: string | null
  promptHash: string
  model?: string | null
  status: "success" | "error" | "local"
  responseJson?: OrionAnalysis | null
  snapshot?: unknown
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number | null
  errorMessage?: string | null
}) {
  if (!(await hasOrionLogTable())) return
  await pool.query(
    `
      INSERT INTO orion_ai_analysis_logs (
        company_id,
        user_id,
        analysis_type,
        question,
        prompt_hash,
        model,
        status,
        response_json,
        data_snapshot,
        input_tokens,
        output_tokens,
        total_tokens,
        estimated_cost_usd,
        external_sources_enabled,
        error_message
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, FALSE, $14)
    `,
    [
      input.companyId,
      input.userId,
      input.analysisType,
      input.question || null,
      input.promptHash,
      input.model || null,
      input.status,
      JSON.stringify(input.responseJson || null),
      JSON.stringify(input.snapshot || null),
      input.inputTokens || 0,
      input.outputTokens || 0,
      input.totalTokens || 0,
      input.estimatedCostUsd ?? null,
      input.errorMessage || null,
    ]
  )
}

export async function getOrionHistory(companyId: string): Promise<OrionHistoryItem[]> {
  if (!(await hasOrionLogTable())) return []
  const result = await pool.query<{
    id: string
    analysis_type: string
    question: string | null
    model: string | null
    status: string
    total_tokens: string | number | null
    estimated_cost_usd: string | number | null
    created_at: string
    response_json: OrionAnalysis | null
  }>(
    `
      SELECT id, analysis_type, question, model, status, total_tokens, estimated_cost_usd, created_at, response_json
      FROM orion_ai_analysis_logs
      WHERE company_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 12
    `,
    [companyId]
  )

  return result.rows.map((row) => {
    const savedSummary = humanizeOrionText(row.response_json?.executive_summary || row.response_json?.summary || "Análise sem resumo salvo.")
    return {
      id: row.id,
      analysisType: row.analysis_type,
      question: row.question,
      model: row.model,
      status: row.status,
      totalTokens: number(row.total_tokens),
      estimatedCostUsd: row.estimated_cost_usd == null ? null : number(row.estimated_cost_usd),
      createdAt: row.created_at,
      summary: savedSummary.startsWith("Análise baseada nos dados internos")
        ? "Análise executiva anterior salva no histórico da ORION."
        : savedSummary,
    }
  })
}

export async function getOrionUsage(companyId: string): Promise<OrionUsageSummary> {
  const monthlyLimit = process.env.ORION_AI_MONTHLY_CALL_LIMIT ? Number(process.env.ORION_AI_MONTHLY_CALL_LIMIT) : null
  if (!(await hasOrionLogTable())) {
    return {
      callsThisMonth: 0,
      inputTokensThisMonth: 0,
      outputTokensThisMonth: 0,
      totalTokensThisMonth: 0,
      estimatedCostUsdThisMonth: null,
      monthlyLimit: Number.isFinite(monthlyLimit) ? monthlyLimit : null,
    }
  }

  const result = await pool.query<{
    model: string | null
    input_tokens: string | number | null
    output_tokens: string | number | null
    total_tokens: string | number | null
    estimated_cost_usd: string | number | null
  }>(
    `
      SELECT
        model,
        COALESCE(input_tokens, 0) AS input_tokens,
        COALESCE(output_tokens, 0) AS output_tokens,
        COALESCE(total_tokens, 0) AS total_tokens,
        estimated_cost_usd
      FROM orion_ai_analysis_logs
      WHERE company_id = $1::uuid
        AND created_at >= date_trunc('month', NOW())
    `,
    [companyId]
  )
  const callsThisMonth = result.rows.length
  const inputTokensThisMonth = result.rows.reduce((sum, row) => sum + number(row.input_tokens), 0)
  const outputTokensThisMonth = result.rows.reduce((sum, row) => sum + number(row.output_tokens), 0)
  const totalTokensThisMonth = result.rows.reduce((sum, row) => sum + number(row.total_tokens), 0)
  const estimatedCosts = result.rows
    .map((row) => row.estimated_cost_usd == null
      ? estimateOpenAICostUsd(row.model, number(row.input_tokens), number(row.output_tokens))
      : number(row.estimated_cost_usd))
    .filter((value): value is number => value !== null)

  return {
    callsThisMonth,
    inputTokensThisMonth,
    outputTokensThisMonth,
    totalTokensThisMonth,
    estimatedCostUsdThisMonth: estimatedCosts.length ? round(estimatedCosts.reduce((sum, value) => sum + value, 0), 6) : null,
    monthlyLimit: Number.isFinite(monthlyLimit) ? monthlyLimit : null,
  }
}
