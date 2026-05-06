import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { canAccess, canDeleteSensitiveRecords, canEditFinance, canManageUsers } from "@/lib/permissions"

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
  "marketing_campaigns",
  "marketing_leads",
  "finance_chart_accounts",
  "supplier_prices",
  "sales_additional_items",
  "sale_payments",
  "product_images",
  "audit_logs",
  "transactions",
  "financial_account_movements",
  "users",
])

const COMPANY_SELF_SCOPED_TABLES = new Set(["companies"])
const SENSITIVE_AUDIT_TABLES = new Set([
  "companies",
  "users",
  "financial_settings",
  "finance_accounts",
  "finance_credit_cards",
  "finance_chart_accounts",
  "transactions",
  "financial_account_movements",
  "inventory",
  "inventory_purchases",
  "inventory_purchase_items",
  "sales",
  "sales_additional_items",
  "sale_payments",
])

const FINANCE_TABLES = new Set([
  "financial_settings",
  "finance_accounts",
  "finance_credit_cards",
  "finance_chart_accounts",
  "transactions",
  "financial_account_movements",
])

const OWNER_ONLY_FINANCE_TABLES = new Set([
  "financial_settings",
  "finance_chart_accounts",
])

const INVENTORY_COST_COLUMNS = new Set([
  "purchase_price",
  "suggested_price",
  "supplier_cost",
  "unit_cost",
  "landed_unit_cost",
  "cost_price",
])

const SENSITIVE_SALE_COLUMNS = new Set([
  "sale_price",
  "net_amount",
  "supplier_cost",
  "sale_status",
  "inventory_id",
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
  "budget_amount",
  "actual_spend",
  "amount",
  "balance_after",
  "previous_balance",
  "target_balance",
  "difference_amount",
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

function splitTopLevel(value: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === "(") depth += 1
    if (char === ")") depth = Math.max(0, depth - 1)
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function parseOrCondition(part: string, params: unknown[]): string | null {
  const andMatch = part.match(/^and\((.*)\)$/)
  if (andMatch) {
    const clauses = splitTopLevel(andMatch[1])
      .map((condition) => parseOrCondition(condition, params))
      .filter(Boolean)
    return clauses.length ? `(${clauses.join(" AND ")})` : null
  }

  const ilikeMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.ilike\.%(.*)%$/)
  if (ilikeMatch) {
    params.push(`%${ilikeMatch[2]}%`)
    return `${ident(ilikeMatch[1])} ILIKE $${params.length}`
  }

  const isNullMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.is\.null$/)
  if (isNullMatch) return `${ident(isNullMatch[1])} IS NULL`

  const comparisonMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gte|lte)\.(.+)$/)
  if (comparisonMatch) {
    const operators = { eq: "=", neq: "<>", gte: ">=", lte: "<=" } as const
    params.push(comparisonMatch[3])
    return `${ident(comparisonMatch[1])} ${operators[comparisonMatch[2] as keyof typeof operators]} $${params.length}`
  }

  const inMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.in\.\((.*)\)$/)
  if (inMatch) {
    const values = splitTopLevel(inMatch[2])
    if (values.length === 0) return "FALSE"
    const placeholders = values.map((item) => {
      params.push(item)
      return `$${params.length}`
    })
    return `${ident(inMatch[1])} IN (${placeholders.join(", ")})`
  }

  return null
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
    const clauses = splitTopLevel(filter.value)
      .map((part) => parseOrCondition(part, params))
      .filter(Boolean)
    if (clauses.length) where.push(`(${clauses.join(" OR ")})`)
    else throw new Error(`Unsupported OR filter: ${filter.value}`)
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

function addCompanyScope(table: string, companyId: string, where: string[], params: unknown[]) {
  if (COMPANY_SELF_SCOPED_TABLES.has(table)) {
    params.push(companyId)
    where.push(`${ident("id")} = $${params.length}`)
    return
  }

  if (!TABLES_WITH_COMPANY.has(table)) return

  params.push(companyId)
  where.push(`${ident("company_id")} = $${params.length}`)
}

function isCompanyScoped(table: string) {
  return TABLES_WITH_COMPANY.has(table) || COMPANY_SELF_SCOPED_TABLES.has(table)
}

