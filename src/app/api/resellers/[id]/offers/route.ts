import { pool } from "@/lib/db"
import { badRequest, ok, requireResellerAdmin } from "@/lib/reseller/admin"
import { isOperationallyAvailable, operationallyAvailableSql } from "@/lib/inventory/availability"
import { buildInventoryCommercialName, buildSupplierCommercialName } from "@/lib/reseller/product-name"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : NaN as unknown as number
}

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const result = await pool.query(
    `SELECT o.id, COALESCE(o.source_type, 'inventory') AS source_type,
            o.inventory_item_id, o.supplier_offer_id, o.is_active, o.reseller_price,
            o.suggested_sale_price, o.visible_notes, o.internal_notes,
            o.available_until, o.created_at, o.updated_at,
            i.status AS inv_status, i.grade, i.battery_health,
            NULL::integer AS warranty_months,
            i.product_type AS inv_product_type,
            i.category_name_snapshot AS inv_category_name,
            i.subcategory_name_snapshot AS inv_subcategory_name,
            i.attribute_summary_snapshot AS inv_attribute_summary,
            i.color_name_snapshot AS inv_color_name, i.notes AS inv_notes,
            i.condition_notes AS inv_condition_notes, i.imei,
            c.model AS catalog_model, c.storage AS catalog_storage, c.color AS catalog_color,
            so.model AS so_model, so.storage AS so_storage, so.size AS so_size,
            so.color AS so_color, so.category AS so_category, so.brand AS so_brand,
            so.condition AS so_condition,
            so.internal_grade AS so_grade, so.battery_health AS so_battery_health,
            so.supplier_price AS so_supplier_price, so.status AS so_status,
            s.name AS supplier_name
       FROM reseller_product_offers o
       LEFT JOIN inventory i ON i.id = o.inventory_item_id
       LEFT JOIN product_catalog c ON c.id = i.catalog_id
       LEFT JOIN supplier_offers so ON so.id = o.supplier_offer_id
       LEFT JOIN suppliers s ON s.id = so.supplier_id
      WHERE o.reseller_id = $1::uuid AND o.company_id = $2::uuid
      ORDER BY o.created_at DESC`,
    [id, gate.companyId]
  )

  const offers = result.rows.map((r) => ({
    id: r.id,
    sourceType: r.source_type,
    inventoryItemId: r.inventory_item_id,
    supplierOfferId: r.supplier_offer_id,
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
    storage: r.source_type === "supplier" ? r.so_storage || r.so_size || null : r.catalog_storage || r.inv_attribute_summary || null,
    color: r.source_type === "supplier" ? r.so_color || null : r.catalog_color || r.inv_color_name || null,
    grade: r.source_type === "supplier" ? r.so_grade || r.so_condition : r.grade,
    batteryHealth: r.source_type === "supplier" && r.so_condition === "sealed" ? null : r.source_type === "supplier" ? r.so_battery_health : r.battery_health,
    warrantyMonths: r.warranty_months,
    originLabel: r.source_type === "supplier" ? "Catálogo parceiro" : "Estoque Nobretech",
    supplierName: r.source_type === "supplier" ? r.supplier_name : null,
    supplierReferencePrice: r.source_type === "supplier" && r.so_supplier_price != null ? Number(r.so_supplier_price) : null,
    availabilityLabel: r.source_type === "supplier" ? "Disponibilidade sob confirmação" : "Pronta entrega Nobretech",
    isActive: r.is_active,
    resellerPrice: Number(r.reseller_price),
    suggestedSalePrice: r.suggested_sale_price == null ? null : Number(r.suggested_sale_price),
    visibleNotes: r.visible_notes,
    internalNotes: r.internal_notes,
    availableUntil: r.available_until,
    inventoryStatus: r.inv_status,
    supplierStatus: r.so_status,
    stillAvailable: r.source_type === "supplier" ? r.so_status === "available" : isOperationallyAvailable(r.inv_status),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  return ok(offers)
}

export async function POST(request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  const sourceType = String(body?.sourceType || (body?.supplierOfferId ? "supplier" : "inventory")).trim()
  const inventoryItemId = String(body?.inventoryItemId || body?.sourceId || "").trim()
  const supplierOfferId = String(body?.supplierOfferId || (sourceType === "supplier" ? body?.sourceId : "") || "").trim()
  const resellerPrice = parsePrice(body?.resellerPrice)
  const suggested = parsePrice(body?.suggestedSalePrice)
  const visibleNotes = body?.visibleNotes ? String(body.visibleNotes).trim() : null
  const internalNotes = body?.internalNotes ? String(body.internalNotes).trim() : null
  const availableUntil = body?.availableUntil ? String(body.availableUntil) : null

  if (sourceType !== "inventory" && sourceType !== "supplier") return badRequest("Origem inválida")
  if (sourceType === "inventory" && !inventoryItemId) return badRequest("Selecione o produto do estoque")
  if (sourceType === "supplier" && !supplierOfferId) return badRequest("Selecione o produto do catálogo parceiro")
  if (resellerPrice === null || Number.isNaN(resellerPrice))
    return badRequest("Informe o preço de repasse em reais")
  if (Number.isNaN(suggested)) return badRequest("Preço sugerido inválido")
  if (suggested !== null && suggested < resellerPrice)
    return badRequest("O preço sugerido deve ser maior ou igual ao preço de repasse")

  // The reseller must belong to this company.
  const reseller = await pool.query(
    `SELECT 1 FROM resellers WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1`,
    [id, gate.companyId]
  )
  if (!reseller.rowCount) return badRequest("Revendedor não encontrado")

  if (sourceType === "inventory") {
    // Releasing an offer never changes the inventory cost or status.
    const inv = await pool.query(
      `SELECT id FROM inventory i
        WHERE i.id = $1::uuid AND i.company_id = $2::uuid
          AND i.type = 'own' AND ${operationallyAvailableSql("i")}
        LIMIT 1`,
      [inventoryItemId, gate.companyId]
    )
    if (!inv.rowCount) return badRequest("Este item não está disponível para venda")
  } else {
    // Supplier offers are commercial opportunities. They can be released to the
    // reseller catalog only while still available, without creating inventory.
    const supplier = await pool.query<{ id: string; supplier_price: string | number | null }>(
      `SELECT id, supplier_price FROM supplier_offers
        WHERE id = $1::uuid AND company_id = $2::uuid AND status = 'available'
        LIMIT 1`,
      [supplierOfferId, gate.companyId]
    )
    if (!supplier.rowCount) return badRequest("Esta oferta de fornecedor não está disponível")
    const supplierPrice = supplier.rows[0].supplier_price == null ? null : Number(supplier.rows[0].supplier_price)
    if (supplierPrice != null && Number.isFinite(supplierPrice) && resellerPrice < supplierPrice) {
      return badRequest("O repasse não pode ser menor que o preço de fornecedor")
    }
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO reseller_product_offers
         (company_id, reseller_id, source_type, inventory_item_id, supplier_offer_id,
          is_active, reseller_price, suggested_sale_price, visible_notes,
          internal_notes, available_until)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, TRUE, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        gate.companyId,
        id,
        sourceType,
        sourceType === "inventory" ? inventoryItemId : null,
        sourceType === "supplier" ? supplierOfferId : null,
        resellerPrice,
        suggested,
        visibleNotes,
        internalNotes,
        availableUntil,
      ]
    )
    return ok({ id: inserted.rows[0].id })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ""
    if (msg.includes("idx_reseller_offers_unique"))
      return badRequest("Este produto já foi liberado para este revendedor")
    return badRequest(msg || "Erro ao criar oferta")
  }
}
