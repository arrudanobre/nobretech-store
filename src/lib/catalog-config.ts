import { CATEGORIES, PRODUCT_CATALOG } from "@/lib/constants"
import { supabase } from "@/lib/supabase"

export type CatalogColor = {
  id?: string
  name: string
  hex: string
}

export type CatalogModel = {
  id?: string
  name: string
  subcategoryId?: string
  storage?: string[]
  sizes?: string[]
  colors?: CatalogColor[]
}

export type CatalogCategory = {
  id?: string
  value: string
  label: string
  productType?: ProductType
  colors?: CatalogColor[]
  models: CatalogModel[]
}

export type CatalogConfig = {
  categories: CatalogCategory[]
}

export type ProductType = "device" | "accessory" | "service" | "warranty" | "bundle"

type LegacyCatalogModel = {
  name: string
  storage?: readonly string[]
  sizes?: readonly string[]
  colors?: readonly CatalogColor[]
}

type LegacyCatalogGroup = {
  label?: string
  models?: readonly LegacyCatalogModel[]
}

type CatalogCategoryRow = {
  id: string
  name: string
  slug?: string | null
  legacy_key?: string | null
  product_type?: ProductType | null
}

type CatalogSubcategoryRow = {
  id: string
  category_id: string
  name: string
  legacy_model?: string | null
}

type CatalogAttributeRow = {
  id: string
  category_id: string
  name?: string | null
  slug?: string | null
  is_active?: boolean | null
}

