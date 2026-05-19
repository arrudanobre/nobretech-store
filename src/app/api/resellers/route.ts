import { pool } from "@/lib/db"
import { badRequest, ok, requireResellerAdmin } from "@/lib/reseller/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response

  const result = await pool.query(
    `SELECT r.id, r.name, r.city, r.state, r.phone, r.email, r.status,
            r.created_at, r.updated_at,
            COUNT(o.id) FILTER (WHERE o.is_active) AS active_offers,
            COUNT(req.id) FILTER (WHERE req.status = 'pending') AS pending_requests
       FROM resellers r
       LEFT JOIN reseller_product_offers o ON o.reseller_id = r.id
       LEFT JOIN reseller_requests req ON req.reseller_id = r.id
      WHERE r.company_id = $1::uuid
      GROUP BY r.id
      ORDER BY r.created_at DESC`,
    [gate.companyId]
  )
  return ok(result.rows)
}

export async function POST(request: Request) {
  const gate = await requireResellerAdmin()
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  const name = String(body?.name || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const city = body?.city ? String(body.city).trim() : null
  const state = body?.state ? String(body.state).trim() : null
  const phone = body?.phone ? String(body.phone).trim() : null

  if (!name) return badRequest("Informe o nome do revendedor")
  if (!email || !email.includes("@")) return badRequest("Informe um email válido para o revendedor")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Provision (or reuse) the reseller login user. Email is globally unique
    // in users — an email already used by an internal user cannot be reused.
    const existingUser = await client.query<{ id: string; role: string; company_id: string }>(
      `SELECT id, role, company_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    )

    let userId: string
    if (existingUser.rows[0]) {
      const u = existingUser.rows[0]
      if (u.role !== "reseller" || u.company_id !== gate.companyId) {
        await client.query("ROLLBACK")
        return badRequest("Este email já está em uso por um usuário do sistema")
      }
      userId = u.id
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (company_id, email, full_name, role, status)
         VALUES ($1::uuid, $2, $3, 'reseller', 'active')
         RETURNING id`,
        [gate.companyId, email, name]
      )
      userId = created.rows[0].id
    }

    const dup = await client.query(
      `SELECT 1 FROM resellers WHERE company_id = $1::uuid AND lower(email) = lower($2) LIMIT 1`,
      [gate.companyId, email]
    )
    if (dup.rowCount) {
      await client.query("ROLLBACK")
      return badRequest("Já existe um revendedor com este email")
    }

    const inserted = await client.query(
      `INSERT INTO resellers (company_id, user_id, name, city, state, phone, email, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'active')
       RETURNING id, name, city, state, phone, email, status, created_at, updated_at`,
      [gate.companyId, userId, name, city, state, phone, email]
    )

    await client.query("COMMIT")
    return ok(inserted.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    return badRequest(error instanceof Error ? error.message : "Erro ao criar revendedor")
  } finally {
    client.release()
  }
}
