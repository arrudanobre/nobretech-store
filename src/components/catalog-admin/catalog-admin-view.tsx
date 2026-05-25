"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowUpRight,
  ArrowSquareOut,
  CameraSlash,
  ClipboardText,
  EyeSlash,
  ImageBroken,
  Images,
  ListChecks,
  MagnifyingGlass,
  Package,
  PaperPlaneTilt,
  PencilSimple,
  SealCheck,
  Storefront,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr"
import type { CatalogAdminItem, CatalogAdminSummary } from "@/lib/catalog/admin-types"
import type { CatalogPaymentSettings } from "@/lib/catalog/pricing"
import { formatBRL } from "@/lib/helpers"
import { formatScore10 } from "@/lib/catalog/score"
import { CatalogEditModal } from "@/components/catalog-admin/catalog-edit-modal"
import { CatalogPhotosModal } from "@/components/catalog-admin/catalog-photos-modal"
import { CatalogReviewModal } from "@/components/catalog-admin/catalog-review-modal"
import { CatalogIncludedItemsModal } from "@/components/catalog-admin/catalog-included-items-modal"

type Props = {
  initialItems: CatalogAdminItem[]
  initialSummary: CatalogAdminSummary
  paymentSettings: CatalogPaymentSettings
}

type ModalState =
  | { kind: "edit"; item: CatalogAdminItem }
  | { kind: "photos"; item: CatalogAdminItem }
  | { kind: "review"; item: CatalogAdminItem }
  | { kind: "items"; item: CatalogAdminItem }
  | { kind: "blocked"; item: CatalogAdminItem }
  | null

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "published", label: "Publicados" },
  { id: "ready", label: "Prontos" },
  { id: "blocked", label: "Bloqueados" },
  { id: "draft", label: "Rascunho" },
] as const

type FilterId = (typeof FILTERS)[number]["id"]

