import { forwardRef, type SelectHTMLAttributes } from "react"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ label: string; value: string }>
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className = "", label, error, options, placeholder, id, value, ...props }, ref) {
    const selectId = id || label?.toLowerCase().replace(/\s/g, "-")

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-navy-900 mb-1.5"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          value={value}
          className={`
            w-full h-11 rounded-xl border bg-white px-3 text-sm text-navy-900
            transition-colors focus:outline-none focus:ring-2 focus:ring-royal-500/20 focus:border-royal-500
            disabled:bg-gray-50 disabled:text-gray-500
            ${error ? "border-danger-500" : "border-gray-200"}
            ${className}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger-500 mt-1">{error}</p>}
      </div>
    )
  }
)

export { Select }
