import assert from "node:assert/strict"
import { buildOrionProactiveAlerts, type OrionProactiveAlert } from "./orion-proactive-alerts"
import type { OrionOperationalMemoryItem } from "./orion-operational-memory-store"
import type { OrionSnapshot } from "./types"

function snapshot(overrides: {
  profitAfterWithdrawals?: number
  safeWithdrawalAmount?: number
  cash?: number
  payables7d?: number
  receivables7d?: number
  stuck?: boolean
  lead?: boolean
  campaign?: boolean
} = {}): OrionSnapshot {
  return {
    generatedAt: "2026-05-12T12:00:00.000Z",
    companyName: "NOBRETECH STORE",
    dataBasis: "internal",
    executive: {
      liquidityForecast: {
        payables7d: overrides.payables7d ?? 0,
        receivables7d: overrides.receivables7d ?? 0,
      },
    },
    stock: {
      stuckItems: overrides.stuck ? [{
        id: "inventory-1",
        name: "iPhone 14",
        category: "iPhone",
        color: "Preto",
        daysInStock: 65,
        purchasePrice: 2500,
        suggestedPrice: 3400,
        status: "available",
      }] : [],
    },
    marketing: {
      forgottenLeads: overrides.lead ? [{
        id: "lead-1",
        name: "Patricia",
        status: "hot_negotiation",
        campaignName: "iPhone",
        productInterest: "iPhone 14",
        originalIntent: "iPhone 14",
        classification: "hot",
        nextAction: null,
        nextActionAt: null,
        daysWithoutAction: 3,
      }] : [],
      campaigns: overrides.campaign ? [{
        id: "campaign-1",
        name: "Campanha iPad",
        channel: "instagram",
        spend: 120,
        revenue: 0,
        leads: 4,
        sales: 0,
        roi: 0,
      }] : [],
    },
    finance: {
      reconciledCashBalance: overrides.cash ?? 5000,
      profitAvailabilitySnapshot: {
        profitAfterWithdrawals: overrides.profitAfterWithdrawals ?? 2000,
        period: { preset: "current_month" },
      },
      currentCashCompositionSnapshot: {
        availableForWithdrawal: overrides.profitAfterWithdrawals ?? 2000,
      },
      workingCapitalSnapshot: {
        safeWithdrawalAmount: overrides.safeWithdrawalAmount ?? 1500,
      },
    },
  } as unknown as OrionSnapshot
}

function memory(): OrionOperationalMemoryItem {
  return {
    id: "memory-1",
    companyId: "company-1",
    memoryType: "owner_decision",
    title: "Segurar desconto do iPhone 14",
    summary: "Usuário decidiu não baixar preço do iPhone 14 agora.",
    entityType: "inventory",
    entityId: "inventory-1",
    status: "open",
    importance: "medium",
    source: "orion",
    evidence: {},
    metadata: { memoryKey: "decision:discount:iphone14" },
    lastSeenAt: "2026-05-12T12:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-05-12T12:00:00.000Z",
    updatedAt: "2026-05-12T12:00:00.000Z",
  }
}

function assertPersistibleKeys(alerts: OrionProactiveAlert[]) {
  for (const alert of alerts) {
    assert.equal(typeof alert.metadata.memoryKey, "string")
    assert.ok(alert.metadata.memoryKey.length > 4)
  }
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ profitAfterWithdrawals: -100, cash: 100, payables7d: 900, receivables7d: 0 }),
    memoryItems: [],
  })
  assert.equal(alerts[0].category, "financial")
  assert.equal(alerts[0].priority, "critical")
  assertPersistibleKeys(alerts)
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ profitAfterWithdrawals: 2500, safeWithdrawalAmount: 1000, cash: 5000, payables7d: 300, receivables7d: 1000 }),
    memoryItems: [],
  })
  assert.equal(alerts.some((alert) => alert.category === "financial" && alert.priority === "critical"), false)
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ stuck: true }),
    memoryItems: [],
  })
  assert.ok(alerts.some((alert) => alert.category === "inventory" && alert.entityId === "inventory-1"))
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ lead: true }),
    memoryItems: [],
  })
  assert.equal(alerts[0].category, "lead")
  assert.equal(alerts[0].priority, "high")
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot(),
    memoryItems: [memory()],
  })
  assert.ok(alerts.some((alert) => alert.category === "operational" && alert.message.includes("memória operacional")))
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ profitAfterWithdrawals: -100, cash: 100, payables7d: 900, receivables7d: 0, stuck: true, lead: true, campaign: true }),
    memoryItems: [memory()],
  })
  assert.equal(alerts.length, 3)
  assert.deepEqual(alerts.map((alert) => alert.priority), ["critical", "high", "high"])
}

{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot(),
    memoryItems: [],
  })
  assert.deepEqual(alerts, [])
}

console.log("orion-proactive-alerts tests passed")
