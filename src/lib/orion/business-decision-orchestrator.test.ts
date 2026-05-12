import assert from "node:assert/strict"
import {
  buildDecisionMemoryCandidate,
  buildOrionBusinessDecision,
  decisionSubtypeFromStoredKey,
  decisionSubtypeFor,
  reviewHorizonDaysFor,
  selectRelevantDecisionMemories,
} from "./business-decision-orchestrator"
import type { OrionDecisionMemoryItem } from "./orion-decision-memory-store"
import { buildSemanticPlan } from "./semantic-planner"
import type { OrionSnapshot } from "./types"

function snapshot(): OrionSnapshot {
  return {
    executive: {
      cashBalance: 10000,
      pendingReceivables: 3500,
      pendingPayables: 900,
      leadsOpen: 2,
      leadsWithoutFollowUp: 1,
      liquidityForecast: {
        payables7d: 900,
        payables30d: 1600,
        overduePayables: 0,
        todayPayables: 0,
        nextPayables: [],
        nextReceivables: [
          { id: "r1", label: "D+1", amount: 1500, dueDate: "2026-05-13", daysUntilDue: 1 },
          { id: "r2", label: "D+12", amount: 2000, dueDate: "2026-05-24", daysUntilDue: 12 },
        ],
      },
    },
    finance: {
      reconciledCashBalance: 10000,
      accountCashBalance: 10000,
      availableLiquidity: 10000,
      pendingBalance: 3500,
      staleAccountBalance: false,
      cashBalanceSource: "reconciled_balance_after",
      selectedFinancialPeriod: { preset: "current_month", startDate: "2026-05-01", endDate: "2026-05-12", label: "Maio" },
      profitAvailabilitySnapshot: { period: { preset: "current_month", startDate: "2026-05-01", endDate: "2026-05-12", label: "Maio" }, realizedProfitInPeriod: 2152 },
      currentCashCompositionSnapshot: { consolidatedCash: 10000 },
      workingCapitalSnapshot: { protectedOperationalCapital: 3400 },
    },
    sales: {
      periodPerformance: {
        period: { label: "Maio", startDate: "2026-05-01", endDate: "2026-05-12", source: "current_month" },
        salesCount: 4,
        revenue: 17200,
        netRevenue: 17200,
        profit: 4800,
        marginPct: 27.9,
        includedStatuses: ["completed"],
        excludedStatuses: ["reserved", "cancelled", "canceled", "refunded", "estornado", "void"],
        firstSaleDate: "2026-05-02",
        lastSaleDate: "2026-05-10",
        topProducts: [
          { label: "iPad (11ª geração)", salesCount: 3, revenue: 10500, profit: 2700, marginPct: 25.7 },
          { label: "Apple Watch SE", salesCount: 1, revenue: 3200, profit: 1200, marginPct: 37.5 },
        ],
      },
      reinvestmentAnalysisWindow: {
        label: "Últimos 90 dias",
        startDate: "2026-02-12",
        endDate: "2026-05-12",
        salesCount: 4,
        source: "last_90_days",
      },
      reinvestmentCandidates: [
        {
          label: "iPad (11ª geração)",
          category: "iPad",
          productType: "iPad",
          model: "iPad (11ª geração)",
          recentSalesCount: 4,
          sampleSize: 4,
          totalRevenue: 14000,
          totalProfit: 3600,
          averageTicket: 3500,
          averageProfit: 900,
          averageMarginPct: 25,
          averageDaysInStock: 8,
          probableUnitCost: 2500,
          minRecentCost: 2400,
          currentStockCount: 0,
          currentStockValue: 0,
          stuckStockCount: 0,
          campaignDemandLeads: 8,
          campaignLostLeads: 6,
          activeLeadSignals: 1,
          lostLeadSignals: 6,
          confidence: "high",
        },
        {
          label: "Apple Watch SE",
          category: "Watch",
          productType: "Watch",
          model: "Apple Watch SE",
          recentSalesCount: 1,
          sampleSize: 1,
          totalRevenue: 3200,
          totalProfit: 1200,
          averageTicket: 3200,
          averageProfit: 1200,
          averageMarginPct: 37.5,
          averageDaysInStock: 5,
          probableUnitCost: 2000,
          minRecentCost: 2000,
          currentStockCount: 0,
          currentStockValue: 0,
          stuckStockCount: 0,
          campaignDemandLeads: 0,
          campaignLostLeads: 0,
          activeLeadSignals: 0,
          lostLeadSignals: 0,
          confidence: "low",
        },
        {
          label: "Apple Pencil",
          category: "Acessório",
          productType: "Acessório",
          model: "Apple Pencil",
          recentSalesCount: 1,
          sampleSize: 1,
          totalRevenue: 680,
          totalProfit: 180,
          averageTicket: 680,
          averageProfit: 180,
          averageMarginPct: 26,
          averageDaysInStock: 40,
          probableUnitCost: 500,
          minRecentCost: 500,
          currentStockCount: 1,
          currentStockValue: 500,
          stuckStockCount: 1,
          campaignDemandLeads: 0,
          campaignLostLeads: 0,
          activeLeadSignals: 0,
          lostLeadSignals: 0,
          confidence: "low",
        },
      ],
    },
    stock: {
      availableItems: [{
        id: "s1",
        name: "iPhone 13",
        category: "iPhone",
        color: "preto",
        daysInStock: 12,
        purchasePrice: 2500,
        suggestedPrice: 3300,
        status: "available",
        quantity: 1,
      }],
      stuckItems: [{
        id: "st1",
        name: "Apple Pencil",
        category: "Acessório",
        color: "branco",
        daysInStock: 80,
        purchasePrice: 500,
        suggestedPrice: 680,
        status: "available",
      }],
    },
    marketing: {
      campaigns: [{
        id: "c1",
        name: "iPad Meta",
        channel: "Meta",
        spend: 200,
        revenue: 3500,
        leads: 10,
        sales: 1,
        roi: 17.5,
        lostLeads: 9,
      }],
      forgottenLeads: [
        { id: "l1", name: "Lead perdido", status: "lost", productInterest: "iPad", originalIntent: null, classification: "lost", nextAction: null, nextActionAt: null, daysWithoutAction: 5 },
      ],
    },
  } as unknown as OrionSnapshot
}

