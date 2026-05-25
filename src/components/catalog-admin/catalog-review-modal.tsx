"use client"

import { useMemo, useState } from "react"
import type { CatalogAdminItem, CatalogReviewRecord } from "@/lib/catalog/admin-types"
import { formatScore10 } from "@/lib/catalog/score"

type ReviewKey =
  | "screen"
  | "sides"
  | "back"
  | "battery"
  | "cameras"
  | "biometrics"
  | "audio"
  | "connectivity"
  | "general"

type ReviewOption = {
  id: string
  label: string
  score: number | null
  tone?: "neutral" | "warning" | "danger"
  note?: string
}

type ReviewSection = {
  key: ReviewKey
  label: string
  question: string
  notePlaceholder: string
  weight: number
  options: ReviewOption[]
}

const SECTIONS: ReviewSection[] = [
  {
    key: "screen",
    label: "Tela",
    question: "Como está a tela?",
    notePlaceholder: "Observação sobre a tela",
    weight: 2,
    options: [
      { id: "perfect", label: "Perfeita", score: 10 },
      { id: "tiny", label: "Riscos quase imperceptíveis", score: 8.8 },
      { id: "light", label: "Riscos leves", score: 8.0 },
      { id: "visible", label: "Riscos visíveis", score: 7.0, tone: "warning" },
      { id: "defect", label: "Defeito", score: 5.0, tone: "danger", note: "Trinca, mancha ou defeito informado." },
    ],
  },
  {
    key: "sides",
    label: "Laterais",
    question: "Como estão as laterais?",
    notePlaceholder: "Observação sobre laterais",
    weight: 1,
    options: [
      { id: "clean", label: "Sem marcas", score: 10 },
      { id: "light", label: "Marcas leves", score: 8.8 },
      { id: "moderate", label: "Marcas moderadas", score: 7.8 },
      { id: "strong", label: "Marcas fortes", score: 6.5, tone: "warning" },
      { id: "defect", label: "Dano estrutural", score: 5.0, tone: "danger" },
    ],
  },
  {
    key: "back",
    label: "Traseira",
    question: "Como está a traseira?",
    notePlaceholder: "Observação sobre traseira",
    weight: 1,
    options: [
      { id: "clean", label: "Sem marcas", score: 10 },
      { id: "light", label: "Marcas leves", score: 8.8 },
      { id: "moderate", label: "Marcas moderadas", score: 7.8 },
      { id: "defect", label: "Trincada ou muito marcada", score: 5.0, tone: "danger" },
    ],
  },
  {
    key: "battery",
    label: "Bateria",
    question: "Qual o estado da bateria?",
    notePlaceholder: "Ex.: saude 86%, bateria trocada, peca original...",
    weight: 1.5,
    options: [
      { id: "excellent", label: "Excelente", score: 10 },
      { id: "good", label: "Boa", score: 9 },
      { id: "ok", label: "Aceitável", score: 8 },
      { id: "attention", label: "Precisa atenção", score: 6.5, tone: "warning" },
      { id: "unknown", label: "Não informado", score: null, tone: "warning" },
    ],
  },
  {
    key: "cameras",
    label: "Câmeras",
    question: "As câmeras estão funcionando normalmente?",
    notePlaceholder: "Observação sobre câmeras",
    weight: 1.5,
    options: [
      { id: "normal", label: "Tudo normal", score: 10 },
      { id: "cosmetic", label: "Com observação estética", score: 8.5 },
      { id: "limited", label: "Alguma limitação", score: 7.0, tone: "warning" },
      { id: "defect", label: "Defeito em câmera", score: 5.0, tone: "danger" },
    ],
  },
  {
    key: "biometrics",
    label: "Face ID / Touch ID",
    question: "Biometria está funcionando?",
    notePlaceholder: "Observação sobre biometria",
    weight: 1,
    options: [
      { id: "normal", label: "Funcionando", score: 10 },
      { id: "na", label: "Não se aplica", score: null },
      { id: "untested", label: "Não testado", score: null, tone: "warning" },
      { id: "defect", label: "Com defeito", score: 5.0, tone: "danger" },
    ],
  },
  {
    key: "audio",
    label: "Áudio e microfone",
    question: "Áudio e microfone estão normais?",
    notePlaceholder: "Observação sobre áudio ou microfone",
    weight: 0.75,
    options: [
      { id: "normal", label: "Tudo normal", score: 10 },
      { id: "minor", label: "Pequena observação", score: 8.5 },
      { id: "limited", label: "Alguma limitação", score: 7.0, tone: "warning" },
      { id: "defect", label: "Defeito", score: 5.0, tone: "danger" },
    ],
  },
  {
    key: "connectivity",
    label: "Conectividade",
    question: "Wi-Fi, Bluetooth e sinal estão normais?",
    notePlaceholder: "Observação sobre conectividade",
    weight: 0.75,
    options: [
      { id: "normal", label: "Tudo normal", score: 10 },
      { id: "minor", label: "Com observação", score: 8.5 },
      { id: "limited", label: "Alguma limitação", score: 7.0, tone: "warning" },
      { id: "defect", label: "Defeito", score: 5.0, tone: "danger" },
    ],
  },
  {
    key: "general",
    label: "Funcionamento geral",
    question: "Funcionamento geral do aparelho",
    notePlaceholder: "Observação geral do funcionamento",
    weight: 1.5,
    options: [
      { id: "excellent", label: "Excelente", score: 10 },
      { id: "good", label: "Bom", score: 8.8 },
      { id: "attention", label: "Exige atenção", score: 7.8, tone: "warning" },
      { id: "limited", label: "Limitação importante", score: 6.5, tone: "warning" },
      { id: "defect", label: "Defeito relevante", score: 5.0, tone: "danger" },
    ],
  },
]

