import type { OrionAnalysis, OrionInsight, OrionSnapshot } from "@/lib/orion/types"
import type { OperationalHealthScore } from "./operational-health-engine"
import { clusterByDominantThesis, extractThesis, extractThesisKey } from "./dominant-thesis"

// ─── Executive Insight Deduplication ────────────────────────────────────────
// Clusters insights using the Dominant Thesis Engine.
// Ensures each ORION module shows a completely distinct operational perspective.

/**
 * Remove near-duplicate insights from an array by clustering their dominant thesis.
 * Keeps only the highest-scoring insight from each thesis.
 */
function deduplicateInsightList(
  insights: OrionInsight[],
  snapshot: OrionSnapshot,
  health?: OperationalHealthScore
): OrionInsight[] {
  const clusters = clusterByDominantThesis(insights, snapshot, health)
  return clusters.map((c) => c.primaryInsight)
}

/**
 * Check if an action plan item is semantically redundant with the priority focus thesis.
 */
function actionRedundantWithFocus(actionTitle: string, focusTitle: string, focusReason: string): boolean {
  const actionThesis = extractThesis(actionTitle)
  const focusThesis = extractThesis(`${focusTitle} ${focusReason}`)
  return actionThesis === focusThesis && actionThesis !== "other"
}

/**
 * Deduplicate an entire OrionAnalysis.
 * - Clusters alerts, recommendations, risks, opportunities strictly by Operational Thesis
 * - Removes action plan items whose dominant thesis duplicates the priority focus thesis
 * - Applies Smart Silence: Ensures strict limits so the engine "speaks less"
 */
export function deduplicateAnalysis(analysis: OrionAnalysis, snapshot: OrionSnapshot, health?: OperationalHealthScore): OrionAnalysis {
  // Deduplicate each category by thesis
  const deduplicatedAlerts = deduplicateInsightList(analysis.alerts, snapshot, health)
  const deduplicatedRecommendations = deduplicateInsightList(analysis.recommendations, snapshot, health)
  const deduplicatedRisks = deduplicateInsightList(analysis.risks, snapshot, health)
  const deduplicatedOpportunities = deduplicateInsightList(analysis.opportunities, snapshot, health)

  // Cross-deduplicate globally to ensure we only have 1 card per thesis ACROSS ALL MODULES
  const seenTheses = new Set<string>()

  // Always keep the Priority Focus thesis as reserved so other cards don't repeat it
  const focusThesis = extractThesisKey(`${analysis.priority_focus.title} ${analysis.priority_focus.reason}`)
  seenTheses.add(focusThesis)

  const filterByUniqueThesis = (list: OrionInsight[]) => {
    return list.filter((item) => {
      const thesis = extractThesisKey(`${item.title} ${item.insight} ${item.recommended_action}`)
      if (seenTheses.has(thesis)) return false
      seenTheses.add(thesis)
      return true
    })
  }

  // Filter in order of importance: Alerts > Risks > Recommendations > Opportunities
  const strictAlerts = filterByUniqueThesis(deduplicatedAlerts).slice(0, 2)
  const strictRisks = filterByUniqueThesis(deduplicatedRisks).slice(0, 2)
  const strictRecs = filterByUniqueThesis(deduplicatedRecommendations).slice(0, 2)
  const strictOpps = filterByUniqueThesis(deduplicatedOpportunities).slice(0, 2)

  // Action plan items shouldn't just be the priority focus text rewritten
  const dedupedActions = analysis.daily_action_plan.filter(
    (action) => !actionRedundantWithFocus(action.title, analysis.priority_focus.title, analysis.priority_focus.reason)
  )

  return {
    ...analysis,
    alerts: strictAlerts,
    recommendations: strictRecs,
    risks: strictRisks,
    opportunities: strictOpps,
    daily_action_plan: dedupedActions.slice(0, 3),
  }
}
