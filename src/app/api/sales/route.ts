export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { requireApiAuthContext, type AuthorizedAuthContext } from "@/lib/auth-context"
import { checkRateLimit } from "@/lib/rate-limit"
import { isFinancialPayment } from "@/lib/sale-payments"
import { formatPaymentMethod } from "@/lib/helpers"
import { syncTransactionMovement } from "@/lib/finance/sync-transaction-movement"
import { decrementInventoryVariantQuantity } from "@/lib/inventory/inventory-variants"
import { materializeSaleItemsWithClient } from "@/lib/sales/sale-items"
import {
  AccessoryClassificationRequiredError,
  applySaleWarranties,
  assertSaleAccessoriesClassified,
  type SaleWarrantySelections,
  type WarrantySelectionInput,
} from "@/lib/warranty"
import {
  SaleOperationalError,
  buildAdditionalItemStockPlan,
  validateFinancialAccountOwnership,
  type AdditionalItemStockPlan,
  type LockedInventoryForSale,
} from "@/lib/sales/atomic-sale-validation"

const MAX_BODY_BYTES = 64 * 1024
const LOCAL_ATOMIC_SALE_TEST_TOKEN = "TESTE_ATOMIC_SALE_LOCAL"

// --- Validation helpers ---

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function isLocalAtomicSaleTestRequest(request: NextRequest) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DATABASE_URL_TEST &&
    process.env.DATABASE_URL === process.env.DATABASE_URL_TEST &&
    request.headers.get("x-debug-atomic-sale-test") === LOCAL_ATOMIC_SALE_TEST_TOKEN
  )
}

async function resolveSalesApiAuthContext(request: NextRequest): ReturnType<typeof requireApiAuthContext> {
  if (!isLocalAtomicSaleTestRequest(request)) return requireApiAuthContext()

  const companyId = request.headers.get("x-debug-company-id")
  const appUserId = request.headers.get("x-debug-user-id")
  const email = request.headers.get("x-debug-user-email") || "atomic-sale-local@nobretech.test"

  if (!isUuid(companyId) || !isUuid(appUserId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { message: "Headers locais de teste inválidos." } },
        { status: 400 }
      ),
    }
  }

  const context: AuthorizedAuthContext = {
    status: "authorized",
    clerkUserId: `local:${appUserId}`,
    appUserId,
    email,
    fullName: "Teste Atomic Sale Local",
    role: "owner",
    avatarUrl: null,
    companyId,
    companyName: "NOBRETECH TESTE LOCAL",
    companySlug: "nobretech-teste-local",
  }

  return { ok: true, context }
}

function shouldForceLocalSaleFailure(request: NextRequest) {
  return (
    isLocalAtomicSaleTestRequest(request) &&
    request.headers.get("x-debug-force-sale-failure") === LOCAL_ATOMIC_SALE_TEST_TOKEN
  )
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function safeString(v: unknown, maxLen = 500): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s.slice(0, maxLen) : null
}

function safeDate(v: unknown): string | null {
  if (typeof v !== "string") return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return v
}

