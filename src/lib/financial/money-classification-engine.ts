export type MoneyMovementType =
  | "sale_income"
  | "sale_payment"
  | "inventory_purchase"
  | "operating_expense"
  | "owner_withdrawal"
  | "owner_contribution"
  | "owner_capital_return"
  | "owner_profit_withdrawal"
  | "transfer"
  | "reversal"
  | "tax"
  | "receivable"
  | "payable"
  | "adjustment"
  | "unknown"

export type MoneyFinancialNature =
  | "revenue"
  | "cogs"
  | "expense"
  | "asset_recomposition"
  | "owner_equity"
  | "liability"
  | "cash_transfer"
  | "neutral"
  | "unknown"

export type MoneyOperationalNature =
  | "profit_generation"
  | "inventory_recomposition"
  | "working_capital_protection"
  | "business_expense"
  | "owner_draw"
  | "owner_injection"
  | "cash_movement"
  | "future_cash"
  | "neutral"
  | "unknown"

export type MoneyClassification = {
  movementId?: string
  sourceType?: string | null
  sourceId?: string | null
  movementType: MoneyMovementType
  financialNature: MoneyFinancialNature
  operationalNature: MoneyOperationalNature
  affectsCash: boolean
  affectsProfit: boolean
  affectsWorkingCapital: boolean
  affectsAvailableLiquidity: boolean
  affectsOwnerEquity: boolean
  confidence: number
  reason: string
}

export type MoneyClassificationInput = {
  id?: string | null
  movementId?: string | null
  source?: string | null
  sourceType?: string | null
  source_type?: string | null
  sourceId?: string | null
  source_id?: string | null
  type?: string | null
  status?: string | null
  amount?: string | number | null
  category?: string | null
  description?: string | null
  financialType?: string | null
  financial_type?: string | null
  statementSection?: string | null
  statement_section?: string | null
  affectsCash?: boolean | null
  affects_cash?: boolean | null
  affectsDre?: boolean | null
  affects_dre?: boolean | null
  affectsInventory?: boolean | null
  affects_inventory?: boolean | null
  affectsOwnerEquity?: boolean | null
  affects_owner_equity?: boolean | null
  isCanceled?: boolean | null
  is_canceled?: boolean | null
}

export type MoneyClassificationSnapshot = {
  generatedAt: string
  items: MoneyClassification[]
  totals: {
    byMovementType: Record<MoneyMovementType, number>
    byFinancialNature: Record<MoneyFinancialNature, number>
    byOperationalNature: Record<MoneyOperationalNature, number>
    cashImpact: number
    profitImpact: number
    workingCapitalImpact: number
    availableLiquidityImpact: number
    ownerEquityImpact: number
    uncertainCount: number
  }
  availableOperationalProfitEstimate: {
    amount: number
    confidence: number
    reason: string
  }
}

const MOVEMENT_TYPES: MoneyMovementType[] = [
  "sale_income",
  "sale_payment",
  "inventory_purchase",
  "operating_expense",
  "owner_withdrawal",
  "owner_contribution",
  "owner_capital_return",
  "owner_profit_withdrawal",
  "transfer",
  "reversal",
  "tax",
  "receivable",
  "payable",
  "adjustment",
  "unknown",
]

const FINANCIAL_NATURES: MoneyFinancialNature[] = [
  "revenue",
  "cogs",
  "expense",
  "asset_recomposition",
  "owner_equity",
  "liability",
  "cash_transfer",
  "neutral",
  "unknown",
]

const OPERATIONAL_NATURES: MoneyOperationalNature[] = [
  "profit_generation",
  "inventory_recomposition",
  "working_capital_protection",
  "business_expense",
  "owner_draw",
  "owner_injection",
  "cash_movement",
  "future_cash",
  "neutral",
  "unknown",
]

