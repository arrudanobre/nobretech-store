-- Safety hardening for configurable product catalog.
-- Incremental and safe to dry-run. Do not edit the already-applied base migration.

ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS normalized_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS product_type TEXT;

ALTER TABLE product_subcategories
  ADD COLUMN IF NOT EXISTS normalized_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE product_attributes
  ADD COLUMN IF NOT EXISTS normalized_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE product_attribute_options
  ADD COLUMN IF NOT EXISTS normalized_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE product_colors
  ADD COLUMN IF NOT EXISTS normalized_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS product_type TEXT,
  ADD COLUMN IF NOT EXISTS category_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS subcategory_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS color_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS attribute_summary_snapshot TEXT;

UPDATE product_categories
SET normalized_name = lower(btrim(name))
WHERE normalized_name IS NULL OR normalized_name <> lower(btrim(name));

UPDATE product_subcategories
SET normalized_name = lower(btrim(name))
WHERE normalized_name IS NULL OR normalized_name <> lower(btrim(name));

UPDATE product_attributes
SET normalized_name = lower(btrim(name))
WHERE normalized_name IS NULL OR normalized_name <> lower(btrim(name));

UPDATE product_attribute_options
SET normalized_name = lower(btrim(label))
WHERE normalized_name IS NULL OR normalized_name <> lower(btrim(label));

UPDATE product_colors
SET normalized_name = lower(btrim(name))
WHERE normalized_name IS NULL OR normalized_name <> lower(btrim(name));

UPDATE product_categories
SET product_type = CASE
  WHEN legacy_key = 'accessories' OR name ~* '(acess[oó]rio|accessory|capa|pel[ií]cula|cabo|fonte|carregador|suporte|adaptador)' THEN 'accessory'
  ELSE 'device'
END
WHERE product_type IS NULL;

