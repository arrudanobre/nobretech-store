import type { OrionBusinessDecision } from "./business-decision-orchestrator"
import type { ReinvestmentDecision } from "./reinvestment-intelligence-engine"
import type { OrionSemanticPlan } from "./semantic-planner"
import type {
  OrionDecisionMemoryReview,
  OrionResponsePayload,
} from "./orion-response-orchestrator"

export type OrionExecutiveConversationStance =
  | "direct"
  | "cautious"
  | "critical"
  | "opportunity"
  | "diagnostic"
  | "audit"

export type OrionExecutiveConversation = {
  responseKind: "executive_conversation"
  conversationalAnswer: string
  stance: OrionExecutiveConversationStance
  mainRecommendation: string | null
  nextActions: string[]
  followUpQuestion: string | null
  evidenceMode: "cards_below" | "audit_below" | "minimal"
  usedFacts: string[]
  fallbackApplied: boolean
}

export type OrionExecutiveConversationAllowedFacts = {
  money: string[]
  counts: string[]
  percentages: string[]
  dates: string[]
  productNames: string[]
  statuses: string[]
}

export type BuildExecutiveConversationInput = {
  userQuestion: string
  semanticPlan: OrionSemanticPlan
  structuredResponse: OrionResponsePayload
  businessDecision?: OrionBusinessDecision | null
  reinvestmentDecision?: ReinvestmentDecision | null
  decisionMemoryReview?: OrionDecisionMemoryReview | null
  caveats?: string[]
  allowedFacts: OrionExecutiveConversationAllowedFacts
  apiKey?: string | null
  model?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export type OrionCompactConversationBrief = {
  userQuestion: string
  primaryGoal: OrionSemanticPlan["primaryGoal"]
  timeframeLabel: string
  decisionTitle: string | null
  recommendation: string | null
  mainProduct: string | null
  alternativeProduct: string | null
  avoidItem: string | null
  mainRisk: string | null
  nextActions: string[]
  caveats: string[]
  allowedFacts: OrionExecutiveConversationAllowedFacts
}

const CONVERSATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    conversationalAnswer: { type: "string" },
    stance: { type: "string", enum: ["direct", "cautious", "critical", "opportunity", "diagnostic", "audit"] },
    mainRecommendation: { type: ["string", "null"] },
    nextActions: { type: "array", items: { type: "string" } },
    followUpQuestion: { type: ["string", "null"] },
    usedFacts: { type: "array", items: { type: "string" } },
  },
  required: [
    "conversationalAnswer",
    "stance",
    "mainRecommendation",
    "nextActions",
    "followUpQuestion",
    "usedFacts",
  ],
}

const SYSTEM_INSTRUCTIONS = [
  "Você é a ORION, conselheira executiva da Nobretech, conversando com Vinícius dentro do ERP.",
  "Responda como parceira de negócio, em texto natural — não como dashboard, relatório técnico nem card.",
  "Seja direta, crítica quando preciso, aponte riscos e oportunidades. Não concorde automaticamente.",
  "Você NÃO calcula números, não inventa dados e não escreve cards. Use apenas o brief compacto e allowedFacts.",
  "Se citar valor monetário, percentual, data, contagem, produto ou status, ele PRECISA estar em allowedFacts.",
  "Se o dado necessário não estiver disponível, diga isso explicitamente em vez de inventar.",
  "Não comece com etiquetas como 'DECISÃO', 'EVIDÊNCIAS', 'ANÁLISE', 'RECOMENDAÇÃO'.",
  "Formato: 2 a 5 parágrafos curtos. Sem markdown pesado, sem listas longas (apenas próximos passos curtos quando útil).",
  "Limite: 900 caracteres em respostas comuns; 1300 em análises mais complexas (audit/business_review).",
  "Retorne somente JSON estrito no schema solicitado, sem texto fora do JSON.",
].join(" ")

