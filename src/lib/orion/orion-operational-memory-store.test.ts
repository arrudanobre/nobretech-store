import assert from "node:assert/strict"
import {
  ignoreOrionOperationalMemory,
  loadOpenOrionOperationalMemory,
  resolveOrionOperationalMemory,
  upsertOrionOperationalMemory,
  type OrionMemoryQueryAdapter,
  type OrionOperationalMemoryInput,
  type OrionOperationalMemoryItem,
  type OrionOperationalMemoryImportance,
  type OrionOperationalMemoryStatus,
  type OrionOperationalMemoryType,
} from "./orion-operational-memory-store"

type MemoryRow = {
  id: string
  company_id: string
  memory_type: OrionOperationalMemoryType
  title: string
  summary: string
  entity_type: string | null
  entity_id: string | null
  status: OrionOperationalMemoryStatus
  importance: OrionOperationalMemoryImportance
  source: string
  evidence: Record<string, unknown>
  metadata: Record<string, unknown>
  last_seen_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

class MissingTableAdapter implements OrionMemoryQueryAdapter {
  async query<T extends Record<string, unknown>>(): Promise<{ rows: T[] }> {
    const error = new Error("relation does not exist") as Error & { code: string }
    error.code = "42P01"
    throw error
  }
}

class FakeMemoryAdapter implements OrionMemoryQueryAdapter {
  private rows: MemoryRow[] = []
  private sequence = 0
  private now = 0

  async query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
    const normalized = sql.replace(/\s+/g, " ").trim()
    if (normalized.startsWith("SELECT to_regclass")) {
      return { rows: [{ table_exists: "orion_operational_memory" } as unknown as T] }
    }
    if (normalized.startsWith("SELECT * FROM orion_operational_memory WHERE company_id = $1::uuid AND status = 'open'")) {
      const companyId = String(params[0])
      const limit = Number(params[1] || 20)
      return { rows: this.openRows(companyId).slice(0, limit) as unknown as T[] }
    }
    if (normalized.includes("AND entity_type = $2")) {
      const [companyId, entityType, entityId, memoryType] = params.map(String)
      return {
        rows: this.rows.filter((row) =>
          row.company_id === companyId &&
          row.entity_type === entityType &&
          row.entity_id === entityId &&
          row.memory_type === memoryType &&
          row.status === "open"
        ).slice(0, 1) as unknown as T[],
      }
    }
    if (normalized.includes("metadata->>'memoryKey' = $3")) {
      const [companyId, memoryType, memoryKey] = params.map(String)
      return {
        rows: this.rows.filter((row) =>
          row.company_id === companyId &&
          row.memory_type === memoryType &&
          row.status === "open" &&
          row.metadata.memoryKey === memoryKey
        ).slice(0, 1) as unknown as T[],
      }
    }
    if (normalized.startsWith("UPDATE orion_operational_memory SET title = $2")) {
      const [id, title, summary, importance, source, evidence, metadata, companyId] = params
      const row = this.rows.find((item) => item.id === String(id) && item.company_id === String(companyId))
      assert.ok(row)
      row.title = String(title)
      row.summary = String(summary)
      row.importance = importance as OrionOperationalMemoryImportance
      row.source = String(source)
      row.evidence = JSON.parse(String(evidence)) as Record<string, unknown>
      row.metadata = JSON.parse(String(metadata)) as Record<string, unknown>
      row.last_seen_at = this.timestamp()
      row.updated_at = row.last_seen_at
      return { rows: [row as unknown as T] }
    }
    if (normalized.startsWith("INSERT INTO orion_operational_memory")) {
      const input = this.insertInput(params)
      const row: MemoryRow = {
        id: `memory-${++this.sequence}`,
        company_id: input.companyId,
        memory_type: input.memoryType,
        title: input.title,
        summary: input.summary,
        entity_type: input.entityType,
        entity_id: input.entityId,
        status: input.status,
        importance: input.importance,
        source: input.source,
        evidence: input.evidence,
        metadata: input.metadata,
        last_seen_at: this.timestamp(),
        resolved_at: null,
        created_at: this.timestamp(),
        updated_at: this.timestamp(),
      }
      this.rows.push(row)
      return { rows: [row as unknown as T] }
    }
    if (normalized.includes("SET status = 'resolved'")) {
      this.setStatus(String(params[0]), String(params[1]), "resolved")
      return { rows: [] }
    }
    if (normalized.includes("SET status = 'ignored'")) {
      this.setStatus(String(params[0]), String(params[1]), "ignored")
      return { rows: [] }
    }
    if (normalized.includes("SET status = 'superseded'")) {
      return { rows: [] }
    }
    throw new Error(`Unexpected SQL: ${normalized}`)
  }

  seed(input: OrionOperationalMemoryInput) {
    const row: MemoryRow = {
      id: `seed-${++this.sequence}`,
      company_id: input.companyId,
      memory_type: input.memoryType,
      title: input.title,
      summary: input.summary,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      status: input.status || "open",
      importance: input.importance || "medium",
      source: input.source || "orion",
      evidence: input.evidence || {},
      metadata: input.metadata || {},
      last_seen_at: this.timestamp(),
      resolved_at: null,
      created_at: this.timestamp(),
      updated_at: this.timestamp(),
    }
    this.rows.push(row)
    return row.id
  }

  private openRows(companyId: string) {
    const rank: Record<OrionOperationalMemoryImportance, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    return this.rows
      .filter((row) => row.company_id === companyId && row.status === "open")
      .sort((a, b) => rank[b.importance] - rank[a.importance] || b.updated_at.localeCompare(a.updated_at))
  }

  private timestamp() {
    this.now += 1
    return new Date(Date.UTC(2026, 4, 12, 12, 0, this.now)).toISOString()
  }

  private setStatus(companyId: string, id: string, status: "resolved" | "ignored") {
    const row = this.rows.find((item) => item.company_id === companyId && item.id === id)
    assert.ok(row)
    row.status = status
    row.resolved_at = this.timestamp()
    row.updated_at = row.resolved_at
  }

  private insertInput(params: readonly unknown[]) {
    return {
      companyId: String(params[0]),
      memoryType: params[1] as OrionOperationalMemoryType,
      title: String(params[2]),
      summary: String(params[3]),
      entityType: params[4] ? String(params[4]) : null,
      entityId: params[5] ? String(params[5]) : null,
      status: params[6] as OrionOperationalMemoryStatus,
      importance: params[7] as OrionOperationalMemoryImportance,
      source: String(params[8]),
      evidence: JSON.parse(String(params[9])) as Record<string, unknown>,
      metadata: JSON.parse(String(params[10])) as Record<string, unknown>,
    }
  }
}

