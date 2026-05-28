import manifestData from "./product-assets-manifest.json"

export type ProductAssetInput = {
  brand?: string | null
  model?: string | null
  color?: string | null
  category?: string | null
  uploadedImageUrl?: string | null
  uploadedThumbnailUrl?: string | null
}

export type ProductAssetImageInfo = {
  src: string
  fullSrc: string
  alt: string
  isFallback: boolean
  badge: "Foto real" | "Asset padrão" | "Placeholder"
  source: "uploaded" | "static_asset" | "category_fallback" | "placeholder"
  kind: "iphone" | "ipad" | "macbook" | "apple-watch" | "airpods" | "generic-device" | "unknown-device"
  modelSlug: string | null
  colorSlug: string | null
}

export type ProductImageResolutionContext = "stock" | "customer_portal" | "public_listing"

type ManifestEntry = {
  original: string
  model_slug: string
  file_name: string
  public_path: string
}

const manifest = manifestData as ManifestEntry[]

export const PRODUCT_ASSET_FALLBACKS = {
  iphone: "/product-assets/fallbacks/iphone.webp",
  ipad: "/product-assets/fallbacks/ipad.webp",
  macbook: "/product-assets/fallbacks/macbook.webp",
  appleWatch: "/product-assets/fallbacks/apple-watch.webp",
  airpods: "/product-assets/fallbacks/airpods.webp",
  genericDevice: "/product-assets/fallbacks/generic-device.webp",
  unknownDevice: "/product-assets/fallbacks/unknown-device.webp",
} as const

const assetPathByKey = new Map(
  manifest.map((entry) => [
    `${entry.model_slug}:${colorSlugFromFileName(entry.model_slug, entry.file_name)}`,
    entry.public_path,
  ])
)

const modelSlugs = new Set(manifest.map((entry) => entry.model_slug))

const COLOR_ALIASES: Record<string, string[]> = {
  azul: ["blue", "sierra-blue", "mist-blue", "deep-blue", "blue-titanium", "ultramarine"],
  blue: ["blue", "sierra-blue", "mist-blue", "deep-blue", "blue-titanium", "ultramarine"],
  "azul-sierra": ["sierra-blue", "blue"],
  "sierra-blue": ["sierra-blue", "blue"],
  "azul-titanio": ["blue-titanium", "blue"],
  "blue-titanium": ["blue-titanium", "blue"],
  "mist-blue": ["mist-blue", "blue"],
  "deep-blue": ["deep-blue", "blue"],
  ultramarine: ["ultramarine", "blue"],

  rosa: ["pink"],
  pink: ["pink"],

  preto: ["black", "midnight", "space-black", "black-titanium", "graphite"],
  black: ["black", "midnight", "space-black", "black-titanium", "graphite"],
  "meia-noite": ["midnight", "black"],
  midnight: ["midnight", "black"],
  grafite: ["graphite", "black"],
  graphite: ["graphite", "black"],
  "preto-espacial": ["space-black", "black"],
  "space-black": ["space-black", "black"],
  "titanio-preto": ["black-titanium", "black"],
  "black-titanium": ["black-titanium", "black"],

  branco: ["white", "starlight", "silver", "white-titanium"],
  white: ["white", "starlight", "silver", "white-titanium"],
  estelar: ["starlight", "white"],
  starlight: ["starlight", "white"],
  prata: ["silver", "white"],
  prateado: ["silver", "white"],
  silver: ["silver", "white"],
  "titanio-branco": ["white-titanium", "white"],
  "white-titanium": ["white-titanium", "white"],

  verde: ["green", "alpine-green", "teal", "sage"],
  green: ["green", "alpine-green", "teal", "sage"],
  "verde-oliva": ["green"],
  "verde-alpino": ["alpine-green", "green"],
  "verde-alpine": ["alpine-green", "green"],
  "alpine-green": ["alpine-green", "green"],
  teal: ["teal", "green"],
  salvia: ["sage", "green"],
  sage: ["sage", "green"],

  vermelho: ["product-red"],
  red: ["product-red"],
  "product-red": ["product-red"],

  roxo: ["purple", "deep-purple", "lavender"],
  lilas: ["purple", "lavender", "deep-purple"],
  lavender: ["lavender", "purple"],
  lavanda: ["lavender", "purple"],
  purple: ["purple", "deep-purple", "lavender"],
  "roxo-escuro": ["deep-purple", "purple"],
  "deep-purple": ["deep-purple", "purple"],

  dourado: ["gold"],
  ouro: ["gold"],
  gold: ["gold"],

  amarelo: ["yellow"],
  yellow: ["yellow"],

  "titanio-natural": ["natural-titanium"],
  "natural-titanium": ["natural-titanium"],
  "titanio-azul": ["blue-titanium", "blue"],
  "titanio-deserto": ["desert-titanium"],
  "desert-titanium": ["desert-titanium"],

  laranja: ["cosmic-orange"],
  "laranja-cosmico": ["cosmic-orange"],
  "cosmic-orange": ["cosmic-orange"],
}

