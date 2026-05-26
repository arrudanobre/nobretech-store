import "server-only"

import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { buildAuditMetadata, recordCompanySettingsAuditLog, rowToSnapshot } from "@/lib/company-settings/audit"
import type {
  WarrantyActor,
  WarrantyCalculationMode,
  WarrantyMutationResult,
  WarrantyNature,
  WarrantyTermType,
} from "./types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CALCULATION_MODES: WarrantyCalculationMode[] = ["calendar_months", "fixed_days", "manual_dates"]
const WARRANTY_NATURES: WarrantyNature[] = ["legal", "contractual", "manufacturer", "operational_support", "legacy"]

// ============================================================
// Types
// ============================================================

export type WarrantyPolicySnapshot = {
  warranty_policy_id: string
  name: string
  warranty_nature: WarrantyNature
  product_type: string | null
  product_condition: string | null
  product_origin: string | null
  default_months: number | null
  default_days: number | null
  calculation_mode: WarrantyCalculationMode
  public_label_template: string | null
  selection_label: string | null
  selection_description: string | null
  legal_basis: string | null
  effective_from: string
  effective_until: string | null
}

export type WarrantyTermSnapshot = {
  id: string
  term_type: WarrantyTermType
  title: string
  body: string
  sort_order: number
}

export type SaleItemWarranty = {
  id: string
  companyId: string
  saleId: string
  saleItemId: string
  inventoryItemId: string | null
  warrantyPolicyId: string
  warrantyNature: WarrantyNature
  warrantyName: string
  warrantyLabel: string | null
  durationMonths: number | null
  durationDays: number | null
  calculationMode: WarrantyCalculationMode
  startsAt: string
  endsAt: string | null
  manufacturerCoverageReference: string | null
  manufacturerCoverageUrl: string | null
  manualNotes: string | null
  policySnapshot: WarrantyPolicySnapshot
  termsSnapshot: WarrantyTermSnapshot[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export type WarrantyPeriodInput = {
  startsAt: Date | string
  calculationMode: WarrantyCalculationMode
  durationMonths?: number | null
  durationDays?: number | null
  manualEndsAt?: Date | string | null
}

export type WarrantyPeriod = {
  startsAt: Date
  endsAt: Date | null
}

export type WarrantyPeriodResult =
  | { ok: true; value: WarrantyPeriod }
  | { ok: false; error: string }

export type CreateSaleItemWarrantyInput = {
  companyId: string
  saleItemId: string
  warrantyPolicyId: string
  startsAt: string | Date
  durationMonths?: number | string | null
  durationDays?: number | string | null
  manualEndsAt?: string | Date | null
  warrantyName?: string | null
  warrantyLabel?: string | null
  manufacturerCoverageReference?: string | null
  manufacturerCoverageUrl?: string | null
  manualNotes?: string | null
  manualSelection?: boolean
}

export type UpdateSaleItemWarrantyInput = {
  companyId: string
  warrantyId: string
  warrantyName?: string | null
  warrantyLabel?: string | null
  manufacturerCoverageReference?: string | null
  manufacturerCoverageUrl?: string | null
  manualNotes?: string | null
}

// ============================================================
// Helpers
// ============================================================

function buildError<T>(error: string, fieldErrors?: Record<string, string>): WarrantyMutationResult<T> {
  return { ok: false, error, fieldErrors }
}

function databaseError<T>(err: unknown): WarrantyMutationResult<T> {
  const pgError = err as { code?: string; constraint?: string; message?: string }
  if (pgError.code === "23505" && pgError.constraint === "idx_sale_item_warranties_unique_active_item") {
    return buildError("Ja existe uma garantia ativa para este item de venda.")
  }
  return buildError(pgError.message || "Nao foi possivel salvar a garantia do item.")
}

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toISOString(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function nullIfEmptyString(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function parseIntOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function addMonthsClampedUTC(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDayOfMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDayOfMonth))
  return result
}

function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

export function calculateWarrantyPeriod(input: WarrantyPeriodInput): WarrantyPeriodResult {
  const startsAt = toDate(input.startsAt)
  if (!startsAt) return { ok: false, error: "Data de inicio invalida." }

  if (input.calculationMode === "calendar_months") {
    const months = input.durationMonths ?? null
    if (months === null || !Number.isFinite(months) || months <= 0) {
      return { ok: false, error: "Calculo calendar_months exige durationMonths > 0." }
    }
    const endsAt = addMonthsClampedUTC(startsAt, Math.trunc(months))
    return { ok: true, value: { startsAt, endsAt } }
  }

  if (input.calculationMode === "fixed_days") {
    const days = input.durationDays ?? null
    if (days === null || !Number.isFinite(days) || days <= 0) {
      return { ok: false, error: "Calculo fixed_days exige durationDays > 0." }
    }
    const endsAt = addDaysUTC(startsAt, Math.trunc(days))
    return { ok: true, value: { startsAt, endsAt } }
  }

  if (input.calculationMode === "manual_dates") {
    if (input.manualEndsAt == null) {
      return { ok: false, error: "Calculo manual_dates exige manualEndsAt." }
    }
    const endsAt = toDate(input.manualEndsAt)
    if (!endsAt) return { ok: false, error: "manualEndsAt invalido." }
    if (endsAt.getTime() < startsAt.getTime()) {
      return { ok: false, error: "manualEndsAt nao pode ser anterior a startsAt." }
    }
    return { ok: true, value: { startsAt, endsAt } }
  }

  return { ok: false, error: "calculation_mode invalido." }
}

// ============================================================
// Snapshot
// ============================================================

type WarrantySnapshotBundle = {
  policy: {
    id: string
    name: string
    warrantyNature: WarrantyNature
    isSelectable: boolean
    active: boolean
    calculationMode: WarrantyCalculationMode
    defaultMonths: number | null
    defaultDays: number | null
  }
  policySnapshot: WarrantyPolicySnapshot
  termsSnapshot: WarrantyTermSnapshot[]
}

export async function buildWarrantySnapshot(
  companyId: string,
  warrantyPolicyId: string,
  client?: PoolClient
): Promise<WarrantySnapshotBundle | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(warrantyPolicyId)) return null

  const runner = client ?? pool

  const policyResult = await runner.query<Record<string, unknown>>(
    `SELECT id, company_id, name, warranty_nature, product_type, product_condition, product_origin,
            default_months, default_days, calculation_mode, public_label_template,
            selection_label, selection_description, legal_basis,
            is_selectable, active, effective_from, effective_until
     FROM warranty_policies
     WHERE id = $1 AND company_id = $2
     LIMIT 1`,
    [warrantyPolicyId, companyId]
  )
  const row = policyResult.rows[0]
  if (!row) return null

  const termsResult = await runner.query<Record<string, unknown>>(
    `SELECT id, term_type, title, body, sort_order
     FROM warranty_policy_terms
     WHERE warranty_policy_id = $1 AND active = TRUE
     ORDER BY sort_order ASC, created_at ASC`,
    [warrantyPolicyId]
  )

  const policySnapshot: WarrantyPolicySnapshot = {
    warranty_policy_id: String(row.id),
    name: String(row.name),
    warranty_nature: row.warranty_nature as WarrantyNature,
    product_type: (row.product_type as string | null) ?? null,
    product_condition: (row.product_condition as string | null) ?? null,
    product_origin: (row.product_origin as string | null) ?? null,
    default_months: (row.default_months as number | null) ?? null,
    default_days: (row.default_days as number | null) ?? null,
    calculation_mode: row.calculation_mode as WarrantyCalculationMode,
    public_label_template: (row.public_label_template as string | null) ?? null,
    selection_label: (row.selection_label as string | null) ?? null,
    selection_description: (row.selection_description as string | null) ?? null,
    legal_basis: (row.legal_basis as string | null) ?? null,
    effective_from: toISOString(row.effective_from) ?? "",
    effective_until: toISOString(row.effective_until),
  }

  const termsSnapshot: WarrantyTermSnapshot[] = termsResult.rows.map((t) => ({
    id: String(t.id),
    term_type: t.term_type as WarrantyTermType,
    title: String(t.title),
    body: String(t.body),
    sort_order: Number(t.sort_order),
  }))

  return {
    policy: {
      id: String(row.id),
      name: String(row.name),
      warrantyNature: row.warranty_nature as WarrantyNature,
      isSelectable: Boolean(row.is_selectable),
      active: Boolean(row.active),
      calculationMode: row.calculation_mode as WarrantyCalculationMode,
      defaultMonths: (row.default_months as number | null) ?? null,
      defaultDays: (row.default_days as number | null) ?? null,
    },
    policySnapshot,
    termsSnapshot,
  }
}

