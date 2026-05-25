import ExcelJS from "exceljs"
import { PAYMENT_METHODS } from "@/lib/constants"
import { pool } from "@/lib/db"
import { formatPaymentMethod } from "@/lib/helpers"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import { isFinancialPayment, salePaymentStatusSummary } from "@/lib/sale-payments"

const MAX_RANGE_MONTHS = 12
const PREVIEW_LIMIT = 100

export type SalesReportFilters = {
  startDate: string
  endDate: string
  paymentMethod?: string
  financialAccountId?: string
  saleStatus?: string
}

export type SalesReportSummary = {
  period: string
  salesCount: number
  grossCommercialRevenue: number
  tradeInCreditTotal: number
  financialReceivedRevenue: number
  mainProductCostTotal: number
  giftItemsCostTotal: number
  upsellItemsCostTotal: number
  upsellItemsRevenueTotal: number
  upsellItemsProfitTotal: number
  additionalItemsCostTotal: number
  totalSaleCost: number
  productCostTotal: number
  grossCommercialProfit: number
  averageMargin: number
  totalPending: number
  hasTradeIn: boolean
  hasAdditionalItemsCost: boolean
  generatedAt: string
  methodologyNote: string
}

export type SalesReportLine = {
  saleDate: string
  saleId: string
  customer: string
  product: string
  category: string
  imeiOrSerial: string
  saleStatus: string
  financialStatus: string
  saleValue: number
  grossSaleValue: number
  tradeInCredit: number
  financialReceivedValue: number
  discount: number
  customerPaidTotal: number
  paymentMethod: string
  installments: string
  receivingAccount: string
  expectedReceiptDate: string
  actualReceiptDate: string
  mainProductCost: number
  giftItemsCost: number
  upsellItemsCost: number
  upsellItemsRevenue: number
  upsellItemsProfit: number
  additionalItemsCost: number
  totalSaleCost: number
  productPurchaseCost: number
  allocatedFreightCost: number
  productTotalCost: number
  grossProfit: number
  grossCommercialProfit: number
  grossMarginPct: number
  hasTradeIn: string
  tradeInReceivedProduct: string
  tradeInObservation: string
  linkedAdditionalItems: string
  additionalItemsTypes: string
  notes: string
}

export type SalesReportPaymentLine = {
  saleId: string
  saleDate: string
  paymentMethod: string
  installments: string
  installmentAmount: number
  totalAmount: number
  financialAccount: string
  transactionId: string
  transactionStatus: string
  expectedDate: string
  reconciledDate: string
  movementId: string
}

export type SalesReportData = {
  filters: SalesReportFilters
  summary: SalesReportSummary
  rows: SalesReportLine[]
  previewRows: SalesReportLine[]
  paymentRows: SalesReportPaymentLine[]
  filterOptions: {
    paymentMethods: { value: string; label: string }[]
    financialAccounts: { id: string; name: string }[]
  }
  previewLimit: number
}

type RawAdditionalItem = {
  id: string
  type: string | null
  name: string | null
  cost_price: string | number | null
  sale_price: string | number | null
  profit: string | number | null
}

type RawPayment = {
  id: string | null
  payment_method: string | null
  amount: string | number | null
  status: string | null
  due_date: string | null
  received_date: string | number | null
  financial_account_id: string | null
  transaction_id: string | null
  financial_account_name: string | null
  transaction_status: string | null
  reconciled_at: string | number | null
  movement_id: string | null
}

type RawSaleRow = {
  sale_id: string
  sale_date: string
  sale_status: string | null
  payment_status: string | null
  sale_price: string | number | null
  net_amount: string | number | null
  supplier_cost: string | number | null
  payment_method: string | null
  has_trade_in: boolean | null
  trade_in_id: string | null
  trade_in_value: string | number | null
  trade_in_notes: string | null
  trade_in_grade: string | null
  trade_in_imei: string | null
  trade_in_serial_number: string | null
  trade_in_inventory_imei: string | null
  trade_in_inventory_serial_number: string | null
  trade_in_model: string | null
  trade_in_variant: string | null
  trade_in_storage: string | null
  trade_in_color: string | null
  payment_due_date: string | null
  notes: string | null
  customer_name: string | null
  customer_type?: string | null
  walk_in_label?: string | null
  imei: string | null
  imei2: string | null
  serial_number: string | null
  inventory_purchase_price: string | number | null
  inventory_suggested_price: string | number | null
  inventory_product_type: string | null
  category_name_snapshot: string | null
  subcategory_name_snapshot: string | null
  catalog_category: string | null
  catalog_brand: string | null
  catalog_model: string | null
  catalog_variant: string | null
  catalog_storage: string | null
  catalog_color: string | null
  freight_allocated: string | number | null
  other_cost_allocated: string | number | null
  landed_unit_cost: string | number | null
  additional_items: RawAdditionalItem[]
  payments: RawPayment[]
}

type AccountRow = {
  id: string
  name: string
}

