import { randomBytes, randomInt } from "crypto"
import { pool } from "@/lib/db"
import { addDaysISO, formatPaymentMethod, getAdditionalItemDisplayName, getTradeInDisplayName } from "@/lib/helpers"
import { calculateSplitPaymentEconomics } from "@/lib/sale-payments"
import { parseQtyFromNotes } from "@/lib/sale-totals"
import type { ReceiptLineItem, SaleDocumentData } from "@/lib/sale-documents"

const TOKEN_PREFIX = "ntcv_"
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

export type PublicPurchaseIntro = {
  available: boolean
  customerFirstName: string | null
  lockedUntil: string | null
  message?: string
}

export type PublicPurchaseDetails = {
  customerName: string
  support: {
    whatsappUrl: string | null
    phoneLabel: string | null
  }
  sale: {
    number: string
    date: string | null
    purchaseAmount: number
    amountPaid: number
    paymentMethod: string
    remainingPaymentMethod: string
    payments: Array<{
      method: string
      amount: number
    }>
    tradeInApplied: boolean
    tradeInCreditAmount: number
    tradeInDevice: {
      model: string | null
      storage: string | null
      color: string | null
      maskedImei: string | null
      maskedSerial: string | null
      creditAmount: number
    } | null
    status: string
    warrantyStart: string | null
    warrantyEnd: string | null
    warrantyStatus: string
  }
  device: {
    model: string
    storage: string | null
    color: string | null
    grade: string | null
    batteryHealth: number | null
    boxType: string
    photoUrl: string | null
    imei: string | null
    serial: string | null
  }
  purchaseItems: PublicPurchaseItem[]
  provenance: {
    kind: "trade_in" | "supplier" | "sealed" | "unknown"
    description: string
    previousOwnerName: string | null
    previousOwnerCpf: string | null
    previousPurchaseDate: string | null
    receivedAt: string | null
    inspectionDate: string | null
    stockEntryDate: string | null
    originLabel: string | null
    conditionLabel: string | null
    technicalStatus: string | null
    status: string | null
    privacyNote: string
  }
  documents: {
    receiptAvailable: boolean
    warrantyAvailable: boolean
    technicalReportUrl: string | null
    receiptDocument: SaleDocumentData | null
    warrantyDocument: SaleDocumentData | null
  }
  assistance: Array<{
    id: string
    itemId: string | null
    itemName: string | null
    status: string
    statusLabel: string
    type: string | null
    description: string
    openedAt: string | null
    expectedAt: string | null
    publicNote: string | null
    timeline: Array<{ label: string; date: string | null; active: boolean }>
  }>
}

export type PublicPurchaseIssue = {
  id: string
  status: string
  statusLabel: string
  type: string | null
  description: string
  openedAt: string | null
  expectedAt: string | null
  publicNote: string | null
  timeline: Array<{ label: string; date: string | null; active: boolean }>
}

export type PublicPurchaseItem = {
  id: string
  type: "principal" | "upsell" | "free" | "additional"
  label: string
  model: string
  storage: string | null
  color: string | null
  grade: string | null
  batteryHealth: number | null
  boxType: string
  photoUrl: string | null
  imei: string | null
  serial: string | null
  warrantyStart: string | null
  warrantyEnd: string | null
  issues: PublicPurchaseIssue[]
}

type SaleAccessRow = {
  id: string
  public_access_token: string | null
  public_access_pin: string | null
  public_access_enabled: boolean | null
  public_access_locked_until: Date | string | null
  public_access_failed_attempts: number | null
  sale_status: string | null
  customer_name: string | null
  customer_cpf: string | null
  customer_phone: string | null
  sale_date: string | Date | null
  sale_price: string | number | null
  payment_method: string | null
  sale_notes: string | null
  packaging_type: string | null
  packaging_notes: string | null
  has_trade_in: boolean | null
  trade_in_id: string | null
  trade_in_value: string | number | null
  trade_in_grade: string | null
  trade_in_notes: string | null
  trade_in_imei: string | null
  trade_in_serial_number: string | null
  trade_in_inventory_imei: string | null
  trade_in_inventory_serial_number: string | null
  trade_in_model: string | null
  trade_in_variant: string | null
  trade_in_storage: string | null
  trade_in_color: string | null
  warranty_start: string | Date | null
  warranty_end: string | Date | null
  warranty_months: number | null
  warranty_pdf_url: string | null
  company_settings: Record<string, unknown> | string | null
  inventory_id: string | null
  inventory_purchase_date: string | Date | null
  inventory_created_at: string | Date | null
  inventory_origin: string | null
  inventory_supplier_name: string | null
  inventory_photos: string[] | null
  previous_sale_date: string | Date | null
  previous_owner_name: string | null
  previous_owner_cpf: string | null
  checklist_completed_at: string | Date | null
  checklist_created_at: string | Date | null
  checklist_pdf_url: string | null
  model: string | null
  variant: string | null
  storage: string | null
  color: string | null
  grade: string | null
  battery_health: number | null
  inventory_suggested_price: string | number | null
  imei: string | null
  imei2: string | null
  serial_number: string | null
  condition_notes: string | null
}