// ============================================================
// Row mapper
// ============================================================

function mapRow(row: Record<string, unknown>): SaleItemWarranty {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    saleId: row.sale_id as string,
    saleItemId: row.sale_item_id as string,
    inventoryItemId: (row.inventory_item_id as string | null) ?? null,
    warrantyPolicyId: row.warranty_policy_id as string,
    warrantyNature: row.warranty_nature as WarrantyNature,
    warrantyName: row.warranty_name as string,
    warrantyLabel: (row.warranty_label as string | null) ?? null,
    durationMonths: (row.duration_months as number | null) ?? null,
    durationDays: (row.duration_days as number | null) ?? null,
    calculationMode: row.calculation_mode as WarrantyCalculationMode,
    startsAt: toISOString(row.starts_at) ?? "",
    endsAt: toISOString(row.ends_at),
    manufacturerCoverageReference: (row.manufacturer_coverage_reference as string | null) ?? null,
    manufacturerCoverageUrl: (row.manufacturer_coverage_url as string | null) ?? null,
    manualNotes: (row.manual_notes as string | null) ?? null,
    policySnapshot: row.policy_snapshot as WarrantyPolicySnapshot,
    termsSnapshot: (row.terms_snapshot as WarrantyTermSnapshot[]) ?? [],
    active: Boolean(row.active),
    createdAt: toISOString(row.created_at) ?? "",
    updatedAt: toISOString(row.updated_at) ?? "",
  }
}

