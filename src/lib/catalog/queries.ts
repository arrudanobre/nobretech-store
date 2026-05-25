import { pool } from "@/lib/db"
import { buildCatalogSlug, parseCatalogSlug } from "@/lib/catalog/slug"
import {
  getConditionFromGrade,
  getConditionLabel,
  getScoreLabel,
} from "@/lib/catalog/score"
import {
  buildCatalogInstallmentOptions,
  buildCatalogInstallmentQuote,
  isValidPromoPrice,
  type CatalogPaymentSettings,
} from "@/lib/catalog/pricing"
import { loadCatalogPaymentSettings } from "@/lib/catalog/payment-settings"
import { getCatalogWarrantyLabel } from "@/lib/catalog/warranty"
import { defaultMessageForProduct } from "@/lib/catalog/whatsapp"
import type {
  PublicCatalogCategorySlug,
  PublicCatalogConditionItem,
  PublicCatalogImage,
  PublicCatalogProduct,
  PublicCatalogSpec,
} from "@/lib/catalog/types"
import { getProductAssetImageInfo } from "@/lib/product-assets"

type InventoryRow = {
  id: string
  imei: string | null
  grade: string | null
  battery_health: number | null
  ios_version: string | null
  notes: string | null
  category_db: string | null
  category_snapshot: string | null
  model: string | null
  subcategory_snapshot: string | null
  color: string | null
  color_snapshot: string | null
  storage: string | null
  attribute_summary: string | null
  brand: string | null
  product_type: string | null
  inv_status: string
  // catalog_publications
  publication_id: string | null
  is_published: boolean | null
  public_status: string | null
  public_title: string | null
  public_description: string | null
  public_price: string | number | null
  promo_price: string | number | null
  installment_count: number | null
  show_installments: boolean | null
  cover_image_id: string | null
  published_at: string | null
  // catalog_condition_reviews
  review_id: string | null
  overall_score: string | number | null
  screen_score: string | number | null
  screen_notes: string | null
  sides_score: string | number | null
  sides_notes: string | null
  back_score: string | number | null
  back_notes: string | null
  battery_score: string | number | null
  battery_notes: string | null
  cameras_score: string | number | null
  cameras_notes: string | null
  biometrics_score: string | number | null
  biometrics_notes: string | null
  audio_score: string | number | null
  audio_notes: string | null
  connectivity_score: string | number | null
  connectivity_notes: string | null
  general_score: string | number | null
  general_notes: string | null
}

type InventoryImageRow = {
  product_id: string
  id: string
  image_url: string
  is_primary: boolean
  sort_order: number
  alt: string | null
  source: "uploaded" | "static_asset"
}

type IncludedItemRow = {
  inventory_item_id: string
  label: string
  is_included: boolean
  sort_order: number
}

const SELECT_INVENTORY_BASE = `
  SELECT
    i.id,
    i.imei,
    i.grade,
    i.battery_health,
    i.ios_version,
    i.notes,
    pc.category AS category_db,
    i.category_name_snapshot AS category_snapshot,
    pc.model AS model,
    i.subcategory_name_snapshot AS subcategory_snapshot,
    pc.color AS color,
    i.color_name_snapshot AS color_snapshot,
    pc.storage AS storage,
    i.attribute_summary_snapshot AS attribute_summary,
    pc.brand AS brand,
    i.product_type,
    i.status AS inv_status,
    p.id AS publication_id,
    p.is_published,
    p.public_status,
    p.public_title,
    p.public_description,
    p.public_price,
    p.promo_price,
    p.installment_count,
    p.show_installments,
    p.cover_image_id,
    p.published_at::text AS published_at,
    r.id AS review_id,
    r.overall_score,
    r.screen_score, r.screen_notes,
    r.sides_score, r.sides_notes,
    r.back_score, r.back_notes,
    r.battery_score, r.battery_notes,
    r.cameras_score, r.cameras_notes,
    r.biometrics_score, r.biometrics_notes,
    r.audio_score, r.audio_notes,
    r.connectivity_score, r.connectivity_notes,
    r.general_score, r.general_notes
  FROM inventory i
  LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
  INNER JOIN catalog_publications p ON p.inventory_item_id = i.id
  LEFT JOIN catalog_condition_reviews r ON r.inventory_item_id = i.id
`

