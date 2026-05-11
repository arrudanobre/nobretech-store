import "server-only"

import { pool } from "@/lib/db"
import { normalizeCommercialLabel } from "./commercial-label"

export type CommercialSubjectType =
  | "single_inventory_item"
  | "multi_inventory_match"
  | "category"
  | "accessory"
  | "bundle"
  | "unknown"

export type CommercialEntityType = "device" | "accessory" | "addon" | "service" | "bundle" | "unknown"
export type CommercialEntityRole = "primary" | "related" | "compatible_accessory" | "bundle_candidate" | "secondary_suggestion"

export type CommercialSubjectMatch = {
  inventoryId: string
  productName: string
  category: string | null
  productFamily: string | null
  model: string | null
  variation: string | null
  color: string | null
  compatibilityFamily: string | null
  quantity: number
  price: number
  cost: number
  marginPct: number
  daysInStock: number
  status: string
  productType: string | null
  entityType: CommercialEntityType
  entityRole: CommercialEntityRole
  entityPriorityWeight: number
  score: number
  finalScore: number
  reason: string
}

export type CommercialSubjectResolution = {
  subjectType: CommercialSubjectType
  category: string | null
  productFamily: string | null
  model: string | null
  variation: string | null
  compatibilityFamily: string | null
  primarySubject: CommercialSubjectMatch | null
  relatedProducts: CommercialSubjectMatch[]
  compatibleAccessories: CommercialSubjectMatch[]
  bundleCandidates: Array<{
    primary: CommercialSubjectMatch
    accessories: CommercialSubjectMatch[]
    reason: string
  }>
  secondarySuggestions: CommercialSubjectMatch[]
  matches: CommercialSubjectMatch[]
  ambiguity: string | null
  needsClarification: boolean
  confidence: number
  reason: string
}

type CommercialInventoryRow = {
  id: string
  status: string | null
  purchase_price: string | number | null
  suggested_price: string | number | null
  purchase_date: string | null
  quantity: string | number | null
  product_type: string | null
  category: string | null
  model: string | null
  color: string | null
  variation: string | null
  brand: string | null
  notes: string | null
  condition_notes: string | null
}

const STOPWORDS = new Set([
  "a",
  "as",
  "o",
  "os",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "para",
  "pra",
  "pro",
  "por",
  "com",
  "sem",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "e",
  "ou",
  "que",
  "quero",
  "preciso",
  "vender",
  "venda",
  "mais",
  "rapido",
  "rapida",
  "rápido",
  "rápida",
  "campanha",
  "anuncio",
  "anúncio",
  "promocao",
  "promoção",
  "margem",
  "preco",
  "preço",
  "qual",
  "como",
  "minha",
  "meu",
  "esse",
  "essa",
  "este",
  "esta",
  "produto",
  "item",
])

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string) {
  const base = normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
  const variants = new Set<string>()
  for (const token of base) {
    variants.add(token)
    if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1))
  }
  return Array.from(variants)
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function marginPct(price: number, cost: number) {
  return price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0
}

