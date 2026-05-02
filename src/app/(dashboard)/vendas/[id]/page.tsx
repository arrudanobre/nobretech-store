"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL, formatDate, getAdditionalItemDisplayName, getTradeInDisplayName, getTradeInSummaryStatus, getInventoryStatusMeta, isPendingInventoryStatus, getProductName } from "@/lib/helpers"
import { calcSaleTotals, parseQtyFromNotes } from "@/lib/sale-totals"
import { calculateSaleEconomics, estimateRiskReserve } from "@/lib/sale-economics"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"
import { CHECKLIST_TEMPLATES } from "@/lib/constants"
import { generateWarrantyPDF as generateWarrantyTermDocument, generateReceiptPDF, type SaleDocumentData, type ReceiptLineItem } from "@/lib/sale-documents"
import jsPDF from "jspdf"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, ShieldCheck, FileText, CreditCard, User, ShoppingCart, AlertTriangle, Download, CheckCircle2, XCircle, MinusCircle, Loader2, Edit, Trash, Plus, Calendar, History, Trash2, Search, Megaphone, QrCode, Copy, ExternalLink, KeyRound, RefreshCcw } from "lucide-react"

const checklistLabels: Record<string, string> = {}
for (const [cat, items] of Object.entries(CHECKLIST_TEMPLATES)) {
  for (const item of items) {
    checklistLabels[item.id] = item.label
  }
}

function getSaleFeeSettings(sale: any) {
  if (!sale?.payment_method || sale.card_fee_pct === null || sale.card_fee_pct === undefined) {
    return {}
  }

  return { [sale.payment_method]: Number(sale.card_fee_pct) }
}

const SALE_ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "trafego_pago", label: "Tráfego pago" },
  { value: "indicacao", label: "Indicação" },
  { value: "loja", label: "Loja física" },
  { value: "recorrente", label: "Cliente recorrente" },
  { value: "outro", label: "Outro" },
  { value: "unknown", label: "Não informado" },
]

type MarketingCampaignOption = {
  id: string
  name: string
  channel: string
  status: string
}

const saleOriginLabel = (origin?: string | null) => {
  return SALE_ORIGINS.find((item) => item.value === origin)?.label || origin || "Não informado"
}

const PACKAGING_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "original_box", label: "Caixa original" },
  { value: "nobretech_box", label: "Caixa Nobretech" },
  { value: "no_box", label: "Sem caixa" },
  { value: "other", label: "Outro" },
]

const packagingLabel = (type?: string | null, notes?: string | null) => {
  const note = notes?.trim()
  if (type === "original_box") return "Caixa original"
  if (type === "nobretech_box") return "Caixa Nobretech"
  if (type === "no_box") return "Sem caixa"
  if (type === "other") return note || "Outro"
  return "Não informado"
}

const auditField = (data: unknown, key: string) => {
  if (!data || typeof data !== "object") return undefined
  return (data as Record<string, unknown>)[key]
}

