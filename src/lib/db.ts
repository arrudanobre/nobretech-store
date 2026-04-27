import { Pool } from "pg"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Railway database calls will fail until it is configured.")
}

declare global {
  // eslint-disable-next-line no-var
  var nobretechPool: Pool | undefined
}

export const pool =
  globalThis.nobretechPool ||
  new Pool({
    connectionString,
    ssl: connectionString?.includes("railway") ? { rejectUnauthorized: false } : undefined,
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.nobretechPool = pool
}

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
export const DEFAULT_USER_EMAIL = "local@nobretech.store"

export async function ensureDefaultCompanyAndUser() {
  await pool.query(`
    INSERT INTO companies (name, slug)
    VALUES ('NOBRETECH STORE', 'nobretech-store')
    ON CONFLICT (slug) DO NOTHING
  `)

  const company = await pool.query<{ id: string }>(
    "SELECT id FROM companies WHERE slug = 'nobretech-store' LIMIT 1"
  )

  const companyId = company.rows[0]?.id
  if (!companyId) throw new Error("Default company not found")

  await pool.query(
    `
      INSERT INTO users (id, company_id, email, full_name, role)
      VALUES ($1, $2, $3, 'Nobretech Local', 'owner')
      ON CONFLICT (id) DO UPDATE
      SET company_id = EXCLUDED.company_id,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role
    `,
    [DEFAULT_USER_ID, companyId, DEFAULT_USER_EMAIL]
  )

  await pool.query(
    `
      INSERT INTO financial_settings (company_id)
      VALUES ($1)
      ON CONFLICT (company_id) DO NOTHING
    `,
    [companyId]
  )

  return { companyId, userId: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL }
}
