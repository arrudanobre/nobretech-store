export type InventoryLiquidityQualityLevel = "healthy" | "attention" | "stressed" | "insufficient_data"
export type EstimatedInventoryLiquidity = "low" | "medium" | "high"

export type InventoryLiquidityQualityItem = {
  id?: string | null
  name?: string | null
  category?: string | null
  cost?: number | string | null
  purchasePrice?: number | string | null
  suggestedPrice?: number | string | null
  quantity?: number | string | null
  daysInStock?: number | string | null
  estimatedLiquidity?: EstimatedInventoryLiquidity | null
}

export type InventoryLiquidityQuality = {
  inventoryQuality: InventoryLiquidityQualityLevel
  averageMarginPct: number
  averageDaysInStock: number
  lowLiquidityCount: number
  lowMarginCount: number
  agingHighCount: number
  premiumHealthyCount: number
  pressureScore: number
  confidenceImpact: "none" | "light" | "medium" | "strong"
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

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function qty(item: InventoryLiquidityQualityItem) {
  return Math.max(1, positive(item.quantity) || 1)
}

function cost(item: InventoryLiquidityQualityItem) {
  return positive(item.cost ?? item.purchasePrice)
}

function price(item: InventoryLiquidityQualityItem) {
  return positive(item.suggestedPrice)
}

function marginPct(item: InventoryLiquidityQualityItem) {
  const salePrice = price(item)
  if (salePrice <= 0) return 0
  return ((salePrice - cost(item)) / salePrice) * 100
}

function liquidityFor(item: InventoryLiquidityQualityItem): EstimatedInventoryLiquidity {
  if (item.estimatedLiquidity) return item.estimatedLiquidity
  const days = positive(item.daysInStock)
  if (days >= 75) return "low"
  if (days >= 45) return "medium"
  return "high"
}

function isPremiumHealthy(item: InventoryLiquidityQualityItem) {
  return price(item) >= 4500
    && marginPct(item) >= 10
    && positive(item.daysInStock) < 45
    && liquidityFor(item) !== "low"
}

export function buildInventoryLiquidityQuality(input: {
  items?: InventoryLiquidityQualityItem[] | null
}): InventoryLiquidityQuality {
  const items = input.items || []
  if (!items.length) {
    return {
      inventoryQuality: "insufficient_data",
      averageMarginPct: 0,
      averageDaysInStock: 0,
      lowLiquidityCount: 0,
      lowMarginCount: 0,
      agingHighCount: 0,
      premiumHealthyCount: 0,
      pressureScore: 0,
      confidenceImpact: "light",
      warnings: ["Sem estoque ativo estruturado para avaliar qualidade de liquidez."],
      reasoning: ["Sem itens ativos informados; qualidade de estoque não deve ser inferida por caixa."],
    }
  }

  let weightedMargin = 0
  let weightedDays = 0
  let units = 0
  let lowLiquidityCount = 0
  let lowMarginCount = 0
  let agingHighCount = 0
  let premiumHealthyCount = 0

  for (const item of items) {
    const itemQty = qty(item)
    const itemMargin = marginPct(item)
    const days = positive(item.daysInStock)
    weightedMargin += itemMargin * itemQty
    weightedDays += days * itemQty
    units += itemQty

    if (liquidityFor(item) === "low") lowLiquidityCount += 1
    if (itemMargin < 8) lowMarginCount += 1
    if (days >= 75) agingHighCount += 1
    if (isPremiumHealthy(item)) premiumHealthyCount += 1
  }

  const averageMarginPct = units ? round(weightedMargin / units, 2) : 0
  const averageDaysInStock = units ? round(weightedDays / units, 1) : 0
  const stressedItems = items.filter((item) => (
    positive(item.daysInStock) >= 75
    && marginPct(item) < 8
    && liquidityFor(item) === "low"
  )).length
  const pressureScore = round(Math.min(1, (
    stressedItems * 0.45
    + agingHighCount * 0.18
    + lowMarginCount * 0.18
    + lowLiquidityCount * 0.12
  ) / Math.max(1, items.length)), 2)
  const inventoryQuality: InventoryLiquidityQualityLevel = stressedItems > 0 || pressureScore >= 0.55
    ? "stressed"
    : pressureScore >= 0.28
      ? "attention"
      : "healthy"
  const confidenceImpact = inventoryQuality === "stressed"
    ? "strong"
    : inventoryQuality === "attention"
      ? "light"
      : "none"
  const warnings: string[] = []
  if (inventoryQuality === "stressed") warnings.push("Estoque com aging alto, margem baixa e baixa liquidez reduz confiança financeira.")
  const reasoning = [
    inventoryQuality === "healthy"
      ? "Estoque ativo com qualidade saudável; capital acima do caixa representa alocação operacional, não risco automático."
      : inventoryQuality === "attention"
        ? "Estoque pede acompanhamento, mas não derruba confiança sem combinação crítica de aging, margem e liquidez."
        : "Estoque pressiona confiança porque combina aging alto, margem baixa e baixa liquidez.",
  ]
  if (premiumHealthyCount > 0) reasoning.push("Itens premium saudáveis não reduzem confiança apenas por terem ticket alto.")

  return {
    inventoryQuality,
    averageMarginPct,
    averageDaysInStock,
    lowLiquidityCount,
    lowMarginCount,
    agingHighCount,
    premiumHealthyCount,
    pressureScore,
    confidenceImpact,
    warnings,
    reasoning,
  }
}
