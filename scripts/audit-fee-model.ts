import dotenv from "dotenv"
import { Pool } from "pg"
import { buildFeeModelAudit, type BuildFeeModelAuditInput } from "../src/lib/financial/fee-model-audit"

dotenv.config({ path: ".env.local" })

const TARGET_SALE_ID = "53d7f7b7-53ad-4d6b-9d5d-f56c5953b9b0"

type SaleRow = {
  id: string
  sale_date: string | Date
  sale_price: number | string | null
  net_amount: number | string | null
  card_fee_pct: number | string | null
  payment_method: string | null
  supplier_cost: number | string | null
  trade_in_value: number | string | null
  purchase_price: number | string | null
  product_name: string | null
  product_category: string | null
}

type PaymentRow = {
  id: string
  sale_id: string
  payment_method: string | null
  amount: number | string | null
  status: string | null
}

type TransactionRow = {
  id: string
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

function saleLabel(sale: SaleRow) {
  return [sale.product_category, sale.product_name].filter(Boolean).join(" ").trim() || sale.id
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required to run the read-only fee model audit.")

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

    const since = dateKey(new Date(Date.now() - 180 * 86400000))
    const [sales, payments, transactions, settings] = await Promise.all([
      pool.query<SaleRow>(
        `
          SELECT
            s.id,
            s.sale_date,
            s.sale_price,
            s.net_amount,
            s.card_fee_pct,
            s.payment_method,
            s.supplier_cost,
            ti.trade_in_value,
            i.purchase_price,
            COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS product_name,
            COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS product_category
          FROM sales s
          LEFT JOIN inventory i ON i.id = s.inventory_id
          LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
          LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
          WHERE s.company_id = $1::uuid
            AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
            AND (s.sale_date >= $2::date OR s.id = $3::uuid)
          ORDER BY s.sale_date ASC
        `,
        [companyRow.id, since, TARGET_SALE_ID]
      ),
      pool.query<PaymentRow>(
        `
          SELECT sp.id, sp.sale_id, sp.payment_method, sp.amount, sp.status
          FROM sale_payments sp
          JOIN sales s ON s.id = sp.sale_id
          WHERE sp.company_id = $1::uuid
            AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
            AND (s.sale_date >= $2::date OR s.id = $3::uuid)
        `,
        [companyRow.id, since, TARGET_SALE_ID]
      ),
      pool.query<TransactionRow>(
        `
          SELECT
            t.id,
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
          LEFT JOIN sales s ON s.id = CASE
            WHEN t.source_type = 'sale' THEN t.source_id
            WHEN t.source_type = 'sale_payment' THEN sp.sale_id
            ELSE NULL
          END
          WHERE t.company_id = $1::uuid
            AND COALESCE(t.status, 'pending') <> 'cancelled'
            AND (
              t.date >= $2::date
              OR s.id = $3::uuid
            )
        `,
        [companyRow.id, since, TARGET_SALE_ID]
      ),
      pool.query<Record<string, unknown>>(
        "SELECT * FROM financial_settings WHERE company_id = $1::uuid LIMIT 1",
        [companyRow.id]
      ),
    ])

    const paymentsBySale = new Map<string, PaymentRow[]>()
    for (const payment of payments.rows) {
      const list = paymentsBySale.get(payment.sale_id) || []
      list.push(payment)
      paymentsBySale.set(payment.sale_id, list)
    }

    const transactionsBySale = new Map<string, TransactionRow[]>()
    for (const transaction of transactions.rows) {
      if (!transaction.sale_id) continue
      const list = transactionsBySale.get(transaction.sale_id) || []
      list.push(transaction)
      transactionsBySale.set(transaction.sale_id, list)
    }

    const financialSettings = settings.rows[0] || {}
    const audits = sales.rows.map((sale) => {
      const input: BuildFeeModelAuditInput = {
        saleId: sale.id,
        salePrice: sale.sale_price,
        grossRevenue: sale.sale_price,
        netAmount: sale.net_amount,
        inventoryCost: number(sale.supplier_cost ?? sale.purchase_price),
        tradeInCredit: sale.trade_in_value,
        payments: (paymentsBySale.get(sale.id) || []).map((payment) => ({
          id: payment.id,
          paymentMethod: payment.payment_method,
          amount: payment.amount,
          status: payment.status,
          isFinancial: payment.payment_method !== "trade_in_credit",
        })),
        transactions: (transactionsBySale.get(sale.id) || []).map((transaction) => ({
          id: transaction.id,
          sourceType: transaction.source_type,
          sourceId: transaction.source_id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
        })),
        settings: financialSettings,
      }
      const audit = buildFeeModelAudit(input)
      return {
        saleId: sale.id,
        saleDate: sale.sale_date,
        productName: saleLabel(sale),
        legacyPaymentMethod: sale.payment_method,
        legacyCardFeePct: number(sale.card_fee_pct),
        ...audit,
      }
    })

    const feeAudits = audits.filter((audit) => (
      audit.saleId === TARGET_SALE_ID ||
      audit.paymentFeeCost > 0 ||
      audit.transactionFees > 0 ||
      audit.unexplainedGrossVsNetDiff > 0 ||
      audit.feeDuplicated
    ))

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      companyId: companyRow.id,
      companyName: companyRow.name,
      since,
      targetSaleId: TARGET_SALE_ID,
      summary: {
        auditedSales: audits.length,
        salesWithFeeEvidence: feeAudits.length,
        merchantAbsorbed: feeAudits.filter((audit) => audit.feeResponsibility === "merchant_absorbed_fee").length,
        customerAbsorbed: feeAudits.filter((audit) => audit.feeResponsibility === "customer_absorbed_fee").length,
        mixed: feeAudits.filter((audit) => audit.feeResponsibility === "mixed_fee_model").length,
        duplicated: feeAudits.filter((audit) => audit.feeResponsibility === "duplicated_fee").length,
        unknown: feeAudits.filter((audit) => audit.feeResponsibility === "unknown_fee_model").length,
      },
      targetSale: feeAudits.find((audit) => audit.saleId === TARGET_SALE_ID) || null,
      feeAudits,
    }, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
