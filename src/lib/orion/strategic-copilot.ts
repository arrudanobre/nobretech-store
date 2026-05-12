import "server-only"

import { isExecutionReasoningMode } from "./reasoning-mode-selector"
import { isExecutionModeOperational, summarizeOperationalConversationState } from "./operational-conversation-state"
import { ORION_C_LEVEL_SYSTEM_INSTRUCTIONS } from "./executive-response-layer"
import { buildFinancialDecisionResponse, buildFinancialTraceabilityResponse, formatFinancialDecisionResponse } from "./financial-decision-response"
import type { OrionExecutionPayload, OrionOperationalConversationState, OrionSnapshot } from "./types"

const ORION_STRATEGIC_MODEL = process.env.ORION_STRATEGIC_OPENAI_MODEL
  || process.env.ORION_OPENAI_MODEL
  || process.env.OPENAI_MODEL
  || "gpt-5-mini"

const STRATEGIC_COPILOT_FALLBACK = "Não consegui pensar estrategicamente com segurança agora. Eu usaria o Execution Board como base e evitaria campanha, desconto ou compra nova sem uma leitura validada dos dados."

const strategicIntentTerms = [
  "o que voce faria",
  "o que você faria",
  "o que faco",
  "o que faço",
  "qual estrategia",
  "qual estratégia",
  "estrategia",
  "estratégia",
  "vale a pena",
  "devo",
  "como gerar lucro",
  "como bater meta",
  "proteger margem",
  "comprar estoque agora",
  "repor estoque agora",
  "me pagar",
  "tirar lucro",
  "se fosse o dono",
  "se fosse sua operacao",
  "se fosse sua operação",
  "me ajude a pensar",
  "qual caminho",
  "melhor caminho",
  "seguimos",
  "vamos nessa",
  "monta",
  "estrutura",
  "cria",
  "me da o texto",
  "me dá o texto",
]

const conditionalStrategicTerms = [
  "venda",
  "vender",
  "lucro",
  "campanha",
  "promocao",
  "promoção",
  "margem",
  "giro",
  "estoque",
  "marketing",
  "combo",
  "whatsapp",
  "stories",
  "trafego",
  "tráfego",
  "ads",
]

const strategicQualifiers = [
  "como",
  "devo",
  "vale",
  "melhor",
  "qual",
  "estrategia",
  "estratégia",
  "faria",
  "faco",
  "faço",
  "dono",
  "pensar",
  "decidir",
  "caminho",
  "proteger",
  "queimar",
  "desconto",
  "bater",
  "gerar",
  "tirar",
  "me pagar",
  "comprar",
  "repor",
]

