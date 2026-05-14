import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { getVariantSummariesForInventoryIds } from "@/lib/inventory/inventory-variants"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const body = await request.json()
    const { inventory_ids } = body as { inventory_ids?: unknown }

    if (!Array.isArray(inventory_ids)) {
      return NextResponse.json(
        { data: null, error: { message: "inventory_ids deve ser um array" } },
        { status: 400 }
      )
    }

    const validIds = inventory_ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
    const variants_by_id = await getVariantSummariesForInventoryIds(authResult.context.companyId, validIds)
    return NextResponse.json({ data: { variants_by_id }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao carregar variações" } },
      { status: 500 }
    )
  }
}
