import assert from "node:assert/strict"
import {
  filterMainDisclosureSuggestionCandidates,
  isMainDisclosureSuggestionProduct,
} from "./product-suggestions"

{
  assert.equal(
    isMainDisclosureSuggestionProduct({
      productType: "accessory",
      category: "accessories",
      model: "Capa Trifold para iPad A16",
      name: "Capa Trifold para iPad A16",
    }),
    false,
    "accessories do not qualify as main suggestions"
  )
}

{
  assert.equal(
    isMainDisclosureSuggestionProduct({
      category: "iPad",
      model: "Capa Trifold para iPad A16",
      name: "Capa Trifold para iPad A16",
    }),
    false,
    "capa does not qualify even when the name mentions iPad"
  )
}

{
  for (const name of ["Película 9D iPhone", "Carregador USB-C 20W", "Caneta Stylus para iPad", "Cover iPad", "Cable USB-C"]) {
    assert.equal(
      isMainDisclosureSuggestionProduct({ category: "accessories", name }),
      false,
      `${name} does not qualify as a main suggestion`
    )
  }
}

{
  assert.equal(
    isMainDisclosureSuggestionProduct({
      productType: "device",
      category: "iphone",
      model: "iPhone 13",
      name: "iPhone 13 128GB Midnight",
      hasDeviceIdentifier: true,
    }),
    true,
    "iPhone qualifies as a main suggestion"
  )
  assert.equal(
    isMainDisclosureSuggestionProduct({
      category: "ipad",
      model: "iPad 11",
      name: "iPad 11 128GB Prateado",
    }),
    true,
    "iPad qualifies as a main suggestion"
  )
}

{
  const candidates = [
    { category: "accessories", name: "Capa Trifold" },
    { category: "iphone", name: "iPhone 13" },
    { category: "ipad", name: "iPad 11" },
    { category: "macbook", name: "MacBook Air M1" },
    { category: "applewatch", name: "Apple Watch SE" },
    { category: "iphone", name: "iPhone 15 Pro" },
    { category: "ipad", name: "iPad Air" },
  ]
  const filtered = filterMainDisclosureSuggestionCandidates(candidates, 5)
  assert.equal(filtered.length, 5, "suggestions respect top 5 after filtering accessories")
  assert.deepEqual(filtered.map((item) => item.name), ["iPhone 13", "iPad 11", "MacBook Air M1", "Apple Watch SE", "iPhone 15 Pro"])
}

{
  assert.equal(
    isMainDisclosureSuggestionProduct({
      productType: "accessory",
      category: "airpods",
      model: "AirPods Pro",
      name: "AirPods Pro 2",
    }),
    false,
    "AirPods only qualify when the system marks them as device-like"
  )
  assert.equal(
    isMainDisclosureSuggestionProduct({
      productType: "device",
      category: "airpods",
      model: "AirPods Pro",
      name: "AirPods Pro 2",
    }),
    true,
    "AirPods qualify when product_type says device"
  )
}
