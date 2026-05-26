# Central de Configurações — Fase 2C Garantia Selecionável

## Objetivo

A Fase 2C ajusta o backend do domínio de garantia para que a garantia deixe de ser tratada como uma regra única por empresa e passe a representar políticas permitidas para escolha futura por venda/item.

Nenhum consumidor foi integrado nesta fase. Venda, catálogo, portal, documentos, recibos, laudos, etiquetas, ORION, marketing e financeiro continuam com o comportamento atual.

## Mudança de modelagem

A tabela `warranty_policies` passa a diferenciar:

- `warranty_nature`: natureza da garantia (`legal`, `contractual`, `manufacturer`, `operational_support`, `legacy`).
- `is_selectable`: define se a política poderá aparecer em uma seleção futura de venda/item.
- `is_default`: define a sugestão padrão dentro do escopo, sem impedir escolha manual de outra política válida.
- `selection_label`: label curta para UI futura.
- `selection_description`: orientação curta para a escolha.
- `legal_basis`: base legal ou referência interna.
- `priority`: ordenação das opções.

A unicidade antiga de uma única política ativa por escopo foi substituída por unicidade de uma única política ativa e padrão por escopo. Isso permite coexistência de 6 meses e 3 meses para aparelho seminovo, mantendo apenas uma sugestão padrão.

## Políticas Nobretech seedadas

| Política | Natureza | Prazo | Ativa | Selecionável | Padrão |
|---|---|---:|---|---|---|
| Garantia Nobretech - Seminovo | `contractual` | 6 meses | Sim | Sim | Sim |
| Garantia Nobretech - Seminovo 3 meses | `contractual` | 3 meses | Sim | Sim | Não |
| Garantia legal - Produto durável 90 dias | `legal` | 90 dias | Sim | Não | Não |
| Garantia fabricante - Produto lacrado | `manufacturer` | datas manuais | Sim | Sim | Não |

## Regras importantes

- A garantia de 6 meses é a opção comum sugerida para seminovos, mas será sobrescrevível por venda/item em fase futura.
- A garantia de 3 meses existe como opção contratual específica, não como substituição global.
- Garantia legal, garantia contratual Nobretech e garantia de fabricante são naturezas diferentes.
- Produto lacrado não deve ser modelado como “1 mês CDC”. Se houver suporte operacional curto da Nobretech, isso deve virar `operational_support`, não garantia legal.
- A política de fabricante/lacrado usa `manual_dates`, porque depende de ativação, serial ou consulta externa.

## Backend atualizado

Novos resolvers:

- `getSelectableWarrantyPolicies(companyId, criteria)`
- `getDefaultWarrantyPolicy(companyId, criteria)`

Resolver existente atualizado:

- `resolveWarrantyPolicy(companyId, criteria)` agora considera `warrantyNature`, `is_default` e `priority`.

Mutations de política passam a aceitar e auditar:

- `warranty_nature`
- `is_selectable`
- `is_default`
- `selection_label`
- `selection_description`
- `legal_basis`
- `priority`

## Fora do escopo

Esta fase não implementa:

- tela de garantia
- seleção na venda
- alteração em venda nova
- alteração em catálogo público
- alteração em portal de transparência
- alteração em documentos gerados
- alteração em recibos, laudos ou etiquetas
- alteração em ORION ou marketing
- alteração financeira

## Próxima fase recomendada

Fazer deploy controlado da migration `migrations/warranty_selectable_policies.sql` com backup, dry-run em produção e checklist SQL, antes de qualquer UX ou integração com venda/item.
