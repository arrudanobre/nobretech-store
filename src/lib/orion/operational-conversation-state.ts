import type {
  OrionExecutionMode,
  OrionExecutionPayload,
  OrionCommercialEntityRole,
  OrionCommercialEntityType,
  OrionIntentRouteSummary,
  OrionMissionContext,
  OrionCommercialSubjectSummary,
  OrionCommercialSubjectMatchSummary,
  OrionOperationalGoal,
  OrionOperationalIntent,
  OrionOperationalPlan,
  OrionOperationalContext,
  OrionOperationalConversationState,
  OrionExecutionGuardrails,
  OrionReasoningMode,
  OrionSelectedScenario,
  OrionSnapshot,
} from "./types"

const emptyState: OrionOperationalConversationState = {
  activeMission: null,
  focusProduct: null,
  selectedScenario: null,
  targetGoal: null,
  deadline: null,
  selectedChannel: null,
  selectedOffer: null,
  lastUserDecision: null,
  nextExpectedStep: null,
  executionMode: null,
  currentMission: null,
  currentProduct: null,
  currentExecutionMode: null,
  chosenOperationalPath: null,
  chosenTrafficDirection: null,
  activeOffer: null,
  activeCampaignIntent: null,
  activeProduct: null,
  activeCampaign: null,
  activeTrafficDirection: null,
  activePricingDiscussion: null,
  activeLeadProfile: null,
  activeClosingStrategy: null,
  activeExecutionMode: null,
  currentCommercialConcern: null,
  currentBottleneck: null,
  operationalIntent: null,
  activeMissionContext: null,
  intentRoute: null,
  commercialSubject: null,
  activeGoal: null,
  activeReasoningMode: null,
  executionGuardrails: null,
  activeOperationalPlanSummary: null,
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function compactText(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim()
}

function safeText(value: unknown, maxLength = 220) {
  if (typeof value !== "string") return null
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  return clean ? clean.slice(0, maxLength) : null
}

function isScenario(value: unknown): value is OrionSelectedScenario {
  return value === "conservative" || value === "balanced" || value === "aggressive"
}

function isExecutionMode(value: unknown): value is OrionExecutionMode {
  return [
    "strategic_analysis",
    "operational_decision",
    "marketing_execution",
    "sales_execution",
    "lead_recovery",
    "closing_mode",
  ].includes(String(value))
}

function coerceExecutionMode(value: unknown): OrionExecutionMode | null {
  if (isExecutionMode(value)) return value
  if (typeof value !== "string") return null
  if (["whatsapp_script", "traffic_plan", "offer_building"].includes(value)) return "marketing_execution"
  if (value === "follow_up_plan") return "lead_recovery"
  if (value === "pricing_review") return "closing_mode"
  if (value === "financial_decision" || value === "inventory_decision") return "operational_decision"
  if (value === "strategy_decision") return "strategic_analysis"
  return null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function safeStringArray(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return []
  return value.map((item) => safeText(item, 160)).filter((item): item is string => Boolean(item)).slice(0, maxItems)
}

function isGoalType(value: unknown): value is OrionOperationalGoal["goalType"] {
  return [
    "profit_target",
    "inventory_liquidity",
    "inventory_rotation",
    "margin_optimization",
    "marketing_execution",
    "content_generation",
    "pricing_validation",
    "operational_diagnosis",
    "unknown",
  ].includes(String(value))
}

function coerceOperationalGoal(value: unknown): OrionOperationalGoal | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const goalType = isGoalType(raw.goalType) ? raw.goalType : null
  if (!goalType) return null
  const urgency = raw.urgency === "low" || raw.urgency === "medium" || raw.urgency === "high" ? raw.urgency : "medium"
  const optimization = raw.optimization === "liquidity"
    || raw.optimization === "margin"
    || raw.optimization === "liquidity_plus_margin"
    || raw.optimization === "speed"
    || raw.optimization === "execution"
    || raw.optimization === "unknown"
    ? raw.optimization
    : "unknown"
  return {
    goalType,
    targetProfit: finiteNumber(raw.targetProfit),
    horizonDays: finiteNumber(raw.horizonDays),
    urgency,
    optimization,
    directQuestion: Boolean(raw.directQuestion),
    needsExecution: Boolean(raw.needsExecution),
    reason: safeText(raw.reason, 220) || "Objetivo operacional preservado.",
  }
}

function isReasoningMode(value: unknown): value is OrionReasoningMode {
  return [
    "financial_decision",
    "withdrawal_safety",
    "reinvestment_decision",
    "working_capital_analysis",
    "financial_health_analysis",
    "goal_planning",
    "inventory_liquidity",
    "inventory_rotation",
    "campaign_generation",
    "marketing_execution",
    "content_generation",
    "pricing_strategy",
    "operational_diagnosis",
    "offer_optimization",
  ].includes(String(value))
}

function coerceReasoningMode(value: unknown): OrionReasoningMode | null {
  return isReasoningMode(value) ? value : null
}

function coerceExecutionGuardrails(value: unknown): OrionExecutionGuardrails | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  return {
    allowCampaignGeneration: Boolean(raw.allowCampaignGeneration),
    allowTrafficRecommendation: Boolean(raw.allowTrafficRecommendation),
    allowProductMixGeneration: Boolean(raw.allowProductMixGeneration),
    allowCopyGeneration: Boolean(raw.allowCopyGeneration),
    allowPricingExecution: Boolean(raw.allowPricingExecution),
    allowInventoryPush: Boolean(raw.allowInventoryPush),
    reason: safeText(raw.reason, 220) || "Guardrail operacional preservado.",
  }
}

function summarizePlanInput(plan?: OrionOperationalPlan | null) {
  if (!plan) return null
  const firstProduct = plan.productMix[0]?.productName
  return [
    plan.directAnswer ? `${plan.directAnswer}. ${plan.directAnswerReason}` : plan.financialValidation,
    firstProduct ? `Produto central: ${firstProduct}` : null,
    `Viabilidade: ${plan.feasibility.status}`,
  ].filter(Boolean).join(" | ").slice(0, 360)
}

