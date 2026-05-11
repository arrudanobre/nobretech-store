import assert from "node:assert/strict"
import { buildCurrentCashCompositionSnapshot } from "@/lib/financial/current-cash-composition-engine"
import { buildFinancialSafetyAudit } from "@/lib/financial/financial-safety-audit"
import { buildProfitAvailabilitySnapshot, resolveProfitAvailabilityPeriod } from "@/lib/financial/profit-availability-engine"
import { buildFinancialDecisionResponse, buildFinancialTraceabilityResponse, buildOwnerMovementListResponse, formatFinancialDecisionResponse } from "./financial-decision-response"
import type { OrionFinancialOperationalContext } from "./financial-context-consumer"

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
    { id: "withdrawal-1", type: "expense", amount: 124.88, status: "reconciled", date: "2026-05-02", sourceType: "owner_profit_withdrawal", description: "Retirada de lucro para Vinicius", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Retirada de lucro" },
    { id: "withdrawal-2", type: "expense", amount: 150, status: "reconciled", date: "2026-05-10", sourceType: "owner_profit_withdrawal", description: "Almoço dia das Mães", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Retirada de lucro" },
  ],
  availableCashNow: 2000,
  upcomingBills: 100,
  safeWithdrawalAmount: 250,
  safeReinvestmentAmount: 300,
})
const cashComposition = buildCurrentCashCompositionSnapshot({
  cashByAccount: [{ accountId: "pagbank", accountName: "PagBank", reconciledBalance: 2000, availableLiquidity: 2000 }],
  profitAvailability,
  protectedOperationalCapital: 1000,
  upcomingBills: 100,
})
const audit = buildFinancialSafetyAudit({
  availableLiquidity: 2000,
  realAvailableProfit: profitAvailability.profitAfterWithdrawals,
  upcomingBills30d: 100,
  safeWithdrawalAmount: 250,
  safeReinvestmentAmount: 300,
})
const highConfidenceAudit = {
  ...audit,
  confidence: "high" as const,
  exactValuesAllowed: true,
}
const financialContext: OrionFinancialOperationalContext = {
  reconciledCashBalance: 2000,
  availableLiquidity: 2000,
  pendingBalance: 0,
  availableOperationalProfitConfidence: "high",
  profitEstimateAvailable: false,
  profitInterpretation: "Lucro estimado não usado.",
  cashHealth: "healthy",
  liquidityPressure: "low",
  financialWarnings: [],
  operationalSummary: "Caixa consolidado e lucro realizado por período.",
  canSafelyReinvest: true,
  canSafelyWithdraw: true,
  safeWithdrawalAmount: 9999,
  safeReinvestmentAmount: 9999,
  profitAvailabilitySnapshot: profitAvailability,
  currentCashCompositionSnapshot: cashComposition,
  financialSafetyAudit: audit,
  reasoningNotes: [],
}

{
  const response = buildFinancialDecisionResponse({
    reasoningMode: "withdrawal_safety",
    financialContext,
    financialSafetyAudit: highConfidenceAudit,
  })
  assert.equal(response.safeWithdrawalAmount, 25.12)
  assert.ok(response.operationalReasoning.some((line) => line.indexOf("Lucro realizado") >= 0))
}

{
  const response = buildFinancialDecisionResponse({
    reasoningMode: "reinvestment_decision",
    financialContext,
    financialSafetyAudit: highConfidenceAudit,
  })
  assert.equal(response.safeReinvestmentAmount, 300)
  const text = formatFinancialDecisionResponse(response)
  assert.ok(text.indexOf("Leitura:") >= 0)
  assert.equal(text.indexOf("campanha"), -1)
}

{
  const partialProfit = buildProfitAvailabilitySnapshot({
    period,
    sales: [
      {
        saleId: "partial",
        economicRevenue: 1000,
        operationalProfit: 400,
        reconciliationDate: "2026-05-04",
        tracedRevenue: 0,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: false,
      },
    ],
    availableCashNow: 2000,
    safeWithdrawalAmount: 300,
  })
  const partialContext = {
    ...financialContext,
    profitAvailabilitySnapshot: partialProfit,
  }
  const response = buildFinancialDecisionResponse({
    reasoningMode: "withdrawal_safety",
    financialContext: partialContext,
    financialSafetyAudit: audit,
  })
  assert.equal(response.safeWithdrawalAmount, 0)
}

