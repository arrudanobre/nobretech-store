import "server-only"

import {
  generateContent,
  type GeneralStrategy,
  type GeneratedContent,
  type ProductDraft,
  type ProductFacts,
  type ProductCopySuggestion,
  type CampaignAngleSuggestion,
} from "@/lib/marketing/copy-generator"

const MARKETING_MODEL =
  process.env.MARKETING_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini"
const DEFAULT_MARKETING_TIMEOUT_MS = 45000

type MarketingAIErrorKind =
  | "missing_key"
  | "timeout"
  | "http"
  | "invalid_json"
  | "invalid_schema"
  | "empty_response"
  | "unknown"

class MarketingAIError extends Error {
  constructor(
    public readonly kind: MarketingAIErrorKind,
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = "MarketingAIError"
  }
}

function userFacingAIError(err: unknown): string {
  if (err instanceof MarketingAIError) {
    switch (err.kind) {
      case "missing_key":
        return "IA indisponível agora. Chave da OpenAI não configurada no servidor."
      case "timeout":
        return "IA indisponível agora. A geração demorou demais e foi interrompida."
      case "http":
        return "IA indisponível agora. O provedor retornou erro ao gerar a copy."
      case "invalid_json":
        return "IA indisponível agora. A resposta veio em JSON inválido."
      case "invalid_schema":
        return "IA indisponível agora. A resposta não passou na validação do formato."
      case "empty_response":
        return "IA indisponível agora. O provedor não retornou conteúdo estruturado."
      default:
        return "IA indisponível agora. Mantive a versão determinística."
    }
  }
  return "IA indisponível agora. Mantive a versão determinística."
}

function logMarketingAIError(err: unknown) {
  if (err instanceof MarketingAIError) {
    console.error("[marketing/generate-copy] ai fallback", {
      kind: err.kind,
      status: err.status ?? null,
      model: MARKETING_MODEL,
      message: err.message,
    })
    return
  }
  console.error("[marketing/generate-copy] ai fallback", {
    kind: "unknown",
    model: MARKETING_MODEL,
    message: err instanceof Error ? err.message : "Unknown AI error",
  })
}

export function isMarketingAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

interface FactPayload {
  general: GeneralStrategy
  products: Array<{
    id: string
    name: string
    storage: string | null
    color: string | null
    grade: string | null
    battery_health: number | null
    quantity: number
    base_price_brl: number | null
    disclosure_price_brl: number | null
    discount_amount_brl: number | null
    discount_percent: number | null
    installment: { count: number; per_installment_brl: number; total_brl: number; has_fee: boolean } | null
    gifts: string | null
    warranty_label: string | null
    warranty_source: "inventory" | "manual" | null
    product_note: string | null
    product_cta: string | null
    is_primary: boolean
    is_featured: boolean
  }>
}

function buildFactPayload(facts: ProductFacts[], strategy: GeneralStrategy): FactPayload {
  return {
    general: strategy,
    products: facts.map((f) => ({
      id: f.id,
      name: f.name,
      storage: f.storage,
      color: f.color,
      grade: f.grade,
      battery_health: f.battery_health,
      quantity: f.quantity,
      base_price_brl: f.basePrice,
      disclosure_price_brl: f.disclosurePrice,
      discount_amount_brl: f.discount?.amount ?? null,
      discount_percent: f.discount?.percent ?? null,
      installment: f.installment
        ? {
            count: f.installment.count,
            per_installment_brl: Math.round(f.installment.perInstallment * 100) / 100,
            total_brl: Math.round(f.installment.total * 100) / 100,
            has_fee: f.installment.hasFee,
          }
        : null,
      gifts: f.gifts || null,
      warranty_label: f.warrantyLabel || null,
      warranty_source: f.warrantySource,
      product_note: f.productNote || null,
      product_cta: f.productCta || null,
      is_primary: f.isPrimary,
      is_featured: f.isFeatured,
    })),
  }
}

const aiOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    campaign_angle: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        reason: { type: "string", maxLength: 220 },
        main_hook: { type: "string", maxLength: 180 },
        commercial_strategy: { type: "string", maxLength: 260 },
      },
      required: ["title", "reason", "main_hook", "commercial_strategy"],
    },
    product_copies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          inventory_id: { type: "string" },
          commercial_title: { type: "string", maxLength: 80 },
          short_pitch: { type: "string", maxLength: 180 },
          main_selling_point: { type: "string", maxLength: 140 },
          trust_argument: { type: "string", maxLength: 140 },
          urgency_argument: { type: "string", maxLength: 120 },
          cta: { type: "string", maxLength: 110 },
          story_card_line: { type: "string", maxLength: 130 },
          whatsapp_line: { type: "string", maxLength: 180 },
        },
        required: [
          "inventory_id",
          "commercial_title",
          "short_pitch",
          "main_selling_point",
          "trust_argument",
          "urgency_argument",
          "cta",
          "story_card_line",
          "whatsapp_line",
        ],
      },
    },
    channel_copy: {
      type: "object",
      additionalProperties: false,
      properties: {
        whatsapp_text: { type: "string", maxLength: 1000 },
        instagram_caption: { type: "string", maxLength: 900 },
        story_1_headline: { type: "string", maxLength: 80 },
        story_1_subtitle: { type: "string", maxLength: 100 },
        story_2_headline: { type: "string", maxLength: 80 },
        story_2_subtitle: { type: "string", maxLength: 100 },
        story_3_headline: { type: "string", maxLength: 80 },
        story_3_cta: { type: "string", maxLength: 120 },
        carousel_slides: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", maxLength: 80 },
              body: { type: "string", maxLength: 140 },
            },
            required: ["title", "body"],
          },
          minItems: 5,
          maxItems: 5,
        },
      },
      required: [
        "whatsapp_text",
        "instagram_caption",
        "story_1_headline",
        "story_1_subtitle",
        "story_2_headline",
        "story_2_subtitle",
        "story_3_headline",
        "story_3_cta",
        "carousel_slides",
      ],
    },
    offer_alerts: { type: "array", items: { type: "string" } },
  },
  required: [
    "campaign_angle",
    "product_copies",
    "channel_copy",
    "offer_alerts",
  ],
} as const

