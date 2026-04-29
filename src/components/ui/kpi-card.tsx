import { Icons } from "./icon-helpers"
import { type LucideIcon } from "lucide-react"
import { formatBRL } from "@/lib/helpers"

interface KPICardProps {
  title: string
  value: number | string
  change?: { value: number; positive: boolean }
  icon: LucideIcon
  prefix?: "currency" | "" | "%"
  gradient?: boolean
}

export function KPICard({ title, value, change, icon: Icon, prefix, gradient }: KPICardProps) {
  let displayValue = value
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN

  if (Number.isFinite(numericValue)) {
    displayValue =
      prefix === "currency"
        ? formatBRL(numericValue)
        : prefix === "%"
          ? `${numericValue}%`
          : numericValue.toString()
  }

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all
        ${gradient
          ? "bg-gradient-to-br from-navy-900 to-navy-800 text-white"
          : "bg-card border border-gray-100 shadow-sm"
        }
      `}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className={`text-xs font-medium uppercase tracking-wider ${gradient ? "text-white/60" : "text-gray-500"}`}>
            {title}
          </p>
          <p className="mt-1 truncate text-2xl sm:text-[1.7rem] font-semibold leading-tight tracking-normal text-inherit">
            {displayValue}
          </p>
          {change && (
            <div className="flex items-center gap-1 mt-1.5">
              {change.positive ? (
                <Icons.trendingUp className="w-3.5 h-3.5 text-success-500" />
              ) : (
                <Icons.trendingDown className="w-3.5 h-3.5 text-danger-500" />
              )}
              <span className={`text-xs font-medium ${change.positive ? "text-success-500" : "text-danger-500"}`}>
                {change.value}%
              </span>
              <span className={`text-xs ${gradient ? "text-white/50" : "text-gray-400"}`}>vs mês anterior</span>
            </div>
          )}
        </div>
        <div className={`rounded-xl p-2.5 ${gradient ? "bg-white/10" : "bg-royal-100"}`}>
          <Icon className={`w-5 h-5 ${gradient ? "text-white/80" : "text-royal-500"}`} />
        </div>
      </div>
    </div>
  )
}
