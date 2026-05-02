import type { PoolClient } from "pg"

/**
 * Extrato / transactions sync — regras ao editar uma conta já conciliada:
 *
 * - Valor, data, conta financeira (account_id), categoria, descrição, método: o movimento ativo
 *   (source account_payable | account_receivable, source_id = transactions.id) é atualizado in-place;
 *   em seguida balance_after de todos os movimentos da empresa é recalculado (janela global por company_id).
 *
 * - Status deixa de ser reconciliado (ou account_id removido): gera-se linha type=reversal (auditoria),
 *   o movimento econômico original fica is_canceled; saldo do extrato permanece coerente pela soma dos
 *   amount (+ estorno). balance_after é recalculado para todo o histórico.
 *
 * - Nova baixa após estorno: o movimento antigo continua cancelado; insere-se novo movimento ativo com o
 *   mesmo source_id (índice único só aplica a linhas com is_canceled = false).
 *
 * A UI oficial do saldo continua sendo a soma ordenada dos amount; balance_after no banco espelha essa
 * mesma ordem (movement_date, created_at, id) para auditoria.
 *
 * --- Regra sale vs account_receivable (uma única entrada de caixa por evento) ---
 *
 * - O extrato deve refletir o dinheiro que entrou/saiu da conta. Para vendas, o vínculo contábil é a linha
 *   em `transactions` (recebimento conciliado). O movimento no extrato usa source = account_receivable e
 *   source_id = transactions.id (nunca duplicar o mesmo recebimento com source = sale na mesma chave).
 * - À vista no ato: um único lançamento reconciliado → um único movimento (account_receivable).
 * - Parcelado / recebimento futuro: cada parcela reconciliada é uma transactions (ou a mesma evoluindo) —
 *   cada uma gera no máximo um movimento ativo; o índice único (company_id, source_id) em linhas ativas
 *   impede dois movimentos para o mesmo id de transação.
 * - Legado: se existir movimento source = sale com source_id = sales.id (antigo), o sync reponta para
 *   account_receivable + source_id = transactions.id para não somar duas vezes o mesmo caixa.
 * - Não criar novos movimentos com source = sale enquanto esta política estiver ativa; reservas vendas
 *   automáticas ficam fora até integração explícita.
 */

type TxRow = {
  id: string
  company_id: string | null
  account_id: string | null
  type: string
  category: string
  description: string | null
  amount: string | number
  date: Date | string
  payment_method: string | null
  status: string | null // pending | reconciled | cancelled
  source_type: string | null
  source_id: string | null
}

const MIGRATABLE_SOURCES = new Set([
  "manual_expense",
  "manual_entry",
  "sale",
  "account_payable",
  "account_receivable",
])

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
}

export function desiredMovementSource(tx: TxRow): "account_payable" | "account_receivable" | null {
  if (tx.type === "expense" && tx.source_type === "inventory_purchase") return null
  if (tx.type === "expense") return "account_payable"
  if (tx.type === "income") return "account_receivable"
  return null
}

function movementAmount(tx: TxRow): number {
  const raw = Number(tx.amount || 0)
  if (tx.type === "expense") return -Math.abs(raw)
  return Math.abs(raw)
}

/** Recalcula balance_after para todos os movimentos (partição por company_id, mesma ordem do extrato). */
export async function recalculateAllMovementBalances(client: PoolClient) {
  await client.query(`
    WITH ordered_movements AS (
      SELECT
        id,
        SUM(amount) OVER (
          PARTITION BY company_id
          ORDER BY movement_date ASC, created_at ASC, id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_balance
      FROM financial_account_movements
    )
    UPDATE financial_account_movements movement
    SET balance_after = ordered_movements.running_balance
    FROM ordered_movements
    WHERE movement.id = ordered_movements.id
  `)
}

