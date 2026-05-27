import { pool } from "@/lib/db"
import { getCatalogPublicationReadiness } from "@/lib/catalog/readiness"
import { getConditionFromGrade } from "@/lib/catalog/score"
import {
  conditionFromProductKind,
  getCatalogPublicationPolicies,
  getCatalogReadinessRulesForPolicies,
  pickPolicyForCriteria,
} from "@/lib/catalog/policies"
import type {
  CatalogAdminItem,
  CatalogAdminSummary,
  CatalogImageRecord,
  CatalogIncludedItemRecord,
  CatalogPublicationRecord,
  CatalogReviewRecord,
} from "@/lib/catalog/admin-types"

type InventoryRow = {
  id: string
  status: string
  grade: string | null
  battery_health: number | null
  imei: string | null
  suggested_price: string | number | null
  category_db: string | null
  model: string | null
  storage: string | null
  color: string | null
  product_type: string | null
  category_snapshot: string | null
}

const INVENTORY_QUERY = `
  SELECT
    i.id,
    i.status,
    i.grade,
    i.battery_health,
    i.imei,
    i.suggested_price,
    pc.category AS category_db,
    pc.model AS model,
    pc.storage AS storage,
    pc.color AS color,
    i.product_type,
    i.category_name_snapshot AS category_snapshot
  FROM inventory i
  LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
  WHERE i.company_id = $1::uuid
    AND i.status IN ('active', 'in_stock', 'reserved', 'pending')
  ORDER BY i.created_at DESC
  LIMIT 500
`

const PUBLICATIONS_QUERY = `
  SELECT
    id, inventory_item_id, is_published, public_status, public_title,
    public_description, public_price, promo_price, installment_count,
    show_installments, highlight, cover_image_id, notes_internal,
    published_at::text AS published_at,
    created_at::text AS created_at,
    updated_at::text AS updated_at
  FROM catalog_publications
  WHERE company_id = $1::uuid
`

const REVIEWS_QUERY = `
  SELECT
    id, inventory_item_id, publication_id, product_kind, overall_score,
    screen_score, screen_notes, sides_score, sides_notes,
    back_score, back_notes, battery_score, battery_notes,
    cameras_score, cameras_notes, biometrics_score, biometrics_notes,
    audio_score, audio_notes, connectivity_score, connectivity_notes,
    general_score, general_notes, reviewed_at::text AS reviewed_at,
    updated_at::text AS updated_at
  FROM catalog_condition_reviews
  WHERE company_id = $1::uuid
`

const ITEMS_QUERY = `
  SELECT id, inventory_item_id, publication_id, label, is_included, sort_order
  FROM catalog_included_items
  WHERE company_id = $1::uuid
  ORDER BY inventory_item_id, sort_order, created_at
`

const IMAGES_QUERY = `
  SELECT
    id, product_id, image_url, thumbnail_url, source, is_primary,
    sort_order, alt, created_at::text AS created_at
  FROM product_images
  WHERE company_id = $1::uuid
  ORDER BY product_id, is_primary DESC, sort_order, created_at
`

function categoryLabel(category: string | null, fallback: string | null): string {
  if (!category && !fallback) return "Apple"
  const value = (category || fallback || "").toLowerCase()
  if (value === "iphone") return "iPhone"
  if (value === "ipad") return "iPad"
  if (value === "macbook") return "MacBook"
  if (value === "applewatch" || value === "apple watch") return "Apple Watch"
  if (value === "airpods") return "AirPods"
  if (value === "garmin") return "Garmin"
  if (value === "accessories" || value === "acessorios" || value === "acessórios") return "Acessórios"
  return fallback || category || "Apple"
}

function priceToNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === "number") return value
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function maskImei(imei: string | null): string | null {
  if (!imei) return null
  const cleaned = imei.replace(/\D/g, "")
  if (cleaned.length < 6) return null
  const head = cleaned.slice(0, 2)
  const tail = cleaned.slice(-2)
  const middle = "•".repeat(Math.max(4, cleaned.length - 4))
  return `${head}${middle}${tail}`
}

