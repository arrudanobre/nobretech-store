# ORION Data Coverage Audit

Gerado em: 2026-05-13

## Resumo Executivo

A causa raiz da resposta ruim da ORION não é falta total de dados no ERP. O banco possui vendas, pagamentos, contas, plano de contas financeiro, movimentos, estoque, campanhas, leads, CMV/custo de aquisição, descontos potenciais via `sales.net_amount`, adicionais de venda, despesas e memória decisória.

O problema é cobertura e propagação: parte desses dados é lida em `collectOrionSnapshot`, mas não vira um demonstrativo financeiro explícito para a camada estruturada de decisão (`business_decision`) nem para a Conversation Layer. Para `business_review`, a ORION usa ferramentas de alto nível (`sales.performance`, `sales.marginByProduct`, `inventory.stuckItems`, `marketing.campaignPerformance`, `finance.cashPosition`) e a função `buildBusinessReviewDecision` ainda produz uma ressalva genérica sobre DRE/despesas/descontos.

Conclusão: o problema principal é payload/modelagem incompleta entre o banco e a decisão, não inexistência do dado.

## Script de Auditoria

Script criado:

`scripts/audit-orion-data-coverage.ts`

Características:

- somente leitura;
- usa `information_schema` e agregados (`COUNT(*)`, `MAX(data)`);
- não seleciona linhas de clientes, vendas, produtos ou leads;
- não imprime CPF, telefone, email, IMEI, serial, token, PIN ou secrets;
- lista tabelas públicas, colunas principais, contagem e datas máximas relevantes.

Execução realizada:

```bash
npx tsx scripts/audit-orion-data-coverage.ts
```

Resultado agregado: 37 tabelas públicas.

## Tabelas Existentes

