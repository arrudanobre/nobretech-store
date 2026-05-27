-- Classificação estruturada de acessórios para o resolver central de garantia.
-- Adiciona product_subcategories.accessory_class enum ('durable','non_durable').
-- Compatibilidade legada: o fluxo operacional atual usa
-- product_subcategories.default_warranty_policy_id como fonte principal.
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO IF NOT EXISTS na CHECK.

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

-- No backfill by subcategory name. Warranty defaults are configured explicitly
-- through product_subcategories.default_warranty_policy_id.
