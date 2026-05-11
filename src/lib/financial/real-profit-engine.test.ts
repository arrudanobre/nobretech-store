import assert from "node:assert/strict"
import {
  buildRealProfitAnalysis,
  buildRealProfitSnapshot,
  type RealProfitSaleInput,
} from "./real-profit-engine"
import { buildRealProfitDiagnostics } from "./real-profit-diagnostics"

const baseSale: RealProfitSaleInput = {
  saleId: "sale-1",
  salePrice: 5000,
  netAmount: 5000,
  warrantyMonths: 3,
  mainItem: {
    id: "main-1",
    cost: 3000,
    quantity: 1,
    daysInStock: 12,
    liquidityQuality: "high",
    costStructured: true,
  },
  payments: [
    { id: "pay-1", paymentMethod: "pix", amount: 5000, status: "received" },
  ],
  settings: {
    pix_fee_pct: 0,
    credit_12x_fee_pct: 10,
  },
}

{
  const result = buildRealProfitAnalysis({
    saleId: "sanity-simple-profit",
    salePrice: 150,
    warrantyMonths: 0,
    mainItem: { id: "iphone-100", cost: 100, quantity: 1, costStructured: true },
    payments: [],
  })
  assert.equal(result.grossRevenue, 150)
  assert.equal(result.economicRevenue, 150)
  assert.equal(result.inventoryCost, 100)
  assert.equal(result.totalCost, 100)
  assert.equal(result.operationalProfit, 50)
  assert.equal(result.availableProfit, 50)
  assert.equal(result.operationalMarginPct, 33.33)
}

{
  const result = buildRealProfitAnalysis({
    saleId: "sanity-bonus-profit",
    salePrice: 1600,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    additionalItems: [
      { id: "charger-free", type: "free", cost: 10, quantity: 1, costStructured: true },
      { id: "film-free", type: "free", cost: 10, quantity: 1, costStructured: true },
    ],
    payments: [],
  })
  assert.equal(result.grossRevenue, 1600)
  assert.equal(result.bonusCost, 20)
  assert.equal(result.totalCost, 1020)
  assert.equal(result.operationalProfitBeforeReserve, 580)
  assert.equal(result.operationalProfit, 580)
  assert.equal(result.availableProfit, 580)
}

{
  const result = buildRealProfitAnalysis({
    saleId: "sanity-fee-profit",
    salePrice: 1600,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    additionalItems: [
      { id: "charger-free", type: "free", cost: 10, quantity: 1, costStructured: true },
      { id: "film-free", type: "free", cost: 10, quantity: 1, costStructured: true },
    ],
    payments: [{ id: "fee-pay", paymentMethod: "custom_card", amount: 1600, status: "received" }],
    settings: { custom_card_fee_pct: 5 },
  })
  assert.equal(result.rawPaymentFeeCost, 80)
  assert.equal(result.effectivePaymentFeeCost, 0)
  assert.equal(result.paymentFeeCost, 0)
  assert.equal(result.netRevenue, 1600)
  assert.equal(result.totalCost, 1020)
  assert.equal(result.operationalProfit, 580)
  assert.equal(result.paymentFeeResponsibility, "customer_absorbed_fee")
}

{
  const result = buildRealProfitAnalysis({
    saleId: "sanity-upsell-profit",
    salePrice: 1700,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    additionalItems: [
      { id: "upsell-accessory", type: "upsell", salePrice: 100, cost: 30, quantity: 1, costStructured: true },
    ],
    payments: [],
  })
  assert.equal(result.grossRevenue, 1700)
  assert.equal(result.accessoryCost, 30)
  assert.equal(result.operationalProfit, 670)
}

{
  const result = buildRealProfitAnalysis({
    saleId: "sanity-free-item-revenue",
    salePrice: 1600,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    additionalItems: [
      { id: "free-item", type: "free", cost: 50, quantity: 1, costStructured: true },
    ],
    payments: [],
  })
  assert.equal(result.grossRevenue, 1600)
  assert.equal(result.bonusCost, 50)
  assert.equal(result.operationalProfit, 550)
}

{
  const result = buildRealProfitAnalysis({
    saleId: "sanity-real-negative",
    salePrice: 900,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    payments: [],
  })
  assert.equal(result.operationalProfit, -100)
  assert.equal(result.profitabilityLevel, "negative")
  assert.ok(result.lowMarginWarnings.some((warning) => warning.indexOf("negativo") >= 0))
}

