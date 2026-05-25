import Link from "next/link"
import { CatalogShell } from "@/components/catalog/catalog-shell"
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state"

export default function CatalogoNotFound() {
  return (
    <CatalogShell>
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-md">
          <CatalogEmptyState
            title="Aparelho não disponível"
            description="Este aparelho saiu do catálogo ou ainda não foi publicado. Fale com a Nobretech para receber a seleção atual."
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
