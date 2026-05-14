import dotenv from "dotenv"
import { Pool } from "pg"

dotenv.config({ path: ".env.local", quiet: true })

const EXPECTED_URL = "postgresql://nobretech:nobretech@localhost:5433/nobretech_local"
const connectionString = process.env.DATABASE_URL
const shouldConnect = process.argv.includes("--connect")

function abort(message) {
  console.error(`[local-db-check] ${message}`)
  process.exit(1)
}

function assertLocalDatabaseUrl(value) {
  if (!value) abort("DATABASE_URL is missing in .env.local.")
  if (/railway|rlwy|monorail/i.test(value)) {
    abort("DATABASE_URL looks like Railway. Refusing to use it for local development.")
  }

  let url
  try {
    url = new URL(value)
  } catch {
    abort("DATABASE_URL is not a valid PostgreSQL URL.")
  }

  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  if (!isLocalHost || url.port !== "5433") {
    abort(`DATABASE_URL must point to local Docker Postgres on port 5433. Expected: ${EXPECTED_URL}`)
  }

  return url
}

const url = assertLocalDatabaseUrl(connectionString)

console.log("[local-db-check] DATABASE_URL is local.")
console.log(`[local-db-check] host=${url.hostname} port=${url.port} database=${url.pathname.slice(1)}`)

if (shouldConnect) {
  const pool = new Pool({ connectionString })
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        COUNT(*) FILTER (WHERE table_schema = 'public')::int AS public_table_count
      FROM information_schema.tables
    `)
    const row = result.rows[0]
    console.log(
      `[local-db-check] connected database=${row.database_name} user=${row.user_name} public_tables=${row.public_table_count}`
    )
  } finally {
    await pool.end().catch(() => {})
  }
}
