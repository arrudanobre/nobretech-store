import sharp from "sharp"

export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const PRODUCT_IMAGE_OUTPUT_MIME = "image/webp"

const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"])
const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
])

export type ProcessedProductImage = {
  full: {
    buffer: Buffer
    width: number
    height: number
  }
  thumbnail: {
    buffer: Buffer
    width: number
    height: number
  }
  originalMimeType: string
  originalSizeBytes: number
}

function extensionFromName(fileName: string) {
  const clean = fileName.split(/[\\/]/).pop() || ""
  return clean.includes(".") ? clean.split(".").pop()?.toLowerCase() || "" : ""
}

function detectMimeType(buffer: Buffer) {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg"
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp"
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 16).toString("ascii")
    if (/hei[cfxs]|mif1|msf1/i.test(brand)) return "image/heic"
  }
  return null
}

export function validateProductImageFile(file: File) {
  if (!file || file.size <= 0) throw new Error("Arquivo inválido")
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) throw new Error("Imagem acima do limite de 10MB")

  const extension = extensionFromName(file.name)
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    throw new Error("Formato não permitido. Use JPG, PNG, WebP ou HEIC.")
  }

  const declaredType = file.type.toLowerCase()
  if (declaredType && !ACCEPTED_MIME_TYPES.has(declaredType)) {
    throw new Error("Tipo de arquivo não permitido. Use JPG, PNG, WebP ou HEIC.")
  }
}

export async function processProductImage(file: File): Promise<ProcessedProductImage> {
  validateProductImageFile(file)

  const originalBuffer = Buffer.from(await file.arrayBuffer())
  const detectedMimeType = detectMimeType(originalBuffer)
  if (!detectedMimeType || !ACCEPTED_MIME_TYPES.has(detectedMimeType)) {
    throw new Error("O conteúdo do arquivo não é uma imagem JPG, PNG, WebP ou HEIC válida")
  }

  const source = sharp(originalBuffer, { failOn: "error" }).rotate()
  const metadata = await source.metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error("Não foi possível ler as dimensões da imagem")
  }

  const full = await sharp(originalBuffer, { failOn: "error" })
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })

  const thumbnail = await sharp(originalBuffer, { failOn: "error" })
    .rotate()
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true })

  return {
    full: {
      buffer: full.data,
      width: full.info.width,
      height: full.info.height,
    },
    thumbnail: {
      buffer: thumbnail.data,
      width: thumbnail.info.width,
      height: thumbnail.info.height,
    },
    originalMimeType: detectedMimeType,
    originalSizeBytes: file.size,
  }
}
