import "server-only"

import { pool } from "@/lib/db"
import { classifyTransaction } from "@/lib/financial/money-classification-engine"
import type { OrionFinancialOperationalContext } from "@/lib/orion/financial-context-consumer"
import { buildFinancialDecisionResponse, buildFinancialTraceabilityResponse, formatFinancialDecisionResponse } from "@/lib/orion/financial-decision-response"
import { isFinancialReinvestmentDecisionRequest, isFinancialTraceabilityRequest, isFinancialWithdrawalDecisionRequest } from "@/lib/orion/financial-traceability-router"
import { calculateOperationalHealth } from "./operational-health-engine"
import { buildCommercialStrategy } from "./commercial-strategy-engine"
import { buildScenarioExecutionPlan } from "./scenario-execution-engine"
import {
  EXCLUDED_STATUSES,
  isExplicitlyUnavailable,
  isOperationallyAvailable,
  OPERATIONAL_STATUSES,
  statusScorePenalty,
} from "@/lib/orion/inventory-filter"
import { isActionableLead } from "@/lib/orion/lead-classification"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import type { CommercialSubjectResolution } from "./commercial-subject-resolver"
import type {
  OrionBusinessIntent,
  OrionBusinessToolName,
  OrionIntentRouteSummary,
  OrionOperationalContext,
  OrionSnapshot,
} from "@/lib/orion/types"
import type { OperationalHealthScore } from "./operational-health-engine"

export type InventoryContextItem = {
  id: string
  name: string
  status: string
  color: string | null
  capacity: string | null
  grade: string | null
  condition: string | null
  category: string
  productType: string | null
  purchasePrice: number
  suggestedPrice: number
  marginPct: number
  daysInStock: number
  origin: string
  type: string
  quantity: number
  minimumSafePrice: number
  maxSafeDiscount: number
  matchScore: number
  matchReason: string
}

type InventorySearchDebug = NonNullable<OrionOperationalContext["inventory_search_debug"]>

type InventoryCandidateRow = {
  id: string
  status: string | null
  purchase_price: string | number | null
  suggested_price: string | number | null
  purchase_date: string | null
  quantity: string | number | null
  category: string | null
  product_model: string | null
  color: string | null
  capacity: string | null
  grade: string | null
  condition_notes: string | null
  notes: string | null
  origin: string | null
  type: string | null
  product_type: string | null
  brand: string | null
}

type SaleContextItem = {
  id: string
  date: string
  product: string
  revenue: number
  profit: number
  marginPct: number
  paymentMethod: string | null
  status: string
}

type LeadContextItem = {
  id: string
  name: string
  status: string
  temperature: string | null
  productInterest: string | null
  daysWithoutAction: number
  nextAction: string | null
}

type CampaignContextItem = {
  id: string
  name: string
  channel: string
  status: string
  spend: number
  leads: number
  sales: number
  revenue: number
  roi: number | null
}

type TransactionContextItem = {
  type: string
  category: string
  amount: number
  status: string
  date: string
  sourceType: string | null
  financialType: string | null
  statementSection: string | null
  affectsInventory: boolean
  affectsOwnerEquity: boolean
}

const MAX_TOOL_ROWS = 18
const MIN_SAFE_MARGIN = 0.12
const ESTIMATED_CARD_FEE_PCT = 0.03
const FALLBACK_COMMERCIAL_ASSUMPTIONS = {
  estimatedBundleCost: 40,
  estimatedWarrantyReserve: 80,
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value)
}

function pct(value: number) {
  return `${round(value, 1).toLocaleString("pt-BR")}%`
}

