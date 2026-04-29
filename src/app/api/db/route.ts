import { NextResponse } from "next/server"
import { ensureDefaultCompanyAndUser, pool } from "@/lib/db"

type Filter = { op: "eq" | "neq" | "gte" | "lte" | "in" | "match" | "or"; column?: string; value: unknown }
type Order = { column: string; ascending?: boolean }

const SIMPLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const TABLES_WITH_COMPANY = new Set([
  "suppliers",
  "checklists",
  "inventory",
  "inventory_purchases",
  "inventory_purchase_items",
  "customers",
  "trade_ins",
  "sales",
  "warranties",
  "problems",
  "quotes",
  "financial_settings",
  "finance_accounts",
  "finance_credit_cards",
  "finance_chart_accounts",
  "supplier_prices",
  "sales_additional_items",
  "audit_logs",
  "transactions",
])

const JSON_COLUMNS: Record<string, Set<string>> = {
  companies: new Set(["settings"]),
  product_catalog: new Set(["specs"]),
  checklists: new Set(["items"]),
  trade_ins: new Set(["checklist_data"]),
  audit_logs: new Set(["old_data", "new_data"]),
}

const NUMERIC_COLUMNS = new Set([
  "purchase_price",
  "suggested_price",
  "trade_in_value",
  "sale_price",
  "card_fee_pct",
  "net_amount",
  "supplier_cost",
  "refund_amount",
  "repair_cost",
  "quoted_price",
  "default_margin_pct",
  "debit_fee_pct",
  "credit_1x_fee_pct",
  "credit_2x_fee_pct",
  "credit_3x_fee_pct",
  "credit_4x_fee_pct",
  "credit_5x_fee_pct",
  "credit_6x_fee_pct",
  "credit_7x_fee_pct",
  "credit_8x_fee_pct",
  "credit_9x_fee_pct",
  "credit_10x_fee_pct",
  "credit_11x_fee_pct",
  "credit_12x_fee_pct",
  "credit_13x_fee_pct",
  "credit_14x_fee_pct",
  "credit_15x_fee_pct",
  "credit_16x_fee_pct",
  "credit_17x_fee_pct",
  "credit_18x_fee_pct",
  "pix_fee_pct",
  "cash_discount_pct",
  "price",
  "cost_price",
  "profit",
  "opening_balance",
  "current_balance",
  "freight_amount",
  "other_costs_amount",
  "products_amount",
  "total_amount",
  "unit_cost",
  "freight_allocated",
  "other_cost_allocated",
  "landed_unit_cost",
  "margin_pct",
])

function ident(value: string) {
  if (!SIMPLE_IDENTIFIER.test(value)) throw new Error(`Invalid SQL identifier: ${value}`)
  return `"${value}"`
}

function parseColumns(select?: string) {
  if (!select || select.includes("*") || select.includes("(") || select.includes(":") || select.includes("->")) {
    return "*"
  }

  const columns = select
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .filter((column) => SIMPLE_IDENTIFIER.test(column))

  return columns.length ? columns.map(ident).join(", ") : "*"
}

function normalizeValue(table: string, column: string, value: unknown) {
  if (value === undefined) return null
  if (value === null) return null
  if (JSON_COLUMNS[table]?.has(column)) {
    return typeof value === "string" ? value : JSON.stringify(value)
  }
  return value
}

function normalizeOutputValue(column: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeOutput(item))
  if (value && typeof value === "object") return normalizeOutput(value)
  if (NUMERIC_COLUMNS.has(column) && typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}

function normalizeOutput(row: unknown): unknown {
  if (!row || typeof row !== "object" || row instanceof Date) return row

  const normalized: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(row as Record<string, unknown>)) {
    normalized[column] = normalizeOutputValue(column, value)
  }
  return normalized
}

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => normalizeOutput(row) as Record<string, unknown>)
}