ALTER TABLE product_categories
  ALTER COLUMN product_type SET DEFAULT 'device',
  ALTER COLUMN product_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_categories_product_type_check'
      AND conrelid = 'product_categories'::regclass
  ) THEN
    ALTER TABLE product_categories
      ADD CONSTRAINT product_categories_product_type_check
      CHECK (product_type IN ('device', 'accessory', 'service', 'warranty', 'bundle'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_product_type_check'
      AND conrelid = 'inventory'::regclass
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT inventory_product_type_check
      CHECK (product_type IS NULL OR product_type IN ('device', 'accessory', 'service', 'warranty', 'bundle'));
  END IF;
END
$$;

WITH catalog_inventory_snapshots AS (
  SELECT
    i.id,
    pc.category,
    pc.model,
    pc.storage,
    pc.color,
    category.name AS category_name
  FROM inventory i
  JOIN product_catalog pc ON pc.id = i.catalog_id
  LEFT JOIN product_categories category
    ON category.company_id = i.company_id
    AND (category.legacy_key = pc.category OR category.slug = pc.category)
)
UPDATE inventory item
SET
  product_type = COALESCE(
    item.product_type,
    CASE
      WHEN snapshot.category IN ('iphone', 'ipad', 'macbook', 'applewatch', 'garmin') THEN 'device'
      WHEN snapshot.category IN ('accessories', 'airpods')
        OR concat_ws(' ', snapshot.category, snapshot.model, item.notes, item.condition_notes) ~* '(acess[oó]rio|accessory|capa|pel[ií]cula|cabo|fonte|fone|carregador|suporte|adaptador|pencil|caneta|teclado|keyboard)' THEN 'accessory'
      ELSE NULL
    END
  ),
  category_name_snapshot = COALESCE(
    item.category_name_snapshot,
    snapshot.category_name,
    CASE
      WHEN snapshot.category IN ('accessories', 'airpods')
        OR concat_ws(' ', snapshot.category, snapshot.model, item.notes, item.condition_notes) ~* '(acess[oó]rio|accessory|capa|pel[ií]cula|cabo|fonte|fone|carregador|suporte|adaptador|pencil|caneta|teclado|keyboard)' THEN 'Acessórios'
      ELSE NULLIF(snapshot.category, '')
    END
  ),
  subcategory_name_snapshot = COALESCE(item.subcategory_name_snapshot, NULLIF(snapshot.model, '')),
  color_name_snapshot = COALESCE(item.color_name_snapshot, NULLIF(snapshot.color, '')),
  attribute_summary_snapshot = COALESCE(item.attribute_summary_snapshot, NULLIF(concat_ws(' · ', NULLIF(snapshot.storage, ''), NULLIF(snapshot.color, '')), ''))
FROM catalog_inventory_snapshots snapshot
WHERE item.id = snapshot.id;

WITH manual_inventory_snapshots AS (
  SELECT
    id,
    NULLIF(btrim(regexp_replace(coalesce(notes, condition_notes, ''), '^(Acessorio|Acessório|Nome):[[:space:]]*', '', 'i')), '') AS product_name
  FROM inventory
  WHERE catalog_id IS NULL
    AND coalesce(notes, condition_notes, '') ~* '(acess[oó]rio|accessory|capa|pel[ií]cula|cabo|fonte|fone|carregador|suporte|adaptador|pencil|caneta|teclado|keyboard)'
)
UPDATE inventory item
SET
  product_type = COALESCE(item.product_type, 'accessory'),
  category_name_snapshot = COALESCE(item.category_name_snapshot, 'Acessórios'),
  subcategory_name_snapshot = COALESCE(item.subcategory_name_snapshot, manual.product_name)
FROM manual_inventory_snapshots manual
WHERE item.id = manual.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_company_normalized_active
  ON product_categories (company_id, normalized_name)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_subcategories_category_normalized_active
  ON product_subcategories (company_id, category_id, normalized_name)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attributes_category_normalized_active
  ON product_attributes (company_id, category_id, normalized_name)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attribute_options_attribute_normalized_active
  ON product_attribute_options (company_id, attribute_id, normalized_name)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_colors_category_normalized_active
  ON product_colors (company_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_catalog_snapshots
  ON inventory (company_id, product_type, category_name_snapshot, subcategory_name_snapshot);

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'product_subcategories'::regclass
    AND confrelid = 'product_categories'::regclass
    AND contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE product_subcategories DROP CONSTRAINT %I', fk_name);
    ALTER TABLE product_subcategories
      ADD CONSTRAINT product_subcategories_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT;
  END IF;

  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'product_attributes'::regclass
    AND confrelid = 'product_categories'::regclass
    AND contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE product_attributes DROP CONSTRAINT %I', fk_name);
    ALTER TABLE product_attributes
      ADD CONSTRAINT product_attributes_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT;
  END IF;

  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'product_attribute_options'::regclass
    AND confrelid = 'product_attributes'::regclass
    AND contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE product_attribute_options DROP CONSTRAINT %I', fk_name);
    ALTER TABLE product_attribute_options
      ADD CONSTRAINT product_attribute_options_attribute_id_fkey
      FOREIGN KEY (attribute_id) REFERENCES product_attributes(id) ON DELETE RESTRICT;
  END IF;

  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'product_colors'::regclass
    AND confrelid = 'product_categories'::regclass
    AND contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE product_colors DROP CONSTRAINT %I', fk_name);
    ALTER TABLE product_colors
      ADD CONSTRAINT product_colors_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL;
  END IF;

  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'product_subcategory_colors'::regclass
    AND confrelid = 'product_subcategories'::regclass
    AND contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE product_subcategory_colors DROP CONSTRAINT %I', fk_name);
    ALTER TABLE product_subcategory_colors
      ADD CONSTRAINT product_subcategory_colors_subcategory_id_fkey
      FOREIGN KEY (subcategory_id) REFERENCES product_subcategories(id) ON DELETE RESTRICT;
  END IF;

  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'product_subcategory_colors'::regclass
    AND confrelid = 'product_colors'::regclass
    AND contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE product_subcategory_colors DROP CONSTRAINT %I', fk_name);
    ALTER TABLE product_subcategory_colors
      ADD CONSTRAINT product_subcategory_colors_color_id_fkey
      FOREIGN KEY (color_id) REFERENCES product_colors(id) ON DELETE RESTRICT;
  END IF;
END
$$;
