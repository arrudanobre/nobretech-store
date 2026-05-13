import {
  isFinancialReinvestmentDecisionRequest,
  isFinancialTraceabilityRequest,
  isFinancialWithdrawalDecisionRequest,
  selectFinancialTraceabilityKind,
} from "./financial-traceability-router"
import type { OrionToolName } from "./orion-tool-registry"

export type OrionSemanticPrimaryGoal =
  | "purchase_capacity"
  | "reinvestment_decision"
  | "withdrawal_decision"
  | "sales_performance_review"
  | "profit_traceability"
  | "inventory_review"
  | "inventory_priority"
  | "lead_review"
  | "campaign_review"
  | "marketing_strategy"
  | "cash_health"
  | "business_review"
  | "business_strategy"
  | "capital_allocation"
  | "decision_memory_review"
  | "operational_action"
  | "audit_traceability"
  | "unknown"

export type OrionSemanticSecondaryGoal =
  | "realized_profit"
  | "receivables"
  | "payables"
  | "inventory_stuck"
  | "reinvestment"
  | "sales_by_product"
  | "margin_by_product"
  | "lead_conversion"
  | "campaign_roi"
  | "cash_health"
  | "recommendations"
  | string

export type OrionSemanticTimeframe = {
  type: "current_period" | "today" | "last_n_days" | "date_range" | "next_n_days" | "all_available" | "unknown"
  days: number | null
  startDate: string | null
  endDate: string | null
  label: string
}

export type OrionSemanticResponseMode =
  | "executive_summary"
  | "audit_traceability"
  | "decision"
  | "comparison"
  | "operational_plan"
  | "memory_review"

export type OrionSemanticEntity = {
  type: "product" | "campaign" | "lead" | "finance" | "inventory" | "decision" | "unknown"
  label: string
}

export type OrionSemanticPlannerMode = "ai_semantic_plan" | "deterministic_fallback"

export type OrionSemanticPlan = {
  primaryGoal: OrionSemanticPrimaryGoal
  secondaryGoals: string[]
  toolsNeeded: OrionToolName[]
  timeframe: OrionSemanticTimeframe
  budgetAmount: number | null
  budgetCurrency: "BRL" | null
  entities: OrionSemanticEntity[]
  comparisonTargets: string[]
  responseMode: OrionSemanticResponseMode
  confidence: "low" | "medium" | "high"
  needsClarification: boolean
  clarificationQuestion: string | null
  reasoningHints: string[]
  plannerMode: OrionSemanticPlannerMode
}

export type OrionSemanticPlannerInput = {
  userQuestion: string
  currentPeriodLabel?: string | null
  hasOpenMemory?: boolean
  currentDate?: string | null
}

type SemanticPlannerFetch = typeof fetch

type BuildSemanticPlanWithAIOptions = {
  apiKey?: string | null
  model?: string
  fetcher?: SemanticPlannerFetch
}

// Centralized tokenizer (reused, not scattered). Same pattern as financial-traceability-router.
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

const allowedPrimaryGoals = [
  "purchase_capacity",
  "reinvestment_decision",
  "withdrawal_decision",
  "sales_performance_review",
  "profit_traceability",
  "inventory_review",
  "inventory_priority",
  "lead_review",
  "campaign_review",
  "marketing_strategy",
  "cash_health",
  "business_review",
  "business_strategy",
  "capital_allocation",
  "decision_memory_review",
  "operational_action",
  "audit_traceability",
  "unknown",
] as const

const allowedResponseModes = [
  "executive_summary",
  "audit_traceability",
  "decision",
  "comparison",
  "operational_plan",
  "memory_review",
] as const

const allowedTimeframeTypes = [
  "current_period",
  "today",
  "last_n_days",
  "date_range",
  "next_n_days",
  "all_available",
  "unknown",
] as const

const allowedEntityTypes = ["product", "campaign", "lead", "finance", "inventory", "decision", "unknown"] as const
const allowedConfidence = ["low", "medium", "high"] as const
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

const semanticEntitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: allowedEntityTypes },
    label: { type: "string" },
  },
  required: ["type", "label"],
}

const semanticPlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    primaryGoal: { type: "string", enum: allowedPrimaryGoals },
    secondaryGoals: { type: "array", items: { type: "string" } },
    toolsNeeded: { type: "array", items: { type: "string", enum: allowedTools } },
    timeframe: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: allowedTimeframeTypes },
        days: { type: ["number", "null"] },
        startDate: { type: ["string", "null"] },
        endDate: { type: ["string", "null"] },
        label: { type: "string" },
      },
      required: ["type", "days", "startDate", "endDate", "label"],
    },
    budgetAmount: { type: ["number", "null"] },
    budgetCurrency: { type: ["string", "null"], enum: ["BRL", null] },
    entities: { type: "array", items: semanticEntitySchema },
    comparisonTargets: { type: "array", items: { type: "string" } },
    responseMode: { type: "string", enum: allowedResponseModes },
    confidence: { type: "string", enum: allowedConfidence },
    needsClarification: { type: "boolean" },
    clarificationQuestion: { type: ["string", "null"] },
    reasoningHints: { type: "array", items: { type: "string" } },
  },
  required: [
    "primaryGoal",
    "secondaryGoals",
    "toolsNeeded",
    "timeframe",
    "budgetAmount",
    "budgetCurrency",
    "entities",
    "comparisonTargets",
    "responseMode",
    "confidence",
    "needsClarification",
    "clarificationQuestion",
    "reasoningHints",
  ],
}

function parseBudgetNumberFromText(value: string) {
  const candidates: number[] = []
  let buffer = ""
  const pushBuffer = () => {
    if (!buffer) return
    const chars = Array.from(buffer)
    const digitCount = chars.filter((char) => char >= "0" && char <= "9").length
    if (digitCount > 0) {
      const digitsOnly = chars.filter((char) => char >= "0" && char <= "9").join("")
      const parsed = Number(digitsOnly)
      if (Number.isFinite(parsed) && parsed > 0) candidates.push(parsed)
    }
    buffer = ""
  }

  for (const char of Array.from(value)) {
    if ((char >= "0" && char <= "9") || char === "." || char === ",") {
      buffer += char
    } else {
      pushBuffer()
    }
  }
  pushBuffer()
  return candidates.find((candidate) => candidate >= 100) ?? null
}

export function parseBudget(message: string): { amount: number | null; currency: "BRL" | null } {
  const tokens = tokenize(message)
  const tokenSet = new Set(tokens)
  const hasCurrency = hasAny(tokenSet, ["r", "rs", "real", "reais", "brl"])
  const hasCapitalContext = hasAny(tokenSet, ["com", "priorizar", "reinvestimento", "comprar", "compro", "compra", "compraria"])

  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] !== "mil") continue
    const parsed = Number(tokens[i - 1])
    if (Number.isFinite(parsed) && parsed > 0) {
      return { amount: parsed * 1000, currency: "BRL" }
    }
  }

  if (!hasCurrency && !hasCapitalContext) return { amount: null, currency: null }
  const amount = parseBudgetNumberFromText(message)
  return { amount, currency: amount !== null ? "BRL" : null }
}

// Single centralized timeframe parser. No scattered regex elsewhere.
export function parseTimeframe(message: string, currentPeriodLabel?: string | null): OrionSemanticTimeframe {
  const tokens = tokenize(message)
  const tokenList = tokens
  const tokenSet = new Set(tokens)

  // Match patterns "ultimos N dias" / "N ultimos dias" / "N dias"
  let days: number | null = null
  for (let i = 0; i < tokenList.length; i++) {
    const t = tokenList[i]
    if (t === "dia" || t === "dias") {
      // look back up to 3 tokens for a number
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const n = Number(tokenList[j])
        if (Number.isFinite(n) && n > 0 && n <= 3650) { days = n; break }
      }
      if (days) break
    }
  }

  if (days !== null && hasAny(tokenSet, ["proximos", "proximas", "proximo", "proxima"])) {
    return { type: "next_n_days", days, startDate: null, endDate: null, label: `próximos ${days} dias` }
  }
  if (days !== null && hasAny(tokenSet, ["ultimos", "ultimas", "ultimo", "ultima", "passados", "passadas"])) {
    return { type: "last_n_days", days, startDate: null, endDate: null, label: `últimos ${days} dias` }
  }
  if (days !== null) {
    return { type: "last_n_days", days, startDate: null, endDate: null, label: `últimos ${days} dias` }
  }

  if (hasAny(tokenSet, ["hoje", "agora"])) {
    return { type: "current_period", days: null, startDate: null, endDate: null, label: currentPeriodLabel || "período atual" }
  }
  if (hasAny(tokenSet, ["mes", "mensal"])) {
    return { type: "current_period", days: null, startDate: null, endDate: null, label: currentPeriodLabel || "mês atual" }
  }
  if (hasAny(tokenSet, ["ano", "anual"])) {
    return { type: "current_period", days: null, startDate: null, endDate: null, label: "ano atual" }
  }
  if (hasAny(tokenSet, ["sempre", "historico", "tudo", "geral", "total"])) {
    return { type: "all_available", days: null, startDate: null, endDate: null, label: "histórico disponível" }
  }
  return { type: "unknown", days: null, startDate: null, endDate: null, label: currentPeriodLabel || "período atual" }
}

