-- Catalog admin panel foundation.
-- Adds the three operational tables the public catalog needs:
--   catalog_publications      — per-inventory publication state, public copy, public price
--   catalog_condition_reviews — per-item commercial review (0-10 scores) for seminovo/used
--   catalog_included_items    — flexible included items list (configured per product)
--
-- Also extends product_images with sort_order + alt so the gallery has a
-- deterministic order and accessible alt text. Existing rows keep working.
--
-- inventory.is_published / inventory.published_at remain as shadow flags so
-- legacy SQL and the prior public query still function while the admin panel
-- writes to both. Once everything reads catalog_publications, the flags can be
-- removed in a future migration.

------------------------------------------------------------------------------
-- product_images: gallery ordering + accessible alt text
------------------------------------------------------------------------------
ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alt TEXT;

CREATE INDEX IF NOT EXISTS idx_product_images_sort
  ON product_images (product_id, sort_order, created_at);

------------------------------------------------------------------------------
-- catalog_publications
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_publications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id   UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  public_status       TEXT NOT NULL DEFAULT 'draft'
                      CHECK (public_status IN ('draft','ready','published','blocked','archived')),
  public_title        TEXT,
  public_description  TEXT,
  public_price        NUMERIC(10,2),
  promo_price         NUMERIC(10,2),
  installment_count   INTEGER NOT NULL DEFAULT 10,
  show_installments   BOOLEAN NOT NULL DEFAULT TRUE,
  highlight           BOOLEAN NOT NULL DEFAULT FALSE,
  cover_image_id      UUID,
  notes_internal      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at        TIMESTAMPTZ,
  CONSTRAINT catalog_publications_inventory_unique UNIQUE (inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_publications_company_published
  ON catalog_publications (company_id, is_published)
  WHERE is_published = TRUE;

CREATE INDEX IF NOT EXISTS idx_catalog_publications_status
  ON catalog_publications (company_id, public_status);

------------------------------------------------------------------------------
-- catalog_condition_reviews (0-10 scale, per-item with optional notes)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_condition_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id     UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  publication_id        UUID REFERENCES catalog_publications(id) ON DELETE SET NULL,
  product_kind          TEXT NOT NULL
                        CHECK (product_kind IN ('sealed','seminovo','used','open_box')),
  overall_score         NUMERIC(3,1) CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 10)),
  screen_score          NUMERIC(3,1) CHECK (screen_score IS NULL OR (screen_score >= 0 AND screen_score <= 10)),
  screen_notes          TEXT,
  sides_score           NUMERIC(3,1) CHECK (sides_score IS NULL OR (sides_score >= 0 AND sides_score <= 10)),
  sides_notes           TEXT,
  back_score            NUMERIC(3,1) CHECK (back_score IS NULL OR (back_score >= 0 AND back_score <= 10)),
  back_notes            TEXT,
  battery_score         NUMERIC(3,1) CHECK (battery_score IS NULL OR (battery_score >= 0 AND battery_score <= 10)),
  battery_notes         TEXT,
  cameras_score         NUMERIC(3,1) CHECK (cameras_score IS NULL OR (cameras_score >= 0 AND cameras_score <= 10)),
  cameras_notes         TEXT,
  biometrics_score      NUMERIC(3,1) CHECK (biometrics_score IS NULL OR (biometrics_score >= 0 AND biometrics_score <= 10)),
  biometrics_notes      TEXT,
  audio_score           NUMERIC(3,1) CHECK (audio_score IS NULL OR (audio_score >= 0 AND audio_score <= 10)),
  audio_notes           TEXT,
  connectivity_score    NUMERIC(3,1) CHECK (connectivity_score IS NULL OR (connectivity_score >= 0 AND connectivity_score <= 10)),
  connectivity_notes    TEXT,
  general_score         NUMERIC(3,1) CHECK (general_score IS NULL OR (general_score >= 0 AND general_score <= 10)),
  general_notes         TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_condition_reviews_inventory_unique UNIQUE (inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_condition_reviews_publication
  ON catalog_condition_reviews (publication_id);

------------------------------------------------------------------------------
-- catalog_included_items (flexible accessory list per product)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_included_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id   UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  publication_id      UUID REFERENCES catalog_publications(id) ON DELETE SET NULL,
  label               TEXT NOT NULL,
  is_included         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_included_items_inventory
  ON catalog_included_items (inventory_item_id, sort_order);

------------------------------------------------------------------------------
-- Backfill: create draft publications for items already marked is_published
-- (preserves the previous SQL-only publication flow during the transition).
------------------------------------------------------------------------------
INSERT INTO catalog_publications (
  company_id, inventory_item_id, is_published, public_status, public_price, published_at
)
SELECT
  i.company_id,
  i.id,
  TRUE,
  'published',
  i.suggested_price,
  COALESCE(i.published_at, NOW())
FROM inventory i
WHERE i.is_published = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM catalog_publications p WHERE p.inventory_item_id = i.id
  );

------------------------------------------------------------------------------
-- updated_at trigger reuses fn_set_updated_at if available.
-- Falls back silently to manual updates by the application otherwise.
------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_set_updated_at') THEN
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_catalog_publications_updated BEFORE UPDATE ON catalog_publications FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()';
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_catalog_condition_reviews_updated BEFORE UPDATE ON catalog_condition_reviews FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()';
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_catalog_included_items_updated BEFORE UPDATE ON catalog_included_items FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()';
  END IF;
END $$;
