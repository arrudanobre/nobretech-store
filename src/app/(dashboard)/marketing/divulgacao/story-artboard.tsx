"use client"

/**
 * NobretechStoryArtboard — single source of truth for story visual rendering.
 *
 * Architecture (mirrors nobretech_story_generator_v2_3.html):
 *   outer wrapper  → width = 1080 * scale, height = 1920 * scale, overflow hidden
 *   inner artboard → always 1080 × 1920 px, display flex-column, transform: scale(scale)
 *
 * Preview thumbnail, modal preview and PNG export all use this SAME inner node.
 * For export: clone the inner node, set transform:none, capture at 1080×1920.
 *
 * Rules enforced here:
 *   - No responsive CSS inside the artboard (no vw/vh/clamp/auto widths)
 *   - Price never overflows (font scaled by string length vs column width)
 *   - Pills never wrap internally (whiteSpace:nowrap), pre-filtered to fit row
 *   - Warranty / kit always inside left zone as dedicated lines
 *   - Closing multi-product: price zone hidden (data is null from copy-generator)
 */

import type { DensityMode, StoryData, StoryTag, VitrineItem } from "@/lib/marketing/copy-generator"

// ─── Canvas constants (never change — same as HTML reference) ────────────────
const W = 1080
const H = 1920
const PAD_X = 56       // horizontal padding (both sides)
const PAD_TOP = 64     // top padding
const PAD_BOT = 72     // bottom padding
const ORANGE = "#D85A30"
const DARK_BG = "#0d0d0d"

// Inner content width after horizontal padding
const CONTENT_W = W - PAD_X * 2  // 968 px

// Price column: fixed right zone (~31% of content width)
const PRICE_COL_W = 300
const PRICE_GAP = 28   // gap between name column and price column

// Approximate char width ratio for bold Montserrat digits/prices
const PRICE_CHAR_RATIO = 0.56

// ─── Tag colour map ───────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
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
function tagColor(type: string) {
  return TAG_COLORS[type] ?? { bg: "#222", fg: "#aaa" }
}

// ─── Density sizing table ─────────────────────────────────────────────────────
type Sz = {
  headlineFont: number
  subFont: number
  nameFont: number
  subtitleFont: number
  pillFont: number
  pillH: number
  priceBase: number
  basePriceFont: number
  parcelFont: number
  metaFont: number
  badgeFont: number
  cardPadV: number
  cardPadH: number
  cardGap: number
  benefitFont: number
}

const SIZING: Record<DensityMode, Sz> = {
  detailed: {
    headlineFont: 76, subFont: 32,
    nameFont: 44, subtitleFont: 28, pillFont: 23, pillH: 46,
    priceBase: 68, basePriceFont: 26, parcelFont: 27, metaFont: 27,
    badgeFont: 21, cardPadV: 36, cardPadH: 36, cardGap: 22, benefitFont: 29,
  },
  standard: {
    headlineFont: 68, subFont: 29,
    nameFont: 38, subtitleFont: 24, pillFont: 20, pillH: 40,
    priceBase: 56, basePriceFont: 22, parcelFont: 24, metaFont: 24,
    badgeFont: 19, cardPadV: 30, cardPadH: 32, cardGap: 18, benefitFont: 27,
  },
  compact: {
    headlineFont: 60, subFont: 26,
    nameFont: 31, subtitleFont: 20, pillFont: 17, pillH: 34,
    priceBase: 42, basePriceFont: 18, parcelFont: 20, metaFont: 20,
    badgeFont: 16, cardPadV: 24, cardPadH: 26, cardGap: 14, benefitFont: 25,
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fitPriceFont(price: string | null, colWidth: number, base: number): number {
  if (!price) return base
  const maxByWidth = Math.floor(colWidth / (price.length * PRICE_CHAR_RATIO))
  return Math.max(28, Math.min(base, maxByWidth))
}

/** Pre-filter pills that fit in the left zone without clipping. */
function fitPills(
  tags: StoryTag[],
  maxCount: number,
  availableWidth: number,
  pillFont: number,
): StoryTag[] {
  const result: StoryTag[] = []
  let used = 0
  const GAP = 8
  for (const tag of tags.filter((t) => t.type !== "installment").slice(0, maxCount)) {
    const label = tag.shortLabel ?? tag.label
    const w = Math.max(56, Math.round(label.length * pillFont * 0.58 + 28))
    if (result.length > 0) used += GAP
    if (used + w > availableWidth + 16) break // +16: allow slight overshoot, clipped by flex
    result.push(tag)
    used += w
  }
  return result
}

// ─── Micro-components ─────────────────────────────────────────────────────────
function StruckPrice({ value, fontSize }: { value: string; fontSize: number }) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        color: "#777",
        fontSize,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}
    >
      {value}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "52%",
          height: 2,
          background: "#777",
          opacity: 0.7,
        }}
      />
    </span>
  )
}

