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
  const desc = productDescription(data.item)
  const observations = saleObservations(data)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.35)

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

  setFont(doc, 9, "bold")
  text(doc, "PRODUTOS", 17.5, 74)
  doc.rect(17, 75, 176, 16)
  doc.rect(17, 75, 23, 16)
  doc.rect(40, 75, 88, 16)
  doc.rect(128, 75, 14, 16)
  doc.rect(142, 75, 9, 16)
  doc.rect(151, 75, 22, 16)
  doc.rect(173, 75, 20, 16)
  doc.setFillColor(MID_GRAY)
  doc.rect(17, 75, 176, 5, "F")
  setFont(doc, 8.2, "bold")
  text(doc, "Código/SKU", 28.5, 79, { align: "center" })
  text(doc, "Descrição", 84, 79, { align: "center" })
  text(doc, "Garantia", 135, 79, { align: "center" })
  text(doc, "Qtd", 146.5, 79, { align: "center" })
  text(doc, "Valor Unit.", 162, 79, { align: "center" })
  text(doc, "Total", 183, 79, { align: "center" })
  setFont(doc, 8.2)
  text(doc, doc.splitTextToSize(desc, 86).slice(0, 2), 41, 85)
  text(doc, warrantyLabel(data.item.warrantyMonths), 135, 86, { align: "center" })
  text(doc, String(data.item.quantity), 146.5, 86, { align: "center" })
  text(doc, money(data.item.unitPrice), 162, 86, { align: "center" })
  text(doc, money(data.item.totalPrice), 183, 86, { align: "center" })
  doc.rect(151, 91, 42, 4)
  setFont(doc, 8.2, "bold")
  text(doc, "Total", 152, 94)
  text(doc, money(data.item.totalPrice), 183, 94, { align: "center" })

  setFont(doc, 9, "bold")
  text(doc, "PAGAMENTO", 17.5, 101)
  doc.rect(17, 102, 176, 5)
  doc.line(158, 102, 158, 107)
  doc.setFillColor(MID_GRAY)
  doc.rect(17, 102, 176, 5, "F")
  setFont(doc, 8.2, "bold")
  text(doc, "Forma de Pagamento", 87, 106, { align: "center" })
  text(doc, "Valor Pago", 176, 106, { align: "center" })
  setFont(doc, 8.2)
  text(doc, data.paymentMethod, 87, 111, { align: "center" })
  text(doc, money(data.item.totalPrice), 176, 111, { align: "center" })

  setFont(doc, 8.4, "bold")
  text(doc, "OBSERVAÇÕES DA VENDA:", 17.5, 119)
  setFont(doc, 8.4)
  text(doc, doc.splitTextToSize(observations, 135), 56.5, 119)

  doc.rect(17, 136, 176, 109)
  doc.line(17, 140, 193, 140)
  setFont(doc, 8.6, "bold")
  text(doc, "DADOS ADICIONAIS", 19.5, 139)
  drawWarrantyText(doc, 19.5, 144, 171, 4.05)
  drawSignature(doc, 255, data.customerName)

  doc.save(`${safeFileName(data.item.name)} - Recibo.pdf`)
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
