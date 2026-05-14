import type { OrionToolName } from "./orion-tool-registry"

export type OrionSemanticRouteIntent =
  | "operational_action"
  | "business_strategy"
  | "capital_allocation"
  | "marketing_strategy"
  | "business_review"
  | "cash_health"
  | "inventory_review"
  | "sales_performance_review"
  | "lead_review"
  | "campaign_review"
  | "decision_memory_review"
  | "audit_traceability"
  | "unknown"

export type OrionSemanticRouteConfidence = "low" | "medium" | "high"

export type OrionSemanticRouteTimeframe = {
  type: "today" | "current_week" | "next_n_days" | "current_month" | "custom" | "unknown"
  days?: number
  label?: string
}

export type OrionIntentDefinition = {
  intent: OrionSemanticRouteIntent
  description: string
}

export type OrionSemanticRoute = {
  intent: OrionSemanticRouteIntent
  confidence: OrionSemanticRouteConfidence
  timeframe?: OrionSemanticRouteTimeframe
  budgetAmount?: number
  entities: string[]
  toolsNeeded: OrionToolName[]
  reasoning: string
  source?: "local" | "ai"
}

export type OrionSemanticRouterInput = {
  userQuestion: string
  currentPage?: string
  selectedPeriod?: string
  availableIntents?: OrionIntentDefinition[]
  hasOpenMemory?: boolean
  currentDate?: string | null
}

export type OrionSemanticRouterMeta = {
  source: "local" | "ai"
  model: string
  durationMs: number
  intent: OrionSemanticRouteIntent
  confidence: OrionSemanticRouteConfidence
  timeout: boolean
  fallback: boolean
}

type SemanticRouterFetch = typeof fetch

type BuildSemanticRouteOptions = {
  apiKey?: string | null
  model?: string
  fetcher?: SemanticRouterFetch
  timeoutMs?: number
  onComplete?: (meta: OrionSemanticRouterMeta) => void
}

const allowedIntents: OrionSemanticRouteIntent[] = [
  "operational_action",
  "business_strategy",
  "capital_allocation",
  "marketing_strategy",
  "business_review",
  "cash_health",
  "inventory_review",
  "sales_performance_review",
  "lead_review",
  "campaign_review",
  "decision_memory_review",
  "audit_traceability",
  "unknown",
]

const allowedConfidence: OrionSemanticRouteConfidence[] = ["low", "medium", "high"]

const allowedTimeframeTypes: Array<NonNullable<OrionSemanticRoute["timeframe"]>["type"]> = [
  "today",
  "current_week",
  "next_n_days",
  "current_month",
  "custom",
  "unknown",
]

const allowedTools: OrionToolName[] = [
  "finance.cashPosition",
  "finance.receivables",
  "finance.payables",
  "sales.performance",
  "sales.marginByProduct",
  "inventory.stuckItems",
  "inventory.availableStock",
  "marketing.campaignPerformance",
  "leads.funnelHealth",
  "reinvestment.decision",
]

export const ORION_SEMANTIC_INTENTS: OrionIntentDefinition[] = [
  { intent: "operational_action", description: "Próxima ação prática, foco de hoje, por onde começar, usuário perdido ou pedindo direção imediata." },
  { intent: "business_strategy", description: "Rumo, caminho, visão estratégica, o que faria no lugar do dono, próximos dias ou decisão ampla." },
  { intent: "capital_allocation", description: "Onde colocar dinheiro, comprar, recomprar, mexer em estoque ou alocar capital." },
  { intent: "marketing_strategy", description: "Tráfego, campanha, mídia, anúncio, teste comercial ou canal de aquisição." },
  { intent: "business_review", description: "Saúde geral da Nobretech, se está indo bem, visão ampla da operação." },
  { intent: "cash_health", description: "Caixa, liquidez, contas, saldo ou saúde financeira específica." },
  { intent: "inventory_review", description: "Estoque, produtos parados, giro, disponibilidade ou prioridade de inventário." },
  { intent: "sales_performance_review", description: "Vendas, receita, lucro comercial, margem por produto ou performance comercial." },
  { intent: "lead_review", description: "Leads, follow-up, funil, atendimento ou oportunidades comerciais." },
  { intent: "campaign_review", description: "ROI, resultado de campanhas ou diagnóstico de campanhas existentes." },
  { intent: "decision_memory_review", description: "Decisões abertas, pendências, recomendações anteriores ou o que a ORION está acompanhando." },
  { intent: "audit_traceability", description: "Raciocínio, cálculo, como chegou, por que recomendou, abertura de conta/teto/reinvestimento." },
  { intent: "unknown", description: "Fora do escopo da Nobretech/ERP." },
]

const routeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: allowedIntents },
    confidence: { type: "string", enum: allowedConfidence },
    timeframe: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: allowedTimeframeTypes },
        days: { type: ["number", "null"] },
        label: { type: ["string", "null"] },
      },
      required: ["type", "days", "label"],
    },
    budgetAmount: { type: ["number", "null"] },
    entities: { type: "array", items: { type: "string" } },
    toolsNeeded: { type: "array", items: { type: "string", enum: allowedTools } },
    reasoning: { type: "string" },
  },
  required: ["intent", "confidence", "timeframe", "budgetAmount", "entities", "toolsNeeded", "reasoning"],
}

function sanitizeText(value: string, maxLength = 600) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function compactString(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function normalizeStringArray(value: unknown, maxItems = 8, maxLength = 80) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => compactString(item, maxLength)).filter(Boolean))).slice(0, maxItems)
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
    for (const piece of content) {
      if (!piece || typeof piece !== "object") continue
      const text = (piece as { text?: unknown }).text
      if (typeof text === "string") parts.push(text)
    }
  }
  return parts.join("\n")
}

function normalizeRoute(value: unknown): OrionSemanticRoute | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const intent = allowedIntents.includes(raw.intent as OrionSemanticRouteIntent)
    ? raw.intent as OrionSemanticRouteIntent
    : null
  const confidence = allowedConfidence.includes(raw.confidence as OrionSemanticRouteConfidence)
    ? raw.confidence as OrionSemanticRouteConfidence
    : null
  if (!intent || !confidence) return null

  const timeframe = raw.timeframe && typeof raw.timeframe === "object"
    ? normalizeTimeframe(raw.timeframe)
    : undefined
  const budgetAmount = typeof raw.budgetAmount === "number" && Number.isFinite(raw.budgetAmount) && raw.budgetAmount > 0
    ? raw.budgetAmount
    : undefined

  return {
    intent,
    confidence,
    timeframe,
    budgetAmount,
    entities: normalizeStringArray(raw.entities, 8, 80),
    toolsNeeded: normalizeStringArray(raw.toolsNeeded, 10, 80).filter((tool): tool is OrionToolName =>
      allowedTools.includes(tool as OrionToolName)
    ),
    reasoning: compactString(raw.reasoning, 220) || "Rota semântica classificada sem cálculo.",
    source: "ai",
  }
}

function normalizeTimeframe(value: object): OrionSemanticRouteTimeframe | undefined {
  const raw = value as Record<string, unknown>
  if (!allowedTimeframeTypes.includes(raw.type as OrionSemanticRouteTimeframe["type"])) return undefined
  const days = typeof raw.days === "number" && Number.isFinite(raw.days) && raw.days > 0 && raw.days <= 3650
    ? raw.days
    : undefined
  const label = compactString(raw.label, 80) || undefined
  return { type: raw.type as OrionSemanticRouteTimeframe["type"], days, label }
}

function routerModel(options?: BuildSemanticRouteOptions) {
  return options?.model
    || process.env.ORION_SEMANTIC_ROUTER_MODEL
    || process.env.ORION_OPENAI_MODEL
    || process.env.OPENAI_MODEL
    || "gpt-5-mini"
}

function emitMeta(options: BuildSemanticRouteOptions | undefined, meta: OrionSemanticRouterMeta) {
  if (meta.source === "local") {
    console.log(`[ORION_SEMANTIC_ROUTER] source=local durationMs=${meta.durationMs} intent=${meta.intent} confidence=${meta.confidence} timeout=${meta.timeout ? "true" : "false"} fallback=${meta.fallback ? "true" : "false"}`)
  } else {
    console.log(`[ORION_SEMANTIC_ROUTER] source=ai model=${meta.model} durationMs=${meta.durationMs} intent=${meta.intent} confidence=${meta.confidence} timeout=${meta.timeout ? "true" : "false"} fallback=${meta.fallback ? "true" : "false"}`)
  }
  options?.onComplete?.(meta)
}

function fallbackRoute(reasoning: string): OrionSemanticRoute {
  return {
    intent: "unknown",
    confidence: "low",
    timeframe: { type: "unknown" },
    entities: [],
    toolsNeeded: [],
    reasoning,
    source: "ai",
  }
}

