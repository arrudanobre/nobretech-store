import { Camera, ChatCircle, SealCheck, ShieldCheck, Storefront, Truck } from "@phosphor-icons/react/dist/ssr"
import type { CatalogTrustBadge, CatalogTrustBadgeIcon } from "@/lib/catalog/settings"

const ICON_MAP: Record<CatalogTrustBadgeIcon, typeof Camera> = {
  camera: Camera,
  shield_check: ShieldCheck,
  seal_check: SealCheck,
  chat_circle: ChatCircle,
  truck: Truck,
  storefront: Storefront,
}

type Props = {
  badges: CatalogTrustBadge[]
}

export function CatalogTrustCards({ badges }: Props) {
  if (badges.length === 0) return null

  return (
    <section className="px-4 pb-2 sm:px-6 sm:pb-4">
      <div className="mx-auto max-w-6xl">
        <ul className="flex items-stretch gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-1.5 backdrop-blur sm:gap-3 sm:p-2">
          {badges.map((badge, index) => {
            const Icon = ICON_MAP[badge.iconKey] ?? Storefront
            return (
              <li
                key={badge.id}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium text-zinc-200 sm:text-[12px] ${
                  index === 0 ? "" : "border-l border-white/[0.04]"
                }`}
              >
                <Icon className="h-3.5 w-3.5 text-[#F2D88A]" weight="duotone" aria-hidden />
                <span>{badge.label}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
