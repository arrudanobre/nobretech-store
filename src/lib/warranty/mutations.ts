import "server-only"

import { pool } from "@/lib/db"
import { buildAuditMetadata, recordCompanySettingsAuditLog, rowToSnapshot } from "@/lib/company-settings/audit"
import type {
  WarrantyActor,
  WarrantyCalculationMode,
  WarrantyMutationResult,
  WarrantyPolicy,
  WarrantyPolicyInput,
  WarrantyPolicyTerm,
  WarrantyPolicyTermInput,
  WarrantyTermType,
} from "./types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CALCULATION_MODES: WarrantyCalculationMode[] = ["calendar_months", "fixed_days", "manual_dates"]

const TERM_TYPES: WarrantyTermType[] = [
  "coverage",
  "exclusion",
  "assistance",
  "refund_exchange",
  "customer_responsibility",
  "legal_note",
  "other",
]

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

function nullIfEmpty(value: string): string | null {
  const trimmed = clean(value)
  return trimmed ? trimmed : null
}

function parseIntOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function toISOString(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function buildError<T>(error: string, fieldErrors?: Record<string, string>): WarrantyMutationResult<T> {
  return { ok: false, error, fieldErrors }
}

function databaseError<T>(err: unknown): WarrantyMutationResult<T> {
  const pgError = err as { code?: string; constraint?: string; message?: string }

  if (pgError.code === "23505") {
    if (pgError.constraint === "idx_warranty_policies_unique_active_scope") {
      return buildError("Ja existe uma politica ativa com este escopo (tipo, condicao e origem).")
    }
  }

  return buildError(pgError.message || "Nao foi possivel salvar a politica de garantia.")
}

function mapPolicyRow(row: Record<string, unknown>): WarrantyPolicy {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    productType: (row.product_type as string | null) ?? null,
    productCondition: (row.product_condition as string | null) ?? null,
    productOrigin: (row.product_origin as string | null) ?? null,
    defaultMonths: (row.default_months as number | null) ?? null,
    defaultDays: (row.default_days as number | null) ?? null,
    calculationMode: row.calculation_mode as WarrantyCalculationMode,
    publicLabelTemplate: (row.public_label_template as string | null) ?? null,
    internalDescription: (row.internal_description as string | null) ?? null,
    requiresCustomerIdentification: Boolean(row.requires_customer_identification),
    appliesToSale: Boolean(row.applies_to_sale),
    appliesToCatalog: Boolean(row.applies_to_catalog),
    appliesToPortal: Boolean(row.applies_to_portal),
    appliesToDocuments: Boolean(row.applies_to_documents),
    active: Boolean(row.active),
    effectiveFrom: toISOString(row.effective_from) ?? "",
    effectiveUntil: toISOString(row.effective_until),
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

function mapTermRow(row: Record<string, unknown>): WarrantyPolicyTerm {
  return {
    id: row.id as string,
    warrantyPolicyId: row.warranty_policy_id as string,
    termType: row.term_type as WarrantyTermType,
    title: row.title as string,
    body: row.body as string,
    sortOrder: Number(row.sort_order),
    active: Boolean(row.active),
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

type PolicyValidated = {
  name: string
  productType: string | null
  productCondition: string | null
  productOrigin: string | null
  defaultMonths: number | null
  defaultDays: number | null
  calculationMode: WarrantyCalculationMode
  publicLabelTemplate: string | null
  internalDescription: string | null
  requiresCustomerIdentification: boolean
  appliesToSale: boolean
  appliesToCatalog: boolean
  appliesToPortal: boolean
  appliesToDocuments: boolean
  effectiveFrom: string
  effectiveUntil: string | null
}

function validatePolicy(
  input: WarrantyPolicyInput
): { ok: true; values: PolicyValidated } | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const name = clean(input.name)
  const calculationMode = clean(input.calculationMode) as WarrantyCalculationMode
  const effectiveFrom = clean(input.effectiveFrom)
  const effectiveUntil = clean(input.effectiveUntil)
  const defaultMonths = parseIntOrNull(input.defaultMonths)
  const defaultDays = parseIntOrNull(input.defaultDays)

  if (!name) errors.name = "Informe o nome da politica."
  if (!CALCULATION_MODES.includes(calculationMode)) errors.calculationMode = "Modo de calculo invalido."
  if (!effectiveFrom) errors.effectiveFrom = "Informe a vigencia inicial."
  if (effectiveFrom && Number.isNaN(Date.parse(effectiveFrom))) errors.effectiveFrom = "Data inicial invalida."
  if (effectiveUntil && Number.isNaN(Date.parse(effectiveUntil))) errors.effectiveUntil = "Data final invalida."
  if (effectiveFrom && effectiveUntil && Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) {
    errors.effectiveUntil = "Vigencia final deve ser posterior a inicial."
  }
  if (calculationMode === "calendar_months" && defaultMonths !== null && defaultMonths < 0) {
    errors.defaultMonths = "Prazo em meses nao pode ser negativo."
  }
  if (calculationMode === "fixed_days" && defaultDays !== null && defaultDays < 0) {
    errors.defaultDays = "Prazo em dias nao pode ser negativo."
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Revise os campos da politica de garantia.", fieldErrors: errors }
  }

  return {
    ok: true,
    values: {
      name,
      productType: nullIfEmpty(input.productType),
      productCondition: nullIfEmpty(input.productCondition),
      productOrigin: nullIfEmpty(input.productOrigin),
      defaultMonths,
      defaultDays,
      calculationMode,
      publicLabelTemplate: nullIfEmpty(input.publicLabelTemplate),
      internalDescription: nullIfEmpty(input.internalDescription),
      requiresCustomerIdentification: Boolean(input.requiresCustomerIdentification),
      appliesToSale: Boolean(input.appliesToSale),
      appliesToCatalog: Boolean(input.appliesToCatalog),
      appliesToPortal: Boolean(input.appliesToPortal),
      appliesToDocuments: Boolean(input.appliesToDocuments),
      effectiveFrom,
      effectiveUntil: effectiveUntil || null,
    },
  }
}

type TermValidated = { termType: WarrantyTermType; title: string; body: string; sortOrder: number }

function validateTerm(
  input: WarrantyPolicyTermInput
): { ok: true; values: TermValidated } | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const termType = clean(input.termType) as WarrantyTermType
  const title = clean(input.title)
  const body = clean(input.body)
  const sortOrder =
    typeof input.sortOrder === "number"
      ? Math.trunc(input.sortOrder)
      : parseInt(String(input.sortOrder), 10) || 0

  if (!TERM_TYPES.includes(termType)) errors.termType = "Tipo de clausula invalido."
  if (!title) errors.title = "Informe o titulo da clausula."
  if (!body) errors.body = "Informe o texto da clausula."

  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Revise os campos da clausula de garantia.", fieldErrors: errors }
  }

  return { ok: true, values: { termType, title, body, sortOrder } }
}

export async function createWarrantyPolicy(
  companyId: string,
  actor: WarrantyActor,
  input: WarrantyPolicyInput
): Promise<WarrantyMutationResult<WarrantyPolicy>> {
  if (!UUID_RE.test(companyId)) return buildError("Empresa invalida.")

  const validation = validatePolicy(input)
  if (!validation.ok) return buildError(validation.error, validation.fieldErrors)
  const { values } = validation

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const insertResult = await client.query<Record<string, unknown>>(
      `INSERT INTO warranty_policies (
        company_id, name, product_type, product_condition, product_origin,
        default_months, default_days, calculation_mode, public_label_template,
        internal_description, requires_customer_identification,
        applies_to_sale, applies_to_catalog, applies_to_portal, applies_to_documents,
        active, effective_from, effective_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE, $16, $17)
      RETURNING *`,
      [
        companyId, values.name, values.productType, values.productCondition, values.productOrigin,
        values.defaultMonths, values.defaultDays, values.calculationMode, values.publicLabelTemplate,
        values.internalDescription, values.requiresCustomerIdentification,
        values.appliesToSale, values.appliesToCatalog, values.appliesToPortal, values.appliesToDocuments,
        values.effectiveFrom, values.effectiveUntil,
      ]
    )

    const row = insertResult.rows[0]
    const entityId = (row?.id as string) ?? null
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "warranty_policies",
      entityId,
      action: "create_warranty_policy",
      beforeSnapshot: null,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "create_warranty_policy",
        domain: "warranty",
        beforeSnapshot: null,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapPolicyRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function updateWarrantyPolicy(
  companyId: string,
  policyId: string,
  actor: WarrantyActor,
  input: WarrantyPolicyInput
): Promise<WarrantyMutationResult<WarrantyPolicy>> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(policyId)) return buildError("Politica invalida.")

  const validation = validatePolicy(input)
  if (!validation.ok) return buildError(validation.error, validation.fieldErrors)
  const { values } = validation

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM warranty_policies WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [policyId, companyId]
    )
    if (!beforeResult.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Politica de garantia nao encontrada para esta empresa.")
    }
    const before = rowToSnapshot(beforeResult.rows[0])

    const updateResult = await client.query<Record<string, unknown>>(
      `UPDATE warranty_policies SET
        name = $3, product_type = $4, product_condition = $5, product_origin = $6,
        default_months = $7, default_days = $8, calculation_mode = $9,
        public_label_template = $10, internal_description = $11,
        requires_customer_identification = $12,
        applies_to_sale = $13, applies_to_catalog = $14,
        applies_to_portal = $15, applies_to_documents = $16,
        effective_from = $17, effective_until = $18
      WHERE id = $1 AND company_id = $2
      RETURNING *`,
      [
        policyId, companyId, values.name, values.productType, values.productCondition, values.productOrigin,
        values.defaultMonths, values.defaultDays, values.calculationMode, values.publicLabelTemplate,
        values.internalDescription, values.requiresCustomerIdentification,
        values.appliesToSale, values.appliesToCatalog, values.appliesToPortal, values.appliesToDocuments,
        values.effectiveFrom, values.effectiveUntil,
      ]
    )

    const row = updateResult.rows[0]
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "warranty_policies",
      entityId: policyId,
      action: "update_warranty_policy",
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "update_warranty_policy",
        domain: "warranty",
        beforeSnapshot: before,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapPolicyRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function deactivateWarrantyPolicy(
  companyId: string,
  policyId: string,
  actor: WarrantyActor
): Promise<WarrantyMutationResult<WarrantyPolicy>> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(policyId)) return buildError("Politica invalida.")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM warranty_policies WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [policyId, companyId]
    )
    if (!beforeResult.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Politica de garantia nao encontrada para esta empresa.")
    }
    const before = rowToSnapshot(beforeResult.rows[0])

    await client.query(
      `UPDATE warranty_policies SET active = FALSE WHERE id = $1 AND company_id = $2`,
      [policyId, companyId]
    )

    const afterResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM warranty_policies WHERE id = $1 LIMIT 1`,
      [policyId]
    )
    const row = afterResult.rows[0]
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "warranty_policies",
      entityId: policyId,
      action: "deactivate_warranty_policy",
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "deactivate_warranty_policy",
        domain: "warranty",
        beforeSnapshot: before,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapPolicyRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function createWarrantyPolicyTerm(
  companyId: string,
  policyId: string,
  actor: WarrantyActor,
  input: WarrantyPolicyTermInput
): Promise<WarrantyMutationResult<WarrantyPolicyTerm>> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(policyId)) return buildError("Politica invalida.")

  const validation = validateTerm(input)
  if (!validation.ok) return buildError(validation.error, validation.fieldErrors)
  const { values } = validation

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const policyCheck = await client.query<{ id: string }>(
      `SELECT id FROM warranty_policies WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [policyId, companyId]
    )
    if (!policyCheck.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Politica de garantia nao encontrada para esta empresa.")
    }

    const insertResult = await client.query<Record<string, unknown>>(
      `INSERT INTO warranty_policy_terms (warranty_policy_id, term_type, title, body, sort_order, active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING *`,
      [policyId, values.termType, values.title, values.body, values.sortOrder]
    )

    const row = insertResult.rows[0]
    const entityId = (row?.id as string) ?? null
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "warranty_policy_terms",
      entityId,
      action: "create_warranty_term",
      beforeSnapshot: null,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "create_warranty_term",
        domain: "warranty",
        beforeSnapshot: null,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapTermRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function updateWarrantyPolicyTerm(
  companyId: string,
  policyId: string,
  termId: string,
  actor: WarrantyActor,
  input: WarrantyPolicyTermInput
): Promise<WarrantyMutationResult<WarrantyPolicyTerm>> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(policyId) || !UUID_RE.test(termId)) {
    return buildError("Clausula invalida.")
  }

  const validation = validateTerm(input)
  if (!validation.ok) return buildError(validation.error, validation.fieldErrors)
  const { values } = validation

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT t.* FROM warranty_policy_terms t
        JOIN warranty_policies p ON p.id = t.warranty_policy_id
        WHERE t.id = $1 AND t.warranty_policy_id = $2 AND p.company_id = $3
        LIMIT 1`,
      [termId, policyId, companyId]
    )
    if (!beforeResult.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Clausula nao encontrada para esta politica.")
    }
    const before = rowToSnapshot(beforeResult.rows[0])

    const updateResult = await client.query<Record<string, unknown>>(
      `UPDATE warranty_policy_terms
        SET term_type = $2, title = $3, body = $4, sort_order = $5
        WHERE id = $1
        RETURNING *`,
      [termId, values.termType, values.title, values.body, values.sortOrder]
    )

    const row = updateResult.rows[0]
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "warranty_policy_terms",
      entityId: termId,
      action: "update_warranty_term",
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "update_warranty_term",
        domain: "warranty",
        beforeSnapshot: before,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapTermRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function deactivateWarrantyPolicyTerm(
  companyId: string,
  policyId: string,
  termId: string,
  actor: WarrantyActor
): Promise<WarrantyMutationResult<WarrantyPolicyTerm>> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(policyId) || !UUID_RE.test(termId)) {
    return buildError("Clausula invalida.")
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT t.* FROM warranty_policy_terms t
        JOIN warranty_policies p ON p.id = t.warranty_policy_id
        WHERE t.id = $1 AND t.warranty_policy_id = $2 AND p.company_id = $3
        LIMIT 1`,
      [termId, policyId, companyId]
    )
    if (!beforeResult.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Clausula nao encontrada para esta politica.")
    }
    const before = rowToSnapshot(beforeResult.rows[0])

    await client.query(
      `UPDATE warranty_policy_terms SET active = FALSE WHERE id = $1`,
      [termId]
    )

    const afterResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM warranty_policy_terms WHERE id = $1 LIMIT 1`,
      [termId]
    )
    const row = afterResult.rows[0]
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "warranty_policy_terms",
      entityId: termId,
      action: "deactivate_warranty_term",
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "deactivate_warranty_term",
        domain: "warranty",
        beforeSnapshot: before,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapTermRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}