function decision(question: string) {
  const semanticPlan = buildSemanticPlan({ userQuestion: question })
  return buildOrionBusinessDecision({
    semanticPlan,
    snapshot: snapshot(),
    userQuestion: question,
  })
}

{
  const result = decision("Com R$ 4.000, o que eu compro?")
  assert.equal(result.decisionType, "capital_allocation")
  assert.ok(result.usedTools.includes("reinvestment.decision"))
  assert.ok(result.usedTools.includes("sales.marginByProduct"))
  assert.ok(result.keyFindings.length <= 5)
  assert.ok(result.nextSteps.length <= 3)
  assert.ok(result.avoid.length <= 3)
  assert.ok(result.recommendation.action.length > 0)
  assert.ok(result.recommendation.action.includes("iPad"))
  assert.equal(result.recommendation.action.includes("Comprar seletivamente Apple Watch SE"), false)
  assert.ok(result.alternatives.some((item) => item.title.includes("Apple Watch SE") && item.tradeoff.includes("cautela")))
  assert.ok(result.avoid.some((item) => item.title === "Apple Pencil"))
}

{
  const result = decision("Qual minha estratégia para os próximos 15 dias?")
  assert.equal(result.decisionType, "business_strategy")
  assert.equal(result.timeframeLabel, "próximos 15 dias")
  assert.ok(result.usedTools.includes("finance.cashPosition"))
  assert.ok(result.usedTools.includes("marketing.campaignPerformance"))
  assert.ok(result.keyFindings.length > 0)
  assert.ok(result.recommendation.title.includes("15 dias"))
  assert.ok(result.nextSteps[0]?.action.includes("Próximos 2-3 dias"))
  assert.ok(result.nextSteps[1]?.action.includes("Próximos 7 dias"))
  assert.ok(result.nextSteps[2]?.action.includes("Próximos 15 dias"))
}