function colorSlugFromFileName(modelSlug: string, fileName: string) {
  return fileName
    .replace(new RegExp(`^${modelSlug}-`), "")
    .replace(/\.webp$/i, "")
}

export function normalizeProductAssetText(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
}

function getText(input: ProductAssetInput) {
  return {
    brand: normalizeProductAssetText(input.brand),
    model: normalizeProductAssetText(input.model),
    color: normalizeProductAssetText(input.color),
    category: normalizeProductAssetText(input.category),
  }
}

function isAppleProduct(input: ProductAssetInput) {
  const text = Object.values(getText(input)).join("-")
  return /(^|-)apple($|-)/.test(text) || /(^|-)iphone($|-)/.test(text)
}

function resolveCategoryKind(input: ProductAssetInput): ProductAssetImageInfo["kind"] {
  const text = `${getText(input).brand}-${getText(input).category}-${getText(input).model}`
  if (/(^|-)(accessories|acessorios|acessorio|capa|case|pelicula|pencil|caneta|stylus|cabo|fonte|carregador)($|-)/.test(text)) return "generic-device"
  if (/(^|-)iphone($|-)/.test(text)) return "iphone"
  if (/(^|-)ipad($|-)/.test(text)) return "ipad"
  if (/(^|-)(macbook|mac)($|-)/.test(text)) return "macbook"
  if (/(^|-)(applewatch|apple-watch|watch)($|-)/.test(text)) return "apple-watch"
  if (/(^|-)(airpods|airpod|fone)($|-)/.test(text)) return "airpods"
  if (isAppleProduct(input)) return "generic-device"
  if (text.replace(/-/g, "")) return "unknown-device"
  return "unknown-device"
}

function isIphoneProduct(input: ProductAssetInput) {
  const text = `${getText(input).category}-${getText(input).model}`
  return /(^|-)iphone($|-)/.test(text)
}

function resolveIphoneModelSlug(input: ProductAssetInput): string | null {
  const normalized = normalizeProductAssetText(`${input.category || ""} ${input.model || ""}`)
    .replace(/\b\d+\s*(gb|tb)\b/g, "")
    .replace(/\b(a\+|a-|a|b\+|b|c|lacrado)\b/g, "")
    .replace(/-+/g, "-")

  if (normalized.includes("iphone-air")) return modelSlugs.has("iphone-air") ? "iphone-air" : null

  const match = normalized.match(/(?:^|-)iphone-?(\d{2})(?:-(pro-max|pro|plus|mini|max))?/)
    || normalized.match(/(?:^|-)(\d{2})(?:-(pro-max|pro|plus|mini|max))?/)
  if (!match) return null

  const [, generation, suffix] = match
  const slug = ["iphone", generation, suffix].filter(Boolean).join("-")
  return modelSlugs.has(slug) ? slug : null
}

function resolveColorCandidates(color?: string | null) {
  const normalized = normalizeProductAssetText(color)
  if (!normalized) return []
  return COLOR_ALIASES[normalized] || [normalized]
}

