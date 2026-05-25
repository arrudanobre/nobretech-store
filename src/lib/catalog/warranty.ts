import type { PublicCatalogCondition } from "@/lib/catalog/types"

const DEFAULT_USED_WARRANTY_MONTHS = 6
const SEALED_WARRANTY_LABEL = "Garantia Apple"

function formatNobretechWarranty(months: number) {
  return `${months} ${months === 1 ? "mês" : "meses"} Nobretech`
}

export function getCatalogWarrantyLabel(condition: PublicCatalogCondition): string {
  if (condition === "sealed") return SEALED_WARRANTY_LABEL

  // TODO: move the public catalog warranty to an explicit catalog/company setting.
  // Today catalog_publications/inventory do not store a vitrine warranty field.
  return formatNobretechWarranty(DEFAULT_USED_WARRANTY_MONTHS)
}
