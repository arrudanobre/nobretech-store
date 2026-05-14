import type { OrionBusinessReview } from "./business-review-engine"
import {
  buildDecisionMemoryCandidate,
  buildOrionBusinessDecision,
  reviewHorizonDaysFor,
  type OrionBusinessDecision,
} from "./business-decision-orchestrator"
import { buildFinancialTraceabilityResponse, buildReinvestmentAuditBreakdown } from "./financial-decision-response"
import { selectFinancialTraceabilityKind } from "./financial-traceability-router"
import { dedupeDecisionMemories, type OrionDecisionMemoryContext, type OrionDecisionMemoryInput } from "./orion-decision-memory-store"
import { buildExecutiveVoice, type OrionExecutiveVoice } from "./orion-executive-voice-layer"
import type { OrionExecutiveConversation } from "./orion-executive-conversation-layer"
import { buildReinvestmentDecision, type ReinvestmentDecision } from "./reinvestment-intelligence-engine"
import { buildSemanticPlan, type OrionSemanticPlan } from "./semantic-planner"
import type { OrionAppliedOperationalMemoryContext } from "./operational-memory"
import type { OrionSnapshot } from "./types"

export type OrionResponseKind =
  | "reinvestment_decision"
  | "business_decision"
  | "decision_memory_review"
  | "business_review"
  | "cash_health_summary"
  | "audit_traceability"
  | "generic_executive"

export type OrionResponseRenderMode =
  | "structured_cards"
  | "executive_blocks"
  | "audit_blocks"
  | "plain_text"

export type OrionCashHealthSummary = {
  timeframeLabel: string
  blocks: Array<{
    title: string
    body: string
  }>
  keyNumbers: Array<{
    label: string
    value: number
  }>
  primaryRecommendation: string
}

export type OrionDecisionMemoryReviewItem = {
  id: string
  decisionType: string
  title: string
  recommendation: string
  status: string
  priority: string
  confidence: string
  resultStatus: string
  reviewAfter: string | null
  decisionKey: string | null
}

export type OrionDecisionMemoryReview = {
  openDecisions: OrionDecisionMemoryReviewItem[]
  recentResolved?: OrionDecisionMemoryReviewItem[]
  caveats: string[]
}

export type OrionResponsePayload = {
  responseKind: OrionResponseKind
  text: string
  renderMode: OrionResponseRenderMode
  semanticPlan: OrionSemanticPlan
  structured?: {
    reinvestmentDecision?: ReinvestmentDecision
    businessDecision?: OrionBusinessDecision
    decisionMemoryReview?: OrionDecisionMemoryReview
    businessReview?: OrionBusinessReview
    cashHealthSummary?: OrionCashHealthSummary
    auditBreakdown?: {
      text: string
    }
  }
  decisionMemoryCandidates?: OrionDecisionMemoryInput[]
  executiveVoice?: OrionExecutiveVoice
  executiveConversation?: OrionExecutiveConversation
}

export type BuildOrionResponseInput = {
  semanticPlan?: OrionSemanticPlan | null
  snapshot: OrionSnapshot
  userQuestion: string
  memoryContext?: OrionAppliedOperationalMemoryContext | null
  decisionMemoryContext?: OrionDecisionMemoryContext | null
  companyId?: string | null
}

function decisionKeyFromMemoryPayload(payload: Record<string, unknown> | null | undefined) {
  const raw = payload?.decisionKey
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

function decisionMemoryReviewItem(memory: OrionDecisionMemoryContext["openDecisions"][number]): OrionDecisionMemoryReviewItem {
  return {
    id: memory.id,
    decisionType: memory.decisionType,
    title: memory.title,
    recommendation: memory.recommendation,
    status: memory.status,
    priority: memory.priority,
    confidence: memory.confidence,
    resultStatus: memory.resultStatus,
    reviewAfter: memory.reviewAfter,
    decisionKey: decisionKeyFromMemoryPayload(memory.decisionPayload),
  }
}

function buildDecisionMemoryReviewResponse(
  plan: OrionSemanticPlan,
  decisionMemoryContext?: OrionDecisionMemoryContext | null
): OrionResponsePayload {
  const openDecisions = dedupeDecisionMemories(decisionMemoryContext?.openDecisions || []).slice(0, 5).map(decisionMemoryReviewItem)
  const recentResolved = dedupeDecisionMemories(decisionMemoryContext?.recentDecisions || [])
    .filter((memory) => memory.status !== "open" && memory.status !== "in_progress")
    .slice(0, 3)
    .map(decisionMemoryReviewItem)
  const review: OrionDecisionMemoryReview = {
    openDecisions,
    recentResolved,
    caveats: openDecisions.length
      ? ["Fonte: orion_decision_memory."]
      : ["Sem decisões abertas na orion_decision_memory."],
  }
  const text = openDecisions.length
    ? [
        "Decisões em acompanhamento",
        ...openDecisions.map((memory) => `${memory.title}: ${memory.recommendation}`),
      ].join("\n")
    : "Não tenho decisões abertas em acompanhamento agora."
  return {
    responseKind: "decision_memory_review",
    renderMode: "structured_cards",
    semanticPlan: plan,
    structured: { decisionMemoryReview: review },
    text,
  }
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value)
}

function readNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildReinvestmentResponse(plan: OrionSemanticPlan, snapshot: OrionSnapshot, companyId: string | null): OrionResponsePayload {
  const reinvestmentDecision = buildReinvestmentDecision(snapshot)
  const candidates: OrionDecisionMemoryInput[] = []
  if (companyId && reinvestmentDecision.recommendedReinvestmentAmount > 0 && reinvestmentDecision.recommendedProducts.length > 0) {
    const top = reinvestmentDecision.recommendedProducts[0]
    const entitySlug = top.label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    const days = reviewHorizonDaysFor("capital_allocation")
    const reviewAfter = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    candidates.push({
      companyId,
      decisionType: "capital_allocation",
      title: `Recompra recomendada: ${top.label}`,
      recommendation: reinvestmentDecision.recommendedAction,
      reason: top.reason || "Reinvestment Intelligence indicou produto prioritário.",
      priority: "high",
      confidence: reinvestmentDecision.confidence === "low" ? "low" : reinvestmentDecision.confidence === "medium" ? "medium" : "high",
      sourceQuestion: "",
      decisionPayload: {
        decisionKey: `${entitySlug}:buy`,
        subtype: "buy",
        entityLabel: top.label,
        amount: reinvestmentDecision.recommendedReinvestmentAmount,
        safeCap: reinvestmentDecision.safeReinvestmentCap,
      },
      expectedOutcome: {
        action: reinvestmentDecision.recommendedAction,
        targetProducts: reinvestmentDecision.recommendedProducts.slice(0, 3).map((product) => product.label),
      },
      reviewAfter,
    })
  }
  return {
    responseKind: "reinvestment_decision",
    renderMode: "structured_cards",
    semanticPlan: plan,
    structured: { reinvestmentDecision },
    decisionMemoryCandidates: candidates,
    text: [
      "Decisão de recompra:",
      reinvestmentDecision.recommendedAction,
      `Recompra recomendada: ${brl(reinvestmentDecision.recommendedReinvestmentAmount)}.`,
      `Reserva mínima: ${brl(reinvestmentDecision.preserveCashAmount)}.`,
      `Teto teórico: ${brl(reinvestmentDecision.safeReinvestmentCap)}.`,
    ].join("\n"),
  }
}

function renderBusinessDecisionBlocks(decision: OrionBusinessDecision): string {
  const lines: string[] = [
    `Decisão: ${decision.recommendation.title}`,
    decision.recommendation.action,
    `Por quê: ${decision.recommendation.reason}`,
  ]
  if (decision.keyFindings.length) {
    lines.push([
      "Evidências:",
      ...decision.keyFindings.slice(0, 5).map((finding) => `- ${finding.label}${finding.value ? `: ${finding.value}` : ""}. ${finding.evidence}`),
    ].join("\n"))
  }
  if (decision.nextSteps.length) {
    lines.push([
      "Próximos passos:",
      ...decision.nextSteps.slice(0, 3).map((step) => `- ${step.action}`),
    ].join("\n"))
  }
  if (decision.caveats.length) {
    lines.push([
      "Limitações:",
      ...decision.caveats.slice(0, 3).map((caveat) => `- ${caveat}`),
    ].join("\n"))
  }
  return lines.join("\n\n")
}

function buildBusinessDecisionResponse(
  plan: OrionSemanticPlan,
  snapshot: OrionSnapshot,
  userQuestion: string,
  memoryContext?: OrionAppliedOperationalMemoryContext | null,
  decisionMemoryContext?: OrionDecisionMemoryContext | null,
  companyId?: string | null
): OrionResponsePayload {
  const businessDecision = buildOrionBusinessDecision({
    semanticPlan: plan,
    snapshot,
    userQuestion,
    memoryContext,
    decisionMemoryContext: decisionMemoryContext || null,
  })
  const candidates: OrionDecisionMemoryInput[] = []
  if (companyId) {
    const candidate = buildDecisionMemoryCandidate(businessDecision, userQuestion)
    if (candidate) candidates.push({ companyId, ...candidate })
  }
  return {
    responseKind: "business_decision",
    renderMode: "executive_blocks",
    semanticPlan: plan,
    structured: { businessDecision },
    decisionMemoryCandidates: candidates,
    text: renderBusinessDecisionBlocks(businessDecision),
  }
}

