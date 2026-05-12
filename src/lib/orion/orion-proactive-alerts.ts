import type { OrionOperationalMemoryItem } from "@/lib/orion/orion-operational-memory-store"
import type { OrionSnapshot } from "@/lib/orion/types"

export type OrionProactiveAlertPriority =
  | "critical"
  | "high"
  | "medium"
  | "low"

export type OrionProactiveAlertCategory =
  | "financial"
  | "inventory"
  | "lead"
  | "sales"
  | "marketing"
  | "operational"

export type OrionProactiveAlert = {
  id: string
  category: OrionProactiveAlertCategory
  priority: OrionProactiveAlertPriority
  title: string
  message: string
  recommendedAction: string
  evidence: Array<{
    label: string
    value: string
  }>
  entityType: string | null
  entityId: string | null
  metadata: {
    memoryKey: string
    [key: string]: unknown
  }
}

export type BuildOrionProactiveAlertsInput = {
  snapshot: OrionSnapshot
  memoryItems: OrionOperationalMemoryItem[]
}

export type FilterStaleOrionMemoryResult = {
  valid: OrionOperationalMemoryItem[]
  stale: OrionOperationalMemoryItem[]
}

const priorityRank: Record<OrionProactiveAlertPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value)
}

function compact(value: string, max = 220) {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function financialAlert(snapshot: OrionSnapshot): OrionProactiveAlert | null {
  const finance = snapshot.finance
  const forecast = snapshot.executive.liquidityForecast
  const profit = finance.profitAvailabilitySnapshot
  const composition = finance.currentCashCompositionSnapshot
  const workingCapital = finance.workingCapitalSnapshot
  const profitAfterWithdrawals = profit.profitAfterWithdrawals
  const upcomingBills = forecast.payables7d || forecast.payables15d || forecast.payables30d
  const cashAfterBills = finance.reconciledCashBalance - forecast.payables7d + forecast.receivables7d
  const covered = cashAfterBills >= 0

  if (profitAfterWithdrawals <= 0 && upcomingBills > 0 && !covered) {
    return {
      id: "financial-pressure",
      category: "financial",
      priority: "critical",
      title: "Caixa exige preservação hoje",
      message: `Antes de comprar ou retirar, o ponto sensível é caixa: há ${brl(forecast.payables7d)} em contas próximas contra ${brl(forecast.receivables7d)} a receber.`,
      recommendedAction: "Preserve caixa e priorize venda/recebimento antes de aumentar estoque ou retirada.",
      evidence: [
        { label: "Caixa reconciliado", value: brl(finance.reconciledCashBalance) },
        { label: "Contas 7d", value: brl(forecast.payables7d) },
        { label: "Recebíveis 7d", value: brl(forecast.receivables7d) },
      ],
      entityType: null,
      entityId: null,
      metadata: { memoryKey: "financial:cash-pressure:7d" },
    }
  }

  if (profitAfterWithdrawals > 0 && profitAfterWithdrawals < workingCapital.safeWithdrawalAmount && upcomingBills > 0) {
    return {
      id: "financial-short-withdrawal-margin",
      category: "financial",
      priority: covered ? "medium" : "high",
      title: "Margem de retirada curta",
      message: covered
        ? "Seu caixa cobre as contas próximas, mas a folga para retirada continua curta."
        : "A margem para retirada está curta e as contas próximas reduzem a folga operacional.",
      recommendedAction: "Aguarde a próxima venda conciliada antes de elevar retirada ou recompra.",
      evidence: [
        { label: "Lucro após retiradas", value: brl(profitAfterWithdrawals) },
        { label: "Retirada prudente", value: brl(workingCapital.safeWithdrawalAmount) },
        { label: "Caixa disponível", value: brl(composition.availableForWithdrawal) },
      ],
      entityType: null,
      entityId: null,
      metadata: { memoryKey: `financial:withdrawal-margin:${profit.period.preset}` },
    }
  }

  return null
}

function inventoryAlert(snapshot: OrionSnapshot): OrionProactiveAlert | null {
  const item = snapshot.stock.stuckItems[0]
  if (!item || item.daysInStock < 30) return null
  const capital = item.purchasePrice
  return {
    id: `inventory-stuck-${item.id}`,
    category: "inventory",
    priority: item.daysInStock >= 60 ? "high" : "medium",
    title: `${item.name} parado no estoque`,
    message: `${item.name} está parado há ${item.daysInStock} dias. Antes de comprar novo estoque, vale priorizar liquidez nesse item.`,
    recommendedAction: "Faça uma ação direta de 48h com garantia, parcelamento e pronta entrega antes de reduzir preço.",
    evidence: [
      { label: "Dias em estoque", value: `${item.daysInStock}` },
      { label: "Capital imobilizado", value: brl(capital) },
      { label: "Preço referência", value: brl(item.suggestedPrice) },
    ],
    entityType: "inventory",
    entityId: item.id,
    metadata: { memoryKey: `inventory:stuck-item:${item.id}` },
  }
}

function leadAlert(snapshot: OrionSnapshot): OrionProactiveAlert | null {
  const lead = snapshot.marketing.forgottenLeads.find((item) => item.classification === "hot") || snapshot.marketing.forgottenLeads[0]
  if (!lead || lead.daysWithoutAction < 1) return null
  const product = lead.productInterest ? ` sobre ${lead.productInterest}` : ""
  return {
    id: `lead-forgotten-${lead.id}`,
    category: "lead",
    priority: lead.classification === "hot" ? "high" : "medium",
    title: `Follow-up pendente: ${lead.name}`,
    message: `${lead.name}${product} está sem retorno há ${lead.daysWithoutAction} dia(s). Isso é mais urgente que abrir campanha nova.`,
    recommendedAction: "Responder agora com oferta objetiva, garantia, parcelamento e pergunta de fechamento.",
    evidence: [
      { label: "Lead", value: lead.name },
      { label: "Sem ação", value: `${lead.daysWithoutAction} dia(s)` },
      { label: "Interesse", value: lead.productInterest || "Não informado" },
    ],
    entityType: "lead",
    entityId: lead.id,
    metadata: { memoryKey: `lead:forgotten:${lead.id}` },
  }
}

// Minimum lost leads to trigger the conversion review alert.
const LOST_LEADS_ALERT_THRESHOLD = 3

// Stable memoryKey root for campaign alerts — both subtypes share the same key so that
// a "no-sale" memory is overwritten when the campaign later generates attributed sales.
function campaignMemoryKey(campaignId: string) {
  return `campaign:marketing:${campaignId}`
}

function campaignAlert(snapshot: OrionSnapshot): OrionProactiveAlert | null {
  // No-sale: campaign spent, got leads, but zero sales AND zero attributed revenue.
  const noSaleCampaign = snapshot.marketing.campaigns.find(
    (item) => item.spend > 0 && item.leads > 0 && item.sales === 0 && item.revenue === 0
  )
  if (noSaleCampaign) {
    return {
      id: `campaign-follow-up-${noSaleCampaign.id}`,
      category: "marketing",
      priority: "medium",
      title: "Campanha gerou lead, mas não venda",
      message: `${noSaleCampaign.name} gerou ${noSaleCampaign.leads} lead(s) sem venda registrada.`,
      recommendedAction: "Revisar atendimento e follow-up antes de aumentar verba.",
      evidence: [
        { label: "Campanha", value: noSaleCampaign.name },
        { label: "Leads", value: `${noSaleCampaign.leads}` },
        { label: "Gasto", value: brl(noSaleCampaign.spend) },
      ],
      entityType: "campaign",
      entityId: noSaleCampaign.id,
      metadata: {
        memoryKey: campaignMemoryKey(noSaleCampaign.id),
        alertSubtype: "campaign_no_sale",
        campaignId: noSaleCampaign.id,
      },
    }
  }

  // Conversion review: campaign has attributed sales/revenue, but many leads did not convert.
  const partialCampaign = snapshot.marketing.campaigns.find((item) => {
    if (item.spend <= 0 || item.leads <= 0) return false
    if (item.sales === 0 && item.revenue === 0) return false
    return item.lostLeads >= LOST_LEADS_ALERT_THRESHOLD
  })
  if (!partialCampaign) return null

  const lostLeads = partialCampaign.lostLeads
  const evidence: Array<{ label: string; value: string }> = [
    { label: "Campanha", value: partialCampaign.name },
    { label: "Leads gerados", value: `${partialCampaign.leads}` },
    { label: "Vendas atribuídas", value: `${partialCampaign.sales}` },
  ]
  if (partialCampaign.revenue > 0) evidence.push({ label: "Receita atribuída", value: brl(partialCampaign.revenue) })
  if (partialCampaign.roi > 0) evidence.push({ label: "ROI", value: `${partialCampaign.roi.toFixed(1)}x` })
  evidence.push({ label: "Leads perdidos", value: `${lostLeads}` })

  return {
    id: `campaign-conversion-${partialCampaign.id}`,
    category: "marketing",
    priority: "medium",
    title: "Campanha performou — revisar conversão",
    message: `${partialCampaign.name} gerou ${partialCampaign.sales} venda(s), mas ${lostLeads} lead(s) não converteram. Conversão ou atendimento precisa revisão.`,
    recommendedAction: "Revisar processo de atendimento e follow-up para os leads não convertidos antes de escalar verba.",
    evidence,
    entityType: "campaign",
    entityId: partialCampaign.id,
    metadata: {
      memoryKey: campaignMemoryKey(partialCampaign.id),
      alertSubtype: "campaign_conversion_review",
      campaignId: partialCampaign.id,
    },
  }
}

/**
 * Extracts a campaignId from a memory item.
 * Prefers explicit entityId (entityType=campaign) over key pattern parsing,
 * so historical memories with old key formats still resolve correctly.
 */
function extractCampaignIdFromMemory(item: OrionOperationalMemoryItem): string | null {
  if (item.entityType === "campaign" && item.entityId) return item.entityId
  const key = typeof item.metadata.memoryKey === "string" ? item.metadata.memoryKey : null
  if (!key) return null
  // Matches: campaign:follow-up:ID, campaign:conversion-review:ID, campaign:marketing:ID
  const match = key.match(/^campaign:[^:]+:(.+)$/)
  return match ? match[1] : null
}

/**
 * Separates memory items into valid (consistent with current snapshot) and stale
 * (contradicted by current snapshot data). Stale items should be resolved async.
 *
 * A campaign "no-sale" memory is stale when the same campaign now has attributed
 * sales or revenue in the snapshot.
 */
export function filterStaleOrionMemoryItems(
  items: OrionOperationalMemoryItem[],
  snapshot: OrionSnapshot
): FilterStaleOrionMemoryResult {
  const campaignById = new Map(snapshot.marketing.campaigns.map((c) => [c.id, c]))
  const valid: OrionOperationalMemoryItem[] = []
  const stale: OrionOperationalMemoryItem[] = []

  for (const item of items) {
    if (item.memoryType !== "open_alert") {
      valid.push(item)
      continue
    }

    const campaignId = extractCampaignIdFromMemory(item)
    if (!campaignId) {
      valid.push(item)
      continue
    }

    const campaign = campaignById.get(campaignId)
    if (!campaign) {
      valid.push(item)
      continue
    }

    const alertSubtype = typeof item.metadata.alertSubtype === "string" ? item.metadata.alertSubtype : null
    const key = typeof item.metadata.memoryKey === "string" ? item.metadata.memoryKey : ""
    // A memory implies "no sale" when explicitly tagged or created with the legacy follow-up key.
    const impliesNoSale = alertSubtype === "campaign_no_sale" || key.includes(":follow-up:")
    const snapshotHasSale = campaign.sales > 0 || campaign.revenue > 0

    if (impliesNoSale && snapshotHasSale) {
      stale.push(item)
    } else {
      valid.push(item)
    }
  }

  return { valid, stale }
}

function memoryAlert(
  memoryItems: OrionOperationalMemoryItem[],
  snapshotAlerts: OrionProactiveAlert[]
): OrionProactiveAlert | null {
  const existingKeys = new Set(snapshotAlerts.map((a) => a.metadata.memoryKey))
  // Also deduplicate by entity — suppresses legacy-keyed memories for the same entity
  // (e.g., old campaign:follow-up:X key for a campaign that now has campaign:marketing:X alert).
  const existingEntities = new Set(
    snapshotAlerts
      .filter((a) => a.entityType && a.entityId)
      .map((a) => `${a.entityType}:${a.entityId}`)
  )

  const eligible = memoryItems.filter((item) => {
    const key = typeof item.metadata.memoryKey === "string" ? item.metadata.memoryKey : null
    if (key && existingKeys.has(key)) return false
    if (item.entityType && item.entityId && existingEntities.has(`${item.entityType}:${item.entityId}`)) return false
    return true
  })

  const memory = eligible.find((item) => item.memoryType === "owner_decision")
    || eligible.find((item) => item.memoryType === "recommended_action")
    || eligible.find((item) => item.memoryType === "open_alert")
  if (!memory) return null
  const memoryKey = typeof memory.metadata.memoryKey === "string"
    ? `memory:reminder:${memory.metadata.memoryKey}`
    : `memory:reminder:${memory.id}`
  return {
    id: `memory-${memory.id}`,
    category: "operational",
    priority: memory.importance === "critical" || memory.importance === "high" ? "high" : "low",
    title: memory.title,
    message: compact(`Isso segue aberto na memória operacional: ${memory.summary}`),
    recommendedAction: "Revisar se a decisão continua válida com os dados atuais antes de mudar rota.",
    evidence: [
      { label: "Tipo", value: memory.memoryType },
      { label: "Status", value: memory.status },
    ],
    entityType: memory.entityType,
    entityId: memory.entityId,
    metadata: { memoryKey },
  }
}

function hasEvidence(alert: OrionProactiveAlert) {
  return alert.evidence.some((item) => item.value.trim())
}

export function buildOrionProactiveAlerts(input: BuildOrionProactiveAlertsInput): OrionProactiveAlert[] {
  const { valid: validMemories } = filterStaleOrionMemoryItems(input.memoryItems, input.snapshot)

  const snapshotAlerts = [
    financialAlert(input.snapshot),
    leadAlert(input.snapshot),
    inventoryAlert(input.snapshot),
    campaignAlert(input.snapshot),
  ].filter((alert): alert is OrionProactiveAlert => Boolean(alert && hasEvidence(alert)))

  const memAlert = memoryAlert(validMemories, snapshotAlerts)

  return [...snapshotAlerts, ...(memAlert && hasEvidence(memAlert) ? [memAlert] : [])]
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
    .slice(0, 3)
}
