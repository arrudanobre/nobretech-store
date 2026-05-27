# Catálogo público — Regras de publicação e readiness configuráveis

## Tabelas criadas

- `catalog_publication_policies` — política por escopo (`product_type`, `condition`) por empresa.
  - `requires_public_price`, `requires_real_photo`, `requires_review`, `requires_included_items`
  - `allowed_inventory_statuses TEXT[]`
  - `max_products`, `default_availability_label`
  - `active`, `effective_from`, `effective_until`
  - índice único parcial em `(company_id, product_type, condition) NULLS NOT DISTINCT WHERE active = TRUE`

- `catalog_readiness_rules` — regras por política.
  - `rule_key`, `severity ('block'|'warning')`, `threshold_operator`, `threshold_value`, `message`, `active`
  - FK CASCADE para `catalog_publication_policies`

Trigger `trg_set_updated_at()` reaproveitado.

## Seed Nobretech — comportamento atual preservado

Três políticas inseridas idempotentemente (`WHERE NOT EXISTS`):

| Escopo | Status permitidos | Max | Exige foto | Exige review | Exige itens | Regras |
|---|---|---|---|---|---|---|
| `NULL` / `NULL` (default) | `active,in_stock` | 200 | — | — | — | — |
| `device` / `used` | `active,in_stock` | 200 | TRUE | TRUE | TRUE | `defect_score_max` (block, lte 5) |
| `device` / `sealed` | `active,in_stock` | 200 | FALSE | FALSE | FALSE | `real_photo_recommended` (warning) |

Resultado:
- seminovo continua sendo bloqueado se sem foto real, sem avaliação ou sem itens inclusos.
- defeito ≤ 5 continua bloqueando.
- lacrado continua emitindo warning quando usa imagem padrão.
- status públicos seguem `active`/`in_stock`.
- limite público segue 200.

## Resolver — `src/lib/catalog/policies.ts`

- `getCatalogPublicationPolicies(companyId)` — todas ativas/vigentes, ordenadas por especificidade DESC + `effective_from` DESC + `updated_at` DESC.
- `pickPolicyForCriteria(policies, { productType, condition })` — escolha em memória da mais específica (`product_type=NULL` casa qualquer; `condition=NULL` casa qualquer).
- `resolveCatalogPublicationPolicy(companyId, criteria)` — combina `getCatalogPublicationPolicies` + `pickPolicyForCriteria`.
- `getCatalogReadinessRules(policyId)` / `getCatalogReadinessRulesForPolicies(ids)` — regras ativas.
- `loadCatalogPolicyBundle(companyId, criteria)` — policy + rules em uma chamada.
- `compareThreshold(operator, threshold, value)` — `lt|lte|eq|gte|gt`.
- `conditionFromProductKind(kind)` — `'sealed'|'used'` para mapear `CatalogProductKind` no resolver.

Server-only. Nenhuma chamada client-side.

## Regras que saíram do código

- `src/lib/catalog/queries.ts:mapRowToProduct` — guardrails de seminovo (foto real, review, itens inclusos) e `requiresPublicPrice` agora vêm da policy resolvida. Quando policy ausente, mantém comportamento legado idêntico.
- `src/lib/catalog/queries.ts:listPublicCatalog` — `i.status IN ('active','in_stock')` e `LIMIT 200` substituídos por `i.status = ANY($2::text[])` e `LIMIT $3` parametrizados pelo policy default da empresa. Fallback `['active','in_stock']` + `200` se nenhuma policy existir.
- `src/lib/catalog/queries.ts:getPublicProductBySlug` — mesmo tratamento de status.
- `src/lib/catalog/readiness.ts` — receba `policy` + `rules` opcionalmente; sem policy aplica fallback legado (lacrado sem warning quando uploaded, defeito ≤ 5 bloqueia, seminovo exige review/items/foto real).
- `src/lib/catalog/admin-queries.ts:loadAdminCatalog` — carrega policies + rules e injeta no `getCatalogPublicationReadiness` por item.
- `availabilityLabel` no mapper público agora aceita `policy.defaultAvailabilityLabel` quando configurado (fallback "Pronta entrega").

## Regras que permaneceram hardcoded

