import "server-only"

import { pool } from "@/lib/db"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CatalogTrustBadgeIcon =
  | "camera"
  | "shield_check"
  | "seal_check"
  | "chat_circle"
  | "truck"
  | "storefront"

export type CatalogTrustBadge = {
  id: string
  iconKey: CatalogTrustBadgeIcon
  label: string
  description: string | null
  sortOrder: number
  showOnCatalog: boolean
  showOnProduct: boolean
}

export type CatalogPublicSettings = {
  heroTagline: string | null
  emptyStateTitle: string | null
  emptyStateDescription: string | null
  noResultsTitle: string | null
  noResultsDescription: string | null
  gridHeading: string | null
  gridSubheading: string | null
}

export type CatalogPublicConfig = {
  settings: CatalogPublicSettings
  catalogBadges: CatalogTrustBadge[]
  productBadges: CatalogTrustBadge[]
}

const DEFAULT_SETTINGS: CatalogPublicSettings = {
  heroTagline: null,
  emptyStateTitle: null,
  emptyStateDescription: null,
  noResultsTitle: null,
  noResultsDescription: null,
  gridHeading: null,
  gridSubheading: null,
}

type SettingsRow = {
  hero_tagline: string | null
  empty_state_title: string | null
  empty_state_description: string | null
  no_results_title: string | null
  no_results_description: string | null
  grid_heading: string | null
  grid_subheading: string | null
}

type BadgeRow = {
  id: string
  icon_key: CatalogTrustBadgeIcon
  label: string
  description: string | null
  sort_order: number
  show_on_catalog: boolean
  show_on_product: boolean
}

function mapSettings(row: SettingsRow | undefined): CatalogPublicSettings {
  if (!row) return DEFAULT_SETTINGS
  return {
    heroTagline: row.hero_tagline,
    emptyStateTitle: row.empty_state_title,
    emptyStateDescription: row.empty_state_description,
    noResultsTitle: row.no_results_title,
    noResultsDescription: row.no_results_description,
    gridHeading: row.grid_heading,
    gridSubheading: row.grid_subheading,
  }
}

function mapBadge(row: BadgeRow): CatalogTrustBadge {
  return {
    id: row.id,
    iconKey: row.icon_key,
    label: row.label,
    description: row.description,
    sortOrder: Number(row.sort_order),
    showOnCatalog: row.show_on_catalog,
    showOnProduct: row.show_on_product,
  }
}

export async function getCatalogSettings(companyId: string): Promise<CatalogPublicSettings> {
  if (!UUID_RE.test(companyId)) return DEFAULT_SETTINGS
  const result = await pool.query<SettingsRow>(
    `SELECT hero_tagline, empty_state_title, empty_state_description,
            no_results_title, no_results_description, grid_heading, grid_subheading
     FROM catalog_settings WHERE company_id = $1 LIMIT 1`,
    [companyId]
  )
  return mapSettings(result.rows[0])
}

export async function getCatalogTrustBadges(companyId: string): Promise<CatalogTrustBadge[]> {
  if (!UUID_RE.test(companyId)) return []
  const result = await pool.query<BadgeRow>(
    `SELECT id, icon_key, label, description, sort_order, show_on_catalog, show_on_product
     FROM catalog_trust_badges
     WHERE company_id = $1 AND active = TRUE
     ORDER BY sort_order ASC, created_at ASC`,
    [companyId]
  )
  return result.rows.map(mapBadge)
}

export async function resolveCatalogPublicConfig(
  companyId: string | null
): Promise<CatalogPublicConfig> {
  if (!companyId) {
    return { settings: DEFAULT_SETTINGS, catalogBadges: [], productBadges: [] }
  }
  const [settings, badges] = await Promise.all([
    getCatalogSettings(companyId),
    getCatalogTrustBadges(companyId),
  ])
  return {
    settings,
    catalogBadges: badges.filter((b) => b.showOnCatalog),
    productBadges: badges.filter((b) => b.showOnProduct),
  }
}