async function resolveCatalogCompanyId(): Promise<string | null> {
  const explicit = process.env.NOBRETECH_PUBLIC_COMPANY_ID
  if (explicit) return explicit
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM companies ORDER BY created_at ASC LIMIT 1"
  )
  return result.rows[0]?.id || null
}

async function fetchImagesForProducts(
  companyId: string,
  productIds: string[],
): Promise<Map<string, InventoryImageRow[]>> {
  if (productIds.length === 0) return new Map()
  const result = await pool.query<InventoryImageRow>(
    `
      SELECT product_id, id, image_url, is_primary, sort_order, alt, source
      FROM product_images
      WHERE company_id = $1::uuid
        AND product_id = ANY($2::uuid[])
      ORDER BY product_id, is_primary DESC, sort_order, created_at
    `,
    [companyId, productIds],
  )
  const byProduct = new Map<string, InventoryImageRow[]>()
  for (const row of result.rows) {
    const list = byProduct.get(row.product_id) || []
    list.push(row)
    byProduct.set(row.product_id, list)
  }
  return byProduct
}

async function fetchIncludedItems(
  companyId: string,
  inventoryIds: string[],
): Promise<Map<string, IncludedItemRow[]>> {
  if (inventoryIds.length === 0) return new Map()
  const result = await pool.query<IncludedItemRow>(
    `
      SELECT inventory_item_id, label, is_included, sort_order
      FROM catalog_included_items
      WHERE company_id = $1::uuid
        AND inventory_item_id = ANY($2::uuid[])
      ORDER BY inventory_item_id, sort_order
    `,
    [companyId, inventoryIds],
  )
  const byItem = new Map<string, IncludedItemRow[]>()
  for (const row of result.rows) {
    const list = byItem.get(row.inventory_item_id) || []
    list.push(row)
    byItem.set(row.inventory_item_id, list)
  }
  return byItem
}

function categorySlugFromDb(category: string | null): PublicCatalogCategorySlug | null {
  if (!category) return null
  const lower = category.toLowerCase()
  if (lower === "iphone") return "iphone"
  if (lower === "ipad") return "ipad"
  if (lower === "macbook") return "macbook"
  if (lower === "applewatch" || lower === "apple watch") return "applewatch"
  if (lower === "airpods") return "airpods"
  if (lower === "garmin") return "garmin"
  if (lower === "accessories" || lower === "acessorios" || lower === "acessórios") return "accessories"
  return null
}

function categoryLabel(slug: PublicCatalogCategorySlug | null, fallback: string | null): string {
  switch (slug) {
    case "iphone":
      return "iPhone"
    case "ipad":
      return "iPad"
    case "macbook":
      return "MacBook"
    case "applewatch":
      return "Apple Watch"
    case "airpods":
      return "AirPods"
    case "garmin":
      return "Garmin"
    case "accessories":
      return "Acessórios"
    default:
      return fallback || "Apple"
  }
}

function priceToNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function priceToNumberOrNull(value: string | number | null | undefined): number | null {
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

function buildSpecs(input: {
  modelLabel: string
  storage: string | null
  color: string | null
  iosVersion: string | null
  warrantyLabel: string
  maskedImei: string | null
}): PublicCatalogSpec[] {
  const specs: PublicCatalogSpec[] = []
  specs.push({ label: "Modelo", value: input.modelLabel })
  if (input.storage) specs.push({ label: "Armazenamento", value: input.storage })
  if (input.color) specs.push({ label: "Cor", value: input.color })
  if (input.iosVersion) specs.push({ label: "Sistema", value: input.iosVersion })
  specs.push({ label: "Garantia", value: input.warrantyLabel })
  if (input.maskedImei) specs.push({ label: "IMEI", value: input.maskedImei })
  return specs
}

function buildHighlights(input: { grade: string | null; warrantyLabel: string; availabilityLabel: string }): string[] {
  if (input.grade === "Lacrado") {
    return ["Lacrado de fábrica", input.warrantyLabel, input.availabilityLabel]
  }
  return ["Fotos reais", input.warrantyLabel, input.availabilityLabel]
}

function reviewToConditionItems(
  row: InventoryRow,
  isSealed: boolean,
  warrantyLabel: string,
): PublicCatalogConditionItem[] {
  if (isSealed) {
    return [
      { key: "screen", label: "Tela", description: "Lacrada de fábrica" },
      { key: "body", label: "Estrutura", description: "Lacrada de fábrica" },
      { key: "battery", label: "Bateria", description: "De fábrica" },
      { key: "cameras", label: "Câmeras", description: "Lacradas de fábrica" },
      { key: "functions", label: "Garantia", description: warrantyLabel },
    ]
  }
  if (!row.review_id) return []
  const items: PublicCatalogConditionItem[] = []
  const push = (key: string, label: string, score: unknown, notes: string | null) => {
    const value = priceToNumberOrNull(score as string | number | null)
    if (value == null && !notes) return
    const stateLabel = value == null ? undefined : conditionStateLabel(key, value)
    const cleanNotes = cleanConditionNotes(notes, stateLabel)
    items.push({
      key,
      label,
      stateLabel,
      description: cleanNotes || undefined,
      score: value ?? undefined,
    })
  }
  push("screen", "Tela", row.screen_score, row.screen_notes)
  push("sides", "Laterais", row.sides_score, row.sides_notes)
  push("back", "Traseira", row.back_score, row.back_notes)
  push("battery", "Bateria", row.battery_score, row.battery_notes)
  push("cameras", "Câmeras", row.cameras_score, row.cameras_notes)
  push("faceId", "Face ID / Touch ID", row.biometrics_score, row.biometrics_notes)
  push("audio", "Áudio e microfone", row.audio_score, row.audio_notes)
  push("connectivity", "Conectividade", row.connectivity_score, row.connectivity_notes)
  push("functions", "Funcionamento geral", row.general_score, row.general_notes)
  return items
}

const CONDITION_STATE_OPTIONS: Record<string, Array<{ maxDistance?: number; score: number; label: string }>> = {
  screen: [
    { score: 10, label: "Perfeita, sem riscos visíveis" },
    { score: 8.8, label: "Pequenos riscos quase imperceptíveis" },
    { score: 8.0, label: "Riscos leves visíveis com a tela apagada" },
    { score: 7.0, label: "Riscos visíveis no uso" },
    { score: 5.0, label: "Trinca, mancha ou defeito" },
  ],
  sides: [
    { score: 10, label: "Sem marcas visíveis" },
    { score: 8.8, label: "Marcas leves" },
    { score: 7.8, label: "Marcas moderadas" },
    { score: 6.5, label: "Amassados ou marcas fortes" },
    { score: 5.0, label: "Dano estrutural relevante" },
  ],
  back: [
    { score: 10, label: "Sem marcas visíveis" },
    { score: 8.8, label: "Marcas leves" },
    { score: 7.8, label: "Marcas moderadas" },
    { score: 5.0, label: "Trincada ou muito marcada" },
  ],
  battery: [
    { score: 10, label: "Bateria excelente" },
    { score: 9.2, label: "Bateria excelente" },
    { score: 9.0, label: "Bateria muito boa" },
    { score: 8.5, label: "Bateria boa" },
    { score: 8.4, label: "Bateria boa" },
    { score: 7.8, label: "Bateria aceitável" },
    { score: 7.5, label: "Bateria aceitável" },
    { score: 6.5, label: "Bateria precisa de atenção" },
  ],
  cameras: [
    { score: 10, label: "Funcionando normalmente" },
    { score: 8.5, label: "Funcionam, com observação estética" },
    { score: 7.0, label: "Alguma limitação percebida" },
    { score: 5.0, label: "Defeito em câmera" },
  ],
  faceId: [
    { score: 10, label: "Funcionando normalmente" },
    { score: 5.0, label: "Com defeito" },
  ],
  audio: [
    { score: 10, label: "Áudio e microfone normais" },
    { score: 8.5, label: "Funcionam, com pequena observação" },
    { score: 7.0, label: "Alguma limitação" },
    { score: 5.0, label: "Defeito" },
  ],
  connectivity: [
    { score: 10, label: "Wi-Fi, Bluetooth e sinal normais" },
    { score: 8.5, label: "Funcionam, com observação" },
    { score: 7.0, label: "Alguma limitação" },
    { score: 5.0, label: "Defeito" },
  ],
  functions: [
    { score: 10, label: "Excelente, sem observações" },
    { score: 8.8, label: "Bom, com observações leves" },
    { score: 7.8, label: "Funciona bem, mas exige atenção" },
    { score: 6.5, label: "Tem limitação importante" },
    { score: 5.0, label: "Defeito relevante" },
  ],
}

const LEGACY_CONDITION_NOTE_PREFIXES = [
  "Perfeita",
  "Riscos quase imperceptíveis",
  "Riscos leves",
  "Riscos visíveis",
  "Defeito",
  "Sem marcas",
  "Marcas fortes",
  "Dano estrutural",
  "Excelente",
  "Boa",
  "Aceitável",
  "Precisa atenção",
  "Não informado",
  "Tudo normal",
  "Com observação estética",
  "Com observação",
  "Pequena observação",
  "Funcionando",
  "Não se aplica",
  "Não testado",
  "Com defeito",
  "Bom",
  "Exige atenção",
  "Limitação importante",
  "Defeito relevante",
]

function conditionStateLabel(key: string, score: number): string {
  const options = CONDITION_STATE_OPTIONS[key] || []
  if (options.length === 0) return getScoreLabel(score)
  return options.reduce((best, option) => {
    const bestDistance = Math.abs(best.score - score)
    const optionDistance = Math.abs(option.score - score)
    return optionDistance < bestDistance ? option : best
  }, options[0]).label
}

function cleanConditionNotes(notes: string | null, stateLabel?: string): string | null {
  if (!notes) return null
  let value = notes.trim()
  const labels = [
    stateLabel,
    ...Object.values(CONDITION_STATE_OPTIONS).flat().map((option) => option.label),
    ...LEGACY_CONDITION_NOTE_PREFIXES,
  ].filter(Boolean) as string[]

  let changed = true
  while (changed) {
    changed = false
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const next = value
        .replace(new RegExp(`^${escaped}\\s*-\\s*`, "i"), "")
        .replace(new RegExp(`^${escaped}\\s*$`, "i"), "")
        .trim()
      if (next !== value) {
        value = next
        changed = true
      }
    }
  }
  return value || null
}

