"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toaster"
import { supabase } from "@/lib/supabase"
import { Smartphone, Mail, ArrowRight, Loader2 } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes("@")) {
      toast({ title: "E-mail inválido", description: "Digite um e-mail válido para receber o link", type: "error" })
      return
    }
    setIsLoading(true)
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      })
      if (error) throw error
      setIsSubmitted(true)
      toast({ title: "Link enviado!", description: "Verifique seu e-mail para fazer login", type: "success" })
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Ocorreu um erro inesperado",
        type: "error",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Check if already logged in - redirect to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/dashboard")
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.push("/dashboard")
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-navy-900 rounded-3xl p-8 text-center space-y-6 border border-navy-800">
          <div className="w-16 h-16 rounded-2xl bg-success-500/10 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-success-500" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-white font-syne">Link Enviado</h1>
            <p className="text-sm text-white/60 mt-2">
              Abrimos o link mágico para <span className="text-white font-medium">{email}</span>
            </p>
          </div>
          <p className="text-xs text-white/40">
            Verifique sua caixa de entrada (e spam) e clique no link para entrar.
          </p>
          <Button
            variant="primary"
            fullWidth
            onClick={() => router.push("/dashboard")}
          >
            Ir para o Dashboard
          </Button>
          <button
            onClick={() => { setIsSubmitted(false); setEmail("") }}
            className="text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Usar outro e-mail
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-navy-900 rounded-3xl p-8 space-y-8 border border-navy-800">
        {/* Logo */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-royal-500 flex items-center justify-center mx-auto">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-white tracking-tight font-syne">
              NOBRETECH STORE
            </h1>
            <p className="text-white/50 text-sm mt-1">Sistema de Gestão</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            darkMode
            icon={<Mail className="w-4 h-4" />}
          />
          <Button
            type="submit"
            variant="primary"
            fullWidth
            size="lg"
            isLoading={isLoading}
          >
            Entrar sem senha
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-center text-xs text-white/30">
          Receba um link mágico no seu e-mail — sem precisar de senha.
        </p>
      </div>
    </div>
  )
}
