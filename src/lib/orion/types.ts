import type { MoneyClassificationSnapshot } from "@/lib/financial/money-classification-engine"
import type { RealProfitSnapshot } from "@/lib/financial/real-profit-engine"
import type { WorkingCapitalSnapshot } from "@/lib/financial/working-capital-engine"
import type { FinancialScenarioSnapshot } from "@/lib/financial/financial-scenario-separation"
import type { InventoryLiquidityQuality } from "@/lib/financial/inventory-liquidity-quality"
import type { FinancialConfidenceBreakdown } from "@/lib/financial/financial-confidence-breakdown"
import type { ProfitAvailabilityPeriod, ProfitAvailabilitySnapshot } from "@/lib/financial/profit-availability-engine"
import type { CurrentCashCompositionSnapshot } from "@/lib/financial/current-cash-composition-engine"
import type { OwnerCapitalSnapshot } from "@/lib/financial/owner-capital-engine"
import type { OrionFinancialOperationalContext } from "@/lib/orion/financial-context-consumer"
import type { OrionAppliedOperationalMemoryContext } from "@/lib/orion/operational-memory"

export type OrionPriority = "low" | "medium" | "high" | "critical"

export type OrionInsight = {
  title: string
  category: string
  priority: OrionPriority
  insight: string
  evidence: string
  recommended_action: string
  expected_impact: string
  risk: string
  action_title: string
  action_summary: string
  action_priority: OrionPriority
  future_actionable: boolean
  confidence_score: number
}

export type OrionMetric = {
  label: string
  value: string
  delta?: string
  tone: "neutral" | "positive" | "warning" | "danger"
}

export type OrionChartPoint = {
  label: string
  value: number
  secondary?: number
  tertiary?: number
}

export type OrionChart = {
  title: string
  type: "line" | "bar" | "area" | "pie"
  metric: string
  insight: string
  data: OrionChartPoint[]
}

export type OrionExecutionProduct = {
  id: string
  name: string
  quantity: number
  price: number
  cost: number
  profit: number
  marginPct: number
  daysInStock: number
  status: string
  role: "premium" | "anchor" | "turnover" | "liquidity"
  reason: string
  conversionSpeed: "alta" | "media" | "baixa"
}

export type OrionExecutionBundle = {
  id: string
  name: string
  tag: string
  promotionMode: "conservative" | "balanced" | "aggressive"
  items: string[]
  addOns: Array<{
    name: string
    quantity: number
    price: number
    cost: number
  }>
  productPrice: number
  discount: number
  price: number
  cost: number
  profit: number
  marginPct: number
  minimumSafePrice: number
  safeProfitFloor: number
  promotionNote: string
  goalUnits: number
  projectedProfit: number
  objective: string
}

export type OrionExecutionTrafficPlan = {
  budgetDaily: number
  durationDays: number
  totalBudget: number
  qualifiedConversationTarget: number
  maxCpl: number
  maxCac: number
  channel: string
  campaignType: string
  pauseIf: string
  scaleIf: string
  expectedSales: number
  calculationBasis: string[]
}

export type OrionExecutionWhatsappPlan = {
  audience: string
  firstApproach: string
  followUp: string
  sla: string
  closingTrigger: string
  operationalOrder: string[]
}

export type OrionExecutionTimelineItem = {
  window: string
  action: string
  kpi: string
  expectedTarget: string
}

export type OrionExecutionScenario = {
  mode: "conservative" | "balanced" | "aggressive"
  title: string
  expectedProfit: number
  marginPct: number
  speed: string
  risk: string
  budgetDaily: number
  maxCac: number
  channel: string
  bundleName: string
  operationalEffort: string
}

