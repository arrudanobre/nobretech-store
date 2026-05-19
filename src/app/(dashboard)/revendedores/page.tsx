"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Loader2, PackagePlus, Plus, Store, X } from "lucide-react"
import { toast } from "sonner"

type Reseller = {
  id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  email: string
  status: string
  created_at: string | null
  active_offers: string | number
  pending_requests: string | number
}

export default function RevendedoresPage() {
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", city: "", state: "", phone: "" })

  const load = useCallback(async () => {
    const res = await fetch("/api/resellers")
    const json = await res.json()
    if (json.error) toast.error(json.error.message)
    else setResellers(json.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    fetch("/api/resellers")
      .then((r) => r.json())
      .then((json) => {
        if (!mounted) return
        if (json.error) toast.error(json.error.message)
        else setResellers(json.data || [])
        setLoading(false)
      })
      .catch(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  async function createReseller(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch("/api/resellers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) {
      toast.error(json.error.message)
      return
    }
    toast.success("Revendedor criado")
    setForm({ name: "", email: "", city: "", state: "", phone: "" })
    setShowForm(false)
    load()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Store className="h-6 w-6 text-royal-500" />
            Revendedores
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Administre parceiros externos, libere produtos do estoque e defina preço de repasse.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancelar" : "Novo revendedor"}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={createReseller}
          className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nome *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do parceiro / loja"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email *</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@parceiro.com"
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              É com este email que o revendedor entra no portal.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Telefone</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(98) 90000-0000"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Cidade</label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Arari"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="MA"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={saving} fullWidth>
              Criar revendedor
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : resellers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
          Nenhum revendedor cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Revendedor</th>
                <th className="px-4 py-3">Local</th>
                <th className="px-4 py-3">Ofertas ativas</th>
                <th className="px-4 py-3">Solicitações pendentes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resellers.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[r.city, r.state].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{Number(r.active_offers)}</td>
                  <td className="px-4 py-3">
                    {Number(r.pending_requests) > 0 ? (
                      <Badge variant="yellow">{Number(r.pending_requests)} pendente(s)</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.status === "active" ? "green" : "gray"}>
                      {r.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/revendedores/${r.id}#liberar-produto`}
                        className="inline-flex items-center gap-1 rounded-lg border border-royal-200 bg-royal-50 px-3 py-2 text-xs font-semibold text-royal-700 hover:border-royal-300 hover:bg-royal-100"
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        Liberar produto
                      </Link>
                      <Link
                        href={`/revendedores/${r.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      >
                        Gerenciar ofertas <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
