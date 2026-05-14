import { NextRequest, NextResponse } from "next/server"
import { canAccess, requireApiAuthContext } from "@/lib/auth-context"
import { checkRateLimit } from "@/lib/rate-limit"
import { getBoardProductName, getChatProductName, logOrionIntentDebug } from "@/lib/orion/chat-context"
import { estimateOpenAICostUsd } from "@/lib/orion/cost"
import { getOrionModel, isOpenAIConfigured, runOrionOpenAI } from "@/lib/orion/ai"
import { buildOrionBusinessContext, summarizeOperationalContext } from "@/lib/orion/business-query-engine"
import { resolveCommercialSubject, summarizeCommercialSubjectResolution } from "@/lib/orion/commercial-subject-resolver"
import { buildOrionExecutionPayload } from "@/lib/orion/execution-payload"
import { humanizeOrionText, translateOrionAnalysisForExecutive } from "@/lib/orion/executive-translation"
import { extractOperationalGoal } from "@/lib/orion/goal-extractor"
import { deduplicateAnalysis } from "@/lib/orion/insight-deduplication"
import { routeOrionIntent } from "@/lib/orion/intent-router"
import { calculateOperationalHealth } from "@/lib/orion/operational-health-engine"
import { applyMemoryToOrionContext, applyOperationalMemory, getRecentInsights } from "@/lib/orion/operational-memory"
import {
  buildOrionMemorySummary,
  extractOperationalMemoryCandidates,
  hasOrionOperationalMemoryTable,
  loadOpenOrionOperationalMemory,
  persistOrionOperationalMemoryCandidates,
  resolveOrionOperationalMemory,
  upsertOrionOperationalMemory,
} from "@/lib/orion/orion-operational-memory-store"
import {
  buildDecisionMemoryContext,
  createDecisionMemory,
  hasOrionDecisionMemoryTable,
  loadOpenDecisionMemories,
  loadRecentDecisionMemories,
  recordDecisionOutcome,
  type OrionDecisionMemoryItem,
} from "@/lib/orion/orion-decision-memory-store"
import { buildDecisionReflections } from "@/lib/orion/orion-reflection-loop"
import { buildOrionProactiveAlerts, filterStaleOrionMemoryItems, type OrionProactiveAlert } from "@/lib/orion/orion-proactive-alerts"
import { buildOrionResponse } from "@/lib/orion/orion-response-orchestrator"
import {
  buildStructuredIntentRoute,
  isStructuredOrionGoal,
  responseKindForStructuredChat,
  shouldBlockStrategicCopilotForStructuredGoal,
  shouldUseLegacyIntentRoute,
} from "@/lib/orion/orion-route-policy"
import { buildReinvestmentDecision } from "@/lib/orion/reinvestment-intelligence-engine"
import { createOrionPerfTimer, type OrionPerfTimer } from "@/lib/orion/orion-performance-timer"
import { buildExecutiveConversation, buildAllowedFactsFromStructured } from "@/lib/orion/orion-executive-conversation-layer"
import { buildSemanticPlanWithAI, type OrionSemanticPlan } from "@/lib/orion/semantic-planner"
import { buildOperationalPlan } from "@/lib/orion/operational-planning-engine"
import { buildExecutionGuardrails } from "@/lib/orion/execution-guardrails"
import { resolveProfitAvailabilityPeriod, type ResolveProfitAvailabilityPeriodInput } from "@/lib/financial/profit-availability-engine"
import {
  buildOperationalConversationState,
  coerceOperationalConversationState,
  summarizeOperationalConversationState,
} from "@/lib/orion/operational-conversation-state"
import { isExecutionReasoningMode, selectReasoningMode } from "@/lib/orion/reasoning-mode-selector"
import {
  buildOperationalExecutionAnswer,
  buildStrategicCopilotAnswer,
  fallbackStrategicCopilotAnswer,
  shouldUseOperationalExecutionAnswer,
} from "@/lib/orion/strategic-copilot"
import {
  buildLocalOrionAnalysis,
  collectOrionSnapshot,
  getCachedOrionAnalysis,
  getLatestOrionAnalysis,
  getOrionCacheMinutes,
  getOrionHistory,
  getOrionUsage,
  hasOrionLogTable,
  hashOrionPrompt,
  saveOrionAnalysisLog,
} from "@/lib/orion/data"
import type {
  OrionAnalysis,
  OrionApiPayload,
  OrionIntentRouteSummary,
  OrionOperationalContext,
  OrionOperationalConversationState,
  OrionSnapshot,
} from "@/lib/orion/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function forbidden(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 403 })
}

function sanitizeQuestion(value: unknown) {
  if (typeof value !== "string") return null
  const question = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  return question ? question.slice(0, 600) : null
}