export type OrionExecutionPayload = {
  objective: {
    title: string
    diagnosis: string
    targetProfit: number | null
    maxPossibleProfit: number
    gap: number
    operationalTarget: {
      targetAmount: number | null
      source: "explicit_user_goal" | "upcoming_bills" | "configured_target" | "no_active_target"
      label: string
      explanation: string
    }
    gapToOperationalTarget: {
      amount: number | null
      label: string
      tone: "neutral" | "green" | "red"
      explanation: string
    }
    deadlineLabel: string | null
    recommendedScenario: "conservative" | "balanced" | "aggressive"
    financialGoal: {
      headline: string
      urgencyLevel: "stable" | "attention" | "urgent"
      currentCash: number
      grossCash: number
      protectedWorkingCapital: number
      liquidProfitAvailable: number
      estimatedReceivableProfit: number
      payables30d: number
      receivables30d: number
      reserveTarget: number
      requiredNewProfit: number
      projectedCashAfterCommitments: number
      workingCapitalAfterPayables: number
      profitBufferAfterPayables: number
      safeWithdrawalAmount: number
      safeReinvestmentAmount: number
      operationalSurplusAfterBills: number
      replacementCapitalBasis: string
      nextDueLabel: string | null
      nextDueDays: number | null
      strategy: string
    }
  }
  priorityAction: {
    product: OrionExecutionProduct | null
    price: number
    profit: number
    urgency: string
    salesArgument: string
    cta: string
    bundleName: string | null
    risk: string
    expectedReturn: number
  } | null
  products: OrionExecutionProduct[]
  inventory: Array<{
    id: string
    name: string
    quantity: number
    price: number
    cost: number
    profit: number
    marginPct: number
    daysInStock: number
    status: string
  }>
  bundles: OrionExecutionBundle[]
  trafficPlan: OrionExecutionTrafficPlan | null
  whatsappPlan: OrionExecutionWhatsappPlan | null
  timeline72h: OrionExecutionTimelineItem[]
  scenarios: OrionExecutionScenario[]
  realProfitability: RealProfitSnapshot["realProfitability"]
  protectedCapital: number
  availableProfit: number
  inventoryPressure: RealProfitSnapshot["inventoryPressure"]
  lowMarginWarnings: string[]
}

export type OrionPriorityFocus = {
  title: string
  area: string
  priority: OrionPriority
  reason: string
  risk_if_ignored: string
  next_action: string
}

export type OrionActionPlanItem = {
  title: string
  area: string
  priority: OrionPriority
  reason: string
  expected_impact: string
  recommended_action: string
}

export type OrionChartInterpretation = {
  title: string
  metric: string
  interpretation: string
}

export type OrionBusinessIntent =
  | "financial_goal_execution"
  | "inventory_product_analysis"
  | "pricing_analysis"
  | "purchase_capacity_analysis"
  | "promotion_recommendation"
  | "cash_health_analysis"
  | "sales_profit_analysis"
  | "executive_business_overview"
  | "crm_follow_up_analysis"
  | "campaign_performance_analysis"
  | "general_question"

export type OrionBusinessToolName =
  | "inventory_tool"
  | "financial_tool"
  | "sales_tool"
  | "crm_tool"
  | "campaign_tool"
  | "dre_tool"
  | "cashflow_tool"
  | "pricing_tool"

export type OrionOperationalGoalType =
  | "profit_target"
  | "inventory_liquidity"
  | "inventory_rotation"
  | "margin_optimization"
  | "marketing_execution"
  | "content_generation"
  | "pricing_validation"
  | "operational_diagnosis"
  | "unknown"

export type OrionOperationalGoal = {
  goalType: OrionOperationalGoalType
  targetProfit: number | null
  horizonDays: number | null
  urgency: "low" | "medium" | "high"
  optimization: "liquidity" | "margin" | "liquidity_plus_margin" | "speed" | "execution" | "unknown"
  directQuestion: boolean
  needsExecution: boolean
  reason: string
}

export type OrionReasoningMode =
  | "financial_decision"
  | "withdrawal_safety"
  | "reinvestment_decision"
  | "working_capital_analysis"
  | "financial_health_analysis"
  | "goal_planning"
  | "inventory_liquidity"
  | "inventory_rotation"
  | "campaign_generation"
  | "marketing_execution"
  | "content_generation"
  | "pricing_strategy"
  | "operational_diagnosis"
  | "offer_optimization"

export type OrionExecutionGuardrails = {
  allowCampaignGeneration: boolean
  allowTrafficRecommendation: boolean
  allowProductMixGeneration: boolean
  allowCopyGeneration: boolean
  allowPricingExecution: boolean
  allowInventoryPush: boolean
  reason: string
}

export type OrionOperationalPlan = {
  directAnswer: "Sim" | "Não" | "Provavelmente" | null
  directAnswerReason: string
  feasibility: {
    status: "feasible" | "not_feasible" | "partial" | "unknown"
    targetProfit: number | null
    estimatedProfit: number
    conservativeProfit: number
    optimisticProfit: number
    horizonDays: number | null
  }
  recommendedPath: string
  productMix: Array<{
    inventoryId: string
    productName: string
    role: "primary" | "margin_addon" | "liquidity" | "backup"
    quantity: number
    unitProfit: number
    estimatedProfit: number
    marginPct: number
    daysInStock: number
    reason: string
  }>
  financialValidation: string
  risks: string[]
  nextActions: string[]
  executionAllowed: boolean
  response: string
}

