-- Estoque operacional: status logistico/comercial, pedidos a caminho e recebimento por lote.
-- NAO aplicar automaticamente sem confirmacao.

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS logistics_status TEXT,
  ADD COLUMN IF NOT EXISTS commercial_status TEXT,
  ADD COLUMN IF NOT EXISTS inventory_purchase_id UUID REFERENCES inventory_purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_arrival_date DATE,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_note TEXT;

ALTER TABLE inventory_purchases
  ADD COLUMN IF NOT EXISTS logistics_status TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS ordered_at DATE,
  ADD COLUMN IF NOT EXISTS expected_arrival_date DATE,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS notes_logistics TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_logistics_status_check'
      AND conrelid = 'inventory'::regclass
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT inventory_logistics_status_check
      CHECK (
        logistics_status IS NULL
        OR logistics_status IN ('in_stock', 'ordered', 'in_transit', 'received_pending_review', 'supplier_local', 'unavailable')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_commercial_status_check'
      AND conrelid = 'inventory'::regclass
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT inventory_commercial_status_check
      CHECK (
        commercial_status IS NULL
        OR commercial_status IN ('available', 'reservable', 'reserved', 'blocked', 'sold', 'unavailable')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_purchases_logistics_status_check'
      AND conrelid = 'inventory_purchases'::regclass
  ) THEN
    ALTER TABLE inventory_purchases
      ADD CONSTRAINT inventory_purchases_logistics_status_check
      CHECK (
        logistics_status IS NULL
        OR logistics_status IN ('ordered', 'in_transit', 'partially_received', 'received', 'cancelled')
      );
  END IF;
END $$;

UPDATE inventory
SET
  logistics_status = COALESCE(
    logistics_status,
    CASE
      WHEN status IN ('sold', 'returned') THEN 'unavailable'
      WHEN status IN ('reserved', 'active', 'in_stock') THEN 'in_stock'
      WHEN status IN ('pending', 'trade_in_received', 'under_repair') THEN 'received_pending_review'
      ELSE 'in_stock'
    END
  ),
  commercial_status = COALESCE(
    commercial_status,
    CASE
      WHEN status = 'sold' THEN 'sold'
      WHEN status = 'reserved' THEN 'reserved'
      WHEN status IN ('pending', 'trade_in_received', 'under_repair', 'returned') THEN 'blocked'
      ELSE 'available'
    END
  );

UPDATE inventory_purchases
SET
  logistics_status = COALESCE(logistics_status, 'received'),
  ordered_at = COALESCE(ordered_at, purchase_date),
  received_at = COALESCE(received_at, created_at),
  freight_cost = COALESCE(freight_cost, freight_amount);

UPDATE inventory i
SET inventory_purchase_id = pii.purchase_id
FROM inventory_purchase_items pii
WHERE pii.inventory_id = i.id
  AND i.inventory_purchase_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_company_logistics_commercial
  ON inventory (company_id, logistics_status, commercial_status);

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_link
  ON inventory (company_id, inventory_purchase_id);

CREATE INDEX IF NOT EXISTS idx_inventory_expected_arrival
  ON inventory (company_id, expected_arrival_date)
  WHERE expected_arrival_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_purchases_logistics
  ON inventory_purchases (company_id, logistics_status, expected_arrival_date);

CREATE OR REPLACE FUNCTION fn_inventory_auto_status()
RETURNS TRIGGER AS $$
DECLARE
  is_complete BOOLEAN;
BEGIN
  IF NEW.status IN ('reserved', 'sold', 'returned', 'under_repair', 'trade_in_received') THEN
    RETURN NEW;
  END IF;

  IF NEW.logistics_status IN ('ordered', 'in_transit', 'supplier_local', 'unavailable')
     OR NEW.commercial_status IN ('reservable', 'blocked', 'unavailable') THEN
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  IF NEW.logistics_status = 'received_pending_review' THEN
    NEW.status := 'pending';
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
