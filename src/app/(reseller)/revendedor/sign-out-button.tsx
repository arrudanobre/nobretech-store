"use client"

import { useClerk } from "@clerk/nextjs"

export function ResellerSignOut() {
  const { signOut } = useClerk()
  return (
    <button
      onClick={() => signOut({ redirectUrl: "/login" })}
      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
    >
      Sair
    </button>
  )
}
