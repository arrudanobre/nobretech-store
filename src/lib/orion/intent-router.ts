import "server-only"

import { classifyIntentWithAI } from "./ai-intent-classifier"
import type { OrionConversationIntent, OrionIntentRouteSummary, OrionMissionContextPolicy, OrionOperationalConversationState } from "./types"
import type { CommercialSubjectResolution } from "./commercial-subject-resolver"

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasActiveMission(state?: OrionOperationalConversationState | null) {
  return Boolean(
    state?.activeMissionContext
    || state?.activeMission
    || state?.currentMission
    || state?.activeProduct
    || state?.currentProduct
    || state?.activeOffer
    || state?.activeCampaign
  )
}

function normalizeRoute(route: OrionIntentRouteSummary): OrionIntentRouteSummary {
  return {
    ...route,
    useMissionContext: route.missionContextPolicy === "use",
    ignoreMissionContext: route.missionContextPolicy === "ignore",
    rebuildMissionContext: route.missionContextPolicy === "rebuild" || route.missionContextPolicy === "switch",
  }
}

function route(intent: OrionConversationIntent, policy: OrionMissionContextPolicy, reason: string, confidence = 0.78): OrionIntentRouteSummary {
  return normalizeRoute({
    intent,
    missionContextPolicy: policy,
    useMissionContext: false,
    ignoreMissionContext: false,
    rebuildMissionContext: false,
    reason,
    confidence,
  })
}

function subjectChanged(
  subject?: CommercialSubjectResolution | null,
  previousState?: OrionOperationalConversationState | null
) {
  const previousProduct = previousState?.activeMissionContext?.product?.name
    || previousState?.activeProduct
    || previousState?.currentProduct
    || previousState?.focusProduct
  const currentProduct = subject?.primarySubject?.productName || subject?.productFamily || subject?.model
  if (!previousProduct || !currentProduct || !subject || subject.confidence < 0.72) return false
  const previous = normalizeText(previousProduct)
  const current = normalizeText(currentProduct)
  return Boolean(previous && current && !previous.includes(current) && !current.includes(previous))
}

function subjectHasOperationalMatches(subject?: CommercialSubjectResolution | null) {
  return Boolean(subject?.matches.some((match) => match.status === "active" || match.status === "in_stock"))
}

