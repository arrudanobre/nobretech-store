import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { deleteR2Object, getR2PublicUrl, putR2Object } from "@/lib/r2"
import { PRODUCT_IMAGE_OUTPUT_MIME, processProductImage } from "@/lib/product-image-processing"
import type { OperationalProductImageRecord } from "@/lib/product-images"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type InventoryOperationalImageRow = {
  id: string
  operational_image_url: string | null
  operational_thumbnail_url: string | null
  operational_image_storage_key: string | null
  operational_thumbnail_storage_key: string | null
  updated_at: string | null
}

function toOperationalImage(row: InventoryOperationalImageRow): OperationalProductImageRecord | null {
  if (!row.operational_image_url || !row.operational_thumbnail_url || !row.operational_image_storage_key) {
    return null
  }

  return {
    product_id: row.id,
    image_url: row.operational_image_url,
    thumbnail_url: row.operational_thumbnail_url,
    storage_key: row.operational_image_storage_key,
    thumbnail_storage_key: row.operational_thumbnail_storage_key,
    updated_at: row.updated_at,
  }
}

async function getInventoryOperationalImage(productId: string, companyId: string) {
  const result = await pool.query<InventoryOperationalImageRow>(
    `
      SELECT
        id,
        operational_image_url,
        operational_thumbnail_url,
        operational_image_storage_key,
        operational_thumbnail_storage_key,
        updated_at
      FROM inventory
      WHERE id = $1::uuid
        AND company_id = $2::uuid
      LIMIT 1
    `,
    [productId, companyId]
  )

  const row = result.rows[0]
  if (!row) throw new Error("Produto não encontrado ou sem permissão")
  return row
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
    return NextResponse.json({ data: null, error: { message: "Envie uma imagem operacional válida" } }, { status: 400 })
  }

  let uploadedKeys: string[] = []
  let oldKeys: string[] = []

  try {
    const { companyId } = authResult.context
    const current = await getInventoryOperationalImage(productId, companyId)
    oldKeys = [
      current.operational_image_storage_key,
      current.operational_thumbnail_storage_key,
    ].filter((key): key is string => Boolean(key))

    const processed = await processProductImage(file)
    const imageId = randomUUID()
    const baseKey = `products/${companyId}/${productId}/operational`
    const originalKey = `${baseKey}/original-${imageId}.webp`
    const thumbKey = `${baseKey}/thumb-${imageId}.webp`

    await Promise.all([
      putR2Object({ key: originalKey, body: processed.full.buffer, contentType: PRODUCT_IMAGE_OUTPUT_MIME }),
      putR2Object({ key: thumbKey, body: processed.thumbnail.buffer, contentType: PRODUCT_IMAGE_OUTPUT_MIME }),
    ])
    uploadedKeys = [originalKey, thumbKey]

    const updated = await pool.query<InventoryOperationalImageRow>(
      `
        UPDATE inventory
        SET
          operational_image_url = $3,
          operational_thumbnail_url = $4,
          operational_image_storage_key = $5,
          operational_thumbnail_storage_key = $6,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND company_id = $2::uuid
        RETURNING
          id,
          operational_image_url,
          operational_thumbnail_url,
          operational_image_storage_key,
          operational_thumbnail_storage_key,
          updated_at
      `,
      [
        productId,
        companyId,
        getR2PublicUrl(originalKey),
        getR2PublicUrl(thumbKey),
        originalKey,
        thumbKey,
      ]
    )

    await Promise.allSettled(oldKeys.map((key) => deleteR2Object(key)))

    return NextResponse.json({ data: { image: toOperationalImage(updated.rows[0]) }, error: null })
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => deleteR2Object(key)))
    console.warn("[product-operational-image] Upload failed", {
      message: error instanceof Error ? error.message : "Erro ao enviar imagem operacional",
      uploadedKeys: uploadedKeys.length,
    })
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao enviar imagem operacional" } },
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
    const current = await getInventoryOperationalImage(productId, companyId)
    const oldKeys = [
      current.operational_image_storage_key,
      current.operational_thumbnail_storage_key,
    ].filter((key): key is string => Boolean(key))

    const updated = await pool.query<InventoryOperationalImageRow>(
      `
        UPDATE inventory
        SET
          operational_image_url = NULL,
          operational_thumbnail_url = NULL,
          operational_image_storage_key = NULL,
          operational_thumbnail_storage_key = NULL,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND company_id = $2::uuid
        RETURNING
          id,
          operational_image_url,
          operational_thumbnail_url,
          operational_image_storage_key,
          operational_thumbnail_storage_key,
          updated_at
      `,
      [productId, companyId]
    )

    await Promise.allSettled(oldKeys.map((key) => deleteR2Object(key)))

    return NextResponse.json({ data: { image: toOperationalImage(updated.rows[0]) }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao restaurar asset operacional" } },
      { status: 400 }
    )
  }
}
