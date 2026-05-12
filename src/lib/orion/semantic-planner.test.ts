import assert from "node:assert/strict"
import { buildSemanticPlan, parseTimeframe } from "./semantic-planner"

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

console.log("semantic-planner tests passed")
