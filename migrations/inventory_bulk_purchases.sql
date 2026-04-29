CREATE TABLE IF NOT EXISTS inventory_purchases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  supplier_id        UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name      TEXT,
  purchase_date      DATE NOT NULL,
  payment_method     TEXT,
  account_id         UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  chart_account_id   UUID REFERENCES finance_chart_accounts(id) ON DELETE SET NULL,
  transaction_id     UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft', 'received', 'cancelled')),
  payment_status     TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  due_date           DATE,
  freight_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_costs_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  products_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_purchase_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  purchase_id          UUID REFERENCES inventory_purchases(id) ON DELETE CASCADE NOT NULL,
  inventory_id         UUID REFERENCES inventory(id) ON DELETE SET NULL,
  catalog_id           UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  product_name         TEXT,
  category             TEXT,
  grade                TEXT,
  quantity             INT NOT NULL DEFAULT 1,
  unit_index           INT NOT NULL DEFAULT 1,
  imei                 TEXT,
  imei2                TEXT,
  serial_number        TEXT,
  battery_health       INT,
  unit_cost            NUMERIC(10,2) NOT NULL DEFAULT 0,
  freight_allocated    NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_cost_allocated NUMERIC(10,2) NOT NULL DEFAULT 0,
  landed_unit_cost     NUMERIC(10,2) NOT NULL DEFAULT 0,
  suggested_price      NUMERIC(10,2),
  margin_pct           NUMERIC(10,2),
  checklist_required   BOOLEAN NOT NULL DEFAULT FALSE,
  checklist_status     TEXT NOT NULL DEFAULT 'not_required' CHECK (checklist_status IN ('not_required', 'pending', 'completed')),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_purchases_company_date
  ON inventory_purchases (company_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_items_purchase
  ON inventory_purchase_items (purchase_id, unit_index);

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_items_inventory
  ON inventory_purchase_items (inventory_id);
