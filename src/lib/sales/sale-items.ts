import "server-only"

import type { PoolClient } from "pg"
import { pool } from "@/lib/db"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

export type SaleItemSourceTable = "sales" | "sales_additional_items"
export type SaleItemRole = "main" | "upsell" | "gift" | "accessory" | "service" | "other"
export type SaleItemType = "device" | "accessory" | "service" | "other"

export type SaleItem = {
  id: string
  companyId: string
  saleId: string
  inventoryItemId: string | null
  sourceTable: SaleItemSourceTable
  sourceId: string | null
  itemRole: SaleItemRole
  itemType: SaleItemType
  displayName: string
  quantity: number
  unitPrice: number | null
  totalPrice: number | null
  unitCost: number | null
  totalCost: number | null
  isGift: boolean
  sortOrder: number
  metadata: Record<string, unknown>
  active: boolean
  createdAt: string
  updatedAt: string
}

export type SaleItemsSummary = {
  saleId: string
  itemCount: number
  activeItemCount: number
  giftCount: number
  upsellCount: number
  totalPrice: number
  totalCost: number
}

type SaleItemRow = {
  id: string
  company_id: string
  sale_id: string
  inventory_item_id: string | null
  source_table: SaleItemSourceTable
  source_id: string | null
  item_role: SaleItemRole
  item_type: SaleItemType
  display_name: string
  quantity: number
  unit_price: string | number | null
  total_price: string | number | null
  unit_cost: string | number | null
  total_cost: string | number | null
  is_gift: boolean
  sort_order: number
  metadata: Record<string, unknown> | null
  active: boolean
  created_at: Date | string
  updated_at: Date | string
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toISOString(value: Date | string | null | undefined): string {
  if (value == null) return ""
  return value instanceof Date ? value.toISOString() : value
}

function mapSaleItem(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    companyId: row.company_id,
    saleId: row.sale_id,
    inventoryItemId: row.inventory_item_id,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    itemRole: row.item_role,
    itemType: row.item_type,
    displayName: row.display_name,
    quantity: Number(row.quantity),
    unitPrice: toNumber(row.unit_price),
    totalPrice: toNumber(row.total_price),
    unitCost: toNumber(row.unit_cost),
    totalCost: toNumber(row.total_cost),
    isGift: Boolean(row.is_gift),
    sortOrder: Number(row.sort_order),
    metadata: row.metadata ?? {},
    active: Boolean(row.active),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  }
}

export async function getSaleItems(companyId: string, saleId: string): Promise<SaleItem[]> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleId)) return []

  const result = await pool.query<SaleItemRow>(
    `SELECT *
     FROM sale_items
     WHERE company_id = $1
       AND sale_id = $2
     ORDER BY sort_order ASC, created_at ASC, id ASC`,
    [companyId, saleId]
  )
  return result.rows.map(mapSaleItem)
}

export async function getSaleItemById(companyId: string, saleItemId: string): Promise<SaleItem | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleItemId)) return null

  const result = await pool.query<SaleItemRow>(
    `SELECT *
     FROM sale_items
     WHERE company_id = $1
       AND id = $2
     LIMIT 1`,
    [companyId, saleItemId]
  )
  const row = result.rows[0]
  return row ? mapSaleItem(row) : null
}

export async function getSaleItemsByInventoryItem(
  companyId: string,
  inventoryItemId: string
): Promise<SaleItem[]> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(inventoryItemId)) return []

  const result = await pool.query<SaleItemRow>(
    `SELECT *
     FROM sale_items
     WHERE company_id = $1
       AND inventory_item_id = $2
     ORDER BY created_at DESC, sort_order ASC`,
    [companyId, inventoryItemId]
  )
  return result.rows.map(mapSaleItem)
}

