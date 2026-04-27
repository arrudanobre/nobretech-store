"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Package, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { formatBRL, getComputedInventoryStatus, mapLifecycleToLegacyCompatibleStatus } from "@/lib/helpers"
import { CATEGORIES, CHECKLIST_TEMPLATES, GRADES, PRODUCT_CATALOG } from "@/lib/constants"

type Step = 1 | 2 | 3
type ProductMode = "catalog" | "manual"

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

const categoryOptions = CATEGORIES.map((category) => ({ label: category.label, value: category.value }))

export default function AddProductPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState<Step>(1)
  const [mode, setMode] = useState<ProductMode>("catalog")
  const [category, setCategory] = useState("iphone")
  const [modelIdx, setModelIdx] = useState(0)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [formData, setFormData] = useState({
    manual_name: "",
    storage: "",
    color: "",
    colorHex: "",
    grade: "Lacrado",
    imei: "",
    imei2: "",
    serial_number: "",
    ios_version: "",
    battery_health: "",
    condition_notes: "",
    supplier_id: "",
    type: "own",
    supplier_name: "",
    purchase_date: new Date().toISOString().split("T")[0],
    purchase_price: "",
    suggested_price: "",
    margin: "15",
    quantity: "1",
  })

  const models = useMemo(() => {
    const cat = PRODUCT_CATALOG[category as keyof typeof PRODUCT_CATALOG]
    return cat ? cat.models : []
  }, [category])

  const selectedModel = models[modelIdx] as any
  const isManual = mode === "manual"
  const isSealedElectronic = mode === "catalog" && ["iphone", "ipad", "applewatch"].includes(category) && formData.grade === "Lacrado"
  const showBatteryField = !isManual && !isSealedElectronic
  const productName = useMemo(() => {
    if (isManual) return formData.manual_name.trim()
    const parts = [selectedModel?.name, formData.storage, formData.color].filter(Boolean)
    return parts.join(" ").trim()
  }, [isManual, formData.manual_name, formData.storage, formData.color, selectedModel?.name])

  const suggestedPrice = useMemo(() => {
    const manual = Number(formData.suggested_price || 0)
    if (manual > 0) return manual
    const cost = Number(formData.purchase_price || 0)
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
      return Boolean(category && selectedModel && (formData.storage || !(selectedModel.storage || selectedModel.sizes)) && (formData.color || !selectedModel.colors))
    }
    if (step === 2) {
      const hasValues = Number(formData.purchase_price || 0) > 0 && Boolean(formData.purchase_date) && Number(formData.quantity || 0) > 0
      return hasValues && (!requiresChecklist || checklistProgress >= 80)
    }
    return true
  }, [step, isManual, formData, category, selectedModel, requiresChecklist, checklistProgress])

  useEffect(() => {
    async function fetchSuppliers() {
      const { data } = await (supabase.from("suppliers") as any).select("id, name, city").order("name", { ascending: true })
      setSuppliers((data || []).map((supplier: any) => ({
        label: `${supplier.name}${supplier.city ? ` - ${supplier.city}` : ""}`,
        value: supplier.id,
      })))
    }
    fetchSuppliers()
  }, [])

  useEffect(() => {
    if (!requiresChecklist) {
      setChecklistItems([])
      return
    }
    const template = CHECKLIST_TEMPLATES[category as keyof typeof CHECKLIST_TEMPLATES] || []
    setChecklistItems(template.map((item: any) => ({ ...item, status: item.status || "", note: item.note || "" })))
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
      const cost = Number(value || 0)
      const margin = Number(prev.margin || 0)
      return {
        ...prev,
        purchase_price: value,
        suggested_price: cost > 0 ? Math.ceil(cost * (1 + margin / 100)).toString() : "",
      }
    })
  }

  const updateMargin = (value: string) => {
    setFormData((prev) => {
      const cost = Number(prev.purchase_price || 0)
      const margin = Number(value || 0)
      return {
        ...prev,
        margin: value,
        suggested_price: cost > 0 ? Math.ceil(cost * (1 + margin / 100)).toString() : prev.suggested_price,
      }
    })
  }

  const updateSuggestedPrice = (value: string) => {
    setFormData((prev) => {
      const cost = Number(prev.purchase_price || 0)
      const price = Number(value || 0)
      return {
        ...prev,
        suggested_price: value,
        margin: cost > 0 && price > 0 ? Math.max(0, ((price / cost) - 1) * 100).toFixed(2) : prev.margin,
      }
    })
  }

  const handleCategoryChange = (value: string) => {
    setCategory(value)
    setModelIdx(0)
    setFormData((prev) => ({ ...prev, storage: "", color: "", colorHex: "" }))
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
    const storage = formData.storage || null
    const color = formData.color || null
    const { data: existing } = await (supabase.from("product_catalog") as any)
      .select("id")
      .eq("category", category)
      .eq("model", selectedModel.name)
      .eq("storage", storage)
      .eq("color", color)
      .limit(1)

    if (existing?.[0]?.id) return existing[0].id

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

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error("Sessão expirada. Por favor, saia e entre novamente no sistema.")

      const { data: company, error: companyError } = await (supabase.from("companies") as any).select("id").limit(1).single()
      if (companyError || !company?.id) throw new Error("Não foi possível identificar sua empresa.")

      await (supabase.from("users") as any).upsert({
        id: session.user.id,
        company_id: company.id,
        role: "owner",
        full_name: session.user.email,
      } as any, { onConflict: "id" })

      const catalogId = await findOrCreateCatalog()
      let checklistId = null
      if (requiresChecklist) {
        const { data: checklist, error } = await (supabase.from("checklists") as any)
          .insert({ company_id: company.id, device_type: category, items: checklistItems } as any)
          .select("id")
          .single()
        if (error) throw error
        checklistId = checklist?.id || null
      }

      const manualName = isManual ? productName : ""
      const selectedSupplier = suppliers.find((supplier) => supplier.value === formData.supplier_id)
      const supplierName = formData.supplier_name || selectedSupplier?.label || null
      const notes = manualName || formData.condition_notes || null
      const lifecycleStatus = getComputedInventoryStatus({
        status: "active",
        purchase_price: Number(formData.purchase_price || 0),
        purchase_date: formData.purchase_date,
        grade: formData.grade || null,
        imei: formData.imei || null,
        serial_number: formData.serial_number || null,
        catalog_id: catalogId,
        notes,
        condition_notes: formData.condition_notes || notes,
      })

      const { error } = await (supabase.from("inventory") as any).insert({
        company_id: company.id,
        catalog_id: catalogId,
        imei: formData.imei || null,
        imei2: formData.imei2 || null,
        serial_number: formData.serial_number || null,
        grade: formData.grade || (isManual ? "Lacrado" : null),
        condition_notes: formData.condition_notes || manualName || null,
        purchase_price: Number(formData.purchase_price),
        purchase_date: formData.purchase_date,
        supplier_id: formData.type === "supplier" && formData.supplier_id ? formData.supplier_id : null,
        type: formData.type,
        supplier_name: formData.type === "supplier" ? supplierName : null,
        origin: "purchase",
        suggested_price: suggestedPrice || null,
        ios_version: formData.ios_version || null,
        battery_health: isSealedElectronic ? 100 : formData.battery_health ? Number(formData.battery_health) : null,
        notes,
        checklist_id: checklistId,
        quantity: formData.type === "own" ? Math.max(1, Number(formData.quantity || 1)) : 1,
        status: mapLifecycleToLegacyCompatibleStatus(lifecycleStatus),
      } as any)

      if (error) throw error

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
            <button onClick={() => setMode("manual")} className={`rounded-xl border p-4 text-left transition-all ${mode === "manual" ? "border-royal-500 bg-royal-100/30" : "border-gray-100 hover:border-gray-200"}`}>
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
                  <button key={suggestion} onClick={() => updateField("manual_name", suggestion)} className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:border-royal-500">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Select label="Modelo" value={modelIdx.toString()} onChange={(e) => setModelIdx(Number(e.target.value))} options={models.map((model: any, index) => ({ label: model.name, value: index.toString() }))} />
              {(selectedModel?.storage || selectedModel?.sizes) && (
                <Select label="Armazenamento / tamanho" value={formData.storage} onChange={(e) => updateField("storage", e.target.value)} placeholder="Selecione" options={(selectedModel.storage || selectedModel.sizes).map((value: string) => ({ label: value, value }))} />
              )}
              {selectedModel?.colors && (
                <div>
                  <label className="block text-sm font-medium text-navy-900 mb-2">Cor</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedModel.colors.map((color: { name: string; hex: string }) => (
                      <button key={color.name} onClick={() => setFormData((prev) => ({ ...prev, color: color.name, colorHex: color.hex }))} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${formData.color === color.name ? "border-royal-500 ring-2 ring-royal-500/20" : "border-gray-200 hover:border-gray-300"}`}>
                        <span className="w-5 h-5 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }} />
                        {color.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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

          {!isManual && (
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
            <Input label="Preço de custo (R$)" type="number" min="0" value={formData.purchase_price} onChange={(e) => updatePurchasePrice(e.target.value)} />
            <Input label="Preço sugerido (R$)" type="number" min="0" placeholder={suggestedPrice ? suggestedPrice.toString() : "Opcional"} value={formData.suggested_price} onChange={(e) => updateSuggestedPrice(e.target.value)} />
            <Input label="Margem padrão (%)" type="number" min="0" value={formData.margin} onChange={(e) => updateMargin(e.target.value)} />
            <Input label="Data da compra" type="date" value={formData.purchase_date} onChange={(e) => updateField("purchase_date", e.target.value)} />
            {showBatteryField && <Input label="Saúde da bateria (%)" type="number" min="0" max="100" value={formData.battery_health} onChange={(e) => updateField("battery_health", e.target.value)} />}
          </div>

          <Textarea label="Observações" placeholder="Estado físico, riscos, marcas de uso, detalhes do item..." value={formData.condition_notes} onChange={(e) => updateField("condition_notes", e.target.value)} />

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
              <p className="text-sm text-gray-500">{CATEGORIES.find((item) => item.value === category)?.label} · {formData.grade}</p>
              <p className="text-sm text-gray-500">{formData.imei ? `IMEI ${formData.imei}` : formData.serial_number ? `Serial ${formData.serial_number}` : "Sem IMEI/serial"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-xs text-gray-500">Custo</p>
              <p className="font-bold text-navy-900">{formatBRL(Number(formData.purchase_price || 0))}</p>
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
