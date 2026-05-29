-- Operational inventory images are separate from public listing media.
-- product_images remains the public catalog/vitrine gallery.

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS operational_image_url TEXT,
  ADD COLUMN IF NOT EXISTS operational_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS operational_image_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS operational_thumbnail_storage_key TEXT;

