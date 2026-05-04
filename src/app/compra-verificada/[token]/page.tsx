"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { jsPDF } from "jspdf"
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileText,
  Hash,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/helpers"

type Intro = {
  available: boolean
  customerFirstName: string | null
  lockedUntil: string | null
  message?: string
}

type Purchase = {
  customerName: string
  support: {
    whatsappUrl: string | null
    phoneLabel: string | null
  }
  sale: {
    number: string
    date: string | null
    purchaseAmount: number
    amountPaid: number
    paymentMethod: string
    remainingPaymentMethod: string
    tradeInApplied: boolean
    tradeInCreditAmount: number
    tradeInDevice: {
      model: string | null
      storage: string | null
      color: string | null
      maskedImei: string | null
      maskedSerial: string | null
      creditAmount: number
    } | null
    status: string
    warrantyStart: string | null
    warrantyEnd: string | null
    warrantyStatus: string
  }
  device: {
    model: string
    storage: string | null
    color: string | null
    grade: string | null
    batteryHealth: number | null
    boxType: string
    photoUrl: string | null
    imei: string | null
    serial: string | null
  }
  purchaseItems: Array<PurchaseItem>
  provenance: {
    kind: "trade_in" | "supplier" | "sealed" | "unknown"
    description: string
    previousOwnerName: string | null
    previousOwnerCpf: string | null
    previousPurchaseDate: string | null
    receivedAt: string | null
    inspectionDate: string | null
    stockEntryDate: string | null
    originLabel: string | null
    conditionLabel: string | null
    technicalStatus: string | null
    status: string | null
    privacyNote: string
  }
  documents: {
    receiptAvailable: boolean
    warrantyAvailable: boolean
    technicalReportUrl: string | null
  }
  assistance: Array<{
    id: string
    itemId: string | null
    itemName: string | null
    type?: string | null
    statusLabel: string
    description: string
    openedAt: string | null
    expectedAt: string | null
    publicNote: string | null
    timeline: Array<{ label: string; date: string | null; active: boolean }>
  }>
}

type PurchaseItem = {
  id: string
  type: "principal" | "upsell" | "free" | "additional"
  label: string
  model: string
  storage: string | null
  color: string | null
  grade: string | null
  batteryHealth: number | null
  boxType: string
  photoUrl: string | null
  imei: string | null
  serial: string | null
  warrantyStart: string | null
  warrantyEnd: string | null
  issues: Array<{
    id: string
    statusLabel: string
    description: string
    openedAt: string | null
    expectedAt: string | null
    publicNote: string | null
    timeline: Array<{ label: string; date: string | null; active: boolean }>
  }>
}

type WarrantyState = "active" | "expired" | "not_started" | "unknown"
type IconType = React.ComponentType<{ className?: string }>

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6)
const notInformed = "Não informado"
const fallback = (value?: string | number | null) => value === null || value === undefined || value === "" ? notInformed : String(value)

function parsePublicDate(value?: string | null) {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return null
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null
  return date
}

function formatPublicDate(value?: string | null) {
  const date = parsePublicDate(value)
  return date ? new Intl.DateTimeFormat("pt-BR").format(date) : notInformed
}

function formatDateBR(value?: string | null) {
  return formatPublicDate(value)
}

function formatCurrencyBR(value: number) {
  return formatBRL(value)
}

function maskIdentifier(value?: string | null) {
  return value || notInformed
}

function maskOwnerName(value?: string | null) {
  return value || notInformed
}

