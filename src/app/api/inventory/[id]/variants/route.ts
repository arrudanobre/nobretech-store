import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import {
  getInventoryVariants,
  saveInventoryVariants,
  shouldAllowInventoryVariants,
  type VariantInput,
} from "@/lib/inventory/inventory-variants"
import { pool } from "@/lib/db"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchItemBasics(companyId: string, inventoryId: string) {
  const result = await pool.query(
    `SELECT id, imei, serial_number, product_type, category_name_snapshot, notes, condition_notes
     FROM inventory WHERE company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [companyId, inventoryId]
  )
  return result.rows[0] ?? null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const params = await Promise.resolve(context.params)
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ data: null, error: { message: "ID inválido" } }, { status: 400 })
  }

  try {
    const item = await fetchItemBasics(authResult.context.companyId, params.id)
    if (!item) {
      return NextResponse.json({ data: null, error: { message: "Item não encontrado" } }, { status: 404 })
    }

    const allowsVariants = shouldAllowInventoryVariants(item)
    const variants = allowsVariants
      ? await getInventoryVariants(authResult.context.companyId, params.id)
      : []

    return NextResponse.json({ data: { variants, allowsVariants }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao carregar variações" } },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const params = await Promise.resolve(context.params)
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ data: null, error: { message: "ID inválido" } }, { status: 400 })
  }

  try {
    const item = await fetchItemBasics(authResult.context.companyId, params.id)
    if (!item) {
      return NextResponse.json({ data: null, error: { message: "Item não encontrado" } }, { status: 404 })
    }

    if (!shouldAllowInventoryVariants(item)) {
      return NextResponse.json(
        { data: null, error: { message: "Item com serial ou IMEI não suporta controle por variação" } },
        { status: 422 }
      )
    }

    const body = await request.json()
    if (!Array.isArray(body?.variants)) {
      return NextResponse.json(
        { data: null, error: { message: "Campo variants deve ser um array" } },
        { status: 400 }
      )
    }

    const variants = body.variants as VariantInput[]
    const result = await saveInventoryVariants(authResult.context.companyId, params.id, variants)
    return NextResponse.json({ data: { ok: true, totalQuantity: result.totalQuantity }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao salvar variações" } },
      { status: 500 }
    )
  }
}
