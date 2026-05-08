"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleMinus,
  Edit3,
  FileDown,
  FolderTree,
  GripVertical,
  Info,
  ListTree,
  MoreHorizontal,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"
import {
  compareChartAccountCodes,
  getChartAccountCodeParts,
  getChartAccountParentCode,
  getNextChartAccountCode,
  sortOrderFromChartCode,
} from "@/lib/finance-chart-account-codes"

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
type NatureFilter = "all" | "income" | "expense" | "neutral" | "orphans"

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

type ChartAccountNode = {
  account: ChartAccount
  children: ChartAccountNode[]
  depth: number
  inferredParentCode: string
  isOrphan: boolean
  hasParentMismatch: boolean
}

type ChartAccountHierarchy = {
  roots: ChartAccountNode[]
  orphanRoots: ChartAccountNode[]
}

type ActionMenuState = {
  id: string
  top: number
  right: number
  node: ChartAccountNode
  isOrphan: boolean
} | null

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

function accountNature(account: ChartAccount): "income" | "expense" | "neutral" {
  if (account.cash_flow_type === "income") return "income"
  if (account.cash_flow_type === "expense") return "expense"
  return "neutral"
}

function natureLabel(nature: ReturnType<typeof accountNature>) {
  if (nature === "income") return "Receita"
  if (nature === "expense") return "Despesa"
  return "Neutro"
}

function parentLabelFromCode(parentCode: string) {
  return parentCode ? `Subitem de ${parentCode}` : "Grupo principal"
}

function suggestedParentName(parentCode: string, child: ChartAccount) {
  const byCode: Record<string, string> = {
    "7": "Informativos de caixa",
    "9": "Ajustes de caixa",
  }
  if (byCode[parentCode]) return byCode[parentCode]

  const defaultParent = Object.values(DEFAULT_PARENT_BY_TYPE).find((item) => item.code === parentCode)
  if (defaultParent) return defaultParent.name

  return child.dre_group?.replace(/^\d+(?:\.\d+)*\s*[-.]?\s*/, "").trim() || `Grupo ${parentCode}`
}

function buildChartAccountHierarchy(accounts: ChartAccount[]): ChartAccountHierarchy {
  const byCode = new Map(accounts.map((account) => [account.code, account]))
  const nodes = new Map<string, ChartAccountNode>()

  for (const account of accounts) {
    const inferredParentCode = getChartAccountParentCode(account.code)
    nodes.set(account.code, {
      account,
      children: [],
      depth: Math.max(0, getChartAccountCodeParts(account.code).length - 1),
      inferredParentCode,
      isOrphan: Boolean(inferredParentCode && !byCode.has(inferredParentCode)),
      hasParentMismatch: Boolean(inferredParentCode && account.parent_code && account.parent_code !== inferredParentCode),
    })
  }

  const roots: ChartAccountNode[] = []
  const orphanRoots: ChartAccountNode[] = []
  for (const node of nodes.values()) {
    const parentNode = node.inferredParentCode ? nodes.get(node.inferredParentCode) : null
    if (parentNode) {
      parentNode.children.push(node)
    } else if (node.isOrphan) {
      orphanRoots.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (items: ChartAccountNode[]) => {
    items.sort((left, right) => compareChartAccountCodes(left.account.code, right.account.code))
    for (const item of items) sortNodes(item.children)
  }

  sortNodes(roots)
  sortNodes(orphanRoots)
  return { roots, orphanRoots }
}

function nodeMatchesFilters(node: ChartAccountNode, query: string, natureFilter: NatureFilter): boolean {
  const account = node.account
  const textMatches = !query || [
    account.code,
    account.name,
    account.dre_group || "",
    financialTypeLabel(account.financial_type),
    natureLabel(accountNature(account)),
  ].some((value) => value.toLowerCase().includes(query))

  const natureMatches = natureFilter === "all" || (natureFilter !== "orphans" && accountNature(account) === natureFilter) || (natureFilter === "orphans" && node.isOrphan)
  return textMatches && natureMatches
}

function filterTree(nodes: ChartAccountNode[], query: string, natureFilter: NatureFilter): ChartAccountNode[] {
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query, natureFilter)
    if (nodeMatchesFilters(node, query, natureFilter) || children.length > 0) {
      return [{ ...node, children }]
    }
    return []
  })
}

