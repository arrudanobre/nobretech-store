export type InventoryCostingItem = {
  purchase_price?: number | string | null
  quantity?: number | string | null
  qty?: number | string | null
  unit_cost?: number | string | null
}

function toPositiveNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

export function getInventoryQuantity(item: InventoryCostingItem) {
  const quantity = toPositiveNumber(item.quantity ?? item.qty ?? 1)
  return quantity > 0 ? quantity : 1
}

export function getInventoryUnitCost(item: InventoryCostingItem) {
  return toPositiveNumber(item.unit_cost ?? item.purchase_price)
}

export function getInventoryCapitalValue(item: InventoryCostingItem) {
  return Math.round(getInventoryUnitCost(item) * getInventoryQuantity(item) * 100) / 100
}

export function getInventoryCostBreakdown(item: InventoryCostingItem) {
  const unitCost = getInventoryUnitCost(item)
  const quantity = getInventoryQuantity(item)
  return {
    unitCost,
    quantity,
    capitalValue: Math.round(unitCost * quantity * 100) / 100,
  }
}
