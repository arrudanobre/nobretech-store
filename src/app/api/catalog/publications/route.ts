import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { loadAdminCatalog } from "@/lib/catalog/admin-queries"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Body = {
  inventoryItemId?: string
  publicTitle?: string | null
  publicDescription?: string | null
  publicPrice?: number | string | null
  promoPrice?: number | string | null
  installmentCount?: number | string | null
  showInstallments?: boolean
  highlight?: boolean
  notesInternal?: string | null
  action?: "publish" | "unpublish" | "save"
}

type MoneyParseResult =
  | { status: "missing" }
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "valid"; value: number }

function parseMoney(value: unknown): MoneyParseResult {
  if (value === undefined) return { status: "missing" }
  if (value === null || value === "") return { status: "empty" }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { status: "invalid" }
    return { status: "valid", value: Math.round(value * 100) / 100 }
  }

  const raw = String(value).trim()
  if (!raw) return { status: "empty" }
  const normalized = raw.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")
  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n)) return { status: "invalid" }
  return { status: "valid", value: Math.round(n * 100) / 100 }
}

function parseInstallmentCount(value: unknown): number | undefined | "invalid" | "too_high" {
  if (value === undefined || value === null || value === "") return undefined
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(n) || n < 1) return "invalid"
  if (n > 18) return "too_high"
  return n
}

export async function GET() {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  const { companyId } = authResult.context
  const data = await loadAdminCatalog(companyId)
  return NextResponse.json({ data, error: null })
}

export async function POST(request: NextRequest) {
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

  const inventoryResult = await pool.query<{ id: string; status: string }>(
    "SELECT id, status FROM inventory WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [inventoryItemId, companyId],
  )
  if (!inventoryResult.rows[0]) {
    return NextResponse.json(
      { data: null, error: { message: "Item de estoque não encontrado" } },
      { status: 404 },
    )
  }

  const publicTitle = body.publicTitle === undefined ? undefined : body.publicTitle?.trim() || null
  const publicDescription =
    body.publicDescription === undefined ? undefined : body.publicDescription?.trim() || null
  const parsedPublicPrice = parseMoney(body.publicPrice)
  if (
    parsedPublicPrice.status === "invalid" ||
    parsedPublicPrice.status === "empty" ||
    (parsedPublicPrice.status === "valid" && parsedPublicPrice.value <= 0)
  ) {
    return NextResponse.json(
      { data: null, error: { message: "Preço público inválido." } },
      { status: 400 },
    )
  }
  const publicPrice =
    parsedPublicPrice.status === "missing" ? undefined : parsedPublicPrice.value

  const parsedPromoPrice = parseMoney(body.promoPrice)
  if (
    parsedPromoPrice.status === "invalid" ||
    (parsedPromoPrice.status === "valid" && parsedPromoPrice.value <= 0)
  ) {
    return NextResponse.json(
      { data: null, error: { message: "Preço promocional inválido." } },
      { status: 400 },
    )
  }
  const promoPrice =
    parsedPromoPrice.status === "missing"
      ? undefined
      : parsedPromoPrice.status === "empty"
        ? null
        : parsedPromoPrice.value
  if (
    publicPrice !== undefined &&
    publicPrice !== null &&
    promoPrice !== undefined &&
    promoPrice !== null &&
    promoPrice >= publicPrice
  ) {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Preço promocional precisa ser menor que o preço público." },
      },
      { status: 400 },
    )
  }

  const installmentCount = parseInstallmentCount(body.installmentCount)
  if (installmentCount === "too_high") {
    return NextResponse.json(
      { data: null, error: { message: "Parcelamento máximo permitido é 18x." } },
      { status: 400 },
    )
  }
  if (installmentCount === "invalid") {
    return NextResponse.json(
      { data: null, error: { message: "Parcelas exibidas precisam ficar entre 1 e 18." } },
      { status: 400 },
    )
  }
  const showInstallments = body.showInstallments
  const highlight = body.highlight
  const notesInternal =
    body.notesInternal === undefined ? undefined : body.notesInternal?.trim() || null

  const updates: string[] = []
  const values: unknown[] = [companyId, inventoryItemId]
  let idx = 3
  function add(column: string, value: unknown) {
    if (value === undefined) return
    updates.push(`${column} = $${idx}`)
    values.push(value)
    idx += 1
  }
  add("public_title", publicTitle)
  add("public_description", publicDescription)
  add("public_price", publicPrice)
  add("promo_price", promoPrice)
  add("installment_count", installmentCount)
  add("show_installments", showInstallments)
  add("highlight", highlight)
  add("notes_internal", notesInternal)

  const action = body.action || "save"
  if (action === "publish") {
    updates.push("is_published = TRUE", "public_status = 'published'", "published_at = NOW()")
  } else if (action === "unpublish") {
    updates.push("is_published = FALSE", "public_status = 'draft'")
  }

  const insertColumns = ["company_id", "inventory_item_id"]
  const insertPlaceholders = ["$1::uuid", "$2::uuid"]
  if (publicTitle !== undefined) {
    insertColumns.push("public_title")
    insertPlaceholders.push(`$${insertColumns.length + 0}`)
  }
  // Use ON CONFLICT pattern but simpler: try insert, on conflict do update.
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM catalog_publications WHERE inventory_item_id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [inventoryItemId, companyId],
  )

  if (!existing.rows[0]) {
    await pool.query(
      `INSERT INTO catalog_publications (company_id, inventory_item_id, public_status, is_published)
       VALUES ($1::uuid, $2::uuid, $3, $4)`,
      [companyId, inventoryItemId, action === "publish" ? "published" : "draft", action === "publish"],
    )
  }

  if (updates.length > 0) {
    const sql = `UPDATE catalog_publications
                 SET ${updates.join(", ")}, updated_at = NOW()
                 WHERE company_id = $1::uuid AND inventory_item_id = $2::uuid`
    await pool.query(sql, values)
  }

  if (action === "publish") {
    await pool.query(
      "UPDATE inventory SET is_published = TRUE, published_at = NOW() WHERE id = $1::uuid AND company_id = $2::uuid",
      [inventoryItemId, companyId],
    )
  } else if (action === "unpublish") {
    await pool.query(
      "UPDATE inventory SET is_published = FALSE WHERE id = $1::uuid AND company_id = $2::uuid",
      [inventoryItemId, companyId],
    )
  }

  return NextResponse.json({ data: { ok: true }, error: null })
}
