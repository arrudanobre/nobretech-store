-- Compra Verificada / pós-venda: embalagem entregue com o aparelho vendido.
-- O aparelho principal da venda hoje é salvo em sales.inventory_id, então a
-- embalagem fica como snapshot da venda principal. A tabela de adicionais
-- também recebe os campos para manter compatibilidade com vendas multi-item.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS packaging_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS packaging_notes TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_packaging_type_check'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_packaging_type_check
      CHECK (
        packaging_type IS NULL
        OR packaging_type IN ('original_box', 'nobretech_box', 'no_box', 'other')
      );
  END IF;
END
$$;

ALTER TABLE sales_additional_items
  ADD COLUMN IF NOT EXISTS packaging_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS packaging_notes TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_additional_items_packaging_type_check'
      AND conrelid = 'sales_additional_items'::regclass
  ) THEN
    ALTER TABLE sales_additional_items
      ADD CONSTRAINT sales_additional_items_packaging_type_check
      CHECK (
        packaging_type IS NULL
        OR packaging_type IN ('original_box', 'nobretech_box', 'no_box', 'other')
      );
  END IF;
END
$$;
