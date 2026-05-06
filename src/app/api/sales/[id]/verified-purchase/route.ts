import { NextResponse } from "next/server"
import { canAccess, requireApiAuthContext } from "@/lib/auth-context"
import { ensureSalePublicAccess, regenerateSalePublicPin } from "@/lib/public-purchase-access"

type RouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  if (!canAccess(authResult.context.role, "sales.edit_sensitive")) {
    return NextResponse.json(
      { error: { message: "Apenas owner pode gerar ou regenerar acesso público da venda." } },
      { status: 403 }
    )
  }

  const { id } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "ensure")
  const { companyId } = authResult.context

  const sale = action === "regenerate_pin"
    ? await regenerateSalePublicPin(id, companyId)
    : await ensureSalePublicAccess(id, companyId)

  if (!sale) {
    return NextResponse.json(
      { error: { message: "Acesso público disponível apenas para vendas concluídas." } },
      { status: 400 }
    )
  }

  return NextResponse.json({ data: sale, error: null })
}
