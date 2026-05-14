import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { getInventoryPurchaseList } from "@/lib/suppliers/traceability"

export const runtime = "nodejs"

export async function GET() {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const purchases = await getInventoryPurchaseList(authResult.context.companyId)
    return NextResponse.json({ data: { purchases }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao carregar compras" } },
      { status: 500 }
    )
  }
}
