import assert from "node:assert/strict"
import { buildReinvestmentDecision } from "./reinvestment-intelligence-engine"
import type { OrionSnapshot } from "./types"

type Candidate = OrionSnapshot["sales"]["reinvestmentCandidates"][number]

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    label: "iPad 9",
    category: "iPad",
    productType: "iPad",
    model: "iPad 9",
    recentSalesCount: 3,
    sampleSize: 3,
    totalRevenue: 10500,
    totalProfit: 2700,
    averageTicket: 3500,
    averageProfit: 900,
    averageMarginPct: 25,
    averageDaysInStock: 9,
    probableUnitCost: 2600,
    minRecentCost: 2500,
    currentStockCount: 0,
    currentStockValue: 0,
    stuckStockCount: 0,
    campaignDemandLeads: 10,
    campaignLostLeads: 9,
    activeLeadSignals: 0,
    lostLeadSignals: 9,
    confidence: "high",
    ...overrides,
  }
}

function snapshot(overrides: {
  cash?: number
  payables7d?: number
  pendingReceivables?: number
  nextReceivables?: OrionSnapshot["executive"]["liquidityForecast"]["nextReceivables"]
  campaigns?: OrionSnapshot["marketing"]["campaigns"]
  forgottenLeads?: OrionSnapshot["marketing"]["forgottenLeads"]
  candidates?: Candidate[]
} = {}): OrionSnapshot {
  const cash = overrides.cash ?? 10000
  const nextReceivables = overrides.nextReceivables ?? [{
    id: "r1",
    label: "Recebível D+1",
    amount: 3000,
    dueDate: "2026-05-13",
    daysUntilDue: 1,
  }]
  const pendingReceivables = overrides.pendingReceivables ?? nextReceivables.reduce((sum, item) => sum + item.amount, 0)
  return {
    executive: {
      pendingReceivables,
      liquidityForecast: {
        payables7d: overrides.payables7d ?? 1000,
        receivables7d: nextReceivables.filter((item) => item.daysUntilDue <= 7).reduce((sum, item) => sum + item.amount, 0),
        nextReceivables,
      },
    },
    finance: {
      reconciledCashBalance: cash,
      pendingBalance: pendingReceivables,
      currentCashCompositionSnapshot: {
        consolidatedCash: cash,
      },
    },
    sales: {
      reinvestmentAnalysisWindow: {
        label: "Últimos 90 dias",
        startDate: "2026-02-12",
        endDate: "2026-05-12",
        salesCount: (overrides.candidates ?? [candidate()]).reduce((sum, c) => sum + c.sampleSize, 0),
        source: "last_90_days" as const,
      },
      reinvestmentCandidates: overrides.candidates ?? [candidate()],
    },
    marketing: {
      campaigns: overrides.campaigns ?? [{
        id: "campaign-ipad",
        name: "Campanha iPad",
        channel: "Meta",
        spend: 100,
        revenue: 3500,
        leads: 10,
        sales: 1,
        roi: 35,
        lostLeads: 9,
      }],
      forgottenLeads: overrides.forgottenLeads ?? [],
    },
  } as unknown as OrionSnapshot
}

{
  const decision = buildReinvestmentDecision(snapshot())
  assert.equal(decision.decision, "reinvest_recommended")
  // theoreticalCap = cash - operationalReserve = 10000 - max(1000, 25% of cash) = 10000 - 2500 = 7500
  assert.equal(decision.safeReinvestmentCap, 7500)
  assert.equal(decision.theoreticalCap, 7500)
  // capAfterPayables = theoretical - payables7d (1000) = 6500
  assert.equal(decision.capAfterPayables, 6500)
  assert.equal(decision.recommendedProducts[0]?.label, "iPad 9")
  assert.equal(decision.recommendedProducts[0]?.priority, "high")
}

{
  const decision = buildReinvestmentDecision(snapshot({
    nextReceivables: [],
    pendingReceivables: 5000,
  }))
  assert.equal(decision.receivablesDetailAvailable, false)
  assert.equal(decision.nearTermReceivables, 0)
  assert.equal(decision.shortTermReceivables, 0)
  assert.equal(decision.futureReceivables, 0)
  assert.equal(decision.undatedReceivables, 5000)
  assert.equal(decision.confidence, "low")
  assert.ok(decision.precisionWarnings.some((warning) => warning.includes("vencimento detalhado")))
}

{
  const decision = buildReinvestmentDecision(snapshot({
    campaigns: [{
      id: "campaign-ipad",
      name: "Campanha iPad",
      channel: "Meta",
      spend: 100,
      revenue: 3500,
      leads: 10,
      sales: 1,
      roi: 35,
      lostLeads: 9,
    }],
    forgottenLeads: [],
  }))
  assert.equal(decision.leadContext.lostLeads, 9)
  assert.equal(decision.leadContext.shouldFollowUpLostLeads, false)
  assert.match(decision.leadContext.note, /não são oportunidade ativa/i)
}

