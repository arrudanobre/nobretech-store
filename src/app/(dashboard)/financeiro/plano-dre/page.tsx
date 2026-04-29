"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, Edit3, ListTree, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

type CashFlowType = "income" | "expense" | "none"
type FinancialType =
  | "revenue"
  | "deduction"
  | "cogs"
  | "operating_expense"
  | "financial_expense"
  | "financial_revenue"
  | "tax"
  | "inventory_asset"
  | "owner_equity"
  | "transfer"
  | "adjustment"
type StatementSection = "cash" | "dre" | "inventory" | "equity" | "transfer" | "adjustment"

type ChartAccount = {
  id: string
  code: string
  name: string
  cash_flow_type: CashFlowType
  financial_type: FinancialType
  statement_section: StatementSection
  affects_cash: boolean
  affects_dre: boolean
  affects_inventory: boolean
  affects_owner_equity: boolean
  sort_order: number
  parent_code?: string | null
  dre_group?: string | null
  level?: number | null
  is_active: boolean
}

const FINANCIAL_TYPES: { value: FinancialType; label: string; hint: string }[] = [
  { value: "revenue", label: "Receita bruta", hint: "Vendas e serviços" },
  { value: "deduction", label: "Dedução da receita", hint: "Descontos, taxas e estornos" },
  { value: "cogs", label: "CMV", hint: "Custo do produto vendido" },
  { value: "operating_expense", label: "Despesa operacional", hint: "Comercial, administrativo e marketing" },
  { value: "financial_expense", label: "Despesa financeira", hint: "Juros, multas e bancos" },
  { value: "financial_revenue", label: "Receita financeira", hint: "Rendimentos" },
  { value: "tax", label: "Impostos", hint: "Simples, MEI e taxas fiscais" },
  { value: "inventory_asset", label: "Estoque / caixa", hint: "Compra de estoque fora do DRE" },
  { value: "owner_equity", label: "Sócios", hint: "Aportes e retiradas" },
  { value: "adjustment", label: "Ajuste", hint: "Correções internas" },
]

const CASH_FLOW_TYPES: { value: CashFlowType; label: string }[] = [
  { value: "income", label: "Entrada" },
  { value: "expense", label: "Saída" },
  { value: "none", label: "Sem caixa" },
]

const STATEMENT_SECTIONS: { value: StatementSection; label: string }[] = [
  { value: "dre", label: "DRE" },
  { value: "inventory", label: "Estoque" },
  { value: "equity", label: "Sócios" },
  { value: "cash", label: "Caixa" },
  { value: "adjustment", label: "Ajuste" },
]

const emptyForm = {
  code: "",
  name: "",
  parent_code: "",
  dre_group: "",
  level: "2",
  cash_flow_type: "expense" as CashFlowType,
  financial_type: "operating_expense" as FinancialType,
  statement_section: "dre" as StatementSection,
  sort_order: "",
  affects_cash: true,
  affects_dre: true,
  affects_inventory: false,
  affects_owner_equity: false,
}

const DEFAULT_PARENT_BY_TYPE: Record<FinancialType, { code: string; name: string; group: string }> = {
  revenue: { code: "1", name: "Receita Bruta de Vendas", group: "1. Receita Bruta de Vendas" },
  deduction: { code: "2", name: "Deduções da Receita", group: "2. Deduções da Receita" },
  cogs: { code: "3", name: "Custo das Mercadorias Vendidas (CMV)", group: "3. CMV" },
  operating_expense: { code: "4", name: "Despesas Operacionais", group: "4. Despesas Operacionais" },
  financial_expense: { code: "5", name: "Resultado Financeiro", group: "5. Resultado Financeiro" },
  financial_revenue: { code: "5", name: "Resultado Financeiro", group: "5. Resultado Financeiro" },
  tax: { code: "6", name: "Impostos", group: "6. Impostos" },
  inventory_asset: { code: "7", name: "Estoque / Caixa", group: "7. Estoque / Caixa" },
  owner_equity: { code: "8", name: "Sócios / Patrimônio", group: "8. Sócios" },
  transfer: { code: "9", name: "Transferências", group: "9. Transferências" },
  adjustment: { code: "9", name: "Ajustes", group: "9. Ajustes" },
}

