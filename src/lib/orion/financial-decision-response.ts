import type { FinancialSafetyAuditBreakdown } from "@/lib/financial/financial-safety-audit"
import { normalizeExecutiveTone } from "./executive-tone"
import type { OrionFinancialOperationalContext } from "./financial-context-consumer"
import type { OrionOperationalGoal, OrionReasoningMode } from "./types"

export type OrionFinancialDecisionResponse = {
  answerType:
    | "safe_withdrawal"
    | "reinvestment"
    | "cash_health"
    | "working_capital"
    | "financial_risk"
    | "liquidity_warning"
  executiveSummary: string
  operationalReasoning: string[]
  risks: string[]
  recommendations: string[]
  confidence: "low" | "medium" | "high"
  safeWithdrawalAmount?: number
  safeReinvestmentAmount?: number
}

export type BuildFinancialDecisionResponseInput = {
  reasoningMode?: OrionReasoningMode | null
  goal?: OrionOperationalGoal | null
  financialContext: OrionFinancialOperationalContext
  financialSafetyAudit?: FinancialSafetyAuditBreakdown | null
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value)
}

function brlExact(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function dateLabel(value: string) {
  const parts = value.slice(0, 10).split("-")
  if (parts.length !== 3) return value
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function questionTokens(question: string) {
  const normalized = question.toLowerCase().normalize("NFD")
  const chars = Array.from(normalized).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= 768 && code <= 879) return ""
    if (char >= "a" && char <= "z") return char
    if (char >= "0" && char <= "9") return char
    return " "
  })
  return new Set(chars.join("").split(" ").filter(Boolean))
}

function hasAny(tokens: Set<string>, values: string[]) {
  return values.some((value) => tokens.has(value))
}

export type OwnerMovementListKind =
  | "profit_withdrawals"
  | "capital_returns"
  | "contributions"
  | "ambiguous"
  | "owner_movements"
  | null

export function selectOwnerMovementListKind(question: string): OwnerMovementListKind {
  const tokens = questionTokens(question)
  const wantsList = hasAny(tokens, ["mostre", "mostrar", "liste", "listar", "detalhe", "detalhar", "quais", "saques", "movimentos"])
  if (!wantsList) return null
  if (hasAny(tokens, ["ambiguo", "ambiguos", "revisao"])) return "ambiguous"
  if (hasAny(tokens, ["aporte", "aportes", "contribuicao", "contribuicoes"]) && !hasAny(tokens, ["devolucao", "devolucoes", "reembolso", "reembolsos", "retorno"])) return "contributions"
  if (hasAny(tokens, ["devolucao", "devolucoes", "reembolso", "reembolsos", "retorno"])) return "capital_returns"
  if (hasAny(tokens, ["retirada", "retiradas", "saque", "saques", "lucro"])) return "profit_withdrawals"
  if (hasAny(tokens, ["dono", "proprietario", "owner"])) return "owner_movements"
  return null
}

function movementLines(movements: Array<{
  date: string
  description: string
  accountName: string
  paymentMethod?: string
  amount: number
}>) {
  return movements.map((movement, index) => [
    `${index + 1}. ${dateLabel(movement.date)} — ${movement.description}`,
    `Conta: ${movement.accountName}`,
    movement.paymentMethod ? `Pagamento: ${movement.paymentMethod}` : null,
    `Valor: ${brlExact(movement.amount)}`,
  ].filter(Boolean).join("\n")).join("\n")
}

