import type { PublicCatalogProduct } from "@/lib/catalog/types"

// Same number used by the public landing page (src/components/landing/nobretech-landing-page.tsx).
// Centralized here so the catalog and any future caller share one source.
export const NOBRETECH_WHATSAPP_BASE = "https://wa.me/5598988265655"

export function buildWhatsAppLink(product: Pick<PublicCatalogProduct, "title" | "storage" | "color" | "whatsappMessage">): string {
  const message = product.whatsappMessage || defaultMessageForProduct(product)
  const url = new URL(NOBRETECH_WHATSAPP_BASE)
  url.searchParams.set("text", message)
  return url.toString()
}

export function buildGenericWhatsAppLink(message: string): string {
  const url = new URL(NOBRETECH_WHATSAPP_BASE)
  url.searchParams.set("text", message)
  return url.toString()
}

export function defaultMessageForProduct(product: { title: string; storage?: string | null; color?: string | null }): string {
  const descriptor = [product.title, product.storage, product.color].filter(Boolean).join(" ")
  return `Olá, vi no catálogo da Nobretech o ${descriptor} e queria mais informações.`
}
