import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildExecutiveVoice, type ExecutiveVoiceContext } from "./orion-executive-voice-layer.ts"

const FORBIDDEN_OPENERS = [
  /^aloca[cç][aã]o de capital definida/i,
  /^leitura estrat[eé]gica pronta/i,
  /^decis[aã]o pronta/i,
  /^an[aá]lise conclu[ií]da/i,
]

function assertNotGenericOpener(headline: string, ctx: string) {
  for (const re of FORBIDDEN_OPENERS) {
    assert.ok(!re.test(headline), `headline starts with forbidden opener (${ctx}): ${headline}`)
  }
}

describe("buildExecutiveVoice — context-aware openings", () => {
  it("capital_allocation: mentions main product and caution/cap, no forbidden opener", () => {
    const ctx: ExecutiveVoiceContext = {
      recommendationTitle: "Capital alocado no iPad com teto seguro",
      recommendationAction: "Priorizar iPad como produto âncora dentro do teto seguro.",
      topProductLabel: "iPad",
      firstNextStep: "Cotar fornecedor do iPad e validar custo dentro do teto.",
      primaryAvoid: "Comprar acima do teto seguro de recompra.",
    }
    const voice = buildExecutiveVoice({
      responseKind: "business_decision",
      businessDecisionType: "capital_allocation",
      seed: "co-1",
      context: ctx,
    })
    assertNotGenericOpener(voice.headline, "capital_allocation")
    assert.match(voice.headline, /iPad/i, "headline should mention top product")
    assert.match(voice.headline, /teto|cautela/i, "headline should mention cap or caution")
    assert.equal(voice.badge, "Capital")
  })

  it("business_strategy: no forbidden opener and reflects real focus", () => {
    const ctx: ExecutiveVoiceContext = {
      recommendationTitle: "Esta semana é sobre viabilizar o iPad como produto âncora",
      recommendationAction: "Cotar fornecedor, montar oferta e testar tráfego curto depois.",
      topProductLabel: "iPad",
      firstNextStep: "Próximos 2-3 dias: cotar e viabilizar iPad como produto âncora.",
    }
    const voice = buildExecutiveVoice({
      responseKind: "business_decision",
      businessDecisionType: "business_strategy",
      seed: "co-1",
      context: ctx,
    })
    assertNotGenericOpener(voice.headline, "business_strategy")
    assert.ok(voice.headline.length > 0)
    assert.ok(voice.subline.length > 0)
    assert.equal(voice.badge, "Estratégia")
  })

  it("marketing_strategy: mentions short test/risk/anchor product", () => {
    const ctx: ExecutiveVoiceContext = {
      recommendationTitle: "Tráfego só com produto âncora travado",
      recommendationAction: "Rodar teste curto apenas se houver lead ativo.",
      topProductLabel: "iPad",
      primaryAvoid: "Queimar verba sem oferta clara.",
    }
    const voice = buildExecutiveVoice({
      responseKind: "business_decision",
      businessDecisionType: "marketing_strategy",
      seed: "co-1",
      context: ctx,
    })
    assertNotGenericOpener(voice.headline, "marketing_strategy")
    assert.match(voice.headline + " " + voice.subline, /teste curto|tráfego|âncora/i)
    assert.equal(voice.badge, "Marketing")
  })

  it("operational_action: headline reflects first action", () => {
    const ctx: ExecutiveVoiceContext = {
      recommendationTitle: "Foco do dia: viabilizar iPad",
      recommendationAction: "Cotar fornecedor do iPad antes de qualquer outro movimento.",
      firstNextStep: "Cotar fornecedor do iPad antes de qualquer outro movimento.",
      topProductLabel: "iPad",
    }
    const voice = buildExecutiveVoice({
      responseKind: "business_decision",
      businessDecisionType: "operational_action",
      seed: "co-1",
      context: ctx,
    })
    assertNotGenericOpener(voice.headline, "operational_action")
    assert.match(voice.headline + " " + voice.subline, /cotar|fornecedor|iPad/i)
    assert.equal(voice.badge, "Operação")
  })

  it("decision_memory_review: mentions count and primary action", () => {
    const ctx: ExecutiveVoiceContext = {
      openDecisionsCount: 2,
      primaryOpenDecisionTitle: "Viabilizar iPad como produto âncora",
      primaryOpenDecisionRecommendation: "Cotar fornecedor e validar custo dentro do teto.",
    }
    const voice = buildExecutiveVoice({
      responseKind: "decision_memory_review",
      seed: "co-1",
      context: ctx,
    })
    assert.match(voice.headline, /2/, "headline should mention count")
    assert.match(voice.headline, /decis[oõ]es? abertas?/i)
    assert.match(voice.subline, /Cotar/, "subline should reference immediate action")
    assert.equal(voice.badge, "Memória")
  })

  it("decision_memory_review with zero open decisions: closes positively", () => {
    const voice = buildExecutiveVoice({
      responseKind: "decision_memory_review",
      seed: "co-1",
      context: { openDecisionsCount: 0 },
    })
    assert.match(voice.headline, /nada aberto|fechado/i)
    assert.equal(voice.badge, "Memória")
  })

  it("audit_traceability: uses traceability language and does not invent recommendation", () => {
    const voice = buildExecutiveVoice({
      responseKind: "audit_traceability",
      seed: "co-1",
    })
    assert.match(voice.headline + " " + voice.subline, /rastreabilidade|cálculo|caixa|teto/i)
    assert.equal(voice.badge, "Auditoria")
    assert.ok(!/recomendo agora|eu colocaria|eu rodaria/i.test(voice.headline + " " + voice.subline), "audit must not create a new recommendation")
  })

  it("guardrail: no invented currency or large numbers leak into headline", () => {
    const ctx: ExecutiveVoiceContext = {
      recommendationTitle: "Capital alocado no iPad com teto de R$ 4.500,00",
      recommendationAction: "Priorizar iPad até o teto de R$ 4500.",
      topProductLabel: "iPad",
    }
    const voice = buildExecutiveVoice({
      responseKind: "business_decision",
      businessDecisionType: "capital_allocation",
      seed: "co-1",
      context: ctx,
    })
    assert.ok(!/R\$/.test(voice.headline), "headline must not echo currency literal")
    assert.ok(!/\b\d{4,}\b/.test(voice.headline), "headline must not echo large numbers")
    assert.ok(voice.headline.length <= 120, "headline within limit")
    assert.ok(voice.subline.length <= 200, "subline within limit")
    assert.ok(voice.badge.length <= 20, "badge within limit")
  })

  it("fallback variants never use forbidden generic openers", () => {
    const cases: Array<{ kind: "business_decision" | "decision_memory_review" | "audit_traceability" | "business_review" | "cash_health_summary" | "reinvestment_decision" | "generic_executive"; type?: string }> = [
      { kind: "business_decision", type: "capital_allocation" },
      { kind: "business_decision", type: "business_strategy" },
      { kind: "business_decision", type: "marketing_strategy" },
      { kind: "business_decision", type: "operational_action" },
      { kind: "business_decision", type: "sales_performance" },
      { kind: "business_decision", type: "inventory_priority" },
      { kind: "decision_memory_review" },
      { kind: "audit_traceability" },
      { kind: "business_review" },
      { kind: "cash_health_summary" },
      { kind: "reinvestment_decision" },
      { kind: "generic_executive" },
    ]
    for (const c of cases) {
      const voice = buildExecutiveVoice({ responseKind: c.kind, businessDecisionType: c.type || null, seed: "fallback" })
      assertNotGenericOpener(voice.headline, `${c.kind}:${c.type || ""}`)
      assert.ok(voice.headline.length <= 120)
      assert.ok(voice.subline.length <= 200)
      assert.ok(!/\bR\$\s*[\d,]+/.test(voice.headline), `headline has currency for ${c.kind}`)
      assert.ok(!/\b\d{4,}\b/.test(voice.headline), `headline has large number for ${c.kind}`)
    }
  })

  it("capital_allocation without trustworthy product: safe headline, no 'no undefined'", () => {
    const ctx: ExecutiveVoiceContext = {
      recommendationTitle: "Capital alocado com seletividade",
      recommendationAction: "Manter cautela; ainda não há produto âncora validado.",
      topProductLabel: null,
    }
    const voice = buildExecutiveVoice({
      responseKind: "business_decision",
      businessDecisionType: "capital_allocation",
      seed: "co-1",
      context: ctx,
    })
    assertNotGenericOpener(voice.headline, "capital_allocation_no_product")
    assert.ok(!/no undefined|no null/i.test(voice.headline), "must not leak missing product placeholder")
    assert.ok(!/Decisão estratégica pendente|Ação operacional pendente/i.test(voice.headline + " " + voice.subline))
    assert.match(voice.headline, /seletiva|teto|cautela/i)
  })

  it("deterministic — same seed produces same fallback variant", () => {
    const v1 = buildExecutiveVoice({ responseKind: "business_decision", businessDecisionType: "business_strategy", seed: "abc123" })
    const v2 = buildExecutiveVoice({ responseKind: "business_decision", businessDecisionType: "business_strategy", seed: "abc123" })
    assert.equal(v1.headline, v2.headline)
    assert.equal(v1.variantIndex, v2.variantIndex)
  })
})
