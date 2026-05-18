export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { supplierOfferRowToMarketingProduct } from "@/lib/marketing/supplier-offer-mapper"

// Returns supplier offers with status='available' in a MarketingProduct-compatible shape.
// sourceType is always "supplier_offer" so the UI can distinguish from inventory products.
export async function GET() {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  const { companyId } = auth.context

  try {
    const result = await pool.query(
      `SELECT
         so.id,
         so.model,
         so.category,
         so.storage,
         so.size,
         so.color,
         so.brand,
         so.condition,
         so.internal_grade,
         so.battery_health,
         so.warranty_label,
         so.supplier_price,
         so.suggested_sale_price,
         so.status,
         so.created_at,
         s.name AS supplier_name,
         s.id   AS supplier_id
       FROM supplier_offers so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.company_id = $1::uuid
         AND so.status = 'available'
       ORDER BY so.created_at DESC
       LIMIT 300`,
      [companyId]
    )

    const items = result.rows.map((row) => supplierOfferRowToMarketingProduct(row))

    return NextResponse.json({ data: items, error: null })
  } catch (err) {
    console.error("[marketing/supplier-offer-products] query failed", err)
    return NextResponse.json(
      { data: null, error: { message: "Não foi possível carregar as ofertas de fornecedor." } },
      { status: 500 }
    )
  }
}