function tokenize(value: string) {
  const normalized = value.toLowerCase().normalize("NFD")
  const chars = Array.from(normalized).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= 768 && code <= 879) return ""
    if (char >= "a" && char <= "z") return char
    if (char >= "0" && char <= "9") return char
    return " "
  })
  return chars.join("").split(" ").filter(Boolean)
}

function hasAny(tokens: Set<string>, values: string[]) {
  return values.some((value) => tokens.has(value))
}

function localTimeframe(tokens: Set<string>): OrionSemanticRouteTimeframe {
  if (hasAny(tokens, ["hoje", "agora"])) return { type: "today", label: "hoje" }
  if (hasAny(tokens, ["semana", "semanal"])) return { type: "current_week", days: 7, label: "esta semana" }
  if (hasAny(tokens, ["proximos", "proximas", "dias"])) return { type: "next_n_days", days: 7, label: "próximos dias" }
  if (hasAny(tokens, ["mes", "mensal"])) return { type: "current_month", label: "mês atual" }
  return { type: "unknown" }
}

function localTools(intent: OrionSemanticRouteIntent): OrionToolName[] {
  if (intent === "business_review") return ["finance.cashPosition", "sales.performance", "sales.marginByProduct", "inventory.stuckItems", "marketing.campaignPerformance"]
  if (intent === "operational_action") return ["finance.cashPosition", "sales.performance", "inventory.availableStock", "inventory.stuckItems", "leads.funnelHealth", "reinvestment.decision"]
  if (intent === "business_strategy") return ["finance.cashPosition", "sales.performance", "sales.marginByProduct", "inventory.availableStock", "inventory.stuckItems", "marketing.campaignPerformance", "leads.funnelHealth"]
  if (intent === "capital_allocation") return ["finance.cashPosition", "finance.receivables", "finance.payables", "reinvestment.decision", "sales.marginByProduct", "inventory.availableStock"]
  if (intent === "marketing_strategy") return ["marketing.campaignPerformance", "leads.funnelHealth", "inventory.availableStock", "finance.cashPosition"]
  if (intent === "audit_traceability") return ["finance.cashPosition", "finance.receivables", "finance.payables", "reinvestment.decision"]
  if (intent === "decision_memory_review") return []
  return []
}

export function buildLocalSemanticRoute(input: OrionSemanticRouterInput): OrionSemanticRoute | null {
  const tokens = new Set(tokenize(input.userQuestion))
  if (tokens.size === 0) return null

  const hasMoneySignal = hasAny(tokens, ["r", "rs", "real", "reais", "brl", "mil"]) || Array.from(tokens).some((token) => /^\d+$/.test(token))
  const hasBusinessHealth = hasAny(tokens, ["nobretech", "empresa", "negocio", "operacao", "loja"]) && hasAny(tokens, ["bem", "indo", "saude", "saudavel", "situacao", "estado", "performance"])
  const hasOperationalDirection = hasAny(tokens, ["hoje", "agora", "comecar", "começar", "comeco", "primeiro", "priorizar", "foco", "perdido", "movimento", "dia"])
  const hasStrategicDirection = hasAny(tokens, ["visao", "estrategia", "caminho", "rumo", "faria", "lugar", "vendo", "enxergando", "dona", "dono", "proximos", "proximas"])
  const hasCapitalAllocation = hasMoneySignal && hasAny(tokens, ["comprar", "compra", "compraria", "recomprar", "recompra", "alocar", "colocar", "colocaria", "estoque", "capital", "orcamento", "orçamento", "investir", "mexer"])
  const hasMarketing = hasAny(tokens, ["trafego", "campanha", "anuncio", "anuncios", "meta", "ads", "lead", "pago", "midia"])
  const hasAudit = hasAny(tokens, ["calculo", "raciocinio", "porque", "por", "chegou", "teto", "auditoria", "rastreabilidade", "conta"]) && hasAny(tokens, ["reinvestimento", "recompra", "caixa", "teto", "recomendou", "valor"])
  const hasMemory = hasAny(tokens, ["decisao", "decisoes", "pendente", "pendentes", "aberta", "abertas", "acompanhando", "monitorando", "recomendou", "sugeriu", "sugerido"])

  let intent: OrionSemanticRouteIntent | null = null
  if (hasMemory) intent = "decision_memory_review"
  else if (hasAudit) intent = "audit_traceability"
  else if (hasCapitalAllocation) intent = "capital_allocation"
  else if (hasMarketing) intent = "marketing_strategy"
  else if (hasBusinessHealth) intent = "business_review"
  else if (hasOperationalDirection) intent = "operational_action"
  else if (hasStrategicDirection) intent = "business_strategy"

  if (!intent) return null
  return {
    intent,
    confidence: "high",
    timeframe: localTimeframe(tokens),
    entities: hasAny(tokens, ["nobretech"]) ? ["Nobretech"] : [],
    toolsNeeded: localTools(intent),
    reasoning: `Rota local macro por domínio/intenção: ${intent}.`,
    source: "local",
  }
}

