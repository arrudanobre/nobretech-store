import assert from "node:assert/strict"
import { buildCurrentCashCompositionSnapshot } from "@/lib/financial/current-cash-composition-engine"
import { buildFinancialSafetyAudit } from "@/lib/financial/financial-safety-audit"
import { buildProfitAvailabilitySnapshot, resolveProfitAvailabilityPeriod } from "@/lib/financial/profit-availability-engine"
import { buildFinancialDecisionResponse, buildFinancialTraceabilityResponse, buildOwnerMovementListResponse, buildReinvestmentAuditBreakdown, formatFinancialDecisionResponse } from "./financial-decision-response"
import { selectFinancialTraceabilityKind } from "./financial-traceability-router"
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

// Reinvestment: zero safeReinvestment → not_recommended, no "controlled reinvestment"
{
  const zeroReinvestAudit = {
    ...highConfidenceAudit,
    safeReinvestmentAmount: 0,
    exactValuesAllowed: true,
    confidence: "high" as const,
  }
  const baseCashComposition = buildCurrentCashCompositionSnapshot({
    cashByAccount: [{ accountId: "pagbank", accountName: "PagBank", reconciledBalance: 2000, availableLiquidity: 2000 }],
    profitAvailability,
    protectedOperationalCapital: 2000,
    upcomingBills: 100,
  })
  const zeroReinvestContext: OrionFinancialOperationalContext = {
    ...financialContext,
    pendingBalance: 3500,
    safeReinvestmentAmount: 0,
    currentCashCompositionSnapshot: { ...baseCashComposition, availableForReinvestment: 0 },
    financialSafetyAudit: zeroReinvestAudit,
  }
  const response = buildFinancialDecisionResponse({
    reasoningMode: "reinvestment_decision",
    financialContext: zeroReinvestContext,
    financialSafetyAudit: zeroReinvestAudit,
  })
  assert.ok(response.executiveContext, "reinvestment branch must build executiveContext")
  assert.equal(response.executiveContext?.baseDecision?.decision, "not_recommended")
  const text = formatFinancialDecisionResponse(response).split(" ").join(" ")
  assert.ok(text.indexOf("Leitura:") >= 0)
  assert.ok(text.indexOf("não recomendo reinvestir") >= 0, "must make a clear negative decision")
  assert.ok(text.indexOf("recebíveis pendentes") >= 0, "must explain pending receivables are not free cash")
  assert.equal(text.indexOf("controlad"), -1, "must not suggest controlled reinvestment when not_recommended")
  assert.equal(text.indexOf("confiança medium"), -1, "must not expose confidence label")
  assert.equal(text.indexOf("devoluções sem lastro"), -1, "must not dump raw financial breakdown")
  assert.equal(text.indexOf("Período analisado"), -1, "must not dump raw financial period")
  assert.equal(text.indexOf("availableForReinvestment"), -1, "must not expose internal term")
  assert.equal(text.indexOf("safeWithdrawalAmount"), -1, "must not expose internal term")
  assert.equal(text.indexOf("workingCapitalSnapshot"), -1, "must not expose internal term")
}

// Reinvestment: positive safeReinvestment + exactValuesAllowed → allowed
{
  const response = buildFinancialDecisionResponse({
    reasoningMode: "reinvestment_decision",
    financialContext,
    financialSafetyAudit: highConfidenceAudit,
  })
  assert.ok(response.executiveContext, "reinvestment branch must build executiveContext")
  assert.equal(response.executiveContext?.baseDecision?.decision, "allowed")
  const text = formatFinancialDecisionResponse(response).split(" ").join(" ")
  assert.ok(text.indexOf("Leitura:") >= 0)
  assert.ok(text.indexOf("reinvestimento") >= 0)
  assert.equal(text.indexOf("controlad"), -1)
}

