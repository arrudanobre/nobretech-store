import { NextResponse } from "next/server"
import { NextRequest } from "next/server"
import { verifyPublicPurchasePin } from "@/lib/public-purchase-access"
import { checkRateLimit } from "@/lib/rate-limit"

type RouteContext = {
  params: Promise<{ token: string }> | { token: string }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown"
  const { token } = await Promise.resolve(context.params)

  const ipLimit = checkRateLimit(`portal-verify-ip:${ip}`, 10, 60_000)
  if (!ipLimit.ok) {
    return NextResponse.json(
      { ok: false, message: "Muitas tentativas. Aguarde antes de tentar novamente.", lockedUntil: null },
      { status: 429, headers: { "Retry-After": String(Math.ceil(ipLimit.retryAfterMs / 1000)) } }
    )
  }

  const tokenLimit = checkRateLimit(`portal-verify-token:${token}`, 5, 60_000)
  if (!tokenLimit.ok) {
    return NextResponse.json(
      { ok: false, message: "Muitas tentativas. Aguarde antes de tentar novamente.", lockedUntil: null },
      { status: 429, headers: { "Retry-After": String(Math.ceil(tokenLimit.retryAfterMs / 1000)) } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const result = await verifyPublicPurchasePin(token, String(body.pin || ""))

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message,
        lockedUntil: "lockedUntil" in result ? result.lockedUntil : null,
      },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, purchase: result.purchase })
}
