import { pool } from "@/lib/db"

export type OrionDecisionType =
  | "capital_allocation"
  | "business_strategy"
  | "marketing_strategy"
  | "inventory_priority"
  | "cash_health"
  | "sales_performance"
  | "operational_action"

export type OrionDecisionStatus =
  | "open"
  | "in_progress"
  | "done"
  | "ignored"
  | "superseded"

export type OrionDecisionResultStatus =
  | "successful"
  | "failed"
  | "mixed"
  | "inconclusive"
  | "pending"

export type OrionDecisionPriority = "low" | "medium" | "high" | "critical"

export type OrionDecisionConfidence = "low" | "medium" | "high"

export type OrionDecisionMemoryItem = {
  id: string
  companyId: string
  decisionType: OrionDecisionType
  title: string
  recommendation: string
  reason: string
  status: OrionDecisionStatus
  priority: OrionDecisionPriority
  confidence: OrionDecisionConfidence
  sourceQuestion: string
  decisionPayload: Record<string, unknown>
  expectedOutcome: Record<string, unknown>
  actualOutcome: Record<string, unknown>
  resultStatus: OrionDecisionResultStatus
  reflection: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  reviewAfter: string | null
}

export type OrionDecisionMemoryInput = {
  companyId: string
  decisionType: OrionDecisionType
  title: string
  recommendation: string
  reason?: string
  status?: OrionDecisionStatus
  priority?: OrionDecisionPriority
  confidence?: OrionDecisionConfidence
  sourceQuestion?: string
  decisionPayload?: Record<string, unknown>
  expectedOutcome?: Record<string, unknown>
  reviewAfter?: string | null
}

export type OrionDecisionOutcomeInput = {
  companyId: string
  memoryId: string
  resultStatus: OrionDecisionResultStatus
  reflection?: string
  actualOutcome?: Record<string, unknown>
  status?: OrionDecisionStatus
}

export type OrionDecisionStatusInput = {
  companyId: string
  memoryId: string
  status: OrionDecisionStatus
}

export type OrionDecisionQueryAdapter = {
  query<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
}

type DecisionRow = {
  id: string
  company_id: string
  decision_type: OrionDecisionType
  title: string
  recommendation: string
  reason: string
  status: OrionDecisionStatus
  priority: OrionDecisionPriority
  confidence: OrionDecisionConfidence
  source_question: string
  decision_payload: Record<string, unknown> | null
  expected_outcome: Record<string, unknown> | null
  actual_outcome: Record<string, unknown> | null
  result_status: OrionDecisionResultStatus
  reflection: string
  created_at: string | Date
  updated_at: string | Date
  resolved_at: string | Date | null
  review_after: string | Date | null
}

type DecisionStoreOptions = {
  adapter?: OrionDecisionQueryAdapter
  logWarnings?: boolean
}

const MISSING_TABLE_CODE = "42P01"
const DEFAULT_DECISION_LIMIT = 20
const DEFAULT_RECENT_LIMIT = 10

function adapterFromOptions(options?: DecisionStoreOptions) {
  return options?.adapter || pool
}

function shouldLog(options?: DecisionStoreOptions) {
  return options?.logWarnings !== false
}