const systemPrompt = `
Você é a Strategic Copilot Layer da ORION, atuando como diretor comercial e financeiro da Nobretech Store.

${ORION_C_LEVEL_SYSTEM_INSTRUCTIONS}

Você NÃO é um dashboard.
Você NÃO é um resumo de cards.
Você NÃO deve repetir o Execution Board.
Você não é um relatório. Você é um parceiro operacional experiente pensando junto com o dono da empresa.

Sua missão é pensar estrategicamente com o dono da loja, como alguém que já vendeu, negociou, perdeu lead por demora, segurou margem quando bate ansiedade e sabe quando tráfego vira desperdício.
Você deve parecer um operador experiente pensando em tempo real, não uma IA montando uma resposta perfeita.
Não escreva como relatório. Não pareça um template. Não use títulos entre colchetes.

Você receberá dados calculados pelo sistema:
- caixa
- estimativa operacional de lucro
- capital protegido
- contas previstas
- recebíveis
- estoque ativo
- produtos
- preço
- lucro
- margem
- bundles
- campanha
- cenários
- timeline
- riscos

Regras absolutas:
1. Use somente os dados fornecidos.
2. Não invente produto, preço, margem, lucro, estoque, saldo, CAC, CPL, orçamento ou quantidade.
3. Não recalcule números financeiros.
4. Não contradiga os fatos calculados, mas pode discordar da escolha operacional sugerida quando fizer sentido.
5. Não diga que existe conta negativa se os dados não mostrarem isso.
6. Não trate saldo bruto como lucro livre.
6b. Quando existir financialOperationalContext, use essa leitura como tradução financeira primária; não recalcule financeiro e não transforme estimativa operacional em lucro real.
6c. Quando existir realProfitSnapshot, use-o como fonte de lucro real, capital protegido, retirada e reinvestimento; não calcule margem no Strategic Copilot.
6d. Quando existir workingCapitalSnapshot, use-o como fonte principal para capital operacional protegido, sobra após contas, retirada segura e reinvestimento seguro. Não use capital histórico como capital protegido atual.
6d.1. Quando o usuário pedir listagem, detalhe, estratificação, extração, abertura ou composição de retiradas, aportes, devoluções de aporte, caixa ou movimentos do dono, use os movimentos detalhados de profitAvailabilitySnapshot; quando a lista existir, responda primeiro com lista/tabela curta antes de qualquer análise.
6e. Quando existir operationalMemory, use apenas como contexto comportamental ponderado. Memória não vence dados atuais, ledger, lucro real, estoque ou mission context.
6f. Quando existir executionGuardrails, obedeça como contrato de permissão. Nenhum módulo downstream pode ampliar permissões; só manter ou reduzir.
6g. Se executionGuardrails bloquear campanha, tráfego, copy ou mix, não gere campanha, não sugira produto, não monte headline, não entregue CTA comercial e não continue missão ativa.
7. Não recomende produto vendido, perdido, cancelado ou fora do estoque operacional.
8. Não ofereça iPhone para lead interessado apenas em iPad, salvo se os dados mostrarem compatibilidade.
9. Não resuma os cards.
10. Gere raciocínio novo em cima dos dados.
11. Não repita saldo, margem, lucro, CPL, CAC, verba, preço ou valores de pacote se eles não forem essenciais para defender a decisão.
12. Se citar número, cite no máximo 2 números na resposta inteira.
13. Não use os nomes dos cenários internos. Traduza para linguagem natural: caminho equilibrado, abordagem conservadora, acelerar caixa, proteger margem.
14. Respeite decisões já tomadas em operationalConversationState. Se o dono escolheu um caminho, continue a execução desse caminho, salvo risco operacional claro.
15. Se o usuário pedir execução e executionGuardrails permitir execução comercial, não volte para diagnóstico. Entregue peça prática.
16. Se o usuário disser "esse produto", "esse iPad" ou "esse combo", resolva pelo foco ativo da missão.
17. Diferencie testar tráfego, escalar tráfego e pausar tráfego somente quando executionGuardrails permitir tráfego ou campanha.
18. Não use frases genéricas como "proteja margem", "priorize WhatsApp" ou "use bundle" sem acompanhar com oferta, texto, canal, regra e próxima ação concreta.
19. A pergunta atual sempre vence o mission context. Leia intentRoute antes de usar activeMissionContext.
20. Se intentRoute.missionContextPolicy for "ignore", ignore activeMissionContext e responda a pergunta global/financeira/operacional atual.
21. Se intentRoute.intent for financial_analysis, financial_traceability ou global_business_question, não continue campanha, não assuma decisão anterior e não diga "vamos seguir o caminho escolhido".
22. Se intentRoute.intent for product_switch, use commercialSubject para reconstruir o produto da missão e não herde oferta do produto anterior.
23. Se activeMissionContext existir e intentRoute permitir uso da missão, ele é contexto auxiliar da missão ativa. Responda somente ao refinamento pedido.
24. Se operationalMemory.memoryGuardrails.avoidAutomaticCampaignCta for true, não encerre com campanha, tráfego, CTA de mídia ou "se quiser eu monto".
25. Não exponha termos internos vindos de memória, como memoryInfluenceWeight, engine, snapshot, payload, enum ou safe withdrawal.

Comportamento esperado:
- Escolha um caminho.
- Explique o motivo.
- Traga contraponto.
- Diga o que evitar.
- Mostre risco.
- Seja direto, mas profundo.
- Fale como operador experiente, não como consultor genérico.
- Não use emojis.
- Não use termos técnicos internos como payload, engine, score, enum ou snapshot.
- Reduza tom corporativo e motivacional. Prefira leitura executiva direta, sem coach, sem promessa e sem CTA automático.
- Prefira frases naturais e opinião operacional. A resposta pode ter organização, mas precisa soar como conversa estratégica.
- Traga tese operacional: qual é o problema real, qual caminho importa agora, o que evitar e onde está o risco humano da execução.
- Pode dizer que tráfego não vale hoje, que é melhor proteger margem, que depender de produto premium é arriscado, ou que o plano está matematicamente correto mas operacionalmente ruim.
- Fale sobre comportamento do negócio: ansiedade por desconto, atendimento lento, lead frio, dependência de venda premium, excesso de tráfego sem capacidade de fechar, estoque parado e risco de virar refém de promoção.
- A resposta deve ser cerca de 30% mais curta que um relatório executivo normal. Sem listas longas, sem copiar tabela, sem justificar tudo com números.
- Evite expressões como "cenário balanced", "SLA", "CPL teto", "CAC máximo", "liquidez operacional" quando puder falar de forma natural.
- O board já mostra os números. Você usa os números para pensar, não para recitar.
- Levante hipóteses com cuidado: "talvez o gargalo seja resposta", "tenho a impressão de que o desconto está entrando cedo", "isso pode virar guerra de preço".
- Sugira testes simples de operação: uma abordagem de WhatsApp, uma variação de oferta, uma janela curta de campanha, uma prova de interesse antes de aumentar investimento.
- Separe o que importa do que é ruído. Diga claramente qual decisão realmente move o negócio agora.
- Quando operationalConversationState.currentExecutionMode for marketing_execution e executionGuardrails permitir, entregue a campanha completa com: Campanha, Oferta, Headline, Criativo, Stories, WhatsApp, Tráfego, Objetivo, Risco e Validação.
- Para marketing_execution, não escreva só reflexão estratégica. A resposta precisa sair pronta para copiar, publicar e testar.
- Se faltar apenas uma informação crítica, faça uma única pergunta objetiva. Se o contexto já indicar produto, canal ou oferta, não pergunte.

Formato de resposta:
- Responda em português.
- A resposta pode se organizar em blocos curtos, mas deve soar natural, como uma conversa estratégica. Use títulos apenas quando ajudarem a leitura.
- Não faça listas longas. Prefira 1 parágrafo curto por bloco.
- Se usar títulos, prefira títulos simples como "Minha leitura", "Eu faria", "Eu evitaria", "O risco", "Decisão agora", sem colchetes.
- Não precisa usar todos os títulos se a resposta ficar mais humana sem eles, mas responda claramente: o que importa agora, qual caminho tem mais chance, o que evitar, qual risco e qual decisão o dono precisa tomar.
`.trim()

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const direct = (payload as { output_text?: unknown }).output_text
  if (typeof direct === "string") return direct

  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) return ""

  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue
      const text = (contentItem as { text?: unknown }).text
      if (typeof text === "string") parts.push(text)
    }
  }
  return parts.join("\n")
}

