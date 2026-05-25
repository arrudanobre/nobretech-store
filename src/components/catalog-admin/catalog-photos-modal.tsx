"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ArrowDown, ArrowUp, Camera, ImageSquare, Star, Trash, UploadSimple } from "@phosphor-icons/react/dist/ssr"
import type { CatalogAdminItem, CatalogImageRecord } from "@/lib/catalog/admin-types"

type Props = {
  item: CatalogAdminItem
  onClose: () => void
  onSaved: () => void
}

export function CatalogPhotosModal({ item, onClose, onSaved }: Props) {
  const [images, setImages] = useState<CatalogImageRecord[]>(item.images)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setImages(item.images)
  }, [item.inventoryId, item.images])

  async function refreshImages() {
    const response = await fetch("/api/catalog/publications", { cache: "no-store" })
    const result = (await response.json()) as {
      data?: { items: CatalogAdminItem[] }
    }
    if (response.ok && result.data) {
      const next = result.data.items.find((entry) => entry.inventoryId === item.inventoryId)
      if (next) setImages(next.images)
    }
    onSaved()
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setErrorMessage(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append("productId", item.inventoryId)
        form.append("file", file)
        const response = await fetch("/api/catalog/images", {
          method: "POST",
          body: form,
        })
        const result = (await response.json()) as { error?: { message: string } | null }
        if (!response.ok) {
          throw new Error(result.error?.message || "Erro ao enviar imagem")
        }
      }
      await refreshImages()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao enviar imagem")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function removeImage(imageId: string) {
    setBusy(true)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/catalog/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      })
      const result = (await response.json()) as { error?: { message: string } | null }
      if (!response.ok) throw new Error(result.error?.message || "Erro ao remover")
      await refreshImages()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao remover")
    } finally {
      setBusy(false)
    }
  }

  async function commitOrder(nextOrder: CatalogImageRecord[], coverId?: string) {
    setBusy(true)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/catalog/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: item.inventoryId,
          order: nextOrder.map((image) => image.id),
          coverImageId: coverId,
        }),
      })
      const result = (await response.json()) as { error?: { message: string } | null }
      if (!response.ok) throw new Error(result.error?.message || "Erro ao reordenar")
      await refreshImages()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao reordenar")
    } finally {
      setBusy(false)
    }
  }

  function moveImage(index: number, delta: number) {
    const next = [...images]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setImages(next)
    commitOrder(next)
  }

  function setCover(image: CatalogImageRecord) {
    commitOrder(images, image.id)
  }

  return (
    <ModalShell title="Galeria de fotos" onClose={onClose}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-slate-300">
        <p className="font-medium text-white">Organize a foto de capa, fotos reais e imagens ilustrativas.</p>
        <p className="mt-1">A capa aparece primeiro no catálogo. Seminovos precisam de pelo menos uma foto real.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image, index) => {
          const isReal = image.source === "uploaded"
          return (
            <div
              key={image.id}
              className={`group relative overflow-hidden rounded-2xl border ${
                image.is_primary
                  ? "border-[#D6A84F]/45 ring-1 ring-[#D6A84F]/30"
                  : "border-white/[0.08]"
              } bg-[#0F172A]/80 shadow-[0_14px_40px_rgba(0,0,0,0.22)]`}
            >
              <div className="relative aspect-square w-full">
                <Image
                  src={image.thumbnail_url || image.image_url}
                  alt={image.alt || "Foto"}
                  fill
                  sizes="160px"
                  unoptimized={isReal}
                  className="object-contain p-2"
                />
              </div>
              <div className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9.5px] font-medium text-zinc-100 backdrop-blur">
                {isReal ? (
                  <>
                    <Camera className="h-2.5 w-2.5 text-emerald-200" weight="bold" />
                    <span className="text-emerald-100">Foto real</span>
                  </>
                ) : (
                  <>
                    <ImageSquare className="h-2.5 w-2.5 text-[#F2D88A]" weight="duotone" />
                    <span>Ilustrativa</span>
                  </>
                )}
              </div>
              {image.is_primary ? (
                <span className="absolute right-1 top-1 rounded-full bg-[#D6A84F]/20 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-[#F2D88A] ring-1 ring-[#D6A84F]/35">
                  Capa
                </span>
              ) : null}
              <div className="flex items-center justify-between gap-1 border-t border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveImage(index, -1)}
                    disabled={index === 0 || busy}
                    className="rounded-md p-1 text-zinc-300 transition hover:text-white disabled:opacity-40"
                    aria-label="Mover para cima"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(index, 1)}
                    disabled={index === images.length - 1 || busy}
                    className="rounded-md p-1 text-zinc-300 transition hover:text-white disabled:opacity-40"
                    aria-label="Mover para baixo"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCover(image)}
                    disabled={image.is_primary || busy}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-200 transition hover:text-[#F2D88A] disabled:opacity-40"
                  >
                    <Star className="h-3 w-3" />
                    Marcar capa
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    disabled={busy}
                    className="rounded-md p-1 text-zinc-300 transition hover:text-rose-300 disabled:opacity-40"
                    aria-label="Remover"
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {images.length === 0 ? (
          <div className="col-span-full flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm text-zinc-400">
            <ImageSquare className="h-4 w-4" weight="duotone" />
            Nenhuma foto enviada ainda. Envie uma foto real para seminovos ou confirme o asset oficial nos lacrados.
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.035] p-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-5 text-sm font-semibold text-[#1a1206] transition hover:scale-[1.02] disabled:opacity-50 sm:w-auto"
        >
          <UploadSimple className="h-4 w-4" weight="bold" />
          {busy ? "Enviando..." : "Enviar fotos"}
        </button>
        {item.productKind !== "sealed" && !item.hasRealPhotos ? (
          <p className="mt-2 text-[11px] text-amber-200 sm:mt-3">
            Seminovos precisam de pelo menos uma foto real.
          </p>
        ) : null}
      </div>

      {errorMessage ? <p className="mt-3 text-sm text-rose-300">{errorMessage}</p> : null}
    </ModalShell>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0B1220] p-5 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.65)] sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F2D88A]">Fotos do produto</p>
            <h2 className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/[0.1]"
          >
            Fechar
          </button>
        </header>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
