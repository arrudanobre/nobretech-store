import { pool } from "@/lib/db"
import type { PoolClient } from "pg"

export type InventoryItemVariant = {
  id: string
  inventory_id: string
  catalog_color_id: string | null
  color_name: string
  color_hex: string | null
  quantity: number
  unit_cost: number | null
  suggested_price: number | null
  created_at: string
  updated_at: string
}

export type VariantInput = {
  id?: string | null
  catalog_color_id?: string | null
  color_name: string
  color_hex?: string | null
  quantity: number
  unit_cost?: number | null
  suggested_price?: number | null
}

const ACCESSORY_TEXT_RE =
  /(acess[oó]rio|accessory|capa|carregador|pel[ií]cula|cabo|suporte|adaptador|fonte|fone|case)/i

export function shouldAllowInventoryVariants(item: {
  imei?: string | null
  serial_number?: string | null
  product_type?: string | null
  category_name_snapshot?: string | null
  notes?: string | null
  condition_notes?: string | null
}): boolean {
  if (item.imei || item.serial_number) return false
  if (item.product_type === "device") return false
  if (item.product_type === "accessory") return true
  const text = `${item.category_name_snapshot || ""} ${item.notes || ""} ${item.condition_notes || ""}`.toLowerCase()
  return ACCESSORY_TEXT_RE.test(text)
}

export async function getInventoryVariants(
  companyId: string,
  inventoryId: string
): Promise<InventoryItemVariant[]> {
  const result = await pool.query<InventoryItemVariant>(
    `SELECT id, inventory_id, catalog_color_id, color_name, color_hex,
            quantity, unit_cost, suggested_price, created_at, updated_at
     FROM inventory_item_variants
     WHERE company_id = $1::uuid AND inventory_id = $2::uuid
     ORDER BY created_at ASC`,
    [companyId, inventoryId]
  )
  return result.rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    suggested_price: row.suggested_price == null ? null : Number(row.suggested_price),
  }))
}

export async function saveInventoryVariants(
  companyId: string,
  inventoryId: string,
  variants: VariantInput[]
): Promise<{ totalQuantity: number }> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query(
      `DELETE FROM inventory_item_variants WHERE company_id = $1::uuid AND inventory_id = $2::uuid`,
      [companyId, inventoryId]
    )

    let totalQuantity = 0
    for (const variant of variants) {
      const qty = Math.max(0, Math.floor(Number(variant.quantity) || 0))
      if (qty > 0 && variant.color_name?.trim()) {
        totalQuantity += qty
        await client.query(
          `INSERT INTO inventory_item_variants
             (company_id, inventory_id, catalog_color_id, color_name, color_hex, quantity, unit_cost, suggested_price)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)`,
          [
            companyId,
            inventoryId,
            variant.catalog_color_id || null,
            variant.color_name.trim(),
            variant.color_hex || null,
            qty,
            variant.unit_cost ?? null,
            variant.suggested_price ?? null,
          ]
        )
      }
    }

    if (variants.length > 0) {
      await client.query(
        `UPDATE inventory SET quantity = $1 WHERE id = $2::uuid AND company_id = $3::uuid`,
        [totalQuantity, inventoryId, companyId]
      )
    }

    await client.query("COMMIT")
    return { totalQuantity }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function getVariantSummariesForInventoryIds(
  companyId: string,
  inventoryIds: string[]
): Promise<Record<string, InventoryItemVariant[]>> {
  if (inventoryIds.length === 0) return {}
  const result = await pool.query<InventoryItemVariant & { inventory_id: string }>(
    `SELECT id, inventory_id, catalog_color_id, color_name, color_hex,
            quantity, unit_cost, suggested_price, created_at, updated_at
     FROM inventory_item_variants
     WHERE company_id = $1::uuid AND inventory_id = ANY($2::uuid[])
     ORDER BY inventory_id, created_at ASC`,
    [companyId, inventoryIds]
  )
  const byInventoryId: Record<string, InventoryItemVariant[]> = {}
  for (const row of result.rows) {
    const key = row.inventory_id
    const list = byInventoryId[key] || []
    list.push({
      ...row,
      quantity: Number(row.quantity),
      unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
      suggested_price: row.suggested_price == null ? null : Number(row.suggested_price),
    })
    byInventoryId[key] = list
  }
  return byInventoryId
}

