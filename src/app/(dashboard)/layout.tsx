import { DashboardLayout } from "@/components/layout/sidebar"
import { requireAuthContext } from "@/lib/auth-context"

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAuthContext()

  return <DashboardLayout title="NOBRETECH">{children}</DashboardLayout>
}