| Tabela | Domínio | Registros | ORION lê hoje? | Como entra hoje | Lacuna principal |
| --- | --- | ---: | --- | --- | --- |
| `audit_logs` | auditoria | 232 | Não para decisão | Não entra no snapshot ORION | Não é relevante para DRE, mas pode apoiar rastreabilidade futura |
| `checklists` | estoque | 13 | Não | Não entra | Estado de checklist não compõe qualidade operacional |
| `companies` | base | 1 | Sim | `companyName`/escopo | Sem lacuna crítica |
| `customers` | clientes | 18 | Indireto | Relacionado a vendas/leads, sem dados pessoais no snapshot | ORION não usa segmentação de cliente |
| `finance_accounts` | financeiro | 1 | Sim | caixa por conta, ledger, saldos | Usado para caixa, não DRE |
| `finance_chart_accounts` | plano de contas/DRE | 49 | Sim, parcialmente | joins em `transactions` | Classificação existe, mas não vira `financialStatementSnapshot` explícito |
| `finance_credit_cards` | financeiro | 1 | Não identificado na ORION | Não entra | Faturas/cartão não entram no snapshot executivo |
| `financial_account_movements` | extrato/movimentos | 50 | Sim | ledger e cash flow | Usado para saldo/fluxo, não exposto como extrato resumido para decisão |
| `financial_settings` | financeiro/vendas | 1 | Sim | Real Profit Engine/settings | Configurações entram, mas não aparecem como premissas executivas |
| `inventory` | estoque/CMV | 31 | Sim | estoque, custo, aging, CMV de venda | Usado bem para estoque e custo principal |
| `inventory_purchase_items` | compras/CMV | 19 | Não no snapshot ORION | Não entra diretamente | Custo de compra detalhado não entra na leitura executiva |
| `inventory_purchases` | compras/estoque/DRE | 10 | Não diretamente | Pode refletir via `transactions`, mas não como compra estruturada | Compra, frete e outros custos não entram como DRE/compras explícitas |
| `marketing_campaigns` | marketing | 1 | Sim | campanhas, spend, ROI | Entra com spend e resultado agregado |
| `marketing_leads` | leads | 10 | Sim | funil, leads esquecidos, campanha | Dados pessoais não devem entrar; funil entra parcialmente |
| `orion_ai_analysis_logs` | ORION | 219 | Sim para histórico/uso | history/usage/logs | Não é dado operacional |
| `orion_decision_memory` | decisões | 23 | Sim | memória decisória | Usado para decisões abertas |
| `orion_operational_memory` | memória operacional | 44 | Sim | memória/proactive alerts | Usado como contexto operacional |
| `problem_updates` | problemas | 2 | Não | Não entra | Pós-venda/problemas não entram na saúde do negócio |
| `problems` | garantia/problemas | 1 | Não | Não entra | Custos de reparo/reembolso não entram no DRE ORION |
| `product_attribute_options` | catálogo | 8 | Não direto | Não entra | Baixo impacto para DRE |
| `product_attributes` | catálogo | 5 | Não direto | Não entra | Baixo impacto para DRE |
| `product_catalog` | catálogo | 18 | Sim | nomes/categorias/modelos | Usado para rotulagem |
| `product_categories` | catálogo | 5 | Não direto | Não entra | Baixo impacto para decisão financeira |
| `product_colors` | catálogo | 50 | Não direto | Não entra | Baixo impacto |
| `product_images` | produto | 16 | Não para ORION | Não entra | Visual, não decisão |
| `product_subcategories` | catálogo | 21 | Não direto | Não entra | Baixo impacto |
| `product_subcategory_colors` | catálogo | 80 | Não direto | Não entra | Baixo impacto |
| `quotes` | cotação | 0 | Não | Não entra | Sem dados atuais |
| `sale_payments` | pagamentos/recebíveis | 27 | Sim | Real Profit Engine, recebíveis, reconciliação | Pagamentos entram, mas não viram resumo executivo de recebimento/desconto |
| `sales` | vendas/receita/desconto | 23 | Sim | vendas, receita, `net_amount`, campanha, origem | `net_amount` existe, mas desconto agregado não é exposto |
| `sales_additional_items` | adicionais/upsell/brindes | 13 | Sim | Real Profit Engine e margem | Usado no lucro, mas pouco exposto no review executivo |
| `supplier_prices` | fornecedor/cotação | 92 | Não no snapshot ORION principal | Não entra | Poderia apoiar compra/recompra, hoje não entra |
| `suppliers` | fornecedores | 4 | Indireto | Supplier name aparece em compras/estoque | Não entra como inteligência de fornecimento |
| `trade_ins` | trade-in/estoque | 3 | Sim | venda/trade-in | Entra no real profit |
| `transactions` | financeiro/DRE/despesas | 54 | Sim | fluxo, contas, money classification, DRE legacy | Lido, mas sem demonstrativo financeiro estruturado no `business_review` |
| `users` | auth/usuários | 1 | Não para decisão | Auth/contexto | Fora do escopo da ORION analítica |
| `warranties` | garantias | 22 | Não | Não entra | Reserva/custo de garantia existe em engine, mas tabela de garantia não entra no review |

## O Que a ORION Lê Hoje

### `src/lib/orion/data.ts`

`collectOrionSnapshot` lê:

- `inventory` + `product_catalog`;
- `sales` + `inventory` + `product_catalog` + `trade_ins`;
- `sales_additional_items`;
- `sale_payments`;
- `financial_settings`;
- `marketing_campaigns`;
- `marketing_leads`;
- `transactions` + `finance_chart_accounts` + `sale_payments`;
- `financial_account_movements` + `transactions`;
- `finance_accounts`.

Métricas derivadas:

- caixa reconciliado;
- saldo por ledger;
- recebíveis e contas a pagar;
- fluxo de caixa;
- lucro rastreável por venda;
- lucro disponível;
- capital de giro;
- qualidade de liquidez do estoque;
- vendas por período;
- receita bruta e `netRevenue`;
- lucro e margem por venda/produto;
- campanhas, leads, ROI;
- candidatos de recompra;
- memória operacional e decisória via outras stores.