function normalizePublication(row: Record<string, unknown>): CatalogPublicationRecord {
  return {
    id: String(row.id),
    inventory_item_id: String(row.inventory_item_id),
    is_published: Boolean(row.is_published),
    public_status: row.public_status as CatalogPublicationRecord["public_status"],
    public_title: (row.public_title as string | null) ?? null,
    public_description: (row.public_description as string | null) ?? null,
    public_price: priceToNumber(row.public_price as string | number | null),
    promo_price: priceToNumber(row.promo_price as string | number | null),
    installment_count: Number(row.installment_count ?? 10),
    show_installments: Boolean(row.show_installments),
    highlight: Boolean(row.highlight),
    cover_image_id: (row.cover_image_id as string | null) ?? null,
    notes_internal: (row.notes_internal as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function normalizeReview(row: Record<string, unknown>): CatalogReviewRecord {
  const toNum = (value: unknown) => priceToNumber(value as string | number | null)
  return {
    id: String(row.id),
    inventory_item_id: String(row.inventory_item_id),
    publication_id: (row.publication_id as string | null) ?? null,
    product_kind: row.product_kind as CatalogReviewRecord["product_kind"],
    overall_score: toNum(row.overall_score),
    screen_score: toNum(row.screen_score),
    screen_notes: (row.screen_notes as string | null) ?? null,
    sides_score: toNum(row.sides_score),
    sides_notes: (row.sides_notes as string | null) ?? null,
    back_score: toNum(row.back_score),
    back_notes: (row.back_notes as string | null) ?? null,
    battery_score: toNum(row.battery_score),
    battery_notes: (row.battery_notes as string | null) ?? null,
    cameras_score: toNum(row.cameras_score),
    cameras_notes: (row.cameras_notes as string | null) ?? null,
    biometrics_score: toNum(row.biometrics_score),
    biometrics_notes: (row.biometrics_notes as string | null) ?? null,
    audio_score: toNum(row.audio_score),
    audio_notes: (row.audio_notes as string | null) ?? null,
    connectivity_score: toNum(row.connectivity_score),
    connectivity_notes: (row.connectivity_notes as string | null) ?? null,
    general_score: toNum(row.general_score),
    general_notes: (row.general_notes as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    updated_at: String(row.updated_at),
  }
}

function normalizeIncluded(row: Record<string, unknown>): CatalogIncludedItemRecord {
  return {
    id: String(row.id),
    inventory_item_id: String(row.inventory_item_id),
    publication_id: (row.publication_id as string | null) ?? null,
    label: String(row.label),
    is_included: Boolean(row.is_included),
    sort_order: Number(row.sort_order ?? 0),
  }
}

function normalizeImage(row: Record<string, unknown>): CatalogImageRecord {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    image_url: String(row.image_url),
    thumbnail_url: String(row.thumbnail_url),
    source: row.source as CatalogImageRecord["source"],
    is_primary: Boolean(row.is_primary),
    sort_order: Number(row.sort_order ?? 0),
    alt: (row.alt as string | null) ?? null,
    created_at: String(row.created_at),
  }
}

export async function loadAdminCatalog(companyId: string): Promise<{
  items: CatalogAdminItem[]
  summary: CatalogAdminSummary
}> {
  const [inventoryResult, publicationsResult, reviewsResult, itemsResult, imagesResult, policies] = await Promise.all([
    pool.query<InventoryRow>(INVENTORY_QUERY, [companyId]),
    pool.query(PUBLICATIONS_QUERY, [companyId]),
    pool.query(REVIEWS_QUERY, [companyId]),
    pool.query(ITEMS_QUERY, [companyId]),
    pool.query(IMAGES_QUERY, [companyId]),
    getCatalogPublicationPolicies(companyId),
  ])

  const rulesByPolicy = await getCatalogReadinessRulesForPolicies(policies.map((p) => p.id))

  const publicationsByInv = new Map<string, CatalogPublicationRecord>()
  for (const row of publicationsResult.rows) {
    const record = normalizePublication(row as Record<string, unknown>)
    publicationsByInv.set(record.inventory_item_id, record)
  }

  const reviewsByInv = new Map<string, CatalogReviewRecord>()
  for (const row of reviewsResult.rows) {
    const record = normalizeReview(row as Record<string, unknown>)
    reviewsByInv.set(record.inventory_item_id, record)
  }

  const itemsByInv = new Map<string, CatalogIncludedItemRecord[]>()
  for (const row of itemsResult.rows) {
    const record = normalizeIncluded(row as Record<string, unknown>)
    const list = itemsByInv.get(record.inventory_item_id) || []
    list.push(record)
    itemsByInv.set(record.inventory_item_id, list)
  }

  const imagesByProduct = new Map<string, CatalogImageRecord[]>()
  for (const row of imagesResult.rows) {
    const record = normalizeImage(row as Record<string, unknown>)
    const list = imagesByProduct.get(record.product_id) || []
    list.push(record)
    imagesByProduct.set(record.product_id, list)
  }

  const items: CatalogAdminItem[] = inventoryResult.rows.map((row) => {
    const grade = row.grade
    const condition = getConditionFromGrade(grade)
    const publication = publicationsByInv.get(row.id) || null
    const review = reviewsByInv.get(row.id) || null
    const includedItems = itemsByInv.get(row.id) || []
    const images = imagesByProduct.get(row.id) || []
    const hasRealPhotos = images.some((image) => image.source === "uploaded")

    const modelLabel = row.model || row.category_snapshot || "Apple"
    const subtitleParts = [row.storage, row.color].filter(Boolean) as string[]
    const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" • ") : null
    const category = row.category_db || row.category_snapshot
    const catLabel = categoryLabel(category, row.category_snapshot)

    const policy = pickPolicyForCriteria(policies, {
      productType: "device",
      condition: conditionFromProductKind(condition),
    })
    const rules = policy ? rulesByPolicy.get(policy.id) ?? [] : []

    const readiness = getCatalogPublicationReadiness({
      productKind: condition,
      productType: row.product_type,
      inventoryStatus: row.status,
      publication,
      review,
      includedItems,
      images,
      hasRealPhotos,
      policy,
      rules,
    })

    return {
      inventoryId: row.id,
      title: modelLabel,
      subtitle,
      category,
      categoryLabel: catLabel,
      grade,
      productKind: condition,
      inventoryStatus: row.status,
      suggestedPrice: priceToNumber(row.suggested_price),
      batteryHealth: row.battery_health,
      imeiMasked: maskImei(row.imei),
      publication,
      review,
      includedItems,
      images,
      hasRealPhotos,
      readiness,
    }
  })

  const summary: CatalogAdminSummary = items.reduce(
    (acc, item) => {
      acc.total += 1
      if (item.readiness.status === "published") acc.published += 1
      if (item.readiness.status === "ready") acc.ready += 1
      if (item.readiness.status === "blocked") acc.blocked += 1
      if (item.productKind !== "sealed" && !item.hasRealPhotos) acc.missingPhotos += 1
      if (item.productKind !== "sealed" && (!item.review || item.review.overall_score == null)) {
        acc.missingReview += 1
      }
      return acc
    },
    { total: 0, published: 0, ready: 0, blocked: 0, missingPhotos: 0, missingReview: 0 } as CatalogAdminSummary,
  )

  return { items, summary }
}
