import {
  calculateReconciledBalance,
  getActiveLedgerMovements as selectActiveLedgerMovements,
  type LedgerMovementInput,
} from "@/lib/financial/ledger-balance-engine"
import {
  classifyTransaction,
  type MoneyClassification,
  type MoneyClassificationInput,
} from "@/lib/financial/money-classification-engine"
import {
  getInventoryCapitalValue as getInventoryCapitalValueFromCosting,
  getInventoryQuantity as getInventoryQuantityFromCosting,
  getInventoryUnitCost as getInventoryUnitCostFromCosting,
} from "@/lib/inventory/costing"

export {
  buildLedgerBalance,
  buildLedgerSnapshot,
  calculateAvailableLiquidity,
  calculatePendingBalance,
  calculateReconciledBalance,
  logLedgerDebug,
  syncAccountBalanceFromLedger,
  type LedgerAccountInput,
  type LedgerBalance,
  type LedgerDbClient,
  type LedgerMovementInput,
  type LedgerSnapshot,
  type PendingTransactionInput,
} from "@/lib/financial/ledger-balance-engine"
export {
  buildRealProfitAnalysis,
  buildRealProfitSnapshot,
  type NegativeSaleEvidence,
  type ProfitabilityLevel,
  type RealProfitAnalysis,
  type RealProfitItemInput,
  type RealProfitLiquidityQuality,
  type RealProfitPaymentInput,
  type RealProfitRevenueSource,
  type RealProfitSaleInput,
  type RealProfitSnapshot,
} from "@/lib/financial/real-profit-engine"
export {
  buildMoneyClassificationSnapshot,
  classifyLedgerMovement,
  classifyMoneyMovement,
  classifySaleIncome,
  classifyTransaction,
  type MoneyClassification,
  type MoneyClassificationInput,
  type MoneyClassificationSnapshot,
  type MoneyFinancialNature,
  type MoneyMovementType,
  type MoneyOperationalNature,
} from "@/lib/financial/money-classification-engine"
export {
  buildProfitAvailabilitySnapshot,
  resolveProfitAvailabilityPeriod,
  type PartiallyTracedSale,
  type ProfitAvailabilityPeriod,
  type ProfitAvailabilitySaleInput,
  type ProfitAvailabilitySnapshot,
  type ProfitAvailabilityTransactionInput,
  type ProfitPeriodPreset,
  type ResolveProfitAvailabilityPeriodInput,
} from "@/lib/financial/profit-availability-engine"
export {
  buildOwnerCapitalSnapshot,
  type AmbiguousOwnerMovement,
  type OwnerCapitalMovementInput,
  type OwnerCapitalReturnMovement,
  type OwnerCapitalReturnWithoutTrackedContribution,
  type OwnerCapitalSnapshot,
  type OwnerContributionMovement,
  type OwnerProfitWithdrawalMovement,
} from "@/lib/financial/owner-capital-engine"
export {
  desiredMovementSource,
  recalculateAllMovementBalances,
  reverseMovementForDeletedTransaction,
  syncTransactionMovement,
} from "@/lib/finance/sync-transaction-movement"
export {
  getInventoryCapitalValue,
  getInventoryCostBreakdown,
  getInventoryQuantity,
  getInventoryUnitCost,
  type InventoryCostingItem,
} from "@/lib/inventory/costing"

export type TransactionLike = MoneyClassificationInput & {
  sale_status?: string | null
}

export type LedgerMovementLike = LedgerMovementInput

export type SaleLike = {
  sale_status?: string | null
  status?: string | null
  source_type?: string | null
  sourceType?: string | null
}

const RECONCILED_STATUSES = new Set(["reconciled", "paid", "received"])
const CANCELED_STATUSES = new Set(["cancelled", "canceled", "voided", "estornado", "estornada", "reversed"])
const VALID_COMMERCIAL_SALE_STATUSES = new Set(["completed", "sold", "paid", "closed"])
const OWNER_EQUITY_MOVEMENT_TYPES = new Set([
  "owner_withdrawal",
  "owner_contribution",
  "owner_capital_return",
  "owner_profit_withdrawal",
])

