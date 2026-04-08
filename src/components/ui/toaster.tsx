"use client"

import { useState, useCallback, createContext, useContext, type ReactNode } from "react"

type ToastType = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  title: string
  description?: string
  type: ToastType
  duration?: number
}

interface ToastContextType {
  toast: (params: { title: string; description?: string; type: ToastType; duration?: number }) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback(
    ({ title, description, type, duration = 4000 }: { title: string; description?: string; type: ToastType; duration?: number }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, title, description, type, duration }])
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, duration)
      }
    },
    []
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {/* Toast List */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-slide-up rounded-xl shadow-lg border px-4 py-3 bg-card flex items-start gap-3"
            style={{
              borderColor:
                t.type === "success"
                  ? "#3ABF82"
                  : t.type === "error"
                  ? "#E05C5C"
                  : t.type === "warning"
                  ? "#C9A84C"
                  : "#3A6BC4",
            }}
          >
            <div
              className="w-2 h-2 rounded-full mt-2 shrink-0"
              style={{
                backgroundColor:
                  t.type === "success"
                    ? "#3ABF82"
                    : t.type === "error"
                    ? "#E05C5C"
                    : t.type === "warning"
                    ? "#C9A84C"
                    : "#3A6BC4",
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-navy-900">{t.title}</p>
              {t.description && (
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
