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
import { buildOrionProactiveAlerts, filterStaleOrionMemoryItems, type OrionProactiveAlert } from "@/lib/orion/orion-proactive-alerts"
import { buildOrionResponse } from "@/lib/orion/orion-response-orchestrator"
import { buildReinvestmentDecision } from "@/lib/orion/reinvestment-intelligence-engine"
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
  companyName: string,
  analysis: OrionAnalysis,
  snapshot: OrionSnapshot,
  cached = false,
  operationalContext?: OrionOperationalContext | null,
  strategicQuestion?: string | null,
  strategicAnswerOverride?: string | null,
  previousConversationState?: OrionOperationalConversationState | null
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

  // Apply operational memory + deduplication pipeline
  const recentInsights = await getRecentInsights(companyId)
  const withMemory = applyOperationalMemory(safeAnalysis, recentInsights)
  const deduplicated = deduplicateAnalysis(withMemory, snapshot, health)
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
  const operationalMemoryContext = applyMemoryToOrionContext({
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
  const orionResponse = strategicQuestion
    ? buildOrionResponse({
        snapshot,
        userQuestion: strategicQuestion,
        memoryContext: operationalMemoryContext,
      })
    : undefined
  const orchestratedAnswer = orionResponse && orionResponse.responseKind !== "generic_executive"
    ? orionResponse.text
    : null
  const planAnswer = strategicQuestion
    && operationalContext?.operationalPlan
    && operationalConversationState.activeReasoningMode
    && !isExecutionReasoningMode(operationalConversationState.activeReasoningMode)
    ? operationalContext.operationalPlan.response
    : null
  const operationalExecutionAnswer = !planAnswer && strategicQuestion && shouldUseOperationalExecutionAnswer(operationalConversationState)
    ? buildOperationalExecutionAnswer({
        question: strategicQuestion,
        snapshot,
        execution,
        conversationState: operationalConversationState,
      })
    : null
  const deterministicFinancialAnswer = strategicQuestion
    && operationalContext?.answer
    && (
      operationalContext.intentRoute?.intent === "financial_traceability"
      || operationalContext.intentRoute?.intent === "financial_analysis"
      || operationalContext.intent === "financial_traceability"
    )
    ? operationalContext.answer
    : null
  let strategicCopilotAnswer = orchestratedAnswer || planAnswer || operationalExecutionAnswer || deterministicFinancialAnswer || strategicAnswerOverride || undefined
  if (!strategicCopilotAnswer && strategicQuestion && shouldUseStrategicCopilotByRoute(operationalContext)) {
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const selectedFinancialPeriod = financialPeriodFromBody(body)
  const resolvedPeriod = resolveProfitAvailabilityPeriod(selectedFinancialPeriod)
  if (resolvedPeriod.error) return invalidPeriod(resolvedPeriod.error)
  const mode = body.mode === "chat" ? "chat" : "executive"
  const force = Boolean(body.force)
  const question = mode === "chat" ? sanitizeQuestion(body.message) : null
  const previousConversationState = mode === "chat"
    ? coerceOperationalConversationState(body.operationalConversationState || body.conversationState)
    : null
  const snapshot = await collectOrionSnapshot(companyId, companyName, selectedFinancialPeriod)
  const persistentMemory = await enrichSnapshotWithPersistentOrionMemory(companyId, snapshot, false)
  const commercialSubject = mode === "chat" && question
    ? await resolveCommercialSubject(companyId, question)
    : null
  const intentRoute = mode === "chat" && question
    ? await routeOrionIntent({ message: question, previousState: previousConversationState, commercialSubject })
    : null
  const commercialSubjectSummary = summarizeCommercialSubjectResolution(commercialSubject)
  const operationalContext = mode === "chat" && question
    ? await buildOrionBusinessContext(companyId, question, snapshot, intentRoute, commercialSubject)
    : null
  const operationalGoal = mode === "chat" && question
    ? extractOperationalGoal({ message: question, previousState: previousConversationState, intentRoute })
    : null
  const reasoningMode = mode === "chat" && question && operationalGoal
    ? selectReasoningMode({ goal: operationalGoal, intentRoute, userQuestion: question })
    : null
  const executionGuardrails = mode === "chat" && question && reasoningMode
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
  const preliminaryMemoryContext = mode === "chat" && question
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
  const shouldBuildPlan = mode === "chat" && question && reasoningMode && shouldBuildGoalDrivenPlan({
    goal: operationalGoal,
    intentRoute,
    commercialSubject: commercialSubjectSummary,
    previousState: previousConversationState,
    allowProductMixGeneration: Boolean(executionGuardrails?.allowProductMixGeneration),
  })
  const operationalPlan = shouldBuildPlan && operationalGoal && reasoningMode
    ? buildOperationalPlan({
        snapshot,
        operationalContext,
        commercialSubject: commercialSubjectSummary,
        missionContext: preliminaryConversationState.activeMissionContext || previousConversationState?.activeMissionContext || null,
        goal: operationalGoal,
        reasoningMode,
        executionGuardrails,
        operationalMemoryContext: preliminaryMemoryContext,
      })
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
        execution_guardrails: executionGuardrails,
        operational_plan: operationalPlan ? {
          directAnswer: operationalPlan.directAnswer,
          feasibility: operationalPlan.feasibility,
          productMix: operationalPlan.productMix.slice(0, 5),
          executionAllowed: operationalPlan.executionAllowed,
        } : null,
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
    model: getOrionModel(),
  })

  if (!force && mode !== "chat") {
    const cached = await getCachedOrionAnalysis(companyId, mode, promptHash)
    if (cached) {
      return NextResponse.json({
        data: await buildPayload(companyId, companyName, cached.response_json, snapshot, true, operationalContext, question, null, previousConversationState),
        error: null,
      })
    }
  }

  const usage = await getOrionUsage(companyId)

  const shouldUsePlanAnswer = Boolean(operationalPlan && reasoningMode && !isExecutionReasoningMode(reasoningMode))
  const shouldUseOperationalAnswer = shouldUseOperationalExecutionAnswer(promptConversationState)
  if (mode === "chat" && question && (shouldUsePlanAnswer || shouldUseOperationalAnswer || shouldUseStrategicCopilotByRoute(operationalContext))) {
    const strategicAnswerOverride = !shouldUseOperationalAnswer && usage.monthlyLimit !== null && usage.callsThisMonth >= usage.monthlyLimit
      ? fallbackStrategicCopilotAnswer()
      : null
    const localAnalysis = buildLocalOrionAnalysis(snapshot, question, operationalContext)
    const payload = await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, strategicAnswerOverride, previousConversationState)
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
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, null, previousConversationState),
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
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, null, previousConversationState),
      error: null,
    })
  }

  try {
    const result = await runOrionOpenAI(snapshot, question, operationalContext, promptConversationState)
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
    const payload = await buildPayload(companyId, companyName, result.analysis, snapshot, false, operationalContext, question, null, previousConversationState)
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
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext, question, null, previousConversationState),
      error: { message: "A chamada externa falhou; a ORION retornou uma análise local baseada nos dados internos." },
    })
  }
}