// Reinvestment: high cash but zero reinvestment — cash ≠ free capital
{
  const highCashBase = buildCurrentCashCompositionSnapshot({
    cashByAccount: [{ accountId: "pagbank", accountName: "PagBank", reconciledBalance: 50000, availableLiquidity: 50000 }],
    profitAvailability,
    protectedOperationalCapital: 50000,
    upcomingBills: 100,
  })
  const highCashContext: OrionFinancialOperationalContext = {
    ...financialContext,
    reconciledCashBalance: 50000,
    availableLiquidity: 50000,
    safeReinvestmentAmount: 0,
    currentCashCompositionSnapshot: { ...highCashBase, availableForReinvestment: 0 },
    financialSafetyAudit: { ...highConfidenceAudit, safeReinvestmentAmount: 0 },
  }
  const response = buildFinancialDecisionResponse({
    reasoningMode: "reinvestment_decision",
    financialContext: highCashContext,
    financialSafetyAudit: highCashContext.financialSafetyAudit!,
  })
  assert.equal(response.executiveContext?.baseDecision?.decision, "not_recommended")
  const text = formatFinancialDecisionResponse(response).split(" ").join(" ")
  assert.ok(text.indexOf("não recomendo reinvestir") >= 0, "must say not recommended for reinvestment")
}

// Reinvestment intelligence decision → natural executive answer, not withdrawal fallback
{
  const response = buildFinancialDecisionResponse({
    reasoningMode: "reinvestment_decision",
    financialContext,
    financialSafetyAudit: highConfidenceAudit,
    reinvestmentDecision: {
      decision: "reinvest_with_cap",
      confidence: "medium",
      capitalStatus: "sku_slack",
      safeReinvestmentCap: 5200,
      theoreticalCap: 5200,
      capAfterPayables: 5200,
      recommendedReinvestmentAmount: 3600,
      preserveCashAmount: 3000,
      currentCash: 8269.26,
      nearTermReceivables: 3500,
      shortTermReceivables: 3500,
      futureReceivables: 0,
      undatedReceivables: 0,
      receivablesDetailAvailable: true,
      upcomingPayables: 0,
      operationalReserve: 3000,
      rationale: ["Há teto de recompra seletiva.", "iPad teve venda recente com margem boa."],
      precisionWarnings: ["Amostra histórica pequena: trate a recomendação como sinal comercial, não prova estatística."],
      recommendedAction: "Recomprar com teto pequeno e seletivo; não ampliar estoque de forma agressiva.",
      recommendedCategories: [{
        category: "iPad",
        reason: "1 venda recente; margem boa; amostra pequena",
        suggestedBudget: 3600,
        confidence: "low",
      }],
      recommendedProducts: [{
        label: "iPad",
        productType: "iPad",
        model: "iPad",
        reason: "1 venda recente; 25% de margem média; amostra pequena, tratar como sinal e não prova",
        historicalMargin: 25,
        averageDaysInStock: 9,
        recentSalesCount: 1,
        priority: "high",
        probableUnitCost: 2600,
        sampleSize: 1, sampleWarning: "small_sample" as const, periodLabel: "Últimos 90 dias",
        confidence: "low",
      }],
      avoid: [],
      leadContext: {
        activeOpportunities: 0,
        lostLeads: 9,
        shouldFollowUpLostLeads: false,
        note: "Leads perdidos indicam demanda ou falha de conversão, mas não são oportunidade ativa de follow-up.",
      },
      analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
    },
  })
  assert.equal(response.executiveContext?.baseDecision?.decision, "partial")
  const text = formatFinancialDecisionResponse(response).split(" ").join(" ")
  assert.match(text, /recompraria com teto/i)
  assert.match(text, /iPad/i)
  assert.doesNotMatch(text, /Leitura:|Cálculo:|Decisão:|Observação:|safeReinvestmentAmount|availableForReinvestment/)
}

// Reinvestment audit kind: "Abra o cálculo do reinvestimento" routes to reinvestment_audit
{
  assert.equal(selectFinancialTraceabilityKind("Abra o cálculo do reinvestimento"), "reinvestment_audit")
  assert.equal(selectFinancialTraceabilityKind("Detalhe minha recompra"), "reinvestment_audit")
}

