ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_status_check;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_status_check
  CHECK (status IN ('pending', 'active', 'in_stock', 'reserved', 'sold', 'returned', 'under_repair', 'trade_in_received'));

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS payment_due_date DATE;

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_sale_status_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_sale_status_check
  CHECK (sale_status IN ('reserved', 'completed', 'cancelled'));

CREATE OR REPLACE FUNCTION fn_inventory_auto_status()
RETURNS TRIGGER AS $$
DECLARE
  is_complete BOOLEAN;
BEGIN
  IF NEW.status IN ('reserved', 'sold', 'returned', 'under_repair') THEN
    RETURN NEW;
  END IF;

  is_complete := (
    COALESCE(NEW.purchase_price, 0) > 0
    AND NEW.purchase_date IS NOT NULL
    AND COALESCE(NEW.grade, '') <> ''
    AND (
      COALESCE(NEW.imei, '') <> ''
      OR COALESCE(NEW.serial_number, '') <> ''
      OR NEW.grade = 'Lacrado'
      OR NEW.catalog_id IS NULL
      OR COALESCE(BTRIM(NEW.notes), '') <> ''
      OR COALESCE(BTRIM(NEW.condition_notes), '') <> ''
    )
    AND (
      NEW.catalog_id IS NOT NULL
      OR COALESCE(BTRIM(NEW.notes), '') <> ''
      OR COALESCE(BTRIM(NEW.condition_notes), '') <> ''
    )
  );

  IF is_complete THEN
    NEW.status := 'active';
  ELSE
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_create_warranty_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.sale_status, 'completed') <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.warranty_months > 0 THEN
    INSERT INTO warranties (company_id, sale_id, inventory_id, customer_id, start_date, end_date, status)
    VALUES (
      NEW.company_id,
      NEW.id,
      NEW.inventory_id,
      NEW.customer_id,
      COALESCE(NEW.warranty_start, NEW.sale_date),
      COALESCE(NEW.warranty_end, NEW.sale_date + (NEW.warranty_months || ' months')::INTERVAL),
      'active'
    );
  END IF;

  IF COALESCE(NEW.source_type, 'own') = 'own' THEN
    UPDATE inventory
    SET status = 'sold'
    WHERE id = NEW.inventory_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_sales_status_due ON sales (company_id, sale_status, payment_due_date);
