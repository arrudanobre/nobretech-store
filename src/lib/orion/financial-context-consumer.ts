import type { WorkingCapitalSnapshot } from "@/lib/financial/working-capital-engine"
import type { FinancialSafetyAuditBreakdown } from "@/lib/financial/financial-safety-audit"
import type { FinancialScenarioSnapshot } from "@/lib/financial/financial-scenario-separation"
import type { InventoryLiquidityQuality } from "@/lib/financial/inventory-liquidity-quality"
import type { FinancialConfidenceBreakdown } from "@/lib/financial/financial-confidence-breakdown"
import type { ProfitAvailabilitySnapshot } from "@/lib/financial/profit-availability-engine"
import type { CurrentCashCompositionSnapshot } from "@/lib/financial/current-cash-composition-engine"
import type { OwnerCapitalSnapshot } from "@/lib/financial/owner-capital-engine"

export type OrionFinancialConfidence = "low" | "medium" | "high"
export type OrionCashHealth = "critical" | "attention" | "healthy"
export type OrionLiquidityPressure = "low" | "medium" | "high"

type ProfitEstimateInput = {
  amount?: number | null
  confidence?: number | null
  reason?: string | null
} | null | undefined

type LiquidityForecastInput = {
  overduePayables?: number | null
  overdueReceivables?: number | null
  todayPayables?: number | null
  todayReceivables?: number | null
  payables7d?: number | null
  receivables7d?: number | null
  payables15d?: number | null
  receivables15d?: number | null
  payables30d?: number | null
  receivables30d?: number | null
  pressureWindowStartDays?: number | null
  pressureWindowEndDays?: number | null
}

export type BuildFinancialOperationalContextInput = {
  finance: {
    reconciledCashBalance?: number | null
    availableLiquidity?: number | null
    pendingBalance?: number | null
    availableOperationalProfitEstimate?: ProfitEstimateInput
    moneyClassification?: {
      totals?: {
        uncertainCount?: number | null
      } | null
    } | null
    staleAccountBalance?: boolean | null
    ledgerVsAccountDiff?: number | null
    realProfitSnapshot?: {
      availableProfit?: number | null
      realizedProfitFromSales?: number | null
      protectedCapital?: number | null
      inventoryPressure?: "low" | "medium" | "high" | null
      lowMarginWarnings?: string[] | null
      negativeSales?: Array<{ saleId: string; productName?: string | null; operationalProfit: number; reason: string }> | null
      realProfitability?: {
        profitabilityLevel?: string | null
      } | null
    } | null
    workingCapitalSnapshot?: WorkingCapitalSnapshot | null
    financialScenarioSnapshot?: FinancialScenarioSnapshot | null
    inventoryLiquidityQuality?: InventoryLiquidityQuality | null
    financialConfidenceBreakdown?: FinancialConfidenceBreakdown | null
    ownerCapitalSnapshot?: OwnerCapitalSnapshot | null
    profitAvailabilitySnapshot?: ProfitAvailabilitySnapshot | null
    currentCashCompositionSnapshot?: CurrentCashCompositionSnapshot | null
  }
  executive?: {
    pendingReceivables?: number | null
    pendingPayables?: number | null
    activeStockValue?: number | null
    liquidityForecast?: LiquidityForecastInput | null
  } | null
  stock?: {
    stuckItems?: unknown[] | null
  } | null
}

