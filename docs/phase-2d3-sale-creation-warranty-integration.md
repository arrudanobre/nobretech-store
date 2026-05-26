# Fase 2D.3 — Integração da Criação de Venda com Garantia por Item

**Status:** Backend wireado + UI mínima. Nenhum consumidor antigo alterado.
**Fase anterior:** 2D.2.1 (`sale_item_warranties` em produção, vazio).
**Próximas fases:** 2E (documentos), 2F (portal do cliente), 2G (catálogo público), 2H (backfill controlado de vendas antigas).

---

## O que mudou

A rota `POST /api/sales` agora, dentro da mesma transação da venda:

1. Insere `sales` + `sales_additional_items` + `sale_payments` + `transactions` (fluxo legado intacto).
2. **NOVO:** Materializa `sale_items` via `materializeSaleItemsWithClient` (item principal + adicionais/brindes).
3. **NOVO:** Aplica garantia por item via `applySaleWarranties` (snapshot histórico de política + termos).
4. Comita ou faz ROLLBACK atômico — qualquer falha em qualquer etapa derruba a venda inteira.

`sales.warranty_months`, `sales.warranty_start`, `sales.warranty_end` e `sales.warranty_pdf_url` continuam sendo gravados pelo handler como antes. Os consumidores antigos (documentos, recibos, portal) seguem lendo desses campos.

## Onde sale_items é materializado

`src/lib/sales/sale-items.ts` exporta agora `materializeSaleItemsWithClient(client, companyId, saleId)`. Recebe o `PoolClient` da transação da venda. Reaproveita os helpers internos `materializeMainSaleItem` e `materializeAdditionalSaleItems` (criados na Fase 2D.1) sem abrir nova transação.

Materializa:
- 1 linha `sale_items` para o item principal (`source_table='sales'`, `item_role='main'`)
- N linhas para itens adicionais (`source_table='sales_additional_items'`, `item_role` derivado de `type`: `upsell`/`gift`)

## Como a política default é resolvida

`resolveDefaultPolicyIdForItem` em `src/lib/warranty/sale-item-warranties.ts`:

- Roda apenas para `item_role='main'` AND `item_type='device'` AND `inventory_item_id IS NOT NULL`.
- Query: `warranty_policies WHERE company_id=$1 AND active AND is_default AND (product_type IS NULL OR product_type='device') AND calculation_mode <> 'manual_dates'`.
- Ordena por specificity DESC (políticas com `product_type/condition/origin` preenchidos primeiro), depois por `priority ASC`.
- Pega `LIMIT 1`. Se nenhuma → retorna `null` → item é skipado sem erro.

`product_condition` e `product_origin` **não** entram no filtro hoje porque `inventory` não carrega esses campos. A escolha do default depende do `is_default=TRUE` + priority. O índice único parcial por `(company_id, product_type, product_condition, product_origin) WHERE active AND is_default` garante apenas uma política default por escopo.

## Como a escolha manual é recebida

Request body opcional:

```ts
warrantySelections?: {
  main?: {
    warrantyPolicyId: string | null  // null = sem garantia
    manualEndsAt?: string            // ISO, exigido para calculation_mode='manual_dates'
    warrantyName?: string
    warrantyLabel?: string
    manufacturerCoverageReference?: string
    manufacturerCoverageUrl?: string
    manualNotes?: string
    manualSelection?: boolean        // true => valida is_selectable=TRUE
  } | null
  additionalBySourceId?: Record<string /* sales_additional_items.id */, WarrantySelectionInput | null>
}
```

Validação em `parseWarrantySelections` (sales/route.ts):
- `warrantyPolicyId` deve ser UUID válido ou `null`
- Datas validadas com `safeDate`
- Strings limitadas a `safeString` com máximos
- `additionalBySourceId` é placeholder para Fase futura (UI atual não envia)

## UI mínima no wizard de venda

`src/app/(dashboard)/vendas/nova/page.tsx`:

