import { pool } from "@/lib/db"
import { ok, requireResellerAdmin } from "@/lib/reseller/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Returns supplier catalog offers that can be released to a reseller.
// Supplier price/name are admin-only; the reseller portal uses a sanitized DTO.
export async function GET(request: Request) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response

  const search = new URL(request.url).searchParams.get("search")?.trim() || null
  const params: unknown[] = [gate.companyId, ["available"]]
  let where = "so.company_id = $1::uuid AND so.status = ANY($2::text[])"

  if (search) {
    params.push(`%${search}%`)
    where += ` AND (
      lower(coalesce(so.model,''))      LIKE lower($3) OR
      lower(coalesce(so.category,''))   LIKE lower($3) OR
      lower(coalesce(so.storage,''))    LIKE lower($3) OR
      lower(coalesce(so.color,''))      LIKE lower($3) OR
      lower(coalesce(so.brand,''))      LIKE lower($3) OR
      lower(coalesce(s.name,''))        LIKE lower($3)
    )`
  }

  const result = await pool.query(
    `SELECT
       so.id,
       so.model,
       so.category,
       so.storage,
       so.color,
       so.brand,
       so.condition,
       so.internal_grade          AS grade,
       so.battery_health,
       so.warranty_label,
       so.suggested_sale_price,
       s.name                     AS supplier_name,
       s.id                       AS supplier_id
     FROM supplier_offers so
     LEFT JOIN suppliers s ON s.id = so.supplier_id
     WHERE ${where}
     ORDER BY COALESCE(s.name, '') ASC, COALESCE(so.model, '') ASC
     LIMIT 300`,
    params
  )

  const items = result.rows.map((r) => ({
    id: r.id,
    model: r.model,
    category: r.category,
    storage: r.storage,
    color: r.color,
    brand: r.brand,
    condition: r.condition,
    grade: r.grade,
    batteryHealth: r.battery_health == null ? null : Number(r.battery_health),
    warrantyLabel: r.warranty_label,
    suggestedSalePrice: r.suggested_sale_price == null ? null : Number(r.suggested_sale_price),
    supplierName: r.supplier_name,
    supplierId: r.supplier_id,
  }))

  return ok(items)
}
