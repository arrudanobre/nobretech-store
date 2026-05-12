import assert from "node:assert/strict"
import {
  createDecisionMemory,
  hasOrionDecisionMemoryTable,
  ignoreDecisionMemory,
  loadOpenDecisionMemories,
  loadRecentDecisionMemories,
  recordDecisionOutcome,
  resolveDecisionMemory,
  updateDecisionStatus,
  type OrionDecisionConfidence,
  type OrionDecisionPriority,
  type OrionDecisionMemoryInput,
  type OrionDecisionQueryAdapter,
  type OrionDecisionResultStatus,
  type OrionDecisionStatus,
  type OrionDecisionType,
} from "./orion-decision-memory-store"

type DecisionRow = {
  id: string
  company_id: string
  decision_type: OrionDecisionType
  title: string
  recommendation: string
  reason: string
  status: OrionDecisionStatus
  priority: OrionDecisionPriority
  confidence: OrionDecisionConfidence
  source_question: string
  decision_payload: Record<string, unknown>
  expected_outcome: Record<string, unknown>
  actual_outcome: Record<string, unknown>
  result_status: OrionDecisionResultStatus
  reflection: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  review_after: string | null
}

class MissingTableAdapter implements OrionDecisionQueryAdapter {
  async query<T extends Record<string, unknown>>(): Promise<{ rows: T[] }> {
    const error = new Error("relation does not exist") as Error & { code: string }
    error.code = "42P01"
    throw error
  }
}

class FakeDecisionAdapter implements OrionDecisionQueryAdapter {
  private rows: DecisionRow[] = []
  private sequence = 0
  private now = 0

  async query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
    const normalized = sql.replace(/\s+/g, " ").trim()
    if (normalized.startsWith("SELECT to_regclass")) {
      return { rows: [{ table_exists: "orion_decision_memory" } as unknown as T] }
    }
    if (normalized.startsWith("SELECT * FROM orion_decision_memory WHERE company_id = $1::uuid AND status IN ('open', 'in_progress')")) {
      const companyId = String(params[0])
      const limit = Number(params[1] || 20)
      return {
        rows: this.rows
          .filter((row) => row.company_id === companyId && (row.status === "open" || row.status === "in_progress"))
          .slice(0, limit) as unknown as T[],
      }
    }
    if (normalized.startsWith("SELECT * FROM orion_decision_memory WHERE company_id = $1::uuid ORDER BY updated_at DESC")) {
      const companyId = String(params[0])
      const limit = Number(params[1] || 10)
      return {
        rows: this.rows
          .filter((row) => row.company_id === companyId)
          .slice(0, limit) as unknown as T[],
      }
    }
    if (normalized.includes("decision_payload->>'decisionKey' = $3")) {
      const [companyId, decisionType, decisionKey] = params as [string, string, string]
      return {
        rows: this.rows.filter((row) =>
          row.company_id === companyId &&
          row.decision_type === decisionType &&
          (row.status === "open" || row.status === "in_progress") &&
          row.decision_payload.decisionKey === decisionKey
        ).slice(0, 1) as unknown as T[],
      }
    }
    if (normalized.startsWith("UPDATE orion_decision_memory SET title = $2")) {
      const [id, title, recommendation, reason, priority, confidence, sourceQuestion, payloadJson, expectedJson, reviewAfter, companyId] = params
      const row = this.rows.find((item) => item.id === id && item.company_id === companyId)
      if (!row) return { rows: [] as T[] }
      row.title = String(title)
      row.recommendation = String(recommendation)
      row.reason = String(reason)
      row.priority = priority as OrionDecisionPriority
      row.confidence = confidence as OrionDecisionConfidence
      row.source_question = String(sourceQuestion)
      row.decision_payload = JSON.parse(String(payloadJson))
      row.expected_outcome = JSON.parse(String(expectedJson))
      row.review_after = reviewAfter as string | null
      row.updated_at = this.nextTimestamp()
      return { rows: [row] as unknown as T[] }
    }
    if (normalized.startsWith("INSERT INTO orion_decision_memory")) {
      const [companyId, decisionType, title, recommendation, reason, status, priority, confidence, sourceQuestion, payloadJson, expectedJson, reviewAfter] = params
      const ts = this.nextTimestamp()
      const row: DecisionRow = {
        id: `decision-${++this.sequence}`,
        company_id: String(companyId),
        decision_type: decisionType as OrionDecisionType,
        title: String(title),
        recommendation: String(recommendation),
        reason: String(reason),
        status: status as OrionDecisionStatus,
        priority: priority as OrionDecisionPriority,
        confidence: confidence as OrionDecisionConfidence,
        source_question: String(sourceQuestion),
        decision_payload: JSON.parse(String(payloadJson)),
        expected_outcome: JSON.parse(String(expectedJson)),
        actual_outcome: {},
        result_status: "pending",
        reflection: "",
        created_at: ts,
        updated_at: ts,
        resolved_at: null,
        review_after: reviewAfter as string | null,
      }
      this.rows.push(row)
      return { rows: [row] as unknown as T[] }
    }
    if (normalized.startsWith("UPDATE orion_decision_memory SET status = $3")) {
      const [companyId, id, status] = params as [string, string, OrionDecisionStatus]
      const row = this.rows.find((item) => item.id === id && item.company_id === companyId)
      if (row) {
        row.status = status
        if (status === "done" || status === "ignored" || status === "superseded") {
          row.resolved_at = this.nextTimestamp()
        }
        row.updated_at = this.nextTimestamp()
      }
      return { rows: [] as T[] }
    }
    if (normalized.startsWith("UPDATE orion_decision_memory SET result_status = $3")) {
      const [companyId, id, resultStatus, reflection, actualJson, status] = params as [
        string, string, OrionDecisionResultStatus, string, string, OrionDecisionStatus,
      ]
      const row = this.rows.find((item) => item.id === id && item.company_id === companyId)
      if (row) {
        row.result_status = resultStatus
        row.reflection = reflection
        row.actual_outcome = JSON.parse(actualJson)
        row.status = status
        if (status === "done" || status === "ignored" || status === "superseded") {
          row.resolved_at = this.nextTimestamp()
        }
        row.updated_at = this.nextTimestamp()
      }
      return { rows: [] as T[] }
    }
    return { rows: [] as T[] }
  }

  private nextTimestamp() {
    this.now += 1000
    return new Date(this.now).toISOString()
  }

  snapshot() {
    return this.rows.map((row) => ({ ...row }))
  }
}

