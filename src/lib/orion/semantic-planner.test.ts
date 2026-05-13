import assert from "node:assert/strict"
import { buildSemanticPlan, buildSemanticPlanWithAI, parseTimeframe } from "./semantic-planner"

// 1. "Posso reinvestir em estoque agora?" → reinvestment_decision
{
  const plan = buildSemanticPlan({ userQuestion: "Posso reinvestir em estoque agora?" })
  assert.equal(plan.primaryGoal, "reinvestment_decision")
  assert.equal(plan.responseMode, "decision")
  assert.ok(plan.secondaryGoals.includes("reinvestment"))
  assert.ok(plan.secondaryGoals.includes("cash_health"))
  assert.ok(plan.toolsNeeded.includes("reinvestment.decision"))
}

// 2. "Posso fazer novas compras agora?" → purchase_capacity
{
  const plan = buildSemanticPlan({ userQuestion: "Posso fazer novas compras agora?" })
  assert.equal(plan.primaryGoal, "purchase_capacity")
  assert.equal(plan.responseMode, "decision")
  assert.ok(plan.secondaryGoals.includes("reinvestment"))
  assert.ok(plan.secondaryGoals.includes("recommendations"))
  assert.ok(plan.toolsNeeded.includes("sales.marginByProduct"))
}

// 2b. Budgeted purchase allocation
{
  const plan = buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" })
  assert.equal(plan.primaryGoal, "capital_allocation")
  assert.equal(plan.responseMode, "decision")
  assert.equal(plan.budgetAmount, 4000)
  assert.equal(plan.budgetCurrency, "BRL")
  assert.ok(plan.toolsNeeded.includes("reinvestment.decision"))
  assert.ok(plan.toolsNeeded.includes("sales.marginByProduct"))
  assert.ok(plan.toolsNeeded.includes("inventory.availableStock"))
}