| Regra | Local | Motivo |
|---|---|---|
| `is_published = TRUE` filtro | `queries.ts:listPublicCatalog`, `getPublicProductBySlug` | Flag de publicação por linha, não policy |
| `i.company_id = $1` filtro | mesma | Resolução de tenant, não policy |
| Cálculo `computeOverallScoreFromReview` | `readiness.ts` | Função pura de score; fora do escopo |
| `getScoreLabel(score)` | `score.ts` | Função pura |
| Filtro admin `status IN ('active','in_stock','reserved','pending')` | `admin-queries.ts:INVENTORY_QUERY` | Listagem admin agora **não** consome policy; só readiness consome. Manter listagem admin inclusiva é desejado. Próxima fase. |
| `LIMIT 500` em admin | mesma | Listagem admin |
| `OPERATIONAL_STATUSES` legado | `readiness.ts` | Fallback quando policy ausente — preservar comportamento atual |
| `LEGACY_DEFECT_THRESHOLD = 5` | `readiness.ts` | Mesmo motivo |

## Comportamento preservado

| Cenário | Antes | Depois |
|---|---|---|
| Seminovo sem foto real | bloqueado | bloqueado (via policy device/used `requiresRealPhoto`) |
| Seminovo sem avaliação | bloqueado | bloqueado (via policy) |
| Seminovo sem itens inclusos | bloqueado | bloqueado (via policy) |
| Seminovo com defeito ≤ 5 | bloqueado | bloqueado (via readiness rule) |
| Lacrado com imagem padrão | warning | warning (via readiness rule) |
| Status fora de `active`/`in_stock` | filtrado | filtrado (via `allowed_inventory_statuses`) |
| LIMIT 200 listagem | preservado | preservado (via `max_products`) |
| Listagem admin abrangente | preservado | preservado (admin SQL não foi alterado) |
| Preço/parcelamento | inalterado | inalterado |

## Validações executadas

```
git diff --check                                       # limpo
npx tsc --noEmit --pretty false                        # clean
npx eslint policies.ts readiness.ts queries.ts
       admin-queries.ts                                # clean
rm -rf .next && npm run build                          # verde
npm run test:stock-sale:local                          # PASSOU

psql -f migrations/catalog_publication_readiness_policies.sql  # apply OK
psql -f migrations/catalog_publication_readiness_policies.sql  # idempotente (SEED SKIP)

tsx scripts/_smoke-catalog-policy.ts (removed after run):
  [1] 3 seed policies loaded                                            ✅
  [2] resolver picks used/sealed/default scopes correctly               ✅
  [3] listPublicCatalog retorna 3 produtos preservados                  ✅
  [4] readiness sem policy -> legacy fallback bloqueia seminovo         ✅
  [5] readiness com policy used -> mesmas blockers que legacy           ✅
  [6] readiness sealed sem foto real -> 0 reasons, 1 warning            ✅
  [7] defect rule lte 5 bloqueia                                        ✅
  [8] all reqs satisfied -> status=ready                                ✅

grep "Nobretech|nobretechstore|5598988265655" arquivos alterados:
  somente migration comment + env var name (ambos allowed)
```

## Confirmação fora de escopo (não alterados)

- preço, parcelamento, taxa de maquininha (`pricing.ts`)
- garantia (warranty/* + sale_item_warranties)
- venda (api/sales)
- portal/compra verificada
- documentos/recibos/laudos
- ORION, marketing, financeiro, DRE
- landing page
- listagem admin (filtros amplos preservados, somente readiness consome policy)
- redesign visual

## Próximos passos

1. **Phase X — Admin UI**: tela para editar policies/rules sem SQL direto.
2. **Phase X — Catalog settings global**: extrair `default_availability_label`, `trust_badges`, `cta_settings` para tabela dedicada se a configuração crescer.
3. **Phase X — Apply policy max_products per scope**: hoje o LIMIT da listagem usa apenas o default scope; policies por scope não somam/limitam separadamente.
4. **Phase X — Admin listing scoped por policy**: se conveniente, refletir `allowed_inventory_statuses` na listagem admin também.

## Pronto para deploy?

Sim. Build verde, tsc/eslint clean, smoke 8/8 OK, listagem pública preservada, readiness preservado, zero hardcode novo de marca. Migration é puramente aditiva e idempotente. Recomenda deploy controlado: aplicar migration em produção via dry-run → COMMIT antes de subir o código (mas o código já tem fallback legado quando a tabela está vazia, então a ordem é tolerante).
