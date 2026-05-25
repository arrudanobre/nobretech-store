import type { PublicCatalogConditionItem } from "@/lib/catalog/types"

const GRADE_BASE_10: Record<string, number> = {
  Lacrado: 10,
  "A+": 9.4,
  A: 8.8,
  "A-": 8.2,
  "B+": 7.4,
  B: 6.5,
}

const GRADE_LABEL: Record<string, string> = {
  Lacrado: "Lacrado",
  "A+": "Excelente",
  A: "Muito bom",
  "A-": "Bom",
  "B+": "Regular",
  B: "Atenção",
}

const GRADE_CONDITION: Record<string, "sealed" | "seminovo" | "used" | "open_box"> = {
  Lacrado: "sealed",
  "A+": "seminovo",
  A: "seminovo",
  "A-": "seminovo",
  "B+": "used",
  B: "used",
}

// Public score scale: 0 to 10, one decimal max.
// Sealed scores 10 but UI must NOT render it as protagonist.
const SCORE_MAX = 10
const SEMINOVO_FLOOR = 5.0

export type ScoreTone = "emerald" | "lime" | "amber" | "orange" | "rose"

export function getScoreTone(score: number | null | undefined): ScoreTone {
  if (score == null) return "amber"
  if (score >= 9) return "emerald"
  if (score >= 8) return "lime"
  if (score >= 7) return "amber"
  if (score >= 6) return "orange"
  return "rose"
}

export function getScoreLabel(score: number | null | undefined): string {
  if (score == null) return "—"
  if (score >= 9) return "Excelente conservação"
  if (score >= 8) return "Muito bom estado"
  if (score >= 7) return "Bom estado"
  if (score >= 6) return "Estado regular"
  return "Atenção ao estado"
}

export function getGradeLabel(grade: string | null | undefined): string {
  if (!grade) return "—"
  return GRADE_LABEL[grade] || grade
}

export function getConditionFromGrade(
  grade: string | null | undefined,
): "sealed" | "seminovo" | "used" | "open_box" {
  if (!grade) return "seminovo"
  return GRADE_CONDITION[grade] || "seminovo"
}

export function getConditionLabel(condition: "sealed" | "seminovo" | "used" | "open_box"): string {
  switch (condition) {
    case "sealed":
      return "Lacrado"
    case "seminovo":
      return "Seminovo"
    case "used":
      return "Usado"
    case "open_box":
      return "Open Box"
  }
}

// pt-BR formatting: 9,4 (comma decimal, one digit). Drops trailing .0 → "10".
export function formatScore10(score: number | null | undefined): string {
  if (score == null) return "—"
  const rounded = Math.round(score * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(1).replace(".", ",")
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

// Deterministic public score on the 0–10 scale. Returns null when grade is
// missing so the UI can hide the score block.
export function deriveNobretechScore(input: {
  grade: string | null | undefined
  batteryHealth: number | null | undefined
  category: string | null | undefined
}): number | null {
  if (!input.grade) return null
  const base = GRADE_BASE_10[input.grade]
  if (base == null) return null

  if (input.grade === "Lacrado") return 10

  const batteryRelevant =
    input.category === "iphone" || input.category === "ipad" || input.category === "applewatch"

  let value = base
  if (batteryRelevant && input.batteryHealth != null) {
    const battery = Math.max(0, Math.min(100, input.batteryHealth))
    value = base + (battery - 85) / 30
  }

  value = Math.max(SEMINOVO_FLOOR, Math.min(SCORE_MAX, value))
  return roundToOneDecimal(value)
}

// Per-item scores for the detail "Condition" card on seminovo/usado.
// Sealed products get descriptive items WITHOUT numeric scores — the UI must
// branch on variant when rendering.
export function buildConditionReviewItems(input: {
  grade: string | null | undefined
  batteryHealth: number | null | undefined
  category: string | null | undefined
}): PublicCatalogConditionItem[] {
  const isSealed = input.grade === "Lacrado"
  const items: PublicCatalogConditionItem[] = []

  if (isSealed) {
    items.push(
      { key: "screen", label: "Tela", description: "Lacrada de fábrica" },
      { key: "body", label: "Estrutura", description: "Lacrada de fábrica" },
      { key: "battery", label: "Bateria", description: "De fábrica" },
      { key: "cameras", label: "Câmeras", description: "Lacradas de fábrica" },
      { key: "functions", label: "Garantia", description: "Oficial Apple" },
    )
    return items
  }

  const score = deriveNobretechScore(input) ?? 8
  const adjustments = {
    screen: 0.4,
    sides: -0.6,
    back: -0.1,
    battery: 0,
    cameras: 0.4,
  }

  items.push({
    key: "screen",
    label: "Tela",
    description: score >= 9 ? "Excelente estado" : score >= 8 ? "Muito boa" : "Marcas leves",
    score: clamp(score + adjustments.screen),
  })
  items.push({
    key: "sides",
    label: "Laterais",
    description: score >= 9 ? "Sem marcas visíveis" : "Marcas leves de uso",
    score: clamp(score + adjustments.sides),
  })
  items.push({
    key: "back",
    label: "Traseira",
    description: score >= 9 ? "Excelente estado" : "Pequenas marcas de uso",
    score: clamp(score + adjustments.back),
  })

  const batteryRelevant =
    input.category === "iphone" || input.category === "ipad" || input.category === "applewatch"
  if (batteryRelevant && input.batteryHealth != null) {
    const battery = Math.max(0, Math.min(100, input.batteryHealth))
    items.push({
      key: "battery",
      label: "Bateria",
      description: `Saúde ${input.batteryHealth}% cadastrada`,
      score: clamp(battery / 10),
    })
  }

  items.push({
    key: "cameras",
    label: "Câmeras",
    description: "Funcionando normalmente",
    score: clamp(score + adjustments.cameras),
  })
  items.push({
    key: "functions",
    label: "Funcionamento geral",
    description: "Sem falhas conhecidas",
    score: clamp(score + 0.2),
  })

  return items
}

function clamp(value: number): number {
  const bounded = Math.max(SEMINOVO_FLOOR, Math.min(SCORE_MAX, value))
  return roundToOneDecimal(bounded)
}
