export type WarrantyCalculationMode = "calendar_months" | "fixed_days" | "manual_dates"

export type WarrantyNature = "legal" | "contractual" | "manufacturer" | "operational_support" | "legacy"

export type WarrantyTermType =
  | "coverage"
  | "exclusion"
  | "assistance"
  | "refund_exchange"
  | "customer_responsibility"
  | "legal_note"
  | "other"

export type WarrantyPolicy = {
  id: string
  companyId: string
  name: string
  productType: string | null
  productCondition: string | null
  productOrigin: string | null
  defaultMonths: number | null
  defaultDays: number | null
  calculationMode: WarrantyCalculationMode
  warrantyNature: WarrantyNature
  isSelectable: boolean
  isDefault: boolean
  selectionLabel: string | null
  selectionDescription: string | null
  legalBasis: string | null
  priority: number
  publicLabelTemplate: string | null
  internalDescription: string | null
  requiresCustomerIdentification: boolean
  appliesToSale: boolean
  appliesToCatalog: boolean
  appliesToPortal: boolean
  appliesToDocuments: boolean
  active: boolean
  effectiveFrom: string
  effectiveUntil: string | null
  createdAt: string
  updatedAt: string
}

export type WarrantyPolicyTerm = {
  id: string
  warrantyPolicyId: string
  termType: WarrantyTermType
  title: string
  body: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type WarrantyPolicyWithTerms = {
  policy: WarrantyPolicy
  terms: WarrantyPolicyTerm[]
}

export type WarrantyResolutionCriteria = {
  productType?: string | null
  productCondition?: string | null
  productOrigin?: string | null
  warrantyNature?: WarrantyNature | null
  usageContext?: "sale" | "catalog" | "portal" | "documents" | null
}

export type WarrantyResolution = WarrantyPolicyWithTerms | null

export type WarrantyMutationResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type WarrantyActor = {
  userId: string | null
  email: string | null
}

export type WarrantyPolicyInput = {
  name: string
  productType: string
  productCondition: string
  productOrigin: string
  defaultMonths: number | string
  defaultDays: number | string
  calculationMode: WarrantyCalculationMode | string
  warrantyNature: WarrantyNature | string
  isSelectable: boolean
  isDefault: boolean
  selectionLabel: string
  selectionDescription: string
  legalBasis: string
  priority: number | string
  publicLabelTemplate: string
  internalDescription: string
  requiresCustomerIdentification: boolean
  appliesToSale: boolean
  appliesToCatalog: boolean
  appliesToPortal: boolean
  appliesToDocuments: boolean
  effectiveFrom: string
  effectiveUntil: string
}

export type WarrantyPolicyTermInput = {
  termType: WarrantyTermType | string
  title: string
  body: string
  sortOrder: number | string
}
