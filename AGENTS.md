<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Financeiro — extrato e vendas (política)

- O extrato (`financial_account_movements`) é a fonte do saldo; receitas/despesas conciliadas entram como **`account_receivable`** / **`account_payable`** com **`source_id` = id da linha em `transactions`**.
- **Não** introduzir movimentos novos com **`source = sale`** no extrato enquanto esta política estiver ativa. Venda no ERP cria ou atualiza **`transactions`** (recebível); quando o recebível for **reconciliado** com conta, o sync gera/atualiza o movimento no extrato.
- O mesmo caixa não pode existir ao mesmo tempo como **`sale`** e **`account_receivable`** no extrato; ver `src/lib/finance/sync-transaction-movement.ts` (regra e reponte de legado).
