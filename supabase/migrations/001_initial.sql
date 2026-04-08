-- ============================================================================
-- NOBRETECH STORE — PostgreSQL Schema (Supabase)
-- ============================================================================

-- ── Companies ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL DEFAULT REPLACE(LOWER(GEN_RANDOM_UUID()::TEXT), '-', ''),
  logo_url   TEXT,
  settings   JSONB DEFAULT '{}',
  plan       TEXT DEFAULT 'solo' CHECK (plan IN ('solo', 'starter', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'operator')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Suppliers ────────────────────────────────────────────────────────────────

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

-- ── Product Catalog ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_catalog (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT NOT NULL CHECK (category IN ('iphone', 'ipad', 'applewatch', 'airpods', 'macbook', 'garmin')),
  brand      TEXT NOT NULL,
  model      TEXT NOT NULL,
  variant    TEXT,
  storage    TEXT,
  color      TEXT,
  color_hex  TEXT,
  year       INT,
  specs      JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Checklists ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS checklists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  inventory_id UUID, -- FK set later
  device_type  TEXT NOT NULL,
  items        JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  pdf_url      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Inventory ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  catalog_id      UUID REFERENCES product_catalog(id),
  imei            TEXT UNIQUE,
  serial_number   TEXT,
  imei2           TEXT,
  grade           TEXT CHECK (grade IN ('A+', 'A', 'A-', 'B+', 'B')),
  condition_notes TEXT,
  purchase_price  DECIMAL(10,2) NOT NULL,
  purchase_date   DATE NOT NULL,
  supplier_id     UUID REFERENCES suppliers(id),
  suggested_price DECIMAL(10,2),
  status          TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'sold', 'returned', 'under_repair', 'trade_in_received')),
  checklist_id    UUID REFERENCES checklists(id),
  photos          TEXT[],
  ios_version     TEXT,
  battery_health  INT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Link checklist → inventory after both exist ────────────────────────────

ALTER TABLE checklists
  ADD CONSTRAINT fk_checklist_inventory
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL;

-- ── Customers ───────────────────────────────────────────────────────────────

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

-- ── Trade-Ins ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_ins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  catalog_id        UUID REFERENCES product_catalog(id),
  imei              TEXT,
  serial_number     TEXT,
  grade             TEXT,
  condition_notes   TEXT,
  trade_in_value    DECIMAL(10,2) NOT NULL,
  checklist_data    JSONB,
  photos            TEXT[],
  status            TEXT DEFAULT 'received' CHECK (status IN ('received', 'added_to_stock', 'scrapped')),
  linked_inventory_id UUID REFERENCES inventory(id),
  notes             TEXT,
  received_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sales ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  inventory_id     UUID REFERENCES inventory(id) NOT NULL,
  customer_id      UUID REFERENCES customers(id),
  sale_price       DECIMAL(10,2) NOT NULL,
  payment_method   TEXT,
  card_fee_pct     DECIMAL(5,2) DEFAULT 0,
  net_amount       DECIMAL(10,2),
  has_trade_in     BOOLEAN DEFAULT FALSE,
  trade_in_id      UUID REFERENCES trade_ins(id),
  warranty_months  INT DEFAULT 3,
  warranty_start   DATE,
  warranty_end     DATE,
  warranty_pdf_url TEXT,
  sale_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Warranties (view of active sales warranties) ────────────────────────────

CREATE TABLE IF NOT EXISTS warranties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  sale_id     UUID REFERENCES sales(id),
  inventory_id UUID REFERENCES inventory(id),
  customer_id UUID REFERENCES customers(id),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired', 'voided')),
  pdf_url     TEXT,
  notes       TEXT
);

