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
      pressureWindowStartDays: number | null
      pressureWindowEndDays: number | null
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
    cashFlowWeekly: OrionChartPoint[]
    expenseCategories: OrionChartPoint[]
    accountBalances: OrionChartPoint[]
  }
}

export type OrionApiPayload = {
  snapshot: OrionSnapshot
  analysis: OrionAnalysis
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