function naturalScenarioLabel(mode: OrionExecutionPayload["objective"]["recommendedScenario"]) {
  if (mode === "conservative") return "abordagem conservadora"
  if (mode === "aggressive") return "acelerar caixa"
  return "caminho equilibrado"
}

function cashPosture(goal: OrionExecutionPayload["objective"]["financialGoal"]) {
  if (goal.urgencyLevel === "urgent") return "há pressão de caixa; girar com controle importa mais do que buscar a venda perfeita"
  if (goal.requiredNewProfit > 0) return "atenção no caixa; dá para agir sem tratar isso como desespero"
  return "sem crise de caixa aparente, mas capital de reposição deve ser protegido"
}

function marginPosture(goal: OrionExecutionPayload["objective"]["financialGoal"]) {
  if (goal.urgencyLevel === "urgent") return "aceitar alguma velocidade pode fazer sentido, sem romper piso seguro"
  return "não há necessidade clara de desconto agressivo agora"
}

function pressureRead(level: OrionExecutionPayload["objective"]["financialGoal"]["urgencyLevel"]) {
  if (level === "urgent") return "existe pressão real para girar com mais velocidade"
  if (level === "attention") return "existe atenção financeira, mas isso não autoriza desconto ansioso"
  return "não parece haver crise; o perigo maior pode ser agir com ansiedade"
}

function likelyBottleneck(snapshot: OrionSnapshot) {
  if (snapshot.executive.leadsWithoutFollowUp > 0) return "velocidade e disciplina de resposta antes de buscar mais tráfego"
  if (snapshot.executive.stuckStockCount > 0) return "destravar estoque sem cair cedo demais em desconto"
  if (snapshot.executive.conversionRate30d <= 0) return "validar intenção real de compra antes de aumentar investimento"
  return "manter margem e escolher bem a primeira oferta do dia"
}

function productDependenceRead(execution: OrionExecutionPayload) {
  const premium = execution.products.find((product) => product.role === "premium")
  const anchor = execution.products.find((product) => product.role === "anchor")
  if (premium && anchor && premium.id !== anchor.id) {
    return `há risco de depender do premium ${premium.name}; ${anchor.name} parece uma conversa mais controlável`
  }
  if (premium) return `o produto premium ${premium.name} pode ajudar, mas não deve virar aposta emocional única`
  return "não há produto premium claro para sustentar uma aposta única"
}

function trafficRead(execution: OrionExecutionPayload, snapshot: OrionSnapshot) {
  if (!execution.trafficPlan) return "não há plano de tráfego pronto; comece pela base e por conversa direta"
  if (snapshot.executive.leadsWithoutFollowUp > 0) return "eu testaria WhatsApp e recuperação de conversa antes de colocar mais dinheiro em anúncio"
  return "tráfego só vale se aparecer conversa real; sem intenção de compra, vira custo e ansiedade"
}

function executionRiskPosture(snapshot: OrionSnapshot, execution: OrionExecutionPayload) {
  if (snapshot.executive.leadsWithoutFollowUp > 0) return "o risco é abrir frente nova sem atender bem conversas que já existem"
  if (execution.trafficPlan && execution.whatsappPlan) return "o risco é gerar conversa e não ter velocidade comercial para converter"
  if (snapshot.executive.stuckStockCount > 0) return "o risco é deixar estoque parado virar argumento para desconto cedo demais"
  return "o risco é executar devagar uma estratégia que depende de timing"
}

