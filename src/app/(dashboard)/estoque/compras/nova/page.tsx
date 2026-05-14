"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Calculator, ChevronDown, ChevronUp, Copy, ImageIcon, Info, Package, Plus, Save, Trash2, Truck, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ColorSwatchPicker } from "@/components/products/color-swatch-picker"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { GRADES } from "@/lib/constants"
import { formatBRL, getComputedInventoryStatus, mapLifecycleToLegacyCompatibleStatus } from "@/lib/helpers"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"
import {
  accessoryUsuallyHasSerial,
  buildLegacyCatalogConfig,
  createOrLinkModelColor,
  createOrReuseCatalogColor,
  DEFAULT_COLOR_SUGGESTIONS,
  getCatalogCategory,
  getCategoryOptions,
  isAccessoryProduct,
  loadCatalogConfig,
  mergeColorOptions,
  normalizeCatalogName,
  type CatalogColor,
  type CatalogConfig,
} from "@/lib/catalog-config"
import { cn } from "@/lib/utils"

type ProductMode = "catalog" | "manual"
type BatchArrivalMode = "with_me" | "in_transit"
type BatchReleaseMode = "available" | "pending_review"

type SupplierOption = {
  id: string
  name: string
  city: string | null
}

type VariantFormInput = {
  id: string
  colorName: string
  colorHex: string
  quantity: string
  unitCost: string
  suggestedPrice: string
}

type PurchaseLine = {
  id: string
  mode: ProductMode
  category: string
  modelIdx: number
  manualName: string
  commercialName: string
  storage: string
  color: string
  colorHex: string
  grade: string
  quantity: string
  unitCost: string
  marginPct: string
  suggestedPrice: string
  batteryHealth: string
  imeis: string
  serials: string
  accessoryHasSerial: boolean
  useVariantPricing: boolean
  notes: string
  imageFile: File | null
  imagePreviewUrl: string
  variants: VariantFormInput[]
}

const gradeOptions = GRADES.map((grade) => ({ label: grade.label, value: grade.value }))
const paymentOptions = [
  { label: "Pix", value: "pix" },
  { label: "Dinheiro", value: "cash" },
  { label: "Debito", value: "debit" },
  { label: "Cartao de credito", value: "credit_card" },
  { label: "Boleto", value: "boleto" },
  { label: "Transferencia", value: "transfer" },
]

const sourceTypeOptions = [
  { label: "Fornecedor externo", value: "external_supplier" },
  { label: "Fornecedor local", value: "local_supplier" },
  { label: "Outro", value: "other" },
]

const accessorySuggestions = [
  "Capa para iPad",
  "Pelicula para iPad",
  "Apple Pencil",
  "Cabo USB-C",
  "Fonte 20W",
  "Capa para iPhone",
  "Fone de ouvido",
]

function newLine(overrides: Partial<PurchaseLine> = {}): PurchaseLine {
  return {
    id: crypto.randomUUID(),
    mode: "catalog",
    category: "iphone",
    modelIdx: 0,
    manualName: "",
    commercialName: "",
    storage: "",
    color: "",
    colorHex: "",
    grade: "Lacrado",
    quantity: "1",
    unitCost: "",
    marginPct: "15",
    suggestedPrice: "",
    batteryHealth: "",
    imeis: "",
    serials: "",
    accessoryHasSerial: false,
    useVariantPricing: false,
    notes: "",
    imageFile: null,
    imagePreviewUrl: "",
    variants: [],
    ...overrides,
  }
}

function lineEffectiveQuantity(line: PurchaseLine): number {
  if (!line.accessoryHasSerial && line.variants.length > 0) {
    const sum = line.variants.reduce((s, v) => s + Math.max(0, parseInt(v.quantity) || 0), 0)
    return Math.max(1, sum)
  }
  return Math.max(1, Math.floor(toNumber(line.quantity)))
}

function variantPricingStats(line: PurchaseLine) {
  const totalQty = line.variants.reduce((s, v) => s + Math.max(0, parseInt(v.quantity) || 0), 0)
  const totalCost = line.variants.reduce((s, v) => s + Math.max(0, parseInt(v.quantity) || 0) * toNumber(v.unitCost), 0)
  const totalSuggested = line.variants.reduce((s, v) => s + Math.max(0, parseInt(v.quantity) || 0) * toNumber(v.suggestedPrice), 0)
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0
  const avgSuggested = totalQty > 0 ? totalSuggested / totalQty : 0
  return { totalQty, totalCost, totalSuggested, avgCost, avgSuggested }
}

function lineEffectiveUnitCost(line: PurchaseLine): number {
  const useVariants = line.useVariantPricing && line.variants.length > 0
  if (!useVariants) return toNumber(line.unitCost)
  const { totalQty, totalCost } = variantPricingStats(line)
  if (totalQty === 0 || totalCost === 0) return toNumber(line.unitCost)
  return totalCost / totalQty
}

function lineEffectiveSuggestedPrice(line: PurchaseLine, landedUnitCost: number): number {
  const useVariants = line.useVariantPricing && line.variants.length > 0
  if (!useVariants) return toNumber(line.suggestedPrice) || Math.ceil(landedUnitCost * (1 + toNumber(line.marginPct) / 100))
  const { totalQty, totalSuggested } = variantPricingStats(line)
  if (totalQty === 0 || totalSuggested === 0) return toNumber(line.suggestedPrice) || Math.ceil(landedUnitCost * (1 + toNumber(line.marginPct) / 100))
  return totalSuggested / totalQty
}

function toNumber(value: string | number | null | undefined) {
  return parseBRLInput(value)
}

function parseBRLInput(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const cleaned = String(value)
    .replace(/[R$\s]/g, "")
    .replace(/[^\d,.-]/g, "")
    .trim()

  if (!cleaned) return 0

  const sign = cleaned.startsWith("-") ? -1 : 1
  const unsigned = cleaned.replace(/-/g, "")
  const lastComma = unsigned.lastIndexOf(",")
  const lastDot = unsigned.lastIndexOf(".")
  const decimalSeparator = lastComma > lastDot ? "," : lastDot > -1 ? "." : lastComma > -1 ? "," : null

  let normalized = unsigned
  if (decimalSeparator) {
    const decimalIndex = decimalSeparator === "," ? lastComma : lastDot
    const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, "")
    const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, "")
    normalized = decimalPart.length > 0 && decimalPart.length <= 2
      ? `${integerPart || "0"}.${decimalPart}`
      : unsigned.replace(/[.,]/g, "")
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? sign * parsed : 0
}

