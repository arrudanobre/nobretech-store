"use client"

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { useState, useEffect, useCallback, useMemo, useRef, type ComponentType, type ReactNode } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toaster"
import { ProductImageManager } from "@/components/products/product-image-manager"
import { ColorSwatchPicker } from "@/components/products/color-swatch-picker"
import { supabase } from "@/lib/supabase"
import { GRADES } from "@/lib/constants"
import {
  buildLegacyCatalogConfig,
  createOrLinkModelColor,
  DEFAULT_COLOR_SUGGESTIONS,
  getCatalogCategory,
  getCategoryOptions,
  isAccessoryProduct,
  loadCatalogConfig,
  normalizeCatalogName,
  type CatalogColor,
  type CatalogConfig,
} from "@/lib/catalog-config"
import type { OperationalProductImageRecord } from "@/lib/product-images"
import { SupplierCombobox } from "@/components/products/supplier-combobox"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"
import {
  ArrowLeft,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  CheckCircle2,
  FileText,
  Hash,
  Layers,
  Loader2,
  PackageCheck,
  Percent,
  Plus,
  Save,
  ShieldCheck,
  Smartphone,
  Store,
  Trash2,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from "lucide-react"
import { formatBRL, getComputedInventoryStatus, getProductName, mapLifecycleToLegacyCompatibleStatus, normalizeInventoryStatus } from "@/lib/helpers"

const HEX_RE = /^#[0-9a-f]{6}$/i

function normalizeHexInput(value: string) {
  const clean = value.trim().replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
  return clean ? `#${clean}` : "#"
}

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "pending", label: "Cadastro incompleto" },
  { value: "trade_in_received", label: "Trade-in recebido" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
  { value: "under_repair", label: "Em reparo" },
  { value: "returned", label: "Devolvido" },
]
type ProductMode = "catalog" | "manual"

type LinkedSaleInfo = {
  id: string
  sale_date: string
  payment_due_date?: string | null
  sale_status?: string | null
  linkType: "principal" | "adicional"
}

type LinkedPurchaseInfo = {
  id: string
  purchase_date: string
  transaction_id?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
}

type SourceSaleInfo = {
  id: string
  sale_date?: string | null
  payment_due_date?: string | null
  sale_status?: string | null
  customer?: {
    full_name?: string | null
  } | null
}

type VariantRow = {
  id: string
  catalogColorId: string | null
  colorName: string
  colorHex: string
  quantity: string
  unitCost: string
  suggestedPrice: string
}

type SectionCardProps = {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}

function SectionCard({ title, description, icon: Icon, children }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-royal-500/10 text-royal-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-navy-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label || value
}

function toDateInputValue(value?: string | null) {
  if (!value) return ""
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || ""
}

