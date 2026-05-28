// One-off: extrai SVGs das chaves curadas do Iconify e gera módulo local.
// Uso: node scripts/gen-badge-icons.mjs
import { writeFileSync } from "node:fs"

const SETS = {
  mdi: [
    "shield-check", "shield", "check-decagram", "check-circle", "certificate",
    "truck-delivery", "truck-fast", "package-variant-closed", "cube-send",
    "storefront", "camera", "headset", "whatsapp", "instagram", "phone",
    "email", "map-marker", "clock-outline", "star", "heart", "thumb-up",
    "cash", "credit-card-outline", "cash-multiple", "sale", "swap-horizontal",
    "lock-check", "diamond-stone", "chat-processing",
  ],
  "simple-icons": ["pix", "apple"],
}

const out = {}

for (const [prefix, names] of Object.entries(SETS)) {
  const url = `https://api.iconify.design/${prefix}.json?icons=${names.join(",")}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${prefix}: ${res.status}`)
  const data = await res.json()
  const dw = data.width || 24
  const dh = data.height || 24
  for (const name of names) {
    const icon = data.icons?.[name]
    if (!icon) {
      console.error(`MISSING ${prefix}:${name}`)
      continue
    }
    const w = icon.width || dw
    const h = icon.height || dh
    out[`${prefix}:${name}`] = { body: icon.body, viewBox: `0 0 ${w} ${h}` }
  }
}

const header = `// AUTO-GERADO por scripts/gen-badge-icons.mjs — não editar à mão.
// SVGs locais (inline) dos selos da vitrine pública. Renderizam no servidor
// sem fetch externo, evitando pop-in/dependência de api.iconify.design no público.

export type LocalBadgeIcon = { body: string; viewBox: string }

export const LOCAL_BADGE_ICONS: Record<string, LocalBadgeIcon> = ${JSON.stringify(out, null, 2)}
`

writeFileSync("src/lib/catalog/badge-icon-svgs.ts", header)
console.log(`OK: ${Object.keys(out).length} ícones gravados.`)
