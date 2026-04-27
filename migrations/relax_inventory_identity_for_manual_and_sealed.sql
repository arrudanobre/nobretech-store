CREATE OR REPLACE FUNCTION fn_inventory_auto_status()
RETURNS TRIGGER AS $$
DECLARE
  is_complete BOOLEAN;
BEGIN
  IF NEW.status IN ('sold', 'returned', 'under_repair') THEN
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

UPDATE inventory
SET status = 'active'
WHERE status NOT IN ('sold', 'returned', 'under_repair')
  AND COALESCE(purchase_price, 0) > 0
  AND purchase_date IS NOT NULL
  AND COALESCE(grade, '') <> ''
  AND (
    COALESCE(imei, '') <> ''
    OR COALESCE(serial_number, '') <> ''
    OR grade = 'Lacrado'
    OR catalog_id IS NULL
    OR COALESCE(BTRIM(notes), '') <> ''
    OR COALESCE(BTRIM(condition_notes), '') <> ''
  )
  AND (
    catalog_id IS NOT NULL
    OR COALESCE(BTRIM(notes), '') <> ''
    OR COALESCE(BTRIM(condition_notes), '') <> ''
  );
