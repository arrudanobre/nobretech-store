import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

type InventoryIdRow = {
  id: string
}

type InventoryRow = {
  id: string
  photos: string[] | null
}

function loadEnvFile(fileName: string) {
  const envPath = path.resolve(process.cwd(), fileName)
  if (!existsSync(envPath)) return

  const raw = readFileSync(envPath, "utf8")
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex <= 0) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function isBase64Photo(value: string): boolean {
  if (!value || typeof value !== "string") return false
  if (/^https?:\/\//i.test(value)) return false
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value)) return true

  // fallback for raw base64 strings without data-url prefix
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 200
}

function decodePhoto(value: string): { buffer: Buffer; mimeType: string; extension: string } {
  const dataUrlMatch = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s)

  let mimeType = "image/jpeg"
  let base64Payload = value

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase()
    base64Payload = dataUrlMatch[2]
  }

  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
  }

  const extension = extensionByMime[mimeType] ?? "jpg"
  const buffer = Buffer.from(base64Payload, "base64")

  if (!buffer.length) {
    throw new Error("Base64 inválido ou vazio")
  }

  return { buffer, mimeType, extension }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run")

  loadEnvFile(".env.local")
  loadEnvFile(".env")

  const { supabase } = await import("../src/lib/supabase")

  const { data: idsData, error: idsError } = await (supabase.from("inventory") as any)
    .select("id")
    .order("created_at", { ascending: true })

  if (idsError) {
    throw new Error(`Erro ao buscar IDs de inventory: ${idsError.message}`)
  }

  const ids = (idsData as InventoryIdRow[]) ?? []
  console.log(`Total de itens para varredura: ${ids.length}`)

  let migratedItems = 0
  let migratedPhotos = 0

  for (let i = 0; i < ids.length; i++) {
    const itemId = ids[i].id

    const { data: rowData, error: rowError } = await (supabase.from("inventory") as any)
      .select("id, photos")
      .eq("id", itemId)
      .single()

    if (rowError) {
      console.error(`Falha ao buscar item ${itemId}: ${rowError.message}`)
      continue
    }

    const row = rowData as InventoryRow
    const originalPhotos = row.photos || []

    if (!Array.isArray(originalPhotos) || !originalPhotos.some((p) => typeof p === "string" && isBase64Photo(p))) {
      continue
    }

    const nextPhotos = [...originalPhotos]

    let uploadedForItem = 0

    console.log(`Item ${i + 1}/${ids.length}: processando ${itemId}`)

    for (let j = 0; j < originalPhotos.length; j++) {
      const photo = originalPhotos[j]
      if (!isBase64Photo(photo)) continue

      console.log(`Item ${i + 1}/${ids.length}: uploading photo ${j + 1}...`)

      try {
        const { buffer, mimeType, extension } = decodePhoto(photo)
        const filePath = `${row.id}/${Date.now()}-${j + 1}-${randomUUID()}.${extension}`

        const { error: uploadError } = await supabase.storage
          .from("inventory")
          .upload(filePath, buffer, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false,
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        const { data: publicData } = supabase.storage.from("inventory").getPublicUrl(filePath)
        if (!publicData?.publicUrl) {
          throw new Error("Não foi possível gerar URL pública")
        }

        nextPhotos[j] = publicData.publicUrl
        uploadedForItem++
      } catch (err: any) {
        console.error(`Falha no item ${row.id}, foto ${j + 1}: ${err?.message || err}`)
      }
    }

    if (uploadedForItem === 0) {
      continue
    }

    if (isDryRun) {
      console.log(`[DRY-RUN] Não atualizando banco para item ${row.id}`)
      migratedItems++
      migratedPhotos += uploadedForItem
      continue
    }

    const { error: updateError } = await (supabase.from("inventory") as any)
      .update({ photos: nextPhotos })
      .eq("id", row.id)

    if (updateError) {
      console.error(`Falha ao salvar URLs no item ${row.id}: ${updateError.message}`)
      continue
    }

    migratedItems++
    migratedPhotos += uploadedForItem
  }

  console.log("Migração concluída.")
  console.log(`Itens migrados: ${migratedItems}`)
  console.log(`Fotos migradas: ${migratedPhotos}`)
}

main().catch((err) => {
  console.error("Erro na migração:", err)
  process.exit(1)
})
