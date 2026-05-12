import assert from "node:assert/strict"
import { buildBusinessReview, renderBusinessReviewBlocks } from "./business-review-engine"
import { buildSemanticPlan } from "./semantic-planner"
import type { OrionSnapshot } from "./types"

function makeSnapshot(overrides: {
  candidates?: OrionSnapshot["sales"]["reinvestmentCandidates"]
  periodPerformance?: OrionSnapshot["sales"]["periodPerformance"]
  stuckItems?: OrionSnapshot["stock"]["stuckItems"]
  finance?: unknown
} = {}): OrionSnapshot {
  return {
    sales: {
      periodPerformance: overrides.periodPerformance,
      reinvestmentAnalysisWindow: {
        label: "Últimos 90 dias",
        startDate: "2026-02-12",
        endDate: "2026-05-12",
        salesCount: 6,
        source: "last_90_days",
      },
      reinvestmentCandidates: overrides.candidates ?? [
        {
          label: "iPad (11ª geração)",
          category: "iPad",
          productType: "iPad",
          model: "iPad (11ª geração)",
          recentSalesCount: 4,
          sampleSize: 4,
          totalRevenue: 13600,
          totalProfit: 3400,
          averageTicket: 3400,
          averageProfit: 850,
          averageMarginPct: 25,
          averageDaysInStock: 7.3,
          probableUnitCost: 2550,
          minRecentCost: 2500,
          currentStockCount: 0,
          currentStockValue: 0,
          stuckStockCount: 0,
          campaignDemandLeads: 6,
          campaignLostLeads: 2,
          activeLeadSignals: 0,
          lostLeadSignals: 2,
          confidence: "high",
        },
      ],
    },
    stock: {
      stuckItems: overrides.stuckItems ?? [
        { id: "i1", name: "iPhone 12 Pro", category: "iPhone", color: "preto", daysInStock: 72, purchasePrice: 2400, suggestedPrice: 3200, status: "available" },
      ],
    },
    finance: overrides.finance,
  } as unknown as OrionSnapshot
}

// 1. Compound question → review surfaces sales totals + stuck items + recommendations
{
  const plan = buildSemanticPlan({
    userQuestion: "Queria que você analisasse minha performance de vendas dos últimos 15 dias e me diga quanto realmente lucrei, quais produtos ainda estou preso em estoque e o que você sugere",
  })
  assert.equal(plan.primaryGoal, "business_review")
  const review = buildBusinessReview({ snapshot: makeSnapshot(), plan })
  assert.equal(review.sales.totalSales, 4)
  assert.equal(review.sales.totalRevenue, 13600)
  assert.equal(review.sales.realizedProfit, 3400)
  assert.equal(review.sales.marginPct, 25)
  assert.ok(review.sales.topProducts.length > 0)
  assert.equal(review.sales.topProducts[0].label, "iPad (11ª geração)")
  assert.ok(review.inventory.stuckItems.length > 0)
  assert.equal(review.inventory.stuckItems[0].risk, "high")
  assert.ok(review.recommendations.length > 0)
}

// 1b. Selected month profit does not use 90-day candidate totals as month profit
{
  const plan = buildSemanticPlan({ userQuestion: "Como foi meu resultado do mês atual?" })
  const review = buildBusinessReview({
    snapshot: makeSnapshot({
      periodPerformance: {
        period: { label: "Maio", startDate: "2026-05-01", endDate: "2026-05-12", source: "current_month" },
        salesCount: 2,
        revenue: 9000,
        netRevenue: 9000,
        profit: 2400,
        marginPct: 26.7,
        includedStatuses: ["completed"],
        excludedStatuses: ["reserved", "cancelled", "canceled", "refunded", "estornado", "void"],
        firstSaleDate: "2026-05-02",
        lastSaleDate: "2026-05-10",
        topProducts: [{ label: "iPad (11ª geração)", salesCount: 2, revenue: 9000, profit: 2400, marginPct: 26.7 }],
      },
      finance: {
        selectedFinancialPeriod: { preset: "current_month", startDate: "2026-05-01", endDate: "2026-05-12", label: "Maio" },
        profitAvailabilitySnapshot: { period: { preset: "current_month", startDate: "2026-05-01", endDate: "2026-05-12", label: "Maio" }, realizedProfitInPeriod: 2100 },
        realProfitSnapshot: { sales: [{ saleId: "may-1" }, { saleId: "may-2" }], totals: { grossRevenue: 9000, netRevenue: 9000, realizedProfitFromSales: 2100 } },
      },
    }),
    plan,
  })
  assert.equal(review.timeframeLabel, "Maio")
  assert.equal(review.period.source, "current_month")
  assert.equal(review.sales.totalSales, 2)
  assert.equal(review.sales.totalRevenue, 9000)
  assert.equal(review.sales.realizedProfit, 2100)
}

