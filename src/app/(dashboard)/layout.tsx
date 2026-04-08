import { DashboardLayout } from "@/components/layout/sidebar"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="NOBRETECH">{children}</DashboardLayout>
}
