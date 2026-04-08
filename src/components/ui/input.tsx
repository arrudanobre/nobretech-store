import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  darkMode?: boolean
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = "", label, error, darkMode, icon, id, ...props }, ref) {
    const inputId = id || label?.toLowerCase().replace(/\s/g, "-")

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "block text-sm font-medium mb-1.5",
              darkMode ? "text-white/70" : "text-navy-900"
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className={cn("absolute left-3 top-1/2 -translate-y-1/2 flex items-center", darkMode ? "text-white/40" : "text-gray-400")}>
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full h-11 rounded-xl border px-3 text-sm transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-royal-500/20 focus:border-royal-500",
              "disabled:opacity-50 disabled:pointer-events-none",
              darkMode
                ? "bg-navy-800/50 border-navy-700 text-white placeholder:text-white/30"
                : "bg-white border-gray-200 text-navy-900 placeholder:text-gray-400",
              error && "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500",
              icon && "pl-10",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-danger-500 mt-1">{error}</p>}
      </div>
    )
  }
)

export { Input }
