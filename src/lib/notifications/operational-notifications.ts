import { formatBRL } from "@/lib/helpers"
import {
  getInventoryLogisticsStatus,
  getInventoryCommercialStatus,
  type InventoryOperationalItem,
} from "@/lib/inventory-logistics"

export interface OperationalNotification {
  id: string
  type: string
  severity: "info" | "warning" | "critical"
  title: string
  description: string
  amount?: number
  count?: number
  dueDate?: string
  href: string
  entityType?: string
  entityId?: string
  createdAt: string
}

export interface TransactionInput {
  id: string
  type: string
  status: string
  due_date: string | null
  amount: number | string | null
  description?: string | null
}

export interface InventoryStaleInput {
  id: string
  status?: string | null
  logistics_status?: string | null
  commercial_status?: string | null
  created_at: string
  purchase_price?: number | string | null
}

export interface NotificationContext {
  transactions: TransactionInput[]
  inventory: InventoryStaleInput[]
  today: string // YYYY-MM-DD
}

const SEVERITY_ORDER: Record<OperationalNotification["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysDiff(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T12:00:00Z").getTime()
  const b = new Date(toISO + "T12:00:00Z").getTime()
  return Math.round((b - a) / 86400000)
}

function parseAmount(v: number | string | null | undefined): number {
  if (v == null) return 0
  if (typeof v === "number") return v
  return parseFloat(String(v).replace(",", ".")) || 0
}

function nowISO(): string {
  return new Date().toISOString()
}

// ─── Receivables ──────────────────────────────────────────────

function buildReceivableUpcoming(
  transactions: TransactionInput[],
  today: string
): OperationalNotification | null {
  const t3 = addDaysISO(today, 3)
  const upcoming = transactions.filter(
    (t) =>
      t.type === "income" &&
      t.status === "pending" &&
      t.due_date != null &&
      t.due_date >= today &&
      t.due_date <= t3
  )
  if (!upcoming.length) return null

  const total = upcoming.reduce((s, t) => s + parseAmount(t.amount), 0)
  const earliest = upcoming.map((t) => t.due_date!).sort()[0]
  const daysUntil = daysDiff(today, earliest)

  let title: string
  if (daysUntil === 0) {
    title =
      upcoming.length === 1
        ? "Recebível previsto para hoje"
        : `${upcoming.length} recebíveis previstos para hoje`
  } else if (daysUntil === 1) {
    title =
      upcoming.length === 1
        ? "Recebível vence amanhã"
        : `${upcoming.length} recebíveis vencem amanhã`
  } else {
    title =
      upcoming.length === 1
        ? `Recebível vence em ${daysUntil} dias`
        : `${upcoming.length} recebíveis vencem em ${daysUntil} dias`
  }

  return {
    id: "receivables_upcoming_3d",
    type: "receivables_upcoming",
    severity: daysUntil === 0 ? "critical" : "warning",
    title,
    description: `Total previsto: ${formatBRL(total)}`,
    amount: total,
    count: upcoming.length,
    dueDate: earliest,
    href: "/financeiro/receber",
    entityType: "transaction",
    createdAt: nowISO(),
  }
}

function buildReceivableOverdue(
  transactions: TransactionInput[],
  today: string
): OperationalNotification | null {
  const overdue = transactions.filter(
    (t) =>
      t.type === "income" &&
      t.status === "pending" &&
      t.due_date != null &&
      t.due_date < today
  )
  if (!overdue.length) return null

  const total = overdue.reduce((s, t) => s + parseAmount(t.amount), 0)

  return {
    id: "receivables_overdue",
    type: "receivables_overdue",
    severity: "critical",
    title:
      overdue.length === 1
        ? "Recebível vencido"
        : `${overdue.length} recebíveis vencidos`,
    description: `${formatBRL(total)} em aberto. Concilie ou verifique.`,
    amount: total,
    count: overdue.length,
    href: "/financeiro/receber",
    entityType: "transaction",
    createdAt: nowISO(),
  }
}

// ─── Payables ─────────────────────────────────────────────────

