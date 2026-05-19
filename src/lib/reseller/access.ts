import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getCurrentAuthContext, type AuthorizedAuthContext } from "@/lib/auth-context"
import { isResellerRole } from "@/lib/permissions"

export type ResellerRecord = {
  id: string
  company_id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  email: string
  status: string
}

export async function getActiveResellerForUser(
  appUserId: string,
  companyId: string
): Promise<ResellerRecord | null> {
  const result = await pool.query<ResellerRecord>(
    `SELECT id, company_id, name, city, state, phone, email, status
       FROM resellers
      WHERE user_id = $1::uuid
        AND company_id = $2::uuid
        AND status = 'active'
      LIMIT 1`,
    [appUserId, companyId]
  )
  return result.rows[0] || null
}

// Page guard: only an authenticated user with role 'reseller' linked to an
// ACTIVE reseller record may proceed. Anyone else is sent away from the portal.
export async function requireResellerContext(): Promise<{
  context: AuthorizedAuthContext
  reseller: ResellerRecord
}> {
  const context = await getCurrentAuthContext()

  if (context.status === "unauthenticated") redirect("/login")
  if (context.status === "unauthorized") redirect("/unauthorized")
  if (!isResellerRole(context.role)) redirect("/unauthorized")

  const reseller = await getActiveResellerForUser(context.appUserId, context.companyId)
  if (!reseller) redirect("/unauthorized")

  return { context, reseller }
}

// API guard equivalent. Returns a NextResponse on failure.
export async function requireResellerApiContext(): Promise<
  | { ok: true; context: AuthorizedAuthContext; reseller: ResellerRecord }
  | { ok: false; response: NextResponse }
> {
  const context = await getCurrentAuthContext()

  if (context.status === "unauthenticated") {
    return {
      ok: false,
      response: NextResponse.json({ data: null, error: { message: "Unauthorized" } }, { status: 401 }),
    }
  }
  if (context.status === "unauthorized" || !isResellerRole(context.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { message: "Seu acesso ao portal de revendedor não está autorizado." } },
        { status: 403 }
      ),
    }
  }

  const reseller = await getActiveResellerForUser(context.appUserId, context.companyId)
  if (!reseller) {
    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { message: "Conta de revendedor não vinculada ou inativa." } },
        { status: 403 }
      ),
    }
  }

  return { ok: true, context, reseller }
}
