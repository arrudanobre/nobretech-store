# Catálogo público — Marca, contato e CTA via Central de Configurações

## Hardcodes removidos

Pontos públicos do catálogo deixam de hardcodar marca, canal e copy:

- header e footer da `CatalogShell` (nome curto, label "Catálogo oficial", linha de localização)
- hero `CatalogHero` (eyebrow "Catálogo {shortName}", botão WhatsApp condicional)
- `CatalogEmptyState` (CTA WhatsApp condicional)
- `CatalogCardStatus` (badge "Oferta" sem marca)
- `CatalogProductCard` ("Score" sem marca)
- `ProductScoreBadge` (aria + label "Score" sem marca)
- `ProductConditionList` ("Disponibilidade confirmada pela loja")
- `ProductShareActions` (URL e texto compartilháveis vindos de identidade)
- `ProductWhatsAppCta` (oculta CTA quando WhatsApp não está configurado)
- metadata em `catalogo/page.tsx` e `catalogo/[slug]/page.tsx`
- `opengraph-image.tsx` (eyebrow, brand, domínio canônico)
- `not-found.tsx` (copy com shortName + fallback "loja")
- `src/lib/catalog/queries.ts` (description fallback usa "pela {shortName}" / "pela loja")
- `src/lib/catalog/warranty.ts` (label "X meses {shortName}" / "X meses")
- `src/lib/catalog/whatsapp.ts` (URL e mensagem padrão usam endpoint + shortName)

## De onde os dados vêm agora

Toda a identidade pública do catálogo é resolvida no server via novo helper:

`src/lib/catalog/company-identity.ts` → `getCatalogCompanyIdentity()`

Que consome:

- `resolveCompanyIdentity(companyId)` (já existente em `@/lib/company-settings/queries`)
- `company_brand_profile` → `displayName`, `shortName`, `publicDescription`, `city`, `state`, `canonicalDomain`, `ogImageUrl`
- `company_contact_channels` → WhatsApp e Instagram público/ativo, ordenado por `isPrimary DESC, sortOrder ASC`

A resolução do company id segue compatível com a regra anterior:
`process.env.NOBRETECH_PUBLIC_COMPANY_ID` se definido; senão `companies ORDER BY created_at ASC LIMIT 1`.

## DTO entregue ao client

`CatalogCompanyIdentity`:

- `displayName` (fallback "Loja")
- `shortName` (fallback "loja")
- `publicDescription`
- `city` / `state`
- `canonicalDomain`
- `catalogUrl` (derivado de canonicalDomain)
- `ogImageUrl`
- `whatsapp: { url, phone } | null`
- `instagram: { handle, url } | null`

CTA WhatsApp é **ocultado** quando `whatsapp === null`. Nenhum link quebrado.

## Fallback neutro adotado

| Quando ausente | Fallback |
|---|---|
| `displayName` | `"Loja"` |
| `shortName` | `"loja"` |
| WhatsApp | CTA omitido |
| Instagram | (sem componente neste blocão) |
| city/state | linha de localização omitida + texto neutro de atendimento |
| canonicalDomain | metadata sem canonical, OG sem url |
| `public_description` | "selecionada pela loja, com fotos reais..." / "lacrado de fábrica, com disponibilidade confirmada pela loja." |
| Mensagem WhatsApp | "Olá, vi este produto no catálogo (descritor) e queria mais informações." |
| Score label | "Score" |
| Oferta label | "Oferta" |

**Nunca** usa fallback `Nobretech`.

## Mudanças de assinatura

- `listPublicCatalog({ brandShortName })` e `getPublicProductBySlug(slug, { brandShortName })` agora aceitam `PublicCatalogQueryOptions` opcional.
- `getCatalogWarrantyLabel(condition, brandShortName?)` aceita marca opcional.
- `buildWhatsAppLink(product, endpoint, brandShortName?)` exige endpoint; retorna `null` se ausente.
- `buildGenericWhatsAppLink(endpoint, message)` exige endpoint; retorna `null` se ausente.
- `defaultMessageForProduct(product, brandShortName | null)` recebe marca.
- `ProductWhatsAppCta` exige `whatsappEndpoint`; oculta-se se `null`.
- `ProductShareActions` recebe `productUrl` e `brandShortName` (não constrói URL hardcoded).
- `CatalogShell`, `CatalogHero` exigem `identity`.
- `CatalogEmptyState` aceita `whatsappUrl` opcional.
- `CatalogGrid` aceita `whatsappUrl` opcional.

Constante `NOBRETECH_WHATSAPP_BASE` removida do export.

## Hardcodes críticos encontrados e deixados para próximo bloco

Permanecem hardcodados (regras críticas de publicação/readiness) e ficam para a fase **"Catálogo público — Regras de publicação e readiness configuráveis"**:

- `src/lib/catalog/queries.ts:511-514`: regras "não publicar seminovo sem foto real / review / itens inclusos"
- `src/lib/catalog/queries.ts:624-627`: filtro de status `('active', 'in_stock')` + `LIMIT 200`
- `src/lib/catalog/readiness.ts`: regras de readiness (não auditado neste blocão por estar fora do escopo)
- `src/lib/catalog/score.ts`: função `deriveNobretechScore` (nome interno — não exibido na UI; renomeação interna fica para fase futura se necessária)

Nenhum dos pontos acima foi alterado.

## Confirmação

- **Preço/parcelamento:** não alterados. `getCatalogDisplayPrice`, `isValidPromoPrice`, `buildCatalogInstallmentOptions`, `buildCatalogInstallmentQuote`, `loadCatalogPaymentSettings`, `taxa de maquininha` continuam idênticos.
- **Readiness/publicação:** `catalog_publication_policies`, `catalog_readiness_rules` e regras de status/foto/review/items intactas.
- **Garantia (regras):** `sales.warranty_*`, `sale_item_warranties`, integração de venda — não alterados.
- **Portal/compra verificada:** não alterado.
- **Documentos/recibos:** não alterados.
- **Catálogo admin (`admin-queries.ts`, `admin-types.ts`):** não alterado.
- **ORION, marketing, financeiro, DRE, landing page:** não alterados.

## Validações executadas

```
git diff --check                              # limpo
npx tsc --noEmit --pretty false               # clean
npx eslint <arquivos alterados>               # clean
rm -rf .next && npm run build                 # verde
npm run test:stock-sale:local                 # PASSOU
grep -nE "Nobretech|nobretechstore|5598988265655|São Luís" src/app/catalogo src/components/catalog src/lib/catalog/{whatsapp,warranty,queries,company-identity}.ts
  # somente env var NOBRETECH_PUBLIC_COMPANY_ID resta (internal config name, allowed)
```

## Pronto para deploy?

Sim. Build verde, tsc/eslint clean, sem hardcode de marca/canal/cidade/contato em texto público. CTAs com fallback seguro (omitem em vez de quebrar). Nenhum consumidor antigo (portal, documentos, finance, ORION) alterado.
