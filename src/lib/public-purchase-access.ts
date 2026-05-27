import { randomBytes, randomInt } from "crypto"
import { pool } from "@/lib/db"
import { addDaysISO, formatPaymentMethod, getAdditionalItemDisplayName, getTradeInDisplayName } from "@/lib/helpers"
import { calculateSplitPaymentEconomics } from "@/lib/sale-payments"
import { parseQtyFromNotes } from "@/lib/sale-totals"
import type { DocumentWarranty, ReceiptLineItem, SaleDocumentData } from "@/lib/sale-documents"

const TOKEN_PREFIX = "ntcv_"
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

export type PublicPurchaseIntro = {
  available: boolean
  lockedUntil: string | null
  company: PublicPurchaseCompany
  message?: string
}

export type PublicPurchaseDetails = {
  company: PublicPurchaseCompany
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
    variationText: string | null
    finalAmount: number | null
    originalAmount: number | null
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
    technicalReportDocument: PublicTechnicalReportDocument | null
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

export type PublicPurchaseCompany = {
  displayName: string | null
  shortName: string | null
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

export type PublicTechnicalReportDocument = {
  productName: string
  imei: string
  serial: string
  grade: string
  date: string
  items: Array<{ label: string; status: string; note?: string }>
  battery?: number
  iosVersion?: string
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
  variationText: string | null
  finalAmount: number | null
  originalAmount: number | null
  warrantyStart: string | null
  warrantyEnd: string | null
  warranty: PublicPurchaseItemWarranty
  issues: PublicPurchaseIssue[]
}

export type PublicPurchaseItemWarranty = {
  source: "item" | "legacy" | "none"
  name: string | null
  label: string | null
  nature: string | null
  startsAt: string | null
  endsAt: string | null
  statusLabel: string
  note: string | null
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
  company_name: string | null
  company_display_name: string | null
  company_short_name: string | null
  company_settings: Record<string, unknown> | string | null
  inventory_id: string | null
  inventory_purchase_date: string | Date | null
  inventory_created_at: string | Date | null
  inventory_origin: string | null
  inventory_supplier_name: string | null
  inventory_photos: string[] | null
  inventory_notes: string | null
  previous_sale_date: string | Date | null
  previous_owner_name: string | null
  previous_owner_cpf: string | null
  checklist_completed_at: string | Date | null
  checklist_created_at: string | Date | null
  checklist_pdf_url: string | null
  checklist_items: Array<{ label?: string; status?: string; note?: string }> | null
  model: string | null
  variant: string | null
  storage: string | null
  color: string | null
  grade: string | null
  battery_health: number | null
  ios_version: string | null
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

type PublicProductImageRow = {
  product_id: string
  image_url: string
  thumbnail_url: string
}

type AdditionalSaleItemRow = {
  id: string
  product_id: string | null
  type: string | null
  name: string | null
  sale_price: string | number | null
  inventory_suggested_price: string | number | null
  packaging_type: string | null
  packaging_notes: string | null
  inventory_notes: string | null
  condition_notes: string | null
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

type SaleVariantSelectionRow = {
  scope: "main" | "additional"
  inventoryId: string
  variantName: string | null
  quantity: number
}

type PublicPaymentLine = {
  method: string
  paymentMethod: string | null
  amount: number
}

type SaleItemWarrantyRow = {
  sale_item_id: string
  source_table: string
  source_id: string | null
  warranty_nature: string
  warranty_name: string
  warranty_label: string | null
  calculation_mode: string
  starts_at: string | Date | null
  ends_at: string | Date | null
  duration_months: number | null
  duration_days: number | null
  manufacturer_coverage_reference: string | null
  manual_notes: string | null
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

function packagingLabel(type?: string | null, notes?: string | null, companyShortName?: string | null) {
  const note = notes?.trim()
  if (type === "original_box") return "Caixa original"
  if (type === "nobretech_box") return companyShortName ? `Caixa ${companyShortName}` : "Caixa da loja"
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

function itemWarrantyStatusLabel(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt && !endsAt) return "Conforme cobertura informada"
  if (!endsAt) return "Conforme cobertura informada"
  return warrantyStatus(endsAt)
}

function itemWarrantyNote(warranty: Pick<SaleItemWarrantyRow, "warranty_nature" | "calculation_mode" | "ends_at" | "manufacturer_coverage_reference" | "manual_notes">) {
  const manualNote = warranty.manual_notes?.trim()
  if (manualNote) return manualNote
  const manufacturerReference = warranty.manufacturer_coverage_reference?.trim()
  if (manufacturerReference) return manufacturerReference
  if (warranty.warranty_nature === "manufacturer" || (warranty.calculation_mode === "manual_dates" && !warranty.ends_at)) {
    return "Conforme cobertura informada pelo fabricante."
  }
  return null
}

function publicCompanyBrand(row: Pick<SaleAccessRow, "company_name" | "company_display_name" | "company_short_name">): PublicPurchaseCompany {
  const displayName = cleanDisplayText(row.company_display_name) || cleanDisplayText(row.company_name)
  const shortName = cleanDisplayText(row.company_short_name) || displayName
  return {
    displayName,
    shortName,
  }
}

function storeWarrantyLabel(companyShortName?: string | null) {
  return companyShortName ? `Garantia ${companyShortName}` : "Garantia da loja"
}

function noContractualWarranty(companyShortName?: string | null): PublicPurchaseItemWarranty {
  const label = companyShortName
    ? `Sem Garantia ${companyShortName} contratual vinculada a este item.`
    : "Sem garantia contratual da loja vinculada a este item."

  return {
    source: "none",
    name: null,
    label,
    nature: null,
    startsAt: null,
    endsAt: null,
    statusLabel: "Sem garantia contratual vinculada",
    note: "Danos por uso, queda, impacto, riscos, mau uso ou desgaste natural não são cobertos como garantia contratual.",
  }
}

function legacyWarranty(start: string | null, end: string | null): PublicPurchaseItemWarranty {
  return {
    source: "legacy",
    name: "Garantia geral da compra",
    label: null,
    nature: "legacy",
    startsAt: start,
    endsAt: end,
    statusLabel: warrantyStatus(end),
    note: "Compatibilidade com vendas antigas sem garantia por item.",
  }
}

function publicItemWarranty(row: SaleItemWarrantyRow, companyShortName?: string | null): PublicPurchaseItemWarranty {
  const startsAt = dateOnly(row.starts_at)
  const endsAt = dateOnly(row.ends_at)
  const durationLabel = row.duration_months
    ? ` — ${row.duration_months} meses`
    : row.duration_days
      ? ` — ${row.duration_days} dias`
      : ""
  const isContractual = row.warranty_nature === "contractual"
  const label = isContractual
    ? `${storeWarrantyLabel(companyShortName)}${durationLabel}`
    : row.warranty_label

  return {
    source: "item",
    name: isContractual ? label : row.warranty_name,
    label,
    nature: row.warranty_nature,
    startsAt,
    endsAt,
    statusLabel: itemWarrantyStatusLabel(startsAt, endsAt),
    note: itemWarrantyNote(row),
  }
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

function buildProvenance(row: SaleAccessRow, companyShortName?: string | null) {
  const stockEntryDate = dateOnly(row.inventory_purchase_date) || dateOnly(row.inventory_created_at)
  const inspectionDate = dateOnly(row.checklist_completed_at) || dateOnly(row.checklist_created_at)
  const hasPreviousOwner = Boolean(row.previous_owner_name || row.previous_owner_cpf || row.inventory_origin === "trade_in")
  const grade = String(row.grade || "").toLowerCase()
  const isSealed = grade.includes("lacrado") || grade.includes("novo")
  const kind: PublicPurchaseDetails["provenance"]["kind"] = hasPreviousOwner ? "trade_in" : isSealed ? "sealed" : stockEntryDate ? "supplier" : "unknown"
  const descriptions = {
    trade_in: "Este aparelho passou por validação de origem, conferência técnica e registro de entrada antes da venda.",
    supplier: companyShortName
      ? `Este aparelho foi adquirido por fornecedor parceiro da ${companyShortName} e passou por registro de entrada, conferência técnica e validação antes da venda.`
      : "Este aparelho foi adquirido por fornecedor parceiro da loja e passou por registro de entrada, conferência técnica e validação antes da venda.",
    sealed: "Este produto foi adquirido por fornecedor/distribuidor parceiro e passou por validação comercial antes da venda.",
    unknown: companyShortName
      ? `Este aparelho possui rastreabilidade em atualização no sistema da ${companyShortName}.`
      : "Este aparelho possui rastreabilidade em atualização no sistema da loja.",
  } satisfies Record<typeof kind, string>
  const privacyNotes = {
    trade_in: "Dados parcialmente ocultos por segurança e conformidade com a LGPD.",
    supplier: companyShortName
      ? `Informações comerciais do fornecedor preservadas por segurança e política interna da ${companyShortName}.`
      : "Informações comerciais do fornecedor preservadas por segurança e política interna da loja.",
    sealed: "Informações comerciais preservadas por política interna.",
    unknown: companyShortName
      ? `Informações de procedência ainda estão sendo atualizadas pela ${companyShortName}.`
      : "Informações de procedência ainda estão sendo atualizadas pela loja.",
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

function cleanDisplayText(value?: string | null) {
  const text = value?.trim()
  return text || null
}

function realInventoryDisplayName(input: {
  storedName?: string | null
  model?: string | null
  variant?: string | null
  storage?: string | null
  color?: string | null
  inventoryNotes?: string | null
  conditionNotes?: string | null
}) {
  const storedName = getAdditionalItemDisplayName(input.storedName)
  if (storedName !== "Item adicional") return storedName

  const customName = input.inventoryNotes?.match(/^Nome:\s*(.+)$/i)?.[1]?.trim()
  if (customName) return customName

  const notesName = cleanDisplayText(input.inventoryNotes?.replace(/^Acessório:\s*/i, ""))
  if (notesName) return notesName

  const conditionName = input.conditionNotes?.match(/^Acessório:\s*(.+)$/i)?.[1]?.trim() || cleanDisplayText(input.conditionNotes)
  if (conditionName) return conditionName

  return uniqueDeviceName(input.model || null, input.variant || null, input.storage || null, input.color || null)
}

function variationText(value?: string | null) {
  return cleanDisplayText(value)
}

function moneyAmount(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null
}

function zeroMoney() {
  return 0
}

function consumeVariantSelection(
  selections: SaleVariantSelectionRow[],
  scope: SaleVariantSelectionRow["scope"],
  inventoryId?: string | null
) {
  if (!inventoryId) return null
  const index = selections.findIndex((item) => item.scope === scope && item.inventoryId === inventoryId)
  if (index < 0) return null
  const [selection] = selections.splice(index, 1)
  return variationText(selection?.variantName)
}

async function getSaleVariantSelections(saleId: string) {
  const result = await pool.query<{ new_data: Record<string, unknown> | null }>(
    `
      SELECT new_data
      FROM audit_logs
      WHERE table_name = 'sales'
        AND record_id = $1::uuid
        AND action = 'created'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [saleId]
  )
  const rawSelections = result.rows[0]?.new_data?.variantSelections
  if (!Array.isArray(rawSelections)) return []

  return rawSelections
    .map((item): SaleVariantSelectionRow | null => {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const scope = row.scope === "main" || row.scope === "additional" ? row.scope : null
      const inventoryId = typeof row.inventoryId === "string" ? row.inventoryId : null
      if (!scope || !inventoryId) return null
      return {
        scope,
        inventoryId,
        variantName: typeof row.variantName === "string" ? row.variantName : null,
        quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
      }
    })
    .filter((item): item is SaleVariantSelectionRow => Boolean(item))
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
        i.suggested_price AS inventory_suggested_price,
        sai.packaging_type,
        sai.packaging_notes,
        i.notes AS inventory_notes,
        i.condition_notes,
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

async function getSaleItemWarrantiesForSale(saleId: string, companyShortName?: string | null) {
  const result = await pool.query<SaleItemWarrantyRow>(
    `
      SELECT
        siw.sale_item_id,
        si.source_table,
        si.source_id,
        siw.warranty_nature,
        siw.warranty_name,
        siw.warranty_label,
        siw.calculation_mode,
        siw.starts_at,
        siw.ends_at,
        siw.duration_months,
        siw.duration_days,
        siw.manufacturer_coverage_reference,
        siw.manual_notes
      FROM sale_item_warranties siw
      JOIN sale_items si ON si.id = siw.sale_item_id
      WHERE siw.sale_id = $1::uuid
        AND siw.active = TRUE
        AND si.active = TRUE
      ORDER BY si.sort_order ASC, si.created_at ASC
    `,
    [saleId]
  )

  return new Map(
    result.rows
      .filter((row) => row.source_table && row.source_id)
      .map((row) => [`${row.source_table}:${row.source_id}`, publicItemWarranty(row, companyShortName)])
  )
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

async function getPrimaryProductImagesByInventoryId(inventoryIds: string[]) {
  if (inventoryIds.length === 0) return new Map<string, PublicProductImageRow>()

  const result = await pool.query<PublicProductImageRow>(
    `
      SELECT DISTINCT ON (product_id)
        product_id,
        image_url,
        thumbnail_url
      FROM product_images
      WHERE product_id = ANY($1::uuid[])
        AND is_primary = true
      ORDER BY product_id, created_at DESC
    `,
    [inventoryIds]
  )

  return new Map(result.rows.map((row) => [row.product_id, row]))
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
        co.name AS company_name,
        cbp.display_name AS company_display_name,
        cbp.short_name AS company_short_name,
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
        i.notes AS inventory_notes,
        i.grade,
        i.battery_health,
        i.ios_version,
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
        ch.pdf_url AS checklist_pdf_url,
        ch.items AS checklist_items
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN companies co ON co.id = s.company_id
      LEFT JOIN LATERAL (
        SELECT display_name, short_name
        FROM company_brand_profile
        WHERE company_id = s.company_id
          AND active = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
      ) cbp ON true
      LEFT JOIN financial_settings fs ON fs.company_id = s.company_id
      LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
      LEFT JOIN inventory tii ON tii.id = ti.linked_inventory_id
      LEFT JOIN product_catalog tipc ON tipc.id = tii.catalog_id
      LEFT JOIN inventory i ON i.id = s.inventory_id
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      LEFT JOIN sales ps ON ps.id = i.source_sale_id
      LEFT JOIN customers pc_owner ON pc_owner.id = ps.customer_id
      LEFT JOIN LATERAL (
        SELECT completed_at, created_at, pdf_url, items
        FROM checklists
        WHERE id = i.checklist_id OR inventory_id = i.id
        ORDER BY completed_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
      ) ch ON true
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
  const company = row ? publicCompanyBrand(row) : { displayName: null, shortName: null }
  if (!isAvailable(row)) {
    return {
      available: false,
      lockedUntil: null,
      company,
      message: "Esta compra não está disponível para consulta.",
    }
  }

  return {
    available: true,
    lockedUntil: row && isLocked(row) ? new Date(row.public_access_locked_until as string).toISOString() : null,
    company,
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
  itemWarrantiesBySource: Map<string, PublicPurchaseItemWarranty>
  hasItemWarranties: boolean
  company: PublicPurchaseCompany
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
  const mainWarranty = input.itemWarrantiesBySource.get(`sales:${input.row.id}`)
    || (input.hasItemWarranties ? noContractualWarranty(input.company.shortName) : legacyWarranty(dateOnly(input.row.warranty_start), dateOnly(input.row.warranty_end)))
  const additionalWarranties = new Map(
    input.additionalItems.map((item) => [
      item.id,
      input.itemWarrantiesBySource.get(`sales_additional_items:${item.id}`) || noContractualWarranty(input.company.shortName),
    ])
  )
  const documentWarranty: DocumentWarranty = input.hasItemWarranties
    ? {
        mode: "item",
        legacyWarranty: null,
        items: [
          {
            name: mainName,
            role: "principal",
            type: "device",
            warranty: mainWarranty,
          },
          ...input.additionalItems.map((item) => ({
            name: additionalDocumentItemName(item),
            role: item.type === "free" ? "free" : "upsell",
            type: item.type === "free" ? "gift" : "additional",
            warranty: additionalWarranties.get(item.id) || noContractualWarranty(input.company.shortName),
          })),
        ],
      }
    : {
        mode: "legacy",
        items: [],
        legacyWarranty: {
          months: warrantyMonths,
          startsAt: dateOnly(input.row.warranty_start),
          endsAt: dateOnly(input.row.warranty_end),
        },
      }
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
      warranty: mainWarranty,
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
        warranty: additionalWarranties.get(item.id),
      }
    }),
  ]

  const baseDocument = {
    saleId: input.row.id,
    saleDate: dateOnly(input.row.sale_date) || new Date().toISOString().slice(0, 10),
    customerName: input.row.customer_name || "Cliente",
    customerCpf: input.row.customer_cpf || null,
    customerPhone: input.row.customer_phone || null,
    company: {
      displayName: input.company.displayName,
      shortName: input.company.shortName,
      phone: typeof input.settings.phone === "string" ? input.settings.phone : null,
    },
    paymentMethod,
    payments: input.paymentLines,
    documentWarranty,
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
      warranty: mainWarranty,
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
      warranty: mainWarranty,
    },
  }

  return { receiptDocument, warrantyDocument }
}

function buildTechnicalReportDocument(row: SaleAccessRow): PublicTechnicalReportDocument | null {
  if (!row.checklist_items?.length) return null

  return {
    productName: documentItemName(row.model, row.variant, row.storage, row.color),
    imei: maskTrailing(row.imei) || "—",
    serial: maskTrailing(row.serial_number) || "—",
    grade: row.grade || "—",
    date: dateOnly(row.checklist_completed_at || row.checklist_created_at) || new Date().toISOString().slice(0, 10),
    items: row.checklist_items.map((item) => ({
      label: item.label || "Item avaliado",
      status: item.status || "na",
      note: item.note || undefined,
    })),
    battery: row.battery_health === null || row.battery_health === undefined ? undefined : Number(row.battery_health),
    iosVersion: row.ios_version || undefined,
  }
}

async function buildPublicPurchaseDetails(row: SaleAccessRow): Promise<PublicPurchaseDetails> {
  const company = publicCompanyBrand(row)
  const additionalItems = await getAdditionalItemsForSale(row.id)
  const variantSelections = await getSaleVariantSelections(row.id)
  const publicPayments = await getPublicPaymentsForSale(row.id)
  const itemWarrantiesBySource = await getSaleItemWarrantiesForSale(row.id, company.shortName)
  const hasItemWarranties = itemWarrantiesBySource.size > 0
  const inventoryIds = [
    row.inventory_id,
    ...additionalItems.map((item) => item.product_id),
  ].filter((id): id is string => Boolean(id))
  const problemsByInventoryId = await getProblemsByInventoryId(row.id, inventoryIds)
  const imagesByInventoryId = await getPrimaryProductImagesByInventoryId(inventoryIds)
  const deviceName = realInventoryDisplayName({
    model: row.model,
    variant: row.variant,
    storage: row.storage,
    color: row.color,
    inventoryNotes: row.inventory_notes,
    conditionNotes: row.condition_notes,
  })
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
  const principalImage = row.inventory_id ? imagesByInventoryId.get(row.inventory_id) : null
  const additionalChargedTotal = additionalItems.reduce((sum, item) => {
    if (normalizePublicItemType(item.type) === "free") return sum
    return sum + Number(item.sale_price || 0)
  }, 0)
  const principalFinalAmount = Math.max(0, Math.round((purchaseAmount - additionalChargedTotal) * 100) / 100)
  const principalItem: PublicPurchaseItem = {
    id: "principal",
    type: "principal",
    label: publicItemLabel("principal"),
    model: deviceName,
    storage: row.storage || null,
    color: row.color || null,
    grade: row.grade || null,
    batteryHealth: row.battery_health === null || row.battery_health === undefined ? null : Number(row.battery_health),
    boxType: packagingLabel(row.packaging_type, row.packaging_notes, company.shortName),
    photoUrl: principalImage?.image_url || firstPhoto(row.inventory_photos),
    imei: maskTrailing(row.imei),
    serial: maskTrailing(row.serial_number),
    variationText: consumeVariantSelection(variantSelections, "main", row.inventory_id),
    finalAmount: principalFinalAmount,
    originalAmount: null,
    warrantyStart,
    warrantyEnd,
    warranty: itemWarrantiesBySource.get(`sales:${row.id}`) || (hasItemWarranties ? noContractualWarranty(company.shortName) : legacyWarranty(warrantyStart, warrantyEnd)),
    issues: principalIssues,
  }

  const purchaseItems: PublicPurchaseItem[] = [
    principalItem,
    ...additionalItems.map((item, index) => {
      const itemType = normalizePublicItemType(item.type)
      const issues = item.product_id ? problemsByInventoryId.get(item.product_id) || [] : []
      const itemImage = item.product_id ? imagesByInventoryId.get(item.product_id) : null
      const itemName = realInventoryDisplayName({
        storedName: item.name,
        model: item.model,
        variant: item.variant,
        storage: item.storage,
        color: item.color,
        inventoryNotes: item.inventory_notes,
        conditionNotes: item.condition_notes,
      })
      const saleAmount = moneyAmount(item.sale_price)
      const originalAmount = moneyAmount(item.inventory_suggested_price) || saleAmount
      return {
        id: `item_${index + 1}`,
        type: itemType,
        label: publicItemLabel(itemType),
        model: itemName,
        storage: item.storage || null,
        color: item.color || null,
        grade: item.grade || null,
        batteryHealth: item.battery_health === null || item.battery_health === undefined ? null : Number(item.battery_health),
        boxType: packagingLabel(item.packaging_type, item.packaging_notes, company.shortName),
        photoUrl: itemImage?.image_url || null,
        imei: maskTrailing(item.imei),
        serial: maskTrailing(item.serial_number),
        variationText: consumeVariantSelection(variantSelections, "additional", item.product_id),
        finalAmount: itemType === "free" ? zeroMoney() : saleAmount,
        originalAmount: itemType === "free" ? originalAmount : null,
        warrantyStart: null,
        warrantyEnd: null,
        warranty: itemWarrantiesBySource.get(`sales_additional_items:${item.id}`) || noContractualWarranty(company.shortName),
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
    itemWarrantiesBySource,
    hasItemWarranties,
    company,
    paymentLines,
    rawPaymentLines,
    purchaseAmount,
    tradeInCreditAmount,
    tradeInDeviceName: tradeInDeviceModel === "Aparelho não informado" ? null : tradeInDeviceModel,
    settings,
  })
  const technicalReportDocument = buildTechnicalReportDocument(row)

  return {
    company,
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
      variationText: principalItem.variationText,
      finalAmount: principalItem.finalAmount,
      originalAmount: principalItem.originalAmount,
    },
    purchaseItems,
    provenance: buildProvenance(row, company.shortName),
    documents: {
      receiptAvailable: true,
      warrantyAvailable: Boolean(warrantyStart && warrantyEnd) || Boolean(row.warranty_pdf_url),
      technicalReportUrl: row.checklist_pdf_url || null,
      technicalReportDocument,
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
            AND COALESCE(customer_type, 'identified') <> 'walk_in'
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
        AND COALESCE(customer_type, 'identified') <> 'walk_in'
        AND public_access_token IS NOT NULL
        AND ($3::uuid IS NULL OR company_id = $3::uuid)
      RETURNING *
    `,
    [saleId, generatePublicAccessPin(), companyId || null]
  )
  return result.rows[0] || null
}
