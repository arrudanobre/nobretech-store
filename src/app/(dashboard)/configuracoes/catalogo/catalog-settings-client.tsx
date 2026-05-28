"use client"

import { useState, useTransition } from "react"

import { toast } from "sonner"
import {
  Camera,
  ShieldCheck,
  CheckCircle2, // seal_check
  MessageCircle, // chat_circle
  Truck,
  Store, // storefront
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  X
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

import {
  saveCatalogSettingsAction,
  createCatalogTrustBadgeAction,
  updateCatalogTrustBadgeAction,
  deactivateCatalogTrustBadgeAction
} from "./actions"
import type { CatalogPublicSettings, CatalogTrustBadge, CatalogTrustBadgeIcon } from "@/lib/catalog/settings"

const ICONS: Record<CatalogTrustBadgeIcon, React.ElementType> = {
  camera: Camera,
  shield_check: ShieldCheck,
  seal_check: CheckCircle2,
  chat_circle: MessageCircle,
  truck: Truck,
  storefront: Store,
}

const ICON_OPTIONS: { value: CatalogTrustBadgeIcon; label: string }[] = [
  { value: "shield_check", label: "Escudo" },
  { value: "seal_check", label: "Selo de Garantia" },
  { value: "truck", label: "Caminhão de Entrega" },
  { value: "storefront", label: "Loja Física" },
  { value: "chat_circle", label: "Atendimento" },
  { value: "camera", label: "Fotos Reais" },
]

export function CatalogSettingsClient({
  canEditSettings,
  initialSettings,
  initialCatalogBadges,
  initialProductBadges,
  loadError,
}: {
  canEditSettings: boolean
  initialSettings: CatalogPublicSettings | null
  initialCatalogBadges: CatalogTrustBadge[]
  initialProductBadges: CatalogTrustBadge[]
  loadError: string | null
}) {
  const [isPending, startTransition] = useTransition()
  
  const [settings, setSettings] = useState<CatalogPublicSettings>(initialSettings || {
    heroTagline: "",
    emptyStateTitle: "",
    emptyStateDescription: "",
    noResultsTitle: "",
    noResultsDescription: "",
    gridHeading: "",
    gridSubheading: "",
  })

  // We unify badges for management
  const [badges, setBadges] = useState<CatalogTrustBadge[]>([
    ...initialCatalogBadges,
    ...initialProductBadges.filter(pb => !initialCatalogBadges.some(cb => cb.id === pb.id))
  ].sort((a, b) => a.sortOrder - b.sortOrder))

  const [savingSettings, setSavingSettings] = useState(false)
  
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false)
  const [editingBadge, setEditingBadge] = useState<Partial<CatalogTrustBadge> | null>(null)

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Erro ao carregar</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{loadError}</p>
      </div>
    )
  }

  async function handleSaveSettings() {
    if (!canEditSettings) return
    setSavingSettings(true)
    try {
      const result = await saveCatalogSettingsAction(settings)
      if (!result.ok) throw new Error(result.error.message)
      toast.success("Textos do catálogo salvos com sucesso.")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar os textos.")
    } finally {
      setSavingSettings(false)
    }
  }

  function handleOpenBadgeModal(badge?: CatalogTrustBadge) {
    if (badge) {
      setEditingBadge(badge)
    } else {
      setEditingBadge({
        iconKey: "shield_check",
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
      toast.error("Preencha os campos obrigatórios.")
      return
    }

    startTransition(async () => {
      try {
        if (editingBadge.id) {
          // Update
          const result = await updateCatalogTrustBadgeAction(editingBadge.id, {
            label: (editingBadge.label || "").trim(),
            description: editingBadge.description?.trim() || null,
            iconKey: editingBadge.iconKey,
            sortOrder: editingBadge.sortOrder,
            showOnCatalog: editingBadge.showOnCatalog,
            showOnProduct: editingBadge.showOnProduct,
            active: true
          })
          if (!result.ok) throw new Error(result.error.message)
          
          setBadges(current => current.map(b => b.id === editingBadge.id ? { ...b, ...editingBadge } as CatalogTrustBadge : b))
          toast.success("Selo atualizado.")
        } else {
          // Create
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
          
          setBadges(current => [...current, { ...newBadge, id: result.data.id }])
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
        
        setBadges(current => current.filter(b => b.id !== badgeId))
        toast.success("Selo removido.")
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Erro ao remover selo.")
      }
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16 pt-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Catálogo Público</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Gerencie os textos exibidos no catálogo público e os selos de confiança para os clientes.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Settings Form */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-6 dark:border-slate-800">
              <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Textos do Catálogo</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Mensagens exibidas nas páginas públicas.</p>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Chamada Principal (Hero)</label>
                <Input 
                  value={settings.heroTagline || ""} 
                  onChange={e => setSettings({ ...settings, heroTagline: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Os melhores seminovos com garantia"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título do Grid</label>
                <Input 
                  value={settings.gridHeading || ""} 
                  onChange={e => setSettings({ ...settings, gridHeading: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Nosso Estoque"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subtítulo do Grid</label>
                <Input 
                  value={settings.gridSubheading || ""} 
                  onChange={e => setSettings({ ...settings, gridSubheading: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Aparelhos revisados e prontos para entrega"
                />
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título (Sem resultados)</label>
                <Input 
                  value={settings.noResultsTitle || ""} 
                  onChange={e => setSettings({ ...settings, noResultsTitle: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Nenhum aparelho encontrado"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descrição (Sem resultados)</label>
                <Textarea 
                  value={settings.noResultsDescription || ""} 
                  onChange={e => setSettings({ ...settings, noResultsDescription: e.target.value })}
                  disabled={!canEditSettings || savingSettings}
                  placeholder="Ex: Tente buscar por outro modelo..."
                  className="resize-none"
                />
              </div>
              
              {canEditSettings && (
                <div className="pt-2">
                  <Button 
                    onClick={handleSaveSettings} 
                    disabled={savingSettings}
                    className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {savingSettings ? "Salvando..." : "Salvar Textos"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Badges List */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Selos de Confiança</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Badges exibidos nos produtos.</p>
              </div>
              {canEditSettings && (
                <Button onClick={() => handleOpenBadgeModal()} variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              )}
            </div>
            
            <div className="p-0">
              {badges.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  Nenhum selo de confiança configurado.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {badges.map(badge => {
                    const Icon = ICONS[badge.iconKey] || ShieldCheck
                    return (
                      <div key={badge.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{badge.label}</p>
                            {badge.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{badge.description}</p>
                            )}
                            <div className="flex gap-2 mt-1.5">
                              {badge.showOnCatalog && <Badge variant="gray" className="text-[10px] px-1.5 py-0">Catálogo</Badge>}
                              {badge.showOnProduct && <Badge variant="gray" className="text-[10px] px-1.5 py-0">Produto</Badge>}
                            </div>
                          </div>
                        </div>
                        {canEditSettings && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenBadgeModal(badge)} disabled={isPending}>
                              <Pencil className="h-4 w-4 text-slate-400" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeactivateBadge(badge.id)} disabled={isPending}>
                              <Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Badge Modal */}
      {isBadgeModalOpen && editingBadge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                {editingBadge.id ? "Editar Selo" : "Novo Selo"}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setIsBadgeModalOpen(false)} className="-mr-2">
                <Trash2 className="h-4 w-4 text-transparent" /> {/* Spacer */}
                <X className="h-4 w-4 absolute" />
              </Button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ícone</label>
                <div className="grid grid-cols-3 gap-2">
                  {ICON_OPTIONS.map(opt => {
                    const Icon = ICONS[opt.value] || ShieldCheck
                    const isActive = editingBadge.iconKey === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingBadge({ ...editingBadge, iconKey: opt.value })}
                        className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 text-xs transition ${
                          isActive 
                            ? "border-slate-900 bg-slate-50 text-slate-900 dark:border-slate-100 dark:bg-slate-800 dark:text-slate-100" 
                            : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-center leading-tight">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título</label>
                <Input 
                  value={editingBadge.label || ""} 
                  onChange={e => setEditingBadge({ ...editingBadge, label: e.target.value })}
                  placeholder="Ex: Garantia Nobretech"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descrição (opcional)</label>
                <Textarea 
                  value={editingBadge.description || ""} 
                  onChange={e => setEditingBadge({ ...editingBadge, description: e.target.value })}
                  placeholder="Detalhes curtos..."
                  className="resize-none h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ordem de exibição</label>
                  <Input 
                    type="number" 
                    value={editingBadge.sortOrder || 1} 
                    onChange={e => setEditingBadge({ ...editingBadge, sortOrder: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-800"
                    checked={editingBadge.showOnCatalog ?? true}
                    onChange={e => setEditingBadge({ ...editingBadge, showOnCatalog: e.target.checked })}
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Aparece na página inicial do catálogo</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-800"
                    checked={editingBadge.showOnProduct ?? true}
                    onChange={e => setEditingBadge({ ...editingBadge, showOnProduct: e.target.checked })}
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Aparece na página do produto</span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 p-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsBadgeModalOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveBadge} 
                disabled={isPending}
                className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {isPending ? "Salvando..." : "Salvar Selo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