function buildCashHealthSummary(plan: OrionSemanticPlan, snapshot: OrionSnapshot): OrionResponsePayload {
  const cash = readNumber(snapshot.executive?.cashBalance ?? snapshot.finance?.reconciledCashBalance)
  const receivables = readNumber(snapshot.executive?.pendingReceivables ?? snapshot.finance?.pendingBalance)
  const payables = readNumber(snapshot.executive?.liquidityForecast?.payables7d)
  const timeframeLabel = plan.timeframe.label || snapshot.finance?.selectedFinancialPeriod?.label || "hoje"
  const cashCovered = cash >= payables
  const profitAvailability = snapshot.finance?.profitAvailabilitySnapshot
  const profitAfterWithdrawals = readNumber(profitAvailability?.profitAfterWithdrawals)
  const primaryRecommendation = profitAfterWithdrawals > 0
    ? "Operar normalmente, mas manter recompra seletiva e não tratar todo caixa como lucro livre."
    : "Preservar caixa e priorizar conciliação/entrada de venda antes de assumir nova compra relevante."
  const cashHealthSummary: OrionCashHealthSummary = {
    timeframeLabel,
    keyNumbers: [
      { label: "Caixa", value: cash },
      { label: "Recebíveis", value: receivables },
      { label: "Contas próximas", value: payables },
    ],
    primaryRecommendation,
    blocks: [
      {
        title: "Situação",
        body: cashCovered
          ? "Caixa cobre as obrigações próximas, mas ainda precisa ser separado de lucro livre."
          : "Caixa está pressionado pelas obrigações próximas; a prioridade é liquidez.",
      },
      {
        title: "Números-chave",
        body: `Caixa: ${brl(cash)}. Recebíveis: ${brl(receivables)}. Contas próximas: ${brl(payables)}.`,
      },
      {
        title: "Minha leitura",
        body: profitAfterWithdrawals > 0
          ? `Lucro após retiradas está em ${brl(profitAfterWithdrawals)}; isso permite decisão seletiva, não agressiva.`
          : "Lucro livre ainda não sustenta uma decisão agressiva; caixa não deve ser confundido com sobra operacional.",
      },
      {
        title: "Próximo movimento",
        body: primaryRecommendation,
      },
    ],
  }

  return {
    responseKind: "cash_health_summary",
    renderMode: "executive_blocks",
    semanticPlan: plan,
    structured: { cashHealthSummary },
    text: cashHealthSummary.blocks.map((block) => `${block.title}\n${block.body}`).join("\n\n"),
  }
}

function buildAuditTraceabilityResponse(plan: OrionSemanticPlan, snapshot: OrionSnapshot, userQuestion: string): OrionResponsePayload {
  const reinvestmentDecision = buildReinvestmentDecision(snapshot)
  const kind = selectFinancialTraceabilityKind(userQuestion)
  const auditText = snapshot.finance?.financialOperationalContext
    ? buildFinancialTraceabilityResponse(snapshot.finance.financialOperationalContext, userQuestion, reinvestmentDecision)
    : kind === "reinvestment_audit" || plan.primaryGoal === "audit_traceability"
      ? buildReinvestmentAuditBreakdown(reinvestmentDecision)
    : null
  const text = auditText || "Não encontrei composição financeira detalhada suficiente no snapshot atual."
  return {
    responseKind: "audit_traceability",
    renderMode: "audit_blocks",
    semanticPlan: plan,
    structured: { auditBreakdown: { text } },
    text,
  }
}

// Labels that come from memory/context cards and must NEVER be treated as the recommended product.
const NON_PRODUCT_LABELS = new Set([
  "decisao estrategica pendente",
  "decisao de capital pendente",
  "decisao de trafego pendente",
  "decisao de estoque pendente",
  "decisao de marketing pendente",
  "acao operacional pendente",
  "contexto anterior",
  "caixa",
  "teto seguro",
  "orcamento informado",
  "lucro rastreavel",
  "vendas comerciais",
  "melhor sinal comercial",
])

