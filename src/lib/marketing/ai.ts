import "server-only"

import {
  generateContent,
  formatBRL,
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
  general: GeneralStrategy & { history_summary?: string | null }
  /** Story plan the AI MUST honour: same length, same kind/page sequence. */
  story_plan: Array<{
    index: number
    kind: "vitrine" | "highlight" | "cta" | "trust"
    label: string
    page?: number
    total_pages?: number
    /** "detailed" (3 max), "standard" (4 max), "compact" (5 max). */
    density?: "detailed" | "standard" | "compact"
    /** Default headline/sub the system would use if the AI does not improve it. */
    deterministic_headline?: string
    deterministic_subtitle?: string
    product_ids: string[]
  }>
  products: Array<{
    product_id: string
    name: string
    condition: string | null
    storage: string | null
    color: string | null
    grade: string | null
    battery_health: number | null
    quantity: number
    base_price: number | null
    disclosure_price: number | null
    discount_amount: number | null
    discount_percent: number | null
    installment_count: number | null
    installment_value: number | null
    installment_total: number | null
    installment_text: string | null
    warranty_label: string | null
    gift_text: string | null
    commercial_note: string | null
    product_cta: string | null
    is_primary: boolean
    is_featured: boolean
  }>
}

function buildFactPayload(
  facts: ProductFacts[],
  strategy: GeneralStrategy,
  storyPlan: FactPayload["story_plan"],
  historySummary?: string
): FactPayload {
  return {
    general: { ...strategy, history_summary: historySummary?.trim() || null },
    story_plan: storyPlan,
    products: facts.map((f) => ({
      product_id: f.id,
      name: f.name,
      condition: f.grade,
      storage: f.storage,
      color: f.color,
      grade: f.grade,
      battery_health: f.battery_health,
      quantity: f.quantity,
      base_price: f.basePrice,
      disclosure_price: f.disclosurePrice,
      discount_amount: f.discount?.amount ?? null,
      discount_percent: f.discount?.percent ?? null,
      installment_count: f.installment?.count ?? null,
      installment_value: f.installment ? Math.round(f.installment.perInstallment * 100) / 100 : null,
      installment_total: f.installment ? Math.round(f.installment.total * 100) / 100 : null,
      installment_text: f.installment?.text ?? null,
      warranty_label: f.warrantyLabel || null,
      gift_text: f.gifts || null,
      commercial_note: f.productNote || null,
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
          product_id: { type: "string" },
          commercial_title: { type: "string", maxLength: 80 },
          short_pitch: { type: "string", maxLength: 180 },
          trust_argument: { type: "string", maxLength: 140 },
          urgency_line: { type: "string", maxLength: 120 },
          cta_line: { type: "string", maxLength: 110 },
          whatsapp_line: { type: "string", maxLength: 180 },
          instagram_line: { type: "string", maxLength: 180 },
          story_whatsapp_text: { type: "string", maxLength: 520 },
        },
        required: [
          "product_id",
          "commercial_title",
          "short_pitch",
          "trust_argument",
          "whatsapp_line",
          "instagram_line",
          "urgency_line",
          "cta_line",
          "story_whatsapp_text",
        ],
      },
    },
    channel_copy: {
      type: "object",
      additionalProperties: false,
      properties: {
        whatsapp_text: { type: "string", maxLength: 1000 },
        instagram_caption: { type: "string", maxLength: 900 },
        stories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              index: { type: "integer", minimum: 1, maximum: 24 },
              kind: { type: "string", enum: ["vitrine", "highlight", "cta", "trust"] },
              headline: { type: "string", maxLength: 90 },
              subtitle: { type: "string", maxLength: 110 },
              cta: { type: "string", maxLength: 140 },
            },
            required: ["index", "kind", "headline", "subtitle", "cta"],
          },
          minItems: 1,
          maxItems: 24,
        },
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
        "stories",
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
  "Exemplos de transformação: desconto de R$ 390 => 'caiu de R$ 2.490 para R$ 2.100'; bateria 100% => 'bateria 100%, difícil de achar nessa condição'; warranty_label 'Garantia Apple 1 ano' => 'com Garantia Apple 1 ano'; quantity 1 => 'tenho só uma unidade nessa condição'; acessório => 'já ajuda a sair com o kit mais completo'.",
  "Se um produto tiver disclosure_price null, escreva preço como '[a confirmar]' e não crie preço.",
  "Se discount_percent for null ou zero, NÃO use linguagem de desconto/promoção.",
  "Se discount_percent existir, pode usar 'de/por' com base_price e disclosure_price exatos.",
  "Parcelamento só pode ser citado se installment_text existir e deve usar EXATAMENTE installment_text. Não some valores entre produtos.",
  "Se gift_text for null, não escreva 'kit incluso' nem brinde algum.",
  "Garantia só pode ser citada se warranty_label existir. Use exatamente warranty_label, sem trocar Apple por Nobretech ou Nobretech por Apple. Se warranty_label for null, não mencione garantia.",
  "Só fale 'última unidade' quando quantity for 1. Se quantity > 1, não use última unidade.",
  "Se item for acessório barato e houver iPhone/aparelho no conjunto, trate o acessório como complemento, não como oferta principal.",
  "Diferencie produto principal, produtos em destaque e acessório. O principal pode ser foco; destaque/oferta merece mais energia; acessório complementa o kit.",
  "Para múltiplos produtos: cada produto tem o próprio preço, parcelamento, brinde e observação. NUNCA somar preços como combo.",
  "Preencha product_copies para CADA produto enviado. Use product_id exatamente igual ao FACTS.products.product_id. Esses campos são textos editáveis por produto e devem vender o argumento real de cada item.",
  "WhatsApp deve ser curto, comercial e pronto para copiar: 1 produto até 10 linhas; 2 produtos até 16 linhas; mais produtos devem resumir e não virar catálogo gigante. Não inclua análise interna.",
  "Todos os campos devem ser concisos. Não escreva parágrafos longos no JSON. product_copies deve trazer frases curtas para UI, não relatório.",
  "Padrão de qualidade do WhatsApp: começar pelo melhor argumento real, explicar o conjunto em linguagem natural e fechar com uma ação simples. Exemplo de estilo: 'Esse iPhone 14 ficou bem interessante pelo conjunto: seminovo, bateria 100%, garantia Nobretech e ainda caiu de R$ 2.490 para R$ 2.290. Já vai com capa, fonte e película, então a pessoa sai com o kit pronto para usar. Tenho só uma unidade nessa condição. Se fizer sentido, eu já deixo reservado pra você.' Não copie sempre; use como referência de força comercial.",
  "Linguagem pública de condição: produto lacrado deve aparecer como 'Lacrado'; produto usado/seminovo deve aparecer como 'Seminovo'. Não escreva Grade A, Grade A+, Grade B, Grade B-, Grade C ou variações técnicas de grade em textos públicos.",
  "Se o produto for Lacrado, não use bateria como argumento público, mesmo que battery_health seja 100. Para produto Seminovo, pode citar bateria quando o dado existir.",
  "Legenda Instagram deve ter gancho forte, lista/argumento dos produtos, confiança e CTA, com hashtags discretas.",
  "Para whatsapp_line, instagram_line e story_whatsapp_text, escreva textos úteis por produto. story_whatsapp_text deve ser pronto para copiar individualmente, com linhas de produto, condição, garantia somente quando warranty_label existir, preço/parcela somente quando existirem, estoque real e CTA curto.",
  "Stories: o sistema envia FACTS.story_plan com a sequência exata de stories (vitrines paginadas + opcionais de destaque/CTA/confiança). Você DEVE retornar channel_copy.stories com EXATAMENTE o mesmo número de itens, na mesma ordem, com o mesmo `index` e `kind`. Cada item recebe headline, subtitle e cta curtos. Para `kind=vitrine` escreva headline/subtitle que cubram a página, respeitando o `density` informado: detailed = pode ter texto mais longo; standard = texto médio; compact = headline e subtitle curtos para não competir com a lista. Para `kind=highlight` foque no produto principal. Para `kind=cta` foque no fechamento. NUNCA omita um item, NUNCA esconda produto, NUNCA reduza a contagem de stories, NUNCA mude `density` ou `kind`.",
  "Objetivo da campanha (FACTS.general.objective) deve mudar tom e ângulo: sell_fast = disponibilidade/urgência real; generate_desire = experiência e desejo; bundle_gift = kit/brinde como argumento principal; trust_proof = revisão, garantia, procedência; new_arrival = chegada/novidade; reactivate_lead = retomada consultiva sem pressão. Em vitrines com mais de uma página, NUNCA repita exatamente a mesma headline em todas as páginas; a página 1 abre o argumento e a página 2+ deve dar uma framing de continuação (ex: 'Mais opções', 'Continuação da seleção'). Se você não tiver nada melhor que `deterministic_headline`/`deterministic_subtitle`, devolva exatamente esses textos para que o sistema mantenha o fallback determinístico.",
  "offer_alerts devem ser úteis: exemplo 'O desconto do iPhone é o argumento mais forte.' ou 'O carregador deve entrar como complemento, não como oferta principal.'",
  "Nunca use frases genéricas proibidas: 'Tenho produtos prontos para venda', 'Posso esclarecer dúvidas', 'Confira nosso catálogo', 'Pergunte pelo produto', 'Seleção verificada', 'Produto de qualidade', 'Olá! Tenho dois produtos prontos para venda'.",
  "Pode usar poucos emojis no WhatsApp quando ajudarem a escanear: no máximo 1 emoji por linha e poucos emojis no total. Não use emojis em excesso. Não use exclamações duplas. Não invente '#hashtag' fora de Instagram.",
  "Se faltar dado relevante, escreva de forma neutra sem preencher lacunas com invenção.",
  "Se FACTS.general.history_summary existir, use apenas como referência editorial para melhorar textos anteriores. Não reutilize preço antigo como preço atual; números atuais só podem vir dos produtos enviados em FACTS.products.",
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

function productDisplayName(f: ProductFacts): string {
  const parts = [f.name]
  if (f.storage && !f.name.toLocaleLowerCase("pt-BR").includes(f.storage.toLocaleLowerCase("pt-BR"))) {
    parts.push(f.storage)
  }
  if (f.color && !f.name.toLocaleLowerCase("pt-BR").includes(f.color.toLocaleLowerCase("pt-BR"))) {
    parts.push(f.color)
  }
  return parts.join(" ")
}

function fallbackStoryWhatsappText(f: ProductFacts): string {
  const lines: string[] = [`*${productDisplayName(f)}*`]
  if (f.grade) lines.push(`✅ ${f.grade === "Lacrado" ? "Lacrado" : "Seminovo revisado pela Nobretech"}`)
  if (f.grade !== "Lacrado" && f.battery_health != null) lines.push(`🔋 Bateria ${f.battery_health}%`)
  if (f.warrantyLabel) lines.push(`🛡 ${f.warrantyLabel}`)
  if (f.discount && f.basePrice != null && f.disclosurePrice != null) {
    lines.push(`💰 De ~${formatBRL(f.basePrice)}~ por ${formatBRL(f.disclosurePrice)}`)
  } else if (f.disclosurePrice != null) {
    lines.push(`💰 ${formatBRL(f.disclosurePrice)}`)
  }
  if (f.installment) lines.push(`💳 Até ${f.installment.text}`)
  if (f.gifts) lines.push(`🎁 ${f.gifts}`)
  if (f.quantity <= 1) lines.push("⚡ 1 unidade disponível")
  lines.push(f.productCta || "Me chama pra reservar.")
  return lines.join("\n")
}

function fallbackProductCopy(f: ProductFacts): ProductCopySuggestion {
  const title = f.copyTitle || productDisplayName(f)
  const strongest = f.copyStrongPoint || [
    f.discount ? "Condição com desconto real" : null,
    f.warrantyLabel || null,
    f.gifts ? `Inclui ${f.gifts}` : null,
    f.grade === "Lacrado" ? "Lacrado" : null,
    f.grade && f.grade !== "Lacrado" && f.battery_health != null ? `Bateria ${f.battery_health}%` : null,
    f.grade && f.grade !== "Lacrado" ? "Seminovo" : null,
  ].filter(Boolean)[0] || "Disponível para consulta"
  const cta = f.productCta || "Me chama pra reservar."
  return {
    productId: f.id,
    title,
    description: f.copyDescription || strongest,
    strongPoint: strongest,
    cta,
    objection: f.copyObjection || (f.warrantyLabel ? f.warrantyLabel : ""),
    shortPitch: f.copyDescription || strongest,
    trustArgument: f.warrantyLabel || (f.grade ? `${f.grade} conferido pela Nobretech` : ""),
    urgencyLine: f.quantity <= 1 ? "1 unidade disponível" : `${f.quantity} unidades disponíveis`,
    whatsappLine: `${title}: ${strongest}.`,
    instagramLine: `${title} — ${strongest}.`,
    storyWhatsappText: fallbackStoryWhatsappText(f),
  }
}

function hasForbiddenWarrantyClaim(text: string, facts: ProductFacts[]): boolean {
  const lower = text.toLocaleLowerCase("pt-BR")
  const mentionsWarranty = /garantia/.test(lower)
  if (!mentionsWarranty) return false
  const allowedLabels = facts.map((f) => f.warrantyLabel.trim()).filter(Boolean)
  if (allowedLabels.length === 0) return true
  const hasNobretechWarranty = allowedLabels.some((label) => /nobretech/i.test(label))
  const hasAppleWarranty = allowedLabels.some((label) => /apple/i.test(label))
  if (/garantia\s+nobretech/i.test(text) && !hasNobretechWarranty) return true
  if (/garantia\s+apple/i.test(text) && !hasAppleWarranty) return true
  return false
}

function isUnsafeProductCopy(copy: ProductCopySuggestion, fact: ProductFacts): boolean {
  const text = [
    copy.title,
    copy.description,
    copy.strongPoint,
    copy.cta,
    copy.objection,
    copy.shortPitch,
    copy.trustArgument,
    copy.urgencyLine,
    copy.whatsappLine,
    copy.instagramLine,
    copy.storyWhatsappText,
  ].filter(Boolean).join("\n")
  return hasForbiddenWarrantyClaim(text, [fact])
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
    product_id: string
    commercial_title: string
    short_pitch: string
    trust_argument: string
    urgency_line: string
    cta_line: string
    whatsapp_line: string
    instagram_line: string
    story_whatsapp_text: string
  }>
  channel_copy: {
    whatsapp_text: string
    instagram_caption: string
    stories: Array<{
      index: number
      kind: "vitrine" | "highlight" | "cta" | "trust"
      headline: string
      subtitle: string
      cta: string
    }>
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
      typeof c.product_id !== "string" ||
      typeof c.commercial_title !== "string" ||
      typeof c.short_pitch !== "string" ||
      typeof c.trust_argument !== "string" ||
      typeof c.urgency_line !== "string" ||
      typeof c.cta_line !== "string" ||
      typeof c.whatsapp_line !== "string" ||
      typeof c.instagram_line !== "string" ||
      typeof c.story_whatsapp_text !== "string"
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
    typeof ch.instagram_caption !== "string"
  ) {
    throw new MarketingAIError("invalid_schema", "AI channel_copy has invalid text fields.")
  }
  if (
    !Array.isArray(ch.stories) ||
    ch.stories.length === 0 ||
    !ch.stories.every(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof (s as { headline?: unknown }).headline === "string" &&
        typeof (s as { subtitle?: unknown }).subtitle === "string" &&
        typeof (s as { cta?: unknown }).cta === "string" &&
        typeof (s as { index?: unknown }).index === "number" &&
        typeof (s as { kind?: unknown }).kind === "string"
    )
  ) {
    throw new MarketingAIError("invalid_schema", "AI stories array is invalid.")
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
  historySummary?: string
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
      productCopies: deterministic.facts.map(fallbackProductCopy),
    }
  }

  const facts = deterministic.facts
  const storyPlan: FactPayload["story_plan"] = deterministic.stories.map((s, i) => ({
    index: i + 1,
    kind: s.kind,
    label: s.label,
    page: s.pageInfo?.page,
    total_pages: s.pageInfo?.total,
    density: s.density,
    deterministic_headline: s.headline,
    deterministic_subtitle: s.sub,
    product_ids: s.vitrineProducts
      ? s.vitrineProducts.map((v) => v.productId)
      : facts.find((f) => f.name === s.productName)
      ? [facts.find((f) => f.name === s.productName)!.id]
      : [],
  }))
  const payload = buildFactPayload(facts, options.strategy, storyPlan, options.historySummary)

  try {
    const ai = await callOpenAI(payload)
    const aiWhatsapp = stripInternalLabels(ai.channel_copy.whatsapp_text)
    const aiInstagram = stripInternalLabels(ai.channel_copy.instagram_caption)
    const maxWhatsappLines = facts.length <= 1 ? 10 : facts.length === 2 ? 16 : 18
    const merged: GeneratedContent = {
      ...deterministic,
      whatsapp: isUnsafeFinalCopy(aiWhatsapp) || hasForbiddenWarrantyClaim(aiWhatsapp, facts)
        ? deterministic.whatsapp
        : compactLines(aiWhatsapp, maxWhatsappLines),
      instagram: isUnsafeFinalCopy(aiInstagram) || hasForbiddenWarrantyClaim(aiInstagram, facts) ? deterministic.instagram : aiInstagram,
      stories: deterministic.stories.map((story, i) => {
        // Match by index when provided, otherwise fall back to position.
        const aiStory =
          ai.channel_copy.stories.find((s) => s.index === i + 1) ?? ai.channel_copy.stories[i]
        if (!aiStory) return story
        const aiHeadline = stripInternalLabels(aiStory.headline || "")
        const aiSub = stripInternalLabels(aiStory.subtitle || "")
        // Reject empty, label-poisoned, generic or pure "vitrine X/Y" headlines —
        // those let the deterministic objective copy win instead.
        const isPlaceholderHeadline =
          !aiHeadline ||
          /^vitrine\s*\d+\s*[\/\-]\s*\d+/i.test(aiHeadline) ||
          isUnsafeFinalCopy(aiHeadline)
        const isPlaceholderSub = !aiSub || isUnsafeFinalCopy(aiSub)
        return {
          ...story,
          headline: isPlaceholderHeadline ? story.headline : aiHeadline,
          sub: isPlaceholderSub ? story.sub : aiSub,
          ctaMain:
            story.kind === "cta"
              ? stripInternalLabels(aiStory.cta || "") || story.ctaMain
              : story.ctaMain,
        }
      }),
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
    const aiCopiesByProduct = new Map(ai.product_copies.map((copy) => [copy.product_id, copy]))
    let fallbackCopyCount = 0
    const productCopies: ProductCopySuggestion[] = facts.map((fact) => {
      const copy = aiCopiesByProduct.get(fact.id)
      if (!copy) {
        fallbackCopyCount += 1
        return fallbackProductCopy(fact)
      }
      const candidate: ProductCopySuggestion = {
        productId: copy.product_id,
        title: stripInternalLabels(copy.commercial_title),
        description: stripInternalLabels(copy.short_pitch),
        strongPoint: stripInternalLabels(copy.trust_argument),
        cta: stripInternalLabels(copy.cta_line),
        objection: [stripInternalLabels(copy.trust_argument), stripInternalLabels(copy.urgency_line)].filter(Boolean).join(" "),
        shortPitch: stripInternalLabels(copy.short_pitch),
        trustArgument: stripInternalLabels(copy.trust_argument),
        urgencyLine: stripInternalLabels(copy.urgency_line),
        whatsappLine: stripInternalLabels(copy.whatsapp_line),
        instagramLine: stripInternalLabels(copy.instagram_line),
        storyWhatsappText: stripInternalLabels(copy.story_whatsapp_text),
      }
      if (isUnsafeProductCopy(candidate, fact)) {
        fallbackCopyCount += 1
        return fallbackProductCopy(fact)
      }
      return candidate
    })
    return {
      content: fallbackCopyCount > 0
        ? {
            ...merged,
            warnings: [
              ...merged.warnings,
              `IA aplicada parcialmente: ${fallbackCopyCount} ${fallbackCopyCount === 1 ? "produto ficou" : "produtos ficaram"} com template.`,
            ],
          }
        : merged,
      source: "ai",
      productCopies,
      campaignAngle: {
        title: ai.campaign_angle.title.trim(),
        reason: ai.campaign_angle.reason.trim(),
        mainHook: ai.campaign_angle.main_hook.trim(),
        commercialStrategy: ai.campaign_angle.commercial_strategy.trim(),
      },
      offerAlerts: [
        ...ai.offer_alerts.filter(Boolean),
        fallbackCopyCount > 0
          ? `IA aplicada parcialmente: ${fallbackCopyCount} ${fallbackCopyCount === 1 ? "produto ficou" : "produtos ficaram"} com template.`
          : `IA aplicada a ${facts.length} ${facts.length === 1 ? "produto" : "produtos"}.`,
      ],
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
      productCopies: deterministic.facts.map(fallbackProductCopy),
    }
  }
}
