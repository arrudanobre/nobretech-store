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
    cashBalanceSource: "reconciled_balance_after" | "finance_accounts"
    reconciledCashBalance: number
    accountCashBalance: number
    operationalCashFlow30d: number
    ownerEquityMovement30d: number
    reconciledIncome30d: number
    reconciledExpense30d: number
    reconciledSalesRevenue30d: number
    reconciledSalesProfit30d: number
    availableSalesProfit: number
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
