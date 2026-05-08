import "server-only"

const DEFAULT_MODEL_PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.5": { input: 5, output: 30 },
}

export function formatEstimatedUsd(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)
}

function normalizeModel(value: string | null | undefined) {
  return String(value || "").toLowerCase().trim()
}

function round(value: number, places = 6) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function estimateOpenAICostUsd(model: string | null | undefined, inputTokens: number, outputTokens: number) {
  const inputOverride = Number(process.env.ORION_OPENAI_INPUT_COST_PER_1M)
  const outputOverride = Number(process.env.ORION_OPENAI_OUTPUT_COST_PER_1M)
  const pricing = Number.isFinite(inputOverride) && Number.isFinite(outputOverride)
    ? { input: inputOverride, output: outputOverride }
    : DEFAULT_MODEL_PRICING_PER_1M[normalizeModel(model)]

  if (!pricing) return null
  return round((inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output)
}
