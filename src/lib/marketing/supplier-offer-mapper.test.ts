import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE,
  batteryDisplayForMarketingProduct,
  calculateSupplierOfferMargin,
  getSupplierOfferSelectorSummary,
  isSupplierOfferEligibleForMarketing,
  matchesSupplierOfferSearch,
  supplierOfferCampaignDefaults,
  supplierOfferConditionLabel,
  supplierOfferNeedsDisclosurePrice,
  supplierOfferRowToMarketingProduct,
  type SupplierOfferRow,
} from "./supplier-offer-mapper"
import { generateContent } from "./copy-generator"
import type { GeneralStrategy, MarketingProduct, ProductDraft } from "./copy-generator"
import { SUPERSEDABLE_STATUSES } from "@/lib/supplier-offers/types"

const baseRow: SupplierOfferRow = {
  id: "11111111-1111-1111-1111-111111111111",
  model: "iPhone 15 Pro",
  category: "iPhone",
  storage: "256GB",
  size: null,
  color: "Titânio Natural",
  brand: "Apple",
  condition: "sealed",
  internal_grade: "A+",
  battery_health: null,
  warranty_label: "Garantia Apple",
  supplier_price: "3000.00",
  suggested_sale_price: "4500.00",
  status: "available",
  supplier_name: "Fornecedor Secreto",
  supplier_id: "22222222-2222-2222-2222-222222222222",
}

describe("supplierOfferRowToMarketingProduct", () => {
  it("keeps sourceType supplier_offer and maps cost/supplier as internal fields", () => {
    const product = supplierOfferRowToMarketingProduct(baseRow)
    assert.equal(product.sourceType, "supplier_offer")
    assert.equal(product.id, baseRow.id)
    assert.equal(product.name, "iPhone 15 Pro 256GB Titânio Natural")
    assert.equal(product.supplierPrice, 3000)
    assert.equal(product.suggested_price, 4500)
    assert.equal(product.supplierName, "Fornecedor Secreto")
    assert.equal(product.supplierId, baseRow.supplier_id)
    assert.equal(product.commercial_status, "available")
  })

  it("flags non-available offers via commercial_status", () => {
    const product = supplierOfferRowToMarketingProduct({ ...baseRow, status: "superseded" })
    assert.equal(product.commercial_status, "superseded")
  })

  it("parses numeric string columns and tolerates nulls", () => {
    const product = supplierOfferRowToMarketingProduct({
      ...baseRow,
      condition: "used",
      supplier_price: null,
      suggested_sale_price: null,
      battery_health: "88",
    })
    assert.equal(product.supplierPrice, null)
    assert.equal(product.suggested_price, null)
    assert.equal(product.battery_health, 88)
  })

  it("maps condition and internal grade", () => {
    const product = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "used" })
    assert.equal(product.condition, "used")
    assert.equal(product.internalGrade, "A+")
  })

  it("maps condition to the public grade pipeline (Lacrado/Seminovo)", () => {
    assert.equal(supplierOfferRowToMarketingProduct({ ...baseRow, condition: "sealed" }).grade, "Lacrado")
    assert.equal(supplierOfferRowToMarketingProduct({ ...baseRow, condition: "used" }).grade, "Seminovo")
    assert.equal(supplierOfferRowToMarketingProduct({ ...baseRow, condition: "unknown" }).grade, null)
  })

  it("nulls battery for sealed devices even if the row carries a value", () => {
    const sealed = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "sealed", battery_health: 100 })
    assert.equal(sealed.battery_health, null)
    const used = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "used", battery_health: 88 })
    assert.equal(used.battery_health, 88)
  })
})

describe("supplierOfferConditionLabel", () => {
  it("maps sealed/used and falls back for unknown", () => {
    assert.equal(supplierOfferConditionLabel("sealed"), "Lacrado")
    assert.equal(supplierOfferConditionLabel("used"), "Seminovo")
    assert.equal(supplierOfferConditionLabel("unknown"), "Condição não informada")
    assert.equal(supplierOfferConditionLabel(null), "Condição não informada")
  })
})