function coerceMissionContext(value: unknown): OrionMissionContext | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const rawProduct = raw.product && typeof raw.product === "object" ? raw.product as Record<string, unknown> : null
  const rawOffer = raw.offer && typeof raw.offer === "object" ? raw.offer as Record<string, unknown> : null
  const rawFinance = raw.finance && typeof raw.finance === "object" ? raw.finance as Record<string, unknown> : {}
  const rawExecution = raw.execution && typeof raw.execution === "object" ? raw.execution as Record<string, unknown> : {}
  const rawConstraints = raw.constraints && typeof raw.constraints === "object" ? raw.constraints as Record<string, unknown> : {}
  const rawSignals = raw.memorySignals && typeof raw.memorySignals === "object" ? raw.memorySignals as Record<string, unknown> : {}
  const urgency = rawFinance.urgencyLevel === "urgent" || rawFinance.urgencyLevel === "attention" || rawFinance.urgencyLevel === "stable"
    ? rawFinance.urgencyLevel
    : "stable"

  return {
    product: rawProduct ? {
      id: safeText(rawProduct.id, 120) || "",
      name: safeText(rawProduct.name) || "",
      quantity: finiteNumber(rawProduct.quantity) || 0,
      price: finiteNumber(rawProduct.price) || 0,
      profit: finiteNumber(rawProduct.profit) || 0,
      marginPct: finiteNumber(rawProduct.marginPct) || 0,
      daysInStock: finiteNumber(rawProduct.daysInStock) || 0,
      role: rawProduct.role === "premium" || rawProduct.role === "anchor" || rawProduct.role === "turnover" || rawProduct.role === "liquidity" ? rawProduct.role : "anchor",
      minimumSafePrice: finiteNumber(rawProduct.minimumSafePrice),
      conversionSpeed: rawProduct.conversionSpeed === "alta" || rawProduct.conversionSpeed === "media" || rawProduct.conversionSpeed === "baixa" ? rawProduct.conversionSpeed : "media",
    } : null,
    offer: rawOffer ? {
      bundleName: safeText(rawOffer.bundleName),
      items: safeStringArray(rawOffer.items),
      currentOfferPrice: finiteNumber(rawOffer.currentOfferPrice),
      expectedProfit: finiteNumber(rawOffer.expectedProfit),
      minimumSafePrice: finiteNumber(rawOffer.minimumSafePrice),
      safeProfitFloor: finiteNumber(rawOffer.safeProfitFloor),
      discountLimit: finiteNumber(rawOffer.discountLimit),
      positioning: safeText(rawOffer.positioning),
    } : null,
    finance: {
      cashPosture: safeText(rawFinance.cashPosture) || "sem leitura financeira anterior",
      liquidProfitAvailable: finiteNumber(rawFinance.liquidProfitAvailable) || 0,
      protectedWorkingCapital: finiteNumber(rawFinance.protectedWorkingCapital) || 0,
      nextPayableAmount: finiteNumber(rawFinance.nextPayableAmount),
      nextPayableDueDate: safeText(rawFinance.nextPayableDueDate, 80),
      urgencyLevel: urgency,
    },
    execution: {
      selectedScenario: isScenario(rawExecution.selectedScenario) ? rawExecution.selectedScenario : null,
      selectedChannel: safeText(rawExecution.selectedChannel),
      activeTrafficDirection: safeText(rawExecution.activeTrafficDirection),
      pauseRule: safeText(rawExecution.pauseRule),
      scaleRule: safeText(rawExecution.scaleRule),
      responseExpectation: safeText(rawExecution.responseExpectation),
      activeStrategy: safeText(rawExecution.activeStrategy),
    },
    constraints: {
      avoidDiscountBelow: finiteNumber(rawConstraints.avoidDiscountBelow),
      doNotUseProtectedCapital: rawConstraints.doNotUseProtectedCapital !== false,
      avoidWrongLeadCategory: rawConstraints.avoidWrongLeadCategory !== false,
      doNotRecommendUnavailableProducts: rawConstraints.doNotRecommendUnavailableProducts !== false,
    },
    memorySignals: {
      lastCampaignResult: safeText(rawSignals.lastCampaignResult),
      knownBottleneck: safeText(rawSignals.knownBottleneck),
      repeatedRisk: safeText(rawSignals.repeatedRisk),
    },
  }
}

function coerceIntentRoute(value: unknown): OrionIntentRouteSummary | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const policy = raw.missionContextPolicy === "use"
    || raw.missionContextPolicy === "ignore"
    || raw.missionContextPolicy === "rebuild"
    || raw.missionContextPolicy === "switch"
    ? raw.missionContextPolicy
    : null
  const intent = safeText(raw.intent, 80)
  if (!intent || !policy) return null
  return {
    intent: intent as OrionIntentRouteSummary["intent"],
    missionContextPolicy: policy,
    useMissionContext: Boolean(raw.useMissionContext),
    ignoreMissionContext: Boolean(raw.ignoreMissionContext),
    rebuildMissionContext: Boolean(raw.rebuildMissionContext),
    reason: safeText(raw.reason, 220) || "Intenção anterior preservada.",
    confidence: finiteNumber(raw.confidence) || 0.5,
  }
}

function coerceCommercialSubject(value: unknown): OrionCommercialSubjectSummary | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const subjectType = safeText(raw.subjectType, 80)
  if (!subjectType) return null
  const rawMatches = Array.isArray(raw.matches) ? raw.matches : []
  const coerceMatch = (item: unknown): OrionCommercialSubjectMatchSummary => {
    const match = item && typeof item === "object" ? item as Record<string, unknown> : {}
    const productType = safeText(match.productType, 80)
    const entityType: OrionCommercialEntityType = match.entityType === "device"
      || match.entityType === "accessory"
      || match.entityType === "addon"
      || match.entityType === "service"
      || match.entityType === "bundle"
      || match.entityType === "unknown"
      ? match.entityType
      : productType === "accessory"
        ? "accessory"
        : productType === "service"
          ? "service"
          : productType === "warranty"
            ? "addon"
            : productType === "bundle"
              ? "bundle"
              : productType === "device"
                ? "device"
                : "unknown"
    const entityRole: OrionCommercialEntityRole = match.entityRole === "primary"
      || match.entityRole === "related"
      || match.entityRole === "compatible_accessory"
      || match.entityRole === "bundle_candidate"
      || match.entityRole === "secondary_suggestion"
      ? match.entityRole
      : "secondary_suggestion"
    return {
      inventoryId: safeText(match.inventoryId, 120) || "",
      productName: safeText(match.productName) || "Produto sem nome",
      category: safeText(match.category),
      productFamily: safeText(match.productFamily),
      model: safeText(match.model),
      variation: safeText(match.variation),
      color: safeText(match.color),
      compatibilityFamily: safeText(match.compatibilityFamily),
      quantity: finiteNumber(match.quantity) || 0,
      price: finiteNumber(match.price) || 0,
      cost: finiteNumber(match.cost) || 0,
      marginPct: finiteNumber(match.marginPct) || 0,
      daysInStock: finiteNumber(match.daysInStock) || 0,
      status: safeText(match.status, 80) || "unknown",
      productType,
      entityType,
      entityRole,
      entityPriorityWeight: finiteNumber(match.entityPriorityWeight) || 0,
      score: finiteNumber(match.score) || 0,
      finalScore: finiteNumber(match.finalScore) || finiteNumber(match.score) || 0,
      reason: safeText(match.reason) || "Correspondência anterior.",
    }
  }
  const matches = rawMatches.slice(0, 8).map(coerceMatch)
  const primarySubject = coerceMatch(raw.primarySubject)
  return {
    subjectType: subjectType as OrionCommercialSubjectSummary["subjectType"],
    category: safeText(raw.category),
    productFamily: safeText(raw.productFamily),
    model: safeText(raw.model),
    variation: safeText(raw.variation),
    compatibilityFamily: safeText(raw.compatibilityFamily),
    ambiguity: safeText(raw.ambiguity),
    needsClarification: Boolean(raw.needsClarification),
    confidence: finiteNumber(raw.confidence) || 0,
    reason: safeText(raw.reason, 220) || "Assunto comercial anterior.",
    primarySubject: primarySubject.inventoryId ? primarySubject : matches.find((match) => match.entityRole === "primary") || matches[0] || null,
    relatedProducts: Array.isArray(raw.relatedProducts) ? raw.relatedProducts.slice(0, 8).map(coerceMatch) : matches.filter((match) => match.entityRole === "related"),
    compatibleAccessories: Array.isArray(raw.compatibleAccessories) ? raw.compatibleAccessories.slice(0, 8).map(coerceMatch) : matches.filter((match) => match.entityRole === "compatible_accessory"),
    bundleCandidates: Array.isArray(raw.bundleCandidates)
      ? raw.bundleCandidates.slice(0, 4).map((item) => {
          const candidate = item && typeof item === "object" ? item as Record<string, unknown> : {}
          return {
            primary: coerceMatch(candidate.primary),
            accessories: Array.isArray(candidate.accessories) ? candidate.accessories.slice(0, 6).map(coerceMatch) : [],
            reason: safeText(candidate.reason) || "Bundle candidato preservado.",
          }
        })
      : [],
    secondarySuggestions: Array.isArray(raw.secondarySuggestions) ? raw.secondarySuggestions.slice(0, 8).map(coerceMatch) : matches.filter((match) => match.entityRole === "secondary_suggestion"),
    matches,
  }
}

