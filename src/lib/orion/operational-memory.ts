import "server-only"

import { pool } from "@/lib/db"
import type { OrionAnalysis, OrionInsight } from "@/lib/orion/types"

// ─── Operational Memory ─────────────────────────────────────────────────────
// Prevents the ORION from repeating the exact same recommendation day after day.
// Queries recent analysis logs to detect previously emitted insights.

const MEMORY_HOURS_DEFAULT = 48

export type RecentInsightRecord = {
  hash: string
  title: string
  category: string
  createdAt: string
}

/**
 * Create a simple hash for an insight based on normalized key fields.
 */
function insightHash(title: string, category: string): string {
  const normalized = `${title} ${category}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  // Simple fast hash — not cryptographic, just for dedup comparison
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return `im${Math.abs(hash).toString(36)}`
}

/**
 * Extract insight records from a saved analysis JSON.
 */
function extractInsightsFromAnalysis(analysis: OrionAnalysis | null): RecentInsightRecord[] {
  if (!analysis) return []
  const records: RecentInsightRecord[] = []
  const allInsights: OrionInsight[] = [
    ...(analysis.alerts || []),
    ...(analysis.recommendations || []),
    ...(analysis.risks || []),
    ...(analysis.opportunities || []),
  ]
  for (const insight of allInsights) {
    records.push({
      hash: insightHash(insight.title, insight.category),
      title: insight.title,
      category: insight.category,
      createdAt: "",
    })
  }
  // Also include daily action plan
  for (const action of analysis.daily_action_plan || []) {
    records.push({
      hash: insightHash(action.title, action.area),
      title: action.title,
      category: action.area,
      createdAt: "",
    })
  }
  return records
}

/**
 * Fetch insights that ORION has recommended in recent analysis logs.
 * Uses the orion_ai_analysis_logs table.
 */
export async function getRecentInsights(
  companyId: string,
  hoursBack = MEMORY_HOURS_DEFAULT
): Promise<RecentInsightRecord[]> {
  try {
    const result = await pool.query<{
      response_json: OrionAnalysis | null
      created_at: string
    }>(
      `
        SELECT response_json, created_at
        FROM orion_ai_analysis_logs
        WHERE company_id = $1::uuid
          AND status IN ('success', 'local')
          AND analysis_type = 'executive'
          AND created_at >= NOW() - ($2::text || ' hours')::interval
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [companyId, hoursBack]
    )

    const all: RecentInsightRecord[] = []
    for (const row of result.rows) {
      const extracted = extractInsightsFromAnalysis(row.response_json)
      for (const record of extracted) {
        record.createdAt = row.created_at
        all.push(record)
      }
    }
    return all
  } catch {
    // Table might not exist yet — graceful degradation
    return []
  }
}

/**
 * Count how many times each insight hash appears in recent history.
 */
function countOccurrences(recent: RecentInsightRecord[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const record of recent) {
    counts.set(record.hash, (counts.get(record.hash) || 0) + 1)
  }
  return counts
}

/**
 * Enrich insights with memory context.
 * - If an insight was already emitted 3+ times recently, lower its priority.
 * - If emitted 1-2 times, keep the insight unchanged to avoid visible repetition markers.
 */
function applyMemoryToInsight(
  insight: OrionInsight,
  occurrences: number
): OrionInsight {
  if (occurrences >= 3) {
    // Demote priority if repeatedly shown
    const demotedPriority = insight.priority === "critical"
      ? "high"
      : insight.priority === "high"
        ? "medium"
        : insight.priority
    return {
      ...insight,
      priority: demotedPriority as OrionInsight["priority"],
      action_priority: demotedPriority as OrionInsight["action_priority"],
    }
  }
  return insight
}

/**
 * Apply operational memory to an entire analysis.
 * Modifies insights based on what was previously recommended.
 */
export function applyOperationalMemory(
  analysis: OrionAnalysis,
  recentInsights: RecentInsightRecord[]
): OrionAnalysis {
  if (!recentInsights.length) return analysis

  const occurrences = countOccurrences(recentInsights)

  const applyToList = (insights: OrionInsight[]): OrionInsight[] => {
    return insights.map((insight) => {
      const hash = insightHash(insight.title, insight.category)
      const count = occurrences.get(hash) || 0
      return applyMemoryToInsight(insight, count)
    })
  }

  return {
    ...analysis,
    alerts: applyToList(analysis.alerts),
    recommendations: applyToList(analysis.recommendations),
    risks: applyToList(analysis.risks),
    opportunities: applyToList(analysis.opportunities),
  }
}
