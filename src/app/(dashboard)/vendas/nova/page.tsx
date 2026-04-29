"use client"

import { useState, useMemo, useCallback, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { calculatePaymentPrice, formatBRL, maskCPF, formatPhone, validateCPF, getProductName, getAdditionalItemDisplayName, calculateDeviceValue, formatTradeInSuggestedRange, getTradeInSummaryStatus, getComputedInventoryStatus, normalizePaymentFeePct, todayISO, addDaysISO } from "@/lib/helpers"
import { atualizarStatusEstoque } from "@/services/vendaService"
import { PAYMENT_METHODS, CATEGORIES, PRODUCT_CATALOG, GRADES, SIDEPAY_FEE_PCTS } from "@/lib/constants"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { generateReceiptPDF, generateWarrantyPDF, type SaleDocumentData } from "@/lib/sale-documents"
import {
  Search,
  ShoppingCart,
  User,
  Check,
  CalendarClock,
  Gift,
  Package,
  X,
} from "lucide-react"

type InventoryProduct = {
  id: string
  name: string
  imei: string
  imei2?: string
  serial_number?: string
  condition_notes?: string | null
  cost: number
  suggested: number
  battery: number
  status?: string
  type?: "own" | "supplier"
  supplier_name?: string | null
  quantity?: number
}

type TradeInState = {
  category: string
  modelIdx: number
  storage: string
  color: string
  imei: string
  grade: string
  batteryHealth: string
  value: string
}

type TradeInCalculation = {
  matches: Array<{ price: number }>
  evaluation: ReturnType<typeof calculateDeviceValue> | null
  suggestedDisplay: string
}

const EMPTY_TRADE_IN: TradeInState = {
  category: "",
  modelIdx: 0,
  storage: "",
  color: "",
  imei: "",
  grade: "",
  batteryHealth: "",
  value: "",
}

const calculateTradeInValue = (
  tradeIn: TradeInState,
  tradeInModel: any,
  hasTradeIn: boolean,
  inventoryProducts: any[]
): TradeInCalculation => {
  if (!hasTradeIn || !tradeInModel || !tradeIn.category) {
    return { matches: [], evaluation: null, suggestedDisplay: formatBRL(0) }
  }

  const matches = inventoryProducts
    .filter((p: any) => p.name?.includes(tradeInModel.name))
    .map((p: any) => ({ price: p.cost }))

  const evaluation = calculateDeviceValue({
    grade: tradeIn.grade,
    batteryHealth: tradeIn.batteryHealth ? parseInt(tradeIn.batteryHealth) : undefined,
    manualValue: tradeIn.value ? Number(tradeIn.value) : undefined,
    matchingPrices: matches,
  })

  const suggestedDisplay = evaluation
    ? formatTradeInSuggestedRange(evaluation.roundedValue)
    : formatBRL(0)

  return { matches, evaluation, suggestedDisplay }
}

const sanitizeTradeInImei = (value: string): string => value.replace(/\D/g, "").slice(0, 15)

const parseTradeInModelIndex = (value: string): number => {
  const parsed = parseInt(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const resolveTradeInInventoryStatus = (
  tradeIn: TradeInState,
  tradeInModel: any,
  saleNotes: string
) => {
  return getComputedInventoryStatus({
    status: "pending",
    purchase_price: Number(tradeIn.value || 0),
    purchase_date: new Date().toISOString().split("T")[0],
    grade: tradeIn.grade || null,
    imei: tradeIn.imei || null,
    serial_number: null,
    catalog_id: null,
    notes: tradeInModel?.name || null,
    condition_notes: saleNotes || null,
  })
}

const getTradeInStatusText = (
  tradeIn: TradeInState,
  tradeInModel: any,
  saleNotes: string
) => getTradeInSummaryStatus(resolveTradeInInventoryStatus(tradeIn, tradeInModel, saleNotes))

const createTradeInInventoryItem = async (params: {
  companyId: string
  saleId: string
  tradeInValue: number
  status: string
  tradeInModelName: string
  imei: string
  grade: string
  saleNotes: string
}) => {
  const { data, error } = await (supabase.from("inventory") as any).insert({
    company_id: params.companyId,
    catalog_id: null,
    imei: params.imei || null,
    serial_number: null,
    grade: params.grade || null,
    condition_notes: params.saleNotes || null,
    purchase_price: params.tradeInValue,
    purchase_date: new Date().toISOString().split("T")[0],
    type: "own",
    supplier_name: null,
    origin: "trade_in",
    source_sale_id: params.saleId,
    suggested_price: null,
    photos: null,
    notes: params.tradeInModelName,
    quantity: 1,
    status: params.status,
  }).select("id,status").single()

  if (error) {
    console.error("Erro ao criar item de estoque trade-in:", error)
    return null
  }

  return data
}

const handleTradeInChange = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  partial: Partial<TradeInState>
) => {
  setTradeIn((prev) => ({ ...prev, ...partial }))
}

const handleTradeInCategoryChange = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  category: string
) => {
  setTradeIn((prev) => ({ ...prev, category, modelIdx: 0 }))
}

const handleTradeInModelChange = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  modelIdx: number
) => {
  setTradeIn((prev) => ({ ...prev, modelIdx }))
}

const handleTradeInImeiChange = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  value: string
) => {
  setTradeIn((prev) => ({ ...prev, imei: sanitizeTradeInImei(value) }))
}

const uploadTradeInPhotos = async (
  tradeInPhotos: string[],
  companyId: string,
  saleId: string
): Promise<string[]> => {
  void tradeInPhotos
  void companyId
  void saleId
  return []
}

const updateSaleTradeInLink = async (saleId: string, tradeInId: string) => {
  const { error } = await (supabase.from("sales") as any)
    .update({ trade_in_id: tradeInId })
    .eq("id", saleId)

  if (error) {
    console.error("Erro ao vincular trade-in à venda:", error)
  }
}

const updateTradeInWithInventoryLink = async (tradeInId: string, inventoryId?: string | null) => {
  if (!inventoryId) return
  const { error } = await (supabase.from("trade_ins") as any)
    .update({ linked_inventory_id: inventoryId, status: "added_to_stock" })
    .eq("id", tradeInId)

  if (error) {
    console.error("Erro ao vincular trade-in ao estoque:", error)
  }
}

const toggleTradeIn = (
  hasTradeIn: boolean,
  setHasTradeIn: React.Dispatch<React.SetStateAction<boolean>>
) => {
  setHasTradeIn(!hasTradeIn)
}

const toggleAdditionalItem = (
  hasAdditionalItem: boolean,
  setHasAdditionalItem: React.Dispatch<React.SetStateAction<boolean>>,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  setHasAdditionalItem(!hasAdditionalItem)
  if (hasAdditionalItem) setAdditionalSelectedItem(null)
}

const selectAdditionalInventoryItem = (
  inventoryProducts: any[],
  value: string,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  const inv = inventoryProducts.find(p => p.id === value)
  if (!inv) return

  setAdditionalSelectedItem({
    itemId: inv.id,
    name: inv.name,
    cost: inv.cost,
    type: "upsell",
    salePrice: inv.suggested.toString(),
    qty: 1,
  })
}

const setAdditionalType = (
  type: "upsell" | "free",
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  setAdditionalSelectedItem((p) => p ? { ...p, type } : p)
}

const setAdditionalSalePrice = (
  salePrice: string,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  setAdditionalSelectedItem((p) => p ? { ...p, salePrice } : p)
}

const setAdditionalQty = (
  qty: number,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  setAdditionalSelectedItem((p) => p ? { ...p, qty: Math.max(1, qty || 0) } : p)
}

