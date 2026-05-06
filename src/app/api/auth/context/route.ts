import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"

export async function GET() {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const { context } = authResult

  return NextResponse.json({
    data: {
      user: {
        id: context.appUserId,
        clerkUserId: context.clerkUserId,
        email: context.email,
        full_name: context.fullName,
        role: context.role,
        avatar_url: context.avatarUrl,
        company_id: context.companyId,
        company_name: context.companyName,
      },
    },
    error: null,
  })
}
