ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT;

ALTER TABLE marketing_leads
  DROP CONSTRAINT IF EXISTS marketing_leads_temperature_check;

ALTER TABLE marketing_leads
  ADD CONSTRAINT marketing_leads_temperature_check
  CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold', 'warm', 'hot'));

CREATE INDEX IF NOT EXISTS marketing_leads_company_temperature_idx
  ON marketing_leads(company_id, lead_temperature);
