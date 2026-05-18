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
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || "20")))
  const offset = Math.max(0, Number(searchParams.get("offset") || "0"))

  const conditions: string[] = ["sob.company_id = $1::uuid"]
  const params: unknown[] = [companyId]
  let paramIdx = 2

  if (supplierId) {
    conditions.push(`sob.supplier_id = $${paramIdx}::uuid`)
    params.push(supplierId)
    paramIdx++
  }

  const where = conditions.join(" AND ")

  try {
    const result = await pool.query(
      `SELECT
         sob.id,
         sob.supplier_id,
         sob.source,
         sob.parser_mode,
         sob.ai_succeeded_blocks,
         sob.ai_failed_blocks,
         sob.local_fallback_blocks,
         sob.saved_count,
         sob.created_at,
         s.name AS supplier_name,
         COUNT(so.id)::int AS offer_count,
         COUNT(so.id) FILTER (WHERE so.status = 'available')::int AS available_count,
         COUNT(so.id) FILTER (WHERE so.status = 'superseded')::int AS superseded_count,
         COUNT(so.id) FILTER (WHERE so.status = 'needs_review')::int AS needs_review_count
       FROM supplier_offer_batches sob
       LEFT JOIN suppliers s ON s.id = sob.supplier_id
       LEFT JOIN supplier_offers so ON so.batch_id = sob.id
       WHERE ${where}
       GROUP BY sob.id, s.name
       ORDER BY sob.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )

    return NextResponse.json({ data: result.rows, error: null })
  } catch (error) {
    console.error("[supplier-offer-batches] GET error", error)
    return NextResponse.json(
      { data: null, error: { message: "Erro ao carregar lotes." } },
      { status: 500 }
    )
  }
}
