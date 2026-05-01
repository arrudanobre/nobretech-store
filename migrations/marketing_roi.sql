-- Marketing ROI and sale attribution.
-- Campaigns are attribution records only: they do not move cash by themselves.

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'instagram',
  objective TEXT,
  start_date DATE,
  end_date DATE,
  budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned', 'active', 'paused', 'finished', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_company_status
  ON marketing_campaigns(company_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_company_dates
  ON marketing_campaigns(company_id, start_date, end_date);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_origin TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS marketing_campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_company_origin
  ON sales(company_id, sale_origin);

CREATE INDEX IF NOT EXISTS idx_sales_company_campaign
  ON sales(company_id, marketing_campaign_id);