{
  const result = decision("Onde estou perdendo dinheiro?")
  assert.equal(result.decisionType, "generic_business_review")
  assert.ok(result.usedTools.includes("sales.marginByProduct"))
  assert.ok(result.usedTools.includes("inventory.stuckItems"))
  assert.ok(result.caveats.some((caveat) => caveat === "Sem DRE/despesas/descontos completos, esta leitura não fecha perda financeira total; com snapshot atual aponto baixo impacto, margem, estoque e campanha."))
  assert.ok(result.keyFindings.some((finding) => finding.label === "Perda financeira total" && finding.value === "não conclusiva"))
  assert.ok(result.keyFindings.some((finding) => finding.label === "Baixo impacto" && finding.evidence.includes("não perda real")))
}

{
  const result = decision("Vale rodar tráfego agora?")
  assert.equal(result.decisionType, "marketing_strategy")
  assert.ok(result.recommendation.title.length > 0)
  assert.ok(result.recommendation.action.includes("produto âncora") || result.recommendation.action.includes("iPad"))
  assert.ok(result.avoid.some((item) => item.title === "Tráfego sem produto âncora"))
  assert.equal(result.recommendation.title, "Rodar tráfego curto e seletivo")
  assert.ok(result.keyFindings.some((finding) => finding.label === "Funil" && finding.value === "0 oportunidades ativas"))
  assert.ok(result.keyFindings.some((finding) => finding.evidence.includes("não há lead ativo agora")))
}

{
  const result = decision("O que eu deveria fazer primeiro hoje?")
  assert.equal(result.decisionType, "business_strategy")
  assert.ok(result.nextSteps.length <= 3)
  assert.ok(result.recommendation.title.length > 0)
  assert.equal(result.recommendation.title, "Primeiro movimento de hoje")
  assert.ok(result.nextSteps[0]?.action.includes("Cotar"))
}

{
  const emptySnapshot = {
    executive: { liquidityForecast: { nextReceivables: [], nextPayables: [] } },
    finance: {},
    sales: { reinvestmentCandidates: [] },
    stock: { availableItems: [], stuckItems: [] },
    marketing: { campaigns: [], forgottenLeads: [] },
  } as unknown as OrionSnapshot
  const semanticPlan = buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" })
  const result = buildOrionBusinessDecision({ semanticPlan, snapshot: emptySnapshot, userQuestion: "Com R$ 4.000, o que eu compro?" })
  assert.ok(result.caveats.length > 0)
  assert.equal(result.recommendation.confidence, "low")
}

// Sales rendering: commercial sales + traceable profit → separate findings, no glued phrase
{
  const result = decision("Qual minha estratégia para os próximos 15 dias?")
  const salesFinding = result.keyFindings.find((f) => f.label === "Vendas comerciais")
  assert.ok(salesFinding, "must emit Vendas comerciais finding")
  assert.equal(salesFinding!.value, "4 vendas")
  assert.match(salesFinding!.evidence, /Receita de R\$\s*17\.200 no maio/i)
  assert.equal(salesFinding!.evidence.includes("e lucro"), false)
  assert.equal(salesFinding!.evidence.includes("Em Mês"), false)
  assert.equal(salesFinding!.evidence.includes("Em maio"), false)

  // If financial profit exists, separate "Lucro rastreável" finding
  const profitFinding = result.keyFindings.find((f) => f.label === "Lucro rastreável" || f.label === "Lucro comercial")
  assert.ok(profitFinding, "must emit profit finding separately")
  assert.match(profitFinding!.value || "", /R\$/)
  // Evidence must not duplicate the divergence caveat
  assert.equal(profitFinding!.evidence.includes("divergir"), false)
  assert.equal(profitFinding!.evidence.includes("conciliação"), false)
}

// Same render rule applies to "Onde estou perdendo dinheiro?" (business review path)
{
  const result = decision("Onde estou perdendo dinheiro?")
  const salesFinding = result.keyFindings.find((f) => f.label === "Vendas comerciais")
  assert.ok(salesFinding, "review path must emit Vendas comerciais")
  assert.match(salesFinding!.evidence, /Receita de R\$/)
  assert.equal(salesFinding!.evidence.includes("e lucro rastreável"), false)
  assert.equal(salesFinding!.evidence.includes("Em Mês atual"), false)
  // No glued sales+profit anywhere
  for (const finding of result.keyFindings) {
    assert.equal(/Receita .* e lucro rastreável/i.test(finding.evidence), false)
  }
}

