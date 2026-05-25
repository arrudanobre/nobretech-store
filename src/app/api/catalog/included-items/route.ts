import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Body = {
  inventoryItemId?: string
  items?: Array<{ label?: string; is_included?: boolean }>
}

export async function PUT(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  const { companyId } = authResult.context

  const body = (await request.json().catch(() => ({}))) as Body
  const inventoryItemId = String(body.inventoryItemId || "")
  if (!UUID_RE.test(inventoryItemId)) {
    return NextResponse.json(
      { data: null, error: { message: "Item de estoque inválido" } },
      { status: 400 },
    )
  }
  const inputItems = Array.isArray(body.items) ? body.items : []

  const cleaned = inputItems
    .map((item) => ({
      label: String(item?.label || "").trim().slice(0, 80),
      is_included: item?.is_included !== false,
    }))
    .filter((item) => item.label.length > 0)
    .slice(0, 30)

  const inventoryResult = await pool.query<{ id: string }>(
    "SELECT id FROM inventory WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [inventoryItemId, companyId],
  )
  if (!inventoryResult.rows[0]) {
    return NextResponse.json(
      { data: null, error: { message: "Item de estoque não encontrado" } },
      { status: 404 },
    )
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      "DELETE FROM catalog_included_items WHERE company_id = $1::uuid AND inventory_item_id = $2::uuid",
      [companyId, inventoryItemId],
    )
    for (let index = 0; index < cleaned.length; index += 1) {
      const item = cleaned[index]
      await client.query(
        `INSERT INTO catalog_included_items (company_id, inventory_item_id, label, is_included, sort_order)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
        [companyId, inventoryItemId, item.label, item.is_included, index],
      )
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao salvar itens" } },
      { status: 500 },
    )
  } finally {
    client.release()
  }

  return NextResponse.json({ data: { ok: true, count: cleaned.length }, error: null })
}
