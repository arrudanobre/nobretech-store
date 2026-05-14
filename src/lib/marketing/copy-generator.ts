import { calculatePaymentPrice } from "@/lib/helpers"

export type ObjectiveKey =
  | "sell_fast"
  | "generate_desire"
  | "bundle_gift"
  | "trust_proof"
  | "new_arrival"
  | "reactivate_lead"

export type ChannelKey = "stories" | "carousel" | "whatsapp" | "instagram"
export type ToneKey = "consultivo" | "direto" | "premium" | "amigavel"
export type UrgencyLevel = "none" | "low" | "high"
export type TagType =
  | "grade"
  | "battery"
  | "stock"
  | "new"
  | "warranty_apple"
  | "warranty_nobretech"
  | "gift"
  | "installment"
  | "color"

// Inventory product as returned by /api/marketing/products
export interface MarketingProduct {
  id: string
  name: string
  category: string | null
  storage: string | null
  color: string | null
  brand: string | null
  grade: string | null
  battery_health: number | null
  suggested_price: number | null
  quantity: number
  commercial_status: string
  notes: string | null
  has_imei: boolean
  warranty_label?: string | null
  warranty_source?: "inventory" | "manual" | null
  variants: Array<{ color_name: string; quantity: number; suggested_price: number | null }>
}

// Editable per-product draft inside the campaign.
export interface ProductDraft {
  product: MarketingProduct
  isPrimary: boolean
  isFeatured: boolean
  basePrice: number | null
  disclosurePrice: number | null
  installmentCount: number
  gifts: string
  warrantyLabel: string
  warrantySource?: "inventory" | "manual" | null
  copyTitle: string
  copyDescription: string
  copyStrongPoint: string
  copyObjection: string
  productNote: string
  productCta: string
}

// General strategy of the campaign (shared across products).
export interface GeneralStrategy {
  objective: ObjectiveKey
  channel: ChannelKey
  tone: ToneKey
  urgencyLevel: UrgencyLevel
  generalCta: string
  generalNote: string
  angle: string
}

export interface InstallmentInfo {
  count: number
  text: string
  perInstallment: number
  total: number
  fee: number
  hasFee: boolean
}

export interface DiscountInfo {
  amount: number
  percent: number
}

export interface ProductFacts {
  id: string
  name: string
  storage: string | null
  color: string | null
  grade: string | null
  battery_health: number | null
  quantity: number
  basePrice: number | null
  disclosurePrice: number | null
  discount: DiscountInfo | null
  installment: InstallmentInfo | null
  gifts: string
  warrantyLabel: string
  warrantySource: "inventory" | "manual" | null
  copyTitle: string
  copyDescription: string
  copyStrongPoint: string
  copyObjection: string
  productNote: string
  productCta: string
  isPrimary: boolean
  isFeatured: boolean
}

export interface StoryTag {
  type: TagType
  label: string
}

export interface VitrineItem {
  name: string
  price: string | null
  basePrice: string | null
  discountPercent: number | null
  parcel: string | null
  tags: StoryTag[]
  warrantyLabel: string | null
  gifts: string | null
  color: string | null
  hasDiscount: boolean
  isFeatured: boolean
  grade: string | null
  storage: string | null
  quantity: number
  isPrimary: boolean
}

export interface StoryData {
  badge: string
  headline: string
  sub: string
  tags: StoryTag[]
  productName: string
  price: string | null
  basePrice: string | null
  parcel: string | null
  detailLines: string[]
  urgencyLine: string | null
  ctaMain: string | null
  ctaSub: string | null
  vitrineProducts?: VitrineItem[]
}

export interface CarouselSlide {
  index: number
  title: string
  body: string
}

export interface CarouselSlideVisual extends CarouselSlide {
  type: "cover" | "product" | "vitrine" | "trust" | "offer" | "cta"
  badge?: string
  price?: string
  parcel?: string
  detailLines?: string[]
  bgDark: boolean
  vitrineItems?: VitrineItem[]
}

export interface GeneratedContent {
  stories: [StoryData, StoryData, StoryData]
  carousel: CarouselSlideVisual[]
  whatsapp: string
  instagram: string
  facts: ProductFacts[]
  source: "deterministic" | "ai"
  warnings: string[]
}

export interface ProductCopySuggestion {
  productId: string
  title: string
  description: string
  strongPoint: string
  cta: string
  objection: string
}

