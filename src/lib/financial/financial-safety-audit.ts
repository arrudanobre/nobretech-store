export type FinancialSafetyConfidence = "low" | "medium" | "high"

export type FinancialSafetyDeduction = {
  label: string
  amount: number
  reason: string
}

export type FinancialSafetyProfitBasisSource = "real_profit" | "estimated_operational_profit" | "none"

export type FinancialSafetyProfitBasisAudit = {
  source: FinancialSafetyProfitBasisSource
  field: string
  amount: number
  alreadyConsidersProtectedCapital: boolean
  mayAlreadyIncludeDeductions: boolean
  treatedAsCash: boolean
  reason: string
}

const CAPITAL_COMPETITION_WARNING = "Retirada segura e reinvestimento seguro competem pelo mesmo capital; não somar os dois como disponibilidade livre."

export type FinancialSafetyAuditBreakdown = {
  availableLiquidity: number
  activeInventoryCapital: number
  protectedOperationalCapital: number
  pendingPayables: number
  pendingReceivables: number
  operationalSurplusAfterBills: number
  safetyReserveApplied: number
  pendingPayablesReserve: number
  operationalReserve: number
  reinvestmentBase: number
  confidenceFactor: number
  capitalCompetitionAmount: number
  estimatedOperationalProfitUsed: number
  realProfitUsed: number
  safeWithdrawalAmount: number
  safeReinvestmentAmount: number
  recommendedCapitalAction: "hold_cash" | "small_reinvestment" | "safe_reinvestment" | "withdrawal_possible"
  deductions: FinancialSafetyDeduction[]
  warnings: string[]
  confidence: FinancialSafetyConfidence
  profitBasis: FinancialSafetyProfitBasisAudit
  cashAfterBills: number
  profitAfterBills: number
  withdrawalBase: number
  exactValuesAllowed: boolean
}

