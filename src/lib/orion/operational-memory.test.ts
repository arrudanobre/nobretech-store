import assert from "node:assert/strict"
import {
  applyMemoryToOrionContext,
  calculateMemoryInfluenceWeight,
  extractOperationalMemorySignals,
  selectRelevantOperationalMemories,
  type OrionOperationalMemory,
} from "./operational-memory"
import type { OrionExecutionPayload, OrionOperationalContext, OrionSnapshot } from "./types"

const companyId = "company-1"
const now = "2026-05-09T12:00:00.000Z"

function snapshot(overrides: {
  cashHealth?: "critical" | "attention" | "healthy"
  liquidityPressure?: "low" | "medium" | "high"
  leadsWithoutFollowUp?: number
  stuckStockCount?: number
  inventoryPressure?: "low" | "medium" | "high"
} = {}) {
  return {
    generatedAt: now,
    executive: {
      leadsWithoutFollowUp: overrides.leadsWithoutFollowUp ?? 0,
      stuckStockCount: overrides.stuckStockCount ?? 0,
    },
    stock: {
      averageActiveDays: 22,
    },
    finance: {
      financialOperationalContext: {
        cashHealth: overrides.cashHealth || "healthy",
        liquidityPressure: overrides.liquidityPressure || "low",
        canSafelyReinvest: true,
        canSafelyWithdraw: true,
        realAvailableProfit: 1800,
        protectedCapital: 3200,
      },
      realProfitSnapshot: {
        availableProfit: 1800,
        protectedCapital: 3200,
        inventoryPressure: overrides.inventoryPressure || "low",
      },
    },
  } as unknown as OrionSnapshot
}

function operationalContext(overrides: Partial<OrionOperationalContext> = {}) {
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
    contexts: {},
    intentRoute: {
      intent: "financial_analysis",
      missionContextPolicy: "ignore",
      useMissionContext: false,
      ignoreMissionContext: true,
      rebuildMissionContext: false,
      reason: "Consulta financeira global.",
      confidence: 0.9,
    },
    reasoningMode: "financial_health_analysis",
    operationalGoal: {
      goalType: "operational_diagnosis",
      targetProfit: null,
      horizonDays: null,
      urgency: "medium",
      optimization: "unknown",
      directQuestion: true,
      needsExecution: false,
      reason: "Diagnostico financeiro.",
    },
    ...overrides,
  } as OrionOperationalContext
}

function execution(overrides: Partial<OrionExecutionPayload> = {}) {
  return {
    objective: {
      recommendedScenario: "balanced",
    },
    products: [],
    bundles: [],
    trafficPlan: null,
    ...overrides,
  } as unknown as OrionExecutionPayload
}

function memory(overrides: Partial<OrionOperationalMemory> = {}): OrionOperationalMemory {
  return {
    id: "custom-memory",
    companyId,
    type: "pricing_behavior",
    summary: "Proteger margem antes de desconto.",
    evidence: ["Preferencia operacional registrada."],
    confidence: 0.72,
    source: "observed_result",
    scope: "global_business",
    tags: ["margin_protection", "controlled_discount"],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    usageCount: 2,
    status: "active",
    ...overrides,
  }
}

{
  const context = applyMemoryToOrionContext({
    companyId,
    snapshot: snapshot(),
    operationalContext: operationalContext({
      intentRoute: {
        intent: "pricing_refinement",
        missionContextPolicy: "use",
        useMissionContext: true,
        ignoreMissionContext: false,
        rebuildMissionContext: false,
        reason: "Refinamento de preco.",
        confidence: 0.9,
      },
      reasoningMode: "pricing_strategy",
      operationalGoal: {
        goalType: "margin_optimization",
        targetProfit: null,
        horizonDays: null,
        urgency: "medium",
        optimization: "margin",
        directQuestion: true,
        needsExecution: false,
        reason: "Proteger margem.",
      },
    }),
    now,
  })
  const marginMemory = context.relevantOperationalMemories.find((item) => item.memory.id === "seed-margin-before-discount")
  assert.ok(marginMemory)
  assert.ok(marginMemory.memoryInfluenceWeight >= 0.3)
  assert.equal(context.businessPersonalityProfile.marginPreference, "protect_margin")
  assert.equal(context.businessPersonalityProfile.discountPosture, "avoid_early_discount")
}

{
  const context = applyMemoryToOrionContext({
    companyId,
    snapshot: snapshot({ cashHealth: "critical", liquidityPressure: "high" }),
    operationalContext: operationalContext({
      intentRoute: {
        intent: "pricing_refinement",
        missionContextPolicy: "use",
        useMissionContext: true,
        ignoreMissionContext: false,
        rebuildMissionContext: false,
        reason: "Refinamento com caixa pressionado.",
        confidence: 0.9,
      },
      reasoningMode: "pricing_strategy",
    }),
    now,
  })
  const marginMemory = context.relevantOperationalMemories.find((item) => item.memory.id === "seed-margin-before-discount")
  assert.ok(marginMemory)
  assert.equal(marginMemory.conflictWithCurrentData, true)
  assert.ok(marginMemory.memoryInfluenceWeight <= 0.3)
  assert.equal(context.businessPersonalityProfile.marginPreference, "favor_liquidity")
}

