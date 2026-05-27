import Link from "next/link"
import { CatalogShell } from "@/components/catalog/catalog-shell"
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state"
import { getCatalogCompanyIdentity } from "@/lib/catalog/company-identity"
import { getCatalogSettings } from "@/lib/catalog/settings"

export default async function CatalogoNotFound() {
  const identity = await getCatalogCompanyIdentity()
  const settings = await getCatalogSettings(identity.companyId ?? "")
  const fallbackDescription = identity.shortName
    ? `Este aparelho saiu do catálogo ou ainda não foi publicado. Fale com a ${identity.shortName} para receber a seleção atual.`
    : "Este aparelho saiu do catálogo ou ainda não foi publicado. Fale com a loja para receber a seleção atual."
  const description = settings.emptyStateDescription ?? fallbackDescription

  return (
    <CatalogShell identity={identity}>
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-md">
          <CatalogEmptyState
            title="Aparelho não disponível"
            description={description}
            whatsappUrl={identity.whatsapp?.url ?? null}
          />
          <div className="mt-6 text-center">
            <Link
              href="/catalogo"
              className="text-xs font-medium text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              Voltar para o catálogo
            </Link>
          </div>
        </div>
      </section>
    </CatalogShell>
  )
}
