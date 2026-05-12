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

console.log("orion-response-orchestrator tests passed")