// ============================================================
// Queries
// ============================================================

export async function getSaleItemWarranty(
  companyId: string,
  saleItemId: string
): Promise<SaleItemWarranty | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleItemId)) return null
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM sale_item_warranties
     WHERE company_id = $1 AND sale_item_id = $2 AND active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [companyId, saleItemId]
  )
  const row = result.rows[0]
  return row ? mapRow(row) : null
}

export async function getSaleWarranties(
  companyId: string,
  saleId: string
): Promise<SaleItemWarranty[]> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(saleId)) return []
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM sale_item_warranties
     WHERE company_id = $1 AND sale_id = $2 AND active = TRUE
     ORDER BY created_at ASC`,
    [companyId, saleId]
  )
  return result.rows.map(mapRow)
}

export async function getWarrantyByInventoryItem(
  companyId: string,
  inventoryItemId: string
): Promise<SaleItemWarranty | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(inventoryItemId)) return null
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM sale_item_warranties
     WHERE company_id = $1 AND inventory_item_id = $2 AND active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [companyId, inventoryItemId]
  )
  const row = result.rows[0]
  return row ? mapRow(row) : null
}

export async function getSaleItemWarrantyById(
  companyId: string,
  warrantyId: string
): Promise<SaleItemWarranty | null> {
  if (!UUID_RE.test(companyId) || !UUID_RE.test(warrantyId)) return null
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM sale_item_warranties WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [warrantyId, companyId]
  )
  const row = result.rows[0]
  return row ? mapRow(row) : null
}

// ============================================================
// Mutations
// ============================================================

type SaleItemContext = {
  saleId: string
  inventoryItemId: string | null
}

async function fetchSaleItemContext(
  client: PoolClient,
  companyId: string,
  saleItemId: string
): Promise<SaleItemContext | null> {
  const result = await client.query<{ sale_id: string; inventory_item_id: string | null }>(
    `SELECT sale_id, inventory_item_id
     FROM sale_items
     WHERE id = $1 AND company_id = $2 AND active = TRUE
     LIMIT 1`,
    [saleItemId, companyId]
  )
  const row = result.rows[0]
  if (!row) return null
  return { saleId: row.sale_id, inventoryItemId: row.inventory_item_id }
}

export async function createSaleItemWarranty(
  input: CreateSaleItemWarrantyInput,
  actor: WarrantyActor
): Promise<WarrantyMutationResult<SaleItemWarranty>> {
  const { companyId, saleItemId, warrantyPolicyId } = input

  if (!UUID_RE.test(companyId)) return buildError("Empresa invalida.")
  if (!UUID_RE.test(saleItemId)) return buildError("Item de venda invalido.")
  if (!UUID_RE.test(warrantyPolicyId)) return buildError("Politica de garantia invalida.")

  const startsAt = toDate(input.startsAt)
  if (!startsAt) return buildError("Data de inicio invalida.")

  const durationMonths = parseIntOrNull(input.durationMonths)
  const durationDays = parseIntOrNull(input.durationDays)
  const manualEndsAt = input.manualEndsAt != null ? toDate(input.manualEndsAt) : null

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const saleItemCtx = await fetchSaleItemContext(client, companyId, saleItemId)
    if (!saleItemCtx) {
      await client.query("ROLLBACK")
      return buildError("Item de venda nao encontrado para esta empresa.")
    }

    const snapshot = await buildWarrantySnapshot(companyId, warrantyPolicyId, client)
    if (!snapshot) {
      await client.query("ROLLBACK")
      return buildError("Politica de garantia nao encontrada para esta empresa.")
    }
    if (!snapshot.policy.active) {
      await client.query("ROLLBACK")
      return buildError("Politica de garantia inativa nao pode ser vinculada.")
    }
    if (input.manualSelection === true && !snapshot.policy.isSelectable) {
      await client.query("ROLLBACK")
      return buildError("Politica nao e selecionavel manualmente.")
    }
    if (!CALCULATION_MODES.includes(snapshot.policy.calculationMode)) {
      await client.query("ROLLBACK")
      return buildError("Modo de calculo da politica invalido.")
    }
    if (!WARRANTY_NATURES.includes(snapshot.policy.warrantyNature)) {
      await client.query("ROLLBACK")
      return buildError("Natureza da garantia invalida.")
    }

    const effectiveMonths = durationMonths ?? snapshot.policy.defaultMonths
    const effectiveDays = durationDays ?? snapshot.policy.defaultDays

    const period = calculateWarrantyPeriod({
      startsAt,
      calculationMode: snapshot.policy.calculationMode,
      durationMonths: effectiveMonths,
      durationDays: effectiveDays,
      manualEndsAt,
    })
    if (!period.ok) {
      await client.query("ROLLBACK")
      return buildError(period.error)
    }

    const warrantyName = nullIfEmptyString(input.warrantyName ?? null) ?? snapshot.policySnapshot.name
    const warrantyLabel = nullIfEmptyString(input.warrantyLabel ?? null) ?? snapshot.policySnapshot.public_label_template

    const insertResult = await client.query<Record<string, unknown>>(
      `INSERT INTO sale_item_warranties (
        company_id, sale_id, sale_item_id, inventory_item_id, warranty_policy_id,
        warranty_nature, warranty_name, warranty_label,
        duration_months, duration_days, calculation_mode,
        starts_at, ends_at,
        manufacturer_coverage_reference, manufacturer_coverage_url, manual_notes,
        policy_snapshot, terms_snapshot, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, TRUE
      ) RETURNING *`,
      [
        companyId,
        saleItemCtx.saleId,
        saleItemId,
        saleItemCtx.inventoryItemId,
        warrantyPolicyId,
        snapshot.policy.warrantyNature,
        warrantyName,
        warrantyLabel,
        effectiveMonths,
        effectiveDays,
        snapshot.policy.calculationMode,
        period.value.startsAt,
        period.value.endsAt,
        nullIfEmptyString(input.manufacturerCoverageReference ?? null),
        nullIfEmptyString(input.manufacturerCoverageUrl ?? null),
        nullIfEmptyString(input.manualNotes ?? null),
        JSON.stringify(snapshot.policySnapshot),
        JSON.stringify(snapshot.termsSnapshot),
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
      entityTable: "sale_item_warranties",
      entityId,
      action: "create_sale_item_warranty",
      beforeSnapshot: null,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "create_sale_item_warranty",
        domain: "warranty",
        beforeSnapshot: null,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function updateSaleItemWarranty(
  input: UpdateSaleItemWarrantyInput,
  actor: WarrantyActor
): Promise<WarrantyMutationResult<SaleItemWarranty>> {
  const { companyId, warrantyId } = input
  if (!UUID_RE.test(companyId)) return buildError("Empresa invalida.")
  if (!UUID_RE.test(warrantyId)) return buildError("Garantia invalida.")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM sale_item_warranties WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [warrantyId, companyId]
    )
    if (!beforeResult.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Garantia nao encontrada para esta empresa.")
    }
    const before = rowToSnapshot(beforeResult.rows[0])

    const updateResult = await client.query<Record<string, unknown>>(
      `UPDATE sale_item_warranties SET
        warranty_name = COALESCE($3, warranty_name),
        warranty_label = $4,
        manufacturer_coverage_reference = $5,
        manufacturer_coverage_url = $6,
        manual_notes = $7
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [
        warrantyId,
        companyId,
        nullIfEmptyString(input.warrantyName ?? null),
        nullIfEmptyString(input.warrantyLabel ?? null),
        nullIfEmptyString(input.manufacturerCoverageReference ?? null),
        nullIfEmptyString(input.manufacturerCoverageUrl ?? null),
        nullIfEmptyString(input.manualNotes ?? null),
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
      entityTable: "sale_item_warranties",
      entityId: warrantyId,
      action: "update_sale_item_warranty",
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "update_sale_item_warranty",
        domain: "warranty",
        beforeSnapshot: before,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}

