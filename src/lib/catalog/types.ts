export type PublicCatalogCondition = "sealed" | "seminovo" | "used" | "open_box"

export type PublicCatalogImage = {
  url: string
  alt: string
  kind: "real_photo" | "official_asset"
}

export type PublicCatalogSpec = {
  label: string
  value: string
}

export type PublicCatalogConditionItem = {
  key: string
  label: string
  stateLabel?: string
  description?: string
  score?: number
}

export type PublicCatalogIncluded = {
  label: string
  included: boolean
}

export type PublicCatalogInstallmentOption = {
  installments: number
  text: string
  totalText: string
  note: string
  total: number
  installmentValue: number
  feePercent: number
}

export type PublicCatalogCategorySlug =
  | "iphone"
  | "ipad"
  | "macbook"
  | "applewatch"
  | "airpods"
  | "garmin"
  | "accessories"

export type PublicCatalogProduct = {
  id: string
  slug: string
  title: string
  subtitle?: string
  category: PublicCatalogCategorySlug | null
  categoryLabel: string
  condition: PublicCatalogCondition
  conditionLabel: string
  grade: string | null
  score: number | null
  scoreLabel: string | null
  price: number
  promoPrice: number | null
  installmentText: string | null
  installmentTotalText: string | null
  installmentNote: string | null
  installmentOptions: PublicCatalogInstallmentOption[]
  storage: string | null
  color: string | null
  batteryHealth: number | null
  warrantyLabel: string
  availabilityLabel: string
  hasRealPhotos: boolean
  images: PublicCatalogImage[]
  highlights: string[]
  specs: PublicCatalogSpec[]
  conditionReview: PublicCatalogConditionItem[]
  includedItems: PublicCatalogIncluded[]
  description: string
  whatsappMessage: string
  maskedImei: string | null
}
