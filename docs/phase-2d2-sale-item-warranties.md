# Fase 2D.2 — Garantia por Item de Venda (backend)

**Status:** Backend completo, nenhum consumidor integrado.
**Fase anterior:** 2D.1 (`sale_items` canonical contract).
**Próximas fases:** wiring com wizard de venda, recibos, portal, documentos (UX).

---

## Por que garantia é por item

Uma venda Nobretech pode conter aparelho principal, acessórios, upsells, brindes e serviços. Cada item pode receber uma garantia distinta:

- aparelho seminovo → política contratual de 6 meses
- acessório → garantia de fabricante diferente
- brinde → sem garantia (sem registro) ou apenas garantia legal

Vincular a garantia somente à venda (`sales.warranty_months`) força um único prazo para todos os itens, o que não reflete a realidade comercial. A Fase 2D.2 cria a estrutura que permite uma garantia distinta por `sale_items.id`.

## Dependência de `sale_items`

A Fase 2D foi bloqueada em sua tentativa original porque não havia tabela canônica de item vendido. A Fase 2D.1 criou `sale_items` consolidando aparelho principal (de `sales.inventory_id`) e itens adicionais (de `sales_additional_items`) em uma única estrutura.

Com `sale_items.id` estável, `sale_item_warranties.sale_item_id` referencia FK real, sem coluna polimórfica nem ambiguidade.

## Tabela criada — `sale_item_warranties`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador |
| `company_id` | UUID FK→companies | Empresa dona |
| `sale_id` | UUID FK→sales | Venda |
| `sale_item_id` | UUID FK→sale_items | Item vendido (contrato canônico) |
| `inventory_item_id` | UUID FK→inventory (SET NULL) | Aparelho de estoque quando aplicável |
| `warranty_policy_id` | UUID FK→warranty_policies (RESTRICT) | Política origem |
| `warranty_nature` | TEXT CHECK | `legal` / `contractual` / `manufacturer` / `operational_support` / `legacy` |
| `warranty_name` | TEXT NOT NULL | Nome resolvido para registro histórico |
| `warranty_label` | TEXT | Label público da garantia |
| `duration_months` | INTEGER | Prazo efetivo em meses (pode diferir do `defaultMonths` da policy) |
| `duration_days` | INTEGER | Prazo efetivo em dias |
| `calculation_mode` | TEXT CHECK | `calendar_months` / `fixed_days` / `manual_dates` |
| `starts_at` | TIMESTAMPTZ NOT NULL | Início efetivo |
| `ends_at` | TIMESTAMPTZ | Fim efetivo (NULL se em aberto) |
| `manufacturer_coverage_reference` | TEXT | Referência da cobertura do fabricante |
| `manufacturer_coverage_url` | TEXT | URL externa do fabricante |
| `manual_notes` | TEXT | Observações operacionais |
| `policy_snapshot` | JSONB NOT NULL | Snapshot da política no momento da vinculação |
| `terms_snapshot` | JSONB NOT NULL | Snapshot dos termos ativos |
| `active` | BOOLEAN NOT NULL DEFAULT TRUE | Vigente |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auditoria temporal padrão |

### Índices

- `idx_sale_item_warranties_company` em `(company_id)`
- `idx_sale_item_warranties_sale` em `(company_id, sale_id)`
- `idx_sale_item_warranties_sale_item` em `(sale_item_id)`
- `idx_sale_item_warranties_inventory` em `(inventory_item_id)` parcial WHERE NOT NULL
- `idx_sale_item_warranties_policy` em `(warranty_policy_id)`
- `idx_sale_item_warranties_unique_active_item` **UNIQUE** parcial em `(sale_item_id) WHERE active = TRUE` — garante no máximo uma garantia ativa por item

### CHECK constraints

- `warranty_nature` ∈ enum
- `calculation_mode` ∈ enum
- `duration_months/duration_days >= 0` quando preenchidos
- `ends_at >= starts_at` quando ambos preenchidos
- `jsonb_typeof(policy_snapshot) = 'object'`
- `jsonb_typeof(terms_snapshot) = 'array'`

## Snapshots

### `policy_snapshot` (object)
- `warranty_policy_id`, `name`, `warranty_nature`
- `product_type`, `product_condition`, `product_origin`
- `default_months`, `default_days`, `calculation_mode`
- `public_label_template`, `selection_label`, `selection_description`, `legal_basis`
- `effective_from`, `effective_until`

### `terms_snapshot` (array de objects)
- `id`, `term_type`, `title`, `body`, `sort_order`

**Regra crítica:** quando uma garantia antiga é consultada, ela nunca pode depender da política editável atual. O snapshot preserva a regra vigente no momento da venda — alterações posteriores em `warranty_policies` ou `warranty_policy_terms` não afetam garantias já registradas.

Helper backend: `buildWarrantySnapshot(companyId, warrantyPolicyId, client?)` carrega política + termos ativos e retorna `{ policy, policySnapshot, termsSnapshot }`.

## Cálculo de datas

Helper: `calculateWarrantyPeriod(input)` em `src/lib/warranty/sale-item-warranties.ts`.

Regras:
- `calendar_months`: soma meses civis a `startsAt` com clamp de dia (Jan 31 + 1m = Feb 28/29). Cálculo em UTC para estabilidade.
- `fixed_days`: soma dias corridos.
- `manual_dates`: exige `manualEndsAt` explícito.
- `endsAt >= startsAt` validado.
- `startsAt` deve ser explícito pelo consumidor. O helper **não** usa data atual silenciosamente.

