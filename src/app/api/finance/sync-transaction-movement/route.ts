import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import {
  reverseMovementForDeletedTransaction,
  syncTransactionMovement,
} from "@/lib/finance/sync-transaction-movement"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const authResult = await requireApiAuthContext()
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const transactionId = String(body.transactionId || "")
    const deletedOnly = Boolean(body.deletedOnly)
    const createdBy = authResult.context.appUserId

    if (!UUID_RE.test(transactionId)) {
      return NextResponse.json({ error: { message: "transactionId inválido" } }, { status: 400 })
    }

    const companyId = authResult.context.companyId
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      if (deletedOnly) {
        await reverseMovementForDeletedTransaction(
          client,
          companyId,
          transactionId,
          "Transação removida ou conciliação desfeita",
          createdBy
        )
      } else {
        const result = await syncTransactionMovement(client, transactionId, { createdBy, expectedCompanyId: companyId })
        if (!result.ok) {
          await client.query("ROLLBACK")
          return NextResponse.json({ error: { message: result.error } }, { status: 400 })
        }
      }
      await client.query("COMMIT")
      return NextResponse.json({ ok: true })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar movimento"
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
