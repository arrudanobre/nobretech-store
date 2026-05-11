import "server-only"

import type {
  OrionExecutionGuardrails,
  OrionIntentRouteSummary,
  OrionOperationalConversationState,
  OrionOperationalGoal,
  OrionReasoningMode,
} from "./types"

export type { OrionExecutionGuardrails } from "./types"

const FINANCIAL_MODES = new Set<OrionReasoningMode>([
  "financial_decision",
  "financial_traceability",
  "withdrawal_safety",
  "reinvestment_decision",
  "working_capital_analysis",
  "financial_health_analysis",
])

const EXECUTION_MODES = new Set<OrionReasoningMode>([
  "campaign_generation",
  "marketing_execution",
  "content_generation",
])

const INVENTORY_PLANNING_MODES = new Set<OrionReasoningMode>([
  "inventory_liquidity",
  "inventory_rotation",
  "goal_planning",
])

const PRICING_EXECUTION_MODES = new Set<OrionReasoningMode>([
  "pricing_strategy",
  "offer_optimization",
  "campaign_generation",
  "marketing_execution",
])

export function isFinancialReasoningMode(mode?: OrionReasoningMode | null) {
  return Boolean(mode && FINANCIAL_MODES.has(mode))
}

export function canUseCommercialExecution(mode?: OrionReasoningMode | null) {
  return Boolean(mode && EXECUTION_MODES.has(mode))
}

function blockAll(reason: string): OrionExecutionGuardrails {
  return {
    allowCampaignGeneration: false,
    allowTrafficRecommendation: false,
    allowProductMixGeneration: false,
    allowCopyGeneration: false,
    allowPricingExecution: false,
    allowInventoryPush: false,
    reason,
  }
}

export function reduceExecutionGuardrails(
  upstream: OrionExecutionGuardrails,
  downstream: Partial<OrionExecutionGuardrails>
): OrionExecutionGuardrails {
  return {
    allowCampaignGeneration: upstream.allowCampaignGeneration && Boolean(downstream.allowCampaignGeneration),
    allowTrafficRecommendation: upstream.allowTrafficRecommendation && Boolean(downstream.allowTrafficRecommendation),
    allowProductMixGeneration: upstream.allowProductMixGeneration && Boolean(downstream.allowProductMixGeneration),
    allowCopyGeneration: upstream.allowCopyGeneration && Boolean(downstream.allowCopyGeneration),
    allowPricingExecution: upstream.allowPricingExecution && Boolean(downstream.allowPricingExecution),
    allowInventoryPush: upstream.allowInventoryPush && Boolean(downstream.allowInventoryPush),
    reason: downstream.reason || upstream.reason,
  }
}

export function buildExecutionGuardrails(input: {
  reasoningMode?: OrionReasoningMode | null
  goal?: OrionOperationalGoal | null
  intentRoute?: OrionIntentRouteSummary | null
  previousState?: OrionOperationalConversationState | null
}): OrionExecutionGuardrails {
  const mode = input.reasoningMode
  const intent = input.intentRoute?.intent

  if (!mode) return blockAll("Sem modo de raciocínio estruturado; execução comercial bloqueada por segurança.")

  if (isFinancialReasoningMode(mode)) {
    return blockAll("Modo financeiro ativo; campanha, tráfego, copy e mix de produtos ficam bloqueados.")
  }

  if (input.intentRoute?.missionContextPolicy === "ignore" && (intent === "financial_analysis" || intent === "financial_traceability")) {
    return blockAll("Pergunta financeira ignora missão ativa; execução comercial bloqueada.")
  }

  if (EXECUTION_MODES.has(mode)) {
    return {
      allowCampaignGeneration: true,
      allowTrafficRecommendation: true,
      allowProductMixGeneration: true,
      allowCopyGeneration: true,
      allowPricingExecution: mode !== "content_generation",
      allowInventoryPush: true,
      reason: "Modo de execução comercial explícito; geração de campanha/copy/tráfego permitida.",
    }
  }

  if (INVENTORY_PLANNING_MODES.has(mode)) {
    return {
      allowCampaignGeneration: false,
      allowTrafficRecommendation: false,
      allowProductMixGeneration: true,
      allowCopyGeneration: false,
      allowPricingExecution: false,
      allowInventoryPush: true,
      reason: "Modo de planejamento de estoque; mix operacional permitido, execução de campanha bloqueada.",
    }
  }

  if (PRICING_EXECUTION_MODES.has(mode)) {
    return {
      allowCampaignGeneration: false,
      allowTrafficRecommendation: false,
      allowProductMixGeneration: false,
      allowCopyGeneration: false,
      allowPricingExecution: true,
      allowInventoryPush: false,
      reason: "Modo de preço/oferta; validação comercial permitida sem gerar campanha pronta.",
    }
  }

  return blockAll("Modo diagnóstico; execução comercial precisa de pedido explícito.")
}
