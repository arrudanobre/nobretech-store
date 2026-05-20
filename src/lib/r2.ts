import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

type R2Config = {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicUrl: string
}

let r2Client: S3Client | null = null
let r2Config: R2Config | null = null

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} não configurado`)
  return value
}

function unquote(value: string) {
  return value.replace(/^["']|["']$/g, "").trim()
}

function normalizeR2Endpoint(value: string, envName: string) {
  const rawValue = unquote(value).replace(/\/+$/, "")
  const maybeUrl = /^https?:\/\//i.test(rawValue)
    ? rawValue
    : rawValue.includes(".")
      ? `https://${rawValue}`
      : null

  if (maybeUrl) {
    try {
      const url = new URL(maybeUrl)
      if (!["https:", "http:"].includes(url.protocol) || !url.hostname) {
        throw new Error("invalid")
      }
      return `${url.protocol}//${url.hostname}`
    } catch {
      throw new Error(`${envName} inválido. Use o Account ID puro ou o endpoint R2 completo.`)
    }
  }

  if (!/^[a-z0-9-]{8,80}$/i.test(rawValue)) {
    throw new Error(`${envName} inválido. Use o Account ID puro ou o endpoint R2 completo.`)
  }

  return `https://${rawValue}.r2.cloudflarestorage.com`
}

function normalizePublicUrl(value: string) {
  const rawValue = unquote(value).replace(/\/+$/, "")
  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`

  try {
    const url = new URL(withProtocol)
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname) {
      throw new Error("invalid")
    }
    return url.toString().replace(/\/+$/, "")
  } catch {
    throw new Error("R2_PUBLIC_URL inválida. Use uma URL pública completa, por exemplo https://pub-...r2.dev")
  }
}

export function getR2Config(): R2Config {
  if (!r2Config) {
    const endpointSource = process.env.R2_ENDPOINT?.trim()
      ? { name: "R2_ENDPOINT", value: requiredEnv("R2_ENDPOINT") }
      : { name: "R2_ACCOUNT_ID", value: requiredEnv("R2_ACCOUNT_ID") }
    r2Config = {
      endpoint: normalizeR2Endpoint(endpointSource.value, endpointSource.name),
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
      bucketName: requiredEnv("R2_BUCKET_NAME"),
      publicUrl: normalizePublicUrl(requiredEnv("R2_PUBLIC_URL")),
    }
  }
  return r2Config
}

export function getR2Client() {
  if (!r2Client) {
    const config = getR2Config()
    r2Client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }
  return r2Client
}

export function getR2PublicUrl(key: string) {
  const config = getR2Config()
  const safePath = key.split("/").map(encodeURIComponent).join("/")
  return `${config.publicUrl}/${safePath}`
}

export async function putR2Object(input: {
  key: string
  body: Buffer
  contentType: string
  cacheControl?: string
}) {
  const config = getR2Config()
  await getR2Client().send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    CacheControl: input.cacheControl || "public, max-age=31536000, immutable",
  }))
}

export async function deleteR2Object(key?: string | null) {
  if (!key) return
  const config = getR2Config()
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  }))
}
