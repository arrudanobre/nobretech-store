import type {
  OrionDecisionMemoryItem,
  OrionDecisionResultStatus,
} from "./orion-decision-memory-store"
import type { OrionSnapshot } from "./types"

export type OrionDecisionReflection = {
  memoryId: string
  resultStatus: OrionDecisionResultStatus
  reflection: string
  actualOutcome: Record<string, unknown>
}

type ReflectionInput = {
  snapshot: OrionSnapshot
  memory: OrionDecisionMemoryItem
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function readEntityLabel(memory: OrionDecisionMemoryItem) {
  const payload = memory.decisionPayload || {}
  const direct = typeof payload.entityLabel === "string" ? payload.entityLabel
    : typeof payload.productLabel === "string" ? payload.productLabel
    : typeof payload.primaryProductLabel === "string" ? payload.primaryProductLabel
    : null
  return direct || null
}

function reflectCapitalAllocation({ snapshot, memory }: ReflectionInput): OrionDecisionReflection {
  const label = readEntityLabel(memory)
  if (!label) {
    return {
      memoryId: memory.id,
      resultStatus: "inconclusive",
      reflection: "Decisão sem produto-alvo claro; reflexão requer item identificado.",
      actualOutcome: { reason: "no_target_label" },
    }
  }
  const norm = normalizeLabel(label)
  const stockMatch = (snapshot.stock?.availableItems || []).find((item) => normalizeLabel(item.name).includes(norm) || norm.includes(normalizeLabel(item.name)))
  const stuckMatch = (snapshot.stock?.stuckItems || []).find((item) => normalizeLabel(item.name).includes(norm) || norm.includes(normalizeLabel(item.name)))
  const candidate = (snapshot.sales?.reinvestmentCandidates || []).find((item) => normalizeLabel(item.label).includes(norm) || norm.includes(normalizeLabel(item.label)))

  if (stuckMatch && stuckMatch.daysInStock >= 45) {
    return {
      memoryId: memory.id,
      resultStatus: "failed",
      reflection: `Compra de ${label} virou estoque parado: ${stuckMatch.daysInStock} dias sem giro. Reduzir prioridade no próximo ciclo.`,
      actualOutcome: { entityLabel: label, daysInStock: stuckMatch.daysInStock, signal: "stuck" },
    }
  }
  if (candidate && candidate.recentSalesCount > 0 && candidate.averageMarginPct >= 15) {
    return {
      memoryId: memory.id,
      resultStatus: "successful",
      reflection: `Recomendação de ${label} se confirmou: ${candidate.recentSalesCount} venda(s) recentes com margem média ${candidate.averageMarginPct.toFixed(1)}%.`,
      actualOutcome: { entityLabel: label, recentSalesCount: candidate.recentSalesCount, marginPct: candidate.averageMarginPct, signal: "sold_with_margin" },
    }
  }
  if (candidate && candidate.recentSalesCount > 0) {
    return {
      memoryId: memory.id,
      resultStatus: "mixed",
      reflection: `Houve venda de ${label}, mas margem ficou abaixo do esperado (${candidate.averageMarginPct.toFixed(1)}%). Ajustar custo de entrada ou preço.`,
      actualOutcome: { entityLabel: label, recentSalesCount: candidate.recentSalesCount, marginPct: candidate.averageMarginPct, signal: "sold_low_margin" },
    }
  }
  if (stockMatch) {
    return {
      memoryId: memory.id,
      resultStatus: "pending",
      reflection: `${label} entrou em estoque (${stockMatch.daysInStock} dias) mas ainda não vendeu. Aguardando giro.`,
      actualOutcome: { entityLabel: label, daysInStock: stockMatch.daysInStock, signal: "in_stock_no_sale" },
    }
  }
  return {
    memoryId: memory.id,
    resultStatus: "inconclusive",
    reflection: `Sem evidência de compra ou venda de ${label} no snapshot atual.`,
    actualOutcome: { entityLabel: label, signal: "no_evidence" },
  }
}

function reflectMarketingStrategy({ snapshot, memory }: ReflectionInput): OrionDecisionReflection {
  const campaigns = snapshot.marketing?.campaigns || []
  const label = readEntityLabel(memory)
  const norm = label ? normalizeLabel(label) : null
  const relevant = norm
    ? campaigns.find((campaign) => normalizeLabel(campaign.name).includes(norm) || normalizeLabel(campaign.name).includes(norm.split("-")[0]))
    : campaigns[0]

  if (!relevant) {
    return {
      memoryId: memory.id,
      resultStatus: "inconclusive",
      reflection: "Sem campanha registrada para avaliar resultado da decisão.",
      actualOutcome: { signal: "no_campaign" },
    }
  }
  if (relevant.sales > 0 && relevant.roi > 1) {
    return {
      memoryId: memory.id,
      resultStatus: "successful",
      reflection: `Tráfego virou venda: ${relevant.sales} venda(s) e ROI ${relevant.roi.toFixed(2)}. Pode aumentar leve.`,
      actualOutcome: { campaign: relevant.name, sales: relevant.sales, roi: relevant.roi, signal: "converted" },
    }
  }
  if (relevant.leads > 0 && relevant.sales === 0) {
    return {
      memoryId: memory.id,
      resultStatus: "failed",
      reflection: `Campanha gerou ${relevant.leads} lead(s) sem venda. Revisar produto âncora ou oferta antes de manter gasto.`,
      actualOutcome: { campaign: relevant.name, leads: relevant.leads, sales: 0, signal: "lead_no_sale" },
    }
  }
  if (relevant.sales > 0) {
    return {
      memoryId: memory.id,
      resultStatus: "mixed",
      reflection: `Houve venda na campanha, mas ROI baixo (${relevant.roi.toFixed(2)}). Avaliar custo de entrada.`,
      actualOutcome: { campaign: relevant.name, sales: relevant.sales, roi: relevant.roi, signal: "low_roi" },
    }
  }
  return {
    memoryId: memory.id,
    resultStatus: "pending",
    reflection: "Campanha ativa sem dados suficientes para julgar.",
    actualOutcome: { campaign: relevant.name, signal: "pending" },
  }
}

function reflectInventoryPriority({ snapshot, memory }: ReflectionInput): OrionDecisionReflection {
  const label = readEntityLabel(memory)
  if (!label) {
    return {
      memoryId: memory.id,
      resultStatus: "inconclusive",
      reflection: "Decisão de estoque sem item-alvo identificado.",
      actualOutcome: { signal: "no_target" },
    }
  }
  const norm = normalizeLabel(label)
  const stillStuck = (snapshot.stock?.stuckItems || []).find((item) => normalizeLabel(item.name).includes(norm))
  if (!stillStuck) {
    return {
      memoryId: memory.id,
      resultStatus: "successful",
      reflection: `${label} não aparece mais como estoque preso. Decisão funcionou.`,
      actualOutcome: { entityLabel: label, signal: "cleared" },
    }
  }
  return {
    memoryId: memory.id,
    resultStatus: "pending",
    reflection: `${label} ainda parado (${stillStuck.daysInStock} dias). Ação não foi executada ou não converteu.`,
    actualOutcome: { entityLabel: label, daysInStock: stillStuck.daysInStock, signal: "still_stuck" },
  }
}

function reflectBusinessStrategy({ snapshot, memory }: ReflectionInput): OrionDecisionReflection {
  const label = readEntityLabel(memory)
  if (label) {
    return reflectCapitalAllocation({ snapshot, memory })
  }
  return {
    memoryId: memory.id,
    resultStatus: "pending",
    reflection: "Estratégia em curso; reflexão requer marcos específicos para fechar.",
    actualOutcome: { signal: "strategy_pending" },
  }
}

export function buildDecisionReflection(input: ReflectionInput): OrionDecisionReflection {
  switch (input.memory.decisionType) {
    case "capital_allocation":
      return reflectCapitalAllocation(input)
    case "marketing_strategy":
      return reflectMarketingStrategy(input)
    case "inventory_priority":
      return reflectInventoryPriority(input)
    case "business_strategy":
      return reflectBusinessStrategy(input)
    case "sales_performance":
    case "cash_health":
    case "operational_action":
    default:
      return {
        memoryId: input.memory.id,
        resultStatus: "inconclusive",
        reflection: "Tipo de decisão sem reflexão determinística por enquanto.",
        actualOutcome: { signal: "no_reflection_rule" },
      }
  }
}

export function buildDecisionReflections(
  snapshot: OrionSnapshot,
  memories: OrionDecisionMemoryItem[]
): OrionDecisionReflection[] {
  return memories
    .filter((memory) => memory.status === "open" || memory.status === "in_progress")
    .map((memory) => buildDecisionReflection({ snapshot, memory }))
}
