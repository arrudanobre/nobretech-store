"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Calculator, Copy, Package, Plus, Save, Trash2, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { CATEGORIES, GRADES, PRODUCT_CATALOG } from "@/lib/constants"
import { formatBRL, getComputedInventoryStatus, mapLifecycleToLegacyCompatibleStatus } from "@/lib/helpers"

type ProductMode = "catalog" | "manual"

type PurchaseLine = {
  id: string
  mode: ProductMode
  category: string
  modelIdx: number
  manualName: string
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
  notes: string
}

const categoryOptions = CATEGORIES.map((category) => ({ label: category.label, value: category.value }))
const gradeOptions = GRADES.map((grade) => ({ label: grade.label, value: grade.value }))
const paymentOptions = [
  { label: "Pix", value: "pix" },
  { label: "Dinheiro", value: "cash" },
  { label: "Debito", value: "debit" },
  { label: "Cartao de credito", value: "credit_card" },
  { label: "Boleto", value: "boleto" },
  { label: "Transferencia", value: "transfer" },
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
    notes: "",
    ...overrides,
  }
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const normalized = String(value).replace(/\./g, "").replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function splitValues(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function selectedModelFor(line: PurchaseLine) {
  const catalog = PRODUCT_CATALOG[line.category as keyof typeof PRODUCT_CATALOG]
  return catalog?.models?.[line.modelIdx] as any
}

function lineProductName(line: PurchaseLine) {
  if (line.mode === "manual") return line.manualName.trim() || "Produto manual"
  const model = selectedModelFor(line)
  return [model?.name, line.storage, line.color].filter(Boolean).join(" ").trim() || "Produto do catalogo"
}

function needsChecklistLater(line: PurchaseLine) {
  return line.mode === "catalog" && ["iphone", "ipad"].includes(line.category) && line.grade !== "Lacrado"
}

function shouldCreateOneInventoryRowPerUnit(line: PurchaseLine, imeis: string[], serials: string[]) {
  if (imeis.length > 0 || serials.length > 0) return true
  return line.mode === "catalog" && ["iphone", "ipad", "applewatch", "airpods", "macbook"].includes(line.category)
}

export default function NewInventoryPurchasePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [suppliers, setSuppliers] = useState<Array<{ label: string; value: string }>>([])
  const [accounts, setAccounts] = useState<Array<{ label: string; value: string }>>([])
  const [purchase, setPurchase] = useState({
    supplier_id: "",
    supplier_name: "",
    purchase_date: new Date().toISOString().split("T")[0],
    payment_method: "pix",
    account_id: "",
    due_date: new Date().toISOString().split("T")[0],
    freight_amount: "",
    other_costs_amount: "",
    notes: "",
  })
  const [lines, setLines] = useState<PurchaseLine[]>([newLine()])

  useEffect(() => {
    async function loadOptions() {
      const [{ data: supplierData }, { data: accountData }] = await Promise.all([
        (supabase.from("suppliers") as any).select("id, name, city").order("name", { ascending: true }),
        (supabase.from("finance_accounts") as any).select("id, name, bank_name, is_active").order("name", { ascending: true }),
      ])

      setSuppliers((supplierData || []).map((supplier: any) => ({
        label: `${supplier.name}${supplier.city ? ` - ${supplier.city}` : ""}`,
        value: supplier.id,
      })))
      setAccounts((accountData || []).filter((account: any) => account.is_active !== false).map((account: any) => ({
        label: `${account.name}${account.bank_name ? ` - ${account.bank_name}` : ""}`,
        value: account.id,
      })))
    }
    loadOptions()
  }, [])

  const totals = useMemo(() => {
    const totalQty = lines.reduce((sum, line) => sum + Math.max(1, Math.floor(toNumber(line.quantity))), 0)
    const productsAmount = lines.reduce((sum, line) => sum + toNumber(line.unitCost) * Math.max(1, Math.floor(toNumber(line.quantity))), 0)
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

  const canSave = totals.totalQty > 0 && totals.productsAmount > 0 && lines.every((line) => {
    if (toNumber(line.unitCost) <= 0 || Math.max(1, Math.floor(toNumber(line.quantity))) <= 0) return false
    if (line.mode === "manual") return line.manualName.trim().length > 0
    const model = selectedModelFor(line)
    return Boolean(model && (line.storage || !(model.storage || model.sizes)) && (line.color || !model.colors))
  })

  const updatePurchase = (field: string, value: string) => {
    setPurchase((prev) => ({ ...prev, [field]: value }))
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
      }
      if (field === "mode" && value === "manual" && !next.manualName) {
        next.category = "accessories"
        next.manualName = accessorySuggestions[0]
        next.grade = "Lacrado"
      }
      if (field === "suggestedPrice") {
        const landedCost = toNumber(next.unitCost) + totals.freightPerUnit + totals.otherPerUnit
        const price = toNumber(String(value))
        if (landedCost > 0 && price > 0) next.marginPct = Math.max(0, (price / landedCost - 1) * 100).toFixed(2)
      }
      return next
    }))
  }

  const addLine = (mode: ProductMode = "catalog") => {
    setLines((prev) => [...prev, newLine(mode === "manual" ? { mode, category: "accessories", manualName: accessorySuggestions[0] } : {})])
  }

  const duplicateLine = (line: PurchaseLine) => {
    setLines((prev) => [...prev, { ...line, id: crypto.randomUUID(), imeis: "", serials: "" }])
  }

  const removeLine = (id: string) => {
    setLines((prev) => prev.length === 1 ? prev : prev.filter((line) => line.id !== id))
  }

  const findOrCreateCatalog = async (line: PurchaseLine) => {
    if (line.mode === "manual") return null
    const model = selectedModelFor(line)
    if (!model?.name) return null
    const storage = line.storage || null
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
      const supplier = suppliers.find((item) => item.value === purchase.supplier_id)
      const supplierName = purchase.supplier_name || supplier?.label || null
      const { data: stockAccount } = await (supabase.from("finance_chart_accounts") as any)
        .select("id")
        .eq("code", "7.01")
        .limit(1)

      const { data: purchaseRow, error: purchaseError } = await (supabase.from("inventory_purchases") as any)
        .insert({
          supplier_id: purchase.supplier_id || null,
          supplier_name: supplierName,
          purchase_date: purchase.purchase_date,
          payment_method: purchase.payment_method,
          account_id: purchase.account_id || null,
          chart_account_id: stockAccount?.[0]?.id || null,
          status: "received",
          payment_status: purchase.account_id ? "paid" : "pending",
          due_date: purchase.account_id ? purchase.purchase_date : purchase.due_date || purchase.purchase_date,
          freight_amount: totals.freight,
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

      const catalogIds = new Map<string, string | null>()
      for (const line of lines) {
        catalogIds.set(line.id, await findOrCreateCatalog(line))
      }

      const inventoryPayloads: any[] = []
      const purchaseItemPayloads: any[] = []

      lines.forEach((line) => {
        const quantity = Math.max(1, Math.floor(toNumber(line.quantity)))
        const imeis = splitValues(line.imeis)
        const serials = splitValues(line.serials)
        const unitCost = roundMoney(toNumber(line.unitCost))
        const landedUnitCost = roundMoney(unitCost + totals.freightPerUnit + totals.otherPerUnit)
        const suggestedPrice = roundMoney(toNumber(line.suggestedPrice) || Math.ceil(landedUnitCost * (1 + toNumber(line.marginPct) / 100)))
        const catalogId = catalogIds.get(line.id) || null
        const productName = lineProductName(line)
        const checklistRequired = needsChecklistLater(line)
        const isSealedElectronic = line.mode === "catalog" && ["iphone", "ipad", "applewatch"].includes(line.category) && line.grade === "Lacrado"
        const conditionNotes = [
          line.mode === "manual" ? `Acessorio: ${productName}` : null,
          line.notes || null,
          checklistRequired ? "Checklist tecnico pendente" : null,
        ].filter(Boolean).join(" · ") || null

        const splitByUnit = shouldCreateOneInventoryRowPerUnit(line, imeis, serials)
        const rowsToCreate = splitByUnit ? quantity : 1

        for (let index = 0; index < rowsToCreate; index += 1) {
          const imei = splitByUnit ? imeis[index] || null : null
          const serial = splitByUnit ? serials[index] || null : null
          const battery = isSealedElectronic ? 100 : toNumber(line.batteryHealth) || null
          const lifecycleStatus = getComputedInventoryStatus({
            status: "active",
            purchase_price: landedUnitCost,
            purchase_date: purchase.purchase_date,
            grade: line.grade,
            imei,
            serial_number: serial,
            catalog_id: catalogId,
            notes: line.mode === "manual" ? productName : line.notes,
            condition_notes: conditionNotes,
          })

          inventoryPayloads.push({
            catalog_id: catalogId,
            imei,
            serial_number: serial,
            imei2: null,
            grade: line.grade,
            condition_notes: conditionNotes,
            purchase_price: landedUnitCost,
            purchase_date: purchase.purchase_date,
            supplier_id: purchase.supplier_id || null,
            type: "own",
            supplier_name: supplierName,
            origin: "purchase",
            suggested_price: suggestedPrice || null,
            ios_version: null,
            battery_health: battery,
            notes: line.mode === "manual" ? productName : line.notes || null,
            quantity: splitByUnit ? 1 : quantity,
            status: mapLifecycleToLegacyCompatibleStatus(lifecycleStatus),
          })

          purchaseItemPayloads.push({
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

      const { data: createdInventory, error: inventoryError } = await (supabase.from("inventory") as any)
        .insert(inventoryPayloads)
        .select("id")

      if (inventoryError) throw inventoryError

      const itemsWithInventory = purchaseItemPayloads.map((item, index) => ({
        ...item,
        inventory_id: createdInventory?.[index]?.id || null,
      }))

      const { error: itemError } = await (supabase.from("inventory_purchase_items") as any)
        .insert(itemsWithInventory)

      if (itemError) throw itemError

      toast({
        title: "Compra cadastrada",
        description: `${totals.totalQty} item(ns) entraram no estoque com custo rateado.`,
        type: "success",
      })
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
              <Select label="Fornecedor cadastrado" value={purchase.supplier_id} onChange={(event) => updatePurchase("supplier_id", event.target.value)} options={[{ label: "Sem fornecedor", value: "" }, ...suppliers]} />
              <Input label="Fornecedor avulso" placeholder="Nome do fornecedor" value={purchase.supplier_name} onChange={(event) => updatePurchase("supplier_name", event.target.value)} />
              <Input label="Data da compra" type="date" value={purchase.purchase_date} onChange={(event) => updatePurchase("purchase_date", event.target.value)} />
              <Input label="Vencimento" type="date" value={purchase.due_date} onChange={(event) => updatePurchase("due_date", event.target.value)} />
              <Select label="Forma de pagamento" value={purchase.payment_method} onChange={(event) => updatePurchase("payment_method", event.target.value)} options={paymentOptions} />
              <Select label="Conta" value={purchase.account_id} onChange={(event) => updatePurchase("account_id", event.target.value)} options={[{ label: "Nao conciliar agora", value: "" }, ...accounts]} />
              <Input label="Frete total" inputMode="decimal" placeholder="0,00" value={purchase.freight_amount} onChange={(event) => updatePurchase("freight_amount", event.target.value)} icon={<Truck className="w-4 h-4" />} />
              <Input label="Outros custos" inputMode="decimal" placeholder="0,00" value={purchase.other_costs_amount} onChange={(event) => updatePurchase("other_costs_amount", event.target.value)} icon={<Calculator className="w-4 h-4" />} />
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

            <div className="divide-y divide-gray-100">
              {lines.map((line, index) => {
                const model = selectedModelFor(line)
                const storageOptions = ((model?.storage || model?.sizes || []) as string[]).map((value) => ({ label: value, value }))
                const colorOptions = ((model?.colors || []) as Array<{ name: string; hex: string }>).map((color) => ({ label: color.name, value: color.name }))
                const quantity = Math.max(1, Math.floor(toNumber(line.quantity)))
                const unitCost = toNumber(line.unitCost)
                const landedCost = roundMoney(unitCost + totals.freightPerUnit + totals.otherPerUnit)
                const suggested = toNumber(line.suggestedPrice) || Math.ceil(landedCost * (1 + toNumber(line.marginPct) / 100))

                return (
                  <div key={line.id} className="p-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Item {index + 1}</span>
                          {needsChecklistLater(line) && <Badge variant="yellow">Checklist depois</Badge>}
                          <Badge variant="gray">{quantity} un.</Badge>
                        </div>
                        <h4 className="mt-1 text-lg font-semibold text-navy-900">{lineProductName(line)}</h4>
                        <p className="text-sm text-gray-500">
                          Custo final unitario: <strong className="text-navy-900">{formatBRL(landedCost)}</strong> · sugerido {formatBRL(suggested || 0)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => duplicateLine(line)}>
                          <Copy className="w-4 h-4" /> Duplicar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)} disabled={lines.length === 1}>
                          <Trash2 className="w-4 h-4" /> Remover
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-6">
                      <Select label="Tipo" value={line.mode} onChange={(event) => updateLine(line.id, "mode", event.target.value)} options={[{ label: "Catalogo", value: "catalog" }, { label: "Manual/outro", value: "manual" }]} />
                      <Select label="Categoria" value={line.category} onChange={(event) => updateLine(line.id, "category", event.target.value)} options={categoryOptions} />
                      {line.mode === "catalog" ? (
                        <>
                          <div className="lg:col-span-2">
                            <Select label="Modelo" value={String(line.modelIdx)} onChange={(event) => updateLine(line.id, "modelIdx", event.target.value)} options={(PRODUCT_CATALOG[line.category as keyof typeof PRODUCT_CATALOG]?.models || []).map((item: any, idx: number) => ({ label: item.name, value: String(idx) }))} />
                          </div>
                          <Select label="Armazenamento" value={line.storage} onChange={(event) => updateLine(line.id, "storage", event.target.value)} options={[{ label: "Selecionar", value: "" }, ...storageOptions]} />
                          <Select label="Cor" value={line.color} onChange={(event) => {
                            const color = (model?.colors || []).find((item: any) => item.name === event.target.value)
                            updateLine(line.id, "color", event.target.value)
                            if (color?.hex) updateLine(line.id, "colorHex", color.hex)
                          }} options={[{ label: "Selecionar", value: "" }, ...colorOptions]} />
                        </>
                      ) : (
                        <div className="lg:col-span-4">
                          <Input label="Nome do produto" value={line.manualName} onChange={(event) => updateLine(line.id, "manualName", event.target.value)} placeholder="Ex: Capa para iPad Pro 11, Carregador Turbo 35W iPhone..." />
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                      <Select label="Condicao" value={line.grade} onChange={(event) => updateLine(line.id, "grade", event.target.value)} options={gradeOptions} />
                      <Input label="Quantidade" type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} />
                      <Input label="Custo un." inputMode="decimal" value={line.unitCost} onChange={(event) => updateLine(line.id, "unitCost", event.target.value)} placeholder="0,00" />
                      <Input label="Margem %" inputMode="decimal" value={line.marginPct} onChange={(event) => updateLine(line.id, "marginPct", event.target.value)} />
                      <Input label="Preco sugerido" inputMode="decimal" value={line.suggestedPrice} onChange={(event) => updateLine(line.id, "suggestedPrice", event.target.value)} placeholder={String(suggested || "")} />
                      <Input label="Bateria %" type="number" min="0" max="100" disabled={line.grade === "Lacrado" || line.mode === "manual"} value={line.grade === "Lacrado" && ["iphone", "ipad", "applewatch"].includes(line.category) ? "100" : line.batteryHealth} onChange={(event) => updateLine(line.id, "batteryHealth", event.target.value)} />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Textarea label="IMEIs (um por linha)" value={line.imeis} onChange={(event) => updateLine(line.id, "imeis", event.target.value)} placeholder={"356...\n356..."} />
                      <Textarea label="Seriais (um por linha)" value={line.serials} onChange={(event) => updateLine(line.id, "serials", event.target.value)} placeholder={"F2L...\nG6T..."} />
                    </div>
                    <Textarea label="Observacoes do item" value={line.notes} onChange={(event) => updateLine(line.id, "notes", event.target.value)} placeholder="Marcas de uso, caixa, acessorios inclusos, origem..." />
                  </div>
                )
              })}
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