// 2c. Natural inventory budget allocation
{
  const plan = buildSemanticPlan({ userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?" })
  assert.equal(plan.primaryGoal, "capital_allocation")
  assert.equal(plan.responseMode, "decision")
  assert.equal(plan.budgetAmount, 4000)
  assert.equal(plan.budgetCurrency, "BRL")
  assert.ok(plan.secondaryGoals.includes("reinvestment"))
  assert.ok(plan.secondaryGoals.includes("inventory"))
  assert.ok(plan.secondaryGoals.includes("recommended_products"))
  assert.ok(plan.toolsNeeded.includes("finance.cashPosition"))
  assert.ok(plan.toolsNeeded.includes("reinvestment.decision"))
  assert.ok(plan.toolsNeeded.includes("sales.marginByProduct"))
  assert.ok(plan.toolsNeeded.includes("inventory.availableStock"))
}

// 3. Compound business review with relative timeframe
{
  const plan = buildSemanticPlan({
    userQuestion: "Queria que você analisasse minha performance de vendas dos últimos 15 dias e me diga quanto realmente lucrei, quais produtos ainda estou preso em estoque e o que você sugere",
  })
  assert.equal(plan.primaryGoal, "business_review")
  assert.equal(plan.responseMode, "executive_summary")
  assert.equal(plan.timeframe.type, "last_n_days")
  assert.equal(plan.timeframe.days, 15)
  assert.match(plan.timeframe.label, /15 dias/i)
  assert.ok(plan.secondaryGoals.includes("realized_profit"))
  assert.ok(plan.secondaryGoals.includes("inventory_stuck"))
  assert.ok(plan.secondaryGoals.includes("recommendations"))
}

// 4. Generic "Como estou hoje?" → cash_health with current period
{
  const plan = buildSemanticPlan({ userQuestion: "Como estou hoje?" })
  assert.equal(plan.primaryGoal, "cash_health")
  assert.equal(plan.timeframe.type, "current_period")
}

// 4b. Forward strategy timeframe
{
  const plan = buildSemanticPlan({ userQuestion: "Qual minha estratégia para os próximos 15 dias?" })
  assert.equal(plan.primaryGoal, "business_strategy")
  assert.equal(plan.responseMode, "operational_plan")
  assert.equal(plan.timeframe.type, "next_n_days")
  assert.equal(plan.timeframe.days, 15)
  assert.ok(plan.toolsNeeded.includes("marketing.campaignPerformance"))
  assert.ok(plan.toolsNeeded.includes("leads.funnelHealth"))
}

// 5. Audit request: "Abra o cálculo do reinvestimento" → audit_traceability
{
  const plan = buildSemanticPlan({ userQuestion: "Abra o cálculo do reinvestimento" })
  assert.equal(plan.primaryGoal, "audit_traceability")
  assert.equal(plan.responseMode, "audit_traceability")
}

// 5b. Semantic audit/rationale requests stay traceable
{
  for (const question of [
    "Abre pra mim o raciocínio do reinvestimento.",
    "Por que você recomendou R$ 5.733?",
    "Como chegou nesse teto de recompra?",
  ]) {
    const plan = buildSemanticPlan({ userQuestion: question })
    assert.equal(plan.primaryGoal, "audit_traceability", question)
    assert.equal(plan.responseMode, "audit_traceability", question)
  }
}

// 6. Empty/unknown question → clarification needed
{
  const plan = buildSemanticPlan({ userQuestion: "" })
  assert.equal(plan.needsClarification, true)
  assert.ok(plan.clarificationQuestion)
}

// 7. Timeframe parser
{
  assert.equal(parseTimeframe("últimos 30 dias").type, "last_n_days")
  assert.equal(parseTimeframe("últimos 30 dias").days, 30)
  assert.equal(parseTimeframe("próximos 15 dias").type, "next_n_days")
  assert.equal(parseTimeframe("próximos 15 dias").days, 15)
  assert.equal(parseTimeframe("90 dias").days, 90)
  assert.equal(parseTimeframe("hoje").type, "current_period")
  assert.equal(parseTimeframe("este mês").type, "current_period")
  assert.equal(parseTimeframe("histórico total").type, "all_available")
  assert.equal(parseTimeframe("posso reinvestir agora?").type, "current_period")
}

// 8. Multi-intent confidence is high
{
  const plan = buildSemanticPlan({
    userQuestion: "Quanto lucrei? Quais produtos estão presos? O que você sugere?",
  })
  assert.equal(plan.primaryGoal, "business_review")
  assert.equal(plan.confidence, "high")
}

// 9. Lead question → lead_review
{
  const plan = buildSemanticPlan({ userQuestion: "Como estão meus leads?" })
  assert.equal(plan.primaryGoal, "lead_review")
}

// 10. Campaign question → campaign_review
{
  const plan = buildSemanticPlan({ userQuestion: "Como está o ROI das campanhas?" })
  assert.equal(plan.primaryGoal, "campaign_review")
}

// 11. Open business questions
{
  const lossPlan = buildSemanticPlan({ userQuestion: "Onde estou perdendo dinheiro?" })
  assert.equal(lossPlan.primaryGoal, "business_review")
  assert.ok(lossPlan.toolsNeeded.includes("sales.marginByProduct"))
  assert.ok(lossPlan.toolsNeeded.includes("inventory.stuckItems"))

  const trafficPlan = buildSemanticPlan({ userQuestion: "Vale rodar tráfego agora?" })
  assert.equal(trafficPlan.primaryGoal, "business_strategy")
  assert.equal(trafficPlan.responseMode, "decision")

  const firstPlan = buildSemanticPlan({ userQuestion: "O que eu deveria fazer primeiro hoje?" })
  assert.equal(firstPlan.primaryGoal, "business_strategy")
  assert.equal(firstPlan.responseMode, "operational_plan")
}

// 12. Decision Memory review questions stay on structured memory path
{
  for (const question of [
    "Quais decisões você está acompanhando?",
    "Que decisões estão abertas?",
    "O que ficou em acompanhamento?",
    "O que você está monitorando?",
    "Quais recomendações estão pendentes?",
    "Mostre suas decisões abertas",
    "O que ficou pendente do que você me recomendou?",
    "Tem alguma coisa que você ainda está monitorando?",
    "Quais recomendações suas ainda estão em aberto?",
    "O que ainda falta eu fazer?",
    "E aquelas ações que você tinha sugerido, tem algo em aberto?",
    "Tem alguma decisão sua que eu ainda não executei?",
  ]) {
    const plan = buildSemanticPlan({ userQuestion: question })
    assert.equal(plan.primaryGoal, "decision_memory_review", question)
    assert.equal(plan.responseMode, "executive_summary", question)
  }
}

async function runAsyncPlannerTests() {
  const aiPlan = await buildSemanticPlanWithAI({
    userQuestion: "E aquelas ações que você tinha sugerido, tem algo em aberto?",
  }, {
    apiKey: "test-key",
    fetcher: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        primaryGoal: "decision_memory_review",
        secondaryGoals: ["open_recommendations", "pending_actions"],
        toolsNeeded: [],
        timeframe: { type: "all_available", days: null, startDate: null, endDate: null, label: "histórico disponível" },
        budgetAmount: null,
        budgetCurrency: null,
        entities: [{ type: "decision", label: "ações sugeridas" }],
        comparisonTargets: [],
        responseMode: "memory_review",
        confidence: "high",
        needsClarification: false,
        clarificationQuestion: null,
        reasoningHints: ["Usuário pediu revisão semântica de recomendações anteriores."],
      }),
    }), { status: 200 }),
  })
  assert.equal(aiPlan.primaryGoal, "decision_memory_review")
  assert.equal(aiPlan.responseMode, "memory_review")
  assert.equal(aiPlan.plannerMode, "ai_semantic_plan")
  assert.equal(aiPlan.entities[0]?.type, "decision")

  const fallbackPlan = await buildSemanticPlanWithAI({
    userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?",
  }, {
    apiKey: "test-key",
    fetcher: async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
  })
  assert.equal(fallbackPlan.primaryGoal, "capital_allocation")
  assert.equal(fallbackPlan.budgetAmount, 4000)
  assert.equal(fallbackPlan.plannerMode, "deterministic_fallback")

  const naturalBudgetAiPlan = await buildSemanticPlanWithAI({
    userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?",
  }, {
    apiKey: "test-key",
    fetcher: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        primaryGoal: "capital_allocation",
        secondaryGoals: ["reinvestment", "inventory", "recommended_products"],
        toolsNeeded: ["finance.cashPosition", "reinvestment.decision", "sales.marginByProduct", "inventory.availableStock"],
        timeframe: { type: "current_period", days: null, startDate: null, endDate: null, label: "período atual" },
        budgetAmount: 4000,
        budgetCurrency: "BRL",
        entities: [{ type: "inventory", label: "estoque" }],
        comparisonTargets: [],
        responseMode: "decision",
        confidence: "high",
        needsClarification: false,
        clarificationQuestion: null,
        reasoningHints: ["Orçamento natural para alocação em estoque."],
      }),
    }), { status: 200 }),
  })
  assert.equal(naturalBudgetAiPlan.primaryGoal, "capital_allocation")
  assert.equal(naturalBudgetAiPlan.budgetAmount, 4000)
  assert.equal(naturalBudgetAiPlan.plannerMode, "ai_semantic_plan")

  const guardedAudit = await buildSemanticPlanWithAI({
    userQuestion: "Abra o cálculo do reinvestimento",
  }, {
    apiKey: "test-key",
    fetcher: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        primaryGoal: "reinvestment_decision",
        secondaryGoals: ["reinvestment"],
        toolsNeeded: ["reinvestment.decision"],
        timeframe: { type: "current_period", days: null, startDate: null, endDate: null, label: "período atual" },
        budgetAmount: null,
        budgetCurrency: null,
        entities: [{ type: "decision", label: "reinvestimento" }],
        comparisonTargets: [],
        responseMode: "operational_plan",
        confidence: "medium",
        needsClarification: false,
        clarificationQuestion: null,
        reasoningHints: [],
      }),
    }), { status: 200 }),
  })
  assert.equal(guardedAudit.primaryGoal, "audit_traceability")
  assert.equal(guardedAudit.responseMode, "audit_traceability")
  assert.equal(guardedAudit.plannerMode, "deterministic_fallback")
}

runAsyncPlannerTests()
  .then(() => console.log("semantic-planner tests passed"))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
