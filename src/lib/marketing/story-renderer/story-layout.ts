import type { StoryTag, VitrineItem } from "@/lib/marketing/copy-generator"

// ─── Canvas dimensions ────────────────────────────────────────────────────────
export const W = 1080
export const H = 1920

export const PAD_L = 64
export const PAD_R = 64
export const PAD_T = 72
export const PAD_B = 72

export const CONTENT_W = W - PAD_L - PAD_R   // 952

// ─── Card geometry ────────────────────────────────────────────────────────────
export const CARD_W = CONTENT_W              // 952
export const CARD_PAD_V = 40
export const CARD_PAD_H = 40
export const LEFT_COL_W = 520
export const RIGHT_COL_W = 300
export const COL_GAP = 52
export const CARD_GAP = 28
export const CARD_CORNER = 28

// ─── Typography ───────────────────────────────────────────────────────────────
export const LOGO_FONT = 30
export const BADGE_FONT = 18
export const BADGE_H = 50
export const DIVIDER_Y_FROM_TOP = 73  // header top + this = divider y
export const HEADER_BLOCK_H = DIVIDER_Y_FROM_TOP + 18  // +gap after divider

export const HEADLINE_FONT = 82
export const HEADLINE_LINE_H = 86
export const SUB_FONT = 32
export const SUB_GAP = 24            // between headline bottom and sub top

export const NAME_FONT = 46
export const NAME_LINE_H = 56        // leading for name (slightly > font size)
export const SUBTITLE_FONT = 29
export const SUBTITLE_GAP = 12       // above subtitle

export const PILL_FONT = 22
export const PILL_H = 46
export const PILL_GAP_TOP = 18       // above pill row
export const PILL_PAD_X = 18        // horizontal pill padding each side
export const PILL_BETWEEN = 12       // horizontal gap between pills

export const META_FONT = 28          // warranty, kit, parcel
export const META_LINE_H = 36       // line height for meta lines
export const META_GAP = 12           // between consecutive meta lines

export const PRICE_BASE = 64        // max price font size
export const PRICE_STRUCK_FONT = 26
export const PARCEL_FONT = 27
export const DISCOUNT_FONT = 24

export const BENEFIT_FONT = 32
export const BENEFIT_LINE_H = 46
export const BENEFIT_DOT = 10       // bullet dot radius

export const CTA_H = 130
export const CTA_FONT = 40
export const CTA_CORNER = 65

// ─── Colours ──────────────────────────────────────────────────────────────────
export const ORANGE = "#D85A30"
export const DARK_BG = "#0d0d0d"
export const CARD_BG = "#111111"
export const CARD_BORDER = "#1e1e1e"
export const TEXT_PRIMARY = "#ffffff"
export const TEXT_SECONDARY = "#aaaaaa"
export const TEXT_MUTED = "#666666"
export const DIVIDER_COLOR = "#1e1e1e"
export const DISCOUNT_COLOR = "#4aab5a"
export const WARRANTY_COLOR = "#6fd6c7"
export const KIT_COLOR = "#e2a654"

export const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  grade:              { bg: "#1a2e1a", fg: "#5aab3a" },
  battery:            { bg: "#1a1f2e", fg: "#5a8fd4" },
  stock:              { bg: "#2e1a1a", fg: "#d45a5a" },
  new:                { bg: "#2a1a2e", fg: "#b05ad4" },
  warranty_apple:     { bg: "#1a2a2a", fg: "#4ac4b0" },
  warranty_nobretech: { bg: "#1f1a2e", fg: "#8b6fd4" },
  gift:               { bg: "#2e241a", fg: "#d48a35" },
  installment:        { bg: "#1a242e", fg: "#55a7d8" },
  color:              { bg: "#222222", fg: "#d8d8d8" },
}

// ─── Character-width estimators (Arial bold) ──────────────────────────────────
// These are conservative approximations; slightly under-counting is safer (avoids overflow).
const CHAR_W_NAME = 0.56      // bold, mixed
const CHAR_W_PRICE = 0.53     // bold, digits/symbols/spaces

export function estimateTextWidth(text: string, fontSize: number, ratio = CHAR_W_NAME): number {
  return Math.ceil(text.length * fontSize * ratio)
}

// ─── Text wrapping ────────────────────────────────────────────────────────────
/**
 * Greedy word-wrap. Estimates width via char-count ratio.
 * Never ellipsis — if overflow is unavoidable, keeps word on its own line.
 */
export function wrapText(text: string, colWidth: number, fontSize: number, maxLines: number): string[] {
  const maxChars = Math.floor(colWidth / (fontSize * CHAR_W_NAME))
  const lines: string[] = []

  for (const segment of text.split("\n")) {
    if (lines.length >= maxLines) break
    const words = segment.trim().split(" ").filter(Boolean)
    if (words.length === 0) continue
    let current = ""
    for (const word of words) {
      if (lines.length >= maxLines) break
      if (current.length === 0) {
        current = word
      } else if ((current + " " + word).length <= maxChars) {
        current += " " + word
      } else {
        lines.push(current)
        if (lines.length >= maxLines) break
        current = word
      }
    }
    if (current && lines.length < maxLines) lines.push(current)
  }

  return lines.length > 0 ? lines : [text.replace(/\n/g, " ").slice(0, maxChars)]
}

