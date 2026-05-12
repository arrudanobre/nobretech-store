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

function campaignAlert(snapshot: OrionSnapshot): OrionProactiveAlert | null {
  const campaign = snapshot.marketing.campaigns.find((item) => item.spend > 0 && item.sales === 0 && item.leads > 0)
  if (!campaign) return null
  return {
    id: `campaign-follow-up-${campaign.id}`,
    category: "marketing",
    priority: "medium",
    title: "Campanha gerou lead, mas não venda",
    message: `${campaign.name} gerou ${campaign.leads} lead(s), sem venda registrada no snapshot.`,
    recommendedAction: "Revisar atendimento e follow-up antes de aumentar verba.",
    evidence: [
      { label: "Campanha", value: campaign.name },
      { label: "Leads", value: `${campaign.leads}` },
      { label: "Gasto", value: brl(campaign.spend) },
    ],
    entityType: "campaign",
    entityId: campaign.id,
    metadata: { memoryKey: `campaign:follow-up:${campaign.id}` },
  }
}

function memoryAlert(memoryItems: OrionOperationalMemoryItem[]): OrionProactiveAlert | null {
  const memory = memoryItems.find((item) => item.memoryType === "owner_decision")
    || memoryItems.find((item) => item.memoryType === "recommended_action")
    || memoryItems.find((item) => item.memoryType === "open_alert")
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
  return [
    financialAlert(input.snapshot),
    leadAlert(input.snapshot),
    inventoryAlert(input.snapshot),
    campaignAlert(input.snapshot),
    memoryAlert(input.memoryItems),
  ]
    .filter((alert): alert is OrionProactiveAlert => Boolean(alert && hasEvidence(alert)))
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
    .slice(0, 3)
}
