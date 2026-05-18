import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  getProductAssetImageInfo,
  normalizeProductAssetText,
  type ProductAssetInput,
} from "../src/lib/product-assets"
import manifestData from "../src/lib/product-assets-manifest.json"

type ManifestEntry = {
  original: string
  model_slug: string
  file_name: string
  public_path: string
}

type AssetRow = {
  category: string
  model: string
  color: string
  fileName: string
  publicPath: string
  localPath: string
  extension: string
  sizeBytes: number
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = path.join(rootDir, "public")
const manifest = manifestData as ManifestEntry[]
const modelSlugs = new Set(manifest.map((entry) => entry.model_slug))
const assetPathByKey = new Map(
  manifest.map((entry) => [
    `${entry.model_slug}:${colorSlugFromFileName(entry.model_slug, entry.file_name)}`,
    entry.public_path,
  ])
)

const colorAliases: Record<string, string[]> = {
  azul: ["blue", "sierra-blue", "mist-blue", "deep-blue", "blue-titanium", "ultramarine"],
  blue: ["blue", "sierra-blue", "mist-blue", "deep-blue", "blue-titanium", "ultramarine"],
  prateado: ["silver", "white"],
  prata: ["silver", "white"],
  silver: ["silver", "white"],
  branco: ["white", "starlight", "silver", "white-titanium"],
  white: ["white", "starlight", "silver", "white-titanium"],
  preto: ["black", "midnight", "space-black", "black-titanium", "graphite"],
  black: ["black", "midnight", "space-black", "black-titanium", "graphite"],
}

function colorSlugFromFileName(modelSlug: string, fileName: string) {
  return fileName
    .replace(new RegExp(`^${modelSlug}-`), "")
    .replace(/\.webp$/i, "")
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    return stat.isDirectory() ? walkFiles(fullPath) : [fullPath]
  })
}

function titleFromSlug(slug: string) {
  return slug.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ")
}