{
  const result = buildRealProfitAnalysis(baseSale)
  assert.equal(result.grossRevenue, 5000)
  assert.equal(result.inventoryCost, 3000)
  assert.equal(result.grossProfit, 2000)
  assert.equal(result.operationalProfit, 2000)
  assert.equal(result.availableProfit, 2000)
  assert.equal(result.profitAfterOptionalWarrantyReserve, 1940)
  assert.equal(result.optionalWarrantyReserveRecommendation, 60)
  assert.equal(result.protectedCapital, 3000)
  assert.equal(result.recompositionRequired, true)
  assert.equal(result.profitabilityLevel, "excellent")
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "payments-source",
    salePrice: 99999,
    payments: [
      { id: "pay-1", paymentMethod: "pix", amount: 3000, status: "received" },
      { id: "pay-2", paymentMethod: "cash", amount: 2000, status: "pending" },
      { id: "pay-cancelled", paymentMethod: "pix", amount: 1000, status: "cancelled" },
    ],
  })
  assert.equal(result.revenueSource, "sale_payments")
  assert.equal(result.grossRevenue, 5000)
  assert.ok(result.reasoning.some((line) => line.includes("sales.sale_price não foi somado")))
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "net-amount-reference",
    salePrice: 5000,
    netAmount: 100,
    payments: [],
  })
  assert.equal(result.revenueSource, "sale_price")
  assert.equal(result.grossRevenue, 5000)
  assert.notEqual(result.operationalProfit, 100)
  assert.ok(result.reasoning.some((line) => line.includes("sales.net_amount usado apenas como referência")))
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "high-fee",
    payments: [
      { id: "pay-1", paymentMethod: "credit_12x", amount: 5000, status: "received" },
    ],
  })
  assert.equal(result.rawPaymentFeeCost, 500)
  assert.equal(result.effectivePaymentFeeCost, 0)
  assert.equal(result.paymentFeeCost, 0)
  assert.equal(result.netRevenue, 5000)
  assert.equal(result.operationalProfit, 2000)
  assert.equal(result.safeWithdrawalAmount, 2000)
  assert.equal(result.safeReinvestmentAmount, 2000)
  assert.equal(result.paymentFeeResponsibility, "customer_absorbed_fee")
}

{
  const result = buildRealProfitAnalysis({
    saleId: "merchant-absorbed-fee",
    salePrice: 1600,
    netAmount: 1520,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    payments: [{ id: "pay-merchant", paymentMethod: "pix", amount: 1520, status: "received" }],
    feeAudit: {
      feeResponsibility: "merchant_absorbed_fee",
      paymentFeeShouldAffectProfit: true,
      paymentFeeCost: 80,
      profitImpactingFeeCost: 80,
    },
  })
  assert.equal(result.rawPaymentFeeCost, 80)
  assert.equal(result.effectivePaymentFeeCost, 80)
  assert.equal(result.paymentFeeCost, 80)
  assert.equal(result.operationalProfit, 440)
  assert.equal(result.paymentFeeResponsibility, "merchant_absorbed_fee")
}

{
  const result = buildRealProfitAnalysis({
    saleId: "mixed-fee-model",
    salePrice: 1600,
    netAmount: 1550,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    payments: [{ id: "pay-mixed", paymentMethod: "credit_12x", amount: 1600, status: "received" }],
    settings: { credit_12x_fee_pct: 12.5 },
    feeAudit: {
      feeResponsibility: "mixed_fee_model",
      paymentFeeShouldAffectProfit: true,
      paymentFeeCost: 200,
      profitImpactingFeeCost: 50,
    },
  })
  assert.equal(result.rawPaymentFeeCost, 200)
  assert.equal(result.effectivePaymentFeeCost, 50)
  assert.equal(result.operationalProfit, 550)
  assert.equal(result.paymentFeeResponsibility, "mixed_fee_model")
}

