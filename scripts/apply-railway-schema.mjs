import { readFile } from "node:fs/promises"
import { Client } from "pg"

const databaseUrl = process.env.DATABASE_URL
const schemaPath = process.argv[2] || "migrations/railway_schema.sql"

if (!databaseUrl) {
  console.error("DATABASE_URL is required.")
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/apply-railway-schema.mjs')
  process.exit(1)
}

const sql = await readFile(schemaPath, "utf8")
const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("railway") ? { rejectUnauthorized: false } : undefined,
})

try {
  console.log(`Connecting to Railway Postgres...`)
  await client.connect()
  console.log(`Applying schema from ${schemaPath}...`)
  await client.query(sql)
  console.log("Schema applied successfully.")
} catch (error) {
  console.error("Failed to apply schema.")
  console.error(error)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
