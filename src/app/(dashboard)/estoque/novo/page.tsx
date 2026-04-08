"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { buildPriceTable, formatBRL } from "@/lib/helpers"
import { PRODUCT_CATALOG, CHECKLIST_TEMPLATES, CATEGORIES, GRADES } from "@/lib/constants"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Camera,
  Plus,
  Trash2,
  Smartphone,
  TabletSmartphone,
  Monitor,
  Headphones,
  Watch,
  MapPinned,
} from "lucide-react"

const categoryIcons: Record<string, React.ElementType> = {
  iphone: Smartphone,
  ipad: TabletSmartphone,
  applewatch: Watch,
  airpods: Headphones,
  macbook: Monitor,
  garmin: MapPinned,
}

type Step = 1 | 2 | 3 | 4 | 5

export default function AddProductPage() {
  const [step, setStep] = useState<Step>(1)
  const [category, setCategory] = useState<string>("")
  const [modelIdx, setModelIdx] = useState(0)
  const [formData, setFormData] = useState({
    storage: "",
    color: "",
    colorHex: "",
    grade: "",
    imei: "",
    imei2: "",
    serial_number: "",
    ios_version: "",
    battery_health: "",
    condition_notes: "",
    supplier_id: "",
    purchase_date: "",
    purchase_price: "",
    margin: "15",
  })
  const [photos, setPhotos] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [checklistItems, setChecklistItems] = useState<Array<{ id: string; label: string; status: string; note: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)

  const { toast } = useToast()
  const router = useRouter()

  const models = useMemo(() => {
    const cat = PRODUCT_CATALOG[category as keyof typeof PRODUCT_CATALOG]
    return cat ? cat.models : []
  }, [category])

  const selectedModel = models[modelIdx]

  const priceTable = useMemo(() => {
    const cost = parseFloat(formData.purchase_price)
    const margin = parseFloat(formData.margin)
    if (!cost || !margin) return []
    return buildPriceTable(cost, margin, {})
  }, [formData.purchase_price, formData.margin])

  const checklistProgress = useMemo(() => {
    const completed = checklistItems.filter((i) => i.status === "ok" || i.status === "fail").length
    const total = checklistItems.length
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }, [checklistItems])

  const updateField = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleSelectColor = useCallback((name: string, hex: string) => {
    updateField("color", name)
    updateField("colorHex", hex)
  }, [updateField])

  const handleSelectStorage = useCallback((s: string) => {
    updateField("storage", s)
  }, [updateField])

  const handleSelectGrade = useCallback((g: string) => {
    updateField("grade", g)
  }, [updateField])

  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setModelIdx(0)
    updateField("storage", "")
    updateField("color", "")
    updateField("colorHex", "")
  }

  const handleModelChange = (idx: string) => {
    setModelIdx(parseInt(idx))
    updateField("storage", "")
    updateField("color", "")
    updateField("colorHex", "")
  }

  const loadChecklist = () => {
    const template = CHECKLIST_TEMPLATES[category] || []
    setChecklistItems(template.map((t) => ({ ...t, note: t.note || "" })))
  }

  const updateChecklistItem = (idx: number, status: string, note?: string) => {
    setChecklistItems((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], status, note: note ?? updated[idx].note }
      return updated
    })
  }

  const handlePhotos = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setPhotos((prev) => [...prev, ev.target!.result as string])
        }
      }
      reader.readAsDataURL(file)
    })

    // Reset input so same file can be selected again
    e.target.value = ""
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const canProceed = useMemo(() => {
    switch (step) {
      case 1:
        return selectedModel && formData.storage && formData.color && formData.grade && formData.imei && formData.serial_number
      case 2:
        return formData.purchase_price && formData.purchase_date
      case 3:
        return photos.length >= 1
      case 4:
        return checklistProgress >= 80
      case 5:
        return true
      default:
        return true
    }
  }, [step, selectedModel, formData, photos, checklistProgress])

  const prevStep = () => setStep((s) => Math.max(1, s - 1) as Step)
  const nextStep = () => {
    if (step === 3 && checklistItems.length === 0) {
      loadChecklist()
    }
    setStep((s) => Math.min(5, s + 1) as Step)
  }

  // Load suppliers from database
  useEffect(() => {
    async function fetchSuppliers() {
      setLoadingSuppliers(true)
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, city")
        .order("name", { ascending: true })
      
      if (!error && data) {
        setSuppliers(data.map(s => ({
          label: `${s.name}${s.city ? ` — ${s.city}` : ""}`,
          value: s.id
        })))
      }
      setLoadingSuppliers(false)
    }
    fetchSuppliers()
  }, [])

  const handleSubmit = async () => {
    setIsSubmitting(true)

    const suggestedPrice = priceTable.length > 0 ? priceTable[0].price : 0

    try {
      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        throw new Error("Não autenticado. Faça login novamente.")
      }

      // Get company ID
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .single()

      if (!company?.id) {
        throw new Error("Empresa não encontrada no banco")
      }

      // Ensure user record exists
      const { error: userError } = await (supabase.from("users") as any).upsert({
        id: session.user.id,
        company_id: company.id,
        role: "owner",
        full_name: session.user.email,
      } as any, {
        onConflict: "id",
      })

      if (userError) throw userError

      // Insert checklist
      const { data: checklist, error: checklistError } = await (supabase.from("checklists") as any).insert({
        company_id: company.id,
        device_type: category,
        items: checklistItems,
      } as any).select().single()

      if (checklistError) throw checklistError

      // Find or create product catalog entry
      const { data: catalogEntries } = await supabase
        .from("product_catalog")
        .select("id")
        .eq("category", category)
        .eq("model", selectedModel.name)
        .eq("storage", formData.storage)
        .eq("color", formData.color)

      let catalogId = null
      if (catalogEntries && catalogEntries.length > 0) {
        catalogId = catalogEntries[0].id
      } else {
        const { data: newCatalog } = await (supabase.from("product_catalog") as any).insert({
          category,
          brand: "Apple",
          model: selectedModel.name,
          variant: formData.storage,
          storage: formData.storage,
          color: formData.color,
          color_hex: formData.colorHex,
        } as any).select("id").single()

        catalogId = (newCatalog as any)?.id
      }

      // Insert inventory
      const { error: inventoryError } = await (supabase.from("inventory") as any).insert({
        company_id: company.id,
        catalog_id: catalogId,
        imei: formData.imei,
        serial_number: formData.serial_number,
        imei2: formData.imei2 || null,
        grade: formData.grade,
        condition_notes: formData.condition_notes || null,
        purchase_price: parseFloat(formData.purchase_price),
        purchase_date: formData.purchase_date,
        suggested_price: suggestedPrice,
        photos: photos.length > 0 ? photos : null,
        ios_version: formData.ios_version || null,
        battery_health: formData.battery_health ? parseInt(formData.battery_health) : null,
        notes: formData.condition_notes || null,
        checklist_id: (checklist as any)?.id,
        status: "in_stock",
      } as any)

      if (inventoryError) throw inventoryError

      toast({
        title: "Aparelho cadastrado!",
        description: "O produto foi salvo no estoque com sucesso.",
        type: "success",
      })
      router.push("/estoque")
    } catch (error) {
      // Extract real Supabase error message
      const msg = error && typeof error === "object" && "message" in error
        ? (error as any).message
        : error && typeof error === "object" && "msg" in error
        ? (error as any).msg
        : error instanceof Error ? error.message : JSON.stringify(error)

      toast({
        title: "Erro ao cadastrar",
        description: msg,
        type: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const productName = selectedModel
    ? `${selectedModel.name}${formData.storage ? " " + formData.storage : ""}`
    : ""

  const stepLabels = ["Produto", "Compra", "Fotos", "Checklist", "Revisão"]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stepper */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center gap-1 flex-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  s < step
                    ? "bg-success-500 text-white"
                    : s === step
                    ? "bg-royal-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap hidden sm:inline ${
                  s <= step ? "text-navy-900" : "text-gray-400"
                }`}
              >
                {stepLabels[s - 1]}
              </span>
              {s < 5 && (
                <div
                  className={`flex-1 h-0.5 rounded min-w-[8px] ${
                    s < step ? "bg-success-500" : "bg-gray-100"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-center md:hidden">
          <span className="text-sm font-medium text-navy-900">
            Passo {step}: {stepLabels[step - 1]}
          </span>
        </div>
      </div>

      {/* ── Step 1: Device Info ──────────────────────────────── */}
      {step === 1 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">Dados do Aparelho</h3>

          {/* Category selector */}
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-2">Categoria</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((c) => {
                const Icon = categoryIcons[c.value]
                return (
                  <button
                    key={c.value}
                    onClick={() => handleCategoryChange(c.value)}
                    className={`shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition-colors min-w-[80px] ${
                      category === c.value
                        ? "bg-navy-900 text-white border-navy-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-royal-500"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model selector */}
          {category && (
            <>
              <Select
                label="Modelo"
                placeholder="Selecione o modelo"
                value={modelIdx.toString()}
                onChange={(e) => handleModelChange(e.target.value)}
                options={models.map((m, i) => ({ label: m.name, value: i.toString() }))}
              />

              {/* Color swatches */}
              {selectedModel && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-navy-900 mb-2">Cor</label>
                    <div className="flex flex-wrap gap-2">
                      {(selectedModel as any).colors?.map((c: { name: string; hex: string }) => (
                        <button
                          key={c.name}
                          onClick={() => handleSelectColor(c.name, c.hex)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                            formData.color === c.name
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

                  {/* Storage chips */}
                  {(selectedModel as any).storage && (
                    <div>
                      <label className="block text-sm font-medium text-navy-900 mb-2">Armazenamento</label>
                      <div className="flex flex-wrap gap-2">
                        {(selectedModel as any).storage.map((s: string) => (
                          <button
                            key={s}
                            onClick={() => handleSelectStorage(s)}
                            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                              formData.storage === s
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

                  {/* Size chips for watches */}
                  {(selectedModel as any).sizes && (
                    <div>
                      <label className="block text-sm font-medium text-navy-900 mb-2">Tamanho</label>
                      <div className="flex flex-wrap gap-2">
                        {(selectedModel as any).sizes.map((s: string) => (
                          <button
                            key={s}
                            onClick={() => handleSelectStorage(s)}
                            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                              formData.storage === s
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
                </>
              )}
            </>
          )}

          {/* Grade */}
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-2">Grade (ABEC)</label>
            <div className="flex gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  onClick={() => handleSelectGrade(g.value)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${
                    formData.grade === g.value
                      ? g.color + " border-current"
                      : "bg-white text-gray-400 border-gray-200"
                  }`}
                >
                  {g.value}
                </button>
              ))}
            </div>
          </div>

          {/* IMEI, Serial, iOS, Battery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="IMEI 1"
              placeholder="15 dígitos"
              value={formData.imei}
              onChange={(e) => updateField("imei", e.target.value.replace(/\D/g, "").slice(0, 15))}
            />
            <Input
              label="IMEI 2 (Dual SIM)"
              placeholder="Opcional"
              value={formData.imei2}
              onChange={(e) => updateField("imei2", e.target.value.replace(/\D/g, "").slice(0, 15))}
            />
            <Input
              label="Nº de Série"
              placeholder="Serial Number"
              value={formData.serial_number}
              onChange={(e) => updateField("serial_number", e.target.value)}
            />
            <Input
              label="Versão do Software"
              placeholder="Ex: 18.3, watchOS 10"
              value={formData.ios_version}
              onChange={(e) => updateField("ios_version", e.target.value)}
            />
            <Input
              label="Saúde da Bateria (%)"
              placeholder="Ex: 94"
              type="number"
              min="0"
              max="100"
              value={formData.battery_health}
              onChange={(e) => updateField("battery_health", e.target.value)}
            />
          </div>

          <Textarea
            label="Observações de Condição"
            placeholder="Descreva o estado físico, riscos, marcas de uso..."
            value={formData.condition_notes}
            onChange={(e) => updateField("condition_notes", e.target.value)}
          />
        </div>
      )}

      {/* ── Step 2: Purchase ───────────────────────────────────── */}
      {step === 2 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">Dados da Compra</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Fornecedor"
              placeholder={loadingSuppliers ? "Carregando..." : "Selecione"}
              options={suppliers}
              value={formData.supplier_id}
              onChange={(e) => updateField("supplier_id", e.target.value)}
            />
            <Input
              label="Data da Compra"
              type="date"
              value={formData.purchase_date}
              onChange={(e) => updateField("purchase_date", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 mb-1.5">Preço de Custo (R$)</label>
            <Input
              type="number"
              placeholder="0,00"
              value={formData.purchase_price}
              onChange={(e) => updateField("purchase_price", e.target.value)}
            />
          </div>

          {/* Margin slider */}
          {formData.purchase_price && (
            <div className="bg-surface rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-navy-900">Margem Desejada</label>
                <Badge variant="blue">{formData.margin}%</Badge>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={formData.margin}
                onChange={(e) => updateField("margin", e.target.value)}
                className="w-full accent-royal-500"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>5%</span>
                <span>50%</span>
              </div>
            </div>
          )}

          {/* Price Table */}
          {priceTable.length > 0 && (
            <div className="bg-surface rounded-xl overflow-hidden">
              <h4 className="text-sm font-semibold text-navy-900 px-4 pt-3 pb-2">Tabela de Preços Sugeridos</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">Forma</th>
                    <th className="px-4 py-2 font-medium text-right">Preço</th>
                    <th className="px-4 py-2 font-medium text-right">Parcelas</th>
                  </tr>
                </thead>
                <tbody>
                  {priceTable.map((row) => (
                    <tr
                      key={row.method}
                      className="border-b border-gray-50 hover:bg-white/50"
                    >
                      <td className="px-4 py-2.5 font-medium text-navy-900">{row.label}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-navy-900">
                        {formatBRL(row.price)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">
                        {row.installments > 1
                          ? `${row.installments}x de ${formatBRL(row.installmentValue)}`
                          : "À vista"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Photos ───────────────────────────────────── */}
      {step === 3 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-navy-900 font-syne">Fotos do Aparelho</h3>
            <Badge variant={photos.length >= 1 ? "green" : "red"}>
              {photos.length} foto{photos.length !== 1 ? "s" : ""}
              {photos.length < 1 && " (mínimo 1)"}
            </Badge>
          </div>

          {/* Upload zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={handlePhotos}
            className="w-full border-2 border-dashed border-gray-200 hover:border-royal-500 rounded-2xl p-8 transition-colors flex flex-col items-center gap-2"
          >
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
              <Camera className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-navy-900">Tirar foto ou escolher da galeria</p>
            <p className="text-xs text-gray-400">JPEG, PNG ou WEBP — máx. 10MB</p>
          </button>

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((photo, i) => (
                <div key={i} className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden group">
                  <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-danger-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Checklist ──────────────────────────── */}
      {step === 4 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-navy-900 font-syne">
              Checklist — {productName || category}
            </h3>
            <Badge
              variant={checklistProgress >= 80 ? "green" : checklistProgress >= 50 ? "yellow" : "red"}
            >
              {checklistProgress}%
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                checklistProgress >= 80 ? "bg-success-500" : checklistProgress >= 50 ? "bg-warning-500" : "bg-danger-500"
              }`}
              style={{ width: `${checklistProgress}%` }}
            />
          </div>
          {checklistProgress < 80 && (
            <p className="text-xs text-danger-500 font-medium">
              ⚠️ Complete pelo menos 80% do checklist para prosseguir
            </p>
          )}

          {/* Items */}
          <div className="space-y-2">
            {checklistItems.map((item, idx) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 transition-colors ${
                  item.status === "ok"
                    ? "bg-success-100/30 border-success-500/20"
                    : item.status === "fail"
                    ? "bg-danger-100/30 border-danger-500/20"
                    : "bg-white border-gray-100"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-navy-900 flex-1">{item.label}</p>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => updateChecklistItem(idx, "ok")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        item.status === "ok"
                          ? "bg-success-500 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-success-100 hover:text-success-500"
                      }`}
                    >
                      ✓ OK
                    </button>
                    <button
                      onClick={() => updateChecklistItem(idx, "fail")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        item.status === "fail"
                          ? "bg-danger-500 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-danger-100 hover:text-danger-500"
                      }`}
                    >
                      ✕ Falha
                    </button>
                    <button
                      onClick={() => updateChecklistItem(idx, "na")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        item.status === "na"
                          ? "bg-gray-500 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      — N/A
                    </button>
                  </div>
                </div>
                {item.status === "fail" && (
                  <input
                    type="text"
                    placeholder="Descreva o problema..."
                    className="mt-2 w-full px-3 py-2 text-xs bg-white rounded-lg border border-danger-200 focus:outline-none focus:ring-2 focus:ring-danger-500/20"
                    value={item.note}
                    onChange={(e) => updateChecklistItem(idx, "fail", e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 5: Review ─────────────────────────────────── */}
      {step === 5 && (
        <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne">Revisão e Confirmação</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Produto</h4>
              <p className="font-semibold text-navy-900">{productName}</p>
              <p className="text-sm text-gray-500">
                {[formData.color, formData.storage].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-gray-400 mt-1">IMEI: {formData.imei}</p>
              <Badge className="mt-2">{formData.grade}</Badge>
            </div>
            <div className="bg-surface rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Compra</h4>
              <p className="font-semibold text-navy-900">{formatBRL(parseFloat(formData.purchase_price))}</p>
              <p className="text-sm text-gray-500">Margem: {formData.margin}%</p>
              <p className="text-sm text-royal-500 font-semibold">
                Sugerido: {priceTable.length > 0 ? formatBRL(priceTable[0].price) : "—"}
              </p>
            </div>
          </div>

          {/* Checklist summary */}
          <div className="bg-surface rounded-xl p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Checklist</h4>
            <p className="text-sm text-navy-900">
              {checklistItems.filter((i) => i.status === "ok").length} OK ·{" "}
              {checklistItems.filter((i) => i.status === "fail").length} Falhas ·{" "}
              {checklistItems.filter((i) => i.status === "na").length} N/A
            </p>
          </div>
        </div>
      )}

      {/* ── Navigation ──────────────────────────── */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-gray-100 p-3 shadow-sm">
        <Button
          variant="ghost"
          onClick={step > 1 ? prevStep : () => router.back()}
        >
          <ArrowLeft className="w-4 h-4" />
          {step > 1 ? "Anterior" : "Voltar"}
        </Button>
        <span className="text-xs text-gray-400 hidden sm:inline">
          Passo {step} de 5
        </span>
        {step < 5 ? (
          <Button onClick={nextStep} disabled={!canProceed}>
            Próximo <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Salvar Aparelho
          </Button>
        )}
      </div>
    </div>
  )
}