function parseMoneyTarget(question: string) {
  const match = question.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/i)
  if (!match) return null
  const normalized = match[0]
    .replace(/r\$/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function questionLooksFinancialGoal(question: string) {
  const normalized = compactText(question)
  const goalPhrase = /\b(quero tirar|preciso tirar|quero retirar|preciso retirar|quero levantar|preciso levantar|preciso pagar|quero me pagar|preciso me pagar|me pagar|pagar contas|pagar boleto|pagar boletos|fazer caixa|gerar caixa|meta financeira|objetivo financeiro|meta de lucro|lucrar)\b/.test(normalized)
  return goalPhrase && (parseMoneyTarget(question) !== null || /\b(pagar contas|me pagar|retirada|retirar|levantar dinheiro|fazer caixa|gerar caixa)\b/.test(normalized))
}

function questionLooksFinancialValidation(question: string) {
  const normalized = compactText(question)
  return parseMoneyTarget(question) !== null
    && /\b(isso|essa estrategia|esse plano|essa oferta|esse caminho|esse produto|essa campanha)\b/.test(normalized)
    && /\b(gera|geraria|bate|bateria|chega|chegaria|da|daria|alcan[cç]a|atinge)\b/.test(normalized)
}

function questionLooksAvailableOperationalProfit(question: string) {
  const normalized = compactText(question)
  return /\b(lucro real|realmente lucrei|lucro operacional|lucro livre|lucro disponivel|lucro disponível|lucro estimado|quanto tenho de lucro|retirar lucro|retirada|quanto posso retirar|posso retirar)\b/.test(normalized)
}

function questionLooksStrategicExecution(question: string) {
  const normalized = compactText(question)
  return /\b(gerar lucro|bater meta|meta financeira|acelerar vendas|aumentar caixa|gerar caixa|fazer caixa|vender mais rapido|vender mais rapido|levantar dinheiro|proteger margem|aumentar conversao|aumentar conversão|criar promocao|criar promoção|criar campanha|executar estrategia|executar estratégia|campanha|promocao|promoção|oferta|giro|girar|converter|conversao|conversão)\b/.test(normalized)
}

function daysBetween(from: string | null | undefined) {
  if (!from) return 0
  const parsed = new Date(from)
  if (!Number.isFinite(parsed.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
}

function compactText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compactJoined(value: string) {
  return compactText(value).replace(/\s+/g, "")
}

function safeQuestion(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 600)
}

function extractSearchTokens(question: string) {
  const stopwords = new Set([
    "esse",
    "essa",
    "este",
    "esta",
    "produto",
    "produtos",
    "precisa",
    "campanha",
    "baixar",
    "preco",
    "preço",
    "promover",
    "hoje",
    "posso",
    "devo",
    "qual",
    "quais",
    "mais",
    "menos",
    "lucro",
    "margem",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "um",
    "uma",
    "o",
    "a",
    "para",
    "por",
    "com",
    "que",
    "fazer",
    "vender",
    "venda",
    "rapido",
    "rapida",
    "mais",
    "analisa",
    "analisar",
    "tenho",
    "estoque",
  ])
  return compactText(question)
    .split(" ")
    .filter((token) => token.length >= 2 && !stopwords.has(token))
    .slice(0, 6)
}

function questionLooksProductSpecific(question: string) {
  return extractSearchTokens(question).length > 0
}

function questionReferencesUnidentifiedProduct(question: string) {
  const normalized = compactText(question)
  return /\b(esse item|este item|desse item|deste item|esse produto|este produto|desse produto|deste produto)\b/.test(normalized)
    && !questionLooksProductSpecific(question)
}

function questionMentionsAccessory(question: string) {
  return /\bacessor/i.test(question)
}

function routeIntent(
  question: string,
  intentRoute?: OrionIntentRouteSummary | null
): { intent: OrionBusinessIntent; toolsUsed: OrionBusinessToolName[] } {
  const normalized = compactText(question)

  if (intentRoute) {
    if (intentRoute.intent === "financial_traceability") {
      return { intent: "financial_traceability", toolsUsed: ["financial_tool", "cashflow_tool", "dre_tool", "sales_tool"] }
    }
    if (intentRoute.intent === "financial_analysis" || intentRoute.intent === "global_business_question") {
      return { intent: "cash_health_analysis", toolsUsed: ["financial_tool", "cashflow_tool", "dre_tool", "sales_tool"] }
    }
    if (intentRoute.intent === "inventory_analysis") {
      return { intent: "inventory_product_analysis", toolsUsed: ["inventory_tool", "pricing_tool", "campaign_tool", "sales_tool"] }
    }
    if (intentRoute.intent === "pricing_refinement") {
      return { intent: "pricing_analysis", toolsUsed: ["inventory_tool", "pricing_tool", "sales_tool"] }
    }
    if (intentRoute.intent === "strategic_question" || intentRoute.intent === "operational_question") {
      return { intent: "executive_business_overview", toolsUsed: ["inventory_tool", "financial_tool", "sales_tool", "crm_tool", "campaign_tool", "dre_tool", "cashflow_tool"] }
    }
    if (intentRoute.intent === "unrelated_question") {
      return { intent: "general_question", toolsUsed: ["inventory_tool", "financial_tool", "sales_tool", "crm_tool"] }
    }
    return { intent: "promotion_recommendation", toolsUsed: ["inventory_tool", "sales_tool", "campaign_tool", "pricing_tool", "crm_tool", "financial_tool", "cashflow_tool"] }
  }

  if (isFinancialTraceabilityRequest(question)) {
    return { intent: "financial_traceability", toolsUsed: ["financial_tool", "cashflow_tool", "dre_tool", "sales_tool"] }
  }

  if (isFinancialWithdrawalDecisionRequest(question)) {
    return { intent: "cash_health_analysis", toolsUsed: ["financial_tool", "cashflow_tool", "dre_tool", "sales_tool"] }
  }

  if (isFinancialReinvestmentDecisionRequest(question)) {
    return { intent: "purchase_capacity_analysis", toolsUsed: ["financial_tool", "cashflow_tool", "inventory_tool", "sales_tool"] }
  }

  if (questionLooksFinancialGoal(question) || questionLooksFinancialValidation(question)) {
    return {
      intent: "financial_goal_execution",
      toolsUsed: ["inventory_tool", "pricing_tool", "sales_tool", "financial_tool", "cashflow_tool", "crm_tool", "campaign_tool", "dre_tool"],
    }
  }

  if (questionLooksAvailableOperationalProfit(question)) {
    return { intent: "cash_health_analysis", toolsUsed: ["financial_tool", "cashflow_tool", "dre_tool", "sales_tool"] }
  }

  if (questionLooksStrategicExecution(question)) {
    return {
      intent: "promotion_recommendation",
      toolsUsed: ["inventory_tool", "pricing_tool", "sales_tool", "financial_tool", "cashflow_tool", "crm_tool", "campaign_tool", "dre_tool"],
    }
  }

  // Prioridade 1: Produto específico com intenção comercial
  if (
    questionLooksProductSpecific(question) &&
    /\b(vender|girar|campanha|promover|desconto|preco|preço|oferta|mais rapido|mais rápida)\b/.test(normalized)
  ) {
    return {
      intent: "inventory_product_analysis",
      toolsUsed: ["inventory_tool", "pricing_tool", "campaign_tool", "sales_tool"],
    }
  }

  if (/\b(caixa|liquidez|saldo|dinheiro|ruim)\b/.test(normalized)) {
    return { intent: "cash_health_analysis", toolsUsed: ["financial_tool", "cashflow_tool", "dre_tool"] }
  }

  if (/\b(recomprar|recompra|comprar estoque|reposicao|repor estoque|reinvestir|investir em estoque)\b/.test(normalized)) {
    return { intent: "purchase_capacity_analysis", toolsUsed: ["financial_tool", "cashflow_tool", "inventory_tool", "sales_tool"] }
  }

  if (/\b(baixar|desconto|preco minimo|preco seguro|preco|preço)\b/.test(normalized)) {
    return { intent: "pricing_analysis", toolsUsed: ["inventory_tool", "pricing_tool", "sales_tool"] }
  }

  if (/\b(promover|campanha|anunciar|oferta|girar|giro|vender mais rapido|vender)\b/.test(normalized) && /\b(qual|produto|item|iphone|ipad|mac|watch|margem)\b/.test(normalized)) {
    return { intent: "promotion_recommendation", toolsUsed: ["inventory_tool", "sales_tool", "campaign_tool", "pricing_tool"] }
  }

  if (/\b(vendas|venda|lucro|lucraram|deram mais lucro|mais rentavel|rentavel)\b/.test(normalized)) {
    return { intent: "sales_profit_analysis", toolsUsed: ["sales_tool", "dre_tool"] }
  }

  if (/\b(lead|leads|follow|follow up|crm|cliente quente)\b/.test(normalized)) {
    return { intent: "crm_follow_up_analysis", toolsUsed: ["crm_tool", "campaign_tool", "sales_tool"] }
  }

  if (/\b(campanhas|campanha|roi|cpl|marketing)\b/.test(normalized)) {
    return { intent: "campaign_performance_analysis", toolsUsed: ["campaign_tool", "sales_tool", "crm_tool"] }
  }

  if (/\b(negocio|negócio|operacao|operação|hoje|geral|resumo)\b/.test(normalized)) {
    return {
      intent: "executive_business_overview",
      toolsUsed: ["inventory_tool", "financial_tool", "sales_tool", "crm_tool", "campaign_tool", "dre_tool", "cashflow_tool"],
    }
  }

  if (/\b(iphone|ipad|mac|watch|estoque|parado|sku|modelo|cor|capacidade)\b/.test(normalized)) {
    return { intent: "inventory_product_analysis", toolsUsed: ["inventory_tool", "pricing_tool", "campaign_tool"] }
  }

  return { intent: "general_question", toolsUsed: ["inventory_tool", "financial_tool", "sales_tool", "crm_tool"] }
}

function productLabel(category: unknown, model: unknown, color: unknown) {
  const categoryLabel = String(category || "").trim()
  const modelLabel = String(model || "").trim()
  const colorLabel = String(color || "").trim()
  const base = modelLabel && categoryLabel && compactText(modelLabel).startsWith(compactText(categoryLabel))
    ? modelLabel
    : [categoryLabel, modelLabel].filter(Boolean).join(" ")
  return [base, colorLabel].filter(Boolean).join(" ") || "Produto sem nome"
}

function safeProductName(row: { category: unknown; product_model: unknown; color: unknown }) {
  return productLabel(row.category, row.product_model, row.color)
}

function minimumSafePrice(cost: number) {
  if (cost <= 0) return 0

  // Cálculo de margem operacional real (Regra: Piso mais inteligente)
  const cardFees = cost * ESTIMATED_CARD_FEE_PCT
  const operationalCost = cost + cardFees + FALLBACK_COMMERCIAL_ASSUMPTIONS.estimatedBundleCost + FALLBACK_COMMERCIAL_ASSUMPTIONS.estimatedWarrantyReserve

  return round(operationalCost / (1 - MIN_SAFE_MARGIN))
}

function marginPct(price: number, cost: number) {
  return price > 0 ? round(((price - cost) / price) * 100, 1) : 0
}

function scoreInventoryCandidate(
  row: InventoryCandidateRow,
  query: string,
  tokens: string[],
  commercialSubject?: CommercialSubjectResolution | null
) {
  const resolvedMatch = commercialSubject?.matches.find((match) => match.inventoryId === row.id)
  if (resolvedMatch) {
    return {
      score: resolvedMatch.score,
      reason: `resolver dinâmico: ${resolvedMatch.reason}`,
    }
  }

  const normalizedQuery = compactText(query)
  const haystack = compactText([
    row.brand,
    row.category,
    row.product_model,
    row.capacity,
    row.color,
    row.product_type,
    row.grade,
    row.condition_notes,
    row.notes,
  ].map((part) => String(part || "")).join(" "))
  const joinedHaystack = compactJoined(haystack)
  const status = String(row.status || "pending")
  const reasons: string[] = []
  let score = 0

  for (const token of tokens) {
    if (haystack.includes(token) || joinedHaystack.includes(token)) {
      score += 18
      reasons.push(`+18 ${token}`)
    }
  }

  if (tokens.length && score > 0) {
    const coverage = tokens.filter((token) => haystack.includes(token) || joinedHaystack.includes(token)).length / tokens.length
    score += Math.round(coverage * 35)
    reasons.push(`cobertura ${Math.round(coverage * 100)}%`)
  }

  if (isOperationallyAvailable(status)) {
    score += 30
    reasons.push("+30 ativo")
  }
  const unavailablePenalty = statusScorePenalty(status)
  if (unavailablePenalty < 0) {
    score += unavailablePenalty
    reasons.push(`${unavailablePenalty} ${isExplicitlyUnavailable(status) ? "indisponível" : "limbo"}`)
  }
  if (commercialSubject?.subjectType === "category" && commercialSubject.category && normalizedQuery.includes(compactText(commercialSubject.category))) score += 20

  return {
    score,
    reason: reasons.join(", ") || "sem correspondência forte",
  }
}

async function buildInventoryContext(
  companyId: string,
  question: string,
  toolsUsed: OrionBusinessToolName[],
  commercialSubject?: CommercialSubjectResolution | null
) {
  if (!toolsUsed.includes("inventory_tool") && !toolsUsed.includes("pricing_tool")) return null
  const tokens = commercialSubject?.matches.length ? [] : questionLooksProductSpecific(question) ? extractSearchTokens(question) : []

  const result = await pool.query<InventoryCandidateRow>(
    `
      SELECT
        i.id,
        i.status,
        i.purchase_price,
        i.suggested_price,
        i.purchase_date,
        i.quantity,
        COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS category,
        COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS product_model,
        COALESCE(i.color_name_snapshot, pc.color) AS color,
        COALESCE(NULLIF(i.attribute_summary_snapshot, ''), NULLIF(pc.storage, ''), NULLIF(pc.variant, '')) AS capacity,
        i.grade,
        i.condition_notes,
        i.notes,
        i.origin,
        i.type,
        i.product_type,
        pc.brand
      FROM inventory i
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      WHERE i.company_id = $1::uuid
        AND i.status IN ('active', 'in_stock')
      ORDER BY i.purchase_date ASC, i.created_at ASC
    `,
    [companyId]
  )

  const scoredRows = result.rows
    .map((row) => ({ row, ...scoreInventoryCandidate(row, question, tokens, commercialSubject) }))
    .sort((a, b) => b.score - a.score)
  const hasResolvedSubject = Boolean(commercialSubject?.matches.length)
  const filteredRows = scoredRows.filter((item) => {
    const available = isOperationallyAvailable(String(item.row.status || "pending")) && !isExplicitlyUnavailable(String(item.row.status || "pending"))
    if (!available) return false
    return hasResolvedSubject ? item.score > 0 : true
  })

  const items: InventoryContextItem[] = filteredRows.map((row) => {
    const purchasePrice = number(row.row.purchase_price)
    const suggestedPrice = number(row.row.suggested_price)
    const safePrice = minimumSafePrice(purchasePrice)
    return {
      id: row.row.id,
      name: safeProductName(row.row),
      status: String(row.row.status || "pending"),
      color: row.row.color,
      capacity: row.row.capacity,
      grade: row.row.grade,
      condition: row.row.condition_notes,
      category: String(row.row.category || "Outros"),
      productType: row.row.product_type,
      purchasePrice: round(purchasePrice),
      suggestedPrice: round(suggestedPrice),
      marginPct: marginPct(suggestedPrice, purchasePrice),
      daysInStock: daysBetween(row.row.purchase_date),
      origin: String(row.row.origin || "purchase"),
      type: String(row.row.type || "own"),
      quantity: number(row.row.quantity || 1) || 1,
      minimumSafePrice: safePrice,
      maxSafeDiscount: suggestedPrice > 0 ? round(Math.max(0, suggestedPrice - safePrice)) : 0,
      matchScore: row.score,
      matchReason: row.reason,
    }
  })
  const topMatches = scoredRows.slice(0, 8).map((item) => ({
    id: item.row.id,
    name: safeProductName(item.row),
    status: String(item.row.status || "pending"),
    score: item.score,
    reason: item.reason,
  }))
  const selectedMatch = items[0]
    ? {
      id: items[0].id,
      name: items[0].name,
      status: items[0].status,
      score: items[0].matchScore,
      reason: items[0].matchReason,
    }
    : null

  return {
    searchTokens: tokens,
    products: items,
    productCount: items.length,
    stuckProducts: items.filter((item) => item.daysInStock >= 30),
    highMarginProducts: [...items].sort((a, b) => b.marginPct - a.marginPct).slice(0, 5),
    inventory_search_debug: {
      query: question,
      normalized_query: compactText(question),
      filters_used: {
        companyId: "scoped",
        tokens,
        dynamicSubject: commercialSubject ? {
          subjectType: commercialSubject.subjectType,
          confidence: commercialSubject.confidence,
          needsClarification: commercialSubject.needsClarification,
          primarySubject: commercialSubject.primarySubject?.productName || null,
          compatibleAccessories: commercialSubject.compatibleAccessories.map((match) => match.productName).slice(0, 5),
        } : null,
        activeStatuses: Array.from(OPERATIONAL_STATUSES),
        unavailableStatuses: Array.from(EXCLUDED_STATUSES),
        candidateLimit: "todos os produtos operacionais ativos",
      },
      total_candidates: result.rows.length,
      top_matches: topMatches,
      selected_match: selectedMatch,
    } satisfies InventorySearchDebug,
  }
}

async function buildSalesContext(companyId: string, toolsUsed: OrionBusinessToolName[], question: string) {
  if (!toolsUsed.includes("sales_tool") && !toolsUsed.includes("dre_tool")) return null
  const tokens = questionLooksProductSpecific(question) ? extractSearchTokens(question) : []
  const params: unknown[] = [companyId]
  const clauses = tokens.map((token) => {
    params.push(`%${token}%`)
    return `(COALESCE(i.category_name_snapshot, pc.category, i.product_type, '') || ' ' || COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant, '') || ' ' || COALESCE(i.color_name_snapshot, pc.color, '')) ILIKE $${params.length}`
  })
  params.push(MAX_TOOL_ROWS * 2)

  const result = await pool.query<{
    id: string
    sale_date: string
    sale_price: string | number | null
    net_amount: string | number | null
    supplier_cost: string | number | null
    notes: string | null
    sale_status: string | null
    payment_method: string | null
    purchase_price: string | number | null
    product_name: string | null
    product_category: string | null
    color: string | null
  }>(
    `
      SELECT
        s.id,
        s.sale_date,
        s.sale_price,
        s.net_amount,
        s.supplier_cost,
        s.notes,
        s.sale_status,
        s.payment_method,
        i.purchase_price,
        COALESCE(i.subcategory_name_snapshot, pc.model, pc.variant) AS product_name,
        COALESCE(i.category_name_snapshot, pc.category, i.product_type, 'Outros') AS product_category,
        COALESCE(i.color_name_snapshot, pc.color) AS color
      FROM sales s
      LEFT JOIN inventory i ON i.id = s.inventory_id
      LEFT JOIN product_catalog pc ON pc.id = i.catalog_id
      WHERE s.company_id = $1::uuid
        AND COALESCE(s.sale_status, 'completed') <> 'cancelled'
        ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT $${params.length}
    `,
    params
  )

  const saleIds = result.rows.map((row) => row.id)
  const additionalItems = saleIds.length
    ? await pool.query<{ sale_id: string; type: string; cost_price: string | number | null; sale_price: string | number | null; profit: string | number | null }>(
      `
        SELECT sale_id, type, cost_price, sale_price, profit
        FROM sales_additional_items
        WHERE company_id = $1::uuid
          AND sale_id = ANY($2::uuid[])
      `,
      [companyId, saleIds]
    )
    : { rows: [] }
  const additionalBySale = new Map<string, typeof additionalItems.rows>()
  for (const item of additionalItems.rows) {
    const current = additionalBySale.get(item.sale_id) || []
    current.push(item)
    additionalBySale.set(item.sale_id, current)
  }

  const sales: SaleContextItem[] = result.rows.map((sale) => {
    const totals = calcSaleTotals({
      salePrice: sale.sale_price,
      mainCost: sale.purchase_price,
      supplierCost: sale.supplier_cost,
      qty: parseQtyFromNotes(sale.notes),
      additionalItems: additionalBySale.get(sale.id) || [],
    })
    return {
      id: sale.id,
      date: String(sale.sale_date),
      product: productLabel(sale.product_category, sale.product_name, sale.color),
      revenue: round(number(sale.sale_price)),
      profit: round(totals.lucroTotal),
      marginPct: round(totals.margemTotal, 1),
      paymentMethod: sale.payment_method,
      status: String(sale.sale_status || "completed"),
    }
  })

  const productProfit = new Map<string, { revenue: number; profit: number; count: number }>()
  for (const sale of sales) {
    const item = productProfit.get(sale.product) || { revenue: 0, profit: 0, count: 0 }
    item.revenue += sale.revenue
    item.profit += sale.profit
    item.count += 1
    productProfit.set(sale.product, item)
  }

  return {
    recentSales: sales.slice(0, MAX_TOOL_ROWS),
    topProfitProducts: Array.from(productProfit, ([product, values]) => ({
      product,
      revenue: round(values.revenue),
      profit: round(values.profit),
      sales: values.count,
      marginPct: values.revenue ? marginPct(values.revenue, values.revenue - values.profit) : 0,
    })).sort((a, b) => b.profit - a.profit).slice(0, 8),
  }
}

async function buildCrmContext(companyId: string, toolsUsed: OrionBusinessToolName[], question: string) {
  if (!toolsUsed.includes("crm_tool")) return null
  const tokens = extractSearchTokens(question)
  const params: unknown[] = [companyId]
  const clauses = tokens.map((token) => {
    params.push(`%${token}%`)
    return `(COALESCE(product_interest, '') || ' ' || COALESCE(status, '') || ' ' || COALESCE(origin, '') || ' ' || COALESCE(source, '')) ILIKE $${params.length}`
  })
  params.push(MAX_TOOL_ROWS)

  const result = await pool.query<{
    id: string
    name: string
    status: string
    lead_temperature: string | null
    product_interest: string | null
    next_action: string | null
    next_action_at: string | null
    created_at: string
  }>(
    `
      SELECT id, name, status, lead_temperature, product_interest, next_action, next_action_at, created_at
      FROM marketing_leads
      WHERE company_id = $1::uuid
        AND status NOT IN ('sold', 'lost', 'abandoned', 'closed', 'cancelled', 'canceled', 'opt_out')
        ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
      ORDER BY
        CASE lead_temperature WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
        COALESCE(next_action_at, created_at) ASC
      LIMIT $${params.length}
    `,
    params
  )

  const leads: LeadContextItem[] = result.rows
    .filter((lead) => isActionableLead(lead.status))
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      status: lead.status,
      temperature: lead.lead_temperature,
      productInterest: lead.product_interest,
      daysWithoutAction: daysBetween(lead.next_action_at || lead.created_at),
      nextAction: lead.next_action,
    }))

  return {
    openLeads: leads,
    hotLeads: leads.filter((lead) => lead.temperature === "hot" || lead.status === "hot_negotiation"),
    staleLeads: leads.filter((lead) => lead.daysWithoutAction > 0),
  }
}

