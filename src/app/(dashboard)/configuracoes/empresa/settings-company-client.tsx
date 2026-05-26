"use client"

import { useMemo, useState, useTransition, type ElementType, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Globe2,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Palette,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  BrandProfileInput,
  CompanyBrandProfile,
  CompanyContactChannel,
  CompanyContactChannelType,
  CompanyDocumentProfile,
  CompanyIdentity,
  CompanySettingsAuditLog,
  DocumentProfileInput,
  ContactChannelInput,
  CompanySettingsMutationResult,
  CompanyThemeMode,
} from "@/lib/company-settings"
import {
  deactivateContactChannelAction,
  saveBrandProfileAction,
  saveContactChannelAction,
  saveDocumentProfileAction,
} from "./actions"

type CompanySummary = {
  id: string
  name: string
  slug: string
}

type CompanySettingsClientProps = {
  company: CompanySummary
  canEditSettings: boolean
  loadError: string | null
  identity: CompanyIdentity | null
  brandProfile: CompanyBrandProfile | null
  contactChannels: CompanyContactChannel[]
  documentProfile: CompanyDocumentProfile | null
  primaryWhatsapp: CompanyContactChannel | null
  auditLogs: CompanySettingsAuditLog[]
}

type FieldErrors = Record<string, string>

const contactTypes: CompanyContactChannelType[] = [
  "whatsapp",
  "instagram",
  "email",
  "phone",
  "website",
  "address",
  "other",
]

const contactTypeLabels: Record<CompanyContactChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-mail",
  phone: "Telefone",
  website: "Site",
  address: "Endereço",
  other: "Outro",
}

const themeLabels: Record<CompanyThemeMode, string> = {
  dark: "Dark",
  light: "Light",
  system: "Sistema",
}

const auditActionLabels: Record<CompanySettingsAuditLog["action"], string> = {
  update_brand: "Marca atualizada",
  create_contact: "Contato criado",
  update_contact: "Contato atualizado",
  deactivate_contact: "Contato desativado",
  reactivate_contact: "Contato reativado",
  update_document_profile: "Perfil documental atualizado",
}

function auditActionLabel(action: CompanySettingsAuditLog["action"]): string {
  return auditActionLabels[action] ?? action
}

function auditSummary(log: CompanySettingsAuditLog): string {
  const summary = log.metadata?.summary
  if (typeof summary === "string" && summary.length > 0) return summary
  return auditActionLabel(log.action)
}

function auditChangedLabels(log: CompanySettingsAuditLog): string[] {
  const labels = log.metadata?.changedFieldLabels
  if (Array.isArray(labels)) {
    return labels.filter((l): l is string => typeof l === "string")
  }
  return []
}

function emptyBrandForm(companyName: string): BrandProfileInput {
  return {
    displayName: companyName,
    legalName: "",
    shortName: companyName.split(/\s+/)[0] || companyName,
    slogan: "",
    publicDescription: "",
    canonicalDomain: "",
    city: "",
    state: "",
    locale: "pt-BR",
    primaryColor: "",
    accentColor: "",
    logoUrl: "",
    faviconUrl: "",
    appleIconUrl: "",
    ogImageUrl: "",
    themeMode: "dark",
  }
}

function brandToForm(profile: CompanyBrandProfile | null, companyName: string): BrandProfileInput {
  if (!profile) return emptyBrandForm(companyName)
  return {
    displayName: profile.displayName,
    legalName: profile.legalName || "",
    shortName: profile.shortName || "",
    slogan: profile.slogan || "",
    publicDescription: profile.publicDescription || "",
    canonicalDomain: profile.canonicalDomain || "",
    city: profile.city || "",
    state: profile.state || "",
    locale: profile.locale || "pt-BR",
    primaryColor: profile.primaryColor || "",
    accentColor: profile.accentColor || "",
    logoUrl: profile.logoUrl || "",
    faviconUrl: profile.faviconUrl || "",
    appleIconUrl: profile.appleIconUrl || "",
    ogImageUrl: profile.ogImageUrl || "",
    themeMode: profile.themeMode || "dark",
  }
}

function emptyContactForm(): ContactChannelInput {
  return {
    id: null,
    channelType: "whatsapp",
    label: "",
    value: "",
    url: "",
    isPrimary: false,
    isPublic: false,
    sortOrder: 50,
    active: true,
  }
}

