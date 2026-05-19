-- Reseller supplier offers ----------------------------------------------------
-- Allows reseller catalog offers to come from Nobretech inventory OR from
-- supplier catalog opportunities. Additive and scoped away from sales/finance.

-- ── 1. Source columns for reseller offers ────────────────────────────────────
ALTER TABLE reseller_product_offers
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS supplier_offer_id UUID NULL;

UPDATE reseller_product_offers
   SET source_type = 'inventory'
 WHERE source_type IS NULL;

ALTER TABLE reseller_product_offers
  ALTER COLUMN source_type SET DEFAULT 'inventory',
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN inventory_item_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reseller_product_offers_supplier_offer_id_fkey'
       AND conrelid = 'reseller_product_offers'::regclass
  ) THEN
    ALTER TABLE reseller_product_offers
      ADD CONSTRAINT reseller_product_offers_supplier_offer_id_fkey
      FOREIGN KEY (supplier_offer_id) REFERENCES supplier_offers(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Existing check only required suggested_sale_price >= 0. The reseller catalog
-- needs suggested price to be at least the Nobretech repasse.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reseller_product_offers_price_order_check'
       AND conrelid = 'reseller_product_offers'::regclass
  ) THEN
    ALTER TABLE reseller_product_offers
      ADD CONSTRAINT reseller_product_offers_price_order_check
      CHECK (suggested_sale_price IS NULL OR suggested_sale_price >= reseller_price);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reseller_product_offers_source_type_check'
       AND conrelid = 'reseller_product_offers'::regclass
  ) THEN
    ALTER TABLE reseller_product_offers
      ADD CONSTRAINT reseller_product_offers_source_type_check
      CHECK (source_type IN ('inventory', 'supplier'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reseller_product_offers_source_ref_check'
       AND conrelid = 'reseller_product_offers'::regclass
  ) THEN
    ALTER TABLE reseller_product_offers
      ADD CONSTRAINT reseller_product_offers_source_ref_check
      CHECK (
        (
          source_type = 'inventory'
          AND inventory_item_id IS NOT NULL
          AND supplier_offer_id IS NULL
        )
        OR
        (
          source_type = 'supplier'
          AND inventory_item_id IS NULL
          AND supplier_offer_id IS NOT NULL
        )
      );
  END IF;
END $$;

-- Replace the old inventory-only unique index with source-aware partial indexes.
DROP INDEX IF EXISTS idx_reseller_offers_unique;

CREATE INDEX IF NOT EXISTS idx_reseller_offers_source
  ON reseller_product_offers (reseller_id, source_type, is_active);

CREATE INDEX IF NOT EXISTS idx_reseller_offers_supplier
  ON reseller_product_offers (supplier_offer_id)
  WHERE supplier_offer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_offers_unique_inventory
  ON reseller_product_offers (reseller_id, inventory_item_id)
  WHERE source_type = 'inventory' AND inventory_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_offers_unique_supplier
  ON reseller_product_offers (reseller_id, supplier_offer_id)
  WHERE source_type = 'supplier' AND supplier_offer_id IS NOT NULL;

-- ── 2. Requests must follow the released offer, not only inventory ───────────
ALTER TABLE reseller_requests
  ALTER COLUMN inventory_item_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_requests_offer
  ON reseller_requests (offer_id)
  WHERE offer_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reseller_requests_inventory_or_offer_check'
       AND conrelid = 'reseller_requests'::regclass
  ) THEN
    ALTER TABLE reseller_requests
      ADD CONSTRAINT reseller_requests_inventory_or_offer_check
      CHECK (inventory_item_id IS NOT NULL OR offer_id IS NOT NULL);
  END IF;
END $$;
