import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExecutiveConversation,
  buildAllowedFactsFromStructured,
  buildCompactConversationBrief,
  validateConversationFacts,
} from "./orion-executive-conversation-layer.ts"
import { buildSemanticPlan } from "./semantic-planner.ts"
import type { OrionResponsePayload } from "./orion-response-orchestrator.ts"

function fakeStructured(): OrionResponsePayload {
  return {
    responseKind: "business_decision",
    renderMode: "structured_cards",
    text: "",
    semanticPlan: buildSemanticPlan({ userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?" }),
    structured: {
      businessDecision: {
        decisionType: "capital_allocation",
        timeframeLabel: "período atual",
        keyFindings: [
          { label: "Melhor sinal comercial", value: "iPad (11ª geração)", severity: "info", evidence: "Sinal de demanda recente." },
          { label: "Caixa", value: "R$ 10.919", severity: "info", evidence: "Caixa atual mapeado." },
        ],
        recommendation: {
          title: "Comprar com teto",
          action: "Comprar seletivamente iPad (11ª geração), respeitando limite de R$ 4.000.",
          reason: "Margem e giro melhores que alternativas.",
          confidence: "high",
        },
        alternatives: [{ title: "iPhone 15 Pro Max", tradeoff: "Sinal mais fraco; tratar como teste pequeno." }],
        avoid: [{ title: "Apple Pencil", reason: "Complementa venda, mas não deve consumir o capital principal." }],
        nextSteps: [
          { priority: "high", action: "Usar o teto seguro como limite, não o caixa bruto." },
          { priority: "medium", action: "Cotar fornecedor do iPad e comparar com o teto." },
          { priority: "medium", action: "Avaliar iPhone 15 Pro Max só após validar iPad." },
        ],
        usedTools: [],
        caveats: [],
      },
    },
  } as OrionResponsePayload
}

function mockSuccess(answer: Record<string, unknown>) {
  return async () => new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200 })
}

