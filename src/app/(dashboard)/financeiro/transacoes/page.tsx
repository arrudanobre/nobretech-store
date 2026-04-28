"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { formatBRL } from "@/lib/helpers"
import { ArrowDownIcon, ArrowUpIcon, Search, Plus, Calendar, Filter, FileText, ChevronRight, Check } from "lucide-react"

const ENTRADAS_CATEGORIES = [
  "Venda",
  "Reembolso",
  "Aporte do proprietário",
  "Outros"
]

const SAIDAS_CATEGORIES = [
  "Aluguel",
  "Energia / Água / Internet",
  "Funcionários / Comissões",
  "Marketing / Tráfego",
  "Estoque (Peças/Acessórios)",
  "Impostos / Taxas",
  "Retirada de Lucro",
  "Outros"
]

const METHODS = [
  "Dinheiro",
  "Pix",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência"
]

type UnifiedTransaction = {
  id: string
  type: "income" | "expense"
  category: string
  description: string
  amount: number
  date: string
  payment_method: string
  isAuto?: boolean
  notes?: string
}

export default function TransacoesPage() {
  const [data, setData] = useState<UnifiedTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState<string>(new Date().toISOString().substring(0, 7)) // YYYY-MM
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all")
  const [search, setSearch] = useState("")

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formType, setFormType] = useState<"income" | "expense">("income")
  const [formCategory, setFormCategory] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formAmount, setFormAmount] = useState("")
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0])
  const [formPayment, setFormPayment] = useState("Dinheiro")
  const [formNotes, setFormNotes] = useState("")

  useEffect(() => {
    fetchData()
  }, [filterMonth])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [year, month] = filterMonth.split("-").map(Number)
      const start = `${filterMonth}-01`
      const end = new Date(year, month, 0).toISOString().split("T")[0] // last day of month

      // 1. Fetch sales (automatic income)
      const salesRes = await (supabase
        .from("sales") as any)
        .select(`
          id, 
          sale_date, 
          sale_price, 
          net_amount, 
          payment_method,
          inventory:inventory_id (
            catalog:product_catalog_id (model)
          )
        `)
        .gte("sale_date", start)
        .lte("sale_date", end)

      // 2. Fetch manual transactions
      const transRes = await (supabase
        .from("transactions") as any)
        .select("*")
        .gte("date", start)
        .lte("date", end)

      const manual: UnifiedTransaction[] = (transRes.data || []).map((t: any) => ({
        id: t.id,
        type: t.type,
        category: t.category,
        description: t.description || t.category,
        amount: Number(t.amount),
        date: t.date,
        payment_method: t.payment_method || "-",
        isAuto: false,
        notes: t.notes
      }))

      const sales: UnifiedTransaction[] = (salesRes.data || []).map((s: any) => {
        const modelName = s.inventory?.catalog?.model || "Produto"
        return {
          id: s.id,
          type: "income",
          category: "Venda",
          description: `Venda: ${modelName}`,
          amount: Number(s.net_amount ?? s.sale_price),
          date: s.sale_date,
          payment_method: s.payment_method || "Não informado",
          isAuto: true
        }
      })

      const combined = [...manual, ...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setData(combined)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCategory || !formDesc || !formAmount || !formDate) return

    setIsSubmitting(true)
    try {
      const payload = {
        type: formType,
        category: formCategory,
        description: formDesc,
        amount: Number(formAmount.replace(/,/g, ".")),
        date: formDate,
        payment_method: formPayment,
        notes: formNotes
      }

      const { error } = await (supabase.from("transactions") as any).insert([payload])
      
      if (error) throw error

      setModalOpen(false)
      // Reset form
      setFormCategory("")
      setFormDesc("")
      setFormAmount("")
      setFormNotes("")
      fetchData()
    } catch (error) {
      console.error("Error saving transaction:", error)
      alert("Erro ao salvar movimentação. Verifique o console.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Month filter
      if (item.date.substring(0, 7) !== filterMonth) return false
      
      // Type filter
      if (filterType !== "all" && item.type !== filterType) return false
      
      // Search
      if (search) {
        const query = search.toLowerCase()
        if (!item.description.toLowerCase().includes(query) && !item.category.toLowerCase().includes(query)) {
          return false
        }
      }
      
      return true
    })
  }, [data, filterMonth, filterType, search])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    const expensesByCategory: Record<string, number> = {}

    filteredData.forEach(item => {
      if (item.type === "income") {
        income += item.amount
      } else {
        expense += item.amount
        expensesByCategory[item.category] = (expensesByCategory[item.category] || 0) + item.amount
      }
    })

    let maxCat = "Nenhuma"
    let maxCatValue = 0
    Object.entries(expensesByCategory).forEach(([cat, val]) => {
      if (val > maxCatValue) {
        maxCatValue = val
        maxCat = cat
      }
    })

    return { income, expense, balance: income - expense, topCategory: maxCat }
  }, [filteredData])

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-navy-900 font-display font-semibold text-lg">Entradas e Saídas</h2>
            <p className="text-sm text-gray-500">Gestão financeira unificada do mês</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Input 
              type="month" 
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="w-[160px] bg-white border-gray-200 shadow-sm"
            />
            <Button onClick={() => setModalOpen(true)} className="bg-royal-500 hover:bg-royal-600 text-white shadow-lg shadow-royal-500/20">
              <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <ArrowUpIcon className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Entradas</span>
            </div>
            <div className="text-2xl font-display font-bold text-navy-900">
              {formatBRL(totals.income)}
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <ArrowDownIcon className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Saídas</span>
            </div>
            <div className="text-2xl font-display font-bold text-navy-900">
              {formatBRL(totals.expense)}
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-royal-500/10 flex items-center justify-center shrink-0">
                <DollarSignIcon className="w-4 h-4 text-royal-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Saldo</span>
            </div>
            <div className={`text-2xl font-display font-bold ${totals.balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatBRL(totals.balance)}
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                <AlertTriangleIcon className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-sm font-medium text-gray-500">Maior Gasto</span>
            </div>
            <div className="text-sm font-bold text-navy-900 truncate">
              {totals.topCategory}
            </div>
          </Card>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Buscar por descrição ou categoria..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-gray-50/50 border-gray-200"
            />
          </div>
          <div className="flex gap-2">
            <Select 
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="w-[140px] bg-gray-50/50 border-gray-200"
            >
              <option value="all">Todos</option>
              <option value="income">Entradas</option>
              <option value="expense">Saídas</option>
            </Select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-royal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-navy-900 mb-1">Nenhuma movimentação</h3>
            <p className="text-gray-500 mb-4 max-w-sm mx-auto">
              Não encontramos nenhuma entrada ou saída para os filtros selecionados neste mês.
            </p>
          </div>
        ) : (
          <Card className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Descrição / Categoria</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Pagamento</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-navy-900">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            {item.type === 'income' ? <ArrowUpIcon className="w-4 h-4 text-emerald-600" /> : <ArrowDownIcon className="w-4 h-4 text-red-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-navy-900 leading-tight">{item.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{item.category}</span>
                              {item.isAuto && (
                                <Badge variant="blue" className="text-[9px] px-1.5 py-0">Sistema</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-gray-500">{item.payment_method}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-bold ${item.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {item.type === 'income' ? "+" : "-"}{formatBRL(item.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Modal Novo Lançamento */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-lg font-bold text-navy-900">Novo Lançamento</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveTransaction} className="p-6 space-y-5">
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                <button 
                  type="button" 
                  onClick={() => { setFormType("income"); setFormCategory(ENTRADAS_CATEGORIES[0]); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${formType === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <ArrowUpIcon className="w-4 h-4" /> Entrada
                </button>
                <button 
                  type="button" 
                  onClick={() => { setFormType("expense"); setFormCategory(SAIDAS_CATEGORIES[0]); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${formType === "expense" ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <ArrowDownIcon className="w-4 h-4" /> Saída
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Select 
                    label="Categoria" 
                    value={formCategory} 
                    onChange={e => setFormCategory(e.target.value)}
                  >
                    {(formType === "income" ? ENTRADAS_CATEGORIES : SAIDAS_CATEGORIES).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </Select>
                </div>
                
                <div className="md:col-span-2">
                  <Input 
                    label="Descrição" 
                    placeholder="Ex: Aluguel da loja, Venda de acessório..." 
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    required
                  />
                </div>

                <Input 
                  label="Valor (R$)" 
                  placeholder="0,00" 
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  required
                />
                
                <Input 
                  label="Data" 
                  type="date" 
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                />

                <div className="md:col-span-2">
                  <Select 
                    label="Forma de Pagamento" 
                    value={formPayment}
                    onChange={e => setFormPayment(e.target.value)}
                  >
                    {METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <Input 
                    label="Observações (Opcional)" 
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1 bg-royal-500 shadow-lg shadow-royal-500/20">
                  {isSubmitting ? "Salvando..." : "Confirmar Lançamento"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function DollarSignIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function AlertTriangleIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ")
}
