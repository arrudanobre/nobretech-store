-- Official walk-in sales support.
-- Keeps anonymous/walk-in customers as sale snapshots instead of fake customer records.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'identified',
  ADD COLUMN IF NOT EXISTS walk_in_label TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_phone TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_customer_type_check'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_customer_type_check
      CHECK (customer_type IN ('identified', 'walk_in'));
  END IF;
END $$;

UPDATE sales
SET customer_type = 'identified'
WHERE customer_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_customer_type
  ON sales(company_id, customer_type);

CREATE OR REPLACE FUNCTION fn_ensure_sale_public_access()
RETURNS TRIGGER AS $$
DECLARE
  candidate_token TEXT;
BEGIN
  IF COALESCE(NEW.sale_status, 'completed') <> 'completed'
    OR COALESCE(NEW.customer_type, 'identified') = 'walk_in' THEN
    IF NEW.public_access_token IS NULL AND NEW.public_access_pin IS NULL THEN
      NEW.public_access_enabled := FALSE;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.public_access_enabled IS NULL
    OR NEW.public_access_token IS NULL
    OR NEW.public_access_pin IS NULL THEN
    NEW.public_access_enabled := TRUE;
  END IF;

  IF NEW.public_access_created_at IS NULL THEN
    NEW.public_access_created_at := NOW();
  END IF;

  IF NEW.public_access_pin IS NULL THEN
    NEW.public_access_pin := fn_nobretech_public_access_pin();
  END IF;

  IF NEW.public_access_token IS NULL THEN
    LOOP
      candidate_token := fn_nobretech_public_access_token();
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM sales
        WHERE public_access_token = candidate_token
          AND id IS DISTINCT FROM NEW.id
      );
    END LOOP;
    NEW.public_access_token := candidate_token;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
