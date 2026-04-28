CREATE TABLE IF NOT EXISTS finance_chart_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES companies(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  cash_flow_type        TEXT NOT NULL CHECK (cash_flow_type IN ('income', 'expense', 'none')),
  financial_type        TEXT NOT NULL CHECK (
    financial_type IN (
      'revenue',
      'operating_expense',
      'inventory_asset',
      'cogs',
      'tax',
      'owner_equity',
      'transfer',
      'adjustment'
    )
  ),
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

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES finance_chart_accounts(id) ON DELETE SET NULL;

WITH default_company AS (
  SELECT id AS company_id FROM companies ORDER BY created_at LIMIT 1
),
seed_accounts AS (
  SELECT *
  FROM default_company
  CROSS JOIN (
    VALUES
      ('1.01', 'Venda de produtos', 'income', 'revenue', 'dre', true, true, false, false, 10),
      ('1.02', 'Reembolso', 'income', 'revenue', 'dre', true, true, false, false, 20),
      ('2.01', 'Compra de estoque', 'expense', 'inventory_asset', 'inventory', true, false, true, false, 110),
      ('2.02', 'CMV / custo do produto vendido', 'expense', 'cogs', 'dre', false, true, false, false, 120),
      ('3.01', 'Aluguel', 'expense', 'operating_expense', 'dre', true, true, false, false, 210),
      ('3.02', 'Energia / Água / Internet', 'expense', 'operating_expense', 'dre', true, true, false, false, 220),
      ('3.03', 'Funcionários / Comissões', 'expense', 'operating_expense', 'dre', true, true, false, false, 230),
      ('3.04', 'Marketing / Tráfego', 'expense', 'operating_expense', 'dre', true, true, false, false, 240),
      ('3.90', 'Outras despesas operacionais', 'expense', 'operating_expense', 'dre', true, true, false, false, 290),
      ('4.01', 'Impostos / Taxas', 'expense', 'tax', 'dre', true, true, false, false, 310),
      ('5.01', 'Aporte do proprietário', 'income', 'owner_equity', 'equity', true, false, false, true, 410),
      ('5.02', 'Retirada de lucro', 'expense', 'owner_equity', 'equity', true, false, false, true, 420),
      ('6.01', 'Transferência entre contas', 'none', 'transfer', 'transfer', true, false, false, false, 510),
      ('7.01', 'Ajuste de saldo', 'none', 'adjustment', 'adjustment', true, false, false, false, 610)
  ) AS account(code, name, cash_flow_type, financial_type, statement_section, affects_cash, affects_dre, affects_inventory, affects_owner_equity, sort_order)
)
INSERT INTO finance_chart_accounts (
  company_id,
  code,
  name,
  cash_flow_type,
  financial_type,
  statement_section,
  affects_cash,
  affects_dre,
  affects_inventory,
  affects_owner_equity,
  sort_order
)
SELECT
  company_id,
  code,
  name,
  cash_flow_type,
  financial_type,
  statement_section,
  affects_cash,
  affects_dre,
  affects_inventory,
  affects_owner_equity,
  sort_order
FROM seed_accounts
ON CONFLICT (company_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  cash_flow_type = EXCLUDED.cash_flow_type,
  financial_type = EXCLUDED.financial_type,
  statement_section = EXCLUDED.statement_section,
  affects_cash = EXCLUDED.affects_cash,
  affects_dre = EXCLUDED.affects_dre,
  affects_inventory = EXCLUDED.affects_inventory,
  affects_owner_equity = EXCLUDED.affects_owner_equity,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = NOW();

UPDATE transactions t
SET chart_account_id = ca.id
FROM finance_chart_accounts ca
WHERE t.company_id = ca.company_id
  AND t.chart_account_id IS NULL
  AND (
    (t.category = 'Venda' AND ca.code = '1.01') OR
    (t.category = 'Reembolso' AND ca.code = '1.02') OR
    (t.category = 'Estoque (Peças/Acessórios)' AND ca.code = '2.01') OR
    (t.category = 'Aluguel' AND ca.code = '3.01') OR
    (t.category = 'Energia / Água / Internet' AND ca.code = '3.02') OR
    (t.category = 'Funcionários / Comissões' AND ca.code = '3.03') OR
    (t.category = 'Marketing / Tráfego' AND ca.code = '3.04') OR
    (t.category = 'Outros' AND t.type = 'expense' AND ca.code = '3.90') OR
    (t.category = 'Impostos / Taxas' AND ca.code = '4.01') OR
    (t.category = 'Aporte do proprietário' AND ca.code = '5.01') OR
    (t.category = 'Retirada de Lucro' AND ca.code = '5.02')
  );

CREATE INDEX IF NOT EXISTS idx_finance_chart_accounts_company ON finance_chart_accounts (company_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_transactions_chart_account ON transactions (chart_account_id);