{
  const result = buildRealProfitAnalysis({
    saleId: "unknown-fee-model",
    salePrice: 1600,
    warrantyMonths: 0,
    mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
    payments: [{ id: "pay-unknown", paymentMethod: "credit_12x", amount: 1600, status: "received" }],
    settings: { credit_12x_fee_pct: 5 },
    feeAudit: {
      feeResponsibility: "unknown_fee_model",
      paymentFeeShouldAffectProfit: false,
      paymentFeeCost: 80,
      profitImpactingFeeCost: 0,
    },
  })
  assert.equal(result.rawPaymentFeeCost, 80)
  assert.equal(result.effectivePaymentFeeCost, 0)
  assert.equal(result.operationalProfit, 600)
  assert.equal(result.feeModelConfidence, "low")
  assert.ok(result.lowMarginWarnings.some((warning) => warning === "unknown_fee_model_confidence_low"))
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "bundle-upsell",
    additionalItems: [
      { id: "case-1", type: "upsell", salePrice: 300, cost: 80, costStructured: true },
    ],
    payments: [
      { id: "pay-1", paymentMethod: "pix", amount: 5300, status: "received" },
    ],
  })
  assert.equal(result.grossRevenue, 5300)
  assert.equal(result.accessoryCost, 80)
  assert.equal(result.availableProfit, 2220)
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "accessories-and-bonus",
    additionalItems: [
      { id: "cable-1", type: "upsell", salePrice: 200, cost: 50, costStructured: true },
      { id: "film-1", type: "free", salePrice: 0, cost: 35, costStructured: true },
    ],
    payments: [
      { id: "pay-1", paymentMethod: "pix", amount: 5200, status: "received" },
    ],
  })
  assert.equal(result.accessoryCost, 50)
  assert.equal(result.bonusCost, 35)
  assert.equal(result.operationalProfit, 2115)
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "trade-in",
    payments: [
      { id: "pay-1", paymentMethod: "pix", amount: 3500, status: "received" },
      { id: "pay-2", paymentMethod: "trade_in_credit", amount: 1500, status: "received", isFinancial: false },
    ],
    tradeIn: {
      creditAmount: 1500,
      linkedInventoryId: "trade-in-inventory",
      expectedResaleValue: 1800,
    },
  })
  assert.equal(result.grossRevenue, 5000)
  assert.equal(result.paymentFeeCost, 0)
  assert.ok(result.reasoning.some((line) => line.includes("Trade-in tratado como pagamento não financeiro")))
  assert.ok(result.reasoning.some((line) => line.includes("inventory vinculado")))
}

{
  const result = buildRealProfitAnalysis({
    saleId: "trade-in-partial",
    salePrice: 5000,
    warrantyMonths: 0,
    mainItem: { id: "device-3500", cost: 3500, quantity: 1, costStructured: true },
    payments: [
      { id: "cash-3000", paymentMethod: "pix", amount: 3000, status: "received" },
      { id: "trade-2000", paymentMethod: "trade_in_credit", amount: 2000, status: "received", isFinancial: false },
    ],
    tradeIn: { creditAmount: 2000, linkedInventoryId: "future-device-2000" },
    settings: { pix_fee_pct: 0 },
  })
  assert.equal(result.economicRevenue, 5000)
  assert.equal(result.grossRevenue, 5000)
  assert.equal(result.cashReceived, 3000)
  assert.equal(result.tradeInCredit, 2000)
  assert.equal(result.futureInventoryValue, 2000)
  assert.equal(result.operationalProfit, 1500)
}

{
  const result = buildRealProfitAnalysis({
    saleId: "trade-in-low-margin",
    salePrice: 5000,
    warrantyMonths: 0,
    mainItem: { id: "device-4700", cost: 4700, quantity: 1, costStructured: true },
    payments: [
      { id: "cash-500", paymentMethod: "pix", amount: 500, status: "received" },
      { id: "trade-4500", paymentMethod: "trade_in_credit", amount: 4500, status: "received", isFinancial: false },
    ],
    tradeIn: { creditAmount: 4500 },
    settings: { pix_fee_pct: 0 },
  })
  assert.equal(result.grossRevenue, 5000)
  assert.equal(result.cashReceived, 500)
  assert.equal(result.tradeInCredit, 4500)
  assert.equal(result.operationalProfit, 300)
  assert.equal(result.profitabilityLevel, "low")
}

{
  const result = buildRealProfitAnalysis({
    saleId: "trade-in-downgrade",
    salePrice: 3500,
    warrantyMonths: 0,
    mainItem: { id: "store-device-3000", cost: 3000, quantity: 1, costStructured: true },
    payments: [
      { id: "cash-out-1500", paymentMethod: "cash", amount: -1500, status: "received" },
      { id: "trade-5000", paymentMethod: "trade_in_credit", amount: 5000, status: "received", isFinancial: false },
    ],
    tradeIn: { creditAmount: 5000, linkedInventoryId: "future-device-5000" },
  })
  assert.equal(result.economicRevenue, 3500)
  assert.equal(result.tradeInCredit, 5000)
  assert.equal(result.cashReceived, -1500)
  assert.equal(result.futureInventoryValue, 5000)
  assert.equal(result.operationalProfit, 500)
  assert.notEqual(result.profitabilityLevel, "negative")
  assert.notEqual(result.profitabilityLevel, "low")
  assert.ok(result.reasoning.some((line) => line === "Houve saída líquida de caixa por diferença de troca, mas aquisição de ativo futuro compensatório."))
}

