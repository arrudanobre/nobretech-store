export type OrionExecutiveResponseMode =
  | "financial_decision"
  | "financial_traceability"
  | "inventory_analysis"
  | "sales_strategy"
  | "campaign_execution"
  | "operational_diagnosis"
  | "general_business_advice"

export type OrionExecutiveDecisionContext = {
  mode: OrionExecutiveResponseMode
  userQuestion: string
  baseDecision?: {
    decision:
      | "allowed"
      | "not_recommended"
      | "partial"
      | "informational"
      | "needs_review"
      | "execution_allowed"
      | "execution_blocked"
    confidence: "low" | "medium" | "high"
    primaryNumber?: {
      label: string
      value: number
      formatted: string
    }
    supportingNumbers?: Array<{
      label: string
      value: number
      formatted: string
      meaning: string
    }>
    reasoning: string[]
    risks: string[]
    recommendedAction?: string
  }
  guardrails: {
    allowCampaignGeneration: boolean
    allowTrafficRecommendation: boolean
    allowProductMixGeneration: boolean
    allowCopyGeneration: boolean
    allowFinancialCalculation: false
  }
  businessPersonalityProfile?: {
    tone: "executive" | "operational" | "commercial"
    riskPosture: "conservative" | "balanced" | "growth"
    marginPreference?: string
    customerExperiencePreference?: string
  }
  dataQuality?: {
    confidence: "low" | "medium" | "high"
    warnings: string[]
    partialData?: string[]
  }
  traceability?: {
    movements?: Array<{
      date: string
      description: string
      accountName?: string
      paymentMethod?: string
      amount: number
      formattedAmount: string
      notes?: string[]
    }>
    totals?: Array<{
      label: string
      formatted: string
    }>
  }
}

const C_LEVEL_SYSTEM_INSTRUCTIONS = [
  "Você é a ORION, conselheira executiva da Nobretech.",
  "Você responde como C-Level operacional: humana, direta, estratégica e prática.",
  "Os números e a decisão-base já foram calculados por sistemas determinísticos.",
  "Não calcule números. Não invente valores. Não altere a decisão-base.",
  "Não transforme permitido em não recomendado, nem não recomendado em permitido.",
  "Não exponha nomes técnicos internos como snapshot, engine, safeWithdrawalAmount ou workingCapitalSnapshot.",
  "Não empurre campanha, tráfego, copy, headline, CTA ou mix quando os guardrails bloquearem execução.",
  "Em financial_traceability, preserve a lista/tabela antes de qualquer análise.",
  "Em financial_traceability, não transforme uma listagem objetiva em aconselhamento financeiro longo.",
  "Prefira linguagem natural, executiva e operacional para o Vinícius.",
  "Evite tom robótico, linguagem alarmista, coaching emocional e frases como 'se quiser eu'.",
].join("\n")

function normalizeGuardrails(input: OrionExecutiveDecisionContext["guardrails"]): OrionExecutiveDecisionContext["guardrails"] {
  return {
    allowCampaignGeneration: Boolean(input.allowCampaignGeneration),
    allowTrafficRecommendation: Boolean(input.allowTrafficRecommendation),
    allowProductMixGeneration: Boolean(input.allowProductMixGeneration),
    allowCopyGeneration: Boolean(input.allowCopyGeneration),
    allowFinancialCalculation: false,
  }
}

export function buildExecutiveResponseContext(input: OrionExecutiveDecisionContext): OrionExecutiveDecisionContext {
  return {
    ...input,
    guardrails: normalizeGuardrails(input.guardrails),
    baseDecision: input.baseDecision ? {
      ...input.baseDecision,
      reasoning: input.baseDecision.reasoning.slice(0, 6),
      risks: input.baseDecision.risks.slice(0, 4),
      supportingNumbers: input.baseDecision.supportingNumbers?.slice(0, 8),
    } : undefined,
    traceability: input.traceability ? {
      movements: input.traceability.movements?.slice(0, 20),
      totals: input.traceability.totals?.slice(0, 8),
    } : undefined,
    dataQuality: input.dataQuality ? {
      ...input.dataQuality,
      warnings: input.dataQuality.warnings.slice(0, 5),
      partialData: input.dataQuality.partialData?.slice(0, 5),
    } : undefined,
  }
}

