import "server-only"

import { readQueryWithRetry } from "@/lib/db"
import { resolveCompanyIdentity } from "@/lib/company-settings/queries"
import type { CompanyContactChannel, CompanyContactChannelType } from "@/lib/company-settings/types"

export type CatalogWhatsAppContact = {
  url: string
  phone: string
}

export type CatalogInstagramContact = {
  handle: string
  url: string
}

export type CatalogCompanyIdentity = {
  companyId: string | null
  displayName: string
  shortName: string
  publicDescription: string | null
  city: string | null
  state: string | null
  canonicalDomain: string | null
  catalogUrl: string | null
  ogImageUrl: string | null
  whatsapp: CatalogWhatsAppContact | null
  instagram: CatalogInstagramContact | null
}

async function resolvePublicCompanyId(): Promise<string | null> {
  const explicit = process.env.NOBRETECH_PUBLIC_COMPANY_ID
  if (explicit) return explicit
  const result = await readQueryWithRetry<{ id: string }>(
    "SELECT id FROM companies ORDER BY created_at ASC LIMIT 1"
  )
  return result.rows[0]?.id ?? null
}

function neutralIdentity(): CatalogCompanyIdentity {
  return {
    companyId: null,
    displayName: "Loja",
    shortName: "loja",
    publicDescription: null,
    city: null,
    state: null,
    canonicalDomain: null,
    catalogUrl: null,
    ogImageUrl: null,
    whatsapp: null,
    instagram: null,
  }
}

function pickContact(
  channels: CompanyContactChannel[],
  type: CompanyContactChannelType
): CompanyContactChannel | null {
  const candidates = channels
    .filter((c) => c.channelType === type && c.active && c.isPublic)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
  return candidates[0] ?? null
}

function whatsappFrom(channel: CompanyContactChannel | null): CatalogWhatsAppContact | null {
  if (!channel) return null
  const digits = channel.value.replace(/\D/g, "")
  if (!digits) return null
  return { url: `https://wa.me/${digits}`, phone: digits }
}

function instagramFrom(channel: CompanyContactChannel | null): CatalogInstagramContact | null {
  if (!channel) return null
  const handle = channel.value.replace(/^@/, "").trim()
  if (!handle) return null
  const url = channel.url?.trim() || `https://instagram.com/${handle}`
  return { handle: `@${handle}`, url }
}

function buildCatalogUrl(canonicalDomain: string | null): string | null {
  if (!canonicalDomain) return null
  const cleaned = canonicalDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  if (!cleaned) return null
  return `https://${cleaned}/catalogo`
}

export async function getCatalogCompanyIdentity(): Promise<CatalogCompanyIdentity> {
  const companyId = await resolvePublicCompanyId()
  if (!companyId) return neutralIdentity()

  const resolution = await resolveCompanyIdentity(companyId)
  if (!resolution.ok) return neutralIdentity()

  const data = resolution.data
  const brand = data.brandProfile
  const channels = data.contactChannels

  const canonicalDomain = brand?.canonicalDomain ?? null
  const catalogUrl = buildCatalogUrl(canonicalDomain)
  const whatsapp = whatsappFrom(pickContact(channels, "whatsapp"))
  const instagram = instagramFrom(pickContact(channels, "instagram"))

  const displayName = data.displayName || brand?.displayName || data.companyName || "Loja"
  const shortName = brand?.shortName || data.shortName || displayName || "loja"

  return {
    companyId,
    displayName,
    shortName,
    publicDescription: brand?.publicDescription ?? null,
    city: brand?.city ?? null,
    state: brand?.state ?? null,
    canonicalDomain,
    catalogUrl,
    ogImageUrl: brand?.ogImageUrl ?? null,
    whatsapp,
    instagram,
  }
}

export function buildCatalogProductUrl(identity: CatalogCompanyIdentity, slug: string): string | null {
  if (!identity.canonicalDomain) return null
  const cleaned = identity.canonicalDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  if (!cleaned) return null
  return `https://${cleaned}/catalogo/${slug}`
}

export function buildCatalogLocationLabel(identity: CatalogCompanyIdentity): string | null {
  if (identity.city && identity.state) return `${identity.city}, ${identity.state}`
  if (identity.city) return identity.city
  return null
}
