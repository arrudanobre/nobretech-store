import type { StoryData, VitrineItem } from "@/lib/marketing/copy-generator"
import {
  W, H, PAD_L, PAD_R, PAD_T, PAD_B,
  CONTENT_W, CARD_W, CARD_PAD_V, CARD_PAD_H,
  LEFT_COL_W, RIGHT_COL_W, COL_GAP,
  CARD_GAP, CARD_CORNER,
  LOGO_FONT, BADGE_FONT, BADGE_H, DIVIDER_Y_FROM_TOP,
  HEADLINE_FONT, HEADLINE_LINE_H, SUB_FONT, SUB_GAP,
  NAME_FONT, NAME_LINE_H, SUBTITLE_FONT, SUBTITLE_GAP,
  PILL_FONT, PILL_H, PILL_GAP_TOP, PILL_BETWEEN,
  META_FONT, META_GAP,
  PRICE_STRUCK_FONT, PARCEL_FONT, DISCOUNT_FONT,
  BENEFIT_FONT, BENEFIT_LINE_H, BENEFIT_DOT,
  CTA_H, CTA_FONT, CTA_CORNER,
  ORANGE, DARK_BG, CARD_BG, CARD_BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
  DIVIDER_COLOR, DISCOUNT_COLOR,
  WARRANTY_COLOR, KIT_COLOR,
  TAG_COLORS,
  wrapText, calcPillWidth,
  calcCardLayout,
  estimateTextWidth,
} from "./story-layout"

// ─── SVG primitives ───────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function svgRect(
  x: number, y: number, w: number, h: number,
  opts: { fill?: string; stroke?: string; strokeW?: number; rx?: number } = {}
): string {
  const { fill = "none", stroke, strokeW = 1, rx } = opts
  const strokePart = stroke ? ` stroke="${stroke}" stroke-width="${strokeW}"` : ""
  const rxPart = rx != null ? ` rx="${rx}"` : ""
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${strokePart}${rxPart}/>`
}

function svgLine(
  x1: number, y1: number, x2: number, y2: number,
  opts: { stroke?: string; strokeW?: number; opacity?: number } = {}
): string {
  const { stroke = "#666", strokeW = 1.5, opacity } = opts
  const opPart = opacity != null ? ` opacity="${opacity}"` : ""
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeW}"${opPart}/>`
}

type TextAnchor = "start" | "middle" | "end"

