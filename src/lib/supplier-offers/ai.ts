import { normalizeParsedSupplierOffers, parseSupplierOffersFallback } from "./supplier-offer-parser"
import type { ParsedSupplierOffer } from "./types"

const DEFAULT_SUPPLIER_OFFERS_AI_MODEL = "gpt-5.1"
const DEFAULT_REASONING_EFFORT = "medium"
const DEFAULT_TIMEOUT_MS = 90000
const DEFAULT_MAX_BLOCK_CHARS = 6000

type ParserMode = "ai" | "hybrid" | "local"

type ParseBlock = {
  index: number
  title: string
  text: string
}

type ParseOptions = {
  apiKey?: string | null
  fetcher?: typeof fetch
  model?: string
  reasoningEffort?: string
  timeoutMs?: number
  maxBlockChars?: number
}

type BlockResult = {
  block: ParseBlock
  items: ParsedSupplierOffer[]
  source: "ai" | "local"
  error?: { type: string; message: string; durationMs: number }
}

const supplierOfferSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceLine",
          "sourceSection",
          "category",
          "brand",
          "model",
          "variant",
          "storage",
          "size",
          "color",
          "condition",
          "internalGrade",
          "batteryHealth",
          "warrantyType",
          "warrantyLabel",
          "origin",
          "supplierPrice",
          "availability",
          "confidence",
          "warnings",
        ],
        properties: {
          sourceLine: { type: "string" },
          sourceSection: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          brand: { type: ["string", "null"] },
          model: { type: ["string", "null"] },
          variant: { type: ["string", "null"] },
          storage: { type: ["string", "null"] },
          size: { type: ["string", "null"] },
          color: { type: ["string", "null"] },
          condition: { type: "string", enum: ["sealed", "used", "unknown"] },
          internalGrade: { type: ["string", "null"] },
          batteryHealth: { type: ["integer", "null"], minimum: 0, maximum: 100 },
          warrantyType: { type: "string", enum: ["none", "apple", "nobretech", "supplier", "unknown"] },
          warrantyLabel: { type: ["string", "null"] },
          origin: { type: ["string", "null"] },
          supplierPrice: { type: ["number", "null"] },
          availability: { type: "string", enum: ["available", "unavailable", "unknown"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const

function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      message: error.message === "This operation was aborted" || error.name === "AbortError"
        ? "OpenAI request aborted or timed out"
        : error.message.slice(0, 180),
    }
  }
  return { type: "UnknownError", message: "Unknown OpenAI error" }
}

function logParseEvent(event: string, meta: Record<string, unknown>) {
  console.warn("[SUPPLIER_OFFER_AI]", event, meta)
}

function extractOutputText(payload: unknown) {
  const response = payload as { output_text?: unknown; output?: unknown } | null
  if (typeof response?.output_text === "string") return response.output_text
  const output = Array.isArray(response?.output) ? response.output : []
  for (const item of output) {
    const content = item && typeof item === "object" && "content" in item
      ? (item as { content?: unknown }).content
      : null
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text
      }
    }
  }
  return ""
}

