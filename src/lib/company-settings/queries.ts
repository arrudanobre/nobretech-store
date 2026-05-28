import "server-only"

import { readQueryWithRetry } from "@/lib/db"
import type {
  CompanyBrandProfile,
  CompanyContactChannel,
  CompanyContactChannelType,
  CompanyDocumentProfile,
  CompanyIdentity,
  CompanySettingsAuditLog,
  CompanySettingsDomain,
  CompanySettingsDomainResolution,
  CompanySettingsResolution,
  CompanyThemeMode,
} from "./types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CompanyRow = {
  id: string
  name: string
}

type BrandProfileRow = {
  id: string
  company_id: string
  display_name: string
  legal_name: string | null
  short_name: string | null
  slogan: string | null
  public_description: string | null
  canonical_domain: string | null
  city: string | null
  state: string | null
  locale: string
  primary_color: string | null
  accent_color: string | null
  logo_url: string | null
  favicon_url: string | null
  apple_icon_url: string | null
  og_image_url: string | null
  theme_mode: CompanyThemeMode
  active: boolean
  created_at: Date | string
  updated_at: Date | string
}

type ContactChannelRow = {
  id: string
  company_id: string
  channel_type: CompanyContactChannelType
  label: string
  value: string
  url: string | null
  is_primary: boolean
  is_public: boolean
  sort_order: number
  active: boolean
  created_at: Date | string
  updated_at: Date | string
}