async function buildCampaignContext(companyId: string, toolsUsed: OrionBusinessToolName[]) {
  if (!toolsUsed.includes("campaign_tool")) return null
  const result = await pool.query<{
    id: string
    name: string
    channel: string
    status: string
    budget_amount: string | number | null
    actual_spend: string | number | null
    leads: string | number | null
    sales: string | number | null
    revenue: string | number | null
  }>(
    `
      SELECT
        c.id,
        c.name,
        c.channel,
        c.status,
        c.budget_amount,
        c.actual_spend,
        COUNT(DISTINCT l.id) AS leads,
        COUNT(DISTINCT s.id) FILTER (WHERE COALESCE(s.sale_status, 'completed') <> 'cancelled') AS sales,
        COALESCE(SUM(s.sale_price) FILTER (WHERE COALESCE(s.sale_status, 'completed') <> 'cancelled'), 0) AS revenue
      FROM marketing_campaigns c
      LEFT JOIN marketing_leads l ON l.campaign_id = c.id AND l.company_id = c.company_id
      LEFT JOIN sales s ON s.marketing_campaign_id = c.id AND s.company_id = c.company_id
      WHERE c.company_id = $1::uuid
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $2
    `,
    [companyId, MAX_TOOL_ROWS]
  )

  const campaigns: CampaignContextItem[] = result.rows.map((campaign) => {
    const spend = number(campaign.actual_spend || campaign.budget_amount)
    const revenue = number(campaign.revenue)
    const roi = spend > 0 ? round(revenue / spend, 2) : null
    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      spend: round(spend),
      leads: number(campaign.leads),
      sales: number(campaign.sales),
      revenue: round(revenue),
      roi,
    }
  })

  return {
    campaigns,
    bestCampaigns: [...campaigns]
      .sort((a, b) => {
        if (a.roi === null && b.roi !== null) return 1
        if (a.roi !== null && b.roi === null) return -1
        return (b.roi || 0) - (a.roi || 0)
      })
      .slice(0, 5),
    weakCampaigns: campaigns.filter((campaign) => campaign.roi !== null && campaign.roi < 1).slice(0, 5),
  }
}

