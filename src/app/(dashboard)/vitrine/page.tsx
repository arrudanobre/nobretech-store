import type { Metadata } from "next"
import { requireAuthContext } from "@/lib/auth-context"
import { loadAdminCatalog } from "@/lib/catalog/admin-queries"
import { loadCatalogPaymentSettings } from "@/lib/catalog/payment-settings"
import { CatalogAdminView } from "@/components/catalog-admin/catalog-admin-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Vitrine pública",
}

export default async function CatalogAdminPage() {
  const auth = await requireAuthContext()
  const [data, paymentSettings] = await Promise.all([
    loadAdminCatalog(auth.companyId),
    loadCatalogPaymentSettings(auth.companyId),
  ])

  return <CatalogAdminView initialItems={data.items} initialSummary={data.summary} paymentSettings={paymentSettings} />
}
