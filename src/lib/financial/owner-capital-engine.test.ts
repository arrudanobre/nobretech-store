import assert from "node:assert/strict"
import { buildOwnerCapitalSnapshot } from "./owner-capital-engine"
import { resolveProfitAvailabilityPeriod } from "./profit-availability-engine"

const period = resolveProfitAvailabilityPeriod({ preset: "current_month" }, new Date("2026-05-10T12:00:00")).period

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerContributionsInPeriod, 10000)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(snapshot.ownerCapitalBalanceAllTime, 10000)
  assert.equal(snapshot.ownerContributionMovements.length, 1)
  assert.equal(snapshot.ownerContributionMovements[0]?.classification, "owner_contribution")
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "return", type: "expense", amount: 7000, status: "reconciled", date: "2026-05-03", sourceType: "owner_capital_return" },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 7000)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(snapshot.profitWithdrawalsAffectingAvailability, 0)
  assert.equal(snapshot.ownerCapitalBalanceAllTime, 3000)
  assert.equal(snapshot.ownerCapitalReturnMovements.length, 1)
  assert.equal(snapshot.ownerCapitalReturnMovements[0]?.tracedAmount, 7000)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "profit-withdrawal", type: "expense", amount: 150, status: "reconciled", date: "2026-05-03", sourceType: "owner_profit_withdrawal" },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 0)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 150)
  assert.equal(snapshot.profitWithdrawalsAffectingAvailability, 150)
  assert.equal(snapshot.ownerProfitWithdrawalMovements.length, 1)
  assert.equal(snapshot.ownerProfitWithdrawalMovements[0]?.amount, 150)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "generic-owner-out", type: "expense", amount: 7000, status: "reconciled", date: "2026-05-03", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 7000)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(snapshot.ownerCapitalBalanceAllTime, 3000)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "generic-owner-out", type: "expense", amount: 12000, status: "reconciled", date: "2026-05-03", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 10000)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(snapshot.ambiguousOwnerMovements.length, 1)
  assert.equal(snapshot.ownerCapitalBalanceAllTime, 0)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "return", type: "expense", amount: 12000, status: "reconciled", date: "2026-05-03", category: "Reembolso de aporte temporário", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 10000)
  assert.equal(snapshot.untracedOwnerCapitalReturnsInPeriod, 2000)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(snapshot.ownerCapitalReturnWithoutTrackedContribution.length, 1)
  assert.equal(snapshot.ownerCapitalReturnWithoutTrackedContribution[0]?.untracedAmount, 2000)
  assert.equal(snapshot.ownerCapitalReturnMovements[0]?.classification, "untraced_owner_capital_return")
  assert.equal(snapshot.ownerCapitalReturnMovements[0]?.untracedAmount, 2000)
  assert.ok(snapshot.warnings.length >= 1)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 5000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "return", type: "expense", amount: 5000, status: "reconciled", date: "2026-05-03", sourceType: "owner_capital_return" },
    ],
  })

  assert.equal(snapshot.ownerCapitalBalanceAllTime, 0)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "contribution", type: "income", amount: 10000, status: "reconciled", date: "2026-05-02", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "explicit-profit", type: "expense", amount: 7000, status: "reconciled", date: "2026-05-03", category: "Retirada de lucro", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 0)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 7000)
  assert.equal(snapshot.ownerCapitalBalanceAllTime, 10000)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "ambiguous", type: "expense", amount: 700, status: "reconciled", date: "2026-05-03", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 0)
  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 0)
  assert.equal(snapshot.ambiguousOwnerMovements.length, 1)
  assert.ok(snapshot.warnings.length >= 1)
}

{
  const snapshot = buildOwnerCapitalSnapshot({
    period,
    movements: [
      { id: "aporte-7700", type: "income", amount: 7700, status: "reconciled", date: "2026-04-29", category: "Aporte do proprietário", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "retirada-124", type: "expense", amount: 124.88, status: "reconciled", date: "2026-05-02", category: "Retirada de lucro", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "reembolso-9300", type: "expense", amount: 9300, status: "reconciled", date: "2026-05-02", category: "Reembolso de aporte temporário", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "reembolso-4400", type: "expense", amount: 4400, status: "reconciled", date: "2026-05-05", createdAt: "2026-05-05T10:00:00.000Z", category: "Reembolso Nubank", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "aporte-25", type: "income", amount: 25, status: "reconciled", date: "2026-05-05", createdAt: "2026-05-05T11:00:00.000Z", category: "Aporte do proprietário", financialType: "owner_equity", affectsOwnerEquity: true },
      { id: "retirada-150", type: "expense", amount: 150, status: "reconciled", date: "2026-05-10", category: "Retirada de lucro", description: "Almoço dia das Mães", accountName: "PagBank", paymentMethod: "Pix", financialType: "owner_equity", affectsOwnerEquity: true },
    ],
  })

  assert.equal(snapshot.ownerProfitWithdrawalsInPeriod, 274.88)
  assert.equal(snapshot.ownerProfitWithdrawalMovements.length, 2)
  assert.equal(snapshot.ownerProfitWithdrawalMovements[1]?.description, "Almoço dia das Mães")
  assert.equal(snapshot.ownerProfitWithdrawalMovements[1]?.accountName, "PagBank")
  assert.equal(snapshot.ownerProfitWithdrawalMovements[1]?.paymentMethod, "Pix")
  assert.equal(snapshot.ownerCapitalReturnsInPeriod, 7700)
  assert.equal(snapshot.untracedOwnerCapitalReturnsInPeriod, 6000)
  assert.equal(snapshot.ownerCapitalReturnMovements.length, 2)
  assert.equal(snapshot.ownerCapitalReturnWithoutTrackedContribution.length, 2)
  assert.ok(snapshot.warnings.some((warning) => warning.indexOf("não foi tratado como retirada de lucro") >= 0))
}

console.log("owner-capital-engine tests passed")