type PublicProblemRow = {
  id: string
  inventory_id: string | null
  type: string | null
  description: string
  reported_date: string | Date | null
  action_deadline: string | Date | null
  resolution_notes: string | null
  status: string | null
  resolved_date: string | Date | null
}

type AdditionalSaleItemRow = {
  id: string
  product_id: string | null
  type: string | null
  name: string | null
  sale_price: string | number | null
  packaging_type: string | null
  packaging_notes: string | null
  model: string | null
  variant: string | null
  storage: string | null
  color: string | null
  grade: string | null
  battery_health: number | null
  imei: string | null
  imei2: string | null
  serial_number: string | null
}

type PublicPaymentLine = {
  method: string
  paymentMethod: string | null
  amount: number
}

function randomTokenSuffix(length = 32) {
  const bytes = randomBytes(length)
  let token = ""
  for (const byte of bytes) {
    token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
  }
  return token
}

export function generatePublicAccessToken() {
  return `${TOKEN_PREFIX}${randomTokenSuffix(32)}`
}

export function generatePublicAccessPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] || null
}

function saleNumber(id: string) {
  return `NT-${id.slice(0, 8).toUpperCase()}`
}

function maskTrailing(value?: string | null) {
  if (!value) return null
  const clean = String(value).trim()
  if (!clean) return null
  return `***${clean.slice(-4)}`
}

function maskOwnerName(fullName?: string | null) {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) || []
  if (parts.length === 0) return null
  return parts.map((part, index) => {
    if (index === 0) return part
    const first = part[0] || ""
    return `${first}${"*".repeat(Math.max(4, part.length - 1))}`
  }).join(" ")
}

