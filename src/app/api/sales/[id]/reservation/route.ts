import { NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { canAccess, canEditFinance, requireApiAuthContext, type AuthorizedAuthContext } from "@/lib/auth-context"
import { syncTransactionMovement } from "@/lib/finance/sync-transaction-movement"
import { restoreInventoryVariantQuantity } from "@/lib/inventory/inventory-variants"
import { parseQtyFromNotes } from "@/lib/sale-totals"
import { materializeSaleItemsWithClient } from "@/lib/sales/sale-items"
import { applySaleWarranties, assertSaleAccessoriesClassified } from "@/lib/warranty"

type RouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_ATOMIC_SALE_TEST_TOKEN = "TESTE_ATOMIC_SALE_LOCAL"

class SaleReservationError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = "SaleReservationError"
    this.statusCode = statusCode
  }
}

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
  notes: string | null
}

type SaleVariantAllocation = {
  scope: "main" | "additional"
  inventoryId: string
  variantId: string
  variantName: string | null
  variantColorHex: string | null
  quantity: number
}

type SaleStockRestoration = {
  scope: "additional"
  inventoryId: string
  quantity: number
}

function isLocalAtomicSaleTestRequest(request: Request) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DATABASE_URL_TEST &&
    process.env.DATABASE_URL === process.env.DATABASE_URL_TEST &&
    request.headers.get("x-debug-atomic-sale-test") === LOCAL_ATOMIC_SALE_TEST_TOKEN
  )
}

async function resolveReservationAuthContext(request: Request): ReturnType<typeof requireApiAuthContext> {
  if (!isLocalAtomicSaleTestRequest(request)) return requireApiAuthContext()

  const companyId = request.headers.get("x-debug-company-id")
  const appUserId = request.headers.get("x-debug-user-id")
  const email = request.headers.get("x-debug-user-email") || "atomic-sale-local@nobretech.test"

  if (!companyId || !appUserId || !UUID_RE.test(companyId) || !UUID_RE.test(appUserId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { message: "Headers locais de teste inválidos." } },
        { status: 400 }
      ),
    }
  }

  const context: AuthorizedAuthContext = {
    status: "authorized",
    clerkUserId: `local:${appUserId}`,
    appUserId,
    email,
    fullName: "Teste Atomic Sale Local",
    role: "owner",
    avatarUrl: null,
    companyId,
    companyName: "NOBRETECH TESTE LOCAL",
    companySlug: "nobretech-teste-local",
  }

  return { ok: true, context }
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
             warranty_start, warranty_end, sale_date, sale_status, trade_in_id, notes
      FROM sales
      WHERE id = $1::uuid
        AND company_id = $2::uuid
      FOR UPDATE
    `,
    [saleId, companyId]
  )
  return result.rows[0] || null
}

function normalizeVariantAllocations(value: unknown): SaleVariantAllocation[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): SaleVariantAllocation | null => {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const scope = row.scope === "additional" ? "additional" : row.scope === "main" ? "main" : null
      const inventoryId = typeof row.inventoryId === "string" ? row.inventoryId : ""
      const variantId = typeof row.variantId === "string" ? row.variantId : ""
      const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1))
      if (!scope || !UUID_RE.test(inventoryId) || !UUID_RE.test(variantId)) return null
      return {
        scope,
        inventoryId,
        variantId,
        variantName: typeof row.variantName === "string" ? row.variantName : null,
        variantColorHex: typeof row.variantColorHex === "string" ? row.variantColorHex : null,
        quantity,
      }
    })
    .filter((item): item is SaleVariantAllocation => Boolean(item))
}

function normalizeStockRestorations(value: unknown): SaleStockRestoration[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): SaleStockRestoration | null => {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const inventoryId = typeof row.inventoryId === "string" ? row.inventoryId : ""
      const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1))
      if (row.scope !== "additional" || !UUID_RE.test(inventoryId)) return null
      return {
        scope: "additional",
        inventoryId,
        quantity,
      }
    })
    .filter((item): item is SaleStockRestoration => Boolean(item))
}

async function loadSaleStockHistory(client: PoolClient, sale: SaleRow) {
  const result = await client.query<{ new_data: Record<string, unknown> | null }>(
    `
      SELECT new_data
      FROM audit_logs
      WHERE company_id = $1::uuid
        AND table_name = 'sales'
        AND record_id = $2::uuid
        AND action = 'created'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [sale.company_id, sale.id]
  )
  const data = result.rows[0]?.new_data
  return {
    variantAllocations: normalizeVariantAllocations(data?.variantSelections),
    stockRestorations: normalizeStockRestorations(data?.stockRestorations),
  }
}

async function getSaleInventoryIdsWithVariants(client: PoolClient, sale: SaleRow) {
  const result = await client.query<{ inventory_id: string }>(
    `
      WITH sale_inventory AS (
        SELECT $1::uuid AS inventory_id
        UNION
        SELECT product_id::uuid
        FROM sales_additional_items
        WHERE sale_id = $2::uuid
          AND company_id = $3::uuid
          AND product_id IS NOT NULL
      )
      SELECT DISTINCT v.inventory_id
      FROM inventory_item_variants v
      JOIN sale_inventory si ON si.inventory_id = v.inventory_id
      WHERE v.company_id = $3::uuid
    `,
    [sale.inventory_id, sale.id, sale.company_id]
  )
  return new Set(result.rows.map((row) => row.inventory_id))
}

