import assert from "node:assert/strict"
import { buildOrionResponse } from "./orion-response-orchestrator"
import { buildSemanticPlan } from "./semantic-planner"
import type { OrionSnapshot } from "./types"

function snapshot(): OrionSnapshot {
  return {
    executive: {
      cashBalance: 10919,
      pendingReceivables: 850,
      liquidityForecast: {
        payables7d: 379,
        receivables7d: 850,
        nextReceivables: [{
          id: "r1",
          label: "Recebível próximo",
          amount: 850,
          dueDate: "2026-05-13",
          daysUntilDue: 1,
        }],
      },
    },
    finance: {
      reconciledCashBalance: 10919,
      pendingBalance: 850,
      selectedFinancialPeriod: { label: "Mês atual" },
      profitAvailabilitySnapshot: {
        profitAfterWithdrawals: 2152,
      },
      currentCashCompositionSnapshot: {
        consolidatedCash: 10919,
      },
    },
    sales: {
      reinvestmentAnalysisWindow: {
        label: "Últimos 90 dias",
        startDate: "2026-02-12",
        endDate: "2026-05-12",
        salesCount: 4,
        source: "last_90_days",
      },
      reinvestmentCandidates: [{
        label: "iPad (11ª geração)",
        category: "iPad",
        productType: "iPad",
        model: "iPad (11ª geração)",
        recentSalesCount: 4,
        sampleSize: 4,
        totalRevenue: 13600,
        totalProfit: 3400,
        averageTicket: 3400,
        averageProfit: 850,
        averageMarginPct: 25,
        averageDaysInStock: 7.3,
        probableUnitCost: 2550,
        minRecentCost: 2500,
        currentStockCount: 0,
        currentStockValue: 0,
        stuckStockCount: 0,
        campaignDemandLeads: 10,
        campaignLostLeads: 9,
        activeLeadSignals: 0,
        lostLeadSignals: 9,
        confidence: "high",
      }],
    },
    stock: {
      stuckItems: [{
        id: "i1",
        name: "iPhone 12 Pro",
        category: "iPhone",
        color: "preto",
        daysInStock: 72,
        purchasePrice: 2400,
        suggestedPrice: 3200,
        status: "available",
      }],
    },
    marketing: {
      campaigns: [{
        id: "c1",
        name: "Campanha de Vendas do iPad",
        channel: "Meta",
        spend: 100,
        revenue: 3500,
        leads: 10,
        sales: 1,
        roi: 35,
        lostLeads: 9,
      }],
      forgottenLeads: [],
    },
  } as unknown as OrionSnapshot
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Posso fazer novas compras agora?" }),
    snapshot: snapshot(),
    userQuestion: "Posso fazer novas compras agora?",
  })
  assert.equal(response.responseKind, "reinvestment_decision")
  assert.equal(response.renderMode, "structured_cards")
  assert.ok(response.structured?.reinvestmentDecision)
  assert.ok(response.text.split("\n").length <= 6)
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Posso reinvestir em estoque agora?" }),
    snapshot: snapshot(),
    userQuestion: "Posso reinvestir em estoque agora?",
  })
  assert.equal(response.responseKind, "reinvestment_decision")
  assert.equal(response.renderMode, "structured_cards")
  assert.ok(response.structured?.reinvestmentDecision)
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Como estou hoje?" }),
    snapshot: snapshot(),
    userQuestion: "Como estou hoje?",
  })
  assert.equal(response.responseKind, "cash_health_summary")
  assert.equal(response.renderMode, "executive_blocks")
  assert.ok(response.structured?.cashHealthSummary)
  assert.ok(response.structured.cashHealthSummary.blocks.length <= 4)
  assert.equal(response.text.includes("Contraponto"), false)
  assert.equal(response.text.includes("Decisão que precisa do seu OK"), false)
  assert.equal(response.text.includes("Se quiser"), false)
}

