CREATE TABLE IF NOT EXISTS finance_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  institution     TEXT,
  account_type    TEXT NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings', 'cash', 'credit', 'investment', 'other')),
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(12,2),
  color           TEXT DEFAULT '#2563eb',
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_status_check'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('pending', 'reconciled', 'cancelled')) NOT VALID;
  END IF;
END
$$;

UPDATE transactions SET status = 'pending' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active_source
  ON transactions (company_id, source_type, source_id)
  WHERE source_type IS NOT NULL
    AND source_id IS NOT NULL
    AND COALESCE(status, 'pending') <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_finance_accounts_company ON finance_accounts (company_id);