function safePositiveInt(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

// --- Input types ---

type ValidatedPayment = {
  paymentMethod: string
  amount: number
  status: string
  dueDate: string
  financialAccountId: string | null
  notes: string | null
}

type ValidatedTradeIn = {
  imei: string | null
  grade: string | null
  value: number
  photos: string[] | null
  modelName: string
  conditionNotes: string | null
  inventoryStatus: string
  overageHandling?: "credit" | "change"
  overageAmount: number
}

type ValidatedAdditionalItem = {
  itemId: string
  type: string
  name: string
  cost: number
  salePrice: number
  qty: number
  selectedVariantId: string | null
  selectedVariantName: string | null
  selectedVariantColorHex: string | null
}

type SaleVariantAllocation = {
  scope: "main" | "additional"
  inventoryId: string
  variantId: string
  variantName: string | null
  variantColorHex: string | null
  quantity: number
}

type SaleStockRestoration = {
  scope: "additional"
  inventoryId: string
  quantity: number
}

function stockStateForQuantity(quantity: number, emptyStockStatus: "sold" | "reserved") {
  if (quantity > 0) {
    return {
      status: "in_stock",
      logisticsStatus: "in_stock",
      commercialStatus: "available",
    }
  }

  if (emptyStockStatus === "reserved") {
    return {
      status: "reserved",
      logisticsStatus: "in_stock",
      commercialStatus: "reserved",
    }
  }

  return {
    status: "sold",
    logisticsStatus: "unavailable",
    commercialStatus: "sold",
  }
}

type ValidatedInput = {
  inventoryId: string
  customerType: "identified" | "walk_in"
  customerId: string | null
  customerName: string | null
  walkInLabel: string | null
  walkInPhone: string | null
  walkInNotes: string | null
  finalTotal: number
  netAmount: number
  cardFeePct: number
  paymentMethod: string | null
  warrantyMonths: number
  warrantyStart: string
  warrantyEnd: string
  sourceType: string
  supplierName: string | null
  supplierCost: number | null
  saleStatus: string
  paymentDueDate: string | null
  saleDate: string
  saleOrigin: string
  marketingCampaignId: string | null
  marketingLeadId: string | null
  leadNotes: string | null
  packagingType: string | null
  packagingNotes: string | null
  notes: string | null
  quantity: number
  additionalItems: ValidatedAdditionalItem[]
  tradeIn: ValidatedTradeIn | null
  payments: ValidatedPayment[]
  productName: string
  isReservation: boolean
  selectedVariantId: string | null
  selectedVariantName: string | null
  selectedVariantColorHex: string | null
  warrantySelections: SaleWarrantySelections | null
}

function parseAndValidateInput(
  body: unknown
): { ok: true; input: ValidatedInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Corpo inválido." }
  }
  const b = body as Record<string, unknown>

  const inventoryId = b.inventoryId
  if (!isUuid(inventoryId)) return { ok: false, error: "inventoryId inválido." }

  const finalTotal = safeNumber(b.finalTotal)
  if (finalTotal <= 0) return { ok: false, error: "finalTotal deve ser positivo." }

  const warrantyMonths = safePositiveInt(b.warrantyMonths)
  if (!warrantyMonths) return { ok: false, error: "warrantyMonths inválido." }

  const warrantyStart = safeDate(b.warrantyStart)
  if (!warrantyStart) return { ok: false, error: "warrantyStart inválido." }

  const warrantyEnd = safeDate(b.warrantyEnd)
  if (!warrantyEnd) return { ok: false, error: "warrantyEnd inválido." }

  const saleDate = safeDate(b.saleDate)
  if (!saleDate) return { ok: false, error: "saleDate inválido." }

  const saleStatus = String(b.saleStatus || "")
  if (!["completed", "reserved"].includes(saleStatus)) return { ok: false, error: "saleStatus inválido." }

  const quantity = safePositiveInt(b.quantity)
  if (!quantity) return { ok: false, error: "quantity inválido." }

  const productName = safeString(b.productName, 300)
  if (!productName) return { ok: false, error: "productName obrigatório." }

  const rawCustomerType = safeString(b.customerType, 30)
  const customerType = rawCustomerType === "walk_in" ? "walk_in" : "identified"
  const customerId = isUuid(b.customerId) ? b.customerId : null
  if (customerType === "identified" && !customerId) {
    return { ok: false, error: "Cliente identificado obrigatório." }
  }

  if (!Array.isArray(b.payments) || b.payments.length === 0) {
    return { ok: false, error: "Pagamentos são obrigatórios." }
  }
  if (b.payments.length > 20) return { ok: false, error: "Muitos pagamentos." }

  const payments: ValidatedPayment[] = []
  for (const p of b.payments) {
    if (!p || typeof p !== "object") return { ok: false, error: "Pagamento inválido." }
    const pm = p as Record<string, unknown>
    const method = safeString(pm.paymentMethod, 100)
    if (!method) return { ok: false, error: "paymentMethod obrigatório." }
    const amount = safeNumber(pm.amount)
    if (amount <= 0) return { ok: false, error: "Valor do pagamento deve ser positivo." }
    const status = String(pm.status || "pending")
    const dueDate = safeDate(pm.dueDate) || saleDate
    const rawFinancialAccountId = pm.financialAccountId
    let financialAccountId: string | null = null
    if (rawFinancialAccountId != null && String(rawFinancialAccountId).trim() !== "") {
      if (!isUuid(rawFinancialAccountId)) return { ok: false, error: "financialAccountId inválido." }
      financialAccountId = rawFinancialAccountId
    }
    const notes = safeString(pm.notes, 300)
    payments.push({ paymentMethod: method, amount, status, dueDate, financialAccountId, notes })
  }

  const additionalItems: ValidatedAdditionalItem[] = []
  if (Array.isArray(b.additionalItems)) {
    if (b.additionalItems.length > 50) return { ok: false, error: "Muitos itens adicionais." }
    for (const ai of b.additionalItems) {
      if (!ai || typeof ai !== "object") return { ok: false, error: "Item adicional inválido." }
      const item = ai as Record<string, unknown>
      if (!isUuid(item.itemId)) return { ok: false, error: "itemId inválido." }
      const name = safeString(item.name, 300)
      if (!name) return { ok: false, error: "Nome do item adicional obrigatório." }
      const type = String(item.type || "")
      if (!["upsell", "free"].includes(type)) return { ok: false, error: "Tipo de item adicional inválido." }
      additionalItems.push({
        itemId: item.itemId as string,
        type,
        name,
        cost: safeNumber(item.cost),
        salePrice: safeNumber(item.salePrice),
        qty: safePositiveInt(item.qty) || 1,
        selectedVariantId: isUuid(item.selectedVariantId) ? item.selectedVariantId : null,
        selectedVariantName: safeString(item.selectedVariantName, 120),
        selectedVariantColorHex: safeString(item.selectedVariantColorHex, 30),
      })
    }
  }

  let tradeIn: ValidatedTradeIn | null = null
  if (b.tradeIn && typeof b.tradeIn === "object" && !Array.isArray(b.tradeIn)) {
    const ti = b.tradeIn as Record<string, unknown>
    const value = safeNumber(ti.value)
    if (value <= 0) return { ok: false, error: "Valor do trade-in deve ser positivo." }
    const modelName = safeString(ti.modelName, 300)
    if (!modelName) return { ok: false, error: "Modelo do trade-in obrigatório." }
    const photos = Array.isArray(ti.photos)
      ? (ti.photos as unknown[]).filter((p): p is string => typeof p === "string").slice(0, 20)
      : null
    const overageHandling = ["credit", "change"].includes(String(ti.overageHandling || ""))
      ? (ti.overageHandling as "credit" | "change")
      : undefined
    tradeIn = {
      imei: safeString(ti.imei, 50),
      grade: safeString(ti.grade, 50),
      value,
      photos: photos && photos.length > 0 ? photos : null,
      modelName,
      conditionNotes: safeString(ti.conditionNotes, 500),
      inventoryStatus: safeString(ti.inventoryStatus, 100) || "pending",
      overageHandling,
      overageAmount: safeNumber(ti.overageAmount),
    }
  }

  const warrantySelectionsResult = inputIsReservation(saleStatus, b.isReservation)
    ? { ok: true as const, value: null }
    : parseWarrantySelections(b.warrantySelections)
  if (!warrantySelectionsResult.ok) return { ok: false, error: warrantySelectionsResult.error }
  const warrantySelections = warrantySelectionsResult.value

  return {
    ok: true,
    input: {
      inventoryId,
      customerType,
      customerId: customerType === "walk_in" ? null : customerId,
      customerName: safeString(b.customerName, 300),
      walkInLabel: safeString(b.walkInLabel, 160),
      walkInPhone: safeString(b.walkInPhone, 40),
      walkInNotes: safeString(b.walkInNotes, 500),
      finalTotal,
      netAmount: safeNumber(b.netAmount),
      cardFeePct: safeNumber(b.cardFeePct),
      paymentMethod: safeString(b.paymentMethod, 100),
      warrantyMonths,
      warrantyStart,
      warrantyEnd,
      sourceType: safeString(b.sourceType, 50) || "own",
      supplierName: safeString(b.supplierName, 300),
      supplierCost: b.supplierCost != null ? safeNumber(b.supplierCost) : null,
      saleStatus,
      paymentDueDate: safeDate(b.paymentDueDate),
      saleDate,
      saleOrigin: safeString(b.saleOrigin, 100) || "unknown",
      marketingCampaignId: isUuid(b.marketingCampaignId) ? b.marketingCampaignId : null,
      marketingLeadId: isUuid(b.marketingLeadId) ? b.marketingLeadId : null,
      leadNotes: safeString(b.leadNotes, 1000),
      packagingType: safeString(b.packagingType, 100),
      packagingNotes: safeString(b.packagingNotes, 500),
      notes: safeString(b.notes, 2000),
      quantity,
      additionalItems,
      tradeIn,
      payments,
      productName,
      isReservation: inputIsReservation(saleStatus, b.isReservation),
      selectedVariantId: isUuid(b.selectedVariantId) ? b.selectedVariantId : null,
      selectedVariantName: safeString(b.selectedVariantName, 120),
      selectedVariantColorHex: safeString(b.selectedVariantColorHex, 30),
      warrantySelections,
    },
  }
}