{
  const question = "Queria que você analisasse minha performance de vendas dos últimos 15 dias e me diga quanto realmente lucrei, quais produtos ainda estou preso em estoque e o que você sugere"
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: question }),
    snapshot: snapshot(),
    userQuestion: question,
  })
  assert.equal(response.responseKind, "business_decision")
  assert.equal(response.renderMode, "executive_blocks")
  assert.ok(response.structured?.businessDecision)
  assert.equal(response.structured.businessDecision.timeframeLabel, "últimos 15 dias")
  assert.ok(response.structured.businessDecision.keyFindings.length > 0)
  assert.ok(response.structured.businessDecision.nextSteps.length <= 3)
  assert.equal(response.text.includes("Composição do lucro realizado"), false)
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Abra o cálculo do reinvestimento" }),
    snapshot: snapshot(),
    userQuestion: "Abra o cálculo do reinvestimento",
  })
  assert.equal(response.responseKind, "audit_traceability")
  assert.equal(response.renderMode, "audit_blocks")
  assert.match(response.text, /Rastreabilidade da recompra/)
}

{
  const plan = buildSemanticPlan({ userQuestion: "Posso fazer novas compras agora?" })
  const response = buildOrionResponse({
    semanticPlan: plan,
    snapshot: snapshot(),
    userQuestion: "Pergunta genérica que não deveria vencer o plano",
  })
  assert.equal(plan.primaryGoal, "purchase_capacity")
  assert.equal(response.responseKind, "reinvestment_decision")
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" }),
    snapshot: snapshot(),
    userQuestion: "Com R$ 4.000, o que eu compro?",
  })
  assert.equal(response.responseKind, "business_decision")
  assert.equal(response.renderMode, "executive_blocks")
  assert.ok(response.structured?.businessDecision)
  assert.equal(response.structured.businessDecision.decisionType, "capital_allocation")
  assert.ok(response.structured.businessDecision.keyFindings.length <= 5)
  assert.ok(response.structured.businessDecision.nextSteps.length <= 3)
  assert.equal(response.text.includes("workingCapitalSnapshot"), false)
  assert.equal(response.text.includes("availableForReinvestment"), false)
  assert.equal(response.text.includes("venda(s)"), false)
  assert.equal(response.text.includes("lead(s)"), false)
  assert.equal(response.text.includes("37.5%"), false)
}

{
  const question = "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?"
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: question }),
    snapshot: snapshot(),
    userQuestion: question,
  })
  assert.equal(response.responseKind, "business_decision")
  assert.equal(response.renderMode, "executive_blocks")
  assert.equal(response.semanticPlan.primaryGoal, "capital_allocation")
  assert.equal(response.semanticPlan.budgetAmount, 4000)
  assert.ok(response.structured?.businessDecision)
  assert.equal(response.structured.businessDecision.decisionType, "capital_allocation")
  assert.equal(response.text.includes("Composição do lucro realizado"), false)
}

{
  for (const question of [
    "Abre pra mim o raciocínio do reinvestimento.",
    "Por que você recomendou R$ 5.733?",
    "Como chegou nesse teto de recompra?",
  ]) {
    const response = buildOrionResponse({
      semanticPlan: buildSemanticPlan({ userQuestion: question }),
      snapshot: snapshot(),
      userQuestion: question,
    })
    assert.equal(response.responseKind, "audit_traceability", question)
    assert.equal(response.renderMode, "audit_blocks", question)
    assert.equal(response.semanticPlan.primaryGoal, "audit_traceability", question)
    assert.match(response.text, /Rastreabilidade da recompra/, question)
  }
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Qual minha estratégia para os próximos 15 dias?" }),
    snapshot: snapshot(),
    userQuestion: "Qual minha estratégia para os próximos 15 dias?",
  })
  assert.equal(response.responseKind, "business_decision")
  assert.ok(response.structured?.businessDecision)
  assert.equal(response.structured.businessDecision.decisionType, "business_strategy")
  assert.equal(response.structured.businessDecision.timeframeLabel, "próximos 15 dias")
}

{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Onde estou perdendo dinheiro?" }),
    snapshot: snapshot(),
    userQuestion: "Onde estou perdendo dinheiro?",
  })
  assert.equal(response.responseKind, "business_decision")
  assert.ok(response.structured?.businessDecision)
  assert.ok(response.structured.businessDecision.caveats.length > 0)
  assert.equal(response.text.includes("devoluções sem lastro"), false)
  assert.equal(response.text.includes("confidence medium"), false)
  assert.equal(response.text.includes("venda(s)"), false)
  assert.equal(response.text.includes("Limite:"), false)
  assert.ok(response.text.includes("Limitações:"))
  assert.equal(response.text.includes("Sem estoque preso relevante no snapshot."), false)
  assert.ok(response.text.includes("Sem DRE/despesas/descontos completos"))
}