export type OrionConversationIntent =
  | "global_business_question"
  | "mission_continuation"
  | "mission_refinement"
  | "pricing_refinement"
  | "offer_refinement"
  | "marketing_execution"
  | "financial_analysis"
  | "inventory_analysis"
  | "strategic_question"
  | "operational_question"
  | "new_campaign_request"
  | "product_switch"
  | "unrelated_question"

export type OrionMissionContextPolicy = "use" | "ignore" | "rebuild" | "switch"

export type OrionIntentRouteSummary = {
  intent: OrionConversationIntent
  missionContextPolicy: OrionMissionContextPolicy
  useMissionContext: boolean
  ignoreMissionContext: boolean
  rebuildMissionContext: boolean
  reason: string
  confidence: number
}

export type OrionCommercialEntityType = "device" | "accessory" | "addon" | "service" | "bundle" | "unknown"
export type OrionCommercialEntityRole = "primary" | "related" | "compatible_accessory" | "bundle_candidate" | "secondary_suggestion"

export type OrionCommercialSubjectMatchSummary = {
  inventoryId: string
  productName: string
  category: string | null
  productFamily: string | null
  model: string | null
  variation: string | null
  color: string | null
  compatibilityFamily: string | null
  quantity: number
  price: number
  cost: number
  marginPct: number
  daysInStock: number
  status: string
  productType: string | null
  entityType: OrionCommercialEntityType
  entityRole: OrionCommercialEntityRole
  entityPriorityWeight: number
  score: number
  finalScore: number
  reason: string
}

export type OrionCommercialSubjectSummary = {
  subjectType: "single_inventory_item" | "multi_inventory_match" | "category" | "accessory" | "bundle" | "unknown"
  category: string | null
  productFamily: string | null
  model: string | null
  variation: string | null
  compatibilityFamily: string | null
  ambiguity: string | null
  needsClarification: boolean
  confidence: number
  reason: string
  primarySubject: OrionCommercialSubjectMatchSummary | null
  relatedProducts: OrionCommercialSubjectMatchSummary[]
  compatibleAccessories: OrionCommercialSubjectMatchSummary[]
  bundleCandidates: Array<{
    primary: OrionCommercialSubjectMatchSummary
    accessories: OrionCommercialSubjectMatchSummary[]
    reason: string
  }>
  secondarySuggestions: OrionCommercialSubjectMatchSummary[]
  matches: OrionCommercialSubjectMatchSummary[]
}

export type OrionOperationalContext = {
  intent: OrionBusinessIntent
  toolsUsed: OrionBusinessToolName[]
  label: "Consulta operacional" | "Dados específicos do sistema"
  dataStatus: "specific_data_found" | "partial_data" | "insufficient_data"
  matchedRecords: number
  summary: string
  answer: string
  evidence: string[]
  gaps: string[]
  inventory_search_debug?: {
    query: string
    normalized_query: string
    filters_used: Record<string, unknown>
    total_candidates: number
    top_matches: Array<{
      id: string
      name: string
      status: string
      score: number
      reason: string
    }>
    selected_match: {
      id: string
      name: string
      status: string
      score: number
      reason: string
    } | null
  }
  contexts: Record<string, unknown>
  intentRoute?: OrionIntentRouteSummary
  commercialSubject?: OrionCommercialSubjectSummary
  operationalGoal?: OrionOperationalGoal
  reasoningMode?: OrionReasoningMode
  executionGuardrails?: OrionExecutionGuardrails
  operationalPlan?: OrionOperationalPlan
  operationalMemoryContext?: OrionAppliedOperationalMemoryContext | null
}

export type OrionExecutionMode =
  | "strategic_analysis"
  | "operational_decision"
  | "marketing_execution"
  | "sales_execution"
  | "lead_recovery"
  | "closing_mode"

export type OrionSelectedScenario = "conservative" | "balanced" | "aggressive"

export type OrionOperationalIntent =
  | "new_strategy"
  | "execution_continuation"
  | "offer_refinement"
  | "pricing_refinement"
  | "marketing_refinement"
  | "objection_handling"
  | "lead_recovery"
  | "closing_execution"
  | "traffic_optimization"
  | "campaign_iteration"
  | "operational_question"
  | "strategic_question"

