"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Camera, CaretLeft, CaretRight, ImageSquare, MagnifyingGlassPlus, X } from "@phosphor-icons/react/dist/ssr"
import type { PublicCatalogImage } from "@/lib/catalog/types"

type Props = {
  images: PublicCatalogImage[]
  productTitle: string
}

function shouldBypassImageOptimization(image: PublicCatalogImage) {
  return image.kind === "real_photo" || /^https?:\/\//i.test(image.url)
}

export function ProductGallery({ images, productTitle }: Props) {
  const safeImages = images.length > 0 ? images : []
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 })
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

  function previousIndex(index = activeIndex) {
    return safeImages.length <= 1 ? index : (index - 1 + safeImages.length) % safeImages.length
  }

  function nextIndex(index = activeIndex) {
    return safeImages.length <= 1 ? index : (index + 1) % safeImages.length
  }

  function openLightbox(index = activeIndex) {
    setLightboxIndex(index)
    setZoomed(false)
    setZoomOrigin({ x: 50, y: 50 })
    setLightboxOpen(true)
  }

  function moveMain(direction: "previous" | "next") {
    snapToIndex(direction === "previous" ? previousIndex() : nextIndex())
  }

  function updateZoomOrigin(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    setZoomOrigin({
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    })
  }

  useEffect(() => {
    if (!lightboxOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightboxOpen(false)
        setZoomed(false)
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((current) => (
          safeImages.length <= 1 ? current : (current + 1) % safeImages.length
        ))
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((current) => (
          safeImages.length <= 1 ? current : (current - 1 + safeImages.length) % safeImages.length
        ))
      }
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [lightboxOpen, safeImages.length])

  if (!active) return null

  const isRealActive = active.kind === "real_photo"
  const isSealedActive = !isRealActive
  const lightboxImage = safeImages[lightboxIndex] || active
  const lightboxIsReal = lightboxImage.kind === "real_photo"

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:gap-4">
      <div className="relative order-1 min-w-0 flex-1">
        <div className="relative overflow-hidden rounded-[30px] border border-white/[0.09] bg-gradient-to-br from-white/[0.055] via-white/[0.025] to-black/30 shadow-[0_28px_90px_rgba(0,0,0,0.36)]">
          <div
            ref={stripRef}
            onScroll={handleScroll}
            role="region"
            aria-label="Galeria de fotos do produto"
            className="relative flex w-full max-w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {safeImages.map((image, index) => {
              const isReal = image.kind === "real_photo"
              return (
                <div
                  key={`${image.url}-${index}`}
                  className="relative aspect-square w-full max-w-full shrink-0 snap-center p-2.5 sm:p-3"
                >
                  <div
                    className={`relative h-full w-full overflow-hidden rounded-[24px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
                      isReal
                        ? "border-white/[0.08] bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.08),transparent_44%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015),rgba(0,0,0,0.18))]"
                        : "border-white/70 bg-[radial-gradient(circle_at_center,rgba(255,255,255,1),rgba(245,245,245,0.92)_62%,rgba(214,168,79,0.08))]"
                    }`}
                  >
                    <Image
                      src={image.url}
                      alt={`${productTitle}. ${image.alt}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      priority={index === 0}
                      unoptimized={shouldBypassImageOptimization(image)}
                      className="object-contain p-7 drop-shadow-[0_20px_42px_rgba(0,0,0,0.25)] sm:p-10"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {safeImages.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => moveMain("previous")}
                className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-[#F4D57A] shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-[#D6A84F]/45 hover:bg-black/70"
                aria-label="Foto anterior"
              >
                <CaretLeft className="h-4 w-4" weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => moveMain("next")}
                className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-[#F4D57A] shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-[#D6A84F]/45 hover:bg-black/70"
                aria-label="Próxima foto"
              >
                <CaretRight className="h-4 w-4" weight="bold" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => openLightbox(activeIndex)}
            className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] font-medium text-zinc-100 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-[#D6A84F]/45 hover:text-[#F4D57A]"
            aria-label="Ampliar foto"
          >
            <MagnifyingGlassPlus className="h-3.5 w-3.5" weight="bold" />
            Ampliar
          </button>
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
              <span>Imagem do modelo</span>
            </>
          )}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-medium text-zinc-200 backdrop-blur">
          {activeIndex + 1}/{safeImages.length}
        </div>
        {isSealedActive ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl border border-white/15 bg-black/55 px-3 py-2 text-[11px] leading-snug text-zinc-100 backdrop-blur">
            Imagem do modelo para referência visual.
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
          className="order-2 flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-h-[520px] sm:w-20 sm:shrink-0 sm:flex-col sm:justify-center sm:overflow-y-auto sm:overflow-x-hidden sm:p-0"
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
                className={`shrink-0 overflow-hidden rounded-2xl border bg-white/[0.025] transition ${
                  selected
                    ? "border-[#D6A84F]/55 ring-1 ring-[#D6A84F]/35"
                    : "border-white/[0.08] hover:border-white/[0.2]"
                }`}
                aria-label={`Ver foto ${index + 1} de ${safeImages.length}`}
                aria-selected={selected}
              >
                <div
                  className={`relative h-16 w-16 sm:h-[72px] sm:w-[72px] ${
                    image.kind === "real_photo" ? "bg-white/[0.04]" : "bg-white/[0.92]"
                  }`}
                >
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="80px"
                    unoptimized={shouldBypassImageOptimization(image)}
                    className="object-contain p-1.5"
                  />
                </div>
              </button>
            )
          })}
        </div>
      ) : null}

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#030405]/95 text-white backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada do produto"
        >
          <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-zinc-200">{productTitle}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {lightboxIsReal ? "Foto real do aparelho" : "Imagem do modelo"} · {lightboxIndex + 1}/{safeImages.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLightboxOpen(false)
                  setZoomed(false)
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-200 transition hover:bg-white/[0.1]"
                aria-label="Fechar zoom"
              >
                <X className="h-4 w-4" weight="bold" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_50%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(0,0,0,0.35))]">
              {safeImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxIndex((current) => previousIndex(current))
                      setZoomed(false)
                    }}
                    className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-[#F4D57A] backdrop-blur transition hover:bg-black/75"
                    aria-label="Foto anterior"
                  >
                    <CaretLeft className="h-5 w-5" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxIndex((current) => nextIndex(current))
                      setZoomed(false)
                    }}
                    className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-[#F4D57A] backdrop-blur transition hover:bg-black/75"
                    aria-label="Próxima foto"
                  >
                    <CaretRight className="h-5 w-5" weight="bold" />
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setZoomed((current) => !current)}
                onPointerMove={updateZoomOrigin}
                className={`relative h-full w-full overflow-hidden ${zoomed ? "cursor-zoom-out touch-none" : "cursor-zoom-in"}`}
                aria-label={zoomed ? "Reduzir foto" : "Ampliar foto"}
              >
                <Image
                  src={lightboxImage.url}
                  alt={`${productTitle}. ${lightboxImage.alt}`}
                  fill
                  sizes="100vw"
                  priority
                  unoptimized={shouldBypassImageOptimization(lightboxImage)}
                  className="object-contain p-4 transition-transform duration-200 ease-out sm:p-8"
                  style={{
                    transform: zoomed ? "scale(2.15)" : "scale(1)",
                    transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                  }}
                />
              </button>

              <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/12 bg-black/55 px-3 py-1.5 text-[11px] text-zinc-200 backdrop-blur">
                {zoomed ? "Mova o dedo ou mouse para conferir detalhes" : "Toque na imagem para ampliar"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