// 2. Review respects timeframe label from plan
{
  const plan = buildSemanticPlan({ userQuestion: "Performance dos últimos 15 dias com lucro e estoque preso" })
  const review = buildBusinessReview({ snapshot: makeSnapshot(), plan })
  assert.match(review.timeframeLabel, /15 dias/i)
  // Caveat surfaces the period mismatch when selected-period sales are unavailable.
  assert.ok(review.caveats.some((line) => /pergunta pediu|Performance financeira usa/i.test(line)))
}

// 3. Empty snapshot → caveats + zero totals, never invents data
{
  const plan = buildSemanticPlan({ userQuestion: "Performance dos últimos 15 dias com lucro e estoque preso" })
  const review = buildBusinessReview({
    snapshot: makeSnapshot({ candidates: [], stuckItems: [] }),
    plan,
  })
  assert.equal(review.sales.totalSales, 0)
  assert.equal(review.sales.totalRevenue, 0)
  assert.equal(review.sales.topProducts.length, 0)
  assert.equal(review.inventory.stuckItems.length, 0)
  assert.ok(review.caveats.some((line) => /Nenhuma venda|Sem candidatos/i.test(line)))
  assert.ok(review.recommendations.length > 0, "must always offer at least one direction")
}

// 4. Render output produces visual blocks with section headers, not single paragraph
{
  const plan = buildSemanticPlan({
    userQuestion: "Performance dos últimos 15 dias com lucro e estoque preso e o que sugere",
  })
  const review = buildBusinessReview({ snapshot: makeSnapshot(), plan })
  const text = renderBusinessReviewBlocks(review)
  const blocks = text.split(/\n\n+/).filter(Boolean)
  assert.ok(blocks.length >= 4, `expected at least 4 blocks, got ${blocks.length}`)
  assert.ok(text.includes("Resultado do período"))
  assert.ok(text.includes("Produtos que performaram"))
  assert.ok(text.includes("Estoque preso"))
  assert.ok(text.includes("Decisão / recomendação"))
}

// 5. Profit indisponível: rendering does not pretend precision
{
  const plan = buildSemanticPlan({ userQuestion: "Análise do período" })
  const review = buildBusinessReview({
    snapshot: makeSnapshot({ candidates: [{
      label: "Item",
      category: "Outros",
      productType: "Outros",
      model: "Item",
      recentSalesCount: 1,
      sampleSize: 1,
      totalRevenue: 100,
      totalProfit: 0,
      averageTicket: 100,
      averageProfit: 0,
      averageMarginPct: 0,
      averageDaysInStock: null,
      probableUnitCost: null,
      minRecentCost: null,
      currentStockCount: 0,
      currentStockValue: 0,
      stuckStockCount: 0,
      campaignDemandLeads: 0,
      campaignLostLeads: 0,
      activeLeadSignals: 0,
      lostLeadSignals: 0,
      confidence: "low",
    }] }),
    plan,
  })
  const text = renderBusinessReviewBlocks(review)
  // realizedProfit is 0 → numeric, BRL-rendered. If null, must say "indisponível".
  assert.ok(text.includes("Lucro realizado"))
}

console.log("business-review-engine tests passed")
