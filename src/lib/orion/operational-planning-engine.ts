import "server-only"

import type { InventoryContextItem } from "./business-query-engine"
import type {
  OrionCommercialSubjectSummary,
  OrionExecutionGuardrails,
  OrionMissionContext,
  OrionOperationalContext,
  OrionOperationalGoal,
  OrionOperationalPlan,
  OrionReasoningMode,
  OrionSnapshot,
} from "./types"
import type { OrionAppliedOperationalMemoryContext } from "./operational-memory"
import { isExecutionReasoningMode } from "./reasoning-mode-selector"
import { isFinancialReasoningMode } from "./execution-guardrails"
import { normalizeCommercialLabel } from "./commercial-label"

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value)
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function productProfit(product: InventoryContextItem) {
  const price = product.suggestedPrice || product.purchasePrice * 1.2
  const safeCostBuffer = product.productType === "accessory" ? 0 : 40
  return Math.max(0, Math.round(price - product.purchasePrice - safeCostBuffer))
}

function velocityScore(product: InventoryContextItem) {
  const type = normalize(`${product.productType || ""} ${product.category} ${product.name}`)
  const ageScore = product.daysInStock <= 15 ? 30 : product.daysInStock <= 35 ? 20 : 12
  const ticket = product.suggestedPrice || product.purchasePrice * 1.2
  const ticketScore = ticket <= 800 ? 24 : ticket <= 4200 ? 32 : ticket <= 7000 ? 20 : 12
  const typeScore = /iphone/.test(type) ? 28 : /ipad|watch/.test(type) ? 18 : /accessory|acessor/.test(type) ? 14 : 16
  return ageScore + ticketScore + typeScore
}

function chooseProducts(
  operationalContext?: OrionOperationalContext | null,
  subject?: OrionCommercialSubjectSummary | null,
  mission?: OrionMissionContext | null
) {
  const inventory = operationalContext?.contexts.inventory as { products?: InventoryContextItem[] } | undefined
  const products = (inventory?.products || [])
    .filter((product) => product.status === "active" || product.status === "in_stock")
    .filter((product) => product.suggestedPrice > 0 || product.purchasePrice > 0)

  const primaryName = subject?.primarySubject?.productName || mission?.product?.name || null
  if (!primaryName) return products

  const primaryText = normalize(primaryName)
  const primary = products.find((product) => {
    const name = normalize(product.name)
    return name.includes(primaryText) || primaryText.includes(name)
  })
  if (!primary) return products
  return [primary, ...products.filter((product) => product.id !== primary.id)]
}

function planMix(products: InventoryContextItem[], targetProfit?: number | null) {
  const ranked = [...products]
    .map((product) => ({
      product,
      unitProfit: productProfit(product),
      velocity: velocityScore(product),
    }))
    .sort((a, b) => {
      const aScore = a.unitProfit * 0.55 + a.velocity * 9 + Math.min(a.product.quantity, 3) * 40
      const bScore = b.unitProfit * 0.55 + b.velocity * 9 + Math.min(b.product.quantity, 3) * 40
      return bScore - aScore
    })

  const selected: OrionOperationalPlan["productMix"] = []
  let remaining = Math.max(0, targetProfit || ranked[0]?.unitProfit || 0)
  for (const item of ranked.slice(0, 5)) {
    const quantity = Math.max(1, Math.min(item.product.quantity || 1, remaining > 0 ? Math.ceil(remaining / Math.max(item.unitProfit, 1)) : 1))
    selected.push({
      inventoryId: item.product.id,
      productName: normalizeCommercialLabel(item.product.name),
      role: selected.length === 0 ? "primary" : item.product.productType === "accessory" ? "margin_addon" : item.velocity >= 70 ? "liquidity" : "backup",
      quantity,
      unitProfit: item.unitProfit,
      estimatedProfit: item.unitProfit * quantity,
      marginPct: item.product.marginPct,
      daysInStock: item.product.daysInStock,
      reason: item.product.productType === "accessory"
        ? "Acessório entra para aumentar margem, não como produto central."
        : item.velocity >= 70
          ? "Bom equilíbrio entre velocidade provável e lucro por venda."
          : "Alternativa para completar lucro sem depender de um SKU só.",
    })
    remaining -= item.unitProfit * quantity
    if (targetProfit && remaining <= 0) break
  }
  return selected
}

