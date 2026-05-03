import { SignOutButton } from "@clerk/nextjs"
import { ShieldAlert, LogOut } from "lucide-react"

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-navy-900/90 p-7 text-center shadow-2xl sm:p-9">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-500/15 text-danger-100 ring-1 ring-danger-500/25">
          <ShieldAlert className="h-7 w-7" />
        </div>

        <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.22em] text-royal-400">
          NOBRETECH STORE
        </p>
        <h1 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">
          Seu e-mail não está autorizado a acessar o sistema Nobretech.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
          Entre com uma conta previamente liberada ou solicite acesso ao administrador.
        </p>

        <div className="mt-8">
          <SignOutButton redirectUrl="/login">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-royal-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-royal-600">
              <LogOut className="h-4 w-4" />
              Sair da conta
            </button>
          </SignOutButton>
        </div>
      </section>
    </main>
  )
}
