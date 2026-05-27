-- Fase 2D.3.1: habilita explicitamente as policies selecionaveis no contexto de venda.
-- Migration idempotente para aplicacao controlada futura. Nao aplicar em producao sem autorizacao.

UPDATE warranty_policies
SET applies_to_sale = TRUE,
    updated_at = NOW()
WHERE name IN (
  'Garantia Nobretech - Seminovo',
  'Garantia Nobretech - Seminovo 3 meses',
  'Garantia fabricante - Produto lacrado'
)
  AND (applies_to_sale IS DISTINCT FROM TRUE);

UPDATE warranty_policies
SET applies_to_sale = FALSE,
    is_selectable = FALSE,
    is_default = FALSE,
    updated_at = NOW()
WHERE name IN (
  'Garantia legal - Produto duravel 90 dias',
  'Garantia legal - Produto durável 90 dias'
)
  AND (
    applies_to_sale IS DISTINCT FROM FALSE
    OR is_selectable IS DISTINCT FROM FALSE
    OR is_default IS DISTINCT FROM FALSE
  );
