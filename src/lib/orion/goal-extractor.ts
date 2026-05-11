import "server-only"

import { isFinancialTraceabilityRequest } from "./financial-traceability-router"
import type { OrionIntentRouteSummary, OrionOperationalConversationState, OrionOperationalGoal } from "./types"

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function parseMoney(value: string) {
  const match = value.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/i)
  if (!match) return null
  const parsed = Number(match[0].replace(/r\$/i, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseHorizonDays(text: string) {
  const explicit = text.match(/\b(?:em|nos proximos|nos próximos|dentro de)\s+(\d{1,3})\s+dias?\b/i)
  if (explicit?.[1]) return Number(explicit[1])
  if (/\bhoje\b/.test(normalizeText(text))) return 1
  if (/\bessa semana|esta semana|semana\b/.test(normalizeText(text))) return 7
  return null
}

export function extractOperationalGoal(input: {
  message?: string | null
  previousState?: OrionOperationalConversationState | null
  intentRoute?: OrionIntentRouteSummary | null
}): OrionOperationalGoal {
  const message = input.message || ""
  const text = normalizeText(message)
  const targetProfit = parseMoney(message)
  const horizonDays = parseHorizonDays(message)
  const directQuestion = /\b(isso|essa estrategia|essa estratégia|esse plano|essa oferta|esse caminho)\b/.test(text)
    && /\b(gera|geraria|bate|bateria|chega|chegaria|da|daria|alcan[cç]a|atinge)\b/.test(text)
    && Boolean(targetProfit || input.previousState?.activeGoal?.targetProfit)
  const campaignExecution = /\bcampanha\b/.test(text)
    && /\b(conjunta|nova|cria|criar|faz|fazer|monta|montar|estrutura|estruturar|agora)\b/.test(text)
  const needsExecution = campaignExecution || /\b(cria|criar|faz|fazer|monta|montar|gera|gerar)\b/.test(text)
    && /\b(campanha|copy|headline|anuncio|anúncio|stories|whatsapp|texto|roteiro)\b/.test(text)

  if (input.intentRoute?.intent === "financial_traceability" || isFinancialTraceabilityRequest(message)) {
    return {
      goalType: "financial_traceability",
      targetProfit,
      horizonDays,
      urgency: "low",
      optimization: "unknown",
      directQuestion: true,
      needsExecution: false,
      reason: "Usuário pediu rastreabilidade/listagem financeira auditável.",
    }
  }

  if (targetProfit && /\b(lucrar|lucro|liquido|líquido|ganhar|gerar|bater|meta)\b/.test(text)) {
    return {
      goalType: directQuestion ? "pricing_validation" : "profit_target",
      targetProfit,
      horizonDays,
      urgency: horizonDays !== null && horizonDays <= 3 ? "high" : horizonDays !== null && horizonDays <= 10 ? "medium" : "low",
      optimization: "liquidity_plus_margin",
      directQuestion,
      needsExecution: false,
      reason: directQuestion
        ? "Usuário pediu validação direta de lucro líquido sobre o plano atual."
        : "Usuário definiu meta financeira explícita.",
    }
  }

  if (directQuestion) {
    return {
      goalType: "pricing_validation",
      targetProfit: input.previousState?.activeGoal?.targetProfit || null,
      horizonDays: input.previousState?.activeGoal?.horizonDays || null,
      urgency: input.previousState?.activeGoal?.urgency || "medium",
      optimization: input.previousState?.activeGoal?.optimization || "liquidity_plus_margin",
      directQuestion: true,
      needsExecution: false,
      reason: "Usuário pediu validação direta do plano ativo.",
    }
  }

  if (/\b(vender rapido|vender rapido|vender mais rapido|girar rapido|liquidez|fazer caixa)\b/.test(text)) {
    return {
      goalType: "inventory_liquidity",
      targetProfit: null,
      horizonDays,
      urgency: "high",
      optimization: "liquidity",
      directQuestion: false,
      needsExecution: false,
      reason: "Usuário priorizou velocidade de venda/liquidez.",
    }
  }

  if (/\b(girar estoque|giro de estoque|estoque parado|destravar estoque)\b/.test(text)) {
    return {
      goalType: "inventory_rotation",
      targetProfit: null,
      horizonDays,
      urgency: "medium",
      optimization: "speed",
      directQuestion: false,
      needsExecution: false,
      reason: "Usuário pediu rotação de estoque.",
    }
  }

  if (/\b(aumentar margem|melhorar margem|mais margem|preservar margem|sem matar margem)\b/.test(text)) {
    return {
      goalType: "margin_optimization",
      targetProfit: null,
      horizonDays,
      urgency: "medium",
      optimization: "margin",
      directQuestion: false,
      needsExecution: false,
      reason: "Usuário quer otimizar margem.",
    }
  }

  if (needsExecution && /\b(copy|headline|texto|roteiro)\b/.test(text)) {
    return {
      goalType: "content_generation",
      targetProfit: null,
      horizonDays: null,
      urgency: "medium",
      optimization: "execution",
      directQuestion: false,
      needsExecution: true,
      reason: "Usuário pediu geração de conteúdo.",
    }
  }

  if (needsExecution) {
    return {
      goalType: "marketing_execution",
      targetProfit: null,
      horizonDays: null,
      urgency: "medium",
      optimization: "execution",
      directQuestion: false,
      needsExecution: true,
      reason: "Usuário pediu execução de campanha/marketing.",
    }
  }

  if (input.intentRoute?.intent === "financial_analysis" || input.intentRoute?.intent === "global_business_question") {
    return {
      goalType: "unknown",
      targetProfit,
      horizonDays,
      urgency: targetProfit ? "medium" : "low",
      optimization: "liquidity_plus_margin",
      directQuestion: false,
      needsExecution: false,
      reason: targetProfit
        ? "Pipeline estruturado classificou a pergunta como financeira com valor explícito."
        : "Pipeline estruturado classificou a pergunta como financeira.",
    }
  }

  if (/\b(estrategia|estratégia|plano|como|o que fazer|qual caminho)\b/.test(text)) {
    return {
      goalType: "operational_diagnosis",
      targetProfit: null,
      horizonDays,
      urgency: "medium",
      optimization: "liquidity_plus_margin",
      directQuestion: false,
      needsExecution: false,
      reason: "Usuário pediu raciocínio operacional antes da execução.",
    }
  }

  return {
    goalType: "unknown",
    targetProfit,
    horizonDays,
    urgency: "low",
    optimization: "unknown",
    directQuestion: false,
    needsExecution: false,
    reason: "Nenhum objetivo operacional explícito extraído.",
  }
}
