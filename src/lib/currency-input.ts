import { formatBRL } from "@/lib/helpers"

export function currencyInputToNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return 0
  return Math.round(Number(digits)) / 100
}

export function maskCurrencyInput(value: string | number | null | undefined): string {
  const amount = currencyInputToNumber(value)
  return amount > 0 ? formatBRL(amount) : ""
}

