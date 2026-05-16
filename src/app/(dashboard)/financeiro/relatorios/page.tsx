"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CalendarDays, Download, FileSpreadsheet, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatBRL, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"

type Summary = {
  period: string
  salesCount: number
  grossCommercialRevenue: number
  tradeInCreditTotal: number
  financialReceivedRevenue: number
  mainProductCostTotal: number
  additionalItemsCostTotal: number
  totalSaleCost: number
  productCostTotal: number
  grossCommercialProfit: number
  averageMargin: number
  totalPending: number
  hasTradeIn: boolean
  hasAdditionalItemsCost: boolean
  generatedAt: string
  methodologyNote: string
}

type PreviewRow = {
  saleDate: string
  saleId: string
  customer: string
  product: string
  category: string
  saleStatus: string
  financialStatus: string
  saleValue: number
  grossSaleValue: number
  tradeInCredit: number
  financialReceivedValue: number
  mainProductCost: number
  additionalItemsCost: number
  totalSaleCost: number
  productTotalCost: number
  grossProfit: number
  grossCommercialProfit: number
  grossMarginPct: number
  hasTradeIn: string
  tradeInObservation: string
  paymentMethod: string
  receivingAccount: string
}

type FilterOptions = {
  paymentMethods: { value: string; label: string }[]
  financialAccounts: { id: string; name: string }[]
}

type ReportResponse = {
  data: {
    summary: Summary
    rows: PreviewRow[]
    previewLimit: number
    totalRows: number
    filterOptions: FilterOptions
  } | null
  error: { message: string } | null
}

type Filters = {
  start_date: string
  end_date: string
  sale_status: string
  payment_method: string
  financial_account_id: string
}

const SALE_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "completed", label: "Concluídas" },
  { value: "reserved", label: "Reservadas" },
  { value: "cancelled", label: "Canceladas" },
]

function currentMonthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  const key = `${year}-${String(month).padStart(2, "0")}`
  return {
    start_date: `${key}-01`,
    end_date: `${key}-${String(lastDay).padStart(2, "0")}`,
  }
}

function buildQuery(filters: Filters, format: "json" | "xlsx" = "json") {
  const params = new URLSearchParams()
  params.set("start_date", filters.start_date)
  params.set("end_date", filters.end_date)
  params.set("format", format)
  if (filters.sale_status !== "all") params.set("sale_status", filters.sale_status)
  if (filters.payment_method !== "all") params.set("payment_method", filters.payment_method)
  if (filters.financial_account_id !== "all") params.set("financial_account_id", filters.financial_account_id)
  return params.toString()
}

function metricTone(key: string) {
  if (key.includes("Lucro") || key.includes("Receita financeira")) return "text-emerald-700"
  if (key.includes("Pendente") || key.includes("Trade-in")) return "text-amber-700"
  return "text-navy-900"
}

