import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { deleteR2Object, getR2PublicUrl, putR2Object } from "@/lib/r2"
import { PRODUCT_IMAGE_OUTPUT_MIME, processProductImage } from "@/lib/product-image-processing"
import type { ProductImageRecord } from "@/lib/product-images"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseProductIds(value: string | null) {
  if (!value) return []
  return Array.from(new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => UUID_RE.test(item))
  ))
}

async function assertProductAccess(productId: string, companyId: string) {
  const result = await pool.query<{ id: string; company_id: string }>(
    "SELECT id, company_id FROM inventory WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [productId, companyId]
  )

  if (!result.rows[0]) {
    throw new Error("Produto não encontrado ou sem permissão")
  }

  return result.rows[0]
}

function imageRow(row: ProductImageRecord): ProductImageRecord {
  return {
    ...row,
    size_bytes: Number(row.size_bytes || 0),
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const productIds = parseProductIds(request.nextUrl.searchParams.get("productIds"))
  if (productIds.length === 0) {
    return NextResponse.json({ data: { imagesByProductId: {} }, error: null })
  }

  try {
    const result = await pool.query<ProductImageRecord>(
      `
        SELECT DISTINCT ON (product_id)
          id,
          product_id,
          image_url,
          thumbnail_url,
          storage_key,
          thumbnail_storage_key,
          mime_type,
          size_bytes,
          width,
          height,
          is_primary,
          source,
          created_at,
          updated_at
        FROM product_images
        WHERE company_id = $1::uuid
          AND product_id = ANY($2::uuid[])
          AND is_primary = true
        ORDER BY product_id, created_at DESC
      `,
      [authResult.context.companyId, productIds]
    )

    const imagesByProductId = result.rows.reduce<Record<string, ProductImageRecord>>((acc, row) => {
      acc[row.product_id] = imageRow(row)
      return acc
    }, {})

    return NextResponse.json({ data: { imagesByProductId }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao carregar imagens" } },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const formData = await request.formData()
  const productId = String(formData.get("productId") || "")
  const file = formData.get("file")

  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ data: null, error: { message: "Produto inválido" } }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: { message: "Envie uma imagem válida" } }, { status: 400 })
  }

  let uploadedKeys: string[] = []

  try {
    const { companyId } = authResult.context
    await assertProductAccess(productId, companyId)

    const processed = await processProductImage(file)
    const imageId = randomUUID()
    const baseKey = `products/${companyId}/${productId}`
    const originalKey = `${baseKey}/original/main-${imageId}.webp`
    const thumbKey = `${baseKey}/thumb/main-${imageId}.webp`

    await Promise.all([
      putR2Object({ key: originalKey, body: processed.full.buffer, contentType: PRODUCT_IMAGE_OUTPUT_MIME }),
      putR2Object({ key: thumbKey, body: processed.thumbnail.buffer, contentType: PRODUCT_IMAGE_OUTPUT_MIME }),
    ])
    uploadedKeys = [originalKey, thumbKey]

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        "UPDATE product_images SET is_primary = false WHERE company_id = $1::uuid AND product_id = $2::uuid AND is_primary = true",
        [companyId, productId]
      )
      const inserted = await client.query<ProductImageRecord>(
        `
          INSERT INTO product_images (
            id,
            company_id,
            product_id,
            image_url,
            thumbnail_url,
            storage_key,
            thumbnail_storage_key,
            mime_type,
            size_bytes,
            width,
            height,
            is_primary,
            source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'uploaded')
          RETURNING
            id,
            product_id,
            image_url,
            thumbnail_url,
            storage_key,
            thumbnail_storage_key,
            mime_type,
            size_bytes,
            width,
            height,
            is_primary,
            source,
            created_at,
            updated_at
        `,
        [
          imageId,
          companyId,
          productId,
          getR2PublicUrl(originalKey),
          getR2PublicUrl(thumbKey),
          originalKey,
          thumbKey,
          PRODUCT_IMAGE_OUTPUT_MIME,
          processed.originalSizeBytes,
          processed.full.width,
          processed.full.height,
        ]
      )
      await client.query("COMMIT")

      return NextResponse.json({ data: { image: imageRow(inserted.rows[0]) }, error: null })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => deleteR2Object(key)))
    console.warn("[product-images] Upload failed", {
      message: error instanceof Error ? error.message : "Erro ao enviar imagem",
      uploadedKeys: uploadedKeys.length,
    })
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao enviar imagem" } },
      { status: 400 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const body = await request.json().catch(() => ({}))
    const productId = String(body.productId || "")
    if (!UUID_RE.test(productId)) {
      return NextResponse.json({ data: null, error: { message: "Produto inválido" } }, { status: 400 })
    }

    const { companyId } = authResult.context
    await assertProductAccess(productId, companyId)

    const deleted = await pool.query<ProductImageRecord>(
      `
        DELETE FROM product_images
        WHERE id IN (
          SELECT id
          FROM product_images
          WHERE company_id = $1::uuid
            AND product_id = $2::uuid
            AND is_primary = true
            AND source = 'uploaded'
          ORDER BY created_at DESC
          LIMIT 1
        )
        RETURNING *
      `,
      [companyId, productId]
    )

    const image = deleted.rows[0]
    if (image) {
      await Promise.allSettled([
        deleteR2Object(image.storage_key),
        deleteR2Object(image.thumbnail_storage_key),
      ])
    }

    return NextResponse.json({ data: { removed: Boolean(image) }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao remover imagem" } },
      { status: 400 }
    )
  }
}
