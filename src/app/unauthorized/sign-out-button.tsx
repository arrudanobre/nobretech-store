"use client"

import { useClerk } from "@clerk/nextjs"
import { LogOut } from "lucide-react"

export function UnauthorizedSignOutButton() {
  const { signOut } = useClerk()

  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/login" })}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-royal-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-royal-600"
    >
      <LogOut className="h-4 w-4" />
      Sair da conta
    </button>
  )
}
