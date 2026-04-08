import { forwardRef, type ButtonHTMLAttributes, type ReactNode, forwardRef as fwd, type ComponentPropsWithoutRef } from "react"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium text-sm transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-royal-500 text-white hover:bg-royal-600 shadow-sm hover:shadow",
        secondary: "bg-navy-900 text-white hover:bg-navy-800",
        success: "bg-success-500 text-white hover:opacity-90",
        danger: "bg-danger-500 text-white hover:opacity-90",
        outline: "border border-gray-300 bg-transparent text-navy-900 hover:bg-gray-50",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-navy-900",
        link: "text-royal-500 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  children: ReactNode
  isLoading?: boolean
}

const Button = fwd<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant, size, fullWidth, children, isLoading, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${buttonVariants({ variant, size, fullWidth })} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <span className="animate-pulse opacity-60">{children}</span>
      ) : (
        children
      )}
    </button>
  )
})

export { Button, buttonVariants }