const performanceTokens = ["performance", "desempenho", "resultado", "resultados", "analise", "analisar", "review", "geral", "balanco", "balanço", "situacao", "situação", "como", "estou", "estamos"]
const profitTokens = ["lucro", "lucrei", "lucros", "rentabilidade", "margem", "lucratividade"]
const inventoryTokens = ["estoque", "preso", "presos", "parado", "parados", "encalhado", "encalhados", "imobilizado", "produtos"]
const recommendationTokens = ["sugere", "sugerir", "sugestao", "sugestão", "recomenda", "recomendar", "recomendacao", "recomendação", "deveria", "fazer"]
const purchaseTokens = ["comprar", "compro", "compraria", "compra", "comprando", "compras", "estocar", "reabastecer", "abastecer"]
const allocationTokens = ["alocar", "alocaria", "colocar", "colocaria", "investir", "investiria", "mexer", "mover", "aplicar", "aplicaria"]
const cashHealthTokens = ["caixa", "saude", "saúde", "saudavel", "saudável", "liquidez", "financeiro"]
const leadTokens = ["lead", "leads", "follow", "followup", "atendimento", "negociacao", "negociação"]
const campaignTokens = ["campanha", "campanhas", "anuncio", "anuncios", "anúncio", "anúncios", "trafego", "tráfego", "roi"]
const inventoryReviewTokens = ["produto", "produtos", "sku", "skus", "modelo", "modelos", "categoria"]
const strategyTokens = ["estrategia", "estratégia", "plano", "prioridade", "priorizar", "primeiro"]
const lossTokens = ["perdendo", "perder", "perda", "perdas", "dinheiro", "vazando"]
const decisionMemoryNouns = ["decisao", "decisoes", "recomendacao", "recomendacoes", "recomendou", "sugeriu", "sugerido", "sugerida", "sugeridos", "sugeridas", "acao", "acoes"]
const decisionMemoryStateTokens = ["acompanhando", "acompanhamento", "aberta", "abertas", "aberto", "abertos", "monitorando", "pendente", "pendentes", "falta", "faltam", "resolvido", "resolvidos", "ainda", "executei", "executar", "executou", "executado", "executada"]
const decisionMemoryVerbs = ["quais", "que", "mostre", "mostrar", "liste", "listar"]

function collectSecondaryGoals(tokens: Set<string>, primary: OrionSemanticPrimaryGoal): OrionSemanticSecondaryGoal[] {
  const goals = new Set<OrionSemanticSecondaryGoal>()
  if (primary === "decision_memory_review") return []
  if (hasAny(tokens, profitTokens)) goals.add("realized_profit")
  if (hasAny(tokens, inventoryTokens) && (tokens.has("preso") || tokens.has("presos") || tokens.has("parado") || tokens.has("parados") || tokens.has("encalhado") || tokens.has("encalhados") || tokens.has("imobilizado"))) {
    goals.add("inventory_stuck")
  }
  if (hasAny(tokens, recommendationTokens) || primary === "business_review") goals.add("recommendations")
  if (hasAny(tokens, ["margem"])) goals.add("margin_by_product")
  if (hasAny(tokens, ["venda", "vendas", "vendi", "vendendo"]) || primary === "sales_performance_review") goals.add("sales_by_product")
  if (hasAny(tokens, leadTokens)) goals.add("lead_conversion")
  if (hasAny(tokens, campaignTokens)) goals.add("campaign_roi")
  if (hasAny(tokens, cashHealthTokens)) goals.add("cash_health")
  if (primary === "purchase_capacity" || primary === "reinvestment_decision") {
    goals.add("cash_health")
    goals.add("payables")
    goals.add("receivables")
    goals.add("reinvestment")
    goals.add("recommendations")
  }
  if (primary === "capital_allocation") {
    goals.add("reinvestment")
    goals.add("inventory")
    goals.add("recommended_products")
    goals.add("margin_by_product")
    goals.add("cash_health")
    goals.add("recommendations")
  }
  if (primary === "business_strategy") {
    goals.add("cash_health")
    goals.add("sales_by_product")
    goals.add("inventory_stuck")
    goals.add("lead_conversion")
    goals.add("campaign_roi")
    goals.add("recommendations")
  }
  if (primary === "operational_action") {
    goals.add("recommendations")
  }
  return Array.from(goals)
}

