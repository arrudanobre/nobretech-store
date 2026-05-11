import type { RealProfitSnapshot } from "./real-profit-engine"
import type { InventoryLiquidityQuality, InventoryLiquidityQualityItem } from "./inventory-liquidity-quality"

export type FinancialScenarioConfidence = "low" | "medium" | "high"

export type FinancialScenarioSnapshot = {
  realizedProfit: number
  realizedProfitAfterBills: number
  projectedInventoryProfit: number
  projectedOperationalScenario: number
  inventoryPotentialValue: number
  realizedLiquidity: number
  projectedLiquidity: number
  inventoryBackedCapital: number
  scenarioConfidence: FinancialScenarioConfidence
  warnings: string[]
  reasoning: string[]
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function positive(value: unknown) {
  return Math.max(0, number(value))
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function itemCost(item: InventoryLiquidityQualityItem) {
  return positive(item.cost ?? item.purchasePrice)
}

function itemPrice(item: InventoryLiquidityQualityItem) {
  return positive(item.suggestedPrice)
}

function itemQty(item: InventoryLiquidityQualityItem) {
  return Math.max(1, positive(item.quantity) || 1)
}

export function buildFinancialScenarioSnapshot(input: {
  realProfitSnapshot?: RealProfitSnapshot | null
  activeInventoryItems?: InventoryLiquidityQualityItem[] | null
  availableLiquidity?: number | string | null
  pendingReceivables?: number | string | null
  upcomingBills30d?: number | string | null
  inventoryLiquidityQuality?: InventoryLiquidityQuality | null
}): FinancialScenarioSnapshot {
  const warnings: string[] = []
  const reasoning: string[] = []
  const realProfit = input.realProfitSnapshot || null
  const realizedProfit = roundCurrency(positive(realProfit?.realizedProfitFromSales ?? realProfit?.availableProfit))
  const upcomingBills30d = positive(input.upcomingBills30d)
  const realizedProfitAfterBills = roundCurrency(realizedProfit - upcomingBills30d)
  const items = input.activeInventoryItems || []
  const inventoryBackedCapital = roundCurrency(items.reduce((sum, item) => sum + itemCost(item) * itemQty(item), 0))
  const inventoryPotentialValue = roundCurrency(items.reduce((sum, item) => sum + itemPrice(item) * itemQty(item), 0))
  const projectedInventoryProfit = roundCurrency(items.reduce((sum, item) => {
    const projected = Math.max(0, itemPrice(item) - itemCost(item))
    return sum + projected * itemQty(item)
  }, 0))
  const realizedLiquidity = roundCurrency(positive(input.availableLiquidity))
  const projectedLiquidity = roundCurrency(realizedLiquidity + positive(input.pendingReceivables))
  const projectedOperationalScenario = roundCurrency(realizedProfit + projectedInventoryProfit)
  const inventoryQuality = input.inventoryLiquidityQuality?.inventoryQuality || "insufficient_data"

  reasoning.push("Lucro realizado usa apenas lucro rastreado em vendas, sem estoque ativo ou margem potencial futura.")
  reasoning.push("Lucro projetado de estoque fica separado como cenário operacional e não entra em saque ou sobra após contas.")
  if (projectedInventoryProfit > 0) {
    reasoning.push("Estoque ativo possui potencial operacional, mas não é lucro disponível até venda realizada.")
  }
  if (realizedProfitAfterBills < 0) warnings.push("Lucro realizado ainda não cobre integralmente as contas próximas.")
  if ((realProfit?.negativeSales?.length || 0) > 0) warnings.push("Há venda com prejuízo real rastreado.")
  if (inventoryQuality === "stressed") warnings.push("Qualidade de liquidez do estoque reduz confiança do cenário projetado.")

  let scenarioConfidence: FinancialScenarioConfidence = "high"
  if (inventoryQuality === "stressed" || (realProfit?.negativeSales?.length || 0) > 0) scenarioConfidence = "medium"
  if (!realProfit || realProfit.sales.length === 0) scenarioConfidence = "low"

  return {
    realizedProfit,
    realizedProfitAfterBills,
    projectedInventoryProfit,
    projectedOperationalScenario,
    inventoryPotentialValue,
    realizedLiquidity,
    projectedLiquidity,
    inventoryBackedCapital,
    scenarioConfidence,
    warnings,
    reasoning,
  }
}
