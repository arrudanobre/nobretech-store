-- Imagens sociais separadas por contexto (site / catálogo / portal).
-- Aditivo, idempotente, sem perda de dados. company_brand_profile.og_image_url
-- continua valendo para o SITE (root). Os dois novos campos cobrem catálogo e
-- portal de garantia, permitindo override independente por contexto.

ALTER TABLE company_brand_profile
  ADD COLUMN IF NOT EXISTS catalog_og_image_url TEXT,
  ADD COLUMN IF NOT EXISTS portal_og_image_url TEXT;