// ─── Price font fitting ───────────────────────────────────────────────────────
export function fitPriceFontSize(priceText: string | null, colWidth: number, baseSize: number): number {
  if (!priceText) return baseSize
  const maxByWidth = Math.floor(colWidth / (priceText.length * CHAR_W_PRICE))
  return Math.max(28, Math.min(baseSize, maxByWidth))
}

// ─── Pill layout ──────────────────────────────────────────────────────────────
export function calcPillWidth(label: string): number {
  return Math.max(52, Math.round(label.length * PILL_FONT * 0.58 + PILL_PAD_X * 2))
}

export function fitPillsToRow(tags: StoryTag[], rowWidth: number): StoryTag[] {
  const result: StoryTag[] = []
  let used = 0
  for (const tag of tags.slice(0, 5)) {
    const label = tag.shortLabel ?? tag.label
    const pw = calcPillWidth(label)
    if (result.length > 0) used += PILL_BETWEEN
    if (used + pw > rowWidth + 8) break  // +8: slight tolerance
    result.push(tag)
    used += pw
  }
  return result
}

// ─── Card layout calculation ──────────────────────────────────────────────────
export interface CardLayout {
  height: number
  nameLines: string[]
  pillsToShow: StoryTag[]
  priceFont: number
  // Pre-computed flags
  hasSubtitle: boolean
  hasPills: boolean
  hasWarranty: boolean
  hasKit: boolean
  hasBasePrice: boolean
  hasParcel: boolean
  hasDiscount: boolean
  showPrice: boolean
  // Right-zone vertical offset (from card top inner boundary) for centering
  leftBlockH: number
  rightBlockH: number
}

export interface CardLayoutOptions {
  productCount?: number
  highlight?: boolean
}

function minCardHeight(item: VitrineItem, productCount: number, highlight: boolean): number {
  if (highlight) return 520

  const richBonus = item.cardType === "rich" || item.isPrimary || item.isFeatured ? 28 : 0
  if (productCount <= 1) return 500 + richBonus
  if (productCount === 2) return 318 + richBonus
  if (productCount === 3) return 246 + richBonus
  return item.cardType === "simple" ? 220 : 238 + richBonus
}

export function calcCardLayout(item: VitrineItem, options: CardLayoutOptions = {}): CardLayout {
  const productCount = options.productCount ?? 3
  const nameLines = wrapText(item.name, LEFT_COL_W, NAME_FONT, 2)
  const availPillW = LEFT_COL_W
  const pillsToShow = fitPillsToRow(item.tags, availPillW)

  const hasSubtitle = !!item.subtitle
  const hasPills = pillsToShow.length > 0
  const hasWarranty = !!item.warrantyLine
  const hasKit = !!item.kitLine
  const showPrice = !!item.price
  const hasBasePrice = !!item.basePrice && showPrice
  const hasParcel = !!item.parcel && showPrice
  const hasDiscount = !!item.discountPercent && showPrice

  const priceFont = fitPriceFontSize(item.price, RIGHT_COL_W, PRICE_BASE)

  // ─ Left zone height
  let leftH = nameLines.length * NAME_LINE_H
  if (hasSubtitle) leftH += SUBTITLE_GAP + SUBTITLE_FONT + 4
  if (hasPills) leftH += PILL_GAP_TOP + PILL_H
  if (hasWarranty) leftH += META_GAP + META_FONT + 4
  if (hasKit) leftH += META_GAP + META_FONT + 4

  // ─ Right zone height
  let rightBlockH = 0
  if (hasBasePrice) rightBlockH += PRICE_STRUCK_FONT + 6
  if (showPrice) rightBlockH += priceFont + 8
  if (hasParcel) rightBlockH += PARCEL_FONT + 4
  if (hasDiscount) rightBlockH += DISCOUNT_FONT + 4

  const innerH = Math.max(leftH, rightBlockH, 120)   // min inner 120px
  const contentHeight = innerH + CARD_PAD_V * 2
  const height = Math.max(contentHeight, minCardHeight(item, productCount, Boolean(options.highlight)))

  return {
    height,
    nameLines,
    pillsToShow,
    priceFont,
    hasSubtitle,
    hasPills,
    hasWarranty,
    hasKit,
    hasBasePrice,
    hasParcel,
    hasDiscount,
    showPrice,
    leftBlockH: leftH,
    rightBlockH,
  }
}

// ─── Story-level available height ─────────────────────────────────────────────
export const STORY_HEADER_H = PAD_T + HEADER_BLOCK_H   // 72 + 136 = 208

export function calcHeadlineBlockH(headline: string, sub: string): number {
  const headLines = wrapText(headline, CONTENT_W, HEADLINE_FONT, 2)
  let h = headLines.length * HEADLINE_LINE_H
  if (sub) h += SUB_GAP + SUB_FONT + 8
  return h + 32  // 32 gap before cards
}