export async function buildSemanticRoute(
  input: OrionSemanticRouterInput,
  options?: BuildSemanticRouteOptions
): Promise<OrionSemanticRoute> {
  const started = Date.now()
  const model = routerModel(options)
  const localRoute = buildLocalSemanticRoute(input)
  if (localRoute) {
    emitMeta(options, { source: "local", model: "local", durationMs: Date.now() - started, intent: localRoute.intent, confidence: localRoute.confidence, timeout: false, fallback: false })
    return localRoute
  }
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    const route = fallbackRoute("OPENAI_API_KEY indisponível; fallback determinístico do planner deve assumir.")
    emitMeta(options, { source: "ai", model, durationMs: Date.now() - started, intent: route.intent, confidence: route.confidence, timeout: false, fallback: true })
    return route
  }

  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? (Number(process.env.ORION_SEMANTIC_ROUTER_TIMEOUT_MS) || 2800)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const fetcher = options?.fetcher || fetch
  let timedOut = false

  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: [
          "Você é o roteador semântico da ORION no ERP da Nobretech.",
          "Não responda ao usuário. Não calcule números. Não invente dados.",
          "Escolha intenção pelo significado, não por frase exata.",
          "Perguntas abertas de direção imediata são operational_action.",
          "Perguntas de rumo, visão ou decisão ampla são business_strategy.",
          "Saúde geral da empresa é business_review.",
          "Tráfego/campanha é marketing_strategy.",
          "Use unknown só para fora do escopo da Nobretech/ERP.",
          "Retorne somente JSON estrito.",
        ].join(" "),
        input: JSON.stringify({
          userQuestion: sanitizeText(input.userQuestion),
          currentPage: input.currentPage ? sanitizeText(input.currentPage, 120) : null,
          selectedPeriod: input.selectedPeriod ? sanitizeText(input.selectedPeriod, 80) : null,
          currentDate: input.currentDate || new Date().toISOString().slice(0, 10),
          hasOpenMemory: Boolean(input.hasOpenMemory),
          availableIntents: (input.availableIntents || ORION_SEMANTIC_INTENTS).slice(0, 13),
        }),
        text: {
          format: {
            type: "json_schema",
            name: "orion_semantic_route",
            strict: true,
            schema: routeSchema,
          },
        },
      }),
    })

    if (!response.ok) {
      const route = fallbackRoute(`Router IA HTTP ${response.status}; fallback determinístico do planner deve assumir.`)
      emitMeta(options, { source: "ai", model, durationMs: Date.now() - started, intent: route.intent, confidence: route.confidence, timeout: false, fallback: true })
      return route
    }

    const payload = await response.json().catch(() => null)
    const outputText = extractOutputText(payload)
    const route = outputText ? normalizeRoute(JSON.parse(outputText)) : null
    if (!route) {
      const fallback = fallbackRoute("Router IA retornou JSON inválido; fallback determinístico do planner deve assumir.")
      emitMeta(options, { source: "ai", model, durationMs: Date.now() - started, intent: fallback.intent, confidence: fallback.confidence, timeout: false, fallback: true })
      return fallback
    }
    emitMeta(options, { source: "ai", model, durationMs: Date.now() - started, intent: route.intent, confidence: route.confidence, timeout: false, fallback: false })
    return route
  } catch (error) {
    timedOut = error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message))
    const route = fallbackRoute(timedOut ? "Router IA estourou timeout; fallback determinístico do planner deve assumir." : "Router IA falhou; fallback determinístico do planner deve assumir.")
    emitMeta(options, { source: "ai", model, durationMs: Date.now() - started, intent: route.intent, confidence: route.confidence, timeout: timedOut, fallback: true })
    return route
  } finally {
    clearTimeout(timeout)
  }
}