function contactToForm(contact: CompanyContactChannel): ContactChannelInput {
  return {
    id: contact.id,
    channelType: contact.channelType,
    label: contact.label,
    value: contact.value,
    url: contact.url || "",
    isPrimary: contact.isPrimary,
    isPublic: contact.isPublic,
    sortOrder: contact.sortOrder,
    active: contact.active,
  }
}

function toDateTimeInput(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 16)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16)
  return date.toISOString().slice(0, 16)
}

function documentToForm(profile: CompanyDocumentProfile | null): DocumentProfileInput {
  return {
    issuerName: profile?.issuerName || "",
    legalName: profile?.legalName || "",
    documentNumber: profile?.documentNumber || "",
    addressLine: profile?.addressLine || "",
    city: profile?.city || "",
    state: profile?.state || "",
    phone: profile?.phone || "",
    email: profile?.email || "",
    defaultSellerName: profile?.defaultSellerName || "",
    signatureLabel: profile?.signatureLabel || "Responsável pela venda",
    active: profile?.active ?? true,
    effectiveFrom: toDateTimeInput(profile?.effectiveFrom),
    effectiveUntil: profile?.effectiveUntil ? toDateTimeInput(profile.effectiveUntil) : "",
  }
}

function resultMessage(result: CompanySettingsMutationResult) {
  return result.ok ? null : result.message
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-semibold text-red-300">{error}</span> : null}
    </label>
  )
}

function inputClass(error?: string) {
  return cn(
    "h-11 w-full rounded-xl border bg-slate-950/60 px-3 text-sm text-white outline-none transition placeholder:text-slate-600",
    "focus:border-blue-400 focus:ring-2 focus:ring-blue-400/15 disabled:cursor-not-allowed disabled:opacity-60",
    error ? "border-red-400/70" : "border-white/10"
  )
}

function textareaClass(error?: string) {
  return cn(
    "min-h-24 w-full resize-y rounded-xl border bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600",
    "focus:border-blue-400 focus:ring-2 focus:ring-blue-400/15 disabled:cursor-not-allowed disabled:opacity-60",
    error ? "border-red-400/70" : "border-white/10"
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ElementType
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-200">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
      ok ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-amber-400/20 bg-amber-400/10 text-amber-100"
    )}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {label}
    </div>
  )
}