function formatDateBR(value?: string | null) {
  const dateOnly = toDateInputValue(value)
  if (!dateOnly) return "—"
  const [year, month, day] = dateOnly.split("-")
  return `${day}/${month}/${year}`
}

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const productId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [catalogName, setCatalogName] = useState("")
  const [productName, setProductName] = useState("")
  const [mode, setMode] = useState<ProductMode>("catalog")
  const [catalogConfig, setCatalogConfig] = useState<CatalogConfig>(() => buildLegacyCatalogConfig())
  const catalogConfigRef = useRef<CatalogConfig>(catalogConfig)
  const [catalogId, setCatalogId] = useState<string | null>(null)
  const [linkedSale, setLinkedSale] = useState<LinkedSaleInfo | null>(null)
  const [linkedPurchase, setLinkedPurchase] = useState<LinkedPurchaseInfo | null>(null)
  const [operationalImage, setOperationalImage] = useState<OperationalProductImageRecord | null>(null)
  const [itemOrigin, setItemOrigin] = useState("purchase")
  const [sourceSale, setSourceSale] = useState<SourceSaleInfo | null>(null)
  const [saleDate, setSaleDate] = useState("")
  const [adjustFinancialDate, setAdjustFinancialDate] = useState(false)
  const [notes, setNotes] = useState("")
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [showCatalogColorModal, setShowCatalogColorModal] = useState(false)
  const [showFreeColorModal, setShowFreeColorModal] = useState(false)
  const [modalColorName, setModalColorName] = useState("")
  const [modalColorHex, setModalColorHex] = useState("#111827")
  const [modalAddingColor, setModalAddingColor] = useState(false)
  const [freeColorName, setFreeColorName] = useState("")
  const [freeColorHex, setFreeColorHex] = useState("#111827")
  const [category, setCategory] = useState("iphone")
  const [modelIdx, setModelIdx] = useState(0)
  const [formData, setFormData] = useState({
    storage: "",
    color: "",
    colorHex: "",
    imei: "",
    serial_number: "",
    accessory_has_serial: false,
    grade: "",
    status: "in_stock",
    purchase_price: "",
    suggested_price: "",
    purchase_date: "",
    battery_health: "",
    ios_version: "",
    condition_notes: "",
    quantity: "1",
    type: "own",
    supplier_id: "",
    supplier_name: "",
  })
  const models = useMemo(() => {
    return getCatalogCategory(catalogConfig, category)?.models || []
  }, [catalogConfig, category])
  const selectedModel = models[modelIdx] as any
  const storageOptions = (selectedModel?.storage || selectedModel?.sizes || []) as string[]
  const colorOptions = (selectedModel?.colors || []) as CatalogColor[]
  const currentCategory = getCatalogCategory(catalogConfig, category)
  const categoryOptions = useMemo(() => getCategoryOptions(catalogConfig), [catalogConfig])
  const generatedCatalogName = useMemo(() => {
    if (mode === "manual") return productName.trim() || catalogName
    return [selectedModel?.name, formData.storage, formData.color].filter(Boolean).join(" ").trim()
  }, [catalogName, formData.color, formData.storage, mode, productName, selectedModel?.name])
  const isAccessory = isAccessoryProduct({
    mode,
    category,
    categoryLabel: currentCategory?.label,
    name: mode === "manual" ? productName || catalogName : selectedModel?.name,
    productType: currentCategory?.productType,
  })
  const resolvedProductType = mode === "manual" ? "accessory" : currentCategory?.productType || (isAccessory ? "accessory" : "device")
  const isSealed = formData.grade === "Lacrado"
  const cost = parseFloat(formData.purchase_price) || 0
  const suggested = parseFloat(formData.suggested_price) || 0
  const profit = Math.max(0, suggested - cost)
  const marginPct = cost > 0 && suggested > 0 ? Math.round(((suggested / cost) - 1) * 100) : 0
  const markupPct = suggested > 0 ? Math.round((profit / suggested) * 100) : 0
  const hasCoreId = isAccessory ? true : Boolean(formData.imei || formData.serial_number)
  const isTradeInItem = itemOrigin === "trade_in"
  const isSupplierItem = !isTradeInItem && formData.type === "supplier"
  const sourceSaleStatus = sourceSale?.sale_status || null
  const sourceSaleLabel = sourceSaleStatus === "reserved"
    ? "Reserva pendente"
    : sourceSaleStatus === "completed"
      ? "Venda concluída"
      : sourceSaleStatus === "cancelled"
        ? "Venda cancelada"
        : "Negociação vinculada"

  useEffect(() => {
    catalogConfigRef.current = catalogConfig
  }, [catalogConfig])

  const inferCatalogSelection = (item: any, catalog?: any | null, config: CatalogConfig = catalogConfigRef.current) => {
    const rawName = getProductName({ ...item, catalog }).toLowerCase()
    const findBestModelIndex = (modelsToSearch: readonly any[]) => {
      const exactIndex = modelsToSearch.findIndex((model: any) => catalog?.model === model.name)
      if (exactIndex >= 0) return exactIndex

      return modelsToSearch
        .map((model: any, index: number) => ({ index, name: String(model.name).toLowerCase() }))
        .filter((model) => rawName.includes(model.name))
        .sort((a, b) => b.name.length - a.name.length)[0]?.index ?? -1
    }
    const categoryValue = catalog?.category || config.categories.find((group) =>
      findBestModelIndex(group.models) >= 0
    )?.value || "iphone"
    const group = getCatalogCategory(config, categoryValue)
    const modelIndex = Math.max(0, findBestModelIndex(group?.models || []))
    const model = group?.models[modelIndex] as any
    const storage = catalog?.storage || (model?.storage || model?.sizes || []).find((value: string) => rawName.includes(value.toLowerCase())) || ""
    const color = catalog?.color || model?.colors?.find((option: { name: string }) => rawName.includes(option.name.toLowerCase()))?.name || ""
    const colorHex = catalog?.color_hex || model?.colors?.find((option: { name: string }) => option.name === color)?.hex || ""

    return { categoryValue, modelIndex, storage, color, colorHex }
  }

  const fetchProduct = useCallback(async () => {
    if (!productId) return
    try {
      const { data: items, error } = await (supabase.from("inventory") as any)
        .select("*")
        .eq("id", productId)

      if (error || !items || items.length === 0) {
        toast({ title: "Erro", description: "Produto não encontrado", type: "error" })
        router.push("/estoque")
        return
      }

      const item = items[0]
      const activeCatalogConfig = catalogConfigRef.current
      setOperationalImage(item.operational_image_url && item.operational_thumbnail_url && item.operational_image_storage_key
        ? {
            product_id: item.id,
            image_url: item.operational_image_url,
            thumbnail_url: item.operational_thumbnail_url,
            storage_key: item.operational_image_storage_key,
            thumbnail_storage_key: item.operational_thumbnail_storage_key || null,
            updated_at: item.updated_at || null,
          }
        : null)

      setCatalogId(item.catalog_id || null)
      setNotes(item.notes || "")
      setItemOrigin(item.origin || "purchase")
      setSourceSale(null)
      setLinkedSale(null)
      setLinkedPurchase(null)
      setSaleDate("")
      setAdjustFinancialDate(false)

      const varRes = await fetch(`/api/inventory/${productId}/variants`).catch(() => null)
      const varPayload = varRes ? await varRes.json().catch(() => null) : null
      if (varPayload?.data?.variants) {
        setVariants(
          (varPayload.data.variants as Array<any>).map((v) => ({
            id: v.id || crypto.randomUUID(),
            catalogColorId: v.catalog_color_id || null,
            colorName: v.color_name,
            colorHex: v.color_hex || "",
            quantity: String(v.quantity),
            unitCost: v.unit_cost != null ? String(v.unit_cost) : "",
            suggestedPrice: v.suggested_price != null ? String(v.suggested_price) : "",
          }))
        )
      } else {
        setVariants([])
      }

      setFormData({
        storage: "",
        color: "",
        colorHex: "",
        imei: item.imei || "",
        serial_number: item.serial_number || "",
        accessory_has_serial: Boolean(item.serial_number),
        grade: item.grade || "",
        status: item.origin === "trade_in" && item.status === "trade_in_received"
          ? "trade_in_received"
          : normalizeInventoryStatus(item.status || "in_stock"),
        purchase_price: item.purchase_price?.toString() || "",
        suggested_price: item.suggested_price?.toString() || "",
        purchase_date: toDateInputValue(item.purchase_date),
        battery_health: item.battery_health?.toString() || "",
        ios_version: item.ios_version || "",
        condition_notes: item.condition_notes || "",
        quantity: item.quantity?.toString() || "1",
        type: item.origin === "trade_in" ? "own" : item.type || "own",
        supplier_id: item.origin === "trade_in" ? "" : item.supplier_id || "",
        supplier_name: item.origin === "trade_in" ? "" : item.supplier_name || "",
      })

      if (item.source_sale_id) {
        const { data: sourceSales, error: sourceSaleError } = await (supabase.from("sales") as any)
          .select("id, customer_id, sale_date, payment_due_date, sale_status")
          .eq("id", item.source_sale_id)
          .limit(1)
        if (sourceSaleError) throw sourceSaleError
        const source = sourceSales?.[0] || null
        if (source?.customer_id) {
          const { data: sourceCustomer } = await (supabase.from("customers") as any)
            .select("full_name")
            .eq("id", source.customer_id)
            .limit(1)
          setSourceSale({ ...source, customer: sourceCustomer?.[0] || null })
        } else {
          setSourceSale(source)
        }
      }

      if (item.catalog_id) {
        const { data: catData } = await (supabase.from("product_catalog") as any)
          .select("*")
          .eq("id", item.catalog_id)
          .single()

        if (catData) {
          const selection = inferCatalogSelection(item, catData, activeCatalogConfig)
          setMode("catalog")
          setCategory(selection.categoryValue)
          setModelIdx(selection.modelIndex)
          const resolvedName = getProductName({ ...item, catalog: catData })
          setCatalogName(resolvedName)
          setProductName(resolvedName)
          setFormData((prev) => ({
            ...prev,
            storage: selection.storage,
            color: selection.color,
            colorHex: selection.colorHex,
            status: item.origin === "trade_in" && item.status === "trade_in_received"
              ? "trade_in_received"
              : getComputedInventoryStatus({ ...item, catalog: catData }),
          }))
        }
      } else {
        const selection = inferCatalogSelection(item, null, activeCatalogConfig)
        const fallbackName = item.notes || item.condition_notes?.replace(/^Acessório:\s*/, "") || "Produto manual"
        const hasDeviceSignals = !isAccessoryProduct({ category: selection.categoryValue, name: fallbackName }) && Boolean(item.imei || item.battery_health || item.ios_version || selection.storage || selection.color || getProductName(item).toLowerCase().includes("iphone"))
        setMode(hasDeviceSignals ? "catalog" : "manual")
        setCategory(selection.categoryValue)
        setModelIdx(selection.modelIndex)
        setFormData((prev) => ({
          ...prev,
          storage: selection.storage,
          color: selection.color,
          colorHex: selection.colorHex,
          status: item.origin === "trade_in" && item.status === "trade_in_received"
            ? "trade_in_received"
            : getComputedInventoryStatus(item),
        }))
        setCatalogName(hasDeviceSignals ? getProductName({ model: (getCatalogCategory(activeCatalogConfig, selection.categoryValue)?.models[selection.modelIndex] as any)?.name, storage: selection.storage, color: selection.color }) : fallbackName)
        setProductName(hasDeviceSignals ? "" : fallbackName)
      }

      const { data: directSales, error: directSaleError } = await (supabase.from("sales") as any)
        .select("id, sale_date, payment_due_date, sale_status")
        .eq("inventory_id", productId)
        .order("sale_date", { ascending: false })
        .limit(1)
      if (directSaleError) throw directSaleError

      let sale = directSales?.[0] ? { ...directSales[0], linkType: "principal" as const } : null
      if (!sale) {
        const { data: additionalItems, error: additionalError } = await (supabase.from("sales_additional_items") as any)
          .select("sale_id")
          .eq("product_id", productId)
          .limit(1)
        if (additionalError) throw additionalError
        const saleId = additionalItems?.[0]?.sale_id
        if (saleId) {
          const { data: additionalSales, error: additionalSaleError } = await (supabase.from("sales") as any)
            .select("id, sale_date, payment_due_date, sale_status")
            .eq("id", saleId)
            .limit(1)
          if (additionalSaleError) throw additionalSaleError
          sale = additionalSales?.[0] ? { ...additionalSales[0], linkType: "adicional" as const } : null
        }
      }

      if (sale) {
        setLinkedSale(sale)
        setSaleDate(toDateInputValue(sale.sale_date))
      }

      const { data: purchaseItems, error: purchaseItemError } = await (supabase.from("inventory_purchase_items") as any)
        .select("purchase_id")
        .eq("inventory_id", productId)
        .limit(1)
      if (purchaseItemError) throw purchaseItemError
      const purchaseId = purchaseItems?.[0]?.purchase_id
      if (purchaseId) {
        const { data: purchases, error: purchaseError } = await (supabase.from("inventory_purchases") as any)
          .select("id, purchase_date, transaction_id, supplier_id, supplier_name")
          .eq("id", purchaseId)
          .limit(1)
        if (purchaseError) throw purchaseError
        if (purchases?.[0]) {
          setLinkedPurchase(purchases[0])
          setFormData((prev) => ({
            ...prev,
            purchase_date: toDateInputValue(purchases[0].purchase_date) || prev.purchase_date,
            supplier_id: prev.supplier_id || purchases[0].supplier_id || "",
            supplier_name: prev.supplier_name || purchases[0].supplier_name || "",
          }))
        }
      }
    } catch (err) {
      toast({ title: "Erro ao carregar produto", type: "error" })
    } finally {
      setLoading(false)
    }
  }, [productId, router, toast])

  useEffect(() => {
    loadCatalogConfig({ refresh: true }).then(setCatalogConfig)
  }, [])

  useEffect(() => {
    fetchProduct()
  }, [fetchProduct])

  const updateField = (field: string, value: string) => {
    if (isTradeInItem && field === "type" && value === "supplier") return
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleCategoryChange = (value: string) => {
    setCategory(value)
    setModelIdx(0)
    setFormData((prev) => ({ ...prev, storage: "", color: "", colorHex: "", imei: "", battery_health: "", ios_version: "", accessory_has_serial: false, serial_number: "" }))
  }

  const createColor = async (color: CatalogColor) => {
    const current = getCatalogCategory(catalogConfig, category)
    const existing = colorOptions.find((item) => normalizeCatalogName(item.name) === normalizeCatalogName(color.name))
    if (existing) {
      setFormData((prev) => ({ ...prev, color: existing.name, colorHex: existing.hex }))
      return
    }
    const linkedColor = await createOrLinkModelColor({
      categoryId: current?.id,
      subcategoryId: selectedModel?.subcategoryId,
      color,
      existingColors: colorOptions,
    })
    setCatalogConfig((config) => ({
      categories: config.categories.map((item) => item.value === category ? {
        ...item,
        models: item.models.map((model, index) => index === modelIdx ? {
          ...model,
          colors: [...(model.colors || []), linkedColor],
        } : model),
      } : item),
    }))
    setFormData((prev) => ({ ...prev, color: linkedColor.name, colorHex: linkedColor.hex }))
  }

  const findOrCreateCatalog = async () => {
    if (mode === "manual") return null
    if (!selectedModel) throw new Error("Selecione um modelo do catálogo")
    const storage = isAccessory ? null : formData.storage || null
    const color = formData.color || null

    const { data: existing, error: findError } = await (supabase.from("product_catalog") as any)
      .select("id, storage, color")
      .eq("category", category)
      .eq("model", selectedModel.name)
    if (findError) throw findError
    const existingMatch = (existing || []).find((item: any) =>
      (item.storage || null) === storage && (item.color || null) === color
    )
    if (existingMatch?.id) return existingMatch.id

    const { data: created, error } = await (supabase.from("product_catalog") as any)
      .insert({
        category,
        brand: ["iphone", "ipad", "applewatch", "airpods", "macbook"].includes(category) ? "Apple" : category,
        model: selectedModel.name,
        variant: storage,
        storage,
        color,
        color_hex: formData.colorHex || null,
      } as any)
      .select("id")
      .single()
    if (error) throw error
    return created?.id || null
  }

  const handleAddCatalogColor = async () => {
    if (!modalColorName.trim()) return
    const nameNorm = normalizeCatalogName(modalColorName.trim())
    if (variants.some((v) => normalizeCatalogName(v.colorName) === nameNorm)) {
      toast({ title: "Esta cor já foi adicionada como variação.", type: "error" })
      return
    }
    const hexToUse = HEX_RE.test(modalColorHex) ? modalColorHex : "#888888"
    setModalAddingColor(true)
    try {
      const current = getCatalogCategory(catalogConfig, category)
      const existing = colorOptions.find((c) => normalizeCatalogName(c.name) === nameNorm)
      let linkedColor: CatalogColor
      if (existing) {
        linkedColor = existing
      } else {
        linkedColor = await createOrLinkModelColor({
          categoryId: current?.id,
          subcategoryId: (selectedModel as any)?.subcategoryId,
          color: { name: modalColorName.trim(), hex: hexToUse },
          existingColors: colorOptions,
        })
        setCatalogConfig((config) => ({
          categories: config.categories.map((cat) =>
            cat.value === category
              ? {
                  ...cat,
                  models: cat.models.map((model, index) =>
                    index === modelIdx
                      ? { ...model, colors: [...(model.colors || []), linkedColor] }
                      : model
                  ),
                }
              : cat
          ),
        }))
      }
      setVariants((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          catalogColorId: linkedColor.id || null,
          colorName: linkedColor.name,
          colorHex: linkedColor.hex,
          quantity: "1",
          unitCost: formData.purchase_price || "",
          suggestedPrice: formData.suggested_price || "",
        },
      ])
      setShowCatalogColorModal(false)
      setModalColorName("")
      setModalColorHex("#111827")
    } catch (err: any) {
      toast({ title: "Erro ao criar cor", description: err?.message, type: "error" })
    } finally {
      setModalAddingColor(false)
    }
  }

  const handleAddFreeColor = () => {
    if (!freeColorName.trim()) return
    if (variants.some((v) => normalizeCatalogName(v.colorName) === normalizeCatalogName(freeColorName.trim()))) {
      toast({ title: "Esta cor já foi adicionada como variação.", type: "error" })
      return
    }
    setVariants((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogColorId: null,
        colorName: freeColorName.trim(),
        colorHex: HEX_RE.test(freeColorHex) ? freeColorHex : "",
        quantity: "1",
        unitCost: formData.purchase_price || "",
        suggestedPrice: formData.suggested_price || "",
      },
    ])
    setShowFreeColorModal(false)
    setFreeColorName("")
    setFreeColorHex("#111827")
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const nextCatalogId = await findOrCreateCatalog()
      const trimmedProductName = productName.trim()
      const attributeSummary = [isAccessory ? null : formData.storage, formData.color].filter(Boolean).join(" · ") || null
      const customCatalogName = mode === "catalog" && trimmedProductName && trimmedProductName !== generatedCatalogName
        ? trimmedProductName
        : ""
      const computedLifecycleStatus = getComputedInventoryStatus({
        status: formData.status,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        purchase_date: formData.purchase_date || null,
        grade: formData.grade || null,
        imei: isAccessory ? null : formData.imei || null,
        serial_number: isAccessory && !formData.accessory_has_serial ? null : formData.serial_number || null,
        catalog_id: nextCatalogId,
        notes: mode === "manual" ? (trimmedProductName || notes || formData.condition_notes || null) : (customCatalogName || null),
        condition_notes: formData.condition_notes || null,
      })
      const resolvedType = isTradeInItem ? "own" : formData.type
      const resolvedStatus = isTradeInItem && sourceSaleStatus === "reserved"
        ? "trade_in_received"
        : mapLifecycleToLegacyCompatibleStatus(computedLifecycleStatus)

      const allowsVariants = isAccessory && !formData.accessory_has_serial
      const activeVariants = allowsVariants
        ? variants.filter((v) => v.colorName.trim() && parseInt(v.quantity) > 0)
        : []
      const variantsTotal = activeVariants.reduce((sum, v) => sum + (parseInt(v.quantity) || 0), 0)
      const resolvedQuantity =
        resolvedType === "own"
          ? activeVariants.length > 0
            ? variantsTotal
            : Math.max(1, parseInt(formData.quantity) || 1)
          : 1

      const updateData: Record<string, any> = {
        catalog_id: nextCatalogId,
        imei: isAccessory ? null : formData.imei || null,
        serial_number: isAccessory && !formData.accessory_has_serial ? null : formData.serial_number || null,
        grade: formData.grade || null,
        status: resolvedStatus,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        suggested_price: formData.suggested_price ? parseFloat(formData.suggested_price) : null,
        purchase_date: formData.purchase_date,
        battery_health: isAccessory ? null : isSealed ? 100 : formData.battery_health ? parseInt(formData.battery_health) : null,
        ios_version: isAccessory ? null : formData.ios_version || null,
        condition_notes: formData.condition_notes || null,
        quantity: resolvedQuantity,
        type: resolvedType,
        supplier_id: isTradeInItem ? null : (formData.supplier_id || null),
        supplier_name: isTradeInItem ? null : (formData.supplier_name || null),
        notes: mode === "manual" ? (trimmedProductName || null) : (customCatalogName ? `Nome: ${customCatalogName}` : null),
        product_type: resolvedProductType,
        category_name_snapshot: currentCategory?.label || category,
        subcategory_name_snapshot: mode === "manual" ? trimmedProductName || null : selectedModel?.name || null,
        color_name_snapshot: formData.color || null,
        attribute_summary_snapshot: attributeSummary,
      }

      const { error } = await (supabase.from("inventory") as any)
        .update(updateData)
        .eq("id", productId)

      if (error) throw error

      if (allowsVariants) {
        const variantPayload = activeVariants.map((v) => ({
          catalog_color_id: v.catalogColorId || null,
          color_name: v.colorName.trim(),
          color_hex: v.colorHex || null,
          quantity: parseInt(v.quantity) || 0,
          unit_cost: v.unitCost ? parseFloat(v.unitCost) : null,
          suggested_price: v.suggestedPrice ? parseFloat(v.suggestedPrice) : null,
        }))
        const vRes = await fetch(`/api/inventory/${productId}/variants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variants: variantPayload }),
        })
        if (!vRes.ok) {
          const vPayload = await vRes.json().catch(() => null)
          throw new Error(vPayload?.error?.message || "Erro ao salvar variações")
        }
      }

      if (linkedPurchase?.id && formData.purchase_date && formData.purchase_date !== toDateInputValue(linkedPurchase.purchase_date)) {
        const { error: purchaseError } = await (supabase.from("inventory_purchases") as any)
          .update({ purchase_date: formData.purchase_date })
          .eq("id", linkedPurchase.id)
        if (purchaseError) throw purchaseError

        if (adjustFinancialDate && linkedPurchase.transaction_id) {
          const { error: txError } = await (supabase.from("transactions") as any)
            .update({ date: formData.purchase_date })
            .eq("id", linkedPurchase.transaction_id)
          if (txError) throw txError
          await requestSyncTransactionMovement(linkedPurchase.transaction_id)
        }
      }

      if (linkedSale?.id && saleDate && saleDate !== toDateInputValue(linkedSale.sale_date)) {
        const { error: saleError } = await (supabase.from("sales") as any)
          .update({ sale_date: saleDate })
          .eq("id", linkedSale.id)
        if (saleError) throw saleError

        if (adjustFinancialDate) {
          const { data: saleTransactions, error: txFindError } = await (supabase.from("transactions") as any)
            .select("id")
            .eq("source_type", "sale")
            .eq("source_id", linkedSale.id)
          if (txFindError) throw txFindError

          for (const transaction of saleTransactions || []) {
            const { error: txError } = await (supabase.from("transactions") as any)
              .update({ date: saleDate })
              .eq("id", transaction.id)
            if (txError) throw txError
            await requestSyncTransactionMovement(transaction.id)
          }
        }
      }

      toast({ title: "Produto atualizado!", type: "success" })
      router.push(`/estoque/${productId}`)
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err?.message || "Falha ao atualizar",
        type: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-navy-900 sm:text-2xl">{generatedCatalogName || catalogName || "Editar produto"}</h2>
            <p className="text-sm text-gray-500">Atualize os dados comerciais, técnicos e de rastreabilidade.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {statusLabel(formData.status)}
              </span>
              {formData.grade ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-royal-50 px-3 py-1 text-xs font-semibold text-royal-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {formData.grade}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                <Store className="h-3.5 w-3.5" />
                {isTradeInItem ? "Trade-in" : isSupplierItem ? "Fornecedor" : "Estoque próprio"}
              </span>
            </div>
          </div>
        </div>
        <Button variant="primary" onClick={handleSave} isLoading={saving} className="h-12 px-6 shadow-lg shadow-royal-500/20">
          <Save className="w-4 h-4" /> Salvar
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <SectionCard
            title="Catálogo e especificações"
            description="Atualize categoria, modelo, armazenamento ou tamanho e cor usando a base do catálogo."
            icon={Smartphone}
          >
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("catalog")}
                className={`rounded-xl border p-4 text-left transition-all ${mode === "catalog" ? "border-royal-500 bg-royal-100/30" : "border-gray-100 hover:border-gray-200"}`}
              >
                <p className="font-semibold text-navy-900">Produto do catálogo</p>
                <p className="mt-1 text-xs text-gray-500">iPhone, iPad, Watch, AirPods, MacBook ou Garmin.</p>
              </button>
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`rounded-xl border p-4 text-left transition-all ${mode === "manual" ? "border-royal-500 bg-royal-100/30" : "border-gray-100 hover:border-gray-200"}`}
              >
                <p className="font-semibold text-navy-900">Produto manual</p>
                <p className="mt-1 text-xs text-gray-500">Acessórios, itens avulsos ou produtos fora da base.</p>
              </button>
            </div>

            {mode === "catalog" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Select label="Categoria" value={category} onChange={(e) => handleCategoryChange(e.target.value)} options={categoryOptions} />
                  <Select
                    label="Modelo"
                    value={modelIdx.toString()}
                    onChange={(e) => {
                      setModelIdx(Number(e.target.value))
                      setFormData((prev) => ({ ...prev, storage: "", color: "", colorHex: "" }))
                    }}
                    options={models.map((model: any, index) => ({ label: model.name, value: index.toString() }))}
                  />
                  {!isAccessory && storageOptions.length > 0 ? (
                    <Select
                      label="Armazenamento / tamanho"
                      value={formData.storage}
                      onChange={(e) => updateField("storage", e.target.value)}
                      placeholder="Selecione"
                      options={storageOptions.map((value) => ({ label: value, value }))}
                    />
                  ) : (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Armazenamento</p>
                      <p className="mt-1 text-sm font-semibold text-gray-500">Não se aplica</p>
                    </div>
                  )}
                </div>

                <ColorSwatchPicker
                  colors={colorOptions}
                  value={formData.color}
                  subtitle={`Cores disponíveis para ${selectedModel?.name || "este modelo"}`}
                  onChange={(color) => setFormData((prev) => ({ ...prev, color: color.name, colorHex: color.hex }))}
                  onCreateColor={createColor}
                  createLabel="Adicionar nova cor ao modelo"
                />

                <div className="rounded-2xl border border-royal-100 bg-royal-50/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-royal-600">Nome gerado pelo catálogo</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{generatedCatalogName || "Selecione as especificações"}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Modo manual</p>
                <p className="mt-1 text-sm text-gray-500">Use o campo de nome abaixo para definir como este item aparece no estoque e na venda.</p>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Identificação"
            description={isAccessory ? "Nome e status do item manual." : "IMEI, número de série e status operacional do aparelho."}
            icon={Hash}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-3">
                <Input
                  label={mode === "catalog" ? "Nome personalizado (opcional)" : "Nome do produto"}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={mode === "catalog" ? generatedCatalogName || "Deixe em branco para usar o catálogo" : "Ex: Capa para iPad 10ª geração"}
                />
                {catalogId ? (
                  <p className="mt-1.5 text-xs text-gray-500">
                    O nome personalizado vale apenas para este item; modelo, armazenamento e cor são salvos no catálogo.
                  </p>
                ) : null}
              </div>
              <Select
                label="Status"
                value={formData.status}
                onChange={(e) => updateField("status", e.target.value)}
                options={STATUS_OPTIONS}
              />
              {!isAccessory ? (
                <>
                  <Input
                    label="IMEI"
                    value={formData.imei}
                    onChange={(e) => updateField("imei", e.target.value.replace(/\D/g, "").slice(0, 15))}
                  />
                  <Input
                    label="Nº de Série"
                    value={formData.serial_number}
                    onChange={(e) => updateField("serial_number", e.target.value)}
                  />
                </>
              ) : (
                <div className="space-y-3 lg:col-span-2">
                  <label className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-navy-900">
                    <input
                      type="checkbox"
                      checked={formData.accessory_has_serial}
                      onChange={(event) => setFormData((prev) => ({ ...prev, accessory_has_serial: event.target.checked, serial_number: event.target.checked ? prev.serial_number : "" }))}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-royal-500"
                    />
                    <span>
                      <span className="block font-semibold">Este acessório possui serial</span>
                      <span className="mt-1 block text-xs text-gray-500">Ative apenas para itens rastreáveis, como Pencil, AirPods, Garmin e teclados.</span>
                    </span>
                  </label>
                  {formData.accessory_has_serial ? (
                    <Input
                      label="Nº de Série"
                      value={formData.serial_number}
                      onChange={(e) => updateField("serial_number", e.target.value)}
                    />
                  ) : (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Acessório sem serial</p>
                      <p className="mt-1 text-sm text-gray-500">IMEI, bateria, capacidade e rede móvel não se aplicam a este item.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isAccessory ? (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-navy-900">Grade comercial</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => updateField("grade", g.value)}
                      className={`min-h-[48px] rounded-2xl border text-sm font-bold transition-all ${
                        formData.grade === g.value
                          ? `${g.color} border-current shadow-sm`
                          : "border-gray-200 bg-white text-gray-400 hover:border-royal-300 hover:text-navy-900"
                      }`}
                    >
                      {g.value}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Origem e estoque"
            description={isTradeInItem ? "Procedência e disponibilidade do item recebido em troca." : "Defina se o item é próprio ou de fornecedor e como ele aparece no estoque."}
            icon={Boxes}
          >
            {isTradeInItem ? (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Procedência</p>
                    <p className="mt-1 text-lg font-bold text-navy-900">Trade-in realizado na Nobretech</p>
                    <div className="mt-4 grid gap-3 text-sm text-emerald-950 sm:grid-cols-2">
                      <div className="min-w-0 rounded-lg bg-white/55 p-3">
                        <span className="block text-xs font-bold uppercase text-emerald-700">Negociação vinculada</span>
                        <span className="mt-1 block break-words font-semibold">{sourceSale ? `${sourceSaleLabel} #${sourceSale.id.slice(0, 8)}` : "Sem reserva/venda vinculada"}</span>
                      </div>
                      <div className="min-w-0 rounded-lg bg-white/55 p-3">
                        <span className="block text-xs font-bold uppercase text-emerald-700">Cliente</span>
                        <span className="mt-1 block break-words font-semibold">{sourceSale?.customer?.full_name || "Não informado"}</span>
                      </div>
                      <div className="min-w-0 rounded-lg bg-white/55 p-3">
                        <span className="block text-xs font-bold uppercase text-emerald-700">Situação</span>
                        <span className="mt-1 block break-words font-semibold">{sourceSaleStatus === "reserved" ? "Aguardando conclusão financeira" : sourceSaleLabel}</span>
                      </div>
                      <div className="min-w-0 rounded-lg bg-white/55 p-3">
                        <span className="block text-xs font-bold uppercase text-emerald-700">Tipo de estoque</span>
                        <span className="mt-1 block break-words font-semibold">Próprio obrigatório</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <Input
                      label="Quantidade em estoque"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => updateField("quantity", Math.max(1, parseInt(e.target.value) || 1).toString())}
                    />
                    <Input
                      label="Data de aquisição"
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => updateField("purchase_date", e.target.value)}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
                  <p className="font-semibold text-navy-900">Vínculo operacional</p>
                  <p className="mt-1 text-gray-500">
                    {sourceSale
                      ? "Este aparelho permanece rastreado pela negociação de trade-in. Ele não pode ser marcado como fornecedor."
                      : "Este aparelho está marcado como trade-in, mas não possui reserva ou venda de origem registrada."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                  <Select
                    label="Origem do produto"
                    value={formData.type}
                    onChange={(e) => updateField("type", e.target.value)}
                    options={[
                      { label: "Estoque próprio", value: "own" },
                      { label: "Fornecedor", value: "supplier" },
                    ]}
                  />
                  {linkedPurchase ? (
                    <div className="w-full">
                      <label className="block text-sm font-medium mb-1.5 text-navy-900">Fornecedor da compra</label>
                      <div className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 flex items-center text-sm text-gray-500">
                        {formData.supplier_name || "—"}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-xs text-gray-400">Vinculado ao Pedido #{linkedPurchase.id.slice(0, 4).toUpperCase()}</p>
                        <a
                          href={`/estoque/compras/${linkedPurchase.id}`}
                          className="text-xs font-semibold text-royal-600 hover:underline"
                        >
                          Abrir compra →
                        </a>
                      </div>
                    </div>
                  ) : (
                    <SupplierCombobox
                      supplierId={formData.supplier_id || null}
                      supplierName={formData.supplier_name}
                      onChange={(id, name) => setFormData((prev) => ({ ...prev, supplier_id: id || "", supplier_name: name }))}
                    />
                  )}
                  <Input
                    label="Quantidade em estoque"
                    type="number"
                    min="1"
                    disabled={formData.type === "supplier"}
                    value={formData.type === "supplier" ? "1" : formData.quantity}
                    onChange={(e) => updateField("quantity", Math.max(1, parseInt(e.target.value) || 1).toString())}
                  />
                  <Input
                    label="Data de aquisição"
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => updateField("purchase_date", e.target.value)}
                  />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Input
                    label="Data de venda"
                    type="date"
                    value={saleDate}
                    disabled={!linkedSale}
                    onChange={(e) => setSaleDate(e.target.value)}
                  />
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm lg:col-span-2">
                    <p className="font-semibold text-navy-900">
                      {linkedSale ? `Venda ${linkedSale.linkType === "principal" ? "principal" : "como item adicional"}` : "Sem venda vinculada"}
                    </p>
                    <p className="mt-1 text-gray-500">
                      {linkedSale
                        ? "Ao salvar, a data operacional da venda será atualizada. A data financeira só muda se a opção abaixo estiver marcada."
                        : "A data de venda aparece aqui quando o item já possui uma venda registrada."}
                    </p>
                  </div>
                </div>
                <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    checked={adjustFinancialDate}
                    onChange={(event) => setAdjustFinancialDate(event.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-royal-500"
                  />
                  <span>
                    <span className="block font-semibold">Também ajustar a data financeira/extrato</span>
                    <span className="mt-1 block text-amber-800/80">
                      Use apenas quando a entrada ou saída real do caixa também aconteceu nessa data. Desmarcado, o sistema preserva a data de conciliação em `transactions.date`.
                    </span>
                  </span>
                </label>
              </>
            )}
          </SectionCard>

          <SectionCard
            title="Valores"
            description="Ajuste custo, preço sugerido e margem sem perder referência do lucro esperado."
            icon={BadgeDollarSign}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
              <Input
                label="Preço de custo (R$)"
                type="number"
                value={formData.purchase_price}
                onChange={(e) => updateField("purchase_price", e.target.value)}
              />
              <Input
                label="Preço sugerido (R$)"
                type="number"
                min="0"
                step="1"
                value={formData.suggested_price}
                onChange={(e) => updateField("suggested_price", e.target.value)}
              />
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Lucro previsto</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{formatBRL(profit)}</p>
                <p className="text-xs text-emerald-700/80">{marginPct}% sobre custo</p>
              </div>
            </div>

            {cost > 0 ? (
              <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Margem rápida</p>
                    <p className="text-xs text-gray-500">Arraste para recalcular o preço sugerido a partir do custo.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-navy-900 shadow-sm">
                    {marginPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.max(0, Math.min(100, marginPct))}
                  onChange={(e) => {
                    const nextMargin = parseInt(e.target.value)
                    updateField("suggested_price", Math.ceil(cost * (1 + nextMargin / 100)).toString())
                  }}
                  className="w-full accent-royal-500"
                />
                <div className="mt-2 flex justify-between text-[11px] font-semibold text-gray-400">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            ) : null}
          </SectionCard>

          {!isAccessory ? (
            <SectionCard
              title="Dados técnicos"
              description={isSealed ? "Produto lacrado assume bateria 100%; preencha software apenas se fizer sentido." : "Dados úteis para venda, garantia e assistência."}
              icon={Smartphone}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Saúde da bateria (%)"
                  type="number"
                  min="0"
                  max="100"
                  disabled={isSealed}
                  value={isSealed ? "100" : formData.battery_health}
                  onChange={(e) => updateField("battery_health", e.target.value)}
                />
                <Input
                  label="Versão do software"
                  placeholder="Ex: 18.3"
                  value={formData.ios_version}
                  onChange={(e) => updateField("ios_version", e.target.value)}
                />
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Observações"
            description="Registre estado físico, caixa, acessórios inclusos e qualquer informação que ajude na venda."
            icon={FileText}
          >
            <Textarea
              label="Observações internas"
              placeholder="Descreva o estado físico, riscos, marcas de uso..."
              value={formData.condition_notes}
              onChange={(e) => updateField("condition_notes", e.target.value)}
            />
          </SectionCard>

          {isAccessory && !formData.accessory_has_serial ? (
            <SectionCard
              title="Variações e quantidade"
              description="Controle cores/modelos deste acessório. A quantidade total será a soma das variações."
              icon={Layers}
            >
              {/* Existing variants table */}
              {variants.length > 0 ? (
                <div className="mb-5 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Variações cadastradas</p>
                  <div className="hidden grid-cols-[1.4fr_90px_140px_140px_44px] gap-3 px-3 sm:grid">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cor / Variação</span>
                    <span className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">Qtd</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Custo (R$)</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sugerido (R$)</span>
                    <span />
                  </div>
                  {variants.map((v) => (
                    <div
                      key={v.id}
                      className="grid grid-cols-[1.4fr_90px_140px_140px_44px] items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {v.colorHex ? (
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-gray-200 shadow-sm"
                            style={{ background: v.colorHex }}
                          />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-gray-300" />
                        )}
                        <span className="min-w-0 truncate text-sm font-medium text-navy-900">{v.colorName}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        aria-label="Quantidade"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-center text-sm font-semibold text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                        value={v.quantity}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((item) => item.id === v.id ? { ...item, quantity: e.target.value } : item)
                          )
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label="Custo unitário"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                        placeholder="0,00"
                        value={v.unitCost}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((item) => item.id === v.id ? { ...item, unitCost: e.target.value } : item)
                          )
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label="Preço sugerido"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                        placeholder="0,00"
                        value={v.suggestedPrice}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((item) => item.id === v.id ? { ...item, suggestedPrice: e.target.value } : item)
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setVariants((prev) => prev.filter((item) => item.id !== v.id))}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl border border-royal-100 bg-royal-50/60 px-4 py-2.5">
                    <span className="text-sm font-bold text-navy-900">
                      Quantidade total: {variants.filter((v) => v.colorName.trim()).reduce((sum, v) => sum + (parseInt(v.quantity) || 0), 0)} unidades
                    </span>
                    {variants.filter((v) => v.colorName.trim()).reduce((sum, v) => sum + (parseInt(v.quantity) || 0), 0) !==
                      (parseInt(formData.quantity) || 1) ? (
                      <span className="text-xs text-amber-600">A quantidade geral será ajustada ao salvar.</span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mb-5 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  Nenhuma variação cadastrada. Adicione cores abaixo.
                </div>
              )}

              {/* Add variation section */}
              <div className={variants.length > 0 ? "border-t border-gray-100 pt-5" : ""}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Adicionar variação</p>

                {colorOptions.filter((c) =>
                  !variants.find((v) =>
                    v.catalogColorId ? v.catalogColorId === c.id : normalizeCatalogName(v.colorName) === normalizeCatalogName(c.name)
                  )
                ).length > 0 ? (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-medium text-gray-500">Cores do catálogo</p>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions
                        .filter((c) =>
                          !variants.find((v) =>
                            v.catalogColorId ? v.catalogColorId === c.id : normalizeCatalogName(v.colorName) === normalizeCatalogName(c.name)
                          )
                        )
                        .map((color) => (
                          <button
                            key={color.id || color.name}
                            type="button"
                            onClick={() => {
                              setVariants((prev) => [
                                ...prev,
                                {
                                  id: crypto.randomUUID(),
                                  catalogColorId: color.id || null,
                                  colorName: color.name,
                                  colorHex: color.hex,
                                  quantity: "1",
                                  unitCost: formData.purchase_price || "",
                                  suggestedPrice: formData.suggested_price || "",
                                },
                              ])
                            }}
                            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-900 shadow-sm transition hover:border-royal-400 hover:bg-royal-50"
                          >
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color.hex }} />
                            {color.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalColorName("")
                      setModalColorHex("#111827")
                      setShowCatalogColorModal(true)
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-royal-200 bg-royal-50 px-4 py-2 text-sm font-semibold text-royal-700 transition hover:bg-royal-100"
                  >
                    <Plus className="h-4 w-4" /> Nova cor no modelo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFreeColorName("")
                      setFreeColorHex("#111827")
                      setShowFreeColorModal(true)
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" /> Cor fora do catálogo
                  </button>
                </div>
              </div>

              {/* Modal: Nova cor no modelo */}
              {showCatalogColorModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-navy-900">Nova cor no modelo</h3>
                        <p className="mt-0.5 text-sm text-gray-500">Salva no catálogo e adiciona como variação.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCatalogColorModal(false)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-navy-900">Nome da cor</label>
                        <input
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                          placeholder="Ex: Azul Marinho"
                          value={modalColorName}
                          onChange={(e) => setModalColorName(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-navy-900">Cor</label>
                        <div className="grid grid-cols-[44px_1fr] items-end gap-2">
                          <div>
                            <input
                              type="color"
                              value={HEX_RE.test(modalColorHex) ? modalColorHex : "#111827"}
                              onChange={(e) => setModalColorHex(e.target.value.toUpperCase())}
                              className="h-11 w-full rounded-xl border border-gray-200 bg-white p-1"
                            />
                          </div>
                          <input
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                            placeholder="#111827"
                            value={modalColorHex}
                            onChange={(e) => setModalColorHex(normalizeHexInput(e.target.value))}
                          />
                        </div>
                        {modalColorHex && modalColorHex !== "#" && !HEX_RE.test(modalColorHex) ? (
                          <p className="mt-1 text-xs text-red-500">HEX inválido. Use formato #RRGGBB.</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_COLOR_SUGGESTIONS.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() => { setModalColorName(s.name); setModalColorHex(s.hex.toUpperCase()) }}
                            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-navy-900 transition hover:border-royal-200 hover:text-royal-700"
                          >
                            <span className="h-3 w-3 rounded-full border border-gray-300" style={{ backgroundColor: s.hex }} />
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-6 flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowCatalogColorModal(false)}
                        disabled={modalAddingColor}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={handleAddCatalogColor}
                        isLoading={modalAddingColor}
                        disabled={!modalColorName.trim() || (modalColorHex.length > 1 && !HEX_RE.test(modalColorHex))}
                      >
                        Salvar e adicionar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Modal: Cor fora do catálogo */}
              {showFreeColorModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-navy-900">Cor fora do catálogo</h3>
                        <p className="mt-0.5 text-sm text-gray-500">Sem vínculo com o catálogo. Apenas para esta variação.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFreeColorModal(false)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-navy-900">Nome da variação / cor</label>
                        <input
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                          placeholder="Ex: Dourado especial, Edição limitada…"
                          value={freeColorName}
                          onChange={(e) => setFreeColorName(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-navy-900">
                          Cor <span className="font-normal text-gray-400">(opcional)</span>
                        </label>
                        <div className="grid grid-cols-[44px_1fr] items-end gap-2">
                          <div>
                            <input
                              type="color"
                              value={HEX_RE.test(freeColorHex) ? freeColorHex : "#111827"}
                              onChange={(e) => setFreeColorHex(e.target.value.toUpperCase())}
                              className="h-11 w-full rounded-xl border border-gray-200 bg-white p-1"
                            />
                          </div>
                          <input
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm text-navy-900 focus:border-royal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                            placeholder="#RRGGBB"
                            value={freeColorHex}
                            onChange={(e) => setFreeColorHex(normalizeHexInput(e.target.value))}
                          />
                        </div>
                        {freeColorHex && freeColorHex !== "#" && !HEX_RE.test(freeColorHex) ? (
                          <p className="mt-1 text-xs text-red-500">HEX inválido. Use formato #RRGGBB.</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-6 flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowFreeColorModal(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={handleAddFreeColor}
                        disabled={!freeColorName.trim() || (freeColorHex.length > 1 && !HEX_RE.test(freeColorHex))}
                      >
                        Adicionar variação
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <ProductImageManager
            productId={productId}
            operationalImage={operationalImage}
            brand={["iphone", "ipad", "applewatch", "airpods", "macbook"].includes(category) ? "Apple" : category}
            category={category}
            model={selectedModel?.name || generatedCatalogName || catalogName}
            color={formData.color || null}
            onOperationalImageChange={setOperationalImage}
          />

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="bg-navy-900 p-5 text-white">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-navy-200">Resumo do item</p>
                  <h3 className="mt-1 line-clamp-2 text-lg font-bold">{catalogName || "Produto"}</h3>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <PackageCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-navy-200">Custo</p>
                  <p className="mt-1 text-lg font-bold">{formatBRL(cost)}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-navy-200">Venda</p>
                  <p className="mt-1 text-lg font-bold">{formatBRL(suggested)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Lucro previsto</p>
                    <p className="text-lg font-bold text-emerald-700">{formatBRL(profit)}</p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-emerald-700">
                  {markupPct}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-gray-50 p-3">
                  <Percent className="mb-2 h-4 w-4 text-royal-600" />
                  <p className="text-xs text-gray-500">Margem</p>
                  <p className="font-bold text-navy-900">{marginPct}%</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3">
                  <CalendarDays className="mb-2 h-4 w-4 text-royal-600" />
                  <p className="text-xs text-gray-500">Aquisição</p>
                  <p className="font-bold text-navy-900">{formatDateBR(formData.purchase_date)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3">
                  <CalendarDays className="mb-2 h-4 w-4 text-royal-600" />
                  <p className="text-xs text-gray-500">Venda</p>
                  <p className="font-bold text-navy-900">{formatDateBR(saleDate)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3">
                  <WalletCards className="mb-2 h-4 w-4 text-royal-600" />
                  <p className="text-xs text-gray-500">Origem</p>
                  <p className="font-bold text-navy-900">{isTradeInItem ? "Trade-in" : isSupplierItem ? "Fornecedor" : "Próprio"}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3">
                  <UserRound className="mb-2 h-4 w-4 text-royal-600" />
                  <p className="text-xs text-gray-500">Identificação</p>
                  <p className={`font-bold ${hasCoreId ? "text-navy-900" : "text-amber-600"}`}>
                    {hasCoreId ? "OK" : "Pendente"}
                  </p>
                </div>
              </div>

              {!hasCoreId ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                  Preencha IMEI ou número de série para facilitar busca, garantia e rastreabilidade.
                </div>
              ) : null}

              <Button variant="primary" onClick={handleSave} isLoading={saving} className="h-12 w-full">
                <Save className="h-4 w-4" />
                Salvar alterações
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
