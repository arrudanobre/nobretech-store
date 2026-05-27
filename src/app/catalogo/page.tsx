import type { Metadata } from "next"
import { CatalogShell } from "@/components/catalog/catalog-shell"
import { CatalogHero } from "@/components/catalog/catalog-hero"
import { CatalogTrustCards } from "@/components/catalog/catalog-trust-cards"
import { CatalogGrid } from "@/components/catalog/catalog-grid"
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state"
import { listPublicCatalog } from "@/lib/catalog/queries"
import { getCatalogCompanyIdentity } from "@/lib/catalog/company-identity"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getCatalogCompanyIdentity()
  const title = `Catálogo ${identity.shortName ?? "da loja"}`
  const description =
    identity.publicDescription ||
    "Veja os aparelhos disponíveis no catálogo da loja, com fotos reais nos seminovos, garantia e atendimento pelo WhatsApp."
  const url = identity.catalogUrl ?? undefined
  const siteName = identity.displayName

  const og: Metadata["openGraph"] = {
    title,
    description,
    locale: "pt_BR",
    type: "website",
    siteName,
  }
  if (url) og.url = url
  if (identity.ogImageUrl) og.images = [{ url: identity.ogImageUrl }]

  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: og,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(identity.ogImageUrl ? { images: [{ url: identity.ogImageUrl }] } : {}),
    },
  }
}

export default async function CatalogoPage() {
  const identity = await getCatalogCompanyIdentity()
  const products = await listPublicCatalog({ brandShortName: identity.shortName })

  return (
    <CatalogShell identity={identity}>
      <CatalogHero availableCount={products.length} identity={identity} />
      <CatalogTrustCards />
      {products.length === 0 ? (
        <section className="px-4 pb-16 pt-2 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <CatalogEmptyState whatsappUrl={identity.whatsapp?.url ?? null} />
          </div>
        </section>
      ) : (
        <CatalogGrid products={products} whatsappUrl={identity.whatsapp?.url ?? null} />
      )}
    </CatalogShell>
  )
}
