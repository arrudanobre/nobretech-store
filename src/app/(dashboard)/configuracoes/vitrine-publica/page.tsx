import { requirePermission, canAccess } from "@/lib/auth-context"
import { resolveCatalogPublicConfig } from "@/lib/catalog/settings"
import { loadCatalogPublicationRulesPanel } from "@/lib/catalog/publication-rules-diagnostics"
import { VitrinePublicaClient } from "./vitrine-publica-client"

export const metadata = {
  title: "Vitrine pública",
}

export default async function VitrinePublicaPage() {
  const context = await requirePermission("settings.view")
  const canEditSettings = canAccess(context.role, "settings.edit")

  let config = null
  let publicationRules = null
  let loadError = null
  let publicationRulesError = null

  try {
    config = await resolveCatalogPublicConfig(context.companyId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Erro ao carregar configurações da vitrine pública."
  }

  try {
    publicationRules = await loadCatalogPublicationRulesPanel(context.companyId)
  } catch (error) {
    publicationRulesError = error instanceof Error ? error.message : "Erro ao carregar regras de publicação."
  }

  return (
    <VitrinePublicaClient
      canEditSettings={canEditSettings}
      initialSettings={config?.settings || null}
      initialCatalogBadges={config?.catalogBadges || []}
      initialProductBadges={config?.productBadges || []}
      publicationRulesData={publicationRules}
      publicationRulesError={publicationRulesError}
      loadError={loadError}
    />
  )
}
