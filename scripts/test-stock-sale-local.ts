import { randomUUID } from "node:crypto"
import Module from "node:module"
import { Client } from "pg"

const TAG = "TESTE_ESTOQUE_VENDA_LOCAL"
const LOCAL_URL = "postgresql://nobretech:nobretech@localhost:5433/nobretech_local"
const LOCAL_TOKEN = "TESTE_ATOMIC_SALE_LOCAL"

type ModuleWithLoad = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

const moduleWithLoad = Module as ModuleWithLoad
const originalModuleLoad = moduleWithLoad._load
moduleWithLoad._load = (request, parent, isMain) => {
  if (request === "server-only") return {}
  return originalModuleLoad(request, parent, isMain)
}

type SeedContext = {
  companyId: string
  userId: string
  customerId: string
  accountId: string
  policy6mId: string
  policy3mId: string
  policyApple12mId: string
  appleCatalogId: string
  accessoriesCatalogId: string
  durableAccessoryName: string
  nonDurableAccessoryName: string
  unclassifiedAccessoryName: string
}

type InventorySeed = {
  id: string
  name: string
}

type TestRunTracker = {
  companyId: string | null
}

type SaleResponse = {
  status: number
  body: {
    data: {
      saleId: string
      paymentIds: string[]
      transactionIds: string[]
      warrantyApplied?: { created: number; skipped: number }
    } | null
    error: { message: string } | null
  }
}

function abort(message: string): never {
  console.error(message)
  process.exit(1)
}

function validateLocalDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || LOCAL_URL
  if (databaseUrl !== LOCAL_URL) abort(`DATABASE_URL must point to local Docker homologation DB: ${LOCAL_URL}`)
  if (/railway|rlwy|monorail/i.test(databaseUrl)) abort("DATABASE_URL appears to point to Railway. Aborting.")
  if (process.env.NODE_ENV === "production") abort("NODE_ENV=production is not allowed for local stock sale tests.")
  process.env.DATABASE_URL = databaseUrl
  process.env.DATABASE_URL_TEST = databaseUrl
  process.env.NODE_ENV = process.env.NODE_ENV || "test"
  return databaseUrl
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addMonths(dateOnly: string, months: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

async function scalar<T>(client: Client, sql: string, values: unknown[] = []) {
  const result = await client.query(sql, values)
  return result.rows[0] as T
}

async function ensureWarrantySubcategoryDefaultSchema(client: Client) {
  await client.query(`
    ALTER TABLE product_subcategories
      ADD COLUMN IF NOT EXISTS default_warranty_policy_id UUID
  `)
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'product_subcategories_default_warranty_policy_fk'
      ) THEN
        ALTER TABLE product_subcategories
          ADD CONSTRAINT product_subcategories_default_warranty_policy_fk
          FOREIGN KEY (default_warranty_policy_id)
          REFERENCES warranty_policies(id)
          ON DELETE SET NULL;
      END IF;
    END $$
  `)
}

async function seedBase(client: Client, tracker: TestRunTracker): Promise<SeedContext> {
  await ensureWarrantySubcategoryDefaultSchema(client)

  const company = await scalar<{ id: string }>(
    client,
    `INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id`,
    [`NOBRETECH ${TAG}`, `teste-estoque-venda-local-${randomUUID()}`]
  )
  tracker.companyId = company.id

  const user = await scalar<{ id: string }>(
    client,
    `INSERT INTO users (company_id, email, full_name, role, status)
     VALUES ($1::uuid, $2, $3, 'owner', 'active')
     RETURNING id`,
    [company.id, `estoque-${randomUUID()}@nobretech.test`, TAG]
  )

  const customer = await scalar<{ id: string }>(
    client,
    `INSERT INTO customers (company_id, full_name, email, notes)
     VALUES ($1::uuid, $2, $3, $4)
     RETURNING id`,
    [company.id, `Cliente ${TAG}`, `cliente-${randomUUID()}@nobretech.test`, TAG]
  )

  const account = await scalar<{ id: string }>(
    client,
    `INSERT INTO finance_accounts (company_id, name, institution, account_type, opening_balance, current_balance, is_active)
     VALUES ($1::uuid, $2, 'Local', 'checking', 0, 0, true)
     RETURNING id`,
    [company.id, `Conta ${TAG}`]
  )

  await client.query(`INSERT INTO financial_settings (company_id) VALUES ($1::uuid) ON CONFLICT (company_id) DO NOTHING`, [company.id])
  const policies = await seedWarrantyPolicies(client, company.id)
  const deviceCatalog = await seedDeviceCatalog(client, company.id)
  const accessoryCatalog = await seedAccessoryCatalog(client, company.id, policies.policy3mId)
  return { companyId: company.id, userId: user.id, customerId: customer.id, accountId: account.id, ...policies, ...deviceCatalog, ...accessoryCatalog }
}

async function seedDeviceCatalog(client: Client, companyId: string) {
  await client.query(
    `INSERT INTO product_categories (company_id, name, slug, normalized_name, product_type, sort_order, is_active)
     VALUES ($1::uuid, 'iPhone', 'iphone', 'iphone', 'device', 1, TRUE)`,
    [companyId]
  )
  const catalog = await scalar<{ id: string }>(
    client,
    `INSERT INTO product_catalog (category, brand, model, variant, storage, color)
     VALUES ('iphone', 'Apple', 'iPhone local', NULL, '128GB', 'Preto')
     RETURNING id`
  )
  return { appleCatalogId: catalog.id }
}

async function seedAccessoryCatalog(client: Client, companyId: string, policy3mId: string) {
  const category = await scalar<{ id: string }>(
    client,
    `INSERT INTO product_categories (company_id, name, slug, normalized_name, product_type, sort_order, is_active)
     VALUES ($1::uuid, 'Acessórios', 'accessories', 'acessorios', 'accessory', 10, TRUE)
     RETURNING id`,
    [companyId]
  )
  await client.query(
    `INSERT INTO product_subcategories (company_id, category_id, name, normalized_name, slug, accessory_class, default_warranty_policy_id, sort_order, is_active)
     VALUES
       ($1::uuid, $2::uuid, 'Acessório eletrônico teste', 'acessorio eletronico teste', 'acessorio-eletronico-teste', 'durable', $3::uuid, 10, TRUE),
       ($1::uuid, $2::uuid, 'Acessório simples teste', 'acessorio simples teste', 'acessorio-simples-teste', 'non_durable', NULL, 20, TRUE),
       ($1::uuid, $2::uuid, 'Acessório sem padrão teste', 'acessorio sem padrao teste', 'acessorio-sem-padrao-teste', NULL, NULL, 30, TRUE)`,
    [companyId, category.id, policy3mId]
  )
  const catalog = await scalar<{ id: string }>(
    client,
    `INSERT INTO product_catalog (category, brand, model, variant, storage, color)
     VALUES ('accessories', 'Teste', 'Acessório local', NULL, NULL, NULL)
     RETURNING id`
  )
  return {
    accessoriesCatalogId: catalog.id,
    durableAccessoryName: "acessorio eletronico teste",
    nonDurableAccessoryName: "acessorio simples teste",
    unclassifiedAccessoryName: "acessorio sem padrao teste",
  }
}

async function seedWarrantyPolicies(client: Client, companyId: string) {
  const policy6m = await scalar<{ id: string }>(
    client,
    `INSERT INTO warranty_policies (
       company_id, name, product_type, product_condition, product_origin,
       default_months, default_days, calculation_mode, warranty_nature,
       public_label_template, internal_description, requires_customer_identification,
       applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
       active, is_selectable, is_default, selection_label, selection_description,
       priority, effective_from
     ) VALUES (
       $1::uuid, 'Garantia Nobretech - Seminovo', 'device', 'used', NULL,
       6, NULL, 'calendar_months', 'contractual',
       '6 meses de Garantia Nobretech', $2, TRUE,
       TRUE, FALSE, FALSE, FALSE,
       TRUE, TRUE, TRUE, '6 meses Nobretech', 'Garantia contratual Nobretech para aparelho seminovo aprovado.',
       10, NOW()
     )
     RETURNING id`,
    [companyId, `${TAG} policy 6m`]
  )

  const policy3m = await scalar<{ id: string }>(
    client,
    `INSERT INTO warranty_policies (
       company_id, name, product_type, product_condition, product_origin,
       default_months, default_days, calculation_mode, warranty_nature,
       public_label_template, internal_description, requires_customer_identification,
       applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
       active, is_selectable, is_default, selection_label, selection_description,
       priority, effective_from
     ) VALUES (
       $1::uuid, 'Garantia Nobretech - Seminovo 3 meses', 'device', 'used', NULL,
       3, NULL, 'calendar_months', 'contractual',
       '3 meses de Garantia Nobretech', $2, TRUE,
       TRUE, FALSE, FALSE, FALSE,
       TRUE, TRUE, FALSE, '3 meses Nobretech', 'Garantia contratual Nobretech reduzida para casos especificos.',
       20, NOW()
     )
     RETURNING id`,
    [companyId, `${TAG} policy 3m`]
  )

  const policyApple12m = await scalar<{ id: string }>(
    client,
    `INSERT INTO warranty_policies (
       company_id, name, product_type, product_condition, product_origin,
       default_months, default_days, calculation_mode, warranty_nature,
       public_label_template, internal_description, requires_customer_identification,
       applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
       active, is_selectable, is_default, selection_label, selection_description,
       priority, effective_from
     ) VALUES (
       $1::uuid, 'Garantia Apple - Lacrado', 'device', 'sealed', NULL,
       12, NULL, 'calendar_months', 'manufacturer',
       'Garantia Apple', $2, FALSE,
       TRUE, FALSE, TRUE, TRUE,
       TRUE, TRUE, FALSE, 'Garantia Apple (12 meses)', 'Cobertura padrão do fabricante para Apple lacrado.',
       5, NOW()
     )
     RETURNING id`,
    [companyId, `${TAG} policy Apple 12m`]
  )

  await client.query(
    `INSERT INTO warranty_policy_terms (warranty_policy_id, term_type, title, body, sort_order)
     VALUES
       ($1::uuid, 'coverage', 'Cobertura local 6m', 'Termo local 6m para smoke de garantia por item.', 10),
       ($2::uuid, 'coverage', 'Cobertura local 3m', 'Termo local 3m para smoke de garantia por item.', 10),
       ($3::uuid, 'coverage', 'Cobertura Apple local', 'Termo local de garantia fabricante Apple.', 10)`,
    [policy6m.id, policy3m.id, policyApple12m.id]
  )

  return { policy6mId: policy6m.id, policy3mId: policy3m.id, policyApple12mId: policyApple12m.id }
}

async function seedInventory(
  client: Client,
  ctx: SeedContext,
  input: { name: string; productType: "device" | "accessory"; quantity: number; hasSerial?: boolean; price?: number; accessoryClass?: "durable" | "non_durable" | null; grade?: string }
): Promise<InventorySeed> {
  let accessoryClassName: string | null = null
  if (input.productType === "accessory") {
    if (input.accessoryClass === null) {
      accessoryClassName = ctx.unclassifiedAccessoryName
    } else if (input.accessoryClass === "non_durable") {
      accessoryClassName = ctx.nonDurableAccessoryName
    } else {
      accessoryClassName = ctx.durableAccessoryName
    }
  }
  const row = await scalar<{ id: string }>(
    client,
    `INSERT INTO inventory (
       company_id, catalog_id, imei, serial_number, grade, condition_notes, purchase_price, purchase_date,
       type, origin, suggested_price, status, quantity, product_type, category_name_snapshot, subcategory_name_snapshot,
       logistics_status, commercial_status, notes
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $14, $5, $6, $7::date,
       'own', 'purchase', $8, 'active', $9, $10, $11, $12,
       'in_stock', 'available', $13
     )
     RETURNING id`,
    [
      ctx.companyId,
      input.productType === "accessory" ? ctx.accessoriesCatalogId : ctx.appleCatalogId,
      input.hasSerial ? randomUUID().replace(/-/g, "").slice(0, 15) : null,
      input.hasSerial ? randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase() : null,
      `${TAG} ${input.name}`,
      input.price || 500,
      today(),
      (input.price || 500) * 1.4,
      input.quantity,
      input.productType,
      input.productType === "accessory" ? "Acessórios" : null,
      accessoryClassName,
      `${TAG} ${input.name}`,
      input.grade || "A",
    ]
  )
  return { id: row.id, name: input.name }
}

async function seedVariant(client: Client, ctx: SeedContext, inventoryId: string, colorName: string, quantity: number) {
  return scalar<{ id: string }>(
    client,
    `INSERT INTO inventory_item_variants (company_id, inventory_id, color_name, color_hex, quantity, unit_cost, suggested_price)
     VALUES ($1::uuid, $2::uuid, $3, '#111111', $4, 50, 100)
     RETURNING id`,
    [ctx.companyId, inventoryId, colorName, quantity]
  )
}

function salePayload(input: {
  ctx: SeedContext
  main: InventorySeed
  total: number
  saleStatus?: "completed" | "reserved"
  isReservation?: boolean
  warrantySelections?: unknown
  warrantyStart?: string
  warrantyEnd?: string
  customerType?: "identified" | "walk_in"
  walkInLabel?: string | null
  walkInPhone?: string | null
  walkInNotes?: string | null
  paymentMethod?: string
  paymentStatus?: string
  paymentDueDate?: string
  quantity?: number
  selectedVariantId?: string | null
  selectedVariantName?: string | null
  additionalItems?: Array<{
    itemId: string
    name: string
    type: "upsell" | "free"
    cost: number
    salePrice: number
    qty: number
    selectedVariantId?: string | null
    selectedVariantName?: string | null
  }>
}) {
  const date = today()
  const customerType = input.customerType || "identified"
  const paymentMethod = input.paymentMethod || "pix"
  const paymentStatus = input.paymentStatus || "received"
  const paymentDueDate = input.paymentDueDate || date
  const saleStatus = input.saleStatus || "completed"
  return {
    inventoryId: input.main.id,
    customerType,
    customerId: customerType === "walk_in" ? null : input.ctx.customerId,
    customerName: customerType === "walk_in" ? input.walkInLabel || "Cliente avulso" : `Cliente ${TAG}`,
    walkInLabel: customerType === "walk_in" ? input.walkInLabel || "Cliente avulso" : null,
    walkInPhone: customerType === "walk_in" ? input.walkInPhone || null : null,
    walkInNotes: customerType === "walk_in" ? input.walkInNotes || null : null,
    finalTotal: input.total,
    netAmount: input.total,
    cardFeePct: 0,
    paymentMethod,
    warrantyMonths: 3,
    warrantyStart: input.warrantyStart || date,
    warrantyEnd: input.warrantyEnd || addMonths(input.warrantyStart || date, 3),
    sourceType: "own",
    saleStatus,
    paymentDueDate,
    saleDate: date,
    saleOrigin: "local_stock_test",
    packagingType: "nobretech_box",
    packagingNotes: TAG,
    notes: input.quantity && input.quantity > 1 ? `[${input.quantity}x ${input.main.name}]\n${TAG}` : TAG,
    quantity: input.quantity || 1,
    productName: input.main.name,
    selectedVariantId: input.selectedVariantId || null,
    selectedVariantName: input.selectedVariantName || null,
    selectedVariantColorHex: null,
    isReservation: input.isReservation ?? saleStatus === "reserved",
    additionalItems: input.additionalItems || [],
    ...(input.warrantySelections !== undefined ? { warrantySelections: input.warrantySelections } : {}),
    payments: [
      {
        paymentMethod,
        amount: input.total,
        status: paymentStatus,
        dueDate: paymentDueDate,
        financialAccountId: input.ctx.accountId,
        notes: TAG,
      },
    ],
  }
}

function testHeaders(ctx: SeedContext) {
  return new Headers({
    "content-type": "application/json",
    "x-debug-atomic-sale-test": LOCAL_TOKEN,
    "x-debug-company-id": ctx.companyId,
    "x-debug-user-id": ctx.userId,
    "x-debug-user-email": `estoque-${ctx.userId}@nobretech.test`,
  })
}

async function callSalesPost(ctx: SeedContext, payload: unknown): Promise<SaleResponse> {
  const { POST } = await import("../src/app/api/sales/route")
  const response = await POST(
    new Request("http://localhost/api/sales", {
      method: "POST",
      headers: testHeaders(ctx),
      body: JSON.stringify(payload),
    }) as never
  )
  return { status: response.status, body: await response.json() }
}

async function callCancel(ctx: SeedContext, saleId: string) {
  return callReservationAction(ctx, saleId, "cancel")
}

async function callComplete(ctx: SeedContext, saleId: string) {
  return callReservationAction(ctx, saleId, "complete")
}

async function callReservationAction(ctx: SeedContext, saleId: string, action: "cancel" | "complete") {
  const { POST } = await import("../src/app/api/sales/[id]/reservation/route")
  const response = await POST(
    new Request(`http://localhost/api/sales/${saleId}/reservation`, {
      method: "POST",
      headers: testHeaders(ctx),
      body: JSON.stringify({ action }),
    }),
    { params: { id: saleId } }
  )
  return { status: response.status, body: await response.json() }
}