function todayISO() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function currentMonthRange() {
  const date = new Date()
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  const key = `${year}-${String(month).padStart(2, "0")}`
  return { startDate: `${key}-01`, endDate: `${key}-${String(lastDay).padStart(2, "0")}` }
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

function toNumber(value: string | number | null | undefined) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function dateOnly(value?: string | number | null) {
  const normalized = String(value || "").trim()
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

function labelOrDash(value?: string | null) {
  const normalized = String(value || "").trim()
  return normalized || "—"
}

function installmentsLabel(method?: string | null) {
  const match = String(method || "").match(/^credit_(\d+)x$/)
  return match ? `${match[1]}x` : "1x"
}

function productName(row: RawSaleRow) {
  return [
    row.catalog_brand,
    row.catalog_model,
    row.catalog_variant,
    row.catalog_storage,
    row.catalog_color,
  ].filter(Boolean).join(" ") || row.subcategory_name_snapshot || row.category_name_snapshot || "Produto sem catálogo"
}

function categoryName(row: RawSaleRow) {
  return row.category_name_snapshot || row.catalog_category || row.inventory_product_type || "—"
}

function additionalItemsLabel(items: RawAdditionalItem[]) {
  const valid = items.filter((item) => item.name)
  if (valid.length === 0) return "—"
  return valid
    .map((item) => {
      const type = item.type === "free" ? "Brinde" : item.type === "upsell" ? "Upsell" : "Adicional"
      const salePrice = toNumber(item.sale_price)
      const costPrice = toNumber(item.cost_price)
      const price = item.type === "upsell" && salePrice > 0 ? ` · venda ${formatBRLPlain(salePrice)}` : ""
      const cost = costPrice > 0 ? ` · custo ${formatBRLPlain(costPrice)}` : ""
      return `${type}: ${item.name}${cost}${price}`
    })
    .join("; ")
}

function additionalItemsTypesLabel(items: RawAdditionalItem[]) {
  const types = Array.from(new Set(items.map((item) => item.type === "free" ? "Brinde" : item.type === "upsell" ? "Upsell" : "Adicional")))
  return types.length > 0 ? types.join(" + ") : "—"
}

function additionalItemsBreakdown(items: RawAdditionalItem[]) {
  return items.reduce(
    (totals, item) => {
      const cost = toNumber(item.cost_price)
      const sale = toNumber(item.sale_price)
      if (item.type === "free") {
        totals.giftCost += cost
        return totals
      }
      if (item.type === "upsell") {
        totals.upsellCost += cost
        totals.upsellRevenue += sale
        totals.upsellProfit += item.profit !== null && item.profit !== undefined ? toNumber(item.profit) : sale - cost
      }
      return totals
    },
    { giftCost: 0, upsellCost: 0, upsellRevenue: 0, upsellProfit: 0 }
  )
}

function formatBRLPlain(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function tradeInDeviceName(row: RawSaleRow) {
  const product = [
    row.trade_in_model,
    row.trade_in_variant,
    row.trade_in_storage,
    row.trade_in_color,
  ].filter(Boolean).join(" ")

  if (product) return product
  if (row.trade_in_notes) return row.trade_in_notes
  return null
}

function mapFinancialStatus(payments: RawPayment[], legacyStatus?: string | null) {
  const active = payments.filter((payment) => payment.status !== "cancelled")
  if (active.length > 0) {
    return salePaymentStatusSummary(
      active.map((payment) => ({
        payment_method: payment.payment_method || "other",
        amount: toNumber(payment.amount),
        status: payment.status as "pending" | "received" | "cancelled" | null,
      }))
    ).label
  }

  const labels: Record<string, string> = {
    paid: "Pago",
    partially_paid: "Parcialmente recebido",
    pending: "Pendente",
    cancelled: "Cancelado",
  }
  return labels[String(legacyStatus || "pending")] || labelOrDash(legacyStatus)
}

function paymentSummary(payments: RawPayment[], legacyMethod?: string | null) {
  const active = payments.filter((payment) => payment.status !== "cancelled")
  const methods = Array.from(new Set(active.map((payment) => payment.payment_method).filter(Boolean))) as string[]
  if (methods.length === 0) return formatPaymentMethod(legacyMethod)
  if (methods.length === 1) return formatPaymentMethod(methods[0])
  if (methods.length <= 2) return methods.map((method) => formatPaymentMethod(method)).join(" + ")
  return "Pagamento misto"
}

function accountSummary(payments: RawPayment[]) {
  const accounts = Array.from(new Set(payments.map((payment) => payment.financial_account_name).filter(Boolean))) as string[]
  if (accounts.length === 0) return "—"
  if (accounts.length <= 2) return accounts.join(" + ")
  return `${accounts.length} contas`
}

function expectedReceiptDate(payments: RawPayment[], fallback?: string | null) {
  const dates = payments.map((payment) => dateOnly(payment.due_date)).filter(Boolean).sort()
  return dates[0] || dateOnly(fallback)
}

function actualReceiptDate(payments: RawPayment[]) {
  const received = payments
    .filter((payment) => payment.status === "received")
    .map((payment) => dateOnly(payment.received_date || payment.reconciled_at))
    .filter(Boolean)
    .sort()
  if (received.length === 0) return ""
  return received[received.length - 1]
}

function saleCustomerPaidTotal(row: RawSaleRow, payments: RawPayment[]) {
  const active = payments.filter((payment) => payment.status !== "cancelled")
  if (active.length === 0) return toNumber(row.net_amount ?? row.sale_price)
  return active.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
}

function tradeInCreditAmount(row: RawSaleRow, payments: RawPayment[], saleValue: number) {
  const activeTradeInPayments = payments
    .filter((payment) => payment.status !== "cancelled" && payment.payment_method === "trade_in_credit")
  const fromPayments = activeTradeInPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const fromTradeIn = row.has_trade_in || row.trade_in_id ? toNumber(row.trade_in_value) : 0
  const credit = activeTradeInPayments.length > 0 ? fromPayments : fromTradeIn
  return roundCurrency(Math.min(saleValue, Math.max(0, credit)))
}

function financialPaymentAmount(row: RawSaleRow, payments: RawPayment[], saleValue: number, tradeInCredit: number) {
  const activeFinancial = payments.filter((payment) => payment.status !== "cancelled" && isFinancialPayment(payment.payment_method))
  if (activeFinancial.length > 0) {
    return roundCurrency(activeFinancial.reduce((sum, payment) => sum + toNumber(payment.amount), 0))
  }
  return roundCurrency(Math.max(0, toNumber(row.net_amount ?? saleValue) - tradeInCredit))
}

function financialReceivedAmount(row: RawSaleRow, payments: RawPayment[], saleValue: number, tradeInCredit: number) {
  const activeFinancial = payments.filter((payment) => payment.status !== "cancelled" && isFinancialPayment(payment.payment_method))
  if (activeFinancial.length > 0) {
    return roundCurrency(
      activeFinancial
        .filter((payment) => payment.status === "received")
        .reduce((sum, payment) => sum + toNumber(payment.amount), 0)
    )
  }
  return row.payment_status === "paid"
    ? roundCurrency(Math.max(0, toNumber(row.net_amount ?? saleValue) - tradeInCredit))
    : 0
}

function tradeInObservation(row: RawSaleRow, tradeInCredit: number) {
  if (tradeInCredit <= 0) return "—"

  const device = tradeInDeviceName(row)
  const identity = row.trade_in_inventory_imei || row.trade_in_imei || row.trade_in_inventory_serial_number || row.trade_in_serial_number
  const deviceText = device
    ? ` Produto recebido: ${device}${identity ? ` (${identity})` : ""}.`
    : " Trade-in registrado, item recebido não identificado neste relatório."

  return `Parte do pagamento foi abatida por trade-in; não representa entrada de caixa.${deviceText}`
}

function receivedAndPending(payments: RawPayment[], fallbackSaleValue: number, fallbackPaymentStatus?: string | null) {
  const active = payments.filter((payment) => payment.status !== "cancelled" && isFinancialPayment(payment.payment_method))
  if (active.length === 0) {
    if (fallbackPaymentStatus === "paid") return { received: fallbackSaleValue, pending: 0 }
    if (fallbackPaymentStatus === "partially_paid") return { received: 0, pending: fallbackSaleValue }
    return { received: 0, pending: fallbackSaleValue }
  }

  return active.reduce(
    (totals, payment) => {
      const amount = toNumber(payment.amount)
      if (payment.status === "received") totals.received += amount
      else totals.pending += amount
      return totals
    },
    { received: 0, pending: 0 }
  )
}

function discountValue(row: RawSaleRow, saleValue: number, additionalItems: RawAdditionalItem[]) {
  const suggestedMain = toNumber(row.inventory_suggested_price) * parseQtyFromNotes(row.notes)
  const upsellValue = additionalItems.reduce((sum, item) => {
    return item.type === "upsell" ? sum + toNumber(item.sale_price) : sum
  }, 0)
  if (suggestedMain <= 0) return 0
  return Math.max(0, suggestedMain + upsellValue - saleValue)
}

function normalizeFilters(input: URLSearchParams): SalesReportFilters {
  const defaults = currentMonthRange()
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

  const paymentMethod = input.get("payment_method") || undefined
  const financialAccountId = input.get("financial_account_id") || undefined
  const saleStatus = input.get("sale_status") || undefined

  return {
    startDate,
    endDate,
    paymentMethod: paymentMethod && paymentMethod !== "all" ? paymentMethod : undefined,
    financialAccountId: financialAccountId && financialAccountId !== "all" ? financialAccountId : undefined,
    saleStatus: saleStatus && saleStatus !== "all" ? saleStatus : undefined,
  }
}

export function parseSalesReportRequest(url: string) {
  const parsed = new URL(url)
  const filters = normalizeFilters(parsed.searchParams)
  const format = parsed.searchParams.get("format") === "xlsx" ? "xlsx" : "json"
  return { filters, format }
}

async function getAccounts(companyId: string) {
  const result = await pool.query<AccountRow>(
    `
      SELECT id, name
      FROM finance_accounts
      WHERE company_id = $1
        AND COALESCE(is_active, TRUE) = TRUE
      ORDER BY name ASC
    `,
    [companyId]
  )
  return result.rows
}

async function getRawSales(companyId: string, filters: SalesReportFilters) {
  const result = await pool.query<RawSaleRow>(
    `
      WITH filtered_sales AS (
        SELECT s.*
        FROM sales s
        WHERE s.company_id = $1
          AND s.sale_date >= $2::date
          AND s.sale_date <= $3::date
          AND ($4::text IS NULL OR s.sale_status = $4::text)
          AND (
            $5::text IS NULL
            OR EXISTS (
              SELECT 1
              FROM sale_payments sp_filter
              WHERE sp_filter.sale_id = s.id
                AND sp_filter.company_id = s.company_id
                AND sp_filter.status <> 'cancelled'
                AND sp_filter.payment_method = $5::text
            )
            OR (
              NOT EXISTS (
                SELECT 1 FROM sale_payments sp_any
                WHERE sp_any.sale_id = s.id
                  AND sp_any.company_id = s.company_id
                  AND sp_any.status <> 'cancelled'
              )
              AND s.payment_method = $5::text
            )
          )
          AND (
            $6::uuid IS NULL
            OR EXISTS (
              SELECT 1
              FROM sale_payments sp_account
              LEFT JOIN transactions tx_account ON tx_account.id = sp_account.transaction_id
              WHERE sp_account.sale_id = s.id
                AND sp_account.company_id = s.company_id
                AND sp_account.status <> 'cancelled'
                AND (
                  sp_account.financial_account_id = $6::uuid
                  OR tx_account.account_id = $6::uuid
                )
            )
            OR EXISTS (
              SELECT 1
              FROM transactions tx_legacy
              WHERE tx_legacy.company_id = s.company_id
                AND tx_legacy.source_type = 'sale'
                AND tx_legacy.source_id = s.id
                AND tx_legacy.account_id = $6::uuid
                AND COALESCE(tx_legacy.status, 'pending') <> 'cancelled'
            )
          )
      ),
      additional_items AS (
        SELECT
          sai.sale_id,
          jsonb_agg(
            jsonb_build_object(
              'id', sai.id,
              'type', sai.type,
              'name', sai.name,
              'cost_price', sai.cost_price,
              'sale_price', sai.sale_price,
              'profit', sai.profit
            )
            ORDER BY sai.created_at ASC, sai.id ASC
          ) AS items
        FROM sales_additional_items sai
        JOIN filtered_sales fs ON fs.id = sai.sale_id
        WHERE sai.company_id = $1
        GROUP BY sai.sale_id
      ),
      payment_rows AS (
        SELECT
          sp.sale_id,
          jsonb_agg(
            jsonb_build_object(
              'id', sp.id,
              'payment_method', sp.payment_method,
              'amount', sp.amount,
              'status', sp.status,
              'due_date', sp.due_date,
              'received_date', sp.received_date,
              'financial_account_id', sp.financial_account_id,
              'transaction_id', COALESCE(sp.transaction_id, tx_by_payment.id),
              'financial_account_name', fa.name,
              'transaction_status', COALESCE(tx.status, tx_by_payment.status),
              'reconciled_at', COALESCE(tx.reconciled_at, tx_by_payment.reconciled_at),
              'movement_id', movement.id
            )
            ORDER BY sp.due_date ASC, sp.created_at ASC, sp.id ASC
          ) AS payments
        FROM sale_payments sp
        JOIN filtered_sales fs ON fs.id = sp.sale_id
        LEFT JOIN transactions tx ON tx.id = sp.transaction_id
        LEFT JOIN transactions tx_by_payment
          ON tx_by_payment.company_id = sp.company_id
          AND tx_by_payment.source_type = 'sale_payment'
          AND tx_by_payment.source_id = sp.id
          AND COALESCE(tx_by_payment.status, 'pending') <> 'cancelled'
        LEFT JOIN finance_accounts fa ON fa.id = COALESCE(sp.financial_account_id, tx.account_id, tx_by_payment.account_id)
        LEFT JOIN LATERAL (
          SELECT fam.id
          FROM financial_account_movements fam
          WHERE fam.company_id = sp.company_id
            AND fam.source IN ('account_receivable', 'sale', 'transaction')
            AND (
              fam.source_id = COALESCE(sp.transaction_id, tx_by_payment.id)
              OR fam.source_id = sp.sale_id
            )
            AND fam.is_canceled = FALSE
          ORDER BY fam.movement_date DESC, fam.created_at DESC
          LIMIT 1
        ) movement ON TRUE
        WHERE sp.company_id = $1
          AND sp.status <> 'cancelled'
        GROUP BY sp.sale_id
      )
      SELECT
        fs.id AS sale_id,
        fs.sale_date::text,
        fs.sale_status,
        fs.payment_status,
        fs.sale_price,
        fs.net_amount,
        fs.supplier_cost,
        fs.payment_method,
        fs.has_trade_in,
        fs.trade_in_id,
        ti.trade_in_value,
        ti.notes AS trade_in_notes,
        ti.grade AS trade_in_grade,
        ti.imei AS trade_in_imei,
        ti.serial_number AS trade_in_serial_number,
        tii.imei AS trade_in_inventory_imei,
        tii.serial_number AS trade_in_inventory_serial_number,
        tipc.model AS trade_in_model,
        tipc.variant AS trade_in_variant,
        tipc.storage AS trade_in_storage,
        tipc.color AS trade_in_color,
        fs.payment_due_date::text,
        fs.notes,
        CASE
          WHEN fs.customer_type = 'walk_in' THEN COALESCE(NULLIF(fs.walk_in_label, ''), 'Cliente avulso')
          ELSE c.full_name
        END AS customer_name,
        fs.customer_type,
        fs.walk_in_label,
        i.imei,
        i.imei2,
        i.serial_number,
        i.purchase_price AS inventory_purchase_price,
        i.suggested_price AS inventory_suggested_price,
        i.product_type AS inventory_product_type,
        i.category_name_snapshot,
        i.subcategory_name_snapshot,
        pc.category AS catalog_category,
        pc.brand AS catalog_brand,
        pc.model AS catalog_model,
        pc.variant AS catalog_variant,
        pc.storage AS catalog_storage,
        pc.color AS catalog_color,
        ipi.freight_allocated,
        ipi.other_cost_allocated,
        ipi.landed_unit_cost,
        COALESCE(ai.items, '[]'::jsonb) AS additional_items,
        COALESCE(pr.payments, '[]'::jsonb) AS payments
      FROM filtered_sales fs
      LEFT JOIN customers c ON c.id = fs.customer_id
      LEFT JOIN inventory i ON i.id = fs.inventory_id
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      LEFT JOIN trade_ins ti ON ti.id = fs.trade_in_id AND ti.company_id = fs.company_id
      LEFT JOIN product_catalog tipc ON tipc.id = ti.catalog_id
      LEFT JOIN inventory tii ON tii.id = ti.linked_inventory_id AND tii.company_id = fs.company_id
      LEFT JOIN LATERAL (
        SELECT freight_allocated, other_cost_allocated, landed_unit_cost
        FROM inventory_purchase_items ipi
        WHERE ipi.company_id = fs.company_id
          AND ipi.inventory_id = fs.inventory_id
        ORDER BY ipi.created_at DESC
        LIMIT 1
      ) ipi ON TRUE
      LEFT JOIN additional_items ai ON ai.sale_id = fs.id
      LEFT JOIN payment_rows pr ON pr.sale_id = fs.id
      ORDER BY fs.sale_date DESC, fs.created_at DESC, fs.id DESC
    `,
    [
      companyId,
      filters.startDate,
      filters.endDate,
      filters.saleStatus || null,
      filters.paymentMethod || null,
      filters.financialAccountId || null,
    ]
  )

  return result.rows
}

export function mapSalesReportRows(rawRows: RawSaleRow[]) {
  const rows: SalesReportLine[] = []
  const paymentRows: SalesReportPaymentLine[] = []
  let grossRevenue = 0
  let tradeInCreditTotal = 0
  let mainProductCostTotal = 0
  let giftItemsCostTotal = 0
  let upsellItemsCostTotal = 0
  let upsellItemsRevenueTotal = 0
  let upsellItemsProfitTotal = 0
  let additionalItemsCostTotal = 0
  let productCostTotal = 0
  let grossProfit = 0
  let totalReceived = 0
  let totalPending = 0
  let hasTradeIn = false
  let hasAdditionalItemsCost = false

  for (const row of rawRows) {
    const additionalItems = row.additional_items || []
    const additionalBreakdown = additionalItemsBreakdown(additionalItems)
    const payments = row.payments || []
    const saleValue = toNumber(row.sale_price)
    const totals = calcSaleTotals({
      salePrice: saleValue,
      mainCost: row.inventory_purchase_price,
      qty: parseQtyFromNotes(row.notes),
      additionalItems: additionalItems.map((item) => ({
        type: item.type || "upsell",
        name: item.name || undefined,
        cost_price: item.cost_price,
        sale_price: item.sale_price,
        profit: item.profit,
      })),
      supplierCost: row.supplier_cost,
    })
    const freightAndOther = toNumber(row.freight_allocated) + toNumber(row.other_cost_allocated)
    const mainProductCost = totals.custoPrincipal + freightAndOther
    const additionalItemsCost = totals.custoAdicionais
    const costTotal = mainProductCost + additionalItemsCost
    const profit = saleValue - costTotal
    const margin = saleValue > 0 ? (profit / saleValue) * 100 : 0
    const tradeInCredit = tradeInCreditAmount(row, payments, saleValue)
    const financialExpectedValue = financialPaymentAmount(row, payments, saleValue, tradeInCredit)
    const financialReceivedValue = financialReceivedAmount(row, payments, saleValue, tradeInCredit)
    const cash = receivedAndPending(payments, financialExpectedValue, row.payment_status)
    const saleHasTradeIn = tradeInCredit > 0 || Boolean(row.has_trade_in || row.trade_in_id)

    grossRevenue += saleValue
    tradeInCreditTotal += tradeInCredit
    mainProductCostTotal += mainProductCost
    giftItemsCostTotal += additionalBreakdown.giftCost
    upsellItemsCostTotal += additionalBreakdown.upsellCost
    upsellItemsRevenueTotal += additionalBreakdown.upsellRevenue
    upsellItemsProfitTotal += additionalBreakdown.upsellProfit
    additionalItemsCostTotal += additionalItemsCost
    productCostTotal += costTotal
    grossProfit += profit
    totalReceived += cash.received
    totalPending += cash.pending
    hasTradeIn ||= saleHasTradeIn
    hasAdditionalItemsCost ||= additionalItemsCost > 0

    rows.push({
      saleDate: row.sale_date,
      saleId: row.sale_id,
      customer: labelOrDash(row.customer_name),
      product: productName(row),
      category: categoryName(row),
      imeiOrSerial: row.imei || row.imei2 || row.serial_number || "—",
      saleStatus: labelOrDash(row.sale_status),
      financialStatus: mapFinancialStatus(payments, row.payment_status),
      saleValue: roundCurrency(saleValue),
      grossSaleValue: roundCurrency(saleValue),
      tradeInCredit,
      financialReceivedValue,
      discount: roundCurrency(discountValue(row, saleValue, additionalItems)),
      customerPaidTotal: roundCurrency(saleCustomerPaidTotal(row, payments)),
      paymentMethod: paymentSummary(payments, row.payment_method),
      installments: payments.length > 0
        ? Array.from(new Set(payments.map((payment) => installmentsLabel(payment.payment_method)))).join(" + ")
        : installmentsLabel(row.payment_method),
      receivingAccount: accountSummary(payments),
      expectedReceiptDate: expectedReceiptDate(payments, row.payment_due_date),
      actualReceiptDate: actualReceiptDate(payments),
      mainProductCost: roundCurrency(mainProductCost),
      giftItemsCost: roundCurrency(additionalBreakdown.giftCost),
      upsellItemsCost: roundCurrency(additionalBreakdown.upsellCost),
      upsellItemsRevenue: roundCurrency(additionalBreakdown.upsellRevenue),
      upsellItemsProfit: roundCurrency(additionalBreakdown.upsellProfit),
      additionalItemsCost: roundCurrency(additionalItemsCost),
      totalSaleCost: roundCurrency(costTotal),
      productPurchaseCost: roundCurrency(totals.custoPrincipal),
      allocatedFreightCost: roundCurrency(freightAndOther),
      productTotalCost: roundCurrency(costTotal),
      grossProfit: roundCurrency(profit),
      grossCommercialProfit: roundCurrency(profit),
      grossMarginPct: margin,
      hasTradeIn: saleHasTradeIn ? "Sim" : "Não",
      tradeInReceivedProduct: tradeInDeviceName(row) || "—",
      tradeInObservation: tradeInObservation(row, tradeInCredit),
      linkedAdditionalItems: additionalItemsLabel(additionalItems),
      additionalItemsTypes: additionalItemsTypesLabel(additionalItems),
      notes: labelOrDash(row.notes),
    })

    if (payments.length === 0) {
      paymentRows.push({
        saleId: row.sale_id,
        saleDate: row.sale_date,
        paymentMethod: formatPaymentMethod(row.payment_method),
        installments: installmentsLabel(row.payment_method),
        installmentAmount: roundCurrency(toNumber(row.net_amount ?? row.sale_price)),
        totalAmount: roundCurrency(toNumber(row.net_amount ?? row.sale_price)),
        financialAccount: "—",
        transactionId: "—",
        transactionStatus: labelOrDash(row.payment_status),
        expectedDate: dateOnly(row.payment_due_date),
        reconciledDate: "",
        movementId: "—",
      })
    } else {
      for (const payment of payments) {
        paymentRows.push({
          saleId: row.sale_id,
          saleDate: row.sale_date,
          paymentMethod: formatPaymentMethod(payment.payment_method),
          installments: installmentsLabel(payment.payment_method),
          installmentAmount: roundCurrency(toNumber(payment.amount)),
          totalAmount: roundCurrency(toNumber(payment.amount)),
          financialAccount: labelOrDash(payment.financial_account_name),
          transactionId: labelOrDash(payment.transaction_id),
          transactionStatus: labelOrDash(payment.transaction_status || payment.status),
          expectedDate: dateOnly(payment.due_date),
          reconciledDate: payment.status === "received" ? dateOnly(payment.received_date || payment.reconciled_at) : "",
          movementId: labelOrDash(payment.movement_id),
        })
      }
    }
  }

  return {
    rows,
    paymentRows,
    totals: {
      grossRevenue: roundCurrency(grossRevenue),
      tradeInCreditTotal: roundCurrency(tradeInCreditTotal),
      mainProductCostTotal: roundCurrency(mainProductCostTotal),
      giftItemsCostTotal: roundCurrency(giftItemsCostTotal),
      upsellItemsCostTotal: roundCurrency(upsellItemsCostTotal),
      upsellItemsRevenueTotal: roundCurrency(upsellItemsRevenueTotal),
      upsellItemsProfitTotal: roundCurrency(upsellItemsProfitTotal),
      additionalItemsCostTotal: roundCurrency(additionalItemsCostTotal),
      productCostTotal: roundCurrency(productCostTotal),
      grossProfit: roundCurrency(grossProfit),
      totalReceived: roundCurrency(totalReceived),
      totalPending: roundCurrency(totalPending),
      hasTradeIn,
      hasAdditionalItemsCost,
    },
  }
}

export async function buildSalesReport(companyId: string, filters: SalesReportFilters): Promise<SalesReportData> {
  const [rawRows, accounts] = await Promise.all([
    getRawSales(companyId, filters),
    getAccounts(companyId),
  ])
  const mapped = mapSalesReportRows(rawRows)
  const averageMargin = mapped.totals.grossRevenue > 0
    ? (mapped.totals.grossProfit / mapped.totals.grossRevenue) * 100
    : 0

  const summary: SalesReportSummary = {
    period: `${filters.startDate} a ${filters.endDate}`,
    salesCount: mapped.rows.length,
    grossCommercialRevenue: mapped.totals.grossRevenue,
    tradeInCreditTotal: mapped.totals.tradeInCreditTotal,
    financialReceivedRevenue: mapped.totals.totalReceived,
    mainProductCostTotal: mapped.totals.mainProductCostTotal,
    giftItemsCostTotal: mapped.totals.giftItemsCostTotal,
    upsellItemsCostTotal: mapped.totals.upsellItemsCostTotal,
    upsellItemsRevenueTotal: mapped.totals.upsellItemsRevenueTotal,
    upsellItemsProfitTotal: mapped.totals.upsellItemsProfitTotal,
    additionalItemsCostTotal: mapped.totals.additionalItemsCostTotal,
    totalSaleCost: mapped.totals.productCostTotal,
    productCostTotal: mapped.totals.productCostTotal,
    grossCommercialProfit: mapped.totals.grossProfit,
    averageMargin,
    totalPending: mapped.totals.totalPending,
    hasTradeIn: mapped.totals.hasTradeIn,
    hasAdditionalItemsCost: mapped.totals.hasAdditionalItemsCost,
    generatedAt: todayISO(),
    methodologyNote: "Receita comercial vem de sales.sale_price uma vez por venda; trade-in é abatimento comercial e não entrada de caixa; itens adicionais são decompostos por sales_additional_items.type sem somar receita de upsell novamente.",
  }

  return {
    filters,
    summary,
    rows: mapped.rows,
    previewRows: mapped.rows.slice(0, PREVIEW_LIMIT),
    paymentRows: mapped.paymentRows,
    filterOptions: {
      paymentMethods: PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label })),
      financialAccounts: accounts,
    },
    previewLimit: PREVIEW_LIMIT,
  }
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: SalesReportData) {
  const sheet = workbook.addWorksheet("Resumo")
  sheet.columns = [
    { header: "Campo", key: "field", width: 34 },
    { header: "Valor", key: "value", width: 54 },
  ]
  sheet.addRows([
    { field: "Período", value: report.summary.period },
    { field: "Quantidade de vendas", value: report.summary.salesCount },
    { field: "Receita bruta comercial", value: report.summary.grossCommercialRevenue },
    { field: "Trade-in abatido", value: report.summary.tradeInCreditTotal },
    { field: "Receita financeira recebida", value: report.summary.financialReceivedRevenue },
    { field: "Custo dos produtos principais", value: report.summary.mainProductCostTotal },
    { field: "Custo de brindes", value: report.summary.giftItemsCostTotal },
    { field: "Custo de upsells", value: report.summary.upsellItemsCostTotal },
    { field: "Receita de upsells", value: report.summary.upsellItemsRevenueTotal },
    { field: "Lucro de upsells", value: report.summary.upsellItemsProfitTotal },
    { field: "Custo total de adicionais", value: report.summary.additionalItemsCostTotal },
    { field: "Custo total das vendas", value: report.summary.totalSaleCost },
    { field: "Lucro bruto comercial", value: report.summary.grossCommercialProfit },
    { field: "Margem média", value: `${report.summary.averageMargin.toFixed(2)}%` },
    { field: "Total pendente", value: report.summary.totalPending },
    { field: "Aviso de trade-in", value: report.summary.hasTradeIn ? "Há vendas com trade-in neste período. O valor abatido não representa entrada de caixa." : "Sem trade-in no período filtrado." },
    { field: "Aviso de adicionais", value: report.summary.hasAdditionalItemsCost ? "Há vendas com brindes ou upsells neste período. Esses itens foram classificados pelo campo sales_additional_items.type." : "Sem custo de adicionais no período filtrado." },
    { field: "Data de geração", value: report.summary.generatedAt },
    { field: "Observação metodológica", value: report.summary.methodologyNote },
  ])
  formatWorksheet(sheet, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14])
}

