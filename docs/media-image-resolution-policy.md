# Política de resolução de imagens por contexto

## Conceitos

- Asset padrão: imagem premium e controlada do produto/modelo, resolvida por `src/lib/product-assets.ts`.
- Imagem operacional: imagem exibida em estoque, venda, portal do cliente, documentos, laudos, recibos e etiquetas. Pode ser uma imagem manual salva no próprio item de estoque (`inventory.operational_image_url` / `inventory.operational_thumbnail_url`) e, quando ausente, deve voltar ao asset padrão, placeholder da categoria ou fallback neutro.
- Mídia pública: foto real ou imagem de divulgação vinculada à publicação/vitrine pública. Pode estar em R2, mas não é a imagem operacional do estoque.

## Onde cada imagem aparece

- Estoque interno: usa `resolveStockDisplayImage(...)`. Pode usar a imagem operacional manual do item. Não usa fotos reais da vitrine automaticamente.
- Portal de compra verificada: usa `resolveCustomerPortalImage(...)`. A imagem principal usa a imagem operacional manual quando existir; caso contrário, fica padronizada e premium.
- Documentos, recibos, laudos e etiquetas: quando exibirem imagem, devem seguir a mesma regra operacional do portal/estoque.
- Catálogo público e vitrine: usam `resolvePublicListingImage(...)` ou a lista de imagens da publicação pública.
- Central de Divulgação / Vitrine pública admin: pode cadastrar/enviar mídia para a publicação pública, sem alterar a imagem operacional do estoque. Na gestão, a origem deve ficar explícita: mídia da vitrine quando houver upload público; asset fallback quando a publicação usa o asset padrão.

## Lacrado

Produto lacrado pode usar automaticamente o asset padrão do produto/modelo como mídia pública quando não houver mídia própria publicada.
Essa ausência de upload público não deve bloquear a publicação/readiness por si só.

## Seminovo/usado

Produto seminovo/usado deve usar fotos reais na vitrine pública quando a política da publicação exigir. Essas fotos permanecem como mídia pública e não substituem a imagem operacional do estoque, portal ou documentos.

## Compatibilidade e legado

Fotos existentes em `product_images` continuam preservadas. A tabela segue válida para mídia pública/publicação e compatibilidade com telas de vitrine. O comportamento corrigido é a leitura por contexto: estoque e portal ignoram `uploadedImageUrl` como imagem principal.

Uploads operacionais novos ficam em colunas dedicadas do `inventory`, com chaves R2 próprias. Esse caminho não altera `product_images` nem a vitrine pública.

## Fora do escopo

- Migração destrutiva ou backfill amplo.
- Mover arquivos de storage/R2.
- Apagar fotos existentes.
- Criar galeria secundária de fotos reais no portal do cliente.
- Alterar preço, garantia, financeiro, DRE, ORION ou regras de publicação.
