type SupabaseLike = {
  // Supabase query builders are structurally typed across generated and fallback clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export type SaleReceivableStatus = "pending" | "reconciled"

// Compatibilidade legado: uma venda antiga pode ter um recebível ativo vinculado
// diretamente a `source_type = sale`.
export type UpsertSaleReceivableInput = {
  supabase: SupabaseLike
  companyId?: string | null
  saleId: string
  accountId?: string | null
  chartAccountId?: string | null
  amount: number
  saleDate: string
  dueDate?: string | null
  paymentMethod?: string | null
  description: string
  status: SaleReceivableStatus
}

export type UpsertSalePaymentReceivableInput = Omit<UpsertSaleReceivableInput, "saleId"> & {
  saleId: string
  paymentId: string
}

export type UpsertTradeInChangePayableInput = {
  supabase: SupabaseLike
  companyId?: string | null
  saleId: string
  accountId?: string | null
  amount: number
  saleDate: string
  dueDate?: string | null
  description: string
}

export async function upsertSaleReceivable(input: UpsertSaleReceivableInput) {
  const amount = Math.round(Math.max(0, Number(input.amount || 0)) * 100) / 100
  if (!input.saleId || amount <= 0) return null

  const existingResult = await input.supabase
    .from("transactions")
    .select("id, status")
    .eq("source_type", "sale")
    .eq("source_id", input.saleId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingResult.error) throw existingResult.error

  const payload: Record<string, unknown> = {
    type: "income",
    category: "Venda de produtos",
    description: input.description,
    amount,
    date: input.saleDate,
    due_date: input.dueDate || input.saleDate,
    payment_method: input.paymentMethod || null,
    status: input.status,
    account_id: input.accountId || null,
    chart_account_id: input.chartAccountId || null,
    reconciled_at: input.status === "reconciled" ? new Date().toISOString() : null,
    source_type: "sale",
    source_id: input.saleId,
  }

  if (input.companyId) payload.company_id = input.companyId

  const query = existingResult.data?.id
    ? input.supabase.from("transactions").update(payload).eq("id", existingResult.data.id).select("id").single()
    : input.supabase.from("transactions").insert(payload).select("id").single()

  const { data, error } = await query
  if (error) throw error
  return data?.id ? String(data.id) : null
}

export async function upsertSalePaymentReceivable(input: UpsertSalePaymentReceivableInput) {
  const amount = Math.round(Math.max(0, Number(input.amount || 0)) * 100) / 100
  if (!input.saleId || !input.paymentId || amount <= 0) return null

  const existingResult = await input.supabase
    .from("transactions")
    .select("id, status")
    .eq("source_type", "sale_payment")
    .eq("source_id", input.paymentId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingResult.error) throw existingResult.error

  const payload: Record<string, unknown> = {
    type: "income",
    category: "Venda de produtos",
    description: input.description,
    amount,
    date: input.status === "reconciled" ? input.saleDate : input.dueDate || input.saleDate,
    due_date: input.dueDate || input.saleDate,
    payment_method: input.paymentMethod || null,
    status: input.status,
    account_id: input.accountId || null,
    chart_account_id: input.chartAccountId || null,
    reconciled_at: input.status === "reconciled" ? new Date().toISOString() : null,
    source_type: "sale_payment",
    source_id: input.paymentId,
    notes: `sale_id:${input.saleId}`,
  }

  if (input.companyId) payload.company_id = input.companyId

  const query = existingResult.data?.id
    ? input.supabase.from("transactions").update(payload).eq("id", existingResult.data.id).select("id").single()
    : input.supabase.from("transactions").insert(payload).select("id").single()

  const { data, error } = await query
  if (error) throw error
  return data?.id ? String(data.id) : null
}

export async function upsertTradeInChangePayable(input: UpsertTradeInChangePayableInput) {
  const amount = Math.round(Math.max(0, Number(input.amount || 0)) * 100) / 100
  if (!input.saleId || amount <= 0) return null

  const existingResult = await input.supabase
    .from("transactions")
    .select("id, status")
    .eq("source_type", "trade_in_change")
    .eq("source_id", input.saleId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingResult.error) throw existingResult.error

  const payload: Record<string, unknown> = {
    type: "expense",
    category: "A categorizar",
    description: input.description,
    amount,
    date: input.saleDate,
    due_date: input.dueDate || input.saleDate,
    payment_method: "trade_in_return",
    status: "pending",
    account_id: input.accountId || null,
    chart_account_id: null,
    reconciled_at: null,
    source_type: "trade_in_change",
    source_id: input.saleId,
    notes: `sale_id:${input.saleId}; origem:troco_trade_in`,
  }

  if (input.companyId) payload.company_id = input.companyId

  const query = existingResult.data?.id
    ? input.supabase.from("transactions").update(payload).eq("id", existingResult.data.id).select("id").single()
    : input.supabase.from("transactions").insert(payload).select("id").single()

  const { data, error } = await query
  if (error) throw error
  return data?.id ? String(data.id) : null
}
