import assert from "node:assert/strict"
import {
  buildDynamicStories,
  formatVisualDiscount,
  getVisualDiscountPercent,
  type ProductFacts,
  type GeneralStrategy,
} from "@/lib/marketing/copy-generator"
import { renderStoryToSVG } from "./story-svg"
import { wrapText, fitPriceFontSize, calcCardLayout } from "./story-layout"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_STRATEGY: GeneralStrategy = {
  objective: "sell_fast",
  channel: "stories",
  tone: "consultivo",
  urgencyLevel: "none",
  generalCta: "",
  generalNote: "",
  angle: "",
  addHighlightStory: false,
  addCtaStory: false,
}

function makeFact(overrides: Partial<ProductFacts> & { id: string; name: string }): ProductFacts {
  return {
    storage: null,
    color: null,
    grade: null,
    battery_health: null,
    quantity: 5,
    basePrice: 1000,
    disclosurePrice: 900,
    discount: null,
    installment: null,
    gifts: "",
    warrantyLabel: "",
    warrantySource: null,
    copyTitle: "",
    copyDescription: "",
    copyStrongPoint: "",
    copyObjection: "",
    productNote: "",
    productCta: "",
    isPrimary: false,
    isFeatured: false,
    ...overrides,
  }
}

// ─── Real-data fixtures from spec ─────────────────────────────────────────────

const iPad128Rosa: ProductFacts = makeFact({
  id: "ipad-rosa",
  name: "iPad (11ª geração)",
  storage: "128GB",
  color: "Rosa",
  grade: "Lacrado",
  battery_health: 100,
  quantity: 1,
  basePrice: 2750,
  disclosurePrice: 2649,
  gifts: "capa + película",
  warrantyLabel: "Garantia Apple 1 ano",
  warrantySource: "inventory",
  installment: {
    count: 18,
    text: "18x de R$ 174,51",
    perInstallment: 174.51,
    total: 3141.18,
    fee: 0,
    hasFee: false,
  },
  isPrimary: true,
  isFeatured: false,
})

const iPhone13Midnight: ProductFacts = makeFact({
  id: "iphone13-midnight",
  name: "iPhone 13",
  storage: "128GB",
  color: "Midnight",
  grade: "Lacrado",
  battery_health: 100,
  quantity: 1,
  basePrice: null,
  disclosurePrice: 2900,
  gifts: "",
  warrantyLabel: "Garantia Nobretech 6 meses",
  warrantySource: "manual",
  installment: {
    count: 18,
    text: "18x de R$ 191,05",
    perInstallment: 191.05,
    total: 3438.9,
    fee: 0,
    hasFee: false,
  },
  isPrimary: false,
  isFeatured: false,
})

const bothFacts = [iPad128Rosa, iPhone13Midnight]

const realStoryCase: ProductFacts[] = [
  makeFact({
    id: "real-iphone13",
    name: "iPhone 13",
    storage: "128GB",
    color: "Midnight",
    grade: "Lacrado",
    battery_health: 100,
    quantity: 1,
    basePrice: 2900,
    disclosurePrice: 2799,
    discount: { amount: 101, percent: 3.5 },
    warrantyLabel: "Garantia Nobretech 6 meses",
    warrantySource: "manual",
    installment: {
      count: 18,
      text: "18x de R$ 184,39",
      perInstallment: 184.39,
      total: 3319.02,
      fee: 0,
      hasFee: false,
    },
    isPrimary: true,
  }),
  makeFact({
    id: "real-ipad-rosa",
    name: "iPad (11ª geração)",
    storage: "128GB",
    color: "Rosa",
    grade: "Lacrado",
    battery_health: 100,
    quantity: 1,
    basePrice: 2750,
    disclosurePrice: 2750,
  }),
  makeFact({
    id: "real-ipad-prateado",
    name: "iPad (11ª geração)",
    storage: "128GB",
    color: "Prateado",
    grade: "Lacrado",
    battery_health: 100,
    quantity: 1,
    basePrice: 2750,
    disclosurePrice: 2750,
  }),
]