async function inventoryState(client: Client, inventoryId: string) {
  return scalar<{
    id: string
    status: string
    quantity: string
    product_type: string | null
    imei: string | null
    serial_number: string | null
    catalog_id: string | null
    logistics_status: string | null
    commercial_status: string | null
  }>(
    client,
    `SELECT id, status, quantity::text, product_type, imei, serial_number, catalog_id, logistics_status, commercial_status
     FROM inventory
     WHERE id = $1::uuid`,
    [inventoryId]
  )
}

async function saleWarrantySummary(client: Client, saleId: string) {
  return scalar<{
    sale_status: string
    warranty_months: string
    warranty_start: string
    warranty_end: string
    sale_items_count: string
    warranties_count: string
    warranty_duration_months: string | null
    warranty_policy_id: string | null
    warranty_starts_at: string | null
    policy_snapshot_id: string | null
    terms_snapshot_count: string | null
  }>(
    client,
    `SELECT
       s.sale_status,
       s.warranty_months::text,
       s.warranty_start::text,
       s.warranty_end::text,
       (SELECT COUNT(*)::text FROM sale_items WHERE sale_id = s.id AND active = TRUE) AS sale_items_count,
       (SELECT COUNT(*)::text FROM sale_item_warranties WHERE sale_id = s.id AND active = TRUE) AS warranties_count,
       (SELECT duration_months::text FROM sale_item_warranties WHERE sale_id = s.id AND active = TRUE ORDER BY created_at ASC LIMIT 1) AS warranty_duration_months,
       (SELECT warranty_policy_id::text FROM sale_item_warranties WHERE sale_id = s.id AND active = TRUE ORDER BY created_at ASC LIMIT 1) AS warranty_policy_id,
       (SELECT starts_at::date::text FROM sale_item_warranties WHERE sale_id = s.id AND active = TRUE ORDER BY created_at ASC LIMIT 1) AS warranty_starts_at,
       (SELECT policy_snapshot->>'warranty_policy_id' FROM sale_item_warranties WHERE sale_id = s.id AND active = TRUE ORDER BY created_at ASC LIMIT 1) AS policy_snapshot_id,
       (SELECT jsonb_array_length(terms_snapshot)::text FROM sale_item_warranties WHERE sale_id = s.id AND active = TRUE ORDER BY created_at ASC LIMIT 1) AS terms_snapshot_count
     FROM sales s
     WHERE s.id = $1::uuid`,
    [saleId]
  )
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isAvailableLegacyStatus(status: string | null) {
  return status === "active" || status === "in_stock"
}

async function cleanupCreatedTestCompany(client: Client, tracker: TestRunTracker) {
  if (!tracker.companyId) {
    console.log("Cleanup: nenhuma empresa de teste foi criada antes da falha.")
    return
  }

  const company = await scalar<{ id: string; slug: string } | undefined>(
    client,
    "SELECT id, slug FROM companies WHERE id = $1::uuid",
    [tracker.companyId]
  )

  if (!company?.id) {
    console.log(`Cleanup: empresa de teste ${tracker.companyId} ja nao existe.`)
    return
  }

  if (!company.slug.startsWith("teste-estoque-venda-local-")) {
    throw new Error(`Cleanup abortado: slug inesperado para empresa ${tracker.companyId}.`)
  }

  await client.query("BEGIN")
  try {
    await client.query(
      "DELETE FROM audit_logs WHERE company_id = $1::uuid",
      [tracker.companyId]
    )
    const deleted = await client.query(
      "DELETE FROM companies WHERE id = $1::uuid AND slug LIKE 'teste-estoque-venda-local-%'",
      [tracker.companyId]
    )
    if ((deleted.rowCount ?? 0) !== 1) {
      throw new Error(`Cleanup abortado: DELETE da empresa de teste afetou ${deleted.rowCount ?? 0} linhas.`)
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }

  const leftovers = await scalar<{ leftover_count: string }>(
    client,
    `
      SELECT (
        (SELECT COUNT(*) FROM companies WHERE id = $1::uuid) +
        (SELECT COUNT(*) FROM users WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM customers WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM finance_accounts WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM financial_settings WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM inventory WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM inventory_item_variants WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM sales WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM sales_additional_items WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM sale_payments WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM transactions WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM financial_account_movements WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM sale_items WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM sale_item_warranties WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM warranty_policies WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM warranties WHERE company_id = $1::uuid) +
        (SELECT COUNT(*) FROM audit_logs WHERE company_id = $1::uuid)
      )::text AS leftover_count
    `,
    [tracker.companyId]
  )

  if (leftovers.leftover_count !== "0") {
    throw new Error(`Cleanup incompleto: ${leftovers.leftover_count} registro(s) da empresa de teste permaneceram.`)
  }

  console.log(`Cleanup: empresa de teste ${tracker.companyId} removida sem sobras rastreadas.`)
}

async function main() {
  const databaseUrl = validateLocalDatabaseUrl()
  const client = new Client({ connectionString: databaseUrl })
  const tracker: TestRunTracker = { companyId: null }
  let testFailure: unknown = null
  let cleanupFailure: unknown = null
  await client.connect()

  try {
    const ctx = await seedBase(client, tracker)
    console.log(`Banco local: ${databaseUrl}`)
    console.log(`Empresa de teste: ${ctx.companyId}`)
    console.log(`Policies de garantia: 6m=${ctx.policy6mId} 3m=${ctx.policy3mId} apple12m=${ctx.policyApple12mId}`)

    const sealedAppleItem = await seedInventory(client, ctx, {
      name: "iPhone lacrado fabricante 12m",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 4200,
      grade: "Lacrado",
    })
    const sealedAppleSale = await callSalesPost(ctx, salePayload({ ctx, main: sealedAppleItem, total: 5200 }))
    assert(
      sealedAppleSale.status === 200 && sealedAppleSale.body.data?.saleId,
      sealedAppleSale.body.error?.message || `Venda Apple lacrado HTTP ${sealedAppleSale.status}`
    )
    const sealedAppleWarranty = await saleWarrantySummary(client, sealedAppleSale.body.data.saleId)
    console.log("GARANTIA Apple lacrado 12m", sealedAppleWarranty)
    assert(sealedAppleWarranty.warranties_count === "1", "Apple lacrado deveria criar garantia de fabricante")
    assert(sealedAppleWarranty.warranty_duration_months === "12", "Apple lacrado deveria criar garantia 12m")
    assert(sealedAppleWarranty.warranty_policy_id === ctx.policyApple12mId, "Apple lacrado deveria usar policy fabricante 12m")

    const effectiveDefaultItem = await seedInventory(client, ctx, {
      name: "iPhone garantia default 6m",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 3000,
    })
    const effectiveDefaultSale = await callSalesPost(ctx, salePayload({ ctx, main: effectiveDefaultItem, total: 4300 }))
    assert(
      effectiveDefaultSale.status === 200 && effectiveDefaultSale.body.data?.saleId,
      effectiveDefaultSale.body.error?.message || `Venda garantia default HTTP ${effectiveDefaultSale.status}`
    )
    const effectiveDefaultWarranty = await saleWarrantySummary(client, effectiveDefaultSale.body.data.saleId)
    console.log("GARANTIA venda efetivada default", effectiveDefaultWarranty)
    assert(effectiveDefaultWarranty.sale_status === "completed", "Venda default deveria estar completed")
    assert(effectiveDefaultWarranty.sale_items_count === "1", "Venda default nao materializou sale_items")
    assert(effectiveDefaultWarranty.warranties_count === "1", "Venda default nao criou sale_item_warranty")
    assert(effectiveDefaultWarranty.warranty_duration_months === "6", "Venda default nao criou garantia de 6 meses")
    assert(effectiveDefaultWarranty.warranty_policy_id === ctx.policy6mId, "Venda default nao usou policy 6m")
    assert(effectiveDefaultWarranty.policy_snapshot_id === ctx.policy6mId, "Venda default nao salvou snapshot da policy 6m")
    assert(Number(effectiveDefaultWarranty.terms_snapshot_count || 0) > 0, "Venda default nao salvou terms_snapshot")
    assert(effectiveDefaultWarranty.warranty_start === today(), "Legado warranty_start mudou inesperadamente")
    assert(effectiveDefaultWarranty.warranty_starts_at === today(), "Garantia por item deveria iniciar em saleDate")

    const effective3mItem = await seedInventory(client, ctx, {
      name: "iPhone garantia manual 3m",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 2800,
    })
    const effective3mSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: effective3mItem,
        total: 3900,
        warrantySelections: { main: { warrantyPolicyId: ctx.policy3mId, manualSelection: true } },
      })
    )
    assert(
      effective3mSale.status === 200 && effective3mSale.body.data?.saleId,
      effective3mSale.body.error?.message || `Venda garantia 3m HTTP ${effective3mSale.status}`
    )
    const effective3mWarranty = await saleWarrantySummary(client, effective3mSale.body.data.saleId)
    console.log("GARANTIA venda efetivada 3m", effective3mWarranty)
    assert(effective3mWarranty.warranties_count === "1", "Venda 3m nao criou sale_item_warranty")
    assert(effective3mWarranty.warranty_duration_months === "3", "Venda 3m nao criou garantia de 3 meses")
    assert(effective3mWarranty.warranty_policy_id === ctx.policy3mId, "Venda 3m nao usou policy 3m")
    assert(effective3mWarranty.policy_snapshot_id === ctx.policy3mId, "Venda 3m nao salvou snapshot da policy 3m")
    assert(Number(effective3mWarranty.terms_snapshot_count || 0) > 0, "Venda 3m nao salvou terms_snapshot")

    const explicitNullItem = await seedInventory(client, ctx, {
      name: "iPhone garantia nula",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 2400,
    })
    const explicitNullSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: explicitNullItem,
        total: 3300,
        warrantySelections: { main: { warrantyPolicyId: null } },
      })
    )
    assert(
      explicitNullSale.status === 200 && explicitNullSale.body.data?.saleId,
      explicitNullSale.body.error?.message || `Venda garantia null HTTP ${explicitNullSale.status}`
    )
    const explicitNullWarranty = await saleWarrantySummary(client, explicitNullSale.body.data.saleId)
    console.log("GARANTIA venda efetivada null", explicitNullWarranty)
    assert(explicitNullWarranty.sale_items_count === "1", "Venda null nao materializou sale_items")
    assert(explicitNullWarranty.warranties_count === "0", "Venda null nao deveria criar garantia por item")

    const invalidPolicyItem = await seedInventory(client, ctx, {
      name: "iPhone garantia uuid invalido",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 2200,
    })
    const invalidPolicySale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: invalidPolicyItem,
        total: 3100,
        warrantySelections: { main: { warrantyPolicyId: "uuid-invalido" } },
      })
    )
    console.log("GARANTIA uuid invalido", invalidPolicySale)
    assert(invalidPolicySale.status === 400, "UUID invalido deveria bloquear venda efetivada")
    assert(/garantia/i.test(invalidPolicySale.body.error?.message || ""), "UUID invalido deveria retornar erro claro de garantia")
    const invalidPolicyAfter = await inventoryState(client, invalidPolicyItem.id)
    assert(Number(invalidPolicyAfter.quantity) === 1, "Venda com UUID invalido nao deveria baixar estoque")

    const reservedItem = await seedInventory(client, ctx, {
      name: "iPhone reserva sem garantia",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 2600,
    })
    const reservedSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: reservedItem,
        total: 3600,
        saleStatus: "reserved",
        isReservation: true,
        warrantySelections: { main: { warrantyPolicyId: "uuid-invalido" } },
      })
    )
    assert(
      reservedSale.status === 200 && reservedSale.body.data?.saleId,
      reservedSale.body.error?.message || `Reserva HTTP ${reservedSale.status}`
    )
    const reservedWarranty = await saleWarrantySummary(client, reservedSale.body.data.saleId)
    const reservedAfter = await inventoryState(client, reservedItem.id)
    console.log("GARANTIA reserva", { sale: reservedWarranty, inventory: reservedAfter, api: reservedSale.body.data })
    assert(reservedWarranty.sale_status === "reserved", "Reserva nao persistiu sale_status=reserved")
    assert(reservedWarranty.sale_items_count === "1", "Reserva nao materializou sale_items")
    assert(reservedWarranty.warranties_count === "0", "Reserva nao deveria criar sale_item_warranties")
    assert(reservedSale.body.data.warrantyApplied?.created === 0, "API deveria reportar zero garantias criadas na reserva")
    assert(reservedAfter.status === "reserved", "Reserva nao marcou estoque como reserved")
    assert(reservedAfter.commercial_status === "reserved", "Reserva nao marcou commercial_status=reserved")

    const reservedComplete = await callComplete(ctx, reservedSale.body.data.saleId)
    assert(reservedComplete.status === 200, reservedComplete.body.error?.message || `Efetivacao reserva HTTP ${reservedComplete.status}`)
    const reservedCompletedWarranty = await saleWarrantySummary(client, reservedSale.body.data.saleId)
    console.log("GARANTIA reserva efetivada", { sale: reservedCompletedWarranty, api: reservedComplete.body })
    assert(reservedCompletedWarranty.sale_status === "completed", "Reserva efetivada nao virou completed")
    assert(reservedCompletedWarranty.sale_items_count === "1", "Reserva efetivada perdeu sale_items")
    assert(reservedCompletedWarranty.warranties_count === "1", "Reserva efetivada nao criou sale_item_warranty")
    assert(reservedCompletedWarranty.warranty_duration_months === "6", "Reserva efetivada deveria aplicar default 6m")
    assert(reservedCompletedWarranty.warranty_policy_id === ctx.policy6mId, "Reserva efetivada nao usou policy default 6m")
    assert(reservedCompletedWarranty.policy_snapshot_id === ctx.policy6mId, "Reserva efetivada nao salvou snapshot da policy 6m")
    assert(Number(reservedCompletedWarranty.terms_snapshot_count || 0) > 0, "Reserva efetivada nao salvou terms_snapshot")
    assert(reservedCompletedWarranty.warranty_starts_at === today(), "Reserva efetivada deveria iniciar garantia em saleDate")
    assert(reservedCompletedWarranty.warranty_start === today(), "Legado warranty_start mudou na efetivacao")

    const reservedCompleteAgain = await callComplete(ctx, reservedSale.body.data.saleId)
    assert(reservedCompleteAgain.status === 200, reservedCompleteAgain.body.error?.message || `Reefetivacao reserva HTTP ${reservedCompleteAgain.status}`)
    const reservedAfterSecondComplete = await saleWarrantySummary(client, reservedSale.body.data.saleId)
    console.log("GARANTIA reserva efetivada novamente", { sale: reservedAfterSecondComplete, api: reservedCompleteAgain.body })
    assert(reservedAfterSecondComplete.warranties_count === "1", "Efetivacao repetida duplicou garantia por item")

    const reserved3mItem = await seedInventory(client, ctx, {
      name: "iPhone reserva com escolha 3m nao preservada",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 2500,
    })
    const reserved3mSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: reserved3mItem,
        total: 3500,
        saleStatus: "reserved",
        isReservation: true,
        warrantySelections: { main: { warrantyPolicyId: ctx.policy3mId, manualSelection: true } },
      })
    )
    assert(reserved3mSale.status === 200 && reserved3mSale.body.data?.saleId, reserved3mSale.body.error?.message || `Reserva 3m HTTP ${reserved3mSale.status}`)
    const reserved3mBeforeComplete = await saleWarrantySummary(client, reserved3mSale.body.data.saleId)
    assert(reserved3mBeforeComplete.warranties_count === "0", "Reserva 3m nao deveria criar garantia na criacao")
    const reserved3mComplete = await callComplete(ctx, reserved3mSale.body.data.saleId)
    assert(reserved3mComplete.status === 200, reserved3mComplete.body.error?.message || `Efetivacao reserva 3m HTTP ${reserved3mComplete.status}`)
    const reserved3mAfterComplete = await saleWarrantySummary(client, reserved3mSale.body.data.saleId)
    console.log("GARANTIA reserva 3m efetivada com default", { sale: reserved3mAfterComplete, api: reserved3mComplete.body })
    assert(reserved3mAfterComplete.warranties_count === "1", "Reserva 3m efetivada nao criou garantia")
    assert(reserved3mAfterComplete.warranty_duration_months === "6", "Escolha 3m da reserva nao e preservada; efetivacao deve aplicar default 6m")
    assert(reserved3mAfterComplete.warranty_policy_id === ctx.policy6mId, "Reserva 3m efetivada deveria usar default 6m por ausencia de persistencia da escolha")

    const durableAccessory = await seedInventory(client, ctx, {
      name: "Caneta eletronica duravel",
      productType: "accessory",
      quantity: 2,
      price: 180,
      accessoryClass: "durable",
    })
    const durableAccessorySale = await callSalesPost(ctx, salePayload({ ctx, main: durableAccessory, total: 320 }))
    assert(durableAccessorySale.status === 200 && durableAccessorySale.body.data?.saleId, durableAccessorySale.body.error?.message || `Venda acessorio duravel HTTP ${durableAccessorySale.status}`)
    const durableAccessoryWarranty = await saleWarrantySummary(client, durableAccessorySale.body.data.saleId)
    console.log("GARANTIA acessorio duravel", durableAccessoryWarranty)
    assert(durableAccessoryWarranty.warranties_count === "1", "Acessorio durable deveria criar garantia contratual")
    assert(durableAccessoryWarranty.warranty_duration_months === "3", "Acessorio durable deveria criar garantia 3m")
    assert(durableAccessoryWarranty.warranty_policy_id === ctx.policy3mId, "Acessorio durable deveria usar policy 3m")

    const nonDurableAccessory = await seedInventory(client, ctx, {
      name: "Película simples non durable",
      productType: "accessory",
      quantity: 2,
      price: 25,
      accessoryClass: "non_durable",
    })
    const nonDurableAccessorySale = await callSalesPost(ctx, salePayload({ ctx, main: nonDurableAccessory, total: 80 }))
    assert(nonDurableAccessorySale.status === 200 && nonDurableAccessorySale.body.data?.saleId, nonDurableAccessorySale.body.error?.message || `Venda acessorio non_durable HTTP ${nonDurableAccessorySale.status}`)
    const nonDurableAccessoryWarranty = await saleWarrantySummary(client, nonDurableAccessorySale.body.data.saleId)
    console.log("GARANTIA acessorio non_durable", nonDurableAccessoryWarranty)
    assert(nonDurableAccessoryWarranty.warranties_count === "0", "Acessorio non_durable nao deveria criar garantia contratual")

    const unclassifiedAccessory = await seedInventory(client, ctx, {
      name: "Acessorio sem garantia padrao",
      productType: "accessory",
      quantity: 1,
      price: 100,
      accessoryClass: null,
    })
    const unclassifiedAccessorySale = await callSalesPost(ctx, salePayload({ ctx, main: unclassifiedAccessory, total: 170 }))
    assert(unclassifiedAccessorySale.status === 200 && unclassifiedAccessorySale.body.data?.saleId, unclassifiedAccessorySale.body.error?.message || `Venda acessorio sem garantia padrao HTTP ${unclassifiedAccessorySale.status}`)
    const unclassifiedAccessoryWarranty = await saleWarrantySummary(client, unclassifiedAccessorySale.body.data.saleId)
    console.log("GARANTIA acessorio sem garantia padrao", unclassifiedAccessoryWarranty)
    assert(unclassifiedAccessoryWarranty.warranties_count === "0", "Acessorio sem policy padrao nao deveria criar garantia contratual")

    const { getCatalogPublicationReadiness } = await import("../src/lib/catalog/readiness")
    const accessoryReadiness = getCatalogPublicationReadiness({
      productKind: "seminovo",
      productType: "accessory",
      inventoryStatus: "active",
      publication: { id: randomUUID(), inventory_item_id: unclassifiedAccessory.id, is_published: false, public_status: "draft", public_title: "Acessório", public_description: null, public_price: 170, promo_price: null, installment_count: 10, show_installments: true, highlight: false, cover_image_id: null, notes_internal: null, published_at: null, created_at: today(), updated_at: today() },
      review: null,
      includedItems: [],
      images: [{ id: randomUUID(), product_id: unclassifiedAccessory.id, image_url: "https://example.com/a.jpg", thumbnail_url: "https://example.com/a.jpg", source: "uploaded", is_primary: true, sort_order: 0, alt: null, created_at: today() }],
      hasRealPhotos: true,
    })
    assert(!accessoryReadiness.reasons.some((reason) => /classifica/i.test(reason)), "Readiness nao deve vazar classificacao tecnica")

    const customersBeforeWalkIn = await scalar<{ count: string }>(
      client,
      "SELECT COUNT(*)::text AS count FROM customers WHERE company_id = $1::uuid",
      [ctx.companyId]
    )
    const walkInAccessory = await seedInventory(client, ctx, {
      name: "Capa Y para iPad",
      productType: "accessory",
      quantity: 4,
      price: 38.49,
    })
    const walkInSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: walkInAccessory,
        total: 90,
        customerType: "walk_in",
        walkInLabel: "Cliente balcão",
        walkInPhone: null,
        walkInNotes: "Venda avulsa local de acessório",
      })
    )
    assert(walkInSale.status === 200 && walkInSale.body.data?.saleId, walkInSale.body.error?.message || `Venda avulsa HTTP ${walkInSale.status}`)
    const walkInAfterSale = await inventoryState(client, walkInAccessory.id)
    const walkInPersisted = await scalar<{
      customer_id: string | null
      customer_type: string
      walk_in_label: string | null
      public_access_enabled: boolean | null
      public_access_token: string | null
      payments_count: string
      transactions_count: string
      movements_count: string
      customers_count: string
      unit_cost: string
      gross_profit: string
    }>(
      client,
      `SELECT
         s.customer_id,
         s.customer_type,
         s.walk_in_label,
         s.public_access_enabled,
         s.public_access_token,
         (SELECT COUNT(*)::text FROM sale_payments WHERE sale_id = s.id) AS payments_count,
         (SELECT COUNT(*)::text FROM transactions WHERE source_type = 'sale_payment' AND notes = $2) AS transactions_count,
         (SELECT COUNT(*)::text FROM financial_account_movements fam JOIN transactions t ON t.id = fam.source_id WHERE fam.source = 'account_receivable' AND t.notes = $2) AS movements_count,
         (SELECT COUNT(*)::text FROM customers WHERE company_id = s.company_id) AS customers_count,
         i.purchase_price::text AS unit_cost,
         (s.sale_price - i.purchase_price)::text AS gross_profit
       FROM sales s
       JOIN inventory i ON i.id = s.inventory_id
       WHERE s.id = $1::uuid`,
      [walkInSale.body.data.saleId, `sale_id:${walkInSale.body.data.saleId}`]
    )
    console.log("DEPOIS venda avulsa acessorio", { inventory: walkInAfterSale, sale: walkInPersisted })
    assert(walkInPersisted.customer_id === null, "Venda avulsa nao deveria vincular customer_id")
    assert(walkInPersisted.customer_type === "walk_in", "Venda avulsa nao persistiu customer_type=walk_in")
    assert(walkInPersisted.walk_in_label === "Cliente balcão", "Venda avulsa nao persistiu label opcional")
    assert(walkInPersisted.public_access_enabled === false, "Venda avulsa nao deveria habilitar portal publico")
    assert(walkInPersisted.public_access_token === null, "Venda avulsa nao deveria gerar token publico")
    assert(Number(walkInAfterSale.quantity) === 3, "Venda avulsa de acessorio nao baixou uma unidade")
    assert(walkInAfterSale.commercial_status === "available", "Acessorio avulso com saldo deveria continuar disponivel")
    assert(walkInPersisted.payments_count === "1", "Venda avulsa nao criou sale_payment")
    assert(walkInPersisted.transactions_count === "1", "Venda avulsa nao criou transaction financeira")
    assert(walkInPersisted.movements_count === "1", "Venda avulsa pix recebido nao sincronizou extrato")
    assert(walkInPersisted.customers_count === customersBeforeWalkIn.count, "Venda avulsa criou cliente indevido")
    assert(Math.abs(Number(walkInPersisted.unit_cost) - 38.49) < 0.01, "Venda avulsa nao preservou custo unitario da Capa Y")
    assert(Math.abs(Number(walkInPersisted.gross_profit) - 51.51) < 0.01, "Lucro bruto da Capa Y avulsa nao bate com venda-custo")

    const walkInCardAccessory = await seedInventory(client, ctx, {
      name: "Adaptador USB-C avulso",
      productType: "accessory",
      quantity: 2,
      price: 45,
    })
    const walkInCardSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: walkInCardAccessory,
        total: 120,
        customerType: "walk_in",
        walkInLabel: "João da rua",
        paymentMethod: "credit_3x",
        paymentStatus: "pending",
        paymentDueDate: addMonths(today(), 1),
      })
    )
    assert(walkInCardSale.status === 200 && walkInCardSale.body.data?.saleId, walkInCardSale.body.error?.message || `Venda avulsa cartao HTTP ${walkInCardSale.status}`)
    const walkInCardFinance = await scalar<{ payment_status: string; transaction_status: string; transaction_count: string }>(
      client,
      `SELECT
         sp.status AS payment_status,
         t.status AS transaction_status,
         (SELECT COUNT(*)::text FROM transactions WHERE notes = $2) AS transaction_count
       FROM sale_payments sp
       LEFT JOIN transactions t ON t.source_type = 'sale_payment' AND t.source_id = sp.id
       WHERE sp.sale_id = $1::uuid
       LIMIT 1`,
      [walkInCardSale.body.data.saleId, `sale_id:${walkInCardSale.body.data.saleId}`]
    )
    console.log("DEPOIS venda avulsa cartao parcelado", walkInCardFinance)
    assert(walkInCardFinance.payment_status === "pending", "Cartao avulso deveria manter sale_payment pendente")
    assert(walkInCardFinance.transaction_status === "pending", "Cartao avulso deveria gerar conta a receber pendente")
    assert(walkInCardFinance.transaction_count === "1", "Cartao avulso nao deveria duplicar transaction")

    const unit = await seedInventory(client, ctx, {
      name: "iPhone unitario",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 3000,
    })
    console.log("ANTES aparelho unitario", await inventoryState(client, unit.id))
    const unitSale = await callSalesPost(ctx, salePayload({ ctx, main: unit, total: 4200 }))
    assert(unitSale.status === 200 && unitSale.body.data?.saleId, unitSale.body.error?.message || `Venda aparelho HTTP ${unitSale.status}`)
    const unitAfterSale = await inventoryState(client, unit.id)
    console.log("DEPOIS venda aparelho unitario", unitAfterSale)
    assert(unitAfterSale.status === "sold", "Aparelho unitario nao ficou sold")
    assert(Number(unitAfterSale.quantity) === 0, "Aparelho unitario nao ficou quantity=0")
    assert(unitAfterSale.logistics_status === "unavailable", "Aparelho unitario nao ficou logistics_status=unavailable")
    assert(unitAfterSale.commercial_status === "sold", "Aparelho unitario nao ficou commercial_status=sold")

    const unitCancel = await callCancel(ctx, unitSale.body.data.saleId)
    assert(unitCancel.status === 200, unitCancel.body.error?.message || `Cancelamento aparelho HTTP ${unitCancel.status}`)
    const unitAfterCancel = await inventoryState(client, unit.id)
    console.log("DEPOIS cancelamento aparelho unitario", unitAfterCancel)
    assert(isAvailableLegacyStatus(unitAfterCancel.status), "Aparelho unitario nao voltou para status legado disponivel")
    assert(Number(unitAfterCancel.quantity) === 1, "Aparelho unitario nao voltou quantity=1")
    assert(unitAfterCancel.logistics_status === "in_stock", "Aparelho unitario nao voltou logistics_status=in_stock")
    assert(unitAfterCancel.commercial_status === "available", "Aparelho unitario nao voltou commercial_status=available")

    const secondCancel = await callCancel(ctx, unitSale.body.data.saleId)
    const unitAfterSecondCancel = await inventoryState(client, unit.id)
    console.log("SEGUNDO cancelamento aparelho unitario", { status: secondCancel.status, body: secondCancel.body, inventory: unitAfterSecondCancel })
    assert(secondCancel.status === 400, "Segundo cancelamento deveria falhar sem duplicar estoque")
    assert(Number(unitAfterSecondCancel.quantity) === 1, "Segundo cancelamento duplicou estoque")

    const variantMain = await seedInventory(client, ctx, {
      name: "Capa com variacao",
      productType: "accessory",
      quantity: 3,
      price: 80,
    })
    const black = await seedVariant(client, ctx, variantMain.id, "Preto", 2)
    await seedVariant(client, ctx, variantMain.id, "Azul", 1)
    const variantSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: variantMain,
        total: 150,
        selectedVariantId: black.id,
        selectedVariantName: "Preto",
      })
    )
    assert(variantSale.status === 200 && variantSale.body.data?.saleId, variantSale.body.error?.message || `Venda variacao HTTP ${variantSale.status}`)
    const variantAfterSale = await scalar<{ preto: string; total: string; commercial_status: string | null }>(
      client,
      `SELECT
         (SELECT quantity::text FROM inventory_item_variants WHERE id = $1::uuid) AS preto,
         i.quantity::text AS total,
         i.commercial_status
       FROM inventory i WHERE i.id = $2::uuid`,
      [black.id, variantMain.id]
    )
    console.log("DEPOIS venda variacao", variantAfterSale)
    assert(Number(variantAfterSale.preto) === 1, "Variacao preta nao baixou corretamente")
    assert(Number(variantAfterSale.total) === 2, "Total do item com variacao nao baixou corretamente")
    assert(variantAfterSale.commercial_status === "available", "Item com variacao ainda deveria estar disponivel com saldo")

    const variantCancel = await callCancel(ctx, variantSale.body.data.saleId)
    assert(variantCancel.status === 200, variantCancel.body.error?.message || `Cancelamento variacao HTTP ${variantCancel.status}`)
    const variantAfterCancel = await scalar<{ preto: string; total: string; commercial_status: string | null }>(
      client,
      `SELECT
         (SELECT quantity::text FROM inventory_item_variants WHERE id = $1::uuid) AS preto,
         i.quantity::text AS total,
         i.commercial_status
       FROM inventory i WHERE i.id = $2::uuid`,
      [black.id, variantMain.id]
    )
    console.log("DEPOIS cancelamento variacao", variantAfterCancel)
    assert(Number(variantAfterCancel.preto) === 2, "Variacao preta nao voltou corretamente")
    assert(Number(variantAfterCancel.total) === 3, "Total do item com variacao nao voltou corretamente")

    const mainForAdditional = await seedInventory(client, ctx, {
      name: "iPhone com adicional",
      productType: "device",
      quantity: 1,
      hasSerial: true,
      price: 2500,
    })
    const additional = await seedInventory(client, ctx, {
      name: "Pelicula sem variacao",
      productType: "accessory",
      quantity: 5,
      price: 20,
    })
    const additionalSale = await callSalesPost(
      ctx,
      salePayload({
        ctx,
        main: mainForAdditional,
        total: 3600,
        additionalItems: [{ itemId: additional.id, name: additional.name, type: "upsell", cost: 60, salePrice: 120, qty: 3 }],
      })
    )
    assert(additionalSale.status === 200 && additionalSale.body.data?.saleId, additionalSale.body.error?.message || `Venda adicional HTTP ${additionalSale.status}`)
    const additionalAfterSale = await inventoryState(client, additional.id)
    console.log("DEPOIS venda adicional sem variacao", additionalAfterSale)
    assert(Number(additionalAfterSale.quantity) === 2, "Adicional sem variacao nao baixou 3 unidades")
    assert(additionalAfterSale.commercial_status === "available", "Adicional sem variacao deveria seguir disponivel com saldo")

    const additionalCancel = await callCancel(ctx, additionalSale.body.data.saleId)
    assert(additionalCancel.status === 200, additionalCancel.body.error?.message || `Cancelamento adicional HTTP ${additionalCancel.status}`)
    const additionalAfterCancel = await inventoryState(client, additional.id)
    console.log("DEPOIS cancelamento adicional sem variacao", additionalAfterCancel)
    assert(Number(additionalAfterCancel.quantity) === 5, "Cancelamento nao devolveu quantidade inteira do adicional")
    assert(additionalAfterCancel.commercial_status === "available", "Adicional sem variacao nao voltou disponivel")

    console.log("PASSOU: baixa/restauracao de estoque local validada sem Railway.")
  } catch (error) {
    testFailure = error
  } finally {
    try {
      await cleanupCreatedTestCompany(client, tracker)
    } catch (error) {
      cleanupFailure = error
    }
    await client.end().catch(() => {})
    const db = await import("../src/lib/db").catch(() => null)
    await db?.pool.end().catch(() => {})
  }

  if (testFailure && cleanupFailure) {
    console.error("FALHOU tambem o cleanup seguro dos dados de teste")
    console.error(cleanupFailure)
    throw testFailure
  }
  if (cleanupFailure) throw cleanupFailure
  if (testFailure) throw testFailure
}

main().catch((error) => {
  console.error("FALHOU: validacao local de estoque/venda")
  console.error(error)
  process.exit(1)
})
