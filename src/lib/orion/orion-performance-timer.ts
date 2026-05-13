type Mark = { label: string; durationMs: number }

export type OrionPerfTimer = {
  mark<T>(label: string, work: () => Promise<T>): Promise<T>
  markSync<T>(label: string, work: () => T): T
  note(label: string, durationMs: number): void
  meta(key: string, value: string | number | boolean | null | undefined): void
  logSummary(extra?: Record<string, string | number | boolean | null | undefined>): void
}

function shortRequestId() {
  return Math.random().toString(36).slice(2, 8)
}

function maskCompanyId(companyId?: string | null) {
  if (!companyId) return null
  const trimmed = String(companyId)
  if (trimmed.length <= 4) return "***"
  return `${trimmed.slice(0, 4)}***`
}

export function createOrionPerfTimer(options?: { requestId?: string; companyId?: string | null }): OrionPerfTimer {
  const start = Date.now()
  const requestId = options?.requestId || shortRequestId()
  const marks: Mark[] = []
  const metadata: Record<string, string | number | boolean | null | undefined> = {
    requestId,
    companyId: maskCompanyId(options?.companyId),
  }

  return {
    async mark(label, work) {
      const t0 = Date.now()
      try {
        return await work()
      } finally {
        marks.push({ label, durationMs: Date.now() - t0 })
      }
    },
    markSync(label, work) {
      const t0 = Date.now()
      try {
        return work()
      } finally {
        marks.push({ label, durationMs: Date.now() - t0 })
      }
    },
    note(label, durationMs) {
      marks.push({ label, durationMs })
    },
    meta(key, value) {
      metadata[key] = value
    },
    logSummary(extra) {
      const totalMs = Date.now() - start
      const parts = [`total=${totalMs}ms`]
      for (const [key, value] of Object.entries(metadata)) {
        if (value === undefined || value === null) continue
        parts.push(`${key}=${value}`)
      }
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          if (value === undefined || value === null) continue
          parts.push(`${key}=${value}`)
        }
      }
      for (const m of marks) {
        parts.push(`${m.label}=${m.durationMs}ms`)
      }
      console.log(`[ORION_PERF] ${parts.join(" ")}`)
    },
  }
}
