import "server-only"

import type { PoolClient } from "pg"

export const AUDIT_DOMAINS = ["brand", "contact", "document"] as const
export type CompanySettingsAuditDomain = (typeof AUDIT_DOMAINS)[number]

export const AUDIT_ACTIONS = [
  "update_brand",
  "create_contact",
  "update_contact",
  "deactivate_contact",
  "reactivate_contact",
  "update_document_profile",
] as const
export type CompanySettingsAuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditLogParams = {
  client: PoolClient
  companyId: string
  actorUserId: string | null
  actorEmail: string | null
  domain: CompanySettingsAuditDomain
  entityTable: string
  entityId: string | null
  action: CompanySettingsAuditAction
  beforeSnapshot: Record<string, unknown> | null
  afterSnapshot: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export function rowToSnapshot(row: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!row) return null
  const snapshot: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    snapshot[key] = value instanceof Date ? value.toISOString() : value
  }
  return snapshot
}

export async function recordCompanySettingsAuditLog(params: AuditLogParams): Promise<void> {
  await params.client.query(
    `
      INSERT INTO company_settings_audit_logs (
        company_id,
        actor_user_id,
        actor_email,
        domain,
        entity_table,
        entity_id,
        action,
        before_snapshot,
        after_snapshot,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      params.companyId,
      params.actorUserId ?? null,
      params.actorEmail ?? null,
      params.domain,
      params.entityTable,
      params.entityId ?? null,
      params.action,
      params.beforeSnapshot != null ? JSON.stringify(params.beforeSnapshot) : null,
      params.afterSnapshot != null ? JSON.stringify(params.afterSnapshot) : null,
      params.metadata != null ? JSON.stringify(params.metadata) : null,
    ]
  )
}
