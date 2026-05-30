"use client"

import { useId } from "react"
import { isValidHex } from "@/lib/masks"

type Props = {
  label: string
  description?: string
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
  fallback?: string
}

export function ColorField({
  label,
  description,
  value,
  onChange,
  disabled = false,
  fallback = "#3A6BC4",
}: Props) {
  const id = useId()
  const hex = (value || "").trim()
  const showValue = isValidHex(hex) ? hex : fallback
  const showError = Boolean(hex) && !isValidHex(hex)

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-semibold text-white">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-slate-400">{description}</p> : null}
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor={`${id}-picker`}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-white/15 shadow-inner"
          style={{ backgroundColor: showValue }}
          title="Selecionar cor"
        >
          <input
            id={`${id}-picker`}
            type="color"
            value={showValue}
            disabled={disabled}
            onChange={(event) => onChange((event.target.value || "").toUpperCase())}
            className="h-12 w-12 cursor-pointer opacity-0"
            aria-label={`${label} (selecionar cor)`}
          />
        </label>

        <input
          id={id}
          type="text"
          inputMode="text"
          maxLength={7}
          spellCheck={false}
          value={hex}
          disabled={disabled}
          placeholder="#3A6BC4"
          onChange={(event) => {
            const raw = (event.target.value || "").trim()
            if (!raw) {
              onChange("")
              return
            }
            const withHash = raw.startsWith("#") ? raw : `#${raw}`
            onChange(withHash.toUpperCase())
          }}
          className={`h-11 flex-1 rounded-xl border bg-white/[0.03] px-3 font-mono text-sm uppercase tracking-wider text-white placeholder:text-slate-500 outline-none transition hover:bg-white/[0.04] focus:border-blue-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-blue-400/15 disabled:cursor-not-allowed disabled:opacity-60 ${
            showError ? "border-red-400/60" : "border-white/[0.06]"
          }`}
        />
      </div>

      {showError ? (
        <p className="text-xs font-semibold text-red-300">Use formato HEX (ex: #3A6BC4).</p>
      ) : null}
    </div>
  )
}
