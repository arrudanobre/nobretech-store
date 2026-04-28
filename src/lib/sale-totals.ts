/**
 * Centralized sale totals calculator.
 * Handles multi-item sales: one principal product + N additional items (upsell | free/brinde).
 *
 * Rules:
 *  - Upsell: adds to valorAdicionais AND to custoAdicionais
 *  - Brinde (free): adds to custoAdicionais only (does NOT add to valorAdicionais)
 *  - valorTotal = valorPrincipal + soma(sale_price de upsells)
 *  - lucroTotal = lucroPrincipal + lucroAdicionais (brindes always reduce lucro)
 */

export interface AdditionalItem {
  type: "upsell" | "free" | string
  cost_price: number | string | null
  sale_price: number | string | null
  profit?: number | string | null
  name?: string
}

export interface SaleTotalsInput {
  /** sales.sale_price — stored as total (principal + upsells) */
  salePrice: number | string | null
  /** inventory.purchase_price — main product cost */
  mainCost: number | string | null
  /** quantity multiplier (parsed from notes "[Nx ...]") */
  qty?: number
  additionalItems?: AdditionalItem[]
  /** Optional: supplier cost override for the main product */
  supplierCost?: number | string | null
}

export interface SaleTotals {
  valorPrincipal: number
  valorAdicionais: number
  valorTotal: number
  custoPrincipal: number
  custoAdicionais: number
  custoTotal: number
  lucroPrincipal: number
  lucroAdicionais: number
  lucroTotal: number
  margemTotal: number
  quantidadeTotalItens: number
}

export function calcSaleTotals(input: SaleTotalsInput): SaleTotals {
  const {
    salePrice,
    mainCost,
    qty = 1,
    additionalItems = [],
    supplierCost,
  } = input

  const totalSalePrice = Number(salePrice) || 0

  // Upsell items add to the total price; brindes don't
  const valorAdicionais = additionalItems.reduce((sum, item) => {
    return item.type === "upsell" ? sum + (Number(item.sale_price) || 0) : sum
  }, 0)

  const valorPrincipal = totalSalePrice - valorAdicionais

  // Costs
  const costPerUnit = Number(supplierCost ?? mainCost) || 0
  const custoPrincipal = costPerUnit * qty

  const custoAdicionais = additionalItems.reduce((sum, item) => {
    return sum + (Number(item.cost_price) || 0)
  }, 0)

  const custoTotal = custoPrincipal + custoAdicionais

  // Profits — use DB-generated profit if available, fallback to calculation
  const lucroPrincipal = valorPrincipal - custoPrincipal

  const lucroAdicionais = additionalItems.reduce((sum, item) => {
    if (item.profit !== undefined && item.profit !== null) {
      return sum + (Number(item.profit) || 0)
    }
    // fallback
    if (item.type === "upsell") {
      return sum + (Number(item.sale_price) || 0) - (Number(item.cost_price) || 0)
    }
    return sum - (Number(item.cost_price) || 0)
  }, 0)

  const lucroTotal = lucroPrincipal + lucroAdicionais

  const margemTotal = totalSalePrice > 0 ? (lucroTotal / totalSalePrice) * 100 : 0

  const quantidadeTotalItens = 1 + additionalItems.length

  return {
    valorPrincipal,
    valorAdicionais,
    valorTotal: totalSalePrice,
    custoPrincipal,
    custoAdicionais,
    custoTotal,
    lucroPrincipal,
    lucroAdicionais,
    lucroTotal,
    margemTotal,
    quantidadeTotalItens,
  }
}

/** Parse quantity from notes field "[Nx ...]" format */
export function parseQtyFromNotes(notes?: string | null): number {
  const match = (notes || "").match(/^\[(\d+)x/)
  return match ? parseInt(match[1]) : 1
}