export function buildOwnerMovementListResponse(
  financialContext: OrionFinancialOperationalContext,
  question: string
): string | null {
  const kind = selectOwnerMovementListKind(question)
  if (!kind) return null
  const profitAvailability = financialContext.profitAvailabilitySnapshot
  if (!profitAvailability) return "Não encontrei snapshot financeiro do período selecionado para listar movimentos do proprietário."

  if (kind === "profit_withdrawals") {
    const movements = profitAvailability.ownerProfitWithdrawalMovements
    if (!movements.length) return "Não encontrei retiradas de lucro no período selecionado."
    return [
      "Retiradas de lucro no período selecionado:",
      movementLines(movements),
      `Total: ${brlExact(profitAvailability.ownerProfitWithdrawalsInPeriod)}`,
      "Observação: devoluções de aporte não entram nesse total.",
    ].join("\n")
  }

  if (kind === "capital_returns") {
    const movements = profitAvailability.ownerCapitalReturnMovements
    if (!movements.length) return "Não encontrei devoluções de aporte no período selecionado."
    const lines = movements.map((movement, index) => [
      `${index + 1}. ${dateLabel(movement.date)} — ${movement.description}`,
      `Conta: ${movement.accountName}`,
      movement.paymentMethod ? `Pagamento: ${movement.paymentMethod}` : null,
      `Valor: ${brlExact(movement.amount)}`,
      `Com lastro rastreado: ${brlExact(movement.tracedAmount)}`,
      movement.untracedAmount > 0 ? `Sem lastro rastreado: ${brlExact(movement.untracedAmount)}` : null,
    ].filter(Boolean).join("\n")).join("\n")
    return [
      "Devoluções de aporte no período selecionado:",
      lines,
      `Total com lastro rastreado: ${brlExact(profitAvailability.ownerCapitalReturnsInPeriod)}`,
      `Total sem lastro rastreado: ${brlExact(profitAvailability.untracedOwnerCapitalReturnsInPeriod)}`,
    ].join("\n")
  }

  if (kind === "contributions") {
    const movements = profitAvailability.ownerContributionMovements
    if (!movements.length) return "Não encontrei aportes do proprietário no período selecionado."
    return [
      "Aportes do proprietário no período selecionado:",
      movementLines(movements),
      `Total: ${brlExact(profitAvailability.ownerContributionsInPeriod)}`,
      "Observação: aporte aumenta capital/caixa, mas não é receita operacional.",
    ].join("\n")
  }

  if (kind === "ambiguous") {
    const movements = profitAvailability.ambiguousOwnerMovements
    if (!movements.length) return "Não encontrei movimentos ambíguos do proprietário no período selecionado."
    const lines = movements.map((movement, index) => [
      `${index + 1}. ${dateLabel(movement.date)} — ${movement.description}`,
      `Conta: ${movement.accountName}`,
      movement.paymentMethod ? `Pagamento: ${movement.paymentMethod}` : null,
      `Valor: ${brlExact(movement.amount)}`,
      `Motivo: ${movement.reason}`,
    ].filter(Boolean).join("\n")).join("\n")
    return [
      "Movimentos ambíguos que precisam revisão:",
      lines,
    ].join("\n")
  }

  return [
    buildOwnerMovementListResponse(financialContext, "listar retiradas de lucro"),
    "",
    buildOwnerMovementListResponse(financialContext, "listar devolucoes de aporte"),
    "",
    buildOwnerMovementListResponse(financialContext, "listar aportes"),
  ].filter(Boolean).join("\n")
}

function answerTypeFrom(mode?: OrionReasoningMode | null): OrionFinancialDecisionResponse["answerType"] {
  if (mode === "withdrawal_safety") return "safe_withdrawal"
  if (mode === "reinvestment_decision") return "reinvestment"
  if (mode === "working_capital_analysis") return "working_capital"
  if (mode === "financial_health_analysis") return "cash_health"
  return "financial_risk"
}

function deductionSummary(audit: FinancialSafetyAuditBreakdown | null) {
  if (!audit) return "Auditoria financeira indisponível; decisão deve ficar conservadora."
  const relevant = audit.deductions
    .filter((deduction) => deduction.amount > 0)
    .slice(0, 3)
    .map((deduction) => `${deduction.label}: ${brl(deduction.amount)}`)
  const basis = audit.profitBasis.source === "real_profit"
    ? `profitBasis veio de lucro real rastreado (${brl(audit.profitBasis.amount)}).`
    : audit.profitBasis.source === "estimated_operational_profit"
      ? `profitBasis veio de estimativa operacional (${brl(audit.profitBasis.amount)}).`
      : "profitBasis não está disponível."
  const deductions = relevant.length ? ` Limites: ${relevant.join("; ")}.` : ""
  const competition = audit.capitalCompetitionAmount > 0
    ? " Retirada e reinvestimento competem pelo mesmo capital."
    : ""
  return `${basis}${deductions}${competition}`
}