function flattenVisibleTree(nodes: ChartAccountNode[], expandedCodes: Set<string>): ChartAccountNode[] {
  return nodes.flatMap((node) => {
    const isExpanded = expandedCodes.has(node.account.code)
    return [node, ...(isExpanded ? flattenVisibleTree(node.children, expandedCodes) : [])]
  })
}

function collectExpandableCodes(nodes: ChartAccountNode[]) {
  return nodes.flatMap((node): string[] => [
    ...(node.children.length > 0 ? [node.account.code] : []),
    ...collectExpandableCodes(node.children),
  ])
}

function flattenTree(nodes: ChartAccountNode[]): ChartAccountNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)])
}

export default function PlanoDrePage() {
  const formCardRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [accounts, setAccounts] = useState<ChartAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ChartAccount | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState("")
  const [natureFilter, setNatureFilter] = useState<NatureFilter>("all")
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set())
  const [openActionMenu, setOpenActionMenu] = useState<ActionMenuState>(null)
  const [highlightForm, setHighlightForm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (!openActionMenu) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest("[data-chart-menu-trigger='true']")) return
      if (actionMenuRef.current?.contains(target)) return
      setOpenActionMenu(null)
    }
    const closeMenu = () => setOpenActionMenu(null)

    document.addEventListener("mousedown", closeOnOutsideClick)
    window.addEventListener("scroll", closeMenu, true)
    window.addEventListener("resize", closeMenu)

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      window.removeEventListener("scroll", closeMenu, true)
      window.removeEventListener("resize", closeMenu)
    }
  }, [openActionMenu])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    }
  }, [])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const { data, error } = await (supabase.from("finance_chart_accounts") as any)
        .select("id, code, name, cash_flow_type, financial_type, statement_section, affects_cash, affects_dre, affects_inventory, affects_owner_equity, sort_order, parent_code, dre_group, level, is_active")
        .order("sort_order", { ascending: true })

      if (error) throw error
      const nextAccounts = data || []
      setAccounts(nextAccounts)
      setForm((current) => ({ ...current, sort_order: current.sort_order || nextSortOrder(nextAccounts) }))
      const nextHierarchy = buildChartAccountHierarchy(nextAccounts)
      setExpandedCodes(new Set(collectExpandableCodes([...nextHierarchy.roots, ...nextHierarchy.orphanRoots])))
      return nextAccounts as ChartAccount[]
    } catch (error: any) {
      toast({ title: "Erro ao carregar plano de DRE", description: error.message, type: "error" })
      return [] as ChartAccount[]
    } finally {
      setLoading(false)
    }
  }

  const sortedAccounts = useMemo(
    () => [...accounts].sort((left, right) => compareChartAccountCodes(left.code, right.code)),
    [accounts]
  )
  const parentAccounts = useMemo(() => sortedAccounts.filter((account) => account.is_active), [sortedAccounts])
  const parentOptions = useMemo(() => {
    const defaults = Array.from(
      new Map(Object.values(DEFAULT_PARENT_BY_TYPE).map((item) => [item.code, item])).values()
    )
    const syntheticParents = defaults
      .filter((item) => !accounts.some((account) => account.code === item.code))
      .map((item) => ({
        id: `default-${item.code}`,
        code: item.code,
        name: `${item.name} (será criado automaticamente)`,
        dre_group: item.group,
      }))
    return [...parentAccounts, ...syntheticParents]
  }, [accounts, parentAccounts])
  const accountHierarchy = useMemo(() => buildChartAccountHierarchy(sortedAccounts), [sortedAccounts])
  const accountTree = accountHierarchy.roots
  const orphanTree = accountHierarchy.orphanRoots
  const filteredTree = useMemo(() => {
    const query = search.toLowerCase().trim()
    return natureFilter === "orphans" ? [] : filterTree(accountTree, query, natureFilter)
  }, [accountTree, natureFilter, search])
  const filteredOrphanTree = useMemo(() => {
    const query = search.toLowerCase().trim()
    return filterTree(orphanTree, query, natureFilter === "orphans" ? "all" : natureFilter)
  }, [natureFilter, orphanTree, search])
  const expandableCodes = useMemo(() => collectExpandableCodes([...accountTree, ...orphanTree]), [accountTree, orphanTree])
  const visibleNodes = useMemo(() => {
    const hasActiveFilter = Boolean(search.trim()) || natureFilter !== "all"
    return flattenVisibleTree(filteredTree, hasActiveFilter ? new Set(expandableCodes) : expandedCodes)
  }, [expandableCodes, expandedCodes, filteredTree, natureFilter, search])
  const visibleOrphanNodes = useMemo(() => {
    const hasActiveFilter = Boolean(search.trim()) || natureFilter !== "all"
    return flattenVisibleTree(filteredOrphanTree, hasActiveFilter ? new Set(expandableCodes) : expandedCodes)
  }, [expandableCodes, expandedCodes, filteredOrphanTree, natureFilter, search])
  const orphanNodes = useMemo(() => flattenTree(orphanTree), [orphanTree])
  const filterCounts = useMemo(() => ({
    all: accounts.length,
    income: accounts.filter((account) => accountNature(account) === "income").length,
    expense: accounts.filter((account) => accountNature(account) === "expense").length,
    neutral: accounts.filter((account) => accountNature(account) === "neutral").length,
    orphans: orphanNodes.length,
  }), [accounts, orphanNodes.length])
  const visibleTotal = visibleNodes.length + visibleOrphanNodes.length
  const inconsistentLinkCount = useMemo(() => flattenTree(accountTree).filter((node) => node.hasParentMismatch).length, [accountTree])
  const orphanCount = filterCounts.orphans + inconsistentLinkCount
  const maxDepth = useMemo(() => Math.max(1, ...accounts.map((account) => getChartAccountCodeParts(account.code).length)), [accounts])

  const focusForm = (message?: string) => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    setHighlightForm(true)
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    highlightTimeoutRef.current = setTimeout(() => setHighlightForm(false), 1800)
    if (message) toast({ title: message, type: "success" })
  }

  const toggleActionMenu = (event: React.MouseEvent<HTMLButtonElement>, node: ChartAccountNode, isOrphan = false) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const nextId = `${isOrphan ? "orphan" : "account"}-${node.account.id}`
    setOpenActionMenu((current) => current?.id === nextId
      ? null
      : {
          id: nextId,
          top: rect.bottom + 8,
          right: Math.max(16, window.innerWidth - rect.right),
          node,
          isOrphan,
        })
  }

  const runMenuAction = (action: () => void) => {
    setOpenActionMenu(null)
    action()
  }

  const resetForm = (sourceAccounts = accounts) => {
    setEditing(null)
    const parent = DEFAULT_PARENT_BY_TYPE[emptyForm.financial_type]
    const code = getNextChartAccountCode(sourceAccounts, parent.code)
    setForm({ ...emptyForm, parent_code: parent.code, dre_group: parent.group, code, sort_order: sortOrderFromChartCode(code), level: "2" })
    setShowAdvanced(false)
  }

  const startCreateSubitem = (parentAccount: ChartAccount) => {
    const code = getNextChartAccountCode(accounts, parentAccount.code)
    const isDre = shouldAffectDre(parentAccount.financial_type)
    setEditing(null)
    setForm({
      ...emptyForm,
      code,
      name: "",
      parent_code: parentAccount.code,
      dre_group: parentAccount.dre_group || parentAccount.name,
      level: String(getChartAccountCodeParts(code).length),
      cash_flow_type: parentAccount.cash_flow_type,
      financial_type: parentAccount.financial_type,
      statement_section: parentAccount.statement_section,
      sort_order: sortOrderFromChartCode(code),
      affects_cash: parentAccount.affects_cash,
      affects_dre: isDre && parentAccount.affects_dre,
      affects_inventory: parentAccount.affects_inventory,
      affects_owner_equity: parentAccount.affects_owner_equity,
    })
    setShowAdvanced(false)
    setExpandedCodes((current) => new Set([...current, parentAccount.code]))
    focusForm(`Formulário preenchido para criar subitem de ${parentAccount.code}. Revise e clique em Criar item.`)
  }

  const startCreateParentGroup = (orphanNode: ChartAccountNode) => {
    const parentCode = orphanNode.inferredParentCode
    const child = orphanNode.account
    if (!parentCode) return

    setEditing(null)
    setForm({
      ...emptyForm,
      code: parentCode,
      name: suggestedParentName(parentCode, child),
      parent_code: "",
      dre_group: `${parentCode}. ${suggestedParentName(parentCode, child)}`,
      level: String(getChartAccountCodeParts(parentCode).length || 1),
      cash_flow_type: "none",
      financial_type: child.financial_type,
      statement_section: child.statement_section,
      sort_order: sortOrderFromChartCode(parentCode),
      affects_cash: false,
      affects_dre: false,
      affects_inventory: child.affects_inventory,
      affects_owner_equity: child.affects_owner_equity,
    })
    setShowAdvanced(false)
    focusForm(`Formulário preenchido para criar o grupo pai ${parentCode}. Revise e clique em Criar item.`)
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
    focusForm(`Formulário preenchido para editar ${account.code}. Revise e clique em Salvar alterações.`)
  }

  const handleFinancialTypeChange = (type: FinancialType) => {
    const parent = DEFAULT_PARENT_BY_TYPE[type]
    const code = getNextChartAccountCode(accounts, parent.code)
    const isDre = shouldAffectDre(type)
    setForm((current) => ({
      ...current,
      code,
      parent_code: parent.code,
      dre_group: parent.group,
      level: "2",
      sort_order: sortOrderFromChartCode(code),
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
    const code = getNextChartAccountCode(accounts, parent.code)
    setForm((current) => ({
      ...current,
      parent_code: parent.code,
      dre_group: parent.group,
      code,
      sort_order: sortOrderFromChartCode(code),
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
      sort_order: sortOrderFromChartCode(parent.code),
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
      const requestedCode = form.code.trim()
      const codeAlreadyExists = !editing && accounts.some((account) => account.code === requestedCode)
      const suggestedCode = codeAlreadyExists ? getNextChartAccountCode(accounts, form.parent_code || null) : requestedCode
      const codeChangedBeforeSave = !editing && suggestedCode !== form.code.trim()
      const payload = {
        code: suggestedCode,
        name: form.name.trim(),
        parent_code: form.parent_code || null,
        dre_group: form.dre_group.trim() || null,
        level: Number(form.level || 2),
        cash_flow_type: form.cash_flow_type,
        financial_type: form.financial_type,
        statement_section: form.statement_section,
        sort_order: Number(codeChangedBeforeSave ? sortOrderFromChartCode(suggestedCode) : form.sort_order || 0),
        affects_cash: form.affects_cash,
        affects_dre: form.affects_dre,
        affects_inventory: form.affects_inventory,
        affects_owner_equity: form.affects_owner_equity,
        is_active: true,
      }
      const { data, error } = editing
        ? await (supabase.from("finance_chart_accounts") as any).update(payload).eq("id", editing.id)
        : await (supabase.from("finance_chart_accounts") as any).insert(payload)

      if (error) throw error
      const savedCode = Array.isArray(data) ? data[0]?.code : data?.code
      toast({
        title: editing ? "Item de DRE atualizado" : "Item de DRE criado",
        description: !editing && savedCode && savedCode !== form.code.trim()
          ? `O código ${form.code.trim()} já estava em uso. O sistema salvou como ${savedCode}.`
          : undefined,
        type: "success",
      })
      const latestAccounts = await fetchAccounts()
      resetForm(latestAccounts)
    } catch (error: any) {
      toast({ title: "Erro ao salvar item", description: error.message, type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (account: ChartAccount, requireConfirmation = false) => {
    if (requireConfirmation && account.is_active) {
      const confirmed = window.confirm(`Desativar ${account.code} · ${account.name}? O item não será apagado.`)
      if (!confirmed) return
    }

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

  const toggleExpanded = (code: string) => {
    setExpandedCodes((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const expandAll = () => setExpandedCodes(new Set(expandableCodes))
  const collapseAll = () => setExpandedCodes(new Set())

  const exportAccounts = () => {
    const header = ["code", "name", "cash_flow_type", "financial_type", "statement_section", "parent_code", "dre_group", "is_active"]
    const rows = sortedAccounts.map((account) => header.map((column) => {
      const value = String((account as any)[column] ?? "")
      return `"${value.replace(/"/g, '""')}"`
    }).join(","))
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "plano-dre.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  const actionMenuPortal = openActionMenu && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={actionMenuRef}
          className="fixed z-50 min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 text-sm shadow-xl"
          style={{ top: openActionMenu.top, right: openActionMenu.right }}
        >
          <button
            type="button"
            onClick={() => runMenuAction(() => startEdit(openActionMenu.node.account))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50"
          >
            <Edit3 className="h-3.5 w-3.5" /> Editar
          </button>
          {openActionMenu.isOrphan && (
            <button
              type="button"
              onClick={() => runMenuAction(() => startCreateParentGroup(openActionMenu.node))}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-amber-800 hover:bg-amber-50"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Criar grupo pai
            </button>
          )}
          <button
            type="button"
            onClick={() => runMenuAction(() => startCreateSubitem(openActionMenu.node.account))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-royal-700 hover:bg-royal-50"
          >
            <PlusCircle className="h-3.5 w-3.5" /> Criar subitem
          </button>
          <button
            type="button"
            onClick={() => runMenuAction(() => toggleActive(openActionMenu.node.account, true))}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50",
              openActionMenu.node.account.is_active ? "text-red-600" : "text-green-700"
            )}
          >
            {openActionMenu.node.account.is_active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
            {openActionMenu.node.account.is_active ? "Desativar" : "Reativar"}
          </button>
        </div>,
        document.body
      )
    : null

  return (
    <div className="space-y-5 animate-fade-in">
      {actionMenuPortal}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Link href="/financeiro" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-royal-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Painel financeiro
          </Link>
          <h2 className="font-display font-bold text-3xl text-navy-900 font-syne">Plano de DRE</h2>
          <p className="text-sm text-gray-500">Organize a estrutura do Demonstrativo de Resultado do Exercício.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => toast({ title: "Estrutura padrão preservada", description: "Nenhuma alteração automática foi aplicada ao plano.", type: "success" })}>
            <Settings2 className="h-4 w-4" /> Estrutura padrão
          </Button>
          <Button type="button" variant="outline" onClick={exportAccounts}>
            <FileDown className="h-4 w-4" /> Exportar
          </Button>
          <Button type="button" onClick={() => resetForm()}>
            <Plus className="h-4 w-4" /> Novo item
          </Button>
          <Button type="button" variant="ghost" onClick={fetchAccounts}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[420px_1fr_240px]">
        <Card ref={formCardRef} className={cn("p-5 transition-all duration-300 scroll-mt-6", highlightForm && "bg-royal-50/40 ring-2 ring-royal-300")}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">{editing ? "Editar item" : "Novo item"}</h3>
              <p className="text-sm text-gray-500">Crie grupos ou subitens para classificar receitas e despesas.</p>
            </div>
            {editing && (
              <button onClick={() => resetForm()} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
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
                    const code = getNextChartAccountCode(accounts, event.target.value || null)
                    setForm({
                      ...form,
                      code,
                      parent_code: event.target.value,
                      dre_group: parent?.dre_group || form.dre_group,
                      level: String(getChartAccountCodeParts(code).length),
                      sort_order: sortOrderFromChartCode(code),
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
                <Input label="Código" placeholder="4.91" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value, sort_order: sortOrderFromChartCode(event.target.value) })} />
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

        <Card className="overflow-hidden 2xl:min-w-0">
          <div className="space-y-4 border-b border-gray-100 p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="font-display font-bold text-navy-900 font-syne">Estrutura hierárquica</h3>
                <p className="text-sm text-gray-500">{visibleTotal} de {accounts.length} item(ns) exibidos.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={expandAll}>
                  <Plus className="h-4 w-4" /> Expandir todos
                </Button>
                <Button type="button" variant="outline" onClick={collapseAll}>
                  <ChevronDown className="h-4 w-4" /> Recolher todos
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "Todos", count: filterCounts.all, className: "bg-royal-50 text-royal-700 ring-royal-100" },
                  { key: "income", label: "Receitas", count: filterCounts.income, className: "bg-green-50 text-green-700 ring-green-100" },
                  { key: "expense", label: "Despesas", count: filterCounts.expense, className: "bg-red-50 text-red-700 ring-red-100" },
                  { key: "neutral", label: "Neutros", count: filterCounts.neutral, className: "bg-gray-100 text-gray-700 ring-gray-200" },
                  { key: "orphans", label: "Órfãos", count: filterCounts.orphans, className: "bg-amber-50 text-amber-800 ring-amber-200" },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setNatureFilter(filter.key as NatureFilter)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ring-1 transition",
                      filter.className,
                      natureFilter === filter.key ? "shadow-sm" : "opacity-70 hover:opacity-100"
                    )}
                  >
                    {filter.label}
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">{filter.count}</span>
                  </button>
                ))}
              </div>
              <div className="relative xl:w-[360px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input className="pl-10" placeholder="Buscar por código, nome ou tipo..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-royal-100 bg-royal-50 px-3 py-2 text-sm text-royal-800">
              <Info className="h-4 w-4 shrink-0" />
              <span>Reorganização por arrastar será liberada em uma próxima versão. A numeração não é alterada automaticamente nesta tela.</span>
            </div>
            {filterCounts.orphans > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{filterCounts.orphans} item(ns) precisam de revisão estrutural por falta de grupo pai.</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-royal-500 border-t-transparent" />
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Tipo DRE</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Grupo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Natureza</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleNodes.map((node) => {
                    const account = node.account
                    const isGroup = node.children.length > 0 || node.depth === 0
                    const nature = accountNature(account)
                    const isExpanded = expandedCodes.has(account.code)
                    return (
                      <tr key={account.id} className={cn("hover:bg-gray-50/70", isGroup && "bg-slate-50/70", !account.is_active && "opacity-55")}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2" style={{ paddingLeft: `${node.depth * 28}px` }}>
                            <button
                              type="button"
                              title="Reorganização por arrastar será liberada em uma próxima versão."
                              className="flex h-8 w-5 cursor-not-allowed items-center justify-center text-gray-300"
                              disabled
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleExpanded(account.code)}
                              disabled={node.children.length === 0}
                              className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition", node.children.length > 0 ? "hover:bg-white hover:text-navy-900" : "opacity-30")}
                            >
                              {node.children.length > 0 ? (
                                isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                              ) : (
                                <span className="h-4 w-4" />
                              )}
                            </button>
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", isGroup ? "bg-navy-900 text-white" : "bg-royal-50 text-royal-600")}>
                              {isGroup ? <FolderTree className="h-4 w-4" /> : <ListTree className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-navy-900">{account.code} · {account.name}</p>
                                {node.isOrphan && <Badge variant="yellow">Órfão</Badge>}
                                {node.hasParentMismatch && <Badge variant="yellow">Vínculo inconsistente</Badge>}
                              </div>
                              <p className="text-xs text-gray-500">{node.isOrphan ? `Subitem de ${node.inferredParentCode} ausente` : parentLabelFromCode(node.inferredParentCode)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{financialTypeLabel(account.financial_type)}</td>
                        <td className="px-4 py-3 text-gray-600">{account.dre_group || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            nature === "income" && "bg-green-50 text-green-700",
                            nature === "expense" && "bg-red-50 text-red-700",
                            nature === "neutral" && "bg-gray-100 text-gray-700"
                          )}>
                            {nature === "income" && <ArrowUp className="h-3.5 w-3.5" />}
                            {nature === "expense" && <ArrowDown className="h-3.5 w-3.5" />}
                            {nature === "neutral" && <CircleMinus className="h-3.5 w-3.5" />}
                            {natureLabel(nature)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={account.is_active ? "green" : "gray"}>{account.is_active ? "Ativo" : "Inativo"}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              data-chart-menu-trigger="true"
                              onClick={(event) => toggleActionMenu(event, node)}
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-white hover:text-navy-900",
                                openActionMenu?.id === `account-${account.id}` && "bg-white text-navy-900"
                              )}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {visibleNodes.length === 0 && (
                <div className="py-14 text-center text-sm text-gray-500">Nenhum item válido encontrado para os filtros atuais.</div>
              )}
            </div>
            {visibleOrphanNodes.length > 0 && (
              <div className="border-t border-amber-100 bg-amber-50/40 p-5">
                <div className="mb-4 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <h3 className="font-display font-bold text-navy-900 font-syne">Itens sem grupo pai</h3>
                    <Badge variant="yellow">{visibleOrphanNodes.length}</Badge>
                  </div>
                  <p className="text-sm text-amber-900/80">Estes itens possuem numeração de subitem, mas o grupo principal correspondente não existe.</p>
                </div>
                <div className="grid gap-3">
                  {visibleOrphanNodes.map((node) => {
                    const account = node.account
                    const nature = accountNature(account)
                    return (
                      <div key={account.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="yellow">Órfão</Badge>
                              <p className="font-semibold text-navy-900">{account.code} · {account.name}</p>
                              <span className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                                nature === "income" && "bg-green-50 text-green-700",
                                nature === "expense" && "bg-red-50 text-red-700",
                                nature === "neutral" && "bg-gray-100 text-gray-700"
                              )}>
                                {nature === "income" && <ArrowUp className="h-3.5 w-3.5" />}
                                {nature === "expense" && <ArrowDown className="h-3.5 w-3.5" />}
                                {nature === "neutral" && <CircleMinus className="h-3.5 w-3.5" />}
                                {natureLabel(nature)}
                              </span>
                              <Badge variant={account.is_active ? "green" : "gray"}>{account.is_active ? "Ativo" : "Inativo"}</Badge>
                            </div>
                            <p className="mt-2 text-sm text-amber-900">Grupo pai {node.inferredParentCode} não encontrado.</p>
                            <p className="mt-1 text-xs text-gray-500">Sugestão: criar {node.inferredParentCode} · {suggestedParentName(node.inferredParentCode, account)}.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => startCreateParentGroup(node)}>
                              <PlusCircle className="h-4 w-4" /> Criar grupo pai {node.inferredParentCode}
                            </Button>
                            <button
                              type="button"
                              data-chart-menu-trigger="true"
                              onClick={(event) => toggleActionMenu(event, node, true)}
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-white text-gray-500 transition hover:text-navy-900",
                                openActionMenu?.id === `orphan-${account.id}` && "text-navy-900"
                              )}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            </>
          )}
        </Card>

        <aside className="hidden space-y-4 2xl:block">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-navy-900">Legenda</h4>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2"><ArrowUp className="h-4 w-4 text-green-600" /> Receita</p>
              <p className="flex items-center gap-2"><ArrowDown className="h-4 w-4 text-red-600" /> Despesa</p>
              <p className="flex items-center gap-2"><CircleMinus className="h-4 w-4 text-gray-500" /> Neutro</p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-navy-900">Dicas</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>Itens principais são códigos de nível 1.</li>
              <li>A hierarquia visual segue 1, 1.01, 1.01.01.</li>
              <li>Itens sem grupo pai aparecem em uma seção de revisão.</li>
              <li>Arrastar está desabilitado nesta versão.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-navy-900">Resumo</h4>
            <dl className="mt-3 space-y-2 text-sm text-gray-600">
              <div className="flex justify-between"><dt>Total de itens</dt><dd className="font-semibold text-navy-900">{accounts.length}</dd></div>
              <div className="flex justify-between"><dt>Receitas</dt><dd className="font-semibold text-navy-900">{filterCounts.income}</dd></div>
              <div className="flex justify-between"><dt>Despesas</dt><dd className="font-semibold text-navy-900">{filterCounts.expense}</dd></div>
              <div className="flex justify-between"><dt>Neutros</dt><dd className="font-semibold text-navy-900">{filterCounts.neutral}</dd></div>
              <div className="flex justify-between"><dt>Órfãos</dt><dd className="font-semibold text-navy-900">{filterCounts.orphans}</dd></div>
              <div className="flex justify-between"><dt>Alertas</dt><dd className="font-semibold text-navy-900">{orphanCount}</dd></div>
              <div className="flex justify-between"><dt>Níveis máximos</dt><dd className="font-semibold text-navy-900">{maxDepth}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