function directAnswerFor(goal: OrionOperationalGoal, estimatedProfit: number) {
  const target = goal.targetProfit || 0
  if (!goal.directQuestion || target <= 0) return null
  if (estimatedProfit >= target * 1.1) return "Sim"
  if (estimatedProfit >= target * 0.75) return "Provavelmente"
  return "Não"
}

export function buildOperationalPlan(input: {
  snapshot: OrionSnapshot
  operationalContext?: OrionOperationalContext | null
  commercialSubject?: OrionCommercialSubjectSummary | null
  missionContext?: OrionMissionContext | null
  goal: OrionOperationalGoal
  reasoningMode: OrionReasoningMode
  executionGuardrails?: OrionExecutionGuardrails | null
  operationalMemoryContext?: OrionAppliedOperationalMemoryContext | null
}): OrionOperationalPlan {
  if (input.executionGuardrails && !input.executionGuardrails.allowProductMixGeneration) {
    const finance = input.snapshot.finance.financialOperationalContext
    const workingCapital = input.snapshot.finance.workingCapitalSnapshot
    const target = input.goal.targetProfit || 0
    const safeWithdrawal = Math.max(0, Math.round(workingCapital.safeWithdrawalAmount))
    const directAnswer = target > 0
      ? safeWithdrawal >= target ? "Sim" : safeWithdrawal > 0 ? "Provavelmente" : "Não"
      : null
    const directAnswerReason = isFinancialReasoningMode(input.reasoningMode)
      ? `Retirada segura estimada: ${brl(safeWithdrawal)}. Liquidez disponível: ${brl(finance.availableLiquidity)}. Sobra operacional após contas: ${brl(workingCapital.operationalSurplusAfterBills)}.`
      : input.executionGuardrails.reason
    const response = [
      directAnswer ? `${directAnswer}. ${directAnswerReason}` : directAnswerReason,
      "",
      "Leitura:",
      finance.operationalSummary,
      "",
      "Risco:",
      workingCapital.warnings[0] || finance.financialWarnings[0] || "Não trate lucro operacional como retirada automática.",
      "",
      "Próximo passo operacional:",
      target > 0
        ? "Use a retirada segura estimada como teto conservador e preserve contas próximas, recomposição e capital operacional protegido."
        : "Valide caixa, contas próximas e recomposição antes de retirada, compra ou reinvestimento.",
    ].filter(Boolean).join("\n")
    return {
      directAnswer,
      directAnswerReason,
      feasibility: {
        status: target > 0 ? safeWithdrawal >= target ? "feasible" : safeWithdrawal > 0 ? "partial" : "not_feasible" : "unknown",
        targetProfit: input.goal.targetProfit,
        estimatedProfit: safeWithdrawal,
        conservativeProfit: safeWithdrawal,
        optimisticProfit: safeWithdrawal,
        horizonDays: input.goal.horizonDays,
      },
      recommendedPath: "Responder pela leitura financeira estruturada, sem plano comercial automático.",
      productMix: [],
      financialValidation: directAnswerReason,
      risks: [
        workingCapital.warnings[0] || finance.financialWarnings[0] || "Retirada e reinvestimento precisam respeitar capital operacional protegido.",
      ],
      nextActions: ["Preservar recomposição, contas próximas e retirada segura antes de qualquer execução comercial."],
      executionAllowed: false,
      response,
    }
  }

  const products = chooseProducts(input.operationalContext, input.commercialSubject, input.missionContext)
  const targetProfit = input.goal.targetProfit || input.missionContext?.offer?.expectedProfit || null
  const productMix = planMix(products, targetProfit)
  const estimatedProfit = productMix.reduce((sum, item) => sum + item.estimatedProfit, 0)
  const conservativeProfit = Math.round(estimatedProfit * 0.72)
  const optimisticProfit = Math.round(estimatedProfit * 1.12)
  const directAnswer = directAnswerFor({ ...input.goal, targetProfit }, estimatedProfit)
  const status = targetProfit === null
    ? productMix.length ? "unknown" : "not_feasible"
    : estimatedProfit >= targetProfit
      ? "feasible"
      : estimatedProfit >= targetProfit * 0.65
        ? "partial"
        : "not_feasible"

  const targetText = targetProfit ? `Meta: ${brl(targetProfit)} líquidos${input.goal.horizonDays ? ` em ${input.goal.horizonDays} dias` : ""}.` : "Meta financeira sem valor explícito."
  const primary = productMix[0]
  const addon = productMix.find((item) => item.role === "margin_addon")
  const financialValidation = targetProfit
    ? `Pelos produtos disponíveis no recorte atual, o plano soma cerca de ${brl(estimatedProfit)} de lucro estimado. Conservador: ${brl(conservativeProfit)}. Otimista: ${brl(optimisticProfit)}.`
    : `Sem meta numérica, o melhor caminho é começar pelo item com maior equilíbrio entre lucro e velocidade: ${primary?.productName || "produto ativo com melhor relação margem/giro"}.`
  const directAnswerReason = directAnswer
    ? `Pelos dados atuais. ${financialValidation}`
    : financialValidation

  const recommendedPath = primary
    ? `${primary.productName} deve ser o eixo do plano. ${addon ? `${addon.productName} entra como complemento de margem.` : "Acessórios entram apenas se forem compatíveis e melhorarem margem sem roubar o foco."}`
    : "Não há produto ativo suficiente no contexto para montar plano financeiro confiável."
  const risks = [
    productMix.length ? "Depender de um único produto aumenta risco de timing e negociação." : "Sem estoque ativo, qualquer meta vira promessa insegura.",
    input.snapshot.executive.leadsWithoutFollowUp > 0 ? "Leads sem follow-up podem reduzir velocidade de conversão." : "O risco principal é baixar preço antes de validar intenção real.",
  ]
  const profile = input.operationalMemoryContext?.businessPersonalityProfile || null
  if (profile?.executionCapacity === "low") {
    risks.push("Memória operacional indica gargalo de atendimento; tráfego pesado deve esperar follow-up e resposta rápida.")
  }
  if (profile?.marginPreference === "protect_margin" && input.snapshot.finance.financialOperationalContext.cashHealth !== "critical") {
    risks.push("Memória operacional favorece preservar margem; desconto deve entrar só como fechamento com intenção real.")
  }
  const nextActions = isExecutionReasoningMode(input.reasoningMode)
    ? ["Gerar campanha usando o produto central e os add-ons compatíveis.", "Validar WhatsApp e criativo antes de escalar."]
    : [
        "Confirmar disponibilidade e preço do produto central.",
        "Usar acessórios apenas para aumentar margem percebida.",
        "Só depois pedir campanha/copy se quiser executar o plano.",
      ]
  if (input.operationalMemoryContext?.memoryGuardrails.avoidAutomaticCampaignCta) {
    nextActions[0] = "Responder a decisão financeira primeiro, sem empurrar campanha ou tráfego como próximo passo automático."
  }

  const lines = [
    directAnswer ? `${directAnswer}. ${directAnswerReason}` : directAnswerReason,
    "",
    "Minha leitura operacional:",
    `${targetText} ${recommendedPath}`,
    "",
    "Mix sugerido:",
    ...productMix.slice(0, 4).map((item) => `- ${item.quantity}x ${item.productName}: ${brl(item.estimatedProfit)} estimados. ${item.reason}`),
    "",
    "Risco:",
    risks[0],
    "",
    "Próximos passos:",
    ...nextActions.map((action) => `- ${action}`),
  ].filter(Boolean)

  return {
    directAnswer,
    directAnswerReason,
    feasibility: {
      status,
      targetProfit,
      estimatedProfit,
      conservativeProfit,
      optimisticProfit,
      horizonDays: input.goal.horizonDays,
    },
    recommendedPath,
    productMix,
    financialValidation,
    risks,
    nextActions,
    executionAllowed: isExecutionReasoningMode(input.reasoningMode),
    response: lines.join("\n"),
  }
}

export function summarizeOperationalPlan(plan?: OrionOperationalPlan | null) {
  if (!plan) return null
  const firstProduct = plan.productMix[0]
  return [
    plan.directAnswer ? `${plan.directAnswer}: ${plan.directAnswerReason}` : plan.financialValidation,
    firstProduct ? `Produto central: ${firstProduct.productName}` : null,
    `Viabilidade: ${plan.feasibility.status}`,
  ].filter(Boolean).join(" | ")
}
