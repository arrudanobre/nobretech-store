import { resolveBadgeIconKey, DEFAULT_BADGE_ICON } from "@/lib/catalog/badge-icons"
import { LOCAL_BADGE_ICONS } from "@/lib/catalog/badge-icon-svgs"

type Props = {
  iconKey: string | null | undefined
  className?: string
}

// Render do selo na vitrine pública: SVG local inline (server-side, sem fetch
// externo). Evita pop-in e dependência de api.iconify.design no customer-facing.
// O picker do admin usa @iconify/react para a galeria completa pesquisável.
export function BadgeIcon({ iconKey, className }: Props) {
  const key = resolveBadgeIconKey(iconKey)
  const icon = LOCAL_BADGE_ICONS[key] ?? LOCAL_BADGE_ICONS[DEFAULT_BADGE_ICON]
  return (
    <svg
      viewBox={icon.viewBox}
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  )
}