async function reverseAccountPayableReceivable(
  client: PoolClient,
  companyId: string,
  transactionId: string,
  reason: string,
  createdBy: string | null
) {
  const res = await client.query(
    `SELECT * FROM financial_account_movements
     WHERE company_id IS NOT DISTINCT FROM $1::uuid
       AND source_id = $2::uuid
       AND source IN ('account_payable', 'account_receivable')
       AND COALESCE(is_canceled, false) = false
       AND type <> 'reversal'`,
    [companyId, transactionId]
  )
  for (const orig of res.rows) {
    const reversalAmount = -Number(orig.amount || 0)
    const desc = `Estorno de: ${orig.description || orig.category || "movimento"}`
    await client.query(
      `INSERT INTO financial_account_movements (
        company_id, account_id, movement_date, type, category, description,
        amount, balance_after, payment_method, source, source_id, notes,
        reversal_of_id, created_by
      ) VALUES (
        $1, $2, CURRENT_DATE, 'reversal', 'Estorno', $3,
        $4, 0, $5, 'reversal', $6::uuid, $7, $8::uuid, $9
      )`,
      [
        orig.company_id,
        orig.account_id,
        desc,
        reversalAmount,
        orig.payment_method || null,
        orig.id,
        reason,
        orig.id,
        createdBy,
      ]
    )
    await client.query(
      `UPDATE financial_account_movements
       SET is_canceled = TRUE, canceled_at = NOW(), canceled_reason = $2, updated_at = NOW()
       WHERE id = $1::uuid`,
      [orig.id, reason]
    )
  }
}

async function syncInventoryPurchaseMovement(client: PoolClient, tx: TxRow) {
  if (!tx.company_id || !tx.source_id) return { ok: false as const, error: "Compra de estoque sem vínculo de origem" }

  const reconciled = tx.status === "reconciled"
  const movementDate = toDateOnly(tx.date)
  const amount = -Math.abs(Number(tx.amount || 0))
  const description = (tx.description || tx.category || "Compra de estoque").trim()

  const existing = await client.query(
    `SELECT id FROM financial_account_movements
     WHERE company_id IS NOT DISTINCT FROM $1::uuid
       AND source = 'purchase'
       AND source_id IN ($2::uuid, $3::uuid)
       AND COALESCE(is_canceled, false) = false
       AND type <> 'reversal'
     LIMIT 1`,
    [tx.company_id, tx.source_id, tx.id]
  )
  const existingId = existing.rows[0]?.id

  if (!reconciled) {
    if (existingId) {
      await client.query(
        `UPDATE financial_account_movements
         SET is_canceled = TRUE, canceled_at = NOW(), canceled_reason = 'Compra de estoque desconciliada', updated_at = NOW()
         WHERE id = $1::uuid`,
        [existingId]
      )
    }
    await recalculateAllMovementBalances(client)
    return { ok: true as const, action: "inventory_purchase_unlinked" as const }
  }

  if (existingId) {
    await client.query(
      `UPDATE financial_account_movements SET
        movement_date = $1::date,
        account_id = $2::uuid,
        amount = $3,
        category = $4,
        description = $5,
        payment_method = $6,
        updated_at = NOW()
       WHERE id = $7::uuid`,
      [
        movementDate,
        tx.account_id,
        amount,
        tx.category,
        description,
        tx.payment_method || null,
        existingId,
      ]
    )
  }

  await recalculateAllMovementBalances(client)
  return { ok: true as const, action: existingId ? "inventory_purchase_updated" as const : "inventory_purchase_missing_movement" as const }
}

