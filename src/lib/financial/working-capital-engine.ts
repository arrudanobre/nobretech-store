import { buildFinancialSafetyAudit, type FinancialSafetyAuditBreakdown } from "./financial-safety-audit"
import type { FinancialScenarioSnapshot } from "./financial-scenario-separation"

export type WorkingCapitalProtectionBasis =
  | "active_inventory"
  | "active_inventory_plus_reserves"
  | "insufficient_data"

export type WorkingCapitalInventoryItemInput = {
  id?: string | null
  status?: string | null
  cost?: number | string | null
  purchasePrice?: number | string | null
  supplierCost?: number | string | null
  quantity?: number | string | null
  costStructured?: boolean | null
}

export type WorkingCapitalProfitInput = {
  availableProfit?: number | string | null
} | null | undefined

export type WorkingCapitalEstimateInput = {
  amount?: number | string | null
  confidence?: number | string | null
  reason?: string | null
} | null | undefined

export type BuildWorkingCapitalSnapshotInput = {
  availableCash?: number | string | null
  reconciledCashBalance?: number | string | null
  activeInventoryItems?: WorkingCapitalInventoryItemInput[] | null
  financialScenarioSnapshot?: FinancialScenarioSnapshot | null
  realProfitSnapshot?: WorkingCapitalProfitInput
  estimatedOperationalProfit?: WorkingCapitalEstimateInput
  upcomingBills30d?: number | string | null
  pendingReceivables?: number | string | null
  pendingPayables?: number | string | null
  structuredOperationalReserves?: number | string | null
}

