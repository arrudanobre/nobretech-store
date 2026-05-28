import type { CatalogTrustBadge } from "@/lib/catalog/settings"
import { BadgeIcon } from "@/components/catalog/badge-icon"

type Props = {
  badges: CatalogTrustBadge[]
}

export function CatalogTrustCards({ badges }: Props) {
  if (badges.length === 0) return null

  return (
    <section className="px-4 pb-2 sm:px-6 sm:pb-4">
      <div className="mx-auto max-w-6xl">
        <ul className="flex items-stretch gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-1.5 backdrop-blur sm:gap-3 sm:p-2">
          {badges.map((badge, index) => (
            <li
              key={badge.id}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium text-zinc-200 sm:text-[12px] ${
                index === 0 ? "" : "border-l border-white/[0.04]"
              }`}
            >
              <BadgeIcon iconKey={badge.iconKey} className="h-3.5 w-3.5 text-[#F2D88A]" />
              <span>{badge.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