function ArtboardBadge({
  label,
  bg,
  textColor = "#fff",
  fontSize = 20,
}: {
  label: string
  bg: string
  textColor?: string
  fontSize?: number
}) {
  return (
    <span
      style={{
        background: bg,
        color: textColor,
        fontSize,
        fontWeight: 800,
        padding: "4px 14px",
        borderRadius: 999,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  )
}

// ─── Story header (shared) ────────────────────────────────────────────────────
function ArtboardHeader({ badge }: { badge: string }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "0.14em",
          }}
        >
          NOBRETECH
        </span>
        {badge && (
          <span
            style={{
              background: ORANGE,
              color: "#fff",
              fontSize: 22,
              fontWeight: 800,
              lineHeight: "50px",
              height: 50,
              padding: "0 24px",
              borderRadius: 999,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ height: 1, background: "#222", marginBottom: 28 }} />
    </>
  )
}

// ─── Product card ─────────────────────────────────────────────────────────────
function ProductCard({
  item,
  sz,
}: {
  item: VitrineItem
  sz: Sz
}) {
  const hasOffer = item.hasDiscount
  const cardBg = hasOffer ? "#21140f" : item.isPrimary ? "#191614" : "#151515"
  const borderWidth = hasOffer ? 2.5 : 1.5
  const borderColor = hasOffer ? ORANGE : item.isPrimary ? "#7a4a34" : "#2a2a2a"

  // Available width for the name/left zone (card inner - price col - gap - pad×2)
  const leftZoneW = CONTENT_W - sz.cardPadH * 2 - PRICE_COL_W - PRICE_GAP

  // Pre-filter pills to fit left zone
  const maxPills = item.cardType === "rich" ? 4 : item.cardType === "normal" ? 3 : 2
  const pills = fitPills(item.tags, maxPills, leftZoneW, sz.pillFont)

  const hasBadge = hasOffer || item.isPrimary || item.isFeatured
  const showPrice = Boolean(item.price)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        gap: PRICE_GAP,
        padding: `${sz.cardPadV}px ${sz.cardPadH}px`,
        background: cardBg,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: 26,
        boxSizing: "border-box",
      }}
    >
      {/* Left zone — name / subtitle / pills / warranty / kit */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {hasBadge && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "nowrap" }}>
            {hasOffer && <ArtboardBadge label="Oferta" bg={ORANGE} fontSize={sz.badgeFont} />}
            {(item.isPrimary || item.isFeatured) && (
              <ArtboardBadge
                label="Destaque"
                bg="rgba(255,255,255,0.08)"
                textColor="#f7d9c9"
                fontSize={sz.badgeFont}
              />
            )}
          </div>
        )}

        <div
          style={{
            fontSize: sz.nameFont,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {item.name}
        </div>

        {item.subtitle && (
          <div
            style={{
              fontSize: sz.subtitleFont,
              color: "#9a9a9a",
              fontWeight: 600,
              marginTop: 8,
              lineHeight: 1.25,
            }}
          >
            {item.subtitle}
          </div>
        )}

        {pills.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "nowrap",
              gap: 8,
              marginTop: 12,
              overflow: "hidden",
            }}
          >
            {pills.map((pill, i) => {
              const tc = tagColor(pill.type)
              return (
                <span
                  key={i}
                  style={{
                    background: tc.bg,
                    color: tc.fg,
                    fontSize: sz.pillFont,
                    fontWeight: 700,
                    height: sz.pillH,
                    lineHeight: `${sz.pillH}px`,
                    padding: "0 14px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                >
                  {pill.shortLabel ?? pill.label}
                </span>
              )
            })}
          </div>
        )}

        {item.warrantyLine && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: Math.round(sz.metaFont * 0.96),
              fontWeight: 700,
              color: "#4ac4b0",
            }}
          >
            <span aria-hidden>🛡️</span>
            <span>{item.warrantyLine}</span>
          </div>
        )}

        {item.kitLine && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
              fontSize: Math.round(sz.metaFont * 0.96),
              fontWeight: 700,
              color: "#e0a45a",
            }}
          >
            <span aria-hidden>🎁</span>
            <span>{item.kitLine}</span>
          </div>
        )}
      </div>

      {/* Right zone — price block (hidden when price is null, e.g. multi-product CTA) */}
      {showPrice && (
        <div
          style={{
            width: PRICE_COL_W,
            flexShrink: 0,
            textAlign: "right",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          {item.basePrice && (
            <div style={{ marginBottom: 4 }}>
              <StruckPrice
                value={item.basePrice}
                fontSize={sz.basePriceFont}
              />
            </div>
          )}

          <div
            style={{
              fontSize: fitPriceFont(item.price, PRICE_COL_W, sz.priceBase),
              fontWeight: 900,
              color: ORANGE,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {item.price}
          </div>

          {item.parcel && (
            <div
              style={{
                fontSize: sz.parcelFont,
                color: "#e0b29c",
                fontWeight: 700,
                marginTop: 8,
                whiteSpace: "nowrap",
              }}
            >
              {item.parcel}
            </div>
          )}

          {item.discountPercent != null && (
            <div
              style={{
                fontSize: sz.basePriceFont,
                color: "#5aab3a",
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              -{item.discountPercent}%
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CTA button (bottom of story) ─────────────────────────────────────────────
function CtaButton({
  main,
  sub,
}: {
  main: string
  sub?: string | null
}) {
  return (
    <div
      style={{
        background: ORANGE,
        borderRadius: 24,
        padding: sub ? "32px 40px" : "40px 40px",
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: 48,
          fontWeight: 900,
          lineHeight: 1.1,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {main}
      </div>
      {sub && (
        <div
          style={{
            color: "rgba(255,255,255,0.88)",
            fontSize: 27,
            fontWeight: 700,
            marginTop: 10,
            lineHeight: 1.3,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Vitrine story content ────────────────────────────────────────────────────
function VitrineContent({ story }: { story: StoryData }) {
  const density: DensityMode = story.density ?? "standard"
  const sz = SIZING[density]
  const products = story.vitrineProducts ?? []
  const headlineLines = story.headline.split("\n")

  return (
    <>
      {/* Headline */}
      <div
        style={{
          fontSize: sz.headlineFont,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.1,
          marginBottom: 10,
        }}
      >
        {headlineLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Subtitle */}
      {story.sub && (
        <div
          style={{
            fontSize: sz.subFont,
            color: "#9a9a9a",
            fontWeight: 600,
            marginBottom: 28,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
          }}
        >
          {story.sub}
        </div>
      )}

      {/* Product cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: sz.cardGap,
        }}
      >
        {products.map((item) => (
          <ProductCard key={item.productId} item={item} sz={sz} />
        ))}
      </div>

      {/* Urgency line */}
      {story.urgencyLine && (
        <div
          style={{
            fontSize: 28,
            fontWeight: 850,
            color: ORANGE,
            marginTop: 18,
            lineHeight: 1.25,
          }}
        >
          {story.urgencyLine}
        </div>
      )}

      {/* Spacer pushes benefits + CTA to bottom */}
      <div style={{ flex: 1 }} />

      {/* Benefits bullets */}
      {story.benefits && story.benefits.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {story.benefits.slice(0, 3).map((benefit, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: 14 }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: ORANGE,
                  flexShrink: 0,
                  marginTop: Math.round(sz.benefitFont * 0.26),
                }}
              />
              <span
                style={{
                  fontSize: sz.benefitFont,
                  fontWeight: 700,
                  color: "#cfcfcf",
                  lineHeight: 1.35,
                }}
              >
                {benefit}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer CTA button */}
      {story.footerCtaMain && (
        <CtaButton main={story.footerCtaMain} sub={story.footerCtaSub} />
      )}
    </>
  )
}

// ─── Highlight story content ──────────────────────────────────────────────────
function HighlightContent({ story }: { story: StoryData }) {
  const sz = SIZING["detailed"]
  const headlineLines = story.headline.split("\n")
  const isFontSmall = headlineLines.length > 1

  // Build a VitrineItem for the highlighted product card
  const cardItem: VitrineItem = {
    productId: story.productName,
    name: story.productName,
    subtitle: "",
    warrantyLine: null,
    kitLine: null,
    price: story.price,
    basePrice: story.basePrice,
    discountPercent: null,
    parcel: story.parcel,
    tags: story.tags.slice(0, 4),
    warrantyLabel: null,
    gifts: null,
    color: null,
    hasDiscount: Boolean(story.basePrice),
    isFeatured: false,
    grade: null,
    storage: null,
    quantity: 1,
    isPrimary: true,
    cardType: "rich",
  }

  return (
    <>
      {/* Headline */}
      <div
        style={{
          fontSize: isFontSmall ? 70 : 76,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.08,
          marginBottom: 10,
        }}
      >
        {headlineLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Subtitle */}
      {story.sub && (
        <div
          style={{
            fontSize: 31,
            color: "#888",
            fontWeight: 700,
            marginBottom: 24,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
          }}
        >
          {story.sub}
        </div>
      )}

      {/* Product card */}
      <ProductCard item={cardItem} sz={sz} />

      {/* Argument bullets — below the card */}
      {story.detailLines.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 28,
          }}
        >
          {story.detailLines.slice(0, 5).map((line, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: 14 }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: ORANGE,
                  flexShrink: 0,
                  marginTop: 8,
                }}
              />
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#c0b8e8",
                  lineHeight: 1.35,
                }}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Urgency line */}
      {story.urgencyLine && (
        <div
          style={{
            fontSize: 28,
            fontWeight: 850,
            color: ORANGE,
            marginTop: 20,
            lineHeight: 1.25,
          }}
        >
          {story.urgencyLine}
        </div>
      )}
    </>
  )
}

// ─── CTA / Closing story content ──────────────────────────────────────────────
function CtaContent({ story }: { story: StoryData }) {
  const mainLines = (story.ctaMain || story.headline).split("\n")
  const detailLines = story.detailLines.slice(0, 3)

  return (
    <>
      {/* Spacer above to vertically centre the main text */}
      <div style={{ flex: 1 }} />

      {/* Main headline */}
      <div
        style={{
          fontSize: 78,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.1,
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        {mainLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Detail lines */}
      {detailLines.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 36,
          }}
        >
          {detailLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#555",
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Spacer before CTA block */}
      <div style={{ flex: 1 }} />

      {/* CTA block */}
      <div
        style={{
          background: ORANGE,
          borderRadius: 24,
          padding: story.ctaSub ? "36px 44px" : "44px 44px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: 52,
            fontWeight: 900,
            lineHeight: 1.1,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {story.sub}
        </div>
        {story.ctaSub && (
          <div
            style={{
              color: "rgba(255,255,255,0.88)",
              fontSize: 28,
              fontWeight: 700,
              marginTop: 10,
              lineHeight: 1.3,
            }}
          >
            {story.ctaSub}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The single story artboard component used everywhere:
 *   - preview thumbnails  (scale ≈ 0.16)
 *   - modal preview       (scale ≈ 0.42)
 *   - PNG export          (scale = 1, transform removed from clone)
 *
 * The exportRef callback receives the inner 1080×1920 div so the export
 * function can clone it, remove the transform, and pass to html2canvas.
 */
export function NobretechStoryArtboard({
  story,
  scale = 1,
  exportRef,
}: {
  story: StoryData
  scale?: number
  exportRef?: (el: HTMLDivElement | null) => void
}) {
  const isVitrine = Boolean(story.vitrineProducts?.length)
  const isCta = story.kind === "cta"

  return (
    <div
      style={{
        width: Math.round(W * scale),
        height: Math.round(H * scale),
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        ref={exportRef}
        data-story-artboard
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          background: DARK_BG,
          overflow: "hidden",
          transformOrigin: "top left",
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          fontFamily: "'Montserrat', 'Inter', sans-serif",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOT}px`,
          boxSizing: "border-box",
          gap: 0,
        }}
      >
        <ArtboardHeader badge={story.badge} />

        {isVitrine ? (
          <VitrineContent story={story} />
        ) : isCta ? (
          <CtaContent story={story} />
        ) : (
          <HighlightContent story={story} />
        )}
      </div>
    </div>
  )
}
