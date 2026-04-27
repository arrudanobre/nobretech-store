-- Adicionar parcelas faltantes (5x, 7x, 8x, 11x) na tabela financial_settings
-- Acréscimos repassados ao cliente para preservar o valor líquido desejado.

ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_5x_fee_pct NUMERIC DEFAULT 7.17;
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_7x_fee_pct NUMERIC DEFAULT 8.93;
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_8x_fee_pct NUMERIC DEFAULT 9.78;
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS credit_11x_fee_pct NUMERIC DEFAULT 12.37;

-- Atualizar todas as taxas com os valores calibrados pelo Mercado Pago (abr/2026)
UPDATE financial_settings SET
  debit_fee_pct = 1.10,
  credit_1x_fee_pct = 3.08,
  credit_2x_fee_pct = 4.67,
  credit_3x_fee_pct = 5.50,
  credit_4x_fee_pct = 6.34,
  credit_5x_fee_pct = 7.17,
  credit_6x_fee_pct = 8.03,
  credit_7x_fee_pct = 8.93,
  credit_8x_fee_pct = 9.78,
  credit_10x_fee_pct = 11.51,
  credit_11x_fee_pct = 12.37,
  credit_12x_fee_pct = 13.25
WHERE id IS NOT NULL;
-- Se não existir nenhum registro, insere um padrão:
INSERT INTO financial_settings (id, debit_fee_pct, credit_1x_fee_pct, credit_2x_fee_pct, credit_3x_fee_pct, credit_4x_fee_pct, credit_5x_fee_pct, credit_6x_fee_pct, credit_7x_fee_pct, credit_8x_fee_pct, credit_10x_fee_pct, credit_11x_fee_pct, credit_12x_fee_pct, pix_fee_pct, cash_discount_pct, default_margin_pct, default_warranty_months)
SELECT
  gen_random_uuid(),
  1.10, 3.08, 4.67, 5.50, 6.34, 7.17, 8.03, 8.93, 9.78, 11.51, 12.37, 13.25,
  0, 0, 15, 3
WHERE NOT EXISTS (SELECT 1 FROM financial_settings LIMIT 1);
