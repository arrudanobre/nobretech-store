export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function pickString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/\./g, "").replace(",", ".")
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function pickUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null
}

// 3-way toggle: null = Automático, true = Sempre, false = Nunca.
function pickToggle(value: unknown): boolean | null {
  return value === true || value === false ? value : null
}

function migrationMissing(error: unknown) {
  // 42P01 = undefined_table, 42703 = undefined_column (new toggle columns
  // not yet applied via migrations/marketing_disclosure_sessions.sql).
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: string }).code
    : null
  return code === "42P01" || code === "42703"
}

export async function POST(req: Request) {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: { message: "Payload inválido." } }, { status: 400 })
  }

  const input = asRecord(body)
  const strategy = asRecord(input.strategy)
  const products = Array.isArray(input.products) ? input.products.map(asRecord) : []
  const outputs = asRecord(input.outputs)
  const source = input.source === "ai" ? "ai" : "deterministic"

  if (products.length === 0) {
    return NextResponse.json(
      { data: null, error: { message: "Selecione ao menos um produto para salvar o rascunho." } },
      { status: 400 }
    )
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const session = await client.query<{ id: string }>(
      `INSERT INTO marketing_disclosure_sessions
        (company_id, created_by, objective, channel, tone, urgency_level, general_cta, general_note, angle, add_highlight_story, add_cta_story, ai_enabled)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        auth.context.companyId,
        auth.context.appUserId,
        pickString(strategy.objective, "sell_fast"),
        pickString(strategy.channel, "whatsapp"),
        pickString(strategy.tone, "consultivo"),
        pickString(strategy.urgencyLevel, "none"),
        pickString(strategy.generalCta, ""),
        pickString(strategy.generalNote, ""),
        pickString(strategy.angle, ""),
        pickToggle(strategy.addHighlightStory),
        pickToggle(strategy.addCtaStory),
        source === "ai",
      ]
    )

    const sessionId = session.rows[0].id

    for (let index = 0; index < products.length; index += 1) {
      const item = products[index]
      const copy = asRecord(item.copy)
      const inventoryId = pickUuid(item.productId)
      const supplierOfferId = pickUuid(item.supplierOfferId)

      // Try to insert with supplier_offer_id column (requires migration_supplier_offers_integration.sql).
      // If the column doesn't exist yet, fall back to omitting it.
      try {
        await client.query(
          `INSERT INTO marketing_disclosure_items
            (
              session_id, company_id, inventory_id, supplier_offer_id, source_type,
              is_primary, is_featured,
              base_price, disclosure_price, discount_amount, discount_percent,
              installment_count, installment_amount, installment_total,
              gifts_text, warranty_label, warranty_source, product_note, product_cta,
              copy_json, display_order
            )
           VALUES (
              $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
              $6, $7,
              $8, $9, $10, $11,
              $12, $13, $14,
              $15, $16, $17, $18, $19,
              $20::jsonb, $21
            )`,
          [
            sessionId,
            auth.context.companyId,
            inventoryId,
            supplierOfferId,
            supplierOfferId ? "supplier_offer" : "inventory",
            Boolean(item.isPrimary),
            Boolean(item.isFeatured),
            pickNumber(item.basePrice),
            pickNumber(item.disclosurePrice),
            pickNumber(item.discountAmount),
            pickNumber(item.discountPercent),
            Math.max(0, Math.min(18, Math.floor(pickNumber(item.installmentCount) ?? 0))),
            pickNumber(item.installmentAmount),
            pickNumber(item.installmentTotal),
            pickString(item.gifts, ""),
            pickString(item.warrantyLabel, ""),
            pickString(item.warrantySource, ""),
            pickString(item.productNote, ""),
            pickString(item.productCta, ""),
            JSON.stringify(copy),
            index,
          ]
        )
      } catch (err) {
        if (migrationMissing(err)) {
          // Migration not yet applied — fall back to legacy insert without supplier_offer_id
          await client.query(
            `INSERT INTO marketing_disclosure_items
              (
                session_id, company_id, inventory_id, is_primary, is_featured,
                base_price, disclosure_price, discount_amount, discount_percent,
                installment_count, installment_amount, installment_total,
                gifts_text, warranty_label, warranty_source, product_note, product_cta,
                copy_json, display_order
              )
             VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15, $16, $17,
                $18::jsonb, $19
              )`,
            [
              sessionId,
              auth.context.companyId,
              inventoryId,
              Boolean(item.isPrimary),
              Boolean(item.isFeatured),
              pickNumber(item.basePrice),
              pickNumber(item.disclosurePrice),
              pickNumber(item.discountAmount),
              pickNumber(item.discountPercent),
              Math.max(0, Math.min(18, Math.floor(pickNumber(item.installmentCount) ?? 0))),
              pickNumber(item.installmentAmount),
              pickNumber(item.installmentTotal),
              pickString(item.gifts, ""),
              pickString(item.warrantyLabel, ""),
              pickString(item.warrantySource, ""),
              pickString(item.productNote, ""),
              pickString(item.productCta, ""),
              JSON.stringify(copy),
              index,
            ]
          )
        } else {
          throw err
        }
      }
    }

    for (const [channel, value] of Object.entries(outputs)) {
      const record = asRecord(value)
      await client.query(
        `INSERT INTO marketing_disclosure_outputs
          (session_id, company_id, channel, content_json, content_text, generated_by)
         VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6)`,
        [
          sessionId,
          auth.context.companyId,
          channel,
          JSON.stringify(record.json ?? null),
          pickString(record.text, ""),
          source,
        ]
      )
    }

    await client.query("COMMIT")
    return NextResponse.json({ data: { id: sessionId, message: "Rascunho salvo." }, error: null })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    console.error("[marketing/disclosure-sessions] save failed", error)
    if (migrationMissing(error)) {
      return NextResponse.json(
        { data: null, error: { message: "Persistência ainda não está disponível. A migration de divulgação precisa ser aplicada." } },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { data: null, error: { message: "Não foi possível salvar o rascunho da divulgação." } },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
