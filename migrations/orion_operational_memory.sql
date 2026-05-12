CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS orion_operational_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'open',
  importance TEXT NOT NULL DEFAULT 'medium',
  source TEXT NOT NULL DEFAULT 'orion',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orion_operational_memory_type_check
    CHECK (memory_type IN (
      'owner_decision',
      'owner_preference',
      'open_alert',
      'recommended_action',
      'follow_up',
      'financial_context',
      'sales_context',
      'inventory_context',
      'lead_context'
    )),
  CONSTRAINT orion_operational_memory_status_check
    CHECK (status IN ('open', 'resolved', 'ignored', 'superseded')),
  CONSTRAINT orion_operational_memory_importance_check
    CHECK (importance IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS orion_operational_memory_company_status_idx
  ON orion_operational_memory (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS orion_operational_memory_company_type_idx
  ON orion_operational_memory (company_id, memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS orion_operational_memory_entity_idx
  ON orion_operational_memory (company_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orion_operational_memory_memory_key_idx
  ON orion_operational_memory (company_id, memory_type, status, (metadata->>'memoryKey'))
  WHERE metadata ? 'memoryKey';

CREATE OR REPLACE FUNCTION trg_orion_operational_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orion_operational_memory_updated_at ON orion_operational_memory;
CREATE TRIGGER trg_orion_operational_memory_updated_at
  BEFORE UPDATE ON orion_operational_memory
  FOR EACH ROW
  EXECUTE FUNCTION trg_orion_operational_memory_updated_at();
