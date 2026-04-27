"use client"

import { useState, useEffect } from "react"
import { KPICard } from "@/components/ui/kpi-card"
import { Button } from "@/components/ui/button"
import { formatBRL, calcPrice } from "@/lib/helpers"
import { PAYMENT_METHODS } from "@/lib/constants"
import { DollarSign, TrendingUp, TrendingDown, Percent } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"

const monthlyData = [
  { month: "Out", revenue: 12400, cost: 9500 },
  { month: "Nov", revenue: 18200, cost: 13800 },
  { month: "Dez", revenue: 15800, cost: 12000 },
  { month: "Jan", revenue: 22300, cost: 16500 },
  { month: "Fev", revenue: 19500, cost: 14800 },
  { month: "Mar", revenue: 25800, cost: 19200 },
]

// Taxas equivalentes calculadas a partir dos acrescimos do Mercado Pago (abr/2026)
// Base 1x: 3,26% → R$ 1.000 → R$ 1.034 (calcPrice teto)
// Para Nx: customer_total = R$ 1.034 × (1 + acrescimo_N/100)
// fee_equiv = (1 - 1000 / customer_total) × 100
const defaultSettings = {
  debit_fee_pct: 1.47,
  credit_1x_fee_pct: 3.26,
  credit_2x_fee_pct: 11.77,
  credit_3x_fee_pct: 13.03,
  credit_4x_fee_pct: 13.13,
  credit_5x_fee_pct: 15.37,
  credit_6x_fee_pct: 15.38,
  credit_7x_fee_pct: 17.12,
  credit_8x_fee_pct: 17.12,
  credit_9x_fee_pct: 19.17,
  credit_10x_fee_pct: 19.82,
  credit_11x_fee_pct: 19.82,
  credit_12x_fee_pct: 20.78,
  credit_13x_fee_pct: 20.78,
  credit_14x_fee_pct: 20.78,
  credit_15x_fee_pct: 20.78,
  credit_16x_fee_pct: 20.78,
  credit_17x_fee_pct: 20.78,
  credit_18x_fee_pct: 20.78,
  pix_fee_pct: 0,
  cash_discount_pct: 0,
  default_margin_pct: 15,
  default_warranty_months: 3,
}