// Lead caveat must use human language, not internal snapshot terminology
{
  const result = decision("Vale rodar tráfego agora?")
  assert.equal(result.caveats.some((c) => c.includes("Sem leads detalhados")), false)
}

// Review horizon per decision_type is deterministic
{
  assert.equal(reviewHorizonDaysFor("capital_allocation"), 7)
  assert.equal(reviewHorizonDaysFor("marketing_strategy"), 5)
  assert.equal(reviewHorizonDaysFor("business_strategy"), 15)
  assert.equal(reviewHorizonDaysFor("inventory_priority"), 14)
  assert.equal(reviewHorizonDaysFor("cash_health"), 7)
  assert.equal(reviewHorizonDaysFor("sales_performance"), 14)
  assert.equal(reviewHorizonDaysFor("operational_action"), 3)
}

// Subtype derivation: capital_allocation buy vs hold
{
  const buy = decision("Com R$ 4.000, o que eu compro?")
  const buyCandidate = buildDecisionMemoryCandidate(buy, "Com R$ 4.000, o que eu compro?")
  assert.ok(buyCandidate)
  assert.equal(buyCandidate!.decisionType, "capital_allocation")
  assert.equal(buyCandidate!.decisionPayload.subtype, "buy")
  assert.match(String(buyCandidate!.decisionPayload.decisionKey), /^ipad.*:buy$/)
}

// Subtype derivation: marketing_strategy traffic-test / traffic-pause
{
  const traffic = decision("Vale rodar tráfego agora?")
  const candidate = buildDecisionMemoryCandidate(traffic, "Vale rodar tráfego agora?")
  assert.ok(candidate)
  assert.equal(candidate!.decisionType, "marketing_strategy")
  assert.match(String(candidate!.decisionPayload.subtype), /traffic-(test|pause)/)
  assert.match(String(candidate!.decisionPayload.decisionKey), /:traffic-(test|pause)$/)
}

// Subtype derivation: business_strategy → anchor-product / first-move
{
  const fifteenDays = decision("Qual minha estratégia para os próximos 15 dias?")
  const candidate = buildDecisionMemoryCandidate(fifteenDays, "Qual minha estratégia para os próximos 15 dias?")
  assert.ok(candidate)
  assert.equal(candidate!.decisionType, "business_strategy")
  assert.equal(candidate!.decisionPayload.subtype, "anchor-product")
}

{
  const today = decision("O que eu deveria fazer primeiro hoje?")
  const candidate = buildDecisionMemoryCandidate(today, "O que eu deveria fazer primeiro hoje?")
  assert.ok(candidate)
  // first-move/act subtypes get remapped to operational_action so the label
  // and relevance ranking treat them as operational, not strategic.
  assert.equal(candidate!.decisionType, "operational_action")
  assert.equal(candidate!.decisionPayload.subtype, "first-move")
}

// reviewAfter is set by candidate builder using horizon table
{
  const now = new Date("2026-05-12T00:00:00.000Z")
  const buy = decision("Com R$ 4.000, o que eu compro?")
  const candidate = buildDecisionMemoryCandidate(buy, "Com R$ 4.000, o que eu compro?", { now })
  assert.ok(candidate)
  const expected = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  assert.equal(candidate!.reviewAfter, expected)
}

// Pure subtype helper coverage for cash_health / sales_performance / operational_action
{
  const stub = {
    decisionType: "cash_health" as const,
    timeframeLabel: "hoje",
    keyFindings: [],
    recommendation: { title: "Preservar caixa", action: "x", reason: "y", confidence: "medium" as const },
    alternatives: [],
    avoid: [],
    nextSteps: [],
    usedTools: [],
    caveats: [],
  }
  assert.equal(decisionSubtypeFor("cash_health", stub, null), "preserve")
  assert.equal(decisionSubtypeFor("sales_performance", { ...stub, decisionType: "sales_performance" }, null), "review")
  assert.equal(decisionSubtypeFor("operational_action", { ...stub, decisionType: "sales_performance" }, null), "act")
  assert.equal(decisionSubtypeFromStoredKey("ipad-11a-geracao:first-move"), "first-move")
  assert.equal(decisionSubtypeFromStoredKey("periodo-atual:act"), "act")
}

