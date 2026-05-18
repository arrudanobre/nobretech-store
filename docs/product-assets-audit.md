# Auditoria de Assets de Produto

Gerado por `npx tsx scripts/audit-product-assets.ts`.

## Onde os assets estão

- `public/product-assets/apple/iphone/**`: assets estáticos específicos por modelo/cor de iPhone.
- `public/product-assets/fallbacks/**`: placeholders por categoria.
- `public/product-assets/asset-manifest.json`: manifest público gerado junto dos assets.
- `src/lib/product-assets-manifest.json`: cópia importada pelo resolver TypeScript.
- `src/lib/product-assets.ts`: resolvedor estático usado pela UI.
- `product_images` via `/api/product-images`: fotos manuais enviadas para R2, quando existem.

## Manifest / mapa de assets

Formato de cada entrada:

```json
{
  "original": "Imagens iPhone/16/16 Ultramarine.webp",
  "model_slug": "iphone-16",
  "file_name": "iphone-16-ultramarine.webp",
  "public_path": "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp"
}
```

Total no manifest: 57 assets específicos.
Total de imagens em `public`: 81.

## Resolvedor de imagem

- Função principal: `getProductAssetImageInfo(input)` em `src/lib/product-assets.ts`.
- Chamada na Central: `productAssetFor(product, productImages)` em `src/app/(dashboard)/marketing/divulgacao/divulgacao-client.tsx`.
- Fotos manuais: `fetchProductImageMap(ids)` chama `/api/product-images`, que consulta `product_images` por `company_id`, `product_id` e `is_primary=true`.

Ordem de prioridade observada:

1. `uploadedThumbnailUrl` ou `uploadedImageUrl` vindo de `product_images`.
2. Asset estático do manifest apenas quando o resolvedor reconhece iPhone + modelo + cor.
3. Fallback por categoria: iPhone, iPad, MacBook, Apple Watch, AirPods, genérico ou unknown.

## Assets encontrados por categoria

### iPhone

