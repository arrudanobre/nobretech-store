import type jsPDF from "jspdf"
import { formatBRL, formatDate } from "@/lib/helpers"

type SaleDocumentItem = {
  name: string
  imei?: string | null
  imei2?: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  warrantyMonths: number
}

export type ReceiptLineItem = {
  name: string
  imei?: string | null
  imei2?: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  warrantyMonths: number
  type: "principal" | "upsell" | "free"
}

export type ReceiptFinancialSummary = {
  officialProductTotal?: number
  saleTotal?: number
  discountAmount?: number
  tradeInName?: string | null
  tradeInGrade?: string | null
  tradeInValue?: number
  cashAmountDue?: number
  customerPaid?: number
  embeddedFee?: number
  storeReceives?: number
}

export type SaleDocumentData = {
  saleId: string
  saleDate: string
  sellerName?: string
  customerName: string
  customerCpf?: string | null
  customerPhone?: string | null
  paymentMethod: string
  saleNotes?: string | null
  additionalItems?: string | null
  item: SaleDocumentItem
  /** Optional: multiple line items for multi-product receipt */
  receiptItems?: ReceiptLineItem[]
  receiptSummary?: ReceiptFinancialSummary
}

const STORE_NAME = "NobreTech Store"
const STORE_PHONE = "98981680080"
const STORE_EMAIL = "nobretechstoreslz@gmail.com"
const STORE_ADDRESS = "Rua Santa Inês, 16"
const DEFAULT_SELLER = "Vinicius Arruda Nobre"
const NAVY = "#07162f"
const MID_GRAY = "#d9d9d9"
const TEXT_GRAY = "#4b5563"

const WARRANTY_TERMS = [
  { text: "A GARANTIA É CANCELADA AUTOMATICAMENTE NOS SEGUINTES CASOS:", bold: true },
  { text: "Em caso de quedas; esmagamentos; sobrecarga elétrica; exposição do aparelho a altas temperaturas; umidade ou líquidos; exposição do aparelho a poeira; pó e/ou limalha de metais; ou ainda quando atestado mau uso do aparelho por parte do comprador; instalações, modificações ou atualizações no seu sistema operacional; abertura do equipamento ou tentativa de concerto por terceiros." },
  { text: "E ainda:", bold: true },
  { text: "Tela do aparelho que apresente mau uso, trincados ou quebrados, riscados, manchados, descolados ou com cabo flex rompido não fazem parte desta garantia." },
  { text: "Vale lembrar que:", bold: true },
  { text: "1) A garantia é contada a partir da data de compra do aparelho e tem sua duração conforme a tabela acima.", bold: true },
  { text: "2) Funcionamento, instalação e atualização de aplicativos, bem como a sistema operacional e SAÚDE DA BATERIA do aparelho NÃO FAZEM parte desta garantia." },
  { text: "3) Limpeza e conservação do aparelho NÃO FAZEM parte desta garantia, assim como qualquer risco, arranhado, marca de queda ou algo do tipo que não havia no aparelho na hora da compra INVIABILIZARÁ ESTA GARANTIA." },
  { text: "4) A não apresentação deste documento que comprove o serviço INVALIDA a garantia." },
  { text: "5) Qualquer mal funcionamento APÓS ATUALIZAÇÕES do sistema operacional ou aplicativos NÃO FAZEM PARTE DESSA GARANTIA.", bold: true },
  { text: "6) A GARANTIA é válida somente para o item descrito neste termo de garantia, NÃO ABRANGENDO OUTRAS PARTES e respeitando as condições aqui descritas.", bold: true },
  { text: "7) TROCAS somente serão efetuadas após análise técnica dos aparelhos eletrônicos pela assistência técnica de nossa escolha com prazo máximo de 30 dias.", bold: true },
  { text: "8) Caso não seja possível a resolução do problema pela assistência técnica após o prazo de 30 dias o comprador receberá um novo produto equivalente ao comprado.", bold: true },
  { text: "9) Após 30 dias caso não seja possível a troca do produto por outro equivalente o comprador receberá o reembolso do valor pago (SOMENTE O VALOR ORIGINAL DO PRODUTO, NÃO INCLUINDO TAXAS E JUROS DE PARCELAMENTOS EM CARTÕES DE CRÉDITO OU BOLETO VIA CREDIÁRIO).", bold: true },
]

