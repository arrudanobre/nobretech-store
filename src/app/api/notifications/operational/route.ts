import { NextResponse } from "next/server"
import type { QueryResultRow } from "pg"
import { requireApiAuthContext } from "@/lib/auth-context"
import { pool } from "@/lib/db"
import { todayISO } from "@/lib/helpers"
import {
  buildOperationalNotifications,
  type TransactionInput,
  type InventoryStaleInput,
  type ResellerRequestInput,
} from "@/lib/notifications/operational-notifications"

export const runtime = "nodejs"

type QueryRows<T extends QueryResultRow> = { rows: T[] }

function emptyRows<T extends QueryResultRow>(): QueryRows<T> {
  return { rows: [] }
}

function logOperationalNotificationError(scope: string, err: unknown) {
  const error = err as { code?: string; message?: string; name?: string }
  console.error("[notifications/operational] degraded", {
    scope,
    code: error?.code,
    name: error?.name,
    message: error?.message,
  })
}

async function safeNotificationQuery<T extends QueryResultRow>(
  scope: string,
  query: string,
  params: readonly unknown[]
): Promise<QueryRows<T>> {
  try {
    return await pool.query<T>(query, [...params])
  } catch (err) {
    logOperationalNotificationError(scope, err)
    return emptyRows<T>()
  }
}

export async function GET() {
  let authResult: Awaited<ReturnType<typeof requireApiAuthContext>>

  try {
    authResult = await requireApiAuthContext()
  } catch (err) {
    logOperationalNotificationError("auth", err)
    return NextResponse.json({ notifications: [] })
  }

  if (!authResult.ok) return authResult.response

  const { companyId } = authResult.context
  const today = todayISO()

  try {
    // The notification bell is operational support, not a page-critical dependency.
    // Run defensively and sequentially so transient DB/schema issues never break dashboards.
    const txResult = await safeNotificationQuery<TransactionInput>(
      "transactions",
        `SELECT t.id, t.type, t.status, t.due_date::text, t.amount, t.description
         FROM transactions t
         WHERE t.company_id = $1
           AND t.status = 'pending'
           AND t.type IN ('income', 'expense')
           AND t.due_date IS NOT NULL
           AND (
             t.type = 'expense'
             OR t.source_type IS NULL
             OR t.source_type NOT IN ('sale', 'sale_payment')
             OR (
               t.source_type = 'sale'
               AND NOT EXISTS (
                 SELECT 1 FROM sale_payments sp
                 WHERE sp.sale_id::text = t.source_id::text
                   AND sp.status != 'cancelled'
               )
             )
           )`,
      [companyId]
    )

    const spResult = await safeNotificationQuery<TransactionInput>(
      "sale_payments",
        `SELECT sp.id, 'income' AS type, 'pending' AS status,
                sp.due_date::text, sp.amount::text AS amount,
                'Pagamento parcelado' AS description
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         WHERE s.company_id = $1
           AND sp.status NOT IN ('received', 'cancelled', 'reconciled')
           AND sp.due_date IS NOT NULL`,
      [companyId]
    )

    const invResult = await safeNotificationQuery<InventoryStaleInput>(
      "inventory",
        `SELECT id, status, logistics_status, commercial_status,
                created_at::text, purchase_price
         FROM inventory
         WHERE company_id = $1
           AND status NOT IN ('sold', 'returned', 'under_repair')
           AND created_at < (NOW() - INTERVAL '20 days')`,
      [companyId]
    )

    const rrResult = await safeNotificationQuery<ResellerRequestInput>(
      "reseller_requests",
        `SELECT rr.id, rr.type, rr.reseller_id, rr.created_at::text,
                r.name AS reseller_name,
                COALESCE(o.source_type, 'inventory') AS source_type
           FROM reseller_requests rr
           JOIN resellers r ON r.id = rr.reseller_id
           LEFT JOIN reseller_product_offers o ON o.id = rr.offer_id
          WHERE rr.company_id = $1
            AND rr.status = 'pending'
          ORDER BY rr.created_at DESC
          LIMIT 20`,
      [companyId]
    )

    const notifications = buildOperationalNotifications({
      transactions: [...txResult.rows, ...spResult.rows],
      inventory: invResult.rows,
      today,
      resellerRequests: rrResult.rows,
    })

    return NextResponse.json({ notifications })
  } catch (err) {
    logOperationalNotificationError("build", err)
    return NextResponse.json({ notifications: [] })
  }
}
