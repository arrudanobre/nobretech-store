export const SUPPLIER_OFFER_CONDITIONS = ["sealed", "used", "unknown"] as const
export const SUPPLIER_OFFER_CONFIDENCES = ["high", "medium", "low"] as const
export const SUPPLIER_OFFER_AVAILABILITIES = ["available", "unavailable", "unknown"] as const
export const SUPPLIER_OFFER_STATUSES = [
  "draft",
  "available",
  "needs_review",
  "ignored",
  "unavailable",
  "reserved_with_supplier",
  "converted_to_inventory",
  "canceled",
  "superseded",
] as const
export const SUPPLIER_OFFER_WARRANTY_TYPES = ["none", "apple", "nobretech", "supplier", "unknown"] as const
export const SUPPLIER_OFFER_REVIEW_STATUSES = ["ready", "needs_review", "ignored", "duplicate"] as const
export const SUPPLIER_OFFER_PARSE_SOURCES = ["ai", "local"] as const

export type SupplierOfferCondition = (typeof SUPPLIER_OFFER_CONDITIONS)[number]
export type SupplierOfferConfidence = (typeof SUPPLIER_OFFER_CONFIDENCES)[number]
export type SupplierOfferAvailability = (typeof SUPPLIER_OFFER_AVAILABILITIES)[number]
export type SupplierOfferStatus = (typeof SUPPLIER_OFFER_STATUSES)[number]
export type SupplierOfferWarrantyType = (typeof SUPPLIER_OFFER_WARRANTY_TYPES)[number]
export type SupplierOfferReviewStatus = (typeof SUPPLIER_OFFER_REVIEW_STATUSES)[number]
export type SupplierOfferParseSource = (typeof SUPPLIER_OFFER_PARSE_SOURCES)[number]

// Statuses that get superseded when a newer list replaces the old one.
// reserved_with_supplier is intentionally excluded — it is an active commitment.
export const SUPERSEDABLE_STATUSES: SupplierOfferStatus[] = ["available", "draft", "needs_review"]

export type ParsedSupplierOffer = {
  sourceLine: string
  sourceSection: string | null
  category: string | null
  brand: string | null
  model: string | null
  variant: string | null
  storage: string | null
  size: string | null
  color: string | null
  condition: SupplierOfferCondition
  internalGrade: string | null
  batteryHealth: number | null
  warrantyType: SupplierOfferWarrantyType
  warrantyLabel: string | null
  warrantyUntil: string | null
  origin: string | null
  supplierPrice: number | null
  availability: SupplierOfferAvailability
  confidence: SupplierOfferConfidence
  warnings: string[]
  duplicateKey?: string | null
  duplicateCandidate?: boolean
  reviewStatus?: SupplierOfferReviewStatus
  parserSource?: SupplierOfferParseSource
}

export type ReviewedSupplierOffer = ParsedSupplierOffer & {
  status?: SupplierOfferStatus
  suggestedSalePrice?: number | null
  estimatedMargin?: number | null
}
