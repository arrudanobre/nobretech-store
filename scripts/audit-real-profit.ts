import dotenv from "dotenv"
import { Pool } from "pg"
import { buildRealProfitDiagnostics } from "../src/lib/financial/real-profit-diagnostics"
import { buildRealProfitSnapshot, type RealProfitSaleInput } from "../src/lib/financial/real-profit-engine"

dotenv.config({ path: ".env.local" })

type SaleRow = {
  id: string
  inventory_id: string | null
  sale_date: string | Date
  sale_price: number | string | null
  net_amount: number | string | null
  supplier_cost: number | string | null
  warranty_months: number | string | null
  trade_in_id: string | null
  trade_in_value: number | string | null
  trade_in_linked_inventory_id: string | null
  purchase_price: number | string | null
  purchase_date: string | Date | null
  product_name: string | null
  product_category: string | null
}

type AdditionalItemRow = {
  id: string
  sale_id: string
  type: string | null
  cost_price: number | string | null
  sale_price: number | string | null
  purchase_date: string | Date | null
}

type SalePaymentRow = {
  id: string
  sale_id: string
  payment_method: string | null
  amount: number | string | null
  status: string | null
}

type TransactionRow = {
  sale_id: string | null
  source_type: string | null
  source_id: string | null
  type: string | null
  amount: number | string | null
  status: string | null
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function daysBetween(value: string | Date | null) {
  if (!value) return 0
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000))
}

function liquidityQuality(days: number) {
  if (days >= 60) return "low" as const
  if (days >= 30) return "medium" as const
  return "high" as const
}

