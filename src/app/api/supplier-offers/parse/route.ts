import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { pool } from "@/lib/db"
import { parseSupplierOffersWithAI } from "@/lib/supplier-offers/ai"

export const runtime = "nodejs"

async function supplierBelongsToCompany(supplierId: string | null, companyId: string) {
  if (!supplierId) return true
  const result = await pool.query(
    "SELECT 1 FROM suppliers WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [supplierId, companyId]
  )
  return (result.rowCount || 0) > 0
}

export async function POST(request: Request) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const body = await request.json().catch(() => ({}))
    const rawText = typeof body.rawText === "string" ? body.rawText.trim() : ""
    const supplierId = typeof body.supplierId === "string" && body.supplierId.trim() ? body.supplierId.trim() : null

    if (!rawText) {
      return NextResponse.json({ data: null, error: { message: "Cole a lista do WhatsApp antes de interpretar." } }, { status: 400 })
    }
    if (!(await supplierBelongsToCompany(supplierId, authResult.context.companyId))) {
      return NextResponse.json({ data: null, error: { message: "Fornecedor não encontrado para esta empresa." } }, { status: 404 })
    }

    const result = await parseSupplierOffersWithAI(rawText, supplierId)
    return NextResponse.json({
      data: {
        items: result.items,
        parserMode: result.parserMode,
        aiSucceeded: result.aiSucceeded,
        aiFailedBlocks: result.aiFailedBlocks,
        localFallbackBlocks: result.localFallbackBlocks,
        batchWarnings: result.batchWarnings,
      },
      error: null,
    })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao interpretar lista de fornecedor." } },
      { status: 500 }
    )
  }
}
