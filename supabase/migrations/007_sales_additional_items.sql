-- ============================================================================
-- NOBRETECH STORE — Sales Additional Items (Upsell / Brinde)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_additional_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  sale_id      UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id   UUID,
  type         TEXT NOT NULL CHECK (type IN ('upsell', 'free')),
  name         TEXT NOT NULL,
  cost_price   DECIMAL(10,2) NOT NULL,
  sale_price   DECIMAL(10,2),
  profit       DECIMAL(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN type = 'upsell' AND sale_price IS NOT NULL THEN sale_price - cost_price
      WHEN type = 'free' THEN -cost_price
      ELSE 0
    END
  ) STORED,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_additional_items_sale ON sales_additional_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_additional_items_company ON sales_additional_items (company_id);

-- RLS
ALTER TABLE IF EXISTS sales_additional_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_access_additional_items" ON sales_additional_items;
CREATE POLICY "data_access_additional_items" ON sales_additional_items FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
