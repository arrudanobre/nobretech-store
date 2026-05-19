import { pool } from "@/lib/db"
import { badRequest, ok, requireResellerAdmin } from "@/lib/reseller/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string; offerId: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id, offerId } = await ctx.params

  const body = await request.json().catch(() => null)
  if (!body) return badRequest("Dados inválidos")

  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  let newResellerPrice: number | undefined
  let newSuggestedPrice: number | null | undefined

  if ("resellerPrice" in body) {
    const n = Number(body.resellerPrice)
    if (!Number.isFinite(n) || n < 0) return badRequest("Preço de repasse inválido")
    sets.push(`reseller_price = $${i++}`)
    params.push(n)
    newResellerPrice = n
  }
  if ("suggestedSalePrice" in body) {
    if (body.suggestedSalePrice === null || body.suggestedSalePrice === "") {
      sets.push(`suggested_sale_price = $${i++}`)
      params.push(null)
      newSuggestedPrice = null
    } else {
      const n = Number(body.suggestedSalePrice)
      if (!Number.isFinite(n) || n < 0) return badRequest("Preço sugerido inválido")
      sets.push(`suggested_sale_price = $${i++}`)
      params.push(n)
      newSuggestedPrice = n
    }
  }

  const current = await pool.query<{
    source_type: string
    reseller_price: string | number
    suggested_sale_price: string | number | null
    supplier_price: string | number | null
  }>(
    `SELECT COALESCE(o.source_type, 'inventory') AS source_type,
            o.reseller_price,
            o.suggested_sale_price,
            so.supplier_price
       FROM reseller_product_offers o
       LEFT JOIN supplier_offers so ON so.id = o.supplier_offer_id
      WHERE o.id = $1::uuid AND o.reseller_id = $2::uuid AND o.company_id = $3::uuid
      LIMIT 1`,
    [offerId, id, gate.companyId]
  )
  if (!current.rows[0]) return badRequest("Oferta não encontrada")

  const repasseToCheck = newResellerPrice ?? Number(current.rows[0].reseller_price)
  const suggestedToCheck =
    newSuggestedPrice !== undefined
      ? newSuggestedPrice
      : current.rows[0].suggested_sale_price == null
        ? null
        : Number(current.rows[0].suggested_sale_price)

  if (suggestedToCheck !== null && suggestedToCheck < repasseToCheck) {
    return badRequest("O preço sugerido deve ser maior ou igual ao preço de repasse")
  }

  const supplierPrice = current.rows[0].supplier_price == null ? null : Number(current.rows[0].supplier_price)
  if (
    current.rows[0].source_type === "supplier" &&
    supplierPrice != null &&
    Number.isFinite(supplierPrice) &&
    repasseToCheck < supplierPrice
  ) {
    return badRequest("O repasse não pode ser menor que o preço de fornecedor")
  }
  if ("visibleNotes" in body) {
    sets.push(`visible_notes = $${i++}`)
    params.push(body.visibleNotes ? String(body.visibleNotes).trim() : null)
  }
  if ("internalNotes" in body) {
    sets.push(`internal_notes = $${i++}`)
    params.push(body.internalNotes ? String(body.internalNotes).trim() : null)
  }
  if ("availableUntil" in body) {
    sets.push(`available_until = $${i++}`)
    params.push(body.availableUntil ? String(body.availableUntil) : null)
  }
  if ("isActive" in body) {
    sets.push(`is_active = $${i++}`)
    params.push(Boolean(body.isActive))
  }

  if (!sets.length) return badRequest("Nenhuma alteração informada")

  params.push(offerId, id, gate.companyId)
  const updated = await pool.query(
    `UPDATE reseller_product_offers
        SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${i++}::uuid AND reseller_id = $${i++}::uuid AND company_id = $${i++}::uuid
      RETURNING id`,
    params
  )
  if (!updated.rows[0]) return badRequest("Oferta não encontrada")
  return ok({ id: updated.rows[0].id })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id, offerId } = await ctx.params

  const deleted = await pool.query(
    `DELETE FROM reseller_product_offers
      WHERE id = $1::uuid AND reseller_id = $2::uuid AND company_id = $3::uuid
      RETURNING id`,
    [offerId, id, gate.companyId]
  )
  if (!deleted.rows[0]) return badRequest("Oferta não encontrada")
  return ok({ id: deleted.rows[0].id })
}
