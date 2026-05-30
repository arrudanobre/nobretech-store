import "server-only"

import { loadAdminCatalog } from "@/lib/catalog/admin-queries"
import type { CatalogReadiness } from "@/lib/catalog/admin-types"
import {
  conditionFromProductKind,
  getCatalogPublicationPolicies,
  getCatalogPublicationPoliciesForDiagnostics,
  getCatalogReadinessRulesForPoliciesForDiagnostics,
  pickPolicyForCriteria,
  type CatalogPublicationPolicy,
  type CatalogReadinessRule,
} from "@/lib/catalog/policies"

export type CatalogPolicyRuleSummary = {
  id: string
  label: string
  severity: "block" | "warning"
  message: string
  active: boolean
}

export type CatalogPublicationPolicySummary = {
  id: string
  label: string
  scopeDescription: string
  statusLabels: string[]
  maxProductsLabel: string
  requiresRealPhotoLabel: string
  requiresReviewLabel: string
  requiresIncludedItemsLabel: string
  requiresPublicPriceLabel: string
  activeLabel: string
  active: boolean
  rules: CatalogPolicyRuleSummary[]
}

export type CatalogPublicationDiagnosticsItem = {
  inventoryId: string
  product: string
  subtitle: string | null
  inventoryStatusLabel: string
  conditionLabel: string
  publicationLabel: string
  policyLabel: string
  readinessLabel: string
  readinessStatus: "published" | "ready" | "blocked" | "warning" | "draft"
  reasons: string[]
  warnings: string[]
}

export type CatalogPublicationRulesPanelData = {
  policies: CatalogPublicationPolicySummary[]
  blockingRules: CatalogPolicyRuleSummary[]
  warningRules: CatalogPolicyRuleSummary[]
  diagnostics: CatalogPublicationDiagnosticsItem[]
  summary: {
    totalPolicies: number
    activePolicies: number
    blockingRules: number
    warningRules: number
    products: number
    published: number
    ready: number
    blocked: number
    warnings: number
    draft: number
  }
}

function labelStatus(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === "active" || normalized === "in_stock") return "Em estoque / ativo"
  if (normalized === "reserved") return "Reservado"
  if (normalized === "pending") return "Pendente"
  if (normalized === "sold") return "Vendido"
  if (normalized === "returned") return "Devolvido"
  if (normalized === "under_repair") return "Em assistência"
  return status.replace(/_/g, " ")
}

function labelPolicyScope(policy: CatalogPublicationPolicy): { label: string; description: string } {
  if (!policy.productType && !policy.condition) {
    return { label: "Regra padrão", description: "Aplicada quando nenhuma regra mais específica atende ao produto." }
  }
  if (policy.condition === "sealed") {
    return { label: "Produtos lacrados", description: "Produtos novos/lacrados que podem usar asset padrão como imagem pública." }
  }
  if (policy.condition === "used") {
    return { label: "Produtos seminovos", description: "Produtos usados/seminovos com exigências de transparência para publicação." }
  }
  if (policy.productType === "accessory") {
    return { label: "Acessórios", description: "Regra preparada para acessórios quando configurada." }
  }
  return { label: "Regra específica", description: "Regra aplicada por tipo ou condição de produto." }
}

function labelCondition(condition: string | null): string {
  if (condition === "sealed" || condition === "Lacrado") return "Lacrado"
  if (condition === "used" || condition === "seminovo") return "Seminovo"
  if (condition === "open_box") return "Open box"
  return condition || "Não informado"
}

function labelRule(rule: CatalogReadinessRule): string {
  if (rule.ruleKey === "defect_score_max") return "Defeito acima do limite permitido"
  if (rule.ruleKey === "real_photo_recommended") return "Foto real recomendada"
  return rule.message
}

function labelBoolean(value: boolean, yes: string, no: string): string {
  return value ? yes : no
}

function mapRule(rule: CatalogReadinessRule): CatalogPolicyRuleSummary {
  return {
    id: rule.id,
    label: labelRule(rule),
    severity: rule.severity,
    message: rule.message,
    active: rule.active,
  }
}

