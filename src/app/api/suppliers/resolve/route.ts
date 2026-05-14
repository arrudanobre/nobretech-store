import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { findOrCreateSupplierByName } from "@/lib/suppliers/traceability"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || "").trim()
    if (!name) {
      return NextResponse.json({ data: null, error: { message: "Nome do fornecedor é obrigatório" } }, { status: 400 })
    }

    const supplier = await findOrCreateSupplierByName(name, authResult.context.companyId)
    return NextResponse.json({ data: { supplier }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao resolver fornecedor" } },
      { status: 400 }
    )
  }
}
