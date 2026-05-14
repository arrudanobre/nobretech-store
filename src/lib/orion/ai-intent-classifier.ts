import "server-only"

import type { CommercialSubjectResolution } from "./commercial-subject-resolver"
import type { OrionConversationIntent, OrionIntentRouteSummary, OrionMissionContextPolicy, OrionOperationalConversationState } from "./types"

const ORION_INTENT_MODEL = process.env.ORION_INTENT_OPENAI_MODEL
  || process.env.ORION_OPENAI_MODEL
  || process.env.OPENAI_MODEL
  || "gpt-5-mini"

const allowedIntents = new Set<OrionConversationIntent>([
  "global_business_question",
  "financial_traceability",
  "pricing_refinement",
  "offer_refinement",
  "marketing_execution",
  "financial_analysis",
  "product_switch",
  "mission_continuation",
  "new_campaign_request",
  "inventory_analysis",
  "strategic_question",
  "operational_question",
  "unrelated_question",
])

const allowedPolicies = new Set<OrionMissionContextPolicy>(["use", "ignore", "rebuild", "switch"])

const intentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "pricing_refinement",
        "global_business_question",
        "financial_traceability",
        "offer_refinement",
        "marketing_execution",
        "financial_analysis",
        "product_switch",
        "mission_continuation",
        "new_campaign_request",
        "inventory_analysis",
        "strategic_question",
        "operational_question",
        "unrelated_question",
      ],
    },
    missionContextPolicy: {
      type: "string",
      enum: ["use", "ignore", "rebuild", "switch"],
    },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["intent", "missionContextPolicy", "confidence", "reason"],
}

function sanitizeText(value: string, maxLength = 600) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const direct = (payload as { output_text?: unknown }).output_text
  if (typeof direct === "string") return direct

  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) return ""

  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue
      const text = (contentItem as { text?: unknown }).text
      if (typeof text === "string") parts.push(text)
    }
  }
  return parts.join("\n")
}

function summarizePreviousState(previousState?: OrionOperationalConversationState | null) {
  if (!previousState) return null
  return {
    activeProduct: previousState.activeMissionContext?.product?.name || previousState.activeProduct || previousState.currentProduct || previousState.focusProduct,
    activeOffer: previousState.activeMissionContext?.offer?.bundleName || previousState.activeOffer || previousState.selectedOffer,
    activeMission: previousState.activeMission || previousState.currentMission,
    executionMode: previousState.currentExecutionMode || previousState.executionMode,
    operationalIntent: previousState.operationalIntent,
  }
}

function summarizeCommercialSubject(commercialSubject?: CommercialSubjectResolution | null) {
  if (!commercialSubject) return null
  return {
    subjectType: commercialSubject.subjectType,
    category: commercialSubject.category,
    productFamily: commercialSubject.productFamily,
    model: commercialSubject.model,
    variation: commercialSubject.variation,
    compatibilityFamily: commercialSubject.compatibilityFamily,
    needsClarification: commercialSubject.needsClarification,
    confidence: commercialSubject.confidence,
    primarySubject: commercialSubject.primarySubject ? {
      inventoryId: commercialSubject.primarySubject.inventoryId,
      productName: commercialSubject.primarySubject.productName,
      category: commercialSubject.primarySubject.category,
      model: commercialSubject.primarySubject.model,
      variation: commercialSubject.primarySubject.variation,
      color: commercialSubject.primarySubject.color,
      productType: commercialSubject.primarySubject.productType,
      entityType: commercialSubject.primarySubject.entityType,
    } : null,
    compatibleAccessories: commercialSubject.compatibleAccessories.slice(0, 6).map((match) => ({
      inventoryId: match.inventoryId,
      productName: match.productName,
      variation: match.variation,
      color: match.color,
      productType: match.productType,
      entityType: match.entityType,
    })),
    matches: commercialSubject.matches.slice(0, 6).map((match) => ({
      inventoryId: match.inventoryId,
      productName: match.productName,
      variation: match.variation,
      quantity: match.quantity,
      price: match.price,
      cost: match.cost,
      marginPct: match.marginPct,
      daysInStock: match.daysInStock,
      status: match.status,
      productType: match.productType,
      entityType: match.entityType,
      entityRole: match.entityRole,
    })),
  }
}

