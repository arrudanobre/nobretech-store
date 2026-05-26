# Central de Configurações - Checklist de Deploy

Escopo: Fase 1B.1. Este checklist prepara a aplicação da migration `migrations/company_settings_phase_1a.sql` em ambiente alvo sem alterar fluxos públicos, garantia, financeiro, catálogo, portal, documentos gerados, venda, ORION ou marketing.

## Permissões

- `settings.view`: permite acessar `/configuracoes` e `/configuracoes/empresa`.
- `settings.edit`: permite salvar marca, contatos e perfil documental via Server Actions.
- `owner`: possui `settings.view` e `settings.edit`.
- `manager` e `operator`: possuem `settings.view`, mas não `settings.edit`.
- `reseller`: não possui acesso ao ERP interno.

## Pré-deploy SQL

```sql
WITH matching_companies AS (
  SELECT id, name, slug, created_at
  FROM companies
  WHERE slug = 'nobretech-store'
     OR UPPER(name) = 'NOBRETECH STORE'
), existing_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'company_brand_profile',
      'company_contact_channels',
      'company_document_profile'
    )
)
SELECT jsonb_build_object(
  'matchingCompanyCount', (SELECT count(*)::int FROM matching_companies),
  'matchingCompanies', COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug) ORDER BY created_at) FROM matching_companies),
    '[]'::jsonb
  ),
  'existingCompanySettingsTables', COALESCE(
    (SELECT jsonb_agg(table_name ORDER BY table_name) FROM existing_tables),
    '[]'::jsonb
  )
) AS predeploy;
```

Bloqueios antes do COMMIT:

- `matchingCompanyCount` maior que 1.
- Ausência de empresa `nobretech-store` sem decisão explícita de seed.
- Tabelas já existentes com schema incompatível.
- Falta de confirmação de backup/snapshot no ambiente alvo.

## Dry-run da migration

```sql
BEGIN;
\i migrations/company_settings_phase_1a.sql
-- Rodar checklist pós-deploy.
ROLLBACK;
```

## Pós-deploy SQL

```sql
WITH target_company AS (
  SELECT id, name, slug
  FROM companies
  WHERE slug = 'nobretech-store'
  ORDER BY created_at ASC
  LIMIT 1
), matching_companies AS (
  SELECT id, name, slug
  FROM companies
  WHERE slug = 'nobretech-store'
     OR UPPER(name) = 'NOBRETECH STORE'
), active_primary_duplicates AS (
  SELECT channel_type, count(*)::int AS total
  FROM company_contact_channels
  WHERE company_id = (SELECT id FROM target_company)
    AND active = TRUE
    AND is_primary = TRUE
  GROUP BY channel_type
  HAVING count(*) > 1
)
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(table_name ORDER BY table_name)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'company_brand_profile',
        'company_contact_channels',
        'company_document_profile'
      )
  ),
  'targetCompany', (SELECT to_jsonb(target_company) FROM target_company),
  'matchingCompanyCount', (SELECT count(*)::int FROM matching_companies),
  'activeBrandProfiles', (
    SELECT count(*)::int
    FROM company_brand_profile
    WHERE company_id = (SELECT id FROM target_company)
      AND active = TRUE
  ),
  'activeContactChannels', (
    SELECT count(*)::int
    FROM company_contact_channels
    WHERE company_id = (SELECT id FROM target_company)
      AND active = TRUE
  ),
  'primaryWhatsapp', (
    SELECT count(*)::int
    FROM company_contact_channels
    WHERE company_id = (SELECT id FROM target_company)
      AND channel_type = 'whatsapp'
      AND active = TRUE
      AND is_primary = TRUE
  ),
  'activeInstagram', (
    SELECT count(*)::int
    FROM company_contact_channels
    WHERE company_id = (SELECT id FROM target_company)
      AND channel_type = 'instagram'
      AND active = TRUE
  ),
  'activeDocumentProfiles', (
    SELECT count(*)::int
    FROM company_document_profile
    WHERE company_id = (SELECT id FROM target_company)
      AND active = TRUE
  ),
  'primaryDuplicateTypes', COALESCE(
    (SELECT jsonb_agg(to_jsonb(active_primary_duplicates)) FROM active_primary_duplicates),
    '[]'::jsonb
  ),
  'partialIndexesFound', (
    SELECT count(*)::int
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_company_brand_profile_one_active',
        'idx_company_contact_channels_one_primary_type',
        'idx_company_document_profile_one_active'
      )
  ),
  'checksFound', (
    SELECT count(*)::int
    FROM pg_constraint
    WHERE conname IN (
      'company_brand_profile_theme_mode_check',
      'company_brand_profile_primary_color_check',
      'company_brand_profile_accent_color_check',
      'company_contact_channels_type_check',
      'company_document_profile_effective_range_check'
    )
  )
) AS postdeploy;
```

Valores esperados após COMMIT:

- `matchingCompanyCount = 1`.
- `activeBrandProfiles = 1`.
- `activeContactChannels = 4`.
- `primaryWhatsapp = 1`.
- `activeInstagram = 1`.
- `activeDocumentProfiles = 1`.
- `primaryDuplicateTypes = []`.
- `partialIndexesFound = 3`.
- `checksFound = 5`.

## Validação reversível da tela

1. Abrir `/configuracoes/empresa` com usuário autorizado.
2. Confirmar que dados seedados aparecem.
3. Alterar temporariamente `slogan` ou `public_description`.
4. Salvar, recarregar e confirmar persistência.
5. Reverter para o valor original.
6. Tentar criar contato WhatsApp principal duplicado e confirmar erro amigável.
7. Confirmar que rotas públicas, catálogo, portal, documentos, venda, financeiro e ORION não foram alterados.