describe("batteryDisplayForMarketingProduct", () => {
  it("hides battery for sealed", () => {
    assert.equal(
      batteryDisplayForMarketingProduct({ condition: "sealed", battery_health: 100, category: "iPhone", name: "iPhone 17", sourceType: "supplier_offer" }),
      "hidden"
    )
  })
  it("shows battery value for used with battery", () => {
    assert.equal(
      batteryDisplayForMarketingProduct({ condition: "used", battery_health: 88, category: "iPhone", name: "iPhone 13", sourceType: "supplier_offer" }),
      "value"
    )
  })
  it("flags missing battery for used iPhone/iPad without battery", () => {
    assert.equal(
      batteryDisplayForMarketingProduct({ condition: "used", battery_health: null, category: "iPhone", name: "iPhone 13", sourceType: "supplier_offer" }),
      "missing"
    )
  })
  it("does not demand battery for used watches/gadgets", () => {
    assert.equal(
      batteryDisplayForMarketingProduct({ condition: "used", battery_health: null, category: "Apple Watch", name: "Apple Watch S9", sourceType: "supplier_offer" }),
      "hidden"
    )
  })
})

describe("calculateSupplierOfferMargin", () => {
  it("computes a positive margin", () => {
    const m = calculateSupplierOfferMargin(4700, 5200)
    assert.equal(m.value, 500)
    assert.equal(m.status, "ok")
  })
  it("flags risk when disclosure is below cost", () => {
    const m = calculateSupplierOfferMargin(4700, 4600)
    assert.equal(m.value, -100)
    assert.equal(m.status, "risk")
  })
  it("flags risk when margin is exactly zero", () => {
    assert.equal(calculateSupplierOfferMargin(4700, 4700).status, "risk")
  })
  it("is unknown when a side is missing", () => {
    assert.deepEqual(calculateSupplierOfferMargin(null, 5200), { value: null, status: "unknown" })
    assert.deepEqual(calculateSupplierOfferMargin(4700, null), { value: null, status: "unknown" })
  })
})

describe("supplierOfferNeedsDisclosurePrice", () => {
  it("is true for supplier offers without a valid public price", () => {
    assert.equal(supplierOfferNeedsDisclosurePrice("supplier_offer", null), true)
    assert.equal(supplierOfferNeedsDisclosurePrice("supplier_offer", 0), true)
    assert.equal(supplierOfferNeedsDisclosurePrice("supplier_offer", -10), true)
    assert.equal(supplierOfferNeedsDisclosurePrice("supplier_offer", Number.NaN), true)
  })

  it("is false once a valid disclosure price exists", () => {
    assert.equal(supplierOfferNeedsDisclosurePrice("supplier_offer", 4500), false)
  })

  it("never blocks inventory products", () => {
    assert.equal(supplierOfferNeedsDisclosurePrice("inventory", null), false)
    assert.equal(supplierOfferNeedsDisclosurePrice(undefined, null), false)
  })

  it("exposes a clear, actionable message", () => {
    assert.match(SUPPLIER_OFFER_DISCLOSURE_PRICE_MESSAGE, /preço de divulgação/i)
  })
})

const strategy: GeneralStrategy = {
  objective: "sell_fast",
  channel: "whatsapp",
  tone: "consultivo",
  urgencyLevel: "none",
  generalCta: "",
  generalNote: "",
  angle: "",
}

function supplierDraft(): ProductDraft {
  const product: MarketingProduct = supplierOfferRowToMarketingProduct(baseRow)
  return {
    product,
    isPrimary: true,
    isFeatured: false,
    basePrice: 5000,
    disclosurePrice: 4500,
    installmentCount: 0,
    gifts: "",
    warrantyLabel: "Garantia Apple",
    copyTitle: "",
    copyDescription: "",
    copyStrongPoint: "",
    copyObjection: "",
    productNote: "",
    productCta: "",
  }
}