function addSalesSheet(workbook: ExcelJS.Workbook, report: SalesReportData) {
  const sheet = workbook.addWorksheet("Vendas detalhadas")
  sheet.columns = [
    { header: "Data da venda", key: "saleDate", width: 16 },
    { header: "ID da venda", key: "saleId", width: 38 },
    { header: "Cliente", key: "customer", width: 28 },
    { header: "Produto", key: "product", width: 36 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "IMEI/Serial, se aplicável", key: "imeiOrSerial", width: 24 },
    { header: "Status da venda", key: "saleStatus", width: 18 },
    { header: "Status financeiro", key: "financialStatus", width: 24 },
    { header: "Valor de venda", key: "saleValue", width: 16 },
    { header: "Valor bruto da venda", key: "grossSaleValue", width: 20 },
    { header: "Trade-in abatido", key: "tradeInCredit", width: 18 },
    { header: "Valor financeiro recebido", key: "financialReceivedValue", width: 24 },
    { header: "Desconto", key: "discount", width: 14 },
    { header: "Valor total pago pelo cliente", key: "customerPaidTotal", width: 24 },
    { header: "Método de pagamento", key: "paymentMethod", width: 24 },
    { header: "Parcelas", key: "installments", width: 12 },
    { header: "Conta de recebimento", key: "receivingAccount", width: 24 },
    { header: "Data prevista de recebimento", key: "expectedReceiptDate", width: 24 },
    { header: "Data real de recebimento", key: "actualReceiptDate", width: 22 },
    { header: "Custo do produto principal", key: "mainProductCost", width: 24 },
    { header: "Itens adicionais vinculados", key: "linkedAdditionalItems", width: 44 },
    { header: "Tipo dos adicionais", key: "additionalItemsTypes", width: 20 },
    { header: "Custo de brindes", key: "giftItemsCost", width: 18 },
    { header: "Custo de upsells", key: "upsellItemsCost", width: 18 },
    { header: "Receita de upsells", key: "upsellItemsRevenue", width: 20 },
    { header: "Lucro de upsells", key: "upsellItemsProfit", width: 18 },
    { header: "Custo total de adicionais", key: "additionalItemsCost", width: 24 },
    { header: "Custo total da venda", key: "totalSaleCost", width: 22 },
    { header: "Custo de compra do produto", key: "productPurchaseCost", width: 24 },
    { header: "Frete/custo alocado", key: "allocatedFreightCost", width: 20 },
    { header: "Lucro bruto", key: "grossProfit", width: 16 },
    { header: "Lucro bruto comercial", key: "grossCommercialProfit", width: 22 },
    { header: "Margem bruta %", key: "grossMarginPct", width: 16 },
    { header: "Teve trade-in?", key: "hasTradeIn", width: 16 },
    { header: "Produto recebido no trade-in, se disponível", key: "tradeInReceivedProduct", width: 36 },
    { header: "Observação do trade-in", key: "tradeInObservation", width: 58 },
    { header: "Observações", key: "notes", width: 44 },
  ]
  sheet.addRows(report.rows)
  formatWorksheet(sheet, [9, 10, 11, 12, 13, 14, 20, 23, 24, 25, 26, 27, 28, 29, 30])
  sheet.getColumn("grossMarginPct").numFmt = "0.00%"
  sheet.eachRow((row, index) => {
    if (index > 1) {
      const cell = row.getCell("grossMarginPct")
      cell.value = Number(cell.value || 0) / 100
    }
  })
}

