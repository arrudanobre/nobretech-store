import { NextRequest, NextResponse } from "next/server"
import { canAccess, requireApiAuthContext } from "@/lib/auth-context"
import { estimateOpenAICostUsd } from "@/lib/orion/cost"
import { getOrionModel, isOpenAIConfigured, runOrionOpenAI } from "@/lib/orion/ai"
import { buildOrionBusinessContext, summarizeOperationalContext } from "@/lib/orion/business-query-engine"
import { humanizeOrionText, translateOrionAnalysisForExecutive } from "@/lib/orion/executive-translation"
import { deduplicateAnalysis } from "@/lib/orion/insight-deduplication"
import { calculateOperationalHealth } from "@/lib/orion/operational-health-engine"
import { applyOperationalMemory, getRecentInsights } from "@/lib/orion/operational-memory"
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
import type { OrionAnalysis, OrionApiPayload, OrionOperationalContext, OrionSnapshot } from "@/lib/orion/types"

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
    contexts: {},
  }
}

async function buildPayload(
  companyId: string,
  companyName: string,
  analysis: OrionAnalysis,
  snapshot: OrionSnapshot,
  cached = false,
  operationalContext?: OrionOperationalContext | null
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

  const [history, usage, logTableReady] = await Promise.all([
    getOrionHistory(companyId),
    getOrionUsage(companyId),
    hasOrionLogTable(),
  ])

  return {
    snapshot,
    analysis: executiveAnalysis,
    operationalContext: sanitizeOperationalContextForClient(operationalContext),
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

export async function GET() {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { companyId, companyName, role } = authResult.context
  if (!canAccess(role, "finance.view")) {
    return forbidden("A ORION AI cruza dados financeiros e está disponível apenas para perfis com acesso ao financeiro.")
  }

  const snapshot = await collectOrionSnapshot(companyId, companyName)
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const mode = body.mode === "chat" ? "chat" : "executive"
  const force = Boolean(body.force)
  const question = mode === "chat" ? sanitizeQuestion(body.message) : null
  const snapshot = await collectOrionSnapshot(companyId, companyName)
  const operationalContext = mode === "chat" && question
    ? await buildOrionBusinessContext(companyId, question, snapshot)
    : null
  const dataSnapshot = operationalContext
    ? { snapshot, operational_context: summarizeOperationalContext(operationalContext) }
    : snapshot
  const promptHash = hashOrionPrompt({
    mode,
    question,
    generatedData: snapshot,
    operationalContext: operationalContext ? summarizeOperationalContext(operationalContext) : null,
    model: getOrionModel(),
  })

  if (!force) {
    const cached = await getCachedOrionAnalysis(companyId, mode, promptHash)
    if (cached) {
      return NextResponse.json({
        data: await buildPayload(companyId, companyName, cached.response_json, snapshot, true, operationalContext),
        error: null,
      })
    }
  }

  const usage = await getOrionUsage(companyId)
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
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext),
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
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext),
      error: null,
    })
  }

  try {
    const result = await runOrionOpenAI(snapshot, question, operationalContext)
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

    return NextResponse.json({
      data: await buildPayload(companyId, companyName, result.analysis, snapshot, false, operationalContext),
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
      data: await buildPayload(companyId, companyName, localAnalysis, snapshot, false, operationalContext),
      error: { message: "A chamada externa falhou; a ORION retornou uma análise local baseada nos dados internos." },
    })
  }
}
