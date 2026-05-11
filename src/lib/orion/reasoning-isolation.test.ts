import assert from "node:assert/strict"
import { createRequire } from "node:module"
import type {
  OrionExecutionPayload,
  OrionIntentRouteSummary,
  OrionOperationalContext,
  OrionOperationalConversationState,
  OrionSnapshot,
} from "./types"

const require = createRequire(import.meta.url)
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
  children: [],
  paths: [],
} as unknown as NodeJS.Module

let buildExecutionGuardrails: typeof import("./execution-guardrails").buildExecutionGuardrails
let extractOperationalGoal: typeof import("./goal-extractor").extractOperationalGoal
let buildOperationalPlan: typeof import("./operational-planning-engine").buildOperationalPlan
let buildOperationalConversationState: typeof import("./operational-conversation-state").buildOperationalConversationState
let selectReasoningMode: typeof import("./reasoning-mode-selector").selectReasoningMode
let classifyOrionIntent: typeof import("./intent-router").classifyOrionIntent
let buildOperationalExecutionAnswer: typeof import("./strategic-copilot").buildOperationalExecutionAnswer
let shouldUseOperationalExecutionAnswer: typeof import("./strategic-copilot").shouldUseOperationalExecutionAnswer

const financialRoute: OrionIntentRouteSummary = {
  intent: "financial_analysis",
  missionContextPolicy: "ignore",
  useMissionContext: false,
  ignoreMissionContext: true,
  rebuildMissionContext: false,
  reason: "Pergunta financeira deve ignorar missão comercial ativa.",
  confidence: 0.96,
}

const campaignRoute: OrionIntentRouteSummary = {
  intent: "marketing_execution",
  missionContextPolicy: "use",
  useMissionContext: true,
  ignoreMissionContext: false,
  rebuildMissionContext: false,
  reason: "Pedido explícito de campanha.",
  confidence: 0.9,
}

const inventoryRoute: OrionIntentRouteSummary = {
  intent: "inventory_analysis",
  missionContextPolicy: "ignore",
  useMissionContext: false,
  ignoreMissionContext: true,
  rebuildMissionContext: false,
  reason: "Pergunta de estoque.",
  confidence: 0.86,
}

const traceabilityRoute: OrionIntentRouteSummary = {
  intent: "financial_traceability",
  missionContextPolicy: "ignore",
  useMissionContext: false,
  ignoreMissionContext: true,
  rebuildMissionContext: false,
  reason: "Pedido de rastreabilidade financeira.",
  confidence: 0.94,
}

function snapshot(): OrionSnapshot {
  return {
    generatedAt: "2026-05-09T12:00:00.000Z",
    companyName: "Nobretech",
    executive: {
      leadsWithoutFollowUp: 0,
      stuckStockCount: 0,
    },
    finance: {
      financialOperationalContext: {
        reconciledCashBalance: 5869,
        availableLiquidity: 5869,
        pendingBalance: 1200,
        operationalSummary: "Caixa reconciliado cobre as obrigações próximas sem tratar pendências como liquidez.",
        profitInterpretation: "Lucro operacional disponível é leitura operacional, não saque automático.",
        cashHealth: "healthy",
        liquidityPressure: "low",
        financialWarnings: ["Parte do resultado precisa preservar recomposição e contas próximas."],
      },
      workingCapitalSnapshot: {
        availableCash: 5869,
        activeInventoryCapital: 4100,
        protectedOperationalCapital: 4100,
        realAvailableProfit: 2946,
        estimatedOperationalProfit: 2946,
        upcomingBills30d: 350,
        operationalSurplusAfterBills: 2596,
        safeWithdrawalAmount: 1800,
        safeReinvestmentAmount: 900,
        capitalProtectionBasis: "active_inventory",
        warnings: ["Retirada acima do teto conservador pode consumir recomposição."],
        reasoning: [],
      },
    },
    stock: {
      availableItems: [],
    },
  } as unknown as OrionSnapshot
}

