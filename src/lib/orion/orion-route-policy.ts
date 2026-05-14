import type { OrionSemanticPlan, OrionSemanticPrimaryGoal } from "./semantic-planner"
import type { OrionConversationIntent, OrionIntentRouteSummary } from "./types"

export const STRUCTURED_ORION_GOALS = new Set<OrionSemanticPrimaryGoal>([
  "business_review",
  "business_strategy",
  "operational_action",
  "capital_allocation",
  "marketing_strategy",
  "cash_health",
  "inventory_review",
  "inventory_priority",
  "sales_performance_review",
  "lead_review",
  "campaign_review",
  "decision_memory_review",
  "audit_traceability",
  "profit_traceability",
  "reinvestment_decision",
  "purchase_capacity",
  "withdrawal_decision",
])

const STRUCTURED_COPILOT_BLOCKED_GOALS = new Set<OrionSemanticPrimaryGoal>([
  "operational_action",
  "business_strategy",
  "business_review",
  "capital_allocation",
  "marketing_strategy",
])

export function isStructuredOrionGoal(plan?: OrionSemanticPlan | null): boolean {
  return Boolean(plan && STRUCTURED_ORION_GOALS.has(plan.primaryGoal))
}

export function shouldUseLegacyIntentRoute(plan?: OrionSemanticPlan | null): boolean {
  return !isStructuredOrionGoal(plan)
}

export function shouldBlockStrategicCopilotForStructuredGoal(plan?: OrionSemanticPlan | null): boolean {
  return Boolean(plan && STRUCTURED_COPILOT_BLOCKED_GOALS.has(plan.primaryGoal))
}

function intentForStructuredGoal(goal: OrionSemanticPrimaryGoal): OrionConversationIntent | null {
  if (goal === "unknown") return null
  if (goal === "audit_traceability" || goal === "profit_traceability") return "financial_traceability"
  if (
    goal === "cash_health"
    || goal === "capital_allocation"
    || goal === "reinvestment_decision"
    || goal === "purchase_capacity"
    || goal === "withdrawal_decision"
  ) return "financial_analysis"
  if (goal === "marketing_strategy" || goal === "campaign_review" || goal === "lead_review") return "marketing_execution"
  if (goal === "inventory_review" || goal === "inventory_priority") return "inventory_analysis"
  return "operational_question"
}

export function buildStructuredIntentRoute(plan?: OrionSemanticPlan | null): OrionIntentRouteSummary | null {
  const intent = plan ? intentForStructuredGoal(plan.primaryGoal) : null
  if (!intent || !plan) return null
  return {
    intent,
    missionContextPolicy: "ignore",
    useMissionContext: false,
    ignoreMissionContext: true,
    rebuildMissionContext: false,
    reason: `Intent já estruturado pelo Semantic Planner: ${plan.primaryGoal}. Rota legacy pulada.`,
    confidence: plan.confidence === "high" ? 0.96 : plan.confidence === "medium" ? 0.84 : 0.68,
  }
}

export function responseKindForStructuredChat(input: {
  shouldUsePlanAnswer: boolean
  shouldUseOperationalAnswer: boolean
  routeWantsStrategicCopilot: boolean
  semanticPlan?: OrionSemanticPlan | null
}): "plan_answer" | "operational_answer" | "strategic_copilot" | "business_decision" {
  if (input.shouldUsePlanAnswer) return "plan_answer"
  if (input.shouldUseOperationalAnswer) return "operational_answer"
  if (
    input.routeWantsStrategicCopilot
    && !shouldBlockStrategicCopilotForStructuredGoal(input.semanticPlan)
  ) return "strategic_copilot"
  return "business_decision"
}
