import { cn } from "@/lib/utils"

interface BadgeProps {
  children: React.ReactNode
  variant?: "green" | "red" | "yellow" | "blue" | "gray" | "default"
  dot?: boolean
  className?: string
}

export function Badge({ children, variant = "default", dot, className = "" }: BadgeProps) {
  const variants: Record<string, string> = {
    green: "bg-success-100 text-green-800",
    red: "bg-danger-100 text-red-800",
    yellow: "bg-warning-100 text-amber-800",
    blue: "bg-royal-100 text-royal-600",
    gray: "bg-gray-100 text-gray-700",
    default: "bg-gray-100 text-gray-700",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            variant === "green"
              ? "bg-success-500"
              : variant === "red"
              ? "bg-danger-500"
              : variant === "yellow"
              ? "bg-warning-500"
              : variant === "blue"
              ? "bg-royal-500"
              : "bg-gray-500"
          )}
        />
      )}
      {children}
    </span>
  )
}
