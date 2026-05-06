import { requirePermission } from "@/lib/auth-context"

export default async function PlanoDreLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("finance.dre")

  return children
}
