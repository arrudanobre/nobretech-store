import type { MarketingProduct } from "./copy-generator"

export const MARKETING_SUPPLIER_OFFER_STATUSES = ["available"] as const

// Raw supplier_offers row (snake_case) joined with supplier name/id.
// Numeric columns may arrive as string from pg (NUMERIC) — handled by num().
export interface SupplierOfferRow {
  id: string
  model: string | null
  category: string | null
  storage: string | null
  size: string | null
  color: string | null
  brand: string | null
  condition: string | null
  internal_grade?: string | null
  battery_health: number | string | null
  warranty_label: string | null
  supplier_price: number | string | null
  suggested_sale_price: number | string | null
  status: string | null
  supplier_name: string | null
  supplier_id: string | null
}

function num(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function isSupplierOfferEligibleForMarketing(status: string | null | undefined): boolean {
  return status === "available"
}

export function normalizeMarketingSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function searchableMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  return [
    String(value),
    String(Math.round(value)),
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value),
  ].join(" ")
}

export function matchesSupplierOfferSearch(
  product: Pick<
    MarketingProduct,
    | "sourceType"
    | "name"
    | "category"
    | "storage"
    | "color"
    | "grade"
    | "condition"
    | "warranty_label"
    | "supplierName"
    | "supplierPrice"
    | "suggested_price"
    | "brand"
  >,
  query: string
): boolean {
  const tokens = normalizeMarketingSearchText(query).split(" ").filter(Boolean)
  if (tokens.length === 0) return true
  if (product.sourceType !== "supplier_offer") return false

  const haystack = normalizeMarketingSearchText([
    product.name,
    product.category,
    product.storage,
    product.color,
    product.grade,
    product.condition,
    supplierOfferConditionLabel(product.condition),
    product.warranty_label,
    product.supplierName,
    product.brand,
    searchableMoney(product.supplierPrice),
    searchableMoney(product.suggested_price),
  ].filter(Boolean).join(" "))

  return tokens.every((token) => haystack.includes(token))
}

// Maps a supplier offer DB row to a MarketingProduct.
// sourceType is always "supplier_offer" so the UI keeps the Fornecedor badge
// and the persistence layer stores supplier_offer_id instead of inventory_id.
// supplier_price stays as internal cost only — never used as the public price.
export function supplierOfferRowToMarketingProduct(row: SupplierOfferRow): MarketingProduct {
  const name =
    [row.model, row.storage, row.size, row.color].filter(Boolean).join(" ") ||
    "Produto não identificado"

  return {
    id: row.id,
    name,
    category: row.category ?? null,
    storage: row.storage ?? null,
    color: row.color ?? null,
    brand: row.brand ?? null,
    // Public condition feeds the SAME pipeline as inventory `grade`
    // (conditionLabel/buildTags): sealed → "Lacrado", used → "Seminovo".
    // internalGrade (A/A+) is NEVER mapped here — it stays internal-only.
    grade: row.condition === "sealed" ? "Lacrado" : row.condition === "used" ? "Seminovo" : null,
    // Sealed devices never expose battery anywhere (card, story, copy).
    battery_health: row.condition === "sealed" ? null : num(row.battery_health),
    suggested_price: num(row.suggested_sale_price),
    quantity: 1,
    commercial_status: row.status === "available" ? "available" : row.status ?? "unavailable",
    notes: null,
    has_imei: false,
    warranty_label: row.warranty_label ?? null,
    variants: [],
    sourceType: "supplier_offer",
    supplierPrice: num(row.supplier_price),
    supplierName: row.supplier_name ?? null,
    supplierId: row.supplier_id ?? null,
    condition: row.condition ?? null,
    internalGrade: row.internal_grade ?? null,
  }
}

// Public-safe condition label for the internal card pill.
// internalGrade (A/A+) is intentionally NOT a public condition.
export function supplierOfferConditionLabel(condition: string | null | undefined): string {
  if (condition === "sealed") return "Lacrado"
  if (condition === "used") return "Seminovo"
  return "Condição não informada"
}

