-- Add support for virtual supplier stock origin

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'own';

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

UPDATE inventory
SET type = 'own'
WHERE type IS NULL;

ALTER TABLE inventory
  ALTER COLUMN type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_type_check'
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT inventory_type_check CHECK (type IN ('own', 'supplier'));
  END IF;
END
$$;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'own';

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS supplier_cost DECIMAL(10,2);

UPDATE sales
SET source_type = 'own'
WHERE source_type IS NULL;

ALTER TABLE sales
  ALTER COLUMN source_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_source_type_check'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_source_type_check CHECK (source_type IN ('own', 'supplier'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_inventory_company_status_type ON inventory (company_id, status, type);

CREATE OR REPLACE FUNCTION fn_create_warranty_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO warranties (company_id, sale_id, inventory_id, customer_id, start_date, end_date, status)
  VALUES (
    NEW.company_id,
    NEW.id,
    NEW.inventory_id,
    NEW.customer_id,
    NEW.sale_date,
    NEW.sale_date + (NEW.warranty_months || ' months')::INTERVAL,
    'active'
  );

  IF COALESCE(NEW.source_type, 'own') = 'own' THEN
    UPDATE inventory
    SET status = 'sold'
    WHERE id = NEW.inventory_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;