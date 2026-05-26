import { requirePermission, canAccess } from "@/lib/auth-context"
import {
  getCompanyBrandProfile,
  getCompanyContactChannels,
  getCompanyDocumentProfile,
  getPrimaryCompanyContactChannel,
  resolveCompanyIdentity,
  type CompanyBrandProfile,
  type CompanyContactChannel,
  type CompanyDocumentProfile,
  type CompanyIdentity,
} from "@/lib/company-settings"
import { CompanySettingsClient } from "./settings-company-client"

export default async function CompanySettingsPage() {
  const context = await requirePermission("settings.view")
  const canEditSettings = canAccess(context.role, "settings.edit")
  let loadError: string | null = null
  let identity: CompanyIdentity | null = null
  let brandProfile: CompanyBrandProfile | null = null
  let contactChannels: CompanyContactChannel[] = []
  let documentProfile: CompanyDocumentProfile | null = null
  let primaryWhatsapp: CompanyContactChannel | null = null

  try {
    const resolved = await Promise.all([
      resolveCompanyIdentity(context.companyId),
      getCompanyBrandProfile(context.companyId),
      getCompanyContactChannels(context.companyId, { includeInactive: true }),
      getCompanyDocumentProfile(context.companyId),
      getPrimaryCompanyContactChannel(context.companyId, "whatsapp"),
    ])

    const [identityResult, resolvedBrand, resolvedContacts, resolvedDocument, resolvedWhatsapp] = resolved

    identity = identityResult.ok ? identityResult.data : null
    loadError = identityResult.ok ? null : identityResult.error.message
    brandProfile = resolvedBrand
    contactChannels = resolvedContacts
    documentProfile = resolvedDocument
    primaryWhatsapp = resolvedWhatsapp
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Nao foi possivel carregar as configuracoes da empresa."
  }

  return (
    <CompanySettingsClient
      company={{
        id: context.companyId,
        name: context.companyName,
        slug: context.companySlug,
      }}
      canEditSettings={canEditSettings}
      loadError={loadError}
      identity={identity}
      brandProfile={brandProfile}
      contactChannels={contactChannels}
      documentProfile={documentProfile}
      primaryWhatsapp={primaryWhatsapp}
    />
  )
}
