-- Trade-in full flow: lifecycle, traceability and constraints

-- 1) Traceability fields on inventory
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'purchase';

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS source_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;

UPDATE inventory
SET origin = COALESCE(origin, 'purchase')
WHERE origin IS NULL;

-- Existing rows that used old trade-in status become trade_in origin
UPDATE inventory
SET origin = 'trade_in'
WHERE status = 'trade_in_received';

ALTER TABLE inventory
  ALTER COLUMN origin SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_origin_check'
      AND conrelid = 'inventory'::regclass
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT inventory_origin_check CHECK (origin IN ('purchase', 'trade_in', 'return'));
  END IF;
END
$$;

-- 2) Inventory lifecycle status: pending | active (+ compatibility window)
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'inventory'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE inventory DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_status_check
  CHECK (status IN ('pending', 'active', 'in_stock', 'sold', 'returned', 'under_repair', 'trade_in_received'));

-- 3) Sales with trade-in must have relation (non-blocking for legacy rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_trade_in_required_check'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_trade_in_required_check
      CHECK (has_trade_in IS DISTINCT FROM TRUE OR trade_in_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

-- 4) Auto lifecycle function: pending -> active when required fields are complete
CREATE OR REPLACE FUNCTION fn_inventory_auto_status()
RETURNS TRIGGER AS $$
DECLARE
  is_complete BOOLEAN;
BEGIN
  -- Keep explicit terminal statuses untouched
  IF NEW.status IN ('sold', 'returned', 'under_repair') THEN
    RETURN NEW;
  END IF;

  is_complete := (
    COALESCE(NEW.purchase_price, 0) > 0
    AND NEW.purchase_date IS NOT NULL
    AND COALESCE(NEW.grade, '') <> ''
    AND (COALESCE(NEW.imei, '') <> '' OR COALESCE(NEW.serial_number, '') <> '')
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

DROP TRIGGER IF EXISTS trg_inventory_auto_status ON inventory;
CREATE TRIGGER trg_inventory_auto_status
BEFORE INSERT OR UPDATE OF
  purchase_price,
  purchase_date,
  grade,
  imei,
  serial_number,
  catalog_id,
  notes,
  condition_notes,
  status
ON inventory
FOR EACH ROW
EXECUTE FUNCTION fn_inventory_auto_status();

-- 5) Backfill old statuses to new lifecycle values
UPDATE inventory
SET status = CASE
  WHEN status IN ('sold', 'returned', 'under_repair') THEN status
  WHEN (
    COALESCE(purchase_price, 0) > 0
    AND purchase_date IS NOT NULL
    AND COALESCE(grade, '') <> ''
    AND (COALESCE(imei, '') <> '' OR COALESCE(serial_number, '') <> '')
    AND (
      catalog_id IS NOT NULL
      OR COALESCE(BTRIM(notes), '') <> ''
      OR COALESCE(BTRIM(condition_notes), '') <> ''
    )
  ) THEN 'active'
  ELSE 'pending'
END;

-- 6) Performance indexes for stock and traceability
CREATE INDEX IF NOT EXISTS idx_inventory_company_status_origin
  ON inventory (company_id, status, origin);

CREATE INDEX IF NOT EXISTS idx_inventory_source_sale
  ON inventory (source_sale_id);
