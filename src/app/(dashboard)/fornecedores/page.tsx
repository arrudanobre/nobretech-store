"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, Phone, Mail, MapPin, Truck, Star, X, Loader2, User } from "lucide-react"
import { toast } from "sonner"

interface Supplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  city: string | null
  notes: string | null
  rating: number | null
  created_at: string | null
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < (rating || 0) ? "text-warning-500 fill-warning-500" : "text-gray-200"}`}
        />
      ))}
    </div>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    city: "",
    notes: "",
    rating: 5
  })

  // Load suppliers
  const loadSuppliers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name", { ascending: true })

    if (error) {
      toast.error("Erro ao carregar fornecedores")
    } else {
      setSuppliers(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) return toast.error("Nome é obrigatório")

    setSaving(true)
    
    // Pegar o company_id dinamicamente da tabela de empresas
    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
      .single()

    if (companyError || !companies) {
      setSaving(false)
      return toast.error("Não foi possível identificar a empresa principal.")
    }

    const { error } = await supabase
      .from("suppliers")
      .insert([
        {
          name: formData.name,
          contact: formData.contact,
          phone: formData.phone,
          email: formData.email,
          city: formData.city,
          notes: formData.notes,
          rating: formData.rating,
          company_id: companies.id
        }
      ])

    if (error) {
      toast.error("Erro ao salvar: " + error.message)
    } else {
      toast.success("Fornecedor cadastrado com sucesso!")
      setShowModal(false)
      setFormData({ name: "", contact: "", phone: "", email: "", city: "", notes: "", rating: 5 })
      loadSuppliers()
    }
    setSaving(false)
  }

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.city || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Fornecedores</h2>
          <p className="text-sm text-gray-500">{suppliers.length} ativos no banco</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> Novo Fornecedor
        </Button>
      </div>

      <Input
        placeholder="Buscar por nome ou cidade…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-royal-500" />
          <p className="text-sm">Buscando fornecedores...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Truck className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum fornecedor encontrado</p>
          <p className="text-gray-400 text-sm">Tente mudar sua busca ou cadastre um novo fornecedor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="bg-card rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-royal-100 text-royal-600 flex items-center justify-center shrink-0 transition-colors group-hover:bg-royal-600 group-hover:text-white">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-navy-900 text-lg leading-tight">{s.name}</p>
                    <p className="text-sm font-medium text-gray-500 flex items-center gap-1.5 mt-1">
                      <User className="w-3.5 h-3.5" /> {s.contact || "—"}
                    </p>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                      {s.phone && (
                        <span className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                          <Phone className="w-3 h-3 text-royal-500" /> {s.phone}
                        </span>
                      )}
                      {s.city && (
                        <span className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                          <MapPin className="w-3 h-3 text-danger-500" /> {s.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <RatingStars rating={s.rating || 0} />
                </div>
              </div>
              {s.notes && (
                <div className="mt-4 pt-3 border-t border-gray-50">
                  <p className="text-xs text-gray-400 italic font-medium leading-relaxed">
                    "{s.notes}"
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Fornecedor */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-royal-600 to-royal-700 text-white">
              <h3 className="font-display font-bold text-lg font-syne">Novo Fornecedor</h3>
              <button 
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                disabled={saving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <Input
                label="Nome do Fornecedor / Empresa"
                placeholder="Ex: Tech Import SP"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Contato"
                  placeholder="Nome da pessoa"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                />
                <Input
                  label="Telefone"
                  placeholder="(00) 00000-0000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="E-mail"
                  placeholder="exemplo@email.com"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <Input
                  label="Cidade/UF"
                  placeholder="São Paulo/SP"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-2">Avaliação Inicial</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData({ ...formData, rating: star })}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 ${star <= formData.rating ? "fill-warning-500 text-warning-500" : "text-gray-200"}`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">Observações do Fornecedor</label>
                <textarea
                  className="w-full bg-gray-50 rounded-xl border border-gray-100 p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-royal-500/20"
                  placeholder="Ex: Entrega via Sedex, aceita cheque, garantia de 3 meses..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="flex-1" 
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  variant="primary" 
                  className="flex-1"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Fornecedor"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