export function CatalogAdminView({ initialItems, initialSummary, paymentSettings }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [summary, setSummary] = useState(initialSummary)
  const [filter, setFilter] = useState<FilterId>("all")
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const displaySummary = useMemo(() => {
    if (items.length === 0) return summary
    return items.reduce(
      (acc, item) => {
        acc.total += 1
        if (item.readiness.status === "published") acc.published += 1
        else if (item.readiness.canPublish) acc.ready += 1
        else acc.blocked += 1

        if (item.productKind !== "sealed" && !item.hasRealPhotos) acc.missingPhotos += 1
        if (item.productKind !== "sealed" && (!item.review || item.review.overall_score == null)) {
          acc.missingReview += 1
        }
        return acc
      },
      { total: 0, published: 0, ready: 0, blocked: 0, missingPhotos: 0, missingReview: 0 } as CatalogAdminSummary,
    )
  }, [items, summary])

  const refresh = useCallback(async () => {
    const response = await fetch("/api/catalog/publications", { cache: "no-store" })
    const result = (await response.json()) as {
      data?: { items: CatalogAdminItem[]; summary: CatalogAdminSummary }
      error?: { message: string } | null
    }
    if (response.ok && result.data) {
      setItems(result.data.items)
      setSummary(result.data.summary)
    }
    router.refresh()
  }, [router])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filter === "published" && item.readiness.status !== "published") return false
      if (filter === "ready" && item.readiness.status !== "ready") return false
      if (filter === "blocked" && item.readiness.canPublish) return false
      if (filter === "draft" && item.readiness.status !== "draft") return false
      if (!query) return true
      const haystack = [item.title, item.subtitle, item.categoryLabel, item.grade]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [items, filter, search])

  const togglePublish = useCallback(
    async (item: CatalogAdminItem, action: "publish" | "unpublish") => {
      if (action === "publish" && !item.readiness.canPublish) {
        setModal({ kind: "blocked", item })
        return
      }
      setBusyId(item.inventoryId)
      setErrorMessage(null)
      try {
        const response = await fetch("/api/catalog/publications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inventoryItemId: item.inventoryId, action }),
        })
        const result = (await response.json()) as { error?: { message: string } | null }
        if (!response.ok) {
          throw new Error(result.error?.message || "Erro ao atualizar publicação")
        }
        await refresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erro ao atualizar publicação")
      } finally {
        setBusyId(null)
      }
    },
    [refresh],
  )

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-[#07111F] p-4 text-slate-100 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <HeroHeader publishedCount={displaySummary.published} />

        {errorMessage ? (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <Warning className="h-4 w-4" weight="bold" />
            {errorMessage}
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard
            icon={<SealCheck className="h-4 w-4" weight="duotone" />}
            label="Publicados"
            value={displaySummary.published}
            hint="Visíveis na vitrine"
            tone="emerald"
          />
          <SummaryCard
            icon={<ClipboardText className="h-4 w-4" weight="duotone" />}
            label="Prontos"
            value={displaySummary.ready}
            hint="Aguardam publicação"
            tone="blue"
          />
          <SummaryCard
            icon={<WarningOctagon className="h-4 w-4" weight="duotone" />}
            label="Bloqueados"
            value={displaySummary.blocked}
            hint="Pendências em aberto"
            tone="rose"
          />
          <SummaryCard
            icon={<CameraSlash className="h-4 w-4" weight="duotone" />}
            label="Sem foto real"
            value={displaySummary.missingPhotos}
            hint="Seminovos pendentes"
            tone="sky"
          />
          <SummaryCard
            icon={<ListChecks className="h-4 w-4" weight="duotone" />}
            label="Sem avaliação"
            value={displaySummary.missingReview}
            hint="Aguardando laudo"
            tone="violet"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Filtrar por status"
          >
            {FILTERS.map((entry) => {
              const active = filter === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(entry.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-[#D6A84F]/45 bg-[#D6A84F]/15 text-[#F2D88A] shadow-[0_8px_24px_rgba(214,168,79,0.18)]"
                      : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>
          <label className="relative flex h-10 w-full items-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 sm:w-72">
            <MagnifyingGlass className="h-4 w-4 text-slate-500" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto..."
              className="ml-2 w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </label>
        </section>

        <section className="space-y-2.5">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-10 text-center text-sm text-slate-400">
              Nenhum produto encontrado para este filtro.
            </div>
          ) : (
            filtered.map((item) => (
              <CatalogAdminRow
                key={item.inventoryId}
                item={item}
                busy={busyId === item.inventoryId}
                onTogglePublish={togglePublish}
                onOpenEdit={() => setModal({ kind: "edit", item })}
                onOpenPhotos={() => setModal({ kind: "photos", item })}
                onOpenReview={() => setModal({ kind: "review", item })}
                onOpenItems={() => setModal({ kind: "items", item })}
                onOpenBlocked={() => setModal({ kind: "blocked", item })}
              />
            ))
          )}
        </section>
      </div>

      {modal?.kind === "edit" ? (
        <CatalogEditModal
          item={modal.item}
          paymentSettings={paymentSettings}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refresh()
          }}
        />
      ) : null}
      {modal?.kind === "photos" ? (
        <CatalogPhotosModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh()
          }}
        />
      ) : null}
      {modal?.kind === "review" ? (
        <CatalogReviewModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refresh()
          }}
        />
      ) : null}
      {modal?.kind === "items" ? (
        <CatalogIncludedItemsModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refresh()
          }}
        />
      ) : null}
      {modal?.kind === "blocked" ? (
        <BlockedModal
          item={modal.item}
          onClose={() => setModal(null)}
          onJump={(target) => {
            const next = modal.item
            if (target === "edit") setModal({ kind: "edit", item: next })
            else if (target === "photos") setModal({ kind: "photos", item: next })
            else if (target === "review") setModal({ kind: "review", item: next })
            else if (target === "items") setModal({ kind: "items", item: next })
          }}
        />
      ) : null}
    </div>
  )
}