const COMPANY_A = "00000000-0000-0000-0000-000000000001"
const COMPANY_B = "00000000-0000-0000-0000-000000000002"

async function main() {

function input(overrides: Partial<OrionDecisionMemoryInput> = {}): OrionDecisionMemoryInput {
  return {
    companyId: COMPANY_A,
    decisionType: "capital_allocation",
    title: "Recompra recomendada: iPad",
    recommendation: "Comprar seletivamente iPad (11ª geração) respeitando o teto de R$ 4.000.",
    reason: "Há margem e giro com candidato comercial.",
    priority: "high",
    confidence: "high",
    sourceQuestion: "Com R$ 4.000, o que eu compro?",
    decisionPayload: { decisionKey: "ipad-11a-geracao", entityLabel: "iPad (11ª geração)" },
    expectedOutcome: { action: "buy_ipad" },
    ...overrides,
  }
}

// Test 1: Missing table → no crash, returns []
{
  const adapter = new MissingTableAdapter()
  const open = await loadOpenDecisionMemories(COMPANY_A, { adapter, logWarnings: false })
  assert.deepEqual(open, [])
  const recent = await loadRecentDecisionMemories(COMPANY_A, { adapter, logWarnings: false })
  assert.deepEqual(recent, [])
  const created = await createDecisionMemory(input(), { adapter, logWarnings: false })
  assert.equal(created, null)
  const tableReady = await hasOrionDecisionMemoryTable({ adapter, logWarnings: false })
  assert.equal(tableReady, false)
}

// Test 2: Create + load open
{
  const adapter = new FakeDecisionAdapter()
  const created = await createDecisionMemory(input(), { adapter })
  assert.ok(created)
  assert.equal(created!.decisionType, "capital_allocation")
  assert.equal(created!.title, "Recompra recomendada: iPad")
  const open = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  assert.equal(open.length, 1)
  assert.equal(open[0].id, created!.id)
}

// Test 3: Dedup by decisionKey
{
  const adapter = new FakeDecisionAdapter()
  const a = await createDecisionMemory(input(), { adapter })
  const b = await createDecisionMemory(input({ recommendation: "Mudou recomendação por novo snapshot." }), { adapter })
  assert.ok(a && b)
  assert.equal(a!.id, b!.id)
  const open = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  assert.equal(open.length, 1)
  assert.equal(open[0].recommendation, "Mudou recomendação por novo snapshot.")
}

// Test 4: Different company → no leak
{
  const adapter = new FakeDecisionAdapter()
  await createDecisionMemory(input(), { adapter })
  await createDecisionMemory(input({ companyId: COMPANY_B }), { adapter })
  const openA = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  const openB = await loadOpenDecisionMemories(COMPANY_B, { adapter })
  assert.equal(openA.length, 1)
  assert.equal(openB.length, 1)
  assert.notEqual(openA[0].id, openB[0].id)
}

// Test 5: Update status / resolve / ignore
{
  const adapter = new FakeDecisionAdapter()
  const created = await createDecisionMemory(input(), { adapter })
  await updateDecisionStatus({ companyId: COMPANY_A, memoryId: created!.id, status: "in_progress" }, { adapter })
  const openInProgress = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  assert.equal(openInProgress[0].status, "in_progress")
  await resolveDecisionMemory(COMPANY_A, created!.id, { adapter })
  const afterResolve = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  assert.equal(afterResolve.length, 0)
  const recent = await loadRecentDecisionMemories(COMPANY_A, { adapter })
  assert.equal(recent[0].status, "done")
}

// Test 6: Record outcome
{
  const adapter = new FakeDecisionAdapter()
  const created = await createDecisionMemory(input(), { adapter })
  await recordDecisionOutcome({
    companyId: COMPANY_A,
    memoryId: created!.id,
    resultStatus: "successful",
    reflection: "Vendeu rápido com margem boa.",
    actualOutcome: { sales: 3, margin: 25 },
  }, { adapter })
  const recent = await loadRecentDecisionMemories(COMPANY_A, { adapter })
  assert.equal(recent[0].resultStatus, "successful")
  assert.equal(recent[0].status, "done")
  assert.equal(recent[0].reflection, "Vendeu rápido com margem boa.")
  assert.deepEqual(recent[0].actualOutcome, { sales: 3, margin: 25 })
}

// Test 7: Ignore decision
{
  const adapter = new FakeDecisionAdapter()
  const created = await createDecisionMemory(input(), { adapter })
  await ignoreDecisionMemory(COMPANY_A, created!.id, { adapter })
  const open = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  assert.equal(open.length, 0)
}

// Test 8: Different subtypes on same product do NOT dedupe (buy vs hold vs avoid)
{
  const adapter = new FakeDecisionAdapter()
  const buy = await createDecisionMemory(input({
    decisionPayload: { decisionKey: "ipad-11a-geracao:buy", subtype: "buy", entityLabel: "iPad (11ª geração)" },
  }), { adapter })
  const hold = await createDecisionMemory(input({
    title: "Segurar compra direta",
    recommendation: "Não comprar agora; custo passou do teto.",
    decisionPayload: { decisionKey: "ipad-11a-geracao:hold", subtype: "hold", entityLabel: "iPad (11ª geração)" },
  }), { adapter })
  assert.ok(buy && hold)
  assert.notEqual(buy!.id, hold!.id, "buy and hold for same product must be separate decisions")
  const open = await loadOpenDecisionMemories(COMPANY_A, { adapter })
  assert.equal(open.length, 2)
}

// Test 9: reviewAfter is persisted
{
  const adapter = new FakeDecisionAdapter()
  const reviewAt = "2026-05-19T00:00:00.000Z"
  const created = await createDecisionMemory(input({ reviewAfter: reviewAt }), { adapter })
  assert.equal(created!.reviewAfter, reviewAt)
}

console.log("orion-decision-memory-store tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