async function buildFinancialContext(companyId: string, toolsUsed: OrionBusinessToolName[], snapshot: OrionSnapshot) {
  if (!toolsUsed.includes("financial_tool") && !toolsUsed.includes("cashflow_tool") && !toolsUsed.includes("dre_tool")) return null
  const result = await pool.query<TransactionContextItem>(
    `
      SELECT
        t.type,
        t.category,
        t.amount,
        COALESCE(t.status, 'pending') AS status,
        COALESCE(t.date, t.due_date)::text AS date,
        t.source_type AS "sourceType",
        ca.financial_type AS "financialType",
        ca.statement_section AS "statementSection",
        COALESCE(ca.affects_inventory, FALSE) AS "affectsInventory",
        COALESCE(ca.affects_owner_equity, FALSE) AS "affectsOwnerEquity"
      FROM transactions t
      LEFT JOIN finance_chart_accounts ca ON ca.id = t.chart_account_id
      WHERE t.company_id = $1::uuid
        AND COALESCE(t.status, 'pending') <> 'cancelled'
        AND COALESCE(t.date, t.due_date) >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY COALESCE(t.date, t.due_date) DESC
      LIMIT $2
    `,
    [companyId, MAX_TOOL_ROWS * 3]
  )

  const transactions = result.rows.map((tx) => ({
    ...tx,
    amount: number(tx.amount),
  }))
  const classifyTx = (tx: TransactionContextItem) => classifyTransaction(tx)
  const isOwnerEquity = (tx: TransactionContextItem) => classifyTx(tx).affectsOwnerEquity
  const isOperational = (tx: TransactionContextItem) => {
    const classification = classifyTx(tx)
    return classification.affectsCash
      && !["inventory_purchase", "owner_contribution", "owner_withdrawal", "owner_capital_return", "owner_profit_withdrawal", "transfer", "adjustment", "reversal", "receivable", "payable", "unknown"].includes(classification.movementType)
  }
  const reconciled = transactions.filter((tx) => tx.status === "reconciled")
  const dreTransactions = transactions.filter((tx) => tx.statementSection === "dre")

  return {
    cash: {
      reconciledCashBalance: snapshot.finance.reconciledCashBalance,
      cashBalanceSource: snapshot.finance.cashBalanceSource,
      operationalCashFlow30d: snapshot.finance.operationalCashFlow30d,
      ownerEquityMovement30d: snapshot.finance.ownerEquityMovement30d,
      availableOperationalProfitEstimate: snapshot.finance.availableOperationalProfitEstimate,
      pendingReceivables: snapshot.executive.pendingReceivables,
      pendingPayables: snapshot.executive.pendingPayables,
    },
    operationalContext: snapshot.finance.financialOperationalContext,
    realProfit: snapshot.finance.realProfitSnapshot,
    workingCapital: snapshot.finance.workingCapitalSnapshot,
    profitAvailability: snapshot.finance.profitAvailabilitySnapshot,
    cashComposition: snapshot.finance.currentCashCompositionSnapshot,
    moneyClassification: {
      byMovementType: snapshot.finance.moneyClassification.totals.byMovementType,
      byFinancialNature: snapshot.finance.moneyClassification.totals.byFinancialNature,
      byOperationalNature: snapshot.finance.moneyClassification.totals.byOperationalNature,
      uncertainCount: snapshot.finance.moneyClassification.totals.uncertainCount,
      availableOperationalProfitEstimate: snapshot.finance.moneyClassification.availableOperationalProfitEstimate,
    },
    reconciledMovementSummary: {
      income: round(reconciled.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0)),
      expense: round(reconciled.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0)),
      operational: round(reconciled.filter(isOperational).reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0)),
      ownerEquity: round(reconciled.filter(isOwnerEquity).reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0)),
    },
    dre: {
      revenue: round(dreTransactions.filter((tx) => tx.financialType === "revenue").reduce((sum, tx) => sum + tx.amount, 0)),
      cogs: round(dreTransactions.filter((tx) => tx.financialType === "cogs").reduce((sum, tx) => sum + tx.amount, 0)),
      operatingExpenses: round(dreTransactions.filter((tx) => tx.financialType === "operating_expense").reduce((sum, tx) => sum + tx.amount, 0)),
    },
  }
}

