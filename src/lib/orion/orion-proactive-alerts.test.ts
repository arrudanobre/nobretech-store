import assert from "node:assert/strict"
import { buildOrionProactiveAlerts, filterStaleOrionMemoryItems, type OrionProactiveAlert } from "./orion-proactive-alerts"
import type { OrionOperationalMemoryItem } from "./orion-operational-memory-store"
import type { OrionSnapshot } from "./types"

type SnapshotOverrides = {
  profitAfterWithdrawals?: number
  safeWithdrawalAmount?: number
  cash?: number
  payables7d?: number
  receivables7d?: number
  stuck?: boolean
  lead?: boolean
  // campaign: true = spend + leads + no sales/revenue (triggers no-sale alert)
  campaign?: boolean
  // campaignWithSale: true = spend + leads + attributed sales + ROI (10 leads, 1 sale, 9 lost)
  campaignWithSale?: boolean
}

function snapshot(overrides: SnapshotOverrides = {}): OrionSnapshot {
  let campaigns: OrionSnapshot["marketing"]["campaigns"] = []
  if (overrides.campaign) {
    campaigns = [{
      id: "campaign-1",
      name: "Campanha iPad",
      channel: "instagram",
      spend: 120,
      revenue: 0,
      leads: 4,
      sales: 0,
      roi: 0,
      lostLeads: 4,
    }]
  } else if (overrides.campaignWithSale) {
    campaigns = [{
      id: "campaign-2",
      name: "Campanha de Vendas do iPad",
      channel: "instagram",
      spend: 169,
      revenue: 2650,
      leads: 10,
      sales: 1,
      roi: 15.7,
      lostLeads: 9,
    }]
  }

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
      campaigns,
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

// Financial: critical cash pressure
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ profitAfterWithdrawals: -100, cash: 100, payables7d: 900, receivables7d: 0 }),
    memoryItems: [],
  })
  assert.equal(alerts[0].category, "financial")
  assert.equal(alerts[0].priority, "critical")
  assertPersistibleKeys(alerts)
}

// Financial: no critical when covered
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ profitAfterWithdrawals: 2500, safeWithdrawalAmount: 1000, cash: 5000, payables7d: 300, receivables7d: 1000 }),
    memoryItems: [],
  })
  assert.equal(alerts.some((alert) => alert.category === "financial" && alert.priority === "critical"), false)
}

// Inventory: stuck item alert
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ stuck: true }),
    memoryItems: [],
  })
  assert.ok(alerts.some((alert) => alert.category === "inventory" && alert.entityId === "inventory-1"))
}

// Lead: forgotten hot lead
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ lead: true }),
    memoryItems: [],
  })
  assert.equal(alerts[0].category, "lead")
  assert.equal(alerts[0].priority, "high")
}

// Memory: open decision surfaces as operational alert
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot(),
    memoryItems: [memory()],
  })
  assert.ok(alerts.some((alert) => alert.category === "operational" && alert.message.includes("memória operacional")))
}

// Combined: top 3 priority ordering
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ profitAfterWithdrawals: -100, cash: 100, payables7d: 900, receivables7d: 0, stuck: true, lead: true, campaign: true }),
    memoryItems: [memory()],
  })
  assert.equal(alerts.length, 3)
  assert.deepEqual(alerts.map((alert) => alert.priority), ["critical", "high", "high"])
}

// Empty: no alerts when snapshot is clean
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot(),
    memoryItems: [],
  })
  assert.deepEqual(alerts, [])
}

// Campaign with attributed sale must NOT generate "sem venda" alert
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ campaignWithSale: true }),
    memoryItems: [],
  })
  assert.ok(
    !alerts.some((a) => a.title === "Campanha gerou lead, mas não venda"),
    "campaign with attributed sale must not generate no-sale alert"
  )
}

// Campaign with attributed sales + many lost leads generates conversion review alert
{
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ campaignWithSale: true }),
    memoryItems: [],
  })
  const conversionAlert = alerts.find((a) => a.id.startsWith("campaign-conversion-"))
  assert.ok(conversionAlert, "should generate conversion review alert")
  assert.equal(conversionAlert!.category, "marketing")
  assert.ok(
    conversionAlert!.evidence.some((e) => e.label === "ROI"),
    "evidence should include ROI"
  )
  assert.ok(
    conversionAlert!.evidence.some((e) => e.label === "Leads perdidos"),
    "evidence should include leads perdidos"
  )
  assert.ok(
    conversionAlert!.evidence.some((e) => e.label === "Vendas atribuídas"),
    "evidence should include vendas atribuídas"
  )
  assertPersistibleKeys(alerts)
}