export interface CampaignAngleSuggestion {
  title: string
  reason: string
  mainHook: string
  commercialStrategy: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

export function parseBRLInput(raw: string): number | null {
  if (!raw) return null
  if (raw.trim().startsWith("-")) return null
  const cleaned = raw.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")
  const v = parseFloat(cleaned)
  if (!isFinite(v) || v <= 0) return null
  return Math.round(v * 100) / 100
}

export function calculateInstallmentDisplay(
  price: number,
  count: number
): InstallmentInfo | null {
  if (count <= 0 || count > 18 || !price || price <= 0) return null
  const method = `credit_${count}x`
  const result = calculatePaymentPrice(price, method, {})
  const hasFee = result.fee > 0
  return {
    count,
    text: `${count}x de ${formatBRL(result.installmentValue)}`,
    perInstallment: result.installmentValue,
    total: result.price,
    fee: result.fee,
    hasFee,
  }
}

export function calculateDiscount(basePrice: number | null, disclosurePrice: number | null): DiscountInfo | null {
  if (basePrice == null || disclosurePrice == null) return null
  if (disclosurePrice >= basePrice) return null
  const amount = Math.round((basePrice - disclosurePrice) * 100) / 100
  const percent = Math.round((amount / basePrice) * 100 * 10) / 10
  if (amount <= 0) return null
  return { amount, percent }
}

function includesToken(text: string | null | undefined, token: string | null | undefined): boolean {
  if (!text || !token) return false
  return text.toLocaleLowerCase("pt-BR").includes(token.toLocaleLowerCase("pt-BR"))
}

function productDisplayName(facts: Pick<ProductFacts, "name" | "storage" | "color">): string {
  const parts = [facts.name]
  if (facts.storage && !includesToken(facts.name, facts.storage)) parts.push(facts.storage)
  if (facts.color && !includesToken(facts.name, facts.color)) parts.push(facts.color)
  return parts.filter(Boolean).join(" ")
}

export function buildProductFacts(draft: ProductDraft): ProductFacts {
  const p = draft.product
  const base = draft.basePrice ?? p.suggested_price
  const disclosure = draft.disclosurePrice ?? base
  const discount = calculateDiscount(base, disclosure)
  const installment = disclosure ? calculateInstallmentDisplay(disclosure, draft.installmentCount) : null
  const deterministicTitle = productDisplayName({ name: p.name, storage: p.storage, color: p.color })
  const deterministicDescription = [
    p.grade ? conditionLabel(p.grade) : null,
    p.battery_health != null ? `bateria ${p.battery_health}%` : null,
    draft.warrantyLabel.trim() || null,
    draft.gifts.trim() ? `com ${draft.gifts.trim()}` : null,
  ].filter(Boolean).join(", ")
  const deterministicStrongPoint = discount
    ? `desconto de ${formatBRL(discount.amount)}`
    : draft.gifts.trim()
    ? `kit incluso: ${draft.gifts.trim()}`
    : p.battery_health != null
    ? `bateria ${p.battery_health}%`
    : p.grade
    ? conditionLabel(p.grade)
    : "produto disponível para consulta"
  return {
    id: p.id,
    name: p.name,
    storage: p.storage,
    color: p.color,
    grade: p.grade,
    battery_health: p.battery_health,
    quantity: p.quantity,
    basePrice: base ?? null,
    disclosurePrice: disclosure ?? null,
    discount,
    installment,
    gifts: draft.gifts.trim(),
    warrantyLabel: draft.warrantyLabel.trim(),
    warrantySource: draft.warrantyLabel.trim()
      ? draft.warrantySource ?? draft.product.warranty_source ?? "manual"
      : null,
    copyTitle: draft.copyTitle.trim() || deterministicTitle,
    copyDescription: draft.copyDescription.trim() || deterministicDescription,
    copyStrongPoint: draft.copyStrongPoint.trim() || deterministicStrongPoint,
    copyObjection: draft.copyObjection.trim(),
    productNote: draft.productNote.trim(),
    productCta: draft.productCta.trim(),
    isPrimary: draft.isPrimary,
    isFeatured: draft.isFeatured,
  }
}

function buildTags(facts: ProductFacts): StoryTag[] {
  const tags: StoryTag[] = []
  if (facts.grade) {
    tags.push({ type: "grade", label: facts.grade === "Lacrado" ? "Lacrado" : `Grade ${facts.grade}` })
  }
  if (facts.battery_health != null) {
    tags.push({ type: "battery", label: `Bateria ${facts.battery_health}%` })
  }
  if (facts.quantity <= 1) {
    tags.push({ type: "stock", label: "Última unidade" })
  } else if (facts.quantity <= 3) {
    tags.push({ type: "stock", label: `${facts.quantity} unidades` })
  }
  if (facts.warrantyLabel) {
    const type = /apple/i.test(facts.warrantyLabel) ? "warranty_apple" : "warranty_nobretech"
    tags.push({ type, label: facts.warrantyLabel })
  }
  if (facts.gifts) tags.push({ type: "gift", label: `Brinde: ${facts.gifts}` })
  if (facts.installment) tags.push({ type: "installment", label: facts.installment.text })
  if (facts.color) tags.push({ type: "color", label: facts.color })
  return tags
}

function conditionLabel(grade: string | null): string {
  if (!grade) return "Produto"
  if (grade === "Lacrado") return "Lacrado"
  if (grade.startsWith("A")) return `Seminovo Grade ${grade}`
  return `Condição ${grade}`
}

function whatsappConditionLine(f: ProductFacts): string | null {
  if (!f.grade) return null
  if (f.grade === "Lacrado") return "✅ Lacrado"
  return `✅ Grade ${f.grade}, revisado pela Nobretech`
}

function buildDetailLines(facts: ProductFacts): string[] {
  const lines: string[] = []
  if (facts.storage) lines.push(facts.storage)
  if (facts.color) lines.push(`Cor: ${facts.color}`)
  if (facts.battery_health != null) lines.push(`Bateria ${facts.battery_health}%`)
  if (facts.grade) lines.push(conditionLabel(facts.grade))
  if (facts.warrantyLabel) lines.push(facts.warrantyLabel)
  if (facts.gifts) lines.push(`Kit: ${facts.gifts}`)
  if (facts.productNote) lines.push(facts.productNote)
  if (facts.quantity <= 1) lines.push("Última unidade")
  else if (facts.quantity <= 3) lines.push(`${facts.quantity} unidades`)
  return lines
}

function urgencyBodyLine(level: UrgencyLevel, quantity: number): string | null {
  if (level === "none") return null
  if (level === "low") {
    if (quantity <= 1) return "Última unidade nessa condição."
    if (quantity <= 5) return "Poucas unidades disponíveis."
    return "Disponibilidade por lote — condição pode mudar."
  }
  if (quantity <= 1) return "Última unidade disponível. Não reservo sem confirmação."
  if (quantity <= 3) return `Apenas ${quantity} unidades. Confirme rápido.`
  return "Condição limitada. Disponibilidade pode mudar com o lote."
}

function urgencyWhatsAppLine(level: UrgencyLevel, quantity: number): string {
  if (level === "none") return "Disponível agora."
  if (level === "low") {
    if (quantity <= 1) return "Tenho apenas uma unidade nessa condição."
    if (quantity <= 5) return "Tenho poucas unidades — disponibilidade por lote."
    return "Condição disponível enquanto o lote durar."
  }
  if (quantity <= 1) return "Última unidade disponível. Me chama agora."
  if (quantity <= 3) return `Apenas ${quantity} unidades restantes.`
  return "Condição limitada por disponibilidade — confirma antes de publicar."
}

const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  sell_fast: "Vender Rápido",
  generate_desire: "Gerar Desejo",
  bundle_gift: "Kit / Brinde",
  trust_proof: "Prova de Confiança",
  new_arrival: "Recém-chegado",
  reactivate_lead: "Reativar Lead",
}