function maskCpf(cpf?: string | null) {
  const digits = String(cpf || "").replace(/\D/g, "")
  if (digits.length !== 11) return null
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

function packagingLabel(type?: string | null, notes?: string | null) {
  const note = notes?.trim()
  if (type === "original_box") return "Caixa original"
  if (type === "nobretech_box") return "Caixa Nobretech"
  if (type === "no_box") return "Sem caixa"
  if (type === "other") return note || "Outro"
  return "Não informado"
}

function dateOnly(value?: string | Date | null) {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const text = String(value).trim()
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`

  return null
}

function warrantyStatus(endDate?: string | null) {
  if (!endDate) return "Não informado"
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(`${endDate}T00:00:00`)
  return end >= today ? "Dentro da garantia" : "Garantia expirada"
}

function warrantyPeriodFromSale(row: Pick<SaleAccessRow, "sale_date" | "warranty_start" | "warranty_end" | "warranty_months">) {
  const saleDate = dateOnly(row.sale_date)
  const savedWarrantyStart = dateOnly(row.warranty_start)
  const start = saleDate || savedWarrantyStart
  const warrantyMonths = Number(row.warranty_months || 0)
  const end = start && warrantyMonths > 0
    ? addDaysISO(start, warrantyMonths * 30)
    : dateOnly(row.warranty_end)

  return {
    saleDate,
    warrantyStart: start,
    warrantyEnd: end,
  }
}

function firstPhoto(photos?: string[] | null) {
  return photos?.find((photo) => typeof photo === "string" && photo.trim()) || null
}

function buildProvenance(row: SaleAccessRow) {
  const stockEntryDate = dateOnly(row.inventory_purchase_date) || dateOnly(row.inventory_created_at)
  const inspectionDate = dateOnly(row.checklist_completed_at) || dateOnly(row.checklist_created_at)
  const hasPreviousOwner = Boolean(row.previous_owner_name || row.previous_owner_cpf || row.inventory_origin === "trade_in")
  const grade = String(row.grade || "").toLowerCase()
  const isSealed = grade.includes("lacrado") || grade.includes("novo")
  const kind: PublicPurchaseDetails["provenance"]["kind"] = hasPreviousOwner ? "trade_in" : isSealed ? "sealed" : stockEntryDate ? "supplier" : "unknown"
  const descriptions = {
    trade_in: "Este aparelho passou por validação de origem, conferência técnica e registro de entrada antes da venda.",
    supplier: "Este aparelho foi adquirido por fornecedor parceiro da Nobretech e passou por registro de entrada, conferência técnica e validação antes da venda.",
    sealed: "Este produto foi adquirido por fornecedor/distribuidor parceiro e passou por validação comercial antes da venda.",
    unknown: "Este aparelho possui rastreabilidade em atualização no sistema da Nobretech.",
  } satisfies Record<typeof kind, string>
  const privacyNotes = {
    trade_in: "Dados parcialmente ocultos por segurança e conformidade com a LGPD.",
    supplier: "Informações comerciais do fornecedor preservadas por segurança e política interna da Nobretech.",
    sealed: "Informações comerciais preservadas por política interna.",
    unknown: "Informações de procedência ainda estão sendo atualizadas pela Nobretech.",
  } satisfies Record<typeof kind, string>

  return {
    kind,
    description: descriptions[kind],
    previousOwnerName: maskOwnerName(row.previous_owner_name),
    previousOwnerCpf: maskCpf(row.previous_owner_cpf),
    previousPurchaseDate: dateOnly(row.previous_sale_date),
    receivedAt: row.inventory_origin === "trade_in" ? stockEntryDate : null,
    inspectionDate,
    stockEntryDate,
    originLabel: kind === "trade_in" ? "Cliente pessoa física" : kind === "sealed" ? "Fornecedor/distribuidor" : kind === "supplier" ? "Fornecedor parceiro" : null,
    conditionLabel: kind === "sealed" ? "Lacrado" : null,
    technicalStatus: kind === "unknown" ? null : "Aprovada",
    status: kind === "sealed" ? "Produto novo/lacrado validado" : kind === "unknown" ? null : "Sem restrições",
    privacyNote: privacyNotes[kind],
  }
}

function uniqueDeviceName(...parts: Array<string | null>) {
  const normalized: string[] = []
  for (const part of parts) {
    const value = part?.trim()
    if (!value) continue
    const lowerValue = value.toLowerCase()
    if (normalized.some((current) => current.toLowerCase().includes(lowerValue) || lowerValue.includes(current.toLowerCase()))) continue
    normalized.push(value)
  }
  return normalized.join(" ") || "Aparelho não informado"
}

function companySettings(value: SaleAccessRow["company_settings"]) {
  if (!value) return {}
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return value
}

function whatsappUrl(phone?: unknown) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (digits.length < 10) return { whatsappUrl: null, phoneLabel: null }
  const normalized = digits.startsWith("55") ? digits : `55${digits}`
  return {
    whatsappUrl: `https://wa.me/${normalized}`,
    phoneLabel: phone ? String(phone) : null,
  }
}

function problemStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    open: "Recebido",
    in_progress: "Em manutenção",
    resolved: "Concluído",
    closed: "Concluído",
  }
  return labels[String(status || "")] || "Em acompanhamento"
}

function publicItemLabel(type?: string | null) {
  if (type === "principal") return "Principal"
  if (type === "upsell") return "Upsell"
  if (type === "free") return "Brinde"
  return "Adicional"
}

function normalizePublicItemType(type?: string | null): PublicPurchaseItem["type"] {
  if (type === "upsell" || type === "free") return type
  return "additional"
}

function assistanceTimeline(status?: string | null, openedAt?: string | null, resolvedAt?: string | null) {
  const order = ["open", "in_progress", "resolved", "closed"]
  const currentIndex = Math.max(0, order.indexOf(String(status || "open")))
  return [
    { key: "open", label: "Recebido" },
    { key: "in_progress", label: "Em triagem/manutenção" },
    { key: "resolved", label: "Pronto/solucionado" },
    { key: "closed", label: "Concluído" },
  ].map((item, index) => ({
    label: item.label,
    date: index === 0 ? openedAt || null : index >= 2 ? resolvedAt || null : null,
    active: index <= currentIndex,
  }))
}

function toPublicIssue(problem: PublicProblemRow): PublicPurchaseIssue {
  return {
    id: problem.id,
    status: problem.status || "open",
    statusLabel: problemStatusLabel(problem.status),
    type: problem.type,
    description: problem.description,
    openedAt: dateOnly(problem.reported_date),
    expectedAt: dateOnly(problem.action_deadline),
    publicNote: problem.resolution_notes || null,
    timeline: assistanceTimeline(problem.status, dateOnly(problem.reported_date), dateOnly(problem.resolved_date)),
  }
}