Campos que entram no snapshot:

- `snapshot.sales.periodPerformance.revenue`;
- `snapshot.sales.periodPerformance.netRevenue`;
- `snapshot.sales.periodPerformance.profit`;
- `snapshot.finance.moneyClassification`;
- `snapshot.finance.realProfitSnapshot`;
- `snapshot.finance.profitAvailabilitySnapshot`;
- `snapshot.finance.currentCashCompositionSnapshot`;
- `snapshot.finance.workingCapitalSnapshot`;
- `snapshot.finance.financialOperationalContext`;
- `snapshot.finance.reconciledIncome30d`;
- `snapshot.finance.reconciledExpense30d`;
- `snapshot.finance.reconciledSalesRevenue30d`;
- `snapshot.finance.reconciledSalesProfit30d`;
- `snapshot.marketing.campaigns`;
- `snapshot.marketing.forgottenLeads`;
- `snapshot.stock.availableItems` e `stuckItems`.

### `src/lib/orion/orion-tool-registry.ts`

Ferramentas disponíveis hoje:

- `finance.cashPosition`;
- `finance.receivables`;
- `finance.payables`;
- `sales.performance`;
- `sales.marginByProduct`;
- `inventory.stuckItems`;
- `inventory.availableStock`;
- `marketing.campaignPerformance`;
- `leads.funnelHealth`;
- `reinvestment.decision`.

Lacuna crítica: não existe uma tool do tipo `finance.statement`, `finance.dre`, `finance.expenses`, `sales.discounts` ou `finance.netProfit`.

### `src/lib/orion/business-decision-orchestrator.ts`

Para `business_review`, a decisão é construída por `buildBusinessReviewDecision`.

Hoje ela usa:

- margem por produto;
- estoque preso;
- campanhas;
- vendas/performance;
- findings de memória.

Ela não recebe um DRE mensal explícito. A função contém caveat genérico:

`Sem DRE/despesas/descontos completos...`

Esse caveat é a origem direta da resposta errada. Ele não está sendo validado contra a cobertura real do banco naquele momento.

### `src/lib/orion/business-query-engine.ts`

Existe uma leitura DRE parcial no contexto legado:

- lê `transactions`;
- faz join com `finance_chart_accounts`;
- calcula `dre.revenue`, `dre.cogs`, `dre.operatingExpenses` quando `toolsUsed` inclui `dre_tool`.

Mas isso não está integrado como tool estruturada do novo fluxo ORION (`OrionToolName`) nem alimenta diretamente `buildBusinessReviewDecision`.

## Verificação DRE

### 1. O ERP possui dados para calcular DRE mensal?

Sim, possui base para um DRE mensal estimado e classificável:

- `finance_chart_accounts` tem `financial_type`, `statement_section`, `affects_dre`, `affects_inventory`, `affects_owner_equity`;
- `transactions` tem `type`, `amount`, `date`, `due_date`, `status`, `source_type`, `chart_account_id`;
- `sales` tem `sale_price`, `net_amount`, `supplier_cost`, `sale_date`;
- `inventory` tem `purchase_price`;
- `sales_additional_items` tem `cost_price`, `sale_price`, `profit`;
- `sale_payments` tem pagamentos e status;
- `financial_account_movements` tem extrato reconciliado;
- `inventory_purchases` e `inventory_purchase_items` existem para compras/custos.

Não há uma tabela chamada literalmente `dre`, mas há estrutura de plano de contas e transações classificáveis para construir DRE.

### 2. A ORION já lê esses dados?

Parcialmente sim.

Ela lê as tabelas principais em `collectOrionSnapshot` e também tem uma leitura DRE parcial no `business-query-engine`.

### 3. A ORION envia esses dados para a camada de decisão?

Parcialmente.

A camada de decisão recebe `snapshot.finance` e tools, mas o fluxo de `business_review` não recebe um demonstrativo financeiro explícito com:

