export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import {
  getInventoryCommercialStatus,
  getInventoryLogisticsStatus,
} from "@/lib/inventory-logistics"
import { isMainDisclosureSuggestionProduct } from "@/lib/marketing/product-suggestions"

export interface MarketingSuggestion {
  id: string
  name: string
  category: string
  brand: string | null
  suggested_price: number | null
  quantity: number
  lastPromotedAt: string | null
  daysSincePromoted: number | null
}

export async function GET() {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  const { companyId } = auth.context

  try {
    const result = await pool.query(
      `SELECT
         i.id,
         i.status,
         i.logistics_status,
         i.commercial_status,
         i.purchase_date,
         i.expected_arrival_date,
         i.received_at,
         i.reserved_at,
         i.quantity,
         i.grade,
         i.imei,
         i.serial_number,
         i.product_type,
         i.category_name_snapshot,
         i.subcategory_name_snapshot,
         i.suggested_price,
         i.notes,
         i.condition_notes,
         pc.model,
         pc.variant,
         pc.category,
         pc.brand,
         pc.storage,
         pc.color,
         v.updated_at AS last_promoted_at
       FROM inventory i
       LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
       LEFT JOIN v_marketing_last_disclosure_by_inventory v
         ON v.company_id = i.company_id AND v.inventory_id = i.id
       WHERE i.company_id = $1::uuid
         AND COALESCE(i.product_type, '') <> 'accessory'
         AND NOT (
           concat_ws(' ', pc.category, i.category_name_snapshot, i.subcategory_name_snapshot, pc.model, pc.variant, i.notes, i.condition_notes)
             ~* '(accessor(y|ies)|acess[oó]rio|acess[oó]rios|capa|case|cover|pel[ií]cula|pelicula|film|carregador|charger|fonte|cabo|cable|caneta|stylus|pencil)'
         )
         AND (
           i.commercial_status = 'available'
           OR (
             i.commercial_status IS NULL
             AND (i.status IS NULL OR i.status NOT IN ('sold','returned','under_repair','reserved'))
           )
         )
         AND (
           i.logistics_status IN ('in_stock','received','supplier_local')
           OR (
             i.logistics_status IS NULL
             AND (i.status IS NULL OR i.status NOT IN ('sold','returned','under_repair'))
           )
         )
       ORDER BY
         v.updated_at ASC NULLS FIRST,
         i.quantity DESC NULLS LAST,
         i.created_at DESC
       LIMIT 100`,
      [companyId]
    )

    const now = Date.now()
    const suggestions: MarketingSuggestion[] = []

    for (const row of result.rows) {
      const category = (row.category as string | null) ?? ""

      const operationalItem = {
        status: row.status,
        logistics_status: row.logistics_status,
        commercial_status: row.commercial_status,
        purchase_date: row.purchase_date,
        expected_arrival_date: row.expected_arrival_date,
        received_at: row.received_at,
        reserved_at: row.reserved_at,
        quantity: row.quantity,
        grade: row.grade,
        imei: row.imei,
        serial_number: row.serial_number,
      }

      if (getInventoryCommercialStatus(operationalItem) !== "available") continue
      if (getInventoryLogisticsStatus(operationalItem) !== "in_stock") continue

      const qty = row.quantity != null ? Number(row.quantity) : 1
      if (qty <= 0) continue

      let name = ""
      const customName = (row.notes as string | null)?.match(/^Nome:\s*(.+)$/i)?.[1]?.trim()
      if (customName) {
        name = customName
      } else if (row.model) {
        name = [row.model, row.variant, row.storage, row.color].filter(Boolean).join(" ")
      } else {
        name = (row.subcategory_name_snapshot as string | null) || category || "Produto"
      }

      if (!isMainDisclosureSuggestionProduct({
        productType: row.product_type as string | null,
        category,
        categoryName: row.category_name_snapshot as string | null,
        subcategoryName: row.subcategory_name_snapshot as string | null,
        model: row.model as string | null,
        name,
        notes: row.notes as string | null,
        conditionNotes: row.condition_notes as string | null,
        hasDeviceIdentifier: Boolean(row.imei || row.serial_number),
      })) continue

      const lastPromotedAt = row.last_promoted_at
        ? (row.last_promoted_at as Date).toISOString()
        : null

      const daysSincePromoted = lastPromotedAt
        ? Math.floor((now - new Date(lastPromotedAt).getTime()) / 86_400_000)
        : null

      suggestions.push({
        id: row.id as string,
        name,
        category,
        brand: (row.brand as string | null) ?? null,
        suggested_price: row.suggested_price != null ? Number(row.suggested_price) : null,
        quantity: qty,
        lastPromotedAt,
        daysSincePromoted,
      })

      if (suggestions.length >= 5) break
    }

    return NextResponse.json({ data: suggestions, error: null })
  } catch (err) {
    console.error("[marketing/suggestions] query failed", err)
    return NextResponse.json(
      { data: null, error: { message: "Não foi possível carregar sugestões." } },
      { status: 500 }
    )
  }
}