function inputIsReservation(saleStatus: string, isReservation: unknown): boolean {
  return saleStatus === "reserved" || isReservation === true
}

function parseWarrantySelection(
  raw: unknown
): { ok: true; value: WarrantySelectionInput | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined }
  if (raw === null) return { ok: true, value: null }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Seleção de garantia inválida." }
  }
  const obj = raw as Record<string, unknown>
  const policyIdRaw = obj.warrantyPolicyId
  let warrantyPolicyId: string | null = null
  if (policyIdRaw === null) {
    warrantyPolicyId = null
  } else if (typeof policyIdRaw === "string" && isUuid(policyIdRaw)) {
    warrantyPolicyId = policyIdRaw
  } else if (policyIdRaw !== undefined) {
    return { ok: false, error: "Política de garantia inválida." }
  }
  return {
    ok: true,
    value: {
      warrantyPolicyId,
      manualEndsAt: typeof obj.manualEndsAt === "string" ? safeDate(obj.manualEndsAt) : null,
      warrantyName: safeString(obj.warrantyName, 300),
      warrantyLabel: safeString(obj.warrantyLabel, 300),
      manufacturerCoverageReference: safeString(obj.manufacturerCoverageReference, 300),
      manufacturerCoverageUrl: safeString(obj.manufacturerCoverageUrl, 1000),
      manualNotes: safeString(obj.manualNotes, 2000),
      manualSelection: Boolean(obj.manualSelection),
    },
  }
}