function toolsForPlan(primary: OrionSemanticPrimaryGoal, secondaryGoals: OrionSemanticSecondaryGoal[]): OrionToolName[] {
  const tools = new Set<OrionToolName>()
  const add = (names: OrionToolName[]) => names.forEach((name) => tools.add(name))

  if (primary === "purchase_capacity" || primary === "reinvestment_decision") {
    add(["finance.cashPosition", "finance.receivables", "finance.payables", "reinvestment.decision", "sales.marginByProduct", "inventory.availableStock"])
  }
  if (primary === "capital_allocation") {
    add(["finance.cashPosition", "finance.receivables", "finance.payables", "reinvestment.decision", "sales.marginByProduct", "inventory.availableStock"])
  }
  if (primary === "business_strategy") {
    add(["finance.cashPosition", "finance.receivables", "finance.payables", "sales.performance", "sales.marginByProduct", "inventory.availableStock", "inventory.stuckItems", "marketing.campaignPerformance", "leads.funnelHealth", "reinvestment.decision"])
  }
  if (primary === "operational_action") {
    add(["finance.cashPosition", "sales.performance", "sales.marginByProduct", "inventory.availableStock", "inventory.stuckItems", "leads.funnelHealth", "reinvestment.decision"])
  }
  if (primary === "business_review") {
    add(["sales.performance", "sales.marginByProduct", "inventory.stuckItems", "marketing.campaignPerformance", "finance.cashPosition"])
  }
  if (primary === "marketing_strategy" || primary === "campaign_review") {
    add(["marketing.campaignPerformance", "leads.funnelHealth", "inventory.availableStock", "finance.cashPosition"])
  }
  if (primary === "inventory_priority" || primary === "inventory_review") {
    add(["inventory.availableStock", "inventory.stuckItems", "sales.marginByProduct", "reinvestment.decision"])
  }
  if (primary === "cash_health") add(["finance.cashPosition", "finance.receivables", "finance.payables"])
  if (primary === "sales_performance_review") add(["sales.performance", "sales.marginByProduct"])
  if (primary === "lead_review") add(["leads.funnelHealth", "marketing.campaignPerformance"])
  if (primary === "profit_traceability" || primary === "withdrawal_decision") add(["finance.cashPosition", "finance.receivables", "finance.payables"])
  if (primary === "decision_memory_review") return []

  if (secondaryGoals.includes("margin_by_product")) tools.add("sales.marginByProduct")
  if (secondaryGoals.includes("inventory_stuck")) tools.add("inventory.stuckItems")
  if (secondaryGoals.includes("campaign_roi")) tools.add("marketing.campaignPerformance")
  if (secondaryGoals.includes("lead_conversion")) tools.add("leads.funnelHealth")
  if (secondaryGoals.includes("receivables")) tools.add("finance.receivables")
  if (secondaryGoals.includes("payables")) tools.add("finance.payables")
  if (secondaryGoals.includes("reinvestment")) tools.add("reinvestment.decision")

  return Array.from(tools)
}

// Explicit audit verbs — narrower than the broader traceability tokenset.
const explicitAuditTokens = ["abra", "abrir", "detalhe", "detalhar", "detalha", "liste", "listar", "mostre", "mostrar", "estratifique", "estratificar", "extraia", "extrair", "quebre", "quebrar", "explique", "explicar", "calculo", "calculos", "composicao", "compoe", "raciocinio", "logica", "chegou", "porque", "por", "teto", "conta"]
const auditSubjectTokens = ["reinvestimento", "reinvestir", "recompra", "recomprar", "caixa", "lucro", "valor", "teto", "recomendou", "recomendado", "recomendada", "recomendacao"]

