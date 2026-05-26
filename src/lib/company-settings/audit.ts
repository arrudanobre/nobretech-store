import "server-only"

import type { PoolClient } from "pg"

export const AUDIT_DOMAINS = ["brand", "contact", "document", "warranty"] as const
export type CompanySettingsAuditDomain = (typeof AUDIT_DOMAINS)[number]

export const AUDIT_ACTIONS = [
  "update_brand",
  "create_contact",
  "update_contact",
  "deactivate_contact",
  "reactivate_contact",
  "update_document_profile",
  "create_warranty_policy",
  "update_warranty_policy",
  "deactivate_warranty_policy",
  "create_warranty_term",
  "update_warranty_term",
  "deactivate_warranty_term",
] as const
export type CompanySettingsAuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditMetadata = {
  changedFields: string[]
  changedFieldLabels: string[]
  summary: string
}

const IGNORED_DIFF_FIELDS = new Set(["id", "company_id", "created_at", "updated_at"])

const FIELD_LABELS: Record<CompanySettingsAuditDomain, Record<string, string>> = {
  brand: {
    display_name: "Nome público",
    legal_name: "Nome legal",
    short_name: "Nome curto",
    slogan: "Slogan",
    public_description: "Descrição pública",
    canonical_domain: "Domínio canônico",
    city: "Cidade",
    state: "Estado",
    locale: "Idioma/região",
    primary_color: "Cor principal",
    accent_color: "Cor de destaque",
    logo_url: "Logo",
    favicon_url: "Favicon",
    apple_icon_url: "Ícone Apple",
    og_image_url: "Imagem de compartilhamento",
    theme_mode: "Tema",
    active: "Status",
  },
  contact: {
    channel_type: "Tipo",
    label: "Rótulo",
    value: "Valor do contato",
    url: "URL",
    is_primary: "Principal",
    is_public: "Público",
    sort_order: "Ordem",
    active: "Status",
  },
  document: {
    issuer_name: "Nome do emissor",
    legal_name: "Nome legal",
    document_number: "Documento",
    address_line: "Endereço",
    city: "Cidade",
    state: "Estado",
    phone: "Telefone",
    email: "Email",
    default_seller_name: "Vendedor padrão",
    signature_label: "Assinatura",
    effective_from: "Vigência inicial",
    effective_until: "Vigência final",
    active: "Status",
  },
  warranty: {
    // warranty_policies fields
    name: "Nome",
    product_type: "Tipo de produto",
    product_condition: "Condição",
    product_origin: "Origem",
    default_months: "Prazo padrão (meses)",
    default_days: "Prazo padrão (dias)",
    calculation_mode: "Modo de cálculo",
    warranty_nature: "Natureza da garantia",
    is_selectable: "Selecionável",
    is_default: "Padrão sugerido",
    selection_label: "Label de seleção",
    selection_description: "Descrição de seleção",
    legal_basis: "Base legal",
    priority: "Prioridade",
    public_label_template: "Label público",
    internal_description: "Descrição interna",
    requires_customer_identification: "Exige identificação",
    applies_to_sale: "Aplica em venda",
    applies_to_catalog: "Aplica no catálogo",
    applies_to_portal: "Aplica no portal",
    applies_to_documents: "Aplica em documentos",
    active: "Status",
    effective_from: "Vigência inicial",
    effective_until: "Vigência final",
    // warranty_policy_terms fields (no name conflicts with policy fields)
    term_type: "Tipo de cláusula",
    title: "Título",
    body: "Texto",
    sort_order: "Ordem",
  },
}

function buildSummary(action: CompanySettingsAuditAction, labels: string[]): string {
  if (action === "create_contact") return "Contato criado"
  if (action === "deactivate_contact") return "Contato inativado"
  if (action === "reactivate_contact") return "Contato reativado"
  if (action === "create_warranty_policy") return "Politica de garantia criada"
  if (action === "deactivate_warranty_policy") return "Politica de garantia inativada"
  if (action === "create_warranty_term") return "Clausula de garantia criada"
  if (action === "deactivate_warranty_term") return "Clausula de garantia inativada"

  if (labels.length === 0) {
    if (action === "update_brand") return "Marca atualizada"
    if (action === "update_contact") return "Contato atualizado"
    if (action === "update_document_profile") return "Perfil documental atualizado"
    if (action === "update_warranty_policy") return "Politica de garantia atualizada"
    if (action === "update_warranty_term") return "Clausula de garantia atualizada"
    return "Configuracao atualizada"
  }

  if (labels.length === 1) return `${labels[0]} alterado`
  if (labels.length === 2) return `${labels[0]} e ${labels[1]} alterados`
  const extra = labels.length - 2
  return `${labels[0]}, ${labels[1]} e mais ${extra} campo${extra === 1 ? "" : "s"}`
}

export function buildAuditMetadata(params: {
  action: CompanySettingsAuditAction
  domain: CompanySettingsAuditDomain
  beforeSnapshot: Record<string, unknown> | null
  afterSnapshot: Record<string, unknown> | null
}): AuditMetadata {
  const { action, domain, beforeSnapshot, afterSnapshot } = params

  if (action === "create_contact") {
    return { changedFields: [], changedFieldLabels: [], summary: "Contato criado" }
  }
  if (action === "deactivate_contact") {
    return { changedFields: ["active"], changedFieldLabels: ["Status"], summary: "Contato inativado" }
  }
  if (action === "reactivate_contact") {
    return { changedFields: ["active"], changedFieldLabels: ["Status"], summary: "Contato reativado" }
  }
  if (action === "create_warranty_policy") {
    return { changedFields: [], changedFieldLabels: [], summary: "Politica de garantia criada" }
  }
  if (action === "deactivate_warranty_policy") {
    return { changedFields: ["active"], changedFieldLabels: ["Status"], summary: "Politica de garantia inativada" }
  }
  if (action === "create_warranty_term") {
    return { changedFields: [], changedFieldLabels: [], summary: "Clausula de garantia criada" }
  }
  if (action === "deactivate_warranty_term") {
    return { changedFields: ["active"], changedFieldLabels: ["Status"], summary: "Clausula de garantia inativada" }
  }

  const labelMap = FIELD_LABELS[domain]
  const allKeys = new Set([
    ...Object.keys(beforeSnapshot ?? {}),
    ...Object.keys(afterSnapshot ?? {}),
  ])

  const changedFields: string[] = []
  for (const key of allKeys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue
    if (!(key in labelMap)) continue
    const before = beforeSnapshot?.[key] ?? null
    const after = afterSnapshot?.[key] ?? null
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changedFields.push(key)
    }
  }

  const changedFieldLabels = changedFields.map((f) => labelMap[f] ?? f)
  return { changedFields, changedFieldLabels, summary: buildSummary(action, changedFieldLabels) }
}

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
