ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS credit_13x_fee_pct NUMERIC(5,2) DEFAULT 14.13,
  ADD COLUMN IF NOT EXISTS credit_14x_fee_pct NUMERIC(5,2) DEFAULT 15.01,
  ADD COLUMN IF NOT EXISTS credit_15x_fee_pct NUMERIC(5,2) DEFAULT 15.90,
  ADD COLUMN IF NOT EXISTS credit_16x_fee_pct NUMERIC(5,2) DEFAULT 16.78,
  ADD COLUMN IF NOT EXISTS credit_17x_fee_pct NUMERIC(5,2) DEFAULT 17.69,
  ADD COLUMN IF NOT EXISTS credit_18x_fee_pct NUMERIC(5,2) DEFAULT 18.58;

UPDATE financial_settings
SET
  credit_13x_fee_pct = COALESCE(credit_13x_fee_pct, 14.13),
  credit_14x_fee_pct = COALESCE(credit_14x_fee_pct, 15.01),
  credit_15x_fee_pct = COALESCE(credit_15x_fee_pct, 15.90),
  credit_16x_fee_pct = COALESCE(credit_16x_fee_pct, 16.78),
  credit_17x_fee_pct = COALESCE(credit_17x_fee_pct, 17.69),
  credit_18x_fee_pct = COALESCE(credit_18x_fee_pct, 18.58);
