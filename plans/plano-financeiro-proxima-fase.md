# Plano de Acao - Financeiro Proxima Fase

## Contexto

O modulo financeiro atual ja cobre a base operacional da Nobretech Store: painel financeiro, entradas e saidas, contas a pagar, contas a receber, cartoes de credito, DRE, plano de DRE, aportes/retiradas de socios e compra de estoque separada do resultado.

Esta proxima fase deve evoluir o financeiro para controle gerencial mais completo, sem quebrar os fluxos atuais e mantendo o padrao visual ja aplicado nas telas financeiras.

## Regras gerais de execucao

- Fazer em etapas pequenas e testaveis.
- Nao refatorar o modulo financeiro inteiro.
- Preservar layout global, Providers, autenticacao temporaria e estrutura principal.
- Manter o padrao visual atual do financeiro: cards limpos, tabelas enxutas, badges claros, modais consistentes.
- Toda tabela nova deve ter `company_id`.
- Toda migration deve ser compativel com Railway/PostgreSQL.
- Toda funcionalidade deve ser testada localmente antes de commit/deploy.
- Nao commitar sem validacao local do usuario.

## Etapa 1 - Fluxo de Caixa Projetado por Conta

### Objetivo

Criar uma visao clara de saldo atual e saldo futuro por conta, considerando entradas e saidas previstas.

### Escopo

- Criar tela `Financeiro > Fluxo de Caixa`.
- Permitir filtro por:
  - Conta bancaria.
  - Periodo.
  - Status: realizado, previsto, todos.
- Exibir saldo inicial, entradas previstas, saidas previstas e saldo projetado.
- Mostrar linha diaria ou mensal, dependendo do periodo.
- Separar movimentos conciliados de movimentos pendentes.
- Indicar dias em que o caixa fica negativo.

### Dados usados

- `finance_accounts`
- `transactions`
- `finance_credit_cards`
- Faturas de cartao, quando existirem.
- Contas a pagar/receber representadas por transacoes pendentes.

### Criterio de sucesso

- O usuario consegue responder: "Quanto vou ter em cada conta nos proximos dias/semanas?"
- Uma despesa futura aparece no saldo projetado, mas nao altera saldo conciliado.
- Uma receita a receber aparece como entrada prevista.

## Etapa 2 - Fechamento e Pagamento de Fatura de Cartao

### Objetivo

Transformar cartao de credito em um fluxo financeiro completo: lancar despesas, acompanhar fatura, fechar fatura e pagar por uma conta.

### Escopo

- Criar/ajustar estrutura de faturas de cartao.
- Em `Financeiro > Cartoes`, permitir:
  - Ver fatura aberta por mes.
  - Ver lancamentos da fatura.
  - Marcar fatura como fechada.
  - Pagar fatura escolhendo conta de origem.
  - Registrar pagamento como saida conciliada da conta escolhida.
- Ao pagar fatura:
  - Baixar os lancamentos da fatura.
  - Criar movimento de caixa na conta.
  - Evitar duplicidade no contas a pagar.

### Campos/tabelas provaveis

- `finance_credit_card_invoices`
  - `id`
  - `company_id`
  - `credit_card_id`
  - `reference_month`
  - `closing_date`
  - `due_date`
  - `total_amount`
  - `status` (`open`, `closed`, `paid`)
  - `paid_at`
  - `paid_account_id`
  - `payment_transaction_id`

### Criterio de sucesso

- Despesa no cartao entra na fatura correta.
- Fatura fechada nao recebe novos lancamentos.
- Pagamento da fatura sai da conta escolhida.
- A tela de cartoes mostra fatura, vencimento, total e lancamentos.

## Etapa 3 - Permissoes por Perfil

### Objetivo

Substituir regras temporarias por permissoes reais quando o login/multinivel for retomado.

### Escopo

- Definir perfis:
  - Dono/Admin.
  - Financeiro.
  - Vendedor.
  - Tecnico/Assistencia.
  - Consulta.
- Criar matriz de permissoes por modulo.
- Aplicar permissoes para:
  - Excluir estoque.
  - Editar financeiro.
  - Excluir lancamentos.
  - Ver DRE/lucro.
  - Ver dados sensiveis de cliente.

### Tabelas provaveis

- `roles`
- `permissions`
- `role_permissions`
- `user_roles`

### Criterio de sucesso

- Apenas usuarios autorizados podem excluir itens, alterar financeiro ou ver lucro.
- A UI nao mostra botoes que o usuario nao pode usar.
- O backend/API tambem bloqueia operacoes proibidas.

## Etapa 4 - Auditoria Financeira

### Objetivo

Registrar quem criou, editou, excluiu, conciliou ou desfez movimentos financeiros.

### Escopo

- Criar historico para:
  - Criacao de lancamento.
  - Edicao.
  - Exclusao.
  - Conciliacao.
  - Desconciliacao.
  - Pagamento de fatura.
  - Fechamento de fatura.
- Exibir historico no detalhe do lancamento.
- Criar tela simples de auditoria em `Financeiro > Auditoria`.

### Tabela provavel

- `finance_audit_logs`
  - `id`
  - `company_id`
  - `entity_type`
  - `entity_id`
  - `action`
  - `before_data`
  - `after_data`
  - `user_id`
  - `user_email`
  - `created_at`

### Criterio de sucesso

- Qualquer alteracao financeira importante deixa rastro.
- O usuario consegue ver o antes/depois de uma edicao.
- Exclusoes financeiras ficam auditaveis.

## Etapa 5 - Exportacao PDF/Excel

### Objetivo

Permitir exportar relatorios financeiros para conferencia, envio ou arquivo.

### Escopo

- Exportar DRE mensalizado por ano.
- Exportar fluxo de caixa.
- Exportar contas a pagar.
- Exportar contas a receber.
- Exportar fatura de cartao.

### Formatos

- Excel/CSV para analise.
- PDF para apresentacao.

### Criterio de sucesso

- O arquivo exportado bate com os valores da tela.
- Exportacao respeita filtros aplicados.
- PDF tem visual limpo e profissional.

## Etapa 6 - Conciliacao Bancaria por OFX/CSV

### Objetivo

Reduzir trabalho manual comparando extrato bancario com movimentos do sistema.

### Escopo

- Criar importador de extrato:
  - OFX.
  - CSV.
- Criar tela de conciliacao:
  - Extrato importado de um lado.
  - Lancamentos do sistema do outro.
  - Sugestoes automaticas por valor, data e descricao.
- Permitir:
  - Conciliar automaticamente.
  - Conciliar manualmente.
  - Ignorar item do extrato.
  - Criar lancamento a partir do extrato.

### Tabelas provaveis

- `bank_statement_imports`
- `bank_statement_items`
- `bank_reconciliation_matches`

### Criterio de sucesso

- Usuario importa extrato e ve divergencias.
- Sistema sugere conciliacoes provaveis.
- Movimentos conciliados nao duplicam caixa.

## Ordem recomendada

1. Fluxo de caixa projetado por conta.
2. Fatura de cartao robusta.
3. Auditoria financeira.
4. Exportacao PDF/Excel.
5. Permissoes por perfil.
6. Importacao OFX/CSV.

## Observacoes importantes

- Estoque comprado nao deve virar despesa operacional no DRE no momento da compra.
- Aporte de socio aumenta caixa, mas nao e receita.
- Retirada de lucro reduz caixa/socios, mas nao e despesa operacional.
- Receita de venda entra no DRE.
- CMV entra no DRE quando o produto e vendido.
- Despesas operacionais previstas podem entrar no calculo de ponto de equilibrio, mesmo antes de pagas, desde que estejam classificadas corretamente.