function isOperationalIntent(value: unknown): value is OrionOperationalIntent {
  return [
    "new_strategy",
    "execution_continuation",
    "offer_refinement",
    "pricing_refinement",
    "marketing_refinement",
    "objection_handling",
    "lead_recovery",
    "closing_execution",
    "traffic_optimization",
    "campaign_iteration",
    "operational_question",
    "strategic_question",
  ].includes(String(value))
}

function hasActiveContext(state?: OrionOperationalConversationState | null) {
  return Boolean(
    state?.activeMission
    || state?.currentMission
    || state?.activeProduct
    || state?.currentProduct
    || state?.activeOffer
    || state?.activeCampaign
    || state?.activeCampaignIntent
  )
}

export function coerceOperationalConversationState(value: unknown): OrionOperationalConversationState | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Partial<Record<keyof OrionOperationalConversationState, unknown>>
  const executionMode = coerceExecutionMode(raw.currentExecutionMode) || coerceExecutionMode(raw.executionMode)
  const selectedScenario = isScenario(raw.chosenOperationalPath)
    ? raw.chosenOperationalPath
    : isScenario(raw.selectedScenario)
      ? raw.selectedScenario
      : null
  const mission = safeText(raw.currentMission) || safeText(raw.activeMission)
  const product = safeText(raw.activeProduct) || safeText(raw.currentProduct) || safeText(raw.focusProduct)
  const offer = safeText(raw.activeOffer) || safeText(raw.selectedOffer)
  const trafficDirection = safeText(raw.activeTrafficDirection) || safeText(raw.chosenTrafficDirection) || safeText(raw.selectedChannel)
  return {
    activeMission: mission,
    focusProduct: product,
    selectedScenario,
    targetGoal: safeText(raw.targetGoal),
    deadline: safeText(raw.deadline),
    selectedChannel: trafficDirection,
    selectedOffer: offer,
    lastUserDecision: safeText(raw.lastUserDecision),
    nextExpectedStep: safeText(raw.nextExpectedStep),
    executionMode,
    currentMission: mission,
    currentProduct: product,
    currentExecutionMode: executionMode,
    chosenOperationalPath: selectedScenario,
    chosenTrafficDirection: trafficDirection,
    activeOffer: offer,
    activeCampaignIntent: safeText(raw.activeCampaignIntent),
    activeProduct: product,
    activeCampaign: safeText(raw.activeCampaign),
    activeTrafficDirection: trafficDirection,
    activePricingDiscussion: safeText(raw.activePricingDiscussion),
    activeLeadProfile: safeText(raw.activeLeadProfile),
    activeClosingStrategy: safeText(raw.activeClosingStrategy),
    activeExecutionMode: executionMode,
    currentCommercialConcern: safeText(raw.currentCommercialConcern),
    currentBottleneck: safeText(raw.currentBottleneck),
    operationalIntent: isOperationalIntent(raw.operationalIntent) ? raw.operationalIntent : null,
    activeMissionContext: coerceMissionContext(raw.activeMissionContext),
    intentRoute: coerceIntentRoute(raw.intentRoute),
    commercialSubject: coerceCommercialSubject(raw.commercialSubject),
    activeGoal: coerceOperationalGoal(raw.activeGoal),
    activeReasoningMode: coerceReasoningMode(raw.activeReasoningMode),
    executionGuardrails: coerceExecutionGuardrails(raw.executionGuardrails),
    activeOperationalPlanSummary: safeText(raw.activeOperationalPlanSummary, 360),
  }
}

function detectScenario(question: string): OrionSelectedScenario | null {
  const text = normalizeText(question)
  if (/agressiv|acelerar|liquidez rapida|queimar|campanha forte/.test(text)) return "aggressive"
  if (/conservador|segurar margem|preco cheio|sem desconto|proteger margem/.test(text)) return "conservative"
  if (/balancead|equilibrad|execucao equilibrada|caminho equilibrado|meio termo/.test(text)) return "balanced"
  return null
}

export function extractExplicitProductName(question: string) {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim()
  const correction = normalizedQuestion.match(/\b(?:não é|nao e|nao eh|troca para|corrige para|na verdade é|na verdade e|agora é|agora e)\s+(.+)$/i)
  const directObject = correction?.[1] || normalizedQuestion.match(/\b(?:para|pro|pra|do|da|de)\s+(?:o|a|um|uma)?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s+\-./]{1,80})/i)?.[1]
  if (!directObject) return null
  return directObject
    .replace(/\b(?:mais rápido|mais rapido|hoje|agora|com campanha|campanha|promoção|promocao|oferta|ativo|ativa)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || null
}