Casos validados (test isolado):
- `2026-01-15Z + 6m → 2026-07-15Z` OK
- `2026-01-31Z + 1m → 2026-02-28Z` (clamp) OK
- `2024-01-31Z + 1m → 2024-02-29Z` (leap) OK
- `2026-10-31Z + 4m → 2027-02-28Z` (cross-year + clamp) OK
- `2026-02-01Z + 30 days → 2026-03-03Z` OK

## Mutations server-side

Arquivo: `src/lib/warranty/sale-item-warranties.ts`

- `createSaleItemWarranty(input, actor)` — valida company/item/policy, monta snapshot, calcula período, insere com `active=TRUE`. Respeita unique parcial.
- `updateSaleItemWarranty(input, actor)` — restrito a campos editáveis sem efeito em datas: `warranty_name`, `warranty_label`, `manufacturer_coverage_reference`, `manufacturer_coverage_url`, `manual_notes`. Snapshot, datas e duração permanecem imutáveis após criação. Para mudar prazo: deactivate + create.
- `deactivateSaleItemWarranty({ companyId, warrantyId }, actor)` — `active = FALSE`, libera o slot da unique parcial.

Validações em `createSaleItemWarranty`:
1. companyId / saleItemId / warrantyPolicyId formato UUID
2. `sale_items` existe, ativo e pertence à company
3. `sale_id` e `inventory_item_id` herdados de `sale_items` (consumidor não decide)
4. `warranty_policy` existe e pertence à company
5. `warranty_policy.active = TRUE`
6. Se `manualSelection: true`, `is_selectable = TRUE`
7. Cálculo de período respeita `calculation_mode` da política
8. Transação ACID — qualquer falha => ROLLBACK

## Queries server-side

- `getSaleItemWarranty(companyId, saleItemId)` — garantia ativa do item
- `getSaleWarranties(companyId, saleId)` — todas garantias ativas da venda
- `getWarrantyByInventoryItem(companyId, inventoryItemId)` — última garantia ativa do aparelho
- `getSaleItemWarrantyById(companyId, warrantyId)` — busca por id

## Auditoria

Domínio: `warranty` (compartilhado).
Tabela: `company_settings_audit_logs` (compartilhada).

Ações adicionadas:
- `create_sale_item_warranty` → "Garantia do item criada"
- `update_sale_item_warranty` → "Garantia do item atualizada" (com diff de campos)
- `deactivate_sale_item_warranty` → "Garantia do item inativada"

Constraint estendida via `migrations/sale_item_warranty_audit_extension.sql` (DROP IF EXISTS + ADD).

Metadata inclui `summary`, `changedFields`, `changedFieldLabels`. Snapshots JSONB grandes (`policy_snapshot`, `terms_snapshot`) não entram no diff porque não estão em `FIELD_LABELS.warranty`.

## O que NÃO foi integrado

Nenhum consumidor altera comportamento atual nesta fase:

- ❌ wizard de venda (`vendas/nova`)
- ❌ documentos / recibos / laudos / etiquetas
- ❌ portal de transparência
- ❌ catálogo público
- ❌ ORION (analítica/AI)
- ❌ marketing / ROI
- ❌ financeiro / DRE
- ❌ UX/UI

Tabela existe, helpers prontos, mas nenhum fluxo grava nem lê automaticamente.

## Estratégia futura para vendas antigas

**NÃO foi feito backfill** automático de garantias para vendas antigas. Motivo:

- vendas antigas têm `sales.warranty_months`, `sales.warranty_start`, `sales.warranty_end`, `sales.warranty_pdf_url` próprios
- regra histórica pode divergir da política atual (3m hardcoded vs 6m do catálogo — ver Fase 2A)
- recibos e laudos já foram gerados com a regra antiga

Migração de garantias antigas requer fase própria:
1. Definir política única (decisão de produto sobre 3 vs 6 meses)
2. Para cada `sales` com `warranty_months > 0`, materializar `sale_item_warranties` referenciando o `sale_items` correspondente (já materializado pela Fase 2D.1), com snapshot da política vigente naquele momento
3. Tratar `sales_additional_items` que precisem de garantia distinta (acessórios com `manufacturer`)
4. Validar consistência com documentos já emitidos antes de promover novo source of truth

## Validações executadas

Locais:
- `git diff --check` — limpo nos arquivos de código
- `npx tsc --noEmit --pretty false` — sem erros
- `npm run build` — verde
- `eslint` nos arquivos alterados — sem erros
- Aplicação local de `sale_items_canonical_contract.sql` (pré-requisito 2D.1) — OK
- Aplicação local de `warranty_selectable_policies.sql` (pré-requisito 2C) — OK
- Aplicação local de `sale_item_warranties.sql` — OK
- Aplicação local de `sale_item_warranty_audit_extension.sql` — OK
- Idempotência (re-execução) de ambas migrations — OK
- SQL smoke: insert válido, duplicate-active rejeitado, deactivate + re-insert OK, warranty_nature inválido rejeitado, calculation_mode inválido rejeitado, ends_at<starts_at rejeitado, policy_snapshot tipo objeto, terms_snapshot tipo array, 3 ações de audit aceitas, ação bogus rejeitada — todos passam.
- Date math: 5 cenários incluindo leap year e cross-year clamp — todos corretos.

## Próximos passos recomendados

1. **Fase 2E (UX):** seletor de garantia no wizard de venda lendo `getSelectableWarrantyPolicies` e gravando via `createSaleItemWarranty` por item. Não tocar fluxo atual de `sales.warranty_*` ainda.
2. **Fase 2F (documentos):** recibo e termo de garantia lendo `sale_item_warranties` quando existirem; fallback para `sales.warranty_*` quando não.
3. **Fase 2G (portal):** transparência exibe garantia por item.
4. **Fase 2H (migração):** backfill controlado das garantias antigas após decisão de política única.

Cada uma é fase independente, controlada, sem mudança no comportamento atual até validação.
