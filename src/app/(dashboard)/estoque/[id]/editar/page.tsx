"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { CATEGORIES, GRADES } from "@/lib/constants"
import { ArrowLeft, Loader2, Save, Camera, X } from "lucide-react"

const STATUS_OPTIONS = [
  { value: "in_stock", label: "Disponível" },
  { value: "sold", label: "Vendido" },
  { value: "under_repair", label: "Em reparo" },
  { value: "returned", label: "Devolvido" },
  { value: "trade_in_received", label: "Trade-In" },
]

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const productId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [catalogName, setCatalogName] = useState("")
  const [formData, setFormData] = useState({
    imei: "",
    serial_number: "",
    grade: "",
    status: "in_stock",
    purchase_price: "",
    suggested_price: "",
    purchase_date: "",
    battery_health: "",
    ios_version: "",
    condition_notes: "",
  })
  const [photos, setPhotos] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    e.target.value = ""
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
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
      setCatalogName(`IMEI ...${(item.imei || "N/A").slice(-4)}`)

      setFormData({
        imei: item.imei || "",
        serial_number: item.serial_number || "",
        grade: item.grade || "",
        status: item.status || "in_stock",
        purchase_price: item.purchase_price?.toString() || "",
        suggested_price: item.suggested_price?.toString() || "",
        purchase_date: item.purchase_date || "",
        battery_health: item.battery_health?.toString() || "",
        ios_version: item.ios_version || "",
        condition_notes: item.condition_notes || "",
      })

      if (item.photos && Array.isArray(item.photos)) {
        setPhotos(item.photos)
      }

      if (item.catalog_id) {
        const { data: catData } = await (supabase.from("product_catalog") as any)
          .select("*")
          .eq("id", item.catalog_id)
          .single()

        if (catData) {
          setCatalogName(`${catData.model}${catData.variant ? " " + catData.variant : ""} ${catData.storage || ""} ${catData.color || ""}`)
        }
      }
    } catch (err) {
      toast({ title: "Erro ao carregar produto", type: "error" })
    } finally {
      setLoading(false)
    }
  }, [productId, router, toast])

  useEffect(() => {
    fetchProduct()
  }, [fetchProduct])

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updateData: Record<string, any> = {
        imei: formData.imei || null,
        serial_number: formData.serial_number || null,
        grade: formData.grade || null,
        status: formData.status,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        suggested_price: formData.suggested_price ? parseFloat(formData.suggested_price) : null,
        purchase_date: formData.purchase_date,
        battery_health: formData.battery_health ? parseInt(formData.battery_health) : null,
        ios_version: formData.ios_version || null,
        condition_notes: formData.condition_notes || null,
        photos: photos.length > 0 ? photos : null,
      }

      const { error } = await (supabase.from("inventory") as any)
        .update(updateData)
        .eq("id", productId)

      if (error) throw error

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
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-display font-bold text-navy-900 font-syne">{catalogName}</h2>
            <p className="text-sm text-gray-500">Editar informações do produto</p>
          </div>
        </div>
        <Button variant="primary" onClick={handleSave} isLoading={saving}>
          <Save className="w-4 h-4" /> Salvar
        </Button>
      </div>

      {/* Form */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-4">
        {/* Status */}
        <Select
          label="Status"
          value={formData.status}
          onChange={(e) => updateField("status", e.target.value)}
          options={STATUS_OPTIONS}
        />

        {/* IMEI / Serial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        </div>

        {/* Grade / Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-2">Grade (ABEC)</label>
            <div className="flex gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  onClick={() => updateField("grade", g.value)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all ${
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
        </div>

        {/* Price / Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Preço de Custo (R$)"
            type="number"
            value={formData.purchase_price}
            onChange={(e) => updateField("purchase_price", e.target.value)}
          />
          <Input
            label="Preço Sugerido (R$)"
            type="number"
            value={formData.suggested_price}
            onChange={(e) => updateField("suggested_price", e.target.value)}
          />
          <Input
            label="Data da Compra"
            type="date"
            value={formData.purchase_date}
            onChange={(e) => updateField("purchase_date", e.target.value)}
          />
        </div>

        {/* Battery / iOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Saúde da Bateria (%)"
            type="number"
            min="0"
            max="100"
            value={formData.battery_health}
            onChange={(e) => updateField("battery_health", e.target.value)}
          />
          <Input
            label="Versão do Software"
            placeholder="Ex: 18.3"
            value={formData.ios_version}
            onChange={(e) => updateField("ios_version", e.target.value)}
          />
        </div>

        {/* Notes */}
        <Textarea
          label="Observações"
          placeholder="Descreva o estado físico, riscos, marcas de uso..."
          value={formData.condition_notes}
          onChange={(e) => updateField("condition_notes", e.target.value)}
        />

        {/* Photos */}
        <div>
          <label className="block text-sm font-medium text-navy-900 mb-2">Fotos</label>
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
            className="w-full border-2 border-dashed border-gray-200 hover:border-royal-500 rounded-2xl p-6 transition-colors flex flex-col items-center gap-2"
          >
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
              <Camera className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-navy-900">Adicionar fotos</p>
            <p className="text-xs text-gray-400">JPEG, PNG ou WEBP</p>
          </button>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
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
      </div>
    </div>
  )
}
