import { NextRequest, NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { deleteR2Object, getR2PublicUrl, putR2Object } from "@/lib/r2"
import { PRODUCT_IMAGE_OUTPUT_MIME, processProductImage } from "@/lib/product-image-processing"

export const runtime = "nodejs"

// Slots permitidos do branding. apple_icon ficou fora do UI por decisão de produto;
// se voltar a ser editável basta incluir aqui.
const ALLOWED_SLOTS = new Set(["logo", "favicon", "og"])

function brandAssetKey(companyId: string, slot: string) {
  // Chave estável por (empresa, slot). Upload subsequente sobrescreve o objeto.
  // Sem necessidade de migration: a coluna logoUrl/faviconUrl/ogImageUrl segue
  // guardando só a URL pública.
  return `brand/${companyId}/${slot}.webp`
}

function errorResponse(status: number, message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status })
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const formData = await request.formData()
  const slot = String(formData.get("slot") || "")
  const file = formData.get("file")

  if (!ALLOWED_SLOTS.has(slot)) {
    return errorResponse(400, "Tipo de imagem inválido.")
  }
  if (!(file instanceof File)) {
    return errorResponse(400, "Envie uma imagem válida.")
  }

  try {
    const { companyId } = authResult.context
    const processed = await processProductImage(file)
    const key = brandAssetKey(companyId, slot)

    await putR2Object({
      key,
      body: processed.full.buffer,
      contentType: PRODUCT_IMAGE_OUTPUT_MIME,
    })

    // Acrescenta cache-buster para a UI atualizar após sobrescrever a mesma key.
    const url = `${getR2PublicUrl(key)}?v=${Date.now()}`
    return NextResponse.json({ data: { slot, url }, error: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar imagem."
    console.warn("[brand-asset] upload failed", { slot, message })
    return errorResponse(400, message)
  }
}

// DELETE limpa o objeto físico do R2 (chave estável conhecida). A UI deve, em
// paralelo, persistir o campo correspondente vazio chamando o save da marca.
export async function DELETE(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const body = await request.json().catch(() => ({}))
    const slot = String(body?.slot || "")
    if (!ALLOWED_SLOTS.has(slot)) return errorResponse(400, "Tipo de imagem inválido.")

    const { companyId } = authResult.context
    const key = brandAssetKey(companyId, slot)
    await deleteR2Object(key)
    return NextResponse.json({ data: { slot }, error: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao remover imagem."
    return errorResponse(400, message)
  }
}