const TONE_LABELS: Record<ToneKey, string> = {
  consultivo: "Consultivo",
  direto: "Direto",
  premium: "Premium",
  amigavel: "Amigável",
}

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  stories: "Stories",
  carousel: "Carrossel",
  whatsapp: "WhatsApp",
  instagram: "Legenda Instagram",
}

function pickPrimary(facts: ProductFacts[]): ProductFacts {
  return facts.find((f) => f.isPrimary) ?? facts[0]
}

function sortProductsForVitrine(facts: ProductFacts[]): ProductFacts[] {
  return [...facts].sort((a, b) => {
    const aDiscount = a.discount ? 1 : 0
    const bDiscount = b.discount ? 1 : 0
    if (aDiscount !== bDiscount) return bDiscount - aDiscount

    const aFeatured = a.isFeatured ? 1 : 0
    const bFeatured = b.isFeatured ? 1 : 0
    if (aFeatured !== bFeatured) return bFeatured - aFeatured

    const aUrgent = a.quantity <= 1 ? 1 : 0
    const bUrgent = b.quantity <= 1 ? 1 : 0
    if (aUrgent !== bUrgent) return bUrgent - aUrgent

    const aPrimary = a.isPrimary ? 1 : 0
    const bPrimary = b.isPrimary ? 1 : 0
    if (aPrimary !== bPrimary) return bPrimary - aPrimary

    return (b.disclosurePrice ?? 0) - (a.disclosurePrice ?? 0)
  })
}