const PRODUCT_MENTION_PATTERN = /\b(iPad(?:\s*\([^)]+\))?|iPhone(?:\s+\d{1,2})?(?:\s+Pro Max|\s+Pro|\s+Plus)?|MacBook(?:\s+(?:Air|Pro))?|Apple Watch(?:\s+Ultra)?|Apple Pencil|AirPods(?:\s+Pro|\s+Max)?)\b/i

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
      const text = (piece as { text?: unknown }).text
      if (typeof text === "string") parts.push(text)
    }
  }
  return parts.join("\n")
}

function evidenceModeFor(plan: OrionSemanticPlan): OrionExecutiveConversation["evidenceMode"] {
  if (plan.primaryGoal === "audit_traceability" || plan.responseMode === "audit_traceability") return "audit_below"
  if (plan.primaryGoal === "decision_memory_review") return "cards_below"
  return "cards_below"
}

// Tokens up to 3 chars are allowed implicitly (ordinals, common counts).
const NUMERIC_PATTERN = /(R\$\s*\d[\d.,]*|\b\d{2,}(?:[.,]\d+)?\b|\b\d+%|\b\d+\s*(mil|milhões|milhão|k)\b)/gi

function normalizeFact(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
}

function buildFactIndex(allowed: OrionExecutiveConversationAllowedFacts): Set<string> {
  const set = new Set<string>()
  for (const list of [allowed.money, allowed.counts, allowed.percentages, allowed.dates, allowed.productNames, allowed.statuses]) {
    for (const item of list) {
      if (item) set.add(normalizeFact(item))
    }
  }
  return set
}

function containsAsSubstring(facts: Set<string>, value: string): boolean {
  const normalized = normalizeFact(value)
  if (!normalized) return false
  for (const fact of facts) {
    if (!fact) continue
    if (fact === normalized) return true
    if (fact.includes(normalized)) return true
    if (normalized.includes(fact)) return true
  }
  return false
}

export function validateConversationFacts(
  text: string,
  allowed: OrionExecutiveConversationAllowedFacts
): { ok: boolean; violations: string[] } {
  const facts = buildFactIndex(allowed)
  const violations: string[] = []
  const matches = text.match(NUMERIC_PATTERN) || []
  for (const match of matches) {
    const trimmed = match.trim()
    if (!trimmed) continue
    if (/^\d{1,3}$/.test(trimmed.replace(/\D/g, "")) && !/[R$%]|mil|milh/i.test(trimmed)) continue
    if (!containsAsSubstring(facts, trimmed)) {
      violations.push(trimmed)
    }
  }
  return { ok: violations.length === 0, violations }
}