function receiptNumber(id: string) {
  const raw = id.replace(/\D/g, "")
  if (raw.length >= 8) return raw.slice(0, 8)
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function productDescription(item: SaleDocumentItem) {
  const imeis = [
    item.imei ? `IMEI 1: ${item.imei}` : null,
    item.imei2 ? `IMEI 2: ${item.imei2}` : null,
  ].filter(Boolean)

  return [item.name, ...imeis].join(" - ")
}

function warrantyLabel(months: number) {
  return `${months} ${months === 1 ? "mês" : "meses"}`
}

function setFont(doc: jsPDF, size: number, style: "normal" | "bold" = "normal", color = NAVY) {
  doc.setFont("helvetica", style)
  doc.setFontSize(size)
  doc.setTextColor(color)
}

function text(doc: jsPDF, value: string | string[], x: number, y: number, options?: Parameters<jsPDF["text"]>[3]) {
  doc.text(value || "", x, y, options)
}

function money(value: number) {
  return formatBRL(Number(value || 0))
}

function saleObservations(data: SaleDocumentData) {
  const parts = []
  if (data.saleNotes) parts.push(data.saleNotes)
  if (data.additionalItems) parts.push(`Itens Adicionais: ${data.additionalItems}`)
  return parts.length ? parts.join(". ") : ""
}

function drawSignature(doc: jsPDF, y: number, customerName: string) {
  doc.setDrawColor(90, 90, 90)
  doc.setLineWidth(0.3)
  doc.line(17, y, 91, y)
  doc.line(117, y, 191, y)
  setFont(doc, 9)
  text(doc, customerName || "Cliente", 54, y + 5, { align: "center" })
  text(doc, STORE_NAME, 154, y + 5, { align: "center" })
}

function drawWarrantyText(doc: jsPDF, x: number, y: number, maxWidth: number, lineHeight: number) {
  for (const item of WARRANTY_TERMS) {
    setFont(doc, 8.2, item.bold ? "bold" : "normal", TEXT_GRAY)
    const lines = doc.splitTextToSize(item.text, maxWidth)
    text(doc, lines, x, y)
    y += lines.length * lineHeight
  }
  return y
}

export async function generateReceiptPDF(data: SaleDocumentData) {
  const { default: JSPDF } = await import("jspdf")
  const doc = new JSPDF("p", "mm", "a4")
  const seller = data.sellerName || DEFAULT_SELLER
  const saleDate = formatDate(data.saleDate)
  const observations = saleObservations(data)

  // Resolve items — use receiptItems if available, fallback to single item
  const lines: ReceiptLineItem[] = data.receiptItems && data.receiptItems.length > 0
    ? data.receiptItems
    : [{ ...data.item, type: "principal" as const }]

  const productSubtotal = lines
    .filter((l) => l.type !== "free")
    .reduce((sum, l) => sum + l.totalPrice, 0)
  const summary = data.receiptSummary
  const saleTotal = Number(summary?.saleTotal ?? productSubtotal)
  const customerPaid = Number(summary?.customerPaid ?? saleTotal)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.35)

  // ── Header ──
  doc.rect(17, 28, 176, 16)
  doc.line(56, 28, 56, 44)
  doc.line(158, 28, 158, 44)
  setFont(doc, 15, "bold")
  text(doc, "NobreTech", 36.5, 36, { align: "center" })
  text(doc, "Store", 36.5, 41, { align: "center" })
  setFont(doc, 5.2, "bold")
  text(doc, STORE_NAME, 107, 31, { align: "center" })
  text(doc, STORE_PHONE, 107, 38, { align: "center" })
  text(doc, STORE_EMAIL, 107, 43, { align: "center" })
  setFont(doc, 9, "bold")
  text(doc, "DATA DA VENDA", 176, 36, { align: "center" })
  setFont(doc, 5.8, "bold")
  text(doc, saleDate, 176, 42, { align: "center" })

  setFont(doc, 9, "bold")
  text(doc, "Recibo", 101, 49, { align: "right" })
  setFont(doc, 9)
  text(doc, `#${receiptNumber(data.saleId)}`, 101, 49)
  setFont(doc, 9, "bold")
  text(doc, "Vendedor:", 101, 53, { align: "right" })
  setFont(doc, 9)
  text(doc, seller, 102, 53)

  // ── Consumer ──
  setFont(doc, 9, "bold")
  text(doc, "CONSUMIDOR", 17.5, 59)
  doc.setFillColor(MID_GRAY)
  doc.rect(17, 60, 176, 8, "S")
  doc.rect(17, 60, 88, 8, "S")
  doc.rect(105, 60, 26, 8, "S")
  doc.rect(131, 60, 35, 8, "S")
  doc.rect(166, 60, 27, 8, "S")
  doc.rect(17, 60, 176, 4, "F")
  setFont(doc, 8.2, "bold")
  text(doc, "Nome/Razão social", 17.8, 63)
  text(doc, "Nascimento", 106, 63)
  text(doc, "Telefone", 132, 63)
  text(doc, "CPF/CNPJ", 167, 63)
  setFont(doc, 8.2)
  text(doc, data.customerName, 17.8, 67)
  text(doc, data.customerPhone || "", 132, 67)
  text(doc, data.customerCpf || "", 167, 67)

  // ── Products table ──
  const ROW_H = 13
  const tableTop = 75
  setFont(doc, 9, "bold")
  text(doc, "PRODUTOS", 17.5, 74)

  const totalTableH = ROW_H * lines.length + 5 // header row(5) + data rows
  doc.rect(17, tableTop, 176, totalTableH + 5)
  // column dividers
  const colX = { sku: 17, desc: 40, guar: 128, qty: 142, unit: 151, total: 173 }
  doc.line(colX.desc, tableTop, colX.desc, tableTop + totalTableH + 5)
  doc.line(colX.guar, tableTop, colX.guar, tableTop + totalTableH + 5)
  doc.line(colX.qty, tableTop, colX.qty, tableTop + totalTableH + 5)
  doc.line(colX.unit, tableTop, colX.unit, tableTop + totalTableH + 5)
  doc.line(colX.total, tableTop, colX.total, tableTop + totalTableH + 5)

  doc.setFillColor(MID_GRAY)
  doc.rect(17, tableTop, 176, 5, "F")
  setFont(doc, 8.2, "bold")
  text(doc, "Tipo", 28.5, tableTop + 3.5, { align: "center" })
  text(doc, "Descrição", 84, tableTop + 3.5, { align: "center" })
  text(doc, "Garantia", 135, tableTop + 3.5, { align: "center" })
  text(doc, "Qtd", 146.5, tableTop + 3.5, { align: "center" })
  text(doc, "Valor Unit.", 162, tableTop + 3.5, { align: "center" })
  text(doc, "Total", 183, tableTop + 3.5, { align: "center" })

  setFont(doc, 8.2)
  lines.forEach((line, idx) => {
    const rowY = tableTop + 5 + idx * ROW_H
    const isFree = line.type === "free"
    const typeLabel = line.type === "principal" ? "Principal" : line.type === "upsell" ? "Upsell" : "Brinde"
    const descLine = [
      line.name,
      line.imei ? `IMEI: ${line.imei}` : null,
      line.imei2 ? `IMEI 2: ${line.imei2}` : null,
    ].filter(Boolean).join(" — ")
    const descLines = doc.splitTextToSize(descLine, 84).slice(0, 2)
    text(doc, typeLabel, 28.5, rowY + 7, { align: "center" })
    text(doc, descLines, 41, rowY + 4.6)
    text(doc, warrantyLabel(line.warrantyMonths), 135, rowY + 7, { align: "center" })
    text(doc, String(line.quantity), 146.5, rowY + 7, { align: "center" })
    text(doc, isFree ? "—" : money(line.unitPrice), 162, rowY + 7, { align: "center" })
    text(doc, isFree ? "Brinde" : money(line.totalPrice), 183, rowY + 7, { align: "center" })
    if (idx < lines.length - 1) doc.line(17, rowY + ROW_H, 193, rowY + ROW_H)
  })

  const afterTableY = tableTop + totalTableH + 5
  doc.rect(151, afterTableY, 42, 4)
  setFont(doc, 8.2, "bold")
  text(doc, "Total", 152, afterTableY + 3)
  text(doc, money(productSubtotal), 183, afterTableY + 3, { align: "center" })

  let settlementY = afterTableY + 7
  if (summary && (
    Number(summary.discountAmount || 0) > 0 ||
    Number(summary.tradeInValue || 0) > 0 ||
    Number(summary.embeddedFee || 0) > 0 ||
    Number(summary.cashAmountDue || 0) !== customerPaid
  )) {
    const tradeInLine = summary.tradeInName
      ? `${summary.tradeInName}${summary.tradeInGrade ? ` - Classe ${summary.tradeInGrade}` : ""}`
      : "Aparelho recebido no trade-in"
    const settlementRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Valor oficial dos produtos", value: money(productSubtotal) },
    ]

    if (Number(summary.discountAmount || 0) > 0) {
      settlementRows.push({
        label: "Desconto concedido",
        value: `-${money(Number(summary.discountAmount || 0))}`,
      })
    }

    settlementRows.push({ label: "Valor final da venda", value: money(saleTotal) })

    if (Number(summary.tradeInValue || 0) > 0) {
      settlementRows.push({
        label: `Trade-in recebido: ${tradeInLine}`,
        value: `-${money(Number(summary.tradeInValue || 0))}`,
      })
    }

    settlementRows.push({
      label: "Saldo em dinheiro/cartão",
      value: money(Number(summary.cashAmountDue ?? customerPaid)),
    })

    if (Number(summary.embeddedFee || 0) > 0) {
      settlementRows.push({
        label: "Taxa embutida no pagamento",
        value: money(Number(summary.embeddedFee || 0)),
      })
    }

    settlementRows.push({ label: "Cliente pagou", value: money(customerPaid), bold: true })

    const settlementH = 8 + settlementRows.length * 4.4

    doc.rect(17, settlementY, 176, settlementH)
    doc.setFillColor(245, 246, 247)
    doc.rect(17, settlementY, 176, 5, "F")
    setFont(doc, 8.2, "bold")
    text(doc, "ACERTOS DA NEGOCIAÇÃO", 19, settlementY + 3.5)

    settlementRows.forEach((row, index) => {
      const rowY = settlementY + 9.5 + index * 4.4
      setFont(doc, row.bold ? 7.8 : 7.2, row.bold ? "bold" : "normal")
      text(doc, doc.splitTextToSize(row.label, 132).slice(0, 1), 20, rowY)
      text(doc, row.value, 190, rowY, { align: "right" })
    })

    settlementY += settlementH + 3
  }

  // ── Payment ──
  const payY = settlementY
  setFont(doc, 9, "bold")
  text(doc, "PAGAMENTO", 17.5, payY)
  doc.rect(17, payY + 1, 176, 5)
  doc.line(158, payY + 1, 158, payY + 6)
  doc.setFillColor(MID_GRAY)
  doc.rect(17, payY + 1, 176, 5, "F")
  setFont(doc, 8.2, "bold")
  text(doc, "Forma de Pagamento", 87, payY + 5, { align: "center" })
  text(doc, "Valor Pago", 176, payY + 5, { align: "center" })
  setFont(doc, 8.2)
  text(doc, data.paymentMethod, 87, payY + 10, { align: "center" })
  text(doc, money(customerPaid), 176, payY + 10, { align: "center" })

  // ── Observations ──
  const obsY = payY + 13
  setFont(doc, 9, "bold")
  text(doc, "OBSERVAÇÕES DA VENDA", 17.5, obsY)
  doc.rect(17, obsY + 1, 176, 12)
  setFont(doc, 8.4)
  text(doc, doc.splitTextToSize(observations, 172), 19, obsY + 5.5)

  // ── Warranty terms ──
  const termsY = obsY + 17
  doc.rect(17, termsY, 176, Math.min(109, 297 - termsY - 30))
  doc.line(17, termsY + 4, 193, termsY + 4)
  setFont(doc, 8.6, "bold")
  text(doc, "DADOS ADICIONAIS", 19.5, termsY + 3)
  drawWarrantyText(doc, 19.5, termsY + 8, 171, 4.05)
  drawSignature(doc, termsY + 113, data.customerName)

  doc.save(`Recibo-${safeFileName(data.customerName)}-${receiptNumber(data.saleId)}.pdf`)
}