function normalizeRoute(route: Partial<OrionIntentRouteSummary>, fallback: OrionIntentRouteSummary): OrionIntentRouteSummary {
  const intent = allowedIntents.has(route.intent as OrionConversationIntent)
    ? route.intent as OrionConversationIntent
    : fallback.intent
  const missionContextPolicy = allowedPolicies.has(route.missionContextPolicy as OrionMissionContextPolicy)
    ? route.missionContextPolicy as OrionMissionContextPolicy
    : fallback.missionContextPolicy
  const confidence = Number(route.confidence)
  return {
    intent,
    missionContextPolicy,
    useMissionContext: missionContextPolicy === "use",
    ignoreMissionContext: missionContextPolicy === "ignore",
    rebuildMissionContext: missionContextPolicy === "rebuild" || missionContextPolicy === "switch",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(0.98, confidence)) : fallback.confidence,
    reason: sanitizeText(route.reason || fallback.reason, 240),
  }
}

export async function classifyIntentWithAI(input: {
  message: string
  deterministicRoute: OrionIntentRouteSummary
  commercialSubject?: CommercialSubjectResolution | null
  previousState?: OrionOperationalConversationState | null
}): Promise<OrionIntentRouteSummary> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada no backend.")

  const controller = new AbortController()
  const timeoutMs = Number(process.env.ORION_INTENT_CLASSIFIER_TIMEOUT_MS) || 3000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ORION_INTENT_MODEL,
      instructions: [
        "Você é apenas o classificador de intenção da ORION. Não responda ao usuário.",
        "Retorne somente JSON estrito no schema solicitado.",
        "A mensagem atual sempre vence o contexto antigo.",
        "Não invente produto, preço, margem, estoque ou disponibilidade.",
        "Use commercialSubject apenas como evidência do banco; se ele estiver vazio ou ambíguo, não invente.",
        "Perguntas globais sobre empresa, caixa ou saúde financeira devem ser financial_analysis com policy ignore.",
        "Pedidos para listar, mostrar, detalhar, estratificar, extrair, abrir, quebrar ou explicar composição de movimentos financeiros devem ser financial_traceability com policy ignore.",
        "Perguntas sobre saque, retirada do dono, retirada segura, pagar contas, reinvestir ou capital de giro são financial_analysis com policy ignore, mesmo que exista missão comercial ativa.",
        "Refinamento de preço, menor valor, desconto, margem ou apertar valor deve ser pricing_refinement; use mission context se não houver produto novo citado.",
        "Pedido de campanha, anúncio, copy, criativo, Stories, WhatsApp ou tráfego deve ser marketing_execution.",
        "Se a mensagem citar produto diferente do ativo, classifique product_switch com policy switch.",
        "Se a mensagem continuar a missão ativa sem novo produto, use mission_continuation ou refinamento com policy use.",
        "Se não houver confiança, classifique operational_question com policy ignore e baixa confiança.",
      ].join(" "),
      input: JSON.stringify({
        message: sanitizeText(input.message),
        deterministicRoute: input.deterministicRoute,
        commercialSubject: summarizeCommercialSubject(input.commercialSubject),
        previousState: summarizePreviousState(input.previousState),
      }),
      text: {
        format: {
          type: "json_schema",
          name: "orion_intent_route",
          strict: true,
          schema: intentSchema,
        },
      },
    }),
  }).finally(() => clearTimeout(timeout))

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : `OpenAI respondeu HTTP ${response.status}`
    throw new Error(message)
  }

  const outputText = extractOutputText(payload)
  if (!outputText) throw new Error("Classificador de intenção não retornou conteúdo.")
  return normalizeRoute(JSON.parse(outputText) as Partial<OrionIntentRouteSummary>, input.deterministicRoute)
}
