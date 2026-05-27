# Catálogo público — Configurações globais, badges e textos de confiança

## Tabelas criadas

### catalog_settings (singleton por empresa)

| Campo | Descrição |
|---|---|
| `id` | UUID PK |
| `company_id` | UUID FK→companies CASCADE, **UNIQUE** |
| `hero_tagline` | Texto do hero (tagline pública) |
| `empty_state_title` | Título do empty state |
| `empty_state_description` | Descrição do empty state |
| `no_results_title` | Título quando filtro retorna 0 |
| `no_results_description` | Descrição quando filtro retorna 0 |
| `grid_heading` | Heading da seção principal de produtos |
| `grid_subheading` | Subheading da seção principal |

Constraint `UNIQUE (company_id)` garante 1 linha por empresa.
Trigger `trg_set_updated_at()` aplicado.

### catalog_trust_badges

| Campo | Descrição |
|---|---|
| `id` | UUID PK |
| `company_id` | UUID FK→companies CASCADE |
| `icon_key` | enum (`camera`, `shield_check`, `seal_check`, `chat_circle`, `truck`, `storefront`) |
| `label` | Texto exibido |
| `description` | Descrição opcional |
| `sort_order` | Ordem de exibição |
| `show_on_catalog` | Aparece em `/catalogo` |
| `show_on_product` | Aparece em `/catalogo/[slug]` |
| `active` | Soft delete |

Índices: `(company_id)`, `(company_id, active)`, `(company_id, sort_order)`.
CHECK em `icon_key` para whitelist.

## Seed Nobretech — preserva comportamento atual

### catalog_settings (1 linha)
- hero_tagline: `"Aparelhos selecionados, fotos reais nos seminovos e atendimento direto pelo WhatsApp."`
- empty_state_title: `"Seleção em atualização"`
- empty_state_description: `"Publicamos apenas produtos com disponibilidade confirmada. Chame a equipe no WhatsApp para receber a seleção atual."`
- no_results_title: `"Nenhum aparelho encontrado"`
- no_results_description: `"Ajuste a busca ou chame a equipe no WhatsApp. Toda semana entram novidades."`
- grid_heading: `"Seleção disponível"`
- grid_subheading: `"Publicamos apenas produtos com disponibilidade confirmada."`

### catalog_trust_badges (4 linhas, ordem 10/20/30/40)
| icon_key | label |
|---|---|
| camera | Fotos reais |
| shield_check | Garantia |
| seal_check | Pronta entrega |
| chat_circle | WhatsApp |

`show_on_catalog = TRUE`, `show_on_product = FALSE` em todos (comportamento atual da `CatalogTrustCards` que aparece somente em `/catalogo`).

## Resolver — src/lib/catalog/settings.ts

- `getCatalogSettings(companyId)` → `CatalogPublicSettings`
- `getCatalogTrustBadges(companyId)` → `CatalogTrustBadge[]`
- `resolveCatalogPublicConfig(companyId)` → `{ settings, catalogBadges, productBadges }`

Server-only. Nenhuma chamada client-side. Fallback neutro quando `companyId === null`.

## Componentes refatorados

| Componente | Antes (hardcode) | Depois |
|---|---|---|
| `CatalogTrustCards` | Array fixo de 4 itens | Recebe `badges: CatalogTrustBadge[]` |
| `CatalogHero` | `"Aparelhos selecionados, fotos reais nos seminovos e atendimento direto pelo WhatsApp."` | Recebe `settings.heroTagline` + fallback `"Aparelhos selecionados pela loja."` |
| `CatalogEmptyState` | Fallbacks `"Seleção em atualização"` / `"Publicamos apenas..."` | Recebe `title`/`description` opcionais via prop; fallback neutro `"Catálogo da loja"` / `"Em breve teremos novidades disponíveis."` |
| `CatalogGrid` | `"Seleção disponível"`, `"Publicamos apenas..."`, `"Nenhum aparelho encontrado"`, `"Ajuste a busca ou chame a equipe..."` | Recebe `copy: { gridHeading, gridSubheading, noResultsTitle, noResultsDescription }` opcional; fallback neutro |

## Pages

- `src/app/catalogo/page.tsx` resolve identity + config em paralelo, passa DTO para Hero, TrustCards, EmptyState e Grid.
- `src/app/catalogo/not-found.tsx` resolve settings e usa `emptyStateDescription` como fallback para a copy do produto não disponível.

## Fallbacks neutros adotados

Sem configuração:
- empty_state title: `"Catálogo da loja"`
- empty_state description: `"Em breve teremos novidades disponíveis."`
- grid heading: `"Produtos disponíveis"`
- grid subheading: `"Disponibilidade confirmada pela loja."`
- no_results title: `"Nenhum produto encontrado"`
- no_results description: `"Ajuste a busca para ver mais opções."`
- hero tagline: `"Aparelhos selecionados pela loja."`
- trust cards: **componente oculto** quando `badges.length === 0`

Nunca usa fallback `"Nobretech"`.

## Comportamento preservado

| Cenário | Antes | Depois |
|---|---|---|
| `/catalogo` renderiza tagline do hero | hardcoded | mesma string vinda de `catalog_settings.hero_tagline` |
| 4 badges canônicos | hardcoded em array | mesmos 4 vindos de `catalog_trust_badges` |
| Grid heading "Seleção disponível" | hardcoded | mesma string vinda de `grid_heading` |
| Empty state com texto Nobretech | "Seleção em atualização" / "Publicamos apenas..." | mesmas strings vindas de `empty_state_*` |
| `/catalogo/[slug]` | inalterado (só consome identity, não settings) | inalterado |

## Validações executadas

```
psql -f migrations/catalog_public_settings_badges.sql      apply OK
psql -f migrations/catalog_public_settings_badges.sql      idempotente (SEED SKIP)

git diff --check                                            limpo
npx tsc --noEmit --pretty false                             clean
npx eslint <7 arquivos alterados/novos>                     clean
rm -rf .next && npm run build                               verde
npm run test:stock-sale:local                               PASSOU

grep brand hardcodes em arquivos alterados:
  somente comentário "SEED Nobretech" em migration (allowed)

DB sanity:
  catalog_settings: 1 row preserva copy atual
  catalog_trust_badges: 4 rows na ordem 10/20/30/40
```

## Fora de escopo — não alterado

- catalog_publication_policies / catalog_readiness_rules (regras críticas — fase anterior)
- filtros de status / score / thresholds
- preço / parcelamento / taxa
- venda / portal / documentos / financeiro / DRE / ORION / marketing / landing
- CRUD administrativo (fase futura)

## Próximos passos

1. **Tela administrativa para settings + badges** dentro de `/configuracoes/empresa` ou `/configuracoes/catalogo`.
2. **Audit log** via `company_settings_audit_logs` (estender domain ou criar `catalog` domain).
3. Aplicar `show_on_product` se quisermos exibir badges também em `/catalogo/[slug]` (estrutura pronta, só ligar nos pages).

## Pronto para deploy controlado?

Sim. Build verde, tsc/eslint clean, comportamento visual preservado por seed, fallback neutro sem `Nobretech`, migration aditiva e idempotente. Recomenda deploy controlado: aplicar migration em prod via dry-run + COMMIT antes do push, mas ordem é tolerante (código aceita tabela vazia com fallback neutro).