- receita bruta;
- descontos;
- receita líquida;
- CMV;
- lucro bruto;
- despesas operacionais;
- marketing;
- lucro líquido estimado;
- qualidade/classificação das linhas.

### 4. A ORION envia esses dados para a camada conversacional?

Não de forma suficiente.

A Conversation Layer recebe `structuredResponse` compacto e `allowedFacts` derivados do response estruturado. Se `businessDecision` não expõe DRE/descontos/despesas, a conversa também não pode falar disso com segurança.

### 5. Por que ela disse que não tem DRE/despesas/descontos completos?

Porque a decisão estruturada de `business_review` tem caveat genérico e não possui um `financialStatementSnapshot` explícito para confirmar o que foi considerado.

O banco tem estrutura e dados. O snapshot tem parte dos derivados financeiros. Mas a camada de decisão não transforma isso em DRE executivo para responder “a empresa está indo bem?”.

### 6. O problema é dado inexistente, query incompleta ou payload incompleto?

Principalmente payload/modelagem incompleta.

Também há lacuna de query/modelo porque não existe uma tool oficial de DRE no `orion-tool-registry`, apesar de o `business-query-engine` legado já calcular DRE parcial.

## Diagnóstico de Lacunas

### Dados existentes e já usados

- vendas do período;
- receita bruta de vendas;
- `netRevenue` no snapshot de vendas;
- custo principal via `inventory.purchase_price` e `sales.supplier_cost`;
- adicionais de venda;
- pagamentos de venda;
- caixa reconciliado;
- extrato por `financial_account_movements`;
- contas a pagar/receber via `transactions`;
- lucro rastreável via Real Profit Engine;
- estoque operacional;
- campanhas e leads;
- decisões abertas.

### Dados existentes mas não usados suficientemente pela ORION

- DRE mensal como demonstrativo explícito;
- descontos agregados (`sales.sale_price - sales.net_amount`);
- despesas por plano de contas;
- CMV agregado por período;
- compras de estoque com frete/outros custos (`inventory_purchases`, `inventory_purchase_items`);
- marketing spend como linha de DRE;
- problemas/reembolsos/reparos (`problems`);
- garantias (`warranties`);
- supplier prices para recomendação de compra/recompra.

### Dados parcialmente usados

- lucro rastreável é usado, mas lucro líquido/DRE não é exposto como statement;
- vendas são usadas, mas descontos não aparecem como métrica decisória;
- campanhas são usadas, mas marketing spend não vira linha de despesa operacional/DRE;
- contas a pagar/receber são usadas para liquidez, mas não como competência/caixa em demonstrativo;
- `finance_chart_accounts` é usado para classificação, mas o resultado não chega como DRE estruturado no `business_review`.

### Dados inexistentes ou não confiáveis

- Não foi encontrada tabela literal `dre`.
- `quotes` está vazia no momento da auditoria.
- A confiabilidade do DRE depende da classificação correta em `finance_chart_accounts` e do vínculo das `transactions` com `chart_account_id`.

## Causa Raiz da Resposta Errada

A resposta “sem DRE/despesas/descontos completos” foi construída porque:

1. `buildBusinessReviewDecision` usa um caveat genérico para `generic_business_review`.
2. `business_review` não chama uma tool oficial de DRE.
3. `OrionToolName` não possui `finance.statement`/`finance.dre`/`sales.discounts`.
4. `sales.periodPerformance.netRevenue` existe, mas o desconto agregado não é calculado/exposto na decisão.
5. `transactions` e `finance_chart_accounts` existem e são lidos, mas não viram um `orionFinancialStatementSnapshot`.
6. A Conversation Layer só conversa com os fatos do structured response; se o DRE não chegou ali, ela não pode corrigir a cegueira da camada anterior.

## Plano de Correção

### 1. `orionFinancialStatementSnapshot`