export function buildFinancialDecisionResponse(input: BuildFinancialDecisionResponseInput): OrionFinancialDecisionResponse {
  const audit = input.financialSafetyAudit || input.financialContext.financialSafetyAudit || null
  const answerType = answerTypeFrom(input.reasoningMode)
  const confidence = audit?.confidence || "low"
  const requestedAmount = input.goal?.targetProfit || null
  const profitAvailability = input.financialContext.profitAvailabilitySnapshot || null
  const cashComposition = input.financialContext.currentCashCompositionSnapshot || null
  const exactValuesAllowed = Boolean(
    audit?.exactValuesAllowed
    && confidence !== "low"
    && !(profitAvailability?.partiallyTracedSales.length)
    && cashComposition?.compositionConfidence !== "low"
  )
  const safeWithdrawal = cashComposition?.availableForWithdrawal ?? profitAvailability?.withdrawableProfitToday ?? audit?.safeWithdrawalAmount ?? input.financialContext.safeWithdrawalAmount ?? 0
  const safeReinvestment = cashComposition?.availableForReinvestment ?? profitAvailability?.safeReinvestmentAmount ?? audit?.safeReinvestmentAmount ?? input.financialContext.safeReinvestmentAmount ?? 0
  const operationalReasoning = [
    input.financialContext.operationalSummary,
    profitAvailability
      ? `Período analisado: ${profitAvailability.period.label}. Lucro realizado: ${brl(profitAvailability.realizedProfitInPeriod)}; retiradas de lucro: ${brl(profitAvailability.ownerProfitWithdrawalsInPeriod)}; devoluções de aporte: ${brl(profitAvailability.ownerCapitalReturnsInPeriod)}; devoluções sem lastro: ${brl(profitAvailability.untracedOwnerCapitalReturnsInPeriod)}; lucro após retiradas: ${brl(profitAvailability.profitAfterWithdrawals)}.`
      : "",
    cashComposition
      ? `Caixa consolidado: ${brl(cashComposition.consolidatedCash)}; disponível para retirada: ${brl(cashComposition.availableForWithdrawal)}; disponível para reinvestimento: ${brl(cashComposition.availableForReinvestment)}.`
      : "",
    deductionSummary(audit),
  ].filter(Boolean)
  const risks = audit?.warnings.length
    ? audit.warnings.slice(0, 3)
    : input.financialContext.financialWarnings.slice(0, 3)

  if (answerType === "safe_withdrawal") {
    const requestedIsSafe = requestedAmount !== null && safeWithdrawal >= requestedAmount
    const executiveSummary = exactValuesAllowed
      ? requestedAmount !== null
        ? requestedIsSafe
          ? `A retirada de ${brl(requestedAmount)} cabe no limite auditado de ${brl(safeWithdrawal)}.`
          : `A retirada de ${brl(requestedAmount)} passa do limite auditado de ${brl(safeWithdrawal)}.`
        : `Retirada segura auditada: ${brl(safeWithdrawal)}.`
      : "Retirada segura: margem baixa ou sem confiança suficiente para valor exato."
    return {
      answerType,
      executiveSummary,
      operationalReasoning,
      risks,
      recommendations: [
        requestedAmount !== null && !requestedIsSafe
          ? "Reduza a retirada ou aguarde nova entrada reconciliada antes de sacar."
          : "Preserve contas próximas, recomposição e capital protegido antes de retirada adicional.",
      ],
      confidence,
      safeWithdrawalAmount: exactValuesAllowed ? safeWithdrawal : undefined,
      safeReinvestmentAmount: exactValuesAllowed ? safeReinvestment : undefined,
    }
  }

  if (answerType === "reinvestment" || answerType === "working_capital") {
    return {
      answerType,
      executiveSummary: exactValuesAllowed
        ? `Reinvestimento seguro auditado: ${brl(safeReinvestment)}.`
        : audit?.recommendedCapitalAction === "small_reinvestment"
          ? "A margem segura para reinvestimento é pequena; trate como compra controlada, não como capital livre amplo."
          : "A margem segura para reinvestimento ainda está baixa ou sem confiança suficiente para valor exato.",
      operationalReasoning,
      risks,
      recommendations: [
        safeReinvestment > 0 && exactValuesAllowed
          ? "Reinvista apenas dentro do limite auditado e preserve caixa para obrigações próximas."
          : "Mantenha liquidez e revise capital protegido antes de nova compra.",
      ],
      confidence,
      safeWithdrawalAmount: exactValuesAllowed ? safeWithdrawal : undefined,
      safeReinvestmentAmount: exactValuesAllowed ? safeReinvestment : undefined,
    }
  }

  return {
    answerType,
    executiveSummary: input.financialContext.operationalSummary,
    operationalReasoning,
    risks,
    recommendations: ["Use a auditoria financeira antes de transformar caixa em retirada ou recompra."],
    confidence,
    safeWithdrawalAmount: exactValuesAllowed ? safeWithdrawal : undefined,
    safeReinvestmentAmount: exactValuesAllowed ? safeReinvestment : undefined,
  }
}

export function formatFinancialDecisionResponse(response: OrionFinancialDecisionResponse) {
  return normalizeExecutiveTone([
    "Leitura:",
    response.executiveSummary,
    "",
    "Decisão:",
    response.recommendations[0] || "Mantenha decisão conservadora até nova conciliação.",
    "",
    "Motivo:",
    response.operationalReasoning.slice(0, 2).join(" "),
    "",
    "Risco:",
    response.risks[0] || "Sem alerta financeiro adicional no contexto auditado.",
  ].join("\n"))
}
