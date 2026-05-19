import { pool } from "@/lib/db"
import { ok, requireResellerAdmin } from "@/lib/reseller/admin"
import { operationallyAvailableSql } from "@/lib/inventory/availability"
import { buildInventoryCommercialName, buildSupplierCommercialName } from "@/lib/reseller/product-name"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

function maskIdentifier(value: string | null): string | null {
  if (!value) return null
  const visible = value.slice(-4)
  return `${"*".repeat(Math.max(value.length - 4, 0))}${visible}`
}

export async function GET(request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const url = new URL(request.url)
  const search = url.searchParams.get("search")?.trim() || null
  const source = url.searchParams.get("source") || "all"
  const includeInventory = source === "all" || source === "inventory"
  const includeSupplier = source === "all" || source === "supplier"

  const data: unknown[] = []

  if (includeInventory) {
    const params: unknown[] = [gate.companyId, id]
    let where = `i.company_id = $1::uuid AND i.type = 'own' AND ${operationallyAvailableSql("i")}`
    if (search) {
      params.push(`%${search}%`)
      where += ` AND (
        lower(coalesce(c.model,''))                      LIKE lower($3) OR
        lower(coalesce(c.storage,''))                    LIKE lower($3) OR
        lower(coalesce(c.color,''))                      LIKE lower($3) OR
        lower(coalesce(i.imei,''))                       LIKE lower($3) OR
        lower(coalesce(i.serial_number,''))              LIKE lower($3) OR
        lower(coalesce(i.category_name_snapshot,''))     LIKE lower($3) OR
        lower(coalesce(i.subcategory_name_snapshot,''))  LIKE lower($3) OR
        lower(coalesce(i.attribute_summary_snapshot,'')) LIKE lower($3) OR
        lower(coalesce(i.color_name_snapshot,''))        LIKE lower($3) OR
        lower(coalesce(i.condition_notes,''))            LIKE lower($3) OR
        lower(coalesce(pii.product_name,''))             LIKE lower($3) OR
        lower(coalesce(i.notes,''))                      LIKE lower($3)
      )`
    }

    const result = await pool.query(
      `SELECT i.id, i.attribute_summary_snapshot AS inv_attribute_summary,
              i.product_type, i.category_name_snapshot AS inv_category_name,
              i.subcategory_name_snapshot AS inv_subcategory_name,
              i.color_name_snapshot AS inv_color_name, i.notes AS inv_notes,
              i.condition_notes AS inv_condition_notes,
              i.grade, i.battery_health, i.ios_version, i.imei, i.serial_number,
              i.status, c.model AS catalog_model, c.storage AS catalog_storage,
              c.color AS catalog_color, i.suggested_price,
              pii.product_name AS purchase_product_name,
              (SELECT image_url FROM product_images pi
                WHERE pi.product_id = i.id AND pi.company_id = i.company_id
                ORDER BY pi.is_primary DESC, pi.created_at ASC LIMIT 1) AS image_url,
              o.id AS offer_id, o.is_active AS offer_active
         FROM inventory i
         LEFT JOIN product_catalog c ON c.id = i.catalog_id
         LEFT JOIN LATERAL (
           SELECT ipi.product_name
             FROM inventory_purchase_items ipi
            WHERE ipi.inventory_id = i.id
              AND ipi.company_id = i.company_id
            ORDER BY ipi.created_at DESC
            LIMIT 1
         ) pii ON TRUE
         LEFT JOIN reseller_product_offers o
           ON o.inventory_item_id = i.id
          AND o.reseller_id = $2::uuid
          AND COALESCE(o.source_type, 'inventory') = 'inventory'
        WHERE ${where}
        ORDER BY i.created_at DESC
        LIMIT 200`,
      params
    )

    data.push(
      ...result.rows.map((r) => {
        const commercialName = buildInventoryCommercialName({
          catalog: r.catalog_model
            ? { model: r.catalog_model, storage: r.catalog_storage, color: r.catalog_color }
            : null,
          productName: r.purchase_product_name,
          productType: r.product_type,
          categoryName: r.inv_category_name,
          subcategoryName: r.inv_subcategory_name,
          attributeSummary: r.inv_attribute_summary,
          color: r.inv_color_name,
          notes: r.inv_notes,
          conditionNotes: r.inv_condition_notes,
          allowRawNotes: true,
        })

        return {
          sourceType: "inventory",
          sourceId: r.id,
          productName: commercialName.name,
          nameIncomplete: commercialName.isIncomplete,
          storage: r.catalog_storage || r.inv_attribute_summary || null,
          color: r.catalog_color || r.inv_color_name || null,
          grade: r.grade,
          condition: null,
          batteryHealth: r.battery_health,
          identifier: maskIdentifier(r.imei || r.serial_number || null),
          originLabel: "Estoque Nobretech",
          supplierName: null,
          supplierReferencePrice: null,
          suggestedPrice: r.suggested_price == null ? null : Number(r.suggested_price),
          availabilityLabel: "Pronta entrega Nobretech",
          status: r.status,
          imageUrl: r.image_url || null,
          alreadyOffered: Boolean(r.offer_id),
          offerActive: r.offer_active ?? null,
        }
      })
    )
  }

  if (includeSupplier) {
    const params: unknown[] = [gate.companyId, id, ["available"]]
    let where = "so.company_id = $1::uuid AND so.status = ANY($3::text[])"
    if (search) {
      params.push(`%${search}%`)
      where += ` AND (
        lower(coalesce(so.model,''))        LIKE lower($4) OR
        lower(coalesce(so.category,''))     LIKE lower($4) OR
        lower(coalesce(so.storage,''))      LIKE lower($4) OR
        lower(coalesce(so.size,''))         LIKE lower($4) OR
        lower(coalesce(so.color,''))        LIKE lower($4) OR
        lower(coalesce(so.brand,''))        LIKE lower($4) OR
        lower(coalesce(so.source_line,''))  LIKE lower($4) OR
        lower(coalesce(s.name,''))          LIKE lower($4)
      )`
    }

    const result = await pool.query(
      `SELECT so.id, so.model, so.category, so.storage, so.size, so.color,
              so.brand, so.condition, so.internal_grade AS grade,
              so.battery_health, so.warranty_label, so.supplier_price,
              so.suggested_sale_price, so.status, so.updated_at,
              s.name AS supplier_name, s.id AS supplier_id,
              o.id AS offer_id, o.is_active AS offer_active
         FROM supplier_offers so
         LEFT JOIN suppliers s ON s.id = so.supplier_id
         LEFT JOIN reseller_product_offers o
           ON o.supplier_offer_id = so.id
          AND o.reseller_id = $2::uuid
          AND o.source_type = 'supplier'
        WHERE ${where}
        ORDER BY COALESCE(s.name, '') ASC, COALESCE(so.model, '') ASC, so.updated_at DESC
        LIMIT 300`,
      params
    )

    data.push(
      ...result.rows.map((r) => {
        const commercialName = buildSupplierCommercialName(r)

        return {
          sourceType: "supplier",
          sourceId: r.id,
          productName: commercialName.name,
          nameIncomplete: commercialName.isIncomplete,
          storage: r.storage || r.size || null,
          color: r.color || null,
          grade: r.grade,
          condition: r.condition,
          batteryHealth: r.condition === "sealed" ? null : r.battery_health == null ? null : Number(r.battery_health),
          identifier: null,
          originLabel: "Catálogo parceiro",
          supplierName: r.supplier_name,
          supplierId: r.supplier_id,
          supplierReferencePrice: r.supplier_price == null ? null : Number(r.supplier_price),
          suggestedPrice: r.suggested_sale_price == null ? null : Number(r.suggested_sale_price),
          availabilityLabel: "Disponibilidade sob confirmação",
          status: r.status,
          imageUrl: null,
          alreadyOffered: Boolean(r.offer_id),
          offerActive: r.offer_active ?? null,
        }
      })
    )
  }

  return ok(data)
}