function forbidden(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 403 })
}

function valuesArray(values: unknown): Record<string, unknown>[] {
  return (Array.isArray(values) ? values : [values]).filter(Boolean) as Record<string, unknown>[]
}

function normalizeAuditAction(action: unknown) {
  if (action === "created" || action === "updated" || action === "deleted" || action === "exported" || action === "logged_in") {
    return action
  }

  const raw = String(action || "updated")
  if (raw.toLowerCase().includes("delete") || raw.toLowerCase().includes("remove")) return "deleted"
  if (raw.toLowerCase().includes("create") || raw.toLowerCase().includes("add")) return "created"
  return "updated"
}

function normalizeAuditLogRow(row: Record<string, unknown>) {
  if (!row || typeof row !== "object") return row
  const rawAction = row.action
  const nextRow: Record<string, unknown> = { ...row, action: normalizeAuditAction(rawAction) }
  if (rawAction && rawAction !== nextRow.action) {
    nextRow.new_data = {
      ...((nextRow.new_data && typeof nextRow.new_data === "object") ? nextRow.new_data as Record<string, unknown> : {}),
      audit_action: rawAction,
    }
  }
  return nextRow
}

function hasAnyColumn(values: Record<string, unknown>[], columns: Set<string>) {
  return values.some((row) => Object.keys(row || {}).some((column) => columns.has(column)))
}

function isSensitiveSaleChange(values: Record<string, unknown>[]) {
  return values.some((row) => {
    if (row.sale_status === "cancelled") return true
    return Object.keys(row || {}).some((column) => SENSITIVE_SALE_COLUMNS.has(column))
  })
}

function normalizeInventoryTradeInRow(row: Record<string, unknown>) {
  if (row.origin !== "trade_in") return row
  if (row.type === "supplier") {
    throw new Error("Estoque origin=trade_in deve ser sempre do tipo own.")
  }

  return {
    ...row,
    type: "own",
    supplier_id: null,
    supplier_name: null,
  }
}

function validateInventoryTradeInUpdate(values: Record<string, unknown>, oldRows: Record<string, unknown>[]) {
  const isChangingToTradeIn = values.origin === "trade_in"
  const touchesTradeInRows = oldRows.some((row) => row.origin === "trade_in")
  if (!isChangingToTradeIn && !touchesTradeInRows) return null

  if (values.type === "supplier") {
    return "Estoque origin=trade_in deve ser sempre do tipo own."
  }

  return null
}

function assertMutationAllowed(table: string, action: string, values: Record<string, unknown>[], role: string) {
  if (action === "select") {
    if (table === "financial_settings" && !canAccess(role, "finance.tax_settings")) {
      return "Acesso negado às configurações financeiras."
    }
    if (FINANCE_TABLES.has(table) && !canAccess(role, "finance.view")) {
      return "Acesso negado ao financeiro."
    }
    return null
  }

  if (table === "users") {
    if (action === "delete") return "Usuários não podem ser excluídos fisicamente."
    if (!canManageUsers(role)) return "Apenas owner pode gerenciar equipe."
  }

  if (table === "companies") {
    if (action !== "select" && !canAccess(role, "settings.edit")) {
      return "Apenas owner pode editar dados da empresa."
    }
    if (action !== "select" && action !== "update") {
      return "Empresas não podem ser criadas ou removidas por este endpoint."
    }
  }

  if (OWNER_ONLY_FINANCE_TABLES.has(table) && action !== "select" && !canAccess(role, "finance.tax_settings")) {
    return "Apenas owner pode alterar configurações financeiras críticas."
  }

  if (FINANCE_TABLES.has(table) && action !== "select" && !canEditFinance(role)) {
    return "Apenas owner pode alterar registros financeiros sensíveis."
  }

  if (action === "delete" && ["inventory", "sales", "sales_additional_items"].includes(table) && !canDeleteSensitiveRecords(role)) {
    return "Apenas owner pode excluir registros sensíveis."
  }

  if (table === "inventory" && action === "update" && hasAnyColumn(values, INVENTORY_COST_COLUMNS) && !canAccess(role, "inventory.edit_cost")) {
    return "Apenas owner pode alterar custos ou preços de compra."
  }

  if (table === "sales" && action === "update" && isSensitiveSaleChange(values) && !canAccess(role, "sales.edit_sensitive")) {
    return "Apenas owner pode cancelar ou editar dados sensíveis de venda."
  }

  if (table === "sales_additional_items" && action !== "select" && hasAnyColumn(values, INVENTORY_COST_COLUMNS) && !canAccess(role, "sales.edit_sensitive")) {
    return "Apenas owner pode alterar custos de itens da venda."
  }

  return null
}

