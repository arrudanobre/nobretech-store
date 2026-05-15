export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { generateMarketingContent } from "@/lib/marketing/ai"
import type {
  GeneralStrategy,
  MarketingProduct,
  ProductDraft,
  ChannelKey,
  ObjectiveKey,
  ToneKey,
  UrgencyLevel,
} from "@/lib/marketing/copy-generator"

const VALID_OBJECTIVES: ObjectiveKey[] = [
  "sell_fast",
  "generate_desire",
  "bundle_gift",
  "trust_proof",
  "new_arrival",
  "reactivate_lead",
]
const VALID_CHANNELS: ChannelKey[] = ["stories", "carousel", "whatsapp", "instagram"]
const VALID_TONES: ToneKey[] = ["consultivo", "direto", "premium", "amigavel"]
const VALID_URGENCY: UrgencyLevel[] = ["none", "low", "high"]

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && isFinite(value)) return value
  if (typeof value === "string") {
    const v = parseFloat(value)
    if (isFinite(v)) return v
  }
  return null
}

function sanitizeProduct(raw: unknown): MarketingProduct | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || typeof r.name !== "string") return null
  const variantsRaw = Array.isArray(r.variants) ? r.variants : []
  const variants = variantsRaw
    .map((v) => {
      if (!v || typeof v !== "object") return null
      const vr = v as Record<string, unknown>
      const color = typeof vr.color_name === "string" ? vr.color_name : null
      const qty = pickNumber(vr.quantity)
      if (!color || qty == null) return null
      return {
        color_name: color,
        quantity: qty,
        suggested_price: pickNumber(vr.suggested_price),
      }
    })
    .filter((v): v is { color_name: string; quantity: number; suggested_price: number | null } => v !== null)

  return {
    id: r.id,
    name: r.name,
    category: typeof r.category === "string" ? r.category : null,
    storage: typeof r.storage === "string" ? r.storage : null,
    color: typeof r.color === "string" ? r.color : null,
    brand: typeof r.brand === "string" ? r.brand : null,
    grade: typeof r.grade === "string" ? r.grade : null,
    battery_health: pickNumber(r.battery_health),
    suggested_price: pickNumber(r.suggested_price),
    quantity: pickNumber(r.quantity) ?? 1,
    commercial_status: typeof r.commercial_status === "string" ? r.commercial_status : "available",
    notes: typeof r.notes === "string" ? r.notes : null,
    has_imei: Boolean(r.has_imei),
    warranty_label: typeof r.warranty_label === "string" ? r.warranty_label : null,
    warranty_source:
      r.warranty_source === "inventory" || r.warranty_source === "manual"
        ? r.warranty_source
        : null,
    variants,
  }
}

export async function POST(req: Request) {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: { message: "Payload inválido." } },
      { status: 400 }
    )
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { data: null, error: { message: "Payload inválido." } },
      { status: 400 }
    )
  }

  const obj = body as Record<string, unknown>
  const strategyRaw = (obj.strategy as Record<string, unknown>) ?? {}
  const draftsRaw = Array.isArray(obj.drafts) ? obj.drafts : []
  const useAI = Boolean(obj.useAI)
  const historySummary = pickString(obj.historySummary, "").slice(0, 1200)

  const objective = VALID_OBJECTIVES.includes(strategyRaw.objective as ObjectiveKey)
    ? (strategyRaw.objective as ObjectiveKey)
    : "sell_fast"
  const channel = VALID_CHANNELS.includes(strategyRaw.channel as ChannelKey)
    ? (strategyRaw.channel as ChannelKey)
    : "whatsapp"
  const tone = VALID_TONES.includes(strategyRaw.tone as ToneKey)
    ? (strategyRaw.tone as ToneKey)
    : "consultivo"
  const urgencyLevel = VALID_URGENCY.includes(strategyRaw.urgencyLevel as UrgencyLevel)
    ? (strategyRaw.urgencyLevel as UrgencyLevel)
    : "none"

  function pickToggle(value: unknown): boolean | null {
    if (value === true || value === false) return value
    return null
  }

  const strategy: GeneralStrategy = {
    objective,
    channel,
    tone,
    urgencyLevel,
    generalCta: pickString(strategyRaw.generalCta, ""),
    generalNote: pickString(strategyRaw.generalNote, ""),
    angle: pickString(strategyRaw.angle, ""),
    addHighlightStory: pickToggle(strategyRaw.addHighlightStory),
    addCtaStory: pickToggle(strategyRaw.addCtaStory),
  }

  const drafts: ProductDraft[] = []
  for (const d of draftsRaw) {
    if (!d || typeof d !== "object") continue
    const dr = d as Record<string, unknown>
    const product = sanitizeProduct(dr.product)
    if (!product) continue
    const basePrice = pickNumber(dr.basePrice) ?? product.suggested_price
    const disclosurePrice = pickNumber(dr.disclosurePrice) ?? basePrice
    const installmentCount = Math.max(0, Math.min(18, Math.floor(pickNumber(dr.installmentCount) ?? 0)))
    drafts.push({
      product,
      isPrimary: Boolean(dr.isPrimary),
      isFeatured: Boolean(dr.isFeatured),
      basePrice,
      disclosurePrice,
      installmentCount,
      gifts: pickString(dr.gifts, ""),
      warrantyLabel: pickString(dr.warrantyLabel, ""),
      warrantySource: dr.warrantySource === "inventory" || dr.warrantySource === "manual"
        ? dr.warrantySource
        : pickString(dr.warrantyLabel, "") ? "manual" : null,
      copyTitle: pickString(dr.copyTitle, ""),
      copyDescription: pickString(dr.copyDescription, ""),
      copyStrongPoint: pickString(dr.copyStrongPoint, ""),
      copyObjection: pickString(dr.copyObjection, ""),
      productNote: pickString(dr.productNote, ""),
      productCta: pickString(dr.productCta, ""),
    })
  }

  if (drafts.length === 0) {
    return NextResponse.json(
      { data: null, error: { message: "Nenhum produto enviado." } },
      { status: 400 }
    )
  }

  if (!drafts.some((d) => d.isPrimary)) {
    drafts[0].isPrimary = true
  }

  try {
    const result = await generateMarketingContent({ drafts, strategy, useAI, historySummary })
    return NextResponse.json({
      data: {
        content: result.content,
        source: result.source,
        aiError: result.aiError ?? null,
        productCopies: result.productCopies ?? [],
        campaignAngle: result.campaignAngle ?? null,
        offerAlerts: result.offerAlerts ?? [],
      },
      error: null,
    })
  } catch (err) {
    console.error("[marketing/generate-copy] failed", err)
    const message = err instanceof Error ? err.message : "Falha ao gerar conteúdo."
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
