import assert from "node:assert/strict"
import { runOrionTool, runOrionTools } from "./orion-tool-registry"
import type { OrionSnapshot } from "./types"

function snapshot(): OrionSnapshot {
  return {
    executive: {
      cashBalance: 10000,
      pendingReceivables: 3500,
      pendingPayables: 900,
      leadsOpen: 2,
      leadsWithoutFollowUp: 1,
      liquidityForecast: {
        payables7d: 900,
        payables30d: 1600,
        overduePayables: 0,
        todayPayables: 0,
        nextPayables: [],
        nextReceivables: [
          { id: "r1", label: "D+1", amount: 1500, dueDate: "2026-05-13", daysUntilDue: 1 },
          { id: "r2", label: "D+6", amount: 800, dueDate: "2026-05-18", daysUntilDue: 6 },
          { id: "r3", label: "D+12", amount: 1200, dueDate: "2026-05-24", daysUntilDue: 12 },
        ],
      },
    },
    finance: {
      reconciledCashBalance: 10000,
      accountCashBalance: 9800,
      availableLiquidity: 10000,
      pendingBalance: 3500,
      staleAccountBalance: false,
      cashBalanceSource: "reconciled_balance_after",
      selectedFinancialPeriod: { preset: "current_month", startDate: "2026-05-01", endDate: "2026-05-12", label: "Maio" },
      profitAvailabilitySnapshot: { period: { preset: "current_month", startDate: "2026-05-01", endDate: "2026-05-12", label: "Maio" }, realizedProfitInPeriod: 2100 },
      realProfitSnapshot: { sales: [{ saleId: "may-1" }, { saleId: "may-2" }], totals: { grossRevenue: 9000, netRevenue: 9000, realizedProfitFromSales: 2100 } },
      currentCashCompositionSnapshot: { consolidatedCash: 10000 },
      workingCapitalSnapshot: { protectedOperationalCapital: 3400 },
    },
    sales: {
      periodPerformance: {
        period: { label: "Maio", startDate: "2026-05-01", endDate: "2026-05-12", source: "current_month" },
        salesCount: 3,
        revenue: 12000,
        netRevenue: 12000,
        profit: 3000,
        marginPct: 25,
        includedStatuses: ["completed"],
        excludedStatuses: ["reserved", "cancelled", "canceled", "refunded", "estornado", "void"],
        firstSaleDate: "2026-05-02",
        lastSaleDate: "2026-05-10",
        topProducts: [
          { label: "iPad (11ª geração)", salesCount: 2, revenue: 7000, profit: 1800, marginPct: 25.7 },
          { label: "iPhone 13", salesCount: 1, revenue: 5000, profit: 1200, marginPct: 24 },
        ],
      },
      reinvestmentAnalysisWindow: {
        label: "Últimos 90 dias",
        startDate: "2026-02-12",
        endDate: "2026-05-12",
        salesCount: 3,
        source: "last_90_days",
      },
      reinvestmentCandidates: [
        {
          label: "iPad (11ª geração)",
          category: "iPad",
          productType: "iPad",
          model: "iPad (11ª geração)",
          recentSalesCount: 3,
          sampleSize: 3,
          totalRevenue: 10500,
          totalProfit: 2700,
          averageTicket: 3500,
          averageProfit: 900,
          averageMarginPct: 25,
          averageDaysInStock: 8,
          probableUnitCost: 2500,
          minRecentCost: 2400,
          currentStockCount: 0,
          currentStockValue: 0,
          stuckStockCount: 0,
          campaignDemandLeads: 8,
          campaignLostLeads: 6,
          activeLeadSignals: 1,
          lostLeadSignals: 6,
          confidence: "high",
        },
      ],
    },
    stock: {
      availableItems: [{
        id: "s1",
        name: "iPhone 13",
        category: "iPhone",
        color: "preto",
        daysInStock: 12,
        purchasePrice: 2500,
        suggestedPrice: 3300,
        status: "available",
        quantity: 1,
      }],
      stuckItems: [{
        id: "st1",
        name: "Apple Pencil",
        category: "Acessório",
        color: "branco",
        daysInStock: 80,
        purchasePrice: 500,
        suggestedPrice: 680,
        status: "available",
      }],
    },
    marketing: {
      campaigns: [{
        id: "c1",
        name: "iPad Meta",
        channel: "Meta",
        spend: 200,
        revenue: 3500,
        leads: 10,
        sales: 1,
        roi: 17.5,
        lostLeads: 9,
      }],
      forgottenLeads: [
        { id: "l1", name: "Lead perdido", status: "lost", productInterest: "iPad", originalIntent: null, classification: "lost", nextAction: null, nextActionAt: null, daysWithoutAction: 5 },
        { id: "l2", name: "Lead ativo", status: "contacted", productInterest: "iPhone", originalIntent: null, classification: "hot", nextAction: null, nextActionAt: null, daysWithoutAction: 1 },
      ],
    },
  } as unknown as OrionSnapshot
}

