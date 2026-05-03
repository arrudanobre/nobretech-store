import { redirect } from "next/navigation"
import { getCurrentAuthContext } from "@/lib/auth-context"

export default async function Home() {
  const context = await getCurrentAuthContext()

  if (context.status === "unauthenticated") {
    redirect("/login")
  }

  if (context.status === "unauthorized") {
    redirect("/unauthorized")
  }

  redirect("/dashboard")
}