async function selectRowsForAudit(table: string, where: string[], params: unknown[]) {
  if (!SENSITIVE_AUDIT_TABLES.has(table)) return []
  if (where.length === 0) return []

  const result = await pool.query(`SELECT * FROM ${ident(table)} WHERE ${where.join(" AND ")}`, params)
  return result.rows as Record<string, unknown>[]
}

async function writeAuditLogs(input: {
  companyId: string
  userId: string
  table: string
  action: "created" | "updated" | "deleted"
  oldRows?: Record<string, unknown>[]
  newRows?: Record<string, unknown>[]
}) {
  if (!SENSITIVE_AUDIT_TABLES.has(input.table) || input.table === "audit_logs") return

  const oldById = new Map((input.oldRows || []).map((row) => [String(row.id || ""), row]))
  const rows = input.newRows?.length ? input.newRows : input.oldRows || []
  if (rows.length === 0) return

  try {
    for (const row of rows) {
      const recordId = typeof row.id === "string" ? row.id : null
      if (!recordId) continue

      await pool.query(
        `
          INSERT INTO audit_logs (company_id, user_id, action, table_name, record_id, old_data, new_data)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        `,
        [
          input.companyId,
          input.userId,
          input.action,
          input.table,
          recordId,
          input.action === "created" ? null : JSON.stringify(oldById.get(recordId) || null),
          input.action === "deleted" ? null : JSON.stringify(row),
        ]
      )
    }
  } catch (error) {
    console.warn("Failed to write audit log", error)
  }
}

async function hydrate(table: string, rows: Record<string, unknown>[], companyId: string) {
  if (rows.length === 0) return rows

  if (table === "inventory") {
    await hydrateInventory(rows, companyId)
  }

  if (table === "sales") {
    await hydrateSales(rows, companyId)
  }

  if (table === "warranties") {
    await hydrateWarranties(rows, companyId)
  }

  if (table === "problems") {
    await hydrateProblems(rows, companyId)
  }

  if (table === "checklists") {
    await hydrateChecklists(rows, companyId)
  }

  if (table === "sales_additional_items") {
    await hydrateSalesAdditionalItems(rows, companyId)
  }

  return rows
}

async function getByIds(table: string, ids: unknown[], companyId?: string) {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map<string, Record<string, unknown>>()

  const where = ["id = ANY($1::uuid[])"]
  const params: unknown[] = [unique]

  if (companyId && TABLES_WITH_COMPANY.has(table)) {
    params.push(companyId)
    where.push(`${ident("company_id")} = $${params.length}`)
  }

  const res = await pool.query(`SELECT * FROM ${ident(table)} WHERE ${where.join(" AND ")}`, params)
  return new Map(res.rows.map((row) => [row.id, row]))
}

async function hydrateInventory(rows: Record<string, unknown>[], companyId: string) {
  const catalogs = await getByIds("product_catalog", rows.map((row) => row.catalog_id), companyId)
  for (const row of rows) {
    const catalog = catalogs.get(String(row.catalog_id || ""))
    row.catalog = catalog || null
    row.product_catalog = catalog || null
  }
}

