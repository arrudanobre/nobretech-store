"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, CalendarDays, Download, FileSpreadsheet, Loader2, PackageSearch, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatBRL, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"

type ReportType = "sales" | "inventory"

type SalesSummary = {
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

type SalesPreviewRow = {
  saleDate: string
  saleId: string
  customer: string
  product: string
  category: string
  saleStatus: string
  financialStatus: string
  grossSaleValue: number
  tradeInCredit: number
  financialReceivedValue: number
  mainProductCost: number
  additionalItemsCost: number
  totalSaleCost: number
  productTotalCost: number
  grossCommercialProfit: number
  grossMarginPct: number
  hasTradeIn: string
  paymentMethod: string
  receivingAccount: string
}

type InventorySummary = {
  period: string
  totalItems: number
  inStockItems: number
  soldItems: number
  inventoryCapital: number
  soldItemsCost: number
  soldItemsRevenue: number
  realizedGrossProfit: number
  realizedAverageMargin: number
  averageCostTicket: number
  averageDaysInStock: number
  generatedAt: string
  methodologyNote: string
}

type InventoryPreviewRow = {
  inventoryId: string
  entryDate: string
  product: string
  category: string
  imeiOrSerial: string
  supplier: string
  purchaseCost: number
  allocatedCosts: number
  totalCost: number
  currentStatus: string
  daysInStock: number
  saleDate: string
  saleValue: number
  grossProfit: number
  grossMarginPct: number
  customer: string
  observations: string
}

type SalesFilterOptions = {
  paymentMethods: { value: string; label: string }[]
  financialAccounts: { id: string; name: string }[]
}

type InventoryFilterOptions = {
  statuses: { value: string; label: string }[]
  categories: { value: string; label: string }[]
  suppliers: { id: string; name: string }[]
}

type SalesReportResponse = {
  data: {
    summary: SalesSummary
    rows: SalesPreviewRow[]
    previewLimit: number
    totalRows: number
    filterOptions: SalesFilterOptions
  } | null
  error: { message: string } | null
}

type InventoryReportResponse = {
  data: {
    summary: InventorySummary
    rows: InventoryPreviewRow[]
    previewLimit: number
    totalRows: number
    filterOptions: InventoryFilterOptions
  } | null
  error: { message: string } | null
}

type SalesFilters = {
  start_date: string
  end_date: string
  sale_status: string
  payment_method: string
  financial_account_id: string
}

type InventoryFilters = {
  start_date: string
  end_date: string
  status: string
  category: string
  supplier_id: string
  include_sold: boolean
  include_in_stock: boolean
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

function last90DaysRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 90)
  return {
    start_date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
    end_date: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
  }
}

function buildSalesQuery(filters: SalesFilters, format: "json" | "xlsx" = "json") {
  const params = new URLSearchParams()
  params.set("start_date", filters.start_date)
  params.set("end_date", filters.end_date)
  params.set("format", format)
  if (filters.sale_status !== "all") params.set("sale_status", filters.sale_status)
  if (filters.payment_method !== "all") params.set("payment_method", filters.payment_method)
  if (filters.financial_account_id !== "all") params.set("financial_account_id", filters.financial_account_id)
  return params.toString()
}

function buildInventoryQuery(filters: InventoryFilters, format: "json" | "xlsx" = "json") {
  const params = new URLSearchParams()
  params.set("start_date", filters.start_date)
  params.set("end_date", filters.end_date)
  params.set("format", format)
  params.set("include_sold", String(filters.include_sold))
  params.set("include_in_stock", String(filters.include_in_stock))
  if (filters.status !== "all") params.set("status", filters.status)
  if (filters.category !== "all") params.set("category", filters.category)
  if (filters.supplier_id !== "all") params.set("supplier_id", filters.supplier_id)
  return params.toString()
}

