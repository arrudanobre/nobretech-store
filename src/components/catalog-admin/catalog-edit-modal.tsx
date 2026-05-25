"use client"

import { useState } from "react"
import type { CatalogAdminItem } from "@/lib/catalog/admin-types"
import { buildCatalogInstallmentQuote, type CatalogPaymentSettings } from "@/lib/catalog/pricing"
import { formatBRL } from "@/lib/helpers"

type Props = {
  item: CatalogAdminItem
  paymentSettings: CatalogPaymentSettings
  onClose: () => void
  onSaved: () => void
}

function priceToInput(value: number | null | undefined): string {
  if (value == null || value === 0) return ""
  return formatBRL(value)
}

function buildTitleFallback(item: CatalogAdminItem): string {
  return [item.title, item.subtitle?.replace(/\s*•\s*/g, " ")].filter(Boolean).join(" ").trim()
}

function currencyInputToNumber(value: string): number | null {
  const digits = value.replace(/\D/g, "")
  if (!digits) return null
  return Math.round(Number(digits)) / 100
}

function maskCurrencyInput(value: string): string {
  const parsed = currencyInputToNumber(value)
  return parsed == null ? "" : formatBRL(parsed)
}

function installmentPreview(amount: number | null, count: number, enabled: boolean, settings: CatalogPaymentSettings) {
  if (!enabled) return "Parcelamento oculto no catálogo."
  if (amount == null || amount <= 0) return "Informe o preço para calcular as parcelas."
  return buildCatalogInstallmentQuote(amount, count, settings)
}

export function CatalogEditModal({ item, paymentSettings, onClose, onSaved }: Props) {
  const pub = item.publication
  const [title, setTitle] = useState(pub?.public_title || buildTitleFallback(item))
  const [description, setDescription] = useState(pub?.public_description || "")
  const [price, setPrice] = useState(priceToInput(pub?.public_price ?? item.suggestedPrice))
  const [promoPrice, setPromoPrice] = useState(priceToInput(pub?.promo_price))
  const [installmentCount, setInstallmentCount] = useState(Math.min(18, Math.max(1, pub?.installment_count ?? 10)))
  const [showInstallments, setShowInstallments] = useState(pub?.show_installments !== false)
  const [highlight, setHighlight] = useState(pub?.highlight === true)
  const [notes, setNotes] = useState(pub?.notes_internal || "")
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const publicPrice = currencyInputToNumber(price)
  const promotionalPrice = currencyInputToNumber(promoPrice)
  const parcelBase = promotionalPrice != null && publicPrice != null && promotionalPrice < publicPrice ? promotionalPrice : publicPrice
  const preview = installmentPreview(parcelBase, installmentCount, showInstallments, paymentSettings)

  function validate(): string | null {
    if (!title.trim()) return "Informe o título público."
    if (publicPrice == null || publicPrice <= 0) return "Preço público inválido."
    if (promoPrice.trim()) {
      if (promotionalPrice == null || promotionalPrice <= 0) return "Preço promocional inválido."
      if (promotionalPrice >= publicPrice) return "Preço promocional precisa ser menor que o preço público."
    }
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 18) {
      return "Parcelamento máximo permitido é 18x."
    }
    return null
  }

  async function submit() {
    const validationError = validate()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }
    setSaving(true)
    setErrorMessage(null)
    try {
      const payload = {
        inventoryItemId: item.inventoryId,
        publicTitle: title,
        publicDescription: description,
        publicPrice,
        promoPrice: promoPrice.trim() ? promotionalPrice : null,
        installmentCount,
        showInstallments,
        highlight,
        notesInternal: notes,
        action: "save" as const,
      }
      const response = await fetch("/api/catalog/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { error?: { message: string } | null }
      if (!response.ok) {
        throw new Error(result.error?.message || "Erro ao salvar")
      }
      onSaved()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Editar vitrine" onClose={onClose}>
      <div className="mb-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-xs leading-relaxed text-blue-100">
        Essas informações aparecem para o cliente no catálogo. Custos, margem e fornecedor ficam fora da vitrine.
      </div>
      <div className="space-y-3">
        <Field label="Título público" hint="Como o aparelho aparece no card e no detalhe.">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={item.title}
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
          />
        </Field>
        <Field label="Descrição pública" hint="Texto humano sobre o aparelho. Sem dados internos.">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Unidade revisada, com fotos reais e condição conferida pela equipe Nobretech."
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preço público (R$)">
            <input
              value={price}
              onChange={(event) => setPrice(maskCurrencyInput(event.target.value))}
              inputMode="decimal"
              placeholder="R$ 0,00"
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
            />
          </Field>
          <Field label="Preço promocional (R$)" hint="Opcional. Aparece como destaque.">
            <input
              value={promoPrice}
              onChange={(event) => setPromoPrice(maskCurrencyInput(event.target.value))}
              inputMode="decimal"
              placeholder="R$ 0,00"
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Parcelas exibidas">
            <select
              value={installmentCount}
              onChange={(event) => setInstallmentCount(Number(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
            >
              {Array.from({ length: 18 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {count}x
                </option>
              ))}
            </select>
            <span className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-100">
              {typeof preview === "string" ? (
                preview
              ) : (
                <>
                  <span className="block font-semibold">{preview?.text}</span>
                  {preview?.totalText ? <span className="block text-emerald-100/85">{preview.totalText}</span> : null}
                  {preview?.note ? <span className="block text-emerald-100/75">{preview.note}</span> : null}
                </>
              )}
            </span>
          </Field>
          <div className="flex flex-col gap-2 self-end">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={showInstallments}
                onChange={(event) => setShowInstallments(event.target.checked)}
              />
              Exibir parcelamento
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={highlight}
                onChange={(event) => setHighlight(event.target.checked)}
              />
              Marcar como destaque
            </label>
          </div>
        </div>
        <Field label="Observação interna" hint="Anotação só para controle interno. Não aparece para o cliente.">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Ex.: revisar fotos antes de divulgar, confirmar brinde, verificar garantia..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
          />
        </Field>
      </div>
      {errorMessage ? (
        <p className="mt-3 text-sm text-rose-300">{errorMessage}</p>
      ) : null}
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
          onClick={submit}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-5 py-2 text-sm font-semibold text-[#1a1206] transition hover:scale-[1.02] disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
    </ModalShell>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-slate-300">
      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
    </label>
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
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0B1220] p-5 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.65)] sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F2D88A]">Catálogo Nobretech</p>
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