function conciseStrategicContext(
  snapshot: OrionSnapshot,
  execution: OrionExecutionPayload,
  conversationState?: OrionOperationalConversationState | null
) {
  const financialGoal = execution.objective.financialGoal
  const priority = execution.priorityAction
  const operationalMemory = conversationState?.operationalMemoryContext || null
  const hasUserSubject = Boolean(
    conversationState?.commercialSubject
    && conversationState.commercialSubject.subjectType !== "unknown"
    && conversationState.commercialSubject.confidence >= 0.45
  )
  const executionAllowedByReasoning = conversationState?.activeReasoningMode
    ? isExecutionReasoningMode(conversationState.activeReasoningMode)
    : conversationState?.currentExecutionMode === "marketing_execution" || conversationState?.executionMode === "marketing_execution"
  const executionGuardrails = conversationState?.executionGuardrails || null
  const executionAllowedByGuardrails = Boolean(
    executionGuardrails?.allowCampaignGeneration
    || executionGuardrails?.allowCopyGeneration
    || executionGuardrails?.allowTrafficRecommendation
  )
  const routeIgnoresMission = conversationState?.intentRoute?.missionContextPolicy === "ignore"
  const naturalSystemDirection = naturalScenarioLabel(execution.objective.recommendedScenario)
  return {
    companyName: snapshot.companyName,
    userVisibleNumbersNote: "Os números abaixo existem para aterramento. Não recite números que já estão visíveis no board, salvo se forem decisivos.",
    operationalConversationState: summarizeOperationalConversationState(conversationState),
    intentRoute: conversationState?.intentRoute || null,
    commercialSubject: conversationState?.commercialSubject || null,
    activeMissionContext: conversationState?.activeMissionContext || null,
    operationalGoal: conversationState?.activeGoal || null,
    reasoningMode: conversationState?.activeReasoningMode || null,
    operationalPlanSummary: conversationState?.activeOperationalPlanSummary || null,
    operationalMemory: operationalMemory ? {
      businessPersonalityProfile: operationalMemory.businessPersonalityProfile,
      memoryGuardrails: operationalMemory.memoryGuardrails,
      relevantOperationalMemories: operationalMemory.relevantOperationalMemories.map((item) => ({
        type: item.memory.type,
        scope: item.memory.scope,
        summary: item.memory.summary,
        memoryInfluenceWeight: item.memoryInfluenceWeight,
        influenceLevel: item.influenceLevel,
        conflictWithCurrentData: item.conflictWithCurrentData,
      })),
    } : null,
    persistentOperationalMemory: snapshot.orionMemory ? {
      recentDecisions: snapshot.orionMemory.recentDecisions.slice(0, 3).map((item) => ({
        title: item.title,
        summary: item.summary,
        importance: item.importance,
      })),
      openAlerts: snapshot.orionMemory.openAlerts.slice(0, 3).map((item) => ({
        title: item.title,
        summary: item.summary,
        importance: item.importance,
      })),
      recommendedActions: snapshot.orionMemory.recommendedActions.slice(0, 3).map((item) => ({
        title: item.title,
        summary: item.summary,
        importance: item.importance,
      })),
    } : null,
    proactiveAlerts: (snapshot.orionProactiveAlerts || []).map((alert) => ({
      category: alert.category,
      priority: alert.priority,
      title: alert.title,
      message: alert.message,
      recommendedAction: alert.recommendedAction,
      evidence: alert.evidence,
    })),
    executionGuardrails,
    executionContract: executionAllowedByReasoning && executionAllowedByGuardrails
      ? {
          requiredFormat: ["Campanha", "Oferta", "Headline", "Criativo", "Stories", "WhatsApp", "Tráfego", "Objetivo", "Risco", "Validação"],
          rule: "Continuar a missão ativa e entregar execução de marketing pronta, sem reiniciar o raciocínio.",
        }
      : null,
    postureSummary: {
      cashPosture: cashPosture(financialGoal),
      marginPosture: marginPosture(financialGoal),
      trafficPosture: trafficRead(execution, snapshot),
      productDependencePosture: productDependenceRead(execution),
      executionRiskPosture: executionRiskPosture(snapshot, execution),
      discountRiskPosture: "não transformar insegurança em desconto antes de testar intenção de compra",
    },
    feltOperation: {
      pressureRead: pressureRead(financialGoal.urgencyLevel),
      likelyBottleneck: likelyBottleneck(snapshot),
      productDependence: productDependenceRead(execution),
      trafficInstinct: trafficRead(execution, snapshot),
      discountRisk: "não transformar pressa em desconto antes de validar intenção de compra",
      humanRisk: snapshot.executive.leadsWithoutFollowUp > 0
        ? "lead parado costuma esfriar mais por demora do que por preço"
        : "o risco humano é escolher uma ação bonita no papel e executar devagar",
      systemDirectionInPlainLanguage: naturalSystemDirection,
      permissionToDisagree: "Pode dizer que o caminho sugerido parece correto na matemática, mas ruim na operação, se essa for a melhor leitura.",
    },
    financialGuardrails: {
      cashPressure: financialGoal.urgencyLevel,
      nextDue: financialGoal.nextDueLabel,
      targetProfit: execution.objective.targetProfit,
      gapToGoal: execution.objective.gap,
      operationalFinancialContext: snapshot.finance.financialOperationalContext,
      realProfitSnapshot: snapshot.finance.realProfitSnapshot,
      workingCapitalSnapshot: snapshot.finance.workingCapitalSnapshot,
      selectedFinancialPeriod: snapshot.finance.selectedFinancialPeriod,
      profitAvailabilitySnapshot: snapshot.finance.profitAvailabilitySnapshot,
      currentCashCompositionSnapshot: snapshot.finance.currentCashCompositionSnapshot,
    },
    commercialReality: {
      systemDirection: naturalSystemDirection,
      priorityProduct: !hasUserSubject && !routeIgnoresMission && priority?.product
        ? {
            name: priority.product.name,
            role: priority.product.role,
            conversionSpeed: priority.product.conversionSpeed,
            daysInStock: priority.product.daysInStock,
            reason: priority.product.reason,
            systemRisk: priority.risk,
          }
        : null,
      productRoles: routeIgnoresMission ? [] : execution.products.map((product) => ({
        name: product.name,
        role: product.role,
        conversionSpeed: product.conversionSpeed,
        daysInStock: product.daysInStock,
        quantity: product.quantity,
        reason: product.reason,
      })),
      activeInventoryNames: routeIgnoresMission ? [] : execution.inventory.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        status: item.status,
        daysInStock: item.daysInStock,
      })),
    },
    demandAndExecutionSignals: {
      leadsOpen: snapshot.executive.leadsOpen,
      leadsWithoutFollowUp: snapshot.executive.leadsWithoutFollowUp,
      conversionRate30d: snapshot.executive.conversionRate30d,
      stuckStockCount: snapshot.executive.stuckStockCount,
      averageActiveDays: snapshot.stock.averageActiveDays,
      topDemandSignals: snapshot.sales.topProducts.slice(0, 3).map((product) => product.label),
      actionableLeadSignals: snapshot.marketing.forgottenLeads.slice(0, 5).map((lead) => ({
        name: lead.name,
        classification: lead.classification,
        status: lead.status,
        productInterest: lead.productInterest,
        originalIntent: lead.originalIntent,
        daysWithoutAction: lead.daysWithoutAction,
      })),
    },
    offerAndChannelOptions: {
      bundles: routeIgnoresMission ? [] : execution.bundles.map((bundle) => ({
        name: bundle.name,
        posture: naturalScenarioLabel(bundle.promotionMode),
        objective: bundle.objective,
        items: bundle.items,
        minimumSafePrice: bundle.minimumSafePrice,
        promotionNote: bundle.promotionNote,
      })),
      trafficPlan: routeIgnoresMission ? null : execution.trafficPlan,
      whatsappPlan: routeIgnoresMission ? null : execution.whatsappPlan,
      scenarios: routeIgnoresMission ? [] : execution.scenarios.map((scenario) => ({
        title: scenario.title,
        posture: naturalScenarioLabel(scenario.mode),
        speed: scenario.speed,
        risk: scenario.risk,
        channel: scenario.channel,
        operationalEffort: scenario.operationalEffort,
        bundleName: scenario.bundleName,
      })),
      next72h: routeIgnoresMission ? [] : execution.timeline72h.map((item) => ({
        window: item.window,
        action: item.action,
        expectedTarget: item.expectedTarget,
      })),
    },
  }
}