function countRecords(contexts: Record<string, unknown>) {
  let total = 0
  for (const value of Object.values(contexts)) {
    if (!value || typeof value !== "object") continue
    let countedArray = false
    for (const entry of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(entry)) {
        countedArray = true
        total += entry.length
      }
    }
    if (!countedArray) total += 1
  }
  return total
}

function selectPromotionProducts(contexts: Record<string, unknown>) {
  const inventory = contexts.inventory as { products?: InventoryContextItem[] } | null
  const products = inventory?.products || []
  const question = String(contexts.question || "")
  const askingAccessory = questionMentionsAccessory(question)

  return [...products].sort((a, b) => {
    const aText = compactText(`${a.productType || ""} ${a.category}`)
    const bText = compactText(`${b.productType || ""} ${b.category}`)
    const aAccessory = aText.includes("accessory") || aText.includes("acessorio")
    const bAccessory = bText.includes("accessory") || bText.includes("acessorio")
    if (!askingAccessory && aAccessory !== bAccessory) return aAccessory ? 1 : -1
    return a.daysInStock - b.daysInStock
  })
}

function asksForCommercialAction(question: string) {
  const normalized = compactText(question)
  return /\b(o que posso fazer|fazer para vender|vender|anunciar|campanha|promover|girar|giro|baixar|desconto|sem perder margem|mais rapido|mais rapido)\b/.test(normalized)
}

function productShortName(product: InventoryContextItem) {
  return product.name
    .replace(/\s+/g, " ")
    .replace(/\bAcessórios\s+/i, "")
    .trim()
}

function productDetailsLine(product: InventoryContextItem) {
  const color = product.color || ""
  const capacity = (product.capacity || "")
    .split(/[·|/,-]/)
    .map((part) => part.trim())
    .filter((part) => part && (!color || compactText(part) !== compactText(color)))
    .join(" · ")
  const name = productShortName(product)
  return [
    capacity && !compactText(name).includes(compactText(capacity)) ? capacity : null,
    color && !compactText(name).includes(compactText(color)) && !compactText(capacity).includes(compactText(color)) ? color : null,
    product.grade ? `Grade ${product.grade}` : null,
  ].filter(Boolean).join(", ")
}

function healthLabel(health: OperationalHealthScore) {
  if (health.level === "critical") return "liquidez sob pressão imediata"
  if (health.level === "attention") return "liquidez em atenção"
  if (health.level === "stable") return "operação estável"
  return "operação com espaço para crescer"
}

function signalProducts(sales: { topProfitProducts?: Array<{ product: string; profit: number; revenue: number; sales: number }> } | null | undefined) {
  return (sales?.topProfitProducts || []).slice(0, 3)
}

function commercialActionAnswer(
  product: InventoryContextItem,
  snapshot: OrionSnapshot,
  health: OperationalHealthScore,
  availableProducts: InventoryContextItem[],
  sales?: { topProfitProducts?: Array<{ product: string; profit: number; revenue: number; sales: number }> } | null
) {
  const strategy = buildCommercialStrategy(product, snapshot, health)
  const details = productDetailsLine(product)
  const portfolio = [
    product,
    ...availableProducts.filter((item) => item.id !== product.id),
  ]

  return buildScenarioExecutionPlan({
    products: portfolio,
    snapshot,
    health,
    targetProfit: strategy.expectedProfit,
    signalProducts: signalProducts(sales),
    context: `${strategy.diagnosis} ${details ? `Produto: ${productShortName(product)} (${details}).` : `Produto: ${productShortName(product)}.`}`,
  })
}

function promotionActionAnswer(
  products: InventoryContextItem[],
  snapshot: OrionSnapshot,
  health: OperationalHealthScore,
  sales?: { topProfitProducts?: Array<{ product: string; profit: number; revenue: number; sales: number }> } | null
) {
  const primary = products[0]
  if (!primary) return "Estoque insuficiente ou mal cadastrado para planejar campanha. Cadastre os custos e preços sugeridos."
  return buildScenarioExecutionPlan({
    products,
    snapshot,
    health,
    targetProfit: expectedProductProfit(primary),
    signalProducts: signalProducts(sales),
    context: "Campanha de giro com comparação de margem, velocidade, tráfego e liquidez.",
  })
}

function expectedProductProfit(product: InventoryContextItem) {
  const salePrice = product.suggestedPrice || product.purchasePrice * 1.2
  return Math.max(0, round(salePrice - product.purchasePrice - FALLBACK_COMMERCIAL_ASSUMPTIONS.estimatedBundleCost))
}

function pressureGoalFromSnapshot(snapshot: OrionSnapshot) {
  const forecast = snapshot.executive.liquidityForecast
  const immediateObligations = forecast.overduePayables + forecast.todayPayables + forecast.payables7d
  const immediateInflows = forecast.overdueReceivables + forecast.todayReceivables + forecast.receivables7d
  return Math.max(0, round(immediateObligations - immediateInflows - snapshot.finance.reconciledCashBalance))
}

function financialGoalAnswer(
  contexts: Record<string, unknown>,
  snapshot: OrionSnapshot,
  question: string,
  health: OperationalHealthScore
) {
  const inventory = contexts.inventory as { products?: InventoryContextItem[] } | null
  const sales = contexts.sales as { topProfitProducts?: Array<{ product: string; profit: number; revenue: number; sales: number }> } | null
  const products = selectPromotionProducts(contexts).filter((product) => product.suggestedPrice > 0 || product.purchasePrice > 0)
  const explicitGoal = parseMoneyTarget(question)
  const pressureGoal = pressureGoalFromSnapshot(snapshot)
  const goal = explicitGoal || pressureGoal

  if (!inventory?.products?.length || !products.length) {
    return buildScenarioExecutionPlan({
      products: [],
      snapshot,
      health,
      targetProfit: explicitGoal || pressureGoal,
      signalProducts: signalProducts(sales),
      context: "Meta financeira solicitada, mas sem produto ativo seguro para execução.",
    })
  }

  const primary = products[0]
  const goalLabel = explicitGoal
    ? `Gerar ${brl(explicitGoal)} de lucro operacional.`
    : pressureGoal > 0
      ? `Cobrir pressão operacional estimada em ${brl(pressureGoal)} nos próximos dias.`
      : `Gerar lucro incremental com o estoque ativo, começando por ${productShortName(primary)}.`

  return buildScenarioExecutionPlan({
    products,
    snapshot,
    health,
    targetProfit: goal || expectedProductProfit(primary),
    signalProducts: signalProducts(sales),
    context: `${healthLabel(health)}. ${goalLabel}`,
  })
}

