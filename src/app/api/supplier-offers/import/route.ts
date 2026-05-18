import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { importReviewedSupplierOffers } from "@/lib/supplier-offers/persistence"
import type { ReviewedSupplierOffer } from "@/lib/supplier-offers/types"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const body = await request.json().catch(() => ({}))
    const rawText = typeof body.rawText === "string" ? body.rawText : ""
    const supplierId =
      typeof body.supplierId === "string" && body.supplierId.trim() ? body.supplierId.trim() : null
    const items = Array.isArray(body.items) ? (body.items as ReviewedSupplierOffer[]) : []
    const reviewedItems = items.filter((item) => item && typeof item === "object")
    const inactivatePrevious = body.inactivatePrevious === true && Boolean(supplierId)

    if (!rawText.trim()) {
      return NextResponse.json(
        { data: null, error: { message: "Texto bruto é obrigatório." } },
        { status: 400 }
      )
    }
    if (!reviewedItems.length) {
      return NextResponse.json(
        { data: null, error: { message: "Confirme pelo menos uma oportunidade antes de salvar." } },
        { status: 400 }
      )
    }

    const result = await importReviewedSupplierOffers({
      companyId: authResult.context.companyId,
      userId: authResult.context.appUserId,
      supplierId,
      rawText,
      items: reviewedItems,
      inactivatePrevious,
      parserMode: typeof body.parserMode === "string" ? body.parserMode : null,
      aiSucceededBlocks: typeof body.aiSucceededBlocks === "number" ? body.aiSucceededBlocks : null,
      aiFailedBlocks: typeof body.aiFailedBlocks === "number" ? body.aiFailedBlocks : null,
      localFallbackBlocks: typeof body.localFallbackBlocks === "number" ? body.localFallbackBlocks : null,
    })

    return NextResponse.json({ data: result, error: null })
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error instanceof Error ? error.message : "Erro ao salvar oportunidades." },
      },
      { status: 400 }
    )
  }
}
