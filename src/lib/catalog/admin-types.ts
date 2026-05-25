export type CatalogPublicationStatus = "draft" | "ready" | "published" | "blocked" | "archived"

export type CatalogProductKind = "sealed" | "seminovo" | "used" | "open_box"

export type CatalogPublicationRecord = {
  id: string
  inventory_item_id: string
  is_published: boolean
  public_status: CatalogPublicationStatus
  public_title: string | null
  public_description: string | null
  public_price: number | null
  promo_price: number | null
  installment_count: number
  show_installments: boolean
  highlight: boolean
  cover_image_id: string | null
  notes_internal: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export type CatalogReviewRecord = {
  id: string
  inventory_item_id: string
  publication_id: string | null
  product_kind: CatalogProductKind
  overall_score: number | null
  screen_score: number | null
  screen_notes: string | null
  sides_score: number | null
  sides_notes: string | null
  back_score: number | null
  back_notes: string | null
  battery_score: number | null
  battery_notes: string | null
  cameras_score: number | null
  cameras_notes: string | null
  biometrics_score: number | null
  biometrics_notes: string | null
  audio_score: number | null
  audio_notes: string | null
  connectivity_score: number | null
  connectivity_notes: string | null
  general_score: number | null
  general_notes: string | null
  reviewed_at: string | null
  updated_at: string
}

export type CatalogIncludedItemRecord = {
  id: string
  inventory_item_id: string
  publication_id: string | null
  label: string
  is_included: boolean
  sort_order: number
}

export type CatalogImageRecord = {
  id: string
  product_id: string
  image_url: string
  thumbnail_url: string
  source: "uploaded" | "static_asset"
  is_primary: boolean
  sort_order: number
  alt: string | null
  created_at: string
}

export type CatalogReadiness = {
  canPublish: boolean
  status: CatalogPublicationStatus
  reasons: string[]
  warnings: string[]
}

export type CatalogAdminItem = {
  inventoryId: string
  title: string
  subtitle: string | null
  category: string | null
  categoryLabel: string
  grade: string | null
  productKind: CatalogProductKind
  inventoryStatus: string
  suggestedPrice: number | null
  batteryHealth: number | null
  imeiMasked: string | null
  publication: CatalogPublicationRecord | null
  review: CatalogReviewRecord | null
  includedItems: CatalogIncludedItemRecord[]
  images: CatalogImageRecord[]
  hasRealPhotos: boolean
  readiness: CatalogReadiness
}

export type CatalogAdminSummary = {
  total: number
  published: number
  ready: number
  blocked: number
  missingPhotos: number
  missingReview: number
}
