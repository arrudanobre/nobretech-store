import assert from "node:assert/strict"
import { composeProductLabel } from "./product-label"

// dedup: model starts with category, single word
assert.equal(composeProductLabel("iPad", "iPad (11ª geração)"), "iPad (11ª geração)")
assert.equal(composeProductLabel("iPhone", "iPhone 14"), "iPhone 14")

// dedup: case/accent-insensitive
assert.equal(composeProductLabel("Iphone", "iphone 14"), "iphone 14")
assert.equal(composeProductLabel("Câmeras", "câmeras Sony"), "câmeras Sony")

// plural category: singularize + em-dash
assert.equal(composeProductLabel("Acessórios", "Apple Pencil"), "Acessório — Apple Pencil")
assert.equal(composeProductLabel("Acessórios", "Apple Pencil (1ª geração)"), "Acessório — Apple Pencil (1ª geração)")
assert.equal(composeProductLabel("Câmeras", "Sony A7"), "Câmera — Sony A7")

// singular category, no prefix match: simple space concat
assert.equal(composeProductLabel("Apple Watch", "Series 9"), "Apple Watch Series 9")

// empty fallbacks
assert.equal(composeProductLabel(null, "iPad 9"), "iPad 9")
assert.equal(composeProductLabel("iPad", null), "iPad")
assert.equal(composeProductLabel(null, null), "Produto sem nome")
assert.equal(composeProductLabel("", ""), "Produto sem nome")

// no duplicate token even when model has multiple tokens starting with category
assert.equal(composeProductLabel("iPad", "iPad Air 5ª geração"), "iPad Air 5ª geração")

// category with two words: model must start with both
assert.equal(composeProductLabel("Apple Watch", "Apple Watch Series 9"), "Apple Watch Series 9")
assert.equal(composeProductLabel("Apple Watch", "Series 9"), "Apple Watch Series 9")

console.log("product-label tests passed")
