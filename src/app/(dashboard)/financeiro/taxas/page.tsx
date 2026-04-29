"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Calculator, CreditCard, HelpCircle, Percent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PAYMENT_METHODS, SIDEPAY_FEE_PCTS } from "@/lib/constants"
import { buildPriceTable, calcPrice, formatBRL, normalizePaymentFeePct } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"

const DEFAULT_SETTINGS: Record<string, number> = {
  default_margin_pct: 15,
  pix_fee_pct: SIDEPAY_FEE_PCTS.pix,
  cash_discount_pct: 0,
  debit_fee_pct: SIDEPAY_FEE_PCTS.debit,
  credit_1x_fee_pct: SIDEPAY_FEE_PCTS.credit_1x,
  credit_2x_fee_pct: SIDEPAY_FEE_PCTS.credit_2x,
  credit_3x_fee_pct: SIDEPAY_FEE_PCTS.credit_3x,
  credit_4x_fee_pct: SIDEPAY_FEE_PCTS.credit_4x,
  credit_5x_fee_pct: SIDEPAY_FEE_PCTS.credit_5x,
  credit_6x_fee_pct: SIDEPAY_FEE_PCTS.credit_6x,
  credit_7x_fee_pct: SIDEPAY_FEE_PCTS.credit_7x,
  credit_8x_fee_pct: SIDEPAY_FEE_PCTS.credit_8x,
  credit_9x_fee_pct: SIDEPAY_FEE_PCTS.credit_9x,
  credit_10x_fee_pct: SIDEPAY_FEE_PCTS.credit_10x,
  credit_11x_fee_pct: SIDEPAY_FEE_PCTS.credit_11x,
  credit_12x_fee_pct: SIDEPAY_FEE_PCTS.credit_12x,
  credit_13x_fee_pct: SIDEPAY_FEE_PCTS.credit_13x,
  credit_14x_fee_pct: SIDEPAY_FEE_PCTS.credit_14x,
  credit_15x_fee_pct: SIDEPAY_FEE_PCTS.credit_15x,
  credit_16x_fee_pct: SIDEPAY_FEE_PCTS.credit_16x,
  credit_17x_fee_pct: SIDEPAY_FEE_PCTS.credit_17x,
  credit_18x_fee_pct: SIDEPAY_FEE_PCTS.credit_18x,
}

function dbKey(method: string) {
  if (method === "cash") return "cash_discount_pct"
  if (method === "pix") return "pix_fee_pct"
  return `${method}_fee_pct`
}

function displayMethodLabel(method: string) {
  if (method === "cash") return "Dinheiro"
  return PAYMENT_METHODS.find((item) => item.value === method)?.label || method
}

function methodFromDbKey(key: string) {
  if (key === "cash_discount_pct") return "cash"
  if (key === "pix_fee_pct") return "pix"
  if (key === "debit_fee_pct") return "debit"

  const match = key.match(/^(credit_\d+x)_fee_pct$/)
  return match?.[1] || null
}

function normalizeSettingValue(key: string, value: unknown, fallback: number) {
  const numeric = Number(value ?? fallback ?? 0)
  const method = methodFromDbKey(key)
  return method ? normalizePaymentFeePct(method, numeric) : numeric
}