function buildVitrineItems(facts: ProductFacts[]): VitrineItem[] {
  return facts.slice(0, 6).map((f) => ({
    name: f.copyTitle || f.name,
    price: f.disclosurePrice != null ? formatBRL(f.disclosurePrice) : null,
    basePrice: f.discount && f.basePrice != null ? formatBRL(f.basePrice) : null,
    discountPercent: f.discount?.percent ?? null,
    parcel: f.installment?.text ?? null,
    tags: buildTags(f).slice(0, 6),
    warrantyLabel: f.warrantyLabel || null,
    gifts: f.gifts || null,
    color: f.color,
    hasDiscount: Boolean(f.discount),
    isFeatured: f.isFeatured,
    grade: f.grade,
    storage: f.storage,
    quantity: f.quantity,
    isPrimary: f.isPrimary,
  }))
}

function contextualCta(facts: ProductFacts[], strategy: GeneralStrategy): { main: string; sub: string } {
  const primary = pickPrimary(facts)
  const customCta = (strategy.generalCta || primary.productCta).trim()
  const hasDiscount = facts.some((f) => f.discount)
  const hasUrgency = facts.some((f) => f.quantity <= 1)
  const hasMultipleProducts = facts.length > 1
  const hasVariation = Boolean(primary.color || primary.productNote.toLowerCase().includes("cor"))

  if (customCta) return { main: customCta, sub: "Me chama que eu te passo as condições." }
  if (hasUrgency) return { main: "Última unidade nessa condição.", sub: "Me chama para reservar." }
  if (hasDiscount) return { main: "Condição especial disponível.", sub: "Me chama que eu vejo se ainda está disponível." }
  if (hasMultipleProducts) {
    return {
      main: "Escolhe o modelo que combina contigo.",
      sub: "Me chama e eu te mando as condições de cada modelo.",
    }
  }
  if (hasVariation) return { main: "Gostou desse modelo?", sub: "Me chama para confirmar a cor disponível." }
  return { main: "Gostou dessa unidade?", sub: "Me chama para reservar essa unidade." }
}

function relevantStory2Facts(facts: ProductFacts[]): ProductFacts[] {
  return facts
    .filter((f) => f.isFeatured || Boolean(f.discount) || f.quantity <= 1 || Boolean(f.warrantyLabel) || Boolean(f.gifts))
    .slice(0, 4)
}

// ─── Story generators ────────────────────────────────────────────────────────

