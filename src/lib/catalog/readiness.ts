import type {
  CatalogReadiness,
  CatalogProductKind,
  CatalogPublicationRecord,
  CatalogReviewRecord,
  CatalogIncludedItemRecord,
  CatalogImageRecord,
} from "@/lib/catalog/admin-types"

type Input = {
  productKind: CatalogProductKind
  inventoryStatus: string
  publication: CatalogPublicationRecord | null
  review: CatalogReviewRecord | null
  includedItems: CatalogIncludedItemRecord[]
  images: CatalogImageRecord[]
  hasRealPhotos: boolean
}

const OPERATIONAL_STATUSES = new Set(["active", "in_stock"])

export function getCatalogPublicationReadiness(input: Input): CatalogReadiness {
  const reasons: string[] = []
  const warnings: string[] = []

  if (!OPERATIONAL_STATUSES.has(input.inventoryStatus)) {
    reasons.push("Produto não está disponível no estoque.")
  }

  const price = input.publication?.public_price
  if (price == null || price <= 0) {
    reasons.push("Defina o preço público.")
  }

  if (input.images.length === 0) {
    reasons.push("Adicione pelo menos uma imagem.")
  }

  if (input.productKind !== "sealed") {
    if (!input.hasRealPhotos) {
      reasons.push("Adicione pelo menos uma foto real do aparelho.")
    }
    if (!input.review || input.review.overall_score == null) {
      reasons.push("Faça a avaliação comercial do aparelho.")
    }
    if (input.review) {
      const hasDefect = [
        input.review.screen_score,
        input.review.sides_score,
        input.review.back_score,
        input.review.cameras_score,
        input.review.biometrics_score,
        input.review.audio_score,
        input.review.connectivity_score,
        input.review.general_score,
      ].some((score) => score != null && score <= 5)
      if (hasDefect) {
        reasons.push("Há um defeito informado na avaliação comercial.")
      }
    }
    if (input.includedItems.length === 0) {
      reasons.push("Defina os itens inclusos.")
    }
  } else {
    const hasUploaded = input.images.some((image) => image.source === "uploaded")
    if (!hasUploaded) {
      warnings.push("Produto lacrado usando imagem padrão. Recomenda-se revisar antes de divulgar.")
    }
  }

  if (input.publication?.is_published && reasons.length > 0) {
    return {
      canPublish: false,
      status: "blocked",
      reasons,
      warnings,
    }
  }

  if (input.publication?.is_published) {
    return { canPublish: true, status: "published", reasons, warnings }
  }

  if (reasons.length === 0) {
    return { canPublish: true, status: "ready", reasons, warnings }
  }

  return {
    canPublish: false,
    status: input.publication ? "draft" : "draft",
    reasons,
    warnings,
  }
}

export function computeOverallScoreFromReview(review: Pick<
  CatalogReviewRecord,
  | "screen_score"
  | "sides_score"
  | "back_score"
  | "battery_score"
  | "cameras_score"
  | "biometrics_score"
  | "audio_score"
  | "connectivity_score"
  | "general_score"
>): number | null {
  const entries: Array<[number, number]> = []
  // weight, value
  if (review.screen_score != null) entries.push([2, review.screen_score])
  if (review.sides_score != null) entries.push([1, review.sides_score])
  if (review.back_score != null) entries.push([1, review.back_score])
  if (review.battery_score != null) entries.push([1.5, review.battery_score])
  if (review.cameras_score != null) entries.push([1.5, review.cameras_score])
  if (review.biometrics_score != null) entries.push([1, review.biometrics_score])
  if (review.audio_score != null) entries.push([0.75, review.audio_score])
  if (review.connectivity_score != null) entries.push([0.75, review.connectivity_score])
  if (review.general_score != null) entries.push([1.5, review.general_score])

  if (entries.length === 0) return null
  const totalWeight = entries.reduce((sum, [w]) => sum + w, 0)
  const weightedSum = entries.reduce((sum, [w, v]) => sum + w * v, 0)
  const raw = weightedSum / totalWeight
  return Math.round(raw * 10) / 10
}