function financialPeriodFromSearch(request: NextRequest): ResolveProfitAvailabilityPeriodInput {
  const searchParams = request.nextUrl.searchParams
  return {
    preset: searchParams.get("periodPreset"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  }
}

function financialPeriodFromBody(body: Record<string, unknown>): ResolveProfitAvailabilityPeriodInput {
  const raw = body.selectedFinancialPeriod && typeof body.selectedFinancialPeriod === "object"
    ? body.selectedFinancialPeriod as Record<string, unknown>
    : body
  return {
    preset: typeof raw.periodPreset === "string" ? raw.periodPreset : typeof raw.preset === "string" ? raw.preset : null,
    startDate: typeof raw.startDate === "string" ? raw.startDate : null,
    endDate: typeof raw.endDate === "string" ? raw.endDate : null,
  }
}

function invalidPeriod(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 400 })
}

async function enrichSnapshotWithPersistentOrionMemory(
  companyId: string,
  snapshot: OrionSnapshot,
  persistAlerts: boolean
) {
  const memoryTableReady = await hasOrionOperationalMemoryTable()
  const memoryItems = memoryTableReady
    ? await loadOpenOrionOperationalMemory(companyId)
    : []

  if (memoryTableReady && memoryItems.length > 0) {
    const { stale } = filterStaleOrionMemoryItems(memoryItems, snapshot)
    if (stale.length > 0) {
      void Promise.all(stale.map((m) => resolveOrionOperationalMemory(companyId, m.id))).catch((error) => {
        console.warn("[orion-memory] stale memory supersede skipped", error)
      })
    }
  }

  const proactiveAlerts = buildOrionProactiveAlerts({ snapshot, memoryItems })

  snapshot.orionMemory = buildOrionMemorySummary(memoryItems)
  snapshot.orionProactiveAlerts = proactiveAlerts

  if (memoryTableReady && persistAlerts) {
    void persistProactiveAlerts(companyId, proactiveAlerts).catch((error) => {
      console.warn("[orion-memory] proactive alert persistence skipped", error)
    })
  }

  return { memoryTableReady, memoryItems, proactiveAlerts }
}

async function persistProactiveAlerts(companyId: string, alerts: OrionProactiveAlert[]) {
  await Promise.all(alerts.map((alert) => upsertOrionOperationalMemory({
    companyId,
    memoryType: "open_alert",
    title: alert.title,
    summary: alert.message,
    entityType: alert.entityType,
    entityId: alert.entityId,
    importance: alert.priority,
    evidence: {
      recommendedAction: alert.recommendedAction,
      evidence: alert.evidence,
    },
    metadata: alert.metadata,
  })))
}

async function persistUsefulOperationalMemories(input: {
  companyId: string
  memoryTableReady: boolean
  question: string | null
  intentRoute?: OrionIntentRouteSummary | null
  snapshot: OrionSnapshot
  payload: OrionApiPayload
  operationalContext?: OrionOperationalContext | null
  executionGuardrails?: ReturnType<typeof buildExecutionGuardrails> | null
  usedFallback?: boolean
}) {
  if (!input.memoryTableReady) return
  const finalResponse = input.payload.strategicCopilotAnswer
    || input.payload.analysis.executive_summary
    || input.payload.analysis.summary
  const candidates = extractOperationalMemoryCandidates({
    companyId: input.companyId,
    userMessage: input.question,
    intent: input.intentRoute,
    snapshot: input.snapshot,
    finalResponse,
    executionGuardrails: input.executionGuardrails,
    operationalContext: input.operationalContext,
    analysis: input.payload.analysis,
    usedFallback: input.usedFallback,
  })
  await persistOrionOperationalMemoryCandidates(candidates)
}

function sanitizeOperationalContextForClient(operationalContext?: OrionOperationalContext | null): OrionOperationalContext | undefined {
  if (!operationalContext) return undefined
  return {
    intent: operationalContext.intent,
    toolsUsed: operationalContext.toolsUsed,
    label: operationalContext.label,
    dataStatus: operationalContext.dataStatus,
    matchedRecords: operationalContext.matchedRecords,
    summary: humanizeOrionText(operationalContext.summary),
    answer: humanizeOrionText(operationalContext.answer),
    evidence: operationalContext.evidence.slice(0, 3).map(humanizeOrionText),
    gaps: operationalContext.gaps.map(humanizeOrionText),
    intentRoute: operationalContext.intentRoute,
    commercialSubject: operationalContext.commercialSubject,
    operationalGoal: operationalContext.operationalGoal,
    reasoningMode: operationalContext.reasoningMode,
    executionGuardrails: operationalContext.executionGuardrails,
    operationalMemoryContext: operationalContext.operationalMemoryContext,
    operationalPlan: operationalContext.operationalPlan ? {
      ...operationalContext.operationalPlan,
      response: humanizeOrionText(operationalContext.operationalPlan.response),
    } : undefined,
    contexts: {},
  }
}

