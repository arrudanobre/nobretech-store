import { NextResponse } from "next/server"
import { ensureSalePublicAccess, regenerateSalePublicPin } from "@/lib/public-purchase-access"

type RouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "ensure")

  const sale = action === "regenerate_pin"
    ? await regenerateSalePublicPin(id)
    : await ensureSalePublicAccess(id)

  if (!sale) {
    return NextResponse.json(
      { error: { message: "Acesso público disponível apenas para vendas concluídas." } },
      { status: 400 }
    )
  }

  return NextResponse.json({ data: sale, error: null })
}
