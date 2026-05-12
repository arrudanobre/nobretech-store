CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS orion_decision_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL,
  title TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  confidence TEXT NOT NULL DEFAULT 'medium',
  source_question TEXT NOT NULL DEFAULT '',
  decision_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_status TEXT NOT NULL DEFAULT 'pending',
  reflection TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL,
  review_after TIMESTAMPTZ NULL,
  CONSTRAINT orion_decision_memory_type_check
    CHECK (decision_type IN (
      'capital_allocation',
      'business_strategy',
      'marketing_strategy',
      'inventory_priority',
      'cash_health',
      'sales_performance',
      'operational_action'
    )),
  CONSTRAINT orion_decision_memory_status_check
    CHECK (status IN ('open', 'in_progress', 'done', 'ignored', 'superseded')),
  CONSTRAINT orion_decision_memory_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT orion_decision_memory_confidence_check
    CHECK (confidence IN ('low', 'medium', 'high')),
  CONSTRAINT orion_decision_memory_result_status_check
    CHECK (result_status IN ('successful', 'failed', 'mixed', 'inconclusive', 'pending'))
);

CREATE INDEX IF NOT EXISTS orion_decision_memory_company_status_idx
  ON orion_decision_memory (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS orion_decision_memory_company_type_idx
  ON orion_decision_memory (company_id, decision_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS orion_decision_memory_review_after_idx
  ON orion_decision_memory (company_id, review_after)
  WHERE review_after IS NOT NULL AND status = 'open';

CREATE INDEX IF NOT EXISTS orion_decision_memory_decision_key_idx
  ON orion_decision_memory (company_id, decision_type, status, (decision_payload->>'decisionKey'))
  WHERE decision_payload ? 'decisionKey';

CREATE OR REPLACE FUNCTION trg_orion_decision_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orion_decision_memory_updated_at ON orion_decision_memory;
CREATE TRIGGER trg_orion_decision_memory_updated_at
  BEFORE UPDATE ON orion_decision_memory
  FOR EACH ROW
  EXECUTE FUNCTION trg_orion_decision_memory_updated_at();
