import { daysBetween, formatBRL, getComputedInventoryStatus, todayISO } from "@/lib/helpers"

export type InventoryLogisticsStatus =
  | "in_stock"
  | "ordered"
  | "in_transit"
  | "received_pending_review"
  | "supplier_local"
  | "received"
  | "partially_received"
  | "unavailable"

export type InventoryCommercialStatus =
  | "available"
  | "reservable"
  | "reserved"
  | "blocked"
  | "sold"
  | "unavailable"

export type InventoryStatusTone = "green" | "blue" | "yellow" | "red" | "gray" | "purple"

export type InventoryOperationalItem = {
  status?: string | null
  logistics_status?: string | null
  commercial_status?: string | null
  purchase_date?: string | null
  expected_arrival_date?: string | null
  received_at?: string | null
  reserved_at?: string | null
  purchase_price?: number | null
  suggested_price?: number | null
  quantity?: number | string | null
  grade?: string | null
  imei?: string | null
  serial_number?: string | null
  catalog_id?: string | null
  category?: string | null
  catalog?: { category?: string | null } | null
  product_catalog?: { category?: string | null } | null
  notes?: string | null
  condition_notes?: string | null
}

export type InventoryPurchaseBatch = {
  id: string
  logistics_status?: string | null
  supplier_name?: string | null
  ordered_at?: string | null
  purchase_date?: string | null
  expected_arrival_date?: string | null
  total_amount?: number | null
  products_amount?: number | null
  freight_amount?: number | null
  notes?: string | null
  items_count?: number | null
}

const LOGISTICS_VALUES = new Set<InventoryLogisticsStatus>([
  "in_stock",
  "ordered",
  "in_transit",
  "received_pending_review",
  "supplier_local",
  "received",
  "partially_received",
  "unavailable",
])

const COMMERCIAL_VALUES = new Set<InventoryCommercialStatus>([
  "available",
  "reservable",
  "reserved",
  "blocked",
  "sold",
  "unavailable",
])

const LEGACY_BLOCKED = new Set(["sold", "reserved", "returned", "under_repair"])
const LOGISTICS_IN_TRANSIT = new Set(["ordered", "in_transit", "partially_received"])

function validLogistics(value?: string | null): InventoryLogisticsStatus | null {
  return LOGISTICS_VALUES.has(value as InventoryLogisticsStatus) ? value as InventoryLogisticsStatus : null
}

function validCommercial(value?: string | null): InventoryCommercialStatus | null {
  return COMMERCIAL_VALUES.has(value as InventoryCommercialStatus) ? value as InventoryCommercialStatus : null
}

export function getInventoryLogisticsStatus(item: InventoryOperationalItem): InventoryLogisticsStatus {
  const explicit = validLogistics(item.logistics_status)
  if (explicit) {
    if (explicit === "received") return "in_stock"
    return explicit
  }

  const computed = getComputedInventoryStatus(item)
  if (computed === "sold" || computed === "returned") return "unavailable"
  if (computed === "under_repair" || computed === "pending") return "received_pending_review"
  return "in_stock"
}

export function getInventoryCommercialStatus(item: InventoryOperationalItem): InventoryCommercialStatus {
  const explicit = validCommercial(item.commercial_status)
  if (explicit) return explicit

  const legacy = getComputedInventoryStatus(item)
  if (legacy === "sold") return "sold"
  if (legacy === "reserved") return "reserved"
  if (legacy === "returned" || legacy === "under_repair" || legacy === "pending") return "blocked"

  const logistics = getInventoryLogisticsStatus(item)
  if (logistics === "ordered" || logistics === "in_transit" || logistics === "partially_received") return "reservable"
  if (logistics === "received_pending_review" || logistics === "unavailable") return "blocked"
  return "available"
}

export function getInventoryAvailabilityLabel(item: InventoryOperationalItem): string {
  const commercial = getInventoryCommercialStatus(item)
  if (commercial === "reserved") return "Reservado"
  if (commercial === "sold") return "Vendido"

  switch (getInventoryLogisticsStatus(item)) {
    case "in_stock":
      return "Em estoque fisico"
    case "ordered":
      return "Pedido"
    case "in_transit":
      return "A caminho"
    case "received_pending_review":
      return "Aguardando revisao"
    case "supplier_local":
      return "Fornecedor local"
    case "partially_received":
      return "Recebimento parcial"
    default:
      return "Indisponivel"
  }
}

export function getInventoryAvailabilityTone(item: InventoryOperationalItem): InventoryStatusTone {
  const commercial = getInventoryCommercialStatus(item)
  if (commercial === "reserved") return "yellow"
  if (commercial === "sold") return "gray"

  switch (getInventoryLogisticsStatus(item)) {
    case "in_stock":
      return "green"
    case "ordered":
    case "in_transit":
    case "partially_received":
      return "blue"
    case "received_pending_review":
      return "purple"
    case "supplier_local":
      return "yellow"
    default:
      return "gray"
  }
}

export function getInventoryCommercialStatusLabel(item: InventoryOperationalItem): string {
  switch (getInventoryCommercialStatus(item)) {
    case "available":
      return "Disponivel"
    case "reservable":
      return "Reservavel"
    case "reserved":
      return "Reservado"
    case "blocked":
      return "Bloqueado"
    case "sold":
      return "Vendido"
    default:
      return "Indisponivel"
  }
}

export function getInventoryCommercialStatusTone(item: InventoryOperationalItem): InventoryStatusTone {
  switch (getInventoryCommercialStatus(item)) {
    case "available":
      return "green"
    case "reservable":
      return "yellow"
    case "reserved":
      return "yellow"
    case "blocked":
      return "purple"
    case "sold":
      return "gray"
    default:
      return "gray"
  }
}

