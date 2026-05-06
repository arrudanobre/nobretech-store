export type ProductImageRecord = {
  id: string
  product_id: string
  image_url: string
  thumbnail_url: string
  storage_key: string
  thumbnail_storage_key?: string | null
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  is_primary: boolean
  source: "uploaded" | "static_asset"
  created_at: string
  updated_at: string
}

export type ProductImageMap = Record<string, ProductImageRecord | null>

export async function fetchProductImageMap(productIds: string[]): Promise<ProductImageMap> {
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (ids.length === 0) return {}

  const params = new URLSearchParams()
  params.set("productIds", ids.join(","))

  const response = await fetch(`/api/product-images?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
  const result = await response.json()

  if (!response.ok || result.error) {
    throw new Error(result.error?.message || "Erro ao carregar imagens dos produtos")
  }

  return result.data?.imagesByProductId || {}
}