function normalizeProductCandidate(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isProductLabel(value: string | null | undefined): boolean {
  const normalized = normalizeProductCandidate(value)
  if (!normalized) return false
  return !NON_PRODUCT_LABELS.has(normalized)
}

function selectTopProductLabel(
  businessDecision: OrionBusinessDecision | null,
  reinvestmentDecision: ReinvestmentDecision | null
): string | null {
  const reinvestmentLabel = reinvestmentDecision?.recommendedProducts?.find((p) => isProductLabel(p.label))?.label
  if (reinvestmentLabel) return reinvestmentLabel

  if (businessDecision?.keyFindings?.length) {
    const signalFinding = businessDecision.keyFindings.find(
      (f) => normalizeProductCandidate(f.label) === "melhor sinal comercial"
    )
    if (signalFinding?.value && isProductLabel(signalFinding.value)) return signalFinding.value
    for (const finding of businessDecision.keyFindings) {
      if (isProductLabel(finding.label)) return finding.label
    }
  }
  return null
}

function attachExecutiveVoice(payload: OrionResponsePayload, companyId: string | null, snapshot: OrionSnapshot): OrionResponsePayload {
  const cashBalance = readNumber(snapshot.executive?.cashBalance ?? snapshot.finance?.reconciledCashBalance)
  const businessDecision = payload.structured?.businessDecision || null
  const decisionMemoryReview = payload.structured?.decisionMemoryReview || null
  const reinvestmentDecision = payload.structured?.reinvestmentDecision || null
  const businessDecisionType = businessDecision?.decisionType || null

  const topProduct = selectTopProductLabel(businessDecision, reinvestmentDecision)
  const primaryOpen = decisionMemoryReview?.openDecisions?.[0] || null

  const context = {
    recommendationTitle: businessDecision?.recommendation?.title || null,
    recommendationAction: businessDecision?.recommendation?.action || reinvestmentDecision?.recommendedAction || null,
    recommendationReason: businessDecision?.recommendation?.reason || null,
    topProductLabel: topProduct,
    firstNextStep: businessDecision?.nextSteps?.[0]?.action || null,
    secondNextStep: businessDecision?.nextSteps?.[1]?.action || null,
    primaryAvoid: businessDecision?.avoid?.[0]?.reason || businessDecision?.avoid?.[0]?.title || null,
    primaryRisk: businessDecision?.keyFindings?.find((f) => f.severity === "critical" || f.severity === "attention")?.evidence || null,
    openDecisionsCount: decisionMemoryReview?.openDecisions?.length || 0,
    primaryOpenDecisionTitle: primaryOpen?.title || null,
    primaryOpenDecisionRecommendation: primaryOpen?.recommendation || null,
  }

  const voice = buildExecutiveVoice({
    responseKind: payload.responseKind,
    businessDecisionType,
    cashBalance,
    seed: companyId || "",
    context,
  })
  return { ...payload, executiveVoice: voice }
}

export function buildOrionResponse(input: BuildOrionResponseInput): OrionResponsePayload {
  const semanticPlan = input.semanticPlan || buildSemanticPlan({ userQuestion: input.userQuestion })

  const companyId = input.companyId || null
  let payload: OrionResponsePayload
  if (semanticPlan.primaryGoal === "decision_memory_review") {
    payload = buildDecisionMemoryReviewResponse(semanticPlan, input.decisionMemoryContext)
  } else if (semanticPlan.primaryGoal === "audit_traceability" || semanticPlan.responseMode === "audit_traceability") {
    payload = buildAuditTraceabilityResponse(semanticPlan, input.snapshot, input.userQuestion)
  } else if (semanticPlan.primaryGoal === "purchase_capacity" || semanticPlan.primaryGoal === "reinvestment_decision") {
    payload = buildReinvestmentResponse(semanticPlan, input.snapshot, companyId)
  } else if (
    semanticPlan.primaryGoal === "capital_allocation"
    || semanticPlan.primaryGoal === "business_strategy"
    || semanticPlan.primaryGoal === "operational_action"
    || semanticPlan.primaryGoal === "business_review"
    || semanticPlan.primaryGoal === "marketing_strategy"
    || semanticPlan.primaryGoal === "campaign_review"
    || semanticPlan.primaryGoal === "inventory_priority"
    || semanticPlan.primaryGoal === "inventory_review"
    || semanticPlan.primaryGoal === "sales_performance_review"
    || semanticPlan.primaryGoal === "lead_review"
  ) {
    payload = buildBusinessDecisionResponse(semanticPlan, input.snapshot, input.userQuestion, input.memoryContext, input.decisionMemoryContext, companyId)
  } else if (semanticPlan.primaryGoal === "cash_health") {
    payload = buildCashHealthSummary(semanticPlan, input.snapshot)
  } else {
    payload = {
      responseKind: "generic_executive",
      renderMode: "plain_text",
      semanticPlan,
      text: "",
    }
  }
  return attachExecutiveVoice(payload, companyId, input.snapshot)
}
