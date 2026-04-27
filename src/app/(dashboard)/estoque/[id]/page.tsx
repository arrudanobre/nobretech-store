"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CategoryIcon } from "@/components/ui/icon-helpers"
import { formatBRL, daysBetween, buildPriceTable, getInventoryStatusMeta, getComputedInventoryStatus, getTradeInOriginLabel, isPendingInventoryStatus } from "@/lib/helpers"
import { CATEGORIES, GRADES, CHECKLIST_TEMPLATES } from "@/lib/constants"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Edit3, ShoppingCart, Loader2, Download, CheckCircle2, XCircle, MinusCircle } from "lucide-react"

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
        
        // Use EXACT SAME defaults as FinancePage for consistency
        const defaults = {
          pix: 0, cash: 0, debit: 1.47,
          credit_1x: 3.26, credit_2x: 11.77, credit_3x: 13.03, credit_4x: 13.13,
          credit_5x: 15.37, credit_6x: 15.38, credit_7x: 17.12, credit_8x: 17.12,
          credit_9x: 19.17, credit_10x: 19.82, credit_11x: 19.82, credit_12x: 20.78,
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

        setPriceTable(buildPriceTable(p.purchase_price, activeSettings.default_margin_pct, activeSettings))
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

  const catalogName = product.catalog?.model
    ? `${product.catalog.model}${product.catalog.variant ? " " + product.catalog.variant : ""}`
    : product.condition_notes ? product.condition_notes.replace(/^Acessório:\s*/, "")
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
  const categoryLabel = CATEGORIES.find((c) => c.value === catalogCategory)?.label || "Acessório"

  // Calc Promo Limits for Cash/PIX (minimalista)
  const promoLimit10 = buildPriceTable(product.purchase_price, 10, settings || {}).find(p => p.method === 'pix')?.price || 0
  const promoLimit5 = buildPriceTable(product.purchase_price, 5, settings || {}).find(p => p.method === 'pix')?.price || 0

  let salePerformanceColor = "text-navy-900"
  if (saleData?.sale_price && product.suggested_price) {
    if (saleData.sale_price >= product.suggested_price) {
      salePerformanceColor = "text-emerald-600"
    } else if (saleData.sale_price < product.suggested_price * 0.85) {
      salePerformanceColor = "text-red-600"
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-display font-bold text-navy-900 font-syne">{catalogName}</h2>
          <p className="text-sm text-gray-500">
            {[product.catalog?.storage, product.catalog?.color].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
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

      <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl aspect-video flex items-center justify-center">
        <div className="text-center">
          {product.catalog ? (
            <CategoryIcon category={product.catalog.category} className="!w-16 !h-16" />
          ) : (
            <span className="text-5xl">📦</span>
          )}
          <p className="text-xs text-gray-400 mt-2">Mídia desativada no estoque</p>
        </div>
      </div>

      {/* Specs & Price */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Specs */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-display font-bold text-navy-900 p-4 pb-2 font-syne">Especificações</h3>
          <div className="px-4 pb-4 space-y-2">
            {[
              ["Categoria", categoryLabel],
              ["Marca", product.catalog?.brand || "—"],
              ["Modelo", catalogName],
              ["Armazenamento", product.catalog?.storage || "—"],
              ["Cor", product.catalog?.color || "—"],
              ["IMEI", product.imei || "—"],
              ["Nº Série", product.serial_number || "—"],
              ["Bateria", product.battery_health ? `${product.battery_health}%` : "—"],
              ["Software", product.ios_version || "—"],
              ["Ano", product.catalog?.year?.toString() || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-navy-900">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price Table */}
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <h3 className="font-display font-bold text-navy-900 p-4 pb-2 font-syne">Preços Sugeridos</h3>
          <div className="px-4 pb-4 flex-1">
            <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-50">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Custo</p>
                <p className="text-base font-bold text-navy-900">{formatBRL(product.purchase_price)}</p>
              </div>
              <div>
                {product.status === "sold" && saleData ? (
                  <>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Vendido por</p>
                    <p className={`text-base font-bold ${salePerformanceColor}`}>{formatBRL(saleData.sale_price)}</p>
                    <p className={`text-[9px] font-bold mt-0.5 ${saleData.sale_price >= product.purchase_price ? "text-emerald-600" : "text-red-600"}`}>
                      {saleData.sale_price >= product.purchase_price ? "+" : ""} {formatBRL(saleData.sale_price - product.purchase_price)} lucro
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Sugerido</p>
                    <p className="text-lg font-bold text-royal-500 leading-none">{formatBRL(product.suggested_price || 0)}</p>
                    {product.suggested_price && (
                      <p className="text-[9px] text-emerald-600 font-bold mt-1.5">
                        + {formatBRL(product.suggested_price - product.purchase_price)} lucro
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {product.status !== "sold" && promoLimit5 > 0 && (
              <div className="mb-6 relative">
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-royal-500 rounded-full" />
                <div className="bg-royal-50/80 border border-royal-100 rounded-xl p-3 shadow-sm">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">Simulador de Promoção</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Mínimo (10%)</p>
                      <p className="text-base font-bold text-navy-900">{formatBRL(promoLimit10)}</p>
                      <p className="text-[9px] text-emerald-600 font-bold mt-0.5">+ {formatBRL(promoLimit10 - product.purchase_price)} lucro</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Crítico (5%)</p>
                      <p className="text-base font-bold text-danger-600">{formatBRL(promoLimit5)}</p>
                      <p className="text-[9px] text-emerald-600 font-bold mt-0.5">+ {formatBRL(promoLimit5 - product.purchase_price)} lucro</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Tabela de Parcelamento</p>
              {priceTable.map((row: any) => (
                <div key={row.method} className="flex justify-between text-sm py-1.5 border-b border-gray-50/50 last:border-0">
                  <span className="text-gray-600">{row.label}</span>
                  <span className="font-semibold text-navy-900">
                    {formatBRL(row.price)}
                    {row.installments > 1 && (
                      <span className="text-[10px] text-gray-400 ml-1 font-normal">
                        ({row.installments}x {formatBRL(row.installmentValue)})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
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
