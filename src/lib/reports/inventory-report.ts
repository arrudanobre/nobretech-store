import ExcelJS from "exceljs"
import { pool } from "@/lib/db"
import {
  getInventoryCommercialStatus,
  getInventoryLogisticsStatus,
  type InventoryOperationalItem,
} from "@/lib/inventory-logistics"

const MAX_RANGE_MONTHS = 12
const PREVIEW_LIMIT = 100

export type InventoryReportFilters = {
  startDate: string
  endDate: string
  status?: string
  category?: string
  supplierId?: string
  includeSold: boolean
  includeInStock: boolean
}

export type InventoryReportSummary = {
  period: string
  totalItems: number
  inStockItems: number
  soldItems: number
  inventoryCapital: number
  soldItemsCost: number
  soldItemsRevenue: number
  realizedGrossProfit: number
  realizedAverageMargin: number
  averageCostTicket: number
  averageDaysInStock: number
  generatedAt: string
  methodologyNote: string
}

export type InventoryReportLine = {
  inventoryId: string
  entryDate: string
  product: string
  category: string
  subcategoryOrModel: string
  color: string
  storage: string
  imei: string
  serial: string
  imeiOrSerial: string
  supplier: string
  supplierId: string
  currentStatus: string
  rawStatus: string
  logisticsStatus: string
  commercialStatus: string
  purchaseCost: number
  allocatedCosts: number
  totalCost: number
  isOperationalStock: boolean
  isSold: boolean
  daysInStock: number
  saleDate: string
  saleId: string
  customer: string
  saleValue: number
  grossProfit: number
  grossMarginPct: number
  saleExitType: string
  suggestedPrice: number
  idleCapital: number
  observations: string
}

export type InventoryReportData = {
  filters: InventoryReportFilters
  summary: InventoryReportSummary
  rows: InventoryReportLine[]
  previewRows: InventoryReportLine[]
  filterOptions: {
    statuses: { value: string; label: string }[]
    categories: { value: string; label: string }[]
    suppliers: { id: string; name: string }[]
  }
  previewLimit: number
}

type RawInventoryRow = {
  inventory_id: string
  purchase_date: string | null
  purchase_price: string | number | null
  suggested_price: string | number | null
  status: string | null
  logistics_status: string | null
  commercial_status: string | null
  origin: string | null
  supplier_id: string | null
  supplier_name: string | null
  direct_supplier_name: string | null
  purchase_supplier_id: string | null
  purchase_supplier_name: string | null
  purchase_supplier_registered_name: string | null
  imei: string | null
  imei2: string | null
  serial_number: string | null
  notes: string | null
  condition_notes: string | null
  category_name_snapshot: string | null
  subcategory_name_snapshot: string | null
  inventory_product_type: string | null
  catalog_category: string | null
  catalog_brand: string | null
  catalog_model: string | null
  catalog_variant: string | null
  catalog_storage: string | null
  catalog_color: string | null
  unit_cost: string | number | null
  freight_allocated: string | number | null
  other_cost_allocated: string | number | null
  landed_unit_cost: string | number | null
  sale_id: string | null
  sale_date: string | null
  sale_value: string | number | null
  sale_customer_name: string | null
  sale_item_source: string | null
  sale_additional_type: string | null
  additional_item_name: string | null
}

type SupplierOptionRow = {
  id: string
  name: string
}

type CategoryOptionRow = {
  category: string
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "active", label: "Ativo" },
  { value: "in_stock", label: "Em estoque" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
  { value: "returned", label: "Devolvido" },
  { value: "under_repair", label: "Em reparo" },
  { value: "trade_in_received", label: "Trade-in recebido" },
  { value: "available", label: "Disponível" },
  { value: "reservable", label: "Reservável" },
  { value: "blocked", label: "Bloqueado" },
]

function todayISO() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function defaultRange() {
  const endDate = todayISO()
  const start = new Date()
  start.setDate(start.getDate() - 90)
  return {
    startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
    endDate,
  }
}

