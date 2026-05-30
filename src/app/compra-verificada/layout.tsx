import type { Metadata } from "next"
import { getCatalogCompanyIdentity } from "@/lib/catalog/company-identity"

const PORTAL_DESCRIPTION =
  "Portal oficial de garantia e compra verificada."

export async function generateMetadata(): Promise<Metadata> {
  // Override só se houver imagem específica do portal. Sem override, Next cai
  // automaticamente na /compra-verificada/opengraph-image.tsx (auto-rendered).
  const identity = await getCatalogCompanyIdentity()

  const openGraph: Metadata["openGraph"] = {
    title: "Portal de Transparência",
    description: PORTAL_DESCRIPTION,
    siteName: "Portal de Transparência",
    locale: "pt_BR",
    type: "website",
  }
  if (identity.portalOgImageUrl) {
    openGraph.images = [{ url: identity.portalOgImageUrl }]
  }

  return {
    title: "Compra verificada",
    description: PORTAL_DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph,
    twitter: {
      card: "summary_large_image",
      title: "Portal de Transparência",
      description: PORTAL_DESCRIPTION,
      ...(identity.portalOgImageUrl ? { images: [{ url: identity.portalOgImageUrl }] } : {}),
    },
  }
}

export default function CompraVerificadaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