const SYSTEM_INSTRUCTIONS = [
  "Você é o copywriter comercial premium da Nobretech Store. Você vende Apple e tecnologia com clareza, confiança e desejo.",
  "Tom obrigatório: humano, direto, premium, parceiro para parceiro, vendedor consultivo, sem parecer IA, sem atendimento automático.",
  "Use estrutura comercial: Gancho, Desejo, Oferta, Prova/confiança, Urgência real e CTA.",
  "Use essa estrutura internamente, mas NÃO escreva rótulos como 'Gancho:', 'Desejo:', 'Oferta:', 'Prova:', 'Urgência:', 'CTA:', 'Ponto forte:', 'Argumento:', 'Estratégia:', 'Motivo:' ou 'Quantidade disponível:' no texto final para WhatsApp, Instagram ou Stories.",
  "Transforme fatos em argumentos comerciais fortes. Não liste dados friamente.",
  "Use APENAS os fatos enviados em FACTS. Não invente preço, garantia, estoque, brinde, bateria, parcelamento, condição, prazo de entrega, kit ou cor.",
  "Se mencionar número, preço, parcela, desconto, bateria, estoque ou garantia, use EXATAMENTE o valor enviado.",
  "Exemplos de transformação: desconto de R$ 390 => 'caiu de R$ 2.490 para R$ 2.100'; bateria 100% => 'bateria 100%, difícil de achar nessa condição'; garantia Nobretech 6 meses => 'com garantia Nobretech de 6 meses para comprar com segurança'; quantity 1 => 'tenho só uma unidade nessa condição'; acessório => 'já ajuda a sair com o kit mais completo'.",
  "Se um produto tiver disclosure_price_brl null, escreva preço como '[a confirmar]' e não crie preço.",
  "Se discount_percent for null ou zero, NÃO use linguagem de desconto/promoção.",
  "Se discount_percent existir, pode usar 'de/por' com base_price_brl e disclosure_price_brl exatos.",
  "Parcelamento só pode ser citado se installment não for null e deve usar EXATAMENTE installment.text-equivalente: '${count}x de R$ ${per_installment_brl}'. Não some valores entre produtos.",
  "Se gifts for null, não escreva 'kit incluso' nem brinde algum.",
  "Garantia só pode ser citada se warranty_label existir. Não afirmar garantia Apple automaticamente.",
  "Só fale 'última unidade' quando quantity for 1. Se quantity > 1, não use última unidade.",
  "Se item for acessório barato e houver iPhone/aparelho no conjunto, trate o acessório como complemento, não como oferta principal.",
  "Diferencie produto principal, produtos em destaque e acessório. O principal pode ser foco; destaque/oferta merece mais energia; acessório complementa o kit.",
  "Para múltiplos produtos: cada produto tem o próprio preço, parcelamento, brinde e observação. NUNCA somar preços como combo.",
  "Preencha product_copies para CADA produto enviado. Esses campos são textos editáveis por produto e devem vender o argumento real de cada item.",
  "WhatsApp deve ser curto, comercial e pronto para copiar: 1 produto até 10 linhas; 2 produtos até 16 linhas; mais produtos devem resumir e não virar catálogo gigante. Não inclua análise interna.",
  "Todos os campos devem ser concisos. Não escreva parágrafos longos no JSON. product_copies deve trazer frases curtas para UI, não relatório.",
  "Padrão de qualidade do WhatsApp: começar pelo melhor argumento real, explicar o conjunto em linguagem natural e fechar com uma ação simples. Exemplo de estilo: 'Esse iPhone 14 ficou bem interessante pelo conjunto: bateria 100%, Grade A, garantia Nobretech e ainda caiu de R$ 2.490 para R$ 2.290. Já vai com capa, fonte e película, então a pessoa sai com o kit pronto para usar. Tenho só uma unidade nessa condição. Se fizer sentido, eu já deixo reservado pra você.' Não copie sempre; use como referência de força comercial.",
  "Legenda Instagram deve ter gancho forte, lista/argumento dos produtos, confiança e CTA, com hashtags discretas.",
  "Para story_card_line e whatsapp_line, escreva frases curtas e úteis por produto, adequadas para WhatsApp Stories/lista rápida. Use poucos emojis apenas quando fizer sentido no texto final gerado pelo sistema; não transforme em carnaval.",
  "Stories: Story 1 headline comercial da campanha; Story 2 headline específica para ofertas/destaques ou confiança; Story 3 fechamento com CTA forte.",
  "offer_alerts devem ser úteis: exemplo 'O desconto do iPhone é o argumento mais forte.' ou 'O carregador deve entrar como complemento, não como oferta principal.'",
  "Nunca use frases genéricas proibidas: 'Tenho produtos prontos para venda', 'Posso esclarecer dúvidas', 'Confira nosso catálogo', 'Pergunte pelo produto', 'Seleção verificada', 'Produto de qualidade', 'Olá! Tenho dois produtos prontos para venda'.",
  "Pode usar poucos emojis no WhatsApp quando ajudarem a escanear: no máximo 1 emoji por linha e poucos emojis no total. Não use emojis em excesso. Não use exclamações duplas. Não invente '#hashtag' fora de Instagram.",
  "Se faltar dado relevante, escreva de forma neutra sem preencher lacunas com invenção.",
  "Saída obrigatória: JSON estrito conforme schema. Português do Brasil.",
].join(" ")

const INTERNAL_LABEL_PATTERN =
  /\b(Ponto forte|Argumento|Estratégia|Motivo|Quantidade disponível|Gancho|Desejo|Oferta|Prova|Urgência|CTA)\s*:/i

const GENERIC_COPY_PATTERN =
  /Tenho produtos prontos para venda|Tenho produto pronto para venda|Posso esclarecer dúvidas|Confira nosso catálogo|Pergunte pelo produto|Produto de qualidade|Seleção verificada|Olá! Tenho dois produtos prontos/i

function stripInternalLabels(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.replace(
        /^\s*(Ponto forte|Argumento|Estratégia|Motivo|Quantidade disponível|Gancho|Desejo|Oferta|Prova|Urgência|CTA)\s*:\s*/i,
        ""
      )
    )
    .join("\n")
    .trim()
}

