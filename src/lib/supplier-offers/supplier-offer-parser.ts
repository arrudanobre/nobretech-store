import {
  SUPPLIER_OFFER_AVAILABILITIES,
  SUPPLIER_OFFER_CONDITIONS,
  SUPPLIER_OFFER_CONFIDENCES,
  SUPPLIER_OFFER_WARRANTY_TYPES,
  type ParsedSupplierOffer,
  type SupplierOfferAvailability,
  type SupplierOfferCondition,
  type SupplierOfferConfidence,
  type SupplierOfferReviewStatus,
  type SupplierOfferWarrantyType,
} from "./types"

type SectionContext = {
  label: string | null
  category: string | null
  brand: string | null
  condition: SupplierOfferCondition
  internalGrade: string | null
  origin: string | null
  warrantyType: SupplierOfferWarrantyType
  warrantyLabel: string | null
  warrantyUntil: string | null
}

const WHATSAPP_TIMESTAMP_RE = /^\[\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}:\d{2}\]\s*[^:]+:\s*/

const COLOR_WORDS = [
  "branco",
  "branca",
  "azul",
  "preto",
  "preta",
  "verde",
  "roxo",
  "roxa",
  "rosa",
  "desert titanium",
  "desert",
  "natural titanium",
  "titanium natural",
  "natural",
  "midnight",
  "meia-noite",
  "jet black",
  "lunar gold",
  "black",
  "white",
  "blue",
  "purple",
  "green",
  "pink",
  "laranja",
  "orange",
  "silver",
  "gold",
  "starlight",
  "estelar",
  "grafite",
  "dourado",
  "titânio",
  "titanio",
]

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function compact(value: string) {
  return stripAccents(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

function cleanLine(line: string) {
  return line
    .replace(WHATSAPP_TIMESTAMP_RE, "")
    .replace(/[📱📲⌚🎧🔋💰💲✅🚨🔥⭐️•✨🖤🤍💙💜💚🧡💛💗💖]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function emptyContext(): SectionContext {
  return {
    label: null,
    category: null,
    brand: null,
    condition: "unknown",
    internalGrade: null,
    origin: null,
    warrantyType: "none",
    warrantyLabel: null,
    warrantyUntil: null,
  }
}

function splitWhatsAppMessages(rawText: string) {
  const rawLines = rawText.split(/\r?\n/)
  if (!rawLines.some((line) => WHATSAPP_TIMESTAMP_RE.test(line.trim()))) return [rawText]

  const messages: string[] = []
  let current: string[] = []

  for (const rawLine of rawLines) {
    const line = rawLine.trim()
    if (WHATSAPP_TIMESTAMP_RE.test(line)) {
      if (current.length) messages.push(current.join("\n"))
      current = [line.replace(WHATSAPP_TIMESTAMP_RE, "")]
      continue
    }
    current.push(rawLine)
  }

  if (current.length) messages.push(current.join("\n"))
  return messages.filter((message) => message.trim())
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(" ")
}

export function parseMoney(value: string): number | null {
  const moneyMatch = value.match(/R\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{2})?/i)
  const fallbackMatch = value.match(/\b(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,\d{2})?\b(?!.*\b\d{4,6}\b)/)
  const match = moneyMatch || fallbackMatch
  if (!match) return null
  const parsed = Number(match[0].replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

function extractPrice(line: string) {
  if (!/(r\$|\$|\bvalor\b|\bpre[cç]o\b|\d+[.,]\d{3})/i.test(line)) return null
  return parseMoney(line)
}

function extractBattery(line: string) {
  const match = line.match(/(?:bateria|bat|sa[uú]de|🔋)\D{0,12}(\d{2,3})\s*%/i) || line.match(/\b(\d{2,3})\s*%\s*(?:bateria|bat|sa[uú]de)?/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

export function normalizeSupplierColor(input: string | null | undefined) {
  const cleaned = cleanLine(String(input || ""))
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return null

  const normalized = compact(cleaned)
  const known: Array<[RegExp, string]> = [
    [/\b(midnight|meia noite)\b/, "Midnight"],
    [/\b(jet black)\b/, "Jet Black"],
    [/\b(preto|preta|black)\b/, "Preto"],
    [/\b(branco|branca|white)\b/, "Branco"],
    [/\b(azul|blue)\b/, "Azul"],
    [/\b(roxo|roxa|purple)\b/, "Roxo"],
    [/\b(rosa|pink)\b/, "Rosa"],
    [/\b(verde|green)\b/, "Verde"],
    [/\b(laranja|orange)\b/, "Laranja"],
    [/\b(natural titanium|titanium natural|titanio natural|natural titanio)\b/, "Natural Titanium"],
    [/\b(starlight|estelar)\b/, "Estelar"],
    [/\b(lunar gold)\b/, "Lunar Gold"],
    [/\b(desert titanium)\b/, "Desert Titanium"],
    [/\b(desert)\b/, "Desert"],
    [/\b(dourado|gold)\b/, "Dourado"],
    [/\b(silver|prata)\b/, "Prata"],
  ]
  const match = known.find(([regex]) => regex.test(normalized))
  return match ? match[1] : titleCase(cleaned)
}

export function normalizeWarranty(input: string | null | undefined): {
  warrantyType: SupplierOfferWarrantyType
  warrantyLabel: string | null
  warrantyUntil: string | null
  warning: string | null
} {
  const value = cleanLine(String(input || ""))
  if (!value) return { warrantyType: "none", warrantyLabel: null, warrantyUntil: null, warning: null }
  const normalized = compact(value)

  let warrantyType: SupplierOfferWarrantyType = "unknown"
  if (normalized.includes("apple")) warrantyType = "apple"
  else if (normalized.includes("nobretech")) warrantyType = "nobretech"
  else if (normalized.includes("fornecedor")) warrantyType = "supplier"
  else if (normalized.includes("sem garantia")) warrantyType = "none"

  const monthMatch = normalized.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:\/|de)?\s*(\d{2,4})\b/)
  const monthMap: Record<string, string> = {
    jan: "01",
    fev: "02",
    mar: "03",
    abr: "04",
    mai: "05",
    jun: "06",
    jul: "07",
    ago: "08",
    set: "09",
    out: "10",
    nov: "11",
    dez: "12",
  }
  const year = monthMatch ? (monthMatch[2].length === 2 ? `20${monthMatch[2]}` : monthMatch[2]) : null
  const warrantyUntil = monthMatch && year ? `${year}-${monthMap[monthMatch[1].slice(0, 3)] || "01"}` : null
  const monthLabel = monthMatch ? `${monthMatch[1][0].toUpperCase()}${monthMatch[1].slice(1, 3)}/${String(year).slice(2)}` : null
  const detail = monthLabel || (normalized.includes("1 ano") ? "1 ano" : normalized.includes("6 meses") ? "6 meses" : null)
  const prefix = warrantyType === "apple"
    ? "Garantia Apple"
    : warrantyType === "nobretech"
      ? "Garantia Nobretech"
      : warrantyType === "supplier"
        ? "Garantia fornecedor"
        : warrantyType === "none"
          ? null
          : "Garantia a revisar"

  return {
    warrantyType,
    warrantyLabel: prefix ? [prefix, detail].filter(Boolean).join(" ") : null,
    warrantyUntil,
    warning: warrantyType === "unknown" ? "Garantia não estruturada" : null,
  }
}

function extractWarranty(line: string) {
  if (/1\s*ano.*garantia\s*apple|garantia\s*apple.*1\s*ano/i.test(line)) return "Garantia Apple 1 ano"
  const match = line.match(/(?:garantia\s*(?:apple)?|apple\s*at[eé]|at[eé])\s*[:\-]?\s*([a-zç]{3,9}\/?\d{2,4}|[a-zç]{3,9}\s+de\s+\d{4}|[a-zç]{3,9}\/\d{2}|1\s*ano(?:\s*de\s*garantia\s*apple)?)/i)
  if (match) {
    const label = match[0].trim()
    return /^at[eé]/i.test(label) ? `garantia ${label}` : label
  }
  if (/garantia\s+apple/i.test(line)) return "Garantia Apple"
  return null
}

function extractGrade(line: string) {
  const match = line.match(/\bgrade\s*([a-z]\+?)/i)
  return match ? match[1].toUpperCase() : null
}

function isPriceOnly(line: string) {
  return Boolean(extractPrice(line)) && !/(iphone|watch|garmin|starlink|alexa|echo|airpods|macbook|ipad|forerunner|series|se\b|pro|max|mini)/i.test(line)
}

function isColorOnly(line: string) {
  const normalized = compact(cleanLine(line))
  return COLOR_WORDS.some((color) => compact(color) === normalized)
}

function extractColor(line: string) {
  const normalized = compact(cleanLine(line))
  const color = COLOR_WORDS.find((item) => normalized.includes(compact(item)))
  return color ? normalizeSupplierColor(color) : null
}

function categoryFromText(line: string): { category: string | null; brand: string | null } {
  const normalized = compact(line)
  if (normalized.includes("iphone")) return { category: "iphone", brand: "Apple" }
  if (/\b(1[1-7]|16e)\b/.test(normalized) && (/\b(pro|max|mini|plus|e)\b/.test(normalized) || /\b\d+\s*(gb|tb)\b/.test(normalized))) return { category: "iphone", brand: "Apple" }
  if (normalized.includes("apple watch") || /\bwatch\b/.test(normalized) || /\bseries\b/.test(normalized)) return { category: "applewatch", brand: "Apple" }
  if (normalized.includes("garmin") || normalized.includes("forerunner")) return { category: "garmin", brand: "Garmin" }
  if (normalized.includes("starlink")) return { category: "gadgets", brand: "Starlink" }
  if (normalized.includes("alexa") || normalized.includes("echo dot")) return { category: "gadgets", brand: "Amazon" }
  if (normalized.includes("airpods")) return { category: "airpods", brand: "Apple" }
  if (normalized.includes("ipad")) return { category: "ipad", brand: "Apple" }
  if (normalized.includes("macbook")) return { category: "macbook", brand: "Apple" }
  return { category: null, brand: null }
}

function conditionFromText(line: string, fallback: SupplierOfferCondition = "unknown"): SupplierOfferCondition {
  const normalized = compact(line)
  if (/\b(lacrado|lacrados|novo|novos)\b/.test(normalized)) return "sealed"
  if (/\b(seminovo|seminovos|usado|usados|americano|americanos|grade)\b/.test(normalized)) return "used"
  return fallback
}

function isSectionLine(line: string) {
  const cleaned = cleanLine(line)
  const normalized = compact(cleaned)
  if (!cleaned || isPriceOnly(cleaned)) return false
  if (isContextOnlyLine(cleaned)) return false
  const hasSectionWord = /(lacrado|lacrados|americano|americanos|seminovo|seminovos|usado|usados|atualizados|relogios|relógios|gadgets|garmin|apple watch|todos)/i.test(cleaned)
  const hasProductNumber = /\b\d{2,4}\b/.test(cleaned) || /\b\d+\s*(gb|tb|mm)\b/i.test(cleaned)
  return hasSectionWord && !hasProductNumber && normalized.length <= 100
}

function isSeparatorLine(line: string) {
  const normalized = line.trim()
  return /^(?:[-_=\u2014\u2015\u2500-\u257f\u2e3b\u2e3c\s]){3,}$/.test(normalized)
}

function isContextOnlyLine(line: string) {
  const normalized = compact(line)
  return /garantia|todos\s+lacrados|todos\s+novos/.test(normalized) && !looksLikeProduct(line) && !extractPrice(line)
}

function updateContextFromLine(line: string, current: SectionContext): SectionContext {
  const warranty = normalizeWarranty(extractWarranty(line))
  return {
    ...current,
    condition: conditionFromText(line, current.condition),
    warrantyType: warranty.warrantyType !== "none" ? warranty.warrantyType : current.warrantyType,
    warrantyLabel: warranty.warrantyLabel || current.warrantyLabel,
    warrantyUntil: warranty.warrantyUntil || current.warrantyUntil,
  }
}

function updateSection(line: string, current: SectionContext): SectionContext {
  const categoryBrand = categoryFromText(line)
  const warranty = normalizeWarranty(extractWarranty(line))
  return {
    label: line,
    category: categoryBrand.category || current.category,
    brand: categoryBrand.brand || current.brand,
    condition: conditionFromText(line, current.condition),
    internalGrade: extractGrade(line) || current.internalGrade,
    origin: /american/i.test(stripAccents(line)) ? "americano" : current.origin,
    warrantyType: warranty.warrantyType !== "none" ? warranty.warrantyType : current.warrantyType,
    warrantyLabel: warranty.warrantyLabel || current.warrantyLabel,
    warrantyUntil: warranty.warrantyUntil || current.warrantyUntil,
  }
}

function looksLikeProduct(line: string) {
  if (isPriceOnly(line)) return false
  return /(iphone|watch|garmin|forerunner|starlink|alexa|echo|airpods|macbook|ipad|\bse\s*\d|\bseries\s*\d|\b\d{2}\s*(pro|max|mini|e)?\b)/i.test(line)
}

function extractStorage(line: string) {
  const match = line.match(/\b(\d+\s*(?:GB|TB))\b/i)
  if (match) return match[1].replace(/\s+/g, "").toUpperCase()
  const bareMatch = line.match(/\b(64|128|256|512)\b(?!\s*%)/)
  return bareMatch ? `${bareMatch[1]}GB` : null
}

function extractSize(line: string) {
  const match = line.match(/\b(\d+\s*mm)\b/i)
  return match ? match[1].replace(/\s+/g, "").toLowerCase() : null
}

function extractConnectivity(line: string) {
  if (/gps\s*\+\s*cellular|cellular\s*\+\s*gps/i.test(line)) return "GPS + Cellular"
  if (/\bcellular\b/i.test(line)) return "Cellular"
  if (/\bgps\b/i.test(line)) return "GPS"
  return null
}

function extractModel(line: string, category: string | null) {
  const withoutPrice = line.replace(/R\$\s*[\d.,]+/gi, "").replace(/\b\d{1,3}\s*%/g, "").trim()
  const storage = extractStorage(withoutPrice)
  const size = extractSize(withoutPrice)
  let model = withoutPrice
    .replace(/\b\d+\s*(?:GB|TB)\b/gi, "")
    .replace(/\b(64|128|256|512)\b(?!\s*%)/g, "")
    .replace(/\b\d+\s*mm\b/gi, "")
    .replace(/\bGPS\s*\+\s*Cellular\b/gi, "")
    .replace(/\b(?:bateria|bat|sa[uú]de)\b.*$/i, "")
    .replace(/\b(?:garantia|apple\s*at[eé]|at[eé])\b.*$/i, "")
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const color = extractColor(model)
  if (color) model = model.replace(new RegExp(`\\b${color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").trim()
  if (category === "iphone") {
    model = model.replace(/^iphone\s*/i, "").trim()
    model = `iPhone ${titleCase(model)}`.replace(/\b16e\b/i, "16E")
  }
  if (category === "applewatch" && /^series/i.test(model)) model = `Apple Watch ${model}`
  return { model: model || null, storage, size }
}

function categoryGroup(category: string | null | undefined) {
  const value = compact(category || "")
  if (["iphone", "ipad", "macbook"].includes(value)) return "device"
  if (["applewatch", "garmin"].includes(value)) return "watch"
  if (["gadgets", "airpods", "accessories"].includes(value)) return "gadget"
  return "unknown"
}

export function classifySupplierOfferReview(item: ParsedSupplierOffer): SupplierOfferReviewStatus {
  if (item.duplicateCandidate) return "duplicate"
  if (item.availability !== "available" || item.supplierPrice == null) return "needs_review"
  if (!item.model) return "needs_review"
  if (item.condition === "unknown" && categoryGroup(item.category) === "device") return "needs_review"

  const group = categoryGroup(item.category)
  if (group === "device" && (!item.storage || !item.color)) return "needs_review"
  if (group === "watch" && !item.size && /\b\d+\s*mm\b/i.test(item.sourceLine)) return "needs_review"

  const blockingWarning = item.warnings.some((warning) => /preço|modelo/i.test(warning) || (group === "device" && /condição/i.test(warning)))
  return blockingWarning ? "needs_review" : "ready"
}

function makeOffer(line: string, context: SectionContext, overrides: Partial<ParsedSupplierOffer> = {}): ParsedSupplierOffer {
  const categoryBrand = categoryFromText(line)
  const category = overrides.category ?? categoryBrand.category ?? context.category
  const { model, storage, size } = extractModel(line, category)
  const price = overrides.supplierPrice ?? extractPrice(line)
  const condition = overrides.condition ?? conditionFromText(line, context.condition)
  const batteryHealth = overrides.batteryHealth ?? extractBattery(line)
  const warrantyFromLine = normalizeWarranty(extractWarranty(line))
  const inferredAppleWarranty = warrantyFromLine.warrantyType === "unknown"
    && Boolean(warrantyFromLine.warrantyUntil)
    && (categoryBrand.brand === "Apple" || context.brand === "Apple")
  const warrantyType = overrides.warrantyType
    ?? (inferredAppleWarranty ? "apple" : warrantyFromLine.warrantyType !== "none" ? warrantyFromLine.warrantyType : context.warrantyType)
  const overrideWarrantyLabel = overrides.warrantyLabel
  const warrantyLabel = overrideWarrantyLabel
    ? (inferredAppleWarranty ? overrideWarrantyLabel.replace("Garantia a revisar", "Garantia Apple") : overrideWarrantyLabel)
    : (inferredAppleWarranty && warrantyFromLine.warrantyLabel
      ? warrantyFromLine.warrantyLabel.replace("Garantia a revisar", "Garantia Apple")
      : warrantyFromLine.warrantyLabel)
    ?? context.warrantyLabel
  const warrantyUntil = overrides.warrantyUntil ?? warrantyFromLine.warrantyUntil ?? context.warrantyUntil
  const color = normalizeSupplierColor(overrides.color ?? extractColor(line))
  const warnings = [...(overrides.warnings || [])]

  if (!color && ["iphone", "ipad", "macbook"].includes(category || "")) warnings.push("Cor ausente ou não identificada")
  if (price == null) warnings.push("Preço ausente")
  if (condition === "unknown") warnings.push("Condição ausente ou incerta")
  if (warrantyFromLine.warning) warnings.push(warrantyFromLine.warning)
  const itemWarnings = condition === "sealed" ? warnings.filter((warning) => !/bateria/i.test(warning)) : warnings

  const offer: ParsedSupplierOffer = {
    sourceLine: overrides.sourceLine ?? line,
    sourceSection: overrides.sourceSection ?? context.label,
    category,
    brand: overrides.brand ?? categoryBrand.brand ?? context.brand,
    model: overrides.model ?? model,
    variant: overrides.variant ?? extractConnectivity(line),
    storage: ["applewatch", "garmin", "gadgets"].includes(category || "") ? null : overrides.storage ?? storage,
    size: overrides.size ?? size,
    color,
    condition,
    internalGrade: overrides.internalGrade ?? extractGrade(line) ?? context.internalGrade,
    batteryHealth,
    warrantyType,
    warrantyLabel,
    warrantyUntil,
    origin: overrides.origin ?? (/american/i.test(stripAccents(line)) ? "americano" : context.origin),
    supplierPrice: price,
    availability: overrides.availability ?? (price == null ? "unknown" : "available"),
    confidence: overrides.confidence ?? "medium",
    warnings: Array.from(new Set(itemWarnings)),
    parserSource: overrides.parserSource ?? "local",
  }

  return { ...offer, reviewStatus: classifySupplierOfferReview(offer) }
}

function expandBlock(block: string[], context: SectionContext) {
  const productLine = block.find((line) => looksLikeProduct(line)) || block[0]
  const price = block.map(extractPrice).find((value): value is number => value != null) ?? null
  const colors = block.filter(isColorOnly).map((line) => normalizeSupplierColor(line)).filter((color): color is string => Boolean(color))
  const details = block.join(" ")
  const batteryHealth = extractBattery(details)
  const warranty = normalizeWarranty(extractWarranty(details) || context.warrantyLabel)

  if (colors.length > 1) {
    return colors.map((color) => makeOffer(productLine, context, {
      color,
      supplierPrice: price,
      batteryHealth,
      warrantyType: warranty.warrantyType !== "none" && warranty.warrantyType !== "unknown" ? warranty.warrantyType : undefined,
      warrantyLabel: warranty.warrantyLabel || context.warrantyLabel,
      warrantyUntil: warranty.warrantyUntil || context.warrantyUntil,
      sourceLine: `${productLine} ${color} ${price != null ? `R$ ${price}` : ""}`.trim(),
    }))
  }

  return [makeOffer(details, context, {
    supplierPrice: price,
    batteryHealth,
    warrantyType: warranty.warrantyType !== "none" && warranty.warrantyType !== "unknown" ? warranty.warrantyType : undefined,
    warrantyLabel: warranty.warrantyLabel || context.warrantyLabel,
    warrantyUntil: warranty.warrantyUntil || context.warrantyUntil,
  })]
}

export function buildDuplicateKey(item: ParsedSupplierOffer, supplierId?: string | null) {
  return [
    supplierId || "supplier-null",
    compact(item.category || ""),
    compact(item.model || ""),
    compact(item.storage || item.size || ""),
    compact(item.color || ""),
    item.supplierPrice == null ? "no-price" : String(item.supplierPrice),
  ].join("|")
}

export function markDuplicateCandidates(items: ParsedSupplierOffer[], supplierId?: string | null) {
  const keys = items.map((item) => buildDuplicateKey(item, supplierId))
  const counts = new Map<string, number>()
  keys.forEach((key) => counts.set(key, (counts.get(key) || 0) + 1))

  return items.map((item, index) => {
    const duplicateCandidate = (counts.get(keys[index]) || 0) > 1
    const warnings = duplicateCandidate
      ? Array.from(new Set([...item.warnings, "Duplicidade provável no mesmo lote"]))
      : item.warnings
    const enriched = { ...item, duplicateKey: keys[index], duplicateCandidate, warnings }
    return { ...enriched, reviewStatus: classifySupplierOfferReview(enriched) }
  })
}

function parseSupplierOfferMessage(rawText: string) {
  const lines = rawText.split(/\r?\n/).map(cleanLine).filter(Boolean)
  let context = emptyContext()
  const items: ParsedSupplierOffer[] = []
  let block: string[] = []

  const flush = () => {
    if (block.length && block.some(looksLikeProduct)) items.push(...expandBlock(block, context))
    block = []
  }

  for (const line of lines) {
    if (isSeparatorLine(line)) {
      flush()
      context = emptyContext()
      continue
    }
    if (isContextOnlyLine(line)) {
      context = updateContextFromLine(line, context)
      if (block.length) block.push(line)
      continue
    }
    if (isSectionLine(line)) {
      flush()
      context = updateSection(line, emptyContext())
      continue
    }
    if (looksLikeProduct(line) && block.some(looksLikeProduct)) flush()
    block.push(line)
    if (isPriceOnly(line)) flush()
  }
  flush()

  return items
}

export function parseSupplierOffersFallback(rawText: string, supplierId?: string | null) {
  const items = splitWhatsAppMessages(rawText).flatMap(parseSupplierOfferMessage)
  return markDuplicateCandidates(items, supplierId)
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/\./g, "").replace(",", ".")) : NaN
  return Number.isFinite(numberValue) ? numberValue : null
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(value as T[number]) ? value as T[number] : fallback
}

export function normalizeParsedSupplierOffers(input: unknown, supplierId?: string | null) {
  const rows = Array.isArray(input) ? input : []
  const items = rows.map((row): ParsedSupplierOffer => {
    const record = row && typeof row === "object" ? row as Record<string, unknown> : {}
    const condition = oneOf(record.condition, SUPPLIER_OFFER_CONDITIONS, "unknown") as SupplierOfferCondition
    const availability = oneOf(record.availability, SUPPLIER_OFFER_AVAILABILITIES, "unknown") as SupplierOfferAvailability
    const confidence = oneOf(record.confidence, SUPPLIER_OFFER_CONFIDENCES, "medium") as SupplierOfferConfidence
    const warnings = Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : []
    const supplierPrice = asNumber(record.supplierPrice)
    const batteryHealth = asNumber(record.batteryHealth)
    const warranty = normalizeWarranty(asString(record.warrantyLabel))
    const warrantyType = oneOf(record.warrantyType, SUPPLIER_OFFER_WARRANTY_TYPES, warranty.warrantyType) as SupplierOfferWarrantyType

    if (supplierPrice == null) warnings.push("Preço ausente")
    if (condition === "unknown") warnings.push("Condição ausente ou incerta")
    if (warranty.warning) warnings.push(warranty.warning)
    const itemWarnings = condition === "sealed" ? warnings.filter((warning) => !/bateria/i.test(warning)) : warnings

    const offer: ParsedSupplierOffer = {
      sourceLine: asString(record.sourceLine) || "Linha sem origem",
      sourceSection: asString(record.sourceSection),
      category: asString(record.category),
      brand: asString(record.brand),
      model: asString(record.model),
      variant: asString(record.variant),
      storage: asString(record.storage),
      size: asString(record.size),
      color: normalizeSupplierColor(asString(record.color)),
      condition,
      internalGrade: asString(record.internalGrade),
      batteryHealth: batteryHealth == null ? null : Math.max(0, Math.min(100, Math.round(batteryHealth))),
      warrantyType,
      warrantyLabel: warranty.warrantyLabel || asString(record.warrantyLabel),
      warrantyUntil: asString(record.warrantyUntil) || warranty.warrantyUntil,
      origin: asString(record.origin),
      supplierPrice,
      availability,
      confidence,
      parserSource: "ai",
      warnings: Array.from(new Set(itemWarnings)),
    }
    return { ...offer, reviewStatus: classifySupplierOfferReview(offer) }
  })

  return markDuplicateCandidates(items, supplierId)
}
