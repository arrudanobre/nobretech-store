-- Classificação estruturada de acessórios para o resolver central de garantia.
-- Adiciona product_subcategories.accessory_class enum ('durable','non_durable').
-- Backfill manual mínimo das subcategorias acessórias seedadas pela Nobretech.
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO IF NOT EXISTS na CHECK + UPDATE WHERE NULL.

ALTER TABLE product_subcategories
  ADD COLUMN IF NOT EXISTS accessory_class TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_subcategories_accessory_class_check'
  ) THEN
    ALTER TABLE product_subcategories
      ADD CONSTRAINT product_subcategories_accessory_class_check
      CHECK (accessory_class IS NULL OR accessory_class IN ('durable','non_durable'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_subcategories_company_accessory_class
  ON product_subcategories(company_id, accessory_class)
  WHERE accessory_class IS NOT NULL AND deleted_at IS NULL;

-- Backfill Nobretech para subcategorias de acessórios já existentes.
-- Apple Pencil e variantes de caneta → durable.
-- Cases/capas/películas/suportes → non_durable.
-- Quaisquer outras subcategorias permanecem NULL = unknown (resolver fará warning + skip).

DO $$
DECLARE v_co UUID;
BEGIN
  SELECT id INTO v_co FROM companies WHERE slug = 'nobretech-store' LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'SKIP: empresa nobretech-store nao encontrada.';
    RETURN;
  END IF;

  UPDATE product_subcategories
  SET accessory_class = 'durable'
  WHERE company_id = v_co
    AND accessory_class IS NULL
    AND deleted_at IS NULL
    AND normalized_name LIKE 'apple pencil%';

  UPDATE product_subcategories
  SET accessory_class = 'non_durable'
  WHERE company_id = v_co
    AND accessory_class IS NULL
    AND deleted_at IS NULL
    AND (normalized_name LIKE 'case %' OR normalized_name LIKE 'capa%' OR normalized_name LIKE 'película%' OR normalized_name LIKE 'pelicula%' OR normalized_name LIKE 'suporte%');

  RAISE NOTICE 'Backfill accessory_class Nobretech aplicado.';
END $$;