function addFilter(where: string[], params: unknown[], filter: Filter) {
  if (filter.op === "match" && typeof filter.value === "object" && filter.value) {
    for (const [column, value] of Object.entries(filter.value as Record<string, unknown>)) {
      where.push(`${ident(column)} = $${params.length + 1}`)
      params.push(value)
    }
    return
  }

  if (filter.op === "or" && typeof filter.value === "string") {
    const parts = filter.value.split(",").map((part) => part.trim()).filter(Boolean)
    const clauses: string[] = []
    for (const part of parts) {
      const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.ilike\.%(.*)%$/)
      if (!match) continue
      clauses.push(`${ident(match[1])} ILIKE $${params.length + 1}`)
      params.push(`%${match[2]}%`)
    }
    if (clauses.length) where.push(`(${clauses.join(" OR ")})`)
    return
  }

  if (!filter.column) return
  const column = ident(filter.column)

  if (filter.op === "in") {
    const values = Array.isArray(filter.value) ? filter.value : []
    if (values.length === 0) {
      where.push("FALSE")
      return
    }
    const placeholders = values.map((value) => {
      params.push(value)
      return `$${params.length}`
    })
    where.push(`${column} IN (${placeholders.join(", ")})`)
    return
  }

  const operators = { eq: "=", neq: "<>", gte: ">=", lte: "<=" } as const
  where.push(`${column} ${operators[filter.op as keyof typeof operators]} $${params.length + 1}`)
  params.push(filter.value)
}

async function hydrate(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return rows

  if (table === "inventory") {
    await hydrateInventory(rows)
  }

  if (table === "sales") {
    await hydrateSales(rows)
  }

  if (table === "warranties") {
    await hydrateWarranties(rows)
  }

  if (table === "problems") {
    await hydrateProblems(rows)
  }

  if (table === "checklists") {
    await hydrateChecklists(rows)
  }

  if (table === "sales_additional_items") {
    await hydrateSalesAdditionalItems(rows)
  }

  return rows
}

async function getByIds(table: string, ids: unknown[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map<string, Record<string, unknown>>()
  const res = await pool.query(`SELECT * FROM ${ident(table)} WHERE id = ANY($1::uuid[])`, [unique])
  return new Map(res.rows.map((row) => [row.id, row]))
}

async function hydrateInventory(rows: Record<string, unknown>[]) {
  const catalogs = await getByIds("product_catalog", rows.map((row) => row.catalog_id))
  for (const row of rows) {
    const catalog = catalogs.get(String(row.catalog_id || ""))
    row.catalog = catalog || null
    row.product_catalog = catalog || null
  }
}

async function hydrateSales(rows: Record<string, unknown>[]) {
  const customers = await getByIds("customers", rows.map((row) => row.customer_id))
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id))
  await hydrateInventory(Array.from(inventory.values()))

  const saleIds = rows.map((row) => row.id).filter(Boolean)
  const additional = saleIds.length
    ? await pool.query("SELECT * FROM sales_additional_items WHERE sale_id = ANY($1::uuid[])", [saleIds])
    : { rows: [] as Record<string, unknown>[] }
  await hydrateSalesAdditionalItems(additional.rows)

  for (const row of rows) {
    const customer = customers.get(String(row.customer_id || "")) || null
    const item = inventory.get(String(row.inventory_id || "")) || null
    row.customer = customer
    row.customers = customer
    row.inventory = item
    row.sales_additional_items = additional.rows.filter((add) => add.sale_id === row.id)
  }
}

async function hydrateSalesAdditionalItems(rows: Record<string, unknown>[]) {
  const inventory = await getByIds("inventory", rows.map((row) => row.product_id))
  await hydrateInventory(Array.from(inventory.values()))

  for (const row of rows) {
    row.inventory = inventory.get(String(row.product_id || "")) || null
  }
}

async function hydrateWarranties(rows: Record<string, unknown>[]) {
  const sales = await getByIds("sales", rows.map((row) => row.sale_id))
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id))
  const customers = await getByIds("customers", rows.map((row) => row.customer_id))
  await hydrateInventory(Array.from(inventory.values()))
  for (const row of rows) {
    row.sales = sales.get(String(row.sale_id || "")) || null
    row.sale = row.sales
    row.inventory = inventory.get(String(row.inventory_id || "")) || null
    row.customers = customers.get(String(row.customer_id || "")) || null
    row.customer = row.customers
  }
}

async function hydrateProblems(rows: Record<string, unknown>[]) {
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id))
  const customers = await getByIds("customers", rows.map((row) => row.customer_id))
  const sales = await getByIds("sales", rows.map((row) => row.sale_id))
  await hydrateInventory(Array.from(inventory.values()))
  for (const row of rows) {
    row.inventory = inventory.get(String(row.inventory_id || "")) || null
    row.customers = customers.get(String(row.customer_id || "")) || null
    row.customer = row.customers
    row.sales = sales.get(String(row.sale_id || "")) || null
  }
}

