import { forwardRef, type TextareaHTMLAttributes } from "react"

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = "", label, error, id, ...props }, ref) {
    const taId = id || label?.toLowerCase().replace(/\s/g, "-")

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={taId} className="block text-sm font-medium text-navy-900 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={taId}
          className={`
            w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-navy-900 placeholder:text-gray-400
            transition-colors focus:outline-none focus:ring-2 focus:ring-royal-500/20 focus:border-royal-500 resize-y min-h-[80px]
            ${error ? "border-danger-500" : "border-gray-200"}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-xs text-danger-500 mt-1">{error}</p>}
      </div>
    )
  }
)

export { Textarea }