function executionPayload(): OrionExecutionPayload {
  return {
    objective: {
      financialGoal: {
        urgencyLevel: "stable",
        nextDueLabel: "Conta teste",
        strategy: "Preservar capital operacional.",
      },
      targetProfit: null,
      gap: 0,
      recommendedScenario: "balanced",
    },
    priorityAction: {
      product: {
        id: "iphone-1",
        name: "iPhone 15 Pro",
        quantity: 1,
        price: 7000,
        cost: 5400,
        profit: 1600,
        marginPct: 22,
        daysInStock: 12,
        status: "active",
        role: "anchor",
        reason: "Produto do board.",
        conversionSpeed: "media",
      },
      price: 7000,
      profit: 1600,
      urgency: "normal",
      risk: "Sem risco",
    },
    products: [],
    bundles: [],
  } as unknown as OrionExecutionPayload
}

function operationalContext(overrides: Partial<OrionOperationalContext> = {}): OrionOperationalContext {
  return {
    intent: "cash_health_analysis",
    toolsUsed: ["financial_tool"],
    label: "Dados específicos do sistema",
    dataStatus: "specific_data_found",
    matchedRecords: 1,
    summary: "Consulta financeira.",
    answer: "Resposta financeira.",
    evidence: [],
    gaps: [],
    contexts: {
      inventory: {
        products: [
          {
            id: "iphone-1",
            name: "iPhone 15 Pro",
            status: "active",
            category: "iPhone",
            productType: "device",
            purchasePrice: 5400,
            suggestedPrice: 7000,
            marginPct: 22,
            daysInStock: 12,
            quantity: 1,
          },
        ],
      },
    },
    intentRoute: financialRoute,
    ...overrides,
  } as OrionOperationalContext
}

function activeMissionState(): OrionOperationalConversationState {
  return {
    activeMission: "Executar venda do iPhone 15 Pro",
    focusProduct: "iPhone 15 Pro",
    selectedScenario: "balanced",
    targetGoal: "Vender iPhone",
    deadline: null,
    selectedChannel: "WhatsApp",
    selectedOffer: "Combo iPhone",
    lastUserDecision: "seguir campanha",
    nextExpectedStep: "campanha",
    executionMode: "marketing_execution",
    currentMission: "Executar venda do iPhone 15 Pro",
    currentProduct: "iPhone 15 Pro",
    currentExecutionMode: "marketing_execution",
    chosenOperationalPath: "balanced",
    chosenTrafficDirection: "Meta Ads",
    activeOffer: "Combo iPhone",
    activeCampaignIntent: "Campanha iPhone",
    activeProduct: "iPhone 15 Pro",
    activeCampaign: "Campanha iPhone",
    activeTrafficDirection: "Meta Ads",
    activePricingDiscussion: null,
    activeLeadProfile: null,
    activeClosingStrategy: null,
    activeExecutionMode: "marketing_execution",
    currentCommercialConcern: null,
    currentBottleneck: null,
    operationalIntent: "campaign_iteration",
    activeMissionContext: null,
    intentRoute: campaignRoute,
    commercialSubject: null,
    activeGoal: null,
    activeReasoningMode: "campaign_generation",
    executionGuardrails: buildExecutionGuardrails({ reasoningMode: "campaign_generation", intentRoute: campaignRoute }),
    activeOperationalPlanSummary: null,
  }
}