describe("supplier offer never leaks cost/supplier into public copy", () => {
  it("excludes supplierPrice and supplierName from generated channels", () => {
    const content = generateContent([supplierDraft()], strategy)
    const haystack = [
      content.whatsapp,
      content.instagram,
      JSON.stringify(content.stories),
      JSON.stringify(content.carousel),
    ].join("\n")

    // supplier_price 3000 ("3.000") must never surface; disclosure 4500 may.
    assert.equal(haystack.includes("3.000"), false)
    assert.equal(haystack.includes("3000"), false)
    assert.equal(haystack.includes("Fornecedor Secreto"), false)
    assert.ok(haystack.includes("4.500"), "public disclosure price should appear")
  })

  it("sealed supplier offer never produces a public battery tag", () => {
    const draft = supplierDraft()
    // Row says battery 100 but it is sealed — mapper must strip it everywhere.
    draft.product = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "sealed", battery_health: 100 })
    const content = generateContent([draft], strategy)
    assert.equal(content.facts[0].battery_health, null)
    const haystack = `${content.whatsapp}\n${content.instagram}\n${JSON.stringify(content.stories)}`
    assert.equal(/bateria|bat\.?\s*\d/i.test(haystack), false)
  })

  it("used supplier offer keeps its battery for public copy", () => {
    const draft = supplierDraft()
    draft.product = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "used", battery_health: 88 })
    const content = generateContent([draft], strategy)
    assert.equal(content.facts[0].battery_health, 88)
  })

  it("warns when a supplier offer has no disclosure price", () => {
    const draft = supplierDraft()
    // No suggested_sale_price seed and no manual price → genuinely priceless.
    draft.product = supplierOfferRowToMarketingProduct({ ...baseRow, suggested_sale_price: null })
    draft.disclosurePrice = null
    draft.basePrice = null
    const content = generateContent([draft], strategy)
    assert.ok(
      content.warnings.some((w) => w.includes("preço de divulgação")),
      "should warn about missing disclosure price"
    )
  })
})

describe("supplierOfferCampaignDefaults", () => {
  it("seeds supplier offer base with supplierPrice and disclosure with suggestion", () => {
    const product = supplierOfferRowToMarketingProduct(baseRow) // supplier 3000, suggested 4500
    assert.deepEqual(supplierOfferCampaignDefaults(product), { baseSeed: 3000, disclosureSeed: 4500 })
  })
  it("leaves disclosure empty when there is no suggested sale price", () => {
    const product = supplierOfferRowToMarketingProduct({ ...baseRow, suggested_sale_price: null })
    assert.deepEqual(supplierOfferCampaignDefaults(product), { baseSeed: 3000, disclosureSeed: null })
  })
  it("keeps inventory behavior (base = disclosure = suggested)", () => {
    const inv = { sourceType: "inventory" as const, supplierPrice: null, suggested_price: 999 }
    assert.deepEqual(supplierOfferCampaignDefaults(inv), { baseSeed: 999, disclosureSeed: 999 })
  })
})

describe("getSupplierOfferSelectorSummary", () => {
  it("summarizes sealed offer without battery", () => {
    const product = supplierOfferRowToMarketingProduct(baseRow)
    const s = getSupplierOfferSelectorSummary(product)
    assert.equal(s.conditionLabel, "Lacrado")
    assert.equal(s.battery, null)
    assert.equal(s.supplierPrice, 3000)
    assert.equal(s.suggestedPrice, 4500)
    assert.equal(s.hasSuggestion, true)
    assert.equal(s.supplierName, "Fornecedor Secreto")
    assert.equal(s.warrantyLabel, "Garantia Apple")
  })
  it("summarizes used offer with battery and no suggestion", () => {
    const product = supplierOfferRowToMarketingProduct({
      ...baseRow,
      condition: "used",
      battery_health: 88,
      suggested_sale_price: null,
    })
    const s = getSupplierOfferSelectorSummary(product)
    assert.equal(s.conditionLabel, "Seminovo")
    assert.equal(s.battery, 88)
    assert.equal(s.hasSuggestion, false)
    assert.equal(s.suggestedPrice, null)
  })
})

