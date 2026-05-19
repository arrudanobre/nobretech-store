type InventoryNameInput = {
  catalog?: { model?: string | null; storage?: string | null; color?: string | null } | null
  model?: string | null
  storage?: string | null
  color?: string | null
  explicitName?: string | null
  productName?: string | null
  productType?: string | null
  categoryName?: string | null
  subcategoryName?: string | null
  attributeSummary?: string | null
  notes?: string | null
  conditionNotes?: string | null
  allowRawNotes?: boolean
}

type SupplierNameInput = {
  model?: string | null
  storage?: string | null
  size?: string | null
  color?: string | null
  category?: string | null
  brand?: string | null
}

export type CommercialNameResult = {
  name: string
  isIncomplete: boolean
}

const GENERIC_NAMES = new Set([
  "produto",
  "produto sem nome",
  "produto sem identificacao",
  "produto de fornecedor",
  "produto com fornecedor",
  "item",
  "item sem nome",
  "item sem identificacao",
  "acessorio",
  "acessorios",
])

const CATEGORY_LABELS: Record<string, string> = {
  accessories: "Acessório",
  accessory: "Acessório",
  acessorios: "Acessório",
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  applewatch: "Apple Watch",
  watch: "Apple Watch",
  airpods: "AirPods",
  garmin: "Garmin",
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function clean(value?: string | null): string | null {
  if (!value) return null
  const text = String(value).replace(/\s+/g, " ").trim()
  return text || null
}

function isUsefulName(value?: string | null): value is string {
  const text = clean(value)
  if (!text) return false
  return !GENERIC_NAMES.has(normalize(text))
}

function uniqueParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const part of parts) {
    const text = clean(part)
    if (!text) continue
    const key = normalize(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }

  return result
}

function prefixedCommercialName(value?: string | null): string | null {
  const text = clean(value)
  if (!text) return null

  const match = text.match(/^(Nome|Acess[oó]rio):\s*(.+)$/i)
  return isUsefulName(match?.[2]) ? match[2].trim() : null
}

function stripCommercialPrefix(value?: string | null): string | null {
  const text = clean(value)
  if (!text) return null
  return text.replace(/^(Nome|Acess[oó]rio):\s*/i, "").trim()
}

function categoryLabel(value?: string | null): string | null {
  const text = clean(value)
  if (!text) return null
  return CATEGORY_LABELS[normalize(text)] || text
}

function result(name?: string | null, fallback = "Item sem nome cadastrado"): CommercialNameResult {
  if (isUsefulName(name)) return { name: clean(name)!, isIncomplete: false }
  return { name: fallback, isIncomplete: true }
}

export function buildInventoryCommercialName(input: InventoryNameInput): CommercialNameResult {
  const explicit = clean(input.explicitName) || clean(input.productName)
  if (isUsefulName(explicit)) return result(explicit)

  const notesName = prefixedCommercialName(input.notes) || prefixedCommercialName(input.conditionNotes)
  if (notesName) return result(notesName)

  const catalogName = uniqueParts([input.catalog?.model, input.catalog?.storage, input.catalog?.color]).join(" ")
  if (isUsefulName(catalogName)) return result(catalogName)

  const directName = uniqueParts([input.model, input.storage || input.attributeSummary, input.color]).join(" ")
  if (isUsefulName(directName)) return result(directName)

  const snapshotName = uniqueParts([input.subcategoryName, input.attributeSummary, input.color || input.catalog?.color]).join(" ")
  if (isUsefulName(snapshotName)) return result(snapshotName)

  const categorySnapshot = uniqueParts([
    categoryLabel(input.categoryName || input.productType),
    input.attributeSummary,
    input.color,
  ]).join(" ")
  if (isUsefulName(categorySnapshot)) return result(categorySnapshot)

  if (input.allowRawNotes) {
    const rawName =
      stripCommercialPrefix(input.notes) ||
      stripCommercialPrefix(input.conditionNotes)
    if (isUsefulName(rawName)) return result(rawName)
  }

  return result(null)
}

export function buildSupplierCommercialName(input: SupplierNameInput): CommercialNameResult {
  const name = uniqueParts([
    input.model,
    input.storage || input.size,
    input.color,
  ]).join(" ")
  if (isUsefulName(name)) return result(name, "Produto com fornecedor sem identificação")

  const categoryName = uniqueParts([
    input.brand,
    categoryLabel(input.category),
    input.storage || input.size,
    input.color,
  ]).join(" ")
  if (isUsefulName(categoryName)) return result(categoryName, "Produto com fornecedor sem identificação")

  return result(null, "Produto com fornecedor sem identificação")
}
