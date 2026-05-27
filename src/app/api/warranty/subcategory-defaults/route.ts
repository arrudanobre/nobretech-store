import { NextResponse } from "next/server"

import { requireApiAuthContext } from "@/lib/auth-context"
import { pool } from "@/lib/db"

type SubcategoryWarrantyDefaultRow = {
  normalized_name: string | null
  default_warranty_policy_id: string | null
  warranty_nature: string | null
  calculation_mode: string | null
  default_months: number | null
  default_days: number | null
}

let deletedAtColumnPromise: Promise<boolean> | null = null
let defaultWarrantyColumnPromise: Promise<boolean> | null = null

function hasColumn(columnName: string, cache: Promise<boolean> | null) {
  if (!cache) {
    cache = pool
      .query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'product_subcategories'
              AND column_name = $1
          ) AS exists
        `,
        [columnName]
      )
      .then((result) => Boolean(result.rows[0]?.exists))
      .catch(() => false)
  }
  return cache
}

export async function GET() {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  deletedAtColumnPromise = hasColumn("deleted_at", deletedAtColumnPromise)
  defaultWarrantyColumnPromise = hasColumn("default_warranty_policy_id", defaultWarrantyColumnPromise)

  const [hasDeletedAt, hasDefaultWarranty] = await Promise.all([
    deletedAtColumnPromise,
    defaultWarrantyColumnPromise,
  ])
  const deletedAtPredicate = hasDeletedAt ? "AND sub.deleted_at IS NULL" : ""
  const policySelect = hasDefaultWarranty
    ? "sub.default_warranty_policy_id, wp.warranty_nature, wp.calculation_mode, wp.default_months, wp.default_days"
    : "NULL::uuid AS default_warranty_policy_id, NULL::text AS warranty_nature, NULL::text AS calculation_mode, NULL::int AS default_months, NULL::int AS default_days"
  const policyJoin = hasDefaultWarranty
    ? `LEFT JOIN warranty_policies wp
         ON wp.company_id = sub.company_id
        AND wp.id = sub.default_warranty_policy_id
        AND wp.active = TRUE
        AND wp.applies_to_sale = TRUE
        AND wp.effective_from <= NOW()
        AND (wp.effective_until IS NULL OR wp.effective_until > NOW())`
    : ""

  const result = await pool.query<SubcategoryWarrantyDefaultRow>(
    `
      SELECT sub.normalized_name, ${policySelect}
      FROM product_subcategories sub
      ${policyJoin}
      WHERE sub.company_id = $1
        AND sub.is_active = TRUE
        ${deletedAtPredicate}
      ORDER BY sub.sort_order ASC, sub.name ASC
    `,
    [auth.context.companyId]
  )

  return NextResponse.json({
    data: result.rows.map((row) => ({
      normalizedName: row.normalized_name,
      defaultWarrantyPolicyId: row.default_warranty_policy_id,
      warrantyNature: row.warranty_nature,
      calculationMode: row.calculation_mode,
      defaultMonths: row.default_months,
      defaultDays: row.default_days,
    })),
    error: null,
  })
}