export type OrionMissionContext = {
  product: {
    id: string
    name: string
    quantity: number
    price: number
    profit: number
    marginPct: number
    daysInStock: number
    role: OrionExecutionProduct["role"]
    minimumSafePrice: number | null
    conversionSpeed: OrionExecutionProduct["conversionSpeed"]
  } | null
  offer: {
    bundleName: string | null
    items: string[]
    currentOfferPrice: number | null
    expectedProfit: number | null
    minimumSafePrice: number | null
    safeProfitFloor: number | null
    discountLimit: number | null
    positioning: string | null
  } | null
  finance: {
    cashPosture: string
    liquidProfitAvailable: number
    protectedWorkingCapital: number
    nextPayableAmount: number | null
    nextPayableDueDate: string | null
    urgencyLevel: OrionExecutionPayload["objective"]["financialGoal"]["urgencyLevel"]
  }
  execution: {
    selectedScenario: OrionSelectedScenario | null
    selectedChannel: string | null
    activeTrafficDirection: string | null
    pauseRule: string | null
    scaleRule: string | null
    responseExpectation: string | null
    activeStrategy: string | null
  }
  constraints: {
    avoidDiscountBelow: number | null
    doNotUseProtectedCapital: boolean
    avoidWrongLeadCategory: boolean
    doNotRecommendUnavailableProducts: boolean
  }
  memorySignals: {
    lastCampaignResult: string | null
    knownBottleneck: string | null
    repeatedRisk: string | null
  }
}

export type OrionOperationalConversationState = {
  activeMission: string | null
  focusProduct: string | null
  selectedScenario: OrionSelectedScenario | null
  targetGoal: string | null
  deadline: string | null
  selectedChannel: string | null
  selectedOffer: string | null
  lastUserDecision: string | null
  nextExpectedStep: string | null
  executionMode: OrionExecutionMode | null
  currentMission: string | null
  currentProduct: string | null
  currentExecutionMode: OrionExecutionMode | null
  chosenOperationalPath: OrionSelectedScenario | null
  chosenTrafficDirection: string | null
  activeOffer: string | null
  activeCampaignIntent: string | null
  activeProduct: string | null
  activeCampaign: string | null
  activeTrafficDirection: string | null
  activePricingDiscussion: string | null
  activeLeadProfile: string | null
  activeClosingStrategy: string | null
  activeExecutionMode: OrionExecutionMode | null
  currentCommercialConcern: string | null
  currentBottleneck: string | null
  operationalIntent: OrionOperationalIntent | null
  activeMissionContext: OrionMissionContext | null
  intentRoute: OrionIntentRouteSummary | null
  commercialSubject: OrionCommercialSubjectSummary | null
  activeGoal: OrionOperationalGoal | null
  activeReasoningMode: OrionReasoningMode | null
  executionGuardrails?: OrionExecutionGuardrails | null
  activeOperationalPlanSummary: string | null
  operationalMemoryContext?: OrionAppliedOperationalMemoryContext | null
}

export type OrionAnalysis = {
  summary: string
  executive_summary: string
  priority_focus: OrionPriorityFocus
  daily_action_plan: OrionActionPlanItem[]
  alerts: OrionInsight[]
  recommendations: OrionInsight[]
  chart_interpretations: OrionChartInterpretation[]
  risks: OrionInsight[]
  opportunities: OrionInsight[]
  metrics: OrionMetric[]
  charts: OrionChart[]
  confidence_score: number
}

export type OrionUsageSummary = {
  callsThisMonth: number
  inputTokensThisMonth: number
  outputTokensThisMonth: number
  totalTokensThisMonth: number
  estimatedCostUsdThisMonth: number | null
  monthlyLimit: number | null
}

export type OrionHistoryItem = {
  id: string
  analysisType: string
  question: string | null
  model: string | null
  status: string
  totalTokens: number
  estimatedCostUsd: number | null
  createdAt: string
  summary: string
}