async function main() {
  ;({ buildExecutionGuardrails } = await import("./execution-guardrails"))
  ;({ extractOperationalGoal } = await import("./goal-extractor"))
  ;({ buildOperationalPlan } = await import("./operational-planning-engine"))
  ;({ buildOperationalConversationState } = await import("./operational-conversation-state"))
  ;({ selectReasoningMode } = await import("./reasoning-mode-selector"))
  ;({ classifyOrionIntent } = await import("./intent-router"))
  ;({ buildOperationalExecutionAnswer, shouldUseOperationalExecutionAnswer } = await import("./strategic-copilot"));

{
  const questions = [
    "Estratifique minhas retiradas de lucro",
    "Extraia minhas devoluções de aporte",
    "Detalhe de onde veio meu caixa",
    "Abra esse valor de lucro realizado",
  ]
  for (const question of questions) {
    const route = classifyOrionIntent({ message: question, previousState: activeMissionState() })
    assert.equal(route.intent, "financial_traceability")
    assert.equal(route.ignoreMissionContext, true)
    const goal = extractOperationalGoal({ message: question, previousState: activeMissionState(), intentRoute: route })
    const mode = selectReasoningMode({ goal, intentRoute: route })
    assert.equal(mode, "financial_traceability")
    const guardrails = buildExecutionGuardrails({ reasoningMode: mode, goal, intentRoute: traceabilityRoute, previousState: activeMissionState() })
    assert.equal(guardrails.allowCampaignGeneration, false)
    assert.equal(guardrails.allowProductMixGeneration, false)
    assert.equal(guardrails.allowTrafficRecommendation, false)
  }
}

{
  const routed = classifyOrionIntent({ message: "Posso sacar 2500 agora sem me comprometer?", previousState: activeMissionState() })
  assert.equal(routed.intent, "financial_analysis")
  assert.equal(routed.ignoreMissionContext, true)
  const goal = extractOperationalGoal({
    message: "Posso sacar 2500 agora sem me comprometer?",
    previousState: activeMissionState(),
    intentRoute: financialRoute,
  })
  const mode = selectReasoningMode({ goal, intentRoute: financialRoute })
  assert.equal(mode, "withdrawal_safety")
  const guardrails = buildExecutionGuardrails({ reasoningMode: mode, goal, intentRoute: financialRoute, previousState: activeMissionState() })
  assert.equal(guardrails.allowCampaignGeneration, false)
  assert.equal(guardrails.allowTrafficRecommendation, false)
  assert.equal(guardrails.allowProductMixGeneration, false)
  assert.equal(guardrails.allowCopyGeneration, false)

  const state = buildOperationalConversationState({
    previousState: activeMissionState(),
    question: "Posso sacar 2500 agora sem me comprometer?",
    snapshot: snapshot(),
    execution: executionPayload(),
    operationalContext: operationalContext({ reasoningMode: mode, executionGuardrails: guardrails }),
    intentRoute: financialRoute,
    operationalGoal: goal,
    reasoningMode: mode,
    executionGuardrails: guardrails,
  })
  assert.equal(state.activeReasoningMode, "withdrawal_safety")
  assert.equal(state.activeMissionContext, null)
  assert.equal(shouldUseOperationalExecutionAnswer(state), false)

  const forcedPlan = buildOperationalPlan({
    snapshot: snapshot(),
    operationalContext: operationalContext({ reasoningMode: mode, executionGuardrails: guardrails }),
    goal,
    reasoningMode: mode,
    executionGuardrails: guardrails,
  })
  assert.equal(forcedPlan.productMix.length, 0)
  assert.equal(forcedPlan.executionAllowed, false)
  assert.doesNotMatch(forcedPlan.response, /Campanha|Headline|Copy|Tráfego|iPhone/i)

  const forcedAnswer = buildOperationalExecutionAnswer({
    question: "Posso sacar 2500 agora sem me comprometer?",
    snapshot: snapshot(),
    execution: executionPayload(),
    conversationState: state,
  })
  assert.doesNotMatch(forcedAnswer, /Campanha|Headline|Copy|Tráfego|iPhone/i)
  assert.match(forcedAnswer, /limite prudente|lucro do período|retirada/i)
}

{
  const goal = extractOperationalGoal({
    message: "Cria campanha para acelerar vendas essa semana",
    previousState: activeMissionState(),
    intentRoute: campaignRoute,
  })
  const mode = selectReasoningMode({ goal, intentRoute: campaignRoute })
  const guardrails = buildExecutionGuardrails({ reasoningMode: mode, goal, intentRoute: campaignRoute, previousState: activeMissionState() })
  assert.equal(mode, "campaign_generation")
  assert.equal(guardrails.allowCampaignGeneration, true)
  assert.equal(guardrails.allowCopyGeneration, true)
  assert.equal(guardrails.allowProductMixGeneration, true)
}

{
  const goal = extractOperationalGoal({
    message: "Quais produtos devo girar primeiro?",
    intentRoute: inventoryRoute,
  })
  const mode = selectReasoningMode({ goal, intentRoute: inventoryRoute })
  const guardrails = buildExecutionGuardrails({ reasoningMode: mode, goal, intentRoute: inventoryRoute })
  assert.equal(mode, "inventory_liquidity")
  assert.equal(guardrails.allowProductMixGeneration, true)
  assert.equal(guardrails.allowCampaignGeneration, false)
  assert.equal(guardrails.allowCopyGeneration, false)
  assert.equal(guardrails.allowTrafficRecommendation, false)
}

console.log("reasoning-isolation-engine tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
