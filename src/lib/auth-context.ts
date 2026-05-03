import { auth, currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export type AuthorizedAuthContext = {
  status: "authorized"
  clerkUserId: string
  appUserId: string
  email: string
  fullName: string | null
  role: string
  companyId: string
  companyName: string
  companySlug: string
}

export type UnauthenticatedAuthContext = {
  status: "unauthenticated"
}

export type UnauthorizedAuthContext = {
  status: "unauthorized"
  clerkUserId: string
  email: string | null
}

export type AuthContext =
  | AuthorizedAuthContext
  | UnauthenticatedAuthContext
  | UnauthorizedAuthContext

type UserRow = {
  app_user_id: string
  email: string
  full_name: string | null
  role: string
  company_id: string
  company_name: string
  company_slug: string
}

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return null

  return (
    user.primaryEmailAddress?.emailAddress ||
    user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
      ?.emailAddress ||
    user.emailAddresses[0]?.emailAddress ||
    null
  )
}

export async function getCurrentAuthContext(): Promise<AuthContext> {
  const { userId } = await auth()

  if (!userId) {
    return { status: "unauthenticated" }
  }

  const clerkUser = await currentUser()
  const email = getPrimaryEmail(clerkUser)

  if (!email) {
    return { status: "unauthorized", clerkUserId: userId, email: null }
  }

  const result = await pool.query<UserRow>(
    `
      SELECT
        u.id AS app_user_id,
        u.email,
        u.full_name,
        u.role,
        u.company_id,
        c.name AS company_name,
        c.slug AS company_slug
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE lower(u.email) = lower($1)
      LIMIT 1
    `,
    [email]
  )

  const row = result.rows[0]

  if (!row) {
    return { status: "unauthorized", clerkUserId: userId, email }
  }

  return {
    status: "authorized",
    clerkUserId: userId,
    appUserId: row.app_user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    companySlug: row.company_slug,
  }
}

export async function requireAuthContext() {
  const context = await getCurrentAuthContext()

  if (context.status === "unauthenticated") {
    redirect("/login")
  }

  if (context.status === "unauthorized") {
    redirect("/unauthorized")
  }

  return context
}

export async function requireApiAuthContext(): Promise<
  | { ok: true; context: AuthorizedAuthContext }
  | { ok: false; response: NextResponse }
> {
  const context = await getCurrentAuthContext()

  if (context.status === "unauthenticated") {
    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { message: "Unauthorized" } },
        { status: 401 }
      ),
    }
  }

  if (context.status === "unauthorized") {
    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { message: "Forbidden" } },
        { status: 403 }
      ),
    }
  }

  return { ok: true, context }
}