export function buildExecutiveResponsePrompt(input: OrionExecutiveDecisionContext) {
  const context = buildExecutiveResponseContext(input)
  return [
    C_LEVEL_SYSTEM_INSTRUCTIONS,
    "",
    "Contexto estruturado autorizado:",
    JSON.stringify(context, null, 2),
    "",
    "Tarefa:",
    "Redija a resposta final ao usuário usando somente o contexto estruturado autorizado.",
    "Preserve números, listas, totais, decisão-base e guardrails.",
  ].join("\n")
}

function movementTable(context: OrionExecutiveDecisionContext) {
  const movements = context.traceability?.movements || []
  const totals = context.traceability?.totals || []
  if (!movements.length) return null
  const lines = movements.map((movement, index) => [
    `${index + 1}. ${movement.date} — ${movement.description}`,
    movement.accountName ? `Conta: ${movement.accountName}` : null,
    movement.paymentMethod ? `Pagamento: ${movement.paymentMethod}` : null,
    `Valor: ${movement.formattedAmount}`,
    ...(movement.notes || []),
  ].filter(Boolean).join("\n"))
  return [
    "Movimentos no período selecionado:",
    lines.join("\n"),
    ...totals.map((total) => `${total.label}: ${total.formatted}`),
  ].join("\n")
}

function supportingNumbersLine(context: OrionExecutiveDecisionContext) {
  const supporting = context.baseDecision?.supportingNumbers || []
  if (!supporting.length) return ""
  return supporting.map((item) => `${item.label}: ${item.formatted}`).join("; ")
}

function supportingNumber(context: OrionExecutiveDecisionContext, label: string) {
  return context.baseDecision?.supportingNumbers?.find((item) => item.label === label)
}

export function renderExecutiveResponseFallback(input: OrionExecutiveDecisionContext) {
  const context = buildExecutiveResponseContext(input)

  if (context.mode === "financial_traceability") {
    const table = movementTable(context)
    if (table) {
      const observation = context.baseDecision?.recommendedAction
        ? `Observação: ${context.baseDecision.recommendedAction}`
        : null
      return [table, observation].filter(Boolean).join("\n")
    }
    return context.baseDecision?.recommendedAction || "Não encontrei movimentos detalhados no período selecionado."
  }

  const decision = context.baseDecision
  if (!decision) return "Não encontrei uma decisão estruturada suficiente para responder com segurança."

  const numberLine = supportingNumbersLine(context)
  const primary = decision.primaryNumber ? `${decision.primaryNumber.label}: ${decision.primaryNumber.formatted}` : ""
  const requested = supportingNumber(context, "valor solicitado")
  const reading = decision.decision === "allowed"
    ? `Vinícius, ${requested ? `esse saque de ${requested.formatted}` : "isso"} cabe no limite prudente pelo cenário atual. ${primary}`.trim()
    : decision.decision === "not_recommended"
      ? `Vinícius, eu não recomendo ${requested ? `sacar ${requested.formatted}` : "esse movimento"} no cenário atual. ${primary}`.trim()
      : decision.decision === "partial"
        ? `Vinícius, eu trataria isso como possível apenas parcialmente. ${primary}`.trim()
        : decision.recommendedAction || "Leitura operacional registrada."
  const divergence = decision.reasoning.find((item) => item.toLowerCase().includes("diverg"))
  const calculation = [numberLine || decision.reasoning[0] || "Usei a decisão estruturada disponível.", divergence]
    .filter(Boolean)
    .join(". ")
  const action = decision.recommendedAction || decision.reasoning[1] || "Mantenha a decisão dentro dos limites informados."
  const observation = [
    ...decision.risks,
    ...(context.dataQuality?.warnings || []),
  ][0] || "Sem alerta adicional relevante."

  return [
    `Leitura: ${reading}`,
    `Cálculo: ${calculation}`,
    `Decisão: ${action}`,
    `Observação: ${observation}`,
  ].join("\n")
}

export const ORION_C_LEVEL_SYSTEM_INSTRUCTIONS = C_LEVEL_SYSTEM_INSTRUCTIONS