const companyId = "11111111-1111-1111-1111-111111111111"
const otherCompanyId = "22222222-2222-2222-2222-222222222222"

async function main() {
{
  const adapter = new FakeMemoryAdapter()
  const created = await upsertOrionOperationalMemory({
    companyId,
    memoryType: "owner_decision",
    title: "Segurar desconto",
    summary: "Usuário decidiu não baixar preço agora.",
    metadata: { memoryKey: "decision:discount:iphone14" },
  }, { adapter })
  assert.ok(created)
  assert.equal(created.memoryType, "owner_decision")
  assert.equal(created.companyId, companyId)
}

{
  const adapter = new FakeMemoryAdapter()
  const first = await upsertOrionOperationalMemory({
    companyId,
    memoryType: "lead_context",
    title: "Lead Patricia",
    summary: "Sem resposta.",
    entityType: "lead",
    entityId: "33333333-3333-3333-3333-333333333333",
    metadata: { memoryKey: "lead:forgotten:patricia" },
  }, { adapter })
  const second = await upsertOrionOperationalMemory({
    companyId,
    memoryType: "lead_context",
    title: "Lead Patricia atualizado",
    summary: "Sem resposta por mais tempo.",
    entityType: "lead",
    entityId: "33333333-3333-3333-3333-333333333333",
    metadata: { memoryKey: "lead:forgotten:patricia" },
  }, { adapter })
  assert.equal(second?.id, first?.id)
  assert.equal(second?.summary, "Sem resposta por mais tempo.")
}

{
  const adapter = new FakeMemoryAdapter()
  const first = await upsertOrionOperationalMemory({
    companyId,
    memoryType: "financial_context",
    title: "Saque",
    summary: "Usuário sacou e quer recompor caixa.",
    metadata: { memoryKey: "financial:owner-withdrawal:current-month" },
  }, { adapter })
  const second = await upsertOrionOperationalMemory({
    companyId,
    memoryType: "financial_context",
    title: "Saque atualizado",
    summary: "Contexto atualizado.",
    metadata: { memoryKey: "financial:owner-withdrawal:current-month" },
  }, { adapter })
  assert.equal(second?.id, first?.id)
}

{
  const adapter = new FakeMemoryAdapter()
  const id = adapter.seed({
    companyId,
    memoryType: "owner_decision",
    title: "Decisão",
    summary: "Aberta.",
  })
  await resolveOrionOperationalMemory(companyId, id, { adapter })
  const open = await loadOpenOrionOperationalMemory(companyId, { adapter })
  assert.equal(open.some((item) => item.id === id), false)
}

{
  const adapter = new FakeMemoryAdapter()
  const id = adapter.seed({
    companyId,
    memoryType: "recommended_action",
    title: "Ação",
    summary: "Ignorar.",
  })
  await ignoreOrionOperationalMemory(companyId, id, { adapter })
  const open = await loadOpenOrionOperationalMemory(companyId, { adapter })
  assert.equal(open.length, 0)
}

{
  const adapter = new FakeMemoryAdapter()
  adapter.seed({ companyId, memoryType: "open_alert", title: "A", summary: "A" })
  adapter.seed({ companyId: otherCompanyId, memoryType: "open_alert", title: "B", summary: "B" })
  const open = await loadOpenOrionOperationalMemory(companyId, { adapter })
  assert.equal(open.length, 1)
  assert.equal(open[0].companyId, companyId)
}

{
  const adapter = new FakeMemoryAdapter()
  for (let index = 0; index < 25; index += 1) {
    adapter.seed({
      companyId,
      memoryType: "open_alert",
      title: `Alerta ${index}`,
      summary: "Resumo",
      importance: index === 24 ? "critical" : "low",
    })
  }
  const open = await loadOpenOrionOperationalMemory(companyId, { adapter })
  assert.equal(open.length, 20)
  assert.equal(open[0].importance, "critical")
}

{
  const open: OrionOperationalMemoryItem[] = await loadOpenOrionOperationalMemory(companyId, {
    adapter: new MissingTableAdapter(),
    logWarnings: false,
  })
  assert.deepEqual(open, [])
}

console.log("orion-operational-memory-store tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
