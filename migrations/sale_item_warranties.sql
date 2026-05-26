-- Fase 2D.2: Garantia por item vendido.
-- Cria sale_item_warranties referenciando sale_items(id) (Fase 2D.1).
-- Snapshot historico obrigatorio (policy + termos) para preservar regra vigente na venda.
-- Sem alteracao de comportamento atual: nenhum consumidor le esta tabela ainda.

CREATE TABLE IF NOT EXISTS sale_item_warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  warranty_policy_id UUID NOT NULL REFERENCES warranty_policies(id) ON DELETE RESTRICT,
  warranty_nature TEXT NOT NULL,
  warranty_name TEXT NOT NULL,
  warranty_label TEXT,
  duration_months INTEGER,
  duration_days INTEGER,
  calculation_mode TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  manufacturer_coverage_reference TEXT,
  manufacturer_coverage_url TEXT,
  manual_notes TEXT,
  policy_snapshot JSONB NOT NULL,
  terms_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_item_warranties_warranty_nature_check
    CHECK (warranty_nature IN ('legal', 'contractual', 'manufacturer', 'operational_support', 'legacy')),
  CONSTRAINT sale_item_warranties_calculation_mode_check
    CHECK (calculation_mode IN ('calendar_months', 'fixed_days', 'manual_dates')),
  CONSTRAINT sale_item_warranties_duration_months_nonneg
    CHECK (duration_months IS NULL OR duration_months >= 0),
  CONSTRAINT sale_item_warranties_duration_days_nonneg
    CHECK (duration_days IS NULL OR duration_days >= 0),
  CONSTRAINT sale_item_warranties_ends_after_starts
    CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT sale_item_warranties_policy_snapshot_object
    CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  CONSTRAINT sale_item_warranties_terms_snapshot_array
    CHECK (jsonb_typeof(terms_snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_sale_item_warranties_company
  ON sale_item_warranties(company_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_warranties_sale
  ON sale_item_warranties(company_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_warranties_sale_item
  ON sale_item_warranties(sale_item_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_warranties_inventory
  ON sale_item_warranties(inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_item_warranties_policy
  ON sale_item_warranties(warranty_policy_id);

-- Garante no maximo uma garantia ativa por item vendido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_item_warranties_unique_active_item
  ON sale_item_warranties(sale_item_id)
  WHERE active = TRUE;

DROP TRIGGER IF EXISTS trg_sale_item_warranties_updated_at ON sale_item_warranties;
CREATE TRIGGER trg_sale_item_warranties_updated_at
  BEFORE UPDATE ON sale_item_warranties
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
