import { requireResellerContext } from "@/lib/reseller/access"
import { ResellerSignOut } from "./sign-out-button"

export default async function RevendedorLayout({ children }: { children: React.ReactNode }) {
  const { reseller } = await requireResellerContext()

  return (
    <div className="min-h-dvh bg-[#0B0D12] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0B0D12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-royal-400">
              Portal de Revendedores
            </p>
            <p className="text-sm font-semibold text-white">{reseller.name}</p>
          </div>
          <ResellerSignOut />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">{children}</main>
    </div>
  )
}
