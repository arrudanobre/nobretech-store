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
  ADD COLUMN IF NOT EXISTS marketing_lead_id UUID,
  ADD COLUMN IF NOT EXISTS lead_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_company_origin
  ON sales(company_id, sale_origin);

CREATE INDEX IF NOT EXISTS idx_sales_company_campaign
  ON sales(company_id, marketing_campaign_id);

CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  product_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  origin TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_service', 'table_sent', 'hot_negotiation', 'sold', 'lost')),
  product_interest TEXT,
  notes TEXT,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS campaign_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS sale_id UUID,
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ;

UPDATE marketing_leads
SET name = 'Lead sem nome'
WHERE name IS NULL;

ALTER TABLE marketing_leads
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'new';

ALTER TABLE marketing_leads
  DROP CONSTRAINT IF EXISTS marketing_leads_status_check;

UPDATE marketing_leads
SET status = CASE status
  WHEN 'contacted' THEN 'in_service'
  WHEN 'proposal' THEN 'table_sent'
  WHEN 'qualified' THEN 'hot_negotiation'
  WHEN 'converted' THEN 'sold'
  ELSE status
END;

ALTER TABLE marketing_leads
  ADD CONSTRAINT marketing_leads_status_check
  CHECK (status IN ('new', 'in_service', 'table_sent', 'hot_negotiation', 'sold', 'lost'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_marketing_lead_id_fkey'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_marketing_lead_id_fkey
      FOREIGN KEY (marketing_lead_id) REFERENCES marketing_leads(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS marketing_leads_company_id_idx ON marketing_leads(company_id);
CREATE INDEX IF NOT EXISTS marketing_leads_campaign_id_idx ON marketing_leads(campaign_id);
CREATE INDEX IF NOT EXISTS marketing_leads_customer_id_idx ON marketing_leads(customer_id);
CREATE INDEX IF NOT EXISTS marketing_leads_sale_id_idx ON marketing_leads(sale_id);
CREATE INDEX IF NOT EXISTS marketing_leads_status_idx ON marketing_leads(status);
CREATE INDEX IF NOT EXISTS marketing_leads_created_at_idx ON marketing_leads(created_at);
CREATE INDEX IF NOT EXISTS marketing_leads_company_status_idx ON marketing_leads(company_id, status);
CREATE INDEX IF NOT EXISTS marketing_leads_company_campaign_idx ON marketing_leads(company_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_sales_company_lead
  ON sales(company_id, marketing_lead_id);
