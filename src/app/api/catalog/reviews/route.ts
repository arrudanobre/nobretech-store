import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { requireApiAuthContext } from "@/lib/auth-context"
import { computeOverallScoreFromReview } from "@/lib/catalog/readiness"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const VALID_KINDS = new Set(["sealed", "seminovo", "used", "open_box"])
const SCORE_FIELDS = [
  "screen_score",
  "sides_score",
  "back_score",
  "battery_score",
  "cameras_score",
  "biometrics_score",
  "audio_score",
  "connectivity_score",
  "general_score",
] as const
const NOTE_FIELDS = [
  "screen_notes",
  "sides_notes",
  "back_notes",
  "battery_notes",
  "cameras_notes",
  "biometrics_notes",
  "audio_notes",
  "connectivity_notes",
  "general_notes",
] as const

type Body = {
  inventoryItemId?: string
  productKind?: string
  overallScore?: number | string | null
  scores?: Record<string, number | string | null>
  notes?: Record<string, string | null>
}

type ScoreParseResult =
  | { ok: true; value: number | null }
  | { ok: false; message: string }

function parseScore(value: unknown): ScoreParseResult {
  if (value === null || value === undefined || value === "") return { ok: true, value: null }
  const n = typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."))
  if (!Number.isFinite(n) || n < 0 || n > 10) {
    return { ok: false, message: "Nota precisa estar entre 0 e 10." }
  }
  return { ok: true, value: Math.round(n * 10) / 10 }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireApiAuthContext()
  if (!authResult.ok) return authResult.response
  const { companyId } = authResult.context

  const body = (await request.json().catch(() => ({}))) as Body
  const inventoryItemId = String(body.inventoryItemId || "")
  if (!UUID_RE.test(inventoryItemId)) {
    return NextResponse.json(
      { data: null, error: { message: "Item de estoque inválido" } },
      { status: 400 },
    )
  }
  const productKind = String(body.productKind || "")
  if (!VALID_KINDS.has(productKind)) {
    return NextResponse.json(
      { data: null, error: { message: "Tipo de produto inválido" } },
      { status: 400 },
    )
  }

  const inventoryResult = await pool.query<{ id: string }>(
    "SELECT id FROM inventory WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [inventoryItemId, companyId],
  )
  if (!inventoryResult.rows[0]) {
    return NextResponse.json(
      { data: null, error: { message: "Item de estoque não encontrado" } },
      { status: 404 },
    )
  }

  const scores = body.scores || {}
  const notes = body.notes || {}
  const normalized: Record<string, number | null> = {}
  for (const field of SCORE_FIELDS) {
    const key = field.replace("_score", "")
    const parsedScore = parseScore(scores[key])
    if (!parsedScore.ok) {
      return NextResponse.json(
        { data: null, error: { message: parsedScore.message } },
        { status: 400 },
      )
    }
    normalized[field] = parsedScore.value
  }
  const normalizedNotes: Record<string, string | null> = {}
  for (const field of NOTE_FIELDS) {
    const key = field.replace("_notes", "")
    const raw = notes[key]
    normalizedNotes[field] = raw == null ? null : String(raw).trim() || null
  }

  const parsedOverall = parseScore(body.overallScore)
  if (!parsedOverall.ok) {
    return NextResponse.json(
      { data: null, error: { message: parsedOverall.message } },
      { status: 400 },
    )
  }
  let overall = parsedOverall.value
  if (overall == null) {
    overall = computeOverallScoreFromReview({
      screen_score: normalized.screen_score,
      sides_score: normalized.sides_score,
      back_score: normalized.back_score,
      battery_score: normalized.battery_score,
      cameras_score: normalized.cameras_score,
      biometrics_score: normalized.biometrics_score,
      audio_score: normalized.audio_score,
      connectivity_score: normalized.connectivity_score,
      general_score: normalized.general_score,
    })
  }

  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM catalog_condition_reviews WHERE inventory_item_id = $1::uuid AND company_id = $2::uuid LIMIT 1",
    [inventoryItemId, companyId],
  )

  const params: unknown[] = [
    companyId,
    inventoryItemId,
    productKind,
    overall,
    ...SCORE_FIELDS.map((field) => normalized[field]),
    ...NOTE_FIELDS.map((field) => normalizedNotes[field]),
  ]

  if (!existing.rows[0]) {
    const placeholders = params.map((_, index) => `$${index + 1}`)
    await pool.query(
      `INSERT INTO catalog_condition_reviews (
        company_id, inventory_item_id, product_kind, overall_score,
        ${SCORE_FIELDS.join(", ")}, ${NOTE_FIELDS.join(", ")},
        reviewed_at
      ) VALUES (${placeholders[0]}::uuid, ${placeholders[1]}::uuid, ${placeholders.slice(2).join(", ")}, NOW())`,
      params,
    )
  } else {
    const setParts: string[] = ["product_kind = $3", "overall_score = $4", "reviewed_at = NOW()"]
    SCORE_FIELDS.forEach((field, index) => {
      setParts.push(`${field} = $${5 + index}`)
    })
    NOTE_FIELDS.forEach((field, index) => {
      setParts.push(`${field} = $${5 + SCORE_FIELDS.length + index}`)
    })
    await pool.query(
      `UPDATE catalog_condition_reviews
       SET ${setParts.join(", ")}, updated_at = NOW()
       WHERE company_id = $1::uuid AND inventory_item_id = $2::uuid`,
      params,
    )
  }

  return NextResponse.json({ data: { ok: true, overall }, error: null })
}
