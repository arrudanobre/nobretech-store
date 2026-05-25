"use client"

import { useMemo, useState } from "react"
import { CaretDown, CheckCircle, CreditCard } from "@phosphor-icons/react"
import type { PublicCatalogInstallmentOption } from "@/lib/catalog/types"

type Props = {
  options: PublicCatalogInstallmentOption[]
  fallbackText?: string | null
  fallbackTotalText?: string | null
  fallbackNote?: string | null
}

export function ProductInstallmentOptions({
  options,
  fallbackText,
  fallbackTotalText,
  fallbackNote,
}: Props) {
  const defaultOption = options.at(-1) ?? null
  const [selectedInstallments, setSelectedInstallments] = useState(defaultOption?.installments ?? null)
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = useMemo(
    () => options.find((option) => option.installments === selectedInstallments) ?? defaultOption,
    [defaultOption, options, selectedInstallments],
  )
  const maxInstallments = defaultOption?.installments ?? selectedOption?.installments ?? null

  if (!selectedOption) {
    if (!fallbackText) return null
    return (
      <div className="mt-2 max-w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 text-[12.5px] leading-relaxed text-zinc-300">
        <p>{fallbackText}</p>
        {fallbackTotalText ? <p>{fallbackTotalText}</p> : null}
        {fallbackNote ? <p className="text-[#F2D88A]/85">{fallbackNote}</p> : null}
      </div>
    )
  }

  return (
    <div className="relative mt-3 min-w-0 max-w-full">
      <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              <CreditCard className="h-3.5 w-3.5 text-[#F2D88A]" weight="duotone" />
              {selectedOption.installments === maxInstallments
                ? `Até ${selectedOption.installments}x no cartão`
                : `${selectedOption.installments}x no cartão`}
            </p>
            <p className="mt-1 text-[13.5px] font-medium text-zinc-100">{selectedOption.text}</p>
            <p className="text-[12px] text-zinc-400">{selectedOption.totalText}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#D6A84F]/25 bg-[#D6A84F]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#F2D88A] transition hover:bg-[#D6A84F]/16"
            aria-expanded={isOpen}
          >
            Ver opções
            <CaretDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} weight="bold" />
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-[#F2D88A]/80">Inclui acréscimo da maquininha.</p>
      </div>

      {isOpen ? (
        <div className="mt-2 max-w-full overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#080D16]/95 shadow-[0_22px_62px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="max-h-[360px] overflow-y-auto p-2">
            {options.map((option) => {
              const isSelected = option.installments === selectedOption.installments
              return (
                <button
                  key={option.installments}
                  type="button"
                  onClick={() => {
                    setSelectedInstallments(option.installments)
                    setIsOpen(false)
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    isSelected
                      ? "bg-[#D6A84F]/14 ring-1 ring-[#D6A84F]/35"
                      : "hover:bg-white/[0.055]"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                    isSelected
                      ? "bg-[#D6A84F] text-[#160f05]"
                      : "bg-white/[0.055] text-zinc-300 ring-1 ring-white/[0.08]"
                  }`}>
                    {option.installments}x
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-zinc-100">{option.text}</span>
                    <span className="block text-[11.5px] text-zinc-500">{option.totalText}</span>
                  </span>
                  {isSelected ? (
                    <CheckCircle className="h-4 w-4 shrink-0 text-[#F2D88A]" weight="fill" />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="border-t border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[11.5px] leading-relaxed text-zinc-400">
            Os valores no cartão incluem acréscimo da maquininha.
          </div>
        </div>
      ) : null}
    </div>
  )
}
