import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildSupplierOfferInstructions, getSupplierOffersAIConfig, parseSupplierOffersWithAI, splitSupplierOfferTextIntoBlocks } from "./ai"
import {
  classifySupplierOfferReview,
  normalizeSupplierColor,
  normalizeWarranty,
  parseMoney,
  parseSupplierOffersFallback,
} from "./supplier-offer-parser"

describe("supplier offer parser", () => {
  it("uses SUPPLIER_OFFERS_AI_MODEL when defined", () => {
    const original = process.env.SUPPLIER_OFFERS_AI_MODEL
    process.env.SUPPLIER_OFFERS_AI_MODEL = "gpt-test-strong"
    assert.equal(getSupplierOffersAIConfig().model, "gpt-test-strong")
    if (original == null) delete process.env.SUPPLIER_OFFERS_AI_MODEL
    else process.env.SUPPLIER_OFFERS_AI_MODEL = original
  })

  it("expands multiple color lines with the shared price", () => {
    const items = parseSupplierOffersFallback(`
      IPHONES LACRADOS
      iPhone 17 256GB
      Branco
      Azul
      Preto
      Verde
      R$ 5.100
    `, "supplier-1")

    assert.equal(items.length, 4)
    assert.deepEqual(items.map((item) => item.color), ["Branco", "Azul", "Preto", "Verde"])
    assert.ok(items.every((item) => item.supplierPrice === 5100))
  })

  it("inherits sealed condition from lacrados section", () => {
    const [item] = parseSupplierOffersFallback(`
      IPHONES LACRADOS
      17 Pro 256GB Branco R$ 8.000
    `)

    assert.equal(item.condition, "sealed")
    assert.equal(item.model, "iPhone 17 Pro")
    assert.equal(item.color, "Branco")
    assert.equal(item.supplierPrice, 8000)
  })

  it("inherits used condition from seminovos section", () => {
    const [item] = parseSupplierOffersFallback(`
      SEMINOVOS ATUALIZADOS
      iPhone 13 128GB Preto bateria 100% R$ 2.050
    `)

    assert.equal(item.condition, "used")
    assert.equal(item.batteryHealth, 100)
  })

  it("keeps Grade A+ as internal grade instead of public condition", () => {
    const [item] = parseSupplierOffersFallback(`
      IPHONES AMERICANOS (GRADE A+)
      14 Pro Max 128GB Roxo bateria 88% R$ 3.500
    `)

    assert.equal(item.condition, "used")
    assert.equal(item.internalGrade, "A+")
  })

  it("parses battery health percent", () => {
    const [item] = parseSupplierOffersFallback("SEMINOVOS\n14 Pro Max Roxo bateria 88% R$ 3.500")
    assert.equal(item.batteryHealth, 88)
  })

  it("parses Brazilian money format", () => {
    assert.equal(parseMoney("R$ 3.500"), 3500)
  })

  it("keeps Apple warranty labels", () => {
    const [item] = parseSupplierOffersFallback("SEMINOVOS ATUALIZADOS\niPhone 17 Pro Max 256GB Azul bateria 99% garantia Apple Out/26 R$ 8.100")
    assert.equal(item.warrantyType, "apple")
    assert.equal(item.warrantyLabel, "Garantia Apple Out/26")
  })

  it("marks items without price as review/unknown availability", () => {
    const [item] = parseSupplierOffersFallback("IPHONES LACRADOS\niPhone 17 Pro 256GB Branco")
    assert.equal(item.supplierPrice, null)
    assert.equal(item.availability, "unknown")
    assert.ok(item.warnings.includes("Preço ausente"))
  })

  it("marks duplicated offers inside the same batch", () => {
    const items = parseSupplierOffersFallback(`
      IPHONES LACRADOS
      17 Pro Max 1TB Branco R$ 10.800
      17 Pro Max 1TB Branco R$ 10.800
    `, "supplier-1")

    assert.equal(items.length, 2)
    assert.ok(items.every((item) => item.duplicateCandidate))
  })

  it("accepts Garmin, gadgets and Apple Watch categories", () => {
    const items = parseSupplierOffersFallback(`
      GARMIN / GADGETS / APPLE WATCH
      Garmin Forerunner 55 42mm Preto R$ 1.100
      Garmin Forerunner 55 42mm Branco R$ 1.100
      Starlink Mini R$ 900
      Alexa Echo Dot 5ª geração Preto R$ 370
      Apple Watch SE 2 44mm GPS + Cellular Midnight bateria 85% R$ 900
      Apple Watch Series 10 46mm Jet Black bateria 100% garantia até outubro de 2026 R$ 2.100
    `)

    assert.equal(items.find((item) => item.model?.includes("Forerunner"))?.category, "garmin")
    assert.equal(items.find((item) => item.model?.includes("Starlink"))?.category, "gadgets")
    assert.equal(items.find((item) => item.model?.includes("Echo Dot"))?.category, "gadgets")
    assert.equal(items.find((item) => item.model?.includes("Apple Watch SE"))?.category, "applewatch")
    assert.equal(items.find((item) => item.model?.includes("Series 10"))?.warrantyType, "apple")
    assert.equal(items.find((item) => item.model?.includes("Series 10"))?.warrantyLabel, "Garantia Apple Out/26")
  })

  it("covers the requested Miami sample validations", () => {
    const items = parseSupplierOffersFallback(`
      IPHONES LACRADOS
      17 Pro Max 1TB
      Branco
      Azul
      R$ 10.800
      17 Pro 256GB Branco R$ 8.000
      17 256GB
      Branco
      Azul
      Preto
      Verde
      R$ 5.100

      IPHONES AMERICANOS (GRADE A+)
      17 Pro Max 256GB Azul bateria 100% garantia Apple R$ 7.800
      14 Pro Max Roxo bateria 88% R$ 3.500
      14 Pro Max Roxo bateria 88% R$ 3.500
    `, "miami")

    assert.ok(items.some((item) => item.model?.includes("17 Pro Max") && item.storage === "1TB" && item.color === "Branco" && item.condition === "sealed" && item.supplierPrice === 10800))
    assert.ok(items.some((item) => item.model?.includes("17 Pro Max") && item.storage === "1TB" && item.color === "Azul" && item.condition === "sealed" && item.supplierPrice === 10800))
    assert.ok(items.some((item) => item.model?.includes("17 Pro") && item.storage === "256GB" && item.color === "Branco" && item.condition === "sealed" && item.supplierPrice === 8000))
    assert.equal(items.filter((item) => item.model?.includes("iPhone 17") && item.storage === "256GB" && item.supplierPrice === 5100).length, 4)
    assert.ok(items.some((item) => item.model?.includes("17 Pro Max") && item.color === "Azul" && item.condition === "used" && item.batteryHealth === 100 && item.supplierPrice === 7800))
    assert.ok(items.some((item) => item.model?.includes("14 Pro Max") && item.color === "Roxo" && item.condition === "used" && item.batteryHealth === 88 && item.supplierPrice === 3500))
    assert.ok(items.filter((item) => item.model?.includes("14 Pro Max")).every((item) => item.duplicateCandidate))
  })

  it("returns AI failures as batch warnings instead of repeated item warnings", async () => {
    const originalKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    const result = await parseSupplierOffersWithAI("IPHONES LACRADOS\n17 Pro 256GB Branco R$ 8.000")
    if (originalKey) process.env.OPENAI_API_KEY = originalKey

    assert.equal(result.parserMode, "local")
    assert.equal(result.batchWarnings.length, 1)
    assert.equal(result.items.some((item) => item.warnings.some((warning) => warning.includes("IA"))), false)
  })

  it("caps local parser confidence below high when AI is unavailable", async () => {
    const result = await parseSupplierOffersWithAI("IPHONES LACRADOS\n17 Pro 256GB Branco R$ 8.000", null, { apiKey: null })
    assert.equal(result.parserMode, "local")
    assert.ok(result.items.length > 0)
    assert.equal(result.items.every((item) => item.confidence !== "high"), true)
  })

  it("splits long supplier text by commercial sections", () => {
    const blocks = splitSupplierOfferTextIntoBlocks(`
      IPHONES LACRADOS
      17 Pro 256GB Branco R$ 8.000
      SEMINOVOS ATUALIZADOS
      iPhone 13 128GB Preto bateria 100% R$ 2.050
      GARMIN / GADGETS
      Starlink Mini R$ 900
    `)

    assert.equal(blocks.length, 3)
    assert.equal(blocks[0].title, "IPHONES LACRADOS")
    assert.equal(blocks[1].title, "SEMINOVOS ATUALIZADOS")
    assert.equal(blocks[2].title, "GARMIN / GADGETS")
  })

  it("splits Miami-style sections into sealed, american and used blocks", () => {
    const blocks = splitSupplierOfferTextIntoBlocks(`
      IPHONES LACRADOS
      17 Pro 256GB Branco R$ 8.000
      IPHONES AMERICANOS (GRADE A+)
      17 Pro Max 256GB Azul bateria 100% R$ 7.800
      IPHONES SEMINOVOS
      14 Pro Max Roxo bateria 88% R$ 3.500
    `)

    assert.deepEqual(blocks.map((block) => block.title), [
      "IPHONES LACRADOS",
      "IPHONES AMERICANOS (GRADE A+)",
      "IPHONES SEMINOVOS",
    ])
  })

  it("prompt contains the critical extraction rules", () => {
    const prompt = buildSupplierOfferInstructions("IPHONES LACRADOS")
    assert.match(prompt, /internalGrade/)
    assert.match(prompt, /condition sealed/)
    assert.match(prompt, /Não invente dados ausentes/)
    assert.match(prompt, /múltiplos itens/)
    assert.match(prompt, /não é estoque próprio/)
  })

  it("sends the reduced schema while preserving warranty, battery, price and color", async () => {
    let requestBody: Record<string, unknown> = {}
    const fetcher = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
      return new Response(JSON.stringify({
        output_text: JSON.stringify({ items: [] }),
      }), { status: 200 })
    }) as typeof fetch

    await parseSupplierOffersWithAI("IPHONES LACRADOS\n17 Pro 256GB Branco R$ 8.000", null, { apiKey: "test-key", fetcher })
    const schema = (((requestBody.text as Record<string, unknown>).format as Record<string, unknown>).schema as Record<string, unknown>)
    const item = ((((schema.properties as Record<string, unknown>).items as Record<string, unknown>).items as Record<string, unknown>))
    const required = item.required as string[]
    const properties = item.properties as Record<string, unknown>
    assert.equal(required.includes("warrantyUntil"), false)
    assert.ok(properties.warrantyType)
    assert.ok(properties.batteryHealth)
    assert.ok(properties.supplierPrice)
    assert.ok(properties.color)
  })

  it("keeps successful AI blocks when another block falls back locally", async () => {
    let calls = 0
    const fetcher = (async () => {
      calls += 1
      if (calls >= 2) throw new DOMException("This operation was aborted", "AbortError")
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          items: [{
            sourceLine: "17 Pro 256GB Branco R$ 8.000",
            sourceSection: "IPHONES LACRADOS",
            category: "iphone",
            brand: "Apple",
            model: "iPhone 17 Pro",
            variant: null,
            storage: "256GB",
            size: null,
            color: "Branco",
            condition: "sealed",
            internalGrade: null,
            batteryHealth: null,
            warrantyType: "apple",
            warrantyLabel: "Garantia Apple 1 ano",
            warrantyUntil: null,
            origin: null,
            supplierPrice: 8000,
            availability: "available",
            confidence: "high",
            warnings: [],
          }],
        }),
      }), { status: 200 })
    }) as typeof fetch

    const result = await parseSupplierOffersWithAI(`
      IPHONES LACRADOS
      17 Pro 256GB Branco R$ 8.000
      SEMINOVOS ATUALIZADOS
      iPhone 13 128GB Preto bateria 100% R$ 2.050
    `, "supplier-1", { apiKey: "test-key", fetcher, timeoutMs: 1000 })

    assert.equal(result.parserMode, "hybrid")
    assert.equal(result.aiSucceeded, true)
    assert.equal(result.aiFailedBlocks, 1)
    assert.equal(result.localFallbackBlocks, 1)
    assert.ok(result.items.some((item) => item.parserSource === "ai" && item.confidence === "high"))
    assert.ok(result.items.some((item) => item.parserSource === "local" && item.confidence !== "high"))
  })

  it("normalizes supplier colors without emojis", () => {
    assert.equal(normalizeSupplierColor("🖤Preto"), "Preto")
    assert.equal(normalizeSupplierColor("🤍 Branco"), "Branco")
    assert.equal(normalizeSupplierColor("💜roxo"), "Roxo")
    assert.equal(normalizeSupplierColor("✨Lunar Gold"), "Lunar Gold")
    assert.equal(normalizeSupplierColor("🖤Midnight"), "Midnight")
  })

  it("structures Apple warranty month labels", () => {
    const warranty = normalizeWarranty("Garantia Apple Out/26")
    assert.equal(warranty.warrantyType, "apple")
    assert.equal(warranty.warrantyLabel, "Garantia Apple Out/26")
    assert.equal(warranty.warrantyUntil, "2026-10")
  })

  it("inherits Apple one-year warranty from sealed section", () => {
    const [item] = parseSupplierOffersFallback(`
      IPHONES LACRADOS
      Todos lacrados com 1 ano de garantia Apple
      17 Pro 256GB Branco R$ 8.000
    `)
    assert.equal(item.warrantyType, "apple")
    assert.equal(item.warrantyLabel, "Garantia Apple 1 ano")
  })

  it("does not require battery for sealed products", () => {
    const [item] = parseSupplierOffersFallback("IPHONES LACRADOS\n17 Pro 256GB Branco R$ 8.000")
    assert.equal(item.batteryHealth, null)
    assert.equal(classifySupplierOfferReview(item), "ready")
  })

  it("does not require storage or battery for gadgets", () => {
    const [item] = parseSupplierOffersFallback("GADGETS\nStarlink Mini R$ 900")
    assert.equal(item.category, "gadgets")
    assert.equal(item.storage, null)
    assert.equal(item.batteryHealth, null)
    assert.equal(classifySupplierOfferReview(item), "ready")
  })

  it("uses size for watches and not storage", () => {
    const [item] = parseSupplierOffersFallback("RELÓGIOS NOVOS\nGarmin Forerunner 55 42mm Preto R$ 1.100")
    assert.equal(item.category, "garmin")
    assert.equal(item.size, "42mm")
    assert.equal(item.storage, null)
  })

  it("keeps battery health for used iPhones when present", () => {
    const [item] = parseSupplierOffersFallback("SEMINOVOS\niPhone 13 128GB Preto bateria 100% R$ 2.050")
    assert.equal(item.batteryHealth, 100)
  })

  it("classifies complete items as ready and missing price as needs review", () => {
    const [ready] = parseSupplierOffersFallback("IPHONES LACRADOS\niPhone 17 256GB Branco R$ 5.100")
    const [needsReview] = parseSupplierOffersFallback("IPHONES LACRADOS\niPhone 17 256GB Branco")
    assert.equal(classifySupplierOfferReview(ready), "ready")
    assert.equal(classifySupplierOfferReview(needsReview), "needs_review")
  })

  it("does not mark every complete item in a long batch as needs_review", () => {
    const rawText = Array.from({ length: 32 }, (_, index) => `iPhone 13 128GB Preto R$ ${2050 + index}`).join("\n")
    const items = parseSupplierOffersFallback(`IPHONES LACRADOS\n${rawText}`)
    assert.equal(items.length, 32)
    assert.equal(items.filter((item) => classifySupplierOfferReview(item) === "needs_review").length, 0)
    assert.equal(items.every((item) => item.confidence !== "high"), true)
  })

  it("does not leak WhatsApp section context between independent messages", () => {
    const items = parseSupplierOffersFallback(`
      [17/05/2026, 13:13:52] Miami Atacado: ✨ IPHONES LACRADOS
      Todos lacrados com 1 ano de garantia Apple
      📲 17 256GB
      🤍 Branco
      💙 Azul
      🖤 Preto
      💚 Verde
      💰 R$ 5.100

      ✨ IPHONES SEMINOVOS
      🔥 16 256 - 91%
      💙 Azul - 💰R$4.100
      [17/05/2026, 13:25:40] Miami Atacado: 📲 17 256GB
      🖤 Preto
      💰 R$ 5.100
    `, "miami")

    const repeated = items.find((item) => item.model === "iPhone 17" && item.storage === "256GB" && item.color === "Preto" && !item.sourceSection)
    assert.equal(repeated?.condition, "unknown")
    assert.equal(repeated?.duplicateCandidate, true)
  })

  it("keeps iPhone 17 256GB colors sealed inside IPHONES LACRADOS", () => {
    const items = parseSupplierOffersFallback(`
      ✨ IPHONES LACRADOS
      Todos lacrados com 1 ano de garantia Apple
      📲 17 256GB
      🤍 Branco
      💙 Azul
      🖤 Preto
      💚 Verde
      💰 R$ 5.100
    `, "miami")

    assert.equal(items.length, 4)
    assert.deepEqual(items.map((item) => item.color), ["Branco", "Azul", "Preto", "Verde"])
    assert.ok(items.every((item) => item.model === "iPhone 17"))
    assert.ok(items.every((item) => item.condition === "sealed"))
    assert.ok(items.every((item) => item.warrantyType === "apple"))
    assert.ok(items.every((item) => item.warrantyLabel === "Garantia Apple 1 ano"))
    assert.ok(items.every((item) => item.supplierPrice === 5100))
    assert.ok(items.every((item) => !item.warnings.some((warning) => /bateria/i.test(warning))))
  })

  it("maps IPHONES AMERICANOS GRADE A+ to used internal grade and american origin", () => {
    const items = parseSupplierOffersFallback(`
      🇺🇸 IPHONES AMERICANOS (GRADE A+)
      🔥 17 PRO 256GB - 100%
      Garantia apple
      💙 Azul
      🧡 Laranja
      💰 R$ 6.800
    `)

    assert.equal(items.length, 2)
    assert.ok(items.every((item) => item.condition === "used"))
    assert.ok(items.every((item) => item.internalGrade === "A+"))
    assert.ok(items.every((item) => item.origin === "americano"))
    assert.ok(items.every((item) => item.batteryHealth === 100))
    assert.ok(items.every((item) => item.warrantyType === "apple"))
    assert.deepEqual(items.map((item) => item.color), ["Azul", "Laranja"])
  })

  it("keeps the explicit list item as the better duplicate context", () => {
    const items = parseSupplierOffersFallback(`
      [17/05/2026, 13:13:52] Miami Atacado: ✨ IPHONES LACRADOS
      Todos lacrados com 1 ano de garantia Apple
      📲 17 256GB
      🖤 Preto
      💰 R$ 5.100
      [17/05/2026, 13:25:40] Miami Atacado: 📲 17 256GB
      🖤 Preto
      💰 R$ 5.100
    `, "miami")

    assert.equal(items.length, 2)
    const [main, repeated] = items
    assert.equal(main.sourceSection, "IPHONES LACRADOS")
    assert.equal(main.condition, "sealed")
    assert.equal(main.warrantyType, "apple")
    assert.equal(repeated.sourceSection, null)
    assert.equal(repeated.duplicateCandidate, true)
    assert.equal(main.duplicateCandidate, true)
  })

  it("covers the Miami context regression for sealed, american and used sections", () => {
    const items = parseSupplierOffersFallback(`
      [17/05/2026, 13:13:52] Miami Atacado: ✨ IPHONES LACRADOS
      Todos lacrados com 1 ano de garantia Apple
      📲 17 256GB
      🤍 Branco
      💙 Azul
      🖤 Preto
      💚 Verde
      💰 R$ 5.100

      🇺🇸 IPHONES AMERICANOS (GRADE A+)
      🔥 17 PRO MAX 256GB - 100%
      Garantia apple
      💙 Azul
      💰 R$ 7.800

      ✨ IPHONES SEMINOVOS
      🔥 16 256 - 91%
      💙 Azul - 💰R$4.100
      📲14 PRO MAX -88%🔋
      💜roxo -💰R$ 3.500

      [17/05/2026, 13:25:40] Miami Atacado: 📲 17 256GB
      🖤 Preto
      💰 R$ 5.100
    `, "miami")

    const sealed17 = items.filter((item) => item.model === "iPhone 17" && item.storage === "256GB" && item.supplierPrice === 5100 && item.sourceSection === "IPHONES LACRADOS")
    assert.equal(sealed17.length, 4)
    assert.deepEqual(sealed17.map((item) => item.color), ["Branco", "Azul", "Preto", "Verde"])
    assert.ok(sealed17.every((item) => item.condition === "sealed"))
    assert.ok(sealed17.every((item) => item.warrantyType === "apple"))
    assert.ok(sealed17.every((item) => !item.warnings.some((warning) => /bateria/i.test(warning))))

    const american = items.find((item) => item.model === "iPhone 17 Pro Max" && item.storage === "256GB" && item.color === "Azul")
    assert.equal(american?.condition, "used")
    assert.equal(american?.internalGrade, "A+")
    assert.equal(american?.origin, "americano")
    assert.equal(american?.batteryHealth, 100)
    assert.equal(american?.warrantyType, "apple")
    assert.equal(american?.supplierPrice, 7800)

    const used16 = items.find((item) => item.model === "iPhone 16" && item.storage === "256GB" && item.color === "Azul")
    assert.equal(used16?.condition, "used")
    assert.equal(used16?.batteryHealth, 91)
    assert.equal(used16?.supplierPrice, 4100)

    const used14 = items.find((item) => item.model === "iPhone 14 Pro Max" && item.color === "Roxo")
    assert.equal(used14?.condition, "used")
    assert.equal(used14?.batteryHealth, 88)
    assert.equal(used14?.supplierPrice, 3500)

    assert.equal(sealed17.some((item) => item.condition === "used"), false)
  })
})
