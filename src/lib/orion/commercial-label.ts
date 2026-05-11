export function normalizeCommercialLabel(value?: string | null) {
  const parts = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
  const output: string[] = []
  for (const part of parts) {
    const previous = output[output.length - 1]
    const previousKey = previous?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    const partKey = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    if (previousKey && previousKey === partKey) continue
    output.push(part)
  }
  return output.join(" ")
}