type DocumentProfileRow = {
  id: string
  company_id: string
  issuer_name: string
  legal_name: string | null
  document_number: string | null
  address_line: string | null
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  default_seller_name: string | null
  signature_label: string | null
  active: boolean
  effective_from: Date | string
  effective_until: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

function toISOString(value: Date | string | null) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function invalidCompanyError() {
  return {
    code: "INVALID_COMPANY_ID" as const,
    message: "companyId invalido para resolucao de configuracoes da empresa.",
  }
}

function companyNotFoundError(companyId: string) {
  return {
    code: "COMPANY_NOT_FOUND" as const,
    message: `Empresa nao encontrada para companyId ${companyId}.`,
  }
}

function unsupportedDomainError(domain: string) {
  return {
    code: "UNSUPPORTED_DOMAIN" as const,
    message: `Dominio de configuracao nao suportado: ${domain}.`,
  }
}

function isValidCompanyId(companyId: string) {
  return UUID_RE.test(companyId)
}

function mapBrandProfile(row: BrandProfileRow): CompanyBrandProfile {
  return {
    id: row.id,
    companyId: row.company_id,
    displayName: row.display_name,
    legalName: row.legal_name,
    shortName: row.short_name,
    slogan: row.slogan,
    publicDescription: row.public_description,
    canonicalDomain: row.canonical_domain,
    city: row.city,
    state: row.state,
    locale: row.locale,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    appleIconUrl: row.apple_icon_url,
    ogImageUrl: row.og_image_url,
    themeMode: row.theme_mode,
    active: row.active,
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

function mapContactChannel(row: ContactChannelRow): CompanyContactChannel {
  return {
    id: row.id,
    companyId: row.company_id,
    channelType: row.channel_type,
    label: row.label,
    value: row.value,
    url: row.url,
    isPrimary: row.is_primary,
    isPublic: row.is_public,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

function mapDocumentProfile(row: DocumentProfileRow): CompanyDocumentProfile {
  return {
    id: row.id,
    companyId: row.company_id,
    issuerName: row.issuer_name,
    legalName: row.legal_name,
    documentNumber: row.document_number,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    phone: row.phone,
    email: row.email,
    defaultSellerName: row.default_seller_name,
    signatureLabel: row.signature_label,
    active: row.active,
    effectiveFrom: toISOString(row.effective_from) ?? "",
    effectiveUntil: toISOString(row.effective_until),
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

async function getCompany(companyId: string): Promise<CompanyRow | null> {
  if (!isValidCompanyId(companyId)) return null

  const result = await readQueryWithRetry<CompanyRow>(
    `
      SELECT id, name
      FROM companies
      WHERE id = $1
      LIMIT 1
    `,
    [companyId]
  )

  return result.rows[0] ?? null
}

export async function getCompanyBrandProfile(companyId: string): Promise<CompanyBrandProfile | null> {
  if (!isValidCompanyId(companyId)) return null

  const result = await readQueryWithRetry<BrandProfileRow>(
    `
      SELECT
        id,
        company_id,
        display_name,
        legal_name,
        short_name,
        slogan,
        public_description,
        canonical_domain,
        city,
        state,
        locale,
        primary_color,
        accent_color,
        logo_url,
        favicon_url,
        apple_icon_url,
        og_image_url,
        theme_mode,
        active,
        created_at,
        updated_at
      FROM company_brand_profile
      WHERE company_id = $1
        AND active = TRUE
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [companyId]
  )

  const row = result.rows[0]
  return row ? mapBrandProfile(row) : null
}

export async function getCompanyContactChannels(
  companyId: string,
  options: { includeInactive?: boolean } = {}
): Promise<CompanyContactChannel[]> {
  if (!isValidCompanyId(companyId)) return []

  const result = await readQueryWithRetry<ContactChannelRow>(
    `
      SELECT
        id,
        company_id,
        channel_type,
        label,
        value,
        url,
        is_primary,
        is_public,
        sort_order,
        active,
        created_at,
        updated_at
      FROM company_contact_channels
      WHERE company_id = $1
        AND ($2::boolean = TRUE OR active = TRUE)
      ORDER BY sort_order ASC, label ASC, id ASC
    `,
    [companyId, Boolean(options.includeInactive)]
  )

  return result.rows.map(mapContactChannel)
}

export async function getPrimaryCompanyContactChannel(
  companyId: string,
  channelType: CompanyContactChannelType
): Promise<CompanyContactChannel | null> {
  if (!isValidCompanyId(companyId)) return null

  const result = await readQueryWithRetry<ContactChannelRow>(
    `
      SELECT
        id,
        company_id,
        channel_type,
        label,
        value,
        url,
        is_primary,
        is_public,
        sort_order,
        active,
        created_at,
        updated_at
      FROM company_contact_channels
      WHERE company_id = $1
        AND channel_type = $2
        AND active = TRUE
      ORDER BY is_primary DESC, sort_order ASC, label ASC, id ASC
      LIMIT 1
    `,
    [companyId, channelType]
  )

  const row = result.rows[0]
  return row ? mapContactChannel(row) : null
}

export async function getCompanyDocumentProfile(companyId: string): Promise<CompanyDocumentProfile | null> {
  if (!isValidCompanyId(companyId)) return null

  const result = await readQueryWithRetry<DocumentProfileRow>(
    `
      SELECT
        id,
        company_id,
        issuer_name,
        legal_name,
        document_number,
        address_line,
        city,
        state,
        phone,
        email,
        default_seller_name,
        signature_label,
        active,
        effective_from,
        effective_until,
        created_at,
        updated_at
      FROM company_document_profile
      WHERE company_id = $1
        AND active = TRUE
        AND effective_from <= NOW()
        AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY effective_from DESC, updated_at DESC
      LIMIT 1
    `,
    [companyId]
  )

  const row = result.rows[0]
  return row ? mapDocumentProfile(row) : null
}

export async function resolveCompanyIdentity(
  companyId: string
): Promise<CompanySettingsResolution<CompanyIdentity>> {
  if (!isValidCompanyId(companyId)) {
    return { ok: false, error: invalidCompanyError() }
  }

  const company = await getCompany(companyId)
  if (!company) {
    return { ok: false, error: companyNotFoundError(companyId) }
  }

  const [brandProfile, contactChannels, documentProfile] = await Promise.all([
    getCompanyBrandProfile(companyId),
    getCompanyContactChannels(companyId),
    getCompanyDocumentProfile(companyId),
  ])

  const missing: CompanyIdentity["missing"] = []
  if (!brandProfile) missing.push("brand")
  if (!documentProfile) missing.push("document")

  return {
    ok: true,
    data: {
      companyId,
      companyName: company.name,
      brandProfile,
      contactChannels,
      documentProfile,
      displayName: brandProfile?.displayName ?? company.name,
      shortName: brandProfile?.shortName ?? null,
      logoUrl: brandProfile?.logoUrl ?? null,
      isComplete: missing.length === 0,
      missing,
    },
  }
}

export async function getCompanySettingsAuditLogs(
  companyId: string,
  limit = 20
): Promise<CompanySettingsAuditLog[]> {
  if (!isValidCompanyId(companyId)) return []

  const result = await readQueryWithRetry<{
    id: string
    company_id: string
    actor_user_id: string | null
    actor_email: string | null
    domain: string
    entity_table: string
    entity_id: string | null
    action: string
    before_snapshot: Record<string, unknown> | null
    after_snapshot: Record<string, unknown> | null
    metadata: Record<string, unknown> | null
    created_at: Date | string
  }>(
    `
      SELECT
        id,
        company_id,
        actor_user_id,
        actor_email,
        domain,
        entity_table,
        entity_id,
        action,
        before_snapshot,
        after_snapshot,
        metadata,
        created_at
      FROM company_settings_audit_logs
      WHERE company_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [companyId, limit]
  )

  return result.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    domain: row.domain as CompanySettingsAuditLog["domain"],
    entityTable: row.entity_table,
    entityId: row.entity_id,
    action: row.action as CompanySettingsAuditLog["action"],
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
    metadata: row.metadata,
    createdAt: toISOString(row.created_at) ?? "",
  }))
}

export async function resolveCompanySettings(
  companyId: string,
  domain: CompanySettingsDomain
): Promise<CompanySettingsDomainResolution> {
  if (!isValidCompanyId(companyId)) {
    return { ok: false, domain, error: invalidCompanyError() } as CompanySettingsDomainResolution
  }

  const company = await getCompany(companyId)
  if (!company) {
    return { ok: false, domain, error: companyNotFoundError(companyId) } as CompanySettingsDomainResolution
  }

  if (domain === "brand") {
    return { ok: true, domain, data: await getCompanyBrandProfile(companyId) }
  }

  if (domain === "contacts") {
    return { ok: true, domain, data: await getCompanyContactChannels(companyId) }
  }

  if (domain === "document") {
    return { ok: true, domain, data: await getCompanyDocumentProfile(companyId) }
  }

  if (domain === "identity") {
    const identity = await resolveCompanyIdentity(companyId)
    return identity.ok
      ? { ok: true, domain, data: identity.data }
      : { ok: false, domain, error: identity.error }
  }

  return {
    ok: false,
    domain,
    error: unsupportedDomainError(domain),
  } as CompanySettingsDomainResolution
}
