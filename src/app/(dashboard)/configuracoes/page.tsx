import { requirePermission } from "@/lib/auth-context"
import { ConfiguracoesClient } from "./settings-client"

export default async function SettingsPage() {
  const context = await requirePermission("settings.view")

  return (
    <ConfiguracoesClient
      currentUser={{
        id: context.appUserId,
        name: context.fullName || context.email,
        email: context.email,
        role: context.role,
        avatarUrl: context.avatarUrl,
        companyId: context.companyId,
      }}
    />
  )
}
