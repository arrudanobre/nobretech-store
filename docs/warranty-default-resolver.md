# Garantia automática por item — resolver central

## Problema

Antes desta fase, a venda atribuía a policy default Nobretech (contratual 6m) para qualquer item principal `device`, ignorando:

- **iPad/iPhone lacrado Apple** → deveria ser `Garantia Apple` 12 meses (manufacturer), não contratual da loja.
- **Acessórios duráveis** (caneta stylus, fones, carregadores, cabos, powerbanks etc.) → deveriam receber contratual 3 meses, ficavam sem garantia.
- **Acessórios não duráveis** (capa, película, suporte) → corretamente sem garantia.

## Solução

Resolver central puro em `src/lib/warranty/default-resolver.ts`:

```ts
resolveDefaultWarranty(ctx): WarrantyDecision
```

Decide entre `manufacturer` / `item` (contratual) / `none` com base em:

- `brand` (de `product_catalog.brand`)
- `category` (de `product_catalog.category` ou `inventory.category_name_snapshot`)
- `condition` (derivado de `inventory.grade`: Lacrado→sealed, A+/A/A-→seminovo, B+/B→used)
- `productType` (`sale_items.item_type`)
- `displayName`
- `isGift`

## Regras

| Ordem | Condição | Decisão |
|---|---|---|
| 0 | `isGift = true` | `none` (rule `gift`) |
| 1 | device + sealed + Apple | `manufacturer` 12m (`apple_sealed_12m`) |
| 2 | device + (used/open_box/seminovo) + Apple | `item` 6m (`apple_used_6m`) |
| 3 | device + (used/open_box/seminovo) + non-Apple | `item` 6m (`device_used_6m`) |
| 4 | displayName/category casa "capa, película, suporte, case, stand, holder, bolsa, estojo, pochete" | `none` (`non_durable_accessory`) |
| 5 | displayName/category casa "stylus, caneta, fone, carregador, cabo, powerbank, caixa de som, teclado, mouse, hub, dock, adaptador" | `item` 3m (`durable_accessory_3m`) |
| 6 | resto | `none` (`fallback`) |

Detecção Apple: brand regex `apple` (word boundary) **OU** category/displayName contém `iphone|ipad|macbook|apple watch|airpods`. Cobre item materializado de upsell sem brand setada.

Verificação de não duráveis antes de duráveis evita falso positivo (e.g. "capa do fone" → não durável).

## Integração

`applySaleWarranties` em `src/lib/warranty/sale-item-warranties.ts`:

1. Query enriquecida com `JOIN inventory` + `JOIN product_catalog` retorna brand, category, grade por sale_item.
2. Para cada item sem `warrantySelections` explícita:
   - Constrói `WarrantyItemContext`.
   - Chama `resolveDefaultWarranty(ctx)`.
   - Se `source='none'`: skipa com `reason` do resolver.
   - Caso contrário: busca policy via `findPolicyForDecision(warrantyNature, durationMonths)`.
3. Cria `sale_item_warranties` com snapshot histórico imutável da policy + termos.

`findPolicyForDecision` query: `warranty_policies WHERE company_id=$1 AND active AND applies_to_sale AND warranty_nature=$2 AND calculation_mode='calendar_months' AND default_months=$3 ORDER BY is_default DESC, priority ASC LIMIT 1`.

## Migration

`migrations/warranty_apple_accessory_policies.sql` (idempotente):

1. Insere `Garantia Apple - Lacrado` (manufacturer, calendar_months, 12m, device/sealed, `applies_to_sale=TRUE`).
2. Insere `Garantia Loja - Acessorios` (contractual, calendar_months, 3m, accessory/NULL, `applies_to_sale=TRUE`).
3. UPDATE `applies_to_sale=TRUE` nas policies contratuais Nobretech 3m e 6m existentes (Phase 2A seedou com FALSE).

Idempotente: `WHERE NOT EXISTS` por nome no INSERT, `WHERE applies_to_sale = FALSE` no UPDATE.

## Smoke validado

`scripts/_smoke-warranty-resolver.ts` (puro, removido após validação): 16/16 cenários:

- iPhone/iPad/Apple Watch lacrado → manufacturer 12m
- iPad lacrado sem brand → manufacturer 12m (cobertura por category)
- iPhone seminovo (A+/A/A-) → contratual 6m
- iPhone usado (B+/B) → contratual 6m
- Stylus, carregador, fone, cabo → contratual 3m
- Capa, película, suporte → none
- Brinde de qualquer tipo → none
- Apple Watch lacrado → manufacturer 12m
- Samsung usado → contratual 6m
- Item desconhecido → none

`scripts/_smoke-warranty-apply.ts` (integração, removido): venda real com 1 main device + 3 brindes → 1 garantia criada (contratual 6m para iPhone seminovo), 3 skip (brindes).

## Portal

`/compra-verificada/[token]` já consome `purchaseItems[*].warranty` (vindo de `sale_item_warranties`). Distingue:

- `source='manufacturer'` → label "Garantia Apple" + período calendar_months
- `source='contractual'` → label da loja
- `source='none'` → "Sem garantia contratual da loja vinculada a este item."

Nenhuma alteração no portal nesta fase. Sale_item_warranties novas vão refletir corretamente.

## Restrições preservadas

- Não hardcoda "Nobretech" no resolver (label "Garantia Apple" / "Garantia contratual da loja" — neutros).
- Não altera financeiro, PIN/token/LGPD do portal, ORION, catálogo público, readiness.
- Fallback para vendas antigas sem `sale_item_warranties` inalterado — portal usa `sales.warranty_*` legado quando vazio.
- Resolver é função pura, testável isolado. Integração ROLLBACK em falha.

## Próximos passos

1. **UI editável per-item** no wizard de venda (Fonte: Fabricante/Loja/Sem; Meses: input). Hoje só item principal tem selector visual; adicionais usam resolver automático.
2. **Tela admin** para editar `warranty_policies` (CRUD).
3. **Backfill controlado** de vendas antigas (fora de escopo desta fase).
4. **Audit log domain** para edições de warranty_policies.

## Validações executadas

```
psql -f migrations/warranty_apple_accessory_policies.sql     apply + idempotência OK
git diff --check                                              limpo
npx tsc --noEmit --pretty false                               clean
npx eslint <2 arquivos lib>                                   clean
rm -rf .next && npm run build                                 verde
npm run test:stock-sale:local                                 PASSOU
resolver smoke (16 casos)                                     16/16
apply integration smoke                                       1 criada / 3 skip esperados
grep hardcodes                                                apenas comment de migration
```

## Pronto para deploy controlado?

Sim. Migration aditiva idempotente, resolver puro, fallback seguro, comportamento legado preservado.
