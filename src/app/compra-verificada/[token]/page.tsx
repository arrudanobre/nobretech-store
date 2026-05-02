"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import {
  BadgeCheck,
  BatteryCharging,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Hash,
  HelpCircle,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  Palette,
  ShieldCheck,
  Smartphone,
  Sparkles,
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
    imei: string | null
    serial: string | null
  }
  assistance: Array<{
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

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f9fd] px-4 py-4 text-slate-950 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-5">{children}</div>
    </main>
  )
}

function PortalCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.35rem] border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-6 ${className}`}>
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

function SectionTitle({ icon: Icon, title, subtitle }: { icon: IconType; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-50 text-royal-600">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-lg font-bold text-navy-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm leading-5 text-slate-500">{subtitle}</p>}
      </div>
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

function VerifiedPurchaseHero({ purchase }: { purchase: Purchase }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4 px-1 pt-1">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-royal-600">NOBRETECH STORE</p>
          <h1 className="mt-1 text-[1.75rem] font-display font-extrabold leading-tight text-navy-900 font-syne sm:text-4xl">Compra Verificada</h1>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-royal-600 shadow-[0_10px_30px_rgba(37,99,235,0.16)] ring-1 ring-slate-100">
          <ShieldCheck className="h-5 w-5" />
        </span>
      </div>

      <div className="relative overflow-hidden rounded-[1.35rem] border border-blue-100 bg-[linear-gradient(110deg,#ffffff_0%,#f7fbff_48%,#dfeaff_100%)] p-5 shadow-[0_18px_60px_rgba(37,99,235,0.13)] sm:p-6">
        <div className="absolute right-4 top-7 hidden h-28 w-28 items-center justify-center rounded-[2rem] bg-white/55 text-royal-500 shadow-inner sm:flex">
          <ShieldCheck className="h-16 w-16" />
        </div>
        <div className="relative flex gap-4 sm:max-w-[70%]">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-royal-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)]">
            <Smartphone className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-2xl font-extrabold leading-tight text-navy-900">Olá, {purchase.customerName}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aqui você encontra os detalhes da sua compra realizada na Nobretech Store.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill tone="green">
                <BadgeCheck className="h-3.5 w-3.5" />
                Compra verificada
              </StatusPill>
              <StatusPill tone="blue">
                <LockKeyhole className="h-3.5 w-3.5" />
                Ambiente seguro
              </StatusPill>
              <StatusPill tone="neutral">Seus dados estão protegidos</StatusPill>
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
      <header className="px-1 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-royal-600">Nobretech Store</p>
      </header>

      <PortalCard className="overflow-hidden">
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
        { icon: CreditCard, label: "Valor da compra", value: formatBRL(purchase.sale.purchaseAmount) },
        { icon: PackageCheck, label: "Crédito do trade-in", value: `- ${formatBRL(purchase.sale.tradeInCreditAmount)}`, tone: "green" as const },
        { icon: CreditCard, label: "Valor pago", value: formatBRL(purchase.sale.amountPaid) },
        { icon: CreditCard, label: "Forma de pagamento", value: purchase.sale.remainingPaymentMethod || notInformed },
      ]
    : [
        { icon: CreditCard, label: "Valor pago", value: formatBRL(purchase.sale.amountPaid) },
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
            <p className="shrink-0 text-sm font-black text-emerald-700">-{formatBRL(purchase.sale.tradeInCreditAmount)}</p>
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

function VerifiedPurchaseDeviceCard({ purchase }: { purchase: Purchase }) {
  const identityItems = [
    { label: "IMEI", value: purchase.device.imei },
    { label: "Serial", value: purchase.device.serial },
  ].filter((item) => item.value)

  return (
    <PortalCard>
      <SectionTitle icon={Smartphone} title="Seu aparelho" subtitle="Dados básicos do produto entregue." />
      <div className="rounded-[1.2rem] bg-gradient-to-br from-slate-50 to-blue-50/60 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Modelo</p>
        <p className="mt-1 text-xl font-extrabold leading-snug text-navy-900">{fallback(purchase.device.model)}</p>
      </div>
      <div className="mt-3">
        <InfoRows rows={[
          { icon: PackageCheck, label: "Armazenamento", value: fallback(purchase.device.storage) },
          { icon: Palette, label: "Cor", value: fallback(purchase.device.color), tone: "orange" },
          { icon: Sparkles, label: "Classificação", value: fallback(purchase.device.grade) },
          { icon: BatteryCharging, label: "Saúde da bateria", value: purchase.device.batteryHealth === null ? notInformed : `${purchase.device.batteryHealth}%`, tone: "green" },
          { icon: PackageCheck, label: "Caixa/entrega", value: fallback(purchase.device.boxType) },
        ]} />
      </div>
      {identityItems.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Identificação protegida</p>
          <div className="mt-3 space-y-2">
            {identityItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-slate-500">{item.label}</span>
                <span className="font-mono font-bold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
  if (purchase.assistance.length === 0) return null

  return (
    <PortalCard>
      <SectionTitle icon={Wrench} title="Assistência técnica" subtitle="Aparece somente quando existe atendimento vinculado a este aparelho." />
      <div className="space-y-4">
        {purchase.assistance.map((item) => (
          <div key={item.id} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <StatusPill tone="blue">
                  <Clock className="h-3.5 w-3.5" />
                  {item.statusLabel}
                </StatusPill>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-800">{item.description}</p>
              </div>
              <p className="text-xs font-semibold text-slate-500">{item.openedAt ? formatPublicDate(item.openedAt) : "Aberto"}</p>
            </div>

            {item.expectedAt && <p className="mt-3 text-sm text-slate-600">Previsão: {formatPublicDate(item.expectedAt)}</p>}
            {item.publicNote && <p className="mt-3 rounded-2xl bg-white p-3 text-sm leading-6 text-slate-700">{item.publicNote}</p>}

            <div className="mt-4 space-y-3">
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
          </div>
        ))}
      </div>
    </PortalCard>
  )
}

function VerifiedPurchaseSupportCard({ purchase }: { purchase: Purchase }) {
  const href = purchase.support.whatsappUrl || "#"
  return (
    <section className="rounded-[1.35rem] border border-royal-100 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-50 text-royal-600">
            <HelpCircle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-navy-900">Precisa de ajuda?</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Nossa equipe está pronta para te atender{purchase.support.phoneLabel ? ` pelo ${purchase.support.phoneLabel}` : ""}.
            </p>
          </div>
        </div>
        <a
          href={href}
          target={purchase.support.whatsappUrl ? "_blank" : undefined}
          rel={purchase.support.whatsappUrl ? "noreferrer" : undefined}
          aria-disabled={!purchase.support.whatsappUrl}
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition ${purchase.support.whatsappUrl ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" : "bg-slate-100 text-slate-500"}`}
        >
          <MessageCircle className="h-4 w-4" />
          Falar no WhatsApp
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    </section>
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
      <VerifiedPurchaseSummaryCard purchase={purchase} />
      <VerifiedPurchaseDeviceCard purchase={purchase} />
      <VerifiedPurchaseWarrantyCard purchase={purchase} />
      <VerifiedPurchaseIssueCard purchase={purchase} />
      <VerifiedPurchaseSupportCard purchase={purchase} />
    </PortalShell>
  )
}
