import Link from "next/link"
import { ChatCircle } from "@phosphor-icons/react/dist/ssr"
import type { CatalogCompanyIdentity } from "@/lib/catalog/company-identity"
import { buildCatalogLocationLabel } from "@/lib/catalog/company-identity"

type Props = {
  children: React.ReactNode
  identity: CatalogCompanyIdentity
}

export function CatalogShell({ children, identity }: Props) {
  const brandHeading = identity.shortName ? identity.shortName.toUpperCase() : "LOJA"
  const location = buildCatalogLocationLabel(identity)
  const footerLine = location ? `${identity.displayName} · ${location}` : identity.displayName
  const footerNote = location
    ? `Atendimento pelo WhatsApp e entrega presencial em ${identity.city ?? location}.`
    : "Atendimento pelo canal configurado."

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050607] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,168,79,0.12),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(34,197,94,0.05),_transparent_30%)]"
      />
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#050607]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
          <Link
            href="/catalogo"
            aria-label={`Voltar para o catálogo da ${identity.displayName}`}
            className="flex items-center gap-2.5"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#D6A84F] to-[#A6803A] text-[#1a1206] shadow-[0_6px_18px_rgba(214,168,79,0.3)]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M12 3 5 6v5c0 5 3.2 8.5 7 10 3.8-1.5 7-5 7-10V6l-7-3Z" />
                <path d="m8.8 12 2.2 2.2 5-5.2" />
              </svg>
            </span>
            <span className="leading-[1.05]">
              <span className="block font-[family-name:var(--font-syne)] text-[15px] font-semibold tracking-[0.16em] text-white">
                {brandHeading}
              </span>
              <span className="block text-[8.5px] font-medium uppercase tracking-[0.35em] text-zinc-500">
                Catálogo oficial
              </span>
            </span>
          </Link>
          {identity.whatsapp ? (
            <a
              href={identity.whatsapp.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Falar com a ${identity.shortName} no WhatsApp`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-200 transition hover:bg-emerald-500/20"
            >
              <ChatCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          ) : null}
        </div>
      </header>
      <main className="relative z-10 overflow-x-hidden">{children}</main>
      <footer className="relative z-10 border-t border-white/[0.05] px-4 py-7 text-center text-[11px] text-zinc-500 sm:px-6">
        <p>{footerLine}</p>
        <p className="mt-1">{footerNote}</p>
      </footer>
    </div>
  )
}
