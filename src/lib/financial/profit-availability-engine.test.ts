import assert from "node:assert/strict"
import {
  buildProfitAvailabilitySnapshot,
  resolveProfitAvailabilityPeriod,
  type ProfitAvailabilityPeriod,
} from "./profit-availability-engine"

const currentMonth = resolveProfitAvailabilityPeriod({ preset: "current_month" }, new Date("2026-05-10T12:00:00")).period
assert.equal(currentMonth.startDate, "2026-05-01")
assert.equal(currentMonth.endDate, "2026-05-10")

const last7 = resolveProfitAvailabilityPeriod({ preset: "last_7_days" }, new Date("2026-05-10T12:00:00")).period
assert.equal(last7.startDate, "2026-05-04")
assert.equal(last7.endDate, "2026-05-10")

const custom = resolveProfitAvailabilityPeriod({ preset: "custom", startDate: "2026-05-02", endDate: "2026-05-08" }, new Date("2026-05-10T12:00:00")).period
assert.equal(custom.startDate, "2026-05-02")
assert.equal(custom.endDate, "2026-05-08")

const invalidCustom = resolveProfitAvailabilityPeriod({ preset: "custom", startDate: "2026-05-12", endDate: "2026-05-08" }, new Date("2026-05-10T12:00:00"))
assert.ok(invalidCustom.error)

function snapshot(period: ProfitAvailabilityPeriod) {
  return buildProfitAvailabilitySnapshot({
    period,
    sales: [
      {
        saleId: "sale-full",
        saleLabel: "Venda rastreada",
        economicRevenue: 1500,
        operationalProfit: 500,
        reconciliationDate: "2026-05-04",
        tracedRevenue: 1500,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: true,
        projectedInventoryProfit: 9999,
      },
      {
        saleId: "sale-partial",
        saleLabel: "Venda sem ledger",
        economicRevenue: 1000,
        operationalProfit: 300,
        reconciliationDate: "2026-05-05",
        tracedRevenue: 0,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: false,
      },
    ],
    transactions: [
      { id: "withdrawal", type: "expense", amount: 150, status: "reconciled", date: "2026-05-06", sourceType: "owner_profit_withdrawal", category: "Retirada de lucro", description: "Retirada de lucro para Vinicius", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true },
      { id: "contribution", type: "income", amount: 700, status: "reconciled", date: "2026-05-05", category: "Aporte", affectsOwnerEquity: true },
      { id: "capital-return", type: "expense", amount: 400, status: "reconciled", date: "2026-05-06", sourceType: "owner_capital_return", category: "Devolução de aporte", affectsOwnerEquity: true },
      { id: "inventory", type: "expense", amount: 1000, status: "reconciled", date: "2026-05-07", category: "Compra estoque", affectsInventory: true },
      { id: "opex", type: "expense", amount: 120, status: "reconciled", date: "2026-05-07", category: "Internet", financialType: "operating_expense", statementSection: "dre" },
      { id: "receivable", type: "income", amount: 300, status: "pending", date: "2026-05-08", category: "Recebível", sourceType: "sale_payment" },
      { id: "payable", type: "expense", amount: 80, status: "pending", date: "2026-05-08", category: "Conta próxima" },
    ],
    availableCashNow: 1000,
    upcomingBills: 100,
    protectedOperationalCapital: 1000,
    safeWithdrawalAmount: 320,
    safeReinvestmentAmount: 280,
    projectedInventoryProfit: 2000,
  })
}

