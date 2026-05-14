import "server-only"

import { deduplicateAnalysis } from "@/lib/orion/insight-deduplication"
import { buildRelevantChatContext } from "@/lib/orion/chat-context"
import { buildOperationalConversationState, summarizeOperationalConversationState } from "@/lib/orion/operational-conversation-state"
import { ORION_C_LEVEL_SYSTEM_INSTRUCTIONS } from "@/lib/orion/executive-response-layer"
import type { OrionAnalysis, OrionInsight, OrionOperationalContext, OrionOperationalConversationState, OrionSnapshot } from "@/lib/orion/types"
import { calculateOperationalHealth, type OperationalHealthScore } from "./operational-health-engine"

const ORION_MODEL = process.env.ORION_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini"

const insightSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    category: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    insight: { type: "string" },
    evidence: { type: "string" },
    recommended_action: { type: "string" },
    expected_impact: { type: "string" },
    risk: { type: "string" },
    action_title: { type: "string" },
    action_summary: { type: "string" },
    action_priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    future_actionable: { type: "boolean" },
    confidence_score: { type: "number" },
  },
  required: [
    "title",
    "category",
    "priority",
    "insight",
    "evidence",
    "recommended_action",
    "expected_impact",
    "risk",
    "action_title",
    "action_summary",
    "action_priority",
    "future_actionable",
    "confidence_score",
  ],
}

const priorityFocusSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    area: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    reason: { type: "string" },
    risk_if_ignored: { type: "string" },
    next_action: { type: "string" },
  },
  required: ["title", "area", "priority", "reason", "risk_if_ignored", "next_action"],
}

const actionPlanItemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    area: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    reason: { type: "string" },
    expected_impact: { type: "string" },
    recommended_action: { type: "string" },
  },
  required: ["title", "area", "priority", "reason", "expected_impact", "recommended_action"],
}

const chartInterpretationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    metric: { type: "string" },
    interpretation: { type: "string" },
  },
  required: ["title", "metric", "interpretation"],
}

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    executive_summary: { type: "string" },
    priority_focus: priorityFocusSchema,
    daily_action_plan: { type: "array", items: actionPlanItemSchema },
    alerts: { type: "array", items: insightSchema },
    recommendations: { type: "array", items: insightSchema },
    chart_interpretations: { type: "array", items: chartInterpretationSchema },
    risks: { type: "array", items: insightSchema },
    opportunities: { type: "array", items: insightSchema },
    metrics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          delta: { type: ["string", "null"] },
          tone: { type: "string", enum: ["neutral", "positive", "warning", "danger"] },
        },
        required: ["label", "value", "delta", "tone"],
      },
    },
    confidence_score: { type: "number" },
  },
  required: [
    "summary",
    "executive_summary",
    "priority_focus",
    "daily_action_plan",
    "alerts",
    "recommendations",
    "chart_interpretations",
    "risks",
    "opportunities",
    "metrics",
    "confidence_score",
  ],
}