function unidentifiedProductActionAnswer() {
  return [
    "Consigo montar o plano, mas preciso do item específico para calcular preço seguro sem risco.",
    "",
    "Diagnóstico rápido:",
    "Sem identificar o produto, eu não devo assumir custo, margem ou preço mínimo. Isso evitaria uma recomendação perigosa.",
    "",
    "O que fazer agora:",
    "1. Me mande o nome do produto, modelo, cor ou capacidade.",
    "2. Antes de baixar preço, chame leads antigos que perguntaram por produto parecido.",
    "3. Tente primeiro parcelamento, brinde ou kit com acessório.",
    "4. Só dê desconto para cliente pronto para fechar hoje.",
    "",
    "Limite de desconto/preço seguro: preciso do produto exato para calcular o piso.",
    "",
    "Campanha sugerida: abordagem direta no WhatsApp antes de tráfego pago.",
    "",
    "Mensagem pronta para WhatsApp:",
    "“Tenho uma condição especial em uma unidade pronta entrega, com garantia e possibilidade de parcelamento. Quer que eu te mande as opções disponíveis?”",
    "",
    "Próximo passo em 48h: se você me informar o item, eu calculo o piso seguro e monto a oferta exata.",
  ].join("\n")
}

function buildAnswer(intent: OrionBusinessIntent, contexts: Record<string, unknown>, snapshot: OrionSnapshot, question: string) {
  const inventory = contexts.inventory as { products?: InventoryContextItem[]; stuckProducts?: InventoryContextItem[] } | null
  const sales = contexts.sales as { topProfitProducts?: Array<{ product: string; profit: number; revenue: number; sales: number; marginPct: number }> } | null
  const crm = contexts.crm as { hotLeads?: LeadContextItem[]; staleLeads?: LeadContextItem[] } | null
  const campaigns = contexts.campaigns as { bestCampaigns?: CampaignContextItem[]; weakCampaigns?: CampaignContextItem[] } | null
  const finance = contexts.finance as {
    cash?: {
      reconciledCashBalance: number
      operationalCashFlow30d: number
      ownerEquityMovement30d: number
      pendingReceivables: number
      pendingPayables: number
    }
    operationalContext?: OrionFinancialOperationalContext
    realProfit?: OrionSnapshot["finance"]["realProfitSnapshot"]
    workingCapital?: OrionSnapshot["finance"]["workingCapitalSnapshot"]
    profitAvailability?: OrionSnapshot["finance"]["profitAvailabilitySnapshot"]
    cashComposition?: OrionSnapshot["finance"]["currentCashCompositionSnapshot"]
  } | null
  const financialContext = finance?.operationalContext || snapshot.finance.financialOperationalContext
  const workingCapital = finance?.workingCapital || snapshot.finance.workingCapitalSnapshot
  const traceabilityAnswer = buildFinancialTraceabilityResponse(financialContext, question)
  if (traceabilityAnswer) return traceabilityAnswer
  const product = inventory?.products?.[0]
  const hasSpecificProduct = questionLooksProductSpecific(question)
  const health = calculateOperationalHealth(snapshot)

  if (intent === "financial_goal_execution") {
    return financialGoalAnswer(contexts, snapshot, question, health)
  }

  if (intent === "financial_traceability") {
    return traceabilityAnswer
      || "Não encontrei movimentos financeiros detalhados no período selecionado. Os totais agregados continuam disponíveis no snapshot financeiro."
  }

  if (questionReferencesUnidentifiedProduct(question) || (intent === "pricing_analysis" && !hasSpecificProduct)) {
    return unidentifiedProductActionAnswer()
  }

  if ((intent === "inventory_product_analysis" || intent === "pricing_analysis") && product && hasSpecificProduct) {
    if (asksForCommercialAction(question)) {
      return commercialActionAnswer(product, snapshot, health, inventory?.products || [product], sales)
    }

    const priceLine = product.minimumSafePrice
      ? `Limite seguro de venda: ${brl(product.minimumSafePrice)}.`
      : "Risco: Falta custo ou preço para validar o limite seguro."
    const recommendation = intent === "pricing_analysis"
      ? product.maxSafeDiscount > 0
        ? `Você tem ${brl(product.maxSafeDiscount)} de gordura para desconto. Negocie valor antes de usar tudo.`
        : "Margem apertada. NÃO aplique desconto neste produto."
      : "Venda agora antes que o aparelho perca mais valor na prateleira."

    return [
      `Diagnóstico: ${product.name} está há ${product.daysInStock} dias em estoque com margem de ${pct(product.marginPct)}.`,
      priceLine,
      recommendation,
    ].join("\n\n")
  }

  if ((intent === "inventory_product_analysis" || intent === "pricing_analysis") && (!product || !hasSpecificProduct)) {
    return "Não encontrei esse produto no estoque operacional ativo. Ele pode estar vendido, em reparo ou mal cadastrado. Não vou recomendar ação sobre produto indisponível."
  }

  if (intent === "promotion_recommendation") {
    if (product && questionLooksProductSpecific(question)) {
      if (asksForCommercialAction(question)) {
        return commercialActionAnswer(product, snapshot, health, inventory?.products || [product], sales)
      }
      return [
        `Diagnóstico: ${product.name} parado há ${product.daysInStock} dias. Margem: ${pct(product.marginPct)}.`,
        `Limite seguro: ${product.minimumSafePrice ? brl(product.minimumSafePrice) : "Não calculado"}.`,
        "O que fazer agora: Anuncie com foco em parcelamento e urgência. Evite desconto excessivo no primeiro dia.",
      ].join("\n\n")
    }

    const products = selectPromotionProducts(contexts)
    if (!products.length) return "Estoque inconsistente para campanhas de giro. Arrume os cadastros primeiro."
    return promotionActionAnswer(products, snapshot, health, sales)
  }

  if (intent === "purchase_capacity_analysis") {
    return formatFinancialDecisionResponse(buildFinancialDecisionResponse({
      reasoningMode: "reinvestment_decision",
      userQuestion: question,
      financialContext,
      financialSafetyAudit: workingCapital.financialSafetyAudit,
    }))
  }

  if (intent === "cash_health_analysis") {
    const forecast = snapshot.executive.liquidityForecast
    const realProfit = finance?.realProfit || snapshot.finance.realProfitSnapshot
    if (questionLooksAvailableOperationalProfit(question) || isFinancialWithdrawalDecisionRequest(question)) {
      void realProfit
      return formatFinancialDecisionResponse(buildFinancialDecisionResponse({
        reasoningMode: "withdrawal_safety",
        userQuestion: question,
        financialContext,
        financialSafetyAudit: workingCapital.financialSafetyAudit,
      }))
    }
    const profitAvailability = finance?.profitAvailability || snapshot.finance.profitAvailabilitySnapshot
    const cashComposition = finance?.cashComposition || snapshot.finance.currentCashCompositionSnapshot
    return [
      `Período analisado: ${profitAvailability.period.label}. Lucro realizado: ${brl(profitAvailability.realizedProfitInPeriod)}; retiradas de lucro: ${brl(profitAvailability.ownerProfitWithdrawalsInPeriod)}; devoluções de aporte: ${brl(profitAvailability.ownerCapitalReturnsInPeriod)}; devoluções sem lastro: ${brl(profitAvailability.untracedOwnerCapitalReturnsInPeriod)}; lucro após retiradas: ${brl(profitAvailability.profitAfterWithdrawals)}.`,
      `Caixa consolidado: ${brl(cashComposition.consolidatedCash)}. Disponível para retirada: ${brl(cashComposition.availableForWithdrawal)}. Disponível para reinvestimento: ${brl(cashComposition.availableForReinvestment)}.`,
      financialContext.operationalSummary,
      financialContext.profitInterpretation,
      `Próximos 7 dias: ${brl(forecast.receivables7d)} a receber e ${brl(forecast.payables7d)} a pagar. Isso não altera a liquidez disponível até conciliar.`,
      financialContext.financialWarnings.length
        ? financialContext.financialWarnings.slice(0, 3).join(" ")
        : financialContext.cashHealth === "healthy"
          ? "Caixa saudável, com baixa pressão de liquidez."
          : "Caixa exige atenção operacional.",
    ].join("\n\n")
  }

  if (intent === "sales_profit_analysis") {
    const realProfit = finance?.realProfit || snapshot.finance.realProfitSnapshot
    const topRealProfit = realProfit.sales
      .filter((sale) => sale.availableProfit > 0)
      .sort((a, b) => b.availableProfit - a.availableProfit)
      .slice(0, 3)
    if (topRealProfit.length) {
      return [
        "Foque nestas vendas/produtos pelo lucro real disponível rastreável:",
        ...topRealProfit.map((item, index) => `${index + 1}. ${item.saleLabel || item.saleId}: ${brl(item.availableProfit)} disponíveis, com ${brl(item.protectedCapital)} protegidos.`),
      ].join("\n")
    }
    const top = sales?.topProfitProducts?.slice(0, 3) || []
    if (!top.length) return "Dados de venda insuficientes para ranquear lucro."
    return [
      "Foque nestes produtos nas próximas negociações de compra (maior lucro gerado):",
      ...top.map((item, index) => `${index + 1}. ${item.product} (${brl(item.profit)})`),
    ].join("\n")
  }

  if (intent === "crm_follow_up_analysis") {
    const stale = crm?.staleLeads?.slice(0, 3) || []
    if (!stale.length) return "CRM atualizado. Sem leads atrasados críticos."
    return [
      "Seu problema de venda hoje está no CRM. Feche estes leads antes de buscar novos:",
      ...stale.map((lead, index) => `${index + 1}. ${lead.name} (${lead.daysWithoutAction} dias parado)`),
    ].join("\n")
  }

  if (intent === "campaign_performance_analysis") {
    const best = campaigns?.bestCampaigns?.[0]
    if (!best) return "Campanhas sem volume suficiente para análise."
    const roiLabel = best.roi !== null ? `ROI de ${round(best.roi, 2)}x` : "Sem gasto registrado"
    return [
      `Campanha campeã: ${best.name} (${roiLabel}).`,
      best.roi && best.roi > 1
        ? "O criativo validou. Aumente verba em passos de 20% mantendo monitoramento."
        : best.roi !== null
          ? "Pause ou troque a oferta. O retorno não justifica o gasto atual."
          : "Esta campanha gerou resultado sem custo direto reportado. Valide a origem do tráfego.",
    ].join("\n\n")
  }

  if (intent === "executive_business_overview") {
    const { liquidityForecast } = snapshot.executive
    const products = selectPromotionProducts(contexts)
    const primary = products[0]

    const pressureInfo = liquidityForecast.pressureWindowStartDays !== null
      ? liquidityForecast.pressureWindowStartDays === 0
        ? "Atenção: existe pressão de caixa imediata por vencimentos pendentes."
        : `Atenção: existe pressão de caixa prevista em ${liquidityForecast.pressureWindowStartDays} dias.`
      : "Fluxo de caixa futuro sem janelas de pressão imediatas."

    const hotLeads = snapshot.marketing.forgottenLeads.filter(l => l.classification === "hot")
    const leadSummary = hotLeads.length > 0
      ? `Existem ${hotLeads.length} leads de alta intenção aguardando retorno imediato.`
      : "Leads ativos estão em dia ou em fase de prospecção."

    return buildScenarioExecutionPlan({
      products,
      snapshot,
      health,
      targetProfit: primary ? expectedProductProfit(primary) : null,
      signalProducts: signalProducts(sales),
      context: `Leitura operacional: ${healthLabel(health)}. Caixa ${brl(snapshot.finance.reconciledCashBalance)}, recebíveis próximos ${brl(liquidityForecast.receivables7d)} e obrigações próximas ${brl(liquidityForecast.payables7d)}. ${pressureInfo} ${leadSummary}`,
    })
  }

  const products = selectPromotionProducts(contexts)
  const primary = products[0]
  return buildScenarioExecutionPlan({
    products,
    snapshot,
    health,
    targetProfit: primary ? expectedProductProfit(primary) : null,
    signalProducts: signalProducts(sales),
    context: `Caixa em ${brl(snapshot.finance.reconciledCashBalance)} e ${snapshot.stock.stuckItems.length} item${snapshot.stock.stuckItems.length === 1 ? "" : "s"} acima da idade ideal de estoque.`,
  })
}

