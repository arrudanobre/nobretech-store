import { Pool } from "pg"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Railway database calls will fail until it is configured.")
}

declare global {
  var nobretechPool: Pool | undefined
}

// NEXT_PHASE=phase-production-build during `next build` — no actual DB connections are made.
// The SSL guard must only fire at runtime, not during static analysis/build.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

const buildSslConfig = () => {
  const isRailwayDatabase =
    process.env.DATABASE_PROVIDER === "railway" || Boolean(connectionString?.includes("railway"))
  if (!isRailwayDatabase) return undefined
  const ca = process.env.DATABASE_SSL_CA
  if (ca) return { ca, rejectUnauthorized: true }
  const isExplicitRailwayException =
    process.env.DATABASE_PROVIDER === "railway" &&
    process.env.DATABASE_SSL_ALLOW_UNVERIFIED === "true"

  if (process.env.NODE_ENV === "production" && isExplicitRailwayException) {
    console.warn(
      "[db] Railway SSL unverified mode enabled: connection is encrypted, but server identity is not verified."
    )
    return { rejectUnauthorized: false }
  }

  // In production runtime, unverified SSL is not permitted unless Railway is explicitly allowed.
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      "[db] DATABASE_SSL_CA must be configured in production. " +
        "Set DATABASE_PROVIDER=railway and DATABASE_SSL_ALLOW_UNVERIFIED=true only for Railway public proxy SSL hostname mismatch."
    )
  }
  console.warn("[db] DATABASE_SSL_CA não configurada — SSL sem verificação de certificado. Configure em produção.")
  return { rejectUnauthorized: false }
}

const isNewPool = !globalThis.nobretechPool

export const pool =
  globalThis.nobretechPool ||
  new Pool({
    connectionString,
    ssl: buildSslConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.nobretechPool = pool
}

if (isNewPool) {
  pool.on("connect", (client) => {
    // 8 s cap on all statements — protects against runaway queries on shared pool.
    client.query("SET statement_timeout = '8000'").catch(() => {})
  })
}

export const DEFAULT_USER_ID = process.env.SEED_USER_ID || "00000000-0000-0000-0000-000000000001"
export const DEFAULT_USER_EMAIL = process.env.SEED_USER_EMAIL || ""

export async function ensureDefaultCompanyAndUser() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ensureDefaultCompanyAndUser cannot be used in production")
  }
  if (!DEFAULT_USER_EMAIL) {
    throw new Error("SEED_USER_EMAIL não configurada no .env.local. Adicione antes de rodar o seed.")
  }

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
      VALUES ($1, $2, $3, NULL, 'owner')
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
