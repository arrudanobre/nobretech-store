import type {
  OrionAnalysis,
  OrionCommercialSubjectSummary,
  OrionConversationIntent,
  OrionExecutionPayload,
  OrionInsight,
  OrionOperationalContext,
  OrionOperationalConversationState,
  OrionOperationalGoal,
  OrionReasoningMode,
  OrionSnapshot,
} from "@/lib/orion/types"
import { isFinancialReasoningMode } from "@/lib/orion/execution-guardrails"

// ─── Operational Memory ─────────────────────────────────────────────────────
// Prevents the ORION from repeating the exact same recommendation day after day.
// Queries recent analysis logs to detect previously emitted insights.

const MEMORY_HOURS_DEFAULT = 48
const SEED_COMPANY_ID = "nobretech"

export type OrionOperationalMemoryType =
  | "business_behavior"
  | "pricing_behavior"
  | "campaign_pattern"
  | "sales_pattern"
  | "lead_behavior"
  | "inventory_pattern"
  | "financial_pattern"
  | "risk_pattern"
  | "decision_preference"
  | "execution_bottleneck"
  | "user_feedback"

export type OrionOperationalMemorySource =
  | "explicit_user_feedback"
  | "observed_result"
  | "system_snapshot"
  | "campaign_result"
  | "financial_result"
  | "manual_note"

export type OrionOperationalMemoryScope =
  | "global_business"
  | "product"
  | "category"
  | "campaign"
  | "lead"
  | "financial"

export type OrionOperationalMemoryStatus = "active" | "deprecated" | "contradicted"

export type OrionOperationalMemoryTag =
  | "margin_protection"
  | "controlled_discount"
  | "whatsapp_first"
  | "service_speed"
  | "controlled_traffic"
  | "service_bottleneck"
  | "bundle_margin"
  | "premium_liquidity_risk"
  | "lead_fit"
  | "cash_pressure"
  | "inventory_pressure"
  | "financial_discipline"
  | "real_profit_first"

export type OrionOperationalMemory = {
  id: string
  companyId: string
  type: OrionOperationalMemoryType
  summary: string
  evidence: string[]
  confidence: number
  source: OrionOperationalMemorySource
  scope: OrionOperationalMemoryScope
  relatedProductId?: string
  relatedCategory?: string
  relatedCampaignId?: string
  relatedLeadId?: string
  tags?: OrionOperationalMemoryTag[]
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  usageCount: number
  status: OrionOperationalMemoryStatus
}

export type BusinessPersonalityProfile = {
  companyId: string
  riskTolerance: "low" | "medium" | "high"
  marginPreference: "protect_margin" | "balanced" | "favor_liquidity"
  salesStyle: "premium_consultative" | "fast_turnover" | "price_driven"
  discountPosture: "avoid_early_discount" | "controlled_discount" | "aggressive_promotion"
  executionCapacity: "low" | "medium" | "high"
  preferredChannels: string[]
  knownBottlenecks: string[]
  strategicWarnings: string[]
  decisionPrinciples: string[]
}

export type OrionMemoryInfluenceWeight = 0 | 0.3 | 0.5 | 0.8

export type OrionMemoryInfluence = {
  memory: OrionOperationalMemory
  memoryInfluenceWeight: OrionMemoryInfluenceWeight
  influenceLevel: "ignored" | "light" | "moderate" | "strong"
  conflictWithCurrentData: boolean
  reasons: string[]
}

export type OrionMemoryGuardrails = {
  hierarchy: string[]
  responsePosture: "answer_first_operational" | "execution_ready"
  avoidAutomaticCampaignCta: boolean
  forbidTechnicalTerms: string[]
  recommendedSections: string[]
  decisionRules: string[]
}

export type OrionAppliedOperationalMemoryContext = {
  companyId: string
  generatedAt: string
  relevantOperationalMemories: OrionMemoryInfluence[]
  businessPersonalityProfile: BusinessPersonalityProfile
  memoryGuardrails: OrionMemoryGuardrails
  reasoningNotes: string[]
}