function isBatteryRelevant(product: Pick<MarketingProduct, "category" | "name">): boolean {
  const haystack = `${product.category ?? ""} ${product.name ?? ""}`.toLowerCase()
  return /iphone|ipad/.test(haystack)
}

// Battery visibility for a marketing product card / story:
//  - "hidden": sealed (or battery not relevant) → never show battery
//  - "value": battery_health present → show "Bat. XX%"
//  - "missing": used iPhone/iPad without battery → discrete "Bateria não informada"
export function batteryDisplayForMarketingProduct(
  product: Pick<MarketingProduct, "condition" | "battery_health" | "category" | "name" | "sourceType">
): "hidden" | "value" | "missing" {
  if (product.condition === "sealed") return "hidden"
  if (product.battery_health != null) return "value"
  if (product.condition === "used" && isBatteryRelevant(product)) return "missing"
  return "hidden"
}

export interface SupplierOfferSelectorSummary {
  conditionLabel: string
  /** Battery % only when used and present (sealed always null). */
  battery: number | null
  warrantyLabel: string | null
  supplierPrice: number | null
  suggestedPrice: number | null
  supplierName: string | null
  hasSuggestion: boolean
}

// Internal selector summary. Cost/supplier are internal — never public copy.
export function getSupplierOfferSelectorSummary(
  product: Pick<
    MarketingProduct,
    "condition" | "battery_health" | "category" | "name" | "sourceType" | "warranty_label" | "supplierPrice" | "suggested_price" | "supplierName"
  >
): SupplierOfferSelectorSummary {
  const suggestedPrice = product.suggested_price ?? null
  return {
    conditionLabel: supplierOfferConditionLabel(product.condition),
    battery: batteryDisplayForMarketingProduct(product) === "value" ? product.battery_health ?? null : null,
    warrantyLabel: product.warranty_label ?? null,
    supplierPrice: product.supplierPrice ?? null,
    suggestedPrice,
    supplierName: product.supplierName ?? null,
    hasSuggestion: suggestedPrice != null,
  }
}

// Initial campaign card prices when a product is added.
// Supplier offer: base = supplierPrice (internal cost), disclosure =
// suggestedSalePrice. supplierPrice is NEVER used as the disclosure price.
export function supplierOfferCampaignDefaults(
  product: Pick<MarketingProduct, "sourceType" | "supplierPrice" | "suggested_price">
): { baseSeed: number | null; disclosureSeed: number | null } {
  if (product.sourceType === "supplier_offer") {
    return {
      baseSeed: product.supplierPrice ?? null,
      disclosureSeed: product.suggested_price ?? null,
    }
  }
  return {
    baseSeed: product.suggested_price ?? null,
    disclosureSeed: product.suggested_price ?? null,
  }
}

export interface SupplierOfferMargin {
  value: number | null
  status: "ok" | "risk" | "unknown"
}

// Commercial-only margin simulation for the internal card.
// Never feeds DRE / finance / reports. value = disclosurePrice - supplierPrice.
export function calculateSupplierOfferMargin(
  supplierPrice: number | null | undefined,
  disclosurePrice: number | null | undefined
): SupplierOfferMargin {
  if (
    supplierPrice == null ||
    disclosurePrice == null ||
    !Number.isFinite(supplierPrice) ||
    !Number.isFinite(disclosurePrice)
  ) {
    return { value: null, status: "unknown" }
  }
  const value = Math.round((disclosurePrice - supplierPrice) * 100) / 100
  return { value, status: value <= 0 ? "risk" : "ok" }
}

export const SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE =
  "Defina o preço de divulgação das ofertas de fornecedor antes de gerar a arte."

// A supplier offer must have a valid public disclosure price before any art is
// generated. supplierPrice (internal cost) must never be used as the public price.
export function supplierOfferNeedsDisclosurePrice(
  sourceType: string | null | undefined,
  disclosurePrice: number | null | undefined
): boolean {
  if (sourceType !== "supplier_offer") return false
  return disclosurePrice == null || !Number.isFinite(disclosurePrice) || disclosurePrice <= 0
}
