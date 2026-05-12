import type { FinancialSafetyAuditBreakdown } from "@/lib/financial/financial-safety-audit"
import { renderExecutiveResponseFallback, type OrionExecutiveDecisionContext } from "./executive-response-layer"
import { normalizeExecutiveTone } from "./executive-tone"
import { selectFinancialTraceabilityKind } from "./financial-traceability-router"
import type { ReinvestmentDecision } from "./reinvestment-intelligence-engine"
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
  executiveContext?: OrionExecutiveDecisionContext
}

export type BuildFinancialDecisionResponseInput = {
  reasoningMode?: OrionReasoningMode | null
  goal?: OrionOperationalGoal | null
  userQuestion?: string | null
  financialContext: OrionFinancialOperationalContext
  financialSafetyAudit?: FinancialSafetyAuditBreakdown | null
  reinvestmentDecision?: ReinvestmentDecision | null
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

export type OwnerMovementListKind =
  | "profit_withdrawals"
  | "capital_returns"
  | "contributions"
  | "ambiguous"
  | "owner_movements"
  | null

export function selectOwnerMovementListKind(question: string): OwnerMovementListKind {
  const kind = selectFinancialTraceabilityKind(question)
  return kind === "profit_withdrawals"
    || kind === "capital_returns"
    || kind === "contributions"
    || kind === "ambiguous"
    || kind === "owner_movements"
    ? kind
    : null
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

function compactMovementBreakdown(financialContext: OrionFinancialOperationalContext) {
  const profitAvailability = financialContext.profitAvailabilitySnapshot
  const cashComposition = financialContext.currentCashCompositionSnapshot
  if (!profitAvailability || !cashComposition) return null
  const movement = profitAvailability.movementBreakdown
  return [
    "Entradas no período:",
    `- Lucro de vendas conciliadas: ${brlExact(movement.salesProfit)}`,
    `- Aportes do proprietário: ${brlExact(movement.ownerContributions)}`,
    `- Recebíveis conciliados: ${brlExact(movement.receivables)}`,
    "",
    "Saídas no período:",
    `- Compras de estoque: ${brlExact(movement.inventoryPurchases)}`,
    `- Despesas operacionais: ${brlExact(movement.operatingExpenses)}`,
    `- Retiradas de lucro: ${brlExact(movement.ownerProfitWithdrawals)}`,
    `- Devoluções de aporte: ${brlExact(movement.ownerCapitalReturns)}`,
    movement.untracedOwnerCapitalReturns > 0
      ? `- Devoluções de aporte sem lastro rastreado: ${brlExact(movement.untracedOwnerCapitalReturns)}`
      : null,
    "",
    `Caixa atual consolidado: ${brlExact(cashComposition.consolidatedCash)}`,
    "Observação: conta bancária mostra onde está o dinheiro; a composição financeira mostra o que ele representa.",
  ].filter(Boolean).join("\n")
}

function realizedProfitBreakdown(financialContext: OrionFinancialOperationalContext) {
  const profitAvailability = financialContext.profitAvailabilitySnapshot
  if (!profitAvailability) return null
  const availableAfterBills = Math.max(0, profitAvailability.profitAfterWithdrawals - profitAvailability.upcomingBills)
  return [
    "Composição do lucro realizado no período:",
    `Lucro realizado: ${brlExact(profitAvailability.realizedProfitInPeriod)}`,
    `Retiradas de lucro: ${brlExact(profitAvailability.ownerProfitWithdrawalsInPeriod)}`,
    `Lucro após retiradas: ${brlExact(profitAvailability.profitAfterWithdrawals)}`,
    `Contas próximas: ${brlExact(profitAvailability.upcomingBills)}`,
    `Lucro disponível após contas: ${brlExact(availableAfterBills)}`,
    profitAvailability.partiallyTracedSales.length
      ? `Observação: ${profitAvailability.partiallyTracedSales.length} venda(s) têm rastreabilidade parcial; trate a leitura com confiança reduzida.`
      : "Observação: lucro potencial de estoque não entra neste valor.",
  ].join("\n")
}

function smallSampleCount(decision: ReinvestmentDecision) {
  return decision.recommendedProducts.filter((product) => product.sampleWarning === "small_sample" || product.sampleSize <= 1).length
}

export function buildReinvestmentAuditBreakdown(decision: ReinvestmentDecision): string {
  const receivablesBlock = decision.receivablesDetailAvailable
    ? [
        `- Recebíveis até 3 dias: ${brlExact(decision.nearTermReceivables)}`,
        `- Recebíveis até 7 dias: ${brlExact(decision.shortTermReceivables)}`,
        `- Recebíveis após 7 dias: ${brlExact(decision.futureReceivables)}`,
      ]
    : [`- Recebíveis agregados (sem vencimento detalhado): ${brlExact(decision.undatedReceivables)}`]
  const products = decision.recommendedProducts.length
    ? decision.recommendedProducts.map((product) => {
        const sampleNote = product.sampleWarning === "small_sample" || product.sampleSize <= 1
          ? " (amostra pequena)"
          : ""
        return `- ${product.label}${sampleNote}: ${product.reason}`
      })
    : ["- Sem produto recomendado dentro do teto seguro no snapshot atual."]
  const avoid = decision.avoid.length
    ? decision.avoid.map((item) => `- ${item.label}: ${item.reason}`)
    : ["- Sem item específico a evitar no snapshot atual."]
  const leadNote = decision.leadContext.note

  const caixa = [
    "Caixa e recebíveis:",
    `- Caixa atual: ${brlExact(decision.currentCash)}`,
    ...receivablesBlock,
  ].join("\n")

  const obrigacoes = [
    "Reserva e obrigações:",
    `- Reserva mínima operacional: ${brlExact(decision.operationalReserve)}`,
    `- Contas próximas (7 dias): ${brlExact(decision.upcomingPayables)}`,
  ].join("\n")

  const recompra = [
    "Recompra:",
    `- Teto teórico (caixa após reserva): ${brlExact(decision.theoreticalCap)}`,
    `- Teto após contas: ${brlExact(decision.capAfterPayables)}`,
    `- Recompra recomendada agora: ${brlExact(decision.recommendedReinvestmentAmount)}`,
  ].join("\n")

  const baseWindow = decision.analysisWindow || {
    label: "Base não informada",
    startDate: null,
    endDate: null,
    salesCount: 0,
    source: "unknown" as const,
  }
  const smallSamples = smallSampleCount(decision)
  const baseLines = [
    "Base analisada:",
    `- Período: ${baseWindow.label}${baseWindow.startDate && baseWindow.endDate ? ` (${baseWindow.startDate} a ${baseWindow.endDate})` : ""}`,
    `- Vendas analisadas: ${baseWindow.salesCount}`,
    smallSamples > 0 ? `- Aviso: ${smallSamples} candidato(s) com amostra pequena` : null,
  ].filter(Boolean) as string[]
  const base = baseLines.join("\n")

  const produtos = ["Produtos/categorias recomendados:", ...products].join("\n")
  const evitar = ["Itens a evitar:", ...avoid].join("\n")
  const leads = `Observação sobre leads: ${leadNote}`

  return [
    "Cálculo da recompra (Reinvestment Intelligence):",
    base,
    caixa,
    obrigacoes,
    recompra,
    produtos,
    evitar,
    leads,
  ].join("\n\n")
}

export function buildFinancialTraceabilityResponse(
  financialContext: OrionFinancialOperationalContext,
  question: string,
  reinvestmentDecision?: ReinvestmentDecision | null
): string | null {
  const kind = selectFinancialTraceabilityKind(question)
  if (!kind) return null
  if (kind === "reinvestment_audit") {
    if (reinvestmentDecision) return buildReinvestmentAuditBreakdown(reinvestmentDecision)
    return null
  }
  const ownerList = buildOwnerMovementListResponse(financialContext, question)
  if (ownerList) return ownerList
  if (kind === "cash_origin") return compactMovementBreakdown(financialContext)
  if (kind === "realized_profit" || kind === "generic") return realizedProfitBreakdown(financialContext)
  return null
}

function answerTypeFrom(mode?: OrionReasoningMode | null): OrionFinancialDecisionResponse["answerType"] {
  if (mode === "financial_traceability") return "cash_health"
  if (mode === "withdrawal_safety") return "safe_withdrawal"
  if (mode === "reinvestment_decision") return "reinvestment"
  if (mode === "working_capital_analysis") return "working_capital"
  if (mode === "financial_health_analysis") return "cash_health"
  return "financial_risk"
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positive(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function withdrawalBlocker(input: {
  availableAfterBills: number
  profitAfterWithdrawals: number
  upcomingBills: number
  cashAvailable: number
  audit: FinancialSafetyAuditBreakdown | null
}) {
  if (input.availableAfterBills <= 0) {
    return {
      blocked: true,
      reason: input.profitAfterWithdrawals <= 0
        ? "Lucro após retiradas está zerado ou negativo."
        : "Contas próximas consomem o lucro disponível do período.",
    }
  }
  if (input.cashAvailable - input.upcomingBills <= 0) {
    return {
      blocked: true,
      reason: "Caixa disponível após contas próximas é insuficiente.",
    }
  }
  if (input.audit && input.audit.cashAfterBills <= 0 && input.cashAvailable - input.upcomingBills <= 0) {
    return {
      blocked: true,
      reason: "Auditoria indica caixa após contas zerado ou negativo.",
    }
  }
  if (input.audit && input.audit.profitAfterBills <= 0 && input.availableAfterBills <= 0) {
    return {
      blocked: true,
      reason: "Auditoria indica lucro após contas zerado ou negativo.",
    }
  }
  if (input.audit && input.audit.withdrawalBase <= 0 && input.availableAfterBills <= 0 && (input.audit.availableLiquidity <= 0 || input.audit.profitBasis.amount <= 0)) {
    return {
      blocked: true,
      reason: "Auditoria não encontrou base de caixa ou lucro para retirada.",
    }
  }
  return {
    blocked: false,
    reason: "Sem blocker auditável real para zerar a retirada.",
  }
}

function withdrawalBreakdown(input: {
  financialContext: OrionFinancialOperationalContext
  audit: FinancialSafetyAuditBreakdown | null
}) {
  const profitAvailability = input.financialContext.profitAvailabilitySnapshot || null
  const cashComposition = input.financialContext.currentCashCompositionSnapshot || null
  const profitAfterWithdrawals = positive(profitAvailability?.profitAfterWithdrawals)
  const upcomingBills = positive(profitAvailability?.upcomingBills)
  const availableAfterBills = roundCurrency(Math.max(0, profitAfterWithdrawals - upcomingBills))
  const withdrawableProfitToday = positive(profitAvailability?.withdrawableProfitToday)
  const availableForWithdrawal = positive(cashComposition?.availableForWithdrawal)
  const workingCapitalSafeWithdrawal = positive(input.audit?.safeWithdrawalAmount ?? input.financialContext.safeWithdrawalAmount)
  const cashAvailable = positive(cashComposition?.consolidatedCash ?? input.financialContext.availableLiquidity)
  const blocker = withdrawalBlocker({
    availableAfterBills,
    profitAfterWithdrawals,
    upcomingBills,
    cashAvailable,
    audit: input.audit,
  })
  const lowerCaps = [
    { label: "withdrawableProfitToday", value: withdrawableProfitToday },
    { label: "currentCashComposition.availableForWithdrawal", value: availableForWithdrawal },
    { label: "workingCapitalSnapshot.safeWithdrawalAmount", value: workingCapitalSafeWithdrawal },
  ].filter((item) => availableAfterBills > 0 && item.value < availableAfterBills)
  const restrictiveLimit = lowerCaps.length
    ? Math.min(...lowerCaps.map((item) => item.value))
    : availableAfterBills
  const prudentLimit = roundCurrency(availableAfterBills > 0 && lowerCaps.length && !blocker.blocked
    ? availableAfterBills
    : Math.min(availableAfterBills, restrictiveLimit))
  const divergence = lowerCaps.length
    ? lowerCaps.map((item) => `${item.label}: ${brlExact(item.value)}`).join("; ")
    : ""
  const divergenceExplanation = lowerCaps.length
    ? blocker.blocked
      ? `Há limite mais baixo auditado (${divergence}). ${blocker.reason}`
      : `Há divergência: ${divergence}. ${blocker.reason} Uso o lucro após contas como referência prudente e marco a leitura para auditoria.`
    : "Sem divergência relevante entre os limites financeiros."

  return {
    profitAvailability,
    cashComposition,
    profitAfterWithdrawals,
    upcomingBills,
    availableAfterBills,
    withdrawableProfitToday,
    availableForWithdrawal,
    workingCapitalSafeWithdrawal,
    prudentLimit,
    divergenceExplanation,
    auditableBlocker: blocker.blocked,
  }
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

function blockedFinancialGuardrails(): OrionExecutiveDecisionContext["guardrails"] {
  return {
    allowCampaignGeneration: false,
    allowTrafficRecommendation: false,
    allowProductMixGeneration: false,
    allowCopyGeneration: false,
    allowFinancialCalculation: false,
  }
}

function financialDecisionContext(input: {
  question: string
  decision: "allowed" | "not_recommended" | "partial" | "informational" | "needs_review"
  confidence: "low" | "medium" | "high"
  primaryLabel: string
  primaryValue: number
  primaryFormatted: string
  supportingNumbers: NonNullable<OrionExecutiveDecisionContext["baseDecision"]>["supportingNumbers"]
  reasoning: string[]
  risks: string[]
  recommendedAction: string
  mode?: OrionExecutiveDecisionContext["mode"]
  reinvestmentDecision?: ReinvestmentDecision
}): OrionExecutiveDecisionContext {
  return {
    mode: input.mode ?? "financial_decision",
    userQuestion: input.question,
    baseDecision: {
      decision: input.decision,
      confidence: input.confidence,
      primaryNumber: {
        label: input.primaryLabel,
        value: input.primaryValue,
        formatted: input.primaryFormatted,
      },
      supportingNumbers: input.supportingNumbers,
      reasoning: input.reasoning,
      risks: input.risks,
      recommendedAction: input.recommendedAction,
    },
    guardrails: blockedFinancialGuardrails(),
    businessPersonalityProfile: {
      tone: "executive",
      riskPosture: "balanced",
    },
    dataQuality: {
      confidence: input.confidence,
      warnings: input.risks,
    },
    reinvestmentDecision: input.reinvestmentDecision,
  }
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
  const safeReinvestment = cashComposition?.availableForReinvestment ?? profitAvailability?.safeReinvestmentAmount ?? audit?.safeReinvestmentAmount ?? input.financialContext.safeReinvestmentAmount ?? 0
  const pendingReceivables = positive(input.financialContext.pendingBalance)
  const withdrawal = withdrawalBreakdown({ financialContext: input.financialContext, audit })
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
    const requestedIsSafe = requestedAmount !== null && withdrawal.prudentLimit >= requestedAmount
    const executiveSummary = requestedAmount !== null
      ? requestedIsSafe
        ? `A retirada de ${brlExact(requestedAmount)} cabe no limite prudente de ${brlExact(withdrawal.prudentLimit)} pelo lucro do período após contas.`
        : `Eu não recomendo sacar ${brlExact(requestedAmount)} como retirada de lucro hoje. O limite prudente está em ${brlExact(withdrawal.prudentLimit)} pelo lucro do período após contas.`
      : `Limite prudente de retirada pelo lucro do período após contas: ${brlExact(withdrawal.prudentLimit)}.`
    const recommendedAction = requestedAmount !== null && !requestedIsSafe
      ? `Não sacar ${brlExact(requestedAmount)} agora; use ${brlExact(withdrawal.prudentLimit)} como referência prudente de retirada pelo lucro do período.`
      : requestedAmount !== null
        ? `Sacar ${brlExact(requestedAmount)} cabe como retirada de lucro do período; mantenha o restante como capital operacional.`
        : "Preserve contas próximas, recomposição e capital protegido antes de retirada adicional."
    const executiveContext = financialDecisionContext({
      question: input.userQuestion || input.goal?.reason || "",
      decision: requestedAmount !== null
        ? requestedIsSafe ? "allowed" : "not_recommended"
        : withdrawal.prudentLimit > 0 ? "partial" : "needs_review",
      confidence,
      primaryLabel: "limite prudente",
      primaryValue: withdrawal.prudentLimit,
      primaryFormatted: brlExact(withdrawal.prudentLimit),
      supportingNumbers: [
        withdrawal.profitAvailability ? {
          label: "lucro realizado",
          value: withdrawal.profitAvailability.realizedProfitInPeriod,
          formatted: brlExact(withdrawal.profitAvailability.realizedProfitInPeriod),
          meaning: "lucro das vendas conciliadas no período",
        } : null,
        withdrawal.profitAvailability ? {
          label: "retiradas de lucro",
          value: withdrawal.profitAvailability.ownerProfitWithdrawalsInPeriod,
          formatted: brlExact(withdrawal.profitAvailability.ownerProfitWithdrawalsInPeriod),
          meaning: "retiradas que reduzem o lucro disponível",
        } : null,
        {
          label: "lucro após retiradas",
          value: withdrawal.profitAfterWithdrawals,
          formatted: brlExact(withdrawal.profitAfterWithdrawals),
          meaning: "lucro do período depois das retiradas",
        },
        {
          label: "contas próximas",
          value: withdrawal.upcomingBills,
          formatted: brlExact(withdrawal.upcomingBills),
          meaning: "obrigações previstas",
        },
        {
          label: "lucro após contas",
          value: withdrawal.availableAfterBills,
          formatted: brlExact(withdrawal.availableAfterBills),
          meaning: "base prudente para retirada de lucro",
        },
        requestedAmount !== null ? {
          label: "valor solicitado",
          value: requestedAmount,
          formatted: brlExact(requestedAmount),
          meaning: "retirada desejada",
        } : null,
      ].filter(Boolean) as NonNullable<OrionExecutiveDecisionContext["baseDecision"]>["supportingNumbers"],
      reasoning: [
        withdrawal.profitAvailability
          ? `Lucro realizado: ${brlExact(withdrawal.profitAvailability.realizedProfitInPeriod)}; retiradas de lucro: ${brlExact(withdrawal.profitAvailability.ownerProfitWithdrawalsInPeriod)}; lucro após retiradas: ${brlExact(withdrawal.profitAfterWithdrawals)}; contas próximas: ${brlExact(withdrawal.upcomingBills)}; lucro após contas: ${brlExact(withdrawal.availableAfterBills)}.`
          : "Snapshot de lucro do período indisponível.",
        withdrawal.divergenceExplanation,
      ],
      risks,
      recommendedAction,
    })
    return {
      answerType,
      executiveSummary,
      operationalReasoning: [
        withdrawal.profitAvailability
          ? `Lucro realizado: ${brlExact(withdrawal.profitAvailability.realizedProfitInPeriod)}; retiradas de lucro: ${brlExact(withdrawal.profitAvailability.ownerProfitWithdrawalsInPeriod)}; lucro após retiradas: ${brlExact(withdrawal.profitAfterWithdrawals)}; contas próximas: ${brlExact(withdrawal.upcomingBills)}; lucro após contas: ${brlExact(withdrawal.availableAfterBills)}.`
          : "Snapshot de lucro do período indisponível.",
        withdrawal.divergenceExplanation,
        ...operationalReasoning.slice(0, 1),
      ],
      risks,
      recommendations: [recommendedAction],
      confidence,
      safeWithdrawalAmount: withdrawal.prudentLimit,
      safeReinvestmentAmount: exactValuesAllowed ? safeReinvestment : undefined,
      executiveContext,
    }
  }

  if (answerType === "reinvestment" || answerType === "working_capital") {
    if (input.reinvestmentDecision) {
      const decision = input.reinvestmentDecision
      const mappedDecision = decision.decision === "reinvest_recommended"
        ? "allowed" as const
        : decision.decision === "reinvest_with_cap" ? "partial" as const : "not_recommended" as const
      const primaryValue = decision.recommendedReinvestmentAmount > 0
        ? decision.recommendedReinvestmentAmount
        : decision.safeReinvestmentCap > 0 ? decision.safeReinvestmentCap : decision.currentCash
      const primaryLabel = decision.recommendedReinvestmentAmount > 0
        ? "recompra recomendada agora"
        : decision.safeReinvestmentCap > 0 ? "teto seguro de recompra" : "caixa atual"
      const executiveContext = financialDecisionContext({
        question: input.userQuestion || input.goal?.reason || "",
        decision: mappedDecision,
        confidence: decision.confidence,
        primaryLabel,
        primaryValue,
        primaryFormatted: brlExact(primaryValue),
        supportingNumbers: [
          {
            label: "caixa atual",
            value: decision.currentCash,
            formatted: brlExact(decision.currentCash),
            meaning: "caixa conciliado disponível antes de reserva e contas",
          },
          {
            label: "reserva mínima operacional",
            value: decision.operationalReserve,
            formatted: brlExact(decision.operationalReserve),
            meaning: "percentual do caixa preservado para segurança operacional",
          },
          decision.upcomingPayables > 0 ? {
            label: "contas próximas",
            value: decision.upcomingPayables,
            formatted: brlExact(decision.upcomingPayables),
            meaning: "obrigações previstas em 7 dias",
          } : null,
          decision.nearTermReceivables > 0 ? {
            label: "recebíveis até 3 dias",
            value: decision.nearTermReceivables,
            formatted: brlExact(decision.nearTermReceivables),
            meaning: "suporte de planejamento, não caixa já conciliado",
          } : null,
          decision.futureReceivables > 0 ? {
            label: "recebíveis futuros",
            value: decision.futureReceivables,
            formatted: brlExact(decision.futureReceivables),
            meaning: "contexto futuro, sem liberar recompra imediata sozinho",
          } : null,
          decision.recommendedReinvestmentAmount > 0 ? {
            label: "recompra recomendada agora",
            value: decision.recommendedReinvestmentAmount,
            formatted: brlExact(decision.recommendedReinvestmentAmount),
            meaning: "valor sugerido para recompra imediata, abaixo do teto após contas",
          } : null,
          decision.capAfterPayables > 0 ? {
            label: "teto após contas",
            value: decision.capAfterPayables,
            formatted: brlExact(decision.capAfterPayables),
            meaning: "caixa após reserva mínima e contas próximas",
          } : null,
          decision.theoreticalCap > 0 ? {
            label: "teto teórico",
            value: decision.theoreticalCap,
            formatted: brlExact(decision.theoreticalCap),
            meaning: "caixa atual após reserva mínima, sem descontar contas próximas",
          } : null,
        ].filter(Boolean) as NonNullable<OrionExecutiveDecisionContext["baseDecision"]>["supportingNumbers"],
        reasoning: decision.rationale,
        risks: [...decision.precisionWarnings, ...decision.avoid.map((item) => item.reason)].slice(0, 4),
        recommendedAction: decision.recommendedAction,
        mode: "reinvestment_decision",
        reinvestmentDecision: decision,
      })
      return {
        answerType,
        executiveSummary: decision.recommendedAction,
        operationalReasoning: decision.rationale,
        risks: executiveContext.baseDecision?.risks || [],
        recommendations: [decision.recommendedAction],
        confidence: decision.confidence,
        safeWithdrawalAmount: undefined,
        safeReinvestmentAmount: decision.safeReinvestmentCap,
        executiveContext,
      }
    }

    const reinvestDecision = safeReinvestment <= 0
      ? "not_recommended" as const
      : exactValuesAllowed ? "allowed" as const : "needs_review" as const
    const reinvestRecommendedAction = reinvestDecision === "not_recommended"
      ? "Preserve caixa e realize o lucro antes de transformar capital em recompra."
      : safeReinvestment > 0 && exactValuesAllowed
        ? `Reinvista até ${brlExact(safeReinvestment)} e preserve o restante para obrigações próximas.`
        : "Aguarde a próxima conciliação para confirmar a margem antes de recompra."
    const reinvestPrimary = safeReinvestment > 0
      ? { label: "limite de reinvestimento", value: safeReinvestment, formatted: brlExact(safeReinvestment) }
      : withdrawal.profitAfterWithdrawals > 0
        ? { label: "lucro após retiradas", value: withdrawal.profitAfterWithdrawals, formatted: brlExact(withdrawal.profitAfterWithdrawals) }
        : { label: "caixa disponível", value: withdrawal.cashComposition?.consolidatedCash ?? 0, formatted: brlExact(withdrawal.cashComposition?.consolidatedCash ?? 0) }
    const reinvestSupportingNumbers = [
      withdrawal.cashComposition != null ? {
        label: "caixa disponível",
        value: withdrawal.cashComposition.consolidatedCash,
        formatted: brlExact(withdrawal.cashComposition.consolidatedCash),
        meaning: "total em caixa conciliado",
      } : null,
      {
        label: "lucro após retiradas",
        value: withdrawal.profitAfterWithdrawals,
        formatted: brlExact(withdrawal.profitAfterWithdrawals),
        meaning: "lucro do período depois das retiradas",
      },
      withdrawal.upcomingBills > 0 ? {
        label: "contas próximas",
        value: withdrawal.upcomingBills,
        formatted: brlExact(withdrawal.upcomingBills),
        meaning: "obrigações previstas",
      } : null,
      pendingReceivables > 0 ? {
        label: "recebíveis pendentes",
        value: pendingReceivables,
        formatted: brlExact(pendingReceivables),
        meaning: "valor previsto que ainda não virou caixa conciliado",
      } : null,
      safeReinvestment > 0 ? {
        label: "limite de reinvestimento",
        value: safeReinvestment,
        formatted: brlExact(safeReinvestment),
        meaning: "máximo seguro para recompra de estoque",
      } : null,
    ].filter(Boolean) as NonNullable<OrionExecutiveDecisionContext["baseDecision"]>["supportingNumbers"]
    const reinvestReasoning = [
      withdrawal.cashComposition != null
        ? `Caixa disponível: ${brlExact(withdrawal.cashComposition.consolidatedCash)}; lucro após retiradas: ${brlExact(withdrawal.profitAfterWithdrawals)}; contas próximas: ${brlExact(withdrawal.upcomingBills)}.`
        : `Lucro após retiradas: ${brlExact(withdrawal.profitAfterWithdrawals)}; contas próximas: ${brlExact(withdrawal.upcomingBills)}.`,
      pendingReceivables > 0
        ? `Recebíveis pendentes: ${brlExact(pendingReceivables)}; só entram na decisão depois de conciliados.`
        : null,
      withdrawal.divergenceExplanation,
    ].filter(Boolean) as string[]
    const reinvestRisks = reinvestDecision === "not_recommended"
      ? ["Capital disponível está comprometido com operação ou capital protegido; recompra reduziria liquidez."]
      : withdrawal.upcomingBills > 0
        ? ["Preserve capital para cobrir obrigações próximas antes de ampliar estoque."]
        : []
    const reinvestContext = financialDecisionContext({
      question: input.userQuestion || input.goal?.reason || "",
      decision: reinvestDecision,
      confidence,
      primaryLabel: reinvestPrimary.label,
      primaryValue: reinvestPrimary.value,
      primaryFormatted: reinvestPrimary.formatted,
      supportingNumbers: reinvestSupportingNumbers,
      reasoning: reinvestReasoning,
      risks: reinvestRisks,
      recommendedAction: reinvestRecommendedAction,
      mode: "reinvestment_decision",
    })
    return {
      answerType,
      executiveSummary: reinvestDecision === "not_recommended"
        ? "Margem para reinvestimento insuficiente no cenário atual."
        : `Limite de reinvestimento auditado: ${brlExact(safeReinvestment)}.`,
      operationalReasoning: reinvestReasoning,
      risks,
      recommendations: [reinvestRecommendedAction],
      confidence,
      safeWithdrawalAmount: exactValuesAllowed ? withdrawal.prudentLimit : undefined,
      safeReinvestmentAmount: exactValuesAllowed ? safeReinvestment : undefined,
      executiveContext: reinvestContext,
    }
  }

  return {
    answerType,
    executiveSummary: input.financialContext.operationalSummary,
    operationalReasoning,
    risks,
    recommendations: ["Use a auditoria financeira antes de transformar caixa em retirada ou recompra."],
    confidence,
    safeWithdrawalAmount: exactValuesAllowed ? withdrawal.prudentLimit : undefined,
    safeReinvestmentAmount: exactValuesAllowed ? safeReinvestment : undefined,
  }
}

export function formatFinancialDecisionResponse(response: OrionFinancialDecisionResponse) {
  if (response.executiveContext) {
    return normalizeExecutiveTone(renderExecutiveResponseFallback(response.executiveContext))
  }
  return normalizeExecutiveTone([
    "Leitura:",
    response.executiveSummary,
    "",
    "Cálculo:",
    response.operationalReasoning.slice(0, 2).join(" "),
    "",
    "Decisão:",
    response.recommendations[0] || "Mantenha decisão conservadora até nova conciliação.",
    "",
    "Observação:",
    response.risks[0] || "Sem alerta financeiro adicional no contexto auditado.",
  ].join("\n"))
}