function sanitizeAnswer(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, (char) => (char === "\n" ? "\n" : " "))
    .replace(/^\s*\[(?:Leitura estratégica|Minha leitura)\s*:?\]\s*$/gim, "Minha leitura:")
    .replace(/^\s*\[(?:Melhor caminho|Eu faria)\s*:?\]\s*$/gim, "Eu faria:")
    .replace(/^\s*\[(?:O que eu evitaria|Eu evitaria)\s*:?\]\s*$/gim, "Eu evitaria:")
    .replace(/^\s*\[(?:Risco principal|O risco)\s*:?\]\s*$/gim, "O risco:")
    .replace(/^\s*\[(?:Próxima decisão|Decisão agora)\s*:?\]\s*$/gim, "Decisão agora:")
    .replace(/\[(Leitura estratégica|Minha leitura|Melhor caminho|Eu faria|O que eu evitaria|Eu evitaria|Risco principal|O risco|Próxima decisão|Decisão agora)\s*:?\]/gi, "$1:")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function supportsTemperature(model: string) {
  const normalized = model.toLowerCase().trim()
  return !normalized.startsWith("gpt-5") && !normalized.startsWith("o")
}

export function isStrategicCopilotQuestion(question?: string | null) {
  if (!question) return false
  const normalized = normalizeText(question)
  if (strategicIntentTerms.some((term) => normalized.includes(normalizeText(term)))) return true
  const hasConditionalTerm = conditionalStrategicTerms.some((term) => normalized.includes(normalizeText(term)))
  const hasStrategicQualifier = strategicQualifiers.some((term) => normalized.includes(normalizeText(term)))
  return hasConditionalTerm && hasStrategicQualifier
}

export function fallbackStrategicCopilotAnswer() {
  return STRATEGIC_COPILOT_FALLBACK
}

function brl(value: number | null | undefined) {
  if (!value) return null
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value)
}

function trafficLine(execution: OrionExecutionPayload) {
  const plan = execution.trafficPlan
  if (!plan) return "Tráfego:\n- orçamento: começar sem mídia paga; primeiro validar WhatsApp e Stories\n- duração: janela curta de validação\n- pausa: parar se não abrir conversa qualificada\n- escala: só aumentar quando houver conversa real e resposta rápida"
  return [
    "Tráfego:",
    `- orçamento: ${brl(plan.budgetDaily) || "usar o orçamento diário já definido no plano"} por dia`,
    `- duração: ${plan.durationDays} dias`,
    `- pausa: ${plan.pauseIf}`,
    `- escala: ${plan.scaleIf}`,
  ].join("\n")
}

function campaignName(state: OrionOperationalConversationState | null | undefined, execution: OrionExecutionPayload) {
  const subjectProduct = state?.commercialSubject?.subjectType === "category"
    ? state.commercialSubject.category
    : state?.commercialSubject?.primarySubject?.productName || state?.commercialSubject?.productFamily || state?.commercialSubject?.model
  const hasUserSubject = Boolean(subjectProduct && state?.commercialSubject && state.commercialSubject.subjectType !== "unknown" && state.commercialSubject.confidence >= 0.45)
  const product = state?.activeMissionContext?.product?.name || state?.activeProduct || state?.currentProduct || state?.focusProduct || subjectProduct || (!hasUserSubject ? execution.priorityAction?.product?.name || execution.products[0]?.name : null) || "produto informado"
  const path = state?.chosenOperationalPath || state?.selectedScenario
  if (path === "balanced") return `Execução equilibrada - ${product}`
  if (path === "conservative") return `Margem preservada - ${product}`
  if (path === "aggressive") return `Giro rápido - ${product}`
  return `Campanha operacional - ${product}`
}

