import assert from "node:assert/strict"
import { buildOperationalConversationState, extractExplicitProductName } from "./operational-conversation-state"
import type { OrionExecutionPayload, OrionSnapshot } from "./types"

const execution = {
  objective: {
    title: "Execução comercial",
    diagnosis: "Teste",
    targetProfit: null,
    maxPossibleProfit: 7000,
    gap: 0,
    deadlineLabel: null,
    recommendedScenario: "balanced",
    financialGoal: {
      headline: "Estável",
      urgencyLevel: "stable",
      currentCash: 10000,
      grossCash: 10000,
      protectedWorkingCapital: 5000,
      liquidProfitAvailable: 3000,
      estimatedReceivableProfit: 0,
      payables30d: 0,
      receivables30d: 0,
      reserveTarget: 5000,
      requiredNewProfit: 0,
      projectedCashAfterCommitments: 10000,
      workingCapitalAfterPayables: 5000,
      profitBufferAfterPayables: 3000,
      replacementCapitalBasis: "Teste",
      nextDueLabel: null,
      nextDueDays: null,
      strategy: "Preservar margem",
    },
  },
  priorityAction: {
    product: {
      id: "ipad-11",
      name: "iPad 11 Prateado",
      quantity: 1,
      price: 3900,
      cost: 2900,
      profit: 1000,
      marginPct: 25.6,
      daysInStock: 18,
      status: "active",
      role: "anchor",
      reason: "Prioridade antiga",
      conversionSpeed: "media",
    },
    price: 3900,
    profit: 1000,
    urgency: "normal",
    salesArgument: "iPad com pacote",
    cta: "Chama no WhatsApp para reservar o iPad 11 hoje.",
    bundleName: "Combo iPad 11",
    risk: "Não descontar cedo",
    expectedReturn: 1000,
  },
  products: [
    {
      id: "ipad-11",
      name: "iPad 11 Prateado",
      quantity: 1,
      price: 3900,
      cost: 2900,
      profit: 1000,
      marginPct: 25.6,
      daysInStock: 18,
      status: "active",
      role: "anchor",
      reason: "Produto antigo",
      conversionSpeed: "media",
    },
    {
      id: "iphone-16-pro-max",
      name: "iPhone 16 Pro Max Natural Titanium",
      quantity: 1,
      price: 7900,
      cost: 6400,
      profit: 1500,
      marginPct: 19,
      daysInStock: 9,
      status: "active",
      role: "premium",
      reason: "Produto citado",
      conversionSpeed: "media",
    },
  ],
  inventory: [
    {
      id: "ipad-11",
      name: "iPad 11 Prateado",
      quantity: 1,
      price: 3900,
      cost: 2900,
      profit: 1000,
      marginPct: 25.6,
      daysInStock: 18,
      status: "active",
    },
    {
      id: "iphone-16-pro-max",
      name: "iPhone 16 Pro Max Natural Titanium",
      quantity: 1,
      price: 7900,
      cost: 6400,
      profit: 1500,
      marginPct: 19,
      daysInStock: 9,
      status: "active",
    },
  ],
  bundles: [
    {
      id: "bundle-ipad",
      name: "Combo iPad 11",
      tag: "Balanceado",
      promotionMode: "balanced",
      items: ["iPad 11 Prateado", "Película iPad", "Caneta compatível iPad"],
      addOns: [],
      productPrice: 3900,
      discount: 0,
      price: 4200,
      cost: 3000,
      profit: 1200,
      marginPct: 28.5,
      minimumSafePrice: 3700,
      safeProfitFloor: 700,
      promotionNote: "Pacote iPad",
      goalUnits: 1,
      projectedProfit: 1200,
      objective: "Vender iPad com acessórios compatíveis.",
    },
    {
      id: "bundle-iphone",
      name: "Combo iPhone 16 Pro Max",
      tag: "Balanceado",
      promotionMode: "balanced",
      items: ["iPhone 16 Pro Max Natural Titanium", "Capa iPhone", "Carregador USB-C"],
      addOns: [],
      productPrice: 7900,
      discount: 0,
      price: 8200,
      cost: 6500,
      profit: 1700,
      marginPct: 20.7,
      minimumSafePrice: 7600,
      safeProfitFloor: 1100,
      promotionNote: "Pacote iPhone",
      goalUnits: 1,
      projectedProfit: 1700,
      objective: "Vender iPhone com acessórios compatíveis.",
    },
  ],
  trafficPlan: {
    budgetDaily: 50,
    durationDays: 3,
    totalBudget: 150,
    qualifiedConversationTarget: 5,
    maxCpl: 10,
    maxCac: 150,
    channel: "Meta Ads",
    campaignType: "Conversas",
    pauseIf: "Pausar sem conversa qualificada",
    scaleIf: "Escalar com conversa qualificada",
    expectedSales: 1,
    calculationBasis: ["Teste"],
  },
  whatsappPlan: {
    audience: "Base quente",
    firstApproach: "Tenho uma condição pronta para o iPad 11.",
    followUp: "Retomar",
    sla: "Responder rápido",
    closingTrigger: "Reserva",
    operationalOrder: ["WhatsApp"],
  },
  timeline72h: [],
  scenarios: [],
} as OrionExecutionPayload

const snapshot = {
  executive: {
    liquidityForecast: {
      nextPayables: [],
    },
  },
} as unknown as OrionSnapshot

assert.equal(extractExplicitProductName("Preciso estruturar uma campanha para o iPhone 16 Pro Max"), "iPhone 16 Pro Max")

const ipadState = buildOperationalConversationState({
  question: "Preciso estruturar uma campanha para o iPad 11",
  execution,
  snapshot,
})

assert.equal(ipadState.activeMissionContext?.product?.name, "iPad 11 Prateado")
assert.deepEqual(ipadState.activeMissionContext?.offer?.items, ["iPad 11 Prateado", "Película iPad", "Caneta compatível iPad"])

const iphoneState = buildOperationalConversationState({
  previousState: ipadState,
  question: "Preciso estruturar uma campanha para o iPhone 16 Pro Max",
  execution,
  snapshot,
})

assert.equal(iphoneState.activeMissionContext?.product?.name, "iPhone 16 Pro Max Natural Titanium")
assert.equal(iphoneState.activeMissionContext?.offer?.bundleName, "Combo iPhone 16 Pro Max")
assert.ok(iphoneState.activeMissionContext?.offer?.items.every((item) => !/ipad|caneta/i.test(item)))
assert.ok(!/ipad/i.test(iphoneState.activeOffer || ""))
assert.ok(!/ipad/i.test(iphoneState.activeCampaign || ""))

const iphoneRefinement = buildOperationalConversationState({
  previousState: iphoneState,
  question: "Qual menor valor posso cobrar?",
  execution,
  snapshot,
})

assert.equal(iphoneRefinement.operationalIntent, "pricing_refinement")
assert.equal(iphoneRefinement.activeMissionContext?.product?.name, "iPhone 16 Pro Max Natural Titanium")
assert.ok(iphoneRefinement.activeMissionContext?.offer?.items.every((item) => !/ipad|caneta/i.test(item)))

const newIpadState = buildOperationalConversationState({
  previousState: iphoneRefinement,
  question: "Agora cria uma campanha nova para o iPad 11",
  execution,
  snapshot,
})

assert.equal(newIpadState.activeMissionContext?.product?.name, "iPad 11 Prateado")
assert.equal(newIpadState.activeMissionContext?.offer?.bundleName, "Combo iPad 11")

console.log("ORION product resolution tests passed")
