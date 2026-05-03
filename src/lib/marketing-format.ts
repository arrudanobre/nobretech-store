export function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

export function formatCurrencyBR(value: string | number | null | undefined) {
  const digits = onlyDigits(String(value ?? ""))
  const cents = Number(digits || "0")
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

export function parseCurrencyBR(value: string | number | null | undefined) {
  if (typeof value === "number") return value
  const digits = onlyDigits(String(value ?? ""))
  return Number((Number(digits || "0") / 100).toFixed(2))
}

export function currencyNumberToInput(value: number | null | undefined) {
  return formatCurrencyBR(Math.round(Number(value || 0) * 100))
}

export function formatPhoneBR(value: string | null | undefined) {
  const digits = onlyDigits(String(value ?? "")).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function isValidEmail(value: string) {
  if (!value.trim()) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
