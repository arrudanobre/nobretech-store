"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BarChart3, LineChart, ReceiptText, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

type Transaction = {
  id: string
  chart_account_id?: string | null
  type: "income" | "expense"
  category: string
  amount: number
  date: string
  status?: "pending" | "reconciled" | "cancelled" | null
  source_type?: string | null
}

type ChartAccount = {
  id: string
  code?: string | null
  name: string
  cash_flow_type: "income" | "expense" | "none"
  financial_type: "revenue" | "deduction" | "operating_expense" | "financial_expense" | "financial_revenue" | "inventory_asset" | "cogs" | "tax" | "owner_equity" | "transfer" | "adjustment"
  sort_order?: number | null
  parent_code?: string | null
  dre_group?: string | null
  level?: number | null
}

type Sale = {
  id: string
  sale_date: string
  sale_price: number
  net_amount?: number | null
  supplier_cost?: number | null
  sale_status?: "reserved" | "completed" | "cancelled" | null
  inventory?: { purchase_price?: number | null; catalog?: { category?: string | null } | null } | null
  sales_additional_items?: { cost_price: number }[]
}

type DreRow = {
  key: string
  label: string
  code?: string | null
  values: number[]
  total: number
  kind?: "normal" | "section" | "subtotal" | "result" | "muted"
  sign?: "positive" | "negative" | "auto"
}

function yearRange(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    endOfDay: `${year}-12-31T23:59:59.999Z`,
  }
}

function monthIndex(date?: string | null) {
  const raw = String(date || "")
  const match = raw.match(/^\d{4}-(\d{2})/)
  if (!match) return -1
  return Number(match[1]) - 1
}

function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0)
}

function addTo(values: number[], index: number, amount: number) {
  if (index >= 0 && index < 12) values[index] += amount
}

function saleNetRevenue(sale: Sale) {
  return Number(sale.net_amount ?? sale.sale_price ?? 0)
}

function saleCost(sale: Sale) {
  const baseCost = Number(sale.supplier_cost ?? sale.inventory?.purchase_price ?? 0)
  const additionalCost = (sale.sales_additional_items || []).reduce((sum, item) => sum + Number(item.cost_price || 0), 0)
  return baseCost + additionalCost
}

function saleRevenueAccountName(sale: Sale) {
  const category = String(sale.inventory?.catalog?.category || "").toLowerCase()
  if (category.includes("iphone")) return "Venda de iPhones"
  if (category.includes("ipad")) return "Venda de iPads"
  if (category.includes("acessor") || category.includes("airpods") || category.includes("cabo") || category.includes("fonte") || category.includes("pelicula") || category.includes("película")) return "Venda de acessórios"
  return "Receitas diversas"
}

function saleCostAccountName(sale: Sale) {
  const category = String(sale.inventory?.catalog?.category || "").toLowerCase()
  if (category.includes("acessor") || category.includes("airpods") || category.includes("cabo") || category.includes("fonte") || category.includes("pelicula") || category.includes("película")) {
    return "Custo de acessórios vendidos"
  }
  return "Custo de compra de iPhones/iPads"
}

function emptyMonths() {
  return Array(12).fill(0)
}

function accountSign(type: ChartAccount["financial_type"]): DreRow["sign"] {
  if (["deduction", "cogs", "operating_expense", "financial_expense", "tax", "inventory_asset"].includes(type)) return "negative"
  return "positive"
}

function shouldShowInDre(account: ChartAccount) {
  return account.level !== 1 && account.financial_type !== "inventory_asset" && account.financial_type !== "owner_equity"
}

function buildYearOptions() {
  const current = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, index) => current - index)
}

function formatCell(value: number, sign: DreRow["sign"] = "auto") {
  if (value === 0) return "—"
  const absolute = Math.abs(value)
  if (sign === "negative") return `-${formatBRL(absolute)}`
  if (sign === "positive") return formatBRL(absolute)
  return `${value < 0 ? "-" : ""}${formatBRL(absolute)}`
}

