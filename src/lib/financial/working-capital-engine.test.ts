import assert from "node:assert/strict"
import {
  buildWorkingCapitalSnapshot,
  calculateActiveInventoryCapital,
  calculateOperationalSurplusAfterBills,
  calculateSafeWithdrawalAmount,
} from "./working-capital-engine"

{
  const result = calculateActiveInventoryCapital({
    items: [
      { id: "iphone-ativo", cost: 2500, quantity: 1 },
      { id: "ipad-ativo", purchasePrice: 1800, quantity: 2 },
    ],
  })
  assert.equal(result.activeInventoryCapital, 6100)
  assert.equal(result.warnings.length, 0)
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 5869.26,
    activeInventoryItems: [{ id: "estoque-vivo", cost: 2100, quantity: 1 }],
    realProfitSnapshot: { availableProfit: 2946 },
    upcomingBills30d: 350,
  })
  assert.equal(snapshot.protectedOperationalCapital, 2100)
  assert.notEqual(snapshot.protectedOperationalCapital, 38896)
  assert.ok(snapshot.reasoning.some((item) => item.includes("não inclui CMV histórico")))
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 5869,
    activeInventoryItems: [{ id: "estoque-vivo", cost: 4100, quantity: 1 }],
    realProfitSnapshot: { availableProfit: 2946 },
    upcomingBills30d: 350,
  })
  assert.ok(snapshot.protectedOperationalCapital <= 5869)
  assert.equal(snapshot.protectedOperationalCapital, 4100)
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 1200,
    activeInventoryItems: [{ id: "premium", cost: 9000, quantity: 1 }],
    realProfitSnapshot: { availableProfit: 700 },
    upcomingBills30d: 100,
  })
  assert.equal(snapshot.activeInventoryCapital, 9000)
  assert.equal(snapshot.protectedOperationalCapital, 9000)
  assert.ok(snapshot.reasoning.some((item) => item.includes("capital imobilizado em estoque vivo")))
}

{
  const withdrawal = calculateSafeWithdrawalAmount({
    availableCash: 5869,
    realAvailableProfit: 2946,
    upcomingBills30d: 350,
  })
  assert.ok(withdrawal.safeWithdrawalAmount < 2946)
  assert.equal(withdrawal.safeWithdrawalAmount, 2596)
}

{
  const surplus = calculateOperationalSurplusAfterBills({
    realAvailableProfit: 2946,
    upcomingBills30d: 350,
  })
  assert.equal(surplus.operationalSurplusAfterBills, 2596)
}

{
  const withdrawal = calculateSafeWithdrawalAmount({
    availableCash: 1000,
    realAvailableProfit: 3000,
    upcomingBills30d: 250,
  })
  assert.equal(withdrawal.safeWithdrawalAmount, 750)
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 5000,
    activeInventoryItems: [{ id: "ativo", cost: 1800, quantity: 1 }],
    realProfitSnapshot: { availableProfit: 2200 },
    upcomingBills30d: 1000,
  })
  assert.equal(snapshot.safeWithdrawalAmount, 1200)
  assert.equal(snapshot.safeReinvestmentAmount, 1200)
  assert.ok(snapshot.safeReinvestmentAmount <= snapshot.availableCash)
  assert.ok(snapshot.reasoning.some((item) => item.includes("alternativas")))
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 5000,
    activeInventoryItems: [{ id: "sem-custo", cost: 0, quantity: 1, costStructured: false }],
    realProfitSnapshot: { availableProfit: 1200 },
    upcomingBills30d: 300,
  })
  assert.equal(snapshot.activeInventoryCapital, 0)
  assert.ok(snapshot.warnings.some((warning) => warning.includes("sem custo estruturado")))
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 5000,
    activeInventoryItems: [{ id: "ativo", cost: 1000, quantity: 1 }],
    estimatedOperationalProfit: {
      amount: 1600,
      confidence: 0.62,
      reason: "Estimativa operacional classificada.",
    },
    upcomingBills30d: 400,
  })
  assert.equal(snapshot.realAvailableProfit, 0)
  assert.equal(snapshot.estimatedOperationalProfit, 1600)
  assert.ok(snapshot.warnings.some((warning) => warning.includes("estimativa")))
  assert.equal(snapshot.safeWithdrawalAmount, 600)
}

{
  const snapshot = buildWorkingCapitalSnapshot({
    availableCash: 5869,
    activeInventoryItems: [{ id: "estoque-atual", cost: 2500, quantity: 1 }],
    realProfitSnapshot: { availableProfit: 2946 },
    upcomingBills30d: 350,
  })
  assert.equal(snapshot.protectedOperationalCapital, 2500)
  assert.ok(!snapshot.reasoning.join(" ").includes("venda histórica"))
}

console.log("working-capital-engine tests passed")
