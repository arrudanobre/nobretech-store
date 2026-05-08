// ─── Operational Inventory Filter ───────────────────────────────────────────
// Single source of truth for which inventory items are operationally available.
// Every ORION module must use these constants/functions instead of inline arrays.

/**
 * Statuses that represent inventory truly available for sale.
 * "active" = fully cataloged item ready to sell.
 * "in_stock" = legacy status, equivalent to active.
 */
export const OPERATIONAL_STATUSES = new Set(["active", "in_stock"]) as ReadonlySet<string>

/**
 * Statuses that must NEVER appear in recommendations, plans, or chat.
 */
export const EXCLUDED_STATUSES = new Set([
  "sold",
  "returned",
  "under_repair",
  "cancelled",
  "inactive",
  "archived",
  "hidden",
]) as ReadonlySet<string>

/**
 * Statuses that are "in limbo" — not yet sellable, not explicitly excluded.
 * pending = incomplete catalog entry.
 * trade_in_received = needs evaluation before selling.
 * reserved = reserved for a specific customer.
 */
export const LIMBO_STATUSES = new Set([
  "pending",
  "trade_in_received",
  "reserved",
]) as ReadonlySet<string>

/**
 * Check whether an inventory item is operationally available for sale.
 * @param status - The item's current status.
 * @param opts.includeReserved - Whether to treat reserved items as available (default: false).
 */
export function isOperationallyAvailable(
  status: string,
  opts?: { includeReserved?: boolean }
): boolean {
  const normalized = (status || "").trim().toLowerCase()
  if (OPERATIONAL_STATUSES.has(normalized)) return true
  if (opts?.includeReserved && normalized === "reserved") return true
  return false
}

/**
 * Filter an array of items to only those operationally available.
 */
export function filterOperationalStock<T extends { status: string }>(
  items: T[],
  opts?: { includeReserved?: boolean }
): T[] {
  return items.filter((item) => isOperationallyAvailable(item.status, opts))
}

/**
 * Check if a status explicitly means the item is unavailable (sold, returned, etc.).
 */
export function isExplicitlyUnavailable(status: string): boolean {
  return EXCLUDED_STATUSES.has((status || "").trim().toLowerCase())
}

/**
 * Score penalty for unavailable items in the scoring engine.
 * Sold/returned items get a massive penalty to prevent hallucinated recommendations.
 */
export function statusScorePenalty(status: string): number {
  const normalized = (status || "").trim().toLowerCase()
  if (EXCLUDED_STATUSES.has(normalized)) return -200
  if (normalized === "reserved") return -30
  if (LIMBO_STATUSES.has(normalized)) return -15
  return 0
}

/**
 * Score bonus for operationally available items.
 */
export function statusScoreBonus(status: string): number {
  return isOperationallyAvailable(status) ? 30 : 0
}

/**
 * Build a SQL IN clause for operational statuses.
 * Returns the fragment: `('active', 'in_stock')`
 */
export function operationalStatusSQLList(): string {
  return `('active', 'in_stock')`
}

/**
 * Confidence factor based on inventory item data completeness.
 * Returns a value from 0 to 1.
 */
export function inventoryDataConfidence(item: {
  purchasePrice?: number
  suggestedPrice?: number
  status?: string
  daysInStock?: number
}): number {
  let score = 0
  let factors = 0

  // Status is valid operational
  factors++
  if (isOperationallyAvailable(item.status || "")) score++

  // Has purchase price
  factors++
  if ((item.purchasePrice || 0) > 0) score++

  // Has suggested price
  factors++
  if ((item.suggestedPrice || 0) > 0) score++

  // Days in stock is known
  factors++
  if (item.daysInStock !== undefined && item.daysInStock >= 0) score++

  return factors > 0 ? score / factors : 0
}
