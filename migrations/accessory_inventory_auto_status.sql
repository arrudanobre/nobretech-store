-- Treat catalogued accessories as complete without IMEI/serial.
-- Accessories still need cost, acquisition date, grade and product identity.

CREATE OR REPLACE FUNCTION fn_inventory_auto_status()
RETURNS TRIGGER AS $$
DECLARE
  is_complete BOOLEAN;
  inventory_category TEXT;
  is_accessory BOOLEAN;
BEGIN
  IF NEW.status IN ('reserved', 'sold', 'returned', 'under_repair')
    OR (NEW.status = 'trade_in_received' AND COALESCE(NEW.origin, '') = 'trade_in') THEN
    RETURN NEW;
  END IF;

  IF NEW.catalog_id IS NOT NULL THEN
    SELECT category
      INTO inventory_category
      FROM product_catalog
      WHERE id = NEW.catalog_id
      LIMIT 1;
  END IF;

  is_accessory := (
    inventory_category = 'accessories'
    OR CONCAT_WS(' ', NEW.notes, NEW.condition_notes) ~* '(acess[oó]rio|capa|pel[ií]cula|pencil|caneta|cabo|fonte|carregador|fone)'
  );

  is_complete := (
    COALESCE(NEW.purchase_price, 0) > 0
    AND NEW.purchase_date IS NOT NULL
    AND COALESCE(NEW.grade, '') <> ''
    AND (
      COALESCE(NEW.imei, '') <> ''
      OR COALESCE(NEW.serial_number, '') <> ''
      OR NEW.grade = 'Lacrado'
      OR is_accessory
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

UPDATE inventory AS i
SET status = 'active'
FROM product_catalog AS pc
WHERE i.catalog_id = pc.id
  AND pc.category = 'accessories'
  AND COALESCE(i.origin, '') <> 'trade_in'
  AND i.status IN ('pending', 'trade_in_received')
  AND COALESCE(i.purchase_price, 0) > 0
  AND i.purchase_date IS NOT NULL
  AND COALESCE(i.grade, '') <> '';