function maskCpf(value?: string | null) {
  return value || notInformed
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

function getWarrantyStatus(startValue?: string | null, endValue?: string | null, now = startOfToday()): WarrantyState {
  const start = parsePublicDate(startValue)
  const end = parsePublicDate(endValue)
  if (!start || !end) return "unknown"
  if (now < start) return "not_started"
  if (now > end) return "expired"
  return "active"
}

function getWarrantyProgress(startValue?: string | null, endValue?: string | null, now = startOfToday()) {
  const start = parsePublicDate(startValue)
  const end = parsePublicDate(endValue)
  if (!start || !end || end <= start) return null
  return clamp((now.getTime() - start.getTime()) / (end.getTime() - start.getTime()))
}

function getWarrantySummaryText(startValue?: string | null, endValue?: string | null, now = startOfToday()) {
  const start = parsePublicDate(startValue)
  const end = parsePublicDate(endValue)
  const status = getWarrantyStatus(startValue, endValue, now)
  if (!start || !end) return "Prazo de garantia não informado."

  if (status === "active") {
    const remainingDays = Math.max(0, daysBetween(now, end))
    return `${remainingDays} dia${remainingDays === 1 ? "" : "s"} restantes. Garantia válida até ${formatPublicDate(endValue)}.`
  }

  if (status === "expired") return `Garantia expirada em ${formatPublicDate(endValue)}.`
  if (status === "not_started") return `Garantia programada para iniciar em ${formatPublicDate(startValue)}.`

  return "Prazo de garantia não informado."
}

function getWarrantyStatusCopy(status: WarrantyState) {
  const map: Record<WarrantyState, { label: string; className: string; dot: string }> = {
    active: {
      label: "Em garantia",
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      dot: "bg-emerald-500",
    },
    expired: {
      label: "Garantia expirada",
      className: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
      dot: "bg-amber-500",
    },
    not_started: {
      label: "Ainda não iniciou",
      className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
      dot: "bg-blue-500",
    },
    unknown: {
      label: "Não informado",
      className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
      dot: "bg-slate-400",
    },
  }
  return map[status]
}

function latestTimelineDate(timeline: Array<{ date: string | null }>) {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (timeline[index]?.date) return timeline[index].date
  }
  return null
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] px-3 py-3 pb-24 text-slate-950 sm:px-6 sm:py-8 sm:pb-10">
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1.05fr_0.95fr]">{children}</div>
    </main>
  )
}

function PortalCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.45rem] border border-[#dce6f2] bg-white p-4 shadow-[0_12px_34px_rgba(15,27,45,0.045)] sm:p-5 ${className}`}>
      {children}
    </section>
  )
}

