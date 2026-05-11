import assert from "node:assert/strict"
import { buildCurrentCashCompositionSnapshot } from "@/lib/financial/current-cash-composition-engine"
import { buildFinancialSafetyAudit } from "@/lib/financial/financial-safety-audit"
import { buildProfitAvailabilitySnapshot, resolveProfitAvailabilityPeriod } from "@/lib/financial/profit-availability-engine"
import { buildFinancialDecisionResponse, buildOwnerMovementListResponse, formatFinancialDecisionResponse } from "./financial-decision-response"
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
  assert.equal(response.safeWithdrawalAmount, 125.12)
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
  assert.equal(response.safeWithdrawalAmount, undefined)
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

console.log("financial-decision-response tests passed")
