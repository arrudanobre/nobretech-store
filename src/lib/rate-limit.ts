// Adapter pattern — swap InMemoryRateLimiter for RedisRateLimiter in Fase 1.2.
// In-memory only: state not shared across Vercel instances. Adequate as first throttle.
// To switch: implement RateLimiter interface, call setRateLimiter() at server init.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number }

export interface RateLimiter {
  check(key: string, maxRequests: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>
}

type WindowEntry = { count: number; resetAt: number }
const store = new Map<string, WindowEntry>()
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  check(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    cleanup()
    const now = Date.now()
    const entry = store.get(key)
    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs })
      return { ok: true }
    }
    if (entry.count >= maxRequests) {
      return { ok: false, retryAfterMs: entry.resetAt - now }
    }
    entry.count += 1
    return { ok: true }
  }
}

let limiter: RateLimiter = new InMemoryRateLimiter()

// Call this once at server init to swap to a distributed backend (e.g. Redis).
// Callers of checkRateLimit must also be updated to await when switching to async impl.
export function setRateLimiter(impl: RateLimiter) {
  limiter = impl
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  // Safe cast: InMemoryRateLimiter.check is synchronous.
  // Update checkRateLimit signature to async when switching to a distributed impl.
  return limiter.check(key, maxRequests, windowMs) as RateLimitResult
}