{
  const signals = extractOperationalMemorySignals({
    companyId,
    snapshot: snapshot(),
    operationalContext: operationalContext({
      reasoningMode: "pricing_strategy",
    }),
    now,
  })
  const influence = calculateMemoryInfluenceWeight({
    memory: memory({ status: "contradicted" }),
    signals,
    now,
  })
  assert.equal(influence.memoryInfluenceWeight, 0)
  assert.equal(influence.influenceLevel, "ignored")
}

{
  const signals = extractOperationalMemorySignals({
    companyId,
    snapshot: snapshot(),
    operationalContext: operationalContext({ reasoningMode: "pricing_strategy" }),
    now,
  })
  const recent = calculateMemoryInfluenceWeight({
    memory: memory({ updatedAt: "2026-05-01T00:00:00.000Z" }),
    signals,
    now,
  })
  const old = calculateMemoryInfluenceWeight({
    memory: memory({ updatedAt: "2025-08-01T00:00:00.000Z" }),
    signals,
    now,
  })
  assert.ok(old.memoryInfluenceWeight <= recent.memoryInfluenceWeight)
  assert.ok(old.reasons.some((reason) => reason.includes("antiga") || reason.includes("envelhecida")))
}

{
  const signals = extractOperationalMemorySignals({
    companyId,
    snapshot: snapshot(),
    operationalContext: operationalContext({ reasoningMode: "pricing_strategy" }),
    now,
  })
  const weak = calculateMemoryInfluenceWeight({
    memory: memory({ usageCount: 1, confidence: 0.46 }),
    signals,
    now,
  })
  const recurrent = calculateMemoryInfluenceWeight({
    memory: memory({ usageCount: 6, confidence: 0.46 }),
    signals,
    now,
  })
  assert.ok(recurrent.memoryInfluenceWeight >= weak.memoryInfluenceWeight)
  assert.ok(recurrent.reasons.some((reason) => reason.includes("recorrente")))
}

{
  const context = applyMemoryToOrionContext({
    companyId,
    snapshot: snapshot({ leadsWithoutFollowUp: 4 }),
    operationalContext: operationalContext({
      intentRoute: {
        intent: "new_campaign_request",
        missionContextPolicy: "rebuild",
        useMissionContext: false,
        ignoreMissionContext: false,
        rebuildMissionContext: true,
        reason: "Pedido de campanha.",
        confidence: 0.88,
      },
      reasoningMode: "marketing_execution",
    }),
    execution: execution({
      trafficPlan: {
        budgetDaily: 60,
        durationDays: 3,
        totalBudget: 180,
        qualifiedConversationTarget: 12,
        maxCpl: 8,
        maxCac: 40,
        channel: "Meta Ads",
        campaignType: "Mensagens",
        pauseIf: "Pausar sem conversa.",
        scaleIf: "Escalar com conversa.",
        expectedSales: 1,
        calculationBasis: [],
      },
    }),
    now,
  })
  assert.equal(context.businessPersonalityProfile.executionCapacity, "low")
  assert.ok(context.businessPersonalityProfile.knownBottlenecks.some((item) => item.includes("Atendimento")))
  assert.equal(context.memoryGuardrails.avoidAutomaticCampaignCta, true)
}

{
  const context = applyMemoryToOrionContext({
    companyId,
    snapshot: snapshot({ inventoryPressure: "high", stuckStockCount: 2 }),
    operationalContext: operationalContext({
      intentRoute: {
        intent: "inventory_analysis",
        missionContextPolicy: "ignore",
        useMissionContext: false,
        ignoreMissionContext: true,
        rebuildMissionContext: false,
        reason: "Analise de estoque.",
        confidence: 0.9,
      },
      reasoningMode: "inventory_liquidity",
    }),
    execution: execution({
      products: [{
        id: "p1",
        name: "iPhone premium",
        quantity: 1,
        price: 8000,
        cost: 6500,
        profit: 1500,
        marginPct: 18,
        daysInStock: 48,
        status: "active",
        role: "premium",
        reason: "Ticket alto.",
        conversionSpeed: "baixa",
      }],
    }),
    now,
  })
  assert.ok(context.relevantOperationalMemories.some((item) => item.memory.id === "seed-premium-not-fast-liquidity"))
  assert.ok(context.businessPersonalityProfile.strategicWarnings.some((warning) => warning.includes("premium")))
}

{
  const context = applyMemoryToOrionContext({
    companyId,
    snapshot: snapshot(),
    operationalContext: operationalContext(),
    now,
  })
  assert.equal(context.memoryGuardrails.avoidAutomaticCampaignCta, true)
  assert.ok(context.memoryGuardrails.forbidTechnicalTerms.includes("memoryInfluenceWeight"))
  assert.ok(context.memoryGuardrails.forbidTechnicalTerms.includes("safe withdrawal"))
  assert.ok(context.memoryGuardrails.recommendedSections.includes("Decisão recomendada"))
}

{
  const selected = selectRelevantOperationalMemories({
    companyId,
    snapshot: snapshot(),
    operationalContext: operationalContext({ reasoningMode: "pricing_strategy" }),
    memories: [
      memory({ id: "contradicted-memory", status: "contradicted" }),
      memory({ id: "active-memory", status: "active" }),
    ],
    now,
  })
  assert.ok(selected.some((item) => item.memory.id === "active-memory"))
  assert.ok(!selected.some((item) => item.memory.id === "contradicted-memory"))
}

console.log("operational-memory tests passed")