export function getSupplierOffersAIConfig(overrides: ParseOptions = {}) {
  return {
    model: overrides.model || process.env.SUPPLIER_OFFERS_AI_MODEL || DEFAULT_SUPPLIER_OFFERS_AI_MODEL,
    reasoningEffort: overrides.reasoningEffort || process.env.SUPPLIER_OFFERS_AI_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
    timeoutMs: overrides.timeoutMs || Number(process.env.SUPPLIER_OFFERS_AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    maxBlockChars: overrides.maxBlockChars || Number(process.env.SUPPLIER_OFFERS_AI_MAX_BLOCK_CHARS) || DEFAULT_MAX_BLOCK_CHARS,
  }
}

export function buildSupplierOfferInstructions(blockTitle: string) {
  return [
    "Você interpreta listas brutas de fornecedores da Nobretech Store recebidas por WhatsApp.",
    "A Nobretech vende principalmente iPhone, iPad, MacBook, Apple Watch, Garmin, AirPods, acessórios e gadgets.",
    "Produto de fornecedor é oportunidade comercial de compra/revenda, não é estoque próprio.",
    "Não crie inventory. Não crie venda. Não trate oferta de fornecedor como capital imobilizado.",
    "Retorne somente JSON no schema definido. Não invente dados ausentes.",
    `Bloco atual: ${blockTitle}. Use esse título como contexto da seção quando fizer sentido.`,
    "Herde contexto de seções: IPHONES LACRADOS => condition sealed; IPHONES AMERICANOS/GRADE A+/SEMINOVOS/USADOS => condition used; RELÓGIOS NOVOS => sealed.",
    "Grade A ou Grade A+ nunca é condition pública; salve em internalGrade e use condition used.",
    "Cores em linhas separadas com um preço comum devem gerar múltiplos itens, um por cor.",
    "Preço comum do bloco vale para todos os itens do bloco.",
    "Garanta que color nunca tenha emoji. Exemplo: 🖤 Preto => Preto.",
    "Garantia Apple Out/26, Jul/26 ou 1 ano deve virar warrantyType apple e warrantyLabel Garantia Apple Out/26, Garantia Apple Jul/26 ou Garantia Apple 1 ano.",
    "Itens sem preço devem ter supplierPrice null, availability unknown ou unavailable, confidence low e warning Preço ausente.",
    "Não invente cor, preço, bateria, garantia, origem ou condição. Se não souber, use null/unknown e warning.",
    "Categorias aceitas: iphone, ipad, macbook, applewatch, airpods, garmin, gadgets, accessories.",
    "Quando uma lista de WhatsApp contém uma mensagem longa com seções e depois mensagens repetidas por item, use a mensagem longa como fonte principal.",
    "Mensagens posteriores sem seção explícita devem ser tratadas como possíveis duplicatas, não como continuação da última seção.",
    "Exemplo compacto: IPHONES LACRADOS / iPhone 17 256GB / Branco / Azul / Preto / Verde / R$ 5.100 => quatro itens sealed com preço 5100 e sem alerta de bateria.",
    "Exemplo compacto: depois de IPHONES SEMINOVOS / 16 256 - 91% / Azul - R$ 4.100 => um item used com batteryHealth 91, sem contaminar o bloco lacrado anterior.",
    "Exemplo compacto: IPHONES AMERICANOS GRADE A+ / 14 Pro Max Roxo bateria 88% R$ 3.500 => used, internalGrade A+, batteryHealth 88.",
    "Exemplo compacto: Apple Watch Series 10 46mm Jet Black bateria 100% garantia até outubro de 2026 R$ 2.100 => applewatch, size 46mm, color Jet Black, warrantyType apple.",
  ].join("\n")
}

function isSectionHeader(line: string) {
  const cleaned = line.trim()
  if (!cleaned) return false
  if (/R\$|\b\d+\s*(gb|tb|mm)\b/i.test(cleaned)) return false
  return /(iphone|iphones|lacrado|lacrados|americano|americanos|seminovo|seminovos|atualizados|rel[oó]gios|gadgets|garmin|apple watch|airpods|starlink|alexa)/i.test(cleaned)
}

export function splitSupplierOfferTextIntoBlocks(rawText: string, maxBlockChars = getSupplierOffersAIConfig().maxBlockChars) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return []

  const blocks: ParseBlock[] = []
  let currentTitle = "Lista recebida"
  let currentLines: string[] = []

  const flush = () => {
    if (!currentLines.length) return
    blocks.push({ index: blocks.length, title: currentTitle, text: currentLines.join("\n") })
    currentLines = []
  }

  for (const line of lines) {
    if (isSectionHeader(line)) {
      flush()
      currentTitle = line
      currentLines = [line]
      continue
    }
    currentLines.push(line)
  }
  flush()

  if (rawText.length <= maxBlockChars && blocks.length <= 1) {
    return [{ index: 0, title: "Lista recebida", text: rawText.trim() }]
  }

  const splitBlocks = blocks.flatMap((block) => {
    if (block.text.length <= maxBlockChars) return [block]
    const chunks: ParseBlock[] = []
    let chunkLines: string[] = []
    for (const line of block.text.split(/\r?\n/)) {
      const next = [...chunkLines, line].join("\n")
      if (next.length > maxBlockChars && chunkLines.length) {
        chunks.push({ index: 0, title: block.title, text: chunkLines.join("\n") })
        chunkLines = [block.title, line]
      } else {
        chunkLines.push(line)
      }
    }
    if (chunkLines.length) chunks.push({ index: 0, title: block.title, text: chunkLines.join("\n") })
    return chunks
  })

  return splitBlocks.map((block, index) => ({ ...block, index }))
}

function applySource(items: ParsedSupplierOffer[], source: "ai" | "local") {
  return items.map((item) => ({
    ...item,
    parserSource: source,
    confidence: source === "local" && item.confidence === "high" ? "medium" as const : item.confidence,
  }))
}

function shouldSendReasoning(model: string, reasoningEffort: string) {
  return Boolean(reasoningEffort) && /^gpt-5/i.test(model)
}