const SCORE_KEYS: Record<ReviewKey, keyof CatalogReviewRecord> = {
  screen: "screen_score",
  sides: "sides_score",
  back: "back_score",
  battery: "battery_score",
  cameras: "cameras_score",
  biometrics: "biometrics_score",
  audio: "audio_score",
  connectivity: "connectivity_score",
  general: "general_score",
}

const NOTE_KEYS: Record<ReviewKey, keyof CatalogReviewRecord> = {
  screen: "screen_notes",
  sides: "sides_notes",
  back: "back_notes",
  battery: "battery_notes",
  cameras: "cameras_notes",
  biometrics: "biometrics_notes",
  audio: "audio_notes",
  connectivity: "connectivity_notes",
  general: "general_notes",
}

type Props = {
  item: CatalogAdminItem
  onClose: () => void
  onSaved: () => void
}

function scoreFromBatteryHealth(value: number | null): number | null {
  if (value == null) return null
  if (value >= 95) return 10
  if (value >= 90) return 9
  if (value >= 80) return 8
  return 6.5
}

function nearestOption(section: ReviewSection, score: number | null | undefined): string {
  if (score == null) return ""
  let best = section.options.find((option) => option.score != null)?.id || ""
  let bestDistance = Number.POSITIVE_INFINITY
  for (const option of section.options) {
    if (option.score == null) continue
    const distance = Math.abs(option.score - score)
    if (distance < bestDistance) {
      bestDistance = distance
      best = option.id
    }
  }
  return best
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}

function calculateOverall(scores: Record<ReviewKey, number | null>): number | null {
  let totalWeight = 0
  let weighted = 0
  for (const section of SECTIONS) {
    const score = scores[section.key]
    if (score == null) continue
    totalWeight += section.weight
    weighted += score * section.weight
  }
  if (totalWeight === 0) return null
  const raw = weighted / totalWeight
  return roundScore(Math.min(10, raw))
}

function optionClass(option: ReviewOption, active: boolean) {
  if (active) {
    if (option.tone === "danger") return "border-rose-300/55 bg-rose-500/20 text-rose-50"
    if (option.tone === "warning") return "border-amber-300/55 bg-amber-500/20 text-amber-50"
    return "border-emerald-300/45 bg-emerald-500/15 text-emerald-50"
  }
  return "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.08]"
}

const OPTION_LABELS = SECTIONS.flatMap((section) => section.options.flatMap((option) => [option.label, option.note]))
  .filter(Boolean) as string[]

function cleanLegacyNote(value: string | null): string {
  if (!value) return ""
  let next = value.trim()
  let changed = true
  while (changed) {
    changed = false
    for (const label of OPTION_LABELS) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const cleaned = next
        .replace(new RegExp(`^${escaped}\\s*-\\s*`, "i"), "")
        .replace(new RegExp(`^${escaped}\\s*$`, "i"), "")
        .trim()
      if (cleaned !== next) {
        next = cleaned
        changed = true
      }
    }
  }
  return next
}

