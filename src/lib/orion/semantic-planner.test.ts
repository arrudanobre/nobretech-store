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
  // Fast path: decision memory review — AI never called.
  let fetcherCalls = 0
  const failingFetcher = async () => {
    fetcherCalls++
    return new Response("should not be called", { status: 500 })
  }
  const mockRoute = (route: Record<string, unknown>) => async (_url: string | URL | Request, init?: RequestInit) => {
    fetcherCalls++
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    const input = JSON.parse(String(body.input || "{}")) as Record<string, unknown>
    assert.ok(!("snapshot" in input), "semantic router must not receive snapshot")
    assert.ok(!("cards" in input), "semantic router must not receive cards")
    assert.ok(!("financialPayload" in input), "semantic router must not receive financial payload")
    return new Response(JSON.stringify({ output_text: JSON.stringify(route) }), { status: 200 })
  }

  const memoryReviewPlan = await buildSemanticPlanWithAI({
    userQuestion: "E aquelas ações que você tinha sugerido, tem algo em aberto?",
  }, { apiKey: "test-key", fetcher: failingFetcher })
  assert.equal(memoryReviewPlan.primaryGoal, "decision_memory_review")
  assert.equal(memoryReviewPlan.plannerMode, "deterministic_fast_path")
  assert.equal(fetcherCalls, 0, "fast path must not call AI fetcher")

  // Fast path: budgeted capital allocation — AI never called.
  const capitalAllocationPlan = await buildSemanticPlanWithAI({
    userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?",
  }, { apiKey: "test-key", fetcher: failingFetcher })
  assert.equal(capitalAllocationPlan.primaryGoal, "capital_allocation")
  assert.equal(capitalAllocationPlan.budgetAmount, 4000)
  assert.equal(capitalAllocationPlan.budgetCurrency, "BRL")
  assert.equal(capitalAllocationPlan.plannerMode, "deterministic_fast_path")
  assert.equal(fetcherCalls, 0, "fast path must not call AI fetcher")

  // Fast path: audit traceability — AI never called.
  const auditPlan = await buildSemanticPlanWithAI({
    userQuestion: "Abre pra mim o raciocínio do reinvestimento.",
  }, { apiKey: "test-key", fetcher: failingFetcher })
  assert.equal(auditPlan.primaryGoal, "audit_traceability")
  assert.equal(auditPlan.responseMode, "audit_traceability")
  assert.equal(auditPlan.plannerMode, "deterministic_fast_path")
  assert.equal(fetcherCalls, 0, "fast path must not call AI fetcher")

  // Clear macro-domain questions use the local semantic route; AI fetcher is not called.
  fetcherCalls = 0
  let routerSource: string | null = null
  const todayPlan = await buildSemanticPlanWithAI({
    userQuestion: "Oi. O que devemos fazer hoje?",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
    onSemanticRouter: (meta) => { routerSource = meta.source },
  })
  assert.equal(todayPlan.primaryGoal, "operational_action")
  assert.equal(todayPlan.plannerMode, "local_semantic_route")
  assert.equal(todayPlan.responseMode, "operational_plan")
  assert.equal(todayPlan.timeframe.type, "today")
  assert.equal(fetcherCalls, 0)
  assert.equal(routerSource, "local")

  fetcherCalls = 0
  const lostPlan = await buildSemanticPlanWithAI({
    userQuestion: "Estou meio perdido hoje",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
  })
  assert.equal(lostPlan.primaryGoal, "operational_action")
  assert.equal(lostPlan.plannerMode, "local_semantic_route")
  assert.equal(fetcherCalls, 0)

  fetcherCalls = 0
  const ownerPlan = await buildSemanticPlanWithAI({
    userQuestion: "O que você faria se estivesse no meu lugar?",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
  })
  assert.equal(ownerPlan.primaryGoal, "business_strategy")
  assert.equal(ownerPlan.plannerMode, "local_semantic_route")
  assert.notEqual(ownerPlan.timeframe.type, "today")
  assert.equal(fetcherCalls, 0)

  fetcherCalls = 0
  const blindSpotPlan = await buildSemanticPlanWithAI({
    userQuestion: "Tem algo que eu não estou vendo?",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
  })
  assert.equal(blindSpotPlan.primaryGoal, "business_strategy")
  assert.equal(blindSpotPlan.plannerMode, "local_semantic_route")
  assert.equal(fetcherCalls, 0)

  fetcherCalls = 0
  const companyHealthPlan = await buildSemanticPlanWithAI({
    userQuestion: "A Nobretech está indo bem?",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
  })
  assert.equal(companyHealthPlan.primaryGoal, "business_review")
  assert.equal(companyHealthPlan.plannerMode, "local_semantic_route")
  assert.equal(fetcherCalls, 0)

  // Weekly strategy question uses local macro routing now, not the remote semantic router.
  fetcherCalls = 0
  const weeklyStrategyPlan = await buildSemanticPlanWithAI({
    userQuestion: "Me dá uma visão sincera do que eu deveria fazer essa semana.",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
  })
  assert.equal(weeklyStrategyPlan.primaryGoal, "business_strategy")
  assert.equal(weeklyStrategyPlan.plannerMode, "local_semantic_route")
  assert.equal(weeklyStrategyPlan.timeframe.type, "next_n_days")
  assert.equal(weeklyStrategyPlan.timeframe.days, 7)
  assert.match(weeklyStrategyPlan.timeframe.label, /semana/i)
  assert.equal(fetcherCalls, 0, "weekly strategy should not call remote semantic router")

  // Forward plan question also uses local macro routing.
  fetcherCalls = 0
  const forwardPlan = await buildSemanticPlanWithAI({
    userQuestion: "Qual meu plano para os próximos dias?",
  }, {
    apiKey: "test-key",
    fetcher: failingFetcher,
  })
  assert.equal(forwardPlan.primaryGoal, "business_strategy")
  assert.equal(forwardPlan.plannerMode, "local_semantic_route")
  assert.equal(fetcherCalls, 0, "forward plan should not call remote semantic router")

  // Ambiguous question — AI is called (and used when confidence is high).
  fetcherCalls = 0
  const ambiguousPlan = await buildSemanticPlanWithAI({
    userQuestion: "Me dá uma leitura sincera do cenário",
  }, {
    apiKey: "test-key",
    fetcher: mockRoute({
        intent: "business_review",
        confidence: "high",
        timeframe: { type: "unknown", days: null, label: null },
        budgetAmount: null,
        entities: [],
        toolsNeeded: ["sales.performance"],
        reasoning: "Pergunta pede leitura ampla do negócio.",
      }),
  })
  assert.equal(ambiguousPlan.plannerMode, "ai_semantic_plan")
  assert.equal(ambiguousPlan.primaryGoal, "business_review")

  // Natural management question with clear macro intent stays local and does not call failed router.
  fetcherCalls = 0
  const ambiguousFallback = await buildSemanticPlanWithAI({
    userQuestion: "Qual é o movimento mais inteligente agora?",
  }, {
    apiKey: "test-key",
    fetcher: async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
  })
  assert.equal(ambiguousFallback.plannerMode, "local_semantic_route")
  assert.notEqual(ambiguousFallback.primaryGoal, "unknown")
  assert.ok(ambiguousFallback.primaryGoal === "operational_action" || ambiguousFallback.primaryGoal === "business_strategy")
  assert.equal(fetcherCalls, 0)

  const businessHealthFallback = await buildSemanticPlanWithAI({
    userQuestion: "A Nobretech está indo bem?",
  }, {
    apiKey: "test-key",
    fetcher: async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
  })
  assert.equal(businessHealthFallback.plannerMode, "local_semantic_route")
  assert.equal(businessHealthFallback.primaryGoal, "business_review")

  const previousRouterTimeout = process.env.ORION_SEMANTIC_ROUTER_TIMEOUT_MS
  process.env.ORION_SEMANTIC_ROUTER_TIMEOUT_MS = "30"
  try {
    const timeoutFallback = await buildSemanticPlanWithAI({
      userQuestion: "Qual é a leitura do cenário da Nobretech?",
    }, {
      apiKey: "test-key",
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted")
            err.name = "AbortError"
            reject(err)
          })
        }),
      onSemanticRouter: (meta) => {
        assert.equal(meta.source, "ai")
        assert.equal(meta.timeout, true)
        assert.equal(meta.fallback, true)
      },
    })
    assert.equal(timeoutFallback.plannerMode, "deterministic_fallback")
    assert.equal(timeoutFallback.primaryGoal, "business_strategy")
  } finally {
    if (previousRouterTimeout === undefined) delete process.env.ORION_SEMANTIC_ROUTER_TIMEOUT_MS
    else process.env.ORION_SEMANTIC_ROUTER_TIMEOUT_MS = previousRouterTimeout
  }
}

runAsyncPlannerTests()
  .then(() => console.log("semantic-planner tests passed"))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
