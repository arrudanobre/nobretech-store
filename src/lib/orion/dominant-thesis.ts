import type { OrionInsight, OrionPriority, OrionSnapshot } from "@/lib/orion/types"
import { calculateOperationalHealth, type OperationalHealthScore } from "./operational-health-engine"

export type OperationalThesis =
  | "cashflow"
  | "inventory"
  | "crm"
  | "marketing"
  | "pricing"
  | "margin"
  | "operations"
  | "data_quality"
  | "growth"
  | "risk"
  | "other"

export type ThesisCluster = {
  thesis: OperationalThesis
  primaryInsight: OrionInsight
  supportingInsights: OrionInsight[]
  score: number
}

const priorityWeight: Record<OrionPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Identify the dominant operational thesis from a block of text.
 */
export function extractThesis(text: string): OperationalThesis {
  const normalized = normalize(text)

  if (/\b(caixa|liquidez|congelar|despesa|gasto|cashflow|pagamento|recebimento|recebiveis|pagar|vencid|reconciliad)\b/.test(normalized)) {
    return "cashflow"
  }
  if (/\b(estoque|encalhe|parado|prateleira|inventory|giro|quantidade|unidade)\b/.test(normalized)) {
    return "inventory"
  }
  if (/\b(campanha|anuncio|marketing|trafego|roi|clique|impressoes|criativo)\b/.test(normalized)) {
    return "marketing"
  }
  if (/\b(preco|desconto|promocao|baixar|valor|oferta|pricing)\b/.test(normalized)) {
    return "pricing"
  }
  if (/\b(margem|lucro|margin|rentabilidade|custo|markup)\b/.test(normalized)) {
    return "margin"
  }
  if (/\b(lead|crm|contato|funil|atendimento|follow up|followup|cliente quente|cliente morno)\b/.test(normalized)) {
    return "crm"
  }
  if (/\b(cadastro|dado|falta|sistema|incompleto|divergente|data|status|quality)\b/.test(normalized)) {
    return "data_quality"
  }
  if (/\b(operacao|gargalo|processo|operations|reparo|assistencia|devolucao)\b/.test(normalized)) {
    return "operations"
  }
  if (/\b(crescimento|expansao|growth|escala|novo)\b/.test(normalized)) {
    return "growth"
  }
  if (/\b(risco|fraude|alerta|critico|perda|risk)\b/.test(normalized)) {
    return "risk"
  }

  return "other"
}

function insightScore(insight: OrionInsight): number {
  const priority = priorityWeight[insight.priority] || 1
  const confidence = insight.confidence_score || 0.5
  const hasAction = insight.recommended_action.length > 20 ? 1 : 0
  return (priority * 3) + (confidence * 2) + (hasAction * 1)
}

function stableTextHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function extractThesisKey(text: string): string {
  const thesis = extractThesis(text)
  if (thesis !== "other") return thesis
  const normalized = normalize(text)
    .split(" ")
    .filter((token) => token.length > 3)
    .slice(0, 12)
    .join(" ")
  return `other:${stableTextHash(normalized)}`
}

/**
 * Cluster an array of insights purely by their Operational Thesis.
 * It strictly prevents the same thesis from duplicating into multiple primary cards.
 * Also caps cashflow severity if operational health is not critical.
 */
export function clusterByDominantThesis(
  insights: OrionInsight[],
  snapshot: OrionSnapshot,
  precomputedHealth?: OperationalHealthScore
): ThesisCluster[] {
  if (!insights.length) return []

  const health = precomputedHealth || calculateOperationalHealth(snapshot)

  const thesisMap = new Map<string, { thesis: OperationalThesis; members: OrionInsight[] }>()

  for (const insight of insights) {
    const combinedText = `${insight.title} ${insight.insight} ${insight.recommended_action}`
    const thesis = extractThesis(combinedText)
    const key = extractThesisKey(combinedText)
    const existing = thesisMap.get(key) || { thesis, members: [] }
    existing.members.push(insight)
    thesisMap.set(key, existing)
  }

  const clusters: ThesisCluster[] = []

  for (const { thesis, members } of Array.from(thesisMap.values())) {
    members.sort((a, b) => insightScore(b) - insightScore(a))
    const primaryInsight = { ...members[0] }
    const supportingInsights = members.slice(1)

    // Downgrade cashflow severity if operational health is not critical
    if (thesis === "cashflow" && health.level !== "critical" && primaryInsight.priority === "critical") {
      primaryInsight.priority = health.level === "attention" ? "high" : "medium"
    }

    clusters.push({
      thesis,
      primaryInsight,
      supportingInsights,
      score: insightScore(primaryInsight),
    })
  }

  // Sort clusters by the highest score so the most critical thesis appears first
  return clusters.sort((a, b) => b.score - a.score)
}