export type BuildFinancialSafetyAuditInput = {
  availableLiquidity?: number | string | null
  activeInventoryCapital?: number | string | null
  protectedOperationalCapital?: number | string | null
  pendingPayables?: number | string | null
  pendingReceivables?: number | string | null
  upcomingBills30d?: number | string | null
  structuredOperationalReserves?: number | string | null
  estimatedOperationalProfit?: {
    amount?: number | string | null
    confidence?: number | string | null
    reason?: string | null
    alreadyConsidersProtectedCapital?: boolean | null
    mayAlreadyIncludeDeductions?: boolean | null
  } | null
  realAvailableProfit?: number | string | null
  realProfitAlreadyConsidersProtectedCapital?: boolean | null
  realProfitMayAlreadyIncludeDeductions?: boolean | null
  safeWithdrawalAmount?: number | string | null
  safeReinvestmentAmount?: number | string | null
  operationalSurplusAfterBills?: number | string | null
  expectedSafeWithdrawalAmount?: number | string | null
  expectedSafeReinvestmentAmount?: number | string | null
  expectedOperationalSurplusAfterBills?: number | string | null
  historicalCostBasis?: number | string | null
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function positive(value: unknown) {
  return Math.max(0, number(value))
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function confidenceScore(confidence: unknown) {
  const score = number(confidence)
  if (score <= 0) return 0
  return Math.max(0, Math.min(1, score))
}

function addDeduction(deductions: FinancialSafetyDeduction[], label: string, amount: number, reason: string) {
  const rounded = roundCurrency(Math.max(0, amount))
  if (rounded <= 0) return
  deductions.push({ label, amount: rounded, reason })
}

function buildProfitBasis(input: BuildFinancialSafetyAuditInput): FinancialSafetyProfitBasisAudit {
  const realProfit = positive(input.realAvailableProfit)
  const estimated = positive(input.estimatedOperationalProfit?.amount)

  if (realProfit > 0) {
    return {
      source: "real_profit",
      field: "realAvailableProfit",
      amount: roundCurrency(realProfit),
      alreadyConsidersProtectedCapital: input.realProfitAlreadyConsidersProtectedCapital !== false,
      mayAlreadyIncludeDeductions: Boolean(input.realProfitMayAlreadyIncludeDeductions),
      treatedAsCash: false,
      reason: "Lucro real disponível rastreável venceu a estimativa operacional.",
    }
  }

  if (estimated > 0) {
    return {
      source: "estimated_operational_profit",
      field: "estimatedOperationalProfit.amount",
      amount: roundCurrency(estimated),
      alreadyConsidersProtectedCapital: input.estimatedOperationalProfit?.alreadyConsidersProtectedCapital !== false,
      mayAlreadyIncludeDeductions: Boolean(input.estimatedOperationalProfit?.mayAlreadyIncludeDeductions),
      treatedAsCash: false,
      reason: input.estimatedOperationalProfit?.reason || "Estimativa operacional usada porque lucro real rastreável não está disponível.",
    }
  }

  return {
    source: "none",
    field: "none",
    amount: 0,
    alreadyConsidersProtectedCapital: false,
    mayAlreadyIncludeDeductions: false,
    treatedAsCash: false,
    reason: "Sem lucro real ou estimativa operacional disponível para formar profitBasis.",
  }
}

function debugAudit(audit: FinancialSafetyAuditBreakdown) {
  if (process.env.FINANCIAL_SAFETY_DEBUG !== "true") return
  console.info("[FINANCIAL_SAFETY_AUDIT]", JSON.stringify({
    breakdown: {
      availableLiquidity: audit.availableLiquidity,
      activeInventoryCapital: audit.activeInventoryCapital,
      protectedOperationalCapital: audit.protectedOperationalCapital,
      operationalSurplusAfterBills: audit.operationalSurplusAfterBills,
      safeWithdrawalAmount: audit.safeWithdrawalAmount,
      safeReinvestmentAmount: audit.safeReinvestmentAmount,
      profitBasis: audit.profitBasis,
      cashAfterBills: audit.cashAfterBills,
      profitAfterBills: audit.profitAfterBills,
      withdrawalBase: audit.withdrawalBase,
      reinvestmentBase: audit.reinvestmentBase,
      confidenceFactor: audit.confidenceFactor,
      pendingPayablesReserve: audit.pendingPayablesReserve,
      operationalReserve: audit.operationalReserve,
      capitalCompetitionAmount: audit.capitalCompetitionAmount,
      recommendedCapitalAction: audit.recommendedCapitalAction,
    },
    deductions: audit.deductions,
    warnings: audit.warnings,
    confidence: audit.confidence,
  }))
}

export function buildFinancialSafetyAudit(input: BuildFinancialSafetyAuditInput): FinancialSafetyAuditBreakdown {
  const availableLiquidity = roundCurrency(positive(input.availableLiquidity))
  const activeInventoryCapital = roundCurrency(positive(input.activeInventoryCapital))
  const protectedOperationalCapital = roundCurrency(positive(input.protectedOperationalCapital))
  const pendingPayables = roundCurrency(positive(input.pendingPayables))
  const pendingReceivables = roundCurrency(positive(input.pendingReceivables))
  const upcomingBills30d = roundCurrency(positive(input.upcomingBills30d))
  const structuredOperationalReserves = roundCurrency(positive(input.structuredOperationalReserves))
  const expectedProtectedCapital = roundCurrency(activeInventoryCapital + structuredOperationalReserves)
  const profitBasis = buildProfitBasis(input)
  const estimatedOperationalProfitUsed = profitBasis.source === "estimated_operational_profit" ? profitBasis.amount : 0
  const realProfitUsed = profitBasis.source === "real_profit" ? profitBasis.amount : 0
  const warnings: string[] = []
  const deductions: FinancialSafetyDeduction[] = []
  let hasStructuralDivergence = false
  let hasDuplicatedProtectionRisk = false
  let hasSuspiciousMagicValue = false
  let hasHistoricalCostRisk = false

  const cashAfterBills = roundCurrency(Math.max(0, availableLiquidity - upcomingBills30d))
  const profitAfterBills = roundCurrency(Math.max(0, profitBasis.amount - upcomingBills30d))
  const operationalSurplusAfterBills = roundCurrency(profitBasis.amount - upcomingBills30d)
  const withdrawalBase = roundCurrency(Math.min(availableLiquidity, profitBasis.amount, cashAfterBills, profitAfterBills))

  addDeduction(deductions, "contas próximas", upcomingBills30d, "Contas próximas reduzem caixa e lucro operacional rastreado para decisão.")
  if (withdrawalBase < availableLiquidity) {
    addDeduction(deductions, "limite por caixa/lucro", availableLiquidity - withdrawalBase, "Retirada base foi limitada pelo menor valor entre caixa, profitBasis, caixa após contas e profitBasis após contas.")
  }
  if (withdrawalBase < profitBasis.amount) {
    addDeduction(deductions, "limite por lucro", profitBasis.amount - withdrawalBase, "ProfitBasis não pode ser tratado como totalmente retirável depois de contas próximas.")
  }

  const payablesReserve = roundCurrency(Math.min(withdrawalBase, pendingPayables * 0.25))
  const operationalReserve = roundCurrency(structuredOperationalReserves)
  const withdrawalAfterPayables = roundCurrency(Math.max(0, withdrawalBase - payablesReserve))
  addDeduction(deductions, "reserva de pagáveis", payablesReserve, "Pagáveis pendentes aplicam reserva conservadora de 25% sobre a retirada base.")
  addDeduction(deductions, "reserva operacional", operationalReserve, "Reserva operacional estruturada fica preservada fora do valor livre de decisão.")

  const estimateConfidence = confidenceScore(input.estimatedOperationalProfit?.confidence)
  const confidenceFactorApplied = profitBasis.source === "estimated_operational_profit" && estimateConfidence < 0.75
  const confidenceFactor = confidenceFactorApplied ? 0.5 : 1
  const withdrawalConfidenceReduction = confidenceFactorApplied ? roundCurrency(withdrawalAfterPayables * (1 - confidenceFactor)) : 0
  const calculatedSafeWithdrawalAmount = roundCurrency(Math.max(0, withdrawalAfterPayables * confidenceFactor))
  addDeduction(deductions, "redução por confiança", withdrawalConfidenceReduction, "Estimativa operacional sem confiança alta reduz retirada segura pela metade.")

  const reinvestmentBase = roundCurrency(Math.min(cashAfterBills, profitAfterBills))
  const reinvestmentAfterPayables = roundCurrency(Math.max(0, reinvestmentBase - payablesReserve))
  const reinvestmentConfidenceReduction = confidenceFactorApplied ? roundCurrency(reinvestmentAfterPayables * (1 - confidenceFactor)) : 0
  const calculatedSafeReinvestmentAmount = roundCurrency(Math.max(0, reinvestmentAfterPayables * confidenceFactor))
  addDeduction(deductions, "limite por caixa/lucro para reinvestimento", Math.max(0, availableLiquidity - reinvestmentBase), "Reinvestimento seguro usa o menor valor entre caixa após contas e profitBasis após contas.")
  addDeduction(deductions, "redução por confiança no reinvestimento", reinvestmentConfidenceReduction, "Estimativa operacional sem confiança alta reduz também a margem conservadora de reinvestimento.")

  const safeWithdrawalAmount = roundCurrency(positive(input.safeWithdrawalAmount ?? calculatedSafeWithdrawalAmount))
  const safeReinvestmentAmount = roundCurrency(positive(input.safeReinvestmentAmount ?? calculatedSafeReinvestmentAmount))
  const capitalCompetitionAmount = roundCurrency(Math.min(safeWithdrawalAmount, safeReinvestmentAmount))
  addDeduction(deductions, "capacidade compartilhada com retirada", capitalCompetitionAmount, "Retirada e reinvestimento são capacidades alternativas do mesmo capital; não devem ser somadas como dinheiro livre.")
  const providedOperationalSurplusAfterBills = input.operationalSurplusAfterBills === undefined || input.operationalSurplusAfterBills === null
    ? operationalSurplusAfterBills
    : roundCurrency(number(input.operationalSurplusAfterBills))

  if (protectedOperationalCapital > availableLiquidity && activeInventoryCapital > 0) {
    warnings.push("Capital protegido maior que caixa indica capital imobilizado em estoque ativo, não dívida; exigir explicação no contexto executivo.")
  }
  if (protectedOperationalCapital > 0 && expectedProtectedCapital > 0 && Math.abs(protectedOperationalCapital - expectedProtectedCapital) > 0.01) {
    warnings.push("Capital protegido diverge de estoque ativo + reservas estruturadas; possível proteção duplicada ou base externa não auditada.")
    hasStructuralDivergence = true
    hasDuplicatedProtectionRisk = true
  }
  if (positive(input.historicalCostBasis) > 0 && Math.abs(protectedOperationalCapital - positive(input.historicalCostBasis)) < 0.01 && Math.abs(activeInventoryCapital - positive(input.historicalCostBasis)) > 0.01) {
    warnings.push("ProtectedOperationalCapital parece usar custo histórico/CMV em vez de estoque ativo atual.")
    hasHistoricalCostRisk = true
  }
  if (pendingPayables > 0 && upcomingBills30d > 0 && pendingPayables >= upcomingBills30d) {
    warnings.push("Pagáveis pendentes e contas próximas podem estar representando a mesma obrigação; revisar risco de desconto duplicado.")
    hasDuplicatedProtectionRisk = true
  }
  if (profitBasis.amount > availableLiquidity && profitBasis.source !== "none") {
    warnings.push("ProfitBasis é maior que liquidez disponível; não deve ser tratado como caixa.")
  }
  if (profitBasis.mayAlreadyIncludeDeductions && upcomingBills30d > 0) {
    warnings.push("ProfitBasis pode já conter deduções anteriores; descontar contas novamente pode reduzir disponibilidade duas vezes.")
    hasDuplicatedProtectionRisk = true
  }
  if (profitBasis.alreadyConsidersProtectedCapital && protectedOperationalCapital > 0 && protectedOperationalCapital > activeInventoryCapital + structuredOperationalReserves + 0.01) {
    warnings.push("ProfitBasis já considera capital protegido e protectedOperationalCapital possui base adicional; possível dupla proteção.")
    hasDuplicatedProtectionRisk = true
  }
  if (Math.abs(safeWithdrawalAmount - calculatedSafeWithdrawalAmount) > 0.01) {
    warnings.push("safeWithdrawalAmount informado diverge da recomposição auditável; possível clamp oculto ou lógica externa.")
    hasStructuralDivergence = true
  }
  if (Math.abs(safeReinvestmentAmount - calculatedSafeReinvestmentAmount) > 0.01) {
    warnings.push("safeReinvestmentAmount informado diverge da recomposição auditável; possível clamp oculto ou lógica externa.")
    hasStructuralDivergence = true
  }
  if (Math.abs(providedOperationalSurplusAfterBills - operationalSurplusAfterBills) > 0.01) {
    warnings.push("operationalSurplusAfterBills informado diverge de profitBasis - contas próximas.")
    hasStructuralDivergence = true
  }
  if (safeReinvestmentAmount > 0 && safeReinvestmentAmount < Math.max(100, availableLiquidity * 0.03) && deductions.length < 3) {
    warnings.push("Reinvestimento seguro muito baixo sem breakdown suficiente; tratar como valor suspeito até explicar clamps/deductions.")
    hasSuspiciousMagicValue = true
  }
  if (safeWithdrawalAmount > 0 && safeReinvestmentAmount > 0 && capitalCompetitionAmount > 0) {
    warnings.push(CAPITAL_COMPETITION_WARNING)
  }
  if (confidenceFactorApplied) {
    warnings.push("Valor seguro depende de estimativa operacional com confiança não alta; evitar precisão artificial.")
  }
  if (profitBasis.source === "estimated_operational_profit") {
    warnings.push("ProfitBasis veio de estimativa operacional; não confundir com caixa nem lucro real definitivo.")
  }
  if (profitBasis.source === "none") {
    warnings.push("Sem profitBasis auditável; não exibir retirada/reinvestimento exato.")
  }

  const materialWarnings = warnings.filter((warning) => warning !== CAPITAL_COMPETITION_WARNING)
  let confidence: FinancialSafetyConfidence = "high"
  if (materialWarnings.length > 0 || profitBasis.source === "estimated_operational_profit") confidence = "medium"
  if (
    profitBasis.source === "none"
    || confidenceFactorApplied
    || hasStructuralDivergence
    || hasDuplicatedProtectionRisk
    || hasSuspiciousMagicValue
    || hasHistoricalCostRisk
  ) {
    confidence = "low"
  }

  const sharedCapacity = Math.max(cashAfterBills, profitAfterBills)
  const recommendedCapitalAction: FinancialSafetyAuditBreakdown["recommendedCapitalAction"] = confidence === "low" || safeReinvestmentAmount <= 0
    ? "hold_cash"
    : safeReinvestmentAmount < sharedCapacity * 0.35
      ? "small_reinvestment"
      : safeReinvestmentAmount >= safeWithdrawalAmount
        ? "safe_reinvestment"
        : "withdrawal_possible"

  const audit: FinancialSafetyAuditBreakdown = {
    availableLiquidity,
    activeInventoryCapital,
    protectedOperationalCapital,
    pendingPayables,
    pendingReceivables,
    operationalSurplusAfterBills: providedOperationalSurplusAfterBills,
    safetyReserveApplied: payablesReserve,
    pendingPayablesReserve: payablesReserve,
    operationalReserve,
    reinvestmentBase,
    confidenceFactor,
    capitalCompetitionAmount,
    estimatedOperationalProfitUsed,
    realProfitUsed,
    safeWithdrawalAmount,
    safeReinvestmentAmount,
    recommendedCapitalAction,
    deductions,
    warnings: Array.from(new Set(warnings)),
    confidence,
    profitBasis,
    cashAfterBills,
    profitAfterBills,
    withdrawalBase,
    exactValuesAllowed: confidence !== "low" && deductions.length > 0,
  }

  if (!audit.exactValuesAllowed && (safeWithdrawalAmount > 0 || safeReinvestmentAmount > 0)) {
    audit.warnings = Array.from(new Set([
      ...audit.warnings,
      "Valor seguro positivo sem confiança suficiente; respostas executivas devem ser qualitativas.",
    ]))
  }

  debugAudit(audit)
  return audit
}