async function parseBlockWithAI(block: ParseBlock, supplierId: string | null | undefined, options: Required<Pick<ParseOptions, "fetcher" | "model" | "reasoningEffort" | "timeoutMs">> & { apiKey: string }): Promise<BlockResult> {
  let lastError: { type: string; message: string; durationMs: number } | null = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error("supplier_offer_ai_timeout")), options.timeoutMs)
    logParseEvent("block_start", {
      blockIndex: block.index,
      blockTitle: block.title,
      textLength: block.text.length,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      timeoutMs: options.timeoutMs,
      attempt,
    })

    try {
      const useReasoning = shouldSendReasoning(options.model, options.reasoningEffort)
        && !lastError?.message.includes("HTTP 400")
      const response = await options.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          instructions: buildSupplierOfferInstructions(block.title),
          input: JSON.stringify({ supplierId: supplierId || null, blockTitle: block.title, rawText: block.text }),
          max_output_tokens: 8000,
          ...(useReasoning ? { reasoning: { effort: options.reasoningEffort } } : {}),
          text: {
            format: {
              type: "json_schema",
              name: "nobretech_supplier_offer_parse",
              strict: true,
              schema: supplierOfferSchema,
            },
          },
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(`OpenAI respondeu HTTP ${response.status}`)
      const outputText = extractOutputText(payload)
      if (!outputText) throw new Error("OpenAI não retornou texto estruturado.")

      const parsed = JSON.parse(outputText) as { items?: unknown }
      const durationMs = Date.now() - startedAt
      const items = applySource(normalizeParsedSupplierOffers(parsed.items, supplierId), "ai")
      logParseEvent("block_success", { blockIndex: block.index, durationMs, items: items.length, attempt })
      return { block, items, source: "ai" }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const details = safeError(error)
      lastError = { ...details, durationMs }
      logParseEvent(attempt === 1 ? "block_retry" : "block_fallback", {
        blockIndex: block.index,
        blockTitle: block.title,
        durationMs,
        attempt,
        errorType: details.type,
        errorMessage: details.message,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    block,
    items: applySource(parseSupplierOffersFallback(block.text, supplierId), "local"),
    source: "local",
    error: lastError || { type: "UnknownError", message: "Unknown OpenAI error", durationMs: 0 },
  }
}

function parserModeFromBlocks(results: BlockResult[]): ParserMode {
  const aiBlocks = results.filter((result) => result.source === "ai").length
  const localBlocks = results.length - aiBlocks
  if (aiBlocks && localBlocks) return "hybrid"
  if (aiBlocks) return "ai"
  return "local"
}

function warningForMode(mode: ParserMode, failedBlocks: number) {
  if (mode === "local") return ["A IA não conseguiu interpretar esta lista. Geramos uma prévia com parser local. Revise com atenção."]
  if (mode === "hybrid") return [`A IA interpretou parte da lista, mas ${failedBlocks} bloco(s) usaram fallback local. Revise esses itens com atenção.`]
  return []
}

export async function parseSupplierOffersWithAI(rawText: string, supplierId?: string | null, parseOptions: ParseOptions = {}): Promise<{
  items: ParsedSupplierOffer[]
  parserMode: ParserMode
  aiSucceeded: boolean
  aiFailedBlocks: number
  localFallbackBlocks: number
  batchWarnings: string[]
}> {
  const apiKey = parseOptions.apiKey ?? process.env.OPENAI_API_KEY
  const config = getSupplierOffersAIConfig(parseOptions)
  const blocks = splitSupplierOfferTextIntoBlocks(rawText, config.maxBlockChars)

  logParseEvent("parse_start", {
    rawTextLength: rawText.length,
    blockCount: blocks.length,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    timeoutMs: config.timeoutMs,
    maxBlockChars: config.maxBlockChars,
    hasApiKey: Boolean(apiKey),
  })

  if (!apiKey) {
    const items = applySource(parseSupplierOffersFallback(rawText, supplierId), "local")
    return {
      items,
      parserMode: "local",
      aiSucceeded: false,
      aiFailedBlocks: blocks.length || 1,
      localFallbackBlocks: blocks.length || 1,
      batchWarnings: ["A IA não está configurada neste ambiente. Geramos uma prévia com parser local. Revise com atenção."],
    }
  }

  const fetcher = parseOptions.fetcher || fetch
  const results: BlockResult[] = []
  for (const block of blocks) {
    results.push(await parseBlockWithAI(block, supplierId, {
      apiKey,
      fetcher,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      timeoutMs: config.timeoutMs,
    }))
  }

  const parserMode = parserModeFromBlocks(results)
  const localFallbackBlocks = results.filter((result) => result.source === "local").length
  const items = results.flatMap((result) => result.items)
  logParseEvent("parse_complete", {
    parserMode,
    totalBlocks: results.length,
    aiBlocks: results.length - localFallbackBlocks,
    localFallbackBlocks,
    itemCount: items.length,
  })

  return {
    items,
    parserMode,
    aiSucceeded: parserMode === "ai" || parserMode === "hybrid",
    aiFailedBlocks: localFallbackBlocks,
    localFallbackBlocks,
    batchWarnings: warningForMode(parserMode, localFallbackBlocks),
  }
}