function warnDecisionFailure(action: string, error: unknown, options?: DecisionStoreOptions) {
  if (!shouldLog(options)) return
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[orion-decision-memory] ${action} skipped: ${code || message}`)
}

export function isMissingDecisionMemoryTable(error: unknown) {
  return Boolean(
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String(error.code) === MISSING_TABLE_CODE
  )
}

function iso(value: string | Date | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value
}

function rowToItem(row: DecisionRow): OrionDecisionMemoryItem {
  return {
    id: row.id,
    companyId: row.company_id,
    decisionType: row.decision_type,
    title: row.title,
    recommendation: row.recommendation,
    reason: row.reason || "",
    status: row.status,
    priority: row.priority,
    confidence: row.confidence,
    sourceQuestion: row.source_question || "",
    decisionPayload: row.decision_payload || {},
    expectedOutcome: row.expected_outcome || {},
    actualOutcome: row.actual_outcome || {},
    resultStatus: row.result_status,
    reflection: row.reflection || "",
    createdAt: iso(row.created_at) || "",
    updatedAt: iso(row.updated_at) || "",
    resolvedAt: iso(row.resolved_at),
    reviewAfter: iso(row.review_after),
  }
}

function compactText(value: string, max = 360) {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

export function decisionKeyFromPayload(decisionType: OrionDecisionType, payload?: Record<string, unknown> | null) {
  if (!payload) return null
  const raw = payload.decisionKey
  if (typeof raw === "string" && raw.trim().length > 0) return `${decisionType}:${raw.trim().toLowerCase()}`
  return null
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function semanticDecisionKey(item: OrionDecisionMemoryItem) {
  const payload = item.decisionPayload || {}
  const decisionKeySegments = typeof payload.decisionKey === "string"
    ? payload.decisionKey.trim().toLowerCase().split(":")
    : []
  const subtype = typeof payload.subtype === "string"
    ? payload.subtype.trim().toLowerCase()
    : decisionKeySegments.length > 0
      ? decisionKeySegments[decisionKeySegments.length - 1] || ""
      : ""
  const entityLabel = typeof payload.entityLabel === "string" ? payload.entityLabel.trim() : ""
  if (item.decisionType === "business_strategy" && subtype === "anchor-product") {
    if (entityLabel) {
      return `${item.decisionType}:anchor-product:${slug(entityLabel)}`
    }
    // No entityLabel: fingerprint by recommendation to dedupe same-anchor different-timeframe plans
    const recFingerprint = slug(item.recommendation.slice(0, 80))
    if (recFingerprint) return `${item.decisionType}:anchor-product:rec:${recFingerprint}`
  }
  return decisionKeyFromPayload(item.decisionType, payload) || `${item.decisionType}:id:${item.id}`
}

function updatedTime(item: OrionDecisionMemoryItem) {
  const parsed = new Date(item.updatedAt || item.createdAt || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function dedupeDecisionMemories(items: OrionDecisionMemoryItem[]): OrionDecisionMemoryItem[] {
  const byKey = new Map<string, OrionDecisionMemoryItem>()
  for (const item of items) {
    const key = `${semanticDecisionKey(item)}:${item.status}`
    const current = byKey.get(key)
    if (!current || updatedTime(item) >= updatedTime(current)) {
      byKey.set(key, item)
    }
  }
  return Array.from(byKey.values()).sort((a, b) => updatedTime(b) - updatedTime(a))
}

export async function hasOrionDecisionMemoryTable(options?: DecisionStoreOptions): Promise<boolean> {
  try {
    const result = await adapterFromOptions(options).query<{ table_exists: string | null }>(
      "SELECT to_regclass('public.orion_decision_memory') AS table_exists"
    )
    return result.rows[0]?.table_exists === "orion_decision_memory"
      || result.rows[0]?.table_exists === "public.orion_decision_memory"
  } catch (error) {
    warnDecisionFailure("table-check", error, options)
    return false
  }
}

export async function loadOpenDecisionMemories(
  companyId: string,
  options?: DecisionStoreOptions
): Promise<OrionDecisionMemoryItem[]> {
  try {
    const result = await adapterFromOptions(options).query<DecisionRow>(
      `
        SELECT *
        FROM orion_decision_memory
        WHERE company_id = $1::uuid
          AND status IN ('open', 'in_progress')
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END DESC,
          updated_at DESC
        LIMIT $2
      `,
      [companyId, DEFAULT_DECISION_LIMIT]
    )
    return result.rows.map(rowToItem)
  } catch (error) {
    warnDecisionFailure("load-open", error, options)
    return []
  }
}

export async function loadRecentDecisionMemories(
  companyId: string,
  options?: DecisionStoreOptions & { limit?: number }
): Promise<OrionDecisionMemoryItem[]> {
  const limit = options?.limit || DEFAULT_RECENT_LIMIT
  try {
    const result = await adapterFromOptions(options).query<DecisionRow>(
      `
        SELECT *
        FROM orion_decision_memory
        WHERE company_id = $1::uuid
        ORDER BY updated_at DESC
        LIMIT $2
      `,
      [companyId, limit]
    )
    return result.rows.map(rowToItem)
  } catch (error) {
    warnDecisionFailure("load-recent", error, options)
    return []
  }
}

export async function createDecisionMemory(
  input: OrionDecisionMemoryInput,
  options?: DecisionStoreOptions
): Promise<OrionDecisionMemoryItem | null> {
  const status = input.status || "open"
  const priority = input.priority || "medium"
  const confidence = input.confidence || "medium"
  const payload = input.decisionPayload || {}
  const expected = input.expectedOutcome || {}
  const decisionKey = decisionKeyFromPayload(input.decisionType, payload)

  try {
    const existing = decisionKey
      ? await adapterFromOptions(options).query<DecisionRow>(
          `
            SELECT *
            FROM orion_decision_memory
            WHERE company_id = $1::uuid
              AND decision_type = $2
              AND status IN ('open', 'in_progress')
              AND decision_payload->>'decisionKey' = $3
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [input.companyId, input.decisionType, payload.decisionKey]
        )
      : { rows: [] as DecisionRow[] }

    const current = existing.rows[0]
    if (current) {
      const updated = await adapterFromOptions(options).query<DecisionRow>(
        `
          UPDATE orion_decision_memory
          SET title = $2,
              recommendation = $3,
              reason = $4,
              priority = $5,
              confidence = $6,
              source_question = $7,
              decision_payload = $8::jsonb,
              expected_outcome = $9::jsonb,
              review_after = $10,
              updated_at = now()
          WHERE id = $1::uuid
            AND company_id = $11::uuid
          RETURNING *
        `,
        [
          current.id,
          compactText(input.title, 120),
          compactText(input.recommendation, 360),
          compactText(input.reason || "", 360),
          priority,
          confidence,
          compactText(input.sourceQuestion || "", 240),
          JSON.stringify(payload),
          JSON.stringify(expected),
          input.reviewAfter || null,
          input.companyId,
        ]
      )
      return updated.rows[0] ? rowToItem(updated.rows[0]) : null
    }

    const inserted = await adapterFromOptions(options).query<DecisionRow>(
      `
        INSERT INTO orion_decision_memory (
          company_id,
          decision_type,
          title,
          recommendation,
          reason,
          status,
          priority,
          confidence,
          source_question,
          decision_payload,
          expected_outcome,
          review_after
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
        RETURNING *
      `,
      [
        input.companyId,
        input.decisionType,
        compactText(input.title, 120),
        compactText(input.recommendation, 360),
        compactText(input.reason || "", 360),
        status,
        priority,
        confidence,
        compactText(input.sourceQuestion || "", 240),
        JSON.stringify(payload),
        JSON.stringify(expected),
        input.reviewAfter || null,
      ]
    )
    return inserted.rows[0] ? rowToItem(inserted.rows[0]) : null
  } catch (error) {
    warnDecisionFailure("create", error, options)
    return null
  }
}

