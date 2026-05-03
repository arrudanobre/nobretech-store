"use client"

import { useState } from "react"
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrencyBR, formatPhoneBR } from "@/lib/marketing-format"

type FieldShellProps = {
  label: string
  hint?: string
  children: ReactNode
}

export type ProductOption = {
  id: string
  name: string
  meta?: string
}

export function FieldShell({ label, hint, children }: FieldShellProps) {
  return (
    <div className="w-full">
      <label className="mb-1.5 block text-sm font-semibold text-slate-900">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[11px] font-medium text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function FormBlock({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">{icon}</div>
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export function SelectField({ label, children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <FieldShell label={label}>
      <select
        className={cn(
          "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}

export function TextareaField({ label, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <FieldShell label={label}>
      <textarea
        className={cn(
          "min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          className
        )}
        {...props}
      />
    </FieldShell>
  )
}

export function CurrencyInputBR({ label, value, onValueChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  label: string
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <FieldShell label={label}>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onValueChange(formatCurrencyBR(event.target.value))}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        {...props}
      />
    </FieldShell>
  )
}

export function PhoneInputBR({ label, value, onValueChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  label: string
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <FieldShell label={label}>
      <input
        inputMode="tel"
        value={value}
        onChange={(event) => onValueChange(formatPhoneBR(event.target.value))}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        {...props}
      />
    </FieldShell>
  )
}

export function ProductSelect({
  products,
  value,
  customValue,
  search,
  useCustom,
  onSearchChange,
  onValueChange,
  onCustomValueChange,
  onUseCustomChange,
}: {
  products: ProductOption[]
  value: string
  customValue: string
  search: string
  useCustom: boolean
  onSearchChange: (value: string) => void
  onValueChange: (value: string) => void
  onCustomValueChange: (value: string) => void
  onUseCustomChange: (value: boolean) => void
}) {
  const [focused, setFocused] = useState(false)
  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return `${product.name} ${product.meta || ""}`.toLowerCase().includes(query)
  })
  const selectedProduct = products.find((product) => product.id === value)
  const query = search.trim()
  const showSuggestions = focused && query.length > 0

  const selectProduct = (product: ProductOption) => {
    onUseCustomChange(false)
    onValueChange(product.id)
    onCustomValueChange("")
    onSearchChange(product.name)
    setFocused(false)
  }

  const useTypedProduct = () => {
    onUseCustomChange(true)
    onValueChange("")
    onCustomValueChange(query)
    onSearchChange(query)
    setFocused(false)
  }

  return (
    <div className="space-y-2">
      <FieldShell label="Produto de interesse" hint={products.length > 0 ? "Priorize produtos reais do estoque para relatórios mais confiáveis." : "Sem produtos disponíveis no estoque. Use a exceção de texto livre."}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onChange={(event) => {
              const nextSearch = event.target.value
              onSearchChange(nextSearch)
              if (value) onValueChange("")
              if (useCustom) onCustomValueChange(nextSearch)
            }}
            placeholder="Buscar por modelo, IMEI, serial, cor ou armazenamento"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pl-9 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          {showSuggestions ? (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {filteredProducts.slice(0, 6).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectProduct(product)}
                  className="block w-full border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-blue-50"
                >
                  <span className="block text-sm font-bold text-slate-950">{product.name}</span>
                  {product.meta ? <span className="text-xs font-medium text-slate-500">{product.meta}</span> : null}
                </button>
              ))}
              {filteredProducts.length === 0 ? (
                <div className="px-3 py-2 text-sm font-medium text-slate-500">Nenhum produto real encontrado.</div>
              ) : null}
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={useTypedProduct}
                className="block w-full bg-amber-50 px-3 py-2.5 text-left text-sm font-bold text-amber-800 transition hover:bg-amber-100"
              >
                Usar &quot;{query}&quot; como produto não cadastrado
              </button>
            </div>
          ) : null}
        </div>
      </FieldShell>

      <select
        value={useCustom ? "__custom__" : value}
        onChange={(event) => {
          const nextValue = event.target.value
          onUseCustomChange(nextValue === "__custom__")
          onValueChange(nextValue === "__custom__" ? "" : nextValue)
          if (nextValue === "__custom__") onCustomValueChange(search.trim())
          if (nextValue !== "__custom__") {
            const product = products.find((item) => item.id === nextValue)
            if (product) {
              onSearchChange(product.name)
              onCustomValueChange("")
            }
          }
        }}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      >
        <option value="">Selecione um produto real</option>
        {filteredProducts.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}{product.meta ? ` · ${product.meta}` : ""}
          </option>
        ))}
        <option value="__custom__">Produto não cadastrado</option>
      </select>

      {selectedProduct && !useCustom ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          Produto selecionado: {selectedProduct.name}
        </div>
      ) : null}

      {useCustom ? (
        <input
          value={customValue}
          onChange={(event) => onCustomValueChange(event.target.value)}
          placeholder="Descreva o produto apenas como exceção"
          className="h-11 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-950 outline-none transition placeholder:text-amber-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
        />
      ) : null}
    </div>
  )
}

export function LeadStatusBadge({ status, label }: { status: string; label: string }) {
  const classes: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    in_service: "bg-violet-100 text-violet-700",
    table_sent: "bg-amber-100 text-amber-700",
    hot_negotiation: "bg-orange-100 text-orange-700",
    sold: "bg-emerald-100 text-emerald-700",
    lost: "bg-rose-100 text-rose-700",
  }

  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-bold", classes[status] || "bg-slate-100 text-slate-600")}>{label}</span>
}

export function LeadTemperatureBadge({ temperature }: { temperature?: string | null }) {
  const labels: Record<string, string> = { cold: "Frio", warm: "Morno", hot: "Quente" }
  const classes: Record<string, string> = {
    cold: "bg-slate-100 text-slate-600",
    warm: "bg-amber-100 text-amber-700",
    hot: "bg-red-100 text-red-700",
  }
  if (!temperature) return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Sem temperatura</span>
  return <span className={cn("rounded-full px-3 py-1 text-xs font-bold", classes[temperature] || classes.cold)}>{labels[temperature] || temperature}</span>
}
