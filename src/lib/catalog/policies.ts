import "server-only"

import { readQueryWithRetry } from "@/lib/db"
import type { CatalogProductKind } from "@/lib/catalog/admin-types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CatalogReadinessRuleSeverity = "block" | "warning"
export type CatalogReadinessRuleOperator = "lt" | "lte" | "eq" | "gte" | "gt"

export type CatalogReadinessRule = {
  id: string
  policyId: string
  ruleKey: string
  severity: CatalogReadinessRuleSeverity
  thresholdOperator: CatalogReadinessRuleOperator | null
  thresholdValue: number | null
  message: string
  active: boolean
}

export type CatalogPublicationPolicy = {
  id: string
  companyId: string
  productType: string | null
  condition: string | null
  requiresPublicPrice: boolean
  requiresRealPhoto: boolean
  requiresReview: boolean
  requiresIncludedItems: boolean
  allowedInventoryStatuses: string[]
  maxProducts: number | null
  defaultAvailabilityLabel: string | null
  active: boolean
  effectiveFrom: string
  effectiveUntil: string | null
  specificity: number
}

export type CatalogPolicyResolutionCriteria = {
  productType?: string | null
  condition?: string | null
}

type PolicyRow = {
  id: string
  company_id: string
  product_type: string | null
  condition: string | null
  requires_public_price: boolean
  requires_real_photo: boolean
  requires_review: boolean
  requires_included_items: boolean
  allowed_inventory_statuses: string[]
  max_products: number | null
  default_availability_label: string | null
  active: boolean
  effective_from: Date | string
  effective_until: Date | string | null
}

type RuleRow = {
  id: string
  catalog_publication_policy_id: string
  rule_key: string
  severity: CatalogReadinessRuleSeverity
  threshold_operator: CatalogReadinessRuleOperator | null
  threshold_value: string | number | null
  message: string
  active: boolean
}

function toISOString(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : value
}

function policySpecificity(row: { product_type: string | null; condition: string | null }): number {
  return (row.product_type !== null ? 1 : 0) + (row.condition !== null ? 1 : 0)
}

function mapPolicy(row: PolicyRow): CatalogPublicationPolicy {
  return {
    id: row.id,
    companyId: row.company_id,
    productType: row.product_type,
    condition: row.condition,
    requiresPublicPrice: row.requires_public_price,
    requiresRealPhoto: row.requires_real_photo,
    requiresReview: row.requires_review,
    requiresIncludedItems: row.requires_included_items,
    allowedInventoryStatuses: row.allowed_inventory_statuses,
    maxProducts: row.max_products,
    defaultAvailabilityLabel: row.default_availability_label,
    active: row.active,
    effectiveFrom: toISOString(row.effective_from) ?? "",
    effectiveUntil: toISOString(row.effective_until),
    specificity: policySpecificity(row),
  }
}

function mapRule(row: RuleRow): CatalogReadinessRule {
  return {
    id: row.id,
    policyId: row.catalog_publication_policy_id,
    ruleKey: row.rule_key,
    severity: row.severity,
    thresholdOperator: row.threshold_operator,
    thresholdValue: row.threshold_value == null ? null : Number(row.threshold_value),
    message: row.message,
    active: row.active,
  }
}

export async function getCatalogPublicationPolicies(
  companyId: string
): Promise<CatalogPublicationPolicy[]> {
  if (!UUID_RE.test(companyId)) return []
  const result = await readQueryWithRetry<PolicyRow>(
    `SELECT * FROM catalog_publication_policies
     WHERE company_id = $1
       AND active = TRUE
       AND effective_from <= NOW()
       AND (effective_until IS NULL OR effective_until > NOW())
     ORDER BY
       (CASE WHEN product_type IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN condition IS NOT NULL THEN 1 ELSE 0 END) DESC,
       effective_from DESC, updated_at DESC`,
    [companyId]
  )
  return result.rows.map(mapPolicy)
}

export function pickPolicyForCriteria(
  policies: CatalogPublicationPolicy[],
  criteria: CatalogPolicyResolutionCriteria = {}
): CatalogPublicationPolicy | null {
  const productType = criteria.productType ?? null
  const condition = criteria.condition ?? null
  for (const policy of policies) {
    const matchesType = policy.productType === null || policy.productType === productType
    const matchesCondition = policy.condition === null || policy.condition === condition
    if (matchesType && matchesCondition) return policy
  }
  return null
}

export async function resolveCatalogPublicationPolicy(
  companyId: string,
  criteria: CatalogPolicyResolutionCriteria = {}
): Promise<CatalogPublicationPolicy | null> {
  const all = await getCatalogPublicationPolicies(companyId)
  return pickPolicyForCriteria(all, criteria)
}

export async function getCatalogReadinessRules(
  policyId: string
): Promise<CatalogReadinessRule[]> {
  if (!UUID_RE.test(policyId)) return []
  const result = await readQueryWithRetry<RuleRow>(
    `SELECT * FROM catalog_readiness_rules
     WHERE catalog_publication_policy_id = $1 AND active = TRUE
     ORDER BY created_at ASC`,
    [policyId]
  )
  return result.rows.map(mapRule)
}

export async function getCatalogReadinessRulesForPolicies(
  policyIds: string[]
): Promise<Map<string, CatalogReadinessRule[]>> {
  const map = new Map<string, CatalogReadinessRule[]>()
  const validIds = policyIds.filter((id) => UUID_RE.test(id))
  if (validIds.length === 0) return map
  const result = await readQueryWithRetry<RuleRow>(
    `SELECT * FROM catalog_readiness_rules
     WHERE catalog_publication_policy_id = ANY($1::uuid[]) AND active = TRUE
     ORDER BY created_at ASC`,
    [validIds]
  )
  for (const row of result.rows) {
    const rule = mapRule(row)
    const existing = map.get(rule.policyId) ?? []
    existing.push(rule)
    map.set(rule.policyId, existing)
  }
  return map
}

export function conditionFromProductKind(kind: CatalogProductKind): string {
  return kind === "sealed" ? "sealed" : "used"
}

export function compareThreshold(
  operator: CatalogReadinessRuleOperator | null,
  threshold: number | null,
  value: number
): boolean {
  if (operator === null || threshold === null) return false
  switch (operator) {
    case "lt":
      return value < threshold
    case "lte":
      return value <= threshold
    case "eq":
      return value === threshold
    case "gte":
      return value >= threshold
    case "gt":
      return value > threshold
  }
}

export type CatalogPublicationPolicyBundle = {
  policy: CatalogPublicationPolicy
  rules: CatalogReadinessRule[]
}

export async function loadCatalogPolicyBundle(
  companyId: string,
  criteria: CatalogPolicyResolutionCriteria = {}
): Promise<CatalogPublicationPolicyBundle | null> {
  const policy = await resolveCatalogPublicationPolicy(companyId, criteria)
  if (!policy) return null
  const rules = await getCatalogReadinessRules(policy.id)
  return { policy, rules }
}
