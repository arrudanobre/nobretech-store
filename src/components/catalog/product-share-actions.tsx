"use client"

import { useState } from "react"
import { Check, ShareNetwork } from "@phosphor-icons/react/dist/ssr"

type Props = {
  productTitle: string
  productSlug: string
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <path d="M16.001 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.255.59 4.46 1.71 6.4L3.2 28.8l6.59-1.72a12.78 12.78 0 0 0 6.21 1.59h.005c7.06 0 12.8-5.74 12.8-12.8s-5.74-12.8-12.8-12.67ZM16 26.13a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-3.91 1.02 1.04-3.81-.25-.4a10.6 10.6 0 0 1-1.63-5.66c0-5.87 4.78-10.65 10.65-10.65s10.65 4.78 10.65 10.65S21.87 26.13 16 26.13Zm5.83-7.97c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.18.21-.37.24-.69.08-.32-.16-1.34-.5-2.55-1.59-.94-.84-1.58-1.87-1.77-2.19-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.54-.71-.55l-.61-.01c-.21 0-.55.08-.84.4-.29.32-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.39 4.75.75.32 1.34.51 1.8.66.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.16-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  )
}

export function ProductShareActions({ productTitle, productSlug }: Props) {
  const [copied, setCopied] = useState(false)

  const productUrl = `https://www.nobretechstore.com.br/catalogo/${productSlug}`
  const whatsappText = `Olha esse produto da Nobretech: ${productTitle}\n${productUrl}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`

  async function handleNativeShare() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: productTitle,
          text: `Olha esse produto da Nobretech: ${productTitle}`,
          url: productUrl,
        })
        return
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(productUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      }
    } catch {
      // clipboard blocked; nothing else to do silently
    }
  }

  return (
    <div className="flex w-full min-w-0 gap-2">
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 px-3 text-[12.5px] font-medium text-[#9ff0bc] transition hover:border-[#25D366]/60 hover:bg-[#25D366]/15"
        aria-label="Enviar este produto no WhatsApp"
      >
        <WhatsAppGlyph className="h-4 w-4" />
        Enviar no WhatsApp
      </a>
      <button
        type="button"
        onClick={handleNativeShare}
        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-3 text-[12.5px] font-medium text-zinc-100 transition hover:border-white/[0.18] hover:bg-white/[0.07]"
        aria-label={copied ? "Link do produto copiado" : "Compartilhar este produto"}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" weight="bold" />
            Link copiado
          </>
        ) : (
          <>
            <ShareNetwork className="h-4 w-4" weight="bold" />
            Compartilhar
          </>
        )}
      </button>
    </div>
  )
}
