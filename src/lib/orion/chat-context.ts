import "server-only"

import { summarizeOperationalConversationState } from "./operational-conversation-state"
import type {
  OrionCommercialSubjectSummary,
  OrionExecutionPayload,
  OrionIntentRouteSummary,
  OrionMissionContext,
  OrionOperationalContext,
  OrionOperationalConversationState,
  OrionSnapshot,
} from "./types"

function normalizeName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function subjectProduct(subject?: OrionCommercialSubjectSummary | null) {
  if (!subject || subject.subjectType === "unknown" || subject.confidence < 0.45) return null
  if (subject.subjectType === "category") return subject.category || subject.productFamily || subject.model
  return subject.primarySubject?.productName || subject.productFamily || subject.model || subject.category
}

export function getChatProductName(input: {
  commercialSubject?: OrionCommercialSubjectSummary | null
  missionContext?: OrionMissionContext | null
  conversationState?: OrionOperationalConversationState | null
}) {
  return subjectProduct(input.commercialSubject)
    || input.missionContext?.product?.name
    || input.conversationState?.activeMissionContext?.product?.name
    || input.conversationState?.activeProduct
    || input.conversationState?.currentProduct
    || input.conversationState?.focusProduct
    || null
}

export function getBoardProductName(execution?: OrionExecutionPayload | null) {
  return execution?.priorityAction?.product?.name || null
}

export function didUserSubjectOverrideBoard(input: {
  commercialSubject?: OrionCommercialSubjectSummary | null
  chatProduct?: string | null
  boardProduct?: string | null
}) {
  const subject = input.commercialSubject
  if (!subject || subject.subjectType === "unknown" || subject.confidence < 0.45) return false
  const chat = normalizeName(input.chatProduct || subjectProduct(subject))
  const board = normalizeName(input.boardProduct)
  return Boolean(chat && board && chat !== board && !chat.includes(board) && !board.includes(chat))
}

export function buildOrionIntentDebug(input: {
  userMessage?: string | null
  commercialSubject?: OrionCommercialSubjectSummary | null
  intentRoute?: OrionIntentRouteSummary | null
  missionContextPolicy?: OrionIntentRouteSummary["missionContextPolicy"] | null
  chatProduct?: string | null
  boardProduct?: string | null
}) {
  return {
    userMessage: input.userMessage || null,
    commercialSubject: input.commercialSubject ? {
      subjectType: input.commercialSubject.subjectType,
      category: input.commercialSubject.category,
      productFamily: input.commercialSubject.productFamily,
      model: input.commercialSubject.model,
      variation: input.commercialSubject.variation,
      compatibilityFamily: input.commercialSubject.compatibilityFamily,
      needsClarification: input.commercialSubject.needsClarification,
      confidence: input.commercialSubject.confidence,
      primarySubject: input.commercialSubject.primarySubject ? {
        inventoryId: input.commercialSubject.primarySubject.inventoryId,
        productName: input.commercialSubject.primarySubject.productName,
        variation: input.commercialSubject.primarySubject.variation,
        color: input.commercialSubject.primarySubject.color,
        status: input.commercialSubject.primarySubject.status,
        productType: input.commercialSubject.primarySubject.productType,
        entityType: input.commercialSubject.primarySubject.entityType,
      } : null,
      compatibleAccessories: input.commercialSubject.compatibleAccessories.slice(0, 5).map((match) => ({
        inventoryId: match.inventoryId,
        productName: match.productName,
        variation: match.variation,
        color: match.color,
        quantity: match.quantity,
        status: match.status,
        productType: match.productType,
        entityType: match.entityType,
      })),
      bundleCandidates: input.commercialSubject.bundleCandidates.slice(0, 3).map((candidate) => ({
        primary: candidate.primary.productName,
        accessories: candidate.accessories.map((accessory) => accessory.productName),
        reason: candidate.reason,
      })),
      matches: input.commercialSubject.matches.slice(0, 5).map((match) => ({
        inventoryId: match.inventoryId,
        productName: match.productName,
        variation: match.variation,
        quantity: match.quantity,
        status: match.status,
        productType: match.productType,
        entityType: match.entityType,
        entityRole: match.entityRole,
      })),
    } : null,
    intentRoute: input.intentRoute ? {
      intent: input.intentRoute.intent,
      missionContextPolicy: input.intentRoute.missionContextPolicy,
      confidence: input.intentRoute.confidence,
      reason: input.intentRoute.reason,
    } : null,
    missionContextPolicy: input.missionContextPolicy || input.intentRoute?.missionContextPolicy || null,
    chatProduct: input.chatProduct || null,
    boardProduct: input.boardProduct || null,
    boardOverrideByUserSubject: didUserSubjectOverrideBoard({
      commercialSubject: input.commercialSubject,
      chatProduct: input.chatProduct,
      boardProduct: input.boardProduct,
    }),
  }
}

export function logOrionIntentDebug(input: Parameters<typeof buildOrionIntentDebug>[0]) {
  if (process.env.ORION_DEBUG_INTENT !== "true") return
  console.info("[ORION_INTENT_DEBUG]", JSON.stringify(buildOrionIntentDebug(input)))
}

