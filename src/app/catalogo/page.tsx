import type { Metadata } from "next"
import { CatalogShell } from "@/components/catalog/catalog-shell"
import { CatalogHero } from "@/components/catalog/catalog-hero"
import { CatalogTrustCards } from "@/components/catalog/catalog-trust-cards"
import { CatalogGrid } from "@/components/catalog/catalog-grid"
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state"
import { listPublicCatalog } from "@/lib/catalog/queries"
import { getCatalogCompanyIdentity } from "@/lib/catalog/company-identity"
import { resolveCatalogPublicConfig } from "@/lib/catalog/settings"

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
  // Override só se houver imagem específica do catálogo. Sem override, Next cai
  // automaticamente na /catalogo/opengraph-image.tsx (branded auto-rendered).
  if (identity.catalogOgImageUrl) og.images = [{ url: identity.catalogOgImageUrl }]

  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: og,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(identity.catalogOgImageUrl ? { images: [{ url: identity.catalogOgImageUrl }] } : {}),
    },
  }
}

export default async function CatalogoPage() {
  const identity = await getCatalogCompanyIdentity()
  const [products, config] = await Promise.all([
    listPublicCatalog({ brandShortName: identity.shortName }),
    resolveCatalogPublicConfig(identity.companyId),
  ])

  return (
    <CatalogShell identity={identity}>
      <CatalogHero availableCount={products.length} identity={identity} settings={config.settings} />
      <CatalogTrustCards badges={config.catalogBadges} />
      {products.length === 0 ? (
        <section className="px-4 pb-16 pt-2 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <CatalogEmptyState
              title={config.settings.emptyStateTitle}
              description={config.settings.emptyStateDescription}
              whatsappUrl={identity.whatsapp?.url ?? null}
            />
          </div>
        </section>
      ) : (
        <CatalogGrid
          products={products}
          whatsappUrl={identity.whatsapp?.url ?? null}
          copy={{
            gridHeading: config.settings.gridHeading,
            gridSubheading: config.settings.gridSubheading,
            noResultsTitle: config.settings.noResultsTitle,
            noResultsDescription: config.settings.noResultsDescription,
          }}
        />
      )}
    </CatalogShell>
  )
}
