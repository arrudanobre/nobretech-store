# Garantia automática por item — resolver central (estruturado)

## Princípio

`resolveDefaultWarranty(ctx)` consome **exclusivamente** dados estruturados do catálogo:

- `productType` ← `inventory.product_type` (enum: device/accessory/service/warranty/bundle)
- `brand` ← `product_catalog.brand` (string canônica)
- `categorySlug` ← `product_categories.slug` (JOIN via `product_catalog.category`)
- `subcategorySlug` ← `product_subcategories.slug` (JOIN via `inventory.subcategory_name_snapshot` = `product_subcategories.normalized_name`)
- `accessoryClass` ← `product_subcategories.accessory_class` (enum: `durable`/`non_durable`)
- `condition` ← derivado de `inventory.grade` (Lacrado→sealed, A+/A/A-→seminovo, B+/B→used)

**Não consome**: `product.name`, `displayName`, `title`, regex de texto, parsing de string livre.

## Regras (ordem)

| # | Condição | Decisão | Rule ID |
|---|---|---|---|
| 0 | `isGift = true` | none | `gift` |
| 1 | Todos os campos estruturados NULL | none + warning estruturado | `missing_classification` |
| 2 | device + sealed + Apple | manufacturer 12m | `apple_sealed_12m` |
| 3 | device + (used/seminovo/open_box) + Apple | item contratual 6m | `apple_used_6m` |
| 4 | device + (used/seminovo/open_box) + non-Apple | item contratual 6m | `device_used_6m` |
| 5 | accessory + `accessory_class='non_durable'` | none | `non_durable_accessory` |
| 6 | accessory + `accessory_class='durable'` | item contratual 3m | `durable_accessory_3m` |
| 7 | accessory + `accessory_class IS NULL` | none + warning estruturado | `unclassified_accessory` |
| 8 | resto | none | `fallback` |

Detecção Apple: `brand` canonical lowercased === `'apple'` OR `categorySlug` ∈ `{iphone, ipad, macbook, applewatch, airpods}`. Comparação por string exata — nunca regex de free text.

## Warning estruturado

Quando o item não tem classificação suficiente (regras 1 e 7), o resolver retorna:

```ts
{
  source: "none",
  ruleId: "missing_classification" | "unclassified_accessory",
  warning: { event: "missing_product_classification", inventoryItemId },
}
```

`applySaleWarranties` chama `console.warn(JSON.stringify({ ...warning, saleItemId, ruleId }))` para o stream de logs ingerir. Sem mascarar com fallback inferido por texto.

## Migrações

### `warranty_apple_accessory_policies.sql`
- INSERT `Garantia Apple - Lacrado` (manufacturer, calendar_months, 12m, device/sealed, applies_to_sale=TRUE)
- INSERT `Garantia Loja - Acessorios` (contractual, calendar_months, 3m, accessory, applies_to_sale=TRUE)
- UPDATE `applies_to_sale=TRUE` em policies contratuais Nobretech existentes (3m + 6m)

### `warranty_accessory_classification.sql`
- ALTER TABLE `product_subcategories` ADD COLUMN `accessory_class` TEXT
- CHECK accessory_class ∈ {durable, non_durable}
- INDEX parcial `(company_id, accessory_class) WHERE NOT NULL AND deleted_at IS NULL`
- Backfill Nobretech: `Apple Pencil%` → durable; `Case %`/`Capa%`/`Película%`/`Suporte%` → non_durable

Idempotente: `ADD COLUMN IF NOT EXISTS`, CHECK via `pg_constraint`, UPDATE `WHERE accessory_class IS NULL`.

## Integração

`applySaleWarranties` em `sale-item-warranties.ts`:

```sql
LEFT JOIN inventory inv           ON inv.id = si.inventory_item_id
LEFT JOIN product_catalog pc      ON pc.id = inv.catalog_id
LEFT JOIN product_categories cat
  ON cat.company_id = si.company_id AND cat.is_active = TRUE
 AND cat.deleted_at IS NULL AND cat.slug = pc.category
LEFT JOIN product_subcategories sub
  ON sub.company_id = si.company_id AND sub.is_active = TRUE
 AND sub.deleted_at IS NULL AND sub.category_id = cat.id
 AND sub.normalized_name = LOWER(inv.subcategory_name_snapshot)
```

Resultado: cada sale_item recebe `category_slug`, `subcategory_slug`, `accessory_class`, `brand`, `condition` estruturados. Resolver decide; `findPolicyForDecision(nature, months)` busca policy ativa por `warranty_nature + calculation_mode='calendar_months' + default_months`.

## Smoke validado (estruturado)

12/12 cenários puros:

| Caso | Input estruturado | Esperado |
|---|---|---|
| iPhone (categorySlug=iphone) sealed Apple | brand=Apple, categorySlug=iphone, condition=sealed | manufacturer 12m ✅ |
| iPad (categorySlug=ipad) sealed Apple | brand=Apple, categorySlug=ipad, condition=sealed | manufacturer 12m ✅ |
| Stylus (accessory_class=durable) | productType=accessory, accessoryClass=durable | item 3m ✅ |
| Capa (accessory_class=non_durable) | productType=accessory, accessoryClass=non_durable | none ✅ |
| Apple Pencil (subcategory=apple-pencil, durable) | productType=accessory, brand=Apple, accessoryClass=durable | item 3m ✅ |
| Mac Mini (categorySlug=macbook) sealed | categorySlug=macbook, condition=sealed | manufacturer 12m ✅ |
| iPhone seminovo Apple | grade=A, brand=Apple | item 6m ✅ |
| Apple Watch lacrado por categorySlug | brand=null, categorySlug=applewatch, condition=sealed | manufacturer 12m ✅ |
| Accessory sem accessory_class | accessoryClass=null, productType=accessory | none + warning ✅ |
| Brinde | isGift=true | none ✅ |
| Tudo NULL | todos campos null | none + warning ✅ |
| Device used non-Apple | brand=Samsung, productType=device, condition=used | item 6m ✅ |

Integração apply local: venda real com iPhone 14 grade A → `Garantia Nobretech - Seminovo` contratual 6m (correto). Brinde skipado.

## Validações executadas

```
psql -f migrations/warranty_apple_accessory_policies.sql    OK + idempotente
psql -f migrations/warranty_accessory_classification.sql    OK + idempotente
git diff --check                                            limpo
npx tsc --noEmit --pretty false                             clean
npx eslint <2 lib>                                          clean
rm -rf .next && npm run build                               verde
npm run test:stock-sale:local                               PASSOU
resolver smoke (12 estruturados)                            12/12
apply integration                                           OK
grep displayName/regex/free-text parsing no resolver        zero
```

## Próximos passos

1. **UI admin** para definir `accessory_class` em `product_subcategories` (CRUD).
2. **UI editável per-item** no wizard de venda (Fonte / Meses).
3. **Backfill controlado** de subcategorias acessórias para outras empresas.
4. **Audit log** para mudanças em `accessory_class`.

## Restrições preservadas

- Resolver puro 100% estruturado, sem text parsing.
- Warning estruturado quando classificação ausente — sem fallback silencioso.
- Nunca hardcoda "Nobretech" (labels neutros: "Garantia Apple" / "Garantia contratual da loja").
- Migration aditiva idempotente.
- `sales.warranty_*` legado preservado para fallback do portal em vendas antigas.
- Não toca finance, PIN/token/LGPD, ORION, catálogo público, readiness.

## Pronto para deploy?

Sim. Spec atendida: resolver consome exclusivamente product_type/brand/categorySlug/subcategorySlug/accessoryClass/condition. Migrations aditivas. Smoke 12/12.
