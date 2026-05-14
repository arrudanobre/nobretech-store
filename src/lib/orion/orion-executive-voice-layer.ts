import type { OrionResponseKind } from "./orion-response-orchestrator"

export type OrionExecutiveVoiceTone = "decisive" | "cautious" | "alert" | "neutral"

export type OrionExecutiveVoice = {
  headline: string
  subline: string
  tone: OrionExecutiveVoiceTone
  badge: string
  variantIndex: number
}

export type ExecutiveVoiceContext = {
  recommendationTitle?: string | null
  recommendationAction?: string | null
  recommendationReason?: string | null
  topProductLabel?: string | null
  firstNextStep?: string | null
  secondNextStep?: string | null
  primaryAvoid?: string | null
  primaryRisk?: string | null
  openDecisionsCount?: number
  primaryOpenDecisionTitle?: string | null
  primaryOpenDecisionRecommendation?: string | null
}

export type BuildExecutiveVoiceInput = {
  responseKind: OrionResponseKind
  businessDecisionType?: string | null
  cashBalance?: number | null
  seed?: string
  context?: ExecutiveVoiceContext | null
}

function pickVariant(seed: string, total: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h) % total
}

type VoiceVariant = { headline: string; subline: string; tone: OrionExecutiveVoiceTone; badge: string }

const REINVESTMENT_VARIANTS: VoiceVariant[] = [
  {
    headline: "Eu trataria a recompra com teto.",
    subline: "Margem, giro e caixa apontam onde aplicar sem comprometer a operação.",
    tone: "decisive",
    badge: "Recompra",
  },
  {
    headline: "Tem espaço pra recomprar com cautela.",
    subline: "O produto com melhor retorno ajustado ao risco já está mapeado abaixo.",
    tone: "decisive",
    badge: "Recompra",
  },
]

const BUSINESS_STRATEGY_VARIANTS: VoiceVariant[] = [
  {
    headline: "Esta semana é sobre travar o que move resultado.",
    subline: "Foque no produto âncora antes de abrir novas frentes.",
    tone: "decisive",
    badge: "Estratégia",
  },
  {
    headline: "Eu não abriria várias frentes agora.",
    subline: "O movimento certo é viabilizar o produto âncora e só depois testar tráfego.",
    tone: "decisive",
    badge: "Estratégia",
  },
]

const MARKETING_STRATEGY_VARIANTS: VoiceVariant[] = [
  {
    headline: "Eu só rodaria tráfego como teste curto.",
    subline: "Sem lead ativo agora, campanha vira barulho antes de virar venda.",
    tone: "cautious",
    badge: "Marketing",
  },
  {
    headline: "Tráfego só com produto âncora travado.",
    subline: "Defina oferta clara antes de queimar verba.",
    tone: "cautious",
    badge: "Marketing",
  },
]

const CAPITAL_ALLOCATION_VARIANTS: VoiceVariant[] = [
  {
    headline: "Eu colocaria esse capital com teto.",
    subline: "Prioridade vai pro produto com sinal comercial; alternativas só com cautela.",
    tone: "decisive",
    badge: "Capital",
  },
  {
    headline: "Capital vai no que está mais firme.",
    subline: "Liquidez preservada, alternativas tratadas como reserva, não como prioridade.",
    tone: "decisive",
    badge: "Capital",
  },
]

const INVENTORY_VARIANTS: VoiceVariant[] = [
  {
    headline: "Estoque pede decisão por prioridade.",
    subline: "Itens que movem resultado primeiro; os que travam capital, depois.",
    tone: "neutral",
    badge: "Estoque",
  },
  {
    headline: "Foco no que gira; o resto exige decisão.",
    subline: "Capital parado precisa de saída antes de novas compras.",
    tone: "neutral",
    badge: "Estoque",
  },
]

const SALES_PERFORMANCE_VARIANTS: VoiceVariant[] = [
  {
    headline: "Tem padrão claro de onde ganha ou perde tração.",
    subline: "Concentre esforço onde a margem real está aparecendo.",
    tone: "neutral",
    badge: "Vendas",
  },
  {
    headline: "Performance mostra onde está o sinal.",
    subline: "Os produtos com tração estão isolados abaixo.",
    tone: "neutral",
    badge: "Vendas",
  },
]

const OPERATIONAL_ACTION_VARIANTS: VoiceVariant[] = [
  {
    headline: "Hoje, eu não abriria várias frentes.",
    subline: "Resolve o gargalo principal primeiro; o resto vem em seguida.",
    tone: "decisive",
    badge: "Operação",
  },
  {
    headline: "Primeiro passo: o que move o ponteiro hoje.",
    subline: "Sequência mira resultado rápido com risco controlado.",
    tone: "decisive",
    badge: "Operação",
  },
]

