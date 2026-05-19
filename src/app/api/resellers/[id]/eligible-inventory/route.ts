import { pool } from "@/lib/db"
import { ok, requireResellerAdmin } from "@/lib/reseller/admin"
import { operationallyAvailableSql } from "@/lib/inventory/availability"
import { getProductName } from "@/lib/helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// Operationally available own inventory the admin can release to a reseller.
// Does NOT return purchase_price or any cost/margin field.
export async function GET(request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const search = new URL(request.url).searchParams.get("search")?.trim() || null

  const params: unknown[] = [gate.companyId, id]
  let where = `i.company_id = $1::uuid AND i.type = 'own' AND ${operationallyAvailableSql("i")}`
  if (search) {
    params.push(`%${search}%`)
    where += ` AND (
      lower(coalesce(c.model,''))                     LIKE lower($3) OR
      lower(coalesce(c.color,''))                     LIKE lower($3) OR
      lower(coalesce(i.imei,''))                      LIKE lower($3) OR
      lower(coalesce(i.attribute_summary_snapshot,'')) LIKE lower($3) OR
      lower(coalesce(i.color_name_snapshot,''))        LIKE lower($3)
    )`
  }

  const result = await pool.query(
    `SELECT i.id, i.attribute_summary_snapshot AS inv_attribute_summary,
            i.color_name_snapshot AS inv_color_name, i.notes AS inv_notes,
            i.grade, i.battery_health, NULL::integer AS warranty_months, i.ios_version, i.imei,
            c.model AS catalog_model, c.storage AS catalog_storage, c.color AS catalog_color,
            i.suggested_price,
            (SELECT image_url FROM product_images pi
              WHERE pi.product_id = i.id AND pi.company_id = i.company_id
              ORDER BY pi.is_primary DESC, pi.created_at ASC LIMIT 1) AS image_url,
            o.id AS offer_id, o.is_active AS offer_active
       FROM inventory i
       LEFT JOIN product_catalog c ON c.id = i.catalog_id
       LEFT JOIN reseller_product_offers o
         ON o.inventory_item_id = i.id AND o.reseller_id = $2::uuid
      WHERE ${where}
      ORDER BY i.created_at DESC
      LIMIT 200`,
    params
  )

  const items = result.rows.map((r) => ({
    id: r.id,
    productName: getProductName({
      catalog: r.catalog_model
        ? { model: r.catalog_model, storage: r.catalog_storage, color: r.catalog_color }
        : null,
      storage: r.inv_attribute_summary,
      color: r.inv_color_name,
      name: typeof r.inv_notes === "string" ? r.inv_notes.match(/^Nome:\s*(.+)$/i)?.[1]?.trim() : null,
    }),
    storage: r.catalog_storage || r.inv_attribute_summary || null,
    color: r.catalog_color || r.inv_color_name || null,
    grade: r.grade,
    batteryHealth: r.battery_health,
    warrantyMonths: r.warranty_months,
    imei: r.imei,
    suggestedPrice: r.suggested_price == null ? null : Number(r.suggested_price),
    imageUrl: r.image_url || null,
    alreadyOffered: Boolean(r.offer_id),
    offerActive: r.offer_active ?? null,
  }))

  return ok(items)
}
