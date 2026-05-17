import { calculatePaymentPrice } from "@/lib/helpers"
import { pickStoryCta } from "./story-ctas"
import type { CtaObjective } from "./story-ctas"

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
  /**
   * If `null` use smart default: highlight story when primary product has a strong
   * argument (discount, last unit, warranty, high battery). User can force on/off.
   */
  addHighlightStory?: boolean | null
  /**
   * If `null` use smart default: ON for ≤3 products, OFF for >3 products to
   * prioritize vitrine pages. User can force on/off.
   */
  addCtaStory?: boolean | null
  /**
   * Incremented by the UI "Variar CTAs" button. Rotates CTA selection
   * deterministically without changing any factual content.
   */
  ctaVariationSeed?: number
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
  /**
   * Commercial available quantity for this product's equivalence group
   * (same model + storage + color + condition). Set by generateContent from
   * all campaign facts. Callers may supply it directly when known.
   * Falls back to `quantity` (raw inventory count) when absent.
   */
  commercialAvailableQuantity?: number
}

export interface StoryTag {
  type: TagType
  label: string
  /** Compact alternative used when the full label would overflow a card. */
  shortLabel?: string
}

export interface VitrineItem {
  /** Inventory id — stable key for the presence guardrail (name may be trimmed). */
  productId: string
  name: string
  /** Short commercial subtitle — never repeats name's storage/color/grade. */
  subtitle: string
  /** Dedicated warranty line (from explicit warrantyLabel only). */
  warrantyLine: string | null
  /** Dedicated kit/gift line showing the real content. */
  kitLine: string | null
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
  /** Visual weight class — controls card height/pill budget in the UI. */
  cardType: "rich" | "normal" | "simple"
}

export type StoryKind = "vitrine" | "highlight" | "cta" | "trust"

/** Visual style applied on top of the story kind. Defaults to "classic". */
export type StoryVariant = "classic" | "destaque" | "relampago" | "premium" | "mosaico"

/**
 * Visual density of a vitrine story. Drives both how many products fit per
 * page (3/4/5) and how compactly each card renders. Picked from the product
 * mix and objective by `pickDensityMode` — never hardcoded.
 */
export type DensityMode = "detailed" | "standard" | "compact"

