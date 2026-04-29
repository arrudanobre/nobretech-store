-- Cartões de crédito e vínculo dos lançamentos financeiros.
-- Rode esta migration no Railway antes de usar a tela Financeiro > Cartões.

CREATE TABLE IF NOT EXISTS finance_credit_cards (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 UUID REFERENCES companies(id) ON DELETE CASCADE,
  name                       TEXT NOT NULL,
  issuer                     TEXT,
  last_four                  TEXT,
  due_day                    INT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  closing_day                INT CHECK (closing_day BETWEEN 1 AND 31),
  closing_days_before_due    INT NOT NULL DEFAULT 7 CHECK (closing_days_before_due BETWEEN 0 AND 28),
  current_invoice_closed     BOOLEAN NOT NULL DEFAULT FALSE,
  current_invoice_closing_date DATE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES finance_credit_cards(id) ON DELETE SET NULL;

ALTER TABLE finance_credit_cards
  ADD COLUMN IF NOT EXISTS current_invoice_closing_date DATE;

CREATE INDEX IF NOT EXISTS idx_finance_credit_cards_company
  ON finance_credit_cards(company_id);

CREATE INDEX IF NOT EXISTS idx_finance_credit_cards_active
  ON finance_credit_cards(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_transactions_credit_card
  ON transactions(company_id, credit_card_id, due_date);
