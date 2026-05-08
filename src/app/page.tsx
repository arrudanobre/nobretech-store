import type { Metadata } from "next"
import { NobretechLandingPage } from "@/components/landing/nobretech-landing-page"

export const metadata: Metadata = {
  title: "Nobretech Store",
  description: "Portal oficial de garantia e compra verificada da Nobretech Store.",
  openGraph: {
    title: "Nobretech Store",
    description: "Portal oficial de garantia e compra verificada da Nobretech Store.",
    url: "https://nobretechstore.com.br",
    siteName: "Nobretech Store",
    images: [
      {
        url: "/og-nobretech-v2.png",
        width: 1200,
        height: 630,
        alt: "Nobretech Store - Compra verificada, garantia e transparência",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nobretech Store",
    description: "Portal oficial de garantia e compra verificada da Nobretech Store.",
    images: [
      {
        url: "/og-nobretech-v2.png",
        alt: "Nobretech Store - Compra verificada, garantia e transparência",
      },
    ],
  },
}

export default function Home() {
  return <NobretechLandingPage />
}
