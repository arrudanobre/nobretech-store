import { DashboardLayout } from "@/components/layout/sidebar"
import { requireAuthContext } from "@/lib/auth-context"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const context = await requireAuthContext()

  return (
    <DashboardLayout
      title="NOBRETECH"
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
