"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, ImageIcon, Package, Save, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ColorSwatchPicker } from "@/components/products/color-swatch-picker"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { formatBRL, getComputedInventoryStatus, mapLifecycleToLegacyCompatibleStatus } from "@/lib/helpers"
import { CHECKLIST_TEMPLATES, GRADES } from "@/lib/constants"
import { requestSyncTransactionMovement } from "@/lib/finance/sync-transaction-movement-client"
import { currencyInputToNumber, maskCurrencyInput } from "@/lib/currency-input"
import {
  accessoryUsuallyHasSerial,
  buildLegacyCatalogConfig,
  createOrLinkModelColor,
  getCatalogCategory,
  getCategoryOptions,
  isAccessoryProduct,
  loadCatalogConfig,
  normalizeCatalogName,
  type CatalogColor,
  type CatalogConfig,
} from "@/lib/catalog-config"

type Step = 1 | 2 | 3
type ProductMode = "catalog" | "manual"
type PurchaseFinanceMode = "payable" | "paid_now" | "none"
type SelectOption = { label: string; value: string }
type SupplierOption = SelectOption
type FinanceAccountOption = SelectOption
type CatalogModelOption = {
  name: string
  storage?: string[]
  sizes?: string[]
  colors?: CatalogColor[]
  subcategoryId?: string | null
}

type ChecklistItem = {
  id: string
  label: string
  status: string
  note: string
}

const ACCESSORY_SUGGESTIONS = [
  "Capa para iPad",
  "Película para iPad",
  "Apple Pencil",
  "Cabo USB-C",
  "Fonte 20W",
  "Capa para iPhone",
  "Película para iPhone",
]

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"])
const ACCEPTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"])
const MAX_OPERATIONAL_IMAGE_BYTES = 10 * 1024 * 1024

function validateOperationalImageFile(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() || ""
  if ((file.type && !ACCEPTED_IMAGE_TYPES.has(file.type)) || !ACCEPTED_IMAGE_EXTENSIONS.has(extension)) {
    return "Envie uma imagem em JPG, PNG, WebP ou HEIC."
  }
  if (file.size > MAX_OPERATIONAL_IMAGE_BYTES) return "Use uma imagem com até 10MB."
  return null
}

async function uploadOperationalImage(productId: string, file: File) {
  const formData = new FormData()
  formData.set("productId", productId)
  formData.set("file", file)

  const response = await fetch("/api/product-operational-image", {
    method: "POST",
    body: formData,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || "Erro ao enviar imagem operacional")
  }
}