export function detectOperationalExecutionMode(question: string, selectedScenario?: OrionSelectedScenario | null): OrionExecutionMode | null {
  const text = normalizeText(question)
  if (/seguimos|vamos nessa|estrutura isso|estrutura a campanha|monta campanha|cria copy|faz o marketing|me ajuda a vender|cria anuncio|cria anúncio|me da roteiro|me dá roteiro|me da o texto|me dá o texto|como anuncio|faz o whatsapp|vamos executar|quero rodar trafego|quero rodar tráfego|me ajuda no meta ads/.test(text)) return "marketing_execution"
  if (/whatsapp|zap|mensagem|texto pronto|script|roteiro de conversa|stories|story|criativo|copy|headline|campanha|marketing|anuncio|anúncio|meta ads|instagram ads|trafego|tráfego|ads|impulsionar|orcamento diario|orçamento diário|pausar|escalar|teste controlado|oferta|combo|bundle|pacote|condicao|condição|promocao|promoção/.test(text)) return "marketing_execution"
  if (/vamos no caminho|caminho equilibrado|caminho conservador|caminho agressivo|execucao equilibrada|execução equilibrada|abordagem conservadora|giro rapido|giro rápido/.test(text)) return "operational_decision"
  if (/recuperar lead|reativar|follow|follow-up|retomar|lead frio|cliente sumiu|sem resposta/.test(text)) return "lead_recovery"
  if (/fechar|fechamento|obje[cç]ao|objeção|argumento|negociar|converter|proposta final/.test(text)) return "closing_mode"
  if (/vender|venda|abordar cliente|executar venda/.test(text)) return "sales_execution"
  if (/caixa|lucro|pagar|conta|financeir|me pagar|tirar dinheiro|estoque|comprar|repor|giro|encalhad/.test(text)) return "operational_decision"
  if (/estrategia|estratégia|qual caminho|o que voce faria|o que você faria|devo|vale a pena/.test(text)) return "strategic_analysis"
  if (selectedScenario && /fechado|monta|estrutura|cria|faz|me ajuda/.test(text)) return "marketing_execution"
  return null
}

export function detectOperationalIntent(question: string, previousState?: OrionOperationalConversationState | null): OrionOperationalIntent {
  const text = normalizeText(question)
  const continuing = hasActiveContext(previousState)

  if (/menor valor|minimo valor|mínimo valor|valor minimo|valor mínimo|quanto posso cobrar|ate quanto|até quanto|piso|preco minimo|preço mínimo|vale desconto|desconto|parcelar|parcelamento/.test(text)) return "pricing_refinement"
  if (/posso adicionar|adicionar algo|ofertar alguma coisa|algo a mais|bonus|bônus|brinde|valor agregado|deixo mais atrativo|mais atrativo|percepcao premium|percepção premium/.test(text)) return "offer_refinement"
  if (/melhora isso|melhorar isso|faz outra copy|outra copy|versao premium|versão premium|qual gancho|gancho eu uso|como gero desejo|gerar desejo|copy/.test(text)) return continuing ? "marketing_refinement" : "campaign_iteration"
  if (/e no whatsapp|faz o whatsapp|mensagem|roteiro|texto pronto|responderia|o que eu responderia|obje[cç]ao|objeção/.test(text)) return /obje[cç]ao|objeção|responderia/.test(text) ? "objection_handling" : "marketing_refinement"
  if (/como vender mais rapido|como vender mais rápido|fecho mais rapido|fecho mais rápido|fechar mais rapido|fechar mais rápido|fechamento|converter|cta/.test(text)) return "closing_execution"
  if (/recuperar lead|reativar|lead frio|cliente sumiu|sem resposta|follow-up|follow up/.test(text)) return "lead_recovery"
  if (/como anuncio|como anúncio|anunciar isso|trafego|tráfego|meta ads|remarketing|pausar|escalar|orcamento|orçamento/.test(text)) return "traffic_optimization"
  if (/seguimos|vamos nessa|vamos executar|estrutura isso|monta campanha|faz o marketing|me ajuda a vender/.test(text)) return "execution_continuation"
  if (/nova estrategia|nova estratégia|começar do zero|comecar do zero|outro produto|nova campanha/.test(text)) return "new_strategy"
  if (/estrategia|estratégia|qual caminho|devo|vale a pena|o que voce faria|o que você faria/.test(text)) return continuing ? "operational_question" : "strategic_question"
  return continuing ? "operational_question" : "new_strategy"
}

function operationalIntentFromRoute(
  route?: OrionIntentRouteSummary | null,
  previousState?: OrionOperationalConversationState | null
): OrionOperationalIntent | null {
  if (!route) return previousState?.operationalIntent || null
  if (route.intent === "pricing_refinement") return "pricing_refinement"
  if (route.intent === "offer_refinement" || route.intent === "mission_refinement") return "offer_refinement"
  if (route.intent === "marketing_execution") return hasActiveContext(previousState) && route.missionContextPolicy === "use"
    ? "execution_continuation"
    : "new_strategy"
  if (route.intent === "mission_continuation") return "execution_continuation"
  if (route.intent === "product_switch" || route.intent === "new_campaign_request") return "new_strategy"
  if (route.intent === "strategic_question") return "strategic_question"
  if (route.intent === "financial_analysis" || route.intent === "inventory_analysis" || route.intent === "operational_question") return "operational_question"
  return "operational_question"
}

function executionModeFromRoute(
  route?: OrionIntentRouteSummary | null,
  previousState?: OrionOperationalConversationState | null
): OrionExecutionMode | null {
  if (!route) return previousState?.currentExecutionMode || previousState?.executionMode || null
  if (route.missionContextPolicy === "ignore") return route.intent === "strategic_question" ? "strategic_analysis" : null
  if (route.intent === "pricing_refinement") return "closing_mode"
  if (route.intent === "marketing_execution" || route.intent === "new_campaign_request" || route.intent === "product_switch" || route.intent === "mission_continuation") return "marketing_execution"
  if (route.intent === "offer_refinement" || route.intent === "mission_refinement") return previousState?.currentExecutionMode || previousState?.executionMode || "marketing_execution"
  if (route.intent === "strategic_question") return "strategic_analysis"
  if (route.intent === "inventory_analysis" || route.intent === "operational_question") return "operational_decision"
  return previousState?.currentExecutionMode || previousState?.executionMode || null
}

