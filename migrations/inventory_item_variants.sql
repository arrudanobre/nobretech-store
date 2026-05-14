-- inventory_item_variants: per-color/variation quantity for accessories without serial
-- Apply manually: psql $DATABASE_URL -f migrations/inventory_item_variants.sql
-- Rollback: DROP TABLE IF EXISTS inventory_item_variants;

CREATE TABLE IF NOT EXISTS inventory_item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  inventory_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  catalog_color_id uuid NULL,
  color_name text NOT NULL,
  color_hex text NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_cost numeric NULL,
  suggested_price numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_item_variants_company_id_idx ON inventory_item_variants(company_id);
CREATE INDEX IF NOT EXISTS inventory_item_variants_inventory_id_idx ON inventory_item_variants(inventory_id);

COMMENT ON TABLE inventory_item_variants IS
  'Per-color/variation quantity control for accessories without serial numbers. '
  'catalog_color_id links to product_colors when color comes from catalog. '
  'color_name + color_hex allow free-form colors outside catalog.';