const DECISION_MEMORY_VARIANTS: VoiceVariant[] = [
  {
    headline: "Aqui está o status das suas decisões abertas.",
    subline: "Cada recomendação registrada está sendo acompanhada para o plano avançar.",
    tone: "neutral",
    badge: "Memória",
  },
]

const BUSINESS_REVIEW_VARIANTS: VoiceVariant[] = [
  {
    headline: "Panorama do negócio na mesa.",
    subline: "Finanças, vendas e estoque cruzados para você decidir o próximo movimento.",
    tone: "neutral",
    badge: "Revisão",
  },
  {
    headline: "Leitura geral do negócio pronta.",
    subline: "Os indicadores chave estão sintetizados para uma visão executiva.",
    tone: "neutral",
    badge: "Revisão",
  },
]

const CASH_HEALTH_CAUTIOUS_VARIANTS: VoiceVariant[] = [
  {
    headline: "Caixa merece atenção.",
    subline: "Há pressão de liquidez no horizonte próximo; não tome decisão de compra sem olhar.",
    tone: "cautious",
    badge: "Caixa",
  },
  {
    headline: "Leitura de caixa: sinal amarelo.",
    subline: "Recomendo revisar obrigações próximas antes de qualquer movimento de capital.",
    tone: "alert",
    badge: "Caixa",
  },
]

const CASH_HEALTH_OK_VARIANTS: VoiceVariant[] = [
  {
    headline: "Caixa está com margem de segurança.",
    subline: "Obrigações próximas e disponível em perspectiva para a próxima decisão.",
    tone: "decisive",
    badge: "Caixa",
  },
  {
    headline: "Leitura de caixa em ordem.",
    subline: "Os números estão organizados para decidir com clareza.",
    tone: "neutral",
    badge: "Caixa",
  },
]

const AUDIT_VARIANTS: VoiceVariant[] = [
  {
    headline: "Aqui está a rastreabilidade do raciocínio.",
    subline: "Separei caixa, reserva, teto e produtos para você enxergar de onde saiu a recomendação.",
    tone: "neutral",
    badge: "Auditoria",
  },
]

const GENERIC_VARIANTS: VoiceVariant[] = [
  {
    headline: "Resposta baseada no snapshot atual do negócio.",
    subline: "Os números abaixo refletem o que está disponível agora.",
    tone: "neutral",
    badge: "ORION",
  },
]

function selectVariants(input: BuildExecutiveVoiceInput): VoiceVariant[] {
  const { responseKind, businessDecisionType, cashBalance } = input
  if (responseKind === "reinvestment_decision") return REINVESTMENT_VARIANTS
  if (responseKind === "decision_memory_review") return DECISION_MEMORY_VARIANTS
  if (responseKind === "business_review") return BUSINESS_REVIEW_VARIANTS
  if (responseKind === "audit_traceability") return AUDIT_VARIANTS
  if (responseKind === "cash_health_summary") {
    return typeof cashBalance === "number" && cashBalance < 0
      ? CASH_HEALTH_CAUTIOUS_VARIANTS
      : CASH_HEALTH_OK_VARIANTS
  }
  if (responseKind === "business_decision") {
    const dt = businessDecisionType || ""
    if (dt === "business_strategy") return BUSINESS_STRATEGY_VARIANTS
    if (dt === "marketing_strategy") return MARKETING_STRATEGY_VARIANTS
    if (dt === "capital_allocation") return CAPITAL_ALLOCATION_VARIANTS
    if (dt === "inventory_priority" || dt === "inventory_review") return INVENTORY_VARIANTS
    if (dt === "sales_performance") return SALES_PERFORMANCE_VARIANTS
    if (dt === "operational_action") return OPERATIONAL_ACTION_VARIANTS
    return BUSINESS_STRATEGY_VARIANTS
  }
  return GENERIC_VARIANTS
}

const MAX_HEADLINE = 120
const MAX_SUBLINE = 200
const MAX_BADGE = 20

