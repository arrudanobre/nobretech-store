-- Estrutura completa de DRE para a Nobretech Store.
-- Rode no Railway/Postgres depois de revisar. É idempotente.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'finance_chart_accounts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%financial_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE finance_chart_accounts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE finance_chart_accounts
  ADD CONSTRAINT finance_chart_accounts_financial_type_check
  CHECK (
    financial_type IN (
      'revenue',
      'deduction',
      'cogs',
      'operating_expense',
      'financial_expense',
      'financial_revenue',
      'tax',
      'inventory_asset',
      'owner_equity',
      'transfer',
      'adjustment'
    )
  );

ALTER TABLE finance_chart_accounts
  ADD COLUMN IF NOT EXISTS parent_code text,
  ADD COLUMN IF NOT EXISTS dre_group text,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 2;

WITH default_company AS (
  SELECT id AS company_id FROM companies ORDER BY created_at LIMIT 1
),
seed_accounts AS (
  SELECT *
  FROM default_company
  CROSS JOIN (
    VALUES
      -- 1. Receita Bruta de Vendas
      ('1', 'Receita Bruta de Vendas', 'income', 'revenue', 'dre', true, true, false, false, 100, null, '1. Receita Bruta de Vendas', 1),
      ('1.01', 'Venda de iPhones', 'income', 'revenue', 'dre', true, true, false, false, 110, '1', '1. Receita Bruta de Vendas', 2),
      ('1.02', 'Venda de iPads', 'income', 'revenue', 'dre', true, true, false, false, 120, '1', '1. Receita Bruta de Vendas', 2),
      ('1.03', 'Venda de acessórios', 'income', 'revenue', 'dre', true, true, false, false, 130, '1', '1. Receita Bruta de Vendas', 2),
      ('1.04', 'Serviços', 'income', 'revenue', 'dre', true, true, false, false, 140, '1', '1. Receita Bruta de Vendas', 2),
      ('1.90', 'Receitas diversas', 'income', 'revenue', 'dre', true, true, false, false, 190, '1', '1. Receita Bruta de Vendas', 2),

      -- 2. Deduções da Receita
      ('2', 'Deduções da Receita', 'expense', 'deduction', 'dre', true, true, false, false, 200, null, '2. Deduções da Receita', 1),
      ('2.01', 'Descontos concedidos', 'expense', 'deduction', 'dre', true, true, false, false, 210, '2', '2. Deduções da Receita', 2),
      ('2.02', 'Taxas de cartão', 'expense', 'deduction', 'dre', true, true, false, false, 220, '2', '2. Deduções da Receita', 2),
      ('2.03', 'Taxas de marketplace', 'expense', 'deduction', 'dre', true, true, false, false, 230, '2', '2. Deduções da Receita', 2),
      ('2.04', 'Estornos / devoluções', 'expense', 'deduction', 'dre', true, true, false, false, 240, '2', '2. Deduções da Receita', 2),

      -- 3. CMV
      ('3', 'Custo das Mercadorias Vendidas (CMV)', 'expense', 'cogs', 'dre', false, true, false, false, 300, null, '3. CMV', 1),
      ('3.01', 'Custo de compra de iPhones/iPads', 'expense', 'cogs', 'dre', false, true, false, false, 310, '3', '3. CMV', 2),
      ('3.02', 'Custo de acessórios vendidos', 'expense', 'cogs', 'dre', false, true, false, false, 320, '3', '3. CMV', 2),
      ('3.03', 'Frete de compra', 'expense', 'cogs', 'dre', true, true, false, false, 330, '3', '3. CMV', 2),
      ('3.04', 'Taxas de importação', 'expense', 'cogs', 'dre', true, true, false, false, 340, '3', '3. CMV', 2),
      ('3.05', 'Manutenção/reparo antes da venda', 'expense', 'cogs', 'dre', true, true, false, false, 350, '3', '3. CMV', 2),

      -- 4. Despesas Operacionais
      ('4', 'Despesas Operacionais', 'expense', 'operating_expense', 'dre', true, true, false, false, 400, null, '4. Despesas Operacionais', 1),
      ('4.01', 'Tráfego pago / Meta Ads', 'expense', 'operating_expense', 'dre', true, true, false, false, 410, '4', '4.1 Comerciais', 2),
      ('4.02', 'Comissões', 'expense', 'operating_expense', 'dre', true, true, false, false, 420, '4', '4.1 Comerciais', 2),
      ('4.03', 'Embalagens', 'expense', 'operating_expense', 'dre', true, true, false, false, 430, '4', '4.1 Comerciais', 2),
      ('4.04', 'Frete para cliente', 'expense', 'operating_expense', 'dre', true, true, false, false, 440, '4', '4.1 Comerciais', 2),
      ('4.05', 'Ferramentas de venda / ManyChat', 'expense', 'operating_expense', 'dre', true, true, false, false, 450, '4', '4.1 Comerciais', 2),
      ('4.20', 'Internet', 'expense', 'operating_expense', 'dre', true, true, false, false, 520, '4', '4.2 Administrativas', 2),
      ('4.21', 'Energia', 'expense', 'operating_expense', 'dre', true, true, false, false, 521, '4', '4.2 Administrativas', 2),
      ('4.22', 'Celular', 'expense', 'operating_expense', 'dre', true, true, false, false, 522, '4', '4.2 Administrativas', 2),
      ('4.23', 'Contador', 'expense', 'operating_expense', 'dre', true, true, false, false, 523, '4', '4.2 Administrativas', 2),
      ('4.24', 'Sistemas / Vercel / banco de dados', 'expense', 'operating_expense', 'dre', true, true, false, false, 524, '4', '4.2 Administrativas', 2),
      ('4.25', 'Domínio / hospedagem', 'expense', 'operating_expense', 'dre', true, true, false, false, 525, '4', '4.2 Administrativas', 2),
      ('4.40', 'Produção de conteúdo', 'expense', 'operating_expense', 'dre', true, true, false, false, 640, '4', '4.3 Marketing', 2),
      ('4.41', 'Equipamentos de conteúdo', 'expense', 'operating_expense', 'dre', true, true, false, false, 641, '4', '4.3 Marketing', 2),
      ('4.42', 'Edição / apps / serviços', 'expense', 'operating_expense', 'dre', true, true, false, false, 642, '4', '4.3 Marketing', 2),
      ('4.90', 'Outras despesas operacionais', 'expense', 'operating_expense', 'dre', true, true, false, false, 690, '4', '4. Despesas Operacionais', 2),

      -- 5. Resultado Financeiro
      ('5', 'Resultado Financeiro', 'none', 'financial_expense', 'dre', true, true, false, false, 700, null, '5. Resultado Financeiro', 1),
      ('5.01', 'Juros de parcelamento / antecipação', 'expense', 'financial_expense', 'dre', true, true, false, false, 710, '5', '5. Resultado Financeiro', 2),
      ('5.02', 'Taxas bancárias', 'expense', 'financial_expense', 'dre', true, true, false, false, 720, '5', '5. Resultado Financeiro', 2),
      ('5.03', 'Multas', 'expense', 'financial_expense', 'dre', true, true, false, false, 730, '5', '5. Resultado Financeiro', 2),
      ('5.10', 'Receitas financeiras / rendimentos', 'income', 'financial_revenue', 'dre', true, true, false, false, 740, '5', '5. Resultado Financeiro', 2),

      -- 6. Impostos
      ('6', 'Impostos', 'expense', 'tax', 'dre', true, true, false, false, 800, null, '6. Impostos', 1),
      ('6.01', 'MEI / Simples Nacional', 'expense', 'tax', 'dre', true, true, false, false, 810, '6', '6. Impostos', 2),
      ('6.02', 'Taxas sobre venda', 'expense', 'tax', 'dre', true, true, false, false, 820, '6', '6. Impostos', 2),

      -- Informativos fora do DRE
      ('7.01', 'Compra de estoque', 'expense', 'inventory_asset', 'inventory', true, false, true, false, 910, null, 'Informativos de caixa', 2),
      ('8.01', 'Aporte do proprietário', 'income', 'owner_equity', 'equity', true, false, false, true, 1010, null, 'Sócios', 2),
      ('8.02', 'Retirada de lucro', 'expense', 'owner_equity', 'equity', true, false, false, true, 1020, null, 'Sócios', 2),
      ('9.01', 'Recebimento de venda anterior', 'income', 'adjustment', 'cash', true, false, false, false, 1110, null, 'Ajustes de caixa', 2)
  ) AS account(code, name, cash_flow_type, financial_type, statement_section, affects_cash, affects_dre, affects_inventory, affects_owner_equity, sort_order, parent_code, dre_group, level)
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
  parent_code = EXCLUDED.parent_code,
  dre_group = EXCLUDED.dre_group,
  level = EXCLUDED.level,
  is_active = true,
  updated_at = NOW();

UPDATE transactions t
SET chart_account_id = ca.id
FROM finance_chart_accounts ca
WHERE t.company_id = ca.company_id
  AND t.chart_account_id IS NULL
  AND (
    (t.category = 'Venda' AND ca.code = '1.01') OR
    (t.category = 'Reembolso' AND ca.code = '1.90') OR
    (t.category = 'Estoque (Peças/Acessórios)' AND ca.code = '7.01') OR
    (t.category = 'Marketing / Tráfego' AND ca.code = '4.01') OR
    (t.category = 'Funcionários / Comissões' AND ca.code = '4.02') OR
    (t.category = 'Energia / Água / Internet' AND ca.code = '4.20') OR
    (t.category = 'Aluguel' AND ca.code = '4.90') OR
    (t.category = 'Impostos / Taxas' AND ca.code = '6.02') OR
    (t.category = 'Aporte do proprietário' AND ca.code = '8.01') OR
    (t.category = 'Retirada de Lucro' AND ca.code = '8.02')
  );
