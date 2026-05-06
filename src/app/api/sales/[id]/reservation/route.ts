import { NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { canAccess, canEditFinance, requireApiAuthContext } from "@/lib/auth-context"
import { syncTransactionMovement } from "@/lib/finance/sync-transaction-movement"

type RouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

type SaleRow = {
  id: string
  company_id: string
  inventory_id: string
  customer_id: string | null
  source_type: string | null
  warranty_months: number | null
  warranty_start: string | null
  warranty_end: string | null
  sale_date: string | null
  sale_status: string | null
  trade_in_id: string | null
}

async function writeSaleAudit(
  client: PoolClient,
  input: {
    companyId: string
    userId: string
    saleId: string
    oldStatus: string | null
    newStatus: string
    action: string
  }
) {
  await client.query(
    `
      INSERT INTO audit_logs (company_id, user_id, action, table_name, record_id, old_data, new_data)
      VALUES ($1::uuid, $2::uuid, 'updated', 'sales', $3::uuid, $4::jsonb, $5::jsonb)
    `,
    [
      input.companyId,
      input.userId,
      input.saleId,
      JSON.stringify({ sale_status: input.oldStatus || "completed" }),
      JSON.stringify({ sale_status: input.newStatus, reservation_action: input.action }),
    ]
  )
}

async function loadSaleForUpdate(client: PoolClient, saleId: string, companyId: string) {
  const result = await client.query<SaleRow>(
    `
      SELECT id, company_id, inventory_id, customer_id, source_type, warranty_months,
             warranty_start, warranty_end, sale_date, sale_status, trade_in_id
      FROM sales
      WHERE id = $1::uuid
        AND company_id = $2::uuid
      FOR UPDATE
    `,
    [saleId, companyId]
  )
  return result.rows[0] || null
}

async function completeReservation(client: PoolClient, sale: SaleRow) {
  await client.query(
    "UPDATE sales SET sale_status = 'completed' WHERE id = $1::uuid AND company_id = $2::uuid",
    [sale.id, sale.company_id]
  )

  if ((sale.source_type || "own") === "own") {
    await client.query(
      "UPDATE inventory SET status = 'sold' WHERE id = $1::uuid AND company_id = $2::uuid",
      [sale.inventory_id, sale.company_id]
    )
  }

  await client.query(
    `
      UPDATE inventory i
      SET status = 'sold'
      FROM sales_additional_items sai
      WHERE sai.product_id = i.id
        AND sai.sale_id = $1::uuid
        AND sai.company_id = $2::uuid
        AND i.company_id = $2::uuid
    `,
    [sale.id, sale.company_id]
  )

  if (Number(sale.warranty_months || 0) > 0) {
    await client.query(
      `
        INSERT INTO warranties (company_id, sale_id, inventory_id, customer_id, start_date, end_date, status)
        SELECT
          $2::uuid,
          $1::uuid,
          $3::uuid,
          $4::uuid,
          COALESCE($5::date, $7::date),
          COALESCE($6::date, COALESCE($5::date, $7::date) + (($8::int || ' months')::interval)),
          'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM warranties WHERE sale_id = $1::uuid AND company_id = $2::uuid
        )
      `,
      [
        sale.id,
        sale.company_id,
        sale.inventory_id,
        sale.customer_id,
        sale.warranty_start,
        sale.warranty_end,
        sale.sale_date,
        sale.warranty_months || 0,
      ]
    )
  }

  if (sale.trade_in_id) {
    const tradeIn = await client.query<{ linked_inventory_id: string | null }>(
      "SELECT linked_inventory_id FROM trade_ins WHERE id = $1::uuid AND company_id = $2::uuid FOR UPDATE",
      [sale.trade_in_id, sale.company_id]
    )
    const linkedInventoryId = tradeIn.rows[0]?.linked_inventory_id

    if (linkedInventoryId) {
      await client.query(
        `
          UPDATE inventory
          SET status = 'pending',
              type = 'own',
              supplier_id = NULL,
              supplier_name = NULL
          WHERE id = $1::uuid
            AND company_id = $2::uuid
            AND origin = 'trade_in'
        `,
        [linkedInventoryId, sale.company_id]
      )
      await client.query(
        "UPDATE trade_ins SET status = 'added_to_stock' WHERE id = $1::uuid AND company_id = $2::uuid",
        [sale.trade_in_id, sale.company_id]
      )
    }
  }
}

async function cancelReservation(client: PoolClient, sale: SaleRow, userId: string) {
  const transactionResult = await client.query<{ id: string }>(
    `
      UPDATE transactions
      SET status = 'cancelled',
          account_id = NULL,
          reconciled_at = NULL
      WHERE company_id = $2::uuid
        AND COALESCE(status, 'pending') <> 'cancelled'
        AND (
          (source_type = 'sale' AND source_id = $1::uuid)
          OR (
            source_type = 'sale_payment'
            AND source_id IN (
              SELECT id FROM sale_payments WHERE sale_id = $1::uuid AND company_id = $2::uuid
            )
          )
        )
      RETURNING id
    `,
    [sale.id, sale.company_id]
  )

  await client.query(
    "UPDATE sale_payments SET status = 'cancelled' WHERE sale_id = $1::uuid AND company_id = $2::uuid AND COALESCE(status, 'pending') <> 'cancelled'",
    [sale.id, sale.company_id]
  )

  await client.query(
    "UPDATE sales SET sale_status = 'cancelled' WHERE id = $1::uuid AND company_id = $2::uuid",
    [sale.id, sale.company_id]
  )

  if ((sale.source_type || "own") === "own") {
    await client.query(
      "UPDATE inventory SET status = 'in_stock' WHERE id = $1::uuid AND company_id = $2::uuid AND status IN ('reserved', 'sold')",
      [sale.inventory_id, sale.company_id]
    )
  }

  await client.query(
    `
      UPDATE inventory i
      SET status = 'in_stock'
      FROM sales_additional_items sai
      WHERE sai.product_id = i.id
        AND sai.sale_id = $1::uuid
        AND sai.company_id = $2::uuid
        AND i.company_id = $2::uuid
        AND i.status IN ('reserved', 'sold')
    `,
    [sale.id, sale.company_id]
  )

  if (sale.trade_in_id) {
    const tradeIn = await client.query<{ linked_inventory_id: string | null }>(
      "SELECT linked_inventory_id FROM trade_ins WHERE id = $1::uuid AND company_id = $2::uuid",
      [sale.trade_in_id, sale.company_id]
    )
    const linkedInventoryId = tradeIn.rows[0]?.linked_inventory_id
    if (linkedInventoryId) {
      await client.query(
        `
          UPDATE inventory
          SET status = 'trade_in_received',
              type = 'own',
              supplier_id = NULL,
              supplier_name = NULL
          WHERE id = $1::uuid
            AND company_id = $2::uuid
            AND origin = 'trade_in'
        `,
        [linkedInventoryId, sale.company_id]
      )
    }
  }

  await client.query(
    "UPDATE warranties SET status = 'voided' WHERE sale_id = $1::uuid AND company_id = $2::uuid AND status <> 'voided'",
    [sale.id, sale.company_id]
  )

  for (const transaction of transactionResult.rows) {
    await syncTransactionMovement(client, transaction.id, {
      createdBy: userId,
      expectedCompanyId: sale.company_id,
      cancelReason: "Reserva cancelada",
    })
  }
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { id } = await Promise.resolve(context.params)
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: { message: "saleId inválido" } }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")
  const { appUserId, companyId, role } = authResult.context

  if (action === "complete" && !canEditFinance(role)) {
    return NextResponse.json({ error: { message: "Apenas owner pode concluir reserva pelo financeiro." } }, { status: 403 })
  }

  if (action === "cancel" && !canAccess(role, "sales.cancel")) {
    return NextResponse.json({ error: { message: "Apenas owner pode cancelar vendas/reservas." } }, { status: 403 })
  }

  if (action !== "complete" && action !== "cancel") {
    return NextResponse.json({ error: { message: "Ação inválida." } }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const sale = await loadSaleForUpdate(client, id, companyId)
    if (!sale) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: { message: "Venda não encontrada." } }, { status: 404 })
    }
    if ((sale.sale_status || "completed") === "cancelled") {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: { message: "Venda já cancelada." } }, { status: 400 })
    }

    const oldStatus = sale.sale_status || "completed"
    if (action === "complete") {
      if (oldStatus === "completed") {
        await client.query("COMMIT")
        return NextResponse.json({ data: { id: sale.id, sale_status: "completed" }, error: null })
      }
      if (oldStatus !== "reserved") {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: { message: "Apenas reservas podem ser concluídas por esta ação." } }, { status: 400 })
      }
      await completeReservation(client, sale)
      await writeSaleAudit(client, {
        companyId,
        userId: appUserId,
        saleId: sale.id,
        oldStatus,
        newStatus: "completed",
        action,
      })
    } else {
      await cancelReservation(client, sale, appUserId)
      await writeSaleAudit(client, {
        companyId,
        userId: appUserId,
        saleId: sale.id,
        oldStatus,
        newStatus: "cancelled",
        action,
      })
    }

    await client.query("COMMIT")
    return NextResponse.json({ data: { id: sale.id, sale_status: action === "complete" ? "completed" : "cancelled" }, error: null })
  } catch (error) {
    await client.query("ROLLBACK")
    const message = error instanceof Error ? error.message : "Erro ao processar reserva"
    return NextResponse.json({ error: { message } }, { status: 500 })
  } finally {
    client.release()
  }
}
