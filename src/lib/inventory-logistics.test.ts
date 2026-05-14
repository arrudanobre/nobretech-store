import assert from "node:assert/strict"
import {
  buildInventoryBatchReceiptUpdate,
  getInventoryCommercialStatus,
  getInventoryLogisticsStatus,
  getInventorySummary,
  getInventoryTimingLabel,
  isInventoryItemAvailableForImmediateSale,
  isInventoryItemOfferable,
  isInventoryItemReservable,
  type InventoryOperationalItem,
} from "./inventory-logistics"

const activeLegacy: InventoryOperationalItem = {
  status: "active",
  purchase_price: 1000,
  purchase_date: "2026-05-09",
  grade: "A",
  imei: "356000000000001",
  catalog_id: "catalog-1",
}

{
  assert.equal(getInventoryLogisticsStatus(activeLegacy), "in_stock")
  assert.equal(getInventoryCommercialStatus(activeLegacy), "available")
}

{
  const sold = { ...activeLegacy, status: "sold" }
  assert.equal(getInventoryCommercialStatus(sold), "sold")
  assert.equal(isInventoryItemReservable(sold), false)
}

{
  const inTransit = {
    ...activeLegacy,
    logistics_status: "in_transit",
    commercial_status: "reservable",
    expected_arrival_date: "2026-05-18",
    status: "pending",
  }
  assert.equal(isInventoryItemReservable(inTransit), true)
  assert.equal(isInventoryItemAvailableForImmediateSale(inTransit), false)
  assert.equal(isInventoryItemOfferable(inTransit), false)
  assert.equal(getInventoryTimingLabel(inTransit, "2026-05-13"), "Chega em 5 dias")
}

{
  assert.equal(isInventoryItemOfferable(activeLegacy), true)
  assert.equal(getInventoryTimingLabel(activeLegacy, "2026-05-13"), "4d")
}

{
  const late = {
    ...activeLegacy,
    logistics_status: "in_transit",
    commercial_status: "reservable",
    expected_arrival_date: "2026-05-11",
    status: "pending",
  }
  assert.equal(getInventoryTimingLabel(late, "2026-05-13"), "Atrasado 2 dias")
}

{
  const items: InventoryOperationalItem[] = [
    activeLegacy,
    { ...activeLegacy, id: "transit" } as InventoryOperationalItem,
    {
      ...activeLegacy,
      logistics_status: "in_transit",
      commercial_status: "reservable",
      expected_arrival_date: "2026-05-18",
      status: "pending",
      quantity: 2,
    },
    { ...activeLegacy, commercial_status: "reserved", status: "reserved" },
    { ...activeLegacy, logistics_status: "received_pending_review", commercial_status: "blocked", status: "pending" },
  ]
  const summary = getInventorySummary(items)
  assert.equal(summary.inStock, 2)
  assert.equal(summary.inTransit, 2)
  assert.equal(summary.reservable, 2)
  assert.equal(summary.reserved, 1)
  assert.equal(summary.pendingReview, 1)
}

{
  const update = buildInventoryBatchReceiptUpdate("available")
  assert.equal(update.purchase.logistics_status, "received")
  assert.equal(update.inventory.logistics_status, "in_stock")
  assert.equal(update.inventory.commercial_status, "available")
  assert.equal(update.inventory.status, "in_stock")

  const reviewUpdate = buildInventoryBatchReceiptUpdate("pending_review")
  assert.equal(reviewUpdate.inventory.logistics_status, "received_pending_review")
  assert.equal(reviewUpdate.inventory.commercial_status, "blocked")
  assert.equal(reviewUpdate.inventory.status, "pending")
}

console.log("inventory-logistics tests passed")