function pickPrimaryGoal(message: string): { goal: OrionSemanticPrimaryGoal; mode: OrionSemanticResponseMode } {
  const tokens = new Set(tokenize(message))
  const budget = parseBudget(message)
  const hasBudgetedInventoryAllocation =
    budget.amount !== null &&
    (hasAny(tokens, inventoryTokens) || hasAny(tokens, ["recompra", "reinvestimento"])) &&
    (hasAny(tokens, purchaseTokens) || hasAny(tokens, allocationTokens) || hasAny(tokens, ["onde", "aonde", "qual"]))
  const asksAuditTraceability =
    hasAny(tokens, explicitAuditTokens) &&
    (isFinancialTraceabilityRequest(message) || hasAny(tokens, auditSubjectTokens) || budget.amount !== null)
  const asksDecisionMemory = (
    hasAny(tokens, decisionMemoryNouns) &&
    hasAny(tokens, decisionMemoryStateTokens) &&
    (hasAny(tokens, decisionMemoryVerbs) || hasAny(tokens, ["estao", "ficou", "ficaram", "suas"]))
  ) || (
    hasAny(tokens, ["monitorando", "acompanhando"]) &&
    hasAny(tokens, ["o", "que"])
  ) || (
    hasAny(tokens, ["acompanhamento"]) &&
    hasAny(tokens, ["ficou", "ficaram"])
  ) || (
    hasAny(tokens, ["falta", "faltam"]) &&
    tokens.has("fazer")
  )

  if (asksDecisionMemory) return { goal: "decision_memory_review", mode: "executive_summary" }

  // 1) Explicit audit request ("abra o cálculo do reinvestimento" etc.) is the most specific.
  if (asksAuditTraceability) {
    const kind = selectFinancialTraceabilityKind(message)
    if (kind === "reinvestment_audit" || hasAny(tokens, ["reinvestimento", "reinvestir", "recompra", "recomprar", "teto", "recomendou", "recomendado", "recomendada"])) {
      return { goal: "audit_traceability", mode: "audit_traceability" }
    }
    return { goal: "profit_traceability", mode: "audit_traceability" }
  }

  // 2) Reuse existing decision detectors before compound/heuristic checks.
  if (isFinancialReinvestmentDecisionRequest(message)) return { goal: "reinvestment_decision", mode: "decision" }
  if (isFinancialWithdrawalDecisionRequest(message)) return { goal: "withdrawal_decision", mode: "decision" }

  if (hasBudgetedInventoryAllocation || (budget.amount !== null && (hasAny(tokens, purchaseTokens) || hasAny(tokens, ["priorizar", "reinvestimento", "compro"])))) {
    return { goal: "capital_allocation", mode: "decision" }
  }

  // 3) Purchase capacity ("posso comprar?", "fazer novas compras") routes to same engine as reinvestment.
  if (hasAny(tokens, purchaseTokens) && hasAny(tokens, ["posso", "devo", "agora", "hoje", "seguro"])) {
    return { goal: "purchase_capacity", mode: "decision" }
  }

  // 4) Compound business review: performance + profit/inventory/recs together.
  const hasPerformance = hasAny(tokens, performanceTokens)
  const hasProfit = hasAny(tokens, profitTokens) || tokens.has("lucrei") || tokens.has("lucrou")
  const hasStuckInventory = hasAny(tokens, inventoryTokens) && (tokens.has("preso") || tokens.has("presos") || tokens.has("parado") || tokens.has("parados") || tokens.has("encalhado") || tokens.has("encalhados") || tokens.has("imobilizado"))
  const hasRecommend = hasAny(tokens, recommendationTokens) || tokens.has("sugere") || tokens.has("sugira")
  const hasStrategy = hasAny(tokens, strategyTokens)
  const asksLoss = hasAny(tokens, lossTokens) && hasAny(tokens, ["onde", "aonde", "porque", "por", "que"])
  if (asksLoss) return { goal: "business_review", mode: "executive_summary" }
  if (hasAny(tokens, campaignTokens) && hasAny(tokens, ["vale", "rodar", "agora", "devo"])) return { goal: "business_strategy", mode: "decision" }
  if (hasStrategy || (tokens.has("fazer") && tokens.has("primeiro"))) return { goal: "business_strategy", mode: "operational_plan" }
  const multiIntent = [hasPerformance, hasProfit, hasStuckInventory, hasRecommend].filter(Boolean).length >= 2
  if (multiIntent) return { goal: "business_review", mode: "executive_summary" }

  // 5) Fallback traceability check (still narrower than original).
  if (isFinancialTraceabilityRequest(message)) {
    const kind = selectFinancialTraceabilityKind(message)
    if (kind === "reinvestment_audit") return { goal: "audit_traceability", mode: "audit_traceability" }
    return { goal: "profit_traceability", mode: "audit_traceability" }
  }

  // 6) Single-intent fallbacks (specific topics first, generic "como/análise" last).
  if (hasAny(tokens, leadTokens)) return { goal: "lead_review", mode: "executive_summary" }
  if (hasAny(tokens, campaignTokens)) return { goal: "campaign_review", mode: "executive_summary" }
  if (hasStuckInventory) return { goal: "inventory_review", mode: "executive_summary" }
  if (hasProfit) return { goal: "profit_traceability", mode: "audit_traceability" }
  if (tokens.has("como") && tokens.has("estou")) return { goal: "cash_health", mode: "executive_summary" }
  if (tokens.has("como") && tokens.has("estamos")) return { goal: "cash_health", mode: "executive_summary" }
  if (hasAny(tokens, cashHealthTokens)) return { goal: "cash_health", mode: "executive_summary" }
  if (hasAny(tokens, inventoryReviewTokens)) return { goal: "inventory_review", mode: "executive_summary" }
  if (hasPerformance) return { goal: "sales_performance_review", mode: "executive_summary" }

  return { goal: "unknown", mode: "executive_summary" }
}