function isUnsafeFinalCopy(text: string): boolean {
  if (!text.trim()) return true
  return INTERNAL_LABEL_PATTERN.test(text) || GENERIC_COPY_PATTERN.test(text)
}

function compactLines(text: string, maxNonEmptyLines: number): string {
  const lines = text.split("\n")
  let count = 0
  const compacted: string[] = []
  for (const line of lines) {
    if (line.trim()) count += 1
    if (count <= maxNonEmptyLines) compacted.push(line)
  }
  return compacted.join("\n").trim()
}

interface AIOutput {
  campaign_angle: {
    title: string
    reason: string
    main_hook: string
    commercial_strategy: string
  }
  product_copies: Array<{
    inventory_id: string
    commercial_title: string
    short_pitch: string
    main_selling_point: string
    trust_argument: string
    urgency_argument: string
    cta: string
    story_card_line: string
    whatsapp_line: string
  }>
  channel_copy: {
    whatsapp_text: string
    instagram_caption: string
    story_1_headline: string
    story_1_subtitle: string
    story_2_headline: string
    story_2_subtitle: string
    story_3_headline: string
    story_3_cta: string
    carousel_slides: Array<{ title: string; body: string }>
  }
  offer_alerts: string[]
}

function validateAIOutput(value: unknown): AIOutput {
  if (!value || typeof value !== "object") {
    throw new MarketingAIError("invalid_schema", "AI output root is not an object.")
  }
  const v = value as Partial<AIOutput>
  const angle = (v as { campaign_angle?: unknown }).campaign_angle
  if (!angle || typeof angle !== "object") {
    throw new MarketingAIError("invalid_schema", "AI output missing campaign_angle.")
  }
  const a = angle as AIOutput["campaign_angle"]
  if (
    typeof a.title !== "string" ||
    typeof a.reason !== "string" ||
    typeof a.main_hook !== "string" ||
    typeof a.commercial_strategy !== "string"
  ) {
    throw new MarketingAIError("invalid_schema", "AI campaign_angle has invalid fields.")
  }
  if (!Array.isArray(v.product_copies)) {
    throw new MarketingAIError("invalid_schema", "AI output missing product_copies.")
  }
  for (const copy of v.product_copies) {
    if (!copy || typeof copy !== "object") {
      throw new MarketingAIError("invalid_schema", "Product copy output is invalid.")
    }
    const c = copy as AIOutput["product_copies"][number]
    if (
      typeof c.inventory_id !== "string" ||
      typeof c.commercial_title !== "string" ||
      typeof c.short_pitch !== "string" ||
      typeof c.main_selling_point !== "string" ||
      typeof c.trust_argument !== "string" ||
      typeof c.urgency_argument !== "string" ||
      typeof c.cta !== "string" ||
      typeof c.story_card_line !== "string" ||
      typeof c.whatsapp_line !== "string"
    ) {
      throw new MarketingAIError("invalid_schema", "Product copy output has invalid fields.")
    }
  }
  const channel = (v as { channel_copy?: unknown }).channel_copy
  if (!channel || typeof channel !== "object") {
    throw new MarketingAIError("invalid_schema", "AI output missing channel_copy.")
  }
  const ch = channel as AIOutput["channel_copy"]
  if (
    typeof ch.whatsapp_text !== "string" ||
    typeof ch.instagram_caption !== "string" ||
    typeof ch.story_1_headline !== "string" ||
    typeof ch.story_1_subtitle !== "string" ||
    typeof ch.story_2_headline !== "string" ||
    typeof ch.story_2_subtitle !== "string" ||
    typeof ch.story_3_headline !== "string" ||
    typeof ch.story_3_cta !== "string"
  ) {
    throw new MarketingAIError("invalid_schema", "AI channel_copy has invalid text fields.")
  }
  if (
    !Array.isArray(ch.carousel_slides) ||
    ch.carousel_slides.length !== 5 ||
    !ch.carousel_slides.every((slide) => slide && typeof slide.title === "string" && typeof slide.body === "string")
  ) {
    throw new MarketingAIError("invalid_schema", "AI carousel_slides is invalid.")
  }
  if (!Array.isArray(v.offer_alerts) || !v.offer_alerts.every((item) => typeof item === "string")) {
    throw new MarketingAIError("invalid_schema", "AI offer_alerts is invalid.")
  }
  return v as AIOutput
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const direct = (payload as { output_text?: unknown }).output_text
  if (typeof direct === "string") return direct
  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) return ""
  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (!c || typeof c !== "object") continue
      const text = (c as { text?: unknown }).text
      if (typeof text === "string") parts.push(text)
    }
  }
  return parts.join("\n")
}

