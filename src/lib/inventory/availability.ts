import { isActiveInventoryStatus } from "@/lib/helpers"

// Single source of truth for "operationally available for sale".
// An inventory unit is sellable only when its normalized status is "active"
// (legacy DB status 'in_stock' also normalizes to active). Everything else —
// sold, returned, under_repair, trade_in_received, reserved — is NOT
// operationally available and must never appear in the reseller portal.
//
// Keep the SQL predicate and the in-memory predicate in sync. Both are exported
// so the ERP and the reseller portal cannot diverge.

export const OPERATIONALLY_AVAILABLE_DB_STATUSES = ["active", "in_stock"] as const

// SQL fragment to be AND-ed into inventory queries. Uses the given table alias.
export function operationallyAvailableSql(alias: string): string {
  return `${alias}.status IN ('active', 'in_stock')`
}

export function isOperationallyAvailable(status?: string | null): boolean {
  return isActiveInventoryStatus(status)
}
