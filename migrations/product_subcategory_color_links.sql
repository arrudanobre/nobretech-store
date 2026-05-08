-- Model-specific allowed colors for the configurable product catalog.
-- Incremental and non-destructive: existing global colors and products are kept.

CREATE TABLE IF NOT EXISTS product_subcategory_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  subcategory_id UUID REFERENCES product_subcategories(id) ON DELETE RESTRICT NOT NULL,
  color_id UUID REFERENCES product_colors(id) ON DELETE RESTRICT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, subcategory_id, color_id)
);

ALTER TABLE product_subcategory_colors
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE product_subcategory_colors
SET is_active = TRUE
WHERE is_active IS NULL;

UPDATE product_subcategory_colors
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_subcategory_colors_subcategory_active
  ON product_subcategory_colors (company_id, subcategory_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_subcategory_colors_color_active
  ON product_subcategory_colors (company_id, color_id, is_active);

DROP TRIGGER IF EXISTS trg_product_subcategory_colors_updated ON product_subcategory_colors;
CREATE TRIGGER trg_product_subcategory_colors_updated
  BEFORE UPDATE ON product_subcategory_colors
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

WITH catalog_model_colors AS (
  SELECT DISTINCT
    category.company_id,
    subcategory.id AS subcategory_id,
    color.id AS color_id
  FROM product_catalog catalog
  JOIN product_categories category
    ON category.legacy_key = catalog.category
    OR category.slug = catalog.category
  JOIN product_subcategories subcategory
    ON subcategory.company_id = category.company_id
    AND subcategory.category_id = category.id
    AND (
      subcategory.legacy_model = catalog.model
      OR subcategory.name = catalog.model
    )
  JOIN product_colors color
    ON color.company_id = category.company_id
    AND color.category_id = category.id
    AND color.name = catalog.color
  WHERE catalog.color IS NOT NULL
    AND btrim(catalog.color) <> ''
)
INSERT INTO product_subcategory_colors (company_id, subcategory_id, color_id, is_active)
SELECT company_id, subcategory_id, color_id, TRUE
FROM catalog_model_colors
ON CONFLICT (company_id, subcategory_id, color_id)
DO UPDATE SET
  is_active = TRUE,
  updated_at = NOW();