type CatalogAttributeOptionRow = {
  attribute_id: string
  label?: string | null
  value?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

type CatalogColorRow = {
  id?: string
  category_id?: string | null
  name: string
  hex: string
  is_active?: boolean | null
  deleted_at?: string | null
}

type CatalogSubcategoryColorRow = {
  id?: string
  subcategory_id: string
  color_id: string
  sort_order?: number | null
  is_active?: boolean | null
}

type DbResult<T> = {
  data?: T[] | null
  error?: { message?: string } | null
}

type CatalogQuery<T> = PromiseLike<DbResult<T>> & {
  select(value?: string): CatalogQuery<T>
  eq(column: string, value: unknown): CatalogQuery<T>
  order(column: string, options?: { ascending?: boolean }): CatalogQuery<T>
}

export const DEFAULT_COLOR_SUGGESTIONS: CatalogColor[] = [
  { name: "Preto", hex: "#1D1D1F" },
  { name: "Branco", hex: "#F5F5F5" },
  { name: "Azul", hex: "#0071E3" },
  { name: "Rosa", hex: "#FFD1DC" },
  { name: "Lilás", hex: "#B8A1D9" },
  { name: "Vermelho", hex: "#E8001C" },
  { name: "Midnight", hex: "#1E2A35" },
  { name: "Starlight", hex: "#F5E6D3" },
  { name: "Titânio Natural", hex: "#8B8B8B" },
  { name: "Titânio Azul", hex: "#4A5568" },
  { name: "Titânio Branco", hex: "#E5E7EB" },
  { name: "Titânio Preto", hex: "#1F2937" },
  { name: "Azul Sierra", hex: "#5B6D7A" },
  { name: "Roxo-profundo", hex: "#6B5B73" },
  { name: "Dourado", hex: "#F5D0A0" },
  { name: "Prateado", hex: "#E5E7EB" },
  { name: "Grafite", hex: "#374151" },
]

const ACCESSORY_CATEGORY_RE = /^(accessories|acessorios|acessórios|accessory|capa|capas|carregador|carregadores|pelicula|peliculas|película|películas|cabo|cabos|suporte|suportes|adaptador|adaptadores|fonte|fontes|fone|fones)$/i
const ACCESSORY_TEXT_RE = /(acess[oó]rio|accessory|capa|carregador|pel[ií]cula|cabo|suporte|adaptador|fonte|fone|pencil|caneta|keyboard|teclado|case)/i
const SERIAL_ACCESSORY_RE = /(pencil|caneta|airpods|watch|garmin|keyboard|teclado|magic keyboard|mouse|trackpad)/i

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function normalizeCatalogName(value: string) {
  return value.trim().toLowerCase()
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
}

function legacyCategoryLabel(value: string) {
  return CATEGORIES.find((category) => category.value === value)?.label || value
}

export function legacyProductType(categoryValue: string, label?: string | null): ProductType {
  return isAccessoryCategory(categoryValue, label) ? "accessory" : "device"
}

export function buildLegacyCatalogConfig(): CatalogConfig {
  return {
    categories: Object.entries(PRODUCT_CATALOG as unknown as Record<string, LegacyCatalogGroup>).map(([value, group]) => ({
      value,
      label: group.label || legacyCategoryLabel(value),
      productType: legacyProductType(value, group.label),
      colors: mergeColorOptions(...(group.models || []).map((model) => model.colors ? [...model.colors] : [])),
      models: (group.models || []).map((model) => ({
        name: model.name,
        storage: model.storage ? [...model.storage] : undefined,
        sizes: model.sizes ? [...model.sizes] : undefined,
        colors: model.colors ? [...model.colors] : [],
      })),
    })),
  }
}

export function getCategoryOptions(config: CatalogConfig) {
  return config.categories.map((category) => ({ label: category.label, value: category.value }))
}

export function getCatalogCategory(config: CatalogConfig, categoryValue: string) {
  return config.categories.find((category) => category.value === categoryValue) || config.categories[0] || null
}

export function isAccessoryCategory(categoryValue: string, label?: string | null) {
  return ACCESSORY_CATEGORY_RE.test(categoryValue) || Boolean(label && ACCESSORY_TEXT_RE.test(label))
}

export function isAccessoryProduct(input: { mode?: string; category?: string; categoryLabel?: string | null; name?: string | null; productType?: string | null }) {
  return Boolean(input.productType && input.productType !== "device") || input.mode === "manual" || isAccessoryCategory(input.category || "", input.categoryLabel) || Boolean(input.name && ACCESSORY_TEXT_RE.test(input.name))
}

export function accessoryUsuallyHasSerial(name?: string | null) {
  return Boolean(name && SERIAL_ACCESSORY_RE.test(name))
}

function firstSpecOptions(attributes: CatalogAttributeRow[], options: CatalogAttributeOptionRow[], categoryId: string, names: string[]) {
  const normalizedNames = names.map(slugify)
  const attribute = attributes
    .filter((item) => item.category_id === categoryId && item.is_active !== false)
    .find((item) => normalizedNames.includes(slugify(item.slug || item.name || "")))

  if (!attribute?.id) return []

  return options
    .filter((option) => option.attribute_id === attribute.id && option.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((option) => String(option.label || option.value || "").trim())
    .filter(Boolean)
}

let catalogConfigPromise: Promise<CatalogConfig> | null = null

function catalogTable<T>(table: string) {
  return supabase.from(table) as unknown as CatalogQuery<T>
}

async function fetchCatalogConfig(): Promise<CatalogConfig> {
  const fallback = buildLegacyCatalogConfig()

  try {
    const [{ data: categories, error: categoriesError }, { data: subcategories }, { data: attributes }, { data: options }, { data: colors }, { data: subcategoryColors }] = await Promise.all([
      catalogTable<CatalogCategoryRow>("product_categories").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      catalogTable<CatalogSubcategoryRow>("product_subcategories").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      catalogTable<CatalogAttributeRow>("product_attributes").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      catalogTable<CatalogAttributeOptionRow>("product_attribute_options").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      catalogTable<CatalogColorRow>("product_colors").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      catalogTable<CatalogSubcategoryColorRow>("product_subcategory_colors").select("*").order("sort_order", { ascending: true }),
    ])

    if (categoriesError || !Array.isArray(categories) || categories.length === 0) return fallback
    const categoryRows = categories
    const subcategoryRows = Array.isArray(subcategories) ? subcategories : []
    const attributeRows = Array.isArray(attributes) ? attributes : []
    const optionRows = Array.isArray(options) ? options : []
    const colorRows = Array.isArray(colors) ? colors : []
    const subcategoryColorRows = Array.isArray(subcategoryColors) ? subcategoryColors : []
    const colorById = new Map(colorRows.map((color) => [String(color.id || ""), color]))
    const globalColors = colorRows
      .filter((color) => !color.category_id)
      .map((color) => ({ id: color.id, name: color.name, hex: color.hex }))
    const colorLinksBySubcategoryId = new Map<string, CatalogSubcategoryColorRow[]>()

    for (const link of subcategoryColorRows) {
      if (!link.subcategory_id || !link.color_id || link.is_active === false) continue
      const current = colorLinksBySubcategoryId.get(link.subcategory_id) || []
      current.push(link)
      colorLinksBySubcategoryId.set(link.subcategory_id, current)
    }

    const dynamicCategories = categoryRows.map((category) => {
      const value = category.legacy_key || category.slug || slugify(category.name)
      const productType = (category.product_type || legacyProductType(value, category.name)) as ProductType
      const storage = firstSpecOptions(attributeRows, optionRows, category.id, ["storage", "armazenamento", "capacidade"])
      const sizes = firstSpecOptions(attributeRows, optionRows, category.id, ["size", "tamanho"])
      const categoryColors = colorRows
        .filter((color) => !color.category_id || color.category_id === category.id)
        .map((color) => ({ id: color.id, name: color.name, hex: color.hex }))

      const dynamicModels = subcategoryRows
        .filter((subcategory) => subcategory.category_id === category.id)
        .map((subcategory) => {
          const legacy = fallback.categories
            .find((item) => item.value === value)
            ?.models.find((model) => model.name === subcategory.legacy_model || model.name === subcategory.name)

          const linkedColors = (colorLinksBySubcategoryId.get(subcategory.id) || [])
            .map((link) => colorById.get(link.color_id))
            .filter((color): color is CatalogColorRow => Boolean(color))
            .filter((color) => !color.category_id || color.category_id === category.id)
            .map((color) => ({ id: color.id, name: color.name, hex: color.hex }))

          return {
            id: subcategory.id,
            subcategoryId: subcategory.id,
            name: subcategory.name,
            storage: storage.length ? storage : legacy?.storage,
            sizes: sizes.length ? sizes : legacy?.sizes,
            colors: mergeColorOptions(linkedColors),
          }
        })

      return {
        id: category.id,
        value,
        label: category.name,
        productType,
        colors: mergeColorOptions(categoryColors, globalColors),
        models: dynamicModels.length ? dynamicModels : fallback.categories.find((item) => item.value === value)?.models || [],
      }
    })

    return { categories: dynamicCategories.length ? dynamicCategories : fallback.categories }
  } catch {
    return fallback
  }
}

export async function loadCatalogConfig(options: { refresh?: boolean } = {}): Promise<CatalogConfig> {
  if (options.refresh) catalogConfigPromise = null
  if (!catalogConfigPromise) catalogConfigPromise = fetchCatalogConfig()
  return catalogConfigPromise
}

function invalidateCatalogConfigCache() {
  catalogConfigPromise = null
}

export function mergeColorOptions(...groups: Array<CatalogColor[] | undefined>) {
  const byName = new Map<string, CatalogColor>()
  for (const group of groups) {
    for (const color of group || []) {
      const key = slugify(color.name)
      if (!byName.has(key)) byName.set(key, color)
    }
  }
  return Array.from(byName.values())
}

export async function createOrLinkModelColor(input: {
  categoryId?: string | null
  subcategoryId?: string | null
  color: CatalogColor
  existingColors?: CatalogColor[]
}) {
  const nextName = input.color.name.trim()
  const nextHex = input.color.hex.trim().toUpperCase()
  if (!nextName) return input.color

  let resolvedColor = input.existingColors?.find((color) => normalizeCatalogName(color.name) === normalizeCatalogName(nextName))

  if (!resolvedColor?.id && input.categoryId) {
    const { data: categoryColors, error: findError } = await (supabase.from("product_colors") as any)
      .select("*")
      .eq("category_id", input.categoryId)
      .limit(200)

    if (findError) throw findError
    const match = (categoryColors || []).find((color: CatalogColorRow) => normalizeCatalogName(color.name) === normalizeCatalogName(nextName))
    if (match?.id && (match.is_active === false || match.deleted_at)) {
      const { error } = await (supabase.from("product_colors") as any)
        .update({ is_active: true, deleted_at: null })
        .eq("id", match.id)
      if (error) throw error
    }
    resolvedColor = match ? { id: match.id, name: match.name, hex: match.hex } : undefined
  }

  if (!resolvedColor?.id && input.categoryId) {
    const { data: created, error } = await (supabase.from("product_colors") as any)
      .insert({
        category_id: input.categoryId,
        name: nextName,
        hex: nextHex,
        normalized_name: normalizeCatalogName(nextName),
      })
      .select("*")
      .single()

    if (error) throw error
    resolvedColor = { id: created?.id, name: created?.name || nextName, hex: created?.hex || nextHex }
  }

  const outputColor = resolvedColor || { name: nextName, hex: nextHex }

  if (input.subcategoryId && outputColor.id) {
    const { data: existingLinks, error: linkFindError } = await (supabase.from("product_subcategory_colors") as any)
      .select("*")
      .eq("subcategory_id", input.subcategoryId)
      .eq("color_id", outputColor.id)
      .limit(1)

    if (linkFindError) throw linkFindError

    const existingLink = existingLinks?.[0]
    if (existingLink?.id) {
      if (existingLink.is_active === false) {
        const { error } = await (supabase.from("product_subcategory_colors") as any)
          .update({ is_active: true })
          .eq("id", existingLink.id)
        if (error) throw error
      }
    } else {
      const { error } = await (supabase.from("product_subcategory_colors") as any)
        .insert({
          subcategory_id: input.subcategoryId,
          color_id: outputColor.id,
          is_active: true,
        })
      if (error) throw error
    }
  }

  invalidateCatalogConfigCache()
  return outputColor
}

export async function createOrReuseCatalogColor(input: {
  categoryId?: string | null
  color: CatalogColor
  existingColors?: CatalogColor[]
}) {
  const nextName = input.color.name.trim()
  const nextHex = input.color.hex.trim().toUpperCase()
  if (!nextName) return input.color

  let resolvedColor = input.existingColors?.find((color) => normalizeCatalogName(color.name) === normalizeCatalogName(nextName))

  const query = (supabase.from("product_colors") as any)
    .select("*")
    .limit(200)

  if (input.categoryId) {
    query.eq("category_id", input.categoryId)
  } else {
    query.is("category_id", null)
  }

  const { data: scopedColors, error: findError } = await query
  if (findError) throw findError

  const match = (scopedColors || []).find((color: CatalogColorRow) => normalizeCatalogName(color.name) === normalizeCatalogName(nextName))
  if (match?.id) {
    if (match.is_active === false || match.deleted_at || match.hex !== nextHex) {
      const { error } = await (supabase.from("product_colors") as any)
        .update({ is_active: true, deleted_at: null, hex: nextHex, normalized_name: normalizeCatalogName(nextName) })
        .eq("id", match.id)
      if (error) throw error
    }
    resolvedColor = { id: match.id, name: match.name || nextName, hex: nextHex || match.hex }
  }

  if (!resolvedColor?.id) {
    const { data: created, error } = await (supabase.from("product_colors") as any)
      .insert({
        category_id: input.categoryId || null,
        name: nextName,
        hex: nextHex,
        normalized_name: normalizeCatalogName(nextName),
      })
      .select("*")
      .single()

    if (error) throw error
    resolvedColor = { id: created?.id, name: created?.name || nextName, hex: created?.hex || nextHex }
  }

  invalidateCatalogConfigCache()
  return resolvedColor || { name: nextName, hex: nextHex }
}

export function optionObjects(values?: string[]) {
  return uniqueValues(values || []).map((value) => ({ label: value, value }))
}