function isISODate(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function monthsBetween(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
}

function dateOnly(value?: string | null) {
  const normalized = String(value || "").trim()
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

function toNumber(value: string | number | null | undefined) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function daysBetween(startDate?: string | null, endDate?: string | null) {
  const start = dateOnly(startDate)
  const end = dateOnly(endDate) || todayISO()
  if (!start || !end) return 0
  const diff = parseDateOnly(end).getTime() - parseDateOnly(start).getTime()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}

function labelOrDash(value?: string | null) {
  const normalized = String(value || "").trim()
  return normalized || "—"
}

function productName(row: Pick<RawInventoryRow, "catalog_brand" | "catalog_model" | "catalog_variant" | "catalog_storage" | "catalog_color" | "subcategory_name_snapshot" | "category_name_snapshot" | "notes">) {
  const parts = [
    row.catalog_brand,
    row.catalog_model,
    row.catalog_variant,
  ].filter(Boolean) as string[]

  if (row.catalog_storage && !parts.join(" ").toLowerCase().includes(row.catalog_storage.toLowerCase())) {
    parts.push(row.catalog_storage)
  }
  if (row.catalog_color) parts.push(row.catalog_color)

  return parts.join(" ") || row.subcategory_name_snapshot || row.category_name_snapshot || row.notes || "Produto sem catálogo"
}

function categoryName(row: Pick<RawInventoryRow, "catalog_category" | "category_name_snapshot" | "inventory_product_type">) {
  return row.catalog_category || row.category_name_snapshot || row.inventory_product_type || "—"
}

function supplierName(row: RawInventoryRow) {
  if (row.origin === "trade_in") return "Trade-in"
  return row.direct_supplier_name || row.supplier_name || row.purchase_supplier_registered_name || row.purchase_supplier_name || "Não informado"
}

function currentStatusLabel(row: RawInventoryRow, commercialStatus: string, logisticsStatus: string) {
  if (commercialStatus === "sold") return "Vendido"
  if (commercialStatus === "reserved") return "Reservado"
  if (commercialStatus === "available" && logisticsStatus === "in_stock") return "Disponível"
  if (commercialStatus === "reservable") return "Reservável"
  if (row.status === "returned") return "Devolvido"
  if (row.status === "under_repair") return "Em reparo"
  if (row.status === "trade_in_received") return "Trade-in recebido"
  if (commercialStatus === "blocked") return "Bloqueado"
  return labelOrDash(row.status || logisticsStatus || commercialStatus)
}

function costParts(row: RawInventoryRow) {
  const unitCost = toNumber(row.unit_cost)
  const purchasePrice = toNumber(row.purchase_price)
  const purchaseCost = unitCost > 0 ? unitCost : purchasePrice
  const allocatedCosts = toNumber(row.freight_allocated) + toNumber(row.other_cost_allocated)
  const landedUnitCost = toNumber(row.landed_unit_cost)
  const totalCost = landedUnitCost > 0 ? landedUnitCost : purchaseCost + allocatedCosts

  return {
    purchaseCost: roundCurrency(purchaseCost),
    allocatedCosts: roundCurrency(allocatedCosts),
    totalCost: roundCurrency(totalCost),
  }
}

function isOperationalStockItem(row: RawInventoryRow, commercialStatus: string, logisticsStatus: string) {
  const rawStatus = String(row.status || "")
  if (["sold", "returned", "under_repair"].includes(rawStatus)) return false
  if (commercialStatus === "sold" || commercialStatus === "unavailable" || logisticsStatus === "unavailable") return false
  if (["available", "reservable", "reserved"].includes(commercialStatus)) return true
  return ["active", "in_stock", "pending", "reserved", "trade_in_received"].includes(rawStatus)
}

function shouldIncludeLine(line: InventoryReportLine, filters: InventoryReportFilters) {
  if (filters.status && filters.status !== "all") {
    const matchesStatus = [
      line.rawStatus,
      line.commercialStatus,
      line.logisticsStatus,
    ].includes(filters.status)
    if (!matchesStatus) return false
  }
  if (line.isSold) return filters.includeSold
  if (line.isOperationalStock) return filters.includeInStock
  return Boolean(filters.status && filters.status !== "all")
}

function saleExitType(row: RawInventoryRow) {
  if (row.sale_item_source === "main") return "Venda principal"
  if (row.sale_item_source === "additional") {
    if (row.sale_additional_type === "free") return "Brinde"
    if (row.sale_additional_type === "upsell") return "Upsell"
    return "Adicional"
  }
  return "—"
}

export function mapInventoryReportRows(rawRows: RawInventoryRow[], filters: InventoryReportFilters, today = todayISO()) {
  const rows = rawRows.map<InventoryReportLine>((row) => {
    const operationalItem: InventoryOperationalItem = {
      status: row.status,
      logistics_status: row.logistics_status,
      commercial_status: row.commercial_status,
      purchase_date: dateOnly(row.purchase_date),
      purchase_price: toNumber(row.purchase_price),
      suggested_price: toNumber(row.suggested_price),
      imei: row.imei,
      serial_number: row.serial_number,
      catalog_id: row.catalog_model ? "catalog" : null,
      category: row.catalog_category || row.category_name_snapshot,
      notes: row.notes,
      condition_notes: row.condition_notes,
    }
    const logisticsStatus = getInventoryLogisticsStatus(operationalItem)
    const commercialStatus = getInventoryCommercialStatus(operationalItem)
    const isSold = commercialStatus === "sold" || row.status === "sold" || Boolean(row.sale_id)
    const costs = costParts(row)
    const saleValue = row.sale_id ? toNumber(row.sale_value) : 0
    const grossProfit = row.sale_id ? saleValue - costs.totalCost : 0
    const grossMarginPct = row.sale_id && saleValue > 0 ? (grossProfit / saleValue) * 100 : 0
    const saleDate = dateOnly(row.sale_date)
    const entryDate = dateOnly(row.purchase_date)
    const operationalStock = isOperationalStockItem(row, commercialStatus, logisticsStatus) && !isSold

    return {
      inventoryId: row.inventory_id,
      entryDate,
      product: row.sale_item_source === "additional" && row.additional_item_name
        ? row.additional_item_name
        : productName(row),
      category: categoryName(row),
      subcategoryOrModel: row.catalog_model || row.subcategory_name_snapshot || "—",
      color: labelOrDash(row.catalog_color),
      storage: labelOrDash(row.catalog_storage),
      imei: labelOrDash(row.imei || row.imei2),
      serial: labelOrDash(row.serial_number),
      imeiOrSerial: row.imei || row.imei2 || row.serial_number || "—",
      supplier: supplierName(row),
      supplierId: row.supplier_id || row.purchase_supplier_id || "",
      currentStatus: currentStatusLabel(row, commercialStatus, logisticsStatus),
      rawStatus: row.status || "",
      logisticsStatus,
      commercialStatus,
      purchaseCost: costs.purchaseCost,
      allocatedCosts: costs.allocatedCosts,
      totalCost: costs.totalCost,
      isOperationalStock: operationalStock,
      isSold,
      daysInStock: daysBetween(entryDate, saleDate || today),
      saleDate,
      saleId: row.sale_id || "",
      customer: labelOrDash(row.sale_customer_name),
      saleValue: roundCurrency(saleValue),
      grossProfit: roundCurrency(grossProfit),
      grossMarginPct,
      saleExitType: saleExitType(row),
      suggestedPrice: roundCurrency(toNumber(row.suggested_price)),
      idleCapital: operationalStock ? costs.totalCost : 0,
      observations: row.sale_item_source === "additional"
        ? "Item vinculado como adicional/brinde em venda."
        : labelOrDash(row.condition_notes || row.notes),
    }
  }).filter((line) => shouldIncludeLine(line, filters))

  const totalItems = rows.length
  const inStockRows = rows.filter((line) => line.isOperationalStock)
  const soldRows = rows.filter((line) => line.isSold)
  const inventoryCapital = inStockRows.reduce((sum, line) => sum + line.totalCost, 0)
  const soldItemsCost = soldRows.reduce((sum, line) => sum + line.totalCost, 0)
  const soldItemsRevenue = soldRows.reduce((sum, line) => sum + line.saleValue, 0)
  const realizedGrossProfit = soldItemsRevenue - soldItemsCost
  const averageCostTicket = totalItems > 0 ? rows.reduce((sum, line) => sum + line.totalCost, 0) / totalItems : 0
  const averageDaysInStock = totalItems > 0 ? rows.reduce((sum, line) => sum + line.daysInStock, 0) / totalItems : 0
  const realizedAverageMargin = soldItemsRevenue > 0 ? (realizedGrossProfit / soldItemsRevenue) * 100 : 0

  return {
    rows,
    summary: {
      totalItems,
      inStockItems: inStockRows.length,
      soldItems: soldRows.length,
      inventoryCapital: roundCurrency(inventoryCapital),
      soldItemsCost: roundCurrency(soldItemsCost),
      soldItemsRevenue: roundCurrency(soldItemsRevenue),
      realizedGrossProfit: roundCurrency(realizedGrossProfit),
      realizedAverageMargin,
      averageCostTicket: roundCurrency(averageCostTicket),
      averageDaysInStock,
    },
  }
}

function normalizeFilters(input: URLSearchParams): InventoryReportFilters {
  const defaults = defaultRange()
  const startDate = input.get("start_date") || defaults.startDate
  const endDate = input.get("end_date") || defaults.endDate

  if (!isISODate(startDate) || !isISODate(endDate)) {
    throw new Error("Use datas no formato YYYY-MM-DD.")
  }
  if (parseDateOnly(startDate).getTime() > parseDateOnly(endDate).getTime()) {
    throw new Error("A data inicial deve ser menor ou igual à data final.")
  }
  if (monthsBetween(startDate, endDate) >= MAX_RANGE_MONTHS) {
    throw new Error("O intervalo máximo para a V1 é de 12 meses.")
  }

  const status = input.get("status") || undefined
  const category = input.get("category") || undefined
  const supplierId = input.get("supplier_id") || undefined
  const includeSold = input.get("include_sold") !== "false"
  const includeInStock = input.get("include_in_stock") !== "false"

  if (!includeSold && !includeInStock && (!status || status === "all")) {
    throw new Error("Selecione pelo menos vendidos ou itens em estoque.")
  }

  return {
    startDate,
    endDate,
    status: status && status !== "all" ? status : undefined,
    category: category && category !== "all" ? category : undefined,
    supplierId: supplierId && supplierId !== "all" ? supplierId : undefined,
    includeSold,
    includeInStock,
  }
}

export function parseInventoryReportRequest(url: string) {
  const parsed = new URL(url)
  const filters = normalizeFilters(parsed.searchParams)
  const format = parsed.searchParams.get("format") === "xlsx" ? "xlsx" : "json"
  return { filters, format }
}

async function getFilterOptions(companyId: string) {
  const [categories, suppliers] = await Promise.all([
    pool.query<CategoryOptionRow>(
      `
        SELECT DISTINCT COALESCE(pc.category, i.category_name_snapshot, i.product_type) AS category
        FROM inventory i
        LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
        WHERE i.company_id = $1::uuid
          AND COALESCE(pc.category, i.category_name_snapshot, i.product_type) IS NOT NULL
        ORDER BY category ASC
      `,
      [companyId]
    ),
    pool.query<SupplierOptionRow>(
      `
        SELECT DISTINCT ON (id) id, name
        FROM (
          SELECT s.id, s.name
          FROM suppliers s
          WHERE s.company_id = $1::uuid
          UNION ALL
          SELECT ip.supplier_id AS id, COALESCE(s.name, ip.supplier_name) AS name
          FROM inventory_purchases ip
          LEFT JOIN suppliers s ON s.id = ip.supplier_id
          WHERE ip.company_id = $1::uuid
            AND ip.supplier_id IS NOT NULL
        ) supplier_options
        WHERE id IS NOT NULL AND COALESCE(name, '') <> ''
        ORDER BY id, name ASC
      `,
      [companyId]
    ),
  ])

  return {
    statuses: STATUS_OPTIONS,
    categories: categories.rows
      .filter((row) => row.category)
      .map((row) => ({ value: row.category, label: row.category })),
    suppliers: suppliers.rows,
  }
}

async function getRawInventory(companyId: string, filters: InventoryReportFilters) {
  const result = await pool.query<RawInventoryRow>(
    `
      WITH additional_totals AS (
        SELECT
          sale_id,
          COALESCE(SUM(CASE WHEN type = 'upsell' THEN sale_price ELSE 0 END), 0) AS upsell_total
        FROM sales_additional_items
        WHERE company_id = $1::uuid
        GROUP BY sale_id
      ),
      main_sales AS (
        SELECT DISTINCT ON (s.inventory_id)
          s.inventory_id,
          s.id AS sale_id,
          s.sale_date::text AS sale_date,
          GREATEST(COALESCE(s.sale_price, 0) - COALESCE(at.upsell_total, 0), 0) AS sale_value,
          c.full_name AS customer_name
        FROM sales s
        LEFT JOIN additional_totals at ON at.sale_id = s.id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.company_id = $1::uuid
          AND s.inventory_id IS NOT NULL
          AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
        ORDER BY s.inventory_id, s.sale_date DESC, s.created_at DESC
      ),
      additional_sales AS (
        SELECT DISTINCT ON (sai.product_id)
          sai.product_id AS inventory_id,
          s.id AS sale_id,
          s.sale_date::text AS sale_date,
          COALESCE(sai.sale_price, 0) AS sale_value,
          c.full_name AS customer_name,
          sai.type AS additional_type,
          sai.name AS additional_item_name
        FROM sales_additional_items sai
        JOIN sales s ON s.id = sai.sale_id AND s.company_id = sai.company_id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE sai.company_id = $1::uuid
          AND sai.product_id IS NOT NULL
          AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
        ORDER BY sai.product_id, s.sale_date DESC, sai.created_at DESC
      )
      SELECT
        i.id AS inventory_id,
        i.purchase_date::text,
        i.purchase_price,
        i.suggested_price,
        i.status,
        i.logistics_status,
        i.commercial_status,
        i.origin,
        i.supplier_id,
        i.supplier_name,
        direct_supplier.name AS direct_supplier_name,
        ip.supplier_id AS purchase_supplier_id,
        ip.supplier_name AS purchase_supplier_name,
        purchase_supplier.name AS purchase_supplier_registered_name,
        i.imei,
        i.imei2,
        i.serial_number,
        i.notes,
        i.condition_notes,
        i.category_name_snapshot,
        i.subcategory_name_snapshot,
        i.product_type AS inventory_product_type,
        pc.category AS catalog_category,
        pc.brand AS catalog_brand,
        pc.model AS catalog_model,
        pc.variant AS catalog_variant,
        pc.storage AS catalog_storage,
        pc.color AS catalog_color,
        ipi.unit_cost,
        ipi.freight_allocated,
        ipi.other_cost_allocated,
        ipi.landed_unit_cost,
        COALESCE(ms.sale_id, ads.sale_id) AS sale_id,
        COALESCE(ms.sale_date, ads.sale_date) AS sale_date,
        COALESCE(ms.sale_value, ads.sale_value) AS sale_value,
        COALESCE(ms.customer_name, ads.customer_name) AS sale_customer_name,
        CASE
          WHEN ms.sale_id IS NOT NULL THEN 'main'
          WHEN ads.sale_id IS NOT NULL THEN 'additional'
          ELSE NULL
        END AS sale_item_source,
        ads.additional_type AS sale_additional_type,
        ads.additional_item_name
      FROM inventory i
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      LEFT JOIN suppliers direct_supplier ON direct_supplier.id = i.supplier_id
      LEFT JOIN LATERAL (
        SELECT
          ipi.unit_cost,
          ipi.freight_allocated,
          ipi.other_cost_allocated,
          ipi.landed_unit_cost,
          ipi.purchase_id
        FROM inventory_purchase_items ipi
        WHERE ipi.company_id = i.company_id
          AND ipi.inventory_id = i.id
        ORDER BY ipi.created_at DESC, ipi.id DESC
        LIMIT 1
      ) ipi ON TRUE
      LEFT JOIN inventory_purchases ip ON ip.id = COALESCE(i.inventory_purchase_id, ipi.purchase_id)
      LEFT JOIN suppliers purchase_supplier ON purchase_supplier.id = ip.supplier_id
      LEFT JOIN main_sales ms ON ms.inventory_id = i.id
      LEFT JOIN additional_sales ads ON ads.inventory_id = i.id
      WHERE i.company_id = $1::uuid
        AND (
          i.purchase_date BETWEEN $2::date AND $3::date
          OR COALESCE(ms.sale_date, ads.sale_date)::date BETWEEN $2::date AND $3::date
        )
        AND (
          $4::text IS NULL
          OR COALESCE(pc.category, i.category_name_snapshot, i.product_type) = $4::text
        )
        AND (
          $5::uuid IS NULL
          OR i.supplier_id = $5::uuid
          OR ip.supplier_id = $5::uuid
        )
      ORDER BY i.purchase_date DESC, i.created_at DESC, i.id DESC
    `,
    [
      companyId,
      filters.startDate,
      filters.endDate,
      filters.category || null,
      filters.supplierId || null,
    ]
  )

  return result.rows
}

export async function buildInventoryReport(companyId: string, filters: InventoryReportFilters): Promise<InventoryReportData> {
  const [rawRows, filterOptions] = await Promise.all([
    getRawInventory(companyId, filters),
    getFilterOptions(companyId),
  ])
  const mapped = mapInventoryReportRows(rawRows, filters)

  return {
    filters,
    summary: {
      period: `${filters.startDate} a ${filters.endDate}`,
      ...mapped.summary,
      generatedAt: todayISO(),
      methodologyNote: "Cada linha de inventory representa uma unidade; custo total usa landed_unit_cost quando disponível e fallback para custo de compra mais custos alocados.",
    },
    rows: mapped.rows,
    previewRows: mapped.rows.slice(0, PREVIEW_LIMIT),
    filterOptions,
    previewLimit: PREVIEW_LIMIT,
  }
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: InventoryReportData) {
  const sheet = workbook.addWorksheet("Resumo")
  sheet.columns = [
    { header: "Campo", key: "field", width: 38 },
    { header: "Valor", key: "value", width: 54 },
  ]
  sheet.addRows([
    { field: "Período de análise", value: report.summary.period },
    { field: "Total de itens", value: report.summary.totalItems },
    { field: "Itens em estoque", value: report.summary.inStockItems },
    { field: "Itens vendidos", value: report.summary.soldItems },
    { field: "Capital imobilizado em estoque", value: report.summary.inventoryCapital },
    { field: "Custo total dos itens vendidos", value: report.summary.soldItemsCost },
    { field: "Receita gerada pelos vendidos", value: report.summary.soldItemsRevenue },
    { field: "Lucro bruto realizado", value: report.summary.realizedGrossProfit },
    { field: "Margem média realizada", value: `${report.summary.realizedAverageMargin.toFixed(2)}%` },
    { field: "Tempo médio em estoque", value: `${report.summary.averageDaysInStock.toFixed(1)} dias` },
    { field: "Data de geração", value: report.summary.generatedAt },
    { field: "Observação metodológica", value: report.summary.methodologyNote },
  ])
  formatWorksheet(sheet, [5, 6, 7, 8])
}

function addDetailedSheet(workbook: ExcelJS.Workbook, report: InventoryReportData) {
  const sheet = workbook.addWorksheet("Estoque detalhado")
  sheet.columns = [
    { header: "Inventory ID", key: "inventoryId", width: 38 },
    { header: "Data de entrada", key: "entryDate", width: 16 },
    { header: "Produto", key: "product", width: 36 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "Subcategoria/modelo", key: "subcategoryOrModel", width: 24 },
    { header: "Cor", key: "color", width: 16 },
    { header: "Capacidade", key: "storage", width: 16 },
    { header: "IMEI", key: "imei", width: 20 },
    { header: "Serial", key: "serial", width: 20 },
    { header: "Fornecedor", key: "supplier", width: 26 },
    { header: "Status atual", key: "currentStatus", width: 18 },
    { header: "Custo de compra", key: "purchaseCost", width: 18 },
    { header: "Frete/custos alocados", key: "allocatedCosts", width: 24 },
    { header: "Custo total", key: "totalCost", width: 18 },
    { header: "Data de venda", key: "saleDate", width: 16 },
    { header: "ID da venda", key: "saleId", width: 38 },
    { header: "Cliente", key: "customer", width: 28 },
    { header: "Valor de venda", key: "saleValue", width: 18 },
    { header: "Lucro bruto", key: "grossProfit", width: 18 },
    { header: "Margem %", key: "grossMarginPct", width: 14 },
    { header: "Tipo de saída", key: "saleExitType", width: 18 },
    { header: "Dias em estoque", key: "daysInStock", width: 18 },
    { header: "Observações", key: "observations", width: 44 },
  ]
  sheet.addRows(report.rows)
  formatWorksheet(sheet, [12, 13, 14, 18, 19])
  formatPercentColumn(sheet, "grossMarginPct")
}

function addSoldSheet(workbook: ExcelJS.Workbook, report: InventoryReportData) {
  const sheet = workbook.addWorksheet("Vendidos")
  sheet.columns = [
    { header: "Data de entrada", key: "entryDate", width: 16 },
    { header: "Data de venda", key: "saleDate", width: 16 },
    { header: "Produto", key: "product", width: 36 },
    { header: "IMEI/Serial", key: "imeiOrSerial", width: 24 },
    { header: "Fornecedor", key: "supplier", width: 26 },
    { header: "Custo total", key: "totalCost", width: 18 },
    { header: "Valor de venda", key: "saleValue", width: 18 },
    { header: "Lucro bruto", key: "grossProfit", width: 18 },
    { header: "Margem %", key: "grossMarginPct", width: 14 },
    { header: "Tipo de saída", key: "saleExitType", width: 18 },
    { header: "Dias em estoque", key: "daysInStock", width: 18 },
    { header: "Cliente", key: "customer", width: 28 },
    { header: "ID da venda", key: "saleId", width: 38 },
  ]
  sheet.addRows(report.rows.filter((line) => line.isSold))
  formatWorksheet(sheet, [6, 7, 8])
  formatPercentColumn(sheet, "grossMarginPct")
}

function addInStockSheet(workbook: ExcelJS.Workbook, report: InventoryReportData) {
  const sheet = workbook.addWorksheet("Em estoque")
  sheet.columns = [
    { header: "Data de entrada", key: "entryDate", width: 16 },
    { header: "Produto", key: "product", width: 36 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "IMEI/Serial", key: "imeiOrSerial", width: 24 },
    { header: "Fornecedor", key: "supplier", width: 26 },
    { header: "Custo total", key: "totalCost", width: 18 },
    { header: "Status atual", key: "currentStatus", width: 18 },
    { header: "Dias em estoque até hoje", key: "daysInStock", width: 24 },
    { header: "Preço sugerido/cadastrado", key: "suggestedPrice", width: 24 },
    { header: "Capital parado", key: "idleCapital", width: 18 },
    { header: "Observações", key: "observations", width: 44 },
  ]
  sheet.addRows(report.rows.filter((line) => line.isOperationalStock))
  formatWorksheet(sheet, [6, 9, 10])
}

function addMethodologySheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Metodologia")
  sheet.columns = [{ header: "Critério", key: "criterion", width: 120 }]
  sheet.addRows([
    { criterion: "Cada linha de inventory representa uma unidade de estoque." },
    { criterion: "O período inclui itens com data de entrada no intervalo ou itens cuja venda vinculada ocorreu no intervalo." },
    { criterion: "Capital imobilizado é estoque ainda não vendido; considera itens ainda disponíveis ou em estoque operacional, incluindo reservados, e exclui vendidos, devolvidos e itens em reparo." },
    { criterion: "Custo total do item inclui custo de compra e custos alocados quando disponíveis; landed_unit_cost é usado como custo total quando preenchido." },
    { criterion: "Lucro bruto realizado é calculado apenas para itens vendidos." },
    { criterion: "Dias em estoque para vendidos = data da venda menos data de entrada." },
    { criterion: "Dias em estoque para itens não vendidos = data atual menos data de entrada." },
    { criterion: "Itens vendidos como adicionais/brindes são identificados por sales_additional_items.product_id quando há vínculo técnico." },
    { criterion: "Tipo de saída usa sales_additional_items.type: free = Brinde; upsell = Upsell; item principal = Venda principal." },
    { criterion: "Brindes podem aparecer com venda R$ 0,00 e lucro bruto individual negativo, pois houve custo para a Nobretech sem cobrança separada do cliente." },
    { criterion: "O relatório é gerencial/contábil e deve ser validado pelo contador." },
  ])
  formatWorksheet(sheet)
}

function formatPercentColumn(sheet: ExcelJS.Worksheet, columnKey: string) {
  sheet.getColumn(columnKey).numFmt = "0.00%"
  sheet.eachRow((row, index) => {
    if (index > 1) {
      const cell = row.getCell(columnKey)
      cell.value = Number(cell.value || 0) / 100
    }
  })
}

function formatWorksheet(sheet: ExcelJS.Worksheet, currencyColumns: number[] = []) {
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D1B2E" } }
  header.alignment = { vertical: "middle", wrapText: true }
  header.height = 24

  for (const columnIndex of currencyColumns) {
    sheet.getColumn(columnIndex).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
  }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      }
      cell.alignment = { vertical: "top", wrapText: true }
    })
  })
}

export async function buildInventoryReportWorkbook(report: InventoryReportData) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Nobretech Store ERP"
  workbook.created = new Date()
  workbook.modified = new Date()

  addSummarySheet(workbook, report)
  addDetailedSheet(workbook, report)
  addSoldSheet(workbook, report)
  addInStockSheet(workbook, report)
  addMethodologySheet(workbook)

  return workbook.xlsx.writeBuffer()
}