| Modelo inferido | Cor inferida | Arquivo | Caminho | Tamanho |
| --- | --- | --- | --- | ---: |
| iPhone 13 | Blue | iphone-13-blue.webp | /product-assets/apple/iphone/iphone-13/iphone-13-blue.webp | 24920 |
| iPhone 13 | Starlight | iphone-13-starlight.webp | /product-assets/apple/iphone/iphone-13/iphone-13-starlight.webp | 23500 |
| iPhone 13 | Midnight | iphone-13-midnight.webp | /product-assets/apple/iphone/iphone-13/iphone-13-midnight.webp | 11574 |
| iPhone 13 | Pink | iphone-13-pink.webp | /product-assets/apple/iphone/iphone-13/iphone-13-pink.webp | 24780 |
| iPhone 13 | Product Red | iphone-13-product-red.webp | /product-assets/apple/iphone/iphone-13/iphone-13-product-red.webp | 14686 |
| iPhone 13 | Green | iphone-13-green.webp | /product-assets/apple/iphone/iphone-13/iphone-13-green.webp | 11208 |
| iPhone 13 Pro | Silver | iphone-13-pro-silver.webp | /product-assets/apple/iphone/iphone-13-pro/iphone-13-pro-silver.webp | 26748 |
| iPhone 13 Pro | Alpine Green | iphone-13-pro-alpine-green.webp | /product-assets/apple/iphone/iphone-13-pro/iphone-13-pro-alpine-green.webp | 16674 |
| iPhone 13 Pro | Gold | iphone-13-pro-gold.webp | /product-assets/apple/iphone/iphone-13-pro/iphone-13-pro-gold.webp | 29350 |
| iPhone 13 Pro | Graphite | iphone-13-pro-graphite.webp | /product-assets/apple/iphone/iphone-13-pro/iphone-13-pro-graphite.webp | 11806 |
| iPhone 13 Pro | Sierra Blue | iphone-13-pro-sierra-blue.webp | /product-assets/apple/iphone/iphone-13-pro/iphone-13-pro-sierra-blue.webp | 12750 |
| iPhone 13 Pro Max | Sierra Blue | iphone-13-pro-max-sierra-blue.webp | /product-assets/apple/iphone/iphone-13-pro-max/iphone-13-pro-max-sierra-blue.webp | 26258 |
| iPhone 13 Pro Max | Gold | iphone-13-pro-max-gold.webp | /product-assets/apple/iphone/iphone-13-pro-max/iphone-13-pro-max-gold.webp | 18738 |
| iPhone 13 Pro Max | Graphite | iphone-13-pro-max-graphite.webp | /product-assets/apple/iphone/iphone-13-pro-max/iphone-13-pro-max-graphite.webp | 23272 |
| iPhone 13 Pro Max | Silver | iphone-13-pro-max-silver.webp | /product-assets/apple/iphone/iphone-13-pro-max/iphone-13-pro-max-silver.webp | 18158 |
| iPhone 13 Pro Max | Alpine Green | iphone-13-pro-max-alpine-green.webp | /product-assets/apple/iphone/iphone-13-pro-max/iphone-13-pro-max-alpine-green.webp | 23412 |
| iPhone 14 | Blue | iphone-14-blue.webp | /product-assets/apple/iphone/iphone-14/iphone-14-blue.webp | 17520 |
| iPhone 14 | Starlight | iphone-14-starlight.webp | /product-assets/apple/iphone/iphone-14/iphone-14-starlight.webp | 25430 |
| iPhone 14 | Midnight | iphone-14-midnight.webp | /product-assets/apple/iphone/iphone-14/iphone-14-midnight.webp | 20492 |
| iPhone 14 | Product Red | iphone-14-product-red.webp | /product-assets/apple/iphone/iphone-14/iphone-14-product-red.webp | 16580 |
| iPhone 14 | Purple | iphone-14-purple.webp | /product-assets/apple/iphone/iphone-14/iphone-14-purple.webp | 26374 |
| iPhone 14 Pro | Deep Purple | iphone-14-pro-deep-purple.webp | /product-assets/apple/iphone/iphone-14-pro/iphone-14-pro-deep-purple.webp | 28236 |
| iPhone 14 Pro | Gold | iphone-14-pro-gold.webp | /product-assets/apple/iphone/iphone-14-pro/iphone-14-pro-gold.webp | 30364 |
| iPhone 14 Pro | Silver | iphone-14-pro-silver.webp | /product-assets/apple/iphone/iphone-14-pro/iphone-14-pro-silver.webp | 29672 |
| iPhone 14 Pro | Space Black | iphone-14-pro-space-black.webp | /product-assets/apple/iphone/iphone-14-pro/iphone-14-pro-space-black.webp | 24810 |
| iPhone 15 | Yellow | iphone-15-yellow.webp | /product-assets/apple/iphone/iphone-15/iphone-15-yellow.webp | 20200 |
| iPhone 15 | Blue | iphone-15-blue.webp | /product-assets/apple/iphone/iphone-15/iphone-15-blue.webp | 19692 |
| iPhone 15 | Black | iphone-15-black.webp | /product-assets/apple/iphone/iphone-15/iphone-15-black.webp | 14816 |
| iPhone 15 | Pink | iphone-15-pink.webp | /product-assets/apple/iphone/iphone-15/iphone-15-pink.webp | 20378 |
| iPhone 15 Pro | Blue Titanium | iphone-15-pro-blue-titanium.webp | /product-assets/apple/iphone/iphone-15-pro/iphone-15-pro-blue-titanium.webp | 31550 |
| iPhone 15 Pro | White Titanium | iphone-15-pro-white-titanium.webp | /product-assets/apple/iphone/iphone-15-pro/iphone-15-pro-white-titanium.webp | 31302 |
| iPhone 15 Pro | Natural Titanium | iphone-15-pro-natural-titanium.webp | /product-assets/apple/iphone/iphone-15-pro/iphone-15-pro-natural-titanium.webp | 30748 |
| iPhone 15 Pro | Black Titanium | iphone-15-pro-black-titanium.webp | /product-assets/apple/iphone/iphone-15-pro/iphone-15-pro-black-titanium.webp | 24614 |
| iPhone 15 Pro Max | Blue Titanium | iphone-15-pro-max-blue-titanium.webp | /product-assets/apple/iphone/iphone-15-pro-max/iphone-15-pro-max-blue-titanium.webp | 36520 |
| iPhone 15 Pro Max | White Titanium | iphone-15-pro-max-white-titanium.webp | /product-assets/apple/iphone/iphone-15-pro-max/iphone-15-pro-max-white-titanium.webp | 27214 |
| iPhone 15 Pro Max | Natural Titanium | iphone-15-pro-max-natural-titanium.webp | /product-assets/apple/iphone/iphone-15-pro-max/iphone-15-pro-max-natural-titanium.webp | 33526 |
| iPhone 15 Pro Max | Black Titanium | iphone-15-pro-max-black-titanium.webp | /product-assets/apple/iphone/iphone-15-pro-max/iphone-15-pro-max-black-titanium.webp | 26264 |
| iPhone 16 | White | iphone-16-white.webp | /product-assets/apple/iphone/iphone-16/iphone-16-white.webp | 24258 |
| iPhone 16 | Black | iphone-16-black.webp | /product-assets/apple/iphone/iphone-16/iphone-16-black.webp | 9598 |
| iPhone 16 | Pink | iphone-16-pink.webp | /product-assets/apple/iphone/iphone-16/iphone-16-pink.webp | 28422 |
| iPhone 16 | Ultramarine | iphone-16-ultramarine.webp | /product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp | 30026 |
| iPhone 16 | Teal | iphone-16-teal.webp | /product-assets/apple/iphone/iphone-16/iphone-16-teal.webp | 30272 |
| iPhone 16 Pro | White Titanium | iphone-16-pro-white-titanium.webp | /product-assets/apple/iphone/iphone-16-pro/iphone-16-pro-white-titanium.webp | 31984 |
| iPhone 16 Pro | Desert Titanium | iphone-16-pro-desert-titanium.webp | /product-assets/apple/iphone/iphone-16-pro/iphone-16-pro-desert-titanium.webp | 16072 |
| iPhone 16 Pro | Natural Titanium | iphone-16-pro-natural-titanium.webp | /product-assets/apple/iphone/iphone-16-pro/iphone-16-pro-natural-titanium.webp | 16804 |
| iPhone 16 Pro | Black Titanium | iphone-16-pro-black-titanium.webp | /product-assets/apple/iphone/iphone-16-pro/iphone-16-pro-black-titanium.webp | 25376 |
| iPhone 17 | Mist Blue | iphone-17-mist-blue.webp | /product-assets/apple/iphone/iphone-17/iphone-17-mist-blue.webp | 33446 |
| iPhone 17 | White | iphone-17-white.webp | /product-assets/apple/iphone/iphone-17/iphone-17-white.webp | 28844 |
| iPhone 17 | Lavender | iphone-17-lavender.webp | /product-assets/apple/iphone/iphone-17/iphone-17-lavender.webp | 27978 |
| iPhone 17 | Black | iphone-17-black.webp | /product-assets/apple/iphone/iphone-17/iphone-17-black.webp | 28882 |
| iPhone 17 | Sage | iphone-17-sage.webp | /product-assets/apple/iphone/iphone-17/iphone-17-sage.webp | 13108 |
| iPhone 17 Pro | Cosmic Orange | iphone-17-pro-cosmic-orange.webp | /product-assets/apple/iphone/iphone-17-pro/iphone-17-pro-cosmic-orange.webp | 37832 |
| iPhone 17 Pro | Deep Blue | iphone-17-pro-deep-blue.webp | /product-assets/apple/iphone/iphone-17-pro/iphone-17-pro-deep-blue.webp | 34554 |
| iPhone 17 Pro | Silver | iphone-17-pro-silver.webp | /product-assets/apple/iphone/iphone-17-pro/iphone-17-pro-silver.webp | 31364 |
| iPhone 17 Pro Max | Cosmic Orange | iphone-17-pro-max-cosmic-orange.webp | /product-assets/apple/iphone/iphone-17-pro-max/iphone-17-pro-max-cosmic-orange.webp | 35724 |
| iPhone 17 Pro Max | Deep Blue | iphone-17-pro-max-deep-blue.webp | /product-assets/apple/iphone/iphone-17-pro-max/iphone-17-pro-max-deep-blue.webp | 31444 |
| iPhone 17 Pro Max | Silver | iphone-17-pro-max-silver.webp | /product-assets/apple/iphone/iphone-17-pro-max/iphone-17-pro-max-silver.webp | 29992 |

