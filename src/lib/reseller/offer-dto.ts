import { buildInventoryCommercialName, buildSupplierCommercialName } from "@/lib/reseller/product-name"

// Raw joined row coming from the reseller portal query. Only commercial /
// non-sensitive columns are ever selected into this shape. purchase_price,
// supplier, internal_notes and any margin field are intentionally absent.
export type ResellerOfferRow = {
  offer_id: string
  source_type: "inventory" | "supplier"
  reseller_price: string | number
  suggested_sale_price: string | number | null
  visible_notes: string | null
  available_until: string | null
  catalog_model: string | null
  catalog_storage: string | null
  catalog_color: string | null
  inv_product_type: string | null
  inv_category_name: string | null
  inv_subcategory_name: string | null
  inv_attribute_summary: string | null
  inv_color_name: string | null
  inv_notes: string | null
  inv_condition_notes: string | null
  grade: string | null
  battery_health: number | null
  warranty_months: number | null
  ios_version: string | null
  photos: string[] | null
  image_url: string | null
  supplier_model: string | null
  supplier_storage: string | null
  supplier_size: string | null
  supplier_color: string | null
  supplier_category: string | null
  supplier_brand: string | null
  supplier_condition: string | null
  supplier_grade: string | null
  supplier_battery_health: number | null
  request_type: string | null
  request_status: string | null
  request_created_at: string | null
  request_updated_at: string | null
}

export type ResellerOfferDTO = {
  offerId: string
  sourceType: "inventory" | "supplier"
  originLabel: string
  productName: string
  storage: string | null
  color: string | null
  grade: string | null
  batteryHealth: number | null
  warrantyMonths: number | null
  iosVersion: string | null
  imageUrl: string | null
  resellerPrice: number
  suggestedSalePrice: number | null
  visibleNotes: string | null
  availableUntil: string | null
  requestStatus: string | null
  requestType: string | null
  requestCreatedAt: string | null
  requestUpdatedAt: string | null
  availabilityLabel: string
}

export function toResellerOfferDTO(row: ResellerOfferRow): ResellerOfferDTO {
  const isSupplier = row.source_type === "supplier"
  const productName = isSupplier
    ? buildSupplierCommercialName({
        model: row.supplier_model,
        storage: row.supplier_storage,
        size: row.supplier_size,
        color: row.supplier_color,
        category: row.supplier_category,
        brand: row.supplier_brand,
      }).name
    : buildInventoryCommercialName({
        catalog: row.catalog_model
          ? {
              model: row.catalog_model || undefined,
              storage: row.catalog_storage || undefined,
              color: row.catalog_color || undefined,
            }
          : null,
        productType: row.inv_product_type,
        categoryName: row.inv_category_name,
        subcategoryName: row.inv_subcategory_name,
        attributeSummary: row.inv_attribute_summary,
        color: row.inv_color_name,
        notes: row.inv_notes,
        conditionNotes: row.inv_condition_notes,
      }).name

  const photo = row.image_url || (Array.isArray(row.photos) ? row.photos[0] : null) || null

  return {
    offerId: row.offer_id,
    sourceType: row.source_type,
    originLabel: isSupplier ? "Produto com fornecedor" : "Estoque Nobretech",
    productName,
    storage: isSupplier ? row.supplier_storage || row.supplier_size || null : row.catalog_storage || row.inv_attribute_summary || null,
    color: isSupplier ? row.supplier_color || null : row.catalog_color || row.inv_color_name || null,
    grade: isSupplier ? row.supplier_grade || row.supplier_condition : row.grade,
    batteryHealth: isSupplier && row.supplier_condition === "sealed" ? null : isSupplier ? row.supplier_battery_health : row.battery_health,
    warrantyMonths: isSupplier ? null : row.warranty_months,
    iosVersion: row.ios_version,
    imageUrl: isSupplier ? null : photo,
    resellerPrice: Number(row.reseller_price),
    suggestedSalePrice: row.suggested_sale_price == null ? null : Number(row.suggested_sale_price),
    visibleNotes: row.visible_notes,
    availableUntil: row.available_until,
    requestStatus: row.request_status ?? null,
    requestType: row.request_type ?? null,
    requestCreatedAt: row.request_created_at ?? null,
    requestUpdatedAt: row.request_updated_at ?? null,
    availabilityLabel: isSupplier ? "Disponibilidade sob confirmação" : "Pronta entrega Nobretech",
  }
}