export default function TaxasPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, number>>(DEFAULT_SETTINGS)
  const [productCost, setProductCost] = useState("1000")

  useEffect(() => {
    async function loadFees() {
      setLoading(true)
      try {
        const { data, error } = await (supabase.from("financial_settings") as any).select("*").limit(1).single()
        if (error) throw error
        if (data) {
          setSettingsId(data.id || null)
          setSettings((current) => ({
            ...current,
            ...Object.fromEntries(
              Object.keys(DEFAULT_SETTINGS).map((key) => [
                key,
                normalizeSettingValue(key, data[key], current[key]),
              ])
            ),
          }))
        }
      } catch {
        setSettings(DEFAULT_SETTINGS)
      } finally {
        setLoading(false)
      }
    }
    loadFees()
  }, [])

  const desiredNet = useMemo(() => {
    const cost = Number(productCost || 0)
    return cost > 0 ? calcPrice(cost, settings.default_margin_pct || 0) : 0
  }, [productCost, settings.default_margin_pct])

  const pricePreview = useMemo(() => {
    return PAYMENT_METHODS
      .filter((method) => method.value !== "cash")
      .map((method) => {
        const fee = normalizePaymentFeePct(method.value, Number(settings[dbKey(method.value)] || 0))
        const row = buildPriceTable(desiredNet, 0, {
          [method.value]: fee,
        } as any).find((item) => item.method === method.value)
        const total = row?.price || calcPrice(desiredNet, fee)
        const installments = row?.installments || method.maxInstallments || 1
        return {
          method: method.value,
          label: method.label,
          fee,
          total,
          installments,
          installmentValue: row?.installmentValue || total / installments,
        }
      })
  }, [desiredNet, settings])

  const handleSettingChange = (key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: Number(value.replace(",", ".")) || 0 }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = Object.fromEntries(
        Object.keys(DEFAULT_SETTINGS).map((key) => [key, Number(settings[key] || 0)])
      )
      const request = settingsId
        ? (supabase.from("financial_settings") as any).update(payload).eq("id", settingsId)
        : (supabase.from("financial_settings") as any).insert(payload)

      const { error } = await request
      if (error) throw error
      toast.success("Taxas atualizadas com sucesso!")
    } catch (error: any) {
      toast.error(`Erro ao salvar taxas: ${error?.message || "tente novamente"}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-royal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 animate-pulse">Carregando taxas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-navy-900 font-display font-semibold text-lg">Taxas e Precificação</h2>
          <p className="text-sm text-gray-500">Acréscimos repassados ao cliente para preservar o valor líquido.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-navy-900 text-white hover:bg-navy-800 shadow-lg shadow-navy-900/20 px-8">
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-royal-500/10 flex items-center justify-center">
                <Percent className="w-5 h-5 text-royal-600" />
              </div>
              <h3 className="font-bold text-navy-900">Margem e Operacional</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Margem padrão (%)"
                type="number"
                step="0.01"
                value={settings.default_margin_pct}
                onChange={(event) => handleSettingChange("default_margin_pct", event.target.value)}
                className="bg-gray-50/50"
              />
              <Input
                label="Pix (%)"
                type="number"
                step="0.0001"
                value={settings.pix_fee_pct}
                onChange={(event) => handleSettingChange("pix_fee_pct", event.target.value)}
                className="bg-gray-50/50"
              />
              <Input
                label="Dinheiro (%)"
                type="number"
                step="0.0001"
                value={settings.cash_discount_pct}
                onChange={(event) => handleSettingChange("cash_discount_pct", event.target.value)}
                className="bg-gray-50/50"
              />
            </div>
          </Card>

          <Card className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-navy-900">Acréscimos por forma de pagamento</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PAYMENT_METHODS.filter((method) => !["cash", "pix"].includes(method.value)).map((method) => {
                const key = dbKey(method.value)
                const fee = settings[key] || 0
                const preview = calcPrice(100, fee)
                return (
                  <div key={method.value} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                    <Input
                      label={`${displayMethodLabel(method.value)} (%)`}
                      type="number"
                      step="0.0001"
                      value={fee}
                      onChange={(event) => handleSettingChange(key, event.target.value)}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      R$ 100 líquido → {formatBRL(preview)}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500 leading-relaxed">
                Estes valores são acréscimos/multiplicadores de repasse com até 4 casas decimais. Exemplo: 18x = 18,5818 significa que, para receber R$ 100, o cliente paga R$ 118,58.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-navy-900 text-white border-none shadow-2xl rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <Calculator className="w-24 h-24" />
            </div>

            <div className="relative z-10">
              <h3 className="font-display font-bold text-lg mb-2">Simulador</h3>
              <p className="text-xs text-navy-200 mb-6">Preço para receber o líquido desejado em cada método.</p>

              <label className="text-[10px] font-bold uppercase tracking-widest text-navy-300 mb-1.5 block">Custo do Produto</label>
              <div className="relative mb-5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400 font-bold text-sm">R$</span>
                <input
                  type="number"
                  value={productCost}
                  onChange={(event) => setProductCost(event.target.value)}
                  className="w-full h-11 bg-navy-800 border-none rounded-xl pl-10 pr-4 text-sm font-bold focus:ring-2 focus:ring-royal-500 transition-all placeholder:text-navy-600"
                  placeholder="0,00"
                />
              </div>

              <div className="rounded-xl bg-navy-800/80 p-4 mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-navy-300 mb-1">Líquido desejado</p>
                <p className="text-2xl font-display font-bold text-white">{formatBRL(desiredNet)}</p>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                {pricePreview.map((row) => (
                  <div key={row.method} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
                    <span className="font-semibold text-navy-100">{row.label}</span>
                    <span className="text-right text-white">
                      {row.installments > 1 ? `${row.installments}x ${formatBRL(row.installmentValue)}` : formatBRL(row.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
