"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { GRADES } from "@/lib/constants"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { getComputedInventoryStatus, mapLifecycleToLegacyCompatibleStatus } from "@/lib/helpers"

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "pending", label: "Cadastro incompleto" },
  { value: "sold", label: "Vendido" },
  { value: "under_repair", label: "Em reparo" },
  { value: "returned", label: "Devolvido" },
]

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const productId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [catalogName, setCatalogName] = useState("")
  const [isAccessory, setIsAccessory] = useState(false)
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
    quantity: "1",
    type: "own",
    supplier_name: "",
  })
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

      // Detect accessory (no catalog + condition_notes has "Acessório:" prefix)
      const isAcc = item.catalog_id === null && item.condition_notes?.includes("Acessório:")
      setIsAccessory(isAcc)

      if (isAcc) {
        const accName = item.condition_notes?.replace(/^Acessório:\s*/, "") || "Acessório"
        setCatalogName(accName)
      }

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
        quantity: item.quantity?.toString() || "1",
        type: item.type || "own",
        supplier_name: item.supplier_name || "",
      })

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
      const computedLifecycleStatus = getComputedInventoryStatus({
        status: formData.status,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        purchase_date: formData.purchase_date || null,
        grade: formData.grade || null,
        imei: formData.imei || null,
        serial_number: formData.serial_number || null,
        catalog_id: null,
        notes: formData.condition_notes || null,
        condition_notes: formData.condition_notes || null,
      })

      const updateData: Record<string, any> = {
        imei: formData.imei || null,
        serial_number: formData.serial_number || null,
        grade: formData.grade || null,
        status: mapLifecycleToLegacyCompatibleStatus(computedLifecycleStatus),
        purchase_price: parseFloat(formData.purchase_price) || 0,
        suggested_price: formData.suggested_price ? parseFloat(formData.suggested_price) : null,
        purchase_date: formData.purchase_date,
        battery_health: formData.battery_health ? parseInt(formData.battery_health) : null,
        ios_version: formData.ios_version || null,
        condition_notes: formData.condition_notes || null,
        quantity: formData.type === "own" ? Math.max(1, parseInt(formData.quantity) || 1) : 1,
        type: formData.type,
        supplier_name: formData.type === "supplier" ? (formData.supplier_name || null) : null,
        photos: null,
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

        {/* IMEI / Serial — only for devices */}
        {!isAccessory && (
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
        )}

        {/* Grade / Status — only for devices */}
        {!isAccessory && (
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
        )}

        {/* Accessory name display */}
        {isAccessory && catalogName && (
          <div className="bg-surface rounded-xl p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Nome do Acessório</p>
            <p className="text-sm font-medium text-navy-900">{catalogName}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Origem do produto"
            value={formData.type}
            onChange={(e) => updateField("type", e.target.value)}
            options={[
              { label: "Estoque próprio", value: "own" },
              { label: "Fornecedor", value: "supplier" },
            ]}
          />
          {formData.type === "supplier" ? (
            <Input
              label="Nome do fornecedor"
              placeholder="Opcional"
              value={formData.supplier_name}
              onChange={(e) => updateField("supplier_name", e.target.value)}
            />
          ) : null}
        </div>

        {/* Price / Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Preço de Custo (R$)"
            type="number"
            value={formData.purchase_price}
            onChange={(e) => updateField("purchase_price", e.target.value)}
          />
          <div className="sm:col-span-2">
            <div className="flex items-center gap-3 mb-1.5">
              <label className="text-sm font-medium text-navy-900">Preço Sugerido (R$)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.suggested_price}
                onChange={(e) => updateField("suggested_price", e.target.value)}
                className="w-32 h-8 text-center rounded-lg border border-gray-200 text-sm font-semibold px-2"
              />
            </div>
            {formData.purchase_price && (
              <div className="space-y-1">
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={Math.round(Math.max(5, Math.min(100, (((parseFloat(formData.suggested_price) || 0) / (parseFloat(formData.purchase_price) || 1)) - 1) * 100)))}
                  onChange={(e) => {
                    const marginPct = parseInt(e.target.value)
                    const cost = parseFloat(formData.purchase_price) || 0
                    const newPrice = Math.ceil(cost * (1 + marginPct / 100))
                    updateField("suggested_price", newPrice.toString())
                  }}
                  className="w-full accent-royal-500"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>5%</span>
                  <span>100%</span>
                </div>
              </div>
            )}
          </div>
          <Input
            label="Data da Compra"
            type="date"
            value={formData.purchase_date}
            onChange={(e) => updateField("purchase_date", e.target.value)}
          />
          {formData.type === "own" ? (
            <Input
              label="Quantidade em Estoque"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => updateField("quantity", Math.max(1, parseInt(e.target.value) || 1).toString())}
            />
          ) : (
            <p className="text-xs text-gray-500 self-center">Produto virtual de fornecedor (não compõe estoque próprio).</p>
          )}
        </div>

        {/* Battery / iOS — only for devices */}
        {!isAccessory && (
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
        )}

        {/* Notes */}
        <Textarea
          label="Observações"
          placeholder="Descreva o estado físico, riscos, marcas de uso..."
          value={formData.condition_notes}
          onChange={(e) => updateField("condition_notes", e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-navy-900 mb-2">Fotos</label>
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-sm font-medium text-navy-900">Edição de imagens desativada temporariamente.</p>
            <p className="text-xs text-gray-400 mt-1">As fotos ficarão reservadas para o fluxo de assistência técnica.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
