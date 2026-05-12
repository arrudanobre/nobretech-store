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

export type OrionSemanticTimeframe = {
  type: "current_period" | "last_n_days" | "date_range" | "next_n_days" | "all_available" | "unknown"
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

export type OrionSemanticPlan = {
  primaryGoal: OrionSemanticPrimaryGoal
  secondaryGoals: OrionSemanticSecondaryGoal[]
  toolsNeeded: OrionToolName[]
  timeframe: OrionSemanticTimeframe
  budgetAmount: number | null
  budgetCurrency: "BRL" | null
  comparisonTargets: string[]
  responseMode: OrionSemanticResponseMode
  confidence: "low" | "medium" | "high"
  needsClarification: boolean
  clarificationQuestion: string | null
  reasoningHints: string[]
}

export type OrionSemanticPlannerInput = {
  userQuestion: string
  currentPeriodLabel?: string | null
  hasOpenMemory?: boolean
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
const cashHealthTokens = ["caixa", "saude", "saúde", "saudavel", "saudável", "liquidez", "financeiro"]
const leadTokens = ["lead", "leads", "follow", "followup", "atendimento", "negociacao", "negociação"]
const campaignTokens = ["campanha", "campanhas", "anuncio", "anuncios", "anúncio", "anúncios", "trafego", "tráfego", "roi"]
const inventoryReviewTokens = ["produto", "produtos", "sku", "skus", "modelo", "modelos", "categoria"]
const strategyTokens = ["estrategia", "estratégia", "plano", "prioridade", "priorizar", "primeiro"]
const lossTokens = ["perdendo", "perder", "perda", "perdas", "dinheiro", "vazando"]

function collectSecondaryGoals(tokens: Set<string>, primary: OrionSemanticPrimaryGoal): OrionSemanticSecondaryGoal[] {
  const goals = new Set<OrionSemanticSecondaryGoal>()
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
const explicitAuditTokens = ["abra", "abrir", "detalhe", "detalhar", "liste", "listar", "mostre", "mostrar", "estratifique", "estratificar", "extraia", "extrair", "quebre", "quebrar", "explique", "explicar", "calculo", "calculos", "composicao", "compoe"]

function pickPrimaryGoal(message: string): { goal: OrionSemanticPrimaryGoal; mode: OrionSemanticResponseMode } {
  const tokens = new Set(tokenize(message))
  const budget = parseBudget(message)

  // 1) Explicit audit request ("abra o cálculo do reinvestimento" etc.) is the most specific.
  if (hasAny(tokens, explicitAuditTokens) && isFinancialTraceabilityRequest(message)) {
    const kind = selectFinancialTraceabilityKind(message)
    if (kind === "reinvestment_audit") return { goal: "audit_traceability", mode: "audit_traceability" }
    return { goal: "profit_traceability", mode: "audit_traceability" }
  }

  // 2) Reuse existing decision detectors before compound/heuristic checks.
  if (isFinancialReinvestmentDecisionRequest(message)) return { goal: "reinvestment_decision", mode: "decision" }
  if (isFinancialWithdrawalDecisionRequest(message)) return { goal: "withdrawal_decision", mode: "decision" }

  if (budget.amount !== null && (hasAny(tokens, purchaseTokens) || hasAny(tokens, ["priorizar", "reinvestimento", "compro"]))) {
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
      comparisonTargets: [],
      responseMode: "executive_summary",
      confidence: "low",
      needsClarification: true,
      clarificationQuestion: "Sobre qual aspecto da operação você quer falar?",
      reasoningHints: ["Pergunta vazia ou sem contexto suficiente."],
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
    comparisonTargets: [],
    responseMode: mode,
    confidence,
    needsClarification: false,
    clarificationQuestion: null,
    reasoningHints: hints,
  }
}

// Public entry point. AI hook is intentionally lazy — caller can override with an
// AI-driven planner if structured-output API is available. Deterministic fallback
// always succeeds and never invents data.
export function buildSemanticPlan(input: OrionSemanticPlannerInput): OrionSemanticPlan {
  return buildDeterministicSemanticPlan(input)
}
