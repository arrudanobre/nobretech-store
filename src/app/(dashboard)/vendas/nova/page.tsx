"use client"

import { useState, useMemo, useCallback, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ProductAssetImage } from "@/components/products/product-asset-image"
import { calculatePaymentPrice, formatBRL, maskCPF, formatPhone, validateCPF, getProductName, getAdditionalItemDisplayName, calculateDeviceValue, formatTradeInSuggestedRange, getTradeInSummaryStatus, getComputedInventoryStatus, normalizePaymentFeePct, todayISO, addDaysISO, formatPaymentMethod, formatDate } from "@/lib/helpers"
import { fetchProductImageMap, type ProductImageRecord } from "@/lib/product-images"
import { PAYMENT_METHODS, CATEGORIES, PRODUCT_CATALOG, GRADES, SIDEPAY_FEE_PCTS } from "@/lib/constants"
import { estimateRiskReserve } from "@/lib/sale-economics"
import { calculateSplitPaymentEconomics, isCreditPayment as isCreditSalePayment, isFinancialPayment, normalizeSalePaymentMethod, parseCurrencyLike, roundCurrency, SPLIT_PAYMENT_METHODS, validateSalePayments, type SalePayment, type SalePaymentDraft } from "@/lib/sale-payments"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { generateReceiptPDF, generateWarrantyPDF, type SaleDocumentData } from "@/lib/sale-documents"
import {
  AlertTriangle,
  Box,
  CalendarDays,
  Search,
  ShoppingCart,
  Check,
  CheckCircle2,
  ChevronUp,
  Circle,
  CreditCard,
  Info,
  Gift,
  Plus,
  Package,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react"

type InventoryProduct = {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  product_type?: string | null
  category_name_snapshot?: string | null
  category_normalized?: string | null
  model?: string | null
  storage?: string | null
  color?: string | null
  productImage?: ProductImageRecord | null
  imei: string
  imei2?: string
  serial_number?: string
  condition_notes?: string | null
  cost: number
  suggested: number
  battery: number
  grade?: string | null
  status?: string
  type?: "own" | "supplier"
  supplier_name?: string | null
  quantity?: number
  hasVariants?: boolean
  variants?: InventorySaleVariant[]
}

type InventorySaleVariant = {
  id: string
  colorName: string
  colorHex: string | null
  quantity: number
  unitCost: number | null
  suggestedPrice: number | null
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

type MarketingCampaignOption = {
  id: string
  name: string
  channel: string
  status: string
}

type FinanceAccountOption = {
  id: string
  name: string
  institution?: string | null
}

type SupplierPrice = {
  id: string
  category?: string | null
  product_type?: string | null
  category_name_snapshot?: string | null
  category_normalized?: string | null
  model?: string | null
  storage?: string | null
  grade?: string | null
  price?: number | string | null
}

type AdditionalSaleItem = {
  itemId: string
  name: string
  brand?: string | null
  category?: string | null
  model?: string | null
  color?: string | null
  productImage?: ProductImageRecord | null
  cost: number
  suggested: number
  type: "upsell" | "free"
  salePrice: string
  qty: number
  availableQty: number
  imei?: string
  serialNumber?: string
  variants?: InventorySaleVariant[]
  selectedVariantId?: string | null
  selectedVariantName?: string | null
  selectedVariantColorHex?: string | null
}

const SALE_ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "olx", label: "OLX" },
  { value: "trafego_pago", label: "Tráfego pago" },
  { value: "indicacao", label: "Indicação" },
  { value: "loja", label: "Loja física" },
  { value: "recorrente", label: "Cliente recorrente" },
  { value: "outro", label: "Outro" },
]

const PACKAGING_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "original_box", label: "Caixa original" },
  { value: "nobretech_box", label: "Caixa Nobretech" },
  { value: "no_box", label: "Sem caixa" },
  { value: "other", label: "Outro" },
]

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

const parseCurrencyInput = (value: string): number => {
  return parseCurrencyLike(value)
}

const formatCurrencyInputValue = (value: string): string => {
  const parsed = parseCurrencyLike(value)
  return parsed > 0 ? formatBRL(parsed) : ""
}

const formatCurrencyMaskInput = (value: string): string => {
  const digits = value.replace(/\D/g, "")
  const cents = Number(digits || "0")
  return formatBRL(cents / 100)
}

const newPaymentDraft = (suffix = Date.now().toString()): SalePaymentDraft => ({
  id: `payment-${suffix}`,
  payment_method: "",
  amount: "",
  due_date: todayISO(),
  financial_account_id: "",
})

const paymentAmountInput = (amount: number) => {
  const rounded = roundCurrency(amount)
  return rounded > 0 ? formatBRL(rounded) : ""
}

const normalizeSearchText = (value?: string | null) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim()

const defaultPaymentDueDate = (method: string) => {
  if (isCreditSalePayment(method)) return addDaysISO(todayISO(), 1) || todayISO()
  return todayISO()
}

const paymentMethodOptionLabel = (method: string, label: string) => {
  if (method.startsWith("credit_")) return "Crédito"
  if (method === "debit") return "Cartão de débito"
  return label
}

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