async function hydrateSales(rows: Record<string, unknown>[], companyId: string) {
  const customers = await getByIds("customers", rows.map((row) => row.customer_id), companyId)
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id), companyId)
  await hydrateInventory(Array.from(inventory.values()), companyId)

  const saleIds = rows.map((row) => row.id).filter(Boolean)
  const additional = saleIds.length
    ? await pool.query(
        "SELECT * FROM sales_additional_items WHERE sale_id = ANY($1::uuid[]) AND company_id = $2",
        [saleIds, companyId]
      )
    : { rows: [] as Record<string, unknown>[] }
  await hydrateSalesAdditionalItems(additional.rows, companyId)

  for (const row of rows) {
    const customer = customers.get(String(row.customer_id || "")) || null
    const item = inventory.get(String(row.inventory_id || "")) || null
    row.customer = customer
    row.customers = customer
    row.inventory = item
    row.sales_additional_items = additional.rows.filter((add) => add.sale_id === row.id)
  }
}

async function hydrateSalesAdditionalItems(rows: Record<string, unknown>[], companyId: string) {
  const inventory = await getByIds("inventory", rows.map((row) => row.product_id), companyId)
  await hydrateInventory(Array.from(inventory.values()), companyId)

  for (const row of rows) {
    row.inventory = inventory.get(String(row.product_id || "")) || null
  }
}

async function hydrateWarranties(rows: Record<string, unknown>[], companyId: string) {
  const sales = await getByIds("sales", rows.map((row) => row.sale_id), companyId)
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id), companyId)
  const customers = await getByIds("customers", rows.map((row) => row.customer_id), companyId)
  await hydrateInventory(Array.from(inventory.values()), companyId)
  for (const row of rows) {
    row.sales = sales.get(String(row.sale_id || "")) || null
    row.sale = row.sales
    row.inventory = inventory.get(String(row.inventory_id || "")) || null
    row.customers = customers.get(String(row.customer_id || "")) || null
    row.customer = row.customers
  }
}

async function hydrateProblems(rows: Record<string, unknown>[], companyId: string) {
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id), companyId)
  const customers = await getByIds("customers", rows.map((row) => row.customer_id), companyId)
  const sales = await getByIds("sales", rows.map((row) => row.sale_id), companyId)
  await hydrateInventory(Array.from(inventory.values()), companyId)
  for (const row of rows) {
    row.inventory = inventory.get(String(row.inventory_id || "")) || null
    row.customers = customers.get(String(row.customer_id || "")) || null
    row.customer = row.customers
    row.sales = sales.get(String(row.sale_id || "")) || null
  }
}