function generateStory1(facts: ProductFacts[], strategy: GeneralStrategy): StoryData {
  const primary = pickPrimary(facts)
  const isMulti = facts.length > 1
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : null
  const basePriceStr = primary.discount && primary.basePrice != null ? formatBRL(primary.basePrice) : null
  const parcel = primary.installment?.text ?? null

  const badgeMap: Record<ObjectiveKey, string> = {
    sell_fast: "DISPONÍVEL HOJE",
    generate_desire: "OPORTUNIDADE",
    bundle_gift: "KIT COMPLETO",
    trust_proof: "CONFERIDO",
    new_arrival: "RECÉM-CHEGADO",
    reactivate_lead: "AINDA DISPONÍVEL",
  }

  const headlineMap: Record<ObjectiveKey, string> = {
    sell_fast: isMulti ? `${facts.length} opções\ndisponíveis.` : "Sem fila.\nSem espera.",
    generate_desire: isMulti ? "Escolha\na sua condição." : `Imagina você\ncom esse ${primary.name.split(" ")[0]}.`,
    bundle_gift: primary.gifts ? "Já sai\ncom tudo." : "Produto completo.\nSem surpresa depois.",
    trust_proof: "Conferido.\nProcedência garantida.",
    new_arrival: isMulti ? "Chegou\nnovo lote." : "Acabou\nde chegar.",
    reactivate_lead: isMulti ? "Ainda\ndisponível." : "Ele ainda\nestá aqui.",
  }

  if (isMulti) {
    return {
      badge: badgeMap[strategy.objective],
      headline: headlineMap[strategy.objective],
      sub: `${facts.length} produtos disponíveis`,
      tags: [],
      productName: primary.name,
      price: priceStr,
      basePrice: basePriceStr,
      parcel,
      detailLines: [],
      urgencyLine: urgencyBodyLine(strategy.urgencyLevel, primary.quantity),
      ctaMain: null,
      ctaSub: null,
      vitrineProducts: buildVitrineItems(facts.slice(0, 4)),
    }
  }

  const subMap: Record<ObjectiveKey, string> = {
    sell_fast: `${primary.name} disponível agora.`,
    generate_desire: `${conditionLabel(primary.grade)} — pronto pra você.`,
    bundle_gift: primary.gifts ? `${primary.name} + ${primary.gifts}` : primary.name,
    trust_proof: `${primary.name} — ${conditionLabel(primary.grade)}`,
    new_arrival: `${primary.name} ${primary.storage ?? ""} chegou.`,
    reactivate_lead: `${primary.name} — ainda disponível para você.`,
  }

  return {
    badge: badgeMap[strategy.objective],
    headline: headlineMap[strategy.objective],
    sub: subMap[strategy.objective],
    tags: buildTags(primary),
    productName: primary.name,
    price: priceStr,
    basePrice: basePriceStr,
    parcel,
    detailLines: [],
    urgencyLine: urgencyBodyLine(strategy.urgencyLevel, primary.quantity),
    ctaMain: null,
    ctaSub: null,
  }
}

function generateStory2(facts: ProductFacts[], strategy: GeneralStrategy): StoryData {
  const primary = pickPrimary(facts)
  const isMulti = facts.length > 1
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : null
  const basePriceStr = primary.discount && primary.basePrice != null ? formatBRL(primary.basePrice) : null
  const parcel = primary.installment?.text ?? null

  if (isMulti) {
    const featuredFacts = relevantStory2Facts(facts)
    if (featuredFacts.length === 0) {
      return {
        badge: "CONFIANÇA",
        headline: "Escolha com\nsegurança.",
        sub: "Produtos conferidos e condições por modelo",
        tags: [],
        productName: primary.name,
        price: null,
        basePrice: null,
        parcel: null,
        detailLines: ["Conferência individual", "Preço e parcela por produto", "Atendimento no WhatsApp"],
        urgencyLine: null,
        ctaMain: null,
        ctaSub: null,
      }
    }
    return {
      badge: "DESTAQUES",
      headline: "Ofertas e\nmelhores sinais.",
      sub: "Destaques, descontos, brinde ou última unidade",
      tags: [],
      productName: primary.name,
      price: priceStr,
      basePrice: basePriceStr,
      parcel,
      detailLines: [],
      urgencyLine: urgencyBodyLine(strategy.urgencyLevel, primary.quantity),
      ctaMain: null,
      ctaSub: null,
      vitrineProducts: buildVitrineItems(featuredFacts),
    }
  }

  const subMap: Record<ObjectiveKey, string> = {
    sell_fast: "Especificações:",
    generate_desire: "Todos os detalhes:",
    bundle_gift: primary.gifts ? `Incluso: ${primary.gifts}` : "Especificações:",
    trust_proof: "Verificado:",
    new_arrival: "Lote recente:",
    reactivate_lead: "Ainda disponível:",
  }

  return {
    badge: primary.isPrimary && facts.length > 1 ? "PRINCIPAL" : "DETALHES",
    headline: primary.name,
    sub: subMap[strategy.objective],
    tags: buildTags(primary),
    productName: primary.name,
    price: priceStr,
    basePrice: basePriceStr,
    parcel,
    detailLines: buildDetailLines(primary),
    urgencyLine: urgencyBodyLine(strategy.urgencyLevel, primary.quantity),
    ctaMain: null,
    ctaSub: null,
  }
}

