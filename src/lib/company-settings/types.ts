export const companySettingsDomains = ["brand", "contacts", "document", "identity"] as const

export type CompanySettingsDomain = (typeof companySettingsDomains)[number]

export type CompanyContactChannelType =
  | "whatsapp"
  | "instagram"
  | "email"
  | "phone"
  | "website"
  | "address"
  | "other"

export type CompanyThemeMode = "light" | "dark" | "system"

export type CompanySettingsErrorCode =
  | "INVALID_COMPANY_ID"
  | "COMPANY_NOT_FOUND"
  | "UNSUPPORTED_DOMAIN"

export type CompanySettingsError = {
  code: CompanySettingsErrorCode
  message: string
}

export type CompanyBrandProfile = {
  id: string
  companyId: string
  displayName: string
  legalName: string | null
  shortName: string | null
  slogan: string | null
  publicDescription: string | null
  canonicalDomain: string | null
  city: string | null
  state: string | null
  locale: string
  primaryColor: string | null
  accentColor: string | null
  logoUrl: string | null
  faviconUrl: string | null
  appleIconUrl: string | null
  ogImageUrl: string | null
  themeMode: CompanyThemeMode
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CompanyContactChannel = {
  id: string
  companyId: string
  channelType: CompanyContactChannelType
  label: string
  value: string
  url: string | null
  isPrimary: boolean
  isPublic: boolean
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CompanyDocumentProfile = {
  id: string
  companyId: string
  issuerName: string
  legalName: string | null
  documentNumber: string | null
  addressLine: string | null
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  defaultSellerName: string | null
  signatureLabel: string | null
  active: boolean
  effectiveFrom: string
  effectiveUntil: string | null
  createdAt: string
  updatedAt: string
}

export type CompanyIdentity = {
  companyId: string
  companyName: string
  brandProfile: CompanyBrandProfile | null
  contactChannels: CompanyContactChannel[]
  documentProfile: CompanyDocumentProfile | null
  displayName: string | null
  shortName: string | null
  logoUrl: string | null
  isComplete: boolean
  missing: Array<"brand" | "document">
}

export type CompanySettingsDataByDomain = {
  brand: CompanyBrandProfile | null
  contacts: CompanyContactChannel[]
  document: CompanyDocumentProfile | null
  identity: CompanyIdentity
}

export type CompanySettingsResolution<T> =
  | { ok: true; data: T }
  | { ok: false; error: CompanySettingsError }

export type CompanySettingsDomainResolution =
  | ({ domain: "brand" } & CompanySettingsResolution<CompanySettingsDataByDomain["brand"]>)
  | ({ domain: "contacts" } & CompanySettingsResolution<CompanySettingsDataByDomain["contacts"]>)
  | ({ domain: "document" } & CompanySettingsResolution<CompanySettingsDataByDomain["document"]>)
  | ({ domain: "identity" } & CompanySettingsResolution<CompanySettingsDataByDomain["identity"]>)

export type CompanySettingsAuditLogDomain = "brand" | "contact" | "document" | "warranty"

export type CompanySettingsAuditLogAction =
  | "update_brand"
  | "create_contact"
  | "update_contact"
  | "deactivate_contact"
  | "reactivate_contact"
  | "update_document_profile"
  | "create_warranty_policy"
  | "update_warranty_policy"
  | "deactivate_warranty_policy"
  | "create_warranty_term"
  | "update_warranty_term"
  | "deactivate_warranty_term"
  | "create_sale_item_warranty"
  | "update_sale_item_warranty"
  | "deactivate_sale_item_warranty"

export type CompanySettingsAuditLog = {
  id: string
  companyId: string
  actorUserId: string | null
  actorEmail: string | null
  domain: CompanySettingsAuditLogDomain
  entityTable: string
  entityId: string | null
  action: CompanySettingsAuditLogAction
  beforeSnapshot: Record<string, unknown> | null
  afterSnapshot: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