{
  const futureResale = buildRealProfitAnalysis({
    saleId: "trade-in-future-resale",
    salePrice: 5800,
    warrantyMonths: 0,
    mainItem: { id: "future-device-5000", cost: 5000, quantity: 1, costStructured: true },
    payments: [],
  })
  assert.equal(futureResale.inventoryCost, 5000)
  assert.equal(futureResale.operationalProfit, 800)
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "negative-margin",
    salePrice: 2800,
    payments: [],
  })
  assert.equal(result.operationalProfit, -200)
  assert.equal(result.availableProfit, 0)
  assert.equal(result.profitabilityLevel, "negative")
  assert.ok(result.lowMarginWarnings.some((warning) => warning.includes("negativo")))
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "cash-full-bad-profit",
    salePrice: 10000,
    netAmount: 10000,
    payments: [{ id: "pay-1", paymentMethod: "pix", amount: 10000, status: "received" }],
    mainItem: {
      ...baseSale.mainItem,
      cost: 9250,
    },
    warrantyMonths: 6,
  })
  assert.equal(result.grossRevenue, 10000)
  assert.equal(result.profitabilityLevel, "low")
  assert.equal(result.availableProfit, 750)
  assert.equal(result.profitAfterOptionalWarrantyReserve, 472.5)
}

{
  const result = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "missing-cost",
    mainItem: {
      id: "main-missing",
      cost: 0,
      quantity: 1,
      costStructured: false,
    },
    payments: [],
  })
  assert.equal(result.inventoryCost, 0)
  assert.ok(result.reasoning.some((line) => line.includes("custo estruturado ausente")))
}

{
  const highMarginLowLiquidity = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "high-margin-low-liquidity",
    salePrice: 6500,
    payments: [],
    mainItem: {
      ...baseSale.mainItem,
      cost: 3000,
      daysInStock: 75,
      liquidityQuality: "low",
    },
  })
  assert.equal(highMarginLowLiquidity.inventoryPressure, "high")
  assert.ok(highMarginLowLiquidity.lowMarginWarnings.some((warning) => warning.includes("baixa liquidez")))
}

{
  const highLiquidityLowMargin = buildRealProfitAnalysis({
    ...baseSale,
    saleId: "high-liquidity-low-margin",
    salePrice: 3250,
    payments: [],
    mainItem: {
      ...baseSale.mainItem,
      cost: 3000,
      daysInStock: 5,
      liquidityQuality: "high",
    },
  })
  assert.equal(highLiquidityLowMargin.inventoryPressure, "low")
  assert.equal(highLiquidityLowMargin.profitabilityLevel, "low")
}

{
  const originalSaleInput: RealProfitSaleInput = {
    saleId: "53d7f7b7-53ad-4d6b-9d5d-f56c5953b9b0",
    saleLabel: "iPhone 17 Pro Max",
    salePrice: 7865,
    warrantyMonths: 3,
    mainItem: { id: "iphone-17-pro-max", cost: 7700, quantity: 1, costStructured: true },
    payments: [
      { id: "cash-4415", paymentMethod: "credit_12x", amount: 4415, status: "received" },
      { id: "trade-3450", paymentMethod: "trade_in_credit", amount: 3450, status: "received", isFinancial: false },
    ],
    netAmount: 4415,
    settings: { credit_12x_fee_pct: 13.2503 },
    tradeIn: { creditAmount: 3450, linkedInventoryId: "iphone-15-pro-max-trade-in" },
  }
  const originalSale = buildRealProfitAnalysis(originalSaleInput)
  assert.equal(originalSale.rawPaymentFeeCost, 585)
  assert.equal(originalSale.effectivePaymentFeeCost, 0)
  assert.equal(originalSale.paymentFeeCost, 0)
  assert.equal(originalSale.paymentFeeResponsibility, "customer_absorbed_fee")
  assert.equal(originalSale.operationalProfit, 165)
  assert.equal(originalSale.availableProfit, 165)
  assert.equal(originalSale.safeWithdrawalAmount, 165)
  assert.equal(originalSale.safeReinvestmentAmount, 165)
  assert.equal(originalSale.profitAfterOptionalWarrantyReserve, 11)
  assert.equal(originalSale.futureInventoryValue, 3450)
  assert.notEqual(originalSale.profitabilityLevel, "negative")

  const futureResale = buildRealProfitAnalysis({
    saleId: "iphone-15-pro-max-resale",
    salePrice: 4400,
    warrantyMonths: 0,
    mainItem: { id: "iphone-15-pro-max-trade-in", cost: 3450, quantity: 1, costStructured: true },
    payments: [],
  })
  assert.equal(futureResale.operationalProfit, 950)
  assert.equal(originalSale.operationalProfit + futureResale.operationalProfit, 1115)

  const snapshot = buildRealProfitSnapshot({ sales: [originalSaleInput] })
  assert.equal(snapshot.negativeSales.length, 0)
}