function generateStory3(facts: ProductFacts[], strategy: GeneralStrategy): StoryData {
  const primary = pickPrimary(facts)
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : null
  const parcel = primary.installment?.text ?? null
  const cta = contextualCta(facts, strategy)

  const ctaMap: Record<ObjectiveKey, { main: string; sub: string }> = {
    sell_fast: cta,
    generate_desire: cta,
    bundle_gift: cta,
    trust_proof: cta,
    new_arrival: cta,
    reactivate_lead: cta,
  }

  const warrantyTrustLine = primary.warrantyLabel || null
  const baseTrustLines: Record<ObjectiveKey, string[]> = {
    sell_fast: ["Entrega rápida", "Nota fiscal"],
    generate_desire: ["Produto original", "Suporte pós-venda"],
    bundle_gift: primary.gifts ? ["Kit completo", "Sem gasto adicional", "Entrega junto"] : ["Produto conferido", "Nota fiscal"],
    trust_proof: ["Produto conferido", "Serial verificado", "Portal de compra incluso"],
    new_arrival: ["Lote recente", "Produto conferido"],
    reactivate_lead: ["Mesmo produto", "Disponível agora"],
  }
  const trustLines = warrantyTrustLine
    ? { ...baseTrustLines, [strategy.objective]: [...baseTrustLines[strategy.objective], warrantyTrustLine] }
    : baseTrustLines

  return {
    badge: "CONTATO",
    headline: ctaMap[strategy.objective].main,
    sub: ctaMap[strategy.objective].sub,
    tags: [],
    productName: primary.name,
    price: priceStr,
    basePrice: null,
    parcel,
    detailLines: [
      `${facts.length} ${facts.length === 1 ? "opção disponível" : "opções disponíveis"}`,
      facts.find((f) => f.discount)?.copyStrongPoint || primary.copyStrongPoint,
      ...trustLines[strategy.objective],
    ].filter(Boolean).slice(0, 4),
    urgencyLine: null,
    ctaMain: ctaMap[strategy.objective].main,
    ctaSub: priceStr ? `${priceStr}${parcel ? ` · ${parcel}` : ""}` : null,
  }
}

// ─── Carousel ────────────────────────────────────────────────────────────────

