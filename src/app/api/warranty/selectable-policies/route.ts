import { NextResponse } from "next/server"

import { requireApiAuthContext } from "@/lib/auth-context"
import { getSelectableWarrantyPolicies } from "@/lib/warranty"

export async function GET() {
  const auth = await requireApiAuthContext()
  if (!auth.ok) return auth.response

  const policies = await getSelectableWarrantyPolicies(auth.context.companyId)

  return NextResponse.json({
    data: policies.map((p) => ({
      id: p.id,
      name: p.name,
      warrantyNature: p.warrantyNature,
      calculationMode: p.calculationMode,
      defaultMonths: p.defaultMonths,
      defaultDays: p.defaultDays,
      selectionLabel: p.selectionLabel,
      selectionDescription: p.selectionDescription,
      isDefault: p.isDefault,
      productType: p.productType,
      productCondition: p.productCondition,
      productOrigin: p.productOrigin,
    })),
    error: null,
  })
}
