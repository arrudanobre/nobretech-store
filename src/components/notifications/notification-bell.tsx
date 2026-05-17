"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, AlertTriangle, AlertCircle, Info, ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { OperationalNotification } from "@/lib/notifications/operational-notifications"

const POLL_INTERVAL = 90_000 // 90s

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    dot: "bg-danger-500",
    badge: "bg-danger-500",
    row: "border-danger-100 bg-danger-50/60",
    iconColor: "text-danger-600",
    label: "Crítico",
  },
  warning: {
    icon: AlertCircle,
    dot: "bg-warning-400",
    badge: "bg-warning-400",
    row: "border-warning-100 bg-warning-50/60",
    iconColor: "text-warning-600",
    label: "Atenção",
  },
  info: {
    icon: Info,
    dot: "bg-royal-400",
    badge: "bg-royal-400",
    row: "border-royal-100 bg-royal-50/60",
    iconColor: "text-royal-600",
    label: "Info",
  },
}

function useFetchNotifications() {
  const [notifications, setNotifications] = useState<OperationalNotification[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = async () => {
    try {
      const res = await window.fetch("/api/notifications/operational")
      if (!res.ok) return
      const body = await res.json()
      setNotifications(body.notifications ?? [])
    } catch {
      // silent — bell degrades gracefully
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  return { notifications, loading }
}

export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const { notifications, loading } = useFetchNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const count = notifications.length
  const hasCritical = notifications.some((n) => n.severity === "critical")
  const preview = notifications.slice(0, 5)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  if (loading) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notificações operacionais"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-xl border transition",
          dark
            ? "border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.14]"
            : "border-slate-200/80 bg-white/85 text-navy-700 shadow-sm hover:border-royal-200 hover:bg-white"
        )}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            className={cn(
              "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
              hasCritical ? "bg-danger-500" : "bg-warning-400"
            )}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-navy-900/12">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-bold text-navy-900">Notificações</span>
            </div>
            {count > 0 && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold text-white", hasCritical ? "bg-danger-500" : "bg-warning-400")}>
                {count}
              </span>
            )}
          </div>

          {/* Body */}
          {count === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50">
                <Bell className="h-5 w-5 text-success-500" />
              </div>
              <p className="text-sm font-semibold text-navy-900">Tudo certo por enquanto</p>
              <p className="text-xs text-slate-500">Nenhuma pendência operacional.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {preview.map((n) => {
                const cfg = severityConfig[n.severity]
                const Icon = cfg.icon
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-3 border-l-2 px-4 py-3 transition hover:bg-slate-50",
                      cfg.row
                    )}
                  >
                    <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm")}>
                      <Icon className={cn("h-4 w-4", cfg.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold text-navy-900">{n.title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{n.description}</p>
                    </div>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </Link>
                )
              })}
            </div>
          )}

          {/* Footer */}
          {count > 5 && (
            <div className="border-t border-slate-100 px-4 py-2 text-center">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-royal-600 hover:text-royal-700"
              >
                Ver todas no dashboard →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standalone card for the dashboard page ───────────────────

export function OperationalAlertsCard() {
  const { notifications, loading } = useFetchNotifications()

  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 p-4 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-100">
            <Bell className="h-5 w-5 text-warning-600" />
          </div>
          <div>
            <h3 className="font-syne font-semibold text-navy-900">Atenção operacional</h3>
            <p className="text-sm text-gray-500">Verificando pendências…</p>
          </div>
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
        </div>
      </section>
    )
  }

  const hasCritical = notifications.some((n) => n.severity === "critical")
  const preview = notifications.slice(0, 5)

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-gray-100 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", hasCritical ? "bg-danger-100" : notifications.length > 0 ? "bg-warning-100" : "bg-success-100")}>
            <Bell className={cn("h-5 w-5", hasCritical ? "text-danger-600" : notifications.length > 0 ? "text-warning-600" : "text-success-600")} />
          </div>
          <div>
            <h3 className="font-syne font-semibold text-navy-900">Atenção operacional</h3>
            <p className="text-sm text-gray-500">
              {notifications.length === 0
                ? "Nenhuma pendência detectada."
                : `${notifications.length} pendência${notifications.length > 1 ? "s" : ""} operacional${notifications.length > 1 ? "is" : ""}`}
            </p>
          </div>
        </div>
        {notifications.length > 0 && (
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold text-white", hasCritical ? "bg-danger-500" : "bg-warning-400")}>
            {notifications.length}
          </span>
        )}
      </div>

      {/* Body */}
      {notifications.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-50">
            <Bell className="h-5 w-5 text-success-500" />
          </div>
          <div>
            <p className="font-semibold text-navy-900">Tudo certo por enquanto</p>
            <p className="text-sm text-gray-500">Sem recebíveis vencidos, contas atrasadas ou estoque parado crítico.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {preview.map((n) => {
            const cfg = severityConfig[n.severity]
            const Icon = cfg.icon
            return (
              <div key={n.id} className={cn("flex items-start gap-4 border-l-2 px-4 py-3 sm:px-5", cfg.row)}>
                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm")}>
                  <Icon className={cn("h-4 w-4", cfg.iconColor)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-navy-900">{n.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{n.description}</p>
                </div>
                <Link
                  href={n.href}
                  className="mt-0.5 shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-navy-800 shadow-sm transition hover:border-royal-300 hover:text-royal-700"
                >
                  Ver
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
