-- ============================================================================
-- NOBRETECH STORE - Railway/PostgreSQL schema
-- ============================================================================
-- Use this file in Railway's PostgreSQL query runner or via psql.
-- It is Supabase-free: no auth schema, no RLS, no Supabase Storage dependency.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Companies ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL DEFAULT REPLACE(LOWER(gen_random_uuid()::TEXT), '-', ''),
  logo_url   TEXT,
  settings   JSONB DEFAULT '{}',
  plan       TEXT DEFAULT 'solo' CHECK (plan IN ('solo', 'starter', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- App users ------------------------------------------------------------------
-- Railway/Postgres does not provide Supabase Auth. Keep users local to the app.
-- The current frontend still needs an auth replacement before it can use this.

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email      TEXT UNIQUE,
  full_name  TEXT,
  role       TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'operator')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  contact      TEXT,
  phone        TEXT,
  email        TEXT,
  city         TEXT,
  notes        TEXT,
  rating       INT DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Product catalog ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_catalog (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT NOT NULL CHECK (category IN ('iphone', 'ipad', 'applewatch', 'airpods', 'macbook', 'garmin', 'accessories')),
  brand      TEXT NOT NULL,
  model      TEXT NOT NULL,
  variant    TEXT,
  storage    TEXT,
  color      TEXT,
  color_hex  TEXT,
  year       INT,
  specs      JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Checklists -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS checklists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  inventory_id UUID,
  device_type  TEXT NOT NULL,
  items        JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  pdf_url      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  catalog_id      UUID REFERENCES product_catalog(id),
  imei            TEXT UNIQUE,
  serial_number   TEXT,
  imei2           TEXT,
  grade           TEXT CHECK (grade IN ('Lacrado', 'A+', 'A', 'A-', 'B+', 'B')),
  condition_notes TEXT,
  purchase_price  NUMERIC(10,2) NOT NULL,
  purchase_date   DATE NOT NULL,
  supplier_id     UUID REFERENCES suppliers(id),
  type            TEXT DEFAULT 'own' NOT NULL CHECK (type IN ('own', 'supplier')),
  supplier_name   TEXT,
  origin          TEXT DEFAULT 'purchase' NOT NULL CHECK (origin IN ('purchase', 'trade_in', 'return')),
  source_sale_id  UUID,
  suggested_price NUMERIC(10,2),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'in_stock', 'reserved', 'sold', 'returned', 'under_repair', 'trade_in_received')),
  checklist_id    UUID REFERENCES checklists(id),
  quantity        INT DEFAULT 1,
  photos          TEXT[],
  ios_version     TEXT,
  battery_health  INT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_purchases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  supplier_id        UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name      TEXT,
  purchase_date      DATE NOT NULL,
  payment_method     TEXT,
  account_id         UUID,
  chart_account_id   UUID,
  transaction_id     UUID,
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_checklist_inventory'
      AND conrelid = 'checklists'::regclass
  ) THEN
    ALTER TABLE checklists
      ADD CONSTRAINT fk_checklist_inventory
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Customers ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  cpf          TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Trade-ins ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trade_ins (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES companies(id) ON DELETE CASCADE,
  catalog_id          UUID REFERENCES product_catalog(id),
  imei                TEXT,
  serial_number       TEXT,
  grade               TEXT,
  condition_notes     TEXT,
  trade_in_value      NUMERIC(10,2) NOT NULL,
  checklist_data      JSONB,
  photos              TEXT[],
  status              TEXT DEFAULT 'received' CHECK (status IN ('received', 'added_to_stock', 'scrapped')),
  linked_inventory_id UUID REFERENCES inventory(id),
  notes               TEXT,
  received_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Sales ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  inventory_id     UUID REFERENCES inventory(id) NOT NULL,
  customer_id      UUID REFERENCES customers(id),
  sale_price       NUMERIC(10,2) NOT NULL,
  payment_method   TEXT,
  card_fee_pct     NUMERIC(5,2) DEFAULT 0,
  net_amount       NUMERIC(10,2),
  has_trade_in     BOOLEAN DEFAULT FALSE,
  trade_in_id      UUID REFERENCES trade_ins(id),
  warranty_months  INT DEFAULT 3,
  warranty_start   DATE,
  warranty_end     DATE,
  warranty_pdf_url TEXT,
  source_type      TEXT DEFAULT 'own' NOT NULL CHECK (source_type IN ('own', 'supplier')),
  supplier_name    TEXT,
  supplier_cost    NUMERIC(10,2),
  sale_status      TEXT NOT NULL DEFAULT 'completed' CHECK (sale_status IN ('reserved', 'completed', 'cancelled')),
  payment_due_date DATE,
  sale_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_inventory_source_sale'
      AND conrelid = 'inventory'::regclass
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT fk_inventory_source_sale
      FOREIGN KEY (source_sale_id) REFERENCES sales(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_trade_in_required_check'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_trade_in_required_check
      CHECK (has_trade_in IS DISTINCT FROM TRUE OR trade_in_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

-- Warranties -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warranties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  sale_id      UUID REFERENCES sales(id),
  inventory_id UUID REFERENCES inventory(id),
  customer_id  UUID REFERENCES customers(id),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired', 'voided')),
  pdf_url      TEXT,
  notes        TEXT
);

-- Problems / returns ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS problems (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  sale_id          UUID REFERENCES sales(id),
  inventory_id     UUID REFERENCES inventory(id),
  customer_id      UUID REFERENCES customers(id),
  type             TEXT CHECK (type IN ('return', 'warranty_claim', 'complaint', 'repair')),
  description      TEXT NOT NULL,
  reported_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  cause            TEXT,
  action_plan      TEXT,
  action_deadline  DATE,
  resolved_date    DATE,
  resolution_notes TEXT,
  tags             TEXT[],
  status           TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority         TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  refund_amount    NUMERIC(10,2),
  repair_cost      NUMERIC(10,2),
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_updates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quotes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES suppliers(id),
  catalog_id   UUID REFERENCES product_catalog(id),
  device_desc  TEXT NOT NULL,
  grade        TEXT,
  quoted_price NUMERIC(10,2) NOT NULL,
  quantity     INT DEFAULT 1,
  valid_until  DATE,
  notes        TEXT,
  ai_analysis  TEXT,
  ai_score     INT CHECK (ai_score BETWEEN 1 AND 10),
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  quoted_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Financial settings ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS financial_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  default_margin_pct      NUMERIC(5,2) DEFAULT 15.00,
  debit_fee_pct           NUMERIC(8,4) DEFAULT 1.1020,
  credit_1x_fee_pct       NUMERIC(8,4) DEFAULT 3.0821,
  credit_2x_fee_pct       NUMERIC(8,4) DEFAULT 4.6682,
  credit_3x_fee_pct       NUMERIC(8,4) DEFAULT 5.4964,
  credit_4x_fee_pct       NUMERIC(8,4) DEFAULT 6.3377,
  credit_5x_fee_pct       NUMERIC(8,4) DEFAULT 7.1697,
  credit_6x_fee_pct       NUMERIC(8,4) DEFAULT 8.0264,
  credit_7x_fee_pct       NUMERIC(8,4) DEFAULT 8.9325,
  credit_8x_fee_pct       NUMERIC(8,4) DEFAULT 9.7815,
  credit_9x_fee_pct       NUMERIC(8,4) DEFAULT 10.6439,
  credit_10x_fee_pct      NUMERIC(8,4) DEFAULT 11.5075,
  credit_11x_fee_pct      NUMERIC(8,4) DEFAULT 12.3722,
  credit_12x_fee_pct      NUMERIC(8,4) DEFAULT 13.2503,
  credit_13x_fee_pct      NUMERIC(8,4) DEFAULT 14.1292,
  credit_14x_fee_pct      NUMERIC(8,4) DEFAULT 15.0087,
  credit_15x_fee_pct      NUMERIC(8,4) DEFAULT 15.9018,
  credit_16x_fee_pct      NUMERIC(8,4) DEFAULT 16.7815,
  credit_17x_fee_pct      NUMERIC(8,4) DEFAULT 17.6886,
  credit_18x_fee_pct      NUMERIC(8,4) DEFAULT 18.5818,
  pix_fee_pct             NUMERIC(8,4) DEFAULT 0.5025,
  cash_discount_pct       NUMERIC(8,4) DEFAULT 0,
  default_warranty_months INT DEFAULT 3,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier prices ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supplier_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  supplier_name   TEXT,
  category        TEXT NOT NULL,
  model           TEXT NOT NULL,
  storage         TEXT,
  color           TEXT,
  grade           TEXT,
  price           NUMERIC(10,2) NOT NULL,
  currency        TEXT DEFAULT 'BRL',
  source_url      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Financial transactions -----------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  institution     TEXT,
  account_type    TEXT NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings', 'cash', 'credit', 'investment', 'other')),
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(12,2),
  color           TEXT DEFAULT '#2563eb',
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_chart_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES companies(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  cash_flow_type        TEXT NOT NULL CHECK (cash_flow_type IN ('income', 'expense', 'none')),
  financial_type        TEXT NOT NULL CHECK (financial_type IN ('revenue', 'deduction', 'cogs', 'operating_expense', 'financial_expense', 'financial_revenue', 'inventory_asset', 'tax', 'owner_equity', 'transfer', 'adjustment')),
  statement_section     TEXT NOT NULL CHECK (statement_section IN ('cash', 'dre', 'inventory', 'equity', 'transfer', 'adjustment')),
  affects_cash          BOOLEAN NOT NULL DEFAULT TRUE,
  affects_dre           BOOLEAN NOT NULL DEFAULT FALSE,
  affects_inventory     BOOLEAN NOT NULL DEFAULT FALSE,
  affects_owner_equity  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order            INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS finance_credit_cards (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 UUID REFERENCES companies(id) ON DELETE CASCADE,
  name                       TEXT NOT NULL,
  issuer                     TEXT,
  last_four                  TEXT,
  due_day                    INT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  closing_day                INT CHECK (closing_day BETWEEN 1 AND 31),
  closing_days_before_due    INT NOT NULL DEFAULT 7 CHECK (closing_days_before_due BETWEEN 0 AND 28),
  current_invoice_closed     BOOLEAN NOT NULL DEFAULT FALSE,
  current_invoice_closing_date DATE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id) ON DELETE CASCADE,
  account_id     UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  credit_card_id UUID REFERENCES finance_credit_cards(id) ON DELETE SET NULL,
  chart_account_id UUID REFERENCES finance_chart_accounts(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category       TEXT NOT NULL,
  description    TEXT,
  amount         NUMERIC(10,2) NOT NULL,
  date           DATE NOT NULL,
  due_date       DATE,
  payment_method TEXT,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled', 'cancelled')),
  reconciled_at  TIMESTAMPTZ,
  source_type    TEXT,
  source_id      UUID,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Additional sale items ------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales_additional_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  sale_id      UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id   UUID,
  type         TEXT NOT NULL CHECK (type IN ('upsell', 'free')),
  name         TEXT NOT NULL,
  cost_price   NUMERIC(10,2) NOT NULL,
  sale_price   NUMERIC(10,2),
  profit       NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN type = 'upsell' AND sale_price IS NOT NULL THEN sale_price - cost_price
      WHEN type = 'free' THEN -cost_price
      ELSE 0
    END
  ) STORED,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  user_id    UUID,
  action     TEXT CHECK (action IN ('created', 'updated', 'deleted', 'exported', 'logged_in')),
  table_name TEXT,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes --------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_imei ON inventory (imei);
CREATE INDEX IF NOT EXISTS idx_inventory_company_status ON inventory (company_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_company_status_type ON inventory (company_id, status, type);
CREATE INDEX IF NOT EXISTS idx_inventory_company_status_origin ON inventory (company_id, status, origin);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_date ON inventory (purchase_date);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory (supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_source_sale ON inventory (source_sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchases_company_date ON inventory_purchases (company_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_items_purchase ON inventory_purchase_items (purchase_id, unit_index);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_items_inventory ON inventory_purchase_items (inventory_id);
CREATE INDEX IF NOT EXISTS idx_sales_company_date ON sales (company_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status_due ON sales (company_id, sale_status, payment_due_date);
CREATE INDEX IF NOT EXISTS idx_warranties_company_end ON warranties (company_id, end_date, status);
CREATE INDEX IF NOT EXISTS idx_problems_company_status ON problems (company_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_quotes_company_supplier ON quotes (company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_category_model ON supplier_prices (category, model);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_grade ON supplier_prices (grade);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_company ON supplier_prices (company_id);
CREATE INDEX IF NOT EXISTS idx_transactions_company ON transactions (company_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_card ON transactions (company_id, credit_card_id, due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_chart_account ON transactions (chart_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_source
  ON transactions (company_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_accounts_company ON finance_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_finance_chart_accounts_company ON finance_chart_accounts (company_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_additional_items_sale ON sales_additional_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_additional_items_company ON sales_additional_items (company_id);

-- Triggers -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated ON companies;
CREATE TRIGGER trg_companies_updated
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_updated ON inventory;
CREATE TRIGGER trg_inventory_updated
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_problems_updated ON problems;
CREATE TRIGGER trg_problems_updated
  BEFORE UPDATE ON problems
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_financial_updated ON financial_settings;
CREATE TRIGGER trg_financial_updated
  BEFORE UPDATE ON financial_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

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

DROP TRIGGER IF EXISTS trg_sale_creates_warranty ON sales;
CREATE TRIGGER trg_sale_creates_warranty
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_warranty_on_sale();

-- Seed -----------------------------------------------------------------------

INSERT INTO companies (name, slug)
VALUES ('NOBRETECH STORE', 'nobretech-store')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO financial_settings (company_id)
SELECT id FROM companies WHERE slug = 'nobretech-store'
ON CONFLICT (company_id) DO NOTHING;

-- Marketing ROI --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'instagram',
  objective TEXT,
  start_date DATE,
  end_date DATE,
  budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned', 'active', 'paused', 'finished', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_company_status
  ON marketing_campaigns(company_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_company_dates
  ON marketing_campaigns(company_id, start_date, end_date);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_origin TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS marketing_campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_company_origin
  ON sales(company_id, sale_origin);

CREATE INDEX IF NOT EXISTS idx_sales_company_campaign
  ON sales(company_id, marketing_campaign_id);