export function buildDeterministicSemanticPlan(input: OrionSemanticPlannerInput): OrionSemanticPlan {
  const message = String(input.userQuestion || "").trim()
  if (!message) {
    return {
      primaryGoal: "unknown",
      secondaryGoals: [],
      toolsNeeded: [],
      timeframe: { type: "unknown", days: null, startDate: null, endDate: null, label: input.currentPeriodLabel || "período atual" },
      budgetAmount: null,
      budgetCurrency: null,
      entities: [],
      comparisonTargets: [],
      responseMode: "executive_summary",
      confidence: "low",
      needsClarification: true,
      clarificationQuestion: "Sobre qual aspecto da operação você quer falar?",
      reasoningHints: ["Pergunta vazia ou sem contexto suficiente."],
      plannerMode: "deterministic_fallback",
    }
  }
  const { goal, mode } = pickPrimaryGoal(message)
  const timeframe = parseTimeframe(message, input.currentPeriodLabel)
  const tokens = new Set(tokenize(message))
  const budget = parseBudget(message)
  const secondary = collectSecondaryGoals(tokens, goal)
  const toolsNeeded = toolsForPlan(goal, secondary)
  const confidence: OrionSemanticPlan["confidence"] = goal === "unknown"
    ? "low"
    : secondary.length >= 2 || goal === "business_review" ? "high" : "medium"
  const hints: string[] = []
  if (goal === "business_review") hints.push("Pergunta composta detectada — usar planner multi-intent.")
  if (timeframe.type === "last_n_days") hints.push(`Período relativo detectado: ${timeframe.label}.`)
  if (timeframe.type === "next_n_days") hints.push(`Período futuro detectado: ${timeframe.label}.`)
  if (budget.amount !== null) hints.push(`Orçamento explícito detectado: BRL ${budget.amount}.`)
  if (goal === "audit_traceability") hints.push("Solicitação de auditoria — preservar números brutos.")
  return {
    primaryGoal: goal,
    secondaryGoals: secondary,
    toolsNeeded,
    timeframe,
    budgetAmount: budget.amount,
    budgetCurrency: budget.currency,
    entities: [],
    comparisonTargets: [],
    responseMode: mode,
    confidence,
    needsClarification: false,
    clarificationQuestion: null,
    reasoningHints: hints,
    plannerMode: "deterministic_fallback",
  }
}

function extractPlannerOutputText(payload: unknown): string {
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

function compactString(value: unknown, max = 160) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function isAllowedValue<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

function normalizeStringArray(value: unknown, maxItems = 8, maxLength = 80) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => compactString(item, maxLength)).filter(Boolean))).slice(0, maxItems)
}