function HeroHeader({ publishedCount }: { publishedCount: number }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0B1220] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.03] sm:p-7">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D6A84F]/55 to-transparent" />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,rgba(214,168,79,0.08),transparent_34%,rgba(14,165,233,0.06))]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D6A84F]/30 bg-[#D6A84F]/12 text-[#F2D88A] shadow-[0_8px_24px_rgba(214,168,79,0.18)]"
          >
            <Storefront className="h-5 w-5" weight="duotone" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#F2D88A]/80">
              Painel administrativo
            </p>
            <h1 className="mt-1.5 font-[family-name:var(--font-syne)] text-[26px] font-semibold leading-tight text-white sm:text-[30px]">
              Vitrine pública
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">
              Controle os produtos que aparecem no catálogo da Nobretech. Publique apenas o que está revisado, com fotos reais e preço definido.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            <SealCheck className="h-3 w-3" weight="bold" />
            Catálogo ativo · {publishedCount} no ar
          </span>
          <Link
            href="/catalogo"
            target="_blank"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-slate-100 transition hover:bg-white/[0.1]"
          >
            Ver catálogo público
            <ArrowSquareOut className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint: string
  tone: "emerald" | "blue" | "amber" | "rose" | "sky" | "violet"
}) {
  const palette = {
    emerald: {
      border: "border-emerald-400/25",
      iconBg: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
      accent: "text-emerald-200",
    },
    amber: {
      border: "border-amber-400/25",
      iconBg: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
      accent: "text-amber-200",
    },
    blue: {
      border: "border-blue-400/25",
      iconBg: "bg-blue-500/15 text-blue-200 ring-blue-400/30",
      accent: "text-blue-200",
    },
    rose: {
      border: "border-rose-400/25",
      iconBg: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
      accent: "text-rose-200",
    },
    sky: {
      border: "border-sky-400/25",
      iconBg: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
      accent: "text-sky-200",
    },
    violet: {
      border: "border-violet-400/25",
      iconBg: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
      accent: "text-violet-200",
    },
  }[tone]
  return (
    <div className={`rounded-2xl border ${palette.border} bg-white/[0.04] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ring-1 ${palette.iconBg}`}>
          {icon}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</span>
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none text-white">{value}</p>
      <p className={`mt-1.5 text-[11px] ${palette.accent}`}>{hint}</p>
    </div>
  )
}

