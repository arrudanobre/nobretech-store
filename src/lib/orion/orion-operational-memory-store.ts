import { pool } from "@/lib/db"
import type {
  OrionAnalysis,
  OrionExecutionGuardrails,
  OrionIntentRouteSummary,
  OrionOperationalContext,
  OrionSnapshot,
} from "@/lib/orion/types"

export type OrionOperationalMemoryType =
  | "owner_decision"
  | "owner_preference"
  | "open_alert"
  | "recommended_action"
  | "follow_up"
  | "financial_context"
  | "sales_context"
  | "inventory_context"
  | "lead_context"

export type OrionOperationalMemoryStatus =
  | "open"
  | "resolved"
  | "ignored"
  | "superseded"

export type OrionOperationalMemoryImportance =
  | "low"
  | "medium"
  | "high"
  | "critical"

export type OrionOperationalMemoryItem = {
  id: string
  companyId: string
  memoryType: OrionOperationalMemoryType
  title: string
  summary: string
  entityType: string | null
  entityId: string | null
  status: OrionOperationalMemoryStatus
  importance: OrionOperationalMemoryImportance
  source: string
  evidence: Record<string, unknown>
  metadata: Record<string, unknown>
  lastSeenAt: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type OrionOperationalMemorySummary = {
  openItems: OrionOperationalMemoryItem[]
  recentDecisions: OrionOperationalMemoryItem[]
  openAlerts: OrionOperationalMemoryItem[]
  recommendedActions: OrionOperationalMemoryItem[]
}

export type OrionOperationalMemoryInput = {
  companyId: string
  memoryType: OrionOperationalMemoryType
  title: string
  summary: string
  entityType?: string | null
  entityId?: string | null
  status?: OrionOperationalMemoryStatus
  importance?: OrionOperationalMemoryImportance
  source?: string
  evidence?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type OrionMemoryQueryAdapter = {
  query<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
}

type OrionMemoryRow = {
  id: string
  company_id: string
  memory_type: OrionOperationalMemoryType
  title: string
  summary: string
  entity_type: string | null
  entity_id: string | null
  status: OrionOperationalMemoryStatus
  importance: OrionOperationalMemoryImportance
  source: string
  evidence: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  last_seen_at: string | Date
  resolved_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

type MemoryStoreOptions = {
  adapter?: OrionMemoryQueryAdapter
  logWarnings?: boolean
}

const MISSING_TABLE_CODE = "42P01"
const DEFAULT_MEMORY_LIMIT = 20

function adapterFromOptions(options?: MemoryStoreOptions) {
  return options?.adapter || pool
}

function shouldLog(options?: MemoryStoreOptions) {
  return options?.logWarnings !== false
}

function warnMemoryFailure(action: string, error: unknown, options?: MemoryStoreOptions) {
  if (!shouldLog(options)) return
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[orion-memory] ${action} skipped: ${code || message}`)
}

export function isMissingOperationalMemoryTable(error: unknown) {
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

function rowToItem(row: OrionMemoryRow): OrionOperationalMemoryItem {
  return {
    id: row.id,
    companyId: row.company_id,
    memoryType: row.memory_type,
    title: row.title,
    summary: row.summary,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    importance: row.importance,
    source: row.source,
    evidence: row.evidence || {},
    metadata: row.metadata || {},
    lastSeenAt: iso(row.last_seen_at) || "",
    resolvedAt: iso(row.resolved_at),
    createdAt: iso(row.created_at) || "",
    updatedAt: iso(row.updated_at) || "",
  }
}

function compactText(value: string, max = 360) {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

export function buildOrionMemorySummary(openItems: OrionOperationalMemoryItem[]): OrionOperationalMemorySummary {
  return {
    openItems,
    recentDecisions: openItems.filter((item) => item.memoryType === "owner_decision").slice(0, 5),
    openAlerts: openItems.filter((item) => item.memoryType === "open_alert").slice(0, 5),
    recommendedActions: openItems.filter((item) => item.memoryType === "recommended_action").slice(0, 5),
  }
}

export async function loadOpenOrionOperationalMemory(
  companyId: string,
  options?: MemoryStoreOptions
): Promise<OrionOperationalMemoryItem[]> {
  try {
    const result = await adapterFromOptions(options).query<OrionMemoryRow>(
      `
        SELECT *
        FROM orion_operational_memory
        WHERE company_id = $1::uuid
          AND status = 'open'
        ORDER BY
          CASE importance
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END DESC,
          updated_at DESC
        LIMIT $2
      `,
      [companyId, DEFAULT_MEMORY_LIMIT]
    )
    return result.rows.map(rowToItem)
  } catch (error) {
    warnMemoryFailure("load", error, options)
    return []
  }
}

export async function hasOrionOperationalMemoryTable(options?: MemoryStoreOptions): Promise<boolean> {
  try {
    const result = await adapterFromOptions(options).query<{ table_exists: string | null }>(
      "SELECT to_regclass('public.orion_operational_memory') AS table_exists"
    )
    return result.rows[0]?.table_exists === "orion_operational_memory"
      || result.rows[0]?.table_exists === "public.orion_operational_memory"
  } catch (error) {
    warnMemoryFailure("table-check", error, options)
    return false
  }
}

export async function upsertOrionOperationalMemory(
  input: OrionOperationalMemoryInput,
  options?: MemoryStoreOptions
): Promise<OrionOperationalMemoryItem | null> {
  const status = input.status || "open"
  const importance = input.importance || "medium"
  const source = input.source || "orion"
  const metadata = input.metadata || {}
  const evidence = input.evidence || {}
  const memoryKey = typeof metadata.memoryKey === "string" ? metadata.memoryKey.trim() : ""

  try {
    const existing = input.entityType && input.entityId
      ? await adapterFromOptions(options).query<OrionMemoryRow>(
          `
            SELECT *
            FROM orion_operational_memory
            WHERE company_id = $1::uuid
              AND entity_type = $2
              AND entity_id = $3::uuid
              AND memory_type = $4
              AND status = 'open'
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [input.companyId, input.entityType, input.entityId, input.memoryType]
        )
      : memoryKey
        ? await adapterFromOptions(options).query<OrionMemoryRow>(
            `
              SELECT *
              FROM orion_operational_memory
              WHERE company_id = $1::uuid
                AND memory_type = $2
                AND status = 'open'
                AND metadata->>'memoryKey' = $3
              ORDER BY updated_at DESC
              LIMIT 1
            `,
            [input.companyId, input.memoryType, memoryKey]
          )
        : { rows: [] }

    const current = existing.rows[0]
    const result = current
      ? await adapterFromOptions(options).query<OrionMemoryRow>(
          `
            UPDATE orion_operational_memory
            SET title = $2,
                summary = $3,
                importance = $4,
                source = $5,
                evidence = $6::jsonb,
                metadata = $7::jsonb,
                last_seen_at = now(),
                updated_at = now()
            WHERE id = $1::uuid
              AND company_id = $8::uuid
            RETURNING *
          `,
          [
            current.id,
            compactText(input.title, 120),
            compactText(input.summary),
            importance,
            source,
            JSON.stringify(evidence),
            JSON.stringify(metadata),
            input.companyId,
          ]
        )
      : await adapterFromOptions(options).query<OrionMemoryRow>(
          `
            INSERT INTO orion_operational_memory (
              company_id,
              memory_type,
              title,
              summary,
              entity_type,
              entity_id,
              status,
              importance,
              source,
              evidence,
              metadata
            )
            VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10::jsonb, $11::jsonb)
            RETURNING *
          `,
          [
            input.companyId,
            input.memoryType,
            compactText(input.title, 120),
            compactText(input.summary),
            input.entityType || null,
            input.entityId || null,
            status,
            importance,
            source,
            JSON.stringify(evidence),
            JSON.stringify(metadata),
          ]
        )

    return result.rows[0] ? rowToItem(result.rows[0]) : null
  } catch (error) {
    warnMemoryFailure("upsert", error, options)
    return null
  }
}

export async function resolveOrionOperationalMemory(
  companyId: string,
  memoryId: string,
  options?: MemoryStoreOptions
): Promise<void> {
  try {
    await adapterFromOptions(options).query(
      `
        UPDATE orion_operational_memory
        SET status = 'resolved',
            resolved_at = now(),
            updated_at = now()
        WHERE company_id = $1::uuid
          AND id = $2::uuid
      `,
      [companyId, memoryId]
    )
  } catch (error) {
    warnMemoryFailure("resolve", error, options)
  }
}

export async function ignoreOrionOperationalMemory(
  companyId: string,
  memoryId: string,
  options?: MemoryStoreOptions
): Promise<void> {
  try {
    await adapterFromOptions(options).query(
      `
        UPDATE orion_operational_memory
        SET status = 'ignored',
            resolved_at = now(),
            updated_at = now()
        WHERE company_id = $1::uuid
          AND id = $2::uuid
      `,
      [companyId, memoryId]
    )
  } catch (error) {
    warnMemoryFailure("ignore", error, options)
  }
}

export async function pruneOldOrionOperationalMemory(
  companyId: string,
  options?: MemoryStoreOptions
): Promise<void> {
  try {
    await adapterFromOptions(options).query(
      `
        UPDATE orion_operational_memory
        SET status = 'superseded',
            resolved_at = COALESCE(resolved_at, now()),
            updated_at = now()
        WHERE company_id = $1::uuid
          AND status = 'open'
          AND updated_at < now() - interval '180 days'
      `,
      [companyId]
    )
  } catch (error) {
    warnMemoryFailure("prune", error, options)
  }
}

function confidenceAllowsMemory(snapshot: OrionSnapshot) {
  return snapshot.finance.financialConfidenceBreakdown.overallConfidence >= 0.55
}

function questionLooksInformational(intent?: OrionIntentRouteSummary | null) {
  return intent?.intent === "financial_traceability" || intent?.intent === "unrelated_question"
}

function safeMemoryFromOperationalContext(input: {
  companyId: string
  userMessage: string
  operationalContext?: OrionOperationalContext | null
  finalResponse: string
  snapshot: OrionSnapshot
}): OrionOperationalMemoryInput | null {
  const context = input.operationalContext
  if (!context || context.dataStatus === "insufficient_data") return null
  if (!context.answer || context.answer.length < 24) return null
  if (context.intent === "cash_health_analysis" || context.intent === "purchase_capacity_analysis") {
    return {
      companyId: input.companyId,
      memoryType: context.intent === "purchase_capacity_analysis" ? "recommended_action" : "financial_context",
      title: context.intent === "purchase_capacity_analysis" ? "Recomendação de recompra registrada" : "Contexto financeiro recente",
      summary: compactText(context.answer),
      importance: input.snapshot.finance.financialOperationalContext.cashHealth === "critical" ? "high" : "medium",
      evidence: {
        dataStatus: context.dataStatus,
        intent: context.intent,
        evidence: context.evidence.slice(0, 3),
      },
      metadata: {
        memoryKey: `financial:${context.intent}:${input.snapshot.finance.selectedFinancialPeriod.preset}`,
        sourceQuestion: compactText(input.userMessage, 180),
      },
    }
  }
  if (context.intent === "crm_follow_up_analysis") {
    const lead = input.snapshot.marketing.forgottenLeads[0]
    if (!lead) return null
    return {
      companyId: input.companyId,
      memoryType: "follow_up",
      title: `Follow-up pendente: ${lead.name}`,
      summary: compactText(context.answer),
      entityType: "lead",
      entityId: lead.id,
      importance: lead.classification === "hot" ? "high" : "medium",
      evidence: {
        leadName: lead.name,
        daysWithoutAction: lead.daysWithoutAction,
        productInterest: lead.productInterest,
      },
      metadata: {
        memoryKey: `lead:forgotten:${lead.id}`,
        sourceQuestion: compactText(input.userMessage, 180),
      },
    }
  }
  if (context.intent === "inventory_product_analysis" || context.intent === "pricing_analysis") {
    const item = context.commercialSubject?.primarySubject || input.snapshot.stock.stuckItems[0] || null
    if (!item) return null
    const entityId = "inventoryId" in item ? item.inventoryId : item.id
    const productName = "productName" in item ? item.productName : item.name
    return {
      companyId: input.companyId,
      memoryType: context.intent === "pricing_analysis" ? "owner_decision" : "inventory_context",
      title: `Contexto de produto: ${productName}`,
      summary: compactText(context.answer),
      entityType: "inventory",
      entityId,
      importance: "medium",
      evidence: {
        productName,
        dataStatus: context.dataStatus,
      },
      metadata: {
        memoryKey: `inventory:context:${entityId}`,
        sourceQuestion: compactText(input.userMessage, 180),
      },
    }
  }
  return null
}

export function extractOperationalMemoryCandidates(input: {
  companyId: string
  userMessage: string | null
  intent?: OrionIntentRouteSummary | null
  decisionBase?: unknown
  snapshot: OrionSnapshot
  finalResponse?: string | null
  executionGuardrails?: OrionExecutionGuardrails | null
  operationalContext?: OrionOperationalContext | null
  analysis?: OrionAnalysis | null
  usedFallback?: boolean
}): OrionOperationalMemoryInput[] {
  if (!input.userMessage || !input.finalResponse) return []
  if (input.usedFallback) return []
  if (questionLooksInformational(input.intent)) return []
  if (!confidenceAllowsMemory(input.snapshot)) return []
  const candidates: OrionOperationalMemoryInput[] = []
  const contextMemory = safeMemoryFromOperationalContext({
    companyId: input.companyId,
    userMessage: input.userMessage,
    operationalContext: input.operationalContext,
    finalResponse: input.finalResponse,
    snapshot: input.snapshot,
  })
  if (contextMemory) candidates.push(contextMemory)

  const priority = input.analysis?.priority_focus
  if (priority && input.operationalContext?.dataStatus !== "insufficient_data") {
    candidates.push({
      companyId: input.companyId,
      memoryType: "recommended_action",
      title: compactText(priority.title, 120),
      summary: compactText(priority.next_action || priority.reason),
      importance: priority.priority,
      evidence: {
        area: priority.area,
        reason: priority.reason,
      },
      metadata: {
        memoryKey: `recommendation:${priority.area}:${priority.title}`.toLowerCase().replace(/\s+/g, "-"),
        sourceQuestion: compactText(input.userMessage, 180),
      },
    })
  }

  return candidates.slice(0, 3)
}

export async function persistOrionOperationalMemoryCandidates(
  candidates: OrionOperationalMemoryInput[],
  options?: MemoryStoreOptions
) {
  for (const candidate of candidates.slice(0, 3)) {
    await upsertOrionOperationalMemory(candidate, options)
  }
}
