const SLUG_TAIL_LENGTH = 8

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildCatalogSlug(input: {
  id: string
  model?: string | null
  storage?: string | null
  color?: string | null
}): string {
  const tail = input.id.replace(/-/g, "").slice(0, SLUG_TAIL_LENGTH)
  const parts = [input.model, input.storage, input.color]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map(slugify)
    .filter((value) => value.length > 0)
  const head = parts.join("-")
  return head ? `${head}-${tail}` : tail
}

export function parseCatalogSlug(slug: string): { idPrefix: string } | null {
  const cleaned = slug.trim().toLowerCase()
  if (!cleaned) return null
  const match = cleaned.match(/([a-f0-9]{8})$/)
  if (!match) return null
  return { idPrefix: match[1] }
}
