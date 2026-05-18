import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { companyId } = authResult.context
  const { searchParams } = new URL(request.url)

  const supplierId = searchParams.get("supplierId") || null
  const status = searchParams.get("status") || null
  const category = searchParams.get("category") || null
  const batchId = searchParams.get("batchId") || null
  const onlyAvailable = searchParams.get("onlyAvailable") === "1"
  const onlyNeedsReview = searchParams.get("onlyNeedsReview") === "1"
  const onlyDuplicates = searchParams.get("onlyDuplicates") === "1"
  const search = searchParams.get("search") || null
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || "100")))
  const offset = Math.max(0, Number(searchParams.get("offset") || "0"))

  const conditions: string[] = ["so.company_id = $1::uuid"]
  const params: unknown[] = [companyId]
  let paramIdx = 2

  if (supplierId) {
    conditions.push(`so.supplier_id = $${paramIdx}::uuid`)
    params.push(supplierId)
    paramIdx++
  }

  if (batchId) {
    conditions.push(`so.batch_id = $${paramIdx}::uuid`)
    params.push(batchId)
    paramIdx++
  }

  if (onlyAvailable) {
    conditions.push(`so.status = 'available'`)
  } else if (onlyNeedsReview) {
    conditions.push(`so.status = 'needs_review'`)
  } else if (status) {
    conditions.push(`so.status = $${paramIdx}`)
    params.push(status)
    paramIdx++
  }

  if (category) {
    conditions.push(`lower(so.category) = lower($${paramIdx})`)
    params.push(category)
    paramIdx++
  }

  if (onlyDuplicates) {
    conditions.push(`so.duplicate_candidate = true`)
  }

  if (search) {
    conditions.push(
      `(lower(so.model) LIKE lower($${paramIdx}) OR lower(so.color) LIKE lower($${paramIdx}) OR lower(so.category) LIKE lower($${paramIdx}) OR lower(so.brand) LIKE lower($${paramIdx}))`
    )
    params.push(`%${search}%`)
    paramIdx++
  }

  const where = conditions.join(" AND ")

  try {
    const result = await pool.query(
      `SELECT
         so.id,
         so.batch_id,
         so.supplier_id,
         so.source_line,
         so.category,
         so.brand,
         so.model,
         so.variant,
         so.storage,
         so.size,
         so.color,
         so.condition,
         so.battery_health,
         so.warranty_type,
         so.warranty_label,
         so.warranty_until,
         so.supplier_price,
         so.suggested_sale_price,
         so.estimated_margin,
         so.confidence,
         so.status,
         so.warnings,
         so.duplicate_candidate,
         so.created_at,
         so.updated_at,
         s.name AS supplier_name,
         sob.created_at AS batch_created_at
       FROM supplier_offers so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       LEFT JOIN supplier_offer_batches sob ON sob.id = so.batch_id
       WHERE ${where}
       ORDER BY so.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )

    const countResult = await pool.query(
      `SELECT count(*)::int AS total FROM supplier_offers so WHERE ${where}`,
      params
    )

    return NextResponse.json({
      data: {
        offers: result.rows,
        total: countResult.rows[0]?.total ?? 0,
        limit,
        offset,
      },
      error: null,
    })
  } catch (error) {
    console.error("[supplier-offers] GET error", error)
    return NextResponse.json(
      { data: null, error: { message: "Erro ao carregar ofertas." } },
      { status: 500 }
    )
  }
}