{
  const result = snapshot(currentMonth)
  assert.equal(result.realizedProfitInPeriod, 500)
  assert.equal(result.projectedInventoryProfitInPeriod, 2000)
  assert.equal(result.partiallyTracedSales.length, 1)
  assert.equal(result.confidence, "medium")
  assert.equal(result.ownerWithdrawalsInPeriod, 150)
  assert.equal(result.ownerContributionsInPeriod, 700)
  assert.equal(result.ownerCapitalReturnsInPeriod, 400)
  assert.equal(result.untracedOwnerCapitalReturnsInPeriod, 0)
  assert.equal(result.ownerProfitWithdrawalsInPeriod, 150)
  assert.equal(result.inventoryPurchasesInPeriod, 1000)
  assert.equal(result.operatingExpensesInPeriod, 120)
  assert.equal(result.profitAfterWithdrawals, 350)
  assert.equal(result.withdrawableProfitToday, 320)
  assert.equal(result.safeReinvestmentAmount, 280)
  assert.equal(result.movementBreakdown.ownerWithdrawals, 150)
  assert.equal(result.movementBreakdown.ownerCapitalReturns, 400)
  assert.equal(result.movementBreakdown.untracedOwnerCapitalReturns, 0)
  assert.equal(result.ownerProfitWithdrawalMovements.length, 1)
  assert.equal(result.ownerProfitWithdrawalMovements[0]?.description, "Retirada de lucro para Vinicius")
  assert.equal(result.ownerCapitalReturnMovements.length, 1)
  assert.equal(result.ownerContributionMovements.length, 1)
  assert.equal(result.receivablesInPeriod, 300)
}

{
  const result = buildProfitAvailabilitySnapshot({
    period: currentMonth,
    sales: [
      {
        saleId: "sale-full",
        economicRevenue: 1000,
        operationalProfit: 500,
        reconciliationDate: "2026-05-04",
        tracedRevenue: 1000,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: true,
      },
    ],
    transactions: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "capital-return", type: "expense", amount: 10000, status: "reconciled", date: "2026-05-06", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
    availableCashNow: 1000,
    upcomingBills: 0,
    safeWithdrawalAmount: 500,
  })

  assert.equal(result.ownerCapitalReturnsInPeriod, 10000)
  assert.equal(result.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(result.profitAfterWithdrawals, 500)
}

{
  const result = buildProfitAvailabilitySnapshot({
    period: currentMonth,
    sales: [
      {
        saleId: "sale-full",
        economicRevenue: 3000,
        operationalProfit: 2027,
        reconciliationDate: "2026-05-04",
        tracedRevenue: 3000,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: true,
      },
    ],
    transactions: [
      { id: "aporte-7700", type: "income", amount: 7700, status: "reconciled", date: "2026-04-29", category: "Aporte do proprietário", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "retirada-124", type: "expense", amount: 124.88, status: "reconciled", date: "2026-05-02", category: "Retirada de lucro", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "reembolso-9300", type: "expense", amount: 9300, status: "reconciled", date: "2026-05-02", category: "Reembolso de aporte temporário", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "reembolso-4400", type: "expense", amount: 4400, status: "reconciled", date: "2026-05-05", createdAt: "2026-05-05T10:00:00.000Z", category: "Reembolso Nubank", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "aporte-25", type: "income", amount: 25, status: "reconciled", date: "2026-05-05", createdAt: "2026-05-05T11:00:00.000Z", category: "Aporte do proprietário", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "retirada-150", type: "expense", amount: 150, status: "reconciled", date: "2026-05-10", category: "Retirada de lucro", description: "Almoço dia das Mães", accountName: "PagBank", paymentMethod: "Pix", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
    availableCashNow: 8269,
    upcomingBills: 350,
    safeWithdrawalAmount: 2000,
  })

  assert.equal(result.ownerProfitWithdrawalsInPeriod, 274.88)
  assert.equal(result.ownerProfitWithdrawalMovements.length, 2)
  assert.equal(result.ownerCapitalReturnMovements.length, 2)
  assert.equal(result.untracedOwnerCapitalReturnsInPeriod, 6000)
  assert.equal(result.profitAfterWithdrawals, 1752.12)
  assert.equal(result.withdrawableProfitToday, 1752.12)
  assert.ok(result.warnings.some((warning) => warning.indexOf("não foi tratado como retirada de lucro") >= 0))
}

{
  const result = snapshot(resolveProfitAvailabilityPeriod({ preset: "today" }, new Date("2026-05-10T12:00:00")).period)
  assert.equal(result.realizedProfitInPeriod, 0)
  assert.equal(result.ownerWithdrawalsInPeriod, 0)
}

console.log("profit-availability-engine tests passed")
