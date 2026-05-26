# Central de Configurações — Fase 2A: Backend do Domínio de Garantia

**Status:** Completo (sem integração com consumidores)  
**Fase anterior:** 1C.2 (audit log legível)  
**Próxima fase:** 2B (integração com venda, catálogo, portal e documentos)

---

## Objetivo

Criar a base backend para políticas de garantia por empresa, sem integrar nenhum consumidor existente nesta fase. O comportamento atual de venda, catálogo, portal e documentos permanece 100% inalterado.

---

## Modelo de dados

### warranty_policies

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador |
| company_id | UUID FK | Empresa dona da política |
| name | TEXT | Nome descritivo interno |
| product_type | TEXT | Tipo de produto (ex: `device`) |
| product_condition | TEXT | Condição (ex: `used`, `new`) |
| product_origin | TEXT | Origem (ex: `national`, `imported`) |
| default_months | INTEGER | Prazo padrão em meses |
| default_days | INTEGER | Prazo padrão em dias |
| calculation_mode | TEXT | `calendar_months` / `fixed_days` / `manual_dates` |
| public_label_template | TEXT | Template do label público (ex: "6 meses de Garantia") |
| internal_description | TEXT | Descrição interna para auditoria |
| requires_customer_identification | BOOLEAN | Exige identificação do comprador |
| applies_to_sale | BOOLEAN | Integrado com módulo de venda |
| applies_to_catalog | BOOLEAN | Integrado com catálogo público |
| applies_to_portal | BOOLEAN | Integrado com portal do cliente |
| applies_to_documents | BOOLEAN | Integrado com emissão de documentos |
| active | BOOLEAN | Política vigente |
| effective_from | TIMESTAMPTZ | Início da vigência |
| effective_until | TIMESTAMPTZ | Fim da vigência (NULL = sem expiração) |

### warranty_policy_terms

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID PK | Identificador |
| warranty_policy_id | UUID FK | Política pai |
| term_type | TEXT | `coverage` / `exclusion` / `assistance` / `refund_exchange` / `customer_responsibility` / `legal_note` / `other` |
| title | TEXT | Título da cláusula |
| body | TEXT | Texto completo da cláusula |
| sort_order | INTEGER | Ordem de exibição |
| active | BOOLEAN | Cláusula ativa |

### Índice de escopo único (partial unique index)

Previne políticas ativas com escopo idêntico somente quando todos os três campos de escopo são NOT NULL:

```sql
CREATE UNIQUE INDEX idx_warranty_policies_unique_active_scope
  ON warranty_policies(company_id, product_type, product_condition, product_origin)
  WHERE active = TRUE
    AND product_type IS NOT NULL
    AND product_condition IS NOT NULL
    AND product_origin IS NOT NULL;
```

Políticas com `product_origin IS NULL` (escopo amplo) não são cobertas por este índice — conflitos nesses casos são resolvidos pelo resolver de prioridade.

---

## Resolução de políticas (resolveWarrantyPolicy)

O resolver aplica lógica de prioridade baseada em especificidade de escopo:

1. **Filtros de elegibilidade:**
   - `active = TRUE`
   - `effective_from <= NOW()`
   - `effective_until IS NULL OR effective_until > NOW()`
   - Scope match: campo NULL na política = curinga (qualquer valor)
   - `usageContext` (opcional): filtra por `applies_to_sale/catalog/portal/documents`

2. **Ordenação:**
   - `specificity_score DESC` (campos de escopo NOT NULL somam pontos)
   - `effective_from DESC`
   - `updated_at DESC`

3. **Resultado:** política mais específica + seus termos ativos

### Exemplo de priorização

Para `productType=device, productCondition=used, productOrigin=national`:

| Política | Escopo | Score |
|---|---|---|
| A | device / used / national | 3 (mais específica) |
| B | device / used / NULL | 2 |
| C | device / NULL / NULL | 1 |
| D | NULL / NULL / NULL | 0 (mais ampla) |

---

## Inconsistência documentada (3 vs 6 meses)

O sistema atual possui dois valores de garantia hardcoded em consumidores distintos:

