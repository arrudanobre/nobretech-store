"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowRight,
  Ban,
  Building,
  Check,
  DollarSign,
  FileText,
  Info,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import {
  canAccess,
  canManageUsers,
  roleDescriptions,
  roleLabels,
  rolePermissions,
  type PermissionKey,
  type UserRole,
} from "@/lib/permissions"
import { cn } from "@/lib/utils"

type CompanySettings = {
  phone?: string
  email?: string
  address?: string
  warranty_template?: string
}

type TeamMember = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  status?: "active" | "inactive" | null
  created_at?: string | null
}

type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  avatarUrl: string | null
  companyId: string
}

type CompanyForm = {
  id: string
  name: string
  slug: string
  logo_url: string
  phone: string
  email: string
  address: string
  warranty_template: string
  settings: CompanySettings
}

const tabs = [
  { key: "company", label: "Empresa", icon: Building },
  { key: "team", label: "Equipe", icon: Users },
  { key: "permissions", label: "Permissões", icon: ShieldCheck },
  { key: "warranty", label: "Garantia", icon: FileText },
  { key: "finance", label: "Financeiro", icon: DollarSign },
] as const

const permissionRows: { label: string; permission: PermissionKey }[] = [
  { label: "Editar configurações", permission: "settings.edit" },
  { label: "Gerenciar equipe", permission: "users.manage" },
  { label: "Acessar financeiro", permission: "finance.view" },
  { label: "Editar financeiro", permission: "finance.edit" },
  { label: "Ver DRE", permission: "finance.dre" },
  { label: "Alterar taxas", permission: "finance.tax_settings" },
  { label: "Excluir registros sensíveis", permission: "sensitive.delete" },
  { label: "Editar custos", permission: "inventory.edit_cost" },
  { label: "Cancelar vendas", permission: "sales.cancel" },
]

const roleBadgeVariant: Record<UserRole, "green" | "blue" | "yellow"> = {
  owner: "green",
  manager: "blue",
  operator: "yellow",
}

function formatPhone(value: string) {
  const numbers = value.replace(/\D/g, "").slice(0, 11)
  if (numbers.length > 10) return numbers.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3")
  if (numbers.length > 2) return numbers.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3")
  if (numbers.length > 0) return numbers.replace(/^(\d{2})/, "($1) ")
  return numbers
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value))
}

function memberInitial(member: TeamMember) {
  return (member.full_name || member.email).trim().charAt(0).toUpperCase() || "U"
}

function defaultCompanyForm(companyId: string): CompanyForm {
  return {
    id: companyId,
    name: "",
    slug: "",
    logo_url: "",
    phone: "",
    email: "",
    address: "",
    warranty_template: "",
    settings: {},
  }
}