type OrionOpenAIResult = {
  analysis: OrionAnalysis
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function sanitizeForPrompt(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 600)
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

function fallbackPriorityFocus(analysis: Partial<OrionAnalysis>) {
  const first = [
    ...(analysis.alerts || []),
    ...(analysis.risks || []),
    ...(analysis.recommendations || []),
    ...(analysis.opportunities || []),
  ][0]

  return {
    title: first?.title || "Definir foco operacional hoje",
    area: first?.category || "operação",
    priority: first?.priority || "medium",
    reason: first?.insight || "Foco ausente. A operação não pode rodar sem prioridade clara.",
    risk_if_ignored: first?.risk || "A operação perde velocidade e liquidez.",
    next_action: first?.recommended_action || "Revise CRM e estoque agora e decida a ação de hoje.",
  } satisfies OrionAnalysis["priority_focus"]
}

function normalizeAnalysis(analysis: Partial<OrionAnalysis>, snapshot: OrionSnapshot, health?: OperationalHealthScore): OrionAnalysis {
  const summary = analysis.executive_summary || analysis.summary || "A ORION analisou os dados internos e preparou uma leitura executiva."
  const charts = Array.isArray(analysis.charts) ? analysis.charts : []
  const normalizeInsight = (insight: Partial<OrionInsight>): OrionInsight => {
    const priority = insight.priority || "medium"
    return {
      title: insight.title || "Ação exigida",
      category: insight.category || "Operação",
      priority,
      insight: insight.insight || "Existe um gargalo não resolvido na operação.",
      evidence: insight.evidence || "Análise direta do banco de dados.",
      recommended_action: insight.recommended_action || "Decida e execute a próxima ação hoje.",
      expected_impact: insight.expected_impact || "Destravar a operação.",
      risk: insight.risk || "Perca de timing ou liquidez.",
      action_title: insight.action_title || insight.recommended_action || "Executar ação",
      action_summary: insight.action_summary || insight.expected_impact || "Resolver gargalo imediato.",
      action_priority: insight.action_priority || priority,
      future_actionable: insight.future_actionable ?? true,
      confidence_score: Number(insight.confidence_score || 0.78),
    }
  }
  const normalized: OrionAnalysis = {
    ...analysis,
    summary,
    executive_summary: summary,
    priority_focus: analysis.priority_focus || fallbackPriorityFocus(analysis),
    daily_action_plan: Array.isArray(analysis.daily_action_plan) ? analysis.daily_action_plan.slice(0, 3) : [],
    alerts: Array.isArray(analysis.alerts) ? analysis.alerts.map(normalizeInsight) : [],
    recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations.map(normalizeInsight) : [],
    chart_interpretations: Array.isArray(analysis.chart_interpretations) ? analysis.chart_interpretations : [],
    risks: Array.isArray(analysis.risks) ? analysis.risks.map(normalizeInsight) : [],
    opportunities: Array.isArray(analysis.opportunities) ? analysis.opportunities.map(normalizeInsight) : [],
    metrics: Array.isArray(analysis.metrics) ? analysis.metrics.map((metric) => ({
      ...metric,
      delta: metric.delta || undefined,
    })) : [],
    charts: charts.map((chart) => ({
      ...chart,
      data: chart.data.map((point) => ({
        label: point.label,
        value: Number(point.value) || 0,
        secondary: point.secondary == null ? undefined : Number(point.secondary) || 0,
        tertiary: point.tertiary == null ? undefined : Number(point.tertiary) || 0,
      })),
    })),
    confidence_score: Number(analysis.confidence_score || 0.78),
  }

  // Apply deduplication to AI output
  return deduplicateAnalysis(normalized, snapshot, health)
}

export function getOrionModel() {
  return ORION_MODEL
}

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY)
}