export async function generateWarrantyPDF(data: SaleDocumentData) {
  const { default: JSPDF } = await import("jspdf")
  const doc = new JSPDF("p", "mm", "a4")
  const seller = data.sellerName || DEFAULT_SELLER
  const saleDate = formatDate(data.saleDate)
  const desc = productDescription(data.item)

  setFont(doc, 13, "bold")
  text(doc, STORE_NAME, 105, 27, { align: "center" })

  doc.setFillColor(245, 246, 247)
  doc.rect(17, 31, 176, 11, "F")
  doc.setDrawColor(230, 232, 235)
  doc.setLineWidth(0.25)
  for (let x = 20; x < 190; x += 6) {
    for (let y = 33; y < 41; y += 5) {
      doc.circle(x, y, 2.2, "S")
      doc.circle(x, y, 0.9, "S")
    }
  }
  setFont(doc, 20, "normal", "#5f6873")
  text(doc, "TERMO DE GARANTIA", 105, 39, { align: "center" })

  setFont(doc, 8.5, "normal", "#5f6873")
  text(doc, "CLIENTE", 25, 49)
  setFont(doc, 8.5)
  text(doc, data.customerName, 40, 49)
  setFont(doc, 8.5, "normal", "#5f6873")
  text(doc, "CPF/CNPJ", 23, 53)
  setFont(doc, 8.5)
  text(doc, data.customerCpf || "", 40, 53)
  setFont(doc, 8.5, "normal", "#5f6873")
  text(doc, "TELEFONE", 21, 57)
  setFont(doc, 8.5)
  text(doc, data.customerPhone || "", 40, 57)

  setFont(doc, 8.5)
  text(doc, STORE_NAME, 194, 49, { align: "right" })
  text(doc, STORE_ADDRESS, 194, 53, { align: "right" })
  text(doc, STORE_PHONE, 194, 57, { align: "right" })
  setFont(doc, 8.5, "normal", "#6b7280")
  text(doc, STORE_EMAIL, 194, 61, { align: "right" })
  setFont(doc, 8.5)
  text(doc, `Vendedor: ${seller}`, 194, 65, { align: "right" })
  text(doc, `Data da Venda: ${saleDate}`, 194, 73, { align: "right" })

  setFont(doc, 8.5, "normal", "#6b7280")
  text(doc, "DESCRIÇÃO", 91, 82, { align: "center" })
  text(doc, "GARANTIA", 176, 82, { align: "center" })
  doc.setDrawColor(205, 213, 222)
  doc.line(17, 83, 193, 83)
  doc.setFillColor(245, 245, 245)
  doc.rect(17, 83, 176, 4, "F")
  setFont(doc, 8.2)
  text(doc, doc.splitTextToSize(desc, 148).slice(0, 1), 17, 86)
  text(doc, warrantyLabel(data.item.warrantyMonths), 176, 86, { align: "center" })

  setFont(doc, 8.5, "normal", "#6b7280")
  text(doc, "DADOS ADICIONAIS", 105, 94, { align: "center" })
  doc.line(17, 95, 193, 95)

  setFont(doc, 72, "bold", "#f4f4f4")
  text(doc, "NT", 130, 170)
  drawWarrantyText(doc, 17, 100, 176, 4.45)
  drawSignature(doc, 249, data.customerName)

  doc.save(`${safeFileName(data.item.name)} - Garantia.pdf`)
}