export default function AddProductPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState<Step>(1)
  const [mode, setMode] = useState<ProductMode>("catalog")
  const [catalogConfig, setCatalogConfig] = useState<CatalogConfig>(() => buildLegacyCatalogConfig())
  const [category, setCategory] = useState("iphone")
  const [modelIdx, setModelIdx] = useState(0)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccountOption[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [operationalImageFile, setOperationalImageFile] = useState<File | null>(null)
  const [operationalImagePreviewUrl, setOperationalImagePreviewUrl] = useState("")
  const operationalImageInputRef = useRef<HTMLInputElement | null>(null)
  const [formData, setFormData] = useState({
    manual_name: "",
    storage: "",
    color: "",
    colorHex: "",
    grade: "Lacrado",
    imei: "",
    imei2: "",
    serial_number: "",
    accessory_has_serial: false,
    ios_version: "",
    battery_health: "",
    condition_notes: "",
    supplier_id: "",
    type: "own",
    supplier_name: "",
    purchase_date: new Date().toISOString().split("T")[0],
    purchase_price: "",
    purchase_finance_mode: "payable" as PurchaseFinanceMode,
    purchase_due_date: new Date().toISOString().split("T")[0],
    purchase_account_id: "",
    purchase_payment_method: "Pix",
    purchase_financial_notes: "",
    suggested_price: "",
    margin: "15",
    quantity: "1",
  })

  const models = useMemo(() => {
    return getCatalogCategory(catalogConfig, category)?.models || []
  }, [catalogConfig, category])

  const selectedModel = models[modelIdx] as CatalogModelOption | undefined
  const selectedModelColors = (selectedModel?.colors || []) as CatalogColor[]
  const isManual = mode === "manual"
  const currentCategory = getCatalogCategory(catalogConfig, category)
  const categoryOptions = useMemo(() => getCategoryOptions(catalogConfig), [catalogConfig])
  const isAccessory = isAccessoryProduct({
    mode,
    category,
    categoryLabel: currentCategory?.label,
    name: isManual ? formData.manual_name : selectedModel?.name,
    productType: currentCategory?.productType,
  })
  const resolvedProductType = isManual ? "accessory" : currentCategory?.productType || (isAccessory ? "accessory" : "device")
  const isSealedElectronic = mode === "catalog" && ["iphone", "ipad", "applewatch"].includes(category) && formData.grade === "Lacrado"
  const showBatteryField = !isAccessory && !isSealedElectronic
  const productName = useMemo(() => {
    if (isManual) return formData.manual_name.trim()
    const parts = [selectedModel?.name, formData.storage, formData.color].filter(Boolean)
    return parts.join(" ").trim()
  }, [isManual, formData.manual_name, formData.storage, formData.color, selectedModel?.name])

  const suggestedPrice = useMemo(() => {
    const manual = currencyInputToNumber(formData.suggested_price)
    if (manual > 0) return manual
    const cost = currencyInputToNumber(formData.purchase_price)
    const margin = Number(formData.margin || 0)
    return cost > 0 ? Math.ceil(cost * (1 + margin / 100)) : 0
  }, [formData.purchase_price, formData.suggested_price, formData.margin])

  const requiresChecklist = useMemo(() => {
    return mode === "catalog" && formData.type === "own" && ["iphone", "ipad"].includes(category) && formData.grade !== "Lacrado"
  }, [mode, category, formData.grade, formData.type])

  const checklistProgress = useMemo(() => {
    if (!requiresChecklist) return 100
    const completed = checklistItems.filter((item) => item.status === "ok" || item.status === "fail").length
    return checklistItems.length ? Math.round((completed / checklistItems.length) * 100) : 0
  }, [checklistItems, requiresChecklist])

  const canProceed = useMemo(() => {
    if (step === 1) {
      if (isManual) return formData.manual_name.trim().length > 0 && category
      const colorOk = Boolean(formData.color) || (isAccessory && selectedModelColors.length === 0)
      return Boolean(category && selectedModel && (isAccessory || formData.storage || !(selectedModel.storage || selectedModel.sizes)) && colorOk)
    }
    if (step === 2) {
      const hasValues = currencyInputToNumber(formData.purchase_price) > 0 && Boolean(formData.purchase_date) && Number(formData.quantity || 0) > 0
      const financeOk =
        formData.purchase_finance_mode === "none" ||
        (formData.purchase_finance_mode === "payable" && Boolean(formData.purchase_due_date)) ||
        (formData.purchase_finance_mode === "paid_now" && Boolean(formData.purchase_account_id))
      return hasValues && financeOk && (!requiresChecklist || checklistProgress >= 80)
    }
    return true
  }, [step, isManual, formData, category, selectedModel, selectedModelColors.length, isAccessory, requiresChecklist, checklistProgress])

  useEffect(() => {
    async function fetchSuppliers() {
      const [{ data }, accountsResult] = await Promise.all([
        supabase.from("suppliers").select("id, name, city").order("name", { ascending: true }),
        supabase.from("finance_accounts").select("id, name, institution").eq("is_active", true).order("created_at", { ascending: true }),
      ])
      setSuppliers(((data || []) as Array<{ id: string; name: string; city?: string | null }>).map((supplier) => ({
        label: `${supplier.name}${supplier.city ? ` - ${supplier.city}` : ""}`,
        value: supplier.id,
      })))
      const accounts = ((accountsResult.data || []) as Array<{ id: string; name: string; institution?: string | null }>).map((account) => ({
        label: account.institution ? `${account.name} · ${account.institution}` : account.name,
        value: account.id,
      }))
      setFinanceAccounts(accounts)
      if (accounts[0]?.value) {
        setFormData((prev) => prev.purchase_account_id ? prev : { ...prev, purchase_account_id: accounts[0].value })
      }
    }
    fetchSuppliers()
    loadCatalogConfig({ refresh: true }).then(setCatalogConfig)
  }, [])

  useEffect(() => {
    return () => {
      if (operationalImagePreviewUrl) URL.revokeObjectURL(operationalImagePreviewUrl)
    }
  }, [operationalImagePreviewUrl])

  useEffect(() => {
    if (!requiresChecklist) {
      setChecklistItems([])
      return
    }
    const template = CHECKLIST_TEMPLATES[category as keyof typeof CHECKLIST_TEMPLATES] || []
    setChecklistItems((template as Array<Partial<ChecklistItem> & { id: string; label: string }>).map((item) => ({ ...item, status: item.status || "", note: item.note || "" })))
  }, [requiresChecklist, category])

  useEffect(() => {
    if (!isManual || formData.manual_name) return
    setFormData((prev) => ({ ...prev, manual_name: ACCESSORY_SUGGESTIONS[0], grade: "Lacrado" }))
  }, [isManual, formData.manual_name])

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const updatePurchasePrice = (value: string) => {
    setFormData((prev) => {
      const maskedValue = maskCurrencyInput(value)
      const cost = currencyInputToNumber(maskedValue)
      const margin = Number(prev.margin || 0)
      return {
        ...prev,
        purchase_price: maskedValue,
        suggested_price: cost > 0 ? maskCurrencyInput(String(Math.ceil(cost * (1 + margin / 100)) * 100)) : "",
      }
    })
  }

  const updateMargin = (value: string) => {
    setFormData((prev) => {
      const cost = currencyInputToNumber(prev.purchase_price)
      const margin = Number(value || 0)
      return {
        ...prev,
        margin: value,
        suggested_price: cost > 0 ? maskCurrencyInput(String(Math.ceil(cost * (1 + margin / 100)) * 100)) : prev.suggested_price,
      }
    })
  }

  const updateSuggestedPrice = (value: string) => {
    setFormData((prev) => {
      const maskedValue = maskCurrencyInput(value)
      const cost = currencyInputToNumber(prev.purchase_price)
      const price = currencyInputToNumber(maskedValue)
      return {
        ...prev,
        suggested_price: maskedValue,
        margin: cost > 0 && price > 0 ? Math.max(0, ((price / cost) - 1) * 100).toFixed(2) : prev.margin,
      }
    })
  }

  const totalPurchaseCost = () => {
    const unitCost = currencyInputToNumber(formData.purchase_price)
    const quantity = formData.type === "own" ? Math.max(1, Number(formData.quantity || 1)) : 1
    return Math.round(unitCost * quantity * 100) / 100
  }

  const updateOperationalImageFile = (file: File | null) => {
    if (file) {
      const validationError = validateOperationalImageFile(file)
      if (validationError) {
        toast({ title: "Imagem inválida", description: validationError, type: "error" })
        return
      }
    }
    setOperationalImagePreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return file ? URL.createObjectURL(file) : ""
    })
    setOperationalImageFile(file)
    if (operationalImageInputRef.current) operationalImageInputRef.current.value = ""
  }

  const createPurchaseFinanceTransaction = async (input: {
    inventoryId: string
    supplierName: string | null
  }) => {
    if (formData.purchase_finance_mode === "none") return

    const amount = totalPurchaseCost()
    if (amount <= 0) return

    const { data: existingTransaction, error: existingError } = await supabase.from("transactions")
      .select("id, status")
      .eq("source_type", "inventory_purchase")
      .eq("source_id", input.inventoryId)
      .neq("status", "cancelled")
      .maybeSingle()

    if (existingError) throw existingError
    if (existingTransaction?.id) return

    const { data: stockAccount } = await supabase.from("finance_chart_accounts")
      .select("id")
      .eq("code", "7.01")
      .limit(1)

    const isPaidNow = formData.purchase_finance_mode === "paid_now"
    const dueDate = isPaidNow ? formData.purchase_date : formData.purchase_due_date || formData.purchase_date
    const descriptionProduct = productName || "Produto de estoque"

    const { data: transactionRow, error: transactionError } = await supabase.from("transactions")
      .insert({
        account_id: isPaidNow ? formData.purchase_account_id || null : null,
        chart_account_id: stockAccount?.[0]?.id || null,
        type: "expense",
        category: "Estoque (Peças/Acessórios)",
        description: `Compra de estoque · ${descriptionProduct}`,
        amount,
        date: isPaidNow ? formData.purchase_date : dueDate,
        due_date: dueDate,
        payment_method: formData.purchase_payment_method,
        status: isPaidNow ? "reconciled" : "pending",
        reconciled_at: isPaidNow ? new Date().toISOString() : null,
        source_type: "inventory_purchase",
        source_id: input.inventoryId,
        notes: [
          input.supplierName ? `Fornecedor: ${input.supplierName}` : null,
          formData.type === "own" && Number(formData.quantity || 1) > 1 ? `Quantidade: ${formData.quantity}` : null,
          formData.purchase_financial_notes || null,
        ].filter(Boolean).join(" · ") || null,
      })
      .select("id")
      .single()

    if (transactionError) throw transactionError

    if (isPaidNow && transactionRow?.id) {
      try {
        await requestSyncTransactionMovement(String(transactionRow.id))
      } catch (syncError) {
        await supabase.from("transactions").delete().eq("id", transactionRow.id)
        throw syncError
      }
    }
  }

  const rollbackCreatedInventory = async (input: { inventoryId?: string | null; checklistId?: string | null }) => {
    await Promise.allSettled([
      input.inventoryId ? supabase.from("inventory").delete().eq("id", input.inventoryId) : Promise.resolve(),
      input.checklistId ? supabase.from("checklists").delete().eq("id", input.checklistId) : Promise.resolve(),
    ])
  }

  const handleCategoryChange = (value: string) => {
    setCategory(value)
    setModelIdx(0)
    setFormData((prev) => ({ ...prev, storage: "", color: "", colorHex: "", accessory_has_serial: false, serial_number: "", imei: "", imei2: "", battery_health: "" }))
  }

  const createColor = async (color: CatalogColor) => {
    const current = getCatalogCategory(catalogConfig, category)
    const existing = selectedModelColors.find((item) => normalizeCatalogName(item.name) === normalizeCatalogName(color.name))
    if (existing) {
      setFormData((prev) => ({ ...prev, color: existing.name, colorHex: existing.hex }))
      return
    }
    const linkedColor = await createOrLinkModelColor({
      categoryId: current?.id,
      subcategoryId: selectedModel?.subcategoryId,
      color,
      existingColors: selectedModelColors,
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

  const updateChecklistItem = (idx: number, status: string, note?: string) => {
    setChecklistItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], status, note: note ?? next[idx].note }
      return next
    })
  }

  const findOrCreateCatalog = async () => {
    if (isManual) return null
    if (!selectedModel) throw new Error("Selecione um modelo para cadastrar o produto.")
    const storage = isAccessory ? null : formData.storage || null
    const color = formData.color || null
    const { data: existing } = await supabase.from("product_catalog")
      .select("id")
      .eq("category", category)
      .eq("model", selectedModel.name)
      .eq("storage", storage)
      .eq("color", color)
      .limit(1)

    if (existing?.[0]?.id) return existing[0].id

    const { data: created, error } = await supabase.from("product_catalog")
      .insert({
        category,
        brand: ["iphone", "ipad", "applewatch", "airpods", "macbook"].includes(category) ? "Apple" : category,
        model: selectedModel.name,
        variant: storage,
        storage,
        color,
        color_hex: formData.colorHex || null,
      })
      .select("id")
      .single()

    if (error) throw error
    return created?.id || null
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error("Sessão expirada. Por favor, saia e entre novamente no sistema.")

      const { data: company, error: companyError } = await supabase.from("companies").select("id").limit(1).single()
      if (companyError || !company?.id) throw new Error("Não foi possível identificar sua empresa.")

      const catalogId = await findOrCreateCatalog()
      let checklistId = null
      if (requiresChecklist) {
        const { data: checklist, error } = await supabase.from("checklists")
          .insert({ company_id: company.id, device_type: category, items: checklistItems })
          .select("id")
          .single()
        if (error) throw error
        checklistId = checklist?.id || null
      }

      const manualName = isManual ? productName : ""
      const attributeSummary = [isAccessory ? null : formData.storage, formData.color].filter(Boolean).join(" · ") || null
      const selectedSupplier = suppliers.find((supplier) => supplier.value === formData.supplier_id)
      const supplierName = formData.supplier_name || selectedSupplier?.label || null
      const notes = manualName || formData.condition_notes || null
      const lifecycleStatus = getComputedInventoryStatus({
        status: "active",
        purchase_price: currencyInputToNumber(formData.purchase_price),
        purchase_date: formData.purchase_date,
        grade: formData.grade || null,
        imei: isAccessory ? null : formData.imei || null,
        serial_number: isAccessory && !formData.accessory_has_serial ? null : formData.serial_number || null,
        catalog_id: catalogId,
        notes,
        condition_notes: formData.condition_notes || notes,
      })

      const { data: createdInventory, error } = await supabase.from("inventory").insert({
        company_id: company.id,
        catalog_id: catalogId,
        imei: isAccessory ? null : formData.imei || null,
        imei2: isAccessory ? null : formData.imei2 || null,
        serial_number: isAccessory && !formData.accessory_has_serial ? null : formData.serial_number || null,
        grade: formData.grade || (isManual ? "Lacrado" : null),
        condition_notes: formData.condition_notes || manualName || null,
        purchase_price: currencyInputToNumber(formData.purchase_price),
        purchase_date: formData.purchase_date,
        supplier_id: formData.type === "supplier" && formData.supplier_id ? formData.supplier_id : null,
        type: formData.type,
        supplier_name: formData.type === "supplier" ? supplierName : null,
        origin: "purchase",
        suggested_price: suggestedPrice || null,
        ios_version: isAccessory ? null : formData.ios_version || null,
        battery_health: isAccessory ? null : isSealedElectronic ? 100 : formData.battery_health ? Number(formData.battery_health) : null,
        notes,
        checklist_id: checklistId,
        quantity: formData.type === "own" ? Math.max(1, Number(formData.quantity || 1)) : 1,
        status: mapLifecycleToLegacyCompatibleStatus(lifecycleStatus),
        product_type: resolvedProductType,
        category_name_snapshot: currentCategory?.label || category,
        subcategory_name_snapshot: isManual ? productName || null : selectedModel?.name || null,
        color_name_snapshot: formData.color || null,
        attribute_summary_snapshot: attributeSummary,
      })
        .select("id")
        .single()

      if (error) throw error
      if (createdInventory?.id) {
        if (operationalImageFile) {
          try {
            await uploadOperationalImage(String(createdInventory.id), operationalImageFile)
          } catch (imageError) {
            await rollbackCreatedInventory({
              inventoryId: String(createdInventory.id),
              checklistId,
            })
            throw imageError
          }
        }
        try {
          await createPurchaseFinanceTransaction({
            inventoryId: String(createdInventory.id),
            supplierName,
          })
        } catch (financeError) {
          await rollbackCreatedInventory({
            inventoryId: String(createdInventory.id),
            checklistId,
          })
          throw financeError
        }
      }

      toast({ title: "Produto cadastrado!", description: `${productName || "Produto"} foi salvo no estoque.`, type: "success" })
      router.push("/estoque")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado"
      toast({ title: "Erro ao cadastrar", description: message, type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = [
    { num: 1, label: "Produto" },
    { num: 2, label: "Valores" },
    { num: 3, label: "Revisão" },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Novo produto</h2>
            <p className="text-sm text-gray-500">Cadastro rápido para aparelhos, acessórios e itens manuais</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {steps.map((item, index) => (
            <div key={item.num} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${item.num < step ? "bg-success-500 text-white" : item.num === step ? "bg-royal-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                {item.num < step ? <Check className="w-4 h-4" /> : item.num}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${item.num <= step ? "text-navy-900" : "text-gray-400"}`}>{item.label}</span>
              {index < steps.length - 1 && <div className={`h-0.5 flex-1 rounded ${item.num < step ? "bg-success-500" : "bg-gray-100"}`} />}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">Tipo e identificação</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => setMode("catalog")} className={`rounded-xl border p-4 text-left transition-all ${mode === "catalog" ? "border-royal-500 bg-royal-100/30" : "border-gray-100 hover:border-gray-200"}`}>
              <p className="font-semibold text-navy-900">Produto do catálogo</p>
              <p className="text-xs text-gray-500 mt-1">iPhone, iPad, Apple Watch, AirPods, MacBook ou Garmin.</p>
            </button>
            <button onClick={() => {
              setMode("manual")
              setFormData((prev) => ({ ...prev, imei: "", imei2: "", battery_health: "", ios_version: "", accessory_has_serial: accessoryUsuallyHasSerial(prev.manual_name) }))
            }} className={`rounded-xl border p-4 text-left transition-all ${mode === "manual" ? "border-royal-500 bg-royal-100/30" : "border-gray-100 hover:border-gray-200"}`}>
              <p className="font-semibold text-navy-900">Acessório / outros</p>
              <p className="text-xs text-gray-500 mt-1">Capas, películas, Apple Pencil, cabos, fontes e itens fora do catálogo.</p>
            </button>
          </div>

          <Select label="Categoria" value={category} onChange={(e) => handleCategoryChange(e.target.value)} options={categoryOptions} />

          {isManual ? (
            <div className="space-y-3">
              <Input label="Nome do produto" placeholder="Ex: Capa para iPad 10ª geração" value={formData.manual_name} onChange={(e) => updateField("manual_name", e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {ACCESSORY_SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => setFormData((prev) => ({ ...prev, manual_name: suggestion, accessory_has_serial: accessoryUsuallyHasSerial(suggestion), serial_number: accessoryUsuallyHasSerial(suggestion) ? prev.serial_number : "" }))} className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:border-royal-500">
                    {suggestion}
                  </button>
                ))}
              </div>
              <label className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-navy-900">
                <input
                  type="checkbox"
                  checked={formData.accessory_has_serial}
                  onChange={(event) => setFormData((prev) => ({ ...prev, accessory_has_serial: event.target.checked, serial_number: event.target.checked ? prev.serial_number : "" }))}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-royal-500"
                />
                <span>
                  <span className="block font-semibold">Este acessório possui serial</span>
                  <span className="mt-1 block text-xs text-gray-500">Use para Apple Pencil, AirPods, Apple Watch, Garmin, Magic Keyboard e similares.</span>
                </span>
              </label>
              {formData.accessory_has_serial ? (
                <Input label="Número de série" placeholder="Serial Number" value={formData.serial_number} onChange={(e) => updateField("serial_number", e.target.value)} />
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <Select label="Modelo" value={modelIdx.toString()} onChange={(e) => setModelIdx(Number(e.target.value))} options={(models as CatalogModelOption[]).map((model, index) => ({ label: model.name, value: index.toString() }))} />
              {!isAccessory && (selectedModel?.storage || selectedModel?.sizes) && (
                <Select label="Armazenamento / tamanho" value={formData.storage} onChange={(e) => updateField("storage", e.target.value)} placeholder="Selecione" options={((selectedModel?.storage || selectedModel?.sizes || []) as string[]).map((value) => ({ label: value, value }))} />
              )}
              <ColorSwatchPicker
                colors={selectedModelColors}
                value={formData.color}
                subtitle={`Cores disponíveis para ${selectedModel?.name || "este modelo"}`}
                onChange={(color) => setFormData((prev) => ({ ...prev, color: color.name, colorHex: color.hex }))}
                onCreateColor={createColor}
                createLabel="Adicionar nova cor ao modelo"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-navy-900 mb-2">Condição</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {GRADES.map((grade) => (
                <button key={grade.value} onClick={() => updateField("grade", grade.value)} className={`shrink-0 px-4 py-2 rounded-xl border text-sm font-bold ${formData.grade === grade.value ? `${grade.color} border-current` : "bg-white text-gray-500 border-gray-200"}`}>
                  {grade.label}
                </button>
              ))}
            </div>
          </div>

          {!isAccessory && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="IMEI 1" placeholder="Opcional para lacrado" value={formData.imei} onChange={(e) => updateField("imei", e.target.value.replace(/\D/g, "").slice(0, 15))} />
              <Input label="IMEI 2" placeholder="Opcional" value={formData.imei2} onChange={(e) => updateField("imei2", e.target.value.replace(/\D/g, "").slice(0, 15))} />
              <Input label="Número de série" placeholder="Serial Number" value={formData.serial_number} onChange={(e) => updateField("serial_number", e.target.value)} />
              <Input label="Software" placeholder="Ex: iOS 18.3" value={formData.ios_version} onChange={(e) => updateField("ios_version", e.target.value)} />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">Valores, condição e estoque</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Origem" value={formData.type} onChange={(e) => updateField("type", e.target.value)} options={[{ label: "Estoque próprio", value: "own" }, { label: "Fornecedor", value: "supplier" }]} />
            {formData.type === "supplier" ? (
              <Input label="Nome do fornecedor" value={formData.supplier_name} onChange={(e) => updateField("supplier_name", e.target.value)} />
            ) : (
              <Input label="Quantidade" type="number" min="1" value={formData.quantity} onChange={(e) => updateField("quantity", Math.max(1, Number(e.target.value || 1)).toString())} />
            )}
            <Input label="Preço de custo (R$)" type="text" inputMode="decimal" value={formData.purchase_price} onChange={(e) => updatePurchasePrice(e.target.value)} placeholder="R$ 0,00" />
            <Input label="Preço sugerido (R$)" type="text" inputMode="decimal" placeholder={suggestedPrice ? formatBRL(suggestedPrice) : "Opcional"} value={formData.suggested_price} onChange={(e) => updateSuggestedPrice(e.target.value)} />
            <Input label="Margem padrão (%)" type="number" min="0" value={formData.margin} onChange={(e) => updateMargin(e.target.value)} />
            <Input label="Data da compra" type="date" value={formData.purchase_date} onChange={(e) => updateField("purchase_date", e.target.value)} />
            {showBatteryField && <Input label="Saúde da bateria (%)" type="number" min="0" max="100" value={formData.battery_health} onChange={(e) => updateField("battery_health", e.target.value)} />}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-surface/60 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-navy-900">Financeiro da compra</p>
                <p className="text-xs text-gray-500">Compra pendente vira conta a pagar. Pago agora entra no extrato após conciliação.</p>
              </div>
              <Badge variant={formData.purchase_finance_mode === "paid_now" ? "green" : formData.purchase_finance_mode === "payable" ? "yellow" : "gray"}>
                {formData.purchase_finance_mode === "paid_now" ? "Pago agora" : formData.purchase_finance_mode === "payable" ? "A pagar" : "Sem financeiro"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Status financeiro"
                value={formData.purchase_finance_mode}
                onChange={(e) => updateField("purchase_finance_mode", e.target.value)}
                options={[
                  { label: "A pagar", value: "payable" },
                  { label: "Pago agora", value: "paid_now" },
                  { label: "Não lançar financeiro", value: "none" },
                ]}
              />
              {formData.purchase_finance_mode !== "none" && (
                <Select
                  label="Forma de pagamento"
                  value={formData.purchase_payment_method}
                  onChange={(e) => updateField("purchase_payment_method", e.target.value)}
                  options={["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Transferência"].map((value) => ({ label: value, value }))}
                />
              )}
              {formData.purchase_finance_mode === "payable" && (
                <Input label="Vencimento da conta" type="date" value={formData.purchase_due_date} onChange={(e) => updateField("purchase_due_date", e.target.value)} />
              )}
              {formData.purchase_finance_mode === "paid_now" && (
                <Select
                  label="Conta financeira"
                  value={formData.purchase_account_id}
                  onChange={(e) => updateField("purchase_account_id", e.target.value)}
                  options={financeAccounts.length ? financeAccounts : [{ label: "Nenhuma conta ativa encontrada", value: "" }]}
                />
              )}
              {formData.purchase_finance_mode !== "none" && (
                <div className="sm:col-span-2">
                  <Textarea label="Observação financeira" placeholder="Ex: combinado com fornecedor, prazo, comprovante..." value={formData.purchase_financial_notes} onChange={(e) => updateField("purchase_financial_notes", e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <Textarea label="Observações" placeholder="Estado físico, riscos, marcas de uso, detalhes do item..." value={formData.condition_notes} onChange={(e) => updateField("condition_notes", e.target.value)} />

          <div className="rounded-2xl border border-gray-100 bg-surface/60 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-royal-500/10 text-royal-600">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900">Imagem operacional</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Opcional. Será salva no item criado e usada no estoque, venda, portal do cliente e documentos.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-white">
                {operationalImagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={operationalImagePreviewUrl} alt="Prévia da imagem operacional" className="h-full w-full object-contain p-2" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-gray-300" />
                )}
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl border border-royal-100 bg-royal-50/70 p-3 text-xs font-medium leading-5 text-royal-800">
                  Isso não altera catálogo público, vitrine pública ou central de divulgação.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => operationalImageInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    Selecionar imagem operacional
                  </Button>
                  {operationalImageFile ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateOperationalImageFile(null)}>
                      <X className="h-4 w-4" />
                      Remover imagem
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500">{operationalImageFile ? operationalImageFile.name : "JPG, PNG, WebP ou HEIC. Máximo 10MB."}</p>
              </div>
            </div>
            <input
              ref={operationalImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
              className="hidden"
              onChange={(event) => updateOperationalImageFile(event.target.files?.[0] || null)}
            />
          </div>

          {suggestedPrice > 0 && (
            <div className="rounded-xl bg-surface p-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">Preço sugerido calculado</span>
              <span className="text-lg font-bold text-navy-900">{formatBRL(suggestedPrice)}</span>
            </div>
          )}

          {requiresChecklist && (
            <div className="space-y-3 rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-navy-900">Checklist técnico</p>
                  <p className="text-xs text-gray-500">Obrigatório para iPhone/iPad seminovo.</p>
                </div>
                <Badge variant={checklistProgress >= 80 ? "green" : "yellow"}>{checklistProgress}%</Badge>
              </div>
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {checklistItems.map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-sm font-medium text-navy-900">{item.label}</p>
                      <div className="flex gap-2">
                        {["ok", "fail", "na"].map((status) => (
                          <button key={status} onClick={() => updateChecklistItem(index, status)} className={`px-3 py-1 rounded-lg text-xs font-bold border ${item.status === status ? "bg-navy-900 text-white border-navy-900" : "bg-white text-gray-500 border-gray-200"}`}>
                            {status === "ok" ? "OK" : status === "fail" ? "Falha" : "N/A"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {item.status === "fail" && <Input className="mt-2" placeholder="Observação da falha" value={item.note} onChange={(e) => updateChecklistItem(index, item.status, e.target.value)} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-navy-900 font-syne">Revisão</h3>
          <div className="rounded-2xl bg-surface p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-royal-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-royal-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-navy-900">{productName || "Produto sem nome"}</p>
              <p className="text-sm text-gray-500">{currentCategory?.label || category} · {formData.grade}</p>
              <p className="text-sm text-gray-500">{formData.imei ? `IMEI ${formData.imei}` : formData.serial_number ? `Serial ${formData.serial_number}` : "Sem IMEI/serial"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-xs text-gray-500">Custo</p>
              <p className="font-bold text-navy-900">{formatBRL(currencyInputToNumber(formData.purchase_price))}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-xs text-gray-500">Sugerido</p>
              <p className="font-bold text-navy-900">{formatBRL(suggestedPrice)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-xs text-gray-500">Checklist</p>
              <p className="font-bold text-navy-900">{requiresChecklist ? `${checklistProgress}%` : "Não exigido"}</p>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-gray-500">Financeiro</p>
            <p className="font-bold text-navy-900">
              {formData.purchase_finance_mode === "paid_now"
                ? `Pago agora · ${formatBRL(totalPurchaseCost())}`
                : formData.purchase_finance_mode === "payable"
                  ? `Conta a pagar · ${formatBRL(totalPurchaseCost())}`
                  : "Não lançar financeiro"}
            </p>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
        <Button variant="ghost" disabled={step === 1 || isSubmitting} onClick={() => setStep((prev) => Math.max(1, prev - 1) as Step)}>
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        {step < 3 ? (
          <Button variant="primary" disabled={!canProceed} onClick={() => setStep((prev) => Math.min(3, prev + 1) as Step)}>
            Próximo <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="success" disabled={!canProceed} isLoading={isSubmitting} onClick={handleSubmit}>
            <Save className="w-4 h-4" /> Salvar produto
          </Button>
        )}
      </div>
    </div>
  )
}