async function getAdditionalItemsForSale(saleId: string) {
  const result = await pool.query<AdditionalSaleItemRow>(
    `
      SELECT
        sai.id,
        sai.product_id,
        sai.type,
        sai.name,
        sai.sale_price,
        sai.packaging_type,
        sai.packaging_notes,
        pc.model,
        pc.variant,
        pc.storage,
        pc.color,
        i.grade,
        i.battery_health,
        i.imei,
        i.imei2,
        i.serial_number
      FROM sales_additional_items sai
      LEFT JOIN inventory i ON i.id = sai.product_id
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      WHERE sai.sale_id = $1
      ORDER BY sai.created_at ASC, sai.id ASC
    `,
    [saleId]
  )

  return result.rows
}

async function getPublicPaymentsForSale(saleId: string) {
  const result = await pool.query(
    `
      SELECT payment_method, amount
      FROM sale_payments
      WHERE sale_id = $1::uuid
        AND COALESCE(status, 'pending') <> 'cancelled'
      ORDER BY created_at ASC
    `,
    [saleId]
  )

  return result.rows.map((row) => ({
    method: formatPaymentMethod(row.payment_method),
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    amount: Number(row.amount || 0),
  }))
}

async function getProblemsByInventoryId(saleId: string, inventoryIds: string[]) {
  if (inventoryIds.length === 0) return new Map<string, PublicPurchaseIssue[]>()

  const result = await pool.query<PublicProblemRow>(
    `
      SELECT id, inventory_id, type, description, reported_date, action_deadline, resolution_notes, status, resolved_date
      FROM problems
      WHERE sale_id = $1
        AND inventory_id = ANY($2::uuid[])
      ORDER BY reported_date DESC, created_at DESC
    `,
    [saleId, inventoryIds]
  )

  const byInventoryId = new Map<string, PublicPurchaseIssue[]>()
  for (const problem of result.rows) {
    if (!problem.inventory_id) continue
    const list = byInventoryId.get(problem.inventory_id) || []
    list.push(toPublicIssue(problem))
    byInventoryId.set(problem.inventory_id, list)
  }
  return byInventoryId
}

