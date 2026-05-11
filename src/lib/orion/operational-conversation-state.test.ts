import assert from "node:assert/strict"
import { buildOrionIntentDebug } from "./chat-context"
import { normalizeCommercialLabel } from "./commercial-label"
import { extractOperationalGoal } from "./goal-extractor"
import { classifyOrionIntent } from "./intent-router"
import { buildOperationalPlan } from "./operational-planning-engine"
import { buildOperationalConversationState, extractExplicitProductName } from "./operational-conversation-state"
import { isExecutionReasoningMode, selectReasoningMode } from "./reasoning-mode-selector"
import { buildOperationalExecutionAnswer, shouldUseOperationalExecutionAnswer } from "./strategic-copilot"
import type { CommercialSubjectResolution } from "./commercial-subject-resolver"
import type { OrionCommercialSubjectMatchSummary, OrionCommercialSubjectSummary, OrionExecutionPayload, OrionOperationalContext, OrionSnapshot } from "./types"

const execution = {
  objective: {
    title: "Execução comercial",
    diagnosis: "Teste",
    targetProfit: null,
    maxPossibleProfit: 7000,
    gap: 0,
    operationalTarget: {
      targetAmount: null,
      source: "no_active_target",
      label: "Meta operacional",
      explanation: "Sem meta operacional ativa no contexto atual.",
    },
    gapToOperationalTarget: {
      amount: null,
      label: "Sem meta ativa",
      tone: "neutral",
      explanation: "Sem meta ativa; nenhum gap deve ser calculado ou sinalizado como alerta.",
    },
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
      safeWithdrawalAmount: 3000,
      safeReinvestmentAmount: 1500,
      operationalSurplusAfterBills: 3000,
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
      id: "iphone-14",
      name: "iPhone 14 Lilás",
      quantity: 1,
      price: 3600,
      cost: 2700,
      profit: 900,
      marginPct: 25,
      daysInStock: 22,
      status: "active",
      role: "turnover",
      reason: "Produto corrigido",
      conversionSpeed: "alta",
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
      id: "iphone-14",
      name: "iPhone 14 Lilás",
      quantity: 1,
      price: 3600,
      cost: 2700,
      profit: 900,
      marginPct: 25,
      daysInStock: 22,
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
      id: "bundle-iphone-14",
      name: "Combo iPhone 14",
      tag: "Balanceado",
      promotionMode: "balanced",
      items: ["iPhone 14 Lilás", "Capa compatível", "Carregador USB-C"],
      addOns: [],
      productPrice: 3600,
      discount: 0,
      price: 3820,
      cost: 2780,
      profit: 1040,
      marginPct: 27.2,
      minimumSafePrice: 3300,
      safeProfitFloor: 650,
      promotionNote: "Pacote iPhone 14",
      goalUnits: 1,
      projectedProfit: 1040,
      objective: "Vender iPhone 14 com acessórios compatíveis.",
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
  realProfitability: {
    averageOperationalMarginPct: 18,
    profitabilityLevel: "healthy",
    negativeSalesCount: 0,
    lowMarginSalesCount: 0,
    warrantyReserveAdvisoryCount: 0,
  },
  protectedCapital: 5000,
  availableProfit: 3000,
  inventoryPressure: "low",
  lowMarginWarnings: [],
} as OrionExecutionPayload

const snapshot = {
  executive: {
    liquidityForecast: {
      nextPayables: [],
    },
  },
} as unknown as OrionSnapshot

function subjectMatch(input: Partial<OrionCommercialSubjectMatchSummary> & {
  inventoryId: string
  productName: string
  productType: string
}): OrionCommercialSubjectMatchSummary {
  const entityType = input.entityType || (input.productType === "accessory" ? "accessory" : input.productType === "service" ? "service" : input.productType === "warranty" ? "addon" : input.productType === "bundle" ? "bundle" : "device")
  return {
    category: input.category || null,
    productFamily: input.productFamily || input.model || input.category || null,
    model: input.model || input.productFamily || null,
    variation: input.variation || null,
    color: input.color || input.variation || null,
    compatibilityFamily: input.compatibilityFamily || input.category || null,
    quantity: input.quantity ?? 1,
    price: input.price ?? 0,
    cost: input.cost ?? 0,
    marginPct: input.marginPct ?? 0,
    daysInStock: input.daysInStock ?? 0,
    status: input.status || "active",
    entityRole: input.entityRole || "primary",
    entityType,
    entityPriorityWeight: input.entityPriorityWeight ?? (entityType === "device" ? 100 : entityType === "accessory" ? 40 : 20),
    score: input.score ?? 90,
    finalScore: input.finalScore ?? input.score ?? 90,
    reason: input.reason || "match",
    ...input,
  }
}

function subjectSummary(input: Omit<Partial<OrionCommercialSubjectSummary>, "matches"> & {
  matches: OrionCommercialSubjectMatchSummary[]
}): OrionCommercialSubjectSummary {
  const primarySubject = input.primarySubject || input.matches.find((match) => match.entityRole === "primary") || input.matches[0] || null
  return {
    subjectType: input.subjectType || (input.matches.length > 1 ? "multi_inventory_match" : "single_inventory_item"),
    category: input.category ?? primarySubject?.category ?? null,
    productFamily: input.productFamily ?? primarySubject?.productFamily ?? null,
    model: input.model ?? primarySubject?.model ?? null,
    variation: input.variation ?? primarySubject?.variation ?? null,
    compatibilityFamily: input.compatibilityFamily ?? primarySubject?.compatibilityFamily ?? null,
    ambiguity: input.ambiguity ?? null,
    needsClarification: input.needsClarification ?? false,
    confidence: input.confidence ?? 0.9,
    reason: input.reason || "Teste: assunto resolvido pelo estoque.",
    primarySubject,
    relatedProducts: input.relatedProducts || input.matches.filter((match) => match.entityRole === "related"),
    compatibleAccessories: input.compatibleAccessories || input.matches.filter((match) => match.entityRole === "compatible_accessory"),
    bundleCandidates: input.bundleCandidates || (primarySubject ? [{
      primary: primarySubject,
      accessories: input.matches.filter((match) => match.entityRole === "compatible_accessory"),
      reason: "bundle candidato",
    }] : []),
    secondarySuggestions: input.secondarySuggestions || input.matches.filter((match) => match.entityRole === "secondary_suggestion"),
    matches: input.matches,
  }
}

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
  intentRoute: classifyOrionIntent({
    message: "Qual menor valor posso cobrar?",
    previousState: iphoneState,
  }),
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

const correctedSubject = subjectSummary({
  matches: [subjectMatch({
    inventoryId: "iphone-14",
    productName: "iPhone 14 Lilás",
    category: "iPhone",
    productFamily: "iPhone 14",
    model: "iPhone 14",
    variation: "Lilás",
    compatibilityFamily: "iPhone",
    quantity: 1,
    price: 3600,
    cost: 2700,
    marginPct: 25,
    daysInStock: 22,
    status: "active",
    productType: "device",
    reason: "match exato",
  })],
})

const correctedResolverSubject: CommercialSubjectResolution = {
  ...correctedSubject,
}

const iphone16Subject: CommercialSubjectResolution = {
  ...subjectSummary({
    confidence: 0.93,
    reason: "Teste: iPhone 16 resolvido pelo banco.",
    matches: [subjectMatch({
    inventoryId: "iphone-16-pro-max",
    productName: "iPhone 16 Pro Max Natural Titanium",
    category: "iPhone",
    productFamily: "iPhone 16 Pro Max",
    model: "iPhone 16 Pro Max",
    variation: "Natural Titanium",
    compatibilityFamily: "iPhone",
    quantity: 1,
    price: 7900,
    cost: 6400,
    marginPct: 19,
    daysInStock: 9,
    status: "active",
    productType: "device",
    score: 98,
    reason: "match exato",
    })],
  }),
}

const accessoryCategorySubject: CommercialSubjectResolution = {
  ...subjectSummary({
    subjectType: "category",
    category: "Acessórios",
    productFamily: null,
    model: null,
    variation: null,
    compatibilityFamily: "Acessórios",
    confidence: 0.88,
    reason: "Teste: categoria resolvida pelo banco.",
    matches: [subjectMatch({
    inventoryId: "fonte-15w",
    productName: "Fonte 15W USB-C",
    category: "Acessórios",
    productFamily: "Fonte 15W",
    model: "Fonte 15W",
    variation: "USB-C",
    compatibilityFamily: "iPhone",
    quantity: 4,
    price: 149,
    cost: 65,
    marginPct: 56.4,
    daysInStock: 31,
    status: "active",
    productType: "accessory",
    entityRole: "compatible_accessory",
    score: 91,
    reason: "categoria acessórios",
    })],
  }),
}

const iphone16Route = classifyOrionIntent({
  message: "Preciso estruturar campanha para iPhone 16 Pro Max",
  commercialSubject: iphone16Subject,
})

assert.ok(iphone16Route.intent === "marketing_execution" || iphone16Route.intent === "new_campaign_request")
assert.ok(iphone16Route.missionContextPolicy === "rebuild" || iphone16Route.missionContextPolicy === "switch")

const iphone16State = buildOperationalConversationState({
  question: "Preciso estruturar campanha para iPhone 16 Pro Max",
  execution,
  snapshot,
  intentRoute: iphone16Route,
  commercialSubject: subjectSummary({
    confidence: 0.93,
    reason: "Teste: iPhone 16 resolvido pelo banco.",
    matches: [subjectMatch({
      inventoryId: "iphone-16-pro-max",
      productName: "iPhone 16 Pro Max Natural Titanium",
      category: "iPhone",
      productFamily: "iPhone 16 Pro Max",
      model: "iPhone 16 Pro Max",
      variation: "Natural Titanium",
      compatibilityFamily: "iPhone",
      quantity: 1,
      price: 7900,
      cost: 6400,
      marginPct: 19,
      daysInStock: 9,
      status: "active",
      productType: "device",
      reason: "match exato",
    })],
  }),
})

assert.equal(iphone16State.activeMissionContext?.product?.name, "iPhone 16 Pro Max Natural Titanium")
assert.ok(!/ipad/i.test(iphone16State.activeMissionContext?.offer?.bundleName || ""))

const productSwitchRoute = classifyOrionIntent({
  message: "não é o iPad 11, é o iPhone 14",
  previousState: ipadState,
  commercialSubject: correctedResolverSubject,
})

assert.equal(productSwitchRoute.intent, "product_switch")
assert.equal(productSwitchRoute.missionContextPolicy, "switch")

const correctedIphoneState = buildOperationalConversationState({
  previousState: ipadState,
  question: "não é o iPad 11, é o iPhone 14",
  execution,
  snapshot,
  intentRoute: productSwitchRoute,
  commercialSubject: correctedSubject,
})

assert.equal(correctedIphoneState.activeMissionContext?.product?.name, "iPhone 14 Lilás")
assert.equal(correctedIphoneState.activeMissionContext?.offer?.bundleName, "Combo iPhone 14")
assert.ok(!/ipad/i.test(correctedIphoneState.activeOffer || ""))

const marginRoute = classifyOrionIntent({
  message: "Qual é a minha margem de promoção?",
  previousState: correctedIphoneState,
})

assert.equal(marginRoute.intent, "pricing_refinement")
assert.equal(marginRoute.missionContextPolicy, "use")

const marginState = buildOperationalConversationState({
  previousState: correctedIphoneState,
  question: "Qual é a minha margem de promoção?",
  execution,
  snapshot,
  intentRoute: marginRoute,
})

assert.equal(marginState.activeMissionContext?.product?.name, "iPhone 14 Lilás")
assert.equal(marginState.operationalIntent, "pricing_refinement")
assert.equal(shouldUseOperationalExecutionAnswer(marginState), true)

const tightValueRoute = classifyOrionIntent({
  message: "quero dar uma apertada no valor sem matar margem",
  previousState: marginState,
})

assert.equal(tightValueRoute.intent, "pricing_refinement")
assert.equal(tightValueRoute.missionContextPolicy, "use")

const premiumCopyRoute = classifyOrionIntent({
  message: "faz uma versão mais premium da copy",
  previousState: marginState,
})

assert.ok(premiumCopyRoute.intent === "marketing_execution" || premiumCopyRoute.intent === "offer_refinement")
assert.equal(premiumCopyRoute.missionContextPolicy, "use")

const financeRoute = classifyOrionIntent({
  message: "Como está a saúde financeira da minha empresa?",
  previousState: marginState,
})

assert.equal(financeRoute.intent, "financial_analysis")
assert.equal(financeRoute.missionContextPolicy, "ignore")

const financeState = buildOperationalConversationState({
  previousState: marginState,
  question: "Como está a saúde financeira da minha empresa?",
  execution,
  snapshot,
  intentRoute: financeRoute,
})

assert.equal(financeState.activeMissionContext, null)
assert.equal(shouldUseOperationalExecutionAnswer(financeState), false)

const backToCampaignRoute = classifyOrionIntent({
  message: "Agora volta para a campanha do iPhone 14",
  previousState: marginState,
  commercialSubject: correctedResolverSubject,
})

assert.equal(backToCampaignRoute.intent, "marketing_execution")
assert.equal(backToCampaignRoute.missionContextPolicy, "use")

const accessoriesRoute = classifyOrionIntent({
  message: "quero vender acessórios",
  commercialSubject: accessoryCategorySubject,
})

assert.ok(accessoriesRoute.intent === "marketing_execution" || accessoriesRoute.intent === "new_campaign_request")
assert.equal(accessoriesRoute.missionContextPolicy, "rebuild")

const accessoriesState = buildOperationalConversationState({
  previousState: marginState,
  question: "quero vender acessórios",
  execution,
  snapshot,
  intentRoute: accessoriesRoute,
  commercialSubject: subjectSummary({
    subjectType: "category",
    category: "Acessórios",
    productFamily: null,
    model: null,
    variation: null,
    compatibilityFamily: "Acessórios",
    ambiguity: null,
    needsClarification: false,
    confidence: 0.88,
    reason: "Teste: categoria resolvida pelo banco.",
    matches: [subjectMatch({
      inventoryId: "fonte-15w",
      productName: "Fonte 15W USB-C",
      category: "Acessórios",
      productFamily: "Fonte 15W",
      model: "Fonte 15W",
      variation: "USB-C",
      compatibilityFamily: "iPhone",
      quantity: 4,
      price: 149,
      cost: 65,
      marginPct: 56.4,
      daysInStock: 31,
      status: "active",
      productType: "accessory",
      entityRole: "compatible_accessory",
      reason: "categoria acessórios",
    })],
  }),
})

assert.equal(accessoriesState.activeMissionContext?.product?.name, "Acessórios")
assert.ok(!/ipad/i.test(accessoriesState.activeMissionContext?.offer?.items.join(" ") || ""))

const multiIphone14Subject = subjectSummary({
  subjectType: "multi_inventory_match",
  category: "iPhone",
  productFamily: "iPhone 14",
  model: "iPhone 14",
  variation: null,
  compatibilityFamily: "iPhone",
  ambiguity: "Encontrei 2 itens compatíveis no estoque operacional.",
  needsClarification: true,
  confidence: 0.9,
  reason: "Teste: múltiplas variações no banco.",
  matches: [
    subjectMatch({
      inventoryId: "iphone-14-lilas",
      productName: "iPhone 14 Lilás",
      category: "iPhone",
      productFamily: "iPhone 14",
      model: "iPhone 14",
      variation: "Lilás",
      compatibilityFamily: "iPhone",
      quantity: 1,
      price: 3600,
      cost: 2700,
      marginPct: 25,
      daysInStock: 22,
      status: "active",
      productType: "device",
      entityRole: "primary",
      reason: "match",
    }),
    subjectMatch({
      inventoryId: "iphone-14-preto",
      productName: "iPhone 14 Preto",
      category: "iPhone",
      productFamily: "iPhone 14",
      model: "iPhone 14",
      variation: "Preto",
      compatibilityFamily: "iPhone",
      quantity: 1,
      price: 3550,
      cost: 2680,
      marginPct: 24.5,
      daysInStock: 18,
      status: "active",
      productType: "device",
      entityRole: "related",
      reason: "match",
    }),
  ],
})

const multiState = buildOperationalConversationState({
  question: "Preciso estruturar campanha para iPhone 14",
  execution,
  snapshot,
  intentRoute: classifyOrionIntent({
    message: "Preciso estruturar campanha para iPhone 14",
    commercialSubject: {
      ...multiIphone14Subject,
      matches: multiIphone14Subject.matches.map((match) => ({
        ...match,
        category: "iPhone",
        productFamily: "iPhone 14",
        model: "iPhone 14",
        compatibilityFamily: "iPhone",
        score: 95,
      })),
    },
  }),
  commercialSubject: multiIphone14Subject,
})

const multiAnswer = buildOperationalExecutionAnswer({
  question: "Preciso estruturar campanha para iPhone 14",
  snapshot,
  execution,
  conversationState: multiState,
})

assert.match(multiAnswer, /Lilás.*Preto|Preto.*Lilás/)
assert.match(multiAnswer, /conjunta ou separada/)
assert.ok(!/iPad 11/.test(multiAnswer))

const debug = buildOrionIntentDebug({
  userMessage: "Preciso estruturar campanha para iPhone 14",
  commercialSubject: multiIphone14Subject,
  intentRoute: multiState.intentRoute,
  missionContextPolicy: multiState.intentRoute?.missionContextPolicy,
  chatProduct: "iPhone 14",
  boardProduct: execution.priorityAction?.product?.name,
})

assert.equal(debug.chatProduct, "iPhone 14")
assert.equal(debug.boardProduct, "iPad 11 Prateado")
assert.equal(debug.boardOverrideByUserSubject, true)

const iphone14LilasWithAccessory = subjectSummary({
  subjectType: "single_inventory_item",
  category: "iPhone",
  productFamily: "iPhone 14",
  model: "iPhone 14",
  variation: "Lilás",
  compatibilityFamily: "iPhone",
  matches: [
    subjectMatch({
      inventoryId: "iphone-14-lilas",
      productName: "iPhone 14 Lilás",
      category: "iPhone",
      productFamily: "iPhone 14",
      model: "iPhone 14",
      variation: "Lilás",
      color: "Lilás",
      compatibilityFamily: "iPhone",
      quantity: 1,
      price: 3600,
      cost: 2700,
      marginPct: 25,
      daysInStock: 22,
      status: "active",
      productType: "device",
      entityRole: "primary",
      reason: "família de device citada explicitamente",
    }),
    subjectMatch({
      inventoryId: "capa-iphone-14-lilas",
      productName: "Capa iPhone 14 Lilás",
      category: "Acessórios",
      productFamily: "Capa iPhone 14",
      model: "Capa iPhone 14",
      variation: "Lilás",
      color: "Lilás",
      compatibilityFamily: "iPhone",
      quantity: 3,
      price: 99,
      cost: 32,
      marginPct: 67.6,
      daysInStock: 12,
      status: "active",
      productType: "accessory",
      entityRole: "compatible_accessory",
      reason: "acessório compatível, não produto principal",
    }),
  ],
})

const iphone14LilasState = buildOperationalConversationState({
  previousState: ipadState,
  question: "Quero o iPhone 14 Lilás",
  execution,
  snapshot,
  intentRoute: classifyOrionIntent({
    message: "Quero o iPhone 14 Lilás",
    previousState: ipadState,
    commercialSubject: iphone14LilasWithAccessory,
  }),
  commercialSubject: iphone14LilasWithAccessory,
})

assert.equal(iphone14LilasWithAccessory.primarySubject?.productName, "iPhone 14 Lilás")
assert.equal(iphone14LilasWithAccessory.primarySubject?.variation, "Lilás")
assert.equal(iphone14LilasWithAccessory.compatibleAccessories[0]?.productName, "Capa iPhone 14 Lilás")
assert.equal(iphone14LilasState.activeMissionContext?.product?.name, "iPhone 14 Lilás")
assert.ok(!/^Capa/i.test(iphone14LilasState.activeMissionContext?.product?.name || ""))

const peliculaForIphoneSubject = subjectSummary({
  subjectType: "accessory",
  category: "Acessórios",
  productFamily: "Película",
  model: "Película",
  variation: "iPhone",
  compatibilityFamily: "iPhone",
  matches: [subjectMatch({
    inventoryId: "pelicula-iphone",
    productName: "Película para iPhone",
    category: "Acessórios",
    productFamily: "Película",
    model: "Película",
    variation: "iPhone",
    compatibilityFamily: "iPhone",
    quantity: 10,
    price: 59,
    cost: 12,
    marginPct: 79.7,
    daysInStock: 8,
    status: "active",
    productType: "accessory",
    entityRole: "primary",
  })],
})

assert.equal(peliculaForIphoneSubject.primarySubject?.entityType, "accessory")
assert.equal(peliculaForIphoneSubject.primarySubject?.productName, "Película para iPhone")
assert.equal(peliculaForIphoneSubject.compatibilityFamily, "iPhone")

const iphone16JointSubject = subjectSummary({
  subjectType: "single_inventory_item",
  category: "iPhone",
  productFamily: "iPhone 16 Pro Max",
  model: "iPhone 16 Pro Max",
  variation: "Natural Titanium",
  compatibilityFamily: "iPhone",
  matches: [
    subjectMatch({
      inventoryId: "iphone-16-pro-max",
      productName: "iPhone 16 Pro Max Natural Titanium",
      category: "iPhone",
      productFamily: "iPhone 16 Pro Max",
      model: "iPhone 16 Pro Max",
      variation: "Natural Titanium",
      compatibilityFamily: "iPhone",
      price: 7900,
      cost: 6400,
      productType: "device",
      entityRole: "primary",
    }),
    subjectMatch({
      inventoryId: "carregador-35w",
      productName: "Carregador 35W USB-C",
      category: "Acessórios",
      productFamily: "Carregador 35W",
      model: "Carregador 35W",
      variation: "USB-C",
      compatibilityFamily: "iPhone",
      price: 249,
      cost: 95,
      productType: "accessory",
      entityRole: "compatible_accessory",
    }),
  ],
})

const iphone16JointState = buildOperationalConversationState({
  question: "Campanha para iPhone 16 Pro Max",
  execution,
  snapshot,
  intentRoute: classifyOrionIntent({
    message: "Campanha para iPhone 16 Pro Max",
    commercialSubject: iphone16JointSubject,
  }),
  commercialSubject: iphone16JointSubject,
})

const jointContinuationRoute = classifyOrionIntent({
  message: "campanha conjunta",
  previousState: iphone16JointState,
})
const jointContinuationState = buildOperationalConversationState({
  previousState: iphone16JointState,
  question: "campanha conjunta",
  execution,
  snapshot,
  intentRoute: jointContinuationRoute,
  commercialSubject: subjectSummary({
    subjectType: "unknown",
    confidence: 0,
    matches: [],
  }),
})
const jointAnswer = buildOperationalExecutionAnswer({
  question: "campanha conjunta",
  snapshot,
  execution,
  conversationState: jointContinuationState,
})

assert.equal(jointContinuationState.activeMissionContext?.product?.name, "iPhone 16 Pro Max Natural Titanium")
assert.ok(jointContinuationState.activeMissionContext?.offer?.items.includes("Carregador 35W USB-C"))
assert.match(jointAnswer, /iPhone 16 Pro Max/)
assert.doesNotMatch(jointAnswer, /Caneta Stylus|Capa iPhone 14 Lilás/)

const charger35wSubject = subjectSummary({
  subjectType: "accessory",
  category: "Acessórios",
  productFamily: "Carregador 35W",
  model: "Carregador 35W",
  variation: "USB-C",
  compatibilityFamily: "iPhone",
  matches: [subjectMatch({
    inventoryId: "carregador-35w",
    productName: "Carregador 35W USB-C",
    category: "Acessórios",
    productFamily: "Carregador 35W",
    model: "Carregador 35W",
    variation: "USB-C",
    compatibilityFamily: "iPhone",
    quantity: 4,
    price: 249,
    cost: 95,
    status: "active",
    productType: "accessory",
    entityRole: "primary",
  })],
})

assert.equal(charger35wSubject.primarySubject?.productName, "Carregador 35W USB-C")
assert.equal(charger35wSubject.primarySubject?.entityType, "accessory")

const planningOperationalContext = {
  intent: "financial_goal_execution",
  toolsUsed: ["inventory_tool", "pricing_tool", "financial_tool", "cashflow_tool"],
  label: "Dados específicos do sistema",
  dataStatus: "specific_data_found",
  matchedRecords: 3,
  summary: "contexto de planejamento",
  answer: "dados internos",
  evidence: [],
  gaps: [],
  contexts: {
    inventory: {
      products: [
        {
          id: "iphone-14-lilas",
          name: "iPhone 14 Roxo Roxo",
          status: "active",
          color: "Roxo",
          capacity: null,
          grade: null,
          condition: null,
          category: "iPhone",
          productType: "device",
          purchasePrice: 2700,
          suggestedPrice: 3600,
          marginPct: 25,
          daysInStock: 22,
          origin: "own",
          type: "own",
          quantity: 1,
          minimumSafePrice: 3300,
          maxSafeDiscount: 300,
          matchScore: 95,
          matchReason: "produto citado",
        },
        {
          id: "ipad-11-prateado",
          name: "iPad Prateado Prateado",
          status: "active",
          color: "Prateado",
          capacity: null,
          grade: null,
          condition: null,
          category: "iPad",
          productType: "device",
          purchasePrice: 2900,
          suggestedPrice: 3900,
          marginPct: 25.6,
          daysInStock: 18,
          origin: "own",
          type: "own",
          quantity: 1,
          minimumSafePrice: 3700,
          maxSafeDiscount: 200,
          matchScore: 80,
          matchReason: "alternativa",
        },
        {
          id: "carregador-usbc",
          name: "Carregador USB-C",
          status: "active",
          color: null,
          capacity: null,
          grade: null,
          condition: null,
          category: "Acessórios",
          productType: "accessory",
          purchasePrice: 70,
          suggestedPrice: 169,
          marginPct: 58.5,
          daysInStock: 11,
          origin: "own",
          type: "own",
          quantity: 3,
          minimumSafePrice: 129,
          maxSafeDiscount: 40,
          matchScore: 70,
          matchReason: "complemento",
        },
      ],
    },
  },
} satisfies OrionOperationalContext

const profitGoal = extractOperationalGoal({ message: "Como lucrar R$600 em 7 dias?" })
assert.equal(profitGoal.goalType, "profit_target")
assert.equal(profitGoal.targetProfit, 600)
assert.equal(profitGoal.horizonDays, 7)
const profitMode = selectReasoningMode({ goal: profitGoal, intentRoute: classifyOrionIntent({ message: "Como lucrar R$600 em 7 dias?" }) })
assert.equal(profitMode, "goal_planning")
const profitPlan = buildOperationalPlan({
  snapshot,
  operationalContext: planningOperationalContext,
  goal: profitGoal,
  reasoningMode: profitMode,
})
assert.equal(profitPlan.executionAllowed, false)
assert.doesNotMatch(profitPlan.response, /^Campanha:|Headline:|Copy:/m)
assert.match(profitPlan.response, /Mix sugerido/)

const planState = buildOperationalConversationState({
  question: "Como lucrar R$600 em 7 dias?",
  execution,
  snapshot,
  operationalContext: planningOperationalContext,
  operationalGoal: profitGoal,
  reasoningMode: profitMode,
  operationalPlan: profitPlan,
})
assert.equal(planState.activeGoal?.targetProfit, 600)
assert.equal(planState.activeReasoningMode, "goal_planning")
assert.equal(shouldUseOperationalExecutionAnswer(planState), false)

const validationGoal = extractOperationalGoal({
  message: "Isso gera R$600 líquidos?",
  previousState: planState,
})
assert.equal(validationGoal.goalType, "pricing_validation")
assert.equal(validationGoal.directQuestion, true)
const validationMode = selectReasoningMode({ goal: validationGoal, intentRoute: classifyOrionIntent({ message: "Isso gera R$600 líquidos?", previousState: planState }) })
assert.equal(validationMode, "financial_decision")
const validationPlan = buildOperationalPlan({
  snapshot,
  operationalContext: planningOperationalContext,
  missionContext: planState.activeMissionContext,
  goal: validationGoal,
  reasoningMode: validationMode,
})
assert.match(validationPlan.response, /^(Sim|Não|Provavelmente)\./)
assert.equal(validationPlan.executionAllowed, false)
assert.doesNotMatch(validationPlan.response, /^Campanha:|Headline:|Copy:/m)

const strategyGoal = extractOperationalGoal({ message: "Quero estratégias pro iPhone 14" })
const strategyMode = selectReasoningMode({ goal: strategyGoal, intentRoute: classifyOrionIntent({ message: "Quero estratégias pro iPhone 14", commercialSubject: correctedResolverSubject }) })
assert.equal(strategyMode, "operational_diagnosis")
const strategyPlan = buildOperationalPlan({
  snapshot,
  operationalContext: planningOperationalContext,
  commercialSubject: correctedSubject,
  goal: strategyGoal,
  reasoningMode: strategyMode,
})
assert.equal(strategyPlan.executionAllowed, false)
assert.doesNotMatch(strategyPlan.response, /^Campanha:|Headline:|Copy:/m)

const campaignGoal = extractOperationalGoal({ message: "Agora cria a campanha" })
const campaignMode = selectReasoningMode({ goal: campaignGoal, intentRoute: classifyOrionIntent({ message: "Agora cria a campanha", previousState: planState }) })
assert.equal(campaignMode, "campaign_generation")
assert.equal(isExecutionReasoningMode(campaignMode), true)

assert.equal(normalizeCommercialLabel("iPhone 14 Roxo Roxo"), "iPhone 14 Roxo")
assert.equal(normalizeCommercialLabel("iPad Prateado Prateado"), "iPad Prateado")

console.log("ORION product resolution and goal planning tests passed")
