import assert from "node:assert/strict"
import { buildFeeModelAudit } from "./fee-model-audit"

const settings = {
  pix_fee_pct: 0,
  cash_discount_pct: 0,
  credit_12x_fee_pct: 13.2503,
  debit_fee_pct: 1.102,
}

{
  const audit = buildFeeModelAudit({
    saleId: "merchant-absorbed",
    salePrice: 1600,
    netAmount: 1520,
    inventoryCost: 1000,
    payments: [{ paymentMethod: "pix", amount: 1520, status: "received" }],
    settings,
  })
  assert.equal(audit.feeResponsibility, "merchant_absorbed_fee")
  assert.equal(audit.feeOrigin, "sales_net_amount_diff")
  assert.equal(audit.unexplainedGrossVsNetDiff, 80)
  assert.equal(audit.paymentFeeShouldAffectProfit, true)
  assert.equal(audit.operationalProfitBeforeFee, 520)
  assert.equal(audit.operationalProfitAfterFee, 440)
}

{
  const audit = buildFeeModelAudit({
    saleId: "customer-absorbed",
    salePrice: 1600,
    netAmount: 1600,
    inventoryCost: 1000,
    payments: [{ paymentMethod: "credit_12x", amount: 1600, status: "received" }],
    settings,
  })
  assert.equal(audit.feeResponsibility, "customer_absorbed_fee")
  assert.equal(audit.feeOrigin, "payment_method_settings")
  assert.equal(audit.paymentFees, 212)
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
  assert.equal(audit.operationalProfitBeforeFee, 600)
  assert.equal(audit.operationalProfitAfterFee, 600)
}

{
  const audit = buildFeeModelAudit({
    saleId: "duplicated-fee",
    salePrice: 1600,
    netAmount: 1600,
    inventoryCost: 1000,
    payments: [{ paymentMethod: "credit_12x", amount: 1600, status: "received" }],
    transactions: [{ sourceType: "card_fee", type: "expense", amount: 212, status: "reconciled" }],
    settings,
  })
  assert.equal(audit.feeResponsibility, "duplicated_fee")
  assert.equal(audit.feeOrigin, "duplicated")
  assert.equal(audit.feeDuplicated, true)
  assert.equal(audit.paymentFeeShouldAffectProfit, true)
  assert.ok(audit.warnings.some((warning) => warning === "Possível duplicidade: taxa aparece em mais de uma origem financeira estruturada."))
}

{
  const audit = buildFeeModelAudit({
    saleId: "installment-no-margin-impact",
    salePrice: 5000,
    netAmount: 5000,
    inventoryCost: 3500,
    payments: [{ paymentMethod: "credit_12x", amount: 5000, status: "received" }],
    settings,
  })
  assert.equal(audit.paymentFees, 662.52)
  assert.equal(audit.feeResponsibility, "customer_absorbed_fee")
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
  assert.equal(audit.operationalProfitAfterFee, 1500)
}

{
  const audit = buildFeeModelAudit({
    saleId: "gross-revenue-protected",
    salePrice: 7865,
    netAmount: 4415,
    inventoryCost: 7700,
    tradeInCredit: 3450,
    payments: [
      { paymentMethod: "credit_12x", amount: 4415, status: "received" },
      { paymentMethod: "trade_in_credit", amount: 3450, status: "received", isFinancial: false },
    ],
    settings,
  })
  assert.equal(audit.grossRevenue, 7865)
  assert.equal(audit.cashReceived, 4415)
  assert.equal(audit.grossVsNetDiff, 3450)
  assert.equal(audit.netDiffExplainedByTradeIn, 3450)
  assert.equal(audit.unexplainedGrossVsNetDiff, 0)
  assert.equal(audit.paymentFeeCost, 585)
  assert.equal(audit.feeResponsibility, "customer_absorbed_fee")
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
  assert.equal(audit.operationalProfitBeforeFee, 165)
  assert.equal(audit.operationalProfitAfterFee, 165)
}

{
  const audit = buildFeeModelAudit({
    saleId: "net-amount-divergent",
    salePrice: 1600,
    netAmount: 1500,
    inventoryCost: 1000,
    payments: [{ paymentMethod: "credit_12x", amount: 1600, status: "received" }],
    settings,
  })
  assert.equal(audit.feeResponsibility, "mixed_fee_model")
  assert.equal(audit.feeOrigin, "mixed")
  assert.equal(audit.unexplainedGrossVsNetDiff, 100)
  assert.equal(audit.paymentFeeShouldAffectProfit, true)
}

{
  const audit = buildFeeModelAudit({
    saleId: "no-fee",
    salePrice: 1500,
    netAmount: 1500,
    inventoryCost: 1000,
    payments: [{ paymentMethod: "pix", amount: 1500, status: "received" }],
    settings,
  })
  assert.equal(audit.feeResponsibility, "unknown_fee_model")
  assert.equal(audit.feeOrigin, "none")
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
  assert.equal(audit.operationalProfitAfterFee, 500)
}

{
  const audit = buildFeeModelAudit({
    saleId: "trade-in-with-fee",
    salePrice: 5000,
    netAmount: 3000,
    inventoryCost: 3500,
    tradeInCredit: 2000,
    payments: [
      { paymentMethod: "credit_12x", amount: 3000, status: "received" },
      { paymentMethod: "trade_in_credit", amount: 2000, status: "received", isFinancial: false },
    ],
    settings,
  })
  assert.equal(audit.feeResponsibility, "customer_absorbed_fee")
  assert.equal(audit.grossRevenue, 5000)
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
}

{
  const audit = buildFeeModelAudit({
    saleId: "downgrade-with-fee",
    salePrice: 3500,
    netAmount: -1500,
    inventoryCost: 3000,
    tradeInCredit: 5000,
    payments: [
      { paymentMethod: "cash", amount: -1500, status: "received" },
      { paymentMethod: "trade_in_credit", amount: 5000, status: "received", isFinancial: false },
    ],
    settings,
  })
  assert.equal(audit.grossRevenue, 3500)
  assert.equal(audit.cashReceived, -1500)
  assert.equal(audit.netDiffExplainedByTradeIn, 5000)
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
}

{
  const audit = buildFeeModelAudit({
    saleId: "transaction-fee-only",
    salePrice: 1600,
    netAmount: 1600,
    inventoryCost: 1000,
    payments: [{ paymentMethod: "pix", amount: 1600, status: "received" }],
    transactions: [{ sourceType: "card_fee", type: "expense", amount: 80, status: "reconciled" }],
    settings,
  })
  assert.equal(audit.feeResponsibility, "merchant_absorbed_fee")
  assert.equal(audit.feeOrigin, "transaction_fee")
  assert.equal(audit.paymentFeeShouldAffectProfit, true)
  assert.equal(audit.operationalProfitAfterFee, 520)
}

{
  const audit = buildFeeModelAudit({
    saleId: "incorrectly-inferred-fee",
    salePrice: 4415,
    netAmount: 4415,
    inventoryCost: 4000,
    payments: [{ paymentMethod: "credit_12x", amount: 4415, status: "received" }],
    settings,
  })
  assert.equal(audit.paymentFees, 585)
  assert.equal(audit.feeResponsibility, "customer_absorbed_fee")
  assert.equal(audit.paymentFeeShouldAffectProfit, false)
  assert.ok(audit.warnings.some((warning) => warning === "A taxa configurada do método não deve ser tratada como custo da loja sem evidência de absorção pelo lojista."))
}

console.log("fee-model-audit tests passed")
