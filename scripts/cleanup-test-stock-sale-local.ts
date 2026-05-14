import { Client } from "pg"

const LOCAL_URL = "postgresql://nobretech:nobretech@localhost:5433/nobretech_local"
const TEST_COMPANY_SLUG_PREFIX = "teste-estoque-venda-local-"

type TestCompany = {
  id: string
  slug: string
  name: string
  created_at: string
}

type CountRow = {
  table_name: string
  row_count: string
}

function abort(message: string): never {
  console.error(message)
  process.exit(1)
}

function validateLocalDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || LOCAL_URL
  if (/railway|rlwy|monorail/i.test(databaseUrl)) {
    abort("DATABASE_URL appears to point to Railway. Aborting.")
  }
  if (databaseUrl !== LOCAL_URL) {
    abort(`DATABASE_URL must point to local Docker homologation DB: ${LOCAL_URL}`)
  }
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV=production is not allowed for local cleanup.")
  }
  return databaseUrl
}

async function loadTargetCompanies(client: Client) {
  const result = await client.query<TestCompany>(
    `
      SELECT id, slug, name, created_at::text
      FROM companies
      WHERE slug LIKE $1
      ORDER BY created_at ASC
    `,
    [`${TEST_COMPANY_SLUG_PREFIX}%`]
  )

  for (const company of result.rows) {
    if (!company.slug.startsWith(TEST_COMPANY_SLUG_PREFIX)) {
      abort(`Unexpected company slug selected for cleanup: ${company.slug}`)
    }
  }

  return result.rows
}

async function countRelatedRows(client: Client, companyIds: string[]) {
  const result = await client.query<CountRow>(
    `
      SELECT 'companies' AS table_name, COUNT(*)::text AS row_count FROM companies WHERE id = ANY($1::uuid[])
      UNION ALL SELECT 'users', COUNT(*)::text FROM users WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'customers', COUNT(*)::text FROM customers WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'finance_accounts', COUNT(*)::text FROM finance_accounts WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'financial_settings', COUNT(*)::text FROM financial_settings WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'inventory', COUNT(*)::text FROM inventory WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'inventory_item_variants', COUNT(*)::text FROM inventory_item_variants WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'sales', COUNT(*)::text FROM sales WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'sales_additional_items', COUNT(*)::text FROM sales_additional_items WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'sale_payments', COUNT(*)::text FROM sale_payments WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'transactions', COUNT(*)::text FROM transactions WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'financial_account_movements', COUNT(*)::text FROM financial_account_movements WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'warranties', COUNT(*)::text FROM warranties WHERE company_id = ANY($1::uuid[])
      UNION ALL SELECT 'audit_logs', COUNT(*)::text FROM audit_logs WHERE company_id = ANY($1::uuid[])
      ORDER BY table_name
    `,
    [companyIds]
  )

  return result.rows
}

function printCompanies(companies: TestCompany[]) {
  console.log(`Empresas encontradas: ${companies.length}`)
  for (const company of companies) {
    console.log(`- ${company.id} | ${company.slug} | ${company.name} | ${company.created_at}`)
  }
}

function printCounts(title: string, rows: CountRow[]) {
  console.log(title)
  for (const row of rows) {
    console.log(`- ${row.table_name}: ${row.row_count}`)
  }
}

async function main() {
  const databaseUrl = validateLocalDatabaseUrl()
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    console.log(`Banco local: ${databaseUrl}`)
    const companies = await loadTargetCompanies(client)
    printCompanies(companies)

    if (companies.length === 0) {
      console.log("Nada para limpar.")
      return
    }

    const companyIds = companies.map((company) => company.id)
    const beforeCounts = await countRelatedRows(client, companyIds)
    printCounts("Registros relacionados antes do cleanup:", beforeCounts)

    await client.query("BEGIN")
    try {
      const auditDelete = await client.query(
        "DELETE FROM audit_logs WHERE company_id = ANY($1::uuid[])",
        [companyIds]
      )
      const companyDelete = await client.query(
        `
          DELETE FROM companies
          WHERE id = ANY($1::uuid[])
            AND slug LIKE $2
        `,
        [companyIds, `${TEST_COMPANY_SLUG_PREFIX}%`]
      )

      if ((companyDelete.rowCount ?? 0) !== companyIds.length) {
        throw new Error(`Cleanup abortado: esperado remover ${companyIds.length} empresa(s), removeu ${companyDelete.rowCount ?? 0}.`)
      }

      await client.query("COMMIT")
      console.log(`Audit logs removidos: ${auditDelete.rowCount ?? 0}`)
      console.log(`Empresas removidas: ${companyDelete.rowCount ?? 0}`)
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    }

    const afterCounts = await countRelatedRows(client, companyIds)
    printCounts("Registros relacionados depois do cleanup:", afterCounts)

    const leftoverCount = afterCounts.reduce((sum, row) => sum + Number(row.row_count || 0), 0)
    if (leftoverCount > 0) {
      throw new Error(`Cleanup incompleto: ${leftoverCount} registro(s) relacionado(s) permaneceram.`)
    }

    console.log("Cleanup local concluido sem tocar em dados fora do padrao de teste.")
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error("FALHOU: cleanup local de empresas de teste")
  console.error(error)
  process.exit(1)
})
