"use client"

import { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"

type SupplierOption = {
  id: string
  name: string
  city: string | null
}

type Props = {
  supplierId: string | null
  supplierName: string
  onChange: (supplierId: string | null, supplierName: string) => void
  disabled?: boolean
  label?: string
}

function normalize(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

export function SupplierCombobox({ supplierId, supplierName, onChange, disabled, label = "Fornecedor da compra" }: Props) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [query, setQuery] = useState(supplierName)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch("/api/suppliers/traceability")
      .then((r) => r.json())
      .catch(() => null)
      .then((payload) => {
        const list: SupplierOption[] = (payload?.data?.suppliers || [])
          .map((item: any) => item.supplier)
          .filter(Boolean)
          .map((s: any) => ({ id: s.id, name: s.name, city: s.city || null }))
        setSuppliers(list)
      })
  }, [])

  useEffect(() => {
    setQuery(supplierName)
  }, [supplierName])

  const selected = useMemo(
    () => (supplierId ? suppliers.find((s) => s.id === supplierId) || null : null),
    [supplierId, suppliers]
  )

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return suppliers.slice(0, 6)
    return suppliers.filter((s) => normalize(`${s.name} ${s.city || ""}`).includes(q)).slice(0, 6)
  }, [query, suppliers])

  const exactMatch = useMemo(() => {
    const q = normalize(query)
    return q ? suppliers.find((s) => normalize(s.name) === q) || null : null
  }, [query, suppliers])

  const handleSelect = (supplier: SupplierOption) => {
    setQuery(supplier.name)
    setOpen(false)
    onChange(supplier.id, supplier.name)
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setOpen(true)
    if (!value.trim()) {
      onChange(null, "")
      return
    }
    if (supplierId) {
      onChange(null, value)
    } else {
      onChange(null, value)
    }
  }

  const handleCreateNew = () => {
    const name = query.trim()
    if (!name) return
    setOpen(false)
    onChange(null, name)
  }

  if (disabled) {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium mb-1.5 text-navy-900">{label}</label>
        <div className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 flex items-center text-sm text-gray-500">
          {supplierName || "—"}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full relative">
      <Input
        label={label}
        placeholder="Digite para buscar ou criar fornecedor"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-100 bg-white p-2 shadow-md">
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span className="font-semibold">Selecionado: {selected.name}</span>
              <button
                type="button"
                className="text-xs font-bold text-emerald-700 hover:underline"
                onMouseDown={(e) => { e.preventDefault(); setQuery(""); onChange(null, ""); setOpen(true) }}
              >
                Trocar
              </button>
            </div>
          ) : null}
          {!selected && filtered.length > 0 ? (
            <div className="grid gap-1">
              {filtered.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(supplier) }}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-navy-900 hover:bg-gray-50"
                >
                  <span className="font-semibold">{supplier.name}</span>
                  <span className="text-xs text-gray-500">{supplier.city || "Fornecedor cadastrado"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {!selected && query.trim() && !exactMatch ? (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleCreateNew() }}
              className="mt-1 w-full rounded-lg border border-dashed border-royal-200 px-3 py-2 text-left text-sm font-bold text-royal-700 hover:bg-royal-50"
            >
              Criar fornecedor &quot;{query.trim()}&quot;
            </button>
          ) : null}
          {!selected && !query.trim() ? (
            <p className="px-3 py-2 text-xs font-medium text-gray-500">Digite o nome do fornecedor para buscar ou criar.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