describe("matchesSupplierOfferSearch", () => {
  const miami = supplierOfferRowToMarketingProduct({
    ...baseRow,
    model: "iPhone 17 Pro Max",
    storage: "256GB",
    color: "Azul",
    condition: "sealed",
    supplier_name: "Miami Imports",
    supplier_price: "7800.00",
    suggested_sale_price: "9200.00",
  })
  const daviAirpods = supplierOfferRowToMarketingProduct({
    ...baseRow,
    model: "AirPods Pro 2",
    category: "airpods",
    storage: null,
    color: "Branco",
    supplier_name: "Davi Imports",
    supplier_price: "900.00",
    suggested_sale_price: "1190.00",
  })

  it("finds supplier offers by supplier name", () => {
    assert.equal(matchesSupplierOfferSearch(miami, "miami"), true)
    assert.equal(matchesSupplierOfferSearch(miami, "davi"), false)
  })

  it("matches tokens across product and supplier fields", () => {
    assert.equal(matchesSupplierOfferSearch(miami, "iphone 17 pro max miami"), true)
    assert.equal(matchesSupplierOfferSearch(daviAirpods, "davi airpods"), true)
    assert.equal(matchesSupplierOfferSearch(miami, "davi airpods"), false)
  })

  it("is case-insensitive and accent-insensitive", () => {
    assert.equal(matchesSupplierOfferSearch(miami, "MIAMI azul"), true)
    assert.equal(matchesSupplierOfferSearch({ ...miami, color: "Titânio Natural" }, "titanio miami"), true)
  })

  it("still searches product fields when supplierName is missing", () => {
    assert.equal(matchesSupplierOfferSearch({ ...miami, supplierName: null }, "iphone 17 azul"), true)
  })

  it("does not affect inventory products", () => {
    assert.equal(matchesSupplierOfferSearch({ ...miami, sourceType: "inventory", supplierName: "Miami Imports" }, "miami"), false)
  })
})

describe("isSupplierOfferEligibleForMarketing", () => {
  it("keeps available offers and excludes superseded by default", () => {
    assert.equal(isSupplierOfferEligibleForMarketing("available"), true)
    assert.equal(isSupplierOfferEligibleForMarketing("superseded"), false)
    assert.equal(isSupplierOfferEligibleForMarketing("canceled"), false)
  })
})

describe("public story condition pills for supplier offers", () => {
  it("sealed offer yields a Lacrado pill and no battery in the story", () => {
    const draft = supplierDraft()
    draft.product = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "sealed", battery_health: 100 })
    const content = generateContent([draft], strategy)
    const stories = JSON.stringify(content.stories)
    assert.ok(/Lacrado/.test(stories), "story should carry a Lacrado pill")
    assert.equal(/bat\.?\s*\d|bateria/i.test(stories), false)
  })
  it("used offer yields a Seminovo pill", () => {
    const draft = supplierDraft()
    draft.product = supplierOfferRowToMarketingProduct({ ...baseRow, condition: "used", battery_health: 88 })
    const content = generateContent([draft], strategy)
    assert.ok(/Seminovo/.test(JSON.stringify(content.stories)), "story should carry a Seminovo pill")
  })
})

describe("supersedePreviousOffers scope", () => {
  it("never supersedes reserved_with_supplier (active commitment)", () => {
    assert.equal(SUPERSEDABLE_STATUSES.includes("reserved_with_supplier"), false)
    assert.deepEqual(SUPERSEDABLE_STATUSES, ["available", "draft", "needs_review"])
  })
})
