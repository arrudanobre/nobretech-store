import { NextResponse } from "next/server"

import { requireApiAuthContext } from "@/lib/auth-context"
import { pool } from "@/lib/db"

type AccessoryClassificationRow = {
  normalized_name: string | null
  accessory_class: string | null
}

let deletedAtColumnPromise: Promise<boolean> | null = null

function hasDeletedAtColumn() {
  if (!deletedAtColumnPromise) {
    deletedAtColumnPromise = pool
      .query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'product_subcategories'
              AND column_name = 'deleted_at'
          ) AS exists
        `
      )
      .then((result) => Boolean(result.rows[0]?.exists))
      .catch(() => false)
  }

  return deletedAtColumnPromise
}

function normalizeAccessoryClass(value: string | null) {
  return value === "durable" || value === "non_durable" ? value : null
}

export async function GET() {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  const hasDeletedAt = await hasDeletedAtColumn()
  const deletedAtPredicate = hasDeletedAt ? "AND deleted_at IS NULL" : ""

  const result = await pool.query<AccessoryClassificationRow>(
    `
      SELECT normalized_name, accessory_class
      FROM product_subcategories
      WHERE company_id = $1
        AND is_active = TRUE
        ${deletedAtPredicate}
      ORDER BY sort_order ASC, name ASC
    `,
    [auth.context.companyId]
  )

  return NextResponse.json({
    data: result.rows.map((row) => ({
      normalizedName: row.normalized_name,
      accessoryClass: normalizeAccessoryClass(row.accessory_class),
    })),
    error: null,
  })
}
