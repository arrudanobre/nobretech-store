import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { canManageResellers } from "@/lib/permissions"

// Shared gate for every internal reseller-management endpoint.
// owner + manager only; resellers themselves are rejected.
export async function requireResellerAdmin(): Promise<
  | { ok: true; companyId: string; appUserId: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return { ok: false, response: auth.response }

  const { companyId, role, appUserId } = auth.context
  if (!canManageResellers(role)) {
    return {
      ok: false,
      response: NextResponse.json({ data: null, error: { message: "Forbidden" } }, { status: 403 }),
    }
  }
  return { ok: true, companyId, appUserId }
}

export function badRequest(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 400 })
}

export function ok(data: unknown) {
  return NextResponse.json({ data, error: null })
}