function assetAlt(input: ProductAssetInput, isFallback: boolean) {
  const name = [input.brand, input.model, input.color].filter(Boolean).join(" ").trim()
  if (name) return isFallback ? `${name} - imagem ilustrativa` : name
  return isFallback ? "Produto - imagem ilustrativa" : "Produto"
}

function fallbackForKind(kind: ProductAssetImageInfo["kind"]) {
  if (kind === "iphone") return PRODUCT_ASSET_FALLBACKS.iphone
  if (kind === "ipad") return PRODUCT_ASSET_FALLBACKS.ipad
  if (kind === "macbook") return PRODUCT_ASSET_FALLBACKS.macbook
  if (kind === "apple-watch") return PRODUCT_ASSET_FALLBACKS.appleWatch
  if (kind === "airpods") return PRODUCT_ASSET_FALLBACKS.airpods
  if (kind === "generic-device") return PRODUCT_ASSET_FALLBACKS.genericDevice
  return PRODUCT_ASSET_FALLBACKS.unknownDevice
}

export function getProductAssetImageInfo(input: ProductAssetInput): ProductAssetImageInfo {
  const uploadedSrc = input.uploadedThumbnailUrl || input.uploadedImageUrl
  if (uploadedSrc) {
    return {
      src: uploadedSrc,
      fullSrc: input.uploadedImageUrl || uploadedSrc,
      alt: assetAlt(input, false),
      isFallback: false,
      badge: "Foto real",
      source: "uploaded",
      kind: resolveCategoryKind(input),
      modelSlug: null,
      colorSlug: null,
    }
  }

  const modelSlug = resolveIphoneModelSlug(input)
  const iphone = isIphoneProduct(input) || Boolean(modelSlug)
  const kind = iphone ? "iphone" : resolveCategoryKind(input)

  if (!iphone) {
    return {
      src: fallbackForKind(kind),
      fullSrc: fallbackForKind(kind),
      alt: assetAlt(input, true),
      isFallback: true,
      badge: kind === "unknown-device" ? "Placeholder" : "Placeholder",
      source: kind === "unknown-device" ? "placeholder" : "category_fallback",
      kind,
      modelSlug: null,
      colorSlug: null,
    }
  }

  if (modelSlug) {
    for (const colorSlug of resolveColorCandidates(input.color)) {
      const src = assetPathByKey.get(`${modelSlug}:${colorSlug}`)
      if (src) {
        return {
          src,
          fullSrc: src,
          alt: assetAlt(input, false),
          isFallback: false,
          badge: "Asset padrão",
          source: "static_asset",
          kind: "iphone",
          modelSlug,
          colorSlug,
        }
      }
    }
  }

  return {
    src: fallbackForKind(kind),
    fullSrc: fallbackForKind(kind),
    alt: assetAlt(input, true),
    isFallback: true,
    badge: kind === "unknown-device" ? "Placeholder" : "Placeholder",
    source: kind === "unknown-device" ? "placeholder" : "category_fallback",
    kind,
    modelSlug,
    colorSlug: null,
  }
}

export function getProductAssetImage(input: ProductAssetInput): string {
  return getProductAssetImageInfo(input).src
}

function stripPublicationMedia(input: ProductAssetInput): ProductAssetInput {
  return {
    ...input,
    uploadedImageUrl: null,
    uploadedThumbnailUrl: null,
  }
}

export function resolveStockDisplayImage(input: ProductAssetInput): ProductAssetImageInfo {
  return getProductAssetImageInfo(stripPublicationMedia(input))
}

export function resolveCustomerPortalImage(input: ProductAssetInput): ProductAssetImageInfo {
  return getProductAssetImageInfo(stripPublicationMedia(input))
}

export function resolvePublicListingImage(input: ProductAssetInput): ProductAssetImageInfo {
  return getProductAssetImageInfo(input)
}

export function resolveProductImageForContext(
  input: ProductAssetInput,
  context: ProductImageResolutionContext = "public_listing",
): ProductAssetImageInfo {
  if (context === "stock") return resolveStockDisplayImage(input)
  if (context === "customer_portal") return resolveCustomerPortalImage(input)
  return resolvePublicListingImage(input)
}