function formatBRLInput(value: string | number | null | undefined) {
  const amount = parseBRLInput(value)
  if (!amount) return ""
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeSupplierName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

function splitValues(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function selectedModelFor(line: PurchaseLine, catalogConfig: CatalogConfig) {
  return getCatalogCategory(catalogConfig, line.category)?.models?.[line.modelIdx] as any
}

function catalogGeneratedName(line: PurchaseLine, catalogConfig: CatalogConfig) {
  const model = selectedModelFor(line, catalogConfig)
  return [model?.name, isLineAccessory(line, catalogConfig) ? null : line.storage, line.color].filter(Boolean).join(" ").trim() || "Produto do catálogo"
}

function lineProductName(line: PurchaseLine, catalogConfig: CatalogConfig) {
  if (line.mode === "manual") return line.manualName.trim() || "Produto manual"
  if (line.commercialName.trim() && isLineAccessory(line, catalogConfig)) return line.commercialName.trim()
  return catalogGeneratedName(line, catalogConfig)
}

function isLineAccessory(line: PurchaseLine, catalogConfig: CatalogConfig) {
  const category = getCatalogCategory(catalogConfig, line.category)
  const model = selectedModelFor(line, catalogConfig)
  return isAccessoryProduct({
    mode: line.mode,
    category: line.category,
    categoryLabel: category?.label,
    name: line.mode === "manual" ? line.manualName : model?.name,
    productType: category?.productType,
  })
}

function lineProductType(line: PurchaseLine, catalogConfig: CatalogConfig) {
  const category = getCatalogCategory(catalogConfig, line.category)
  if (line.mode === "manual") return "accessory"
  if (category?.productType) return category.productType
  return isLineAccessory(line, catalogConfig) ? "accessory" : "device"
}

function needsChecklistLater(line: PurchaseLine, catalogConfig: CatalogConfig) {
  if (isLineAccessory(line, catalogConfig)) return false
  return line.mode === "catalog" && ["iphone", "ipad"].includes(line.category) && line.grade !== "Lacrado"
}

function shouldCreateOneInventoryRowPerUnit(line: PurchaseLine, imeis: string[], serials: string[], catalogConfig: CatalogConfig) {
  if (isLineAccessory(line, catalogConfig) && !line.accessoryHasSerial) return false
  if (imeis.length > 0 || serials.length > 0) return true
  return line.mode === "catalog" && ["iphone", "ipad", "applewatch", "airpods", "macbook"].includes(line.category)
}

async function uploadProductImage(productId: string, file: File) {
  const formData = new FormData()
  formData.set("productId", productId)
  formData.set("file", file)

  const response = await fetch("/api/product-images", {
    method: "POST",
    body: formData,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Erro ao enviar imagem")
  }
}

export default function NewInventoryPurchasePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [supplierQuery, setSupplierQuery] = useState("")
  const [accounts, setAccounts] = useState<Array<{ label: string; value: string }>>([])
  const [catalogConfig, setCatalogConfig] = useState<CatalogConfig>(() => buildLegacyCatalogConfig())
  const [purchase, setPurchase] = useState({
    supplier_id: "",
    supplier_name: "",
    purchase_date: new Date().toISOString().split("T")[0],
    arrival_mode: "with_me" as BatchArrivalMode,
    release_mode: "available" as BatchReleaseMode,
    source_type: "external_supplier",
    expected_arrival_date: "",
    payment_method: "pix",
    account_id: "",
    due_date: new Date().toISOString().split("T")[0],
    freight_amount: "",
    other_costs_amount: "",
    notes: "",
  })
  const [lines, setLines] = useState<PurchaseLine[]>([newLine()])
  const [collapsedLineIds, setCollapsedLineIds] = useState<Set<string>>(() => new Set())
  const categoryOptions = useMemo(() => getCategoryOptions(catalogConfig), [catalogConfig])
  const imagePreviewUrlsRef = useRef(new Set<string>())

  useEffect(() => {
    return () => {
      imagePreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      imagePreviewUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    async function loadOptions() {
      const [supplierResponse, { data: accountData }] = await Promise.all([
        fetch("/api/suppliers/traceability").then((response) => response.json()).catch(() => null),
        (supabase.from("finance_accounts") as any).select("id, name, bank_name, is_active").order("name", { ascending: true }),
      ])

      const supplierData = supplierResponse?.data?.suppliers
        ?.map((item: any) => item.supplier)
        .filter(Boolean) || []
      setSuppliers(supplierData.map((supplier: any) => ({
        id: supplier.id,
        name: supplier.name,
        city: supplier.city || null,
      })))
      setAccounts((accountData || []).filter((account: any) => account.is_active !== false).map((account: any) => ({
        label: `${account.name}${account.bank_name ? ` - ${account.bank_name}` : ""}`,
        value: account.id,
      })))
    }
    loadOptions()
    loadCatalogConfig({ refresh: true }).then(setCatalogConfig)
  }, [])

  const totals = useMemo(() => {
    const totalQty = lines.reduce((sum, line) => sum + lineEffectiveQuantity(line), 0)
    const productsAmount = lines.reduce((sum, line) => sum + lineEffectiveUnitCost(line) * lineEffectiveQuantity(line), 0)
    const freight = toNumber(purchase.freight_amount)
    const other = toNumber(purchase.other_costs_amount)
    const freightPerUnit = totalQty > 0 ? freight / totalQty : 0
    const otherPerUnit = totalQty > 0 ? other / totalQty : 0
    return {
      totalQty,
      productsAmount: roundMoney(productsAmount),
      freight: roundMoney(freight),
      other: roundMoney(other),
      total: roundMoney(productsAmount + freight + other),
      freightPerUnit: roundMoney(freightPerUnit),
      otherPerUnit: roundMoney(otherPerUnit),
    }
  }, [lines, purchase.freight_amount, purchase.other_costs_amount])

  const selectedSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === purchase.supplier_id) || null, [purchase.supplier_id, suppliers])
  const filteredSuppliers = useMemo(() => {
    const query = normalizeSupplierName(supplierQuery || purchase.supplier_name)
    if (!query) return suppliers.slice(0, 6)
    return suppliers.filter((supplier) => normalizeSupplierName(`${supplier.name} ${supplier.city || ""}`).includes(query)).slice(0, 6)
  }, [purchase.supplier_name, supplierQuery, suppliers])
  const supplierExactMatch = useMemo(() => {
    const query = normalizeSupplierName(supplierQuery || purchase.supplier_name)
    return query ? suppliers.find((supplier) => normalizeSupplierName(supplier.name) === query) || null : null
  }, [purchase.supplier_name, supplierQuery, suppliers])

  const canSave = Boolean(purchase.supplier_id || purchase.supplier_name.trim()) && totals.totalQty > 0 && totals.productsAmount > 0 && (purchase.arrival_mode === "with_me" || Boolean(purchase.expected_arrival_date)) && lines.every((line) => {
    if (lineEffectiveUnitCost(line) <= 0) return false
    if (line.mode === "manual") return line.manualName.trim().length > 0
    const model = selectedModelFor(line, catalogConfig)
    const accessoryLine = isLineAccessory(line, catalogConfig)
    const hasVariants = accessoryLine && !line.accessoryHasSerial && line.variants.length > 0
    if (hasVariants) {
      return Boolean(model) && line.variants.every((v) => v.colorName.trim() && parseInt(v.quantity) > 0)
    }
    const modelColorOptions = (model?.colors || []) as CatalogColor[]
    const colorOk = Boolean(line.color) || (accessoryLine && modelColorOptions.length === 0)
    return Boolean(model && (accessoryLine || line.storage || !(model.storage || model.sizes)) && colorOk)
  })

  const updatePurchase = (field: string, value: string) => {
    setPurchase((prev) => ({ ...prev, [field]: value }))
  }

  const selectSupplier = (supplier: SupplierOption) => {
    setPurchase((prev) => ({ ...prev, supplier_id: supplier.id, supplier_name: supplier.name }))
    setSupplierQuery(supplier.name)
  }

  const updateSupplierQuery = (value: string) => {
    setSupplierQuery(value)
    setPurchase((prev) => ({ ...prev, supplier_id: "", supplier_name: value }))
  }

  const updateLine = (id: string, field: keyof PurchaseLine, value: string | number) => {
    setLines((prev) => prev.map((line) => {
      if (line.id !== id) return line
      const next = { ...line, [field]: String(value) }
      if (field === "category") {
        next.modelIdx = 0
        next.storage = ""
        next.color = ""
        next.colorHex = ""
        next.imeis = ""
        next.serials = ""
        next.batteryHealth = ""
        next.accessoryHasSerial = false
      }
      if (field === "modelIdx") {
        next.storage = ""
        next.color = ""
        next.colorHex = ""
      }
      if (field === "mode" && value === "manual" && !next.manualName) {
        next.category = "accessories"
        next.manualName = accessorySuggestions[0]
        next.grade = "Lacrado"
        next.accessoryHasSerial = accessoryUsuallyHasSerial(accessorySuggestions[0])
      }
      if (field === "suggestedPrice") {
        const landedCost = toNumber(next.unitCost) + totals.freightPerUnit + totals.otherPerUnit
        const price = toNumber(String(value))
        if (landedCost > 0 && price > 0) next.marginPct = Math.max(0, (price / landedCost - 1) * 100).toFixed(2)
      }
      return next
    }))
  }

  const updateLineImage = (id: string, file: File | null) => {
    const extension = file?.name.toLowerCase().split(".").pop() || ""
    const acceptedExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"])
    const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"])

    if (file && ((file.type && !acceptedTypes.has(file.type)) || !acceptedExtensions.has(extension))) {
      toast({
        title: "Arquivo inválido",
        description: "Envie uma imagem em JPG, PNG, WebP ou HEIC.",
        type: "error",
      })
      return
    }

    if (file && file.size > 10 * 1024 * 1024) {
      toast({
        title: "Imagem muito grande",
        description: "Use uma imagem com até 10MB.",
        type: "error",
      })
      return
    }

    setLines((prev) => prev.map((line) => {
      if (line.id !== id) return line
      if (line.imagePreviewUrl) {
        URL.revokeObjectURL(line.imagePreviewUrl)
        imagePreviewUrlsRef.current.delete(line.imagePreviewUrl)
      }
      const nextPreviewUrl = file ? URL.createObjectURL(file) : ""
      if (nextPreviewUrl) imagePreviewUrlsRef.current.add(nextPreviewUrl)
      return {
        ...line,
        imageFile: file,
        imagePreviewUrl: nextPreviewUrl,
      }
    }))
  }

  const addLine = (mode: ProductMode = "catalog") => {
    setLines((prev) => [...prev, newLine(mode === "manual" ? { mode, category: "accessories", manualName: accessorySuggestions[0], accessoryHasSerial: accessoryUsuallyHasSerial(accessorySuggestions[0]) } : {})])
  }

  const duplicateLine = (line: PurchaseLine) => {
    setLines((prev) => [...prev, { ...line, id: crypto.randomUUID(), imeis: "", serials: "", imageFile: null, imagePreviewUrl: "" }])
  }

  const removeLine = (id: string) => {
    setLines((prev) => {
      if (prev.length === 1) return prev
      const removed = prev.find((line) => line.id === id)
      if (removed?.imagePreviewUrl) {
        URL.revokeObjectURL(removed.imagePreviewUrl)
        imagePreviewUrlsRef.current.delete(removed.imagePreviewUrl)
      }
      return prev.filter((line) => line.id !== id)
    })
  }

  const toggleLineCollapsed = (id: string) => {
    setCollapsedLineIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const manualColorOptionsFor = (line: PurchaseLine) => {
    const category = getCatalogCategory(catalogConfig, line.category)
    const configured = mergeColorOptions(category?.colors)
    return configured.length ? configured : DEFAULT_COLOR_SUGGESTIONS.slice(0, 8)
  }

  const createColorForLine = async (line: PurchaseLine, color: CatalogColor) => {
    const category = getCatalogCategory(catalogConfig, line.category)
    const model = selectedModelFor(line, catalogConfig)
    const modelColors = (model?.colors || []) as CatalogColor[]
    const existing = modelColors.find((item) => normalizeCatalogName(item.name) === normalizeCatalogName(color.name))
    if (existing) {
      setLines((prev) => prev.map((item) => item.id === line.id ? { ...item, color: existing.name, colorHex: existing.hex } : item))
      return
    }
    const linkedColor = await createOrLinkModelColor({
      categoryId: category?.id,
      subcategoryId: model?.subcategoryId,
      color,
      existingColors: modelColors,
    })
    setCatalogConfig((config) => ({
      categories: config.categories.map((item) => item.value === line.category ? {
        ...item,
        models: item.models.map((model, index) => index === line.modelIdx ? {
          ...model,
          colors: [...(model.colors || []), linkedColor],
        } : model),
      } : item),
    }))
    setLines((prev) => prev.map((item) => item.id === line.id ? { ...item, color: linkedColor.name, colorHex: linkedColor.hex } : item))
  }

  const createManualColorForLine = async (line: PurchaseLine, color: CatalogColor) => {
    const category = getCatalogCategory(catalogConfig, line.category)
    const existingColors = manualColorOptionsFor(line)
    const existing = existingColors.find((item) => normalizeCatalogName(item.name) === normalizeCatalogName(color.name))
    if (existing?.id) {
      setLines((prev) => prev.map((item) => item.id === line.id ? { ...item, color: existing.name, colorHex: existing.hex } : item))
      return
    }

    const resolvedColor = await createOrReuseCatalogColor({
      categoryId: category?.id,
      color,
      existingColors,
    })

    setCatalogConfig((config) => ({
      categories: config.categories.map((item) => item.value === line.category ? {
        ...item,
        colors: mergeColorOptions(item.colors, [resolvedColor]),
      } : item),
    }))
    setLines((prev) => prev.map((item) => item.id === line.id ? { ...item, color: resolvedColor.name, colorHex: resolvedColor.hex } : item))
  }

  const findOrCreateCatalog = async (line: PurchaseLine) => {
    if (line.mode === "manual") return null
    const model = selectedModelFor(line, catalogConfig)
    if (!model?.name) return null
    const storage = isLineAccessory(line, catalogConfig) ? null : line.storage || null
    const color = line.color || null

    const { data: existing } = await (supabase.from("product_catalog") as any)
      .select("id, storage, color")
      .eq("category", line.category)
      .eq("model", model.name)
      .limit(50)

    const match = (existing || []).find((item: any) => (item.storage || "") === (storage || "") && (item.color || "") === (color || ""))
    if (match?.id) return match.id

    const { data: created, error } = await (supabase.from("product_catalog") as any)
      .insert({
        category: line.category,
        brand: ["iphone", "ipad", "applewatch", "airpods", "macbook"].includes(line.category) ? "Apple" : line.category,
        model: model.name,
        variant: storage,
        storage,
        color,
        color_hex: line.colorHex || null,
      } as any)
      .select("id")
      .single()

    if (error) throw error
    return created?.id || null
  }

  const handleSave = async () => {
    if (!canSave || isSubmitting) return
    setIsSubmitting(true)
    try {
      let resolvedSupplier = selectedSupplier
      if (!resolvedSupplier) {
        const response = await fetch("/api/suppliers/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: purchase.supplier_name }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.data?.supplier) {
          throw new Error(payload?.error?.message || "Não foi possível resolver o fornecedor")
        }
        resolvedSupplier = {
          id: payload.data.supplier.id,
          name: payload.data.supplier.name,
          city: payload.data.supplier.city || null,
        }
        setSuppliers((current) => current.some((supplier) => supplier.id === resolvedSupplier?.id) ? current : [...current, resolvedSupplier as SupplierOption].sort((a, b) => a.name.localeCompare(b.name)))
      }

      const supplierName = resolvedSupplier?.name || null
      const supplierId = resolvedSupplier?.id || null
      const batchIsInTransit = purchase.arrival_mode === "in_transit"
      const batchNeedsReview = purchase.arrival_mode === "with_me" && purchase.release_mode === "pending_review"
      const batchLogisticsStatus = batchIsInTransit ? "in_transit" : "received"
      const itemLogisticsStatus = batchIsInTransit ? "in_transit" : batchNeedsReview ? "received_pending_review" : "in_stock"
      const itemCommercialStatus = batchIsInTransit ? "reservable" : batchNeedsReview ? "blocked" : "available"
      const itemLegacyStatus = batchIsInTransit || batchNeedsReview ? "pending" : "in_stock"
      const receivedAt = batchIsInTransit ? null : new Date().toISOString()
      const { data: stockAccount } = await (supabase.from("finance_chart_accounts") as any)
        .select("id")
        .eq("code", "7.01")
        .limit(1)

      const { data: purchaseRow, error: purchaseError } = await (supabase.from("inventory_purchases") as any)
        .insert({
          supplier_id: supplierId,
          supplier_name: supplierName,
          purchase_date: purchase.purchase_date,
          payment_method: purchase.payment_method,
          account_id: purchase.account_id || null,
          chart_account_id: stockAccount?.[0]?.id || null,
          status: "received",
          logistics_status: batchLogisticsStatus,
          source_type: purchase.source_type,
          ordered_at: purchase.purchase_date,
          expected_arrival_date: purchase.expected_arrival_date || null,
          received_at: receivedAt,
          payment_status: purchase.account_id ? "paid" : "pending",
          due_date: purchase.account_id ? purchase.purchase_date : purchase.due_date || purchase.purchase_date,
          freight_amount: totals.freight,
          freight_cost: totals.freight,
          other_costs_amount: totals.other,
          products_amount: totals.productsAmount,
          total_amount: totals.total,
          notes: purchase.notes || null,
        } as any)
        .select("*")
        .single()

      if (purchaseError) throw purchaseError

      const { data: transactionRow, error: transactionError } = await (supabase.from("transactions") as any)
        .insert({
          account_id: purchase.account_id || null,
          chart_account_id: stockAccount?.[0]?.id || null,
          type: "expense",
          category: "Estoque (Peças/Acessórios)",
          description: `Compra de estoque · ${supplierName || `${totals.totalQty} item(ns)`}`,
          amount: totals.total,
          date: purchase.purchase_date,
          due_date: purchase.account_id ? purchase.purchase_date : purchase.due_date || purchase.purchase_date,
          payment_method: purchase.payment_method,
          status: purchase.account_id ? "reconciled" : "pending",
          reconciled_at: purchase.account_id ? new Date().toISOString() : null,
          source_type: "inventory_purchase",
          source_id: purchaseRow.id,
          notes: [
            totals.freight > 0 ? `Frete rateado: ${formatBRL(totals.freight)}` : null,
            totals.other > 0 ? `Outros custos rateados: ${formatBRL(totals.other)}` : null,
            purchase.notes || null,
          ].filter(Boolean).join(" · ") || null,
        } as any)
        .select("id")
        .single()

      if (transactionError) throw transactionError

      await (supabase.from("inventory_purchases") as any)
        .update({ transaction_id: transactionRow?.id || null })
        .eq("id", purchaseRow.id)

      if (purchase.account_id && transactionRow?.id) {
        await requestSyncTransactionMovement(String(transactionRow.id))
      }

      const catalogIds = new Map<string, string | null>()
      for (const line of lines) {
        catalogIds.set(line.id, await findOrCreateCatalog(line))
      }

      const inventoryPayloads: Array<any & { __lineId: string }> = []
      const purchaseItemPayloads: Array<any & { __lineId: string }> = []

      lines.forEach((line) => {
        const quantity = lineEffectiveQuantity(line)
        const imeis = splitValues(line.imeis)
        const serials = splitValues(line.serials)
        const unitCost = roundMoney(lineEffectiveUnitCost(line))
        const landedUnitCost = roundMoney(unitCost + totals.freightPerUnit + totals.otherPerUnit)
        const suggestedPrice = roundMoney(lineEffectiveSuggestedPrice(line, landedUnitCost))
        const catalogId = catalogIds.get(line.id) || null
        const productName = lineProductName(line, catalogConfig)
        const productType = lineProductType(line, catalogConfig)
        const categoryInfo = getCatalogCategory(catalogConfig, line.category)
        const selectedModel = selectedModelFor(line, catalogConfig)
        const isAccessory = isLineAccessory(line, catalogConfig)
        const hasVariants = isAccessory && !line.accessoryHasSerial && line.variants.length > 0
        const effectiveColor = hasVariants
          ? line.variants.length === 1 ? line.variants[0].colorName : "Múltiplas cores"
          : line.color
        const attributeSummary = [isAccessory ? null : line.storage, effectiveColor].filter(Boolean).join(" · ") || null
        const checklistRequired = needsChecklistLater(line, catalogConfig)
        const isSealedElectronic = !isAccessory && line.mode === "catalog" && ["iphone", "ipad", "applewatch"].includes(line.category) && line.grade === "Lacrado"
        const conditionNotes = [
          line.mode === "manual" ? `Acessorio: ${productName}` : null,
          line.notes || null,
          checklistRequired ? "Checklist tecnico pendente" : null,
        ].filter(Boolean).join(" · ") || null

        const splitByUnit = shouldCreateOneInventoryRowPerUnit(line, imeis, serials, catalogConfig)
        const rowsToCreate = splitByUnit ? quantity : 1

        for (let index = 0; index < rowsToCreate; index += 1) {
          const imei = isAccessory ? null : splitByUnit ? imeis[index] || null : null
          const serial = isAccessory && !line.accessoryHasSerial ? null : splitByUnit ? serials[index] || null : null
          const battery = isAccessory ? null : isSealedElectronic ? 100 : toNumber(line.batteryHealth) || null
          const lifecycleStatus = getComputedInventoryStatus({
            status: "active",
            purchase_price: landedUnitCost,
            purchase_date: purchase.purchase_date,
            grade: line.grade,
            imei,
            serial_number: serial,
            catalog_id: catalogId,
            notes: line.mode === "manual" ? productName : (isAccessory && line.commercialName.trim() ? `Nome: ${line.commercialName.trim()}` : line.notes),
            condition_notes: conditionNotes,
          })

          inventoryPayloads.push({
            __lineId: line.id,
            catalog_id: catalogId,
            imei,
            serial_number: serial,
            imei2: null,
            grade: line.grade,
            condition_notes: conditionNotes,
            purchase_price: landedUnitCost,
            purchase_date: purchase.purchase_date,
            supplier_id: supplierId,
            type: "own",
            supplier_name: supplierName,
            origin: "purchase",
            suggested_price: suggestedPrice || null,
            ios_version: null,
            battery_health: battery,
            notes: line.mode === "manual" ? productName : (isAccessory && line.commercialName.trim() ? `Nome: ${line.commercialName.trim()}` : line.notes || null),
            quantity: splitByUnit ? 1 : quantity,
            status: itemLegacyStatus || mapLifecycleToLegacyCompatibleStatus(lifecycleStatus),
            logistics_status: itemLogisticsStatus,
            commercial_status: itemCommercialStatus,
            inventory_purchase_id: purchaseRow.id,
            expected_arrival_date: purchase.expected_arrival_date || null,
            received_at: receivedAt,
            product_type: productType,
            category_name_snapshot: categoryInfo?.label || line.category,
            subcategory_name_snapshot: line.mode === "manual" ? productName : selectedModel?.name || null,
            color_name_snapshot: effectiveColor || null,
            attribute_summary_snapshot: attributeSummary,
          })

          purchaseItemPayloads.push({
            __lineId: line.id,
            purchase_id: purchaseRow.id,
            catalog_id: catalogId,
            product_name: productName,
            category: line.category,
            grade: line.grade,
            quantity: splitByUnit ? 1 : quantity,
            unit_index: index + 1,
            imei,
            imei2: null,
            serial_number: serial,
            battery_health: battery,
            unit_cost: unitCost,
            freight_allocated: totals.freightPerUnit,
            other_cost_allocated: totals.otherPerUnit,
            landed_unit_cost: landedUnitCost,
            suggested_price: suggestedPrice || null,
            margin_pct: toNumber(line.marginPct),
            checklist_required: checklistRequired,
            checklist_status: checklistRequired ? "pending" : "not_required",
            notes: line.notes || null,
          })
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const inventoryForInsert = inventoryPayloads.map(({ __lineId: _, ...rest }) => rest)
      const { data: createdInventory, error: inventoryError } = await (supabase.from("inventory") as any)
        .insert(inventoryForInsert)
        .select("id")

      if (inventoryError) throw inventoryError

      const lineIdToInventoryId = new Map<string, string>()
      inventoryPayloads.forEach((payload, idx) => {
        if (!lineIdToInventoryId.has(payload.__lineId) && createdInventory?.[idx]?.id) {
          lineIdToInventoryId.set(payload.__lineId, createdInventory[idx].id)
        }
      })

      const itemsWithInventory = purchaseItemPayloads.map((item, index) => ({
        ...item,
        inventory_id: createdInventory?.[index]?.id || null,
      }))

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const itemsForInsert = itemsWithInventory.map(({ __lineId: _, ...item }) => item)

      const { error: itemError } = await (supabase.from("inventory_purchase_items") as any)
        .insert(itemsForInsert)

      if (itemError) throw itemError

      const uploadTargets = itemsWithInventory
        .map((item) => ({
          inventoryId: item.inventory_id as string | null,
          line: lines.find((line) => line.id === item.__lineId),
        }))
        .filter((item): item is { inventoryId: string; line: PurchaseLine } => Boolean(item.inventoryId && item.line?.imageFile))

      const imageUploadErrors: string[] = []
      for (const target of uploadTargets) {
        try {
          await uploadProductImage(target.inventoryId, target.line.imageFile as File)
        } catch (error) {
          imageUploadErrors.push(error instanceof Error ? error.message : "Erro ao enviar imagem")
        }
      }

      for (const line of lines) {
        const isAccessory = isLineAccessory(line, catalogConfig)
        if (isAccessory && !line.accessoryHasSerial && line.variants.length > 0) {
          const inventoryId = lineIdToInventoryId.get(line.id)
          if (inventoryId) {
            const variantPayload = line.variants
              .filter((v) => v.colorName.trim() && parseInt(v.quantity) > 0)
              .map((v) => ({
                color_name: v.colorName.trim(),
                color_hex: v.colorHex || null,
                quantity: parseInt(v.quantity) || 0,
                unit_cost: line.useVariantPricing ? (toNumber(v.unitCost) || null) : null,
                suggested_price: line.useVariantPricing ? (toNumber(v.suggestedPrice) || null) : null,
              }))
            await fetch(`/api/inventory/${inventoryId}/variants`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ variants: variantPayload }),
            }).catch(() => null)
          }
        }
      }

      if (imageUploadErrors.length > 0) {
        toast({
          title: "Compra cadastrada, mas imagem não enviada",
          description: imageUploadErrors[0],
          type: "warning",
          duration: 6000,
        })
      } else {
        toast({
          title: "Compra cadastrada",
          description: batchIsInTransit
            ? `${totals.totalQty} item(ns) ficaram a caminho e reservaveis.`
            : `${totals.totalQty} item(ns) entraram no estoque com custo rateado.`,
          type: "success",
        })
      }
      router.push("/estoque")
    } catch (error) {
      toast({
        title: "Erro ao salvar compra",
        description: error instanceof Error ? error.message : "Erro inesperado",
        type: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/estoque">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-xl font-bold text-navy-900">Compra em lote</h2>
            <p className="text-sm text-gray-500">Cadastre varios itens de uma compra e rateie frete automaticamente.</p>
          </div>
        </div>
        <Button variant="primary" onClick={handleSave} disabled={!canSave} isLoading={isSubmitting}>
          <Save className="w-4 h-4" /> Salvar compra
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-navy-900">Dados da compra</h3>
                <p className="text-sm text-gray-500">Frete e custos extras entram no custo unitario de cada produto.</p>
              </div>
              <Badge variant={purchase.account_id ? "green" : "yellow"} dot>
                {purchase.account_id ? "Pago agora" : "A pagar"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Input
                  label="Fornecedor"
                  placeholder="Digite para buscar ou criar fornecedor"
                  value={supplierQuery || purchase.supplier_name}
                  onChange={(event) => updateSupplierQuery(event.target.value)}
                />
                <div className="mt-2 rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
                  {selectedSupplier ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <span className="font-semibold">Selecionado: {selectedSupplier.name}</span>
                      <button type="button" className="text-xs font-bold text-emerald-700 hover:underline" onClick={() => updateSupplierQuery("")}>Trocar</button>
                    </div>
                  ) : null}
                  {!selectedSupplier && filteredSuppliers.length > 0 ? (
                    <div className="grid gap-1">
                      {filteredSuppliers.map((supplier) => (
                        <button
                          key={supplier.id}
                          type="button"
                          onClick={() => selectSupplier(supplier)}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-navy-900 hover:bg-gray-50"
                        >
                          <span className="font-semibold">{supplier.name}</span>
                          <span className="text-xs text-gray-500">{supplier.city || "Fornecedor cadastrado"}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!selectedSupplier && purchase.supplier_name.trim() && !supplierExactMatch ? (
                    <button
                      type="button"
                      onClick={() => updatePurchase("supplier_name", purchase.supplier_name.trim())}
                      className="mt-1 w-full rounded-lg border border-dashed border-royal-200 px-3 py-2 text-left text-sm font-bold text-royal-700 hover:bg-royal-50"
                    >
                      Criar fornecedor &quot;{purchase.supplier_name.trim()}&quot;
                    </button>
                  ) : null}
                  {!selectedSupplier && !purchase.supplier_name.trim() ? (
                    <p className="px-3 py-2 text-xs font-medium text-gray-500">Informe um fornecedor para rastrear este pedido.</p>
                  ) : null}
                </div>
              </div>
              <Input label="Data da compra" type="date" value={purchase.purchase_date} onChange={(event) => updatePurchase("purchase_date", event.target.value)} />
              <Input label="Vencimento" type="date" value={purchase.due_date} onChange={(event) => updatePurchase("due_date", event.target.value)} />
              <Select label="Forma de pagamento" value={purchase.payment_method} onChange={(event) => updatePurchase("payment_method", event.target.value)} options={paymentOptions} />
              <Select label="Conta" value={purchase.account_id} onChange={(event) => updatePurchase("account_id", event.target.value)} options={[{ label: "Nao conciliar agora", value: "" }, ...accounts]} />
              <Input
                label="Frete total"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={purchase.freight_amount}
                onChange={(event) => updatePurchase("freight_amount", event.target.value)}
                onBlur={() => updatePurchase("freight_amount", formatBRLInput(purchase.freight_amount))}
                icon={<Truck className="w-4 h-4" />}
              />
              <Input
                label="Outros custos"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={purchase.other_costs_amount}
                onChange={(event) => updatePurchase("other_costs_amount", event.target.value)}
                onBlur={() => updatePurchase("other_costs_amount", formatBRLInput(purchase.other_costs_amount))}
                icon={<Calculator className="w-4 h-4" />}
              />
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-navy-900">Esses produtos já estão com você?</h4>
                  <p className="mt-1 text-xs text-gray-500">A caminho fica reservável, mas não entra como estoque físico disponível.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updatePurchase("arrival_mode", "with_me")}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition",
                      purchase.arrival_mode === "with_me" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}
                  >
                    <span className="block font-bold">Sim, já estão comigo</span>
                    <span className="text-xs opacity-75">Entrada física no estoque</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePurchase("arrival_mode", "in_transit")}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition",
                      purchase.arrival_mode === "in_transit" ? "border-royal-200 bg-royal-50 text-royal-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}
                  >
                    <span className="block font-bold">Não, estão a caminho</span>
                    <span className="text-xs opacity-75">Reservável, sem venda imediata</span>
                  </button>
                </div>
              </div>

              {purchase.arrival_mode === "with_me" ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updatePurchase("release_mode", "available")}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition",
                      purchase.release_mode === "available" ? "border-emerald-200 bg-white text-emerald-800 shadow-sm" : "border-gray-200 bg-white text-gray-600"
                    )}
                  >
                    <span className="block font-bold">Liberar como em estoque</span>
                    <span className="text-xs opacity-75">Disponível para venda</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePurchase("release_mode", "pending_review")}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition",
                      purchase.release_mode === "pending_review" ? "border-purple-200 bg-white text-purple-700 shadow-sm" : "border-gray-200 bg-white text-gray-600"
                    )}
                  >
                    <span className="block font-bold">Recebido, aguardando revisão</span>
                    <span className="text-xs opacity-75">Bloqueado até laudo/conferência</span>
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Select label="Origem" value={purchase.source_type} onChange={(event) => updatePurchase("source_type", event.target.value)} options={sourceTypeOptions} />
                  <Input label="Previsão de chegada" type="date" value={purchase.expected_arrival_date} onChange={(event) => updatePurchase("expected_arrival_date", event.target.value)} />
                </div>
              )}
            </div>
            <Textarea label="Observacoes da compra" value={purchase.notes} onChange={(event) => updatePurchase("notes", event.target.value)} placeholder="Ex: compra de lote, origem, negociacao, observacoes do fornecedor..." />
          </section>

          <section className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-navy-900">Itens do lote</h3>
                <p className="text-sm text-gray-500">{totals.totalQty} unidade(s) em {lines.length} linha(s) de produto.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => addLine("manual")}>
                  <Plus className="w-4 h-4" /> Manual
                </Button>
                <Button variant="primary" size="sm" onClick={() => addLine("catalog")}>
                  <Plus className="w-4 h-4" /> Catalogo
                </Button>
              </div>
            </div>

            <div className="space-y-4 bg-gray-50/40 p-4">
              {lines.map((line, index) => {
                const model = selectedModelFor(line, catalogConfig)
                const accessoryLine = isLineAccessory(line, catalogConfig)
                const storageOptions = accessoryLine ? [] : ((model?.storage || model?.sizes || []) as string[]).map((value) => ({ label: value, value }))
                const colorOptions = ((model?.colors || []) as CatalogColor[])
                const manualColorOptions = manualColorOptionsFor(line)
                const quantity = Math.max(1, Math.floor(toNumber(line.quantity)))
                const effectiveUnitCost = lineEffectiveUnitCost(line)
                const landedCost = roundMoney(effectiveUnitCost + totals.freightPerUnit + totals.otherPerUnit)
                const suggested = lineEffectiveSuggestedPrice(line, landedCost)
                const hasVariantPricing = isLineAccessory(line, catalogConfig) && !line.accessoryHasSerial && line.variants.length > 0 && line.useVariantPricing
                const collapsed = collapsedLineIds.has(line.id)
                const categoryInfo = getCatalogCategory(catalogConfig, line.category)
                const canShowBattery = !accessoryLine
                const batteryValue = canShowBattery && line.grade === "Lacrado" && ["iphone", "ipad", "applewatch"].includes(line.category) ? "100" : line.batteryHealth

                return (
                  <div key={line.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <label className="group flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-royal-200 bg-royal-50/40 text-royal-600 transition hover:bg-royal-50">
                          {line.imagePreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={line.imagePreviewUrl} alt={`Imagem de ${lineProductName(line, catalogConfig)}`} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex flex-col items-center gap-1 text-[11px] font-bold">
                              <ImageIcon className="h-5 w-5" />
                              Imagem
                            </span>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                            className="hidden"
                            onChange={(event) => updateLineImage(line.id, event.target.files?.[0] || null)}
                          />
                        </label>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-royal-700">Item {index + 1}</span>
                            <Badge variant="gray">{quantity} un.</Badge>
                            {line.mode === "manual" ? <Badge variant="blue">Fora do catálogo</Badge> : null}
                            {needsChecklistLater(line, catalogConfig) && <Badge variant="yellow">Checklist depois</Badge>}
                          </div>
                          <h4 className="mt-2 truncate text-lg font-bold text-navy-900">{lineProductName(line, catalogConfig)}</h4>
                          {accessoryLine && line.mode === "catalog" && line.commercialName.trim() ? (
                            <p className="mt-0.5 truncate text-xs text-gray-400">
                              Catálogo: {catalogGeneratedName(line, catalogConfig)} · {lineEffectiveQuantity(line)} un.
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm text-gray-500">
                            Custo final unitário: <strong className="text-navy-900">{formatBRL(landedCost)}</strong>
                            <span className="mx-2 text-gray-300">•</span>
                            Sugerido {formatBRL(suggested || 0)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => duplicateLine(line)}>
                          <Copy className="w-4 h-4" /> Duplicar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)} disabled={lines.length === 1}>
                          <Trash2 className="w-4 h-4" /> Remover
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => toggleLineCollapsed(line.id)} title={collapsed ? "Expandir item" : "Recolher item"}>
                          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {!collapsed ? (
                      <div className="space-y-5 p-4 sm:p-5">
                        {line.mode === "manual" ? (
                          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>Este item será cadastrado como Manual/Outro, fora do catálogo de produtos.</p>
                          </div>
                        ) : null}

                        <BatchLineSection number={1} title={line.mode === "manual" ? "Informações do produto" : "Produto"}>
                          <div className="space-y-3">
                            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-12">
                              <div className="min-w-0 md:col-span-3">
                                <Select label="Tipo" value={line.mode} onChange={(event) => updateLine(line.id, "mode", event.target.value)} options={[{ label: "Catálogo", value: "catalog" }, { label: "Manual/outro", value: "manual" }]} />
                              </div>
                              <div className="min-w-0 md:col-span-3">
                                <Select label="Categoria" value={line.category} onChange={(event) => updateLine(line.id, "category", event.target.value)} options={categoryOptions} />
                              </div>
                              {line.mode === "catalog" ? (
                                <>
                                  <div className="min-w-0 md:col-span-3">
                                    <Select label="Modelo" value={String(line.modelIdx)} onChange={(event) => updateLine(line.id, "modelIdx", event.target.value)} options={(categoryInfo?.models || []).map((item: any, idx: number) => ({ label: item.name, value: String(idx) }))} />
                                  </div>
                                  {!accessoryLine ? (
                                    <div className="min-w-0 md:col-span-3">
                                      <Select label="Armazenamento" value={line.storage} onChange={(event) => updateLine(line.id, "storage", event.target.value)} options={[{ label: "Selecionar", value: "" }, ...storageOptions]} />
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="min-w-0 md:col-span-6">
                                  <Input label="Nome do produto" value={line.manualName} onChange={(event) => updateLine(line.id, "manualName", event.target.value)} placeholder="Ex: Capa para iPad, Cabo USB-C, Apple Pencil..." />
                                </div>
                              )}
                            </div>
                            {accessoryLine && line.mode === "catalog" ? (
                              <div>
                                <Input
                                  label="Nome comercial do acessório"
                                  value={line.commercialName}
                                  onChange={(event) => updateLine(line.id, "commercialName", event.target.value)}
                                  placeholder={catalogGeneratedName(line, catalogConfig) || "Ex: Capa Trifold para iPad A16 (11\") - Modelo Executivo"}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                  Este nome aparecerá no estoque e na venda. O catálogo continua preservado para categoria, modelo e cores.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </BatchLineSection>

                        <BatchLineSection number={2} title={accessoryLine && !line.accessoryHasSerial ? "Variações por cor" : "Cor"} subtitle={accessoryLine && !line.accessoryHasSerial ? "Informe as cores disponíveis e suas quantidades." : line.mode === "manual" ? "Opcional para itens fora do catálogo." : undefined}>
                          {accessoryLine && !line.accessoryHasSerial ? (
                            <div className="space-y-3">
                              {line.variants.length > 0 ? (
                                <div className="space-y-3">
                                  <div className={cn(
                                    "hidden px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid sm:items-center sm:gap-3",
                                    line.useVariantPricing ? "sm:grid-cols-[1.5fr_90px_140px_140px_40px]" : "sm:grid-cols-[1.5fr_90px_40px]"
                                  )}>
                                    <span>Cor/Variação</span>
                                    <span>Qtd</span>
                                    {line.useVariantPricing ? (
                                      <>
                                        <span>Custo unit.</span>
                                        <span>Preço sugerido</span>
                                      </>
                                    ) : null}
                                    <span />
                                  </div>
                                  {line.variants.map((v) => (
                                    <div
                                      key={v.id}
                                      className={cn(
                                        "grid items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3",
                                        line.useVariantPricing
                                          ? "grid-cols-1 sm:grid-cols-[1.5fr_90px_140px_140px_40px]"
                                          : "grid-cols-1 sm:grid-cols-[1.5fr_90px_40px]"
                                      )}
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="h-3 w-3 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: v.colorHex || "#e5e7eb" }} />
                                        <span className="truncate font-medium text-slate-900">{v.colorName}</span>
                                      </div>
                                      <div className="min-w-0">
                                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Qtd</span>
                                        <input
                                          type="number"
                                          min="1"
                                          className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-medium text-navy-900 focus:outline-none focus:ring-2 focus:ring-royal-500"
                                          value={v.quantity}
                                          onChange={(e) =>
                                            setLines((prev) => prev.map((l) =>
                                              l.id !== line.id ? l : {
                                                ...l,
                                                variants: l.variants.map((item) =>
                                                  item.id === v.id ? { ...item, quantity: e.target.value } : item
                                                ),
                                              }
                                            ))
                                          }
                                        />
                                      </div>
                                      {line.useVariantPricing ? (
                                        <>
                                          <div className="min-w-0">
                                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Custo unit.</span>
                                            <input
                                              type="text"
                                              inputMode="decimal"
                                              placeholder="0,00"
                                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-navy-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-royal-500"
                                              value={v.unitCost}
                                              onChange={(e) =>
                                                setLines((prev) => prev.map((l) =>
                                                  l.id !== line.id ? l : {
                                                    ...l,
                                                    variants: l.variants.map((item) =>
                                                      item.id === v.id ? { ...item, unitCost: e.target.value } : item
                                                    ),
                                                  }
                                                ))
                                              }
                                            />
                                          </div>
                                          <div className="min-w-0">
                                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Preço sugerido</span>
                                            <input
                                              type="text"
                                              inputMode="decimal"
                                              placeholder="0,00"
                                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-navy-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-royal-500"
                                              value={v.suggestedPrice}
                                              onChange={(e) =>
                                                setLines((prev) => prev.map((l) =>
                                                  l.id !== line.id ? l : {
                                                    ...l,
                                                    variants: l.variants.map((item) =>
                                                      item.id === v.id ? { ...item, suggestedPrice: e.target.value } : item
                                                    ),
                                                  }
                                                ))
                                              }
                                            />
                                          </div>
                                        </>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setLines((prev) => prev.map((l) =>
                                            l.id !== line.id ? l : { ...l, variants: l.variants.filter((item) => item.id !== v.id) }
                                          ))
                                        }
                                        className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500"
                                        aria-label={`Remover variação ${v.colorName}`}
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                  {(() => {
                                    const stats = variantPricingStats(line)
                                    const estimatedCost = stats.totalQty * toNumber(line.unitCost)
                                    return (
                                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-5">
                                        <div className="rounded-xl bg-white px-3 py-2">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
                                          <p className="mt-1 text-sm font-bold text-navy-900">{stats.totalQty} unidades</p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Custo total</p>
                                          <p className="mt-1 text-sm font-bold text-navy-900">
                                            {line.useVariantPricing ? formatBRL(stats.totalCost) : estimatedCost > 0 ? formatBRL(estimatedCost) : "—"}
                                          </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Custo médio</p>
                                          <p className="mt-1 text-sm font-bold text-navy-900">{line.useVariantPricing && stats.avgCost > 0 ? formatBRL(stats.avgCost) : "—"}</p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preço médio</p>
                                          <p className="mt-1 text-sm font-bold text-navy-900">{line.useVariantPricing && stats.avgSuggested > 0 ? formatBRL(stats.avgSuggested) : "—"}</p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Receita sugerida</p>
                                          <p className="mt-1 text-sm font-bold text-navy-900">{line.useVariantPricing && stats.totalSuggested > 0 ? formatBRL(stats.totalSuggested) : "—"}</p>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                  <label className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300 accent-royal-600"
                                      checked={line.useVariantPricing}
                                      onChange={(e) =>
                                        setLines((prev) => prev.map((l) =>
                                          l.id !== line.id ? l : { ...l, useVariantPricing: e.target.checked }
                                        ))
                                      }
                                    />
                                    <span className="text-sm font-semibold text-navy-900">Definir custo/preço por variação</span>
                                    <span className="text-xs text-gray-400">Use apenas se alguma cor teve custo ou preço diferente.</span>
                                  </label>
                                </div>
                              ) : (
                                <p className="rounded-xl border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                                  Selecione as cores abaixo para adicionar variações.
                                </p>
                              )}
                              <div className="space-y-2 pt-1">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adicionar cor</p>
                                <div className="flex flex-wrap gap-2">
                                  {(line.mode === "manual" ? manualColorOptions : colorOptions)
                                    .filter((c) => !line.variants.find((v) => v.colorName.toLowerCase() === c.name.toLowerCase()))
                                    .map((color) => (
                                      <button
                                        key={color.name}
                                        type="button"
                                        onClick={() =>
                                          setLines((prev) => prev.map((l) =>
                                            l.id !== line.id ? l : {
                                              ...l,
                                              variants: [
                                                ...l.variants,
                                                { id: crypto.randomUUID(), colorName: color.name, colorHex: color.hex, quantity: "1", unitCost: "", suggestedPrice: "" },
                                              ],
                                            }
                                          ))
                                        }
                                        className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-900 transition hover:border-royal-300 hover:bg-royal-50"
                                      >
                                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color.hex }} />
                                        {color.name}
                                      </button>
                                    ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const name = window.prompt("Nome da nova cor/variação:")
                                      if (!name?.trim()) return
                                      setLines((prev) => prev.map((l) =>
                                        l.id !== line.id ? l : {
                                          ...l,
                                          variants: [
                                            ...l.variants,
                                            { id: crypto.randomUUID(), colorName: name.trim(), colorHex: "", quantity: "1", unitCost: "", suggestedPrice: "" },
                                          ],
                                        }
                                      ))
                                    }}
                                    className="rounded-full border border-dashed border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:border-royal-300 hover:text-royal-600"
                                  >
                                    + Nova cor/variação
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <ColorSwatchPicker
                              colors={line.mode === "manual" ? manualColorOptions : colorOptions}
                              value={line.color}
                              subtitle={line.mode === "manual" ? "Cores globais ou livres para este item." : `Cores disponíveis para ${model?.name || "este modelo"}`}
                              allowNoColor={line.mode === "manual"}
                              allowOutOfCatalog={line.mode === "catalog"}
                              noColorLabel="Sem cor"
                              onClear={() => {
                                updateLine(line.id, "color", "")
                                updateLine(line.id, "colorHex", "")
                              }}
                              onChange={(color) => {
                                updateLine(line.id, "color", color.name)
                                updateLine(line.id, "colorHex", color.hex)
                              }}
                              onCreateColor={(color) => line.mode === "manual" ? createManualColorForLine(line, color) : createColorForLine(line, color)}
                              createLabel={line.mode === "manual" ? "Adicionar nova cor" : "Adicionar nova cor ao modelo"}
                              emptyMessage={line.mode === "manual" ? "Nenhuma cor global configurada. Use uma sugestão ou adicione uma nova cor." : "Nenhuma cor configurada para este modelo."}
                            />
                          )}
                        </BatchLineSection>

                        <BatchLineSection number={3} title="Detalhes comerciais">
                          {hasVariantPricing ? (
                            <div className="space-y-3">
                              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Select label="Condição" value={line.grade} onChange={(event) => updateLine(line.id, "grade", event.target.value)} options={gradeOptions} />
                                {(() => {
                                  const stats = variantPricingStats(line)
                                  return (
                                    <>
                                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Quantidade</p>
                                        <p className="mt-1 text-lg font-semibold text-navy-900">{stats.totalQty}</p>
                                        <p className="text-[10px] text-gray-400">Soma das variações</p>
                                      </div>
                                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Custo médio</p>
                                        <p className="mt-1 text-lg font-semibold text-navy-900">{stats.avgCost > 0 ? formatBRL(stats.avgCost) : "—"}</p>
                                        <p className="text-[10px] text-gray-400">Calculado das variações</p>
                                      </div>
                                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Preço médio</p>
                                        <p className="mt-1 text-lg font-semibold text-navy-900">{stats.avgSuggested > 0 ? formatBRL(stats.avgSuggested) : "—"}</p>
                                        <p className="text-[10px] text-gray-400">Calculado das variações</p>
                                      </div>
                                    </>
                                  )
                                })()}
                              </div>
                              <p className="text-xs text-gray-400">Valores calculados pelas variações. Para custo/preço geral, desmarque &ldquo;Definir custo/preço por variação&rdquo;.</p>
                            </div>
                          ) : (
                            <div className={cn("grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2", canShowBattery ? "lg:grid-cols-6" : "lg:grid-cols-5")}>
                              <Select label="Condição" value={line.grade} onChange={(event) => updateLine(line.id, "grade", event.target.value)} options={gradeOptions} />
                              {accessoryLine && !line.accessoryHasSerial && line.variants.length > 0 ? (
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Quantidade</p>
                                  <p className="mt-1 text-lg font-semibold text-navy-900">{lineEffectiveQuantity(line)}</p>
                                  <p className="text-[10px] text-gray-400">Calculada das variações</p>
                                </div>
                              ) : (
                                <Input label="Quantidade" type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} />
                              )}
                              <Input label="Custo unitário" inputMode="decimal" value={line.unitCost} onChange={(event) => updateLine(line.id, "unitCost", event.target.value)} placeholder="0,00" />
                              <Input label="Margem %" inputMode="decimal" value={line.marginPct} onChange={(event) => updateLine(line.id, "marginPct", event.target.value)} />
                              <Input label="Preço sugerido" inputMode="decimal" value={line.suggestedPrice} onChange={(event) => updateLine(line.id, "suggestedPrice", event.target.value)} placeholder={String(suggested || "")} />
                              {canShowBattery ? (
                                <Input label="Bateria %" type="number" min="0" max="100" disabled={line.grade === "Lacrado"} value={batteryValue} onChange={(event) => updateLine(line.id, "batteryHealth", event.target.value)} />
                              ) : null}
                            </div>
                          )}
                        </BatchLineSection>

                        <BatchLineSection number={4} title="Identificação">
                          {accessoryLine ? (
                            <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
                              <label className="flex items-start gap-3 text-sm text-navy-900">
                                <input
                                  type="checkbox"
                                  checked={line.accessoryHasSerial}
                                  onChange={(event) => setLines((prev) => prev.map((item) => item.id === line.id ? { ...item, accessoryHasSerial: event.target.checked, serials: event.target.checked ? item.serials : "" } : item))}
                                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 accent-royal-500"
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold">Este item possui serial</span>
                                  <span className="mt-1 block text-xs leading-5 text-gray-500">Quando ativado, o lote salvará um número de série por unidade.</span>
                                </span>
                              </label>
                              {line.accessoryHasSerial ? (
                                <Textarea label="Séries, um por linha" value={line.serials} onChange={(event) => updateLine(line.id, "serials", event.target.value)} placeholder={"F2L...\nG6T..."} />
                              ) : null}
                            </div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              <Textarea label="IMEIs (um por linha)" value={line.imeis} onChange={(event) => updateLine(line.id, "imeis", event.target.value)} placeholder={"356...\n356..."} />
                              <Textarea label="Seriais (um por linha)" value={line.serials} onChange={(event) => updateLine(line.id, "serials", event.target.value)} placeholder={"F2L...\nG6T..."} />
                            </div>
                          )}
                        </BatchLineSection>

                        <BatchLineSection number={5} title="Observações">
                          <div className="relative">
                            <Textarea
                              value={line.notes}
                              maxLength={500}
                              onChange={(event) => updateLine(line.id, "notes", event.target.value)}
                              placeholder="Marcas de uso, caixa, acessórios inclusos, origem..."
                              className="min-h-[120px] pb-8"
                            />
                            <span className="absolute bottom-3 right-3 text-xs font-medium text-gray-400">{line.notes.length}/500</span>
                          </div>
                        </BatchLineSection>

                        <BatchLineSection number={6} title="Imagem do item" subtitle="Use JPG, PNG, WebP ou HEIC. A foto será aplicada ao item criado no estoque.">
                          <div
                            className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4 transition hover:border-royal-200 hover:bg-royal-50/30"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              updateLineImage(line.id, event.dataTransfer.files?.[0] || null)
                            }}
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-royal-600 shadow-sm">
                                  <Upload className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-navy-900">Arraste e solte ou clique para enviar</p>
                                  <p className="text-xs text-gray-500">{line.imageFile ? line.imageFile.name : "Tamanho máximo: 10MB"}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-navy-900 shadow-sm transition-colors hover:border-royal-200 hover:text-royal-600">
                                  <Upload className="h-4 w-4" />
                                  Selecionar arquivo
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                                    className="hidden"
                                    onChange={(event) => updateLineImage(line.id, event.target.files?.[0] || null)}
                                  />
                                </label>
                                {line.imageFile ? (
                                  <Button variant="ghost" size="icon" onClick={() => updateLineImage(line.id, null)} title="Remover imagem">
                                    <X className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </BatchLineSection>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => addLine("manual")}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white text-sm font-semibold text-royal-600 transition hover:border-royal-200 hover:bg-royal-50/40"
              >
                <Plus className="h-4 w-4" />
                Adicionar novo item ao lote
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="sticky top-4 bg-card rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-navy-900">Resumo do lote</h3>
                <p className="text-sm text-gray-500">Custo real por unidade.</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Produtos</span>
                <strong className="text-navy-900">{formatBRL(totals.productsAmount)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Frete</span>
                <strong className="text-navy-900">{formatBRL(totals.freight)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Outros custos</span>
                <strong className="text-navy-900">{formatBRL(totals.other)}</strong>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between gap-3">
                <span className="font-medium text-navy-900">Total da compra</span>
                <strong className="text-lg text-navy-900">{formatBRL(totals.total)}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Unidades</p>
                <p className="mt-1 text-xl font-semibold text-navy-900">{totals.totalQty}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Frete/un.</p>
                <p className="mt-1 text-xl font-semibold text-navy-900">{formatBRL(totals.freightPerUnit)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              O frete e os custos extras sao rateados no custo de cada item. Assim, quando vender, o CMV e o lucro ja ficam corretos.
            </div>

            <Button variant="primary" fullWidth onClick={handleSave} disabled={!canSave} isLoading={isSubmitting}>
              <Save className="w-4 h-4" /> Salvar compra em lote
            </Button>
          </section>
        </aside>
      </div>
    </div>
  )
}

function BatchLineSection({
  number,
  title,
  subtitle,
  children,
}: {
  number: number
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0 border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3 min-w-0">
        <h5 className="text-sm font-bold text-royal-700">{number}. {title}</h5>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-gray-500">{subtitle}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
