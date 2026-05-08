import { requirePermission } from "@/lib/auth-context"
import { OrionClient } from "./orion-client"

export default async function OrionPage() {
  await requirePermission("finance.view")

  return <OrionClient />
}
