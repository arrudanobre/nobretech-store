-- ============================================================================
-- SUPPLIER PRICES — Reference table for trade-in valuation
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  supplier_name   TEXT,
  category        TEXT NOT NULL,
  model           TEXT NOT NULL,
  storage         TEXT,
  color           TEXT,
  grade           TEXT,
  price           DECIMAL(10,2) NOT NULL,
  currency        TEXT DEFAULT 'BRL',
  source_url      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add grade column if table exists but column doesn't
ALTER TABLE supplier_prices ADD COLUMN IF NOT EXISTS grade TEXT;

CREATE INDEX IF NOT EXISTS idx_supplier_prices_category_model ON supplier_prices (category, model);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_grade ON supplier_prices (grade);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_company ON supplier_prices (company_id);

ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_access_supplier_prices" ON supplier_prices;
CREATE POLICY "data_access_supplier_prices" ON supplier_prices FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