function daysBetween(from: string | null | undefined) {
  if (!from) return 0
  const parsed = new Date(from)
  if (!Number.isFinite(parsed.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
}

function productName(row: CommercialInventoryRow) {
  const category = String(row.category || "").trim()
  const model = String(row.model || "").trim()
  const color = String(row.color || "").trim()
  const variation = String(row.variation || "").trim()
  const base = model && category && normalizeText(model).startsWith(normalizeText(category))
    ? model
    : [category, model].filter(Boolean).join(" ")
  return normalizeCommercialLabel([base, variation, color]
    .filter((part, index, parts) => {
      if (!part) return false
      const normalized = normalizeText(part)
      return parts.findIndex((candidate) => normalizeText(candidate) === normalized) === index
    })
    .join(" ")) || "Produto sem nome"
}

function rowText(row: CommercialInventoryRow) {
  return [
    row.brand,
    row.category,
    row.model,
    row.variation,
    row.color,
    row.product_type,
    row.notes,
    row.condition_notes,
  ].map((part) => String(part || "")).join(" ")
}

function tokenCoverage(tokens: string[], haystack: string) {
  if (!tokens.length) return { count: 0, ratio: 0, matched: [] as string[] }
  const normalized = normalizeText(haystack)
  const compact = normalized.replace(/\s+/g, "")
  const matched = tokens.filter((token) => normalized.includes(token) || compact.includes(token))
  return { count: matched.length, ratio: matched.length / tokens.length, matched }
}

function extractCompatibilityTokens(message: string) {
  const normalized = normalizeText(message)
  const marker = normalized.match(/\b(?:para|pra|pro|compativel com|compatibilidade com)\s+(.+)$/)
  if (!marker?.[1]) return []
  return tokenize(marker[1]).slice(0, 5)
}

function extractTargetTokens(message: string) {
  const normalized = normalizeText(message)
  const marker = normalized.match(/\b(?:para|pra|pro|compativel com|compatibilidade com)\s+/)
  if (!marker?.index) return tokenize(message)
  return tokenize(normalized.slice(0, marker.index))
}

function entityTypeFor(productType?: string | null): CommercialEntityType {
  const normalized = normalizeText(String(productType || ""))
  if (normalized === "device") return "device"
  if (normalized === "accessory") return "accessory"
  if (normalized === "warranty" || normalized === "addon") return "addon"
  if (normalized === "service") return "service"
  if (normalized === "bundle") return "bundle"
  return "unknown"
}

function entityPriorityWeight(entityType: CommercialEntityType) {
  if (entityType === "device") return 100
  if (entityType === "accessory") return 40
  if (entityType === "addon") return 20
  if (entityType === "service") return 15
  if (entityType === "bundle") return 10
  return 0
}

function rowFamilyText(row: CommercialInventoryRow) {
  return [row.category, row.model].map((part) => String(part || "")).join(" ")
}

function deviceFamilyMentioned(row: CommercialInventoryRow, targetTokens: string[]) {
  if (entityTypeFor(row.product_type) !== "device") return false
  const familyTokens = tokenize(rowFamilyText(row))
  if (!familyTokens.length) return false
  return familyTokens.every((token) => targetTokens.includes(token))
}

function scoreRow(row: CommercialInventoryRow, tokens: string[], compatibilityTokens: string[], targetTokens: string[]) {
  const haystack = rowText(row)
  const coverage = tokenCoverage(tokens, haystack)
  const targetCoverage = tokenCoverage(targetTokens, haystack)
  const compatibilityCoverage = tokenCoverage(compatibilityTokens, [row.category, row.model, row.variation, row.notes, row.condition_notes].join(" "))
  const entityType = entityTypeFor(row.product_type)
  const priorityWeight = entityPriorityWeight(entityType)
  const status = String(row.status || "")
  const reasons: string[] = []
  let score = coverage.count * 14 + Math.round(coverage.ratio * 35)
  score += targetCoverage.count * 24 + Math.round(targetCoverage.ratio * 55)

  if (coverage.matched.length) reasons.push(`termos: ${coverage.matched.join(", ")}`)
  if (targetCoverage.matched.length) reasons.push(`alvo explícito: ${targetCoverage.matched.join(", ")}`)
  if (compatibilityCoverage.count) {
    score += compatibilityCoverage.count * 10 + 15
    reasons.push(`compatibilidade: ${compatibilityCoverage.matched.join(", ")}`)
  }
  if (deviceFamilyMentioned(row, targetTokens)) {
    score += 80
    reasons.push("família de device citada explicitamente")
  }
  if (status === "active" || status === "in_stock") {
    score += 15
    reasons.push("estoque operacional")
  }
  if (tokens.length === 0 && compatibilityTokens.length === 0) score = 0

  return {
    score,
    finalScore: score + priorityWeight,
    targetCoverage,
    compatibilityCoverage,
    entityType,
    priorityWeight,
    reason: reasons.join("; ") || "sem correspondência comercial suficiente",
  }
}

function inferSubjectType(matches: CommercialSubjectMatch[], tokens: string[], categoryOnly: boolean): CommercialSubjectType {
  if (!matches.length) return "unknown"
  if (matches.some((match) => normalizeText(String(match.productType || "")) === "bundle")) return "bundle"
  if (categoryOnly) return "category"
  const accessoryMatches = matches.filter((match) => normalizeText(String(match.productType || "")) === "accessory")
  if (accessoryMatches.length && accessoryMatches.length === matches.length) {
    return matches.length === 1 ? "accessory" : "multi_inventory_match"
  }
  return matches.length === 1 ? "single_inventory_item" : "multi_inventory_match"
}

function sharedValue(matches: CommercialSubjectMatch[], key: "category" | "productFamily" | "model" | "variation" | "compatibilityFamily") {
  const values = Array.from(new Set(matches.map((match) => match[key]).filter(Boolean)))
  return values.length === 1 ? values[0] || null : null
}

export async function resolveCommercialSubject(companyId: string, message: string): Promise<CommercialSubjectResolution> {
  const tokens = tokenize(message)
  const compatibilityTokens = extractCompatibilityTokens(message)
  const rawTargetTokens = extractTargetTokens(message)

  if (!tokens.length && !compatibilityTokens.length) {
    return {
      subjectType: "unknown",
      category: null,
      productFamily: null,
      model: null,
      variation: null,
      compatibilityFamily: null,
      primarySubject: null,
      relatedProducts: [],
      compatibleAccessories: [],
      bundleCandidates: [],
      secondarySuggestions: [],
      matches: [],
      ambiguity: null,
      needsClarification: false,
      confidence: 0,
      reason: "A mensagem não trouxe termos comerciais suficientes para resolver catálogo.",
    }
  }

  const result = await pool.query<CommercialInventoryRow>(
    `
      SELECT
        i.id,
        i.status,
        i.purchase_price,
        i.suggested_price,
        i.purchase_date,
        i.quantity,
        i.product_type,
        COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS category,
        COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS model,
        COALESCE(i.color_name_snapshot, pc.color) AS color,
        COALESCE(NULLIF(i.attribute_summary_snapshot, ''), NULLIF(pc.storage, ''), NULLIF(pc.variant, '')) AS variation,
        pc.brand,
        i.notes,
        i.condition_notes
      FROM inventory i
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      WHERE i.company_id = $1::uuid
        AND COALESCE(i.status, 'pending') IN ('active', 'in_stock')
      ORDER BY i.purchase_date ASC, i.created_at ASC
    `,
    [companyId]
  )

  const rawTargetHasMatch = result.rows.some((row) => tokenCoverage(rawTargetTokens, rowText(row)).count > 0)
  const targetTokens = rawTargetHasMatch ? rawTargetTokens : tokens
  const scored = result.rows
    .map((row) => ({ row, ...scoreRow(row, tokens, compatibilityTokens, targetTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.finalScore - a.finalScore)

  const bestDevice = scored
    .filter((entry) => entry.entityType === "device" && deviceFamilyMentioned(entry.row, targetTokens))
    .sort((a, b) => b.targetCoverage.ratio - a.targetCoverage.ratio || b.finalScore - a.finalScore)[0] || null
  const bestAccessory = scored
    .filter((entry) => entry.entityType === "accessory" && entry.targetCoverage.count > 0)
    .sort((a, b) => b.targetCoverage.ratio - a.targetCoverage.ratio || b.finalScore - a.finalScore)[0] || null
  const primaryEntry = bestAccessory && (!bestDevice || bestAccessory.targetCoverage.ratio > bestDevice.targetCoverage.ratio + 0.15)
    ? bestAccessory
    : bestDevice || scored[0] || null
  const topScore = primaryEntry?.finalScore || scored[0]?.finalScore || 0
  const top = scored.filter((entry) => topScore > 0 && entry.finalScore >= Math.max(24, topScore * 0.45)).slice(0, 16)
  const baseMatches = top.map<CommercialSubjectMatch>((entry) => {
    const cost = number(entry.row.purchase_price)
    const price = number(entry.row.suggested_price)
    const category = entry.row.category || null
    const model = entry.row.model || null
    const variation = [entry.row.variation, entry.row.color].filter(Boolean).join(" ") || null
    const entityRole: CommercialEntityRole = entry.row.id === primaryEntry?.row.id
      ? "primary"
      : entry.entityType === "device"
        ? "related"
        : entry.entityType === "accessory"
          ? "compatible_accessory"
          : "secondary_suggestion"
    return {
      inventoryId: entry.row.id,
      productName: productName(entry.row),
      category,
      productFamily: model || category,
      model,
      variation,
      color: entry.row.color || null,
      compatibilityFamily: compatibilityTokens.length ? compatibilityTokens.join(" ") : category,
      quantity: number(entry.row.quantity || 1) || 1,
      price,
      cost,
      marginPct: marginPct(price, cost),
      daysInStock: daysBetween(entry.row.purchase_date),
      status: String(entry.row.status || "pending"),
      productType: entry.row.product_type,
      entityType: entry.entityType,
      entityRole,
      entityPriorityWeight: entry.priorityWeight,
      score: entry.score,
      finalScore: entry.finalScore,
      reason: entry.reason,
    }
  })
  const primarySubject = baseMatches.find((match) => match.entityRole === "primary") || null
  const relatedProducts = baseMatches.filter((match) => match.entityRole === "related")
  const compatibleAccessories = baseMatches.filter((match) => match.entityRole === "compatible_accessory")
  const secondarySuggestions = baseMatches.filter((match) => match.entityRole === "secondary_suggestion")
  const bundleCandidates = primarySubject && primarySubject.entityType === "device" && compatibleAccessories.length
    ? [{
        primary: primarySubject,
        accessories: compatibleAccessories.slice(0, 4),
        reason: "Bundle candidato derivado do produto principal e de acessórios compatíveis resolvidos pelo catálogo/estoque.",
      }]
    : []
  const matches = [
    ...(primarySubject ? [primarySubject] : []),
    ...relatedProducts,
    ...compatibleAccessories,
    ...secondarySuggestions,
  ]

  const categoryOnly = matches.length > 1 && matches.every((match) => {
    const category = normalizeText(match.category || "")
    return category && tokens.some((token) => category.includes(token))
  })
  const subjectType = categoryOnly
    ? "category"
    : primarySubject?.entityType === "accessory" && relatedProducts.length === 0
      ? "accessory"
      : primarySubject && relatedProducts.length === 0
        ? "single_inventory_item"
        : primarySubject && relatedProducts.length > 0
          ? "multi_inventory_match"
          : inferSubjectType(matches, tokens, categoryOnly)
  const confidence = matches.length ? Math.min(0.96, Math.max(0.45, topScore / 180)) : 0
  const competingPrimaryOptions = primarySubject
    ? [primarySubject, ...relatedProducts.filter((match) => match.entityType === primarySubject.entityType)]
    : matches
  const ambiguous = competingPrimaryOptions.length > 1 && !categoryOnly

  return {
    subjectType,
    category: sharedValue(matches, "category"),
    productFamily: sharedValue(matches, "productFamily"),
    model: sharedValue(matches, "model"),
    variation: sharedValue(matches, "variation"),
    compatibilityFamily: compatibilityTokens.length ? compatibilityTokens.join(" ") : sharedValue(matches, "compatibilityFamily"),
    primarySubject,
    relatedProducts,
    compatibleAccessories,
    bundleCandidates,
    secondarySuggestions,
    matches,
    ambiguity: ambiguous ? `Encontrei ${matches.length} itens compatíveis no estoque operacional.` : null,
    needsClarification: ambiguous && matches.length <= 4 && subjectType !== "category",
    confidence,
    reason: matches.length
      ? "Assunto comercial resolvido com hierarquia entre produto principal, relacionados e acessórios compatíveis."
      : "Nenhum item ativo do catálogo/estoque teve correspondência confiável com a mensagem atual.",
  }
}

export function summarizeCommercialSubjectResolution(resolution?: CommercialSubjectResolution | null) {
  if (!resolution) return null
  return {
    subjectType: resolution.subjectType,
    category: resolution.category,
    productFamily: resolution.productFamily,
    model: resolution.model,
    variation: resolution.variation,
    compatibilityFamily: resolution.compatibilityFamily,
    ambiguity: resolution.ambiguity,
    needsClarification: resolution.needsClarification,
    confidence: resolution.confidence,
    reason: resolution.reason,
    primarySubject: resolution.primarySubject ? summarizeMatch(resolution.primarySubject) : null,
    relatedProducts: resolution.relatedProducts.slice(0, 8).map(summarizeMatch),
    compatibleAccessories: resolution.compatibleAccessories.slice(0, 8).map(summarizeMatch),
    bundleCandidates: resolution.bundleCandidates.slice(0, 4).map((candidate) => ({
      primary: summarizeMatch(candidate.primary),
      accessories: candidate.accessories.slice(0, 6).map(summarizeMatch),
      reason: candidate.reason,
    })),
    secondarySuggestions: resolution.secondarySuggestions.slice(0, 8).map(summarizeMatch),
    matches: resolution.matches.slice(0, 8).map(summarizeMatch),
  }
}

function summarizeMatch(match: CommercialSubjectMatch) {
  return {
      inventoryId: match.inventoryId,
      productName: match.productName,
      category: match.category,
      productFamily: match.productFamily,
      model: match.model,
      variation: match.variation,
      color: match.color,
      compatibilityFamily: match.compatibilityFamily,
      quantity: match.quantity,
      price: match.price,
      cost: match.cost,
      marginPct: match.marginPct,
      daysInStock: match.daysInStock,
      status: match.status,
      productType: match.productType,
      entityType: match.entityType,
      entityRole: match.entityRole,
      entityPriorityWeight: match.entityPriorityWeight,
      score: match.score,
      finalScore: match.finalScore,
      reason: match.reason,
  }
}