- Fetch das políticas selecionáveis via `GET /api/warranty/selectable-policies` no mount.
- Estado: `selectedWarrantyPolicyId`, `warrantyManualEndsAt`, `selectableWarrantyPolicies`.
- Default ao montar: pega a política `isDefault: true` e sincroniza `warrantyMonths`.
- Botões 1/3/6/12 meses preservados → ao clicar, tenta casar mês com uma política `calendar_months`; se não casar, marca `selectedWarrantyPolicyId='none'`.
- Select "Política de garantia" abaixo dos botões com opções:
  - "Padrão da loja" (envia nenhum `warrantySelections` → backend resolve)
  - "Sem política vinculada" (`warrantyPolicyId: null` → backend skipa)
  - Políticas selecionáveis (com label `selectionLabel` se houver)
- Se policy é `manual_dates`, mostra input de data final.

Submit envia `warrantySelections.main` apenas se houver escolha explícita (`selectedWarrantyPolicyId !== ""`). Caso contrário, omite e backend resolve default.

## O que acontece com itens não elegíveis

- Itens adicionais (`upsell`/`gift`/`accessory`): nesta fase não recebem garantia automática. Spec: "Não criar garantia automática para brinde/acessório sem decisão clara".
- Item principal sem `inventory_item_id`: skipado.
- Item principal não `device`: skipado.
- Nenhuma política default aplicável: skipado, venda **não é bloqueada**.
- Política inválida na escolha manual: venda **bloqueada** com erro claro ("Politica de garantia invalida para item X.").

## Confirmação: legado preservado

- `sales.warranty_months` continua sendo gravado a partir de `input.warrantyMonths`
- `sales.warranty_start` / `sales.warranty_end` continuam gravados
- `sales.warranty_pdf_url` continua sendo gerenciado pelos consumidores legados
- Recibo PDF e Garantia PDF gerados pelo wizard usam o mesmo `warrantyMonths` legado
- Documentos, portal de transparência, catálogo público, ORION, marketing, financeiro, DRE: zero alterações

## Snapshot por garantia (preparação para portal futuro)

Cada `sale_item_warranty` salva snapshot suficiente para o portal:
- `sale_id`, `sale_item_id`, `inventory_item_id` (quando existir)
- `warranty_name`, `warranty_label`, `warranty_nature`
- `starts_at`, `ends_at`, `duration_months`, `duration_days`, `calculation_mode`
- `policy_snapshot` JSONB (warranty_policy_id, name, nature, product_*, defaults, public_label, selection_label, legal_basis, vigência)
- `terms_snapshot` JSONB (id, term_type, title, body, sort_order de todos os termos ativos no momento)

Snapshot é imutável depois de criado. Alterações posteriores em `warranty_policies` ou `warranty_policy_terms` **não** afetam garantias já vinculadas.

## Estratégia de transição

| Modelo | Quem grava hoje | Quem lê hoje | Próxima migração |
|---|---|---|---|
| `sales.warranty_*` (legado) | wizard via API | documentos PDF, portal cliente, recibos | mantém até Fase 2H |
| `sale_item_warranties` (novo) | API `/api/sales` POST | nenhum consumidor | Fase 2E (documentos), 2F (portal) |

Os dois coexistem **durante** a transição:
- Vendas novas a partir de agora: ambos preenchidos
- Vendas antigas: apenas legado (sem backfill imprudente)
- Consumidores antigos: continuam usando legado
- Consumidores futuros: lerão `sale_item_warranties` com fallback para legado quando vazio

## Portal do cliente — instruções para a fase futura

Quando a Fase 2F migrar o portal:
- Listar itens da compra via `sale_items` (já materializados)
- Para cada item, mostrar garantia via `getSaleItemWarranty(companyId, saleItemId)`
- Fallback: se `sale_item_warranties` vazio para a venda inteira, mostrar garantia geral via `sales.warranty_*` (compatibilidade com vendas antigas)
- **Não** aplicar uma única garantia de venda para todos os itens quando houver garantias por item
- **Não** alterar `/compra-verificada` nem APIs públicas nesta fase 2D.3

