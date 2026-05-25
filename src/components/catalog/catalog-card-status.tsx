import { Camera, ImageSquare, SealCheck, SealPercent } from "@phosphor-icons/react/dist/ssr"
import type { PublicCatalogProduct } from "@/lib/catalog/types"
import { isValidPromoPrice } from "@/lib/catalog/pricing"

type Props = {
  product: PublicCatalogProduct
}

function statusLabel(product: PublicCatalogProduct) {
  if (product.condition === "sealed") return "Lacrado"
  return product.condition === "open_box" ? "Open Box" : "Seminovo"
}

export function CatalogCardStatus({ product }: Props) {
  const heroImage = product.images[0]
  const hasPromo = isValidPromoPrice(product.price, product.promoPrice)
  const isSealed = product.condition === "sealed"
  const isRealPhoto = heroImage?.kind === "real_photo"
  const MainIcon = hasPromo ? SealPercent : SealCheck

  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] shadow-[0_10px_26px_rgba(0,0,0,0.28)] ${
              hasPromo
                ? "border-[#FFE7A3]/70 bg-[#E7C76A] text-[#16110A] shadow-[0_10px_26px_rgba(231,199,106,0.18)]"
                : isSealed
                  ? "border-[#D6A84F]/60 bg-[#2A2110] text-[#F4D57A]"
                  : "border-white/20 bg-[#1B2028] text-white"
            }`}
          >
            <MainIcon className="h-3.5 w-3.5" weight="bold" />
            {hasPromo ? "Oferta Nobretech" : statusLabel(product)}
          </span>
        </div>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
          isRealPhoto
            ? "border-emerald-400/50 bg-emerald-950 text-emerald-100"
            : "border-zinc-500/60 bg-zinc-800 text-zinc-100"
        }`}
      >
        {isRealPhoto ? (
          <Camera className="h-3.5 w-3.5" weight="bold" />
        ) : (
          <ImageSquare className="h-3.5 w-3.5" weight="duotone" />
        )}
        {isRealPhoto ? "Foto real" : "Imagem do modelo"}
      </span>
    </div>
  )
}
