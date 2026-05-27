import type { PublicCatalogProduct } from "@/lib/catalog/types"
import { getCatalogProductDisplayName } from "@/lib/catalog/product-display-name"

export type CatalogWhatsAppEndpoint = {
  url: string
  phone: string
}

function appendMessage(baseUrl: string, message: string): string {
  const url = new URL(baseUrl)
  url.searchParams.set("text", message)
  return url.toString()
}

export function buildWhatsAppLink(
  product: Pick<PublicCatalogProduct, "title" | "storage" | "color" | "whatsappMessage">,
  endpoint: CatalogWhatsAppEndpoint | null,
  brandShortName?: string | null
): string | null {
  if (!endpoint) return null
  const message = product.whatsappMessage || defaultMessageForProduct(product, brandShortName ?? null)
  return appendMessage(endpoint.url, message)
}

export function buildGenericWhatsAppLink(
  endpoint: CatalogWhatsAppEndpoint | null,
  message: string
): string | null {
  if (!endpoint) return null
  return appendMessage(endpoint.url, message)
}

export function defaultMessageForProduct(
  product: { title: string; storage?: string | null; color?: string | null },
  brandShortName: string | null
): string {
  const descriptor = getCatalogProductDisplayName(product)
  if (brandShortName) {
    return `Olá, vi no catálogo da ${brandShortName} o ${descriptor} e queria mais informações.`
  }
  return `Olá, vi este produto no catálogo (${descriptor}) e queria mais informações.`
}
