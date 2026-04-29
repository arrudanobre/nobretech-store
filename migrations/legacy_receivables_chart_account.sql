-- Categoria para recebimentos de vendas anteriores ao sistema.
-- Entra em contas a receber/caixa, mas fica fora do DRE do mês atual.

WITH default_company AS (
  SELECT id AS company_id FROM companies ORDER BY created_at LIMIT 1
),
legacy_account AS (
  SELECT
    company_id,
    '9.01'::text AS code,
    'Recebimento de venda anterior'::text AS name,
    'income'::text AS cash_flow_type,
    'adjustment'::text AS financial_type,
    'cash'::text AS statement_section,
    true AS affects_cash,
    false AS affects_dre,
    false AS affects_inventory,
    false AS affects_owner_equity,
    1110 AS sort_order,
    null::text AS parent_code,
    'Ajustes de caixa'::text AS dre_group,
    2 AS level
  FROM default_company
)
INSERT INTO finance_chart_accounts (
  company_id, code, name, cash_flow_type, financial_type, statement_section,
  affects_cash, affects_dre, affects_inventory, affects_owner_equity,
  sort_order, parent_code, dre_group, level
)
SELECT
  company_id, code, name, cash_flow_type, financial_type, statement_section,
  affects_cash, affects_dre, affects_inventory, affects_owner_equity,
  sort_order, parent_code, dre_group, level
FROM legacy_account
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
  parent_code = EXCLUDED.parent_code,
  dre_group = EXCLUDED.dre_group,
  level = EXCLUDED.level,
  is_active = true,
  updated_at = NOW();

-- Corrige o recebível legado do iPad do Bruno que havia sido classificado como venda operacional.
UPDATE transactions t
SET
  chart_account_id = ca.id,
  category = ca.name,
  source_type = COALESCE(t.source_type, 'legacy_receivable'),
  updated_at = NOW()
FROM finance_chart_accounts ca
WHERE ca.company_id = t.company_id
  AND ca.code = '9.01'
  AND t.type = 'income'
  AND t.description ILIKE '%Última parcela iPad - Bruno%'
  AND t.source_type IS NULL;