{
  const decision = buildReinvestmentDecision(snapshot({
    candidates: [candidate({ sampleSize: 1, recentSalesCount: 1, confidence: "low" })],
  }))
  assert.equal(decision.confidence, "low")
  assert.ok(decision.precisionWarnings.some((warning) => warning.includes("Amostra histórica pequena")))
}

{
  const decision = buildReinvestmentDecision(snapshot({
    cash: 3000,
    payables7d: 500,
    nextReceivables: [],
    pendingReceivables: 0,
    candidates: [candidate({ probableUnitCost: 4200, minRecentCost: 4000 })],
  }))
  assert.equal(decision.decision, "do_not_reinvest")
  assert.equal(decision.capitalStatus, "demand_without_safe_capital")
  assert.equal(decision.recommendedProducts.length, 0)
  assert.ok(decision.avoid.some((item) => item.label === "iPad 9"))
}

{
  const decision = buildReinvestmentDecision(snapshot({
    cash: 1500,
    payables7d: 0,
    nextReceivables: [{
      id: "future",
      label: "Recebível distante",
      amount: 10000,
      dueDate: "2026-06-10",
      daysUntilDue: 29,
    }],
  }))
  assert.equal(decision.futureReceivables, 10000)
  assert.notEqual(decision.decision, "reinvest_recommended")
  assert.equal(decision.recommendedProducts.length, 0)
}

{
  const decision = buildReinvestmentDecision(snapshot({
    cash: 800,
    payables7d: 500,
    nextReceivables: [],
    pendingReceivables: 0,
  }))
  assert.equal(decision.decision, "do_not_reinvest")
  assert.equal(decision.capitalStatus, "cash_tight")
}

{
  const decision = buildReinvestmentDecision(snapshot({
    candidates: [candidate({
      label: "Acessório genérico",
      category: "Acessórios",
      productType: "Acessório",
      model: "Cabo",
      averageProfit: 40,
      averageMarginPct: 5,
      probableUnitCost: 30,
      minRecentCost: 25,
    })],
  }))
  assert.equal(decision.recommendedProducts.length, 0)
  assert.ok(decision.avoid.some((item) => item.label === "Acessório genérico"))
}

// Avoid reason: high margin %, low absolute profit must NOT say "margem baixa"
{
  const decision = buildReinvestmentDecision(snapshot({
    candidates: [candidate({
      label: "Apple Pencil",
      category: "Acessórios",
      productType: "Acessório",
      model: "Apple Pencil",
      averageProfit: 120,
      averageMarginPct: 41.9,
      probableUnitCost: 150,
      minRecentCost: 145,
    })],
  }))
  const item = decision.avoid.find((entry) => entry.label === "Apple Pencil")
  assert.ok(item, "low absolute profit candidate must appear in avoid")
  assert.equal(item!.reason.toLowerCase().includes("margem percentual baixa"), false, "must not flag high % margin as low")
  assert.ok(item!.reason.includes("lucro absoluto"), "reason must cite absolute profit")
  assert.ok(item!.reason.includes("complemento"), "should describe as complement, not priority")
}

// recommendedReinvestmentAmount is exposed and within safeReinvestmentCap
{
  const decision = buildReinvestmentDecision(snapshot())
  assert.ok(decision.recommendedReinvestmentAmount > 0)
  assert.ok(decision.recommendedReinvestmentAmount <= decision.safeReinvestmentCap)
}

// analysisWindow + per-candidate periodLabel/sampleWarning
{
  const decision = buildReinvestmentDecision(snapshot())
  assert.equal(decision.analysisWindow.label, "Últimos 90 dias")
  assert.equal(decision.analysisWindow.source, "last_90_days")
  assert.ok(decision.analysisWindow.salesCount > 0)
  const product = decision.recommendedProducts[0]
  assert.ok(product)
  assert.equal(product!.periodLabel, "Últimos 90 dias")
  assert.equal(product!.sampleWarning, null)
}

// Small sample → sampleWarning = "small_sample"
{
  const decision = buildReinvestmentDecision(snapshot({
    candidates: [candidate({ sampleSize: 1, recentSalesCount: 1 })],
  }))
  const product = decision.recommendedProducts[0]
  if (product) assert.equal(product.sampleWarning, "small_sample")
}

// rationale mentions base analisada
{
  const decision = buildReinvestmentDecision(snapshot())
  assert.ok(decision.rationale.some((line) => line.toLowerCase().includes("base analisada")))
}

// Unknown window when snapshot lacks reinvestmentAnalysisWindow
{
  const snap = snapshot()
  delete (snap as unknown as { sales: { reinvestmentAnalysisWindow?: unknown } }).sales.reinvestmentAnalysisWindow
  const decision = buildReinvestmentDecision(snap)
  assert.equal(decision.analysisWindow.source, "unknown")
}

console.log("reinvestment-intelligence-engine tests passed")
