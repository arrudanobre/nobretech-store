import { buildReinvestmentDecision, type ReinvestmentDecision } from "./reinvestment-intelligence-engine"
import type { OrionSemanticPlan } from "./semantic-planner"
import type { OrionSnapshot } from "./types"

export type OrionToolName =
  | "finance.cashPosition"
  | "finance.receivables"
  | "finance.payables"
  | "sales.performance"
  | "sales.marginByProduct"
  | "inventory.stuckItems"
  | "inventory.availableStock"
  | "marketing.campaignPerformance"
  | "leads.funnelHealth"
  | "reinvestment.decision"

export type OrionToolStatus = "ok" | "partial" | "unavailable"

export type OrionToolResult<TData = unknown> = {
  tool: OrionToolName
  status: OrionToolStatus
  data: TData
  caveats: string[]
}

export type OrionMetricPeriod = {
  label: string
  startDate: string | null
  endDate: string | null
  source: "selected_period" | "current_month" | "last_15_days" | "last_30_days" | "last_90_days" | "all_loaded" | "unknown"
}

export type OrionToolExecutionInput = {
  tool: OrionToolName
  snapshot: OrionSnapshot
  semanticPlan?: OrionSemanticPlan | null
}

export type OrionToolSetExecutionInput = {
  tools: OrionToolName[]
  snapshot: OrionSnapshot
  semanticPlan?: OrionSemanticPlan | null
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function readNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function positive(value: unknown) {
  return Math.max(0, readNumber(value))
}

function statusFromData(hasData: boolean, caveats: string[]): OrionToolStatus {
  if (!hasData) return "unavailable"
  return caveats.length > 0 ? "partial" : "ok"
}

function periodSourceFromPreset(preset: string | null | undefined): OrionMetricPeriod["source"] {
  if (preset === "current_month") return "current_month"
  if (preset === "last_30_days") return "last_30_days"
  if (preset === "all_time") return "all_loaded"
  if (preset === "today" || preset === "last_7_days" || preset === "year_to_date" || preset === "custom") return "selected_period"
  return "unknown"
}

function selectedPeriod(snapshot: OrionSnapshot): OrionMetricPeriod {
  const period = snapshot.finance?.selectedFinancialPeriod || snapshot.finance?.profitAvailabilitySnapshot?.period
  return {
    label: period?.label || "Período selecionado",
    startDate: period?.startDate || null,
    endDate: period?.endDate || null,
    source: periodSourceFromPreset(period?.preset),
  }
}

function reinvestmentPeriod(snapshot: OrionSnapshot): OrionMetricPeriod {
  const window = snapshot.sales?.reinvestmentAnalysisWindow
  return {
    label: window?.label || "Base de recompra não informada",
    startDate: window?.startDate || null,
    endDate: window?.endDate || null,
    source: window?.source || "unknown",
  }
}

function buildCashPosition(snapshot: OrionSnapshot): OrionToolResult {
  const caveats: string[] = []
  const cash = readNumber(snapshot.finance?.currentCashCompositionSnapshot?.consolidatedCash ?? snapshot.finance?.reconciledCashBalance ?? snapshot.executive?.cashBalance)
  const accountCash = readNumber(snapshot.finance?.accountCashBalance)
  const protectedWorkingCapital = readNumber(snapshot.finance?.workingCapitalSnapshot?.protectedOperationalCapital)
  const availableLiquidity = readNumber(snapshot.finance?.availableLiquidity ?? snapshot.executive?.cashBalance)
  if (snapshot.finance?.staleAccountBalance) caveats.push("Saldo de conta pode estar defasado; usar caixa reconciliado como referência operacional.")
  if (!snapshot.finance?.currentCashCompositionSnapshot) caveats.push("Composição de caixa não está detalhada no snapshot.")

  return {
    tool: "finance.cashPosition",
    status: statusFromData(cash !== 0 || availableLiquidity !== 0, caveats),
    data: {
      cash,
      accountCash,
      availableLiquidity,
      protectedWorkingCapital,
      cashBalanceSource: snapshot.finance?.cashBalanceSource ?? null,
      period: {
        label: "Posição atual",
        startDate: snapshot.generatedAt?.slice(0, 10) || null,
        endDate: snapshot.generatedAt?.slice(0, 10) || null,
        source: "selected_period",
      } satisfies OrionMetricPeriod,
    },
    caveats,
  }
}

function buildReceivables(snapshot: OrionSnapshot): OrionToolResult {
  const receivables = snapshot.executive?.liquidityForecast?.nextReceivables || []
  const totalPending = positive(snapshot.executive?.pendingReceivables ?? snapshot.finance?.pendingBalance)
  const caveats: string[] = []
  if (!receivables.length && totalPending > 0) {
    caveats.push("Recebíveis existem, mas sem vencimento detalhado; janelas foram tratadas como indisponíveis.")
  }

  const nearTerm = roundCurrency(receivables.filter((item) => item.daysUntilDue <= 3).reduce((sum, item) => sum + positive(item.amount), 0))
  const shortTerm = roundCurrency(receivables.filter((item) => item.daysUntilDue <= 7).reduce((sum, item) => sum + positive(item.amount), 0))
  const future = roundCurrency(receivables.filter((item) => item.daysUntilDue > 7).reduce((sum, item) => sum + positive(item.amount), 0))

  return {
    tool: "finance.receivables",
    status: statusFromData(totalPending > 0 || receivables.length > 0, caveats),
    data: {
      nearTermReceivables: nearTerm,
      shortTermReceivables: shortTerm,
      futureReceivables: future,
      totalPending,
      detailAvailable: receivables.length > 0,
      nextReceivables: receivables.slice(0, 5),
    },
    caveats,
  }
}

function buildPayables(snapshot: OrionSnapshot): OrionToolResult {
  const forecast = snapshot.executive?.liquidityForecast
  const payables7d = positive(forecast?.payables7d)
  const payables30d = positive(forecast?.payables30d ?? snapshot.executive?.pendingPayables)
  const caveats = forecast ? [] : ["Previsão de contas a pagar não está detalhada no snapshot."]
  return {
    tool: "finance.payables",
    status: statusFromData(Boolean(forecast) || payables7d > 0 || payables30d > 0, caveats),
    data: {
      payables7d,
      payables30d,
      overduePayables: positive(forecast?.overduePayables),
      todayPayables: positive(forecast?.todayPayables),
      nextPayables: (forecast?.nextPayables || []).slice(0, 5),
    },
    caveats,
  }
}

function buildSalesPerformance(snapshot: OrionSnapshot, semanticPlan?: OrionSemanticPlan | null): OrionToolResult {
  const realProfit = snapshot.finance?.realProfitSnapshot
  const availability = snapshot.finance?.profitAvailabilitySnapshot
  const performance = snapshot.sales?.periodPerformance
  const candidates = snapshot.sales?.reinvestmentCandidates || []
  const period = performance?.period || selectedPeriod(snapshot)
  const revenue = roundCurrency(positive(performance?.revenue ?? candidates.reduce((sum, item) => sum + positive(item.totalRevenue), 0)))
  const commercialProfit = performance?.profit ?? null
  const financialProfit = availability?.realizedProfitInPeriod ?? realProfit?.totals?.realizedProfitFromSales
  const profit = roundCurrency(positive(financialProfit ?? commercialProfit ?? candidates.reduce((sum, item) => sum + positive(item.totalProfit), 0)))
  const salesCount = performance?.salesCount ?? candidates.reduce((sum, item) => sum + positive(item.recentSalesCount), 0)
  const caveats: string[] = []
  if (!performance) caveats.push("Vendas comerciais do período não estão carregadas no snapshot.")
  if (!realProfit && commercialProfit === null) caveats.push("Lucro rastreável do período selecionado não está carregado no snapshot.")
  if (performance && realProfit?.sales && realProfit.sales.length !== performance.salesCount) {
    caveats.push("Vendas comerciais usam sale_date; lucro rastreável pode usar conciliação financeira e divergir da contagem comercial.")
  }
  if (semanticPlan?.timeframe.type === "last_n_days" && semanticPlan.timeframe.label !== period.label) {
    caveats.push(`Vendas/lucro usam ${period.label}; a pergunta pediu ${semanticPlan.timeframe.label}. O snapshot não trouxe vendas filtráveis por sale_date para recalcular esta janela.`)
  }
  if (period.source === "all_loaded") {
    caveats.push("Esta métrica usa todos os dados carregados no snapshot, não apenas o período da tela.")
  }
  return {
    tool: "sales.performance",
    status: statusFromData(salesCount > 0 || revenue > 0, caveats),
    data: {
      timeframeLabel: period.label,
      revenue,
      profit,
      salesCount,
      commercialProfit,
      financialProfit: typeof financialProfit === "number" ? financialProfit : null,
      profitBasis: typeof financialProfit === "number" ? "financial_traceability" : commercialProfit !== null ? "commercial_sale_date" : "unavailable",
      marginPct: revenue > 0 ? roundCurrency((profit / revenue) * 100) : null,
      period,
      includedStatuses: performance?.includedStatuses || [],
      excludedStatuses: performance?.excludedStatuses || ["reserved", "cancelled", "canceled", "refunded", "estornado", "void"],
      firstSaleDate: performance?.firstSaleDate || null,
      lastSaleDate: performance?.lastSaleDate || null,
      topProducts: performance?.topProducts || [],
    },
    caveats,
  }
}

function buildMarginByProduct(snapshot: OrionSnapshot): OrionToolResult {
  const period = reinvestmentPeriod(snapshot)
  const products = (snapshot.sales?.reinvestmentCandidates || [])
    .slice()
    .sort((a, b) => {
      const aScore = positive(a.averageProfit) + positive(a.averageMarginPct) * 20 + positive(a.recentSalesCount) * 50
      const bScore = positive(b.averageProfit) + positive(b.averageMarginPct) * 20 + positive(b.recentSalesCount) * 50
      return bScore - aScore
    })
    .slice(0, 8)
    .map((item) => ({
      label: item.label,
      category: item.category,
      productType: item.productType,
      model: item.model,
      salesCount: item.recentSalesCount,
      sampleSize: item.sampleSize,
      revenue: item.totalRevenue,
      profit: item.totalProfit,
      averageProfit: item.averageProfit,
      marginPct: item.averageMarginPct,
      averageDaysInStock: item.averageDaysInStock,
      probableUnitCost: item.probableUnitCost ?? item.minRecentCost,
      currentStockCount: item.currentStockCount,
      campaignDemandLeads: item.campaignDemandLeads,
      campaignLostLeads: item.campaignLostLeads,
      confidence: item.confidence,
      lowAbsoluteProfit: item.averageProfit < 200,
    }))
  const caveats = products.length ? [] : ["Sem margem por produto suficiente no snapshot."]
  if (period.source === "last_90_days") caveats.push("Base de recompra: últimos 90 dias.")
  return {
    tool: "sales.marginByProduct",
    status: statusFromData(products.length > 0, caveats),
    data: { products, period },
    caveats,
  }
}

function buildAvailableStock(snapshot: OrionSnapshot): OrionToolResult {
  const items = (snapshot.stock?.availableItems || []).slice(0, 20).map((item) => ({
    id: item.id,
    label: item.name,
    category: item.category,
    daysInStock: item.daysInStock,
    purchasePrice: item.purchasePrice,
    suggestedPrice: item.suggestedPrice,
    estimatedGrossProfit: roundCurrency(readNumber(item.suggestedPrice) - readNumber(item.purchasePrice)),
    quantity: item.quantity,
    status: item.status,
  }))
  const caveats = items.length ? [] : ["Sem estoque disponível carregado no snapshot."]
  return {
    tool: "inventory.availableStock",
    status: statusFromData(items.length > 0, caveats),
    data: { items },
    caveats,
  }
}

function buildStuckItems(snapshot: OrionSnapshot): OrionToolResult {
  const items = (snapshot.stock?.stuckItems || []).slice(0, 10).map((item) => ({
    id: item.id,
    label: item.name,
    category: item.category,
    daysInStock: item.daysInStock,
    investedCapital: item.purchasePrice,
    suggestedPrice: item.suggestedPrice,
    estimatedGrossProfit: roundCurrency(readNumber(item.suggestedPrice) - readNumber(item.purchasePrice)),
    risk: item.daysInStock >= 60 ? "high" : item.daysInStock >= 30 ? "medium" : "low",
  }))
  return {
    tool: "inventory.stuckItems",
    status: "ok",
    data: { items },
    caveats: [],
  }
}

function buildCampaignPerformance(snapshot: OrionSnapshot): OrionToolResult {
  const period: OrionMetricPeriod = {
    label: "Período das campanhas carregadas",
    startDate: null,
    endDate: null,
    source: "unknown",
  }
  const campaigns = (snapshot.marketing?.campaigns || []).slice(0, 10).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    spend: campaign.spend,
    revenue: campaign.revenue,
    leads: campaign.leads,
    sales: campaign.sales,
    roi: campaign.roi,
    lostLeads: campaign.lostLeads,
    conversionRate: campaign.leads > 0 ? roundCurrency((campaign.sales / campaign.leads) * 100) : null,
  }))
  const caveats = campaigns.length ? [] : ["Sem campanhas carregadas no snapshot."]
  return {
    tool: "marketing.campaignPerformance",
    status: statusFromData(campaigns.length > 0, caveats),
    data: { campaigns, period },
    caveats,
  }
}

