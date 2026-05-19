import { requirePermission } from "@/lib/auth-context"

export default async function RevendedoresLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("resellers.manage")
  return <>{children}</>
}
