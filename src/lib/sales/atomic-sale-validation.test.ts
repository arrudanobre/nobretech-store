import assert from "node:assert/strict"
import {
  SaleOperationalError,
  buildAdditionalItemStockPlan,
  validateFinancialAccountOwnership,
} from "./atomic-sale-validation"

const itemA = "00000000-0000-4000-8000-000000000001"
const itemB = "00000000-0000-4000-8000-000000000002"
const accountA = "00000000-0000-4000-8000-000000000010"
const accountB = "00000000-0000-4000-8000-000000000011"

function assertOperationalError(fn: () => unknown, message: string) {
  assert.throws(fn, (error) => error instanceof SaleOperationalError && error.message === message)
}

{
  assertOperationalError(
    () =>
      buildAdditionalItemStockPlan({
        items: [{ itemId: itemA, name: "Capa MagSafe", qty: 1 }],
        lockedInventoryRows: [],
        emptyStockStatus: "sold",
      }),
    "Item adicional não está disponível para venda: Capa MagSafe"
  )
}

{
  assertOperationalError(
    () =>
      buildAdditionalItemStockPlan({
        items: [{ itemId: itemA, name: "Capa MagSafe", qty: 1 }],
        lockedInventoryRows: [{ id: itemB, quantity: 2, status: "in_stock" }],
        emptyStockStatus: "sold",
      }),
    "Item adicional não está disponível para venda: Capa MagSafe"
  )
}

{
  assertOperationalError(
    () =>
      buildAdditionalItemStockPlan({
        items: [{ itemId: itemA, name: "Capa MagSafe", qty: 1 }],
        lockedInventoryRows: [{ id: itemA, quantity: 2, status: "sold" }],
        emptyStockStatus: "sold",
      }),
    "Item adicional não está disponível para venda: Capa MagSafe"
  )
}

{
  assertOperationalError(
    () =>
      buildAdditionalItemStockPlan({
        items: [
          { itemId: itemA, name: "Capa MagSafe", qty: 2 },
          { itemId: itemA, name: "Capa MagSafe", qty: 2 },
        ],
        lockedInventoryRows: [{ id: itemA, quantity: 3, status: "in_stock" }],
        emptyStockStatus: "sold",
      }),
    "Item adicional não está disponível para venda: Capa MagSafe"
  )
}

{
  const plans = buildAdditionalItemStockPlan({
    items: [
      { itemId: itemA, name: "Capa MagSafe", qty: 1 },
      { itemId: itemA, name: "Capa MagSafe", qty: 2 },
    ],
    lockedInventoryRows: [{ id: itemA, quantity: "3", status: "active" }],
    emptyStockStatus: "reserved",
  })
  assert.deepEqual(plans, [
    {
      itemId: itemA,
      currentQuantity: 3,
      requestedQuantity: 3,
      nextQuantity: 0,
      nextStatus: "reserved",
    },
  ])
}

{
  assert.doesNotThrow(() =>
    validateFinancialAccountOwnership({
      requestedAccountIds: [accountA],
      accountRows: [{ id: accountA }],
    })
  )
}

{
  assertOperationalError(
    () =>
      validateFinancialAccountOwnership({
        requestedAccountIds: [accountA],
        accountRows: [{ id: accountB }],
      }),
    "Conta financeira inválida ou não pertence à empresa."
  )
}

console.log("atomic-sale-validation tests passed")
