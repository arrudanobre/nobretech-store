# Fluxos do Sistema Nobretech Store

Este documento explica como o sistema deve ser entendido por quem chega ao projeto pelo GitHub. O objetivo e mostrar a regra de negocio antes do codigo.

## 1. Visao geral

A Nobretech Store opera com quatro grandes frentes:

1. Estoque de aparelhos, acessorios e produtos Apple.
2. Vendas com possibilidade de upsell, brinde, parcelamento e trade-in.
3. Assistencia tecnica, garantias, problemas e laudos.
4. Financeiro gerencial com caixa, contas, cartoes, DRE e fluxo futuro.

O sistema precisa refletir a operacao real da loja. Ele nao e apenas um cadastro de produtos: ele acompanha o produto desde a compra ate a venda, geracao de documentos, impacto financeiro e indicadores de decisao.

## 2. Compra e cadastro de estoque

### Fluxo ideal

1. A loja compra um ou varios produtos.
2. A compra e cadastrada em lote em `/estoque/compras/nova`.
3. O usuario informa fornecedor, data, forma de pagamento, frete e outros custos.
4. O sistema rateia frete e custos extras entre os itens.
5. O custo final unitario passa a incluir esse rateio.
6. Os produtos entram no estoque como ativos.
7. A movimentacao financeira pode sair do caixa, mas nao entra no DRE como despesa.

### Regras

- Compra de estoque nao e prejuizo nem despesa operacional.
- Compra de estoque e troca de caixa por ativo.
- O valor so vira CMV quando o produto for vendido.
- Acessorios iguais e sem IMEI/serial podem ficar em uma linha com quantidade.
- Aparelhos com IMEI/serial devem ser tratados como unidades rastreaveis.
- Produto manual/outro deve permitir nomes livres, como capa, pelicula, fonte, cabo, Apple Pencil e acessorios.

### Exemplo

Se a loja compra 10 produtos e paga R$ 10,00 de frete, o sistema adiciona R$ 1,00 ao custo de cada unidade. Assim, quando vender, o lucro e CMV ja consideram o custo real de aquisicao.

## 3. Estoque

A tela de estoque deve responder rapidamente:

- O que tenho para vender?
- Quantas unidades tenho?
- Qual item esta parado?
- Qual item esta reservado?
- Qual item posso editar ou excluir?

### Busca e filtros

A busca deve considerar:

- Nome do produto
- Modelo
- IMEI
- Numero de serie
- Categoria
- Observacoes

Os filtros de categoria devem aceitar variacoes como `Acessorio`, `Acessorios`, `Acessório` e `Acessórios`.

### Status

| Status | Significado |
| --- | --- |
| Ativo | Disponivel para venda |
| Reservado | Bloqueado para uma venda futura |
| Vendido | Saiu do estoque por venda |
| Defeituoso | Item com problema ou inapto |

### Exclusao

Hoje a exclusao de item de estoque e restrita ao usuario autorizado. No futuro isso deve virar permissao por perfil.

## 4. Venda

A venda e o fluxo mais sensivel do sistema, pois altera estoque, financeiro, documentos, garantia e indicadores.

### Etapas do fluxo

1. Selecionar produto principal.
2. Informar cliente.
3. Ajustar carrinho: quantidade, preco, upsell ou brinde.
4. Escolher pagamento.
5. Informar garantia e observacoes.
6. Concluir venda ou reservar.

### Produto principal

O produto principal pode ter:

- Quantidade, respeitando o estoque disponivel.
- Preco oficial/sugerido.
- Preco negociado.
- Desconto concedido, quando o negociado for menor que o oficial.

### Upsell e brinde

Itens adicionais podem ser:

- `Upsell`: vendido junto e aumenta receita.
- `Brinde`: entregue sem cobrar e reduz lucro pelo custo.

Todos devem respeitar a quantidade disponivel no estoque.

### Trade-in

Trade-in e quando a loja recebe um aparelho como parte do pagamento.

Exemplo:

- Produto vendido: R$ 7.950,00
- Desconto concedido: R$ 85,00
- Valor final do produto: R$ 7.865,00
- iPhone recebido no trade-in: R$ 3.450,00
- Saldo em dinheiro/cartao: R$ 4.415,00

O recibo e a tela de venda devem mostrar:

- Valor oficial do produto
- Desconto concedido
- Valor final negociado
- Aparelho recebido no trade-in
- Valor atribuido ao trade-in
- Valor pago pelo cliente
- Valor liquido recebido pela loja, quando houver taxa embutida

### Downgrade

Downgrade acontece quando o aparelho recebido no trade-in vale mais que o produto vendido.

Nesse caso, o sistema deve deixar claro:

- Valor do produto vendido
- Valor do aparelho recebido
- Valor que a loja precisa devolver ao cliente

Esse valor e uma saida de caixa operacional ligada a negociacao. Ele nao deve ser tratado como nova despesa de DRE se for apenas acerto financeiro da venda.

### Parcelamento e Sidepay

A maquininha aceita ate 18x, mas a loja recebe no ato. Por isso:

- Nao deve ser criada uma parcela a receber para cada mes.
- O sistema calcula o valor que o cliente paga ja com acrescimo.
- A loja considera o valor liquido desejado como recebido.
- A taxa embutida deve aparecer como informativa e, quando aplicavel, como deducao/taxa no resultado.

## 5. Reserva de venda

Uma reserva bloqueia o estoque e cria um recebivel futuro.

Use quando:

- O cliente confirmou a compra.
- O pagamento ficara para uma data futura.
- O produto nao deve aparecer como disponivel.

Ao receber:

1. O recebivel e conciliado.
2. A venda passa a concluida.
3. O estoque deixa de ficar reservado e passa a vendido.