export async function getSaleItemsSummary(companyId: string, saleId: string): Promise<SaleItemsSummary | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleId)) return null

  const result = await pool.query<{
    sale_id: string
    item_count: string | number
    active_item_count: string | number
    gift_count: string | number
    upsell_count: string | number
    total_price: string | number | null
    total_cost: string | number | null
  }>(
    `SELECT
       sale_id,
       COUNT(*)::int AS item_count,
       COUNT(*) FILTER (WHERE active = TRUE)::int AS active_item_count,
       COUNT(*) FILTER (WHERE is_gift = TRUE)::int AS gift_count,
       COUNT(*) FILTER (WHERE item_role = 'upsell')::int AS upsell_count,
       COALESCE(SUM(total_price) FILTER (WHERE active = TRUE), 0)::numeric(10,2) AS total_price,
       COALESCE(SUM(total_cost) FILTER (WHERE active = TRUE), 0)::numeric(10,2) AS total_cost
     FROM sale_items
     WHERE company_id = $1
       AND sale_id = $2
     GROUP BY sale_id`,
    [companyId, saleId]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    saleId: row.sale_id,
    itemCount: Number(row.item_count),
    activeItemCount: Number(row.active_item_count),
    giftCount: Number(row.gift_count),
    upsellCount: Number(row.upsell_count),
    totalPrice: toNumber(row.total_price) ?? 0,
    totalCost: toNumber(row.total_cost) ?? 0,
  }
}

async function materializeMainSaleItem(client: PoolClient, companyId: string, saleId: string): Promise<number> {
  const result = await client.query<{ id: string }>(
    `WITH charged_additionals AS (
       SELECT
         sale_id,
         company_id,
         COALESCE(SUM(CASE WHEN type = 'upsell' THEN COALESCE(sale_price, 0) ELSE 0 END), 0)::numeric(10,2)
           AS charged_total
       FROM sales_additional_items
       WHERE company_id = $1
         AND sale_id = $2
       GROUP BY sale_id, company_id
     )
     INSERT INTO sale_items (
       company_id, sale_id, inventory_item_id, source_table, source_id,
       item_role, item_type, display_name, quantity,
       unit_price, total_price, unit_cost, total_cost,
       is_gift, sort_order, metadata, active, created_at
     )
     SELECT
       s.company_id,
       s.id,
       s.inventory_id,
       'sales',
       s.id,
       'main',
       CASE
         WHEN i.product_type IN ('device', 'accessory', 'service', 'other') THEN i.product_type
         WHEN lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%acess%' THEN 'accessory'
         WHEN lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%serv%' THEN 'service'
         ELSE 'device'
       END,
       COALESCE(
         NULLIF(BTRIM(CONCAT_WS(' ', pc.brand, pc.model, pc.variant, pc.storage, pc.color)), ''),
         NULLIF(BTRIM(CONCAT_WS(' ', i.category_name_snapshot, i.subcategory_name_snapshot, i.attribute_summary_snapshot)), ''),
         NULLIF(BTRIM(i.notes), ''),
         'Item principal da venda'
       ),
       1,
       GREATEST(s.sale_price - COALESCE(ca.charged_total, 0), 0)::numeric(10,2),
       GREATEST(s.sale_price - COALESCE(ca.charged_total, 0), 0)::numeric(10,2),
       i.purchase_price,
       i.purchase_price,
       FALSE,
       0,
       jsonb_build_object(
         'source', 'helper_2d1',
         'legacy_source_table', 'sales',
         'legacy_sale_price', s.sale_price,
         'charged_additional_items_total', COALESCE(ca.charged_total, 0),
         'principal_price_allocation', 'sales.sale_price - charged upsell additional items',
         'legacy_warranty_months', s.warranty_months,
         'legacy_warranty_start', s.warranty_start,
         'legacy_warranty_end', s.warranty_end
       ),
       TRUE,
       COALESCE(s.created_at, NOW())
     FROM sales s
     JOIN inventory i ON i.id = s.inventory_id
     LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
     LEFT JOIN charged_additionals ca ON ca.sale_id = s.id AND ca.company_id = s.company_id
     WHERE s.company_id = $1
       AND s.id = $2
       AND NOT EXISTS (
         SELECT 1
         FROM sale_items existing
         WHERE existing.company_id = s.company_id
           AND existing.source_table = 'sales'
           AND existing.source_id = s.id
       )
     RETURNING id`,
    [companyId, saleId]
  )
  return result.rowCount ?? 0
}