function buildSummary(intent: OrionBusinessIntent, matchedRecords: number) {
  if (matchedRecords === 0) return "A ORION consultou as áreas necessárias, mas não encontrou registros específicos suficientes."
  const byIntent: Record<OrionBusinessIntent, string> = {
    financial_traceability: "Rastreabilidade financeira consultada a partir dos movimentos auditáveis do período.",
    financial_goal_execution: "Plano de execução comercial montado a partir de meta financeira, estoque ativo, margem e liquidez.",
    inventory_product_analysis: "Produto consultado no estoque real da empresa.",
    pricing_analysis: "Preço analisado com base em custo, preço sugerido e margem interna.",
    purchase_capacity_analysis: "Recompra avaliada cruzando caixa, estoque, vendas e margem.",
    promotion_recommendation: "Produtos ranqueados com dados de estoque, margem, vendas e campanhas.",
    cash_health_analysis: "Caixa analisado com saldo reconciliado, fluxo operacional e movimentação societária separados.",
    sales_profit_analysis: "Lucro consultado a partir de vendas reais e custos internos.",
    executive_business_overview: "Visão executiva montada com dados operacionais das principais áreas.",
    crm_follow_up_analysis: "CRM consultado para identificar leads que exigem ação.",
    campaign_performance_analysis: "Campanhas consultadas com leads, vendas, gasto e ROI.",
    general_question: "Consulta operacional montada com dados internos relevantes.",
  }
  return byIntent[intent]
}

