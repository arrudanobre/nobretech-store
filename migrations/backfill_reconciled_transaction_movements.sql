-- Idempotent backfill: reconciled transactions -> extrato (account_payable / account_receivable).
-- Safe to re-run: updates migratable rows; inserts only when no active movement exists for tx id.
-- inventory_purchase expenses excluded (purchase flow stays on source = purchase).

-- Allow a new active movement after the previous one was canceled (re-pay after undo).
DROP INDEX IF EXISTS idx_financial_account_movements_unique_import_source;

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_account_movements_unique_import_source
  ON financial_account_movements(company_id, source_id)
  WHERE source_id IS NOT NULL
    AND COALESCE(is_canceled, false) = false
    AND source IN (
      'sale',
      'purchase',
      'card_fee',
      'refund',
      'system_generated',
      'transaction',
      'manual_entry',
      'manual_expense',
      'account_payable',
      'account_receivable'
    );

-- Align legacy / manual sources to account_payable | account_receivable for reconciled txs.
UPDATE financial_account_movements m
SET
  source = CASE WHEN t.type = 'expense' THEN 'account_payable' ELSE 'account_receivable' END,
  type = CASE WHEN t.type = 'expense' THEN 'expense' ELSE 'income' END,
  amount = CASE WHEN t.type = 'expense' THEN -ABS(t.amount) ELSE ABS(t.amount) END,
  movement_date = t.date,
  account_id = t.account_id,
  category = t.category,
  description = COALESCE(
    NULLIF(btrim(COALESCE(t.description, '')), ''),
    t.category,
    CASE WHEN t.type = 'expense' THEN 'Conta paga' ELSE 'Conta recebida' END
  ),
  payment_method = t.payment_method,
  updated_at = NOW()
FROM transactions t
WHERE m.source_id = t.id
  AND m.company_id IS NOT DISTINCT FROM t.company_id
  AND COALESCE(m.is_canceled, false) = false
  AND m.type <> 'reversal'
  AND m.source IN ('manual_expense', 'manual_entry', 'sale', 'account_payable', 'account_receivable')
  AND t.status = 'reconciled'
  AND t.account_id IS NOT NULL
  AND t.status IS DISTINCT FROM 'cancelled'
  AND t.company_id IS NOT NULL
  AND (
    (t.type = 'expense' AND COALESCE(t.source_type, '') <> 'inventory_purchase')
    OR t.type = 'income'
  );

-- Insert missing movements (ex.: baixas feitas antes da integração com o extrato).
INSERT INTO financial_account_movements (
  company_id,
  account_id,
  movement_date,
  type,
  category,
  description,
  amount,
  balance_after,
  payment_method,
  source,
  source_id
)
SELECT
  t.company_id,
  t.account_id,
  t.date,
  CASE WHEN t.type = 'expense' THEN 'expense' ELSE 'income' END,
  t.category,
  COALESCE(
    NULLIF(btrim(COALESCE(t.description, '')), ''),
    t.category,
    CASE WHEN t.type = 'expense' THEN 'Conta paga' ELSE 'Conta recebida' END
  ),
  CASE WHEN t.type = 'expense' THEN -ABS(t.amount) ELSE ABS(t.amount) END,
  0,
  t.payment_method,
  CASE WHEN t.type = 'expense' THEN 'account_payable' ELSE 'account_receivable' END,
  t.id
FROM transactions t
WHERE t.status = 'reconciled'
  AND t.account_id IS NOT NULL
  AND t.status IS DISTINCT FROM 'cancelled'
  AND t.company_id IS NOT NULL
  AND (
    (t.type = 'expense' AND COALESCE(t.source_type, '') <> 'inventory_purchase')
    OR t.type = 'income'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM financial_account_movements m
    WHERE m.source_id = t.id
      AND m.company_id IS NOT DISTINCT FROM t.company_id
      AND COALESCE(m.is_canceled, false) = false
      AND m.type <> 'reversal'
  );

-- Official running balance in DB (same ordering as extrato: date, created_at, id).
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
WHERE movement.id = ordered_movements.id;
