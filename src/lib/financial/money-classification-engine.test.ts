import assert from "node:assert/strict"
import {
  buildMoneyClassificationSnapshot,
  classifyLedgerMovement,
  classifySaleIncome,
  classifyTransaction,
} from "./money-classification-engine"

function assertFlags(
  actual: ReturnType<typeof classifyTransaction>,
  expected: {
    affectsCash: boolean
    affectsProfit: boolean
    affectsWorkingCapital: boolean
    affectsAvailableLiquidity: boolean
    affectsOwnerEquity: boolean
  }
) {
  assert.equal(actual.affectsCash, expected.affectsCash, `${actual.movementType} affectsCash`)
  assert.equal(actual.affectsProfit, expected.affectsProfit, `${actual.movementType} affectsProfit`)
  assert.equal(actual.affectsWorkingCapital, expected.affectsWorkingCapital, `${actual.movementType} affectsWorkingCapital`)
  assert.equal(actual.affectsAvailableLiquidity, expected.affectsAvailableLiquidity, `${actual.movementType} affectsAvailableLiquidity`)
  assert.equal(actual.affectsOwnerEquity, expected.affectsOwnerEquity, `${actual.movementType} affectsOwnerEquity`)
}

{
  const result = classifySaleIncome({
    id: "sale-1",
    sourceType: "sale",
    sourceId: "sale-id",
    type: "income",
    status: "reconciled",
    amount: 3200,
    financialType: "revenue",
    statementSection: "dre",
  })

  assert.equal(result.movementType, "sale_income")
  assert.equal(result.financialNature, "revenue")
  assert.equal(result.operationalNature, "profit_generation")
  assert.ok(result.reason.includes("Real Profit Engine"))
  assert.ok(result.confidence >= 0.8)
  assertFlags(result, {
    affectsCash: true,
    affectsProfit: true,
    affectsWorkingCapital: true,
    affectsAvailableLiquidity: true,
    affectsOwnerEquity: false,
  })
}

{
  const result = classifyTransaction({
    id: "payment-1",
    sourceType: "sale_payment",
    type: "income",
    status: "reconciled",
    amount: 1000,
    financialType: "revenue",
  })

  assert.equal(result.movementType, "sale_payment")
  assert.equal(result.financialNature, "revenue")
  assert.equal(result.operationalNature, "profit_generation")
  assert.ok(result.confidence >= 0.9)
}

{
  const result = classifyLedgerMovement({
    id: "purchase-1",
    source: "purchase",
    type: "expense",
    status: "reconciled",
    amount: 2500,
    financialType: "inventory_asset",
    statementSection: "inventory",
    affectsInventory: true,
  })

  assert.equal(result.movementType, "inventory_purchase")
  assert.equal(result.financialNature, "asset_recomposition")
  assert.equal(result.operationalNature, "inventory_recomposition")
  assertFlags(result, {
    affectsCash: true,
    affectsProfit: false,
    affectsWorkingCapital: true,
    affectsAvailableLiquidity: true,
    affectsOwnerEquity: false,
  })
}

{
  const result = classifyTransaction({
    id: "cancelled-sale-1",
    sourceType: "sale",
    type: "income",
    status: "cancelled",
    amount: 1200,
    financialType: "revenue",
  })

  assert.equal(result.financialNature, "neutral")
  assert.equal(result.operationalNature, "neutral")
  assert.equal(result.affectsCash, false)
  assert.equal(result.affectsProfit, false)
  assert.equal(result.affectsAvailableLiquidity, false)
}

{
  const result = classifyTransaction({
    id: "expense-1",
    type: "expense",
    status: "reconciled",
    amount: 180,
    category: "Tráfego pago / Meta Ads",
    financialType: "operating_expense",
    statementSection: "dre",
  })

  assert.equal(result.movementType, "operating_expense")
  assert.equal(result.financialNature, "expense")
  assert.equal(result.operationalNature, "business_expense")
  assertFlags(result, {
    affectsCash: true,
    affectsProfit: true,
    affectsWorkingCapital: true,
    affectsAvailableLiquidity: true,
    affectsOwnerEquity: false,
  })
}

{
  const result = classifyTransaction({
    id: "withdrawal-1",
    type: "expense",
    status: "reconciled",
    amount: 900,
    category: "Retirada de lucro",
    financialType: "owner_equity",
    statementSection: "equity",
    affectsOwnerEquity: true,
  })

  assert.equal(result.movementType, "owner_withdrawal")
  assert.equal(result.financialNature, "owner_equity")
  assert.equal(result.operationalNature, "owner_draw")
  assertFlags(result, {
    affectsCash: true,
    affectsProfit: false,
    affectsWorkingCapital: true,
    affectsAvailableLiquidity: true,
    affectsOwnerEquity: true,
  })
}