export function isInventoryItemAvailableForImmediateSale(item: InventoryOperationalItem): boolean {
  const legacy = getComputedInventoryStatus(item)
  return (
    getInventoryLogisticsStatus(item) === "in_stock" &&
    getInventoryCommercialStatus(item) === "available" &&
    !LEGACY_BLOCKED.has(legacy)
  )
}

export function isInventoryItemReservable(item: InventoryOperationalItem): boolean {
  const commercial = getInventoryCommercialStatus(item)
  const legacy = getComputedInventoryStatus(item)
  return (commercial === "reservable" || commercial === "available") && !["sold", "returned", "under_repair"].includes(legacy)
}

export function isInventoryItemOfferable(item: InventoryOperationalItem): boolean {
  return isInventoryItemAvailableForImmediateSale(item)
}

export function getInventoryTimingLabel(item: InventoryOperationalItem, today = todayISO()): string {
  const logistics = getInventoryLogisticsStatus(item)
  if (LOGISTICS_IN_TRANSIT.has(logistics)) {
    if (!item.expected_arrival_date) return "Previsao pendente"
    const days = daysBetween(today, item.expected_arrival_date)
    if (days < 0) return `Atrasado ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`
    if (days === 0) return "Chega hoje"
    return `Chega em ${days} dia${days === 1 ? "" : "s"}`
  }
  if (logistics === "received_pending_review") return item.received_at ? "Recebido" : "Em analise"
  if (logistics === "in_stock") return `${Math.max(0, daysBetween(item.purchase_date, today))}d`
  return "—"
}

export function getInventoryItemQuantity(item: InventoryOperationalItem): number {
  const quantity = Number(item.quantity || 1)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

export function getInventorySummary(items: InventoryOperationalItem[]) {
  return items.reduce(
    (summary, item) => {
      const quantity = getInventoryItemQuantity(item)
      const logistics = getInventoryLogisticsStatus(item)
      const commercial = getInventoryCommercialStatus(item)

      summary.total += quantity
      if (logistics === "in_stock" && commercial === "available") {
        summary.inStock += quantity
        summary.stockValue += Number(item.purchase_price || 0) * quantity
      }
      if (logistics === "ordered" || logistics === "in_transit" || logistics === "partially_received") summary.inTransit += quantity
      if (commercial === "reservable") summary.reservable += quantity
      if (commercial === "reserved") summary.reserved += quantity
      if (logistics === "received_pending_review" || commercial === "blocked") summary.pendingReview += quantity
      if (commercial === "sold") summary.sold += quantity
      return summary
    },
    {
      total: 0,
      inStock: 0,
      inTransit: 0,
      reservable: 0,
      reserved: 0,
      pendingReview: 0,
      sold: 0,
      stockValue: 0,
    }
  )
}

export function getInventoryArrivalAlerts(items: InventoryOperationalItem[], today = todayISO()) {
  return items.reduce(
    (alerts, item) => {
      const quantity = getInventoryItemQuantity(item)
      const logistics = getInventoryLogisticsStatus(item)
      if (logistics === "received_pending_review") alerts.pendingReview += quantity
      if (!LOGISTICS_IN_TRANSIT.has(logistics) || !item.expected_arrival_date) return alerts

      const days = daysBetween(today, item.expected_arrival_date)
      if (days < 0) alerts.delayed += quantity
      else if (days <= 7) alerts.arrivingSoon += quantity
      return alerts
    },
    { arrivingSoon: 0, delayed: 0, pendingReview: 0 }
  )
}

export function getInventoryPurchaseBatchStatusLabel(batch: InventoryPurchaseBatch): string {
  switch (validLogistics(batch.logistics_status)) {
    case "ordered":
      return "Pedido"
    case "in_transit":
      return "Em transporte"
    case "partially_received":
      return "Parcialmente recebido"
    case "received":
    case "in_stock":
      return "Recebido"
    default:
      return "Em andamento"
  }
}

export function getInventoryPurchaseBatchCode(batch: InventoryPurchaseBatch): string {
  const suffix = batch.id.slice(0, 4).toUpperCase()
  return `Pedido #${suffix}`
}

export function getInventoryPurchaseBatchTimingLabel(batch: InventoryPurchaseBatch, today = todayISO()): string {
  if (!batch.expected_arrival_date) return "Sem previsao"
  const days = daysBetween(today, batch.expected_arrival_date)
  if (days < 0) return `Atrasado ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`
  if (days === 0) return "Hoje"
  const dateOnly = batch.expected_arrival_date.slice(0, 10)
  return `${dateOnly.split("-").reverse().join("/")} (${days} dia${days === 1 ? "" : "s"})`
}

export function getInventoryPurchaseBatchValue(batch: InventoryPurchaseBatch): string {
  return formatBRL(Number(batch.total_amount || batch.products_amount || 0))
}

export function buildInventoryBatchReceiptUpdate(mode: "available" | "pending_review") {
  const receivedAt = new Date().toISOString()
  return {
    purchase: {
      logistics_status: "received" as InventoryLogisticsStatus,
      received_at: receivedAt,
    },
    inventory: {
      logistics_status: mode === "available" ? "in_stock" : "received_pending_review",
      commercial_status: mode === "available" ? "available" : "blocked",
      status: mode === "available" ? "in_stock" : "pending",
      received_at: receivedAt,
    },
  }
}

export function isOngoingInventoryPurchase(batch: InventoryPurchaseBatch): boolean {
  return ["ordered", "in_transit", "partially_received"].includes(validLogistics(batch.logistics_status) || "")
}
