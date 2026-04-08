-- =========================================================================
-- FIX RLS - Corrige políticas que impedem acesso à empresa
-- =========================================================================

-- Remove todas as políticas existentes
DROP POLICY IF EXISTS "company_self" ON companies;
DROP POLICY IF EXISTS "company_isolation_suppliers" ON suppliers;
DROP POLICY IF EXISTS "company_isolation_inventory" ON inventory;
DROP POLICY IF EXISTS "company_isolation_customers" ON customers;
DROP POLICY IF EXISTS "company_isolation_trade_ins" ON trade_ins;
DROP POLICY IF EXISTS "company_isolation_sales" ON sales;
DROP POLICY IF EXISTS "company_isolation_warranties" ON warranties;
DROP POLICY IF EXISTS "company_isolation_problems" ON problems;
DROP POLICY IF EXISTS "company_isolation_quotes" ON quotes;
DROP POLICY IF EXISTS "company_isolation_financial_settings" ON financial_settings;
DROP POLICY IF EXISTS "company_isolation_checklists" ON checklists;

-- ── Companies: qualquer usuário logado pode ler sua empresa ──
CREATE POLICY "any_user_read_company" ON companies
  FOR SELECT USING (true);

CREATE POLICY "any_user_update_company" ON companies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND company_id = companies.id)
  );

-- ── Users: usuário logado pode ler qualquer user da própria empresa ──
CREATE POLICY "users_read_company" ON users
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Permitir upsert do próprio registro
CREATE POLICY "users_upsert_own" ON users
  FOR INSERT WITH CHECK (
    id = auth.uid()
    AND company_id IN (SELECT id FROM companies)
  );

-- ── Data tables: RLS por company_id ──

CREATE POLICY "data_access_inventory" ON inventory FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_suppliers" ON suppliers FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_customers" ON customers FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_sales" ON sales FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_warranties" ON warranties FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_problems" ON problems FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_quotes" ON quotes FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_financial" ON financial_settings FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_checklists" ON checklists FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "data_access_trade_ins" ON trade_ins FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

-- ── Garante que company e user existem ──
INSERT INTO companies (name, slug) VALUES ('NOBRETECH STORE', 'nobretech-store')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO financial_settings (company_id)
SELECT id FROM companies WHERE slug = 'nobretech-store'
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO users (id, company_id, full_name, role)
SELECT au.id, c.id, au.email, 'owner'
FROM auth.users au
CROSS JOIN (SELECT id FROM companies WHERE slug = 'nobretech-store' LIMIT 1) c
WHERE au.email IS NOT NULL
ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
