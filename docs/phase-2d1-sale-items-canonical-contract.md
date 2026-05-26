# Central de Configurações / Vendas — Fase 2D.1 Sale Items

## Objetivo

A Fase 2D.1 cria o contrato canônico `sale_items` para representar todos os itens de uma venda de forma uniforme, sem alterar consumidores atuais.

Essa estrutura é pré-requisito para garantia por item, documentos por item, portal por item, histórico por item, kits, brindes, upsells e relatórios mais consistentes.

## Schema anterior

Antes desta fase, o ERP tinha duas estruturas para itens vendidos:

- Item principal: `sales.inventory_id`.
- Itens adicionais: `sales_additional_items.id`, com `product_id` opcional.

Não existia `sale_item_id` único para item principal, upsells e brindes.

## Riscos evitados

A Fase 2D foi bloqueada porque criar `sale_item_warranties` sem `sale_items` exigiria modelagem polimórfica frágil.

Exemplos evitados:

- usar `sales.id` como item principal e `sales_additional_items.id` como item adicional na mesma coluna;
- criar `sale_item_id` sem FK real;
- prender garantia apenas em `inventory_item_id`, ignorando adicionais sem vínculo técnico com estoque;
- misturar garantia por venda com garantia por item.

## Tabela criada

Migration:

```text
migrations/sale_items_canonical_contract.sql
```

Tabela:

```text
sale_items
```

Campos principais:

- `id`
- `company_id`
- `sale_id`
- `inventory_item_id`
- `source_table`
- `source_id`
- `item_role`
- `item_type`
- `display_name`
- `quantity`
- `unit_price`
- `total_price`
- `unit_cost`
- `total_cost`
- `is_gift`
- `sort_order`
- `metadata`
- `active`
- `created_at`
- `updated_at`

## Constraints e índices

FKs:

- `company_id` referencia `companies(id)`.
- `sale_id` referencia `sales(id)`.
- `inventory_item_id` referencia `inventory(id)` quando preenchido.

Checks:

- `source_table`: `sales`, `sales_additional_items`.
- `item_role`: `main`, `upsell`, `gift`, `accessory`, `service`, `other`.
- `item_type`: `device`, `accessory`, `service`, `other`.
- `quantity > 0`.
- preços e custos não negativos.

Índices:

- `idx_sale_items_company`
- `idx_sale_items_sale`
- `idx_sale_items_inventory`
- `idx_sale_items_source`
- `idx_sale_items_unique_source`

`idx_sale_items_unique_source` impede duplicar a mesma origem por empresa.

## Estratégia de backfill

O backfill é idempotente e roda dentro da migration.

### Item principal

Para cada venda com `sales.inventory_id`, cria uma linha:

- `source_table = 'sales'`
- `source_id = sales.id`
- `item_role = 'main'`
- `inventory_item_id = sales.inventory_id`
- `quantity = 1`
- `is_gift = false`
- `sort_order = 0`

O preço do item principal é alocado como:

```text
sales.sale_price - total de upsells cobrados
```

Motivo: `sales.sale_price` já representa o total comercial da venda e pode incluir upsells. Se o principal recebesse o total bruto e os upsells também tivessem preço, somar `sale_items.total_price` duplicaria receita em relatórios futuros.

O valor bruto original da venda fica preservado em `metadata.legacy_sale_price`.

### Itens adicionais

Para cada linha de `sales_additional_items`, cria uma linha:

- `source_table = 'sales_additional_items'`
- `source_id = sales_additional_items.id`
- `item_role = 'upsell'` quando `type = 'upsell'`
- `item_role = 'gift'` quando `type = 'free'`
- `display_name = sales_additional_items.name`
- `quantity = 1`
- `unit_price` e `total_price` usam `sale_price`, ou `0` quando ausente
- `unit_cost` e `total_cost` usam `cost_price`
- `is_gift = true` quando `type = 'free'`

`inventory_item_id` só é preenchido quando `product_id` encontra uma linha real em `inventory` da mesma empresa. Quando não há vínculo seguro, fica `NULL`.

## Queries e helpers

Arquivo:

```text
src/lib/sales/sale-items.ts
```

Funções:

- `getSaleItems(companyId, saleId)`
- `getSaleItemById(companyId, saleItemId)`
- `getSaleItemsByInventoryItem(companyId, inventoryItemId)`
- `getSaleItemsSummary(companyId, saleId)`
- `materializeSaleItemsForSale(companyId, saleId)`
- `ensureSaleItemsForSale(companyId, saleId)`

Os helpers de materialização são idempotentes e não são ligados ao fluxo de venda nesta fase.

## Limitações conhecidas

- A criação de venda ainda não escreve em `sale_items`.
- Consumidores existentes ainda leem `sales` e `sales_additional_items`.
- `source_table/source_id` é ponte de transição, não modelo final de negócio.
- `sales_additional_items.product_id` não deve ser assumido como `inventory(id)` sem match real.
- Garantia por item ainda não foi criada.

## Como destrava `sale_item_warranties`

Com `sale_items.id`, a próxima fase pode criar `sale_item_warranties` com FK real para o item vendido, evitando modelagem polimórfica.

O futuro vínculo de garantia deverá referenciar:

```text
sale_item_warranties.sale_item_id -> sale_items.id
```

E salvar snapshot da política de garantia no momento da venda.

## Fora do escopo

Nada foi integrado nesta fase:

- wizard de venda
- documentos
- portal de transparência
- catálogo público
- garantia por item
- financeiro
- DRE
- ORION
- marketing
- UX
