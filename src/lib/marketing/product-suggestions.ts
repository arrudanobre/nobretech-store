export interface SuggestionProductClassifierInput {
  productType?: string | null
  category?: string | null
  categoryName?: string | null
  subcategoryName?: string | null
  model?: string | null
  name?: string | null
  notes?: string | null
  conditionNotes?: string | null
  hasDeviceIdentifier?: boolean
}

const ACCESSORY_MARKERS = [
  "accessories",
  "accessory",
  "acessorio",
  "acessorios",
  "capa",
  "case",
  "cover",
  "pelicula",
  "film",
  "carregador",
  "charger",
  "fonte",
  "cabo",
  "cable",
  "caneta",
  "stylus",
  "pencil",
  "teclado",
  "keyboard",
  "mouse",
  "hub",
  "adaptador",
  "suporte",
  "pulseira",
]

const MAIN_PRODUCT_MARKERS = [
  "iphone",
  "ipad",
  "macbook",
  "apple watch",
  "applewatch",
]

function normalizeClassifierText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasAnyMarker(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker))
}

export function isMainDisclosureSuggestionProduct(input: SuggestionProductClassifierInput): boolean {
  const productType = normalizeClassifierText(input.productType)
  const category = normalizeClassifierText(input.category)
  const categoryName = normalizeClassifierText(input.categoryName)
  const subcategoryName = normalizeClassifierText(input.subcategoryName)
  const model = normalizeClassifierText(input.model)
  const name = normalizeClassifierText(input.name)
  const notes = normalizeClassifierText(input.notes)
  const conditionNotes = normalizeClassifierText(input.conditionNotes)

  const structuredText = [productType, category, categoryName, subcategoryName, model].filter(Boolean).join(" ")
  const allText = [structuredText, name, notes, conditionNotes].filter(Boolean).join(" ")

  if (productType && productType !== "device") return false
  if (hasAnyMarker(structuredText, ACCESSORY_MARKERS)) return false
  if (hasAnyMarker([name, notes, conditionNotes].filter(Boolean).join(" "), ACCESSORY_MARKERS)) return false

  if (category === "airpods") {
    return productType === "device" || Boolean(input.hasDeviceIdentifier)
  }

  if (productType === "device") return true
  if (hasAnyMarker(structuredText, MAIN_PRODUCT_MARKERS)) return true
  if (hasAnyMarker(allText, MAIN_PRODUCT_MARKERS)) return true

  return Boolean(input.hasDeviceIdentifier && !hasAnyMarker(allText, ACCESSORY_MARKERS))
}

export function filterMainDisclosureSuggestionCandidates<T extends SuggestionProductClassifierInput>(
  candidates: T[],
  limit = 5
): T[] {
  const result: T[] = []
  for (const candidate of candidates) {
    if (!isMainDisclosureSuggestionProduct(candidate)) continue
    result.push(candidate)
    if (result.length >= limit) break
  }
  return result
}