function SaleStepper({
  steps,
  currentStep,
}: {
  steps: Array<{ label: string; done: boolean }>
  currentStep: number
}) {
  return (
    <div className="overflow-x-auto px-4 py-4 sm:px-6">
      <div className="mx-auto flex min-w-[720px] max-w-5xl items-center justify-between">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep
          const isDone = step.done && index < currentStep
          const isComplete = step.done && currentStep === steps.length - 1
          const active = isCurrent || isDone || isComplete

          return (
            <div key={step.label} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
                    active
                      ? "border-royal-500 bg-royal-500 text-white"
                      : "border-gray-200 bg-gray-100 text-gray-400"
                  }`}
                >
                  {isDone || isComplete ? <Check className="h-3.5 w-3.5" /> : isCurrent ? index + 1 : <X className="h-3 w-3" />}
                </span>
                <span className={`whitespace-nowrap text-xs font-bold ${active ? "text-royal-600" : "text-gray-400"}`}>
                  {index + 1}. {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <span className={`mx-4 h-px flex-1 ${index < currentStep ? "bg-royal-400" : "bg-gray-200"}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DecisionButton({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: "default" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
        active
          ? tone === "danger"
            ? "border-danger-500 bg-danger-100 text-red-800"
            : "border-royal-500 bg-white text-royal-600 shadow-sm"
          : "border-white/70 bg-white/70 text-gray-600 hover:border-royal-300 hover:text-navy-900"
      }`}
    >
      {children}
    </button>
  )
}

function ItemTypeBadge({ type }: { type: "Principal" | "Upsell" | "Brinde" | "Acessório" }) {
  const styles = {
    Principal: "bg-royal-100 text-royal-600",
    Upsell: "bg-purple-100 text-purple-700",
    Brinde: "bg-success-100 text-green-800",
    Acessório: "bg-sky-100 text-sky-700",
  }

  return (
    <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${styles[type]}`}>
      {type}
    </span>
  )
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-royal-600">{title}</h3>
        <ChevronUp className="h-4 w-4 text-gray-400" />
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function SummaryLine({
  icon: Icon,
  label,
  value,
  strong,
  valueClassName = "text-navy-900",
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
  strong?: boolean
  valueClassName?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${strong ? "border-t border-gray-100 pt-3 font-bold" : ""}`}>
      <span className="flex min-w-0 items-center gap-2 text-gray-600">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-navy-700" />}
        <span className="truncate">{label}</span>
      </span>
      <span className={`shrink-0 font-bold ${valueClassName}`}>{value}</span>
    </div>
  )
}

function ImpactCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-navy-700" />
      <p className="mt-1 text-xs font-bold text-navy-900">{label}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{value}</p>
    </div>
  )
}

function PendingChecklist({ items }: { items: Array<{ label: string; done: boolean }> }) {
  return (
    <div className="space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Pendências</p>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          {item.done ? (
            <CheckCircle2 className="h-4 w-4 text-success-500" />
          ) : (
            <Circle className="h-4 w-4 text-danger-500" />
          )}
          <span className={item.done ? "text-gray-500" : "font-semibold text-red-700"}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

const normalizeSaleKindValue = (value?: string | null) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, "_")

function getSaleItemKind(product: {
  name?: string | null
  condition_notes?: string | null
  product_type?: string | null
  category?: string | null
  category_name_snapshot?: string | null
  category_normalized?: string | null
  imei?: string | null
  serial_number?: string | null
  serialNumber?: string | null
  hasVariants?: boolean
  variants?: InventorySaleVariant[]
}): "device" | "accessory" {
  const productType = normalizeSaleKindValue(product.product_type)
  const categories = [
    product.category,
    product.category_name_snapshot,
    product.category_normalized,
  ].map(normalizeSaleKindValue)

  if (productType === "accessory") return "accessory"
  if (categories.some((category) => category === "accessories" || category === "acessorios" || category === "acessorio")) return "accessory"
  if (!product.imei && !product.serial_number && !product.serialNumber && saleAvailableVariants(product).length > 0) return "accessory"

  if (productType === "device") return "device"
  if (product.imei || product.serial_number || product.serialNumber) return "device"
  if (categories.some((category) => ["iphone", "ipad", "macbook", "apple_watch", "airpods"].includes(category))) return "device"

  const text = `${product.name || ""} ${product.condition_notes || ""}`.toLowerCase()
  if (/(capa|pel[ií]cula|fone|airpods|cabo|fonte|carregador|pencil|caneta|case|adaptador|suporte)/i.test(text)) {
    return "accessory"
  }
  return "device"
}

type SaleCustomerType = "identified" | "walk_in"

const WALK_IN_CUSTOMER_LABEL = "Cliente avulso"

const saleAvailableVariants = (product?: {
  imei?: string | null
  serial_number?: string | null
  variants?: InventorySaleVariant[]
} | null) => {
  if (!product || product.imei || product.serial_number) return []
  return (product.variants || []).filter((variant) => Number(variant.quantity || 0) > 0)
}

const variantSalePrice = (product: Pick<InventoryProduct, "suggested">, variant?: InventorySaleVariant | null) => {
  return Number(variant?.suggestedPrice ?? product.suggested ?? 0)
}

const variantUnitCost = (product: Pick<InventoryProduct, "cost">, variant?: InventorySaleVariant | null) => {
  return Number(variant?.unitCost ?? product.cost ?? 0)
}

const mapVariantPayload = (variant: {
  id?: string
  colorName?: string | null
  color_name?: string | null
  colorHex?: string | null
  color_hex?: string | null
  quantity?: string | number | null
  unitCost?: string | number | null
  unit_cost?: string | number | null
  suggestedPrice?: string | number | null
  suggested_price?: string | number | null
}): InventorySaleVariant => ({
  id: variant.id || "",
  colorName: variant.colorName || variant.color_name || "Variação",
  colorHex: variant.colorHex ?? variant.color_hex ?? null,
  quantity: Math.max(0, Number(variant.quantity || 0)),
  unitCost: (variant.unitCost ?? variant.unit_cost) == null ? null : Number(variant.unitCost ?? variant.unit_cost),
  suggestedPrice: (variant.suggestedPrice ?? variant.suggested_price) == null ? null : Number(variant.suggestedPrice ?? variant.suggested_price),
})

function NewSaleContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [saleCustomerType, setSaleCustomerType] = useState<SaleCustomerType>("identified")
  const [customer, setCustomer] = useState({ name: "", cpf: "", phone: "", email: "" })
  const [walkInCustomer, setWalkInCustomer] = useState({ label: "", phone: "", notes: "" })
  const [customerNotes, setCustomerNotes] = useState("")
  const [customerEditableNotes, setCustomerEditableNotes] = useState("")
  const [existingCustomerFound, setExistingCustomerFound] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [salePrice, setSalePrice] = useState("")
  const [salePriceInput, setSalePriceInput] = useState("")
  const [isSalePriceManual, setIsSalePriceManual] = useState(false)
  const [supplierCostInput, setSupplierCostInput] = useState("")
  const [isReservation, setIsReservation] = useState(false)
  const [paymentDueDate, setPaymentDueDate] = useState("")
  const [receiptAccountId, setReceiptAccountId] = useState("")
  const [salePayments, setSalePayments] = useState<SalePaymentDraft[]>(() => [newPaymentDraft("initial")])
  const [remainingTargetPickerOpen, setRemainingTargetPickerOpen] = useState(false)
  const [warrantyMonths, setWarrantyMonths] = useState("3")
  const [hasTradeIn, setHasTradeIn] = useState(false)
  const [tradeIn, setTradeIn] = useState({ category: "", modelIdx: 0, storage: "", color: "", imei: "", grade: "", batteryHealth: "", value: "" })
  const [tradeInOverageDecision, setTradeInOverageDecision] = useState<"" | "credit" | "change" | "block">("")
  const [saleNotes, setSaleNotes] = useState("")
  const [packagingType, setPackagingType] = useState("")
  const [packagingNotes, setPackagingNotes] = useState("")
  const [saleOrigin, setSaleOrigin] = useState("whatsapp")
  const [marketingCampaignId, setMarketingCampaignId] = useState("")
  const [marketingLeadId, setMarketingLeadId] = useState("")
  const [leadNotes, setLeadNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Additional item (upsell / brinde) — selecionado do estoque ──
  const [hasAdditionalItem, setHasAdditionalItem] = useState(false)
  const [additionalSaleItems, setAdditionalSaleItems] = useState<AdditionalSaleItem[]>([])
  const [additionalSearchTerm, setAdditionalSearchTerm] = useState("")
  const [additionalFilter, setAdditionalFilter] = useState<"all" | "accessory" | "device">("accessory")
  const [tradeInValueInput, setTradeInValueInput] = useState("")
  const [tradeInModelSearch, setTradeInModelSearch] = useState("")
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([])
  const [supplierPrices, setSupplierPrices] = useState<SupplierPrice[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const [marketingCampaigns, setMarketingCampaigns] = useState<MarketingCampaignOption[]>([])
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccountOption[]>([])
  const defaultFees: Record<string, number> = { ...SIDEPAY_FEE_PCTS }
  const [fees, setFees] = useState<Partial<Record<string, number>>>(defaultFees)

  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectId = searchParams.get("product")
  const tradeinParam = searchParams.get("tradein")
  const leadParam = searchParams.get("lead")

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

  useEffect(() => {
    if (!leadParam) return
    try {
      const lead = JSON.parse(atob(decodeURIComponent(leadParam)))
      setCustomer((prev) => ({
        ...prev,
        name: lead.name || prev.name,
        phone: lead.phone || prev.phone,
        email: lead.email || prev.email,
      }))
      setSaleOrigin(lead.sourceChannel || "trafego_pago")
      setMarketingCampaignId(lead.campaignId || "")
      setMarketingLeadId(lead.id || "")
      setLeadNotes([lead.productInterest ? `Interesse: ${lead.productInterest}` : "", lead.notes || ""].filter(Boolean).join("\n"))
      if (lead.productInterest) setSearchTerm(lead.productInterest)
      toast({ title: "Lead importado", description: "Os dados comerciais foram carregados para a venda.", type: "success" })
    } catch {
      console.error("Erro ao ler lead:", leadParam)
    }
  }, [leadParam, toast])

  // Fetch inventory — only products that are in stock (not sold)
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const { data, error } = await supabase
          .from("inventory")
          .select("id, imei, imei2, serial_number, purchase_price, suggested_price, battery_health, grade, status, quantity, condition_notes, notes, type, supplier_name, product_type, category_name_snapshot, catalog:catalog_id(model, variant, storage, color, brand, category)")
          .in("status", ["active", "in_stock"] as any)
          .order("created_at", { ascending: false })

        if (error) throw error

        const imageMap: Record<string, ProductImageRecord | null> = await fetchProductImageMap((data || []).map((item: any) => item.id)).catch(() => ({}))
        const products: InventoryProduct[] = (data || []).map((item: any) => {
          return {
            id: item.id,
            name: getProductName(item),
            brand: item.catalog?.brand || null,
            category: item.catalog?.category || null,
            product_type: item.product_type || null,
            category_name_snapshot: item.category_name_snapshot || null,
            category_normalized: item.catalog?.category || null,
            model: item.catalog?.model || null,
            storage: item.catalog?.storage || null,
            color: item.catalog?.color || null,
            productImage: imageMap[item.id] || null,
            imei: item.imei || "",
            imei2: item.imei2 || "",
            serial_number: item.serial_number || "",
            condition_notes: item.condition_notes || null,
            cost: item.purchase_price || 0,
            suggested: item.suggested_price || 0,
            battery: item.battery_health || 0,
            grade: item.grade || null,
            status: item.status || "active",
            type: item.type || "own",
            supplier_name: item.supplier_name || null,
            quantity: Math.max(1, Number(item.quantity || 1)),
            hasVariants: false,
            variants: [],
          }
        })
        setInventoryProducts(products)
        if (products.length > 0) {
          fetch("/api/inventory/batch-variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inventory_ids: products.map((product) => product.id) }),
          })
            .then((res) => res.json())
            .then((payload) => {
              const variantsById = payload?.data?.variants_by_id || {}
              setInventoryProducts((current) => current.map((product) => {
                const variants = (variantsById[product.id] || []).map(mapVariantPayload)
                return { ...product, variants, hasVariants: saleAvailableVariants({ ...product, variants }).length > 0 }
              }))
              setSelectedProduct((current) => {
                if (!current) return current
                const variants = (variantsById[current.id] || []).map(mapVariantPayload)
                if (variants.length === 0) return current
                return { ...current, variants, hasVariants: saleAvailableVariants({ ...current, variants }).length > 0 }
              })
            })
            .catch(() => null)
        }
      } catch (err) {
        console.error("Erro ao carregar inventário:", err)
      } finally {
        setLoadingInventory(false)
      }
    }
    fetchInventory()
  }, [])

  useEffect(() => {
    const fetchSupplierPrices = async () => {
      try {
        const { data, error } = await (supabase.from("supplier_prices") as any)
          .select("id, category, model, storage, grade, price")
          .order("created_at", { ascending: false })
        if (error) throw error
        setSupplierPrices(data || [])
      } catch (error) {
        console.error("Erro ao carregar preços de fornecedores:", error)
        setSupplierPrices([])
      }
    }
    fetchSupplierPrices()
  }, [])

  // If opened from a product detail page, fetch that product and pre-select
  useEffect(() => {
    if (!preselectId) return
    const fetchProduct = async () => {
      try {
        const { data: items, error } = await (supabase.from("inventory") as any)
          .select("id, imei, imei2, serial_number, purchase_price, suggested_price, battery_health, grade, status, quantity, condition_notes, notes, type, supplier_name, product_type, category_name_snapshot, catalog:catalog_id(model, variant, storage, color, brand, category)")
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

        const product: InventoryProduct = {
          id: items.id,
          name: getProductName(items),
          brand: items.catalog?.brand || null,
          category: items.catalog?.category || null,
          product_type: items.product_type || null,
          category_name_snapshot: items.category_name_snapshot || null,
          category_normalized: items.catalog?.category || null,
          model: items.catalog?.model || null,
          storage: items.catalog?.storage || null,
          color: items.catalog?.color || null,
          productImage: null,
          imei: items.imei || "",
          imei2: items.imei2 || "",
          serial_number: items.serial_number || "",
          condition_notes: items.condition_notes || null,
          cost: items.purchase_price || 0,
          suggested: items.suggested_price || 0,
          battery: items.battery_health || 0,
          grade: items.grade || null,
          status: items.status || "active",
          type: items.type || "own",
          supplier_name: items.supplier_name || null,
          quantity: Math.max(1, Number(items.quantity || 1)),
          hasVariants: false,
          variants: [],
        }
        const imageMap: Record<string, ProductImageRecord | null> = await fetchProductImageMap([product.id]).catch(() => ({}))
        product.productImage = imageMap[product.id] || null
        const variantsPayload = await fetch("/api/inventory/batch-variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inventory_ids: [product.id] }),
        }).then((res) => res.json()).catch(() => null)
        const variants = (variantsPayload?.data?.variants_by_id?.[product.id] || []).map(mapVariantPayload)
        product.variants = variants
        product.hasVariants = saleAvailableVariants(product).length > 0
        const autoVariant = saleAvailableVariants(product).length === 1 ? saleAvailableVariants(product)[0] : null
        const initialPrice = variantSalePrice(product, autoVariant).toString()
        setSelectedProduct(product)
        setSelectedVariantId(autoVariant?.id || null)
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

  useEffect(() => {
    const fetchMarketingCampaigns = async () => {
      try {
        const { data, error } = await ((supabase.from("marketing_campaigns") as any)
          .select("id, name, channel, status")
          .in("status", ["planned", "active", "paused"])
          .order("created_at", { ascending: false }) as any)

        if (error) throw error
        setMarketingCampaigns(data || [])
      } catch (error) {
        console.error("Erro ao carregar campanhas:", error)
      }
    }

    fetchMarketingCampaigns()
  }, [])

  useEffect(() => {
    const fetchFinanceAccounts = async () => {
      try {
        const { data, error } = await (supabase.from("finance_accounts") as any)
          .select("id, name, institution")
          .eq("is_active", true)
          .order("created_at", { ascending: true })

        if (error) throw error
        const accounts = data || []
        setFinanceAccounts(accounts)
        if (accounts[0]?.id) setReceiptAccountId((current) => current || accounts[0].id)
      } catch (error) {
        console.error("Erro ao carregar contas financeiras:", error)
      }
    }

    fetchFinanceAccounts()
  }, [])

  useEffect(() => {
    if (!receiptAccountId) return
    setSalePayments((previous) => previous.map((payment) => (
      payment.financial_account_id || !isFinancialPayment(payment.payment_method)
        ? payment
        : { ...payment, financial_account_id: receiptAccountId }
    )))
  }, [receiptAccountId])

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

  const selectedProductVariants = useMemo(() => saleAvailableVariants(selectedProduct), [selectedProduct])
  const selectedMainVariant = useMemo(
    () => selectedProductVariants.find((variant) => variant.id === selectedVariantId) || null,
    [selectedProductVariants, selectedVariantId]
  )
  const mainVariantRequired = selectedProductVariants.length > 0
  const selectedProductEffectiveCost = useMemo(() => {
    if (!selectedProduct) return 0
    if (selectedProduct.type === "supplier") return parseFloat(supplierCostInput) || 0
    return variantUnitCost(selectedProduct, selectedMainVariant)
  }, [selectedProduct, selectedMainVariant, supplierCostInput])
  const selectedProductCostLabel = selectedMainVariant?.unitCost != null
    ? "Custo da variação"
    : mainVariantRequired
      ? "Custo médio"
      : "Custo"

  // Preco unitario e totais
  const unitPrice = parseFloat(salePrice) || 0
  const totalBasePrice = unitPrice * quantity
  const originalUnitPrice = selectedProduct ? variantSalePrice(selectedProduct, selectedMainVariant) : 0
  const originalTotalPrice = originalUnitPrice * quantity
  const hasMainProductDiscount = Boolean(selectedProduct && originalUnitPrice > 0 && unitPrice > 0 && unitPrice < originalUnitPrice)
  const mainProductDiscount = hasMainProductDiscount ? originalTotalPrice - totalBasePrice : 0

  // Upsell price (brinde não entra no total pago pelo cliente)
  const upsellTotal = useMemo(() => {
    return additionalSaleItems.reduce((sum, item) => {
      if (item.type !== "upsell") return sum
      return sum + (parseFloat(item.salePrice) || 0) * (item.qty || 1)
    }, 0)
  }, [additionalSaleItems])

  // Total final da venda: produto principal + upsell
  const finalTotal = totalBasePrice + upsellTotal

  // Lucro base do produto principal (por unidade): independe do método de pagamento
  const baseProfit = useMemo(() => {
    if (!selectedProduct || !salePrice) return 0
    return unitPrice - selectedProductEffectiveCost
  }, [selectedProduct, salePrice, unitPrice, selectedProductEffectiveCost])

  // Lucro base TOTAL considerando quantidade
  const totalBaseProfit = useMemo(() => {
    return baseProfit * quantity
  }, [baseProfit, quantity])

  // Lucro adicional (upsell ou brinde)
  const additionalProfit = useMemo(() => {
    return additionalSaleItems.reduce((sum, item) => {
      const qty = item.qty || 1
      const cost = item.cost * qty
      if (item.type === "upsell") return sum + (parseFloat(item.salePrice) || 0) * qty - cost
      return sum - cost
    }, 0)
  }, [additionalSaleItems])

  // Lucro total: principal + adicionais
  const totalProfit = useMemo(() => {
    return totalBaseProfit + additionalProfit
  }, [totalBaseProfit, additionalProfit])

  const totalCost = useMemo(() => {
    return finalTotal - totalProfit
  }, [finalTotal, totalProfit])

  const getAvailableQty = useCallback((product?: Pick<InventoryProduct, "quantity" | "type"> | null) => {
    if (!product || product.type === "supplier") return 1
    return Math.max(1, Number(product.quantity || 1))
  }, [])

  const clampQty = useCallback((value: number, max: number) => {
    return Math.max(1, Math.min(max, Number.isFinite(value) ? value : 1))
  }, [])

  const addAdditionalSaleItem = useCallback((item: InventoryProduct) => {
    const variants = saleAvailableVariants(item)
    const autoVariant = variants.length === 1 ? variants[0] : null
    setHasAdditionalItem(true)
    setAdditionalSaleItems((previous) => {
      if (previous.some((selected) => selected.itemId === item.id)) return previous
      const effectiveSuggested = variantSalePrice(item, autoVariant)
      const effectiveCost = variantUnitCost(item, autoVariant)
      return [
        ...previous,
        {
          itemId: item.id,
          name: item.name,
          brand: item.brand || null,
          category: item.category || null,
          product_type: item.product_type || null,
          category_name_snapshot: item.category_name_snapshot || null,
          category_normalized: item.category_normalized || item.category || null,
          model: item.model || null,
          color: item.color || null,
          productImage: item.productImage || null,
          cost: effectiveCost,
          suggested: effectiveSuggested,
          type: "upsell",
          salePrice: effectiveSuggested.toString(),
          qty: 1,
          availableQty: autoVariant ? autoVariant.quantity : getAvailableQty(item),
          imei: item.imei || "",
          serialNumber: item.serial_number || "",
          variants,
          selectedVariantId: autoVariant?.id || null,
          selectedVariantName: autoVariant?.colorName || null,
          selectedVariantColorHex: autoVariant?.colorHex || null,
        },
      ]
    })
  }, [getAvailableQty])

  const updateAdditionalSaleItem = useCallback((itemId: string, partial: Partial<AdditionalSaleItem>) => {
    setAdditionalSaleItems((previous) => previous.map((item) => (
      item.itemId === itemId ? { ...item, ...partial } : item
    )))
  }, [])

  const removeAdditionalSaleItem = useCallback((itemId: string) => {
    setAdditionalSaleItems((previous) => previous.filter((item) => item.itemId !== itemId))
  }, [])

  const openAdditionalBuilder = useCallback(() => {
    setHasAdditionalItem(true)
    window.requestAnimationFrame(() => {
      document.getElementById("additional-items-builder")?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [])

  const selectMainVariant = useCallback((variant: InventorySaleVariant) => {
    if (!selectedProduct) return
    const currentSuggestedPrice = variantSalePrice(selectedProduct, selectedMainVariant)
    const nextSuggestedPrice = variantSalePrice(selectedProduct, variant)
    const currentSalePrice = parseFloat(salePrice)
    const shouldUseVariantPrice = !isSalePriceManual && (
      !currentSalePrice ||
      Math.abs(currentSalePrice - currentSuggestedPrice) < 0.005
    )
    setSelectedVariantId(variant.id)
    if (shouldUseVariantPrice) {
      const initialPrice = nextSuggestedPrice.toString()
      setSalePrice(initialPrice)
      setSalePriceInput(initialPrice)
    }
    setQuantity((current) => clampQty(current, variant.quantity))
  }, [selectedProduct, selectedMainVariant, salePrice, isSalePriceManual, clampQty])

  const selectAdditionalVariant = useCallback((itemId: string, variant: InventorySaleVariant) => {
    setAdditionalSaleItems((previous) => previous.map((item) => {
      if (item.itemId !== itemId) return item
      const nextSuggested = variantSalePrice(item, variant)
      return {
        ...item,
        selectedVariantId: variant.id,
        selectedVariantName: variant.colorName,
        selectedVariantColorHex: variant.colorHex,
        cost: variantUnitCost(item, variant),
        suggested: nextSuggested,
        salePrice: item.type === "upsell" ? nextSuggested.toString() : item.salePrice,
        availableQty: variant.quantity,
        qty: clampQty(item.qty, variant.quantity),
      }
    }))
  }, [clampQty])

  // Quantidade máxima disponível no item selecionado.
  const maxAvailableQty = useMemo(() => {
    if (selectedMainVariant) return selectedMainVariant.quantity
    return getAvailableQty(selectedProduct)
  }, [selectedProduct, selectedMainVariant, getAvailableQty])

  useEffect(() => {
    setQuantity((current) => clampQty(current, maxAvailableQty))
  }, [maxAvailableQty, clampQty])

  useEffect(() => {
    if (!selectedProduct || selectedVariantId || selectedProductVariants.length !== 1) return
    const onlyVariant = selectedProductVariants[0]
    setSelectedVariantId(onlyVariant.id)
    if (!isSalePriceManual) {
      const initialPrice = variantSalePrice(selectedProduct, onlyVariant).toString()
      setSalePrice(initialPrice)
      setSalePriceInput(initialPrice)
    }
  }, [selectedProduct, selectedProductVariants, selectedVariantId, isSalePriceManual])

  useEffect(() => {
    setAdditionalSaleItems((previous) => previous.map((item) => ({
      ...item,
      qty: clampQty(item.qty, item.availableQty),
    })))
  }, [clampQty])

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

  const selectProduct = (product: InventoryProduct) => {
    const variants = saleAvailableVariants(product)
    const autoVariant = variants.length === 1 ? variants[0] : null
    const initialPrice = variantSalePrice(product, autoVariant).toString()
    setSelectedProduct(product)
    setSelectedVariantId(autoVariant?.id || null)
    setSalePrice(initialPrice)
    setSalePriceInput(initialPrice)
    setIsSalePriceManual(false)
    setQuantity(1)
  }

  const clearSelectedProduct = () => {
    setSelectedProduct(null)
    setSelectedVariantId(null)
    setSalePrice("")
    setSalePriceInput("")
    setSupplierCostInput("")
    setQuantity(1)
    setSalePayments([newPaymentDraft("initial")])
    setAdditionalSaleItems([])
    setHasAdditionalItem(false)
  }

  const updateCustomer = (field: string, value: string) => {
    if (field === "cpf") value = maskCPF(value)
    if (field === "phone") value = formatPhone(value)
    setCustomer((prev) => ({ ...prev, [field]: value }))
  }

  const updateWalkInCustomer = (field: keyof typeof walkInCustomer, value: string) => {
    if (field === "phone") value = formatPhone(value)
    setWalkInCustomer((prev) => ({ ...prev, [field]: value }))
  }

  const setSaleType = (type: SaleCustomerType) => {
    setSaleCustomerType(type)
    if (type === "walk_in") {
      setExistingCustomerFound(false)
      setCustomerNotes("")
      setCustomerEditableNotes("")
    }
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
    const selectedModel = normalizeSearchText(tradeInModel.name)
    const selectedStorage = normalizeSearchText(tradeIn.storage)
    const selectedGrade = normalizeSearchText(tradeIn.grade)

    const supplierMatches = supplierPrices
      .filter((price) => {
        const categoryMatches = !price.category || price.category === tradeIn.category
        const priceModel = normalizeSearchText(price.model)
        const modelMatches = priceModel === selectedModel || priceModel.includes(selectedModel) || selectedModel.includes(priceModel)
        const storage = normalizeSearchText(price.storage)
        const grade = normalizeSearchText(price.grade)
        const storageMatches = !selectedStorage || !storage || storage === selectedStorage
        const gradeMatches = !selectedGrade || !grade || grade === selectedGrade
        return categoryMatches && modelMatches && storageMatches && gradeMatches
      })
      .map((price) => ({ price: Number(price.price || 0) }))
      .filter((price) => Number.isFinite(price.price) && price.price > 0)

    if (supplierMatches.length > 0) return supplierMatches

    return inventoryProducts
      .filter((product: any) => normalizeSearchText(product.name).includes(selectedModel))
      .map((product: any) => ({ price: Number(product.cost || 0) }))
      .filter((price) => Number.isFinite(price.price) && price.price > 0)
  }, [tradeIn.category, tradeInModel, tradeIn.storage, tradeIn.grade, supplierPrices, inventoryProducts])

  const tradeInEvaluation = useMemo(() => {
    if (!hasTradeIn || !tradeInModel) return null
    return calculateDeviceValue({
      grade: tradeIn.grade,
      batteryHealth: tradeIn.batteryHealth ? parseInt(tradeIn.batteryHealth) : undefined,
      manualValue: tradeIn.value ? Number(tradeIn.value) : undefined,
      matchingPrices: tradeInSupplierMatches,
    })
  }, [hasTradeIn, tradeInModel, tradeIn.grade, tradeIn.batteryHealth, tradeIn.value, tradeInSupplierMatches])

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

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const today = todayISO()
      const warrantyEnd = addDaysISO(today, parseInt(warrantyMonths) * 30)
      if (mainVariantRequired && !selectedMainVariant) {
        throw new Error("Selecione a variação do item antes de concluir a venda.")
      }
      if (selectedMainVariant && quantity > selectedMainVariant.quantity) {
        throw new Error(`Só existe ${selectedMainVariant.quantity} unidade disponível na variação ${selectedMainVariant.colorName}.`)
      }
      const invalidAdditionalVariant = additionalSaleItems.find((item) => saleAvailableVariants(item).length > 0 && !item.selectedVariantId)
      if (invalidAdditionalVariant) {
        throw new Error(`Selecione a variação do item adicional ${getAdditionalItemDisplayName(invalidAdditionalVariant.name)} antes de concluir a venda.`)
      }
      const overstockedAdditionalVariant = additionalSaleItems.find((item) => {
        const variant = saleAvailableVariants(item).find((v) => v.id === item.selectedVariantId)
        return Boolean(variant && (item.qty || 1) > variant.quantity)
      })
      if (overstockedAdditionalVariant) {
        const variant = saleAvailableVariants(overstockedAdditionalVariant).find((v) => v.id === overstockedAdditionalVariant.selectedVariantId)
        throw new Error(`Só existe ${variant?.quantity || 0} unidade disponível na variação ${variant?.colorName || "selecionada"}.`)
      }

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

      // 1. Create or find customer only for identified sales.
      let customerId = null

      // Search by CPF if available, otherwise search by name+email
      if (saleCustomerType === "identified" && customer.name) {
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

      const finalPaymentRows = paymentDraftRows.map((payment) => ({
        ...payment,
        payment_method: normalizeSalePaymentMethod(payment.payment_method),
        due_date: payment.due_date || today,
        status: payment.status || "pending",
      }))
      const serverValidation = validateSalePayments({
        payments: paymentValidationRows.map((payment) => ({
          payment_method: payment.payment_method,
          amount: String(payment.amount),
          due_date: payment.due_date || "",
          financial_account_id: payment.financial_account_id || "",
        })),
        expectedTotal: finalTotal,
        requireAccount: !isReservation,
      })
      if (!serverValidation.ok) throw new Error(serverValidation.message || "Pagamentos inválidos")

      const tradeInOverageNote = storeAmountDue > 0
        ? `Diferença do trade-in: ${tradeInOverageDecision === "credit" ? "gerar crédito operacional" : "registrar troco ao cliente"} (${formatBRL(storeAmountDue)}).`
        : null
      const saleOperationalNotes = [
        quantity > 1 ? `[${quantity}x ${selectedProduct!.name}]` : null,
        saleNotes || null,
        tradeInOverageNote,
      ].filter(Boolean).join("\n") || null
      const resolvedPaymentMethod = finalPaymentRows.length > 1
        ? "mixed"
        : finalPaymentRows[0]?.payment_method || (storeAmountDue > 0
          ? tradeInOverageDecision === "credit" ? "trade_in_credit" : "trade_in_return"
          : null)

      // 2. Upload trade-in photos and register all sale data atomically
      const uploadedTradeInPhotos = hasTradeIn && tradeInModels[tradeIn.modelIdx]
        ? await uploadTradeInPhotos(companyId, "")
        : []

      const saleResponse = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryId: selectedProduct!.id,
          customerType: saleCustomerType,
          customerId,
          customerName: saleCustomerType === "identified" ? customer.name || null : walkInCustomer.label.trim() || WALK_IN_CUSTOMER_LABEL,
          walkInLabel: saleCustomerType === "walk_in" ? walkInCustomer.label.trim() || WALK_IN_CUSTOMER_LABEL : null,
          walkInPhone: saleCustomerType === "walk_in" ? walkInCustomer.phone || null : null,
          walkInNotes: saleCustomerType === "walk_in" ? walkInCustomer.notes.trim() || null : null,
          finalTotal,
          netAmount: saleEconomics.storeCashReceives,
          cardFeePct: saleEconomics.feePct || 0,
          paymentMethod: resolvedPaymentMethod,
          warrantyMonths: parseInt(warrantyMonths),
          warrantyStart: today,
          warrantyEnd,
          sourceType: selectedProduct?.type || "own",
          supplierName: selectedProduct?.type === "supplier" ? (selectedProduct.supplier_name || null) : null,
          supplierCost: selectedProduct?.type === "supplier" ? (parseFloat(supplierCostInput) || 0) : null,
          saleStatus: isReservation ? "reserved" : "completed",
          paymentDueDate: finalPaymentRows.find((p) => p.status === "pending")?.due_date || null,
          saleDate: today,
          saleOrigin: saleOrigin || "unknown",
          marketingCampaignId: saleOrigin === "trafego_pago" && marketingCampaignId ? marketingCampaignId : null,
          marketingLeadId: marketingLeadId || null,
          leadNotes: leadNotes || null,
          packagingType: packagingType || null,
          packagingNotes: packagingType === "other" ? packagingNotes.trim() || null : null,
          notes: saleOperationalNotes,
          quantity,
          selectedVariantId: selectedMainVariant?.id || null,
          selectedVariantName: selectedMainVariant?.colorName || null,
          selectedVariantColorHex: selectedMainVariant?.colorHex || null,
          isReservation,
          productName: selectedProduct!.name,
          additionalItems: additionalSaleItems.map((item) => ({
            itemId: item.itemId,
            type: item.type,
            name: item.name,
            cost: item.cost * (item.qty || 1),
            salePrice: item.type === "upsell" ? parseFloat(item.salePrice) * (item.qty || 1) : 0,
            qty: item.qty || 1,
            selectedVariantId: item.selectedVariantId || null,
            selectedVariantName: item.selectedVariantName || null,
            selectedVariantColorHex: item.selectedVariantColorHex || null,
          })),
          payments: finalPaymentRows.map((payment) => ({
            paymentMethod: payment.payment_method,
            amount: payment.amount,
            status: payment.status,
            dueDate: payment.due_date || today,
            financialAccountId: isFinancialPayment(payment.payment_method) ? payment.financial_account_id || null : null,
            notes: payment.notes || null,
          })),
          ...(hasTradeIn && tradeInModels[tradeIn.modelIdx] ? {
            tradeIn: {
              imei: tradeIn.imei || null,
              grade: tradeIn.grade || null,
              value: parseFloat(tradeIn.value) || 0,
              photos: uploadedTradeInPhotos.length > 0 ? uploadedTradeInPhotos : null,
              modelName: tradeInModels[tradeIn.modelIdx].name,
              conditionNotes: saleNotes || null,
              inventoryStatus: isReservation ? "trade_in_received" : getTradeInInventoryStatus(),
              ...(storeAmountDue > 0 && tradeInOverageDecision
                ? { overageHandling: tradeInOverageDecision as "credit" | "change", overageAmount: storeAmountDue }
                : {}),
            },
          } : {}),
        }),
      })

      if (!saleResponse.ok) {
        const errBody = await saleResponse.json().catch(() => ({ error: { message: "Erro desconhecido" } }))
        throw new Error(errBody?.error?.message || `Erro ao registrar venda (${saleResponse.status})`)
      }

      const saleResult = await saleResponse.json()
      if (!saleResult?.data?.saleId) throw new Error("Resposta inválida ao registrar venda.")

      const sale = { id: saleResult.data.saleId as string }

      if (!isReservation) try {
        const additionalItemsSummary = additionalSaleItems.length
          ? additionalSaleItems.map((item) => `${item.qty || 1}x ${getAdditionalItemDisplayName(item.name)}${item.type === "free" ? " (brinde)" : ""}`).join(", ")
          : null
        const documentNotes = [selectedProduct?.condition_notes, saleNotes].filter(Boolean).join(". ")
        const documentData: SaleDocumentData = {
          saleId: sale.id,
          saleDate: today,
          customerName: saleCustomerType === "walk_in" ? walkInCustomer.label.trim() || WALK_IN_CUSTOMER_LABEL : customer.name,
          customerCpf: saleCustomerType === "walk_in" ? null : customer.cpf || null,
          customerPhone: saleCustomerType === "walk_in" ? walkInCustomer.phone || null : customer.phone || null,
          paymentMethod: selectedPaymentLabel,
          saleNotes: documentNotes || null,
          additionalItems: additionalItemsSummary,
          payments: finalPaymentRows.map((payment) => ({
            method: formatPaymentMethod(payment.payment_method),
            amount: payment.amount,
          })),
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
        title: isReservation ? "Venda reservada!" : "Venda registrada!",
        description: isReservation
          ? `Reserva de ${selectedProduct!.name} criada até ${(finalPaymentRows.find((payment) => payment.status === "pending")?.due_date || today).split("-").reverse().join("/")}.`
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
  useEffect(() => {
    if (!hasTradeIn || storeAmountDue <= 0) setTradeInOverageDecision("")
  }, [hasTradeIn, storeAmountDue])

  const riskReserve = useMemo(() => {
    if (!selectedProduct) return 0
    return estimateRiskReserve({
      cost: selectedProductEffectiveCost * quantity,
      category: selectedProduct.name,
      grade: selectedProduct.grade,
      batteryHealth: selectedProduct.battery,
      warrantyMonths: Number(warrantyMonths || 0),
    })
  }, [selectedProduct, selectedProductEffectiveCost, quantity, warrantyMonths])

  const tradeInPaymentAmount = hasTradeIn ? Math.min(tradeInValue, finalTotal) : 0
  const editablePaymentsTotal = useMemo(() => {
    return salePayments.reduce((sum, payment) => sum + parseCurrencyLike(payment.amount), 0)
  }, [salePayments])
  const distributedPaymentsTotal = roundCurrency(tradeInPaymentAmount + editablePaymentsTotal)
  const paymentDifference = roundCurrency(finalTotal - distributedPaymentsTotal)
  const editablePaymentRows = useMemo<SalePayment[]>(() => {
    return salePayments.map((payment): SalePayment => {
      const method = normalizeSalePaymentMethod(payment.payment_method)
      return {
        id: payment.id,
        payment_method: method,
        amount: parseCurrencyLike(payment.amount),
        status: isReservation || isCreditSalePayment(method) ? "pending" : "received",
        due_date: payment.due_date,
        financial_account_id: payment.financial_account_id || null,
        notes: payment.notes || null,
      }
    })
  }, [salePayments, isReservation])
  const tradeInPaymentRow = useMemo<SalePayment | null>(() => {
    if (tradeInPaymentAmount <= 0) return null
    return {
      payment_method: "trade_in_credit",
      amount: tradeInPaymentAmount,
      status: "received",
      due_date: todayISO(),
      received_date: todayISO(),
      financial_account_id: null,
      notes: "Abatimento por trade-in",
    }
  }, [tradeInPaymentAmount])
  const paymentDraftRows = useMemo<SalePayment[]>(() => {
    return [
      ...(tradeInPaymentRow ? [tradeInPaymentRow] : []),
      ...editablePaymentRows.filter((payment) => payment.amount > 0 && payment.payment_method),
    ]
  }, [editablePaymentRows, tradeInPaymentRow])
  const paymentValidationRows = useMemo<SalePayment[]>(() => {
    return [
      ...(tradeInPaymentRow ? [tradeInPaymentRow] : []),
      ...editablePaymentRows.filter((payment) => (
        payment.amount > 0 ||
        Boolean(payment.payment_method) ||
        Boolean(payment.financial_account_id)
      )),
    ]
  }, [editablePaymentRows, tradeInPaymentRow])

  const saleEconomics = useMemo(() => {
    return calculateSplitPaymentEconomics({
      saleRevenue: finalTotal,
      payments: paymentDraftRows.length > 0 ? paymentDraftRows : [{
        payment_method: "pix",
        amount: customerAmountDue,
        status: "received",
      }],
      settings: fees,
      costTotal: totalCost,
      riskReserve,
    })
  }, [finalTotal, customerAmountDue, paymentDraftRows, fees, totalCost, riskReserve])
  const selectedPaymentLabel = paymentDraftRows.length > 0
    ? paymentDraftRows.map((payment) => formatPaymentMethod(payment.payment_method)).join(" + ")
    : storeAmountDue > 0
      ? "Downgrade / troco ao cliente"
      : customerAmountDue === 0 && hasTradeIn
        ? "Trade-in cobre a venda"
        : "Não escolhido"
  const creditMethods = PAYMENT_METHODS.filter((item) => item.value.startsWith("credit_"))
  const paymentMethodOptions = Array.from(
    new Map(
      SPLIT_PAYMENT_METHODS
        .filter((item) => !item.value.startsWith("credit_") || item.value === "credit_1x")
        .map((item) => [item.value, item])
    ).values()
  )
  const hasCreditPayment = paymentDraftRows.some((payment) => isCreditSalePayment(payment.payment_method))
  const paymentSummaryRows = useMemo(() => {
    const today = todayISO()
    return paymentDraftRows.map((payment, index) => {
      const method = normalizeSalePaymentMethod(payment.payment_method)
      const amount = roundCurrency(Number(payment.amount || 0))
      const paymentInfo = calculatePaymentPrice(amount, method, fees)
      const feeAmount = roundCurrency(Math.max(0, paymentInfo.price - amount))
      const isTradeInCredit = method === "trade_in_credit"
      const isCredit = isCreditSalePayment(method)
      return {
        key: payment.id || `${method || "payment"}-${payment.due_date || "sem-data"}-${index}`,
        label: isCredit ? `Crédito ${paymentInfo.installments}x` : formatPaymentMethod(method),
        amount,
        dueLabel: isTradeInCredit ? "Não financeiro" : payment.due_date === today ? "Hoje" : formatDate(payment.due_date),
        detail: isTradeInCredit
          ? "Crédito/Trade-in aplicado"
          : feeAmount > 0
            ? `Cliente paga ${formatBRL(paymentInfo.price)}`
            : "Sem taxa",
        isTradeInCredit,
      }
    })
  }, [paymentDraftRows, fees])

  const additionalCandidates = useMemo(() => {
    const term = additionalSearchTerm.trim().toLowerCase()
    const selectedIds = new Set(additionalSaleItems.map((item) => item.itemId))
    return inventoryProducts
      .filter((item) => item.id !== selectedProduct?.id)
      .filter((item) => !selectedIds.has(item.id))
      .filter((item) => additionalFilter === "all" || getSaleItemKind(item) === additionalFilter)
      .filter((item) => {
        if (!term) return true
        return [item.name, item.imei, item.serial_number, item.condition_notes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      })
      .slice(0, 10)
  }, [inventoryProducts, selectedProduct?.id, additionalFilter, additionalSearchTerm, additionalSaleItems])
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
  const tradeInDeviceName = tradeInModel?.name || tradeInModelSearch || "Aparelho recebido"
  const hasValidTradeIn = !hasTradeIn || Boolean(tradeIn.category && tradeInModel && Number(tradeIn.value || 0) > 0)
  const additionalItemsMissingVariant = additionalSaleItems.filter((item) => saleAvailableVariants(item).length > 0 && !item.selectedVariantId)
  const additionalItemsOverVariantStock = additionalSaleItems.filter((item) => {
    const variant = saleAvailableVariants(item).find((v) => v.id === item.selectedVariantId)
    return Boolean(variant && (item.qty || 1) > variant.quantity)
  })
  const hasRequiredVariantsSelected = (!mainVariantRequired || Boolean(selectedVariantId)) && additionalItemsMissingVariant.length === 0 && additionalItemsOverVariantStock.length === 0
  const tradeInOverageNeedsDecision = hasTradeIn && storeAmountDue > 0
  const canResolveTradeInOverage = !tradeInOverageNeedsDecision || Boolean(tradeInOverageDecision && tradeInOverageDecision !== "block")
  const paidAdditionalCount = additionalSaleItems.reduce((sum, item) => item.type === "upsell" ? sum + (item.qty || 1) : sum, 0)
  const giftCount = additionalSaleItems.reduce((sum, item) => item.type === "free" ? sum + (item.qty || 1) : sum, 0)
  const giftRealTotal = additionalSaleItems.reduce((sum, item) => item.type === "free" ? sum + (Number(item.suggested || item.salePrice || 0) * (item.qty || 1)) : sum, 0)
  const grossItemsTotal = (selectedProduct ? (originalTotalPrice || totalBasePrice) : 0) + upsellTotal
  const discountTotal = Math.max(0, grossItemsTotal - finalTotal)
  const warrantyIssueText = isReservation
    ? "Garantia será emitida somente após recebimento"
    : "Garantia será emitida ao concluir a venda"
  const profitTitle = isReservation ? "Lucro previsto" : hasTradeIn && !hasValidTradeIn ? "Lucro estimado" : "Lucro real"
  const profitCaption = `${saleEconomics.realMarginPct.toFixed(1)}% de margem`
  const operationalStatus = isReservation ? "Reserva" : "Venda imediata"
  const saleItems = useMemo(() => {
    const rows: Array<{
      id: string
      name: string
      brand?: string | null
      category?: string | null
      model?: string | null
      color?: string | null
      productImage?: ProductImageRecord | null
      identity: string
      type: "Principal" | "Upsell" | "Brinde" | "Acessório"
      quantity: number
      unitPrice: number
      chargedUnitPrice: number
      total: number
      realTotal: number
      cost: number
      marginPct: number | null
      removable?: boolean
    }> = []

    if (selectedProduct) {
      const cost = selectedProductEffectiveCost * quantity
      rows.push({
        id: selectedProduct.id,
        name: selectedProduct.name,
        brand: selectedProduct.brand,
        category: selectedProduct.category,
        model: selectedProduct.model,
        color: selectedProduct.color,
        productImage: selectedProduct.productImage,
        identity: [productIdentity || null, selectedMainVariant ? `Variação ${selectedMainVariant.colorName}` : null]
          .filter(Boolean)
          .join(" · ") || "Sem IMEI/serial informado",
        type: "Principal",
        quantity,
        unitPrice,
        chargedUnitPrice: unitPrice,
        total: totalBasePrice,
        realTotal: totalBasePrice,
        cost,
        marginPct: totalBasePrice > 0 ? ((totalBasePrice - cost) / totalBasePrice) * 100 : null,
      })
    }

    additionalSaleItems.forEach((additionalItem) => {
      const qty = additionalItem.qty || 1
      const isFree = additionalItem.type === "free"
      const realUnitPrice = Number(additionalItem.suggested || additionalItem.salePrice || 0)
      const chargedUnitPrice = isFree ? 0 : parseFloat(additionalItem.salePrice) || 0
      const total = chargedUnitPrice * qty
      const realTotal = realUnitPrice * qty
      const cost = additionalItem.cost * qty
      const itemKind = isFree
        ? "Brinde"
        : getSaleItemKind(additionalItem) === "accessory"
          ? "Acessório"
          : "Upsell"
      rows.push({
        id: additionalItem.itemId,
        name: getAdditionalItemDisplayName(additionalItem.name),
        brand: additionalItem.brand,
        category: additionalItem.category,
        model: additionalItem.model,
        color: additionalItem.color,
        productImage: additionalItem.productImage,
        identity: [additionalItem.imei ? `IMEI ${additionalItem.imei}` : null, additionalItem.serialNumber ? `Serial ${additionalItem.serialNumber}` : null]
          .filter(Boolean)
          .join(" · ") || "Item vinculado à venda",
        type: itemKind,
        quantity: qty,
        unitPrice: realUnitPrice,
        chargedUnitPrice,
        total,
        realTotal,
        cost,
        marginPct: total > 0 ? ((total - cost) / total) * 100 : null,
        removable: true,
      })
    })

    return rows
  }, [selectedProduct, selectedMainVariant, selectedProductEffectiveCost, quantity, productIdentity, unitPrice, totalBasePrice, additionalSaleItems])

  const remainingPaymentTargets = useMemo(() => {
    return salePayments.flatMap((payment, index) => {
      const method = normalizeSalePaymentMethod(payment.payment_method)
      if (!method) return []

      const currentAmount = parseCurrencyLike(payment.amount)
      const othersTotal = salePayments
        .filter((item) => item.id !== payment.id)
        .reduce((sum, item) => sum + parseCurrencyLike(item.amount), 0)
      const recalculatedAmount = roundCurrency(Math.max(0, finalTotal - tradeInPaymentAmount - othersTotal))
      const paymentInfo = calculatePaymentPrice(currentAmount, method, fees)
      const label = isCreditSalePayment(method)
        ? `Crédito ${paymentInfo.installments}x`
        : formatPaymentMethod(method)

      return [{
        id: payment.id,
        label,
        index: index + 1,
        currentAmount,
        recalculatedAmount,
      }]
    })
  }, [salePayments, finalTotal, tradeInPaymentAmount, fees])

  const updateSalePayment = useCallback((paymentId: string, partial: Partial<SalePaymentDraft>) => {
    setSalePayments((previous) => previous.map((payment) => {
      if (payment.id !== paymentId) return payment
      const next = { ...payment, ...partial }
      if (partial.payment_method !== undefined) {
        next.payment_method = normalizeSalePaymentMethod(partial.payment_method)
        next.due_date = defaultPaymentDueDate(next.payment_method)
        if (!isFinancialPayment(next.payment_method)) next.financial_account_id = ""
        if (isFinancialPayment(next.payment_method) && !next.financial_account_id) next.financial_account_id = receiptAccountId
      }
      return next
    }))
  }, [receiptAccountId])

  const addSalePayment = useCallback(() => {
    if (paymentDifference <= 0) {
      toast({
        title: "A venda já está com pagamento fechado",
        description: paymentDifference < 0 ? "Reduza um pagamento antes de adicionar outro." : "Edite um valor existente para abrir espaço para outro pagamento.",
        type: "error",
      })
      return
    }
    setSalePayments((previous) => [
      ...previous,
      {
        ...newPaymentDraft(),
        amount: paymentDifference > 0 ? paymentAmountInput(paymentDifference) : "",
        financial_account_id: receiptAccountId,
      },
    ])
  }, [paymentDifference, receiptAccountId, toast])

  const removeSalePayment = useCallback((paymentId: string) => {
    setSalePayments((previous) => previous.length <= 1 ? previous : previous.filter((payment) => payment.id !== paymentId))
  }, [])

  const fillRemainingForPayment = useCallback((paymentId?: string) => {
    if (!paymentId) return
    setRemainingTargetPickerOpen(false)
    setSalePayments((previous) => {
      const othersTotal = previous
        .filter((payment) => payment.id !== paymentId)
        .reduce((sum, payment) => sum + parseCurrencyLike(payment.amount), 0)
      const remaining = roundCurrency(Math.max(0, finalTotal - tradeInPaymentAmount - othersTotal))
      return previous.map((payment) => payment.id === paymentId ? { ...payment, amount: paymentAmountInput(remaining) } : payment)
    })
  }, [finalTotal, tradeInPaymentAmount])

  const handleUseRemaining = useCallback(() => {
    if (remainingPaymentTargets.length > 1) {
      setRemainingTargetPickerOpen(true)
      return
    }

    fillRemainingForPayment(remainingPaymentTargets[0]?.id || salePayments[salePayments.length - 1]?.id)
  }, [fillRemainingForPayment, remainingPaymentTargets, salePayments])

  useEffect(() => {
    if (remainingPaymentTargets.length <= 1) setRemainingTargetPickerOpen(false)
  }, [remainingPaymentTargets.length])

  const paymentValidation = validateSalePayments({
    payments: paymentValidationRows.map((payment) => ({
      payment_method: payment.payment_method,
      amount: String(payment.amount),
      due_date: payment.due_date || "",
      financial_account_id: payment.financial_account_id || "",
    })),
    expectedTotal: finalTotal,
    requireAccount: !isReservation,
  })
  const paymentSummaryStatusLabel = paymentValidation.ok
    ? "Pagamento válido"
    : paymentDifference < 0
      ? "Pagamento excedente"
      : paymentDifference > 0
        ? "Pagamento incompleto"
        : "Revisar dados"
  const paymentValidationTone = paymentValidation.ok ? "success" : paymentDifference < 0 ? "danger" : "warning"
  const hasPaymentReady = Boolean(selectedProduct && paymentValidation.ok)
  const isWalkInSale = saleCustomerType === "walk_in"
  const customerReady = isWalkInSale || Boolean(customer.name && validateCPF(customer.cpf))
  const customerSummaryLabel = isWalkInSale ? walkInCustomer.label.trim() || WALK_IN_CUSTOMER_LABEL : customer.name || "Cliente identificado pendente"
  const saleSteps = [
    { label: "Produto", done: Boolean(selectedProduct) },
    { label: "Cliente", done: customerReady },
    { label: "Itens e adicionais", done: Boolean(selectedProduct) },
    { label: "Pagamento", done: hasPaymentReady },
    { label: "Revisão", done: false },
  ]
  const currentStepIndex = saleSteps.findIndex((step) => !step.done)
  const normalizedCurrentStep = currentStepIndex === -1 ? saleSteps.length - 1 : currentStepIndex
  const pendingChecklist = [
    { label: "Selecionar produto principal", done: Boolean(selectedProduct) },
    { label: isWalkInSale ? "Confirmar venda avulsa" : "Informar cliente válido", done: customerReady },
    { label: "Fechar pagamentos", done: hasPaymentReady },
    ...(selectedProduct?.type === "supplier" ? [{ label: "Informar custo do fornecedor", done: Boolean(supplierCostInput) }] : []),
    ...(!paymentValidation.ok ? [{ label: paymentValidation.message || "Revisar pagamentos", done: false }] : []),
    ...(mainVariantRequired ? [{ label: "Selecionar variação do produto principal", done: Boolean(selectedVariantId) }] : []),
    ...(additionalItemsMissingVariant.length > 0 ? [{ label: "Selecionar variação dos adicionais/brindes", done: false }] : []),
    ...(hasTradeIn ? [{ label: "Preencher dados mínimos do trade-in", done: hasValidTradeIn }] : []),
    ...(tradeInOverageNeedsDecision ? [{ label: "Decidir diferença do trade-in", done: canResolveTradeInOverage }] : []),
  ]

  const canFinishSale = Boolean(
    selectedProduct &&
    customerReady &&
    salePrice &&
    hasPaymentReady &&
    (selectedProduct?.type !== "supplier" || supplierCostInput) &&
    hasRequiredVariantsSelected &&
    hasValidTradeIn &&
    canResolveTradeInOverage
  )

  return (
    <div className="animate-fade-in space-y-5 pb-8">
      <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-[0_18px_50px_rgba(13,27,46,0.08)]">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-navy-900 text-white">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nova venda</p>
              <h1 className="font-display text-xl font-bold text-navy-900 font-syne">Caixa de venda</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isReservation ? "yellow" : "green"} dot>
              {isReservation ? "Reserva" : "Venda imediata"}
            </Badge>
            <Badge variant={isWalkInSale ? "yellow" : "blue"} dot>
              {isWalkInSale ? "Venda avulsa" : customerSummaryLabel}
            </Badge>
            {hasTradeIn && <Badge variant="blue" dot>Trade-in ativo</Badge>}
            {!paymentValidation.ok && customerAmountDue > 0 && <Badge variant="gray" dot>Pagamento pendente</Badge>}
          </div>
        </div>
        <SaleStepper steps={saleSteps} currentStep={normalizedCurrentStep} />
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-5">
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
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductAssetImage
                      brand={selectedProduct.brand}
                      category={selectedProduct.category}
                      model={selectedProduct.model || selectedProduct.name}
                      color={selectedProduct.color}
                      uploadedImageUrl={selectedProduct.productImage?.image_url || null}
                      uploadedThumbnailUrl={selectedProduct.productImage?.thumbnail_url || null}
                      size={68}
                      className="bg-white shadow-sm"
                    />
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
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-gray-400">{selectedProductCostLabel}</p>
                      <p className="text-sm font-semibold text-navy-900">{formatBRL(selectedProductEffectiveCost)}</p>
                      {selectedMainVariant?.unitCost != null ? (
                        <p className="text-[11px] font-medium text-gray-400">{selectedMainVariant.colorName}</p>
                      ) : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={clearSelectedProduct}>
                      Trocar
                    </Button>
                  </div>
                </div>

                {mainVariantRequired && (
                  <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Variação vendida</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedProductVariants.map((variant) => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => selectMainVariant(variant)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                            selectedVariantId === variant.id
                              ? "border-royal-500 bg-royal-50 text-royal-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-royal-300"
                          }`}
                        >
                          <span
                            className="h-3 w-3 rounded-full border border-gray-200"
                            style={{ backgroundColor: variant.colorHex || "#f3f4f6" }}
                          />
                          {variant.colorName} · {variant.quantity} disponível(is)
                        </button>
                      ))}
                    </div>
                    {!selectedVariantId && (
                      <p className="mt-2 text-xs font-semibold text-red-600">Escolha a variação antes de concluir a venda.</p>
                    )}
                    {selectedMainVariant && quantity > selectedMainVariant.quantity && (
                      <p className="mt-2 text-xs font-semibold text-red-600">
                        Só existe {selectedMainVariant.quantity} unidade disponível na variação {selectedMainVariant.colorName}.
                      </p>
                    )}
                  </div>
                )}

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
                {hasMainProductDiscount && (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Desconto aplicado</p>
                        <p className="mt-1 text-sm text-gray-500">
                          De <span className="line-through">{formatBRL(originalTotalPrice)}</span> para <span className="font-bold text-emerald-700">{formatBRL(totalBasePrice)}</span>
                        </p>
                      </div>
                      <p className="text-sm font-bold text-emerald-700">Economia de {formatBRL(mainProductDiscount)}</p>
                    </div>
                  </div>
                )}
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
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductAssetImage
                          brand={product.brand}
                          category={product.category}
                          model={product.model || product.name}
                          color={product.color}
                          uploadedImageUrl={product.productImage?.image_url || null}
                          uploadedThumbnailUrl={product.productImage?.thumbnail_url || null}
                          size={56}
                          className="bg-gray-50"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-navy-900">{product.name}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {[product.imei ? `IMEI ${product.imei}` : null, product.serial_number ? `Serial ${product.serial_number}` : null, product.battery ? `${product.battery}% bateria` : null].filter(Boolean).join(" · ") || "Sem identificação"}
                          </p>
                        </div>
                      </div>
                      <Badge variant={getSaleItemKind(product) === "accessory" ? "blue" : "gray"}>
                        {getSaleItemKind(product) === "accessory" ? "Acessório" : "Aparelho"}
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

          <SectionCard eyebrow="2. Cliente" title="Tipo de venda" description="Venda identificada mantém cadastro, CPF, portal e garantia como hoje. Venda avulsa registra a operação sem criar cliente fake.">
            <div className="grid gap-2 rounded-2xl border border-gray-100 bg-surface p-2 sm:grid-cols-2">
              {([
                { value: "identified", label: "Cliente identificado", detail: "Usa CPF/cadastro e mantém portal do cliente." },
                { value: "walk_in", label: "Venda avulsa", detail: "Sem CPF obrigatório e sem cadastro de cliente." },
              ] as Array<{ value: SaleCustomerType; label: string; detail: string }>).map((option) => {
                const active = saleCustomerType === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSaleType(option.value)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-royal-500 bg-white shadow-sm ring-2 ring-royal-500/10"
                        : "border-transparent bg-transparent hover:bg-white/70"
                    }`}
                  >
                    <span className="block text-sm font-bold text-navy-900">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{option.detail}</span>
                  </button>
                )
              })}
            </div>

            {saleCustomerType === "identified" ? (
              <>
                {existingCustomerFound && (
                  <div className="mt-3 rounded-xl border border-success-500/20 bg-success-100/20 p-3 text-sm font-medium text-green-800">
                    Cliente encontrado e preenchido automaticamente.
                  </div>
                )}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
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
              </>
            ) : (
              <div className="mt-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div>
                  <p className="text-sm font-bold text-amber-950">Cliente avulso</p>
                  <p className="mt-1 text-sm text-amber-900">
                    Use venda avulsa quando não houver necessidade de identificar o cliente. A venda será registrada oficialmente, com baixa no estoque e financeiro, mas sem cadastro de cliente.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Nome/apelido opcional"
                    placeholder="Cliente avulso"
                    value={walkInCustomer.label}
                    onChange={(event) => updateWalkInCustomer("label", event.target.value)}
                  />
                  <Input
                    label="Telefone opcional"
                    placeholder="Telefone, se quiser registrar"
                    value={walkInCustomer.phone}
                    onChange={(event) => updateWalkInCustomer("phone", event.target.value)}
                  />
                </div>
                <Textarea
                  label="Observação opcional"
                  placeholder="Ex.: venda rápida de acessório no balcão/rua"
                  value={walkInCustomer.notes}
                  onChange={(event) => updateWalkInCustomer("notes", event.target.value)}
                />
                {selectedProduct && getSaleItemKind(selectedProduct) === "device" && (
                  <div className="rounded-xl border border-amber-300 bg-white/70 p-3 text-sm text-amber-950">
                    Para aparelho, cliente identificado é recomendado por garantia, procedência e portal. Continue como venda avulsa apenas se essa for a decisão operacional.
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard eyebrow="3. Carrinho" title="Adicionais e brindes" description="Inclua quantos upsells, acessórios e brindes forem necessários na mesma venda.">
            <div id="additional-items-builder" className="rounded-2xl border border-gray-100 bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-900">Adicionar item à venda</p>
                  <p className="text-xs text-gray-500">Cada item pode sair como upsell pago ou como brinde.</p>
                </div>
                <ToggleSwitch
                  checked={hasAdditionalItem}
                  onChange={() => setHasAdditionalItem(!hasAdditionalItem)}
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
                        onClick={() => addAdditionalSaleItem(item)}
                        className="rounded-xl border border-gray-100 bg-white p-3 text-left transition-all hover:border-royal-500 hover:ring-2 hover:ring-royal-500/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductAssetImage
                              brand={item.brand}
                              category={item.category}
                              model={item.model || item.name}
                              color={item.color}
                              uploadedImageUrl={item.productImage?.image_url || null}
                              uploadedThumbnailUrl={item.productImage?.thumbnail_url || null}
                              size={48}
                              className="rounded-lg bg-gray-50"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-navy-900">{getAdditionalItemDisplayName(item.name)}</p>
                              <p className="truncate text-xs text-gray-500">
                                {item.imei || item.serial_number || "Item de estoque"} · {getAvailableQty(item)} disp.
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-navy-900">{formatBRL(item.suggested)}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {additionalSaleItems.length > 0 && (
                    <div className="space-y-3">
                      {additionalSaleItems.map((item) => {
                        const isFree = item.type === "free"
                        return (
                          <div key={item.itemId} className="rounded-2xl border border-royal-500/20 bg-white p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-bold text-navy-900">{getAdditionalItemDisplayName(item.name)}</p>
                                <p className="text-xs text-gray-500">
                                  Preço real {formatBRL(Number(item.suggested || item.salePrice || 0))} · Custo {formatBRL(item.cost)} · {item.availableQty} disponível(is)
                                </p>
                              </div>
                              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-danger-100 hover:text-danger-500" onClick={() => removeAdditionalSaleItem(item.itemId)} aria-label="Remover item">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_140px]">
                              <div className="flex rounded-xl bg-surface p-1">
                                {[
                                  { value: "upsell", label: "Upsell" },
                                  { value: "free", label: "Brinde" },
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => updateAdditionalSaleItem(item.itemId, { type: option.value as "upsell" | "free" })}
                                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                                      item.type === option.value ? "bg-navy-900 text-white" : "text-gray-500"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                              <Input
                                label={isFree ? "Preço real do brinde" : "Preço de venda"}
                                type="number"
                                disabled={isFree}
                                value={isFree ? Number(item.suggested || item.salePrice || 0) : item.salePrice}
                                onChange={(event) => updateAdditionalSaleItem(item.itemId, { salePrice: event.target.value })}
                              />
                              <Input
                                label="Qtd."
                                type="number"
                                min={1}
                                max={item.availableQty}
                                value={item.qty}
                                onChange={(event) => updateAdditionalSaleItem(item.itemId, { qty: clampQty(parseInt(event.target.value) || 1, item.availableQty) })}
                              />
                            </div>
                            {saleAvailableVariants(item).length > 0 && (
                              <div className="mt-3 rounded-xl border border-gray-100 bg-surface/70 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Variação vendida</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {saleAvailableVariants(item).map((variant) => (
                                    <button
                                      key={variant.id}
                                      type="button"
                                      onClick={() => selectAdditionalVariant(item.itemId, variant)}
                                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                                        item.selectedVariantId === variant.id
                                          ? "border-royal-500 bg-white text-royal-700"
                                          : "border-gray-200 bg-white/70 text-gray-600 hover:border-royal-300"
                                      }`}
                                    >
                                      <span
                                        className="h-3 w-3 rounded-full border border-gray-200"
                                        style={{ backgroundColor: variant.colorHex || "#f3f4f6" }}
                                      />
                                      {variant.colorName} · {variant.quantity} disp.
                                    </button>
                                  ))}
                                </div>
                                {!item.selectedVariantId && (
                                  <p className="mt-2 text-xs font-semibold text-red-600">Escolha a variação deste item.</p>
                                )}
                              </div>
                            )}
                            {isFree && (
                              <div className="mt-3 rounded-xl border border-success-500/20 bg-success-100/25 px-3 py-2 text-xs font-semibold text-green-800">
                                Este item tem valor real de {formatBRL(Number(item.suggested || item.salePrice || 0) * (item.qty || 1))}, mas sairá por R$ 0,00 como brinde.
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {additionalCandidates.length === 0 && additionalSaleItems.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                      Nenhum item disponível para adicionar.
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard eyebrow="4. Pagamentos" title="Pagamentos" description="Distribua como essa venda será paga.">
            {storeAmountDue > 0 && (
              <div className="mb-4 rounded-[20px] border border-warning-500/30 bg-warning-100/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-warning-500 shadow-sm">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy-900">Trade-in maior que a venda</p>
                    <p className="mt-1 text-sm text-gray-600">
                      O aparelho recebido ficou {formatBRL(storeAmountDue)} acima desta venda. Escolha a decisão operacional antes de concluir.
                    </p>
                    {tradeInOverageDecision === "change" && (
                      <p className="mt-2 text-xs font-semibold text-amber-800">
                        Ao concluir, o troco será registrado como conta a pagar pendente, sem conciliação e sem categoria do DRE.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <DecisionButton active={tradeInOverageDecision === "credit"} onClick={() => setTradeInOverageDecision("credit")}>
                    Gerar crédito
                  </DecisionButton>
                  <DecisionButton active={tradeInOverageDecision === "change"} onClick={() => setTradeInOverageDecision("change")}>
                    Registrar troco
                  </DecisionButton>
                  <DecisionButton active={tradeInOverageDecision === "block"} onClick={() => setTradeInOverageDecision("block")} tone="danger">
                    Bloquear conclusão
                  </DecisionButton>
                </div>
              </div>
            )}
            <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-5">
                <h3 className="text-sm font-bold text-navy-900">Resumo dos pagamentos</h3>
                <div className="mt-4 grid overflow-hidden rounded-2xl border border-gray-200 bg-white md:grid-cols-3">
                  <div className="border-b border-gray-100 p-4 text-center md:border-b-0 md:border-r">
                    <p className="text-xs font-medium text-gray-500">Total da venda</p>
                    <p className="mt-1 text-lg font-extrabold text-navy-900">{formatBRL(finalTotal)}</p>
                  </div>
                  <div className="border-b border-gray-100 p-4 text-center md:border-b-0 md:border-r">
                    <p className="text-xs font-medium text-gray-500">Distribuído</p>
                    <p className="mt-1 text-lg font-extrabold text-success-500">{formatBRL(distributedPaymentsTotal)}</p>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-xs font-medium text-gray-500">Restante</p>
                    <p className={`mt-1 text-lg font-extrabold ${paymentValidation.ok ? "text-success-500" : paymentDifference < 0 ? "text-danger-500" : "text-warning-500"}`}>
                      {formatBRL(Math.abs(paymentDifference))}
                    </p>
                    <p className={`mt-1 text-xs font-bold ${paymentValidation.ok ? "text-green-700" : paymentDifference < 0 ? "text-red-700" : "text-amber-700"}`}>
                      {paymentSummaryStatusLabel}
                    </p>
                  </div>
                </div>
              </div>

              {tradeInPaymentAmount > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-amber-900">Crédito / trade-in</span>
                    <span className="font-bold text-amber-900">{formatBRL(tradeInPaymentAmount)}</span>
                  </div>
                  <p className="mt-1 text-xs text-amber-800">Abatimento comercial da venda. Não gera entrada no extrato.</p>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-bold text-navy-900">Formas de pagamento</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseRemaining}
                    aria-expanded={remainingTargetPickerOpen}
                    aria-controls="remaining-payment-targets"
                  >
                    Usar restante
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={addSalePayment}>
                    <Plus className="h-4 w-4" /> Adicionar pagamento
                  </Button>
                </div>
              </div>

              {remainingTargetPickerOpen && remainingPaymentTargets.length > 1 && (
                <div id="remaining-payment-targets" className="mt-3 rounded-2xl border border-royal-100 bg-royal-50/50 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-navy-900">Onde usar o restante?</p>
                      <p className="mt-0.5 text-xs font-medium text-gray-500">
                        {paymentDifference > 0
                          ? `Restante atual: ${formatBRL(paymentDifference)}`
                          : paymentDifference < 0
                            ? `Excesso atual: ${formatBRL(Math.abs(paymentDifference))}`
                            : "Escolha uma forma para recalcular o fechamento."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemainingTargetPickerOpen(false)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-navy-900"
                      aria-label="Fechar escolha"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {remainingPaymentTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => fillRemainingForPayment(target.id)}
                        className="rounded-xl border border-white bg-white p-3 text-left shadow-sm transition hover:border-royal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-bold text-navy-900">{target.label}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">
                            Pagamento {target.index}
                          </span>
                        </span>
                        <span className="mt-2 block text-xs font-medium text-gray-500">
                          Atual {formatBRL(target.currentAmount)} · ficará {formatBRL(target.recalculatedAmount)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {salePayments.map((payment, index) => {
                  const method = normalizeSalePaymentMethod(payment.payment_method)
                  const isFinancial = isFinancialPayment(method)
                  const appliedAmount = parseCurrencyLike(payment.amount)
                  const methodInfo = method ? calculatePaymentPrice(appliedAmount, method, fees) : null
                  const feeAmount = methodInfo ? roundCurrency(Math.max(0, methodInfo.price - appliedAmount)) : 0
                  const isCreditRow = isCreditSalePayment(method)
                  const isDebitWithFee = method === "debit" && feeAmount > 0
                  const rowBadge = method
                    ? method === "trade_in_credit"
                      ? "Não financeiro"
                      : feeAmount > 0
                        ? `Taxa ${formatBRL(feeAmount)}`
                        : isFinancial
                          ? "Sem taxa"
                          : "Não gera caixa"
                    : "Escolha a forma"
                  const rowBadgeClass = !method
                    ? "bg-gray-100 text-gray-500"
                    : method === "trade_in_credit"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                      : feeAmount > 0
                        ? "bg-purple-50 text-purple-700 ring-1 ring-purple-100"
                        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  return (
                    <div key={payment.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Pagamento {index + 1}</p>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${rowBadgeClass}`}>
                          {rowBadge}
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(170px,1fr)_minmax(150px,.75fr)_minmax(180px,.9fr)_minmax(210px,1fr)_80px] 2xl:items-end">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Forma de pagamento</span>
                          <select
                            value={isCreditRow ? "credit_1x" : payment.payment_method}
                            onChange={(event) => updateSalePayment(payment.id, { payment_method: event.target.value })}
                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                          >
                            <option value="">Selecione</option>
                            {paymentMethodOptions.map((methodOption) => (
                              <option key={methodOption.value} value={methodOption.value}>
                                {paymentMethodOptionLabel(methodOption.value, methodOption.label)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Valor na venda</span>
                          <input
                            id={`payment-amount-${payment.id}`}
                            inputMode="numeric"
                            autoComplete="off"
                            value={payment.amount}
                            onChange={(event) => updateSalePayment(payment.id, { amount: formatCurrencyMaskInput(event.target.value) })}
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={(event) => updateSalePayment(payment.id, { amount: paymentAmountInput(parseCurrencyLike(event.target.value)) })}
                            placeholder="R$ 0,00"
                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-right text-sm font-semibold tabular-nums text-navy-900 outline-none transition placeholder:text-gray-300 focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Previsão</span>
                          <input
                            type="date"
                            value={payment.due_date}
                            onChange={(event) => updateSalePayment(payment.id, { due_date: event.target.value })}
                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Conta de destino</span>
                          <select
                            value={payment.financial_account_id}
                            onChange={(event) => updateSalePayment(payment.id, { financial_account_id: event.target.value })}
                            disabled={!isFinancial}
                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="">{isFinancial ? "Selecione a conta" : "Não gera caixa"}</option>
                            {financeAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.institution ? `${account.name} · ${account.institution}` : account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="flex items-end justify-end gap-1 md:col-span-2 2xl:col-span-1">
                          <Button type="button" variant="ghost" size="icon" title="Usar restante" onClick={() => fillRemainingForPayment(payment.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" title="Remover pagamento" onClick={() => removeSalePayment(payment.id)} disabled={salePayments.length <= 1}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {isCreditRow && (
                        <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50/30 p-4">
                          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(260px,1.4fr)_repeat(3,minmax(120px,.8fr))]">
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Parcelas</span>
                            <select
                              value={payment.payment_method || "credit_1x"}
                              onChange={(event) => updateSalePayment(payment.id, { payment_method: event.target.value })}
                              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                            >
                              {creditMethods.map((creditMethod) => {
                                const paymentInfo = calculatePaymentPrice(appliedAmount, creditMethod.value, fees)
                                return (
                                  <option key={creditMethod.value} value={creditMethod.value}>
                                    {paymentInfo.installments}x de {formatBRL(paymentInfo.installmentValue)} — total {formatBRL(paymentInfo.price)}
                                  </option>
                                )
                              })}
                            </select>
                          </label>
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Cliente paga</p>
                              <p className="mt-1 text-sm font-extrabold text-navy-900">{formatBRL(methodInfo?.price || 0)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Taxa</p>
                              <p className="mt-1 text-sm font-extrabold text-navy-900">{formatBRL(feeAmount)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Loja recebe</p>
                              <p className="mt-1 text-sm font-extrabold text-success-500">{formatBRL(appliedAmount)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {isDebitWithFee && (
                        <div className="mt-4 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-xs sm:grid-cols-3">
                          <span className="text-gray-500">Cliente paga <strong className="ml-1 text-navy-900">{formatBRL(methodInfo?.price || 0)}</strong></span>
                          <span className="text-gray-500">Taxa <strong className="ml-1 text-navy-900">{formatBRL(feeAmount)}</strong></span>
                          <span className="text-gray-500">Loja recebe <strong className="ml-1 text-success-500">{formatBRL(appliedAmount)}</strong></span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={addSalePayment}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-royal-300 bg-white text-sm font-bold text-royal-600 transition hover:border-royal-500 hover:bg-royal-50"
              >
                <Plus className="h-4 w-4" /> Adicionar novo pagamento
              </button>

              <div className={`mt-4 rounded-2xl border px-4 py-3 ${
                paymentValidationTone === "success"
                  ? "border-emerald-200 bg-emerald-50/70"
                  : paymentValidationTone === "danger"
                    ? "border-red-200 bg-red-50/70"
                    : "border-amber-200 bg-amber-50/70"
              }`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      paymentValidationTone === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : paymentValidationTone === "danger"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                      {paymentValidation.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-navy-900">Validação do pagamento</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {paymentValidation.ok
                          ? "Tudo certo! A soma dos pagamentos está igual ao total da venda."
                          : paymentValidation.message || (paymentDifference < 0
                            ? `Os pagamentos ultrapassam o total da venda em ${formatBRL(Math.abs(paymentDifference))}.`
                            : `Falta distribuir ${formatBRL(paymentDifference)} para fechar a venda.`)}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                    paymentValidationTone === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : paymentValidationTone === "danger"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {paymentSummaryStatusLabel}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button type="button" variant="success" size="sm" disabled={!paymentValidation.ok} onClick={() => document.getElementById("sale-review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  Continuar para revisão
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] border border-warning-500/25 bg-gradient-to-br from-warning-100/60 to-white p-4 shadow-sm">
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
                    onChange={(event) => {
                      setPaymentDueDate(event.target.value)
                      setSalePayments((previous) => previous.map((payment) => ({ ...payment, due_date: event.target.value })))
                    }}
                    icon={<CalendarDays className="h-4 w-4" />}
                    className="mt-3"
                  />
                )}
                {!isReservation && saleEconomics.storeCashReceives > 0 && (
                  <p className="mt-3 text-xs font-medium text-gray-500">
                    A conta de destino agora fica em cada linha de pagamento.
                  </p>
                )}
              </div>

              <div className="rounded-[20px] border border-royal-500/20 bg-gradient-to-br from-royal-100/55 to-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Receber aparelho na troca (trade-in)</p>
                    <p className="text-xs text-gray-500">
                      Em reserva, o aparelho fica pendente e não entra como estoque livre.
                    </p>
                  </div>
                  <ToggleSwitch checked={hasTradeIn} onChange={() => setHasTradeIn(!hasTradeIn)} />
                </div>
              </div>
            </div>

            {hasTradeIn && (
              <div className="mt-4 rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-100/60 text-success-500">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-royal-600">Aparelho recebido (trade-in)</p>
                      <h3 className="text-base font-bold text-navy-900">Aparelho recebido (trade-in)</h3>
                      <p className="text-xs text-gray-500">Use a busca para puxar o modelo da tabela de avaliação e comparar o valor abatido.</p>
                    </div>
                  </div>
                  <Badge variant={hasValidTradeIn ? "green" : tradeInReferenceStatus.badge} dot>
                    {hasValidTradeIn ? "Valor abatido" : tradeInReferenceStatus.label}
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
                    className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
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
                  <select
                    className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 outline-none focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
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
                  <Input placeholder="IMEI / Serial" value={tradeIn.imei} onChange={(event) => handleTradeInChange({ imei: event.target.value.replace(/\D/g, "").slice(0, 15) })} />
                  <Input
                    placeholder="Valor abatido"
                    inputMode="decimal"
                    value={tradeInValueInput || formatCurrencyInputValue(tradeIn.value)}
                    onChange={(event) => {
                      setTradeInValueInput(event.target.value)
                      const parsed = parseCurrencyInput(event.target.value)
                      handleTradeInChange({ value: parsed > 0 ? parsed.toString() : "" })
                    }}
                    onBlur={() => setTradeInValueInput(formatCurrencyInputValue(tradeIn.value))}
                  />
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
                              ? "border-success-500 bg-success-100/60 text-green-800"
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

          <SectionCard eyebrow="5. Garantia e Observações" title="Garantia e Observações" description={warrantyIssueText}>
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
              <div className="rounded-[20px] border border-gray-100 bg-surface p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-100 text-royal-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy-900">Garantia</p>
                    <p className="text-xs text-gray-500">{warrantyIssueText}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["1", "3", "6", "12"].map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setWarrantyMonths(months)}
                      className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all ${
                        warrantyMonths === months
                          ? "border-royal-500 bg-royal-100/70 text-royal-600 shadow-sm"
                          : "border-gray-200 bg-white text-navy-900 hover:border-royal-400"
                      }`}
                    >
                      {months} {months === "1" ? "mês" : "meses"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <label className="mb-2 block text-sm font-medium text-navy-900">Origem da venda</label>
                  <select
                    value={saleOrigin}
                    onChange={(event) => {
                      setSaleOrigin(event.target.value)
                      if (event.target.value !== "trafego_pago") setMarketingCampaignId("")
                    }}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                  >
                    {SALE_ORIGINS.map((origin) => (
                      <option key={origin.value} value={origin.value}>
                        {origin.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-1 text-sm font-medium text-navy-900">
                    Campanha
                    <Info className="h-3.5 w-3.5 text-gray-400" />
                  </label>
                  <select
                    value={marketingCampaignId}
                    onChange={(event) => setMarketingCampaignId(event.target.value)}
                    disabled={saleOrigin !== "trafego_pago"}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Não se aplica</option>
                    {marketingCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} · {campaign.channel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <Textarea
              label="Observações da venda"
              placeholder="Condição negociada, combinado com cliente, acessórios inclusos..."
              value={saleNotes}
              onChange={(event) => setSaleNotes(event.target.value)}
              className="mt-4 min-h-[150px]"
            />

            <div className="mt-4 rounded-[20px] border border-gray-100 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-navy-900">Tipo de embalagem</label>
                  <select
                    value={packagingType}
                    onChange={(event) => {
                      setPackagingType(event.target.value)
                      if (event.target.value !== "other") setPackagingNotes("")
                    }}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/10"
                  >
                    {PACKAGING_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {packagingType === "other" ? (
                  <Textarea
                    label="Observação da embalagem"
                    placeholder="Ex: entregue em caixa personalizada da loja..."
                    value={packagingNotes}
                    onChange={(event) => setPackagingNotes(event.target.value)}
                  />
                ) : (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Entrega</p>
                    <p className="mt-1 text-sm text-gray-500">Essa informação aparece no pós-venda e na Compra Verificada do cliente.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[20px] border border-gray-100 bg-white">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-navy-900">Resumo dos itens da venda</h3>
                    <Badge variant="green">{saleItems.length} itens</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Produto principal, upsells, acessórios e brindes vinculados à venda.</p>
                </div>
                <button
                  type="button"
                  onClick={openAdditionalBuilder}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-royal-500 px-3 text-xs font-bold text-royal-600 transition hover:bg-royal-100/50"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar item à venda
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[880px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3 text-center">Qtd.</th>
                      <th className="px-3 py-3 text-right">Preço unit.</th>
                      <th className="px-3 py-3 text-right">Total</th>
                      <th className="px-3 py-3 text-right">Custo</th>
                      <th className="px-3 py-3 text-right">Margem</th>
                      <th className="px-3 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {saleItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                          Selecione um produto para montar o resumo da venda.
                        </td>
                      </tr>
                    ) : (
                      saleItems.map((item) => (
                        <tr key={item.id} className="transition hover:bg-royal-100/20">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProductAssetImage
                                brand={item.brand}
                                category={item.category}
                                model={item.model || item.name}
                                color={item.color}
                                uploadedImageUrl={item.productImage?.image_url || null}
                                uploadedThumbnailUrl={item.productImage?.thumbnail_url || null}
                                size={48}
                                className="rounded-xl bg-gray-50"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-bold text-navy-900">{item.name}</p>
                                <p className="truncate text-xs text-gray-500">{item.identity}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3"><ItemTypeBadge type={item.type} /></td>
                          <td className="px-3 py-3 text-center font-semibold text-navy-900">{item.quantity}</td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-semibold text-navy-900">{formatBRL(item.unitPrice)}</p>
                            {item.type === "Brinde" && <p className="text-xs font-medium text-success-500">Sai por R$ 0,00</p>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-bold text-navy-900">{formatBRL(item.total)}</p>
                            {item.type === "Brinde" && <p className="text-xs text-gray-500">Valor real {formatBRL(item.realTotal)}</p>}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-600">{formatBRL(item.cost)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-navy-900">{item.marginPct === null ? "—" : `${item.marginPct.toFixed(1)}%`}</td>
                          <td className="px-3 py-3 text-right">
                            {item.removable ? (
                              <button type="button" onClick={() => removeAdditionalSaleItem(item.id)} className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-xs font-bold text-danger-500 hover:bg-danger-100">
                                Remover
                              </button>
                            ) : (
                              <button type="button" onClick={clearSelectedProduct} className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-xs font-bold text-gray-500 hover:bg-gray-50 hover:text-navy-900">
                                Trocar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>
        </div>

        <aside id="sale-review-panel" className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-card shadow-[0_22px_60px_rgba(13,27,46,0.10)]">
            <div className="bg-navy-950 px-5 py-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide">RESUMO DA VENDA</h2>
                <Badge variant={hasTradeIn ? "blue" : isReservation ? "yellow" : "green"} className={hasTradeIn ? "bg-emerald-500/15 text-emerald-100" : "bg-white/10 text-white"}>
                  {hasTradeIn ? "Trade-in ativo" : isReservation ? "Reserva" : "Venda imediata"}
                </Badge>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              <section className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy-900">Status operacional</p>
                    <Info className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <Badge variant={isReservation ? "yellow" : "green"} dot>
                    {operationalStatus}
                  </Badge>
                </div>
              </section>

              <SummarySection title="Itens da venda">
                <SummaryLine icon={Package} label="Produto principal" value={formatBRL(totalBasePrice)} />
                <SummaryLine icon={Plus} label={`Adicionais (${paidAdditionalCount})`} value={formatBRL(upsellTotal)} />
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-gray-600">
                    <Gift className="h-4 w-4 shrink-0 text-navy-700" />
                    <span className="truncate">Brindes ({giftCount})</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold text-navy-900">{formatBRL(0)}</span>
                    {giftRealTotal > 0 && <span className="block text-xs font-medium text-gray-500">valor real {formatBRL(giftRealTotal)}</span>}
                  </span>
                </div>
                <SummaryLine label="Subtotal dos itens" value={formatBRL(finalTotal)} strong />
              </SummarySection>

              {hasTradeIn && (
                <SummarySection title="Trade-in (abatido)">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-700">
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy-900">{tradeInDeviceName}</p>
                        <p className="truncate text-xs text-gray-500">{tradeIn.imei ? `IMEI ${tradeIn.imei}` : "IMEI/serial não informado"}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-danger-500">- {formatBRL(tradeInValue)}</span>
                  </div>
                  <SummaryLine label="Valor abatido" value={`- ${formatBRL(tradeInValue)}`} strong valueClassName="text-navy-900" />
                  {tradeInOverageNeedsDecision && (
                    <div className="rounded-xl border border-warning-500/20 bg-warning-100/40 p-3 text-xs text-amber-900">
                      Diferença de {formatBRL(storeAmountDue)}: {tradeInOverageDecision === "credit" ? "crédito operacional" : tradeInOverageDecision === "change" ? "troco ao cliente" : "pendente de decisão"}.
                    </div>
                  )}
                </SummarySection>
              )}

              <SummarySection title="Valores da venda">
                <SummaryLine label="Valor da venda cheio" value={formatBRL(grossItemsTotal)} />
                <SummaryLine label="Descontos" value={formatBRL(discountTotal)} />
                {hasTradeIn && <SummaryLine label="Trade-in abatido" value={`- ${formatBRL(tradeInValue)}`} valueClassName="text-danger-500" />}
                <div className="rounded-2xl bg-success-100/45 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-green-800">Cliente paga (restante)</span>
                    <span className="text-lg font-extrabold text-success-500">{formatBRL(saleEconomics.customerCashPays)}</span>
                  </div>
                </div>
                <SummaryLine label="Loja recebe em caixa" value={formatBRL(saleEconomics.storeCashReceives)} strong />
              </SummarySection>

              <SummarySection title="Forma de pagamento">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500">
                    {paymentSummaryRows.length === 1 ? "1 forma" : `${paymentSummaryRows.length} formas`}
                  </p>
                  <Badge variant={paymentValidation.ok ? "green" : "yellow"} dot>
                    {paymentValidation.ok ? "Fechado" : "Pendente"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {paymentSummaryRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-3 text-sm text-gray-400">
                      Nenhuma forma de pagamento adicionada.
                    </div>
                  ) : (
                    paymentSummaryRows.map((payment) => (
                      <div key={payment.key} className="rounded-2xl border border-gray-100 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${payment.isTradeInCredit ? "bg-amber-100 text-amber-700" : "bg-royal-100 text-royal-600"}`}>
                              {payment.isTradeInCredit ? <Smartphone className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-navy-900">{payment.label}</p>
                              <p className="text-xs text-gray-500">{payment.detail}</p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-extrabold text-navy-900">{formatBRL(payment.amount)}</p>
                            <p className="text-xs text-gray-500">{payment.dueLabel}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SummarySection>

              <section className="space-y-3 px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-success-100/35 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{profitTitle}</p>
                    <p className={`mt-1 text-lg font-extrabold ${saleEconomics.grossProfit >= 0 ? "text-success-500" : "text-danger-500"}`}>{formatBRL(saleEconomics.grossProfit)}</p>
                    <p className="text-xs text-gray-500">{profitCaption}</p>
                  </div>
                  <div className="rounded-2xl bg-royal-100/35 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Garantia</p>
                    <p className="mt-1 text-lg font-extrabold text-navy-900">{warrantyMonths} meses</p>
                    <p className="text-xs text-gray-500">{isReservation ? "Será emitida após receber" : "Será emitida ao concluir"}</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-3">
                  <ImpactCard icon={Box} label="Estoque" value={isReservation ? "Será bloqueado" : "Será baixado"} />
                  <ImpactCard icon={ReceiptText} label="Financeiro" value={isReservation ? "Conta a receber" : hasCreditPayment ? "Recebimento previsto" : "Recebimento à vista"} />
                  <ImpactCard icon={ShieldCheck} label="Garantia" value={isReservation ? "Depois do recebimento" : "Ao concluir"} />
                </div>

                <Button fullWidth size="lg" variant="success" onClick={handleConfirm} disabled={!canFinishSale} isLoading={isSubmitting} className="h-12 rounded-xl font-bold shadow-lg shadow-success-500/20">
                  <Check className="h-4 w-4" />
                  {isReservation ? "Reservar venda" : hasTradeIn ? "Concluir com trade-in" : "Concluir venda"}
                </Button>
                {!canFinishSale && <PendingChecklist items={pendingChecklist} />}
              </section>
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