function selectedBundle(state: OrionOperationalConversationState | null | undefined, execution: OrionExecutionPayload) {
  const missionBundleName = state?.activeMissionContext?.offer?.bundleName
  if (missionBundleName) {
    const missionBundle = execution.bundles.find((bundle) => bundle.name === missionBundleName)
    if (missionBundle) return missionBundle
  }
  const path = state?.chosenOperationalPath || state?.selectedScenario
  const product = state?.activeMissionContext?.product?.name || state?.activeProduct || state?.currentProduct || state?.focusProduct
  const hasUserSubject = Boolean(
    state?.commercialSubject
    && state.commercialSubject.subjectType !== "unknown"
    && state.commercialSubject.confidence >= 0.45
  )
  if (hasUserSubject && !product) return null
  const normalizedProduct = product ? product.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""
  const bundle = execution.bundles.find((item) => {
    if (item.promotionMode !== path) return false
    if (!normalizedProduct) return true
    return item.items.some((bundleItem) => {
      const normalizedItem = bundleItem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      return normalizedItem.includes(normalizedProduct) || normalizedProduct.includes(normalizedItem)
    })
  })
  return bundle || null
}

function minimumPriceLine(bundle: ReturnType<typeof selectedBundle>, fallbackPrice: number | undefined, state?: OrionOperationalConversationState | null) {
  const mission = state?.activeMissionContext
  const minimum = brl(mission?.constraints.avoidDiscountBelow || mission?.offer?.minimumSafePrice || bundle?.minimumSafePrice)
  const offer = brl(mission?.offer?.currentOfferPrice || bundle?.price || fallbackPrice)
  const limit = brl(mission?.offer?.discountLimit)
  if (minimum && offer) return `Eu não desceria abaixo de ${minimum} nesse pacote. A oferta cheia pode seguir em ${offer}; se precisar destravar, negocie bônus ou parcelamento antes de cortar preço.`
  if (minimum && limit) return `Eu usaria ${minimum} como piso operacional. O espaço de negociação calculado para essa oferta é de até ${limit}, sem romper a margem protegida.`
  if (minimum) return `Eu usaria ${minimum} como piso operacional. Abaixo disso você começa a trocar margem por ansiedade.`
  return "Eu não tenho piso seguro calculado para esse pacote agora; então não invento menor valor. Trabalhe primeiro com bônus e condição, não com desconto."
}

function incrementalAnswer(input: {
  question: string
  execution: OrionExecutionPayload
  state: OrionOperationalConversationState | null
  product: string
  offer: string
  bundle: ReturnType<typeof selectedBundle>
  cta: string
  whatsapp: string
}) {
  const intent = input.state?.operationalIntent
  const text = input.question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const asksAddOn = /posso adicionar|adicionar algo|ofertar alguma coisa|algo a mais|bonus|brinde|atrativo/.test(text)

  if (intent === "pricing_refinement") {
    const parts = [
      `Sim, isso é refinamento da oferta atual do ${input.product}, não uma campanha nova.`,
      "",
      "Preço:",
      minimumPriceLine(input.bundle, input.execution.priorityAction?.price, input.state),
    ]
    if (asksAddOn) {
      parts.push(
        "",
        "Algo a mais:",
        "Adicione bônus de percepção, não desconto cedo: película, capa, caneta compatível, configuração inicial ou prioridade na reserva. O bônus precisa parecer cuidado premium, não liquidação."
      )
    }
    parts.push(
      "",
      "Regra prática:",
      "Primeiro venda o combo e a conveniência. Só fale em desconto se o cliente já mostrou intenção real e a objeção for fechamento, não curiosidade.",
      "",
      "Mensagem curta:",
      `Consigo montar esse ${input.product} com um pacote mais completo e uma condição segura. Se você quiser, eu te mando a opção enxuta e a opção mais completa para decidir sem enrolar.`
    )
    return parts.join("\n")
  }

  if (intent === "offer_refinement") {
    return [
      `Sim. Eu adicionaria valor percebido ao ${input.product}, não desconto como primeira arma.`,
      "",
      "Bônus bom:",
      "- acessório compatível com uso real",
      "- configuração inicial",
      "- prioridade na reserva",
      "- orientação rápida de transferência/uso",
      "",
      "Como posicionar:",
      `Não venda como “brinde”. Venda como pacote pronto: ${input.offer}. A percepção precisa ser de compra mais segura e completa.`,
      "",
      "Risco:",
      "Se você colocar coisa demais, vira liquidação e enfraquece o produto. Um ou dois agregados bem escolhidos valem mais que uma cesta cheia sem sentido.",
    ].join("\n")
  }

  if (intent === "traffic_optimization") {
    return [
      "Aqui eu não recriaria a campanha. Eu ajustaria o teste.",
      "",
      trafficLine(input.execution),
      "",
      "Remarketing:",
      `Reimpacte quem respondeu Stories, clicou no WhatsApp ou perguntou condição do ${input.product}. A mensagem deve voltar para o combo e para a reserva, não para uma promessa nova.`,
      "",
      "Pausa:",
      "Se gerar clique sem conversa, pausa. Se gerar conversa sem avanço, troca copy ou WhatsApp antes de subir verba.",
    ].join("\n")
  }

  if (intent === "marketing_refinement" || intent === "campaign_iteration") {
    return [
      "Eu refinaria só o gancho, mantendo a oferta ativa.",
      "",
      "Novo gancho:",
      `${input.product} com pacote pronto para comprar sem improviso.`,
      "",
      "Copy alternativa:",
      `Esse ${input.product} já sai com uma condição pensada para quem quer resolver a compra com segurança: produto certo, pacote útil e atendimento direto no WhatsApp.`,
      "",
      "Versão premium:",
      `Não é só comprar o ${input.product}. É sair com a escolha pronta, bem montada e com suporte para decidir sem pressão.`,
      "",
      "CTA:",
      input.cta,
    ].join("\n")
  }

  if (intent === "objection_handling") {
    return [
      `Resposta para objeção no ${input.product}:`,
      "",
      "Eu entendo querer o menor valor. O que eu montei aqui não é só preço seco; é o aparelho com uma condição mais completa para você não comprar no escuro. Se quiser, eu te mando a versão mais enxuta e a versão com o pacote completo, aí você escolhe com segurança.",
      "",
      "Regra:",
      "Não responda objeção já dando desconto. Primeiro compare valor percebido. Depois, se houver intenção real, ajuste condição.",
    ].join("\n")
  }

  if (intent === "closing_execution") {
    return [
      `Para vender mais rápido o ${input.product}, reduza fricção.`,
      "",
      "Ajuste agora:",
      "- CTA com uma ação só",
      "- duas opções no máximo: enxuta ou completa",
      "- prazo curto de reserva",
      "- WhatsApp com pergunta fechada",
      "",
      "Mensagem:",
      `${input.whatsapp} Posso te mandar a opção enxuta e a completa agora?`,
    ].join("\n")
  }

  return null
}

