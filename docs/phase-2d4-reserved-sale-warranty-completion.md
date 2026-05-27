# Fase 2D.4 — Garantia por Item na Efetivação de Reserva

## Regra implementada

Reserva continua não iniciando garantia. A criação da reserva materializa `sale_items`, mas não cria `sale_item_warranties`, não resolve policy default e não inicia contagem.

Quando a reserva é concluída pelo endpoint `POST /api/sales/[id]/reservation` com `action="complete"`, o fluxo passa a:

1. mudar `sales.sale_status` de `reserved` para `completed`;
2. preservar os campos legados `sales.warranty_*`;
3. garantir `sale_items` via `materializeSaleItemsWithClient`;
4. criar `sale_item_warranties` via `applySaleWarranties`;
5. salvar `policy_snapshot` e `terms_snapshot`;
6. manter tudo na mesma transação da efetivação.

## Data de início

Não existe campo claro de entrega/efetivação no endpoint atual. Por isso, a garantia por item usa `sales.sale_date` como melhor data efetiva disponível no fluxo atual.

Se uma reserva antiga não tiver `sale_date`, a efetivação bloqueia a criação automática da garantia com erro claro em vez de usar `now()` silenciosamente.

## Idempotência

`applySaleWarranties` agora pula qualquer `sale_item` que já tenha `sale_item_warranties.active = TRUE`. Isso impede duplicidade se a rotina for chamada novamente.

Além disso, o endpoint de efetivação já retorna sucesso sem reprocessar quando a venda está `completed`.

## Escolha manual em reserva

O fluxo atual não persiste `warrantySelections` quando a venda é criada como reserva. Portanto, uma escolha manual feita no momento da reserva não é recuperável na efetivação.

Comportamento atual documentado:

- reserva com escolha manual não inicia garantia;
- na efetivação, como a escolha não está persistida, aplica-se a policy default vigente de venda;
- hoje isso significa `Garantia Nobretech - Seminovo` com 6 meses, desde que `applies_to_sale = TRUE`.

Não foi criado armazenamento novo para seleção de garantia em reserva nesta fase.

## Coexistência com legado

`sales.warranty_months`, `sales.warranty_start`, `sales.warranty_end` e consumidores atuais continuam intactos. O novo vínculo por item é gravado para uso futuro.

## Fora do escopo mantido

Não foram alterados:

- portal do cliente;
- compra verificada;
- documentos, recibos, laudos e etiquetas;
- catálogo público;
- financeiro, DRE, ORION e marketing;
- backfill de vendas antigas;
- remoção de `sales.warranty_*`.

## Smoke local esperado

`npm run test:stock-sale:local` cobre:

- reserva criada sem `sale_item_warranties`;
- efetivação de reserva criando garantia por item default 6 meses;
- efetivação repetida sem duplicar garantia;
- reserva com escolha 3 meses não preservada aplicando default 6 meses na efetivação;
- snapshots salvos;
- `sales.warranty_*` preservado.
