"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PAYMENT_METHODS, SIDEPAY_FEE_PCTS } from "@/lib/constants"
import { addDaysISO, calculatePaymentPrice, formatBRL, formatDate, getProductName, normalizePaymentFeePct, todayISO } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/toaster"
import { Copy, Download, MessageCircle, PackagePlus, Plus, Search, Share2, Sparkles, Trash2 } from "lucide-react"

type InventoryItem = {
  id: string
  imei?: string | null
  serial_number?: string | null
  grade?: string | null
  suggested_price?: number | null
  purchase_price?: number | null
  status?: string | null
  quantity?: number | null
  notes?: string | null
  condition_notes?: string | null
  catalog?: {
    model?: string | null
    variant?: string | null
    storage?: string | null
    color?: string | null
    category?: string | null
  } | null
}

type QuoteItem = {
  inventoryId: string
  price: number
}

const PAYMENT_LABEL_TONES: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 border-emerald-100",
  pix: "bg-sky-50 text-sky-700 border-sky-100",
  debit: "bg-indigo-50 text-indigo-700 border-indigo-100",
}

function dbKey(method: string) {
  if (method === "cash") return "cash_discount_pct"
  if (method === "pix") return "pix_fee_pct"
  return `${method}_fee_pct`
}

function readFee(settings: Record<string, unknown>, method: string) {
  const key = dbKey(method)
  const value = settings[key]
  if (value === null || value === undefined || value === "") return SIDEPAY_FEE_PCTS[method] ?? 0
  return normalizePaymentFeePct(method, Number(value))
}

function quoteProductName(item: InventoryItem) {
  return getProductName({
    catalog: item.catalog ? {
      model: item.catalog.model || undefined,
      storage: item.catalog.storage || undefined,
      color: item.catalog.color || undefined,
    } : null,
    notes: item.notes,
    condition_notes: item.condition_notes,
  })
}

function safeExportColor(value: string, fallback: string) {
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return value || fallback
  return /(?:oklch|oklab|lab|lch|color-mix)\(/i.test(value) ? fallback : value
}

function colorFallback(className: string, property: "text" | "background" | "border") {
  if (property === "background") {
    if (className.includes("bg-navy-950")) return "#08111f"
    if (className.includes("bg-navy-900")) return "#0f172a"
    if (className.includes("bg-navy-800")) return "#1e293b"
    if (className.includes("bg-royal")) return "#2563eb"
    if (className.includes("bg-emerald")) return "#ecfdf5"
    if (className.includes("bg-sky")) return "#f0f9ff"
    if (className.includes("bg-indigo")) return "#eef2ff"
    if (className.includes("bg-gray")) return "#f8fafc"
    if (className.includes("bg-white")) return "#ffffff"
    return "#ffffff"
  }

  if (property === "border") {
    if (className.includes("border-emerald")) return "#bbf7d0"
    if (className.includes("border-sky")) return "#bae6fd"
    if (className.includes("border-indigo")) return "#c7d2fe"
    if (className.includes("border-royal")) return "#bfdbfe"
    return "#e5e7eb"
  }

  if (className.includes("text-white")) return "#ffffff"
  if (className.includes("text-emerald")) return "#047857"
  if (className.includes("text-sky")) return "#0369a1"
  if (className.includes("text-indigo")) return "#4338ca"
  if (className.includes("text-royal")) return "#2563eb"
  if (className.includes("text-gray-400")) return "#9ca3af"
  if (className.includes("text-gray-500")) return "#6b7280"
  if (className.includes("text-navy")) return "#0f172a"
  return "#0f172a"
}

function sanitizeExportClone(root: HTMLElement, doc: Document) {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]

  elements.forEach((element) => {
    const computed = doc.defaultView?.getComputedStyle(element)
    if (!computed) return

    const className = typeof element.className === "string" ? element.className : ""
    element.style.color = safeExportColor(computed.color, colorFallback(className, "text"))
    element.style.backgroundColor = safeExportColor(computed.backgroundColor, colorFallback(className, "background"))
    element.style.borderTopColor = safeExportColor(computed.borderTopColor, colorFallback(className, "border"))
    element.style.borderRightColor = safeExportColor(computed.borderRightColor, colorFallback(className, "border"))
    element.style.borderBottomColor = safeExportColor(computed.borderBottomColor, colorFallback(className, "border"))
    element.style.borderLeftColor = safeExportColor(computed.borderLeftColor, colorFallback(className, "border"))
    element.style.textDecorationColor = safeExportColor(computed.textDecorationColor, colorFallback(className, "text"))
    element.style.backgroundImage = "none"
    element.style.boxShadow = "none"
  })
}

