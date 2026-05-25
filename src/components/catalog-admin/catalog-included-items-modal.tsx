"use client"

import { useEffect, useState } from "react"
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr"
import type { CatalogAdminItem } from "@/lib/catalog/admin-types"

type Item = { label: string; is_included: boolean }

const SUGGESTIONS = [
  "Caixa Nobretech",
  "Caixa original Apple",
  "Cabo de carregamento",
  "Fonte",
  "Película aplicada",
  "Capinha transparente",
  "Caneta",
  "Documentação",
]

type Props = {
  item: CatalogAdminItem
  onClose: () => void
  onSaved: () => void
}

export function CatalogIncludedItemsModal({ item, onClose, onSaved }: Props) {
  const [items, setItems] = useState<Item[]>(() =>
    item.includedItems.map((entry) => ({ label: entry.label, is_included: entry.is_included })),
  )
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setItems(item.includedItems.map((entry) => ({ label: entry.label, is_included: entry.is_included })))
  }, [item.inventoryId, item.includedItems])

  function addItem(label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    if (items.some((entry) => entry.label.toLowerCase() === trimmed.toLowerCase())) return
    setItems((current) => [...current, { label: trimmed, is_included: true }])
  }

  async function save() {
    setSaving(true)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/catalog/included-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryItemId: item.inventoryId, items }),
      })
      const result = (await response.json()) as { error?: { message: string } | null }
      if (!response.ok) throw new Error(result.error?.message || "Erro ao salvar")
      onSaved()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Itens inclusos" onClose={onClose}>
      <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-slate-300">
        Informe exatamente o que acompanha este produto. A lista é livre e pode ser ajustada antes da publicação.
      </p>

      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
            Nenhum item ainda. Use as sugestões abaixo ou adicione um item.
          </p>
        ) : null}
        {items.map((entry, index) => (
          <div
            key={`${entry.label}-${index}`}
            className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 sm:flex-row sm:items-center"
          >
            <input
              value={entry.label}
              onChange={(event) =>
                setItems((current) =>
                  current.map((row, idx) => (idx === index ? { ...row, label: event.target.value } : row)),
                )
              }
              className="w-full flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15 sm:border-transparent sm:bg-transparent sm:px-0 sm:focus:border-transparent sm:focus:ring-0"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={entry.is_included}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, idx) =>
                      idx === index ? { ...row, is_included: event.target.checked } : row,
                    ),
                  )
                }
              />
              Incluído
            </label>
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((_, idx) => idx !== index))}
              className="rounded-md p-1 text-zinc-400 transition hover:text-rose-300"
              aria-label={`Remover ${entry.label}`}
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addItem(draft)
              setDraft("")
            }
          }}
          placeholder="Adicionar item..."
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
        />
        <button
          type="button"
          onClick={() => {
            addItem(draft)
            setDraft("")
          }}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-3 text-sm text-slate-100 transition hover:bg-white/[0.12]"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => addItem(suggestion)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-[#D6A84F]/35 hover:bg-[#D6A84F]/10 hover:text-[#F2D88A]"
          >
            + {suggestion}
          </button>
        ))}
      </div>

      {errorMessage ? <p className="mt-3 text-sm text-rose-300">{errorMessage}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.1]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-5 py-2 text-sm font-semibold text-[#1a1206] transition hover:scale-[1.02] disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
    </ModalShell>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0B1220] p-5 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.65)] sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F2D88A]">Kit e acessórios</p>
            <h2 className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/[0.1]"
          >
            Fechar
          </button>
        </header>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
