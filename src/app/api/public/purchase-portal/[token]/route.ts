import { NextResponse } from "next/server"
import { NextRequest } from "next/server"
import { getPublicPurchaseIntro } from "@/lib/public-purchase-access"
import { checkRateLimit } from "@/lib/rate-limit"

type RouteContext = {
  params: Promise<{ token: string }> | { token: string }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown"

  const rateLimitResult = checkRateLimit(`portal-intro:${ip}`, 30, 60_000)
  if (!rateLimitResult.ok) {
    return NextResponse.json(
      { available: false, lockedUntil: null, message: "Muitas tentativas. Aguarde antes de tentar novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) } }
    )
  }

  const { token } = await Promise.resolve(context.params)
  const intro = await getPublicPurchaseIntro(token)
  return NextResponse.json(intro, { status: intro.available ? 200 : 404 })
}