function parseWarrantySelections(
  raw: unknown
): { ok: true; value: SaleWarrantySelections | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "warrantySelections inválido." }
  }
  const obj = raw as Record<string, unknown>
  const result: SaleWarrantySelections = {}
  if ("main" in obj) {
    const parsed = parseWarrantySelection(obj.main)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    if (parsed.value !== undefined) result.main = parsed.value
  }
  if (obj.additionalBySourceId && typeof obj.additionalBySourceId === "object" && !Array.isArray(obj.additionalBySourceId)) {
    const map: Record<string, WarrantySelectionInput | null> = {}
    for (const [k, v] of Object.entries(obj.additionalBySourceId as Record<string, unknown>)) {
      if (!isUuid(k)) continue
      const parsed = parseWarrantySelection(v)
      if (!parsed.ok) return { ok: false, error: parsed.error }
      if (parsed.value !== undefined) map[k] = parsed.value
    }
    if (Object.keys(map).length > 0) result.additionalBySourceId = map
  }
  return { ok: true, value: Object.keys(result).length > 0 ? result : null }
}

async function requiresVariantSelection(input: {
  client: PoolClient
  companyId: string
  inventoryId: string
  hasSerial: boolean
}) {
  if (input.hasSerial) return false
  const res = await input.client.query<{ available_variants: string | number }>(
    `SELECT COUNT(*) AS available_variants
     FROM inventory_item_variants
     WHERE company_id = $1::uuid AND inventory_id = $2::uuid AND quantity > 0`,
    [input.companyId, input.inventoryId]
  )
  return Number(res.rows[0]?.available_variants || 0) > 0
}

function buildSaleVariantAllocations(
  input: ValidatedInput,
  loweredStock: { mainVariant: boolean; additionalVariantItemIds: Set<string> }
): SaleVariantAllocation[] {
  const allocations: SaleVariantAllocation[] = []

  if (loweredStock.mainVariant && input.selectedVariantId) {
    allocations.push({
      scope: "main",
      inventoryId: input.inventoryId,
      variantId: input.selectedVariantId,
      variantName: input.selectedVariantName,
      variantColorHex: input.selectedVariantColorHex,
      quantity: Math.max(1, input.quantity),
    })
  }

  for (const item of input.additionalItems) {
    if (!loweredStock.additionalVariantItemIds.has(item.itemId) || !item.selectedVariantId) continue
    allocations.push({
      scope: "additional",
      inventoryId: item.itemId,
      variantId: item.selectedVariantId,
      variantName: item.selectedVariantName,
      variantColorHex: item.selectedVariantColorHex,
      quantity: Math.max(1, item.qty),
    })
  }

  return allocations
}

function buildSaleStockRestorations(
  plans: AdditionalItemStockPlan[],
  additionalVariantItemIds: Set<string>
): SaleStockRestoration[] {
  return plans
    .filter((plan) => !additionalVariantItemIds.has(plan.itemId))
    .map((plan) => ({
      scope: "additional",
      inventoryId: plan.itemId,
      quantity: Math.max(1, plan.requestedQuantity),
    }))
}

// --- POST handler ---

