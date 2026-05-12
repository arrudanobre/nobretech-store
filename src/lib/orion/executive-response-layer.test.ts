import assert from "node:assert/strict"
import {
  buildExecutiveResponseContext,
  buildExecutiveResponsePrompt,
  renderExecutiveResponseFallback,
  type OrionExecutiveDecisionContext,
} from "./executive-response-layer"
import { buildReinvestmentAuditBreakdown } from "./financial-decision-response"

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

{
  const reinvestment: OrionExecutiveDecisionContext = {
    mode: "reinvestment_decision",
    userQuestion: "Posso reinvestir em estoque agora?",
    baseDecision: {
      decision: "not_recommended",
      confidence: "medium",
      primaryNumber: {
        label: "lucro após retiradas",
        value: 1752.09,
        formatted: "R$ 1.752,09",
      },
      supportingNumbers: [
        { label: "caixa disponível", value: 8269.26, formatted: "R$ 8.269,26", meaning: "total em caixa conciliado" },
        { label: "lucro após retiradas", value: 1752.09, formatted: "R$ 1.752,09", meaning: "lucro do período depois das retiradas" },
        { label: "recebíveis pendentes", value: 3500, formatted: "R$ 3.500,00", meaning: "valor previsto que ainda não virou caixa conciliado" },
      ],
      reasoning: [
        "Caixa disponível: R$ 8.269,26; lucro após retiradas: R$ 1.752,09; contas próximas: R$ 0,00.",
        "Recebíveis pendentes: R$ 3.500,00; só entram na decisão depois de conciliados.",
      ],
      risks: ["Capital disponível está comprometido com operação ou capital protegido; recompra reduziria liquidez."],
      recommendedAction: "Preserve caixa e realize o lucro antes de transformar capital em recompra.",
    },
    guardrails: blockedFinancialGuardrails,
    dataQuality: {
      confidence: "medium",
      warnings: [],
    },
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
      rationale: ["Há teto para recompra seletiva.", "Amostra pequena exige cautela."],
      precisionWarnings: ["Amostra histórica pequena: trate a recomendação como sinal comercial, não prova estatística."],
      recommendedAction: "Recomprar com teto pequeno e seletivo; não ampliar estoque de forma agressiva.",
      recommendedCategories: [{
        category: "iPad",
        reason: "1 venda recente; 25% de margem média; amostra pequena, tratar como sinal e não prova",
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
      avoid: [{ label: "Acessórios", reason: "Produto de baixo lucro só entra como complemento, não prioridade." }],
      leadContext: {
        activeOpportunities: 0,
        lostLeads: 9,
        shouldFollowUpLostLeads: false,
        note: "Leads perdidos indicam demanda ou falha de conversão, mas não são oportunidade ativa de follow-up.",
      },
      analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
    },
  }
  const response = renderExecutiveResponseFallback(reinvestment)
  assert.match(response, /recompraria com teto/i)
  assert.match(response, /iPad/i)
  assert.match(response, /9 leads perdidos/i)
  assert.doesNotMatch(response, /Leitura:|Cálculo:|Decisão:|Observação:|reinvestimento controlado|confiança medium|Período analisado|devoluções sem lastro|availableForReinvestment/)
}

// Reinvestment rendering: must mention recompra recomendada and explain gap with teto teórico
{
  const reinvestment: OrionExecutiveDecisionContext = {
    mode: "reinvestment_decision",
    userQuestion: "Posso reinvestir agora?",
    guardrails: blockedFinancialGuardrails,
    reinvestmentDecision: {
      decision: "reinvest_with_cap",
      confidence: "medium",
      capitalStatus: "sku_slack",
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
      rationale: [],
      precisionWarnings: [],
      recommendedAction: "Recomprar com teto.",
      recommendedCategories: [],
      recommendedProducts: [{
        label: "iPad (11ª geração)",
        productType: "iPad",
        model: "iPad (11ª geração)",
        reason: "3 vendas; 25% margem média",
        historicalMargin: 25,
        averageDaysInStock: 9,
        recentSalesCount: 3,
        priority: "high",
        probableUnitCost: 2600,
        sampleSize: 3, sampleWarning: null, periodLabel: "Últimos 90 dias",
        confidence: "high",
      }],
      avoid: [],
      leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads relevantes." },
      analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
    },
  }
  const response = renderExecutiveResponseFallback(reinvestment)
  assert.match(response, /trabalharia com até R\$\s*5\.600,00/i, "must mention recommended amount")
  assert.match(response, /teto teórico é R\$\s*8\.000,00/i, "must mention teto teórico")
  assert.match(response, /reserva mínima operacional/i, "must mention reserva mínima separately")
  assert.match(response, /contas próximas/i, "must mention contas próximas separately")
  assert.equal(/recebíveis caírem/i.test(response), false, "must NOT say teto depends on recebíveis")
  assert.equal(/contas e reserva/i.test(response), false, "must NOT lump contas + reserva together")
  assert.equal(response.includes("iPad iPad"), false, "must not duplicate iPad iPad")
}

// Reinvestment avoid item with high margin %, low absolute profit must NOT say "margem baixa"
{
  const reinvestment: OrionExecutiveDecisionContext = {
    mode: "reinvestment_decision",
    userQuestion: "Posso reinvestir?",
    guardrails: blockedFinancialGuardrails,
    reinvestmentDecision: {
      decision: "reinvest_recommended",
      confidence: "high",
      capitalStatus: "sku_slack",
      safeReinvestmentCap: 5000,
      theoreticalCap: 5000,
      capAfterPayables: 5000,
      recommendedReinvestmentAmount: 3500,
      preserveCashAmount: 2000,
      currentCash: 7000,
      nearTermReceivables: 0,
      shortTermReceivables: 0,
      futureReceivables: 0,
      undatedReceivables: 0,
      receivablesDetailAvailable: true,
      upcomingPayables: 500,
      operationalReserve: 1500,
      rationale: [],
      precisionWarnings: [],
      recommendedAction: "Recomprar seletivo.",
      recommendedCategories: [],
      recommendedProducts: [{
        label: "iPad (11ª geração)",
        productType: "iPad",
        model: "iPad (11ª geração)",
        reason: "5 vendas; 25% margem média",
        historicalMargin: 25,
        averageDaysInStock: 10,
        recentSalesCount: 5,
        priority: "high",
        probableUnitCost: 2600,
        sampleSize: 5, sampleWarning: null, periodLabel: "Últimos 90 dias",
        confidence: "high",
      }],
      avoid: [{
        label: "Apple Pencil",
        reason: "Margem percentual ok, mas lucro absoluto médio baixo para mover resultado: 41.9% de margem percentual e 120 de lucro absoluto médio. Vale como complemento, não como prioridade de recompra.",
      }],
      leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads." },
      analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
    },
  }
  const response = renderExecutiveResponseFallback(reinvestment)
  assert.match(response, /Apple Pencil/i)
  assert.match(response, /lucro absoluto/i, "avoid reason must cite absolute profit")
  assert.equal(/margem percentual baixa/i.test(response), false, "must not flag high % margin as low")
  assert.match(response, /complemento/i, "must describe as complement")
}

// Formatting: paragraphs, no "dia(s)" / "venda(s)" / "lead(s)", money always in R$
{
  const reinvestment: OrionExecutiveDecisionContext = {
    mode: "reinvestment_decision",
    userQuestion: "Posso reinvestir?",
    guardrails: blockedFinancialGuardrails,
    reinvestmentDecision: {
      decision: "reinvest_recommended",
      confidence: "high",
      capitalStatus: "sku_slack",
      safeReinvestmentCap: 5000,
      theoreticalCap: 5000,
      capAfterPayables: 5000,
      recommendedReinvestmentAmount: 3500,
      preserveCashAmount: 2000,
      currentCash: 7000,
      nearTermReceivables: 0,
      shortTermReceivables: 0,
      futureReceivables: 0,
      undatedReceivables: 0,
      receivablesDetailAvailable: true,
      upcomingPayables: 500,
      operationalReserve: 1500,
      rationale: [],
      precisionWarnings: [],
      recommendedAction: "Recomprar seletivo.",
      recommendedCategories: [],
      recommendedProducts: [{
        label: "iPad (11ª geração)",
        productType: "iPad",
        model: "iPad (11ª geração)",
        reason: "4 vendas recentes; 25% de margem média; 7,3 dias médios em estoque",
        historicalMargin: 25,
        averageDaysInStock: 7.3,
        recentSalesCount: 4,
        priority: "high",
        probableUnitCost: 2600,
        sampleSize: 4, sampleWarning: null, periodLabel: "Últimos 90 dias",
        confidence: "high",
      }],
      avoid: [{ label: "Cabo USB", reason: "Margem percentual baixa para prioridade de capital: 5% de margem percentual." }],
      leadContext: { activeOpportunities: 2, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Há 2 oportunidades ativas no funil." },
      analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
    },
  }
  const response = renderExecutiveResponseFallback(reinvestment)
  // paragraph count: at minimum 3, at most 6
  const paragraphs = response.split(/\n\n+/).filter(Boolean)
  assert.ok(paragraphs.length >= 3 && paragraphs.length <= 6, `expected 3-6 paragraphs, got ${paragraphs.length}`)
  // no "X dia(s)" or "X venda(s)" or "X lead(s)" leftover
  assert.equal(/dia\(s\)/.test(response), false, "must not contain 'dia(s)'")
  assert.equal(/venda\(s\)/.test(response), false, "must not contain 'venda(s)'")
  assert.equal(/lead\(s\)/.test(response), false, "must not contain 'lead(s)'")
  // money values must include R$
  const moneyMatches = response.match(/R\$\s?[\d.,]+/g) || []
  assert.ok(moneyMatches.length >= 3, "should have at least 3 R$ formatted values")
  // raw numbers that look like money (without R$) must not appear next to currency phrasings
  assert.equal(/trabalharia com até \d[^R$]/i.test(response), false, "money must be R$ formatted")
  assert.equal(/preservaria \d/i.test(response), false, "money must be R$ formatted")
}

// Executive response mentions analysis window/base
{
  const reinvestment: OrionExecutiveDecisionContext = {
    mode: "reinvestment_decision",
    userQuestion: "Posso reinvestir?",
    guardrails: blockedFinancialGuardrails,
    reinvestmentDecision: {
      decision: "reinvest_recommended",
      confidence: "high",
      capitalStatus: "sku_slack",
      safeReinvestmentCap: 8000,
      theoreticalCap: 8000,
      capAfterPayables: 8000,
      recommendedReinvestmentAmount: 5600,
      preserveCashAmount: 2500,
      currentCash: 10500,
      nearTermReceivables: 0,
      shortTermReceivables: 0,
      futureReceivables: 0,
      undatedReceivables: 0,
      receivablesDetailAvailable: true,
      upcomingPayables: 0,
      operationalReserve: 2500,
      rationale: [],
      precisionWarnings: [],
      recommendedAction: "Recomprar seletivo.",
      recommendedCategories: [],
      recommendedProducts: [{
        label: "iPad (11ª geração)",
        productType: "iPad",
        model: "iPad (11ª geração)",
        reason: "4 vendas recentes; 25% de margem média; 7,3 dias médios em estoque",
        historicalMargin: 25,
        averageDaysInStock: 7.3,
        recentSalesCount: 4,
        priority: "high",
        probableUnitCost: 2600,
        sampleSize: 4,
        sampleWarning: null,
        periodLabel: "Últimos 90 dias",
        confidence: "high",
      }],
      avoid: [],
      leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads." },
      analysisWindow: { label: "Últimos 90 dias", startDate: "2026-02-12", endDate: "2026-05-12", salesCount: 6, source: "last_90_days" },
    },
  }
  const response = renderExecutiveResponseFallback(reinvestment)
  assert.match(response, /base analisada de últimos 90 dias/i, "must mention base/window")
  assert.equal(/sinal comercial, não como certeza estat/i.test(response), false, "must not warn on adequate sample")
}

// Executive response: small sample warns
{
  const reinvestment: OrionExecutiveDecisionContext = {
    mode: "reinvestment_decision",
    userQuestion: "Posso reinvestir?",
    guardrails: blockedFinancialGuardrails,
    reinvestmentDecision: {
      decision: "reinvest_with_cap",
      confidence: "low",
      capitalStatus: "sku_slack",
      safeReinvestmentCap: 5000,
      theoreticalCap: 5000,
      capAfterPayables: 5000,
      recommendedReinvestmentAmount: 3500,
      preserveCashAmount: 2500,
      currentCash: 7500,
      nearTermReceivables: 0,
      shortTermReceivables: 0,
      futureReceivables: 0,
      undatedReceivables: 0,
      receivablesDetailAvailable: true,
      upcomingPayables: 0,
      operationalReserve: 2500,
      rationale: [],
      precisionWarnings: ["Amostra histórica pequena: trate a recomendação como sinal comercial, não prova estatística."],
      recommendedAction: "Recomprar com teto.",
      recommendedCategories: [],
      recommendedProducts: [{
        label: "iPhone 15 Pro Max",
        productType: "iPhone",
        model: "iPhone 15 Pro Max",
        reason: "1 venda recente; 20% de margem média",
        historicalMargin: 20,
        averageDaysInStock: 5,
        recentSalesCount: 1,
        priority: "high",
        probableUnitCost: 4000,
        sampleSize: 1,
        sampleWarning: "small_sample",
        periodLabel: "Últimos 90 dias",
        confidence: "low",
      }],
      avoid: [],
      leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads." },
      analysisWindow: { label: "Últimos 90 dias", startDate: "2026-02-12", endDate: "2026-05-12", salesCount: 1, source: "last_90_days" },
    },
  }
  const response = renderExecutiveResponseFallback(reinvestment)
  assert.match(response, /sinal comercial, não como certeza/i, "must warn for small sample")
  assert.match(response, /base analisada/i, "must mention base")
}

// Audit: includes "Cálculo da recompra" and "Recompra recomendada agora", no profit composition
{
  const decision = {
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
    rationale: [],
    precisionWarnings: [],
    recommendedAction: "Recomprar com teto.",
    recommendedCategories: [],
    recommendedProducts: [{ label: "iPad (11ª geração)", productType: "iPad", model: "iPad (11ª geração)", reason: "3 vendas recentes; 25% de margem média", historicalMargin: 25, averageDaysInStock: 9, recentSalesCount: 3, priority: "high" as const, probableUnitCost: 2600, sampleSize: 3, sampleWarning: null, periodLabel: "Últimos 90 dias", confidence: "high" as const }],
    avoid: [],
    leadContext: { activeOpportunities: 0, lostLeads: 0, shouldFollowUpLostLeads: false, note: "Sem leads relevantes." },
    analysisWindow: { label: "Últimos 90 dias", startDate: null, endDate: null, salesCount: 6, source: "last_90_days" as const },
  }
  const audit = buildReinvestmentAuditBreakdown(decision)
  assert.ok(audit.includes("Cálculo da recompra"))
  assert.ok(audit.includes("Recompra recomendada agora"))
  assert.equal(audit.includes("Composição do lucro realizado"), false)
  assert.ok(audit.includes("Base analisada"), "audit must show base analisada")
  assert.ok(audit.includes("Últimos 90 dias"), "audit must show period label")
  assert.ok(audit.includes("Vendas analisadas"), "audit must show sales count")
  const blocks = audit.split(/\n\n+/).filter(Boolean)
  assert.ok(blocks.length >= 4, `audit should have multiple blocks, got ${blocks.length}`)
}

console.log("executive-response-layer tests passed")