export type OrionSnapshot = {
  generatedAt: string
  companyName: string
  dataBasis: "internal" | "internal_external"
  executive: {
    revenue30d: number
    revenuePrevious30d: number
    sales30d: number
    salesPrevious30d: number
    averageTicket30d: number
    profit30d: number
    marginPct30d: number
    cashBalance: number
    pendingReceivables: number
    pendingPayables: number
    leadsOpen: number
    leadsWithoutFollowUp: number
    conversionRate30d: number
    activeStockValue: number
    stuckStockCount: number
    liquidityForecast: {
      overduePayables: number
      overdueReceivables: number
      todayPayables: number
      todayReceivables: number
      payables7d: number
      receivables7d: number
      payables15d: number
      receivables15d: number
      payables30d: number
      receivables30d: number
      pressureWindowStartDays: number | null
      pressureWindowEndDays: number | null
      nextPayables: Array<{
        id: string
        label: string
        amount: number
        dueDate: string
        daysUntilDue: number
      }>
      nextReceivables: Array<{
        id: string
        label: string
        amount: number
        dueDate: string
        daysUntilDue: number
      }>
    }
  }
  stock: {
    totalItems: number
    activeItems: number
    reservedItems: number
    soldItems: number
    averageActiveDays: number
    stuckItems: Array<{
      id: string
      name: string
      category: string
      color: string | null
      daysInStock: number
      purchasePrice: number
      suggestedPrice: number
      status: string
    }>
    availableItems: Array<{
      id: string
      name: string
      category: string
      color: string | null
      daysInStock: number
      purchasePrice: number
      suggestedPrice: number
      status: string
      quantity: number
    }>
    agingBuckets: OrionChartPoint[]
    topSlowCategories: OrionChartPoint[]
  }
  sales: {
    weeklyRevenue: OrionChartPoint[]
    marginTrend: OrionChartPoint[]
    topProducts: OrionChartPoint[]
    lowProducts: OrionChartPoint[]
    paymentMix: OrionChartPoint[]
  }
  marketing: {
    campaigns: Array<{
      id: string
      name: string
      channel: string
      spend: number
      revenue: number
      leads: number
      sales: number
      roi: number
    }>
    leadFunnel: OrionChartPoint[]
    leadOrigins: OrionChartPoint[]
    forgottenLeads: Array<{
      id: string
      name: string
      status: string
      campaignName?: string | null
      productInterest: string | null
      originalIntent: string | null
      classification: "hot" | "dormant" | "lost"
      nextAction: string | null
      nextActionAt: string | null
      daysWithoutAction: number
    }>
  }
  finance: {
    cashBalanceSource: "ledger" | "empty_ledger" | "reconciled_balance_after" | "finance_accounts"
    reconciledCashBalance: number
    accountCashBalance: number
    availableLiquidity: number
    pendingBalance: number
    staleAccountBalance: boolean
    ledgerVsAccountDiff: number
    operationalCashFlow30d: number
    ownerEquityMovement30d: number
    reconciledIncome30d: number
    reconciledExpense30d: number
    reconciledSalesRevenue30d: number
    reconciledSalesProfit30d: number
    availableSalesProfit: number
    availableOperationalProfitEstimate: {
      amount: number
      confidence: number
      reason: string
    }
    selectedFinancialPeriod: ProfitAvailabilityPeriod
    moneyClassification: MoneyClassificationSnapshot
    realProfitSnapshot: RealProfitSnapshot
    financialScenarioSnapshot: FinancialScenarioSnapshot
    inventoryLiquidityQuality: InventoryLiquidityQuality
    financialConfidenceBreakdown: FinancialConfidenceBreakdown
    ownerCapitalSnapshot: OwnerCapitalSnapshot
    profitAvailabilitySnapshot: ProfitAvailabilitySnapshot
    currentCashCompositionSnapshot: CurrentCashCompositionSnapshot
    workingCapitalSnapshot: WorkingCapitalSnapshot
    financialOperationalContext: OrionFinancialOperationalContext
    profitWindowStart: string
    cashFlowWeekly: OrionChartPoint[]
    expenseCategories: OrionChartPoint[]
    accountBalances: OrionChartPoint[]
  }
}

export type OrionApiPayload = {
  snapshot: OrionSnapshot
  analysis: OrionAnalysis
  execution: OrionExecutionPayload
  strategicCopilotAnswer?: string
  operationalContext?: OrionOperationalContext
  operationalConversationState?: OrionOperationalConversationState
  activeMissionContext?: OrionMissionContext
  history: OrionHistoryItem[]
  usage: OrionUsageSummary
  config: {
    openaiConfigured: boolean
    externalSourcesEnabled: boolean
    cacheMinutes: number
    logTableReady: boolean
  }
  cached?: boolean
}
