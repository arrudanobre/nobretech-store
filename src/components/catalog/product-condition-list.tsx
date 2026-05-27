import {
  BatteryCharging,
  Camera,
  CheckCircle,
  Cpu,
  DeviceMobile,
  Fingerprint,
  Package,
  SealCheck,
  ShieldCheck,
  SpeakerHigh,
  WifiHigh,
} from "@phosphor-icons/react/dist/ssr"
import type { PublicCatalogConditionItem } from "@/lib/catalog/types"
import { formatScore10, getScoreTone } from "@/lib/catalog/score"

const ICON_MAP: Record<string, typeof DeviceMobile> = {
  screen: DeviceMobile,
  sides: DeviceMobile,
  back: DeviceMobile,
  body: DeviceMobile,
  battery: BatteryCharging,
  cameras: Camera,
  faceId: Fingerprint,
  audio: SpeakerHigh,
  connectivity: WifiHigh,
  functions: Cpu,
}

const TONE_TEXT: Record<ReturnType<typeof getScoreTone>, string> = {
  emerald: "text-emerald-300",
  lime: "text-lime-300",
  amber: "text-amber-300",
  orange: "text-orange-300",
  rose: "text-rose-300",
}

const GROUPS = [
  { title: "Aparência", keys: ["screen", "sides", "back", "body"] },
  { title: "Componentes", keys: ["battery", "cameras", "faceId"] },
  { title: "Funcionamento", keys: ["audio", "connectivity", "functions"] },
]

type Props = {
  items: PublicCatalogConditionItem[]
  variant: "sealed" | "seminovo"
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function shouldShowDescription(stateLabel?: string, description?: string) {
  if (!description) return false
  if (!stateLabel) return true
  const state = normalizeText(stateLabel)
  const note = normalizeText(description)
  if (!note) return false
  return state !== note && !state.includes(note) && !note.includes(state)
}

export function ProductConditionList({ items, variant }: Props) {
  if (items.length === 0) return null

  if (variant === "sealed") {
    const warrantyLabel =
      items.find((item) => item.key === "functions")?.description ||
      items.find((item) => item.label.toLowerCase().includes("garantia"))?.description ||
      "Garantia oficial"
    const sealedSubtitle = `Unidade sem uso anterior, com embalagem original e ${warrantyLabel}.`
    const trustPoints = [
      {
        label: "Embalagem lacrada",
        description: "Produto sem uso anterior.",
        icon: Package,
      },
      {
        label: warrantyLabel,
        description: "Garantia oficial Apple conforme consulta no momento da ativação.",
        icon: ShieldCheck,
      },
      {
        label: "Pronta entrega",
        description: "Disponibilidade confirmada pela loja.",
        icon: CheckCircle,
      },
      {
        label: "Procedência verificada",
        description: "Disponibilidade conferida antes da publicação.",
        icon: SealCheck,
      },
    ]

    return (
      <div className="relative overflow-hidden rounded-[28px] border border-[#D6A84F]/35 bg-gradient-to-br from-[#201A0B]/70 via-white/[0.035] to-transparent p-5 shadow-[0_24px_80px_rgba(214,168,79,0.08)] backdrop-blur">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#D6A84F]/16 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 left-8 h-28 w-28 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D6A84F]/45 bg-[#2A2110] text-[#F4D57A] shadow-[0_14px_34px_rgba(214,168,79,0.14)]">
            <SealCheck className="h-5 w-5" weight="fill" />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-tight text-[#F5DC97]">
              Produto lacrado de fábrica
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-300">{sealedSubtitle}</p>
          </div>
        </div>
        <ul className="relative mt-4 grid gap-2.5 sm:grid-cols-2">
          {trustPoints.map((item) => {
            const Icon = item.icon
            return (
              <li
                key={item.label}
                className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D6A84F]/12 text-[#F2D88A] ring-1 ring-[#D6A84F]/20">
                  <Icon className="h-4 w-4" weight="duotone" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight text-zinc-100">{item.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-zinc-400">{item.description}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const groupedItems = GROUPS
    .map((group) => ({
      ...group,
      items: items.filter((item) => group.keys.includes(item.key)),
    }))
    .filter((group) => group.items.length > 0)
  const groupedKeys = new Set(GROUPS.flatMap((group) => group.keys))
  const otherItems = items.filter((item) => !groupedKeys.has(item.key))

  return (
    <div className="space-y-3">
      {[...groupedItems, ...(otherItems.length > 0 ? [{ title: "Outros", keys: [], items: otherItems }] : [])].map((group) => (
        <section
          key={group.title}
          className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-3.5"
        >
          <h3 className="px-1 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            {group.title}
          </h3>
          <ul className="mt-2 divide-y divide-white/[0.055]">
            {group.items.map((item) => (
              <ConditionRow key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ConditionRow({ item }: { item: PublicCatalogConditionItem }) {
  const Icon = ICON_MAP[item.key] || CheckCircle
  const tone = item.score != null ? getScoreTone(item.score) : null
  const toneClass = tone ? TONE_TEXT[tone] : "text-zinc-300"
  const showDescription = shouldShowDescription(item.stateLabel, item.description)

  return (
    <li className="flex items-start gap-3 py-3 first:pt-1.5 last:pb-1.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] text-zinc-400">
        <Icon className="h-4 w-4" weight="duotone" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-semibold leading-tight text-zinc-100">{item.label}</p>
          {item.score != null ? (
            <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${toneClass}`}>
              {formatScore10(item.score)}
              <span className="ml-0.5 text-[9.5px] font-medium opacity-70">/10</span>
            </span>
          ) : null}
        </div>
        {item.stateLabel ? (
          <p className={`mt-1 text-[12.5px] font-medium leading-snug ${toneClass}`}>{item.stateLabel}</p>
        ) : null}
        {showDescription ? (
          <p className="mt-1 text-[12px] font-normal leading-relaxed text-zinc-400">{item.description}</p>
        ) : null}
      </div>
    </li>
  )
}
