export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import {
  getInventoryCommercialStatus,
  getInventoryLogisticsStatus,
} from "@/lib/inventory-logistics"
import type { MarketingProduct } from "@/lib/marketing/copy-generator"

export async function GET() {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  const { companyId } = auth.context

  let result
  try {
    result = await pool.query(
      `SELECT
         i.id,
         i.imei,
         i.serial_number,
         i.grade,
         i.status,
         i.logistics_status,
         i.commercial_status,
         i.suggested_price,
         i.purchase_price,
         i.quantity,
         i.battery_health,
         i.condition_notes,
         i.notes,
         i.product_type,
         i.purchase_date,
         i.expected_arrival_date,
         i.received_at,
         i.reserved_at,
         pc.id   AS catalog_id,
         pc.model,
         pc.category,
         pc.variant,
         pc.storage,
         pc.color,
         pc.brand
       FROM inventory i
       LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
       WHERE i.company_id = $1::uuid
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
       ORDER BY i.created_at DESC
       LIMIT 300`,
      [companyId]
    )
  } catch (err) {
    console.error("[marketing/products] inventory query failed", err)
    return NextResponse.json(
      { data: null, error: { message: "Não foi possível carregar os produtos do estoque." } },
      { status: 500 }
    )
  }

  const ids: string[] = result.rows.map((r) => r.id)

  type VariantRow = { inventory_id: string; color_name: string; quantity: string | number; suggested_price: string | number | null }
  const variantsByItem: Record<string, MarketingProduct["variants"]> = {}

  if (ids.length > 0) {
    let varResult
    try {
      varResult = await pool.query<VariantRow>(
        `SELECT inventory_id, color_name, quantity, suggested_price
         FROM inventory_item_variants
         WHERE company_id = $1::uuid AND inventory_id = ANY($2::uuid[])
         ORDER BY created_at ASC`,
        [companyId, ids]
      )
    } catch (err) {
      console.error("[marketing/products] variants query failed", err)
      varResult = { rows: [] as VariantRow[] }
    }
    for (const row of varResult.rows) {
      const qty = Number(row.quantity)
      if (qty <= 0) continue
      if (!variantsByItem[row.inventory_id]) variantsByItem[row.inventory_id] = []
      variantsByItem[row.inventory_id].push({
        color_name: row.color_name,
        quantity: qty,
        suggested_price: row.suggested_price != null ? Number(row.suggested_price) : null,
      })
    }
  }

  const items: MarketingProduct[] = []

  for (const row of result.rows) {
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
      purchase_price: row.purchase_price != null ? Number(row.purchase_price) : null,
      catalog_id: (row.catalog_id as string | null) ?? null,
      category: (row.category as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      condition_notes: (row.condition_notes as string | null) ?? null,
    }

    const commercialStatus = getInventoryCommercialStatus(operationalItem)
    if (commercialStatus !== "available") continue

    const logisticsStatus = getInventoryLogisticsStatus(operationalItem)
    if (logisticsStatus !== "in_stock") continue

    const variants = variantsByItem[row.id] ?? []
    const totalQuantity =
      variants.length > 0
        ? variants.reduce((s, v) => s + v.quantity, 0)
        : row.quantity != null
        ? Number(row.quantity)
        : 1

    if (totalQuantity <= 0) continue

    let name = ""
    const customName = (row.notes as string | null)?.match(/^Nome:\s*(.+)$/i)?.[1]?.trim()
    if (customName) {
      name = customName
    } else if (row.model) {
      name = [row.model, row.storage, row.color].filter(Boolean).join(" ")
    } else if (row.notes) {
      name = (row.notes as string).replace(/^Acess[oó]rio:\s*/i, "").trim()
    } else if (row.condition_notes) {
      const m = (row.condition_notes as string).match(/^Acess[oó]rio:\s*(.+)$/i)
      name = m ? m[1].trim() : row.condition_notes
    } else {
      name = "Produto"
    }

    items.push({
      id: row.id,
      name,
      category: (row.category as string | null) ?? null,
      storage: (row.storage as string | null) ?? null,
      color: (row.color as string | null) ?? null,
      brand: (row.brand as string | null) ?? null,
      grade: (row.grade as string | null) ?? null,
      battery_health: row.battery_health != null ? Number(row.battery_health) : null,
      suggested_price: row.suggested_price != null ? Number(row.suggested_price) : null,
      quantity: totalQuantity,
      commercial_status: commercialStatus,
      notes: (row.notes as string | null) ?? null,
      has_imei: Boolean(row.imei || row.serial_number),
      variants,
    })
  }

  return NextResponse.json({ data: items, error: null })
}