function addPaymentsSheet(workbook: ExcelJS.Workbook, report: SalesReportData) {
  const sheet = workbook.addWorksheet("Pagamentos Recebimentos")
  sheet.columns = [
    { header: "ID da venda", key: "saleId", width: 38 },
    { header: "Data da venda", key: "saleDate", width: 16 },
    { header: "Método de pagamento", key: "paymentMethod", width: 24 },
    { header: "Parcelas", key: "installments", width: 12 },
    { header: "Valor da parcela/entrada", key: "installmentAmount", width: 24 },
    { header: "Valor total", key: "totalAmount", width: 16 },
    { header: "Conta financeira", key: "financialAccount", width: 24 },
    { header: "Transaction ID", key: "transactionId", width: 38 },
    { header: "Status da transação", key: "transactionStatus", width: 20 },
    { header: "Data prevista", key: "expectedDate", width: 16 },
    { header: "Data conciliada", key: "reconciledDate", width: 16 },
    { header: "Movement ID, se houver", key: "movementId", width: 38 },
  ]
  sheet.addRows(report.paymentRows)
  formatWorksheet(sheet, [5, 6])
}

function addMethodologySheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Metodologia")
  sheet.columns = [{ header: "Critério", key: "criterion", width: 120 }]
  sheet.addRows([
    { criterion: "Lucro bruto = valor de venda menos custo total dos produtos vendidos." },
    { criterion: "Taxas de cartão repassadas ao cliente não são tratadas como despesa da Nobretech neste relatório." },
    { criterion: "Trade-in é abatimento comercial e não deve ser confundido com entrada de caixa." },
    { criterion: "Trade-in credit é abatimento comercial e não entrada de caixa. Por isso, o relatório separa valor bruto da venda, valor abatido em trade-in e valor financeiro recebido." },
    { criterion: "Brindes e acessórios entregues junto com a venda compõem o custo real da venda, mesmo quando não são cobrados separadamente do cliente." },
    { criterion: "sales_additional_items.type = 'free' é Brinde; sales_additional_items.type = 'upsell' é Upsell." },
    { criterion: "Receita de upsells é apresentada apenas para transparência. A receita bruta comercial já vem de sales.sale_price e não soma upsells novamente." },
    { criterion: "Recebimentos pendentes são separados de valores conciliados/recebidos." },
    { criterion: "financial_account_movements é a fonte para caixa conciliado quando há movimento vinculado." },
    { criterion: "A receita comercial é reconhecida uma vez por venda a partir de sales.sale_price; sale_payments e transactions detalham liquidação financeira." },
    { criterion: "Relatório para conferência administrativa/contábil; valide a metodologia final com o contador." },
  ])
  formatWorksheet(sheet)
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

export async function buildSalesReportWorkbook(report: SalesReportData) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Nobretech Store ERP"
  workbook.created = new Date()
  workbook.modified = new Date()

  addSummarySheet(workbook, report)
  addSalesSheet(workbook, report)
  addPaymentsSheet(workbook, report)
  addMethodologySheet(workbook)

  return workbook.xlsx.writeBuffer()
}
