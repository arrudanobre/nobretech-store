import assert from "node:assert/strict"
import { buildFinancialConfidenceBreakdown } from "./financial-confidence-breakdown"
import { buildFinancialScenarioSnapshot } from "./financial-scenario-separation"
import { buildInventoryLiquidityQuality } from "./inventory-liquidity-quality"
import { buildRealProfitSnapshot } from "./real-profit-engine"

const healthyInventory = buildInventoryLiquidityQuality({
  items: [
    {
      id: "premium",
      name: "iPhone premium",
      purchasePrice: 7000,
      suggestedPrice: 8650,
      quantity: 1,
      daysInStock: 15,
      estimatedLiquidity: "high",
    },
  ],
})

const realProfitSnapshot = buildRealProfitSnapshot({
  sales: [
    {
      saleId: "fee-customer",
      salePrice: 7865,
      warrantyMonths: 0,
      mainItem: { id: "17-pro-max", cost: 7700, quantity: 1, costStructured: true },
      payments: [{ id: "pay", paymentMethod: "card_customer_absorbed", amount: 7865, status: "received" }],
      feeAudit: {
        feeResponsibility: "customer_absorbed_fee",
        paymentFeeShouldAffectProfit: false,
        paymentFeeCost: 585,
        profitImpactingFeeCost: 0,
      },
    },
  ],
})

const financialScenario = buildFinancialScenarioSnapshot({
  realProfitSnapshot,
  activeInventoryItems: [
    {
      id: "premium",
      purchasePrice: 7000,
      suggestedPrice: 8650,
      quantity: 1,
      daysInStock: 15,
      estimatedLiquidity: "high",
    },
  ],
  availableLiquidity: 5869,
  pendingReceivables: 600,
  upcomingBills30d: 350,
  inventoryLiquidityQuality: healthyInventory,
})

{
  const confidence = buildFinancialConfidenceBreakdown({
    financialScenario,
    inventoryLiquidityQuality: healthyInventory,
    realProfitSnapshot,
    pendingReceivables: 600,
    pendingPayables: 350,
    staleAccountBalance: false,
    ledgerVsAccountDiff: 0,
  })

  assert.equal(confidence.inventoryConfidence, 0.9)
  assert.equal(confidence.consistencyConfidence, 0.9)
  assert.equal(confidence.level, "high")
  assert.equal(confidence.warnings.length, 0)
  assert.ok(confidence.reasoning.some((line) => line.indexOf("Taxa absorvida pelo cliente") >= 0))
}

{
  const stressedInventory = buildInventoryLiquidityQuality({
    items: [
      {
        id: "aged",
        purchasePrice: 1000,
        suggestedPrice: 1050,
        quantity: 1,
        daysInStock: 100,
        estimatedLiquidity: "low",
      },
    ],
  })
  const confidence = buildFinancialConfidenceBreakdown({
    financialScenario,
    inventoryLiquidityQuality: stressedInventory,
    realProfitSnapshot,
  })

  assert.equal(confidence.inventoryConfidence, 0.45)
  assert.ok(confidence.warnings.some((line) => line.indexOf("Aging alto") >= 0))
}

{
  const unknownFeeSnapshot = buildRealProfitSnapshot({
    sales: [
      {
        saleId: "unknown-fee",
        salePrice: 1600,
        warrantyMonths: 0,
        mainItem: { id: "device", cost: 1000, quantity: 1, costStructured: true },
        payments: [{ id: "pay", paymentMethod: "card", amount: 1600, status: "received" }],
        feeAudit: {
          feeResponsibility: "unknown_fee_model",
          paymentFeeShouldAffectProfit: false,
          paymentFeeCost: 80,
          profitImpactingFeeCost: 0,
        },
      },
    ],
  })
  const confidence = buildFinancialConfidenceBreakdown({
    financialScenario,
    inventoryLiquidityQuality: healthyInventory,
    realProfitSnapshot: unknownFeeSnapshot,
  })

  assert.equal(confidence.consistencyConfidence, 0.45)
  assert.ok(confidence.warnings.some((line) => line.indexOf("responsabilidade desconhecida") >= 0))
}

console.log("financial-confidence-breakdown tests passed")