function emptyTotals<K extends string>(keys: K[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function bool(value: unknown) {
  return value === true
}

function sourceType(input: MoneyClassificationInput) {
  return text(input.sourceType ?? input.source_type ?? input.source) || null
}

function sourceId(input: MoneyClassificationInput) {
  return text(input.sourceId ?? input.source_id) || null
}

function financialType(input: MoneyClassificationInput) {
  return text(input.financialType ?? input.financial_type)
}

function statementSection(input: MoneyClassificationInput) {
  return text(input.statementSection ?? input.statement_section)
}

function affectsInventory(input: MoneyClassificationInput) {
  return bool(input.affectsInventory ?? input.affects_inventory)
}

function affectsOwnerEquity(input: MoneyClassificationInput) {
  return bool(input.affectsOwnerEquity ?? input.affects_owner_equity)
}

function movementId(input: MoneyClassificationInput) {
  return text(input.movementId ?? input.id) || undefined
}

function signedAmount(input: MoneyClassificationInput) {
  const rawAmount = number(input.amount)
  if (rawAmount < 0) return rawAmount
  const amount = Math.abs(rawAmount)
  if (input.type === "expense") return -amount
  return amount
}

function isCancelled(input: MoneyClassificationInput) {
  return text(input.status) === "cancelled" || bool(input.isCanceled ?? input.is_canceled)
}

function isPending(input: MoneyClassificationInput) {
  const status = text(input.status)
  if (!status) return false
  return status !== "reconciled" && status !== "cancelled"
}

function label(input: MoneyClassificationInput) {
  return normalize(`${input.category || ""} ${input.description || ""}`)
}

function hasOwnerContributionSignal(input: MoneyClassificationInput) {
  const value = label(input)
  return input.type === "income" && (
    value.includes("aporte") ||
    value.includes("proprietario") ||
    value.includes("socio") ||
    value.includes("investimento")
  )
}

function hasOwnerWithdrawalSignal(input: MoneyClassificationInput) {
  const value = label(input)
  return input.type === "expense" && (
    value.includes("retirada") ||
    value.includes("pro labore") ||
    value.includes("salario") ||
    value.includes("socio") ||
    value.includes("reembolso de aporte")
  )
}

function hasInventorySignal(input: MoneyClassificationInput) {
  const value = label(input)
  return value.includes("compra de estoque") ||
    value.includes("estoque") ||
    value.includes("pecas") ||
    value.includes("acessorios")
}

function hasOperatingExpenseSignal(input: MoneyClassificationInput) {
  const value = label(input)
  return value.includes("marketing") ||
    value.includes("trafego") ||
    value.includes("meta ads") ||
    value.includes("internet") ||
    value.includes("embalagem") ||
    value.includes("embalagens") ||
    value.includes("frete") ||
    value.includes("mensalidade") ||
    value.includes("ferramenta") ||
    value.includes("sistema") ||
    value.includes("vercel") ||
    value.includes("banco de dados") ||
    value.includes("contador") ||
    value.includes("energia") ||
    value.includes("celular")
}

function base(input: MoneyClassificationInput, classification: Omit<MoneyClassification, "movementId" | "sourceType" | "sourceId">): MoneyClassification {
  return {
    movementId: movementId(input),
    sourceType: sourceType(input),
    sourceId: sourceId(input),
    ...classification,
    confidence: Math.max(0, Math.min(1, classification.confidence)),
  }
}

export function classifySaleIncome(input: MoneyClassificationInput): MoneyClassification {
  const type = sourceType(input) === "sale_payment" ? "sale_payment" : "sale_income"

  return base(input, {
    movementType: type,
    financialNature: "revenue",
    operationalNature: "profit_generation",
    affectsCash: !isPending(input),
    affectsProfit: true,
    affectsWorkingCapital: true,
    affectsAvailableLiquidity: !isPending(input),
    affectsOwnerEquity: false,
    confidence: type === "sale_payment" ? 0.92 : 0.88,
    reason: "Recebimento de venda classificado como geração de resultado; recomposição por SKU/bundle será calculada pela Real Profit Engine.",
  })
}

export function classifyMoneyMovement(input: MoneyClassificationInput): MoneyClassification {
  const source = sourceType(input)
  const fType = financialType(input)
  const section = statementSection(input)

  if (input.type === "reversal" || source === "reversal") {
    return base(input, {
      movementType: "reversal",
      financialNature: "neutral",
      operationalNature: "neutral",
      affectsCash: false,
      affectsProfit: false,
      affectsWorkingCapital: false,
      affectsAvailableLiquidity: false,
      affectsOwnerEquity: false,
      confidence: 0.98,
      reason: "Estorno/reversão é linha auditável e não deve ser tratado como dinheiro operacional normal.",
    })
  }

  if (isCancelled(input)) {
    return base(input, {
      movementType: "unknown",
      financialNature: "neutral",
      operationalNature: "neutral",
      affectsCash: false,
      affectsProfit: false,
      affectsWorkingCapital: false,
      affectsAvailableLiquidity: false,
      affectsOwnerEquity: false,
      confidence: 0.95,
      reason: "Movimento cancelado permanece auditável, mas não impacta caixa, lucro ou liquidez disponível.",
    })
  }

  if (isPending(input)) {
    const receivable = input.type === "income"
    return base(input, {
      movementType: receivable ? "receivable" : "payable",
      financialNature: receivable ? "revenue" : "liability",
      operationalNature: "future_cash",
      affectsCash: false,
      affectsProfit: false,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: false,
      affectsOwnerEquity: false,
      confidence: 0.9,
      reason: receivable
        ? "Recebível pendente representa caixa futuro e não aumenta liquidez disponível."
        : "Pagável pendente representa compromisso futuro e não reduz liquidez disponível até reconciliação.",
    })
  }

  if (source === "inventory_purchase" || source === "purchase" || fType === "inventory_asset" || affectsInventory(input)) {
    return base(input, {
      movementType: "inventory_purchase",
      financialNature: "asset_recomposition",
      operationalNature: "inventory_recomposition",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: false,
      confidence: source === "inventory_purchase" || source === "purchase" || fType === "inventory_asset" ? 0.96 : 0.78,
      reason: "Compra de estoque recompõe ativo operacional; não é despesa operacional pura.",
    })
  }

  if (source === "owner_capital_return" || fType === "owner_capital_return" || section === "owner_capital_return") {
    return base(input, {
      movementType: "owner_capital_return",
      financialNature: "owner_equity",
      operationalNature: "owner_draw",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: true,
      confidence: 0.98,
      reason: "Devolução de aporte reduz capital do proprietário na operação; não é despesa nem retirada de lucro.",
    })
  }

  if (source === "owner_profit_withdrawal" || fType === "owner_profit_withdrawal" || section === "owner_profit_withdrawal") {
    return base(input, {
      movementType: "owner_profit_withdrawal",
      financialNature: "owner_equity",
      operationalNature: "owner_draw",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: true,
      confidence: 0.98,
      reason: "Retirada de lucro do proprietário reduz lucro disponível para nova retirada, sem ser despesa operacional.",
    })
  }

  if (affectsOwnerEquity(input) || fType === "owner_equity" || section === "equity" || hasOwnerContributionSignal(input) || hasOwnerWithdrawalSignal(input)) {
    const contribution = input.type === "income" || hasOwnerContributionSignal(input)
    return base(input, {
      movementType: contribution ? "owner_contribution" : "owner_withdrawal",
      financialNature: "owner_equity",
      operationalNature: contribution ? "owner_injection" : "owner_draw",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: true,
      confidence: affectsOwnerEquity(input) || fType === "owner_equity" ? 0.96 : 0.78,
      reason: contribution
        ? "Aporte do dono aumenta caixa, mas não é receita operacional."
        : "Retirada do dono reduz caixa, mas não reduz lucro operacional.",
    })
  }

  if (fType === "transfer" || section === "transfer") {
    return base(input, {
      movementType: "transfer",
      financialNature: "cash_transfer",
      operationalNature: "cash_movement",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: false,
      affectsAvailableLiquidity: false,
      affectsOwnerEquity: false,
      confidence: 0.94,
      reason: "Transferência movimenta caixa entre contas, sem representar receita ou despesa.",
    })
  }

  if (fType === "tax") {
    return base(input, {
      movementType: "tax",
      financialNature: "expense",
      operationalNature: "business_expense",
      affectsCash: true,
      affectsProfit: true,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: false,
      confidence: 0.95,
      reason: "Imposto/taxa afeta caixa e resultado operacional.",
    })
  }

  if (source === "sale_payment") return classifySaleIncome(input)

  if (
    source === "sale" ||
    fType === "revenue" ||
    (source === "account_receivable" && input.type === "income" && normalize(input.category).includes("venda"))
  ) {
    return classifySaleIncome(input)
  }

  if (input.type === "adjustment" || source === "manual_balance_adjustment" || fType === "adjustment" || section === "adjustment") {
    return base(input, {
      movementType: "adjustment",
      financialNature: "neutral",
      operationalNature: "neutral",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: false,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: false,
      confidence: 0.9,
      reason: "Ajuste manual corrige caixa auditável, mas não representa resultado operacional.",
    })
  }

  if (
    fType === "operating_expense" ||
    fType === "financial_expense" ||
    fType === "deduction" ||
    fType === "cogs" ||
    hasOperatingExpenseSignal(input)
  ) {
    return base(input, {
      movementType: "operating_expense",
      financialNature: fType === "cogs" ? "cogs" : "expense",
      operationalNature: "business_expense",
      affectsCash: input.type !== "none",
      affectsProfit: true,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: input.type !== "none",
      affectsOwnerEquity: false,
      confidence: fType ? 0.9 : 0.72,
      reason: "Despesa de negócio classificada pelo plano de contas ou sinais operacionais.",
    })
  }

  if (hasInventorySignal(input) && input.type === "expense") {
    return base(input, {
      movementType: "inventory_purchase",
      financialNature: "asset_recomposition",
      operationalNature: "inventory_recomposition",
      affectsCash: true,
      affectsProfit: false,
      affectsWorkingCapital: true,
      affectsAvailableLiquidity: true,
      affectsOwnerEquity: false,
      confidence: 0.68,
      reason: "Categoria sugere compra/recomposição de estoque; classificada fora de despesa operacional comum.",
    })
  }

  return base(input, {
    movementType: "unknown",
    financialNature: "unknown",
    operationalNature: "unknown",
    affectsCash: false,
    affectsProfit: false,
    affectsWorkingCapital: false,
    affectsAvailableLiquidity: false,
    affectsOwnerEquity: false,
    confidence: 0.2,
    reason: "Dados insuficientes para classificar a natureza financeira com segurança.",
  })
}

export function classifyTransaction(input: MoneyClassificationInput): MoneyClassification {
  return classifyMoneyMovement(input)
}

export function classifyLedgerMovement(input: MoneyClassificationInput): MoneyClassification {
  return classifyMoneyMovement(input)
}

export function buildMoneyClassificationSnapshot(input: {
  movements?: MoneyClassificationInput[]
  transactions?: MoneyClassificationInput[]
}): MoneyClassificationSnapshot {
  const sourceItems = [...(input.movements || []), ...(input.transactions || [])]
  const items = sourceItems.map(classifyMoneyMovement)
  const totals = {
    byMovementType: emptyTotals(MOVEMENT_TYPES),
    byFinancialNature: emptyTotals(FINANCIAL_NATURES),
    byOperationalNature: emptyTotals(OPERATIONAL_NATURES),
    cashImpact: 0,
    profitImpact: 0,
    workingCapitalImpact: 0,
    availableLiquidityImpact: 0,
    ownerEquityImpact: 0,
    uncertainCount: 0,
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const inputItem = sourceItems[index]
    const amount = signedAmount(inputItem)

    totals.byMovementType[item.movementType] = roundCurrency(totals.byMovementType[item.movementType] + amount)
    totals.byFinancialNature[item.financialNature] = roundCurrency(totals.byFinancialNature[item.financialNature] + amount)
    totals.byOperationalNature[item.operationalNature] = roundCurrency(totals.byOperationalNature[item.operationalNature] + amount)
    if (item.affectsCash) totals.cashImpact = roundCurrency(totals.cashImpact + amount)
    if (item.affectsProfit) totals.profitImpact = roundCurrency(totals.profitImpact + amount)
    if (item.affectsWorkingCapital) totals.workingCapitalImpact = roundCurrency(totals.workingCapitalImpact + amount)
    if (item.affectsAvailableLiquidity) totals.availableLiquidityImpact = roundCurrency(totals.availableLiquidityImpact + amount)
    if (item.affectsOwnerEquity) totals.ownerEquityImpact = roundCurrency(totals.ownerEquityImpact + amount)
    if (item.confidence < 0.7 || item.movementType === "unknown") totals.uncertainCount += 1
  }

  const estimateAmount = Math.max(0, roundCurrency(totals.profitImpact))

  return {
    generatedAt: new Date().toISOString(),
    items,
    totals,
    availableOperationalProfitEstimate: {
      amount: estimateAmount,
      confidence: items.length ? 0.58 : 0.2,
      reason: "Estimativa operacional: ainda não separa recomposição vs lucro real por SKU/bundle. A separação exata fica para a Real Profit Engine.",
    },
  }
}
