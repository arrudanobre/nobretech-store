import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapInventoryReportRows } from "./inventory-report"

type RawInventoryRow = Parameters<typeof mapInventoryReportRows>[0][number]
type InventoryFilters = Parameters<typeof mapInventoryReportRows>[1]

const filters: InventoryFilters = {
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  includeSold: true,
  includeInStock: true,
}

function inventoryRow(overrides: Partial<RawInventoryRow> = {}): RawInventoryRow {
  return {
    inventory_id: "inventory-1",
    purchase_date: "2026-05-01",
    purchase_price: 1000,
    suggested_price: 1400,
    status: "active",
    logistics_status: "in_stock",
    commercial_status: "available",
    origin: "purchase",
    supplier_id: "supplier-1",
    supplier_name: "Fornecedor texto",
    direct_supplier_name: "Fornecedor cadastrado",
    purchase_supplier_id: "supplier-1",
    purchase_supplier_name: "Fornecedor lote",
    purchase_supplier_registered_name: "Fornecedor cadastrado",
    imei: "123",
    imei2: null,
    serial_number: null,
    notes: null,
    condition_notes: null,
    category_name_snapshot: "iPhone",
    subcategory_name_snapshot: "iPhone 15",
    inventory_product_type: "device",
    catalog_category: "iPhone",
    catalog_brand: "Apple",
    catalog_model: "iPhone 15",
    catalog_variant: "128GB",
    catalog_storage: "128GB",
    catalog_color: "Preto",
    unit_cost: 950,
    freight_allocated: 30,
    other_cost_allocated: 20,
    landed_unit_cost: 1000,
    sale_id: null,
    sale_date: null,
    sale_value: null,
    sale_customer_name: null,
    sale_item_source: null,
    sale_additional_type: null,
    additional_item_name: null,
    ...overrides,
  }
}

describe("mapInventoryReportRows", () => {
  it("não duplica capacidade quando variante já contém storage", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        catalog_model: "iPhone 15 Pro",
        catalog_variant: "128GB",
        catalog_storage: "128GB",
        catalog_color: "Natural Titanium",
      }),
    ], filters, "2026-05-11")

    assert.equal(report.rows[0].product, "Apple iPhone 15 Pro 128GB Natural Titanium")
    assert.equal(report.rows[0].product.includes("128GB 128GB"), false)
  })

  it("inclui item em estoque no capital imobilizado", () => {
    const report = mapInventoryReportRows([inventoryRow()], filters, "2026-05-11")

    assert.equal(report.summary.totalItems, 1)
    assert.equal(report.summary.inStockItems, 1)
    assert.equal(report.summary.inventoryCapital, 1000)
    assert.equal(report.rows[0].idleCapital, 1000)
  })

  it("inclui item vendido em custo vendido e lucro realizado", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        status: "sold",
        commercial_status: "sold",
        sale_id: "sale-1",
        sale_date: "2026-05-10",
        sale_value: 1300,
        sale_customer_name: "Cliente",
      }),
    ], filters, "2026-05-16")

    assert.equal(report.summary.soldItems, 1)
    assert.equal(report.summary.inStockItems, 0)
    assert.equal(report.summary.inventoryCapital, 0)
    assert.equal(report.summary.soldItemsCost, 1000)
    assert.equal(report.summary.soldItemsRevenue, 1300)
    assert.equal(report.summary.realizedGrossProfit, 300)
    assert.equal(report.rows[0].grossProfit, 300)
  })

  it("não quebra item sem fornecedor", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        supplier_id: null,
        supplier_name: null,
        direct_supplier_name: null,
        purchase_supplier_id: null,
        purchase_supplier_name: null,
        purchase_supplier_registered_name: null,
      }),
    ], filters, "2026-05-16")

    assert.equal(report.rows[0].supplier, "Não informado")
  })

  it("calcula dias em estoque para vendido e item em estoque", () => {
    const report = mapInventoryReportRows([
      inventoryRow({ inventory_id: "stock", purchase_date: "2026-05-01" }),
      inventoryRow({
        inventory_id: "sold",
        purchase_date: "2026-05-01",
        status: "sold",
        commercial_status: "sold",
        sale_id: "sale-1",
        sale_date: "2026-05-06",
        sale_value: 1200,
      }),
    ], filters, "2026-05-11")

    assert.equal(report.rows.find((row) => row.inventoryId === "stock")?.daysInStock, 10)
    assert.equal(report.rows.find((row) => row.inventoryId === "sold")?.daysInStock, 5)
  })

  it("status sold não entra no capital imobilizado", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        status: "sold",
        commercial_status: "sold",
        sale_id: "sale-1",
        sale_date: "2026-05-10",
        sale_value: 1200,
      }),
    ], filters, "2026-05-16")

    assert.equal(report.summary.inventoryCapital, 0)
    assert.equal(report.rows[0].isOperationalStock, false)
  })

  it("status reserved continua no capital imobilizado", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        status: "reserved",
        commercial_status: "reserved",
        logistics_status: "in_stock",
      }),
    ], filters, "2026-05-16")

    assert.equal(report.summary.inStockItems, 1)
    assert.equal(report.summary.inventoryCapital, 1000)
    assert.equal(report.rows[0].isOperationalStock, true)
  })

  it("returned e under_repair não entram como disponível operacional", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        inventory_id: "returned",
        status: "returned",
        commercial_status: "blocked",
      }),
      inventoryRow({
        inventory_id: "repair",
        status: "under_repair",
        commercial_status: "blocked",
      }),
    ], { ...filters, status: "blocked" }, "2026-05-16")

    assert.equal(report.summary.inStockItems, 0)
    assert.equal(report.summary.inventoryCapital, 0)
    assert.equal(report.rows.every((row) => row.isOperationalStock === false), true)
  })

  it("item vendido via additional free aparece como Brinde", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        sale_id: "sale-1",
        sale_date: "2026-05-10",
        sale_value: 0,
        sale_item_source: "additional",
        sale_additional_type: "free",
        additional_item_name: "Película de brinde",
      }),
    ], filters, "2026-05-16")

    assert.equal(report.rows[0].saleExitType, "Brinde")
    assert.equal(report.rows[0].product, "Película de brinde")
    assert.equal(report.rows[0].grossProfit, -1000)
  })

  it("item vendido via additional upsell aparece como Upsell", () => {
    const report = mapInventoryReportRows([
      inventoryRow({
        catalog_model: "iPhone 13",
        catalog_variant: "128GB",
        catalog_storage: "128GB",
        catalog_color: "Estelar",
        sale_id: "sale-1",
        sale_date: "2026-05-10",
        sale_value: 2100,
        sale_item_source: "additional",
        sale_additional_type: "upsell",
        additional_item_name: "iPhone 13 128GB Estelar",
      }),
    ], filters, "2026-05-16")

    assert.equal(report.rows[0].saleExitType, "Upsell")
    assert.equal(report.rows[0].product, "iPhone 13 128GB Estelar")
    assert.notEqual(report.rows[0].saleExitType, "Brinde")
  })
})
