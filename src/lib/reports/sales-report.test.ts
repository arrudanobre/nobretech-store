import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapSalesReportRows } from "./sales-report"

type RawReportRow = Parameters<typeof mapSalesReportRows>[0][number]

function saleRow(overrides: Partial<RawReportRow> = {}): RawReportRow {
  return {
    sale_id: "sale-1",
    sale_date: "2026-05-16",
    sale_status: "completed",
    payment_status: "paid",
    sale_price: 1000,
    net_amount: 1000,
    supplier_cost: null,
    payment_method: "pix",
    has_trade_in: false,
    trade_in_id: null,
    trade_in_value: null,
    trade_in_notes: null,
    trade_in_grade: null,
    trade_in_imei: null,
    trade_in_serial_number: null,
    trade_in_inventory_imei: null,
    trade_in_inventory_serial_number: null,
    trade_in_model: null,
    trade_in_variant: null,
    trade_in_storage: null,
    trade_in_color: null,
    payment_due_date: "2026-05-16",
    notes: null,
    customer_name: "Cliente Teste",
    imei: null,
    imei2: null,
    serial_number: "SERIAL-1",
    inventory_purchase_price: 600,
    inventory_suggested_price: 1000,
    inventory_product_type: "Produto",
    category_name_snapshot: "Categoria",
    subcategory_name_snapshot: "Subcategoria",
    catalog_category: "Categoria",
    catalog_brand: "Apple",
    catalog_model: "iPhone",
    catalog_variant: "128GB",
    catalog_storage: "128GB",
    catalog_color: "Preto",
    freight_allocated: 0,
    other_cost_allocated: 0,
    landed_unit_cost: null,
    additional_items: [],
    payments: [
      {
        id: "payment-1",
        payment_method: "pix",
        amount: 1000,
        status: "received",
        due_date: "2026-05-16",
        received_date: "2026-05-16",
        financial_account_id: "account-1",
        transaction_id: "transaction-1",
        financial_account_name: "Conta teste",
        transaction_status: "paid",
        reconciled_at: "2026-05-16",
        movement_id: "movement-1",
      },
    ],
    ...overrides,
  }
}

describe("mapSalesReportRows", () => {
  it("mantém custo total igual ao produto principal quando não há brinde", () => {
    const report = mapSalesReportRows([saleRow()])
    const line = report.rows[0]

    assert.equal(line.mainProductCost, 600)
    assert.equal(line.additionalItemsCost, 0)
    assert.equal(line.totalSaleCost, 600)
    assert.equal(line.grossCommercialProfit, 400)
    assert.equal(report.totals.mainProductCostTotal, 600)
    assert.equal(report.totals.additionalItemsCostTotal, 0)
    assert.equal(report.totals.productCostTotal, 600)
  })

  it("soma custo de brinde ao custo total da venda", () => {
    const report = mapSalesReportRows([
      saleRow({
        additional_items: [
          {
            id: "gift-1",
            type: "free",
            name: "Película",
            cost_price: 50,
            sale_price: 0,
            profit: -50,
          },
        ],
      }),
    ])
    const line = report.rows[0]

    assert.equal(line.mainProductCost, 600)
    assert.equal(line.additionalItemsCost, 50)
    assert.equal(line.totalSaleCost, 650)
    assert.equal(line.grossCommercialProfit, 350)
    assert.equal(report.totals.additionalItemsCostTotal, 50)
    assert.equal(report.totals.productCostTotal, 650)
    assert.equal(report.totals.hasAdditionalItemsCost, true)
  })

  it("separa trade-in do caixa e mantém brinde como custo", () => {
    const report = mapSalesReportRows([
      saleRow({
        has_trade_in: true,
        trade_in_value: 300,
        additional_items: [
          {
            id: "gift-1",
            type: "free",
            name: "Capa",
            cost_price: 50,
            sale_price: 0,
            profit: -50,
          },
        ],
        payments: [
          {
            id: "payment-trade-in",
            payment_method: "trade_in_credit",
            amount: 300,
            status: "received",
            due_date: "2026-05-16",
            received_date: "2026-05-16",
            financial_account_id: null,
            transaction_id: null,
            financial_account_name: null,
            transaction_status: null,
            reconciled_at: null,
            movement_id: null,
          },
          {
            id: "payment-pix",
            payment_method: "pix",
            amount: 700,
            status: "received",
            due_date: "2026-05-16",
            received_date: "2026-05-16",
            financial_account_id: "account-1",
            transaction_id: "transaction-1",
            financial_account_name: "Conta teste",
            transaction_status: "paid",
            reconciled_at: "2026-05-16",
            movement_id: "movement-1",
          },
        ],
      }),
    ])
    const line = report.rows[0]

    assert.equal(line.tradeInCredit, 300)
    assert.equal(line.financialReceivedValue, 700)
    assert.equal(line.additionalItemsCost, 50)
    assert.equal(line.totalSaleCost, 650)
    assert.equal(line.grossCommercialProfit, 350)
    assert.equal(report.totals.tradeInCreditTotal, 300)
    assert.equal(report.totals.totalReceived, 700)
    assert.equal(report.totals.productCostTotal, 650)
  })

  it("não exibe número solto como data real em pagamento pendente", () => {
    const report = mapSalesReportRows([
      saleRow({
        payment_status: "pending",
        payments: [
          {
            id: "payment-pending",
            payment_method: "pix",
            amount: 1000,
            status: "pending",
            due_date: "2026-05-20",
            received_date: 64,
            financial_account_id: "account-1",
            transaction_id: "transaction-1",
            financial_account_name: "Conta teste",
            transaction_status: "pending",
            reconciled_at: 64,
            movement_id: null,
          },
        ],
      }),
    ])
    const line = report.rows[0]
    const paymentLine = report.paymentRows[0]

    assert.equal(line.financialReceivedValue, 0)
    assert.equal(line.actualReceiptDate, "")
    assert.equal(paymentLine.reconciledDate, "")
    assert.equal(report.totals.totalReceived, 0)
    assert.equal(report.totals.totalPending, 1000)
  })
})