function InfoRows({
  rows,
}: {
  rows: Array<{ icon: IconType; label: string; value: React.ReactNode; tone?: "blue" | "green" | "orange" }>
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      {rows.map((row, index) => {
        const Icon = row.icon
        const iconTone = row.tone === "green"
          ? "bg-emerald-50 text-emerald-600"
          : row.tone === "orange"
            ? "bg-orange-50 text-orange-500"
            : "bg-royal-50 text-royal-600"

        return (
          <div key={`${row.label}-${index}`} className={`flex min-h-12 items-center gap-3 px-3 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold text-slate-500">{row.label}</p>
            <div className="max-w-[52%] text-right text-sm font-extrabold text-navy-900">{row.value}</div>
          </div>
        )
      })}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, subtitle, action = true }: { icon: IconType; title: string; subtitle?: string; action?: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-extrabold leading-tight text-navy-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm leading-5 text-slate-500">{subtitle}</p>}
      </div>
      {action && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-royal-600" />}
    </div>
  )
}

function StatusPill({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "neutral" | "amber" }) {
  const colors = {
    blue: "bg-royal-50 text-royal-700 ring-royal-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-100",
  }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${colors[tone]}`}>{children}</span>
}

function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="currentColor">
      <path d="M16.02 3.2c-7.02 0-12.72 5.68-12.72 12.68 0 2.22.58 4.39 1.68 6.31L3.2 28.8l6.76-1.77a12.72 12.72 0 0 0 6.06 1.54c7.02 0 12.72-5.68 12.72-12.69S23.04 3.2 16.02 3.2Zm0 23.22c-1.87 0-3.7-.5-5.3-1.45l-.38-.23-4.01 1.05 1.07-3.9-.25-.4a10.45 10.45 0 0 1-1.61-5.61c0-5.81 4.7-10.53 10.48-10.53 2.8 0 5.44 1.1 7.42 3.08a10.48 10.48 0 0 1 3.08 7.45c0 5.81-4.7 10.54-10.5 10.54Zm5.75-7.89c-.31-.16-1.86-.92-2.15-1.02-.29-.11-.5-.16-.71.16-.21.31-.81 1.02-.99 1.23-.18.21-.37.24-.68.08-.31-.16-1.33-.49-2.53-1.56-.94-.84-1.57-1.87-1.75-2.18-.18-.32-.02-.49.14-.64.14-.14.31-.37.47-.55.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.72-.97-2.35-.26-.62-.52-.54-.71-.55h-.6c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.61s1.13 3.04 1.28 3.25c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.8.66.76.24 1.45.21 1.99.13.61-.09 1.86-.76 2.12-1.49.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  )
}

function VerifiedPurchaseHero({ purchase }: { purchase: Purchase }) {
  return (
    <section className="space-y-3 lg:col-span-2">
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[#dce6f2] bg-white text-royal-600 shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <p className="text-[0.95rem] font-black uppercase tracking-[0.13em] text-navy-900">
            NOBRETECH <span className="text-royal-600">STORE</span>
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-[#dce6f2] bg-white px-3 py-2 text-xs font-extrabold text-slate-700 sm:inline-flex">
          <LockKeyhole className="h-3.5 w-3.5 text-royal-600" />
          Ambiente seguro
        </span>
      </header>

      <div className="rounded-[1.45rem] border border-[#dce6f2] bg-white p-4 shadow-[0_12px_34px_rgba(15,27,45,0.045)] sm:p-5">
        <div className="flex gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-royal-700 to-navy-900 text-white shadow-[0_14px_28px_rgba(35,87,184,0.24)]">
            <UserRound className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold leading-tight text-navy-900">Olá, {purchase.customerName}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aqui você encontra todos os detalhes da sua compra realizada na Nobretech Store.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill tone="green">
                <BadgeCheck className="h-3.5 w-3.5" />
                Compra verificada
              </StatusPill>
              <StatusPill tone="neutral">
                <LockKeyhole className="h-3.5 w-3.5" />
                Ambiente seguro
              </StatusPill>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PinGate({
  intro,
  pin,
  message,
  disabledByLock,
  verifying,
  onPinChange,
  onSubmit,
}: {
  intro: Intro | null
  pin: string
  message: string
  disabledByLock: boolean
  verifying: boolean
  onPinChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <PortalShell>
      <header className="px-1 py-2 lg:col-span-2">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-royal-600">Nobretech Store</p>
      </header>

      <PortalCard className="overflow-hidden lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-xl">
        <div className="rounded-[1.25rem] bg-gradient-to-br from-navy-900 to-royal-700 p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-royal-100">Compra Verificada</p>
              <h1 className="mt-2 text-2xl font-bold leading-tight">Bem-vindo, {intro?.customerFirstName || "cliente"}</h1>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Digite o código de 6 dígitos informado na etiqueta do seu produto.
              </p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/15">
              <ShieldCheck className="h-6 w-6" />
            </span>
          </div>
        </div>

        <div className="pt-5">
          <label htmlFor="pin" className="text-xs font-bold uppercase tracking-wide text-slate-500">PIN de segurança</label>
          <input
            id="pin"
            value={pin}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            disabled={!intro?.available || disabledByLock}
            onChange={(event) => onPinChange(digitsOnly(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && pin.length === 6 && !verifying) onSubmit()
            }}
            className="mt-2 h-16 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center font-mono text-2xl font-bold tracking-[0.46em] text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-royal-500 focus:ring-4 focus:ring-royal-100 disabled:bg-slate-100"
            placeholder="000000"
          />

          {message && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              {message}
            </div>
          )}

          <Button
            fullWidth
            size="lg"
            className="mt-5 h-13 rounded-2xl"
            disabled={!intro?.available || disabledByLock || pin.length !== 6}
            isLoading={verifying}
            onClick={onSubmit}
          >
            Acessar minha compra
          </Button>

          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Não compartilhe sua senha. Antes do PIN correto nenhum detalhe sensível da compra é exibido.
          </p>
        </div>
      </PortalCard>
    </PortalShell>
  )
}

function ProductThumb({ src, name }: { src?: string | null; name: string }) {
  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.2rem] bg-[#f7f9fc] ring-1 ring-[#dce6f2]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <Smartphone className="h-11 w-11 text-royal-500" />
      )}
    </div>
  )
}

function VerifiedDeviceCard({ purchase }: { purchase: Purchase }) {
  const status = getWarrantyStatus(purchase.sale.warrantyStart, purchase.sale.warrantyEnd)
  const statusCopy = getWarrantyStatusCopy(status)

  return (
    <PortalCard>
      <SectionTitle icon={Smartphone} title="Seu aparelho" />
      <div className="flex items-center gap-4">
        <ProductThumb src={purchase.device.photoUrl} name={purchase.device.model} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold leading-tight text-navy-900">{fallback(purchase.device.model)}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{fallback(purchase.device.color)}</p>
          <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${statusCopy.className}`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {statusCopy.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-[#dce6f2] bg-[#fbfdff]">
        <div className="p-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">IMEI</p>
          <p className="mt-1 font-mono text-sm font-black text-navy-900">{maskIdentifier(purchase.device.imei)}</p>
        </div>
        <div className="border-l border-[#dce6f2] p-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Serial</p>
          <p className="mt-1 font-mono text-sm font-black text-navy-900">{maskIdentifier(purchase.device.serial)}</p>
        </div>
      </div>
    </PortalCard>
  )
}

function VerifiedPurchaseProvenanceCard({ purchase }: { purchase: Purchase }) {
  const provenance = purchase.provenance
  const hasData = provenance.kind !== "unknown" && Boolean(provenance.stockEntryDate || provenance.previousOwnerName || provenance.previousOwnerCpf || provenance.originLabel)
  const rows = provenance.kind === "trade_in"
    ? [
        ...(provenance.previousOwnerName ? [{ icon: UserRound, label: "Antigo proprietário", value: maskOwnerName(provenance.previousOwnerName), tone: "green" as const }] : []),
        ...(provenance.previousOwnerCpf ? [{ icon: CreditCard, label: "CPF validado", value: maskCpf(provenance.previousOwnerCpf), tone: "green" as const }] : []),
        ...(provenance.stockEntryDate ? [{ icon: CalendarDays, label: "Entrada no estoque", value: formatDateBR(provenance.stockEntryDate), tone: "green" as const }] : []),
        { icon: ShieldCheck, label: "Status da procedência", value: <StatusPill tone="green">{provenance.status || "Sem restrições"}</StatusPill>, tone: "green" as const },
      ]
    : [
        ...(provenance.stockEntryDate ? [{ icon: CalendarDays, label: "Entrada no estoque", value: formatDateBR(provenance.stockEntryDate), tone: "green" as const }] : []),
        ...(provenance.originLabel ? [{ icon: PackageCheck, label: "Origem", value: provenance.originLabel, tone: "green" as const }] : []),
        ...(provenance.conditionLabel ? [{ icon: Sparkles, label: "Condição", value: provenance.conditionLabel, tone: "green" as const }] : []),
        ...(provenance.technicalStatus ? [{ icon: CheckCircle2, label: "Conferência técnica", value: provenance.technicalStatus, tone: "green" as const }] : []),
        { icon: ShieldCheck, label: "Status da procedência", value: <StatusPill tone="green">{provenance.status || "Sem restrições"}</StatusPill>, tone: "green" as const },
      ]

  return (
    <PortalCard className={hasData ? "bg-[linear-gradient(135deg,#ffffff_0%,#f6fffb_100%)]" : ""}>
      <SectionTitle
        icon={ShieldCheck}
        title="Procedência verificada"
        subtitle={provenance.description}
      />

      {hasData ? (
        <>
          <InfoRows rows={rows} />
          <p className="mt-3 flex gap-2 text-xs font-semibold leading-5 text-slate-500">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            {provenance.privacyNote}
          </p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#dce6f2] bg-slate-50/70 p-4 text-sm font-semibold leading-6 text-slate-600">
          Dados de procedência ainda não registrados.
        </div>
      )}
    </PortalCard>
  )
}

function VerifiedPurchaseTimelineCard({ purchase }: { purchase: Purchase }) {
  const events = [
    { label: "Aparelho adquirido pelo antigo proprietário", date: purchase.provenance.previousPurchaseDate },
    { label: "Aparelho recebido pela Nobretech", date: purchase.provenance.receivedAt },
    { label: "Inspeção técnica realizada", date: purchase.provenance.inspectionDate },
    { label: "Entrada no estoque da Nobretech", date: purchase.provenance.stockEntryDate },
    { label: "Venda realizada", date: purchase.sale.date },
  ].filter((event) => event.date)

  if (events.length === 0) return null

  return (
    <PortalCard>
      <SectionTitle icon={Clock} title="Linha do tempo" />
      <ol className="space-y-0">
        {events.map((event, index) => (
          <li key={event.label} className="grid grid-cols-[22px_1fr_auto] gap-3 py-1.5">
            <span className="relative mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-3 w-3" />
              {index < events.length - 1 && <span className="absolute left-1/2 top-4 h-7 w-0.5 -translate-x-1/2 bg-emerald-100" />}
            </span>
            <p className="text-sm font-bold leading-5 text-navy-900">{event.label}</p>
            <p className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateBR(event.date)}</p>
          </li>
        ))}
      </ol>
    </PortalCard>
  )
}

function downloadPublicDocument(kind: "receipt" | "warranty", purchase: Purchase) {
  const doc = new jsPDF()
  const title = kind === "receipt" ? "Recibo da compra" : "Termo de garantia"
  const fileSuffix = kind === "receipt" ? "recibo" : "garantia"
  const lines = kind === "receipt"
    ? [
        ["Compra", purchase.sale.number],
        ["Data", formatDateBR(purchase.sale.date)],
        ["Cliente", purchase.customerName],
        ["Produto", purchase.device.model],
        ["Valor da compra", formatCurrencyBR(purchase.sale.purchaseAmount)],
        ["Valor pago", formatCurrencyBR(purchase.sale.amountPaid)],
        ["Forma de pagamento", purchase.sale.paymentMethod || notInformed],
      ]
    : [
        ["Compra", purchase.sale.number],
        ["Cliente", purchase.customerName],
        ["Produto", purchase.device.model],
        ["Início da garantia", formatDateBR(purchase.sale.warrantyStart)],
        ["Término da garantia", formatDateBR(purchase.sale.warrantyEnd)],
        ["Status", getWarrantyStatusCopy(getWarrantyStatus(purchase.sale.warrantyStart, purchase.sale.warrantyEnd)).label],
      ]

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("NOBRETECH STORE", 20, 22)
  doc.setFontSize(13)
  doc.text(title, 20, 34)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Documento gerado pelo portal de compra verificada.", 20, 43)

  let y = 58
  for (const [label, value] of lines) {
    doc.setFont("helvetica", "bold")
    doc.text(`${label}:`, 20, y)
    doc.setFont("helvetica", "normal")
    doc.text(String(value || notInformed), 64, y)
    y += 9
  }

  if (kind === "warranty") {
    y += 4
    doc.setFontSize(9)
    doc.text("A garantia segue os termos e condições informados pela Nobretech Store no momento da compra.", 20, y, { maxWidth: 170 })
  }

  doc.save(`${fileSuffix}-${purchase.sale.number.toLowerCase()}.pdf`)
}

function DocumentRow({ icon: Icon, title, subtitle, href, disabled, onClick }: { icon: IconType; title: string; subtitle: string; href?: string | null; disabled?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold leading-tight text-navy-900">{title}</span>
        <span className="text-xs font-semibold text-slate-500">{subtitle}</span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dce6f2] text-royal-600">
        <Download className="h-4 w-4" />
      </span>
    </>
  )

  if (href && !disabled) {
    return <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-t-0">{content}</a>
  }

  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center gap-3 border-t border-slate-100 py-3 text-left first:border-t-0 ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-royal-50/40"}`}>
      {content}
    </button>
  )
}

function VerifiedPurchaseDocumentsCard({ purchase }: { purchase: Purchase }) {
  return (
    <PortalCard>
      <SectionTitle icon={FileText} title="Documentos da compra" />
      <div className="overflow-hidden rounded-2xl border border-[#dce6f2] bg-white px-3">
        <DocumentRow icon={ReceiptText} title="Recibo da compra" subtitle="PDF" disabled={!purchase.documents.receiptAvailable} onClick={() => downloadPublicDocument("receipt", purchase)} />
        <DocumentRow icon={ShieldCheck} title="Termo de garantia" subtitle="PDF" disabled={!purchase.documents.warrantyAvailable} onClick={() => downloadPublicDocument("warranty", purchase)} />
        <DocumentRow icon={FileText} title="Laudo técnico" subtitle={purchase.documents.technicalReportUrl ? "PDF" : "Sem laudo registrado"} href={purchase.documents.technicalReportUrl} disabled={!purchase.documents.technicalReportUrl} />
      </div>
    </PortalCard>
  )
}

function VerifiedPurchaseSummaryCard({ purchase }: { purchase: Purchase }) {
  const hasTradeIn = purchase.sale.tradeInApplied
  const summaryRows = [
    { icon: Hash, label: "Número da compra", value: purchase.sale.number },
    { icon: CalendarDays, label: "Data da compra", value: formatPublicDate(purchase.sale.date) },
    { icon: ShieldCheck, label: "Garantia até", value: formatPublicDate(purchase.sale.warrantyEnd) },
    { icon: CheckCircle2, label: "Status", value: <StatusPill tone="green">{purchase.sale.status || notInformed}</StatusPill>, tone: "green" as const },
  ]
  const moneyRows = hasTradeIn
    ? [
        { icon: CreditCard, label: "Valor da compra", value: formatCurrencyBR(purchase.sale.purchaseAmount) },
        { icon: PackageCheck, label: "Crédito do trade-in", value: `- ${formatCurrencyBR(purchase.sale.tradeInCreditAmount)}`, tone: "green" as const },
        { icon: CreditCard, label: "Valor pago", value: formatCurrencyBR(purchase.sale.amountPaid) },
        { icon: CreditCard, label: "Forma de pagamento", value: purchase.sale.remainingPaymentMethod || notInformed },
      ]
    : [
        { icon: CreditCard, label: "Valor pago", value: formatCurrencyBR(purchase.sale.amountPaid) },
        { icon: CreditCard, label: "Forma de pagamento", value: purchase.sale.paymentMethod || notInformed },
      ]

  return (
    <PortalCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <SectionTitle icon={CreditCard} title="Resumo da compra" subtitle="Informações principais desta compra." />
        {hasTradeIn && <StatusPill tone="green">Trade-in aplicado</StatusPill>}
      </div>

      <InfoRows rows={summaryRows} />

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Composição da compra</p>
        <InfoRows rows={moneyRows} />
      </div>

      {hasTradeIn && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-navy-900">Aparelho entregue no trade-in</p>
              <p className="mt-0.5 text-xs font-medium text-emerald-700">Recebido como parte do pagamento</p>
            </div>
            <p className="shrink-0 text-sm font-black text-emerald-700">-{formatCurrencyBR(purchase.sale.tradeInCreditAmount)}</p>
          </div>
          {purchase.sale.tradeInDevice?.model ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Modelo</span>
                <span className="text-right font-bold text-slate-950">{purchase.sale.tradeInDevice.model}</span>
              </div>
              {purchase.sale.tradeInDevice.color && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">Cor</span>
                  <span className="text-right font-bold text-slate-950">{purchase.sale.tradeInDevice.color}</span>
                </div>
              )}
              {(purchase.sale.tradeInDevice.maskedImei || purchase.sale.tradeInDevice.maskedSerial) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">Identificação</span>
                  <span className="text-right font-mono font-bold text-slate-950">{purchase.sale.tradeInDevice.maskedImei || purchase.sale.tradeInDevice.maskedSerial}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-700">Trade-in aplicado nesta compra.</p>
          )}
        </div>
      )}
    </PortalCard>
  )
}

function itemTone(type: PurchaseItem["type"]) {
  if (type === "principal") return "blue"
  if (type === "upsell") return "green"
  if (type === "free") return "amber"
  return "neutral"
}

function VerifiedPurchaseItemsCard({ purchase }: { purchase: Purchase }) {
  const items = purchase.purchaseItems?.length ? purchase.purchaseItems : [{
    id: "principal",
    type: "principal" as const,
    label: "Principal",
    model: purchase.device.model,
    storage: purchase.device.storage,
    color: purchase.device.color,
    grade: purchase.device.grade,
    batteryHealth: purchase.device.batteryHealth,
    boxType: purchase.device.boxType,
    photoUrl: purchase.device.photoUrl,
    imei: purchase.device.imei,
    serial: purchase.device.serial,
    warrantyStart: purchase.sale.warrantyStart,
    warrantyEnd: purchase.sale.warrantyEnd,
    issues: [],
  }]

  return (
    <PortalCard>
      <SectionTitle icon={PackageCheck} title="Itens da sua compra" />
      <div className="divide-y divide-slate-100">
        {items.map((item, index) => {
          const tone = itemTone(item.type)
          const amount = item.type === "free" ? "Brinde" : item.type === "principal" ? formatCurrencyBR(purchase.sale.purchaseAmount) : item.label

          return (
            <div key={item.id || `${item.type}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <ProductThumb src={item.photoUrl} name={item.model} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-extrabold leading-5 text-navy-900">{fallback(item.model)}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{fallback(item.color || item.storage)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <StatusPill tone={tone as "blue" | "green" | "neutral" | "amber"}>{item.label}</StatusPill>
                  {item.issues.length > 0 && <StatusPill tone="amber">OS vinculada</StatusPill>}
                </div>
              </div>
              <p className="shrink-0 text-right text-sm font-black text-navy-900">{amount}</p>
            </div>
          )
        })}
      </div>
    </PortalCard>
  )
}

function VerifiedPurchaseWarrantyCard({ purchase }: { purchase: Purchase }) {
  const status = getWarrantyStatus(purchase.sale.warrantyStart, purchase.sale.warrantyEnd)
  const statusCopy = getWarrantyStatusCopy(status)
  const progress = getWarrantyProgress(purchase.sale.warrantyStart, purchase.sale.warrantyEnd)
  const progressPct = Math.round((progress ?? 0) * 100)

  return (
    <PortalCard className="overflow-hidden">
      <div className="mb-4 flex items-start justify-between gap-3">
        <SectionTitle icon={ShieldCheck} title="Garantia" subtitle="Acompanhamento do período de cobertura." />
        <span className={`mt-1 hidden shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-bold sm:inline-flex ${statusCopy.className}`}>
          <span className={`h-2 w-2 rounded-full ${statusCopy.dot}`} />
          {statusCopy.label}
        </span>
      </div>

      <div className="rounded-[1.25rem] bg-gradient-to-br from-royal-50 to-emerald-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-royal-500">Status da garantia</p>
            <p className="mt-1 text-2xl font-extrabold text-navy-900">{statusCopy.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{getWarrantySummaryText(purchase.sale.warrantyStart, purchase.sale.warrantyEnd)}</p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold sm:hidden ${statusCopy.className}`}>
            <span className={`h-2 w-2 rounded-full ${statusCopy.dot}`} />
            {statusCopy.label}
          </span>
        </div>

        {progress !== null && (
          <div className="mt-5">
            <div className="relative h-3 rounded-full bg-white/80 shadow-inner">
              <div
                className={`h-3 rounded-full ${status === "expired" ? "bg-amber-400" : status === "active" ? "bg-emerald-500" : "bg-royal-500"}`}
                style={{ width: `${progressPct}%` }}
              />
              <div
                className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-navy-900 shadow-md"
                style={{ left: `${progressPct}%` }}
                aria-label="Hoje"
              />
            </div>
            <div className="mt-3 grid grid-cols-3 items-start gap-2 text-xs">
              <div>
                <p className="font-bold text-slate-500">Início</p>
                <p className="mt-0.5 font-semibold text-slate-900">{formatPublicDate(purchase.sale.warrantyStart)}</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-500">Hoje</p>
                <p className="mt-0.5 font-semibold text-slate-900">{progressPct}%</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-500">Fim</p>
                <p className="mt-0.5 font-semibold text-slate-900">{formatPublicDate(purchase.sale.warrantyEnd)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <InfoRows rows={[
          { icon: CalendarDays, label: "Início da garantia", value: formatPublicDate(purchase.sale.warrantyStart) },
          { icon: CalendarDays, label: "Término da garantia", value: formatPublicDate(purchase.sale.warrantyEnd) },
          { icon: ShieldCheck, label: "Status", value: statusCopy.label, tone: status === "active" ? "green" : "blue" },
        ]} />
      </div>
    </PortalCard>
  )
}

function VerifiedPurchaseIssueCard({ purchase }: { purchase: Purchase }) {
  if (purchase.assistance.length === 0) {
    return (
      <PortalCard>
        <SectionTitle icon={Wrench} title="Ordem de Serviço" />
        <div className="rounded-2xl border border-dashed border-[#dce6f2] bg-slate-50/70 p-4 text-sm font-semibold leading-6 text-slate-600">
          Nenhuma ordem de serviço aberta para este aparelho.
        </div>
      </PortalCard>
    )
  }

  return (
    <PortalCard>
      <SectionTitle icon={Wrench} title="Ordem de Serviço" subtitle="Acompanhamento de atendimentos vinculados ao aparelho." />
      <div className="space-y-4">
        {purchase.assistance.map((item, index) => (
          <div key={item.id} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <StatusPill tone="blue">
                  <Clock className="h-3.5 w-3.5" />
                  {item.statusLabel}
                </StatusPill>
                {item.itemName && (
                  <p className="mt-3 text-xs font-black uppercase tracking-wide text-royal-600">{item.itemName}</p>
                )}
                <p className="mt-2 text-xs font-bold text-slate-500">OS-{String(item.id).slice(0, 8).toUpperCase()}</p>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-800">{item.description}</p>
              </div>
              <p className="text-xs font-semibold text-slate-500">{item.openedAt ? formatPublicDate(item.openedAt) : "Aberto"}</p>
            </div>

            {item.expectedAt && <p className="mt-3 text-sm text-slate-600">Previsão: {formatPublicDate(item.expectedAt)}</p>}
            {item.publicNote && <p className="mt-3 rounded-2xl bg-white p-3 text-sm leading-6 text-slate-700">{item.publicNote}</p>}
            <InfoRows rows={[
              { icon: Hash, label: "Número da OS", value: `OS-${String(item.id).slice(0, 8).toUpperCase()}` },
              { icon: Clock, label: "Status atual", value: item.statusLabel },
              { icon: CalendarDays, label: "Data de abertura", value: item.openedAt ? formatDateBR(item.openedAt) : notInformed },
              { icon: CalendarDays, label: "Última atualização", value: latestTimelineDate(item.timeline) ? formatDateBR(latestTimelineDate(item.timeline)) : item.openedAt ? formatDateBR(item.openedAt) : notInformed },
            ]} />

            <div className={`${index === 0 ? "mt-4" : "mt-3"} space-y-3`}>
              {item.timeline.map((step, index) => (
                <div key={`${item.id}-${step.label}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${step.active ? "bg-royal-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    {index < item.timeline.length - 1 && <span className={`mt-1 h-7 w-0.5 ${step.active ? "bg-royal-200" : "bg-slate-200"}`} />}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-bold text-slate-900">{step.label}</p>
                    {step.date && <p className="mt-0.5 text-xs text-slate-500">{formatPublicDate(step.date)}</p>}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-royal-600 px-4 text-sm font-bold text-white">
              Acompanhar OS
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </PortalCard>
  )
}

function VerifiedPurchaseSupportCard() {
  const href = "http://wa.me/5598988265655"
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed inset-x-3 bottom-3 z-20 rounded-[1.25rem] bg-[#25D366] p-3 text-white shadow-[0_16px_34px_rgba(37,211,102,0.28)] transition hover:bg-[#20bd5a] sm:static sm:rounded-[1.35rem] sm:p-4 lg:col-start-2"
    >
      <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#25D366] shadow-sm">
          <WhatsAppIcon className="h-8 w-8" />
        </span>
        <div className="min-w-0 text-center">
          <h3 className="text-lg font-extrabold leading-tight">Precisa de ajuda?</h3>
          <p className="mt-0.5 text-sm font-semibold leading-5 text-white/90">Falar no WhatsApp</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/16 text-white">
          <ChevronRight className="h-5 w-5" />
        </span>
      </div>
    </a>
  )
}

export default function VerifiedPurchasePage() {
  const { token } = useParams() as { token: string }
  const [intro, setIntro] = useState<Intro | null>(null)
  const [pin, setPin] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [purchase, setPurchase] = useState<Purchase | null>(null)

  useEffect(() => {
    let mounted = true
    fetch(`/api/public/purchase-portal/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json()
        if (mounted) {
          setIntro(payload)
          if (!response.ok) setMessage(payload.message || "Esta compra não está disponível para consulta.")
        }
      })
      .catch(() => {
        if (mounted) setMessage("Esta compra não está disponível para consulta.")
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [token])

  const disabledByLock = useMemo(() => {
    if (!intro?.lockedUntil) return false
    return new Date(intro.lockedUntil) > new Date()
  }, [intro?.lockedUntil])

  const verifyPin = async () => {
    setMessage("")
    setVerifying(true)
    try {
      const response = await fetch(`/api/public/purchase-portal/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setMessage(payload.message || "Código incorreto. Verifique a etiqueta e tente novamente.")
        if (payload.lockedUntil) setIntro((current) => current ? { ...current, lockedUntil: payload.lockedUntil } : current)
        return
      }
      setPurchase(payload.purchase)
    } catch {
      setMessage("Não foi possível validar o código agora. Tente novamente.")
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <PortalShell>
        <div className="flex min-h-[70vh] items-center justify-center">
          <p className="text-sm font-medium text-slate-500">Carregando compra verificada...</p>
        </div>
      </PortalShell>
    )
  }

  if (!purchase) {
    return (
      <PinGate
        intro={intro}
        pin={pin}
        message={message}
        disabledByLock={disabledByLock}
        verifying={verifying}
        onPinChange={setPin}
        onSubmit={verifyPin}
      />
    )
  }

  return (
    <PortalShell>
      <VerifiedPurchaseHero purchase={purchase} />
      <VerifiedDeviceCard purchase={purchase} />
      <VerifiedPurchaseProvenanceCard purchase={purchase} />
      <VerifiedPurchaseTimelineCard purchase={purchase} />
      <VerifiedPurchaseDocumentsCard purchase={purchase} />
      <VerifiedPurchaseIssueCard purchase={purchase} />
      <VerifiedPurchaseItemsCard purchase={purchase} />
      <VerifiedPurchaseSummaryCard purchase={purchase} />
      <VerifiedPurchaseWarrantyCard purchase={purchase} />
      <VerifiedPurchaseSupportCard />
    </PortalShell>
  )
}
