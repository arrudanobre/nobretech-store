"use client"

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { buildPriceTable, calcPrice, calcProfit, formatBRL, maskCPF, formatPhone, validateCPF, getFeeKey } from "@/lib/helpers"
import { PAYMENT_METHODS, CATEGORIES, PRODUCT_CATALOG, GRADES } from "@/lib/constants"
import { useToast } from "@/components/ui/toaster"
import { CategoryIcon } from "@/components/ui/icon-helpers"
import { supabase } from "@/lib/supabase"
import {
  Search,
  ShoppingCart,
  User,
  DollarSign,
  ShieldCheck,
  Check,
  ArrowRight,
  ArrowLeft,
  Camera,
  X,
} from "lucide-react"

type Step = 1 | 2 | 3 | 4 | 5

type InventoryProduct = {
  id: string
  name: string
  imei: string
  cost: number
  suggested: number
  battery: number
}

const mockInStock: InventoryProduct[] = []

function NewSaleContent() {
  const [step, setStep] = useState<Step>(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null)
  const [customer, setCustomer] = useState({ name: "", cpf: "", phone: "", email: "" })
  const [customerNotes, setCustomerNotes] = useState("")
  const [customerEditableNotes, setCustomerEditableNotes] = useState("")
  const [existingCustomerFound, setExistingCustomerFound] = useState(false)
  const [salePrice, setSalePrice] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [warrantyMonths, setWarrantyMonths] = useState("3")
  const [hasTradeIn, setHasTradeIn] = useState(false)
  const [tradeIn, setTradeIn] = useState({ category: "", modelIdx: 0, storage: "", color: "", imei: "", grade: "", value: "" })
  const [saleNotes, setSaleNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tradeInPhotos, setTradeInPhotos] = useState<string[]>([])
  const tradeInFileRef = useRef<HTMLInputElement>(null)
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const defaultFees: Record<string, number> = {
    debit: 1.47, credit_1x: 3.26, credit_2x: 11.77, credit_3x: 13.03, credit_4x: 13.13,
    credit_5x: 15.37, credit_6x: 15.38, credit_7x: 17.12, credit_8x: 17.12,
    credit_9x: 19.17, credit_10x: 19.82, credit_11x: 19.82, credit_12x: 20.78, pix: 0, cash: 0,
  }
  const [fees, setFees] = useState<Partial<Record<string, number>>>(defaultFees)

  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectId = searchParams.get("product")
  const tradeinParam = searchParams.get("tradein")

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
          .select("id, imei, purchase_price, suggested_price, battery_health, status, product_catalog(model, variant, storage, color)")
          .eq("status", "in_stock")
          .order("created_at", { ascending: false })

        if (error) throw error

        const products = (data || []).map((item: any) => {
          const cat = item.product_catalog || {}
          return {
            id: item.id,
            name: `${cat.model || "Produto"}${cat.variant ? " " + cat.variant : ""}${cat.storage ? " " + cat.storage : ""} ${cat.color || ""}`.trim(),
            imei: item.imei || "",
            cost: item.purchase_price || 0,
            suggested: item.suggested_price || 0,
            battery: item.battery_health || 0,
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
          .select("id, imei, purchase_price, suggested_price, battery_health, catalog:product_catalog(model, variant, storage, color)")
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

        const cat = items.catalog || {}
        const modelName = `${cat.model || ""}${cat.variant ? " " + cat.variant : ""}${cat.storage ? " " + cat.storage : ""} ${cat.color || ""}`.trim()
        const product = {
          id: items.id,
          name: modelName || "Produto sem nome",
          imei: items.imei || "",
          cost: items.purchase_price || 0,
          suggested: items.suggested_price || 0,
          battery: items.battery_health || 0,
        }
        setSelectedProduct(product)
        setSalePrice(product.suggested.toString())
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
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.imei?.includes(searchTerm)
    )
  }, [searchTerm, inventoryProducts])

  const priceTable = useMemo(() => {
    if (!selectedProduct || !salePrice) return []
    return buildPriceTable(parseFloat(salePrice), 0, fees as any)
  }, [selectedProduct, salePrice, fees])

  const profit = useMemo(() => {
    if (!selectedProduct || !salePrice) return 0
    const feePct = fees[getFeeKey(paymentMethod)] ?? 0
    return calcProfit(parseFloat(salePrice), selectedProduct.cost, feePct)
  }, [selectedProduct, salePrice, paymentMethod, fees])

  const selectProduct = (product: typeof mockInStock[0]) => {
    setSelectedProduct(product)
    setSalePrice(product.suggested.toString())
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

  const handleTradeInPhotos = () => {
    tradeInFileRef.current?.click()
  }

  const handleTradeInFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (ev.target?.result) setTradeInPhotos((prev) => [...prev, ev.target!.result as string])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  const removeTradeInPhoto = (idx: number) => {
    setTradeInPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedProduct && !loadingInventory
      case 2: return customer.name && validateCPF(customer.cpf)
      case 3: return salePrice && paymentMethod
      case 4: return true
      case 5: return true
      default: return false
    }
  }

  const next = () => setStep((s) => Math.min(5, s + 1) as Step)
  const prev = () => setStep((s) => Math.max(1, s - 1) as Step)

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

      // 2. Register the sale
      const { data: sale, error: saleError } = await (supabase
        .from("sales") as any)
        .insert({
          company_id: companyId,
          inventory_id: selectedProduct!.id,
          customer_id: customerId,
          sale_price: parseFloat(salePrice),
          payment_method: paymentMethod,
          warranty_months: parseInt(warrantyMonths),
          warranty_start: today,
          warranty_end: warrantyEnd.toISOString().split("T")[0],
          sale_date: today,
          notes: saleNotes || null,
          has_trade_in: hasTradeIn,
        })
        .select()
        .single()

      if (saleError) {
        console.error("Erro ao registrar venda:", saleError)
        throw new Error(saleError.message)
      }

      // 3. Handle trade-in if active (note: inventory status is auto-updated by fn_create_warranty_on_sale trigger)
      if (hasTradeIn && tradeInModels[tradeIn.modelIdx]) {
        const { error: tradeInError } = await ((supabase
            .from("trade_ins") as any)
            .insert({
              company_id: companyId,
              imei: tradeIn.imei || null,
              grade: tradeIn.grade || null,
              trade_in_value: parseFloat(tradeIn.value) || 0,
              status: "received",
              notes: tradeInModels[tradeIn.modelIdx].name,
            }))

        if (tradeInError) {
          console.error("Erro ao registrar trade-in:", tradeInError)
        }
      }

      toast({
        title: "Venda registrada!",
        description: `Venda de ${selectedProduct!.name} concluída com sucesso.`,
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
            placeholder="Buscar por IMEI, modelo, nome..."
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
                      {p.imei ? `IMEI: ${p.imei}` : "—"} · Bateria {p.battery}%
                    </p>
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
              <div>
                <p className="text-sm font-medium text-navy-900">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500">Preço sugerido: {formatBRL(selectedProduct.suggested)}</p>
              </div>
            </div>
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
            <label className="block text-sm font-medium text-navy-900 mb-1.5">Preço de Venda (R$)</label>
            <Input
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
            {profit > 0 && (
              <p className="text-xs text-success-500 mt-1 font-medium">Lucro estimado: {formatBRL(profit)}</p>
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
                      onClick={() => { setTradeIn((p) => ({ ...p, category: c.value })); setTradeIn((p) => ({ ...p, modelIdx: 0 })); }}
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
                  onChange={(e) => setTradeIn((p) => ({ ...p, modelIdx: parseInt(e.target.value) }))}
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
                        onClick={() => setTradeIn((p) => ({ ...p, color: c.name }))}
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
                        onClick={() => setTradeIn((p) => ({ ...p, storage: s }))}
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
                        onClick={() => setTradeIn((p) => ({ ...p, storage: s }))}
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
              <Input label="IMEI do Aparelho Recebido" value={tradeIn.imei} onChange={(e) => setTradeIn((p) => ({ ...p, imei: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />

              {/* Grade */}
              <div>
                <label className="block text-xs font-medium text-navy-900 mb-2">Grade</label>
                <div className="flex gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setTradeIn((p) => ({ ...p, grade: g.value }))}
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

              {/* Photos */}
              <div>
                <label className="block text-xs font-medium text-navy-900 mb-2">Fotos do Aparelho</label>
                <input ref={tradeInFileRef} type="file" accept="image/*" multiple onChange={handleTradeInFileChange} className="hidden" />
                <button
                  type="button"
                  onClick={handleTradeInPhotos}
                  className="w-full border-2 border-dashed border-gray-200 hover:border-royal-500 rounded-xl p-4 transition-colors flex flex-col items-center gap-1"
                >
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-xs font-medium text-navy-900">Adicionar fotos</span>
                </button>
                {tradeInPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {tradeInPhotos.map((photo, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                        <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeTradeInPhoto(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-danger-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Trade-in value */}
              <Input label="Valor da Avaliação (R$)" type="number" value={tradeIn.value} onChange={(e) => setTradeIn((p) => ({ ...p, value: e.target.value }))} />
            </div>
          )}

          {/* Trade-in summary */}
          {hasTradeIn && tradeIn.value && salePrice && (
            <div className="bg-royal-100/50 rounded-xl p-4 space-y-3 border border-royal-500/20">
              <p className="text-sm font-semibold text-navy-900">Resumo da Troca</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Aparelho vendido</span>
                <span className="font-semibold text-navy-900">{formatBRL(parseFloat(salePrice) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">(-) Aparelho recebido</span>
                <span className="font-semibold text-danger-500">- {formatBRL(parseFloat(tradeIn.value) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-navy-900">{formatBRL((parseFloat(salePrice) || 0) - (parseFloat(tradeIn.value) || 0))}</span>
              </div>
              {/* Fee info based on selected payment method */}
              {paymentMethod && (() => {
                const tradeInVal = parseFloat(tradeIn.value) || 0
                const netPrice = (parseFloat(salePrice) || 0) - tradeInVal
                const feeKey = getFeeKey(paymentMethod)
                const feePct = fees[feeKey] ?? 0
                const feeAdjustedPrice = feePct > 0 ? Math.ceil(netPrice / (1 - feePct / 100)) : netPrice
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
                  <span className="font-bold text-royal-500">{formatBRL((parseFloat(salePrice) || 0) - (parseFloat(tradeIn.value) || 0))}</span>
                </div>
              )}
              <p className="text-xs text-gray-500 text-center">
                {paymentMethod
                  ? "* Valor ajustado pela taxa do Mercado Pago"
                  : "* Selecione uma forma de pagamento para ver o valor ajustado com juros"}
              </p>
            </div>
          )}

          {/* Payment method buttons */}
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-2">Forma de Pagamento</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((pm) => {
                const tradeInVal = hasTradeIn ? (parseFloat(tradeIn.value) || 0) : 0
                const netPrice = (parseFloat(salePrice) || 0) - tradeInVal
                const baseForFees = hasTradeIn ? netPrice : parseFloat(salePrice) || 0
                const feePct = fees[getFeeKey(pm.value)] ?? 0
                const displayPrice = feePct > 0 ? Math.ceil(baseForFees / (1 - feePct / 100)) : baseForFees
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
              {hasTradeIn && tradeIn.value && (
                <p className="text-sm text-gray-500 line-through">{salePrice ? formatBRL(parseFloat(salePrice)) : "—"}</p>
              )}
              <p className="text-lg font-bold text-navy-900">
                {salePrice
                  ? formatBRL(
                      (parseFloat(salePrice) || 0) - (hasTradeIn ? (parseFloat(tradeIn.value) || 0) : 0)
                    )
                  : "—"}
              </p>
              <p className="text-sm text-gray-500">{PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.label}</p>
              {profit !== undefined && profit > 0 && <p className="text-sm text-success-500 font-semibold">Lucro: {formatBRL(profit)}</p>}
              {hasTradeIn && (
                <p className="text-xs text-warning-500 font-medium mt-1">
                  Trade-in: {tradeIn.category && tradeIn.modelIdx ? tradeInModels[tradeIn.modelIdx]?.name || tradeIn.category : "Aparelho"} — {tradeIn.value ? formatBRL(parseFloat(tradeIn.value)) : "—"}
                </p>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Garantia</h4>
            <p className="text-sm text-navy-900">{warrantyMonths} meses a partir de hoje</p>
          </div>
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
