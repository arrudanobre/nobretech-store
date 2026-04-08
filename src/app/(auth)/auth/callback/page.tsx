"use client"

import { useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true

    async function handleCallback() {
      const code = searchParams.get("code")

      if (code) {
        await supabase.auth.exchangeCodeForSession(code)
      }

      router.push("/dashboard")
    }

    handleCallback()
  }, [searchParams, router])

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <div className="text-center text-white">
        <p className="text-lg font-medium">Verificando login...</p>
        <p className="text-sm text-white/50 mt-2">Aguarde um momento</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-lg font-medium">Carregando...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
