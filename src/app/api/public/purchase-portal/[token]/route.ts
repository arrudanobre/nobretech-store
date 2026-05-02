import { NextResponse } from "next/server"
import { getPublicPurchaseIntro } from "@/lib/public-purchase-access"

type RouteContext = {
  params: Promise<{ token: string }> | { token: string }
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await Promise.resolve(context.params)
  const intro = await getPublicPurchaseIntro(token)
  return NextResponse.json(intro, { status: intro.available ? 200 : 404 })
}