function quoteOriginalPrice(item: InventoryItem) {
  return Number(item.suggested_price || item.purchase_price || 0)
}

function formatWhatsAppMoney(value: number) {
  return formatBRL(value).replace(/\s/g, " ")
}

function quoteImageName() {
  return `orcamento-nobretech-${todayISO()}.png`
}

async function blobFromElement(element: HTMLElement) {
  const html2canvas = (await import("html2canvas")).default
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (doc) => {
      const clonedReport = doc.querySelector<HTMLElement>("[data-quote-report='true']")
      if (clonedReport) sanitizeExportClone(clonedReport, doc)
    },
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Nao foi possivel gerar a imagem."))
    }, "image/png", 0.96)
  })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export default function QuotesPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([])
  const [customerName, setCustomerName] = useState("")
  const [validDays, setValidDays] = useState("2")
  const [hasTradeIn, setHasTradeIn] = useState(false)
  const [tradeInDevice, setTradeInDevice] = useState("")
  const [tradeInValue, setTradeInValue] = useState("")
  const [notes, setNotes] = useState("Valores sujeitos a disponibilidade do estoque.")
  const [fees, setFees] = useState<Record<string, number>>({ ...SIDEPAY_FEE_PCTS })
  const [sharing, setSharing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function fetchQuoteData() {
      setLoading(true)
      try {
        const [inventoryRes, settingsRes] = await Promise.all([
          (supabase.from("inventory") as any)
            .select("id, imei, serial_number, grade, suggested_price, purchase_price, status, quantity, notes, condition_notes, catalog:catalog_id(model, variant, storage, color, category)")
            .in("status", ["active", "in_stock"])
            .order("created_at", { ascending: false }),
          (supabase.from("financial_settings") as any).select("*").limit(1).single(),
        ])

        if (inventoryRes.error) throw new Error(inventoryRes.error.message)
        setInventory((inventoryRes.data || []).map((item: any) => ({
          ...item,
          suggested_price: item.suggested_price === null ? null : Number(item.suggested_price || 0),
          purchase_price: item.purchase_price === null ? null : Number(item.purchase_price || 0),
          quantity: item.quantity === null ? null : Number(item.quantity || 1),
        })))

        if (!settingsRes.error && settingsRes.data) {
          const nextFees: Record<string, number> = {}
          PAYMENT_METHODS.forEach((method) => {
            nextFees[method.value] = readFee(settingsRes.data, method.value)
          })
          setFees(nextFees)
        }
      } catch (error: any) {
        toast({ title: "Erro ao carregar orcamento", description: error.message, type: "error" })
      } finally {
        setLoading(false)
      }
    }

    fetchQuoteData()
  }, [toast])

  const productById = useMemo(() => {
    return new Map(inventory.map((item) => [item.id, item]))
  }, [inventory])

  const selectedProducts = useMemo(() => {
    return quoteItems
      .map((item) => {
        const product = productById.get(item.inventoryId)
        return product ? { ...item, product } : null
      })
      .filter(Boolean) as Array<QuoteItem & { product: InventoryItem }>
  }, [productById, quoteItems])

  const quoteTotal = useMemo(() => {
    return selectedProducts.reduce((sum, item) => sum + Number(item.price || 0), 0)
  }, [selectedProducts])

  const tradeInCredit = useMemo(() => {
    if (!hasTradeIn) return 0
    return Math.min(quoteTotal, Math.max(0, Number(tradeInValue.replace(",", ".")) || 0))
  }, [hasTradeIn, quoteTotal, tradeInValue])

  const amountDue = Math.max(0, quoteTotal - tradeInCredit)

  const paymentRows = useMemo(() => {
    return PAYMENT_METHODS.map((method) => {
      const payment = calculatePaymentPrice(amountDue, method.value, fees)
      return {
        method: method.value,
        label: method.label,
        installments: payment.installments,
        total: payment.price,
        fee: payment.fee,
        installmentValue: payment.installmentValue,
      }
    })
  }, [amountDue, fees])

  const filteredInventory = useMemo(() => {
    const query = search.toLowerCase().trim()
    const selectedIds = new Set(quoteItems.map((item) => item.inventoryId))
    return inventory
      .filter((item) => !selectedIds.has(item.id))
      .filter((item) => {
        if (!query) return true
        return [
          quoteProductName(item),
          item.grade || "",
          item.imei || "",
          item.serial_number || "",
          item.notes || "",
          item.condition_notes || "",
        ].some((value) => value.toLowerCase().includes(query))
      })
      .slice(0, 8)
  }, [inventory, quoteItems, search])

  const validUntil = addDaysISO(todayISO(), Math.max(1, Number(validDays) || 1)) || todayISO()
  const shareText = useMemo(() => {
    const pixRow = paymentRows.find((row) => row.method === "pix")
    const debitRow = paymentRows.find((row) => row.method === "debit")
    const creditRows = paymentRows.filter((row) => row.method.startsWith("credit_"))
    const lines: Array<string | null> = [
      "*ORCAMENTO NOBRETECH*",
      customerName.trim() ? `_Orcamento personalizado para ${customerName.trim()}_` : "_Orcamento personalizado_",
      `Valido ate *${formatDate(validUntil)}*`,
      "",
      "*APARELHO(S)*",
      ...selectedProducts.map((item, index) => {
        const original = quoteOriginalPrice(item.product)
        const priceLabel = item.price < original
          ? ` (de R$ ~${formatWhatsAppMoney(original).replace(/^R\\$ ?/, "")}~ por *${formatWhatsAppMoney(item.price)}*)`
          : ` (${formatWhatsAppMoney(item.price)})`
        return `${index + 1}. ${quoteProductName(item.product)} - Grade ${item.product.grade || "-"}${priceLabel}`
      }),
      "",
      `*TOTAL BASE:* ${formatWhatsAppMoney(quoteTotal)}`,
      tradeInCredit > 0 ? `*TRADE-IN:* -${formatWhatsAppMoney(tradeInCredit)}${tradeInDevice.trim() ? ` (${tradeInDevice.trim()})` : ""}` : null,
      tradeInCredit > 0 ? `*SALDO A PAGAR:* ${formatWhatsAppMoney(amountDue)}` : null,
      "",
      "*CONDICOES DE PAGAMENTO*",
      pixRow ? `Pix: *${formatWhatsAppMoney(pixRow.total)}*` : null,
      debitRow ? `Debito: *${formatWhatsAppMoney(debitRow.total)}*` : null,
      ...creditRows.map((row) => `> ${row.label}: *${row.installments}x de ${formatWhatsAppMoney(row.installmentValue)}* (total ${formatWhatsAppMoney(row.total)})`),
      "",
      notes ? `_${notes}_` : "_Valores sujeitos a disponibilidade de estoque e bandeira do cartao_",
    ]
    return lines.filter((line): line is string => line !== null && line !== undefined).join("\n")
  }, [amountDue, customerName, notes, paymentRows, quoteTotal, selectedProducts, tradeInCredit, tradeInDevice, validUntil])

  const addProduct = (product: InventoryItem) => {
    const price = quoteOriginalPrice(product)
    setQuoteItems((current) => [...current, { inventoryId: product.id, price }])
  }

  const updateQuotePrice = (inventoryId: string, value: string) => {
    const price = Number(value.replace(",", ".")) || 0
    setQuoteItems((current) => current.map((item) => item.inventoryId === inventoryId ? { ...item, price } : item))
  }

  const removeProduct = (inventoryId: string) => {
    setQuoteItems((current) => current.filter((item) => item.inventoryId !== inventoryId))
  }

  const generateImage = async () => {
    if (!exportRef.current || selectedProducts.length === 0) {
      toast({ title: "Adicione pelo menos um aparelho", type: "error" })
      return null
    }
    return blobFromElement(exportRef.current)
  }

  const handleDownloadImage = async () => {
    setSharing(true)
    try {
      const blob = await generateImage()
      if (!blob) return
      downloadBlob(blob, quoteImageName())
      toast({ title: "Imagem do orcamento gerada", type: "success" })
    } catch (error: any) {
      toast({ title: "Erro ao gerar imagem", description: error.message, type: "error" })
    } finally {
      setSharing(false)
    }
  }

  const handleShareImage = async () => {
    setSharing(true)
    try {
      const blob = await generateImage()
      if (!blob) return
      const file = new File([blob], quoteImageName(), { type: "image/png" })
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
        share?: (data: ShareData) => Promise<void>
      }

      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: "Orcamento Nobretech",
          text: shareText,
          files: [file],
        })
        return
      }

      downloadBlob(blob, quoteImageName())
      toast({ title: "Compartilhamento indisponivel", description: "Baixei a imagem para voce enviar pelo WhatsApp.", type: "success" })
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        toast({ title: "Erro ao compartilhar", description: error.message, type: "error" })
      }
    } finally {
      setSharing(false)
    }
  }

  const handleWhatsApp = () => {
    if (selectedProducts.length === 0) {
      toast({ title: "Adicione pelo menos um aparelho", type: "error" })
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer")
  }

  const handleCopyWhatsAppText = async () => {
    if (selectedProducts.length === 0) {
      toast({ title: "Adicione pelo menos um aparelho", type: "error" })
      return
    }

    try {
      await navigator.clipboard.writeText(shareText)
      toast({ title: "Texto copiado", description: "Agora e so colar no WhatsApp.", type: "success" })
    } catch {
      toast({ title: "Nao foi possivel copiar", description: "Use o botao WhatsApp para abrir a mensagem pronta.", type: "error" })
    }
  }

  if (!mounted) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div>
          <h2 className="text-2xl font-display font-bold text-navy-900 font-syne">Orcamento</h2>
          <p className="text-sm text-gray-500">Preparando ferramenta de cotacao...</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          Carregando orcamento...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-navy-900 font-syne">Orcamento</h2>
          <p className="text-sm text-gray-500">Monte uma proposta com aparelhos do estoque, condicoes e imagem pronta para enviar ao cliente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadImage} disabled={sharing || selectedProducts.length === 0}>
            <Download className="h-4 w-4" /> Baixar imagem
          </Button>
          <Button variant="outline" onClick={handleWhatsApp} disabled={selectedProducts.length === 0}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button variant="outline" onClick={handleCopyWhatsAppText} disabled={selectedProducts.length === 0}>
            <Copy className="h-4 w-4" /> Copiar texto
          </Button>
          <Button onClick={handleShareImage} disabled={sharing || selectedProducts.length === 0}>
            <Share2 className="h-4 w-4" /> Compartilhar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(330px,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
                <Search className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-navy-900">Aparelhos em estoque</h3>
                <p className="text-xs text-gray-500">{inventory.length} item(ns) disponiveis para cotar</p>
              </div>
            </div>
            <Input
              placeholder="Buscar por modelo, IMEI, grade ou observacao..."
              icon={<Search className="h-4 w-4" />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">Carregando estoque...</div>
              ) : filteredInventory.length === 0 ? (
                <div className="rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">Nenhum aparelho encontrado.</div>
              ) : filteredInventory.map((product) => {
                const price = Number(product.suggested_price || product.purchase_price || 0)
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="grid w-full gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-left transition-all hover:border-royal-200 hover:bg-white hover:shadow-sm sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy-900">{quoteProductName(product)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Grade {product.grade || "-"} {product.imei ? ` · IMEI ${product.imei.slice(-6)}` : ""} {product.quantity && product.quantity > 1 ? ` · ${product.quantity} un.` : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <p className="font-bold text-navy-900">{formatBRL(price)}</p>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-royal-500 text-white">
                        <Plus className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-navy-900">Itens do orcamento</h3>
                <p className="text-xs text-gray-500">Ajuste preco e dados do cliente antes de compartilhar.</p>
              </div>
              <Badge variant={selectedProducts.length > 0 ? "green" : "gray"}>{selectedProducts.length} item(ns)</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Cliente" placeholder="Nome do cliente" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              <Input label="Validade (dias)" type="number" min="1" value={validDays} onChange={(event) => setValidDays(event.target.value)} />
            </div>

            <div className="mt-3 space-y-2">
              {selectedProducts.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                  <PackagePlus className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-navy-900">Escolha um aparelho no estoque</p>
                  <p className="mt-1 text-xs text-gray-500">Voce pode montar orcamento com um item ou comparar varios aparelhos.</p>
                </div>
              ) : selectedProducts.map((item) => (
                <div key={item.inventoryId} className="rounded-xl border border-gray-100 bg-surface p-3">
                  <div className="min-w-0">
                    <p className="max-h-10 overflow-hidden break-words text-sm font-bold leading-5 text-navy-900">{quoteProductName(item.product)}</p>
                    <p className="mt-1 max-h-10 overflow-hidden break-words text-xs leading-5 text-gray-500">Grade {item.product.grade || "-"} · {item.product.condition_notes || "Pronto para venda"}</p>
                    {item.price < quoteOriginalPrice(item.product) && (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        De <span className="text-gray-400 line-through">{formatBRL(quoteOriginalPrice(item.product))}</span> por <span className="text-emerald-700">{formatBRL(item.price)}</span>
                      </p>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_44px] items-end gap-2">
                    <Input
                      label="Preco"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(event) => updateQuotePrice(item.inventoryId, event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeProduct(item.inventoryId)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      title="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Input label="Observacao" value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-3" />

            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
              <label className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-bold text-navy-900">Simular entrada do aparelho do cliente</span>
                  <span className="block text-xs text-gray-500">O valor entra como crédito e as parcelas são calculadas sobre o saldo.</span>
                </span>
                <input
                  type="checkbox"
                  checked={hasTradeIn}
                  onChange={(event) => setHasTradeIn(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-emerald-500"
                />
              </label>
              {hasTradeIn && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
                  <Input
                    label="Aparelho recebido"
                    placeholder="Ex: iPhone 13 128GB"
                    value={tradeInDevice}
                    onChange={(event) => setTradeInDevice(event.target.value)}
                  />
                  <Input
                    label="Valor na troca"
                    type="number"
                    min="0"
                    step="0.01"
                    value={tradeInValue}
                    onChange={(event) => setTradeInValue(event.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div ref={reportRef} data-quote-report="true" className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-xl">
            <div className="bg-navy-950 px-6 py-5 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-royal-200">Nobretech Store</p>
                  <h3 className="mt-2 text-2xl font-display font-bold font-syne">Orcamento personalizado</h3>
                  <p className="mt-1 text-sm text-white/60">
                    {customerName.trim() ? `Cliente: ${customerName.trim()}` : "Proposta para cliente"} · Valido ate {formatDate(validUntil)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 text-right text-navy-950">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{tradeInCredit > 0 ? "Saldo a pagar" : "Total base"}</p>
                  <p className="text-2xl font-bold">{formatBRL(amountDue)}</p>
                  {tradeInCredit > 0 && <p className="mt-0.5 text-xs font-semibold text-emerald-700">Trade-in -{formatBRL(tradeInCredit)}</p>}
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 bg-gradient-to-br from-white via-blue-50/60 to-emerald-50/70 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
              <div className="min-w-0 space-y-3">
                <div className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h4 className="font-bold text-navy-900">Aparelhos selecionados</h4>
                    <Badge variant="blue">{selectedProducts.length} opcao(oes)</Badge>
                  </div>
                  {selectedProducts.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Adicione produtos para gerar o relatorio.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedProducts.map((item, index) => (
                        <div key={item.inventoryId} className="rounded-xl border border-gray-100 bg-white p-3">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-royal-500">#{index + 1}</p>
                              <p className="max-h-10 overflow-hidden break-words text-sm font-bold leading-5 text-navy-900">{quoteProductName(item.product)}</p>
                              <p className="mt-1 max-h-9 overflow-hidden break-words text-xs leading-[18px] text-gray-500">Grade {item.product.grade || "-"} · {item.product.condition_notes || "Revisado"}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {item.price < quoteOriginalPrice(item.product) && (
                                <p className="text-[11px] font-semibold text-gray-400 line-through">{formatBRL(quoteOriginalPrice(item.product))}</p>
                              )}
                              <p className={cn("text-sm font-bold", item.price < quoteOriginalPrice(item.product) ? "text-emerald-600" : "text-navy-900")}>
                                {formatBRL(item.price)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {tradeInCredit > 0 && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Trade-in simulado</p>
                        <p className="mt-1 text-sm font-bold text-navy-900">{tradeInDevice.trim() || "Aparelho do cliente"}</p>
                        <p className="mt-0.5 text-xs text-gray-500">Crédito aplicado sobre o orçamento.</p>
                      </div>
                      <p className="shrink-0 text-lg font-black text-emerald-700">-{formatBRL(tradeInCredit)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <span className="text-xs font-bold uppercase text-gray-400">Saldo a pagar</span>
                      <span className="font-black text-navy-900">{formatBRL(amountDue)}</span>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl bg-navy-900 p-4 text-white shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/50">Melhores opcoes rapidas</p>
                  <div className="mt-3 grid gap-2">
                    {paymentRows.filter((row) => ["pix", "debit", "credit_1x"].includes(row.method)).map((row) => (
                      <div key={row.method} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
                        <span className="text-sm font-semibold">{row.label}</span>
                        <span className="text-sm font-bold">{row.installments > 1 ? `${row.installments}x ${formatBRL(row.installmentValue)}` : formatBRL(row.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="font-bold text-navy-900">Condicoes de pagamento</h4>
                  <Sparkles className="h-4 w-4 text-royal-500" />
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-bold uppercase">Forma</th>
                        <th className="px-3 py-2 text-right font-bold uppercase">Total</th>
                        <th className="px-3 py-2 text-right font-bold uppercase">Parcela</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {paymentRows.map((row) => (
                        <tr key={row.method}>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex rounded-full border px-2 py-1 font-bold", PAYMENT_LABEL_TONES[row.method] || "border-gray-100 bg-gray-50 text-gray-700")}>
                              {row.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-navy-900">{formatBRL(row.total)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {row.installments > 1 ? `${row.installments}x ${formatBRL(row.installmentValue)}` : "A vista"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-gray-500">{notes}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-navy-900">Resumo</p>
                <p className="text-xs text-gray-500">
                  {tradeInCredit > 0 ? `Saldo ${formatBRL(amountDue)} · ` : ""}
                  Pix: {formatBRL(paymentRows.find((row) => row.method === "pix")?.total || 0)} · 12x: {formatBRL(paymentRows.find((row) => row.method === "credit_12x")?.installmentValue || 0)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleWhatsApp} disabled={selectedProducts.length === 0}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyWhatsAppText} disabled={selectedProducts.length === 0}>
                  <Copy className="h-4 w-4" /> Copiar texto
                </Button>
                <Button size="sm" onClick={handleShareImage} isLoading={sharing} disabled={selectedProducts.length === 0}>
                  <Share2 className="h-4 w-4" /> Compartilhar imagem
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mounted && (
      <div className="fixed -left-[9999px] top-0">
        <div
          ref={exportRef}
          data-quote-report="true"
          style={{
            width: 1200,
            background: "#ffffff",
            borderRadius: 28,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
            color: "#0f172a",
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          <div style={{ background: "#08111f", color: "#ffffff", padding: "38px 42px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#bfdbfe", fontSize: 15, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase" }}>Nobretech Store</div>
                <div style={{ marginTop: 16, fontSize: 38, lineHeight: 1.05, fontWeight: 800 }}>Orcamento personalizado</div>
                <div style={{ marginTop: 10, color: "#cbd5e1", fontSize: 20 }}>
                  {customerName.trim() ? `Cliente: ${customerName.trim()}` : "Proposta para cliente"} · Valido ate {formatDate(validUntil)}
                </div>
              </div>
              <div style={{ flexShrink: 0, borderRadius: 24, background: "#ffffff", color: "#0f172a", padding: "20px 24px", textAlign: "right", minWidth: 220 }}>
                <div style={{ color: "#9ca3af", fontSize: 14, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase" }}>{tradeInCredit > 0 ? "Saldo a pagar" : "Total base"}</div>
                <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900 }}>{formatBRL(amountDue)}</div>
                {tradeInCredit > 0 && (
                  <div style={{ marginTop: 4, color: "#047857", fontSize: 14, fontWeight: 800 }}>Trade-in -{formatBRL(tradeInCredit)}</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: "#f8fafc", padding: 34 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, alignItems: "start" }}>
              <div>
                <div style={{ borderRadius: 24, background: "#ffffff", border: "1px solid #e5e7eb", padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>Aparelhos selecionados</div>
                    <div style={{ borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", padding: "7px 14px", fontSize: 14, fontWeight: 800 }}>{selectedProducts.length} item(ns)</div>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {selectedProducts.map((item, index) => {
                      const original = quoteOriginalPrice(item.product)
                      const discounted = item.price < original
                      return (
                        <div key={item.inventoryId} style={{ borderRadius: 18, border: "1px solid #e5e7eb", background: "#ffffff", padding: 16 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 18, alignItems: "start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: "#2563eb", fontSize: 14, fontWeight: 900 }}>#{index + 1}</div>
                              <div style={{ marginTop: 4, fontSize: 18, lineHeight: 1.2, fontWeight: 900, wordBreak: "break-word" }}>{quoteProductName(item.product)}</div>
                              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 15 }}>Grade {item.product.grade || "-"} · {item.product.condition_notes || "Revisado"}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              {discounted && (
                                <div style={{ color: "#9ca3af", fontSize: 14, fontWeight: 700, textDecoration: "line-through" }}>{formatBRL(original)}</div>
                              )}
                              <div style={{ marginTop: discounted ? 3 : 0, color: discounted ? "#047857" : "#0f172a", fontSize: 22, fontWeight: 900 }}>{formatBRL(item.price)}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {tradeInCredit > 0 && (
                  <div style={{ marginTop: 18, borderRadius: 24, background: "#ecfdf5", border: "1px solid #bbf7d0", padding: 22 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
                      <div>
                        <div style={{ color: "#047857", fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>Trade-in simulado</div>
                        <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{tradeInDevice.trim() || "Aparelho do cliente"}</div>
                        <div style={{ marginTop: 4, color: "#6b7280", fontSize: 14 }}>Credito aplicado sobre o total base.</div>
                      </div>
                      <div style={{ color: "#047857", fontSize: 24, fontWeight: 900 }}>-{formatBRL(tradeInCredit)}</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, borderRadius: 16, background: "#ffffff", padding: "12px 14px" }}>
                      <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>Saldo a pagar</span>
                      <span style={{ color: "#0f172a", fontSize: 18, fontWeight: 900 }}>{formatBRL(amountDue)}</span>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 18, borderRadius: 24, background: "#08111f", color: "#ffffff", padding: 22 }}>
                  <div style={{ color: "#cbd5e1", fontSize: 14, fontWeight: 900, letterSpacing: 1.3, textTransform: "uppercase" }}>Melhores opcoes rapidas</div>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {paymentRows.filter((row) => ["pix", "debit", "credit_1x"].includes(row.method)).map((row) => (
                      <div key={row.method} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 16, background: "#16243a", padding: "13px 16px" }}>
                        <div style={{ fontSize: 17, fontWeight: 800 }}>{row.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{row.installments > 1 ? `${row.installments}x ${formatBRL(row.installmentValue)}` : formatBRL(row.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ borderRadius: 24, background: "#ffffff", border: "1px solid #e5e7eb", padding: 22 }}>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>Condicoes de pagamento</div>
                <div style={{ borderRadius: 18, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ background: "#f3f4f6", color: "#6b7280" }}>
                        <th style={{ padding: "12px 14px", textAlign: "left", textTransform: "uppercase", fontSize: 12, letterSpacing: 1 }}>Forma</th>
                        <th style={{ padding: "12px 14px", textAlign: "right", textTransform: "uppercase", fontSize: 12, letterSpacing: 1 }}>Total</th>
                        <th style={{ padding: "12px 14px", textAlign: "right", textTransform: "uppercase", fontSize: 12, letterSpacing: 1 }}>Parcela</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((row) => {
                        const labelBg = row.method === "cash" ? "#ecfdf5" : row.method === "pix" ? "#f0f9ff" : row.method === "debit" ? "#eef2ff" : "#f8fafc"
                        const labelColor = row.method === "cash" ? "#047857" : row.method === "pix" ? "#0369a1" : row.method === "debit" ? "#4338ca" : "#0f172a"
                        return (
                          <tr key={row.method} style={{ borderTop: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ display: "inline-block", minWidth: 92, borderRadius: 999, background: labelBg, color: labelColor, border: "1px solid #e5e7eb", padding: "8px 12px", fontWeight: 900, lineHeight: 1.05 }}>
                                {row.label}
                              </span>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 900, color: "#0f172a" }}>{formatBRL(row.total)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: "#374151" }}>
                              {row.installments > 1 ? `${row.installments}x ${formatBRL(row.installmentValue)}` : "A vista"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 18, color: "#6b7280", fontSize: 15, lineHeight: 1.45 }}>{notes}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
