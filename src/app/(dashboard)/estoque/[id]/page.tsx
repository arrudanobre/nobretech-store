"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatBRL, daysBetween, buildPriceTable, getInventoryStatusMeta, getComputedInventoryStatus, getProductName, getTradeInOriginLabel, isPendingInventoryStatus } from "@/lib/helpers"
import { CATEGORIES, GRADES, CHECKLIST_TEMPLATES, SIDEPAY_FEE_PCTS } from "@/lib/constants"
import { calculateSaleEconomics, estimateRiskReserve } from "@/lib/sale-economics"
import { supabase } from "@/lib/supabase"
import {
  Activity,
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FileText,
  Hash,
  Loader2,
  MinusCircle,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Target,
  TrendingUp,
  WalletCards,
  XCircle,
  type LucideIcon,
} from "lucide-react"

interface ChecklistItem {
  id: string
  label: string
  status: string
  note?: string
}


export default function ProductDetailPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [priceTable, setPriceTable] = useState<any[]>([])
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [settings, setSettings] = useState<any>(null)
  const [saleData, setSaleData] = useState<any>(null)
  const [showAllPayments, setShowAllPayments] = useState(false)

  const fetchProduct = useCallback(async () => {
    if (!productId) return
    try {
      const { data: items, error: invError } = await (supabase.from("inventory") as any)
        .select("*")
        .eq("id", productId)

      if (invError) {
        console.error("Inventory fetch error:", JSON.stringify(invError))
        setLoading(false)
        return
      }

      if (!items || items.length === 0) {
        setLoading(false)
        return
      }

      const p = items[0] as any
      p.photos = []
      setProduct(p)

      if (p.catalog_id) {
        const { data: catalogData } = await (supabase.from("product_catalog") as any)
          .select("*")
          .eq("id", p.catalog_id)
          .single()
        if (catalogData) p.catalog = catalogData
      }

      if (p.checklist_id) {
        const { data: cd } = await (supabase.from("checklists") as any)
          .select("items, device_type")
          .eq("id", p.checklist_id)
          .single()
        if (cd?.items && Array.isArray(cd.items)) {
          setChecklistItems(cd.items)
        } else if (cd?.device_type && CHECKLIST_TEMPLATES[cd.device_type as keyof typeof CHECKLIST_TEMPLATES]) {
          setChecklistItems(CHECKLIST_TEMPLATES[cd.device_type as keyof typeof CHECKLIST_TEMPLATES] as ChecklistItem[])
        }
      }

      if (p.purchase_price) {
        // 1. Fetch settings from DB with robust mapping
        const { data: setts } = await (supabase.from("financial_settings") as any).select("*").limit(1)
        
        const defaults: Record<string, number> = {
          ...SIDEPAY_FEE_PCTS,
          default_margin_pct: 15
        }

        let activeSettings = { ...defaults }

        if (setts && setts[0]) {
          const s = setts[0]
          activeSettings = {
            pix: s.pix_fee_pct ?? defaults.pix,
            cash: s.cash_discount_pct ?? defaults.cash,
            debit: s.debit_fee_pct ?? defaults.debit,
            credit_1x: s.credit_1x_fee_pct ?? defaults.credit_1x,
            credit_2x: s.credit_2x_fee_pct ?? defaults.credit_2x,
            credit_3x: s.credit_3x_fee_pct ?? defaults.credit_3x,
            credit_4x: s.credit_4x_fee_pct ?? defaults.credit_4x,
            credit_5x: s.credit_5x_fee_pct ?? defaults.credit_5x,
            credit_6x: s.credit_6x_fee_pct ?? defaults.credit_6x,
            credit_7x: s.credit_7x_fee_pct ?? defaults.credit_7x,
            credit_8x: s.credit_8x_fee_pct ?? defaults.credit_8x,
            credit_9x: s.credit_9x_fee_pct ?? defaults.credit_9x,
            credit_10x: s.credit_10x_fee_pct ?? defaults.credit_10x,
            credit_11x: s.credit_11x_fee_pct ?? defaults.credit_11x,
            credit_12x: s.credit_12x_fee_pct ?? defaults.credit_12x,
            credit_13x: s.credit_13x_fee_pct ?? s.credit_12x_fee_pct ?? defaults.credit_13x,
            credit_14x: s.credit_14x_fee_pct ?? s.credit_12x_fee_pct ?? defaults.credit_14x,
            credit_15x: s.credit_15x_fee_pct ?? s.credit_12x_fee_pct ?? defaults.credit_15x,
            credit_16x: s.credit_16x_fee_pct ?? s.credit_12x_fee_pct ?? defaults.credit_16x,
            credit_17x: s.credit_17x_fee_pct ?? s.credit_12x_fee_pct ?? defaults.credit_17x,
            credit_18x: s.credit_18x_fee_pct ?? s.credit_12x_fee_pct ?? defaults.credit_18x,
            default_margin_pct: s.default_margin_pct ?? defaults.default_margin_pct,
          } as any
        }
        
        setSettings(activeSettings)

        // 2. Fetch sale price if sold
        if (p.status === "sold") {
          const { data: sd } = await (supabase.from("sales") as any)
            .select("*")
            .eq("inventory_id", p.id)
            .limit(1)
          if (sd && sd[0]) setSaleData(sd[0])
        }

        const suggestedNet = Number(p.suggested_price || 0)
        const priceBase = suggestedNet > 0 ? suggestedNet : Number(p.purchase_price || 0)
        const priceMargin = suggestedNet > 0 ? 0 : activeSettings.default_margin_pct
        setPriceTable(buildPriceTable(priceBase, priceMargin, activeSettings))
      }
    } catch (err: any) {
      console.error("Unexpected error:", err?.message || err)
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    fetchProduct()
  }, [fetchProduct])

  const handleDownloadPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const html2canvasF = (await import("html2canvas")).default

    const el = document.getElementById("pdf-content")
    if (!el || !product) return
    setGeneratingPdf(true)

    try {
      const canvas = await html2canvasF(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      })

      const pdf = new jsPDF("p", "mm", "a4")
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const marginMm = 10

      const imgWidth = pageW - marginMm * 2
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Convert px to mm
      const pxPerPmm = canvas.width / imgWidth
      const pageSlicePx = Math.floor((pageH - marginMm * 2) * pxPerPmm)

      const imgData = canvas.toDataURL("image/png")
      const firstOffsetPx = Math.floor(marginMm * pxPerPmm)

      // Page 1: image starts at Y=0, visible area goes from Y=firstOffsetPx to visiblePx
      pdf.addImage(imgData, "PNG", marginMm, 0, imgWidth, imgHeight)
      let currentPage = 1

      // Keep adding pages while there's uncaptured content below
      while (currentPage * pageSlicePx < canvas.height) {
        const pageOffsetMm = (currentPage * pageSlicePx) / pxPerPmm
        pdf.addPage()
        pdf.addImage(imgData, "PNG", marginMm, marginMm - pageOffsetMm, imgWidth, imgHeight)
        currentPage++
      }

      const fileName = `laudo-${product.catalog?.model || "produto"}-${product.imei?.slice(-4) || product.id.slice(0, 8)}.pdf`
      pdf.save(fileName)
    } catch (err) {
      console.error("PDF generation error:", err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-24">
        <p className="text-lg text-gray-500">Produto não encontrado</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push("/estoque")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao estoque
        </Button>
      </div>
    )
  }

  const catalogName = getProductName(product) !== "Produto"
    ? getProductName(product)
    : product.imei
      ? `Dispositivo IMEI ...${product.imei.slice(-4)}`
      : "Sem catálogo"

  const days = daysBetween(product.purchase_date)
  const gradeInfo = GRADES.find((g) => g.value === product.grade)
  const computedStatus = getComputedInventoryStatus(product || {})
  const statusMeta = getInventoryStatusMeta(computedStatus)
  const originLabel = getTradeInOriginLabel(product?.origin)

  const passed = checklistItems.filter((i) => i.status === "ok").length
  const failed = checklistItems.filter((i) => i.status === "fail").length
  const na = checklistItems.filter((i) => i.status === "na").length
  const total = checklistItems.length
  const progress = total > 0 ? Math.round((passed / total) * 100) : 0

  const catalogCategory = product.catalog?.category || ""
  const manualCategoryText = `${product.notes || ""} ${product.condition_notes || ""}`.toLowerCase()
  const manualCategoryLabel = /capa|pel[ií]cula|pencil|caneta|cabo|fonte|carregador|acess[oó]rio/.test(manualCategoryText) ? "Acessório" : "Outros"
  const categoryLabel = CATEGORIES.find((c) => c.value === catalogCategory)?.label || product.catalog?.category || manualCategoryLabel

  const cost = Number(product.purchase_price || 0)
  const suggested = Number(product.suggested_price || 0)
  const targetPrice = suggested > 0 ? suggested : buildPriceTable(cost, settings?.default_margin_pct || 15, settings || {}).find(p => p.method === "pix")?.price || 0
  const targetProfit = Math.max(0, targetPrice - cost)
  const soldPrice = Number(saleData?.sale_price || 0)
  const displayPrice = product.status === "sold" && soldPrice > 0 ? soldPrice : targetPrice
  const riskReserve = estimateRiskReserve({
    cost,
    category: categoryLabel,
    grade: product.grade,
    batteryHealth: product.battery_health,
    warrantyMonths: 6,
  })
  const pixEconomics = calculateSaleEconomics({
    saleRevenue: displayPrice,
    cashAmountDue: displayPrice,
    paymentMethod: "pix",
    settings: settings || {},
    costTotal: cost,
    riskReserve,
  })
  const safeNegotiationPrice = targetProfit > 0 ? cost + targetProfit * 0.75 : targetPrice
  const quickSalePrice = targetProfit > 0 ? cost + targetProfit * (days > 45 ? 0.45 : 0.6) : targetPrice
  const safeDiscount = Math.max(0, targetPrice - safeNegotiationPrice)
  const quickSaleDiscount = Math.max(0, targetPrice - quickSalePrice)
  const stockTone = days > 45 ? "text-red-600" : days > 20 ? "text-amber-600" : "text-emerald-600"
  const stockMessage = days > 45 ? "girar estoque" : days > 20 ? "monitorar" : "saudável"
  const keyPayments = priceTable.filter((row: any) => ["cash", "pix", "debit", "credit_12x", "credit_18x"].includes(row.method))
  const visiblePayments = showAllPayments ? priceTable : keyPayments

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-navy-900 font-syne sm:text-xl">{catalogName}</h2>
            <p className="text-sm text-gray-500">
              {[product.catalog?.storage, product.catalog?.color].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Link href={`/estoque/${productId}/editar`}>
            <Button variant="outline" size="sm">
              <Edit3 className="w-4 h-4" /> Editar
            </Button>
          </Link>
          {product.status !== "sold" && (
            <Link href={`/vendas/nova?product=${productId}`}>
              <Button variant="success" size="sm">
                <ShoppingCart className="w-4 h-4" /> Vender
              </Button>
            </Link>
          )}
          {product.status === "sold" && (
            <Badge variant="gray" dot>Vendido</Badge>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {product.grade && <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${gradeInfo?.color}`}>{product.grade}</span>}
        <Badge variant={statusMeta.badge} dot>
          {statusMeta.label}
        </Badge>
        {days > 30 ? (
          <Badge variant="red">{days} dias em estoque</Badge>
        ) : (
          <Badge variant="blue">{days} dias em estoque</Badge>
        )}
        <Badge variant="gray">Origem: {originLabel}</Badge>
      </div>

      {isPendingInventoryStatus(computedStatus) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between">
          <p className="text-sm text-amber-800">Cadastro incompleto. Finalize os dados obrigatórios para ativar a venda.</p>
          <Link href={`/estoque/${productId}/editar`}>
            <Button variant="outline" size="sm">Finalizar cadastro</Button>
          </Link>
        </div>
      )}

      {/* Strategic overview */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Resumo comercial</p>
              <h3 className="mt-1 font-display text-xl font-bold text-navy-900 font-syne">{catalogName}</h3>
              <p className="mt-1 text-sm text-gray-500">{categoryLabel} · {product.catalog?.storage || "Sem armazenamento"} · {product.catalog?.color || "Sem cor"}</p>
            </div>
            <div className="rounded-2xl bg-navy-900 px-4 py-3 text-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                {product.status === "sold" && soldPrice > 0 ? "Vendido por" : "Preço alvo"}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatBRL(displayPrice)}</p>
              <p className="text-xs text-emerald-200">+ {formatBRL(pixEconomics.grossProfit)} lucro em caixa</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StrategyStat icon={BadgeDollarSign} label="Custo real" value={formatBRL(cost)} helper="Base de compra" />
            <StrategyStat icon={TrendingUp} label="Margem real" value={`${pixEconomics.realMarginPct.toFixed(1)}%`} helper={`${formatBRL(pixEconomics.embeddedFee)} taxa no Pix`} tone="green" />
            <StrategyStat icon={ShieldCheck} label="Reserva risco" value={formatBRL(riskReserve)} helper="Garantia/defeito" tone={riskReserve > 0 ? "amber" : "navy"} />
            <StrategyStat icon={Clock3} label="Giro" value={`${days}d`} helper={stockMessage} tone={days > 45 ? "red" : days > 20 ? "amber" : "green"} />
          </div>

          {product.status !== "sold" && targetPrice > 0 && (
            <div className="mt-4 rounded-2xl border border-royal-100 bg-royal-50/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-royal-600" />
                <p className="text-sm font-bold text-navy-900">Estratégia de negociação</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <PriceDecision
                  label="Anunciar"
                  value={targetPrice}
                  helper="Valor cheio da vitrine"
                  tone="navy"
                />
                <PriceDecision
                  label="Negociável"
                  value={safeNegotiationPrice}
                  helper={`Desconto seguro até ${formatBRL(safeDiscount)}`}
                  tone="green"
                />
                <PriceDecision
                  label={days > 45 ? "Giro rápido" : "Piso gerencial"}
                  value={quickSalePrice}
                  helper={`${formatBRL(quickSaleDiscount)} abaixo do alvo`}
                  tone={days > 45 ? "amber" : "blue"}
                />
              </div>
              <p className="mt-3 text-xs text-gray-500">
                A faixa é calculada sobre o lucro disponível deste produto, não por percentual fixo. Quanto mais tempo em estoque, mais agressiva pode ser a negociação.
              </p>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Rastreabilidade</p>
              <h3 className="mt-1 font-display font-bold text-navy-900 font-syne">Identificação do produto</h3>
            </div>
            <ShieldCheck className="h-5 w-5 text-royal-500" />
          </div>

          <div className="grid gap-2">
            <TraceRow icon={Hash} label="IMEI" value={product.imei || "Não informado"} mono />
            <TraceRow icon={FileText} label="Serial" value={product.serial_number || "Não informado"} mono />
            <TraceRow icon={CalendarDays} label="Compra" value={product.purchase_date ? `${new Date(product.purchase_date).toLocaleDateString("pt-BR")} · ${days} dias` : "Não informado"} valueClassName={stockTone} />
            <TraceRow icon={Smartphone} label="Condição" value={[product.grade, product.battery_health ? `${product.battery_health}% bateria` : null, product.ios_version].filter(Boolean).join(" · ") || "Não informado"} />
            <TraceRow icon={Activity} label="Origem" value={originLabel} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-royal-500" />
            <h3 className="font-display font-bold text-navy-900 font-syne">Especificações</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Categoria", categoryLabel],
              ["Marca", product.catalog?.brand || "Apple"],
              ["Modelo", catalogName],
              ["Armazenamento", product.catalog?.storage || "—"],
              ["Cor", product.catalog?.color || "—"],
              ["Ano", product.catalog?.year?.toString() || "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-surface px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-navy-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-royal-500" />
              <h3 className="font-display font-bold text-navy-900 font-syne">Condições de venda</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowAllPayments((value) => !value)}
              className="text-xs font-semibold text-royal-500 hover:text-royal-700"
            >
              {showAllPayments ? "Ver resumo" : "Ver tabela completa"}
            </button>
          </div>
          <div className="grid gap-2">
            {visiblePayments.map((row: any) => {
              const economics = calculateSaleEconomics({
                saleRevenue: targetPrice,
                cashAmountDue: targetPrice,
                paymentMethod: row.method,
                settings: settings || {},
                costTotal: cost,
                riskReserve,
              })
              return (
                <div key={row.method} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-gray-100 bg-surface px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{row.label}</p>
                    <p className="text-xs text-gray-500">
                      {economics.installments > 1 ? `${economics.installments}x de ${formatBRL(economics.installmentValue)}` : "Recebimento direto"}
                    </p>
                    {economics.embeddedFee > 0 && (
                      <p className="text-[11px] text-gray-400">Taxa embutida {formatBRL(economics.embeddedFee)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-navy-900">{formatBRL(economics.customerCashPays)}</p>
                    <p className="text-[10px] text-emerald-600">
                      lucro {formatBRL(economics.grossProfit)} · {economics.realMarginPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Checklist Section */}
      {total > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-4 sm:p-6 pb-3">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">
                Laudo de Inspeção — {categoryLabel}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {passed} OK · {failed} Falhas · {na} N/A · {progress}% concluído
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadPDF}
              isLoading={generatingPdf}
            >
              <Download className="w-4 h-4" /> Baixar PDF
            </Button>
          </div>

          <div className="px-4 sm:px-6">
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  progress >= 80 ? "bg-success-500" : progress >= 50 ? "bg-warning-500" : "bg-danger-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="p-4 sm:px-6 sm:pb-5 divide-y divide-gray-50">
            {checklistItems.map((item, idx) => {
              const isOk = item.status === "ok"
              const isFail = item.status === "fail"
              const isNa = item.status === "na"

              return (
                <div key={idx} className={`py-2.5 flex items-center gap-3 ${isFail ? "bg-red-50/50 -mx-4 px-4 rounded-lg" : ""}`}>
                  <div className="shrink-0">
                    {isOk && <CheckCircle2 className="w-5 h-5 text-success-500" />}
                    {isFail && <XCircle className="w-5 h-5 text-danger-500" />}
                    {isNa && <MinusCircle className="w-5 h-5 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy-900">{item.label}</p>
                    {item.note && isFail && (
                      <p className="text-xs text-danger-500 mt-0.5">{item.note}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Condition Notes */}
      {product.condition_notes && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
          <h3 className="font-display font-bold text-navy-900 font-syne mb-2">Observações</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{product.condition_notes}</p>
        </div>
      )}

      {/* Hidden PDF content — for html2canvas rendering */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, zIndex: -1 }}>
        <div id="pdf-content" style={{ width: "794px", padding: "36px 48px 48px", fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: "#0D1B2E" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "16px", borderBottom: "3px solid #0D1B2E", paddingBottom: "16px" }}>
            <img src="/logo-nobretech.png" alt="Nobretech Store" style={{ width: "220px", height: "auto", marginBottom: "4px" }} />
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#0D1B2E", margin: 0, fontFamily: "Inter, system-ui, sans-serif" }}>Laudo de Inspeção</h1>
            <p style={{ fontSize: "13px", color: "#3A6BC4", marginTop: "4px" }}>
              {catalogName} {product.catalog?.storage ? `— ${product.catalog.storage} ${product.catalog.color || ""}` : ""}
            </p>
          </div>

          <div style={{ background: "#F5F8FF", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", color: "#3A6BC4", marginBottom: "12px", textTransform: "uppercase" }}>Dados do Aparelho</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px" }}>
              {[
                ["IMEI", product.imei || "N/D"],
                ["Nº Série", product.serial_number || "N/D"],
                ["Grade", product.grade || "N/D"],
                ["Bateria", product.battery_health ? `${product.battery_health}%` : "N/D"],
                ["Software", product.ios_version || "N/D"],
                ["Cor", product.catalog?.color || "N/D"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: "10px", color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</p>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#0D1B2E", margin: "2px 0 0" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
            {[
              { label: "Aprovados", value: passed, color: "#3ABF82" },
              { label: "Falhas", value: failed, color: "#E05C5C" },
              { label: "Não se aplica", value: na, color: "#9CA3AF" },
            ].map((stat) => (
              <div key={stat.label} style={{ flex: 1, background: "#F9FAFB", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                <p style={{ fontSize: "28px", fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
                <p style={{ fontSize: "11px", color: "#6B7280", margin: "4px 0 0" }}>{stat.label}</p>
              </div>
            ))}
          </div>

          <div style={{ height: "1px", background: "#E5E7EB", marginBottom: "20px" }} />

          {(() => {
            const filtered = checklistItems.filter((i: ChecklistItem) => i.status !== "na")
            return filtered.length > 0 ? (
              <>
                <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", color: "#3A6BC4", marginBottom: "12px", textTransform: "uppercase" }}>Detalhamento</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 0", textAlign: "left", borderBottom: "2px solid #0D1B2E", color: "#0D1B2E", fontWeight: 700, fontSize: "11px" }}>Item</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #0D1B2E", color: "#0D1B2E", fontWeight: 700, fontSize: "11px", whiteSpace: "nowrap" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item: ChecklistItem, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "10px 0", color: "#1F2937" }}>
                          {item.label}
                          {item.note && item.status === "fail" && (
                            <p style={{ fontSize: "11px", color: "#E05C5C", margin: "4px 0 0", fontStyle: "italic" }}>* {item.note}</p>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{ color: item.status === "ok" ? "#3ABF82" : "#E05C5C", fontWeight: 700, fontSize: "11px" }}>
                            {item.status === "ok" ? "✓ APROVADO" : "✕ FALHA"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null
          })()}

          {product.condition_notes && (
            <div style={{ marginTop: "24px", padding: "16px", background: "#F9FAFB", borderRadius: "10px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", color: "#3A6BC4", marginBottom: "8px", textTransform: "uppercase" }}>Observações</p>
              <p style={{ fontSize: "12px", color: "#4B5563", lineHeight: 1.7, margin: 0 }}>{product.condition_notes}</p>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#0D1B2E", margin: 0 }}>NOBRETECH STORE</p>
            <p style={{ fontSize: "10px", color: "#9CA3AF", margin: "4px 0 0" }}>
              Documento gerado automaticamente em {new Date().toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StrategyStat({
  icon: Icon,
  label,
  value,
  helper,
  tone = "navy",
}: {
  icon: LucideIcon
  label: string
  value: string
  helper: string
  tone?: "navy" | "green" | "amber" | "red"
}) {
  const toneClass = {
    navy: "bg-navy-50 text-navy-900",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  }[tone]

  const iconClass = {
    navy: "bg-navy-900 text-white",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  }[tone]

  return (
    <div className={`rounded-2xl border border-gray-100 p-3 ${toneClass}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="truncate text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs opacity-70">{helper}</p>
    </div>
  )
}

function PriceDecision({
  label,
  value,
  helper,
  tone,
}: {
  label: string
  value: number
  helper: string
  tone: "navy" | "green" | "amber" | "blue"
}) {
  const toneClass = {
    navy: "border-navy-100 bg-white text-navy-900",
    green: "border-emerald-100 bg-emerald-50 text-emerald-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    blue: "border-royal-100 bg-white text-royal-700",
  }[tone]

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{formatBRL(value)}</p>
      <p className="mt-1 text-xs opacity-70">{helper}</p>
    </div>
  )
}

function TraceRow({
  icon: Icon,
  label,
  value,
  mono,
  valueClassName = "text-navy-900",
}: {
  icon: LucideIcon
  label: string
  value: string
  mono?: boolean
  valueClassName?: string
}) {
  return (
    <div className="grid grid-cols-[36px_1fr] items-center gap-3 rounded-2xl border border-gray-100 bg-surface px-3 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-royal-500 shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-0.5 truncate text-sm font-semibold ${mono ? "font-mono" : ""} ${valueClassName}`}>
          {value}
        </p>
      </div>
    </div>
  )
}