// buildReinvestmentAuditBreakdown: shows recompra breakdown, not profit composition
{
  const fakeDecision = {
    decision: "reinvest_with_cap" as const,
    confidence: "medium" as const,
    capitalStatus: "sku_slack" as const,
    safeReinvestmentCap: 8000,
    theoreticalCap: 8000,
    capAfterPayables: 8000,
    recommendedReinvestmentAmount: 5600,
    preserveCashAmount: 3500,
    currentCash: 10000,
    nearTermReceivables: 3000,
    shortTermReceivables: 3000,
    futureReceivables: 500,
    undatedReceivables: 0,
    receivablesDetailAvailable: true,
    upcomingPayables: 1000,
    operationalReserve: 2500,
    rationale: [],
    precisionWarnings: [],
    recommendedAction: "Recomprar com teto.",
    recommendedCategories: [],
    recommendedProducts: [{ label: "iPad (11ª geração)", productType: "iPad", model: "iPad (11ª geração)", reason: "3 vendas; 25% margem", historicalMargin: 25, averageDaysInStock: 9, recentSalesCount: 3, priority: "high" as const, probableUnitCost: 2600, sampleSize: 3, sampleWarning: null, periodLabel: "Últimos 90 dias", confidence: "high" as const }],
    avoid: [{ label: "Cabo USB", reason: "Lucro absoluto baixo." }],
    leadContext: { activeOpportunities: 0, lostLeads: 9, shouldFollowUpLostLeads: false, note: "Leads perdidos como sinal." },
    analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
  }
  const breakdown = buildReinvestmentAuditBreakdown(fakeDecision)
  assert.ok(breakdown.startsWith("Rastreabilidade da recompra"))
  assert.ok(breakdown.includes("Teto teórico"))
  assert.ok(breakdown.includes("Teto após contas"))
  assert.ok(breakdown.includes("Recompra recomendada agora"))
  assert.ok(breakdown.includes("Recebíveis até 3 dias"))
  assert.ok(breakdown.includes("Reserva mínima operacional"))
  assert.ok(breakdown.includes("Contas próximas"))
  assert.ok(breakdown.includes("iPad (11ª geração)"))
  assert.equal(breakdown.includes("iPad iPad"), false, "label must not duplicate")
  assert.equal(breakdown.includes("Composição do lucro realizado"), false)
  assert.ok(breakdown.includes("Observação sobre leads:\n"), "leads block title must be on its own line for structured render")

  // Routed via buildFinancialTraceabilityResponse
  const routed = buildFinancialTraceabilityResponse(financialContext, "Abra o cálculo do reinvestimento", fakeDecision)
  assert.ok(routed)
  assert.ok(routed!.startsWith("Rastreabilidade da recompra"))
}

// Reinvestment executive context: primary number uses recommendedReinvestmentAmount before safeReinvestmentCap
{
  const decisionInput = {
    decision: "reinvest_with_cap" as const,
    confidence: "medium" as const,
    capitalStatus: "sku_slack" as const,
    safeReinvestmentCap: 8000,
    theoreticalCap: 8000,
    capAfterPayables: 8000,
    recommendedReinvestmentAmount: 5600,
    preserveCashAmount: 3500,
    currentCash: 10000,
    nearTermReceivables: 3000,
    shortTermReceivables: 3000,
    futureReceivables: 0,
    undatedReceivables: 0,
    receivablesDetailAvailable: true,
    upcomingPayables: 1000,
    operationalReserve: 2500,
    rationale: ["Caixa atual 10000."],
    precisionWarnings: [],
    recommendedAction: "Recomprar com teto.",
    recommendedCategories: [],
    recommendedProducts: [{ label: "iPad (11ª geração)", productType: "iPad", model: "iPad (11ª geração)", reason: "3 vendas; 25% margem", historicalMargin: 25, averageDaysInStock: 9, recentSalesCount: 3, priority: "high" as const, probableUnitCost: 2600, sampleSize: 3, sampleWarning: null, periodLabel: "Últimos 90 dias", confidence: "high" as const }],
    avoid: [],
    leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads." },
    analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
  }
  const response = buildFinancialDecisionResponse({
    reasoningMode: "reinvestment_decision",
    financialContext,
    financialSafetyAudit: highConfidenceAudit,
    reinvestmentDecision: decisionInput,
  })
  assert.equal(response.executiveContext?.baseDecision?.primaryNumber?.label, "recompra recomendada agora")
  assert.equal(response.executiveContext?.baseDecision?.primaryNumber?.value, 5600)
  const labels = (response.executiveContext?.baseDecision?.supportingNumbers || []).map((item) => item.label)
  assert.ok(labels.includes("recompra recomendada agora"))
  assert.ok(labels.includes("teto teórico"))
  assert.ok(labels.includes("teto após contas"))
  assert.ok(labels.includes("reserva mínima operacional"))
  const text = formatFinancialDecisionResponse(response)
  assert.ok(text.indexOf("Para recompra agora") >= 0 || text.indexOf("recompra recomendada") >= 0)
  assert.equal(text.indexOf("iPad iPad"), -1, "rendered text must not duplicate iPad iPad")
}

