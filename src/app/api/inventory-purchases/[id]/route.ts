import { NextResponse } from "next/server"
import { requireApiAuthContext } from "@/lib/auth-context"
import { getInventoryPurchaseDetail, updatePurchaseSupplier, findOrCreateSupplierByName } from "@/lib/suppliers/traceability"

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
          message: "Pedido não encontrado. O item pode estar sem vínculo real com inventory_purchases. Volte ao estoque e verifique o lote/pedido vinculado.",
        },
      },
      { status: 400 }
    )
  }

  try {
    const purchase = await getInventoryPurchaseDetail(authResult.context.companyId, params.id)
    if (!purchase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Pedido não encontrado ou não vinculado corretamente.",
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: { purchase }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao carregar pedido" } },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response

  const params = await Promise.resolve(context.params)
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ data: null, error: { message: "ID inválido" } }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { supplier_id, supplier_name } = body as { supplier_id?: string | null; supplier_name?: string | null }

    if (!supplier_name?.trim()) {
      return NextResponse.json({ data: null, error: { message: "Nome do fornecedor é obrigatório" } }, { status: 400 })
    }

    let resolvedSupplierId = supplier_id || null
    if (!resolvedSupplierId) {
      const supplier = await findOrCreateSupplierByName(supplier_name.trim(), authResult.context.companyId)
      resolvedSupplierId = supplier.id
    }

    await updatePurchaseSupplier(authResult.context.companyId, params.id, resolvedSupplierId, supplier_name.trim())
    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Erro ao atualizar pedido" } },
      { status: 500 }
    )
  }
}
