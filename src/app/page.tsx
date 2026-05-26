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
  },
  twitter: {
    card: "summary_large_image",
    title: "Nobretech Store",
    description: "Tecnologia com procedência, garantia e atendimento direto em São Luís.",
  },
}

export default function Home() {
  return <NobretechLandingPage />
}