export default function DrePage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const yearOptions = useMemo(() => buildYearOptions(), [])
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [year])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { start, end, endOfDay } = yearRange(year)
      const [chartAccountsRes, transactionsRes, salesRes] = await Promise.all([
        (supabase.from("finance_chart_accounts") as any)
          .select("id, code, name, cash_flow_type, financial_type, sort_order, parent_code, dre_group, level")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        (supabase.from("transactions") as any).select("*").gte("date", start).lte("date", end),
        (supabase.from("sales") as any)
          .select("id, sale_date, sale_price, net_amount, supplier_cost, sale_status, inventory:inventory_id(purchase_price, catalog:catalog_id(category)), sales_additional_items(cost_price)")
          .gte("sale_date", start)
          .lte("sale_date", endOfDay),
      ])

      if (chartAccountsRes.error) throw new Error(chartAccountsRes.error.message)
      if (transactionsRes.error) throw new Error(transactionsRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)

      setChartAccounts(chartAccountsRes.data || [])
      setTransactions(transactionsRes.data || [])
      setSales(salesRes.data || [])
    } catch (error: any) {
      toast({ title: "Erro ao carregar DRE", description: error.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const chartAccountById = useMemo(() => new Map(chartAccounts.map((account) => [account.id, account])), [chartAccounts])
  const chartAccountByName = useMemo(() => new Map(chartAccounts.map((account) => [account.name, account])), [chartAccounts])

  const getTransactionAccount = (transaction: Transaction) => {
    if (transaction.type === "expense" && transaction.category === "Estoque (Peças/Acessórios)") {
      return chartAccounts.find((account) => account.code === "7.01") || null
    }
    return (
      (transaction.chart_account_id ? chartAccountById.get(transaction.chart_account_id) : undefined) ||
      chartAccountByName.get(transaction.category) ||
      null
    )
  }

  const hasFinancialType = (transaction: Transaction, type: ChartAccount["financial_type"]) => {
    const account = getTransactionAccount(transaction)
    if (account) return account.financial_type === type
    if (type === "deduction") return transaction.type === "expense" && ["Descontos concedidos", "Taxas de cartão", "Taxas de marketplace", "Estornos / devoluções"].includes(transaction.category)
    if (type === "inventory_asset") return transaction.type === "expense" && transaction.category === "Estoque (Peças/Acessórios)"
    if (type === "owner_equity") return ["Retirada de Lucro", "Aporte do proprietário"].includes(transaction.category)
    if (type === "tax") return transaction.category === "Impostos / Taxas"
    if (type === "financial_expense") return transaction.type === "expense" && ["Juros de parcelamento", "Taxas bancárias", "Multas"].includes(transaction.category)
    if (type === "financial_revenue") return transaction.type === "income" && ["Receitas financeiras", "Rendimentos"].includes(transaction.category)
    if (type === "revenue") return transaction.type === "income" && transaction.category !== "Aporte do proprietário"
    if (type === "operating_expense") return transaction.type === "expense" && !["Estoque (Peças/Acessórios)", "Retirada de Lucro", "Impostos / Taxas"].includes(transaction.category)
    return false
  }

  const report = useMemo(() => {
    const completedSales = sales.filter((sale) => (sale.sale_status || "completed") === "completed")
    const activeTransactions = transactions.filter((transaction) => transaction.status !== "cancelled")
    const reconciledTransactions = activeTransactions.filter((transaction) => transaction.status === "reconciled")

    const accountValues = new Map<string, number[]>()
    for (const account of chartAccounts) {
      if (shouldShowInDre(account)) accountValues.set(account.id, emptyMonths())
    }

    const pendingOperating = emptyMonths()
    const inventoryCash = emptyMonths()
    const ownerEquity = emptyMonths()

    const addAccountValue = (account: ChartAccount | undefined | null, index: number, amount: number) => {
      if (!account || !shouldShowInDre(account)) return
      const values = accountValues.get(account.id) || emptyMonths()
      addTo(values, index, amount)
      accountValues.set(account.id, values)
    }

    for (const sale of completedSales) {
      const index = monthIndex(sale.sale_date)
      addAccountValue(chartAccountByName.get(saleRevenueAccountName(sale)) || chartAccounts.find((account) => account.code === "1.90"), index, saleNetRevenue(sale))
      addAccountValue(chartAccountByName.get(saleCostAccountName(sale)) || chartAccounts.find((account) => account.code === "3.01"), index, saleCost(sale))
    }

    for (const transaction of reconciledTransactions) {
      const index = monthIndex(transaction.date)
      const account = getTransactionAccount(transaction)
      if (transaction.source_type !== "sale") addAccountValue(account, index, Number(transaction.amount))
      if (hasFinancialType(transaction, "inventory_asset")) addTo(inventoryCash, index, Number(transaction.amount))
      if (hasFinancialType(transaction, "owner_equity")) {
        addTo(ownerEquity, index, transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount))
      }
    }

    for (const transaction of activeTransactions.filter((item) => item.status !== "reconciled")) {
      const index = monthIndex(transaction.date)
      if (hasFinancialType(transaction, "operating_expense") || hasFinancialType(transaction, "tax")) {
        addTo(pendingOperating, index, Number(transaction.amount))
      }
    }

    const sumByType = (types: ChartAccount["financial_type"][]) => {
      const values = emptyMonths()
      for (const account of chartAccounts) {
        if (!types.includes(account.financial_type) || !shouldShowInDre(account)) continue
        const accountMonths = accountValues.get(account.id) || emptyMonths()
        accountMonths.forEach((value, index) => addTo(values, index, value))
      }
      return values
    }

    const grossRevenue = sumByType(["revenue"])
    const deductions = sumByType(["deduction"])
    const cmv = sumByType(["cogs"])
    const operatingExpenses = sumByType(["operating_expense"])
    const financialExpenses = sumByType(["financial_expense"])
    const financialRevenue = sumByType(["financial_revenue"])
    const taxes = sumByType(["tax"])
    const netRevenue = grossRevenue.map((value, index) => value - deductions[index])
    const grossProfit = netRevenue.map((value, index) => value - cmv[index])
    const operatingProfit = grossProfit.map((value, index) => value - operatingExpenses[index])
    const profitBeforeTaxes = operatingProfit.map((value, index) => value + financialRevenue[index] - financialExpenses[index])
    const result = profitBeforeTaxes.map((value, index) => value - taxes[index])

    const parentAccounts = chartAccounts.filter((account) => account.level === 1 && !["inventory_asset", "owner_equity"].includes(account.financial_type))
    const childRows = (parentCode: string | null | undefined) => chartAccounts
      .filter((account) => account.parent_code === parentCode && shouldShowInDre(account))
      .map((account) => {
        const values = accountValues.get(account.id) || emptyMonths()
        return {
          key: account.id,
          code: account.code,
          label: account.name,
          values,
          total: sumValues(values),
          sign: accountSign(account.financial_type),
        } satisfies DreRow
      })

    const sectionRows = (account: ChartAccount): DreRow[] => {
      const children = childRows(account.code)
      return [
        { key: `section-${account.id}`, label: `${account.code}. ${account.name}`, values: [], total: 0, kind: "section" },
        ...children,
      ]
    }

    const rows: DreRow[] = []
    for (const account of parentAccounts) {
      rows.push(...sectionRows(account))
      if (account.code === "1") rows.push({ key: "grossRevenue", label: "Receita bruta", values: grossRevenue, total: sumValues(grossRevenue), kind: "subtotal", sign: "positive" })
      if (account.code === "2") rows.push({ key: "netRevenue", label: "Receita líquida", values: netRevenue, total: sumValues(netRevenue), kind: "subtotal", sign: "auto" })
      if (account.code === "3") rows.push({ key: "grossProfit", label: "Lucro bruto", values: grossProfit, total: sumValues(grossProfit), kind: "subtotal", sign: "auto" })
      if (account.code === "4") rows.push({ key: "operatingProfit", label: "Lucro operacional", values: operatingProfit, total: sumValues(operatingProfit), kind: "subtotal", sign: "auto" })
      if (account.code === "5") rows.push({ key: "profitBeforeTaxes", label: "Lucro antes dos impostos", values: profitBeforeTaxes, total: sumValues(profitBeforeTaxes), kind: "subtotal", sign: "auto" })
      if (account.code === "6") rows.push({ key: "result", label: "LUCRO LÍQUIDO", values: result, total: sumValues(result), kind: "result", sign: "auto" })
    }

    rows.push(
      { key: "informativo", label: "Informativos de caixa", values: [], total: 0, kind: "section" },
      { key: "pendingOperating", label: "Despesas operacionais em aberto (não DRE)", values: pendingOperating, total: sumValues(pendingOperating), kind: "muted", sign: "negative" },
      { key: "inventoryCash", label: "Compras de estoque (caixa, não DRE)", values: inventoryCash, total: sumValues(inventoryCash), kind: "muted", sign: "negative" },
      { key: "ownerEquity", label: "Sócios: aportes menos retiradas (não DRE)", values: ownerEquity, total: sumValues(ownerEquity), kind: "muted", sign: "auto" },
    )

    return {
      rows,
      totals: {
        netRevenue: sumValues(netRevenue),
        grossProfit: sumValues(grossProfit),
        grossMargin: sumValues(grossRevenue) > 0 ? (sumValues(grossProfit) / sumValues(grossRevenue)) * 100 : 0,
        result: sumValues(result),
      },
    }
  }, [chartAccounts, chartAccountByName, sales, transactions])

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/financeiro" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-royal-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Painel financeiro
          </Link>
          <h2 className="font-display font-bold text-2xl text-navy-900 font-syne">DRE Gerencial</h2>
          <p className="text-sm text-gray-500">Demonstrativo mensalizado por ano, com receitas, custos, despesas e resultado.</p>
        </div>
        <select
          aria-label="Ano do DRE"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 shadow-sm outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
        >
          {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Receita líquida" value={formatBRL(report.totals.netRevenue)} icon={TrendingUp} tone="green" />
        <Metric title="Lucro bruto" value={formatBRL(report.totals.grossProfit)} icon={BarChart3} tone="navy" />
        <Metric title="Margem bruta" value={`${report.totals.grossMargin.toFixed(1)}%`} icon={LineChart} tone="blue" />
        <Metric title="Lucro líquido anual" value={formatBRL(report.totals.result)} icon={ReceiptText} tone={report.totals.result >= 0 ? "green" : "red"} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-gray-100 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-display font-bold text-navy-900 font-syne">DRE mensalizado · {year}</h3>
            <p className="text-sm text-gray-500">A linha verde final mostra o lucro líquido. Linhas cinzas são informativas e não entram no resultado.</p>
          </div>
          <Badge variant={report.totals.result >= 0 ? "green" : "red"}>{report.totals.result >= 0 ? "Resultado positivo" : "Resultado negativo"}</Badge>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando DRE...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="sticky left-0 z-10 min-w-[280px] bg-gray-50/95 px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Conta</th>
                  {MONTH_LABELS.map((month) => (
                    <th key={month} className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">{month}</th>
                  ))}
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <DreTableRow key={row.key} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: "navy" | "green" | "blue" | "red" }) {
  const toneClass = {
    navy: "bg-navy-900 text-white",
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-royal-50 text-royal-600",
    red: "bg-red-50 text-red-600",
  }[tone]
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-gray-400">{title}</p>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass)}><Icon className="h-5 w-5" /></div>
      </div>
      <p className="whitespace-nowrap text-[1.55rem] font-bold leading-tight text-navy-900 tabular-nums 2xl:text-2xl">{value}</p>
    </Card>
  )
}

