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
  warranty?: DocumentItemWarranty
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
  warranty?: DocumentItemWarranty
}

export type DocumentItemWarranty = {
  source: "item" | "legacy" | "none"
  name?: string | null
  label?: string | null
  nature?: string | null
  startsAt?: string | null
  endsAt?: string | null
  durationMonths?: number | null
  durationDays?: number | null
  note?: string | null
}

export type DocumentWarrantyItem = {
  saleItemId?: string | null
  name: string
  role?: string | null
  type?: string | null
  warranty: DocumentItemWarranty
}

export type DocumentWarranty = {
  mode: "item" | "legacy"
  items: DocumentWarrantyItem[]
  legacyWarranty: {
    months: number
    startsAt: string | null
    endsAt: string | null
  } | null
}

export type SaleDocumentCompany = {
  displayName?: string | null
  shortName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  sellerName?: string | null
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

export type ReceiptPaymentLine = {
  method: string
  amount: number
}

export type SaleDocumentData = {
  saleId: string
  saleDate: string
  company?: SaleDocumentCompany | null
  sellerName?: string
  customerName: string
  customerCpf?: string | null
  customerPhone?: string | null
  paymentMethod: string
  saleNotes?: string | null
  additionalItems?: string | null
  item: SaleDocumentItem
  payments?: ReceiptPaymentLine[]
  /** Optional: multiple line items for multi-product receipt */
  receiptItems?: ReceiptLineItem[]
  receiptSummary?: ReceiptFinancialSummary
  documentWarranty?: DocumentWarranty | null
}

const DEFAULT_STORE_NAME = "Loja"
const NAVY = "#07162f"
const MID_GRAY = "#d9d9d9"
const TEXT_GRAY = "#4b5563"
const PAGE_TOP = 20
const PAGE_BOTTOM = 277

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

function warrantyLabel(months: number) {
  return `${months} ${months === 1 ? "mês" : "meses"}`
}

function companyDisplayName(company?: SaleDocumentCompany | null) {
  return company?.displayName?.trim() || company?.shortName?.trim() || DEFAULT_STORE_NAME
}

function companyShortName(company?: SaleDocumentCompany | null) {
  return company?.shortName?.trim() || company?.displayName?.trim() || null
}

function storeWarrantyLabel(company?: SaleDocumentCompany | null) {
  const shortName = companyShortName(company)
  return shortName ? `Garantia ${shortName}` : "Garantia da loja"
}

function noContractualWarrantyLabel(company?: SaleDocumentCompany | null) {
  const shortName = companyShortName(company)
  return shortName
    ? `Sem Garantia ${shortName} contratual vinculada a este item.`
    : "Sem garantia contratual da loja vinculada a este item."
}

const NO_CONTRACTUAL_WARRANTY_TABLE_LABEL = "Sem garantia contratual"
const NO_CONTRACTUAL_WARRANTY_NOTE = "Brindes, capas, películas e acessórios simples não herdam a garantia contratual do aparelho principal. Danos por uso, queda, impacto, riscos, mau uso ou desgaste natural não são cobertos como garantia contratual."
const WARRANTY_TERMS_SECTION_HEIGHT = 238

function hasItemWithoutContractualWarranty(items: Array<{ warranty?: DocumentItemWarranty }>) {
  return items.some((item) => item.warranty?.source === "none")
}

function itemWarrantyLabel(
  warranty: DocumentItemWarranty | undefined,
  fallbackMonths: number,
  company?: SaleDocumentCompany | null,
  options: { compactNone?: boolean } = {}
) {
  if (!warranty) return warrantyLabel(fallbackMonths)
  if (warranty.source === "none") return options.compactNone ? NO_CONTRACTUAL_WARRANTY_TABLE_LABEL : warranty.label || noContractualWarrantyLabel(company)
  if (warranty.source === "legacy") return warranty.label || warrantyLabel(fallbackMonths)
  if (warranty.nature === "manufacturer" && !warranty.endsAt) return "Conforme cobertura do fabricante."

  if (options.compactNone) {
    const duration = warranty.durationMonths
      ? `${warranty.durationMonths} meses`
      : warranty.durationDays
        ? `${warranty.durationDays} dias`
        : null
    if (warranty.nature === "manufacturer") return duration ? `Apple ${duration}` : "Fabricante"
    if (warranty.nature === "contractual") return duration ? `Loja ${duration}` : "Loja"
  }

  const baseLabel = warranty.nature === "contractual"
    ? warranty.label || storeWarrantyLabel(company)
    : warranty.label || warranty.name || "Garantia vinculada"
  const period = warranty.startsAt && warranty.endsAt
    ? `${formatDate(warranty.startsAt)} a ${formatDate(warranty.endsAt)}`
    : warranty.startsAt
      ? `Início em ${formatDate(warranty.startsAt)}`
      : null
  return period ? `${baseLabel} (${period})` : baseLabel
}

function documentWarrantyItems(data: SaleDocumentData) {
  if (data.documentWarranty?.mode === "item") return data.documentWarranty.items
  return [{
    name: data.item.name,
    role: "principal",
    type: "device",
    warranty: {
      source: "legacy" as const,
      label: warrantyLabel(data.item.warrantyMonths),
      startsAt: data.documentWarranty?.legacyWarranty?.startsAt || null,
      endsAt: data.documentWarranty?.legacyWarranty?.endsAt || null,
      durationMonths: data.item.warrantyMonths,
    },
  }]
}

function setFont(doc: jsPDF, size: number, style: "normal" | "bold" = "normal", color = NAVY) {
  doc.setFont("helvetica", style)
  doc.setFontSize(size)
  doc.setTextColor(color)
}

function text(doc: jsPDF, value: string | string[], x: number, y: number, options?: Parameters<jsPDF["text"]>[3]) {
  doc.text(value || "", x, y, options)
}

function ensurePageSpace(doc: jsPDF, y: number, needed: number, top = PAGE_TOP) {
  if (y + needed <= PAGE_BOTTOM) return y
  doc.addPage()
  return top
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

function drawSignature(doc: jsPDF, y: number, customerName: string, companyName: string) {
  doc.setDrawColor(90, 90, 90)
  doc.setLineWidth(0.3)
  doc.line(17, y, 91, y)
  doc.line(117, y, 191, y)
  setFont(doc, 9)
  text(doc, customerName || "Cliente", 54, y + 5, { align: "center" })
  text(doc, companyName, 154, y + 5, { align: "center" })
}

function drawWarrantyText(doc: jsPDF, x: number, y: number, maxWidth: number, lineHeight: number) {
  for (const item of WARRANTY_TERMS) {
    setFont(doc, 8.2, item.bold ? "bold" : "normal", TEXT_GRAY)
    const lines = doc.splitTextToSize(item.text, maxWidth)
    for (const line of lines) {
      y = ensurePageSpace(doc, y, lineHeight)
      text(doc, line, x, y)
      y += lineHeight
    }
    y += 1.2
  }
  return y
}

function drawWarrantyTermsBox(doc: jsPDF, y: number) {
  doc.setDrawColor(0, 0, 0)
  doc.rect(17, y, 176, WARRANTY_TERMS_SECTION_HEIGHT)
  doc.line(17, y + 4, 193, y + 4)
  setFont(doc, 8.6, "bold")
  text(doc, "DADOS ADICIONAIS", 19.5, y + 3)
}

function drawReceiptWarrantyTerms(doc: jsPDF, y: number) {
  let cursorY = ensurePageSpace(doc, y, WARRANTY_TERMS_SECTION_HEIGHT)
  drawWarrantyTermsBox(doc, cursorY)
  cursorY += 8

  for (const item of WARRANTY_TERMS) {
    setFont(doc, 8.2, item.bold ? "bold" : "normal", TEXT_GRAY)
    const lines = doc.splitTextToSize(item.text, 171)
    for (const line of lines) {
      if (cursorY + 4.05 > PAGE_BOTTOM - 16) {
        doc.addPage()
        cursorY = PAGE_TOP
        drawWarrantyTermsBox(doc, cursorY)
        cursorY += 8
      }
      text(doc, line, 19.5, cursorY)
      cursorY += 4.05
    }
    cursorY += 1.2
  }

  return cursorY
}

async function savePdfDocument(doc: jsPDF, filename: string) {
  const nav = globalThis.navigator as (Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }) | undefined
  const blob = doc.output("blob")
  const file = typeof File !== "undefined" ? new File([blob], filename, { type: "application/pdf" }) : null
  const canShareFile = Boolean(file && nav?.canShare?.({ files: [file] }))
  const isTouchDevice = typeof nav?.maxTouchPoints === "number" && nav.maxTouchPoints > 0

  if (file && canShareFile && isTouchDevice && nav?.share) {
    try {
      await nav.share({ files: [file], title: filename })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
    }
  }

  if (typeof document !== "undefined" && typeof URL !== "undefined") {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.rel = "noopener"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }

  doc.save(filename)
}

export async function generateReceiptPDF(data: SaleDocumentData) {
  const { default: JSPDF } = await import("jspdf")
  const doc = new JSPDF("p", "mm", "a4")
  const companyName = companyDisplayName(data.company)
  const seller = data.sellerName || data.company?.sellerName || ""
  const saleDate = formatDate(data.saleDate)

  // Resolve items — use receiptItems if available, fallback to single item
  const lines: ReceiptLineItem[] = data.receiptItems && data.receiptItems.length > 0
    ? data.receiptItems
    : [{ ...data.item, type: "principal" as const }]
  const hasNoContractualWarrantyItem = hasItemWithoutContractualWarranty(lines)
  const observations = [saleObservations(data), hasNoContractualWarrantyItem ? NO_CONTRACTUAL_WARRANTY_NOTE : ""]
    .filter(Boolean)
    .join(". ")

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
  text(doc, doc.splitTextToSize(companyShortName(data.company) || companyName, 35).slice(0, 2), 36.5, 35, { align: "center" })
  setFont(doc, 5.2, "bold")
  text(doc, companyName, 107, 31, { align: "center" })
  text(doc, data.company?.phone || "", 107, 38, { align: "center" })
  text(doc, data.company?.email || "", 107, 43, { align: "center" })
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
  text(doc, seller || "—", 102, 53)

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
  const colX = { desc: 40, guar: 128, qty: 142, unit: 151, total: 173 }

  function drawProductsHeader(y: number) {
    setFont(doc, 9, "bold")
    text(doc, "PRODUTOS", 17.5, y - 1)
    doc.rect(17, y, 176, 5)
    doc.line(colX.desc, y, colX.desc, y + 5)
    doc.line(colX.guar, y, colX.guar, y + 5)
    doc.line(colX.qty, y, colX.qty, y + 5)
    doc.line(colX.unit, y, colX.unit, y + 5)
    doc.line(colX.total, y, colX.total, y + 5)
    doc.setFillColor(MID_GRAY)
    doc.rect(17, y, 176, 5, "F")
    setFont(doc, 8.2, "bold")
    text(doc, "Tipo", 28.5, y + 3.5, { align: "center" })
    text(doc, "Descrição", 84, y + 3.5, { align: "center" })
    text(doc, "Garantia", 135, y + 3.5, { align: "center" })
    text(doc, "Qtd", 146.5, y + 3.5, { align: "center" })
    text(doc, "Valor Unit.", 162, y + 3.5, { align: "center" })
    text(doc, "Total", 183, y + 3.5, { align: "center" })
    return y + 5
  }

  function drawProductRow(line: ReceiptLineItem, rowY: number) {
    const isFree = line.type === "free"
    const typeLabel = line.type === "principal" ? "Principal" : line.type === "upsell" ? "Upsell" : "Brinde"
    const descLine = [
      line.name,
      line.imei ? `IMEI: ${line.imei}` : null,
      line.imei2 ? `IMEI 2: ${line.imei2}` : null,
    ].filter(Boolean).join(" — ")
    const descLines = doc.splitTextToSize(descLine, 84).slice(0, 2)
    doc.rect(17, rowY, 176, ROW_H)
    doc.line(colX.desc, rowY, colX.desc, rowY + ROW_H)
    doc.line(colX.guar, rowY, colX.guar, rowY + ROW_H)
    doc.line(colX.qty, rowY, colX.qty, rowY + ROW_H)
    doc.line(colX.unit, rowY, colX.unit, rowY + ROW_H)
    doc.line(colX.total, rowY, colX.total, rowY + ROW_H)
    setFont(doc, 8.2)
    text(doc, typeLabel, 28.5, rowY + 7, { align: "center" })
    text(doc, descLines, 41, rowY + 4.6)
    const warrantyText = itemWarrantyLabel(line.warranty, line.warrantyMonths, data.company, { compactNone: true })
    text(doc, doc.splitTextToSize(warrantyText, 24).slice(0, 2), 135, rowY + 5, { align: "center" })
    text(doc, String(line.quantity), 146.5, rowY + 7, { align: "center" })
    text(doc, isFree ? "—" : money(line.unitPrice), 162, rowY + 7, { align: "center" })
    text(doc, isFree ? "Brinde" : money(line.totalPrice), 183, rowY + 7, { align: "center" })
  }

  let tableY = drawProductsHeader(75)
  for (const line of lines) {
    if (tableY + ROW_H > PAGE_BOTTOM) {
      doc.addPage()
      tableY = drawProductsHeader(PAGE_TOP + 2)
    }
    drawProductRow(line, tableY)
    tableY += ROW_H
  }

  const afterTableY = ensurePageSpace(doc, tableY, 7)
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
    settlementY = ensurePageSpace(doc, settlementY, settlementH + 3)

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
  let payY = settlementY
  setFont(doc, 9, "bold")
  const paymentRows = data.payments && data.payments.length > 0
    ? data.payments
    : [{ method: data.paymentMethod, amount: customerPaid }]
  const paymentLineHeight = 4.5
  const paymentBoxHeight = Math.max(9, 5 + paymentRows.length * paymentLineHeight)
  payY = ensurePageSpace(doc, payY, paymentBoxHeight + 8)
  setFont(doc, 9, "bold")
  text(doc, "PAGAMENTO", 17.5, payY)
  doc.rect(17, payY + 1, 176, paymentBoxHeight)
  doc.line(158, payY + 1, 158, payY + 1 + paymentBoxHeight)
  doc.setFillColor(MID_GRAY)
  doc.rect(17, payY + 1, 176, 5, "F")
  setFont(doc, 8.2, "bold")
  text(doc, "Forma de Pagamento", 87, payY + 5, { align: "center" })
  text(doc, "Valor Pago", 176, payY + 5, { align: "center" })
  setFont(doc, 8.2)
  paymentRows.forEach((payment, index) => {
    const rowY = payY + 10 + index * paymentLineHeight
    text(doc, payment.method, 87, rowY, { align: "center" })
    text(doc, money(payment.amount), 176, rowY, { align: "center" })
  })

  // ── Observations ──
  let obsY = payY + paymentBoxHeight + 8
  const observationLines = doc.splitTextToSize(observations, 172)
  const observationBoxHeight = Math.max(12, 5 + observationLines.length * 4)
  obsY = ensurePageSpace(doc, obsY, observationBoxHeight + 7)
  setFont(doc, 9, "bold")
  text(doc, "OBSERVAÇÕES DA VENDA", 17.5, obsY)
  doc.rect(17, obsY + 1, 176, observationBoxHeight)
  setFont(doc, 8.4)
  text(doc, observationLines, 19, obsY + 5.5)

  // ── Warranty terms ──
  const termsEndY = drawReceiptWarrantyTerms(doc, obsY + observationBoxHeight + 5)
  const signatureY = ensurePageSpace(doc, termsEndY + 12, 14)
  drawSignature(doc, signatureY, data.customerName, companyName)

  await savePdfDocument(doc, `Recibo-${safeFileName(data.customerName)}-${receiptNumber(data.saleId)}.pdf`)
}

export async function generateWarrantyPDF(data: SaleDocumentData) {
  const { default: JSPDF } = await import("jspdf")
  const doc = new JSPDF("p", "mm", "a4")
  const companyName = companyDisplayName(data.company)
  const seller = data.sellerName || data.company?.sellerName || ""
  const saleDate = formatDate(data.saleDate)
  const warrantyItems = documentWarrantyItems(data)
  const hasNoContractualWarrantyItem = hasItemWithoutContractualWarranty(warrantyItems)

  setFont(doc, 13, "bold")
  text(doc, companyName, 105, 27, { align: "center" })

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
  text(doc, companyName, 194, 49, { align: "right" })
  text(doc, data.company?.address || "", 194, 53, { align: "right" })
  text(doc, data.company?.phone || "", 194, 57, { align: "right" })
  setFont(doc, 8.5, "normal", "#6b7280")
  text(doc, data.company?.email || "", 194, 61, { align: "right" })
  setFont(doc, 8.5)
  text(doc, `Vendedor: ${seller || "—"}`, 194, 65, { align: "right" })
  text(doc, `Data da Venda: ${saleDate}`, 194, 73, { align: "right" })

  setFont(doc, 8.5, "normal", "#6b7280")
  text(doc, "DESCRIÇÃO", 91, 82, { align: "center" })
  text(doc, "GARANTIA", 176, 82, { align: "center" })
  doc.setDrawColor(205, 213, 222)
  doc.line(17, 83, 193, 83)
  let rowY = 83
  for (const item of warrantyItems) {
    const rowH = 10
    doc.setFillColor(245, 245, 245)
    doc.rect(17, rowY, 176, rowH, "S")
    setFont(doc, 8.2)
    text(doc, doc.splitTextToSize(item.name, 142).slice(0, 2), 17, rowY + 4)
    const warrantyText = itemWarrantyLabel(item.warranty, item.warranty.durationMonths || data.item.warrantyMonths, data.company, { compactNone: true })
    text(doc, doc.splitTextToSize(warrantyText, 36).slice(0, 2), 176, rowY + 4, { align: "center" })
    rowY += rowH
  }

  setFont(doc, 8.5, "normal", "#6b7280")
  const detailsY = rowY + 7
  text(doc, "DADOS ADICIONAIS", 105, detailsY, { align: "center" })
  doc.line(17, detailsY + 1, 193, detailsY + 1)

  setFont(doc, 72, "bold", "#f4f4f4")
  text(doc, "NT", 130, 170)
  let startTermsY = detailsY + 6
  if (hasNoContractualWarrantyItem) {
    setFont(doc, 8.2, "normal", TEXT_GRAY)
    const noteLines = doc.splitTextToSize(NO_CONTRACTUAL_WARRANTY_NOTE, 176)
    text(doc, noteLines, 17, startTermsY)
    startTermsY += noteLines.length * 4 + 4
  }
  const termsEndY = drawWarrantyText(doc, 17, startTermsY, 176, 4.45)
  const signatureY = ensurePageSpace(doc, Math.max(termsEndY + 12, 249), 14)
  drawSignature(doc, signatureY, data.customerName, companyName)

  await savePdfDocument(doc, `${safeFileName(data.item.name)} - Garantia.pdf`)
}
