// Máscaras + validações pt-BR. Stateless. Reutilizáveis em qualquer input.

export function digitsOnly(value: string): string {
  return (value || "").replace(/\D+/g, "")
}

export function maskCpf(value: string): string {
  const d = digitsOnly(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function maskCnpj(value: string): string {
  const d = digitsOnly(value).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// Auto-detecta CPF (≤11 dígitos) ou CNPJ (>11 dígitos).
export function maskCpfCnpj(value: string): string {
  const d = digitsOnly(value)
  return d.length <= 11 ? maskCpf(value) : maskCnpj(value)
}

// Telefone BR: fixo (10 dig) "(00) 0000-0000" ou celular (11 dig) "(00) 00000-0000".
export function maskPhoneBr(value: string): string {
  const d = digitsOnly(value).slice(0, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test((value || "").trim())
}

export function isValidUrl(value: string): boolean {
  const v = (value || "").trim()
  if (!v) return false
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/
export function isValidHex(value: string): boolean {
  return HEX_RE.test((value || "").trim())
}

export function normalizeHex(value: string): string {
  const v = (value || "").trim()
  if (!v) return ""
  const withHash = v.startsWith("#") ? v : `#${v}`
  return /^#[0-9a-fA-F]{3,8}$/.test(withHash) ? withHash.toUpperCase() : withHash
}

// CPF (11 dig) ou CNPJ (14 dig). Validação de tamanho apenas (não verifica DV).
export function isValidCpfOrCnpjLength(value: string): boolean {
  const d = digitsOnly(value)
  return d.length === 11 || d.length === 14
}

export function isValidPhoneBrLength(value: string): boolean {
  const d = digitsOnly(value)
  return d.length === 10 || d.length === 11
}