const setAdditionalTypeWithState = (
  type: "upsell" | "free",
  additionalSelectedItem: {
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  if (!additionalSelectedItem) return
  setAdditionalType(type, setAdditionalSelectedItem)
}

const setAdditionalQtyWithState = (
  qty: number,
  additionalSelectedItem: {
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  if (!additionalSelectedItem) return
  setAdditionalQty(qty, setAdditionalSelectedItem)
}

const setAdditionalSalePriceWithState = (
  salePrice: string,
  additionalSelectedItem: {
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  if (!additionalSelectedItem) return
  setAdditionalSalePrice(salePrice, setAdditionalSelectedItem)
}

const selectAdditionalInventoryItemWithState = (
  inventoryProducts: any[],
  value: string,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  selectAdditionalInventoryItem(inventoryProducts, value, setAdditionalSelectedItem)
}

const toggleAdditionalItemWithState = (
  hasAdditionalItem: boolean,
  setHasAdditionalItem: React.Dispatch<React.SetStateAction<boolean>>,
  setAdditionalSelectedItem: React.Dispatch<React.SetStateAction<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
  } | null>>
) => {
  toggleAdditionalItem(hasAdditionalItem, setHasAdditionalItem, setAdditionalSelectedItem)
}

const toggleTradeInWithState = (
  hasTradeIn: boolean,
  setHasTradeIn: React.Dispatch<React.SetStateAction<boolean>>
) => {
  toggleTradeIn(hasTradeIn, setHasTradeIn)
}

const handleTradeInCategoryChangeWithState = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  category: string
) => {
  handleTradeInCategoryChange(setTradeIn, category)
}

const handleTradeInModelChangeWithState = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  modelIdx: number
) => {
  handleTradeInModelChange(setTradeIn, modelIdx)
}

const handleTradeInImeiChangeWithState = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  value: string
) => {
  handleTradeInImeiChange(setTradeIn, value)
}

const handleTradeInSimpleChangeWithState = (
  setTradeIn: React.Dispatch<React.SetStateAction<TradeInState>>,
  partial: Partial<TradeInState>
) => {
  handleTradeInChange(setTradeIn, partial)
}

const getTradeInCalculation = (
  tradeIn: TradeInState,
  tradeInModel: any,
  hasTradeIn: boolean,
  inventoryProducts: any[]
) => calculateTradeInValue(tradeIn, tradeInModel, hasTradeIn, inventoryProducts)

const getTradeInStatus = (
  tradeIn: TradeInState,
  tradeInModel: any,
  saleNotes: string
) => resolveTradeInInventoryStatus(tradeIn, tradeInModel, saleNotes)

const getTradeInStatusLabel = (
  tradeIn: TradeInState,
  tradeInModel: any,
  saleNotes: string
) => getTradeInStatusText(tradeIn, tradeInModel, saleNotes)

const createInventoryItemForTradeIn = createTradeInInventoryItem
const uploadPhotosForTradeIn = uploadTradeInPhotos
const linkSaleTradeIn = updateSaleTradeInLink
const linkTradeInInventory = updateTradeInWithInventoryLink
const mockInStock: InventoryProduct[] = []

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{eyebrow}</p>}
        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  tone = "royal",
}: {
  checked: boolean
  onChange: () => void
  tone?: "royal" | "warning"
}) {
  const activeColor = tone === "warning" ? "bg-warning-500" : "bg-royal-500"
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors ${checked ? activeColor : "bg-gray-300"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  )
}

const classifyAdditionalItem = (product: InventoryProduct | any) => {
  const text = `${product.name || ""} ${product.condition_notes || ""}`.toLowerCase()
  if (/(capa|pel[ií]cula|fone|airpods|cabo|fonte|carregador|pencil|caneta|case|adaptador|suporte)/i.test(text)) {
    return "accessory"
  }
  return "device"
}

function NewSaleContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
  const [customer, setCustomer] = useState({ name: "", cpf: "", phone: "", email: "" })
  const [customerNotes, setCustomerNotes] = useState("")
  const [customerEditableNotes, setCustomerEditableNotes] = useState("")
  const [existingCustomerFound, setExistingCustomerFound] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [salePrice, setSalePrice] = useState("")
  const [salePriceInput, setSalePriceInput] = useState("")
  const [isSalePriceManual, setIsSalePriceManual] = useState(false)
  const [supplierCostInput, setSupplierCostInput] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [isReservation, setIsReservation] = useState(false)
  const [paymentDueDate, setPaymentDueDate] = useState("")
  const [warrantyMonths, setWarrantyMonths] = useState("3")
  const [hasTradeIn, setHasTradeIn] = useState(false)
  const [tradeIn, setTradeIn] = useState({ category: "", modelIdx: 0, storage: "", color: "", imei: "", grade: "", batteryHealth: "", value: "" })
  const [saleNotes, setSaleNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Additional item (upsell / brinde) — selecionado do estoque ──
  const [hasAdditionalItem, setHasAdditionalItem] = useState(false)
  const [additionalSelectedItem, setAdditionalSelectedItem] = useState<{
    itemId: string
    name: string
    cost: number
    type: "upsell" | "free"
    salePrice: string
    qty: number
    availableQty: number
  } | null>(null)
  const [additionalSearchTerm, setAdditionalSearchTerm] = useState("")
  const [additionalFilter, setAdditionalFilter] = useState<"all" | "accessory" | "device">("accessory")
  const [tradeInModelSearch, setTradeInModelSearch] = useState("")
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const defaultFees: Record<string, number> = { ...SIDEPAY_FEE_PCTS }
  const [fees, setFees] = useState<Partial<Record<string, number>>>(defaultFees)

  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectId = searchParams.get("product")
  const tradeinParam = searchParams.get("tradein")

  const handleTradeInChange = useCallback((partial: Partial<TradeInState>) => {
    setTradeIn((prev) => ({ ...prev, ...partial }))
  }, [])

  const calculateTradeInValue = useCallback(() => {
    return parseFloat(tradeIn.value) || 0
  }, [tradeIn.value])

  // Pre-fill trade-in from evaluation page
  useEffect(() => {
    if (!tradeinParam) return
    try {
      const data = JSON.parse(atob(decodeURIComponent(tradeinParam)))
      setHasTradeIn(true)
      // Find category from model name
      for (const [cat, info] of Object.entries(PRODUCT_CATALOG)) {
        const foundIdx = info.models.findIndex((m: any) => m.name === data.model)
        if (foundIdx >= 0) {
          setTradeIn({
            category: cat,
            modelIdx: foundIdx,
            storage: data.storage || "",
            color: data.color || "",
            imei: data.imei || "",
            grade: data.grade || "",
            batteryHealth: data.batteryHealth || "",
            value: data.suggestedValue?.toString() || "",
          })
          if (data.notes) setSaleNotes(data.notes)
          break
        }
      }
      toast({ title: "Avaliação importada!", description: `Valor sugerido: ${formatBRL(data.suggestedValue)}`, type: "success" })
    } catch {
      console.error("Erro ao ler avaliação:", tradeinParam)
    }
  }, [tradeinParam])

  // Fetch inventory — only products that are in stock (not sold)
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const { data, error } = await supabase
          .from("inventory")
          .select("id, imei, imei2, serial_number, purchase_price, suggested_price, battery_health, status, quantity, condition_notes, notes, type, supplier_name, catalog:catalog_id(model, variant, storage, color)")
          .in("status", ["active", "in_stock"] as any)
          .order("created_at", { ascending: false })

        if (error) throw error

        const products = (data || []).map((item: any) => {
          return {
            id: item.id,
            name: getProductName(item),
            imei: item.imei || "",
            imei2: item.imei2 || "",
            serial_number: item.serial_number || "",
            condition_notes: item.condition_notes || null,
            cost: item.purchase_price || 0,
            suggested: item.suggested_price || 0,
            battery: item.battery_health || 0,
            status: item.status || "active",
            type: item.type || "own",
            supplier_name: item.supplier_name || null,
            quantity: Math.max(1, Number(item.quantity || 1)),
          }
        })
        setInventoryProducts(products)
      } catch (err) {
        console.error("Erro ao carregar inventário:", err)
      } finally {
        setLoadingInventory(false)
      }
    }
    fetchInventory()
  }, [])

  // If opened from a product detail page, fetch that product and pre-select
  useEffect(() => {
    if (!preselectId) return
    const fetchProduct = async () => {
      try {
        const { data: items, error } = await (supabase.from("inventory") as any)
          .select("id, imei, imei2, serial_number, purchase_price, suggested_price, battery_health, status, quantity, condition_notes, notes, type, supplier_name, catalog:catalog_id(model, variant, storage, color)")
          .eq("id", preselectId)
          .single()

        if (error || !items) {
          toast({ title: "Produto não encontrado", description: "Não foi possível carregar o produto selecionado.", type: "error" })
          return
        }

        if (items.status === "sold" || items.status === "reserved") {
          toast({ title: items.status === "reserved" ? "Produto reservado" : "Produto já vendido", description: "Este aparelho não está disponível para nova venda.", type: "error" })
          return
        }

        const product = {
          id: items.id,
          name: getProductName(items),
          imei: items.imei || "",
          imei2: items.imei2 || "",
          serial_number: items.serial_number || "",
          condition_notes: items.condition_notes || null,
          cost: items.purchase_price || 0,
          suggested: items.suggested_price || 0,
          battery: items.battery_health || 0,
          status: items.status || "active",
          type: items.type || "own",
          supplier_name: items.supplier_name || null,
          quantity: Math.max(1, Number(items.quantity || 1)),
        }
        const initialPrice = product.suggested.toString()
        setSelectedProduct(product)
        setSalePrice(initialPrice)
        setSalePriceInput(initialPrice)
        setIsSalePriceManual(false)
      } catch {
        toast({ title: "Erro ao carregar produto", type: "error" })
      }
    }
    fetchProduct()
  }, [preselectId, toast])

  // Merge bank values into Sidepay defaults.
  useEffect(() => {
    const fetchFees = async () => {
      try {
        const { data, error } = await (supabase.from("financial_settings") as any).select("*").limit(1).single()
        if (!error && data) {
          const readFee = (method: string, key: string) => {
            const value = data[key]
            if (value === null || value === undefined || value === "") return SIDEPAY_FEE_PCTS[method] ?? 0
            return normalizePaymentFeePct(method, Number(value))
          }

          setFees({
            cash: readFee("cash", "cash_discount_pct"),
            pix: readFee("pix", "pix_fee_pct"),
            debit: readFee("debit", "debit_fee_pct"),
            credit_1x: readFee("credit_1x", "credit_1x_fee_pct"),
            credit_2x: readFee("credit_2x", "credit_2x_fee_pct"),
            credit_3x: readFee("credit_3x", "credit_3x_fee_pct"),
            credit_4x: readFee("credit_4x", "credit_4x_fee_pct"),
            credit_5x: readFee("credit_5x", "credit_5x_fee_pct"),
            credit_6x: readFee("credit_6x", "credit_6x_fee_pct"),
            credit_7x: readFee("credit_7x", "credit_7x_fee_pct"),
            credit_8x: readFee("credit_8x", "credit_8x_fee_pct"),
            credit_9x: readFee("credit_9x", "credit_9x_fee_pct"),
            credit_10x: readFee("credit_10x", "credit_10x_fee_pct"),
            credit_11x: readFee("credit_11x", "credit_11x_fee_pct"),
            credit_12x: readFee("credit_12x", "credit_12x_fee_pct"),
            credit_13x: readFee("credit_13x", "credit_13x_fee_pct"),
            credit_14x: readFee("credit_14x", "credit_14x_fee_pct"),
            credit_15x: readFee("credit_15x", "credit_15x_fee_pct"),
            credit_16x: readFee("credit_16x", "credit_16x_fee_pct"),
            credit_17x: readFee("credit_17x", "credit_17x_fee_pct"),
            credit_18x: readFee("credit_18x", "credit_18x_fee_pct"),
          })
        }
      } catch {
        // Defaults already set in useState
      }
    }
    fetchFees()
  }, [])

  const filteredProducts = useMemo(() => {
    const products = inventoryProducts
    if (!searchTerm) return products
    const term = searchTerm.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.imei?.toLowerCase().includes(term) ||
        p.serial_number?.toLowerCase().includes(term)
    )
  }, [searchTerm, inventoryProducts])

  // Preco unitario e totais
  const unitPrice = parseFloat(salePrice) || 0
  const totalBasePrice = unitPrice * quantity

  // Upsell price (brinde não entra no total pago pelo cliente)
  const upsellTotal = additionalSelectedItem?.type === "upsell"
    ? (parseFloat(additionalSelectedItem.salePrice) || 0) * (additionalSelectedItem.qty || 1)
    : 0

  // Total final da venda: produto principal + upsell
  const finalTotal = totalBasePrice + upsellTotal

  // Lucro base do produto principal (por unidade): independe do método de pagamento
  const baseProfit = useMemo(() => {
    if (!selectedProduct || !salePrice) return 0
    const supplierCost = parseFloat(supplierCostInput) || 0
    const effectiveCost = selectedProduct.type === "supplier" ? supplierCost : selectedProduct.cost
    return unitPrice - effectiveCost
  }, [selectedProduct, salePrice, unitPrice, supplierCostInput])

  // Lucro base TOTAL considerando quantidade
  const totalBaseProfit = useMemo(() => {
    return baseProfit * quantity
  }, [baseProfit, quantity])

  // Lucro adicional (upsell ou brinde)
  const additionalProfit = useMemo(() => {
    if (!additionalSelectedItem) return 0
    if (additionalSelectedItem.type === "upsell") {
      return (parseFloat(additionalSelectedItem.salePrice) || 0) * (additionalSelectedItem.qty || 1) - additionalSelectedItem.cost * (additionalSelectedItem.qty || 1)
    }
    return -additionalSelectedItem.cost * (additionalSelectedItem.qty || 1)
  }, [additionalSelectedItem])

  // Lucro total: principal + adicionais
  const totalProfit = useMemo(() => {
    return totalBaseProfit + additionalProfit
  }, [totalBaseProfit, additionalProfit])

  const getAvailableQty = useCallback((product?: Pick<InventoryProduct, "quantity" | "type"> | null) => {
    if (!product || product.type === "supplier") return 1
    return Math.max(1, Number(product.quantity || 1))
  }, [])

  const clampQty = useCallback((value: number, max: number) => {
    return Math.max(1, Math.min(max, Number.isFinite(value) ? value : 1))
  }, [])

  // Quantidade máxima disponível no item selecionado.
  const maxAvailableQty = useMemo(() => {
    return getAvailableQty(selectedProduct)
  }, [selectedProduct, getAvailableQty])

  useEffect(() => {
    setQuantity((current) => clampQty(current, maxAvailableQty))
  }, [maxAvailableQty, clampQty])

  useEffect(() => {
    if (!additionalSelectedItem) return
    setAdditionalSelectedItem((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        qty: clampQty(previous.qty, previous.availableQty),
      }
    })
  }, [additionalSelectedItem?.availableQty, clampQty])

  const updateInventoryStock = useCallback(async (productId: string, soldQty: number, finalStatus: "sold" | "reserved") => {
    const { data, error } = await (supabase.from("inventory") as any)
      .select("quantity,status")
      .eq("id", productId)
      .single()

    if (error) throw error

    const currentQty = Math.max(1, Number(data?.quantity || 1))
    const nextQty = Math.max(0, currentQty - Math.max(1, soldQty))

    if (nextQty > 0) {
      const { error: updateError } = await (supabase.from("inventory") as any)
        .update({ quantity: nextQty, status: "in_stock" })
        .eq("id", productId)
      if (updateError) throw updateError
      return
    }

    await atualizarStatusEstoque(productId, finalStatus)
  }, [])

  const commitSalePriceInput = useCallback(() => {
    const parsed = parseFloat(salePriceInput)
    if (!parsed || parsed <= 0) {
      setSalePriceInput(salePrice || "")
      setIsSalePriceManual(false)
      return
    }
    setSalePrice(parsed.toString())
    setSalePriceInput(parsed.toString())
    setIsSalePriceManual(false)
  }, [salePriceInput, salePrice])

  const handleSalePriceKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commitSalePriceInput()
    }
  }, [commitSalePriceInput])

  useEffect(() => {
    if (!isSalePriceManual) {
      setSalePriceInput(salePrice)
    }
  }, [salePrice, isSalePriceManual])

  const selectProduct = (product: typeof mockInStock[0]) => {
    const initialPrice = product.suggested.toString()
    setSelectedProduct(product)
    setSalePrice(initialPrice)
    setSalePriceInput(initialPrice)
    setIsSalePriceManual(false)
    setQuantity(1)
  }

  const clearSelectedProduct = () => {
    setSelectedProduct(null)
    setSalePrice("")
    setSalePriceInput("")
    setSupplierCostInput("")
    setQuantity(1)
    setPaymentMethod("")
    setAdditionalSelectedItem(null)
    setHasAdditionalItem(false)
  }

  const updateCustomer = (field: string, value: string) => {
    if (field === "cpf") value = maskCPF(value)
    if (field === "phone") value = formatPhone(value)
    setCustomer((prev) => ({ ...prev, [field]: value }))
  }

  // Lookup customer by CPF as they type
  const handleCpfChange = async (value: string) => {
    const formatted = maskCPF(value)
    setCustomer((prev) => ({ ...prev, cpf: formatted }))

    if (formatted.length >= 14 && validateCPF(formatted)) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: userData } = await (supabase
          .from("users")
          .select("company_id")
          .eq("id", user.id)
          .single() as any)

        if (!userData?.company_id) return

        const { data: existing } = await (supabase
          .from("customers")
          .select("full_name, phone, email, notes")
          .match({ cpf: formatted, company_id: userData.company_id })
          .maybeSingle() as any)

        if (existing) {
          setCustomer((prev) => ({
            ...prev,
            name: existing.full_name,
            phone: existing.phone || prev.phone,
            email: existing.email || prev.email,
          }))
          setCustomerNotes(existing.notes || "")
          setExistingCustomerFound(true)
        }
      } catch { /* ignore lookup errors */ }
    } else {
      setExistingCustomerFound(false)
    }
  }

  // Trade-in helpers (mirrors cadastro de estoque)
  const tradeInModels = useMemo(() => {
    const cat = PRODUCT_CATALOG[tradeIn.category as keyof typeof PRODUCT_CATALOG]
    return cat ? cat.models : []
  }, [tradeIn.category])

  const tradeInModel = tradeInModels[tradeIn.modelIdx] || null

  const tradeInSupplierMatches = useMemo(() => {
    if (!tradeIn.category || !tradeInModel) return [] as any[]
    return inventoryProducts.filter((p: any) => p.name?.includes(tradeInModel.name))
      .map((p: any) => ({ price: p.cost }))
  }, [tradeIn.category, tradeInModel, inventoryProducts])

  const tradeInEvaluation = useMemo(() => {
    if (!hasTradeIn || !tradeInModel) return null
    return calculateDeviceValue({
      grade: tradeIn.grade,
      batteryHealth: tradeIn.batteryHealth ? parseInt(tradeIn.batteryHealth) : undefined,
      manualValue: tradeIn.value ? Number(tradeIn.value) : undefined,
      matchingPrices: tradeInSupplierMatches,
    })
  }, [hasTradeIn, tradeInModel, tradeIn.grade, tradeIn.batteryHealth, tradeIn.value, tradeInSupplierMatches])

  const tradeInSuggestedDisplay = useMemo(() => {
    if (!tradeInEvaluation) return formatBRL(0)
    return formatTradeInSuggestedRange(tradeInEvaluation.roundedValue)
  }, [tradeInEvaluation])

  useEffect(() => {
    if (!hasTradeIn || !tradeInEvaluation) return
    if (!tradeIn.value) {
      setTradeIn((prev) => ({ ...prev, value: String(tradeInEvaluation.roundedValue || "") }))
    }
  }, [hasTradeIn, tradeInEvaluation])

  const getTradeInInventoryStatus = useCallback(() => {
    const inferred = getComputedInventoryStatus({
      status: "pending",
      purchase_price: Number(tradeIn.value || 0),
      purchase_date: new Date().toISOString().split("T")[0],
      grade: tradeIn.grade || null,
      imei: tradeIn.imei || null,
      serial_number: null,
      catalog_id: null,
      notes: tradeInModel?.name || null,
      condition_notes: saleNotes || null,
    })
    return inferred
  }, [tradeIn.value, tradeIn.grade, tradeIn.imei, tradeInModel, saleNotes])

  const getTradeInInventoryStatusText = useCallback(() => {
    return getTradeInSummaryStatus(getTradeInInventoryStatus())
  }, [getTradeInInventoryStatus])

  const uploadTradeInPhotos = useCallback(async (companyId: string, saleId: string): Promise<string[]> => {
    void companyId
    void saleId
    return []
  }, [])

  const createTradeInInventoryItem = useCallback(async (params: {
    companyId: string
    saleId: string
    tradeInValue: number
    status: string
  }) => {
    if (!tradeInModel) return null

    const { data, error } = await (supabase.from("inventory") as any).insert({
      company_id: params.companyId,
      catalog_id: null,
      imei: tradeIn.imei || null,
      serial_number: null,
      grade: tradeIn.grade || null,
      condition_notes: saleNotes || null,
      purchase_price: params.tradeInValue,
      purchase_date: new Date().toISOString().split("T")[0],
      type: "own",
      supplier_name: null,
      origin: "trade_in",
      source_sale_id: params.saleId,
      suggested_price: null,
      photos: null,
      notes: tradeInModel.name,
      quantity: 1,
      status: params.status,
    }).select("id,status").single()

    if (error) {
      console.error("Erro ao criar item de estoque trade-in:", error)
      return null
    }

    return data
  }, [tradeIn, tradeInModel, saleNotes])

  const updateSaleTradeInLink = useCallback(async (saleId: string, tradeInId: string) => {
    const { error } = await (supabase.from("sales") as any)
      .update({ trade_in_id: tradeInId })
      .eq("id", saleId)

    if (error) {
      console.error("Erro ao vincular trade-in à venda:", error)
    }
  }, [])

  const updateTradeInWithInventoryLink = useCallback(async (tradeInId: string, inventoryId?: string | null) => {
    if (!inventoryId) return
    const { error } = await (supabase.from("trade_ins") as any)
      .update({ linked_inventory_id: inventoryId, status: "added_to_stock" })
      .eq("id", tradeInId)

    if (error) {
      console.error("Erro ao vincular trade-in ao estoque:", error)
    }
  }, [])

  const getPaymentMethodLabel = (method: string) => {
    if (method === "trade_in_return") return "Troco no trade-in"
    return PAYMENT_METHODS.find((item) => item.value === method)?.label || method
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const today = todayISO()
      const warrantyEnd = addDaysISO(today, parseInt(warrantyMonths) * 30)

      // 0. Get user's company_id (required for RLS on all inserts)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const { data: userData } = await (supabase
        .from("users") as any)
        .select("company_id")
        .eq("id", user.id)
        .single()
      if (!userData?.company_id) throw new Error("Empresa não encontrada")
      const companyId = userData.company_id

      // 1. Create or find customer
      let customerId = null

      // Search by CPF if available, otherwise search by name+email
      if (customer.name) {
        let searchQuery
        if (customer.cpf && customer.cpf.length >= 14) {
          searchQuery = ((supabase
            .from("customers") as any)
            .select("id")
            .match({ cpf: customer.cpf, company_id: companyId }))
        } else if (customer.email) {
          searchQuery = ((supabase
            .from("customers") as any)
            .select("id")
            .match({ email: customer.email, company_id: companyId }))
        } else {
          searchQuery = ((supabase
            .from("customers") as any)
            .select("id")
            .match({ full_name: customer.name, company_id: companyId }))
        }

        const { data: existingCustomer, error: searchError } = await searchQuery.maybeSingle()

        if (existingCustomer) {
          customerId = existingCustomer.id
        } else {
          // Create new customer
          const customerNotesValue = customerNotes || customerEditableNotes || null
            const { data: newCustomer, error: insertError } = await ((supabase
              .from("customers") as any)
              .insert({
                company_id: companyId,
                full_name: customer.name,
                cpf: (customer.cpf && customer.cpf.length >= 14) ? customer.cpf : null,
                phone: customer.phone || null,
                email: customer.email || null,
                notes: customerNotesValue,
              })
              .select("id")
              .single() as any)

          if (insertError) {
            console.error("Erro ao criar cliente:", insertError)
            throw new Error(insertError.message)
          }
          customerId = newCustomer?.id
        }
      }

      // 2. Register the sale (sale_price = total including quantity)
      const { data: sale, error: saleError } = await (supabase
        .from("sales") as any)
        .insert({
          company_id: companyId,
          inventory_id: selectedProduct!.id,
          customer_id: customerId,
          sale_price: finalTotal,
          payment_method: paymentMethod || (storeAmountDue > 0 ? "trade_in_return" : null),
          warranty_months: parseInt(warrantyMonths),
          warranty_start: today,
          warranty_end: warrantyEnd,
          source_type: selectedProduct?.type || "own",
          supplier_name: selectedProduct?.type === "supplier" ? (selectedProduct.supplier_name || null) : null,
          supplier_cost: selectedProduct?.type === "supplier" ? (parseFloat(supplierCostInput) || 0) : null,
          sale_status: isReservation ? "reserved" : "completed",
          payment_due_date: isReservation ? paymentDueDate : null,
          sale_date: today,
          notes: quantity > 1 ? `[${quantity}x ${selectedProduct!.name}]` + (saleNotes ? `\n${saleNotes}` : "") : saleNotes || null,
          has_trade_in: hasTradeIn,
        })
        .select()
        .single()

      if (saleError) {
        console.error("Erro ao registrar venda:", saleError)
        throw new Error(saleError.message)
      }

      if (selectedProduct?.type !== "supplier") {
        await updateInventoryStock(selectedProduct!.id, quantity, isReservation ? "reserved" : "sold")
      }

      // 2b. Save additional item (upsell / brinde) with quantity
      if (additionalSelectedItem) {
        const qty = additionalSelectedItem.qty || 1
        const itemSalePrice = additionalSelectedItem.type === "upsell"
          ? parseFloat(additionalSelectedItem.salePrice) * qty
          : 0

        await (supabase.from("sales_additional_items") as any).insert({
          company_id: companyId,
          sale_id: sale.id,
          product_id: additionalSelectedItem.itemId,
          type: additionalSelectedItem.type,
          name: additionalSelectedItem.name,
          cost_price: additionalSelectedItem.cost * qty,
          sale_price: itemSalePrice,
        })

        // Update inventory status for additional item
        try {
          // First verify the item is still in stock
          const { data: inventoryItem, error: checkError } = await (supabase
            .from("inventory") as any)
            .select("status")
            .eq("id", additionalSelectedItem.itemId)
            .single()

          if (checkError) {
            console.error("Erro ao verificar estoque do item adicional:", checkError)
          } else if (!["active", "in_stock"].includes(inventoryItem?.status)) {
            console.warn(`Item adicional ${additionalSelectedItem.itemId} não está mais em estoque. Status: ${inventoryItem?.status}`)
            // We still proceed, but log a warning
          }

          await updateInventoryStock(additionalSelectedItem.itemId, qty, isReservation ? "reserved" : "sold")
        } catch (invError) {
          console.error("Erro ao atualizar estoque do item adicional:", invError)
          // Não fazemos throw aqui para não quebrar o fluxo principal
          // Mas registramos o erro para debug
        }
      }

      // 3. Handle trade-in if active
      if (hasTradeIn && tradeInModels[tradeIn.modelIdx]) {
        const tradeInValue = parseFloat(tradeIn.value) || 0
        const uploadedTradeInPhotos = await uploadTradeInPhotos(companyId, sale.id)

        const { data: tradeInRow, error: tradeInError } = await ((supabase
          .from("trade_ins") as any)
          .insert({
            company_id: companyId,
            imei: tradeIn.imei || null,
            grade: tradeIn.grade || null,
            trade_in_value: tradeInValue,
            status: "received",
            photos: uploadedTradeInPhotos.length > 0 ? uploadedTradeInPhotos : null,
            notes: tradeInModels[tradeIn.modelIdx].name,
            condition_notes: saleNotes || null,
          })
          .select("id")
          .single())

        if (tradeInError) {
          console.error("Erro ao registrar trade-in:", tradeInError)
        } else if (tradeInRow?.id) {
          await updateSaleTradeInLink(sale.id, tradeInRow.id)

          const inferredStatus = getTradeInInventoryStatus()
          const inventoryTradeIn = await createTradeInInventoryItem({
            companyId,
            saleId: sale.id,
            tradeInValue,
            status: inferredStatus,
          })

          await updateTradeInWithInventoryLink(tradeInRow.id, inventoryTradeIn?.id)
        }
      }

      if (!isReservation) try {
        const additionalItemsSummary = additionalSelectedItem
          ? `${additionalSelectedItem.qty || 1}x ${getAdditionalItemDisplayName(additionalSelectedItem.name)}${additionalSelectedItem.type === "free" ? " (brinde)" : ""}`
          : null
        const documentNotes = [selectedProduct?.condition_notes, saleNotes].filter(Boolean).join(". ")
        const documentData: SaleDocumentData = {
          saleId: sale.id,
          saleDate: today,
          customerName: customer.name,
          customerCpf: customer.cpf || null,
          customerPhone: customer.phone || null,
          paymentMethod: getPaymentMethodLabel(paymentMethod || (storeAmountDue > 0 ? "trade_in_return" : "")),
          saleNotes: documentNotes || null,
          additionalItems: additionalItemsSummary,
          item: {
            name: selectedProduct!.name,
            imei: selectedProduct!.imei,
            imei2: selectedProduct!.imei2 || null,
            quantity,
            unitPrice,
            totalPrice: finalTotal,
            warrantyMonths: parseInt(warrantyMonths),
          },
        }

        await generateReceiptPDF(documentData)
        await generateWarrantyPDF(documentData)
      } catch (pdfError) {
        console.error("Erro ao gerar recibo/garantia:", pdfError)
        toast({
          title: "Venda registrada, mas os PDFs não foram gerados",
          description: "Confira o bloqueio de downloads do navegador e tente registrar/emitir novamente.",
          type: "error",
        })
      }

      if (isReservation && amountAfterTradeIn > 0) {
        await (supabase.from("transactions") as any).insert({
          company_id: companyId,
          type: "income",
          category: "Venda de produtos",
          description: `Reserva · ${selectedProduct!.name}`,
          amount: amountAfterTradeIn,
          date: today,
          due_date: paymentDueDate,
          payment_method: paymentMethod,
          status: "pending",
          source_type: "sale",
          source_id: sale.id,
        })
      }

      toast({
        title: isReservation ? "Venda reservada!" : "Venda registrada!",
        description: isReservation
          ? `Reserva de ${selectedProduct!.name} criada até ${paymentDueDate.split("-").reverse().join("/")}.`
          : `Venda de ${selectedProduct!.name} concluída com sucesso. Recibo e garantia emitidos.`,
        type: "success",
      })
      router.push("/vendas")
    } catch (error) {
      console.error("Erro completo no handleConfirm:", error)
      const errorMessage = error instanceof Error ? error.message : "Erro inesperado"
      toast({
        title: "Erro ao registrar venda",
        description: errorMessage,
        type: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const visibleProducts = filteredProducts.slice(0, searchTerm || !selectedProduct ? 12 : 6)
  const productIdentity = selectedProduct
    ? [selectedProduct.imei ? `IMEI ${selectedProduct.imei}` : null, selectedProduct.serial_number ? `Serial ${selectedProduct.serial_number}` : null]
        .filter(Boolean)
        .join(" · ")
    : ""
  const tradeInValue = hasTradeIn ? calculateTradeInValue() : 0
  const balanceAfterTradeIn = finalTotal - tradeInValue
  const customerAmountDue = Math.max(0, balanceAfterTradeIn)
  const storeAmountDue = Math.max(0, -balanceAfterTradeIn)
  const selectedPayment = paymentMethod
    ? calculatePaymentPrice(customerAmountDue, paymentMethod, fees as any)
    : null
  const selectedPaymentLabel = paymentMethod
    ? getPaymentMethodLabel(paymentMethod)
    : storeAmountDue > 0
      ? "Downgrade / troco ao cliente"
      : customerAmountDue === 0 && hasTradeIn
        ? "Trade-in cobre a venda"
      : "Não escolhido"
  const creditMethods = PAYMENT_METHODS.filter((item) => item.value.startsWith("credit_"))
  const quickPaymentMethods = PAYMENT_METHODS.filter((item) => ["cash", "pix", "debit"].includes(item.value))
  const isCreditPayment = paymentMethod.startsWith("credit_")
  const amountAfterTradeIn = customerAmountDue
  const additionalCandidates = useMemo(() => {
    const term = additionalSearchTerm.trim().toLowerCase()
    return inventoryProducts
      .filter((item) => item.id !== selectedProduct?.id)
      .filter((item) => additionalFilter === "all" || classifyAdditionalItem(item) === additionalFilter)
      .filter((item) => {
        if (!term) return true
        return [item.name, item.imei, item.serial_number, item.condition_notes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      })
      .slice(0, 10)
  }, [inventoryProducts, selectedProduct?.id, additionalFilter, additionalSearchTerm])
  const tradeInModelOptions = useMemo(() => {
    const term = tradeInModelSearch.trim().toLowerCase()
    return Object.entries(PRODUCT_CATALOG)
      .filter(([category]) => category === "iphone" || category === "ipad")
      .flatMap(([category, info]) =>
        info.models.map((model: any, index: number) => ({
          category,
          categoryLabel: PRODUCT_CATALOG[category as keyof typeof PRODUCT_CATALOG].label,
          model,
          index,
        }))
      )
      .filter((item) => !term || item.model.name.toLowerCase().includes(term))
      .slice(0, 8)
  }, [tradeInModelSearch])
  const tradeInReferenceStatus = useMemo(() => {
    if (!hasTradeIn || !tradeInModel) {
      return {
        label: "Escolha um modelo",
        description: "Busque iPhone ou iPad para comparar com sua base de avaliação.",
        badge: "gray" as const,
      }
    }

    if (!tradeInEvaluation?.hasReferencePrices) {
      return {
        label: "Sem referência",
        description: "Ainda não há histórico suficiente desse modelo para comparar preço.",
        badge: "yellow" as const,
      }
    }

    const value = Number(tradeIn.value || 0)
    const suggested = tradeInEvaluation.roundedValue || tradeInEvaluation.suggestedValue

    if (!value || !suggested) {
      return {
        label: "Informe o valor",
        description: `Faixa sugerida: ${formatTradeInSuggestedRange(suggested)}.`,
        badge: "blue" as const,
      }
    }

    if (value > suggested * 1.12) {
      return {
        label: "Acima do mercado",
        description: `Você está pagando acima da faixa sugerida (${formatTradeInSuggestedRange(suggested)}). Pode prosseguir, mas revise a margem.`,
        badge: "red" as const,
      }
    }

    if (value < suggested * 0.82) {
      return {
        label: "Boa margem",
        description: `Valor abaixo da referência. Faixa sugerida: ${formatTradeInSuggestedRange(suggested)}.`,
        badge: "green" as const,
      }
    }

    return {
      label: "Dentro da faixa",
      description: `Valor dentro da referência. Faixa sugerida: ${formatTradeInSuggestedRange(suggested)}.`,
      badge: "green" as const,
    }
  }, [hasTradeIn, tradeInModel, tradeInEvaluation, tradeIn.value])
  const canFinishSale = Boolean(
    selectedProduct &&
    customer.name &&
    validateCPF(customer.cpf) &&
    salePrice &&
    (paymentMethod || customerAmountDue === 0) &&
    (!isReservation || paymentDueDate) &&
    (selectedProduct?.type !== "supplier" || supplierCostInput)
  )

  return (
    <div className="animate-fade-in space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nova venda</p>
          <h1 className="text-2xl font-bold text-navy-900">Caixa de venda</h1>
          <p className="text-sm text-gray-500">Busque o produto, monte o carrinho e feche a venda sem atravessar um formulário comprido.</p>
        </div>
        <Badge variant={isReservation ? "yellow" : "green"} dot>
          {isReservation ? "Reserva / receber depois" : "Venda imediata"}
        </Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <SectionCard eyebrow="1. Produto" title="Produto principal" description="Busque por nome, IMEI ou número de série.">
            <Input
              placeholder="Buscar no estoque..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              icon={<Search className="h-4 w-4" />}
              className="mb-3"
            />

            {selectedProduct && (
              <div className="mb-3 rounded-2xl border border-royal-500/20 bg-royal-100/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-royal-700">Selecionado</p>
                    <h3 className="truncate text-lg font-bold text-navy-900">{selectedProduct.name}</h3>
                    <p className="text-sm text-gray-500">{productIdentity || "Sem IMEI/serial informado"}</p>
                    <p className="mt-1 text-xs font-semibold text-royal-700">
                      {maxAvailableQty} unidade(s) disponível(is) no estoque
                    </p>
                    {selectedProduct?.type === "supplier" && selectedProduct.supplier_name && (
                      <p className="mt-1 text-xs text-gray-500">Fornecedor: {selectedProduct.supplier_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-gray-400">Custo</p>
                      <p className="text-sm font-semibold text-navy-900">{formatBRL(selectedProduct.cost)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={clearSelectedProduct}>
                      Trocar
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Input
                    label="Preço de venda"
                    type="number"
                    value={salePriceInput}
                    onChange={(event) => {
                      setIsSalePriceManual(true)
                      setSalePriceInput(event.target.value)
                    }}
                    onBlur={commitSalePriceInput}
                    onKeyDown={handleSalePriceKeyDown}
                  />
                  <Input
                    label="Quantidade"
                    type="number"
                    min={1}
                    max={maxAvailableQty}
                    value={quantity}
                    onChange={(event) => setQuantity(clampQty(parseInt(event.target.value) || 1, maxAvailableQty))}
                  />
                  {selectedProduct.type === "supplier" ? (
                    <Input label="Custo fornecedor" type="number" value={supplierCostInput} onChange={(event) => setSupplierCostInput(event.target.value)} />
                  ) : (
                    <div className="rounded-xl border border-gray-100 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Lucro estimado</p>
                      <p className={`mt-1 text-xl font-bold ${totalProfit >= 0 ? "text-success-500" : "text-danger-500"}`}>{formatBRL(totalProfit)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {loadingInventory ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Carregando estoque...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Nenhum produto disponível encontrado.</div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProduct(product)}
                    className={`rounded-2xl border p-3 text-left transition-all hover:border-royal-500 hover:bg-royal-100/20 ${
                      selectedProduct?.id === product.id ? "border-royal-500 bg-royal-100/30" : "border-gray-100 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy-900">{product.name}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {[product.imei ? `IMEI ${product.imei}` : null, product.serial_number ? `Serial ${product.serial_number}` : null, product.battery ? `${product.battery}% bateria` : null].filter(Boolean).join(" · ") || "Sem identificação"}
                        </p>
                      </div>
                      <Badge variant={classifyAdditionalItem(product) === "accessory" ? "blue" : "gray"}>
                        {classifyAdditionalItem(product) === "accessory" ? "Acessório" : "Aparelho"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <p className="text-xs text-gray-400">
                        Custo {formatBRL(product.cost)} · {getAvailableQty(product)} disp.
                      </p>
                      <p className="font-bold text-navy-900">{formatBRL(product.suggested)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard eyebrow="2. Cliente" title="Dados do cliente" description="CPF válido continua sendo usado para localizar ou cadastrar o cliente.">
            {existingCustomerFound && (
              <div className="mb-3 rounded-xl border border-success-500/20 bg-success-100/20 p-3 text-sm font-medium text-green-800">
                Cliente encontrado e preenchido automaticamente.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Nome completo" value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} />
              <Input
                label="CPF"
                value={customer.cpf}
                onChange={(event) => handleCpfChange(event.target.value)}
                error={customer.cpf.length >= 14 && !validateCPF(customer.cpf) ? "CPF inválido" : undefined}
              />
              <Input label="Telefone" value={customer.phone} onChange={(event) => updateCustomer("phone", event.target.value)} />
              <Input label="E-mail" type="email" value={customer.email} onChange={(event) => updateCustomer("email", event.target.value)} />
            </div>
            {customerNotes && (
              <div className="mt-3 rounded-xl border border-royal-500/10 bg-royal-100/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-royal-600">Observações do cliente</p>
                <p className="text-sm text-navy-900">{customerNotes}</p>
              </div>
            )}
            {!existingCustomerFound && customer.cpf.length >= 14 && (
              <Input
                label="Observações do cliente"
                placeholder="Ex: prefere WhatsApp, histórico de compra..."
                value={customerEditableNotes}
                onChange={(event) => setCustomerEditableNotes(event.target.value)}
                className="mt-3"
              />
            )}
          </SectionCard>

          <SectionCard eyebrow="3. Carrinho" title="Adicionais e brindes" description="Inclua upsell sem percorrer uma lista gigante. Preço e quantidade do produto principal ficam no próprio produto.">
            <div className="rounded-2xl border border-gray-100 bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-900">Adicionais</p>
                  <p className="text-xs text-gray-500">Use para capa, película, cabo, brinde ou outro produto vendido junto.</p>
                </div>
                <ToggleSwitch
                  checked={hasAdditionalItem}
                  onChange={() => {
                    setHasAdditionalItem(!hasAdditionalItem)
                    if (hasAdditionalItem) setAdditionalSelectedItem(null)
                  }}
                />
              </div>

              {hasAdditionalItem && (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <Input
                      placeholder="Buscar adicional por nome, IMEI ou serial..."
                      value={additionalSearchTerm}
                      onChange={(event) => setAdditionalSearchTerm(event.target.value)}
                      icon={<Search className="h-4 w-4" />}
                    />
                    <div className="flex rounded-xl bg-white p-1">
                      {[
                        { value: "accessory", label: "Acessórios" },
                        { value: "device", label: "Aparelhos" },
                        { value: "all", label: "Todos" },
                      ].map((filter) => (
                        <button
                          key={filter.value}
                          type="button"
                          onClick={() => setAdditionalFilter(filter.value as typeof additionalFilter)}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                            additionalFilter === filter.value ? "bg-navy-900 text-white" : "text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {additionalCandidates.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAdditionalSelectedItem({
                            itemId: item.id,
                            name: item.name,
                            cost: item.cost,
                            type: "upsell",
                            salePrice: item.suggested.toString(),
                            qty: 1,
                            availableQty: getAvailableQty(item),
                          })
                        }}
                        className={`rounded-xl border bg-white p-3 text-left transition-all hover:border-royal-500 ${
                          additionalSelectedItem?.itemId === item.id ? "border-royal-500 ring-2 ring-royal-500/10" : "border-gray-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-navy-900">{getAdditionalItemDisplayName(item.name)}</p>
                            <p className="truncate text-xs text-gray-500">
                              {item.imei || item.serial_number || "Item de estoque"} · {getAvailableQty(item)} disp.
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-navy-900">{formatBRL(item.suggested)}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {additionalSelectedItem && (
                    <div className="rounded-2xl border border-royal-500/20 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-navy-900">{getAdditionalItemDisplayName(additionalSelectedItem.name)}</p>
                          <p className="text-xs text-gray-500">
                            Custo {formatBRL(additionalSelectedItem.cost)} · {additionalSelectedItem.availableQty} disponível(is)
                          </p>
                        </div>
                        <button type="button" className="text-gray-400 hover:text-danger-500" onClick={() => setAdditionalSelectedItem(null)}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="flex rounded-xl bg-surface p-1">
                          {[
                            { value: "upsell", label: "Pago" },
                            { value: "free", label: "Brinde" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setAdditionalSelectedItem((previous) => previous ? { ...previous, type: option.value as "upsell" | "free" } : previous)}
                              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                                additionalSelectedItem.type === option.value ? "bg-navy-900 text-white" : "text-gray-500"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <Input
                          label="Preço"
                          type="number"
                          disabled={additionalSelectedItem.type === "free"}
                          value={additionalSelectedItem.type === "free" ? "0" : additionalSelectedItem.salePrice}
                          onChange={(event) => setAdditionalSelectedItem((previous) => previous ? { ...previous, salePrice: event.target.value } : previous)}
                        />
                        <Input
                          label="Qtd."
                          type="number"
                          min={1}
                          max={additionalSelectedItem.availableQty}
                          value={additionalSelectedItem.qty}
                          onChange={(event) => setAdditionalSelectedItem((previous) => previous ? { ...previous, qty: clampQty(parseInt(event.target.value) || 1, previous.availableQty) } : previous)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard eyebrow="4. Pagamento" title="Forma de pagamento" description="Escolha crédito uma vez e defina a parcela abaixo.">
            {storeAmountDue > 0 && (
              <div className="mb-4 rounded-2xl border border-warning-500/30 bg-warning-100/30 p-4">
                <p className="text-sm font-bold text-navy-900">Downgrade identificado</p>
                <p className="mt-1 text-sm text-gray-600">
                  O aparelho recebido ficou {formatBRL(storeAmountDue)} acima desta venda. Esse é o valor que a loja deve devolver ao cliente.
                </p>
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-4">
              {quickPaymentMethods.map((method) => {
                const payment = calculatePaymentPrice(amountAfterTradeIn, method.value, fees as any)
                return (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      paymentMethod === method.value ? "border-navy-900 bg-navy-900 text-white" : "border-gray-100 bg-white hover:border-royal-500"
                    }`}
                  >
                    <p className="text-sm font-bold">{method.label}</p>
                    <p className={`mt-1 text-lg font-bold ${paymentMethod === method.value ? "text-white" : "text-navy-900"}`}>{formatBRL(payment.price)}</p>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setPaymentMethod(isCreditPayment ? paymentMethod : "credit_1x")}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  isCreditPayment ? "border-navy-900 bg-navy-900 text-white" : "border-gray-100 bg-white hover:border-royal-500"
                }`}
              >
                <p className="text-sm font-bold">Crédito</p>
                <p className={`mt-1 text-lg font-bold ${isCreditPayment ? "text-white" : "text-navy-900"}`}>
                  {formatBRL(calculatePaymentPrice(amountAfterTradeIn, isCreditPayment ? paymentMethod : "credit_1x", fees as any).price)}
                </p>
              </button>
            </div>

            {isCreditPayment && (
              <div className="mt-4 rounded-2xl border border-gray-100 bg-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Parcelas no crédito</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {creditMethods.map((method) => {
                    const payment = calculatePaymentPrice(amountAfterTradeIn, method.value, fees as any)
                    return (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => setPaymentMethod(method.value)}
                        className={`rounded-xl border p-2 text-center transition-all ${
                          paymentMethod === method.value ? "border-royal-500 bg-white ring-2 ring-royal-500/10" : "border-gray-100 bg-white"
                        }`}
                      >
                        <p className="text-xs font-bold text-navy-900">{method.label.replace("Crédito ", "")}</p>
                        <p className="text-[11px] text-gray-500">{formatBRL(payment.installmentValue)}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-warning-500/20 bg-warning-100/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Reservar venda</p>
                    <p className="text-xs text-gray-500">Bloqueia o estoque e cria conta a receber.</p>
                  </div>
                  <ToggleSwitch checked={isReservation} onChange={() => setIsReservation(!isReservation)} tone="warning" />
                </div>
                {isReservation && (
                  <Input
                    label="Previsão de pagamento"
                    type="date"
                    value={paymentDueDate}
                    onChange={(event) => setPaymentDueDate(event.target.value)}
                    className="mt-3"
                  />
                )}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Receber aparelho na troca</p>
                    <p className="text-xs text-gray-500">Use quando tiver trade-in.</p>
                  </div>
                  <ToggleSwitch checked={hasTradeIn} onChange={() => setHasTradeIn(!hasTradeIn)} />
                </div>
              </div>
            </div>

            {hasTradeIn && (
              <div className="mt-4 rounded-2xl border border-gray-100 bg-surface p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Aparelho recebido</p>
                    <p className="text-xs text-gray-500">Use a busca para puxar o modelo da tabela de avaliação e comparar o valor recebido.</p>
                  </div>
                  <Badge variant={tradeInReferenceStatus.badge} dot>
                    {tradeInReferenceStatus.label}
                  </Badge>
                </div>

                <div className="mb-3">
                  <Input
                    placeholder="Buscar modelo: iPhone 15 Pro, iPad 10..."
                    value={tradeInModelSearch}
                    onChange={(event) => setTradeInModelSearch(event.target.value)}
                    icon={<Search className="h-4 w-4" />}
                  />
                  {tradeInModelSearch && tradeInModelOptions.length > 0 && (
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {tradeInModelOptions.map((option) => (
                        <button
                          key={`${option.category}-${option.index}`}
                          type="button"
                          onClick={() => {
                            handleTradeInChange({ category: option.category, modelIdx: option.index })
                            setTradeInModelSearch(option.model.name)
                          }}
                          className={`rounded-xl border bg-white p-3 text-left transition-all hover:border-royal-500 ${
                            tradeIn.category === option.category && tradeIn.modelIdx === option.index ? "border-royal-500 ring-2 ring-royal-500/10" : "border-gray-100"
                          }`}
                        >
                          <p className="text-sm font-semibold text-navy-900">{option.model.name}</p>
                          <p className="text-xs text-gray-500">{option.categoryLabel}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <select
                    className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value={tradeIn.category}
                    onChange={(event) => {
                      handleTradeInChange({ category: event.target.value, modelIdx: 0 })
                      setTradeInModelSearch("")
                    }}
                  >
                    <option value="">Categoria</option>
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                  <select
                    className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value={tradeIn.modelIdx}
                    onChange={(event) => {
                      const nextIndex = parseInt(event.target.value) || 0
                      handleTradeInChange({ modelIdx: nextIndex })
                      setTradeInModelSearch(tradeInModels[nextIndex]?.name || "")
                    }}
                  >
                    {tradeInModels.length === 0 ? <option value="">Modelo</option> : tradeInModels.map((model, index) => (
                      <option key={model.name} value={index}>{model.name}</option>
                    ))}
                  </select>
                  <Input placeholder="IMEI" value={tradeIn.imei} onChange={(event) => handleTradeInChange({ imei: event.target.value.replace(/\D/g, "").slice(0, 15) })} />
                  <Input placeholder="Valor recebido" type="number" value={tradeIn.value} onChange={(event) => handleTradeInChange({ value: event.target.value })} />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Estado geral</p>
                    <div className="grid grid-cols-5 gap-2">
                      {GRADES.filter((grade) => grade.value !== "Lacrado").map((grade) => (
                        <button
                          key={grade.value}
                          type="button"
                          onClick={() => handleTradeInChange({ grade: grade.value })}
                          className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                            tradeIn.grade === grade.value
                              ? "border-navy-900 bg-navy-900 text-white"
                              : "border-gray-100 bg-white text-gray-500 hover:border-royal-500"
                          }`}
                        >
                          {grade.value}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    label="Bateria (%)"
                    type="number"
                    min={0}
                    max={100}
                    value={tradeIn.batteryHealth}
                    onChange={(event) => handleTradeInChange({ batteryHealth: event.target.value })}
                  />
                </div>

                <div className={`mt-3 rounded-2xl border p-3 ${
                  tradeInReferenceStatus.badge === "red"
                    ? "border-danger-500/20 bg-danger-100/20"
                    : tradeInReferenceStatus.badge === "yellow"
                    ? "border-warning-500/20 bg-warning-100/20"
                    : "border-success-500/20 bg-success-100/20"
                }`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{tradeInReferenceStatus.label}</p>
                      <p className="text-xs text-gray-600">{tradeInReferenceStatus.description}</p>
                    </div>
                    {tradeInEvaluation?.hasReferencePrices && (
                      <div className="text-left sm:text-right">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Referências</p>
                        <p className="text-sm font-bold text-navy-900">
                          {tradeInEvaluation.priceCount} item(ns) · média {formatBRL(tradeInEvaluation.avgPrice)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard eyebrow="5. Garantia e observações" title="Fechamento" description="A garantia será emitida ao concluir uma venda recebida agora.">
            <div className="grid gap-3 md:grid-cols-[260px_1fr]">
              <div>
                <label className="mb-2 block text-sm font-medium text-navy-900">Garantia: {warrantyMonths} meses</label>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={warrantyMonths}
                  onChange={(event) => setWarrantyMonths(event.target.value)}
                  className="w-full accent-royal-500"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>1 mês</span>
                  <span>12 meses</span>
                </div>
              </div>
              <Textarea
                label="Observações da venda"
                placeholder="Condição negociada, combinado com cliente, acessórios inclusos..."
                value={saleNotes}
                onChange={(event) => setSaleNotes(event.target.value)}
              />
            </div>
          </SectionCard>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm">
            <div className="bg-navy-900 p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Resumo</p>
                  <h2 className="text-xl font-bold">Venda atual</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-3xl font-bold">
                {storeAmountDue > 0 ? formatBRL(storeAmountDue) : formatBRL(selectedPayment?.price || amountAfterTradeIn)}
              </p>
              <p className="mt-1 text-sm text-white/60">{selectedPaymentLabel}</p>
            </div>

            <div className="space-y-4 p-5">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 h-4 w-4 text-royal-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Produto</p>
                    <p className="truncate text-sm font-semibold text-navy-900">{selectedProduct?.name || "Nenhum produto selecionado"}</p>
                    {quantity > 1 && <p className="text-xs text-gray-500">{quantity} unidades</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 text-royal-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
                    <p className="truncate text-sm font-semibold text-navy-900">{customer.name || "Cliente não informado"}</p>
                    {customer.cpf && <p className="text-xs text-gray-500">{customer.cpf}</p>}
                  </div>
                </div>
                {additionalSelectedItem && (
                  <div className="flex items-start gap-3">
                    <Gift className="mt-0.5 h-4 w-4 text-royal-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Adicional</p>
                      <p className="truncate text-sm font-semibold text-navy-900">{additionalSelectedItem.qty}x {getAdditionalItemDisplayName(additionalSelectedItem.name)}</p>
                    </div>
                  </div>
                )}
                {isReservation && (
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-warning-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recebimento</p>
                      <p className="text-sm font-semibold text-navy-900">{paymentDueDate ? paymentDueDate.split("-").reverse().join("/") : "Informe a data"}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-surface p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Produto principal</span>
                  <span className="font-semibold text-navy-900">{formatBRL(totalBasePrice)}</span>
                </div>
                {upsellTotal > 0 && (
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-gray-500">Upsell</span>
                    <span className="font-semibold text-success-500">+{formatBRL(upsellTotal)}</span>
                  </div>
                )}
                {hasTradeIn && calculateTradeInValue() > 0 && (
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-gray-500">Trade-in</span>
                    <span className="font-semibold text-danger-500">-{formatBRL(calculateTradeInValue())}</span>
                  </div>
                )}
                {storeAmountDue > 0 && (
                  <div className="mt-2 rounded-xl border border-warning-500/30 bg-warning-100/40 p-3">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold text-amber-900">Loja paga ao cliente</span>
                      <span className="font-bold text-amber-900">{formatBRL(storeAmountDue)}</span>
                    </div>
                    <p className="mt-1 text-xs text-amber-800">
                      Diferença do trade-in. Não entra no DRE agora; vira custo do aparelho recebido quando ele for vendido.
                    </p>
                  </div>
                )}
                {selectedPayment && selectedPayment.price > amountAfterTradeIn && (
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-gray-500">Taxa/juros</span>
                    <span className="font-semibold text-navy-900">+{formatBRL(selectedPayment.price - amountAfterTradeIn)}</span>
                  </div>
                )}
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <div className="flex justify-between">
                    <span className="font-bold text-navy-900">Cliente paga</span>
                    <span className="font-bold text-navy-900">{formatBRL(selectedPayment?.price || amountAfterTradeIn)}</span>
                  </div>
                  {selectedPayment?.installments && selectedPayment.installments > 1 && (
                    <p className="mt-1 text-right text-xs text-gray-500">{selectedPayment.installments}x de {formatBRL(selectedPayment.installmentValue)}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-success-100/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lucro</p>
                  <p className={`mt-1 text-lg font-bold ${totalProfit >= 0 ? "text-success-500" : "text-danger-500"}`}>{formatBRL(totalProfit)}</p>
                </div>
                <div className="rounded-2xl bg-royal-100/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Garantia</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{warrantyMonths}m</p>
                </div>
              </div>

              <Button fullWidth size="lg" variant={isReservation ? "primary" : "success"} onClick={handleConfirm} disabled={!canFinishSale} isLoading={isSubmitting}>
                <Check className="h-4 w-4" />
                {isReservation ? "Reservar venda" : "Concluir venda"}
              </Button>
              {!canFinishSale && (
                <p className="text-center text-xs text-gray-400">Selecione produto, cliente válido, valor e pagamento para finalizar.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )

}

export default function NewSalePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12 text-gray-400">Carregando formulário...</div>}>
      <NewSaleContent />
    </Suspense>
  )
}