function inferAssetRows(): AssetRow[] {
  return manifest.map((entry) => {
    const localPath = path.join(publicDir, entry.public_path.replace(/^\//, ""))
    return {
      category: entry.model_slug.startsWith("iphone") ? "iPhone" : "Outro",
      model: titleFromSlug(entry.model_slug).replace(/^Iphone/, "iPhone"),
      color: titleFromSlug(colorSlugFromFileName(entry.model_slug, entry.file_name)),
      fileName: entry.file_name,
      publicPath: entry.public_path,
      localPath,
      extension: path.extname(entry.file_name).replace(".", ""),
      sizeBytes: existsSync(localPath) ? statSync(localPath).size : 0,
    }
  })
}

function resolveCategoryKind(input: ProductAssetInput) {
  const text = [
    normalizeProductAssetText(input.brand),
    normalizeProductAssetText(input.category),
    normalizeProductAssetText(input.model),
  ].join("-")
  if (/(^|-)iphone($|-)/.test(text)) return "iphone"
  if (/(^|-)ipad($|-)/.test(text)) return "ipad"
  if (/(^|-)(macbook|mac)($|-)/.test(text)) return "macbook"
  if (/(^|-)(applewatch|apple-watch|watch)($|-)/.test(text)) return "apple-watch"
  if (/(^|-)(airpods|airpod|fone)($|-)/.test(text)) return "airpods"
  if (/(^|-)apple($|-)/.test(text)) return "generic-device"
  return "unknown-device"
}

function resolveIphoneModelSlug(input: ProductAssetInput): string | null {
  const normalized = normalizeProductAssetText(`${input.category || ""} ${input.model || ""}`)
    .replace(/\b\d+\s*(gb|tb)\b/g, "")
    .replace(/\b(a\+|a-|a|b\+|b|c|lacrado)\b/g, "")
    .replace(/-+/g, "-")
  const match = normalized.match(/(?:^|-)iphone-?(\d{2})(?:-(pro-max|pro|plus|mini|max))?/)
    || normalized.match(/(?:^|-)(\d{2})(?:-(pro-max|pro|plus|mini|max))?/)
  if (!match) return null
  const [, generation, suffix] = match
  const slug = ["iphone", generation, suffix].filter(Boolean).join("-")
  return modelSlugs.has(slug) ? slug : null
}

function colorCandidates(color?: string | null) {
  const normalized = normalizeProductAssetText(color)
  if (!normalized) return []
  return colorAliases[normalized] || [normalized]
}

function auditCase(name: string, input: ProductAssetInput) {
  const resolved = getProductAssetImageInfo(input)
  const kind = resolveCategoryKind(input)
  const modelSlug = resolveIphoneModelSlug(input)
  const candidates = modelSlug
    ? colorCandidates(input.color).map((colorSlug) => ({
      key: `${modelSlug}:${colorSlug}`,
      publicPath: assetPathByKey.get(`${modelSlug}:${colorSlug}`) || null,
    }))
    : []

  return {
    name,
    input,
    normalized: {
      brand: normalizeProductAssetText(input.brand),
      category: normalizeProductAssetText(input.category),
      model: normalizeProductAssetText(input.model),
      color: normalizeProductAssetText(input.color),
      kind,
      modelSlug,
    },
    candidates,
    matchedAsset: resolved.src,
    source: resolved.source,
    fallbackUsed: resolved.isFallback,
    badge: resolved.badge,
  }
}

function markdownTable(rows: AssetRow[]) {
  if (rows.length === 0) return "_Nenhum asset específico encontrado._"
  return [
    "| Modelo inferido | Cor inferida | Arquivo | Caminho | Tamanho |",
    "| --- | --- | --- | --- | ---: |",
    ...rows.map((row) => `| ${row.model} | ${row.color} | ${row.fileName} | ${row.publicPath} | ${row.sizeBytes} |`),
  ].join("\n")
}

const imageFiles = walkFiles(publicDir)
  .filter((file) => /\.(png|jpe?g|webp|avif|svg)$/i.test(file))
  .map((file) => path.relative(rootDir, file))
  .sort()

const assetRows = inferAssetRows()
const fallbackRows = imageFiles
  .filter((file) => file.startsWith("public/product-assets/fallbacks/"))
  .map((file) => {
    const stat = statSync(path.join(rootDir, file))
    return `| ${path.basename(file)} | /${file.replace(/^public\//, "")} | ${stat.size} |`
  })

const cases = [
  auditCase("iPhone 16 Azul inventory", {
    brand: "Apple",
    category: "iphone",
    model: "iPhone 16",
    color: "Azul",
  }),
  auditCase("iPhone 16 Azul supplier_offer", {
    brand: "Apple",
    category: "iphone",
    model: "iPhone 16",
    color: "Azul",
  }),
  auditCase("iPad 11 Silver", {
    brand: "Apple",
    category: "ipad",
    model: "iPad 11",
    color: "Silver",
  }),
  auditCase("iPad 11 Prateado", {
    brand: "Apple",
    category: "ipad",
    model: "iPad 11",
    color: "Prateado",
  }),
  auditCase("iPad 11 Prata", {
    brand: "Apple",
    category: "ipad",
    model: "iPad 11",
    color: "Prata",
  }),
  auditCase("Produto sem asset", {
    brand: "Acme",
    category: "gadget",
    model: "Produto Teste",
    color: "Inexistente",
  }),
]

const report = `# Auditoria de Assets de Produto

Gerado por \`npx tsx scripts/audit-product-assets.ts\`.

## Onde os assets estão

- \`public/product-assets/apple/iphone/**\`: assets estáticos específicos por modelo/cor de iPhone.
- \`public/product-assets/fallbacks/**\`: placeholders por categoria.
- \`public/product-assets/asset-manifest.json\`: manifest público gerado junto dos assets.
- \`src/lib/product-assets-manifest.json\`: cópia importada pelo resolver TypeScript.
- \`src/lib/product-assets.ts\`: resolvedor estático usado pela UI.
- \`product_images\` via \`/api/product-images\`: fotos manuais enviadas para R2, quando existem.

## Manifest / mapa de assets

Formato de cada entrada:

\`\`\`json
{
  "original": "Imagens iPhone/16/16 Ultramarine.webp",
  "model_slug": "iphone-16",
  "file_name": "iphone-16-ultramarine.webp",
  "public_path": "/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp"
}
\`\`\`

Total no manifest: ${manifest.length} assets específicos.
Total de imagens em \`public\`: ${imageFiles.length}.

## Resolvedor de imagem

- Função principal: \`getProductAssetImageInfo(input)\` em \`src/lib/product-assets.ts\`.
- Chamada na Central: \`productAssetFor(product, productImages)\` em \`src/app/(dashboard)/marketing/divulgacao/divulgacao-client.tsx\`.
- Fotos manuais: \`fetchProductImageMap(ids)\` chama \`/api/product-images\`, que consulta \`product_images\` por \`company_id\`, \`product_id\` e \`is_primary=true\`.

Ordem de prioridade observada:

1. \`uploadedThumbnailUrl\` ou \`uploadedImageUrl\` vindo de \`product_images\`.
2. Asset estático do manifest apenas quando o resolvedor reconhece iPhone + modelo + cor.
3. Fallback por categoria: iPhone, iPad, MacBook, Apple Watch, AirPods, genérico ou unknown.

## Assets encontrados por categoria

### iPhone

${markdownTable(assetRows.filter((row) => row.category === "iPhone"))}

### iPad

_Nenhum asset específico de iPad foi encontrado no manifest ou em \`public/product-assets/apple/ipad\`._

### Apple Watch

_Nenhum asset específico de Apple Watch foi encontrado; existe apenas fallback._

### MacBook

_Nenhum asset específico de MacBook foi encontrado; existe apenas fallback._

### Outros / Fallbacks

| Arquivo | Caminho | Tamanho |
| --- | --- | ---: |
${fallbackRows.join("\n")}

## Casos auditados

\`\`\`json
${JSON.stringify(cases, null, 2)}
\`\`\`

## Caso iPhone 16 Azul

O input \`iPhone 16 + Azul\` normaliza para \`modelSlug=iphone-16\` e \`color=azul\`.
O alias \`azul\` testa, nesta ordem: \`blue\`, \`sierra-blue\`, \`mist-blue\`, \`deep-blue\`, \`blue-titanium\`, \`ultramarine\`.
Não existe \`iphone-16-blue.webp\`, mas existe \`iphone-16-ultramarine.webp\`; por isso a imagem aparece mesmo sem upload manual.

Asset encontrado:
\`/product-assets/apple/iphone/iphone-16/iphone-16-ultramarine.webp\`

## Caso iPad 11 Silver/Prateado

O input reconhece \`kind=ipad\`, mas o resolvedor atual só procura assets específicos quando o produto é iPhone.
Como não há asset específico de iPad no manifest, \`iPad 11 Silver\`, \`iPad 11 Prateado\` e \`iPad 11 Prata\` caem em:
\`/product-assets/fallbacks/ipad.webp\`

Causa provável da falha: ausência de assets específicos de iPad e ausência de uma estratégia de resolução estática para iPad/modelo/cor.

## Supplier offer vs inventory

A Central converte inventory e supplier_offer para o mesmo shape \`MarketingProduct\` e chama o mesmo \`productAssetFor\`.
A diferença é que \`fetchProductImageMap\` só encontra uploads manuais vinculados a \`inventory.product_id\`.
Supplier offers normalmente não têm linha em \`product_images\`, então dependem de asset estático/fallback.
Quando modelo/cor/categoria são equivalentes, supplier_offer e inventory geram a mesma resolução estática.

## Riscos

- O nome comercial \`Azul\` em iPhone 16 está sendo tratado como alias de \`Ultramarine\`.
- Não há cobertura estática para iPad, Apple Watch ou MacBook além de fallback.
- O manifest usado em runtime fica em \`src/lib/product-assets-manifest.json\`; o manifest público é uma cópia, então podem divergir se forem atualizados manualmente.
- Modelos com nomes como \`iPad 11\`, \`iPad 11ª geração\`, \`iPad A16\` não têm normalização equivalente à de iPhone.
- Upload manual tem prioridade sobre assets estáticos apenas para produtos de inventory com registro em \`product_images\`.

## Recomendações sem implementação

1. Definir padrão de pasta/manifest para iPad: \`public/product-assets/apple/ipad/{modelo}/{arquivo}.webp\`.
2. Adicionar assets reais do iPad 11/A16 por cor antes de alterar o resolvedor.
3. Estender o resolvedor com \`resolveIpadModelSlug\` e aliases \`silver/prateado/prata\`.
4. Criar testes puros para \`getProductAssetImageInfo\` cobrindo inventory e supplier_offer.
5. Garantir uma única fonte de verdade para o manifest ou automatizar a cópia público -> runtime.
`

writeFileSync(path.join(rootDir, "docs/product-assets-audit.md"), report)

console.log(JSON.stringify({
  totals: {
    publicImages: imageFiles.length,
    manifestAssets: manifest.length,
    iphoneAssets: assetRows.filter((row) => row.category === "iPhone").length,
    ipadSpecificAssets: assetRows.filter((row) => row.category === "iPad").length,
    fallbacks: fallbackRows.length,
  },
  cases,
  reportPath: "docs/product-assets-audit.md",
}, null, 2))
