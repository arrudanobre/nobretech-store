-- Split de pagamentos por venda.
-- A venda continua sendo a origem comercial da receita; cada linha desta tabela
-- representa apenas a liquidacao financeira daquela venda.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_payment_status_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_payment_status_check
  CHECK (payment_status IN ('pending', 'partially_paid', 'paid', 'cancelled'));

CREATE TABLE IF NOT EXISTS sale_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  sale_id              UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  payment_method       TEXT NOT NULL,
  amount               NUMERIC(10,2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  due_date             DATE NOT NULL,
  received_date        DATE,
  financial_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  transaction_id       UUID REFERENCES transactions(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sale_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT sale_payments_status_check CHECK (status IN ('pending', 'received', 'cancelled')),
  CONSTRAINT sale_payments_method_check CHECK (
    payment_method IN (
      'cash',
      'pix',
      'debit',
      'credit_1x',
      'credit_2x',
      'credit_3x',
      'credit_4x',
      'credit_5x',
      'credit_6x',
      'credit_7x',
      'credit_8x',
      'credit_9x',
      'credit_10x',
      'credit_11x',
      'credit_12x',
      'credit_13x',
      'credit_14x',
      'credit_15x',
      'credit_16x',
      'credit_17x',
      'credit_18x',
      'transfer',
      'trade_in_credit',
      'other'
    )
  ),
  CONSTRAINT sale_payments_received_date_check CHECK (
    status <> 'received' OR received_date IS NOT NULL
  ),
  CONSTRAINT sale_payments_account_check CHECK (
    payment_method = 'trade_in_credit'
    OR status <> 'received'
    OR financial_account_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_company_sale
  ON sale_payments (company_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_payments_status_due
  ON sale_payments (company_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_sale_payments_method
  ON sale_payments (company_id, payment_method);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_payments_transaction
  ON sale_payments (transaction_id)
  WHERE transaction_id IS NOT NULL;

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "data_access_sale_payments" ON sale_payments';
    EXECUTE 'CREATE POLICY "data_access_sale_payments" ON sale_payments FOR ALL
      USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
      WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_sale_payments_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_payments_touch_updated_at ON sale_payments;
CREATE TRIGGER trg_sale_payments_touch_updated_at
  BEFORE UPDATE ON sale_payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_sale_payments_touch_updated_at();

WITH sale_base AS (
  SELECT
    s.id AS sale_id,
    s.company_id,
    CASE
      WHEN s.payment_method IN (
        'cash','pix','debit','credit_1x','credit_2x','credit_3x','credit_4x','credit_5x','credit_6x',
        'credit_7x','credit_8x','credit_9x','credit_10x','credit_11x','credit_12x','credit_13x',
        'credit_14x','credit_15x','credit_16x','credit_17x','credit_18x','transfer','trade_in_credit'
      ) THEN s.payment_method
      ELSE 'other'
    END AS method,
    GREATEST(
      0,
      ROUND((COALESCE(s.sale_price, 0) - LEAST(COALESCE(ti.trade_in_value, 0), COALESCE(s.sale_price, 0)))::NUMERIC, 2)
    ) AS cash_amount,
    LEAST(COALESCE(ti.trade_in_value, 0), COALESCE(s.sale_price, 0)) AS trade_in_amount,
    COALESCE(tx.due_date, s.payment_due_date, s.sale_date) AS due_date,
    CASE WHEN tx.status = 'reconciled' THEN COALESCE(tx.date, s.sale_date) ELSE NULL END AS received_date,
    tx.account_id,
    tx.id AS transaction_id,
    CASE WHEN COALESCE(s.sale_status, 'completed') = 'cancelled' THEN 'cancelled'
         WHEN tx.status = 'reconciled' AND tx.account_id IS NOT NULL THEN 'received'
         ELSE 'pending'
    END AS status
  FROM sales s
  LEFT JOIN trade_ins ti ON ti.id = s.trade_in_id
  LEFT JOIN LATERAL (
    SELECT *
    FROM transactions tx
    WHERE tx.source_type = 'sale'
      AND tx.source_id = s.id
      AND COALESCE(tx.status, 'pending') <> 'cancelled'
    ORDER BY tx.created_at DESC
    LIMIT 1
  ) tx ON TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id
  )
)
INSERT INTO sale_payments (
  company_id,
  sale_id,
  payment_method,
  amount,
  status,
  due_date,
  received_date,
  financial_account_id,
  transaction_id,
  notes
)
SELECT
  company_id,
  sale_id,
  method,
  cash_amount,
  status,
  due_date,
  received_date,
  account_id,
  transaction_id,
  'Backfill do pagamento legado da venda'
FROM sale_base
WHERE cash_amount > 0
UNION ALL
SELECT
  company_id,
  sale_id,
  'trade_in_credit',
  trade_in_amount,
  CASE WHEN COALESCE(status, 'pending') = 'cancelled' THEN 'cancelled' ELSE 'received' END,
  due_date,
  due_date,
  NULL,
  NULL,
  'Backfill do abatimento por trade-in'
FROM sale_base
WHERE trade_in_amount > 0;

CREATE OR REPLACE FUNCTION fn_refresh_sale_payment_summary(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  method_count INT;
  methods TEXT[];
  total_cents BIGINT;
  received_cents BIGINT;
  pending_cents BIGINT;
  next_due DATE;
  summary_method TEXT;
  next_status TEXT;
BEGIN
  SELECT
    COUNT(DISTINCT payment_method) FILTER (WHERE status <> 'cancelled'),
    ARRAY_AGG(DISTINCT payment_method ORDER BY payment_method) FILTER (WHERE status <> 'cancelled'),
    COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE status <> 'cancelled'), 0)::BIGINT,
    COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE status = 'received'), 0)::BIGINT,
    COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE status = 'pending'), 0)::BIGINT,
    MIN(due_date) FILTER (WHERE status = 'pending')
  INTO method_count, methods, total_cents, received_cents, pending_cents, next_due
  FROM sale_payments
  WHERE sale_id = p_sale_id;

  IF method_count IS NULL OR method_count = 0 THEN
    RETURN;
  END IF;

  summary_method := CASE
    WHEN method_count = 1 THEN methods[1]
    ELSE 'mixed'
  END;

  next_status := CASE
    WHEN EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id AND COALESCE(sale_status, 'completed') = 'cancelled') THEN 'cancelled'
    WHEN total_cents > 0 AND received_cents >= total_cents THEN 'paid'
    WHEN received_cents > 0 AND pending_cents > 0 THEN 'partially_paid'
    ELSE 'pending'
  END;

  UPDATE sales
  SET
    payment_method = summary_method,
    payment_due_date = next_due,
    payment_status = next_status
  WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sale_payments_refresh_summary()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_refresh_sale_payment_summary(COALESCE(NEW.sale_id, OLD.sale_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_payments_refresh_summary ON sale_payments;
CREATE TRIGGER trg_sale_payments_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON sale_payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_sale_payments_refresh_summary();

CREATE OR REPLACE FUNCTION validate_sale_payment_total(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  sale_total_cents BIGINT;
  payment_total_cents BIGINT;
BEGIN
  SELECT ROUND(COALESCE(sale_price, 0) * 100)::BIGINT
  INTO sale_total_cents
  FROM sales
  WHERE id = p_sale_id;

  IF sale_total_cents IS NULL THEN
    RAISE EXCEPTION 'Venda % nao encontrada', p_sale_id;
  END IF;

  SELECT COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE status <> 'cancelled'), 0)::BIGINT
  INTO payment_total_cents
  FROM sale_payments
  WHERE sale_id = p_sale_id;

  IF sale_total_cents <> payment_total_cents THEN
    RAISE EXCEPTION 'Soma dos pagamentos (%) difere do total da venda (%)', payment_total_cents, sale_total_cents;
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT fn_refresh_sale_payment_summary(id)
FROM sales
WHERE EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = sales.id);
