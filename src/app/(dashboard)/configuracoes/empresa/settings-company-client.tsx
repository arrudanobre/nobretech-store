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
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Globe2,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Palette,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  digitsOnly,
  isValidEmail,
  isValidUrl,
  maskCpfCnpj,
  maskPhoneBr,
} from "@/lib/masks"
import { UploadField } from "@/components/company-settings/UploadField"
import { ColorField } from "@/components/company-settings/ColorField"
import type {
  BrandProfileInput,
  CompanyBrandProfile,
  CompanyContactChannel,
  CompanyContactChannelType,
  CompanyDocumentProfile,
  CompanyIdentity,
  CompanySettingsAuditLog,
  CompanySettingsMutationResult,
  ContactChannelInput,
  DocumentProfileInput,
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

const auditActionLabels: Record<CompanySettingsAuditLog["action"], string> = {
  update_brand: "Marca atualizada",
  create_contact: "Contato criado",
  update_contact: "Contato atualizado",
  deactivate_contact: "Contato desativado",
  reactivate_contact: "Contato reativado",
  update_document_profile: "Perfil documental atualizado",
  create_warranty_policy: "Politica de garantia criada",
  update_warranty_policy: "Politica de garantia atualizada",
  deactivate_warranty_policy: "Politica de garantia inativada",
  create_warranty_term: "Clausula de garantia criada",
  update_warranty_term: "Clausula de garantia atualizada",
  deactivate_warranty_term: "Clausula de garantia inativada",
  create_sale_item_warranty: "Garantia do item criada",
  update_sale_item_warranty: "Garantia do item atualizada",
  deactivate_sale_item_warranty: "Garantia do item inativada",
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

function emptyContactForm(nextSortOrder: number): ContactChannelInput {
  return {
    id: null,
    channelType: "whatsapp",
    label: "",
    value: "",
    url: "",
    isPrimary: false,
    isPublic: true,
    sortOrder: nextSortOrder,
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

function Field({ label, hint, children, error }: { label: string; hint?: string; children: ReactNode; error?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs font-semibold text-red-300">{error}</span> : null}
    </label>
  )
}

function inputClass(error?: string) {
  return cn(
    "h-11 w-full rounded-xl border bg-white/[0.03] px-3 text-sm text-white outline-none transition placeholder:text-slate-500",
    "hover:bg-white/[0.04] focus:border-blue-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-blue-400/15",
    "disabled:cursor-not-allowed disabled:opacity-60",
    error ? "border-red-400/60" : "border-white/[0.06]"
  )
}

function textareaClass(error?: string) {
  return cn(
    "min-h-24 w-full resize-y rounded-xl border bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500",
    "hover:bg-white/[0.04] focus:border-blue-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-blue-400/15",
    "disabled:cursor-not-allowed disabled:opacity-60",
    error ? "border-red-400/60" : "border-white/[0.06]"
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: ElementType
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-200">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          </div>
        </div>
        {action}
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

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:bg-white/[0.04]">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-400"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description ? <span className="block text-xs text-slate-400">{description}</span> : null}
      </span>
    </label>
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
  const nextSortOrder = useMemo(() => {
    const max = contactChannels.reduce((acc, c) => Math.max(acc, c.sortOrder || 0), 0)
    return max + 1
  }, [contactChannels])
  const [contactForm, setContactForm] = useState<ContactChannelInput>(() => emptyContactForm(nextSortOrder))
  const [documentForm, setDocumentForm] = useState<DocumentProfileInput>(() => documentToForm(documentProfile))
  const [brandErrors, setBrandErrors] = useState<FieldErrors>({})
  const [contactErrors, setContactErrors] = useState<FieldErrors>({})
  const [documentErrors, setDocumentErrors] = useState<FieldErrors>({})

  const sortedContacts = useMemo(
    () => [...contactChannels].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [contactChannels]
  )
  const activeContacts = useMemo(() => contactChannels.filter((contact) => contact.active), [contactChannels])
  const missingFields = useMemo(() => {
    const missing: string[] = []
    if (!brandProfile) missing.push("Identidade pública")
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
    toast.error(resultMessage(result) || "Não foi possível salvar.")
  }

  function saveBrand(successMessage: string) {
    if (!canEditSettings) return toast.error("Seu perfil não pode editar configurações.")
    startTransition(async () => {
      const result = await saveBrandProfileAction(brandForm)
      handleResult(result, successMessage, setBrandErrors)
    })
  }

  function saveContact() {
    if (!canEditSettings) return toast.error("Seu perfil não pode editar configurações.")
    if (contactForm.channelType === "email" && contactForm.value && !isValidEmail(contactForm.value)) {
      setContactErrors({ value: "Informe um e-mail válido." })
      return
    }
    if ((contactForm.channelType === "website" || contactForm.url) && contactForm.url && !isValidUrl(contactForm.url)) {
      setContactErrors({ url: "Informe uma URL válida (https://...)." })
      return
    }
    startTransition(async () => {
      const result = await saveContactChannelAction(contactForm)
      handleResult(result, contactForm.id ? "Contato atualizado." : "Contato criado.", setContactErrors)
      if (result.ok) setContactForm(emptyContactForm(nextSortOrder))
    })
  }

  function editContact(contact: CompanyContactChannel) {
    setContactForm(contactToForm(contact))
    setContactErrors({})
  }

  function deactivateContact(contact: CompanyContactChannel) {
    if (!canEditSettings) return toast.error("Seu perfil não pode editar configurações.")
    if (!confirm(`Inativar o contato "${contact.label || contactTypeLabels[contact.channelType]}"?`)) return
    startTransition(async () => {
      const result = await deactivateContactChannelAction(contact.id)
      if (result.ok) {
        toast.success("Contato inativado.")
        if (contactForm.id === contact.id) setContactForm(emptyContactForm(nextSortOrder))
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  function moveContact(contactId: string, direction: "up" | "down") {
    if (!canEditSettings) return
    const index = sortedContacts.findIndex((c) => c.id === contactId)
    const swap = direction === "up" ? index - 1 : index + 1
    if (index < 0 || swap < 0 || swap >= sortedContacts.length) return
    const a = sortedContacts[index]
    const b = sortedContacts[swap]
    startTransition(async () => {
      const r1 = await saveContactChannelAction({ ...contactToForm(a), sortOrder: b.sortOrder })
      const r2 = await saveContactChannelAction({ ...contactToForm(b), sortOrder: a.sortOrder })
      if (!r1.ok || !r2.ok) {
        toast.error("Não foi possível reordenar.")
      }
      router.refresh()
    })
  }

  function saveDocument() {
    if (!canEditSettings) return toast.error("Seu perfil não pode editar configurações.")
    if (documentForm.email && !isValidEmail(documentForm.email)) {
      setDocumentErrors({ email: "Informe um e-mail válido." })
      return
    }
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
              <h1 className="text-3xl font-black tracking-tight text-white">Central da empresa</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Identidade, marca, canais de contato e perfil documental usados como base do ERP.
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
          description="Resumo do que já está preenchido."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusPill ok={Boolean(brandProfile)} label={identity?.displayName || company.name} />
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
            <p>Garantia, financeiro, catálogo e portal continuam sendo configurados em telas próprias.</p>
          </div>
        </SectionCard>

        {/* IDENTIDADE PÚBLICA */}
        <SectionCard
          icon={Building2}
          title="Identidade da empresa"
          description="Dados públicos e institucionais usados pelo ERP e pelo catálogo."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nome público" error={brandErrors.displayName}>
              <input className={inputClass(brandErrors.displayName)} value={brandForm.displayName} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, displayName: event.target.value })} />
            </Field>
            <Field label="Nome curto" hint="Versão reduzida usada em espaços pequenos." error={brandErrors.shortName}>
              <input className={inputClass(brandErrors.shortName)} value={brandForm.shortName} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, shortName: event.target.value })} />
            </Field>
            <Field label="Nome legal" hint="Razão social. Aparece em documentos.">
              <input className={inputClass()} value={brandForm.legalName} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, legalName: event.target.value })} />
            </Field>
            <Field label="Slogan">
              <input className={inputClass()} value={brandForm.slogan} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, slogan: event.target.value })} />
            </Field>
            <Field label="Cidade">
              <input className={inputClass()} value={brandForm.city} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, city: event.target.value })} />
            </Field>
            <Field label="Estado" hint="Sigla UF (2 letras)." error={brandErrors.state}>
              <input className={inputClass(brandErrors.state)} value={brandForm.state} disabled={!canEditSettings} maxLength={2} onChange={(event) => setBrandForm({ ...brandForm, state: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Idioma" hint="Locale (ex: pt-BR)." error={brandErrors.locale}>
              <input className={inputClass(brandErrors.locale)} value={brandForm.locale} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, locale: event.target.value })} />
            </Field>
            <Field label="Domínio público" hint="URL canônica da loja (https://...)." error={brandErrors.canonicalDomain}>
              <input className={inputClass(brandErrors.canonicalDomain)} value={brandForm.canonicalDomain} disabled={!canEditSettings} placeholder="https://..." onChange={(event) => setBrandForm({ ...brandForm, canonicalDomain: event.target.value })} />
            </Field>
            <div className="md:col-span-2 xl:col-span-3">
              <Field label="Descrição pública" hint="Texto institucional usado em metadados e telas públicas.">
                <textarea className={textareaClass()} value={brandForm.publicDescription} disabled={!canEditSettings} onChange={(event) => setBrandForm({ ...brandForm, publicDescription: event.target.value })} />
              </Field>
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={() => saveBrand("Identidade salva.")} disabled={!canEditSettings || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar identidade
            </Button>
          </div>
        </SectionCard>

        {/* MARCA E APARÊNCIA */}
        <SectionCard
          icon={Palette}
          title="Marca e aparência"
          description="Logo, favicon, imagem social e cores. Influencia identidade visual pública, vitrine e elementos de branding."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <UploadField
              label="Logo"
              description="Aparece em telas internas e na vitrine."
              slot="logo"
              value={brandForm.logoUrl || null}
              disabled={!canEditSettings}
              onChange={(url) => setBrandForm({ ...brandForm, logoUrl: url })}
              onClear={() => setBrandForm({ ...brandForm, logoUrl: "" })}
            />
            <UploadField
              label="Favicon"
              description="Ícone exibido na aba do navegador."
              slot="favicon"
              previewKind="icon"
              value={brandForm.faviconUrl || null}
              disabled={!canEditSettings}
              onChange={(url) => setBrandForm({ ...brandForm, faviconUrl: url })}
              onClear={() => setBrandForm({ ...brandForm, faviconUrl: "" })}
            />
            <UploadField
              label="Imagem social"
              description="Open Graph (WhatsApp, redes sociais). Proporção 1200×630."
              slot="og"
              aspect="wide"
              value={brandForm.ogImageUrl || null}
              disabled={!canEditSettings}
              onChange={(url) => setBrandForm({ ...brandForm, ogImageUrl: url })}
              onClear={() => setBrandForm({ ...brandForm, ogImageUrl: "" })}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ColorField
              label="Cor principal"
              description="Usada como base do branding."
              value={brandForm.primaryColor || ""}
              disabled={!canEditSettings}
              onChange={(hex) => setBrandForm({ ...brandForm, primaryColor: hex })}
              fallback="#0D1B2E"
            />
            <ColorField
              label="Cor de destaque"
              description="Usada em chamadas e CTAs."
              value={brandForm.accentColor || ""}
              disabled={!canEditSettings}
              onChange={(hex) => setBrandForm({ ...brandForm, accentColor: hex })}
              fallback="#3A6BC4"
            />
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm text-blue-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Estas cores influenciam identidade visual pública da marca, vitrine e elementos de branding. Ainda não são aplicadas em gráficos ou no ERP completo.</p>
          </div>

          {/* Tema — desabilitado (Fase futura) */}
          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 opacity-80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Tema visual do ERP</p>
                  <p className="text-xs text-slate-400">Personalização visual do ERP será liberada em fase futura.</p>
                </div>
              </div>
              <select className={cn(inputClass(), "h-10 w-auto cursor-not-allowed")} value={brandForm.themeMode} disabled>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">Sistema</option>
              </select>
            </div>
          </div>

          <div className="mt-5">
            <Button onClick={() => saveBrand("Marca salva.")} disabled={!canEditSettings || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar marca
            </Button>
          </div>
        </SectionCard>

        {/* CANAIS DE CONTATO */}
        <SectionCard
          icon={MessageCircle}
          title="Canais de contato"
          description="Canais oficiais exibidos para clientes. A ordem é a sequência da lista."
        >
          <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
            <div className="grid grid-cols-[1fr_1.4fr_1.6fr_140px_160px] gap-3 bg-white/[0.02] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 max-lg:hidden">
              <span>Tipo</span>
              <span>Nome exibido</span>
              <span>Contato</span>
              <span>Visibilidade</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-white/10">
              {sortedContacts.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400">Nenhum canal cadastrado.</div>
              ) : sortedContacts.map((contact, index) => (
                <div key={contact.id} className="grid gap-3 px-4 py-3 text-sm transition lg:grid-cols-[1fr_1.4fr_1.6fr_140px_160px] lg:items-center hover:bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
                      <button
                        type="button"
                        aria-label="Mover para cima"
                        onClick={() => moveContact(contact.id, "up")}
                        disabled={!canEditSettings || index === 0 || isPending}
                        className="flex h-6 w-7 items-center justify-center text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Mover para baixo"
                        onClick={() => moveContact(contact.id, "down")}
                        disabled={!canEditSettings || index === sortedContacts.length - 1 || isPending}
                        className="flex h-6 w-7 items-center justify-center border-t border-white/[0.06] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="font-semibold text-white">{contactTypeLabels[contact.channelType]}</span>
                    {contact.isPrimary ? <Badge variant="green">Principal</Badge> : null}
                  </div>
                  <div className="text-slate-300">{contact.label || <span className="text-slate-500">—</span>}</div>
                  <div className="min-w-0 text-slate-400">
                    <p className="truncate">{contact.value}</p>
                    {contact.url ? <p className="truncate text-xs text-slate-500/80">{contact.url}</p> : null}
                  </div>
                  <div>
                    {contact.isPublic ? <Badge variant="blue">Visível</Badge> : <Badge variant="gray">Oculto</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {contact.active ? <Badge variant="green">Ativo</Badge> : <Badge variant="gray">Inativo</Badge>}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Editar contato"
                        title="Editar contato"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                        disabled={!canEditSettings || isPending}
                        onClick={() => editContact(contact)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {contact.active ? (
                        <button
                          type="button"
                          aria-label="Inativar contato"
                          title="Inativar contato"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                          disabled={!canEditSettings || isPending}
                          onClick={() => deactivateContact(contact)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formulário novo / editar */}
          <div className="mt-5 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <Plus className="h-4 w-4 text-blue-200" />
              {contactForm.id ? "Editar contato" : "Novo contato"}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Tipo" error={contactErrors.channelType}>
                <select className={inputClass(contactErrors.channelType)} value={contactForm.channelType} disabled={!canEditSettings} onChange={(event) => setContactForm({ ...contactForm, channelType: event.target.value as CompanyContactChannelType })}>
                  {contactTypes.map((type) => <option key={type} value={type}>{contactTypeLabels[type]}</option>)}
                </select>
              </Field>
              <Field label="Nome exibido" hint="Como o canal aparece para o cliente." error={contactErrors.label}>
                <input className={inputClass(contactErrors.label)} value={contactForm.label} disabled={!canEditSettings} placeholder="Ex: WhatsApp da loja" onChange={(event) => setContactForm({ ...contactForm, label: event.target.value })} />
              </Field>
              <Field label="Contato" hint={contactForm.channelType === "phone" || contactForm.channelType === "whatsapp" ? "Aceita máscara automática." : undefined} error={contactErrors.value}>
                <input
                  className={inputClass(contactErrors.value)}
                  value={
                    contactForm.channelType === "phone" || contactForm.channelType === "whatsapp"
                      ? maskPhoneBr(contactForm.value)
                      : contactForm.value
                  }
                  disabled={!canEditSettings}
                  onChange={(event) => {
                    const isPhone = contactForm.channelType === "phone" || contactForm.channelType === "whatsapp"
                    const raw = event.target.value
                    setContactForm({ ...contactForm, value: isPhone ? digitsOnly(raw) : raw })
                  }}
                />
              </Field>
              <Field label="Link (opcional)" hint="Link direto. Útil para Instagram, site ou WhatsApp." error={contactErrors.url}>
                <input className={inputClass(contactErrors.url)} value={contactForm.url} disabled={!canEditSettings} placeholder="https://..." onChange={(event) => setContactForm({ ...contactForm, url: event.target.value })} />
              </Field>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Toggle
                label="Visível para clientes"
                description="Aparece em telas públicas (catálogo, recibos)."
                checked={contactForm.isPublic}
                disabled={!canEditSettings}
                onChange={(v) => setContactForm({ ...contactForm, isPublic: v })}
              />
              <Toggle
                label="Canal principal"
                description="Usado como contato preferencial deste tipo."
                checked={contactForm.isPrimary}
                disabled={!canEditSettings}
                onChange={(v) => setContactForm({ ...contactForm, isPrimary: v })}
              />
              <Toggle
                label="Ativo"
                description="Desligar inativa sem apagar o histórico."
                checked={contactForm.active}
                disabled={!canEditSettings}
                onChange={(v) => setContactForm({ ...contactForm, active: v })}
              />
            </div>

            {contactErrors.isPrimary ? <p className="mt-3 text-xs font-semibold text-red-300">{contactErrors.isPrimary}</p> : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={saveContact} disabled={!canEditSettings || isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {contactForm.id ? "Salvar contato" : "Adicionar contato"}
              </Button>
              {contactForm.id ? (
                <button
                  type="button"
                  onClick={() => setContactForm(emptyContactForm(nextSortOrder))}
                  disabled={isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </div>
        </SectionCard>

        {/* PERFIL DOCUMENTAL */}
        <SectionCard
          icon={FileText}
          title="Perfil documental"
          description="Dados base para recibos, termos e laudos."
        >
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>A integração com documentos gerados (recibos, termos e laudos) ocorre em fase futura. Esta tela só registra os dados.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nome do emissor" error={documentErrors.issuerName}>
              <input className={inputClass(documentErrors.issuerName)} value={documentForm.issuerName} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, issuerName: event.target.value })} />
            </Field>
            <Field label="Razão social" error={documentErrors.legalName}>
              <input className={inputClass(documentErrors.legalName)} value={documentForm.legalName} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, legalName: event.target.value })} />
            </Field>
            <Field label="CPF / CNPJ" hint="Máscara aplicada automaticamente.">
              <input
                className={inputClass()}
                value={maskCpfCnpj(documentForm.documentNumber)}
                disabled={!canEditSettings}
                onChange={(event) => setDocumentForm({ ...documentForm, documentNumber: digitsOnly(event.target.value) })}
              />
            </Field>
            <Field label="Endereço">
              <input className={inputClass()} value={documentForm.addressLine} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, addressLine: event.target.value })} />
            </Field>
            <Field label="Cidade">
              <input className={inputClass()} value={documentForm.city} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, city: event.target.value })} />
            </Field>
            <Field label="Estado" hint="Sigla UF (2 letras)." error={documentErrors.state}>
              <input className={inputClass(documentErrors.state)} value={documentForm.state} disabled={!canEditSettings} maxLength={2} onChange={(event) => setDocumentForm({ ...documentForm, state: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Telefone" hint="Máscara automática para celular/fixo." error={documentErrors.phone}>
              <input
                className={inputClass(documentErrors.phone)}
                value={maskPhoneBr(documentForm.phone)}
                disabled={!canEditSettings}
                onChange={(event) => setDocumentForm({ ...documentForm, phone: digitsOnly(event.target.value) })}
              />
            </Field>
            <Field label="E-mail" error={documentErrors.email}>
              <input
                type="email"
                className={inputClass(documentErrors.email)}
                value={documentForm.email}
                disabled={!canEditSettings}
                placeholder="contato@dominio.com"
                onChange={(event) => setDocumentForm({ ...documentForm, email: event.target.value })}
              />
            </Field>
            <Field label="Vendedor padrão" hint="Aparece em assinaturas de documentos.">
              <input className={inputClass()} value={documentForm.defaultSellerName} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, defaultSellerName: event.target.value })} />
            </Field>
            <Field label="Texto da assinatura">
              <input className={inputClass()} value={documentForm.signatureLabel} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, signatureLabel: event.target.value })} />
            </Field>
            <Field label="Vigência inicial" hint="A partir desta data o perfil passa a valer." error={documentErrors.effectiveFrom}>
              <input className={inputClass(documentErrors.effectiveFrom)} type="datetime-local" value={documentForm.effectiveFrom} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, effectiveFrom: event.target.value })} />
            </Field>
            <Field label="Vigência final" hint="Opcional. Deixe vazio para indefinido." error={documentErrors.effectiveUntil}>
              <input className={inputClass(documentErrors.effectiveUntil)} type="datetime-local" value={documentForm.effectiveUntil} disabled={!canEditSettings} onChange={(event) => setDocumentForm({ ...documentForm, effectiveUntil: event.target.value })} />
            </Field>
            <div className="md:col-span-2 xl:col-span-3">
              <Toggle
                label="Ativo"
                description="Desligar suspende este perfil sem apagar."
                checked={documentForm.active}
                disabled={!canEditSettings}
                onChange={(v) => setDocumentForm({ ...documentForm, active: v })}
              />
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={saveDocument} disabled={!canEditSettings || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar perfil documental
            </Button>
          </div>
        </SectionCard>

        {/* AUDIT LOGS */}
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

        <div className="grid gap-3 rounded-2xl border border-white/[0.06] bg-slate-900/50 p-4 text-sm text-slate-400 md:grid-cols-3">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-500" /> {company.slug}</div>
          <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-slate-500" /> Sem impacto em metadados públicos automáticos</div>
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500" /> Sem troca de canais públicos sem salvar</div>
        </div>
      </div>
    </main>
  )
}
