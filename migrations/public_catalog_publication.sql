-- Public catalog publication flag.
-- Minimal curation layer for /catalogo (public mobile-first catalog).
-- Only inventory rows with is_published = TRUE are exposed publicly.
--
-- Defaults to FALSE so no existing inventory leaks to the public catalog
-- before a human review. The admin UI for toggling this flag will arrive
-- in the next phase; for now operators publish via SQL or db API.

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Backfill safety: anything previously sold/returned/etc must stay unpublished.
UPDATE inventory
  SET is_published = FALSE
  WHERE is_published = TRUE
    AND status NOT IN ('active', 'in_stock');

CREATE INDEX IF NOT EXISTS idx_inventory_public_catalog
  ON inventory (company_id, is_published, status)
  WHERE is_published = TRUE;