function parseAIOutputText(text: string): AIOutput {
  try {
    return validateAIOutput(JSON.parse(text))
  } catch (err) {
    if (err instanceof MarketingAIError) throw err
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return validateAIOutput(JSON.parse(text.slice(start, end + 1)))
      } catch (nestedErr) {
        if (nestedErr instanceof MarketingAIError) throw nestedErr
      }
    }
    throw new MarketingAIError("invalid_json", "OpenAI output_text is not valid JSON.")
  }
}

async function callOpenAI(payload: FactPayload): Promise<AIOutput> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new MarketingAIError("missing_key", "OPENAI_API_KEY is not configured.")
  }
  const controller = new AbortController()
  const configuredTimeout = Number(process.env.MARKETING_OPENAI_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 10000
    ? configuredTimeout
    : DEFAULT_MARKETING_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(new Error("marketing_ai_timeout")), timeoutMs)

  let response: Response
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MARKETING_MODEL,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify({ FACTS: payload }),
        max_output_tokens: 3500,
        reasoning: { effort: "minimal" },
        text: {
          format: {
            type: "json_schema",
            name: "nobretech_marketing_copy",
            strict: true,
            schema: aiOutputSchema,
          },
        },
      }),
    })
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message === "marketing_ai_timeout")) {
      throw new MarketingAIError("timeout", `OpenAI request exceeded ${timeoutMs}ms.`)
    }
    throw new MarketingAIError("unknown", err instanceof Error ? err.message : "OpenAI fetch failed.")
  } finally {
    clearTimeout(timeout)
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const error = json && typeof json.error === "object" ? json.error as Record<string, unknown> : null
    const code = typeof error?.code === "string" ? error.code : null
    const type = typeof error?.type === "string" ? error.type : null
    throw new MarketingAIError(
      "http",
      [type, code, `HTTP ${response.status}`].filter(Boolean).join(" · "),
      response.status
    )
  }
  const text = extractOutputText(json)
  if (!text) throw new MarketingAIError("empty_response", "OpenAI did not return output_text.")
  return parseAIOutputText(text)
}

export interface GenerateOptions {
  drafts: ProductDraft[]
  strategy: GeneralStrategy
  useAI: boolean
}

export interface GenerateResult {
  content: GeneratedContent
  source: "deterministic" | "ai"
  aiError?: string
  productCopies?: ProductCopySuggestion[]
  campaignAngle?: CampaignAngleSuggestion
  offerAlerts?: string[]
}

/**
 * Server-side generator: builds deterministic content always, then optionally
 * overlays AI-generated text fields. Numerical/commercial facts (price, parcel,
 * vitrine items, badges, discount math) NEVER come from AI — only headline/sub
 * copy and longform whatsapp/instagram text. Falls back to deterministic when
 * AI fails or is disabled.
 */
