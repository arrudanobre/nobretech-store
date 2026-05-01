"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { addMonthsISO, currentMonthKey, formatBRL, monthRangeISO } from "@/lib/helpers"
import { ArrowDownIcon, ArrowUpIcon, PieChart, TrendingUp, TrendingDown, Receipt } from "lucide-react"

type Transaction = {
  id: string
  category: string
  description: string
  amount: number
  date: string
}

export default function GastosPage() {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState<string>(currentMonthKey()) // YYYY-MM

  // We will fetch both current and previous month to show variation
  const [prevData, setPrevData] = useState<Transaction[]>([])

  useEffect(() => {
    fetchData()
  }, [filterMonth])

  const fetchData = async () => {
    setLoading(true)
    try {
      const currentRange = monthRangeISO(filterMonth)
      const previousMonth = addMonthsISO(`${filterMonth}-01`, -1)?.slice(0, 7) || currentMonthKey()
      const previousRange = monthRangeISO(previousMonth)

      const [currentRes, prevRes] = await Promise.all([
        (supabase.from("transactions") as any)
          .select("*")
          .eq("type", "expense")
          .gte("date", currentRange.start)
          .lte("date", currentRange.end),
        (supabase.from("transactions") as any)
          .select("*")
          .eq("type", "expense")
          .gte("date", previousRange.start)
          .lte("date", previousRange.end)
      ])

      setData(currentRes.data || [])
      setPrevData(prevRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const { totalGasto, topCategory, totalCount, expensesByCategory } = useMemo(() => {
    let totalGasto = 0
    const catMap: Record<string, number> = {}

    data.forEach(t => {
      const val = Number(t.amount)
      totalGasto += val
      catMap[t.category] = (catMap[t.category] || 0) + val
    })

    let topCategory = "Nenhuma"
    let maxVal = 0
    
    const expensesByCategory = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    if (expensesByCategory.length > 0) {
      topCategory = expensesByCategory[0].name
      maxVal = expensesByCategory[0].value
    }

    return { totalGasto, topCategory, totalCount: data.length, expensesByCategory }
  }, [data])

  const { variation, variationType } = useMemo(() => {
    let prevTotal = 0
    prevData.forEach(t => { prevTotal += Number(t.amount) })

    if (prevTotal === 0) return { variation: 0, variationType: "neutral" as const }
    
    const diff = totalGasto - prevTotal
    const pct = (diff / prevTotal) * 100
    
    return { 
      variation: Math.abs(pct), 
      variationType: diff > 0 ? "up" as const : "down" as const
    }
  }, [totalGasto, prevData])

  return (
    <div className="space-y-6">
      
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-navy-900 font-display font-semibold text-lg">Análise de Despesas</h2>
          <p className="text-sm text-gray-500">Acompanhe onde o dinheiro da empresa está saindo</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Input 
            type="month" 
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="w-[160px] bg-white border-gray-200 shadow-sm"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-sm font-medium text-gray-500">Total Gasto</span>
          </div>
          <div className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            {formatBRL(totalGasto)}
          </div>
        </Card>

        <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", 
              variationType === "up" ? "bg-red-500/10 text-red-500" : variationType === "down" ? "bg-emerald-500/10 text-emerald-500" : "bg-gray-500/10 text-gray-500"
            )}>
              {variationType === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
            <span className="text-sm font-medium text-gray-500">vs Mês Anterior</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl sm:text-3xl font-display font-bold", 
              variationType === "up" ? "text-red-500" : variationType === "down" ? "text-emerald-500" : "text-navy-900"
            )}>
              {variationType === "up" ? "+" : variationType === "down" ? "-" : ""}{variation.toFixed(1)}%
            </span>
          </div>
        </Card>

        <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
              <PieChart className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-sm font-medium text-gray-500">Maior Categoria</span>
          </div>
          <div className="text-lg font-medium text-navy-900 truncate" title={topCategory}>
            {topCategory}
          </div>
        </Card>

        <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <FileTextIcon className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-gray-500">Lançamentos</span>
          </div>
          <div className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            {totalCount}
          </div>
        </Card>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 border-4 border-royal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : expensesByCategory.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Receipt className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-medium text-navy-900 mb-1">Nenhum gasto</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Sua empresa não registrou nenhuma despesa neste mês.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Visual Breakdown (Bar chart approach) */}
          <Card className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <h3 className="font-display font-semibold text-lg text-navy-900 mb-6">Composição de Gastos</h3>
            
            <div className="space-y-5">
              {expensesByCategory.map((cat, index) => {
                const percentage = totalGasto > 0 ? (cat.value / totalGasto) * 100 : 0
                
                // We assign some nice colors sequentially
                const colors = [
                  "bg-royal-500", "bg-emerald-500", "bg-orange-500", 
                  "bg-purple-500", "bg-pink-500", "bg-blue-500", "bg-yellow-500"
                ]
                const barColor = colors[index % colors.length]
                
                return (
                  <div key={cat.name}>
                    <div className="flex justify-between items-end mb-2">
                      <span className="font-medium text-navy-900">{cat.name}</span>
                      <div className="text-right">
                        <span className="font-semibold text-navy-900 block">{formatBRL(cat.value)}</span>
                        <span className="text-xs text-gray-500">{percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full", barColor)} 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* List by category */}
          <Card className="p-0 bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-semibold text-lg text-navy-900">Resumo por Categoria</h3>
            </div>
            <div className="divide-y divide-gray-100 overflow-y-auto flex-1 max-h-[400px]">
              {expensesByCategory.map(cat => (
                <div key={cat.name} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="font-medium text-navy-900">{cat.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {data.filter(d => d.category === cat.name).length} lançamento(s)
                      </div>
                    </div>
                  </div>
                  <div className="font-medium text-red-600">
                    -{formatBRL(cat.value)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function FileTextIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ")
}