function CatalogAdminRow({
  item,
  busy,
  onTogglePublish,
  onOpenEdit,
  onOpenPhotos,
  onOpenReview,
  onOpenItems,
  onOpenBlocked,
}: {
  item: CatalogAdminItem
  busy: boolean
  onTogglePublish: (item: CatalogAdminItem, action: "publish" | "unpublish") => void
  onOpenEdit: () => void
  onOpenPhotos: () => void
  onOpenReview: () => void
  onOpenItems: () => void
  onOpenBlocked: () => void
}) {
  const cover = item.images.find((image) => image.is_primary) || item.images[0] || null
  const isSealed = item.productKind === "sealed"
  const statusBadge = statusBadgeFor(item)
  const inventoryBadge = inventoryBadgeFor(item.inventoryStatus)
  const publicPrice = item.publication?.public_price ?? item.suggestedPrice
  const overall = item.review?.overall_score ?? null
  return (
    <article className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur transition hover:border-white/20 hover:bg-white/[0.06] sm:p-5 lg:grid-cols-[96px_minmax(0,1fr)_minmax(210px,auto)]">
      <div className="relative h-[96px] w-[96px] overflow-hidden rounded-2xl border border-white/10 bg-[#0F172A] shadow-inner">
        {cover ? (
          <Image
            src={cover.thumbnail_url || cover.image_url}
            alt={cover.alt || item.title}
            fill
            sizes="96px"
            unoptimized={cover.source === "uploaded"}
            className="object-contain p-1.5"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-500">
            <ImageBroken className="h-5 w-5" weight="duotone" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{item.categoryLabel}</span>
          <span className={statusBadge.className}>
            {statusBadge.icon}
            {statusBadge.label}
          </span>
          <span className={inventoryBadge.className}>{inventoryBadge.label}</span>
          {item.grade ? (
            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-300 ring-1 ring-white/10">
              Grade {item.grade}
            </span>
          ) : null}
        </div>
        <div>
          <h3 className="text-base font-semibold text-white sm:text-[17px]">{item.title}</h3>
          {item.subtitle ? <p className="text-[12.5px] text-slate-300">{item.subtitle}</p> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
          <Stat label="Preço" value={publicPrice != null ? formatBRL(publicPrice) : "—"} />
          <Stat
            label="Fotos"
            value={
              <span className="flex items-center gap-1">
                <span className="font-semibold text-white">{item.images.length}</span>
                {item.hasRealPhotos ? (
                  <span className="text-emerald-300">reais</span>
                ) : (
                  <span className="text-slate-500">sem real</span>
                )}
              </span>
            }
          />
          <Stat label="Itens" value={`${item.includedItems.length} informados`} />
          <Stat
            label="Score"
            value={
              isSealed ? (
                <span className="text-[#F2D88A]">Lacrado</span>
              ) : overall != null ? (
                `${formatScore10(overall)}/10`
              ) : (
                "—"
              )
            }
          />
        </dl>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.readiness.reasons.length > 0 ? (
            <button
              type="button"
              onClick={onOpenBlocked}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/35 bg-rose-500/15 px-2.5 py-1 text-[11px] font-medium text-rose-100 transition hover:bg-rose-500/25"
            >
              <Warning className="h-3 w-3" weight="bold" />
              {humanizeReasonHeadline(item.readiness.reasons)}
              <ArrowUpRight className="h-3 w-3" />
            </button>
          ) : null}
          {item.readiness.warnings.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/12 px-2.5 py-1 text-[11px] font-medium text-amber-100">
              <Warning className="h-3 w-3" weight="bold" />
              {humanizeWarning(item.readiness.warnings[0])}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-start gap-2 lg:flex-col lg:items-end">
        {primaryActionFor(item, busy, onTogglePublish, onOpenBlocked, onOpenEdit)}
        <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap lg:justify-end">
          <SecondaryAction icon={<PencilSimple className="h-3.5 w-3.5" />} label="Editar" onClick={onOpenEdit} />
          <SecondaryAction icon={<Images className="h-3.5 w-3.5" />} label="Fotos" onClick={onOpenPhotos} />
          {!isSealed ? (
            <SecondaryAction
              icon={<ClipboardText className="h-3.5 w-3.5" />}
              label="Avaliação"
              onClick={onOpenReview}
            />
          ) : null}
          <SecondaryAction icon={<Package className="h-3.5 w-3.5" />} label="Itens" onClick={onOpenItems} />
          {item.publication?.is_published ? (
            <Link
              href={`/catalogo/${buildPublicSlug(item)}`}
              target="_blank"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:bg-white/[0.1]"
            >
              Ver vitrine
              <ArrowSquareOut className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function primaryActionFor(
  item: CatalogAdminItem,
  busy: boolean,
  onTogglePublish: (item: CatalogAdminItem, action: "publish" | "unpublish") => void,
  onOpenBlocked: () => void,
  onOpenEdit: () => void,
) {
  if (item.publication?.is_published) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onTogglePublish(item, "unpublish")}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50 sm:w-auto"
      >
        <EyeSlash className="h-3.5 w-3.5" />
        Despublicar
      </button>
    )
  }
  if (item.readiness.status === "ready") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onTogglePublish(item, "publish")}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-[#E7C16A] px-4 text-xs font-semibold text-[#06140d] shadow-[0_10px_28px_rgba(16,185,129,0.22)] transition hover:scale-[1.02] disabled:opacity-50 sm:w-auto"
      >
        <PaperPlaneTilt className="h-3.5 w-3.5" weight="bold" />
        Publicar
      </button>
    )
  }
  if (item.readiness.status === "blocked" || item.readiness.reasons.length > 0) {
    return (
      <button
        type="button"
        onClick={onOpenBlocked}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25 sm:w-auto"
      >
        <Warning className="h-3.5 w-3.5" weight="bold" />
        Resolver pendências
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpenEdit}
      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.12] sm:w-auto"
    >
      <PencilSimple className="h-3.5 w-3.5" />
      Preparar
    </button>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="leading-tight">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="text-[13px] font-medium text-slate-100">{value}</dd>
    </div>
  )
}

function SecondaryAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08]"
    >
      {icon}
      {label}
    </button>
  )
}

function humanizeReasonHeadline(reasons: string[]): string {
  if (reasons.length === 1) return humanizeReason(reasons[0])
  return `${reasons.length} pendências`
}

function humanizeReason(reason: string): string {
  if (/preço público/i.test(reason)) return "Defina o preço público"
  if (/foto real/i.test(reason)) return "Falta foto real do aparelho"
  if (/avaliação comercial/i.test(reason)) return "Faça a avaliação comercial"
  if (/itens inclusos/i.test(reason)) return "Informe os itens inclusos"
  if (/imagem/i.test(reason)) return "Adicione uma imagem"
  if (/estoque/i.test(reason)) return "Produto fora do estoque disponível"
  return reason
}