async function attachExecutiveConversation(
  payload: OrionApiPayload,
  question: string | null,
  semanticPlan: OrionSemanticPlan | null,
  timer: OrionPerfTimer
): Promise<OrionApiPayload> {
  if (!question || !semanticPlan) return payload
  const response = payload.orionResponse
  if (!response || response.responseKind === "generic_executive") return payload
  const allowedFacts = buildAllowedFactsFromStructured(response)
  const conversation = await timer.mark("executiveConversation", () => buildExecutiveConversation({
    userQuestion: question,
    semanticPlan,
    structuredResponse: response,
    businessDecision: response.structured?.businessDecision || null,
    reinvestmentDecision: response.structured?.reinvestmentDecision || null,
    decisionMemoryReview: response.structured?.decisionMemoryReview || null,
    allowedFacts,
  }))
  timer.meta("conversationFallback", conversation.fallbackApplied ? "true" : "false")
  return {
    ...payload,
    orionResponse: { ...response, executiveConversation: conversation },
  }
}

function shouldUseStrategicCopilotByRoute(operationalContext?: OrionOperationalContext | null) {
  const intent = operationalContext?.intentRoute?.intent
  return intent === "financial_analysis"
    || intent === "financial_traceability"
    || intent === "global_business_question"
    || intent === "inventory_analysis"
    || intent === "strategic_question"
    || intent === "operational_question"
}

function shouldBuildGoalDrivenPlan(input: {
  goal: ReturnType<typeof extractOperationalGoal> | null
  intentRoute: Awaited<ReturnType<typeof routeOrionIntent>> | null
  commercialSubject: ReturnType<typeof summarizeCommercialSubjectResolution> | null
  previousState: OrionOperationalConversationState | null
  allowProductMixGeneration: boolean
}) {
  if (!input.goal) return false
  if (!input.allowProductMixGeneration) return false
  const intent = input.intentRoute?.intent
  if (input.goal.goalType !== "unknown") return true
  if (intent === "financial_analysis" || intent === "financial_traceability" || intent === "global_business_question" || intent === "unrelated_question") return false
  const hasCommercialSubject = Boolean(input.commercialSubject && input.commercialSubject.subjectType !== "unknown" && input.commercialSubject.confidence >= 0.45)
  const hasActiveMission = Boolean(input.previousState?.activeMissionContext || input.previousState?.activeProduct || input.previousState?.currentProduct)
  return Boolean(
    hasCommercialSubject || hasActiveMission
  ) && (
    intent === "pricing_refinement"
    || intent === "offer_refinement"
    || intent === "inventory_analysis"
    || intent === "strategic_question"
    || intent === "operational_question"
  )
}