export function CatalogReviewModal({ item, onClose, onSaved }: Props) {
  const isSealed = item.productKind === "sealed"
  const review = item.review
  const [selected, setSelected] = useState<Record<ReviewKey, string>>(() => {
    const initial = {} as Record<ReviewKey, string>
    for (const section of SECTIONS) {
      const score = review ? (review[SCORE_KEYS[section.key]] as number | null) : null
      initial[section.key] = nearestOption(section, score)
    }
    return initial
  })
  const [notes, setNotes] = useState<Record<ReviewKey, string>>(() => {
    const initial = {} as Record<ReviewKey, string>
    for (const section of SECTIONS) {
      initial[section.key] = cleanLegacyNote(review ? (review[NOTE_KEYS[section.key]] as string | null) ?? "" : "")
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const scores = useMemo(() => {
    const next = {} as Record<ReviewKey, number | null>
    for (const section of SECTIONS) {
      if (section.key === "battery" && item.batteryHealth != null) {
        next.battery = scoreFromBatteryHealth(item.batteryHealth)
        continue
      }
      const option = section.options.find((entry) => entry.id === selected[section.key])
      next[section.key] = option?.score ?? null
    }
    return next
  }, [item.batteryHealth, selected])

  const liveOverall = calculateOverall(scores)
  const hasBlockingDefect = Object.values(scores).some((score) => score != null && score <= 5)
  const hasWarnings = SECTIONS.some((section) => {
    const option = section.options.find((entry) => entry.id === selected[section.key])
    return option?.tone === "warning"
  }) || (item.batteryHealth != null && item.batteryHealth < 80)

  if (isSealed) {
    return (
      <ModalShell title="Avaliação comercial" onClose={onClose}>
        <div className="rounded-2xl border border-[#D6A84F]/30 bg-[#D6A84F]/10 p-4 text-sm leading-relaxed text-[#F5DC97]">
          <p className="font-semibold text-white">Produto lacrado de fábrica.</p>
          <p className="mt-1">A avaliação detalhada não é necessária para publicar este item.</p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.1]"
          >
            Fechar
          </button>
        </div>
      </ModalShell>
    )
  }

  async function submit() {
    setSaving(true)
    setErrorMessage(null)
    try {
      const payload = {
        inventoryItemId: item.inventoryId,
        productKind: item.productKind,
        overallScore: liveOverall,
        scores,
        notes: SECTIONS.reduce<Record<string, string | null>>((acc, section) => {
          const note = notes[section.key]?.trim()
          acc[section.key] = note ? cleanLegacyNote(note) : null
          return acc
        }, {}),
      }
      const response = await fetch("/api/catalog/reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { error?: { message: string } | null }
      if (!response.ok) throw new Error(result.error?.message || "Erro ao salvar avaliação")
      onSaved()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao salvar avaliação")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Avaliação comercial" onClose={onClose}>
      <div className="sticky top-0 z-10 rounded-2xl border border-emerald-400/25 bg-[#082B2B]/95 p-4 text-sm text-emerald-100 shadow-[0_14px_40px_rgba(0,0,0,0.28)] backdrop-blur">
        <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">Score calculado</span>
        <p className="mt-0.5 text-xl font-semibold text-white">
          {liveOverall != null ? `${formatScore10(liveOverall)}/10` : "—"}
        </p>
        <p className="text-[11px] text-slate-300">
          O sistema calcula a nota pelas respostas, sempre na escala de 0 a 10.
        </p>
        {hasBlockingDefect ? (
          <p className="mt-2 rounded-xl border border-rose-400/25 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
            Há um defeito informado na avaliação comercial.
          </p>
        ) : hasWarnings ? (
          <p className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
            Existe ponto de atenção. Revise a observação antes de publicar.
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {SECTIONS.map((section) => {
          const selectedOption = selected[section.key]
          const batteryHealth = section.key === "battery" ? item.batteryHealth : null
          const automaticBattery = batteryHealth != null
          return (
            <section key={section.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{section.label}</h3>
                  <p className="text-xs text-slate-400">{section.question}</p>
                </div>
                <span className="text-xs font-semibold text-slate-200">
                  {scores[section.key] != null ? `${formatScore10(scores[section.key])}/10` : "Não entra na média"}
                </span>
              </div>

              {automaticBattery ? (
                <div className="mt-3 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
                  Saúde cadastrada: {batteryHealth}%. Nota de bateria calculada automaticamente.
                  {batteryHealth < 80 ? " Atenção: bateria abaixo de 80%." : ""}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {section.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelected((current) => ({ ...current, [section.key]: option.id }))}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${optionClass(option, selectedOption === option.id)}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                value={notes[section.key]}
                onChange={(event) => setNotes((current) => ({ ...current, [section.key]: event.target.value }))}
                placeholder={section.notePlaceholder}
                rows={1}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-300/45 focus:ring-2 focus:ring-blue-400/15"
              />
            </section>
          )
        })}
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
          onClick={submit}
          disabled={saving || liveOverall == null}
          className="rounded-xl bg-gradient-to-r from-[#D6A84F] to-[#E7C16A] px-5 py-2 text-sm font-semibold text-[#1a1206] transition hover:scale-[1.02] disabled:opacity-50"
        >
          Salvar avaliação
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
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0B1220] p-5 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.65)] sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F2D88A]">Laudo comercial</p>
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