function text(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function readSourceType(entry: TransactionLike) {
  return normalize(entry.source_type ?? entry.sourceType ?? entry.source)
}

function readStatus(entry: { status?: string | null }) {
  return normalize(entry.status)
}

function classifyEntry(entry: TransactionLike): MoneyClassification {
  return classifyTransaction(entry)
}

export function getActiveLedgerMovements(movements: LedgerMovementLike[]) {
  return selectActiveLedgerMovements(movements)
}

export function isActiveLedgerMovement(movement: LedgerMovementLike) {
  return selectActiveLedgerMovements([movement]).length === 1
}

export function getLatestOfficialBalance(movements: LedgerMovementLike[]) {
  const activeMovements = selectActiveLedgerMovements(movements)
  const latestWithBalance = [...activeMovements]
    .reverse()
    .find((movement) => movement.balanceAfter != null || movement.balance_after != null)

  if (latestWithBalance) {
    return roundCurrency(number(latestWithBalance.balanceAfter ?? latestWithBalance.balance_after))
  }

  return calculateReconciledBalance(activeMovements)
}

export function isPendingTransaction(transaction: TransactionLike) {
  const status = readStatus(transaction)
  return !RECONCILED_STATUSES.has(status) && !CANCELED_STATUSES.has(status)
}

export function isReconciledTransaction(transaction: TransactionLike) {
  return RECONCILED_STATUSES.has(readStatus(transaction))
}

export function isCanceledTransaction(transaction: TransactionLike) {
  return CANCELED_STATUSES.has(readStatus(transaction))
}

export function isSalePaymentTransaction(transaction: TransactionLike) {
  return readSourceType(transaction) === "sale_payment"
}

export function isValidCommercialSale(sale: SaleLike) {
  const status = normalize(sale.sale_status ?? sale.status)
  return VALID_COMMERCIAL_SALE_STATUSES.has(status)
}

// Origens de venda que contam como evento comercial no dashboard.
// "own" = estoque próprio; "supplier" = venda intermediada (item de fornecedor,
// custo via supplier_cost, margem da Nobretech). Ambas são vendas comerciais.
export const COMMERCIAL_SALE_SOURCE_TYPES = new Set(["own", "supplier"])

export function isCommercialSaleSource(sourceType?: string | null) {
  return COMMERCIAL_SALE_SOURCE_TYPES.has(normalize(sourceType) || "own")
}

// Reconhecimento comercial unificado: origem comercial + status concluído.
// Conta a venda como evento único (independe de split/conciliação financeira).
export function isCommercialSale(sale: SaleLike) {
  const status = normalize(sale.sale_status ?? sale.status) || "completed"
  return isCommercialSaleSource(sale.source_type ?? sale.sourceType)
    && VALID_COMMERCIAL_SALE_STATUSES.has(status)
}

export function isInventoryAssetTransaction(transaction: TransactionLike) {
  return classifyEntry(transaction).movementType === "inventory_purchase"
}

export function shouldAffectOperationalDre(entry: TransactionLike) {
  const classification = classifyEntry(entry)
  return classification.affectsProfit
    && classification.financialNature !== "asset_recomposition"
    && classification.financialNature !== "owner_equity"
}

export function isProfitWithdrawal(entry: TransactionLike) {
  return classifyEntry(entry).movementType === "owner_profit_withdrawal"
}

export function isOwnerCapitalReimbursement(entry: TransactionLike) {
  return classifyEntry(entry).movementType === "owner_capital_return"
}

export function isOwnerEquityMovement(entry: TransactionLike) {
  const classification = classifyEntry(entry)
  return classification.affectsOwnerEquity || OWNER_EQUITY_MOVEMENT_TYPES.has(classification.movementType)
}

export type FinanceSourceOfTruthValidationCase = {
  name: string
  passed: boolean
}

export function validateFinanceSourceOfTruthRules() {
  const cases: FinanceSourceOfTruthValidationCase[] = [
    {
      name: "sale_payment reconciled is reconciled sale payment",
      passed: isSalePaymentTransaction({ source_type: "sale_payment", status: "reconciled" })
        && isReconciledTransaction({ source_type: "sale_payment", status: "reconciled" }),
    },
    {
      name: "sale_payment pending is pending sale payment",
      passed: isSalePaymentTransaction({ source_type: "sale_payment", status: "pending" })
        && isPendingTransaction({ source_type: "sale_payment", status: "pending" }),
    },
    {
      name: "inventory_purchase pending is payable, not inventory asset yet",
      passed: isPendingTransaction({ source_type: "inventory_purchase", status: "pending", type: "expense" })
        && !isInventoryAssetTransaction({ source_type: "inventory_purchase", status: "pending", type: "expense" }),
    },
    {
      name: "inventory_purchase reconciled is inventory asset",
      passed: isInventoryAssetTransaction({ source_type: "inventory_purchase", status: "reconciled", type: "expense" })
        && !shouldAffectOperationalDre({ source_type: "inventory_purchase", status: "reconciled", type: "expense" }),
    },
    {
      name: "canceled ledger movement is inactive",
      passed: !isActiveLedgerMovement({ amount: 100, is_canceled: true }),
    },
    {
      name: "profit withdrawal is owner equity movement",
      passed: isProfitWithdrawal({ source_type: "owner_profit_withdrawal", status: "reconciled", type: "expense" })
        && isOwnerEquityMovement({ source_type: "owner_profit_withdrawal", status: "reconciled", type: "expense" }),
    },
    {
      name: "capital reimbursement is not profit withdrawal",
      passed: isOwnerCapitalReimbursement({ source_type: "owner_capital_return", status: "reconciled", type: "expense" })
        && !isProfitWithdrawal({ source_type: "owner_capital_return", status: "reconciled", type: "expense" }),
    },
    {
      name: "completed sale is valid commercial sale",
      passed: isValidCommercialSale({ sale_status: "completed" }),
    },
    {
      name: "cancelled sale is not valid commercial sale",
      passed: !isValidCommercialSale({ sale_status: "cancelled" }),
    },
    {
      name: "inventory costing keeps unit cost and capital value separated",
      passed: getInventoryUnitCostFromCosting({ purchase_price: 38.49, quantity: 3 }) === 38.49
        && getInventoryQuantityFromCosting({ purchase_price: 38.49, quantity: 3 }) === 3
        && getInventoryCapitalValueFromCosting({ purchase_price: 38.49, quantity: 3 }) === 115.47,
    },
  ]

  return {
    passed: cases.every((item) => item.passed),
    cases,
  }
}