// === Decision memory ranking ===
function memItem(overrides: Partial<OrionDecisionMemoryItem>): OrionDecisionMemoryItem {
  const base: OrionDecisionMemoryItem = {
    id: "mem-x",
    companyId: "co-1",
    decisionType: "business_strategy",
    title: "Plano para próximos 15 dias",
    recommendation: "Primeiro viabilizar iPad...",
    reason: "",
    status: "open",
    priority: "high",
    confidence: "high",
    sourceQuestion: "",
    decisionPayload: { subtype: "anchor-product", timeframeLabel: "próximos 15 dias", entityLabel: "iPad (11ª geração)" },
    expectedOutcome: {},
    actualOutcome: {},
    resultStatus: "pending",
    reflection: "",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    resolvedAt: null,
    reviewAfter: null,
  }
  return { ...base, ...overrides, decisionPayload: { ...base.decisionPayload, ...(overrides.decisionPayload || {}) } }
}

// 1. business_strategy 15d + estratégia 15d + first-move → seleciona estratégia, não first-move
{
  const strategic = memItem({
    id: "mem-strategy",
    title: "Plano para próximos 15 dias",
    decisionPayload: { subtype: "anchor-product", timeframeLabel: "próximos 15 dias" },
    updatedAt: "2026-05-01T00:00:00Z",
  })
  const firstMove = memItem({
    id: "mem-first",
    title: "Primeiro movimento de hoje",
    decisionPayload: { subtype: "first-move", timeframeLabel: "hoje" },
    updatedAt: "2026-05-12T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Qual minha estratégia para os próximos 15 dias?" })
  const ranked = selectRelevantDecisionMemories(plan, [firstMove, strategic], "business_strategy", 2)
  assert.equal(ranked[0].id, "mem-strategy", "must pick strategic 15d, not newer first-move")
}

// 2. Pergunta "O que eu deveria fazer primeiro hoje?" → seleciona first-move, mas mantém estratégia como secundário
{
  const strategic = memItem({
    id: "mem-strategy",
    title: "Plano para próximos 15 dias",
    decisionPayload: { subtype: "anchor-product", timeframeLabel: "próximos 15 dias" },
  })
  const firstMove = memItem({
    id: "mem-first",
    title: "Primeiro movimento de hoje",
    decisionPayload: { subtype: "first-move", timeframeLabel: "hoje" },
  })
  const plan = buildSemanticPlan({ userQuestion: "O que eu deveria fazer primeiro hoje?" })
  const ranked = selectRelevantDecisionMemories(plan, [strategic, firstMove], "business_strategy", 2)
  assert.equal(ranked[0].id, "mem-first", "must pick first-move for today question")
}

// 3. capital_allocation prioriza capital_allocation antes de business_strategy
{
  const capital = memItem({
    id: "mem-capital",
    decisionType: "capital_allocation",
    title: "Comprar com teto",
    decisionPayload: { subtype: "buy", entityLabel: "iPad (11ª geração)" },
    updatedAt: "2026-04-30T00:00:00Z",
  })
  const strategy = memItem({
    id: "mem-strategy",
    decisionType: "business_strategy",
    decisionPayload: { subtype: "anchor-product" },
    updatedAt: "2026-05-10T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" })
  const ranked = selectRelevantDecisionMemories(plan, [strategy, capital], "capital_allocation", 2)
  assert.equal(ranked[0].id, "mem-capital", "capital_allocation must win even when older")
}