function mapRowToProduct(
  row: InventoryRow,
  images: InventoryImageRow[],
  included: IncludedItemRow[],
  paymentSettings: CatalogPaymentSettings,
): PublicCatalogProduct | null {
  if (!row.publication_id || !row.is_published) return null

  const grade = row.grade
  const condition = getConditionFromGrade(grade)
  const isSealed = condition === "sealed"
  const conditionLabel = getConditionLabel(condition)
  const categorySlug = categorySlugFromDb(row.category_db || row.category_snapshot)
  const catLabel = categoryLabel(categorySlug, row.category_snapshot)

  const modelLabel = row.model || row.subcategory_snapshot || row.brand || "Apple"
  const storage = row.storage || row.attribute_summary || null
  const color = row.color_snapshot || row.color || null
  const title = row.public_title?.trim() || modelLabel
  const subtitleParts = [storage, color].filter(Boolean) as string[]
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined

  const price = priceToNumber(row.public_price)
  if (price <= 0) return null

  // Business rule guardrails — never publish seminovo without review + items + real photo.
  const hasRealPhotos = images.some((image) => image.source === "uploaded")
  if (!isSealed) {
    if (!hasRealPhotos) return null
    if (!row.review_id) return null
    if (included.length === 0) return null
  }

  const overall = priceToNumberOrNull(row.overall_score)
  const score = isSealed ? 10 : overall
  const scoreLabel = score != null ? getScoreLabel(score) : null

  const slug = buildCatalogSlug({
    id: row.id,
    model: modelLabel,
    storage,
    color,
  })

  const warrantyLabel = getCatalogWarrantyLabel(condition)
  const availabilityLabel = "Pronta entrega"

  const finalImages: PublicCatalogImage[] =
    images.length > 0
      ? images.map((image) => ({
          url: image.image_url,
          alt: image.alt || `${title}. ${conditionLabel}`,
          kind: !isSealed && image.source === "uploaded" ? "real_photo" : "official_asset",
        }))
      : [(() => {
          const asset = getProductAssetImageInfo({
            brand: row.brand,
            model: modelLabel,
            color,
            category: categorySlug,
          })
          return {
            url: asset.src,
            alt: asset.alt,
            kind: "official_asset" as const,
          }
        })()]

  const maskedImei = maskImei(row.imei)
  const promoPrice = priceToNumberOrNull(row.promo_price)
  const effectivePrice = isValidPromoPrice(price, promoPrice) ? promoPrice : price
  const installmentOptions = row.show_installments !== false
    ? buildCatalogInstallmentOptions(effectivePrice, paymentSettings, 18)
    : []
  const defaultInstallmentCount = installmentOptions.at(-1)?.installments ?? Math.max(1, Math.min(18, row.installment_count ?? 10))
  const installmentQuote = row.show_installments !== false
    ? buildCatalogInstallmentQuote(effectivePrice, defaultInstallmentCount, paymentSettings)
    : null

  const includedItems = included.map((item) => ({
    label: item.label,
    included: item.is_included,
  }))

  const description =
    row.public_description?.trim() ||
    (isSealed
      ? "Produto lacrado de fábrica, com disponibilidade confirmada pela Nobretech."
      : "Unidade selecionada pela Nobretech, com fotos reais e condição conferida antes da publicação.")

  return {
    id: row.id,
    slug,
    title,
    subtitle,
    category: categorySlug,
    categoryLabel: catLabel,
    condition,
    conditionLabel,
    grade,
    score,
    scoreLabel,
    price,
    promoPrice: isValidPromoPrice(price, promoPrice) ? promoPrice : null,
    installmentText: installmentQuote?.text ?? null,
    installmentTotalText: installmentQuote?.totalText ?? null,
    installmentNote: installmentQuote?.note ?? null,
    installmentOptions,
    storage,
    color,
    batteryHealth: row.battery_health,
    warrantyLabel,
    availabilityLabel,
    hasRealPhotos,
    images: finalImages,
    highlights: buildHighlights({ grade, warrantyLabel, availabilityLabel }),
    specs: buildSpecs({
      modelLabel: [modelLabel, storage].filter(Boolean).join(" "),
      storage,
      color,
      iosVersion: row.ios_version,
      warrantyLabel,
      maskedImei,
    }),
    conditionReview: reviewToConditionItems(row, isSealed, warrantyLabel),
    includedItems,
    description,
    whatsappMessage: defaultMessageForProduct({ title, storage, color }),
    maskedImei,
  }
}

