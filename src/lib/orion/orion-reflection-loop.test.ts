import assert from "node:assert/strict"
import { buildDecisionReflection, buildDecisionReflections } from "./orion-reflection-loop"
import type { OrionDecisionMemoryItem } from "./orion-decision-memory-store"
import type { OrionSnapshot } from "./types"

function memory(overrides: Partial<OrionDecisionMemoryItem> = {}): OrionDecisionMemoryItem {
  return {
    id: "mem-1",
    companyId: "co-1",
    decisionType: "capital_allocation",
    title: "Recompra recomendada: iPad",
    recommendation: "Comprar iPad (11ª geração).",
    reason: "Margem e giro.",
    status: "open",
    priority: "high",
    confidence: "high",
    sourceQuestion: "Com R$ 4.000, o que eu compro?",
    decisionPayload: { entityLabel: "iPad (11ª geração)" },
    expectedOutcome: { action: "buy_ipad" },
    actualOutcome: {},
    resultStatus: "pending",
    reflection: "",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    resolvedAt: null,
    reviewAfter: null,
    ...overrides,
  }
}

function snapshot(overrides: Partial<OrionSnapshot> = {}): OrionSnapshot {
  return {
    sales: { reinvestmentCandidates: [], ...((overrides.sales as object) || {}) },
    stock: { availableItems: [], stuckItems: [], ...((overrides.stock as object) || {}) },
    marketing: { campaigns: [], ...((overrides.marketing as object) || {}) },
    ...overrides,
  } as unknown as OrionSnapshot
}

// 1. Capital allocation: successful → product sold with margin
{
  const ref = buildDecisionReflection({
    memory: memory(),
    snapshot: snapshot({
      sales: {
        reinvestmentCandidates: [{
          label: "iPad (11ª geração)",
          category: "iPad",
          productType: "iPad",
          model: "iPad",
          recentSalesCount: 3,
          sampleSize: 3,
          totalRevenue: 10500,
          totalProfit: 2700,
          averageTicket: 3500,
          averageProfit: 900,
          averageMarginPct: 25,
          averageDaysInStock: 7,
          probableUnitCost: 2500,
          minRecentCost: 2400,
          currentStockCount: 0,
          currentStockValue: 0,
          stuckStockCount: 0,
          campaignDemandLeads: 5,
          campaignLostLeads: 2,
          activeLeadSignals: 1,
          lostLeadSignals: 2,
          confidence: "high",
        }],
      },
    } as unknown as Partial<OrionSnapshot>),
  })
  assert.equal(ref.resultStatus, "successful")
  assert.match(ref.reflection, /se confirmou|confirmou/i)
}

// 2. Capital allocation: failed → stuck stock
{
  const ref = buildDecisionReflection({
    memory: memory(),
    snapshot: snapshot({
      stock: {
        availableItems: [],
        stuckItems: [{ id: "s1", name: "iPad (11ª geração)", category: "iPad", color: null, daysInStock: 80, purchasePrice: 2500, suggestedPrice: 3300, status: "available" }],
      },
    } as unknown as Partial<OrionSnapshot>),
  })
  assert.equal(ref.resultStatus, "failed")
  assert.match(ref.reflection, /parado|estoque parado/i)
}

// 3. Capital allocation: mixed → sold but low margin
{
  const ref = buildDecisionReflection({
    memory: memory(),
    snapshot: snapshot({
      sales: {
        reinvestmentCandidates: [{
          label: "iPad (11ª geração)",
          category: "iPad",
          productType: "iPad",
          model: "iPad",
          recentSalesCount: 2,
          sampleSize: 2,
          totalRevenue: 6000,
          totalProfit: 400,
          averageTicket: 3000,
          averageProfit: 200,
          averageMarginPct: 6,
          averageDaysInStock: 12,
          probableUnitCost: 2800,
          minRecentCost: 2800,
          currentStockCount: 0,
          currentStockValue: 0,
          stuckStockCount: 0,
          campaignDemandLeads: 0,
          campaignLostLeads: 0,
          activeLeadSignals: 0,
          lostLeadSignals: 0,
          confidence: "low",
        }],
      },
    } as unknown as Partial<OrionSnapshot>),
  })
  assert.equal(ref.resultStatus, "mixed")
}

// 4. Capital allocation: inconclusive when no entity label
{
  const ref = buildDecisionReflection({
    memory: memory({ decisionPayload: {} }),
    snapshot: snapshot(),
  })
  assert.equal(ref.resultStatus, "inconclusive")
}

// 5. Marketing strategy: campaign generated lead but no sale → failed
{
  const ref = buildDecisionReflection({
    memory: memory({ decisionType: "marketing_strategy", decisionPayload: { entityLabel: "iPad" } }),
    snapshot: snapshot({
      marketing: {
        campaigns: [{ id: "c1", name: "iPad Meta", channel: "Meta", spend: 200, revenue: 0, leads: 8, sales: 0, roi: 0, lostLeads: 8 }],
      },
    } as unknown as Partial<OrionSnapshot>),
  })
  assert.equal(ref.resultStatus, "failed")
  assert.match(ref.reflection, /lead|sem venda/i)
}

// 6. Marketing strategy: campaign converted with ROI > 1 → successful
{
  const ref = buildDecisionReflection({
    memory: memory({ decisionType: "marketing_strategy", decisionPayload: { entityLabel: "iPad" } }),
    snapshot: snapshot({
      marketing: {
        campaigns: [{ id: "c1", name: "iPad Meta", channel: "Meta", spend: 200, revenue: 3500, leads: 10, sales: 1, roi: 17.5, lostLeads: 9 }],
      },
    } as unknown as Partial<OrionSnapshot>),
  })
  assert.equal(ref.resultStatus, "successful")
}

// 7. Inventory priority: cleared → successful
{
  const ref = buildDecisionReflection({
    memory: memory({ decisionType: "inventory_priority", decisionPayload: { entityLabel: "Apple Pencil" } }),
    snapshot: snapshot(),
  })
  assert.equal(ref.resultStatus, "successful")
}

// 8. Inventory priority: still stuck → pending
{
  const ref = buildDecisionReflection({
    memory: memory({ decisionType: "inventory_priority", decisionPayload: { entityLabel: "Apple Pencil" } }),
    snapshot: snapshot({
      stock: {
        availableItems: [],
        stuckItems: [{ id: "s2", name: "Apple Pencil", category: "Acessório", color: "branco", daysInStock: 80, purchasePrice: 500, suggestedPrice: 680, status: "available" }],
      },
    } as unknown as Partial<OrionSnapshot>),
  })
  assert.equal(ref.resultStatus, "pending")
}

// 9. buildDecisionReflections filters resolved memories
{
  const open = memory()
  const done = memory({ id: "mem-2", status: "done" })
  const refs = buildDecisionReflections(snapshot(), [open, done])
  assert.equal(refs.length, 1)
  assert.equal(refs[0].memoryId, "mem-1")
}

// 10. Insufficient data → no fabricated causality
{
  const ref = buildDecisionReflection({
    memory: memory(),
    snapshot: snapshot(),
  })
  assert.equal(ref.resultStatus, "inconclusive")
  assert.equal(ref.reflection.includes("vendeu"), false)
  assert.equal(ref.reflection.includes("comprou"), false)
}

console.log("orion-reflection-loop tests passed")