{
  const result = classifyTransaction({
    id: "contribution-1",
    type: "income",
    status: "reconciled",
    amount: 3000,
    category: "Aporte do proprietário",
    financialType: "owner_equity",
    statementSection: "equity",
    affectsOwnerEquity: true,
  })

  assert.equal(result.movementType, "owner_contribution")
  assert.equal(result.financialNature, "owner_equity")
  assert.equal(result.operationalNature, "owner_injection")
  assert.equal(result.affectsProfit, false)
}

{
  const result = classifyTransaction({
    id: "capital-return-1",
    type: "expense",
    status: "reconciled",
    amount: 1000,
    sourceType: "owner_capital_return",
  })

  assert.equal(result.movementType, "owner_capital_return")
  assert.equal(result.financialNature, "owner_equity")
  assert.equal(result.operationalNature, "owner_draw")
  assert.equal(result.affectsProfit, false)
}

{
  const result = classifyTransaction({
    id: "profit-withdrawal-1",
    type: "expense",
    status: "reconciled",
    amount: 150,
    sourceType: "owner_profit_withdrawal",
  })

  assert.equal(result.movementType, "owner_profit_withdrawal")
  assert.equal(result.financialNature, "owner_equity")
  assert.equal(result.operationalNature, "owner_draw")
  assert.equal(result.affectsProfit, false)
}

{
  const result = classifyTransaction({
    id: "transfer-1",
    type: "expense",
    status: "reconciled",
    amount: 500,
    financialType: "transfer",
    statementSection: "transfer",
  })

  assert.equal(result.movementType, "transfer")
  assert.equal(result.financialNature, "cash_transfer")
  assert.equal(result.operationalNature, "cash_movement")
  assert.equal(result.affectsProfit, false)
  assert.equal(result.affectsAvailableLiquidity, false)
}

{
  const result = classifyLedgerMovement({
    id: "reversal-1",
    source: "reversal",
    type: "reversal",
    status: "reconciled",
    amount: -450,
  })

  assert.equal(result.movementType, "reversal")
  assert.equal(result.financialNature, "neutral")
  assert.equal(result.operationalNature, "neutral")
  assertFlags(result, {
    affectsCash: false,
    affectsProfit: false,
    affectsWorkingCapital: false,
    affectsAvailableLiquidity: false,
    affectsOwnerEquity: false,
  })
}

{
  const result = classifyTransaction({
    id: "receivable-1",
    sourceType: "sale",
    type: "income",
    status: "pending",
    amount: 850,
    financialType: "revenue",
  })

  assert.equal(result.movementType, "receivable")
  assert.equal(result.operationalNature, "future_cash")
  assert.equal(result.affectsCash, false)
  assert.equal(result.affectsAvailableLiquidity, false)
}

{
  const result = classifyTransaction({
    id: "payable-1",
    type: "expense",
    status: "pending",
    amount: 350,
    financialType: "operating_expense",
  })

  assert.equal(result.movementType, "payable")
  assert.equal(result.financialNature, "liability")
  assert.equal(result.operationalNature, "future_cash")
  assert.equal(result.affectsCash, false)
  assert.equal(result.affectsAvailableLiquidity, false)
}

{
  const result = classifyTransaction({
    id: "unknown-1",
    type: "none",
    status: "reconciled",
    amount: 10,
    category: "Sem categoria",
  })

  assert.equal(result.movementType, "unknown")
  assert.equal(result.financialNature, "unknown")
  assert.equal(result.operationalNature, "unknown")
  assert.ok(result.confidence < 0.5)
}

{
  const snapshot = buildMoneyClassificationSnapshot({
    transactions: [
      { id: "sale-1", sourceType: "sale", type: "income", status: "reconciled", amount: 3200, financialType: "revenue" },
      { id: "purchase-1", sourceType: "inventory_purchase", type: "expense", status: "reconciled", amount: 1800, financialType: "inventory_asset" },
      { id: "owner-1", type: "expense", status: "reconciled", amount: 500, financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "pending-1", type: "income", status: "pending", amount: 700, financialType: "revenue" },
      { id: "reversal-1", sourceType: "reversal", type: "reversal", status: "reconciled", amount: -200 },
    ],
  })

  assert.equal(snapshot.items.length, 5)
  assert.equal(snapshot.totals.byMovementType.sale_income, 3200)
  assert.equal(snapshot.totals.byMovementType.inventory_purchase, -1800)
  assert.equal(snapshot.totals.byMovementType.owner_withdrawal, -500)
  assert.equal(snapshot.totals.byMovementType.receivable, 700)
  assert.equal(snapshot.totals.byMovementType.reversal, -200)
  assert.equal(snapshot.availableOperationalProfitEstimate.amount, 3200)
  assert.ok(snapshot.availableOperationalProfitEstimate.reason.includes("Estimativa operacional"))
}

console.log("money-classification-engine tests passed")
