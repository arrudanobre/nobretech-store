"use client"

import { useState, useEffect, useCallback, type ComponentType, type ReactNode } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { GRADES } from "@/lib/constants"
import {
  ArrowLeft,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  CheckCircle2,
  FileText,
  Hash,
  Loader2,
  PackageCheck,
  Percent,
  Save,
  ShieldCheck,
  Smartphone,
  Store,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react"
import { formatBRL, getComputedInventoryStatus, getProductName, mapLifecycleToLegacyCompatibleStatus } from "@/lib/helpers"

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "pending", label: "Cadastro incompleto" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
  { value: "under_repair", label: "Em reparo" },
  { value: "returned", label: "Devolvido" },
]

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
  const [isAccessory, setIsAccessory] = useState(false)
  const [catalogId, setCatalogId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
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
  const isSealed = formData.grade === "Lacrado"
  const cost = parseFloat(formData.purchase_price) || 0
  const suggested = parseFloat(formData.suggested_price) || 0
  const profit = Math.max(0, suggested - cost)
  const marginPct = cost > 0 && suggested > 0 ? Math.round(((suggested / cost) - 1) * 100) : 0
  const markupPct = suggested > 0 ? Math.round((profit / suggested) * 100) : 0
  const hasCoreId = isAccessory ? true : Boolean(formData.imei || formData.serial_number)
  const isSupplierItem = formData.type === "supplier"

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
      const isAcc = item.catalog_id === null
      setIsAccessory(isAcc)
      setCatalogId(item.catalog_id || null)
      setNotes(item.notes || "")

      if (isAcc) {
        const accName = item.notes || item.condition_notes?.replace(/^Acessório:\s*/, "") || "Produto manual"
        setCatalogName(accName)
        setProductName(accName)
      }

      setFormData({
        imei: item.imei || "",
        serial_number: item.serial_number || "",
        grade: item.grade || "",
        status: item.status || "in_stock",
        purchase_price: item.purchase_price?.toString() || "",
        suggested_price: item.suggested_price?.toString() || "",
        purchase_date: toDateInputValue(item.purchase_date),
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
          const resolvedName = getProductName({ ...item, catalog: catData })
          setCatalogName(resolvedName)
          setProductName(resolvedName)
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
        catalog_id: catalogId,
        notes: productName.trim() || notes || formData.condition_notes || null,
        condition_notes: formData.condition_notes || null,
      })

      const trimmedProductName = productName.trim()
      const updateData: Record<string, any> = {
        imei: formData.imei || null,
        serial_number: formData.serial_number || null,
        grade: formData.grade || null,
        status: mapLifecycleToLegacyCompatibleStatus(computedLifecycleStatus),
        purchase_price: parseFloat(formData.purchase_price) || 0,
        suggested_price: formData.suggested_price ? parseFloat(formData.suggested_price) : null,
        purchase_date: formData.purchase_date,
        battery_health: isSealed && !isAccessory ? 100 : formData.battery_health ? parseInt(formData.battery_health) : null,
        ios_version: formData.ios_version || null,
        condition_notes: formData.condition_notes || null,
        quantity: formData.type === "own" ? Math.max(1, parseInt(formData.quantity) || 1) : 1,
        type: formData.type,
        supplier_name: formData.type === "supplier" ? (formData.supplier_name || null) : null,
        notes: catalogId ? (trimmedProductName ? `Nome: ${trimmedProductName}` : null) : (trimmedProductName || null),
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
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-navy-900 sm:text-2xl">{catalogName || "Editar produto"}</h2>
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
                {isSupplierItem ? "Fornecedor" : "Estoque próprio"}
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
            title="Identificação"
            description={isAccessory ? "Nome e status do item manual." : "IMEI, número de série e status operacional do aparelho."}
            icon={Hash}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-3">
                <Input
                  label="Nome do produto"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex: iPhone 17 Pro Max 256GB Cosmic Orange"
                />
                {catalogId ? (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Este nome vale apenas para este item do estoque e não altera o catálogo padrão.
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
                <div className="lg:col-span-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Produto manual</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{productName || catalogName}</p>
                  <p className="text-sm text-gray-500">Use o campo acima para ajustar o nome exibido no estoque e na venda.</p>
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
            description="Defina se o item é próprio ou de fornecedor e como ele aparece no estoque."
            icon={Boxes}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              ) : (
                <Input
                  label="Quantidade em estoque"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => updateField("quantity", Math.max(1, parseInt(e.target.value) || 1).toString())}
                />
              )}
              <Input
                label="Data da compra"
                type="date"
                value={formData.purchase_date}
                onChange={(e) => updateField("purchase_date", e.target.value)}
              />
            </div>
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
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
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
                  <p className="text-xs text-gray-500">Compra</p>
                  <p className="font-bold text-navy-900">{formatDateBR(formData.purchase_date)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3">
                  <WalletCards className="mb-2 h-4 w-4 text-royal-600" />
                  <p className="text-xs text-gray-500">Origem</p>
                  <p className="font-bold text-navy-900">{isSupplierItem ? "Fornecedor" : "Próprio"}</p>
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