function DreTableRow({ row }: { row: DreRow }) {
  if (row.kind === "section") {
    return (
      <tr>
        <td colSpan={14} className="bg-royal-50 px-5 py-2 text-sm font-bold text-royal-700">{row.label}</td>
      </tr>
    )
  }

  const isMuted = row.kind === "muted"
  const isSubtotal = row.kind === "subtotal"
  const isResult = row.kind === "result"
  const rowClass = cn(
    "border-b border-gray-50",
    isMuted && "bg-gray-50/60 text-gray-400",
    isSubtotal && "bg-blue-50/60 font-bold",
    isResult && "bg-emerald-50 font-bold"
  )

  return (
    <tr className={rowClass}>
      <td className={cn(
        "sticky left-0 z-10 px-5 py-3 text-left",
        isResult ? "bg-emerald-50 text-emerald-800" : isSubtotal ? "bg-blue-50/95 text-navy-900" : isMuted ? "bg-gray-50/95 text-gray-400" : "bg-white text-gray-600"
      )}>
        <span className="inline-flex items-center gap-2">
          {row.code && <span className="text-xs font-semibold text-gray-400">{row.code}</span>}
          <span>{row.label}</span>
        </span>
      </td>
      {row.values.map((value, index) => (
        <td key={index} className={cn("px-3 py-3 text-right tabular-nums", value < 0 ? "text-red-600" : isMuted ? "text-gray-400" : "text-gray-700")}>
          {formatCell(value, row.sign)}
        </td>
      ))}
      <td className={cn("px-5 py-3 text-right font-bold tabular-nums", row.total < 0 ? "text-red-600" : isResult ? "text-emerald-800" : "text-navy-900")}>
        {formatCell(row.total, row.sign)}
      </td>
    </tr>
  )
}