function fallbackFromStructured(input: BuildExecutiveConversationInput): OrionExecutiveConversation {
  const decision = input.businessDecision
  const memory = input.decisionMemoryReview
  const audit = input.semanticPlan.primaryGoal === "audit_traceability"
    || input.semanticPlan.responseMode === "audit_traceability"
  const isOperationalAction = input.semanticPlan.primaryGoal === "operational_action"
    || input.semanticPlan.responseMode === "operational_plan"

  const recommendation = decision?.recommendation?.title
    || input.reinvestmentDecision?.recommendedAction
    || null
  const nextActions = (decision?.nextSteps || []).slice(0, 3).map((step) => step.action)
  const anchorProduct = findDecisionValue(decision, /melhor sinal|produto priorit|produto ancora|produto âncora/i)
    || input.reinvestmentDecision?.recommendedProducts[0]?.label
    || findProductMention(decision)
    || null
  const alternativeProduct = decision?.alternatives.find((item) => item.title && item.title !== anchorProduct && looksLikeProduct(item.title))?.title || null
  const avoidProduct = decision?.avoid.find((item) => item.title && !/teto|limite|tr[aá]fego|campanha|caixa/i.test(item.title))?.title || null
  const primaryStep = nextActions[0] || decision?.recommendation?.title || input.reinvestmentDecision?.recommendedAction || ""
  const safeCapMention = hasDecisionText(decision, /teto seguro|capital seguro|limite/i)
  const grossCashMention = hasDecisionText(decision, /caixa bruto/i) || (input.caveats || []).some((item) => /caixa bruto/i.test(item))

  const product = anchorProduct || "produto âncora"
  const asksMarketing = input.semanticPlan.primaryGoal === "marketing_strategy"
    || input.semanticPlan.secondaryGoals.includes("marketing_strategy")
    || /\b(tr[aá]fego|campanha|an[uú]ncio|m[ií]dia|lead)\b/i.test(input.userQuestion)
  const alternativeClause = alternativeProduct
    ? `, enquanto ${alternativeProduct} entra como alternativa de cautela, não como prioridade.`
    : ". A alternativa só deveria entrar se o custo do produto principal não couber."
  const capGuard = safeCapMention || grossCashMention
    ? "não trate o caixa bruto como dinheiro livre."
    : "não use caixa como licença para comprar sem margem de segurança."

  let conversational = ""
  let stance: OrionExecutiveConversationStance = "direct"

  if (audit) {
    conversational = [
      "Aqui está a rastreabilidade da recompra.",
      "Eu separei caixa, reserva, teto e produtos para você enxergar de onde saiu a recomendação. Aqui o foco não é uma nova opinião, é transparência do cálculo.",
    ].join("\n\n")
    stance = "audit"
  } else if (memory && memory.openDecisions.length > 0) {
    const primary = memory.openDecisions[0]
    conversational = [
      "Você tem decisões abertas que ainda pedem execução.",
      `A principal é estratégica: ${lowerFirst(primary.title)}. A ação imediata é ${stripFinalPunctuation(lowerFirst(primary.recommendation))} antes de pensar em tráfego.`,
    ].join("\n\n")
    stance = "diagnostic"
  } else if (memory) {
    conversational = "Você não tem decisão aberta pedindo ação agora. Eu manteria o foco no que já foi consolidado e só abriria nova frente com evidência nova."
    stance = "diagnostic"
  } else if (decision?.decisionType === "capital_allocation") {
    const avoid = avoidProduct ? ` Eu deixaria ${avoidProduct} fora do capital principal agora.` : ""
    conversational = [
      "Vinícius, eu não espalharia esse capital agora.",
      `Eu concentraria no ${product}, mas com teto. Ele aparece como o melhor sinal comercial no contexto atual${alternativeClause}${avoid}`,
      `Minha direção prática: peça cotação do ${product}, compare com o teto seguro e ${capGuard}`,
    ].join("\n\n")
    stance = "direct"
  } else if (decision?.decisionType === "marketing_strategy" && asksMarketing) {
    conversational = [
      "Eu só rodaria tráfego como teste curto.",
      `Existe sinal histórico para ${product}, mas sem lead ativo agora o risco é gerar barulho em vez de venda. Tráfego só faz sentido com produto, oferta e atendimento prontos.`,
    ].join("\n\n")
    stance = "cautious"
  } else if (decision && isOperationalAction) {
    conversational = [
      "Hoje eu não abriria várias frentes.",
      `A primeira ação é cotar o ${product} e validar se o custo cabe no teto seguro. Sem isso, tráfego e oferta ainda são chute.`,
    ].join("\n\n")
    stance = "direct"
  } else if (decision && (decision.decisionType === "business_strategy" || input.semanticPlan.primaryGoal === "business_strategy")) {
    conversational = [
      "Esta semana não é sobre abrir mais frentes. É sobre sequência.",
      `Primeiro viabilize o ${product} como produto âncora. Depois monte uma oferta objetiva. Só então faz sentido testar tráfego curto.`,
      "Se inverter essa ordem, você pode gerar lead antes de ter conversão preparada.",
    ].join("\n\n")
    stance = "critical"
  } else if (decision && (decision.decisionType === "generic_business_review" || input.semanticPlan.primaryGoal === "business_review")) {
    const salesSignal = findDecisionValue(decision, /vendas|performance/i)
    const cashSignal = findDecisionValue(decision, /caixa/i)
    const mixSignal = findDecisionValue(decision, /baixo impacto|margem|produto|mix/i)
    const stockSignal = findDecisionValue(decision, /estoque/i)
    const caveat = decision.caveats[0] || "a leitura ainda fica incompleta sem DRE, despesas e descontos fechados."
    const healthSignal = salesSignal && !/sem|0/.test(salesSignal)
      ? `Você tem sinal comercial: ${lowerFirst(salesSignal)} no período analisado.`
      : "Existe algum sinal operacional, mas eu não chamaria isso de estabilidade ainda."
    const attention = [
      cashSignal ? `caixa (${cashSignal})` : "caixa",
      mixSignal ? `mix (${mixSignal})` : "mix",
      stockSignal && !/sem item|sem estoque/i.test(stockSignal) ? `estoque (${stockSignal})` : null,
    ].filter(Boolean).join(", ")
    conversational = [
      "Vinícius, a Nobretech tem sinal de movimento, mas eu não chamaria isso de estabilidade ainda.",
      `${healthSignal} A ressalva é importante: ${lowerFirst(stripFinalPunctuation(caveat))}. O ponto de atenção agora é proteger ${attention || "caixa e mix"} antes de acelerar compra ou tráfego.`,
      "Minha direção: revisar o mix, confirmar o produto âncora e só ampliar campanha depois de validar margem e conversão.",
    ].join("\n\n")
    stance = "diagnostic"
  } else if (decision) {
    conversational = [
      "Vinícius, minha leitura principal é agir com foco, sem transformar o diagnóstico em várias frentes ao mesmo tempo.",
      primaryStep
        ? `Eu começaria por ${stripFinalPunctuation(lowerFirst(primaryStep))} e usaria os cards abaixo só como evidência do caminho.`
        : "Eu usaria os cards abaixo como evidência e manteria a decisão no menor próximo passo executável.",
    ].join("\n\n")
    stance = "direct"
  } else {
    conversational = "Vinícius, a leitura está pronta nos blocos de evidência abaixo. Eu usaria isso como apoio, não como uma nova decisão automática."
    stance = "direct"
  }

  return {
    responseKind: "executive_conversation",
    conversationalAnswer: conversational.slice(0, 1300),
    stance,
    mainRecommendation: recommendation,
    nextActions,
    followUpQuestion: null,
    evidenceMode: evidenceModeFor(input.semanticPlan),
    usedFacts: [],
    fallbackApplied: true,
  }
}

