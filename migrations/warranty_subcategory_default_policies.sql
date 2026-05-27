-- Default warranty policy per product subcategory.
-- Operational model: the catalog decides the default warranty once; the sale
-- consumes that decision and still allows manual override per item.

ALTER TABLE product_subcategories
  ADD COLUMN IF NOT EXISTS default_warranty_policy_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_subcategories_default_warranty_policy_fk'
  ) THEN
    ALTER TABLE product_subcategories
      ADD CONSTRAINT product_subcategories_default_warranty_policy_fk
      FOREIGN KEY (default_warranty_policy_id)
      REFERENCES warranty_policies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_subcategories_default_warranty_policy
  ON product_subcategories(company_id, default_warranty_policy_id)
  WHERE default_warranty_policy_id IS NOT NULL AND deleted_at IS NULL;

-- No textual backfill here. default_warranty_policy_id must be configured
-- explicitly in the catalog admin, or seeded later through stable structured
-- identifiers controlled by a dedicated migration.
