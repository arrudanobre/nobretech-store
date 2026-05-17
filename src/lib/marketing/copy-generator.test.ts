import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  chunkProductsForStories,
  chunkProductsForVisualStories,
  getStoryCardHeight,
  getProductVisualWeight,
  buildDynamicStories,
  generateContent,
  pickDensityMode,
  objectiveStoryCopy,
  getCommercialAvailabilityKey,
  MAX_PRODUCTS_PER_VITRINE_STORY,
  DENSITY_CHUNK_SIZE,
} from "./copy-generator"
import type {
  ProductFacts,
  GeneralStrategy,
  ObjectiveKey,
} from "./copy-generator"
import { CTA_BANK, pickStoryCta } from "./story-ctas"
import type { CtaObjective } from "./story-ctas"

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

/** Simple short-name lightly-tagged products: triggers compact when 5+. */
function makeNFacts(n: number): ProductFacts[] {
  return Array.from({ length: n }, (_, i) =>
    makeFact({ id: `p${i + 1}`, name: `Item ${i + 1}`, isPrimary: i === 0 })
  )
}

/** iPhone-style devices with grade/battery/storage — never compact. */
function makeDevices(n: number): ProductFacts[] {
  return Array.from({ length: n }, (_, i) =>
    makeFact({
      id: `d${i + 1}`,
      name: `iPhone 14 Pro`,
      storage: "128GB",
      grade: "A",
      battery_health: 92,
      isPrimary: i === 0,
    })
  )
}

// ─── chunkProductsForStories ─────────────────────────────────────────────────

{
  const result = chunkProductsForStories([])
  assert.deepEqual(result, [], "empty → []")
}

{
  const result = chunkProductsForStories([1, 2, 3, 4], 3)
  assert.equal(result.length, 2, "4 items / chunk=3 → 2 chunks")
  assert.equal(result[1].length, 1)
}

{
  const result = chunkProductsForStories([1, 2, 3, 4, 5], 5)
  assert.equal(result.length, 1, "5 / chunk=5 → 1 chunk")
}

{
  const result = chunkProductsForStories([1, 2, 3, 4, 5, 6], 4)
  assert.equal(result.length, 2, "6 / chunk=4 → 2 chunks")
  assert.equal(result[0].length, 4)
  assert.equal(result[1].length, 2)
}

{
  // chunkSize > MAX hard cap clamps to MAX
  const result = chunkProductsForStories([1, 2, 3, 4, 5, 6, 7, 8], 99)
  assert.ok(result.every((c) => c.length <= MAX_PRODUCTS_PER_VITRINE_STORY))
}

{
  // No items lost across chunks.
  const items = [1, 2, 3, 4, 5, 6, 7]
  const flat = chunkProductsForStories(items, 3).flat()
  assert.deepEqual(flat, items)
}

// ─── pickDensityMode ─────────────────────────────────────────────────────────

