import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireResellerApiContext } from "@/lib/reseller/access"
import { toResellerOfferDTO, type ResellerOfferRow } from "@/lib/reseller/offer-dto"
import { operationallyAvailableSql } from "@/lib/inventory/availability"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Returns ONLY this reseller's active offers. The SELECT list intentionally
// excludes supplier name, supplier price, purchase_price, internal_notes and
// any margin/cost field.
export async function GET() {
  const gate = await requireResellerApiContext()
  if (!gate.ok) return gate.response

  const { reseller } = gate

  const result = await pool.query<ResellerOfferRow>(
    `SELECT
        o.id                  AS offer_id,
        o.source_type         AS source_type,
        o.reseller_price      AS reseller_price,
        o.suggested_sale_price AS suggested_sale_price,
        o.visible_notes       AS visible_notes,
        o.available_until     AS available_until,
        c.model               AS catalog_model,
        c.storage             AS catalog_storage,
        c.color               AS catalog_color,
        i.product_type        AS inv_product_type,
        i.category_name_snapshot AS inv_category_name,
        i.subcategory_name_snapshot AS inv_subcategory_name,
        i.attribute_summary_snapshot AS inv_attribute_summary,
        i.color_name_snapshot AS inv_color_name,
        i.notes               AS inv_notes,
        i.condition_notes     AS inv_condition_notes,
        i.grade               AS grade,
        i.battery_health      AS battery_health,
        NULL::integer         AS warranty_months,
        i.ios_version         AS ios_version,
        i.photos              AS photos,
        (SELECT image_url FROM product_images pi
          WHERE pi.product_id = i.id AND pi.company_id = i.company_id
          ORDER BY pi.is_primary DESC, pi.created_at ASC LIMIT 1) AS image_url,
        so.model              AS supplier_model,
        so.storage            AS supplier_storage,
        so.size               AS supplier_size,
        so.color              AS supplier_color,
        so.category           AS supplier_category,
        so.brand              AS supplier_brand,
        so.condition          AS supplier_condition,
        so.internal_grade     AS supplier_grade,
        so.battery_health     AS supplier_battery_health,
        rr.type               AS request_type,
        rr.status             AS request_status,
        rr.created_at::text   AS request_created_at,
        rr.updated_at::text   AS request_updated_at
       FROM reseller_product_offers o
       LEFT JOIN inventory i ON i.id = o.inventory_item_id
       LEFT JOIN product_catalog c ON c.id = i.catalog_id
       LEFT JOIN supplier_offers so ON so.id = o.supplier_offer_id
       LEFT JOIN LATERAL (
           SELECT rr2.type, rr2.status, rr2.created_at, rr2.updated_at
           FROM reseller_requests rr2
           WHERE rr2.offer_id = o.id AND rr2.reseller_id = $1::uuid
           ORDER BY
             CASE rr2.status
               WHEN 'pending' THEN 1
               WHEN 'approved' THEN 2
               WHEN 'completed' THEN 3
               WHEN 'rejected' THEN 4
               WHEN 'canceled' THEN 5
               ELSE 6
             END,
             rr2.created_at DESC
           LIMIT 1
       ) rr ON TRUE
      WHERE o.reseller_id = $1::uuid
        AND o.company_id = $2::uuid
        AND o.is_active = TRUE
        AND (o.available_until IS NULL OR o.available_until >= CURRENT_DATE)
        AND (
          (o.source_type = 'inventory' AND ${operationallyAvailableSql("i")})
          OR
          (o.source_type = 'supplier' AND so.status = 'available')
        )
      ORDER BY o.updated_at DESC`,
    [reseller.id, reseller.company_id]
  )

  return NextResponse.json({ data: result.rows.map(toResellerOfferDTO), error: null })
}