export async function syncTransactionMovement(
  client: PoolClient,
  transactionId: string,
  options?: { createdBy?: string | null; cancelReason?: string; expectedCompanyId?: string }
) {
  const createdBy = options?.createdBy ?? null
  const cancelReason = options?.cancelReason ?? "Pagamento ou recebimento desfeito"
  const expectedCompanyId = options?.expectedCompanyId

  const txRes = await client.query<TxRow>(
    `SELECT id, company_id, account_id, type, category, description, amount, date,
            payment_method, status, source_type, source_id
     FROM transactions WHERE id = $1::uuid`,
    [transactionId]
  )
  const tx = txRes.rows[0]

  if (!tx?.company_id) {
    return { ok: false as const, error: "Transação não encontrada ou sem empresa" }
  }

  if (expectedCompanyId && tx.company_id !== expectedCompanyId) {
    return { ok: false as const, error: "Transação não pertence à empresa atual" }
  }

  const companyId = tx.company_id
  if (tx.type === "expense" && tx.source_type === "inventory_purchase") {
    return syncInventoryPurchaseMovement(client, tx)
  }

  const reconciled = tx.status === "reconciled" && tx.account_id != null
  const shouldRecord = reconciled
  const source = shouldRecord ? desiredMovementSource(tx) : null

  if (!shouldRecord || !source) {
    await reverseAccountPayableReceivable(client, companyId, transactionId, cancelReason, createdBy)
    await recalculateAllMovementBalances(client)
    return { ok: true as const, action: "unlinked_or_reversed" as const }
  }

  const movementDate = toDateOnly(tx.date)
  const amount = movementAmount(tx)
  const movType = tx.type === "expense" ? "expense" : "income"
  const description = (tx.description || tx.category || "").trim() || (source === "account_payable" ? "Conta paga" : "Conta recebida")

  const existing = await client.query(
    `SELECT * FROM financial_account_movements
     WHERE company_id IS NOT DISTINCT FROM $1::uuid
       AND source_id = $2::uuid
       AND COALESCE(is_canceled, false) = false
       AND type <> 'reversal'`,
    [companyId, transactionId]
  )

  const row = existing.rows[0] as Record<string, unknown> | undefined

  if (
    !row &&
    tx.type === "income" &&
    tx.source_type === "sale" &&
    tx.source_id
  ) {
    const legacyBySale = await client.query<{ id: string }>(
      `SELECT id FROM financial_account_movements
       WHERE company_id IS NOT DISTINCT FROM $1::uuid
         AND source = 'sale'
         AND source_id = $2::uuid
         AND COALESCE(is_canceled, false) = false
         AND type <> 'reversal'`,
      [companyId, tx.source_id]
    )
    const legacyId = legacyBySale.rows[0]?.id
    if (legacyId) {
      await client.query(
        `UPDATE financial_account_movements SET
          source = 'account_receivable',
          source_id = $1::uuid,
          type = 'income',
          amount = $2,
          movement_date = $3::date,
          account_id = $4::uuid,
          category = $5,
          description = $6,
          payment_method = $7,
          updated_at = NOW()
        WHERE id = $8::uuid`,
        [
          transactionId,
          amount,
          movementDate,
          tx.account_id,
          tx.category,
          description,
          tx.payment_method || null,
          legacyId,
        ]
      )
      await recalculateAllMovementBalances(client)
      return { ok: true as const, action: "repointed_legacy_sale_movement" as const }
    }
  }

  if (row && String(row.source) === "purchase") {
    await recalculateAllMovementBalances(client)
    return { ok: true as const, action: "skipped_purchase_row" as const }
  }

  if (row && !MIGRATABLE_SOURCES.has(String(row.source))) {
    await recalculateAllMovementBalances(client)
    return { ok: true as const, action: "skipped_foreign_source" as const, source: String(row.source) }
  }

  if (row) {
    await client.query(
      `UPDATE financial_account_movements SET
        source = $1,
        type = $2,
        amount = $3,
        movement_date = $4::date,
        account_id = $5::uuid,
        category = $6,
        description = $7,
        payment_method = $8,
        updated_at = NOW()
      WHERE id = $9::uuid`,
      [
        source,
        movType,
        amount,
        movementDate,
        tx.account_id,
        tx.category,
        description,
        tx.payment_method || null,
        row.id,
      ]
    )
    await recalculateAllMovementBalances(client)
    return { ok: true as const, action: "updated" as const }
  }

  await client.query(
    `INSERT INTO financial_account_movements (
      company_id, account_id, movement_date, type, category, description,
      amount, balance_after, payment_method, source, source_id, created_by
    ) VALUES (
      $1::uuid, $2::uuid, $3::date, $4, $5, $6,
      $7, 0, $8, $9, $10::uuid, $11::uuid
    )`,
    [
      companyId,
      tx.account_id,
      movementDate,
      movType,
      tx.category,
      description,
      amount,
      tx.payment_method || null,
      source,
      transactionId,
      createdBy,
    ]
  )
  await recalculateAllMovementBalances(client)
  return { ok: true as const, action: "inserted" as const }
}

/** When the transactions row was removed (ex.: exclusão da conciliação de venda). */
export async function reverseMovementForDeletedTransaction(
  client: PoolClient,
  companyId: string,
  transactionId: string,
  reason: string,
  createdBy: string | null
) {
  const resolved = await client.query<{ company_id: string }>(
    `SELECT company_id FROM financial_account_movements
     WHERE source_id = $1::uuid AND source IN ('account_payable', 'account_receivable')
       AND COALESCE(is_canceled, false) = false
     LIMIT 1`,
    [transactionId]
  )
  const resolvedCompanyId = resolved.rows[0]?.company_id || companyId
  await reverseAccountPayableReceivable(client, resolvedCompanyId, transactionId, reason, createdBy)
  await recalculateAllMovementBalances(client)
}