// Rendered text must not glue "Receita X e lucro Y" / "Em Mês atual"
{
  for (const question of [
    "Qual minha estratégia para os próximos 15 dias?",
    "Onde estou perdendo dinheiro?",
  ]) {
    const response = buildOrionResponse({
      semanticPlan: buildSemanticPlan({ userQuestion: question }),
      snapshot: snapshot(),
      userQuestion: question,
    })
    assert.equal(/Receita .* e lucro rastreável/i.test(response.text), false, `glued sales+profit for: ${question}`)
    assert.equal(response.text.includes("Em Mês atual"), false, `bad capitalization for: ${question}`)
    assert.equal(response.text.includes("em Mês atual"), false)
  }
}

// Decision memory: business_decision creates a candidate when companyId is provided
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" }),
    snapshot: snapshot(),
    userQuestion: "Com R$ 4.000, o que eu compro?",
    companyId: "co-1",
  })
  assert.ok(response.decisionMemoryCandidates && response.decisionMemoryCandidates.length > 0, "must surface a memory candidate")
  const candidate = response.decisionMemoryCandidates![0]
  assert.equal(candidate.decisionType, "capital_allocation")
  assert.equal(candidate.companyId, "co-1")
  assert.ok(typeof candidate.decisionPayload?.decisionKey === "string")
  // decisionKey includes subtype (action) to disambiguate decisions on the same product
  const key = String(candidate.decisionPayload!.decisionKey)
  assert.match(key, /:buy$|:hold$/, `decisionKey must end with subtype, got ${key}`)
  assert.equal(candidate.decisionPayload?.subtype, key.endsWith(":buy") ? "buy" : "hold")
  // reviewAfter: capital_allocation → 7 days horizon
  assert.ok(candidate.reviewAfter, "reviewAfter must be set")
  const reviewMs = new Date(candidate.reviewAfter!).getTime() - Date.now()
  assert.ok(reviewMs > 6 * 24 * 60 * 60 * 1000 && reviewMs < 8 * 24 * 60 * 60 * 1000, "capital_allocation review_after ~7 days")
}

// Decision memory: reinvestment_decision creates a candidate when companyId is provided
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Posso fazer novas compras agora?" }),
    snapshot: snapshot(),
    userQuestion: "Posso fazer novas compras agora?",
    companyId: "co-1",
  })
  assert.ok(response.decisionMemoryCandidates && response.decisionMemoryCandidates.length > 0)
  const candidate = response.decisionMemoryCandidates![0]
  assert.equal(candidate.decisionType, "capital_allocation")
  assert.match(String(candidate.decisionPayload?.decisionKey), /:buy$/)
  assert.ok(candidate.reviewAfter)
}

// Decision memory: audit_traceability does NOT create memory
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Abra o cálculo do reinvestimento" }),
    snapshot: snapshot(),
    userQuestion: "Abra o cálculo do reinvestimento",
    companyId: "co-1",
  })
  assert.equal(response.responseKind, "audit_traceability")
  assert.ok(!response.decisionMemoryCandidates || response.decisionMemoryCandidates.length === 0)
}

// Decision memory: generic response does NOT create memory
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Olá" }),
    snapshot: snapshot(),
    userQuestion: "Olá",
    companyId: "co-1",
  })
  assert.equal(response.responseKind, "generic_executive")
  assert.ok(!response.decisionMemoryCandidates || response.decisionMemoryCandidates.length === 0)
}

// Decision memory: no companyId → no candidates
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" }),
    snapshot: snapshot(),
    userQuestion: "Com R$ 4.000, o que eu compro?",
  })
  assert.ok(!response.decisionMemoryCandidates || response.decisionMemoryCandidates.length === 0)
}

// Memory context: prior open decision shows up as a finding (continuity)
{
  const priorMemory = {
    id: "prev-1",
    companyId: "co-1",
    decisionType: "capital_allocation" as const,
    title: "Comprar com teto",
    recommendation: "Priorizar iPad como produto âncora.",
    reason: "Margem e giro.",
    status: "open" as const,
    priority: "high" as const,
    confidence: "high" as const,
    sourceQuestion: "",
    decisionPayload: { entityLabel: "iPad (11ª geração)" },
    expectedOutcome: {},
    actualOutcome: {},
    resultStatus: "pending" as const,
    reflection: "",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    resolvedAt: null,
    reviewAfter: null,
  }
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" }),
    snapshot: snapshot(),
    userQuestion: "Com R$ 4.000, o que eu compro?",
    companyId: "co-1",
    decisionMemoryContext: { openDecisions: [priorMemory], recentDecisions: [priorMemory] },
  })
  assert.equal(response.responseKind, "business_decision")
  const priorFinding = response.structured?.businessDecision?.keyFindings.find((f) => f.label === "Decisão de capital pendente")
  assert.ok(priorFinding, "must surface prior decision finding with type-specific label")
  assert.match(priorFinding!.evidence, /Continuidade/i)
}

