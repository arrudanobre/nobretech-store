// Pure central resolver for default sale-item warranty.
// Consumes ONLY structured product data: product_type, brand,
// categorySlug, subcategorySlug, condition and legacy accessoryClass. Never
// inspects display name, title, or free text. When every structured
// field is null, returns 'none' with a missing_product_classification
// warning so the integration layer can log it.

import type { WarrantyCalculationMode, WarrantyNature } from "./types"

export type WarrantyAccessoryClass = "durable" | "non_durable"

export type WarrantyItemContext = {
  brand: string | null
  categorySlug: string | null
  subcategorySlug: string | null
  accessoryClass: WarrantyAccessoryClass | null
  productType: "device" | "accessory" | "service" | "other" | "warranty" | "bundle" | null
  condition: "sealed" | "seminovo" | "used" | "open_box" | null
  itemRole: "main" | "upsell" | "gift" | "accessory" | "service" | "other"
  isGift: boolean
  inventoryItemId: string | null
}

export type WarrantyDecisionSource = "manufacturer" | "item" | "none"

export type WarrantyMissingClassificationWarning = {
  event: "missing_product_classification"
  inventoryItemId: string | null
}

export type WarrantyDecision =
  | {
      source: "manufacturer"
      label: string
      warrantyNature: Extract<WarrantyNature, "manufacturer">
      calculationMode: Extract<WarrantyCalculationMode, "calendar_months">
      durationMonths: 12
      brandHint: "apple"
      ruleId: "apple_sealed_12m"
    }
  | {
      source: "item"
      label: string
      warrantyNature: Extract<WarrantyNature, "contractual">
      calculationMode: Extract<WarrantyCalculationMode, "calendar_months">
      durationMonths: number
      ruleId: "apple_used_6m" | "device_used_6m" | "durable_accessory_3m"
    }
  | {
      source: "none"
      reason: string
      ruleId:
        | "non_durable_accessory"
        | "unclassified_accessory"
        | "missing_classification"
        | "fallback"
      warning?: WarrantyMissingClassificationWarning
    }

const APPLE_BRAND_CANONICAL = "apple"
const APPLE_DEVICE_CATEGORY_SLUGS = new Set(["iphone", "ipad", "macbook", "applewatch", "airpods"])

function normalizeBrand(brand: string | null): string | null {
  if (!brand) return null
  const trimmed = brand.trim().toLowerCase()
  return trimmed || null
}

function isAppleBrand(brand: string | null): boolean {
  return normalizeBrand(brand) === APPLE_BRAND_CANONICAL
}

function isAppleDeviceCategory(categorySlug: string | null): boolean {
  if (!categorySlug) return false
  return APPLE_DEVICE_CATEGORY_SLUGS.has(categorySlug.toLowerCase())
}

function isAppleProduct(ctx: WarrantyItemContext): boolean {
  if (isAppleBrand(ctx.brand)) return true
  // Brand may be unset on catalog rows seeded before brand became mandatory.
  // The category slug is still a structured controlled value (FK-equivalent
  // to product_categories.slug), so we accept it as a secondary signal.
  return isAppleDeviceCategory(ctx.categorySlug)
}

function isUsedCondition(condition: WarrantyItemContext["condition"]): boolean {
  return condition === "used" || condition === "open_box" || condition === "seminovo"
}

function isStructuredClassificationEmpty(ctx: WarrantyItemContext): boolean {
  return (
    ctx.productType == null &&
    ctx.categorySlug == null &&
    ctx.subcategorySlug == null &&
    ctx.accessoryClass == null &&
    ctx.brand == null &&
    ctx.condition == null
  )
}

export function resolveDefaultWarranty(ctx: WarrantyItemContext): WarrantyDecision {
  // 1. Sem nenhum dado estruturado disponível → warning + skip.
  // Brindes seguem a classificação estruturada do item; não há bloqueio automático por papel.
  if (isStructuredClassificationEmpty(ctx)) {
    return {
      source: "none",
      reason: "Produto sem classificacao estruturada (product_type/category/subcategory/brand).",
      ruleId: "missing_classification",
      warning: { event: "missing_product_classification", inventoryItemId: ctx.inventoryItemId },
    }
  }

  // 2. Apple sealed device → fabricante 12 meses.
  if (ctx.productType === "device" && ctx.condition === "sealed" && isAppleProduct(ctx)) {
    return {
      source: "manufacturer",
      label: "Garantia Apple",
      warrantyNature: "manufacturer",
      calculationMode: "calendar_months",
      durationMonths: 12,
      brandHint: "apple",
      ruleId: "apple_sealed_12m",
    }
  }

  // 3. Apple usado/seminovo/open_box → contratual loja 6 meses.
  if (ctx.productType === "device" && isUsedCondition(ctx.condition) && isAppleProduct(ctx)) {
    return {
      source: "item",
      label: "Garantia contratual da loja",
      warrantyNature: "contractual",
      calculationMode: "calendar_months",
      durationMonths: 6,
      ruleId: "apple_used_6m",
    }
  }

  // 4. Device não-Apple usado/seminovo → contratual loja 6 meses.
  if (ctx.productType === "device" && isUsedCondition(ctx.condition)) {
    return {
      source: "item",
      label: "Garantia contratual da loja",
      warrantyNature: "contractual",
      calculationMode: "calendar_months",
      durationMonths: 6,
      ruleId: "device_used_6m",
    }
  }

  // 5. Acessórios — policy padrão da subcategoria é aplicada antes deste
  // resolver pela camada de venda. accessoryClass fica apenas como fallback
  // legado silencioso para bases que ainda não receberam a policy padrão.
  if (ctx.productType === "accessory") {
    if (ctx.accessoryClass === "non_durable") {
      return {
        source: "none",
        reason: "Acessorio nao duravel sem cobertura contratual padrao.",
        ruleId: "non_durable_accessory",
      }
    }
    if (ctx.accessoryClass === "durable") {
      return {
        source: "item",
        label: "Garantia contratual da loja",
        warrantyNature: "contractual",
        calculationMode: "calendar_months",
        durationMonths: 3,
        ruleId: "durable_accessory_3m",
      }
    }
    return {
      source: "none",
      reason: "Acessorio sem garantia contratual padrao.",
      ruleId: "unclassified_accessory",
    }
  }

  // 6. Nenhuma regra aplicável.
  return { source: "none", reason: "Sem regra automatica aplicavel.", ruleId: "fallback" }
}
