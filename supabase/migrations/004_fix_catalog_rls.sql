-- =========================================================================
-- FIX RLS - Product Catalog
-- product_catalog não tem company_id, então RLS deve permitir leitura pública
-- =========================================================================

-- Permitir que qualquer usuário logado leia o catálogo
DROP POLICY IF EXISTS "catalog_public_read" ON product_catalog;

CREATE POLICY "catalog_public_read" ON product_catalog
  FOR SELECT USING (auth.role() = 'authenticated');
