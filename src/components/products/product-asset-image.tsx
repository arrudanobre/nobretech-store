import Image from "next/image"
import { Smartphone } from "lucide-react"
import { getProductAssetImageInfo, type ProductAssetInput } from "@/lib/product-assets"

type ProductAssetImageProps = ProductAssetInput & {
  size: number
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function ProductAssetImage({
  size,
  className = "",
  imageClassName = "",
  priority = false,
  ...product
}: ProductAssetImageProps) {
  const image = getProductAssetImageInfo(product)

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={image.src}
        alt={image.alt}
        width={size}
        height={size}
        priority={priority}
        unoptimized={image.source === "uploaded"}
        className={`h-full w-full object-contain p-1.5 ${imageClassName}`}
      />
      {image.isFallback && (
        <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/85 text-gray-400 shadow-sm">
          <Smartphone className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  )
}
