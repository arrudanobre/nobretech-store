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
const isLocalDevRuntime = process.env.NODE_ENV !== "production" && !isBuildPhase
const isProductionRuntime = process.env.NODE_ENV === "production" && !isBuildPhase
const looksLikeRailwayDatabase =
  process.env.DATABASE_PROVIDER === "railway" || Boolean(connectionString?.match(/railway|rlwy|monorail/i))
const isRailwayDatabaseForSsl =
  process.env.DATABASE_PROVIDER === "railway" || Boolean(connectionString?.includes("railway"))
const databasePoolMax = Number.parseInt(
  process.env.DATABASE_POOL_MAX || (isProductionRuntime ? "2" : "20"),
  10
)
const databaseIdleTimeoutMillis = Number.parseInt(
  process.env.DATABASE_IDLE_TIMEOUT_MILLIS || (isProductionRuntime ? "10000" : "30000"),
  10
)
const databaseConnectionTimeoutMillis = Number.parseInt(
  process.env.DATABASE_CONNECTION_TIMEOUT_MILLIS || (isProductionRuntime ? "10000" : "5000"),
  10
)

if (
  connectionString &&
  isLocalDevRuntime &&
  looksLikeRailwayDatabase &&
  process.env.ALLOW_RAILWAY_DATABASE_IN_DEV !== "true"
) {
  throw new Error(
    "[db] Local development is refusing to use a Railway-looking DATABASE_URL. " +
      "Point .env.local to postgresql://nobretech:nobretech@localhost:5433/nobretech_local, " +
      "or set ALLOW_RAILWAY_DATABASE_IN_DEV=true only for an intentional read-only exception."
  )
}

const buildSslConfig = () => {
  if (!isRailwayDatabaseForSsl) return undefined
  const ca = process.env.DATABASE_SSL_CA
  if (ca) return { ca, rejectUnauthorized: true }
  const isExplicitRailwayException =
    process.env.DATABASE_PROVIDER === "railway" &&
    process.env.DATABASE_SSL_ALLOW_UNVERIFIED === "true"

  if (isProductionRuntime && isExplicitRailwayException) {
    console.warn(
      "[db] Railway SSL unverified mode enabled: connection is encrypted, but server identity is not verified."
    )
    return { rejectUnauthorized: false }
  }

  // In production runtime, unverified SSL is not permitted unless Railway is explicitly allowed.
  if (isProductionRuntime) {
    throw new Error(
      "[db] DATABASE_SSL_CA must be configured in production. " +
        "Set DATABASE_PROVIDER=railway and DATABASE_SSL_ALLOW_UNVERIFIED=true only for Railway public proxy SSL hostname mismatch."
    )
  }
  console.warn("[db] DATABASE_SSL_CA não configurada — SSL sem verificação de certificado. Configure em produção.")
  return { rejectUnauthorized: false }
}

export const pool =
  globalThis.nobretechPool ||
  new Pool({
    connectionString,
    ssl: buildSslConfig(),
    max: Number.isFinite(databasePoolMax) && databasePoolMax > 0 ? databasePoolMax : 2,
    idleTimeoutMillis: Number.isFinite(databaseIdleTimeoutMillis) && databaseIdleTimeoutMillis > 0
      ? databaseIdleTimeoutMillis
      : 10000,
    connectionTimeoutMillis: Number.isFinite(databaseConnectionTimeoutMillis) && databaseConnectionTimeoutMillis > 0
      ? databaseConnectionTimeoutMillis
      : 10000,
    // onConnect is awaited by pg-pool before the client is dispatched to callers,
    // preventing the concurrent-query DeprecationWarning that pool.on("connect") caused.
    onConnect: (client) => client.query("SET statement_timeout = '8000'"),
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.nobretechPool = pool
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
