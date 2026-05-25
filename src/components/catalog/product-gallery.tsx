"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { Camera, ImageSquare } from "@phosphor-icons/react/dist/ssr"
import type { PublicCatalogImage } from "@/lib/catalog/types"

type Props = {
  images: PublicCatalogImage[]
  productTitle: string
}

export function ProductGallery({ images, productTitle }: Props) {
  const safeImages = images.length > 0 ? images : []
  const [activeIndex, setActiveIndex] = useState(0)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const active = safeImages[activeIndex]

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget
    const slideWidth = target.clientWidth
    if (slideWidth <= 0) return
    const next = Math.round(target.scrollLeft / slideWidth)
    if (next !== activeIndex && next >= 0 && next < safeImages.length) {
      setActiveIndex(next)
    }
  }

  function snapToIndex(index: number) {
    const node = stripRef.current
    if (!node) {
      setActiveIndex(index)
      return
    }
    const slideWidth = node.clientWidth
    node.scrollTo({ left: slideWidth * index, behavior: "smooth" })
    setActiveIndex(index)
  }

  if (!active) return null

  const isRealActive = active.kind === "real_photo"
  const isSealedActive = !isRealActive

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:gap-4">
      <div className="relative order-1 min-w-0 flex-1">
        <div
          ref={stripRef}
          onScroll={handleScroll}
          role="region"
          aria-label="Galeria de fotos do produto"
          className="relative flex w-full max-w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-[28px] border border-white/[0.08] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {safeImages.map((image, index) => {
            const sealed = image.kind === "official_asset"
            return (
              <div
                key={`${image.url}-${index}`}
                className={`relative aspect-square w-full max-w-full shrink-0 snap-center ${
                  sealed
                    ? "bg-gradient-to-b from-white/[0.97] to-white/[0.88]"
                    : "bg-gradient-to-b from-white/[0.05] to-transparent"
                }`}
              >
                <Image
                  src={image.url}
                  alt={`${productTitle}. ${image.alt}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  priority={index === 0}
                  unoptimized={image.kind === "real_photo"}
                  className="object-contain p-8 sm:p-12"
                />
              </div>
            )
          })}
        </div>
        <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-medium text-zinc-100 backdrop-blur">
          {isRealActive ? (
            <>
              <Camera className="h-3 w-3 text-emerald-200" weight="bold" />
              <span className="text-emerald-100">Foto real do aparelho</span>
            </>
          ) : (
            <>
              <ImageSquare className="h-3 w-3 text-[#F2D88A]" weight="duotone" />
              <span>Imagem ilustrativa</span>
            </>
          )}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-medium text-zinc-200 backdrop-blur">
          {activeIndex + 1}/{safeImages.length}
        </div>
        {isSealedActive ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl border border-white/15 bg-black/55 px-3 py-2 text-[11px] leading-snug text-zinc-100 backdrop-blur">
            Imagem ilustrativa do modelo lacrado.
          </div>
        ) : null}
        {safeImages.length > 1 ? (
          <div className="mt-3 flex justify-center gap-1.5">
            {safeImages.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => snapToIndex(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex ? "w-6 bg-[#F2D88A]" : "w-1.5 bg-white/30"
                }`}
                aria-label={`Ir para foto ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {safeImages.length > 1 ? (
        <div
          className="order-2 flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-h-[520px] sm:w-20 sm:shrink-0 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:p-0"
          role="tablist"
          aria-label="Miniaturas do produto"
        >
          {safeImages.map((image, index) => {
            const selected = index === activeIndex
            return (
              <button
                key={`${image.url}-${index}`}
                type="button"
                role="tab"
                onClick={() => snapToIndex(index)}
                className={`shrink-0 overflow-hidden rounded-2xl border transition ${
                  selected
                    ? "border-[#D6A84F]/45 ring-1 ring-[#D6A84F]/30"
                    : "border-white/[0.08] hover:border-white/[0.18]"
                }`}
                aria-label={`Ver foto ${index + 1} de ${safeImages.length}`}
                aria-selected={selected}
              >
                <div
                  className={`relative h-16 w-16 sm:h-16 sm:w-16 ${
                    image.kind === "real_photo" ? "bg-white/[0.04]" : "bg-white"
                  }`}
                >
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="80px"
                    unoptimized={image.kind === "real_photo"}
                    className="object-contain p-1.5"
                  />
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
