import "server-only"

import { pool } from "@/lib/db"
import type {
  WarrantyCalculationMode,
  WarrantyPolicy,
  WarrantyPolicyTerm,
  WarrantyResolution,
  WarrantyResolutionCriteria,
  WarrantyTermType,
} from "./types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type WarrantyPolicyRow = {
  id: string
  company_id: string
  name: string
  product_type: string | null
  product_condition: string | null
  product_origin: string | null
  default_months: number | null
  default_days: number | null
  calculation_mode: WarrantyCalculationMode
  public_label_template: string | null
  internal_description: string | null
  requires_customer_identification: boolean
  applies_to_sale: boolean
  applies_to_catalog: boolean
  applies_to_portal: boolean
  applies_to_documents: boolean
  active: boolean
  effective_from: Date | string
  effective_until: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

type WarrantyPolicyTermRow = {
  id: string
  warranty_policy_id: string
  term_type: WarrantyTermType
  title: string
  body: string
  sort_order: number
  active: boolean
  created_at: Date | string
  updated_at: Date | string
}

function toISOString(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : value
}

function mapPolicy(row: WarrantyPolicyRow): WarrantyPolicy {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    productType: row.product_type,
    productCondition: row.product_condition,
    productOrigin: row.product_origin,
    defaultMonths: row.default_months,
    defaultDays: row.default_days,
    calculationMode: row.calculation_mode,
    publicLabelTemplate: row.public_label_template,
    internalDescription: row.internal_description,
    requiresCustomerIdentification: row.requires_customer_identification,
    appliesToSale: row.applies_to_sale,
    appliesToCatalog: row.applies_to_catalog,
    appliesToPortal: row.applies_to_portal,
    appliesToDocuments: row.applies_to_documents,
    active: row.active,
    effectiveFrom: toISOString(row.effective_from) ?? "",
    effectiveUntil: toISOString(row.effective_until),
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

function mapTerm(row: WarrantyPolicyTermRow): WarrantyPolicyTerm {
  return {
    id: row.id,
    warrantyPolicyId: row.warranty_policy_id,
    termType: row.term_type,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

export async function getWarrantyPolicies(companyId: string): Promise<WarrantyPolicy[]> {
  if (!UUID_RE.test(companyId)) return []

  const result = await pool.query<WarrantyPolicyRow>(
    `SELECT * FROM warranty_policies WHERE company_id = $1 ORDER BY name ASC, created_at ASC`,
    [companyId]
  )
  return result.rows.map(mapPolicy)
}

export async function getActiveWarrantyPolicies(companyId: string): Promise<WarrantyPolicy[]> {
  if (!UUID_RE.test(companyId)) return []

  const result = await pool.query<WarrantyPolicyRow>(
    `SELECT * FROM warranty_policies
      WHERE company_id = $1
        AND active = TRUE
        AND effective_from <= NOW()
        AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY name ASC, created_at ASC`,
    [companyId]
  )
  return result.rows.map(mapPolicy)
}

export async function getWarrantyPolicyById(
  companyId: string,
  policyId: string
): Promise<WarrantyPolicy | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(policyId)) return null

  const result = await pool.query<WarrantyPolicyRow>(
    `SELECT * FROM warranty_policies WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [policyId, companyId]
  )
  const row = result.rows[0]
  return row ? mapPolicy(row) : null
}

export async function getWarrantyPolicyTerms(
  policyId: string,
  options: { onlyActive?: boolean } = {}
): Promise<WarrantyPolicyTerm[]> {
  if (!UUID_RE.test(policyId)) return []

  const result = await pool.query<WarrantyPolicyTermRow>(
    `SELECT * FROM warranty_policy_terms
      WHERE warranty_policy_id = $1
        AND ($2::boolean = FALSE OR active = TRUE)
      ORDER BY sort_order ASC, created_at ASC`,
    [policyId, Boolean(options.onlyActive)]
  )
  return result.rows.map(mapTerm)
}

export async function resolveWarrantyPolicy(
  companyId: string,
  criteria: WarrantyResolutionCriteria = {}
): Promise<WarrantyResolution> {
  if (!UUID_RE.test(companyId)) return null

  const { productType = null, productCondition = null, productOrigin = null, usageContext = null } = criteria

  const result = await pool.query<WarrantyPolicyRow>(
    `SELECT *,
      (CASE WHEN product_type IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN product_condition IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN product_origin IS NOT NULL THEN 1 ELSE 0 END) AS specificity_score
    FROM warranty_policies
    WHERE company_id = $1
      AND active = TRUE
      AND effective_from <= NOW()
      AND (effective_until IS NULL OR effective_until > NOW())
      AND (product_type IS NULL OR product_type = $2)
      AND (product_condition IS NULL OR product_condition = $3)
      AND (product_origin IS NULL OR product_origin = $4)
      AND ($5::text IS NULL OR (
        ($5 = 'sale' AND applies_to_sale = TRUE) OR
        ($5 = 'catalog' AND applies_to_catalog = TRUE) OR
        ($5 = 'portal' AND applies_to_portal = TRUE) OR
        ($5 = 'documents' AND applies_to_documents = TRUE)
      ))
    ORDER BY specificity_score DESC, effective_from DESC, updated_at DESC
    LIMIT 1`,
    [companyId, productType, productCondition, productOrigin, usageContext]
  )

  const policyRow = result.rows[0]
  if (!policyRow) return null

  const policy = mapPolicy(policyRow)
  const terms = await getWarrantyPolicyTerms(policy.id, { onlyActive: true })

  return { policy, terms }
}