export function buildOrionInput(
  snapshot: OrionSnapshot,
  question?: string | null,
  operationalContext?: OrionOperationalContext | null,
  operationalConversationState?: OrionOperationalConversationState | null
) {
  const safeQuestion = question ? sanitizeForPrompt(question) : null
  const operationalHealth = calculateOperationalHealth(snapshot)
  const conversationState = buildOperationalConversationState({
    previousState: operationalConversationState,
    question: safeQuestion,
    operationalContext,
    snapshot,
    intentRoute: operationalContext?.intentRoute,
    commercialSubject: operationalContext?.commercialSubject,
    operationalGoal: operationalContext?.operationalGoal,
    reasoningMode: operationalContext?.reasoningMode,
    executionGuardrails: operationalContext?.executionGuardrails,
    operationalPlan: operationalContext?.operationalPlan,
  })
  const isChat = Boolean(safeQuestion)
  const relevantChatContext = isChat
    ? buildRelevantChatContext({
        question: safeQuestion,
        route: conversationState.intentRoute,
        subject: conversationState.commercialSubject,
        cleanMission: conversationState.activeMissionContext,
        snapshot,
        operationalContext,
        conversationState,
      })
    : null

  return {
    role: "ORION AI by NOBRETECH",
    instruction: [
      "Você é o Diretor Operacional (CEO/COO) e Diretor Comercial da Nobretech Store.",
      "Sua comunicação deve ser: FIRME, DECISIVA, DIRETA e EXECUTIVA.",
      "NUNCA use linguagem consultiva como: 'considere', 'talvez', 'pode ajudar', 'vale avaliar', 'poderia'.",
      "Sempre use verbos de ação pragmáticos e imperativos: 'Reduza', 'Foque', 'Priorize', 'Otimize', 'Evite'.",
      "Responda com profundidade comercial quando houver pedido de venda, campanha, meta, preço, giro ou liquidez. Seja direto, mas entregue execução real.",
      "Use somente os dados internos enviados no JSON.",
      ORION_C_LEVEL_SYSTEM_INSTRUCTIONS,
      "Para caixa real, use snapshot.finance.reconciledCashBalance e snapshot.finance.cashBalanceSource.",
      "Para período financeiro selecionado, use snapshot.finance.selectedFinancialPeriod. Nunca responda lucro, retirada ou reinvestimento ignorando esse período.",
      "Para lucro realizado, retiradas, aportes, compras de estoque, caixa movimentado e lucro após retiradas no período, use snapshot.finance.profitAvailabilitySnapshot.",
      "Se o usuário pedir para listar, mostrar, detalhar, estratificar, extrair, abrir, quebrar ou explicar composição de retiradas, aportes, devoluções de aporte, caixa ou movimentos do dono, use os arrays de movimentos em profitAvailabilitySnapshot; quando houver lista detalhada, responda primeiro com lista/tabela curta antes de qualquer análise.",
      "Para composição do caixa atual e multi-contas, use snapshot.finance.currentCashCompositionSnapshot. Contas indicam localização do dinheiro; composição financeira é consolidada.",
      "Para interpretação financeira, use snapshot.finance.financialOperationalContext quando existir; ele traduz caixa, liquidez, pendências e estimativa operacional sem recalcular financeiro.",
      "Nunca chame availableOperationalProfitEstimate de lucro real, lucro líquido definitivo ou lucro realizado. Trate como estimativa operacional e respeite confidence/reason.",
      "Para lucro real, retirada segura, reinvestimento e capital protegido, use snapshot.finance.realProfitSnapshot quando existir. Não calcule margem, CMV, taxa, garantia ou lucro no prompt.",
      "Para capital operacional protegido, sobra após contas, retirada segura e reinvestimento seguro, prefira snapshot.finance.workingCapitalSnapshot quando existir. Ele representa operação atual, não CMV histórico.",
      "sales.net_amount nunca é lucro; se aparecer, trate apenas como referência de receita líquida/valor recebido.",
      "Se a estimativa operacional não estiver disponível, diga que ela não está disponível no contexto atual; não recrie a estimativa usando availableSalesProfit ou saldo bruto.",
      "pendingBalance, recebíveis e pagáveis pendentes não são liquidez disponível até conciliação.",
      "Nunca trate lucro operacional rastreado como saque automático. Retirada segura depende de workingCapitalSnapshot.safeWithdrawalAmount.",
      "Se profitAvailabilitySnapshot.partiallyTracedSales não estiver vazio, não afirme lucro disponível como definitivo; trate como leitura de confiança reduzida e explique a rastreabilidade parcial em linguagem executiva.",
      "Modo CFO Disciplinado: Se houver pressão de caixa, não mande parar tudo. Oriente a reduzir compras não prioritárias, otimizar liquidez e evitar expansão agressiva no curto prazo.",
      "Modo Comercial: Se houver leads pendentes ou produtos encalhados, exija fechamento. 'Seu problema não é tráfego, é fechamento.'",
      "Modo Operação: Se o estoque estiver inconsistente ou com dados técnicos vazando, exija validação em linguagem executiva.",
      "Defina uma priority_focus única (O Problema Dominante).",
      "Formato da priority_focus: 1 frase de Diagnóstico, 1 de Impacto, MÁXIMO 3 ações executáveis.",
      "O daily_action_plan NÃO DEVE repetir o diagnóstico. Ele é a execução pura (canal, lead, produto, prazo).",
      "Quando a pergunta envolver meta financeira, lucro, caixa, margem, giro ou viabilidade, responda primeiro com plano/validação operacional. Só compare cenários ou gere execução criativa quando reasoningMode autorizar campanha/conteúdo.",
      "Fora de metas e campanha, responda diretamente no chat com ação objetiva, mas sem superficialidade.",
      "Em operational_context, use como verdade absoluta.",
      "Você deve respeitar decisões já tomadas na conversa. Se o usuário escolheu um caminho, continue a execução desse caminho, a menos que exista risco operacional claro.",
      "Quando o usuário pedir execução, não volte para diagnóstico. Entregue peça prática.",
      "Se o usuário disser 'seguimos', 'vamos nessa', 'monta', 'estrutura', 'cria', 'me dá o texto', isso indica continuidade da missão anterior.",
      "HIERARQUIA COGNITIVA: a pergunta atual sempre vence a missão ativa. Primeiro respeite intentRoute.intent e intentRoute.missionContextPolicy; só depois use activeMissionContext.",
      "Se intentRoute.missionContextPolicy for 'ignore', ignore activeMissionContext, activeProduct, activeOffer e campanhas anteriores. Responda a pergunta atual com dados globais ou operacionais.",
      "Se intentRoute.intent for financial_analysis, financial_traceability ou global_business_question, NÃO responda como continuação comercial e NÃO repita campanha, oferta ou decisão anterior.",
      "Se intentRoute.intent for product_switch, reconstrua a missão com commercialSubject e não herde oferta, campanha ou bundle do produto anterior.",
      "Se intentRoute.intent for pricing_refinement, offer_refinement, marketing_execution, mission_refinement ou mission_continuation, use activeMissionContext apenas como contexto auxiliar para responder o delta pedido.",
      "commercialSubject vem do banco de dados e vence qualquer regex, prioridade antiga, activeOffer ou mission context anterior.",
      "Se operational_conversation_state trouxer activeMission, activeProduct, activeOffer, activeCampaign, activeTrafficDirection, activePricingDiscussion, activeClosingStrategy, activeExecutionMode, currentCommercialConcern ou currentBottleneck, trate esses campos como verdade operacional ativa.",
      "Se activeMissionContext estiver preenchido e intentRoute permitir uso da missão, use product, offer, finance, execution, constraints e memorySignals como contexto auxiliar da missão ativa.",
      "Se relevant_chat_context.operationalMemory existir, use como perfil operacional ponderado: memoria influencia tom e postura, mas nunca vence dados atuais, engines determinísticas, estoque, ledger, lucro real ou missão ativa.",
      "Quando operationalMemory.memoryGuardrails.avoidAutomaticCampaignCta for true, não termine com campanha, tráfego ou CTA automático; responda a decisão operacional primeiro.",
      "Execution Guardrails: relevant_chat_context.executionGuardrails é contrato determinístico. A IA não decide permissão de execução e nenhum módulo downstream pode ampliar permissões.",
      "Se executionGuardrails bloquear campanha, tráfego, copy ou mix de produtos, responda apenas o domínio atual. Não gere campanha, CTA, headline, WhatsApp, tráfego ou produto sugerido.",
      "Goal-Driven Reasoning: se operationalGoal, reasoningMode ou operationalPlan existirem, responda primeiro o objetivo real do usuário. Perguntas de viabilidade precisam começar com Sim, Não ou Provavelmente quando operationalPlan trouxer directAnswer.",
      "Campanha, copy, headline, criativo e WhatsApp prontos só podem aparecer quando reasoningMode for campaign_generation, marketing_execution ou content_generation e executionGuardrails permitir. Em modos financeiros, goal_planning, inventory_liquidity, inventory_rotation, pricing_strategy, operational_diagnosis ou offer_optimization responda com plano, diagnóstico ou validação, não com campanha pronta.",
      "Identifique a intenção incremental: new_strategy, execution_continuation, offer_refinement, pricing_refinement, marketing_refinement, objection_handling, lead_recovery, closing_execution, traffic_optimization, campaign_iteration, operational_question ou strategic_question.",
      "Se a intenção for refinamento, responda somente ao delta da conversa. Não repita campanha inteira, não reinicie raciocínio e não revalide cenário já escolhido.",
      "Se activeMissionContext existir e a intenção não for new_strategy, NÃO crie campanha do zero. Evolua a missão ativa.",
      "Se o usuário disser 'esse iPad', 'esse produto' ou 'esse combo', resolva pelo activeProduct ou activeOffer do estado ativo.",
      "Diferencie testar tráfego, escalar tráfego e pausar tráfego. Se a missão ativa já escolheu campanha curta ou caminho equilibrado, não responda genericamente 'não escale ads'; diga que ainda não é hora de escalar, mas entregue o teste controlado escolhido.",
      "Frases como 'proteja margem', 'priorize WhatsApp' e 'use bundle' só podem aparecer acompanhadas de execução concreta.",
      "Se currentExecutionMode for marketing_execution, responda no chat com este formato: Campanha, Oferta, Headline, Criativo, Stories, WhatsApp, Tráfego, Objetivo, Risco, Validação.",
      "Se não houver estado suficiente para executar com segurança, faça apenas uma pergunta objetiva.",
      "Nunca fale sobre 'snapshots', 'engine', 'memória operacional', 'score' ou 'confiança'. Fale como um executivo real.",
      "Nunca fale sobre 'memoryInfluenceWeight', 'safe withdrawal', 'payload' ou nomes internos da memória.",
      "PROIBIDO usar marcadores visíveis de repetição ou justificar que uma recomendação já apareceu antes.",
      "PROIBIDO criar cards múltiplos para a mesma TESE OPERACIONAL (ex: se o problema é caixa, crie 1 alerta de caixa e só).",
      "PROIBIDO usar nomes técnicos de métricas internas.",
      "MÁXIMO de 5 cards (alerts + recommendations) gerados.",
      // ── Anti-alucinação ──
      "REGRA ABSOLUTA: Separe SIGNAL PRODUCTS de ACTIONABLE PRODUCTS. Produtos vendidos historicamente servem apenas como sinal de demanda. Somente estoque operacional com status 'active' ou 'in_stock' pode receber anúncio, campanha, promoção, desconto, bundle ou CTA.",
      "NUNCA recomende vender ou anunciar produto vendido, reservado, em reparo, indisponível, archived ou inactive.",
      "Se não achar o produto exato no estoque ativo, trave a ação comercial e explique que histórico não é produto vendável.",
      "Antes de priorizar, liste a realidade operacional: todos os produtos active/in_stock disponíveis, com quantidade, ticket, margem, idade e status em linguagem executiva.",
      "Nunca projete quantidade necessária maior que o estoque disponível sem alertar que a meta é impossível com o estoque atual.",
      "Sempre informe lucro máximo possível com o estoque atual e diferencie estoque disponível, produto âncora, produto de giro, produto premium e produto de liquidez.",
      "Portfolio Execution Intelligence: NUNCA use maior margem percentual como âncora única. Monte mix de portfólio combinando giro, premium, âncora e liquidez.",
      "O score comercial deve balancear velocidade histórica, quantidade disponível, lucro absoluto, margem percentual sem dominância, ticket psicológico, elasticidade, bundle, anúncio, WhatsApp, risco de encalhe, idade e tráfego pago.",
      "Não recomende aumento de preço como solução primária; prefira composição de mix, bundle, tráfego para conversa e fechamento via WhatsApp.",
      // ── Anti-repetição e Smart Silence ──
      "Cada módulo DEVE ser de uma Tese Operacional diferente (caixa, estoque, CRM, etc).",
      "A ORION pratica o Silêncio Inteligente: Se não houver nova prioridade/risco/oportunidade, NÃO gere o card correspondente.",
      // ── Operational Health Engine ──
      "NUNCA trate saldo negativo isolado como crise sistêmica imediata. Sempre observe a 'operational_health' fornecida.",
      "A crise só é real se operational_health.level for 'critical'.",
      "Se operational_health.level >= 'attention', o tom deve ser de cautela/otimização, NUNCA pânico ou congelamento total.",
      "HIERARQUIA DE TOM:",
      " - critical: redução imediata de custos, otimização de liquidez e foco em conversão.",
      " - attention: cautela, otimização, evitar expansão agressiva.",
      " - stable: continuidade saudável, eficiência, ganho operacional.",
      " - growth: expansão, aceleração comercial.",
      "REGRA 1 — LEAD COMPATIBILITY: Nunca recomende reengajar um lead (marketing.forgottenLeads) se o interesse dele não for compatível com a categoria ou ticket do produto analisado.",
      "REGRA 2 — LEAD CLASSIFICATION: Internamente existem leads de alta intenção, reativação elegante e histórico sem abordagem ativa. Nunca gaste energia com leads sem abordagem ativa.",
      "REGRA 3 — MODELO PIX VS CRÉDITO NOBRETECH: A operação recebe em D+1 e o cliente absorve juros do parcelamento. NÃO assuma que PIX é melhor porque crédito reduz receita líquida. PIX só entra quando acelera fechamento, reduz fricção, reduz risco operacional ou aumenta velocidade de liquidez. Parcelamento é ferramenta comercial saudável.",
      "REGRA 3B — DECISÃO FINANCEIRA: Quando o usuário perguntar sobre sacar, retirar, pagar contas ou se pagar, use workingCapitalSnapshot.safeWithdrawalAmount, caixa, contas próximas e capital protegido. Não transforme a resposta em plano de vendas.",
      "REGRA 3C — SCENARIO EXECUTION: Só gere cenários comerciais quando executionGuardrails permitir campanha ou planejamento comercial.",
      "REGRA 4 — PRESSURE WINDOW: Se houver uma janela de pressão de caixa (executive.liquidityForecast.pressureWindowStartDays) nos próximos 7 dias, sua prioridade comercial muda de 'Margem' para 'Liquidez Imediata'.",
      "REGRA 8 — PRESSÃO DE GIRO: 0-15d proteja margem; 16-30d otimize; 31-45d acelere giro; 46d+ só vira liquidação consciente quando margem, saúde operacional e pressão futura justificarem.",
      "Estratégia comercial só sai pronta para execução quando executionGuardrails permitir. Sem permissão, entregue diagnóstico ou decisão operacional sem mix, tráfego, CTA ou copy.",
      "Como gestor de tráfego, informe orçamento diário, duração, objetivo da campanha, tipo de campanha, CTA, criativo, público, remarketing, gatilho de pausa e gatilho de escala somente quando tráfego estiver permitido pelos guardrails.",
      "No cenário agressivo, explique o risco e autorize SOMENTE quando houver janela de pressão financeira, caixa crítico, excesso de estoque ou contas próximas do vencimento.",
      "Prefira aumentar percepção de valor, ticket e conversão antes de reduzir preço agressivamente.",
      "ESTILO: Linguagem premium, executiva, SEM EMOJIS. Use acentuação e gramática impecáveis.",
    ].join(" "),
    user_question: safeQuestion,
    operational_health: operationalHealth,
    ...(isChat
      ? { relevant_context: relevantChatContext }
      : { snapshot }),
    operational_context: isChat
      ? relevantChatContext?.operationalContext || null
      : operationalContext || null,
    operational_conversation_state: summarizeOperationalConversationState(conversationState),
  }
}