// 4. marketing_strategy prioriza marketing_strategy antes de business_strategy
{
  const marketing = memItem({
    id: "mem-marketing",
    decisionType: "marketing_strategy",
    title: "Rodar tráfego curto e seletivo",
    decisionPayload: { subtype: "traffic-test", entityLabel: "iPad (11ª geração)" },
    updatedAt: "2026-04-30T00:00:00Z",
  })
  const strategy = memItem({
    id: "mem-strategy",
    decisionType: "business_strategy",
    decisionPayload: { subtype: "anchor-product" },
    updatedAt: "2026-05-10T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Vale rodar tráfego agora?" })
  const ranked = selectRelevantDecisionMemories(plan, [strategy, marketing], "marketing_strategy", 2)
  assert.equal(ranked[0].id, "mem-marketing")
}

// 5. Recência NÃO vence relevância quando os tipos divergem
{
  const oldCapital = memItem({
    id: "mem-old-capital",
    decisionType: "capital_allocation",
    decisionPayload: { subtype: "buy", entityLabel: "iPad (11ª geração)" },
    updatedAt: "2026-01-01T00:00:00Z",
  })
  const newCashHealth = memItem({
    id: "mem-cash",
    decisionType: "cash_health",
    decisionPayload: { subtype: "preserve" },
    updatedAt: "2026-05-12T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" })
  const ranked = selectRelevantDecisionMemories(plan, [newCashHealth, oldCapital], "capital_allocation", 2)
  assert.equal(ranked[0].id, "mem-old-capital", "older capital_allocation beats newer unrelated type")
}

// 5b. Memória antiga first-move com tipo errado renderiza como "Ação operacional pendente"
{
  const firstMove = memItem({
    id: "mem-first",
    decisionType: "business_strategy",
    title: "Primeiro movimento de hoje",
    recommendation: "Cote iPad e valide se cabe no teto seguro.",
    decisionPayload: { decisionKey: "ipad-11a-geracao:first-move", timeframeLabel: "hoje" },
  })
  const plan = buildSemanticPlan({ userQuestion: "O que eu deveria fazer primeiro hoje?" })
  const result = buildOrionBusinessDecision({
    semanticPlan: plan,
    snapshot: snapshot(),
    userQuestion: "O que eu deveria fazer primeiro hoje?",
    decisionMemoryContext: { openDecisions: [firstMove], recentDecisions: [firstMove] },
  })
  const operationalFinding = result.keyFindings.find((f) => f.label === "Ação operacional pendente")
  assert.ok(operationalFinding, "must label first-move memory as 'Ação operacional pendente'")
  assert.equal(result.keyFindings.some((f) => f.label === "Decisão estratégica pendente"), false)
}

// 5c. capital_allocation com capital + business_strategy + first-move antiga → escolhe capital_allocation primária
{
  const firstMove = memItem({
    id: "mem-first",
    decisionType: "business_strategy",
    title: "Primeiro movimento de hoje",
    decisionPayload: { decisionKey: "ipad-11a-geracao:first-move", timeframeLabel: "hoje", entityLabel: "iPad (11ª geração)" },
    updatedAt: "2026-05-12T00:00:00Z",
  })
  const businessStrategy = memItem({
    id: "mem-strategy",
    decisionType: "business_strategy",
    title: "Plano para próximos 15 dias",
    decisionPayload: { subtype: "anchor-product" },
    updatedAt: "2026-05-05T00:00:00Z",
  })
  const capital = memItem({
    id: "mem-capital",
    decisionType: "capital_allocation",
    title: "Comprar com teto",
    decisionPayload: { subtype: "buy", entityLabel: "iPad (11ª geração)" },
    updatedAt: "2026-04-30T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" })
  const result = buildOrionBusinessDecision({
    semanticPlan: plan,
    snapshot: snapshot(),
    userQuestion: "Com R$ 4.000, o que eu compro?",
    decisionMemoryContext: { openDecisions: [firstMove, businessStrategy, capital], recentDecisions: [] },
  })
  const primary = result.keyFindings.find((f) =>
    f.label === "Decisão de capital pendente" ||
    f.label === "Decisão estratégica pendente" ||
    f.label === "Ação operacional pendente"
  )
  assert.ok(primary)
  assert.equal(primary!.label, "Decisão de capital pendente", "capital_allocation must beat business_strategy + first-move")
  assert.equal(result.keyFindings.some((f) => f.label === "Ação operacional pendente"), false, "first-move must not appear as primary for capital allocation")
}

