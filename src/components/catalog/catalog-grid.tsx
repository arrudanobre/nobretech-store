"use client"

import { useMemo, useState } from "react"
import { MagnifyingGlass, SlidersHorizontal } from "@phosphor-icons/react/dist/ssr"
import { CatalogProductCard } from "@/components/catalog/catalog-product-card"
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state"
import { getCatalogDisplayPrice } from "@/lib/catalog/pricing"
import type { PublicCatalogProduct, PublicCatalogCategorySlug } from "@/lib/catalog/types"

type Chip = {
  id: "all" | "sealed" | "seminovo" | PublicCatalogCategorySlug
  label: string
}

const CHIPS: Chip[] = [
  { id: "all", label: "Todos" },
  { id: "iphone", label: "iPhone" },
  { id: "ipad", label: "iPad" },
  { id: "macbook", label: "MacBook" },
  { id: "applewatch", label: "Watch" },
  { id: "sealed", label: "Lacrados" },
  { id: "seminovo", label: "Seminovos" },
]

type SortMode = "recent" | "price_asc" | "price_desc" | "score_desc"

const SORT_LABELS: Record<SortMode, string> = {
  recent: "Mais recentes",
  price_asc: "Menor preço",
  price_desc: "Maior preço",
  score_desc: "Melhor score",
}

type CatalogGridCopy = {
  gridHeading: string | null
  gridSubheading: string | null
  noResultsTitle: string | null
  noResultsDescription: string | null
}

type Props = {
  products: PublicCatalogProduct[]
  whatsappUrl?: string | null
  copy?: CatalogGridCopy
}

const GRID_HEADING_FALLBACK = "Produtos disponíveis"
const GRID_SUBHEADING_FALLBACK = "Disponibilidade confirmada pela loja."
const NO_RESULTS_TITLE_FALLBACK = "Nenhum produto encontrado"
const NO_RESULTS_DESCRIPTION_FALLBACK = "Ajuste a busca para ver mais opções."

export function CatalogGrid({ products, whatsappUrl = null, copy }: Props) {
  const gridHeading = copy?.gridHeading ?? GRID_HEADING_FALLBACK
  const gridSubheading = copy?.gridSubheading ?? GRID_SUBHEADING_FALLBACK
  const noResultsTitle = copy?.noResultsTitle ?? NO_RESULTS_TITLE_FALLBACK
  const noResultsDescription = copy?.noResultsDescription ?? NO_RESULTS_DESCRIPTION_FALLBACK
  const [query, setQuery] = useState("")
  const [chip, setChip] = useState<Chip["id"]>("all")
  const [sort, setSort] = useState<SortMode>("recent")
  const [sortOpen, setSortOpen] = useState(false)

  const filtered = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    let result = products.filter((product) => {
      if (chip === "all") return true
      if (chip === "sealed") return product.condition === "sealed"
      if (chip === "seminovo") return product.condition === "seminovo" || product.condition === "open_box"
      return product.category === chip
    })

    if (lowerQuery) {
      result = result.filter((product) => {
        const haystack = [product.title, product.subtitle, product.categoryLabel, product.color, product.storage]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(lowerQuery)
      })
    }

    if (sort === "price_asc") {
      result = [...result].sort((a, b) => getCatalogDisplayPrice(a) - getCatalogDisplayPrice(b))
    } else if (sort === "price_desc") {
      result = [...result].sort((a, b) => getCatalogDisplayPrice(b) - getCatalogDisplayPrice(a))
    } else if (sort === "score_desc") {
      result = [...result].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    }

    return result
  }, [products, chip, query, sort])

  return (
    <section id="selecao" className="px-4 pb-16 pt-3 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-[20px] font-semibold sm:text-[24px]">
              {gridHeading}
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-zinc-400">
              {gridSubheading}
            </p>
          </div>
          {filtered.length > 0 ? (
            <span className="shrink-0 text-[11px] font-medium text-zinc-500">
              {filtered.length} {filtered.length === 1 ? "produto" : "produtos"}
            </span>
          ) : null}
        </div>

        <div className="sticky top-[52px] z-20 -mx-4 mb-5 bg-[#050607]/85 px-4 pb-3 pt-1.5 backdrop-blur-xl sm:mx-0 sm:px-0">
          <div className="flex items-center gap-2">
            <label className="relative flex h-10 flex-1 items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3">
              <MagnifyingGlass className="h-4 w-4 text-zinc-500" />
              <input
                type="text"
                inputMode="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar produtos..."
                className="ml-2 w-full bg-transparent text-[13px] text-white placeholder:text-zinc-500 focus:outline-none"
                aria-label="Buscar produtos no catálogo"
              />
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((open) => !open)}
                className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-2.5 text-[12px] font-medium text-zinc-200 transition hover:bg-white/[0.08]"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                aria-label="Ordenar produtos"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
              </button>
              {sortOpen ? (
                <ul
                  role="listbox"
                  className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F14] p-1 text-sm shadow-[0_20px_80px_rgba(0,0,0,0.5)]"
                >
                  {(Object.entries(SORT_LABELS) as Array<[SortMode, string]>).map(([key, label]) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSort(key)
                          setSortOpen(false)
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                          sort === key ? "bg-white/[0.08] text-[#F2D88A]" : "text-zinc-300 hover:bg-white/[0.04]"
                        }`}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="relative mt-2.5">
            <div
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Filtrar por categoria"
            >
              {CHIPS.map((item) => {
                const active = chip === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    onClick={() => setChip(item.id)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium transition ${
                      active
                        ? "border-[#D6A84F]/45 bg-[#D6A84F]/18 text-[#F2D88A]"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                    aria-selected={active}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#050607] to-transparent"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <CatalogEmptyState
            title={noResultsTitle}
            description={noResultsDescription}
            whatsappUrl={whatsappUrl}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((product, index) => (
              <li key={product.id}>
                <CatalogProductCard product={product} priority={index < 2} />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-500">
          Cada produto anunciado aqui passou por conferência antes de entrar na vitrine.
        </p>
      </div>
    </section>
  )
}
