"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate, maskCPF, formatPhone, validateCPF } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/toaster"
import { Users, Plus, Search, Phone, Mail, X } from "lucide-react"

export default function CustomersPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({ full_name: "", cpf: "", phone: "", email: "", notes: "" })

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const { data: customersData, error: customersError } = await (supabase
        .from("customers") as any)
        .select("id, full_name, cpf, phone, email, notes, created_at")
        .order("created_at", { ascending: false })

      if (customersError) throw customersError

      // Fetch sales count per customer
      const { data: salesData } = await (supabase
        .from("sales") as any)
        .select("customer_id, sale_price")

      const salesByCustomer: Record<string, number> = {}
      salesData?.forEach((s: any) => {
        if (s.customer_id) salesByCustomer[s.customer_id] = (salesByCustomer[s.customer_id] || 0) + 1
      })

      // Fetch active warranties per customer
      const { data: warrantiesData } = await (supabase
        .from("warranties") as any)
        .select("customer_id, status")
        .eq("status", "active")

      const warrantiesByCustomer: Record<string, number> = {}
      warrantiesData?.forEach((w: any) => {
        if (w.customer_id) warrantiesByCustomer[w.customer_id] = (warrantiesByCustomer[w.customer_id] || 0) + 1
      })

      // Fetch last purchase date per customer
      const { data: lastSales } = await (supabase
        .from("sales") as any)
        .select("customer_id, sale_date")
        .order("sale_date", { ascending: false })

      const lastPurchaseByCustomer: Record<string, string> = {}
      lastSales?.forEach((s: any) => {
        if (s.customer_id && !lastPurchaseByCustomer[s.customer_id]) {
          lastPurchaseByCustomer[s.customer_id] = s.sale_date
        }
      })

      // Fetch total spent per customer
      const totalByCustomer: Record<string, number> = {}
      salesData?.forEach((s: any) => {
        if (s.customer_id) {
          totalByCustomer[s.customer_id] = (totalByCustomer[s.customer_id] || 0) + Number(s.sale_price || 0)
        }
      })

      const enriched = (customersData || []).map((c: any) => ({
        ...c,
        purchaseCount: salesByCustomer[c.id] ?? 0,
        activeWarranties: warrantiesByCustomer[c.id] ?? 0,
        lastPurchase: lastPurchaseByCustomer[c.id] ?? null,
        totalSpent: totalByCustomer[c.id] ?? 0,
      }))

      setCustomers(enriched)
    } catch (err: any) {
      console.error("Erro ao carregar clientes:", err)
      toast({ title: "Erro ao carregar clientes", description: err.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Preencha o nome do cliente", type: "error" })
      return
    }
    if (form.cpf && !validateCPF(form.cpf)) {
      toast({ title: "CPF inválido", type: "error" })
      return
    }

    setIsSubmitting(true)
    try {
      // Get company_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")

      const { data: userData } = await (supabase
        .from("users") as any)
        .select("company_id")
        .eq("id", user.id)
        .single()

      if (!userData?.company_id) throw new Error("Empresa não encontrada")

      // Check duplicate CPF
      if (form.cpf && form.cpf.length >= 14) {
        const { data: existing } = await (supabase
          .from("customers") as any)
          .select("id")
          .match({ cpf: form.cpf, company_id: userData.company_id })
          .maybeSingle()

        if (existing) {
          toast({ title: "Já existe um cliente com este CPF", type: "error" })
          setIsSubmitting(false)
          return
        }
      }

      const { error } = await ((supabase
        .from("customers") as any)
        .insert({
          company_id: userData.company_id,
          full_name: form.full_name.trim(),
          cpf: (form.cpf && form.cpf.length >= 14) ? form.cpf : null,
          phone: form.phone || null,
          email: form.email || null,
          notes: form.notes || null,
        }))

      if (error) throw error

      toast({ title: "Cliente cadastrado!", type: "success" })
      setShowForm(false)
      setForm({ full_name: "", cpf: "", phone: "", email: "", notes: "" })
      fetchCustomers()
    } catch (err: any) {
      console.error("Erro ao cadastrar cliente:", err)
      toast({ title: "Erro ao cadastrar", description: err.message, type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filtered = customers.filter((c) => {
    if (!search) return true
    return (
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.cpf || "").includes(search) ||
      (c.phone || "").includes(search) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Clientes</h2>
          <p className="text-sm text-gray-500">{customers.length} cadastrados</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" /> Novo Cliente
        </Button>
      </div>

      {/* New customer form */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-royal-500/30 p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy-900">Novo Cliente</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-navy-900 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nome Completo"
              placeholder="Nome do cliente"
              autoFocus
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSave()}
            />
            <Input
              label="CPF"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(e) => setForm((p) => ({ ...p, cpf: maskCPF(e.target.value) }))}
              error={form.cpf.length >= 14 && !validateCPF(form.cpf) ? "CPF inválido" : undefined}
            />
            <Input
              label="Telefone"
              placeholder="(00) 00000-0000"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
            />
            <Input
              label="E-mail"
              type="email"
              placeholder="cliente@email.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <Input
            label="Observações"
            placeholder="Ex: Prefere atendimento por WhatsApp..."
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} isLoading={isSubmitting}>Salvar Cliente</Button>
          </div>
        </div>
      )}

      <Input
        placeholder="Buscar por nome, CPF ou telefone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-navy-900 font-medium">Nenhum cliente encontrado.</p>
          <p className="text-sm text-gray-500 mt-1">
            Clientes são cadastrados automaticamente ao registrar uma venda.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="bg-card rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-navy-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {c.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-navy-900">{c.full_name}</p>
                    {c.cpf && <p className="text-xs text-gray-500">{c.cpf}</p>}
                    <div className="flex flex-wrap gap-3 mt-1">
                      {c.phone && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {c.email}
                        </span>
                      )}
                    </div>
                    {c.notes && (
                      <p className="text-xs text-royal-500 mt-0.5 font-medium">{c.notes}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-navy-900">{c.purchaseCount} compras</p>
                  <p className="text-xs text-gray-500">{c.activeWarranties} garantia(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50">
                <span className="text-xs text-gray-400">
                  Total: {c.totalSpent > 0 ? `R$ ${c.totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} · Última compra: {c.lastPurchase ? formatDate(c.lastPurchase) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
