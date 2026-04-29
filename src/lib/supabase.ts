const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
const DEFAULT_USER_EMAIL = "arrudanobre@gmail.com"

type Filter = { op: string; column?: string; value: unknown }
type Order = { column: string; ascending?: boolean }

class RailwayQuery {
  private action = "select"
  private selectValue = "*"
  private values: unknown
  private filters: Filter[] = []
  private orderValue?: Order
  private limitValue?: number
  private offsetValue?: number
  private singleValue = false
  private maybeSingleValue = false
  private onConflictValue?: string

  constructor(private table: string) {}

  select(value = "*") {
    this.selectValue = value
    return this
  }

  insert(values: unknown) {
    this.action = "insert"
    this.values = values
    return this
  }

  update(values: unknown) {
    this.action = "update"
    this.values = values
    return this
  }

  delete() {
    this.action = "delete"
    return this
  }

  upsert(values: unknown, options?: { onConflict?: string }) {
    this.action = "upsert"
    this.values = values
    this.onConflictValue = options?.onConflict
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value })
    return this
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value })
    return this
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: "gte", column, value })
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: "lte", column, value })
    return this
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ op: "in", column, value })
    return this
  }

  match(value: Record<string, unknown>) {
    this.filters.push({ op: "match", value })
    return this
  }

  or(value: string) {
    this.filters.push({ op: "or", value })
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderValue = { column, ascending: options?.ascending }
    return this
  }

  limit(value: number) {
    this.limitValue = value
    return this
  }

  range(from: number, to: number) {
    this.offsetValue = from
    this.limitValue = Math.max(0, to - from + 1)
    return this
  }

  single() {
    this.singleValue = true
    return this
  }

  maybeSingle() {
    this.maybeSingleValue = true
    return this
  }

  async execute() {
    try {
      const response = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          select: this.selectValue,
          values: this.values,
          filters: this.filters,
          order: this.orderValue,
          limit: this.limitValue,
          offset: this.offsetValue,
          single: this.singleValue,
          maybeSingle: this.maybeSingleValue,
          onConflict: this.onConflictValue,
        }),
      })
      return await response.json()
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : "Erro ao acessar banco Railway" },
      }
    }
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }
}

const railwaySupabase = {
  from(table: string) {
    return new RailwayQuery(table)
  },
  auth: {
    async getSession() {
      return { data: { session: { user: { id: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL } } }, error: null }
    },
    async getUser() {
      return { data: { user: { id: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL } }, error: null }
    },
    async signInWithOtp(_options?: any) {
      return { data: null, error: null }
    },
    async exchangeCodeForSession(_code?: string) {
      return { data: null, error: null }
    },
    onAuthStateChange(callback: (event: string, session: unknown) => void) {
      setTimeout(() => callback("SIGNED_IN", { user: { id: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL } }), 0)
      return { data: { subscription: { unsubscribe() {} } } }
    },
  },
  storage: {
    from() {
      return {
        async upload() {
          return { data: null, error: null }
        },
        getPublicUrl() {
          return { data: { publicUrl: "" } }
        },
      }
    },
  },
}

export const supabase: any = railwaySupabase