async function getSaleByToken(token: string) {
  const result = await pool.query<SaleAccessRow>(
    `
      SELECT
        s.id,
        s.public_access_token,
        s.public_access_pin,
        s.public_access_enabled,
        s.public_access_locked_until,
        s.public_access_failed_attempts,
        s.sale_status,
        s.sale_date,
        s.sale_price,
        s.payment_method,
        s.notes AS sale_notes,
        s.packaging_type,
        s.packaging_notes,
        s.has_trade_in,
        s.trade_in_id,
        s.warranty_start,
        s.warranty_end,
        s.warranty_months,
        s.warranty_pdf_url,
        s.inventory_id,
        COALESCE(co.settings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'pix_fee_pct', fs.pix_fee_pct,
          'cash_discount_pct', fs.cash_discount_pct,
          'debit_fee_pct', fs.debit_fee_pct,
          'credit_1x_fee_pct', fs.credit_1x_fee_pct,
          'credit_2x_fee_pct', fs.credit_2x_fee_pct,
          'credit_3x_fee_pct', fs.credit_3x_fee_pct,
          'credit_4x_fee_pct', fs.credit_4x_fee_pct,
          'credit_5x_fee_pct', fs.credit_5x_fee_pct,
          'credit_6x_fee_pct', fs.credit_6x_fee_pct,
          'credit_7x_fee_pct', fs.credit_7x_fee_pct,
          'credit_8x_fee_pct', fs.credit_8x_fee_pct,
          'credit_9x_fee_pct', fs.credit_9x_fee_pct,
          'credit_10x_fee_pct', fs.credit_10x_fee_pct,
          'credit_11x_fee_pct', fs.credit_11x_fee_pct,
          'credit_12x_fee_pct', fs.credit_12x_fee_pct,
          'credit_13x_fee_pct', fs.credit_13x_fee_pct,
          'credit_14x_fee_pct', fs.credit_14x_fee_pct,
          'credit_15x_fee_pct', fs.credit_15x_fee_pct,
          'credit_16x_fee_pct', fs.credit_16x_fee_pct,
          'credit_17x_fee_pct', fs.credit_17x_fee_pct,
          'credit_18x_fee_pct', fs.credit_18x_fee_pct
        )) AS company_settings,
        c.full_name AS customer_name,
        c.cpf AS customer_cpf,
        c.phone AS customer_phone,
        ti.trade_in_value,
        ti.grade AS trade_in_grade,
        ti.notes AS trade_in_notes,
        ti.imei AS trade_in_imei,
        ti.serial_number AS trade_in_serial_number,
        tii.imei AS trade_in_inventory_imei,
        tii.serial_number AS trade_in_inventory_serial_number,
        tipc.model AS trade_in_model,
        tipc.variant AS trade_in_variant,
        tipc.storage AS trade_in_storage,
        tipc.color AS trade_in_color,
        pc.model,
        pc.variant,
        pc.storage,
        pc.color,
        i.purchase_date AS inventory_purchase_date,
        i.created_at AS inventory_created_at,
        i.origin AS inventory_origin,
        i.supplier_name AS inventory_supplier_name,
        i.photos AS inventory_photos,
        i.grade,
        i.battery_health,
        i.suggested_price AS inventory_suggested_price,
        i.imei,
        i.imei2,
        i.serial_number,
        i.condition_notes,
        ps.sale_date AS previous_sale_date,
        pc_owner.full_name AS previous_owner_name,
        pc_owner.cpf AS previous_owner_cpf,
        ch.completed_at AS checklist_completed_at,
        ch.created_at AS checklist_created_at,
        ch.pdf_url AS checklist_pdf_url
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN companies co ON co.id = s.company_id
      LEFT JOIN financial_settings fs ON fs.company_id = s.company_id
      LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
      LEFT JOIN inventory tii ON tii.id = ti.linked_inventory_id
      LEFT JOIN product_catalog tipc ON tipc.id = tii.catalog_id
      LEFT JOIN inventory i ON i.id = s.inventory_id
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      LEFT JOIN sales ps ON ps.id = i.source_sale_id
      LEFT JOIN customers pc_owner ON pc_owner.id = ps.customer_id
      LEFT JOIN checklists ch ON ch.id = i.checklist_id OR ch.inventory_id = i.id
      WHERE s.public_access_token = $1
      LIMIT 1
    `,
    [token]
  )
  return result.rows[0] || null
}

function isLocked(row: SaleAccessRow) {
  const lockedUntil = row.public_access_locked_until ? new Date(row.public_access_locked_until) : null
  return Boolean(lockedUntil && lockedUntil > new Date())
}

function isAvailable(row: SaleAccessRow | null) {
  return Boolean(row && row.public_access_enabled && row.sale_status === "completed")
}

export async function getPublicPurchaseIntro(token: string): Promise<PublicPurchaseIntro> {
  const row = await getSaleByToken(token)
  if (!isAvailable(row)) {
    return {
      available: false,
      customerFirstName: null,
      lockedUntil: null,
      message: "Esta compra não está disponível para consulta.",
    }
  }

  return {
    available: true,
    customerFirstName: firstName(row?.customer_name) || "cliente",
    lockedUntil: row && isLocked(row) ? new Date(row.public_access_locked_until as string).toISOString() : null,
  }
}