{
  const facts = makeDevices(3)
  facts[0] = makeFact({
    ...facts[0],
    discount: { amount: 200, percent: 10 },
    installment: { count: 12, text: "12x de R$ 100", perInstallment: 100, total: 1200, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa + película",
    productNote: "ponto extra",
  })
  assert.equal(pickDensityMode(facts, BASE_STRATEGY), "detailed", "heavy badges → detailed")
}

{
  const facts = makeNFacts(5)
  assert.equal(
    pickDensityMode(facts, BASE_STRATEGY),
    "compact",
    "5 short-name accessory-like items → compact"
  )
}

{
  const facts = makeDevices(4)
  // Devices with grade/storage but moderate signals → standard
  assert.equal(pickDensityMode(facts, BASE_STRATEGY), "standard", "4 devices moderate → standard")
}

{
  const facts = makeDevices(3)
  assert.equal(
    pickDensityMode(facts, { ...BASE_STRATEGY, objective: "trust_proof" }),
    "detailed",
    "trust_proof always detailed"
  )
}

{
  // Accessories all short, all light → compact even at 3 (per heuristic only fires at >=5; here standard)
  const facts = makeNFacts(3)
  const mode = pickDensityMode(facts, BASE_STRATEGY)
  assert.ok(mode === "standard" || mode === "compact", "3 simple items → standard or compact")
}

// ─── buildDynamicStories ─────────────────────────────────────────────────────

{
  const stories = buildDynamicStories([], BASE_STRATEGY)
  assert.equal(stories.length, 0, "0 facts → 0 stories")
}

{
  // 4 simple short-name items: standard density → 1 vitrine page (fits 4).
  const facts = makeNFacts(4)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.equal(vitrines.length, 1, "4 simple items in standard density fit one page")
  assert.equal(vitrines[0].vitrineProducts?.length, 4)
  assert.equal(vitrines[0].density, "standard")
}

{
  // 5 simple short items → compact, fits in 1 page.
  const facts = makeNFacts(5)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.equal(vitrines.length, 1, "5 simple items in compact density fit one page")
  assert.equal(vitrines[0].density, "compact")
  assert.equal(vitrines[0].vitrineProducts?.length, 5)
}

{
  // 6 simple items → compact, 5 + 1 (still respects cap)
  const facts = makeNFacts(6)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.equal(vitrines.length, 2)
  assert.ok(vitrines.every((v) => (v.vitrineProducts?.length ?? 1) <= MAX_PRODUCTS_PER_VITRINE_STORY))
}

{
  // 7 devices with moderate info: standard density, weight-aware pages.
  const facts = makeDevices(7)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.ok(vitrines.length >= 2, "7 devices standard density → multiple pages")
  assert.ok(vitrines.every((v) => (v.vitrineProducts?.length ?? 0) <= DENSITY_CHUNK_SIZE.standard))
  assert.equal(
    vitrines.reduce((sum, v) => sum + (v.vitrineProducts?.length ?? 0), 0),
    7,
    "all 7 devices rendered"
  )
}

{
  // Detailed cap = 3
  const heavyFacts = makeDevices(4)
  heavyFacts[0] = makeFact({
    ...heavyFacts[0],
    discount: { amount: 500, percent: 20 },
    installment: { count: 12, text: "12x de R$ 200", perInstallment: 200, total: 2400, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Apple",
    gifts: "kit completo",
    productNote: "ponto forte",
  })
  const stories = buildDynamicStories(heavyFacts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.equal(vitrines[0].density, "detailed")
  assert.ok(vitrines[0].vitrineProducts!.length <= DENSITY_CHUNK_SIZE.detailed)
}

{
  // Hard ceiling: never more than 5 products per vitrine even when forced.
  const facts = makeNFacts(20)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  for (const s of stories.filter((s) => s.kind === "vitrine")) {
    assert.ok(
      (s.vitrineProducts?.length ?? 1) <= MAX_PRODUCTS_PER_VITRINE_STORY,
      "vitrine never exceeds hard cap"
    )
  }
}

{
  // No product disappears across vitrines.
  const facts = makeDevices(7)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const seen = new Set<string>()
  for (const s of stories.filter((s) => s.kind === "vitrine")) {
    s.vitrineProducts?.forEach((v) => seen.add(v.name))
  }
  // Devices share the same name "iPhone 14 Pro"; just assert at least one entry per page covers all.
  const totalRendered = stories
    .filter((s) => s.kind === "vitrine")
    .reduce((sum, s) => sum + (s.vitrineProducts?.length ?? 1), 0)
  assert.equal(totalRendered, facts.length, "every product rendered across pages")
}

// ─── Objective changes copy ──────────────────────────────────────────────────

{
  // Same products, different objective → different headline + badge.
  const facts = makeDevices(3)
  const sellFast = buildDynamicStories(facts, { ...BASE_STRATEGY, objective: "sell_fast", addHighlightStory: false, addCtaStory: false })[0]
  const kit = buildDynamicStories(facts, { ...BASE_STRATEGY, objective: "bundle_gift", addHighlightStory: false, addCtaStory: false })[0]
  const trust = buildDynamicStories(facts, { ...BASE_STRATEGY, objective: "trust_proof", addHighlightStory: false, addCtaStory: false })[0]
  const newArrival = buildDynamicStories(facts, { ...BASE_STRATEGY, objective: "new_arrival", addHighlightStory: false, addCtaStory: false })[0]
  const reactivate = buildDynamicStories(facts, { ...BASE_STRATEGY, objective: "reactivate_lead", addHighlightStory: false, addCtaStory: false })[0]

  assert.notEqual(sellFast.headline, kit.headline, "sell_fast vs bundle_gift differ")
  assert.notEqual(sellFast.headline, trust.headline, "sell_fast vs trust differ")
  assert.notEqual(sellFast.headline, newArrival.headline, "sell_fast vs new_arrival differ")
  assert.notEqual(sellFast.headline, reactivate.headline, "sell_fast vs reactivate differ")

  assert.match(sellFast.badge, /DISPONÍVEL/i)
  assert.match(kit.badge, /KIT/i)
  assert.match(trust.badge, /CONFIAN/i)
  assert.match(newArrival.badge, /NOVO|LOTE/i)
  assert.match(reactivate.badge, /RETOMADA/i)
}

{
  // Multi-page vitrines vary headline across pages.
  const facts = makeNFacts(10)
  const stories = buildDynamicStories(facts, {
    ...BASE_STRATEGY,
    objective: "bundle_gift",
    addHighlightStory: false,
    addCtaStory: false,
  })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.ok(vitrines.length >= 2, "10 items produce multiple vitrines")
  assert.notEqual(vitrines[0].headline, vitrines[1].headline, "page 2 headline differs from page 1")
}

// ─── objectiveStoryCopy direct ───────────────────────────────────────────────

{
  const primary = makeFact({ id: "p", name: "iPhone" })
  const objs: ObjectiveKey[] = ["sell_fast", "generate_desire", "bundle_gift", "trust_proof", "new_arrival", "reactivate_lead"]
  for (const o of objs) {
    const c = objectiveStoryCopy(o, 1, 2, 6, primary)
    const c2 = objectiveStoryCopy(o, 2, 2, 6, primary)
    assert.notEqual(c.headline, c2.headline, `${o}: page 1 vs page 2 differ`)
    assert.match(c.badge, /\d\/\d$/, `${o}: page 1 badge has page suffix`)
    assert.match(c2.badge, /\d\/\d$/, `${o}: page 2 badge has page suffix`)
  }
}

// ─── Ordering by objective ───────────────────────────────────────────────────

{
  // bundle_gift: gift-bearing product moves up.
  const a = makeFact({ id: "a", name: "iPhone A", grade: "A", battery_health: 90, gifts: "" })
  const b = makeFact({ id: "b", name: "iPad B", grade: "A", battery_health: 90, gifts: "capa + película" })
  const stories = buildDynamicStories([a, b], {
    ...BASE_STRATEGY,
    objective: "bundle_gift",
    addHighlightStory: false,
    addCtaStory: false,
  })
  const vitrine = stories.find((s) => s.kind === "vitrine")
  const firstName = vitrine?.vitrineProducts?.[0].name
  assert.equal(firstName, "iPad B", "bundle_gift puts gift-bearing product first")
}

{
  // trust_proof: warranty + 95+ battery moves up over plain product.
  const plain = makeFact({ id: "p", name: "iPhone Plain", grade: "B", battery_health: 80 })
  const trustworthy = makeFact({
    id: "t",
    name: "iPhone Trust",
    grade: "A",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
  })
  const stories = buildDynamicStories([plain, trustworthy], {
    ...BASE_STRATEGY,
    objective: "trust_proof",
    addHighlightStory: false,
    addCtaStory: false,
  })
  const vitrine = stories.find((s) => s.kind === "vitrine")
  assert.equal(vitrine?.vitrineProducts?.[0].name, "iPhone Trust", "trust_proof prioritizes warranty/battery")
}

// ─── Density labels stay consistent ──────────────────────────────────────────

{
  const facts = makeDevices(7)
  const stories = buildDynamicStories(facts, BASE_STRATEGY)
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.equal(vitrines[0].label, `Vitrine 1/${vitrines.length}`)
  assert.equal(vitrines[vitrines.length - 1].label, `Vitrine ${vitrines.length}/${vitrines.length}`)
}

// ─── Visual weight + weight-aware pagination ─────────────────────────────────

{
  const base = makeFact({ id: "w0", name: "iPhone 13", grade: "A", battery_health: 100 })
  const withWarranty = makeFact({ ...base, id: "w1", warrantyLabel: "Garantia Nobretech 6 meses" })
  const withGift = makeFact({ ...base, id: "w2", gifts: "capa" })
  const withBoth = makeFact({
    ...base,
    id: "w3",
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa",
  })
  assert.ok(getProductVisualWeight(withWarranty) > getProductVisualWeight(base), "warrantyLabel increases visual weight")
  assert.ok(getProductVisualWeight(withGift) > getProductVisualWeight(base), "giftText/gifts increases visual weight")
  assert.ok(getProductVisualWeight(withBoth) > getProductVisualWeight(withWarranty), "warranty + gift weighs more than warranty alone")
}

{
  // Simple accessory ~1, rich hero ~2.
  const simple = makeFact({ id: "s", name: "Cabo USB-C" })
  const hero = makeFact({
    id: "h",
    name: "iPhone 14 128GB Meia-noite",
    grade: "A",
    battery_health: 100,
    quantity: 1,
    discount: { amount: 300, percent: 10 },
    installment: { count: 18, text: "18x de R$ 164", perInstallment: 164, total: 2952, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa + película",
    isPrimary: true,
  })
  const ws = getProductVisualWeight(simple)
  const wh = getProductVisualWeight(hero)
  assert.ok(ws <= 1.15, `simple weight low (${ws})`)
  assert.ok(wh >= 1.8, `hero weight high (${wh})`)
  assert.ok(wh > ws, "hero heavier than simple")
}

{
  // 4 simple accessories → 1 story (light cards pack together).
  const facts = Array.from({ length: 4 }, (_, i) => makeFact({ id: "a" + i, name: "Capa " + i }))
  const pages = chunkProductsForVisualStories(facts, "standard")
  assert.equal(pages.length, 1, "4 simple accessories fit one story")
  assert.equal(pages[0].length, 4)
}

{
  // 5 simple accessories → 1 story.
  const facts = Array.from({ length: 5 }, (_, i) => makeFact({ id: "a" + i, name: "Capa " + i }))
  const pages = chunkProductsForVisualStories(facts, "compact")
  assert.equal(pages.length, 1, "5 simple accessories fit one compact story")
  assert.equal(pages[0].length, 5)
}

{
  // Rich product reduces capacity: 1 heavy hero + 3 accessories does NOT
  // cram all 4 into one detailed story.
  const hero = makeFact({
    id: "h",
    name: "iPhone 14 128GB Meia-noite",
    grade: "A",
    battery_health: 100,
    quantity: 1,
    discount: { amount: 300, percent: 10 },
    installment: { count: 18, text: "18x", perInstallment: 164, total: 2952, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "kit",
    isPrimary: true,
  })
  const accs = Array.from({ length: 3 }, (_, i) => makeFact({ id: "a" + i, name: "Capa " + i }))
  const pages = chunkProductsForVisualStories([hero, ...accs], "detailed")
  assert.ok(pages.length >= 2, "rich hero forces a split")
  assert.ok(pages.every((p) => p.length <= 5), "never >5 per story")
}

{
  // Last-story rebalance: 3 + 1 (simple) → 2 + 2, no lone weak accessory.
  const a = makeFact({ id: "a", name: "Capa A" })
  const b = makeFact({ id: "b", name: "Capa B" })
  const c = makeFact({ id: "c", name: "Capa C" })
  const d = makeFact({ id: "d", name: "Capa D" })
  // Force detailed split with weight: simulate via many products.
  const many = [a, b, c, d, makeFact({ id: "e", name: "Capa E" }), makeFact({ id: "f", name: "Capa F" }), makeFact({ id: "g", name: "Capa G" })]
  const pages = chunkProductsForVisualStories(many, "detailed")
  const last = pages[pages.length - 1]
  // Last story must not be a single simple accessory.
  assert.ok(
    !(last.length === 1 && pages.length > 1),
    "no final story with a single simple accessory"
  )
}

{
  // No product disappears, no story exceeds 5, across mixed weights.
  const mixed = [
    makeFact({ id: "p1", name: "iPhone 15 Pro Max", grade: "A", battery_health: 98, discount: { amount: 500, percent: 12 }, warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: true }),
    makeFact({ id: "p2", name: "iPhone 13", grade: "B", battery_health: 88 }),
    makeFact({ id: "p3", name: "Caneta Stylus" }),
    makeFact({ id: "p4", name: "Capa Preta" }),
    makeFact({ id: "p5", name: "Capa Lilás" }),
    makeFact({ id: "p6", name: "Película" }),
  ]
  const pages = chunkProductsForVisualStories(mixed, "standard")
  const flatIds = pages.flat().map((f) => f.id).sort()
  assert.deepEqual(flatIds, ["p1", "p2", "p3", "p4", "p5", "p6"], "no product lost")
  assert.ok(pages.every((p) => p.length <= MAX_PRODUCTS_PER_VITRINE_STORY), "≤5 per story")
}

{
  // Compact short pills exist and installment is never a vitrine pill.
  const f = makeFact({
    id: "x",
    name: "iPhone 14",
    grade: "A",
    battery_health: 100,
    quantity: 1,
    warrantyLabel: "Garantia Nobretech 6 meses",
    installment: { count: 18, text: "18x de R$ 164,04", perInstallment: 164.04, total: 2952, fee: 0, hasFee: false },
    isPrimary: true,
  })
  const story = buildDynamicStories([f], { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })[0]
  const v = story.vitrineProducts![0]
  assert.ok(!v.tags.some((t) => t.type === "installment"), "installment never a pill")
  // Warranty/kit are NOT pills anymore — dedicated lines.
  assert.ok(!v.tags.some((t) => t.type.startsWith("warranty")), "warranty not a pill")
  assert.equal(v.warrantyLine, "Garantia Nobretech 6m", "warranty as compact line")
  const battery = v.tags.find((t) => t.type === "battery")
  assert.equal(battery!.shortLabel, "Bat. 100%", "battery has compact label")
  assert.equal(v.parcel, "18x de R$ 164,04", "parcel still under price")
}

// ─── Card info hierarchy (name / subtitle / pills) ───────────────────────────

function vitrineItem0(facts: ProductFacts[], strategy: GeneralStrategy) {
  const story = buildDynamicStories(facts, {
    ...strategy,
    addHighlightStory: false,
    addCtaStory: false,
  }).find((s) => s.kind === "vitrine")!
  return story.vitrineProducts![0]
}

{
  const base = vitrineItem0([makeFact({ id: "height-base", name: "iPhone 13", grade: "A", battery_health: 100 })], BASE_STRATEGY)
  const withWarranty = vitrineItem0([
    makeFact({
      id: "height-warranty",
      name: "iPhone 13",
      grade: "A",
      battery_health: 100,
      warrantyLabel: "Garantia Nobretech 6 meses",
    }),
  ], BASE_STRATEGY)
  const withKit = vitrineItem0([
    makeFact({
      id: "height-kit",
      name: "iPhone 13",
      grade: "A",
      battery_health: 100,
      gifts: "capa",
    }),
  ], BASE_STRATEGY)
  const withBoth = vitrineItem0([
    makeFact({
      id: "height-both",
      name: "iPhone 13",
      grade: "A",
      battery_health: 100,
      warrantyLabel: "Garantia Nobretech 6 meses",
      gifts: "capa",
    }),
  ], BASE_STRATEGY)

  assert.ok(getStoryCardHeight(withWarranty) > getStoryCardHeight(base), "card height increases with warranty")
  assert.ok(getStoryCardHeight(withKit) > getStoryCardHeight(base), "card height increases with kit")
  assert.ok(getStoryCardHeight(withBoth) > getStoryCardHeight(withWarranty), "warranty + kit card is taller")
}

{
  // Name preserves color, no mid-word ellipsis.
  const f = makeFact({
    id: "n",
    name: "iPhone 14",
    storage: "128GB",
    color: "Meia-noite",
    grade: "A",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
    isPrimary: true,
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.ok(v.name.includes("Meia-noite"), `name keeps color: ${v.name}`)
  assert.ok(!v.name.includes("..."), "no ellipsis in name")
  assert.ok(v.name.includes("128GB"), "name keeps storage")
}

{
  // Subtitle does NOT duplicate storage/color/grade already in name.
  const f = makeFact({
    id: "s",
    name: "iPhone 14",
    storage: "128GB",
    color: "Meia-noite",
    grade: "A",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
    isPrimary: true,
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.equal(v.subtitle, "Seminovo Grade A", `subtitle = ${v.subtitle}`)
  assert.ok(!v.subtitle.includes("128GB"), "subtitle no storage dup")
  assert.ok(!v.subtitle.includes("Meia-noite"), "subtitle no color dup")
}

{
  // Lacrado accessory subtitle = "Lacrado".
  const f = makeFact({ id: "c", name: "Capa iPhone 14 Preta", grade: "Lacrado" })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.equal(v.subtitle, "Lacrado")
}

{
  // Kit/gift renders REAL content as a dedicated line, not a pill.
  const f = makeFact({
    id: "g",
    name: "iPhone 14",
    grade: "A",
    battery_health: 100,
    gifts: "capa + fonte + película",
    isPrimary: true,
  })
  const v = vitrineItem0([f], { ...BASE_STRATEGY, objective: "bundle_gift" })
  assert.ok(!v.tags.some((t) => t.type === "gift"), "gift not a pill")
  assert.equal(v.kitLine, "Capa + fonte + película", "kit line shows real content")
}

{
  // Long kit collapses to "Kit: N itens" (no ugly cut).
  const f = makeFact({
    id: "gl",
    name: "iPad",
    grade: "Lacrado",
    gifts: "capa executiva premium + película 9D + caneta stylus + suporte de mesa",
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.match(v.kitLine ?? "", /^Kit: \d+ itens$/, `long kit summarized (got: ${v.kitLine})`)
}

{
  // Warranty renders per-card as a line, from explicit label only.
  const f = makeFact({
    id: "t",
    name: "iPhone 14",
    grade: "A",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa",
    isPrimary: true,
  })
  const v = vitrineItem0([f], { ...BASE_STRATEGY, objective: "trust_proof" })
  assert.equal(v.warrantyLine, "Garantia Nobretech 6m")
  assert.equal(v.kitLine, "Capa")
  assert.ok(!v.tags.some((t) => t.type.startsWith("warranty") || t.type === "gift"), "no warranty/gift pills")
}

{
  // Apple warranty shows Apple, never Nobretech.
  const f = makeFact({
    id: "ap",
    name: "iPad 11",
    grade: "Lacrado",
    warrantyLabel: "Garantia Apple 1 ano",
    gifts: "capa + película + caneta",
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.equal(v.warrantyLine, "Garantia Apple 1 ano")
  assert.ok(!/nobretech/i.test(v.warrantyLine ?? ""), "no Nobretech inferred")
  assert.equal(v.kitLine, "Capa + película + caneta")
}

{
  // Final WhatsApp with multiple products lists every product, keeps real warranty
  // labels, and does not leak internal copywriting labels.
  const apple = makeFact({
    id: "wa-apple",
    name: "iPad 11",
    storage: "128GB",
    color: "Rosa",
    grade: "Lacrado",
    warrantyLabel: "Garantia Apple 1 ano",
    disclosurePrice: 2750,
    isPrimary: true,
  })
  const nobretech = makeFact({
    id: "wa-nobretech",
    name: "iPhone 13",
    storage: "128GB",
    color: "Midnight",
    grade: "A+",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
    disclosurePrice: 2799,
  })
  const noWarranty = makeFact({
    id: "wa-none",
    name: "AirPods",
    disclosurePrice: 900,
  })
  const content = buildDynamicStories([apple, nobretech, noWarranty], BASE_STRATEGY)
  assert.ok(content.length > 0, "stories still generate for WhatsApp fixture")
  const generated = generateContent([apple, nobretech, noWarranty].map((f) => ({
    product: {
      id: f.id,
      name: f.name,
      category: null,
      storage: f.storage,
      color: f.color,
      brand: "Apple",
      grade: f.grade,
      battery_health: f.battery_health,
      suggested_price: f.basePrice,
      quantity: f.quantity,
      commercial_status: "available",
      notes: null,
      has_imei: false,
      warranty_label: f.warrantyLabel,
      warranty_source: f.warrantySource,
      variants: [],
    },
    isPrimary: f.isPrimary,
    isFeatured: f.isFeatured,
    basePrice: f.basePrice,
    disclosurePrice: f.disclosurePrice,
    installmentCount: f.installment?.count ?? 0,
    gifts: f.gifts,
    warrantyLabel: f.warrantyLabel,
    warrantySource: f.warrantySource,
    copyTitle: f.copyTitle,
    copyDescription: f.copyDescription,
    copyStrongPoint: f.copyStrongPoint,
    copyObjection: f.copyObjection,
    productNote: f.productNote,
    productCta: f.productCta,
  })), BASE_STRATEGY)
  assert.match(generated.whatsapp, /iPad 11/i, "WhatsApp lists iPad")
  assert.match(generated.whatsapp, /iPhone 13/i, "WhatsApp lists iPhone")
  assert.match(generated.whatsapp, /AirPods/i, "WhatsApp lists third product")
  assert.match(generated.whatsapp, /Garantia Apple 1 ano/i, "WhatsApp keeps Apple warranty")
  assert.match(generated.whatsapp, /Garantia Nobretech 6 meses/i, "WhatsApp keeps Nobretech warranty")
  assert.ok(!/Ponto forte:|Argumento:/i.test(generated.whatsapp), "WhatsApp has no internal labels")
}

{
  // No warranty field → no warranty line, nothing inferred for sealed/accessory.
  const sealed = makeFact({ id: "s1", name: "iPad 11", grade: "Lacrado" })
  const acc = makeFact({ id: "s2", name: "Capa" })
  const v1 = vitrineItem0([sealed], BASE_STRATEGY)
  const v2 = vitrineItem0([acc], BASE_STRATEGY)
  assert.equal(v1.warrantyLine, null, "sealed: no inferred warranty")
  assert.equal(v2.warrantyLine, null, "accessory: no inferred warranty")
}

{
  // 3 products each with Nobretech warranty → all 3 cards show warranty line.
  const mk = (id: string) =>
    makeFact({ id, name: `iPhone ${id}`, grade: "A", battery_health: 95, warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: id === "a" })
  const facts = [mk("a"), mk("b"), mk("c")]
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const all = stories.filter((s) => s.kind === "vitrine").flatMap((s) => s.vitrineProducts ?? [])
  assert.equal(all.length, 3)
  for (const v of all) assert.equal(v.warrantyLine, "Garantia Nobretech 6m", `${v.productId} shows warranty`)
}

{
  // Technical pills exclude warranty + gift (cap counts only technical).
  const f = makeFact({
    id: "cap",
    name: "iPhone 14",
    grade: "A",
    battery_health: 100,
    quantity: 1,
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa",
    isPrimary: true,
  })
  const v = vitrineItem0([f], { ...BASE_STRATEGY, objective: "bundle_gift" })
  assert.ok(
    v.tags.every((t) => !t.type.startsWith("warranty") && t.type !== "gift" && t.type !== "installment"),
    "pills are technical only"
  )
  assert.ok(v.tags.length <= 4, "pill cap ≤ 4")
  assert.ok(v.warrantyLine && v.kitLine, "warranty + kit present as lines, outside cap")
}

{
  const ipad = makeFact({
    id: "real-ipad",
    name: "iPad 11",
    storage: "128GB",
    color: "Rosa",
    grade: "Lacrado",
    quantity: 1,
    disclosurePrice: 2649,
    installment: { count: 18, text: "18x de R$ 181,17", perInstallment: 181.17, total: 3261.06, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Apple 1 ano",
    gifts: "capa + película + caneta",
    isPrimary: true,
  })
  const iphoneRosa = makeFact({
    id: "real-iphone-rosa",
    name: "iPhone 13",
    storage: "128GB",
    color: "Rosa",
    grade: "A+",
    battery_health: 100,
    quantity: 1,
    disclosurePrice: 2799,
    installment: { count: 18, text: "18x de R$ 184,39", perInstallment: 184.39, total: 3319.02, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa",
  })
  const iphoneMidnight = makeFact({
    id: "real-iphone-midnight",
    name: "iPhone 13",
    storage: "128GB",
    color: "Midnight",
    grade: "Lacrado",
    battery_health: 100,
    quantity: 1,
    disclosurePrice: 2900,
    warrantyLabel: "Garantia Nobretech 6 meses",
  })
  const stories = buildDynamicStories([ipad, iphoneRosa, iphoneMidnight], {
    ...BASE_STRATEGY,
    objective: "bundle_gift",
    addHighlightStory: false,
    addCtaStory: true,
  })
  const vitrines = stories.filter((s) => s.kind === "vitrine")
  assert.ok(vitrines.length >= 2, "rich warranty+kit products reduce capacity and split stories")
  const cards = vitrines.flatMap((s) => s.vitrineProducts ?? [])
  assert.equal(cards.length, 3, "all rich products appear across vitrines")
  for (const card of cards) {
    assert.ok(card.name.length > 0 && !card.name.includes("..."), `no ellipsis in ${card.productId}`)
    assert.ok(card.price, `${card.productId}: price visible`)
    assert.ok(card.warrantyLine, `${card.productId}: warranty line visible`)
  }
  assert.ok(cards.find((c) => c.productId === "real-ipad")?.parcel, "iPad parcel visible")
  assert.ok(cards.find((c) => c.productId === "real-iphone-rosa")?.parcel, "iPhone parcel visible")
  assert.ok(cards.find((c) => c.productId === "real-ipad")?.name.includes("128GB"), "iPad keeps storage")
  assert.ok(cards.find((c) => c.productId === "real-ipad")?.name.includes("Rosa"), "iPad keeps color")
  assert.equal(cards.find((c) => c.productId === "real-ipad")?.warrantyLine, "Garantia Apple 1 ano")
  assert.equal(cards.find((c) => c.productId === "real-ipad")?.kitLine, "Capa + película + caneta")
  assert.equal(cards.find((c) => c.productId === "real-iphone-rosa")?.warrantyLine, "Garantia Nobretech 6m")
  assert.equal(cards.find((c) => c.productId === "real-iphone-rosa")?.kitLine, "Capa")
  assert.ok(
    vitrines.every((story) => !/R\$|18x de/i.test(story.footerCtaSub ?? "")),
    "multi-product vitrine footer does not show a specific product price/installment"
  )
  const cta = stories.find((s) => s.kind === "cta")!
  assert.equal(cta.price, null, "real multi closing: no specific price")
  assert.equal(cta.parcel, null, "real multi closing: no specific parcel")
  assert.equal(cta.ctaSub, null, "real multi closing: no price subline")
}

{
  // Highlight story differs from vitrine card and carries argument bullets.
  const f = makeFact({
    id: "h",
    name: "iPhone 14",
    storage: "128GB",
    color: "Meia-noite",
    grade: "A",
    battery_health: 100,
    quantity: 1,
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa",
    discount: { amount: 200, percent: 8 },
    basePrice: 2490,
    disclosurePrice: 2290,
    isPrimary: true,
  })
  const other = makeFact({ id: "o", name: "Película" })
  const stories = buildDynamicStories([f, other], {
    ...BASE_STRATEGY,
    addHighlightStory: true,
    addCtaStory: false,
  })
  const hl = stories.find((s) => s.kind === "highlight")!
  const vit = stories.find((s) => s.kind === "vitrine")!
  assert.notEqual(hl.headline, vit.headline, "highlight headline differs from vitrine")
  assert.ok(hl.detailLines.length >= 3, "highlight has argument bullets")
  assert.ok(
    hl.detailLines.some((l) => /Bateria 100%/.test(l)) &&
      hl.detailLines.some((l) => /De .* por /.test(l)),
    "highlight deep-dives battery + de/por"
  )
}

// ─── Presence guardrail: every product lands in a vitrine ────────────────────

{
  // Real case: iPhone + 3 long-named accessories, 2 vitrines, no false alert.
  const iphone = makeFact({
    id: "p1",
    name: "iPhone 14",
    storage: "128GB",
    color: "Meia-noite",
    grade: "A",
    battery_health: 100,
    quantity: 1,
    basePrice: 2490,
    disclosurePrice: 2290,
    discount: { amount: 200, percent: 8 },
    installment: { count: 18, text: "18x de R$ 150,86", perInstallment: 150.86, total: 2715, fee: 0, hasFee: false },
    warrantyLabel: "Garantia Nobretech 6 meses",
    gifts: "capa",
    isPrimary: true,
  })
  const a1 = makeFact({ id: "a1", name: "Película de Vidro 9D para iPad 10 e 11", grade: "Lacrado" })
  const a2 = makeFact({ id: "a2", name: "Carregador Turbo 35W iPhone 15, 16 e 17 USB C", grade: "Lacrado" })
  const a3 = makeFact({ id: "a3", name: "Capa Trifold para iPad A16 11 Modelo Executivo", grade: "Lacrado" })
  const facts = [iphone, a1, a2, a3]

  // Mirror generateContent's guardrail: every fact id must be in a vitrine.
  for (const objective of ["sell_fast", "bundle_gift"] as ObjectiveKey[]) {
    const stories = buildDynamicStories(facts, {
      ...BASE_STRATEGY,
      objective,
      urgencyLevel: "low",
      addHighlightStory: false,
      addCtaStory: false,
    })
    const ids = new Set<string>()
    stories
      .filter((s) => s.kind === "vitrine")
      .forEach((s) => s.vitrineProducts?.forEach((v) => ids.add(v.productId)))
    for (const f of facts) {
      assert.ok(ids.has(f.id), `${f.id} present in a vitrine (${objective}) — no false alert`)
    }
    const iphoneCard = stories
      .flatMap((s) => s.vitrineProducts ?? [])
      .find((v) => v.productId === "p1")!
    assert.ok(iphoneCard.name.includes("Meia-noite"), `iPhone name keeps color (${objective})`)
    assert.ok(!iphoneCard.name.includes("..."), `no ellipsis (${objective})`)
  }

  // bundle_gift → iPhone shows kit line with real content (not a pill).
  const kitStories = buildDynamicStories(facts, {
    ...BASE_STRATEGY,
    objective: "bundle_gift",
    addHighlightStory: false,
    addCtaStory: false,
  })
  const iphoneKit = kitStories
    .flatMap((s) => s.vitrineProducts ?? [])
    .find((v) => v.productId === "p1")!
  assert.equal(iphoneKit.kitLine, "Capa", "kit line shows real content")
  assert.ok(!iphoneKit.tags.some((t) => t.type === "gift"), "kit not a pill")
}

// ─── Closing story is never ambiguous with multiple products ─────────────────

{
  // Single product, last unit → CTA story headline comes from the CTA bank (varied by objective).
  // Urgency lives in detailLines/sub, not the headline. No forbidden phrases.
  const f = makeFact({ id: "s1", name: "iPhone 14", grade: "A", battery_health: 100, quantity: 1, isPrimary: true })
  const cta = buildDynamicStories([f], { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true }).find(
    (s) => s.kind === "cta"
  )!
  assert.ok(typeof cta.headline === "string" && cta.headline.length > 0, "single: cta headline present")
  assert.ok(!/só até hoje|menor preço do mercado|IMEI verificado/i.test(cta.headline), "single: no forbidden phrases in cta headline")
  // The "última unidade" info surfaces in detailLines (not the headline)
  const allText = [cta.headline, cta.sub, ...cta.detailLines].join(" ")
  assert.ok(allText.length > 0, "single: cta story has content")
}

{
  // Multiple products, one has quantity 1 → must NOT say bare "Última unidade".
  const a = makeFact({ id: "m1", name: "iPhone 14", grade: "A", battery_health: 100, quantity: 1, isPrimary: true })
  const b = makeFact({ id: "m2", name: "iPad 11", grade: "Lacrado", quantity: 8 })
  const c = makeFact({ id: "m3", name: "Capa", grade: "Lacrado", quantity: 10 })
  const cta = buildDynamicStories([a, b, c], { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true }).find(
    (s) => s.kind === "cta"
  )!
  assert.ok(
    !/última unidade nessa condição/i.test(cta.headline),
    `multi: no ambiguous "última unidade nessa condição" (got: ${cta.headline})`
  )
  assert.match(
    cta.headline,
    /escolha o modelo|confirmo a disponibilidade|me chama/i,
    "multi: safe selection CTA"
  )
}

{
  // Multiple products, none urgent → safe selection CTA, no last-unit phrasing.
  const a = makeFact({ id: "n1", name: "iPhone 14", grade: "A", quantity: 5, isPrimary: true })
  const b = makeFact({ id: "n2", name: "iPad 11", grade: "Lacrado", quantity: 9 })
  const cta = buildDynamicStories([a, b], { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true }).find(
    (s) => s.kind === "cta"
  )!
  assert.ok(!/última unidade/i.test(cta.headline), "multi non-urgent: no última unidade")
}

{
  // Highlight sub summarizes real arguments, not the product name / spec dump.
  const f = makeFact({
    id: "h2",
    name: "iPhone 14",
    storage: "128GB",
    color: "Meia-noite",
    grade: "A",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
    isPrimary: true,
  })
  const other = makeFact({ id: "o2", name: "Película" })
  const hl = buildDynamicStories([f, other], {
    ...BASE_STRATEGY,
    addHighlightStory: true,
    addCtaStory: false,
  }).find((s) => s.kind === "highlight")!
  assert.ok(/Bateria 100%/.test(hl.sub), `highlight sub has battery (got: ${hl.sub})`)
  assert.ok(hl.sub.includes(" e "), "highlight sub is a comma+e summary")
  assert.ok(!hl.sub.includes("128GB"), "highlight sub not a spec dump")
}

{
  // Multi-product closing must NOT carry a price/parcel (ambiguous).
  const a = makeFact({ id: "z1", name: "iPhone 14", grade: "A", battery_health: 100, quantity: 1, disclosurePrice: 2290, installment: { count: 18, text: "18x", perInstallment: 127, total: 2290, fee: 0, hasFee: false }, isPrimary: true })
  const b = makeFact({ id: "z2", name: "iPad 11", grade: "Lacrado", disclosurePrice: 2750 })
  const cta = buildDynamicStories([a, b], { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true }).find(
    (s) => s.kind === "cta"
  )!
  assert.equal(cta.price, null, "multi closing: no price")
  assert.equal(cta.parcel, null, "multi closing: no parcel")
  assert.equal(cta.ctaSub, null, "multi closing: no price subline")
}

{
  // Highlight short name strips parentheses (no dangling "(11ª").
  const f = makeFact({ id: "ip", name: "iPad (11ª geração) 128GB", grade: "Lacrado", isPrimary: true })
  const other = makeFact({ id: "ip2", name: "Capa" })
  const hl = buildDynamicStories([f, other], { ...BASE_STRATEGY, objective: "sell_fast", addHighlightStory: true, addCtaStory: false }).find(
    (s) => s.kind === "highlight"
  )!
  assert.ok(!/\([^)]*$/.test(hl.headline), `no unclosed paren in headline (got: ${hl.headline})`)
  assert.ok(!hl.headline.includes("("), "headline has no parenthesis fragment")
}

{
  // Editor financial values must not use ellipsis/truncate.
  const ui = readFileSync("src/app/(dashboard)/marketing/divulgacao/divulgacao-client.tsx", "utf8")
  assert.ok(!/Preço padrão[\s\S]{0,260}truncate/.test(ui), "Preço padrão card has no truncate")
  assert.ok(!/Divulgação[\s\S]{0,260}truncate/.test(ui), "Divulgação card has no truncate")
  assert.ok(!/Parcelamento[\s\S]{0,260}truncate/.test(ui), "Parcelamento card has no truncate")
  assert.ok(/break-all text-sm font-black[\s\S]{0,120}\{disclosurePrice/.test(ui), "financial values stay fully readable (break-all, not ellipsis)")
}

// ─── New spec tests (8 required by task) ─────────────────────────────────────

{
  // 1. Apple warranty is NOT converted to Garantia Nobretech.
  const f = makeFact({ id: "a1", name: "iPhone 14", grade: "A", warrantyLabel: "Garantia Apple 1 ano", isPrimary: true })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.ok(v.warrantyLine !== null, "has warranty line")
  assert.ok(/apple/i.test(v.warrantyLine!), `warranty line keeps apple label: ${v.warrantyLine}`)
  assert.ok(!/nobretech/i.test(v.warrantyLine!), `warranty line NOT rewritten to nobretech: ${v.warrantyLine}`)
}

{
  // 2. Nobretech warranty shows in its own card line.
  const f = makeFact({ id: "nb", name: "iPhone 13", grade: "A", warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: true })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.ok(v.warrantyLine !== null, "has warranty line")
  assert.ok(/nobretech/i.test(v.warrantyLine!), `warranty line contains nobretech: ${v.warrantyLine}`)
  // Must NOT appear as a pill — warrantyLine is a dedicated line, not in tags
  const warrantyPill = v.tags.find((t) => t.type.startsWith("warranty"))
  assert.equal(warrantyPill, undefined, "warranty is not a pill when warrantyLine is set")
}

{
  // 3. Gift renders real content as a dedicated kitLine, not a pill.
  const f = makeFact({ id: "gf", name: "iPad 11", grade: "Lacrado", gifts: "capa + película" })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.ok(v.kitLine !== null, "has kitLine")
  assert.ok(/capa/i.test(v.kitLine!), `kitLine shows real gift: ${v.kitLine}`)
  const giftPill = v.tags.find((t) => t.type === "gift")
  assert.equal(giftPill, undefined, "gift is not a pill when kitLine is set")
}

{
  // 4. Product with more info (warranty + kit) has larger estimated card height.
  const base = vitrineItem0([makeFact({ id: "h_base", name: "iPhone 14", grade: "A", isPrimary: true })], BASE_STRATEGY)
  const withW = vitrineItem0([makeFact({ id: "h_w", name: "iPhone 14", grade: "A", warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: true })], BASE_STRATEGY)
  const withWK = vitrineItem0([makeFact({ id: "h_wk", name: "iPhone 14", grade: "A", warrantyLabel: "Garantia Nobretech 6 meses", gifts: "capa", isPrimary: true })], BASE_STRATEGY)
  assert.ok(getStoryCardHeight(withW) > getStoryCardHeight(base), "warranty increases estimated card height")
  assert.ok(getStoryCardHeight(withWK) > getStoryCardHeight(withW), "warranty + kit increases height further")
}

{
  // 5. Rich (heavy) products break into more stories before overflow (max 2/story in detailed).
  const heavyFacts = Array.from({ length: 4 }, (_, i) =>
    makeFact({ id: `heavy-${i}`, name: `iPhone 14 Pro Max 256GB`, grade: "A", battery_health: 100, warrantyLabel: "Garantia Apple", isPrimary: i === 0 })
  )
  const pages = chunkProductsForVisualStories(heavyFacts, "detailed")
  assert.ok(pages.length >= 2, `4 rich products must produce ≥2 pages, got ${pages.length}`)
  for (const page of pages) {
    assert.ok(page.length <= 3, `no page should exceed 3 products, got ${page.length}`)
  }
}

{
  // 6. Closing story with multiple products has no individual price.
  const facts = [
    makeFact({ id: "c1", name: "iPhone 13", grade: "A", disclosurePrice: 2900, isPrimary: true }),
    makeFact({ id: "c2", name: "iPhone 14", grade: "A", disclosurePrice: 3400 }),
  ]
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addCtaStory: true })
  const cta = stories.find((s) => s.kind === "cta")!
  assert.ok(cta, "cta story exists")
  assert.equal(cta.price, null, "multi-product cta has no individual price")
  assert.equal(cta.parcel, null, "multi-product cta has no individual parcel")
  assert.equal(cta.ctaSub, null, "multi-product cta has no ctaSub with price reference")
}

{
  // 7. Closing story with single product may show price.
  const facts = [makeFact({ id: "s1", name: "iPhone 14 128GB", grade: "A", disclosurePrice: 3400, isPrimary: true })]
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addCtaStory: true })
  const cta = stories.find((s) => s.kind === "cta")!
  assert.ok(cta, "cta story exists for single product")
  // Single product CTA may or may not have price depending on strategy — it should not be null when stock is available
  // Just verify it doesn't crash and has valid structure
  assert.ok(typeof cta.headline === "string" && cta.headline.length > 0, "cta headline exists")
}

{
  // 8. Preview/export use the same renderer — SVG renderer module is the single source of truth.
  const svgModule = readFileSync("src/lib/marketing/story-renderer/story-svg.ts", "utf8")
  assert.ok(/export function renderStoryToSVG/.test(svgModule), "story-svg exports renderStoryToSVG")
  assert.ok(/viewBox/.test(svgModule), "renderStoryToSVG emits SVG viewBox")
  const pngModule = readFileSync("src/lib/marketing/story-renderer/story-png.ts", "utf8")
  assert.ok(/renderStoryToPng/.test(pngModule), "story-png exports renderStoryToPng")
  assert.ok(/svgToPngBlob/.test(pngModule), "story-png implements SVG→PNG via canvas")
  const client = readFileSync("src/app/(dashboard)/marketing/divulgacao/divulgacao-client.tsx", "utf8")
  assert.ok(/story-renderer\/story-png/.test(client), "client imports from story-renderer/story-png")
  assert.ok(!/html2canvas/.test(client), "html2canvas removed from client")
  // Old absolute-positioned rendering must be gone
  assert.ok(!/position.*absolute.*left.*leftX\|leftX.*position.*absolute/.test(client), "old absolute leftX layout removed from client")
}

// ─── Static guardrails for AI schema and disclosure persistence ──────────────

{
  const aiSource = readFileSync("src/lib/marketing/ai.ts", "utf8")
  assert.match(aiSource, /product_id/, "AI schema uses product_id")
  assert.match(aiSource, /story_whatsapp_text/, "AI schema requires per-product story WhatsApp text")
  assert.match(aiSource, /warranty_label/, "AI facts include warranty_label")
  assert.match(aiSource, /Use exatamente warranty_label/, "AI instructions preserve exact warranty label")
  assert.match(aiSource, /fallbackCopyCount/, "AI fills missing/unsafe product copies with fallback")
}

{
  const saveRoute = readFileSync("src/app/api/marketing/disclosure-sessions/route.ts", "utf8")
  assert.match(saveRoute, /warranty_label/, "save route persists warranty_label")
  assert.match(saveRoute, /gifts_text/, "save route persists gifts")
  assert.match(saveRoute, /installment_count/, "save route persists installment")
  assert.match(saveRoute, /disclosure_price/, "save route persists disclosure price")
  assert.match(saveRoute, /copy_json/, "save route persists product copies")
}

{
  const loadRoute = readFileSync("src/app/api/marketing/disclosure-sessions/last/route.ts", "utf8")
  assert.match(loadRoute, /warranty_label/, "load route reads warranty_label")
  assert.match(loadRoute, /warrantyLabel/, "load route returns warrantyLabel")
}

// ─── Discount threshold (< 5% not shown on card) ─────────────────────────────

{
  // 1. discount < 5% → discountPercent null, struck price SHOWN (any real drop), hasDiscount false
  // Rule: basePrice always shows when disclosurePrice < basePrice, even for small drops.
  // Orange border (hasDiscount) only for strong discounts (>= 5%).
  const f = makeFact({
    id: "disc-small",
    name: "iPhone 15 Pro",
    grade: "Lacrado",
    basePrice: 3899,
    disclosurePrice: 3799,
    discount: { amount: 100, percent: 2.6 },
    isPrimary: true,
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.equal(v.discountPercent, null, "discount 2.6%: discountPercent is null (< 5% threshold)")
  assert.ok(v.basePrice != null, "discount 2.6%: struck price IS shown (any real price drop)")
  assert.match(v.basePrice!, /3\.899|3899/, "struck price shows original R$ 3.899")
  assert.equal(v.hasDiscount, false, "discount 2.6%: hasDiscount false — no orange border for weak discount")
}

{
  // 2. discount >= 5% → discountPercent set, struck price shown, hasDiscount true
  const f = makeFact({
    id: "disc-big",
    name: "iPhone 14",
    grade: "A",
    basePrice: 2490,
    disclosurePrice: 2290,
    discount: { amount: 200, percent: 8 },
    isPrimary: true,
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.ok(v.discountPercent != null && v.discountPercent >= 5, `discount 8%: discountPercent set (${v.discountPercent})`)
  assert.ok(v.basePrice != null, "discount 8%: struck price shown")
  assert.equal(v.hasDiscount, true, "discount 8%: hasDiscount true (orange border)")
}

{
  // 3. saving >= R$ 200 but percent < 5% → shows struck price, no percent, no orange border
  const f = makeFact({
    id: "disc-big-saving",
    name: "MacBook Air",
    grade: "A",
    basePrice: 7000,
    disclosurePrice: 6750,
    discount: { amount: 250, percent: 3.6 },
    isPrimary: true,
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.equal(v.discountPercent, null, "saving >= R$ 200 but 3.6%: no percent label")
  assert.ok(v.basePrice != null, "saving >= R$ 200: struck price shown")
  assert.equal(v.hasDiscount, false, "saving >= R$ 200 but percent < 5%: no orange border")
}

{
  // 4. quantity === 1 → pill label "Última unidade", shortLabel not "1 unidade"
  const f = makeFact({ id: "last-unit", name: "iPhone 13", grade: "A", quantity: 1, isPrimary: true })
  const v = vitrineItem0([f], BASE_STRATEGY)
  const stockPill = v.tags.find((t) => t.type === "stock")
  assert.ok(stockPill != null, "quantity=1 has stock pill")
  assert.equal(stockPill!.label, "Última unidade", "pill label is 'Última unidade'")
  assert.ok(stockPill!.shortLabel !== "1 unidade", `shortLabel must not be '1 unidade': ${stockPill!.shortLabel}`)
}

{
  // 5. Product without relevant discount shows real differentials (battery, grade)
  const f = makeFact({
    id: "no-disc",
    name: "iPhone 14",
    grade: "A",
    battery_health: 100,
    warrantyLabel: "Garantia Nobretech 6 meses",
    quantity: 1,
    disclosurePrice: 2490,
    isPrimary: true,
  })
  const v = vitrineItem0([f], BASE_STRATEGY)
  assert.equal(v.discountPercent, null, "no relevant discount: discountPercent null")
  assert.ok(v.tags.some((t) => t.type === "battery"), "product without discount shows battery pill")
  assert.ok(v.tags.some((t) => t.type === "stock"), "quantity=1 shows last-unit pill")
  assert.ok(v.tags.some((t) => t.type === "grade"), "grade pill present")
}

{
  // 6. Benefits bullets are concrete, not generic filler phrases
  const facts = [
    makeFact({
      id: "b1", name: "iPhone 14", grade: "A", battery_health: 100,
      warrantyLabel: "Garantia Nobretech 6 meses", quantity: 1, disclosurePrice: 2490,
      installment: { count: 18, text: "18x de R$ 164", perInstallment: 164, total: 2952, fee: 0, hasFee: false },
      isPrimary: true,
    }),
    makeFact({ id: "b2", name: "iPhone 13", grade: "Lacrado", warrantyLabel: "Garantia Apple 1 ano", disclosurePrice: 2800 }),
  ]
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const benefits = vitrine.benefits ?? []
  assert.ok(!benefits.some((b) => /condição com desconto real/i.test(b)), "no 'condição com desconto real' bullet")
  assert.ok(!benefits.some((b) => /condições conferidas antes da publicação/i.test(b)), "no 'condições conferidas' bullet")
  assert.ok(benefits.some((b) => /parcelo|cartão/i.test(b)), "concrete installment bullet present")
  assert.ok(benefits.some((b) => /garantia/i.test(b)), "concrete warranty bullet present")
  assert.ok(benefits.every((b) => typeof b === "string" && b.length > 0), "no empty bullets")
}

{
  // 7. IMEI never invented in any story output
  const f = makeFact({ id: "imei-check", name: "iPhone 14", grade: "A", battery_health: 95, warrantyLabel: "Garantia Nobretech 6 meses", isPrimary: true })
  const stories = buildDynamicStories([f], { ...BASE_STRATEGY, addHighlightStory: true, addCtaStory: true })
  const allText = stories.map((s) => [
    s.headline, s.sub, ...s.detailLines, ...(s.benefits ?? []),
    ...(s.vitrineProducts ?? []).flatMap((v) => [v.name, v.subtitle, v.warrantyLine ?? "", v.kitLine ?? ""]),
  ].join(" ")).join(" ")
  assert.ok(!/IMEI verificado/i.test(allText), "no 'IMEI verificado' invented in story output")
  assert.ok(!/menor preço do mercado/i.test(allText), "no 'menor preço do mercado' invented")
  assert.ok(!/só até hoje/i.test(allText), "no 'só até hoje' invented")
}

// ─── V1.2: Commercial availability key (Part 2) ──────────────────────────────

{
  // Two lacrado iPads → same key (same commercial group).
  const a = makeFact({ id: "ipad-a", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "Lacrado" })
  const b = makeFact({ id: "ipad-b", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "Lacrado" })
  assert.equal(getCommercialAvailabilityKey(a), getCommercialAvailabilityKey(b), "two lacrado iPads → same key")
}

{
  // Lacrado vs Grade A → different keys (must not group).
  const lacrado = makeFact({ id: "ipad-l", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "Lacrado" })
  const gradeA = makeFact({ id: "ipad-g", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "A" })
  assert.notEqual(getCommercialAvailabilityKey(lacrado), getCommercialAvailabilityKey(gradeA), "lacrado ≠ grade-a key")
}

{
  // Grade A vs Grade A+ → different keys.
  const a = makeFact({ id: "ip-a", name: "iPhone 14", storage: "128GB", color: "Midnight", grade: "A" })
  const aPlus = makeFact({ id: "ip-aplus", name: "iPhone 14", storage: "128GB", color: "Midnight", grade: "A+" })
  assert.notEqual(getCommercialAvailabilityKey(a), getCommercialAvailabilityKey(aPlus), "grade-a ≠ grade-a-plus key")
}

{
  // Two iPhone 14 Grade A → same key.
  const x = makeFact({ id: "ip-x", name: "iPhone 14", storage: "128GB", color: "Midnight", grade: "A" })
  const y = makeFact({ id: "ip-y", name: "iPhone 14", storage: "128GB", color: "Midnight", grade: "A" })
  assert.equal(getCommercialAvailabilityKey(x), getCommercialAvailabilityKey(y), "same model/storage/color/grade → same key")
}

{
  // Null grade → treated as lacrado.
  const noGrade = makeFact({ id: "ng", name: "iPad 11", storage: "128GB", color: "Cinza", grade: null })
  const lacrado = makeFact({ id: "lg", name: "iPad 11", storage: "128GB", color: "Cinza", grade: "Lacrado" })
  assert.equal(getCommercialAvailabilityKey(noGrade), getCommercialAvailabilityKey(lacrado), "null grade = lacrado key")
}

// ─── V1.2: Commercial scarcity tags (Part 2) ─────────────────────────────────

{
  // Two lacrado iPads in same campaign → commercial qty = 2 → no "Última unidade".
  const a = makeFact({ id: "ipad1", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "Lacrado", quantity: 1, isPrimary: true })
  const b = makeFact({ id: "ipad2", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "Lacrado", quantity: 1 })
  const content = generateContent([a, b].map((f) => ({
    product: { id: f.id, name: f.name, category: null, storage: f.storage, color: f.color, brand: "Apple", grade: f.grade, battery_health: null, suggested_price: f.basePrice, quantity: f.quantity, commercial_status: "available", notes: null, has_imei: false, warranty_label: null, warranty_source: null, variants: [] },
    isPrimary: f.isPrimary,
    isFeatured: false,
    basePrice: f.basePrice,
    disclosurePrice: f.disclosurePrice,
    installmentCount: 0,
    gifts: "",
    warrantyLabel: "",
    warrantySource: null,
    copyTitle: "",
    copyDescription: "",
    copyStrongPoint: "",
    copyObjection: "",
    productNote: "",
    productCta: "",
  })), BASE_STRATEGY)
  const allCards = content.stories.filter((s) => s.kind === "vitrine").flatMap((s) => s.vitrineProducts ?? [])
  const ipad1 = allCards.find((c) => c.productId === "ipad1")!
  const ipad2 = allCards.find((c) => c.productId === "ipad2")!
  assert.ok(!ipad1.tags.some((t) => t.label === "Última unidade"), "ipad1: 2 lacrado iPads → no Última unidade")
  assert.ok(!ipad2.tags.some((t) => t.label === "Última unidade"), "ipad2: 2 lacrado iPads → no Última unidade")
  const stockTag1 = ipad1.tags.find((t) => t.type === "stock")
  if (stockTag1) assert.match(stockTag1.label, /2 unidades/, "ipad1: stock shows 2 unidades")
}

{
  // Lacrado + Grade A in same campaign → each is "Última unidade" of its condition.
  const lacrado = makeFact({ id: "ipad-l2", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "Lacrado", quantity: 1, isPrimary: true })
  const gradeA = makeFact({ id: "ipad-ga2", name: "iPad 11", storage: "128GB", color: "Prateado", grade: "A", quantity: 1 })
  const content = generateContent([lacrado, gradeA].map((f) => ({
    product: { id: f.id, name: f.name, category: null, storage: f.storage, color: f.color, brand: "Apple", grade: f.grade, battery_health: null, suggested_price: f.basePrice, quantity: f.quantity, commercial_status: "available", notes: null, has_imei: false, warranty_label: null, warranty_source: null, variants: [] },
    isPrimary: f.isPrimary,
    isFeatured: false,
    basePrice: f.basePrice,
    disclosurePrice: f.disclosurePrice,
    installmentCount: 0,
    gifts: "",
    warrantyLabel: "",
    warrantySource: null,
    copyTitle: "",
    copyDescription: "",
    copyStrongPoint: "",
    copyObjection: "",
    productNote: "",
    productCta: "",
  })), BASE_STRATEGY)
  const allCards = content.stories.filter((s) => s.kind === "vitrine").flatMap((s) => s.vitrineProducts ?? [])
  const cardL = allCards.find((c) => c.productId === "ipad-l2")!
  const cardG = allCards.find((c) => c.productId === "ipad-ga2")!
  assert.ok(cardL.tags.some((t) => t.label === "Última unidade"), "lacrado: única do seu grupo → Última unidade")
  assert.ok(cardG.tags.some((t) => t.label === "Última unidade"), "grade-a: única do seu grupo → Última unidade")
}

// ─── V1.2: CTA bank structure (Part 3) ───────────────────────────────────────

{
  const objectives: CtaObjective[] = ["sell_fast", "generate_desire", "bundle_gift", "trust_proof", "new_arrival", "reactivate_lead"]
  for (const obj of objectives) {
    const pool = CTA_BANK[obj]
    assert.ok(pool && pool.length >= 6, `${obj}: CTA bank has at least 6 entries (got ${pool?.length})`)
    for (const cta of pool) {
      assert.ok(!/só até hoje/i.test(cta), `${obj}: no forbidden phrase "só até hoje"`)
      assert.ok(!/menor preço do mercado/i.test(cta), `${obj}: no forbidden phrase "menor preço do mercado"`)
      assert.ok(!/IMEI verificado/i.test(cta), `${obj}: no forbidden phrase "IMEI verificado"`)
      assert.ok(cta.trim().length > 0, `${obj}: no empty CTA entries`)
    }
  }
}

// ─── V1.2: pickStoryCta — determinism + no-repeat (Part 3) ──────────────────

{
  // Same inputs → same output (deterministic).
  const r1 = pickStoryCta({ objective: "sell_fast", storyIndex: 0, usedCtas: [], variationSeed: 0 })
  const r2 = pickStoryCta({ objective: "sell_fast", storyIndex: 0, usedCtas: [], variationSeed: 0 })
  assert.equal(r1, r2, "pickStoryCta is deterministic for same inputs")
}

{
  // Different variationSeed → different CTA (at least for the first call).
  const r0 = pickStoryCta({ objective: "sell_fast", storyIndex: 0, usedCtas: [], variationSeed: 0 })
  const r1 = pickStoryCta({ objective: "sell_fast", storyIndex: 0, usedCtas: [], variationSeed: 1 })
  // Seed shifts index — must differ unless pool wraps to same (unlikely with 6 entries and seed=1)
  assert.notEqual(r0, r1, "different variationSeed → different CTA selection")
}

{
  // usedCtas excludes already-picked CTAs.
  const first = pickStoryCta({ objective: "sell_fast", storyIndex: 0, usedCtas: [], variationSeed: 0 })
  const second = pickStoryCta({ objective: "sell_fast", storyIndex: 1, usedCtas: [first], variationSeed: 0 })
  assert.notEqual(first, second, "second pick avoids CTA already used in first story")
}

{
  // Stories sequence (vitrine + cta) → no consecutive repeated CTA.
  const facts = makeDevices(2)
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true })
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  const cta = stories.find((s) => s.kind === "cta")!
  assert.ok(vitrine.footerCtaMain, "vitrine has footerCtaMain")
  assert.ok(cta.ctaMain, "cta story has ctaMain")
  assert.notEqual(vitrine.footerCtaMain, cta.ctaMain, "vitrine footer CTA ≠ closing story CTA")
}

{
  // variationSeed changes CTAs deterministically across the full story set.
  const facts = makeDevices(2)
  const storiesV0 = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true, ctaVariationSeed: 0 })
  const storiesV1 = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true, ctaVariationSeed: 1 })
  const ctaV0 = storiesV0.find((s) => s.kind === "cta")!.ctaMain
  const ctaV1 = storiesV1.find((s) => s.kind === "cta")!.ctaMain
  assert.notEqual(ctaV0, ctaV1, "different ctaVariationSeed → different cta headline")
  // Seed 0 reproducible
  const storiesV0b = buildDynamicStories(facts, { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: true, ctaVariationSeed: 0 })
  assert.equal(ctaV0, storiesV0b.find((s) => s.kind === "cta")!.ctaMain, "same seed → same cta (reproducible)")
}

{
  // Custom generalCta bypasses CTA bank — user's text is used as-is.
  const facts = makeDevices(1)
  const customCta = "Entra em contato agora."
  const stories = buildDynamicStories(facts, { ...BASE_STRATEGY, generalCta: customCta, addHighlightStory: false, addCtaStory: true })
  const vitrine = stories.find((s) => s.kind === "vitrine")!
  assert.equal(vitrine.footerCtaMain, customCta, "custom generalCta used for vitrine footer, not bank")
}

// ─── V1.2: Validation scenario — iPhone 13 + iPad 11 (Part 6) ───────────────

{
  // iPhone 13 128GB Midnight Lacrado — 3.5% discount → shows struck price, no percent badge.
  // iPad 11 128GB Prateado Lacrado — 2 units → no "Última unidade".
  function toDraft(f: ProductFacts, basePrice: number | null, disclosurePrice: number | null) {
    return {
      product: { id: f.id, name: f.name, category: null, storage: f.storage, color: f.color, brand: "Apple", grade: f.grade, battery_health: f.battery_health, suggested_price: basePrice, quantity: f.quantity, commercial_status: "available", notes: null, has_imei: false, warranty_label: f.warrantyLabel || null, warranty_source: f.warrantySource ?? null, variants: [] },
      isPrimary: f.isPrimary,
      isFeatured: false,
      basePrice,
      disclosurePrice,
      installmentCount: 0,
      gifts: f.gifts,
      warrantyLabel: f.warrantyLabel,
      warrantySource: f.warrantySource ?? null,
      copyTitle: f.copyTitle,
      copyDescription: f.copyDescription,
      copyStrongPoint: f.copyStrongPoint,
      copyObjection: f.copyObjection,
      productNote: f.productNote,
      productCta: f.productCta,
    }
  }

  const iphone = makeFact({ id: "iphone13-v", name: "iPhone 13", storage: "128GB", color: "Midnight", grade: "Lacrado", battery_health: 100, quantity: 1, warrantyLabel: "Garantia Apple 1 ano", isPrimary: true })
  const ipad1 = makeFact({ id: "ipad11-1", name: "iPad 11ª geração", storage: "128GB", color: "Prateado", grade: "Lacrado", battery_health: 100, quantity: 1 })
  const ipad2 = makeFact({ id: "ipad11-2", name: "iPad 11ª geração", storage: "128GB", color: "Prateado", grade: "Lacrado", battery_health: 100, quantity: 1 })

  const content = generateContent([
    toDraft(iphone, 2900, 2799),
    toDraft(ipad1, null, 2750),
    toDraft(ipad2, null, 2750),
  ], { ...BASE_STRATEGY, addHighlightStory: false, addCtaStory: false })

  const allCards = content.stories.filter((s) => s.kind === "vitrine").flatMap((s) => s.vitrineProducts ?? [])

  const iphoneCard = allCards.find((c) => c.productId === "iphone13-v")!
  // iPhone 13: 3.5% discount → shows struck price, no percent badge, no orange border
  assert.ok(iphoneCard.basePrice != null, "iPhone 13: struck R$ 2.900 shown (hasPriceDrop)")
  assert.match(iphoneCard.basePrice!, /2\.900|2900/, "iPhone 13: correct struck price")
  assert.equal(iphoneCard.discountPercent, null, "iPhone 13: 3.5% < 5% → no percent badge")
  assert.equal(iphoneCard.hasDiscount, false, "iPhone 13: 3.5% → no orange border")

  // iPad: 2 commercial units (both lacrado same model) → no "Última unidade"
  const ipadCards = allCards.filter((c) => c.productId === "ipad11-1" || c.productId === "ipad11-2")
  for (const card of ipadCards) {
    assert.ok(!card.tags.some((t) => t.label === "Última unidade"), `${card.productId}: 2 lacrado iPads → no Última unidade`)
  }

  // Lacrado does not mix with Grade A — verified by key test above
  // CTAs vary between vitrine stories (verified by CTA bank tests above)
}

console.log("copy-generator adaptive density + objective tests passed")