// Decision Memory review: direct tracking question uses only structured decision memory
{
  const openDecision = {
    id: "decision-1",
    companyId: "co-1",
    decisionType: "business_strategy" as const,
    title: "Plano para próximos 15 dias",
    recommendation: "Viabilizar iPad como produto âncora antes de ampliar tráfego.",
    reason: "Margem e giro.",
    status: "open" as const,
    priority: "high" as const,
    confidence: "high" as const,
    sourceQuestion: "",
    decisionPayload: { decisionKey: "ipad-11a-geracao:anchor-product" },
    expectedOutcome: {},
    actualOutcome: {},
    resultStatus: "pending" as const,
    reflection: "",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    resolvedAt: null,
    reviewAfter: "2026-05-27T00:00:00Z",
  }
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Quais decisões você está acompanhando?" }),
    snapshot: snapshot(),
    userQuestion: "Quais decisões você está acompanhando?",
    companyId: "co-1",
    decisionMemoryContext: { openDecisions: [openDecision], recentDecisions: [openDecision] },
  })
  assert.equal(response.responseKind, "decision_memory_review")
  assert.equal(response.renderMode, "structured_cards")
  assert.ok(response.structured?.decisionMemoryReview)
  assert.equal(response.structured.decisionMemoryReview.openDecisions.length, 1)
  assert.equal(response.structured.decisionMemoryReview.openDecisions[0].id, "decision-1")
  assert.equal(response.structured.decisionMemoryReview.openDecisions[0].title, "Plano para próximos 15 dias")
  assert.equal(response.structured.decisionMemoryReview.openDecisions[0].decisionKey, "ipad-11a-geracao:anchor-product")
  assert.equal(response.text.includes("recuperar leads pendentes"), false)
  assert.equal(response.text.includes("Saldo bruto"), false)
}

// Decision Memory review: duplicate decisionKey/status/type renders once, keeping latest
{
  const first = {
    id: "first-a",
    companyId: "co-1",
    decisionType: "operational_action" as const,
    title: "Primeiro movimento de hoje",
    recommendation: "Cotar iPad.",
    reason: "",
    status: "open" as const,
    priority: "high" as const,
    confidence: "low" as const,
    sourceQuestion: "",
    decisionPayload: { decisionKey: "periodo-atual:first-move" },
    expectedOutcome: {},
    actualOutcome: {},
    resultStatus: "pending" as const,
    reflection: "",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    resolvedAt: null,
    reviewAfter: "2026-05-15T00:00:00Z",
  }
  const second = {
    ...first,
    id: "first-b",
    recommendation: "Validar teto seguro.",
    updatedAt: "2026-05-02T00:00:00Z",
  }
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Quais decisões você está acompanhando?" }),
    snapshot: snapshot(),
    userQuestion: "Quais decisões você está acompanhando?",
    companyId: "co-1",
    decisionMemoryContext: { openDecisions: [first, second], recentDecisions: [first, second] },
  })
  const decisions = response.structured?.decisionMemoryReview?.openDecisions || []
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0].id, "first-b")
  assert.equal(decisions[0].recommendation, "Validar teto seguro.")
  assert.equal(response.text.match(/Primeiro movimento de hoje/g)?.length, 1)
  assert.equal(new Set(decisions.map((item) => item.id)).size, decisions.length)
}

