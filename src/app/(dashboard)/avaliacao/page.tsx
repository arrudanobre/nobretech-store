"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { formatBRL, buildPriceTable, calcProfit, getFeeKey } from "@/lib/helpers"
import { PRODUCT_CATALOG, CATEGORIES, GRADES, PAYMENT_METHODS } from "@/lib/constants"
import {
  Smartphone,
  TabletSmartphone,
  Watch,
  Headphones,
  Monitor,
  MapPinned,
  Search,
  ArrowRight,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Info,
  Copy,
  Percent,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"

const categoryIcons: Record<string, React.ElementType> = {
  iphone: Smartphone,
  ipad: TabletSmartphone,
  applewatch: Watch,
  airpods: Headphones,
  macbook: Monitor,
  garmin: MapPinned,
}

// Fatores de ajuste por estado do aparelho
// Quanto pior o estado, menor o fator (pagamos menos)
const gradeFactors: Record<string, { factor: number; label: string }> = {
  "A+": { factor: 0.92, label: "Excelente — quase novo" },
  "A": { factor: 0.85, label: "Muito bom — marcas mínimas" },
  "A-": { factor: 0.78, label: "Bom — riscos leves visíveis" },
  "B+": { factor: 0.68, label: "Regular — marcas de uso visíveis" },
  "B": { factor: 0.58, label: "Ruim — sinais evidentes de uso" },
}

// Fator por saúde da bateria
const batteryFactor = (health: number | undefined): number => {
  if (!health) return 0.95
  if (health >= 95) return 1.0
  if (health >= 90) return 0.97
  if (health >= 85) return 0.93
  if (health >= 80) return 0.88
  if (health >= 70) return 0.82
  return 0.75
}

export default function TradeInEvalPage() {
  const [category, setCategory] = useState("")
  const [modelIdx, setModelIdx] = useState(0)
  const [storage, setStorage] = useState("")
  const [color, setColor] = useState("")
  const [grade, setGrade] = useState("")
  const [batteryHealth, setBatteryHealth] = useState("")
  const [imei, setImei] = useState("")
  const [notes, setNotes] = useState("")
  const [marginPercent, setMarginPercent] = useState(35)
  const [manualTradeInValue, setManualTradeInValue] = useState<string>("")

  const [supplierPrices, setSupplierPrices] = useState<any[]>([])
  const [loadingPrices, setLoadingPrices] = useState(true)

  // Upgrade device selection
  const [upgradeSearch, setUpgradeSearch] = useState("")
  const [selectedUpgrade, setSelectedUpgrade] = useState<{
    id: string
    name: string
    costPrice: number
    suggestedPrice: number
  } | null>(null)
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)

  // Financial settings for fee-based pricing
  const [financialSettings, setFinancialSettings] = useState<Record<string, number>>({})
  const [loadingFees, setLoadingFees] = useState(true)

  // Fetch inventory items (cost_price devices)
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const { data } = await supabase
          .from("inventory")
          .select("id, imei, purchase_price, suggested_price, battery_health, status, product_catalog(model, variant, storage, color)")
          .order("created_at", { ascending: false })
        if (data) {
          const items = data.map((item: any) => ({
            id: item.id,
            name: `${item.product_catalog?.model || "Produto"}${item.product_catalog?.variant ? " " + item.product_catalog.variant : ""}${item.product_catalog?.storage ? " " + item.product_catalog.storage : ""} ${item.product_catalog?.color || ""}`.trim(),
            costPrice: item.purchase_price || 0,
            suggestedPrice: item.suggested_price || 0,
            battery: item.battery_health || 0,
          }))
          setInventoryItems(items)
        }
      } catch { /* ignore */ }
      finally { setLoadingInventory(false) }
    }
    fetchInventory()
  }, [])

  // Fetch financial settings
  useEffect(() => {
    const fetchFees = async () => {
      try {
        const { data } = await supabase
          .from("financial_settings")
          .select("*")
          .limit(1)
          .single()
        if (data) {
          setFinancialSettings({
            pix: Number(data.pix_fee_pct) || 0,
            cash: Number(data.cash_discount_pct) || 0,
            debit: Number(data.debit_fee_pct) || 0,
            credit_1x: Number(data.credit_1x_fee_pct) || 0,
            credit_2x: Number(data.credit_2x_fee_pct) || 0,
            credit_3x: Number(data.credit_3x_fee_pct) || 0,
            credit_4x: Number(data.credit_4x_fee_pct) || 0,
            credit_5x: Number(data.credit_5x_fee_pct) || 0,
            credit_6x: Number(data.credit_6x_fee_pct) || 0,
            credit_7x: Number(data.credit_7x_fee_pct) || 0,
            credit_8x: Number(data.credit_8x_fee_pct) || 0,
            credit_9x: Number(data.credit_9x_fee_pct) || 0,
            credit_10x: Number(data.credit_10x_fee_pct) || 0,
            credit_11x: Number(data.credit_11x_fee_pct) || 0,
            credit_12x: Number(data.credit_12x_fee_pct) || 0,
          })
        }
      } catch { /* use empty settings */ }
      finally { setLoadingFees(false) }
    }
    fetchFees()
  }, [])

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const { data } = await supabase
          .from("supplier_prices")
          .select("*")
          .order("created_at", { ascending: false })
        if (data) setSupplierPrices(data)
      } catch { /* fallback: empty */ }
      finally { setLoadingPrices(false) }
    }
    fetchPrices()
  }, [])

  const models = useMemo(() => {
    const cat = PRODUCT_CATALOG[category as keyof typeof PRODUCT_CATALOG]
    return cat ? cat.models : []
  }, [category])

  const selectedModel = models[modelIdx]

  // Filtrar preços de fornecedor que batem com o modelo selecionado
  const matchingPrices = useMemo(() => {
    if (!category || !selectedModel) return []
    return supplierPrices.filter((p: any) => {
      const matchCategory = p.category === category
      const matchModel = p.model === selectedModel.name
      const matchStorage = !storage || !p.storage || p.storage === storage
      const matchGrade = !grade || !p.grade || p.grade === grade
      return matchCategory && matchModel && matchStorage && matchGrade
    })
  }, [category, selectedModel, storage, grade, supplierPrices])

  const avgSupplierPrice = useMemo(() => {
    if (matchingPrices.length === 0) return 0
    return matchingPrices.reduce((sum: number, p: any) => sum + Number(p.price), 0) / matchingPrices.length
  }, [matchingPrices])

  const minSupplierPrice = useMemo(() => {
    if (matchingPrices.length === 0) return 0
    return Math.min(...matchingPrices.map((p: any) => Number(p.price)))
  }, [matchingPrices])

  const maxSupplierPrice = useMemo(() => {
    if (matchingPrices.length === 0) return 0
    return Math.max(...matchingPrices.map((p: any) => Number(p.price)))
  }, [matchingPrices])

  // Cálculo da avaliação
  const evaluation = useMemo(() => {
    if (!selectedModel) return null

    const gf = gradeFactors[grade]?.factor ?? 0.70
    const bf = batteryFactor(batteryHealth ? parseInt(batteryHealth) : undefined)

    // Se temos preços da MESMA grade, usamos direto sem fator de grade
    // Se não temos preços da mesma grade, aplicamos o fator de grade
    const hasGradeSpecificPrices = grade && matchingPrices.length > 0

    let basePrice: number
    if (hasGradeSpecificPrices) {
      // Preços já são da grade certa — usa média direto
      basePrice = avgSupplierPrice
    } else if (matchingPrices.length > 0 && !grade) {
      // Sem grade selecionada — aplica fator padrão
      basePrice = avgSupplierPrice * 0.80
    } else {
      basePrice = 0
    }

    if (basePrice === 0) return null

    // Preço sugerido de compra (trade-in) = base * bateria
    // (já está ajustado pela grade pois os preços são por grade)
    const tradeInValue = basePrice * bf

    // Arredondar para baixo (praticidade)
    const rounded = Math.floor(tradeInValue / 10) * 10

    return {
      avgPrice: matchingPrices.length > 0 ? avgSupplierPrice : 0,
      minPrice: matchingPrices.length > 0 ? minSupplierPrice : 0,
      maxPrice: matchingPrices.length > 0 ? maxSupplierPrice : 0,
      gradeFactor: gf,
      batteryFactor: bf,
      tradeInValue: Math.round(tradeInValue),
      tradeInRounded: rounded,
      priceCount: matchingPrices.length,
      hasGradePrices: hasGradeSpecificPrices,
    }
  }, [selectedModel, avgSupplierPrice, minSupplierPrice, maxSupplierPrice, matchingPrices.length, grade, batteryHealth])

  const effectiveTradeInValue = useMemo(() => {
    if (manualTradeInValue !== "" && !isNaN(Number(manualTradeInValue))) {
      return Number(manualTradeInValue)
    }
    return evaluation?.tradeInRounded || 0
  }, [evaluation, manualTradeInValue])

  const hasEnoughData = selectedModel && (grade || supplierPrices.length > 0)

  // Filtered inventory for upgrade search
  const filteredInventory = useMemo(() => {
    if (!upgradeSearch) return inventoryItems
    const term = upgradeSearch.toLowerCase()
    return inventoryItems.filter(
      (item) => item.name.toLowerCase().includes(term) || item.id.includes(term)
    )
  }, [upgradeSearch, inventoryItems])

  // Upgrade profitability analysis
  const upgradeAnalysis = useMemo(() => {
    if (!selectedUpgrade || !evaluation || effectiveTradeInValue <= 0) return null

    const upgradeCost = selectedUpgrade.costPrice
    const upgradeSuggestedPrice = selectedUpgrade.suggestedPrice || upgradeCost * 1.3
    const tradeInCredit = effectiveTradeInValue
    const minBaseCost = upgradeCost - tradeInCredit

    let suggestedDifference = upgradeSuggestedPrice - tradeInCredit
    if (suggestedDifference < 0) suggestedDifference = 0

    // Build price table targeting the suggested difference to achieve desired profit
    const priceTable = buildPriceTable(suggestedDifference, 0, financialSettings as any)

    const analysis = priceTable.map((row) => {
      // Lucro = (Volta Líquida) - (Custo Descoberto)
      const profit = calcProfit(row.price, minBaseCost, row.fee)
      return {
        ...row,
        profit,
      }
    })

    const allProfitable = analysis.every((r) => r.profit >= 0)
    const hasAnyProfit = analysis.some((r) => r.profit >= 0)

    return {
      upgradeCost,
      upgradeSuggestedPrice,
      tradeInCredit,
      minBaseCost,
      suggestedDifference,
      priceTable: analysis,
      allProfitable,
      hasAnyProfit,
    }
  }, [selectedUpgrade, evaluation, effectiveTradeInValue, financialSettings])

  // Trade-in resale profitability analysis
  const tradeInResaleAnalysis = useMemo(() => {
    if (!evaluation || effectiveTradeInValue <= 0) return null
    
    // TETO DE MERCADO: Não importa quanto o lojista pague, ele nunca venderá por mais que (Preço Fornecedor + Margem)
    const marketReferenceBase = evaluation.avgPrice > 0 ? evaluation.avgPrice : evaluation.tradeInRounded;
    const marketCeiling = Math.round(marketReferenceBase * (1 + marginPercent / 100));

    const baseCost = effectiveTradeInValue;
    // Ele sugere o preço matemático do custo, limitado ao teto real daquele telefone no mercado.
    const mathematicalSalePrice = Math.round(baseCost * (1 + marginPercent / 100));
    const suggestedSalePrice = Math.min(mathematicalSalePrice, marketCeiling);
    
    const estimatedMargin = suggestedSalePrice - baseCost;

    const priceTable = buildPriceTable(suggestedSalePrice, 0, financialSettings as any);
    const analysis = priceTable.map((row) => {
      const profit = calcProfit(row.price, baseCost, row.fee);
      return {
        ...row,
        profit,
      };
    });

    return {
      suggestedSalePrice,
      baseCost,
      estimatedMargin,
      priceTable: analysis
    };
  }, [evaluation, effectiveTradeInValue, marginPercent, financialSettings])
  
  const expectedProfitWithoutTradeIn = upgradeAnalysis?.upgradeSuggestedPrice ? upgradeAnalysis.upgradeSuggestedPrice - upgradeAnalysis.upgradeCost : 0;
  
  // Total expected profit combining both sales
  const expectedProfitWithTradeIn = upgradeAnalysis && tradeInResaleAnalysis 
    ? expectedProfitWithoutTradeIn + tradeInResaleAnalysis.estimatedMargin
    : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Avaliação de Recebimento</h2>
          <p className="text-sm text-gray-500">
            Calcule quanto pagar em um aparelho de entrada do cliente
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/precos-fornecedor">
            <Button variant="outline" size="sm">
              <TrendingUp className="w-4 h-4 mr-1" /> Preços de Referência
            </Button>
          </Link>
        </div>
      </div>

      {/* Device selector */}
      <div className="bg-card rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm space-y-5">
        <h3 className="font-display font-bold text-navy-900 font-syne flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-royal-500" />
          Dados do Aparelho do Cliente
        </h3>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-navy-900 mb-2">Categoria</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => {
              const Icon = categoryIcons[c.value]
              return (
                <button
                  key={c.value}
                  onClick={() => { setCategory(c.value); setModelIdx(0); }}
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

        {/* Model */}
        {category && (
          <>
            <select
              className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={modelIdx}
              onChange={(e) => setModelIdx(parseInt(e.target.value))}
            >
              <option value="">Selecione o modelo</option>
              {models.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
            </select>

            {selectedModel && (
              <>
                {/* Storage */}
                {(selectedModel as any).storage && (
                  <div>
                    <label className="block text-xs font-medium text-navy-900 mb-2">Armazenamento</label>
                    <div className="flex flex-wrap gap-2">
                      {(selectedModel as any).storage.map((s: string) => (
                        <button
                          key={s}
                          onClick={() => setStorage(s)}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                            storage === s
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

                {/* Size for watches */}
                {(selectedModel as any).sizes && (
                  <div>
                    <label className="block text-xs font-medium text-navy-900 mb-2">Tamanho</label>
                    <div className="flex flex-wrap gap-2">
                      {(selectedModel as any).sizes.map((s: string) => (
                        <button
                          key={s}
                          onClick={() => setStorage(s)}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                            storage === s
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

                {/* Color */}
                {(selectedModel as any).colors && (
                  <div>
                    <label className="block text-xs font-medium text-navy-900 mb-2">Cor</label>
                    <div className="flex flex-wrap gap-2">
                      {(selectedModel as any).colors.map((c: any) => (
                        <button
                          key={c.name}
                          onClick={() => setColor(c.name)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                            color === c.name
                              ? "border-royal-500 ring-2 ring-royal-500/20"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <span className="w-5 h-5 rounded-full border border-gray-300" style={{ backgroundColor: c.hex }} />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Grade + Battery + IMEI */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-navy-900 mb-2">Estado do Aparelho (Grade)</label>
            <div className="flex gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGrade(g.value)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${
                    grade === g.value
                      ? g.color + " border-current"
                      : "bg-white text-gray-400 border-gray-200"
                  }`}
                >
                  {g.value}
                </button>
              ))}
            </div>
            {grade && (
              <p className="text-xs text-gray-400 mt-1">{gradeFactors[grade]?.label}</p>
            )}
          </div>

          <Input
            label="Saúde da Bateria (%)"
            type="number"
            min="0"
            max="100"
            placeholder="Ex: 87 (opcional — melhora a precisão)"
            value={batteryHealth}
            onChange={(e) => setBatteryHealth(e.target.value)}
          />

          <Input
            label="IMEI (opcional)"
            placeholder="Para registro"
            value={imei}
            onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
          />

          <Input
            label="Observações"
            placeholder="Ex: Tela com risco pequeno, sem carregador..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Upgrade Device Selector */}
      {evaluation && (
        <div className="bg-card rounded-2xl border border-royal-500/30 p-4 sm:p-6 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-navy-900 font-syne flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5 text-royal-500" />
            Aparelho para Upgrade
          </h3>
          <p className="text-xs text-gray-500">
            Selecione o aparelho do estoque que o cliente quer levar. O sistema vai calcular o preço mínimo de revenda para você ter lucro.
          </p>

          <Input
            placeholder="Buscar por modelo, nome..."
            value={upgradeSearch}
            onChange={(e) => setUpgradeSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />

          {loadingInventory ? (
            <p className="text-sm text-gray-400 text-center py-4">Carregando estoque...</p>
          ) : filteredInventory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum produto encontrado no estoque.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredInventory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedUpgrade({
                    id: item.id,
                    name: item.name,
                    costPrice: item.costPrice,
                    suggestedPrice: item.suggestedPrice,
                  })}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all hover:border-royal-500 hover:bg-royal-100/20 ${
                    selectedUpgrade?.id === item.id
                      ? "border-royal-500 bg-royal-100/30"
                      : "border-gray-100"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-navy-900">{item.name}</p>
                    <p className="text-xs text-gray-500">Bateria {item.battery}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-navy-900">{formatBRL(item.costPrice)}</p>
                    <p className="text-xs text-gray-400">Custo</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedUpgrade && (
            <div className="bg-surface rounded-xl p-3 flex items-center gap-3 border border-royal-500/20">
              <div className="w-10 h-10 rounded-lg bg-royal-100 flex items-center justify-center shrink-0">
                <ArrowUpDown className="w-5 h-5 text-royal-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy-900 truncate">{selectedUpgrade.name}</p>
                <p className="text-xs text-gray-500">Custo: {formatBRL(selectedUpgrade.costPrice)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedUpgrade(null); setUpgradeSearch(""); }}
                className="shrink-0 text-gray-400 hover:text-danger-500"
              >
                Limpar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Profitability Analysis - Resumo Executivo Simplificado */}
      {upgradeAnalysis && tradeInResaleAnalysis && (() => {
        const profitExtra = tradeInResaleAnalysis.estimatedMargin;
        const isBetter = profitExtra > 0;
        const isWorse = profitExtra < 0;
        const isNeutral = profitExtra === 0;

        let statusConfig = {
          borderColor: "border-gray-100",
          bgAlert: "bg-success-100/30",
          borderAlert: "border-transparent",
          textColor: "text-green-800",
          subTextColor: "text-green-700",
          iconColor: "text-green-700",
          title: "Negócio Fantástico!",
          Icon: CheckCircle2,
          description: `Neste cenário, você tem a oportunidade de lucrar ${formatBRL(profitExtra)} a MAIS do que simplesmente vender o seu aparelho direto sem trocas. Seu lucro total pula para ${formatBRL(expectedProfitWithTradeIn)}.`
        };

        if (isNeutral) {
          statusConfig = {
            borderColor: "border-gray-100",
            bgAlert: "bg-warning-100/30",
            borderAlert: "border-transparent",
            textColor: "text-warning-800",
            subTextColor: "text-warning-700",
            iconColor: "text-warning-700",
            title: "Negócio Neutro",
            Icon: Info,
            description: "Você está trocando 'seis por meia dúzia' no lucro final, mas o Trade-in pode ajudar a girar o estoque do aparelho novo mais rápido."
          };
        } else if (isWorse) {
          statusConfig = {
            borderColor: "border-gray-100",
            bgAlert: "bg-danger-100/30",
            borderAlert: "border-transparent",
            textColor: "text-danger-800",
            subTextColor: "text-danger-700",
            iconColor: "text-danger-700",
            title: "Cuidado: Prejuízo na Troca",
            Icon: AlertTriangle,
            description: `Você está pagando muito caro no aparelho do cliente. No final de tudo, você terá ${formatBRL(Math.abs(profitExtra))} a MENOS de lucro do que se vendesse o aparelho novo puramente no dinheiro.`
          };
        }

        return (
          <div className={`bg-card rounded-2xl border ${statusConfig.borderColor} p-4 sm:p-6 space-y-6 transition-all`}>
            <h3 className="font-display font-bold text-navy-900 font-syne flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-royal-500" />
              Análise de Resultado Final
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface rounded-xl p-5 border border-gray-50 flex flex-col justify-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Venda Direta (Sem Troca)</p>
                <div className="flex justify-between items-center text-sm mb-1 text-gray-500">
                  <span>Preço sugerido</span>
                  <span>{formatBRL(upgradeAnalysis.upgradeSuggestedPrice)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-3 border-b border-gray-100 text-gray-500">
                  <span>Custo upgrade</span>
                  <span className="text-danger-400">- {formatBRL(upgradeAnalysis.upgradeCost)}</span>
                </div>
                <div className="flex justify-between items-center text-base mt-3">
                  <span className="font-bold text-navy-900">Lucro Original</span>
                  <span className="font-bold text-navy-900">{formatBRL(expectedProfitWithoutTradeIn)}</span>
                </div>
              </div>

              <div className="bg-royal-50/30 rounded-xl p-5 border border-royal-100/50 flex flex-col justify-center relative">
                <p className="text-xs font-semibold text-royal-600 uppercase tracking-wider mb-3">Ciclo de Troca Completo</p>
                <div className="flex justify-between items-center text-sm mb-1 text-navy-700/70">
                  <span>Lucro do Novo</span>
                  <span>{formatBRL(expectedProfitWithoutTradeIn)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-3 border-b border-royal-100 text-navy-700/70">
                  <span>Margem no Usado</span>
                  <span className={profitExtra >= 0 ? "text-success-600" : "text-danger-500"}>
                    {profitExtra >= 0 ? "+" : "-"} {formatBRL(Math.abs(profitExtra))}
                  </span>
                </div>
                <div className="flex justify-between items-center text-lg mt-3">
                  <span className="font-bold text-navy-900">Lucro Total</span>
                  <span className={`font-bold text-xl ${isBetter ? "text-success-600" : isWorse ? "text-danger-600" : "text-warning-600"}`}>
                    {formatBRL(expectedProfitWithTradeIn)}
                  </span>
                </div>
              </div>
            </div>

            <div className={`${statusConfig.bgAlert} rounded-xl p-4 border ${statusConfig.borderAlert} flex items-start gap-3`}>
              <statusConfig.Icon className={`w-5 h-5 ${statusConfig.iconColor} shrink-0 mt-0.5`} />
              <div>
                <p className={`${statusConfig.textColor} font-bold`}>{statusConfig.title}</p>
                <p className={`${statusConfig.subTextColor} text-sm mt-0.5 leading-relaxed`}>
                  {statusConfig.description}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Result */}
      {evaluation && (
        <div className="bg-card rounded-2xl border border-royal-500/30 p-4 sm:p-6 shadow-sm space-y-5">
          <h3 className="font-display font-bold text-navy-900 font-syne flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-royal-500" />
            Avaliação Sugerida
          </h3>

          {/* Supplier reference */}
          <div className="bg-surface rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referência nos Fornecedores</p>

            {loadingPrices ? (
              <p className="text-sm text-gray-400">Carregando preços de referência...</p>
            ) : evaluation.priceCount > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Mínimo</p>
                    <p className="font-bold text-navy-900">{formatBRL(evaluation.minPrice)}</p>
                    <TrendingDown className="w-3 h-3 text-danger-500 mx-auto mt-0.5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Média</p>
                    <p className="font-bold text-royal-500">{formatBRL(evaluation.avgPrice)}</p>
                    <Info className="w-3 h-3 text-royal-500 mx-auto mt-0.5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Máximo</p>
                    <p className="font-bold text-navy-900">{formatBRL(evaluation.maxPrice)}</p>
                    <TrendingUp className="w-3 h-3 text-success-500 mx-auto mt-0.5" />
                  </div>
                </div>
                <Badge variant="blue">{evaluation.priceCount} preços encontrados</Badge>
              </>
            ) : (
              <div className="bg-yellow-100/50 rounded-lg p-3">
                <p className="text-sm text-yellow-700 font-medium">Sem preços de referência cadastrados</p>
                <p className="text-xs text-yellow-600 mt-1">
                  A avaliação usa apenas os fatores de estado/bateria com preços estimados.
                  <Link href="/precos-fornecedor" className="underline ml-1">Adicione preços</Link> para maior precisão.
                </p>
              </div>
            )}
          </div>

          {/* Trade-in value (Editable) */}
          <div className="bg-gradient-to-br from-royal-500 to-royal-700 rounded-xl p-5 text-white shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Percent className="w-32 h-32" />
            </div>
            
            <p className="text-xs font-medium text-royal-100 uppercase tracking-wider mb-2">Valor Fixo de Recebimento (Trade-In)</p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 relative z-10">
              <div className="flex-1">
                <label className="text-xs text-royal-200 block mb-1">Ajuste Manual Pelo Logista (R$)</label>
                <div className="relative max-w-[280px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-900 font-bold mb-0.5 mt-px text-lg">R$</span>
                  <input 
                    type="number"
                    className="w-full bg-white text-navy-900 font-bold text-3xl rounded-xl py-2 pl-12 pr-3 focus:outline-none focus:ring-4 focus:ring-royal-300/50 border-0 transition-shadow"
                    value={manualTradeInValue}
                    onChange={(e) => setManualTradeInValue(e.target.value)}
                    placeholder={evaluation.tradeInRounded.toString()}
                  />
                </div>
              </div>
              {manualTradeInValue !== "" && Number(manualTradeInValue) !== evaluation.tradeInRounded && (
                <div className="bg-white/20 text-white text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 mt-2 sm:mt-0 font-medium whitespace-nowrap">
                  <Info className="w-3.5 h-3.5" /> Modificado pelo Lojista
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4 text-xs text-royal-100 border-t border-royal-400/30 pt-3">
              <div className="flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Sistema Sugeria: <strong>{formatBRL(evaluation.tradeInRounded)}</strong>
              </div>
              <div className="flex items-center gap-1">
                 Fator de Avaliação: {(evaluation.gradeFactor * evaluation.batteryFactor).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-surface rounded-xl p-4 space-y-2 text-xs">
            <p className="font-semibold text-gray-500 uppercase tracking-wider mb-3">Composição da Sugestão Técnica</p>
            {avgSupplierPrice > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Média fornecedores</span>
                <span className="font-medium text-sm">{formatBRL(avgSupplierPrice)}</span>
              </div>
            )}
            {grade && (
              <div className="flex justify-between">
                <span className="text-gray-600">Ajuste por estado ({grade})</span>
                <span className="font-medium text-danger-500">× {evaluation.gradeFactor.toFixed(2)}</span>
              </div>
            )}
            {batteryHealth && (
              <div className="flex justify-between">
                <span className="text-gray-600">Ajuste por bateria ({batteryHealth}%)</span>
                <span className="font-medium text-danger-500">× {evaluation.batteryFactor.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Suggested selling price with margin slider */}
          <div className="bg-success-100/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Sugestão de Revenda</p>
              <div className="flex items-center gap-2">
                <Percent className="w-3 h-3 text-green-700" />
                <span className="text-sm font-bold text-green-800">{marginPercent}%</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="60"
                step="1"
                value={marginPercent}
                onChange={(e) => setMarginPercent(parseInt(e.target.value))}
                className="flex-1 accent-green-600 h-2"
              />
              <span className="text-xs text-green-600 w-16 text-right">
                {marginPercent < 25 ? "Baixa" : marginPercent < 40 ? "Normal" : marginPercent < 50 ? "Alta" : "Premium"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-700">Sugerido de venda (estimado)</span>
              <span className="font-bold text-green-800">{formatBRL(tradeInResaleAnalysis?.suggestedSalePrice || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-700">Margem estimada bruta</span>
              <span className="font-bold text-success-500">+{formatBRL(tradeInResaleAnalysis?.estimatedMargin || 0)}</span>
            </div>
          </div>

          {/* Trade-in future resale installments logic */}
          {tradeInResaleAnalysis && (
            <div className="bg-surface rounded-xl p-4 space-y-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Simulação de Parcelas (Venda Futura)</p>
              <p className="text-xs text-gray-500 mb-2">Mostra o lucro real na venda do aparelho do cliente baseado na sua Sugestão de Revenda, descontando os custos e as taxas da maquininha.</p>
              
              <div className="space-y-2 mt-2">
                {tradeInResaleAnalysis.priceTable.map((row: any) => {
                  const method = PAYMENT_METHODS.find((pm) => pm.value === row.method)
                  if (!method) return null
                  const isProfitable = row.profit > 0

                  return (
                    <div
                      key={row.method}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl border gap-1 sm:gap-0 ${
                        isProfitable
                          ? "border-success-500/30 bg-success-50/50"
                          : "border-danger-500/30 bg-danger-50/50"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isProfitable ? "text-success-700" : "text-danger-700"}`}>
                          {row.label}
                        </p>
                        {method.maxInstallments > 1 && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-bold">{method.maxInstallments}x de {formatBRL(row.price / method.maxInstallments)}</span>
                          </p>
                        )}
                      </div>
                      <div className="text-left sm:text-right">
                        <p className={`text-sm font-bold ${isProfitable ? "text-success-700" : "text-danger-700"}`}>
                          {formatBRL(row.price)}
                        </p>
                        <p className={`text-xs font-medium ${row.profit >= 0 ? "text-success-600" : "text-danger-500"}`}>
                          {row.profit >= 0 ? "Lucro Líquido: +" : "Prejuízo: "}{formatBRL(row.profit)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(`Avaliação: ${selectedModel.name} ${storage || ""}\nValor sugerido: ${formatBRL(evaluation.tradeInRounded)}`)
              }}
            >
              <Copy className="w-4 h-4 mr-2" /> Copiar Avaliação
            </Button>
            <Link href={`/vendas/nova?tradein=${encodeURIComponent(btoa(JSON.stringify({
              category,
              model: selectedModel.name,
              storage,
              color,
              grade,
              batteryHealth,
              imei,
              notes,
              suggestedValue: evaluation.tradeInRounded,
            })))}`}>
              <Button variant="success">
                Criar Venda <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Empty state if no model selected */}
      {!selectedModel && (
        <div className="bg-card rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-navy-900 font-medium">Selecione o modelo do aparelho</p>
          <p className="text-sm text-gray-500 mt-1">Escolha categoria, modelo e estado para ver a avaliação sugerida.</p>
        </div>
      )}
    </div>
  )
}