async function hydrateChecklists(rows: Record<string, unknown>[], companyId: string) {
  const inventory = await getByIds("inventory", rows.map((row) => row.inventory_id), companyId)
  await hydrateInventory(Array.from(inventory.values()), companyId)
  for (const row of rows) {
    row.inventory = inventory.get(String(row.inventory_id || "")) || null
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireApiAuthContext()
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const table = String(body.table || "")
    const action = String(body.action || "select")
    if (!SIMPLE_IDENTIFIER.test(table)) throw new Error("Invalid table")

    const { companyId, role, appUserId } = authResult.context

    if (action === "rpc") {
      const rpcName = String(body.rpc || "")
      if (rpcName !== "validate_sale_payment_total") throw new Error(`Unsupported RPC: ${rpcName}`)

      const saleId = String((body.args as Record<string, unknown> | undefined)?.p_sale_id || "")
      if (!saleId) throw new Error("p_sale_id is required")

      const result = await pool.query(
        `SELECT validate_sale_payment_total($1::uuid)
         FROM sales
         WHERE id = $1::uuid
           AND company_id = $2::uuid`,
        [saleId, companyId]
      )
      if (result.rowCount === 0) throw new Error("Venda não encontrada para validação")

      return NextResponse.json({ data: null, error: null })
    }

    const params: unknown[] = []
    const where: string[] = []
    for (const filter of (body.filters || []) as Filter[]) addFilter(where, params, filter)
    const userFilterCount = where.length
    const tableHasCompany = TABLES_WITH_COMPANY.has(table)

    if (action === "select") {
      const permissionError = assertMutationAllowed(table, action, [], role)
      if (permissionError) return forbidden(permissionError)
      addCompanyScope(table, companyId, where, params)

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
      const data = await hydrate(table, result.rows, companyId)
      return NextResponse.json({ data: finalizeRows(data, body), error: null })
    }

    if (action === "insert" || action === "upsert") {
      const inputRows = (Array.isArray(body.values) ? body.values : [body.values]) as Record<string, unknown>[]
      const permissionError = assertMutationAllowed(table, action, inputRows, role)
      if (permissionError) return forbidden(permissionError)
      const rows: Record<string, unknown>[] = inputRows.map((row) => ({
        ...(row || {}),
        ...(tableHasCompany ? { company_id: companyId } : {}),
        ...(table === "audit_logs" ? { user_id: appUserId } : {}),
      }))
        .map((row) => table === "audit_logs" ? normalizeAuditLogRow(row) : row)
        .map((row) => table === "inventory" ? normalizeInventoryTradeInRow(row) : row)
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
          .filter((column) => !(tableHasCompany && column === "company_id"))
          .map((column) => `${ident(column)} = EXCLUDED.${ident(column)}`)
        sql += ` ON CONFLICT (${ident(conflict)}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`
      }
      sql += " RETURNING *"

      const result = await pool.query(sql, values)
      const data = await hydrate(table, result.rows, companyId)
      await writeAuditLogs({
        companyId,
        userId: appUserId,
        table,
        action: action === "insert" ? "created" : "updated",
        newRows: result.rows,
      })
      return NextResponse.json({ data: finalizeRows(data, body), error: null })
    }

    if (action === "update") {
      if (isCompanyScoped(table) && userFilterCount === 0) {
        return NextResponse.json(
          { data: null, error: { message: "Update requires at least one filter" } },
          { status: 400 }
        )
      }

      const valuesObject = { ...(body.values || {}) }
      const permissionError = assertMutationAllowed(table, action, valuesArray(valuesObject), role)
      if (permissionError) return forbidden(permissionError)
      if (isCompanyScoped(table)) delete valuesObject.company_id
      const columns = Object.keys(valuesObject)
      if (columns.length === 0) return NextResponse.json({ data: [], error: null })

      const auditWhere = [...where]
      const auditParams = [...params]
      addCompanyScope(table, companyId, auditWhere, auditParams)
      const oldRows = await selectRowsForAudit(table, auditWhere, auditParams)

      if (table === "inventory") {
        const inventoryTradeInError = validateInventoryTradeInUpdate(valuesObject, oldRows)
        if (inventoryTradeInError) {
          return NextResponse.json({ data: null, error: { message: inventoryTradeInError } }, { status: 400 })
        }

        if (valuesObject.origin === "trade_in" || oldRows.some((row) => row.origin === "trade_in")) {
          valuesObject.type = "own"
          valuesObject.supplier_id = null
          valuesObject.supplier_name = null
        }
      }

      if (
        table === "users" &&
        valuesObject.status === "inactive" &&
        oldRows.some((row) => row.id === appUserId)
      ) {
        return forbidden("Você não pode inativar o próprio usuário logado.")
      }

      const sets = columns.map((column) => {
        params.push(normalizeValue(table, column, valuesObject[column]))
        return `${ident(column)} = $${params.length}`
      })
      addCompanyScope(table, companyId, where, params)
      let sql = `UPDATE ${ident(table)} SET ${sets.join(", ")}`
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`
      sql += " RETURNING *"
      const result = await pool.query(sql, params)
      const data = await hydrate(table, result.rows, companyId)
      await writeAuditLogs({
        companyId,
        userId: appUserId,
        table,
        action: "updated",
        oldRows,
        newRows: result.rows,
      })
      return NextResponse.json({ data: finalizeRows(data, body), error: null })
    }

    if (action === "delete") {
      const permissionError = assertMutationAllowed(table, action, [], role)
      if (permissionError) return forbidden(permissionError)
      if (isCompanyScoped(table) && userFilterCount === 0) {
        return NextResponse.json(
          { data: null, error: { message: "Delete requires at least one filter" } },
          { status: 400 }
        )
      }

      addCompanyScope(table, companyId, where, params)
      const oldRows = await selectRowsForAudit(table, where, params)
      let sql = `DELETE FROM ${ident(table)}`
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`
      sql += " RETURNING *"
      const result = await pool.query(sql, params)
      await writeAuditLogs({
        companyId,
        userId: appUserId,
        table,
        action: "deleted",
        oldRows,
      })
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
