"use client"

import { useMemo, useState, useTransition } from "react"

import Link from "next/link"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  Info,
  Lock,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Type,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

import {
  saveCatalogSettingsAction,
  createCatalogTrustBadgeAction,
  updateCatalogTrustBadgeAction,
  deactivateCatalogTrustBadgeAction,
} from "./actions"
import { PublicationRulesPanel } from "./publication-rules-panel"
import type { CatalogPublicSettings, CatalogTrustBadge } from "@/lib/catalog/settings"
import type { CatalogPublicationRulesPanelData } from "@/lib/catalog/publication-rules-diagnostics"
import { BADGE_ICON_GALLERY, DEFAULT_BADGE_ICON, resolveBadgeIconKey } from "@/lib/catalog/badge-icons"

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

export function VitrinePublicaClient({
  canEditSettings,
  initialSettings,
  initialCatalogBadges,
  initialProductBadges,
  publicationRulesData,
  publicationRulesError,
  loadError,
}: {
  canEditSettings: boolean
  initialSettings: CatalogPublicSettings | null
  initialCatalogBadges: CatalogTrustBadge[]
  initialProductBadges: CatalogTrustBadge[]
  publicationRulesData: CatalogPublicationRulesPanelData | null
  publicationRulesError: string | null
  loadError: string | null
}) {
  const [isPending, startTransition] = useTransition()

  const [settings, setSettings] = useState<CatalogPublicSettings>(
    initialSettings || {
      heroTagline: "",
      emptyStateTitle: "",
      emptyStateDescription: "",
      noResultsTitle: "",
      noResultsDescription: "",
      gridHeading: "",
      gridSubheading: "",
    }
  )

  const [badges, setBadges] = useState<CatalogTrustBadge[]>(
    [
      ...initialCatalogBadges,
      ...initialProductBadges.filter((pb) => !initialCatalogBadges.some((cb) => cb.id === pb.id)),
    ].sort((a, b) => a.sortOrder - b.sortOrder)
  )

  const [savingSettings, setSavingSettings] = useState(false)
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false)
  const [editingBadge, setEditingBadge] = useState<Partial<CatalogTrustBadge> | null>(null)
  const [iconSearch, setIconSearch] = useState("")

  const sortedBadges = useMemo(() => [...badges].sort((a, b) => a.sortOrder - b.sortOrder), [badges])
  const catalogBadges = sortedBadges.filter((b) => b.showOnCatalog)
  const productBadges = sortedBadges.filter((b) => b.showOnProduct)

  const filteredIcons = useMemo(() => {
    const q = normalize(iconSearch)
    if (!q) return BADGE_ICON_GALLERY
    return BADGE_ICON_GALLERY.filter(
      (opt) => normalize(opt.label).includes(q) || normalize(opt.keywords).includes(q) || opt.key.includes(q)
    )
  }, [iconSearch])

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-10 text-center">
        <AlertCircle className="mb-4 h-10 w-10 text-danger-500" />
        <h2 className="text-lg font-bold text-navy-900">Erro ao carregar</h2>
        <p className="mt-2 text-sm text-gray-500">{loadError}</p>
      </div>
    )
  }

  async function handleSaveSettings() {
    if (!canEditSettings) return
    setSavingSettings(true)
    try {
      const result = await saveCatalogSettingsAction(settings)
      if (!result.ok) throw new Error(result.error.message)
      toast.success("Textos da vitrine pública salvos.")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar os textos.")
    } finally {
      setSavingSettings(false)
    }
  }

  function handleOpenBadgeModal(badge?: CatalogTrustBadge) {
    setIconSearch("")
    if (badge) {
      setEditingBadge(badge)
    } else {
      setEditingBadge({
        iconKey: DEFAULT_BADGE_ICON,
        label: "",
        description: "",
        sortOrder: badges.length + 1,
        showOnCatalog: true,
        showOnProduct: true,
      })
    }
    setIsBadgeModalOpen(true)
  }

  async function handleSaveBadge() {
    if (!editingBadge || !canEditSettings) return

    if (!editingBadge.label?.trim() || !editingBadge.iconKey) {
      toast.error("Informe o título e o ícone do selo.")
      return
    }

    startTransition(async () => {
      try {
        if (editingBadge.id) {
          const result = await updateCatalogTrustBadgeAction(editingBadge.id, {
            label: (editingBadge.label || "").trim(),
            description: editingBadge.description?.trim() || null,
            iconKey: editingBadge.iconKey,
            sortOrder: editingBadge.sortOrder,
            showOnCatalog: editingBadge.showOnCatalog,
            showOnProduct: editingBadge.showOnProduct,
            active: true,
          })
          if (!result.ok) throw new Error(result.error.message)

          setBadges((current) =>
            current.map((b) => (b.id === editingBadge.id ? ({ ...b, ...editingBadge } as CatalogTrustBadge) : b))
          )
          toast.success("Selo atualizado.")
        } else {
          const newBadge: Omit<CatalogTrustBadge, "id"> = {
            label: (editingBadge.label || "").trim(),
            description: editingBadge.description?.trim() || null,
            iconKey: editingBadge.iconKey!,
            sortOrder: editingBadge.sortOrder || 1,
            showOnCatalog: editingBadge.showOnCatalog ?? true,
            showOnProduct: editingBadge.showOnProduct ?? true,
          }
          const result = await createCatalogTrustBadgeAction(newBadge)
          if (!result.ok) throw new Error(result.error.message)

          setBadges((current) => [...current, { ...newBadge, id: result.data.id }])
          toast.success("Selo criado.")
        }
        setIsBadgeModalOpen(false)
        setEditingBadge(null)
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Erro ao salvar selo.")
      }
    })
  }

  async function handleDeactivateBadge(badgeId: string) {
    if (!canEditSettings || !confirm("Tem certeza que deseja remover este selo?")) return

    startTransition(async () => {
      try {
        const result = await deactivateCatalogTrustBadgeAction(badgeId)
        if (!result.ok) throw new Error(result.error.message)

        setBadges((current) => current.filter((b) => b.id !== badgeId))
        toast.success("Selo removido.")
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Erro ao remover selo.")
      }
    })
  }

  // Reordena trocando a prioridade (sort_order) com o vizinho e persiste ambos.
  function handleMoveBadge(badgeId: string, direction: "up" | "down") {
    if (!canEditSettings) return
    const index = sortedBadges.findIndex((b) => b.id === badgeId)
    const swapIndex = direction === "up" ? index - 1 : index + 1
    if (index < 0 || swapIndex < 0 || swapIndex >= sortedBadges.length) return

    const current = sortedBadges[index]
    const neighbor = sortedBadges[swapIndex]
    const currentOrder = current.sortOrder
    const neighborOrder = neighbor.sortOrder

    setBadges((list) =>
      list.map((b) => {
        if (b.id === current.id) return { ...b, sortOrder: neighborOrder }
        if (b.id === neighbor.id) return { ...b, sortOrder: currentOrder }
        return b
      })
    )

    startTransition(async () => {
      try {
        const [r1, r2] = await Promise.all([
          updateCatalogTrustBadgeAction(current.id, { sortOrder: neighborOrder }),
          updateCatalogTrustBadgeAction(neighbor.id, { sortOrder: currentOrder }),
        ])
        if (!r1.ok) throw new Error(r1.error.message)
        if (!r2.ok) throw new Error(r2.error.message)
      } catch (error: unknown) {
        // Reverte em caso de falha.
        setBadges((list) =>
          list.map((b) => {
            if (b.id === current.id) return { ...b, sortOrder: currentOrder }
            if (b.id === neighbor.id) return { ...b, sortOrder: neighborOrder }
            return b
          })
        )
        toast.error(error instanceof Error ? error.message : "Erro ao reordenar selos.")
      }
    })
  }

  const selectedIconKey = editingBadge?.iconKey || DEFAULT_BADGE_ICON

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-16 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link
            href="/configuracoes"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition hover:text-navy-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Configurações
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-royal-100 text-royal-600">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-navy-900">Vitrine pública</h1>
              <p className="text-sm text-gray-500">Textos e selos exibidos no catálogo público acessado pelos clientes.</p>
            </div>
          </div>
        </div>
        {!canEditSettings && <Badge variant="gray">Somente leitura</Badge>}
      </div>

      {/* Impact explanation */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
          <Info className="h-4 w-4" />
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Essas informações aparecem no catálogo público acessado pelos clientes. Elas{" "}
          <span className="font-semibold text-slate-900">não alteram estoque, preço, garantia ou regras de publicação.</span>
        </p>
      </div>

      {!canEditSettings && (
        <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Seu perfil pode visualizar esta tela, mas alterações ficam restritas ao owner.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Editing column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Textos da vitrine pública */}
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-100 text-royal-600">
                <Type className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-navy-900">Textos da vitrine pública</h2>
                <p className="text-xs text-gray-500">Mensagens exibidas nas páginas do catálogo.</p>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="space-y-1.5">
                <Input
                  label="Chamada principal (Hero)"
                  value={settings.heroTagline || ""}
                  onChange={(e) => setSettings({ ...settings, heroTagline: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Os melhores seminovos com garantia"
                />
                <p className="text-xs text-gray-500">Frase de destaque no topo da vitrine.</p>
              </div>

              <div className="space-y-1.5">
                <Input
                  label="Título acima dos produtos"
                  value={settings.gridHeading || ""}
                  onChange={(e) => setSettings({ ...settings, gridHeading: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Nosso Estoque"
                />
                <p className="text-xs text-gray-500">Esse texto aparece antes da lista de produtos disponíveis.</p>
              </div>

              <Input
                label="Descrição acima dos produtos"
                value={settings.gridSubheading || ""}
                onChange={(e) => setSettings({ ...settings, gridSubheading: e.target.value })}
                disabled={!canEditSettings || savingSettings}
                placeholder="Ex: Aparelhos revisados e prontos para entrega"
              />

              <hr className="border-gray-100" />

              <Input
                label="Título — sem resultados"
                value={settings.noResultsTitle || ""}
                onChange={(e) => setSettings({ ...settings, noResultsTitle: e.target.value })}
                disabled={!canEditSettings || savingSettings}
                placeholder="Ex: Nenhum aparelho encontrado"
              />

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-navy-900">Descrição — sem resultados</label>
                <Textarea
                  value={settings.noResultsDescription || ""}
                  onChange={(e) => setSettings({ ...settings, noResultsDescription: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Tente buscar por outro modelo..."
                  className="resize-none disabled:opacity-50"
                />
              </div>

              {canEditSettings && (
                <div className="flex justify-end pt-1">
                  <Button onClick={handleSaveSettings} disabled={savingSettings} className="shadow-lg shadow-royal-600/20">
                    <Save className="h-4 w-4" />
                    {savingSettings ? "Salvando..." : "Salvar textos"}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Selos exibidos ao cliente */}
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-navy-900">Selos exibidos ao cliente</h2>
                  <p className="text-xs text-gray-500">Mensagens de confiança mostradas no catálogo e nos produtos.</p>
                </div>
              </div>
              {canEditSettings && (
                <Button variant="outline" size="sm" onClick={() => handleOpenBadgeModal()}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              )}
            </div>

            {sortedBadges.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500">
                Nenhum selo configurado. {canEditSettings ? "Use “Adicionar” para criar o primeiro." : ""}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sortedBadges.map((badge, index) => (
                  <div key={badge.id} className="flex items-center justify-between gap-3 p-4 transition hover:bg-gray-50">
                    <div className="flex min-w-0 items-center gap-4">
                      {canEditSettings && (
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => handleMoveBadge(badge.id, "up")}
                            disabled={index === 0 || isPending}
                            aria-label="Mover para cima"
                            className="text-gray-300 transition hover:text-navy-900 disabled:opacity-30 disabled:hover:text-gray-300"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveBadge(badge.id, "down")}
                            disabled={index === sortedBadges.length - 1 || isPending}
                            aria-label="Mover para baixo"
                            className="text-gray-300 transition hover:text-navy-900 disabled:opacity-30 disabled:hover:text-gray-300"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                        <Icon icon={resolveBadgeIconKey(badge.iconKey)} className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy-900">{badge.label}</p>
                        {badge.description && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{badge.description}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {badge.showOnCatalog && (
                            <Badge variant="gray" className="px-1.5 py-0 text-[10px]">
                              Vitrine
                            </Badge>
                          )}
                          {badge.showOnProduct && (
                            <Badge variant="gray" className="px-1.5 py-0 text-[10px]">
                              Produto
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {canEditSettings && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenBadgeModal(badge)} disabled={isPending}>
                          <Pencil className="h-4 w-4 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeactivateBadge(badge.id)} disabled={isPending}>
                          <Trash2 className="h-4 w-4 text-danger-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Preview column — espelha o resultado real (vitrine é escura) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 p-4">
                <Eye className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-bold text-navy-900">Como aparece no catálogo</h3>
              </div>
              <div className="space-y-3 bg-gray-50 p-4">
                {/* Mock da vitrine (tema escuro real) */}
                <div className="rounded-2xl bg-[#0B0B0F] p-3 shadow-inner">
                  {/* Hero */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                    <p className="text-[13px] font-semibold leading-snug text-zinc-100">
                      {settings.heroTagline?.trim() || "Sua chamada principal aparece aqui"}
                    </p>
                    {catalogBadges.length > 0 && (
                      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                        {catalogBadges.slice(0, 4).map((badge) => (
                          <span
                            key={badge.id}
                            className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-200"
                          >
                            <Icon icon={resolveBadgeIconKey(badge.iconKey)} className="h-3 w-3 text-[#F2D88A]" aria-hidden />
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Grid heading + cards */}
                  <div className="mt-3">
                    <p className="text-[12px] font-semibold text-zinc-100">{settings.gridHeading?.trim() || "Título acima dos produtos"}</p>
                    <p className="text-[10px] text-zinc-400">{settings.gridSubheading?.trim() || "Descrição acima dos produtos"}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[0, 1].map((i) => (
                        <div key={i} className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                          <div className="h-10 rounded bg-white/[0.05]" />
                          <div className="h-1.5 w-3/4 rounded bg-white/[0.08]" />
                          <div className="h-1.5 w-1/2 rounded bg-white/[0.05]" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Página do produto (se houver selos de produto) */}
                {productBadges.length > 0 && (
                  <div className="rounded-2xl bg-[#0B0B0F] p-3 shadow-inner">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Página do produto</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {productBadges.slice(0, 4).map((badge) => (
                        <li
                          key={badge.id}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D6A84F]/12 text-[#F2D88A] ring-1 ring-[#D6A84F]/20">
                            <Icon icon={resolveBadgeIconKey(badge.iconKey)} className="h-3 w-3" aria-hidden />
                          </span>
                          <span className="truncate text-[10px] font-medium text-zinc-100">{badge.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="px-1 text-[11px] leading-snug text-gray-400">
                  Prévia ilustrativa. As cores e imagens reais vêm do catálogo público.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <PublicationRulesPanel data={publicationRulesData} loadError={publicationRulesError} />

      {/* Badge modal */}
      {isBadgeModalOpen && editingBadge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-navy-900">{editingBadge.id ? "Editar selo" : "Novo selo"}</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsBadgeModalOpen(false)} className="-mr-2">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 overflow-y-auto p-6">
              {/* Selected preview */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-royal-600 shadow-sm ring-1 ring-gray-100">
                  <Icon icon={resolveBadgeIconKey(selectedIconKey)} className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy-900">
                    {editingBadge.label?.trim() || "Pré-visualização do selo"}
                  </p>
                  <p className="truncate text-xs text-gray-500">{editingBadge.description?.trim() || "Como o cliente vê o selo."}</p>
                </div>
              </div>

              {/* Icon picker */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-navy-900">Ícone</label>
                <Input
                  icon={<Search className="h-4 w-4" />}
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Buscar ícone (ex: whatsapp, garantia, pix)"
                />
                <div className="grid max-h-44 grid-cols-5 gap-2 overflow-y-auto rounded-xl border border-gray-100 p-2">
                  {filteredIcons.length === 0 ? (
                    <p className="col-span-5 py-6 text-center text-xs text-gray-400">Nenhum ícone encontrado.</p>
                  ) : (
                    filteredIcons.map((opt) => {
                      const isActive = editingBadge.iconKey === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          title={opt.label}
                          onClick={() => setEditingBadge({ ...editingBadge, iconKey: opt.key })}
                          className={`flex aspect-square items-center justify-center rounded-lg border transition ${
                            isActive
                              ? "border-royal-500 bg-royal-100 text-royal-600"
                              : "border-gray-200 text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          <Icon icon={opt.key} className="h-5 w-5" aria-hidden />
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <Input
                label="Título"
                value={editingBadge.label || ""}
                onChange={(e) => setEditingBadge({ ...editingBadge, label: e.target.value })}
                placeholder="Ex: Garantia Nobretech"
              />

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-navy-900">Descrição (opcional)</label>
                <Textarea
                  value={editingBadge.description || ""}
                  onChange={(e) => setEditingBadge({ ...editingBadge, description: e.target.value })}
                  placeholder="Detalhes curtos..."
                  className="h-20 resize-none"
                />
              </div>

              {/* Onde aparece */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-navy-900">Onde este selo aparece?</label>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-royal-600 focus:ring-royal-500"
                      checked={editingBadge.showOnCatalog ?? true}
                      onChange={(e) => setEditingBadge({ ...editingBadge, showOnCatalog: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy-900">Página inicial da vitrine</span>
                      <span className="block text-xs text-gray-500">Aparece junto aos destaques principais do catálogo.</span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-royal-600 focus:ring-royal-500"
                      checked={editingBadge.showOnProduct ?? true}
                      onChange={(e) => setEditingBadge({ ...editingBadge, showOnProduct: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy-900">Página do produto</span>
                      <span className="block text-xs text-gray-500">Aparece nos detalhes de cada produto.</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Prioridade */}
              <div className="space-y-1.5">
                <Input
                  label="Prioridade na vitrine"
                  type="number"
                  value={editingBadge.sortOrder || 1}
                  onChange={(e) => setEditingBadge({ ...editingBadge, sortOrder: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-gray-500">Selos com prioridade menor aparecem primeiro.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-4">
              <Button variant="outline" onClick={() => setIsBadgeModalOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleSaveBadge} disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar selo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
