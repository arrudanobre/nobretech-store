import assert from "node:assert/strict"
import { buildCurrentCashCompositionSnapshot } from "./current-cash-composition-engine"
import { buildProfitAvailabilitySnapshot, resolveProfitAvailabilityPeriod } from "./profit-availability-engine"

const period = resolveProfitAvailabilityPeriod({ preset: "current_month" }, new Date("2026-05-10T12:00:00")).period
const profitAvailability = buildProfitAvailabilitySnapshot({
  period,
  sales: [
    {
      saleId: "sale-1",
      economicRevenue: 1000,
      operationalProfit: 400,
      reconciliationDate: "2026-05-04",
      tracedRevenue: 1000,
      hasSalePayment: true,
      hasTransaction: true,
      hasLedgerMovement: true,
    },
  ],
  transactions: [
    { id: "contribution", type: "income", amount: 500, status: "reconciled", date: "2026-05-04", affectsOwnerEquity: true, category: "Aporte" },
    { id: "capital-return", type: "expense", amount: 200, status: "reconciled", date: "2026-05-05", sourceType: "owner_capital_return", category: "Devolução de aporte" },
    { id: "withdrawal", type: "expense", amount: 150, status: "reconciled", date: "2026-05-05", sourceType: "owner_profit_withdrawal", category: "Retirada de lucro" },
    { id: "inventory", type: "expense", amount: 1000, status: "reconciled", date: "2026-05-05", affectsInventory: true, category: "Compra estoque" },
    { id: "transfer", type: "income", amount: 250, status: "reconciled", date: "2026-05-05", sourceType: "transfer", category: "Transferência" },
  ],
  availableCashNow: 2000,
  upcomingBills: 200,
  protectedOperationalCapital: 1000,
  safeWithdrawalAmount: 250,
  safeReinvestmentAmount: 300,
})

{
  const composition = buildCurrentCashCompositionSnapshot({
    asOf: "2026-05-10T12:00:00.000Z",
    cashByAccount: [
      { accountId: "pagbank", accountName: "PagBank", reconciledBalance: 1200, availableLiquidity: 1200 },
      { accountId: "cash", accountName: "Caixa físico", reconciledBalance: 800, availableLiquidity: 800 },
    ],
    profitAvailability,
    protectedOperationalCapital: 1000,
    pendingReceivables: 300,
    pendingPayables: 120,
    upcomingBills: 200,
  })

  assert.equal(composition.consolidatedCash, 2000)
  assert.equal(composition.cashByAccount.length, 2)
  assert.equal(composition.estimatedAvailableProfit, 250)
  assert.equal(composition.availableForWithdrawal, 250)
  assert.equal(composition.availableForReinvestment, 300)
  assert.equal(composition.ownerCapital, 300)
  assert.equal(composition.ownerCapitalReturnsInSelectedPeriod, 200)
  assert.equal(composition.untracedOwnerCapitalReturnsInSelectedPeriod, 0)
  assert.equal(composition.ownerProfitWithdrawalsInSelectedPeriod, 150)
  assert.equal(composition.operationalRecompositionCapital, 1000)
  assert.equal(composition.compositionBasis.inventoryPurchases, 1000)
  assert.ok(composition.reasoning.some((line) => line.indexOf("localização do dinheiro") >= 0))
}

{
  const lowConfidenceProfit = buildProfitAvailabilitySnapshot({
    period,
    sales: [
      {
        saleId: "partial",
        economicRevenue: 1000,
        operationalProfit: 400,
        reconciliationDate: "2026-05-04",
        tracedRevenue: 0,
        hasSalePayment: true,
        hasTransaction: false,
        hasLedgerMovement: false,
      },
    ],
    availableCashNow: 1000,
    upcomingBills: 0,
    safeWithdrawalAmount: 300,
  })
  const composition = buildCurrentCashCompositionSnapshot({
    cashByAccount: [],
    profitAvailability: lowConfidenceProfit,
    consolidatedCash: 1000,
  })

  assert.equal(composition.compositionConfidence, "medium")
  assert.ok(composition.warnings.length >= 1)
}

console.log("current-cash-composition-engine tests passed")