export interface StoryData {
  /** Logical role of this story slide. Drives label, layout, AI mapping. */
  kind: StoryKind
  /** Visual template applied to this story. Overrides default layout when set. */
  variant?: StoryVariant
  /** Label used by the UI (ex: "Vitrine 1/2", "Destaque", "Fechamento"). */
  label: string
  /** Pagination metadata when `kind === "vitrine"`. */
  pageInfo?: { page: number; total: number }
  /** Visual density. Set on vitrine stories; null on highlight/cta/trust. */
  density?: DensityMode
  badge: string
  headline: string
  sub: string
  tags: StoryTag[]
  productName: string
  price: string | null
  basePrice: string | null
  discountPercent?: number | null
  parcel: string | null
  detailLines: string[]
  urgencyLine: string | null
  ctaMain: string | null
  ctaSub: string | null
  vitrineProducts?: VitrineItem[]
  /** Deterministic benefit lines for the vitrine bottom block. Never invented. */
  benefits?: string[]
  /** Big footer CTA shown on vitrine stories. */
  footerCtaMain?: string | null
  footerCtaSub?: string | null
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
  /**
   * Dynamic list. First N entries are vitrine pages (max 3 products each), then
   * optional highlight + cta + trust stories depending on strategy flags.
   */
  stories: StoryData[]
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
  shortPitch?: string
  trustArgument?: string
  urgencyLine?: string
  whatsappLine?: string
  instagramLine?: string
  storyWhatsappText?: string
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

export function getVisualDiscountPercent(
  basePrice: number | null | undefined,
  disclosurePrice: number | null | undefined
): number | null {
  if (basePrice == null || disclosurePrice == null) return null
  if (!isFinite(basePrice) || !isFinite(disclosurePrice)) return null
  if (basePrice <= 0) return null
  if (disclosurePrice >= basePrice) return null
  const percent = ((basePrice - disclosurePrice) / basePrice) * 100
  if (percent < 5) return null
  return Math.round(percent * 10) / 10
}

export function formatVisualDiscount(percent: number): string {
  const rounded = Math.round(percent * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

/** Normalize a string for use in a commercial availability key. */
function normalizeKeySegment(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Commercial equivalence key for scarcity grouping.
 *
 * Two campaign facts with the same key are treated as the same commercial
 * product. IMEI/serial are never included — they live in `notes`, not in
 * the structured fields used here.
 *
 * Condition buckets:
 *   - sealed (grade null or "Lacrado") → "lacrado"
 *   - used/refurbished               → "grade-{normalized}", e.g. "grade-a-plus"
 *
 * A+ and A are different keys. Lacrado and A are different keys.
 */
export function getCommercialAvailabilityKey(
  fact: Pick<ProductFacts, "name" | "storage" | "color" | "grade">
): string {
  const model = normalizeKeySegment(fact.name)
  const storage = normalizeKeySegment(fact.storage)
  const color = normalizeKeySegment(fact.color)

  let condition: string
  if (!fact.grade || fact.grade === "Lacrado") {
    condition = "lacrado"
  } else {
    const g = fact.grade
      .toUpperCase()
      .trim()
      .replace(/\+/g, "-plus")
      .replace(/-$/g, "-minus")
    condition = `grade-${g.toLowerCase()}`
  }

  return [model, storage, color, condition].filter(Boolean).join("|")
}

/**
 * Effective commercial quantity for scarcity display.
 * Prefers `commercialAvailableQuantity` (campaign-level grouping) over
 * raw `quantity` (single inventory record count).
 */
function effectiveQuantity(f: Pick<ProductFacts, "quantity" | "commercialAvailableQuantity">): number {
  return f.commercialAvailableQuantity ?? f.quantity
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

const STORY_NAME_MAX = 42

/**
 * Commercial name for the story card. Keeps model + storage + color intact
 * (color is never dropped). Trims only low-value supplier cruft when the name
 * is excessively long — never an ellipsis through essential info.
 */
function buildStoryProductName(f: ProductFacts): string {
  const full = productDisplayName({ name: f.copyTitle || f.name, storage: f.storage, color: f.color })
  if (full.length <= STORY_NAME_MAX) return full

  // Strip parenthetical / supplier noise first.
  let trimmed = full.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim()
  if (trimmed.length <= STORY_NAME_MAX) return trimmed

  // Drop low-value descriptor words but keep model, storage and color tokens.
  const colorToken = f.color?.toLocaleLowerCase("pt-BR")
  const storageToken = f.storage?.toLocaleLowerCase("pt-BR")
  const NOISE = new Set([
    "modelo",
    "executivo",
    "premium",
    "original",
    "novo",
    "nova",
    "para",
    "tipo",
    "linha",
  ])
  const kept = trimmed
    .split(" ")
    .filter((w) => {
      const lw = w.toLocaleLowerCase("pt-BR")
      if (lw === colorToken || lw === storageToken) return true
      return !NOISE.has(lw)
    })
  trimmed = kept.join(" ").replace(/\s{2,}/g, " ").trim()
  return trimmed
}

function buildHighlightProductName(f: ProductFacts): string {
  const visualName = buildStoryProductName(f).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim()
  const words = visualName.split(" ").filter(Boolean)
  if (words.length <= 2) return visualName

  const first = words[0]?.toLocaleLowerCase("pt-BR")
  const modelNumberIndex = words.findIndex((w, index) => index > 0 && /^\d/.test(w))
  if (first === "iphone" && modelNumberIndex > 0) {
    const kept = words.slice(0, modelNumberIndex + 1)
    const afterModel = words.slice(modelNumberIndex + 1)
    const firstModifier = afterModel[0]?.toLocaleLowerCase("pt-BR")
    const secondModifier = afterModel[1]?.toLocaleLowerCase("pt-BR")
    if (["pro", "plus", "air", "mini", "ultra", "max"].includes(firstModifier ?? "")) {
      kept.push(afterModel[0])
      if (firstModifier === "pro" && secondModifier === "max") kept.push(afterModel[1])
    }
    return kept.join(" ")
  }

  return words.slice(0, Math.min(3, words.length)).join(" ")
}

/**
 * Short commercial subtitle. NEVER repeats storage/color/grade already shown
 * in the name. Pure fact-derived, never invented.
 */
function buildStoryProductSubtitle(f: ProductFacts): string {
  if (f.grade) return conditionLabel(f.grade)
  if (f.battery_health != null) return `Bateria ${f.battery_health}%`
  if (f.gifts) return "Com kit incluso"
  return "Disponível agora"
}

/**
 * Compact warranty line for the card. Comes ONLY from the explicit
 * warrantyLabel — never inferred, never inherited from another product.
 */
function buildWarrantyLine(f: ProductFacts): string | null {
  const raw = f.warrantyLabel?.trim()
  if (!raw) return null
  if (/apple/i.test(raw)) {
    const yr = raw.match(/(\d+)\s*ano/i)
    return yr ? `Garantia Apple ${yr[1]} ano${Number(yr[1]) > 1 ? "s" : ""}` : "Garantia Apple"
  }
  const m = raw.match(/(\d+)\s*mes/i)
  if (m) return `Garantia Nobretech ${m[1]}m`
  return raw.length <= 28 ? raw : "Garantia Nobretech"
}

/**
 * Compact kit/gift line — shows the REAL content, not just "Kit incluso".
 * Falls back to "Kit: N itens" only when the content is too long to fit.
 */
function buildKitLine(f: ProductFacts): string | null {
  const raw = f.gifts?.trim()
  if (!raw) return null
  const parts = raw
    .split(/\s*[+,/]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const pretty = parts
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.toLocaleLowerCase("pt-BR")))
    .join(" + ")
  if (pretty.length <= 34) return pretty
  if (parts.length >= 2) return `Kit: ${parts.length} itens`
  return pretty.slice(0, 32).trim() + "…"
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
    p.grade !== "Lacrado" && p.battery_health != null ? `bateria ${p.battery_health}%` : null,
    draft.warrantyLabel.trim() || null,
    draft.gifts.trim() ? `com ${draft.gifts.trim()}` : null,
  ].filter(Boolean).join(", ")
  const deterministicStrongPoint = discount
    ? `desconto de ${formatBRL(discount.amount)}`
    : draft.gifts.trim()
    ? `kit incluso: ${draft.gifts.trim()}`
    : p.grade !== "Lacrado" && p.battery_health != null
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

function compactWarrantyLabel(label: string): string {
  // "Garantia Nobretech 6 meses" -> "Garantia 6m"; "Garantia Apple ..." -> "Garantia Apple".
  const months = label.match(/(\d+)\s*mes/i)
  if (/apple/i.test(label)) return "Garantia Apple"
  if (months) return `Garantia ${months[1]}m`
  return "Garantia"
}

function buildTags(facts: ProductFacts): StoryTag[] {
  const tags: StoryTag[] = []
  if (facts.grade) {
    tags.push({ type: "grade", label: conditionLabel(facts.grade) })
  }
  if (!isSealedProduct(facts) && facts.battery_health != null) {
    tags.push({ type: "battery", label: `Bateria ${facts.battery_health}%`, shortLabel: `Bat. ${facts.battery_health}%` })
  }
  const commQty = effectiveQuantity(facts)
  if (commQty <= 1) {
    tags.push({ type: "stock", label: "Última unidade", shortLabel: "Última unid." })
  } else if (commQty <= 3) {
    tags.push({ type: "stock", label: `${commQty} unidades` })
  }
  if (facts.warrantyLabel) {
    const type = /apple/i.test(facts.warrantyLabel) ? "warranty_apple" : "warranty_nobretech"
    tags.push({ type, label: facts.warrantyLabel, shortLabel: compactWarrantyLabel(facts.warrantyLabel) })
  }
  if (facts.gifts) tags.push({ type: "gift", label: `Brinde: ${facts.gifts}`, shortLabel: "Kit incluso" })
  if (facts.installment) tags.push({ type: "installment", label: facts.installment.text })
  if (facts.color) tags.push({ type: "color", label: facts.color })
  return tags
}

function conditionLabel(grade: string | null): string {
  if (!grade) return "Produto"
  if (grade === "Lacrado") return "Lacrado"
  return "Seminovo"
}

function isSealedProduct(facts: ProductFacts): boolean {
  return facts.grade === "Lacrado"
}

function whatsappConditionLine(f: ProductFacts): string | null {
  if (!f.grade) return null
  if (f.grade === "Lacrado") return "✅ Lacrado"
  return "✅ Seminovo revisado pela Nobretech"
}

function buildDetailLines(facts: ProductFacts): string[] {
  const lines: string[] = []
  if (facts.storage) lines.push(facts.storage)
  if (facts.color) lines.push(`Cor: ${facts.color}`)
  if (facts.grade) lines.push(conditionLabel(facts.grade))
  if (!isSealedProduct(facts) && facts.battery_health != null) lines.push(`Bateria ${facts.battery_health}%`)
  if (facts.warrantyLabel) lines.push(facts.warrantyLabel)
  if (facts.gifts) lines.push(`Kit: ${facts.gifts}`)
  if (facts.productNote) lines.push(facts.productNote)
  const dQty = effectiveQuantity(facts)
  if (dQty <= 1) lines.push("Última unidade")
  else if (dQty <= 3) lines.push(`${dQty} unidades`)
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

/** True when fact looks like an accessory (no device-only fields populated). */
function looksLikeAccessory(f: ProductFacts): boolean {
  return f.grade == null && f.battery_health == null && f.storage == null
}

/** Count strong commercial signals on a single product. */
function commercialSignalScore(f: ProductFacts): number {
  let n = 0
  if (f.discount) n += 1
  if (f.installment) n += 1
  if (f.warrantyLabel) n += 2
  if (f.gifts) n += 2
  if (f.productNote) n += 1
  if ((f.copyTitle || f.name).length > 34) n += 1
  if (f.battery_health != null && f.battery_health >= 95) n += 1
  return n
}

function sortProductsForVitrine(
  facts: ProductFacts[],
  strategy?: GeneralStrategy
): ProductFacts[] {
  const objective = strategy?.objective ?? "sell_fast"
  return [...facts].sort((a, b) => {
    // Manual featured always wins.
    const aFeatured = a.isFeatured ? 1 : 0
    const bFeatured = b.isFeatured ? 1 : 0
    if (aFeatured !== bFeatured) return bFeatured - aFeatured

    // Manual primary next.
    const aPrimary = a.isPrimary ? 1 : 0
    const bPrimary = b.isPrimary ? 1 : 0
    if (aPrimary !== bPrimary) return bPrimary - aPrimary

    // Objective-specific reweighting.
    if (objective === "bundle_gift") {
      const aGift = a.gifts ? 1 : 0
      const bGift = b.gifts ? 1 : 0
      if (aGift !== bGift) return bGift - aGift
    }
    if (objective === "trust_proof") {
      const trustScore = (f: ProductFacts) =>
        (f.warrantyLabel ? 2 : 0) +
        (f.battery_health != null && f.battery_health >= 95 ? 2 : 0) +
        (f.grade ? 1 : 0)
      const diff = trustScore(b) - trustScore(a)
      if (diff !== 0) return diff
    }
    if (objective === "bundle_gift" || objective === "sell_fast") {
      // Accessories drop below devices unless they carry the only gift signal.
      const aAcc = looksLikeAccessory(a) ? 1 : 0
      const bAcc = looksLikeAccessory(b) ? 1 : 0
      if (aAcc !== bAcc) return aAcc - bAcc
    }

    // Generic commercial weight: discount → urgent stock → price.
    const aDiscount = a.discount ? 1 : 0
    const bDiscount = b.discount ? 1 : 0
    if (aDiscount !== bDiscount) return bDiscount - aDiscount

    const aUrgent = a.quantity <= 1 ? 1 : 0
    const bUrgent = b.quantity <= 1 ? 1 : 0
    if (aUrgent !== bUrgent) return bUrgent - aUrgent

    return (b.disclosurePrice ?? 0) - (a.disclosurePrice ?? 0)
  })
}

/**
 * Hard ceiling per vitrine story slide. Adaptive density never exceeds this
 * even when the picker says compact. Five is the legibility limit at 1080×1920.
 */
export const MAX_PRODUCTS_PER_VITRINE_STORY = 5

/** Effective chunk size per density mode. Drives both pagination and card sizing. */
export const DENSITY_CHUNK_SIZE: Record<DensityMode, number> = {
  detailed: 3,
  standard: 4,
  compact: 5,
}

/**
 * Decide how many products fit per vitrine story based on the product mix
 * and campaign objective. Conservative on doubt: defaults to standard (4).
 */
export function pickDensityMode(
  facts: ProductFacts[],
  strategy: GeneralStrategy
): DensityMode {
  if (facts.length === 0) return "standard"

  const longNameCount = facts.filter((f) => (f.copyTitle || f.name).length > 28).length
  const heavyBadgeCount = facts.filter((f) => commercialSignalScore(f) >= 4).length
  const allAccessories = facts.every(looksLikeAccessory)
  const allShortNames = facts.every((f) => (f.copyTitle || f.name).length <= 20)
  const allLightSignals = facts.every((f) => commercialSignalScore(f) <= 1)

  // Detailed (3): strong individual stories, long names, or trust/desire focus.
  if (heavyBadgeCount >= 1) return "detailed"
  if (longNameCount >= Math.ceil(facts.length / 2)) return "detailed"
  if (strategy.objective === "trust_proof") return "detailed"
  if (strategy.objective === "generate_desire") {
    const primary = pickPrimary(facts)
    if (primary.discount || (primary.battery_health != null && primary.battery_health >= 95)) {
      return "detailed"
    }
  }

  // Compact (5): catalogue feel — only when the entire mix is simple
  // accessories (no grade/battery/storage signals) AND there are at least 5
  // items to justify a tight 5-per-story grid.
  if (allAccessories && allShortNames && allLightSignals && facts.length >= 5) {
    return "compact"
  }

  // Default to standard (4) on doubt — never narrower than 4.
  return "standard"
}

export function chunkProductsForStories<T>(
  items: T[],
  chunkSize: number = DENSITY_CHUNK_SIZE.standard
): T[][] {
  if (items.length === 0) return []
  if (chunkSize <= 0) return [items]
  const cap = Math.min(chunkSize, MAX_PRODUCTS_PER_VITRINE_STORY)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += cap) {
    out.push(items.slice(i, i + cap))
  }
  return out
}

/**
 * Visual weight of a product card. Drives how many fit per story so a rich
 * hero card does not get crammed next to other rich cards. Pure heuristic on
 * real fact data — never invents anything.
 *
 * ~1 = simple/accessory · ~1.3 = médio · ~1.6 = rico · ~2 = hero pesado.
 */
export function getProductVisualWeight(f: ProductFacts): number {
  let w = 1
  if (f.battery_health != null) w += 0.15
  if (f.grade) w += 0.15
  if (f.warrantyLabel) w += 0.35
  if (f.discount) w += 0.3
  if (f.installment) w += 0.15
  if (f.gifts) w += 0.35
  if (f.productNote) w += 0.2
  if (f.isPrimary || f.isFeatured) w += 0.25
  const visualName = buildStoryProductName(f)
  if (visualName.length > 34) w += 0.3
  else if (visualName.length > 26) w += 0.18
  // Many candidate pills => taller card.
  const pillCount = buildTags(f).filter((t) => t.type !== "installment").length
  if (pillCount >= 4) w += 0.25
  else if (pillCount >= 3) w += 0.1
  return Math.min(w, 2.35)
}

function estimateStoryNameLineCount(name: string): number {
  const normalized = name.replace(/\s+/g, " ").trim()
  if (normalized.length > 48) return 3
  if (normalized.length > 26) return 2
  return 1
}

function baseStoryCardHeight(cardType: "rich" | "normal" | "simple"): number {
  if (cardType === "simple") return 172
  if (cardType === "normal") return 208
  return 226
}

export function getStoryCardHeight(
  item: Pick<
    VitrineItem,
    | "name"
    | "warrantyLine"
    | "kitLine"
    | "basePrice"
    | "parcel"
    | "tags"
    | "hasDiscount"
    | "isPrimary"
    | "isFeatured"
    | "cardType"
  >
): number {
  const nameLines = estimateStoryNameLineCount(item.name)
  const technicalPills = item.tags.filter((tag) => tag.type !== "installment" && tag.type !== "gift" && !tag.type.startsWith("warranty"))
  return (
    baseStoryCardHeight(item.cardType) +
    Math.max(0, nameLines - 1) * 38 +
    (item.warrantyLine ? 34 : 0) +
    (item.kitLine ? 34 : 0) +
    (item.basePrice ? 24 : 0) +
    (item.parcel ? 18 : 0) +
    (technicalPills.length >= 4 ? 18 : 0) +
    (item.hasDiscount ? 22 : 0) +
    (item.isPrimary || item.isFeatured ? 18 : 0)
  )
}

function getProductStoryCardHeight(f: ProductFacts, objective: ObjectiveKey): number {
  const item: Pick<
    VitrineItem,
    | "name"
    | "warrantyLine"
    | "kitLine"
    | "basePrice"
    | "parcel"
    | "tags"
    | "hasDiscount"
    | "isPrimary"
    | "isFeatured"
    | "cardType"
  > = {
    name: buildStoryProductName(f),
    warrantyLine: buildWarrantyLine(f),
    kitLine: buildKitLine(f),
    basePrice: f.discount && f.basePrice != null ? formatBRL(f.basePrice) : null,
    parcel: f.installment?.text ?? null,
    tags: orderedVitrineTags(f, objective),
    hasDiscount: Boolean(f.discount),
    isPrimary: f.isPrimary,
    isFeatured: f.isFeatured,
    cardType: classifyCardType(f),
  }
  return getStoryCardHeight(item)
}

/** True when card is a plain accessory/simple unit (low visual weight). */
function isSimpleCard(f: ProductFacts): boolean {
  return getProductVisualWeight(f) <= 1.15 && !f.isPrimary && !f.isFeatured && !f.discount
}

/**
 * Weight-aware pagination. Packs products into stories using a per-story
 * visual-weight budget instead of a flat count, then rebalances so the last
 * story is not a single weak accessory. Hard cap 5/story, never drops items.
 */
export function chunkProductsForVisualStories(
  facts: ProductFacts[],
  density: DensityMode,
  objective: ObjectiveKey = "sell_fast"
): ProductFacts[][] {
  if (facts.length === 0) return []
  const maxCount = Math.min(DENSITY_CHUNK_SIZE[density], MAX_PRODUCTS_PER_VITRINE_STORY)
  // Budget tuned for 1080x1920 export: rich warranty+kit cards get space,
  // simple accessories can still pack densely.
  const weightBudget = density === "detailed" ? 4.8 : density === "standard" ? 5.35 : 6.0
  const heightBudget = density === "detailed" ? 760 : density === "standard" ? 860 : 1040
  const cardGap = density === "compact" ? 20 : 28

  const pages: ProductFacts[][] = []
  let current: ProductFacts[] = []
  let load = 0
  let heightLoad = 0
  for (const f of facts) {
    const w = getProductVisualWeight(f)
    const h = getProductStoryCardHeight(f, objective)
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= maxCount ||
        load + w > weightBudget ||
        heightLoad + cardGap + h > heightBudget)
    if (wouldOverflow) {
      pages.push(current)
      current = []
      load = 0
      heightLoad = 0
    }
    current.push(f)
    load += w
    heightLoad += (current.length > 1 ? cardGap : 0) + h
  }
  if (current.length > 0) pages.push(current)

  // Rebalance: avoid a final story that is a single simple accessory.
  if (pages.length >= 2) {
    const last = pages[pages.length - 1]
    const prev = pages[pages.length - 2]
    const lastIsWeak =
      last.length === 1 && isSimpleCard(last[0])
    if (lastIsWeak && prev.length >= 2) {
      // Pull one product down from the previous story → 3+1 becomes 2+2.
      const moved = prev.pop()!
      pages[pages.length - 1] = [moved, ...last]
    }
  }

  return pages
}

function classifyCardType(f: ProductFacts): "rich" | "normal" | "simple" {
  const w = getProductVisualWeight(f)
  if (f.isPrimary || f.isFeatured || f.discount || w >= 1.55) return "rich"
  if (w <= 1.15) return "simple"
  return "normal"
}

/**
 * Objective-aware pill priority (lower = shown first). Warranty is
 * deliberately demoted unless the objective is trust_proof — it already shows
 * in the benefits block, so it must not expel battery/grade/kit from the card.
 */
function pillPriorityForObjective(
  type: TagType,
  objective: ObjectiveKey,
  isAccessory: boolean
): number {
  const W = type.startsWith("warranty")
  // Accessories: Lacrado(grade) > quantidade(stock) > cor > kit.
  if (isAccessory) {
    const accBase: Record<string, number> = {
      grade: 0,
      stock: 1,
      color: 2,
      gift: 3,
      battery: 4,
      warranty_nobretech: 6,
      warranty_apple: 6,
      new: 7,
      installment: 99,
    }
    return accBase[type] ?? 20
  }

  let tables: Record<string, number>
  if (objective === "bundle_gift") {
    tables = { gift: 0, battery: 1, grade: 2, stock: 3, color: 7, new: 8 }
  } else if (objective === "trust_proof") {
    tables = { battery: 0, grade: 1, warranty_nobretech: 2, warranty_apple: 2, stock: 4, gift: 5, color: 7, new: 8 }
  } else if (objective === "sell_fast") {
    tables = { stock: 0, battery: 1, grade: 2, gift: 3, color: 7, new: 8 }
  } else {
    // generate_desire / new_arrival / reactivate_lead — balanced.
    tables = { battery: 1, grade: 2, gift: 3, stock: 4, color: 7, new: 8 }
  }
  if (W && type in tables) return tables[type]
  // Warranty not in the strong table → low priority (benefit block covers it).
  if (W) return 6
  return tables[type] ?? 20
}

function orderedVitrineTags(f: ProductFacts, objective: ObjectiveKey): StoryTag[] {
  const isAccessory = f.grade == null && f.battery_health == null && f.storage == null
  // Technical pills ONLY. Warranty + kit are dedicated card lines now and
  // must never compete for pill space.
  return buildTags(f)
    .filter((t) => t.type !== "installment" && t.type !== "gift" && !t.type.startsWith("warranty"))
    .sort(
      (a, b) =>
        pillPriorityForObjective(a.type, objective, isAccessory) -
        pillPriorityForObjective(b.type, objective, isAccessory)
    )
    .slice(0, 4)
}

function buildVitrineItems(facts: ProductFacts[], objective: ObjectiveKey): VitrineItem[] {
  return facts.map((f) => {
    const visualPercent = getVisualDiscountPercent(f.basePrice, f.disclosurePrice)
    // Show struck price whenever there is any real price drop, regardless of size.
    // Strong visual emphasis (orange border / percent badge) only for >= 5% — see hasDiscount.
    const hasPriceDrop = f.basePrice != null && f.disclosurePrice != null && f.disclosurePrice < f.basePrice
    return {
      productId: f.id,
      name: buildStoryProductName(f),
      subtitle: buildStoryProductSubtitle(f),
      warrantyLine: buildWarrantyLine(f),
      kitLine: buildKitLine(f),
      price: f.disclosurePrice != null ? formatBRL(f.disclosurePrice) : null,
      basePrice: hasPriceDrop && f.basePrice != null ? formatBRL(f.basePrice) : null,
      discountPercent: visualPercent,
      parcel: f.installment?.text ?? null,
      tags: orderedVitrineTags(f, objective),
      warrantyLabel: f.warrantyLabel || null,
      gifts: f.gifts || null,
      color: f.color,
      hasDiscount: visualPercent != null,
      isFeatured: f.isFeatured,
      grade: f.grade,
      storage: f.storage,
      quantity: f.quantity,
      isPrimary: f.isPrimary,
      cardType: classifyCardType(f),
    }
  })
}

function contextualCta(facts: ProductFacts[], strategy: GeneralStrategy): { main: string; sub: string } {
  const primary = pickPrimary(facts)
  const customCta = (strategy.generalCta || primary.productCta).trim()
  const isSingle = facts.length === 1
  const hasDiscount = facts.some((f) => f.discount)
  const someUrgent = facts.some((f) => effectiveQuantity(f) <= 1)
  const hasVariation = Boolean(primary.color || primary.productNote.toLowerCase().includes("cor"))

  if (customCta) return { main: customCta, sub: "Me chama que eu te passo as condições." }

  // MULTI-PRODUCT: never use bare "última unidade" — it's ambiguous about
  // which product. Use safe selection CTAs instead.
  if (!isSingle) {
    if (someUrgent) {
      return {
        main: "Escolha o modelo e me chama.",
        sub: "Algumas opções têm poucas unidades.",
      }
    }
    if (hasDiscount) {
      return {
        main: "Me chama que eu confirmo a disponibilidade.",
        sub: "Algumas opções estão com condição especial.",
      }
    }
    return {
      main: "Escolha o modelo e me chama.",
      sub: "Me chama e eu te mando as condições de cada modelo.",
    }
  }

  // SINGLE PRODUCT: "última unidade" is unambiguous.
  if (effectiveQuantity(primary) <= 1) {
    return { main: "Última unidade nessa condição.", sub: "Me chama para reservar." }
  }
  if (hasDiscount) {
    return { main: "Condição especial disponível.", sub: "Me chama que eu vejo se ainda está disponível." }
  }
  if (hasVariation) return { main: "Gostou desse modelo?", sub: "Me chama para confirmar a cor disponível." }
  return { main: "Quer reservar esse modelo?", sub: "Me chama para reservar essa unidade." }
}

/** Highest installment count across the page. 0 when none configured. */
function maxInstallmentCount(facts: ProductFacts[]): number {
  return facts.reduce((max, f) => Math.max(max, f.installment?.count ?? 0), 0)
}

/**
 * Deterministic benefit lines for the vitrine bottom block. Each line is
 * derived ONLY from real fact data or generic-safe statements — never invents
 * trade-in, delivery, entrada, warranty or installment that does not exist.
 */
function buildVitrineBenefits(
  facts: ProductFacts[],
  strategy: GeneralStrategy
): string[] {
  const lines: string[] = []

  const maxParcel = maxInstallmentCount(facts)
  if (maxParcel > 0) lines.push(`Parcelo em até ${maxParcel}x no cartão`)

  // Concrete warranty bullets from real data — never inferred or aggregated generically.
  const nobretechFact = facts.find((f) => f.warrantyLabel && !/apple/i.test(f.warrantyLabel))
  if (nobretechFact && lines.length < 4) {
    const m = nobretechFact.warrantyLabel.match(/(\d+)\s*mes/i)
    lines.push(m ? `Garantia Nobretech de ${m[1]} meses` : "Garantia Nobretech inclusa")
  }

  if (facts.some((f) => /apple/i.test(f.warrantyLabel)) && lines.length < 4) {
    lines.push("Garantia Apple inclusa")
  }

  if (facts.some((f) => f.grade && f.grade !== "Lacrado") && lines.length < 4) {
    lines.push("Aparelhos revisados antes da entrega")
  }

  if (facts.some((f) => Boolean(f.gifts)) && lines.length < 4) {
    lines.push("Brindes inclusos nos produtos selecionados")
  }

  if (facts.some((f) => effectiveQuantity(f) <= 1) && lines.length < 4) {
    lines.push("Últimas unidades disponíveis")
  }

  if (facts.some((f) => getVisualDiscountPercent(f.basePrice, f.disclosurePrice) != null) && lines.length < 4) {
    lines.push("Desconto real no preço")
  }

  const note = strategy.generalNote.trim()
  if (note && lines.length < 4) lines.push(note)

  if (lines.length < 3) lines.push("Me chama para confirmar disponibilidade")

  return lines.slice(0, 4)
}

const FOOTER_CTA_BY_OBJECTIVE: Record<ObjectiveKey, string> = {
  sell_fast: "Me chama para reservar",
  generate_desire: "Chama no direct agora",
  bundle_gift: "Escolha o modelo e me chama",
  trust_proof: "Confirma disponibilidade comigo",
  new_arrival: "Chama no WhatsApp agora",
  reactivate_lead: "Me chama que eu te ajudo",
}

/**
 * Big footer CTA for vitrine stories. 1 product → product CTA; else general
 * CTA; else a natural objective-based fallback. Subline uses ONLY real data.
 */
function buildVitrineFooterCta(
  facts: ProductFacts[],
  strategy: GeneralStrategy,
  totalProducts: number
): { main: string; sub: string | null } {
  const primary = pickPrimary(facts)
  const isSingleCampaign = totalProducts === 1
  const main = (
    (isSingleCampaign ? primary.productCta : "") ||
    strategy.generalCta ||
    FOOTER_CTA_BY_OBJECTIVE[strategy.objective]
  ).trim()

  let sub: string | null = null
  if (isSingleCampaign && primary.disclosurePrice != null) {
    const price = formatBRL(primary.disclosurePrice)
    sub = primary.installment ? `${price} · ${primary.installment.text}` : price
  } else {
    const maxParcel = maxInstallmentCount(facts)
    if (maxParcel > 0) sub = `Parcelo em até ${maxParcel}x no cartão`
  }
  return { main, sub }
}


// ─── Story generators (dynamic pagination) ───────────────────────────────────

const OBJECTIVE_BADGE: Record<ObjectiveKey, string> = {
  sell_fast: "DISPONÍVEL HOJE",
  generate_desire: "OPORTUNIDADE",
  bundle_gift: "KIT INCLUSO",
  trust_proof: "CONFIANÇA",
  new_arrival: "NOVO LOTE",
  reactivate_lead: "RETOMADA",
}

interface VitrineCopy {
  badge: string
  headline: string
  sub: string
}

/**
 * Resolve headline/sub/badge per objective. Multi-page vitrines vary the
 * headline so page 2+ does not repeat the page-1 framing verbatim.
 */
export function objectiveStoryCopy(
  objective: ObjectiveKey,
  page: number,
  total: number,
  totalProducts: number,
  primary: ProductFacts
): VitrineCopy {
  const badge =
    total > 1 ? `${OBJECTIVE_BADGE[objective]} · ${page}/${total}` : OBJECTIVE_BADGE[objective]

  // Single product (1 vitrine, 1 product).
  if (totalProducts === 1) {
    const single: Record<ObjectiveKey, { headline: string; sub: string }> = {
      sell_fast: { headline: "Disponível\nhoje", sub: `${primary.name} pronto para fechar.` },
      generate_desire: {
        headline: `Imagina você\ncom esse ${primary.name.split(" ")[0]}.`,
        sub: "Selecionado com condição especial.",
      },
      bundle_gift: {
        headline: primary.gifts ? "Já sai\ncom kit completo." : "Produto completo.\nSem surpresa depois.",
        sub: primary.gifts ? `Inclui ${primary.gifts}.` : `${primary.name} disponível agora.`,
      },
      trust_proof: {
        headline: "Compra segura\nNobretech",
        sub: `${primary.name} conferido e com procedência garantida.`,
      },
      new_arrival: { headline: "Acabou\nde chegar", sub: `${primary.name} disponível agora.` },
      reactivate_lead: { headline: "Ainda procurando?", sub: `Esse ${primary.name.split(" ")[0]} segue disponível.` },
    }
    return { badge, ...single[objective] }
  }

  // Page 1 of N (or single-page multi-product).
  if (page === 1) {
    const first: Record<ObjectiveKey, { headline: string; sub: string }> = {
      sell_fast: {
        headline: "Disponíveis\nhoje",
        sub: total > 1 ? "Primeiras opções prontas para fechar." : "Condições prontas para fechar.",
      },
      generate_desire: {
        headline: "Escolha\nsua experiência",
        sub: "Selecionados com condição especial.",
      },
      bundle_gift: {
        headline: "Já sai com\nkit completo",
        sub: total > 1 ? "Primeiras opções com acessórios." : "Produtos com acessórios e condição pronta.",
      },
      trust_proof: {
        headline: "Compra segura\nNobretech",
        sub: total > 1 ? "Primeira leva conferida e disponível." : "Revisão, garantia e transparência.",
      },
      new_arrival: {
        headline: "Acabou\nde chegar",
        sub: total > 1 ? "Primeiras unidades do novo lote." : "Novas unidades disponíveis.",
      },
      reactivate_lead: {
        headline: "Ainda procurando?",
        sub: "Separei opções que fazem sentido pra você.",
      },
    }
    return { badge, ...first[objective] }
  }

  // Page 2+ of N: continuation framing.
  const cont: Record<ObjectiveKey, { headline: string; sub: string }> = {
    sell_fast: { headline: "Mais opções\nno estoque", sub: "Separei o restante do lote." },
    generate_desire: {
      headline: "Mais condições\nselecionadas",
      sub: "Continuação da vitrine de hoje.",
    },
    bundle_gift: {
      headline: "Mais opções\npara fechar o kit",
      sub: "Escolha o produto e eu confirmo o que entra junto.",
    },
    trust_proof: {
      headline: "Mais conferidos\ne disponíveis",
      sub: "Continuação da seleção segura.",
    },
    new_arrival: {
      headline: "Mais novidades\ndo lote",
      sub: "Continuação do lote recente.",
    },
    reactivate_lead: {
      headline: "Mais opções\npra você",
      sub: "Continuação das condições disponíveis.",
    },
  }
  return { badge, ...cont[objective] }
}

function buildVitrineStory(
  pageFacts: ProductFacts[],
  totalProducts: number,
  page: number,
  total: number,
  strategy: GeneralStrategy,
  density: DensityMode
): StoryData {
  const primary = pageFacts.find((f) => f.isPrimary) ?? pageFacts[0]
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : null
  const basePriceStr = primary.discount && primary.basePrice != null ? formatBRL(primary.basePrice) : null
  const parcel = primary.installment?.text ?? null
  const isMulti = pageFacts.length > 1
  const { headline, sub, badge } = objectiveStoryCopy(
    strategy.objective,
    page,
    total,
    totalProducts,
    primary
  )
  const label = total > 1 ? `Vitrine ${page}/${total}` : "Vitrine"
  const footer = buildVitrineFooterCta(pageFacts, strategy, totalProducts)

  // Always emit vitrineProducts so the client renders the unified vitrine
  // layout (hero card when single, list when multi). Benefits + footer CTA
  // are deterministic and fill the vertical space.
  return {
    kind: "vitrine",
    label,
    pageInfo: { page, total },
    density,
    badge,
    headline,
    sub,
    tags: isMulti ? [] : buildTags(primary),
    productName: buildStoryProductName(primary),
    price: priceStr,
    basePrice: basePriceStr,
    discountPercent: getVisualDiscountPercent(primary.basePrice, primary.disclosurePrice),
    parcel,
    detailLines: isMulti ? [] : buildDetailLines(primary),
    urgencyLine: urgencyBodyLine(strategy.urgencyLevel, effectiveQuantity(primary)),
    ctaMain: null,
    ctaSub: null,
    vitrineProducts: buildVitrineItems(pageFacts, strategy.objective),
    benefits: buildVitrineBenefits(pageFacts, strategy),
    footerCtaMain: footer.main,
    footerCtaSub: footer.sub,
  }
}

function buildHighlightStory(
  facts: ProductFacts[],
  strategy: GeneralStrategy
): StoryData {
  const primary = pickPrimary(facts)
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : null
  const basePriceStr = primary.discount && primary.basePrice != null ? formatBRL(primary.basePrice) : null
  const parcel = primary.installment?.text ?? null

  // Short model name: drop parentheticals first so we never split "(11ª"
  // and leave a dangling unclosed parenthesis.
  const shortName = buildHighlightProductName(primary)
  // Deep-dive bullets — the strongest real arguments, NOT a spec dump.
  // Differs from the vitrine card (which is name + price + pills).
  const argueLines: string[] = []
  if (primary.grade) argueLines.push(conditionLabel(primary.grade))
  if (!isSealedProduct(primary) && primary.battery_health != null) argueLines.push(`Bateria ${primary.battery_health}%`)
  if (primary.warrantyLabel) argueLines.push(primary.warrantyLabel)
  if (primary.gifts) argueLines.push(`Já sai com ${primary.gifts}`)
  if (primary.discount && primary.basePrice != null && primary.disclosurePrice != null) {
    argueLines.push(`De ${formatBRL(primary.basePrice)} por ${formatBRL(primary.disclosurePrice)}`)
  }
  if (effectiveQuantity(primary) <= 1) argueLines.push("Última unidade nessa condição")
  const detailLines = argueLines.filter(Boolean).slice(0, 5)

  // Sub = short comma-joined summary of the top real arguments (not the
  // product name, not a spec dump). Falls back to the commercial name.
  const summaryParts = detailLines.slice(0, 3)
  const highlightSub =
    summaryParts.length === 0
      ? buildStoryProductName(primary)
      : summaryParts.length === 1
      ? `${summaryParts[0]}.`
      : `${summaryParts.slice(0, -1).join(", ")} e ${summaryParts[summaryParts.length - 1]}.`

  const headlineMap: Record<ObjectiveKey, string> = {
    sell_fast: `Por que esse\n${shortName} sai rápido?`,
    generate_desire: `Por que esse\n${shortName} chama atenção?`,
    bundle_gift: `${shortName}\njá sai completo`,
    trust_proof: `${shortName}\nconferido de verdade`,
    new_arrival: `${shortName}\nacabou de chegar`,
    reactivate_lead: `Esse ${shortName}\nainda faz sentido`,
  }

  return {
    kind: "highlight",
    label: "Destaque",
    badge: primary.isPrimary && facts.length > 1 ? "PRINCIPAL" : "DESTAQUE",
    headline: headlineMap[strategy.objective],
    sub: highlightSub,
    tags: orderedVitrineTags(primary, strategy.objective),
    productName: buildStoryProductName(primary),
    price: priceStr,
    basePrice: basePriceStr,
    discountPercent: getVisualDiscountPercent(primary.basePrice, primary.disclosurePrice),
    parcel,
    detailLines,
    urgencyLine: null,
    ctaMain: null,
    ctaSub: null,
  }
}

function buildCtaStory(facts: ProductFacts[], strategy: GeneralStrategy): StoryData {
  const primary = pickPrimary(facts)
  const priceStr = primary.disclosurePrice != null ? formatBRL(primary.disclosurePrice) : null
  const parcel = primary.installment?.text ?? null
  const cta = contextualCta(facts, strategy)

  const warrantyTrustLine = primary.warrantyLabel || null
  const baseTrustLines: Record<ObjectiveKey, string[]> = {
    sell_fast: ["Disponibilidade confirmada no atendimento", "Condição conferida antes da reserva"],
    generate_desire: ["Produto original", "Suporte pós-venda"],
    bundle_gift: primary.gifts ? ["Kit completo", "Sem gasto adicional"] : ["Produto conferido", "Condição explicada antes da compra"],
    trust_proof: ["Produto conferido", "Serial verificado", "Portal de compra incluso"],
    new_arrival: ["Lote recente", "Produto conferido"],
    reactivate_lead: ["Mesmo produto", "Disponível agora"],
  }
  const trustLines = warrantyTrustLine
    ? [...baseTrustLines[strategy.objective], warrantyTrustLine]
    : baseTrustLines[strategy.objective]

  // Multi-product closing must NOT show a price/parcel — it belongs to one
  // product and confuses which item it refers to.
  const isSingle = facts.length === 1

  return {
    kind: "cta",
    label: "Fechamento",
    badge: "CONTATO",
    headline: cta.main,
    sub: cta.sub,
    tags: [],
    productName: primary.name,
    price: isSingle ? priceStr : null,
    basePrice: null,
    parcel: isSingle ? parcel : null,
    detailLines: [
      `${facts.length} ${facts.length === 1 ? "opção disponível" : "opções disponíveis"}`,
      facts.find((f) => f.discount)?.copyStrongPoint || primary.copyStrongPoint,
      ...trustLines,
    ].filter(Boolean).slice(0, 4),
    urgencyLine: null,
    ctaMain: cta.main,
    ctaSub: isSingle && priceStr ? `${priceStr}${parcel ? ` · ${parcel}` : ""}` : null,
  }
}

function shouldAutoAddHighlight(primary: ProductFacts, totalProducts: number): boolean {
  if (totalProducts <= 1) return false
  if (primary.discount) return true
  if (primary.warrantyLabel) return true
  if (primary.battery_health != null && primary.battery_health >= 95) return true
  if (primary.quantity <= 1) return true
  return false
}

function shouldAutoAddCta(totalProducts: number): boolean {
  return totalProducts <= 3
}

export function buildDynamicStories(
  facts: ProductFacts[],
  strategy: GeneralStrategy
): StoryData[] {
  if (facts.length === 0) return []
  // 1) Sort by objective-aware commercial weight, pick density, then paginate
  //    by visual weight (rich cards take more room than simple accessories).
  const sorted = sortProductsForVitrine(facts, strategy)
  const density = pickDensityMode(sorted, strategy)
  const pages = chunkProductsForVisualStories(sorted, density, strategy.objective)
  const rawStories: StoryData[] = pages.map((pageFacts, i) =>
    buildVitrineStory(pageFacts, sorted.length, i + 1, pages.length, strategy, density)
  )

  // 2) Highlight story — optional, controlled by toggle or auto-rule.
  const primary = pickPrimary(sorted)
  const wantHighlight = strategy.addHighlightStory == null
    ? shouldAutoAddHighlight(primary, sorted.length)
    : strategy.addHighlightStory
  if (wantHighlight) rawStories.push(buildHighlightStory(sorted, strategy))

  // 3) CTA story — optional. Default ON for ≤3 products, OFF for many products.
  const wantCta = strategy.addCtaStory == null
    ? shouldAutoAddCta(sorted.length)
    : strategy.addCtaStory
  if (wantCta) rawStories.push(buildCtaStory(sorted, strategy))

  // 4) CTA variation: inject objective-specific CTAs from the bank.
  //    Skipped when user has set a custom generalCta (preserve override).
  //    Vitrine footer and closing story get varied texts — no two consecutive
  //    stories repeat the same CTA.
  if (!strategy.generalCta) {
    const seed = strategy.ctaVariationSeed ?? 0
    const usedCtas: string[] = []
    return rawStories.map((story, index) => {
      const obj = strategy.objective as CtaObjective
      if (story.kind === "vitrine" && story.footerCtaMain) {
        const cta = pickStoryCta({ objective: obj, storyIndex: index, usedCtas, variationSeed: seed })
        usedCtas.push(cta)
        return { ...story, footerCtaMain: cta }
      }
      if (story.kind === "cta") {
        const cta = pickStoryCta({ objective: obj, storyIndex: index, usedCtas, variationSeed: seed })
        usedCtas.push(cta)
        return { ...story, headline: cta, ctaMain: cta }
      }
      return story
    })
  }

  return rawStories
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
      vitrineItems: buildVitrineItems(facts, strategy.objective),
    })
  } else {
	    const specLines = [
	      primary.storage,
	      primary.color && `Cor: ${primary.color}`,
	      primary.grade && conditionLabel(primary.grade),
	      !isSealedProduct(primary) && primary.battery_health != null && `Bateria ${primary.battery_health}%`,
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
  const condition = whatsappConditionLine(f)
  if (condition) lines.push(condition)
  if (!isSealedProduct(f) && f.battery_health != null) lines.push(`🔋 Bateria ${f.battery_health}%`)
  if (f.warrantyLabel) lines.push(`🛡 ${f.warrantyLabel}`)
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
  if (effectiveQuantity(f) <= 1) lines.push("⚡ Última unidade disponível")
  return lines
}

function generateWhatsApp(facts: ProductFacts[], strategy: GeneralStrategy): string {
  const primary = pickPrimary(facts)
  const isMulti = facts.length > 1
  const cta = (strategy.generalCta || "Me chama que eu vejo a disponibilidade pra você.").trim()
  const lines: string[] = []

  if (isMulti) {
    lines.push("Tenho algumas opções disponíveis hoje na Nobretech:")
    lines.push("")
    facts.forEach((f, i) => {
      lines.push(...lineForProductWhatsApp(f, i + 1))
      lines.push("")
    })
  } else {
    lines.push("*Olha essa condição que entrou na Nobretech:*")
    lines.push("")
    lines.push(...lineForProductWhatsApp(primary))
    lines.push("")
  }

  if (strategy.generalNote && facts.length <= 3) {
    lines.push(strategy.generalNote)
    lines.push("")
  }

  const strongest = facts.find((f) => f.isPrimary || f.isFeatured || f.discount) ?? primary
  const closingParts: string[] = []
  if (strongest.discount || strongest.battery_health != null || strongest.warrantyLabel) {
    const reasons = [
      !isSealedProduct(strongest) && strongest.battery_health != null ? `bateria ${strongest.battery_health}%` : null,
      strongest.warrantyLabel,
      strongest.discount ? "desconto real" : null,
    ].filter(Boolean)
    if (reasons.length > 0) {
      closingParts.push(`${facts.length > 1 ? "O destaque" : "O destaque"} é o conjunto: ${reasons.join(", ")}.`)
    }
  }
  if (effectiveQuantity(primary) <= 1) closingParts.push("Tenho só uma unidade nessa condição.")
  else if (strategy.urgencyLevel !== "none") closingParts.push(urgencyWhatsAppLine(strategy.urgencyLevel, effectiveQuantity(primary)))
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
  const rawFacts = sortProductsForVitrine(drafts.map(buildProductFacts), strategy)

  // Compute commercial quantities: group by commercial equivalence key so that
  // two identical lacrado iPads count as 2 units in the same group, while a
  // lacrado iPad and a Grade-A iPad remain separate groups.
  // Facts that already carry commercialAvailableQuantity (caller-supplied) are
  // kept as-is; the rest are filled from the campaign's own product set.
  const commercialGroups = new Map<string, number>()
  rawFacts.forEach((f) => {
    if (f.commercialAvailableQuantity != null) return
    const key = getCommercialAvailabilityKey(f)
    commercialGroups.set(key, (commercialGroups.get(key) ?? 0) + 1)
  })
  const facts = rawFacts.map((f) =>
    f.commercialAvailableQuantity != null
      ? f
      : { ...f, commercialAvailableQuantity: commercialGroups.get(getCommercialAvailabilityKey(f)) ?? 1 }
  )

  const warnings: string[] = []
  const primary = pickPrimary(facts)
  if (strategy.urgencyLevel === "high" && effectiveQuantity(primary) > 3) {
    warnings.push("Urgência alta com estoque > 3 unidades pode parecer falsa escassez.")
  }
  facts.forEach((f) => {
    if (f.disclosurePrice == null) warnings.push(`${f.name}: preço de divulgação não definido.`)
  })

  const stories = buildDynamicStories(facts, strategy)
  // Hard guardrail: every selected product must appear in some vitrine page.
  // Match by stable inventory id — the displayed name is intentionally trimmed
  // by buildStoryProductName, so name comparison would false-positive.
  const idsInVitrine = new Set<string>()
  stories
    .filter((s) => s.kind === "vitrine")
    .forEach((s) => {
      s.vitrineProducts?.forEach((v) => idsInVitrine.add(v.productId))
    })
  facts.forEach((f) => {
    if (!idsInVitrine.has(f.id)) {
      warnings.push(`Produto não apareceu na vitrine: ${f.name}.`)
    }
  })

  return {
    stories,
    carousel: generateCarousel(facts, strategy),
    whatsapp: generateWhatsApp(facts, strategy),
    instagram: generateInstagram(facts, strategy),
    facts,
    source: "deterministic",
    warnings,
  }
}

export { OBJECTIVE_LABELS, TONE_LABELS, CHANNEL_LABELS, conditionLabel }
