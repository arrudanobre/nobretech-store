const BLOCK_ORDER = ["Leitura:", "Cálculo:", "Decisão:", "Observação:"]

const FORBIDDEN_PHRASES = [
  "se quiser eu ajudo",
  "se quiser, eu ajudo",
  "se quiser eu monto",
  "se quiser, eu monto",
  "ansiedade",
  "impulso",
  "bonita no papel",
  "não entre em guerra de preço",
  "nao entre em guerra de preco",
  "você não está quebrado",
  "voce nao esta quebrado",
  "o risco humano",
  "o problema emocional",
]

const EXECUTIVE_REPLACEMENTS: Array<[string, string]> = [
  ["segurar caixa", "manter liquidez"],
  ["capital preso", "capital operacional alocado em estoque"],
  ["prudência extrema", "controle operacional"],
  ["prudencia extrema", "controle operacional"],
  ["risco alto", "pressão elevada"],
  ["cuidado", "atenção operacional"],
  ["Cuidado", "Atenção operacional"],
]

function removePhrase(text: string, phrase: string) {
  return text.split(phrase).join("").split(phrase.toUpperCase()).join("")
}

export function removeCoachingLanguage(text: string) {
  return FORBIDDEN_PHRASES.reduce((current, phrase) => removePhrase(current, phrase), text)
}

export function reduceAlarmistFinancialLanguage(text: string) {
  return EXECUTIVE_REPLACEMENTS.reduce((current, [from, to]) => current.split(from).join(to), text)
}

export function compressOperationalAnswer(text: string, maxBlocks = 4) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const selected: string[] = []
  for (const block of BLOCK_ORDER.slice(0, maxBlocks)) {
    const index = lines.findIndex((line) => line === block)
    if (index < 0) continue
    selected.push(block)
    const next = lines[index + 1]
    if (next && !BLOCK_ORDER.some((label) => label === next)) {
      selected.push(next)
    }
  }

  if (selected.length) return selected.join("\n")
  return lines.slice(0, Math.min(lines.length, maxBlocks * 2)).join("\n")
}

export function normalizeExecutiveTone(text: string) {
  return compressOperationalAnswer(reduceAlarmistFinancialLanguage(removeCoachingLanguage(text)))
}
