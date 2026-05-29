"use client"

import Image from "next/image"
import { useMemo, useRef, useState } from "react"
import { ImageIcon, Loader2, RotateCcw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toaster"
import { resolveStockDisplayImage, type ProductAssetInput } from "@/lib/product-assets"
import type { OperationalProductImageRecord } from "@/lib/product-images"

type ProductImageManagerProps = ProductAssetInput & {
  productId: string
  operationalImage?: OperationalProductImageRecord | null
  onOperationalImageChange?: (image: OperationalProductImageRecord | null) => void
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
  operationalImage,
  onOperationalImageChange,
  ...product
}: ProductImageManagerProps) {
  const operationalInputRef = useRef<HTMLInputElement | null>(null)
  const { toast } = useToast()
  const [currentOperationalImage, setCurrentOperationalImage] = useState<OperationalProductImageRecord | null>(operationalImage || null)
  const [uploadingOperational, setUploadingOperational] = useState(false)
  const [removingOperational, setRemovingOperational] = useState(false)

  const operationalImageInfo = useMemo(() => resolveStockDisplayImage({
    ...product,
    operationalImageUrl: currentOperationalImage?.image_url || null,
    operationalThumbnailUrl: currentOperationalImage?.thumbnail_url || null,
  }), [currentOperationalImage?.image_url, currentOperationalImage?.thumbnail_url, product])

  const setOperationalImage = (nextImage: OperationalProductImageRecord | null) => {
    setCurrentOperationalImage(nextImage)
    onOperationalImageChange?.(nextImage)
  }

  const handleOperationalUpload = async (file?: File) => {
    if (!file) return
    const validationError = validateClientFile(file)
    if (validationError) {
      toast({ title: "Imagem inválida", description: validationError, type: "error" })
      return
    }

    const formData = new FormData()
    formData.set("productId", productId)
    formData.set("file", file)

    setUploadingOperational(true)
    try {
      const response = await fetch("/api/product-operational-image", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || "Falha ao alterar imagem operacional")
      }
      setOperationalImage(result.data.image)
      toast({
        title: "Imagem operacional atualizada",
        description: "Isso altera estoque, venda, portal do cliente e documentos quando exibirem imagem.",
        type: "success",
      })
    } catch (error) {
      toast({
        title: "Erro no upload operacional",
        description: error instanceof Error ? error.message : "Não foi possível alterar a imagem operacional.",
        type: "error",
      })
    } finally {
      setUploadingOperational(false)
      if (operationalInputRef.current) operationalInputRef.current.value = ""
    }
  }

  const handleResetOperational = async () => {
    if (!currentOperationalImage) return
    setRemovingOperational(true)
    try {
      const response = await fetch("/api/product-operational-image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || "Falha ao restaurar asset padrão")
      }
      setOperationalImage(null)
      toast({ title: "Asset operacional restaurado", description: "A vitrine pública não foi alterada.", type: "success" })
    } catch (error) {
      toast({
        title: "Erro ao restaurar",
        description: error instanceof Error ? error.message : "Não foi possível voltar para o asset padrão.",
        type: "error",
      })
    } finally {
      setRemovingOperational(false)
    }
  }

  const isOperationalBusy = uploadingOperational || removingOperational

  return (
    <section>
      <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-royal-500/10 text-royal-600">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-navy-900">Imagem operacional</h3>
              <ImageBadge source={operationalImageInfo.source} label={operationalImageInfo.badge} />
            </div>
            <p className="mt-1 text-sm text-gray-500">Usada no estoque, venda, portal do cliente e documentos.</p>
          </div>
        </div>

        <ImagePreview image={operationalImageInfo} label="Origem operacional" />
        <p className="mt-3 rounded-2xl border border-royal-100 bg-royal-50/70 p-3 text-xs font-medium leading-5 text-royal-800">
          Isso altera o estoque, a venda, o portal do cliente e documentos quando exibirem imagem.
        </p>

        <input
          ref={operationalInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
          className="hidden"
          onChange={(event) => handleOperationalUpload(event.target.files?.[0])}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="primary" size="sm" disabled={isOperationalBusy} onClick={() => operationalInputRef.current?.click()}>
            {uploadingOperational ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Alterar imagem operacional
          </Button>
          {currentOperationalImage ? (
            <Button type="button" variant="outline" size="sm" disabled={isOperationalBusy} onClick={handleResetOperational}>
              {removingOperational ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Voltar para asset padrão
            </Button>
          ) : null}
        </div>
      </article>
    </section>
  )
}

function ImageBadge({ source, label }: { source: string; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
      source === "uploaded"
        ? "bg-emerald-50 text-emerald-700"
        : source === "static_asset"
          ? "bg-royal-50 text-royal-700"
          : "bg-gray-100 text-gray-600"
    }`}>
      {label}
    </span>
  )
}

function ImagePreview({ image, label }: { image: ReturnType<typeof resolveStockDisplayImage>; label: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[144px_minmax(0,1fr)] sm:items-center">
      <div className="relative h-36 w-36 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="144px"
          unoptimized={image.source === "uploaded"}
          className="object-contain p-3"
        />
      </div>
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="mt-1 text-sm font-semibold text-navy-900">
          {image.source === "uploaded"
            ? "Imagem manual enviada e otimizada"
            : image.source === "static_asset"
              ? "Asset padrão por modelo/cor"
              : image.source === "category_fallback"
                ? "Placeholder da categoria"
                : "Fallback visual neutro"}
        </p>
        <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP ou HEIC. Máximo 10MB.</p>
      </div>
    </div>
  )
}