function saleLabel(sale: SaleRow) {
  return [sale.product_category, sale.product_name].filter(Boolean).join(" ").trim() || sale.id
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required to run the read-only real profit audit.")

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("railway") ? { rejectUnauthorized: false } : undefined,
  })

  try {
    const company = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM companies WHERE slug = 'nobretech-store' LIMIT 1"
    )
    const companyRow = company.rows[0]
    if (!companyRow) throw new Error("Company nobretech-store not found.")

    const since = dateKey(new Date(Date.now() - 90 * 86400000))
    const [sales, additionalItems, payments, settings, transactions] = await Promise.all([
      pool.query<SaleRow>(
        `
          SELECT
            s.id,
            s.inventory_id,
            s.sale_date,
            s.sale_price,
            s.net_amount,
            s.supplier_cost,
            s.warranty_months,
            s.trade_in_id,
            ti.trade_in_value,
            ti.linked_inventory_id AS trade_in_linked_inventory_id,
            i.purchase_price,
            i.purchase_date,
            COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS product_name,
            COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS product_category
          FROM sales s
          LEFT JOIN inventory i ON i.id = s.inventory_id
          LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
          LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
          WHERE s.company_id = $1::uuid
            AND s.sale_date >= $2::date
            AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
          ORDER BY s.sale_date ASC
        `,
        [companyRow.id, since]
      ),
      pool.query<AdditionalItemRow>(
        `
          SELECT ai.id, ai.sale_id, ai.type, ai.cost_price, ai.sale_price, i.purchase_date
          FROM sales_additional_items ai
          JOIN sales s ON s.id = ai.sale_id
          LEFT JOIN inventory i ON i.id = ai.product_id
          WHERE ai.company_id = $1::uuid
            AND s.sale_date >= $2::date
            AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
        `,
        [companyRow.id, since]
      ),
      pool.query<SalePaymentRow>(
        `
          SELECT sp.id, sp.sale_id, sp.payment_method, sp.amount, sp.status
          FROM sale_payments sp
          JOIN sales s ON s.id = sp.sale_id
          WHERE sp.company_id = $1::uuid
            AND s.sale_date >= $2::date
            AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
        `,
        [companyRow.id, since]
      ),
      pool.query<Record<string, unknown>>(
        "SELECT * FROM financial_settings WHERE company_id = $1::uuid LIMIT 1",
        [companyRow.id]
      ),
      pool.query<TransactionRow>(
        `
          SELECT
            CASE
              WHEN t.source_type = 'sale' THEN t.source_id
              WHEN t.source_type = 'sale_payment' THEN sp.sale_id
              ELSE NULL
            END AS sale_id,
            t.source_type,
            t.source_id,
            t.type,
            t.amount,
            t.status
          FROM transactions t
          LEFT JOIN sale_payments sp ON sp.id = t.source_id AND t.source_type = 'sale_payment'
          WHERE t.company_id = $1::uuid
            AND t.type = 'expense'
            AND COALESCE(t.status, 'pending') <> 'cancelled'
            AND t.date >= $2::date
        `,
        [companyRow.id, since]
      ),
    ])

    const additionalBySale = new Map<string, AdditionalItemRow[]>()
    for (const item of additionalItems.rows) {
      const list = additionalBySale.get(item.sale_id) || []
      list.push(item)
      additionalBySale.set(item.sale_id, list)
    }

    const paymentsBySale = new Map<string, SalePaymentRow[]>()
    for (const payment of payments.rows) {
      const list = paymentsBySale.get(payment.sale_id) || []
      list.push(payment)
      paymentsBySale.set(payment.sale_id, list)
    }

    const expensesBySale = new Map<string, TransactionRow[]>()
    for (const transaction of transactions.rows) {
      if (!transaction.sale_id) continue
      const list = expensesBySale.get(transaction.sale_id) || []
      list.push(transaction)
      expensesBySale.set(transaction.sale_id, list)
    }

    const financialSettings = settings.rows[0] || {}
    const saleInputs: RealProfitSaleInput[] = sales.rows.map((sale) => {
      const days = daysBetween(sale.purchase_date)
      const salePayments = paymentsBySale.get(sale.id) || []
      const tradeInCredit = salePayments
        .filter((payment) => payment.payment_method === "trade_in_credit" && payment.status !== "cancelled")
        .reduce((sum, payment) => sum + number(payment.amount), 0)
      return {
        saleId: sale.id,
        saleLabel: saleLabel(sale),
        salePrice: sale.sale_price,
        netAmount: sale.net_amount,
        warrantyMonths: sale.warranty_months,
        mainItem: {
          id: sale.inventory_id,
          cost: number(sale.supplier_cost ?? sale.purchase_price),
          quantity: 1,
          daysInStock: days,
          liquidityQuality: liquidityQuality(days),
          costStructured: number(sale.supplier_cost ?? sale.purchase_price) > 0,
        },
        additionalItems: (additionalBySale.get(sale.id) || []).map((item) => {
          const itemDays = daysBetween(item.purchase_date)
          const cost = number(item.cost_price)
          return {
            id: item.id,
            type: item.type === "free" ? "free" as const : "upsell" as const,
            salePrice: item.sale_price,
            cost,
            quantity: 1,
            daysInStock: itemDays,
            liquidityQuality: liquidityQuality(itemDays),
            costStructured: cost > 0,
          }
        }),
        payments: salePayments.map((payment) => ({
          id: payment.id,
          paymentMethod: payment.payment_method,
          amount: payment.amount,
          status: payment.status,
          isFinancial: payment.payment_method !== "trade_in_credit",
        })),
        settings: financialSettings,
        operationalCosts: (expensesBySale.get(sale.id) || [])
          .filter((expense) => expense.source_type !== "card_fee")
          .map((expense) => ({
            amount: expense.amount,
            status: expense.status,
            linked: true,
          })),
        feeTransactions: (expensesBySale.get(sale.id) || []).map((expense) => ({
          sourceType: expense.source_type,
          sourceId: expense.source_id,
          type: expense.type,
          amount: expense.amount,
          status: expense.status,
        })),
        tradeIn: sale.trade_in_id || tradeInCredit > 0
          ? {
              creditAmount: tradeInCredit || number(sale.trade_in_value),
              linkedInventoryId: sale.trade_in_linked_inventory_id,
            }
          : null,
      }
    })

    const snapshot = buildRealProfitSnapshot({ sales: saleInputs })
    const diagnostics = buildRealProfitDiagnostics(snapshot)
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      companyId: companyRow.id,
      companyName: companyRow.name,
      since,
      summary: {
        realLossSales: diagnostics.realLossSales.length,
        negativeSales: diagnostics.negativeSales.length,
        lowMarginSales: diagnostics.lowMarginSales.length,
        warrantyReserveAdvisorySales: diagnostics.warrantyReserveAdvisorySales.length,
        tradeInSales: diagnostics.tradeInSales.length,
        tradeInDowngrades: diagnostics.tradeInDowngrades.length,
      },
      realLossSales: diagnostics.realLossSales,
      negativeSales: diagnostics.negativeSales,
      lowMarginSales: diagnostics.lowMarginSales,
      warrantyReserveAdvisorySales: diagnostics.warrantyReserveAdvisorySales,
      tradeInSales: diagnostics.tradeInSales,
      tradeInDowngrades: diagnostics.tradeInDowngrades,
    }, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
