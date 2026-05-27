import type { Metadata } from "next"

const PORTAL_DESCRIPTION =
  "Portal oficial de garantia e compra verificada."

export const metadata: Metadata = {
  title: "Compra verificada",
  description: PORTAL_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: "Portal de Transparência",
    description: PORTAL_DESCRIPTION,
    siteName: "Portal de Transparência",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portal de Transparência",
    description: PORTAL_DESCRIPTION,
  },
}

export default function CompraVerificadaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
