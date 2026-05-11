import assert from "node:assert/strict"
import { buildRealProfitSnapshot } from "./real-profit-engine"
import { buildFinancialScenarioSnapshot } from "./financial-scenario-separation"
import { buildInventoryLiquidityQuality } from "./inventory-liquidity-quality"

const realProfitSnapshot = buildRealProfitSnapshot({
  sales: [
    {
      saleId: "realized-sale",
      salePrice: 150,
      warrantyMonths: 0,
      mainItem: { id: "device", cost: 100, quantity: 1, costStructured: true },
      payments: [],
    },
  ],
})

const activeInventoryItems = [
  {
    id: "active-premium",
    name: "iPhone premium ativo",
    purchasePrice: 1000,
    suggestedPrice: 1600,
    quantity: 1,
    daysInStock: 12,
    estimatedLiquidity: "high" as const,
  },
]

const inventoryLiquidityQuality = buildInventoryLiquidityQuality({ items: activeInventoryItems })

{
  const snapshot = buildFinancialScenarioSnapshot({
    realProfitSnapshot,
    activeInventoryItems,
    availableLiquidity: 5869,
    pendingReceivables: 500,
    upcomingBills30d: 20,
    inventoryLiquidityQuality,
  })

  assert.equal(snapshot.realizedProfit, 50)
  assert.equal(snapshot.realizedProfitAfterBills, 30)
  assert.equal(snapshot.projectedInventoryProfit, 600)
  assert.equal(snapshot.projectedOperationalScenario, 650)
  assert.equal(snapshot.projectedLiquidity, 6369)
  assert.ok(snapshot.reasoning.some((line) => line.indexOf("não entra em saque") >= 0))
}

{
  const snapshot = buildFinancialScenarioSnapshot({
    realProfitSnapshot: null,
    activeInventoryItems,
    availableLiquidity: 1000,
    pendingReceivables: 0,
    upcomingBills30d: 0,
    inventoryLiquidityQuality,
  })

  assert.equal(snapshot.realizedProfit, 0)
  assert.equal(snapshot.projectedInventoryProfit, 600)
  assert.equal(snapshot.scenarioConfidence, "low")
}

console.log("financial-scenario-separation tests passed")
