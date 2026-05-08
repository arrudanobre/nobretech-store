CREATE TABLE IF NOT EXISTS orion_ai_analysis_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL DEFAULT 'executive'
    CHECK (analysis_type IN ('executive', 'chat')),
  question TEXT,
  prompt_hash TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'local')),
  response_json JSONB,
  data_snapshot JSONB,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6),
  external_sources_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orion_ai_logs_company_created
  ON orion_ai_analysis_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orion_ai_logs_company_type_hash
  ON orion_ai_analysis_logs(company_id, analysis_type, prompt_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orion_ai_logs_company_month
  ON orion_ai_analysis_logs(company_id, created_at)
  WHERE status IN ('success', 'local', 'error');
