import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/sidebar"
import { requireAuthContext } from "@/lib/auth-context"
import { resolveCompanyIdentity } from "@/lib/company-settings"
import { isResellerRole } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const context = await requireAuthContext()

  // Resellers have no access to the internal ERP. Send them to their portal.
  if (isResellerRole(context.role)) {
    redirect("/revendedor")
  }

  let companyDisplayName = context.companyName
  let companyShortName: string | null = null
  let companyLogoUrl: string | null = null
  let companyInstagram: string | null = null

  try {
    const companyIdentity = await resolveCompanyIdentity(context.companyId)
    if (companyIdentity.ok) {
      companyDisplayName = companyIdentity.data.displayName ?? context.companyName
      companyShortName = companyIdentity.data.shortName ?? null
      companyLogoUrl = companyIdentity.data.logoUrl ?? null
      companyInstagram = companyIdentity.data.contactChannels.find((channel) => (
        channel.active && channel.isPublic && channel.channelType === "instagram"
      ))?.value ?? null
    }
  } catch (error) {
    console.error("[company-settings] Falha ao resolver identidade no layout interno", error)
  }

  return (
    <DashboardLayout
      title={companyDisplayName}
      currentUser={{
        name: context.fullName || context.email,
        email: context.email,
        role: context.role,
        avatarUrl: context.avatarUrl,
        companyName: context.companyName,
        companyDisplayName,
        companyShortName,
        companyLogoUrl,
        companyInstagram,
      }}
    >
      {children}
    </DashboardLayout>
  )
}