{
  const result = buildRealProfitAnalysis({
    saleId: "optional-warranty-consuming-profit",
    salePrice: 99,
    warrantyMonths: 3,
    mainItem: { id: "accessory", cost: 54.98, quantity: 1, costStructured: true },
    payments: [],
  })
  assert.equal(result.operationalProfit, 44.02)
  assert.equal(result.availableProfit, 44.02)
  assert.equal(result.safeWithdrawalAmount, 44.02)
  assert.equal(result.safeReinvestmentAmount, 44.02)
  assert.equal(result.optionalWarrantyReserveRecommendation, 50)
  assert.equal(result.profitAfterOptionalWarrantyReserve, -5.98)
  assert.equal(result.warrantyReserveWouldConsumeProfit, true)
  assert.notEqual(result.profitabilityLevel, "negative")
}

{
  const snapshot = buildRealProfitSnapshot({
    sales: [{
      saleId: "optional-warranty-advisory",
      salePrice: 99,
      warrantyMonths: 3,
      mainItem: { id: "accessory", cost: 54.98, quantity: 1, costStructured: true },
      payments: [],
    }],
  })
  assert.equal(snapshot.negativeSales.length, 0)
  assert.equal(snapshot.warrantyReserveAdvisorySales.length, 1)
}

{
  const snapshot = buildRealProfitSnapshot({
    sales: [
      baseSale,
      {
        ...baseSale,
        saleId: "withdrawal-risk",
        salePrice: 2900,
        payments: [],
      },
    ],
  })
  assert.equal(snapshot.sales.length, 2)
  assert.ok(snapshot.protectedCapital > snapshot.availableProfit)
  assert.equal(snapshot.totals.safeWithdrawalAmount, snapshot.availableProfit)
  assert.ok(snapshot.lowMarginWarnings.length > 0)
  assert.equal(snapshot.realizedProfitFromSales, snapshot.totals.operationalProfit)
  assert.ok(snapshot.negativeSales.some((sale) => sale.saleId === "withdrawal-risk"))
}

{
  const snapshot = buildRealProfitSnapshot({
    sales: [
      {
        saleId: "trade-in-downgrade-snapshot",
        salePrice: 3500,
        warrantyMonths: 0,
        mainItem: { id: "store-device-3000", cost: 3000, quantity: 1, costStructured: true },
        payments: [
          { id: "cash-out-1500", paymentMethod: "cash", amount: -1500, status: "received" },
          { id: "trade-5000", paymentMethod: "trade_in_credit", amount: 5000, status: "received", isFinancial: false },
        ],
        tradeIn: { creditAmount: 5000, linkedInventoryId: "future-device-5000" },
      },
      {
        saleId: "negative-for-diagnostics",
        salePrice: 900,
        warrantyMonths: 0,
        mainItem: { id: "device-1000", cost: 1000, quantity: 1, costStructured: true },
      },
    ],
  })
  const diagnostics = buildRealProfitDiagnostics(snapshot)
  assert.equal(diagnostics.tradeInDowngrades.length, 1)
  assert.equal(diagnostics.tradeInDowngrades[0]?.probableReason, "trade_in_cash_downgrade")
  assert.equal(diagnostics.negativeSales.length, 1)
  assert.equal(diagnostics.negativeSales[0]?.saleId, "negative-for-diagnostics")
  assert.equal(diagnostics.tradeInDowngrades[0]?.saleId, "trade-in-downgrade-snapshot")
}

console.log("real-profit-engine tests passed")
