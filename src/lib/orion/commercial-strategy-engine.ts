import type { OrionSnapshot } from "@/lib/orion/types"
import type { InventoryContextItem } from "./business-query-engine"
import { isActionableLead, publicLeadClassificationLabel } from "@/lib/orion/lead-classification"
import { calculateOperationalHealth, type OperationalHealthScore } from "./operational-health-engine"

export type CommercialUrgency = "low" | "medium" | "high" | "critical"

export type PricingStrategy = {
  currentPrice: number
  minimumSafePrice: number
  aggressivePrice?: number
  suggestedPrice?: number
  reasoning: string
}

export type BundleStrategy = {
  enabled: boolean
  items: string[]
  objective: string
}

export type CampaignStrategy = {
  channel: "whatsapp" | "instagram" | "meta_ads" | "stories" | "site"
  budgetSuggestion?: number
  objective: string
  cta: string
  headline: string
}

export type CommercialStrategy = {
  urgency: CommercialUrgency
  diagnosis: string
  recommendedAction: string
  pricing: PricingStrategy
  bundle: BundleStrategy
  campaign: CampaignStrategy
  risk: string
  expectedImpact: string
  compatibleLeads?: Array<{ name: string; intent: string; classification: string; compatibility: string }>
}

/**
 * Normaliza um texto para ajudar na busca de categorias/liquidez.
 */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/**
 * Estima a liquidez histórica/desejada baseada no modelo.
 * Ex: iPhone 16 gira rápido (high), iPhone 11 ou iPhone 13 comum gira mais devagar (low/medium).
 */
function estimateModelLiquidity(name: string): "high" | "medium" | "low" {
  const norm = normalize(name)
  if (norm.includes("iphone 16") || norm.includes("iphone 15 pro") || norm.includes("macbook m3")) return "high"
  if (norm.includes("iphone 15") || norm.includes("iphone 14 pro") || norm.includes("macbook m2") || norm.includes("ipad pro")) return "medium"
  return "low" // iPhone 13, 12, 11, Apple Watch antigos, etc.
}

function appleFamily(text: string) {
  if (text.includes("iphone")) return "iphone"
  if (text.includes("ipad")) return "ipad"
  if (text.includes("macbook") || text.includes("mac ")) return "mac"
  if (text.includes("watch")) return "watch"
  if (text.includes("airpods")) return "airpods"
  if (text.includes("acessorio") || text.includes("accessory") || text.includes("capa") || text.includes("pelicula")) return "accessory"
  return "unknown"
}

function ticketBand(price: number) {
  if (price >= 7000) return "premium"
  if (price >= 3500) return "mid"
  if (price > 0) return "entry"
  return "unknown"
}

function leadCompatibilityScore(
  lead: OrionSnapshot["marketing"]["forgottenLeads"][number],
  product: InventoryContextItem
) {
  if (!isActionableLead(lead.status) || lead.classification === "lost" || !lead.productInterest) {
    return { score: 0, label: "sem abordagem ativa" }
  }

  const interest = normalize(`${lead.productInterest} ${lead.originalIntent || ""}`)
  const productText = normalize(`${product.name} ${product.category} ${product.productType || ""}`)
  const leadFamily = appleFamily(interest)
  const productFamily = appleFamily(productText)
  let score = 0

  if (leadFamily !== "unknown" && leadFamily === productFamily) score += 45
  else if (interest.includes(normalize(product.category)) || productText.includes(interest)) score += 25

  const productBand = ticketBand(product.suggestedPrice || product.purchasePrice)
  const leadPremium = /\b(pro|max|ultra|premium|novo|lacrado)\b/.test(interest)
  const leadEntry = /\b(usado|barato|entrada|basico|básico|se|11|12|13)\b/.test(interest)
  if (productBand === "premium" && leadPremium) score += 20
  else if (productBand === "entry" && leadEntry) score += 20
  else if (productBand === "mid" && !leadPremium && !leadEntry) score += 10

  const productNameTokens = productText.split(" ").filter((token) => token.length > 2)
  const matchingTokens = productNameTokens.filter((token) => interest.includes(token)).length
  score += Math.min(20, matchingTokens * 4)

  if (lead.classification === "hot") score += 10
  if (lead.classification === "dormant") score += 5

  const label = score >= 70
    ? "alta aderência"
    : score >= 45
      ? "aderência moderada"
      : "baixa aderência"

  return { score, label }
}

