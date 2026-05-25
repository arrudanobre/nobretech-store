import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Camera, SealCheck, ShieldCheck, Truck } from "@phosphor-icons/react/dist/ssr"
import type { PublicCatalogProduct } from "@/lib/catalog/types"
import { CatalogCardStatus } from "@/components/catalog/catalog-card-status"
import { formatScore10 } from "@/lib/catalog/score"
import { formatBRL } from "@/lib/helpers"
import { getCatalogDisplayPrice, getCatalogSavings, isValidPromoPrice } from "@/lib/catalog/pricing"

type Props = {
  product: PublicCatalogProduct
  priority?: boolean
}

function shouldBypassImageOptimization(image: PublicCatalogProduct["images"][number]) {
  return image.kind === "real_photo" || /^https?:\/\//i.test(image.url)
}

export function CatalogProductCard({ product, priority = false }: Props) {
  const heroImage = product.images[0]
  const isSealed = product.condition === "sealed"
  const isRealPhoto = heroImage?.kind === "real_photo"
  const hasPromo = isValidPromoPrice(product.price, product.promoPrice)
  const displayPrice = getCatalogDisplayPrice(product)
  const savings = getCatalogSavings(product)
  const maxInstallment = product.installmentOptions.at(-1)
  const conditionLabel = product.condition === "open_box" ? "Open Box" : "Seminovo"

  return (
    <Link
      href={`/catalogo/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.02] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20"
      aria-label={`Ver detalhes do ${product.title}`}
    >
      <CatalogCardStatus product={product} />

      <div className="relative aspect-[5/4] w-full overflow-hidden bg-gradient-to-b from-white/[0.035] to-transparent sm:aspect-[4/5]">
        {heroImage ? (
          isRealPhoto ? (
            <Image
              src={heroImage.url}
              alt={heroImage.alt}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={priority}
              unoptimized={shouldBypassImageOptimization(heroImage)}
              className="object-contain p-6 transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-5 sm:p-6">
              <div className="relative h-[78%] w-[78%] overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-b from-white to-white/[0.94] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <Image
                  src={heroImage.url}
                  alt={heroImage.alt}
                  fill
                  sizes="(max-width: 640px) 80vw, 30vw"
                  priority={priority}
                  unoptimized={shouldBypassImageOptimization(heroImage)}
                  className="object-contain p-3 transition duration-500 group-hover:scale-[1.03]"
                />
              </div>
            </div>
          )
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <p className="text-[9.5px] uppercase tracking-[0.22em] text-zinc-500">{product.categoryLabel}</p>
          <h3 className="mt-1 text-[16px] font-semibold leading-tight text-white sm:text-[17px]">
            {product.title}
          </h3>
          {product.subtitle ? (
            <p className="mt-0.5 text-[12.5px] text-zinc-400">{product.subtitle}</p>
          ) : null}
        </div>

        <div className="min-h-[74px] space-y-2">
          {isSealed ? (
            <>
              <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#F2D88A]">
                <span className="h-1 w-1 rounded-full bg-[#F2D88A]" aria-hidden />
                Lacrado de fábrica. {product.warrantyLabel}.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D6A84F]/40 bg-[#2A2110] px-2.5 py-1 text-[10.5px] font-semibold text-[#F4D57A]">
                  <SealCheck className="h-3 w-3" weight="duotone" />
                  Produto lacrado
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.045] px-2.5 py-1 text-[10.5px] font-semibold text-zinc-200">
                  <ShieldCheck className="h-3 w-3 text-[#F2D88A]" weight="duotone" />
                  {product.warrantyLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.045] px-2.5 py-1 text-[10.5px] font-semibold text-zinc-200">
                  <SealCheck className="h-3 w-3 text-[#F2D88A]" weight="duotone" />
                  Procedência conferida
                </span>
              </div>
            </>
          ) : product.scoreLabel ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-full border border-white/20 bg-[#1B2028] px-2.5 py-1 text-[10.5px] font-bold text-white">
                  {conditionLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-950 px-2.5 py-1 text-[10.5px] font-bold text-emerald-100">
                  <Camera className="h-3 w-3" weight="bold" />
                  {isRealPhoto ? "Foto real" : "Imagem do modelo"}
                </span>
              </div>
              <p className="text-[11.5px] font-medium text-zinc-300">
                Score Nobretech <span className="text-emerald-200">{formatScore10(product.score)}/10</span>
                <span className="ml-1 text-zinc-500">{product.scoreLabel}</span>
              </p>
            </>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <div>
            {hasPromo ? (
              <div className="space-y-0.5">
                <p className="text-[11px] text-zinc-500 line-through">De {formatBRL(product.price)}</p>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#F2D88A]">Por</p>
              </div>
            ) : null}
            <p className={`font-semibold sm:text-[20px] ${hasPromo ? "text-[22px] text-[#F5DC97]" : "text-[18px] text-white sm:text-[19px]"}`}>
              {formatBRL(displayPrice)}
            </p>
            {maxInstallment ? (
              <div className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">
                <p>Até {maxInstallment.text}</p>
                <p className="text-[#F2D88A]/80">com acréscimo da maquininha</p>
              </div>
            ) : product.installmentText ? (
              <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{product.installmentText}</p>
            ) : null}
            {savings ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                  Economize {formatBRL(savings)}
                </span>
                <span className="inline-flex rounded-full bg-[#D6A84F]/15 px-2 py-0.5 text-[10.5px] font-semibold text-[#F2D88A] ring-1 ring-[#D6A84F]/30">
                  Oferta ativa
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10.5px] font-medium text-emerald-200 ring-1 ring-emerald-400/40">
              <Truck className="h-3 w-3" weight="duotone" />
              Pronta entrega
            </span>
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-zinc-300 transition group-hover:text-[#F2D88A]">
              Ver detalhes
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
