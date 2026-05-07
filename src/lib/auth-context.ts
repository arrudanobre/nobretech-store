import { auth, currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import {
  canAccess,
  canDeleteSensitiveRecords,
  canEditFinance,
  canManageUsers,
  normalizeRole,
  type PermissionKey,
  type UserRole,
} from "@/lib/permissions"

export type AuthorizedAuthContext = {
  status: "authorized"
  clerkUserId: string
  appUserId: string
  email: string
  fullName: string | null
  role: UserRole
  avatarUrl: string | null
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
  user_status: string
  avatar_url: string | null
  company_id: string
  company_name: string
  company_slug: string
}

let usersStatusColumnPromise: Promise<boolean> | null = null

function hasUsersStatusColumn() {
  if (!usersStatusColumnPromise) {
    usersStatusColumnPromise = pool
      .query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'users'
              AND column_name = 'status'
          ) AS exists
        `
      )
      .then((result) => Boolean(result.rows[0]?.exists))
      .catch(() => false)
  }

  return usersStatusColumnPromise
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

function getProviderFullName(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return null

  const fullName = user.fullName?.trim()
  if (fullName) return fullName

  const joinedName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
  if (joinedName) return joinedName

  return user.username?.trim() || null
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

  const hasStatus = await hasUsersStatusColumn()
  const statusSelect = hasStatus ? "u.status AS user_status" : "'active' AS user_status"

  const result = await pool.query<UserRow>(
    `
      SELECT
        u.id AS app_user_id,
        u.email,
        u.full_name,
        u.role,
        ${statusSelect},
        u.avatar_url,
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

  if (row.user_status === "inactive") {
    return { status: "unauthorized", clerkUserId: userId, email }
  }

  return {
    status: "authorized",
    clerkUserId: userId,
    appUserId: row.app_user_id,
    email: row.email,
    fullName: getProviderFullName(clerkUser),
    role: normalizeRole(row.role),
    avatarUrl: clerkUser?.imageUrl || row.avatar_url || null,
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

export { canAccess, canDeleteSensitiveRecords, canEditFinance, canManageUsers }

export async function requireRole(roles: UserRole | UserRole[]) {
  const context = await requireAuthContext()
  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  if (!allowedRoles.includes(context.role)) {
    redirect("/unauthorized")
  }

  return context
}

export async function requirePermission(permission: PermissionKey) {
  const context = await requireAuthContext()

  if (!canAccess(context.role, permission)) {
    redirect("/unauthorized")
  }

  return context
}