export async function deactivateSaleItemWarranty(
  params: { companyId: string; warrantyId: string },
  actor: WarrantyActor
): Promise<WarrantyMutationResult<SaleItemWarranty>> {
  const { companyId, warrantyId } = params
  if (!UUID_RE.test(companyId)) return buildError("Empresa invalida.")
  if (!UUID_RE.test(warrantyId)) return buildError("Garantia invalida.")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM sale_item_warranties WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [warrantyId, companyId]
    )
    if (!beforeResult.rowCount) {
      await client.query("ROLLBACK")
      return buildError("Garantia nao encontrada para esta empresa.")
    }
    const before = rowToSnapshot(beforeResult.rows[0])

    await client.query(
      `UPDATE sale_item_warranties SET active = FALSE WHERE id = $1 AND company_id = $2`,
      [warrantyId, companyId]
    )

    const afterResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM sale_item_warranties WHERE id = $1 LIMIT 1`,
      [warrantyId]
    )
    const row = afterResult.rows[0]
    const after = rowToSnapshot(row)

    await recordCompanySettingsAuditLog({
      client,
      companyId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      domain: "warranty",
      entityTable: "sale_item_warranties",
      entityId: warrantyId,
      action: "deactivate_sale_item_warranty",
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: buildAuditMetadata({
        action: "deactivate_sale_item_warranty",
        domain: "warranty",
        beforeSnapshot: before,
        afterSnapshot: after,
      }),
    })

    await client.query("COMMIT")
    return { ok: true, data: mapRow(row) }
  } catch (error) {
    await client.query("ROLLBACK")
    return databaseError(error)
  } finally {
    client.release()
  }
}
