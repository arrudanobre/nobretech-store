import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Inter, Syne, DM_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
})

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})

const clerkLocalization = {
  locale: "pt-BR",
  socialButtonsBlockButton: "Entrar com {{provider|titleize}}",
  dividerText: "ou",
  formFieldLabel__emailAddress: "Endereço de e-mail",
  formFieldInputPlaceholder__emailAddress: "Digite seu e-mail",
  formButtonPrimary: "Continuar",
  backButton: "Voltar",
  signIn: {
    start: {
      title: "Entrar na Nobretech Store",
      titleCombined: "Entrar na Nobretech Store",
      subtitle: "Bem-vindo de volta. Entre para continuar.",
      subtitleCombined: "Bem-vindo de volta. Entre para continuar.",
      actionText: "Não tem uma conta?",
      actionLink: "Criar conta",
    },
  },
  signUp: {
    start: {
      title: "Criar acesso",
      titleCombined: "Criar acesso",
      subtitle: "Use uma conta previamente liberada pela Nobretech.",
      subtitleCombined: "Use uma conta previamente liberada pela Nobretech.",
      actionText: "Já tem uma conta?",
      actionLink: "Entrar",
    },
  },
}

export const metadata: Metadata = {
  title: "NOBRETECH STORE — Sistema de Gestão",
  description: "Gestão completa de dispositivos Apple e Garmin seminovos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NOBRETECH",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider localization={clerkLocalization}>
      <html
        lang="pt-BR"
        className={`${inter.variable} ${syne.variable} ${dmMono.variable} antialiased`}
      >
        <body className="min-h-screen bg-surface">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