async function materializeAdditionalSaleItems(client: PoolClient, companyId: string, saleId: string): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO sale_items (
       company_id, sale_id, inventory_item_id, source_table, source_id,
       item_role, item_type, display_name, quantity,
       unit_price, total_price, unit_cost, total_cost,
       is_gift, sort_order, metadata, active, created_at
     )
     SELECT
       sai.company_id,
       sai.sale_id,
       i.id,
       'sales_additional_items',
       sai.id,
       CASE WHEN sai.type = 'free' THEN 'gift' ELSE 'upsell' END,
       CASE
         WHEN i.id IS NOT NULL AND i.product_type IN ('device', 'accessory', 'service', 'other') THEN i.product_type
         WHEN i.id IS NOT NULL AND lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%acess%' THEN 'accessory'
         WHEN i.id IS NOT NULL AND lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%serv%' THEN 'service'
         WHEN i.id IS NOT NULL THEN 'device'
         ELSE 'other'
       END,
       sai.name,
       1,
       COALESCE(sai.sale_price, 0)::numeric(10,2),
       COALESCE(sai.sale_price, 0)::numeric(10,2),
       sai.cost_price,
       sai.cost_price,
       sai.type = 'free',
       100 + ROW_NUMBER() OVER (PARTITION BY sai.sale_id ORDER BY sai.created_at, sai.id),
       jsonb_build_object(
         'source', 'helper_2d1',
         'legacy_source_table', 'sales_additional_items',
         'legacy_type', sai.type,
         'legacy_product_id', sai.product_id,
         'product_id_matched_inventory', i.id IS NOT NULL,
         'packaging_type', sai.packaging_type,
         'packaging_notes', sai.packaging_notes
       ),
       TRUE,
       COALESCE(sai.created_at, NOW())
     FROM sales_additional_items sai
     JOIN sales s ON s.id = sai.sale_id AND s.company_id = sai.company_id
     LEFT JOIN inventory i ON i.id = sai.product_id AND i.company_id = sai.company_id
     LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
     WHERE sai.company_id = $1
       AND sai.sale_id = $2
       AND NOT EXISTS (
         SELECT 1
         FROM sale_items existing
         WHERE existing.company_id = sai.company_id
           AND existing.source_table = 'sales_additional_items'
           AND existing.source_id = sai.id
       )
     RETURNING id`,
    [companyId, saleId]
  )
  return result.rowCount ?? 0
}

export async function materializeSaleItemsForSale(
  companyId: string,
  saleId: string
): Promise<{ insertedMainItems: number; insertedAdditionalItems: number }> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleId)) {
    return { insertedMainItems: 0, insertedAdditionalItems: 0 }
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const insertedMainItems = await materializeMainSaleItem(client, companyId, saleId)
    const insertedAdditionalItems = await materializeAdditionalSaleItems(client, companyId, saleId)
    await client.query("COMMIT")
    return { insertedMainItems, insertedAdditionalItems }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function ensureSaleItemsForSale(companyId: string, saleId: string): Promise<SaleItem[]> {
  await materializeSaleItemsForSale(companyId, saleId)
  return getSaleItems(companyId, saleId)
}

export async function materializeSaleItemsWithClient(
  client: PoolClient,
  companyId: string,
  saleId: string
): Promise<{ insertedMainItems: number; insertedAdditionalItems: number }> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleId)) {
    return { insertedMainItems: 0, insertedAdditionalItems: 0 }
  }
  const insertedMainItems = await materializeMainSaleItem(client, companyId, saleId)
  const insertedAdditionalItems = await materializeAdditionalSaleItems(client, companyId, saleId)
  return { insertedMainItems, insertedAdditionalItems }
}

export async function getSaleItemsWithClient(
  client: PoolClient,
  companyId: string,
  saleId: string
): Promise<SaleItem[]> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleId)) return []
  const result = await client.query<SaleItemRow>(
    `SELECT *
     FROM sale_items
     WHERE company_id = $1
       AND sale_id = $2
     ORDER BY sort_order ASC, created_at ASC, id ASC`,
    [companyId, saleId]
  )
  return result.rows.map(mapSaleItem)
}