export default function SaleDetailPage() {
  const { id } = useParams() as { id: string }
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [sale, setSale] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [product, setProduct] = useState<any>(null)
  const [checklist, setChecklist] = useState<any[]>([])
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [additionalItems, setAdditionalItems] = useState<any[]>([])
  const [tradeInData, setTradeInData] = useState<any>(null)
  const [tradeInInventory, setTradeInInventory] = useState<any>(null)

  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [publicAccessLoading, setPublicAccessLoading] = useState<string | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editSaleOrigin, setEditSaleOrigin] = useState("unknown")
  const [editMarketingCampaignId, setEditMarketingCampaignId] = useState("")
  const [editLeadNotes, setEditLeadNotes] = useState("")
  const [editPackagingType, setEditPackagingType] = useState("")
  const [editPackagingNotes, setEditPackagingNotes] = useState("")
  const [marketingCampaigns, setMarketingCampaigns] = useState<MarketingCampaignOption[]>([])

  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState("")
  const [newItemName, setNewItemName] = useState("")
  const [newItemType, setNewItemType] = useState<"upsell" | "free">("upsell")
  const [newItemCost, setNewItemCost] = useState("")
  const [newItemSalePrice, setNewItemSalePrice] = useState("")

  const availableInventoryItems = inventoryItems.filter(item =>
    !additionalItems.some(add => add.product_id === item.id) &&
    sale?.inventory_id !== item.id &&
    (searchQuery === "" ||
      getProductName(item).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.imei && item.imei.includes(searchQuery)) ||
      (item.serial_number && item.serial_number.includes(searchQuery))
    )
  )

  useEffect(() => {
    const fetchSale = async () => {
      try {
        const { data, error } = await (supabase
          .from("sales") as any)
          .select("*")
          .eq("id", id)
          .single()
        if (error) throw error
        setSale(data)
        setEditPackagingType(data?.packaging_type || "")
        setEditPackagingNotes(data?.packaging_notes || "")

        if ((data as any)?.customer_id) {
          const { data: c } = await (supabase
            .from("customers") as any)
            .select("*")
            .eq("id", (data as any).customer_id)
            .single()
          setCustomer(c)
        }

        if ((data as any)?.inventory_id) {
          const { data: p, error: invErr } = await (supabase
            .from("inventory") as any)
            .select("*, catalog:catalog_id(*)")
            .eq("id", (data as any).inventory_id)
            .single()

          if (!invErr && p) {
            setProduct(p)

            if ((p as any)?.checklist_id) {
              const { data: cl } = await (supabase
                .from("checklists") as any)
                .select("*")
                .eq("id", (p as any).checklist_id)
                .single()
              if (cl?.items) {
                const items = typeof cl.items === "string" ? JSON.parse(cl.items) : cl.items
                setChecklist(items)
              }
            }
          }
        }

        if ((data as any)?.trade_in_id) {
          const { data: ti } = await (supabase
            .from("trade_ins") as any)
            .select("*")
            .eq("id", (data as any).trade_in_id)
            .single()

          if (ti) {
            setTradeInData(ti)
            if ((ti as any).linked_inventory_id) {
              const { data: tiInventory } = await (supabase
                .from("inventory") as any)
                .select("id, status, origin, grade, imei, serial_number, catalog:catalog_id(id, model, storage, color)")
                .eq("id", (ti as any).linked_inventory_id)
                .single()
              if (tiInventory) setTradeInInventory(tiInventory)
            }
          }
        }

        // Fetch additional items
        if (id) {
          const { data: addItems } = await (supabase
            .from("sales_additional_items") as any)
            .select("*, inventory:product_id(id, imei, imei2, serial_number, grade, catalog:catalog_id(*))")
            .eq("sale_id", id)
          if (addItems) setAdditionalItems(addItems)

          const { data: logs } = await (supabase
            .from("audit_logs") as any)
            .select("*")
            .eq("table_name", "sales")
            .eq("record_id", id)
            .order("created_at", { ascending: false })
          if (logs) setAuditLogs(logs)

          const { data: inv } = await (supabase
            .from("inventory") as any)
            .select("id, imei, imei2, serial_number, condition_notes, notes, purchase_price, suggested_price, type, supplier_name, status, catalog:catalog_id(*)")
            .in("status", ["active", "in_stock"])
          if (inv) setInventoryItems(inv)

          const { data: campaigns } = await (supabase
            .from("marketing_campaigns") as any)
            .select("id, name, channel, status")
            .order("created_at", { ascending: false })
          if (campaigns) setMarketingCampaigns(campaigns)
        }
      } catch (err) {
        toast({ title: "Venda não encontrada", type: "error" })
        router.push("/vendas")
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchSale()
  }, [id])

  const paymentLabel = () => {
    if (!sale?.payment_method) return "—"
    const map: Record<string, string> = {
      pix: "PIX", cash: "Dinheiro", debit: "Débito",
      credit_1x: "Crédito 1x", credit_2x: "Crédito 2x", credit_3x: "Crédito 3x",
      credit_4x: "Crédito 4x", credit_5x: "Crédito 5x", credit_6x: "Crédito 6x",
      credit_7x: "Crédito 7x", credit_8x: "Crédito 8x", credit_9x: "Crédito 9x",
      credit_10x: "Crédito 10x", credit_11x: "Crédito 11x", credit_12x: "Crédito 12x",
      credit_13x: "Crédito 13x", credit_14x: "Crédito 14x", credit_15x: "Crédito 15x",
      credit_16x: "Crédito 16x", credit_17x: "Crédito 17x", credit_18x: "Crédito 18x",
    }
    return map[sale.payment_method] || sale.payment_method
  }

  // Compute totals early (safe: sale/product may be null during loading)
  const totals = calcSaleTotals({
    salePrice: sale?.sale_price,
    mainCost: product?.purchase_price,
    qty: parseQtyFromNotes(sale?.notes),
    additionalItems: additionalItems || [],
    supplierCost: sale?.supplier_cost,
  })
  const tradeInValueForSale = Number(tradeInData?.trade_in_value || 0)
  const saleCashAmountDue = Math.max(0, totals.valorTotal - tradeInValueForSale)
  const saleRiskReserve = estimateRiskReserve({
    cost: totals.custoTotal,
    category: product?.catalog?.category || product?.catalog?.model || product?.notes,
    grade: product?.grade,
    batteryHealth: product?.battery_health,
    warrantyMonths: Number(sale?.warranty_months || 0),
  })
  const saleEconomics = calculateSaleEconomics({
    saleRevenue: totals.valorTotal,
    cashAmountDue: saleCashAmountDue,
    paymentMethod: sale?.payment_method,
    settings: getSaleFeeSettings(sale),
    costTotal: totals.custoTotal,
    riskReserve: saleRiskReserve,
  })
  const suggestedMainValue = Number(product?.suggested_price || 0) * parseQtyFromNotes(sale?.notes)
  const discountAmount = suggestedMainValue > 0 ? Math.max(0, suggestedMainValue - totals.valorPrincipal) : 0
  const tradeInDisplayName = tradeInData ? getTradeInDisplayName({
    model: tradeInData.notes || tradeInInventory?.catalog?.model || undefined,
    storage: tradeInInventory?.catalog?.storage || undefined,
    color: tradeInInventory?.catalog?.color || undefined,
    fallback: "Aparelho recebido",
  }) : ""
  const tradeInGrade = tradeInInventory?.grade || tradeInData?.grade || null
  const isCompletedSale = (sale?.sale_status || "completed") === "completed"
  const publicPurchaseUrl = typeof window !== "undefined" && sale?.public_access_token
    ? `${window.location.origin}/compra-verificada/${sale.public_access_token}`
    : ""

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast({ title: `${label} copiado`, type: "success" })
  }

  const refreshPublicAccess = async (action: "ensure" | "regenerate_pin") => {
    setPublicAccessLoading(action)
    try {
      const response = await fetch(`/api/sales/${id}/verified-purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json()
      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message || "Não foi possível atualizar o acesso público.")
      }
      setSale({ ...sale, ...payload.data })
      toast({
        title: action === "regenerate_pin" ? "PIN regenerado" : "Acesso da compra gerado",
        type: "success",
      })
    } catch (error) {
      toast({
        title: "Erro na Compra Verificada",
        description: error instanceof Error ? error.message : "Tente novamente.",
        type: "error",
      })
    } finally {
      setPublicAccessLoading(null)
    }
  }

  const handleDownloadInspectionPDF = async () => {
    if (generatingPdf) return

    const { default: jsPDF } = await import("jspdf")
    const html2canvasF = (await import("html2canvas")).default

    const el = document.getElementById("inspection-pdf-content")
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

      const pxPerPmm = canvas.width / imgWidth
      const pageSlicePx = Math.floor((pageH - marginMm * 2) * pxPerPmm)

      const imgData = canvas.toDataURL("image/png")

      pdf.addImage(imgData, "PNG", marginMm, 0, imgWidth, imgHeight)
      let currentPage = 1

      while (currentPage * pageSlicePx < canvas.height) {
        const pageOffsetMm = (currentPage * pageSlicePx) / pxPerPmm
        pdf.addPage()
        pdf.addImage(imgData, "PNG", marginMm, marginMm - pageOffsetMm, imgWidth, imgHeight)
        currentPage++
      }

      const fileName = `laudo-${product.catalog?.model || "aparelho"}-${product.imei?.slice(-4) || product.id.slice(0, 8)}.pdf`
      pdf.save(fileName)
      toast({ title: "Laudo gerado!", type: "success" })
    } catch (err) {
      console.error("PDF error:", err)
      toast({ title: "Erro ao gerar PDF", type: "error" })
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleDownloadWarrantyTermPDF = async () => {
    setGenerating("warranty")
    try {
      const catalog = product?.catalog || {}
      const productName = `${catalog.model || "Aparelho"}${catalog.variant ? ` ${catalog.variant}` : ""}${catalog.storage ? ` ${catalog.storage}` : ""}${catalog.color ? ` ${catalog.color}` : ""}`.trim()
      const additionalItemsSummary = additionalItems.length
        ? additionalItems.map((item) => `${item.quantity || 1}x ${getAdditionalItemDisplayName(item.name)}${item.type === "free" ? " (brinde)" : ""}`).join(", ")
        : null
      const documentData: SaleDocumentData = {
        saleId: sale?.id || id,
        saleDate: sale?.sale_date,
        customerName: customer?.full_name || "Cliente",
        customerCpf: customer?.cpf || null,
        customerPhone: customer?.phone || null,
        paymentMethod: paymentLabel(),
        saleNotes: sale?.notes || product?.condition_notes || null,
        additionalItems: additionalItemsSummary,
        item: {
          name: productName,
          imei: product?.imei || null,
          imei2: product?.imei2 || null,
          quantity: 1,
          unitPrice: Number(sale?.sale_price || 0),
          totalPrice: Number(sale?.sale_price || 0),
          warrantyMonths: Number(sale?.warranty_months || 0),
        },
      }

      await generateWarrantyTermDocument(documentData)
      toast({ title: "Termo de garantia gerado!", type: "success" })
    } catch (err) {
      console.error("Erro ao gerar termo novo:", err)
      toast({ title: "Erro ao gerar termo", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  const handleDownloadReceiptPDF = async () => {
    if (generating) return

    setGenerating("receipt")
    try {
      const catalog = product?.catalog || {}
      const mainProductName = `${catalog.model || "Aparelho"}${catalog.variant ? ` ${catalog.variant}` : ""}${catalog.storage ? ` ${catalog.storage}` : ""}${catalog.color ? ` ${catalog.color}` : ""}`.trim()
      const mainQuantity = parseQtyFromNotes(sale?.notes)
      const officialMainTotal = suggestedMainValue > 0 ? suggestedMainValue : totals.valorPrincipal
      const officialMainUnit = mainQuantity > 0 ? officialMainTotal / mainQuantity : officialMainTotal

      const receiptLines: ReceiptLineItem[] = [
        {
          name: mainProductName,
          imei: product?.imei || null,
          imei2: product?.imei2 || null,
          quantity: mainQuantity,
          unitPrice: officialMainUnit,
          totalPrice: officialMainTotal,
          warrantyMonths: Number(sale?.warranty_months || 0),
          type: "principal",
        },
        ...(additionalItems || []).map((item: any) => ({
          name: getAdditionalItemDisplayName(item.name),
          imei: item.imei || item.inventory?.imei || null,
          imei2: item.imei2 || item.inventory?.imei2 || null,
          quantity: 1,
          unitPrice: Number(item.sale_price || 0),
          totalPrice: Number(item.sale_price || 0),
          warrantyMonths: Number(sale?.warranty_months || 0),
          type: item.type === "free" ? "free" as const : "upsell" as const,
        }))
      ]

      const additionalItemsSummary = additionalItems.length
        ? additionalItems.map((item: any) => `${getAdditionalItemDisplayName(item.name)}${item.type === "free" ? " (brinde)" : ""}`).join(", ")
        : null

      await generateReceiptPDF({
        saleId: sale?.id || id,
        saleDate: sale?.sale_date,
        customerName: customer?.full_name || "Cliente",
        customerCpf: customer?.cpf || null,
        customerPhone: customer?.phone || null,
        paymentMethod: paymentLabel(),
        saleNotes: sale?.notes || product?.condition_notes || null,
        additionalItems: additionalItemsSummary,
        item: {
          name: mainProductName,
          imei: product?.imei || null,
          imei2: product?.imei2 || null,
          quantity: 1,
          unitPrice: officialMainUnit,
          totalPrice: officialMainTotal,
          warrantyMonths: Number(sale?.warranty_months || 0),
        },
        receiptItems: receiptLines,
        receiptSummary: {
          officialProductTotal: officialMainTotal + totals.valorAdicionais,
          saleTotal: totals.valorTotal,
          discountAmount,
          tradeInName: tradeInDisplayName || null,
          tradeInGrade: tradeInGrade || null,
          tradeInValue: tradeInValueForSale,
          cashAmountDue: saleEconomics.storeCashReceives,
          customerPaid: saleEconomics.customerCashPays,
          embeddedFee: saleEconomics.embeddedFee,
          storeReceives: saleEconomics.storeCashReceives,
        },
      })
      toast({ title: "Recibo gerado!", type: "success" })
    } catch (err) {
      console.error("Erro ao gerar recibo:", err)
      toast({ title: "Erro ao gerar recibo", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  /** Generate warranty PDF for a specific item (main product or additional) */
  const handleDownloadItemWarrantyPDF = async (itemProduct: any, itemName: string, warrantyMonths: number) => {
    if (generating) return

    setGenerating(`warranty-${itemProduct?.id || itemName}`)
    try {
      const itemCatalog = itemProduct?.catalog || {}
      const productName = itemName || `${itemCatalog.model || "Aparelho"}${itemCatalog.variant ? ` ${itemCatalog.variant}` : ""}${itemCatalog.storage ? ` ${itemCatalog.storage}` : ""}${itemCatalog.color ? ` ${itemCatalog.color}` : ""}`.trim()
      await generateWarrantyTermDocument({
        saleId: sale?.id || id,
        saleDate: sale?.sale_date,
        customerName: customer?.full_name || "Cliente",
        customerCpf: customer?.cpf || null,
        customerPhone: customer?.phone || null,
        paymentMethod: paymentLabel(),
        saleNotes: sale?.notes || null,
        additionalItems: null,
        item: {
          name: productName,
          imei: itemProduct?.imei || null,
          imei2: itemProduct?.imei2 || null,
          quantity: 1,
          unitPrice: Number(sale?.sale_price || 0),
          totalPrice: Number(sale?.sale_price || 0),
          warrantyMonths,
        },
      })
      toast({ title: "Termo de garantia gerado!", type: "success" })
    } catch (err) {
      toast({ title: "Erro ao gerar termo", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  const generatePDF = async (type: "warranty" | "report") => {
    setGenerating(type)
    try {
      const doc = new jsPDF()
      const W = 210
      const M = 18
      const pageW = W - M * 2
      let y = 15

      const addPage = () => { doc.addPage(); y = 15 }

      const logoUrl = `${window.location.origin}/logo-nobretech.png`
      let logoB64: string | null = null
      try {
        const resp = await fetch(logoUrl)
        const arr = await resp.arrayBuffer()
        logoB64 = btoa(String.fromCharCode(...new Uint8Array(arr)))
      } catch { /* logo not available */ }

      const drawHeader = (title: string) => {
        y = 15
        if (logoB64) {
          try { doc.addImage(logoB64, "PNG", M, y, 35, 12) } catch { /* fallback */ }
        } else {
          doc.setFontSize(12)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 82, 167)
          doc.text("NOBRETECH", W / 2, y + 7, { align: "center" })
          doc.setTextColor(30, 30, 30)
        }
        y += 16
        doc.setFontSize(16)
        doc.setFont("helvetica", "bold")
        doc.text(title, W / 2, y, { align: "center" })
        y += 3
        doc.setDrawColor(0, 82, 167)
        doc.setLineWidth(0.7)
        doc.line(M, y, W - M, y)
        y += 8
      }

      const drawSection = (title: string) => {
        y += 4
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 82, 167)
        doc.text(title, M, y)
        y += 2
        doc.setDrawColor(200, 210, 220)
        doc.setLineWidth(0.3)
        doc.line(M, y, W - M, y)
        y += 7
        doc.setTextColor(30, 30, 30)
      }

      const drawRow = (label: string, value: string, bold = true) => {
        if (y > 270) { addPage() }
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(120, 120, 120)
        doc.text(label, M + 4, y)
        doc.setTextColor(30, 30, 30)
        if (bold) doc.setFont("helvetica", "bold")
        else doc.setFont("helvetica", "normal")
        doc.text(value, M + 60, y)
        y += 6
      }

      if (type === "report") {
        drawHeader("Laudo de Inspeção Técnica")

        const catalog = product?.catalog || {}
        const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()

        drawSection("Dados do Aparelho")
        drawRow("Produto:", fullModel)
        drawRow("Categoria:", catalog.category || "—")
        drawRow("Grade:", product?.grade || "—")
        drawRow("IMEI:", product?.imei || "—")
        if (product?.imei2) drawRow("IMEI 2:", product.imei2)
        drawRow("Nº de Série:", product?.serial_number || "—")
        drawRow("Versão iOS:", product?.ios_version || "—")
        drawRow("Bateria:", product?.battery_health ? `${product.battery_health}%` : "—")
        if (product?.condition_notes) drawRow("Observações:", product.condition_notes, false)

        drawSection("Dados da Venda")
        drawRow("Cliente:", customer?.full_name || "—")
        drawRow("CPF:", customer?.cpf || "—")
        drawRow("Preço:", formatBRL(sale?.sale_price))
        drawRow("Pagamento:", paymentLabel())
        drawRow("Data:", formatDate(sale?.sale_date))

        if (checklist.length > 0) {
          drawSection("Checklist de Inspeção")

          for (const item of checklist) {
            if (y > 265) { addPage() }
            const label = checklistLabels[item.id] || item.label || item.id
            const statusLabel = item.status === "ok" ? "OK" : item.status === "fail" ? "FALHA" : item.status === "na" ? "N/A" : "—"
            const statusColor = item.status === "ok" ? [34, 197, 94] : item.status === "fail" ? [239, 68, 68] : item.status === "na" ? [107, 114, 128] : [200, 200, 200]
            const bgCol = item.status === "ok" ? [240, 253, 244] : item.status === "fail" ? [254, 242, 242] : item.status === "na" ? [249, 250, 251] : [255, 255, 255]

            doc.setFillColor(bgCol[0], bgCol[1], bgCol[2])
            doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setLineWidth(0.2)
            const rowH = item.note ? 14 : 9
            doc.roundedRect(M, y, pageW, rowH, 1, 1, "FD")

            doc.setFontSize(8)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(30, 30, 30)
            doc.text(label.substring(0, 80), M + 3, y + 5)

            const badgeX = W - M - 25
            doc.setFillColor(statusColor[0], statusColor[1], statusColor[2])
            const badgeW = 22
            doc.roundedRect(badgeX - 2, y + 1.5, badgeW, 5.5, 1, 1, "F")
            doc.setTextColor(255, 255, 255)
            doc.setFont("helvetica", "bold")
            doc.text(statusLabel, badgeX + 4, y + 5.3, { align: "center" })

            if (item.note) {
              doc.setTextColor(180, 30, 30)
              doc.setFont("helvetica", "italic")
              doc.setFontSize(7.5)
              const noteLines = doc.splitTextToSize(item.note, pageW - 20)
              doc.text(noteLines[0], M + 3, y + 11)
            }

            y += rowH + 2
          }

          y += 4
          const okCount = checklist.filter((i: any) => i.status === "ok").length
          const failCount = checklist.filter((i: any) => i.status === "fail").length
          const total = checklist.length
          const pct = total > 0 ? Math.round((okCount / total) * 100) : 0

          drawRow("Aprovados:", `${okCount} de ${total} (${pct}%)`)
          drawRow("Falhas:", `${failCount}`)
        }

        y += 10
        if (y > 240) addPage()
        drawSection("Responsável Técnico")
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.line(M + 10, y + 12, M + 70, y + 12)
        doc.text("NobreTech Store", M + 10, y + 17)

        doc.line(W - M - 60, y + 12, W - M - 20, y + 12)
        doc.text(customer?.full_name || "Cliente", W / 2 + 10, y + 17, { align: "center" })

        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, M, 285)

        doc.save(`Laudo_Inspecao_${customer?.full_name || "cliente"}.pdf`)
      }

      if (type === "warranty") {
        drawHeader("Certificado de Garantia")

        const catalog = product?.catalog || {}
        const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()

        y += 4
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(140, 140, 140)
        doc.text(`Nº da Garantia: ${id}`, W / 2, y, { align: "center" })
        y += 10

        drawSection("Aparelho Coberto")
        drawRow("Produto:", fullModel)
        drawRow("Grade:", product?.grade || "—")
        drawRow("IMEI:", product?.imei || "—")
        drawRow("Bateria:", product?.battery_health ? `${product.battery_health}%` : "—")

        y += 4
        drawSection("Proprietário")
        drawRow("Nome:", customer?.full_name || "—")
        drawRow("CPF:", customer?.cpf || "—")
        if (customer?.phone) drawRow("Telefone:", customer.phone)

        y += 4
        drawSection("Período de Cobertura")
        drawRow("Início:", formatDate(sale?.warranty_start))
        drawRow("Término:", formatDate(sale?.warranty_end))
        drawRow("Duração:", `${sale?.warranty_months} meses`)

        y += 6
        drawSection("O que está coberto")

        const coveredItems = [
          "Defeitos internos de funcionamento (placa, chipset, componentes)",
          "Problemas de software e sistema operacional",
          "Funcionamento anormal da bateria (degradação excessiva)",
          "Defeitos em botões, conectores e sensores internos",
          "Problemas de conectividade (Wi-Fi, Bluetooth, NFC) sem causa externa",
          "Falhas de tela (manchas, linhas, toque fantasma) sem dano físico",
        ]

        for (const item of coveredItems) {
          if (y > 270) { addPage() }
          doc.setFillColor(240, 253, 244)
          doc.roundedRect(M, y, pageW, 7, 1, 1, "F")
          doc.setFontSize(9)
          doc.setTextColor(34, 130, 66)
          doc.setFont("helvetica", "bold")
          doc.text("✓", M + 3, y + 5)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(30, 60, 30)
          doc.text(item, M + 10, y + 5)
          y += 9
        }

        y += 4
        drawSection("O que NÃO está coberto")

        const notCoveredItems = [
          "Danos físicos: quedas, amassados, trincas ou riscos na tela/carcaça",
          "Danos por líquidos: oxidação, contato com água ou outros líquidos",
          "Uso inadequado: exposição a calor excessivo, umidade extrema",
          "Aparelho com jailbreak, rooting ou software modificado",
          "Desgaste natural de bateria abaixo de 80% por uso prolongado",
          "Acesso técnico por terceiros não autorizados pela NobreTech",
          "Perda, roubo ou furto do aparelho",
          "Danos causados por acessórios não originais",
        ]

        for (const item of notCoveredItems) {
          if (y > 270) { addPage() }
          doc.setFillColor(254, 242, 242)
          doc.roundedRect(M, y, pageW, 7, 1, 1, "F")
          doc.setFontSize(9)
          doc.setTextColor(200, 40, 40)
          doc.setFont("helvetica", "bold")
          doc.text("✕", M + 3, y + 5)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(80, 30, 30)
          doc.text(item, M + 10, y + 5)
          y += 9
        }

        addPage()
        drawHeader("Certificado de Garantia — Cuidados")

        y += 5
        doc.setFontSize(13)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 82, 167)
        doc.text("Dicas de Cuidado com seu Aparelho", W / 2, y, { align: "center" })
        y += 8

        const careTips = [
          { title: "Bateria", tips: ["Mantenha a carga entre 20% e 80%", "Evite carregadores não certificados", "Não use enquanto carrega"] },
          { title: "Tela e Display", tips: ["Use película de vidro", "Limpe com microfibra", "Evite pressão excessiva"] },
        ]

        for (const section of careTips) {
          if (y > 230) { addPage(); drawHeader("Certificado de Garantia — Cuidados") }
          doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(section.title, M, y); y += 6
          for (const tip of section.tips) { doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.text(`• ${tip}`, M + 2, y); y += 5 }
          y += 3
        }

        y += 6
        drawSection("Termos e Condições")
        const terms = ["1. Certificado pessoal e intransferível.", "2. Apresente este termo para acionar garantia."]
        for (const t of terms) { doc.setFontSize(8); doc.text(t, M + 3, y); y += 5 }

        y += 12
        doc.line(M + 10, y, M + 75, y); doc.text("NobreTech Store", M + 10, y + 5)
        doc.line(W - M - 70, y, W - M - 20, y); doc.text(customer?.full_name || "Cliente", W / 2 + 5, y + 5, { align: "center" })

        doc.save(`Certificado_Garantia_${customer?.full_name || "cliente"}.pdf`)
      }

      toast({ title: "Arquivo gerado!", type: "success" })
    } catch (err) {
      toast({ title: "Erro ao gerar PDF", type: "error" })
    } finally {
      setGenerating(null)
    }
  }

  const logAudit = async (action: string, oldData: any, newData: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    await (supabase.from("audit_logs") as any).insert({
      company_id: sale.company_id,
      user_id: user?.id,
      table_name: "sales",
      record_id: id,
      action,
      old_data: oldData,
      new_data: newData
    })
    const { data: logs } = await (supabase.from("audit_logs") as any).select("*").eq("table_name", "sales").eq("record_id", id).order("created_at", { ascending: false })
    if (logs) setAuditLogs(logs)
  }

  const handleUpdateDate = async () => {
    if (!editDate) return
    setIsSubmitting(true)
    try {
      const oldDate = sale.sale_date
      await (supabase.from("sales") as any).update({ sale_date: editDate }).eq("id", id)
      await logAudit("UPDATE_DATE", { sale_date: oldDate }, { sale_date: editDate })
      setSale({ ...sale, sale_date: editDate })
      toast({ title: "Data atualizada com sucesso", type: "success" })
    } catch (e) {
      toast({ title: "Erro ao atualizar data", type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEditModal = () => {
    const currentOrigin = sale.sale_origin || "unknown"
    setEditDate(sale.sale_date)
    setEditSaleOrigin(currentOrigin)
    setEditMarketingCampaignId(currentOrigin === "trafego_pago" ? sale.marketing_campaign_id || "" : "")
    setEditLeadNotes(sale.lead_notes || "")
    setIsEditModalOpen(true)
  }

  const handleUpdateMarketingAttribution = async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        sale_origin: editSaleOrigin || "unknown",
        marketing_campaign_id: editSaleOrigin === "trafego_pago" && editMarketingCampaignId ? editMarketingCampaignId : null,
        lead_notes: editLeadNotes.trim() || null,
      }
      const oldData = {
        sale_origin: sale.sale_origin,
        marketing_campaign_id: sale.marketing_campaign_id,
        lead_notes: sale.lead_notes,
      }

      const { error } = await supabase.from("sales").update(payload).eq("id", id)
      if (error) throw error

      await logAudit("UPDATE_MARKETING_ATTRIBUTION", oldData, payload)
      setSale({ ...sale, ...payload })
      toast({ title: "Origem do cliente atualizada", type: "success" })
    } catch (e) {
      toast({ title: "Erro ao atualizar origem", description: e instanceof Error ? e.message : "Não foi possível salvar a origem do cliente.", type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdatePackaging = async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        packaging_type: editPackagingType || null,
        packaging_notes: editPackagingType === "other" ? editPackagingNotes.trim() || null : null,
      }
      const oldData = {
        packaging_type: sale.packaging_type,
        packaging_notes: sale.packaging_notes,
      }

      const { error } = await (supabase.from("sales") as any).update(payload).eq("id", id)
      if (error) throw error

      await logAudit("UPDATE_PACKAGING", oldData, payload)
      setSale({ ...sale, ...payload })
      toast({ title: "Tipo de embalagem atualizado", type: "success" })
    } catch (e) {
      toast({ title: "Erro ao atualizar embalagem", description: e instanceof Error ? e.message : "Não foi possível salvar o tipo de embalagem.", type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddItem = async () => {
    if (!newItemName && !selectedInventoryItemId) {
      toast({ title: "Informe o nome ou selecione um item", type: "error" })
      return
    }
    setIsSubmitting(true)
    try {
      const price = parseFloat(newItemSalePrice) || 0
      const cost = parseFloat(newItemCost) || 0
      let finalName = newItemName

      if (selectedInventoryItemId) {
        const invItem = inventoryItems.find((i) => i.id === selectedInventoryItemId)
        if (invItem) finalName = getProductName(invItem)
      }

      const { data: newItem, error } = await (supabase.from("sales_additional_items") as any).insert({
        company_id: sale.company_id,
        sale_id: id,
        product_id: selectedInventoryItemId || null,
        type: newItemType,
        name: finalName,
        cost_price: cost,
        sale_price: price
      }).select("*, inventory:product_id(id, imei, imei2, serial_number, grade, catalog:catalog_id(*))").single()

      if (error) throw error

      if (selectedInventoryItemId) {
        await (supabase.from("inventory") as any).update({ status: "sold" }).eq("id", selectedInventoryItemId)
      }

      const newTotal = Number(sale.sale_price || 0) + price
      await (supabase.from("sales") as any).update({ sale_price: newTotal }).eq("id", id)
      setSale({ ...sale, sale_price: newTotal })
      setAdditionalItems([...additionalItems, newItem])

      const imeiLog = newItem.inventory?.imei || newItem.inventory?.serial_number
      await logAudit("ADD_ITEM", null, { item: finalName, price, type: newItemType, imei: imeiLog })

      setNewItemName("")
      setSelectedInventoryItemId("")
      setNewItemCost("")
      setNewItemSalePrice("")
      toast({ title: "Item adicionado com sucesso", type: "success" })
    } catch (e: any) {
      console.error("ERRO AO ADICIONAR ITEM:", e)
      toast({ title: "Erro ao adicionar item", description: e.message || String(e), type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveItem = async (item: any) => {
    if (!confirm("Deseja realmente remover este item da venda? Ele voltará para o estoque se aplicável.")) return
    setIsSubmitting(true)
    try {
      await (supabase.from("sales_additional_items") as any).delete().eq("id", item.id)

      if (item.product_id) {
        await (supabase.from("inventory") as any).update({ status: "in_stock" }).eq("id", item.product_id)
      }

      const newTotal = Number(sale.sale_price || 0) - (Number(item.sale_price) || 0)
      await (supabase.from("sales") as any).update({ sale_price: newTotal }).eq("id", id)

      setSale({ ...sale, sale_price: newTotal })
      setAdditionalItems(additionalItems.filter((i) => i.id !== item.id))

      await logAudit("REMOVE_ITEM", { item: item.name, price: item.sale_price, type: item.type }, null)
      toast({ title: "Item removido com sucesso", type: "success" })
    } catch (e) {
      toast({ title: "Erro ao remover item", type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSale = async () => {
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: saleTransactions, error: txError } = await (supabase.from("transactions") as any)
        .select("id, status")
        .eq("source_type", "sale")
        .eq("source_id", id)
        .neq("status", "cancelled")
      if (txError) throw txError

      if ((saleTransactions || []).length > 0) {
        const { error } = await (supabase.from("transactions") as any)
          .update({ status: "cancelled", account_id: null, reconciled_at: null })
          .eq("source_type", "sale")
          .eq("source_id", id)
          .neq("status", "cancelled")
        if (error) throw error
      }

      for (const transaction of saleTransactions || []) {
        await requestSyncTransactionMovement(String(transaction.id), {
          createdBy: user?.id ?? null,
        })
      }

      // Revert main product inventory
      if (sale.inventory_id) {
        const { error } = await (supabase.from("inventory") as any)
          .update({ status: "in_stock" })
          .eq("id", sale.inventory_id)
        if (error) throw error
      }

      // Revert additional items
      for (const item of additionalItems) {
        if (item.product_id) {
          const { error } = await (supabase.from("inventory") as any)
            .update({ status: "in_stock" })
            .eq("id", item.product_id)
          if (error) throw error
        }
      }

      const { error: saleError } = await (supabase.from("sales") as any)
        .update({ sale_status: "cancelled" })
        .eq("id", id)
      if (saleError) throw saleError

      await logAudit("updated", { sale_status: sale.sale_status || "completed" }, { sale_status: "cancelled" })

      toast({ title: "Venda cancelada com segurança", description: "Histórico preservado e recebimentos conciliados estornados quando necessário.", type: "success" })
      router.replace("/vendas")
    } catch (e: any) {
      toast({ title: "Erro ao cancelar venda", description: e?.message || "Não foi possível cancelar a venda com segurança.", type: "error" })
      setIsSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Carregando...</p></div>
  if (!sale) return null

  const catalog = product?.catalog || {}
  const fullModel = `${catalog.model || "—"}${catalog.variant ? " " + catalog.variant : ""} ${catalog.storage || ""} ${catalog.color || ""}`.trim()
  const okCount = checklist.filter((i: any) => i.status === "ok").length
  const failCount = checklist.filter((i: any) => i.status === "fail").length
  const labelCustomerName = (customer?.full_name || "Cliente").split(/\s+/)[0]
  const labelData = {
    store: "Nobretech Store",
    saleNumber: `Compra NT-${String(sale?.id || id).slice(0, 8).toUpperCase()}`,
    customer: labelCustomerName,
    product: fullModel || "Aparelho",
    color: catalog?.color || "Não informado",
    grade: product?.grade || "Não informado",
    batteryHealth: product?.battery_health ? `${product.battery_health}%` : "Não informado",
    packaging: packagingLabel(sale?.packaging_type, sale?.packaging_notes),
    date: sale?.sale_date ? formatDate(sale.sale_date) : "Não informado",
    pin: sale?.public_access_pin || "------",
    url: publicPurchaseUrl || "Gerar acesso para criar URL",
    warning: "Não compartilhe sua senha",
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push("/vendas")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Detalhes da Venda</h2>
            <p className="text-xs text-gray-400">ID: {id.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="green">Concluída</Badge>
          <Button variant="outline" size="sm" onClick={openEditModal} className="gap-2 shrink-0">
            <Edit className="w-4 h-4" /> <span className="hidden sm:inline">Editar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsDeleteModalOpen(true)} className="text-danger-500 border-danger-200 hover:bg-danger-50 gap-2 shrink-0">
            <Trash className="w-4 h-4" /> <span className="hidden sm:inline">Excluir</span>
          </Button>
        </div>
      </div>

      {/* ── Resumo Financeiro ── */}
      <div className="bg-gradient-to-br from-navy-900 to-royal-700 rounded-2xl p-4 sm:p-6 shadow-lg text-white">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-white/70" />
          <h3 className="font-display font-bold text-white font-syne text-sm uppercase tracking-wider">Resumo Financeiro</h3>
          <span className="ml-auto text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{totals.quantidadeTotalItens} {totals.quantidadeTotalItens === 1 ? 'item' : 'itens'}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <p className="text-xs text-white/60 mb-0.5">Valor da venda</p>
            <p className="text-xl font-bold text-white">{formatBRL(saleEconomics.storeReceives)}</p>
            {totals.valorAdicionais > 0 && (
              <p className="text-xs text-white/60 mt-0.5">
                Principal {formatBRL(totals.valorPrincipal)} + Adicionais {formatBRL(totals.valorAdicionais)}
              </p>
            )}
            {discountAmount > 0 && (
              <p className="mt-1 inline-flex rounded-full bg-amber-950/35 px-2 py-0.5 text-xs font-semibold text-amber-100">
                Desconto {formatBRL(discountAmount)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-white/60 mb-0.5">Cliente paga</p>
            <p className="text-xl font-bold text-white">{formatBRL(saleEconomics.customerCashPays)}</p>
            {saleEconomics.embeddedFee > 0 && (
              <p className="text-xs text-white/60 mt-0.5">Taxa embutida {formatBRL(saleEconomics.embeddedFee)}</p>
            )}
            {saleEconomics.tradeInCredit > 0 && (
              <p className="text-xs text-white/60 mt-0.5">Total negociado {formatBRL(saleEconomics.customerTotalPays)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-white/60 mb-0.5">Loja recebe</p>
            <p className="text-xl font-bold text-white">{formatBRL(saleEconomics.storeCashReceives)}</p>
            <p className="text-xs text-white/60 mt-0.5">Caixa líquido após trade-in/taxa</p>
          </div>
          <div>
            <p className="text-xs text-white/60 mb-0.5">Lucro real</p>
            <p className={`text-xl font-bold ${saleEconomics.grossProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {saleEconomics.grossProfit >= 0 ? '+' : ''}{formatBRL(saleEconomics.grossProfit)}
            </p>
            <p className="text-xs text-white/60 mt-0.5">Custo total {formatBRL(saleEconomics.costTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-white/60 mb-0.5">Margem real</p>
            <p className={`text-xl font-bold ${saleEconomics.realMarginPct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {saleEconomics.realMarginPct.toFixed(1)}%
            </p>
            <p className="text-xs text-white/60 mt-0.5">{formatDate(sale?.sale_date)}</p>
          </div>
        </div>
        {tradeInData && (
          <div className="mt-4 rounded-2xl border border-white/15 bg-navy-950/25 p-3 shadow-inner">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Aparelho recebido no trade-in</p>
                <p className="text-sm font-bold text-white mt-0.5">
                  {tradeInDisplayName}
                  {tradeInGrade ? ` · Classe ${tradeInGrade}` : ""}
                </p>
              </div>
              <div className="md:text-right">
                <p className="text-xs text-white/60">Crédito concedido</p>
                <p className="mt-1 inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-sm font-bold text-amber-100">
                  -{formatBRL(tradeInValueForSale)}
                </p>
              </div>
              <div className="md:text-right">
                <p className="text-xs text-white/60">Saldo antes da taxa</p>
                <p className="text-sm font-bold text-white">{formatBRL(saleEconomics.storeCashReceives)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/60">
              O trade-in entra como bem recebido no estoque e reduz o valor em dinheiro que o cliente precisa pagar nesta venda.
            </p>
          </div>
        )}
        {saleEconomics.riskReserve > 0 && (
          <div className="mt-4 rounded-2xl border border-white/15 bg-navy-950/25 p-3 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Reserva técnica informativa</p>
              <p className="inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-sm font-bold text-amber-100">
                {formatBRL(saleEconomics.riskReserve)}
              </p>
            </div>
            <p className="mt-1 text-xs text-white/65">
              Estimativa para garantia/defeito. Não muda caixa nem DRE; serve para enxergar o lucro conservador de {formatBRL(saleEconomics.conservativeProfit)}.
            </p>
          </div>
        )}
      </div>

      {isCompletedSale && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-100 text-royal-600">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display font-bold text-navy-900 font-syne">Compra Verificada</h3>
                  <Badge variant={sale?.public_access_enabled === false ? "gray" : "green"} dot>
                    {sale?.public_access_enabled === false ? "Inativo" : "Ativo"}
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Link exclusivo para o cliente consultar os dados desta compra, garantia e acompanhamento técnico.
                </p>
              </div>
            </div>

            {!sale?.public_access_token || !sale?.public_access_pin ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => refreshPublicAccess("ensure")}
                isLoading={publicAccessLoading === "ensure"}
                className="shrink-0"
              >
                <ShieldCheck className="h-4 w-4" />
                Gerar acesso da compra
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(publicPurchaseUrl, "_blank", "noopener,noreferrer")}
                className="shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir portal
              </Button>
            )}
          </div>

          {sale?.public_access_token && sale?.public_access_pin && (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_0.6fr_0.9fr]">
                <div className="rounded-xl bg-surface p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-gray-400">URL pública</p>
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-navy-900">{publicPurchaseUrl}</p>
                    <Button variant="ghost" size="icon" title="Copiar URL" onClick={() => copyToClipboard(publicPurchaseUrl, "URL")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl bg-royal-50 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-royal-500">PIN do cliente</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-2xl font-bold tracking-[0.24em] text-navy-900">{sale.public_access_pin}</p>
                    <Button variant="ghost" size="icon" title="Copiar PIN" onClick={() => copyToClipboard(sale.public_access_pin, "PIN")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl bg-surface p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-gray-400">Último acesso</p>
                  <p className="text-sm font-semibold text-navy-900">
                    {sale.public_access_last_viewed_at ? formatDate(sale.public_access_last_viewed_at) : "Ainda não acessado"}
                  </p>
                  {Number(sale.public_access_failed_attempts || 0) > 0 && (
                    <p className="mt-1 text-xs text-amber-700">{sale.public_access_failed_attempts} tentativa(s) incorreta(s)</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="rounded-xl border border-dashed border-royal-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-royal-600" />
                    <p className="text-sm font-bold text-navy-900">Dados preparados para etiqueta térmica</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
                    <p><span className="font-semibold text-navy-900">Loja:</span> {labelData.store}</p>
                    <p><span className="font-semibold text-navy-900">Compra:</span> {labelData.saleNumber}</p>
                    <p><span className="font-semibold text-navy-900">Cliente:</span> {labelData.customer}</p>
                    <p><span className="font-semibold text-navy-900">Produto:</span> {labelData.product}</p>
                    <p><span className="font-semibold text-navy-900">Cor:</span> {labelData.color}</p>
                    <p><span className="font-semibold text-navy-900">Estado:</span> {labelData.grade}</p>
                    <p><span className="font-semibold text-navy-900">Saúde:</span> {labelData.batteryHealth}</p>
                    <p><span className="font-semibold text-navy-900">Embalagem:</span> {labelData.packaging}</p>
                    <p><span className="font-semibold text-navy-900">Data:</span> {labelData.date}</p>
                  </div>
                  <p className="mt-3 text-xs font-medium text-gray-500">Entregue este código apenas ao cliente da compra. {labelData.warning}.</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshPublicAccess("regenerate_pin")}
                  isLoading={publicAccessLoading === "regenerate_pin"}
                  className="shrink-0"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Regenerar PIN
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Aparelho Principal ── */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><ShoppingCart className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Aparelho</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Modelo</p>
            <p className="text-sm font-semibold text-navy-900">{fullModel}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">IMEI</p>
            <p className="text-sm font-mono text-navy-900">{product?.imei || "—"}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Grade</p>
            <p className="text-sm font-semibold text-navy-900">{product?.grade || "—"}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Custo / Venda</p>
            <p className="text-sm font-bold text-navy-900">{formatBRL(totals.valorPrincipal)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Custo: {formatBRL(totals.custoPrincipal)}</p>
            {discountAmount > 0 && (
              <p className="text-xs text-amber-700 mt-0.5">
                Tabela {formatBRL(suggestedMainValue)} · desconto {formatBRL(discountAmount)}
              </p>
            )}
            {sale?.source_type === "supplier" && (
              <p className="text-xs text-gray-500">{sale?.supplier_name ? `Forn.: ${sale.supplier_name}` : "Fornecedor"}</p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pós-venda</p>
              <h4 className="text-sm font-bold text-navy-900">Tipo de embalagem entregue</h4>
              <p className="mt-1 text-xs text-gray-500">
                Aparece no portal público e nos dados preparados para etiqueta.
              </p>
            </div>
            <div className="grid w-full gap-3 lg:w-auto lg:min-w-[520px] lg:grid-cols-[210px_1fr_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-sm font-medium text-navy-900">Tipo</label>
                <select
                  value={editPackagingType}
                  onChange={(event) => {
                    setEditPackagingType(event.target.value)
                    if (event.target.value !== "other") setEditPackagingNotes("")
                  }}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                >
                  {PACKAGING_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Observação"
                placeholder={editPackagingType === "other" ? "Descreva a embalagem entregue" : "Disponível para Outro"}
                value={editPackagingNotes}
                onChange={(event) => setEditPackagingNotes(event.target.value)}
                disabled={editPackagingType !== "other"}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdatePackaging}
                isLoading={isSubmitting}
                className="h-11"
              >
                Salvar
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Atual: <span className="font-semibold text-navy-900">{packagingLabel(sale?.packaging_type, sale?.packaging_notes)}</span>
          </p>
        </div>
      </div>

      {tradeInData && (() => {
        const inventoryStatus = tradeInInventory?.status || "pending"
        const statusMeta = getInventoryStatusMeta(inventoryStatus)
        const tradeInLabel = getTradeInSummaryStatus(inventoryStatus)

        return (
          <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display font-bold text-navy-900 font-syne">Aparelho recebido no trade-in</h3>
              <Badge variant={statusMeta.badge} dot>{tradeInLabel}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-surface rounded-xl p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Nome</p>
                <p className="text-sm font-semibold text-navy-900">{tradeInDisplayName}</p>
              </div>
              <div className="bg-surface rounded-xl p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Classe</p>
                <p className="text-sm font-semibold text-navy-900">{tradeInGrade || "—"}</p>
              </div>
              <div className="bg-surface rounded-xl p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Valor atribuído</p>
                <p className="text-sm font-semibold text-navy-900">{formatBRL(Number(tradeInData.trade_in_value || 0))}</p>
              </div>
              <div className="bg-surface rounded-xl p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Status</p>
                <p className="text-sm font-semibold text-navy-900">{tradeInLabel}</p>
              </div>
            </div>

            {isPendingInventoryStatus(inventoryStatus) && tradeInInventory?.id && (
              <div className="mt-3 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => router.push(`/estoque/${tradeInInventory.id}/editar`)}>
                  Finalizar cadastro
                </Button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Itens da Venda (principal + adicionais unificados) ── */}
      {additionalItems.length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 p-4 sm:p-6 pb-3">
            <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><CreditCard className="w-4 h-4 text-royal-500" /></div>
            <h3 className="font-display font-bold text-navy-900 font-syne">Itens da Venda</h3>
            <span className="ml-auto text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">{totals.quantidadeTotalItens} itens</span>
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-gray-100 bg-gray-50/60">
                  <th className="text-left px-6 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Produto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">IMEI / Série</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Custo</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Venda</th>
                  <th className="text-right px-6 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Principal */}
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3"><span className="text-[11px] font-bold bg-royal-100 text-royal-600 px-2 py-0.5 rounded-full">PRINCIPAL</span></td>
                  <td className="px-4 py-3 font-medium text-navy-900">{fullModel}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{product?.imei || product?.serial_number || "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatBRL(totals.custoPrincipal)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-navy-900">{formatBRL(totals.valorPrincipal)}</td>
                  <td className={`px-6 py-3 text-right font-bold ${totals.lucroPrincipal >= 0 ? 'text-success-600' : 'text-danger-500'}`}>
                    {totals.lucroPrincipal >= 0 ? '+' : ''}{formatBRL(totals.lucroPrincipal)}
                  </td>
                </tr>
                {/* Additional items */}
                {additionalItems.map((item: any) => {
                  const isUpsell = item.type === "upsell"
                  const cost = Number(item.cost_price || 0)
                  const saleP = Number(item.sale_price || 0)
                  const profit = Number(item.profit ?? (isUpsell ? saleP - cost : -cost))
                  const imei = item.inventory?.imei || item.inventory?.serial_number || "—"
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isUpsell ? 'bg-success-100 text-success-600' : 'bg-amber-100 text-amber-600'}`}>
                          {isUpsell ? 'UPSELL' : 'BRINDE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-navy-900">{getAdditionalItemDisplayName(item.name)}</td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-xs">{imei}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatBRL(cost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-900">{isUpsell ? formatBRL(saleP) : <span className="text-gray-400">—</span>}</td>
                      <td className={`px-6 py-3 text-right font-bold ${profit >= 0 ? 'text-success-600' : 'text-danger-500'}`}>
                        {profit >= 0 ? '+' : ''}{formatBRL(profit)}
                      </td>
                    </tr>
                  )
                })}
                {/* Total row */}
                <tr className="bg-navy-900/3 border-t-2 border-gray-200">
                  <td colSpan={3} className="px-6 py-3 font-bold text-navy-900 text-sm">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{formatBRL(totals.custoTotal)}</td>
                  <td className="px-4 py-3 text-right font-bold text-navy-900">{formatBRL(totals.valorTotal)}</td>
                  <td className={`px-6 py-3 text-right font-bold text-base ${totals.lucroTotal >= 0 ? 'text-success-600' : 'text-danger-500'}`}>
                    {totals.lucroTotal >= 0 ? '+' : ''}{formatBRL(totals.lucroTotal)}
                    <span className="text-xs font-normal text-gray-400 ml-1">({totals.margemTotal.toFixed(1)}%)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden p-4 space-y-2">
            <div className="rounded-xl bg-royal-50 border border-royal-100 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold bg-royal-100 text-royal-600 px-2 py-0.5 rounded-full">PRINCIPAL</span>
                <p className="text-sm font-semibold text-navy-900 flex-1 truncate">{fullModel}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Custo: {formatBRL(totals.custoPrincipal)} · Venda: {formatBRL(totals.valorPrincipal)}</span>
                <span className={`font-bold ${totals.lucroPrincipal >= 0 ? 'text-success-600' : 'text-danger-500'}`}>{totals.lucroPrincipal >= 0 ? '+' : ''}{formatBRL(totals.lucroPrincipal)}</span>
              </div>
            </div>
            {additionalItems.map((item: any) => {
              const isUpsell = item.type === "upsell"
              const cost = Number(item.cost_price || 0)
              const saleP = Number(item.sale_price || 0)
              const profit = Number(item.profit ?? (isUpsell ? saleP - cost : -cost))
              return (
                <div key={item.id} className={`rounded-xl p-3 border ${isUpsell ? 'bg-success-50 border-success-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isUpsell ? 'bg-success-100 text-success-600' : 'bg-amber-100 text-amber-600'}`}>{isUpsell ? 'UPSELL' : 'BRINDE'}</span>
                    <p className="text-sm font-semibold text-navy-900 flex-1 truncate">{getAdditionalItemDisplayName(item.name)}</p>
                  </div>
                  <div className="text-xs text-gray-400 mb-1">
                    {item.inventory?.imei || item.inventory?.serial_number ? `IMEI/Série: ${item.inventory.imei || item.inventory.serial_number}` : "Sem vínculo de IMEI"}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Custo: {formatBRL(cost)}{isUpsell ? ` · Venda: ${formatBRL(saleP)}` : ''}</span>
                    <span className={`font-bold ${profit >= 0 ? 'text-success-600' : 'text-danger-500'}`}>{profit >= 0 ? '+' : ''}{formatBRL(profit)}</span>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-sm">
              <span className="font-bold text-navy-900">Total</span>
              <div className="text-right">
                <p className="font-bold text-navy-900">{formatBRL(totals.valorTotal)}</p>
                <p className={`text-xs font-bold ${totals.lucroTotal >= 0 ? 'text-success-600' : 'text-danger-500'}`}>{totals.lucroTotal >= 0 ? '+' : ''}{formatBRL(totals.lucroTotal)} · {totals.margemTotal.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><User className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Cliente</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm font-semibold text-navy-900">{customer?.full_name || "—"}</p>
            <p className="text-xs text-gray-500">{customer?.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">CPF: {customer?.cpf || "—"}</p>
            <p className="text-xs text-gray-500">{customer?.email || "—"}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Origem do cliente</p>
            <p className="text-sm font-semibold text-navy-900">{saleOriginLabel(sale.sale_origin)}</p>
            {sale.marketing_campaign_id && (
              <p className="text-xs text-gray-500 mt-0.5">
                {marketingCampaigns.find((campaign) => campaign.id === sale.marketing_campaign_id)?.name || "Campanha vinculada"}
              </p>
            )}
            {sale.lead_notes && <p className="text-xs text-gray-500 mt-0.5">{sale.lead_notes}</p>}
          </div>
        </div>
      </div>

      {/* Checklist Section (Copied from Inventory) */}
      {checklist.length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 sm:p-6 pb-3">
            <div>
              <h3 className="font-display font-bold text-navy-900 font-syne">
                Laudo de Inspeção
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {okCount} OK · {failCount} Falhas · {checklist.length} itens no total
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadInspectionPDF}
              isLoading={generatingPdf}
            >
              <Download className="w-4 h-4" /> Baixar PDF
            </Button>
          </div>

          <div className="px-4 sm:px-6">
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (okCount / checklist.length) >= 0.8 ? "bg-success-500" : (okCount / checklist.length) >= 0.5 ? "bg-warning-500" : "bg-danger-500"
                }`}
                style={{ width: `${(okCount / checklist.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="p-4 sm:px-6 sm:pb-5 divide-y divide-gray-50">
            {checklist.map((item, idx) => {
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
      {product?.condition_notes && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
          <h3 className="font-display font-bold text-navy-900 font-syne mb-2">Observações do Produto</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{product.condition_notes}</p>
        </div>
      )}


      {/* ── Seção A: Documentos da Venda ── */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><FileText className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Documentos da Venda</h3>
        </div>
        <button
          type="button"
          onClick={handleDownloadReceiptPDF}
          disabled={generating === "receipt"}
          className="w-full flex cursor-pointer items-center gap-4 p-4 rounded-xl border border-gray-100 bg-surface hover:border-royal-200 hover:bg-royal-50/30 transition-all text-left disabled:opacity-60 disabled:cursor-wait"
        >
          <div className="w-10 h-10 rounded-xl bg-royal-100 flex items-center justify-center shrink-0">
            {generating === "receipt" ? <Loader2 className="w-5 h-5 text-royal-500 animate-spin" /> : <Download className="w-5 h-5 text-royal-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-navy-900">Recibo da Venda</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Tabela: {formatBRL((suggestedMainValue || totals.valorPrincipal) + totals.valorAdicionais)}
              {discountAmount > 0 && ` · Desconto: ${formatBRL(discountAmount)}`}
              {tradeInValueForSale > 0 && ` · Trade-in: ${formatBRL(tradeInValueForSale)}`}
              {` · Cliente pagou: ${formatBRL(saleEconomics.customerCashPays)}`}
              {totals.quantidadeTotalItens > 1 && ` · ${totals.quantidadeTotalItens} itens`}
            </p>
          </div>
          <span className="text-xs text-royal-500 font-semibold shrink-0">Baixar PDF</span>
        </button>
      </div>

      {/* ── Seção B: Documentos por Produto ── */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Documentos por Produto</h3>
          <span className="ml-auto text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">{totals.quantidadeTotalItens} {totals.quantidadeTotalItens === 1 ? "item" : "itens"}</span>
        </div>
        <div className="space-y-3">
          {/* Produto Principal */}
          {(() => {
            const isSealed = product?.grade === "Lacrado" || product?.grade === "Novo"
            const hasChecklist = checklist.length > 0
            const warrantyMonths = Number(sale?.warranty_months || 0)
            return (
              <div className="rounded-xl border border-gray-100 bg-surface p-4 cursor-default">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-navy-900">{fullModel}</p>
                      <span className="text-[10px] font-bold bg-royal-100 text-royal-600 px-1.5 py-0.5 rounded-full">PRINCIPAL</span>
                      {isSealed && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">LACRADO</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {product?.imei ? `IMEI: ${product.imei}` : product?.serial_number ? `S/N: ${product.serial_number}` : "Sem IMEI"}
                      {product?.grade && ` · ${product.grade}`}
                      {warrantyMonths > 0 && ` · Garantia: ${warrantyMonths} mês${warrantyMonths > 1 ? "es" : ""}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDownloadInspectionPDF()
                    }}
                    disabled={generatingPdf || isSealed || !hasChecklist}
                    title={isSealed ? "Laudo não aplicável para produto lacrado" : !hasChecklist ? "Sem checklist disponível" : "Baixar laudo técnico"}
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:hover:bg-navy-900 enabled:hover:text-white enabled:hover:border-navy-900
                      border-gray-200 text-gray-600 bg-white"
                  >
                    {generatingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    {isSealed ? "Laudo N/A" : "Baixar Laudo"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDownloadItemWarrantyPDF(product, fullModel, warrantyMonths)
                    }}
                    disabled={generating?.startsWith("warranty-") || warrantyMonths === 0}
                    title={warrantyMonths === 0 ? "Sem garantia registrada" : "Baixar termo de garantia"}
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:hover:bg-success-500 enabled:hover:text-white enabled:hover:border-success-500
                      border-gray-200 text-gray-600 bg-white"
                  >
                    {generating === `warranty-${product?.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Baixar Garantia
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Itens Adicionais */}
          {additionalItems.map((item: any) => {
            const hasInventoryLink = !!item.product_id
            const invItem = item.inventory || inventoryItems.find((i: any) => i.id === item.product_id)
            const invItemGrade = invItem?.grade || ""
            const isSealed = invItemGrade === "Lacrado" || invItemGrade === "Novo"
            const isUpsell = item.type === "upsell"
            const warrantyMonths = Number(sale?.warranty_months || 0)
            const itemImei = invItem?.imei || item.imei || null
            const itemSerial = invItem?.serial_number || null
            const itemName = getAdditionalItemDisplayName(item.name)
            return (
              <div key={item.id} className="rounded-xl border border-gray-100 bg-surface p-4 cursor-default">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-navy-900">{itemName}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isUpsell ? "bg-success-100 text-success-600" : "bg-amber-100 text-amber-600"}`}>
                        {isUpsell ? "UPSELL" : "BRINDE"}
                      </span>
                      {isSealed && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">LACRADO</span>}
                      {!hasInventoryLink && <span className="text-[10px] font-bold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">MANUAL</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {itemImei ? `IMEI: ${itemImei}` : itemSerial ? `S/N: ${itemSerial}` : "Sem IMEI"}
                      {invItemGrade && ` · ${invItemGrade}`}
                      {warrantyMonths > 0 && ` · Garantia: ${warrantyMonths} mês${warrantyMonths > 1 ? "es" : ""}`}
                    </p>
                    {!hasInventoryLink && (
                      <p className="text-xs text-amber-500 mt-0.5">Documento indisponível para item manual</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={!hasInventoryLink || isSealed}
                    title={!hasInventoryLink ? "Item manual — sem laudo disponível" : isSealed ? "Laudo não aplicável para produto lacrado" : "Baixar laudo técnico"}
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:hover:bg-navy-900 enabled:hover:text-white enabled:hover:border-navy-900
                      border-gray-200 text-gray-600 bg-white"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {isSealed ? "Laudo N/A" : "Baixar Laudo"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (hasInventoryLink) handleDownloadItemWarrantyPDF(invItem, itemName, warrantyMonths)
                    }}
                    disabled={!hasInventoryLink || warrantyMonths === 0}
                    title={!hasInventoryLink ? "Item manual — sem garantia disponível" : warrantyMonths === 0 ? "Sem garantia registrada" : "Baixar termo de garantia"}
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:hover:bg-success-500 enabled:hover:text-white enabled:hover:border-success-500
                      border-gray-200 text-gray-600 bg-white"
                  >
                    {generating === `warranty-${invItem?.id || item.name}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Baixar Garantia
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* History Section */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-royal-100 flex items-center justify-center"><History className="w-4 h-4 text-royal-500" /></div>
          <h3 className="font-display font-bold text-navy-900 font-syne">Histórico de Alterações</h3>
        </div>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma alteração registrada.</p>
        ) : (
          <div className="space-y-4">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex gap-3 text-sm border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <div className="mt-0.5"><div className="w-2 h-2 rounded-full bg-royal-500" /></div>
                <div className="flex-1">
                  <p className="text-navy-900 font-medium">
                    {log.action === "UPDATE_DATE" && "Data da venda alterada"}
                    {log.action === "UPDATE_MARKETING_ATTRIBUTION" && "Origem do cliente alterada"}
                    {log.action === "ADD_ITEM" && "Item adicionado à venda"}
                    {log.action === "REMOVE_ITEM" && "Item removido da venda"}
                  </p>
                  <div className="text-gray-500 mt-1">
                    {log.action === "UPDATE_DATE" && (
                      <span>De {formatDate((log.old_data as any)?.sale_date)} para {formatDate((log.new_data as any)?.sale_date)}</span>
                    )}
                    {log.action === "UPDATE_MARKETING_ATTRIBUTION" && (
                      <span>
                        De {saleOriginLabel(auditField(log.old_data, "sale_origin") as string | null | undefined)} para {saleOriginLabel(auditField(log.new_data, "sale_origin") as string | null | undefined)}
                      </span>
                    )}
                    {log.action === "ADD_ITEM" && (
                      <span>{(log.new_data as any)?.item} - Valor: {formatBRL((log.new_data as any)?.price)} ({(log.new_data as any)?.type === "upsell" ? "Upsell" : "Brinde"})</span>
                    )}
                    {log.action === "REMOVE_ITEM" && (
                      <span>{(log.old_data as any)?.item} - Valor: {formatBRL((log.old_data as any)?.price)} ({(log.old_data as any)?.type === "upsell" ? "Upsell" : "Brinde"})</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{new Date(log.created_at).toLocaleString("pt-BR")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h2 className="font-display font-bold text-navy-900 text-lg font-syne">Editar Venda</h2>
                <p className="text-xs text-gray-400 mt-0.5">ID: {id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-navy-900 hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">

              {/* ── Bloco 1: Data da Venda ── */}
              <div className="bg-surface rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-royal-100 flex items-center justify-center">
                    <Calendar className="w-3.5 h-3.5 text-royal-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900">Data da Venda</h3>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Data de faturamento</label>
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateDate}
                    isLoading={isSubmitting}
                    disabled={editDate === sale.sale_date || isSubmitting}
                    className="h-11 px-4 shrink-0 text-royal-500 border-royal-200 hover:bg-royal-50"
                  >
                    Salvar
                  </Button>
                </div>
              </div>

              {/* ── Bloco 2: Origem do Cliente ── */}
              <div className="bg-surface rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-royal-100 flex items-center justify-center">
                    <Megaphone className="w-3.5 h-3.5 text-royal-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-navy-900">Origem do Cliente</h3>
                    <p className="text-xs text-gray-500">Atualize vendas antigas para o ROI de Marketing.</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-navy-900 mb-1.5">Origem</label>
                    <select
                      value={editSaleOrigin}
                      onChange={(event) => {
                        setEditSaleOrigin(event.target.value)
                        if (event.target.value !== "trafego_pago") setEditMarketingCampaignId("")
                      }}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                    >
                      {SALE_ORIGINS.map((origin) => (
                        <option key={origin.value} value={origin.value}>{origin.label}</option>
                      ))}
                    </select>
                  </div>

                  {editSaleOrigin === "trafego_pago" ? (
                    <div>
                      <label className="block text-xs font-medium text-navy-900 mb-1.5">Campanha</label>
                      <select
                        value={editMarketingCampaignId}
                        onChange={(event) => setEditMarketingCampaignId(event.target.value)}
                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                      >
                        <option value="">Sem campanha vinculada</option>
                        {marketingCampaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name} · {campaign.channel}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-100 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Campanha</p>
                      <p className="mt-1 text-sm font-semibold text-navy-900">Não se aplica</p>
                      <p className="text-xs text-gray-500">Use apenas quando a origem for tráfego pago.</p>
                    </div>
                  )}
                </div>

                <Textarea
                  label="Observação do lead"
                  placeholder="Ex: indicação, direct, grupo..."
                  value={editLeadNotes}
                  onChange={(event) => setEditLeadNotes(event.target.value)}
                  className="mt-3"
                />

                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateMarketingAttribution}
                    isLoading={isSubmitting}
                    disabled={
                      isSubmitting ||
                      (
                        (editSaleOrigin || "unknown") === (sale.sale_origin || "unknown") &&
                        (editSaleOrigin === "trafego_pago" ? editMarketingCampaignId || "" : "") === (sale.marketing_campaign_id || "") &&
                        (editLeadNotes.trim() || "") === (sale.lead_notes || "")
                      )
                    }
                    className="h-11 px-4 shrink-0 text-royal-500 border-royal-200 hover:bg-royal-50"
                  >
                    Salvar origem
                  </Button>
                </div>
              </div>

              {/* ── Bloco 3: Itens da Venda ── */}
              <div className="bg-surface rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-royal-100 flex items-center justify-center">
                    <ShoppingCart className="w-3.5 h-3.5 text-royal-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900">Itens da Venda</h3>
                  {additionalItems.length > 0 && (
                    <span className="ml-auto text-xs bg-royal-100 text-royal-600 font-semibold px-2 py-0.5 rounded-full">{additionalItems.length}</span>
                  )}
                </div>
                {additionalItems.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                      <ShoppingCart className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Nenhum item adicional nesta venda.</p>
                    <p className="text-xs text-gray-300 mt-0.5">Use o formulário abaixo para adicionar.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {additionalItems.map((item) => {
                      const isUpsell = item.type === "upsell"
                      const cost = Number(item.cost_price || 0)
                      const saleP = Number(item.sale_price || 0)
                      const profit = isUpsell ? saleP - cost : -cost
                      const margin = isUpsell && saleP > 0 ? ((profit / saleP) * 100).toFixed(1) : null
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${isUpsell ? "bg-success-100/10 border-success-500/15" : "bg-danger-100/10 border-danger-500/15"}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-navy-900 truncate">{getAdditionalItemDisplayName(item.name)}</p>
                              <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wide ${isUpsell ? "bg-success-100 text-success-600" : "bg-danger-100 text-danger-600"}`}>
                                {isUpsell ? "UPSELL" : "BRINDE"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                              <span>Custo: <span className="font-medium text-navy-800">{formatBRL(cost)}</span></span>
                              {isUpsell && <span>Venda: <span className="font-medium text-navy-800">{formatBRL(saleP)}</span></span>}
                              <span className={`font-semibold ${profit >= 0 ? "text-success-600" : "text-danger-500"}`}>
                                Lucro: {profit >= 0 ? "+" : ""}{formatBRL(profit)}
                                {margin && <span className="text-gray-400 font-normal"> ({margin}%)</span>}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveItem(item)}
                            disabled={isSubmitting}
                            title="Remover item da venda"
                            className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center text-gray-300 hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Bloco 4: Adicionar Novo Item ── */}
              <div className="rounded-2xl border-2 border-dashed border-royal-200 bg-royal-50/20 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-royal-500 flex items-center justify-center shadow-sm">
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900">Adicionar Novo Item</h3>
                </div>

                <div className="space-y-3">
                  {/* Seletor de estoque Inteligente */}
                  <div>
                    <label className="block text-xs font-medium text-navy-900 mb-1.5">Produto do Estoque <span className="text-gray-400 font-normal">(opcional)</span></label>

                    {selectedInventoryItemId ? (
                      <div className="w-full rounded-xl border border-success-200 bg-success-50/50 p-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2">
                             <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0" />
                             <p className="text-sm font-semibold text-navy-900 truncate">
                               {getProductName(inventoryItems.find(i => i.id === selectedInventoryItemId))}
                             </p>
                           </div>
                           <p className="text-xs text-gray-500 mt-0.5 ml-6">Custo vinculado automaticamente</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedInventoryItemId("")
                            setNewItemName("")
                            setNewItemCost("")
                            setNewItemSalePrice("")
                          }}
                          className="text-xs text-danger-500 hover:text-danger-600 font-medium px-2 py-1 rounded-md hover:bg-danger-50 transition-colors"
                        >
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          placeholder="Buscar por modelo, IMEI ou cor..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onFocus={() => setIsSearchFocused(true)}
                          onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                          className="pl-9 h-11"
                        />

                        {/* Dropdown de Resultados */}
                        {isSearchFocused && (
                          <div
                            className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-100 shadow-xl rounded-xl max-h-64 overflow-y-auto"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {availableInventoryItems.length === 0 ? (
                              <div className="p-4 text-center text-sm text-gray-500">
                                Nenhum produto encontrado.
                              </div>
                            ) : (
                              <div className="p-1">
                                {availableInventoryItems.slice(0, 15).map(inv => (
                                  <button
                                    key={inv.id}
                                    onClick={() => {
                                      setSelectedInventoryItemId(inv.id)
                                      setNewItemName(getProductName(inv))
                                      setNewItemCost(inv.purchase_price?.toString() || "0")
                                      setNewItemSalePrice(inv.suggested_price?.toString() || "0")
                                      setIsSearchFocused(false)
                                      setSearchQuery("")
                                    }}
                                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-start gap-3 transition-colors"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                                      <Search className="w-3.5 h-3.5 text-gray-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-navy-900 truncate">{getProductName(inv)}</p>
                                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                                        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-600 font-semibold">
                                          {inv.imei ? inv.imei.slice(-6) : inv.serial_number?.slice(-6) || "S/N"}
                                        </span>
                                        <span>Custo: {formatBRL(inv.purchase_price)}</span>
                                        {inv.condition_notes && <span className="truncate">· {inv.condition_notes}</span>}
                                        {inv.catalog?.battery_health && <span>· Bat: {inv.catalog.battery_health}%</span>}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Input label="Nome do Item" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} disabled={!!selectedInventoryItemId} />

                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Custo (R$)" type="number" value={newItemCost} onChange={(e) => setNewItemCost(e.target.value)} disabled={!!selectedInventoryItemId} />
                    <Input label="Valor Venda (R$)" type="number" value={newItemSalePrice} onChange={(e) => setNewItemSalePrice(e.target.value)} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-navy-900 mb-1">Tipo</label>
                    <div className="flex gap-2">
                      <Button variant={newItemType === "upsell" ? "primary" : "outline"} className="flex-1" onClick={() => setNewItemType("upsell")} type="button">Upsell (Pago)</Button>
                      <Button variant={newItemType === "free" ? "primary" : "outline"} className="flex-1" onClick={() => setNewItemType("free")} type="button">Brinde</Button>
                    </div>
                  </div>

                  <Button variant="primary" className="w-full" onClick={handleAddItem} isLoading={isSubmitting}>
                    <Plus className="w-4 h-4 mr-2" /> Adicionar Item
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-danger-500" />
            </div>
            <h2 className="text-xl font-bold text-navy-900 mb-2">Cancelar venda?</h2>
            <p className="text-sm text-gray-500 mb-6">A venda será marcada como cancelada, o estoque será liberado e recebimentos já conciliados serão estornados no extrato. O histórico financeiro e os registros da venda serão preservados.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" className="flex-1 bg-danger-500 border-danger-500 hover:bg-danger-600" onClick={handleDeleteSale} isLoading={isSubmitting}>Cancelar venda</Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF content for Laudo Técnico rendering */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, zIndex: -1 }}>
        <div id="inspection-pdf-content" style={{ width: "794px", padding: "36px 48px 48px", fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: "#0D1B2E" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "16px", borderBottom: "3px solid #0D1B2E", paddingBottom: "16px" }}>
            <img src="/logo-nobretech.png" alt="Nobretech Store" style={{ width: "220px", height: "auto", marginBottom: "4px" }} />
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#0D1B2E", margin: 0, fontFamily: "Inter, system-ui, sans-serif" }}>Laudo de Inspeção</h1>
            <p style={{ fontSize: "13px", color: "#3A6BC4", marginTop: "4px" }}>
              {fullModel}
            </p>
          </div>

          <div style={{ background: "#F5F8FF", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", color: "#3A6BC4", marginBottom: "12px", textTransform: "uppercase" }}>Dados do Aparelho</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px" }}>
              {[
                ["IMEI", product?.imei || "N/D"],
                ["Nº Série", product?.serial_number || "N/D"],
                ["Grade", product?.grade || "N/D"],
                ["Bateria", product?.battery_health ? `${product.battery_health}%` : "N/D"],
                ["Software", product?.ios_version || "N/D"],
                ["Cor", product?.catalog?.color || "N/D"],
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
              { label: "Aprovados", value: okCount, color: "#3ABF82" },
              { label: "Falhas", value: failCount, color: "#E05C5C" },
              { label: "Não se aplica", value: checklist.filter(i => i.status === 'na').length, color: "#9CA3AF" },
            ].map((stat) => (
              <div key={stat.label} style={{ flex: 1, background: "#F9FAFB", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                <p style={{ fontSize: "28px", fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
                <p style={{ fontSize: "11px", color: "#6B7280", margin: "4px 0 0" }}>{stat.label}</p>
              </div>
            ))}
          </div>

          <div style={{ height: "1px", background: "#E5E7EB", marginBottom: "20px" }} />

          {checklist.length > 0 && (
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
                  {checklist.filter((i: any) => i.status !== "na").map((item: any, idx: number) => (
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
          )}

          {product?.condition_notes && (
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