export function buildOperationalExecutionAnswer(input: {
  question: string
  snapshot: OrionSnapshot
  execution: OrionExecutionPayload
  conversationState?: OrionOperationalConversationState | null
}) {
  const state = input.conversationState || null
  const guardrails = state?.executionGuardrails || null
  if (guardrails && !guardrails.allowCampaignGeneration && !guardrails.allowCopyGeneration && !guardrails.allowTrafficRecommendation) {
    const finance = input.snapshot.finance.financialOperationalContext
    const traceabilityAnswer = buildFinancialTraceabilityResponse(finance, input.question)
    if (traceabilityAnswer) return traceabilityAnswer
    const workingCapital = input.snapshot.finance.workingCapitalSnapshot
    return formatFinancialDecisionResponse(buildFinancialDecisionResponse({
      reasoningMode: state?.activeReasoningMode,
      goal: state?.activeGoal,
      userQuestion: input.question,
      financialContext: finance,
      financialSafetyAudit: workingCapital.financialSafetyAudit,
    }))
  }
  const mission = state?.activeMissionContext
  if (state?.commercialSubject?.needsClarification || (state?.commercialSubject?.subjectType === "multi_inventory_match" && state.commercialSubject.relatedProducts.length > 1 && !state.commercialSubject.primarySubject)) {
    const clarificationMatches = [
      ...(state.commercialSubject.primarySubject ? [state.commercialSubject.primarySubject] : []),
      ...state.commercialSubject.relatedProducts,
    ]
    const names = (clarificationMatches.length ? clarificationMatches : state.commercialSubject.matches)
      .slice(0, 4)
      .map((match) => match.variation || match.productName)
      .filter(Boolean)
    return `Encontrei mais de uma unidade: ${names.join(" e ")}. Quer campanha conjunta ou separada?`
  }
  const subjectProduct = state?.commercialSubject?.subjectType === "category"
    ? state.commercialSubject.category
    : state?.commercialSubject?.primarySubject?.productName || state?.commercialSubject?.productFamily || state?.commercialSubject?.model
  const hasUserSubject = Boolean(subjectProduct && state?.commercialSubject && state.commercialSubject.subjectType !== "unknown" && state.commercialSubject.confidence >= 0.45)
  const product = mission?.product?.name || state?.activeProduct || state?.currentProduct || state?.focusProduct || subjectProduct || (!hasUserSubject ? input.execution.priorityAction?.product?.name || input.execution.products[0]?.name : null) || "produto informado"
  const bundle = selectedBundle(state, input.execution)
  const offerItems = mission?.offer?.items?.length ? mission.offer.items.join(" + ") : bundle?.items?.length ? bundle.items.join(" + ") : product
  const offerPrice = brl(mission?.offer?.currentOfferPrice || bundle?.price || (!hasUserSubject ? input.execution.priorityAction?.price : null))
  const offer = offerPrice ? `${offerItems} por ${offerPrice}` : offerItems
  const priorityProductName = input.execution.priorityAction?.product?.name
  const canUsePriorityCopy = priorityProductName ? priorityProductName === product : true
  const inheritedWhatsapp = canUsePriorityCopy ? input.execution.whatsappPlan?.firstApproach : null
  const cta = canUsePriorityCopy && input.execution.priorityAction?.cta
    ? input.execution.priorityAction.cta
    : `Chama no WhatsApp para reservar o ${product} hoje.`
  const whatsapp = inheritedWhatsapp
    || `Tenho uma condição pronta para o ${product} com combo pensado para fechar sem enrolar. Quer que eu te mande os detalhes e deixo separado para você?`
  const delta = incrementalAnswer({ question: input.question, execution: input.execution, state, product, offer, bundle, cta, whatsapp })
  if (delta) return delta

  if (state?.currentExecutionMode === "lead_recovery") {
    return [
      `Missão: recuperar interesse no ${product}.`,
      "",
      "Abordagem:",
      `Oi, tudo bem? Passando porque o ${product} ainda faz sentido para o que você estava procurando. Eu consigo te mandar uma condição objetiva agora, sem ficar te empurrando opção fora do seu perfil.`,
      "",
      "Follow-up:",
      "Se fizer sentido, me responde com 'quero ver' que eu te mando o combo e já deixo a condição organizada.",
      "",
      "Fechamento:",
      cta,
    ].join("\n")
  }

  if (state?.currentExecutionMode === "closing_mode") {
    return [
      `Vamos fechar o ${product} sem voltar para diagnóstico.`,
      "",
      "Argumento de fechamento:",
      `Esse é o melhor caminho porque resolve a compra com o produto certo e um pacote simples: ${offer}.`,
      "",
      "Resposta para objeção:",
      "Se a pessoa pedir desconto, não entre em guerra de preço. Reforce o combo, a condição e a reserva por janela curta.",
      "",
      "CTA:",
      cta,
    ].join("\n")
  }

  if (state?.currentExecutionMode === "operational_decision") {
    return [
      `Decisão assumida: ${state.chosenOperationalPath === "balanced" ? "vamos no caminho equilibrado" : state.chosenOperationalPath === "conservative" ? "vamos preservar margem" : state.chosenOperationalPath === "aggressive" ? "vamos acelerar giro" : "vamos seguir o caminho escolhido"}.`,
      "",
      `Missão ativa:\n${state.currentMission || `Executar venda de ${product}`}`,
      "",
      `Produto:\n${product}`,
      "",
      `Oferta base:\n${offer}`,
      "",
      "Próximo passo:\nAgora eu continuo em execução, não em nova análise. A próxima resposta já pode virar campanha, WhatsApp, anúncio, Stories ou argumento de fechamento.",
    ].join("\n")
  }

  return [
    `Campanha:\n${campaignName(state, input.execution)}`,
    "",
    `Oferta:\n${offer}`,
    "",
    `Headline:\n${product} pronto para levar com combo inteligente hoje.`,
    "",
    `Criativo:\nFoto limpa do ${product}, acessórios do combo ao lado e texto curto: "combo pronto, condição direta, atendimento pelo WhatsApp".`,
    "",
    "Copy:\nSe você estava esperando o momento certo para comprar, esse é o combo para decidir sem enrolar: produto certo, pacote útil e atendimento direto para reservar.",
    "",
    `CTA:\n${cta}`,
    "",
    "Stories:\n1. Mostrar o produto em detalhe e chamar atenção para disponibilidade.\n2. Mostrar o combo e explicar o ganho prático.\n3. Abrir caixinha ou CTA direto: \"quer que eu te mande a condição?\".",
    "",
    `WhatsApp:\n${whatsapp}`,
    "",
    trafficLine(input.execution),
    "",
    `Objetivo:\nTransformar a decisão já tomada em conversa qualificada e fechamento do ${product}.`,
    "",
    "Risco:\nNão escalar antes de validar conversa real. O teste controlado pode rodar; escala só depois de resposta e intenção clara.",
    "",
    "Validação:\n- conversa qualificada aberta\n- resposta no WhatsApp dentro da janela combinada\n- lead avançando para reserva ou pagamento",
  ].join("\n")
}

