ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS credit_13x_fee_pct NUMERIC(5,2) DEFAULT 20.78,
  ADD COLUMN IF NOT EXISTS credit_14x_fee_pct NUMERIC(5,2) DEFAULT 20.78,
  ADD COLUMN IF NOT EXISTS credit_15x_fee_pct NUMERIC(5,2) DEFAULT 20.78,
  ADD COLUMN IF NOT EXISTS credit_16x_fee_pct NUMERIC(5,2) DEFAULT 20.78,
  ADD COLUMN IF NOT EXISTS credit_17x_fee_pct NUMERIC(5,2) DEFAULT 20.78,
  ADD COLUMN IF NOT EXISTS credit_18x_fee_pct NUMERIC(5,2) DEFAULT 20.78;

UPDATE financial_settings
SET
  credit_13x_fee_pct = COALESCE(credit_13x_fee_pct, credit_12x_fee_pct, 20.78),
  credit_14x_fee_pct = COALESCE(credit_14x_fee_pct, credit_12x_fee_pct, 20.78),
  credit_15x_fee_pct = COALESCE(credit_15x_fee_pct, credit_12x_fee_pct, 20.78),
  credit_16x_fee_pct = COALESCE(credit_16x_fee_pct, credit_12x_fee_pct, 20.78),
  credit_17x_fee_pct = COALESCE(credit_17x_fee_pct, credit_12x_fee_pct, 20.78),
  credit_18x_fee_pct = COALESCE(credit_18x_fee_pct, credit_12x_fee_pct, 20.78);
