import "server-only"

import { pool } from "@/lib/db"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chave Iconify do ícone do selo (ex: "mdi:whatsapp"). Aceita também chaves
// legadas ("shield_check", ...) resolvidas em @/lib/catalog/badge-icons.
export type CatalogTrustBadgeIcon = string

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

export async function upsertCatalogSettings(
  companyId: string,
  settings: Partial<CatalogPublicSettings>
): Promise<void> {
  if (!UUID_RE.test(companyId)) throw new Error("Invalid company ID")

  const current = await getCatalogSettings(companyId)
  const next = { ...current, ...settings }

  await pool.query(
    `INSERT INTO catalog_settings (
      company_id, hero_tagline, empty_state_title, empty_state_description,
      no_results_title, no_results_description, grid_heading, grid_subheading
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (company_id) DO UPDATE SET
      hero_tagline = EXCLUDED.hero_tagline,
      empty_state_title = EXCLUDED.empty_state_title,
      empty_state_description = EXCLUDED.empty_state_description,
      no_results_title = EXCLUDED.no_results_title,
      no_results_description = EXCLUDED.no_results_description,
      grid_heading = EXCLUDED.grid_heading,
      grid_subheading = EXCLUDED.grid_subheading,
      updated_at = NOW()`,
    [
      companyId,
      next.heroTagline,
      next.emptyStateTitle,
      next.emptyStateDescription,
      next.noResultsTitle,
      next.noResultsDescription,
      next.gridHeading,
      next.gridSubheading,
    ]
  )
}

export async function createCatalogTrustBadge(
  companyId: string,
  badge: Omit<CatalogTrustBadge, "id">
): Promise<string> {
  if (!UUID_RE.test(companyId)) throw new Error("Invalid company ID")

  const result = await pool.query<{ id: string }>(
    `INSERT INTO catalog_trust_badges (
      company_id, icon_key, label, description, sort_order, show_on_catalog, show_on_product, active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
    RETURNING id`,
    [
      companyId,
      badge.iconKey,
      badge.label,
      badge.description,
      badge.sortOrder,
      badge.showOnCatalog,
      badge.showOnProduct,
    ]
  )
  return result.rows[0].id
}

export async function updateCatalogTrustBadge(
  companyId: string,
  badgeId: string,
  badge: Partial<Omit<CatalogTrustBadge, "id"> & { active: boolean }>
): Promise<void> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(badgeId)) throw new Error("Invalid IDs")

  const updates: string[] = []
  const values: unknown[] = [companyId, badgeId]
  let idx = 3

  if (badge.iconKey !== undefined) {
    updates.push(`icon_key = $${idx++}`)
    values.push(badge.iconKey)
  }
  if (badge.label !== undefined) {
    updates.push(`label = $${idx++}`)
    values.push(badge.label)
  }
  if (badge.description !== undefined) {
    updates.push(`description = $${idx++}`)
    values.push(badge.description)
  }
  if (badge.sortOrder !== undefined) {
    updates.push(`sort_order = $${idx++}`)
    values.push(badge.sortOrder)
  }
  if (badge.showOnCatalog !== undefined) {
    updates.push(`show_on_catalog = $${idx++}`)
    values.push(badge.showOnCatalog)
  }
  if (badge.showOnProduct !== undefined) {
    updates.push(`show_on_product = $${idx++}`)
    values.push(badge.showOnProduct)
  }
  if (badge.active !== undefined) {
    updates.push(`active = $${idx++}`)
    values.push(badge.active)
  }

  if (updates.length === 0) return

  updates.push(`updated_at = NOW()`)

  await pool.query(
    `UPDATE catalog_trust_badges
     SET ${updates.join(", ")}
     WHERE company_id = $1 AND id = $2`,
    values
  )
}

export async function deleteCatalogTrustBadge(companyId: string, badgeId: string): Promise<void> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(badgeId)) throw new Error("Invalid IDs")

  // Logical delete as preferred for auditability and safety
  await pool.query(
    `UPDATE catalog_trust_badges SET active = FALSE, updated_at = NOW() WHERE company_id = $1 AND id = $2`,
    [companyId, badgeId]
  )
}