export type OperationalMemorySignals = {
  companyId: string
  generatedAt: string
  intent: OrionConversationIntent | null
  reasoningMode: OrionReasoningMode | null
  goalType: OrionOperationalGoal["goalType"] | null
  optimization: OrionOperationalGoal["optimization"] | null
  subject: {
    productId: string | null
    productName: string | null
    category: string | null
    campaignId: string | null
    leadId: string | null
  }
  finance: {
    cashHealth: "critical" | "attention" | "healthy" | null
    liquidityPressure: "low" | "medium" | "high" | null
    canSafelyReinvest: boolean | null
    canSafelyWithdraw: boolean | null
    realAvailableProfit: number
    protectedCapital: number
  }
  operation: {
    leadsWithoutFollowUp: number
    stuckStockCount: number
    inventoryPressure: "low" | "medium" | "high" | null
    averageActiveDays: number
    recommendedScenario: OrionExecutionPayload["objective"]["recommendedScenario"] | null
    hasTrafficPlan: boolean
    hasPremiumProduct: boolean
    hasBundleAddOns: boolean
  }
  tags: OrionOperationalMemoryTag[]
  runtimeMemories: OrionOperationalMemory[]
}

export type ExtractOperationalMemorySignalsInput = {
  companyId: string
  snapshot?: OrionSnapshot | null
  operationalContext?: OrionOperationalContext | null
  conversationState?: OrionOperationalConversationState | null
  execution?: OrionExecutionPayload | null
  commercialSubject?: OrionCommercialSubjectSummary | null
  now?: string | Date
}

export type SelectOperationalMemoriesInput = ExtractOperationalMemorySignalsInput & {
  memories?: OrionOperationalMemory[]
  limit?: number
}

const seedOperationalMemories: OrionOperationalMemory[] = [
  {
    id: "seed-margin-before-discount",
    companyId: SEED_COMPANY_ID,
    type: "pricing_behavior",
    summary: "A Nobretech tende a proteger margem antes de usar desconto agressivo.",
    evidence: ["Seed auditavel de postura comercial: desconto deve ser ferramenta de fechamento, nao reflexo de ansiedade."],
    confidence: 0.62,
    source: "manual_note",
    scope: "global_business",
    tags: ["margin_protection", "controlled_discount"],
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    usageCount: 1,
    status: "active",
  },
  {
    id: "seed-whatsapp-stock-proof",
    companyId: SEED_COMPANY_ID,
    type: "sales_pattern",
    summary: "WhatsApp com prova de estoque e resposta rapida costuma ser o canal operacional prioritario.",
    evidence: ["Seed auditavel: a venda local depende de confiança, disponibilidade real e velocidade de atendimento."],
    confidence: 0.58,
    source: "manual_note",
    scope: "global_business",
    tags: ["whatsapp_first", "service_speed"],
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    usageCount: 1,
    status: "active",
  },
  {
    id: "seed-traffic-only-with-service-capacity",
    companyId: SEED_COMPANY_ID,
    type: "execution_bottleneck",
    summary: "Trafego pesado so deve entrar quando a operacao consegue responder conversas rapido.",
    evidence: ["Seed auditavel: gerar demanda sem atendimento aumenta desperdicio e lead frio."],
    confidence: 0.6,
    source: "manual_note",
    scope: "global_business",
    tags: ["controlled_traffic", "service_bottleneck"],
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    usageCount: 1,
    status: "active",
  },
  {
    id: "seed-accessories-as-bundle-margin",
    companyId: SEED_COMPANY_ID,
    type: "campaign_pattern",
    summary: "Acessorios funcionam melhor como aumento de margem em bundle do que como produto principal.",
    evidence: ["Seed auditavel: acessorio deve elevar valor percebido da oferta sem roubar foco do item central."],
    confidence: 0.55,
    source: "manual_note",
    scope: "global_business",
    tags: ["bundle_margin"],
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    usageCount: 1,
    status: "active",
  },
  {
    id: "seed-premium-not-fast-liquidity",
    companyId: SEED_COMPANY_ID,
    type: "inventory_pattern",
    summary: "Produtos premium exigem esforço comercial maior e nao devem ser tratados como liquidez rapida.",
    evidence: ["Seed auditavel: ticket alto pode ter margem forte, mas velocidade de conversao menor."],
    confidence: 0.58,
    source: "manual_note",
    scope: "global_business",
    tags: ["premium_liquidity_risk", "inventory_pressure"],
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    usageCount: 1,
    status: "active",
  },
  {
    id: "seed-respect-lead-category",
    companyId: SEED_COMPANY_ID,
    type: "lead_behavior",
    summary: "A ORION deve respeitar a categoria de interesse do lead e evitar oferta incompatível sem evidência.",
    evidence: ["Seed auditavel: produto historico ou prioridade do board nao vence intenção estruturada do lead."],
    confidence: 0.62,
    source: "manual_note",
    scope: "global_business",
    tags: ["lead_fit"],
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    usageCount: 1,
    status: "active",
  },
]

