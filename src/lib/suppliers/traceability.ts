import "server-only"

import { pool } from "@/lib/db"

const OPEN_PURCHASE_STATUSES = new Set(["ordered", "in_transit", "partially_received"])

export type SupplierMetrics = {
  totalPurchases: number
  openPurchases: number
  inTransitItems: number
  receivedItems: number
  totalPurchasedAmount: number
  purchasedAmountCurrentMonth: number
  lastPurchaseDate: string | null
  averageReceiptDays: number | null
}

export type SupplierProfile = {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  city: string | null
  notes: string | null
  rating: number | null
  created_at: string | null
}

export type PurchaseSummary = {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  purchase_date: string | null
  ordered_at: string | null
  expected_arrival_date: string | null
  received_at: string | null
  logistics_status: string | null
  source_type: string | null
  freight_amount: number
  freight_cost: number
  products_amount: number
  total_amount: number
  notes: string | null
  created_at: string | null
  items_count: number
  in_transit_items: number
  received_items: number
  amount: number
}

export type SupplierTraceability = {
  supplier: SupplierProfile | null
  legacyName: string | null
  isLegacy: boolean
  metrics: SupplierMetrics
  purchases: PurchaseSummary[]
}

export type SupplierTraceabilityList = {
  summary: {
    activeSuppliers: number
    openPurchases: number
    purchasedAmountCurrentMonth: number
    totalPurchasedAmount: number
    inTransitItems: number
    topSupplierByAmount: string | null
  }
  suppliers: SupplierTraceability[]
}

export type PurchaseDetail = PurchaseSummary & {
  supplier: SupplierProfile | null
  items: Array<{
    id: string
    inventory_id: string | null
    product_name: string | null
    category: string | null
    grade: string | null
    quantity: number
    unit_cost: number
    freight_allocated: number
    landed_unit_cost: number
    suggested_price: number | null
    inventory_logistics_status: string | null
    inventory_commercial_status: string | null
    inventory_status: string | null
    inventory_received_at: string | null
  }>
}

type SupplierRow = SupplierProfile
type PurchaseRow = Omit<PurchaseSummary, "items_count" | "in_transit_items" | "received_items" | "amount">
type ItemSummaryRow = {
  purchase_id: string
  items_count: string | number | null
  items_amount: string | number | null
}
type InventorySummaryRow = {
  purchase_id: string
  inventory_items_count: string | number | null
  in_transit_items: string | number | null
  received_items: string | number | null
}

type InventoryFallbackItemRow = {
  id: string
  product_name: string | null
  category: string | null
  grade: string | null
  quantity: string | number | null
  purchase_price: string | number | null
  suggested_price: string | number | null
  logistics_status: string | null
  commercial_status: string | null
  status: string | null
  received_at: string | null
}

function number(value: string | number | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : null
}