function financialTypeLabel(type: string) {
  return FINANCIAL_TYPES.find((item) => item.value === type)?.label || type
}

function nextSortOrder(accounts: ChartAccount[]) {
  return String((Math.max(0, ...accounts.map((account) => Number(account.sort_order || 0))) || 0) + 10)
}

function sortOrderFromCode(code: string) {
  const [main, child] = code.split(".")
  return String((Number(main || 0) * 1000) + (Number(child || 0) * 10))
}

function nextChildCode(accounts: ChartAccount[], parentCode: string) {
  const children = accounts.filter((account) => account.parent_code === parentCode)
  const next = Math.max(0, ...children.map((account) => Number(String(account.code).split(".")[1] || 0))) + 1
  return `${parentCode}.${String(next).padStart(2, "0")}`
}

function defaultSectionForType(type: FinancialType): StatementSection {
  if (type === "inventory_asset") return "inventory"
  if (type === "owner_equity") return "equity"
  if (["transfer"].includes(type)) return "transfer"
  if (["adjustment"].includes(type)) return "adjustment"
  return "dre"
}

function defaultCashFlowForType(type: FinancialType): CashFlowType {
  if (type === "revenue" || type === "financial_revenue" || type === "owner_equity") return "income"
  if (type === "transfer" || type === "adjustment") return "none"
  return "expense"
}

function shouldAffectDre(type: FinancialType) {
  return !["inventory_asset", "owner_equity", "transfer", "adjustment"].includes(type)
}

