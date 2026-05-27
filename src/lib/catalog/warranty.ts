import type { PublicCatalogCondition } from "@/lib/catalog/types"

export const DEFAULT_USED_WARRANTY_MONTHS = 6
const SEALED_WARRANTY_LABEL = "Garantia Apple"

function formatBrandedWarranty(months: number, brandShortName: string | null): string {
  const period = `${months} ${months === 1 ? "mês" : "meses"}`
  return brandShortName ? `${period} ${brandShortName}` : period
}

export function getCatalogWarrantyLabel(
  condition: PublicCatalogCondition,
  brandShortName?: string | null
): string {
  if (condition === "sealed") return SEALED_WARRANTY_LABEL
  // TODO: move the public catalog warranty to an explicit catalog/company setting.
  return formatBrandedWarranty(DEFAULT_USED_WARRANTY_MONTHS, brandShortName ?? null)
}