function metricTone(key: string) {
  if (key.includes("Lucro") || key.includes("Receita") || key.includes("Capital")) return "text-emerald-700"
  if (key.includes("Pendente") || key.includes("Trade-in") || key.includes("Custo")) return "text-amber-700"
  return "text-navy-900"
}

export default function RelatoriosPage() {
  const searchParams = useSearchParams()
  const salesDefaultRange = useMemo(() => currentMonthRange(), [])
  const inventoryDefaultRange = useMemo(() => last90DaysRange(), [])
  const requestedReportType: ReportType = searchParams.get("tipo") === "estoque" ? "inventory" : "sales"
  const [reportType, setReportType] = useState<ReportType>(requestedReportType)
  const [salesFilters, setSalesFilters] = useState<SalesFilters>({
    ...salesDefaultRange,
    sale_status: "completed",
    payment_method: "all",
    financial_account_id: "all",
  })
  const [inventoryFilters, setInventoryFilters] = useState<InventoryFilters>({
    ...inventoryDefaultRange,
    status: "all",
    category: "all",
    supplier_id: "all",
    include_sold: true,
    include_in_stock: true,
  })
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null)
  const [salesRows, setSalesRows] = useState<SalesPreviewRow[]>([])
  const [salesOptions, setSalesOptions] = useState<SalesFilterOptions>({ paymentMethods: [], financialAccounts: [] })
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null)
  const [inventoryRows, setInventoryRows] = useState<InventoryPreviewRow[]>([])
  const [inventoryOptions, setInventoryOptions] = useState<InventoryFilterOptions>({ statuses: [], categories: [], suppliers: [] })
  const [previewLimit, setPreviewLimit] = useState(100)
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState("")

  const updateSalesFilter = (key: keyof SalesFilters, value: string) => {
    setSalesFilters((previous) => ({ ...previous, [key]: value }))
  }

  const updateInventoryFilter = (key: keyof InventoryFilters, value: string | boolean) => {
    setInventoryFilters((previous) => ({ ...previous, [key]: value }))
  }

  const loadPreview = async () => {
    setLoading(true)
    setError("")
    try {
      if (reportType === "sales") {
        const response = await fetch(`/api/reports/sales?${buildSalesQuery(salesFilters)}`, { cache: "no-store" })
        const payload = (await response.json()) as SalesReportResponse
        if (!response.ok || payload.error) throw new Error(payload.error?.message || "Não foi possível gerar a prévia.")
        setSalesSummary(payload.data?.summary || null)
        setSalesRows(payload.data?.rows || [])
        setSalesOptions(payload.data?.filterOptions || { paymentMethods: [], financialAccounts: [] })
        setPreviewLimit(payload.data?.previewLimit || 100)
        setTotalRows(payload.data?.totalRows || 0)
        return
      }

      const response = await fetch(`/api/reports/inventory?${buildInventoryQuery(inventoryFilters)}`, { cache: "no-store" })
      const payload = (await response.json()) as InventoryReportResponse
      if (!response.ok || payload.error) throw new Error(payload.error?.message || "Não foi possível gerar a prévia.")
      setInventorySummary(payload.data?.summary || null)
      setInventoryRows(payload.data?.rows || [])
      setInventoryOptions(payload.data?.filterOptions || { statuses: [], categories: [], suppliers: [] })
      setPreviewLimit(payload.data?.previewLimit || 100)
      setTotalRows(payload.data?.totalRows || 0)
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
      const endpoint = reportType === "sales"
        ? `/api/reports/sales?${buildSalesQuery(salesFilters, "xlsx")}`
        : `/api/reports/inventory?${buildInventoryQuery(inventoryFilters, "xlsx")}`
      const response = await fetch(endpoint, { cache: "no-store" })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as SalesReportResponse | InventoryReportResponse | null
        throw new Error(payload?.error?.message || "Não foi possível exportar o Excel.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      const range = reportType === "sales" ? salesFilters : inventoryFilters
      anchor.href = url
      anchor.download = reportType === "sales"
        ? `relatorio-vendas-contabil-${range.start_date}-a-${range.end_date}.xlsx`
        : `relatorio-estoque-custo-${range.start_date}-a-${range.end_date}.xlsx`
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
  }, [reportType])

  useEffect(() => {
    setReportType(requestedReportType)
  }, [requestedReportType])

  const salesMetrics = salesSummary
    ? [
        ["Receita bruta comercial", formatBRL(salesSummary.grossCommercialRevenue)],
        ["Trade-in abatido", formatBRL(salesSummary.tradeInCreditTotal)],
        ["Receita financeira recebida", formatBRL(salesSummary.financialReceivedRevenue)],
        ["Custo produtos principais", formatBRL(salesSummary.mainProductCostTotal)],
        ["Custo brindes/adicionais", formatBRL(salesSummary.additionalItemsCostTotal)],
        ["Custo total das vendas", formatBRL(salesSummary.totalSaleCost ?? salesSummary.productCostTotal)],
        ["Lucro bruto comercial", formatBRL(salesSummary.grossCommercialProfit)],
        ["Margem média", `${salesSummary.averageMargin.toFixed(2)}%`],
      ]
    : []

  const inventoryMetrics = inventorySummary
    ? [
        ["Total de itens", String(inventorySummary.totalItems)],
        ["Itens em estoque", String(inventorySummary.inStockItems)],
        ["Itens vendidos", String(inventorySummary.soldItems)],
        ["Capital imobilizado", formatBRL(inventorySummary.inventoryCapital)],
        ["Custo vendido", formatBRL(inventorySummary.soldItemsCost)],
        ["Receita gerada", formatBRL(inventorySummary.soldItemsRevenue)],
        ["Lucro realizado", formatBRL(inventorySummary.realizedGrossProfit)],
        ["Margem realizada", `${inventorySummary.realizedAverageMargin.toFixed(2)}%`],
        ["Ticket médio custo", formatBRL(inventorySummary.averageCostTicket)],
        ["Tempo médio estoque", `${inventorySummary.averageDaysInStock.toFixed(1)} dias`],
      ]
    : []

  const activeSummary = reportType === "sales" ? salesSummary : inventorySummary
  const metrics = reportType === "sales" ? salesMetrics : inventoryMetrics
  const canExport = reportType === "sales" ? Boolean(salesSummary) : Boolean(inventorySummary)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 text-navy-900 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-royal-100 bg-royal-50">
              {reportType === "sales" ? <FileSpreadsheet className="h-6 w-6 text-royal-600" /> : <PackageSearch className="h-6 w-6 text-royal-600" />}
            </div>
            <h1 className="font-syne text-3xl font-bold tracking-tight sm:text-4xl">Relatórios</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              Exporte vendas, estoque e custos para conferência contábil e gestão operacional.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 shadow-inner shadow-white">
            <p className="font-semibold text-navy-900">{reportType === "sales" ? "Relatório de Vendas" : "Estoque e Custo"}</p>
            <p className="mt-1">{reportType === "sales" ? "Exportação para conferência contábil" : "Capital, custo e giro do estoque"}</p>
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

        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Tipo de relatório"
            value={reportType}
            onChange={(event) => setReportType(event.target.value as ReportType)}
            options={[
              { value: "sales", label: "Vendas para Conferência Contábil" },
              { value: "inventory", label: "Estoque e Custo" },
            ]}
          />
        </div>

        {reportType === "sales" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Input label="Data inicial" type="date" value={salesFilters.start_date} onChange={(event) => updateSalesFilter("start_date", event.target.value)} />
            <Input label="Data final" type="date" value={salesFilters.end_date} onChange={(event) => updateSalesFilter("end_date", event.target.value)} />
            <Select label="Status da venda" value={salesFilters.sale_status} onChange={(event) => updateSalesFilter("sale_status", event.target.value)} options={SALE_STATUS_OPTIONS} />
            <Select
              label="Método de pagamento"
              value={salesFilters.payment_method}
              onChange={(event) => updateSalesFilter("payment_method", event.target.value)}
              options={[{ value: "all", label: "Todos" }, ...salesOptions.paymentMethods, { value: "trade_in_credit", label: "Crédito / trade-in" }]}
            />
            <Select
              label="Conta financeira"
              value={salesFilters.financial_account_id}
              onChange={(event) => updateSalesFilter("financial_account_id", event.target.value)}
              options={[{ value: "all", label: "Todas" }, ...salesOptions.financialAccounts.map((account) => ({ value: account.id, label: account.name }))]}
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Input label="Data inicial" type="date" value={inventoryFilters.start_date} onChange={(event) => updateInventoryFilter("start_date", event.target.value)} />
            <Input label="Data final" type="date" value={inventoryFilters.end_date} onChange={(event) => updateInventoryFilter("end_date", event.target.value)} />
            <Select label="Status do estoque" value={inventoryFilters.status} onChange={(event) => updateInventoryFilter("status", event.target.value)} options={inventoryOptions.statuses.length ? inventoryOptions.statuses : [{ value: "all", label: "Todos" }]} />
            <Select label="Categoria" value={inventoryFilters.category} onChange={(event) => updateInventoryFilter("category", event.target.value)} options={[{ value: "all", label: "Todas" }, ...inventoryOptions.categories]} />
            <Select label="Fornecedor" value={inventoryFilters.supplier_id} onChange={(event) => updateInventoryFilter("supplier_id", event.target.value)} options={[{ value: "all", label: "Todos" }, ...inventoryOptions.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} />
            <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={inventoryFilters.include_sold} onChange={(event) => updateInventoryFilter("include_sold", event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Incluir vendidos
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={inventoryFilters.include_in_stock} onChange={(event) => updateInventoryFilter("include_in_stock", event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Incluir disponíveis/em estoque
            </label>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={loadPreview} disabled={loading || exporting}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Gerar prévia
          </Button>
          <Button type="button" onClick={exportExcel} disabled={loading || exporting || !canExport}>
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
            {activeSummary ? `Período: ${activeSummary.period}` : "Gere uma prévia para carregar os indicadores."}
          </p>
          {reportType === "sales" && salesSummary?.hasTradeIn ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Há vendas com trade-in neste período. O valor abatido não representa entrada de caixa.
            </div>
          ) : null}
          {reportType === "sales" && salesSummary?.hasAdditionalItemsCost ? (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
              Há vendas com brindes/adicionais neste período. Esses custos foram incluídos no custo total da venda.
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
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

      {reportType === "sales" ? (
        <SalesPreviewTable rows={salesRows} loading={loading} previewLimit={previewLimit} totalRows={totalRows} generatedAt={salesSummary?.generatedAt} />
      ) : (
        <InventoryPreviewTable rows={inventoryRows} loading={loading} previewLimit={previewLimit} totalRows={totalRows} generatedAt={inventorySummary?.generatedAt} />
      )}
    </div>
  )
}

function SalesPreviewTable({ rows, loading, previewLimit, totalRows, generatedAt }: { rows: SalesPreviewRow[]; loading: boolean; previewLimit: number; totalRows: number; generatedAt?: string }) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-navy-900">Prévia das vendas</h2>
          <p className="mt-1 text-sm text-slate-500">Exibindo até {previewLimit} linhas. O Excel exporta o conjunto filtrado completo ({totalRows} venda{totalRows === 1 ? "" : "s"}).</p>
        </div>
        {generatedAt ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Gerado em {formatDate(generatedAt)}</span> : null}
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
              <tr><td colSpan={15} className="px-4 py-10 text-center text-slate-500"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando prévia...</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={15} className="px-4 py-10 text-center text-slate-500">Nenhuma venda encontrada para os filtros atuais.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.saleId} className="align-top hover:bg-slate-50/80">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDate(row.saleDate)}</td>
                <td className="px-4 py-3 text-slate-700">{row.customer}</td>
                <td className="px-4 py-3"><p className="font-semibold text-navy-900">{row.product}</p><p className="mt-1 text-xs text-slate-500">{row.category}</p></td>
                <td className="px-4 py-3 text-slate-600">{row.saleStatus}</td>
                <td className="px-4 py-3 text-slate-600">{row.financialStatus}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy-900">{formatBRL(row.grossSaleValue)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-amber-700">{row.tradeInCredit > 0 ? formatBRL(row.tradeInCredit) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">{formatBRL(row.financialReceivedValue)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatBRL(row.mainProductCost)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatBRL(row.additionalItemsCost)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{formatBRL(row.totalSaleCost ?? row.productTotalCost)}</td>
                <td className={cn("whitespace-nowrap px-4 py-3 text-right font-semibold", row.grossCommercialProfit >= 0 ? "text-emerald-600" : "text-red-600")}>{formatBRL(row.grossCommercialProfit)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{row.grossMarginPct.toFixed(2)}%</td>
                <td className="px-4 py-3 text-slate-600"><p>{row.paymentMethod}</p>{row.hasTradeIn === "Sim" ? <p className="mt-1 text-xs font-semibold text-amber-700">Trade-in separado do caixa</p> : null}</td>
                <td className="px-4 py-3 text-slate-600">{row.receivingAccount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function InventoryPreviewTable({ rows, loading, previewLimit, totalRows, generatedAt }: { rows: InventoryPreviewRow[]; loading: boolean; previewLimit: number; totalRows: number; generatedAt?: string }) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-navy-900">Prévia do estoque</h2>
          <p className="mt-1 text-sm text-slate-500">Exibindo até {previewLimit} linhas. O Excel exporta o conjunto filtrado completo ({totalRows} item{totalRows === 1 ? "" : "s"}).</p>
        </div>
        {generatedAt ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Gerado em {formatDate(generatedAt)}</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Entrada</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">IMEI/Serial</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3 text-right">Custo compra</th>
              <th className="px-4 py-3 text-right">Frete/custos</th>
              <th className="px-4 py-3 text-right">Custo total</th>
              <th className="px-4 py-3">Status atual</th>
              <th className="px-4 py-3 text-right">Dias</th>
              <th className="px-4 py-3">Venda</th>
              <th className="px-4 py-3 text-right">Valor venda</th>
              <th className="px-4 py-3 text-right">Lucro</th>
              <th className="px-4 py-3 text-right">Margem</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Observações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={16} className="px-4 py-10 text-center text-slate-500"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando prévia...</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={16} className="px-4 py-10 text-center text-slate-500">Nenhum item encontrado para os filtros atuais.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.inventoryId} className="align-top hover:bg-slate-50/80">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDate(row.entryDate)}</td>
                <td className="px-4 py-3 font-semibold text-navy-900">{row.product}</td>
                <td className="px-4 py-3 text-slate-600">{row.category}</td>
                <td className="px-4 py-3 text-slate-600">{row.imeiOrSerial}</td>
                <td className="px-4 py-3 text-slate-600">{row.supplier}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatBRL(row.purchaseCost)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatBRL(row.allocatedCosts)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{formatBRL(row.totalCost)}</td>
                <td className="px-4 py-3 text-slate-600">{row.currentStatus}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{row.daysInStock}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.saleDate ? formatDate(row.saleDate) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy-900">{row.saleValue > 0 ? formatBRL(row.saleValue) : "—"}</td>
                <td className={cn("whitespace-nowrap px-4 py-3 text-right font-semibold", row.grossProfit >= 0 ? "text-emerald-600" : "text-red-600")}>{row.saleDate ? formatBRL(row.grossProfit) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{row.saleDate ? `${row.grossMarginPct.toFixed(2)}%` : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{row.customer}</td>
                <td className="px-4 py-3 text-slate-600">{row.observations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