export default function FinancePage() {
  const [settings, setSettings] = useState(defaultSettings)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  // Load settings from DB on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await (supabase
          .from("financial_settings") as any)
          .select("*")
          .limit(1)
        if (!error && data && data.length > 0) {
          const row = data[0]
          setSettings({
            debit_fee_pct: row.debit_fee_pct ?? 0,
            credit_1x_fee_pct: row.credit_1x_fee_pct ?? 0,
            credit_2x_fee_pct: row.credit_2x_fee_pct ?? 0,
            credit_3x_fee_pct: row.credit_3x_fee_pct ?? 0,
            credit_4x_fee_pct: row.credit_4x_fee_pct ?? 0,
            credit_5x_fee_pct: row.credit_5x_fee_pct ?? 0,
            credit_6x_fee_pct: row.credit_6x_fee_pct ?? 0,
            credit_7x_fee_pct: row.credit_7x_fee_pct ?? 0,
            credit_8x_fee_pct: row.credit_8x_fee_pct ?? 0,
            credit_9x_fee_pct: row.credit_9x_fee_pct ?? 0,
            credit_10x_fee_pct: row.credit_10x_fee_pct ?? 0,
            credit_11x_fee_pct: row.credit_11x_fee_pct ?? 0,
            credit_12x_fee_pct: row.credit_12x_fee_pct ?? 0,
            credit_13x_fee_pct: row.credit_13x_fee_pct ?? row.credit_12x_fee_pct ?? 0,
            credit_14x_fee_pct: row.credit_14x_fee_pct ?? row.credit_12x_fee_pct ?? 0,
            credit_15x_fee_pct: row.credit_15x_fee_pct ?? row.credit_12x_fee_pct ?? 0,
            credit_16x_fee_pct: row.credit_16x_fee_pct ?? row.credit_12x_fee_pct ?? 0,
            credit_17x_fee_pct: row.credit_17x_fee_pct ?? row.credit_12x_fee_pct ?? 0,
            credit_18x_fee_pct: row.credit_18x_fee_pct ?? row.credit_12x_fee_pct ?? 0,
            pix_fee_pct: row.pix_fee_pct ?? 0,
            cash_discount_pct: row.cash_discount_pct ?? 0,
            default_margin_pct: row.default_margin_pct ?? 0,
            default_warranty_months: row.default_warranty_months ?? 0,
          })
        }
      } catch {
        // Use default fallback
      } finally {
        setIsLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Try to update existing record, insert if none exists
      const { error } = await (supabase
        .from("financial_settings") as any)
        .upsert({
          debit_fee_pct: settings.debit_fee_pct,
          credit_1x_fee_pct: settings.credit_1x_fee_pct,
          credit_2x_fee_pct: settings.credit_2x_fee_pct,
          credit_3x_fee_pct: settings.credit_3x_fee_pct,
          credit_4x_fee_pct: settings.credit_4x_fee_pct,
          credit_5x_fee_pct: settings.credit_5x_fee_pct,
          credit_6x_fee_pct: settings.credit_6x_fee_pct,
          credit_7x_fee_pct: settings.credit_7x_fee_pct,
          credit_8x_fee_pct: settings.credit_8x_fee_pct,
          credit_9x_fee_pct: settings.credit_9x_fee_pct,
          credit_10x_fee_pct: settings.credit_10x_fee_pct,
          credit_11x_fee_pct: settings.credit_11x_fee_pct,
          credit_12x_fee_pct: settings.credit_12x_fee_pct,
          credit_13x_fee_pct: settings.credit_13x_fee_pct,
          credit_14x_fee_pct: settings.credit_14x_fee_pct,
          credit_15x_fee_pct: settings.credit_15x_fee_pct,
          credit_16x_fee_pct: settings.credit_16x_fee_pct,
          credit_17x_fee_pct: settings.credit_17x_fee_pct,
          credit_18x_fee_pct: settings.credit_18x_fee_pct,
          pix_fee_pct: settings.pix_fee_pct,
          cash_discount_pct: settings.cash_discount_pct,
          default_margin_pct: settings.default_margin_pct,
          default_warranty_months: settings.default_warranty_months,
        } as any, { onConflict: 'id' })

      if (error) throw error

      setIsEditing(false)
      toast({ title: "Configurações salvas!", description: "As taxas foram atualizadas no banco de dados.", type: "success" })
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err?.message || "Não foi possível salvar as configurações.",
        type: "error",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0)
  const totalCost = monthlyData.reduce((s, m) => s + m.cost, 0)
  const profit = totalRevenue - totalCost
  const avgMargin = ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard title="Receita Total" value={totalRevenue} icon={DollarSign} prefix="currency" gradient />
        <KPICard title="Custo Total" value={totalCost} icon={TrendingDown} prefix="currency" />
        <KPICard title="Lucro" value={profit} icon={TrendingUp} prefix="currency" />
        <KPICard title="Margem Média" value={parseFloat(avgMargin)} icon={Percent} prefix="%" />
      </div>

      {/* Revenue vs Cost Chart */}
      <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-display font-semibold text-navy-900 mb-4 font-syne">Entradas vs Saídas</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatBRL(Number(value))} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }} />
            <Bar dataKey="revenue" name="Entradas" fill="#3A6BC4" radius={[4, 4, 0, 0]} />
            <Bar dataKey="cost" name="Saídas" fill="#E05C5C" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Financial Settings */}
      <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-navy-900 font-syne">Configurações Financeiras</h3>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Editar</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>
              <Button variant="success" size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Default margin */}
          <div className="bg-surface rounded-xl p-3">
            <label className="text-xs font-medium text-gray-500 block mb-1">Margem Padrão (%)</label>
            {isEditing ? (
              <input
                type="number"
                value={settings.default_margin_pct}
                onChange={(e) => setSettings((s) => ({ ...s, default_margin_pct: parseFloat(e.target.value) || 0 }))}
                className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm"
              />
            ) : (
              <p className="text-lg font-bold text-navy-900">{settings.default_margin_pct}%</p>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 col-span-full text-center py-4">Carregando configurações...</p>
          ) : (
            PAYMENT_METHODS
              .filter((m) => !["cash", "pix"].includes(m.value))
              .map((pm) => {
                const key = `${pm.value}_fee_pct` as keyof typeof settings
                const fee = settings[key] ?? 0
                const customerPrice = calcPrice(1000, fee)
                const installmentValue = customerPrice / pm.maxInstallments
                return (
                  <div key={pm.value} className="bg-surface rounded-xl p-3">
                    <label className="text-xs font-medium text-gray-500 block mb-1">{pm.label}</label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={settings[key] as number ?? 0}
                        onChange={(e) => setSettings((s) => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm"
                      />
                    ) : (
                      <>
                        <p className="text-lg font-bold text-navy-900">{fee}%</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Sim 1k → {formatBRL(customerPrice)}
                          {pm.maxInstallments > 1 && ` (${pm.maxInstallments}x ${formatBRL(installmentValue)})`}
                        </p>
                      </>
                    )}
                  </div>
                )
              })
          )}
        </div>
      </div>
    </div>
  )
}