export function buildRelevantChatContext(input: {
  question?: string | null
  route?: OrionIntentRouteSummary | null
  subject?: OrionCommercialSubjectSummary | null
  cleanMission?: OrionMissionContext | null
  snapshot: OrionSnapshot
  operationalContext?: OrionOperationalContext | null
  conversationState?: OrionOperationalConversationState | null
  boardExecution?: OrionExecutionPayload | null
}) {
  const boardProduct = getBoardProductName(input.boardExecution)
  const chatProduct = getChatProductName({
    commercialSubject: input.subject,
    missionContext: input.cleanMission,
    conversationState: input.conversationState,
  })
  const subjectMatchIds = new Set([
    ...(input.subject?.primarySubject ? [input.subject.primarySubject.inventoryId] : []),
    ...(input.subject?.relatedProducts.map((match) => match.inventoryId) || []),
    ...(input.subject?.compatibleAccessories.map((match) => match.inventoryId) || []),
  ])
  const relevantStock = subjectMatchIds.size
    ? input.snapshot.stock.availableItems
        .filter((item) => subjectMatchIds.has(item.id))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          status: item.status,
          quantity: item.quantity,
          daysInStock: item.daysInStock,
          suggestedPrice: item.suggestedPrice,
        }))
    : input.subject?.subjectType === "category" && input.subject.category
      ? input.snapshot.stock.availableItems
          .filter((item) => normalizeName(item.category) === normalizeName(input.subject?.category))
          .slice(0, 8)
          .map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            status: item.status,
            quantity: item.quantity,
            daysInStock: item.daysInStock,
            suggestedPrice: item.suggestedPrice,
          }))
      : []

  return {
    userQuestion: input.question || null,
    intentRoute: input.route || null,
    commercialSubject: input.subject || null,
    missionContext: input.route?.missionContextPolicy === "ignore" ? null : input.cleanMission || null,
    operationalGoal: input.operationalContext?.operationalGoal || input.conversationState?.activeGoal || null,
    reasoningMode: input.operationalContext?.reasoningMode || input.conversationState?.activeReasoningMode || null,
    executionGuardrails: input.operationalContext?.executionGuardrails || input.conversationState?.executionGuardrails || null,
    executiveResponsePolicy: {
      role: "ORION conselheira C-Level da Nobretech",
      calculationsAllowed: false,
      mustPreserveBaseDecision: true,
      traceabilityListsFirst: true,
    },
    operationalMemory: input.operationalContext?.operationalMemoryContext || input.conversationState?.operationalMemoryContext || null,
    persistentOperationalMemory: input.snapshot.orionMemory || null,
    proactiveAlerts: input.snapshot.orionProactiveAlerts || [],
    operationalPlan: input.operationalContext?.operationalPlan ? {
      directAnswer: input.operationalContext.operationalPlan.directAnswer,
      directAnswerReason: input.operationalContext.operationalPlan.directAnswerReason,
      feasibility: input.operationalContext.operationalPlan.feasibility,
      recommendedPath: input.operationalContext.operationalPlan.recommendedPath,
      productMix: input.operationalContext.operationalPlan.productMix.slice(0, 5),
      financialValidation: input.operationalContext.operationalPlan.financialValidation,
      risks: input.operationalContext.operationalPlan.risks.slice(0, 4),
      nextActions: input.operationalContext.operationalPlan.nextActions.slice(0, 4),
      executionAllowed: input.operationalContext.operationalPlan.executionAllowed,
    } : null,
    chatProduct,
    boardProduct,
    boardOverrideByUserSubject: didUserSubjectOverrideBoard({
      commercialSubject: input.subject,
      chatProduct,
      boardProduct,
    }),
    financialGuardrails: {
      cashBalanceSource: input.snapshot.finance.cashBalanceSource,
      reconciledCashBalance: input.snapshot.finance.reconciledCashBalance,
      availableLiquidity: input.snapshot.finance.availableLiquidity,
      pendingBalance: input.snapshot.finance.pendingBalance,
      availableSalesProfit: input.snapshot.finance.availableSalesProfit,
      availableOperationalProfitEstimate: input.snapshot.finance.availableOperationalProfitEstimate,
      financialOperationalContext: input.snapshot.finance.financialOperationalContext,
      realProfitSnapshot: input.snapshot.finance.realProfitSnapshot,
      workingCapitalSnapshot: input.snapshot.finance.workingCapitalSnapshot,
      selectedFinancialPeriod: input.snapshot.finance.selectedFinancialPeriod,
      profitAvailabilitySnapshot: input.snapshot.finance.profitAvailabilitySnapshot,
      currentCashCompositionSnapshot: input.snapshot.finance.currentCashCompositionSnapshot,
      pendingPayables: input.snapshot.executive.pendingPayables,
      pendingReceivables: input.snapshot.executive.pendingReceivables,
      nextPayables: input.snapshot.executive.liquidityForecast.nextPayables.slice(0, 3),
    },
    primarySubject: input.subject?.primarySubject || null,
    relatedProducts: input.subject?.relatedProducts || [],
    compatibleAccessories: input.subject?.compatibleAccessories || [],
    bundleCandidates: input.subject?.bundleCandidates || [],
    secondarySuggestions: input.subject?.secondarySuggestions || [],
    relevantProducts: relevantStock,
    operationalContext: input.operationalContext ? {
      intent: input.operationalContext.intent,
      toolsUsed: input.operationalContext.toolsUsed,
      dataStatus: input.operationalContext.dataStatus,
      matchedRecords: input.operationalContext.matchedRecords,
      summary: input.operationalContext.summary,
      answer: input.operationalContext.answer,
      evidence: input.operationalContext.evidence.slice(0, 4),
      gaps: input.operationalContext.gaps.slice(0, 3),
    } : null,
    conversationState: summarizeOperationalConversationState(input.conversationState),
  }
}
