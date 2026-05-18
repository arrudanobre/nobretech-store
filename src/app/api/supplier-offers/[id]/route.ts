import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { SUPPLIER_OFFER_STATUSES, SUPPLIER_OFFER_CONDITIONS, SUPPLIER_OFFER_WARRANTY_TYPES } from "@/lib/supplier-offers/types"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { companyId } = authResult.context
  const { id } = await context.params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ data: null, error: { message: "ID inválido." } }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: { message: "Payload inválido." } }, { status: 400 })
  }

  // Validate status
  if ("status" in body) {
    if (!SUPPLIER_OFFER_STATUSES.includes(body.status as never)) {
      return NextResponse.json(
        { data: null, error: { message: `Status inválido: ${body.status}` } },
        { status: 400 }
      )
    }
  }

  // Validate condition
  if ("condition" in body && body.condition !== null) {
    if (!SUPPLIER_OFFER_CONDITIONS.includes(body.condition as never)) {
      return NextResponse.json(
        { data: null, error: { message: `Condição inválida: ${body.condition}` } },
        { status: 400 }
      )
    }
  }

  // Validate warrantyType
  if ("warrantyType" in body && body.warrantyType !== null) {
    if (!SUPPLIER_OFFER_WARRANTY_TYPES.includes(body.warrantyType as never)) {
      return NextResponse.json(
        { data: null, error: { message: `Tipo de garantia inválido: ${body.warrantyType}` } },
        { status: 400 }
      )
    }
  }

  // Validate prices
  for (const priceField of ["supplierPrice", "suggestedSalePrice"] as const) {
    if (priceField in body && body[priceField] !== null) {
      const v = Number(body[priceField])
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { data: null, error: { message: "Preço não pode ser negativo ou inválido." } },
          { status: 400 }
        )
      }
    }
  }

  // Validate batteryHealth
  if ("batteryHealth" in body && body.batteryHealth !== null) {
    const v = Number(body.batteryHealth)
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return NextResponse.json(
        { data: null, error: { message: "Saúde da bateria deve ser entre 0 e 100." } },
        { status: 400 }
      )
    }
  }

  const allowedFields: Record<string, string> = {
    model: "model",
    category: "category",
    storage: "storage",
    size: "size",
    color: "color",
    variant: "variant",
    condition: "condition",
    batteryHealth: "battery_health",
    warrantyType: "warranty_type",
    warrantyLabel: "warranty_label",
    warrantyUntil: "warranty_until",
    supplierPrice: "supplier_price",
    suggestedSalePrice: "suggested_sale_price",
    estimatedMargin: "estimated_margin",
    status: "status",
    notes: "notes",
  }

  const setClauses: string[] = []
  const values: unknown[] = [id, companyId]
  let paramIdx = 3

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (jsKey in body) {
      setClauses.push(`${dbCol} = $${paramIdx}`)
      values.push(body[jsKey] ?? null)
      paramIdx++
    }
  }

  if (!setClauses.length) {
    return NextResponse.json(
      { data: null, error: { message: "Nenhum campo para atualizar." } },
      { status: 400 }
    )
  }

  try {
    const result = await pool.query(
      `UPDATE supplier_offers
       SET ${setClauses.join(", ")}
       WHERE id = $1::uuid AND company_id = $2::uuid
       RETURNING id, status, model, color, supplier_price, suggested_sale_price, updated_at`,
      values
    )

    if (!result.rows[0]) {
      return NextResponse.json(
        { data: null, error: { message: "Oferta não encontrada ou sem permissão." } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: result.rows[0], error: null })
  } catch (error) {
    console.error("[supplier-offers/[id]] PATCH error", error)
    return NextResponse.json(
      { data: null, error: { message: "Erro ao atualizar oferta." } },
      { status: 500 }
    )
  }
}