export function ConfiguracoesClient({ currentUser }: { currentUser: CurrentUser }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("company")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [company, setCompany] = useState<CompanyForm>(() => defaultCompanyForm(currentUser.companyId))
  const [team, setTeam] = useState<TeamMember[]>([])
  const [newMember, setNewMember] = useState({ full_name: "", email: "", role: "operator" as UserRole })
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState({ full_name: "", role: "operator" as UserRole })

  const canEditSettings = canAccess(currentUser.role, "settings.edit")
  const canManageTeam = canManageUsers(currentUser.role)

  const activeMembers = useMemo(() => team.filter((member) => (member.status || "active") === "active").length, [team])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: companyData, error: companyError }, { data: members, error: membersError }] = await Promise.all([
        (supabase.from("companies") as any).select("*").eq("id", currentUser.companyId).single(),
        (supabase.from("users") as any)
          .select("*")
          .eq("company_id", currentUser.companyId)
          .order("created_at", { ascending: true }),
      ])

      if (companyError) throw companyError
      if (membersError) throw membersError

      const settings = (companyData?.settings && typeof companyData.settings === "object" ? companyData.settings : {}) as CompanySettings
      setCompany({
        id: companyData?.id || currentUser.companyId,
        name: companyData?.name || "",
        slug: companyData?.slug || "",
        logo_url: companyData?.logo_url || "",
        phone: settings.phone || "",
        email: settings.email || "",
        address: settings.address || "",
        warranty_template: settings.warranty_template || "",
        settings,
      })
      setTeam((members || []) as TeamMember[])
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar configurações")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function updateCompanyField<K extends keyof CompanyForm>(field: K, value: CompanyForm[K]) {
    setCompany((current) => ({ ...current, [field]: value }))
  }

  async function handleSaveCompany() {
    if (!canEditSettings) {
      toast.error("Apenas owner pode alterar dados da empresa.")
      return
    }

    setSaving(true)
    try {
      const nextSettings = {
        ...(company.settings || {}),
        phone: company.phone,
        email: company.email,
        address: company.address,
        warranty_template: company.warranty_template,
      }
      const { error } = await (supabase.from("companies") as any)
        .update({
          name: company.name.trim(),
          slug: company.slug.trim(),
          logo_url: company.logo_url.trim() || null,
          settings: nextSettings,
        })
        .eq("id", company.id)

      if (error) throw error
      setCompany((current) => ({ ...current, settings: nextSettings }))
      toast.success("Dados da empresa salvos.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar empresa")
    } finally {
      setSaving(false)
    }
  }

  async function refreshTeam() {
    const { data, error } = await (supabase.from("users") as any)
      .select("*")
      .eq("company_id", currentUser.companyId)
      .order("created_at", { ascending: true })
    if (error) throw error
    setTeam((data || []) as TeamMember[])
  }

  async function handleCreateMember() {
    if (!canManageTeam) {
      toast.error("Apenas owner pode criar usuários internos.")
      return
    }
    if (!newMember.email.includes("@") || !newMember.full_name.trim()) {
      toast.error("Informe nome e e-mail válidos.")
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase.from("users") as any).insert({
        full_name: newMember.full_name.trim(),
        email: newMember.email.trim().toLowerCase(),
        role: newMember.role,
        status: "active",
      })
      if (error) throw error
      setNewMember({ full_name: "", email: "", role: "operator" })
      await refreshTeam()
      toast.success("Usuário interno criado.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar usuário")
    } finally {
      setSaving(false)
    }
  }

  function startEditMember(member: TeamMember) {
    setEditingMemberId(member.id)
    setEditingMember({ full_name: member.full_name || "", role: member.role })
  }

  async function handleSaveMember(memberId: string) {
    if (!canManageTeam) {
      toast.error("Apenas owner pode editar equipe.")
      return
    }

    setSaving(true)
    try {
      const { error } = await (supabase.from("users") as any)
        .update({
          full_name: editingMember.full_name.trim(),
          role: editingMember.role,
        })
        .eq("id", memberId)
      if (error) throw error
      setEditingMemberId(null)
      await refreshTeam()
      toast.success("Usuário atualizado.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar usuário")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleMemberStatus(member: TeamMember) {
    if (!canManageTeam) {
      toast.error("Apenas owner pode ativar ou inativar usuários.")
      return
    }
    if (member.id === currentUser.id) {
      toast.error("Você não pode inativar o próprio usuário logado.")
      return
    }

    const nextStatus = (member.status || "active") === "active" ? "inactive" : "active"
    setSaving(true)
    try {
      const { error } = await (supabase.from("users") as any)
        .update({ status: nextStatus })
        .eq("id", member.id)
      if (error) throw error
      await refreshTeam()
      toast.success(nextStatus === "active" ? "Usuário reativado." : "Usuário inativado.")
    } catch (error: any) {
      toast.error(error?.message || "Erro ao alterar status")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Loader2 className="h-9 w-9 animate-spin text-royal-500" />
        <p className="text-sm font-medium">Carregando central administrativa...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-12 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-900 font-syne">Configurações</h2>
          <p className="text-sm text-gray-500">Central administrativa da loja, equipe e permissões.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
          {currentUser.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 font-bold text-white">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-navy-900">{currentUser.name}</p>
            <Badge variant={roleBadgeVariant[currentUser.role]}>{roleLabels[currentUser.role]}</Badge>
          </div>
        </div>
      </div>

      {!canEditSettings && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-100/40 p-4 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Seu perfil pode visualizar esta central, mas alterações críticas ficam bloqueadas no backend.</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex min-w-fit items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                activeTab === tab.key
                  ? "bg-navy-900 text-white shadow-lg shadow-navy-900/20"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "company" && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-royal-100">
                <Building className="h-5 w-5 text-royal-600" />
              </div>
              <div>
                <h3 className="font-bold text-navy-900">Dados da Empresa</h3>
                <p className="text-xs text-gray-500">Informações usadas em documentos, garantia e atendimento.</p>
              </div>
            </div>
            {!canEditSettings && <Badge variant="gray">Somente leitura</Badge>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Nome da Loja" value={company.name} disabled={!canEditSettings} onChange={(event) => updateCompanyField("name", event.target.value)} />
            <Input label="Slug interno" value={company.slug} disabled={!canEditSettings} onChange={(event) => updateCompanyField("slug", event.target.value)} />
            <Input label="WhatsApp / Telefone" value={company.phone} disabled={!canEditSettings} onChange={(event) => updateCompanyField("phone", formatPhone(event.target.value))} />
            <Input label="E-mail de Contato" type="email" value={company.email} disabled={!canEditSettings} onChange={(event) => updateCompanyField("email", event.target.value)} />
            <Input label="Logo da empresa (URL)" value={company.logo_url} disabled={!canEditSettings} onChange={(event) => updateCompanyField("logo_url", event.target.value)} />
            <Input label="Endereço Físico" value={company.address} disabled={!canEditSettings} onChange={(event) => updateCompanyField("address", event.target.value)} />
          </div>

          <Button onClick={handleSaveCompany} disabled={saving || !canEditSettings} className="shadow-lg shadow-royal-600/20">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar empresa
          </Button>
        </section>
      )}

      {activeTab === "team" && (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Metric label="Usuários" value={team.length} />
            <Metric label="Ativos" value={activeMembers} />
            <Metric label="Perfil atual" value={roleLabels[currentUser.role]} />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-royal-100">
                <UserPlus className="h-5 w-5 text-royal-600" />
              </div>
              <div>
                <h3 className="font-bold text-navy-900">Novo usuário interno</h3>
                <p className="text-xs text-gray-500">O acesso ao Clerk ainda precisa existir com o mesmo e-mail.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
              <Input label="Nome" value={newMember.full_name} disabled={!canManageTeam} onChange={(event) => setNewMember((current) => ({ ...current, full_name: event.target.value }))} />
              <Input label="E-mail" type="email" value={newMember.email} disabled={!canManageTeam} onChange={(event) => setNewMember((current) => ({ ...current, email: event.target.value }))} />
              <RoleSelect value={newMember.role} disabled={!canManageTeam} onChange={(role) => setNewMember((current) => ({ ...current, role }))} />
              <Button onClick={handleCreateMember} disabled={saving || !canManageTeam} size="lg">
                <Mail className="h-4 w-4" />
                Criar
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-navy-900">Equipe atual</h3>
                <p className="text-xs text-gray-500">Exclusão física fica bloqueada por segurança; use inativação.</p>
              </div>
              {!canManageTeam && <Badge variant="gray">Gerenciamento bloqueado</Badge>}
            </div>

            {team.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Nenhum usuário interno encontrado para esta empresa.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <div className="hidden grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr] gap-3 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 md:grid">
                  <span>Nome</span>
                  <span>E-mail</span>
                  <span>Cargo</span>
                  <span>Status</span>
                  <span>Criado em</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {team.map((member) => {
                    const editing = editingMemberId === member.id
                    const status = member.status || "active"
                    return (
                      <div key={member.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr] md:items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-bold text-white">
                            {memberInitial(member)}
                          </div>
                          {editing ? (
                            <Input value={editingMember.full_name} onChange={(event) => setEditingMember((current) => ({ ...current, full_name: event.target.value }))} />
                          ) : (
                            <p className="font-semibold text-navy-900">{member.full_name || "Sem nome"}</p>
                          )}
                        </div>
                        <p className="truncate text-sm text-gray-500">{member.email}</p>
                        {editing ? (
                          <RoleSelect value={editingMember.role} onChange={(role) => setEditingMember((current) => ({ ...current, role }))} />
                        ) : (
                          <Badge variant={roleBadgeVariant[member.role]}>{roleLabels[member.role]}</Badge>
                        )}
                        <Badge variant={status === "active" ? "green" : "gray"} dot>
                          {status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-500">{formatDate(member.created_at)}</span>
                          {canManageTeam && (
                            <div className="flex items-center gap-1">
                              {editing ? (
                                <button type="button" onClick={() => handleSaveMember(member.id)} className="rounded-lg p-2 text-success-600 hover:bg-success-100" aria-label="Salvar usuário">
                                  <Check className="h-4 w-4" />
                                </button>
                              ) : (
                                <button type="button" onClick={() => startEditMember(member)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Editar usuário">
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              <button type="button" onClick={() => handleToggleMemberStatus(member)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="Alterar status">
                                <Ban className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "permissions" && (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(["owner", "manager", "operator"] as UserRole[]).map((role) => (
              <div key={role} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <Badge variant={roleBadgeVariant[role]}>{roleLabels[role]}</Badge>
                <p className="mt-3 text-sm leading-6 text-gray-600">{roleDescriptions[role]}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">
              <span>Permissão</span>
              <span>Owner</span>
              <span>Manager</span>
              <span>Operator</span>
            </div>
            {permissionRows.map((row) => (
              <div key={row.permission} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 border-t border-gray-100 px-4 py-3 text-sm">
                <span className="font-medium text-navy-900">{row.label}</span>
                {(["owner", "manager", "operator"] as UserRole[]).map((role) => (
                  <span key={role} className={rolePermissions[role].includes(row.permission) ? "text-success-600" : "text-gray-300"}>
                    {rolePermissions[role].includes(row.permission) ? "Sim" : "Não"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "warranty" && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning-100">
              <FileText className="h-5 w-5 text-warning-600" />
            </div>
            <div>
              <h3 className="font-bold text-navy-900">Termos e Garantias</h3>
              <p className="text-xs text-gray-500">Texto padrão usado nos documentos de venda.</p>
            </div>
          </div>
          <Textarea
            rows={7}
            label="Texto Padrão de Garantia"
            value={company.warranty_template}
            disabled={!canEditSettings}
            onChange={(event) => updateCompanyField("warranty_template", event.target.value)}
          />
          <Button onClick={handleSaveCompany} disabled={saving || !canEditSettings}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar garantia
          </Button>
        </section>
      )}

      {activeTab === "finance" && (
        <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-navy-900">Módulo Financeiro</h3>
              <p className="text-xs text-gray-500">Atalhos respeitam o perfil do usuário logado.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FinanceLink href="/financeiro" title="Painel Financeiro" description="Caixa, conciliação e fluxo de recebíveis" allowed={canAccess(currentUser.role, "finance.view")} />
            <FinanceLink href="/financeiro/taxas" title="Taxas da Maquininha" description="Margens e taxas críticas de venda" allowed={canAccess(currentUser.role, "finance.tax_settings")} />
            <FinanceLink href="/financeiro/dre" title="DRE" description="Resultado gerencial mensalizado" allowed={canAccess(currentUser.role, "finance.dre")} />
            <FinanceLink href="/financeiro/transacoes" title="Entradas e Saídas" description="Lançamentos financeiros operacionais" allowed={canAccess(currentUser.role, "finance.view")} />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-royal-100 bg-royal-50 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-royal-500" />
            <p className="text-xs leading-relaxed text-royal-700">
              Botões escondidos ajudam a UX, mas as mesmas permissões também são validadas no `/api/db`.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-navy-900">{value}</p>
    </div>
  )
}

function RoleSelect({ value, onChange, disabled = false }: { value: UserRole; onChange: (role: UserRole) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-navy-900">Cargo</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as UserRole)}
        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-900 outline-none transition focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20 disabled:pointer-events-none disabled:opacity-50"
      >
        <option value="owner">Owner</option>
        <option value="manager">Manager</option>
        <option value="operator">Operator</option>
      </select>
    </div>
  )
}

function FinanceLink({ href, title, description, allowed }: { href: string; title: string; description: string; allowed: boolean }) {
  if (!allowed) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 opacity-70">
        <div>
          <p className="font-bold text-navy-900">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <Lock className="h-4 w-4 text-gray-400" />
      </div>
    )
  }

  return (
    <Link href={href} className="group flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-royal-200 hover:bg-white">
      <div>
        <p className="font-bold text-navy-900">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:text-royal-500" />
    </Link>
  )
}