async function hydrateChecklists(rows: Record<string, unknown>[]) {
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id))
  await hydrateInventory(Array.from(inventory.values()))
  for (const row of rows) {
    row.inventory = inventory.get(String(row.inventory_id || "")) || null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const table = String(body.table || "")
    const action = String(body.action || "select")
    if (!SIMPLE_IDENTIFIER.test(table)) throw new Error("Invalid table")

    const { companyId } = await ensureDefaultCompanyAndUser()
    const params: unknown[] = []
    const where: string[] = []
    for (const filter of (body.filters || []) as Filter[]) addFilter(where, params, filter)

    if (action === "select") {
      const columns = parseColumns(body.select)
      let sql = `SELECT ${columns} FROM ${ident(table)}`
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`

      const order = body.order as Order | undefined
      if (order?.column && SIMPLE_IDENTIFIER.test(order.column)) {
        sql += ` ORDER BY ${ident(order.column)} ${order.ascending === false ? "DESC" : "ASC"}`
      }

      const limit = Number.isFinite(body.limit) ? Number(body.limit) : null
      if (limit !== null) sql += ` LIMIT ${limit}`
      if (Number.isFinite(body.offset)) sql += ` OFFSET ${Number(body.offset)}`

      const result = await pool.query(sql, params)
      const data = await hydrate(table, result.rows)
      return NextResponse.json({ data: finalizeRows(data, body), error: null })
    }

    if (action === "insert" || action === "upsert") {
      const inputRows = (Array.isArray(body.values) ? body.values : [body.values]) as Record<string, unknown>[]
      const rows: Record<string, unknown>[] = inputRows.map((row) => ({
        ...(row || {}),
        ...(TABLES_WITH_COMPANY.has(table) && !(row || {}).company_id ? { company_id: companyId } : {}),
      }))
      if (rows.length === 0) return NextResponse.json({ data: [], error: null })

      const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))) as string[]
      const values: unknown[] = []
      const tuples = rows.map((row) => {
        const placeholders = columns.map((column) => {
          values.push(normalizeValue(table, column, row[column]))
          return `$${values.length}`
        })
        return `(${placeholders.join(", ")})`
      })

      let sql = `INSERT INTO ${ident(table)} (${columns.map(ident).join(", ")}) VALUES ${tuples.join(", ")}`
      if (action === "upsert") {
        const conflict = body.onConflict && SIMPLE_IDENTIFIER.test(body.onConflict) ? body.onConflict : "id"
        const updates = columns
          .filter((column) => column !== conflict)
          .map((column) => `${ident(column)} = EXCLUDED.${ident(column)}`)
        sql += ` ON CONFLICT (${ident(conflict)}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`
      }
      sql += " RETURNING *"

      const result = await pool.query(sql, values)
      const data = await hydrate(table, result.rows)
      return NextResponse.json({ data: finalizeRows(data, body), error: null })
    }

    if (action === "update") {
      const valuesObject = body.values || {}
      const columns = Object.keys(valuesObject)
      if (columns.length === 0) return NextResponse.json({ data: [], error: null })

      const sets = columns.map((column) => {
        params.push(normalizeValue(table, column, valuesObject[column]))
        return `${ident(column)} = $${params.length}`
      })
      let sql = `UPDATE ${ident(table)} SET ${sets.join(", ")}`
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`
      sql += " RETURNING *"
      const result = await pool.query(sql, params)
      const data = await hydrate(table, result.rows)
      return NextResponse.json({ data: finalizeRows(data, body), error: null })
    }

    if (action === "delete") {
      let sql = `DELETE FROM ${ident(table)}`
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`
      sql += " RETURNING *"
      const result = await pool.query(sql, params)
      return NextResponse.json({ data: finalizeRows(result.rows, body), error: null })
    }

    throw new Error(`Unsupported action: ${action}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected database error"
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

function finalizeRows(rows: Record<string, unknown>[], body: Record<string, unknown>) {
  const normalized = normalizeRows(rows)
  if (body.single || body.maybeSingle) return normalized[0] || null
  return normalized
}