function daysBetween(from?: string | null, to?: string | null) {
  const start = dateOnly(from)
  const end = dateOnly(to)
  if (!start || !end) return null
  const diff = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

function purchaseAmount(row: PurchaseRow, itemAmount = 0) {
  const total = number(row.total_amount)
  if (total > 0) return total
  const products = number(row.products_amount) || itemAmount
  const freight = number(row.freight_amount) || number(row.freight_cost)
  return products + freight
}

export function normalizeSupplierName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

function emptyMetrics(): SupplierMetrics {
  return {
    totalPurchases: 0,
    openPurchases: 0,
    inTransitItems: 0,
    receivedItems: 0,
    totalPurchasedAmount: 0,
    purchasedAmountCurrentMonth: 0,
    lastPurchaseDate: null,
    averageReceiptDays: null,
  }
}

function buildMetrics(purchases: PurchaseSummary[], monthPrefix: string): SupplierMetrics {
  const receiptIntervals: number[] = []
  const metrics = purchases.reduce<SupplierMetrics>((acc, purchase) => {
    const status = purchase.logistics_status || ""
    const orderedDate = dateOnly(purchase.ordered_at || purchase.purchase_date)
    const receiptDays = daysBetween(orderedDate, purchase.received_at)

    acc.totalPurchases += 1
    if (OPEN_PURCHASE_STATUSES.has(status)) acc.openPurchases += 1
    acc.inTransitItems += purchase.in_transit_items
    acc.receivedItems += purchase.received_items
    acc.totalPurchasedAmount += purchase.amount
    if (orderedDate?.startsWith(monthPrefix)) acc.purchasedAmountCurrentMonth += purchase.amount
    if (orderedDate && (!acc.lastPurchaseDate || orderedDate > acc.lastPurchaseDate)) acc.lastPurchaseDate = orderedDate
    if (receiptDays != null && receiptDays >= 0) receiptIntervals.push(receiptDays)
    return acc
  }, emptyMetrics())

  metrics.averageReceiptDays = receiptIntervals.length
    ? Math.round(receiptIntervals.reduce((sum, value) => sum + value, 0) / receiptIntervals.length)
    : null
  metrics.totalPurchasedAmount = Math.round(metrics.totalPurchasedAmount * 100) / 100
  metrics.purchasedAmountCurrentMonth = Math.round(metrics.purchasedAmountCurrentMonth * 100) / 100
  return metrics
}

async function loadBaseData(companyId: string) {
  const [supplierResult, purchaseResult, itemResult, inventoryResult] = await Promise.all([
    pool.query<SupplierRow>(
      `
        SELECT id, name, contact, phone, email, city, notes, rating, created_at
        FROM suppliers
        WHERE company_id = $1::uuid
        ORDER BY name ASC
      `,
      [companyId]
    ),
    pool.query<PurchaseRow>(
      `
        SELECT
          id,
          supplier_id,
          supplier_name,
          purchase_date,
          ordered_at,
          expected_arrival_date,
          received_at,
          logistics_status,
          source_type,
          freight_amount,
          freight_cost,
          products_amount,
          total_amount,
          notes,
          created_at
        FROM inventory_purchases
        WHERE company_id = $1::uuid
        ORDER BY COALESCE(ordered_at, purchase_date, created_at::date) DESC, created_at DESC
      `,
      [companyId]
    ),
    pool.query<ItemSummaryRow>(
      `
        SELECT
          purchase_id,
          COALESCE(SUM(quantity), 0) AS items_count,
          COALESCE(SUM(unit_cost * quantity), 0) AS items_amount
        FROM inventory_purchase_items
        WHERE company_id = $1::uuid
        GROUP BY purchase_id
      `,
      [companyId]
    ),
    pool.query<InventorySummaryRow>(
      `
        SELECT
          inventory_purchase_id AS purchase_id,
          COALESCE(SUM(COALESCE(quantity, 1)), 0) AS inventory_items_count,
          COALESCE(SUM(CASE WHEN logistics_status IN ('ordered', 'in_transit') THEN COALESCE(quantity, 1) ELSE 0 END), 0) AS in_transit_items,
          COALESCE(SUM(CASE WHEN logistics_status IN ('in_stock', 'received_pending_review', 'received') OR received_at IS NOT NULL THEN COALESCE(quantity, 1) ELSE 0 END), 0) AS received_items
        FROM inventory
        WHERE company_id = $1::uuid
          AND inventory_purchase_id IS NOT NULL
        GROUP BY inventory_purchase_id
      `,
      [companyId]
    ),
  ])

  const itemsByPurchase = new Map(itemResult.rows.map((row) => [row.purchase_id, row]))
  const inventoryByPurchase = new Map(inventoryResult.rows.map((row) => [row.purchase_id, row]))

  const purchases: PurchaseSummary[] = purchaseResult.rows.map((row) => {
    const itemSummary = itemsByPurchase.get(row.id)
    const inventorySummary = inventoryByPurchase.get(row.id)
    const itemCount = number(inventorySummary?.inventory_items_count) || number(itemSummary?.items_count)
    const inTransitItems = number(inventorySummary?.in_transit_items)
      || (OPEN_PURCHASE_STATUSES.has(row.logistics_status || "") ? itemCount : 0)
    const receivedItems = number(inventorySummary?.received_items)
      || (row.logistics_status === "received" ? itemCount : 0)

    return {
      ...row,
      freight_amount: number(row.freight_amount),
      freight_cost: number(row.freight_cost),
      products_amount: number(row.products_amount),
      total_amount: number(row.total_amount),
      items_count: itemCount,
      in_transit_items: inTransitItems,
      received_items: receivedItems,
      amount: purchaseAmount(row, number(itemSummary?.items_amount)),
    }
  })

  return { suppliers: supplierResult.rows, purchases }
}

export async function findOrCreateSupplierByName(name: string, companyId: string): Promise<SupplierProfile> {
  const cleanName = name.trim().replace(/\s+/g, " ")
  if (!cleanName) throw new Error("Nome do fornecedor é obrigatório")

  const normalized = normalizeSupplierName(cleanName)
  const existing = await pool.query<SupplierRow>(
    `
      SELECT id, name, contact, phone, email, city, notes, rating, created_at
      FROM suppliers
      WHERE company_id = $1::uuid
      ORDER BY name ASC
    `,
    [companyId]
  )

  const match = existing.rows.find((supplier) => normalizeSupplierName(supplier.name) === normalized)
  if (match) return match

  const inserted = await pool.query<SupplierRow>(
    `
      INSERT INTO suppliers (company_id, name)
      VALUES ($1::uuid, $2)
      RETURNING id, name, contact, phone, email, city, notes, rating, created_at
    `,
    [companyId, cleanName]
  )

  return inserted.rows[0]
}

export async function getSupplierTraceabilityList(companyId: string): Promise<SupplierTraceabilityList> {
  const { suppliers, purchases } = await loadBaseData(companyId)
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  const suppliersByName = new Map(suppliers.map((supplier) => [normalizeSupplierName(supplier.name), supplier]))
  const purchasesBySupplier = new Map<string, PurchaseSummary[]>()
  const legacyPurchasesByName = new Map<string, PurchaseSummary[]>()

  for (const purchase of purchases) {
    if (purchase.supplier_id && suppliersById.has(purchase.supplier_id)) {
      const current = purchasesBySupplier.get(purchase.supplier_id) || []
      current.push(purchase)
      purchasesBySupplier.set(purchase.supplier_id, current)
      continue
    }

    const normalizedName = purchase.supplier_name ? normalizeSupplierName(purchase.supplier_name) : ""
    const namedSupplier = normalizedName ? suppliersByName.get(normalizedName) : null
    if (namedSupplier) {
      const current = purchasesBySupplier.get(namedSupplier.id) || []
      current.push(purchase)
      purchasesBySupplier.set(namedSupplier.id, current)
      continue
    }

    if (normalizedName) {
      const current = legacyPurchasesByName.get(normalizedName) || []
      current.push(purchase)
      legacyPurchasesByName.set(normalizedName, current)
    }
  }

  const realCards: SupplierTraceability[] = suppliers.map((supplier) => {
    const supplierPurchases = purchasesBySupplier.get(supplier.id) || []
    return {
      supplier,
      legacyName: null,
      isLegacy: false,
      metrics: buildMetrics(supplierPurchases, monthPrefix),
      purchases: supplierPurchases,
    }
  })

  const legacyCards: SupplierTraceability[] = Array.from(legacyPurchasesByName.entries()).map(([, supplierPurchases]) => {
    const legacyName = supplierPurchases[0]?.supplier_name || "Fornecedor sem cadastro"
    return {
      supplier: null,
      legacyName,
      isLegacy: true,
      metrics: buildMetrics(supplierPurchases, monthPrefix),
      purchases: supplierPurchases,
    }
  })

  const cards = [...realCards, ...legacyCards]
  const summary = cards.reduce<SupplierTraceabilityList["summary"]>((acc, card) => {
    acc.openPurchases += card.metrics.openPurchases
    acc.purchasedAmountCurrentMonth += card.metrics.purchasedAmountCurrentMonth
    acc.totalPurchasedAmount += card.metrics.totalPurchasedAmount
    acc.inTransitItems += card.metrics.inTransitItems
    if (!acc.topSupplierByAmount || card.metrics.totalPurchasedAmount > (cards.find((item) => (item.supplier?.name || item.legacyName) === acc.topSupplierByAmount)?.metrics.totalPurchasedAmount || -1)) {
      acc.topSupplierByAmount = card.supplier?.name || card.legacyName
    }
    return acc
  }, {
    activeSuppliers: suppliers.length,
    openPurchases: 0,
    purchasedAmountCurrentMonth: 0,
    totalPurchasedAmount: 0,
    inTransitItems: 0,
    topSupplierByAmount: null,
  })

  if (!cards.some((card) => card.metrics.totalPurchasedAmount > 0)) summary.topSupplierByAmount = null

  return {
    summary: {
      ...summary,
      purchasedAmountCurrentMonth: Math.round(summary.purchasedAmountCurrentMonth * 100) / 100,
      totalPurchasedAmount: Math.round(summary.totalPurchasedAmount * 100) / 100,
    },
    suppliers: cards.sort((a, b) => b.metrics.totalPurchasedAmount - a.metrics.totalPurchasedAmount || (a.supplier?.name || a.legacyName || "").localeCompare(b.supplier?.name || b.legacyName || "")),
  }
}

export async function getSupplierTraceability(companyId: string, supplierId: string): Promise<SupplierTraceability | null> {
  const { suppliers, purchases } = await loadBaseData(companyId)
  const supplier = suppliers.find((item) => item.id === supplierId)
  if (!supplier) return null

  const normalizedSupplierName = normalizeSupplierName(supplier.name)
  const supplierPurchases = purchases.filter((purchase) => {
    if (purchase.supplier_id === supplier.id) return true
    if (purchase.supplier_id) return false
    return purchase.supplier_name ? normalizeSupplierName(purchase.supplier_name) === normalizedSupplierName : false
  })
  const monthPrefix = new Date().toISOString().slice(0, 7)

  return {
    supplier,
    legacyName: null,
    isLegacy: false,
    metrics: buildMetrics(supplierPurchases, monthPrefix),
    purchases: supplierPurchases,
  }
}

export async function getSupplierRecentItems(companyId: string, supplierId: string, limit = 12) {
  const traceability = await getSupplierTraceability(companyId, supplierId)
  const purchaseIds = traceability?.purchases.map((purchase) => purchase.id) || []
  if (purchaseIds.length === 0) return []

  const result = await pool.query(
    `
      SELECT
        ipi.id,
        ipi.purchase_id,
        ipi.inventory_id,
        ipi.product_name,
        ipi.category,
        ipi.quantity,
        ipi.unit_cost,
        ipi.landed_unit_cost,
        ip.ordered_at,
        ip.purchase_date
      FROM inventory_purchase_items ipi
      JOIN inventory_purchases ip ON ip.id = ipi.purchase_id
      WHERE ipi.company_id = $1::uuid
        AND ipi.purchase_id = ANY($2::uuid[])
      ORDER BY COALESCE(ip.ordered_at, ip.purchase_date, ip.created_at::date) DESC, ipi.created_at DESC
      LIMIT $3
    `,
    [companyId, purchaseIds, limit]
  )

  return result.rows.map((row) => ({
    ...row,
    quantity: number(row.quantity),
    unit_cost: number(row.unit_cost),
    landed_unit_cost: number(row.landed_unit_cost),
  }))
}

export async function getInventoryPurchaseList(companyId: string): Promise<PurchaseSummary[]> {
  const { purchases } = await loadBaseData(companyId)
  return purchases
}

export async function updatePurchaseSupplier(
  companyId: string,
  purchaseId: string,
  supplierId: string | null,
  supplierName: string
): Promise<void> {
  await pool.query(
    `UPDATE inventory_purchases SET supplier_id = $1, supplier_name = $2 WHERE id = $3::uuid AND company_id = $4::uuid`,
    [supplierId || null, supplierName, purchaseId, companyId]
  )
  await pool.query(
    `UPDATE inventory SET supplier_id = $1, supplier_name = $2 WHERE inventory_purchase_id = $3::uuid AND company_id = $4::uuid`,
    [supplierId || null, supplierName, purchaseId, companyId]
  )
}

export async function getInventoryPurchaseDetail(companyId: string, purchaseId: string): Promise<PurchaseDetail | null> {
  const { purchases } = await loadBaseData(companyId)
  const purchase = purchases.find((item) => item.id === purchaseId)
  if (!purchase) return null

  const [supplierResult, itemResult] = await Promise.all([
    purchase.supplier_id
      ? pool.query<SupplierRow>(
        `
          SELECT id, name, contact, phone, email, city, notes, rating, created_at
          FROM suppliers
          WHERE company_id = $1::uuid
            AND id = $2::uuid
          LIMIT 1
        `,
        [companyId, purchase.supplier_id]
      )
      : Promise.resolve({ rows: [] as SupplierRow[] }),
    pool.query(
      `
        SELECT
          ipi.id,
          ipi.inventory_id,
          ipi.product_name,
          ipi.category,
          ipi.grade,
          ipi.quantity,
          ipi.unit_cost,
          ipi.freight_allocated,
          ipi.landed_unit_cost,
          ipi.suggested_price,
          i.logistics_status AS inventory_logistics_status,
          i.commercial_status AS inventory_commercial_status,
          i.status AS inventory_status,
          i.received_at AS inventory_received_at
        FROM inventory_purchase_items ipi
        LEFT JOIN inventory i ON i.id = ipi.inventory_id AND i.company_id = ipi.company_id
        WHERE ipi.company_id = $1::uuid
          AND ipi.purchase_id = $2::uuid
        ORDER BY ipi.created_at ASC
      `,
      [companyId, purchaseId]
    ),
  ])

  const items = itemResult.rows.map((row) => ({
    ...row,
    quantity: number(row.quantity),
    unit_cost: number(row.unit_cost),
    freight_allocated: number(row.freight_allocated),
    landed_unit_cost: number(row.landed_unit_cost),
    suggested_price: row.suggested_price == null ? null : number(row.suggested_price),
  }))

  if (items.length === 0) {
    const fallbackItems = await pool.query<InventoryFallbackItemRow>(
      `
        SELECT
          i.id,
          COALESCE(pc.model, i.notes, i.condition_notes) AS product_name,
          COALESCE(pc.category, i.category_name_snapshot) AS category,
          i.grade,
          i.quantity,
          i.purchase_price,
          i.suggested_price,
          i.logistics_status,
          i.commercial_status,
          i.status,
          i.received_at
        FROM inventory i
        LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
        WHERE i.company_id = $1::uuid
          AND i.inventory_purchase_id = $2::uuid
        ORDER BY i.created_at ASC
      `,
      [companyId, purchaseId]
    )

    items.push(...fallbackItems.rows.map((row) => ({
      id: row.id,
      inventory_id: row.id,
      product_name: row.product_name,
      category: row.category,
      grade: row.grade,
      quantity: number(row.quantity) || 1,
      unit_cost: number(row.purchase_price),
      freight_allocated: 0,
      landed_unit_cost: number(row.purchase_price),
      suggested_price: row.suggested_price == null ? null : number(row.suggested_price),
      inventory_logistics_status: row.logistics_status,
      inventory_commercial_status: row.commercial_status,
      inventory_status: row.status,
      inventory_received_at: row.received_at,
    })))
  }

  return {
    ...purchase,
    supplier: supplierResult.rows[0] || null,
    items,
  }
}