function selectedProductFromContext(context?: OrionOperationalContext | null) {
  const subjectProduct = context?.commercialSubject?.primarySubject?.productName
    || context?.commercialSubject?.productFamily
    || context?.commercialSubject?.model
  if (subjectProduct) return subjectProduct

  const selected = context?.inventory_search_debug?.selected_match?.name
  if (selected) return selected

  const inventory = context?.contexts?.inventory
  if (!inventory || typeof inventory !== "object") return null
  const products = (inventory as { products?: unknown }).products
  if (!Array.isArray(products)) return null
  const first = products.find((item) => item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string")
  return first ? String((first as { name: string }).name) : null
}

type ProductLike = {
  id: string
  name: string
  quantity: number
  price: number
  cost: number
  profit: number
  marginPct: number
  daysInStock: number
  status: string
  role: OrionExecutionPayload["products"][number]["role"]
  reason: string
  conversionSpeed: OrionExecutionPayload["products"][number]["conversionSpeed"]
}

function productFromExecution(execution?: OrionExecutionPayload | null) {
  return execution?.priorityAction?.product?.name
    || execution?.products.find((product) => product.role === "anchor")?.name
    || execution?.products[0]?.name
    || null
}

function productFamily(name?: string | null) {
  const text = normalizeText(name || "")
  if (/iphone/.test(text)) return "iphone"
  if (/ipad/.test(text)) return "ipad"
  if (/apple watch|watch/.test(text)) return "watch"
  if (/macbook|notebook/.test(text)) return "macbook"
  return "unknown"
}

function productMatchesExplicit(productName: string, explicitProduct: string) {
  const product = compactText(productName)
  const explicit = compactText(explicitProduct)
  if (!product || !explicit) return false
  if (product.includes(explicit) || explicit.includes(product)) return true
  const productTokens = new Set(product.split(" "))
  const explicitTokens = explicit.split(" ").filter((token) => token.length > 1)
  const family = productFamily(explicitProduct)
  if (family !== "unknown" && productFamily(productName) !== family) return false
  const modelTokens = explicitTokens.filter((token) => !["para", "campanha", "pro"].includes(token))
  return modelTokens.length > 0 && modelTokens.every((token) => productTokens.has(token))
}

function inventoryToProduct(item: OrionExecutionPayload["inventory"][number], explicitProduct: string): ProductLike {
  const price = Math.max(0, Math.round(item.price || item.cost * 1.2))
  const profit = Math.max(0, item.profit || price - item.cost)
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    price,
    cost: item.cost,
    profit,
    marginPct: item.marginPct,
    daysInStock: item.daysInStock,
    status: item.status,
    role: "anchor",
    reason: `Produto citado explicitamente pelo usuário: ${explicitProduct}.`,
    conversionSpeed: price <= 3500 ? "alta" : price <= 6500 ? "media" : "baixa",
  }
}

function subjectMatchToProduct(match: OrionCommercialSubjectSummary["matches"][number]): ProductLike {
  const price = Math.max(0, Math.round(match.price || match.cost * 1.2))
  const profit = Math.max(0, price - match.cost)
  return {
    id: match.inventoryId,
    name: match.productName,
    quantity: match.quantity || 1,
    price,
    cost: match.cost,
    profit,
    marginPct: match.marginPct,
    daysInStock: match.daysInStock,
    status: match.status,
    role: match.productType === "accessory" ? "turnover" : "anchor",
    reason: "Produto resolvido pelo Commercial Subject Resolver a partir do banco.",
    conversionSpeed: price <= 3500 ? "alta" : price <= 6500 ? "media" : "baixa",
  }
}

function productCanBecomeMission(product?: ProductLike | null) {
  if (!product) return false
  return product.status === "active" || product.status === "in_stock"
}

function resolveExplicitProductFromExecution(explicitProduct: string, execution?: OrionExecutionPayload | null): ProductLike {
  const explicitFamily = productFamily(explicitProduct)
  const synthetic: ProductLike = {
    id: `explicit-${compactText(explicitProduct).replace(/\s+/g, "-")}`,
    name: explicitProduct,
    quantity: 0,
    price: 0,
    cost: 0,
    profit: 0,
    marginPct: 0,
    daysInStock: 0,
    status: "explicit_request",
    role: "anchor",
    reason: "Produto citado explicitamente pelo usuário; dados comerciais não encontrados no payload de execução.",
    conversionSpeed: "media",
  }
  if (!execution) return synthetic
  const allProducts: ProductLike[] = [
    ...(execution.priorityAction?.product ? [execution.priorityAction.product] : []),
    ...execution.products,
    ...execution.inventory.map((item) => inventoryToProduct(item, explicitProduct)),
  ]
  const match = allProducts.find((product) => productFamily(product.name) === explicitFamily && productMatchesExplicit(product.name, explicitProduct))
  return match || synthetic
}

function sameProduct(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  return productMatchesExplicit(a, b) || productMatchesExplicit(b, a)
}

function accessoryCompatibleWithProduct(itemName: string, productName: string) {
  const item = normalizeText(itemName)
  const family = productFamily(productName)
  const itemFamily = productFamily(itemName)
  if (itemFamily !== "unknown" && itemFamily !== family) return false
  if (family === "iphone") return !/ipad|apple watch|watch|macbook|notebook|caneta|pencil|stylus|teclado|trifold/.test(item)
  if (family === "ipad") return !/iphone|apple watch|watch|macbook|notebook/.test(item)
  if (family === "watch") return !/iphone|ipad|macbook|notebook|caneta|pencil|stylus|teclado/.test(item)
  if (family === "macbook") return !/iphone|ipad|apple watch|watch|caneta|pencil|stylus|pelicula|película/.test(item)
  return true
}

function bundleCompatibleWithProduct(bundle: OrionExecutionPayload["bundles"][number], productName: string) {
  const hasProduct = bundle.items.some((item) => productMatchesExplicit(item, productName))
  if (!hasProduct) return false
  return bundle.items.every((item) => productMatchesExplicit(item, productName) || accessoryCompatibleWithProduct(item, productName))
}

function offerForScenario(execution: OrionExecutionPayload | null | undefined, scenario: OrionSelectedScenario | null, productName?: string | null) {
  if (!execution || !scenario) return null
  const bundle = execution.bundles.find((item) => {
    if (item.promotionMode !== scenario) return false
    return productName ? bundleCompatibleWithProduct(item, productName) : true
  })
  return bundle?.name || execution.priorityAction?.bundleName || null
}

function defaultOfferForActiveExecution(execution?: OrionExecutionPayload | null, productName?: string | null) {
  if (!execution) return null
  const bundle = productName
    ? execution.bundles.find((item) => bundleCompatibleWithProduct(item, productName))
    : execution.bundles[0]
  return bundle?.name || (!productName ? execution.priorityAction?.bundleName || null : null)
}

function channelFor(question: string, mode: OrionExecutionMode | null, execution?: OrionExecutionPayload | null) {
  const text = normalizeText(question)
  if (/whatsapp|zap/.test(text)) return "WhatsApp"
  if (/stories|story|instagram/.test(text)) return "Stories"
  if (/meta ads|facebook|trafego|ads|anuncio|impulsionar/.test(text)) return "Meta Ads"
  if (mode === "marketing_execution") return execution?.trafficPlan ? "WhatsApp + Stories + teste controlado de tráfego" : "WhatsApp + Stories"
  return null
}

function nextStepFor(mode: OrionExecutionMode | null) {
  if (mode === "marketing_execution") return "Entregar campanha com oferta, headline, copy, criativo, Stories, WhatsApp, tráfego, risco e validação."
  if (mode === "sales_execution") return "Executar abordagem de venda com oferta, canal, objeções e próximo passo."
  if (mode === "lead_recovery") return "Criar sequência objetiva de recuperação de lead."
  if (mode === "closing_mode") return "Criar argumento de fechamento e resposta a objeções."
  if (mode === "operational_decision") return "Assumir a decisão operacional escolhida e preparar a execução."
  if (mode === "strategic_analysis") return "Escolher um caminho operacional e preparar a próxima execução."
  return null
}