Criar snapshot financeiro executivo mensal com:

- período;
- receita bruta;
- descontos de venda;
- receita líquida;
- CMV;
- lucro bruto;
- despesas operacionais;
- marketing;
- taxas/cartão;
- reparos/reembolsos/garantias quando houver;
- lucro líquido estimado;
- classificação das linhas;
- caveats específicos.

Origem provável:

- `sales`;
- `sale_payments`;
- `sales_additional_items`;
- `inventory`;
- `transactions`;
- `finance_chart_accounts`;
- `financial_account_movements`;
- `inventory_purchases`;
- `problems`;
- `warranties`.

### 2. `orionCommercialSnapshot`

Ampliar o snapshot comercial com:

- vendas por produto;
- ticket médio;
- margem por produto;
- descontos por venda/período;
- produtos âncora;
- estoque parado;
- giro por produto;
- taxa de conversão por origem quando possível.

### 3. `orionMarketingSnapshot`

Consolidar:

- campanhas;
- leads;
- custo por lead;
- conversão;
- vendas originadas;
- spend como linha de marketing no DRE;
- campanha sem venda vs campanha com venda.

### 4. `orionExecutiveSnapshot`

Montar camada pronta para decisão:

- saúde financeira;
- saúde comercial;
- gargalo principal;
- produto âncora;
- risco de liquidez;
- fatos permitidos para Conversation Layer;
- caveats específicos por dado ausente/classificação incompleta.

### 5. Tools ORION novas

Adicionar ao `OrionToolName`:

- `finance.statement`;
- `finance.expenses`;
- `sales.discounts`;
- `finance.netProfit`;

Depois, `business_review` deve chamar pelo menos:

- `finance.statement`;
- `sales.performance`;
- `sales.marginByProduct`;
- `inventory.stuckItems`;
- `marketing.campaignPerformance`;
- `finance.cashPosition`.

## Critério de Aceite para a Próxima Fase

A ORION não deve mais dizer genericamente:

> sem DRE/despesas/descontos completos

Ela deve dizer algo específico:

- “DRE estimado considerado para o período.”
- “DRE parcial porque X transações não têm `chart_account_id`.”
- “Descontos de venda considerados a partir de `sales.net_amount`.”
- “CMV considerado a partir de `inventory.purchase_price`, `sales.supplier_cost` e adicionais.”
- “Despesas operacionais consideradas a partir de transações classificadas como `operating_expense`.”
- “Marketing considerado a partir de campanhas/transações classificadas.”
- “Não encontrei lançamento classificado para Y.”

## Próximos Arquivos a Alterar

Não alterados nesta auditoria, mas são os próximos pontos técnicos:

1. `src/lib/orion/orion-tool-registry.ts`
2. `src/lib/orion/types.ts`
3. `src/lib/orion/data.ts`
4. `src/lib/orion/business-decision-orchestrator.ts`
5. `src/lib/orion/orion-response-orchestrator.ts`
6. `src/lib/orion/orion-executive-conversation-layer.ts` somente para allowedFacts depois que o dado chegar estruturado
7. testes de `semantic-planner`, `orion-tool-registry`, `business-decision-orchestrator` e `orion-response-orchestrator`

## Riscos

- DRE por competência vs caixa precisa ser definido para não misturar venda, pagamento e reconciliação.
- Transações sem `chart_account_id` reduzem confiança.
- Estoque comprado como ativo não deve ser tratado automaticamente como despesa operacional.
- Trade-in e adicionais precisam continuar sem duplicidade de receita/custo.
- Marketing spend pode existir em campanha e em transação; precisa regra anti-duplicidade.
- Sale payments e transactions podem representar a mesma entrada; precisa preservar a lógica da Real Profit Engine.

## Decisão Recomendada

Pausar evolução de “IA viva” e voltar para Data Intelligence.

Prioridade: implementar `orionFinancialStatementSnapshot` antes de continuar refinando conversa.
