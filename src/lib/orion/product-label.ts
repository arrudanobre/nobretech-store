function normalizeKey(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase().normalize("NFD")
  const chars = Array.from(normalized).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= 768 && code <= 879) return ""
    if (char >= "a" && char <= "z") return char
    if (char >= "0" && char <= "9") return char
    return " "
  })
  return chars.join("").split(" ").filter(Boolean).join(" ")
}

function singularizePt(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  if (lower.endsWith("ões")) return `${trimmed.slice(0, -3)}ão`
  if (lower.endsWith("ais")) return `${trimmed.slice(0, -3)}al`
  if (lower.endsWith("eis")) return `${trimmed.slice(0, -3)}el`
  if (lower.endsWith("res") || lower.endsWith("ses") || lower.endsWith("zes")) return trimmed.slice(0, -2)
  if (lower.endsWith("ns")) return `${trimmed.slice(0, -2)}m`
  if (lower.endsWith("s") && !lower.endsWith("us") && !lower.endsWith("is")) return trimmed.slice(0, -1)
  return trimmed
}

function looksPluralPt(value: string) {
  const lower = value.toLowerCase()
  if (lower.endsWith("us") || lower.endsWith("is")) return false
  return /(ões|ais|eis|res|ses|zes|ns|os|as|es|s)$/.test(lower)
}

export function composeProductLabel(category: string | null | undefined, model: string | null | undefined) {
  const cat = String(category || "").trim()
  const mod = String(model || "").trim()
  if (!cat && !mod) return "Produto sem nome"
  if (!cat) return mod
  if (!mod) return cat
  const catKey = normalizeKey(cat)
  const modKey = normalizeKey(mod)
  if (!catKey || !modKey) return mod || cat
  const modTokens = modKey.split(" ").filter(Boolean)
  const catTokens = catKey.split(" ").filter(Boolean)
  const modelStartsWithCategory = catTokens.length > 0 && catTokens.every((token, idx) => modTokens[idx] === token)
  if (modelStartsWithCategory) return mod
  if (looksPluralPt(cat)) return `${singularizePt(cat)} — ${mod}`
  return `${cat} ${mod}`
}
