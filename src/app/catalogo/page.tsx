import type { Metadata } from "next"
import { CatalogShell } from "@/components/catalog/catalog-shell"
import { CatalogHero } from "@/components/catalog/catalog-hero"
import { CatalogTrustCards } from "@/components/catalog/catalog-trust-cards"
import { CatalogGrid } from "@/components/catalog/catalog-grid"
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state"
import { listPublicCatalog } from "@/lib/catalog/queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Catálogo Nobretech | Aparelhos disponíveis",
  description:
    "Veja aparelhos disponíveis na Nobretech com fotos reais, garantia e atendimento pelo WhatsApp.",
}

export default async function CatalogoPage() {
  const products = await listPublicCatalog()

  return (
    <CatalogShell>
      <CatalogHero availableCount={products.length} />
      <CatalogTrustCards />
      {products.length === 0 ? (
        <section className="px-4 pb-16 pt-2 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <CatalogEmptyState />
          </div>
        </section>
      ) : (
        <CatalogGrid products={products} />
      )}
    </CatalogShell>
  )
}
