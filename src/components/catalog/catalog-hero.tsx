import { ArrowRight } from "@phosphor-icons/react/dist/ssr"
import type { CatalogCompanyIdentity } from "@/lib/catalog/company-identity"
import type { CatalogPublicSettings } from "@/lib/catalog/settings"

type Props = {
  availableCount: number
  identity: CatalogCompanyIdentity
  settings: CatalogPublicSettings
}

const DEFAULT_TAGLINE = "Aparelhos selecionados pela loja."

export function CatalogHero({ availableCount, identity, settings }: Props) {
  const eyebrow = `Catálogo ${identity.shortName ?? "loja"}`
  const tagline = settings.heroTagline ?? DEFAULT_TAGLINE

  return (
    <section className="relative px-4 pb-4 pt-5 sm:px-6 sm:pb-7 sm:pt-9">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-5 backdrop-blur-xl sm:p-9">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#D6A84F]/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-20 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl"
          />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D6A84F]/30 bg-[#D6A84F]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.25em] text-[#F2D88A]">
              {eyebrow}
            </span>
            <h1 className="mt-3.5 font-[family-name:var(--font-syne)] text-[1.85rem] font-semibold leading-[1.05] tracking-tight sm:text-[2.6rem]">
              Tecnologia com <span className="text-[#F2D88A]">procedência</span>.
              <br />
              Confiança que você vê.
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-zinc-300 sm:text-[14.5px]">
              {tagline}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="#selecao"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-5 text-[13px] font-semibold text-[#1a1206] shadow-[0_12px_36px_rgba(214,168,79,0.22)] transition hover:scale-[1.02]"
              >
                Ver seleção
                <ArrowRight className="h-4 w-4" />
              </a>
              {identity.whatsapp ? (
                <a
                  href={identity.whatsapp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/[0.1] bg-transparent px-4 text-[13px] font-medium text-zinc-200 transition hover:bg-white/[0.05]"
                >
                  Falar no WhatsApp
                </a>
              ) : null}
            </div>
            {availableCount > 0 ? (
              <p className="mt-3 text-[11px] text-zinc-500">
                {availableCount} {availableCount === 1 ? "aparelho disponível" : "aparelhos disponíveis"} agora.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
