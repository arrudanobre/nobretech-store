import assert from "node:assert/strict"
import { buildInventoryLiquidityQuality } from "./inventory-liquidity-quality"

{
  const quality = buildInventoryLiquidityQuality({
    items: [
      {
        id: "premium-healthy",
        name: "iPhone premium",
        purchasePrice: 7000,
        suggestedPrice: 8650,
        quantity: 1,
        daysInStock: 18,
        estimatedLiquidity: "high",
      },
    ],
  })

  assert.equal(quality.inventoryQuality, "healthy")
  assert.equal(quality.confidenceImpact, "none")
  assert.equal(quality.premiumHealthyCount, 1)
  assert.ok(quality.reasoning.some((line) => line.indexOf("não reduzem confiança") >= 0))
}

{
  const quality = buildInventoryLiquidityQuality({
    items: [
      {
        id: "aged-low-margin",
        name: "Estoque antigo com margem fraca",
        purchasePrice: 1000,
        suggestedPrice: 1050,
        quantity: 1,
        daysInStock: 92,
        estimatedLiquidity: "low",
      },
    ],
  })

  assert.equal(quality.inventoryQuality, "stressed")
  assert.equal(quality.confidenceImpact, "strong")
  assert.equal(quality.agingHighCount, 1)
  assert.equal(quality.lowMarginCount, 1)
  assert.equal(quality.lowLiquidityCount, 1)
}

{
  const quality = buildInventoryLiquidityQuality({
    items: [
      {
        id: "cheap-fast",
        name: "Acessório rápido",
        purchasePrice: 50,
        suggestedPrice: 120,
        quantity: 5,
        daysInStock: 10,
        estimatedLiquidity: "high",
      },
    ],
  })

  assert.equal(quality.inventoryQuality, "healthy")
  assert.equal(quality.confidenceImpact, "none")
}

console.log("inventory-liquidity-quality tests passed")
