import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import {
  SUPERSEDABLE_STATUSES,
  SUPPLIER_OFFER_STATUSES,
  type ReviewedSupplierOffer,
  type SupplierOfferStatus,
} from "./types"

function numberOrNull(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/\./g, "").replace(",", "."))
        : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function statusFromOffer(item: ReviewedSupplierOffer): SupplierOfferStatus {
  const status = item.status && SUPPLIER_OFFER_STATUSES.includes(item.status) ? item.status : null
  if (status) return status
  if (item.availability === "available" && item.supplierPrice != null) return "available"
  if (item.availability === "unavailable") return "unavailable"
  return "needs_review"
}

function cleanWarnings(warnings: unknown) {
  return Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === "string") : []
}

async function assertSupplierBelongsToCompany(
  client: PoolClient,
  supplierId: string | null | undefined,
  companyId: string
) {
  if (!supplierId) return
  const result = await client.query<{ id: string }>(
    "SELECT id FROM suppliers WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [supplierId, companyId]
  )
  if (!result.rows[0]) throw new Error("Fornecedor não encontrado para esta empresa.")
}

export async function supersedePreviousOffers(
  client: PoolClient,
  supplierId: string,
  companyId: string
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `UPDATE supplier_offers
     SET status = 'superseded', updated_at = now()
     WHERE company_id = $1::uuid
       AND supplier_id = $2::uuid
       AND status = ANY($3::text[])
     RETURNING id`,
    [companyId, supplierId, SUPERSEDABLE_STATUSES]
  )
  return result.rowCount ?? 0
}

export async function importReviewedSupplierOffers(input: {
  companyId: string
  userId: string
  supplierId?: string | null
  rawText: string
  items: ReviewedSupplierOffer[]
  inactivatePrevious?: boolean
  parserMode?: string | null
  aiSucceededBlocks?: number | null
  aiFailedBlocks?: number | null
  localFallbackBlocks?: number | null
}) {
  const rawText = input.rawText.trim()
  if (!rawText) throw new Error("Texto bruto é obrigatório.")
  if (!input.items.length) throw new Error("Nenhuma oportunidade revisada para salvar.")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await assertSupplierBelongsToCompany(client, input.supplierId, input.companyId)

    // Supersede previous offers before inserting new batch
    let supersededCount = 0
    if (input.inactivatePrevious && input.supplierId) {
      supersededCount = await supersedePreviousOffers(client, input.supplierId, input.companyId)
    }

    const batch = await client.query<{ id: string }>(
      `INSERT INTO supplier_offer_batches
         (company_id, supplier_id, raw_text, source, created_by, parser_mode,
          ai_succeeded_blocks, ai_failed_blocks, local_fallback_blocks, saved_count)
       VALUES ($1::uuid, $2::uuid, $3, 'whatsapp', $4::uuid, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.companyId,
        input.supplierId || null,
        rawText,
        input.userId,
        input.parserMode || null,
        input.aiSucceededBlocks ?? null,
        input.aiFailedBlocks ?? null,
        input.localFallbackBlocks ?? null,
        input.items.length,
      ]
    )
    const batchId = batch.rows[0].id
    const savedIds: string[] = []

    for (const item of input.items) {
      const status = statusFromOffer(item)
      if (status !== "ignored" && !item.sourceLine?.trim()) {
        throw new Error("Todas as oportunidades salvas precisam manter a linha original.")
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO supplier_offers (
            company_id,
            batch_id,
            supplier_id,
            source_line,
            source_section,
            category,
            brand,
            model,
            variant,
            storage,
            size,
            color,
            condition,
            internal_grade,
            battery_health,
            warranty_type,
            warranty_label,
            warranty_until,
            origin,
            supplier_price,
            suggested_sale_price,
            estimated_margin,
            confidence,
            status,
            warnings,
            parsed_payload,
            duplicate_key,
            duplicate_candidate,
            created_by
          )
          VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4, $5,
            $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25::jsonb, $26::jsonb, $27, $28, $29::uuid
          )
          RETURNING id`,
        [
          input.companyId,
          batchId,
          input.supplierId || null,
          item.sourceLine || "Item sem linha original",
          item.sourceSection || null,
          item.category || null,
          item.brand || null,
          item.model || null,
          item.variant || null,
          item.storage || null,
          item.size || null,
          item.color || null,
          item.condition || "unknown",
          item.internalGrade || null,
          numberOrNull(item.batteryHealth),
          item.warrantyType || "none",
          item.warrantyLabel || null,
          item.warrantyUntil || null,
          item.origin || null,
          numberOrNull(item.supplierPrice),
          numberOrNull(item.suggestedSalePrice),
          numberOrNull(item.estimatedMargin),
          item.confidence || "medium",
          status,
          JSON.stringify(cleanWarnings(item.warnings)),
          JSON.stringify(item),
          item.duplicateKey || null,
          Boolean(item.duplicateCandidate),
          input.userId,
        ]
      )
      savedIds.push(inserted.rows[0].id)
    }

    await client.query("COMMIT")
    return { batchId, savedCount: savedIds.length, offerIds: savedIds, supersededCount }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