export function CompanySettingsClient({
  company,
  canEditSettings,
  loadError,
  identity,
  brandProfile,
  contactChannels,
  documentProfile,
  primaryWhatsapp,
  auditLogs,
}: CompanySettingsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [brandForm, setBrandForm] = useState(() => brandToForm(brandProfile, company.name))
  const [contactForm, setContactForm] = useState<ContactChannelInput>(() => emptyContactForm())
  const [documentForm, setDocumentForm] = useState<DocumentProfileInput>(() => documentToForm(documentProfile))
  const [brandErrors, setBrandErrors] = useState<FieldErrors>({})
  const [contactErrors, setContactErrors] = useState<FieldErrors>({})
  const [documentErrors, setDocumentErrors] = useState<FieldErrors>({})

  const activeContacts = useMemo(() => contactChannels.filter((contact) => contact.active), [contactChannels])
  const missingFields = useMemo(() => {
    const missing: string[] = []
    if (!brandProfile) missing.push("Perfil de marca")
    if (!primaryWhatsapp) missing.push("WhatsApp principal")
    if (!documentProfile) missing.push("Perfil documental")
    return missing
  }, [brandProfile, documentProfile, primaryWhatsapp])

  function handleResult(result: CompanySettingsMutationResult, success: string, setErrors: (errors: FieldErrors) => void) {
    if (result.ok) {
      setErrors({})
      toast.success(success)
      router.refresh()
      return
    }
    setErrors(result.fieldErrors || {})
    toast.error(resultMessage(result) || "Nao foi possivel salvar.")
  }

  function saveBrand() {
    if (!canEditSettings) return toast.error("Seu perfil nao pode editar configuracoes.")
    startTransition(async () => {
      const result = await saveBrandProfileAction(brandForm)
      handleResult(result, "Marca salva.", setBrandErrors)
    })
  }

  function saveContact() {
    if (!canEditSettings) return toast.error("Seu perfil nao pode editar configuracoes.")
    startTransition(async () => {
      const result = await saveContactChannelAction(contactForm)
      handleResult(result, contactForm.id ? "Contato atualizado." : "Contato criado.", setContactErrors)
      if (result.ok) setContactForm(emptyContactForm())
    })
  }

  function editContact(contact: CompanyContactChannel) {
    setContactForm(contactToForm(contact))
    setContactErrors({})
  }

  function deactivateContact(contact: CompanyContactChannel) {
    if (!canEditSettings) return toast.error("Seu perfil nao pode editar configuracoes.")
    startTransition(async () => {
      const result = await deactivateContactChannelAction(contact.id)
      if (result.ok) {
        toast.success("Contato inativado.")
        if (contactForm.id === contact.id) setContactForm(emptyContactForm())
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  function saveDocument() {
    if (!canEditSettings) return toast.error("Seu perfil nao pode editar configuracoes.")
    startTransition(async () => {
      const result = await saveDocumentProfileAction(documentForm)
      handleResult(result, "Perfil documental salvo.", setDocumentErrors)
    })
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/configuracoes" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Configurações
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-white">Configurações da Empresa</h1>
              <Badge variant="blue">Fase 1B</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Identidade, contatos e perfil documental usados como base interna do ERP.
            </p>
          </div>
          {!canEditSettings ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
              <Lock className="h-4 w-4" />
              Somente leitura
            </div>
          ) : null}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">Configuração indisponível</p>
                <p className="mt-1 text-red-100/80">{loadError}</p>
              </div>
            </div>
          </div>
        ) : null}

        <SectionCard
          icon={SlidersHorizontal}
          title="Status da configuração"
          description="Resumo operacional da base configurada nesta fase."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatusPill ok={Boolean(identity)} label={identity?.displayName || company.name} />
            <StatusPill ok={Boolean(brandProfile)} label={brandProfile ? "Marca completa" : "Marca ausente"} />
            <StatusPill ok={activeContacts.length > 0} label={`${activeContacts.length} contatos ativos`} />
            <StatusPill ok={Boolean(primaryWhatsapp)} label={primaryWhatsapp ? "WhatsApp configurado" : "WhatsApp ausente"} />
            <StatusPill ok={Boolean(documentProfile)} label={documentProfile ? "Documento ativo" : "Documento ausente"} />
          </div>

          {missingFields.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              Campos ausentes: {missingFields.join(", ")}.
            </div>
          ) : null}

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm text-blue-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Regras de garantia, financeiro, catálogo e portal ainda não são controladas por esta tela.</p>
          </div>
        </SectionCard>

        <SectionCard icon={Palette} title="Marca" description="Identidade exibível e assets de marca por empresa.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nome público" error={brandErrors.displayName}>
              <input className={inputClass(brandErrors.displayName)} value={brandForm.displayName} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, displayName: event.target.value })} />
            </Field>
            <Field label="Nome curto" error={brandErrors.shortName}>
              <input className={inputClass(brandErrors.shortName)} value={brandForm.shortName} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, shortName: event.target.value })} />
            </Field>
            <Field label="Nome legal">
              <input className={inputClass()} value={brandForm.legalName} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, legalName: event.target.value })} />
            </Field>
            <Field label="Slogan">
              <input className={inputClass()} value={brandForm.slogan} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, slogan: event.target.value })} />
            </Field>
            <Field label="Domínio canônico" error={brandErrors.canonicalDomain}>
              <input className={inputClass(brandErrors.canonicalDomain)} value={brandForm.canonicalDomain} disabled={!canEditSettings} placeholder="https://..." onChange={(event) => setBrandForm({ ...brandForm, canonicalDomain: event.target.value })} />
            </Field>
            <Field label="Tema" error={brandErrors.themeMode}>
              <select className={inputClass(brandErrors.themeMode)} value={brandForm.themeMode} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, themeMode: event.target.value as CompanyThemeMode })}>
                {Object.entries(themeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Cidade">
              <input className={inputClass()} value={brandForm.city} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, city: event.target.value })} />
            </Field>
            <Field label="Estado" error={brandErrors.state}>
              <input className={inputClass(brandErrors.state)} value={brandForm.state} disabled={!canEditSettings} maxLength={2} onChange={(event) => setBrandForm({ ...brandForm, state: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Locale" error={brandErrors.locale}>
              <input className={inputClass(brandErrors.locale)} value={brandForm.locale} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, locale: event.target.value })} />
            </Field>
            <Field label="Cor principal" error={brandErrors.primaryColor}>
              <input className={inputClass(brandErrors.primaryColor)} value={brandForm.primaryColor} disabled={!canEditSettings} placeholder="#07162f" onChange={(event) => setBrandForm({ ...brandForm, primaryColor: event.target.value })} />
            </Field>
            <Field label="Cor de destaque" error={brandErrors.accentColor}>
              <input className={inputClass(brandErrors.accentColor)} value={brandForm.accentColor} disabled={!canEditSettings} placeholder="#3A6BC4" onChange={(event) => setBrandForm({ ...brandForm, accentColor: event.target.value })} />
            </Field>
            <Field label="Logo URL" error={brandErrors.logoUrl}>
              <input className={inputClass(brandErrors.logoUrl)} value={brandForm.logoUrl} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, logoUrl: event.target.value })} />
            </Field>
            <Field label="Favicon URL" error={brandErrors.faviconUrl}>
              <input className={inputClass(brandErrors.faviconUrl)} value={brandForm.faviconUrl} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, faviconUrl: event.target.value })} />
            </Field>
            <Field label="Apple icon URL" error={brandErrors.appleIconUrl}>
              <input className={inputClass(brandErrors.appleIconUrl)} value={brandForm.appleIconUrl} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, appleIconUrl: event.target.value })} />
            </Field>
            <Field label="OG image URL" error={brandErrors.ogImageUrl}>
              <input className={inputClass(brandErrors.ogImageUrl)} value={brandForm.ogImageUrl} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, ogImageUrl: event.target.value })} />
            </Field>
            <div className="md:col-span-2 xl:col-span-3">
              <Field label="Descrição pública">
                <textarea className={textareaClass()} value={brandForm.publicDescription} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, publicDescription: event.target.value })} />
              </Field>
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={saveBrand} disabled={!canEditSettings || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar marca
            </Button>
          </div>
        </SectionCard>

        <SectionCard icon={MessageCircle} title="Canais de contato" description="Canais oficiais, visibilidade e prioridade por tipo.">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.1fr_1.2fr_1.4fr_100px_110px_120px] gap-3 bg-slate-950/80 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 max-lg:hidden">
              <span>Tipo</span>
              <span>Label</span>
              <span>Valor</span>
              <span>Publico</span>
              <span>Principal</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-white/10">
              {contactChannels.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400">Nenhum canal cadastrado.</div>
              ) : contactChannels.map((contact) => (
                <div key={contact.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.1fr_1.2fr_1.4fr_100px_110px_120px] lg:items-center">
                  <div className="font-semibold text-white">{contactTypeLabels[contact.channelType]}</div>
                  <div className="text-slate-300">{contact.label}</div>
                  <div className="min-w-0 text-slate-400">
                    <p className="truncate">{contact.value}</p>
                    {contact.url ? <p className="truncate text-xs text-slate-600">{contact.url}</p> : null}
                  </div>
                  <div>{contact.isPublic ? <Badge variant="blue">Público</Badge> : <Badge variant="gray">Interno</Badge>}</div>
                  <div>{contact.isPrimary ? <Badge variant="green">Principal</Badge> : <Badge variant="gray">Não</Badge>}</div>
                  <div className="flex items-center justify-between gap-2">
                    {contact.active ? <Badge variant="green">Ativo</Badge> : <Badge variant="gray">Inativo</Badge>}
                    <div className="flex gap-2">
                      <button type="button" className="text-xs font-bold text-blue-200 hover:text-white" disabled={!canEditSettings} onClick={() => editContact(contact)}>Editar</button>
                      {contact.active ? <button type="button" className="text-xs font-bold text-red-200 hover:text-white" disabled={!canEditSettings} onClick={() => deactivateContact(contact)}>Inativar</button> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <Plus className="h-4 w-4 text-blue-200" />
              {contactForm.id ? "Editar contato" : "Novo contato"}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Tipo" error={contactErrors.channelType}>
                <select className={inputClass(contactErrors.channelType)} value={contactForm.channelType} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, channelType: event.target.value as CompanyContactChannelType })}>
                  {contactTypes.map((type) => <option key={type} value={type}>{contactTypeLabels[type]}</option>)}
                </select>
              </Field>
              <Field label="Label" error={contactErrors.label}>
                <input className={inputClass(contactErrors.label)} value={contactForm.label} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, label: event.target.value })} />
              </Field>
              <Field label="Valor" error={contactErrors.value}>
                <input className={inputClass(contactErrors.value)} value={contactForm.value} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, value: event.target.value })} />
              </Field>
              <Field label="URL" error={contactErrors.url}>
                <input className={inputClass(contactErrors.url)} value={contactForm.url} disabled={!canEditSettings} placeholder="https://..." onChange={(event) => setContactForm({ ...contactForm, url: event.target.value })} />
              </Field>
              <Field label="Ordem">
                <input className={inputClass()} type="number" value={contactForm.sortOrder} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, sortOrder: Number(event.target.value) })} />
              </Field>
              <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-slate-200">
                <input type="checkbox" checked={contactForm.isPublic} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, isPublic: event.target.checked })} />
                Público
              </label>
              <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-slate-200">
                <input type="checkbox" checked={contactForm.isPrimary} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, isPrimary: event.target.checked })} />
                Principal
              </label>
              <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-slate-200">
                <input type="checkbox" checked={contactForm.active} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, active: event.target.checked })} />
                Ativo
              </label>
            </div>
            {contactErrors.isPrimary ? <p className="mt-3 text-xs font-semibold text-red-300">{contactErrors.isPrimary}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={saveContact} disabled={!canEditSettings || isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {contactForm.id ? "Salvar contato" : "Adicionar contato"}
              </Button>
              {contactForm.id ? (
                <Button variant="ghost" onClick={() => setContactForm(emptyContactForm())} disabled={isPending}>
                  Cancelar edição
                </Button>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={FileText} title="Perfil documental" description="Dados base para documentos em fase futura.">
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Esses dados ainda não alteram os documentos gerados. A integração com recibos, termos e laudos será feita em fase futura.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nome do emissor" error={documentErrors.issuerName}>
              <input className={inputClass(documentErrors.issuerName)} value={documentForm.issuerName} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, issuerName: event.target.value })} />
            </Field>
            <Field label="Nome legal" error={documentErrors.legalName}>
              <input className={inputClass(documentErrors.legalName)} value={documentForm.legalName} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, legalName: event.target.value })} />
            </Field>
            <Field label="Documento/CNPJ/CPF">
              <input className={inputClass()} value={documentForm.documentNumber} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, documentNumber: event.target.value })} />
            </Field>
            <Field label="Endereço">
              <input className={inputClass()} value={documentForm.addressLine} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, addressLine: event.target.value })} />
            </Field>
            <Field label="Cidade">
              <input className={inputClass()} value={documentForm.city} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, city: event.target.value })} />
            </Field>
            <Field label="Estado" error={documentErrors.state}>
              <input className={inputClass(documentErrors.state)} value={documentForm.state} disabled={!canEditSettings} maxLength={2} onChange={(event) => setDocumentForm({ ...documentForm, state: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Telefone" error={documentErrors.phone}>
              <input className={inputClass(documentErrors.phone)} value={documentForm.phone} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, phone: event.target.value })} />
            </Field>
            <Field label="Email" error={documentErrors.email}>
              <input className={inputClass(documentErrors.email)} value={documentForm.email} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, email: event.target.value })} />
            </Field>
            <Field label="Vendedor padrão">
              <input className={inputClass()} value={documentForm.defaultSellerName} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, defaultSellerName: event.target.value })} />
            </Field>
            <Field label="Label de assinatura">
              <input className={inputClass()} value={documentForm.signatureLabel} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, signatureLabel: event.target.value })} />
            </Field>
            <Field label="Vigência inicial" error={documentErrors.effectiveFrom}>
              <input className={inputClass(documentErrors.effectiveFrom)} type="datetime-local" value={documentForm.effectiveFrom} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, effectiveFrom: event.target.value })} />
            </Field>
            <Field label="Vigência final" error={documentErrors.effectiveUntil}>
              <input className={inputClass(documentErrors.effectiveUntil)} type="datetime-local" value={documentForm.effectiveUntil} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, effectiveUntil: event.target.value })} />
            </Field>
            <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-slate-200">
              <input type="checkbox" checked={documentForm.active} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, active: event.target.checked })} />
              Ativo
            </label>
          </div>
          <div className="mt-5">
            <Button onClick={saveDocument} disabled={!canEditSettings || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar perfil documental
            </Button>
          </div>
        </SectionCard>

        <SectionCard icon={Clock} title="Alterações recentes" description="Histórico das últimas modificações nas configurações da empresa.">
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {auditLogs.map((log) => {
                const summary = auditSummary(log)
                const changedLabels = auditChangedLabels(log)
                return (
                  <li key={log.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-slate-200">{summary}</span>
                      {changedLabels.length > 0 && (
                        <span className="text-xs text-slate-400">{changedLabels.join(" · ")}</span>
                      )}
                      <span className="text-xs text-slate-500">{log.actorEmail ?? "Sistema"}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-400 md:grid-cols-3">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-500" /> {company.slug}</div>
          <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-slate-500" /> Sem impacto em metadata pública</div>
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500" /> Sem troca de WhatsApp público</div>
        </div>
      </div>
    </main>
  )
}