// ─── Test 1: SVG has correct dimensions ───────────────────────────────────────

{
  const stories = buildDynamicStories([makeFact({ id: "t1", name: "iPhone 14", isPrimary: true })], BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  assert.ok(vitrine, "vitrine story exists")
  const svg = renderStoryToSVG(vitrine)
  assert.ok(/width="1080"/.test(svg), `SVG width=1080: ${svg.slice(0, 200)}`)
  assert.ok(/height="1920"/.test(svg), "SVG height=1920")
  assert.ok(/viewBox="0 0 1080 1920"/.test(svg), "SVG viewBox correct")
}

// ─── Test 2: Card with warrantyLabel renders warranty line in SVG ──────────────

{
  const f = makeFact({ id: "t2", name: "iPhone 13", grade: "A", warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: true })
  const stories = buildDynamicStories([f], BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const svg = renderStoryToSVG(vitrine)
  assert.ok(/Garantia Nobretech/i.test(svg), `warranty line in SVG: expected to find 'Garantia Nobretech'`)
}

// ─── Test 3: Card with gifts renders kit line in SVG ──────────────────────────

{
  const f = makeFact({ id: "t3", name: "iPad 11", grade: "Lacrado", gifts: "capa + película", isPrimary: true })
  const stories = buildDynamicStories([f], BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const svg = renderStoryToSVG(vitrine)
  assert.ok(/capa/i.test(svg), `kit line in SVG: expected 'capa': ${svg.slice(0, 300)}`)
}

// ─── Test 4: Apple warranty stays Apple, not converted to Nobretech ───────────

{
  const f = makeFact({ id: "t4", name: "iPhone 14", grade: "Lacrado", warrantyLabel: "Garantia Apple 1 ano", isPrimary: true })
  const stories = buildDynamicStories([f], BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const svg = renderStoryToSVG(vitrine)
  assert.ok(/Garantia Apple/i.test(svg), "Apple warranty in SVG")
  // Should NOT appear with "Nobretech" label where Apple should be
  const warrantyCtx = svg.match(/Garantia[^<]*/g) ?? []
  const hasWrongLabel = warrantyCtx.some((m) => /nobretech/i.test(m) && !/apple/i.test(m))
  assert.ok(!hasWrongLabel, `Apple warranty must not be relabeled to Nobretech: ${warrantyCtx.join(", ")}`)
}

// ─── Test 5: Nobretech warranty stays Nobretech ───────────────────────────────

{
  const f = makeFact({ id: "t5", name: "iPhone 13", grade: "A", warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: true })
  const stories = buildDynamicStories([f], BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const svg = renderStoryToSVG(vitrine)
  assert.ok(/Garantia Nobretech/i.test(svg), "Nobretech warranty in SVG")
}

// ─── Test 6: Long price text reduces font size ────────────────────────────────

{
  // "R$ 12.999,99" = 13 chars; at base=68 with col=300: floor(300/(13*0.53)) = floor(300/6.89) = 43
  const fitted = fitPriceFontSize("R$ 12.999,99", 300, 68)
  assert.ok(fitted < 68, `long price reduces font: ${fitted} < 68`)
  assert.ok(fitted >= 28, `font stays >= min 28: ${fitted}`)

  // Short price "R$ 900,00" (9 chars): floor(300/(9*0.53)) = floor(300/4.77) = 62
  const fittedShort = fitPriceFontSize("R$ 900,00", 300, 68)
  assert.ok(fittedShort <= 68, `short price caps at base: ${fittedShort}`)
}

// ─── Test 7: 4 rich products produce >= 2 vitrine stories ─────────────────────

{
  const richFacts = Array.from({ length: 4 }, (_, i) =>
    makeFact({
      id: `rich-${i}`,
      name: `iPhone 14 Pro Max`,
      storage: "256GB",
      grade: "A",
      battery_health: 95,
      warrantyLabel: "Garantia Apple 1 ano",
      isPrimary: i === 0,
    })
  )
  const stories = buildDynamicStories(richFacts, { ...BASE_STRATEGY, addCtaStory: false })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.ok(vitrines.length >= 2, `4 rich products → ≥2 vitrine stories, got ${vitrines.length}`)
}

// ─── Test 8: Multi-product CTA has no individual prices ───────────────────────

{
  const stories = buildDynamicStories(bothFacts, { ...BASE_STRATEGY, addCtaStory: true })
  const cta = stories.find((s) => s.kind === "cta")!
  assert.ok(cta, "cta story exists for multi-product")
  assert.equal(cta.price, null, "multi-product cta: no individual price")
  assert.equal(cta.parcel, null, "multi-product cta: no individual parcel")

  const ctaSvg = renderStoryToSVG(cta)
  // Individual prices must NOT appear in multi-product CTA SVG
  assert.ok(!/2\.649/.test(ctaSvg), "iPad individual price must not appear in multi-product CTA SVG")
  assert.ok(!/2\.900/.test(ctaSvg), "iPhone individual price must not appear in multi-product CTA SVG")
  // CTA should have a closing message and CTA button
  assert.ok(ctaSvg.length > 200, "CTA SVG has content")
}

// ─── Test 9: All selected products appear in some vitrine story ───────────────

{
  const stories = buildDynamicStories(bothFacts, BASE_STRATEGY)
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  const allProductIds = new Set(
    vitrines.flatMap((v) => (v.vitrineProducts ?? []).map((p) => p.productId))
  )
  for (const f of bothFacts) {
    assert.ok(allProductIds.has(f.id), `Product ${f.id} must appear in some vitrine story`)
  }
}

// ─── Test 9b: Real-data SVG contains iPad warranty and kit ───────────────────

{
  const stories = buildDynamicStories(bothFacts, BASE_STRATEGY)
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  const allSvg = vitrines.map((v) => renderStoryToSVG(v)).join("\n")

  assert.ok(/Garantia Apple/i.test(allSvg), "iPad: Garantia Apple in vitrine SVG")
  assert.ok(/capa/i.test(allSvg), "iPad: capa (kit) in vitrine SVG")
  assert.ok(/Garantia Nobretech/i.test(allSvg), "iPhone: Garantia Nobretech in vitrine SVG")
  assert.ok(/2\.649/.test(allSvg), "iPad disclosure price in vitrine SVG")
  assert.ok(/2\.900/.test(allSvg), "iPhone price in vitrine SVG")
  assert.ok(/174/.test(allSvg), "iPad parcel in vitrine SVG")
  assert.ok(/191/.test(allSvg), "iPhone parcel in vitrine SVG")
}

// ─── Test: wrapText never exceeds maxLines ────────────────────────────────────

{
  const lines = wrapText("iPad (11ª geração) 128GB Rosa Especial Edição Limitada Premium", 560, 44, 2)
  assert.ok(lines.length <= 2, `wrapText respects maxLines: ${lines.length}`)
  assert.ok(lines.length >= 1, "wrapText returns at least 1 line")
  for (const line of lines) {
    assert.ok(line.length > 0, "no empty lines from wrapText")
  }
}

// ─── Test: calcCardLayout heights are positive and reasonable ─────────────────

{
  const stories = buildDynamicStories(bothFacts, BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  for (const item of vitrine.vitrineProducts ?? []) {
    const layout = calcCardLayout(item)
    assert.ok(layout.height > 80, `card height > 80: ${item.name} → ${layout.height}`)
    assert.ok(layout.height < 700, `card height < 700: ${item.name} → ${layout.height}`)
    assert.ok(layout.nameLines.length >= 1, "at least 1 name line")
    assert.ok(layout.nameLines.length <= 2, "at most 2 name lines")
  }
}

// ─── Test: rich product card is taller than a simple product card ─────────────

{
  const richStories = buildDynamicStories([realStoryCase[0]], BASE_STRATEGY)
  const richItem = richStories.find((s) => s.kind === "vitrine")!.vitrineProducts![0]
  const simpleStories = buildDynamicStories([makeFact({ id: "simple-height", name: "Cabo USB-C", isPrimary: true })], BASE_STRATEGY)
  const simpleItem = simpleStories.find((s) => s.kind === "vitrine")!.vitrineProducts![0]

  const richLayout = calcCardLayout(richItem, { productCount: 3 })
  const simpleLayout = calcCardLayout(simpleItem, { productCount: 3 })
  assert.ok(
    richLayout.height > simpleLayout.height,
    `rich product card height should be bigger: rich=${richLayout.height}, simple=${simpleLayout.height}`
  )
}

// ─── Test: single-product vitrine uses hero-height card ──────────────────────

{
  const stories = buildDynamicStories([realStoryCase[0]], BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const item = vitrine.vitrineProducts![0]
  const layout = calcCardLayout(item, { productCount: 1 })
  assert.ok(layout.height >= 500, `single-product card should render as hero card: ${layout.height}`)
}

// ─── Test: two-product vitrine cards are taller than three-product cards ──────

{
  const stories = buildDynamicStories(realStoryCase, BASE_STRATEGY)
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const item = vitrine.vitrineProducts![0]
  const twoProductLayout = calcCardLayout(item, { productCount: 2 })
  const threeProductLayout = calcCardLayout(item, { productCount: 3 })
  assert.ok(
    twoProductLayout.height > threeProductLayout.height,
    `2-product cards should be taller than 3-product cards: two=${twoProductLayout.height}, three=${threeProductLayout.height}`
  )
}

// ─── Test: real 3-product story keeps commercial facts readable ───────────────

{
  const stories = buildDynamicStories(realStoryCase, { ...BASE_STRATEGY, addHighlightStory: true, addCtaStory: true })
  const allSvg = stories.map((s) => renderStoryToSVG(s)).join("\n")
  assert.ok(/iPhone 13/.test(allSvg) && /Midnight/.test(allSvg), "real case: iPhone name tokens appear intact")
  assert.ok(/iPad \(11ª geração\)/.test(allSvg) && /Rosa/.test(allSvg), "real case: pink iPad name tokens appear intact")
  assert.ok(/iPad \(11ª geração\)/.test(allSvg) && /Prateado/.test(allSvg), "real case: silver iPad name tokens appear intact")
  assert.ok(/Garantia Nobretech 6m/.test(allSvg), "real case: warranty stays inside product card")
  assert.ok(/18x de R\$ 184,39/.test(allSvg), "real case: installment appears under the offer price")
  assert.ok(!/iPhone13/.test(allSvg), "real case: no glued iPhone name")
  assert.ok(!/128GBMidnight/.test(allSvg), "real case: no glued storage/color")
}

// ─── Test: wrapText handles \n as forced line-break ─────────────────────────

{
  const lines = wrapText("Disponíveis\nhoje", 952, 76, 2)
  assert.equal(lines.length, 2, `\\n produces 2 lines: ${lines.join("|")}`)
  assert.equal(lines[0], "Disponíveis", `first segment: ${lines[0]}`)
  assert.equal(lines[1], "hoje", `second segment: ${lines[1]}`)
}

{
  const lines = wrapText("Mais opções\nno estoque", 952, 76, 2)
  assert.equal(lines.length, 2, `\\n produces 2 lines: ${lines.join("|")}`)
  assert.equal(lines[0], "Mais opções", `first segment: ${lines[0]}`)
  assert.equal(lines[1], "no estoque", `second segment: ${lines[1]}`)
}

{
  const lines = wrapText("Por que esse\niPhone 13 sai rápido?", 952, 76, 2)
  assert.equal(lines.length, 2, `\\n produces 2 lines: ${lines.join("|")}`)
  assert.equal(lines[0], "Por que esse", `first segment: ${lines[0]}`)
  assert.ok(lines[1].startsWith("iPhone"), `second segment starts with iPhone: ${lines[1]}`)
}

// ─── Test: highlight headline keeps third-line closing words ─────────────────

{
  const baseProduct = makeFact({
    id: "headline-fast",
    name: "iPhone 13",
    storage: "128GB",
    color: "Midnight",
    grade: "Lacrado",
    battery_health: 100,
    quantity: 1,
    warrantyLabel: "Garantia Nobretech 6 meses",
    isPrimary: true,
  })

  const fastStories = buildDynamicStories([baseProduct], {
    ...BASE_STRATEGY,
    objective: "sell_fast",
    addHighlightStory: true,
  })
  const fastHighlight = fastStories.find((s) => s.kind === "highlight")!
  const fastSvg = renderStoryToSVG(fastHighlight)
  assert.ok(/rápido\?/.test(fastSvg), "highlight sell_fast keeps 'rápido?'")

  const desireStories = buildDynamicStories([baseProduct], {
    ...BASE_STRATEGY,
    objective: "generate_desire",
    addHighlightStory: true,
  })
  const desireHighlight = desireStories.find((s) => s.kind === "highlight")!
  const desireSvg = renderStoryToSVG(desireHighlight)
  assert.ok(/atenção\?/.test(desireSvg), "highlight generate_desire keeps 'atenção?'")
}

// ─── Test: vitrine SVG has no concatenated headline words ────────────────────

{
  const facts = [
    makeFact({ id: "v1", name: "iPhone 13", storage: "128GB", color: "Midnight", grade: "A", isPrimary: true }),
    makeFact({ id: "v2", name: "iPad", storage: "128GB", color: "Rosa", grade: "Lacrado" }),
  ]
  const stories = buildDynamicStories(facts, BASE_STRATEGY)
  const allSvg = stories.filter((s) => s.kind === "vitrine").map((s) => renderStoryToSVG(s)).join("\n")
  assert.ok(!/Disponíveishoje/.test(allSvg), "vitrine SVG: no 'Disponíveishoje' concatenation")
  assert.ok(!/opçõesno/.test(allSvg), "vitrine SVG: no 'opçõesno' concatenation")
  assert.ok(!/esseiPhone/.test(allSvg), "vitrine SVG: no 'esseiPhone' concatenation")
}

// ─── Test: CTA SVG headline is centered, no individual prices ─────────────────

{
  const stories = buildDynamicStories(bothFacts, { ...BASE_STRATEGY, addCtaStory: true })
  const cta = stories.find((s) => s.kind === "cta")!
  assert.ok(cta, "cta story exists")
  const svg = renderStoryToSVG(cta)
  assert.ok(/text-anchor="middle"/.test(svg), "CTA SVG: headline uses text-anchor=middle")
  assert.ok(!/2\.649/.test(svg), "CTA SVG: iPad price must not appear")
  assert.ok(!/2\.900/.test(svg), "CTA SVG: iPhone price must not appear")
  assert.ok(svg.length > 200, "CTA SVG has content")
}

// ─── Test: visual discount below 5% is hidden everywhere ─────────────────────

{
  const smallDiscount = makeFact({
    id: "small-discount",
    name: "iPhone 15 Pro 128GB Natural Titanium",
    grade: "A+",
    battery_health: 88,
    quantity: 1,
    basePrice: 3799,
    disclosurePrice: 3699,
    discount: { amount: 100, percent: 3 },
    isPrimary: true,
  })
  assert.equal(getVisualDiscountPercent(3799, 3699), null, "2.63% visual discount is hidden")

  const stories = buildDynamicStories([smallDiscount], { ...BASE_STRATEGY, addHighlightStory: true })
  const allSvg = stories.map((s) => renderStoryToSVG(s)).join("\n")
  assert.ok(!/3% off/i.test(allSvg), "small discount must not render 3% off")
  assert.ok(!/2\.6% off/i.test(allSvg), "small discount must not render 2.6% off")
  assert.ok(!/1% off/i.test(allSvg), "small discount must not render 1% off")
  assert.ok(!/% off/i.test(allSvg), "small discount must not render any off badge")
  assert.ok(/3\.799,00/.test(allSvg) && /3\.699,00/.test(allSvg), "small discount keeps de/por prices")
}

// ─── Test: visual discount above 5% is consistent in vitrine and highlight ───

{
  const strongDiscount = makeFact({
    id: "strong-discount",
    name: "iPhone 14 128GB Roxo",
    grade: "A",
    battery_health: 93,
    quantity: 1,
    basePrice: 2490,
    disclosurePrice: 2290,
    // Intentional stale percent: visual output must recalculate from prices.
    discount: { amount: 200, percent: 1 },
    isPrimary: true,
  })
  const visual = getVisualDiscountPercent(2490, 2290)
  assert.equal(visual, 8, "2490 → 2290 visual discount rounds to 8%")
  assert.equal(formatVisualDiscount(visual!), "8%", "integer percent formats without decimal")

  const stories = buildDynamicStories([strongDiscount], { ...BASE_STRATEGY, addHighlightStory: true })
  const vitrineSvg = renderStoryToSVG(stories.find((s) => s.kind === "vitrine")!)
  const highlightSvg = renderStoryToSVG(stories.find((s) => s.kind === "highlight")!)
  const vitrineDiscounts = vitrineSvg.match(/\d+(?:\.\d)?% off/g) ?? []
  const highlightDiscounts = highlightSvg.match(/\d+(?:\.\d)?% off/g) ?? []
  assert.deepEqual(vitrineDiscounts, ["8% off"], `vitrine discount uses recalculated percent: ${vitrineDiscounts.join(",")}`)
  assert.deepEqual(highlightDiscounts, ["8% off"], `highlight discount uses same percent: ${highlightDiscounts.join(",")}`)
  assert.ok(!/1% off/.test(vitrineSvg + highlightSvg), "stale discount.percent is not rendered")
}

// ─── Test: highlight/card product names preserve commercial variants ─────────

{
  const iphone15Pro = makeFact({
    id: "iphone15-pro",
    name: "iPhone 15 Pro 128GB Natural Titanium",
    grade: "A+",
    battery_health: 88,
    quantity: 1,
    basePrice: 3799,
    disclosurePrice: 3699,
    discount: { amount: 100, percent: 3 },
    isPrimary: true,
  })
  const stories = buildDynamicStories([iphone15Pro], { ...BASE_STRATEGY, addHighlightStory: true })
  const highlightSvg = renderStoryToSVG(stories.find((s) => s.kind === "highlight")!)
  assert.ok(/iPhone 15 Pro/.test(highlightSvg), "highlight keeps Pro in the visual name")
  assert.ok(!/iPhone 15 sai rápido/.test(highlightSvg), "highlight never collapses iPhone 15 Pro to iPhone 15")
  assert.ok(/128GB/.test(highlightSvg), "highlight card keeps storage")
  assert.ok(/Natural|Titanium/.test(highlightSvg), "highlight card keeps color when present")
}

{
  const iphone15ProMax = makeFact({
    id: "iphone15-promax",
    name: "iPhone 15 Pro Max 256GB Titânio Natural",
    grade: "A+",
    battery_health: 90,
    quantity: 1,
    basePrice: 5490,
    disclosurePrice: 4990,
    discount: { amount: 500, percent: 9.1 },
    isPrimary: true,
  })
  const stories = buildDynamicStories([iphone15ProMax], { ...BASE_STRATEGY, addHighlightStory: true })
  const highlightSvg = renderStoryToSVG(stories.find((s) => s.kind === "highlight")!)
  assert.ok(/Pro Max/.test(highlightSvg), "highlight keeps Pro Max")
  assert.ok(!/iPhone 15 sai rápido/.test(highlightSvg), "highlight never collapses iPhone 15 Pro Max to iPhone 15")
  assert.ok(/256GB/.test(highlightSvg), "highlight card keeps storage for Pro Max")
}

console.log("story-renderer SVG tests passed")
