# Phase 2D.5 — Portal com garantia por item

## Regra aplicada

O portal de compra verificada passa a priorizar `sale_item_warranties` quando a venda possui ao menos uma garantia por item ativa.

Nesse modo, cada item exibe somente a garantia vinculada ao seu próprio `sale_item_id`. Itens sem garantia vinculada não herdam a garantia do aparelho.

## Itens sem garantia contratual vinculada

Capa, película, brindes e acessórios simples sem `sale_item_warranties` aparecem com a mensagem:

> Sem Garantia {shortName} contratual vinculada a este item.

Quando o nome curto da empresa não estiver disponível, o fallback público é:

> Sem garantia contratual da loja vinculada a este item.

O portal também informa, em texto curto, que danos por uso, queda, impacto, riscos, mau uso ou desgaste natural não são cobertos como garantia contratual.

O portal não afirma ausência de garantia legal e não usa textos como "garantia zero" ou "CDC não se aplica".

## Fallback legado

Quando a venda não possui `sale_item_warranties`, o portal mantém a exibição geral baseada em `sales.warranty_start`, `sales.warranty_end` e `sales.warranty_months`.

Esse fallback existe apenas para compatibilidade com vendas antigas e não tenta inferir garantia por item.

## Dados públicos

O DTO público expõe apenas dados seguros da garantia:

- nome/label da garantia;
- natureza;
- início;
- fim, quando houver;
- status público;
- observação curta.

`policy_snapshot` e `terms_snapshot` não são expostos publicamente.

## Fora desta fase

Documentos, recibos, PDFs, laudos e etiquetas continuam lendo o comportamento legado e serão migrados em um blocão posterior.
