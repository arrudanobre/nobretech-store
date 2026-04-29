-- Corrige lançamentos antigos de compra de estoque que ficaram presos no código 2.01.
-- Antes da DRE completa, 2.01 era "Compra de estoque"; agora 2.01 é "Descontos concedidos".
-- Compra de estoque deve ficar em 7.01, fora do DRE, como informativo de caixa/estoque.

UPDATE transactions t
SET chart_account_id = stock_account.id
FROM finance_chart_accounts current_account
JOIN finance_chart_accounts stock_account
  ON stock_account.company_id = current_account.company_id
 AND stock_account.code = '7.01'
WHERE t.company_id = current_account.company_id
  AND t.chart_account_id = current_account.id
  AND current_account.code = '2.01'
  AND (
    t.category = 'Estoque (Peças/Acessórios)'
    OR t.description ILIKE '%compra%estoque%'
    OR t.description ILIKE '%compras dos iphone%'
  );

UPDATE transactions t
SET chart_account_id = stock_account.id
FROM finance_chart_accounts stock_account
WHERE t.company_id = stock_account.company_id
  AND stock_account.code = '7.01'
  AND t.type = 'expense'
  AND t.category = 'Estoque (Peças/Acessórios)';