// Decision Memory review: semantically equivalent anchor strategies (real payload, no entityLabel) render once
{
  const sameRec = "Primeiro viabilizar iPad (11ª geração); depois montar oferta e só então testar campanha curta."
  const weekStrategy = {
    id: "strategy-week",
    companyId: "co-1",
    decisionType: "business_strategy" as const,
    title: "Plano para esta semana",
    recommendation: sameRec,
    reason: "",
    status: "open" as const,
    priority: "high" as const,
    confidence: "high" as const,
    sourceQuestion: "",
    decisionPayload: { decisionKey: "periodo-atual:anchor-product", subtype: "anchor-product" },
    expectedOutcome: {},
    actualOutcome: {},
    resultStatus: "pending" as const,
    reflection: "",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    resolvedAt: null,
    reviewAfter: "2026-05-08T00:00:00Z",
  }
  const fortnightStrategy = {
    ...weekStrategy,
    id: "strategy-15d",
    title: "Plano para próximos 15 dias",
    decisionPayload: { decisionKey: "proximos-15-dias:anchor-product", subtype: "anchor-product" },
    updatedAt: "2026-05-03T00:00:00Z",
  }
  const operationalAction = {
    id: "action-today",
    companyId: "co-1",
    decisionType: "operational_action" as const,
    title: "Primeiro movimento de hoje",
    recommendation: "Cote iPad (11ª geração) com fornecedor e confirme custo de entrada.",
    reason: "",
    status: "open" as const,
    priority: "high" as const,
    confidence: "low" as const,
    sourceQuestion: "",
    decisionPayload: { decisionKey: "periodo-atual:first-move", subtype: "first-move" },
    expectedOutcome: {},
    actualOutcome: {},
    resultStatus: "pending" as const,
    reflection: "",
    createdAt: "2026-05-02T00:00:00Z",
    updatedAt: "2026-05-02T00:00:00Z",
    resolvedAt: null,
    reviewAfter: null,
  }
  const openDecisions = [weekStrategy, fortnightStrategy, operationalAction]
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Tem alguma decisão sua que eu ainda não executei?" }),
    snapshot: snapshot(),
    userQuestion: "Tem alguma decisão sua que eu ainda não executei?",
    companyId: "co-1",
    decisionMemoryContext: { openDecisions, recentDecisions: openDecisions },
  })
  const decisions = response.structured?.decisionMemoryReview?.openDecisions || []
  assert.equal(response.responseKind, "decision_memory_review")
  assert.equal(decisions.length, 2, "must dedupe equivalent strategies → 1 strategy + 1 operational = 2 total")
  assert.ok(decisions.find((d) => d.id === "strategy-15d"), "must keep the more recent strategy")
  assert.equal(decisions.find((d) => d.id === "strategy-week") !== undefined, false, "must discard older equivalent strategy")
  assert.ok(decisions.find((d) => d.id === "action-today"), "must keep the distinct operational action")
  assert.equal(response.text.match(/Plano para próximos 15 dias/g)?.length, 1)
  assert.equal(response.text.includes("Plano para esta semana"), false)
}

// Audit reinvestimento: structured blocks, no candidato(s), no dot-decimal percent, human header
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Abre pra mim o raciocínio do reinvestimento." }),
    snapshot: snapshot(),
    userQuestion: "Abre pra mim o raciocínio do reinvestimento.",
  })
  assert.equal(response.responseKind, "audit_traceability")
  assert.equal(response.renderMode, "audit_blocks")
  assert.ok(response.text.includes("Rastreabilidade da recompra"), "must use human-friendly header")
  assert.equal(response.text.includes("Reinvestment Intelligence"), false, "must not expose technical label")
  assert.ok(response.text.includes("Base analisada"), "must have Base analisada block")
  assert.ok(response.text.includes("Caixa e recebíveis"), "must have Caixa e recebíveis block")
  assert.ok(response.text.includes("Recompra"), "must have Recompra block")
  assert.ok(response.text.includes("Observação sobre leads"), "must have leads block title")
  // "Observação sobre leads:" must be on its own line so client can render title separately from content
  assert.ok(response.text.includes("Observação sobre leads:\n"), "leads block title must be on its own line")
  assert.equal(response.text.includes("candidato(s)"), false, "must not contain candidato(s)")
  assert.equal(/\d+\.\d+%/.test(response.text), false, "must not contain dot-decimal percent")
}

// Decision Memory review: empty state is short and does not fall back
{
  const response = buildOrionResponse({
    semanticPlan: buildSemanticPlan({ userQuestion: "Que decisões estão abertas?" }),
    snapshot: snapshot(),
    userQuestion: "Que decisões estão abertas?",
    companyId: "co-1",
    decisionMemoryContext: { openDecisions: [], recentDecisions: [] },
  })
  assert.equal(response.responseKind, "decision_memory_review")
  assert.equal(response.text, "Não tenho decisões abertas em acompanhamento agora.")
  assert.equal(response.text.split("\n").length, 1)
}

console.log("orion-response-orchestrator tests passed")