export type RecentInsightRecord = {
  hash: string
  title: string
  category: string
  createdAt: string
}

function nowIso(value?: string | Date) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string" && value) return new Date(value).toISOString()
  return new Date().toISOString()
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function hasTag(memory: OrionOperationalMemory, tag: OrionOperationalMemoryTag) {
  return Boolean(memory.tags?.some((item) => item === tag))
}

function hasAnyTag(memory: OrionOperationalMemory, tags: OrionOperationalMemoryTag[]) {
  return Boolean(memory.tags?.some((item) => tags.includes(item)))
}

function daysBetween(from: string | undefined, toIso: string) {
  if (!from) return 0
  const start = new Date(from).getTime()
  const end = new Date(toIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

function weightLevel(weight: OrionMemoryInfluenceWeight): OrionMemoryInfluence["influenceLevel"] {
  if (weight >= 0.8) return "strong"
  if (weight >= 0.5) return "moderate"
  if (weight >= 0.3) return "light"
  return "ignored"
}

function bucketWeight(score: number): OrionMemoryInfluenceWeight {
  if (score <= 0.14) return 0
  if (score <= 0.39) return 0.3
  if (score <= 0.64) return 0.5
  return 0.8
}

function sourceBoost(source: OrionOperationalMemorySource) {
  if (source === "explicit_user_feedback") return 0.18
  if (source === "observed_result" || source === "financial_result" || source === "campaign_result") return 0.12
  if (source === "system_snapshot") return 0.08
  return 0
}

function subjectFrom(input: ExtractOperationalMemorySignalsInput) {
  const subject = input.commercialSubject || input.conversationState?.commercialSubject || input.operationalContext?.commercialSubject || null
  const primary = subject?.primarySubject || null
  return {
    productId: primary?.inventoryId || input.conversationState?.activeMissionContext?.product?.id || null,
    productName: primary?.productName || subject?.productFamily || subject?.model || input.conversationState?.activeProduct || null,
    category: primary?.category || subject?.category || null,
    campaignId: input.conversationState?.activeCampaign || null,
    leadId: null,
  }
}

function tagsFrom(input: {
  intent: OrionConversationIntent | null
  reasoningMode: OrionReasoningMode | null
  goal?: OrionOperationalGoal | null
  snapshot?: OrionSnapshot | null
  execution?: OrionExecutionPayload | null
}) {
  const tags: OrionOperationalMemoryTag[] = []
  const financial = input.snapshot?.finance.financialOperationalContext
  const realProfit = input.snapshot?.finance.realProfitSnapshot
  if (financial?.cashHealth === "critical" || financial?.liquidityPressure === "high") tags.push("cash_pressure", "financial_discipline")
  if (input.intent === "financial_analysis" || isFinancialReasoningMode(input.reasoningMode)) tags.push("real_profit_first", "financial_discipline")
  if (input.goal?.optimization === "margin" || input.reasoningMode === "pricing_strategy") tags.push("margin_protection")
  if (input.goal?.optimization === "liquidity" || input.reasoningMode === "inventory_liquidity" || input.reasoningMode === "inventory_rotation") tags.push("premium_liquidity_risk")
  if (input.reasoningMode === "marketing_execution" || input.reasoningMode === "campaign_generation") tags.push("controlled_traffic", "whatsapp_first")
  if ((input.snapshot?.executive.leadsWithoutFollowUp || 0) > 0) tags.push("service_bottleneck", "service_speed")
  if ((input.snapshot?.executive.stuckStockCount || 0) > 0 || realProfit?.inventoryPressure === "high") tags.push("inventory_pressure")
  if (input.execution?.trafficPlan) tags.push("controlled_traffic")
  if (input.execution?.products.some((product) => product.role === "premium")) tags.push("premium_liquidity_risk")
  if (input.execution?.bundles.some((bundle) => bundle.addOns.length > 0)) tags.push("bundle_margin")
  if (input.intent === "pricing_refinement" || input.reasoningMode === "pricing_strategy" || input.reasoningMode === "offer_optimization") tags.push("controlled_discount", "margin_protection")
  return unique(tags)
}

function runtimeMemory(input: {
  id: string
  companyId: string
  now: string
  type: OrionOperationalMemoryType
  summary: string
  evidence: string[]
  confidence: number
  source: OrionOperationalMemorySource
  scope: OrionOperationalMemoryScope
  tags: OrionOperationalMemoryTag[]
  usageCount?: number
}): OrionOperationalMemory {
  return {
    id: input.id,
    companyId: input.companyId,
    type: input.type,
    summary: input.summary,
    evidence: input.evidence,
    confidence: clamp(input.confidence),
    source: input.source,
    scope: input.scope,
    tags: input.tags,
    createdAt: input.now,
    updatedAt: input.now,
    usageCount: input.usageCount || 1,
    status: "active",
  }
}

export function extractOperationalMemorySignals(input: ExtractOperationalMemorySignalsInput): OperationalMemorySignals {
  const generatedAt = nowIso(input.now)
  const snapshot = input.snapshot || null
  const execution = input.execution || null
  const operationalGoal = input.operationalContext?.operationalGoal || input.conversationState?.activeGoal || null
  const intent = input.operationalContext?.intentRoute?.intent || input.conversationState?.intentRoute?.intent || null
  const reasoningMode = input.operationalContext?.reasoningMode || input.conversationState?.activeReasoningMode || null
  const subject = subjectFrom(input)
  const financial = snapshot?.finance.financialOperationalContext || null
  const realProfit = snapshot?.finance.realProfitSnapshot || null
  const tags = tagsFrom({
    intent,
    reasoningMode,
    goal: operationalGoal,
    snapshot,
    execution,
  })
  const runtimeMemories: OrionOperationalMemory[] = []

  const leadsWithoutFollowUp = snapshot?.executive.leadsWithoutFollowUp || 0
  if (leadsWithoutFollowUp > 0) {
    runtimeMemories.push(runtimeMemory({
      id: `runtime-service-bottleneck-${input.companyId}`,
      companyId: input.companyId,
      now: generatedAt,
      type: "execution_bottleneck",
      summary: "Há gargalo operacional de atendimento antes de buscar volume novo.",
      evidence: [`${leadsWithoutFollowUp} lead${leadsWithoutFollowUp === 1 ? "" : "s"} sem follow-up no snapshot atual.`],
      confidence: clamp(0.48 + leadsWithoutFollowUp * 0.05, 0.48, 0.78),
      source: "system_snapshot",
      scope: "lead",
      tags: ["service_bottleneck", "service_speed", "controlled_traffic"],
      usageCount: Math.min(6, leadsWithoutFollowUp),
    }))
  }

  if (financial?.liquidityPressure === "high" || financial?.cashHealth === "critical") {
    runtimeMemories.push(runtimeMemory({
      id: `runtime-cash-pressure-${input.companyId}`,
      companyId: input.companyId,
      now: generatedAt,
      type: "financial_pattern",
      summary: "A leitura atual exige disciplina financeira antes de expansão ou retirada.",
      evidence: [`Caixa: ${financial.cashHealth}; pressão de liquidez: ${financial.liquidityPressure}.`],
      confidence: 0.82,
      source: "financial_result",
      scope: "financial",
      tags: ["cash_pressure", "financial_discipline", "real_profit_first"],
      usageCount: 3,
    }))
  }

  if (realProfit?.inventoryPressure === "high" || (snapshot?.executive.stuckStockCount || 0) > 0) {
    runtimeMemories.push(runtimeMemory({
      id: `runtime-inventory-pressure-${input.companyId}`,
      companyId: input.companyId,
      now: generatedAt,
      type: "inventory_pattern",
      summary: "Estoque parado reduz qualidade do lucro e pede giro disciplinado.",
      evidence: [`${snapshot?.executive.stuckStockCount || 0} item${(snapshot?.executive.stuckStockCount || 0) === 1 ? "" : "s"} parado${realProfit?.inventoryPressure ? `; pressão de estoque ${realProfit.inventoryPressure}.` : "."}`],
      confidence: 0.72,
      source: "system_snapshot",
      scope: "global_business",
      tags: ["inventory_pressure", "premium_liquidity_risk"],
      usageCount: Math.min(6, Math.max(1, snapshot?.executive.stuckStockCount || 1)),
    }))
  }

  return {
    companyId: input.companyId,
    generatedAt,
    intent,
    reasoningMode,
    goalType: operationalGoal?.goalType || null,
    optimization: operationalGoal?.optimization || null,
    subject,
    finance: {
      cashHealth: financial?.cashHealth || null,
      liquidityPressure: financial?.liquidityPressure || null,
      canSafelyReinvest: financial?.canSafelyReinvest ?? null,
      canSafelyWithdraw: financial?.canSafelyWithdraw ?? null,
      realAvailableProfit: number(financial?.realAvailableProfit ?? realProfit?.availableProfit),
      protectedCapital: number(financial?.protectedCapital ?? realProfit?.protectedCapital),
    },
    operation: {
      leadsWithoutFollowUp,
      stuckStockCount: snapshot?.executive.stuckStockCount || 0,
      inventoryPressure: realProfit?.inventoryPressure || null,
      averageActiveDays: snapshot?.stock.averageActiveDays || 0,
      recommendedScenario: execution?.objective.recommendedScenario || null,
      hasTrafficPlan: Boolean(execution?.trafficPlan),
      hasPremiumProduct: Boolean(execution?.products.some((product) => product.role === "premium")),
      hasBundleAddOns: Boolean(execution?.bundles.some((bundle) => bundle.addOns.length > 0)),
    },
    tags,
    runtimeMemories,
  }
}

function memoryRelatesToSubject(memory: OrionOperationalMemory, signals: OperationalMemorySignals) {
  const productMatch = Boolean(memory.relatedProductId && signals.subject.productId && memory.relatedProductId === signals.subject.productId)
  const categoryMatch = Boolean(memory.relatedCategory && signals.subject.category && normalizeText(memory.relatedCategory) === normalizeText(signals.subject.category))
  const campaignMatch = Boolean(memory.relatedCampaignId && signals.subject.campaignId && memory.relatedCampaignId === signals.subject.campaignId)
  const leadMatch = Boolean(memory.relatedLeadId && signals.subject.leadId && memory.relatedLeadId === signals.subject.leadId)
  return productMatch || categoryMatch || campaignMatch || leadMatch
}

function memoryRelatesToIntent(memory: OrionOperationalMemory, signals: OperationalMemorySignals) {
  if (memory.tags?.some((tag) => signals.tags.includes(tag))) return true
  if (signals.intent === "financial_analysis") return memory.scope === "financial" || hasAnyTag(memory, ["financial_discipline", "cash_pressure", "real_profit_first"])
  if (signals.intent === "pricing_refinement") return hasAnyTag(memory, ["margin_protection", "controlled_discount"])
  if (signals.intent === "marketing_execution" || signals.intent === "new_campaign_request") return hasAnyTag(memory, ["controlled_traffic", "whatsapp_first", "bundle_margin"])
  if (signals.intent === "inventory_analysis") return hasAnyTag(memory, ["inventory_pressure", "premium_liquidity_risk"])
  return memory.scope === "global_business"
}

function conflictsWithCurrentData(memory: OrionOperationalMemory, signals: OperationalMemorySignals) {
  const criticalCash = signals.finance.cashHealth === "critical" || signals.finance.liquidityPressure === "high"
  if (criticalCash && hasTag(memory, "margin_protection")) return true
  const serviceLooksClear = signals.operation.leadsWithoutFollowUp === 0 && signals.operation.hasTrafficPlan && signals.finance.cashHealth === "healthy"
  if (serviceLooksClear && hasTag(memory, "service_bottleneck")) return true
  const noInventoryPressure = signals.operation.inventoryPressure === "low" && signals.operation.stuckStockCount === 0
  if (noInventoryPressure && hasTag(memory, "premium_liquidity_risk")) return true
  return false
}

export function calculateMemoryInfluenceWeight(input: {
  memory: OrionOperationalMemory
  signals: OperationalMemorySignals
  now?: string | Date
}): OrionMemoryInfluence {
  const now = nowIso(input.now || input.signals.generatedAt)
  const memory = input.memory
  const reasons: string[] = []

  if (memory.status === "contradicted") {
    return {
      memory,
      memoryInfluenceWeight: 0,
      influenceLevel: "ignored",
      conflictWithCurrentData: true,
      reasons: ["Memoria marcada como contraditada; peso operacional zerado."],
    }
  }

  let score = clamp(memory.confidence)
  const relatedToIntent = memoryRelatesToIntent(memory, input.signals)
  const relatedToSubject = memoryRelatesToSubject(memory, input.signals)
  const conflict = conflictsWithCurrentData(memory, input.signals)
  const ageDays = daysBetween(memory.updatedAt, now)

  score += sourceBoost(memory.source)
  if (relatedToIntent) {
    score += 0.12
    reasons.push("Aderente ao intent ou aos sinais estruturados atuais.")
  } else {
    score -= 0.22
    reasons.push("Baixa aderencia ao intent atual.")
  }
  if (relatedToSubject) {
    score += 0.18
    reasons.push("Relacionada ao produto, categoria, campanha ou lead atual.")
  }
  if (memory.usageCount >= 5) {
    score += 0.12
    reasons.push("Uso recorrente reforca a memoria.")
  } else if (memory.usageCount >= 2) {
    score += 0.05
    reasons.push("Uso anterior moderado.")
  }
  if (ageDays > 180) {
    score -= 0.28
    reasons.push("Memoria antiga perdeu relevancia operacional.")
  } else if (ageDays > 90) {
    score -= 0.16
    reasons.push("Memoria envelhecida teve peso reduzido.")
  } else if (ageDays > 30) {
    score -= 0.08
  }
  if (memory.status === "deprecated") {
    score -= 0.28
    reasons.push("Memoria depreciada.")
  }
  if (conflict) {
    score = Math.min(score, 0.34)
    reasons.push("Dados atuais contradizem ou limitam essa memoria; dados atuais vencem.")
  }
  if (memory.source === "manual_note") {
    score = Math.min(score, 0.58)
    reasons.push("Seed auditavel com teto de influencia.")
  }
  if (memory.status === "deprecated") score = Math.min(score, 0.34)

  const memoryInfluenceWeight = bucketWeight(clamp(score))
  return {
    memory,
    memoryInfluenceWeight,
    influenceLevel: weightLevel(memoryInfluenceWeight),
    conflictWithCurrentData: conflict,
    reasons,
  }
}

function memoriesForCompany(companyId: string, memories: OrionOperationalMemory[]) {
  return memories.map((memory) => ({
    ...memory,
    companyId: memory.companyId === SEED_COMPANY_ID ? companyId : memory.companyId,
  })).filter((memory) => memory.companyId === companyId)
}

export function selectRelevantOperationalMemories(input: SelectOperationalMemoriesInput): OrionMemoryInfluence[] {
  const signals = extractOperationalMemorySignals(input)
  const sourceMemories = memoriesForCompany(input.companyId, [
    ...seedOperationalMemories,
    ...signals.runtimeMemories,
    ...(input.memories || []),
  ])
  return sourceMemories
    .map((memory) => calculateMemoryInfluenceWeight({ memory, signals, now: signals.generatedAt }))
    .filter((influence) => influence.memoryInfluenceWeight > 0)
    .sort((a, b) => {
      if (b.memoryInfluenceWeight !== a.memoryInfluenceWeight) return b.memoryInfluenceWeight - a.memoryInfluenceWeight
      if (b.memory.confidence !== a.memory.confidence) return b.memory.confidence - a.memory.confidence
      return new Date(b.memory.updatedAt).getTime() - new Date(a.memory.updatedAt).getTime()
    })
    .slice(0, input.limit || 6)
}

function hasInfluence(influences: OrionMemoryInfluence[], tag: OrionOperationalMemoryTag, minimum: OrionMemoryInfluenceWeight = 0.3) {
  return influences.some((influence) => influence.memoryInfluenceWeight >= minimum && hasTag(influence.memory, tag))
}

export function buildBusinessPersonalityProfile(input: {
  companyId: string
  signals: OperationalMemorySignals
  relevantOperationalMemories: OrionMemoryInfluence[]
}): BusinessPersonalityProfile {
  const memories = input.relevantOperationalMemories
  const financeCritical = input.signals.finance.cashHealth === "critical" || input.signals.finance.liquidityPressure === "high"
  const serviceBottleneck = input.signals.operation.leadsWithoutFollowUp > 0 || hasInfluence(memories, "service_bottleneck")
  const protectMargin = hasInfluence(memories, "margin_protection")
  const controlledTraffic = hasInfluence(memories, "controlled_traffic")
  const premiumRisk = hasInfluence(memories, "premium_liquidity_risk")
  const bundleMargin = hasInfluence(memories, "bundle_margin")

  const strategicWarnings = [
    financeCritical ? "Dados atuais indicam pressão de caixa; memória de margem não deve impedir giro calculado." : null,
    serviceBottleneck ? "Atendimento pendente reduz segurança para tráfego pesado." : null,
    premiumRisk ? "Produto premium pode exigir mais esforço comercial e não deve ser tratado como liquidez imediata." : null,
  ].filter((item): item is string => Boolean(item))

  const decisionPrinciples = [
    "Dados atuais e engines determinísticas vencem memória operacional.",
    protectMargin ? "Preservar margem como padrão; desconto só entra como ferramenta controlada de fechamento." : "Equilibrar margem e velocidade conforme caixa atual.",
    bundleMargin ? "Usar acessórios para elevar valor percebido e margem do pacote." : null,
    controlledTraffic ? "Antes de escalar mídia, validar conversa real e capacidade de resposta." : null,
  ].filter((item): item is string => Boolean(item))

  return {
    companyId: input.companyId,
    riskTolerance: financeCritical || serviceBottleneck ? "low" : "medium",
    marginPreference: financeCritical ? "favor_liquidity" : protectMargin ? "protect_margin" : "balanced",
    salesStyle: "premium_consultative",
    discountPosture: financeCritical ? "controlled_discount" : protectMargin ? "avoid_early_discount" : "controlled_discount",
    executionCapacity: serviceBottleneck ? "low" : input.signals.operation.hasTrafficPlan ? "medium" : "medium",
    preferredChannels: unique(["WhatsApp", hasInfluence(memories, "whatsapp_first") ? "Base propria" : null].filter((item): item is string => Boolean(item))),
    knownBottlenecks: serviceBottleneck ? ["Atendimento e follow-up antes de volume novo"] : [],
    strategicWarnings,
    decisionPrinciples,
  }
}

function buildMemoryGuardrails(input: {
  signals: OperationalMemorySignals
  profile: BusinessPersonalityProfile
  relevantOperationalMemories: OrionMemoryInfluence[]
}): OrionMemoryGuardrails {
  const isFinancial = input.signals.intent === "financial_analysis" || isFinancialReasoningMode(input.signals.reasoningMode)
  const executionReady = input.signals.reasoningMode === "marketing_execution" || input.signals.reasoningMode === "campaign_generation" || input.signals.reasoningMode === "content_generation"
  const highTrafficRisk = input.profile.executionCapacity === "low" && hasInfluence(input.relevantOperationalMemories, "controlled_traffic")
  return {
    hierarchy: [
      "dados atuais reais",
      "engines determinísticas",
      "mission context",
      "memória operacional ponderada",
      "interpretação do Strategic Copilot",
    ],
    responsePosture: executionReady ? "execution_ready" : "answer_first_operational",
    avoidAutomaticCampaignCta: isFinancial || highTrafficRisk,
    forbidTechnicalTerms: ["safe withdrawal", "engine", "snapshot", "score", "payload", "enum", "memoryInfluenceWeight"],
    recommendedSections: isFinancial
      ? ["Leitura", "Decisão recomendada", "Por quê", "Risco", "Próximo passo operacional"]
      : ["Leitura", "Decisão recomendada", "Risco", "Próximo passo operacional"],
    decisionRules: [
      "Memória contextualiza, mas não substitui ledger, lucro real, estoque ou missão atual.",
      "Se dados atuais contradizem a memória, siga os dados atuais e use a memória apenas como alerta.",
      input.profile.discountPosture === "avoid_early_discount"
        ? "Evitar desconto cedo; usar desconto apenas para fechamento com intenção real."
        : "Desconto pode ser controlado quando a liquidez ou giro exigirem.",
      highTrafficRisk
        ? "Não encerrar resposta financeira com campanha, tráfego ou CTA de mídia."
        : "Tráfego só entra quando houver capacidade de atendimento e validação de conversa.",
    ],
  }
}

export function applyMemoryToOrionContext(input: SelectOperationalMemoriesInput): OrionAppliedOperationalMemoryContext {
  const signals = extractOperationalMemorySignals(input)
  const relevantOperationalMemories = selectRelevantOperationalMemories({ ...input, limit: input.limit || 6 })
  const businessPersonalityProfile = buildBusinessPersonalityProfile({
    companyId: input.companyId,
    signals,
    relevantOperationalMemories,
  })
  const memoryGuardrails = buildMemoryGuardrails({
    signals,
    profile: businessPersonalityProfile,
    relevantOperationalMemories,
  })

  return {
    companyId: input.companyId,
    generatedAt: signals.generatedAt,
    relevantOperationalMemories,
    businessPersonalityProfile,
    memoryGuardrails,
    reasoningNotes: [
      "Memória operacional aplicada como contexto ponderado, não como fonte de cálculo.",
      "Dados atuais e engines determinísticas permanecem acima da memória.",
    ],
  }
}

/**
 * Create a simple hash for an insight based on normalized key fields.
 */
function insightHash(title: string, category: string): string {
  const normalized = `${title} ${category}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  // Simple fast hash — not cryptographic, just for dedup comparison
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return `im${Math.abs(hash).toString(36)}`
}

/**
 * Extract insight records from a saved analysis JSON.
 */
function extractInsightsFromAnalysis(analysis: OrionAnalysis | null): RecentInsightRecord[] {
  if (!analysis) return []
  const records: RecentInsightRecord[] = []
  const allInsights: OrionInsight[] = [
    ...(analysis.alerts || []),
    ...(analysis.recommendations || []),
    ...(analysis.risks || []),
    ...(analysis.opportunities || []),
  ]
  for (const insight of allInsights) {
    records.push({
      hash: insightHash(insight.title, insight.category),
      title: insight.title,
      category: insight.category,
      createdAt: "",
    })
  }
  // Also include daily action plan
  for (const action of analysis.daily_action_plan || []) {
    records.push({
      hash: insightHash(action.title, action.area),
      title: action.title,
      category: action.area,
      createdAt: "",
    })
  }
  return records
}

/**
 * Fetch insights that ORION has recommended in recent analysis logs.
 * Uses the orion_ai_analysis_logs table.
 */
export async function getRecentInsights(
  companyId: string,
  hoursBack = MEMORY_HOURS_DEFAULT
): Promise<RecentInsightRecord[]> {
  try {
    const { pool } = await import("@/lib/db")
    const result = await pool.query<{
      response_json: OrionAnalysis | null
      created_at: string
    }>(
      `
        SELECT response_json, created_at
        FROM orion_ai_analysis_logs
        WHERE company_id = $1::uuid
          AND status IN ('success', 'local')
          AND analysis_type = 'executive'
          AND created_at >= NOW() - ($2::text || ' hours')::interval
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [companyId, hoursBack]
    )

    const all: RecentInsightRecord[] = []
    for (const row of result.rows) {
      const extracted = extractInsightsFromAnalysis(row.response_json)
      for (const record of extracted) {
        record.createdAt = row.created_at
        all.push(record)
      }
    }
    return all
  } catch {
    // Table might not exist yet — graceful degradation
    return []
  }
}

