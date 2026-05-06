import type { Metadata } from "next"
import { NobretechLandingPage } from "@/components/landing/nobretech-landing-page"

export const metadata: Metadata = {
  title: "Nobretech Store | Apple Premium em São Luís",
  description:
    "Tecnologia Apple com experiência premium, curadoria, garantia e atendimento humano.",
}

export default function Home() {
  return <NobretechLandingPage />
}