| Consumidor | Valor | Localização |
|---|---|---|
| Venda nova | 3 meses | `warrantyMonths = "3"` (estado React, `vendas/nova/page.tsx`) |
| Catálogo público | 6 meses | `DEFAULT_USED_WARRANTY_MONTHS = 6` (`catalog/warranty.ts`) |
| Portal | warranty_months × 30 dias | `public-purchase-access.ts` (não usa meses civis) |

### Seed inicial (Nobretech)

Ambas as realidades foram registradas como políticas no banco:

- **Garantia Nobretech - Seminovo** — 6 meses, `active=TRUE`, `applies_to_*=FALSE`  
  Representa o que o catálogo público promete.

- **Garantia Nobretech - Legado Venda Nova** — 3 meses, `active=FALSE`, `applies_to_*=FALSE`  
  Documenta o default hardcoded no frontend. Mantida inativa para rastrear a inconsistência.

**Decisão pendente:** qual prazo será adotado como política única? A definição acontece na Fase 2B, quando os consumidores serão integrados e os hardcodes removidos.

---

## Módulo TypeScript: src/lib/warranty/

### types.ts
- `WarrantyCalculationMode`, `WarrantyTermType`
- `WarrantyPolicy`, `WarrantyPolicyTerm`, `WarrantyPolicyWithTerms`
- `WarrantyResolutionCriteria`, `WarrantyResolution`
- `WarrantyMutationResult<T>`, `WarrantyActor`
- `WarrantyPolicyInput`, `WarrantyPolicyTermInput`

### queries.ts (server-only)
- `getWarrantyPolicies(companyId)` — todas as políticas (ativas e inativas)
- `getActiveWarrantyPolicies(companyId)` — vigentes agora
- `getWarrantyPolicyById(companyId, policyId)`
- `getWarrantyPolicyTerms(policyId, { onlyActive? })`
- `resolveWarrantyPolicy(companyId, criteria)` — resolver com specificity score

### mutations.ts (server-only)
Todas as mutations são protegidas por validação server-side e registram audit log.

- `createWarrantyPolicy(companyId, actor, input)`
- `updateWarrantyPolicy(companyId, policyId, actor, input)`
- `deactivateWarrantyPolicy(companyId, policyId, actor)`
- `createWarrantyPolicyTerm(companyId, policyId, actor, input)`
- `updateWarrantyPolicyTerm(companyId, policyId, termId, actor, input)`
- `deactivateWarrantyPolicyTerm(companyId, policyId, termId, actor)`

---

## Audit log

Domínio: `warranty`  
Tabela: `company_settings_audit_logs` (compartilhada)

Ações registradas:

| Ação | Descrição |
|---|---|
| `create_warranty_policy` | Política criada |
| `update_warranty_policy` | Campos da política alterados |
| `deactivate_warranty_policy` | Política inativada |
| `create_warranty_term` | Cláusula criada |
| `update_warranty_term` | Cláusula atualizada |
| `deactivate_warranty_term` | Cláusula inativada |

Metadata inclui `summary`, `changedFields` e `changedFieldLabels` (via `buildAuditMetadata`).

---

## Migrações aplicadas localmente

1. `migrations/warranty_policies.sql` — tabelas + índices + triggers + seed Nobretech  
2. `migrations/warranty_audit_extension.sql` — extensão das constraints de audit log

Ambas são idempotentes (usam `CREATE IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `WHERE NOT EXISTS` para seed).

---

## Fora do escopo desta fase

- UI de gestão de políticas (CRUD frontend)
- Integração com módulo de venda
- Integração com catálogo público
- Integração com portal do cliente
- Integração com emissão de documentos
- Resolução da inconsistência 3 vs 6 meses
- Qualquer alteração em comportamentos existentes

---

## Atualização Fase 2C

A Fase 2C evoluiu este domínio para suportar políticas de garantia selecionáveis futuramente por venda/item, sem integrar consumidores.

Documento complementar: `docs/company-settings-phase-2c-warranty-selectable.md`.

Mudança principal: a garantia não deve ser fixa por empresa. A empresa terá políticas permitidas, com uma opção padrão sugerida por escopo e outras opções válidas para seleção manual futura.