export type WorkingCapitalSnapshot = {
  availableCash: number
  activeInventoryCapital: number
  protectedOperationalCapital: number
  realAvailableProfit: number
  estimatedOperationalProfit: number
  upcomingBills30d: number
  operationalSurplusAfterBills: number
  safeWithdrawalAmount: number
  safeReinvestmentAmount: number
  capitalProtectionBasis: WorkingCapitalProtectionBasis
  warnings: string[]
  reasoning: string[]
  financialSafetyAudit: FinancialSafetyAuditBreakdown
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positive(value: unknown) {
  return Math.max(0, number(value))
}

function itemCost(item: WorkingCapitalInventoryItemInput) {
  return positive(item.cost ?? item.supplierCost ?? item.purchasePrice)
}

function itemQuantity(item: WorkingCapitalInventoryItemInput) {
  return Math.max(1, positive(item.quantity) || 1)
}

function hasStructuredCost(item: WorkingCapitalInventoryItemInput) {
  return item.costStructured !== false && itemCost(item) > 0
}

export function calculateActiveInventoryCapital(input: {
  items?: WorkingCapitalInventoryItemInput[] | null
}) {
  const warnings: string[] = []
  const reasoning: string[] = []
  const items = input.items || []
  const activeInventoryCapital = roundCurrency(items.reduce((sum, item) => {
    const cost = itemCost(item)
    if (!hasStructuredCost(item)) {
      warnings.push(`Item ${item.id || "sem id"} sem custo estruturado; custo tratado como 0 no capital operacional protegido.`)
      return sum
    }
    return sum + cost * itemQuantity(item)
  }, 0))

  reasoning.push(`Capital de estoque ativo calculado por custo estruturado x quantidade de ${items.length} item${items.length === 1 ? "" : "s"} operacionalmente ativo${items.length === 1 ? "" : "s"}.`)
  if (!items.length) reasoning.push("Sem estoque ativo informado para proteger capital operacional.")

  return {
    activeInventoryCapital,
    warnings,
    reasoning,
  }
}

export function calculateProtectedOperationalCapital(input: {
  activeInventoryCapital?: number | string | null
  structuredOperationalReserves?: number | string | null
}) {
  const activeInventoryCapital = positive(input.activeInventoryCapital)
  const reserves = positive(input.structuredOperationalReserves)
  const protectedOperationalCapital = roundCurrency(activeInventoryCapital + reserves)
  const capitalProtectionBasis: WorkingCapitalProtectionBasis = protectedOperationalCapital <= 0
    ? "insufficient_data"
    : reserves > 0
      ? "active_inventory_plus_reserves"
      : "active_inventory"

  return {
    protectedOperationalCapital,
    capitalProtectionBasis,
    reasoning: reserves > 0
      ? ["Capital protegido considera estoque ativo e reservas operacionais estruturadas."]
      : ["Capital protegido considera apenas estoque operacional ativo; não inclui CMV histórico nem compras antigas já realizadas."],
  }
}

function profitBasis(input: {
  realAvailableProfit?: number | string | null
  estimatedOperationalProfit?: WorkingCapitalEstimateInput
  warnings: string[]
  reasoning: string[]
}) {
  const realAvailableProfit = positive(input.realAvailableProfit)
  const estimatedOperationalProfit = positive(input.estimatedOperationalProfit?.amount)
  const confidence = number(input.estimatedOperationalProfit?.confidence)
  if (realAvailableProfit > 0) {
    input.reasoning.push("Lucro operacional rastreado usa lucro realizado quando disponível.")
    return {
      value: realAvailableProfit,
      source: "real" as const,
    }
  }
  if (estimatedOperationalProfit > 0) {
    input.warnings.push("Lucro operacional rastreado usa estimativa porque não há lucro realizado suficiente no contexto.")
    if (confidence > 0 && confidence < 0.45) {
      input.warnings.push("Confiança baixa na estimativa operacional; retirada segura foi reduzida de forma conservadora.")
    }
    input.reasoning.push(input.estimatedOperationalProfit?.reason || "Estimativa operacional usada apenas como fallback explícito.")
    return {
      value: estimatedOperationalProfit,
      source: "estimated" as const,
    }
  }
  input.warnings.push("Lucro operacional rastreado ausente; retirada segura não deve ser assumida.")
  return {
    value: 0,
    source: "none" as const,
  }
}

export function calculateOperationalSurplusAfterBills(input: {
  realAvailableProfit?: number | string | null
  estimatedOperationalProfit?: WorkingCapitalEstimateInput
  upcomingBills30d?: number | string | null
}) {
  const warnings: string[] = []
  const reasoning: string[] = []
  const basis = profitBasis({
    realAvailableProfit: input.realAvailableProfit,
    estimatedOperationalProfit: input.estimatedOperationalProfit,
    warnings,
    reasoning,
  })
  const upcomingBills30d = positive(input.upcomingBills30d)
  return {
    operationalSurplusAfterBills: roundCurrency(basis.value - upcomingBills30d),
    profitBasis: basis.value,
    profitBasisSource: basis.source,
    warnings,
    reasoning,
  }
}

export function calculateSafeWithdrawalAmount(input: {
  availableCash?: number | string | null
  realAvailableProfit?: number | string | null
  estimatedOperationalProfit?: WorkingCapitalEstimateInput
  upcomingBills30d?: number | string | null
  pendingPayables?: number | string | null
}) {
  const warnings: string[] = []
  const reasoning: string[] = []
  const availableCash = positive(input.availableCash)
  const upcomingBills30d = positive(input.upcomingBills30d)
  const pendingPayables = positive(input.pendingPayables)
  const basis = profitBasis({
    realAvailableProfit: input.realAvailableProfit,
    estimatedOperationalProfit: input.estimatedOperationalProfit,
    warnings,
    reasoning,
  })
  const cashAfterBills = Math.max(0, availableCash - upcomingBills30d)
  const profitAfterBills = Math.max(0, basis.value - upcomingBills30d)
  let safeWithdrawalAmount = Math.min(availableCash, basis.value, cashAfterBills, profitAfterBills)

  if (pendingPayables > 0) {
    safeWithdrawalAmount = Math.min(safeWithdrawalAmount, Math.max(0, safeWithdrawalAmount - Math.min(safeWithdrawalAmount, pendingPayables * 0.25)))
    reasoning.push("Pagáveis pendentes reduzem retirada segura de forma conservadora.")
  }
  if (basis.source === "estimated" && number(input.estimatedOperationalProfit?.confidence) < 0.75) {
    safeWithdrawalAmount *= 0.5
    reasoning.push("Estimativa operacional com confiança não alta reduz retirada segura pela metade.")
  }
  if (safeWithdrawalAmount <= 0) {
    warnings.push("Retirada segura indisponível depois de considerar caixa, lucro operacional e contas próximas.")
  }

  return {
    safeWithdrawalAmount: roundCurrency(Math.max(0, safeWithdrawalAmount)),
    warnings,
    reasoning,
  }
}

export function buildWorkingCapitalSnapshot(input: BuildWorkingCapitalSnapshotInput): WorkingCapitalSnapshot {
  const warnings: string[] = []
  const reasoning: string[] = []
  const availableCash = roundCurrency(positive(input.availableCash ?? input.reconciledCashBalance))
  const upcomingBills30d = roundCurrency(positive(input.upcomingBills30d))
  const realAvailableProfit = roundCurrency(positive(input.financialScenarioSnapshot?.realizedProfit ?? input.realProfitSnapshot?.availableProfit))
  const estimatedOperationalProfit = roundCurrency(positive(input.estimatedOperationalProfit?.amount))

  const inventory = calculateActiveInventoryCapital({ items: input.activeInventoryItems })
  warnings.push(...inventory.warnings)
  reasoning.push(...inventory.reasoning)

  const protectedCapital = calculateProtectedOperationalCapital({
    activeInventoryCapital: inventory.activeInventoryCapital,
    structuredOperationalReserves: input.structuredOperationalReserves,
  })
  reasoning.push(...protectedCapital.reasoning)

  if (inventory.activeInventoryCapital > availableCash) {
    reasoning.push("Capital de estoque ativo maior que caixa disponível indica capital imobilizado em estoque vivo, não dívida ou erro de saldo.")
  }

  const surplus = calculateOperationalSurplusAfterBills({
    realAvailableProfit,
    estimatedOperationalProfit: input.estimatedOperationalProfit,
    upcomingBills30d,
  })
  warnings.push(...surplus.warnings)
  reasoning.push(...surplus.reasoning)
  const operationalSurplusAfterBills = input.financialScenarioSnapshot
    ? input.financialScenarioSnapshot.realizedProfitAfterBills
    : surplus.operationalSurplusAfterBills

  const withdrawal = calculateSafeWithdrawalAmount({
    availableCash,
    realAvailableProfit,
    estimatedOperationalProfit: input.estimatedOperationalProfit,
    upcomingBills30d,
    pendingPayables: input.pendingPayables,
  })
  warnings.push(...withdrawal.warnings)
  reasoning.push(...withdrawal.reasoning)

  const financialSafetyAudit = buildFinancialSafetyAudit({
    availableLiquidity: availableCash,
    activeInventoryCapital: inventory.activeInventoryCapital,
    protectedOperationalCapital: protectedCapital.protectedOperationalCapital,
    pendingPayables: input.pendingPayables,
    pendingReceivables: input.pendingReceivables,
    upcomingBills30d,
    structuredOperationalReserves: input.structuredOperationalReserves,
    estimatedOperationalProfit: input.estimatedOperationalProfit,
    realAvailableProfit,
    safeWithdrawalAmount: withdrawal.safeWithdrawalAmount,
    operationalSurplusAfterBills,
  })
  const safeReinvestmentAmount = financialSafetyAudit.safeReinvestmentAmount
  if (safeReinvestmentAmount <= 0) {
    warnings.push("Reinvestimento seguro indisponível ou muito limitado após proteger contas próximas.")
  }
  if (financialSafetyAudit.capitalCompetitionAmount > 0) {
    reasoning.push("Retirada segura e reinvestimento seguro usam o mesmo capital disponível; trate como alternativas, não como soma livre.")
  }
  warnings.push(...financialSafetyAudit.warnings)
  reasoning.push(`Auditoria financeira: confiança ${financialSafetyAudit.confidence}; ${financialSafetyAudit.deductions.length} dedução${financialSafetyAudit.deductions.length === 1 ? "" : "es"} rastreada${financialSafetyAudit.deductions.length === 1 ? "" : "s"}.`)

  return {
    availableCash,
    activeInventoryCapital: inventory.activeInventoryCapital,
    protectedOperationalCapital: protectedCapital.protectedOperationalCapital,
    realAvailableProfit,
    estimatedOperationalProfit,
    upcomingBills30d,
    operationalSurplusAfterBills,
    safeWithdrawalAmount: withdrawal.safeWithdrawalAmount,
    safeReinvestmentAmount,
    capitalProtectionBasis: protectedCapital.capitalProtectionBasis,
    warnings: Array.from(new Set(warnings)),
    reasoning: Array.from(new Set(reasoning)),
    financialSafetyAudit,
  }
}
