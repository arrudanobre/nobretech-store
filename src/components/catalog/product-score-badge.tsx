import { formatScore10, getScoreTone, type ScoreTone } from "@/lib/catalog/score"

type Props = {
  score: number | null
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  label?: string | null
}

const TONE_CLASSES: Record<ScoreTone, { ring: string; text: string; bg: string }> = {
  emerald: {
    ring: "ring-emerald-200/80",
    text: "text-white",
    bg: "bg-emerald-700",
  },
  lime: {
    ring: "ring-lime-200/80",
    text: "text-[#111607]",
    bg: "bg-lime-300",
  },
  amber: {
    ring: "ring-amber-200/80",
    text: "text-[#181006]",
    bg: "bg-amber-300",
  },
  orange: {
    ring: "ring-orange-200/80",
    text: "text-[#190c05]",
    bg: "bg-orange-400",
  },
  rose: {
    ring: "ring-rose-200/80",
    text: "text-white",
    bg: "bg-rose-600",
  },
}

const SIZE_CLASSES = {
  sm: "h-10 w-10 text-[13px]",
  md: "h-14 w-14 text-[15px]",
  lg: "h-20 w-20 text-[22px]",
}

export function ProductScoreBadge({ score, size = "md", showLabel = false, label }: Props) {
  if (score == null) return null
  const tone = getScoreTone(score)
  const palette = TONE_CLASSES[tone]
  const formatted = formatScore10(score)
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`flex flex-col items-center justify-center rounded-full font-bold leading-none shadow-[0_10px_26px_rgba(0,0,0,0.38)] ring-2 ${palette.bg} ${palette.text} ${palette.ring} ${SIZE_CLASSES[size]}`}
        aria-label={`Score ${formatted} de 10${label ? `, ${label}` : ""}`}
      >
        <span>{formatted}</span>
        {size !== "sm" ? <span className="mt-0.5 text-[9px] font-medium opacity-80">/10</span> : null}
      </div>
      {showLabel && label ? (
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Score</span>
          <span className={`text-sm font-medium ${palette.text}`}>{label}</span>
        </div>
      ) : null}
    </div>
  )
}