-- ── Problems / Returns ──────────────────────────────────────────────────────

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
  action_plan       TEXT,
  action_deadline  DATE,
  resolved_date    DATE,
  resolution_notes TEXT,
  tags             TEXT[],
  status           TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority         TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  refund_amount    DECIMAL(10,2),
  repair_cost      DECIMAL(10,2),
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Quotes ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES suppliers(id),
  catalog_id   UUID REFERENCES product_catalog(id),
  device_desc  TEXT NOT NULL,
  grade        TEXT,
  quoted_price DECIMAL(10,2) NOT NULL,
  quantity     INT DEFAULT 1,
  valid_until  DATE,
  notes        TEXT,
  ai_analysis  TEXT,
  ai_score     INT CHECK (ai_score BETWEEN 1 AND 10),
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  quoted_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Financial Settings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financial_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  default_margin_pct      DECIMAL(5,2) DEFAULT 15.00,
  debit_fee_pct           DECIMAL(5,2) DEFAULT 1.5,
  credit_1x_fee_pct       DECIMAL(5,2) DEFAULT 2.99,
  credit_2x_fee_pct       DECIMAL(5,2) DEFAULT 3.49,
  credit_3x_fee_pct       DECIMAL(5,2) DEFAULT 3.99,
  credit_4x_fee_pct       DECIMAL(5,2) DEFAULT 4.49,
  credit_6x_fee_pct       DECIMAL(5,2) DEFAULT 5.49,
  credit_10x_fee_pct      DECIMAL(5,2) DEFAULT 7.49,
  credit_12x_fee_pct      DECIMAL(5,2) DEFAULT 8.99,
  pix_fee_pct             DECIMAL(5,2) DEFAULT 0,
  cash_discount_pct       DECIMAL(5,2) DEFAULT 0,
  default_warranty_months INT DEFAULT 3,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── Audit Logs ───────────────────────────────────────────────────────────────

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

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_imei ON inventory (imei);
CREATE INDEX IF NOT EXISTS idx_inventory_company_status ON inventory (company_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_company_date ON sales (company_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_warranties_company_end ON warranties (company_id, end_date, status);
CREATE INDEX IF NOT EXISTS idx_problems_company_status ON problems (company_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_quotes_company_supplier ON quotes (company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_date ON inventory (purchase_date);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory (supplier_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on every table that holds company data
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('companies', 'users', 'suppliers', 'product_catalog',
                        'checklists', 'inventory', 'customers', 'trade_ins',
                        'sales', 'warranties', 'problems', 'quotes',
                        'financial_settings', 'audit_logs')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Base policy: users see only their own company's data (all tables with company_id)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('suppliers', 'inventory', 'customers', 'trade_ins',
                        'sales', 'warranties', 'problems', 'quotes',
                        'financial_settings', 'checklists')
  LOOP
    EXECUTE format(
      'CREATE POLICY "company_isolation_%1$s" ON %1$s
       FOR ALL
       USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
       WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()))',
      t
    );
  END LOOP;

  -- companies: user can see their own
  EXECUTE 'CREATE POLICY "company_self" ON companies
    FOR SELECT USING (id IN (SELECT company_id FROM users WHERE id = auth.uid()))';
END
$$;

-- ============================================================================
-- TRIGGERS — updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_updated
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_problems_updated
  BEFORE UPDATE ON problems
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_financial_updated
  BEFORE UPDATE ON financial_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================================
-- AUTOMATIC WARRANTY END DATE WHEN SALE CREATED
-- ============================================================================

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
  UPDATE inventory SET status = 'sold' WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_creates_warranty
  AFTER INSERT ON sales
  FOR EACH ROW
  WHEN (NEW.warranty_months > 0)
  EXECUTE FUNCTION fn_create_warranty_on_sale();

-- ============================================================================
-- SEED DATA — NOBRETECH STORE company + financial defaults
-- ============================================================================

INSERT INTO companies (name, slug)
VALUES ('NOBRETECH STORE', 'nobretech-store')
ON CONFLICT (slug) DO NOTHING;

-- Grab the company id we just created (or already existed)
DO $$
DECLARE v_company UUID;
BEGIN
  SELECT id INTO v_company FROM companies WHERE slug = 'nobretech-store' LIMIT 1;
  IF v_company IS NOT NULL THEN
    INSERT INTO financial_settings (company_id)
    VALUES (v_company)
    ON CONFLICT (company_id) DO NOTHING;
  END IF;
END
$$;
