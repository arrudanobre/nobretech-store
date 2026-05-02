type SupabaseLike = {
  from: (table: string) => any
}

export type SaleReceivableStatus = "pending" | "reconciled"

// Modelo atual: uma venda tem no máximo um recebível ativo. Parcelamento real
// deve ganhar uma chave própria de parcela antes de permitir múltiplas linhas.
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
