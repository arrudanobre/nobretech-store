import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { getSupplierRecentItems, getSupplierTraceability } from "@/lib/suppliers/traceability"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const params = await Promise.resolve(context.params)
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Fornecedor não encontrado. Se este fornecedor veio de compras antigas, volte para a lista e use 'Validar fornecedor' para criar o cadastro real.",
        },
      },
      { status: 400 }
    )
  }

  try {
    const [traceability, recentItems] = await Promise.all([
      getSupplierTraceability(authResult.context.companyId, params.id),
      getSupplierRecentItems(authResult.context.companyId, params.id),
    ])

    if (!traceability) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Fornecedor não encontrado. Se este fornecedor veio de compras antigas, volte para a lista e use 'Validar fornecedor' para criar o cadastro real.",
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: { ...traceability, recentItems }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao carregar fornecedor" } },
      { status: 500 }
    )
  }
}