function lowerFirst(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`
}

function stripFinalPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, "")
}

function looksLikeProduct(value: string): boolean {
  return PRODUCT_MENTION_PATTERN.test(value)
}

function findProductMention(decision: OrionBusinessDecision | null | undefined): string | null {
  if (!decision) return null
  const parts = [
    decision.recommendation.action,
    decision.recommendation.reason,
    ...decision.nextSteps.map((item) => item.action),
    ...decision.keyFindings.flatMap((item) => [item.value || "", item.evidence]),
    ...decision.alternatives.map((item) => item.title),
  ]
  for (const part of parts) {
    const match = part.match(PRODUCT_MENTION_PATTERN)
    if (match?.[0]) return match[0].trim()
  }
  return null
}

function findDecisionValue(
  decision: OrionBusinessDecision | null | undefined,
  labelPattern: RegExp
): string | null {
  if (!decision) return null
  const finding = decision.keyFindings.find((item) => labelPattern.test(item.label))
  return finding?.value || null
}

function hasDecisionText(
  decision: OrionBusinessDecision | null | undefined,
  pattern: RegExp
): boolean {
  if (!decision) return false
  const parts = [
    decision.recommendation.title,
    decision.recommendation.action,
    decision.recommendation.reason,
    ...decision.keyFindings.flatMap((item) => [item.label, item.value || "", item.evidence]),
    ...decision.alternatives.flatMap((item) => [item.title, item.tradeoff]),
    ...decision.avoid.flatMap((item) => [item.title, item.reason]),
    ...decision.nextSteps.map((item) => item.action),
    ...decision.caveats,
  ]
  return parts.some((item) => pattern.test(item))
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined) return defaultValue
  if (/^(0|false|no|off)$/i.test(raw.trim())) return false
  if (/^(1|true|yes|on)$/i.test(raw.trim())) return true
  return defaultValue
}

function compactString(value: unknown, max = 400): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function compactFacts(
  allowed: OrionExecutiveConversationAllowedFacts,
  decision: OrionBusinessDecision | null | undefined
): OrionExecutiveConversationAllowedFacts {
  const decisionText = decision
    ? [
        decision.recommendation.title,
        decision.recommendation.action,
        decision.recommendation.reason,
        ...decision.keyFindings.flatMap((item) => [item.label, item.value || "", item.evidence]),
        ...decision.alternatives.flatMap((item) => [item.title, item.tradeoff]),
        ...decision.avoid.flatMap((item) => [item.title, item.reason]),
        ...decision.nextSteps.map((item) => item.action),
      ].join(" ")
    : ""
  const prioritizedProducts = allowed.productNames.filter((item) => decisionText.includes(item)).slice(0, 8)
  return {
    money: allowed.money.slice(0, 8),
    counts: allowed.counts.slice(0, 6),
    percentages: allowed.percentages.slice(0, 6),
    dates: allowed.dates.slice(0, 4),
    productNames: (prioritizedProducts.length ? prioritizedProducts : allowed.productNames).slice(0, 8),
    statuses: allowed.statuses.slice(0, 6),
  }
}

export function buildCompactConversationBrief(input: BuildExecutiveConversationInput): OrionCompactConversationBrief {
  const decision = input.businessDecision
  const memory = input.decisionMemoryReview
  const mainProduct = findDecisionValue(decision, /melhor sinal|produto priorit|produto ancora|produto âncora/i)
    || input.reinvestmentDecision?.recommendedProducts[0]?.label
    || findProductMention(decision)
    || null
  const alternativeProduct = decision?.alternatives.find((item) => item.title && item.title !== mainProduct && looksLikeProduct(item.title))?.title || null
  const avoidItem = decision?.avoid.find((item) => item.title)?.title || null
  const mainRisk = decision?.keyFindings.find((item) => item.severity === "critical" || item.severity === "attention")?.evidence
    || decision?.avoid[0]?.reason
    || decision?.caveats[0]
    || input.caveats?.[0]
    || null
  const memoryRecommendation = memory?.openDecisions[0]?.recommendation || null
  return {
    userQuestion: compactString(input.userQuestion, 220),
    primaryGoal: input.semanticPlan.primaryGoal,
    timeframeLabel: input.semanticPlan.timeframe.label,
    decisionTitle: compactString(decision?.recommendation?.title || memory?.openDecisions[0]?.title || null, 120) || null,
    recommendation: compactString(decision?.recommendation?.action || input.reinvestmentDecision?.recommendedAction || memoryRecommendation, 220) || null,
    mainProduct,
    alternativeProduct,
    avoidItem,
    mainRisk: compactString(mainRisk, 180) || null,
    nextActions: (decision?.nextSteps || []).slice(0, 3).map((step) => compactString(step.action, 160)).filter(Boolean),
    caveats: [...(decision?.caveats || []), ...(input.caveats || [])].slice(0, 2).map((item) => compactString(item, 160)).filter(Boolean),
    allowedFacts: compactFacts(input.allowedFacts, decision),
  }
}

function logConversationAttempt(input: {
  model: string
  briefChars: number
  promptChars: number
  result: "success" | "fallback"
  reason: string
}) {
  console.log(`[ORION_CONVERSATION] model=${input.model} briefChars=${input.briefChars} promptChars=${input.promptChars} result=${input.result} reason=${input.reason}`)
}

function fallbackWithLog(
  input: BuildExecutiveConversationInput,
  meta: { model: string; briefChars: number; promptChars: number; reason: string }
): OrionExecutiveConversation {
  console.warn(`[ORION_CONVERSATION_FALLBACK] ${meta.reason}`)
  logConversationAttempt({ ...meta, result: "fallback" })
  return fallbackFromStructured(input)
}

async function runConversationModel(input: BuildExecutiveConversationInput): Promise<OrionExecutiveConversation> {
  const model = input.model || process.env.ORION_CONVERSATION_MODEL || process.env.ORION_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini"
  const brief = buildCompactConversationBrief(input)
  const modelInput = {
    userQuestion: brief.userQuestion,
    primaryGoal: brief.primaryGoal,
    timeframeLabel: brief.timeframeLabel,
    decisionTitle: brief.decisionTitle,
    recommendation: brief.recommendation,
    mainProduct: brief.mainProduct,
    alternativeProduct: brief.alternativeProduct,
    avoidItem: brief.avoidItem,
    mainRisk: brief.mainRisk,
    nextActions: brief.nextActions,
    caveats: brief.caveats,
    allowedFacts: brief.allowedFacts,
  }
  const inputText = JSON.stringify(modelInput)
  const briefChars = inputText.length
  const promptChars = SYSTEM_INSTRUCTIONS.length + briefChars

  if (!envFlag("ORION_CONVERSATION_ENABLED", true)) return fallbackWithLog(input, { model, briefChars, promptChars, reason: "disabled" })
  if (envFlag("ORION_CONVERSATION_FALLBACK_FIRST", false)) return fallbackWithLog(input, { model, briefChars, promptChars, reason: "fallback_first" })
  if (
    envFlag("ORION_CONVERSATION_SKIP_ON_LOCAL_ROUTE", false)
    && input.semanticPlan.plannerMode === "local_semantic_route"
  ) return fallbackWithLog(input, { model, briefChars, promptChars, reason: "skip_on_local_route" })

  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) return fallbackWithLog(input, { model, briefChars, promptChars, reason: "missing_api_key" })
  const fetcher = input.fetcher || fetch
  const timeoutMs = input.timeoutMs ?? (Number(process.env.ORION_CONVERSATION_TIMEOUT_MS) || 4000)

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
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
        instructions: SYSTEM_INSTRUCTIONS,
        input: inputText,
        text: {
          format: {
            type: "json_schema",
            name: "orion_executive_conversation",
            strict: true,
            schema: CONVERSATION_RESPONSE_SCHEMA,
          },
        },
      }),
    })

    if (!response.ok) {
      return fallbackWithLog(input, { model, briefChars, promptChars, reason: `http_${response.status}` })
    }
    const payload = await response.json().catch(() => null)
    const outputText = extractOutputText(payload)
    if (!outputText) {
      return fallbackWithLog(input, { model, briefChars, promptChars, reason: "empty_output" })
    }
    let parsed: {
      conversationalAnswer?: unknown
      stance?: unknown
      mainRecommendation?: unknown
      nextActions?: unknown
      followUpQuestion?: unknown
      usedFacts?: unknown
    }
    try {
      parsed = JSON.parse(outputText)
    } catch {
      return fallbackWithLog(input, { model, briefChars, promptChars, reason: "invalid_json" })
    }

    const text = typeof parsed.conversationalAnswer === "string" ? parsed.conversationalAnswer.trim() : ""
    if (!text || text.length < 30) {
      return fallbackWithLog(input, { model, briefChars, promptChars, reason: "too_short" })
    }
    if (/^(DECIS[ÃA]O|EVID[ÊE]NCIAS|AN[ÁA]LISE|RECOMENDA[ÇC][ÃA]O)\b/i.test(text)) {
      return fallbackWithLog(input, { model, briefChars, promptChars, reason: "generic_opener" })
    }

    const validation = validateConversationFacts(text, brief.allowedFacts)
    if (!validation.ok) {
      return fallbackWithLog(input, { model, briefChars, promptChars, reason: `disallowed_facts=${validation.violations.slice(0, 5).join(",")}` })
    }

    const stance = (typeof parsed.stance === "string" && ["direct", "cautious", "critical", "opportunity", "diagnostic", "audit"].includes(parsed.stance))
      ? parsed.stance as OrionExecutiveConversationStance
      : "direct"

    const result: OrionExecutiveConversation = {
      responseKind: "executive_conversation",
      conversationalAnswer: text.slice(0, 1300),
      stance,
      mainRecommendation: typeof parsed.mainRecommendation === "string" ? parsed.mainRecommendation.slice(0, 240) : null,
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions.filter((a): a is string => typeof a === "string").slice(0, 5).map((s) => s.slice(0, 200))
        : [],
      followUpQuestion: typeof parsed.followUpQuestion === "string" ? parsed.followUpQuestion.slice(0, 240) : null,
      evidenceMode: evidenceModeFor(input.semanticPlan),
      usedFacts: Array.isArray(parsed.usedFacts)
        ? parsed.usedFacts.filter((f): f is string => typeof f === "string").slice(0, 12)
        : [],
      fallbackApplied: false,
    }
    logConversationAttempt({ model, briefChars, promptChars, result: "success", reason: "ok" })
    return result
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message))
    return fallbackWithLog(input, { model, briefChars, promptChars, reason: aborted ? "timeout" : "error" })
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export async function buildExecutiveConversation(
  input: BuildExecutiveConversationInput
): Promise<OrionExecutiveConversation> {
  return runConversationModel(input)
}

// Builds the allowedFacts whitelist from the structured response so the guardrail only accepts facts
// the engines actually produced. Numbers and labels not in this set are rejected from the LLM output.
export function buildAllowedFactsFromStructured(
  structured: OrionResponsePayload | null | undefined,
  extras?: Partial<OrionExecutiveConversationAllowedFacts>
): OrionExecutiveConversationAllowedFacts {
  const money: string[] = []
  const counts: string[] = []
  const percentages: string[] = []
  const dates: string[] = []
  const productNames: string[] = []
  const statuses: string[] = []

  const decision = structured?.structured?.businessDecision
  const reinvestment = structured?.structured?.reinvestmentDecision
  const memory = structured?.structured?.decisionMemoryReview

  const pushNumbers = (value: string | null | undefined) => {
    if (!value) return
    const matches = value.match(NUMERIC_PATTERN) || []
    for (const m of matches) {
      const trimmed = m.trim()
      if (!trimmed) continue
      if (/R\$/i.test(trimmed) || /(mil|milh|k$)/i.test(trimmed)) money.push(trimmed)
      else if (/%/.test(trimmed)) percentages.push(trimmed)
      else counts.push(trimmed)
    }
  }

  if (decision) {
    pushNumbers(decision.recommendation?.action)
    pushNumbers(decision.recommendation?.reason)
    decision.keyFindings?.forEach((f) => {
      if (f.label) productNames.push(f.label)
      if (f.value) productNames.push(f.value)
      pushNumbers(f.evidence)
    })
    decision.alternatives?.forEach((a) => { if (a.title) productNames.push(a.title); pushNumbers(a.tradeoff) })
    decision.avoid?.forEach((a) => { if (a.title) productNames.push(a.title); pushNumbers(a.reason) })
    decision.nextSteps?.forEach((s) => pushNumbers(s.action))
  }
  if (reinvestment) {
    pushNumbers(reinvestment.recommendedAction)
    reinvestment.recommendedProducts.forEach((p) => {
      if (p.label) productNames.push(p.label)
      if (p.model) productNames.push(p.model)
      if (p.productType) productNames.push(p.productType)
      if (p.probableUnitCost !== null && p.probableUnitCost !== undefined) money.push(String(p.probableUnitCost))
    })
    if (reinvestment.analysisWindow?.label) dates.push(reinvestment.analysisWindow.label)
    money.push(String(reinvestment.safeReinvestmentCap))
    money.push(String(reinvestment.recommendedReinvestmentAmount))
    money.push(String(reinvestment.preserveCashAmount))
    money.push(String(reinvestment.currentCash))
  }
  if (memory) {
    counts.push(String(memory.openDecisions.length))
    memory.openDecisions.forEach((d) => {
      if (d.title) productNames.push(d.title)
      statuses.push(d.status)
      statuses.push(d.priority)
    })
  }
  if (extras?.money) money.push(...extras.money)
  if (extras?.counts) counts.push(...extras.counts)
  if (extras?.percentages) percentages.push(...extras.percentages)
  if (extras?.dates) dates.push(...extras.dates)
  if (extras?.productNames) productNames.push(...extras.productNames)
  if (extras?.statuses) statuses.push(...extras.statuses)

  return {
    money: Array.from(new Set(money)).slice(0, 40),
    counts: Array.from(new Set(counts)).slice(0, 40),
    percentages: Array.from(new Set(percentages)).slice(0, 30),
    dates: Array.from(new Set(dates)).slice(0, 30),
    productNames: Array.from(new Set(productNames)).slice(0, 60),
    statuses: Array.from(new Set(statuses)).slice(0, 30),
  }
}