export async function buildOrionBusinessContext(
  companyId: string,
  question: string,
  snapshot: OrionSnapshot,
  intentRoute?: OrionIntentRouteSummary | null,
  commercialSubject?: CommercialSubjectResolution | null
): Promise<OrionOperationalContext> {
  const cleanQuestion = safeQuestion(question)
  const { intent, toolsUsed } = routeIntent(cleanQuestion, intentRoute)
  const [inventory, sales, crm, campaigns, finance] = await Promise.all([
    buildInventoryContext(companyId, cleanQuestion, toolsUsed, commercialSubject),
    buildSalesContext(companyId, toolsUsed, cleanQuestion),
    buildCrmContext(companyId, toolsUsed, cleanQuestion),
    buildCampaignContext(companyId, toolsUsed),
    buildFinancialContext(companyId, toolsUsed, snapshot),
  ])

  const contexts = Object.fromEntries(Object.entries({
    question: cleanQuestion,
    inventory,
    sales,
    crm,
    campaigns,
    finance,
  }).filter(([, value]) => Boolean(value)))
  const matchedRecords = countRecords(contexts)
  const answer = buildAnswer(intent, contexts, snapshot, cleanQuestion)
  const gaps = matchedRecords
    ? []
    : ["Não encontrei dados suficientes no estoque operacional para afirmar isso com segurança. O item pode estar vendido, em reparo ou com cadastro incompleto."]

  return {
    intent,
    toolsUsed,
    label: matchedRecords ? "Dados específicos do sistema" : "Consulta operacional",
    dataStatus: matchedRecords ? "specific_data_found" : "insufficient_data",
    matchedRecords,
    summary: buildSummary(intent, matchedRecords),
    answer,
    evidence: [
      buildSummary(intent, matchedRecords),
      "Análise baseada em estoque, vendas e financeiro.",
    ],
    gaps,
    inventory_search_debug: inventory?.inventory_search_debug,
    intentRoute: intentRoute || undefined,
    commercialSubject: commercialSubject ? {
      subjectType: commercialSubject.subjectType,
      category: commercialSubject.category,
      productFamily: commercialSubject.productFamily,
      model: commercialSubject.model,
      variation: commercialSubject.variation,
      compatibilityFamily: commercialSubject.compatibilityFamily,
      ambiguity: commercialSubject.ambiguity,
      needsClarification: commercialSubject.needsClarification,
      confidence: commercialSubject.confidence,
      reason: commercialSubject.reason,
      primarySubject: commercialSubject.primarySubject ? {
        inventoryId: commercialSubject.primarySubject.inventoryId,
        productName: commercialSubject.primarySubject.productName,
        category: commercialSubject.primarySubject.category,
        productFamily: commercialSubject.primarySubject.productFamily,
        model: commercialSubject.primarySubject.model,
        variation: commercialSubject.primarySubject.variation,
        color: commercialSubject.primarySubject.color,
        compatibilityFamily: commercialSubject.primarySubject.compatibilityFamily,
        quantity: commercialSubject.primarySubject.quantity,
        price: commercialSubject.primarySubject.price,
        cost: commercialSubject.primarySubject.cost,
        marginPct: commercialSubject.primarySubject.marginPct,
        daysInStock: commercialSubject.primarySubject.daysInStock,
        status: commercialSubject.primarySubject.status,
        productType: commercialSubject.primarySubject.productType,
        entityType: commercialSubject.primarySubject.entityType,
        entityRole: commercialSubject.primarySubject.entityRole,
        entityPriorityWeight: commercialSubject.primarySubject.entityPriorityWeight,
        score: commercialSubject.primarySubject.score,
        finalScore: commercialSubject.primarySubject.finalScore,
        reason: commercialSubject.primarySubject.reason,
      } : null,
      relatedProducts: commercialSubject.relatedProducts.slice(0, 8).map((match) => ({
        inventoryId: match.inventoryId,
        productName: match.productName,
        category: match.category,
        productFamily: match.productFamily,
        model: match.model,
        variation: match.variation,
        color: match.color,
        compatibilityFamily: match.compatibilityFamily,
        quantity: match.quantity,
        price: match.price,
        cost: match.cost,
        marginPct: match.marginPct,
        daysInStock: match.daysInStock,
        status: match.status,
        productType: match.productType,
        entityType: match.entityType,
        entityRole: match.entityRole,
        entityPriorityWeight: match.entityPriorityWeight,
        score: match.score,
        finalScore: match.finalScore,
        reason: match.reason,
      })),
      compatibleAccessories: commercialSubject.compatibleAccessories.slice(0, 8).map((match) => ({
        inventoryId: match.inventoryId,
        productName: match.productName,
        category: match.category,
        productFamily: match.productFamily,
        model: match.model,
        variation: match.variation,
        color: match.color,
        compatibilityFamily: match.compatibilityFamily,
        quantity: match.quantity,
        price: match.price,
        cost: match.cost,
        marginPct: match.marginPct,
        daysInStock: match.daysInStock,
        status: match.status,
        productType: match.productType,
        entityType: match.entityType,
        entityRole: match.entityRole,
        entityPriorityWeight: match.entityPriorityWeight,
        score: match.score,
        finalScore: match.finalScore,
        reason: match.reason,
      })),
      bundleCandidates: commercialSubject.bundleCandidates.slice(0, 4).map((candidate) => ({
        primary: {
          inventoryId: candidate.primary.inventoryId,
          productName: candidate.primary.productName,
          category: candidate.primary.category,
          productFamily: candidate.primary.productFamily,
          model: candidate.primary.model,
          variation: candidate.primary.variation,
          color: candidate.primary.color,
          compatibilityFamily: candidate.primary.compatibilityFamily,
          quantity: candidate.primary.quantity,
          price: candidate.primary.price,
          cost: candidate.primary.cost,
          marginPct: candidate.primary.marginPct,
          daysInStock: candidate.primary.daysInStock,
          status: candidate.primary.status,
          productType: candidate.primary.productType,
          entityType: candidate.primary.entityType,
          entityRole: candidate.primary.entityRole,
          entityPriorityWeight: candidate.primary.entityPriorityWeight,
          score: candidate.primary.score,
          finalScore: candidate.primary.finalScore,
          reason: candidate.primary.reason,
        },
        accessories: candidate.accessories.slice(0, 6).map((accessory) => ({
          inventoryId: accessory.inventoryId,
          productName: accessory.productName,
          category: accessory.category,
          productFamily: accessory.productFamily,
          model: accessory.model,
          variation: accessory.variation,
          color: accessory.color,
          compatibilityFamily: accessory.compatibilityFamily,
          quantity: accessory.quantity,
          price: accessory.price,
          cost: accessory.cost,
          marginPct: accessory.marginPct,
          daysInStock: accessory.daysInStock,
          status: accessory.status,
          productType: accessory.productType,
          entityType: accessory.entityType,
          entityRole: accessory.entityRole,
          entityPriorityWeight: accessory.entityPriorityWeight,
          score: accessory.score,
          finalScore: accessory.finalScore,
          reason: accessory.reason,
        })),
        reason: candidate.reason,
      })),
      secondarySuggestions: commercialSubject.secondarySuggestions.slice(0, 8).map((match) => ({
        inventoryId: match.inventoryId,
        productName: match.productName,
        category: match.category,
        productFamily: match.productFamily,
        model: match.model,
        variation: match.variation,
        color: match.color,
        compatibilityFamily: match.compatibilityFamily,
        quantity: match.quantity,
        price: match.price,
        cost: match.cost,
        marginPct: match.marginPct,
        daysInStock: match.daysInStock,
        status: match.status,
        productType: match.productType,
        entityType: match.entityType,
        entityRole: match.entityRole,
        entityPriorityWeight: match.entityPriorityWeight,
        score: match.score,
        finalScore: match.finalScore,
        reason: match.reason,
      })),
      matches: commercialSubject.matches.slice(0, 8).map((match) => ({
        inventoryId: match.inventoryId,
        productName: match.productName,
        category: match.category,
        productFamily: match.productFamily,
        model: match.model,
        variation: match.variation,
        color: match.color,
        compatibilityFamily: match.compatibilityFamily,
        quantity: match.quantity,
        price: match.price,
        cost: match.cost,
        marginPct: match.marginPct,
        daysInStock: match.daysInStock,
        status: match.status,
        productType: match.productType,
        entityType: match.entityType,
        entityRole: match.entityRole,
        entityPriorityWeight: match.entityPriorityWeight,
        score: match.score,
        finalScore: match.finalScore,
        reason: match.reason,
      })),
    } : undefined,
    contexts,
  }
}

export function summarizeOperationalContext(context: OrionOperationalContext) {
  return {
    intent: context.intent,
    toolsUsed: context.toolsUsed,
    intentRoute: context.intentRoute,
    commercialSubject: context.commercialSubject,
    dataStatus: context.dataStatus,
    matchedRecords: context.matchedRecords,
    summary: context.summary,
    gaps: context.gaps,
    inventory_search_debug: context.inventory_search_debug,
    operationalMemoryContext: context.operationalMemoryContext ? {
      businessPersonalityProfile: context.operationalMemoryContext.businessPersonalityProfile,
      memoryGuardrails: context.operationalMemoryContext.memoryGuardrails,
      relevantOperationalMemories: context.operationalMemoryContext.relevantOperationalMemories.map((item) => ({
        type: item.memory.type,
        scope: item.memory.scope,
        summary: item.memory.summary,
        memoryInfluenceWeight: item.memoryInfluenceWeight,
        conflictWithCurrentData: item.conflictWithCurrentData,
      })),
    } : null,
  }
}
