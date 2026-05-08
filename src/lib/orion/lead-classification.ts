export type OrionLeadClassification = "hot" | "dormant" | "lost"

const LOST_LEAD_STATUSES = new Set([
  "lost",
  "abandoned",
  "sold",
  "closed",
  "cancelled",
  "canceled",
  "opt_out",
])

const HIGH_INTENT_LEAD_STATUSES = new Set(["hot", "hot_negotiation"])
const DORMANT_LEAD_STATUSES = new Set(["cool", "cold", "cold_lead", "dormant"])

export function normalizeLeadStatus(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase()
}

export function isActionableLead(status: string | null | undefined) {
  return !LOST_LEAD_STATUSES.has(normalizeLeadStatus(status))
}

export function classifyLead(status: string | null | undefined, daysWithoutAction: number): OrionLeadClassification {
  const normalized = normalizeLeadStatus(status)
  if (!isActionableLead(normalized)) return "lost"
  if (HIGH_INTENT_LEAD_STATUSES.has(normalized)) return "hot"
  if (daysWithoutAction > 15 || DORMANT_LEAD_STATUSES.has(normalized)) return "dormant"
  return "dormant"
}

export function publicLeadClassificationLabel(classification: OrionLeadClassification) {
  if (classification === "hot") return "alta intenção"
  if (classification === "dormant") return "reativação elegante"
  return "histórico sem abordagem ativa"
}