export type OrionFinancialOperationalContext = {
  reconciledCashBalance: number
  availableLiquidity: number
  pendingBalance: number
  availableOperationalProfitEstimate?: number
  availableOperationalProfitConfidence: OrionFinancialConfidence
  profitEstimateAvailable: boolean
  profitInterpretation: string
  cashHealth: OrionCashHealth
  liquidityPressure: OrionLiquidityPressure
  financialWarnings: string[]
  operationalSummary: string
  canSafelyReinvest: boolean
  canSafelyWithdraw: boolean
  realAvailableProfit?: number
  protectedCapital?: number
  protectedOperationalCapital?: number
  safeWithdrawalAmount?: number
  safeReinvestmentAmount?: number
  operationalSurplusAfterBills?: number
  financialSafetyAudit?: FinancialSafetyAuditBreakdown
  financialScenarioSnapshot?: FinancialScenarioSnapshot
  inventoryLiquidityQuality?: InventoryLiquidityQuality
  financialConfidenceBreakdown?: FinancialConfidenceBreakdown
  ownerCapitalSnapshot?: OwnerCapitalSnapshot
  profitAvailabilitySnapshot?: ProfitAvailabilitySnapshot
  currentCashCompositionSnapshot?: CurrentCashCompositionSnapshot
  realProfitabilityLevel?: string
  reasoningNotes: string[]
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(round(value))
}

function confidenceFrom(estimate: ProfitEstimateInput, uncertainCount: number): OrionFinancialConfidence {
  if (!estimate) return "low"
  const confidence = number(estimate.confidence)
  if (confidence >= 0.75 && uncertainCount === 0) return "high"
  if (confidence >= 0.45) return "medium"
  return "low"
}

function buildLiquidityPressure(input: {
  availableLiquidity: number
  pendingBalance: number
  pendingPayables: number
  forecast: LiquidityForecastInput
}): OrionLiquidityPressure {
  const immediatePayables = number(input.forecast.overduePayables) + number(input.forecast.todayPayables)
  const pressureWindowStartDays = input.forecast.pressureWindowStartDays
  if (
    input.availableLiquidity <= 0 ||
    immediatePayables > input.availableLiquidity ||
    (pressureWindowStartDays !== null && pressureWindowStartDays !== undefined && pressureWindowStartDays <= 7)
  ) {
    return "high"
  }

  if (
    number(input.forecast.payables7d) > input.availableLiquidity ||
    number(input.forecast.payables15d) > input.availableLiquidity ||
    input.pendingPayables > 0 ||
    input.pendingBalance < 0 ||
    (pressureWindowStartDays !== null && pressureWindowStartDays !== undefined && pressureWindowStartDays <= 15)
  ) {
    return "medium"
  }

  return "low"
}

function buildCashHealth(input: {
  reconciledCashBalance: number
  availableLiquidity: number
  liquidityPressure: OrionLiquidityPressure
  staleAccountBalance: boolean
}): OrionCashHealth {
  if (input.reconciledCashBalance < 0 || input.availableLiquidity <= 0) return "critical"
  if (input.liquidityPressure === "high") return "critical"
  if (input.liquidityPressure === "medium" || input.staleAccountBalance) return "attention"
  return "healthy"
}