{
  const text = buildOwnerMovementListResponse(financialContext, "Me mostre minhas retiradas de lucro")
  assert.ok(text)
  const normalizedText = text.split("\u00a0").join(" ")
  assert.ok(normalizedText.indexOf("Retiradas de lucro no período selecionado:") >= 0)
  assert.ok(normalizedText.indexOf("02/05/2026 — Retirada de lucro para Vinicius") >= 0)
  assert.ok(normalizedText.indexOf("10/05/2026 — Almoço dia das Mães") >= 0)
  assert.ok(normalizedText.indexOf("Total: R$ 274,88") >= 0)
  assert.equal(normalizedText.indexOf("não há detalhamento disponível"), -1)
}

{
  const alignedProfit = buildProfitAvailabilitySnapshot({
    period,
    sales: [
      {
        saleId: "sale-may",
        economicRevenue: 5000,
        operationalProfit: 2026.97,
        reconciliationDate: "2026-05-05",
        tracedRevenue: 5000,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: true,
      },
    ],
    transactions: [
      { id: "withdrawal-a", type: "expense", amount: 124.88, status: "reconciled", date: "2026-05-02", sourceType: "owner_profit_withdrawal", description: "Retirada de lucro para Vinicius", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Retirada de lucro" },
      { id: "withdrawal-b", type: "expense", amount: 150, status: "reconciled", date: "2026-05-10", sourceType: "owner_profit_withdrawal", description: "Almoço dia das Mães", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Retirada de lucro" },
    ],
    availableCashNow: 8269.26,
    upcomingBills: 350,
    safeWithdrawalAmount: 0,
    safeReinvestmentAmount: 0,
  })
  const alignedCash = buildCurrentCashCompositionSnapshot({
    cashByAccount: [{ accountId: "pagbank", accountName: "PagBank", reconciledBalance: 8269.26, availableLiquidity: 8269.26 }],
    profitAvailability: alignedProfit,
    protectedOperationalCapital: 9679,
    upcomingBills: 350,
  })
  const alignedContext: OrionFinancialOperationalContext = {
    ...financialContext,
    reconciledCashBalance: 8269.26,
    availableLiquidity: 8269.26,
    profitAvailabilitySnapshot: alignedProfit,
    currentCashCompositionSnapshot: alignedCash,
    safeWithdrawalAmount: 0,
    financialSafetyAudit: {
      ...audit,
      safeWithdrawalAmount: 0,
      deductions: [],
      warnings: [],
      exactValuesAllowed: false,
      confidence: "medium",
    },
  }
  const response = buildFinancialDecisionResponse({
    reasoningMode: "withdrawal_safety",
    goal: {
      goalType: "unknown",
      targetProfit: 2500,
      horizonDays: null,
      urgency: "medium",
      optimization: "liquidity_plus_margin",
      directQuestion: false,
      needsExecution: false,
      reason: "Teste de saque.",
    },
    financialContext: alignedContext,
    financialSafetyAudit: alignedContext.financialSafetyAudit,
  })
  const text = formatFinancialDecisionResponse(response).split("\u00a0").join(" ")
  assert.equal(response.safeWithdrawalAmount, 1402.09)
  assert.match(text, /não recomendo sacar R\$ 2\.500,00/i)
  assert.match(text, /R\$ 1\.402,09/)
  assert.match(text, /divergência/)
  assert.doesNotMatch(text, /retirada segura.*zero/i)
}

{
  const positiveProfit = buildProfitAvailabilitySnapshot({
    period,
    sales: [
      {
        saleId: "sale-positive",
        economicRevenue: 5000,
        operationalProfit: 2026.97,
        reconciliationDate: "2026-05-05",
        tracedRevenue: 5000,
        hasSalePayment: true,
        hasTransaction: true,
        hasLedgerMovement: true,
      },
    ],
    transactions: [
      { id: "withdrawal-a", type: "expense", amount: 124.88, status: "reconciled", date: "2026-05-02", sourceType: "owner_profit_withdrawal", description: "Retirada de lucro para Vinicius", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Retirada de lucro" },
      { id: "withdrawal-b", type: "expense", amount: 150, status: "reconciled", date: "2026-05-10", sourceType: "owner_profit_withdrawal", description: "Almoço dia das Mães", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Retirada de lucro" },
    ],
    availableCashNow: 8269.26,
    upcomingBills: 378.6,
    safeWithdrawalAmount: 0,
    safeReinvestmentAmount: 0,
  })
  const positiveCash = buildCurrentCashCompositionSnapshot({
    cashByAccount: [{ accountId: "pagbank", accountName: "PagBank", reconciledBalance: 8269.26, availableLiquidity: 8269.26 }],
    profitAvailability: positiveProfit,
    protectedOperationalCapital: 9679,
    upcomingBills: 378.6,
  })
  const context: OrionFinancialOperationalContext = {
    ...financialContext,
    reconciledCashBalance: 8269.26,
    availableLiquidity: 8269.26,
    profitAvailabilitySnapshot: positiveProfit,
    currentCashCompositionSnapshot: positiveCash,
    safeWithdrawalAmount: 0,
    financialSafetyAudit: {
      ...audit,
      availableLiquidity: 8269.26,
      safeWithdrawalAmount: 0,
      cashAfterBills: 7890.66,
      profitAfterBills: 0,
      withdrawalBase: 0,
      deductions: [{ label: "contas próximas", amount: 378.6, reason: "Contas próximas reduzem o lucro disponível, mas não zeram a sobra." }],
      warnings: [],
      exactValuesAllowed: false,
      confidence: "medium",
    },
  }
  const response = buildFinancialDecisionResponse({
    reasoningMode: "withdrawal_safety",
    goal: {
      goalType: "unknown",
      targetProfit: 1000,
      horizonDays: null,
      urgency: "medium",
      optimization: "liquidity_plus_margin",
      directQuestion: false,
      needsExecution: false,
      reason: "Teste de saque menor que lucro após contas.",
    },
    financialContext: context,
    financialSafetyAudit: context.financialSafetyAudit,
  })
  const text = formatFinancialDecisionResponse(response).split("\u00a0").join(" ")
  assert.equal(response.safeWithdrawalAmount, 1373.49)
  assert.match(text, /cabe no limite prudente/i)
  assert.match(text, /R\$ 1\.000,00/)
  assert.match(text, /R\$ 1\.373,49/)
  assert.match(text, /mantenha o restante como capital operacional/i)
  assert.doesNotMatch(text, /limite prudente.*R\$ 0,00/i)
}

{
  const ownerProfit = buildProfitAvailabilitySnapshot({
    period,
    sales: [],
    transactions: [
      { id: "capital-in", type: "income", amount: 7700, status: "reconciled", date: "2026-05-01", sourceType: "owner_contribution", description: "Aporte temporário", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Aporte temporário" },
      { id: "capital-out", type: "expense", amount: 9300, status: "reconciled", date: "2026-05-02", sourceType: "owner_capital_return", description: "Reembolso Nubank", accountName: "PagBank", paymentMethod: "Pix", affectsOwnerEquity: true, category: "Reembolso de aporte temporário" },
    ],
    availableCashNow: 10000,
    upcomingBills: 0,
    safeWithdrawalAmount: 0,
  })
  const context = {
    ...financialContext,
    profitAvailabilitySnapshot: ownerProfit,
  }
  const text = buildFinancialTraceabilityResponse(context, "Extraia minhas devoluções de aporte")?.split("\u00a0").join(" ")
  assert.ok(text)
  assert.ok(text.startsWith("Devoluções de aporte no período selecionado:"))
  assert.match(text, /02\/05\/2026 — Reembolso Nubank/)
  assert.match(text, /Valor: R\$ 9\.300,00/)
  assert.match(text, /Com lastro rastreado: R\$ 7\.700,00/)
  assert.match(text, /Sem lastro rastreado: R\$ 1\.600,00/)
}

{
  const text = buildFinancialTraceabilityResponse(financialContext, "Detalhe de onde veio meu caixa")?.split("\u00a0").join(" ")
  assert.ok(text)
  assert.ok(text.startsWith("Entradas no período:"))
  assert.match(text, /Caixa atual consolidado/)
}

console.log("financial-decision-response tests passed")