export function buildCommercialStrategy(
  product: InventoryContextItem,
  snapshot: OrionSnapshot,
  precomputedHealth?: OperationalHealthScore
): CommercialStrategy {
  const health = precomputedHealth || calculateOperationalHealth(snapshot)
  const daysInStock = product.daysInStock
  const marginPct = product.marginPct
  const nameNorm = normalize(product.name)
  const modelLiquidity = estimateModelLiquidity(product.name)
  const category = normalize(product.category)
  const liquidityForecast = snapshot.executive.liquidityForecast

  // ─── Urgency Calculation (Regra 8 & Rule 4: Pressão de Giro + Pressão Operacional) ───
  let urgency: CommercialUrgency = "low"
  let urgencyReason = ""

  // Fatores de peso
  const healthCritical = health.level === "critical"
  const healthAttention = health.level === "attention"
  const isOldModel = modelLiquidity === "low"
  const highLeads = snapshot.marketing.forgottenLeads.length > 5

  // Regra 4 — Pressure Window Logic
  const pressureSoon = liquidityForecast.pressureWindowStartDays !== null && liquidityForecast.pressureWindowStartDays <= 10
  const pressureCritical = liquidityForecast.pressureWindowStartDays !== null && liquidityForecast.pressureWindowStartDays <= 5
  const overduePressure = liquidityForecast.overduePayables > liquidityForecast.overdueReceivables
  const strongPressure = pressureCritical || overduePressure || healthCritical
  const discountRoom = product.maxSafeDiscount > 0 && marginPct >= 8

  if (daysInStock <= 15) {
    if (strongPressure && discountRoom) {
      urgency = "high"
      urgencyReason = "Produto novo no estoque, mas a pressão de caixa imediata (próximos 5 dias) exige aceleração para garantir liquidez."
    } else if (pressureSoon || healthAttention) {
      urgency = "medium"
      urgencyReason = "O produto é novo. Antecipe exposição comercial, mas preserve margem e use valor percebido antes de desconto."
    } else {
      urgency = "low"
      urgencyReason = "Produto com idade saudável no estoque e operação estável. Proteger margem máxima."
    }
  } else if (daysInStock <= 30) {
    if (strongPressure || (pressureSoon && isOldModel && healthAttention && discountRoom)) {
      urgency = "high"
      urgencyReason = "Operação pressionada ou modelo de baixo giro chegando aos 30 dias. Aumentar urgência operacional."
    } else {
      urgency = "medium"
      urgencyReason = "Passou dos 15 dias. Iniciar otimização comercial para não deixar o capital imobilizado."
    }
  } else {
    // 31+ days ou situações críticas
    const criticalByAge = daysInStock > 45 && (strongPressure || (healthAttention && pressureSoon)) && discountRoom
    urgency = criticalByAge ? "critical" : "high"
    urgencyReason = criticalByAge
      ? "Idade de estoque, margem disponível e pressão operacional justificam conversão imediata com piso seguro."
      : `Produto há ${daysInStock} dias no estoque. Priorize giro, mas preserve piso e use desconto apenas com cliente pronto para fechar.`
  }

  // ─── Regra 1 — Lead Compatibility Engine ───
  const compatibleLeads = snapshot.marketing.forgottenLeads
    .map((lead) => {
      const compatibility = leadCompatibilityScore(lead, product)
      return { lead, compatibility }
    })
    .filter(({ compatibility }) => compatibility.score >= 45)
    .sort((a, b) => b.compatibility.score - a.compatibility.score)
    .map(({ lead, compatibility }) => ({
      name: lead.name,
      intent: lead.productInterest || "Interesse geral",
      classification: publicLeadClassificationLabel(lead.classification),
      compatibility: compatibility.label,
    }))
    .slice(0, 3)

  // ─── Pricing Strategy ───
  const currentPrice = product.suggestedPrice || product.purchasePrice * 1.2 // fallback
  const minimumSafePrice = product.minimumSafePrice || product.purchasePrice * 1.05

  // Agressividade baseada na urgência e margem
  let aggressivePrice = minimumSafePrice
  let pricingReason = ""

  if (urgency === "low") {
    aggressivePrice = currentPrice // Não há preço agressivo, foca no valor atual
    pricingReason = "Proteger margem. Não aplique desconto neste estágio."
  } else if (urgency === "medium") {
    aggressivePrice = currentPrice - (product.maxSafeDiscount * 0.3)
    pricingReason = "Margem protegida. Use até 30% da sua gordura de negociação para fechamento imediato."
  } else if (urgency === "high") {
    aggressivePrice = currentPrice - (product.maxSafeDiscount * 0.7)
    pricingReason = "Aceleração necessária. Liberado consumir até 70% da gordura de desconto para fechar a venda hoje."
  } else {
    // critical
    aggressivePrice = minimumSafePrice
    pricingReason = "Liquidação de capital. Venda pelo piso seguro para converter o estoque físico em caixa líquido imediatamente."
  }

  const pricing: PricingStrategy = {
    currentPrice,
    minimumSafePrice,
    aggressivePrice: Math.round(aggressivePrice),
    suggestedPrice: product.suggestedPrice,
    reasoning: pricingReason
  }

  // ─── Bundle Strategy ───
  let bundleEnabled = false
  let bundleItems: string[] = []
  let bundleObjective = ""

  if (urgency === "low" || urgency === "medium") {
    bundleEnabled = true
    bundleItems = ["Película Premium", "Capa Anti-Impacto"]
    bundleObjective = "Ancorar valor. Ofereça o kit como bônus antes de ceder desconto no preço do aparelho."
  } else if (category.includes("acessorio") || nameNorm.includes("watch") || nameNorm.includes("airpods")) {
    bundleEnabled = true
    bundleItems = ["Desconto em iPhone", "Pulseira extra"]
    bundleObjective = "Cross-sell. Dificilmente sai sozinho sem estar atrelado a um aparelho."
  } else {
    bundleEnabled = false
    bundleObjective = "Foco em corte direto de preço para liquidez, sem adicionar custo de brinde."
  }

  // ─── Campaign Strategy ───
  const campaign: CampaignStrategy = {
    channel: "stories",
    objective: "Geração de demanda orgânica",
    cta: "Chame no direct",
    headline: "Condição Especial Nobretech"
  }

  if (urgency === "critical") {
    campaign.channel = "whatsapp"
    campaign.objective = "Conversão imediata 1 a 1"
    campaign.cta = "Responda 'EU QUERO' para travar essa unidade."
    campaign.headline = "Liberação de Capital - Última Unidade no Piso"
  } else if (urgency === "high") {
    campaign.channel = "instagram"
    campaign.objective = "Escassez para base morna"
    campaign.cta = "Clique no link da bio para garantir."
    campaign.headline = "Oferta Especial - 48h ou até sair a unidade"
    campaign.budgetSuggestion = 30
  } else if (highLeads && urgency === "medium") {
    campaign.channel = "whatsapp"
    campaign.objective = "Resgatar leads quentes esquecidos"
    campaign.cta = "Tenho a condição exata que você pediu. Podemos fechar?"
    campaign.headline = "Condição Exclusiva VIP"
  } else if (modelLiquidity === "high" || urgency === "low") {
    campaign.channel = "meta_ads"
    campaign.objective = "Atrair topo de funil com produto objeto de desejo"
    campaign.cta = "Fale com um consultor Apple"
    campaign.headline = "O iPhone dos seus sonhos com a segurança Nobretech"
    campaign.budgetSuggestion = 50
  }

  // ─── General Diagnosis & Risk ───
  const diagnosis = urgencyReason

  const actionMap: Record<CommercialUrgency, string> = {
    low: "Agregue valor com bundle. Mantenha o preço atual e não ceda desconto.",
    medium: "Inicie teste de oferta no WhatsApp para leads antigos. Negocie apenas se houver objeção de preço.",
    high: "Rode uma campanha de 48h no Instagram focada em escassez. Use a margem autorizada para fechamento na mesa.",
    critical: "Descarte tentativa de margem máxima. Crie uma lista de transmissão VIP no WhatsApp ofertando pelo piso seguro para converter ainda hoje."
  }

  const riskMap: Record<CommercialUrgency, string> = {
    low: "Baixo. Vender agora com desconto destrói rentabilidade futura sem necessidade.",
    medium: "Controlado. A demora em testar oferta pode empurrar o item para a faixa de encalhe.",
    high: "Atenção. O capital está começando a pesar no fluxo operacional.",
    critical: "Crítico. A retenção desse item está estrangulando o capital de giro da operação."
  }

  return {
    urgency,
    diagnosis,
    recommendedAction: actionMap[urgency],
    pricing,
    bundle: { enabled: bundleEnabled, items: bundleItems, objective: bundleObjective },
    campaign,
    risk: riskMap[urgency],
    expectedImpact: urgency === "low" || urgency === "medium" ? "Proteção de margem e ganho de branding" : "Injeção de capital e alívio do fluxo de caixa",
    compatibleLeads
  }
}