## Validações executadas

- `git diff --check` → limpo
- `npx tsc --noEmit --pretty false` → clean
- `npx eslint` nos arquivos novos/alterados de lib + api → clean (0 erros novos)
- `npm run build` → verde
- Smoke local em `src/lib/warranty/sale-item-warranties.ts` via tsx:
  - **Case A:** sem seleção → default Seminovo aplicado, 6 meses, snapshot com 6 termos ✅
  - **Case B:** seleção 3m explícita → warranty de 3 meses ✅
  - **Case C:** `warrantyPolicyId: null` → 0 garantias criadas ✅
  - **Case D:** UUID inválido → erro claro e venda bloqueada ✅
  - **Case E:** `sales.warranty_months` legado **inalterado** ✅

## Arquivos alterados / criados

- `src/lib/sales/sale-items.ts` — adiciona `materializeSaleItemsWithClient` + `getSaleItemsWithClient`
- `src/lib/warranty/sale-item-warranties.ts` — adiciona `WarrantySelectionInput`, `SaleWarrantySelections`, `applySaleWarranties`, helpers internos `fetchSaleItemsForWarranty`, `resolveDefaultPolicyIdForItem`, `insertWarrantyForSaleItem`
- `src/lib/warranty/index.ts` — re-exporta novos tipos e função
- `src/app/api/sales/route.ts` — wire `materializeSaleItemsWithClient` + `applySaleWarranties` na transação; parse de `warrantySelections`
- `src/app/api/warranty/selectable-policies/route.ts` — **novo** GET endpoint
- `src/app/(dashboard)/vendas/nova/page.tsx` — fetch das políticas + state + Select UI mínima + envio de `warrantySelections.main` no body

## Fora do escopo (não alterado)

- documentos (recibo, garantia PDF)
- portal do cliente / `/compra-verificada`
- catálogo público
- ORION / marketing / financeiro / DRE
- backfill de vendas antigas
- redesign do wizard
- remoção dos campos `sales.warranty_*`

## Riscos / remanescentes

- **inventory.product_condition/origin não existem** → resolver default usa apenas `product_type`. Funciona enquanto existir apenas 1 default por scope, garantido pelo índice único parcial. Quando houver múltiplos defaults por scope no futuro, a inferência precisará de campo adicional em `inventory` ou critério explícito do consumidor.
- **`applies_to_sale` flag não filtra a UI** (o endpoint `/api/warranty/selectable-policies` retorna todas as políticas selecionáveis ativas independentemente desse flag). Decisão consciente para esta fase para não bloquear a Nobretech onde todas as policies têm `applies_to_sale=false` por seed legado. Migração desse flag pode ser feita em fase futura sem impacto neste código.
- **Itens adicionais sem UI** — o backend já aceita `warrantySelections.additionalBySourceId` mas a UI não envia. Quando a Fase 2E precisar (recibo individualizado), basta adicionar selects no painel de itens adicionais.
- **Reservas (`saleStatus='reserved'`)** entram no mesmo fluxo e criam garantia desde o instante da reserva. Spec dizia "Garantia será emitida somente após recebimento" — o legado mostra isso na UI mas a garantia interna fica registrada igualmente. Comportamento aceitável: garantia existe no banco; documentos/portal decidirão quando exibir.
- **`warrantyStart` hoje = data de hoje** (vem do legado). Pode não bater com `sale_date` em casos de antedatar — herdamos o comportamento legado.

## Pronto para deploy?

✅ Sim. Build verde, tsc clean, lint clean (zero novos erros), smoke 5/5 OK, fluxo legado preservado, zero consumidores antigos alterados.

Deploy recomendado: push + Vercel deploy automático. **Sem migração de banco** nesta fase (estrutura `sale_item_warranties` já em prod desde 2D.2.1).