// Deduplication: memory with same memoryKey as active alert must not create a second alert
{
  const memSameKey: OrionOperationalMemoryItem = {
    ...memory(),
    id: "memory-campaign",
    memoryType: "open_alert",
    title: "Campanha sem venda",
    summary: "Campanha gerou lead mas sem venda.",
    entityType: "campaign",
    entityId: "campaign-1",
    metadata: { memoryKey: "campaign:marketing:campaign-1", alertSubtype: "campaign_no_sale" },
  }
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ campaign: true }),
    memoryItems: [memSameKey],
  })
  // Only the snapshot-generated campaign alert should be present, not a duplicate from memory
  const campaignAlerts = alerts.filter(
    (a) => a.entityId === "campaign-1" || (a.metadata.memoryKey as string).includes("campaign-1")
  )
  assert.equal(campaignAlerts.length, 1, "same memoryKey must not produce duplicate alert")
}

// filterStaleOrionMemoryItems: "no-sale" memory + campaign now has attributed sales → stale
{
  const staleMemory: OrionOperationalMemoryItem = {
    ...memory(),
    id: "memory-stale-nosale",
    memoryType: "open_alert",
    title: "Campanha gerou lead, mas não venda",
    summary: "Campanha iPad gerou leads sem venda.",
    entityType: "campaign",
    entityId: "campaign-2",
    metadata: { memoryKey: "campaign:marketing:campaign-2", alertSubtype: "campaign_no_sale", campaignId: "campaign-2" },
  }
  const { valid, stale } = filterStaleOrionMemoryItems([staleMemory], snapshot({ campaignWithSale: true }))
  assert.equal(stale.length, 1, "no-sale memory contradicted by attributed sales should be stale")
  assert.equal(valid.length, 0)
}

// filterStaleOrionMemoryItems: legacy key "campaign:follow-up:X" + attributed sales → stale
{
  const legacyMemory: OrionOperationalMemoryItem = {
    ...memory(),
    id: "memory-legacy",
    memoryType: "open_alert",
    title: "Campanha gerou lead, mas não venda",
    summary: ".",
    entityType: "campaign",
    entityId: "campaign-2",
    metadata: { memoryKey: "campaign:follow-up:campaign-2" },
  }
  const { stale } = filterStaleOrionMemoryItems([legacyMemory], snapshot({ campaignWithSale: true }))
  assert.equal(stale.length, 1, "legacy follow-up key with attributed sales should be stale")
}

// filterStaleOrionMemoryItems: non-contradictory memory stays valid
{
  const validMemory: OrionOperationalMemoryItem = {
    ...memory(),
    id: "memory-noncontradict",
    memoryType: "open_alert",
    title: "Campanha gerou lead, mas não venda",
    summary: ".",
    entityType: "campaign",
    entityId: "campaign-1",
    metadata: { memoryKey: "campaign:marketing:campaign-1", alertSubtype: "campaign_no_sale" },
  }
  // campaign-1 has no sales → memory is not contradicted
  const { valid, stale } = filterStaleOrionMemoryItems([validMemory], snapshot({ campaign: true }))
  assert.equal(valid.length, 1, "memory for campaign with no sales should stay valid")
  assert.equal(stale.length, 0)
}

// buildOrionProactiveAlerts: stale memory suppressed, conversion alert surfaced
{
  const staleMemory: OrionOperationalMemoryItem = {
    ...memory(),
    id: "memory-stale-alert",
    memoryType: "open_alert",
    title: "Campanha gerou lead, mas não venda",
    summary: ".",
    entityType: "campaign",
    entityId: "campaign-2",
    metadata: { memoryKey: "campaign:marketing:campaign-2", alertSubtype: "campaign_no_sale" },
  }
  const alerts = buildOrionProactiveAlerts({
    snapshot: snapshot({ campaignWithSale: true }),
    memoryItems: [staleMemory],
  })
  assert.ok(!alerts.some((a) => a.title === "Campanha gerou lead, mas não venda"), "stale memory must not appear as alert")
  assert.ok(alerts.some((a) => a.id.startsWith("campaign-conversion-")), "conversion alert must be shown instead")
}

console.log("orion-proactive-alerts tests passed")