function normalizeEntities(value: unknown): OrionSemanticEntity[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const rawType = (item as { type?: unknown }).type
    const label = compactString((item as { label?: unknown }).label, 80)
    if (!label) return []
    return [{
      type: isAllowedValue(rawType, allowedEntityTypes) ? rawType : "unknown",
      label,
    }]
  }).slice(0, 8)
}

function normalizeTimeframe(value: unknown, fallback: OrionSemanticTimeframe): OrionSemanticTimeframe {
  if (!value || typeof value !== "object") return fallback
  const raw = value as Record<string, unknown>
  const type = isAllowedValue(raw.type, allowedTimeframeTypes) ? raw.type : fallback.type
  const days = typeof raw.days === "number" && Number.isFinite(raw.days) && raw.days > 0 && raw.days <= 3650
    ? raw.days
    : null
  const label = compactString(raw.label, 80) || fallback.label
  return {
    type,
    days,
    startDate: typeof raw.startDate === "string" && raw.startDate.trim() ? raw.startDate.trim().slice(0, 20) : null,
    endDate: typeof raw.endDate === "string" && raw.endDate.trim() ? raw.endDate.trim().slice(0, 20) : null,
    label,
  }
}

function normalizeAiPlan(value: unknown, fallback: OrionSemanticPlan): OrionSemanticPlan | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (!isAllowedValue(raw.primaryGoal, allowedPrimaryGoals)) return null
  if (!isAllowedValue(raw.responseMode, allowedResponseModes)) return null
  if (!isAllowedValue(raw.confidence, allowedConfidence)) return null

  const secondaryGoals = normalizeStringArray(raw.secondaryGoals)
  const primaryGoal = raw.primaryGoal
  const tools = normalizeStringArray(raw.toolsNeeded, 12, 64).filter((tool): tool is OrionToolName =>
    allowedTools.includes(tool as OrionToolName)
  )
  const deterministicTools = toolsForPlan(primaryGoal, secondaryGoals)
  const toolsNeeded = primaryGoal === "decision_memory_review"
    ? []
    : Array.from(new Set([...tools, ...deterministicTools]))
  const aiBudgetAmount = typeof raw.budgetAmount === "number" && Number.isFinite(raw.budgetAmount) && raw.budgetAmount > 0
    ? raw.budgetAmount
    : null
  const budgetAmount = fallback.budgetAmount ?? aiBudgetAmount
  const budgetCurrency = budgetAmount !== null ? "BRL" : null
  const needsClarification = typeof raw.needsClarification === "boolean" ? raw.needsClarification : false
  const clarificationQuestion = needsClarification ? compactString(raw.clarificationQuestion, 180) || "Sobre qual parte da operação você quer que eu foque?" : null

  return {
    primaryGoal,
    secondaryGoals,
    toolsNeeded,
    timeframe: normalizeTimeframe(raw.timeframe, fallback.timeframe),
    budgetAmount,
    budgetCurrency,
    entities: normalizeEntities(raw.entities),
    comparisonTargets: normalizeStringArray(raw.comparisonTargets, 6, 80),
    responseMode: raw.responseMode,
    confidence: raw.confidence,
    needsClarification,
    clarificationQuestion,
    reasoningHints: [
      ...normalizeStringArray(raw.reasoningHints, 6, 140),
      "Planner semântico via IA estruturada.",
    ],
    plannerMode: "ai_semantic_plan",
  }
}

function applySemanticPlanGuardrails(aiPlan: OrionSemanticPlan, fallback: OrionSemanticPlan): OrionSemanticPlan {
  if (
    fallback.primaryGoal === "audit_traceability" ||
    (fallback.responseMode === "audit_traceability" && aiPlan.responseMode !== "audit_traceability")
  ) {
    return {
      ...fallback,
      reasoningHints: [...fallback.reasoningHints, "Guardrail determinístico preservou auditoria/traceability."],
      plannerMode: "deterministic_fallback",
    }
  }
  if (fallback.primaryGoal === "capital_allocation" && aiPlan.primaryGoal !== "capital_allocation") {
    return {
      ...fallback,
      reasoningHints: [...fallback.reasoningHints, "Guardrail determinístico preservou alocação natural de capital."],
      plannerMode: "deterministic_fallback",
    }
  }
  if (fallback.primaryGoal === "profit_traceability" && aiPlan.primaryGoal !== "profit_traceability") {
    return {
      ...fallback,
      reasoningHints: [...fallback.reasoningHints, "Guardrail determinístico preservou rastreabilidade financeira."],
      plannerMode: "deterministic_fallback",
    }
  }
  if (fallback.primaryGoal === "withdrawal_decision" && aiPlan.primaryGoal !== "withdrawal_decision") {
    return {
      ...fallback,
      reasoningHints: [...fallback.reasoningHints, "Guardrail determinístico preservou decisão de retirada."],
      plannerMode: "deterministic_fallback",
    }
  }
  return aiPlan
}