### iPad

_Nenhum asset específico de iPad foi encontrado no manifest ou em `public/product-assets/apple/ipad`._

### Apple Watch

_Nenhum asset específico de Apple Watch foi encontrado; existe apenas fallback._

### MacBook

_Nenhum asset específico de MacBook foi encontrado; existe apenas fallback._

### Outros / Fallbacks

| Arquivo | Caminho | Tamanho |
| --- | --- | ---: |
| airpods.webp | /product-assets/fallbacks/airpods.webp | 2846 |
| apple-device.webp | /product-assets/fallbacks/apple-device.webp | 2248 |
| apple-watch.webp | /product-assets/fallbacks/apple-watch.webp | 2454 |
| generic-device.webp | /product-assets/fallbacks/generic-device.webp | 2248 |
| ipad.webp | /product-assets/fallbacks/ipad.webp | 2052 |
| iphone.webp | /product-assets/fallbacks/iphone.webp | 2150 |
| macbook.webp | /product-assets/fallbacks/macbook.webp | 2116 |
| unknown-device.webp | /product-assets/fallbacks/unknown-device.webp | 2604 |

## Casos auditados

```json
[
  {
    "name": "iPhone 16 Azul inventory",
    "input": {
      "brand": "Apple",
      "category": "iphone",
      "model": "iPhone 16",
      "color": "Azul"
    },
    "normalized": {
      "brand": "apple",
      "category": "iphone",
      "model": "iphone-16",
      "color": "azul",
      "kind": "iphone",
      "modelSlug": "iphone-16"
    },
    "candidates": [
      {
        "key": "iphone-16:blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:sierra-blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:mist-blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:deep-blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:blue-titanium",
        "publicPath": null
      },
      {
        "key": "iphone-16:ultramarine",
        "publicPath": "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp"
      }
    ],
    "matchedAsset": "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp",
    "source": "static_asset",
    "fallbackUsed": false,
    "badge": "Asset padrão"
  },
  {
    "name": "iPhone 16 Azul supplier_offer",
    "input": {
      "brand": "Apple",
      "category": "iphone",
      "model": "iPhone 16",
      "color": "Azul"
    },
    "normalized": {
      "brand": "apple",
      "category": "iphone",
      "model": "iphone-16",
      "color": "azul",
      "kind": "iphone",
      "modelSlug": "iphone-16"
    },
    "candidates": [
      {
        "key": "iphone-16:blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:sierra-blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:mist-blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:deep-blue",
        "publicPath": null
      },
      {
        "key": "iphone-16:blue-titanium",
        "publicPath": null
      },
      {
        "key": "iphone-16:ultramarine",
        "publicPath": "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp"
      }
    ],
    "matchedAsset": "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp",
    "source": "static_asset",
    "fallbackUsed": false,
    "badge": "Asset padrão"
  },
  {
    "name": "iPad 11 Silver",
    "input": {
      "brand": "Apple",
      "category": "ipad",
      "model": "iPad 11",
      "color": "Silver"
    },
    "normalized": {
      "brand": "apple",
      "category": "ipad",
      "model": "ipad-11",
      "color": "silver",
      "kind": "ipad",
      "modelSlug": null
    },
    "candidates": [],
    "matchedAsset": "/product-assets/fallbacks/ipad.webp",
    "source": "category_fallback",
    "fallbackUsed": true,
    "badge": "Placeholder"
  },
  {
    "name": "iPad 11 Prateado",
    "input": {
      "brand": "Apple",
      "category": "ipad",
      "model": "iPad 11",
      "color": "Prateado"
    },
    "normalized": {
      "brand": "apple",
      "category": "ipad",
      "model": "ipad-11",
      "color": "prateado",
      "kind": "ipad",
      "modelSlug": null
    },
    "candidates": [],
    "matchedAsset": "/product-assets/fallbacks/ipad.webp",
    "source": "category_fallback",
    "fallbackUsed": true,
    "badge": "Placeholder"
  },
  {
    "name": "iPad 11 Prata",
    "input": {
      "brand": "Apple",
      "category": "ipad",
      "model": "iPad 11",
      "color": "Prata"
    },
    "normalized": {
      "brand": "apple",
      "category": "ipad",
      "model": "ipad-11",
      "color": "prata",
      "kind": "ipad",
      "modelSlug": null
    },
    "candidates": [],
    "matchedAsset": "/product-assets/fallbacks/ipad.webp",
    "source": "category_fallback",
    "fallbackUsed": true,
    "badge": "Placeholder"
  },
  {
    "name": "Produto sem asset",
    "input": {
      "brand": "Acme",
      "category": "gadget",
      "model": "Produto Teste",
      "color": "Inexistente"
    },
    "normalized": {
      "brand": "acme",
      "category": "gadget",
      "model": "produto-teste",
      "color": "inexistente",
      "kind": "unknown-device",
      "modelSlug": null
    },
    "candidates": [],
    "matchedAsset": "/product-assets/fallbacks/unknown-device.webp",
    "source": "placeholder",
    "fallbackUsed": true,
    "badge": "Placeholder"
  }
]
```

