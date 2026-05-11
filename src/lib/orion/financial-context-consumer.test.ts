import assert from "node:assert/strict"
import { buildFinancialOperationalContext } from "./financial-context-consumer"

const baseInput = {
  finance: {
    reconciledCashBalance: 5869.26,
    availableLiquidity: 5869.26,
    pendingBalance: 500,
    availableOperationalProfitEstimate: {
      amount: 2100,
      confidence: 0.62,
      reason: "Estimativa operacional baseada em movimentos classificados.",
    },
    moneyClassification: {
      totals: {
        uncertainCount: 0,
      },
    },
    staleAccountBalance: false,
    ledgerVsAccountDiff: 0,
  },
  executive: {
    pendingReceivables: 850,
    pendingPayables: 350,
    activeStockValue: 12000,
    liquidityForecast: {
      overduePayables: 0,
      overdueReceivables: 0,
      todayPayables: 0,
      todayReceivables: 0,
      payables7d: 900,
      receivables7d: 400,
      payables15d: 1300,
      receivables15d: 700,
      pressureWindowStartDays: null,
      pressureWindowEndDays: null,
    },
  },
  stock: {
    stuckItems: [],
  },
}

{
  const context = buildFinancialOperationalContext(baseInput)
  assert.equal(context.reconciledCashBalance, 5869.26)
  assert.equal(context.availableLiquidity, 5869.26)
  assert.equal(context.pendingBalance, 500)
  assert.equal(context.availableOperationalProfitEstimate, 2100)
  assert.equal(context.availableOperationalProfitConfidence, "medium")
  assert.equal(context.cashHealth, "attention")
  assert.equal(context.liquidityPressure, "medium")
  assert.equal(context.canSafelyReinvest, false)
  assert.equal(context.canSafelyWithdraw, false)
  assert.match(context.profitInterpretation, /Estimativa operacional/)
  assert.doesNotMatch(context.profitInterpretation, /lucro real definitivo disponível/i)
  assert.ok(context.financialWarnings.some((warning) => warning.includes("recebíveis")))
}

{
  const context = buildFinancialOperationalContext({
    ...baseInput,
    finance: {
      ...baseInput.finance,
      availableOperationalProfitEstimate: undefined,
    },
  })
  assert.equal(context.profitEstimateAvailable, false)
  assert.equal(context.availableOperationalProfitEstimate, undefined)
  assert.equal(context.availableOperationalProfitConfidence, "low")
  assert.match(context.profitInterpretation, /não deve recalcular/)
  assert.ok(context.financialWarnings.some((warning) => warning.includes("indisponível")))
}

{
  const context = buildFinancialOperationalContext({
    ...baseInput,
    finance: {
      ...baseInput.finance,
      availableOperationalProfitEstimate: {
        amount: 1200,
        confidence: 0.21,
        reason: "Classificações insuficientes.",
      },
      moneyClassification: {
        totals: {
          uncertainCount: 2,
        },
      },
    },
  })
  assert.equal(context.availableOperationalProfitConfidence, "low")
  assert.ok(context.financialWarnings.some((warning) => warning.includes("Confiança baixa")))
  assert.ok(context.financialWarnings.some((warning) => warning.includes("2 movimentos")))
}

{
  const context = buildFinancialOperationalContext({
    ...baseInput,
    finance: {
      ...baseInput.finance,
      availableLiquidity: 300,
    },
    executive: {
      ...baseInput.executive,
      liquidityForecast: {
        ...baseInput.executive.liquidityForecast,
        overduePayables: 700,
        pressureWindowStartDays: 0,
      },
    },
  })
  assert.equal(context.liquidityPressure, "high")
  assert.equal(context.cashHealth, "critical")
  assert.equal(context.canSafelyReinvest, false)
  assert.equal(context.canSafelyWithdraw, false)
}

{
  const context = buildFinancialOperationalContext({
    ...baseInput,
    finance: {
      ...baseInput.finance,
      pendingBalance: 0,
      availableOperationalProfitEstimate: {
        amount: 1500,
        confidence: 0.83,
        reason: "Estimativa operacional classificada.",
      },
    },
    executive: {
      ...baseInput.executive,
      pendingReceivables: 0,
      pendingPayables: 0,
      liquidityForecast: {
        overduePayables: 0,
        overdueReceivables: 0,
        todayPayables: 0,
        todayReceivables: 0,
        payables7d: 0,
        receivables7d: 0,
        payables15d: 0,
        receivables15d: 0,
        pressureWindowStartDays: null,
        pressureWindowEndDays: null,
      },
    },
  })
  assert.equal(context.cashHealth, "healthy")
  assert.equal(context.liquidityPressure, "low")
  assert.equal(context.availableOperationalProfitConfidence, "high")
  assert.equal(context.canSafelyReinvest, true)
  assert.equal(context.canSafelyWithdraw, true)
}

{
  const context = buildFinancialOperationalContext({
    ...baseInput,
    finance: {
      ...baseInput.finance,
      staleAccountBalance: true,
      ledgerVsAccountDiff: 2450,
    },
  })
  assert.equal(context.cashHealth, "attention")
  assert.equal(context.canSafelyReinvest, false)
  assert.ok(context.financialWarnings.some((warning) => warning.includes("Cache da conta diverge")))
}

console.log("financial-context-consumer tests passed")
