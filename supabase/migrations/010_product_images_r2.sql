-- Product image uploads backed by Cloudflare R2.
-- Static catalog assets remain in /public/product-assets and are not stored here.

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES inventory(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  thumbnail_storage_key TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  width INT CHECK (width IS NULL OR width > 0),
  height INT CHECK (height IS NULL OR height > 0),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'uploaded' CHECK (source IN ('uploaded', 'static_asset')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_storage_key
  ON product_images (storage_key);

CREATE INDEX IF NOT EXISTS idx_product_images_company_product
  ON product_images (company_id, product_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary_per_product
  ON product_images (product_id)
  WHERE is_primary;

DROP TRIGGER IF EXISTS trg_product_images_updated ON product_images;
CREATE TRIGGER trg_product_images_updated
  BEFORE UPDATE ON product_images
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL THEN
    DROP POLICY IF EXISTS "data_access_product_images" ON product_images;
    CREATE POLICY "data_access_product_images" ON product_images FOR ALL
      USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
      WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
  END IF;
END
$$;
