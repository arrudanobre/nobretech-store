import { calculatePaymentPrice, formatBRL } from "@/lib/helpers"
import type { PublicCatalogProduct } from "@/lib/catalog/types"

export type CatalogPaymentSettings = Partial<Record<string, number | null | undefined>>

export type CatalogInstallmentQuote = {
  installments: number
  text: string
  totalText: string | null
  note: string | null
  total: number | null
  installmentValue: number | null
  feePercent: number | null
}

export function isValidPromoPrice(publicPrice: number, promoPrice: number | null | undefined): promoPrice is number {
  return promoPrice != null && promoPrice > 0 && promoPrice < publicPrice
}

export function getCatalogDisplayPrice(product: Pick<PublicCatalogProduct, "price" | "promoPrice">): number {
  return isValidPromoPrice(product.price, product.promoPrice) ? product.promoPrice : product.price
}

export function getCatalogSavings(product: Pick<PublicCatalogProduct, "price" | "promoPrice">): number | null {
  if (!isValidPromoPrice(product.price, product.promoPrice)) return null
  return Math.round((product.price - product.promoPrice) * 100) / 100
}

export function buildCatalogInstallmentQuote(
  price: number,
  installmentCount: number,
  settings: CatalogPaymentSettings,
): CatalogInstallmentQuote | null {
  if (price <= 0 || installmentCount <= 0) return null

  const count = Math.max(1, Math.min(18, Math.trunc(installmentCount)))
  const method = `credit_${count}x`
  const payment = calculatePaymentPrice(price, method, settings)

  if (!payment.fee || payment.price <= price) {
    return {
      installments: count,
      text: "Parcelamento disponível no cartão. Consulte as condições no WhatsApp.",
      totalText: null,
      note: null,
      total: null,
      installmentValue: null,
      feePercent: null,
    }
  }

  return {
    installments: payment.installments,
    text: `${payment.installments}x de ${formatBRL(payment.installmentValue)} no cartão`,
    totalText: `Total parcelado: ${formatBRL(payment.price)}`,
    note: "Inclui acréscimo da maquininha.",
    total: payment.price,
    installmentValue: payment.installmentValue,
    feePercent: payment.fee,
  }
}

export function buildCatalogInstallmentOptions(
  price: number,
  settings: CatalogPaymentSettings,
  maxInstallments = 18,
): Array<{
  installments: number
  text: string
  totalText: string
  note: string
  total: number
  installmentValue: number
  feePercent: number
}> {
  const max = Math.max(1, Math.min(18, Math.trunc(maxInstallments)))
  return Array.from({ length: max }, (_, index) => index + 1)
    .map((count) => buildCatalogInstallmentQuote(price, count, settings))
    .filter((quote): quote is CatalogInstallmentQuote & {
      totalText: string
      note: string
      total: number
      installmentValue: number
      feePercent: number
    } => Boolean(quote?.totalText && quote.note && quote.total && quote.installmentValue && quote.feePercent))
    .map((quote) => ({
      installments: quote.installments,
      text: quote.text,
      totalText: quote.totalText,
      note: quote.note,
      total: quote.total,
      installmentValue: quote.installmentValue,
      feePercent: quote.feePercent,
    }))
}
