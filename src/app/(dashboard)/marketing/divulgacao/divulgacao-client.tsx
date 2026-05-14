"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Download,
  Layers,
  Loader2,
  Megaphone,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
import { getProductAssetImageInfo } from "@/lib/product-assets"
import { fetchProductImageMap, type ProductImageMap } from "@/lib/product-images"
import {
  generateContent,
  formatBRL,
  parseBRLInput,
  calculateInstallmentDisplay,
  calculateDiscount,
  buildProductFacts,
  OBJECTIVE_LABELS,
  TONE_LABELS,
  type CarouselSlideVisual,
  type ChannelKey,
  type GeneralStrategy,
  type GeneratedContent,
  type MarketingProduct,
  type ObjectiveKey,
  type ProductDraft,
  type CampaignAngleSuggestion,
  type StoryData,
  type StoryTag,
  type ToneKey,
  type UrgencyLevel,
  type VitrineItem,
} from "@/lib/marketing/copy-generator"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type OutputTab = "stories" | "carousel" | "whatsapp" | "instagram" | "quick"
type CopyChannelTab = "whatsapp" | "instagram" | "stories" | "carousel" | "quick"
type CopiedKey = string | null
type CopySource = "deterministic" | "ai"

interface ChannelCopyDraft {
  storyHeadlines: [string, string, string]
  storySubtitles: [string, string, string]
  storyCta: string
  whatsapp: string
  instagram: string
  carouselTitles: string[]
  carouselBodies: string[]
}

function emptyChannelCopyDraft(): ChannelCopyDraft {
  return {
    storyHeadlines: ["", "", ""],
    storySubtitles: ["", "", ""],
    storyCta: "",
    whatsapp: "",
    instagram: "",
    carouselTitles: [],
    carouselBodies: [],
  }
}

