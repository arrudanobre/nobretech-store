"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Smartphone, ArrowRight } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard")
  }, [router])

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

        <Button variant="primary" fullWidth size="lg" onClick={() => router.push("/dashboard")}>
          Entrar no sistema
          <ArrowRight className="w-4 h-4" />
        </Button>

        <p className="text-center text-xs text-white/30">
          Login temporariamente desativado enquanto migramos para Railway.
        </p>
      </div>
    </div>
  )
}
