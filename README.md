# Nobretech Store

Sistema de gestao operacional e financeira da Nobretech Store, loja de celulares, produtos Apple, acessorios e assistencia tecnica.

O projeto nasceu para controlar o ciclo real da loja: compra de estoque, cadastro em lote, venda com upsell, trade-in, garantias, recibos, problemas tecnicos, contas a pagar/receber, DRE, fluxo de caixa e indicadores de decisao.

## Stack

- Next.js 16 com App Router
- React 19
- TypeScript
- Tailwind CSS 4
- React Query
- PostgreSQL no Railway
- Deploy na Vercel
- Recharts, Lucide React, Sonner, jsPDF e html2canvas

## Estado atual da arquitetura

O sistema ja foi migrado do Supabase para PostgreSQL/Railway no banco de dados.

Um detalhe importante: o frontend ainda usa uma interface chamada `supabase.from(...)`, mas isso hoje e um adapter local em `src/lib/supabase.ts`. Ele nao acessa o Supabase real. As chamadas passam por `/api/db`, e essa API conversa com o PostgreSQL usando `DATABASE_URL`.

Resumo:

- Banco: Railway PostgreSQL
- Deploy: Vercel
- API de dados: `src/app/api/db/route.ts`
- Adapter client-side: `src/lib/supabase.ts`
- Login: temporariamente sem fluxo de autenticacao completo
- Usuario padrao local: criado em `src/lib/db.ts`
- Fotos de estoque: desativadas no fluxo atual para evitar consumo excessivo de storage/banco

## Modulos principais

| Modulo | Rota | Funcao |
| --- | --- | --- |
| Dashboard | `/dashboard` | Visao geral de vendas, estoque, lucro, giro e indicadores |
| Estoque | `/estoque` | Consulta, edicao, reserva, exclusao controlada e detalhe de itens |
| Compra em lote | `/estoque/compras/nova` | Cadastro rapido de compras com frete e custos rateados |
| Vendas | `/vendas` e `/vendas/nova` | PDV, venda, upsell, trade-in, recibos e garantias |
| Avaliacao | `/avaliacao` | Precificacao de recebimento/trade-in |
| Garantias | `/garantias` | Garantias emitidas por venda/produto |
| Problemas | `/problemas` | Assistencia tecnica, SLA e historico de atualizacoes |
| Clientes | `/clientes` | Cadastro e historico de clientes |
| Fornecedores | `/fornecedores` | Cadastro de fornecedores |
| Financeiro | `/financeiro` | Painel financeiro, caixa, DRE e decisoes |
| Entradas e saidas | `/financeiro/transacoes` | Lancamentos, conciliacao, edicao e exclusao |
| Contas a receber | `/financeiro/receber` | Recebiveis, reservas e entradas futuras |
| Contas a pagar | `/financeiro/pagar` | Despesas em aberto, recorrentes e parceladas |
| Cartoes | `/financeiro/cartoes` | Cartoes, fechamento, vencimento e faturas |
| Gastos mensais | `/financeiro/gastos` | Analise de despesas por categoria |
| Taxas | `/financeiro/taxas` | Taxas da maquininha e simulacao Sidepay |
| DRE | `/financeiro/dre` | Demonstrativo mensalizado por ano |
| Plano de DRE | `/financeiro/plano-dre` | Categorias e subcategorias gerenciais |

## Regras de negocio essenciais

### Estoque

- Compra de estoque nao e despesa de DRE.
- Compra de estoque e troca de dinheiro por ativo.
- O custo so entra no DRE como CMV quando o item e vendido.
- Itens sem IMEI/serial podem ser agrupados por quantidade.
- iPhones/iPads com IMEI/serial devem ser tratados como unidades individuais.
- Frete e custos extras de uma compra em lote sao rateados no custo de aquisicao dos itens.

### Vendas

- A venda pode ter produto principal, itens adicionais e brindes.
- Upsell aumenta o valor da venda e tambem considera custo.
- Brinde nao aumenta receita, mas reduz lucro por carregar custo.
- Trade-in reduz o valor em dinheiro que o cliente paga.
- O aparelho recebido no trade-in entra no estoque como novo ativo.
- Se o valor negociado do produto for menor que o valor oficial/sugerido, a diferenca e desconto concedido.
- Venda por cartao usa acrescimo ao cliente para cobrir taxa da maquininha.
- Mesmo parcelando em ate 18x, a loja considera recebimento imediato; nao existe agenda de parcelas a receber da maquininha.

### Financeiro e DRE

- DRE mostra resultado economico: receita, deducoes, CMV, despesas, impostos e lucro liquido.
- Compras de estoque ficam fora do DRE como informativo de caixa/ativo.
- CMV deve vir automaticamente das vendas.
- Aportes e retiradas de socios ficam fora do DRE.
- Contas a pagar/receber controlam caixa futuro, mas uma conta em aberto nao deve distorcer o lucro realizado se ainda nao for criterio de competencia adotado para aquela categoria.
- Cartoes de credito possuem fechamento, vencimento e fatura prevista.

## Rodando localmente

Entre na pasta do projeto:

```bash
cd "/Users/nobre/Documents/Vibe Code/Nobretech/nobretech-store"
```

Instale as dependencias:

```bash
npm install
```

Crie `.env.local`:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/database
```

Suba o projeto:

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

Build de producao:

```bash
npm run build
```

## Banco de dados e migrations

As migrations ficam em `migrations/`.

Arquivos importantes:

- `migrations/railway_schema.sql`: schema base do Railway
- `migrations/finance_foundation.sql`: base do financeiro
- `migrations/dre_complete_chart_accounts.sql`: plano de DRE completo
- `migrations/finance_credit_cards.sql`: cartoes de credito
- `migrations/inventory_bulk_purchases.sql`: compras de estoque em lote
- `migrations/reserved_sales_flow.sql`: reservas de venda e contas a receber
- `migrations/update_sidepay_precise_fees.sql`: taxas Sidepay precisas
- `migrations/fix_stock_transactions_dre_account.sql`: correcao conceitual de estoque fora do DRE

Para entender a migracao Supabase -> Railway, leia:

- `docs/railway-migration.md`

## Documentacao dos fluxos

A documentacao funcional principal esta em:

- `docs/fluxos-do-sistema.md`

Ela explica os fluxos de compra, estoque, venda, trade-in, documentos, financeiro, DRE, cartoes, assistencia tecnica e indicadores.

## Cuidados para desenvolvimento

- Nunca exponha `DATABASE_URL` como `NEXT_PUBLIC_*`.
- Preserve o adapter `src/lib/supabase.ts` enquanto a migracao gradual nao for concluida.
- Evite recolocar fotos no fluxo de estoque sem uma estrategia de storage/cache.
- Antes de alterar DRE, valide a regra contabil: compra de estoque nao e CMV ate ser vendida.
- Antes de alterar venda, valide trade-in, desconto, taxa embutida, valor pago pelo cliente e valor recebido pela loja.
- Nao refatore layout global, providers ou autenticacao temporaria sem necessidade.

## Checklist antes de publicar

```bash
npm run build
git status --short
```

Depois valide no localhost os fluxos afetados antes de fazer commit e deploy.
