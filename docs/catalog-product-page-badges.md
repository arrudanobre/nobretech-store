# Catálogo público — Página de produto, badges do produto e copy específica configurável

## Hardcodes removidos

| Local | Antes | Depois |
|---|---|---|
| `/catalogo/[slug]/page.tsx:239` | `<TrustItem label="Procedência verificada" />` fixo | `<ProductTrustRow extraBadge={config.productBadges[0]} />` — vem de `catalog_trust_badges` filtrado por `show_on_product = TRUE` |
| `product-condition-list.tsx:74` | `"Garantia oficial"` literal | derivado do termo `functions`/`garantia` em `conditionReview` ou fallback do header |
| `product-condition-list.tsx:84` | `"Garantia oficial Apple conforme consulta no momento da ativação."` | removido — substituído por badge configurável |
| `product-condition-list.tsx:88` | `"Pronta entrega"` + `"Disponibilidade confirmada pela loja."` | removido — coberto por `availability_label` da policy + `catalog_trust_badges` |
| `product-condition-list.tsx:93` | `"Procedência verificada"` + `"Disponibilidade conferida antes da publicação."` | removido — agora é badge configurável |
| `catalog-product-card.tsx:96` | `"Procedência conferida"` | removido — listagem usa apenas badges de catálogo + warranty já configurados |
| `catalog-product-card.tsx:152` | `"Pronta entrega"` literal | `product.availabilityLabel` (já vinha da `policy.defaultAvailabilityLabel`) |

## Como `show_on_product` passou a ser usado

`src/app/catalogo/[slug]/page.tsx` agora resolve `resolveCatalogPublicConfig(identity.companyId)` em paralelo com o produto. O DTO retornado contém:

- `catalogBadges` (filtrados por `show_on_catalog = TRUE`)
- `productBadges` (filtrados por `show_on_product = TRUE`)

Pages passam:

- `productBadges` → `ProductConditionList` (sealed variant renderiza grid 2-col com Embalagem lacrada + cada badge configurado)
- `productBadges[0]` → `ProductTrustRow` como `extraBadge` (slot terciário do trust row inferior, ao lado de warranty + availability)

Migration `migrations/catalog_trust_badges_product_visibility.sql` (idempotente, aditiva, sem `CREATE TABLE`):

- `UPDATE` flipa `show_on_product = TRUE` para badges `shield_check` (Garantia) e `seal_check` (Pronta entrega) da Nobretech
- `INSERT` "Procedência verificada" como novo badge (icon=seal_check, sort_order=50, show_on_catalog=FALSE, show_on_product=TRUE) — preserva o texto antes hardcoded

## Fallbacks adotados

| Cenário | Fallback |
|---|---|
| Nenhum `productBadge` configurado | Trust row inferior usa `grid-cols-2` (só warranty + availability); ProductConditionList sealed mostra apenas header + badge "Embalagem lacrada" estático |
| `header_label` sealed ausente | `"Produto lacrado de fábrica"` |
| `header_description` sealed sem termo de garantia | `"Unidade sem uso anterior, com embalagem original."` |
| Termo de garantia presente em `conditionReview` | inclui descrição no subtitle |
| Badge icon desconhecido | fallback `Storefront` |

Componente nunca quebra layout — quando vazio, oculta seção ou reduz colunas.

## Por que migration foi necessária

Spec disse "preferir consumir as tabelas já criadas" + "preservar comportamento visual atual". O seed anterior (`catalog_public_settings_badges.sql`) gravou todos os 4 badges com `show_on_product = FALSE`. Sem flip + insert, a página de produto perderia 3 itens visuais:

- "Procedência verificada" (não existia como badge)
- Grid 4-itens da `ProductConditionList` sealed (todos hardcoded)
- Terceiro item do `TrustRow` inferior

Migration é mínima, aditiva e idempotente:

- `UPDATE ... WHERE show_on_product = FALSE` (não duplica em re-run)
- `INSERT ... WHERE NOT EXISTS`

Validação local OK + re-run idempotente confirmado.

## Não alterado

- preço / parcelamento / taxa
- `catalog_publication_policies` / `catalog_readiness_rules`
- listagem pública (`listPublicCatalog`)
- venda / portal / documentos
- ORION / marketing / financeiro / DRE
- catálogo admin

## Próximos passos

1. **Tela administrativa** para editar `catalog_trust_badges` (CRUD com `show_on_catalog`/`show_on_product` flags).
2. **Audit log** quando settings/badges forem editados via UI.
3. **Configurar `sealed_header_*`** em `catalog_settings` se quisermos personalizar copy do header sealed por empresa (estrutura pronta nos props; falta campo na tabela).

## Validações executadas

```
psql -f catalog_trust_badges_product_visibility.sql      apply + idempotência OK
git diff --check                                          limpo
npx tsc --noEmit --pretty false                           clean
npx eslint <3 arquivos>                                   clean
rm -rf .next && npm run build                             verde
npm run test:stock-sale:local                             PASSOU
grep brand hardcodes                                      apenas migration comments
DB sanity                                                 5 badges, 2 com show_on_product=TRUE + 1 novo
```

## Pronto para deploy controlado?

Sim. Build verde, tsc/eslint clean, fallback seguro, comportamento preservado quando seed da migration é aplicado. Recomenda deploy controlado com migration via dry-run + COMMIT antes do push.