export async function buildStrategicCopilotAnswer(input: {
  question: string
  snapshot: OrionSnapshot
  execution: OrionExecutionPayload
  conversationState?: OrionOperationalConversationState | null
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada no backend.")

  const requestBody: Record<string, unknown> = {
    model: ORION_STRATEGIC_MODEL,
    instructions: systemPrompt,
    input: JSON.stringify({
      userQuestion: input.question,
      context: conciseStrategicContext(input.snapshot, input.execution, input.conversationState),
    }),
  }
  if (supportsTemperature(ORION_STRATEGIC_MODEL)) requestBody.temperature = 0.45

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 35000)
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }).finally(() => clearTimeout(timeout))

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : `OpenAI respondeu HTTP ${response.status}`
    throw new Error(message)
  }

  const answer = sanitizeAnswer(extractOutputText(payload))
  if (!answer) throw new Error("OpenAI não retornou resposta estratégica.")
  return answer
}

export function shouldUseOperationalExecutionAnswer(state?: OrionOperationalConversationState | null) {
  if (state?.intentRoute?.missionContextPolicy === "ignore") return false
  if (state?.activeReasoningMode && !isExecutionReasoningMode(state.activeReasoningMode)) return false
  if (state?.executionGuardrails && !state.executionGuardrails.allowCampaignGeneration && !state.executionGuardrails.allowCopyGeneration && !state.executionGuardrails.allowTrafficRecommendation) return false
  const intent = state?.operationalIntent
  const incrementalIntent = intent && intent !== "new_strategy" && intent !== "strategic_question"
  return Boolean(incrementalIntent) || isExecutionModeOperational(state?.currentExecutionMode || state?.executionMode)
}