export async function updateDecisionStatus(
  input: OrionDecisionStatusInput,
  options?: DecisionStoreOptions
): Promise<void> {
  try {
    await adapterFromOptions(options).query(
      `
        UPDATE orion_decision_memory
        SET status = $3,
            resolved_at = CASE WHEN $3 IN ('done', 'ignored', 'superseded') THEN now() ELSE resolved_at END,
            updated_at = now()
        WHERE company_id = $1::uuid
          AND id = $2::uuid
      `,
      [input.companyId, input.memoryId, input.status]
    )
  } catch (error) {
    warnDecisionFailure("update-status", error, options)
  }
}

export async function recordDecisionOutcome(
  input: OrionDecisionOutcomeInput,
  options?: DecisionStoreOptions
): Promise<void> {
  const nextStatus = input.status || (input.resultStatus === "pending" ? "open" : "done")
  try {
    await adapterFromOptions(options).query(
      `
        UPDATE orion_decision_memory
        SET result_status = $3,
            reflection = $4,
            actual_outcome = $5::jsonb,
            status = $6,
            resolved_at = CASE WHEN $6 IN ('done', 'ignored', 'superseded') THEN now() ELSE resolved_at END,
            updated_at = now()
        WHERE company_id = $1::uuid
          AND id = $2::uuid
      `,
      [
        input.companyId,
        input.memoryId,
        input.resultStatus,
        compactText(input.reflection || "", 360),
        JSON.stringify(input.actualOutcome || {}),
        nextStatus,
      ]
    )
  } catch (error) {
    warnDecisionFailure("record-outcome", error, options)
  }
}

export async function resolveDecisionMemory(
  companyId: string,
  memoryId: string,
  options?: DecisionStoreOptions
): Promise<void> {
  await updateDecisionStatus({ companyId, memoryId, status: "done" }, options)
}

export async function ignoreDecisionMemory(
  companyId: string,
  memoryId: string,
  options?: DecisionStoreOptions
): Promise<void> {
  await updateDecisionStatus({ companyId, memoryId, status: "ignored" }, options)
}

export type OrionDecisionMemoryContext = {
  openDecisions: OrionDecisionMemoryItem[]
  recentDecisions: OrionDecisionMemoryItem[]
}

export function buildDecisionMemoryContext(
  openDecisions: OrionDecisionMemoryItem[],
  recentDecisions: OrionDecisionMemoryItem[]
): OrionDecisionMemoryContext {
  return {
    openDecisions: dedupeDecisionMemories(openDecisions),
    recentDecisions: dedupeDecisionMemories(recentDecisions),
  }
}
