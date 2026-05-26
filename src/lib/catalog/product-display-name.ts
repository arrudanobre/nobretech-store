function normalizeForComparison(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Returns the public display name for a catalog product without duplicating
 * storage or color if they are already present in the title.
 *
 * Safe for null/undefined storage and color.
 */
export function getCatalogProductDisplayName(product: {
  title: string
  storage?: string | null
  color?: string | null
}): string {
  const normalTitle = normalizeForComparison(product.title)
  const parts: string[] = [product.title]

  if (product.storage) {
    const normalStorage = normalizeForComparison(product.storage)
    if (!normalTitle.includes(normalStorage)) {
      parts.push(product.storage)
    }
  }

  if (product.color) {
    const normalColor = normalizeForComparison(product.color)
    if (!normalTitle.includes(normalColor)) {
      parts.push(product.color)
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim()
}