function buildFunnelHealth(snapshot: OrionSnapshot): OrionToolResult {
  const leads = snapshot.marketing?.forgottenLeads || []
  const activeOpportunities = leads.filter((lead) => lead.classification !== "lost").length
  const lostLeads = leads.filter((lead) => lead.classification === "lost").length
  const caveats = leads.length ? [] : ["A leitura de leads está limitada porque o funil detalhado não está carregado."]
  return {
    tool: "leads.funnelHealth",
    status: statusFromData(leads.length > 0 || positive(snapshot.executive?.leadsOpen) > 0, caveats),
    data: {
      activeOpportunities,
      lostLeads,
      leadsOpen: positive(snapshot.executive?.leadsOpen),
      leadsWithoutFollowUp: positive(snapshot.executive?.leadsWithoutFollowUp),
      shouldFollowUpLostLeads: false,
      leads: leads.slice(0, 8),
    },
    caveats,
  }
}

function buildReinvestmentTool(snapshot: OrionSnapshot): OrionToolResult<ReinvestmentDecision> {
  const decision = buildReinvestmentDecision(snapshot)
  return {
    tool: "reinvestment.decision",
    status: "ok",
    data: decision,
    caveats: decision.analysisWindow.source === "last_90_days" ? ["Base de recompra: últimos 90 dias."] : [],
  }
}

export function runOrionTool(input: OrionToolExecutionInput): OrionToolResult {
  if (input.tool === "finance.cashPosition") return buildCashPosition(input.snapshot)
  if (input.tool === "finance.receivables") return buildReceivables(input.snapshot)
  if (input.tool === "finance.payables") return buildPayables(input.snapshot)
  if (input.tool === "sales.performance") return buildSalesPerformance(input.snapshot, input.semanticPlan)
  if (input.tool === "sales.marginByProduct") return buildMarginByProduct(input.snapshot)
  if (input.tool === "inventory.availableStock") return buildAvailableStock(input.snapshot)
  if (input.tool === "inventory.stuckItems") return buildStuckItems(input.snapshot)
  if (input.tool === "marketing.campaignPerformance") return buildCampaignPerformance(input.snapshot)
  if (input.tool === "leads.funnelHealth") return buildFunnelHealth(input.snapshot)
  return buildReinvestmentTool(input.snapshot)
}

export function runOrionTools(input: OrionToolSetExecutionInput): OrionToolResult[] {
  return input.tools.map((tool) => runOrionTool({ tool, snapshot: input.snapshot, semanticPlan: input.semanticPlan }))
}