function svgText(
  text: string, x: number, y: number, fontSize: number,
  opts: {
    weight?: 400 | 500 | 600 | 700 | 800 | 900
    fill?: string
    anchor?: TextAnchor
    letterSpacing?: number | string
    opacity?: number
  } = {}
): string {
  const { weight = 400, fill = TEXT_PRIMARY, anchor = "start", letterSpacing, opacity } = opts
  const lsPart = letterSpacing != null ? ` letter-spacing="${letterSpacing}"` : ""
  const opPart = opacity != null ? ` opacity="${opacity}"` : ""
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${lsPart}${opPart}>${esc(text)}</text>`
}

function svgCircle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function drawPill(x: number, y: number, label: string, type: string): { svg: string; width: number } {
  const colors = TAG_COLORS[type] ?? { bg: "#222", fg: "#aaa" }
  const pw = calcPillWidth(label)
  const textX = x + pw / 2
  const textY = y + PILL_H / 2 + PILL_FONT * 0.38  // baseline ≈ mid + 38% of font size
  const svg =
    svgRect(x, y, pw, PILL_H, { fill: colors.bg, rx: PILL_H / 2 }) +
    svgText(label, textX, textY, PILL_FONT, { weight: 600, fill: colors.fg, anchor: "middle" })
  return { svg, width: pw }
}

// ─── Header (NOBRETECH + badge + divider) ─────────────────────────────────────

function drawHeader(badge: string, topY: number): { svg: string; bottomY: number } {
  const logoY = topY + 40  // text baseline
  const badgeY = topY + 2
  const dividerY = topY + DIVIDER_Y_FROM_TOP

  let svg = svgText("NOBRETECH", PAD_L, logoY, LOGO_FONT, { weight: 800, letterSpacing: "4" })

  if (badge) {
    const badgeText = badge.toUpperCase()
    const badgeW = Math.max(132, estimateTextWidth(badgeText, BADGE_FONT, 0.6) + 44)
    const badgeTX = W - PAD_R - badgeW  // left edge of badge rect
    const badgeTextX = badgeTX + badgeW / 2
    const badgeTextY = badgeY + BADGE_H / 2 + BADGE_FONT * 0.38
    svg +=
      svgRect(badgeTX, badgeY, badgeW, BADGE_H, { fill: ORANGE, rx: BADGE_H / 2 }) +
      svgText(badgeText, badgeTextX, badgeTextY, BADGE_FONT, { weight: 800, anchor: "middle", letterSpacing: "1" })
  }

  svg += svgLine(PAD_L, dividerY, W - PAD_R, dividerY, { stroke: DIVIDER_COLOR, strokeW: 1 })

  const bottomY = dividerY + 18  // gap after divider
  return { svg, bottomY }
}

// ─── Headline + sub ───────────────────────────────────────────────────────────

function drawHeadline(
  headline: string,
  sub: string,
  topY: number,
  options: { maxLines?: number } = {}
): { svg: string; bottomY: number } {
  const lines = wrapText(headline, CONTENT_W, HEADLINE_FONT, options.maxLines ?? 2)
  let svg = ""
  let y = topY + HEADLINE_FONT  // first baseline

  for (const line of lines) {
    svg += svgText(line, PAD_L, y, HEADLINE_FONT, { weight: 900 })
    y += HEADLINE_LINE_H
  }

  // y is now at bottom-of-last-line + overshoot
  let bottomY = y - (HEADLINE_LINE_H - HEADLINE_FONT) // trim trailing leading

  if (sub) {
    bottomY += SUB_GAP
    const subY = bottomY + SUB_FONT
    svg += svgText(sub, PAD_L, subY, SUB_FONT, { fill: TEXT_SECONDARY })
    bottomY = subY + 8
  }

  return { svg, bottomY: bottomY + 32 }  // 32 gap before cards
}

// ─── Product card ─────────────────────────────────────────────────────────────

function drawProductCard(
  item: VitrineItem,
  cardY: number,
  opts: { productCount?: number; highlight?: boolean } = {}
): { svg: string; height: number } {
  const layout = calcCardLayout(item, opts)
  const { height, nameLines, pillsToShow, priceFont,
    hasSubtitle, hasPills, hasWarranty, hasKit,
    hasBasePrice, hasParcel, hasDiscount, showPrice, leftBlockH, rightBlockH } = layout

  const cardX = PAD_L

  // Card background
  const borderColor = item.isFeatured || item.isPrimary || item.hasDiscount ? ORANGE : CARD_BORDER
  const strokeW = item.isFeatured || item.isPrimary || item.hasDiscount ? 2.4 : 1.5
  let svg = svgRect(cardX, cardY, CARD_W, height, { fill: CARD_BG, stroke: borderColor, strokeW, rx: CARD_CORNER })

  // Inner content area
  const innerTop = cardY + CARD_PAD_V
  const contentX = cardX + CARD_PAD_H
  const innerH = height - CARD_PAD_V * 2

  // ─ Left zone ─────────────────────────────────────────────────────────────
  let leftY = innerTop + Math.max(0, Math.round((innerH - leftBlockH) / 2))

  // Name (1-2 lines)
  for (const line of nameLines) {
    svg += svgText(line, contentX, leftY + NAME_FONT, NAME_FONT, { weight: 800 })
    leftY += NAME_LINE_H
  }

  // Subtitle
  if (hasSubtitle) {
    leftY += SUBTITLE_GAP
    svg += svgText(item.subtitle, contentX, leftY + SUBTITLE_FONT, SUBTITLE_FONT, { fill: TEXT_SECONDARY, weight: 500 })
    leftY += SUBTITLE_FONT + 4
  }

  // Pills row
  if (hasPills) {
    leftY += PILL_GAP_TOP
    let pillX = contentX
    for (const tag of pillsToShow) {
      const label = tag.shortLabel ?? tag.label
      const { svg: pillSvg, width: pw } = drawPill(pillX, leftY, label, tag.type)
      svg += pillSvg
      pillX += pw + PILL_BETWEEN
    }
    leftY += PILL_H
  }

  // Warranty line
  if (hasWarranty) {
    leftY += META_GAP
    svg += svgText(`\u{1F6E1} ${item.warrantyLine}`, contentX, leftY + META_FONT, META_FONT, { fill: WARRANTY_COLOR, weight: 700 })
    leftY += META_FONT + 4
  }

  // Kit line
  if (hasKit) {
    leftY += META_GAP
    svg += svgText(`\u{1F381} ${item.kitLine}`, contentX, leftY + META_FONT, META_FONT, { fill: KIT_COLOR, weight: 700 })
    leftY += META_FONT + 4
  }

  // ─ Right zone (vertically centred in card) ────────────────────────────────
  if (showPrice) {
    const rightX = contentX + LEFT_COL_W + COL_GAP + RIGHT_COL_W  // text-anchor="end"
    let rightY = innerTop + Math.max(0, Math.round((innerH - rightBlockH) / 2))

    // Struck base price
    if (hasBasePrice && item.basePrice) {
      const textY = rightY + PRICE_STRUCK_FONT
      svg += svgText(item.basePrice, rightX, textY, PRICE_STRUCK_FONT, { fill: TEXT_MUTED, anchor: "end" })
      const approxW = estimateTextWidth(item.basePrice, PRICE_STRUCK_FONT, 0.53)
      const lineY = textY - PRICE_STRUCK_FONT * 0.4
      svg += svgLine(rightX - approxW, lineY, rightX, lineY, { stroke: TEXT_MUTED, strokeW: 1.5, opacity: 0.7 })
      rightY += PRICE_STRUCK_FONT + 6
    }

    // Main price
    if (item.price) {
      const textY = rightY + priceFont
      svg += svgText(item.price, rightX, textY, priceFont, { weight: 900, fill: ORANGE, anchor: "end" })
      rightY += priceFont + 12
    }

    // Parcel
    if (hasParcel && item.parcel) {
      const textY = rightY + PARCEL_FONT
      svg += svgText(item.parcel, rightX, textY, PARCEL_FONT, { fill: TEXT_SECONDARY, anchor: "end", weight: 600 })
      rightY += PARCEL_FONT + 8
    }

    // Discount percent
    if (hasDiscount && item.discountPercent != null) {
      const textY = rightY + DISCOUNT_FONT
      const discText = `${Math.round(item.discountPercent)}% off`
      svg += svgText(discText, rightX, textY, DISCOUNT_FONT, { fill: DISCOUNT_COLOR, weight: 600, anchor: "end" })
    }
  }

  return { svg, height }
}

// ─── Benefits block ───────────────────────────────────────────────────────────

function drawBenefits(benefits: string[], x: number, topY: number): { svg: string; height: number } {
  let svg = ""
  let y = topY
  for (const line of benefits) {
    const textY = y + BENEFIT_FONT
    svg += svgCircle(x + BENEFIT_DOT, textY - BENEFIT_FONT * 0.3, BENEFIT_DOT, ORANGE)
    svg += svgText(line, x + BENEFIT_DOT * 2 + 10, textY, BENEFIT_FONT, { fill: TEXT_SECONDARY })
    y += BENEFIT_LINE_H
  }
  return { svg, height: y - topY }
}

// ─── CTA button ───────────────────────────────────────────────────────────────

function drawCtaButton(text: string, x: number, y: number, w: number): string {
  const textY = y + CTA_H / 2 + CTA_FONT * 0.38
  return (
    svgRect(x, y, w, CTA_H, { fill: ORANGE, rx: CTA_CORNER }) +
    svgText(text, x + w / 2, textY, CTA_FONT, { weight: 900, anchor: "middle" })
  )
}

// ─── Urgency line ─────────────────────────────────────────────────────────────

function drawUrgencyLine(text: string, x: number, y: number): string {
  return svgText(text, x, y + META_FONT, META_FONT, { fill: ORANGE, weight: 600 })
}

// ─── Vitrine story ────────────────────────────────────────────────────────────

function renderVitrine(story: StoryData): string {
  const { badge, headline, sub, urgencyLine, benefits = [], footerCtaMain, vitrineProducts = [] } = story

  let body = ""

  // Header
  const { svg: headerSvg, bottomY: headlineTop } = drawHeader(badge, PAD_T)
  body += headerSvg

  // Headline + sub
  const { svg: headlineSvg, bottomY: cardsTop } = drawHeadline(headline, sub, headlineTop)
  body += headlineSvg

  // Product cards
  let y = cardsTop
  const productCount = vitrineProducts.length
  for (let i = 0; i < vitrineProducts.length; i++) {
    const item = vitrineProducts[i]
    if (i > 0) y += CARD_GAP
    const { svg: cardSvg, height } = drawProductCard(item, y, { productCount })
    body += cardSvg
    y += height
  }

  // Urgency line (directly after cards)
  if (urgencyLine) {
    y += 24
    body += drawUrgencyLine(urgencyLine, PAD_L, y)
    y += META_FONT + 8
  }

  // Benefits + CTA pinned to bottom, with enough breathing room from cards.
  const ctaText = footerCtaMain ?? "Me chama para reservar"
  const ctaY = H - PAD_B - CTA_H
  const availableForBenefits = ctaY - y - 72
  const maxBenefits = availableForBenefits < BENEFIT_LINE_H * 3 ? 2 : 3
  const benefitLines = benefits.slice(0, maxBenefits)
  const benefitsH = benefitLines.length * BENEFIT_LINE_H
  const pinnedBenefitsY = ctaY - (benefitLines.length > 0 ? benefitsH + 34 : 0)
  const naturalBenefitsY = y + (productCount <= 1 ? 76 : 48)
  const benefitsY = Math.min(pinnedBenefitsY, Math.max(naturalBenefitsY, pinnedBenefitsY - 120))

  if (benefitLines.length > 0) {
    const { svg: bSvg } = drawBenefits(benefitLines, PAD_L, benefitsY)
    body += bSvg
  }

  body += drawCtaButton(ctaText, PAD_L, ctaY, CONTENT_W)

  return body
}

// ─── Highlight story ──────────────────────────────────────────────────────────

function highlightWarrantyLine(detailLines: string[]): string | null {
  const line = detailLines.find((d) => /garantia/i.test(d))
  return line ?? null
}

function highlightKitLine(detailLines: string[]): string | null {
  const line = detailLines.find((d) => /^(kit:|já sai com)/i.test(d))
  if (!line) return null
  return line.replace(/^kit:\s*/i, "").replace(/^já sai com\s*/i, "").trim()
}

function renderHighlight(story: StoryData): string {
  const { badge, headline, sub, detailLines, ctaMain, ctaSub, benefits = [] } = story

  let body = ""
  const { svg: headerSvg, bottomY: headlineTop } = drawHeader(badge, PAD_T)
  body += headerSvg

  const { svg: headlineSvg, bottomY: detailTop } = drawHeadline(headline, sub, headlineTop, { maxLines: 3 })
  body += headlineSvg

  const warrantyLine = highlightWarrantyLine(detailLines)
  const kitLine = highlightKitLine(detailLines)
  const cardItem: VitrineItem = {
    productId: "highlight",
    name: story.productName,
    subtitle: "Destaque Nobretech",
    warrantyLine,
    kitLine,
    price: story.price,
    basePrice: story.basePrice,
    discountPercent: story.basePrice && story.price ? 1 : null,
    parcel: story.parcel,
    tags: story.tags,
    warrantyLabel: warrantyLine,
    gifts: kitLine,
    color: null,
    hasDiscount: Boolean(story.basePrice && story.price),
    isFeatured: true,
    grade: null,
    storage: null,
    quantity: 1,
    isPrimary: true,
    cardType: "rich",
  }

  const cardTop = detailTop + 10
  const { svg: cardSvg, height: cardH } = drawProductCard(cardItem, cardTop, { productCount: 1, highlight: true })
  body += cardSvg

  // Detail lines as large bullets, below the card.
  const HL_FONT = 36
  const HL_LINE_H = 58
  const HL_DOT = 12

  const bulletLines = detailLines
    .filter((line) => line !== warrantyLine && !/^(kit:|já sai com|de r\$)/i.test(line))
    .slice(0, 4)
  const ctaY = H - PAD_B - CTA_H
  const maxBulletCount = Math.max(0, Math.min(bulletLines.length, Math.floor((ctaY - (cardTop + cardH + 76)) / HL_LINE_H)))
  let y = cardTop + cardH + 52
  for (const line of bulletLines.slice(0, maxBulletCount)) {
    const textY = y + HL_FONT
    body += svgCircle(PAD_L + HL_DOT, textY - HL_FONT * 0.3, HL_DOT, ORANGE)
    body += svgText(line, PAD_L + HL_DOT * 2 + 14, textY, HL_FONT, { fill: TEXT_SECONDARY, weight: 700 })
    y += HL_LINE_H
  }

  // Extra benefits below
  if (benefits.length > 0) {
    y += 20
    const { svg: bSvg } = drawBenefits(benefits.slice(0, 3), PAD_L, y)
    body += bSvg
  }

  // CTA at bottom
  if (ctaMain) {
    body += drawCtaButton(ctaMain, PAD_L, ctaY, CONTENT_W)
  }
  if (ctaSub) {
    const subY = ctaY - 20
    body += svgText(ctaSub, W / 2, subY, META_FONT, { fill: TEXT_SECONDARY, anchor: "middle" })
  }

  return body
}

// ─── CTA / closing story ──────────────────────────────────────────────────────

function renderCta(story: StoryData): string {
  const { badge, headline, sub, detailLines = [], ctaMain, ctaSub, vitrineProducts = [] } = story

  let body = ""
  const { svg: headerSvg, bottomY: headlineTop } = drawHeader(badge, PAD_T)
  body += headerSvg

  const isMultiProductClosing = !story.price && !story.parcel && !ctaSub
  const displayHeadline = isMultiProductClosing ? "Escolha o modelo\ne me chama." : headline
  const displaySub = isMultiProductClosing ? "Eu confirmo disponibilidade e condição atual." : sub
  const headLines = wrapText(displayHeadline, CONTENT_W, HEADLINE_FONT, 3)
  // prefer detailLines; fall back to product names (no prices)
  const bulletItems: string[] =
    isMultiProductClosing
      ? []
      : detailLines.length > 0
      ? detailLines.slice(0, 6)
      : vitrineProducts.slice(0, 4).map((p) => p.name)

  const CTA_BULLET_FONT = 32
  const CTA_BULLET_LINE_H = 48

  // Pre-compute heights for vertical centering
  const headH = headLines.length * HEADLINE_LINE_H - (HEADLINE_LINE_H - HEADLINE_FONT)
  const subH = displaySub ? SUB_GAP + SUB_FONT + 20 : 16
  const bulletH = bulletItems.length > 0 ? 28 + bulletItems.length * CTA_BULLET_LINE_H : 0
  const totalBlockH = headH + subH + bulletH

  const ctaY = H - PAD_B - CTA_H
  const availH = ctaY - headlineTop - 40
  const blockStartY = headlineTop + Math.max(0, Math.round((availH - totalBlockH) / 2))

  // Headline centered horizontally
  let y = blockStartY + HEADLINE_FONT
  for (const line of headLines) {
    body += svgText(line, W / 2, y, HEADLINE_FONT, { weight: 800, anchor: "middle" })
    y += HEADLINE_LINE_H
  }
  y -= HEADLINE_LINE_H - HEADLINE_FONT

  if (displaySub) {
    y += SUB_GAP
    body += svgText(displaySub, W / 2, y + SUB_FONT, SUB_FONT, { fill: TEXT_SECONDARY, anchor: "middle" })
    y += SUB_FONT + 20
  } else {
    y += 16
  }

  // Bullet list (names/detailLines — no prices)
  if (bulletItems.length > 0) {
    y += 28
    const dot = BENEFIT_DOT + 2
    for (const item of bulletItems) {
      const textY = y + CTA_BULLET_FONT
      body += svgCircle(PAD_L + dot, textY - CTA_BULLET_FONT * 0.3, dot, ORANGE)
      body += svgText(item, PAD_L + dot * 2 + 12, textY, CTA_BULLET_FONT, { weight: 600 })
      y += CTA_BULLET_LINE_H
    }
  }

  // CTA button
  const ctaLabel = isMultiProductClosing ? "Me chama para reservar" : ctaMain ?? "Me chama para reservar"
  body += drawCtaButton(ctaLabel, PAD_L, ctaY, CONTENT_W)

  if (ctaSub) {
    body += svgText(ctaSub, W / 2, ctaY - 26, META_FONT, { fill: TEXT_SECONDARY, anchor: "middle" })
  }

  return body
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderStoryToSVG(story: StoryData): string {
  const bg = svgRect(0, 0, W, H, { fill: DARK_BG })

  let body: string
  if (story.kind === "vitrine") {
    body = renderVitrine(story)
  } else if (story.kind === "cta") {
    body = renderCta(story)
  } else {
    // highlight / trust — use highlight renderer
    body = renderHighlight(story)
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    bg +
    body +
    `</svg>`
  )
}
