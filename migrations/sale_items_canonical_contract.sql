-- Fase 2D.1: Contrato canonico de itens de venda.
-- Cria sale_items e materializa, de forma idempotente, o item principal de sales
-- e os adicionais/brindes/upsells de sales_additional_items.
-- Nenhum consumidor passa a ler esta tabela nesta fase.

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  source_table TEXT NOT NULL,
  source_id UUID,
  item_role TEXT NOT NULL,
  item_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2),
  total_price NUMERIC(10,2),
  unit_cost NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  is_gift BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_items_source_table_check
    CHECK (source_table IN ('sales', 'sales_additional_items')),
  CONSTRAINT sale_items_item_role_check
    CHECK (item_role IN ('main', 'upsell', 'gift', 'accessory', 'service', 'other')),
  CONSTRAINT sale_items_item_type_check
    CHECK (item_type IN ('device', 'accessory', 'service', 'other')),
  CONSTRAINT sale_items_quantity_positive_check
    CHECK (quantity > 0),
  CONSTRAINT sale_items_prices_nonnegative_check
    CHECK (
      (unit_price IS NULL OR unit_price >= 0)
      AND (total_price IS NULL OR total_price >= 0)
      AND (unit_cost IS NULL OR unit_cost >= 0)
      AND (total_cost IS NULL OR total_cost >= 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_sale_items_company
  ON sale_items(company_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale
  ON sale_items(company_id, sale_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_sale_items_inventory
  ON sale_items(company_id, inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_source
  ON sale_items(company_id, source_table, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_items_unique_source
  ON sale_items(company_id, source_table, source_id)
  WHERE source_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sale_items_updated_at ON sale_items;
CREATE TRIGGER trg_sale_items_updated_at
  BEFORE UPDATE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Item principal: sales.inventory_id.
-- A alocacao de preco do principal desconta upsells cobrados para evitar que uma
-- soma futura de sale_items duplique a receita que sales.sale_price ja carrega.
WITH charged_additionals AS (
  SELECT
    sale_id,
    company_id,
    COALESCE(SUM(CASE WHEN type = 'upsell' THEN COALESCE(sale_price, 0) ELSE 0 END), 0)::numeric(10,2)
      AS charged_total
  FROM sales_additional_items
  GROUP BY sale_id, company_id
)
INSERT INTO sale_items (
  company_id,
  sale_id,
  inventory_item_id,
  source_table,
  source_id,
  item_role,
  item_type,
  display_name,
  quantity,
  unit_price,
  total_price,
  unit_cost,
  total_cost,
  is_gift,
  sort_order,
  metadata,
  active,
  created_at
)
SELECT
  s.company_id,
  s.id,
  s.inventory_id,
  'sales',
  s.id,
  'main',
  CASE
    WHEN i.product_type IN ('device', 'accessory', 'service', 'other') THEN i.product_type
    WHEN lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%acess%' THEN 'accessory'
    WHEN lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%serv%' THEN 'service'
    ELSE 'device'
  END,
  COALESCE(
    NULLIF(BTRIM(CONCAT_WS(' ', pc.brand, pc.model, pc.variant, pc.storage, pc.color)), ''),
    NULLIF(BTRIM(CONCAT_WS(' ', i.category_name_snapshot, i.subcategory_name_snapshot, i.attribute_summary_snapshot)), ''),
    NULLIF(BTRIM(i.notes), ''),
    'Item principal da venda'
  ),
  1,
  GREATEST(s.sale_price - COALESCE(ca.charged_total, 0), 0)::numeric(10,2),
  GREATEST(s.sale_price - COALESCE(ca.charged_total, 0), 0)::numeric(10,2),
  i.purchase_price,
  i.purchase_price,
  FALSE,
  0,
  jsonb_build_object(
    'source', 'backfill_2d1',
    'legacy_source_table', 'sales',
    'legacy_sale_price', s.sale_price,
    'charged_additional_items_total', COALESCE(ca.charged_total, 0),
    'principal_price_allocation', 'sales.sale_price - charged upsell additional items',
    'legacy_warranty_months', s.warranty_months,
    'legacy_warranty_start', s.warranty_start,
    'legacy_warranty_end', s.warranty_end
  ),
  TRUE,
  COALESCE(s.created_at, NOW())
FROM sales s
JOIN inventory i ON i.id = s.inventory_id
LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
LEFT JOIN charged_additionals ca ON ca.sale_id = s.id AND ca.company_id = s.company_id
WHERE s.company_id IS NOT NULL
  AND s.inventory_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sale_items existing
    WHERE existing.company_id = s.company_id
      AND existing.source_table = 'sales'
      AND existing.source_id = s.id
  );

-- Itens adicionais: sales_additional_items.
-- inventory_item_id so e preenchido quando product_id encontra uma linha real em inventory.
INSERT INTO sale_items (
  company_id,
  sale_id,
  inventory_item_id,
  source_table,
  source_id,
  item_role,
  item_type,
  display_name,
  quantity,
  unit_price,
  total_price,
  unit_cost,
  total_cost,
  is_gift,
  sort_order,
  metadata,
  active,
  created_at
)
SELECT
  sai.company_id,
  sai.sale_id,
  i.id,
  'sales_additional_items',
  sai.id,
  CASE WHEN sai.type = 'free' THEN 'gift' ELSE 'upsell' END,
  CASE
    WHEN i.id IS NOT NULL AND i.product_type IN ('device', 'accessory', 'service', 'other') THEN i.product_type
    WHEN i.id IS NOT NULL AND lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%acess%' THEN 'accessory'
    WHEN i.id IS NOT NULL AND lower(COALESCE(pc.category, i.category_name_snapshot, i.type, '')) LIKE '%serv%' THEN 'service'
    WHEN i.id IS NOT NULL THEN 'device'
    ELSE 'other'
  END,
  sai.name,
  1,
  COALESCE(sai.sale_price, 0)::numeric(10,2),
  COALESCE(sai.sale_price, 0)::numeric(10,2),
  sai.cost_price,
  sai.cost_price,
  sai.type = 'free',
  100 + ROW_NUMBER() OVER (PARTITION BY sai.sale_id ORDER BY sai.created_at, sai.id),
  jsonb_build_object(
    'source', 'backfill_2d1',
    'legacy_source_table', 'sales_additional_items',
    'legacy_type', sai.type,
    'legacy_product_id', sai.product_id,
    'product_id_matched_inventory', i.id IS NOT NULL,
    'packaging_type', sai.packaging_type,
    'packaging_notes', sai.packaging_notes
  ),
  TRUE,
  COALESCE(sai.created_at, NOW())
FROM sales_additional_items sai
JOIN sales s ON s.id = sai.sale_id AND s.company_id = sai.company_id
LEFT JOIN inventory i ON i.id = sai.product_id AND i.company_id = sai.company_id
LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
WHERE sai.company_id IS NOT NULL
  AND sai.sale_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sale_items existing
    WHERE existing.company_id = sai.company_id
      AND existing.source_table = 'sales_additional_items'
      AND existing.source_id = sai.id
  );
