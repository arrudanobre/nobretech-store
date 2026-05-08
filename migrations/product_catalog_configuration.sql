-- Configurable product catalog.
-- Progressive migration: keeps existing product_catalog/inventory rows valid.

ALTER TABLE product_catalog
  DROP CONSTRAINT IF EXISTS product_catalog_category_check;

ALTER TABLE product_catalog
  ALTER COLUMN specs SET DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  legacy_key TEXT,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, slug)
);

CREATE TABLE IF NOT EXISTS product_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  legacy_model TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, category_id, slug)
);

CREATE TABLE IF NOT EXISTS product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'select' CHECK (input_type IN ('select', 'multi_select', 'text', 'number', 'boolean', 'color')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, category_id, slug)
);

CREATE TABLE IF NOT EXISTS product_attribute_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  attribute_id UUID REFERENCES product_attributes(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, attribute_id, value)
);

CREATE TABLE IF NOT EXISTS product_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hex TEXT NOT NULL CHECK (hex ~* '^#[0-9a-f]{6}$'),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, category_id, name)
);

CREATE TABLE IF NOT EXISTS product_subcategory_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  subcategory_id UUID REFERENCES product_subcategories(id) ON DELETE CASCADE NOT NULL,
  color_id UUID REFERENCES product_colors(id) ON DELETE CASCADE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, subcategory_id, color_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_company_active
  ON product_categories (company_id, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_product_subcategories_category_active
  ON product_subcategories (category_id, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_product_attributes_category_active
  ON product_attributes (category_id, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_product_attribute_options_attribute_active
  ON product_attribute_options (attribute_id, is_active, sort_order, label);

CREATE INDEX IF NOT EXISTS idx_product_colors_category_active
  ON product_colors (company_id, category_id, is_active, sort_order, name);

CREATE OR REPLACE FUNCTION fn_seed_product_catalog_configuration(p_company_id uuid)
RETURNS void AS $$
DECLARE
  category_record record;
  catalog_record record;
  v_category_id uuid;
  v_storage_attribute_id uuid;
BEGIN
  FOR category_record IN
    SELECT DISTINCT category
    FROM product_catalog
    WHERE category IS NOT NULL
    ORDER BY category
  LOOP
    INSERT INTO product_categories (company_id, name, slug, legacy_key, sort_order)
    VALUES (
      p_company_id,
      CASE category_record.category
        WHEN 'iphone' THEN 'iPhone'
        WHEN 'ipad' THEN 'iPad'
        WHEN 'applewatch' THEN 'Apple Watch'
        WHEN 'airpods' THEN 'AirPods'
        WHEN 'macbook' THEN 'MacBook'
        WHEN 'garmin' THEN 'Garmin'
        WHEN 'accessories' THEN 'Acessórios'
        ELSE initcap(replace(category_record.category, '-', ' '))
      END,
      lower(regexp_replace(category_record.category, '[^a-zA-Z0-9]+', '-', 'g')),
      category_record.category,
      0
    )
    ON CONFLICT (company_id, slug) DO UPDATE
    SET legacy_key = COALESCE(product_categories.legacy_key, EXCLUDED.legacy_key)
    RETURNING id INTO v_category_id;

    INSERT INTO product_attributes (company_id, category_id, name, slug, input_type, sort_order)
    VALUES (p_company_id, v_category_id, 'Armazenamento', 'armazenamento', 'select', 10)
    ON CONFLICT (company_id, category_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_storage_attribute_id;

    FOR catalog_record IN
      SELECT DISTINCT model, storage, color, color_hex
      FROM product_catalog
      WHERE category = category_record.category
      ORDER BY model, storage, color
    LOOP
      INSERT INTO product_subcategories (company_id, category_id, name, slug, legacy_model, sort_order)
      VALUES (
        p_company_id,
        v_category_id,
        catalog_record.model,
        trim(both '-' from lower(regexp_replace(catalog_record.model, '[^a-zA-Z0-9]+', '-', 'g'))),
        catalog_record.model,
        0
      )
      ON CONFLICT (company_id, category_id, slug) DO NOTHING;

      IF catalog_record.storage IS NOT NULL AND btrim(catalog_record.storage) <> '' THEN
        INSERT INTO product_attribute_options (company_id, attribute_id, label, value, sort_order)
        VALUES (p_company_id, v_storage_attribute_id, catalog_record.storage, catalog_record.storage, 0)
        ON CONFLICT (company_id, attribute_id, value) DO NOTHING;
      END IF;

      IF catalog_record.color IS NOT NULL AND btrim(catalog_record.color) <> '' THEN
        INSERT INTO product_colors (company_id, category_id, name, hex, sort_order)
        VALUES (p_company_id, v_category_id, catalog_record.color, COALESCE(catalog_record.color_hex, '#111827'), 0)
        ON CONFLICT (company_id, category_id, name) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  company_record record;
BEGIN
  FOR company_record IN SELECT id FROM companies LOOP
    PERFORM fn_seed_product_catalog_configuration(company_record.id);
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS fn_seed_product_catalog_configuration(uuid);

DROP TRIGGER IF EXISTS trg_product_categories_updated ON product_categories;
CREATE TRIGGER trg_product_categories_updated
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_subcategories_updated ON product_subcategories;
CREATE TRIGGER trg_product_subcategories_updated
  BEFORE UPDATE ON product_subcategories
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_attributes_updated ON product_attributes;
CREATE TRIGGER trg_product_attributes_updated
  BEFORE UPDATE ON product_attributes
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_attribute_options_updated ON product_attribute_options;
CREATE TRIGGER trg_product_attribute_options_updated
  BEFORE UPDATE ON product_attribute_options
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_colors_updated ON product_colors;
CREATE TRIGGER trg_product_colors_updated
  BEFORE UPDATE ON product_colors
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
