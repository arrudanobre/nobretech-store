import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/sidebar"
import { requireAuthContext } from "@/lib/auth-context"
import { isResellerRole } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const context = await requireAuthContext()

  // Resellers have no access to the internal ERP. Send them to their portal.
  if (isResellerRole(context.role)) {
    redirect("/revendedor")
  }

  return (
    <DashboardLayout
      title={context.companyName}
      currentUser={{
        name: context.fullName || context.email,
        email: context.email,
        role: context.role,
        avatarUrl: context.avatarUrl,
        companyName: context.companyName,
      }}
    >
      {children}
    </DashboardLayout>
  )
}
