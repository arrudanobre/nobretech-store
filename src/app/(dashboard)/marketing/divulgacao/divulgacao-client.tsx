"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Crown,
  Download,
  Layers,
  Loader2,
  Maximize2,
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
  X,
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
  type StoryVariant,
  type ToneKey,
  type UrgencyLevel,
} from "@/lib/marketing/copy-generator"
import type { StoryPngResult } from "@/lib/marketing/story-renderer/story-png"
import {
  SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE,
  batteryDisplayForMarketingProduct,
  calculateSupplierOfferMargin,
  getSupplierOfferSelectorSummary,
  matchesSupplierOfferSearch,
  normalizeMarketingSearchText,
  supplierOfferCampaignDefaults,
  supplierOfferConditionLabel,
  supplierOfferNeedsDisclosurePrice,
} from "@/lib/marketing/supplier-offer-mapper"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketingSuggestion {
  id: string
  name: string
  category: string
  brand: string | null
  suggested_price: number | null
  quantity: number
  lastPromotedAt: string | null
  daysSincePromoted: number | null
}

const STORY_VARIANT_LABELS: Record<StoryVariant, { label: string; emoji: string; desc: string }> = {
  classic:   { label: "Clássico",         emoji: "⬛", desc: "Cards escuros, laranja — padrão Nobretech" },
  destaque:  { label: "Destaque Pesado",  emoji: "🔥", desc: "Produto herói no primeiro story; demais seguem em vitrine segura" },
  relampago: { label: "Oferta Relâmpago", emoji: "⚡", desc: "Condição especial com acento vermelho, sem visual de liquidação" },
  premium:   { label: "Premium",          emoji: "✨", desc: "Espaçoso, elegante, nomes em creme" },
  mosaico:   { label: "Mosaico 2×2",      emoji: "🔲", desc: "Catálogo premium para 3 ou 4 produtos; cai para Premium quando não couber" },
}

function applySafeStoryVariant(stories: StoryData[], variant: StoryVariant): StoryData[] {
  if (variant === "classic") return stories.map((story) => ({ ...story, variant: "classic" }))
  if (variant === "destaque") {
    return stories.map((story, index) => ({
      ...story,
      variant: index === 0 ? "destaque" : "premium",
    }))
  }
  if (variant === "mosaico") {
    const vitrineStories = stories.filter((story) => story.kind === "vitrine")
    const allProducts = vitrineStories.flatMap((story) => story.vitrineProducts ?? [])
    if (allProducts.length >= 3 && allProducts.length <= 4 && vitrineStories[0]) {
      return [
        {
          ...vitrineStories[0],
          label: "Mosaico",
          pageInfo: { page: 1, total: 1 },
          vitrineProducts: allProducts,
          variant: "mosaico",
        },
        ...stories.filter((story) => story.kind !== "vitrine").map((story) => ({ ...story, variant: "premium" as const })),
      ]
    }
    return stories.map((story) => ({ ...story, variant: "mosaico" }))
  }
  return stories.map((story) => ({ ...story, variant }))
}

type OutputTab = "stories" | "carousel" | "whatsapp" | "instagram" | "quick"
type CopyChannelTab = "whatsapp" | "instagram" | "stories" | "carousel" | "quick"
type CopiedKey = string | null
type CopySource = "deterministic" | "ai"

interface QuickProductCopy {
  productId: string
  title: string
  text: string
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "unavailable"

interface LoadedDisclosureSession {
  id: string
  strategy: Partial<GeneralStrategy>
  source: CopySource
  products: Array<{
    productId: string | null
    sourceType?: "inventory" | "supplier_offer"
    supplierOfferId?: string | null
    supplierOffer?: MarketingProduct | null
    isPrimary: boolean
    isFeatured: boolean
    basePrice: number | null
    disclosurePrice: number | null
    installmentCount: number
    gifts: string
    warrantyLabel: string
    warrantySource: "inventory" | "manual" | null
    productNote: string
    productCta: string
    copy: {
      title?: unknown
      description?: unknown
      strongPoint?: unknown
      objection?: unknown
    }
  }>
  outputs: Record<string, { text: string; json: Record<string, unknown> | null; source: string }>
  createdAt: string
  updatedAt: string
}

interface ChannelCopyDraft {
  /** Dynamic — length follows generated.stories.length. */
  storyHeadlines: string[]
  storySubtitles: string[]
  storyCtas: string[]
  whatsapp: string
  instagram: string
  carouselTitles: string[]
  carouselBodies: string[]
}

function emptyChannelCopyDraft(): ChannelCopyDraft {
  return {
    storyHeadlines: [],
    storySubtitles: [],
    storyCtas: [],
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

// ─── Story canvas (PNG-based — same image for preview, modal and export) ─────

function StoryCanvas({
  story,
  index,
  pngUrl,
  scale = 0.16,
  showLabel = true,
}: {
  story: StoryData
  index: number
  pngUrl: string | null
  scale?: number
  showLabel?: boolean
}) {
  const pw = Math.round(1080 * scale)
  const ph = Math.round(1920 * scale)
  return (
    <div className="flex flex-col items-center gap-2">
      {showLabel && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Story {index + 1} — {story.label}
        </span>
      )}
      <div
        style={{
          borderRadius: 16,
          border: "3px solid #1a1a1a",
          overflow: "hidden",
          flexShrink: 0,
          width: pw,
          height: ph,
          background: "#0d0d0d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 30px -10px rgba(13,27,46,0.25)",
        }}
      >
        {pngUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pngUrl}
            width={pw}
            height={ph}
            alt={`Story ${index + 1}: ${story.label}`}
            style={{ display: "block" }}
            draggable={false}
          />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
        )}
      </div>
    </div>
  )
}

// Legacy constants kept for reference; actual rendering now in story-artboard.tsx.
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

type ProductSourceTab = "inventory" | "supplier_offer"