export async function verifyPublicPurchasePin(token: string, pin: string) {
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, status: 400, message: "Código incorreto. Verifique a etiqueta e tente novamente." }
  }

  const row = await getSaleByToken(token)
  if (!isAvailable(row)) {
    return { ok: false, status: 404, message: "Esta compra não está disponível para consulta." }
  }

  if (isLocked(row)) {
    return {
      ok: false,
      status: 423,
      lockedUntil: new Date(row.public_access_locked_until as string).toISOString(),
      message: "Muitas tentativas incorretas. Tente novamente mais tarde.",
    }
  }

  if (row.public_access_pin !== pin) {
    const failedAttempts = Number(row.public_access_failed_attempts || 0) + 1
    const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS
    await pool.query(
      `
        UPDATE sales
        SET public_access_failed_attempts = $2,
            public_access_locked_until = CASE WHEN $3 THEN NOW() + ($4 || ' minutes')::interval ELSE public_access_locked_until END
        WHERE id = $1
      `,
      [row.id, failedAttempts, shouldLock, LOCK_MINUTES]
    )

    return {
      ok: false,
      status: shouldLock ? 423 : 401,
      message: shouldLock
        ? "Muitas tentativas incorretas. Tente novamente mais tarde."
        : "Código incorreto. Verifique a etiqueta e tente novamente.",
    }
  }

  await pool.query(
    `
      UPDATE sales
      SET public_access_failed_attempts = 0,
          public_access_locked_until = NULL,
          public_access_last_viewed_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  )

  return {
    ok: true,
    status: 200,
    purchase: await buildPublicPurchaseDetails(row),
  }
}

function documentItemName(...parts: Array<string | null>) {
  return uniqueDeviceName(...parts)
}

function additionalDocumentItemName(item: AdditionalSaleItemRow) {
  const storedName = getAdditionalItemDisplayName(item.name)
  if (storedName !== "Item adicional") return storedName
  return documentItemName(item.model, item.variant, item.storage, item.color)
}

function buildSaleDocuments(input: {
  row: SaleAccessRow
  additionalItems: AdditionalSaleItemRow[]
  paymentLines: Array<{ method: string; amount: number }>
  rawPaymentLines: PublicPaymentLine[]
  purchaseAmount: number
  tradeInCreditAmount: number
  tradeInDeviceName: string | null
  settings: Record<string, unknown>
}) {
  const warrantyMonths = Number(input.row.warranty_months || 0)
  const quantity = parseQtyFromNotes(input.row.sale_notes)
  const mainName = documentItemName(input.row.model, input.row.variant, input.row.storage, input.row.color)
  const upsellTotal = input.additionalItems.reduce((sum, item) => {
    return item.type === "upsell" ? sum + Number(item.sale_price || 0) : sum
  }, 0)
  const principalSaleTotal = Math.max(0, input.purchaseAmount - upsellTotal)
  const suggestedMainTotal = Number(input.row.inventory_suggested_price || 0) * quantity
  const officialMainTotal = suggestedMainTotal > 0 ? suggestedMainTotal : principalSaleTotal
  const officialMainUnit = quantity > 0 ? officialMainTotal / quantity : officialMainTotal
  const discountAmount = suggestedMainTotal > 0 ? Math.max(0, suggestedMainTotal - principalSaleTotal) : 0
  const paymentMethod = input.paymentLines.length > 1
    ? "Pagamento misto"
    : input.paymentLines[0]?.method || formatPaymentMethod(input.row.payment_method)
  const saleNotes = input.row.sale_notes || input.row.condition_notes || null
  const additionalItemsSummary = input.additionalItems.length
    ? input.additionalItems.map((item) => `${additionalDocumentItemName(item)}${item.type === "free" ? " (brinde)" : ""}`).join(", ")
    : null
  const warrantyAdditionalItemsSummary = input.additionalItems.length
    ? input.additionalItems.map((item) => `1x ${additionalDocumentItemName(item)}${item.type === "free" ? " (brinde)" : ""}`).join(", ")
    : null
  const economics = calculateSplitPaymentEconomics({
    saleRevenue: input.purchaseAmount,
    payments: input.rawPaymentLines.map((payment) => ({
      payment_method: payment.paymentMethod || input.row.payment_method || "other",
      amount: payment.amount,
      status: "received",
    })),
    settings: input.settings,
    costTotal: 0,
  })
  const tradeInName = input.tradeInDeviceName
    ? getTradeInDisplayName({
        model: input.tradeInDeviceName,
        storage: input.row.trade_in_storage || undefined,
        color: input.row.trade_in_color || undefined,
        fallback: "Aparelho recebido",
      })
    : null

  const receiptItems: ReceiptLineItem[] = [
    {
      name: mainName,
      imei: input.row.imei || null,
      imei2: input.row.imei2 || null,
      quantity,
      unitPrice: officialMainUnit,
      totalPrice: officialMainTotal,
      warrantyMonths,
      type: "principal",
    },
    ...input.additionalItems.map((item) => {
      const isFree = item.type === "free"
      const itemPrice = isFree ? 0 : Number(item.sale_price || 0)
      return {
        name: additionalDocumentItemName(item),
        imei: item.imei || null,
        imei2: item.imei2 || null,
        quantity: 1,
        unitPrice: itemPrice,
        totalPrice: itemPrice,
        warrantyMonths,
        type: isFree ? "free" as const : "upsell" as const,
      }
    }),
  ]

  const baseDocument = {
    saleId: input.row.id,
    saleDate: dateOnly(input.row.sale_date) || new Date().toISOString().slice(0, 10),
    customerName: input.row.customer_name || "Cliente",
    customerCpf: input.row.customer_cpf || null,
    customerPhone: input.row.customer_phone || null,
    paymentMethod,
    payments: input.paymentLines,
  }

  const receiptDocument: SaleDocumentData = {
    ...baseDocument,
    saleNotes,
    additionalItems: additionalItemsSummary,
    item: {
      name: mainName,
      imei: input.row.imei || null,
      imei2: input.row.imei2 || null,
      quantity: 1,
      unitPrice: officialMainUnit,
      totalPrice: officialMainTotal,
      warrantyMonths,
    },
    receiptItems,
    receiptSummary: {
      officialProductTotal: officialMainTotal + upsellTotal,
      saleTotal: input.purchaseAmount,
      discountAmount,
      tradeInName,
      tradeInGrade: input.row.trade_in_grade || null,
      tradeInValue: input.tradeInCreditAmount,
      cashAmountDue: economics.storeCashReceives,
      customerPaid: economics.customerCashPays,
      embeddedFee: economics.embeddedFee,
      storeReceives: economics.storeReceives,
    },
  }

  const warrantyDocument: SaleDocumentData = {
    ...baseDocument,
    saleNotes,
    additionalItems: warrantyAdditionalItemsSummary,
    item: {
      name: mainName,
      imei: input.row.imei || null,
      imei2: input.row.imei2 || null,
      quantity: 1,
      unitPrice: input.purchaseAmount,
      totalPrice: input.purchaseAmount,
      warrantyMonths,
    },
  }

  return { receiptDocument, warrantyDocument }
}

async function buildPublicPurchaseDetails(row: SaleAccessRow): Promise<PublicPurchaseDetails> {
  const additionalItems = await getAdditionalItemsForSale(row.id)
  const publicPayments = await getPublicPaymentsForSale(row.id)
  const inventoryIds = [
    row.inventory_id,
    ...additionalItems.map((item) => item.product_id),
  ].filter((id): id is string => Boolean(id))
  const problemsByInventoryId = await getProblemsByInventoryId(row.id, inventoryIds)
  const deviceName = uniqueDeviceName(row.model, row.variant, row.storage)
  const { saleDate, warrantyStart, warrantyEnd } = warrantyPeriodFromSale(row)
  const settings = companySettings(row.company_settings)
  const support = whatsappUrl(settings.phone)
  const purchaseAmount = Number(row.sale_price || 0)
  const tradeInCreditAmount = row.has_trade_in || row.trade_in_id
    ? Math.max(0, Number(row.trade_in_value || 0))
    : 0
  const tradeInApplied = tradeInCreditAmount > 0
  const amountPaid = Math.max(0, purchaseAmount - tradeInCreditAmount)
  const tradeInDeviceModel = uniqueDeviceName(row.trade_in_notes, row.trade_in_model, row.trade_in_variant, row.trade_in_storage)
  const tradeInDevice = tradeInApplied
    ? {
        model: tradeInDeviceModel === "Aparelho não informado" ? null : tradeInDeviceModel,
        storage: row.trade_in_storage || null,
        color: row.trade_in_color || null,
        maskedImei: maskTrailing(row.trade_in_inventory_imei || row.trade_in_imei),
        maskedSerial: maskTrailing(row.trade_in_inventory_serial_number || row.trade_in_serial_number),
        creditAmount: tradeInCreditAmount,
      }
    : null
  const paymentMethod = formatPaymentMethod(row.payment_method)
  const rawPaymentLines = publicPayments.length > 0
    ? publicPayments
    : [{ method: paymentMethod, paymentMethod: row.payment_method, amount: amountPaid }]
  const paymentLines = rawPaymentLines.map((payment) => ({
    method: payment.method,
    amount: payment.amount,
  }))
  const principalIssues = row.inventory_id ? problemsByInventoryId.get(row.inventory_id) || [] : []
  const principalItem: PublicPurchaseItem = {
    id: "principal",
    type: "principal",
    label: publicItemLabel("principal"),
    model: deviceName,
    storage: row.storage || null,
    color: row.color || null,
    grade: row.grade || null,
    batteryHealth: row.battery_health === null || row.battery_health === undefined ? null : Number(row.battery_health),
    boxType: packagingLabel(row.packaging_type, row.packaging_notes),
    photoUrl: firstPhoto(row.inventory_photos),
    imei: maskTrailing(row.imei),
    serial: maskTrailing(row.serial_number),
    warrantyStart,
    warrantyEnd,
    issues: principalIssues,
  }

  const purchaseItems: PublicPurchaseItem[] = [
    principalItem,
    ...additionalItems.map((item, index) => {
      const itemType = normalizePublicItemType(item.type)
      const issues = item.product_id ? problemsByInventoryId.get(item.product_id) || [] : []
      return {
        id: `item_${index + 1}`,
        type: itemType,
        label: publicItemLabel(itemType),
        model: uniqueDeviceName(getAdditionalItemDisplayName(item.name), item.model, item.variant, item.storage),
        storage: item.storage || null,
        color: item.color || null,
        grade: item.grade || null,
        batteryHealth: item.battery_health === null || item.battery_health === undefined ? null : Number(item.battery_health),
        boxType: packagingLabel(item.packaging_type, item.packaging_notes),
        photoUrl: null,
        imei: maskTrailing(item.imei),
        serial: maskTrailing(item.serial_number),
        warrantyStart: null,
        warrantyEnd: null,
        issues,
      }
    }),
  ]
  const assistance = purchaseItems.flatMap((item) =>
    item.issues.map((issue) => ({
      ...issue,
      itemId: item.id,
      itemName: item.model,
    }))
  )
  const documents = buildSaleDocuments({
    row,
    additionalItems,
    paymentLines,
    rawPaymentLines,
    purchaseAmount,
    tradeInCreditAmount,
    tradeInDeviceName: tradeInDeviceModel === "Aparelho não informado" ? null : tradeInDeviceModel,
    settings,
  })

  return {
    customerName: firstName(row.customer_name) || "cliente",
    support,
    sale: {
      number: saleNumber(row.id),
      date: saleDate,
      purchaseAmount,
      amountPaid,
      paymentMethod: paymentLines.length > 1 ? "Pagamento misto" : paymentLines[0]?.method || paymentMethod,
      remainingPaymentMethod: paymentLines.length > 1 ? "Pagamento misto" : paymentLines[0]?.method || paymentMethod,
      payments: paymentLines,
      tradeInApplied,
      tradeInCreditAmount,
      tradeInDevice,
      status: "Concluída",
      warrantyStart,
      warrantyEnd,
      warrantyStatus: warrantyStatus(warrantyEnd),
    },
    device: {
      model: principalItem.model,
      storage: principalItem.storage,
      color: principalItem.color,
      grade: principalItem.grade,
      batteryHealth: principalItem.batteryHealth,
      boxType: principalItem.boxType,
      photoUrl: principalItem.photoUrl,
      imei: principalItem.imei,
      serial: principalItem.serial,
    },
    purchaseItems,
    provenance: buildProvenance(row),
    documents: {
      receiptAvailable: true,
      warrantyAvailable: Boolean(warrantyStart && warrantyEnd) || Boolean(row.warranty_pdf_url),
      technicalReportUrl: row.checklist_pdf_url || null,
      receiptDocument: documents.receiptDocument,
      warrantyDocument: documents.warrantyDocument,
    },
    assistance,
  }
}

export async function ensureSalePublicAccess(saleId: string, companyId?: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generatePublicAccessToken()
    const pin = generatePublicAccessPin()
    try {
      const result = await pool.query(
        `
          UPDATE sales
          SET public_access_token = COALESCE(public_access_token, $2),
              public_access_pin = COALESCE(public_access_pin, $3),
              public_access_enabled = COALESCE(public_access_enabled, TRUE),
              public_access_created_at = COALESCE(public_access_created_at, NOW()),
              public_access_failed_attempts = COALESCE(public_access_failed_attempts, 0),
              public_access_locked_until = NULL
          WHERE id = $1
            AND COALESCE(sale_status, 'completed') = 'completed'
            AND ($4::uuid IS NULL OR company_id = $4::uuid)
          RETURNING *
        `,
        [saleId, token, pin, companyId || null]
      )
      return result.rows[0] || null
    } catch (error: unknown) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "23505")) throw error
    }
  }
  throw new Error("Não foi possível gerar um token único para esta compra.")
}

export async function regenerateSalePublicPin(saleId: string, companyId?: string) {
  const result = await pool.query(
    `
      UPDATE sales
      SET public_access_pin = $2,
          public_access_failed_attempts = 0,
          public_access_locked_until = NULL
      WHERE id = $1
        AND COALESCE(sale_status, 'completed') = 'completed'
        AND public_access_token IS NOT NULL
        AND ($3::uuid IS NULL OR company_id = $3::uuid)
      RETURNING *
    `,
    [saleId, generatePublicAccessPin(), companyId || null]
  )
  return result.rows[0] || null
}
