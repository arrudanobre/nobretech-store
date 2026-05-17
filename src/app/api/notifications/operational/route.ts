import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { pool } from "@/lib/db"
import { todayISO } from "@/lib/helpers"
import {
  buildOperationalNotifications,
  type TransactionInput,
  type InventoryStaleInput,
} from "@/lib/notifications/operational-notifications"

export const runtime = "nodejs"

export async function GET() {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { companyId } = authResult.context
  const today = todayISO()

  try {
    const [txResult, spResult, invResult] = await Promise.all([
      // Transactions: income manual + income sale-without-splits + all expense pending
      // Exclui source_type='sale_payment' (status gerenciado em sale_payments, não em transactions)
      // Exclui source_type='sale' quando a venda já tem sale_payments (evita duplicidade)
      pool.query<TransactionInput>(
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
      ),
      // Sale_payments não recebidos/cancelados — split receivables que podem estar vencidos
      pool.query<TransactionInput>(
        `SELECT sp.id, 'income' AS type, 'pending' AS status,
                sp.due_date::text, sp.amount::text AS amount,
                'Pagamento parcelado' AS description
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         WHERE s.company_id = $1
           AND sp.status NOT IN ('received', 'cancelled', 'reconciled')
           AND sp.due_date IS NOT NULL`,
        [companyId]
      ),
      pool.query<InventoryStaleInput>(
        `SELECT id, status, logistics_status, commercial_status,
                created_at::text, purchase_price
         FROM inventory
         WHERE company_id = $1
           AND status NOT IN ('sold', 'returned', 'under_repair')
           AND created_at < (NOW() - INTERVAL '20 days')`,
        [companyId]
      ),
    ])

    const notifications = buildOperationalNotifications({
      transactions: [...txResult.rows, ...spResult.rows],
      inventory: invResult.rows,
      today,
    })

    return NextResponse.json({ notifications })
  } catch (err) {
    console.error("[notifications/operational] error", err)
    return NextResponse.json(
      { error: { message: "Erro ao buscar notificações operacionais." } },
      { status: 500 }
    )
  }
}