async function restoreInventoryQuantity(
  client: PoolClient,
  input: { companyId: string; inventoryId: string; quantity: number }
) {
  await client.query(
    `
      UPDATE inventory
      SET quantity = COALESCE(quantity, 0) + $3,
          status = 'in_stock',
          logistics_status = 'in_stock',
          commercial_status = 'available',
          updated_at = NOW()
      WHERE id = $1::uuid
        AND company_id = $2::uuid
    `,
    [input.inventoryId, input.companyId, Math.max(1, Math.floor(Number(input.quantity) || 1))]
  )
}

async function completeReservation(
  client: PoolClient,
  sale: SaleRow,
  actor: { userId: string; email: string }
) {
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

  if (!sale.sale_date) {
    throw new SaleReservationError(
      "Reserva sem sale_date não pode iniciar garantia automaticamente. Defina a data efetiva antes de concluir.",
      409
    )
  }

  await materializeSaleItemsWithClient(client, sale.company_id, sale.id)
  await assertSaleAccessoriesClassified(client, sale.company_id, sale.id)
  await applySaleWarranties(
    client,
    {
      companyId: sale.company_id,
      saleId: sale.id,
      startsAt: sale.sale_date,
    },
    { userId: actor.userId, email: actor.email }
  )

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
  const { variantAllocations, stockRestorations } = await loadSaleStockHistory(client, sale)
  const inventoryIdsWithVariants = await getSaleInventoryIdsWithVariants(client, sale)
  const allocatedVariantInventoryIds = new Set(variantAllocations.map((item) => item.inventoryId))
  const missingVariantHistory = [...inventoryIdsWithVariants].filter((inventoryId) => {
    return !allocatedVariantInventoryIds.has(inventoryId)
  })

  if (missingVariantHistory.length > 0) {
    console.warn("[sales-reservation] missing variant cancellation history", {
      saleId: sale.id,
      companyId: sale.company_id,
      inventoryIds: missingVariantHistory,
    })
    throw new SaleReservationError(
      "Esta venda foi criada sem o vínculo histórico da variação. Não é seguro cancelar automaticamente porque a cor correta não pode ser devolvida ao estoque.",
      409
    )
  }

  const additionalItems = await client.query<{ product_id: string | null }>(
    `SELECT product_id
     FROM sales_additional_items
     WHERE sale_id = $1::uuid
       AND company_id = $2::uuid
       AND product_id IS NOT NULL`,
    [sale.id, sale.company_id]
  )
  const restoredAdditionalInventoryIds = new Set(stockRestorations.map((item) => item.inventoryId))
  const legacyAdditionalItemsWithoutQuantity = additionalItems.rows.filter((item) => {
    if (!item.product_id) return false
    if (allocatedVariantInventoryIds.has(item.product_id)) return false
    return !restoredAdditionalInventoryIds.has(item.product_id)
  })

  if (legacyAdditionalItemsWithoutQuantity.length > 0) {
    console.warn("[sales-reservation] missing additional item quantity history", {
      saleId: sale.id,
      companyId: sale.company_id,
      inventoryIds: legacyAdditionalItemsWithoutQuantity.map((item) => item.product_id),
    })
    throw new SaleReservationError(
      "Esta venda possui item adicional sem histórico confiável de quantidade. Não é seguro cancelar automaticamente porque o estoque poderia voltar incompleto ou duplicado.",
      409
    )
  }

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

  if (!allocatedVariantInventoryIds.has(sale.inventory_id)) {
    await restoreInventoryQuantity(client, {
      companyId: sale.company_id,
      inventoryId: sale.inventory_id,
      quantity: parseQtyFromNotes(sale.notes),
    })
  }

  for (const allocation of variantAllocations) {
    await restoreInventoryVariantQuantity({
      client,
      companyId: sale.company_id,
      inventoryId: allocation.inventoryId,
      variantId: allocation.variantId,
      quantity: allocation.quantity,
    })
  }

  for (const item of stockRestorations) {
    await restoreInventoryQuantity(client, {
      companyId: sale.company_id,
      inventoryId: item.inventoryId,
      quantity: item.quantity,
    })
  }

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
  const authResult = await resolveReservationAuthContext(request)
  if (!authResult.ok) return authResult.response

  const { id } = await Promise.resolve(context.params)
  if (!UUID_RE.test(id)) {
    console.warn("[sales-reservation] invalid sale id", { saleId: id })
    return NextResponse.json(
      { error: { message: "Identificador da venda inválido. Reabra a venda e tente cancelar novamente." } },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")
  const { appUserId, companyId, role, email } = authResult.context

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
      await completeReservation(client, sale, { userId: appUserId, email })
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
    const status = error instanceof SaleReservationError ? error.statusCode : 500
    if (!(error instanceof SaleReservationError)) {
      console.error("[sales-reservation] failed to process sale reservation action", { saleId: id, action, error })
    }
    return NextResponse.json({ error: { message } }, { status })
  } finally {
    client.release()
  }
}
