"use client"

import { useMemo, useRef, useState } from "react"
import { ImageIcon, Loader2, RotateCcw, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toaster"
import { getProductAssetImageInfo, type ProductAssetInput } from "@/lib/product-assets"
import type { ProductImageRecord } from "@/lib/product-images"
import { ProductAssetImage } from "@/components/products/product-asset-image"

type ProductImageManagerProps = ProductAssetInput & {
  productId: string
  image?: ProductImageRecord | null
  onImageChange?: (image: ProductImageRecord | null) => void
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
const MAX_BYTES = 10 * 1024 * 1024

function validateClientFile(file: File) {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
  if ((file.type && !ACCEPTED_TYPES.includes(file.type)) || !ACCEPTED_EXTENSIONS.includes(extension)) {
    return "Use uma imagem JPG, PNG, WebP ou HEIC."
  }
  if (file.size > MAX_BYTES) return "A imagem precisa ter no máximo 10MB."
  return null
}

export function ProductImageManager({
  productId,
  image,
  onImageChange,
  ...product
}: ProductImageManagerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { toast } = useToast()
  const [currentImage, setCurrentImage] = useState<ProductImageRecord | null>(image || null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)

  const imageInfo = useMemo(() => getProductAssetImageInfo({
    ...product,
    uploadedImageUrl: currentImage?.image_url || null,
    uploadedThumbnailUrl: currentImage?.thumbnail_url || null,
  }), [currentImage?.image_url, currentImage?.thumbnail_url, product])

  const setImage = (nextImage: ProductImageRecord | null) => {
    setCurrentImage(nextImage)
    onImageChange?.(nextImage)
  }

  const handleUpload = async (file?: File) => {
    if (!file) return
    const validationError = validateClientFile(file)
    if (validationError) {
      toast({ title: "Imagem inválida", description: validationError, type: "error" })
      return
    }

    const formData = new FormData()
    formData.set("productId", productId)
    formData.set("file", file)

    setUploading(true)
    try {
      const response = await fetch("/api/product-images", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || "Falha ao enviar imagem")
      }
      setImage(result.data.image)
      toast({ title: "Imagem atualizada", description: "A foto foi otimizada e salva no R2.", type: "success" })
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Não foi possível enviar a imagem.",
        type: "error",
      })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handleRemove = async () => {
    if (!currentImage) return
    setRemoving(true)
    try {
      const response = await fetch("/api/product-images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || "Falha ao remover imagem")
      }
      setImage(null)
      toast({ title: "Asset padrão restaurado", type: "success" })
    } catch (error) {
      toast({
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Não foi possível remover a imagem.",
        type: "error",
      })
    } finally {
      setRemoving(false)
    }
  }

  const isBusy = uploading || removing

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-royal-500/10 text-royal-600">
          <ImageIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-navy-900">Imagem do Produto</h3>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
              imageInfo.source === "uploaded"
                ? "bg-emerald-50 text-emerald-700"
                : imageInfo.source === "static_asset"
                  ? "bg-royal-50 text-royal-700"
                  : "bg-gray-100 text-gray-600"
            }`}>
              {imageInfo.badge}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Foto real em R2, asset padrão ou placeholder seguro.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
        <div className="flex justify-center rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <ProductAssetImage
            {...product}
            uploadedImageUrl={currentImage?.image_url || null}
            uploadedThumbnailUrl={currentImage?.thumbnail_url || null}
            size={128}
            className="rounded-2xl bg-white"
            imageClassName="p-3"
          />
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Origem atual</p>
            <p className="mt-1 text-sm font-semibold text-navy-900">
              {imageInfo.source === "uploaded"
                ? "Foto real enviada e otimizada"
                : imageInfo.source === "static_asset"
                  ? "Asset estático por modelo/cor"
                  : "Fallback visual da categoria"}
            </p>
            <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP ou HEIC. Máximo 10MB.</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            className="hidden"
            onChange={(event) => handleUpload(event.target.files?.[0])}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar foto
            </Button>
            {currentImage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={handleRemove}
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Voltar ao asset
              </Button>
            ) : null}
            {currentImage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={handleRemove}
                className="text-danger-500 hover:bg-danger-100 hover:text-danger-500"
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
