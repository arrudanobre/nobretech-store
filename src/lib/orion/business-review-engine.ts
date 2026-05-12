import type { OrionSnapshot } from "./types"
import type { OrionSemanticPlan } from "./semantic-planner"

export type OrionBusinessReview = {
  timeframeLabel: string
  period: {
    label: string
    startDate: string | null
    endDate: string | null
    source: "selected_period" | "current_month" | "last_15_days" | "last_30_days" | "last_90_days" | "all_loaded" | "unknown"
  }
  sales: {
    totalRevenue: number
    totalSales: number
    realizedProfit: number | null
    marginPct: number | null
    topProducts: Array<{
      label: string
      salesCount: number
      revenue: number
      profit: number | null
      marginPct: number | null
    }>
  }
  inventory: {
    stuckItems: Array<{
      label: string
      daysInStock: number | null
      investedCapital: number | null
      estimatedProfit: number | null
      risk: "low" | "medium" | "high"
    }>
  }
  recommendations: Array<{
    priority: "high" | "medium" | "low"
    title: string
    action: string
    reason: string
  }>
  caveats: string[]
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positive(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function riskFromDays(daysInStock: number | null): "low" | "medium" | "high" {
  if (daysInStock === null) return "low"
  if (daysInStock >= 60) return "high"
  if (daysInStock >= 30) return "medium"
  return "low"
}

function periodSourceFromPreset(preset: string | null | undefined): OrionBusinessReview["period"]["source"] {
  if (preset === "current_month") return "current_month"
  if (preset === "last_30_days") return "last_30_days"
  if (preset === "all_time") return "all_loaded"
  if (preset === "today" || preset === "last_7_days" || preset === "year_to_date" || preset === "custom") return "selected_period"
  return "unknown"
}

export type BuildBusinessReviewInput = {
  snapshot: OrionSnapshot
  plan: OrionSemanticPlan
}

export function buildBusinessReview(input: BuildBusinessReviewInput): OrionBusinessReview {
  const snapshot = input.snapshot
  const plan = input.plan
  const caveats: string[] = []

  const candidates = snapshot.sales?.reinvestmentCandidates || []
  const window = snapshot.sales?.reinvestmentAnalysisWindow
  const performance = snapshot.sales?.periodPerformance
  const selectedPeriod = snapshot.finance?.selectedFinancialPeriod || snapshot.finance?.profitAvailabilitySnapshot?.period
  const period = {
    label: performance?.period.label || selectedPeriod?.label || plan.timeframe.label || window?.label || "período atual",
    startDate: performance?.period.startDate || selectedPeriod?.startDate || null,
    endDate: performance?.period.endDate || selectedPeriod?.endDate || null,
    source: performance?.period.source || (selectedPeriod ? periodSourceFromPreset(selectedPeriod.preset) : window?.source || "unknown"),
  }
  const timeframeLabel = period.label

  const selectedProfit = snapshot.finance?.realProfitSnapshot
  const selectedAvailability = snapshot.finance?.profitAvailabilitySnapshot
  const commercialProfit = performance?.profit ?? null
  const totalSales = performance?.salesCount ?? candidates.reduce((sum, c) => sum + (c.recentSalesCount || 0), 0)
  const totalRevenue = roundCurrency(positive(performance?.revenue ?? candidates.reduce((sum, c) => sum + positive(c.totalRevenue), 0)))
  const totalProfit = roundCurrency(positive(selectedAvailability?.realizedProfitInPeriod ?? selectedProfit?.totals?.realizedProfitFromSales ?? commercialProfit ?? candidates.reduce((sum, c) => sum + positive(c.totalProfit), 0)))
  const hasProfit = Boolean(selectedAvailability || selectedProfit || commercialProfit !== null || candidates.some((c) => typeof c.totalProfit === "number"))
  const marginPct = totalRevenue > 0 && hasProfit ? roundCurrency((totalProfit / totalRevenue) * 100) : null
  const realizedProfit = hasProfit ? totalProfit : null

  if (plan.timeframe.type === "last_n_days" && plan.timeframe.label !== period.label) {
    caveats.push(`Vendas/lucro usam ${period.label}; pergunta pediu ${plan.timeframe.label}. O snapshot não trouxe vendas filtráveis por sale_date para recalcular esta janela.`)
  }
  if (!performance) {
    caveats.push("Vendas comerciais do período não estão carregadas no snapshot.")
  }
  if (performance && selectedProfit?.sales && selectedProfit.sales.length !== performance.salesCount) {
    caveats.push("Vendas comerciais usam sale_date; lucro rastreável pode usar conciliação financeira e divergir da contagem comercial.")
  }
  if (!selectedProfit && candidates.length && !performance) {
    caveats.push(`Performance financeira usa ${window?.label || "base carregada"} porque o snapshot não trouxe lucro do período selecionado.`)
  }
  if (!candidates.length) {
    caveats.push("Sem candidatos comerciais carregados no snapshot atual.")
  }
  if (totalSales === 0) {
    caveats.push("Nenhuma venda encontrada na janela analisada.")
  }

  const topProducts = (performance?.topProducts?.length ? performance.topProducts : candidates
      .slice()
      .sort((a, b) => positive(b.totalRevenue) - positive(a.totalRevenue))
      .slice(0, 5)
      .map((candidate) => ({
        label: candidate.label,
        salesCount: candidate.recentSalesCount || 0,
        revenue: roundCurrency(positive(candidate.totalRevenue)),
        profit: typeof candidate.totalProfit === "number" ? roundCurrency(candidate.totalProfit) : null,
        marginPct: typeof candidate.averageMarginPct === "number" ? roundCurrency(candidate.averageMarginPct) : null,
      })))

  const stockItems = snapshot.stock?.stuckItems || []
  const stuckItems = stockItems.slice(0, 8).map((item) => ({
    label: item.name,
    daysInStock: typeof item.daysInStock === "number" ? item.daysInStock : null,
    investedCapital: typeof item.purchasePrice === "number" ? roundCurrency(item.purchasePrice) : null,
    estimatedProfit: typeof item.suggestedPrice === "number" && typeof item.purchasePrice === "number"
      ? roundCurrency(item.suggestedPrice - item.purchasePrice)
      : null,
    risk: riskFromDays(typeof item.daysInStock === "number" ? item.daysInStock : null),
  }))

  const recommendations: OrionBusinessReview["recommendations"] = []
  if (stuckItems.some((item) => item.risk === "high")) {
    const target = stuckItems.find((item) => item.risk === "high")!
    recommendations.push({
      priority: "high",
      title: `Liquidar ${target.label}`,
      action: "Faça ação direta de 48h com garantia, parcelamento e pronta entrega antes de reduzir preço.",
      reason: `${target.label} parado há ${target.daysInStock ?? "?"} dias imobiliza capital sem girar.`,
    })
  }
  if (topProducts.length > 0) {
    const top = topProducts[0]
    recommendations.push({
      priority: "medium",
      title: `Manter prioridade em ${top.label}`,
      action: "Preservar exposição comercial e estoque para esse SKU enquanto a margem se mantém.",
      reason: `${top.label} concentrou maior receita do período analisado.`,
    })
  }
  if (totalSales === 0) {
    recommendations.push({
      priority: "high",
      title: "Reativar entrada de caixa",
      action: "Priorizar resposta a leads existentes e ativar oferta sobre estoque parado antes de comprar novo.",
      reason: "Sem vendas conciliadas no período, o caixa não está girando.",
    })
  }

  return {
    timeframeLabel,
    period,
    sales: {
      totalRevenue,
      totalSales,
      realizedProfit,
      marginPct,
      topProducts,
    },
    inventory: { stuckItems },
    recommendations,
    caveats,
  }
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value)
}

export function renderBusinessReviewBlocks(review: OrionBusinessReview): string {
  const sales = review.sales
  const profitLine = sales.realizedProfit !== null
    ? `Lucro realizado: ${brl(sales.realizedProfit)}${sales.marginPct !== null ? ` (margem média ${sales.marginPct}%)` : ""}.`
    : "Lucro realizado: indisponível no snapshot atual."
  const blocks: string[] = []

  blocks.push([
    `Resultado do período (${review.timeframeLabel}):`,
    `- Vendas: ${sales.totalSales}`,
    `- Receita: ${brl(sales.totalRevenue)}`,
    `- ${profitLine}`,
  ].join("\n"))

  if (sales.topProducts.length) {
    const productLines = sales.topProducts.map((product) => {
      const marginPart = product.marginPct !== null ? ` · margem ${product.marginPct}%` : ""
      const profitPart = product.profit !== null ? ` · lucro ${brl(product.profit)}` : ""
      const salesWord = product.salesCount === 1 ? "venda" : "vendas"
      return `- ${product.label}: ${product.salesCount} ${salesWord} · receita ${brl(product.revenue)}${profitPart}${marginPart}`
    })
    blocks.push(["Produtos que performaram:", ...productLines].join("\n"))
  }

  if (review.inventory.stuckItems.length) {
    const stuckLines = review.inventory.stuckItems.map((item) => {
      const capital = item.investedCapital !== null ? ` · capital ${brl(item.investedCapital)}` : ""
      const days = item.daysInStock !== null ? `${item.daysInStock} dias parado` : "tempo de estoque indisponível"
      return `- ${item.label}: ${days}${capital} · risco ${item.risk}`
    })
    blocks.push(["Estoque preso:", ...stuckLines].join("\n"))
  }

  if (review.recommendations.length) {
    const recLines = review.recommendations.map((rec) => `- [${rec.priority}] ${rec.title}: ${rec.action} (${rec.reason})`)
    blocks.push(["Decisão / recomendação:", ...recLines].join("\n"))
  }

  if (review.caveats.length) {
    blocks.push(["Observações:", ...review.caveats.map((caveat) => `- ${caveat}`)].join("\n"))
  }

  return blocks.join("\n\n")
}
