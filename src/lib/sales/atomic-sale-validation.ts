export class SaleOperationalError extends Error {
  readonly statusCode = 422

  constructor(message: string) {
    super(message)
    this.name = "SaleOperationalError"
  }
}

export type AdditionalItemForStockValidation = {
  itemId: string
  name?: string | null
  qty: number
}

export type LockedInventoryForSale = {
  id: string
  quantity: string | number | null
  status: string | null
}

export type AdditionalItemStockPlan = {
  itemId: string
  currentQuantity: number
  requestedQuantity: number
  nextQuantity: number
  nextStatus: "in_stock" | "sold" | "reserved"
}

export type FinancialAccountOwnershipRow = {
  id: string
}

function normalizeQuantity(value: string | number | null): number {
  const quantity = Number(value || 0)
  return Number.isFinite(quantity) ? quantity : 0
}

function itemLabel(item: AdditionalItemForStockValidation) {
  return item.name || item.itemId
}

export function buildAdditionalItemStockPlan(input: {
  items: AdditionalItemForStockValidation[]
  lockedInventoryRows: LockedInventoryForSale[]
  emptyStockStatus: "sold" | "reserved"
}): AdditionalItemStockPlan[] {
  const rowsById = new Map(input.lockedInventoryRows.map((row) => [row.id, row]))
  const aggregated = new Map<string, { item: AdditionalItemForStockValidation; requestedQuantity: number }>()

  for (const item of input.items) {
    const requestedQuantity = positiveQuantity(Number(item.qty || 1))
    const current = aggregated.get(item.itemId)
    if (current) {
      current.requestedQuantity += requestedQuantity
    } else {
      aggregated.set(item.itemId, { item, requestedQuantity })
    }
  }

  const plans: AdditionalItemStockPlan[] = []

  for (const [itemId, aggregate] of aggregated) {
    const row = rowsById.get(itemId)
    if (!row) {
      throw new SaleOperationalError(`Item adicional não está disponível para venda: ${itemLabel(aggregate.item)}`)
    }

    if (row.status !== "active" && row.status !== "in_stock") {
      throw new SaleOperationalError(`Item adicional não está disponível para venda: ${itemLabel(aggregate.item)}`)
    }

    const currentQuantity = normalizeQuantity(row.quantity)
    if (currentQuantity < aggregate.requestedQuantity) {
      throw new SaleOperationalError(`Item adicional não está disponível para venda: ${itemLabel(aggregate.item)}`)
    }

    const nextQuantity = currentQuantity - aggregate.requestedQuantity
    plans.push({
      itemId,
      currentQuantity,
      requestedQuantity: aggregate.requestedQuantity,
      nextQuantity,
      nextStatus: nextQuantity > 0 ? "in_stock" : input.emptyStockStatus,
    })
  }

  return plans
}

function positiveQuantity(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}

export function validateFinancialAccountOwnership(input: {
  requestedAccountIds: string[]
  accountRows: FinancialAccountOwnershipRow[]
}) {
  const foundIds = new Set(input.accountRows.map((row) => row.id))

  for (const accountId of input.requestedAccountIds) {
    if (!foundIds.has(accountId)) {
      throw new SaleOperationalError("Conta financeira inválida ou não pertence à empresa.")
    }
  }
}
