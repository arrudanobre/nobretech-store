import type {
  CatalogReadiness,
  CatalogProductKind,
  CatalogPublicationRecord,
  CatalogReviewRecord,
  CatalogIncludedItemRecord,
  CatalogImageRecord,
} from "@/lib/catalog/admin-types"
import type {
  CatalogPublicationPolicy,
  CatalogReadinessRule,
} from "@/lib/catalog/policies"
import { compareThreshold } from "@/lib/catalog/policies"

type Input = {
  productKind: CatalogProductKind
  productType?: string | null
  inventoryStatus: string
  publication: CatalogPublicationRecord | null
  review: CatalogReviewRecord | null
  includedItems: CatalogIncludedItemRecord[]
  images: CatalogImageRecord[]
  hasRealPhotos: boolean
  policy?: CatalogPublicationPolicy | null
  rules?: CatalogReadinessRule[]
}

// Legacy fallback used only when no policy is resolvable (e.g. company without
// configured policies). Mirrors the pre-2D.x behaviour so consumers without
// policies stay safe.
const LEGACY_ALLOWED_STATUSES = new Set(["active", "in_stock"])
const LEGACY_DEFECT_THRESHOLD = 5

function isSealed(kind: CatalogProductKind): boolean {
  return kind === "sealed"
}

function allowedStatuses(policy: CatalogPublicationPolicy | null | undefined): Set<string> {
  if (!policy) return LEGACY_ALLOWED_STATUSES
  return new Set(policy.allowedInventoryStatuses)
}

function requiresPublicPrice(policy: CatalogPublicationPolicy | null | undefined): boolean {
  return policy ? policy.requiresPublicPrice : true
}

function requiresRealPhoto(policy: CatalogPublicationPolicy | null | undefined, kind: CatalogProductKind): boolean {
  if (policy) return policy.requiresRealPhoto
  return !isSealed(kind)
}

function requiresReview(policy: CatalogPublicationPolicy | null | undefined, kind: CatalogProductKind): boolean {
  if (policy) return policy.requiresReview
  return !isSealed(kind)
}

function requiresIncludedItems(
  policy: CatalogPublicationPolicy | null | undefined,
  kind: CatalogProductKind
): boolean {
  if (policy) return policy.requiresIncludedItems
  return !isSealed(kind)
}

function reviewDefectFails(
  review: CatalogReviewRecord,
  rules: CatalogReadinessRule[] | undefined
): { failed: boolean; message: string } | null {
  const scores: Array<number | null> = [
    review.screen_score,
    review.sides_score,
    review.back_score,
    review.cameras_score,
    review.biometrics_score,
    review.audio_score,
    review.connectivity_score,
    review.general_score,
  ]

  const defectRule = rules?.find((r) => r.ruleKey === "defect_score_max" && r.severity === "block")
  if (defectRule) {
    const failed = scores.some(
      (score) => score != null && compareThreshold(defectRule.thresholdOperator, defectRule.thresholdValue, score)
    )
    return failed ? { failed: true, message: defectRule.message } : null
  }

  // Legacy fallback (no policy/rule): same threshold as before.
  const failed = scores.some((score) => score != null && score <= LEGACY_DEFECT_THRESHOLD)
  return failed ? { failed: true, message: "Há um defeito informado na avaliação comercial." } : null
}

function sealedRealPhotoWarning(
  hasUploaded: boolean,
  rules: CatalogReadinessRule[] | undefined
): string | null {
  if (hasUploaded) return null
  const rule = rules?.find((r) => r.ruleKey === "real_photo_recommended" && r.severity === "warning")
  if (rule) return rule.message
  return "Produto lacrado usando imagem padrão. Recomenda-se revisar antes de divulgar."
}

export function getCatalogPublicationReadiness(input: Input): CatalogReadiness {
  const reasons: string[] = []
  const warnings: string[] = []
  const policy = input.policy ?? null
  const rules = input.rules

  if (!allowedStatuses(policy).has(input.inventoryStatus)) {
    reasons.push("Produto não está disponível no estoque.")
  }

  const price = input.publication?.public_price
  if (requiresPublicPrice(policy) && (price == null || price <= 0)) {
    reasons.push("Defina o preço público.")
  }

  if (!isSealed(input.productKind)) {
    if (requiresRealPhoto(policy, input.productKind) && !input.hasRealPhotos) {
      reasons.push("Adicione pelo menos uma foto real do aparelho.")
    }
    if (requiresReview(policy, input.productKind)) {
      if (!input.review || input.review.overall_score == null) {
        reasons.push("Faça a avaliação comercial do aparelho.")
      } else {
        const defect = reviewDefectFails(input.review, rules)
        if (defect) reasons.push(defect.message)
      }
    }
    if (requiresIncludedItems(policy, input.productKind) && input.includedItems.length === 0) {
      reasons.push("Defina os itens inclusos.")
    }
  } else {
    const hasUploaded = input.images.some((image) => image.source === "uploaded")
    const warning = sealedRealPhotoWarning(hasUploaded, rules)
    if (warning) warnings.push(warning)
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
    status: "draft",
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
