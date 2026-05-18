export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import {
  supplierOfferRowToMarketingProduct,
  type SupplierOfferRow,
} from "@/lib/marketing/supplier-offer-mapper"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SessionRow = {
  id: string
  objective: string
  channel: string
  tone: string
  urgency_level: string
  general_cta: string | null
  general_note: string | null
  angle: string | null
  add_highlight_story: boolean | null
  add_cta_story: boolean | null
  ai_enabled: boolean
  created_at: string
  updated_at: string
}

type ItemRow = {
  inventory_id: string | null
  supplier_offer_id: string | null
  source_type: string | null
  so_model: string | null
  so_category: string | null
  so_storage: string | null
  so_size: string | null
  so_color: string | null
  so_brand: string | null
  so_condition: string | null
  so_internal_grade: string | null
  so_battery_health: number | string | null
  so_warranty_label: string | null
  so_supplier_price: number | string | null
  so_suggested_sale_price: number | string | null
  so_status: string | null
  so_supplier_name: string | null
  so_supplier_id: string | null
  is_primary: boolean
  is_featured: boolean
  base_price: string | number | null
  disclosure_price: string | number | null
  discount_amount: string | number | null
  discount_percent: string | number | null
  installment_count: number
  installment_amount: string | number | null
  installment_total: string | number | null
  gifts_text: string | null
  warranty_label: string | null
  warranty_source: string | null
  product_note: string | null
  product_cta: string | null
  copy_json: Record<string, unknown> | null
  display_order: number
  updated_at: string
}

type OutputRow = {
  channel: string
  content_json: Record<string, unknown> | null
  content_text: string | null
  generated_by: string
}

function migrationMissing(error: unknown) {
  // 42P01 = undefined_table, 42703 = undefined_column (new toggle columns
  // not yet applied via migrations/marketing_disclosure_sessions.sql).
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: string }).code
    : null
  return code === "42P01" || code === "42703"
}