function commercialConcernFor(intent: OrionOperationalIntent, question: string) {
  const text = normalizeText(question)
  if (intent === "pricing_refinement") return "Ajustar preço, piso e parcelamento da oferta ativa sem reiniciar campanha."
  if (intent === "offer_refinement") return "Aumentar valor percebido da oferta ativa com bônus ou agregado sem banalizar margem."
  if (intent === "marketing_refinement") return "Refinar copy, gancho ou canal da campanha ativa."
  if (intent === "traffic_optimization") return "Otimizar teste de tráfego, pausa, escala e remarketing."
  if (intent === "closing_execution") return "Acelerar fechamento reduzindo fricção e fortalecendo CTA."
  if (intent === "objection_handling") return "Responder objeção sem desconto ansioso."
  if (intent === "lead_recovery") return "Recuperar conversa e retomar intenção de compra."
  if (/whatsapp|zap/.test(text)) return "Ajustar execução de WhatsApp da missão ativa."
  return null
}

function bottleneckFor(intent: OrionOperationalIntent) {
  if (intent === "pricing_refinement") return "risco de baixar preço antes de extrair valor percebido"
  if (intent === "offer_refinement") return "risco de dar bônus demais e reduzir percepção premium"
  if (intent === "traffic_optimization") return "risco de escalar mídia antes de validar conversa qualificada"
  if (intent === "closing_execution") return "fricção no fechamento"
  if (intent === "lead_recovery") return "lead esfriando por demora ou falta de próximo passo"
  if (intent === "marketing_refinement" || intent === "campaign_iteration") return "gancho ou promessa ainda pouco específico"
  return null
}

function decisionLabel(question: string, scenario: OrionSelectedScenario | null, mode: OrionExecutionMode | null) {
  if (scenario === "balanced") return "Usuário escolheu seguir com a execução equilibrada."
  if (scenario === "conservative") return "Usuário escolheu seguir com a abordagem conservadora."
  if (scenario === "aggressive") return "Usuário escolheu seguir com aceleração agressiva."
  if (mode && /seguimos|vamos nessa|fechado|monta|estrutura|cria|faz/.test(normalizeText(question))) {
    return "Usuário pediu continuidade da missão ativa."
  }
  return safeText(question, 180)
}

function targetGoalFromExecution(execution?: OrionExecutionPayload | null) {
  if (!execution) return null
  if (execution.objective.targetProfit) return `Meta de lucro: ${execution.objective.targetProfit}`
  return execution.objective.title || null
}

function campaignIntentFor(mode: OrionExecutionMode | null, question: string, previous?: OrionOperationalConversationState | null) {
  const text = normalizeText(question)
  if (mode === "marketing_execution") {
    if (/meta ads|trafego|tráfego|ads|anuncio|anúncio/.test(text)) return "Rodar campanha curta com criativo, copy e regra de pausa/escala."
    if (/whatsapp|zap/.test(text)) return "Gerar campanha com sequência de WhatsApp e fechamento."
    if (/stories|story/.test(text)) return "Gerar campanha para Stories com CTA direto para conversa."
    return "Estruturar campanha prática para a missão ativa."
  }
  if (mode === "lead_recovery") return "Recuperar lead com abordagem objetiva e sem desconto ansioso."
  if (mode === "closing_mode") return "Transformar interesse em fechamento com argumento claro."
  return previous?.activeCampaignIntent || null
}

function normalizedIncludes(haystack: string, needle: string) {
  const safeNeedle = normalizeText(needle)
  if (!safeNeedle) return false
  return normalizeText(haystack).includes(safeNeedle)
}

function selectMissionProduct(
  execution?: OrionExecutionPayload | null,
  state?: Pick<OrionOperationalConversationState, "activeProduct" | "currentProduct" | "focusProduct"> | null,
  commercialSubject?: OrionCommercialSubjectSummary | null
) {
  if (commercialSubject?.subjectType === "category") {
    const categoryName = commercialSubject.category || commercialSubject.productFamily || commercialSubject.model || "Categoria informada"
    const matches = commercialSubject.matches.length ? commercialSubject.matches : commercialSubject.relatedProducts
    const quantity = matches.reduce((sum, match) => sum + Math.max(0, match.quantity || 0), 0)
    const price = Math.max(0, Math.round(matches[0]?.price || 0))
    const cost = Math.max(0, Math.round(matches[0]?.cost || 0))
    return {
      id: `category-${compactText(categoryName).replace(/\s+/g, "-")}`,
      name: categoryName,
      quantity,
      price,
      cost,
      profit: Math.max(0, price - cost),
      marginPct: matches[0]?.marginPct || 0,
      daysInStock: matches[0]?.daysInStock || 0,
      status: "active",
      role: "anchor",
      reason: "Categoria comercial citada explicitamente pelo usuário; não usar prioridade global do board como substituto.",
      conversionSpeed: "media",
    } satisfies ProductLike
  }
  const subjectMatch = commercialSubject?.primarySubject || commercialSubject?.matches.find((match) => match.entityRole === "primary")
  if (subjectMatch) {
    return subjectMatchToProduct(subjectMatch)
  }

  if (!execution) return null
  const requestedName = state?.activeProduct || state?.currentProduct || state?.focusProduct
  const allProducts = [
    ...(execution.priorityAction?.product ? [execution.priorityAction.product] : []),
    ...execution.products,
    ...execution.inventory.map((item) => inventoryToProduct(item, requestedName || item.name)),
  ]
  if (requestedName) {
    const exact = allProducts.find((product) => normalizedIncludes(product.name, requestedName) || normalizedIncludes(requestedName, product.name))
    if (exact) return exact
    return {
      id: `requested-${compactText(requestedName).replace(/\s+/g, "-")}`,
      name: requestedName,
      quantity: 0,
      price: 0,
      cost: 0,
      profit: 0,
      marginPct: 0,
      daysInStock: 0,
      status: "not_found_in_execution",
      role: "anchor",
      reason: "Produto solicitado pelo usuário; não usar prioridade global do board como substituto.",
      conversionSpeed: "media",
    } satisfies ProductLike
  }
  return execution.priorityAction?.product || execution.products.find((product) => product.role === "anchor") || execution.products[0] || null
}

function bundleMatchesProduct(bundle: OrionExecutionPayload["bundles"][number], productName: string) {
  return bundleCompatibleWithProduct(bundle, productName)
}

function selectMissionBundle(
  execution?: OrionExecutionPayload | null,
  state?: Pick<OrionOperationalConversationState, "activeOffer" | "selectedOffer" | "chosenOperationalPath" | "selectedScenario"> | null,
  productName?: string | null,
  commercialSubject?: OrionCommercialSubjectSummary | null
) {
  if (!execution) return null
  if (
    commercialSubject
    && (
      commercialSubject.subjectType === "category"
      || commercialSubject.subjectType === "accessory"
      || commercialSubject.matches.some((match) => match.productType === "accessory")
    )
  ) {
    return null
  }
  const offerName = state?.activeOffer || state?.selectedOffer
  if (offerName) {
    const byName = execution.bundles.find((bundle) => {
      const nameMatches = normalizedIncludes(bundle.name, offerName) || normalizedIncludes(offerName, bundle.name)
      return nameMatches && (!productName || bundleCompatibleWithProduct(bundle, productName))
    })
    if (byName) return byName
  }
  const scenario = state?.chosenOperationalPath || state?.selectedScenario
  const byScenario = execution.bundles.find((bundle) => bundle.promotionMode === scenario && (!productName || bundleMatchesProduct(bundle, productName)))
  if (byScenario) return byScenario
  const byProduct = productName ? execution.bundles.find((bundle) => bundleMatchesProduct(bundle, productName)) : null
  return byProduct || null
}

