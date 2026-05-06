import { requirePermission } from "@/lib/auth-context"

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("finance.view")

  return children
}
