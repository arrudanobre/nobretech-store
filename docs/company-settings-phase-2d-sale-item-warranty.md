# Central de Configurações — Fase 2D Garantia por Item de Venda

## Resultado da análise

A Fase 2D não deve criar `sale_item_warranties` ainda.

O schema real de vendas não possui uma tabela única e estável de itens de venda. Hoje existem duas estruturas diferentes:

- Item principal da venda: `sales.inventory_id`.
- Itens adicionais, upsells e brindes: `sales_additional_items.id` com vínculo comercial por `sale_id` e vínculo técnico opcional por `product_id`.

Isso impede criar uma garantia realmente “por item de venda” sem ambiguidade. Usar `sales.id` como item principal e `sales_additional_items.id` como item adicional dentro de uma mesma coluna seria uma modelagem polimórfica frágil. Criar `sale_item_warranties` antes de existir um contrato único de item de venda também deixaria documentos, portal e histórico vulneráveis a interpretações diferentes do que é “item”.

## Schema real encontrado

### `sales`

Tabela de venda principal.

Campos relevantes:

- `id`
- `company_id`
- `inventory_id`
- `customer_id`
- `sale_price`
- `sale_date`
- `warranty_months`
- `warranty_start`
- `warranty_end`
- `warranty_pdf_url`
- `sale_status`
- `payment_status`
- `customer_type`

O aparelho principal vendido é representado por `sales.inventory_id`. Não existe uma linha própria em `sale_items` para esse item.

### `sales_additional_items`

Tabela de itens adicionais.

Campos relevantes:

- `id`
- `company_id`
- `sale_id`
- `product_id`
- `type`
- `name`
- `cost_price`
- `sale_price`
- `profit`
- `packaging_type`
- `packaging_notes`

`type` distingue `upsell` e `free`. O campo `product_id` é opcional e, no schema local validado, não possui FK explícita para `inventory(id)`.

## Bloqueio técnico

Não há ID estável e uniforme para “item vendido” cobrindo:

- item principal da venda
- upsell
- brinde
- acessório
- produto sem vínculo técnico em estoque
- futuro item com variação/kit

Por isso, a tabela `sale_item_warranties` não foi criada nesta fase.

## Risco evitado

Criar `sale_item_warranties` agora exigiria uma destas alternativas ruins:

- `sale_item_id` apontando às vezes para `sales.id` e às vezes para `sales_additional_items.id`.
- `sale_item_id` sem FK real.
- múltiplas colunas opcionais como `sale_id`, `sales_additional_item_id` e `inventory_item_id` tentando inferir o item.
- garantia presa apenas em `inventory_item_id`, o que não representa corretamente itens adicionais sem estoque, brindes ou kits.

Todas essas opções criariam histórico difícil de auditar e poderiam contaminar documentos, portal e futuras regras de garantia.

## Recomendação de pré-requisito

Antes de criar `sale_item_warranties`, criar um contrato canônico de item de venda.

Tabela candidata:

```sql
sale_items
```

Campos sugeridos:

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
- `created_at`
- `updated_at`

Regras sugeridas:

- Uma venda deve materializar o item principal em `sale_items`.
- Cada linha de `sales_additional_items` deve ter representação em `sale_items`.
- `source_table/source_id` pode manter rastreabilidade durante transição, mas consumidores futuros devem preferir `sale_items.id`.
- `inventory_item_id` deve ser opcional para permitir itens sem estoque rastreável, mas quando preenchido deve referenciar `inventory(id)`.
- Garantia por item deve referenciar `sale_items(id)`, não uma mistura de `sales.id` e `sales_additional_items.id`.

## Modelagem futura de `sale_item_warranties`

Depois de existir `sale_items`, criar:

```sql
sale_item_warranties
```

Campos recomendados:

- `id`
- `company_id`
- `sale_id`
- `sale_item_id`
- `inventory_item_id`
- `warranty_policy_id`
- `warranty_nature`
- `warranty_name`
- `warranty_label`
- `duration_months`
- `duration_days`
- `calculation_mode`
- `starts_at`
- `ends_at`
- `manufacturer_coverage_reference`
- `manufacturer_coverage_url`
- `manual_notes`
- `policy_snapshot`
- `terms_snapshot`
- `active`
- `created_at`
- `updated_at`

Constraints recomendadas:

- `company_id` referencia `companies(id)`.
- `sale_id` referencia `sales(id)`.
- `sale_item_id` referencia `sale_items(id)`.
- `inventory_item_id` referencia `inventory(id)` quando preenchido.
- `warranty_policy_id` referencia `warranty_policies(id)`.
- `policy_snapshot` e `terms_snapshot` devem ser `JSONB`.
- Índice único parcial para no máximo uma garantia ativa por `sale_item_id`.

## Snapshot obrigatório

Quando a garantia por item for criada, ela deve salvar snapshot histórico da política.

`policy_snapshot` deve conter, no mínimo:

- `warranty_policy_id`
- `name`
- `warranty_nature`
- `default_months`
- `default_days`
- `calculation_mode`
- `public_label_template`
- `selection_label`
- `selection_description`
- `legal_basis`
- `effective_from`
- `effective_until`

`terms_snapshot` deve conter os termos ativos da política no momento da venda:

- `term_type`
- `title`
- `body`
- `sort_order`

## Cálculo futuro de datas

O helper de cálculo deve seguir:

- `calendar_months`: soma meses civis a `starts_at`.
- `fixed_days`: soma dias corridos a `starts_at`.
- `manual_dates`: exige `ends_at` informado.

Regras:

- `starts_at` deve ser explícito ou vir da data da venda na integração.
- `ends_at` não pode ser anterior a `starts_at`.
- Garantia de fabricante deve poder usar `manual_dates`.

## O que não foi integrado

Nada foi integrado nesta fase:

- venda nova
- catálogo público
- portal de transparência
- documentos
- recibos
- laudos
- etiquetas
- ORION
- marketing
- financeiro
- DRE
- UX

## Próximo passo recomendado

Executar uma fase anterior à garantia por item:

1. Criar o contrato canônico `sale_items`.
2. Materializar item principal e adicionais nessa estrutura, sem mudar comportamento público.
3. Validar relatórios, portal e venda contra a nova identidade de item.
4. Só então criar `sale_item_warranties` referenciando `sale_items(id)`.

## Atualização Fase 2D.1

A Fase 2D.1 implementou o contrato canônico `sale_items` e seu backfill idempotente.

Documento complementar:

```text
docs/phase-2d1-sale-items-canonical-contract.md
```

Com isso, a próxima fase pode retomar `sale_item_warranties` usando `sale_items(id)` como FK real do item vendido.