export async function POST(request: NextRequest) {
  const authResult = await resolveSalesApiAuthContext(request)
  if (!authResult.ok) return authResult.response

  const { companyId, appUserId } = authResult.context

  const rateLimit = checkRateLimit(`sales-post-user:${appUserId}`, 20, 60_000)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { data: null, error: { message: "Muitas tentativas. Aguarde antes de tentar novamente." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) } }
    )
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      { data: null, error: { message: "Corpo da requisição excede o tamanho permitido." } },
      { status: 413 }
    )
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      { data: null, error: { message: "JSON inválido." } },
      { status: 400 }
    )
  }

  const inputResult = parseAndValidateInput(body)
  if (!inputResult.ok) {
    return NextResponse.json(
      { data: null, error: { message: inputResult.error } },
      { status: 400 }
    )
  }
  const input = inputResult.input

  const client = await pool.connect()
  let saleId: string | null = null
  let tradeInId: string | null = null
  let tradeInInventoryId: string | null = null
  const paymentIds: string[] = []
  const transactionIds: string[] = []
  let financialSyncOk = 0
  let financialSyncTotal = 0
  let additionalItemStockPlans: AdditionalItemStockPlan[] = []

  try {
    await client.query("BEGIN")
    // Extend statement timeout for this multi-step transaction
    await client.query("SET LOCAL statement_timeout = '30000'")

    // 1. Lock main inventory item
    const inventoryRes = await client.query<{ quantity: string; status: string; imei: string | null; serial_number: string | null }>(
      `SELECT quantity, status, imei, serial_number FROM inventory WHERE id = $1::uuid AND company_id = $2::uuid FOR UPDATE`,
      [input.inventoryId, companyId]
    )
    if ((inventoryRes.rowCount ?? 0) === 0) {
      throw new SaleOperationalError("Produto não encontrado ou não pertence à empresa.")
    }

    const mainRequiresVariant = await requiresVariantSelection({
      client,
      companyId,
      inventoryId: input.inventoryId,
      hasSerial: Boolean(inventoryRes.rows[0].imei || inventoryRes.rows[0].serial_number),
    })
    if (mainRequiresVariant && !input.selectedVariantId) {
      throw new SaleOperationalError("Selecione a variação do item antes de concluir a venda.")
    }

    // 2. Lock and validate additional items (prevents concurrent oversell)
    const additionalItemIdsRequiringVariant = new Set<string>()
    if (input.additionalItems.length > 0) {
      const itemIds = Array.from(new Set(input.additionalItems.map((i) => i.itemId)))
      const additionalInventoryRes = await client.query<LockedInventoryForSale & { imei: string | null; serial_number: string | null }>(
        `SELECT id, quantity, status, imei, serial_number FROM inventory WHERE id = ANY($1::uuid[]) AND company_id = $2::uuid FOR UPDATE`,
        [itemIds, companyId]
      )
      for (const row of additionalInventoryRes.rows) {
        const additionalRequiresVariant = await requiresVariantSelection({
          client,
          companyId,
          inventoryId: row.id,
          hasSerial: Boolean(row.imei || row.serial_number),
        })
        if (additionalRequiresVariant) additionalItemIdsRequiringVariant.add(row.id)
      }
      for (const item of input.additionalItems) {
        if (additionalItemIdsRequiringVariant.has(item.itemId) && !item.selectedVariantId) {
          throw new SaleOperationalError(`Selecione a variação do item adicional ${item.name} antes de concluir a venda.`)
        }
      }
      additionalItemStockPlans = buildAdditionalItemStockPlan({
        items: input.additionalItems,
        lockedInventoryRows: additionalInventoryRes.rows,
        emptyStockStatus: input.isReservation ? "reserved" : "sold",
      })
    }

    // 3. Validate FK ownership
    if (input.customerId) {
      const custRes = await client.query(
        `SELECT id FROM customers WHERE id = $1::uuid AND company_id = $2::uuid`,
        [input.customerId, companyId]
      )
      if ((custRes.rowCount ?? 0) === 0) throw new SaleOperationalError("Cliente não encontrado.")
    }

    if (input.marketingCampaignId) {
      const campRes = await client.query(
        `SELECT id FROM marketing_campaigns WHERE id = $1::uuid AND company_id = $2::uuid`,
        [input.marketingCampaignId, companyId]
      )
      if ((campRes.rowCount ?? 0) === 0) throw new SaleOperationalError("Campanha de marketing não encontrada.")
    }

    if (input.marketingLeadId) {
      const leadRes = await client.query(
        `SELECT id FROM marketing_leads WHERE id = $1::uuid AND company_id = $2::uuid`,
        [input.marketingLeadId, companyId]
      )
      if ((leadRes.rowCount ?? 0) === 0) throw new SaleOperationalError("Lead de marketing não encontrado.")
    }

    const financialAccountIds = Array.from(
      new Set(input.payments.map((payment) => payment.financialAccountId).filter((id): id is string => Boolean(id)))
    )
    if (financialAccountIds.length > 0) {
      const accountRes = await client.query<{ id: string }>(
        `SELECT id FROM finance_accounts WHERE id = ANY($1::uuid[]) AND company_id = $2::uuid`,
        [financialAccountIds, companyId]
      )
      validateFinancialAccountOwnership({
        requestedAccountIds: financialAccountIds,
        accountRows: accountRes.rows,
      })
    }

    // 4. INSERT sale
    const saleRes = await client.query<{ id: string }>(
      `INSERT INTO sales (
        company_id, inventory_id, customer_id, customer_type, walk_in_label, walk_in_phone, walk_in_notes,
        sale_price, net_amount, card_fee_pct,
        payment_method, warranty_months, warranty_start, warranty_end, source_type,
        supplier_name, supplier_cost, sale_status, payment_due_date, sale_date,
        sale_origin, marketing_campaign_id, marketing_lead_id, lead_notes,
        packaging_type, packaging_notes, notes, has_trade_in
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13::date, $14::date, $15,
        $16, $17, $18, $19, $20::date,
        $21, $22, $23, $24,
        $25, $26, $27, false
      ) RETURNING id`,
      [
        companyId,
        input.inventoryId,
        input.customerId || null,
        input.customerType,
        input.customerType === "walk_in" ? input.walkInLabel || "Cliente avulso" : null,
        input.customerType === "walk_in" ? input.walkInPhone || null : null,
        input.customerType === "walk_in" ? input.walkInNotes || null : null,
        input.finalTotal,
        input.netAmount,
        input.cardFeePct,
        input.paymentMethod,
        input.warrantyMonths,
        input.warrantyStart,
        input.warrantyEnd,
        input.sourceType,
        input.supplierName,
        input.supplierCost,
        input.saleStatus,
        input.paymentDueDate || null,
        input.saleDate,
        input.saleOrigin,
        input.marketingCampaignId || null,
        input.marketingLeadId || null,
        input.leadNotes || null,
        input.packagingType || null,
        input.packagingNotes || null,
        input.notes || null,
      ]
    )
    saleId = saleRes.rows[0].id

    if (shouldForceLocalSaleFailure(request)) {
      throw new SaleOperationalError("Falha local forçada após insert da venda.")
    }

    // 5. Update main inventory stock for the real inventory item selected in the sale.
    if (mainRequiresVariant && input.selectedVariantId) {
      try {
        await decrementInventoryVariantQuantity({
          client,
          companyId,
          inventoryId: input.inventoryId,
          variantId: input.selectedVariantId,
          quantity: input.quantity,
          emptyStockStatus: input.isReservation ? "reserved" : "sold",
        })
      } catch (error) {
        throw new SaleOperationalError(error instanceof Error ? error.message : "Erro ao baixar variação do estoque.")
      }
    } else {
      const currentQty = Math.max(1, Number(inventoryRes.rows[0].quantity || 1))
      const nextQty = Math.max(0, currentQty - Math.max(1, input.quantity))
      const stockState = stockStateForQuantity(nextQty, input.isReservation ? "reserved" : "sold")

      await client.query(
        `UPDATE inventory
         SET quantity = $1,
             status = $2,
             logistics_status = $3,
             commercial_status = $4,
             updated_at = NOW()
         WHERE id = $5::uuid
           AND company_id = $6::uuid`,
        [
          nextQty,
          stockState.status,
          stockState.logisticsStatus,
          stockState.commercialStatus,
          input.inventoryId,
          companyId,
        ]
      )
    }

    // 6. Process additional items
    for (const additionalItem of input.additionalItems) {
      await client.query(
        `INSERT INTO sales_additional_items (company_id, sale_id, product_id, type, name, cost_price, sale_price)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
        [companyId, saleId, additionalItem.itemId, additionalItem.type, additionalItem.name, additionalItem.cost, additionalItem.salePrice]
      )
    }

    for (const additionalItem of input.additionalItems) {
      if (!additionalItemIdsRequiringVariant.has(additionalItem.itemId) || !additionalItem.selectedVariantId) continue
      try {
        await decrementInventoryVariantQuantity({
          client,
          companyId,
          inventoryId: additionalItem.itemId,
          variantId: additionalItem.selectedVariantId,
          quantity: additionalItem.qty,
          emptyStockStatus: input.isReservation ? "reserved" : "sold",
        })
      } catch (error) {
        throw new SaleOperationalError(error instanceof Error ? error.message : "Erro ao baixar variação do item adicional.")
      }
    }

    for (const stockPlan of additionalItemStockPlans.filter((plan) => !additionalItemIdsRequiringVariant.has(plan.itemId))) {
      const stockState = stockStateForQuantity(stockPlan.nextQuantity, stockPlan.nextStatus === "reserved" ? "reserved" : "sold")
      await client.query(
        `UPDATE inventory
         SET quantity = $1,
             status = $2,
             logistics_status = $3,
             commercial_status = $4,
             updated_at = NOW()
         WHERE id = $5::uuid
           AND company_id = $6::uuid`,
        [
          stockPlan.nextQuantity,
          stockState.status,
          stockState.logisticsStatus,
          stockState.commercialStatus,
          stockPlan.itemId,
          companyId,
        ]
      )
    }

    // 7. Handle trade-in
    if (input.tradeIn) {
      const ti = input.tradeIn

      const tradeInInsertRes = await client.query<{ id: string }>(
        `INSERT INTO trade_ins (company_id, imei, grade, trade_in_value, status, photos, notes, condition_notes)
         VALUES ($1::uuid, $2, $3, $4, 'received', $5, $6, $7)
         RETURNING id`,
        [companyId, ti.imei, ti.grade, ti.value, ti.photos, ti.modelName, ti.conditionNotes]
      )
      tradeInId = tradeInInsertRes.rows[0].id

      await client.query(
        `UPDATE sales SET trade_in_id = $1::uuid, has_trade_in = true WHERE id = $2::uuid`,
        [tradeInId, saleId]
      )

      const tiInvRes = await client.query<{ id: string }>(
        `INSERT INTO inventory (
          company_id, imei, grade, condition_notes, purchase_price, purchase_date,
          type, origin, source_sale_id, notes, quantity, status
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, $6::date,
          'own', 'trade_in', $7::uuid, $8, 1, $9
        ) RETURNING id`,
        [
          companyId,
          ti.imei,
          ti.grade,
          ti.conditionNotes,
          ti.value,
          input.saleDate,
          saleId,
          ti.modelName,
          ti.inventoryStatus,
        ]
      )
      tradeInInventoryId = tiInvRes.rows[0].id

      await client.query(
        `UPDATE trade_ins SET linked_inventory_id = $1::uuid, status = $2 WHERE id = $3::uuid`,
        [tradeInInventoryId, input.isReservation ? "received" : "added_to_stock", tradeInId]
      )
    }

    // 8. INSERT sale_payments
    for (const payment of input.payments) {
      const payRes = await client.query<{ id: string }>(
        `INSERT INTO sale_payments (company_id, sale_id, payment_method, amount, status, due_date, received_date, financial_account_id, notes)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7, $8, $9)
         RETURNING id`,
        [
          companyId,
          saleId,
          payment.paymentMethod,
          payment.amount,
          payment.status,
          payment.dueDate,
          payment.status === "received" ? input.saleDate : null,
          isFinancialPayment(payment.paymentMethod) ? payment.financialAccountId || null : null,
          payment.notes,
        ]
      )
      paymentIds.push(payRes.rows[0].id)
    }

    // 9. Validate payment total
    const validateRes = await client.query(
      `SELECT validate_sale_payment_total($1::uuid) FROM sales WHERE id = $1::uuid AND company_id = $2::uuid`,
      [saleId, companyId]
    )
    if ((validateRes.rowCount ?? 0) === 0) {
      throw new SaleOperationalError("Validação da soma dos pagamentos falhou.")
    }

    // 10. Financial transactions + movement sync
    for (let i = 0; i < input.payments.length; i++) {
      const payment = input.payments[i]
      const paymentId = paymentIds[i]

      if (!isFinancialPayment(payment.paymentMethod)) continue

      financialSyncTotal++
      const txStatus = payment.status === "received" ? "reconciled" : "pending"
      const txDate = txStatus === "reconciled" ? input.saleDate : payment.dueDate
      const txDescription = `${input.isReservation ? "Reserva" : "Venda"} · ${input.productName} · ${formatPaymentMethod(payment.paymentMethod)}`

      const txRes = await client.query<{ id: string }>(
        `INSERT INTO transactions (
          company_id, type, category, description, amount, date, due_date,
          payment_method, status, account_id, chart_account_id, reconciled_at,
          source_type, source_id, notes
        ) VALUES (
          $1::uuid, 'income', 'Venda de produtos', $2, $3, $4::date, $5::date,
          $6, $7, $8, NULL, $9,
          'sale_payment', $10::uuid, $11
        ) RETURNING id`,
        [
          companyId,
          txDescription,
          payment.amount,
          txDate,
          payment.dueDate,
          payment.paymentMethod,
          txStatus,
          payment.financialAccountId || null,
          txStatus === "reconciled" ? new Date().toISOString() : null,
          paymentId,
          `sale_id:${saleId}`,
        ]
      )
      const txId = txRes.rows[0].id
      transactionIds.push(txId)

      await client.query(
        `UPDATE sale_payments SET transaction_id = $1::uuid WHERE id = $2::uuid`,
        [txId, paymentId]
      )

      if (txStatus === "reconciled") {
        const syncResult = await syncTransactionMovement(client, txId, { createdBy: appUserId })
        if (syncResult.ok) financialSyncOk++
      } else {
        financialSyncOk++
      }
    }

    // 11. Trade-in change payable (store owes change to customer)
    if (
      input.tradeIn?.overageHandling === "change" &&
      input.tradeIn.overageAmount > 0
    ) {
      const amount = Math.round(Math.max(0, input.tradeIn.overageAmount) * 100) / 100
      const desc = `Troco de trade-in · ${input.productName}${input.customerName ? ` · ${input.customerName}` : ""}`
      await client.query(
        `INSERT INTO transactions (
          company_id, type, category, description, amount, date, due_date,
          payment_method, status, account_id, chart_account_id, reconciled_at,
          source_type, source_id, notes
        ) VALUES (
          $1::uuid, 'expense', 'A categorizar', $2, $3, $4::date, $4::date,
          'trade_in_return', 'pending', NULL, NULL, NULL,
          'trade_in_change', $5::uuid, $6
        )`,
        [companyId, desc, amount, input.saleDate, saleId, `sale_id:${saleId}; origem:troco_trade_in`]
      )
    }

    // 12. Update marketing lead
    if (input.marketingLeadId) {
      await client.query(
        `UPDATE marketing_leads SET status = 'sold', sale_id = $1::uuid, campaign_id = $2 WHERE id = $3::uuid`,
        [saleId, input.marketingCampaignId || null, input.marketingLeadId]
      )
    }

    // 13. Audit log
    const mainVariantStockLowered = mainRequiresVariant && Boolean(input.selectedVariantId)
    const variantSelections = buildSaleVariantAllocations(input, {
      mainVariant: mainVariantStockLowered,
      additionalVariantItemIds: additionalItemIdsRequiringVariant,
    })
    const stockRestorations = buildSaleStockRestorations(additionalItemStockPlans, additionalItemIdsRequiringVariant)
    await client.query(
      `INSERT INTO audit_logs (company_id, user_id, action, table_name, record_id, old_data, new_data)
       VALUES ($1::uuid, $2, 'created', 'sales', $3::uuid, NULL, $4)`,
      [
        companyId,
        appUserId,
        saleId,
        JSON.stringify({
          saleStatus: input.saleStatus,
          finalTotal: input.finalTotal,
          payments: paymentIds.length,
          variantSelections,
          stockRestorations,
        }),
      ]
    )

    // 14. Materialize sale_items (canonical contract) + apply per-item warranties for effective sales.
    //     This runs inside the same transaction so any failure rolls back the entire sale.
    //     Legacy sales.warranty_* fields above remain unchanged.
    await materializeSaleItemsWithClient(client, companyId, saleId!)
    let warrantyApplied = { created: 0, skipped: 0 }
    if (!input.isReservation) {
      try {
        await assertSaleAccessoriesClassified(client, companyId, saleId!)
        const warrantyResult = await applySaleWarranties(
          client,
          {
            companyId,
            saleId: saleId!,
            startsAt: input.saleDate,
            selections: input.warrantySelections ?? undefined,
          },
          { userId: appUserId, email: authResult.context.email }
        )
        warrantyApplied = { created: warrantyResult.created.length, skipped: warrantyResult.skipped.length }
      } catch (err) {
        throw new SaleOperationalError(err instanceof Error ? err.message : "Erro ao aplicar garantia por item.")
      }
    }

    await client.query("COMMIT")

    const financialSyncStatus =
      financialSyncTotal === 0 ? "skipped" : financialSyncOk === financialSyncTotal ? "ok" : "partial"

    return NextResponse.json({
      data: {
        saleId,
        saleStatus: input.saleStatus,
        tradeInId,
        tradeInInventoryId,
        paymentIds,
        transactionIds,
        financialSyncStatus,
        warrantyApplied,
      },
      error: null,
    })
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    const message = err instanceof Error ? err.message : "Erro interno ao registrar venda."
    const status = err instanceof SaleOperationalError
      ? err.statusCode
      : err instanceof AccessoryClassificationRequiredError
        ? 400
        : 500
    return NextResponse.json(
      { data: null, error: { message } },
      { status }
    )
  } finally {
    client.release()
  }
}
