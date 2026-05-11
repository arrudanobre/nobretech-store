import assert from "node:assert/strict"
import {
  buildLedgerBalance,
  calculateAvailableLiquidity,
  calculatePendingBalance,
  calculateReconciledBalance,
} from "./ledger-balance-engine"

const reconciledSale = {
  id: "mov-sale",
  accountId: "account-1",
  movementDate: "2026-05-01",
  createdAt: "2026-05-01T10:00:00.000Z",
  amount: 3200,
  balanceAfter: 999999,
  type: "income",
}

const inventoryPurchase = {
  id: "mov-purchase",
  accountId: "account-1",
  movementDate: "2026-05-02",
  createdAt: "2026-05-02T10:00:00.000Z",
  amount: -1200,
  balanceAfter: 2000,
  type: "expense",
}

const canceledWithdrawal = {
  id: "mov-canceled",
  accountId: "account-1",
  movementDate: "2026-05-03",
  createdAt: "2026-05-03T10:00:00.000Z",
  amount: -500,
  balanceAfter: 1500,
  type: "expense",
  isCanceled: true,
}

const auditReversal = {
  id: "mov-reversal",
  accountId: "account-1",
  movementDate: "2026-05-03",
  createdAt: "2026-05-03T11:00:00.000Z",
  amount: 500,
  balanceAfter: 2500,
  type: "reversal",
  source: "reversal",
  reversalOfId: "mov-canceled",
}

{
  const balance = calculateReconciledBalance([reconciledSale])
  assert.equal(balance, 3200, "venda reconciliada deve aumentar o saldo")
}

{
  const pending = calculatePendingBalance([
    { id: "receivable-1", type: "income", status: "pending", amount: 900 },
    { id: "payable-1", type: "expense", status: "pending", amount: 250 },
    { id: "paid-1", type: "income", status: "reconciled", amount: 1000 },
  ])
  assert.equal(pending.pendingReceivables, 900, "recebível pendente fica separado")
  assert.equal(pending.pendingPayables, 250, "conta pendente fica separada")
  assert.equal(pending.pendingBalance, 650, "pendingBalance deve ser líquido de pendências")
}

{
  const snapshot = buildLedgerBalance({
    movements: [reconciledSale, inventoryPurchase, canceledWithdrawal, auditReversal],
    pendingTransactions: [{ id: "receivable-1", type: "income", status: "pending", amount: 900 }],
    accounts: [{ id: "account-1", name: "Principal", currentBalance: 999 }],
  })

  assert.equal(snapshot.reconciledBalance, 2000, "movimento cancelado e estorno auditável não impactam saldo operacional")
  assert.equal(snapshot.availableLiquidity, 2000, "liquidez disponível não inclui recebíveis pendentes")
  assert.equal(snapshot.pendingBalance, 900, "pendingBalance permanece separado do saldo reconciliado")
  assert.equal(snapshot.cashBalanceSource, "ledger", "ledger deve ser a fonte principal quando houver movimentos")
}

{
  const snapshot = buildLedgerBalance({
    movements: [
      reconciledSale,
      {
        id: "pending-linked-movement",
        accountId: "account-1",
        movementDate: "2026-05-04",
        createdAt: "2026-05-04T10:00:00.000Z",
        amount: 450,
        type: "income",
        source: "account_receivable",
        transactionStatus: "pending",
      },
    ],
    accounts: [{ id: "account-1", name: "Principal", currentBalance: 3200 }],
  })

  assert.equal(snapshot.reconciledBalance, 3200, "movimento vinculado a transação pendente não entra como reconciliado")
}

{
  const snapshot = buildLedgerBalance({
    movements: [reconciledSale, inventoryPurchase],
    accounts: [{ id: "account-1", name: "Principal", currentBalance: 2000 }],
  })

  assert.equal(snapshot.reconciledBalance, 2000, "engine recalcula saldo pela soma ordenada")
  assert.equal(snapshot.balanceAfterIsConsistent, false, "balance_after inconsistente deve ser detectado")
  assert.equal(snapshot.balanceAfterDrift, 996799, "drift de balance_after deve ficar auditável")
}

{
  const snapshot = buildLedgerBalance({
    movements: [reconciledSale],
    accounts: [{ id: "account-1", name: "Principal", currentBalance: -100 }],
  })

  assert.equal(snapshot.reconciledBalance, 3200, "ledger vence finance_accounts stale")
  assert.equal(snapshot.staleAccountBalance, true, "conta stale deve ser sinalizada")
  assert.equal(snapshot.ledgerVsAccountDiff, 3300, "diff ledger vs cache deve ser calculado")
  assert.equal(calculateAvailableLiquidity(snapshot), 3200, "liquidez vem do reconciliado")
}

console.log("ledger-balance-engine tests passed")
