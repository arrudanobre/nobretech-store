-- Guardrails for reserved sales and trade-in stock.
-- Existing inconsistent rows are intentionally not changed here; review them
-- with the report query below before validating the constraint.

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_trade_in_type_own_check;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_trade_in_type_own_check
  CHECK (origin <> 'trade_in' OR type = 'own')
  NOT VALID;

CREATE OR REPLACE FUNCTION fn_inventory_auto_status()
RETURNS TRIGGER AS $$
DECLARE
  is_complete BOOLEAN;
BEGIN
  IF NEW.status IN ('reserved', 'sold', 'returned', 'under_repair', 'trade_in_received') THEN
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

-- Manual review report for legacy rows that must be corrected operationally
-- before running: ALTER TABLE inventory VALIDATE CONSTRAINT inventory_trade_in_type_own_check;
SELECT
  id,
  company_id,
  origin,
  type,
  supplier_id,
  supplier_name,
  source_sale_id,
  status
FROM inventory
WHERE origin = 'trade_in'
  AND type <> 'own';
