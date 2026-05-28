import { requirePermission, canAccess } from "@/lib/auth-context"
import { resolveCatalogPublicConfig } from "@/lib/catalog/settings"
import { CatalogSettingsClient } from "./catalog-settings-client"

export const metadata = {
  title: "Configurações do Catálogo Público",
}

export default async function CatalogSettingsPage() {
  const context = await requirePermission("settings.view")
  const canEditSettings = canAccess(context.role, "settings.edit")

  let config = null
  let loadError = null

  try {
    config = await resolveCatalogPublicConfig(context.companyId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Erro ao carregar configurações do catálogo público."
  }

  return (
    <CatalogSettingsClient
      canEditSettings={canEditSettings}
      initialSettings={config?.settings || null}
      initialCatalogBadges={config?.catalogBadges || []}
      initialProductBadges={config?.productBadges || []}
      loadError={loadError}
    />
  )
}