function mapPolicy(policy: CatalogPublicationPolicy, rules: CatalogReadinessRule[]): CatalogPublicationPolicySummary {
  const scope = labelPolicyScope(policy)
  return {
    id: policy.id,
    label: scope.label,
    scopeDescription: scope.description,
    statusLabels: policy.allowedInventoryStatuses.map(labelStatus),
    maxProductsLabel: policy.maxProducts == null ? "Sem limite específico" : `Até ${policy.maxProducts} produtos`,
    requiresRealPhotoLabel: labelBoolean(policy.requiresRealPhoto, "Exige foto real", "Não exige foto real"),
    requiresReviewLabel: labelBoolean(policy.requiresReview, "Exige conferência/revisão", "Não exige revisão"),
    requiresIncludedItemsLabel: labelBoolean(policy.requiresIncludedItems, "Exige itens inclusos", "Itens inclusos opcionais"),
    requiresPublicPriceLabel: labelBoolean(policy.requiresPublicPrice, "Exige preço público", "Preço público opcional"),
    activeLabel: policy.active ? "Ativa" : "Inativa",
    active: policy.active,
    rules: rules.map(mapRule),
  }
}

function diagnosticState(readiness: CatalogReadiness): {
  label: string
  status: CatalogPublicationDiagnosticsItem["readinessStatus"]
} {
  if (readiness.status === "published") {
    return readiness.warnings.length > 0
      ? { label: "Publicado com alerta", status: "warning" }
      : { label: "Publicado", status: "published" }
  }
  if (readiness.status === "ready") {
    return readiness.warnings.length > 0
      ? { label: "Pronto com alerta", status: "warning" }
      : { label: "Pronto para publicar", status: "ready" }
  }
  if (readiness.status === "blocked" || readiness.reasons.length > 0) {
    return { label: "Bloqueado", status: "blocked" }
  }
  return { label: "Não publicado", status: "draft" }
}

export async function loadCatalogPublicationRulesPanel(
  companyId: string
): Promise<CatalogPublicationRulesPanelData> {
  const [allPolicies, activePolicies, adminCatalog] = await Promise.all([
    getCatalogPublicationPoliciesForDiagnostics(companyId),
    getCatalogPublicationPolicies(companyId),
    loadAdminCatalog(companyId),
  ])

  const rulesByPolicy = await getCatalogReadinessRulesForPoliciesForDiagnostics(allPolicies.map((policy) => policy.id))
  const policyCards = allPolicies.map((policy) => mapPolicy(policy, rulesByPolicy.get(policy.id) ?? []))
  const rules = policyCards.flatMap((policy) => policy.rules)

  const diagnostics = adminCatalog.items.map((item) => {
    const appliedPolicy = pickPolicyForCriteria(activePolicies, {
      productType: "device",
      condition: conditionFromProductKind(item.productKind),
    })
    const state = diagnosticState(item.readiness)

    return {
      inventoryId: item.inventoryId,
      product: item.title,
      subtitle: item.subtitle,
      inventoryStatusLabel: labelStatus(item.inventoryStatus),
      conditionLabel: labelCondition(item.productKind),
      publicationLabel: item.publication?.is_published ? "Publicado" : "Não publicado",
      policyLabel: appliedPolicy ? labelPolicyScope(appliedPolicy).label : "Regra legada",
      readinessLabel: state.label,
      readinessStatus: state.status,
      reasons: item.readiness.reasons,
      warnings: item.readiness.warnings,
    }
  })

  const summary = diagnostics.reduce(
    (acc, item) => {
      acc.products += 1
      if (item.publicationLabel === "Publicado") acc.published += 1
      if (item.readinessStatus === "ready") acc.ready += 1
      if (item.readinessStatus === "blocked") acc.blocked += 1
      if (item.readinessStatus === "warning") acc.warnings += 1
      if (item.readinessStatus === "draft") acc.draft += 1
      return acc
    },
    {
      totalPolicies: policyCards.length,
      activePolicies: policyCards.filter((policy) => policy.active).length,
      blockingRules: rules.filter((rule) => rule.severity === "block").length,
      warningRules: rules.filter((rule) => rule.severity === "warning").length,
      products: 0,
      published: 0,
      ready: 0,
      blocked: 0,
      warnings: 0,
      draft: 0,
    }
  )

  return {
    policies: policyCards,
    blockingRules: rules.filter((rule) => rule.severity === "block"),
    warningRules: rules.filter((rule) => rule.severity === "warning"),
    diagnostics,
    summary,
  }
}