export async function listPublicCatalog(): Promise<PublicCatalogProduct[]> {
  const companyId = await resolveCatalogCompanyId()
  if (!companyId) return []

  const rowsResult = await pool.query<InventoryRow>(
    `
      ${SELECT_INVENTORY_BASE}
      WHERE i.company_id = $1::uuid
        AND p.is_published = TRUE
        AND i.status IN ('active', 'in_stock')
      ORDER BY p.published_at DESC NULLS LAST, p.updated_at DESC
      LIMIT 200
    `,
    [companyId],
  )

  const rows = rowsResult.rows
  const inventoryIds = rows.map((row) => row.id)
  const [imagesByProduct, itemsByInv, paymentSettings] = await Promise.all([
    fetchImagesForProducts(companyId, inventoryIds),
    fetchIncludedItems(companyId, inventoryIds),
    loadCatalogPaymentSettings(companyId),
  ])

  const products: PublicCatalogProduct[] = []
  for (const row of rows) {
    const product = mapRowToProduct(row, imagesByProduct.get(row.id) || [], itemsByInv.get(row.id) || [], paymentSettings)
    if (product) products.push(product)
  }
  return products
}

export async function getPublicProductBySlug(slug: string): Promise<PublicCatalogProduct | null> {
  const parsed = parseCatalogSlug(slug)
  if (!parsed) return null

  const companyId = await resolveCatalogCompanyId()
  if (!companyId) return null

  const rowsResult = await pool.query<InventoryRow>(
    `
      ${SELECT_INVENTORY_BASE}
      WHERE i.company_id = $1::uuid
        AND p.is_published = TRUE
        AND i.status IN ('active', 'in_stock')
        AND REPLACE(i.id::text, '-', '') ILIKE $2 || '%'
      LIMIT 1
    `,
    [companyId, parsed.idPrefix],
  )

  const row = rowsResult.rows[0]
  if (!row) return null

  const [imagesByProduct, itemsByInv, paymentSettings] = await Promise.all([
    fetchImagesForProducts(companyId, [row.id]),
    fetchIncludedItems(companyId, [row.id]),
    loadCatalogPaymentSettings(companyId),
  ])
  return mapRowToProduct(row, imagesByProduct.get(row.id) || [], itemsByInv.get(row.id) || [], paymentSettings)
}