export default function PlanoDrePage() {
  const [accounts, setAccounts] = useState<ChartAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ChartAccount | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const { data, error } = await (supabase.from("finance_chart_accounts") as any)
        .select("id, code, name, cash_flow_type, financial_type, statement_section, affects_cash, affects_dre, affects_inventory, affects_owner_equity, sort_order, parent_code, dre_group, level, is_active")
        .order("sort_order", { ascending: true })

      if (error) throw error
      setAccounts(data || [])
      setForm((current) => ({ ...current, sort_order: current.sort_order || nextSortOrder(data || []) }))
    } catch (error: any) {
      toast({ title: "Erro ao carregar plano de DRE", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const parentAccounts = useMemo(() => accounts.filter((account) => account.level === 1 && account.is_active), [accounts])
  const parentOptions = useMemo(() => {
    const defaults = Array.from(
      new Map(Object.values(DEFAULT_PARENT_BY_TYPE).map((item) => [item.code, item])).values()
    )
    const syntheticParents = defaults
      .filter((item) => !parentAccounts.some((account) => account.code === item.code))
      .map((item) => ({
        id: `default-${item.code}`,
        code: item.code,
        name: `${item.name} (será criado automaticamente)`,
        dre_group: item.group,
      }))
    return [...parentAccounts, ...syntheticParents]
  }, [parentAccounts])
  const filteredAccounts = useMemo(() => {
    const query = search.toLowerCase().trim()
    if (!query) return accounts
    return accounts.filter((account) => [
      account.code,
      account.name,
      account.dre_group || "",
      financialTypeLabel(account.financial_type),
    ].some((value) => value.toLowerCase().includes(query)))
  }, [accounts, search])

  const resetForm = () => {
    setEditing(null)
    const parent = DEFAULT_PARENT_BY_TYPE[emptyForm.financial_type]
    const code = nextChildCode(accounts, parent.code)
    setForm({ ...emptyForm, parent_code: parent.code, dre_group: parent.group, code, sort_order: sortOrderFromCode(code), level: "2" })
    setShowAdvanced(false)
  }

  const startEdit = (account: ChartAccount) => {
    setEditing(account)
    setForm({
      code: account.code || "",
      name: account.name || "",
      parent_code: account.parent_code || "",
      dre_group: account.dre_group || "",
      level: String(account.level || 2),
      cash_flow_type: account.cash_flow_type,
      financial_type: account.financial_type,
      statement_section: account.statement_section,
      sort_order: String(account.sort_order || ""),
      affects_cash: account.affects_cash,
      affects_dre: account.affects_dre,
      affects_inventory: account.affects_inventory,
      affects_owner_equity: account.affects_owner_equity,
    })
  }

  const handleFinancialTypeChange = (type: FinancialType) => {
    const parent = DEFAULT_PARENT_BY_TYPE[type]
    const code = nextChildCode(accounts, parent.code)
    const isDre = shouldAffectDre(type)
    setForm((current) => ({
      ...current,
      code,
      parent_code: parent.code,
      dre_group: parent.group,
      level: "2",
      sort_order: sortOrderFromCode(code),
      financial_type: type,
      cash_flow_type: defaultCashFlowForType(type),
      statement_section: defaultSectionForType(type),
      affects_dre: isDre,
      affects_inventory: type === "inventory_asset",
      affects_owner_equity: type === "owner_equity",
    }))
  }

  useEffect(() => {
    if (editing || loading || form.code) return
    const parent = DEFAULT_PARENT_BY_TYPE[form.financial_type]
    const code = nextChildCode(accounts, parent.code)
    setForm((current) => ({
      ...current,
      parent_code: parent.code,
      dre_group: parent.group,
      code,
      sort_order: sortOrderFromCode(code),
      level: "2",
    }))
  }, [accounts, editing, form.code, form.financial_type, loading])

  const ensureParentAccount = async (parentCode: string, type: FinancialType) => {
    if (!parentCode) return
    if (accounts.some((account) => account.code === parentCode)) return
    const parent = DEFAULT_PARENT_BY_TYPE[type]
    if (!parent || parent.code !== parentCode) return
    const { error } = await (supabase.from("finance_chart_accounts") as any).insert({
      code: parent.code,
      name: parent.name,
      parent_code: null,
      dre_group: parent.group,
      level: 1,
      cash_flow_type: "none",
      financial_type: type,
      statement_section: defaultSectionForType(type),
      sort_order: sortOrderFromCode(parent.code),
      affects_cash: false,
      affects_dre: false,
      affects_inventory: type === "inventory_asset",
      affects_owner_equity: type === "owner_equity",
      is_active: true,
    })
    if (error) throw error
  }

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Informe código e nome do item", type: "error" })
      return
    }

    setSaving(true)
    try {
      await ensureParentAccount(form.parent_code, form.financial_type)
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        parent_code: form.parent_code || null,
        dre_group: form.dre_group.trim() || null,
        level: Number(form.level || 2),
        cash_flow_type: form.cash_flow_type,
        financial_type: form.financial_type,
        statement_section: form.statement_section,
        sort_order: Number(form.sort_order || 0),
        affects_cash: form.affects_cash,
        affects_dre: form.affects_dre,
        affects_inventory: form.affects_inventory,
        affects_owner_equity: form.affects_owner_equity,
        is_active: true,
      }
      const { error } = editing
        ? await (supabase.from("finance_chart_accounts") as any).update(payload).eq("id", editing.id)
        : await (supabase.from("finance_chart_accounts") as any).insert(payload)

      if (error) throw error
      toast({ title: editing ? "Item de DRE atualizado" : "Item de DRE criado", type: "success" })
      resetForm()
      fetchAccounts()
    } catch (error: any) {
      toast({ title: "Erro ao salvar item", description: error.message, type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (account: ChartAccount) => {
    try {
      const { error } = await (supabase.from("finance_chart_accounts") as any)
        .update({ is_active: !account.is_active })
        .eq("id", account.id)
      if (error) throw error
      toast({ title: account.is_active ? "Item desativado" : "Item reativado", type: "success" })
      fetchAccounts()
    } catch (error: any) {
      toast({ title: "Erro ao alterar status", description: error.message, type: "error" })
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/financeiro" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-royal-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Painel financeiro
          </Link>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">Plano de DRE</h2>
          <p className="text-sm text-gray-500">Gerencie categorias e subcategorias usadas nos lançamentos e no demonstrativo.</p>
        </div>
        <Button variant="ghost" onClick={fetchAccounts}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">{editing ? "Editar item" : "Novo item"}</h3>
              <p className="text-sm text-gray-500">Crie grupos ou subitens para classificar receitas e despesas.</p>
            </div>
            {editing && (
              <button onClick={resetForm} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <form onSubmit={saveAccount} className="space-y-4">
            <Input label="Nome" placeholder="Ex: Aporte temporário do proprietário" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />

            <label className="space-y-1.5 block">
              <span className="text-xs font-semibold text-navy-900">Tipo DRE</span>
              <select
                value={form.financial_type}
                onChange={(event) => handleFinancialTypeChange(event.target.value as FinancialType)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
              >
                {FINANCIAL_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label} · {type.hint}</option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-royal-100 bg-royal-50/50 p-3 text-sm text-navy-900">
              <p className="font-semibold">Classificação sugerida pelo sistema</p>
              <p className="mt-1 text-gray-600">
                Código <strong>{form.code || "automático"}</strong> · Grupo <strong>{form.dre_group || "automático"}</strong> · Ordem <strong>{form.sort_order || "automática"}</strong>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-navy-900">Grupo pai</span>
                <select
                  value={form.parent_code}
                  onChange={(event) => {
                    const parent = parentOptions.find((item) => item.code === event.target.value)
                    const code = event.target.value ? nextChildCode(accounts, event.target.value) : String(Math.max(0, ...parentAccounts.map((item) => Number(item.code) || 0)) + 1)
                    setForm({
                      ...form,
                      code,
                      parent_code: event.target.value,
                      dre_group: parent?.dre_group || form.dre_group,
                      level: event.target.value ? "2" : "1",
                      sort_order: sortOrderFromCode(code),
                    })
                  }}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                >
                  <option value="">Item principal</option>
                  {parentOptions.map((account) => <option key={account.id} value={account.code}>{account.code} · {account.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-navy-900">Movimento</span>
                <select
                  value={form.cash_flow_type}
                  onChange={(event) => setForm({ ...form, cash_flow_type: event.target.value as CashFlowType })}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                >
                  {CASH_FLOW_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Ajustes avançados
              <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
            </button>

            {showAdvanced && (
              <div className="grid gap-3 rounded-2xl border border-gray-100 p-3 sm:grid-cols-2">
                <Input label="Código" placeholder="4.91" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value, sort_order: sortOrderFromCode(event.target.value) })} />
                <Input label="Grupo visual" placeholder="4.2 Administrativas" value={form.dre_group} onChange={(event) => setForm({ ...form, dre_group: event.target.value })} />
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-navy-900">Área</span>
                <select
                  value={form.statement_section}
                  onChange={(event) => setForm({ ...form, statement_section: event.target.value as StatementSection })}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                >
                  {STATEMENT_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
                </select>
              </label>
              <Input label="Ordem" inputMode="numeric" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value.replace(/\D/g, "") })} />
              <Input label="Nível" inputMode="numeric" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value.replace(/\D/g, "") || "2" })} />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["affects_cash", "Afeta caixa"],
                ["affects_dre", "Entra no DRE"],
                ["affects_inventory", "Afeta estoque"],
                ["affects_owner_equity", "Sócios"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
                  {label}
                  <input
                    type="checkbox"
                    checked={Boolean((form as any)[key])}
                    onChange={(event) => setForm({ ...form, [key]: event.target.checked } as typeof form)}
                    className="h-4 w-4 accent-royal-500"
                  />
                </label>
              ))}
            </div>

            <Button type="submit" fullWidth isLoading={saving}>
              {editing ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {editing ? "Salvar alterações" : "Criar item"}
            </Button>
          </form>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">Itens cadastrados</h3>
              <p className="text-sm text-gray-500">{filteredAccounts.length} item(ns) no plano de DRE.</p>
            </div>
            <div className="relative sm:w-80">
              <Input placeholder="Buscar código, nome ou tipo..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-royal-500 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Grupo</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAccounts.map((account) => (
                    <tr key={account.id} className={cn("hover:bg-gray-50/70", !account.is_active && "opacity-55")}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", account.level === 1 ? "bg-navy-900 text-white" : "bg-royal-50 text-royal-600")}>
                            <ListTree className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-navy-900">{account.code} · {account.name}</p>
                            <p className="text-xs text-gray-500">{account.level === 1 ? "Item principal" : `Subitem de ${account.parent_code || "sem grupo"}`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-600">{financialTypeLabel(account.financial_type)}</td>
                      <td className="px-4 py-4 text-gray-600">{account.dre_group || "-"}</td>
                      <td className="px-4 py-4 text-center">
                        <Badge variant={account.is_active ? "green" : "gray"}>{account.is_active ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(account)} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white hover:text-royal-600">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button onClick={() => toggleActive(account)} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-white hover:text-royal-600">
                            {account.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
