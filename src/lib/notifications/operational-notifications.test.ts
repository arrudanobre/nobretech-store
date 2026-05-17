import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildOperationalNotifications,
  type TransactionInput,
  type InventoryStaleInput,
} from "./operational-notifications"

const TODAY = "2026-05-17"

function makeTx(overrides: Partial<TransactionInput> & Pick<TransactionInput, "type" | "due_date">): TransactionInput {
  return {
    id: crypto.randomUUID(),
    status: "pending",
    amount: 500,
    description: null,
    ...overrides,
  }
}

function makeInventory(overrides: Partial<InventoryStaleInput>): InventoryStaleInput {
  return {
    id: crypto.randomUUID(),
    logistics_status: "in_stock",
    commercial_status: "available",
    status: "in_stock",
    purchase_price: 1000,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

// ─── Receivables ──────────────────────────────────────────────

describe("receivable upcoming 3 days → warning", () => {
  it("generates warning when income pending due in 3 days", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "income", due_date: "2026-05-20" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "receivables_upcoming_3d")
    assert.ok(n, "should have receivables_upcoming_3d")
    assert.equal(n!.severity, "warning")
  })

  it("generates critical when income pending due today", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "income", due_date: TODAY })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "receivables_upcoming_3d")
    assert.ok(n)
    assert.equal(n!.severity, "critical")
  })

  it("does not generate when income due in 4+ days", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "income", due_date: "2026-05-21" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "receivables_upcoming_3d")
    assert.equal(n, undefined)
  })

  it("does not generate when income is reconciled", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "income", due_date: TODAY, status: "reconciled" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "receivables_upcoming_3d")
    assert.equal(n, undefined)
  })
})

// ─── Receivables overdue ──────────────────────────────────────

describe("receivable overdue → critical", () => {
  it("generates critical when income pending past due", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "income", due_date: "2026-05-10" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "receivables_overdue")
    assert.ok(n)
    assert.equal(n!.severity, "critical")
  })

  it("groups multiple overdue receivables into one notification", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [
        makeTx({ type: "income", due_date: "2026-05-01", amount: 300 }),
        makeTx({ type: "income", due_date: "2026-05-05", amount: 700 }),
      ],
      inventory: [],
    })
    const n = result.find((x) => x.id === "receivables_overdue")
    assert.ok(n)
    assert.equal(n!.count, 2)
    assert.equal(n!.amount, 1000)
  })
})

// ─── Payables upcoming ────────────────────────────────────────

describe("payable upcoming 7 days → warning", () => {
  it("generates warning when expense pending due in 7 days", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "expense", due_date: "2026-05-23" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "payables_upcoming_7d")
    assert.ok(n)
    assert.equal(n!.severity, "warning")
  })

  it("does not generate when expense due in 8+ days", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "expense", due_date: "2026-05-25" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "payables_upcoming_7d")
    assert.equal(n, undefined)
  })

  it("does not generate when expense is reconciled", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "expense", due_date: "2026-05-20", status: "reconciled" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "payables_upcoming_7d")
    assert.equal(n, undefined)
  })
})

// ─── Payables overdue ─────────────────────────────────────────

describe("payable overdue → critical", () => {
  it("generates critical when expense pending past due", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [makeTx({ type: "expense", due_date: "2026-05-01" })],
      inventory: [],
    })
    const n = result.find((x) => x.id === "payables_overdue")
    assert.ok(n)
    assert.equal(n!.severity, "critical")
  })
})

// ─── Inventory stale 20d ──────────────────────────────────────

describe("inventory stale >20 days → warning", () => {
  it("generates warning when in_stock item created 25 days ago", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [makeInventory({ created_at: "2026-04-22T00:00:00Z" })], // 25 days ago
    })
    const n = result.find((x) => x.id === "inventory_stale_20d")
    assert.ok(n)
    assert.equal(n!.severity, "warning")
  })

  it("does not generate when item created 15 days ago", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [makeInventory({ created_at: "2026-05-02T00:00:00Z" })], // 15 days ago
    })
    const n = result.find((x) => x.id === "inventory_stale_20d")
    assert.equal(n, undefined)
  })
})

// ─── Inventory stale 45d ──────────────────────────────────────

describe("inventory stale >45 days → critical", () => {
  it("generates critical when in_stock item created 50 days ago", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [makeInventory({ created_at: "2026-03-28T00:00:00Z" })], // ~50 days ago
    })
    const n = result.find((x) => x.id === "inventory_stale_45d")
    assert.ok(n)
    assert.equal(n!.severity, "critical")
  })

  it("item stale >45d is NOT in stale_20d group (separate buckets)", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [makeInventory({ created_at: "2026-03-28T00:00:00Z" })],
    })
    const n20 = result.find((x) => x.id === "inventory_stale_20d")
    assert.equal(n20, undefined, "should not be in 20d bucket")
  })
})

// ─── Excluded statuses ────────────────────────────────────────

describe("sold/returned/under_repair excluded from stale inventory", () => {
  it("sold item is not counted as stale", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [
        makeInventory({
          created_at: "2026-01-01T00:00:00Z",
          commercial_status: "sold",
          logistics_status: "unavailable",
        }),
      ],
    })
    const any = result.find((x) => x.type === "inventory_stale")
    assert.equal(any, undefined)
  })

  it("reserved item is not counted as available-for-sale stale", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [
        makeInventory({
          created_at: "2026-01-01T00:00:00Z",
          commercial_status: "reserved",
          logistics_status: "in_stock",
        }),
      ],
    })
    const any = result.find((x) => x.type === "inventory_stale")
    assert.equal(any, undefined)
  })

  it("in_transit item is not counted as stale", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [],
      inventory: [
        makeInventory({
          created_at: "2026-01-01T00:00:00Z",
          logistics_status: "in_transit",
          commercial_status: "reservable",
        }),
      ],
    })
    const any = result.find((x) => x.type === "inventory_stale")
    assert.equal(any, undefined)
  })
})

// ─── Ordering ─────────────────────────────────────────────────

describe("notifications ordered by severity", () => {
  it("critical comes before warning", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [
        makeTx({ type: "income", due_date: "2026-05-20" }),       // warning: upcoming 3d
        makeTx({ type: "expense", due_date: "2026-05-01" }),       // critical: overdue
      ],
      inventory: [],
    })
    assert.ok(result.length >= 2)
    assert.equal(result[0].severity, "critical")
  })
})

// ─── Grouping / deduplication ─────────────────────────────────

describe("grouping avoids duplicate alerts", () => {
  it("multiple overdue receivables produce one notification", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [
        makeTx({ type: "income", due_date: "2026-04-01" }),
        makeTx({ type: "income", due_date: "2026-04-10" }),
        makeTx({ type: "income", due_date: "2026-05-01" }),
      ],
      inventory: [],
    })
    const overdues = result.filter((x) => x.id === "receivables_overdue")
    assert.equal(overdues.length, 1)
    assert.equal(overdues[0].count, 3)
  })

  it("multiple upcoming payables produce one notification", () => {
    const result = buildOperationalNotifications({
      today: TODAY,
      transactions: [
        makeTx({ type: "expense", due_date: "2026-05-18" }),
        makeTx({ type: "expense", due_date: "2026-05-20" }),
        makeTx({ type: "expense", due_date: "2026-05-22" }),
      ],
      inventory: [],
    })
    const payables = result.filter((x) => x.id === "payables_upcoming_7d")
    assert.equal(payables.length, 1)
    assert.equal(payables[0].count, 3)
  })
})
