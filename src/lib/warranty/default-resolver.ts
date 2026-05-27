// Pure central resolver for default sale-item warranty.
// Decides between manufacturer / store contractual / none based on
// brand + category + condition + productType + display name. The
// integration layer maps the decision to a warranty_policies row.

import type { WarrantyCalculationMode, WarrantyNature } from "./types"

export type WarrantyItemContext = {
  brand: string | null
  category: string | null
  condition: "sealed" | "seminovo" | "used" | "open_box" | null
  productType: "device" | "accessory" | "service" | "other" | null
  itemRole: "main" | "upsell" | "gift" | "accessory" | "service" | "other"
  displayName: string | null
  isGift: boolean
}

export type WarrantyDecisionSource = "manufacturer" | "item" | "none"

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
  | { source: "none"; reason: string; ruleId: "non_durable_accessory" | "gift" | "fallback" }

const APPLE_BRAND_RE = /(^|\s)apple($|\s)/i
const APPLE_CATEGORIES = [
  "iphone",
  "ipad",
  "macbook",
  "apple watch",
  "applewatch",
  "watch",
  "airpods",
]

const DURABLE_ACCESSORY_KEYWORDS = [
  "stylus",
  "caneta",
  "fone",
  "fones",
  "headphone",
  "earphone",
  "earbud",
  "carregador",
  "charger",
  "cabo",
  "cable",
  "powerbank",
  "power bank",
  "bateria externa",
  "caixa de som",
  "speaker",
  "soundbar",
  "teclado",
  "keyboard",
  "mouse",
  "trackpad",
  "magic mouse",
  "magic keyboard",
  "hub",
  "dock",
  "adaptador",
]

const NON_DURABLE_KEYWORDS = [
  "capa",
  "case",
  "cover",
  "pelicula",
  "película",
  "screen protector",
  "suporte",
  "holder",
  "stand",
  "porta",
  "bolsa",
  "estojo",
  "pochete",
]

function norm(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function isAppleBrand(brand: string | null): boolean {
  if (!brand) return false
  return APPLE_BRAND_RE.test(brand)
}

function matchesAppleCategory(category: string | null, displayName: string | null): boolean {
  const hay = `${norm(category)} ${norm(displayName)}`.trim()
  if (!hay) return false
  return APPLE_CATEGORIES.some((c) => hay.includes(c))
}

function isAppleProduct(ctx: WarrantyItemContext): boolean {
  if (isAppleBrand(ctx.brand)) return true
  // Brand may not be populated for items materialized from product names.
  return matchesAppleCategory(ctx.category, ctx.displayName)
}

function matchKeywords(ctx: WarrantyItemContext, keywords: string[]): boolean {
  const hay = `${norm(ctx.category)} ${norm(ctx.displayName)}`
  if (!hay) return false
  return keywords.some((k) => hay.includes(k))
}

function isUsedCondition(condition: WarrantyItemContext["condition"]): boolean {
  return condition === "used" || condition === "open_box" || condition === "seminovo"
}

export function resolveDefaultWarranty(ctx: WarrantyItemContext): WarrantyDecision {
  // Gifts never carry contractual or manufacturer warranty by default.
  if (ctx.isGift) {
    return { source: "none", reason: "Brinde sem garantia automatica.", ruleId: "gift" }
  }

  // 1. Apple sealed device → manufacturer 12 months
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

  // 2. Apple used / open_box / seminovo → store contractual 6 months
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

  // 3. Generic device used/open_box (non-Apple) → store contractual 6 months
  //    Preserves behaviour for non-Apple seminovos that exist in stock.
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

  // 4. Non-durable accessories → no warranty
  //    Checked before durable to avoid false positives ("capa" inside a longer name).
  if (matchKeywords(ctx, NON_DURABLE_KEYWORDS)) {
    return {
      source: "none",
      reason: "Acessorio sem cobertura contratual padrao (capa/pelicula/suporte).",
      ruleId: "non_durable_accessory",
    }
  }

  // 5. Durable accessories → store contractual 3 months
  if (matchKeywords(ctx, DURABLE_ACCESSORY_KEYWORDS)) {
    return {
      source: "item",
      label: "Garantia contratual da loja",
      warrantyNature: "contractual",
      calculationMode: "calendar_months",
      durationMonths: 3,
      ruleId: "durable_accessory_3m",
    }
  }

  // 6. Fallback — no regra aplicável.
  return { source: "none", reason: "Sem regra automatica aplicavel.", ruleId: "fallback" }
}
