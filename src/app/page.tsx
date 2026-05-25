import type { Metadata } from "next"
import { NobretechLandingPage } from "@/components/landing/nobretech-landing-page"

export const metadata: Metadata = {
  title: "Nobretech Store",
  description: "Tecnologia com procedência, garantia e atendimento direto em São Luís.",
  openGraph: {
    title: "Nobretech Store",
    description: "Tecnologia com procedência, garantia e atendimento direto em São Luís.",
    url: "https://www.nobretechstore.com.br",
    siteName: "Nobretech Store",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-nobretech-v2.png",
        width: 1200,
        height: 630,
        alt: "Nobretech Store - Tecnologia com procedência",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nobretech Store",
    description: "Tecnologia com procedência, garantia e atendimento direto em São Luís.",
    images: [
      {
        url: "/og-nobretech-v2.png",
        alt: "Nobretech Store - Tecnologia com procedência",
      },
    ],
  },
}

export default function Home() {
  return <NobretechLandingPage />
}
