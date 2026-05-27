import { ChatCircle, Storefront } from "@phosphor-icons/react/dist/ssr"

type Props = {
  title?: string | null
  description?: string | null
  whatsappUrl?: string | null
}

const FALLBACK_TITLE = "Catálogo da loja"
const FALLBACK_DESCRIPTION = "Em breve teremos novidades disponíveis."

export function CatalogEmptyState({ title, description, whatsappUrl = null }: Props) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/[0.08] bg-white/[0.035] p-8 text-center backdrop-blur-xl">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#D6A84F]/25 bg-[#D6A84F]/10 text-[#E7C16A]">
        <Storefront className="h-5 w-5" weight="duotone" />
      </span>
      <h2 className="mt-4 font-[family-name:var(--font-syne)] text-xl font-semibold text-white">
        {title || FALLBACK_TITLE}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {description || FALLBACK_DESCRIPTION}
      </p>
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-5 text-sm font-semibold text-[#1a1206] shadow-[0_12px_40px_rgba(214,168,79,0.25)] transition hover:scale-[1.02]"
        >
          <ChatCircle className="h-4 w-4" />
          Falar no WhatsApp
        </a>
      ) : null}
    </div>
  )
}
