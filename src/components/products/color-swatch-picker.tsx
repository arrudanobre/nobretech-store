"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DEFAULT_COLOR_SUGGESTIONS, normalizeCatalogName, type CatalogColor } from "@/lib/catalog-config"

type ColorSwatchPickerProps = {
  label?: string
  subtitle?: string
  colors: CatalogColor[]
  value: string
  disabled?: boolean
  onChange: (color: CatalogColor) => void
  onCreateColor?: (color: CatalogColor) => Promise<void> | void
  suggestions?: CatalogColor[]
  createLabel?: string
  emptyMessage?: string
  allowNoColor?: boolean
  noColorLabel?: string
  onClear?: () => void
  allowOutOfCatalog?: boolean
  outOfCatalogLabel?: string
}

const HEX_RE = /^#[0-9a-f]{6}$/i

function normalizeHexInput(value: string) {
  const clean = value.trim().replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
  return clean ? `#${clean}` : "#"
}

export function ColorSwatchPicker({
  label = "Cor",
  subtitle,
  colors,
  value,
  disabled = false,
  onChange,
  onCreateColor,
  suggestions = DEFAULT_COLOR_SUGGESTIONS,
  createLabel = "Adicionar nova cor",
  emptyMessage = "Nenhuma cor configurada para este modelo.",
  allowNoColor = false,
  noColorLabel = "Sem cor",
  onClear,
  allowOutOfCatalog = true,
  outOfCatalogLabel = "Usar cor fora do catálogo",
}: ColorSwatchPickerProps) {
  const [creating, setCreating] = useState(false)
  const [usingExternal, setUsingExternal] = useState(false)
  const [name, setName] = useState("")
  const [hex, setHex] = useState("#111827")
  const [saving, setSaving] = useState(false)
  const valueOutsideCatalog = Boolean(value) && !colors.some((color) => normalizeCatalogName(color.name) === normalizeCatalogName(value))

  const handleCreate = async () => {
    const nextName = name.trim()
    const nextHex = normalizeHexInput(hex)
    if (!nextName || !HEX_RE.test(nextHex) || !onCreateColor) return
    const existing = colors.find((color) => normalizeCatalogName(color.name) === normalizeCatalogName(nextName))
    if (existing) {
      onChange(existing)
      setName("")
      setHex("#111827")
      setCreating(false)
      return
    }
    setSaving(true)
    try {
      await onCreateColor({ name: nextName, hex: nextHex })
      setName("")
      setHex("#111827")
      setCreating(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label className="block text-sm font-semibold text-navy-900">{label}</label>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {onCreateColor ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setCreating((current) => !current)
                setUsingExternal(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-royal-600 transition hover:bg-royal-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {createLabel}
            </button>
          ) : null}
          {allowOutOfCatalog ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setUsingExternal((current) => !current)
                setCreating(false)
              }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-navy-900 disabled:opacity-50"
            >
              {outOfCatalogLabel}
            </button>
          ) : null}
        </div>
      </div>

      {valueOutsideCatalog ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Cor atual: {value}</strong> — fora do catálogo deste modelo. Você pode manter a cor atual ou trocar por uma cor permitida.
        </div>
      ) : null}

      {colors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-3 text-sm text-amber-900">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowNoColor ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onClear?.()
                setName("")
                setHex("#111827")
              }}
              className={cn(
                "min-h-[44px] rounded-xl border bg-white px-3 py-2 text-xs font-semibold transition-all",
                !value ? "border-royal-500 text-royal-700 shadow-sm ring-2 ring-royal-500/20" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:shadow-sm",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              {noColorLabel}
            </button>
          ) : null}
          {colors.map((color) => {
            const selected = value === color.name
            return (
              <button
                key={`${color.name}-${color.hex}`}
                type="button"
                disabled={disabled}
                onClick={() => onChange(color)}
                className={cn(
                  "group flex min-h-[44px] items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-navy-900 transition-all",
                  selected
                    ? "border-royal-500 shadow-sm ring-2 ring-royal-500/20"
                    : "border-gray-200 hover:border-gray-300 hover:shadow-sm",
                  disabled && "cursor-not-allowed opacity-60"
                )}
              >
                <span
                  className="h-5 w-5 rounded-full border border-gray-300 shadow-inner"
                  style={{ backgroundColor: color.hex }}
                />
                <span>{color.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {usingExternal ? (
        <div className="min-w-0 space-y-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
          <p className="text-xs font-medium leading-5 text-amber-900">
            Use esta opção apenas quando você decidiu cadastrar uma cor fora do catálogo oficial deste modelo.
          </p>
          <div className="grid min-w-0 grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
            <Input label="Cor fora do catálogo" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Vermelho" />
            <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-navy-900">Preview</label>
                <input
                  type="color"
                  value={HEX_RE.test(hex) ? hex : "#111827"}
                  onChange={(event) => setHex(event.target.value.toUpperCase())}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white p-1"
                />
              </div>
              <Input label="HEX" value={hex} onChange={(event) => setHex(normalizeHexInput(event.target.value))} placeholder="#111827" />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-11 w-full sm:w-auto"
              disabled={!name.trim() || !HEX_RE.test(normalizeHexInput(hex))}
              onClick={() => {
                onChange({ name: name.trim(), hex: normalizeHexInput(hex) })
                setName("")
                setHex("#111827")
                setUsingExternal(false)
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}

      {creating ? (
        <div className="min-w-0 space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="grid min-w-0 grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
            <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Azul Sierra" />
            <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-navy-900">Preview</label>
                <input
                  type="color"
                  value={HEX_RE.test(hex) ? hex : "#111827"}
                  onChange={(event) => setHex(event.target.value.toUpperCase())}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white p-1"
                />
              </div>
              <Input label="HEX" value={hex} onChange={(event) => setHex(normalizeHexInput(event.target.value))} placeholder="#111827" />
            </div>
            <Button type="button" size="sm" className="h-11 w-full sm:w-auto" disabled={!name.trim() || !HEX_RE.test(normalizeHexInput(hex)) || saving} onClick={handleCreate}>
              Salvar
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.name}-${suggestion.hex}`}
                type="button"
                className="flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 transition hover:border-royal-200 hover:text-royal-700"
                onClick={() => {
                  setName(suggestion.name)
                  setHex(suggestion.hex.toUpperCase())
                }}
              >
                <span className="h-4 w-4 rounded-full border border-gray-300" style={{ backgroundColor: suggestion.hex }} />
                <span className="truncate">{suggestion.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
