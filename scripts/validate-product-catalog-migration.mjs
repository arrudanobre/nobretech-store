import { readFile } from "node:fs/promises"
import process from "node:process"
import dotenv from "dotenv"
import { Client } from "pg"

dotenv.config({ path: ".env.local" })

const mode = process.argv[2] || "dry-run"
const migrationPath = process.argv[3] || "migrations/product_catalog_configuration.sql"
const shouldCommit = mode === "commit"

if (!["dry-run", "commit", "verify"].includes(mode)) {
  console.error("Usage: node scripts/validate-product-catalog-migration.mjs [dry-run|commit|verify] [migration.sql]")
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL is required.")
  process.exit(1)
}

const migrationSql = mode === "verify" ? "" : await readFile(migrationPath, "utf8")
const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("railway") ? { rejectUnauthorized: false } : undefined,
})

const targetTables = [
  "product_categories",
  "product_subcategories",
  "product_attributes",
  "product_attribute_options",
  "product_colors",
  "product_subcategory_colors",
]

async function verify() {
  const tables = await client.query(
    `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name
      `,
    [targetTables]
  )
  const indexes = await client.query(
    `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname
      `,
    [[
      "idx_product_categories_company_active",
      "idx_product_subcategories_category_active",
      "idx_product_attributes_category_active",
      "idx_product_attribute_options_attribute_active",
      "idx_product_colors_category_active",
      "idx_product_categories_company_normalized_active",
      "idx_product_subcategories_category_normalized_active",
      "idx_product_attributes_category_normalized_active",
      "idx_product_attribute_options_attribute_normalized_active",
      "idx_product_colors_category_normalized_active",
      "idx_inventory_catalog_snapshots",
    ]]
  )
  const hardeningColumns = await client.query(
    `
        SELECT table_name, column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name IN ('product_categories', 'product_subcategories', 'product_attributes', 'product_attribute_options', 'product_colors')
              AND column_name IN ('normalized_name', 'deleted_at', 'product_type'))
            OR (table_name = 'inventory'
              AND column_name IN ('product_type', 'category_name_snapshot', 'subcategory_name_snapshot', 'color_name_snapshot', 'attribute_summary_snapshot'))
          )
        ORDER BY table_name, column_name
      `
  )
  const hardeningConstraints = await client.query(
    `
        SELECT conname
        FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname
      `,
    [[
      "product_categories_product_type_check",
      "inventory_product_type_check",
    ]]
  )
  const deleteRules = await client.query(
    `
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = ANY($1::text[])
        ORDER BY constraint_name
      `,
    [[
      "product_subcategories_category_id_fkey",
      "product_attributes_category_id_fkey",
      "product_attribute_options_attribute_id_fkey",
      "product_colors_category_id_fkey",
      "product_subcategory_colors_subcategory_id_fkey",
      "product_subcategory_colors_color_id_fkey",
    ]]
  )
  const triggers = await client.query(
    `
        SELECT event_object_table AS table_name, trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
          AND trigger_name = ANY($1::text[])
        ORDER BY event_object_table, trigger_name
      `,
    [[
      "trg_product_categories_updated",
      "trg_product_subcategories_updated",
      "trg_product_attributes_updated",
      "trg_product_attribute_options_updated",
      "trg_product_colors_updated",
    ]]
  )
  const catalog = await client.query(
    `
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_catalog'
          AND column_name IN ('category', 'specs')
        ORDER BY column_name
      `
  )
  const seeds = await client.query(
    `
        SELECT
          (SELECT count(*)::int FROM product_categories) AS categories,
          (SELECT count(*)::int FROM product_subcategories) AS subcategories,
          (SELECT count(*)::int FROM product_attributes) AS attributes,
          (SELECT count(*)::int FROM product_attribute_options) AS attribute_options,
          (SELECT count(*)::int FROM product_colors) AS colors,
          (SELECT count(*)::int FROM product_subcategory_colors) AS subcategory_colors
      `
  )
  const colors = await client.query(
    `
        SELECT name, hex, count(*)::int AS count
        FROM product_colors
        GROUP BY name, hex
        ORDER BY count DESC, name
        LIMIT 10
      `
  )
  const legacyConstraint = await client.query(
    `
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'product_catalog'::regclass
          AND conname = 'product_catalog_category_check'
      `
  )

  return {
    tables: tables.rows,
    indexes: indexes.rows,
    hardeningColumns: hardeningColumns.rows,
    hardeningConstraints: hardeningConstraints.rows,
    deleteRules: deleteRules.rows,
    triggers: triggers.rows,
    productCatalogColumns: catalog.rows,
    counts: seeds.rows[0],
    sampleColors: colors.rows,
    legacyCategoryCheckExists: legacyConstraint.rowCount > 0,
  }
}

try {
  await client.connect()

  if (mode === "verify") {
    console.log(JSON.stringify(await verify(), null, 2))
  } else {
    await client.query("BEGIN")
    await client.query(migrationSql)
    const verification = await verify()
    if (shouldCommit) {
      await client.query("COMMIT")
      console.log(JSON.stringify({ mode, committed: true, verification }, null, 2))
    } else {
      await client.query("ROLLBACK")
      console.log(JSON.stringify({ mode, committed: false, verification }, null, 2))
    }
  }
} catch (error) {
  try {
    await client.query("ROLLBACK")
  } catch {}
  console.error(error.stack || error.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
