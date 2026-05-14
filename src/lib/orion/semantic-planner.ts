import {
  isFinancialReinvestmentDecisionRequest,
  isFinancialTraceabilityRequest,
  isFinancialWithdrawalDecisionRequest,
  selectFinancialTraceabilityKind,
} from "./financial-traceability-router"
import {
  buildSemanticRoute,
  ORION_SEMANTIC_INTENTS,
  type OrionSemanticRoute,
  type OrionSemanticRouterMeta,
} from "./orion-semantic-router"
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

export type OrionSemanticPlannerMode = "ai_semantic_plan" | "deterministic_fallback" | "deterministic_fast_path" | "local_semantic_route"

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
  onSemanticRouter?: (meta: OrionSemanticRouterMeta) => void
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
  if (hasAny(tokenSet, ["semana", "semanal"])) {
    return { type: "next_n_days", days: 7, startDate: null, endDate: null, label: "esta semana" }
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

  // Weekly/forward-window strategy ("essa semana", "próximos dias") with action/plan/strategy/vision intent.
  const hasWeeklyHorizon = tokens.has("semana") || tokens.has("semanal")
    || (hasAny(tokens, ["proximos", "proximas"]) && hasAny(tokens, ["dias", "dia"]))
  const hasStrategicIntent = tokens.has("fazer") || tokens.has("plano") || tokens.has("estrategia") || tokens.has("visao")
    || tokens.has("deveria") || tokens.has("priorizar") || tokens.has("foco")
  if (hasWeeklyHorizon && hasStrategicIntent) {
    return { goal: "business_strategy", mode: "decision" }
  }
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

function routeTimeframeToPlanTimeframe(
  routeTimeframe: OrionSemanticRoute["timeframe"],
  fallback: OrionSemanticTimeframe,
  currentPeriodLabel?: string | null
): OrionSemanticTimeframe {
  if (!routeTimeframe) return fallback
  if (routeTimeframe.type === "today") {
    return {
      type: "today",
      days: null,
      startDate: null,
      endDate: null,
      label: routeTimeframe.label || "hoje",
    }
  }
  if (routeTimeframe.type === "current_week") {
    return {
      type: "next_n_days",
      days: 7,
      startDate: null,
      endDate: null,
      label: routeTimeframe.label || "esta semana",
    }
  }
  if (routeTimeframe.type === "next_n_days") {
    return {
      type: "next_n_days",
      days: routeTimeframe.days || fallback.days || 7,
      startDate: null,
      endDate: null,
      label: routeTimeframe.label || (routeTimeframe.days ? `próximos ${routeTimeframe.days} dias` : fallback.label),
    }
  }
  if (routeTimeframe.type === "current_month") {
    return {
      type: "current_period",
      days: null,
      startDate: null,
      endDate: null,
      label: routeTimeframe.label || currentPeriodLabel || "mês atual",
    }
  }
  if (routeTimeframe.type === "custom") {
    return {
      type: "date_range",
      days: routeTimeframe.days || null,
      startDate: null,
      endDate: null,
      label: routeTimeframe.label || fallback.label,
    }
  }
  return fallback
}

function responseModeForRoute(intent: OrionSemanticRoute["intent"], fallback: OrionSemanticPlan): OrionSemanticResponseMode {
  if (intent === "audit_traceability") return "audit_traceability"
  if (intent === "capital_allocation" || intent === "marketing_strategy") return "decision"
  if (intent === "operational_action") return "operational_plan"
  if (intent === "decision_memory_review") return "executive_summary"
  if (intent === "unknown") return fallback.responseMode
  return "executive_summary"
}

function semanticEntityFromLabel(label: string): OrionSemanticEntity {
  const normalized = label.toLowerCase()
  if (/campanha|roi|ads|meta/.test(normalized)) return { type: "campaign", label }
  if (/lead|cliente|whatsapp|follow/.test(normalized)) return { type: "lead", label }
  if (/caixa|saldo|liquidez|financeiro|conta/.test(normalized)) return { type: "finance", label }
  if (/estoque|invent[áa]rio|sku/.test(normalized)) return { type: "inventory", label }
  if (/decis[aã]o|recomenda|pend[eê]ncia/.test(normalized)) return { type: "decision", label }
  if (/ipad|iphone|macbook|apple|airpods|watch|pencil|produto/.test(normalized)) return { type: "product", label }
  return { type: "unknown", label }
}

function semanticRouteToPlan(
  route: OrionSemanticRoute,
  fallback: OrionSemanticPlan,
  input: OrionSemanticPlannerInput
): OrionSemanticPlan {
  if (route.intent === "unknown") {
    return fallbackForOpenManagementQuestion(input, fallback)
  }

  const tokens = new Set(tokenize(input.userQuestion))
  const secondaryGoals = Array.from(new Set([
    ...collectSecondaryGoals(tokens, route.intent),
  ])).slice(0, 12)
  const toolsNeeded = route.intent === "decision_memory_review"
    ? []
    : Array.from(new Set([...route.toolsNeeded, ...toolsForPlan(route.intent, secondaryGoals)]))
  const budgetAmount = fallback.budgetAmount ?? route.budgetAmount ?? null

  return {
    primaryGoal: route.intent,
    secondaryGoals,
    toolsNeeded,
    timeframe: routeTimeframeToPlanTimeframe(route.timeframe, fallback.timeframe, input.currentPeriodLabel),
    budgetAmount,
    budgetCurrency: budgetAmount !== null ? "BRL" : null,
    entities: route.entities.map(semanticEntityFromLabel).slice(0, 8),
    comparisonTargets: fallback.comparisonTargets,
    responseMode: responseModeForRoute(route.intent, fallback),
    confidence: route.confidence,
    needsClarification: false,
    clarificationQuestion: null,
    reasoningHints: [
      route.reasoning,
      "Semantic Router IA compacto; engines determinísticas calculam dados.",
    ],
    plannerMode: route.source === "local" ? "local_semantic_route" : "ai_semantic_plan",
  }
}

function fallbackForOpenManagementQuestion(
  input: OrionSemanticPlannerInput,
  fallback: OrionSemanticPlan
): OrionSemanticPlan {
  const tokens = new Set(tokenize(input.userQuestion))
  const hasOperationalDirection = hasAny(tokens, ["hoje", "agora", "comeco", "começo", "perdido", "fazer", "primeiro", "foco"])
  const hasBusinessHealthSubject = hasAny(tokens, ["nobretech", "empresa", "negocio", "negócio", "operacao", "operação"])
  const hasBusinessHealthSignal = hasAny(tokens, ["bem", "indo", "esta", "está", "estamos", "saudavel", "saudável", "saude", "saúde", "situacao", "situação"])
  const hasBusinessHealthQuestion = hasBusinessHealthSubject && hasBusinessHealthSignal
  const hasStrategicDirection = hasAny(tokens, ["caminho", "rumo", "visao", "visão", "faria", "lugar", "vendo", "enxergando", "inteligente", "nobretech", "empresa", "bem"])
  if (isDeterministicGuardrailPlan(fallback) || (!hasOperationalDirection && !hasStrategicDirection && fallback.primaryGoal !== "unknown")) return fallback
  const intent: OrionSemanticPrimaryGoal = hasBusinessHealthQuestion ? "business_review" : hasOperationalDirection ? "operational_action" : hasStrategicDirection ? "business_strategy" : "unknown"
  if (intent === "unknown") return fallback
  const secondaryGoals = collectSecondaryGoals(tokens, intent)
  return {
    ...fallback,
    primaryGoal: intent,
    secondaryGoals,
    toolsNeeded: toolsForPlan(intent, secondaryGoals),
    responseMode: intent === "operational_action" ? "operational_plan" : "executive_summary",
    confidence: hasBusinessHealthQuestion || hasOperationalDirection ? "medium" : "low",
    needsClarification: false,
    clarificationQuestion: null,
    reasoningHints: [
      ...fallback.reasoningHints,
      "Fallback seguro para pergunta natural de gestão/direção; unknown reservado para fora de escopo.",
    ],
    plannerMode: "deterministic_fallback",
  }
}

function isDeterministicGuardrailPlan(plan: OrionSemanticPlan): boolean {
  return plan.primaryGoal === "decision_memory_review"
    || plan.responseMode === "audit_traceability"
    || (plan.primaryGoal === "capital_allocation" && plan.budgetAmount !== null)
    || plan.primaryGoal === "reinvestment_decision"
    || plan.primaryGoal === "withdrawal_decision"
    || plan.primaryGoal === "purchase_capacity"
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

// Sync public entry point: deterministic fallback, safe for tests/clientless helpers.
export function buildSemanticPlan(input: OrionSemanticPlannerInput): OrionSemanticPlan {
  return buildDeterministicSemanticPlan(input)
}

// Fast intent gate: resolve obvious intentions deterministically so the AI call is skipped.
// Returns null when the question is ambiguous and the AI planner should run.
export function buildFastSemanticPlan(input: OrionSemanticPlannerInput): OrionSemanticPlan | null {
  const deterministic = buildDeterministicSemanticPlan(input)
  const goal = deterministic.primaryGoal
  const obvious =
    goal === "decision_memory_review" ||
    deterministic.responseMode === "audit_traceability" ||
    (goal === "capital_allocation" && deterministic.budgetAmount !== null) ||
    goal === "reinvestment_decision" ||
    goal === "withdrawal_decision" ||
    goal === "purchase_capacity"
  if (!obvious) return null
  return {
    ...deterministic,
    confidence: "high",
    needsClarification: false,
    clarificationQuestion: null,
    reasoningHints: [...deterministic.reasoningHints, "Intenção óbvia — fast path determinístico, IA não chamada."],
    plannerMode: "deterministic_fast_path",
  }
}

export async function buildSemanticPlanWithAI(
  input: OrionSemanticPlannerInput,
  options?: BuildSemanticPlanWithAIOptions
): Promise<OrionSemanticPlan> {
  const fast = buildFastSemanticPlan(input)
  if (fast) return fast
  const fallback = buildDeterministicSemanticPlan(input)
  try {
    const route = await buildSemanticRoute({
      userQuestion: input.userQuestion,
      selectedPeriod: input.currentPeriodLabel || undefined,
      hasOpenMemory: input.hasOpenMemory,
      currentDate: input.currentDate,
      availableIntents: ORION_SEMANTIC_INTENTS,
    }, {
      apiKey: options?.apiKey,
      model: options?.model,
      fetcher: options?.fetcher,
      onComplete: options?.onSemanticRouter,
    })
    const aiPlan = semanticRouteToPlan(route, fallback, input)
    if (aiPlan.confidence === "medium" || aiPlan.confidence === "high" || aiPlan.needsClarification) {
      return applySemanticPlanGuardrails(aiPlan, fallback)
    }
    return {
      ...fallbackForOpenManagementQuestion(input, fallback),
      reasoningHints: [...fallback.reasoningHints, "Semantic Router indisponível ou confiança baixa; usando fallback determinístico."],
      plannerMode: "deterministic_fallback",
    }
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message))
    if (aborted) console.warn("[ORION_PERF] plannerTimeout=true fallbackApplied=true")
    const safeFallback = fallbackForOpenManagementQuestion(input, fallback)
    return {
      ...safeFallback,
      reasoningHints: [
        ...safeFallback.reasoningHints,
        aborted
          ? "Semantic Router estourou timeout; usando fallback determinístico."
          : "Semantic Router falhou; usando fallback determinístico.",
      ],
      plannerMode: "deterministic_fallback",
    }
  }
}