describe("buildExecutiveConversation", () => {
  it("builds a compact conversation brief without serializing full structured response", () => {
    const structured = fakeStructured()
    const brief = buildCompactConversationBrief({
      userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: buildAllowedFactsFromStructured(structured),
    })
    const serialized = JSON.stringify(brief)
    assert.ok(serialized.length < 2500, `brief must stay compact, got ${serialized.length} chars`)
    assert.equal(serialized.includes("structuredResponse"), false)
    assert.equal(serialized.includes("keyFindings"), false)
    assert.equal(serialized.includes("Sinal de demanda recente."), false)
    assert.ok(brief.nextActions.length <= 3)
    assert.ok(brief.caveats.length <= 2)
  })

  it("capital_allocation fallback transforms structured cards into natural executive conversation", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: null,
    })
    assert.equal(conversation.fallbackApplied, true)
    assert.equal(conversation.conversationalAnswer.includes("Comprar com teto. Comprar seletivamente"), false)
    assert.match(conversation.conversationalAnswer, /eu n[aã]o espalharia|eu concentraria/i)
    assert.match(conversation.conversationalAnswer, /iPad/i)
    assert.match(conversation.conversationalAnswer, /teto seguro|caixa bruto/i)
  })

  it("business_strategy fallback talks about sequence instead of opening more fronts", async () => {
    const structured = fakeStructured()
    const decision = structured.structured!.businessDecision!
    const businessDecision = {
      ...decision,
      decisionType: "business_strategy" as const,
      recommendation: {
        ...decision.recommendation,
        title: "Plano para esta semana",
        action: "Primeiro viabilizar iPad; depois montar oferta e só então testar campanha curta.",
      },
    }
    const plan = buildSemanticPlan({ userQuestion: "Me dá uma visão sincera do que eu deveria fazer essa semana." })
    const conversation = await buildExecutiveConversation({
      userQuestion: "Me dá uma visão sincera do que eu deveria fazer essa semana.",
      semanticPlan: plan,
      structuredResponse: { ...structured, semanticPlan: plan, structured: { businessDecision } } as OrionResponsePayload,
      businessDecision,
      allowedFacts: buildAllowedFactsFromStructured(structured),
      apiKey: null,
    })
    assert.match(conversation.conversationalAnswer, /n[aã]o .{0,20}abrir mais frentes/i)
    assert.match(conversation.conversationalAnswer, /sequ[eê]ncia/i)
  })

  it("marketing_strategy fallback mentions short test and risk", async () => {
    const structured = fakeStructured()
    const decision = structured.structured!.businessDecision!
    const businessDecision = {
      ...decision,
      decisionType: "marketing_strategy" as const,
      recommendation: {
        ...decision.recommendation,
        title: "Rodar tráfego curto e seletivo",
        action: "Rodar campanha curta com iPad, limite baixo e checagem de conversão antes de ampliar.",
      },
    }
    const plan = buildSemanticPlan({ userQuestion: "Vale rodar tráfego agora?" })
    const conversation = await buildExecutiveConversation({
      userQuestion: "Vale rodar tráfego agora?",
      semanticPlan: plan,
      structuredResponse: { ...structured, semanticPlan: plan, structured: { businessDecision } } as OrionResponsePayload,
      businessDecision,
      allowedFacts: buildAllowedFactsFromStructured(structured),
      apiKey: null,
    })
    assert.match(conversation.conversationalAnswer, /teste curto/i)
    assert.match(conversation.conversationalAnswer, /risco/i)
  })

  it("business_review fallback answers business health instead of generic focus copy", async () => {
    const structured = fakeStructured()
    const decision = structured.structured!.businessDecision!
    const businessDecision = {
      ...decision,
      decisionType: "generic_business_review" as const,
      keyFindings: [
        { label: "Vendas", value: "4 vendas", severity: "info" as const, evidence: "Receita de R$ 13.600 no mês atual." },
        { label: "Caixa", value: "R$ 10.919", severity: "info" as const, evidence: "Caixa atual mapeado." },
        { label: "Margem/produto", value: "iPad (11ª geração)", severity: "attention" as const, evidence: "Produto precisa ser tratado como âncora, não como aposta ampla." },
      ],
      caveats: ["Sem DRE/despesas/descontos completos, esta leitura não fecha perda financeira total."],
      recommendation: {
        ...decision.recommendation,
        title: "Focar no melhor giro",
        action: "Concentrar energia nos produtos com melhor margem e recorrência.",
      },
    }
    const plan = {
      ...buildSemanticPlan({ userQuestion: "A Nobretech está indo bem?" }),
      primaryGoal: "business_review" as const,
    }
    const conversation = await buildExecutiveConversation({
      userQuestion: "A Nobretech está indo bem?",
      semanticPlan: plan,
      structuredResponse: { ...structured, semanticPlan: plan, structured: { businessDecision } } as OrionResponsePayload,
      businessDecision,
      allowedFacts: buildAllowedFactsFromStructured(structured),
      apiKey: null,
    })
    assert.equal(conversation.fallbackApplied, true)
    assert.equal(conversation.conversationalAnswer.includes("agir com foco"), false)
    assert.match(conversation.conversationalAnswer, /Nobretech|estabilidade|sa[uú]de|sinal de movimento/i)
    assert.match(conversation.conversationalAnswer, /caixa|mix|margem|campanha/i)
  })

  it("returns conversational answer for capital allocation, never starts with technical opener", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Se eu tivesse uns 4 mil pra mexer em estoque, onde você colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: "test-key",
      fetcher: mockSuccess({
        conversationalAnswer: "Vinícius, eu concentraria esse capital no iPad (11ª geração). Margem e giro estão melhores. O iPhone 15 Pro Max entra como teste pequeno, não como prioridade.",
        stance: "direct",
        mainRecommendation: "Cotar iPad primeiro e comparar com o teto seguro.",
        nextActions: ["Cotar o iPad agora", "Validar custo dentro do teto", "Reavaliar iPhone só depois"],
        followUpQuestion: null,
        usedFacts: ["iPad (11ª geração)", "iPhone 15 Pro Max"],
      }),
    })
    assert.equal(conversation.responseKind, "executive_conversation")
    assert.equal(conversation.fallbackApplied, false)
    assert.match(conversation.conversationalAnswer, /Vinícius/)
    assert.ok(!/^(DECIS[ÃA]O|EVID[ÊE]NCIAS|AN[ÁA]LISE|RECOMENDA[ÇC][ÃA]O)\b/i.test(conversation.conversationalAnswer))
    assert.equal(conversation.stance, "direct")
    assert.ok(conversation.nextActions.length > 0)
  })

  it("falls back to structured when LLM cites disallowed monetary value", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Onde colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: "test-key",
      fetcher: mockSuccess({
        conversationalAnswer: "Vinícius, eu colocaria R$ 99.999 no iPad porque é o melhor sinal e tenho R$ 50.000 disponíveis agora.",
        stance: "direct",
        mainRecommendation: "Cotar iPad",
        nextActions: [],
        followUpQuestion: null,
        usedFacts: [],
      }),
    })
    assert.equal(conversation.fallbackApplied, true)
  })

  it("falls back when LLM output too short", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Onde colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: "test-key",
      fetcher: mockSuccess({
        conversationalAnswer: "ok",
        stance: "direct",
        mainRecommendation: null,
        nextActions: [],
        followUpQuestion: null,
        usedFacts: [],
      }),
    })
    assert.equal(conversation.fallbackApplied, true)
  })

  it("falls back when LLM starts with generic opener", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Onde colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: "test-key",
      fetcher: mockSuccess({
        conversationalAnswer: "DECISÃO: alocar capital no iPad para maximizar retorno conforme dados do snapshot.",
        stance: "direct",
        mainRecommendation: null,
        nextActions: [],
        followUpQuestion: null,
        usedFacts: [],
      }),
    })
    assert.equal(conversation.fallbackApplied, true)
  })

  it("falls back when HTTP error", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Onde colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: "test-key",
      fetcher: async () => new Response("oops", { status: 500 }),
    })
    assert.equal(conversation.fallbackApplied, true)
    assert.ok(conversation.conversationalAnswer.length > 0)
    assert.match(conversation.conversationalAnswer, /iPad|capital|Vinícius/i)
  })

  it("falls back on timeout/abort", async () => {
    const structured = fakeStructured()
    const allowed = buildAllowedFactsFromStructured(structured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Onde colocaria?",
      semanticPlan: structured.semanticPlan,
      structuredResponse: structured,
      businessDecision: structured.structured?.businessDecision || null,
      allowedFacts: allowed,
      apiKey: "test-key",
      timeoutMs: 30,
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted")
            err.name = "AbortError"
            reject(err)
          })
        }),
    })
    assert.equal(conversation.fallbackApplied, true)
  })

  it("falls back quickly when conversation model times out through env timeout", async () => {
    const previousTimeout = process.env.ORION_CONVERSATION_TIMEOUT_MS
    process.env.ORION_CONVERSATION_TIMEOUT_MS = "40"
    try {
      const structured = fakeStructured()
      const allowed = buildAllowedFactsFromStructured(structured)
      const started = Date.now()
      const conversation = await buildExecutiveConversation({
        userQuestion: "Onde colocaria?",
        semanticPlan: structured.semanticPlan,
        structuredResponse: structured,
        businessDecision: structured.structured?.businessDecision || null,
        allowedFacts: allowed,
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
      })
      const elapsed = Date.now() - started
      assert.equal(conversation.fallbackApplied, true)
      assert.ok(elapsed < 1000, `expected fallback under 1s, got ${elapsed}ms`)
    } finally {
      if (previousTimeout === undefined) delete process.env.ORION_CONVERSATION_TIMEOUT_MS
      else process.env.ORION_CONVERSATION_TIMEOUT_MS = previousTimeout
    }
  })

  it("uses deterministic fallback directly when ORION_CONVERSATION_FALLBACK_FIRST is true", async () => {
    const previous = process.env.ORION_CONVERSATION_FALLBACK_FIRST
    process.env.ORION_CONVERSATION_FALLBACK_FIRST = "true"
    try {
      const structured = fakeStructured()
      let called = false
      const conversation = await buildExecutiveConversation({
        userQuestion: "Onde colocaria?",
        semanticPlan: structured.semanticPlan,
        structuredResponse: structured,
        businessDecision: structured.structured?.businessDecision || null,
        allowedFacts: buildAllowedFactsFromStructured(structured),
        apiKey: "test-key",
        fetcher: async () => {
          called = true
          return new Response("{}", { status: 200 })
        },
      })
      assert.equal(called, false)
      assert.equal(conversation.fallbackApplied, true)
    } finally {
      if (previous === undefined) delete process.env.ORION_CONVERSATION_FALLBACK_FIRST
      else process.env.ORION_CONVERSATION_FALLBACK_FIRST = previous
    }
  })

  it("can skip conversation model on local semantic route when env is enabled", async () => {
    const previous = process.env.ORION_CONVERSATION_SKIP_ON_LOCAL_ROUTE
    process.env.ORION_CONVERSATION_SKIP_ON_LOCAL_ROUTE = "true"
    try {
      const structured = fakeStructured()
      let called = false
      const plan = { ...structured.semanticPlan, plannerMode: "local_semantic_route" as const }
      const conversation = await buildExecutiveConversation({
        userQuestion: "A Nobretech está indo bem?",
        semanticPlan: plan,
        structuredResponse: { ...structured, semanticPlan: plan } as OrionResponsePayload,
        businessDecision: structured.structured?.businessDecision || null,
        allowedFacts: buildAllowedFactsFromStructured(structured),
        apiKey: "test-key",
        fetcher: async () => {
          called = true
          return new Response("{}", { status: 200 })
        },
      })
      assert.equal(called, false)
      assert.equal(conversation.fallbackApplied, true)
    } finally {
      if (previous === undefined) delete process.env.ORION_CONVERSATION_SKIP_ON_LOCAL_ROUTE
      else process.env.ORION_CONVERSATION_SKIP_ON_LOCAL_ROUTE = previous
    }
  })

  it("decision_memory_review fallback mentions count + first action", async () => {
    const memoryStructured: OrionResponsePayload = {
      responseKind: "decision_memory_review",
      renderMode: "executive_blocks",
      text: "",
      semanticPlan: buildSemanticPlan({ userQuestion: "Que decisões estão abertas?" }),
      structured: {
        decisionMemoryReview: {
          openDecisions: [
            {
              id: "d1",
              decisionType: "business_strategy",
              title: "Viabilizar iPad como produto âncora",
              recommendation: "Cotar fornecedor e validar custo dentro do teto.",
              status: "open",
              priority: "high",
              confidence: "high",
              resultStatus: "pending",
              reviewAfter: null,
              decisionKey: null,
            },
          ],
          caveats: [],
        },
      },
    } as OrionResponsePayload
    const allowed = buildAllowedFactsFromStructured(memoryStructured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Que decisões estão abertas?",
      semanticPlan: memoryStructured.semanticPlan,
      structuredResponse: memoryStructured,
      decisionMemoryReview: memoryStructured.structured?.decisionMemoryReview || null,
      allowedFacts: allowed,
      apiKey: null, // forces fallback
    })
    assert.equal(conversation.fallbackApplied, true)
    assert.match(conversation.conversationalAnswer, /decis[aã]o aberta|decisões abertas/i)
    assert.match(conversation.conversationalAnswer, /iPad/)
    assert.equal(conversation.stance, "diagnostic")
  })

  it("audit_traceability fallback uses audit stance and does not create new recommendation", async () => {
    const auditStructured: OrionResponsePayload = {
      responseKind: "audit_traceability",
      renderMode: "audit_blocks",
      text: "",
      semanticPlan: buildSemanticPlan({ userQuestion: "Abre pra mim o raciocínio do reinvestimento." }),
      structured: { auditBreakdown: { text: "Caixa | Reserva | Teto | Produtos" } },
    } as OrionResponsePayload
    const allowed = buildAllowedFactsFromStructured(auditStructured)
    const conversation = await buildExecutiveConversation({
      userQuestion: "Abre pra mim o raciocínio do reinvestimento.",
      semanticPlan: auditStructured.semanticPlan,
      structuredResponse: auditStructured,
      allowedFacts: allowed,
      apiKey: null,
    })
    assert.equal(conversation.stance, "audit")
    assert.ok(!/eu colocaria|eu rodaria|eu recompraria/i.test(conversation.conversationalAnswer))
    assert.equal(conversation.evidenceMode, "audit_below")
  })

  it("validateConversationFacts allows facts present in allowedFacts and rejects others", () => {
    const allowed = {
      money: ["R$ 4.500", "R$ 10.919"],
      counts: ["2"],
      percentages: ["35%"],
      dates: [],
      productNames: ["iPad (11ª geração)"],
      statuses: [],
    }
    assert.equal(validateConversationFacts("Eu colocaria R$ 4.500 no iPad (11ª geração).", allowed).ok, true)
    assert.equal(validateConversationFacts("Eu colocaria R$ 99.999 no iPad.", allowed).ok, false)
    assert.equal(validateConversationFacts("Você tem 2 decisões abertas.", allowed).ok, true)
  })
})
