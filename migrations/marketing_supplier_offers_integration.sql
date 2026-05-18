-- Allow marketing disclosure items to reference supplier_offer instead of inventory
-- Run after marketing_disclosure_sessions.sql and supplier_offer_opportunities.sql

ALTER TABLE marketing_disclosure_items
  ADD COLUMN IF NOT EXISTS supplier_offer_id UUID NULL REFERENCES supplier_offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'inventory';

CREATE INDEX IF NOT EXISTS idx_marketing_disclosure_items_supplier_offer
  ON marketing_disclosure_items (supplier_offer_id)
  WHERE supplier_offer_id IS NOT NULL;

-- Drop and recreate view to include source_type in the by-inventory view
-- The original view may not exist yet; guard with IF EXISTS
DROP VIEW IF EXISTS v_marketing_last_disclosure_by_inventory;

CREATE OR REPLACE VIEW v_marketing_last_disclosure_by_inventory AS
SELECT DISTINCT ON (mdi.company_id, mdi.inventory_id)
  mdi.inventory_id,
  mdi.company_id,
  mds.id          AS session_id,
  mds.created_at  AS last_disclosed_at
FROM marketing_disclosure_items mdi
JOIN marketing_disclosure_sessions mds ON mds.id = mdi.session_id
WHERE mdi.inventory_id IS NOT NULL
  AND mdi.source_type = 'inventory'
ORDER BY mdi.company_id, mdi.inventory_id, mds.created_at DESC;