function formatBRLInputValue(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return ""
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeBRLInputText(value: string): string {
  const parsed = parseBRLInput(value)
  return parsed == null ? value.replace(/-/g, "") : formatBRLInputValue(parsed)
}

function productAssetFor(product: MarketingProduct, productImages?: ProductImageMap) {
  const uploaded = productImages?.[product.id] ?? null
  return getProductAssetImageInfo({
    brand: product.brand,
    model: product.name,
    color: product.color,
    category: product.category,
    uploadedImageUrl: uploaded?.image_url ?? null,
    uploadedThumbnailUrl: uploaded?.thumbnail_url ?? null,
  })
}

// ─── Story canvas (dark 9:16, no Instagram chrome) ───────────────────────────

const STORY_TAG_STYLES: Record<string, { bg: string; text: string }> = {
  grade: { bg: "#1a2e1a", text: "#5aab3a" },
  battery: { bg: "#1a1f2e", text: "#5a8fd4" },
  stock: { bg: "#2e1a1a", text: "#d45a5a" },
  new: { bg: "#2a1a2e", text: "#b05ad4" },
  warranty_apple: { bg: "#1a2a2a", text: "#4ac4b0" },
  warranty_nobretech: { bg: "#1f1a2e", text: "#8b6fd4" },
  gift: { bg: "#2e241a", text: "#d48a35" },
  installment: { bg: "#1a242e", text: "#55a7d8" },
  color: { bg: "#222", text: "#d8d8d8" },
}

function StoryTagPill({ tag }: { tag: StoryTag }) {
  const s = STORY_TAG_STYLES[tag.type] ?? { bg: "#222", text: "#888" }
  return (
    <span
      style={{
        background: s.bg,
        color: s.text,
        fontSize: 22,
        fontWeight: 600,
        padding: "6px 16px",
        borderRadius: 40,
        display: "inline-block",
        whiteSpace: "nowrap",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {tag.label}
    </span>
  )
}

function VitrineProductRow({ item }: { item: VitrineItem }) {
  const cardBorder = item.hasDiscount ? "#D85A30" : item.isPrimary ? "#7a4a34" : "#2a2a2a"
  const cardBg = item.hasDiscount ? "#1f1510" : item.isPrimary ? "#1a1715" : "#151515"

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "start",
        padding: item.hasDiscount ? "22px 28px" : "18px 24px",
        background: cardBg,
        border: item.hasDiscount ? `3px solid ${cardBorder}` : `1.5px solid ${cardBorder}`,
        borderRadius: 20,
        gap: 18,
        boxShadow: item.hasDiscount ? "0 18px 44px rgba(216,90,48,0.13)" : "none",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          {item.hasDiscount && (
            <span
              style={{
                background: "#D85A30",
                color: "#fff",
                fontSize: 16,
                fontWeight: 800,
                padding: "4px 10px",
                borderRadius: 999,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Oferta
            </span>
          )}
          {item.isPrimary && (
            <span
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "#f7d9c9",
                fontSize: 16,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              Destaque
            </span>
          )}
          {item.isFeatured && !item.hasDiscount && (
            <span
              style={{
                background: "rgba(216,90,48,0.16)",
                color: "#f1a37d",
                fontSize: 16,
                fontWeight: 800,
                padding: "4px 10px",
                borderRadius: 999,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Destaque
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: item.hasDiscount ? 32 : 29,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.12,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.name}
        </div>
        {(item.storage || item.grade) && (
          <div style={{ fontSize: 21, color: "#9a9a9a", marginTop: 8 }}>
            {[item.storage, item.grade].filter(Boolean).join(" · ")}
          </div>
        )}
        {item.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            {item.tags.map((tag, i) => (
              <span
                key={i}
                style={{
                  background: STORY_TAG_STYLES[tag.type]?.bg ?? "#222",
                  color: STORY_TAG_STYLES[tag.type]?.text ?? "#ddd",
                  fontSize: 16,
                  fontWeight: 700,
                  padding: "4px 9px",
                  borderRadius: 999,
                  maxWidth: 260,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {item.basePrice && (
          <div style={{ fontSize: 18, color: "#777" }}>
            <span style={{ textDecoration: "line-through" }}>{item.basePrice}</span>
          </div>
        )}
        {item.price && (
          <div
            style={{
              fontSize: item.hasDiscount ? 44 : 36,
              fontWeight: 800,
              color: "#D85A30",
              whiteSpace: "nowrap",
              lineHeight: 1.02,
            }}
          >
            {item.price}
          </div>
        )}
        {item.parcel && (
          <div style={{ fontSize: 19, color: "#e0b29c", marginTop: 6, fontWeight: 700 }}>
            {item.parcel}
          </div>
        )}
        {item.discountPercent != null && (
          <div style={{ fontSize: 18, color: "#5aab3a", fontWeight: 800, marginTop: 6 }}>
            -{item.discountPercent}%
          </div>
        )}
      </div>
    </div>
  )
}

function StoryCanvas({
  story,
  index,
  exportRef,
}: {
  story: StoryData
  index: number
  exportRef: (el: HTMLDivElement | null) => void
}) {
  const SCALE = 0.2
  const storyLabels = ["Vitrine / Oferta", "Destaques / Ofertas", "CTA / Fechamento"]
  const finalVitrine = index === 2 && story.vitrineProducts && story.vitrineProducts.length > 0

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        Story {index + 1} — {storyLabels[index]}
      </span>

      <div
        style={{
          width: 216,
          height: 384,
          background: "#0d0d0d",
          borderRadius: 16,
          border: "3px solid #1a1a1a",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
          boxShadow: "0 10px 30px -10px rgba(13,27,46,0.25)",
        }}
      >
        <div
          ref={exportRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 1920,
            background: "#0d0d0d",
            transformOrigin: "top left",
            transform: `scale(${SCALE})`,
            display: "flex",
            flexDirection: "column",
            padding: "96px 56px 80px",
            fontFamily: "Montserrat, Inter, sans-serif",
          }}
        >
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
                fontSize: 32,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              NOBRETECH
            </span>
            <span
              style={{
                background: "#D85A30",
                color: "#fff",
                fontSize: 22,
                fontWeight: 700,
                padding: "8px 20px",
                borderRadius: 40,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {story.badge}
            </span>
          </div>

          <div style={{ height: 1, background: "#222", marginBottom: 28 }} />

          {finalVitrine ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div
                style={{
                  fontSize: 58,
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 1.08,
                  whiteSpace: "pre-line",
                }}
              >
                {story.ctaMain || story.headline}
              </div>
              <div style={{ fontSize: 27, color: "#d8b3a3", lineHeight: 1.25 }}>
                {story.ctaSub || "Condições por modelo"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                {story.vitrineProducts?.map((item, i) => (
                  <VitrineProductRow key={i} item={item} />
                ))}
              </div>
              <div
                style={{
                  background: "#D85A30",
                  borderRadius: 18,
                  padding: "24px 30px",
                  color: "#fff",
                  fontSize: 32,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  textAlign: "center",
                }}
              >
                {story.sub || "Me chama para ver disponibilidade agora."}
              </div>
            </div>
          ) : index === 2 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: 32,
              }}
            >
              <div
                style={{
                  fontSize: 88,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.1,
                  whiteSpace: "pre-line",
                }}
              >
                {story.ctaMain || story.headline}
              </div>

              <div style={{ width: 60, height: 1, background: "#333" }} />

              {story.detailLines.length > 0 && (
                <div style={{ fontSize: 30, color: "#555", lineHeight: 2 }}>
                  {story.detailLines.join("\n")}
                </div>
              )}

              <div
                style={{
                  background: "#D85A30",
                  borderRadius: 20,
                  padding: "36px 48px",
                  width: "100%",
                }}
              >
                <div style={{ fontSize: 52, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                  {story.sub}
                </div>
                {story.ctaSub && (
                  <div style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                    {story.ctaSub}
                  </div>
                )}
              </div>
            </div>
          ) : story.vitrineProducts && story.vitrineProducts.length > 0 ? (
            <>
              <div
                style={{
                  fontSize: 68,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.1,
                  marginBottom: 8,
                  whiteSpace: "pre-line",
                }}
              >
                {story.headline}
              </div>
              <div style={{ fontSize: 28, color: "#888", marginBottom: 32 }}>{story.sub}</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                {story.vitrineProducts.map((item, i) => (
                  <VitrineProductRow key={i} item={item} />
                ))}
              </div>

              {story.urgencyLine && (
                <div style={{ fontSize: 26, color: "#D85A30", fontWeight: 700, marginTop: 20 }}>
                  {story.urgencyLine}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 76,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.15,
                  marginBottom: 12,
                  whiteSpace: "pre-line",
                }}
              >
                {story.headline}
              </div>
              <div style={{ fontSize: 32, color: "#888", marginBottom: 32 }}>{story.sub}</div>

              <div
                style={{
                  background: "#161616",
                  border: index === 1 ? "2px solid #D85A30" : "2px solid #2a2a2a",
                  borderRadius: 24,
                  padding: "32px 36px",
                  marginBottom: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div style={{ fontSize: 44, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                    {story.productName}
                  </div>
                  {story.price && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {story.basePrice && (
                        <div
                          style={{
                            fontSize: 28,
                            color: "#777",
                            textDecoration: "line-through",
                          }}
                        >
                          {story.basePrice}
                        </div>
                      )}
                      <div
                        style={{ fontSize: 52, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}
                      >
                        {story.price}
                      </div>
                      {story.parcel && (
                        <div style={{ fontSize: 26, color: "#888", whiteSpace: "nowrap" }}>
                          {story.parcel}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {story.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {story.tags.map((t, i) => (
                      <StoryTagPill key={i} tag={t} />
                    ))}
                  </div>
                )}

                {story.detailLines.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {story.detailLines.map((line, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: "#D85A30",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 28, fontWeight: 600, color: "#c0b8e8" }}>
                          {line}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {story.urgencyLine && (
                <div style={{ fontSize: 28, color: "#D85A30", fontWeight: 700, marginTop: 8 }}>
                  {story.urgencyLine}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Carousel canvas ─────────────────────────────────────────────────────────

function CarouselCanvas({ slide }: { slide: CarouselSlideVisual }) {
  const SCALE = 0.2
  const bg = slide.bgDark ? "#0d0d0d" : "#F5F8FF"
  const textPrimary = slide.bgDark ? "#fff" : "#0D1B2E"
  const textSecondary = slide.bgDark ? "#888" : "#4A5568"
  const borderColor = slide.bgDark ? "#2a2a2a" : "#E2E8F0"

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        Slide {slide.index}
      </span>
      <div
        style={{
          width: 216,
          height: 270,
          background: bg,
          borderRadius: 12,
          border: `2px solid ${slide.bgDark ? "#1a1a1a" : "#e2e8f0"}`,
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
          boxShadow: "0 8px 24px -8px rgba(13,27,46,0.18)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 1350,
            background: bg,
            transformOrigin: "top left",
            transform: `scale(${SCALE})`,
            display: "flex",
            flexDirection: "column",
            padding: "60px 56px 60px",
            fontFamily: "Montserrat, Inter, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 40,
            }}
          >
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: slide.bgDark ? "rgba(255,255,255,0.4)" : "rgba(13,27,46,0.35)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              NOBRETECH
            </span>
            {slide.badge && (
              <span
                style={{
                  background: "#D85A30",
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: 700,
                  padding: "6px 18px",
                  borderRadius: 40,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {slide.badge}
              </span>
            )}
          </div>

          <div style={{ height: 1, background: borderColor, marginBottom: 40 }} />

          {slide.type === "vitrine" && slide.vitrineItems ? (
            <>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: textPrimary,
                  lineHeight: 1.1,
                  marginBottom: 32,
                  whiteSpace: "pre-line",
                }}
              >
                {slide.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                {slide.vitrineItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "16px 20px",
                      background: slide.bgDark ? (item.isPrimary ? "#1c1410" : "#161616") : "#FFFFFF",
                      border: `1.5px solid ${item.isPrimary ? "#D85A30" : borderColor}`,
                      borderRadius: 14,
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: textPrimary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </div>
                      {item.grade && (
                        <div style={{ fontSize: 20, color: textSecondary, marginTop: 4 }}>
                          {item.grade}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {item.basePrice && (
                        <div style={{ fontSize: 16, color: textSecondary, textDecoration: "line-through" }}>
                          {item.basePrice}
                        </div>
                      )}
                      {item.price && (
                        <div
                          style={{
                            fontSize: 26,
                            fontWeight: 700,
                            color: "#D85A30",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.price}
                        </div>
                      )}
                      {item.parcel && (
                        <div style={{ fontSize: 16, color: textSecondary }}>{item.parcel}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : slide.type === "cta" ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: 28,
              }}
            >
              <div
                style={{
                  fontSize: 80,
                  fontWeight: 700,
                  color: textPrimary,
                  lineHeight: 1.1,
                  whiteSpace: "pre-line",
                }}
              >
                {slide.title}
              </div>
              <div style={{ width: 60, height: 1, background: borderColor }} />
              <div
                style={{
                  background: "#D85A30",
                  borderRadius: 18,
                  padding: "28px 40px",
                  width: "80%",
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 700, color: "#fff" }}>{slide.body}</div>
              </div>
            </div>
          ) : slide.type === "trust" ? (
            <>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 700,
                  color: textPrimary,
                  lineHeight: 1.1,
                  marginBottom: 40,
                }}
              >
                {slide.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
                {(slide.detailLines ?? []).map((line, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 20 }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "#D85A30",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 30, fontWeight: 600, color: textPrimary }}>
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 700,
                  color: textPrimary,
                  lineHeight: 1.1,
                  marginBottom: 16,
                  whiteSpace: "pre-line",
                  flex: slide.type === "cover" ? 0 : 1,
                }}
              >
                {slide.title}
              </div>

              {slide.body && (
                <div
                  style={{
                    fontSize: 30,
                    color: textSecondary,
                    lineHeight: 1.5,
                    marginBottom: 20,
                    whiteSpace: "pre-line",
                  }}
                >
                  {slide.body}
                </div>
              )}

              {slide.type === "cover" && (slide.price || slide.parcel) && (
                <div
                  style={{
                    background: slide.bgDark ? "#161616" : "#FFFFFF",
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 20,
                    padding: "24px 28px",
                    marginTop: "auto",
                  }}
                >
                  {slide.price && (
                    <div style={{ fontSize: 52, fontWeight: 700, color: "#D85A30" }}>
                      {slide.price}
                    </div>
                  )}
                  {slide.parcel && (
                    <div style={{ fontSize: 26, color: textSecondary, marginTop: 6 }}>
                      {slide.parcel}
                    </div>
                  )}
                </div>
              )}

              {slide.type === "offer" && (slide.detailLines ?? []).length > 0 && (
                <div
                  style={{
                    background: slide.bgDark ? "#161616" : "#FFFFFF",
                    border: "2px solid #D85A30",
                    borderRadius: 20,
                    padding: "28px 32px",
                    marginTop: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {(slide.detailLines ?? []).map((line, i) => (
                    <div key={i} style={{ fontSize: 32, fontWeight: 600, color: textPrimary }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Product selector ────────────────────────────────────────────────────────

function ProductSelector({
  products,
  selectedIds,
  onAdd,
}: {
  products: MarketingProduct[]
  selectedIds: Set<string>
  onAdd: (p: MarketingProduct) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const available = products.filter((p) => !selectedIds.has(p.id))
    if (!query.trim()) return available.slice(0, 30)
    const q = query.toLowerCase()
    return available
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q) ||
          (p.storage ?? "").toLowerCase().includes(q) ||
          (p.color ?? "").toLowerCase().includes(q) ||
          (p.grade ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [products, query, selectedIds])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <div id="marketing-product-selector" ref={containerRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 cursor-text transition-colors",
          open ? "border-royal-500 ring-2 ring-royal-100" : "border-gray-200 hover:border-gray-300"
        )}
        onClick={() => setOpen(true)}
      >
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          className="flex-1 bg-transparent text-sm text-navy-900 placeholder-gray-400 outline-none"
          placeholder="Adicionar produto à campanha…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              {products.filter((p) => !selectedIds.has(p.id)).length === 0
                ? "Todos os produtos já foram adicionados."
                : "Nenhum produto encontrado."}
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-royal-100/50 transition-colors border-b border-gray-100 last:border-0"
                onClick={() => {
                  onAdd(p)
                  setQuery("")
                  setOpen(false)
                }}
              >
                <div className="text-sm font-medium text-navy-900 leading-tight">{p.name}</div>
                <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                  {p.grade && (
                    <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-success-100 text-success-500">
                      {p.grade}
                    </span>
                  )}
                  {p.battery_health != null && (
                    <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-royal-100 text-royal-600">
                      Bat {p.battery_health}%
                    </span>
                  )}
                  {p.suggested_price != null && (
                    <span className="text-[10px] text-gray-600 font-medium">
                      {formatBRL(p.suggested_price)}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{p.quantity} un.</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── BRL input ───────────────────────────────────────────────────────────────

function BRLInput({
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  value: string
  placeholder?: string
  onChange: (next: string) => void
  onBlur?: () => void
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-[#D85A30] focus-within:ring-2 focus-within:ring-[#FDECE4]">
      <span className="flex w-11 shrink-0 items-center justify-center border-r border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
        R$
      </span>
      <input
        type="text"
        inputMode="decimal"
        className="w-full min-w-0 bg-white px-3 py-2 text-sm font-semibold text-navy-900 placeholder-gray-400 outline-none"
        placeholder={placeholder ?? "0,00"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/-/g, ""))}
        onBlur={onBlur}
      />
    </div>
  )
}

// ─── Editable product card ───────────────────────────────────────────────────

interface EditableDraftState {
  productId: string
  isPrimary: boolean
  isFeatured: boolean
  basePriceText: string
  disclosurePriceText: string
  installmentCount: number
  gifts: string
  warrantyLabel: string
  warrantySource: "inventory" | "manual" | null
  copyTitle: string
  copyDescription: string
  copyStrongPoint: string
  copyObjection: string
  productNote: string
  productCta: string
  expanded: boolean
}

function ProductCardEditor({
  product,
  state,
  productImages,
  onUpdate,
  onMakePrimary,
  onToggleFeatured,
  onRemove,
}: {
  product: MarketingProduct
  state: EditableDraftState
  productImages: ProductImageMap
  onUpdate: (next: Partial<EditableDraftState>) => void
  onMakePrimary: () => void
  onToggleFeatured: () => void
  onRemove: () => void
}) {
  const basePrice = parseBRLInput(state.basePriceText) ?? product.suggested_price
  const disclosurePrice = parseBRLInput(state.disclosurePriceText) ?? basePrice
  const discount = calculateDiscount(basePrice, disclosurePrice)
  const installment =
    disclosurePrice && state.installmentCount > 0
      ? calculateInstallmentDisplay(disclosurePrice, state.installmentCount)
      : null

  const installmentOptions: Array<{ value: number; label: string }> = [
    { value: 0, label: "Sem parcelamento" },
  ]
  for (let n = 1; n <= 18; n++) {
    if (disclosurePrice && disclosurePrice > 0) {
      const info = calculateInstallmentDisplay(disclosurePrice, n)
      installmentOptions.push({
        value: n,
        label: info ? `${n}x de ${formatBRL(info.perInstallment)}` : `${n}x`,
      })
    } else {
      installmentOptions.push({ value: n, label: `${n}x` })
    }
  }

  const headerSummary: string[] = []
  if (product.grade) headerSummary.push(product.grade)
  if (product.battery_health != null) headerSummary.push(`Bat ${product.battery_health}%`)
  if (product.storage) headerSummary.push(product.storage)
  if (product.color) headerSummary.push(product.color)
  const effectiveWarranty = state.warrantyLabel.trim()
  const asset = productAssetFor(product, productImages)

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors",
        state.isPrimary || state.isFeatured || discount ? "border-[#F0A080]" : "border-gray-100"
      )}
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[108px_1fr_auto]">
        <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
          <Image
            src={asset.src}
            alt={asset.alt}
            width={112}
            height={112}
            className="h-full w-full object-contain p-2"
            unoptimized={asset.source === "uploaded"}
            loading="lazy"
          />
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500 shadow-sm">
            {asset.badge}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {state.isPrimary && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[#FDECE4] text-[#A23E18]">
                <Crown className="w-3 h-3" />
                Principal
              </span>
            )}
            {state.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-royal-100 text-royal-600">
                <Star className="w-3 h-3" />
                Destaque
              </span>
            )}
            {discount && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-success-100 text-success-600">
                Oferta
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-lg font-bold tracking-tight text-navy-900">{product.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
            {headerSummary.map((s, i) => (
              <span key={i} className="rounded-full border border-gray-100 bg-gray-50 px-2 py-1 font-semibold">
                {s}
              </span>
            ))}
            <span className="rounded-full border border-gray-100 bg-gray-50 px-2 py-1 font-semibold">{product.quantity} un.</span>
            {effectiveWarranty && (
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                {effectiveWarranty}
              </span>
            )}
            {state.gifts.trim() && (
              <span className="rounded-full border border-orange-100 bg-orange-50 px-2 py-1 font-semibold text-orange-700">
                {state.gifts.trim()}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preço padrão</p>
              <p className="mt-1 text-sm font-bold text-navy-900">{basePrice != null ? formatBRL(basePrice) : "A confirmar"}</p>
            </div>
            <div className="rounded-xl border border-[#F0A080] bg-[#FFF7F3] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A23E18]">Divulgação</p>
              <p className="mt-1 text-base font-black text-[#D85A30]">{disclosurePrice != null ? formatBRL(disclosurePrice) : "A confirmar"}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Parcelamento</p>
              <p className="mt-1 text-sm font-bold text-navy-900">{installment?.text ?? "Sem parcelamento"}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {discount ? (
              <span className="font-semibold text-success-600">
                Desconto: {formatBRL(discount.amount)} ({discount.percent}%)
              </span>
            ) : (
              <span className="text-gray-500">Sem desconto vs padrão.</span>
            )}
            {installment && (
              <span className="text-gray-500">
                Total {formatBRL(installment.total)}{installment.hasFee ? " · taxas Sidepay" : ""} · simulação informativa
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-start gap-1 sm:flex-col">
          <button
            type="button"
            onClick={() => onUpdate({ expanded: !state.expanded })}
            className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:border-gray-300 hover:text-navy-900"
            aria-label={state.expanded ? "Recolher" : "Expandir"}
          >
            {state.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {!state.isPrimary && (
            <button
              type="button"
              onClick={onMakePrimary}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[10px] font-medium text-gray-600 hover:border-[#D85A30] hover:text-[#A23E18]"
              title="Tornar principal"
            >
              <Star className="w-3 h-3" />
              <span className="hidden sm:inline">Tornar principal</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleFeatured}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium",
              state.isFeatured
                ? "border-royal-500 bg-royal-100 text-royal-600"
                : "border-gray-200 bg-white text-gray-600 hover:border-royal-400 hover:text-royal-600"
            )}
            title={state.isFeatured ? "Remover destaque" : "Marcar destaque"}
          >
            <Star className="w-3 h-3" />
            <span className="hidden sm:inline">{state.isFeatured ? "Remover destaque" : "Marcar destaque"}</span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-400 hover:border-danger-200 hover:bg-danger-100 hover:text-danger-500"
            aria-label="Remover"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {state.expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Preço padrão
            </label>
            <BRLInput
              value={state.basePriceText}
              placeholder={
                product.suggested_price != null
                  ? formatBRLInputValue(product.suggested_price)
                  : "0,00"
              }
              onChange={(v) => onUpdate({ basePriceText: v })}
              onBlur={() => onUpdate({ basePriceText: normalizeBRLInputText(state.basePriceText) })}
            />
            <p className="mt-1 text-[10px] text-gray-500">
              Padrão: {product.suggested_price != null ? formatBRL(product.suggested_price) : "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Preço de divulgação
            </label>
            <BRLInput
              value={state.disclosurePriceText}
              placeholder="0,00"
              onChange={(v) => onUpdate({ disclosurePriceText: v })}
              onBlur={() => onUpdate({ disclosurePriceText: normalizeBRLInputText(state.disclosurePriceText) })}
            />
            {discount ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-success-500 font-semibold">
                Desconto: {formatBRL(discount.amount)} ({discount.percent}%)
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-gray-500">Sem desconto vs padrão.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Parcelamento (até 18x)
            </label>
            <div className="relative">
              <select
                value={state.installmentCount}
                onChange={(e) => onUpdate({ installmentCount: Number(e.target.value) })}
                className="w-full appearance-none rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none transition-colors focus:border-royal-500 focus:ring-2 focus:ring-royal-100 pr-8"
              >
                {installmentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
            {installment && (
              <p className="mt-1 text-[10px] text-gray-500">
                {installment.text}
                {installment.hasFee
                  ? ` · total ${formatBRL(installment.total)} (taxas Sidepay)`
                  : ""}
                {" "}— simulação informativa.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Brindes / kit incluso (deste produto)
            </label>
            <input
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
              placeholder="Ex: capa + película + caneta"
              value={state.gifts}
              onChange={(e) => onUpdate({ gifts: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Garantia exibida (opcional)
            </label>
            <input
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
              placeholder="Ex: Garantia Nobretech 6 meses, Garantia Apple ou Não exibir"
              list={`warranty-options-${product.id}`}
              value={state.warrantyLabel}
              onChange={(e) => onUpdate({ warrantyLabel: e.target.value, warrantySource: e.target.value.trim() ? "manual" : null })}
            />
            <datalist id={`warranty-options-${product.id}`}>
              <option value="Garantia Nobretech 6 meses" />
              <option value="Garantia Apple" />
              <option value="Garantia Apple até " />
              <option value="" />
            </datalist>
            <p className="mt-1 text-[10px] text-gray-500">
              Só aparece se preenchido. Não afirmamos garantia Apple automaticamente.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Observação comercial (deste produto)
            </label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100 resize-none"
              placeholder="Ex: bateria 100%, lacrado, com nota fiscal"
              value={state.productNote}
              onChange={(e) => onUpdate({ productNote: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              CTA específico
            </label>
            <input
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
              placeholder="Ex: Me chama pra reservar."
              value={state.productCta}
              onChange={(e) => onUpdate({ productCta: e.target.value })}
            />
          </div>

          <div className="md:col-span-2 rounded-2xl border border-royal-100 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-royal-600">
                  Copy deste produto
                </p>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  Editável. A IA pode preencher, mas nunca altera preço, parcela ou estoque.
                </p>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Texto
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                placeholder="Título curto"
                value={state.copyTitle}
                onChange={(e) => onUpdate({ copyTitle: e.target.value })}
              />
              <input
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                placeholder="Ponto forte"
                value={state.copyStrongPoint}
                onChange={(e) => onUpdate({ copyStrongPoint: e.target.value })}
              />
              <textarea
                rows={2}
                className="col-span-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 placeholder-gray-400 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100 resize-none"
                placeholder="Descrição curta"
                value={state.copyDescription}
                onChange={(e) => onUpdate({ copyDescription: e.target.value })}
              />
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({
  text,
  copyKey,
  copied,
  onCopy,
}: {
  text: string
  copyKey: string
  copied: CopiedKey
  onCopy: (key: string, text: string) => void
}) {
  const isActive = copied === copyKey
  return (
    <button
      type="button"
      onClick={() => onCopy(copyKey, text)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border",
        isActive
          ? "border-success-500 bg-success-100 text-success-500"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-navy-900"
      )}
    >
      {isActive ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {isActive ? "Copiado" : "Copiar"}
    </button>
  )
}

function buildQuickProductText(facts: ReturnType<typeof buildProductFacts>[]): string {
  return facts
    .map((f) => {
      const name = [f.name]
      if (f.storage && !f.name.toLocaleLowerCase("pt-BR").includes(f.storage.toLocaleLowerCase("pt-BR"))) {
        name.push(f.storage)
      }
      if (f.color && !f.name.toLocaleLowerCase("pt-BR").includes(f.color.toLocaleLowerCase("pt-BR"))) {
        name.push(f.color)
      }
      const lines: string[] = [`*${name.join(" ")}*`]
      if (f.battery_health != null) lines.push(`🔋 Bateria ${f.battery_health}%`)
      if (f.grade) lines.push(`✅ ${f.grade === "Lacrado" ? "Lacrado" : `Grade ${f.grade}, revisado pela Nobretech`}`)
      if (f.warrantyLabel) lines.push(`📆 ${f.warrantyLabel}`)
      if (f.discount && f.basePrice != null && f.disclosurePrice != null) {
        lines.push(`💰 De ~${formatBRL(f.basePrice)}~ por ${formatBRL(f.disclosurePrice)}`)
      } else if (f.disclosurePrice != null) {
        lines.push(`💰 ${formatBRL(f.disclosurePrice)}`)
      }
      if (f.installment) lines.push(`💳 Até ${f.installment.text}`)
      if (f.gifts) lines.push(`🎁 ${f.gifts}`)
      if (f.productNote) lines.push(`📝 ${f.productNote}`)
      if (f.quantity <= 1) lines.push("⚡ Última unidade nessa condição")
      if (f.productCta) lines.push(f.productCta)
      return lines.join("\n")
    })
    .join("\n\n")
}

// ─── Main client component ───────────────────────────────────────────────────

export function DivulgacaoClient() {
  const [products, setProducts] = useState<MarketingProduct[]>([])
  const [productImages, setProductImages] = useState<ProductImageMap>({})
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [errorProducts, setErrorProducts] = useState<string | null>(null)

  const [draftStates, setDraftStates] = useState<EditableDraftState[]>([])

  const [objective, setObjective] = useState<ObjectiveKey>("sell_fast")
  const [channel, setChannel] = useState<ChannelKey>("whatsapp")
  const [copyChannelTab, setCopyChannelTab] = useState<CopyChannelTab>("whatsapp")
  const [tone, setTone] = useState<ToneKey>("consultivo")
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>("none")
  const [generalCta, setGeneralCta] = useState("")
  const [generalNote, setGeneralNote] = useState("")
  const [angle, setAngle] = useState("")

  const [outputTab, setOutputTab] = useState<OutputTab>("stories")
  const [copied, setCopied] = useState<CopiedKey>(null)

  const [aiResult, setAIResult] = useState<GeneratedContent | null>(null)
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState<string | null>(null)
  const [aiSource, setAISource] = useState<"deterministic" | "ai">("deterministic")
  const [copySource, setCopySource] = useState<CopySource>("deterministic")
  const [aiSuggestionNotes, setAISuggestionNotes] = useState<string[]>([])
  const [campaignAngle, setCampaignAngle] = useState<CampaignAngleSuggestion | null>(null)
  const [channelCopy, setChannelCopy] = useState<ChannelCopyDraft>(() => emptyChannelCopyDraft())
  const [canMobileShare, setCanMobileShare] = useState(false)

  const storyExportRefs = useRef<Array<HTMLDivElement | null>>([null, null, null])
  const skipStrategyResetRef = useRef(false)

  const resetGeneratedCopy = useCallback(() => {
    setAIResult(null)
    setAISource("deterministic")
    setCopySource("deterministic")
    setAIError(null)
    setAISuggestionNotes([])
    setCampaignAngle(null)
    setChannelCopy(emptyChannelCopyDraft())
  }, [])

  const productsById = useMemo(() => {
    const map = new Map<string, MarketingProduct>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    setErrorProducts(null)
    try {
      const res = await fetch("/api/marketing/products", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) {
        setErrorProducts(body?.error?.message ?? "Não foi possível carregar os produtos.")
        setProducts([])
      } else if (body.error) {
        setErrorProducts(body.error.message ?? "Não foi possível carregar os produtos.")
        setProducts([])
      } else {
        setProducts(Array.isArray(body.data) ? body.data : [])
      }
    } catch {
      setErrorProducts("Falha de conexão ao carregar o estoque.")
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    const ids = draftStates.map((s) => s.productId)
    if (ids.length === 0) {
      setProductImages({})
      return
    }
    let cancelled = false
    fetchProductImageMap(ids)
      .then((map) => {
        if (!cancelled) setProductImages(map)
      })
      .catch(() => {
        if (!cancelled) setProductImages({})
      })
    return () => {
      cancelled = true
    }
  }, [draftStates])

  useEffect(() => {
    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false
    const hasShareFiles = typeof navigator !== "undefined" && "share" in navigator && "canShare" in navigator
    setCanMobileShare(Boolean(isCoarsePointer && hasShareFiles))
  }, [])

  const addProduct = useCallback((p: MarketingProduct) => {
    resetGeneratedCopy()
    setDraftStates((prev) => {
      if (prev.some((d) => d.productId === p.id)) return prev
      const isFirst = prev.length === 0
      const next: EditableDraftState = {
        productId: p.id,
        isPrimary: isFirst,
        isFeatured: false,
        basePriceText:
          p.suggested_price != null
            ? new Intl.NumberFormat("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(p.suggested_price)
            : "",
        disclosurePriceText:
          p.suggested_price != null
            ? new Intl.NumberFormat("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(p.suggested_price)
            : "",
        installmentCount: 0,
        gifts: "",
        warrantyLabel: p.warranty_label || "",
        warrantySource: p.warranty_label ? p.warranty_source ?? "inventory" : null,
        copyTitle: "",
        copyDescription: "",
        copyStrongPoint: "",
        copyObjection: "",
        productNote: "",
        productCta: "",
        expanded: isFirst,
      }
      return [...prev, next]
    })
  }, [resetGeneratedCopy])

  const updateDraft = useCallback((id: string, patch: Partial<EditableDraftState>) => {
    if (Object.keys(patch).some((key) => key !== "expanded")) {
      resetGeneratedCopy()
    }
    setDraftStates((prev) => prev.map((d) => (d.productId === id ? { ...d, ...patch } : d)))
  }, [resetGeneratedCopy])

  const removeDraft = useCallback((id: string) => {
    resetGeneratedCopy()
    setDraftStates((prev) => {
      const wasPrimary = prev.find((d) => d.productId === id)?.isPrimary
      const next = prev.filter((d) => d.productId !== id)
      if (wasPrimary && next.length > 0 && !next.some((d) => d.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true }
      }
      return next
    })
  }, [resetGeneratedCopy])

  const makePrimary = useCallback((id: string) => {
    resetGeneratedCopy()
    setDraftStates((prev) => prev.map((d) => ({ ...d, isPrimary: d.productId === id })))
  }, [resetGeneratedCopy])

  const toggleFeatured = useCallback((id: string) => {
    resetGeneratedCopy()
    setDraftStates((prev) => prev.map((d) => (d.productId === id ? { ...d, isFeatured: !d.isFeatured } : d)))
  }, [resetGeneratedCopy])

  const drafts = useMemo<ProductDraft[]>(() => {
    return draftStates
      .map<ProductDraft | null>((s) => {
        const product = productsById.get(s.productId)
        if (!product) return null
        const basePrice = parseBRLInput(s.basePriceText) ?? product.suggested_price
        const disclosurePrice = parseBRLInput(s.disclosurePriceText) ?? basePrice
        return {
          product,
          isPrimary: s.isPrimary,
          isFeatured: s.isFeatured,
          basePrice,
          disclosurePrice,
          installmentCount: s.installmentCount,
          gifts: s.gifts,
          warrantyLabel: s.warrantyLabel,
          warrantySource: s.warrantySource,
          copyTitle: s.copyTitle,
          copyDescription: s.copyDescription,
          copyStrongPoint: s.copyStrongPoint,
          copyObjection: s.copyObjection,
          productNote: s.productNote,
          productCta: s.productCta,
        } satisfies ProductDraft
      })
      .filter((d): d is ProductDraft => d !== null)
  }, [draftStates, productsById])

  const strategy = useMemo<GeneralStrategy>(
    () => ({
      objective,
      channel,
      tone,
      urgencyLevel,
      generalCta,
      generalNote,
      angle,
    }),
    [objective, channel, tone, urgencyLevel, generalCta, generalNote, angle]
  )

  const deterministic = useMemo<GeneratedContent | null>(() => {
    if (drafts.length === 0) return null
    try {
      return generateContent(drafts, strategy)
    } catch {
      return null
    }
  }, [drafts, strategy])

  const generated = aiResult ?? deterministic
  const displayGenerated = useMemo<GeneratedContent | null>(() => {
    if (!generated) return null
    return {
      ...generated,
      whatsapp: channelCopy.whatsapp || generated.whatsapp,
      instagram: channelCopy.instagram || generated.instagram,
      stories: generated.stories.map((story, index) => ({
        ...story,
        headline: channelCopy.storyHeadlines[index] || story.headline,
        sub: channelCopy.storySubtitles[index] || story.sub,
        ctaMain: index === 2 && channelCopy.storyCta ? channelCopy.storyCta : story.ctaMain,
      })) as GeneratedContent["stories"],
      carousel: generated.carousel.map((slide, index) => ({
        ...slide,
        title: channelCopy.carouselTitles[index] || slide.title,
        body: channelCopy.carouselBodies[index] || slide.body,
      })),
    }
  }, [channelCopy, generated])

  // Reset AI overlay when key inputs change
  useEffect(() => {
    if (skipStrategyResetRef.current) {
      skipStrategyResetRef.current = false
      return
    }
    resetGeneratedCopy()
  }, [objective, channel, tone, urgencyLevel, generalCta, generalNote, angle, resetGeneratedCopy])

  const facts = useMemo(() => drafts.map(buildProductFacts), [drafts])
  const selectedIds = useMemo(
    () => new Set(draftStates.map((s) => s.productId)),
    [draftStates]
  )
  const primaryFacts = facts.find((f) => f.isPrimary) ?? facts[0] ?? null
  const quickProductText = useMemo(() => buildQuickProductText(facts), [facts])

  const handleCopy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  async function exportStory(index: number) {
    const el = storyExportRefs.current[index]
    if (!el) return
    try {
      const { default: html2canvas } = await import("html2canvas")
      const canvas = await html2canvas(el, { scale: 1, useCORS: true, backgroundColor: "#0d0d0d" })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("Canvas não gerou imagem.")
      const fileName = `nobretech-story-${index + 1}.png`
      const file = new File([blob], fileName, { type: "image/png" })

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          files: [file],
          title: `Nobretech Story ${index + 1}`,
          text: "Story pronto para compartilhar.",
        })
        return
      }

      const url = URL.createObjectURL(blob)
      const isMobile = window.matchMedia?.("(pointer: coarse)").matches ?? false
      if (isMobile) {
        window.open(url, "_blank", "noopener,noreferrer")
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        alert("Imagem aberta em nova aba. Toque e segure na imagem para salvar.")
        return
      }

      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Exportação falhou. O navegador pode estar bloqueando html2canvas neste contexto.")
    }
  }

  async function generateWithAI() {
    if (drafts.length === 0) return
    setAILoading(true)
    setAIError(null)
    try {
      const res = await fetch("/api/marketing/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drafts: drafts.map((d) => ({
            product: d.product,
            isPrimary: d.isPrimary,
            isFeatured: d.isFeatured,
            basePrice: d.basePrice,
            disclosurePrice: d.disclosurePrice,
            installmentCount: d.installmentCount,
            gifts: d.gifts,
            warrantyLabel: d.warrantyLabel,
            warrantySource: d.warrantySource,
            copyTitle: d.copyTitle,
            copyDescription: d.copyDescription,
            copyStrongPoint: d.copyStrongPoint,
            copyObjection: d.copyObjection,
            productNote: d.productNote,
            productCta: d.productCta,
          })),
          strategy,
          useAI: true,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body || body.error) {
        setAIError(body?.error?.message ?? "Falha ao chamar IA.")
      } else {
        const nextContent = body.data?.content ?? null
        const nextSource = body.data?.source ?? "deterministic"
        const productCopies = Array.isArray(body.data?.productCopies) ? body.data.productCopies : []
        if (productCopies.length > 0) {
          setDraftStates((prev) => prev.map((draft) => {
            const copy = productCopies.find((item: { productId?: string }) => item.productId === draft.productId)
            if (!copy) return draft
            return {
              ...draft,
              copyTitle: typeof copy.title === "string" ? copy.title : draft.copyTitle,
              copyDescription: typeof copy.description === "string" ? copy.description : draft.copyDescription,
              copyStrongPoint: typeof copy.strongPoint === "string" ? copy.strongPoint : draft.copyStrongPoint,
              productCta: typeof copy.cta === "string" ? copy.cta : draft.productCta,
              copyObjection: typeof copy.objection === "string" ? copy.objection : draft.copyObjection,
            }
          }))
        }
        if (nextContent) {
          setChannelCopy({
            storyHeadlines: [
              nextContent.stories?.[0]?.headline || "",
              nextContent.stories?.[1]?.headline || "",
              nextContent.stories?.[2]?.headline || "",
            ],
            storySubtitles: [
              nextContent.stories?.[0]?.sub || "",
              nextContent.stories?.[1]?.sub || "",
              nextContent.stories?.[2]?.sub || "",
            ],
            storyCta: nextContent.stories?.[2]?.ctaMain || "",
            whatsapp: nextContent.whatsapp || "",
            instagram: nextContent.instagram || "",
            carouselTitles: Array.isArray(nextContent.carousel)
              ? nextContent.carousel.map((slide: { title?: string }) => slide.title || "")
              : [],
            carouselBodies: Array.isArray(nextContent.carousel)
              ? nextContent.carousel.map((slide: { body?: string }) => slide.body || "")
              : [],
          })
        }
        setAIResult(nextContent)
        setAISource(nextSource)
        setCopySource(nextSource === "ai" ? "ai" : "deterministic")
        const nextCampaignAngle = body.data?.campaignAngle ?? null
        setCampaignAngle(nextCampaignAngle)
        if (nextSource === "ai") {
          const suggestedAngle = typeof nextCampaignAngle?.mainHook === "string" ? nextCampaignAngle.mainHook.trim() : ""
          const suggestedCta = typeof nextContent?.stories?.[2]?.ctaMain === "string" ? nextContent.stories[2].ctaMain.trim() : ""
          if ((!angle.trim() && suggestedAngle) || (!generalCta.trim() && suggestedCta)) {
            skipStrategyResetRef.current = true
            if (!angle.trim() && suggestedAngle) setAngle(suggestedAngle)
            if (!generalCta.trim() && suggestedCta) setGeneralCta(suggestedCta)
          }
        }
        const offerAlerts = Array.isArray(body.data?.offerAlerts) ? body.data.offerAlerts : []
        setAISuggestionNotes(offerAlerts.length > 0 ? offerAlerts : Array.isArray(nextContent?.warnings) ? nextContent.warnings.filter((w: string) => w.startsWith("IA:")) : [])
        if (body.data?.aiError) setAIError(body.data.aiError)
      }
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "Falha ao chamar IA.")
    } finally {
      setAILoading(false)
    }
  }

  const objectives: { key: ObjectiveKey; emoji: string }[] = [
    { key: "sell_fast", emoji: "⚡" },
    { key: "generate_desire", emoji: "✨" },
    { key: "bundle_gift", emoji: "🎁" },
    { key: "trust_proof", emoji: "🛡" },
    { key: "new_arrival", emoji: "📦" },
    { key: "reactivate_lead", emoji: "🔄" },
  ]

  const urgencyHighWarning =
    urgencyLevel === "high" && primaryFacts != null && primaryFacts.quantity > 3

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 lg:px-6 lg:py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FDECE4] text-[#D85A30]">
              <Megaphone className="h-4.5 w-4.5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-navy-900">Central de Divulgação</h1>
          </div>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Crie stories, carrosséis e mensagens com IA a partir do estoque real.
          </p>
        </div>
        {!loadingProducts && !errorProducts && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
            <Package className="h-3.5 w-3.5 text-royal-500" />
            {products.length} {products.length === 1 ? "produto disponível" : "produtos disponíveis"}
          </span>
        )}
      </header>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-5">
          {/* Card: Produtos da campanha */}
          <section className="relative rounded-2xl border border-gray-100 bg-card shadow-sm">
            <header className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-navy-900">
                  Produtos da campanha
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {draftStates.length === 0
                    ? "Selecione, edite e destaque os produtos que serão divulgados."
                    : draftStates.length === 1
                    ? "1 produto selecionado. Edite o card e acompanhe o preview ao lado."
                    : `${draftStates.length} produtos selecionados. Ofertas e destaques aparecem primeiro.`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => document.querySelector<HTMLInputElement>("#marketing-product-selector input")?.focus()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600"
                >
                  <Package className="h-3.5 w-3.5" />
                  Adicionar produto
                </button>
                <button
                  type="button"
                  onClick={() => setDraftStates((prev) => [...prev].sort((a, b) => {
                    const ap = productsById.get(a.productId)
                    const bp = productsById.get(b.productId)
                    const ad = calculateDiscount(parseBRLInput(a.basePriceText) ?? ap?.suggested_price ?? null, parseBRLInput(a.disclosurePriceText) ?? ap?.suggested_price ?? null)
                    const bd = calculateDiscount(parseBRLInput(b.basePriceText) ?? bp?.suggested_price ?? null, parseBRLInput(b.disclosurePriceText) ?? bp?.suggested_price ?? null)
                    if (Boolean(ad) !== Boolean(bd)) return ad ? -1 : 1
                    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
                    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
                    return 0
                  }))}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Ordenar
                </button>
              </div>
            </header>
            <div className="p-5 space-y-3">
              {loadingProducts ? (
                <ProductLoadingSkeleton />
              ) : errorProducts ? (
                <ErrorBlock message={errorProducts} onRetry={loadProducts} />
              ) : products.length === 0 ? (
                <EmptyProductsBlock />
              ) : (
                <>
                  <ProductSelector
                    products={products}
                    selectedIds={selectedIds}
                    onAdd={addProduct}
                  />
                  <div className="space-y-2 mt-3">
                    {draftStates.map((s) => {
                      const product = productsById.get(s.productId)
                      if (!product) return null
                      return (
                        <ProductCardEditor
                          key={s.productId}
                          product={product}
                          state={s}
                          productImages={productImages}
                          onUpdate={(patch) => updateDraft(s.productId, patch)}
                          onMakePrimary={() => makePrimary(s.productId)}
                          onToggleFeatured={() => toggleFeatured(s.productId)}
                          onRemove={() => removeDraft(s.productId)}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Card: Estratégia geral */}
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-display text-sm font-semibold text-navy-900">
                Estratégia da campanha
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Objetivo, canal, tom, urgência e mensagens gerais. Preço/parcela/brinde ficam por produto.
              </p>
            </header>
            <div className="p-5 space-y-5">
              <div>
                <SectionLabel>Objetivo</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {objectives.map(({ key, emoji }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setObjective(key)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-xs font-medium leading-tight transition-all",
                        objective === key
                          ? "border-[#D85A30] bg-[#FDECE4] text-[#A23E18]"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-navy-900"
                      )}
                    >
                      <span className="mr-1.5">{emoji}</span>
                      {OBJECTIVE_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel>Canal ativo</SectionLabel>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as ChannelKey)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="stories">Instagram Stories</option>
                    <option value="instagram">Legenda Instagram</option>
                    <option value="carousel">Carrossel</option>
                  </select>
                </div>
                <div>
                  <SectionLabel>Tom comercial</SectionLabel>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as ToneKey)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                  >
                    {Object.entries(TONE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <SectionLabel>Urgência geral</SectionLabel>
                <div className="flex gap-2">
                  {(["none", "low", "high"] as UrgencyLevel[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgencyLevel(u)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-all",
                        urgencyLevel === u
                          ? u === "high"
                            ? "border-danger-500 bg-danger-100 text-danger-500"
                            : u === "low"
                            ? "border-warning-500 bg-warning-100 text-warning-500"
                            : "border-royal-500 bg-royal-100 text-royal-600"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      )}
                    >
                      {u === "none" ? "Nenhuma" : u === "low" ? "Moderada" : "Alta"}
                    </button>
                  ))}
                </div>
                {urgencyHighWarning && (
                  <div className="mt-2 rounded-lg border border-danger-500/30 bg-danger-100/40 px-3 py-2">
                    <p className="inline-flex items-start gap-1.5 text-[10px] text-danger-500 leading-relaxed">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        Urgência alta com {primaryFacts?.quantity} unidades em estoque pode soar como falsa escassez.
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <FieldInput
                label="Mensagem / ângulo principal"
                placeholder="Ex: lote acabou de chegar com bateria 100%"
                value={angle}
                onChange={setAngle}
              />
              <FieldInput
                label="CTA geral (opcional)"
                placeholder="Ex: Me chama no WhatsApp pra ver disponibilidade"
                value={generalCta}
                onChange={setGeneralCta}
              />
              <FieldTextarea
                label="Observação geral (opcional)"
                placeholder="Ex: Entrega disponível para Manaus e região"
                value={generalNote}
                onChange={setGeneralNote}
              />

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-navy-900">Assistente de Copy</h3>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Gera textos editáveis por produto e por canal. Os números continuam vindo dos cards.
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        copySource === "ai"
                          ? "bg-success-100 text-success-600"
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {copySource === "ai" ? <Sparkles className="h-3 w-3" /> : null}
                      {copySource === "ai" ? "Gerado por IA" : "Gerado por template"}
                    </span>
                  </div>
                {campaignAngle && (
                  <div className="mb-3 rounded-xl border border-royal-100 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-royal-600">
                        Ângulo escolhido pela IA
                      </p>
                      <Sparkles className="h-3.5 w-3.5 text-royal-500" />
                    </div>
                    <h4 className="mt-2 text-sm font-semibold leading-snug text-navy-900">
                      {campaignAngle.title}
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                      {campaignAngle.reason}
                    </p>
                    <div className="mt-2 rounded-lg bg-royal-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-royal-600">Gancho</p>
                      <p className="mt-0.5 text-xs font-medium text-navy-900">{campaignAngle.mainHook}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {angle.trim() && campaignAngle.mainHook.trim() && angle.trim() !== campaignAngle.mainHook.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            skipStrategyResetRef.current = true
                            setAngle(campaignAngle.mainHook)
                          }}
                          className="rounded-md border border-royal-200 bg-white px-2 py-1 text-[10px] font-semibold text-royal-600 hover:bg-royal-50"
                        >
                          Aplicar ao ângulo
                        </button>
                      )}
                      {generalCta.trim() && displayGenerated?.stories?.[2]?.ctaMain && generalCta.trim() !== displayGenerated.stories[2].ctaMain.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            skipStrategyResetRef.current = true
                            setGeneralCta(displayGenerated.stories[2].ctaMain || "")
                          }}
                          className="rounded-md border border-royal-200 bg-white px-2 py-1 text-[10px] font-semibold text-royal-600 hover:bg-royal-50"
                        >
                          Aplicar ao CTA
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
                      {campaignAngle.commercialStrategy}
                    </p>
                  </div>
                )}
                {copySource === "ai" && draftStates.some((draft) => draft.copyTitle || draft.copyStrongPoint || draft.productCta) && (
                  <div className="mb-3 rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      Sugestões por produto
                    </p>
                    <div className="mt-2 space-y-2">
                      {draftStates.map((draft) => {
                        const product = productsById.get(draft.productId)
                        if (!product) return null
                        const asset = productAssetFor(product, productImages)
                        return (
                          <div key={draft.productId} className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-white">
                                  <Image
                                    src={asset.src}
                                    alt={asset.alt}
                                    width={40}
                                    height={40}
                                    className="h-full w-full object-contain p-1"
                                    unoptimized={asset.source === "uploaded"}
                                    loading="lazy"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <p className="truncate text-xs font-semibold text-navy-900">{draft.copyTitle || product.name}</p>
                                    {draft.isPrimary && (
                                      <span className="rounded-full bg-[#FDECE4] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#A23E18]">
                                        Principal
                                      </span>
                                    )}
                                    {draft.isFeatured && (
                                      <span className="rounded-full bg-royal-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-royal-600">
                                        Destaque
                                      </span>
                                    )}
                                  </div>
                                {draft.copyStrongPoint && (
                                  <p className="mt-0.5 text-[11px] text-[#A23E18]">{draft.copyStrongPoint}</p>
                                )}
                                {draft.productCta && (
                                  <p className="mt-1 text-[11px] text-gray-600">{draft.productCta}</p>
                                )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => updateDraft(draft.productId, { expanded: true })}
                                className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:border-royal-300 hover:text-royal-600"
                              >
                                Ver / Editar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  disabled={drafts.length === 0 || aiLoading}
                  onClick={generateWithAI}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                    drafts.length === 0 || aiLoading
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-navy-900 text-white hover:bg-navy-800"
                  )}
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gerando com IA…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Gerar copy com IA
                    </>
                  )}
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={drafts.length === 0 || aiLoading}
                    onClick={generateWithAI}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-600 hover:border-royal-300 hover:text-royal-600 disabled:cursor-not-allowed disabled:text-gray-300"
                  >
                    Gerar novamente com IA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAIResult(null)
                      setAISource("deterministic")
                      setCopySource("deterministic")
                      setAIError(null)
                      setAISuggestionNotes([])
                      setCampaignAngle(null)
                      setChannelCopy(emptyChannelCopyDraft())
                    }}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-600 hover:border-gray-300 hover:text-navy-900"
                  >
                    Voltar ao determinístico
                  </button>
                </div>
                {aiResult && aiSource === "ai" && (
                  <p className="mt-2 text-[10px] text-success-600 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Gerado por IA e aplicado nas áreas editáveis.
                  </p>
                )}
                {aiError && (
                  <p className="mt-2 rounded-lg border border-warning-500/30 bg-warning-100/60 px-2.5 py-2 text-[10px] text-warning-700 inline-flex items-start gap-1">
                    <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                    <span>{aiError.includes("IA indisponível") ? aiError : `IA indisponível. Usei o modelo determinístico. ${aiError}`}</span>
                  </p>
                )}
                {!aiResult && !aiError && copySource === "deterministic" && (
                  <p className="mt-2 text-[10px] text-gray-500">
                    Sem IA, usamos um gerador determinístico baseado nos cards.
                  </p>
                )}
                {aiSuggestionNotes.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {aiSuggestionNotes.slice(0, 3).map((note, index) => (
                      <div key={index} className="rounded-lg border border-royal-100 bg-white px-3 py-2 text-[10px] text-gray-600">
                        {note}
                      </div>
                    ))}
                  </div>
                )}
                {displayGenerated && (
                  <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Copy por canal
                      </p>
                      <CopyButton
                        text={
                          copyChannelTab === "whatsapp"
                            ? displayGenerated.whatsapp
                            : copyChannelTab === "instagram"
                            ? displayGenerated.instagram
                            : copyChannelTab === "quick"
                            ? quickProductText
                            : copyChannelTab === "stories"
                            ? displayGenerated.stories.map((story, index) => `Story ${index + 1}\n${story.headline}\n${story.sub}\n${story.ctaMain ?? ""}`).join("\n\n")
                            : displayGenerated.carousel.map((slide) => `Slide ${slide.index}\n${slide.title}\n${slide.body}`).join("\n\n")
                        }
                        copyKey={`assistant-${copyChannelTab}`}
                        copied={copied}
                        onCopy={handleCopy}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-gray-50 p-1">
                      {([
                        ["whatsapp", "WhatsApp"],
                        ["instagram", "Legenda Instagram"],
                        ["stories", "Stories"],
                        ["carousel", "Carrossel"],
                        ["quick", "Story WhatsApp"],
                      ] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCopyChannelTab(key)}
                          className={cn(
                            "rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                            copyChannelTab === key ? "bg-navy-900 text-white" : "text-gray-500 hover:bg-white hover:text-navy-900"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {copyChannelTab === "whatsapp" && (
                      <textarea
                        rows={7}
                        className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                        value={channelCopy.whatsapp || displayGenerated.whatsapp}
                        onChange={(e) => setChannelCopy((prev) => ({ ...prev, whatsapp: e.target.value }))}
                        placeholder="Texto WhatsApp"
                      />
                    )}
                    {copyChannelTab === "instagram" && (
                      <textarea
                        rows={7}
                        className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                        value={channelCopy.instagram || displayGenerated.instagram}
                        onChange={(e) => setChannelCopy((prev) => ({ ...prev, instagram: e.target.value }))}
                        placeholder="Legenda Instagram"
                      />
                    )}
                    {copyChannelTab === "quick" && (
                      <textarea
                        rows={7}
                        readOnly
                        className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-navy-900 outline-none"
                        value={quickProductText}
                      />
                    )}
                    {copyChannelTab === "stories" && (
                      <div className="mt-3 space-y-2">
                        {displayGenerated.stories.map((story, index) => (
                          <details key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-2" open={index === 0}>
                            <summary className="cursor-pointer text-xs font-semibold text-navy-900">Story {index + 1}</summary>
                            <div className="mt-2 grid gap-2">
                              <input
                                className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.storyHeadlines[index] || story.headline}
                                onChange={(e) => setChannelCopy((prev) => {
                                  const headlines = [...prev.storyHeadlines] as [string, string, string]
                                  headlines[index] = e.target.value
                                  return { ...prev, storyHeadlines: headlines }
                                })}
                                placeholder={`Headline Story ${index + 1}`}
                              />
                              <input
                                className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.storySubtitles[index] || story.sub}
                                onChange={(e) => setChannelCopy((prev) => {
                                  const subtitles = [...prev.storySubtitles] as [string, string, string]
                                  subtitles[index] = e.target.value
                                  return { ...prev, storySubtitles: subtitles }
                                })}
                                placeholder={`Subtítulo Story ${index + 1}`}
                              />
                              {index === 2 && (
                                <input
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                  value={channelCopy.storyCta || story.ctaMain || ""}
                                  onChange={(e) => setChannelCopy((prev) => ({ ...prev, storyCta: e.target.value }))}
                                  placeholder="CTA Story 3"
                                />
                              )}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                    {copyChannelTab === "carousel" && (
                      <div className="mt-3 space-y-2">
                        {displayGenerated.carousel.map((slide, index) => (
                          <details key={slide.index} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                            <summary className="cursor-pointer text-xs font-semibold text-navy-900">Slide {index + 1}</summary>
                            <div className="mt-2 grid gap-2">
                              <input
                                className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.carouselTitles[index] || slide.title}
                                onChange={(e) => setChannelCopy((prev) => {
                                  const titles = [...prev.carouselTitles]
                                  titles[index] = e.target.value
                                  return { ...prev, carouselTitles: titles }
                                })}
                                placeholder={`Título slide ${index + 1}`}
                              />
                              <textarea
                                rows={2}
                                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.carouselBodies[index] || slide.body}
                                onChange={(e) => setChannelCopy((prev) => {
                                  const bodies = [...prev.carouselBodies]
                                  bodies[index] = e.target.value
                                  return { ...prev, carouselBodies: bodies }
                                })}
                                placeholder={`Texto slide ${index + 1}`}
                              />
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto">
          <header className="border-b border-gray-100 bg-white px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-navy-900">Preview</h2>
                <p className="text-[10px] text-gray-500">Visual e textos prontos para revisar.</p>
              </div>
              {displayGenerated && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    aiSource === "ai"
                      ? "bg-royal-100 text-royal-600"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  {aiSource === "ai" ? (
                    <>
                      <Sparkles className="w-3 h-3" />
                      IA
                    </>
                  ) : (
                    <>Template</>
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "stories", label: "Stories", icon: Smartphone },
                { key: "carousel", label: "Carrossel", icon: Layers },
                { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                { key: "instagram", label: "Legenda", icon: Megaphone },
                { key: "quick", label: "Story WhatsApp", icon: Copy },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setOutputTab(key as OutputTab)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  outputTab === key
                    ? "bg-navy-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
            </div>
          </header>

          <div>
            {drafts.length === 0 ? (
              <PreviewEmptyState
                loading={loadingProducts}
                error={errorProducts}
                productsCount={products.length}
              />
            ) : !displayGenerated ? null : (
              <>
                {displayGenerated.warnings.filter((w) => !w.startsWith("IA:") && !w.startsWith("Ângulo sugerido:")).length > 0 && (
                  <div className="border-b border-warning-500/20 bg-warning-100/30 px-5 py-2.5">
                    <ul className="space-y-1">
                      {displayGenerated.warnings.filter((w) => !w.startsWith("IA:") && !w.startsWith("Ângulo sugerido:")).map((w, i) => (
                        <li
                          key={i}
                          className="text-[10px] text-warning-500 inline-flex items-start gap-1.5"
                        >
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {outputTab === "stories" && (
                  <div className="bg-gradient-to-b from-gray-50 to-white p-5 lg:p-6 space-y-5">
                    <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-gray-500">
                      <span>
                        Preview 9:16 — escala 20%
                        {drafts.length > 1 && ` · ${drafts.length} produtos — vitrine no story 1`}
                      </span>
                      <span>Sem chrome do Instagram</span>
                    </div>
                    <div className="flex flex-wrap gap-5">
                      {displayGenerated.stories.map((story, i) => (
                        <div key={i} className="flex flex-col gap-2">
                          <StoryCanvas
                            story={story}
                            index={i}
                            exportRef={(el) => { storyExportRefs.current[i] = el }}
                          />
                          <button
                            type="button"
                            onClick={() => exportStory(i)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:border-gray-300 hover:text-navy-900 transition-colors"
                          >
                            {canMobileShare ? <Share2 className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                            {canMobileShare ? `Compartilhar Story ${i + 1}` : `Exportar Story ${i + 1}`}
                          </button>
                        </div>
                      ))}
                    </div>
                    <ExportNote />
                  </div>
                )}

                {outputTab === "carousel" && (
                  <div className="p-5 lg:p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500">
                        Carrossel 4:5 — {displayGenerated.carousel.length} slides — escala 20%
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      {displayGenerated.carousel.map((slide) => (
                        <div key={slide.index} className="flex flex-col gap-2">
                          <CarouselCanvas slide={slide} />
                          <CopyButton
                            text={slide.title + (slide.body ? "\n\n" + slide.body : "")}
                            copyKey={`carousel-${slide.index}`}
                            copied={copied}
                            onCopy={handleCopy}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-100 pt-4 space-y-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500">
                        Textos dos slides
                      </p>
                      {displayGenerated.carousel.map((slide) => (
                        <div
                          key={slide.index}
                          className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3.5"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#FDECE4] text-xs font-bold text-[#A23E18]">
                            {slide.index}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-navy-900 mb-0.5">{slide.title}</div>
                            {slide.body && (
                              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-gray-700">
                                {slide.body}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {outputTab === "whatsapp" && (
                  <OutputBlock
                    title={`Texto para WhatsApp · ${copySource === "ai" ? "Gerado por IA" : "Gerado por template"}`}
                    text={displayGenerated.whatsapp}
                    copyKey="whatsapp"
                    copied={copied}
                    onCopy={handleCopy}
                  />
                )}

                {outputTab === "instagram" && (
                  <OutputBlock
                    title={`Legenda para Instagram · ${copySource === "ai" ? "Gerado por IA" : "Gerado por template"}`}
                    text={displayGenerated.instagram}
                    copyKey="instagram"
                    copied={copied}
                    onCopy={handleCopy}
                  />
                )}

                {outputTab === "quick" && (
                  <OutputBlock
                    title="Story WhatsApp / texto rápido por produto"
                    text={quickProductText}
                    copyKey="quick"
                    copied={copied}
                    onCopy={handleCopy}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </div>
  )
}

function FieldInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-gray-600">{label}</label>
      <input
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-900 placeholder-gray-400 outline-none transition-colors focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function FieldTextarea({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-gray-600">{label}</label>
      <textarea
        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-900 placeholder-gray-400 outline-none transition-colors focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </div>
  )
}

function ProductLoadingSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando estoque…
      </div>
    </div>
  )
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-danger-500/30 bg-danger-100/40 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-danger-500">Não foi possível carregar o estoque.</p>
          <p className="mt-0.5 text-xs text-gray-600">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-danger-500/40 bg-white px-3 py-1.5 text-xs font-medium text-danger-500 hover:bg-danger-100/60"
          >
            <RefreshCw className="h-3 w-3" />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyProductsBlock() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center">
      <Package className="mx-auto h-5 w-5 text-gray-400" />
      <p className="mt-2 text-xs font-medium text-navy-900">Nenhum produto disponível no estoque.</p>
      <p className="mt-1 text-[11px] text-gray-500">
        Itens vendidos, reservados ou em reparo não aparecem aqui.
      </p>
    </div>
  )
}

function PreviewEmptyState({
  loading,
  error,
  productsCount,
}: {
  loading: boolean
  error: string | null
  productsCount: number
}) {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FDECE4] text-[#D85A30]">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-navy-900">Selecione produto(s) para gerar o conteúdo.</p>
      <p className="max-w-sm text-xs text-gray-500">
        {loading
          ? "Carregando estoque disponível…"
          : error
          ? "Resolva o erro acima e tente novamente."
          : productsCount === 0
          ? "Ainda não há produtos disponíveis para divulgar."
          : "Adicione um ou mais produtos. Cada card editável controla preço de divulgação, parcelamento, brindes e observações."}
      </p>
    </div>
  )
}

function OutputBlock({
  title,
  text,
  copyKey,
  copied,
  onCopy,
}: {
  title: string
  text: string
  copyKey: string
  copied: CopiedKey
  onCopy: (key: string, text: string) => void
}) {
  return (
    <div className="p-5 lg:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500">{title}</p>
        <CopyButton text={text} copyKey={copyKey} copied={copied} onCopy={onCopy} />
      </div>
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-navy-900">
          {text}
        </pre>
      </div>
    </div>
  )
}

function ExportNote() {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
      <p className="text-[11px] leading-relaxed text-gray-600">
        <span className="font-medium text-navy-900">Exportação:</span> o botão exporta o preview via
        html2canvas. Para 1080×1920 profissional, renderização server-side fica para V2. Os textos
        refletem apenas dados reais do estoque.
      </p>
    </div>
  )
}
