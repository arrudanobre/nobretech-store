"use client"

import { useState, useMemo, useCallback, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { buildPriceTable, calcPrice, calcProfit, formatBRL, maskCPF, formatPhone, validateCPF, getFeeKey, getProductName, getAdditionalItemDisplayName, calculateDeviceValue, formatTradeInSuggestedRange, getTradeInSummaryStatus, getComputedInventoryStatus } from "@/lib/helpers"
import { atualizarStatusEstoque } from "@/services/vendaService"
import { PAYMENT_METHODS, CATEGORIES, PRODUCT_CATALOG, GRADES } from "@/lib/constants"
import { useToast } from "@/components/ui/toaster"
import { CategoryIcon } from "@/components/ui/icon-helpers"
import { supabase } from "@/lib/supabase"
import { generateReceiptPDF, generateWarrantyPDF, type SaleDocumentData } from "@/lib/sale-documents"
import {
  Search,
  ShoppingCart,
  User,
  DollarSign,
  ShieldCheck,
  Check,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"

type Step = 1 | 2 | 3 | 4 | 5

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
  type?: "own" | "supplier"
  supplier_name?: string | null
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

function NewSaleContent() {
  const [step, setStep] = useState<Step>(1)
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
  } | null>(null)
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const defaultFees: Record<string, number> = {
    debit: 1.10, credit_1x: 3.08, credit_2x: 4.67, credit_3x: 5.50, credit_4x: 6.34,
    credit_5x: 7.17, credit_6x: 8.03, credit_7x: 8.93, credit_8x: 9.78,
    credit_9x: 10.64, credit_10x: 11.51, credit_11x: 12.37, credit_12x: 13.25,
    credit_13x: 14.13, credit_14x: 15.01, credit_15x: 15.90, credit_16x: 16.78,
    credit_17x: 17.69, credit_18x: 18.58, pix: 0, cash: 0,
  }
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
          .select("id, imei, imei2, serial_number, purchase_price, suggested_price, battery_health, status, condition_notes, notes, type, supplier_name, catalog:catalog_id(model, variant, storage, color)")
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
            type: item.type || "own",
            supplier_name: item.supplier_name || null,
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
          .select("id, imei, imei2, serial_number, purchase_price, suggested_price, battery_health, condition_notes, notes, type, supplier_name, catalog:catalog_id(model, variant, storage, color)")
          .eq("id", preselectId)
          .single()

        if (error || !items) {
          toast({ title: "Produto não encontrado", description: "Não foi possível carregar o produto selecionado.", type: "error" })
          return
        }

        if (items.status === "sold") {
          toast({ title: "Produto já vendido", description: "Este aparelho já foi vendido e não está mais disponível.", type: "error" })
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
          type: items.type || "own",
          supplier_name: items.supplier_name || null,
        }
        const initialPrice = product.suggested.toString()
        setSelectedProduct(product)
        setSalePrice(initialPrice)
        setSalePriceInput(initialPrice)
        setIsSalePriceManual(false)
        setStep(2)
      } catch {
        toast({ title: "Erro ao carregar produto", type: "error" })
      }
    }
    fetchProduct()
  }, [preselectId, toast])

  // Merge bank values into defaults (bank value wins only if > 0)
  useEffect(() => {
    const fetchFees = async () => {
      try {
        const { data, error } = await (supabase.from("financial_settings") as any).select("*").limit(1).single()
        if (!error && data) {
          setFees((prev) => ({
            ...prev,
            debit: typeof data.debit_fee_pct === 'number' && data.debit_fee_pct > 0 ? data.debit_fee_pct : prev.debit,
            credit_1x: typeof data.credit_1x_fee_pct === 'number' && data.credit_1x_fee_pct > 0 ? data.credit_1x_fee_pct : prev.credit_1x,
            credit_2x: typeof data.credit_2x_fee_pct === 'number' && data.credit_2x_fee_pct > 0 ? data.credit_2x_fee_pct : prev.credit_2x,
            credit_3x: typeof data.credit_3x_fee_pct === 'number' && data.credit_3x_fee_pct > 0 ? data.credit_3x_fee_pct : prev.credit_3x,
            credit_4x: typeof data.credit_4x_fee_pct === 'number' && data.credit_4x_fee_pct > 0 ? data.credit_4x_fee_pct : prev.credit_4x,
            credit_5x: typeof data.credit_5x_fee_pct === 'number' && data.credit_5x_fee_pct > 0 ? data.credit_5x_fee_pct : prev.credit_5x,
            credit_6x: typeof data.credit_6x_fee_pct === 'number' && data.credit_6x_fee_pct > 0 ? data.credit_6x_fee_pct : prev.credit_6x,
            credit_7x: typeof data.credit_7x_fee_pct === 'number' && data.credit_7x_fee_pct > 0 ? data.credit_7x_fee_pct : prev.credit_7x,
            credit_8x: typeof data.credit_8x_fee_pct === 'number' && data.credit_8x_fee_pct > 0 ? data.credit_8x_fee_pct : prev.credit_8x,
            credit_9x: typeof data.credit_9x_fee_pct === 'number' && data.credit_9x_fee_pct > 0 ? data.credit_9x_fee_pct : prev.credit_9x,
            credit_10x: typeof data.credit_10x_fee_pct === 'number' && data.credit_10x_fee_pct > 0 ? data.credit_10x_fee_pct : prev.credit_10x,
            credit_11x: typeof data.credit_11x_fee_pct === 'number' && data.credit_11x_fee_pct > 0 ? data.credit_11x_fee_pct : prev.credit_11x,
            credit_12x: typeof data.credit_12x_fee_pct === 'number' && data.credit_12x_fee_pct > 0 ? data.credit_12x_fee_pct : prev.credit_12x,
            credit_13x: typeof data.credit_13x_fee_pct === 'number' && data.credit_13x_fee_pct > 0 ? data.credit_13x_fee_pct : prev.credit_13x,
            credit_14x: typeof data.credit_14x_fee_pct === 'number' && data.credit_14x_fee_pct > 0 ? data.credit_14x_fee_pct : prev.credit_14x,
            credit_15x: typeof data.credit_15x_fee_pct === 'number' && data.credit_15x_fee_pct > 0 ? data.credit_15x_fee_pct : prev.credit_15x,
            credit_16x: typeof data.credit_16x_fee_pct === 'number' && data.credit_16x_fee_pct > 0 ? data.credit_16x_fee_pct : prev.credit_16x,
            credit_17x: typeof data.credit_17x_fee_pct === 'number' && data.credit_17x_fee_pct > 0 ? data.credit_17x_fee_pct : prev.credit_17x,
            credit_18x: typeof data.credit_18x_fee_pct === 'number' && data.credit_18x_fee_pct > 0 ? data.credit_18x_fee_pct : prev.credit_18x,
            pix: typeof data.pix_fee_pct === 'number' && data.pix_fee_pct > 0 ? data.pix_fee_pct : prev.pix,
            cash: typeof data.cash_discount_pct === 'number' && data.cash_discount_pct > 0 ? data.cash_discount_pct : prev.cash,
          }))
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

  const priceTable = useMemo(() => {
    if (!selectedProduct || !salePrice) return []
    return buildPriceTable(parseFloat(salePrice), 0, fees as any)
  }, [selectedProduct, salePrice, fees])

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

  // Taxa aplicável ao método selecionado (apenas para exibição)
  const paymentFee = useMemo(() => {
    if (!selectedProduct || !salePrice || !paymentMethod) return 0
    const feePct = fees[getFeeKey(paymentMethod)] ?? 0
    return finalTotal * (feePct / 100)
  }, [finalTotal, paymentMethod, fees])

  // Quantidade máxima disponível do mesmo modelo (para validação de estoque)
  const maxAvailableQty = useMemo(() => {
    if (!selectedProduct) return 1
    return inventoryProducts.filter(p => p.name === selectedProduct.name).length
  }, [selectedProduct, inventoryProducts])

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
    setStep(2)
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

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedProduct && !loadingInventory && quantity <= maxAvailableQty
      case 2: return customer.name && validateCPF(customer.cpf)
      case 3: return salePrice && paymentMethod && (selectedProduct?.type !== "supplier" || !!supplierCostInput)
      case 4: return true
      case 5: return true
      default: return false
    }
  }

  const next = () => setStep((s) => Math.min(5, s + 1) as Step)
  const prev = () => setStep((s) => Math.max(1, s - 1) as Step)

  const getPaymentMethodLabel = (method: string) => {
    return PAYMENT_METHODS.find((item) => item.value === method)?.label || method
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const today = new Date().toISOString().split("T")[0]
      const warrantyEnd = new Date()
      warrantyEnd.setMonth(warrantyEnd.getMonth() + parseInt(warrantyMonths))

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
          payment_method: paymentMethod,
          warranty_months: parseInt(warrantyMonths),
          warranty_start: today,
          warranty_end: warrantyEnd.toISOString().split("T")[0],
          source_type: selectedProduct?.type || "own",
          supplier_name: selectedProduct?.type === "supplier" ? (selectedProduct.supplier_name || null) : null,
          supplier_cost: selectedProduct?.type === "supplier" ? (parseFloat(supplierCostInput) || 0) : null,
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
          } else if (inventoryItem?.status !== "in_stock") {
            console.warn(`Item adicional ${additionalSelectedItem.itemId} não está mais em estoque. Status: ${inventoryItem?.status}`)
            // We still proceed, but log a warning
          }

          await atualizarStatusEstoque(additionalSelectedItem.itemId, "sold")
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

      try {
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
          paymentMethod: getPaymentMethodLabel(paymentMethod),
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

      toast({
        title: "Venda registrada!",
        description: `Venda de ${selectedProduct!.name} concluída com sucesso. Recibo e garantia emitidos.`,
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

  const steps = [
    { num: 1, label: "Produto" },
    { num: 2, label: "Cliente" },
    { num: 3, label: "Pagamento" },
    { num: 4, label: "Garantia" },
    { num: 5, label: "Confirmar" },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stepper */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1 flex-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  s.num < step
                    ? "bg-success-500 text-white"
                    : s.num === step
                    ? "bg-royal-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {s.num < step ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap hidden sm:inline ${s.num <= step ? "text-navy-900" : "text-gray-400"}`}>
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 rounded min-w-[8px] ${s.num < step ? "bg-success-500" : "bg-gray-100"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 1: Find Product ───────────────────────────── */}
      {step === 1 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
          <h3 className="font-display font-bold text-navy-900 mb-4 font-syne">Buscar Produto em Estoque</h3>
          <Input
            placeholder="Buscar por nome, IMEI ou número de série..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search className="w-4 h-4" />}
            className="mb-4"
          />
          {loadingInventory ? (
            <div className="text-center py-12 text-gray-400">Carregando estoque...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-2">Nenhum produto disponível em estoque.</p>
              <p className="text-xs text-gray-300">Produtos vendidos são removidos automaticamente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all hover:border-royal-500 hover:bg-royal-100/20 ${
                    selectedProduct?.id === p.id ? "border-royal-500 bg-royal-100/30" : "border-gray-100"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-navy-900">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {[p.imei ? `IMEI: ${p.imei}` : null, p.serial_number ? `Serial: ${p.serial_number}` : null, p.battery ? `Bateria ${p.battery}%` : null].filter(Boolean).join(" · ") || "Sem identificação"}
                    </p>
                    {p.type === "supplier" && (
                      <p className="text-xs text-gray-500">Fornecedor{p.supplier_name ? `: ${p.supplier_name}` : ""}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-navy-900">{formatBRL(p.suggested)}</p>
                    <p className="text-xs text-gray-400">Custo: {formatBRL(p.cost)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Customer ─────────────────────────── */}
      {step === 2 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-navy-900 font-syne">Dados do Cliente</h3>
          {selectedProduct && (
            <div className="bg-surface rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-royal-100 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-royal-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy-900">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500">Preço sugerido: {formatBRL(selectedProduct.suggested)}</p>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <label className="text-xs text-gray-500">Qtd:</label>
                <input
                  type="number"
                  min={1}
                  max={maxAvailableQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(maxAvailableQty, parseInt(e.target.value) || 0)))}
                  className="w-14 h-8 text-center rounded-lg border border-gray-200 text-sm font-semibold"
                />
              </div>
            </div>
          )}
          {selectedProduct && quantity > maxAvailableQty && (
            <p className="text-xs text-danger-500 font-medium">Quantidade indisponível em estoque (máx: {maxAvailableQty})</p>
          )}
          {selectedProduct && unitPrice > 0 && quantity > 1 && (
            <p className="text-xs text-navy-800 font-medium">
              Total: {quantity}x {formatBRL(unitPrice)} = {formatBRL(unitPrice * quantity)}
            </p>
          )}
          {existingCustomerFound && (
            <div className="bg-royal-100/30 rounded-xl p-3 flex items-center gap-2 border border-royal-500/20">
              <span className="text-sm">Cliente encontrado!</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome Completo" value={customer.name} onChange={(e) => updateCustomer("name", e.target.value)} />
            <Input
              label="CPF"
              value={customer.cpf}
              onChange={(e) => handleCpfChange(e.target.value)}
              error={customer.cpf.length >= 14 && !validateCPF(customer.cpf) ? "CPF inválido" : undefined}
            />
            <Input label="Telefone" value={customer.phone} onChange={(e) => updateCustomer("phone", e.target.value)} />
            <Input label="E-mail" type="email" value={customer.email} onChange={(e) => updateCustomer("email", e.target.value)} />
          </div>
          {customerNotes && (
            <div className="bg-royal-50 rounded-xl p-3 border border-royal-500/10">
              <p className="text-xs font-semibold text-royal-700 mb-1">Observações do Cliente</p>
              <p className="text-sm text-navy-900">{customerNotes}</p>
            </div>
          )}
          {!existingCustomerFound && customer.cpf.length >= 14 && (
            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1">Observações do Cliente</label>
              <Input
                label="Observações"
                placeholder="Ex: Prefere atendimento por WhatsApp..."
                value={customerEditableNotes}
                onChange={(e) => setCustomerEditableNotes(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Payment ─────────────────────────── */}
      {step === 3 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-navy-900 font-syne">Pagamento</h3>

          <div>
            <label className="block text-sm font-medium text-navy-900 mb-1.5">Preço de Venda Unitário (R$)</label>
            <Input
              type="number"
              value={salePriceInput}
              onChange={(e) => {
                setIsSalePriceManual(true)
                setSalePriceInput(e.target.value)
              }}
              onBlur={commitSalePriceInput}
              onKeyDown={handleSalePriceKeyDown}
            />
            {selectedProduct?.type === "supplier" && (
              <div className="mt-2">
                <Input
                  label="Custo do fornecedor"
                  type="number"
                  value={supplierCostInput}
                  onChange={(e) => setSupplierCostInput(e.target.value)}
                />
              </div>
            )}
            {selectedProduct?.type === "supplier" && selectedProduct.supplier_name && (
              <p className="text-xs text-gray-500 mt-1">Fornecedor: {selectedProduct.supplier_name}</p>
            )}
            {baseProfit > 0 && (
              <p className="text-xs text-success-500 mt-1 font-medium">Lucro unitário: {formatBRL(baseProfit)}</p>
            )}
            {quantity > 1 && totalBasePrice > 0 && (
              <p className="text-xs text-navy-800 mt-0.5 font-medium">Total: {quantity}x {formatBRL(unitPrice)} = {formatBRL(totalBasePrice)}</p>
            )}
            {totalProfit > 0 && (
              <p className="text-xs text-success-500 mt-0.5 font-medium">Lucro total: {formatBRL(totalProfit)}</p>
            )}
          </div>

          {/* Trade-in toggle */}
          <div className="flex items-center justify-between bg-surface rounded-xl p-3">
            <div>
              <p className="text-sm font-medium text-navy-900">Recebido como entrada?</p>
              <p className="text-xs text-gray-500">Registrar trade-in de aparelho</p>
            </div>
            <button
              type="button"
              onClick={() => setHasTradeIn(!hasTradeIn)}
              className={`w-12 h-7 rounded-full transition-colors relative ${hasTradeIn ? "bg-royal-500" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${hasTradeIn ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {hasTradeIn && (
            <div className="bg-surface rounded-xl p-4 space-y-4">
              <p className="text-sm font-semibold text-navy-900">Dados do Aparelho Recebido</p>

              {/* Category selector */}
              <div>
                <label className="block text-xs font-medium text-navy-900 mb-2">Categoria</label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => handleTradeInChange({ category: c.value, modelIdx: 0 })}
                      className={`shrink-0 flex flex-col items-center gap-1 px-4 py-2 rounded-xl border transition-colors min-w-[70px] ${
                        tradeIn.category === c.value
                          ? "bg-navy-900 text-white border-navy-900"
                          : "bg-white text-gray-600 border-gray-200 hover:border-royal-500"
                      }`}
                    >
                      <CategoryIcon category={c.value} className="!w-4 !h-4" />
                      <span className="text-[10px] font-medium">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model selector */}
              {tradeInModels.length > 0 && (
                <select
                  className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  value={tradeIn.modelIdx}
                  onChange={(e) => handleTradeInChange({ modelIdx: parseInt(e.target.value) })}
                >
                  <option value="">Selecione o modelo</option>
                  {tradeInModels.map((m, i) => (
                    <option key={m.name} value={i}>{m.name}</option>
                  ))}
                </select>
              )}

              {/* Color swatches */}
              {tradeInModel && (tradeInModel as any).colors && (
                <div>
                  <label className="block text-xs font-medium text-navy-900 mb-2">Cor</label>
                  <div className="flex flex-wrap gap-2">
                    {(tradeInModel as any).colors.map((c: any) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => handleTradeInChange({ color: c.name })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          tradeIn.color === c.name
                            ? "border-royal-500 ring-2 ring-royal-500/20"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full border border-gray-300"
                          style={{ backgroundColor: c.hex }}
                        />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Storage or Size chips */}
              {tradeInModel && (tradeInModel as any).storage && (
                <div>
                  <label className="block text-xs font-medium text-navy-900 mb-2">Armazenamento</label>
                  <div className="flex flex-wrap gap-2">
                    {(tradeInModel as any).storage.map((s: any) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleTradeInChange({ storage: s })}
                        className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                          tradeIn.storage === s
                            ? "bg-navy-900 text-white border-navy-900"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tradeInModel && (tradeInModel as any).sizes && (
                <div>
                  <label className="block text-xs font-medium text-navy-900 mb-2">Tamanho</label>
                  <div className="flex flex-wrap gap-2">
                    {((tradeInModel as any).sizes as string[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleTradeInChange({ storage: s })}
                        className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                          tradeIn.storage === s
                            ? "bg-navy-900 text-white border-navy-900"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* IMEI */}
              <Input label="IMEI do Aparelho Recebido" value={tradeIn.imei} onChange={(e) => handleTradeInChange({ imei: e.target.value.replace(/\D/g, "").slice(0, 15) })} />

              {/* Grade */}
              <div>
                <label className="block text-xs font-medium text-navy-900 mb-2">Estado geral</label>
                <div className="flex gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => handleTradeInChange({ grade: g.value })}
                      className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${
                        tradeIn.grade === g.value
                          ? g.color + " border-current"
                          : "bg-white text-gray-400 border-gray-200"
                      }`}
                    >
                      {g.value}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="Bateria (%)"
                type="number"
                min="0"
                max="100"
                value={tradeIn.batteryHealth}
                onChange={(e) => handleTradeInChange({ batteryHealth: e.target.value })}
              />

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
                <p className="text-xs text-gray-500">Valor sugerido</p>
                <p className="text-sm font-semibold text-navy-900">{tradeInSuggestedDisplay}</p>
                {tradeInEvaluation && (
                  <p className="text-[11px] text-gray-500">
                    {tradeInEvaluation.priceCount > 0 ? `${tradeInEvaluation.priceCount} referências` : "Sem referências"}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-navy-900 mb-2">Fotos do Aparelho</label>
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
                  <p className="text-xs font-medium text-navy-900">Fotos desativadas no fluxo de venda.</p>
                  <p className="text-[11px] text-gray-400 mt-1">A captura de imagens ficará para assistência técnica.</p>
                </div>
              </div>

              {/* Trade-in value */}
              <Input label="Valor da Avaliação (R$)" type="number" value={tradeIn.value} onChange={(e) => handleTradeInChange({ value: e.target.value })} />
              <p className="text-xs text-gray-500">Você pode aceitar o valor sugerido ou ajustar manualmente.</p>
            </div>
          )}

          {/* Trade-in summary */}
          {hasTradeIn && tradeIn.value && salePrice && (
            <div className="bg-royal-100/50 rounded-xl p-4 space-y-3 border border-royal-500/20">
              <p className="text-sm font-semibold text-navy-900">Resumo da Troca</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Aparelho vendido ({quantity}x)</span>
                <span className="font-semibold text-navy-900">{formatBRL(finalTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">(-) Aparelho recebido</span>
                <span className="font-semibold text-danger-500">- {formatBRL(calculateTradeInValue())}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-navy-900">{formatBRL(Math.max(0, finalTotal - calculateTradeInValue()))}</span>
              </div>
              {/* Fee info based on selected payment method */}
              {paymentMethod && (() => {
                const tradeInVal = calculateTradeInValue()
                const netPrice = finalTotal - tradeInVal
                const feeKey = getFeeKey(paymentMethod)
                const feePct = fees[feeKey] ?? 0
                const feeAdjustedPrice = feePct > 0 ? Math.round(netPrice * (1 + feePct / 100) * 100) / 100 : netPrice
                const selectedMethod = PAYMENT_METHODS.find((p) => p.value === paymentMethod)
                const isInstallment = selectedMethod && selectedMethod.maxInstallments > 1

                if (feeAdjustedPrice > netPrice) {
                  return (
                    <>
                      <div className="flex justify-between text-sm text-gray-400">
                        <span>Diferença (taxa {selectedMethod?.label})</span>
                        <span>+ {formatBRL(feeAdjustedPrice - netPrice)}</span>
                      </div>
                      <div className="flex justify-between text-base pt-2 border-t border-royal-500/20">
                        <span className="font-bold text-navy-900">
                          Total {paymentMethod}
                        </span>
                        <span className="font-bold text-royal-500">{formatBRL(feeAdjustedPrice)}</span>
                      </div>
                      {isInstallment && selectedMethod && (
                        <p className="text-xs text-gray-500 text-center">
                          {selectedMethod.maxInstallments}x de {formatBRL(feeAdjustedPrice / selectedMethod.maxInstallments)}
                        </p>
                      )}
                    </>
                  )
                }
                return null
              })()}
              {/* When no payment method selected */}
              {!paymentMethod && (
                <div className="flex justify-between text-base pt-2 border-t border-royal-500/20">
                  <span className="font-bold text-navy-900">Valor a pagar</span>
                  <span className="font-bold text-royal-500">{formatBRL(Math.max(0, finalTotal - calculateTradeInValue()))}</span>
                </div>
              )}
              <p className="text-xs text-gray-500 text-center">
                {paymentMethod
                  ? "* Valor ajustado pela taxa do Mercado Pago"
                  : "* Selecione uma forma de pagamento para ver o valor ajustado com juros"}
              </p>
            </div>
          )}

          {/* ── Adicionais (Upsell / Brinde) ── */}
          <div className="bg-surface rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-navy-900">Adicionais (Upsell / Brinde)</p>
                <p className="text-xs text-gray-500">Item extra do estoque</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHasAdditionalItem(!hasAdditionalItem)
                  if (hasAdditionalItem) setAdditionalSelectedItem(null)
                }}
                className={`w-12 h-7 rounded-full transition-colors relative ${hasAdditionalItem ? "bg-royal-500" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${hasAdditionalItem ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {hasAdditionalItem && (
              <div className="space-y-3 pt-2 border-t border-gray-200">
                {/* Select product from inventory */}
                <div>
                  <label className="block text-xs font-medium text-navy-900 mb-2">Produto</label>
                  <select
                    className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value=""
                    onChange={(e) => {
                      const inv = inventoryProducts.find(p => p.id === e.target.value)
                      if (inv) {
                        setAdditionalSelectedItem({
                          itemId: inv.id,
                          name: inv.name,
                          cost: inv.cost,
                          type: "upsell",
                          salePrice: inv.suggested.toString(),
                          qty: 1,
                        })
                      }
                    }}
                  >
                    <option value="">Selecione um produto do estoque</option>
                    {inventoryProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {getAdditionalItemDisplayName(p.name)} — Custo: {formatBRL(p.cost)} / Sug.: {formatBRL(p.suggested)}
                      </option>
                    ))}
                  </select>
                </div>

                {additionalSelectedItem && (
                  <>
                    {/* Tipo */}
                    <div>
                      <label className="block text-xs font-medium text-navy-900 mb-2">Tipo</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAdditionalSelectedItem((p) => p ? { ...p, type: "upsell" } : p)}
                          className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                            additionalSelectedItem.type === "upsell"
                              ? "bg-navy-900 text-white border-navy-900"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Upsell (pago)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdditionalSelectedItem((p) => p ? { ...p, type: "free" } : p)}
                          className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                            additionalSelectedItem.type === "free"
                              ? "bg-navy-900 text-white border-navy-900"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          Brinde (gratuito)
                        </button>
                      </div>
                    </div>

                    {/* Valor — apenas upsell */}
                    {additionalSelectedItem.type === "upsell" && (
                      <Input
                        label="Preço de Venda (R$)"
                        type="number"
                        value={additionalSelectedItem.salePrice}
                        onChange={(e) => setAdditionalSelectedItem((p) => p ? { ...p, salePrice: e.target.value } : p)}
                      />
                    )}

                    {/* Quantidade adicional */}
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500">Qtd:</label>
                      <input
                        type="number"
                        min={1}
                        value={additionalSelectedItem.qty}
                        onChange={(e) => setAdditionalSelectedItem((p) => p ? { ...p, qty: Math.max(1, parseInt(e.target.value) || 0) } : p)}
                        className="w-14 h-8 text-center rounded-lg border border-gray-200 text-sm font-semibold"
                      />
                    </div>

                    {/* Impacto no lucro */}
                    {(() => {
                      const cost = additionalSelectedItem.cost
                      const qty = additionalSelectedItem.qty
                      const profit = additionalSelectedItem.type === "upsell"
                        ? (parseFloat(additionalSelectedItem.salePrice) || 0) * qty - cost * qty
                        : -cost * qty
                      const isPositive = profit >= 0
                      return (
                        <div className={`rounded-xl p-3 border ${isPositive ? "bg-success-100/20 border-success-500/20" : "bg-danger-100/20 border-danger-500/20"}`}>
                          <p className={`text-sm font-medium ${isPositive ? "text-success-500" : "text-danger-500"}`}>
                            {additionalSelectedItem.type === "upsell"
                              ? `${qty}x ${getAdditionalItemDisplayName(additionalSelectedItem.name).toUpperCase()} ${profit >= 0 ? "aumentará" : "reduzirá"} seu lucro em ${formatBRL(profit)}`
                              : `${qty}x ${getAdditionalItemDisplayName(additionalSelectedItem.name).toUpperCase()} reduzirá seu lucro em ${formatBRL(Math.abs(profit))}`
                            }
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Custo do item: {formatBRL(cost)}
                            {additionalSelectedItem.type === "upsell" && parseFloat(additionalSelectedItem.salePrice) > 0 &&
                              ` · Venda: ${formatBRL(parseFloat(additionalSelectedItem.salePrice))}`
                            }
                          </p>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Payment method buttons */}
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-2">Forma de Pagamento</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((pm) => {
                const tradeInVal = hasTradeIn ? calculateTradeInValue() : 0
                const netPrice = finalTotal - tradeInVal
                const baseForFees = hasTradeIn ? netPrice : finalTotal
                const feePct = fees[getFeeKey(pm.value)] ?? 0
                const displayPrice = feePct > 0 ? Math.round(baseForFees * (1 + feePct / 100) * 100) / 100 : baseForFees
                const isInstallment = pm.maxInstallments > 1
                const installPerMonth = displayPrice / pm.maxInstallments
                const isVisible = baseForFees > 0

                return (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => setPaymentMethod(pm.value)}
                    className={`p-2.5 rounded-xl border text-center transition-all text-xs flex flex-col items-center gap-0.5 min-h-[64px] justify-center ${
                      paymentMethod === pm.value
                        ? "bg-navy-900 text-white border-navy-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-royal-500"
                    }`}
                  >
                    <span className="text-sm font-medium">{pm.label}</span>
                    {isVisible && (
                      <>
                        <span className={`text-xs font-semibold ${paymentMethod === pm.value ? "text-white" : "text-navy-900"}`}>
                          {formatBRL(displayPrice)}
                        </span>
                        {isInstallment && (
                          <span className={`text-[10px] ${paymentMethod === pm.value ? "text-white/70" : "text-gray-400"}`}>
                            {pm.maxInstallments}x de {formatBRL(installPerMonth)}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Warranty ───────────────────────── */}
      {step === 4 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-navy-900 font-syne">Garantia</h3>
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-1.5">Prazo de Garantia (meses)</label>
            <input
              type="range"
              min="1"
              max="12"
              value={warrantyMonths}
              onChange={(e) => setWarrantyMonths(e.target.value)}
              className="w-full accent-royal-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 mês</span>
              <span className="text-royal-500 font-bold">{warrantyMonths} meses</span>
              <span>12 meses</span>
            </div>
          </div>
          <div className="bg-success-100 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-success-500" />
              <div>
                <p className="text-sm font-semibold text-green-800">Cobertura Padrão</p>
                <p className="text-xs text-green-700">Defeitos internos de funcionamento e software. Não cobre danos físicos ou por líquidos.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: Confirm ───────────────────────────── */}
      {step === 5 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">Confirmar Venda</h3>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Produto + Cliente</h4>
              <p className="font-semibold text-navy-900">{selectedProduct?.name}</p>
              <p className="text-sm text-gray-500">{customer.name}</p>
              {customer.cpf && <p className="text-xs text-gray-400">CPF: {customer.cpf}</p>}
              {customer.phone && <p className="text-xs text-gray-400">Tel: {customer.phone}</p>}
            </div>
            <div className="bg-surface rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Financeiro</h4>
              {quantity > 1 && (
                <p className="text-sm text-gray-500 line-through">{salePrice ? formatBRL(parseFloat(salePrice)) : "—"}</p>
              )}
              <p className="text-lg font-bold text-navy-900">
                {salePrice
                  ? formatBRL(
                      finalTotal - (hasTradeIn ? calculateTradeInValue() : 0)
                    )
                  : "—"}
                {quantity > 1 && (
                  <span className="text-sm font-normal text-gray-400 ml-2">({quantity}x)</span>
                )}
              </p>
              <p className="text-sm text-gray-500">{PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.label}</p>
              {totalBaseProfit > 0 && <p className="text-sm text-success-500 font-semibold">Lucro principal: {formatBRL(totalBaseProfit)}</p>}
              {additionalSelectedItem && (
                <p className="text-xs text-navy-800 mt-0.5 font-medium">
                  Lucro total: {formatBRL(totalProfit)}
                </p>
              )}
              {hasTradeIn && (
                <p className="text-xs text-warning-500 font-medium mt-1">
                  Trade-in: {tradeIn.category && tradeIn.modelIdx ? tradeInModels[tradeIn.modelIdx]?.name || tradeIn.category : "Aparelho"} — {tradeIn.value ? formatBRL(parseFloat(tradeIn.value)) : "—"} · {getTradeInInventoryStatusText()}
                </p>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Garantia</h4>
            <p className="text-sm text-navy-900">{warrantyMonths} meses a partir de hoje</p>
          </div>

          {additionalSelectedItem && (
            <div className="bg-surface rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Adicionais</h4>
              <div className="rounded-xl border border-success-500/20 bg-success-100/10 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-navy-900">
                      {additionalSelectedItem.qty > 1 ? `${additionalSelectedItem.qty}x ${additionalSelectedItem.name}` : additionalSelectedItem.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {additionalSelectedItem.type === "upsell" ? "Upsell (pago)" : "Brinde (gratuito)"}
                      {` · Custo: ${formatBRL(additionalSelectedItem.cost)}`}
                    </p>
                  </div>
                  {additionalSelectedItem.type === "upsell" ? (
                    <p className="text-sm font-bold text-success-500">
                      +{formatBRL(parseFloat(additionalSelectedItem.salePrice) * (additionalSelectedItem.qty || 1))}
                    </p>
                  ) : (
                    <span className="text-xs font-medium text-warning-500">Grátis</span>
                  )}
                </div>
              </div>
              {/* Resumo financeiro */}
              {salePrice && (
                <div className="pt-2 border-t border-gray-100 space-y-1 text-sm">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Produto principal</span>
                    <span className="font-semibold text-navy-900">{formatBRL(totalBasePrice)}</span>
                  </div>
                  {additionalSelectedItem.type === "upsell" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Upsell</span>
                      <span className="font-semibold text-success-500">+{formatBRL(parseFloat(additionalSelectedItem.salePrice) * (additionalSelectedItem.qty || 1))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                    <span className="font-semibold text-navy-900">Total</span>
                    <span className="font-bold text-navy-900">{formatBRL(finalTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ──────────────────────────── */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-gray-100 p-3 shadow-sm">
        <Button variant="ghost" onClick={prev}>
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        <span className="text-xs text-gray-400 hidden sm:inline">
          Passo {step} de 5
        </span>
        {step < 5 ? (
          <Button onClick={next} disabled={!canProceed()}>
            Próximo <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleConfirm} variant="success" isLoading={isSubmitting}>
            <Check className="w-4 h-4" /> Confirmar Venda
          </Button>
        )}
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
