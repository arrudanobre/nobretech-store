import { formatVisualDiscount, type StoryData, type VitrineItem } from "@/lib/marketing/copy-generator"
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
  DESTAQUE_NAME_COLOR,
  RELAMPAGO_BG, RELAMPAGO_CARD_BG, RELAMPAGO_RED, RELAMPAGO_ACCENT, RELAMPAGO_CARD_BORDER, RELAMPAGO_BAND_BG,
  PREMIUM_BG, PREMIUM_CARD_BG, PREMIUM_CARD_BORDER, PREMIUM_NAME_COLOR, PREMIUM_ACCENT, PREMIUM_TEXT_SEC,
  MOSAICO_CELL_GAP, MOSAICO_CELL_CORNER,
  wrapText, calcPillWidth,
  calcCardLayout,
  estimateTextWidth,
  fitPriceFontSize,
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

function buildMosaicShortName(name: string): string {
  return name
    .replace(/\((?:[^)]*)\)/g, "")
    .replace(/\b(geracao|geração)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function firstTagLabel(item: VitrineItem, type: string): string | null {
  const tag = item.tags.find((candidate) => candidate.type === type)
  return tag?.shortLabel ?? tag?.label ?? null
}

function publicConditionLabel(item: VitrineItem): string | null {
  if (item.subtitle?.toLowerCase().includes("lacrado")) return "Lacrado"
  if (item.subtitle?.toLowerCase().includes("seminovo")) return "Seminovo"
  return null
}

function primaryCellFeature(item: VitrineItem): string | null {
  return (
    publicConditionLabel(item) ||
    firstTagLabel(item, "battery") ||
    (item.warrantyLine?.toLowerCase().includes("apple") ? item.warrantyLine : null) ||
    item.warrantyLine ||
    firstTagLabel(item, "stock") ||
    item.kitLine ||
    item.subtitle ||
    null
  )
}

function compactFeatureLabel(text: string): string {
  return text
    .replace(/Bateria\s+/i, "Bat. ")
    .replace(/Garantia Nobretech\s*/i, "Garantia Nob. ")
    .replace(/Garantia Apple\s*/i, "Garantia Apple ")
    .replace(/\s+/g, " ")
    .trim()
}

function mosaicSecondaryFeature(item: VitrineItem): string | null {
  const battery = firstTagLabel(item, "battery")
  if (battery && publicConditionLabel(item) === "Seminovo") return battery
  if (item.warrantyLine?.toLowerCase().includes("apple")) return "Garantia Apple"
  if (item.warrantyLine) return compactFeatureLabel(item.warrantyLine)
  return firstTagLabel(item, "stock") || item.kitLine || null
}

function drawFeaturePill(text: string, x: number, y: number, maxWidth: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return ""
  const fontSize = 22
  const label = clean.length > 28 ? `${clean.slice(0, 25).trim()}...` : clean
  const w = Math.min(maxWidth, Math.max(148, estimateTextWidth(label, fontSize, 0.54) + 36))
  return (
    svgRect(x, y, w, 44, { fill: "#171717", stroke: "#2a2a2a", strokeW: 1, rx: 22 }) +
    svgText(label, x + w / 2, y + 28, fontSize, { weight: 700, fill: TEXT_SECONDARY, anchor: "middle" })
  )
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
      const discText = `${formatVisualDiscount(item.discountPercent)} off`
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
    discountPercent: story.discountPercent ?? null,
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

// ─── Template: Destaque Pesado ────────────────────────────────────────────────
// Hero single-product layout. Giant name, bottom-anchored price block.

function renderDestaquePesado(story: StoryData): string {
  const { badge, headline, productName, price, basePrice, parcel, detailLines = [], ctaMain, footerCtaMain } = story
  const heroItem = story.vitrineProducts?.find((item) => item.isPrimary) ?? story.vitrineProducts?.[0]
  const heroName = heroItem?.name ?? productName
  const heroPrice = heroItem?.price ?? price
  const heroBasePrice = heroItem?.basePrice ?? basePrice
  const heroParcel = heroItem?.parcel ?? parcel
  const heroSubtitle = [
    heroItem?.subtitle,
    heroItem ? firstTagLabel(heroItem, "battery") : null,
  ].filter(Boolean).join(" · ")
  const heroPills = heroItem
    ? [
        heroItem.subtitle,
        heroItem.warrantyLine,
        heroItem.tags.find((tag) => tag.type === "battery")?.label,
        heroItem.tags.find((tag) => tag.type === "stock")?.label,
        heroItem.kitLine,
      ].filter((line): line is string => Boolean(line))
    : []
  const featureLines = detailLines.length > 0 ? detailLines : heroPills

  let body = ""
  const { svg: headerSvg, bottomY: afterHeader } = drawHeader(badge || "DESTAQUE", PAD_T)
  body += headerSvg

  const ctaY = H - PAD_B - CTA_H
  const heroHeadline =
    /^Dispon/i.test(headline)
      ? `${heroName.split(" ").slice(0, 2).join(" ")} pronto pra sair`
      : headline || "Produto pronto pra sair"

  const headlineFont = 68
  const headlineLines = wrapText(heroHeadline, CONTENT_W, headlineFont, 2)
  let y = afterHeader + 54 + headlineFont
  for (const line of headlineLines) {
    body += svgText(line, PAD_L, y, headlineFont, { weight: 900, fill: TEXT_PRIMARY })
    y += 76
  }

  const stageY = y + 26
  const stageH = Math.min(ctaY - stageY - 42, 980)
  body += svgRect(PAD_L, stageY, CONTENT_W, stageH, { fill: "#111111", stroke: "#2b211d", strokeW: 1.8, rx: 40 })
  body += svgRect(PAD_L, stageY, 10, stageH, { fill: ORANGE, rx: 5 })
  body += svgRect(PAD_L + 34, stageY + 34, 158, 42, { fill: "#1a1a1a", stroke: "#343434", strokeW: 1, rx: 21 })
  body += svgText("PRODUTO HERÓI", PAD_L + 113, stageY + 62, 18, { weight: 800, fill: TEXT_SECONDARY, anchor: "middle", letterSpacing: "1.2" })

  const NAME_GIANT = 86
  const NAME_LH = 96
  const nameLines = wrapText(heroName || "Produto Nobretech", CONTENT_W - 96, NAME_GIANT, 3)
  y = stageY + 104
  for (const line of nameLines) {
    body += svgText(line, PAD_L + 48, y + NAME_GIANT, NAME_GIANT, { weight: 900, fill: DESTAQUE_NAME_COLOR })
    y += NAME_LH
  }

  if (heroSubtitle || story.sub) {
    const subLines = wrapText(heroSubtitle || story.sub, CONTENT_W - 96, SUB_FONT + 2, 2)
    y += 10
    for (const line of subLines) {
      body += svgText(line, PAD_L + 48, y + SUB_FONT + 2, SUB_FONT + 2, { fill: TEXT_SECONDARY, weight: 700 })
      y += SUB_FONT + 16
    }
  }

  const pillY = Math.min(y + 28, stageY + 500)
  let pillX = PAD_L + 48
  for (const line of featureLines.slice(0, 4)) {
    const clean = line.replace(/^De R\$.*/i, "").trim()
    if (!clean) continue
    const pill = drawFeaturePill(clean, pillX, pillY, CONTENT_W - (pillX - PAD_L) - 48)
    if (!pill) continue
    body += pill
    const width = Math.min(CONTENT_W, Math.max(148, estimateTextWidth(clean.slice(0, 28), 22, 0.54) + 36))
    pillX += width + 12
    if (pillX > PAD_L + CONTENT_W - 160) break
  }

  const priceBlockY = Math.min(
    stageY + stageH - 300,
    Math.max(pillY + 112, y + 70)
  )
  body += svgLine(PAD_L + 48, priceBlockY - 36, PAD_L + CONTENT_W - 48, priceBlockY - 36, { stroke: "#242424", strokeW: 1 })

  if (!heroPrice) {
    body += svgText("Preço a confirmar", PAD_L + 48, priceBlockY + 64, 56, { weight: 800, fill: TEXT_SECONDARY })
  } else {
    const priceFont = fitPriceFontSize(heroPrice, CONTENT_W - 96, 116)

    if (heroBasePrice) {
      const bpFont = 34
      const bpY = priceBlockY + bpFont
      body += svgText(heroBasePrice, PAD_L + 48, bpY, bpFont, { fill: TEXT_MUTED })
      const bpW = estimateTextWidth(heroBasePrice, bpFont, 0.53)
      body += svgLine(PAD_L + 48, bpY - bpFont * 0.4, PAD_L + 48 + bpW, bpY - bpFont * 0.4, { stroke: TEXT_MUTED, strokeW: 1.5, opacity: 0.7 })
    }

    const priceY = priceBlockY + (heroBasePrice ? 42 : 0) + priceFont + 8
    body += svgText(heroPrice, PAD_L + 48, priceY, priceFont, { weight: 900, fill: ORANGE })

    if (heroParcel) {
      body += svgText(heroParcel, PAD_L + 52, priceY + PARCEL_FONT + 20, PARCEL_FONT + 4, { fill: TEXT_SECONDARY, weight: 700 })
    }
    if (story.discountPercent != null && story.discountPercent > 0) {
      const discText = `${formatVisualDiscount(story.discountPercent)} off`
      const discY = priceY + PARCEL_FONT + 20 + (heroParcel ? PARCEL_FONT + 8 : 0) + DISCOUNT_FONT + 8
      body += svgText(discText, PAD_L + 52, discY, DISCOUNT_FONT + 2, { fill: DISCOUNT_COLOR, weight: 700 })
    }
  }

  body += drawCtaButton(ctaMain ?? footerCtaMain ?? "Me chama e eu separo.", PAD_L, ctaY, CONTENT_W)

  return body
}

// ─── Template: Oferta Relâmpago ───────────────────────────────────────────────
// Urgency-first layout. Red urgency band, warm-dark background, red card borders.

function renderOfertaRelampago(story: StoryData): string {
  const { headline, sub, urgencyLine, benefits = [], footerCtaMain, vitrineProducts = [] } = story

  let body = ""

  // NOBRETECH header with "RELÂMPAGO" badge in red
  const logoY = PAD_T + 40
  body += svgText("NOBRETECH", PAD_L, logoY, LOGO_FONT, { weight: 800, letterSpacing: "4" })

  const badgeText = "RELÂMPAGO"
  const badgeW = Math.max(160, estimateTextWidth(badgeText, BADGE_FONT, 0.6) + 48)
  const badgeTX = W - PAD_R - badgeW
  const badgeTextX = badgeTX + badgeW / 2
  const badgeTextY = PAD_T + 2 + BADGE_H / 2 + BADGE_FONT * 0.38
  body += svgRect(badgeTX, PAD_T + 2, badgeW, BADGE_H, { fill: "#171717", stroke: RELAMPAGO_RED, strokeW: 1.5, rx: BADGE_H / 2 })
  body += svgText(badgeText, badgeTextX, badgeTextY, BADGE_FONT, { weight: 800, fill: RELAMPAGO_ACCENT, anchor: "middle", letterSpacing: "1" })
  body += svgLine(PAD_L, PAD_T + DIVIDER_Y_FROM_TOP, W - PAD_R, PAD_T + DIVIDER_Y_FROM_TOP, { stroke: "#241512", strokeW: 1 })

  // Urgency band
  const bandTop = PAD_T + DIVIDER_Y_FROM_TOP + 22
  const bandH = 56
  body += svgRect(0, bandTop, W, bandH, { fill: RELAMPAGO_BAND_BG })
  const bandTextY = bandTop + bandH / 2 + 14
  body += svgText("OFERTA RELÂMPAGO", W / 2, bandTextY, 24, { weight: 900, fill: RELAMPAGO_ACCENT, anchor: "middle", letterSpacing: "3" })

  const headlineTop = bandTop + bandH + 20

  // Headline
  const headLines = wrapText(headline || "Condição rápida de hoje", CONTENT_W, 72, 2)
  let y = headlineTop + 72
  for (const line of headLines) {
    body += svgText(line, PAD_L, y, 72, { weight: 900 })
    y += 78
  }
  y -= 6
  if (sub) {
    y += 16
    body += svgText(sub, PAD_L, y + SUB_FONT, SUB_FONT, { fill: TEXT_SECONDARY, weight: 600 })
    y = y + SUB_FONT + 8
  }
  const cardsTop = y + 30
  const heroItem = vitrineProducts[0]
  let cy = cardsTop

  if (heroItem) {
    const heroH = vitrineProducts.length > 1 ? 470 : 610
    body += svgRect(PAD_L, cy, CARD_W, heroH, { fill: RELAMPAGO_CARD_BG, stroke: RELAMPAGO_CARD_BORDER, strokeW: 1.5, rx: CARD_CORNER })
    body += svgRect(PAD_L, cy, CARD_W, 8, { fill: RELAMPAGO_RED, rx: 4 })
    body += svgText("CONDIÇÃO RÁPIDA", PAD_L + 42, cy + 60, 20, { weight: 900, fill: RELAMPAGO_ACCENT, letterSpacing: "1.4" })

    const contentX = PAD_L + 42
    const nameLines2 = wrapText(heroItem.name, 500, 54, 2)
    let ly = cy + 96
    for (const line of nameLines2) {
      body += svgText(line, contentX, ly + 54, 54, { weight: 900 })
      ly += 62
    }
    const feature = primaryCellFeature(heroItem)
    if (feature) {
      body += drawFeaturePill(compactFeatureLabel(feature), contentX, ly + 12, 360)
    }

    if (heroItem.price) {
      const priceX = PAD_L + CARD_W - 44
      let py = cy + 126
      if (heroItem.basePrice) {
        body += svgText(heroItem.basePrice, priceX, py, PRICE_STRUCK_FONT, { fill: TEXT_MUTED, anchor: "end" })
        const approxW = estimateTextWidth(heroItem.basePrice, PRICE_STRUCK_FONT, 0.53)
        body += svgLine(priceX - approxW, py - PRICE_STRUCK_FONT * 0.4, priceX, py - PRICE_STRUCK_FONT * 0.4, { stroke: TEXT_MUTED, strokeW: 1.5, opacity: 0.7 })
        py += 34
      }
      const priceFont = fitPriceFontSize(heroItem.price, 330, 82)
      body += svgText(heroItem.price, priceX, py + priceFont, priceFont, { weight: 900, fill: RELAMPAGO_ACCENT, anchor: "end" })
      if (heroItem.parcel) {
        body += svgText(heroItem.parcel, priceX, py + priceFont + PARCEL_FONT + 14, PARCEL_FONT, { fill: TEXT_SECONDARY, anchor: "end", weight: 700 })
      }
    }
    cy += heroH
  }

  const secondary = vitrineProducts.slice(1, 3)
  for (const item of secondary) {
    cy += 18
    const rowH = 150
    body += svgRect(PAD_L, cy, CARD_W, rowH, { fill: "#101010", stroke: "#211815", strokeW: 1.2, rx: 24 })
    const nameLines2 = wrapText(item.name, 480, 34, 2)
    let ly = cy + 36
    for (const line of nameLines2) {
      body += svgText(line, PAD_L + 34, ly + 34, 34, { weight: 800 })
      ly += 40
    }
    const feature = primaryCellFeature(item)
    if (feature) body += svgText(compactFeatureLabel(feature), PAD_L + 34, cy + rowH - 24, 22, { fill: TEXT_SECONDARY, weight: 600 })
    if (item.price) {
      const priceFont = fitPriceFontSize(item.price, 280, 50)
      body += svgText(item.price, PAD_L + CARD_W - 34, cy + 70, priceFont, { weight: 900, fill: RELAMPAGO_ACCENT, anchor: "end" })
      if (item.parcel) {
        body += svgText(item.parcel, PAD_L + CARD_W - 34, cy + 104, 20, { fill: TEXT_SECONDARY, anchor: "end", weight: 600 })
      }
    }
    cy += rowH
  }

  // Urgency line
  if (urgencyLine) {
    cy += 24
    body += svgText(urgencyLine, PAD_L, cy + META_FONT, META_FONT, { fill: RELAMPAGO_ACCENT, weight: 700 })
    cy += META_FONT + 8
  }

  // Benefits + CTA
  const ctaText = footerCtaMain ?? "Me chama agora!"
  const ctaY = H - PAD_B - CTA_H
  if (benefits.length > 0) {
    const benefitLines = benefits.slice(0, 2)
    const benefitsH = benefitLines.length * BENEFIT_LINE_H
    const bY = ctaY - benefitsH - 34
    let bby = bY
    for (const line of benefitLines) {
      body += svgCircle(PAD_L + BENEFIT_DOT, bby + BENEFIT_FONT * 0.65, BENEFIT_DOT, RELAMPAGO_RED)
      body += svgText(line, PAD_L + BENEFIT_DOT * 2 + 10, bby + BENEFIT_FONT, BENEFIT_FONT, { fill: TEXT_SECONDARY })
      bby += BENEFIT_LINE_H
    }
  }

  // Red CTA button
  const ctaTextY = ctaY + CTA_H / 2 + CTA_FONT * 0.38
  body += svgRect(PAD_L, ctaY, CONTENT_W, CTA_H, { fill: RELAMPAGO_RED, rx: CTA_CORNER })
  body += svgText(ctaText, PAD_L + CONTENT_W / 2, ctaTextY, CTA_FONT, { weight: 900, anchor: "middle" })

  return body
}

// ─── Template: Premium ────────────────────────────────────────────────────────
// Spacious, elegant. Warm cream product names, subtle borders, refined feel.

function renderPremium(story: StoryData): string {
  const { badge, headline, sub, urgencyLine, benefits = [], footerCtaMain, vitrineProducts = [] } = story

  let body = ""

  // Header — slim, no divider line color flash
  const logoY = PAD_T + 40
  body += svgText("NOBRETECH", PAD_L, logoY, LOGO_FONT + 2, { weight: 900, letterSpacing: "5" })

  if (badge) {
    const badgeText = badge.toUpperCase()
    const badgeW = Math.max(132, estimateTextWidth(badgeText, BADGE_FONT, 0.6) + 44)
    const badgeTX = W - PAD_R - badgeW
    const badgeTextX = badgeTX + badgeW / 2
    const badgeTextY = PAD_T + 2 + BADGE_H / 2 + BADGE_FONT * 0.38
    body += svgRect(badgeTX, PAD_T + 2, badgeW, BADGE_H, { fill: "#1a1a1a", stroke: PREMIUM_ACCENT, strokeW: 1.5, rx: BADGE_H / 2 })
    body += svgText(badgeText, badgeTextX, badgeTextY, BADGE_FONT, { weight: 700, fill: PREMIUM_ACCENT, anchor: "middle", letterSpacing: "1" })
  }

  body += svgLine(PAD_L, PAD_T + DIVIDER_Y_FROM_TOP, W - PAD_R, PAD_T + DIVIDER_Y_FROM_TOP, { stroke: "#1c1c1c", strokeW: 1 })

  const headlineTop = PAD_T + DIVIDER_Y_FROM_TOP + 22

  // Headline — slightly lighter weight for premium feel
  const headLines = wrapText(headline, CONTENT_W, HEADLINE_FONT, 2)
  let y = headlineTop + HEADLINE_FONT
  for (const line of headLines) {
    body += svgText(line, PAD_L, y, HEADLINE_FONT, { weight: 800 })
    y += HEADLINE_LINE_H
  }
  y -= HEADLINE_LINE_H - HEADLINE_FONT
  if (sub) {
    y += SUB_GAP + 8
    body += svgText(sub, PAD_L, y + SUB_FONT, SUB_FONT, { fill: PREMIUM_TEXT_SEC })
    y = y + SUB_FONT + 8
  }
  const cardsTop = y + 40  // extra breathing room

  // Cards — same layout, refined borders & cream names
  let cy = cardsTop
  const productCount = vitrineProducts.length
  for (let i = 0; i < vitrineProducts.length; i++) {
    const item = vitrineProducts[i]
    if (i > 0) cy += CARD_GAP + 8  // more gap

    const layout = calcCardLayout(item, { productCount })
    const { height } = layout

    body += svgRect(PAD_L, cy, CARD_W, height, { fill: PREMIUM_CARD_BG, stroke: PREMIUM_CARD_BORDER, strokeW: 1, rx: CARD_CORNER + 4 })

    const innerTop = cy + CARD_PAD_V + 8
    const contentX = PAD_L + CARD_PAD_H + 4
    const innerH = height - CARD_PAD_V * 2

    let lY = innerTop + Math.max(0, Math.round((innerH - layout.leftBlockH) / 2))
    for (const line of layout.nameLines) {
      body += svgText(line, contentX, lY + NAME_FONT, NAME_FONT, { weight: 800, fill: PREMIUM_NAME_COLOR })
      lY += NAME_LINE_H
    }
    if (layout.hasSubtitle) {
      lY += SUBTITLE_GAP
      body += svgText(item.subtitle ?? "", contentX, lY + SUBTITLE_FONT, SUBTITLE_FONT, { fill: PREMIUM_TEXT_SEC, weight: 500 })
      lY += SUBTITLE_FONT + 4
    }
    if (layout.hasPills) {
      lY += PILL_GAP_TOP
      let pillX = contentX
      for (const tag of layout.pillsToShow) {
        const label = tag.shortLabel ?? tag.label
        const { svg: pillSvg, width: pw } = drawPill(pillX, lY, label, tag.type)
        body += pillSvg
        pillX += pw + PILL_BETWEEN
      }
    }

    if (layout.showPrice && item.price) {
      const rightX = contentX + LEFT_COL_W + COL_GAP + RIGHT_COL_W - 4
      let rY = innerTop + Math.max(0, Math.round((innerH - layout.rightBlockH) / 2))
      if (layout.hasBasePrice && item.basePrice) {
        body += svgText(item.basePrice, rightX, rY + PRICE_STRUCK_FONT, PRICE_STRUCK_FONT, { fill: TEXT_MUTED, anchor: "end" })
        const approxW = estimateTextWidth(item.basePrice, PRICE_STRUCK_FONT, 0.53)
        const lineY = rY + PRICE_STRUCK_FONT * 0.6
        body += svgLine(rightX - approxW, lineY, rightX, lineY, { stroke: TEXT_MUTED, strokeW: 1.5, opacity: 0.7 })
        rY += PRICE_STRUCK_FONT + 6
      }
      body += svgText(item.price, rightX, rY + layout.priceFont, layout.priceFont, { weight: 900, fill: PREMIUM_ACCENT, anchor: "end" })
      rY += layout.priceFont + 12
      if (layout.hasParcel && item.parcel) {
        body += svgText(item.parcel, rightX, rY + PARCEL_FONT, PARCEL_FONT, { fill: PREMIUM_TEXT_SEC, anchor: "end", weight: 500 })
      }
    }

    cy += height
  }

  if (urgencyLine) {
    cy += 28
    body += svgText(urgencyLine, PAD_L, cy + META_FONT, META_FONT, { fill: PREMIUM_ACCENT, weight: 600 })
    cy += META_FONT + 8
  }

  const ctaText = footerCtaMain ?? "Me chama para reservar"
  const ctaY = H - PAD_B - CTA_H

  if (benefits.length > 0) {
    const benefitLines = benefits.slice(0, 3)
    const bY = ctaY - benefitLines.length * BENEFIT_LINE_H - 34
    let bby = bY
    for (const line of benefitLines) {
      body += svgCircle(PAD_L + BENEFIT_DOT, bby + BENEFIT_FONT * 0.65, BENEFIT_DOT, PREMIUM_ACCENT)
      body += svgText(line, PAD_L + BENEFIT_DOT * 2 + 10, bby + BENEFIT_FONT, BENEFIT_FONT, { fill: PREMIUM_TEXT_SEC })
      bby += BENEFIT_LINE_H
    }
  }

  // Premium CTA — outlined + filled
  body += svgRect(PAD_L, ctaY, CONTENT_W, CTA_H, { fill: "#0d0d0d", stroke: PREMIUM_ACCENT, strokeW: 2, rx: CTA_CORNER })
  const ctaTextY = ctaY + CTA_H / 2 + CTA_FONT * 0.38
  body += svgText(ctaText, PAD_L + CONTENT_W / 2, ctaTextY, CTA_FONT, { weight: 900, fill: PREMIUM_ACCENT, anchor: "middle" })

  return body
}

// ─── Template: Mosaico 2×2 ────────────────────────────────────────────────────
// Grid of up to 4 products. Each cell shows name + price. Good for variety.

function renderMosaico(story: StoryData): string {
  const { badge, headline, sub, footerCtaMain, vitrineProducts = [] } = story

  let body = ""
  const { svg: headerSvg, bottomY: headlineTop } = drawHeader(badge, PAD_T)
  body += headerSvg

  // Compact headline
  const HL_FONT_SMALL = 58
  const products = vitrineProducts.slice(0, 4)
  const mosaicHeadline =
    products.length >= 3
      ? `${products.length} opções disponíveis`
      : headline || "Escolha seu modelo"
  const mosaicSub =
    products.length >= 3
      ? "Escolha seu modelo e chama para confirmar."
      : sub
  const headLines = wrapText(mosaicHeadline, CONTENT_W, HL_FONT_SMALL, 2)
  let y = headlineTop + HL_FONT_SMALL
  for (const line of headLines) {
    body += svgText(line, PAD_L, y, HL_FONT_SMALL, { weight: 900 })
    y += HL_FONT_SMALL + 10
  }
  if (mosaicSub) {
    body += svgText(mosaicSub, PAD_L, y + SUB_FONT - 4, SUB_FONT - 4, { fill: TEXT_SECONDARY })
    y += SUB_FONT + 16
  }
  const gridTop = y + 28

  // Grid geometry
  const CELL_GAP = MOSAICO_CELL_GAP
  const CELL_W = Math.floor((CONTENT_W - CELL_GAP) / 2)
  const ctaY = H - PAD_B - CTA_H
  const GRID_H = ctaY - gridTop - 48  // available height for grid

  const cellForIndex = (index: number): { x: number; y: number; w: number; h: number } => {
    if (products.length === 3 && index === 2) {
      return { x: PAD_L, y: gridTop + Math.floor(GRID_H * 0.52), w: CONTENT_W, h: Math.floor(GRID_H * 0.48) }
    }
    const topCellH = products.length === 3 ? Math.floor(GRID_H * 0.48) : Math.floor((GRID_H - CELL_GAP) / 2)
    const col = index % 2
    const row = Math.floor(index / 2)
    return {
      x: PAD_L + col * (CELL_W + CELL_GAP),
      y: gridTop + row * (topCellH + CELL_GAP),
      w: CELL_W,
      h: topCellH,
    }
  }

  for (let i = 0; i < products.length; i++) {
    const item = products[i]
    const cell = cellForIndex(i)

    // Card bg
    const hasBorder = item.isFeatured || item.isPrimary || item.hasDiscount
    body += svgRect(cell.x, cell.y, cell.w, cell.h, {
      fill: i === 2 && products.length === 3 ? "#131313" : CARD_BG,
      stroke: hasBorder ? ORANGE : "#252525",
      strokeW: hasBorder ? 2 : 1.5,
      rx: MOSAICO_CELL_CORNER,
    })

    const wide = cell.w > CELL_W
    const NAME_F = wide ? 42 : 34
    const NAME_LH2 = wide ? 52 : 42
	    const FEATURE_F = wide ? 24 : 22
	    const PRICE_F = Math.min(wide ? 78 : 62, Math.max(36, fitPriceFontSize(item.price, cell.w - 48, wide ? 78 : 62)))

	    const shortName = buildMosaicShortName(item.name)
	    const nameLines2 = wrapText(shortName, cell.w - 44, NAME_F, 2)
	    const condition = publicConditionLabel(item)
	    const secondaryFeature = mosaicSecondaryFeature(item)
	    const hasOffer = Boolean(item.basePrice && item.price)
	    const hasSecondaryFeature = Boolean(secondaryFeature)
	    const hasPrice = Boolean(item.price)
	    const basePriceText = item.basePrice ? `De ${item.basePrice}` : null

	    const contentH =
	      22 +
	      (hasOffer ? 38 : 0) +
	      nameLines2.length * NAME_LH2 +
	      (condition ? 34 : 0) +
	      (basePriceText ? PRICE_STRUCK_FONT + 8 : 0) +
	      (hasPrice ? PRICE_F + 24 : 0) +
	      (hasSecondaryFeature ? 46 : 0)

    const startY = cell.y + Math.max(26, Math.round((cell.h - contentH) / 2))
    let ty = startY

	    if (hasOffer) {
	      const offerW = 112
	      body += svgRect(cell.x + 22, ty, offerW, 32, { fill: ORANGE, rx: 16 })
	      body += svgText("OFERTA", cell.x + 22 + offerW / 2, ty + 22, 17, { weight: 900, anchor: "middle", letterSpacing: "1.2" })
	      ty += 42
	    } else {
	      body += svgText(`MODELO ${i + 1}`, cell.x + 22, ty + 18, 17, { weight: 800, fill: TEXT_MUTED, letterSpacing: "1.4" })
	      ty += 34
	    }

	    for (const line of nameLines2) {
	      body += svgText(line, cell.x + 22, ty + NAME_F, NAME_F, { weight: 800 })
	      ty += NAME_LH2
	    }

	    if (condition) {
	      body += svgText(condition, cell.x + 22, ty + 26, 24, { weight: 800, fill: condition === "Lacrado" ? "#5aab3a" : TEXT_SECONDARY })
	      ty += 36
	    }

	    if (basePriceText) {
	      ty += wide ? 6 : 2
	      body += svgText(basePriceText, cell.x + 22, ty + PRICE_STRUCK_FONT, PRICE_STRUCK_FONT, { fill: TEXT_MUTED })
	      const approxW = estimateTextWidth(basePriceText, PRICE_STRUCK_FONT, 0.53)
	      const lineY = ty + PRICE_STRUCK_FONT * 0.6
	      body += svgLine(cell.x + 22, lineY, cell.x + 22 + approxW, lineY, { stroke: TEXT_MUTED, strokeW: 1.5, opacity: 0.75 })
	      ty += PRICE_STRUCK_FONT + 6
	    }

	    if (hasPrice && item.price) {
	      ty += wide ? 8 : 4
	      body += svgText(item.price, cell.x + 22, ty + PRICE_F, PRICE_F, { weight: 900, fill: ORANGE })
	      ty += PRICE_F + 18
	    }

	    if (hasSecondaryFeature && secondaryFeature) {
	      const featureText = compactFeatureLabel(secondaryFeature)
	      const pillW = Math.min(cell.w - 44, Math.max(142, estimateTextWidth(featureText, FEATURE_F, 0.54) + 38))
	      body += svgRect(cell.x + 22, ty, pillW, 44, { fill: "#181818", stroke: "#2b2b2b", strokeW: 1, rx: 22 })
	      body += svgText(featureText, cell.x + 22 + pillW / 2, ty + 28, FEATURE_F, { fill: TEXT_SECONDARY, weight: 700, anchor: "middle" })
    }
  }

  body += drawCtaButton(footerCtaMain ?? "Me chama para reservar", PAD_L, ctaY, CONTENT_W)

  return body
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderStoryToSVG(story: StoryData): string {
  const variant = story.variant ?? "classic"
  const canUseVitrineVariant = story.kind === "vitrine" && Boolean(story.vitrineProducts?.length)
  const safeVariant =
    variant === "mosaico" && (!canUseVitrineVariant || (story.vitrineProducts?.length ?? 0) < 3)
      ? "premium"
      : variant
  const useVariant = canUseVitrineVariant || safeVariant === "destaque"

  // Variant-specific backgrounds
  let bgColor = DARK_BG
  if (useVariant && safeVariant === "relampago") bgColor = RELAMPAGO_BG
  else if (useVariant && safeVariant === "premium") bgColor = PREMIUM_BG

  const bg = svgRect(0, 0, W, H, { fill: bgColor })

  let body: string

  if (useVariant && safeVariant === "destaque") {
    body = renderDestaquePesado(story)
  } else if (useVariant && safeVariant === "relampago") {
    body = renderOfertaRelampago(story)
  } else if (useVariant && safeVariant === "premium") {
    body = renderPremium(story)
  } else if (useVariant && safeVariant === "mosaico") {
    body = renderMosaico(story)
  } else if (story.kind === "vitrine") {
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