function cashPostureLabel(urgencyLevel: OrionExecutionPayload["objective"]["financialGoal"]["urgencyLevel"]) {
  if (urgencyLevel === "urgent") return "pressão de caixa: priorizar liquidez sem romper piso seguro"
  if (urgencyLevel === "attention") return "atenção financeira: acelerar com controle, sem desconto ansioso"
  return "operação estável: preservar margem e usar valor percebido antes de desconto"
}

export function buildMissionContext(input: {
  snapshot?: OrionSnapshot | null
  execution?: OrionExecutionPayload | null
  state?: OrionOperationalConversationState | null
  intentRoute?: OrionIntentRouteSummary | null
  commercialSubject?: OrionCommercialSubjectSummary | null
}): OrionMissionContext | null {
  if (input.intentRoute?.missionContextPolicy === "ignore") return null
  const execution = input.execution
  if (!execution) return input.state?.activeMissionContext || null
  const state = input.state || null
  const selectedProduct = selectMissionProduct(execution, state, input.commercialSubject)
  const product = productCanBecomeMission(selectedProduct) || input.commercialSubject?.subjectType === "category"
    ? selectedProduct
    : null
  const bundle = selectMissionBundle(execution, state, product?.name, input.commercialSubject)
  const financialGoal = execution.objective.financialGoal
  const nextPayable = input.snapshot?.executive.liquidityForecast.nextPayables[0] || null
  const cleanOfferPrice = product?.price || null
  const cleanOfferProfit = product?.profit || null
  const minimumSafePrice = bundle?.minimumSafePrice ?? null
  const currentOfferPrice = bundle?.price ?? product?.price ?? null
  const discountLimit = currentOfferPrice !== null && minimumSafePrice !== null
    ? Math.max(0, currentOfferPrice - minimumSafePrice)
    : null
  const selectedScenario = state?.chosenOperationalPath || state?.selectedScenario || null
  const selectedChannel = state?.activeTrafficDirection || state?.chosenTrafficDirection || state?.selectedChannel || execution.trafficPlan?.channel || null
  const compatibleAccessoryNames = input.commercialSubject?.primarySubject?.entityType === "device"
    ? input.commercialSubject.compatibleAccessories.map((match) => match.productName).filter((name) => name !== product?.name).slice(0, 4)
    : []
  const offerItems = bundle?.items || (product ? [product.name, ...compatibleAccessoryNames] : [])

  return {
    product: product ? {
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      price: product.price,
      profit: product.profit,
      marginPct: product.marginPct,
      daysInStock: product.daysInStock,
      role: product.role,
      minimumSafePrice,
      conversionSpeed: product.conversionSpeed,
    } : null,
    offer: product ? {
      bundleName: bundle?.name || null,
      items: offerItems.length ? offerItems : [product.name],
      currentOfferPrice: bundle?.price || cleanOfferPrice,
      expectedProfit: bundle?.profit || cleanOfferProfit,
      minimumSafePrice: bundle?.minimumSafePrice || null,
      safeProfitFloor: bundle?.safeProfitFloor || null,
      discountLimit,
      positioning: bundle?.objective || bundle?.promotionNote || "Oferta individual limpa baseada no produto explicitamente solicitado. Não inventar bundle sem compatibilidade clara.",
    } : null,
    finance: {
      cashPosture: cashPostureLabel(financialGoal.urgencyLevel),
      liquidProfitAvailable: financialGoal.liquidProfitAvailable,
      protectedWorkingCapital: financialGoal.protectedWorkingCapital,
      nextPayableAmount: nextPayable?.amount || null,
      nextPayableDueDate: nextPayable?.dueDate || null,
      urgencyLevel: financialGoal.urgencyLevel,
    },
    execution: {
      selectedScenario,
      selectedChannel,
      activeTrafficDirection: selectedChannel,
      pauseRule: execution.trafficPlan?.pauseIf || null,
      scaleRule: execution.trafficPlan?.scaleIf || null,
      responseExpectation: execution.whatsappPlan?.sla || execution.timeline72h[0]?.expectedTarget || null,
      activeStrategy: state?.activeCampaignIntent || bundle?.objective || execution.objective.financialGoal.strategy || null,
    },
    constraints: {
      avoidDiscountBelow: minimumSafePrice,
      doNotUseProtectedCapital: true,
      avoidWrongLeadCategory: true,
      doNotRecommendUnavailableProducts: true,
    },
    memorySignals: {
      lastCampaignResult: state?.activeCampaign ? "campanha ativa em refinamento nesta conversa" : null,
      knownBottleneck: state?.currentBottleneck || null,
      repeatedRisk: state?.currentCommercialConcern || null,
    },
  }
}

export function isExecutionModeOperational(mode?: OrionExecutionMode | null) {
  return mode === "operational_decision" || mode === "marketing_execution" || mode === "sales_execution" || mode === "lead_recovery" || mode === "closing_mode"
}

