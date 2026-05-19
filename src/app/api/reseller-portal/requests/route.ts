import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireResellerApiContext } from "@/lib/reseller/access"
import { checkRateLimit } from "@/lib/rate-limit"
import { operationallyAvailableSql } from "@/lib/inventory/availability"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The reseller can only signal intent. None of these create an official sale —
// the official sale stays in the normal ERP flow controlled by Nobretech.
const ALLOWED_TYPES = new Set(["interest", "reservation_requested", "sold_reported"])

export async function GET() {
  const gate = await requireResellerApiContext()
  if (!gate.ok) return gate.response

  const result = await pool.query(
    `SELECT id, type, status, notes, created_at
       FROM reseller_requests
      WHERE reseller_id = $1::uuid AND company_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT 100`,
    [gate.reseller.id, gate.reseller.company_id]
  )
  return NextResponse.json({ data: result.rows, error: null })
}

export async function POST(request: Request) {
  const gate = await requireResellerApiContext()
  if (!gate.ok) return gate.response

  const { reseller, context } = gate

  const rl = checkRateLimit(`reseller-req:${context.appUserId}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { data: null, error: { message: "Muitas solicitações. Aguarde alguns instantes." } },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const offerId = String(body?.offerId || "").trim()
  const type = String(body?.type || "").trim()
  const customerName = body?.customerName ? String(body.customerName).trim().slice(0, 160) : null
  const customerPhone = body?.customerPhone ? String(body.customerPhone).trim().slice(0, 40) : null
  const notes = body?.notes ? String(body.notes).trim().slice(0, 1000) : null

  if (!offerId) {
    return NextResponse.json({ data: null, error: { message: "Oferta não informada" } }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ data: null, error: { message: "Tipo de solicitação inválido" } }, { status: 400 })
  }

  // The offer must belong to THIS reseller and still be commercially available.
  // Supplier catalog offers do not create inventory and still only create a
  // pending reseller request.
  const offer = await pool.query<{ inventory_item_id: string | null }>(
    `SELECT o.inventory_item_id
       FROM reseller_product_offers o
       LEFT JOIN inventory i ON i.id = o.inventory_item_id
       LEFT JOIN supplier_offers so ON so.id = o.supplier_offer_id
      WHERE o.id = $1::uuid
        AND o.reseller_id = $2::uuid
        AND o.company_id = $3::uuid
        AND o.is_active = TRUE
        AND (o.available_until IS NULL OR o.available_until >= CURRENT_DATE)
        AND (
          (o.source_type = 'inventory' AND ${operationallyAvailableSql("i")})
          OR
          (o.source_type = 'supplier' AND so.status = 'available')
        )
      LIMIT 1`,
    [offerId, reseller.id, reseller.company_id]
  )
  if (!offer.rowCount) {
    return NextResponse.json(
      { data: null, error: { message: "Este produto não está mais disponível" } },
      { status: 400 }
    )
  }

  const inserted = await pool.query(
    `INSERT INTO reseller_requests
       (company_id, reseller_id, inventory_item_id, offer_id, type, status,
        customer_name_optional, customer_phone_optional, notes)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'pending', $6, $7, $8)
     RETURNING id, type, status, created_at`,
    [
      reseller.company_id,
      reseller.id,
      offer.rows[0].inventory_item_id,
      offerId,
      type,
      customerName,
      customerPhone,
      notes,
    ]
  )

  return NextResponse.json({ data: inserted.rows[0], error: null })
}
