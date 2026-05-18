-- Supplier offer opportunities ------------------------------------------------
-- These rows are commercial opportunities received from suppliers.
-- They are intentionally separate from inventory, sales and stock reports.

CREATE TABLE IF NOT EXISTS supplier_offer_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  source TEXT NULL DEFAULT 'whatsapp',
  notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES supplier_offer_batches(id) ON DELETE CASCADE,
  supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  source_line TEXT NOT NULL,
  source_section TEXT NULL,
  category TEXT NULL,
  brand TEXT NULL,
  model TEXT NULL,
  variant TEXT NULL,
  storage TEXT NULL,
  size TEXT NULL,
  color TEXT NULL,
  condition TEXT NULL,
  internal_grade TEXT NULL,
  battery_health INTEGER NULL,
  warranty_type TEXT NOT NULL DEFAULT 'none',
  warranty_label TEXT NULL,
  warranty_until TEXT NULL,
  origin TEXT NULL,
  supplier_price NUMERIC(12,2) NULL,
  suggested_sale_price NUMERIC(12,2) NULL,
  estimated_margin NUMERIC(12,2) NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'draft',
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  duplicate_key TEXT NULL,
  duplicate_candidate BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT supplier_offers_condition_check
    CHECK (condition IS NULL OR condition IN ('sealed', 'used', 'unknown')),
  CONSTRAINT supplier_offers_confidence_check
    CHECK (confidence IN ('high', 'medium', 'low')),
  CONSTRAINT supplier_offers_warranty_type_check
    CHECK (warranty_type IN ('none', 'apple', 'nobretech', 'supplier', 'unknown')),
  CONSTRAINT supplier_offers_status_check
    CHECK (status IN (
      'draft',
      'available',
      'needs_review',
      'ignored',
      'unavailable',
      'reserved_with_supplier',
      'converted_to_inventory',
      'canceled'
    )),
  CONSTRAINT supplier_offers_battery_health_check
    CHECK (battery_health IS NULL OR (battery_health >= 0 AND battery_health <= 100))
);

CREATE INDEX IF NOT EXISTS idx_supplier_offer_batches_company_created
  ON supplier_offer_batches (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_offers_company_status_created
  ON supplier_offers (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_offers_supplier_created
  ON supplier_offers (supplier_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_offers_duplicate_key
  ON supplier_offers (company_id, duplicate_key)
  WHERE duplicate_key IS NOT NULL;

ALTER TABLE supplier_offers
  ADD COLUMN IF NOT EXISTS warranty_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS warranty_until TEXT NULL;

CREATE OR REPLACE FUNCTION set_supplier_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_offers_updated_at ON supplier_offers;
CREATE TRIGGER trg_supplier_offers_updated_at
BEFORE UPDATE ON supplier_offers
FOR EACH ROW
EXECUTE FUNCTION set_supplier_offers_updated_at();
