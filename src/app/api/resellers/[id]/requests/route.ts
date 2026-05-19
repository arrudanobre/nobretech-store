import { pool } from "@/lib/db"
import { badRequest, ok, requireResellerAdmin } from "@/lib/reseller/admin"
import { buildInventoryCommercialName, buildSupplierCommercialName } from "@/lib/reseller/product-name"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const VALID_STATUS = new Set(["pending", "approved", "rejected", "completed", "canceled"])

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const result = await pool.query(
    `SELECT rr.id, rr.type, rr.status, rr.customer_name_optional, rr.customer_phone_optional,
            rr.notes, rr.created_at, rr.updated_at,
            COALESCE(o.source_type, 'inventory') AS source_type,
            i.product_type AS inv_product_type,
            i.category_name_snapshot AS inv_category_name,
            i.subcategory_name_snapshot AS inv_subcategory_name,
            i.attribute_summary_snapshot AS inv_attribute_summary,
            i.color_name_snapshot AS inv_color_name, i.notes AS inv_notes,
            i.condition_notes AS inv_condition_notes, i.imei,
            c.model AS catalog_model, c.storage AS catalog_storage, c.color AS catalog_color,
            so.model AS so_model, so.storage AS so_storage, so.size AS so_size,
            so.color AS so_color, so.category AS so_category, so.brand AS so_brand
       FROM reseller_requests rr
       LEFT JOIN reseller_product_offers o ON o.id = rr.offer_id
       LEFT JOIN inventory i ON i.id = COALESCE(rr.inventory_item_id, o.inventory_item_id)
       LEFT JOIN product_catalog c ON c.id = i.catalog_id
       LEFT JOIN supplier_offers so ON so.id = o.supplier_offer_id
      WHERE rr.reseller_id = $1::uuid AND rr.company_id = $2::uuid
      ORDER BY rr.created_at DESC`,
    [id, gate.companyId]
  )

  const requests = result.rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    customerName: r.customer_name_optional,
    customerPhone: r.customer_phone_optional,
    notes: r.notes,
    sourceType: r.source_type,
    originLabel: r.source_type === "supplier" ? "Catálogo parceiro" : "Estoque Nobretech",
    productName:
      r.source_type === "supplier"
        ? buildSupplierCommercialName({
            model: r.so_model,
            storage: r.so_storage,
            size: r.so_size,
            color: r.so_color,
            category: r.so_category,
            brand: r.so_brand,
          }).name
        : buildInventoryCommercialName({
            catalog: r.catalog_model
              ? { model: r.catalog_model, storage: r.catalog_storage, color: r.catalog_color }
              : null,
            productType: r.inv_product_type,
            categoryName: r.inv_category_name,
            subcategoryName: r.inv_subcategory_name,
            attributeSummary: r.inv_attribute_summary,
            color: r.inv_color_name,
            notes: r.inv_notes,
            conditionNotes: r.inv_condition_notes,
            allowRawNotes: true,
          }).name,
    imei: r.imei,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  return ok(requests)
}

// Admin updates a request status. This never registers an official sale —
// the official sale stays in the normal ERP flow.
export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  const requestId = String(body?.requestId || "").trim()
  const status = String(body?.status || "").trim()

  if (!requestId) return badRequest("Solicitação não informada")
  if (!VALID_STATUS.has(status)) return badRequest("Status inválido")

  const updated = await pool.query(
    `UPDATE reseller_requests SET status = $1, updated_at = NOW()
      WHERE id = $2::uuid AND reseller_id = $3::uuid AND company_id = $4::uuid
      RETURNING id, status`,
    [status, requestId, id, gate.companyId]
  )
  if (!updated.rows[0]) return badRequest("Solicitação não encontrada")
  return ok(updated.rows[0])
}