function BlockedModal({
  item,
  onClose,
  onJump,
}: {
  item: CatalogAdminItem
  onClose: () => void
  onJump: (target: "edit" | "photos" | "review" | "items") => void
}) {
  return (
    <ModalShell onClose={onClose} title="Ainda não dá para publicar" subtitle="Resolva as pendências abaixo para liberar este produto.">
      <ul className="space-y-2">
        {item.readiness.reasons.map((reason) => (
          <li
            key={reason}
            className="flex items-start gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100"
          >
            <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="bold" />
            {humanizeReason(reason)}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onJump("edit")}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.12]"
        >
          <PencilSimple className="h-3.5 w-3.5" /> Editar vitrine
        </button>
        <button
          type="button"
          onClick={() => onJump("photos")}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.12]"
        >
          <Images className="h-3.5 w-3.5" /> Adicionar fotos
        </button>
        {item.productKind !== "sealed" ? (
          <button
            type="button"
            onClick={() => onJump("review")}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.12]"
          >
            <ClipboardText className="h-3.5 w-3.5" /> Fazer avaliação
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onJump("items")}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.12]"
        >
          <Package className="h-3.5 w-3.5" /> Itens inclusos
        </button>
      </div>
    </ModalShell>
  )
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-[#0B1220] p-5 text-slate-100 shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/[0.1]"
          >
            Fechar
          </button>
        </header>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function statusBadgeFor(item: CatalogAdminItem) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ring-1"
  if (!item.readiness.canPublish && item.readiness.status !== "archived") {
    return {
      label: "Bloqueado",
      icon: <Warning className="h-3 w-3" weight="bold" />,
      className: `${base} bg-rose-500/15 text-rose-100 ring-rose-400/45`,
    }
  }
  switch (item.readiness.status) {
    case "published":
      return {
        label: "Publicado",
        icon: <SealCheck className="h-3 w-3" weight="bold" />,
        className: `${base} bg-emerald-500/15 text-emerald-200 ring-emerald-400/40`,
      }
    case "ready":
      return {
        label: "Pronto",
        icon: <ClipboardText className="h-3 w-3" />,
        className: `${base} bg-blue-500/15 text-blue-100 ring-blue-400/40`,
      }
    case "blocked":
      return {
        label: "Bloqueado",
        icon: <Warning className="h-3 w-3" weight="bold" />,
        className: `${base} bg-rose-500/15 text-rose-200 ring-rose-400/40`,
      }
    case "archived":
      return {
        label: "Arquivado",
        icon: null,
        className: `${base} bg-white/[0.06] text-slate-300 ring-white/15`,
      }
    default:
      return {
        label: "Rascunho",
        icon: null,
        className: `${base} bg-white/[0.06] text-slate-300 ring-white/15`,
      }
  }
}

function inventoryBadgeFor(status: string) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
  if (status === "active" || status === "in_stock") {
    return { label: "Em estoque", className: `${base} bg-emerald-500/10 text-emerald-200 ring-emerald-400/25` }
  }
  if (status === "reserved") {
    return { label: "Reservado", className: `${base} bg-amber-500/10 text-amber-200 ring-amber-400/30` }
  }
  if (status === "pending") {
    return { label: "Pendente", className: `${base} bg-white/[0.06] text-slate-300 ring-white/10` }
  }
  return { label: status, className: `${base} bg-white/[0.06] text-slate-300 ring-white/10` }
}

function humanizeWarning(warning: string): string {
  if (/lacrado.*imagem padrão/i.test(warning)) return "Imagem padrão. Revise antes de divulgar."
  return warning
}

function buildPublicSlug(item: CatalogAdminItem): string {
  const tail = item.inventoryId.replace(/-/g, "").slice(0, 8)
  const slugify = (input: string) =>
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  const head = [item.title, item.subtitle?.split(" • ")[0], item.subtitle?.split(" • ")[1]]
    .filter(Boolean)
    .map((part) => slugify(String(part)))
    .filter(Boolean)
    .join("-")
  return head ? `${head}-${tail}` : tail
}