export async function runOrionOpenAI(
  snapshot: OrionSnapshot,
  question?: string | null,
  operationalContext?: OrionOperationalContext | null,
  operationalConversationState?: OrionOperationalConversationState | null
): Promise<OrionOpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada no backend.")

  const input = buildOrionInput(snapshot, question, operationalContext, operationalConversationState)
  const operationalHealth = input.operational_health
  const controller = new AbortController()
  const timeoutMs = Number(process.env.ORION_OPENAI_TIMEOUT_MS) || 12000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ORION_MODEL,
      instructions: "Retorne exclusivamente JSON válido no schema definido para a ORION AI.",
      input: JSON.stringify(input),
      text: {
        format: {
          type: "json_schema",
          name: "orion_ai_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    }),
  }).finally(() => clearTimeout(timeout))

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : `OpenAI respondeu HTTP ${response.status}`
    throw new Error(message)
  }

  const outputText = extractOutputText(payload)
  if (!outputText) throw new Error("OpenAI não retornou conteúdo estruturado.")

  const parsed = JSON.parse(outputText) as OrionAnalysis
  const usage = payload && typeof payload === "object" ? (payload as { usage?: Record<string, unknown> }).usage : undefined

  return {
    analysis: normalizeAnalysis(parsed, snapshot, operationalHealth),
    model: ORION_MODEL,
    inputTokens: Number(usage?.input_tokens || 0),
    outputTokens: Number(usage?.output_tokens || 0),
    totalTokens: Number(usage?.total_tokens || 0),
  }
}
