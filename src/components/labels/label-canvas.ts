"use client"

import QRCode from "qrcode"
import {
  LABEL_HEIGHT_PX,
  LABEL_INSTAGRAM,
  LABEL_WIDTH_PX,
  abbreviateLabelText,
  formatBatteryHealth,
  formatPackagingForLabel,
  formatShortDate,
  maskImeiOrSerial,
  normalizePin,
  sanitizeLabelText,
  truncateLabelText,
  type InventoryStockLabelData,
  type VerifiedPurchaseCustomerLabelData,
} from "@/lib/label-utils"

const BLACK = "#000000"
const WHITE = "#ffffff"
const SOFT_BLACK = "#111111"
const LABEL_GRAY = "#444444"

function createLabelCanvas() {
  const canvas = document.createElement("canvas")
  canvas.width = LABEL_WIDTH_PX
  canvas.height = LABEL_HEIGHT_PX
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Não foi possível preparar o canvas da etiqueta.")
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, LABEL_WIDTH_PX, LABEL_HEIGHT_PX)
  ctx.fillStyle = BLACK
  ctx.textBaseline = "top"
  return { canvas, ctx }
}

function font(size: number, weight: number | "normal" | "bold" = "normal") {
  return `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, Arial, Helvetica, sans-serif`
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: number | "normal" | "bold" = "normal") {
  let output = sanitizeLabelText(text)
  ctx.font = font(size, weight)
  while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
    const words = output.split(" ")
    if (words.length > 1) {
      words.pop()
      output = words.join(" ")
    } else {
      output = output.slice(0, -1).trimEnd()
    }
  }
  return output
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  weight: number | "normal" | "bold" = "normal",
  color = BLACK
) {
  ctx.font = font(size, weight)
  ctx.fillStyle = color
  ctx.fillText(fitText(ctx, text, maxWidth, size, weight), x, y)
}

function drawCenteredText(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, weight: number | "normal" | "bold" = "normal", color = BLACK) {
  ctx.font = font(size, weight)
  ctx.fillStyle = color
  const safeText = fitText(ctx, text, LABEL_WIDTH_PX - 48, size, weight)
  const width = ctx.measureText(safeText).width
  ctx.fillText(safeText, Math.max(24, (LABEL_WIDTH_PX - width) / 2), y)
}

function drawDivider(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = SOFT_BLACK
  ctx.fillRect(30, y, LABEL_WIDTH_PX - 60, 1)
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function measure(ctx: CanvasRenderingContext2D, text: string, size: number, weight: number | "normal" | "bold" = "normal") {
  ctx.font = font(size, weight)
  return ctx.measureText(text).width
}

function splitModelAndSpecs(data: InventoryStockLabelData) {
  const storage = sanitizeLabelText(data.storage)
  const color = abbreviateLabelText(data.color)
  let model = sanitizeLabelText(data.model)

  if (storage) model = model.replace(new RegExp(`\\b${storage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
  if (data.color) model = model.replace(new RegExp(data.color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
  model = sanitizeLabelText(model) || "Produto"

  return {
    model,
    specs: [storage, color].filter(Boolean).join(" | "),
  }
}

function toDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png")
}

export async function renderInventoryStockLabelPng(data: InventoryStockLabelData) {
  const { canvas, ctx } = createLabelCanvas()
  const stockCode = sanitizeLabelText(data.stockCode)
  const { model, specs } = splitModelAndSpecs(data)
  const modelSize = measure(ctx, model, 31, 800) <= 532 ? 31 : measure(ctx, model, 28, 800) <= 532 ? 28 : 25
  const condition = [
    data.grade ? `Grade ${sanitizeLabelText(data.grade).replace(/^Grade\s+/i, "")}` : "",
    formatBatteryHealth(data.batteryHealth),
  ].filter(Boolean).join(" | ")
  const maskedImei = maskImeiOrSerial(data.imei)
  const maskedSerial = maskImeiOrSerial(data.serial)
  const identity = maskedImei ? `IMEI: ${maskedImei}` : maskedSerial ? `Serial: ${maskedSerial}` : ""
  const packaging = formatPackagingForLabel(data.packaging)
  const lowerRows = [condition, identity, packaging].filter(Boolean)

  drawCenteredText(ctx, "NOBRETECH STORE", 20, 28, 800)
  if (stockCode) drawCenteredText(ctx, `ESTOQUE: ${stockCode}`, 53, 22, 700)
  drawDivider(ctx, 88)
  drawText(ctx, model, 34, 116, 532, modelSize, 800)
  if (specs) drawText(ctx, truncateLabelText(specs, 32), 34, 153, 532, 24, 700)

  const rowStartY = specs ? 200 : 184
  lowerRows.forEach((row, index) => {
    const weight = index === 0 ? 700 : 600
    drawText(ctx, truncateLabelText(row, 34), 34, rowStartY + index * 35, 532, 22, weight)
  })

  drawDivider(ctx, 300)
  drawCenteredText(ctx, LABEL_INSTAGRAM, 318, 20, 700)

  return toDataUrl(canvas)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Não foi possível carregar o QR Code."))
    image.src = src
  })
}

export async function renderVerifiedPurchaseCustomerLabelPng(data: VerifiedPurchaseCustomerLabelData) {
  const { canvas, ctx } = createLabelCanvas()
  const qrDataUrl = await QRCode.toDataURL(data.publicUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 170,
    color: {
      dark: BLACK,
      light: WHITE,
    },
  })
  const qrImage = await loadImage(qrDataUrl)

  drawText(ctx, "NOBRETECH STORE", 30, 22, 310, 28, 800)
  ctx.strokeStyle = BLACK
  ctx.lineWidth = 1
  drawRoundedRect(ctx, 424, 17, 146, 31, 12)
  ctx.stroke()
  drawText(ctx, "✓ Verificada", 438, 22, 124, 18, 700)
  drawDivider(ctx, 58)

  ctx.drawImage(qrImage, 43, 90, 148, 148)

  const infoX = 206
  const valueX = 298
  const maxValueWidth = 258
  if (data.purchaseCode) {
    drawText(ctx, "Compra:", infoX, 86, 86, 20, 500, LABEL_GRAY)
    drawText(ctx, truncateLabelText(data.purchaseCode, 18), valueX, 84, maxValueWidth, 22, 700)
  }
  drawText(ctx, "Cliente:", infoX, 128, 84, 20, 500, LABEL_GRAY)
  drawText(ctx, truncateLabelText(data.customerFirstName || "Cliente", 18), valueX, 126, maxValueWidth, 22, 700)
  drawText(ctx, "PIN:", infoX, 176, 72, 25, 700)
  drawText(ctx, normalizePin(data.pin), 276, 168, 280, 35, 800)
  const warranty = formatShortDate(data.warrantyEnd)
  if (warranty) {
    drawText(ctx, "Garantia:", infoX, 226, 92, 19, 500, LABEL_GRAY)
    drawText(ctx, warranty, 300, 222, maxValueWidth, 22, 700)
  }

  drawDivider(ctx, 300)
  drawCenteredText(ctx, LABEL_INSTAGRAM, 318, 20, 700)

  return toDataUrl(canvas)
}

export function downloadPng(dataUrl: string, fileName: string) {
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}
