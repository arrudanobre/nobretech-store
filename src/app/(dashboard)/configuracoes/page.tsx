"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Building, FileText, Bell, MessageSquare, UserPlus, Users, Trash2, Mail, Loader2, Smartphone } from "lucide-react"

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: "owner" | "manager" | "operator"
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("company")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Company state
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")
  const [warrantyTemplate, setWarrantyTemplate] = useState("")
  
  // Team state
  const [team, setTeam] = useState<TeamMember[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"operator" | "manager">("operator")

  // Phone mask helper
  const formatPhone = (val: string) => {
    const numbers = val.replace(/\D/g, "");
    if (numbers.length <= 11) {
      if (numbers.length > 10) {
        return numbers
          .replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
      } else if (numbers.length > 2) {
        return numbers
          .replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
      } else if (numbers.length > 0) {
        return numbers.replace(/^(\d{2})/, "($1) ");
      }
    }
    return numbers.slice(0, 11);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setCompanyPhone(formatted);
  };

  // Load data
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      
      const { data: company, error: companyError } = await (supabase
        .from("companies") as any)
        .select("*")
        .limit(1)
        .single()
      
      if (!companyError && company) {
        setCompanyId(company.id)
        setCompanyName(company.name || "")
        
        // Robust settings parsing
        const settings = company.settings as any;
        if (settings && typeof settings === 'object') {
          setCompanyPhone(settings.phone || "")
          setCompanyEmail(settings.email || "")
          setCompanyAddress(settings.address || "")
          setWarrantyTemplate(settings.warranty_template || "")
        }
      }

      if (company?.id) {
        const { data: members } = await (supabase
          .from("users") as any)
          .select("id, full_name, email, role")
          .eq("company_id", company.id)
        
        if (members) setTeam(members as TeamMember[])
      } else {
        // Fallback for when there's no company detected yet
        toast.error("Nenhuma empresa vinculada encontrada.");
      }
      
      setLoading(false)
    }
    loadData()
  }, [])

  const handleSave = async () => {
    if (!companyId) return
    
    setSaving(true)

    // Construct settings object since columns address, phone, etc don't exist directly
    const updatedSettings = {
      phone: companyPhone,
      email: companyEmail,
      address: companyAddress,
      warranty_template: warrantyTemplate
    }

    const { error } = await (supabase
      .from("companies") as any)
      .update({
        name: companyName,
        settings: updatedSettings
      })
      .eq("id", companyId)

    if (error) {
      toast.error("Erro ao salvar: " + error.message)
    } else {
      toast.success("Configurações atualizadas com sucesso!")
    }
    setSaving(false)
  }

  const handleInvite = async () => {
    if (!inviteEmail.includes("@")) {
      toast.error("Digite um e-mail válido.")
      return
    }

    if (!companyId) return

    try {
      const { error } = await (supabase.from("users") as any).insert({
        full_name: inviteEmail.split("@")[0],
        email: inviteEmail,
        company_id: companyId,
        role: inviteRole,
      } as any)

      if (error) throw error

      setInviteEmail("")
      toast.success(`Convite enviado para ${inviteEmail}`)
      
      const { data: members } = await supabase
        .from("users")
        .select("id, full_name, email, role")
        .eq("company_id", companyId)
      if (members) setTeam(members as TeamMember[])
      
    } catch (error: any) {
      toast.error("Erro ao convidar: " + error.message)
    }
  }

  const handleRemoveMember = async (id: string, role: string) => {
    if (role === "owner") {
      toast.error("Não é possível remover o proprietário.")
      return
    }

    const { error } = await supabase.from("users").delete().eq("id", id)
    
    if (error) {
      toast.error("Erro ao remover: " + error.message)
    } else {
      setTeam(prev => prev.filter(m => m.id !== id))
      toast.success("Membro removido com sucesso.")
    }
  }

  const roleLabels: Record<string, { label: string; badge: "green" | "blue" | "yellow" }> = {
    owner: { label: "Proprietário", badge: "green" },
    manager: { label: "Gerente", badge: "blue" },
    operator: { label: "Vendedor", badge: "yellow" },
  }

  const tabs = [
    { key: "company", label: "Empresa", icon: Building },
    { key: "team", label: "Equipe", icon: Users },
    { key: "settings", label: "Garantia", icon: FileText },
  ]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 animate-pulse">
        <Smartphone className="w-10 h-10" />
        <p className="text-sm font-medium">Carregando configurações...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      <div>
        <h2 className="text-xl font-display font-bold text-navy-900 font-syne">Configurações</h2>
        <p className="text-xs text-gray-400">Gerencie sua loja e sua equipe</p>
      </div>

      <div className="bg-card rounded-2xl border border-gray-100 p-1.5 shadow-sm">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-navy-900 text-white shadow-lg shadow-navy-900/20"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === "company" && (
          <div className="bg-card rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-royal-100 flex items-center justify-center">
                <Building className="w-5 h-5 text-royal-600" />
              </div>
              <h3 className="font-bold text-navy-900 text-lg">Dados da Empresa</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome da Loja" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              <Input 
                label="WhatsApp / Telefone" 
                placeholder="(00) 00000-0000"
                value={companyPhone} 
                onChange={handlePhoneChange} 
              />
              <Input label="E-mail de Contato" type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
              <Input label="Endereço Físico" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
            </div>
          </div>
        )}

        {activeTab === "team" && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-gray-100 p-6 border-l-4 border-l-royal-600 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-royal-100 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-royal-600" />
                </div>
                <div>
                  <h3 className="font-bold text-navy-900 text-lg leading-tight">Novo Membro</h3>
                  <p className="text-xs text-gray-500">Adicione um novo colaborador à Nobretech</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <Input
                  label="E-mail do Colaborador"
                  type="email"
                  placeholder="ex: joao@nobretech.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1">Nível de Acesso</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "operator" | "manager")}
                    className="w-full h-11 rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm font-medium focus:ring-2 focus:ring-royal-500/20 focus:outline-none transition-all"
                  >
                    <option value="operator">Vendedor (Básico)</option>
                    <option value="manager">Gerente (Acesso Total)</option>
                  </select>
                </div>
                <Button variant="primary" size="lg" onClick={handleInvite} className="shadow-lg shadow-royal-600/20">
                  <Mail className="w-4 h-4" /> Convidar Membro
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-600" />
                </div>
                <h3 className="font-bold text-navy-900 text-lg">Equipe Atual ({team.length})</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {team.map((member) => {
                  const roleInfo = roleLabels[member.role] || { label: member.role, badge: "gray" }
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 rounded-2xl bg-surface border border-gray-50 hover:border-gray-100 transition-all group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-bold text-navy-900 truncate">{member.full_name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <Badge variant={roleInfo.badge}>{roleInfo.label}</Badge>
                        {member.role !== "owner" && (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.role)}
                            className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-card rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-warning-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-warning-600" />
              </div>
              <h3 className="font-bold text-navy-900 text-lg font-syne">Termos e Garantias</h3>
            </div>
            <div className="space-y-4">
              <Textarea
                rows={6}
                label="Texto Padrão de Garantia"
                placeholder="Descreva as condições de garantia..."
                value={warrantyTemplate}
                onChange={(e) => setWarrantyTemplate(e.target.value)}
              />
              <div className="bg-surface rounded-xl p-4 border border-dashed border-gray-200">
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <Bell className="w-3 h-3 text-warning-500" />
                  Este texto será impresso no topo do PDF de venda para o cliente.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab !== "team" && (
        <div className="fixed bottom-6 right-6 left-6 md:static md:bottom-0 md:right-0 md:left-0">
          <Button fullWidth variant="primary" size="lg" onClick={handleSave} disabled={saving} className="shadow-2xl shadow-royal-600/40">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Salvar Configurações"}
          </Button>
        </div>
      )}
    </div>
  )
}
