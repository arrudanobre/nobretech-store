import type { Metadata } from "next"

const PORTAL_DESCRIPTION =
  "Portal oficial de garantia e compra verificada da Nobretech Store."

export const metadata: Metadata = {
  title: "Compra verificada Nobretech Store",
  description: PORTAL_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: "Compra verificada Nobretech Store",
    description: PORTAL_DESCRIPTION,
    siteName: "Nobretech Store",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-nobretech-v2.png",
        width: 1200,
        height: 630,
        alt: "Nobretech Store - Compra verificada e garantia",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compra verificada Nobretech Store",
    description: PORTAL_DESCRIPTION,
    images: [
      {
        url: "/og-nobretech-v2.png",
        alt: "Nobretech Store - Compra verificada e garantia",
      },
    ],
  },
}

export default function CompraVerificadaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
