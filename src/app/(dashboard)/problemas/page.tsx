"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatBRL, formatDate } from "@/lib/helpers"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { Plus, Search, X, ChevronDown, MessageSquare, Edit2, Trash2, Copy, Clock, AlertTriangle, Check, ListOrdered, Tag, CalendarClock } from "lucide-react"

const typeLabels: Record<string, string> = {
  return: "Devolução",
  warranty_claim: "Garantia",
  complaint: "Reclamação",
  repair: "Reparo",
}

const statusLabels: Record<string, { label: string; variant: "yellow" | "blue" | "green" | "gray" }> = {
  open: { label: "Aberto", variant: "yellow" },
  in_progress: { label: "Em Andamento", variant: "blue" },
  resolved: { label: "Resolvido", variant: "green" },
  closed: { label: "Fechado", variant: "gray" },
}

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
}

const priorityColors: Record<string, string> = {
  critical: "border-l-red-600",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
}

export default function ProblemsPage() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [urgencyFilter, setUrgencyFilter] = useState("all")
  const [sortBy, setSortBy] = useState("date")
  const [showForm, setShowForm] = useState(false)
  const [problems, setProblems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    type: "", description: "", priority: "", tags: "", deadline: "",
    refundAmount: "", repairCost: "", searchCustomer: "", searchProduct: "",
  })
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [customerResults, setCustomerResults] = useState<any[]>([])
  const [customerSales, setCustomerSales] = useState<any[]>([])
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState("")
  const [expandedProblem, setExpandedProblem] = useState<string | null>(null)
  const [updateProblem, setUpdateProblem] = useState<any | null>(null)
  const [updateNote, setUpdateNote] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)
  const [editingProblem, setEditingProblem] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState<any>({})
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>("")

  useEffect(() => {
    fetchProblems()
    fetchCurrentUserName()
  }, [])

  // Debounce customer search
  useEffect(() => {
    if (customerSearchQuery.length < 2) { setCustomerResults([]); return }
    setIsSearchingCustomers(true)
    const timer = setTimeout(() => {
      if (!selectedCustomerId) searchCustomers(customerSearchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearchQuery, selectedCustomerId])

  const fetchProblems = async () => {
    try {
      // Test basic auth
      const { data: { user } } = await supabase.auth.getUser()
      console.log("[Problemas] Auth user:", user?.id, user?.email)

      if (!user) {
        console.error("[Problemas] Usuário não autenticado")
        setLoading(false)
        return
      }

      const { data: userData } = await (supabase.from("users") as any).select("company_id").eq("id", user.id).single()
      console.log("[Problemas] User company_id:", userData?.company_id)

      // Fetch without joins first to isolate RLS issue
      const { data: rawData, error: rawError } = await (supabase
        .from("problems") as any)
        .select("*")

      console.log("[Problemas] Raw query - data length:", rawData?.length, "error:", rawError)
      if (rawError) console.error("[Problemas] Raw query error:", rawError)

      // Now try with joins
      const { data, error } = await (supabase
        .from("problems") as any)
        .select(`
          *,
          customers(full_name, cpf, phone),
          inventory(
            id,
            imei,
            serial_number,
            battery_health,
            grade,
            notes,
            condition_notes,
            catalog:catalog_id(model, variant, storage, color)
          )
        `)
        .order("reported_date", { ascending: false })

      console.log("[Problemas] Full query - data length:", data?.length, "error:", error)
      if (error) console.error("[Problemas] Full query error:", error)

      if (error) throw error

      const rows = data || []
      const problemIds = rows.map((item: any) => item.id).filter(Boolean)
      let updatesByProblemId: Record<string, any[]> = {}

      if (problemIds.length > 0) {
        const { data: updatesData, error: updatesError } = await (supabase
          .from("problem_updates") as any)
          .select("id, problem_id, note, created_by, created_at")
          .in("problem_id", problemIds)
          .order("created_at", { ascending: true })

        if (updatesError) {
          console.warn("[Problemas] Erro ao carregar atualizações:", updatesError)
        } else {
          updatesByProblemId = (updatesData || []).reduce((acc: Record<string, any[]>, update: any) => {
            acc[update.problem_id] = acc[update.problem_id] || []
            acc[update.problem_id].push(update)
            return acc
          }, {})
        }
      }

      setProblems(rows.map((item: any) => ({
        ...item,
        problem_updates: updatesByProblemId[item.id] || [],
      })))
    } catch (err: any) {
      console.error("Erro ao carregar problemas:", err)
      toast({ title: "Erro ao carregar problemas", description: err.message, type: "error" })
    } finally { setLoading(false) }
  }

  const fetchCurrentUserName = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await (supabase.from("users") as any).select("full_name").eq("id", user.id).single()
      if (data?.full_name) setCurrentUserName(data.full_name)
      else setCurrentUserName(user.email || "Técnico")
    } catch {}
  }

  const handleSubmit = async () => {
    if (!formData.type || !formData.description || !formData.priority) {
      toast({ title: "Preencha tipo, descrição e prioridade", type: "error" }); return
    }
    const hasSelectableSaleProduct = customerSales.some((sale) => sale.inventory?.id)
    if (selectedCustomerId && hasSelectableSaleProduct && !selectedInventoryId) {
      toast({ title: "Selecione o aparelho da OS", description: "Escolha qual produto comprado está com problema antes de registrar.", type: "error" })
      return
    }
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")
      const { data: userData } = await (supabase.from("users") as any).select("company_id").eq("id", user.id).single()
      if (!userData?.company_id) throw new Error("Empresa não encontrada")
      const tagsArray = formData.tags
        ? formData.tags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : []
      const { error } = await (supabase.from("problems") as any).insert({
        company_id: userData.company_id,
        customer_id: selectedCustomerId || null,
        inventory_id: selectedInventoryId || null,
        sale_id: selectedSaleId || null,
        type: formData.type, description: formData.description, priority: formData.priority,
        action_deadline: formData.deadline || null,
        refund_amount: formData.refundAmount ? parseFloat(formData.refundAmount) : null,
        repair_cost: formData.repairCost ? parseFloat(formData.repairCost) : null,
        tags: tagsArray.length > 0 ? tagsArray : null,
        status: "open", reported_date: new Date().toISOString().split("T")[0], created_by: user.id,
      })
      if (error) throw error
      toast({ title: "Problema registrado!", type: "success" })
      setShowForm(false)
      setFormData({ type: "", description: "", priority: "", tags: "", deadline: "", refundAmount: "", repairCost: "", searchCustomer: "", searchProduct: "" })
      setSelectedCustomerId(null); setSelectedInventoryId(null); setSelectedSaleId(null)
      fetchProblems()
    } catch (err: any) {
      toast({ title: "Erro ao registrar", description: err.message, type: "error" })
    } finally { setIsSubmitting(false) }
  }

  const searchCustomers = async (query: string) => {
    if (query.length < 2) { setCustomerResults([]); return }
    setIsSearchingCustomers(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await (supabase.from("users") as any).select("company_id").eq("id", user.id).single()
      const { data } = await (supabase
        .from("customers") as any)
        .select("id, full_name, cpf, phone")
        .eq("company_id", userData?.company_id)
        .or(`full_name.ilike.%${query}%,cpf.ilike.%${query}%`).limit(10)
      setCustomerResults(data || [])
    } catch { /* ignore */ }
    finally { setIsSearchingCustomers(false) }
  }

  const selectCustomer = async (customer: any) => {
    setSelectedCustomerId(customer.id)
    setSelectedInventoryId(null)
    setSelectedSaleId(null)
    setCustomerSearchQuery(`${customer.full_name}${customer.cpf ? ` — ${customer.cpf}` : ""}`)
    setCustomerResults([])
    setFormData(prev => ({ ...prev, searchProduct: "" }))
    try {
      const { data } = await (supabase
        .from("sales") as any)
        .select(`
          id, sale_date, sale_price, payment_method, warranty_start, warranty_end, warranty_months,
          inventory:inventory_id(id, imei, serial_number, battery_health, grade, notes, condition_notes, catalog:catalog_id(model, variant, storage, color))
        `)
        .eq("customer_id", customer.id).order("sale_date", { ascending: false })
      setCustomerSales(data || [])
    } catch { setCustomerSales([]) }
  }

  const updateProblemStatus = async (problemId: string, newStatus: string) => {
    try {
      const { error } = await (supabase
        .from("problems") as any)
        .update({ status: newStatus, resolved_date: newStatus === "resolved" ? new Date().toISOString().split("T")[0] : undefined })
        .eq("id", problemId)
      if (error) throw error
      toast({ title: "Status atualizado!", description: `Problema marcado como ${statusLabels[newStatus]?.label || newStatus}`, type: "success" })
      fetchProblems()
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, type: "error" })
    }
  }

  const submitUpdate = async (problemId: string) => {
    if (!updateNote.trim()) { toast({ title: "Escreva uma atualização", type: "error" }); return }
    setIsUpdating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await (supabase.from("problem_updates") as any).insert({
        problem_id: problemId, note: updateNote.trim(), created_by: user?.id,
      })
      if (error) {
        const now = new Date()
        const dateStr = now.toLocaleDateString("pt-BR")
        const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        const author = currentUserName || "Técnico"
        await (supabase
          .from("problems") as any)
          .update({ description: `${(updateProblem?.description || "")}\n\n[ATUALIZAÇÃO ${author} • ${dateStr} ${timeStr}]: ${updateNote.trim()}` })
          .eq("id", problemId)
        toast({ title: "Atualização registrada!", type: "success" })
      } else {
        toast({ title: "Atualização registrada!", type: "success" })
      }
      setUpdateNote(""); setUpdateProblem(null); fetchProblems()
    } catch (err: any) {
      toast({ title: "Erro ao registrar", description: err.message, type: "error" })
    } finally { setIsUpdating(false) }
  }

  const nextStatus = (currentStatus: string): string | null => {
    if (currentStatus === "open") return "in_progress"
    if (currentStatus === "in_progress") return "resolved"
    if (currentStatus === "resolved") return "closed"
    return null
  }

  const startEditing = (problem: any) => {
    setEditingProblem(problem.id)
    setEditFormData({
      type: problem.type, description: problem.description, priority: problem.priority,
      tags: Array.isArray(problem.tags) ? problem.tags.join(", ") : "",
      deadline: problem.action_deadline || "",
      refundAmount: problem.refund_amount?.toString() || "",
      repairCost: problem.repair_cost?.toString() || "",
    })
  }

  const saveEdit = async (problemId: string) => {
    try {
      const tagsArray = editFormData.tags
        ? editFormData.tags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : []
      const { error } = await (supabase.from("problems") as any).update({
        type: editFormData.type, description: editFormData.description,
        priority: editFormData.priority, action_deadline: editFormData.deadline || null,
        refund_amount: editFormData.refundAmount ? parseFloat(editFormData.refundAmount) : null,
        repair_cost: editFormData.repairCost ? parseFloat(editFormData.repairCost) : null,
        tags: tagsArray.length > 0 ? tagsArray : null,
      }).eq("id", problemId)
      if (error) throw error
      toast({ title: "Problema atualizado!", type: "success" })
      setEditingProblem(null); setEditFormData({}); fetchProblems()
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, type: "error" })
    }
  }

  const deleteProblem = async (problemId: string) => {
    setIsDeleting(true)
    try {
      const { error } = await (supabase.from("problems") as any).delete().eq("id", problemId)
      if (error) throw error
      toast({ title: "Problema removido!", type: "success" })
      setDeleteConfirm(null); fetchProblems()
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, type: "error" })
    } finally { setIsDeleting(false) }
  }

  const duplicateProblem = async (problem: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")
      const { data: userData } = await (supabase.from("users") as any).select("company_id").eq("id", user.id).single()
      if (!userData?.company_id) throw new Error("Empresa não encontrada")
      const { error } = await (supabase.from("problems") as any).insert({
        company_id: userData.company_id,
        customer_id: problem.customer_id, inventory_id: problem.inventory_id, sale_id: problem.sale_id,
        type: problem.type, description: problem.description, priority: problem.priority,
        tags: problem.tags, action_deadline: problem.action_deadline,
        refund_amount: problem.refund_amount, repair_cost: problem.repair_cost,
        status: "open", reported_date: new Date().toISOString().split("T")[0], created_by: user.id,
      })
      if (error) throw error
      toast({ title: "Problema duplicado!", type: "success" }); fetchProblems()
    } catch (err: any) {
      toast({ title: "Erro ao duplicar", description: err.message, type: "error" })
    }
  }

  const getDaysSinceReport = (dateStr: string): number => {
    const diff = Date.now() - new Date(dateStr).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  /** Parse description into timeline entries */
  const parseDescriptionIntoTimeline = (description: string, reportedDate: string, updates: any[] = []) => {
    const updateRegex = /\[ATUALIZAÇÃO\s+([^\]]+)\]:\s*(.+?)(?=\s*\[ATUALIZAÇÃO\s+[^\]]+\]:|$)/g
    const entries: { text: string; author: string; date: string; time: string; isUpdate: boolean }[] = []

    const firstUpdate = description.indexOf("[ATUALIZAÇÃO ")
    if (firstUpdate > 0) {
      const initialText = description.substring(0, firstUpdate).trim()
      if (initialText) {
        entries.push({
          text: initialText, author: "Técnico",
          date: formatDate(reportedDate),
          time: new Date(reportedDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          isUpdate: false,
        })
      }
    } else if (firstUpdate === -1) {
      entries.push({
        text: description.trim(), author: "Técnico",
        date: formatDate(reportedDate),
        time: new Date(reportedDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        isUpdate: false,
      })
    }

    const updateContent = description.substring(firstUpdate >= 0 ? firstUpdate : 0)
    let match
    while ((match = updateRegex.exec(updateContent)) !== null) {
      const metadata = match[1]
      const parts = metadata.split(" • ")
      let author: string, date: string, time: string
      if (parts.length === 2) {
        author = parts[0]
        const dateTime = parts[1].split(" ")
        date = dateTime[0]; time = dateTime[1] || ""
      } else if (metadata.includes(" ")) {
        author = "Técnico"
        const dateTime = metadata.split(" ")
        date = dateTime[0]; time = dateTime[1] || ""
      } else {
        author = "Técnico"; date = metadata; time = ""
      }
      entries.push({ text: match[2].trim(), author, date, time, isUpdate: true })
    }
    for (const update of updates) {
      const createdAt = update.created_at || reportedDate
      entries.push({
        text: update.note,
        author: "Técnico",
        date: formatDate(createdAt),
        time: new Date(createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        isUpdate: true,
      })
    }

    return entries
  }

  /** Urgency based on days until deadline */
  const getUrgency = (p: any): number => {
    if (!p.action_deadline) return 0
    const diffMs = new Date(p.action_deadline).getTime() - Date.now()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 4
    if (diffDays <= 2) return 3
    if (diffDays <= 5) return 2
    if (diffDays <= 10) return 1
    return 0
  }

  const selectSaleProduct = (sale: any) => {
    const inv = sale.inventory
    if (!inv?.id) {
      toast({ title: "Venda sem aparelho vinculado", description: "Essa venda não possui um item de estoque para vincular à OS.", type: "error" })
      return
    }
    const modelName = getInventoryProductName(inv)
    setSelectedInventoryId(inv.id)
    setSelectedSaleId(sale.id)
    setFormData(prev => ({ ...prev, searchProduct: modelName }))
  }

  const getInventoryProductName = (inv: any) => {
    if (!inv) return "Produto não vinculado"
    const cat = inv.catalog || inv.product_catalog || {}
    if (cat.model) {
      return `${cat.model}${cat.storage ? " " + cat.storage : ""}${cat.color ? " • " + cat.color : ""}${cat.variant ? " (" + cat.variant + ")" : ""}`.trim()
    }
    if (inv.notes) return inv.notes
    if (inv.condition_notes) return inv.condition_notes
    if (inv.imei) return `IMEI: ${String(inv.imei).slice(0, 8)}…`
    if (inv.serial_number) return `Serial: ${inv.serial_number}`
    return "Produto não vinculado"
  }

  const getInventoryIdentifier = (inv: any) => {
    if (!inv) return null
    if (inv.imei && inv.serial_number) return `IMEI ${inv.imei} · Serial ${inv.serial_number}`
    if (inv.imei) return `IMEI ${inv.imei}`
    if (inv.serial_number) return `Serial ${inv.serial_number}`
    return null
  }

  // Filters + Sort
  let filtered = problems.filter((p) => {
    const matchStatus = filter === "all" || p.status === filter
    const urgency = getUrgency(p)
    let matchUrgency = true
    if (urgencyFilter === "critical") matchUrgency = urgency >= 2
    if (urgencyFilter === "expiring") matchUrgency = urgency > 0 && urgency <= 2
    const productName = getInventoryProductName(p.inventory)
    const productIdentifier = getInventoryIdentifier(p.inventory) || ""
    const customerName = p.customers?.full_name || ""
    const matchSearch = !search ||
      productName.toLowerCase().includes(search.toLowerCase()) ||
      productIdentifier.toLowerCase().includes(search.toLowerCase()) ||
      customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch && matchUrgency
  })

  filtered.sort((a, b) => {
    if (sortBy === "deadline") {
      const aHas = a.action_deadline ? 0 : 1
      const bHas = b.action_deadline ? 0 : 1
      if (aHas !== bHas) return aHas - bHas
      return new Date(a.action_deadline).getTime() - new Date(b.action_deadline).getTime()
    }
    return new Date(b.reported_date).getTime() - new Date(a.reported_date).getTime()
  })

  const openCount = problems.filter((p) => p.status === "open").length
  const inProgressCount = problems.filter((p) => p.status === "in_progress").length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Problemas</h2>
          <p className="text-sm text-gray-500">{openCount} abertos · {inProgressCount} em andamento</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Novo Problema
        </Button>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { key: "all", label: "Todos" },
          { key: "open", label: "Abertos" },
          { key: "in_progress", label: "Em Andamento" },
          { key: "resolved", label: "Resolvidos" },
          { key: "closed", label: "Fechados" },
        ].map((f) => {
          const count = f.key === "all" ? problems.length : problems.filter((p) => p.status === f.key).length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === f.key ? "bg-navy-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-navy-900"
              }`}>
              {f.label}{" "}
              <span className={`ml-1 text-xs ${filter === f.key ? "text-white/70" : "text-gray-400"}`}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* Urgency + Sort row */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <div className="flex items-center gap-0.5">
          <span className="text-[11px] font-semibold text-gray-400 mr-1 shrink-0">Urgência:</span>
          {[
            { key: "all", label: "Todas", color: "bg-gray-400" },
            { key: "critical", label: "Crítico", color: "bg-red-500" },
            { key: "expiring", label: "Perto de vencer", color: "bg-orange-500" },
          ].map((u) => {
            const count = u.key === "all" ? filtered.length : problems.filter((p) => {
              const urgency = getUrgency(p)
              if (u.key === "critical") return urgency >= 2
              if (u.key === "expiring") return urgency > 0 && urgency <= 2
              return true
            }).length
            const active = urgencyFilter === u.key
            return (
              <button key={u.key}
                onClick={() => setUrgencyFilter(active ? "all" : u.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${
                  active ? "bg-navy-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}>
                <span className={`w-2 h-2 rounded-full ${u.color} ${active ? "opacity-100" : "opacity-60"}`} />
                {u.label}
                <span className={`text-[10px] ${active ? "text-white/70" : "text-gray-400"}`}>({count})</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg overflow-hidden shrink-0">
          <button onClick={() => setSortBy("date")}
            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${sortBy === "date" ? "bg-navy-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
            Mais recente
          </button>
          <button onClick={() => setSortBy("deadline")}
            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${sortBy === "deadline" ? "bg-navy-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
            Prazo mais próximo
          </button>
        </div>
      </div>

      <Input placeholder="Buscar por produto, cliente ou descrição…" value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-3">Nenhum problema encontrado.</p>
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Novo Problema
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const status = statusLabels[p.status]
            const inv = p.inventory
            const daysSince = getDaysSinceReport(p.reported_date)
            const isEditing = editingProblem === p.id
            const isDeleteAlert = deleteConfirm === p.id
            const productName = getInventoryProductName(inv)
            const productIdentifier = getInventoryIdentifier(inv)
            const customerInfo = p.customers?.full_name
              ? `${p.customers.full_name}${p.customers.cpf ? ` • ${p.customers.cpf}` : ""}`
              : "Sem cliente vinculado"
            const isExpanded = expandedProblem === p.id
            const nextSt = nextStatus(p.status)

            return (
              <div key={p.id}
                className={`bg-card rounded-xl border border-gray-100 shadow-sm border-l-4 ${priorityColors[p.priority]} ${
                  isExpanded ? "ring-2 ring-royal-500/20" : "hover:border-gray-200"
                } ${isEditing ? "ring-2 ring-orange-400/30" : ""}`}>

                {/* Delete confirmation */}
                {isDeleteAlert && (
                  <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <p className="text-sm font-medium text-red-700">Confirmar exclusão?</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
                      <Button size="sm" onClick={() => deleteProblem(p.id)} isLoading={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">Excluir</Button>
                    </div>
                  </div>
                )}

                {/* Edit mode inline */}
                {isEditing ? (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-orange-600 flex items-center gap-1.5">
                        <Edit2 className="w-3.5 h-3.5" /> Editando Problema
                      </h4>
                      <button onClick={() => { setEditingProblem(null); setEditFormData({}) }} className="text-gray-400 hover:text-navy-900">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <select className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm" value={editFormData.type}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, type: e.target.value }))}>
                      <option value="">Tipo de Problema</option>
                      <option value="return">Devolução</option>
                      <option value="warranty_claim">Acionamento de Garantia</option>
                      <option value="complaint">Reclamação</option>
                      <option value="repair">Reparo</option>
                    </select>
                    <textarea className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-y outline-none focus:border-royal-500" rows={2}
                      value={editFormData.description} onChange={(e) => setEditFormData((prev: any) => ({ ...prev, description: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <select className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm" value={editFormData.priority}
                        onChange={(e) => setEditFormData((prev: any) => ({ ...prev, priority: e.target.value }))}>
                        <option value="">Prioridade</option>
                        <option value="low">Baixa</option>
                        <option value="medium">Média</option>
                        <option value="high">Alta</option>
                        <option value="critical">Crítica</option>
                      </select>
                      <Input type="date" value={editFormData.deadline}
                        onChange={(e) => setEditFormData((prev: any) => ({ ...prev, deadline: e.target.value }))} />
                    </div>
                    <Input placeholder="Tags (separadas por vírgula)" value={editFormData.tags}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, tags: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Custo Reparo (R$)" type="number" value={editFormData.repairCost}
                        onChange={(e) => setEditFormData((prev: any) => ({ ...prev, repairCost: e.target.value }))} />
                      <Input label="Reembolso (R$)" type="number" value={editFormData.refundAmount}
                        onChange={(e) => setEditFormData((prev: any) => ({ ...prev, refundAmount: e.target.value }))} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => { setEditingProblem(null); setEditFormData({}) }}>Cancelar</Button>
                      <Button size="sm" onClick={() => saveEdit(p.id)}>Salvar Alterações</Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 cursor-pointer" onClick={() => setExpandedProblem(isExpanded ? null : p.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm text-navy-900 truncate">{productName}</p>
                          {daysSince > 7 && (
                            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-orange-600 bg-orange-50 rounded-full px-1.5 py-0.5">
                              <Clock className="w-3 h-3" />{daysSince}d
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{customerInfo}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Badge variant={status.variant} dot>{status.label}</Badge>
                        {p.status !== "closed" && (
                          <>
                            {nextSt && (
                              <button onClick={() => updateProblemStatus(p.id, nextSt)}
                                className="text-xs font-medium text-royal-500 hover:text-royal-700 transition-colors px-2 py-1 rounded-lg hover:bg-royal-50 border border-transparent hover:border-royal-100"
                                title={`Avançar para: ${statusLabels[nextSt]?.label}`}>
                                Avançar →
                              </button>
                            )}
                            {p.status === "in_progress" && (
                              <button onClick={() => updateProblemStatus(p.id, "open")}
                                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100"
                                title="Regressar para Aberto">
                                ← Regressar
                              </button>
                            )}
                            {p.status === "resolved" && (
                              <button onClick={() => updateProblemStatus(p.id, "in_progress")}
                                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100"
                                title="Regressar para Em Andamento">
                                ← Regressar
                              </button>
                            )}
                          </>
                        )}
                        <button onClick={() => startEditing(p)}
                          className="text-gray-400 hover:text-orange-500 p-1 rounded-lg hover:bg-orange-50 transition-all" title="Editar problema">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => duplicateProblem(p)}
                          className="text-gray-400 hover:text-royal-500 p-1 rounded-lg hover:bg-royal-50 transition-all" title="Duplicar problema">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirm(p.id)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all" title="Excluir problema">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setExpandedProblem(isExpanded ? null : p.id)}
                          className={`text-gray-400 p-1 rounded-lg transition-all ${isExpanded ? "rotate-180 text-navy-900 bg-royal-50" : "hover:bg-gray-100"}`}
                          title={isExpanded ? "Colapsar" : "Expandir"}>
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Collapsed view */}
                    {!isExpanded && (
                      <>
                        {(() => {
                          const entries = parseDescriptionIntoTimeline(p.description, p.reported_date)
                          const cleanDesc = entries.length > 0 ? entries[0].text : p.description
                          const updateCount = entries.length - 1
                          return (
                            <>
                              <p className="text-sm text-gray-700 mt-2 line-clamp-2">{cleanDesc}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <Badge variant="gray">{typeLabels[p.type] || p.type}</Badge>
                                <Badge variant={p.priority === "critical" || p.priority === "high" ? "red" : "gray"}>
                                  {priorityLabels[p.priority] || p.priority}
                                </Badge>
                                {p.tags && p.tags.map((tag: string) => (
                                  <Badge key={tag} variant="blue">{tag}</Badge>
                                ))}
                                {updateCount > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-royal-600 bg-royal-50 border border-royal-100 rounded-full px-2.5 py-0.5">
                                    <MessageSquare className="w-3 h-3" />
                                    {updateCount} {updateCount === 1 ? "atualização" : "atualizações"}
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-400 ml-auto">
                                  {entries.length > 0 ? entries[0].date : formatDate(p.reported_date)}
                                </span>
                              </div>
                              {p.repair_cost && <p className="text-xs text-gray-400 mt-1">Custo reparo: {formatBRL(p.repair_cost)}</p>}
                              {p.refund_amount && <p className="text-xs text-gray-400 mt-1">Reembolso: {formatBRL(p.refund_amount)}</p>}
                            </>
                          )
                        })()}
                      </>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-4" onClick={(e) => e.stopPropagation()}>
                        {/* Timeline */}
                        {(() => {
                          const timelineEntries = parseDescriptionIntoTimeline(p.description, p.reported_date, p.problem_updates)
                          return (
                            <div className="relative pl-5">
                              <div className="absolute left-[6px] top-2 bottom-2 w-px bg-gray-200" />
                              {timelineEntries.map((entry, i) => (
                                <div key={i} className="relative mb-4 last:mb-0">
                                  <div className={`absolute left-[-20px] top-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                                    entry.isUpdate ? "bg-royal-500 border-royal-500" : "bg-white border-gray-400"
                                  }`}>
                                    {entry.isUpdate && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div className={`rounded-xl p-3 ${entry.isUpdate ? "bg-royal-50 border border-royal-100" : "bg-surface border border-gray-100"}`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                          entry.isUpdate ? "bg-royal-500 text-white" : "bg-gray-300 text-white"
                                        }`}>
                                          {entry.author.charAt(0).toUpperCase()}
                                        </div>
                                        <span className={`text-xs font-medium ${entry.isUpdate ? "text-royal-700" : "text-navy-900"}`}>
                                          {entry.author}
                                        </span>
                                      </div>
                                      <span className={`text-[10px] ${entry.isUpdate ? "text-royal-400" : "text-gray-400"}`}>
                                        {entry.date} · {entry.time}
                                      </span>
                                    </div>
                                    {entry.isUpdate && (
                                      <span className="text-[9px] font-semibold uppercase tracking-wide text-royal-400 mb-1 block">
                                        Atualização
                                      </span>
                                    )}
                                    <p className="text-sm text-navy-800 whitespace-pre-line leading-relaxed">{entry.text}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                        {/* Update note textarea */}
                        {updateProblem?.id === p.id && (
                          <div className="bg-royal-50 rounded-xl p-3 border border-royal-100">
                            <p className="text-xs font-semibold text-navy-900 mb-2 flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5" /> Nova Atualização
                            </p>
                            <textarea className="w-full rounded-xl border border-royal-200 bg-white px-3 py-2 text-sm resize-y outline-none focus:border-royal-500 focus:ring-1 focus:ring-royal-500/20" rows={2}
                              placeholder="Descreva o que foi feito..." value={updateNote}
                              onChange={(e) => setUpdateNote(e.target.value)} />
                            <div className="flex gap-2 mt-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => { setUpdateProblem(null); setUpdateNote("") }}>Cancelar</Button>
                              <Button size="sm" onClick={() => submitUpdate(p.id)} isLoading={isUpdating}>
                                <MessageSquare className="w-3.5 h-3.5 mr-1" /> Salvar
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="gray">{typeLabels[p.type] || p.type}</Badge>
                          <Badge variant={p.priority === "critical" || p.priority === "high" ? "red" : "gray"}>
                            {priorityLabels[p.priority] || p.priority}
                          </Badge>
                          {p.tags && p.tags.map((tag: string) => (
                            <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                              <Tag className="w-2.5 h-2.5" />{tag}
                            </span>
                          ))}
                        </div>

                        {/* Product + Customer grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-surface rounded-lg p-3 border border-gray-100">
                            <p className="text-[10px] font-semibold text-navy-900 mb-2 uppercase tracking-wide">Produto</p>
                            <div className="text-xs space-y-1">
                              <p className="font-medium text-navy-800">{productName}</p>
                              {productIdentifier && <p className="text-gray-500 font-mono">{productIdentifier}</p>}
                              {inv?.battery_health && <p className="text-gray-500">Bateria: {inv.battery_health}%</p>}
                              {inv?.grade && <p className="text-gray-500">Grade: {inv.grade}</p>}
                            </div>
                          </div>
                          <div className="bg-surface rounded-lg p-3 border border-gray-100">
                            <p className="text-[10px] font-semibold text-navy-900 mb-2 uppercase tracking-wide">Cliente</p>
                            <div className="text-xs space-y-1">
                              <p className="font-medium text-navy-800">{p.customers?.full_name || "—"}</p>
                              {p.customers?.cpf && <p className="text-gray-500">CPF: {p.customers.cpf}</p>}
                              {p.customers?.phone && <p className="text-gray-500">Tel: {p.customers.phone}</p>}
                            </div>
                          </div>
                        </div>

                        {/* SLA Track Bar */}
                        {p.action_deadline && (() => {
                          const startDate = new Date(p.reported_date)
                          const deadlineDate = new Date(p.action_deadline)
                          const today = new Date()
                          startDate.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0)
                          const totalDays = Math.max(1, Math.ceil((deadlineDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
                          const elapsed = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
                          const remaining = totalDays - elapsed
                          const pct = Math.min(100, Math.max(2, (elapsed / totalDays) * 100))
                          const colors = (() => {
                            if (remaining <= 0) return { track: "from-red-500 to-red-400", dot: "bg-red-500 border-red-200", bg: "bg-red-50/80 border-red-100/60", label: "text-red-600", status: "Vencido!" }
                            if (remaining <= 2) return { track: "from-orange-500 to-orange-400", dot: "bg-orange-500 border-orange-200", bg: "bg-orange-50/80 border-orange-100/60", label: "text-orange-600", status: "Crítico" }
                            if (remaining <= 5) return { track: "from-yellow-400 to-amber-400", dot: "bg-yellow-400 border-yellow-200", bg: "bg-yellow-50/80 border-yellow-100/60", label: "text-yellow-600", status: "Atenção" }
                            return { track: "from-emerald-500 to-teal-400", dot: "bg-emerald-500 border-emerald-200", bg: "bg-emerald-50/80 border-emerald-100/60", label: "text-emerald-600", status: "No prazo" }
                          })()
                          return (
                            <div className={`${colors.bg} rounded-xl p-4 border`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-lg ${colors.track.split(" ")[0].replace("from-", "bg-")} flex items-center justify-center`}>
                                    <CalendarClock className="w-3.5 h-3.5 text-white" />
                                  </div>
                                  <div>
                                    <p className={`text-[11px] font-bold ${colors.label}`}>
                                      SLA {remaining > 0 ? `· ${remaining} dia${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}` : "· Prazo vencido!"}
                                    </p>
                                    <p className="text-[10px] text-gray-400">{elapsed} dia{elapsed !== 1 ? "s" : ""} de {totalDays} no prazo</p>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.label} bg-white/80 ${remaining <= 0 ? "animate-pulse" : ""}`}>
                                  {colors.status}
                                </span>
                              </div>
                              <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                                <div className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${colors.track} transition-all duration-700`} style={{ width: `${pct}%` }} />
                                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${Math.min(96, Math.max(4, pct))}%` }}>
                                  <div className={`w-5 h-5 rounded-full border-2 ${colors.dot} shadow-lg`} />
                                  {remaining <= 2 && (
                                    <div className={`absolute inset-1 rounded-full ${colors.track.split(" ")[0].replace("from-", "bg-")} animate-ping opacity-30`} />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <div>
                                  <p className="text-gray-400">Aberto</p>
                                  <p className="font-medium text-gray-500">{formatDate(p.reported_date)}</p>
                                </div>
                                <div className="text-center">
                                  <p className={`font-bold ${colors.label}`}>{pct.toFixed(0)}%</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-gray-400">Prazo</p>
                                  <p className="font-medium text-gray-500">{formatDate(p.action_deadline)}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {/* Quick status change */}
                        {p.status !== "closed" && (
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-[10px] font-semibold text-navy-900 mb-2 uppercase tracking-wide">Ações Rápidas</p>
                            <div className="flex gap-2 flex-wrap">
                              {p.status === "open" && (
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateProblemStatus(p.id, "in_progress"); }}>
                                  <Check className="w-3.5 h-3.5 mr-1" /> Iniciar Reparo
                                </Button>
                              )}
                              {p.status === "in_progress" && (
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateProblemStatus(p.id, "resolved"); }}>
                                  <Check className="w-3.5 h-3.5 mr-1" /> Marcar Resolvido
                                </Button>
                              )}
                              {p.status === "resolved" && (
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateProblemStatus(p.id, "closed"); }}>
                                  <Check className="w-3.5 h-3.5 mr-1" /> Fechar OS
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={(e) => {
                                e.stopPropagation(); setUpdateProblem(p); setUpdateNote("");
                              }}>
                                <MessageSquare className="w-3.5 h-3.5 mr-1 text-royal-500" /> Registrar Atualização
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New Problem Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-0">
          <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto p-6 space-y-5 animate-scale-in">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-navy-900 font-syne text-lg">Registrar Problema</h3>
              <button onClick={() => { setShowForm(false); setSelectedCustomerId(null); setSelectedInventoryId(null); setSelectedSaleId(null); setCustomerSearchQuery(""); setCustomerSales([]); }} className="text-gray-400 hover:text-navy-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <select className="w-full h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={formData.type}
                onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}>
                <option value="">Tipo de Problema</option>
                <option value="return">Devolução</option>
                <option value="warranty_claim">Acionamento de Garantia</option>
                <option value="complaint">Reclamação</option>
                <option value="repair">Reparo</option>
              </select>
              <div className="relative z-20">
                <Input label="Buscar Cliente (nome ou CPF)" placeholder="Digite o nome ou CPF do cliente..." value={customerSearchQuery}
                  onChange={(e) => {
                    if (selectedCustomerId) { setSelectedCustomerId(null); setSelectedInventoryId(null); setSelectedSaleId(null); setCustomerSales([]); }
                    setCustomerSearchQuery(e.target.value)
                  }} />
                {selectedCustomerId && (
                  <button onClick={() => { setSelectedCustomerId(null); setSelectedInventoryId(null); setSelectedSaleId(null); setCustomerSearchQuery(""); setCustomerSales([]); setCustomerResults([]); }}
                    className="absolute right-3 top-9 text-gray-400 hover:text-danger-500 transition-colors" title="Limpar seleção">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {customerResults.length > 0 && !selectedCustomerId && (
                <div className="w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {customerResults.map((c) => (
                    <button key={c.id} onClick={() => selectCustomer(c)}
                      className="w-full px-4 py-3 text-left hover:bg-royal-50 transition-colors border-b border-gray-50 last:border-b-0">
                      <p className="text-sm font-medium text-navy-900">{c.full_name}</p>
                      {c.cpf && <p className="text-xs text-gray-500">{c.cpf}</p>}
                      {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
              {customerSales.length > 0 && (
                <div className="bg-surface rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-semibold text-navy-900 mb-3">Produtos Comprados (selecione o da OS)</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {customerSales.map((sale) => {
                      const inv = sale.inventory
                      const productName = getInventoryProductName(inv)
                      const productIdentifier = getInventoryIdentifier(inv)
                      const wLeft = sale.warranty_end ? Math.max(0, Math.ceil((new Date(sale.warranty_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
                      const inWarranty = wLeft !== null && wLeft > 0
                      return (
                        <button key={sale.id} onClick={() => selectSaleProduct(sale)}
                          className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                            selectedSaleId === sale.id ? "border-royal-500 bg-royal-50 ring-1 ring-royal-500/20" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                          }`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-navy-900 text-sm">{productName}</p>
                            {selectedSaleId === sale.id && (
                              <span className="shrink-0 rounded-full bg-royal-500 px-2 py-0.5 text-[10px] font-semibold text-white">Selecionado</span>
                            )}
                          </div>
                          {productIdentifier && <p className="text-gray-400 mt-1 font-mono">{productIdentifier}</p>}
                          <p className="text-gray-500 mt-1">Venda: {formatDate(sale.sale_date)} · {formatBRL(sale.sale_price)}</p>
                          {inWarranty !== null && (
                            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${inWarranty ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                              {inWarranty ? `Garantia: ${wLeft} dias restantes` : "Garantia vencida"}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <Textarea label="Descrição do Problema" placeholder="Descreva o problema em detalhes..." value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
              <select className="w-full h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))}>
                <option value="">Prioridade</option>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Tags (separadas por vírgula)" placeholder="ex: tela, bateria, software" value={formData.tags}
                  onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))} />
                <Input label="Prazo para resolução" type="date" value={formData.deadline}
                  onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Custo de Reparo (R$)" type="number" value={formData.repairCost}
                  onChange={(e) => setFormData((prev) => ({ ...prev, repairCost: e.target.value }))} />
                <Input label="Reembolso (R$)" type="number" value={formData.refundAmount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, refundAmount: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" fullWidth onClick={() => { setShowForm(false); setSelectedCustomerId(null); setSelectedInventoryId(null); setSelectedSaleId(null); }}>Cancelar</Button>
              <Button fullWidth onClick={handleSubmit} isLoading={isSubmitting}>Registrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
