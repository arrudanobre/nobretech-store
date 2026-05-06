import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

type R2Config = {
  accountId: string
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

export function getR2Config(): R2Config {
  if (!r2Config) {
    r2Config = {
      accountId: requiredEnv("R2_ACCOUNT_ID"),
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
      bucketName: requiredEnv("R2_BUCKET_NAME"),
      publicUrl: requiredEnv("R2_PUBLIC_URL").replace(/\/+$/, ""),
    }
  }
  return r2Config
}

export function getR2Client() {
  if (!r2Client) {
    const config = getR2Config()
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
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
