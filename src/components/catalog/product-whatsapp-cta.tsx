import { ChatCircle } from "@phosphor-icons/react/dist/ssr"
import type { PublicCatalogProduct } from "@/lib/catalog/types"
import { buildWhatsAppLink, type CatalogWhatsAppEndpoint } from "@/lib/catalog/whatsapp"

type Props = {
  product: PublicCatalogProduct
  whatsappEndpoint: CatalogWhatsAppEndpoint | null
  brandShortName?: string | null
  variant?: "primary" | "sticky" | "secondary"
  label?: string
}

export function ProductWhatsAppCta({
  product,
  whatsappEndpoint,
  brandShortName = null,
  variant = "primary",
  label = "Falar no WhatsApp",
}: Props) {
  const href = buildWhatsAppLink(product, whatsappEndpoint, brandShortName)
  if (!href) return null

  const className =
    variant === "sticky"
      ? "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-4 text-[12.5px] font-semibold text-[#1a1206] shadow-[0_8px_24px_rgba(214,168,79,0.3)]"
      : variant === "secondary"
      ? "inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] text-[13px] font-medium text-white transition hover:bg-white/[0.08]"
      : "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-6 text-[13px] font-semibold text-[#1a1206] shadow-[0_12px_36px_rgba(214,168,79,0.22)] transition hover:scale-[1.02]"

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <ChatCircle className="h-4 w-4" />
      {label}
    </a>
  )
}
