import assert from "node:assert/strict"
import {
  buildExecutiveResponseContext,
  buildExecutiveResponsePrompt,
  renderExecutiveResponseFallback,
  type OrionExecutiveDecisionContext,
} from "./executive-response-layer"

const blockedFinancialGuardrails = {
  allowCampaignGeneration: false,
  allowTrafficRecommendation: false,
  allowProductMixGeneration: false,
  allowCopyGeneration: false,
  allowFinancialCalculation: false as const,
}

const allowedFinancialContext: OrionExecutiveDecisionContext = {
  mode: "financial_decision",
  userQuestion: "posso sacar R$ 500 agora?",
  baseDecision: {
    decision: "allowed",
    confidence: "medium",
    primaryNumber: {
      label: "limite prudente",
      value: 1373.49,
      formatted: "R$ 1.373,49",
    },
    supportingNumbers: [
      { label: "caixa atual", value: 8269.26, formatted: "R$ 8.269,26", meaning: "saldo disponível hoje" },
      { label: "contas próximas", value: 378.6, formatted: "R$ 378,60", meaning: "obrigações previstas" },
      { label: "valor solicitado", value: 500, formatted: "R$ 500,00", meaning: "saque desejado" },
    ],
    reasoning: [
      "O saque solicitado fica abaixo do lucro disponível após retiradas e contas.",
      "O caixa atual cobre o saque e as contas próximas.",
    ],
    risks: [],
    recommendedAction: "Pode sacar R$ 500, mantendo o restante como capital operacional.",
  },
  guardrails: blockedFinancialGuardrails,
  dataQuality: {
    confidence: "medium",
    warnings: [],
  },
}

{
  const prompt = buildExecutiveResponsePrompt(allowedFinancialContext)
  assert.match(prompt, /Não calcule números/)
  assert.match(prompt, /Não invente valores/)
  assert.match(prompt, /Não altere a decisão-base/)
  assert.match(prompt, /R\$ 1\.373,49/)
  assert.match(prompt, /R\$ 500,00/)
}

{
  const response = renderExecutiveResponseFallback(allowedFinancialContext)
  assert.match(response, /cabe/i)
  assert.match(response, /R\$ 1\.373,49/)
  assert.match(response, /Pode sacar R\$ 500/)
  assert.doesNotMatch(response, /not_recommended|não recomendo/i)
}

{
  const notRecommended: OrionExecutiveDecisionContext = {
    ...allowedFinancialContext,
    userQuestion: "posso sacar R$ 2.500 agora?",
    baseDecision: {
      ...allowedFinancialContext.baseDecision!,
      decision: "not_recommended",
      recommendedAction: "Não sacar R$ 2.500 agora; use R$ 1.373,49 como referência prudente.",
      supportingNumbers: [
        ...(allowedFinancialContext.baseDecision?.supportingNumbers || []),
        { label: "valor solicitado", value: 2500, formatted: "R$ 2.500,00", meaning: "saque desejado" },
      ],
    },
  }
  const response = renderExecutiveResponseFallback(notRecommended)
  assert.match(response, /não recomendo/i)
  assert.match(response, /R\$ 1\.373,49/)
  assert.doesNotMatch(response, /cabe pelo cenário atual/i)
}

{
  const context = buildExecutiveResponseContext(allowedFinancialContext)
  assert.equal(context.guardrails.allowCampaignGeneration, false)
  assert.equal(context.guardrails.allowTrafficRecommendation, false)
  assert.equal(context.guardrails.allowCopyGeneration, false)
  assert.equal(context.guardrails.allowFinancialCalculation, false)
}

{
  const traceability: OrionExecutiveDecisionContext = {
    mode: "financial_traceability",
    userQuestion: "liste minhas retiradas",
    baseDecision: {
      decision: "informational",
      confidence: "high",
      reasoning: ["Retiradas listadas a partir dos movimentos do período."],
      risks: [],
      recommendedAction: "Essas saídas reduzem o lucro disponível do período.",
    },
    guardrails: blockedFinancialGuardrails,
    traceability: {
      movements: [
        {
          date: "02/05/2026",
          description: "Retirada de lucro para Vinicius",
          accountName: "PagBank",
          paymentMethod: "Pix",
          amount: 124.88,
          formattedAmount: "R$ 124,88",
        },
        {
          date: "10/05/2026",
          description: "Almoço dia das Mães",
          accountName: "PagBank",
          paymentMethod: "Pix",
          amount: 150,
          formattedAmount: "R$ 150,00",
        },
      ],
      totals: [{ label: "Total", formatted: "R$ 274,88" }],
    },
  }
  const response = renderExecutiveResponseFallback(traceability)
  assert.ok(response.startsWith("Movimentos no período selecionado:"))
  assert.match(response, /02\/05\/2026 — Retirada de lucro para Vinicius/)
  assert.match(response, /Total: R\$ 274,88/)
  assert.equal(response.split("\n").length <= 12, true)
}

{
  const prompt = buildExecutiveResponsePrompt(allowedFinancialContext)
  assert.match(prompt, /Não exponha nomes técnicos internos/)
  const response = renderExecutiveResponseFallback(allowedFinancialContext)
  assert.doesNotMatch(response, /snapshot|engine|safeWithdrawalAmount|workingCapitalSnapshot/)
}

{
  const lowConfidence: OrionExecutiveDecisionContext = {
    ...allowedFinancialContext,
    baseDecision: {
      ...allowedFinancialContext.baseDecision!,
      confidence: "low",
      decision: "needs_review",
      recommendedAction: "Trate a leitura como referência operacional até revisar os dados parciais.",
      risks: ["Há dados parciais no período."],
    },
    dataQuality: {
      confidence: "low",
      warnings: ["Há dados parciais no período."],
      partialData: ["vendas parcialmente rastreadas"],
    },
  }
  const response = renderExecutiveResponseFallback(lowConfidence)
  assert.match(response, /referência operacional|dados parciais/i)
  assert.doesNotMatch(response, /crise|urgente|pânico|ansiedade/i)
}

console.log("executive-response-layer tests passed")