function generateCarousel(facts: ProductFacts[], strategy: GeneralStrategy): CarouselSlideVisual[] {
  const primary = pickPrimary(facts)
  const isMulti = facts.length > 1
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : "[preço a confirmar]"
  const parcel = primary.installment?.text ?? null

  const slides: CarouselSlideVisual[] = []

  slides.push({
    index: 1,
    type: "cover",
    bgDark: true,
    badge: isMulti ? `${facts.length} OPÇÕES` : conditionLabel(primary.grade).toUpperCase(),
    title: isMulti
      ? "Disponível\nagora"
      : {
          sell_fast: "Disponível\nhoje",
          generate_desire: "Esse é\no momento",
          bundle_gift: "Kit\ncompleto",
          trust_proof: "Produto\nconferido",
          new_arrival: "Recém\nchegou",
          reactivate_lead: "Ainda\ndisponível",
        }[strategy.objective],
    body: isMulti ? facts.slice(0, 3).map((f) => f.name).join("\n") : primary.name,
    price: priceStr,
    parcel: parcel ?? undefined,
    detailLines: [],
  })

  if (isMulti) {
    slides.push({
      index: 2,
      type: "vitrine",
      bgDark: true,
      title: "Produtos\ndisponíveis",
      body: "",
      badge: "VITRINE",
      detailLines: [],
      vitrineItems: buildVitrineItems(facts),
    })
  } else {
    const specLines = [
      primary.storage,
      primary.color && `Cor: ${primary.color}`,
      primary.battery_health != null && `Bateria ${primary.battery_health}%`,
      primary.grade && conditionLabel(primary.grade),
    ].filter(Boolean) as string[]

    slides.push({
      index: 2,
      type: "product",
      bgDark: true,
      title: primary.name,
      body: specLines.slice(0, 2).join("\n"),
      badge: "PRODUTO",
      detailLines: specLines,
    })
  }

  const benefitLines = primary.gifts
    ? [`+ ${primary.gifts}`, "Kit completo incluso", "Sem gasto adicional"]
    : ["Produto conferido", primary.warrantyLabel, "Nota fiscal"].filter(Boolean) as string[]

  slides.push({
    index: 3,
    type: "trust",
    bgDark: false,
    title: primary.gifts ? "O que inclui" : "Por que confiar",
    body: benefitLines.join("\n"),
    detailLines: benefitLines,
  })

  const offerLines: string[] = []
  if (primary.disclosurePrice != null) offerLines.push(priceStr)
  if (parcel) offerLines.push(parcel)
  if (strategy.generalNote) offerLines.push(strategy.generalNote)

  slides.push({
    index: 4,
    type: "offer",
    bgDark: true,
    title: "Condições",
    body: offerLines.join("\n"),
    badge: "OFERTA",
    price: priceStr,
    parcel: parcel ?? undefined,
    detailLines: offerLines,
  })

  const ctaText = (primary.productCta || strategy.generalCta || "Me chama e garante o seu").trim()
  slides.push({
    index: 5,
    type: "cta",
    bgDark: true,
    title: ctaText,
    body: "Instagram · WhatsApp · DM",
    badge: "CONTATO",
    detailLines: ["Disponível agora", "Respondo rápido"],
  })

  return slides.map((s, i) => ({ ...s, index: i + 1 }))
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

function lineForProductWhatsApp(f: ProductFacts, index?: number): string[] {
  const lines: string[] = []
  const prefix = index ? `${index}. ` : ""
  lines.push(`${prefix}*${productDisplayName(f)}*`)
  if (f.battery_health != null) lines.push(`🔋 Bateria ${f.battery_health}%`)
  const condition = whatsappConditionLine(f)
  if (condition) lines.push(condition)
  if (f.warrantyLabel) lines.push(`📆 ${f.warrantyLabel}`)
  if (f.discount && f.basePrice != null && f.disclosurePrice != null) {
    lines.push(`💰 De ~${formatBRL(f.basePrice)}~ por *${formatBRL(f.disclosurePrice)}*`)
  } else if (f.disclosurePrice != null) {
    lines.push(`💰 *${formatBRL(f.disclosurePrice)}*`)
  }
  if (f.installment) lines.push(`💳 Até ${f.installment.text}`)
  if (f.gifts) lines.push(`🎁 ${f.gifts}`)
  if (f.productNote && !f.productNote.toLocaleLowerCase("pt-BR").includes("ponto forte")) {
    lines.push(`📝 ${f.productNote}`)
  }
  return lines
}

function generateWhatsApp(facts: ProductFacts[], strategy: GeneralStrategy): string {
  const primary = pickPrimary(facts)
  const isMulti = facts.length > 1
  const cta = (strategy.generalCta || "Me chama que eu vejo a disponibilidade pra você.").trim()
  const lines: string[] = []
  const visibleFacts = facts.slice(0, facts.length > 2 ? 3 : facts.length)

  if (isMulti) {
    lines.push("*Tenho essas opções disponíveis hoje na Nobretech:*")
    lines.push("")
    visibleFacts.forEach((f, i) => {
      lines.push(...lineForProductWhatsApp(f, i + 1))
      lines.push("")
    })
    if (facts.length > visibleFacts.length) {
      lines.push(`Tenho mais ${facts.length - visibleFacts.length} ${facts.length - visibleFacts.length === 1 ? "opção" : "opções"} no lote. Te mando as condições por modelo.`)
      lines.push("")
    }
  } else {
    lines.push("*Olha essa condição que entrou na Nobretech:*")
    lines.push("")
    lines.push(...lineForProductWhatsApp(primary))
    lines.push("")
  }

  if (strategy.generalNote && facts.length <= 2) {
    lines.push(strategy.generalNote)
    lines.push("")
  }

  const strongest = facts.find((f) => f.isPrimary || f.isFeatured || f.discount) ?? primary
  const closingParts: string[] = []
  if (strongest.discount || strongest.battery_health != null || strongest.warrantyLabel) {
    const reasons = [
      strongest.battery_health != null ? `bateria ${strongest.battery_health}%` : null,
      strongest.warrantyLabel,
      strongest.discount ? "desconto real" : null,
    ].filter(Boolean)
    if (reasons.length > 0) {
      closingParts.push(`${facts.length > 1 ? "O destaque" : "O destaque"} é o conjunto: ${reasons.join(", ")}.`)
    }
  }
  if (primary.quantity <= 1) closingParts.push("Tenho só uma unidade nessa condição.")
  else if (strategy.urgencyLevel !== "none") closingParts.push(urgencyWhatsAppLine(strategy.urgencyLevel, primary.quantity))
  closingParts.push(cta)
  lines.push(closingParts.join(" "))

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n")
}

// ─── Instagram caption ───────────────────────────────────────────────────────

function lineForProductInstagram(f: ProductFacts): string[] {
  const lines: string[] = []
  const head: string[] = [`• *${f.copyTitle || f.name}*`]
  if (f.grade) head.push(conditionLabel(f.grade))
  lines.push(head.join(" | "))
  if (f.copyDescription) lines.push(`  ${f.copyDescription}`)
  if (f.discount && f.basePrice != null && f.disclosurePrice != null) {
    lines.push(`  De ${formatBRL(f.basePrice)} por ${formatBRL(f.disclosurePrice)} (-${f.discount.percent}%)`)
  } else if (f.disclosurePrice != null) {
    lines.push(`  ${formatBRL(f.disclosurePrice)}`)
  }
  if (f.installment) lines.push(`  ${f.installment.text}`)
  if (f.warrantyLabel) lines.push(`  ${f.warrantyLabel}`)
  if (f.gifts) lines.push(`  Inclui: ${f.gifts}`)
  if (f.copyStrongPoint) lines.push(`  ${f.copyStrongPoint}`)
  if (f.copyObjection) lines.push(`  ${f.copyObjection}`)
  if (f.productNote) lines.push(`  ${f.productNote}`)
  return lines
}

function generateInstagram(facts: ProductFacts[], strategy: GeneralStrategy): string {
  const primary = pickPrimary(facts)
  const isMulti = facts.length > 1
  const cta = (strategy.generalCta || "Me chama no direct que eu te passo as condições.").trim()

  const introMap: Record<ObjectiveKey, string> = {
    sell_fast: isMulti
      ? `${facts.length} opções disponíveis hoje na Nobretech.`
      : `Tá disponível hoje: ${primary.name}${primary.grade ? ` | ${conditionLabel(primary.grade)}` : ""}`,
    generate_desire: isMulti
      ? `Escolha a sua condição. ${facts.length} opções disponíveis.`
      : `${primary.name} ${primary.storage ?? ""} — pra quem sabe o que quer.`,
    bundle_gift: primary.gifts
      ? `${isMulti ? "Produtos" : primary.name} + ${primary.gifts} — uma compra, sem surpresa depois.`
      : `${primary.name} | Kit completo.`,
    trust_proof: isMulti
      ? `${facts.length} produtos conferidos e disponíveis.`
      : `${primary.name}${primary.grade ? ` | ${conditionLabel(primary.grade)}` : ""} — produto conferido, procedência garantida.`,
    new_arrival: isMulti
      ? `Novo lote chegou: ${facts.length} opções disponíveis.`
      : `Acabou de chegar: ${primary.name} ${primary.storage ?? ""}.`,
    reactivate_lead: isMulti
      ? `Ainda disponíveis: ${facts.length} opções.`
      : `Esse ainda está disponível: ${primary.name}${primary.grade ? ` | ${conditionLabel(primary.grade)}` : ""}`,
  }

  const lines: string[] = []
  lines.push(introMap[strategy.objective])
  lines.push("")
  facts.forEach((f) => {
    lines.push(...lineForProductInstagram(f))
  })
  if (strategy.generalNote) {
    lines.push("")
    lines.push(strategy.generalNote)
  }
  const urgency = urgencyBodyLine(strategy.urgencyLevel, primary.quantity)
  if (urgency) {
    lines.push("")
    lines.push(urgency)
  }
  lines.push("")
  lines.push(cta)
  lines.push("")
  lines.push("#nobretech #apple #iphone #tecnologia #seminovo")

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n")
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function generateContent(
  drafts: ProductDraft[],
  strategy: GeneralStrategy
): GeneratedContent {
  if (drafts.length === 0) throw new Error("generateContent requires at least one product draft")
  const facts = sortProductsForVitrine(drafts.map(buildProductFacts))
  const warnings: string[] = []
  const primary = pickPrimary(facts)
  if (strategy.urgencyLevel === "high" && primary.quantity > 3) {
    warnings.push("Urgência alta com estoque > 3 unidades pode parecer falsa escassez.")
  }
  facts.forEach((f) => {
    if (f.disclosurePrice == null) warnings.push(`${f.name}: preço de divulgação não definido.`)
  })

  return {
    stories: [
      generateStory1(facts, strategy),
      generateStory2(facts, strategy),
      generateStory3(facts, strategy),
    ],
    carousel: generateCarousel(facts, strategy),
    whatsapp: generateWhatsApp(facts, strategy),
    instagram: generateInstagram(facts, strategy),
    facts,
    source: "deterministic",
    warnings,
  }
}

export { OBJECTIVE_LABELS, TONE_LABELS, CHANNEL_LABELS, conditionLabel }
