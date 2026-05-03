-- CRM de Leads de Marketing.
-- Jornada: campanha -> lead -> atendimento -> venda -> receita/lucro/ROI.

CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  product_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT,
  origin TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  product_interest TEXT,
  notes TEXT,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilidade com uma versão anterior da migration, caso ela já tenha sido aplicada.
ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS campaign_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS sale_id UUID,
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_leads'
      AND column_name = 'marketing_campaign_id'
  ) THEN
    UPDATE marketing_leads
    SET campaign_id = COALESCE(campaign_id, marketing_campaign_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_leads'
      AND column_name = 'converted_sale_id'
  ) THEN
    UPDATE marketing_leads
    SET sale_id = COALESCE(sale_id, converted_sale_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_leads'
      AND column_name = 'full_name'
  ) THEN
    UPDATE marketing_leads
    SET name = COALESCE(name, full_name);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_leads'
      AND column_name = 'source_channel'
  ) THEN
    UPDATE marketing_leads
    SET source = COALESCE(source, source_channel);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_leads'
      AND column_name = 'next_action_date'
  ) THEN
    UPDATE marketing_leads
    SET next_action_at = COALESCE(next_action_at, next_action_date::timestamptz);
  END IF;
END $$;

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
    WHERE conname = 'marketing_leads_campaign_id_fkey'
      AND conrelid = 'marketing_leads'::regclass
  ) THEN
    ALTER TABLE marketing_leads
      ADD CONSTRAINT marketing_leads_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_leads_customer_id_fkey'
      AND conrelid = 'marketing_leads'::regclass
  ) THEN
    ALTER TABLE marketing_leads
      ADD CONSTRAINT marketing_leads_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_leads_sale_id_fkey'
      AND conrelid = 'marketing_leads'::regclass
  ) THEN
    ALTER TABLE marketing_leads
      ADD CONSTRAINT marketing_leads_sale_id_fkey
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_leads_product_id_fkey'
      AND conrelid = 'marketing_leads'::regclass
  ) THEN
    ALTER TABLE marketing_leads
      ADD CONSTRAINT marketing_leads_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS marketing_lead_id UUID;

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
CREATE INDEX IF NOT EXISTS idx_sales_company_lead ON sales(company_id, marketing_lead_id);

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_leads_updated ON marketing_leads;
CREATE TRIGGER trg_marketing_leads_updated
  BEFORE UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "data_access_marketing_leads" ON marketing_leads;
    CREATE POLICY "data_access_marketing_leads" ON marketing_leads FOR ALL
      USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
      WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;