export async function decrementInventoryVariantQuantity(params: {
  client: PoolClient
  companyId: string
  inventoryId: string
  variantId: string
  quantity: number
  emptyStockStatus: "sold" | "reserved"
}): Promise<{ variantName: string; variantQuantity: number; totalQuantity: number }> {
  const requestedQuantity = Math.max(1, Math.floor(Number(params.quantity) || 1))
  const variantRes = await params.client.query<{
    color_name: string
    quantity: string | number
  }>(
    `SELECT color_name, quantity
     FROM inventory_item_variants
     WHERE id = $1::uuid AND inventory_id = $2::uuid AND company_id = $3::uuid
     FOR UPDATE`,
    [params.variantId, params.inventoryId, params.companyId]
  )

  if ((variantRes.rowCount ?? 0) === 0) {
    throw new Error("Variação de estoque não encontrada para este item.")
  }

  const variant = variantRes.rows[0]
  const currentQuantity = Number(variant.quantity || 0)
  if (!Number.isFinite(currentQuantity) || currentQuantity < requestedQuantity) {
    throw new Error(`Estoque insuficiente para a variação ${variant.color_name}. Disponível: ${Math.max(0, currentQuantity || 0)}.`)
  }

  const nextVariantQuantity = currentQuantity - requestedQuantity
  await params.client.query(
    `UPDATE inventory_item_variants
     SET quantity = $1, updated_at = NOW()
     WHERE id = $2::uuid AND inventory_id = $3::uuid AND company_id = $4::uuid`,
    [nextVariantQuantity, params.variantId, params.inventoryId, params.companyId]
  )

  const totalRes = await params.client.query<{ total_quantity: string | number }>(
    `SELECT COALESCE(SUM(quantity), 0) AS total_quantity
     FROM inventory_item_variants
     WHERE inventory_id = $1::uuid AND company_id = $2::uuid`,
    [params.inventoryId, params.companyId]
  )
  const totalQuantity = Number(totalRes.rows[0]?.total_quantity || 0)

  await params.client.query(
    `UPDATE inventory
     SET quantity = $1,
         status = $2,
         logistics_status = $3,
         commercial_status = $4,
         updated_at = NOW()
     WHERE id = $5::uuid AND company_id = $6::uuid`,
    [
      totalQuantity,
      totalQuantity > 0 ? "in_stock" : params.emptyStockStatus,
      totalQuantity > 0 || params.emptyStockStatus === "reserved" ? "in_stock" : "unavailable",
      totalQuantity > 0 ? "available" : params.emptyStockStatus === "reserved" ? "reserved" : "sold",
      params.inventoryId,
      params.companyId,
    ]
  )

  return {
    variantName: variant.color_name,
    variantQuantity: nextVariantQuantity,
    totalQuantity,
  }
}

export async function restoreInventoryVariantQuantity(params: {
  client: PoolClient
  companyId: string
  inventoryId: string
  variantId: string
  quantity: number
}): Promise<{ variantName: string; variantQuantity: number; totalQuantity: number }> {
  const restoreQuantity = Math.max(1, Math.floor(Number(params.quantity) || 1))
  const variantRes = await params.client.query<{
    color_name: string
    quantity: string | number
  }>(
    `SELECT color_name, quantity
     FROM inventory_item_variants
     WHERE id = $1::uuid AND inventory_id = $2::uuid AND company_id = $3::uuid
     FOR UPDATE`,
    [params.variantId, params.inventoryId, params.companyId]
  )

  if ((variantRes.rowCount ?? 0) === 0) {
    throw new Error("Variação de estoque não encontrada para devolver este item.")
  }

  const variant = variantRes.rows[0]
  const currentQuantity = Number(variant.quantity || 0)
  const nextVariantQuantity = Math.max(0, currentQuantity) + restoreQuantity

  await params.client.query(
    `UPDATE inventory_item_variants
     SET quantity = $1, updated_at = NOW()
     WHERE id = $2::uuid AND inventory_id = $3::uuid AND company_id = $4::uuid`,
    [nextVariantQuantity, params.variantId, params.inventoryId, params.companyId]
  )

  const totalRes = await params.client.query<{ total_quantity: string | number }>(
    `SELECT COALESCE(SUM(quantity), 0) AS total_quantity
     FROM inventory_item_variants
     WHERE inventory_id = $1::uuid AND company_id = $2::uuid`,
    [params.inventoryId, params.companyId]
  )
  const totalQuantity = Number(totalRes.rows[0]?.total_quantity || 0)

  await params.client.query(
    `UPDATE inventory
     SET quantity = $1,
         status = 'in_stock',
         logistics_status = 'in_stock',
         commercial_status = 'available',
         updated_at = NOW()
     WHERE id = $2::uuid AND company_id = $3::uuid`,
    [totalQuantity, params.inventoryId, params.companyId]
  )

  return {
    variantName: variant.color_name,
    variantQuantity: nextVariantQuantity,
    totalQuantity,
  }
}