## Caso iPhone 16 Azul

O input `iPhone 16 + Azul` normaliza para `modelSlug=iphone-16` e `color=azul`.
O alias `azul` testa, nesta ordem: `blue`, `sierra-blue`, `mist-blue`, `deep-blue`, `blue-titanium`, `ultramarine`.
Não existe `iphone-16-blue.webp`, mas existe `iphone-16-ultramarine.webp`; por isso a imagem aparece mesmo sem upload manual.

Asset encontrado:
`/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp`

## Caso iPad 11 Silver/Prateado

O input reconhece `kind=ipad`, mas o resolvedor atual só procura assets específicos quando o produto é iPhone.
Como não há asset específico de iPad no manifest, `iPad 11 Silver`, `iPad 11 Prateado` e `iPad 11 Prata` caem em:
`/product-assets/fallbacks/ipad.webp`

Causa provável da falha: ausência de assets específicos de iPad e ausência de uma estratégia de resolução estática para iPad/modelo/cor.

## Supplier offer vs inventory

A Central converte inventory e supplier_offer para o mesmo shape `MarketingProduct` e chama o mesmo `productAssetFor`.
A diferença é que `fetchProductImageMap` só encontra uploads manuais vinculados a `inventory.product_id`.
Supplier offers normalmente não têm linha em `product_images`, então dependem de asset estático/fallback.
Quando modelo/cor/categoria são equivalentes, supplier_offer e inventory geram a mesma resolução estática.

## Riscos

- O nome comercial `Azul` em iPhone 16 está sendo tratado como alias de `Ultramarine`.
- Não há cobertura estática para iPad, Apple Watch ou MacBook além de fallback.
- O manifest usado em runtime fica em `src/lib/product-assets-manifest.json`; o manifest público é uma cópia, então podem divergir se forem atualizados manualmente.
- Modelos com nomes como `iPad 11`, `iPad 11ª geração`, `iPad A16` não têm normalização equivalente à de iPhone.
- Upload manual tem prioridade sobre assets estáticos apenas para produtos de inventory com registro em `product_images`.

## Recomendações sem implementação

1. Definir padrão de pasta/manifest para iPad: `public/product-assets/apple/ipad/{modelo}/{arquivo}.webp`.
2. Adicionar assets reais do iPad 11/A16 por cor antes de alterar o resolvedor.
3. Estender o resolvedor com `resolveIpadModelSlug` e aliases `silver/prateado/prata`.
4. Criar testes puros para `getProductAssetImageInfo` cobrindo inventory e supplier_offer.
5. Garantir uma única fonte de verdade para o manifest ou automatizar a cópia público -> runtime.