export async function generateMarketingContent(
  options: GenerateOptions
): Promise<GenerateResult> {
  const deterministic = generateContent(options.drafts, options.strategy)

  if (!options.useAI) {
    return { content: deterministic, source: "deterministic" }
  }

  if (!isMarketingAIConfigured()) {
    const message = userFacingAIError(new MarketingAIError("missing_key", "OPENAI_API_KEY is not configured."))
    return {
      content: { ...deterministic, warnings: [...deterministic.warnings, message] },
      source: "deterministic",
      aiError: message,
      campaignAngle: {
        title: "Modelo determinístico",
        reason: "A IA não está disponível; usei a estrutura segura baseada nos cards.",
        mainHook: deterministic.stories[0].headline,
        commercialStrategy: "Divulgar produtos com preço, condição e CTA sem alterar fatos comerciais.",
      },
      offerAlerts: [],
      productCopies: deterministic.facts.map((f) => ({
        productId: f.id,
        title: f.copyTitle,
        description: f.copyDescription,
        strongPoint: f.copyStrongPoint,
        cta: f.productCta,
        objection: f.copyObjection,
      })),
    }
  }

  const facts = deterministic.facts
  const payload = buildFactPayload(facts, options.strategy)

  try {
    const ai = await callOpenAI(payload)
    const aiWhatsapp = stripInternalLabels(ai.channel_copy.whatsapp_text)
    const aiInstagram = stripInternalLabels(ai.channel_copy.instagram_caption)
    const maxWhatsappLines = facts.length <= 1 ? 10 : facts.length === 2 ? 16 : 18
    const merged: GeneratedContent = {
      ...deterministic,
      whatsapp: isUnsafeFinalCopy(aiWhatsapp)
        ? deterministic.whatsapp
        : compactLines(aiWhatsapp, maxWhatsappLines),
      instagram: isUnsafeFinalCopy(aiInstagram) ? deterministic.instagram : aiInstagram,
      stories: deterministic.stories.map((story, i) => {
        const headline = i === 0
          ? ai.channel_copy.story_1_headline
          : i === 1
          ? ai.channel_copy.story_2_headline
          : ai.channel_copy.story_3_headline
        const sub = i === 0
          ? ai.channel_copy.story_1_subtitle
          : i === 1
          ? ai.channel_copy.story_2_subtitle
          : story.sub
        return {
          ...story,
          headline: stripInternalLabels(headline || "") || story.headline,
          sub: stripInternalLabels(sub || "") || story.sub,
          ctaMain: i === 2 ? stripInternalLabels(ai.channel_copy.story_3_cta) || story.ctaMain : story.ctaMain,
        }
      }) as GeneratedContent["stories"],
      carousel: deterministic.carousel.map((slide, i) => {
        const aiSlide = ai.channel_copy.carousel_slides[i]
        if (!aiSlide) return slide
        return {
          ...slide,
          title: stripInternalLabels(aiSlide.title) || slide.title,
          body: stripInternalLabels(aiSlide.body) || slide.body,
        }
      }),
      source: "ai",
      warnings: [
        ...deterministic.warnings,
        ...ai.offer_alerts.filter(Boolean).map((a) => `IA: ${a}`),
      ],
    }
    const productCopies: ProductCopySuggestion[] = ai.product_copies.map((copy) => ({
      productId: copy.inventory_id,
      title: stripInternalLabels(copy.commercial_title),
      description: stripInternalLabels(copy.short_pitch),
      strongPoint: stripInternalLabels(copy.main_selling_point),
      cta: stripInternalLabels(copy.cta),
      objection: [stripInternalLabels(copy.trust_argument), stripInternalLabels(copy.urgency_argument)].filter(Boolean).join(" "),
    }))
    return {
      content: merged,
      source: "ai",
      productCopies,
      campaignAngle: {
        title: ai.campaign_angle.title.trim(),
        reason: ai.campaign_angle.reason.trim(),
        mainHook: ai.campaign_angle.main_hook.trim(),
        commercialStrategy: ai.campaign_angle.commercial_strategy.trim(),
      },
      offerAlerts: ai.offer_alerts.filter(Boolean),
    }
  } catch (err) {
    logMarketingAIError(err)
    const message = userFacingAIError(err)
    return {
      content: { ...deterministic, warnings: [...deterministic.warnings, message] },
      source: "deterministic",
      aiError: message,
      campaignAngle: {
        title: "Modelo determinístico",
        reason: "A IA falhou; usei a estrutura segura baseada nos cards.",
        mainHook: deterministic.stories[0].headline,
        commercialStrategy: "Divulgar produtos com preço, condição e CTA sem alterar fatos comerciais.",
      },
      offerAlerts: [],
      productCopies: deterministic.facts.map((f) => ({
        productId: f.id,
        title: f.copyTitle,
        description: f.copyDescription,
        strongPoint: f.copyStrongPoint,
        cta: f.productCta,
        objection: f.copyObjection,
      })),
    }
  }
}