{
  const result = runOrionTool({ tool: "finance.receivables", snapshot: snapshot() })
  assert.equal(result.status, "ok")
  const data = result.data as { nearTermReceivables: number; shortTermReceivables: number; futureReceivables: number }
  assert.equal(data.nearTermReceivables, 1500)
  assert.equal(data.shortTermReceivables, 2300)
  assert.equal(data.futureReceivables, 1200)
}

{
  const result = runOrionTool({ tool: "sales.performance", snapshot: snapshot() })
  const data = result.data as { revenue: number; profit: number; salesCount: number; period: { label: string; source: string }; includedStatuses: string[] }
  assert.equal(data.revenue, 12000)
  assert.equal(data.profit, 2100)
  assert.equal(data.salesCount, 3)
  assert.equal(data.period.label, "Maio")
  assert.equal(data.period.source, "current_month")
  assert.deepEqual(data.includedStatuses, ["completed"])
  assert.ok(result.caveats.some((caveat) => caveat.includes("sale_date")))
}

{
  const result = runOrionTool({ tool: "sales.marginByProduct", snapshot: snapshot() })
  const data = result.data as { period: { label: string; source: string } }
  assert.equal(data.period.label, "Últimos 90 dias")
  assert.equal(data.period.source, "last_90_days")
  assert.ok(result.caveats.includes("Base de recompra: últimos 90 dias."))
}

{
  const result = runOrionTool({ tool: "leads.funnelHealth", snapshot: snapshot() })
  const data = result.data as { activeOpportunities: number; lostLeads: number; shouldFollowUpLostLeads: boolean }
  assert.equal(data.activeOpportunities, 1)
  assert.equal(data.lostLeads, 1)
  assert.equal(data.shouldFollowUpLostLeads, false)
}

{
  const result = runOrionTool({ tool: "reinvestment.decision", snapshot: snapshot() })
  assert.equal(result.status, "ok")
  assert.ok((result.data as { safeReinvestmentCap: number }).safeReinvestmentCap > 0)
}

{
  const results = runOrionTools({
    tools: ["finance.cashPosition", "sales.marginByProduct", "inventory.availableStock"],
    snapshot: snapshot(),
  })
  assert.equal(results.length, 3)
  assert.ok(results.every((result) => result.status !== "unavailable"))
}

{
  const missing = {
    executive: { pendingReceivables: 1000, liquidityForecast: { nextReceivables: [] } },
    finance: { pendingBalance: 1000 },
    sales: { reinvestmentCandidates: [] },
    stock: { availableItems: [], stuckItems: [] },
    marketing: { campaigns: [], forgottenLeads: [] },
  } as unknown as OrionSnapshot
  const receivables = runOrionTool({ tool: "finance.receivables", snapshot: missing })
  assert.equal(receivables.status, "partial")
  assert.ok(receivables.caveats.length > 0)
}

console.log("orion-tool-registry tests passed")
