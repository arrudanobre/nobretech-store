import { requirePermission } from "@/lib/auth-context"

export default async function TaxasLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("finance.tax_settings")

  return children
}