/**
 * Count how many times each insight hash appears in recent history.
 */
function countOccurrences(recent: RecentInsightRecord[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const record of recent) {
    counts.set(record.hash, (counts.get(record.hash) || 0) + 1)
  }
  return counts
}

/**
 * Enrich insights with memory context.
 * - If an insight was already emitted 3+ times recently, lower its priority.
 * - If emitted 1-2 times, keep the insight unchanged to avoid visible repetition markers.
 */
function applyMemoryToInsight(
  insight: OrionInsight,
  occurrences: number
): OrionInsight {
  if (occurrences >= 3) {
    // Demote priority if repeatedly shown
    const demotedPriority = insight.priority === "critical"
      ? "high"
      : insight.priority === "high"
        ? "medium"
        : insight.priority
    return {
      ...insight,
      priority: demotedPriority as OrionInsight["priority"],
      action_priority: demotedPriority as OrionInsight["action_priority"],
    }
  }
  return insight
}

/**
 * Apply operational memory to an entire analysis.
 * Modifies insights based on what was previously recommended.
 */
export function applyOperationalMemory(
  analysis: OrionAnalysis,
  recentInsights: RecentInsightRecord[]
): OrionAnalysis {
  if (!recentInsights.length) return analysis

  const occurrences = countOccurrences(recentInsights)

  const applyToList = (insights: OrionInsight[]): OrionInsight[] => {
    return insights.map((insight) => {
      const hash = insightHash(insight.title, insight.category)
      const count = occurrences.get(hash) || 0
      return applyMemoryToInsight(insight, count)
    })
  }

  return {
    ...analysis,
    alerts: applyToList(analysis.alerts),
    recommendations: applyToList(analysis.recommendations),
    risks: applyToList(analysis.risks),
    opportunities: applyToList(analysis.opportunities),
  }
}