async function runAiSemanticPlanner(
  input: OrionSemanticPlannerInput,
  fallback: OrionSemanticPlan,
  options?: BuildSemanticPlanWithAIOptions
): Promise<OrionSemanticPlan | null> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const fetcher = options?.fetcher || fetch
  const model = options?.model || process.env.ORION_SEMANTIC_PLANNER_MODEL || process.env.ORION_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
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
        "Você é o planejador semântico da ORION, copiloto executivo da Nobretech.",
        "Transforme a pergunta do usuário em um plano JSON estruturado.",
        "Você NÃO calcula números financeiros.",
        "Você NÃO inventa caixa, lucro, margem, vendas, estoque, recebíveis ou métricas.",
        "Você NÃO responde ao usuário final.",
        "Identifique objetivo principal, objetivos secundários, período, orçamento informado, entidades citadas, ferramentas necessárias, modo de resposta e necessidade de esclarecimento.",
        "Use decision_memory_review quando o usuário quiser revisar decisões abertas, recomendações pendentes, ações em acompanhamento, decisões anteriores, o que a ORION monitora, o que ficou pendente ou recomendações que a ORION fez.",
        "Use capital_allocation quando o usuário trouxer orçamento aproximado e perguntar onde colocar, aplicar, mexer ou priorizar dinheiro em estoque, recompra ou produtos.",
        "Use audit_traceability quando o usuário pedir raciocínio, lógica, cálculo, por que chegou no valor, por que recomendou um teto ou abertura da conta de reinvestimento, recompra, caixa ou lucro.",
        "Use operational_action quando o usuário pedir execução imediata do que fazer agora, sem pedir revisão de memória decisória.",
        "Os dados reais serão calculados por engines determinísticas do sistema.",
      ].join(" "),
      input: JSON.stringify({
        userQuestion: input.userQuestion,
        currentPeriodLabel: input.currentPeriodLabel || null,
        hasOpenMemory: Boolean(input.hasOpenMemory),
        currentDate: input.currentDate || new Date().toISOString().slice(0, 10),
        deterministicFallback: {
          primaryGoal: fallback.primaryGoal,
          responseMode: fallback.responseMode,
          timeframe: fallback.timeframe,
          budgetAmount: fallback.budgetAmount,
        },
      }),
      text: {
        format: {
          type: "json_schema",
          name: "orion_semantic_plan",
          strict: true,
          schema: semanticPlanSchema,
        },
      },
    }),
  }).finally(() => clearTimeout(timeout))

  const payload = await response.json().catch(() => null)
  if (!response.ok) return null
  const outputText = extractPlannerOutputText(payload)
  if (!outputText) return null
  return normalizeAiPlan(JSON.parse(outputText), fallback)
}

// Sync public entry point: deterministic fallback, safe for tests/clientless helpers.
export function buildSemanticPlan(input: OrionSemanticPlannerInput): OrionSemanticPlan {
  return buildDeterministicSemanticPlan(input)
}

export async function buildSemanticPlanWithAI(
  input: OrionSemanticPlannerInput,
  options?: BuildSemanticPlanWithAIOptions
): Promise<OrionSemanticPlan> {
  const fallback = buildDeterministicSemanticPlan(input)
  try {
    const aiPlan = await runAiSemanticPlanner(input, fallback, options)
    if (aiPlan && (aiPlan.confidence === "medium" || aiPlan.confidence === "high" || aiPlan.needsClarification)) {
      return applySemanticPlanGuardrails(aiPlan, fallback)
    }
    return {
      ...fallback,
      reasoningHints: [...fallback.reasoningHints, "Planner IA indisponível ou confiança baixa; usando fallback determinístico."],
      plannerMode: "deterministic_fallback",
    }
  } catch {
    return {
      ...fallback,
      reasoningHints: [...fallback.reasoningHints, "Planner IA falhou; usando fallback determinístico."],
      plannerMode: "deterministic_fallback",
    }
  }
}
