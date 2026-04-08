-- Adicionar parcelas faltantes (5x, 7x, 8x, 11x) na tabela financial_settings
-- Acréscimos do Mercado Pago usados como referência:
-- 5x=14,31% | 7x=16,72% | 8x=16,73% | 11x=20,66%

ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_5x_fee_pct NUMERIC DEFAULT 15.40;
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_7x_fee_pct NUMERIC DEFAULT 17.14;
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_8x_fee_pct NUMERIC DEFAULT 17.15;
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_11x_fee_pct NUMERIC DEFAULT 19.85;

-- Atualizar todas as taxas com os valores calibrados pelo Mercado Pago (abr/2026)
UPDATE financial_settings SET
  debit_fee_pct = 1.47,
  credit_1x_fee_pct = 3.29,
  credit_2x_fee_pct = 11.79,
  credit_3x_fee_pct = 13.05,
  credit_4x_fee_pct = 13.15,
  credit_5x_fee_pct = 15.40,
  credit_6x_fee_pct = 15.40,
  credit_7x_fee_pct = 17.14,
  credit_8x_fee_pct = 17.04,
  credit_10x_fee_pct = 19.84,
  credit_11x_fee_pct = 19.85,
  credit_12x_fee_pct = 20.80
WHERE id IS NOT NULL;
-- Se não existir nenhum registro, insere um padrão:
INSERT INTO financial_settings (id, debit_fee_pct, credit_1x_fee_pct, credit_2x_fee_pct, credit_3x_fee_pct, credit_4x_fee_pct, credit_5x_fee_pct, credit_6x_fee_pct, credit_7x_fee_pct, credit_8x_fee_pct, credit_10x_fee_pct, credit_11x_fee_pct, credit_12x_fee_pct, pix_fee_pct, cash_discount_pct, default_margin_pct, default_warranty_months)
SELECT
  gen_random_uuid(),
  1.47, 3.29, 11.79, 13.05, 13.15, 15.40, 15.40, 17.14, 17.15, 19.84, 19.85, 20.80,
  0, 0, 15, 3
WHERE NOT EXISTS (SELECT 1 FROM financial_settings LIMIT 1);