export function classifyOrionIntent(input: {
  message: string
  previousState?: OrionOperationalConversationState | null
  commercialSubject?: CommercialSubjectResolution | null
}): OrionIntentRouteSummary {
  const text = normalizeText(input.message)
  const hasMission = hasActiveMission(input.previousState)
  const subject = input.commercialSubject

  if (!text) return route("unrelated_question", "ignore", "Mensagem vazia ou sem intenção operacional.", 0.4)

  if (/\b(saude financeira|saude da empresa|financeiro da empresa|como esta a empresa|como esta meu negocio|situacao financeira|visao geral|resumo geral|empresa como um todo|operacao como um todo)\b/.test(text)) {
    return route("financial_analysis", "ignore", "Pergunta financeira ou global vence qualquer missão comercial ativa.", 0.96)
  }

  if (/\b(caixa|liquidez|dre|contas a pagar|contas a receber|fluxo de caixa|saldo|recebiveis|payables|receivables)\b/.test(text)) {
    return route("financial_analysis", "ignore", "Pergunta financeira deve usar leitura global, não contexto de campanha.", 0.9)
  }

  if (/\b(nao e|nao eh|não é|troca para|trocar para|corrige para|corrigir para|na verdade e|na verdade é|agora e|agora é)\b/.test(text)) {
    return route("product_switch", "switch", "A mensagem atual corrige ou troca explicitamente o produto ativo.", 0.92)
  }

  if (subjectChanged(subject, input.previousState)) {
    return route("product_switch", "switch", "O assunto comercial explícito resolvido pelo banco difere da missão ativa.", 0.9)
  }

  if (subject && subject.subjectType !== "unknown" && subject.confidence >= 0.7 && !subjectHasOperationalMatches(subject)) {
    return route("inventory_analysis", "ignore", "Assunto comercial não possui item operacional disponível para virar missão ativa.", 0.9)
  }

  if (subject && subject.subjectType !== "unknown" && subject.confidence >= 0.82 && !hasMission) {
    return route("new_campaign_request", "rebuild", "Assunto comercial resolvido pelo banco e sem missão ativa anterior.", 0.83)
  }

  if (/\b(nova campanha|campanha nova|comecar do zero|começar do zero|nova estrategia|nova estratégia|outra missao|outra missão)\b/.test(text)) {
    return route("new_campaign_request", "rebuild", "Usuário pediu uma nova missão comercial.", 0.9)
  }

  if (/\b(margem de promocao|margem de promoção|margem dessa promocao|margem dessa promoção|margem do combo|margem da oferta|preco minimo|preço mínimo|menor valor|piso|desconto|quanto posso cobrar)\b/.test(text)) {
    return route("pricing_refinement", hasMission ? "use" : "rebuild", "Refinamento de preço/margem deve usar o produto ativo quando houver missão.", 0.88)
  }

  if (/\b(apertar|apertada|ajustar valor|melhorar valor|sem matar margem|sem perder margem|negociar valor|baixar um pouco)\b/.test(text)) {
    return route("pricing_refinement", hasMission ? "use" : "rebuild", "A mensagem indica ajuste de valor com preservação de margem.", 0.76)
  }

  if (/\b(oferta|combo|bundle|brinde|bonus|bônus|agregar|adicionar algo|algo a mais|condicao|condição)\b/.test(text)) {
    return route("offer_refinement", hasMission ? "use" : "rebuild", "A mensagem ajusta oferta/valor percebido.", 0.8)
  }

  if (/\b(versao premium|versão premium|mais premium|premium da copy|melhorar copy|copy mais forte)\b/.test(text)) {
    return route("marketing_execution", hasMission ? "use" : "rebuild", "A mensagem pede refinamento criativo/copy da missão comercial.", 0.8)
  }

  if (/\b(anuncio|anúncio|campanha|copy|criativo|stories|story|whatsapp|zap|trafego|tráfego|meta ads|headline|me ajuda no anuncio|me ajuda no anúncio|me ajuda no marketing)\b/.test(text)) {
    return route("marketing_execution", hasMission ? "use" : "rebuild", "Pedido de execução comercial/marketing.", 0.84)
  }

  if (/\b(estoque|inventario|inventário|produto parado|giro|dias em estoque|quantidade disponivel|quantidade disponível|sku|unidade)\b/.test(text)) {
    return route("inventory_analysis", subject?.subjectType === "unknown" ? "ignore" : "rebuild", "Pergunta de estoque deve ser resolvida pelo catálogo/estoque atual.", 0.82)
  }

  if (/\b(estrategia|estratégia|qual caminho|o que voce faria|o que você faria|vale a pena|devo)\b/.test(text)) {
    return route("strategic_question", hasMission ? "use" : "ignore", "Pergunta estratégica usa missão somente se ela for relevante.", 0.74)
  }

  if (/\b(seguimos|vamos nessa|continua|continuar|monta|estrutura|cria|faz isso|manda o texto|me da o texto|me dá o texto)\b/.test(text)) {
    return route("mission_continuation", hasMission ? "use" : "rebuild", "Continuação operacional explícita.", 0.86)
  }

  if (hasMission && /\b(esse|essa|este|esta|desse|dessa|deste|desta|isso|ela|ele)\b/.test(text)) {
    return route("mission_refinement", "use", "Mensagem dependente da missão ativa.", 0.7)
  }

  if (subject && subject.subjectType !== "unknown" && subject.confidence >= 0.5) {
    const intent = /\b(vender|girar|campanha|promover|anunciar|oferta)\b/.test(text)
      ? "marketing_execution"
      : "operational_question"
    return route(intent, "rebuild", "A mensagem traz assunto comercial próprio, resolvido pelo banco.", 0.72)
  }

  return route("operational_question", hasMission ? "ignore" : "ignore", "Sem sinal seguro de continuação da missão ativa.", 0.62)
}

function isHardSafetyRoute(route: OrionIntentRouteSummary) {
  return route.confidence >= 0.85
}

export async function routeOrionIntent(input: {
  message: string
  previousState?: OrionOperationalConversationState | null
  commercialSubject?: CommercialSubjectResolution | null
}): Promise<OrionIntentRouteSummary> {
  const deterministicRoute = classifyOrionIntent(input)
  if (isHardSafetyRoute(deterministicRoute)) return deterministicRoute

  try {
    const aiRoute = await classifyIntentWithAI({
      message: input.message,
      deterministicRoute,
      commercialSubject: input.commercialSubject,
      previousState: input.previousState,
    })
    if (deterministicRoute.intent === "financial_analysis" || deterministicRoute.missionContextPolicy === "ignore" && deterministicRoute.confidence >= 0.8) {
      return deterministicRoute
    }
    return normalizeRoute({
      ...aiRoute,
      reason: `${aiRoute.reason} Fallback determinístico: ${deterministicRoute.reason}`,
    })
  } catch {
    return deterministicRoute
  }
}

export function shouldIgnoreMissionContext(intentRoute?: OrionIntentRouteSummary | null) {
  return Boolean(intentRoute?.ignoreMissionContext)
}