export default function RelatoriosPage() {
  const monthRange = useMemo(() => currentMonthRange(), [])
  const [filters, setFilters] = useState<Filters>({
    ...monthRange,
    sale_status: "completed",
    payment_method: "all",
    financial_account_id: "all",
  })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    paymentMethods: [],
    financialAccounts: [],
  })
  const [previewLimit, setPreviewLimit] = useState(100)
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState("")

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  const loadPreview = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/reports/sales?${buildQuery(filters)}`, {
        cache: "no-store",
      })
      const payload = (await response.json()) as ReportResponse
      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message || "Não foi possível gerar a prévia.")
      }
      setSummary(payload.data?.summary || null)
      setRows(payload.data?.rows || [])
      setPreviewLimit(payload.data?.previewLimit || 100)
      setTotalRows(payload.data?.totalRows || 0)
      setFilterOptions(payload.data?.filterOptions || { paymentMethods: [], financialAccounts: [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar relatório.")
    } finally {
      setLoading(false)
    }
  }

  const exportExcel = async () => {
    setExporting(true)
    setError("")
    try {
      const response = await fetch(`/api/reports/sales?${buildQuery(filters, "xlsx")}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ReportResponse | null
        throw new Error(payload?.error?.message || "Não foi possível exportar o Excel.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `relatorio-vendas-contabil-${filters.start_date}-a-${filters.end_date}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar Excel.")
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const metrics = summary
    ? [
        ["Receita bruta comercial", formatBRL(summary.grossCommercialRevenue)],
        ["Trade-in abatido", formatBRL(summary.tradeInCreditTotal)],
        ["Receita financeira recebida", formatBRL(summary.financialReceivedRevenue)],
        ["Custo produtos principais", formatBRL(summary.mainProductCostTotal)],
        ["Custo brindes/adicionais", formatBRL(summary.additionalItemsCostTotal)],
        ["Custo total das vendas", formatBRL(summary.totalSaleCost ?? summary.productCostTotal)],
        ["Lucro bruto comercial", formatBRL(summary.grossCommercialProfit)],
        ["Margem média", `${summary.averageMargin.toFixed(2)}%`],
      ]
    : []

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 text-navy-900 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-royal-100 bg-royal-50">
              <FileSpreadsheet className="h-6 w-6 text-royal-600" />
            </div>
            <h1 className="font-syne text-3xl font-bold tracking-tight sm:text-4xl">Relatórios</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              Exporte vendas e movimentações para conferência contábil.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 shadow-inner shadow-white">
            <p className="font-semibold text-navy-900">Relatório de Vendas</p>
            <p className="mt-1">Exportação para conferência contábil</p>
          </div>
        </div>
      </section>

      <Card className="border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-royal-50 text-royal-600">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-navy-900">Filtros do relatório</h2>
            <p className="text-sm text-slate-500">Use intervalo de até 12 meses para manter a exportação controlada.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Data inicial"
            type="date"
            value={filters.start_date}
            onChange={(event) => updateFilter("start_date", event.target.value)}
          />
          <Input
            label="Data final"
            type="date"
            value={filters.end_date}
            onChange={(event) => updateFilter("end_date", event.target.value)}
          />
          <Select
            label="Status da venda"
            value={filters.sale_status}
            onChange={(event) => updateFilter("sale_status", event.target.value)}
            options={SALE_STATUS_OPTIONS}
          />
          <Select
            label="Método de pagamento"
            value={filters.payment_method}
            onChange={(event) => updateFilter("payment_method", event.target.value)}
            options={[
              { value: "all", label: "Todos" },
              ...filterOptions.paymentMethods,
              { value: "trade_in_credit", label: "Crédito / trade-in" },
            ]}
          />
          <Select
            label="Conta financeira"
            value={filters.financial_account_id}
            onChange={(event) => updateFilter("financial_account_id", event.target.value)}
            options={[
              { value: "all", label: "Todas" },
              ...filterOptions.financialAccounts.map((account) => ({ value: account.id, label: account.name })),
            ]}
          />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={loadPreview} disabled={loading || exporting}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Gerar prévia
          </Button>
          <Button type="button" onClick={exportExcel} disabled={loading || exporting || !summary}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar Excel
          </Button>
        </div>
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden border-slate-200 bg-white text-navy-900 shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold">Resumo do período</h2>
          <p className="mt-1 text-sm text-slate-500">
            {summary ? `Período: ${summary.period}` : "Gere uma prévia para carregar os indicadores."}
          </p>
          {summary?.hasTradeIn ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Há vendas com trade-in neste período. O valor abatido não representa entrada de caixa.
            </div>
          ) : null}
          {summary?.hasAdditionalItemsCost ? (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
              Há vendas com brindes/adicionais neste período. Esses custos foram incluídos no custo total da venda.
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
              <p className={cn("mt-2 text-2xl font-bold tracking-tight", metricTone(label))}>{value}</p>
            </div>
          ))}
          {loading && metrics.length === 0 ? (
            <div className="col-span-full flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando resumo...
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-navy-900">Prévia das vendas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Exibindo até {previewLimit} linhas. O Excel exporta o conjunto filtrado completo ({totalRows} venda{totalRows === 1 ? "" : "s"}).
            </p>
          </div>
          {summary ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              Gerado em {formatDate(summary.generatedAt)}
            </span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1680px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Financeiro</th>
                <th className="px-4 py-3 text-right">Venda bruta</th>
                <th className="px-4 py-3 text-right">Trade-in</th>
                <th className="px-4 py-3 text-right">Recebido</th>
                <th className="px-4 py-3 text-right">Custo produto</th>
                <th className="px-4 py-3 text-right">Custo brindes</th>
                <th className="px-4 py-3 text-right">Custo total</th>
                <th className="px-4 py-3 text-right">Lucro comercial</th>
                <th className="px-4 py-3 text-right">Margem</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Conta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-4 py-10 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando prévia...
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-10 text-center text-slate-500">
                    Nenhuma venda encontrada para os filtros atuais.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.saleId} className="align-top hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDate(row.saleDate)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.customer}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-900">{row.product}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.category}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.saleStatus}</td>
                    <td className="px-4 py-3 text-slate-600">{row.financialStatus}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy-900">{formatBRL(row.grossSaleValue)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-amber-700">
                      {row.tradeInCredit > 0 ? formatBRL(row.tradeInCredit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">{formatBRL(row.financialReceivedValue)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatBRL(row.mainProductCost)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatBRL(row.additionalItemsCost)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{formatBRL(row.totalSaleCost ?? row.productTotalCost)}</td>
                    <td className={cn("whitespace-nowrap px-4 py-3 text-right font-semibold", row.grossCommercialProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {formatBRL(row.grossCommercialProfit)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{row.grossMarginPct.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{row.paymentMethod}</p>
                      {row.hasTradeIn === "Sim" ? <p className="mt-1 text-xs font-semibold text-amber-700">Trade-in separado do caixa</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.receivingAccount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