function toNumber(value: string | number | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// Items query that joins supplier_offers so supplier-offer products can be
// fully rehydrated (cost/supplier stays internal — never exposed in the story).
// Falls back to the legacy query when migrations/marketing_supplier_offers_integration.sql
// hasn't been applied yet (undefined_column).
async function fetchSessionItems(companyId: string, sessionId: string): Promise<ItemRow[]> {
  try {
    const result = await pool.query<ItemRow>(
      `SELECT mdi.inventory_id, mdi.supplier_offer_id, mdi.source_type,
              so.model AS so_model, so.category AS so_category, so.storage AS so_storage,
              so.size AS so_size, so.color AS so_color, so.brand AS so_brand,
              so.condition AS so_condition, so.internal_grade AS so_internal_grade,
              so.battery_health AS so_battery_health,
              so.warranty_label AS so_warranty_label, so.supplier_price AS so_supplier_price,
              so.suggested_sale_price AS so_suggested_sale_price, so.status AS so_status,
              sup.name AS so_supplier_name, sup.id AS so_supplier_id,
              mdi.is_primary, mdi.is_featured, mdi.base_price, mdi.disclosure_price, mdi.discount_amount,
              mdi.discount_percent, mdi.installment_count, mdi.installment_amount, mdi.installment_total,
              mdi.gifts_text, mdi.warranty_label, mdi.warranty_source, mdi.product_note, mdi.product_cta,
              mdi.copy_json, mdi.display_order, mdi.updated_at
       FROM marketing_disclosure_items mdi
       LEFT JOIN supplier_offers so ON so.id = mdi.supplier_offer_id
       LEFT JOIN suppliers sup ON sup.id = so.supplier_id
       WHERE mdi.company_id = $1::uuid AND mdi.session_id = $2::uuid
       ORDER BY mdi.display_order ASC, mdi.created_at ASC`,
      [companyId, sessionId]
    )
    return result.rows
  } catch (error) {
    if (!migrationMissing(error)) throw error
    const result = await pool.query<ItemRow>(
      `SELECT inventory_id, is_primary, is_featured, base_price, disclosure_price, discount_amount,
              discount_percent, installment_count, installment_amount, installment_total,
              gifts_text, warranty_label, warranty_source, product_note, product_cta,
              copy_json, display_order, updated_at
       FROM marketing_disclosure_items
       WHERE company_id = $1::uuid AND session_id = $2::uuid
       ORDER BY display_order ASC, created_at ASC`,
      [companyId, sessionId]
    )
    return result.rows
  }
}

async function loadSession(companyId: string, sessionId: string) {
  const [sessionResult, itemRows, outputsResult] = await Promise.all([
    pool.query<SessionRow>(
      `SELECT id, objective, channel, tone, urgency_level, general_cta, general_note, angle,
              add_highlight_story, add_cta_story, ai_enabled, created_at, updated_at
       FROM marketing_disclosure_sessions
       WHERE company_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      [companyId, sessionId]
    ),
    fetchSessionItems(companyId, sessionId),
    pool.query<OutputRow>(
      `SELECT channel, content_json, content_text, generated_by
       FROM marketing_disclosure_outputs
       WHERE company_id = $1::uuid AND session_id = $2::uuid
       ORDER BY created_at ASC`,
      [companyId, sessionId]
    ),
  ])

  const session = sessionResult.rows[0]
  if (!session) return null

  return {
    id: session.id,
    strategy: {
      objective: session.objective,
      channel: session.channel,
      tone: session.tone,
      urgencyLevel: session.urgency_level,
      generalCta: session.general_cta ?? "",
      generalNote: session.general_note ?? "",
      angle: session.angle ?? "",
      // 3-way: null = Automático, true = Sempre, false = Nunca.
      addHighlightStory: session.add_highlight_story ?? null,
      addCtaStory: session.add_cta_story ?? null,
    },
    source: session.ai_enabled ? "ai" : "deterministic",
    products: itemRows.map((item) => {
      const isSupplierOffer = item.source_type === "supplier_offer" && Boolean(item.supplier_offer_id)
      const supplierOffer = isSupplierOffer && item.so_status != null
        ? supplierOfferRowToMarketingProduct({
            id: item.supplier_offer_id as string,
            model: item.so_model,
            category: item.so_category,
            storage: item.so_storage,
            size: item.so_size,
            color: item.so_color,
            brand: item.so_brand,
            condition: item.so_condition,
            internal_grade: item.so_internal_grade,
            battery_health: item.so_battery_health,
            warranty_label: item.so_warranty_label,
            supplier_price: item.so_supplier_price,
            suggested_sale_price: item.so_suggested_sale_price,
            status: item.so_status,
            supplier_name: item.so_supplier_name,
            supplier_id: item.so_supplier_id,
          } satisfies SupplierOfferRow)
        : null
      return {
      productId: isSupplierOffer ? item.supplier_offer_id : item.inventory_id,
      sourceType: isSupplierOffer ? "supplier_offer" : "inventory",
      supplierOfferId: item.supplier_offer_id ?? null,
      supplierOffer,
      isPrimary: item.is_primary,
      isFeatured: item.is_featured,
      basePrice: toNumber(item.base_price),
      disclosurePrice: toNumber(item.disclosure_price),
      discountAmount: toNumber(item.discount_amount),
      discountPercent: toNumber(item.discount_percent),
      installmentCount: item.installment_count,
      installmentAmount: toNumber(item.installment_amount),
      installmentTotal: toNumber(item.installment_total),
      gifts: item.gifts_text ?? "",
      warrantyLabel: item.warranty_label ?? "",
      warrantySource: item.warranty_source || null,
      productNote: item.product_note ?? "",
      productCta: item.product_cta ?? "",
      copy: item.copy_json ?? {},
      displayOrder: item.display_order,
      updatedAt: item.updated_at,
      }
    }),
    outputs: outputsResult.rows.reduce<Record<string, { text: string; json: Record<string, unknown> | null; source: string }>>(
      (acc, output) => {
        acc[output.channel] = {
          text: output.content_text ?? "",
          json: output.content_json ?? null,
          source: output.generated_by,
        }
        return acc
      },
      {}
    ),
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  }
}

export async function GET(req: Request) {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const inventoryId = url.searchParams.get("inventory_id")

  try {
    let sessionId: string | null = null

    if (inventoryId && UUID_RE.test(inventoryId)) {
      const itemResult = await pool.query<{ session_id: string }>(
        `SELECT session_id
         FROM marketing_disclosure_items
         WHERE company_id = $1::uuid AND inventory_id = $2::uuid
         ORDER BY updated_at DESC
         LIMIT 1`,
        [auth.context.companyId, inventoryId]
      )
      sessionId = itemResult.rows[0]?.session_id ?? null
    } else {
      const sessionResult = await pool.query<{ id: string }>(
        `SELECT id
         FROM marketing_disclosure_sessions
         WHERE company_id = $1::uuid
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
        [auth.context.companyId]
      )
      sessionId = sessionResult.rows[0]?.id ?? null
    }

    if (!sessionId) return NextResponse.json({ data: null, error: null })

    const data = await loadSession(auth.context.companyId, sessionId)
    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error("[marketing/disclosure-sessions/last] load failed", error)
    if (migrationMissing(error)) {
      return NextResponse.json(
        { data: null, error: { message: "Persistência ainda não está disponível. A migration de divulgação precisa ser aplicada." } },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { data: null, error: { message: "Não foi possível carregar a última divulgação." } },
      { status: 500 }
    )
  }
}
