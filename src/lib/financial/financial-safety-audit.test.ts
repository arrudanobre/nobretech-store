import assert from "node:assert/strict"
import { buildFinancialSafetyAudit } from "./financial-safety-audit"

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 10000,
    activeInventoryCapital: 4000,
    protectedOperationalCapital: 4500,
    structuredOperationalReserves: 500,
    realAvailableProfit: 3000,
    upcomingBills30d: 500,
  })
  assert.equal(audit.confidence, "high")
  assert.equal(audit.activeInventoryCapital, 4000)
  assert.equal(audit.protectedOperationalCapital, 4500)
  assert.equal(audit.safeWithdrawalAmount, 2500)
  assert.ok(audit.deductions.some((item) => item.label === "contas próximas"))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5000,
    realAvailableProfit: 1800,
    estimatedOperationalProfit: { amount: 3500, confidence: 0.92 },
    upcomingBills30d: 300,
  })
  assert.equal(audit.profitBasis.source, "real_profit")
  assert.equal(audit.realProfitUsed, 1800)
  assert.equal(audit.estimatedOperationalProfitUsed, 0)
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5000,
    estimatedOperationalProfit: { amount: 2600, confidence: 0.82, mayAlreadyIncludeDeductions: true },
    upcomingBills30d: 600,
  })
  assert.equal(audit.profitBasis.source, "estimated_operational_profit")
  assert.equal(audit.confidence, "low")
  assert.ok(audit.warnings.some((warning) => warning === "ProfitBasis pode já conter deduções anteriores; descontar contas novamente pode reduzir disponibilidade duas vezes."))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 6000,
    activeInventoryCapital: 3000,
    protectedOperationalCapital: 7000,
    structuredOperationalReserves: 500,
    realAvailableProfit: 2500,
    upcomingBills30d: 300,
  })
  assert.equal(audit.confidence, "low")
  assert.ok(audit.warnings.some((warning) => warning === "Capital protegido diverge de estoque ativo + reservas estruturadas; possível proteção duplicada ou base externa não auditada."))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5869,
    realAvailableProfit: 2946,
    upcomingBills30d: 350,
    safeReinvestmentAmount: 87.5,
  })
  assert.equal(audit.confidence, "low")
  assert.ok(audit.warnings.some((warning) => warning === "safeReinvestmentAmount informado diverge da recomposição auditável; possível clamp oculto ou lógica externa."))
  assert.equal(audit.exactValuesAllowed, false)
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5869,
    activeInventoryCapital: 4100,
    protectedOperationalCapital: 38896,
    historicalCostBasis: 38896,
    realAvailableProfit: 2946,
    upcomingBills30d: 350,
  })
  assert.equal(audit.confidence, "low")
  assert.ok(audit.warnings.some((warning) => warning === "ProtectedOperationalCapital parece usar custo histórico/CMV em vez de estoque ativo atual."))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 3000,
    activeInventoryCapital: 2200,
    protectedOperationalCapital: 2200,
    realAvailableProfit: 900,
    upcomingBills30d: 100,
  })
  assert.equal(audit.activeInventoryCapital, 2200)
  assert.equal(audit.protectedOperationalCapital, 2200)
  assert.ok(!audit.warnings.some((warning) => warning === "ProtectedOperationalCapital parece usar custo histórico/CMV em vez de estoque ativo atual."))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5000,
    estimatedOperationalProfit: { amount: 9000, confidence: 0.9 },
    upcomingBills30d: 500,
  })
  assert.equal(audit.profitBasis.source, "estimated_operational_profit")
  assert.ok(audit.warnings.some((warning) => warning === "ProfitBasis é maior que liquidez disponível; não deve ser tratado como caixa."))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5000,
    realAvailableProfit: 3000,
    upcomingBills30d: 500,
    pendingPayables: 1000,
  })
  assert.equal(audit.safetyReserveApplied, 250)
  assert.equal(audit.safeWithdrawalAmount, 2250)
  assert.ok(audit.deductions.some((item) => item.label === "reserva de pagáveis" && item.amount === 250))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5000,
    estimatedOperationalProfit: { amount: 3000, confidence: 0.5 },
    upcomingBills30d: 500,
  })
  assert.equal(audit.confidence, "low")
  assert.equal(audit.exactValuesAllowed, false)
  assert.ok(audit.warnings.some((warning) => warning === "Valor seguro positivo sem confiança suficiente; respostas executivas devem ser qualitativas."))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 8000,
    realAvailableProfit: 5000,
    upcomingBills30d: 1000,
  })
  assert.equal(audit.safeWithdrawalAmount, 4000)
  assert.equal(audit.safeReinvestmentAmount, 4000)
  assert.equal(audit.capitalCompetitionAmount, 4000)
  assert.equal(audit.confidence, "high")
  assert.ok(audit.warnings.some((warning) => warning === "Retirada segura e reinvestimento seguro competem pelo mesmo capital; não somar os dois como disponibilidade livre."))
  assert.ok(audit.deductions.some((deduction) => deduction.label === "capacidade compartilhada com retirada"))
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5869,
    realAvailableProfit: 2946,
    upcomingBills30d: 350,
    safeReinvestmentAmount: 87.5,
  })
  assert.equal(audit.exactValuesAllowed, false)
  assert.ok(audit.deductions.length > 0)
  assert.ok(audit.warnings.length > 0)
}

{
  const audit = buildFinancialSafetyAudit({
    availableLiquidity: 5000,
    realAvailableProfit: 3000,
    upcomingBills30d: 500,
    pendingPayables: 100,
  })
  assert.equal(audit.pendingPayablesReserve, 25)
  assert.equal(audit.safeWithdrawalAmount, 2475)
  assert.equal(audit.safeReinvestmentAmount, 2475)
  assert.ok(!audit.warnings.some((warning) => warning === "Pagáveis pendentes e contas próximas podem estar representando a mesma obrigação; revisar risco de desconto duplicado."))
}

console.log("financial-safety-audit tests passed")
