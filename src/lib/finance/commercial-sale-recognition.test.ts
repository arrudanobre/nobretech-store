import assert from "node:assert/strict"
import { isCommercialSale, isCommercialSaleSource, COMMERCIAL_SALE_SOURCE_TYPES } from "./finance-source-of-truth"
import { calcSaleTotals } from "../sale-totals"

// Origens comerciais: own (estoque próprio) + supplier (venda intermediada).
assert.deepEqual([...COMMERCIAL_SALE_SOURCE_TYPES].sort(), ["own", "supplier"])
assert.equal(isCommercialSaleSource("own"), true)
assert.equal(isCommercialSaleSource("supplier"), true)
assert.equal(isCommercialSaleSource(null), true) // default "own"
assert.equal(isCommercialSaleSource("reseller"), false)

// Venda own concluída entra.
assert.equal(isCommercialSale({ source_type: "own", sale_status: "completed" }), true)
// Venda supplier (intermediada) concluída AGORA entra (correção do incidente).
assert.equal(isCommercialSale({ source_type: "supplier", sale_status: "completed" }), true)
assert.equal(isCommercialSale({ source_type: "supplier", sale_status: "sold" }), true)
// Status não-comercial não entra (cancelada/pendente/reserva).
assert.equal(isCommercialSale({ source_type: "supplier", sale_status: "cancelled" }), false)
assert.equal(isCommercialSale({ source_type: "own", sale_status: "pending" }), false)
assert.equal(isCommercialSale({ source_type: "own", sale_status: "reservation" }), false)
// Status ausente assume "completed" (paridade com comportamento atual do dashboard).
assert.equal(isCommercialSale({ source_type: "own" }), true)
assert.equal(isCommercialSale({ source_type: "supplier" }), true)

// Lucro: supplier usa supplier_cost (sale_price - supplier_cost), sem double-count.
// iPhone 17 Pro Max do incidente: 8690 - 8200 = 490.
const supplierProfit = calcSaleTotals({ salePrice: 8690, mainCost: 8200, supplierCost: 8200 }).lucroTotal
assert.equal(supplierProfit, 490)
// own usa custo do estoque (purchase_price) quando não há supplier_cost.
const ownProfit = calcSaleTotals({ salePrice: 2670, mainCost: 2180, supplierCost: null }).lucroTotal
assert.equal(ownProfit, 490)

console.log("commercial-sale-recognition: OK")