function buildPayableUpcoming(
  transactions: TransactionInput[],
  today: string
): OperationalNotification | null {
  const t7 = addDaysISO(today, 7)
  const upcoming = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.status === "pending" &&
      t.due_date != null &&
      t.due_date >= today &&
      t.due_date <= t7
  )
  if (!upcoming.length) return null

  const total = upcoming.reduce((s, t) => s + parseAmount(t.amount), 0)
  const earliest = upcoming.map((t) => t.due_date!).sort()[0]
  const daysUntil = daysDiff(today, earliest)
  const suffix =
    daysUntil === 0
      ? " — primeira vence hoje"
      : daysUntil === 1
        ? " — primeira vence amanhã"
        : ` — primeira vence em ${daysUntil} dias`

  return {
    id: "payables_upcoming_7d",
    type: "payables_upcoming",
    severity: "warning",
    title:
      upcoming.length === 1
        ? "Conta a pagar vence em breve"
        : `${upcoming.length} contas a pagar nos próximos 7 dias`,
    description: `Total previsto: ${formatBRL(total)}${suffix}`,
    amount: total,
    count: upcoming.length,
    dueDate: earliest,
    href: "/financeiro/pagar",
    entityType: "transaction",
    createdAt: nowISO(),
  }
}

function buildPayableOverdue(
  transactions: TransactionInput[],
  today: string
): OperationalNotification | null {
  const overdue = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.status === "pending" &&
      t.due_date != null &&
      t.due_date < today
  )
  if (!overdue.length) return null

  const total = overdue.reduce((s, t) => s + parseAmount(t.amount), 0)

  return {
    id: "payables_overdue",
    type: "payables_overdue",
    severity: "critical",
    title:
      overdue.length === 1
        ? "Conta a pagar vencida"
        : `${overdue.length} contas a pagar vencidas`,
    description: `${formatBRL(total)} em atraso. Regularize o quanto antes.`,
    amount: total,
    count: overdue.length,
    href: "/financeiro/pagar",
    entityType: "transaction",
    createdAt: nowISO(),
  }
}

// ─── Inventory ────────────────────────────────────────────────

function isAvailableForSale(item: InventoryStaleInput): boolean {
  const ops = item as InventoryOperationalItem
  return (
    getInventoryLogisticsStatus(ops) === "in_stock" &&
    getInventoryCommercialStatus(ops) === "available"
  )
}

function buildInventoryStale(
  inventory: InventoryStaleInput[],
  today: string
): OperationalNotification[] {
  const available = inventory.filter(isAvailableForSale)

  const stale45 = available.filter((item) => daysDiff(item.created_at.slice(0, 10), today) > 45)
  const stale20 = available.filter((item) => {
    const d = daysDiff(item.created_at.slice(0, 10), today)
    return d > 20 && d <= 45
  })

  const out: OperationalNotification[] = []

  if (stale45.length > 0) {
    const value = stale45.reduce((s, i) => s + parseAmount(i.purchase_price), 0)
    out.push({
      id: "inventory_stale_45d",
      type: "inventory_stale",
      severity: "critical",
      title:
        stale45.length === 1
          ? "Item parado há mais de 45 dias"
          : `${stale45.length} itens parados há mais de 45 dias`,
      description: `${formatBRL(value)} imobilizado. Revise preço, margem ou crie uma campanha.`,
      amount: value,
      count: stale45.length,
      href: "/estoque",
      entityType: "inventory",
      createdAt: nowISO(),
    })
  }

  if (stale20.length > 0) {
    const value = stale20.reduce((s, i) => s + parseAmount(i.purchase_price), 0)
    out.push({
      id: "inventory_stale_20d",
      type: "inventory_stale",
      severity: "warning",
      title:
        stale20.length === 1
          ? "Item parado há mais de 20 dias"
          : `${stale20.length} itens parados há mais de 20 dias`,
      description: `${formatBRL(value)} em estoque. Que tal revisar preço ou criar uma divulgação?`,
      amount: value,
      count: stale20.length,
      href: "/estoque",
      entityType: "inventory",
      createdAt: nowISO(),
    })
  }

  return out
}

// ─── Main builder ─────────────────────────────────────────────

export function buildOperationalNotifications(
  ctx: NotificationContext
): OperationalNotification[] {
  const { transactions, inventory, today } = ctx

  const raw = [
    buildReceivableOverdue(transactions, today),
    buildPayableOverdue(transactions, today),
    buildReceivableUpcoming(transactions, today),
    buildPayableUpcoming(transactions, today),
    ...buildInventoryStale(inventory, today),
  ]

  const notifications = raw.filter((n): n is OperationalNotification => n !== null)

  return notifications.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    if (a.dueDate && b.dueDate) {
      const byDate = a.dueDate.localeCompare(b.dueDate)
      if (byDate !== 0) return byDate
    }
    if (a.dueDate && !b.dueDate) return -1
    if (!a.dueDate && b.dueDate) return 1
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}
