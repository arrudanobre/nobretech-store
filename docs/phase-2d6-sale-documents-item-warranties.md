# Phase 2D.6 — Documentos com garantia por item

## Regra aplicada

Os dados documentais de recibo e termo de garantia passam a aceitar `documentWarranty`.

Quando `documentWarranty.mode = "item"`, o documento renderiza a garantia vinculada a cada item e não aplica a garantia geral da compra a todos os itens.

Quando não há `sale_item_warranties`, o documento mantém o fallback legado usando `sales.warranty_*`.

## Itens sem garantia contratual

Capa, película, brindes e acessórios simples sem garantia vinculada aparecem com a mensagem segura:

> Sem Garantia {shortName} contratual vinculada a este item.

Sem marca configurada, o fallback é:

> Sem garantia contratual da loja vinculada a este item.

O documento não afirma ausência de garantia legal e não usa textos como "garantia zero" ou "CDC não se aplica".

## Fabricante

Garantia de fabricante com data final mostra o período informado.

Garantia de fabricante/manual sem data final mostra:

> Conforme cobertura do fabricante.

Nenhuma data final é inventada.

## Marca

O gerador de PDF usa `company.displayName` e `company.shortName` recebidos no DTO documental.

Quando esses dados não estão disponíveis em chamadas antigas, o fallback é neutro: "Loja", "Garantia da loja" e "da loja".

## Fora desta fase

Portal visual, catálogo, venda, financeiro, DRE, ORION, marketing, backfill e criação de novas policies continuam fora do escopo.