function cap(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

// Remove monetary literals and large standalone numbers so the voice layer never echoes a value
// that did not come from a structured calculation.
function strip(text: string | null | undefined): string {
  if (!text) return ""
  return text
    .replace(/R\$\s*[\d.,]+(\s*(mil|k|reais|reais\.?))?/gi, "")
    .replace(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b/g, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function firstSentence(text: string, maxChars: number): string {
  const clean = strip(text)
  if (!clean) return ""
  const match = clean.match(/^(.+?[.!?])(\s|$)/)
  const sentence = (match ? match[1] : clean).trim()
  return cap(sentence, maxChars)
}

function buildContextualDecisionMemoryVoice(ctx: ExecutiveVoiceContext): VoiceVariant | null {
  const count = ctx.openDecisionsCount ?? 0
  if (count <= 0) {
    return {
      headline: "Nada aberto agora.",
      subline: "Tudo que recomendei já foi fechado ou consolidado.",
      tone: "neutral",
      badge: "Memória",
    }
  }
  const primary = strip(ctx.primaryOpenDecisionTitle)
  const action = strip(ctx.primaryOpenDecisionRecommendation)
  const decisaoWord = count === 1 ? "decisão aberta" : "decisões abertas"
  const headlineBase = primary
    ? `Você tem ${count} ${decisaoWord}. A principal: ${primary}.`
    : `Você tem ${count} ${decisaoWord} em acompanhamento.`
  const sublineBase = action
    ? `Ação imediata: ${action}`
    : "Cada uma está sendo monitorada conforme o prazo de revisão."
  return {
    headline: cap(headlineBase, MAX_HEADLINE),
    subline: cap(sublineBase, MAX_SUBLINE),
    tone: "neutral",
    badge: "Memória",
  }
}

function buildContextualBusinessDecisionVoice(
  decisionType: string,
  ctx: ExecutiveVoiceContext
): VoiceVariant | null {
  const title = strip(ctx.recommendationTitle)
  const action = firstSentence(ctx.recommendationAction || "", MAX_SUBLINE)
  const nextStep = firstSentence(ctx.firstNextStep || "", MAX_SUBLINE)
  const avoid = strip(ctx.primaryAvoid)
  const product = strip(ctx.topProductLabel)

  const subline = action || nextStep
  if (!title && !subline) return null

  const badgeMap: Record<string, { badge: string; tone: OrionExecutiveVoiceTone }> = {
    capital_allocation: { badge: "Capital", tone: "decisive" },
    business_strategy: { badge: "Estratégia", tone: "decisive" },
    marketing_strategy: { badge: "Marketing", tone: "cautious" },
    operational_action: { badge: "Operação", tone: "decisive" },
    inventory_priority: { badge: "Estoque", tone: "neutral" },
    inventory_review: { badge: "Estoque", tone: "neutral" },
    sales_performance: { badge: "Vendas", tone: "neutral" },
    cash_health: { badge: "Caixa", tone: "neutral" },
    generic_business_review: { badge: "Revisão", tone: "neutral" },
  }
  const meta = badgeMap[decisionType] || { badge: "Decisão", tone: "decisive" }

  let headline = title
  if (decisionType === "capital_allocation") {
    headline = product
      ? `Eu colocaria esse capital no ${product}, mas com teto.`
      : "Eu compraria de forma seletiva, mas com teto."
  } else if (decisionType === "operational_action" && nextStep) {
    headline = `Hoje, ${nextStep.charAt(0).toLowerCase() + nextStep.slice(1)}`
  } else if (decisionType === "marketing_strategy" && (avoid || action)) {
    headline = "Eu só rodaria tráfego como teste curto."
  } else if (decisionType === "business_strategy" && (title || action)) {
    headline = title || "Esta semana é sobre travar o produto âncora."
  }

  if (!headline) return null
  return {
    headline: cap(strip(headline), MAX_HEADLINE),
    subline: cap(subline, MAX_SUBLINE),
    tone: meta.tone,
    badge: meta.badge,
  }
}

function looksGeneric(headline: string): boolean {
  const bad = [
    /^aloca[cç][aã]o de capital definida/i,
    /^leitura estrat[eé]gica pronta/i,
    /^decis[aã]o pronta/i,
    /^an[aá]lise conclu[ií]da/i,
  ]
  return bad.some((re) => re.test(headline))
}

export function buildExecutiveVoice(input: BuildExecutiveVoiceInput): OrionExecutiveVoice {
  const ctx = input.context || null

  let contextual: VoiceVariant | null = null
  if (ctx) {
    if (input.responseKind === "decision_memory_review") {
      contextual = buildContextualDecisionMemoryVoice(ctx)
    } else if (input.responseKind === "business_decision") {
      contextual = buildContextualBusinessDecisionVoice(input.businessDecisionType || "", ctx)
    }
  }

  let variant: VoiceVariant
  let idx = 0
  if (contextual && !looksGeneric(contextual.headline)) {
    variant = contextual
  } else {
    const variants = selectVariants(input)
    const seed = `${input.seed || ""}:${input.responseKind}:${input.businessDecisionType || ""}`
    idx = pickVariant(seed, variants.length)
    variant = variants[idx]
  }

  return {
    headline: cap(variant.headline, MAX_HEADLINE),
    subline: cap(variant.subline, MAX_SUBLINE),
    tone: variant.tone,
    badge: cap(variant.badge, MAX_BADGE),
    variantIndex: idx,
  }
}
