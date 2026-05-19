import { pool } from "@/lib/db"
import { badRequest, ok, requireResellerAdmin } from "@/lib/reseller/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const result = await pool.query(
    `SELECT id, name, city, state, phone, email, status, created_at, updated_at
       FROM resellers
      WHERE id = $1::uuid AND company_id = $2::uuid
      LIMIT 1`,
    [id, gate.companyId]
  )
  if (!result.rows[0]) return badRequest("Revendedor não encontrado")
  return ok(result.rows[0])
}

export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  if (!body) return badRequest("Dados inválidos")

  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  if (typeof body.name === "string") {
    if (!body.name.trim()) return badRequest("Nome não pode ficar vazio")
    sets.push(`name = $${i++}`)
    params.push(body.name.trim())
  }
  for (const field of ["city", "state", "phone"] as const) {
    if (field in body) {
      sets.push(`${field} = $${i++}`)
      params.push(body[field] ? String(body[field]).trim() : null)
    }
  }
  let nextStatus: string | null = null
  if (body.status === "active" || body.status === "inactive") {
    nextStatus = body.status
    sets.push(`status = $${i++}`)
    params.push(nextStatus)
  }

  if (!sets.length) return badRequest("Nenhuma alteração informada")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    params.push(id, gate.companyId)
    const updated = await client.query(
      `UPDATE resellers SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${i++}::uuid AND company_id = $${i++}::uuid
        RETURNING id, name, city, state, phone, email, status, user_id, created_at, updated_at`,
      params
    )
    const row = updated.rows[0]
    if (!row) {
      await client.query("ROLLBACK")
      return badRequest("Revendedor não encontrado")
    }

    // Block / restore the reseller login in lockstep with the reseller status.
    if (nextStatus && row.user_id) {
      await client.query(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2::uuid`, [
        nextStatus,
        row.user_id,
      ])
    }

    await client.query("COMMIT")
    delete row.user_id
    return ok(row)
  } catch (error) {
    await client.query("ROLLBACK")
    return badRequest(error instanceof Error ? error.message : "Erro ao atualizar revendedor")
  } finally {
    client.release()
  }
}
