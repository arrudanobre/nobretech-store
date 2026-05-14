import { config } from "dotenv"
import { Pool } from "pg"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

type ColumnRow = {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  ordinal_position: number
}

type TableAudit = {
  tableName: string
  domains: string[]
  approxRows: number
  columns: ColumnRow[]
  latestDates: Array<{ column: string; maxValue: string | null }>
}

const DATE_COLUMNS = new Set(["created_at", "sale_date", "movement_date", "date", "updated_at"])
const SENSITIVE_COLUMN_PATTERN = /(cpf|cnpj|phone|telefone|email|imei|serial|token|pin|password|senha|address|endereco|endereço)/i

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function sslConfig(connectionString: string | undefined) {
  const isRailway = process.env.DATABASE_PROVIDER === "railway" || Boolean(connectionString?.includes("railway"))
  if (!isRailway) return undefined
  const ca = process.env.DATABASE_SSL_CA
  if (ca) return { ca, rejectUnauthorized: true }
  return { rejectUnauthorized: false }
}

function domainsFor(tableName: string, columns: ColumnRow[]) {
  const haystack = `${tableName} ${columns.map((column) => column.column_name).join(" ")}`.toLowerCase()
  const domains: string[] = []
  const add = (domain: string, pattern: RegExp) => {
    if (pattern.test(haystack)) domains.push(domain)
  }
  add("financeiro", /(finance|financial|transaction|account|movement|payable|receivable|payment|expense|dre|chart|conta|ledger|fee|tax)/)
  add("vendas", /(sale|sales|sell|sold|order|discount|warranty|trade_in)/)
  add("estoque", /(inventory|stock|product_catalog|supplier|purchase|catalog|sku)/)
  add("marketing", /(marketing|campaign|ads|lead|funnel|source|origin)/)
  add("DRE/plano de contas", /(dre|chart_accounts|statement_section|financial_type|plano|account_plan|chart)/)
  add("decisões ORION", /(orion|decision|memory|analysis_logs)/)
  return domains.length ? Array.from(new Set(domains)) : ["outros"]
}

function importantColumns(columns: ColumnRow[]) {
  const preferred = columns.filter((column) => {
    if (SENSITIVE_COLUMN_PATTERN.test(column.column_name)) return false
    return /(^id$|company_id|_id$|date|created_at|updated_at|status|type|category|amount|price|cost|profit|margin|revenue|discount|total|balance|section|financial|affects|name|channel|source|origin)/i.test(column.column_name)
  })
  return (preferred.length ? preferred : columns.filter((column) => !SENSITIVE_COLUMN_PATTERN.test(column.column_name))).slice(0, 18)
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL não está configurada. O script não executa sem conexão somente leitura.")
  }

  const pool = new Pool({
    connectionString,
    ssl: sslConfig(connectionString),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  })

  try {
    await pool.query("SET statement_timeout = '5000'")
    const [tablesResult, columnsResult, approxResult] = await Promise.all([
      pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC
      `),
      pool.query<ColumnRow>(`
        SELECT table_name, column_name, data_type, is_nullable, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name ASC, ordinal_position ASC
      `),
      pool.query<{ table_name: string; approx_rows: string }>(`
        SELECT c.relname AS table_name, GREATEST(c.reltuples::bigint, 0) AS approx_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
      `),
    ])

    const columnsByTable = new Map<string, ColumnRow[]>()
    for (const column of columnsResult.rows) {
      const list = columnsByTable.get(column.table_name) || []
      list.push(column)
      columnsByTable.set(column.table_name, list)
    }
    const approxByTable = new Map(approxResult.rows.map((row) => [row.table_name, Number(row.approx_rows) || 0]))

    const audits: TableAudit[] = []
    for (const table of tablesResult.rows) {
      const columns = columnsByTable.get(table.table_name) || []
      const countSql = `SELECT COUNT(*)::bigint AS row_count FROM ${quoteIdent("public")}.${quoteIdent(table.table_name)}`
      const countResult = await pool.query<{ row_count: string }>(countSql).catch(() => ({
        rows: [{ row_count: String(approxByTable.get(table.table_name) || 0) }],
      }))
      const latestColumns = columns.filter((column) => DATE_COLUMNS.has(column.column_name))
      const latestDates: TableAudit["latestDates"] = []
      for (const column of latestColumns) {
        const sql = `SELECT MAX(${quoteIdent(column.column_name)})::text AS max_value FROM ${quoteIdent("public")}.${quoteIdent(table.table_name)}`
        const result = await pool.query<{ max_value: string | null }>(sql).catch(() => ({ rows: [{ max_value: null }] }))
        latestDates.push({ column: column.column_name, maxValue: result.rows[0]?.max_value || null })
      }
      audits.push({
        tableName: table.table_name,
        domains: domainsFor(table.table_name, columns),
        approxRows: Number(countResult.rows[0]?.row_count) || approxByTable.get(table.table_name) || 0,
        columns,
        latestDates,
      })
    }

    const domainCounts = new Map<string, number>()
    for (const audit of audits) {
      for (const domain of audit.domains) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1)
    }

    console.log("# ORION Data Coverage Catalog Audit")
    console.log("")
    console.log(`Generated at: ${new Date().toISOString()}`)
    console.log(`Public tables: ${audits.length}`)
    console.log("")
    console.log("## Domain Summary")
    console.log("")
    console.log("| Domain | Tables |")
    console.log("| --- | ---: |")
    for (const [domain, count] of Array.from(domainCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`| ${domain} | ${count} |`)
    }
    console.log("")
    console.log("## Public Tables")
    console.log("")
    console.log("| Table | Domains | Approx rows | Latest relevant dates | Main non-sensitive columns |")
    console.log("| --- | --- | ---: | --- | --- |")
    for (const audit of audits) {
      const latest = audit.latestDates.length
        ? audit.latestDates.map((item) => `${item.column}: ${item.maxValue || "null"}`).join("<br>")
        : "-"
      const columns = importantColumns(audit.columns)
        .map((column) => `${column.column_name}:${column.data_type}${column.is_nullable === "NO" ? "!" : ""}`)
        .join("<br>")
      console.log(`| ${audit.tableName} | ${audit.domains.join(", ")} | ${audit.approxRows} | ${latest} | ${columns || "-"} |`)
    }
    console.log("")
    console.log("Sensitive columns were not sampled and no row-level customer/product identifiers were printed.")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