export function buildOperationalConversationState(input: {
  previousState?: OrionOperationalConversationState | null
  question?: string | null
  operationalContext?: OrionOperationalContext | null
  execution?: OrionExecutionPayload | null
  snapshot?: OrionSnapshot | null
  intentRoute?: OrionIntentRouteSummary | null
  commercialSubject?: OrionCommercialSubjectSummary | null
  operationalGoal?: OrionOperationalGoal | null
  reasoningMode?: OrionReasoningMode | null
  executionGuardrails?: OrionExecutionGuardrails | null
  operationalPlan?: OrionOperationalPlan | null
}): OrionOperationalConversationState {
  const previous = input.previousState || emptyState
  const question = input.question || ""
  const intentRoute = input.intentRoute || input.operationalContext?.intentRoute || null
  const commercialSubject = input.commercialSubject || input.operationalContext?.commercialSubject || null
  const shouldIgnoreMission = intentRoute?.missionContextPolicy === "ignore"
  const effectiveCommercialSubject = commercialSubject?.subjectType && commercialSubject.subjectType !== "unknown"
    ? commercialSubject
    : intentRoute?.missionContextPolicy === "use"
      ? previous.commercialSubject
      : commercialSubject
  const subjectProduct = effectiveCommercialSubject?.primarySubject?.productName
    || effectiveCommercialSubject?.productFamily
    || effectiveCommercialSubject?.model
    || null
  const explicitProduct = shouldIgnoreMission ? null : subjectProduct || (question ? extractExplicitProductName(question) : null)
  const explicitResolvedProduct = explicitProduct ? resolveExplicitProductFromExecution(explicitProduct, input.execution) : null
  const explicitOperationalProduct = productCanBecomeMission(explicitResolvedProduct) ? explicitResolvedProduct : null
  const previousProduct = previous.activeMissionContext?.product?.name || previous.activeProduct || previous.currentProduct || previous.focusProduct
  const explicitProductChanged = Boolean((intentRoute?.missionContextPolicy === "switch") || (explicitOperationalProduct && previousProduct && !sameProduct(explicitOperationalProduct.name, previousProduct)))
  const shouldRebuildMission = intentRoute?.missionContextPolicy === "rebuild" || intentRoute?.missionContextPolicy === "switch"
  const effectivePrevious: OrionOperationalConversationState = shouldIgnoreMission
    ? emptyState
    : explicitProductChanged || shouldRebuildMission
    ? {
        ...previous,
        activeMission: null,
        focusProduct: null,
        currentMission: null,
        currentProduct: null,
        selectedScenario: null,
        chosenOperationalPath: null,
        selectedChannel: null,
        chosenTrafficDirection: null,
        activeTrafficDirection: null,
        selectedOffer: null,
        activeOffer: null,
        activeCampaign: null,
        activeCampaignIntent: null,
        activePricingDiscussion: null,
        activeClosingStrategy: null,
        activeMissionContext: null,
        activeGoal: null,
        activeReasoningMode: null,
        executionGuardrails: null,
        activeOperationalPlanSummary: null,
      }
    : previous
  const detectedScenario = question ? detectScenario(question) : null
  const previousScenario = effectivePrevious.chosenOperationalPath || effectivePrevious.selectedScenario
  const selectedScenario = detectedScenario || previousScenario || null
  const operationalIntent = question
    ? operationalIntentFromRoute(intentRoute, effectivePrevious)
    : effectivePrevious.operationalIntent
  const concernIntent = operationalIntent || "operational_question"
  const executionMode = question
    ? executionModeFromRoute(intentRoute, effectivePrevious) || effectivePrevious.currentExecutionMode || effectivePrevious.executionMode
    : effectivePrevious.currentExecutionMode || effectivePrevious.executionMode
  const resolvedProduct = shouldIgnoreMission
    ? null
    : explicitOperationalProduct?.name
      || selectedProductFromContext(input.operationalContext)
      || effectivePrevious.focusProduct
      || (intentRoute?.missionContextPolicy === "use" ? productFromExecution(input.execution) : null)
  const selectedOffer = offerForScenario(input.execution, selectedScenario, resolvedProduct)
    || effectivePrevious.selectedOffer
    || (executionMode === "marketing_execution" || operationalIntent === "new_strategy" || operationalIntent === "execution_continuation"
      ? defaultOfferForActiveExecution(input.execution, resolvedProduct)
      : null)
  const selectedChannel = question
    ? channelFor(question, executionMode, input.execution) || effectivePrevious.selectedChannel
    : effectivePrevious.selectedChannel
  const targetGoal = effectivePrevious.targetGoal || targetGoalFromExecution(input.execution)
  const deadline = effectivePrevious.deadline || input.execution?.objective.deadlineLabel || null
  const activeMission = resolvedProduct
    ? `Executar venda de ${resolvedProduct}`
    : effectivePrevious.activeMission || input.execution?.objective.title || null
  const chosenTrafficDirection = selectedChannel || effectivePrevious.chosenTrafficDirection
  const activeCampaignIntent = campaignIntentFor(executionMode, question, effectivePrevious)
  const activeCampaign = effectivePrevious.activeCampaign || (activeCampaignIntent && resolvedProduct ? `Campanha ${resolvedProduct}` : null)
  const activePricingDiscussion = operationalIntent === "pricing_refinement"
    ? "Discutindo piso, desconto e parcelamento da oferta ativa."
    : effectivePrevious.activePricingDiscussion
  const activeClosingStrategy = operationalIntent === "closing_execution" || operationalIntent === "objection_handling"
    ? "Fechar com valor percebido, urgência honesta e CTA direto."
    : effectivePrevious.activeClosingStrategy
  const activeGoal = input.operationalGoal
    || input.operationalContext?.operationalGoal
    || effectivePrevious.activeGoal
  const activeReasoningMode = input.reasoningMode
    || input.operationalContext?.reasoningMode
    || effectivePrevious.activeReasoningMode
  const executionGuardrails = input.executionGuardrails
    || input.operationalContext?.executionGuardrails
    || effectivePrevious.executionGuardrails
  const activeOperationalPlanSummary = summarizePlanInput(input.operationalPlan || input.operationalContext?.operationalPlan)
    || effectivePrevious.activeOperationalPlanSummary

  const stateWithoutMissionContext: OrionOperationalConversationState = {
    activeMission,
    focusProduct: resolvedProduct,
    selectedScenario,
    targetGoal,
    deadline,
    selectedChannel,
    selectedOffer,
    lastUserDecision: question ? decisionLabel(question, detectedScenario, executionMode) : previous.lastUserDecision,
    nextExpectedStep: nextStepFor(executionMode) || previous.nextExpectedStep,
    executionMode,
    currentMission: activeMission,
    currentProduct: resolvedProduct,
    currentExecutionMode: executionMode,
    chosenOperationalPath: selectedScenario,
    chosenTrafficDirection,
    activeOffer: selectedOffer,
    activeCampaignIntent,
    activeProduct: resolvedProduct,
    activeCampaign,
    activeTrafficDirection: chosenTrafficDirection,
    activePricingDiscussion,
    activeLeadProfile: effectivePrevious.activeLeadProfile,
    activeClosingStrategy,
    activeExecutionMode: executionMode,
    currentCommercialConcern: question ? commercialConcernFor(concernIntent, question) || effectivePrevious.currentCommercialConcern : effectivePrevious.currentCommercialConcern,
    currentBottleneck: question ? bottleneckFor(concernIntent) || effectivePrevious.currentBottleneck : effectivePrevious.currentBottleneck,
    operationalIntent,
    activeMissionContext: null,
    intentRoute,
    commercialSubject: effectiveCommercialSubject,
    activeGoal,
    activeReasoningMode,
    executionGuardrails,
    activeOperationalPlanSummary,
  }
  const activeMissionContext = shouldIgnoreMission
    ? null
    : buildMissionContext({
      snapshot: input.snapshot,
      execution: input.execution,
      state: stateWithoutMissionContext,
      intentRoute,
      commercialSubject: effectiveCommercialSubject,
    }) || effectivePrevious.activeMissionContext

  return {
    ...stateWithoutMissionContext,
    activeMissionContext,
  }
}

export function summarizeOperationalConversationState(state?: OrionOperationalConversationState | null) {
  if (!state) return null
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => value !== null && value !== "")
  )
}
