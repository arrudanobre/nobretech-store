-- Reseller Portal V1
-- Adds the 'reseller' user role and the reseller domain tables.
-- Additive and idempotent. Does not touch inventory, sales or finance schema.

-- ── 1. Allow the 'reseller' role on users ───────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'manager', 'operator', 'reseller'));

-- ── 2. Resellers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resellers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  city       TEXT,
  state      TEXT,
  phone      TEXT,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resellers_company ON resellers (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resellers_user ON resellers (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_resellers_company_email ON resellers (company_id, lower(email));

-- ── 3. Per-reseller product offers ──────────────────────────────────────────
-- reseller_price = the price the reseller pays Nobretech (repasse).
-- suggested_sale_price = optional commercial reference for the end customer.
-- internal_notes are NEVER exposed to the reseller portal.
CREATE TABLE IF NOT EXISTS reseller_product_offers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reseller_id         UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  inventory_item_id   UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  reseller_price      DECIMAL(10,2) NOT NULL CHECK (reseller_price >= 0),
  suggested_sale_price DECIMAL(10,2) CHECK (suggested_sale_price IS NULL OR suggested_sale_price >= 0),
  visible_notes       TEXT,
  internal_notes      TEXT,
  available_until     DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reseller_offers_reseller ON reseller_product_offers (reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_offers_inventory ON reseller_product_offers (inventory_item_id);
-- A given inventory unit can only have one offer per reseller.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_offers_unique
  ON reseller_product_offers (reseller_id, inventory_item_id);

-- ── 4. Reseller requests (interest / reservation / sold report) ─────────────
CREATE TABLE IF NOT EXISTS reseller_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reseller_id           UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  inventory_item_id     UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  offer_id              UUID REFERENCES reseller_product_offers(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL CHECK (type IN ('interest', 'reservation_requested', 'sold_reported', 'canceled')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'canceled')),
  customer_name_optional  TEXT,
  customer_phone_optional TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reseller_requests_reseller ON reseller_requests (reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_requests_company_status ON reseller_requests (company_id, status);
