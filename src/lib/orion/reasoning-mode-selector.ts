import "server-only"

import type { OrionIntentRouteSummary, OrionOperationalGoal, OrionReasoningMode } from "./types"
import { canUseCommercialExecution, isFinancialReasoningMode } from "./execution-guardrails"
import { isFinancialReinvestmentDecisionRequest } from "./financial-traceability-router"

const executionModes = new Set<OrionReasoningMode>(["campaign_generation", "marketing_execution", "content_generation"])

export function isExecutionReasoningMode(mode?: OrionReasoningMode | null) {
  return canUseCommercialExecution(mode) || Boolean(mode && executionModes.has(mode))
}

export function isBlockedFinancialReasoningMode(mode?: OrionReasoningMode | null) {
  return isFinancialReasoningMode(mode)
}

export function selectReasoningMode(input: {
  goal?: OrionOperationalGoal | null
  intentRoute?: OrionIntentRouteSummary | null
  userQuestion?: string | null
}): OrionReasoningMode {
  const goal = input.goal
  const intent = input.intentRoute?.intent

  if (goal?.goalType === "content_generation") return "content_generation"
  if (goal?.goalType === "marketing_execution") return "campaign_generation"
  if (goal?.goalType === "financial_traceability" || intent === "financial_traceability") return "financial_traceability"
  if (intent === "financial_analysis" || intent === "global_business_question") {
    if (goal?.targetProfit) return "withdrawal_safety"
    if (goal?.optimization === "liquidity") return "working_capital_analysis"
    if (input.userQuestion && isFinancialReinvestmentDecisionRequest(input.userQuestion)) return "reinvestment_decision"
    return "financial_health_analysis"
  }
  if (goal?.directQuestion || goal?.goalType === "pricing_validation") return "financial_decision"
  if (goal?.goalType === "profit_target") return "goal_planning"
  if (goal?.goalType === "inventory_liquidity") return "inventory_liquidity"
  if (goal?.goalType === "inventory_rotation") return "inventory_rotation"
  if (goal?.goalType === "margin_optimization") return "pricing_strategy"

  if (intent === "pricing_refinement") return "pricing_strategy"
  if (intent === "offer_refinement" || intent === "mission_refinement") return "offer_optimization"
  if (intent === "marketing_execution" || intent === "new_campaign_request" || intent === "mission_continuation") {
    return goal?.needsExecution ? "campaign_generation" : "operational_diagnosis"
  }
  if (intent === "inventory_analysis") return "inventory_liquidity"
  if (intent === "strategic_question" || intent === "operational_question") return "operational_diagnosis"

  return "operational_diagnosis"
}