export function buildFinancialOperationalContext(input: BuildFinancialOperationalContextInput): OrionFinancialOperationalContext {
  const finance = input.finance
  const executive = input.executive || {}
  const forecast = executive.liquidityForecast || {}
  const reconciledCashBalance = round(number(finance.reconciledCashBalance))
  const availableLiquidity = round(number(finance.availableLiquidity))
  const pendingBalance = round(number(finance.pendingBalance))
  const pendingReceivables = round(number(executive.pendingReceivables))
  const pendingPayables = round(number(executive.pendingPayables))
  const estimate = finance.availableOperationalProfitEstimate || null
  const realProfit = finance.realProfitSnapshot || null
  const workingCapital = finance.workingCapitalSnapshot || null
  const financialScenario = finance.financialScenarioSnapshot || null
  const inventoryQuality = finance.inventoryLiquidityQuality || null
  const confidenceBreakdown = finance.financialConfidenceBreakdown || null
  const ownerCapital = finance.ownerCapitalSnapshot || null
  const profitAvailability = finance.profitAvailabilitySnapshot || null
  const cashComposition = finance.currentCashCompositionSnapshot || null
  const estimateAvailable = Boolean(estimate)
  const estimateAmount = estimateAvailable ? round(number(estimate?.amount)) : undefined
  const uncertainCount = number(finance.moneyClassification?.totals?.uncertainCount)
  const availableOperationalProfitConfidence = confidenceFrom(estimate, uncertainCount)
  const liquidityPressure = buildLiquidityPressure({
    availableLiquidity,
    pendingBalance,
    pendingPayables,
    forecast,
  })
  const staleAccountBalance = Boolean(finance.staleAccountBalance)
  const cashHealth = buildCashHealth({
    reconciledCashBalance,
    availableLiquidity,
    liquidityPressure,
    staleAccountBalance,
  })
  const financialWarnings: string[] = []
  const reasoningNotes: string[] = [
    `Caixa reconciliado confirmado: ${brl(reconciledCashBalance)}.`,
    `Liquidez disponível agora: ${brl(availableLiquidity)}.`,
    `Saldo pendente líquido: ${brl(pendingBalance)}; pendências não são dinheiro disponível.`,
  ]

  let profitInterpretation = "A estimativa operacional de lucro ainda não está disponível no contexto atual; a ORION não deve recalcular nem substituir por outro campo."
  if (estimateAvailable) {
    profitInterpretation = `Estimativa operacional disponível: ${brl(estimateAmount || 0)}. Não representa lucro real definitivo por SKU/bundle.`
    reasoningNotes.push(estimate?.reason || "Estimativa baseada nos movimentos financeiros classificados.")
  } else {
    financialWarnings.push("Estimativa operacional de lucro indisponível no contexto atual.")
  }

  if (availableOperationalProfitConfidence === "low") {
    financialWarnings.push("Confiança baixa na leitura de lucro operacional estimado.")
  }
  if (pendingReceivables > 0) {
    financialWarnings.push(`${brl(pendingReceivables)} ainda depende de recebíveis e não deve ser tratado como liquidez disponível.`)
  }
  if (pendingPayables > 0) {
    financialWarnings.push(`${brl(pendingPayables)} em pagáveis pendentes deve ser preservado na leitura de caixa futuro.`)
  }
  if (liquidityPressure === "high") {
    financialWarnings.push("Pressão de liquidez elevada: reinvestimento deve ficar limitado à margem auditada.")
  } else if (liquidityPressure === "medium") {
    financialWarnings.push("Liquidez moderada: reinvestimento controlado preserva flexibilidade operacional.")
  }
  if (staleAccountBalance) {
    financialWarnings.push(`Cache da conta diverge do ledger em ${brl(number(finance.ledgerVsAccountDiff))}; use o ledger como leitura principal.`)
  }
  if (uncertainCount > 0) {
    financialWarnings.push(`${uncertainCount} movimento${uncertainCount === 1 ? "" : "s"} com classificação financeira incerta.`)
  }
  if ((input.stock?.stuckItems?.length || 0) > 0 && inventoryQuality?.inventoryQuality === "stressed") {
    financialWarnings.push("Há estoque com aging, margem e liquidez pressionados; não confunda estoque projetado com caixa disponível.")
  }
  if (realProfit) {
    reasoningNotes.push(`Lucro realizado rastreável: ${brl(financialScenario?.realizedProfit ?? number(realProfit.availableProfit))}.`)
    if (realProfit.inventoryPressure === "high" && inventoryQuality?.inventoryQuality === "stressed") {
      financialWarnings.push("Pressão de estoque alta reduz qualidade do lucro e pede recomposição disciplinada.")
    }
    for (const warning of realProfit.lowMarginWarnings || []) {
      if (warning === "Venda com lucro operacional negativo." && !(realProfit.negativeSales?.length || 0)) continue
      financialWarnings.push(warning)
    }
  }
  if (financialScenario) {
    reasoningNotes.push(`Lucro realizado após contas próximas: ${brl(financialScenario.realizedProfitAfterBills)}.`)
    if (financialScenario.projectedInventoryProfit > 0) {
      reasoningNotes.push(`Potencial projetado de estoque separado do lucro realizado: ${brl(financialScenario.projectedInventoryProfit)}.`)
    }
    for (const warning of financialScenario.warnings) financialWarnings.push(warning)
  }
  if (profitAvailability) {
    reasoningNotes.push(`Período financeiro analisado: ${profitAvailability.period.label} (${profitAvailability.period.startDate} a ${profitAvailability.period.endDate}).`)
    reasoningNotes.push(`Lucro realizado no período: ${brl(profitAvailability.realizedProfitInPeriod)}; lucro após retiradas: ${brl(profitAvailability.profitAfterWithdrawals)}.`)
    if (profitAvailability.ownerProfitWithdrawalsInPeriod > 0) {
      reasoningNotes.push(`Retiradas de lucro no período: ${brl(profitAvailability.ownerProfitWithdrawalsInPeriod)}.`)
    }
    if (profitAvailability.ownerCapitalReturnsInPeriod > 0) {
      reasoningNotes.push(`Devoluções de aporte no período: ${brl(profitAvailability.ownerCapitalReturnsInPeriod)}.`)
    }
    if (profitAvailability.untracedOwnerCapitalReturnsInPeriod > 0) {
      reasoningNotes.push(`Devoluções de aporte sem lastro rastreado: ${brl(profitAvailability.untracedOwnerCapitalReturnsInPeriod)}.`)
      financialWarnings.push("Parte das devoluções de aporte não possui aporte rastreado suficiente no sistema; isso reduz confiança, mas não foi tratado como retirada de lucro.")
    }
    if (profitAvailability.partiallyTracedSales.length > 0) {
      financialWarnings.push("Há vendas parcialmente rastreadas; lucro disponível deve ser lido com confiança reduzida.")
    }
    for (const warning of profitAvailability.warnings) financialWarnings.push(warning)
  }
  if (cashComposition) {
    reasoningNotes.push(`Caixa consolidado atual: ${brl(cashComposition.consolidatedCash)} em ${cashComposition.cashByAccount.length} conta${cashComposition.cashByAccount.length === 1 ? "" : "s"}.`)
    reasoningNotes.push(`Composição: ${brl(cashComposition.estimatedAvailableProfit)} de lucro disponível estimado e ${brl(cashComposition.operationalRecompositionCapital)} de recomposição/capital operacional.`)
    for (const warning of cashComposition.warnings) financialWarnings.push(warning)
  }
  if (inventoryQuality) {
    for (const warning of inventoryQuality.warnings) financialWarnings.push(warning)
    reasoningNotes.push(...inventoryQuality.reasoning)
  }
  if (confidenceBreakdown) {
    for (const warning of confidenceBreakdown.warnings) financialWarnings.push(warning)
    reasoningNotes.push(`Confiança financeira ${confidenceBreakdown.level}: ${Math.round(confidenceBreakdown.overallConfidence * 100)}%.`)
  }
  if (workingCapital) {
    reasoningNotes.push(`Capital operacional protegido atual: ${brl(workingCapital.protectedOperationalCapital)}.`)
    reasoningNotes.push(`Retirada segura estimada: ${brl(workingCapital.safeWithdrawalAmount)}.`)
    for (const warning of workingCapital.warnings) financialWarnings.push(warning)
    if (workingCapital.financialSafetyAudit) {
      reasoningNotes.push(`Auditoria financeira de segurança: confiança ${workingCapital.financialSafetyAudit.confidence}.`)
      if (workingCapital.financialSafetyAudit.confidence === "low") {
        financialWarnings.push("Auditoria financeira com confiança baixa; evite apresentar retirada ou reinvestimento como valor exato seguro.")
      }
    }
  } else if (realProfit) {
    reasoningNotes.push(`Capital protegido pela Real Profit Engine: ${brl(number(realProfit.protectedCapital))}.`)
  }

  const effectiveAvailableProfit = workingCapital
    ? profitAvailability ? profitAvailability.profitAfterWithdrawals : workingCapital.realAvailableProfit
    : financialScenario ? financialScenario.realizedProfit : realProfit ? number(realProfit.availableProfit) : estimateAmount || 0
  const canSafelyReinvest = cashHealth === "healthy"
    && liquidityPressure === "low"
    && availableLiquidity > 0
    && !staleAccountBalance
    && (workingCapital ? workingCapital.safeReinvestmentAmount > 0 && workingCapital.financialSafetyAudit?.confidence !== "low" : (!realProfit || effectiveAvailableProfit > 0))
  const canSafelyWithdraw = (estimateAvailable || Boolean(realProfit))
    && availableOperationalProfitConfidence !== "low"
    && effectiveAvailableProfit > 0
    && availableLiquidity >= effectiveAvailableProfit
    && cashHealth === "healthy"
    && liquidityPressure === "low"
    && (!workingCapital || (workingCapital.safeWithdrawalAmount > 0 && workingCapital.financialSafetyAudit?.confidence !== "low"))

  const operationalSummary = [
    `Caixa confirmado em ${brl(reconciledCashBalance)} e liquidez disponível em ${brl(availableLiquidity)}.`,
    profitAvailability
      ? `No período ${profitAvailability.period.label}, lucro realizado foi ${brl(profitAvailability.realizedProfitInPeriod)} e lucro após retiradas é ${brl(profitAvailability.profitAfterWithdrawals)}.`
      : null,
    cashComposition
      ? `Composição consolidada estima ${brl(cashComposition.estimatedAvailableProfit)} como lucro disponível e ${brl(cashComposition.operationalRecompositionCapital)} como recomposição/capital operacional.`
      : null,
    estimateAvailable
      ? `Estimativa operacional deve ser lida separada do lucro realizado: ${brl(estimateAmount || 0)}, com confiança ${availableOperationalProfitConfidence}.`
      : "Lucro operacional estimado não está disponível neste contexto.",
    pendingBalance !== 0
      ? `Pendências somam ${brl(pendingBalance)} líquidos e ficam fora da liquidez real.`
      : "Sem pendência líquida relevante no contexto financeiro.",
  ].filter(Boolean).join(" ")

  return {
    reconciledCashBalance,
    availableLiquidity,
    pendingBalance,
    availableOperationalProfitEstimate: estimateAmount,
    availableOperationalProfitConfidence,
    profitEstimateAvailable: estimateAvailable,
    profitInterpretation,
    cashHealth,
    liquidityPressure,
    financialWarnings,
    operationalSummary,
    canSafelyReinvest,
    canSafelyWithdraw,
    realAvailableProfit: financialScenario ? financialScenario.realizedProfit : realProfit ? round(number(realProfit.realizedProfitFromSales ?? realProfit.availableProfit)) : undefined,
    protectedCapital: workingCapital ? workingCapital.protectedOperationalCapital : realProfit ? round(number(realProfit.protectedCapital)) : undefined,
    protectedOperationalCapital: workingCapital?.protectedOperationalCapital,
    safeWithdrawalAmount: workingCapital?.safeWithdrawalAmount,
    safeReinvestmentAmount: workingCapital?.safeReinvestmentAmount,
    operationalSurplusAfterBills: workingCapital?.operationalSurplusAfterBills,
    financialSafetyAudit: workingCapital?.financialSafetyAudit,
    financialScenarioSnapshot: financialScenario || undefined,
    inventoryLiquidityQuality: inventoryQuality || undefined,
    financialConfidenceBreakdown: confidenceBreakdown || undefined,
    ownerCapitalSnapshot: ownerCapital || undefined,
    profitAvailabilitySnapshot: profitAvailability || undefined,
    currentCashCompositionSnapshot: cashComposition || undefined,
    realProfitabilityLevel: realProfit?.realProfitability?.profitabilityLevel || undefined,
    reasoningNotes,
  }
}
