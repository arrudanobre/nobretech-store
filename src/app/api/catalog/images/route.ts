import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { deleteR2Object, getR2PublicUrl, putR2Object } from "@/lib/r2"
import { PRODUCT_IMAGE_OUTPUT_MIME, processProductImage } from "@/lib/product-image-processing"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function assertInventoryAccess(inventoryId: string, companyId: string) {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM inventory WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [inventoryId, companyId],
  )
  if (!result.rows[0]) throw new Error("Produto não encontrado ou sem permissão")
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  const { companyId } = authResult.context

  let uploadedKeys: string[] = []
  try {
    const formData = await request.formData()
    const productId = String(formData.get("productId") || "")
    const file = formData.get("file")
    const alt = (formData.get("alt") as string | null) || null

    if (!UUID_RE.test(productId)) {
      return NextResponse.json({ data: null, error: { message: "Produto inválido" } }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ data: null, error: { message: "Envie uma imagem válida" } }, { status: 400 })
    }

    await assertInventoryAccess(productId, companyId)

    const processed = await processProductImage(file)
    const imageId = randomUUID()
    const baseKey = `products/${companyId}/${productId}`
    const originalKey = `${baseKey}/original/${imageId}.webp`
    const thumbKey = `${baseKey}/thumb/${imageId}.webp`

    await Promise.all([
      putR2Object({ key: originalKey, body: processed.full.buffer, contentType: PRODUCT_IMAGE_OUTPUT_MIME }),
      putR2Object({ key: thumbKey, body: processed.thumbnail.buffer, contentType: PRODUCT_IMAGE_OUTPUT_MIME }),
    ])
    uploadedKeys = [originalKey, thumbKey]

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const existing = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM product_images WHERE company_id = $1::uuid AND product_id = $2::uuid",
        [companyId, productId],
      )
      const count = Number(existing.rows[0]?.count || 0)
      const isFirst = count === 0
      if (isFirst) {
        await client.query(
          "UPDATE product_images SET is_primary = FALSE WHERE company_id = $1::uuid AND product_id = $2::uuid",
          [companyId, productId],
        )
      }
      const maxOrder = await client.query<{ max_order: number | null }>(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM product_images WHERE company_id = $1::uuid AND product_id = $2::uuid",
        [companyId, productId],
      )
      const nextOrder = (Number(maxOrder.rows[0]?.max_order ?? -1) + 1) | 0
      await client.query(
        `INSERT INTO product_images (
          id, company_id, product_id, image_url, thumbnail_url,
          storage_key, thumbnail_storage_key, mime_type, size_bytes,
          width, height, is_primary, source, sort_order, alt
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, 'uploaded', $13, $14
        )`,
        [
          imageId,
          companyId,
          productId,
          getR2PublicUrl(originalKey),
          getR2PublicUrl(thumbKey),
          originalKey,
          thumbKey,
          PRODUCT_IMAGE_OUTPUT_MIME,
          processed.full.buffer.length,
          processed.full.width,
          processed.full.height,
          isFirst,
          nextOrder,
          alt,
        ],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    return NextResponse.json({ data: { id: imageId }, error: null })
  } catch (error) {
    if (uploadedKeys.length > 0) {
      await Promise.allSettled(uploadedKeys.map((key) => deleteR2Object(key)))
    }
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao enviar imagem" } },
      { status: 400 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  const { companyId } = authResult.context

  const body = (await request.json().catch(() => ({}))) as { imageId?: string }
  const imageId = String(body.imageId || "")
  if (!UUID_RE.test(imageId)) {
    return NextResponse.json({ data: null, error: { message: "Imagem inválida" } }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const deleted = await client.query<{
      id: string
      product_id: string
      storage_key: string
      thumbnail_storage_key: string | null
      is_primary: boolean
    }>(
      `DELETE FROM product_images
       WHERE id = $1::uuid AND company_id = $2::uuid
       RETURNING id, product_id, storage_key, thumbnail_storage_key, is_primary`,
      [imageId, companyId],
    )
    const image = deleted.rows[0]
    if (!image) {
      await client.query("ROLLBACK")
      return NextResponse.json({ data: null, error: { message: "Imagem não encontrada" } }, { status: 404 })
    }
    if (image.is_primary) {
      await client.query(
        `UPDATE product_images
         SET is_primary = TRUE
         WHERE id = (
           SELECT id FROM product_images
           WHERE company_id = $1::uuid AND product_id = $2::uuid
           ORDER BY sort_order, created_at
           LIMIT 1
         )`,
        [companyId, image.product_id],
      )
    }
    await client.query("COMMIT")
    await Promise.allSettled([
      deleteR2Object(image.storage_key),
      image.thumbnail_storage_key ? deleteR2Object(image.thumbnail_storage_key) : Promise.resolve(),
    ])
    return NextResponse.json({ data: { removed: true }, error: null })
  } catch (error) {
    await client.query("ROLLBACK")
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao remover imagem" } },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  const { companyId } = authResult.context

  const body = (await request.json().catch(() => ({}))) as {
    inventoryItemId?: string
    coverImageId?: string | null
    order?: string[]
  }
  const inventoryItemId = String(body.inventoryItemId || "")
  if (!UUID_RE.test(inventoryItemId)) {
    return NextResponse.json(
      { data: null, error: { message: "Item de estoque inválido" } },
      { status: 400 },
    )
  }

  await assertInventoryAccess(inventoryItemId, companyId)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    if (Array.isArray(body.order)) {
      for (let index = 0; index < body.order.length; index += 1) {
        const imageId = body.order[index]
        if (!UUID_RE.test(imageId)) continue
        await client.query(
          `UPDATE product_images
           SET sort_order = $1
           WHERE id = $2::uuid AND product_id = $3::uuid AND company_id = $4::uuid`,
          [index, imageId, inventoryItemId, companyId],
        )
      }
    }

    if (body.coverImageId !== undefined) {
      await client.query(
        `UPDATE product_images SET is_primary = FALSE
         WHERE company_id = $1::uuid AND product_id = $2::uuid`,
        [companyId, inventoryItemId],
      )
      if (body.coverImageId && UUID_RE.test(body.coverImageId)) {
        await client.query(
          `UPDATE product_images SET is_primary = TRUE
           WHERE id = $1::uuid AND product_id = $2::uuid AND company_id = $3::uuid`,
          [body.coverImageId, inventoryItemId, companyId],
        )
      }
    }

    await client.query("COMMIT")
    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (error) {
    await client.query("ROLLBACK")
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao atualizar imagens" } },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}