// 5d. capital_allocation sem capital → business_strategy primária; first-move antiga não vira primária
{
  const firstMove = memItem({
    id: "mem-first",
    decisionType: "business_strategy",
    title: "Primeiro movimento de hoje",
    decisionPayload: { decisionKey: "ipad-11a-geracao:first-move", timeframeLabel: "hoje", entityLabel: "iPad (11ª geração)" },
    updatedAt: "2026-05-12T00:00:00Z",
  })
  const businessStrategy = memItem({
    id: "mem-strategy",
    decisionType: "business_strategy",
    title: "Plano para próximos 15 dias",
    decisionPayload: { subtype: "anchor-product" },
    updatedAt: "2026-05-05T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Com R$ 4.000, o que eu compro?" })
  const result = buildOrionBusinessDecision({
    semanticPlan: plan,
    snapshot: snapshot(),
    userQuestion: "Com R$ 4.000, o que eu compro?",
    decisionMemoryContext: { openDecisions: [firstMove, businessStrategy], recentDecisions: [] },
  })
  const strategicFinding = result.keyFindings.find((f) => f.label === "Decisão estratégica pendente")
  const operationalFinding = result.keyFindings.find((f) => f.label === "Ação operacional pendente")
  assert.ok(strategicFinding, "business_strategy must become the primary prior finding")
  assert.equal(operationalFinding, undefined, "operational first-move must not be primary for capital allocation")
}

// 6. Estratégia 15d renderiza como "Decisão estratégica pendente" — não como first-move
{
  const strategic = memItem({
    id: "mem-strategy",
    title: "Plano para próximos 15 dias",
    decisionPayload: { subtype: "anchor-product", timeframeLabel: "próximos 15 dias" },
    updatedAt: "2026-05-01T00:00:00Z",
  })
  const firstMove = memItem({
    id: "mem-first",
    title: "Primeiro movimento de hoje",
    decisionPayload: { subtype: "first-move", timeframeLabel: "hoje" },
    updatedAt: "2026-05-12T00:00:00Z",
  })
  const plan = buildSemanticPlan({ userQuestion: "Qual minha estratégia para os próximos 15 dias?" })
  const result = buildOrionBusinessDecision({
    semanticPlan: plan,
    snapshot: snapshot(),
    userQuestion: "Qual minha estratégia para os próximos 15 dias?",
    decisionMemoryContext: { openDecisions: [firstMove, strategic], recentDecisions: [firstMove, strategic] },
  })
  const priorFinding = result.keyFindings.find((f) => f.label === "Decisão estratégica pendente")
  assert.ok(priorFinding, "must render strategic memory finding label")
  assert.ok(priorFinding!.value!.includes("15 dias"))
  // Operational first-move must not be the primary prior finding for a 15d question
  assert.equal(result.keyFindings.some((f) => f.label === "Ação operacional pendente"), false)
}

// 7. Continuidade de recomendação não deixa ponto duplo
{
  const firstMove = memItem({
    id: "mem-first",
    decisionType: "business_strategy",
    title: "Primeiro movimento de hoje",
    recommendation: "Rodar tráfego curto.",
    decisionPayload: { decisionKey: "ipad-11a-geracao:first-move", timeframeLabel: "hoje" },
  })
  const plan = buildSemanticPlan({ userQuestion: "O que eu deveria fazer primeiro hoje?" })
  const result = buildOrionBusinessDecision({
    semanticPlan: plan,
    snapshot: snapshot(),
    userQuestion: "O que eu deveria fazer primeiro hoje?",
    decisionMemoryContext: { openDecisions: [firstMove], recentDecisions: [firstMove] },
  })
  const operationalFinding = result.keyFindings.find((f) => f.label === "Ação operacional pendente")
  assert.ok(operationalFinding)
  assert.equal(operationalFinding!.evidence.endsWith("curto.."), false)
  assert.equal(operationalFinding!.evidence.endsWith("curto."), true)
}

console.log("business-decision-orchestrator tests passed")