## 6. Documentos

O sistema gera documentos em dois niveis.

### Documento da venda

O recibo e unico para a negociacao completa.

Ele deve consolidar:

- Cliente
- Produto principal
- Itens adicionais
- IMEI/serial
- Descontos
- Trade-in
- Forma de pagamento
- Valor pago pelo cliente

### Documento por produto

Garantia e laudo sao por produto.

Isso e importante quando uma venda tem mais de um aparelho, porque cada aparelho pode ter:

- Garantia propria
- IMEI proprio
- Laudo tecnico proprio
- Condicao propria

## 7. Financeiro

O financeiro e dividido em modulos que conversam entre si.

### Painel financeiro

Mostra:

- Saldo em contas
- Entradas conciliadas
- Saidas de caixa
- Resultado liquido
- Fluxo de caixa futuro
- Saude financeira
- Contas da empresa
- Movimentos recentes

### Entradas e saidas

Central de movimentos financeiros:

- Lancamentos manuais
- Receitas
- Despesas
- Aportes
- Retiradas
- Compras de estoque
- Vendas vindas do sistema
- Conciliacao com conta

### Contas a receber

Usado para:

- Vendas reservadas
- Recebimentos futuros
- Valores pendentes de entrada
- Recebimentos de vendas antigas cadastradas manualmente

### Contas a pagar

Usado para:

- Despesas pendentes
- Compras a pagar
- Despesas parceladas
- Despesas recorrentes
- Faturas de cartao quando aplicavel

### Cartoes de credito

Cada cartao deve ter:

- Nome
- Instituicao
- Final
- Dia de vencimento
- Dia de fechamento
- Fatura atual
- Lancamentos da fatura
- Acao de pagar fatura escolhendo a conta de origem

Despesas lancadas no cartao entram na fatura conforme fechamento/vencimento.

## 8. DRE

DRE e Demonstracao do Resultado do Exercicio. Ele mede resultado economico, nao saldo de caixa.

### Estrutura usada

1. Receita Bruta de Vendas
2. Deducoes da Receita
3. Custo das Mercadorias Vendidas (CMV)
4. Despesas Operacionais
5. Resultado Financeiro
6. Impostos
7. Lucro Liquido

### Regras criticas

- Venda entra em receita.
- Desconto entra como deducao da receita.
- Taxa de cartao pode entrar como deducao ou despesa financeira, conforme classificacao.
- CMV vem apenas de produtos vendidos.
- Compra de estoque nao entra no DRE.
- Aporte de socio nao entra no DRE.
- Retirada de socio nao entra no DRE.
- Gastos operacionais entram conforme categoria do Plano de DRE.

### Plano de DRE

O Plano de DRE permite criar categorias e subcategorias usadas nos lancamentos.

Campos tecnicos como codigo, ordem, nivel e grupo visual devem ser gerados/preenchidos pelo sistema sempre que possivel, para evitar erro operacional.

## 9. Assistencia tecnica e problemas

A tela de problemas controla casos de assistencia.

Um problema deve ter:

- Produto vinculado
- Cliente
- Descricao
- Urgencia
- Status
- SLA
- Historico de atualizacoes/comentarios

Os comentarios devem ser persistidos e exibidos no card do problema, formando a linha do tempo do atendimento.

## 10. Garantias

Garantias devem ser calculadas a partir da data da venda, nao da data atual.

A tela deve mostrar:

- Produto
- Cliente
- Data de inicio
- Data final
- Dias restantes
- Status
- Acoes de documento

## 11. Dashboard e indicadores

O dashboard deve ir alem de mostrar numeros. Ele deve ajudar a decidir.

Indicadores importantes:

- Investido em estoque
- Vendas no mes
- Lucro liquido
- Margem media
- Giro de estoque
- Tempo medio para vender
- Produtos parados
- Produto que vende mais rapido
- Grafico bruto x liquido
- Categorias vendidas
- Fluxo de caixa futuro
- Alertas de decisao rapida

## 12. Fluxo de caixa futuro

O fluxo de caixa futuro deve responder:

> Vou ter dinheiro suficiente nos proximos 15, 30 e 60 dias?

Ele considera:

- Saldo atual das contas
- Contas a receber
- Contas a pagar
- Faturas futuras
- Vendas reservadas
- Despesas recorrentes

Ele nao deve criar parcelas a receber para vendas parceladas na maquininha, porque a loja recebe no ato.

## 13. Familias de dados

Principais grupos de tabelas:

| Grupo | Exemplos |
| --- | --- |
| Estoque | `inventory`, `inventory_purchases`, `inventory_purchase_items`, `product_catalog` |
| Vendas | `sales`, `sales_additional_items`, `trade_ins`, `warranties` |
| Financeiro | `transactions`, `finance_accounts`, `finance_credit_cards`, `finance_chart_accounts`, `financial_settings` |
| Atendimento | `problems`, `problem_updates`, `checklists` |
| Cadastros | `customers`, `suppliers`, `supplier_prices` |
| Auditoria | `audit_logs` |

## 14. Convencoes importantes

- Datas de negocio devem aparecer como data simples, sem timezone completo.
- Valores monetarios devem ser exibidos em BRL.
- Nomes tecnicos como `credit_18x` nao devem aparecer para o usuario; use `Credito 18x`.
- O banco deve ficar protegido no servidor; nunca use `DATABASE_URL` publico.
- Fotos continuam fora do fluxo de estoque ate existir uma estrategia de storage/cache.
- Toda mudanca em venda deve ser testada com:
  - venda simples
  - venda com upsell
  - venda com brinde
  - venda com trade-in
  - venda com cartao
  - exclusao/restauracao de venda