function ProductSelector({
  products,
  supplierOfferProducts,
  selectedIds,
  onAdd,
}: {
  products: MarketingProduct[]
  supplierOfferProducts: MarketingProduct[]
  selectedIds: Set<string>
  onAdd: (p: MarketingProduct) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [sourceTab, setSourceTab] = useState<ProductSourceTab>("inventory")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const containerRef = useRef<HTMLDivElement>(null)

  const activeList = sourceTab === "inventory" ? products : supplierOfferProducts
  const supplierOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>()
    for (const product of supplierOfferProducts) {
      const label = product.supplierName || "Sem fornecedor"
      const key = product.supplierId || normalizeMarketingSearchText(label) || "sem-fornecedor"
      const current = map.get(key)
      if (current) current.count += 1
      else map.set(key, { key, label, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  }, [supplierOfferProducts])

  const filtered = useMemo(() => {
    const available = activeList.filter((p) => !selectedIds.has(p.id))
    const supplierScoped = sourceTab === "supplier_offer" && supplierFilter !== "all"
      ? available.filter((product) => (product.supplierId || normalizeMarketingSearchText(product.supplierName) || "sem-fornecedor") === supplierFilter)
      : available

    if (!query.trim()) return supplierScoped.slice(0, sourceTab === "supplier_offer" ? 200 : 30)
    const normalizedQuery = normalizeMarketingSearchText(query)
    const filteredList = sourceTab === "supplier_offer"
      ? supplierScoped.filter((product) => matchesSupplierOfferSearch(product, normalizedQuery))
      : supplierScoped.filter((p) => {
        const haystack = normalizeMarketingSearchText([p.name, p.category, p.storage, p.color, p.grade].filter(Boolean).join(" "))
        return normalizedQuery.split(" ").filter(Boolean).every((token) => haystack.includes(token))
      })

    return filteredList.slice(0, sourceTab === "supplier_offer" ? 200 : 30)
  }, [activeList, query, selectedIds, sourceTab, supplierFilter])

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
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Source tabs */}
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors", sourceTab === "inventory" ? "bg-navy-900 text-white rounded-tl-xl" : "text-gray-500 hover:bg-gray-50 rounded-tl-xl")}
              onClick={(e) => { e.stopPropagation(); setSourceTab("inventory") }}
            >
              Estoque Nobretech
            </button>
            <button
              type="button"
              className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors", sourceTab === "supplier_offer" ? "bg-navy-900 text-white rounded-tr-xl" : "text-gray-500 hover:bg-gray-50 rounded-tr-xl")}
              onClick={(e) => { e.stopPropagation(); setSourceTab("supplier_offer") }}
            >
              Ofertas de fornecedor {supplierOfferProducts.length > 0 ? `(${supplierOfferProducts.length})` : ""}
            </button>
          </div>

          {sourceTab === "supplier_offer" && supplierOptions.length > 0 ? (
            <div className="border-b border-gray-100 bg-gray-50/70 px-3 py-2">
              <label className="flex items-center gap-2 text-[11px] font-medium text-gray-500">
                Fornecedor
                <select
                  className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-navy-900 outline-none focus:border-royal-500"
                  value={supplierFilter}
                  onChange={(event) => setSupplierFilter(event.target.value)}
                >
                  <option value="all">Todos fornecedores ({supplierOfferProducts.length})</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.key} value={supplier.key}>
                      {supplier.label} ({supplier.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-500">
                {activeList.filter((p) => !selectedIds.has(p.id)).length === 0
                  ? "Todos os produtos já foram adicionados."
                  : sourceTab === "supplier_offer"
                    ? query.trim()
                      ? `Nenhuma oferta disponível encontrada para “${query.trim()}”. Verifique se as ofertas desse fornecedor estão disponíveis ou se foram substituídas.`
                      : "Nenhuma oferta disponível. Importe ofertas em Fornecedores → Ofertas."
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-navy-900 leading-tight">{p.name}</div>
                  </div>
                  {p.sourceType === "supplier_offer" ? (() => {
                    const s = getSupplierOfferSelectorSummary(p)
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600">
                          {s.conditionLabel}
                        </span>
                        {s.battery != null && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-royal-100 text-royal-600">
                            Bat. {s.battery}%
                          </span>
                        )}
                        {s.warrantyLabel && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700">
                            {s.warrantyLabel}
                          </span>
                        )}
                        <span className="text-[10px] font-medium text-gray-600">
                          Custo: {s.supplierPrice != null ? formatBRL(s.supplierPrice) : "não informado"}
                        </span>
                        <span className="text-[10px] text-gray-400">·</span>
                        <span className="text-[10px] font-medium text-gray-600">
                          {s.hasSuggestion ? `Sugestão: ${formatBRL(s.suggestedPrice as number)}` : "Sem preço de divulgação"}
                        </span>
                        {s.supplierName && (
                          <>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-[10px] font-medium text-blue-600">{s.supplierName}</span>
                          </>
                        )}
                      </div>
                    )
                  })() : (
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
                  )}
                </button>
              ))
            )}
          </div>
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
  const isSupplierOffer = product.sourceType === "supplier_offer"
  const basePrice = isSupplierOffer
    ? parseBRLInput(state.basePriceText) ?? product.supplierPrice ?? null
    : parseBRLInput(state.basePriceText) ?? product.suggested_price
  const disclosurePrice = isSupplierOffer
    ? parseBRLInput(state.disclosurePriceText)
    : parseBRLInput(state.disclosurePriceText) ?? basePrice
  const discount = isSupplierOffer ? null : calculateDiscount(basePrice, disclosurePrice)

  // Editable internal cost (defaults to supplierPrice). Margin reacts to edits.
  const supplierCost = isSupplierOffer ? basePrice : null
  const supplierMargin = calculateSupplierOfferMargin(supplierCost, disclosurePrice)
  const batteryMode = batteryDisplayForMarketingProduct(product)
  const conditionLabel = supplierOfferConditionLabel(product.condition)
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
  if (!isSupplierOffer && product.grade) headerSummary.push(product.grade)
  if (batteryMode === "value" && product.battery_health != null) headerSummary.push(`Bat. ${product.battery_health}%`)
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
            {isSupplierOffer && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-600" title="Produto de fornecedor — não está no estoque Nobretech">
                Fornecedor {product.supplierName ? `· ${product.supplierName}` : ""}
              </span>
            )}
            {isSupplierOffer && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  product.condition === "sealed"
                    ? "bg-emerald-50 text-emerald-700"
                    : product.condition === "used"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-gray-100 text-gray-500"
                )}
              >
                {conditionLabel}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-lg font-bold leading-tight tracking-tight text-navy-900">{product.name}</h3>
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
            {isSupplierOffer && batteryMode === "missing" && (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                Bateria não informada
              </span>
            )}
          </div>

          {isSupplierOffer ? (
            <>
              <div className="mt-4 grid gap-2 grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400">Custo fornecedor</p>
                  <p className="mt-1 truncate text-sm font-bold leading-tight text-navy-900" title={supplierCost != null ? formatBRL(supplierCost) : "não informado"}>
                    {supplierCost != null ? formatBRL(supplierCost) : "não informado"}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-[#F0A080] bg-[#FFF7F3] px-3 py-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#A23E18]">Divulgação</p>
                  {disclosurePrice != null ? (
                    <p className="mt-1 truncate text-sm font-black leading-tight text-[#D85A30]" title={formatBRL(disclosurePrice)}>
                      {formatBRL(disclosurePrice)}
                    </p>
                  ) : (
                    <p className="mt-1 truncate text-xs font-semibold leading-tight text-[#A23E18]">Defina o preço</p>
                  )}
                </div>
                <div
                  className={cn(
                    "min-w-0 rounded-xl border px-3 py-2",
                    supplierMargin.status === "risk"
                      ? "border-danger-200 bg-danger-50"
                      : "border-gray-100 bg-gray-50/70"
                  )}
                >
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400">Margem estimada</p>
                  <p
                    className={cn(
                      "mt-1 truncate text-sm font-bold leading-tight",
                      supplierMargin.status === "risk"
                        ? "text-danger-600"
                        : supplierMargin.status === "ok"
                          ? "text-success-600"
                          : "text-gray-500"
                    )}
                    title={supplierMargin.value != null ? formatBRL(supplierMargin.value) : "—"}
                  >
                    {supplierMargin.value != null ? formatBRL(supplierMargin.value) : "—"}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400">Pagamento</p>
                  <p className="mt-1 truncate text-sm font-bold leading-tight text-navy-900" title={installment?.text ?? "À vista"}>
                    {installment?.text ?? "À vista"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                {supplierMargin.status === "risk" ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-danger-600">
                    <AlertTriangle className="h-3 w-3" />
                    Preço de divulgação abaixo do custo fornecedor
                  </span>
                ) : supplierMargin.status === "ok" ? (
                  <span className="font-semibold text-success-600">
                    Margem estimada {formatBRL(supplierMargin.value as number)} · simulação comercial
                  </span>
                ) : (
                  <span className="text-gray-500">Defina custo e preço de divulgação para estimar a margem.</span>
                )}
                {product.internalGrade && (
                  <span className="text-gray-400">Grade interno: {product.internalGrade}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preço padrão</p>
                  <p className="mt-1 break-all text-sm font-bold leading-tight text-navy-900">{basePrice != null ? formatBRL(basePrice) : "A confirmar"}</p>
                </div>
                <div className="rounded-xl border border-[#F0A080] bg-[#FFF7F3] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A23E18]">Divulgação</p>
                  <p className="mt-1 break-all text-sm font-black leading-tight text-[#D85A30]">{disclosurePrice != null ? formatBRL(disclosurePrice) : "A confirmar"}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 min-[520px]:col-span-2 xl:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Parcelamento</p>
                  <p className="mt-1 break-all text-sm font-bold leading-tight text-navy-900">{installment?.text ?? "Sem parcelamento"}</p>
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
            </>
          )}
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
              {isSupplierOffer ? "Custo fornecedor" : "Preço padrão"}
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
              {isSupplierOffer
                ? `Custo informado pelo fornecedor: ${product.supplierPrice != null ? formatBRL(product.supplierPrice) : "—"}`
                : `Padrão: ${product.suggested_price != null ? formatBRL(product.suggested_price) : "—"}`}
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
            {isSupplierOffer ? (
              supplierMargin.status === "risk" ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-danger-600">
                  <AlertTriangle className="h-3 w-3" /> Abaixo do custo fornecedor
                </p>
              ) : supplierMargin.status === "ok" ? (
                <p className="mt-1 text-[10px] font-semibold text-success-600">
                  Margem estimada: {formatBRL(supplierMargin.value as number)}
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-gray-500">Defina o preço para estimar a margem.</p>
              )
            ) : discount ? (
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

function buildQuickProductCopies(facts: ReturnType<typeof buildProductFacts>[]): QuickProductCopy[] {
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
      if (f.productNote) lines.push(`📝 ${f.productNote}`)
      if (f.quantity <= 1) lines.push("⚡ 1 unidade disponível")
      if (f.productCta) lines.push(f.productCta)
      return {
        productId: f.id,
        title: name.join(" "),
        text: lines.join("\n"),
      }
    })
}

function buildQuickProductText(facts: ReturnType<typeof buildProductFacts>[]): string {
  return buildQuickProductCopies(facts)
    .map((item) => item.text)
    .join("\n\n")
}

// ─── Main client component ───────────────────────────────────────────────────

export function DivulgacaoClient() {
  const [products, setProducts] = useState<MarketingProduct[]>([])
  const [supplierOfferProducts, setSupplierOfferProducts] = useState<MarketingProduct[]>([])
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
  // null = use smart default; true/false = user override.
  const [addHighlightStory, setAddHighlightStory] = useState<boolean | null>(null)
  const [addCtaStory, setAddCtaStory] = useState<boolean | null>(null)
  const [ctaVariationSeed, setCtaVariationSeed] = useState(0)

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
  const [exportingStoryIndex, setExportingStoryIndex] = useState<number | null>(null)
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [loadedDisclosure, setLoadedDisclosure] = useState<LoadedDisclosureSession | null>(null)
  const [reuseSuggestion, setReuseSuggestion] = useState<LoadedDisclosureSession | null>(null)

  // Story template variant
  const [storyVariant, setStoryVariant] = useState<StoryVariant>("classic")

  // Smart product suggestions (loaded on mount, no AI tokens)
  const [suggestions, setSuggestions] = useState<MarketingSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)

  // PNG results: one per story. Rebuilt whenever displayGenerated changes.
  const [storyPngResults, setStoryPngResults] = useState<(StoryPngResult | null)[]>([])
  const storyPngUrlsRef = useRef<string[]>([])
  const exportingStoryRef = useRef(false)
  const skipStrategyResetRef = useRef(false)
  const strategyDirtyReadyRef = useRef(false)

  const resetGeneratedCopy = useCallback(() => {
    setAIResult(null)
    setAISource("deterministic")
    setCopySource("deterministic")
    setAIError(null)
    setAISuggestionNotes([])
    setCampaignAngle(null)
    setChannelCopy(emptyChannelCopyDraft())
  }, [])

  const markUnsaved = useCallback(() => {
    setSaveStatus((current) => current === "saving" ? current : "dirty")
    setLastSavedAt(null)
  }, [])

  const productsById = useMemo(() => {
    const map = new Map<string, MarketingProduct>()
    products.forEach((p) => map.set(p.id, p))
    supplierOfferProducts.forEach((p) => map.set(p.id, p))
    return map
  }, [products, supplierOfferProducts])

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

  const loadSupplierOfferProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/supplier-offer-products", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && Array.isArray(body?.data)) {
        setSupplierOfferProducts(body.data as MarketingProduct[])
      }
    } catch {
      // non-critical — supplier offers are additive, inventory still works
    }
  }, [])

  useEffect(() => {
    loadSupplierOfferProducts()
  }, [loadSupplierOfferProducts])

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true)
    try {
      const res = await fetch("/api/marketing/suggestions", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && Array.isArray(body?.data)) {
        setSuggestions(body.data)
      }
    } catch {
      // suggestions are non-critical — fail silently
    } finally {
      setSuggestionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  // Close the expanded preview with ESC.
  useEffect(() => {
    if (!previewModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewModalOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [previewModalOpen])

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
    markUnsaved()
    setDraftStates((prev) => {
      if (prev.some((d) => d.productId === p.id)) return prev
      const isFirst = prev.length === 0
      const { baseSeed, disclosureSeed } = supplierOfferCampaignDefaults(p)
      const next: EditableDraftState = {
        productId: p.id,
        isPrimary: isFirst,
        isFeatured: false,
        basePriceText:
          baseSeed != null ? formatBRLInputValue(baseSeed) : "",
        disclosurePriceText:
          disclosureSeed != null ? formatBRLInputValue(disclosureSeed) : "",
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
    fetch(`/api/marketing/disclosure-sessions/last?inventory_id=${encodeURIComponent(p.id)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (body?.data) {
          setReuseSuggestion(body.data as LoadedDisclosureSession)
          setDraftMessage("Este produto já teve divulgação anterior. Você pode reaproveitar preço e textos se fizer sentido.")
        }
      })
      .catch(() => undefined)
  }, [markUnsaved, resetGeneratedCopy])

  const updateDraft = useCallback((id: string, patch: Partial<EditableDraftState>) => {
    if (Object.keys(patch).some((key) => key !== "expanded")) {
      resetGeneratedCopy()
      markUnsaved()
    }
    setDraftStates((prev) => prev.map((d) => (d.productId === id ? { ...d, ...patch } : d)))
  }, [markUnsaved, resetGeneratedCopy])

  const removeDraft = useCallback((id: string) => {
    resetGeneratedCopy()
    markUnsaved()
    setDraftStates((prev) => {
      const wasPrimary = prev.find((d) => d.productId === id)?.isPrimary
      const next = prev.filter((d) => d.productId !== id)
      if (wasPrimary && next.length > 0 && !next.some((d) => d.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true }
      }
      return next
    })
  }, [markUnsaved, resetGeneratedCopy])

  const makePrimary = useCallback((id: string) => {
    resetGeneratedCopy()
    markUnsaved()
    setDraftStates((prev) => prev.map((d) => ({ ...d, isPrimary: d.productId === id })))
  }, [markUnsaved, resetGeneratedCopy])

  const toggleFeatured = useCallback((id: string) => {
    resetGeneratedCopy()
    markUnsaved()
    setDraftStates((prev) => prev.map((d) => (d.productId === id ? { ...d, isFeatured: !d.isFeatured } : d)))
  }, [markUnsaved, resetGeneratedCopy])

  const drafts = useMemo<ProductDraft[]>(() => {
    return draftStates
      .map<ProductDraft | null>((s) => {
        const product = productsById.get(s.productId)
        if (!product) return null
        const isSupplierOffer = product.sourceType === "supplier_offer"
        // Supplier offer: base = internal cost (supplierPrice). Disclosure has
        // NO fallback to base — an empty price must stay null so the story is
        // blocked and supplierPrice never leaks as the public price.
        const basePrice = isSupplierOffer
          ? parseBRLInput(s.basePriceText) ?? product.supplierPrice ?? null
          : parseBRLInput(s.basePriceText) ?? product.suggested_price
        const disclosurePrice = isSupplierOffer
          ? parseBRLInput(s.disclosurePriceText)
          : parseBRLInput(s.disclosurePriceText) ?? basePrice
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
      addHighlightStory,
      addCtaStory,
      ctaVariationSeed,
    }),
    [objective, channel, tone, urgencyLevel, generalCta, generalNote, angle, addHighlightStory, addCtaStory, ctaVariationSeed]
  )

  const deterministic = useMemo<GeneratedContent | null>(() => {
    if (drafts.length === 0) return null
    try {
      return generateContent(drafts, strategy)
    } catch {
      return null
    }
  }, [drafts, strategy])

  // Supplier offers must have a public disclosure price before any art is
  // produced. supplierPrice is internal cost and is never used as the public
  // price. Blocking here also blocks export and save (both depend on
  // displayGenerated being non-null).
  const supplierOfferPriceErrors = useMemo(
    () =>
      drafts
        .filter((d) => supplierOfferNeedsDisclosurePrice(d.product.sourceType, d.disclosurePrice))
        .map((d) => d.product.name),
    [drafts]
  )
  const blockedBySupplierPrice = supplierOfferPriceErrors.length > 0

  const generated = blockedBySupplierPrice ? null : aiResult ?? deterministic
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
        ctaMain:
          story.kind === "cta" && channelCopy.storyCtas[index]
            ? channelCopy.storyCtas[index]
            : story.ctaMain,
      })),
      carousel: generated.carousel.map((slide, index) => ({
        ...slide,
        title: channelCopy.carouselTitles[index] || slide.title,
        body: channelCopy.carouselBodies[index] || slide.body,
      })),
    }
  }, [channelCopy, generated])

  // Keep the selected story index inside bounds after regeneration.
  useEffect(() => {
    const n = displayGenerated?.stories.length ?? 0
    if (n > 0) setSelectedStoryIndex((v) => Math.min(v, n - 1))
  }, [displayGenerated])

  // Regenerate PNG previews whenever the effective stories or variant changes.
  useEffect(() => {
    storyPngUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    storyPngUrlsRef.current = []
    setStoryPngResults([])

    const stories = displayGenerated?.stories
    if (!stories || stories.length === 0) return

    const variantedStories = applySafeStoryVariant(stories, storyVariant)

    let cancelled = false
    import("@/lib/marketing/story-renderer/story-png")
      .then(({ renderStoriesToPng }) => renderStoriesToPng(variantedStories))
      .then((results) => {
        if (cancelled) {
          results.forEach((r) => r && URL.revokeObjectURL(r.url))
          return
        }
        storyPngUrlsRef.current = results.flatMap((r) => (r?.url ? [r.url] : []))
        setStoryPngResults(results)
      })
      .catch((err) => {
        console.error("[divulgacao] story PNG generation failed", err)
        if (!cancelled) setStoryPngResults(stories.map(() => null))
      })
    return () => { cancelled = true }
  }, [displayGenerated, storyVariant])

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => { storyPngUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])

  // Reset AI overlay when key inputs change
  useEffect(() => {
    if (skipStrategyResetRef.current) {
      skipStrategyResetRef.current = false
      return
    }
    if (!strategyDirtyReadyRef.current) {
      strategyDirtyReadyRef.current = true
      return
    }
    resetGeneratedCopy()
    markUnsaved()
  }, [objective, channel, tone, urgencyLevel, generalCta, generalNote, angle, addHighlightStory, addCtaStory, markUnsaved, resetGeneratedCopy])

  const facts = useMemo(() => drafts.map(buildProductFacts), [drafts])
  const selectedIds = useMemo(
    () => new Set(draftStates.map((s) => s.productId)),
    [draftStates]
  )
  const primaryFacts = facts.find((f) => f.isPrimary) ?? facts[0] ?? null
  const quickProductCopies = useMemo(() => buildQuickProductCopies(facts), [facts])
  const quickProductText = useMemo(() => buildQuickProductText(facts), [facts])

  const handleCopy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  const applyDisclosureSession = useCallback((session: LoadedDisclosureSession) => {
    // Supplier offers may no longer be in the live "available" list (sold,
    // superseded...). Rehydrate them from the snapshot the API returned so the
    // campaign reloads intact. Fornecedor/custo stay internal — public copy is
    // unaffected because it never reads supplierName/supplierPrice.
    const rehydratedOffers = session.products
      .map((item) => item.supplierOffer)
      .filter((p): p is MarketingProduct => Boolean(p && p.id))
    if (rehydratedOffers.length > 0) {
      setSupplierOfferProducts((prev) => {
        const known = new Set(prev.map((p) => p.id))
        const additions = rehydratedOffers.filter((p) => !known.has(p.id))
        return additions.length > 0 ? [...prev, ...additions] : prev
      })
    }

    const resolvable = new Set<string>(productsById.keys())
    rehydratedOffers.forEach((p) => resolvable.add(p.id))

    const nextDrafts = session.products
      .filter((item) => item.productId && resolvable.has(item.productId))
      .map<EditableDraftState>((item, index) => ({
        productId: item.productId as string,
        isPrimary: item.isPrimary || index === 0,
        isFeatured: item.isFeatured,
        basePriceText: formatBRLInputValue(item.basePrice),
        disclosurePriceText: formatBRLInputValue(item.disclosurePrice),
        installmentCount: Math.max(0, Math.min(18, item.installmentCount || 0)),
        gifts: item.gifts || "",
        warrantyLabel: item.warrantyLabel || "",
        warrantySource: item.warrantySource,
        copyTitle: typeof item.copy.title === "string" ? item.copy.title : "",
        copyDescription: typeof item.copy.description === "string" ? item.copy.description : "",
        copyStrongPoint: typeof item.copy.strongPoint === "string" ? item.copy.strongPoint : "",
        copyObjection: typeof item.copy.objection === "string" ? item.copy.objection : "",
        productNote: item.productNote || "",
        productCta: item.productCta || "",
        expanded: index === 0,
      }))

    if (nextDrafts.length === 0) {
      setDraftMessage("A última divulgação não tem produtos disponíveis no estoque atual.")
      return
    }

    if (!nextDrafts.some((draft) => draft.isPrimary)) {
      nextDrafts[0] = { ...nextDrafts[0], isPrimary: true }
    }

    skipStrategyResetRef.current = true
    if (session.strategy.objective) setObjective(session.strategy.objective as ObjectiveKey)
    if (session.strategy.channel) setChannel(session.strategy.channel as ChannelKey)
    if (session.strategy.tone) setTone(session.strategy.tone as ToneKey)
    if (session.strategy.urgencyLevel) setUrgencyLevel(session.strategy.urgencyLevel as UrgencyLevel)
    setAngle(session.strategy.angle ?? "")
    setGeneralCta(session.strategy.generalCta ?? "")
    setGeneralNote(session.strategy.generalNote ?? "")
    const sessionStrategy = session.strategy as Record<string, unknown>
    setAddHighlightStory(
      sessionStrategy.addHighlightStory === true || sessionStrategy.addHighlightStory === false
        ? (sessionStrategy.addHighlightStory as boolean)
        : null
    )
    setAddCtaStory(
      sessionStrategy.addCtaStory === true || sessionStrategy.addCtaStory === false
        ? (sessionStrategy.addCtaStory as boolean)
        : null
    )
    setDraftStates(nextDrafts)
    setLoadedDisclosure(session)
    setReuseSuggestion(null)
    setAISource(session.source)
    setCopySource(session.source)
    setAIResult(null)
    setCampaignAngle(null)
    setAISuggestionNotes([])
    setChannelCopy((prev) => ({
      ...prev,
      whatsapp: session.outputs.whatsapp?.text ?? "",
      instagram: session.outputs.instagram?.text ?? "",
      storyHeadlines: Array.isArray(session.outputs.stories?.json)
        ? session.outputs.stories.json.map((story) => typeof story === "object" && story && "headline" in story ? String(story.headline ?? "") : "")
        : prev.storyHeadlines,
      storySubtitles: Array.isArray(session.outputs.stories?.json)
        ? session.outputs.stories.json.map((story) => typeof story === "object" && story && "sub" in story ? String(story.sub ?? "") : "")
        : prev.storySubtitles,
      storyCtas: Array.isArray(session.outputs.stories?.json)
        ? session.outputs.stories.json.map((story) => typeof story === "object" && story && "ctaMain" in story ? String(story.ctaMain ?? "") : "")
        : prev.storyCtas,
      carouselTitles: Array.isArray(session.outputs.carousel?.json)
        ? session.outputs.carousel.json.map((slide) => typeof slide === "object" && slide && "title" in slide ? String(slide.title ?? "") : "")
        : prev.carouselTitles,
      carouselBodies: Array.isArray(session.outputs.carousel?.json)
        ? session.outputs.carousel.json.map((slide) => typeof slide === "object" && slide && "body" in slide ? String(slide.body ?? "") : "")
        : prev.carouselBodies,
    }))
    setSaveStatus("saved")
    setLastSavedAt(new Date(session.updatedAt))
    const changedPrices = session.products.some((item) => {
      if (!item.productId || item.basePrice == null) return false
      const current = productsById.get(item.productId)?.suggested_price
      return current != null && Math.abs(current - item.basePrice) >= 0.01
    })
    setDraftMessage(
      changedPrices
        ? "Última divulgação carregada. Preço atual do estoque mudou em ao menos um produto; confirme antes de publicar."
        : "Última divulgação carregada. Revise preços atuais antes de publicar."
    )
  }, [productsById])

  async function saveDisclosureDraft() {
    if (drafts.length === 0 || !displayGenerated) return
    setDraftSaving(true)
    setSaveStatus("saving")
    setDraftMessage(null)
    try {
      const quickByProduct = new Map(quickProductCopies.map((item) => [item.productId, item.text]))
      const payload = {
        strategy,
        source: copySource,
        products: facts.map((fact) => {
          const isSupplierOffer = productsById.get(fact.id)?.sourceType === "supplier_offer"
          return {
            productId: isSupplierOffer ? null : fact.id,
            supplierOfferId: isSupplierOffer ? fact.id : null,
            isPrimary: fact.isPrimary,
            isFeatured: fact.isFeatured,
            basePrice: fact.basePrice,
            disclosurePrice: fact.disclosurePrice,
            discountAmount: fact.discount?.amount ?? null,
            discountPercent: fact.discount?.percent ?? null,
            installmentCount: fact.installment?.count ?? 0,
            installmentAmount: fact.installment?.perInstallment ?? null,
            installmentTotal: fact.installment?.total ?? null,
            gifts: fact.gifts,
            warrantyLabel: fact.warrantyLabel,
            warrantySource: fact.warrantySource,
            productNote: fact.productNote,
            productCta: fact.productCta,
            copy: {
              title: fact.copyTitle,
              description: fact.copyDescription,
              strongPoint: fact.copyStrongPoint,
              objection: fact.copyObjection,
              productCta: fact.productCta,
              storyWhatsappText: quickByProduct.get(fact.id) ?? "",
            },
          }
        }),
        outputs: {
          whatsapp: { text: displayGenerated.whatsapp },
          instagram: { text: displayGenerated.instagram },
          quick: { text: quickProductText },
          stories: { json: displayGenerated.stories },
          carousel: { json: displayGenerated.carousel },
        },
      }
      const res = await fetch("/api/marketing/disclosure-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || body?.error) {
        setDraftMessage(body?.error?.message ?? "Não foi possível salvar o rascunho.")
        setSaveStatus(res.status === 503 ? "unavailable" : "error")
        return
      }
      const savedAt = new Date()
      setLastSavedAt(savedAt)
      setSaveStatus("saved")
      setDraftMessage(`Divulgação salva às ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`)
    } catch {
      setDraftMessage("Falha de conexão ao salvar o rascunho.")
      setSaveStatus("error")
    } finally {
      setDraftSaving(false)
    }
  }

  async function loadLastDisclosure() {
    if ((saveStatus === "dirty" || saveStatus === "error") && draftStates.length > 0) {
      const ok = window.confirm("Você tem alterações não salvas. Carregar a última divulgação vai substituir os dados atuais. Deseja continuar?")
      if (!ok) return
    }
    setDraftLoading(true)
    setDraftMessage(null)
    try {
      const res = await fetch("/api/marketing/disclosure-sessions/last", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok || body?.error) {
        setDraftMessage(body?.error?.message ?? "Não foi possível carregar a última divulgação.")
        return
      }
      if (!body?.data) {
        setDraftMessage("Nenhuma divulgação salva encontrada.")
        return
      }
      applyDisclosureSession(body.data as LoadedDisclosureSession)
    } catch {
      setDraftMessage("Falha de conexão ao carregar a última divulgação.")
    } finally {
      setDraftLoading(false)
    }
  }

  async function exportStory(index: number) {
    const result = storyPngResults[index]
    if (!result || exportingStoryRef.current) return
    exportingStoryRef.current = true
    setExportingStoryIndex(index)
    try {
      const fileName = `nobretech-story-${index + 1}.png`
      const file = new File([result.blob], fileName, { type: "image/png" })

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({ files: [file] })
        return
      }

      const url = URL.createObjectURL(result.blob)
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
      alert("Exportação falhou.")
    } finally {
      exportingStoryRef.current = false
      setExportingStoryIndex(null)
    }
  }

  async function generateWithAI() {
    if (drafts.length === 0) return
    if (blockedBySupplierPrice) {
      setAIError(SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE)
      return
    }
    setAILoading(true)
    setAIError(null)
    const historySummary = loadedDisclosure
      ? [
          `Última divulgação salva em ${new Date(loadedDisclosure.updatedAt).toLocaleDateString("pt-BR")}.`,
          loadedDisclosure.strategy.angle ? `Ângulo anterior: ${loadedDisclosure.strategy.angle}` : "",
          loadedDisclosure.outputs.whatsapp?.text ? `WhatsApp anterior: ${loadedDisclosure.outputs.whatsapp.text.slice(0, 500)}` : "",
          "Use histórico apenas como referência editorial; preços atuais vêm dos cards enviados agora.",
        ].filter(Boolean).join("\n")
      : ""
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
          historySummary,
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
          markUnsaved()
        }
        if (nextContent) {
          const storiesArr: Array<{ headline?: string; sub?: string; ctaMain?: string }> = Array.isArray(
            nextContent.stories
          )
            ? nextContent.stories
            : []
          setChannelCopy({
            storyHeadlines: storiesArr.map((s) => s?.headline || ""),
            storySubtitles: storiesArr.map((s) => s?.sub || ""),
            storyCtas: storiesArr.map((s) => s?.ctaMain || ""),
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
          const ctaStory = Array.isArray(nextContent?.stories)
            ? (nextContent.stories as Array<{ kind?: string; ctaMain?: string | null }>).find(
                (s) => s?.kind === "cta"
              )
            : undefined
          const suggestedCta = typeof ctaStory?.ctaMain === "string" ? ctaStory.ctaMain.trim() : ""
          if ((!angle.trim() && suggestedAngle) || (!generalCta.trim() && suggestedCta)) {
            skipStrategyResetRef.current = true
            if (!angle.trim() && suggestedAngle) setAngle(suggestedAngle)
            if (!generalCta.trim() && suggestedCta) setGeneralCta(suggestedCta)
          }
        }
        const offerAlerts = Array.isArray(body.data?.offerAlerts) ? body.data.offerAlerts : []
        setAISuggestionNotes(offerAlerts.length > 0 ? offerAlerts : Array.isArray(nextContent?.warnings) ? nextContent.warnings.filter((w: string) => w.startsWith("IA:")) : [])
        const appliedMessage = offerAlerts.find((note: string) => /IA aplicada/i.test(note))
        if (appliedMessage) setDraftMessage(appliedMessage)
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
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Salvando..."
      : saveStatus === "saved" && lastSavedAt
      ? `Salvo às ${lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : saveStatus === "error"
      ? "Erro ao salvar"
      : saveStatus === "unavailable"
      ? "Persistência indisponível: migration pendente"
      : "Não salvo"
  const saveStatusClass =
    saveStatus === "saved"
      ? "border-success-200 bg-success-100 text-success-700"
      : saveStatus === "error" || saveStatus === "unavailable"
      ? "border-danger-200 bg-danger-100 text-danger-600"
      : saveStatus === "saving"
      ? "border-royal-200 bg-royal-50 text-royal-700"
      : "border-gray-200 bg-white text-gray-600"

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-24 pt-6 lg:px-6 lg:pb-8 lg:pt-8">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", saveStatusClass)}>
            {saveStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveStatusLabel}
          </span>
          <button
            type="button"
            onClick={loadLastDisclosure}
            disabled={draftLoading || products.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:border-gray-300 hover:text-navy-900 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Carregar última
          </button>
          <button
            type="button"
            onClick={saveDisclosureDraft}
            disabled={draftSaving || drafts.length === 0 || !displayGenerated}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-gray-200"
          >
            {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar divulgação
          </button>
          {!loadingProducts && !errorProducts && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
              <Package className="h-3.5 w-3.5 text-royal-500" />
              {products.length} {products.length === 1 ? "produto disponível" : "produtos disponíveis"}
            </span>
          )}
        </div>
      </header>
      {draftMessage && (
        <div className="mt-4 rounded-xl border border-royal-100 bg-white px-4 py-3 text-xs text-gray-700 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{draftMessage}</span>
            {reuseSuggestion && (
              <button
                type="button"
                onClick={() => applyDisclosureSession(reuseSuggestion)}
                className="inline-flex items-center justify-center rounded-md border border-royal-200 bg-royal-50 px-3 py-1.5 text-xs font-semibold text-royal-700 hover:bg-royal-100"
              >
                Reaproveitar preço/textos
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,480px)]">
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
                  onClick={() => {
                    resetGeneratedCopy()
                    markUnsaved()
                    setDraftStates((prev) => [...prev].sort((a, b) => {
                      const ap = productsById.get(a.productId)
                      const bp = productsById.get(b.productId)
                      const ad = calculateDiscount(parseBRLInput(a.basePriceText) ?? ap?.suggested_price ?? null, parseBRLInput(a.disclosurePriceText) ?? ap?.suggested_price ?? null)
                      const bd = calculateDiscount(parseBRLInput(b.basePriceText) ?? bp?.suggested_price ?? null, parseBRLInput(b.disclosurePriceText) ?? bp?.suggested_price ?? null)
                      if (Boolean(ad) !== Boolean(bd)) return ad ? -1 : 1
                      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
                      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
                      return 0
                    }))
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Ordenar
                </button>
              </div>
            </header>
            <div className="p-5 space-y-3">
              {/* ── Sugestões inteligentes ── */}
              {!suggestionsDismissed && !suggestionsLoading && suggestions.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📡</span>
                      <span className="text-xs font-semibold text-amber-900">
                        Sugestões de hoje
                      </span>
                      <span className="text-[10px] text-amber-700 font-medium">
                        Eletrônicos sem divulgação recente
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuggestionsDismissed(true)}
                      className="text-amber-400 hover:text-amber-600 transition-colors"
                      title="Dispensar sugestões"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={selectedIds.has(s.id)}
                        onClick={() => {
                          const product = productsById.get(s.id)
                          if (product) addProduct(product)
                        }}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all",
                          selectedIds.has(s.id)
                            ? "border-green-200 bg-green-50 text-green-700 cursor-default"
                            : "border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50 text-gray-800 cursor-pointer"
                        )}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold block truncate">{s.name}</span>
                          <span className="text-gray-500">
                            {s.category}
                            {s.suggested_price != null
                              ? ` · R$ ${s.suggested_price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                              : ""}
                            {s.quantity > 1 ? ` · ${s.quantity} un.` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-medium">
                          {selectedIds.has(s.id) ? (
                            <span className="text-green-600">✓ Adicionado</span>
                          ) : s.lastPromotedAt == null ? (
                            <span className="text-amber-700 font-semibold">Nunca divulgado</span>
                          ) : (
                            <span className="text-gray-500">
                              {s.daysSincePromoted === 0
                                ? "Hoje"
                                : s.daysSincePromoted === 1
                                ? "Ontem"
                                : `${s.daysSincePromoted}d atrás`}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    supplierOfferProducts={supplierOfferProducts}
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

              <StoryAssemblyToggles
                productCount={drafts.length}
                addHighlightStory={addHighlightStory}
                addCtaStory={addCtaStory}
                onChangeHighlight={setAddHighlightStory}
                onChangeCta={setAddCtaStory}
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
                            markUnsaved()
                          }}
                          className="rounded-md border border-royal-200 bg-white px-2 py-1 text-[10px] font-semibold text-royal-600 hover:bg-royal-50"
                        >
                          Aplicar ao ângulo
                        </button>
                      )}
                      {(() => {
                        const ctaStory = displayGenerated?.stories.find((s) => s.kind === "cta")
                        const suggested = ctaStory?.ctaMain?.trim() || ""
                        if (!generalCta.trim() || !suggested || generalCta.trim() === suggested) return null
                        return (
                          <button
                            type="button"
                            onClick={() => {
                            skipStrategyResetRef.current = true
                            setGeneralCta(suggested)
                            markUnsaved()
                          }}
                            className="rounded-md border border-royal-200 bg-white px-2 py-1 text-[10px] font-semibold text-royal-600 hover:bg-royal-50"
                          >
                            Aplicar ao CTA
                          </button>
                        )
                      })()}
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
                {blockedBySupplierPrice && (
                  <div className="mb-2 rounded-lg border border-warning-500/30 bg-warning-100/60 px-3 py-2 text-[11px] text-warning-700 inline-flex items-start gap-1.5 w-full">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE}
                      <span className="block font-semibold">{supplierOfferPriceErrors.join(", ")}</span>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={drafts.length === 0 || aiLoading || blockedBySupplierPrice}
                  onClick={generateWithAI}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                    drafts.length === 0 || aiLoading || blockedBySupplierPrice
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
                    disabled={drafts.length === 0 || aiLoading || blockedBySupplierPrice}
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
                      markUnsaved()
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
                        onChange={(e) => {
                          markUnsaved()
                          setChannelCopy((prev) => ({ ...prev, whatsapp: e.target.value }))
                        }}
                        placeholder="Texto WhatsApp"
                      />
                    )}
                    {copyChannelTab === "instagram" && (
                      <textarea
                        rows={7}
                        className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                        value={channelCopy.instagram || displayGenerated.instagram}
                        onChange={(e) => {
                          markUnsaved()
                          setChannelCopy((prev) => ({ ...prev, instagram: e.target.value }))
                        }}
                        placeholder="Legenda Instagram"
                      />
                    )}
                    {copyChannelTab === "quick" && (
                      <QuickStoryCards
                        compact
                        copies={quickProductCopies}
                        allText={quickProductText}
                        copied={copied}
                        onCopy={handleCopy}
                      />
                    )}
                    {copyChannelTab === "stories" && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setCtaVariationSeed((s) => s + 1)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:border-royal-300 hover:text-royal-700"
                            title="Troca os CTAs de todos os stories sem alterar preços ou dados"
                          >
                            Variar CTAs
                          </button>
                        </div>
                        {displayGenerated.stories.map((story, index) => (
                          <details key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-2" open={index === 0}>
                            <summary className="cursor-pointer text-xs font-semibold text-navy-900">
                              Story {index + 1} — {story.label}
                            </summary>
                            <div className="mt-2 grid gap-2">
                              <input
                                className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.storyHeadlines[index] || story.headline}
                                onChange={(e) => {
                                  markUnsaved()
                                  setChannelCopy((prev) => {
                                    const headlines = [...prev.storyHeadlines]
                                    while (headlines.length <= index) headlines.push("")
                                    headlines[index] = e.target.value
                                    return { ...prev, storyHeadlines: headlines }
                                  })
                                }}
                                placeholder={`Headline Story ${index + 1}`}
                              />
                              <input
                                className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.storySubtitles[index] || story.sub}
                                onChange={(e) => {
                                  markUnsaved()
                                  setChannelCopy((prev) => {
                                    const subtitles = [...prev.storySubtitles]
                                    while (subtitles.length <= index) subtitles.push("")
                                    subtitles[index] = e.target.value
                                    return { ...prev, storySubtitles: subtitles }
                                  })
                                }}
                                placeholder={`Subtítulo Story ${index + 1}`}
                              />
                              {story.kind === "cta" && (
                                <input
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                  value={channelCopy.storyCtas[index] || story.ctaMain || ""}
                                  onChange={(e) => {
                                    markUnsaved()
                                    setChannelCopy((prev) => {
                                      const ctas = [...prev.storyCtas]
                                      while (ctas.length <= index) ctas.push("")
                                      ctas[index] = e.target.value
                                      return { ...prev, storyCtas: ctas }
                                    })
                                  }}
                                  placeholder={`CTA do Story ${index + 1}`}
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
                                onChange={(e) => {
                                  markUnsaved()
                                  setChannelCopy((prev) => {
                                    const titles = [...prev.carouselTitles]
                                    titles[index] = e.target.value
                                    return { ...prev, carouselTitles: titles }
                                  })
                                }}
                                placeholder={`Título slide ${index + 1}`}
                              />
                              <textarea
                                rows={2}
                                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-100"
                                value={channelCopy.carouselBodies[index] || slide.body}
                                onChange={(e) => {
                                  markUnsaved()
                                  setChannelCopy((prev) => {
                                    const bodies = [...prev.carouselBodies]
                                    bodies[index] = e.target.value
                                    return { ...prev, carouselBodies: bodies }
                                  })
                                }}
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
            ) : !displayGenerated ? (
              blockedBySupplierPrice ? (
                <div className="px-5 py-12 text-center">
                  <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-warning-500" />
                  <p className="text-sm font-semibold text-navy-900">Preço de divulgação obrigatório</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">{SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE}</p>
                  <p className="mt-2 text-xs font-medium text-gray-600">{supplierOfferPriceErrors.join(", ")}</p>
                </div>
              ) : null
            ) : (
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
                  <div className="bg-gradient-to-b from-gray-50 to-white p-5 lg:p-6 space-y-4">
                    {/* ── Template picker ── */}
                    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        Template visual
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(STORY_VARIANT_LABELS) as StoryVariant[]).map((v) => {
                          const meta = STORY_VARIANT_LABELS[v]
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setStoryVariant(v)}
                              title={meta.desc}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                                storyVariant === v
                                  ? "border-[#D85A30] bg-[#FDECE4] text-[#A23E18]"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-navy-900"
                              )}
                            >
                              <span>{meta.emoji}</span>
                              {meta.label}
                            </button>
                          )
                        })}
                      </div>
                      {storyVariant !== "classic" && (
                        <p className="text-[10px] text-gray-400">{STORY_VARIANT_LABELS[storyVariant].desc}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 text-[10px] font-medium tracking-wide text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="normal-case">
                        Miniatura 9:16
                        {(() => {
                          const vitrines = displayGenerated.stories.filter((s) => s.kind === "vitrine")
                          if (drafts.length <= 1) return null
                          const density = vitrines[0]?.density ?? "standard"
                          const cap = density === "compact" ? 5 : density === "standard" ? 4 : 3
                          return ` · ${drafts.length} produtos em ${vitrines.length} ${vitrines.length === 1 ? "vitrine" : "vitrines"} · até ${cap}/story (${density})`
                        })()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStoryIndex((v) =>
                            Math.min(v, displayGenerated.stories.length - 1)
                          )
                          setPreviewModalOpen(true)
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-navy-900/15 bg-navy-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-900/90 transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        Ampliar preview
                      </button>
                    </div>
                    <div className="flex max-h-[52vh] flex-wrap gap-3 overflow-y-auto rounded-lg bg-white/40 p-3">
                      {displayGenerated.stories.map((story, i) => {
                        const active = selectedStoryIndex === i
                        return (
                          <div key={i} className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedStoryIndex(i)}
                              onDoubleClick={() => {
                                setSelectedStoryIndex(i)
                                setPreviewModalOpen(true)
                              }}
                              title="Clique para selecionar · duplo clique para ampliar"
                              className={cn(
                                "rounded-2xl p-1 transition-all",
                                active
                                  ? "ring-2 ring-[#D85A30] ring-offset-2"
                                  : "ring-1 ring-transparent hover:ring-gray-200"
                              )}
                            >
                              <StoryCanvas
                                story={story}
                                index={i}
                                scale={0.16}
                                pngUrl={storyPngResults[i]?.url ?? null}
                              />
                            </button>
                            <button
                              type="button"
                              disabled={exportingStoryIndex !== null || !storyPngResults[i]}
                              onClick={() => exportStory(i)}
                              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-600 hover:border-gray-300 hover:text-navy-900 transition-colors disabled:cursor-not-allowed disabled:text-gray-300"
                            >
                              {exportingStoryIndex === i ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : !storyPngResults[i] ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : canMobileShare ? (
                                <Share2 className="w-3 h-3" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              {exportingStoryIndex === i
                                ? "Exportando..."
                                : canMobileShare
                                ? `Story ${i + 1}`
                                : `Story ${i + 1}`}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Miniaturas para visão geral. Use{" "}
                      <span className="font-semibold text-navy-900">Ampliar preview</span> para
                      revisar a arte em tamanho grande antes de exportar.
                    </p>
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
                  <QuickStoryCards
                    copies={quickProductCopies}
                    allText={quickProductText}
                    copied={copied}
                    onCopy={handleCopy}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {previewModalOpen && displayGenerated && displayGenerated.stories.length > 0 && (() => {
        const stories = displayGenerated.stories
        const idx = Math.min(selectedStoryIndex, stories.length - 1)
        const story = stories[idx]
        const modalScale =
          typeof window !== "undefined"
            ? Math.min(
                0.42,
                (window.innerWidth * 0.9) / 1080,
                (window.innerHeight * 0.74) / 1920
              )
            : 0.42
        return (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setPreviewModalOpen(false)}
          >
            <div
              className="flex w-full max-w-[680px] items-center justify-between text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-semibold">
                Story {idx + 1} / {stories.length} — {story.label}
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="flex items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => setSelectedStoryIndex((v) => Math.max(0, v - 1))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Story anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="overflow-auto">
                {storyPngResults[idx]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={storyPngResults[idx]!.url}
                    width={Math.round(1080 * modalScale)}
                    height={Math.round(1920 * modalScale)}
                    alt={`Story ${idx + 1}: ${story.label}`}
                    style={{ display: "block", borderRadius: 12 }}
                    draggable={false}
                  />
                ) : (
                  <div
                    style={{
                      width: Math.round(1080 * modalScale),
                      height: Math.round(1920 * modalScale),
                      background: "#0d0d0d",
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={idx >= stories.length - 1}
                onClick={() =>
                  setSelectedStoryIndex((v) => Math.min(stories.length - 1, v + 1))
                }
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Próximo story"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={exportingStoryIndex !== null || !storyPngResults[idx]}
                onClick={() => exportStory(idx)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#D85A30] px-5 py-2 text-sm font-semibold text-white hover:bg-[#c44e28] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingStoryIndex === idx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : canMobileShare ? (
                  <Share2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exportingStoryIndex === idx
                  ? "Exportando..."
                  : canMobileShare
                  ? `Compartilhar Story ${idx + 1}`
                  : `Exportar Story ${idx + 1}`}
              </button>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/25 px-5 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        )
      })()}
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

function QuickStoryCards({
  copies,
  allText,
  copied,
  onCopy,
  compact = false,
}: {
  copies: QuickProductCopy[]
  allText: string
  copied: CopiedKey
  onCopy: (key: string, text: string) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? "mt-3 space-y-3" : "p-5 lg:p-6 space-y-4"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500">
            Story WhatsApp / texto rápido por produto
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Cards prontos para copiar no celular, sem selecionar texto manualmente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopy("quick-all", allText)}
          className={cn(
            "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
            copied === "quick-all"
              ? "border-success-500 bg-success-100 text-success-600"
              : "border-navy-900 bg-navy-900 text-white hover:bg-navy-800"
          )}
        >
          {copied === "quick-all" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "quick-all" ? "Copiado" : "Copiar todos"}
        </button>
      </div>

      <div className="space-y-2.5">
        {copies.map((item, index) => (
          <details
            key={item.productId}
            className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-semibold text-navy-900">
              <span className="min-w-0 truncate">{item.title}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            </summary>
            <div className="border-t border-gray-100 bg-gray-50/70 p-3.5">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-navy-900">
                {item.text}
              </pre>
              <button
                type="button"
                onClick={() => onCopy(`quick-${item.productId}`, item.text)}
                className={cn(
                  "mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                  copied === `quick-${item.productId}`
                    ? "border-success-500 bg-success-100 text-success-600"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-navy-900"
                )}
              >
                {copied === `quick-${item.productId}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === `quick-${item.productId}` ? "Copiado" : "Copiar este produto"}
              </button>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function ExportNote() {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
      <p className="text-[11px] leading-relaxed text-gray-600">
        <span className="font-medium text-navy-900">Exportação:</span> o botão gera uma arte PNG em
        1080×1920 a partir de um canvas em tamanho real, não do preview reduzido. No celular, usa
        compartilhamento nativo quando o navegador suporta arquivos.
      </p>
    </div>
  )
}

function ThreeWayToggle({
  label,
  description,
  value,
  autoLabel,
  onChange,
}: {
  label: string
  description: string
  value: boolean | null
  autoLabel: string
  onChange: (v: boolean | null) => void
}) {
  const states: Array<{ key: "auto" | "on" | "off"; label: string; pressed: boolean }> = [
    { key: "auto", label: `Automático (${autoLabel})`, pressed: value == null },
    { key: "on", label: "Sempre", pressed: value === true },
    { key: "off", label: "Nunca", pressed: value === false },
  ]
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-navy-900">{label}</div>
          <div className="text-[10px] text-gray-500">{description}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        {states.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key === "auto" ? null : s.key === "on")}
            className={cn(
              "flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
              s.pressed
                ? "border-royal-500 bg-royal-100 text-royal-600"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function StoryAssemblyToggles({
  productCount,
  addHighlightStory,
  addCtaStory,
  onChangeHighlight,
  onChangeCta,
}: {
  productCount: number
  addHighlightStory: boolean | null
  addCtaStory: boolean | null
  onChangeHighlight: (next: boolean | null) => void
  onChangeCta: (next: boolean | null) => void
}) {
  const vitrineCount = Math.max(1, Math.ceil(productCount / 3))
  const highlightAuto = productCount > 1
  const ctaAuto = productCount <= 3

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        Stories adicionais
      </p>
      <p className="text-[10px] text-gray-500">
        {productCount === 0
          ? "Adicione produtos para configurar a sequência de stories."
          : `${productCount} produto${productCount === 1 ? "" : "s"} → ${vitrineCount} story${vitrineCount === 1 ? "" : "s"} de vitrine (até 3 por story).`}
      </p>
      <ThreeWayToggle
        label="Story de destaque do produto principal"
        description="Adiciona um story focado no produto principal após as vitrines."
        value={addHighlightStory}
        autoLabel={highlightAuto ? "ligado se houver argumento forte" : "desligado para 1 produto"}
        onChange={onChangeHighlight}
      />
      <ThreeWayToggle
        label="Story final de CTA"
        description="Adiciona um story de fechamento. Para muitos produtos, deixar desligado prioriza vitrines."
        value={addCtaStory}
        autoLabel={ctaAuto ? "ligado para até 3 produtos" : "desligado para >3 produtos"}
        onChange={onChangeCta}
      />
    </div>
  )
}
