import { NextResponse } from "next/server"
import { verifyPublicPurchasePin } from "@/lib/public-purchase-access"

type RouteContext = {
  params: Promise<{ token: string }> | { token: string }
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await Promise.resolve(context.params)
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