// buildReinvestmentAuditBreakdown: candidato plural (no "(s)") and no dot-decimal percent
{
  const smallSampleDecision = {
    decision: "reinvest_with_cap" as const,
    confidence: "low" as const,
    capitalStatus: "sku_slack" as const,
    safeReinvestmentCap: 5000,
    theoreticalCap: 5000,
    capAfterPayables: 5000,
    recommendedReinvestmentAmount: 3000,
    preserveCashAmount: 2000,
    currentCash: 7000,
    nearTermReceivables: 0,
    shortTermReceivables: 0,
    futureReceivables: 0,
    undatedReceivables: 1500,
    receivablesDetailAvailable: false,
    upcomingPayables: 500,
    operationalReserve: 1750,
    rationale: [],
    precisionWarnings: [],
    recommendedAction: "Recomprar com cautela.",
    recommendedCategories: [],
    recommendedProducts: [
      { label: "iPad (11ª geração)", productType: "iPad", model: "iPad", reason: "1 venda recente; 20,7% de margem média; amostra pequena", historicalMargin: 20.7, averageDaysInStock: 8, recentSalesCount: 1, priority: "high" as const, probableUnitCost: 2600, sampleSize: 1, sampleWarning: "small_sample" as const, periodLabel: "Últimos 90 dias", confidence: "low" as const },
      { label: "iPhone 13", productType: "iPhone", model: "iPhone 13", reason: "1 venda recente; 37,5% de margem média; amostra pequena", historicalMargin: 37.5, averageDaysInStock: 12, recentSalesCount: 1, priority: "medium" as const, probableUnitCost: 1800, sampleSize: 1, sampleWarning: "small_sample" as const, periodLabel: "Últimos 90 dias", confidence: "low" as const },
    ],
    avoid: [],
    leadContext: { activeOpportunities: 0, lostLeads: 3, shouldFollowUpLostLeads: false, note: "Leads perdidos como sinal." },
    analysisWindow: { label: "Últimos 90 dias", startDate: "2026-02-12", endDate: "2026-05-12", salesCount: 2, source: "last_90_days" as const },
  }
  const breakdown = buildReinvestmentAuditBreakdown(smallSampleDecision)
  assert.equal(breakdown.includes("candidato(s)"), false, "must not contain candidato(s)")
  assert.ok(breakdown.includes("candidatos"), "plural: 2 candidatos")
  assert.equal(/\d+\.\d+%/.test(breakdown), false, "must not contain dot-decimal percent")
  assert.ok(breakdown.includes("Base analisada"), "must have Base analisada block")
  assert.ok(breakdown.includes("Caixa e recebíveis"), "must have Caixa e recebíveis block")
  assert.ok(breakdown.includes("Recompra"), "must have Recompra block")
}

// buildReinvestmentAuditBreakdown: singular candidato when exactly 1 small-sample product
{
  const singleSmallDecision = {
    decision: "reinvest_with_cap" as const,
    confidence: "low" as const,
    capitalStatus: "sku_slack" as const,
    safeReinvestmentCap: 5000,
    theoreticalCap: 5000,
    capAfterPayables: 5000,
    recommendedReinvestmentAmount: 3000,
    preserveCashAmount: 2000,
    currentCash: 7000,
    nearTermReceivables: 0,
    shortTermReceivables: 0,
    futureReceivables: 0,
    undatedReceivables: 0,
    receivablesDetailAvailable: false,
    upcomingPayables: 0,
    operationalReserve: 1750,
    rationale: [],
    precisionWarnings: [],
    recommendedAction: "Recomprar com cautela.",
    recommendedCategories: [],
    recommendedProducts: [
      { label: "iPad", productType: "iPad", model: "iPad", reason: "1 venda; 25% margem", historicalMargin: 25, averageDaysInStock: 10, recentSalesCount: 1, priority: "high" as const, probableUnitCost: 2600, sampleSize: 1, sampleWarning: "small_sample" as const, periodLabel: "Últimos 90 dias", confidence: "low" as const },
    ],
    avoid: [],
    leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads." },
    analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 1, source: "last_90_days" as const },
  }
  const breakdown = buildReinvestmentAuditBreakdown(singleSmallDecision)
  assert.ok(breakdown.includes("1 candidato com amostra pequena"), "singular: 1 candidato")
  assert.equal(breakdown.includes("candidato(s)"), false, "must not contain candidato(s)")
  assert.equal(breakdown.includes("candidatos com amostra"), false, "must not use plural for 1")
}

console.log("financial-decision-response tests passed")
