import { SIDEPAY_FEE_PCTS } from "@/lib/constants"
import { pool } from "@/lib/db"
import { normalizePaymentFeePct } from "@/lib/helpers"
import type { CatalogPaymentSettings } from "@/lib/catalog/pricing"

const CREDIT_METHODS = Array.from({ length: 18 }, (_, index) => `credit_${index + 1}x`)

export function defaultCatalogPaymentSettings(): CatalogPaymentSettings {
  return { ...SIDEPAY_FEE_PCTS }
}

export async function loadCatalogPaymentSettings(companyId: string): Promise<CatalogPaymentSettings> {
  const defaults = defaultCatalogPaymentSettings()
  const result = await pool.query<Record<string, string | number | null>>(
    "SELECT * FROM financial_settings WHERE company_id = $1::uuid LIMIT 1",
    [companyId],
  )
  const row = result.rows[0]
  if (!row) return defaults

  const settings: CatalogPaymentSettings = { ...defaults }
  for (const method of CREDIT_METHODS) {
    const dbKey = `${method}_fee_pct`
    const value = row[dbKey]
    settings[method] = value == null ? defaults[method] : normalizePaymentFeePct(method, Number(value))
  }
  settings.pix = row.pix_fee_pct == null ? defaults.pix : normalizePaymentFeePct("pix", Number(row.pix_fee_pct))
  settings.debit = row.debit_fee_pct == null ? defaults.debit : normalizePaymentFeePct("debit", Number(row.debit_fee_pct))
  settings.cash = row.cash_discount_pct == null ? defaults.cash : normalizePaymentFeePct("cash", Number(row.cash_discount_pct))
  return settings
}
