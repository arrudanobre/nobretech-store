CREATE TABLE IF NOT EXISTS financial_account_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  movement_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'adjustment', 'reversal')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  source TEXT NOT NULL DEFAULT 'manual_entry',
  source_id UUID,
  notes TEXT,
  adjustment_reason TEXT,
  previous_balance NUMERIC(12,2),
  target_balance NUMERIC(12,2),
  difference_amount NUMERIC(12,2),
  is_canceled BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  canceled_reason TEXT,
  reversal_of_id UUID REFERENCES financial_account_movements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_account_movements_amount_direction'
  ) THEN
    ALTER TABLE financial_account_movements
      ADD CONSTRAINT chk_financial_account_movements_amount_direction
      CHECK (
        (type = 'income' AND amount > 0)
        OR (type = 'expense' AND amount < 0)
        OR type IN ('adjustment', 'reversal')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_account_movements_adjustment_audit'
  ) THEN
    ALTER TABLE financial_account_movements
      ADD CONSTRAINT chk_financial_account_movements_adjustment_audit
      CHECK (
        type <> 'adjustment'
        OR (
          source = 'manual_balance_adjustment'
          AND adjustment_reason IS NOT NULL
          AND btrim(adjustment_reason) <> ''
          AND previous_balance IS NOT NULL
          AND target_balance IS NOT NULL
          AND difference_amount IS NOT NULL
          AND amount = difference_amount
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_account_movements_reversal_link'
  ) THEN
    ALTER TABLE financial_account_movements
      ADD CONSTRAINT chk_financial_account_movements_reversal_link
      CHECK (type <> 'reversal' OR reversal_of_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_account_movements_company_date
  ON financial_account_movements(company_id, movement_date, created_at);

CREATE INDEX IF NOT EXISTS idx_financial_account_movements_account_date
  ON financial_account_movements(account_id, movement_date, created_at);

CREATE INDEX IF NOT EXISTS idx_financial_account_movements_source
  ON financial_account_movements(company_id, source, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_account_movements_unique_source
  ON financial_account_movements(company_id, source, source_id)
  WHERE source_id IS NOT NULL
    AND source IN ('sale', 'purchase', 'card_fee', 'refund', 'system_generated', 'transaction');

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_account_movements_unique_import_source
  ON financial_account_movements(company_id, source_id)
  WHERE source_id IS NOT NULL
    AND source IN ('sale', 'purchase', 'card_fee', 'refund', 'system_generated', 'transaction', 'manual_entry', 'manual_expense');

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
  source_id,
  notes,
  created_at,
  updated_at
)
SELECT
  t.company_id,
  t.account_id,
  t.date,
  CASE WHEN t.type = 'income' THEN 'income' ELSE 'expense' END,
  COALESCE(NULLIF(t.category, ''), CASE WHEN t.type = 'income' THEN 'Entrada' ELSE 'Saída' END),
  COALESCE(NULLIF(t.description, ''), COALESCE(NULLIF(t.category, ''), 'Movimentação importada')),
  CASE WHEN t.type = 'income' THEN ABS(t.amount) ELSE -ABS(t.amount) END,
  0,
  t.payment_method,
  CASE
    WHEN t.source_type = 'sale' THEN 'sale'
    WHEN t.source_type = 'inventory_purchase' THEN 'purchase'
    WHEN t.source_type IS NOT NULL THEN t.source_type
    WHEN t.type = 'income' THEN 'manual_entry'
    ELSE 'manual_expense'
  END,
  t.id,
  t.notes,
  COALESCE(t.reconciled_at, t.created_at, NOW()),
  COALESCE(t.updated_at, t.created_at, NOW())
FROM transactions t
WHERE t.status = 'reconciled'
  AND COALESCE(t.status, '') <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1
    FROM financial_account_movements m
    WHERE m.company_id IS NOT DISTINCT FROM t.company_id
      AND m.source_id = t.id
  );

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