async function buildPayload(
  companyId: string,
  _companyName: string,
  analysis: OrionAnalysis,
  snapshot: OrionSnapshot,
  cached = false,
  operationalContext?: OrionOperationalContext | null,
  strategicQuestion?: string | null,
  strategicAnswerOverride?: string | null,
  previousConversationState?: OrionOperationalConversationState | null,
  semanticPlanOverride?: OrionSemanticPlan | null
): Promise<OrionApiPayload> {
  const health = calculateOperationalHealth(snapshot)
  const fallback = buildLocalOrionAnalysis(snapshot, null, null, health)
  const currentCriticalFields = cached && !operationalContext
  const safeAnalysis: OrionAnalysis = {
    ...fallback,
    ...analysis,
    summary: currentCriticalFields ? fallback.executive_summary : analysis.executive_summary || fallback.executive_summary || analysis.summary,
    executive_summary: currentCriticalFields ? fallback.executive_summary : analysis.executive_summary || fallback.executive_summary || analysis.summary,
    priority_focus: currentCriticalFields ? fallback.priority_focus : analysis.priority_focus || fallback.priority_focus,
    daily_action_plan: !currentCriticalFields && Array.isArray(analysis.daily_action_plan) && analysis.daily_action_plan.length
      ? analysis.daily_action_plan
      : fallback.daily_action_plan,
    chart_interpretations: !currentCriticalFields && Array.isArray(analysis.chart_interpretations) && analysis.chart_interpretations.length
      ? analysis.chart_interpretations
      : fallback.chart_interpretations,
    alerts: currentCriticalFields ? fallback.alerts : Array.isArray(analysis.alerts) ? analysis.alerts : [],
    recommendations: currentCriticalFields ? fallback.recommendations : Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
    risks: currentCriticalFields ? fallback.risks : Array.isArray(analysis.risks) ? analysis.risks : [],
    opportunities: currentCriticalFields ? fallback.opportunities : Array.isArray(analysis.opportunities) ? analysis.opportunities : [],
    metrics: fallback.metrics,
    charts: fallback.charts,
  }
  const semanticPlan = semanticPlanOverride || (strategicQuestion ? await buildSemanticPlanWithAI({ userQuestion: strategicQuestion }) : null)
  const isDecisionMemoryReview = semanticPlan?.primaryGoal === "decision_memory_review"

  // Apply operational memory + deduplication pipeline
  // Parallelize independent reads to reduce serial latency.
  const [recentInsights, decisionMemoryTableReady] = await Promise.all([
    isDecisionMemoryReview ? Promise.resolve([] as Awaited<ReturnType<typeof getRecentInsights>>) : getRecentInsights(companyId),
    hasOrionDecisionMemoryTable(),
  ])
  const [openDecisionMemories, recentDecisionMemories] = decisionMemoryTableReady
    ? await Promise.all([loadOpenDecisionMemories(companyId), loadRecentDecisionMemories(companyId)])
    : [[] as OrionDecisionMemoryItem[], [] as OrionDecisionMemoryItem[]]
  const withMemory = isDecisionMemoryReview ? safeAnalysis : applyOperationalMemory(safeAnalysis, recentInsights)
  const deduplicated = isDecisionMemoryReview ? withMemory : deduplicateAnalysis(withMemory, snapshot, health)
  const executiveAnalysis = translateOrionAnalysisForExecutive(deduplicated)
  const execution = buildOrionExecutionPayload(snapshot, executiveAnalysis, operationalContext)
  let operationalConversationState = buildOperationalConversationState({
    previousState: previousConversationState,
    question: strategicQuestion,
    operationalContext,
    execution,
    snapshot,
    intentRoute: operationalContext?.intentRoute,
    commercialSubject: operationalContext?.commercialSubject,
    operationalGoal: operationalContext?.operationalGoal,
    reasoningMode: operationalContext?.reasoningMode,
    executionGuardrails: operationalContext?.executionGuardrails,
    operationalPlan: operationalContext?.operationalPlan,
  })
  const operationalMemoryContext = isDecisionMemoryReview
    ? null
    : applyMemoryToOrionContext({
        companyId,
        snapshot,
        operationalContext,
        conversationState: operationalConversationState,
        execution,
        now: snapshot.generatedAt,
      })
  if (operationalContext) {
    operationalContext.operationalMemoryContext = operationalMemoryContext
  }
  operationalConversationState = {
    ...operationalConversationState,
    operationalMemoryContext,
  }
  const boardProduct = getBoardProductName(execution)
  const chatProduct = getChatProductName({
    commercialSubject: operationalConversationState.commercialSubject,
    missionContext: operationalConversationState.activeMissionContext,
    conversationState: operationalConversationState,
  })
  if (strategicQuestion) {
    logOrionIntentDebug({
      userMessage: strategicQuestion,
      commercialSubject: operationalConversationState.commercialSubject,
      intentRoute: operationalConversationState.intentRoute,
      missionContextPolicy: operationalConversationState.intentRoute?.missionContextPolicy,
      chatProduct,
      boardProduct,
    })
  }
  if (decisionMemoryTableReady && openDecisionMemories.length > 0) {
    const reflections = buildDecisionReflections(snapshot, openDecisionMemories)
    void Promise.all(
      reflections
        .filter((reflection) => reflection.resultStatus !== "pending" && reflection.resultStatus !== "inconclusive")
        .map((reflection) =>
          recordDecisionOutcome({
            companyId,
            memoryId: reflection.memoryId,
            resultStatus: reflection.resultStatus,
            reflection: reflection.reflection,
            actualOutcome: reflection.actualOutcome,
            status: reflection.resultStatus === "successful" || reflection.resultStatus === "failed" || reflection.resultStatus === "mixed" ? "done" : "open",
          })
        )
    ).catch((error) => {
      console.warn("[orion-decision-memory] reflection persistence skipped", error)
    })
  }
  const decisionMemoryContext = buildDecisionMemoryContext(openDecisionMemories, recentDecisionMemories)
  const orionResponse = strategicQuestion
    ? buildOrionResponse({
        semanticPlan,
        snapshot,
        userQuestion: strategicQuestion,
        memoryContext: operationalMemoryContext,
        decisionMemoryContext,
        companyId,
      })
    : undefined
  if (decisionMemoryTableReady && orionResponse?.decisionMemoryCandidates?.length) {
    void Promise.all(
      orionResponse.decisionMemoryCandidates.map((candidate) =>
        createDecisionMemory(candidate)
      )
    ).catch((error) => {
      console.warn("[orion-decision-memory] candidate persistence skipped", error)
    })
  }
  const orchestratedAnswer = orionResponse && orionResponse.responseKind !== "generic_executive"
    ? orionResponse.text
    : null
  const planAnswer = strategicQuestion
    && !isDecisionMemoryReview
    && operationalContext?.operationalPlan
    && operationalConversationState.activeReasoningMode
    && !isExecutionReasoningMode(operationalConversationState.activeReasoningMode)
    ? operationalContext.operationalPlan.response
    : null
  const operationalExecutionAnswer = !planAnswer && strategicQuestion && !isDecisionMemoryReview && shouldUseOperationalExecutionAnswer(operationalConversationState)
    ? buildOperationalExecutionAnswer({
        question: strategicQuestion,
        snapshot,
        execution,
        conversationState: operationalConversationState,
      })
    : null
  const deterministicFinancialAnswer = strategicQuestion
    && !isDecisionMemoryReview
    && operationalContext?.answer
    && (
      operationalContext.intentRoute?.intent === "financial_traceability"
      || operationalContext.intentRoute?.intent === "financial_analysis"
      || operationalContext.intent === "financial_traceability"
    )
    ? operationalContext.answer
    : null
  const routeWantsStrategicCopilot = shouldUseStrategicCopilotByRoute(operationalContext)
  const structuredGoalBlocksStrategicCopilot = shouldBlockStrategicCopilotForStructuredGoal(semanticPlan)
  let strategicCopilotAnswer = orchestratedAnswer || planAnswer || operationalExecutionAnswer || deterministicFinancialAnswer || strategicAnswerOverride || undefined
  if (!strategicCopilotAnswer && strategicQuestion && !isDecisionMemoryReview && routeWantsStrategicCopilot && !structuredGoalBlocksStrategicCopilot) {
    strategicCopilotAnswer = await buildStrategicCopilotAnswer({
      question: strategicQuestion,
      snapshot,
      execution,
      conversationState: operationalConversationState,
    }).catch(() => fallbackStrategicCopilotAnswer())
  }
  const responseAnalysis = strategicCopilotAnswer
    ? {
        ...executiveAnalysis,
        summary: strategicCopilotAnswer,
        executive_summary: strategicCopilotAnswer,
      }
    : executiveAnalysis
  const reinvestmentDecision = orionResponse?.structured?.reinvestmentDecision || (strategicQuestion
    && (operationalContext?.reasoningMode === "reinvestment_decision" || operationalContext?.intent === "purchase_capacity_analysis")
    ? buildReinvestmentDecision(snapshot)
    : undefined)

  const [history, usage, logTableReady] = await Promise.all([
    getOrionHistory(companyId),
    getOrionUsage(companyId),
    hasOrionLogTable(),
  ])

  return {
    snapshot,
    analysis: responseAnalysis,
    execution,
    strategicCopilotAnswer,
    reinvestmentDecision,
    orionResponse,
    operationalContext: sanitizeOperationalContextForClient(operationalContext),
    operationalConversationState,
    activeMissionContext: operationalConversationState.activeMissionContext || undefined,
    decisionMemory: decisionMemoryTableReady ? { open: decisionMemoryContext.openDecisions, recent: decisionMemoryContext.recentDecisions } : undefined,
    history,
    usage,
    cached,
    config: {
      openaiConfigured: isOpenAIConfigured(),
      externalSourcesEnabled: false,
      cacheMinutes: getOrionCacheMinutes(),
      logTableReady,
    },
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { companyId, companyName, role, appUserId } = authResult.context
  if (!canAccess(role, "finance.view")) {
    return forbidden("A ORION AI cruza dados financeiros e está disponível apenas para perfis com acesso ao financeiro.")
  }

  const rateLimitResult = checkRateLimit(`orion:${appUserId}`, 20, 60_000)
  if (!rateLimitResult.ok) {
    return NextResponse.json(
      { data: null, error: { message: "Muitas requisições à ORION. Aguarde um momento antes de continuar." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) } }
    )
  }

  const selectedFinancialPeriod = financialPeriodFromSearch(request)
  const resolvedPeriod = resolveProfitAvailabilityPeriod(selectedFinancialPeriod)
  if (resolvedPeriod.error) return invalidPeriod(resolvedPeriod.error)
  const snapshot = await collectOrionSnapshot(companyId, companyName, selectedFinancialPeriod)
  await enrichSnapshotWithPersistentOrionMemory(companyId, snapshot, true)
  const latest = await getLatestOrionAnalysis(companyId)
  const analysis = latest || buildLocalOrionAnalysis(snapshot)

  return NextResponse.json({ data: await buildPayload(companyId, companyName, analysis, snapshot, Boolean(latest)), error: null })
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { companyId, companyName, role, appUserId } = authResult.context
  if (!canAccess(role, "finance.view")) {
    return forbidden("A ORION AI cruza dados financeiros e está disponível apenas para perfis com acesso ao financeiro.")
  }

  const rateLimitResult = checkRateLimit(`orion:${appUserId}`, 30, 60_000)
  if (!rateLimitResult.ok) {
    return NextResponse.json(
      { data: null, error: { message: "Muitas requisições à ORION. Aguarde um momento antes de continuar." } },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) },
      }
    )
  }

  const timer: OrionPerfTimer = createOrionPerfTimer({ companyId })
  try {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const selectedFinancialPeriod = financialPeriodFromBody(body)
  const resolvedPeriod = resolveProfitAvailabilityPeriod(selectedFinancialPeriod)
  if (resolvedPeriod.error) return invalidPeriod(resolvedPeriod.error)
  const mode = body.mode === "chat" ? "chat" : "executive"
  timer.meta("mode", mode)
  const force = Boolean(body.force)
  const question = mode === "chat" ? sanitizeQuestion(body.message) : null
  const semanticPlanForQuestion = question
    ? await timer.mark("semanticPlanner", () => buildSemanticPlanWithAI({ userQuestion: question }, {
        onSemanticRouter: (meta) => {
          timer.note("semanticRouter", meta.durationMs)
          timer.meta("semanticRouterModel", meta.model)
          timer.meta("semanticRouterSource", meta.source)
          timer.meta("semanticRouterIntent", meta.intent)
          timer.meta("semanticRouterConfidence", meta.confidence)
          timer.meta("semanticRouterFallback", meta.fallback ? "true" : "false")
          timer.meta("semanticRouterTimeout", meta.timeout ? "true" : "false")
        },
      }))
    : null
  if (semanticPlanForQuestion) {
    timer.meta("plannerMode", semanticPlanForQuestion.plannerMode)
    timer.meta("primaryGoal", semanticPlanForQuestion.primaryGoal)
  }
  const isDecisionMemoryReviewQuestion = semanticPlanForQuestion?.primaryGoal === "decision_memory_review"
  const isStructuredGoal = isStructuredOrionGoal(semanticPlanForQuestion)
  if (isStructuredGoal) timer.meta("structuredGoal", "true")
  const useLegacyIntentRoute = mode === "chat"
    && Boolean(question)
    && !isDecisionMemoryReviewQuestion
    && shouldUseLegacyIntentRoute(semanticPlanForQuestion)
  const previousConversationState = mode === "chat"
    ? coerceOperationalConversationState(body.operationalConversationState || body.conversationState)
    : null
  const snapshot = await timer.mark("snapshot", () => collectOrionSnapshot(companyId, companyName, selectedFinancialPeriod))
  const persistentMemory = isDecisionMemoryReviewQuestion
    ? { memoryTableReady: false, memoryItems: [], proactiveAlerts: [] as OrionProactiveAlert[] }
    : await timer.mark("enrichMemory", () => enrichSnapshotWithPersistentOrionMemory(companyId, snapshot, false))
  const commercialSubject = useLegacyIntentRoute && question
    ? await timer.mark("commercialSubject", () => resolveCommercialSubject(companyId, question))
    : null
  const intentRoute = mode === "chat" && question && !isDecisionMemoryReviewQuestion
    ? isStructuredGoal
      ? timer.markSync("intentRoute", () => buildStructuredIntentRoute(semanticPlanForQuestion))
      : await timer.mark("intentRoute", () => routeOrionIntent({ message: question, previousState: previousConversationState, commercialSubject }))
    : null
  const commercialSubjectSummary = summarizeCommercialSubjectResolution(commercialSubject)
  const operationalContext = mode === "chat" && question && !isDecisionMemoryReviewQuestion
    ? await timer.mark("businessContext", () => buildOrionBusinessContext(companyId, question, snapshot, intentRoute, commercialSubject))
    : null
  const operationalGoal = mode === "chat" && question && !isDecisionMemoryReviewQuestion
    ? extractOperationalGoal({ message: question, previousState: previousConversationState, intentRoute })
    : null
  const reasoningMode = mode === "chat" && question && !isDecisionMemoryReviewQuestion && operationalGoal
    ? selectReasoningMode({ goal: operationalGoal, intentRoute, userQuestion: question })
    : null
  const executionGuardrails = mode === "chat" && question && !isDecisionMemoryReviewQuestion && reasoningMode
    ? buildExecutionGuardrails({ reasoningMode, goal: operationalGoal, intentRoute, previousState: previousConversationState })
    : null
  const preliminaryConversationState = buildOperationalConversationState({
    previousState: previousConversationState,
    question,
    operationalContext,
    snapshot,
    intentRoute,
    commercialSubject: commercialSubjectSummary,
    operationalGoal,
    reasoningMode,
    executionGuardrails,
  })
  const preliminaryMemoryContext = mode === "chat" && question && !isDecisionMemoryReviewQuestion
    ? applyMemoryToOrionContext({
        companyId,
        snapshot,
        operationalContext,
        conversationState: preliminaryConversationState,
        commercialSubject: commercialSubjectSummary,
        now: snapshot.generatedAt,
      })
    : null
  if (operationalContext) {
    operationalContext.operationalMemoryContext = preliminaryMemoryContext
  }
  const shouldBuildPlan = mode === "chat" && question && !isDecisionMemoryReviewQuestion && reasoningMode && shouldBuildGoalDrivenPlan({
    goal: operationalGoal,
    intentRoute,
    commercialSubject: commercialSubjectSummary,
    previousState: previousConversationState,
    allowProductMixGeneration: Boolean(executionGuardrails?.allowProductMixGeneration),
  })
  const operationalPlan = shouldBuildPlan && operationalGoal && reasoningMode
    ? timer.markSync("operationalPlan", () => buildOperationalPlan({
        snapshot,
        operationalContext,
        commercialSubject: commercialSubjectSummary,
        missionContext: preliminaryConversationState.activeMissionContext || previousConversationState?.activeMissionContext || null,
        goal: operationalGoal,
        reasoningMode,
        executionGuardrails,
        operationalMemoryContext: preliminaryMemoryContext,
      }))
    : null
  if (operationalContext) {
    operationalContext.operationalGoal = operationalGoal || undefined
    operationalContext.reasoningMode = reasoningMode || undefined
    operationalContext.executionGuardrails = executionGuardrails || undefined
    operationalContext.operationalPlan = operationalPlan || undefined
  }
  const promptConversationState = {
    ...buildOperationalConversationState({
    previousState: previousConversationState,
    question,
    operationalContext,
    snapshot,
    intentRoute,
    commercialSubject: commercialSubjectSummary,
    operationalGoal,
    reasoningMode,
    executionGuardrails,
    operationalPlan,
    }),
    operationalMemoryContext: operationalContext?.operationalMemoryContext || null,
  }
  const dataSnapshot = operationalContext
    ? {
        snapshot,
        operational_context: summarizeOperationalContext(operationalContext),
        operational_conversation_state: summarizeOperationalConversationState(promptConversationState),
        intent_route: intentRoute,
        commercial_subject: commercialSubjectSummary,
        operational_goal: operationalGoal,
        reasoning_mode: reasoningMode,
        semantic_plan: semanticPlanForQuestion ? {
          primaryGoal: semanticPlanForQuestion.primaryGoal,
          responseMode: semanticPlanForQuestion.responseMode,
          plannerMode: semanticPlanForQuestion.plannerMode,
          confidence: semanticPlanForQuestion.confidence,
        } : null,
        execution_guardrails: executionGuardrails,
        operational_plan: operationalPlan ? {
          directAnswer: operationalPlan.directAnswer,
          feasibility: operationalPlan.feasibility,
          productMix: operationalPlan.productMix.slice(0, 5),
          executionAllowed: operationalPlan.executionAllowed,
        } : null,
      }
    : semanticPlanForQuestion ? {
        snapshot,
        semantic_plan: {
          primaryGoal: semanticPlanForQuestion.primaryGoal,
          responseMode: semanticPlanForQuestion.responseMode,
          plannerMode: semanticPlanForQuestion.plannerMode,
          confidence: semanticPlanForQuestion.confidence,
        },
      }
    : snapshot
  const promptHash = hashOrionPrompt({
    mode,
    question,
    generatedData: snapshot,
    operationalContext: operationalContext ? summarizeOperationalContext(operationalContext) : null,
    operationalConversationState: summarizeOperationalConversationState(promptConversationState),
    intentRoute,
    commercialSubject: commercialSubjectSummary,
    operationalGoal,
    reasoningMode,
    semanticPlan: semanticPlanForQuestion ? {
      primaryGoal: semanticPlanForQuestion.primaryGoal,
      responseMode: semanticPlanForQuestion.responseMode,
      plannerMode: semanticPlanForQuestion.plannerMode,
      confidence: semanticPlanForQuestion.confidence,
    } : null,
    model: getOrionModel(),
  })

  if (!force && mode !== "chat") {
    const cached = await getCachedOrionAnalysis(companyId, mode, promptHash)
    if (cached) {
      timer.meta("responseKind", "executive_cached")
      return NextResponse.json({
        data: await timer.mark("buildPayload", () => buildPayload(companyId, companyName, cached.response_json, snapshot, true, operationalContext, question, null, previousConversationState, semanticPlanForQuestion)),
        error: null,
      })
    }
  }

  if (mode === "chat" && question && isDecisionMemoryReviewQuestion) {
    timer.meta("responseKind", "decision_memory_review")
    const localAnalysis = buildLocalOrionAnalysis(snapshot, question, null)
    let payload = await timer.mark("buildPayload", () => buildPayload(companyId, companyName, localAnalysis, snapshot, false, null, question, null, previousConversationState, semanticPlanForQuestion))
    payload = await attachExecutiveConversation(payload, question, semanticPlanForQuestion, timer)
    await saveOrionAnalysisLog({
      companyId,
      userId: appUserId,
      analysisType: mode,
      question,
      promptHash,
      model: semanticPlanForQuestion?.plannerMode || "semantic-planner",
      status: "local",
      responseJson: localAnalysis,
      snapshot: dataSnapshot,
    })
    return NextResponse.json({ data: payload, error: null })
  }

  const usage = await getOrionUsage(companyId)

  const shouldUsePlanAnswer = Boolean(operationalPlan && reasoningMode && !isExecutionReasoningMode(reasoningMode))
  const shouldUseOperationalAnswer = shouldUseOperationalExecutionAnswer(promptConversationState)
  const routeWantsStrategicCopilot = shouldUseStrategicCopilotByRoute(operationalContext)
  const structuredGoalBlocksStrategicCopilot = shouldBlockStrategicCopilotForStructuredGoal(semanticPlanForQuestion)
  const responseKind = responseKindForStructuredChat({
    shouldUsePlanAnswer,
    shouldUseOperationalAnswer,
    routeWantsStrategicCopilot,
    semanticPlan: semanticPlanForQuestion,
  })
  if (mode === "chat" && question && (shouldUsePlanAnswer || shouldUseOperationalAnswer || (routeWantsStrategicCopilot && !structuredGoalBlocksStrategicCopilot) || isStructuredGoal)) {
    timer.meta("responseKind", responseKind)
    const strategicAnswerOverride = !structuredGoalBlocksStrategicCopilot && !shouldUseOperationalAnswer && usage.monthlyLimit !== null && usage.callsThisMonth >= usage.monthlyLimit
      ? fallbackStrategicCopilotAnswer()
      : null
    const localAnalysis = buildLocalOrionAnalysis(snapshot, question, operationalContext)
    let payload = await timer.mark("buildPayload", () => buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, strategicAnswerOverride, previousConversationState, semanticPlanForQuestion))
    payload = await attachExecutiveConversation(payload, question, semanticPlanForQuestion, timer)
    const usedFallback = payload.strategicCopilotAnswer === fallbackStrategicCopilotAnswer()
    await saveOrionAnalysisLog({
      companyId,
      userId: appUserId,
      analysisType: mode,
      question,
      promptHash,
      model: shouldUsePlanAnswer ? "operational-planning-engine" : shouldUseOperationalAnswer ? "operational-state-machine" : usedFallback ? "strategic-copilot-fallback" : getOrionModel(),
      status: usedFallback ? "error" : "success",
      responseJson: payload.analysis,
      snapshot: dataSnapshot,
      errorMessage: usedFallback ? "A análise estratégica não pôde ser gerada pela IA." : undefined,
    })
    void persistUsefulOperationalMemories({
      companyId,
      memoryTableReady: persistentMemory.memoryTableReady,
      question,
      intentRoute,
      snapshot,
      payload,
      operationalContext,
      executionGuardrails,
      usedFallback,
    }).catch((error) => {
      console.warn("[orion-memory] response memory persistence skipped", error)
    })
    return NextResponse.json({
      data: payload,
      error: null,
    })
  }

  if (usage.monthlyLimit !== null && usage.callsThisMonth >= usage.monthlyLimit) {
    const localAnalysis = buildLocalOrionAnalysis(snapshot, question, operationalContext)
    await saveOrionAnalysisLog({
      companyId,
      userId: appUserId,
      analysisType: mode,
      question,
      promptHash,
      model: "local",
      status: "local",
      responseJson: localAnalysis,
      snapshot: dataSnapshot,
      errorMessage: "Limite mensal da ORION AI atingido; resposta gerada sem chamada externa.",
    })
    return NextResponse.json({
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, null, previousConversationState, semanticPlanForQuestion),
      error: null,
    })
  }

  if (!isOpenAIConfigured()) {
    const localAnalysis = buildLocalOrionAnalysis(snapshot, question, operationalContext)
    await saveOrionAnalysisLog({
      companyId,
      userId: appUserId,
      analysisType: mode,
      question,
      promptHash,
      model: "local",
      status: "local",
      responseJson: localAnalysis,
      snapshot: dataSnapshot,
      errorMessage: "OPENAI_API_KEY não configurada no backend.",
    })
    return NextResponse.json({
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, null, previousConversationState, semanticPlanForQuestion),
      error: null,
    })
  }

  timer.meta("responseKind", "openai_main")
  if (isStructuredGoal) {
    console.warn(`[ORION_ROUTE_WARN] structured goal fell into openai_main: ${semanticPlanForQuestion?.primaryGoal}`)
  }
  try {
    const result = await timer.mark("openaiMain", () => runOrionOpenAI(snapshot, question, operationalContext, promptConversationState))
    const estimatedCostUsd = estimateOpenAICostUsd(result.model, result.inputTokens, result.outputTokens)
    await saveOrionAnalysisLog({
      companyId,
      userId: appUserId,
      analysisType: mode,
      question,
      promptHash,
      model: result.model,
      status: "success",
      responseJson: result.analysis,
      snapshot: dataSnapshot,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      estimatedCostUsd,
    })
    const payload = await timer.mark("buildPayload", () => buildPayload(companyId, companyName, result.analysis, snapshot, false, operationalContext, question, null, previousConversationState, semanticPlanForQuestion))
    void persistUsefulOperationalMemories({
      companyId,
      memoryTableReady: persistentMemory.memoryTableReady,
      question,
      intentRoute,
      snapshot,
      payload,
      operationalContext,
      executionGuardrails,
      usedFallback: false,
    }).catch((error) => {
      console.warn("[orion-memory] response memory persistence skipped", error)
    })

    return NextResponse.json({
      data: payload,
      error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada na OpenAI."
    const localAnalysis = buildLocalOrionAnalysis(snapshot, question, operationalContext)
    await saveOrionAnalysisLog({
      companyId,
      userId: appUserId,
      analysisType: mode,
      question,
      promptHash,
      model: getOrionModel(),
      status: "error",
      responseJson: localAnalysis,
      snapshot: dataSnapshot,
      errorMessage: message.slice(0, 1000),
    })

    return NextResponse.json({
      data: await timer.mark("buildPayload", () => buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, null, previousConversationState, semanticPlanForQuestion)),
      error: { message: "A chamada externa falhou; a ORION retornou uma análise local baseada nos dados internos." },
    })
  }
  } finally {
    timer.logSummary()
  }
}
