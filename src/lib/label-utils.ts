export const LABEL_WIDTH_MM = 50
export const LABEL_HEIGHT_MM = 30
export const LABEL_WIDTH_PX = 600
export const LABEL_HEIGHT_PX = 360
export const LABEL_INSTAGRAM = "@nobretechstore"
export const DEFAULT_PUBLIC_APP_URL = "https://nobretechstore.vercel.app"

export type InventoryStockLabelData = {
  stockCode: string
  model: string
  storage?: string | null
  color?: string | null
  grade?: string | null
  batteryHealth?: string | number | null
  imei?: string | null
  serial?: string | null
  packaging?: string | null
}

export type VerifiedPurchaseCustomerLabelData = {
  publicUrl: string
  customerFirstName: string
  purchaseCode: string
  pin: string
  warrantyEnd?: string | null
}

export function sanitizeLabelText(value?: string | number | null): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function truncateLabelText(value: string, maxLength: number): string {
  const text = sanitizeLabelText(value)
  if (text.length <= maxLength) return text
  if (maxLength <= 1) return text.slice(0, maxLength)
  const words = text.split(" ")
  let output = ""
  for (const word of words) {
    const next = output ? `${output} ${word}` : word
    if (next.length > maxLength) break
    output = next
  }
  return output || text.slice(0, maxLength).trimEnd()
}

export function maskImeiOrSerial(value?: string | null): string {
  const text = sanitizeLabelText(value)
  if (!text) return ""
  const compact = text.replace(/\s+/g, "")
  const suffix = compact.slice(-4)
  return suffix ? `***${suffix}` : ""
}

export function getFirstName(value?: string | null): string {
  return truncateLabelText(sanitizeLabelText(value).split(" ")[0] || "Cliente", 18)
}

export function formatShortDate(value?: string | null): string {
  if (!value) return ""
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date)
}

export function buildInventoryStockCode(id?: string | null): string {
  const clean = sanitizeLabelText(id)
  return clean ? `NT-${clean.slice(0, 8).toUpperCase()}` : ""
}

export function buildPurchaseCode(id?: string | null): string {
  const clean = sanitizeLabelText(id)
  return clean ? `NT-${clean.slice(0, 6).toUpperCase()}` : ""
}

export function normalizePin(value?: string | number | null): string {
  const digits = String(value ?? "").replace(/\D/g, "")
  return digits ? digits.slice(0, 6).padStart(6, "0") : "------"
}

export function buildPublicPurchaseUrl(token?: string | null): string {
  const cleanToken = sanitizeLabelText(token)
  if (!cleanToken) return ""

  const configured = sanitizeLabelText(process.env.NEXT_PUBLIC_APP_URL)
    || sanitizeLabelText(process.env.NEXT_PUBLIC_PUBLIC_APP_URL)

  if (configured) {
    return `${configured.replace(/\/+$/, "")}/compra-verificada/${encodeURIComponent(cleanToken)}`
  }

  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    const baseUrl = isLocalhost ? DEFAULT_PUBLIC_APP_URL : origin
    return `${baseUrl.replace(/\/+$/, "")}/compra-verificada/${encodeURIComponent(cleanToken)}`
  }

  return `${DEFAULT_PUBLIC_APP_URL}/compra-verificada/${encodeURIComponent(cleanToken)}`
}

export function abbreviateLabelText(value?: string | null): string {
  const text = sanitizeLabelText(value)
  if (!text) return ""

  return text
    .replace(/\bTitânio Branco\b/gi, "Titânio Br.")
    .replace(/\bTitanio Branco\b/gi, "Titânio Br.")
    .replace(/\bBranco Titânio\b/gi, "Branco Tit.")
    .replace(/\bBranco Titanio\b/gi, "Branco Tit.")
    .replace(/\bNatural Titanium\b/gi, "Titânio Nat.")
    .replace(/\bWhite Titanium\b/gi, "Titânio Br.")
    .replace(/\bBlack Titanium\b/gi, "Titânio Preto")
}

export function formatBatteryHealth(value?: string | number | null): string {
  const text = sanitizeLabelText(value)
  if (!text) return ""
  const numeric = text.match(/\d+/)?.[0]
  return numeric ? `Bat. ${numeric}%` : `Bat. ${text.replace(/%$/, "")}`
}

export function formatPackagingForLabel(value?: string | null): string {
  const text = sanitizeLabelText(value)
  if (!text || /^n[aã]o informado$/i.test(text)) return ""
  if (/^caixa nobretech$/i.test(text)) return "Caixa: Nobretech"
  if (/^caixa original$/i.test(text)) return "Caixa: Original"
  if (/^sem caixa$/i.test(text)) return "Sem caixa"
  if (/^outro$/i.test(text)) return "Caixa: Outro"
  if (/^caixa:/i.test(text)) return text
  return `Caixa: ${truncateLabelText(text, 22)}`
}

export function inventoryLabelText(data: InventoryStockLabelData): string {
  const identity = maskImeiOrSerial(data.imei) || maskImeiOrSerial(data.serial)
  const identityLabel = data.imei ? "IMEI" : "Serial"
  const specs = [data.storage, abbreviateLabelText(data.color)].map(sanitizeLabelText).filter(Boolean)
  const condition = [
    data.grade ? `Grade ${sanitizeLabelText(data.grade).replace(/^Grade\s+/i, "")}` : "",
    formatBatteryHealth(data.batteryHealth),
  ].filter(Boolean)
  const packaging = formatPackagingForLabel(data.packaging)

  return [
    "NOBRETECH STORE",
    data.stockCode ? `ESTOQUE: ${data.stockCode}` : "",
    "",
    data.model,
    specs.join(" | "),
    condition.join(" | "),
    identity ? `${identityLabel}: ${identity}` : "",
    packaging,
    "",
    LABEL_INSTAGRAM,
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n")
}

export function verifiedPurchaseLabelText(data: VerifiedPurchaseCustomerLabelData): string {
  return [
    "NOBRETECH STORE",
    "✓ Verificada",
    `Cliente: ${data.customerFirstName || "Cliente"}`,
    data.purchaseCode ? `Compra: ${data.purchaseCode}` : "",
    `PIN: ${normalizePin(data.pin)}`,
    formatShortDate(data.warrantyEnd) ? `Garantia: ${formatShortDate(data.warrantyEnd)}` : "",
    data.publicUrl,
    LABEL_INSTAGRAM,
  ].filter(Boolean).join("\n")
}
