import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ChatCircle,
  Check,
  Info,
  SealCheck,
  SealPercent,
  ShieldCheck,
  Truck,
} from "@phosphor-icons/react/dist/ssr"
import { CatalogShell } from "@/components/catalog/catalog-shell"
import { ProductGallery } from "@/components/catalog/product-gallery"
import { ProductScoreBadge } from "@/components/catalog/product-score-badge"
import { ProductConditionList } from "@/components/catalog/product-condition-list"
import { ProductInstallmentOptions } from "@/components/catalog/product-installment-options"
import { ProductWhatsAppCta } from "@/components/catalog/product-whatsapp-cta"
import { ProductShareActions } from "@/components/catalog/product-share-actions"
import { getPublicProductBySlug } from "@/lib/catalog/queries"
import { formatScore10 } from "@/lib/catalog/score"
import { formatBRL } from "@/lib/helpers"
import { getCatalogDisplayPrice, getCatalogSavings, isValidPromoPrice } from "@/lib/catalog/pricing"
import {
  buildCatalogLocationLabel,
  buildCatalogProductUrl,
  getCatalogCompanyIdentity,
} from "@/lib/catalog/company-identity"

export const dynamic = "force-dynamic"

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const identity = await getCatalogCompanyIdentity()
  const product = await getPublicProductBySlug(slug, { brandShortName: identity.shortName })
  if (!product) {
    return { title: "Aparelho não encontrado" }
  }

  const productUrl = buildCatalogProductUrl(identity, product.slug)
  const displayPrice = getCatalogDisplayPrice(product)
  const hasPrice = Number.isFinite(displayPrice) && displayPrice > 0
  const brandTail = identity.shortName ? ` na ${identity.shortName}` : ""
  const description = hasPrice
    ? `${product.title} disponível por ${formatBRL(displayPrice)}${brandTail}. Veja fotos, condição, garantia e atendimento pelo WhatsApp.`
    : `${product.title} disponível${brandTail}. Veja fotos, condição, garantia e atendimento pelo WhatsApp.`

  const primaryImage = product.images[0]
  const ogImageUrl = primaryImage?.url ?? identity.ogImageUrl ?? undefined
  const titleTail = identity.shortName ? ` | ${identity.shortName}` : ""
  const ogImageAlt = primaryImage?.alt
    ? `${product.title} — ${primaryImage.alt}`
    : `${product.title}${titleTail || ""}`

  const og: Metadata["openGraph"] = {
    title: `${product.title}${titleTail}`,
    description,
    locale: "pt_BR",
    type: "website",
    siteName: identity.displayName,
  }
  if (productUrl) og.url = productUrl
  if (ogImageUrl) og.images = [{ url: ogImageUrl, alt: ogImageAlt }]

  return {
    title: `${product.title}${titleTail}`,
    description,
    alternates: productUrl ? { canonical: productUrl } : undefined,
    openGraph: og,
    twitter: {
      card: "summary_large_image",
      title: `${product.title}${titleTail}`,
      description,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: ogImageAlt }] } : {}),
    },
  }
}

export default async function CatalogoProductPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const identity = await getCatalogCompanyIdentity()
  const product = await getPublicProductBySlug(slug, { brandShortName: identity.shortName })
  if (!product) notFound()

  const isSealed = product.condition === "sealed"
  const hasPromo = isValidPromoPrice(product.price, product.promoPrice)
  const displayPrice = getCatalogDisplayPrice(product)
  const savings = getCatalogSavings(product)
  const productUrl =
    buildCatalogProductUrl(identity, product.slug) ?? `/catalogo/${product.slug}`
  const location = buildCatalogLocationLabel(identity)
  const supportLine = location
    ? `Atendimento pelo WhatsApp e entrega presencial em ${identity.city ?? location}.`
    : "Atendimento pelo canal configurado."
  const callToFinalize = identity.shortName
    ? `Chame a ${identity.shortName} no WhatsApp e confirme a disponibilidade.`
    : "Chame a loja no WhatsApp e confirme a disponibilidade."

  return (
    <CatalogShell identity={identity}>
      <section className="overflow-x-hidden px-4 pb-36 pt-3 sm:px-6 sm:pb-20 sm:pt-6">
        <div className="mx-auto max-w-5xl min-w-0">
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao catálogo
          </Link>

          <div className="mt-4 grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
            <ProductGallery images={product.images} productTitle={product.title} />

            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {isSealed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#D6A84F]/18 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#F2D88A] ring-1 ring-[#D6A84F]/35">
                      Lacrado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-zinc-100 ring-1 ring-white/15">
                      {product.condition === "open_box" ? "Open Box" : "Seminovo"}
                    </span>
                  )}
                  {product.hasRealPhotos ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-emerald-200 ring-1 ring-emerald-400/35">
                      Foto real
                    </span>
                  ) : null}
                  {hasPromo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#D6A84F] px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.18em] text-[#160f05] shadow-[0_10px_28px_rgba(214,168,79,0.3)]">
                      <SealPercent className="h-3 w-3" weight="bold" />
                      Promoção
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-3 font-[family-name:var(--font-syne)] text-[26px] font-semibold leading-[1.1] sm:text-[32px]">
                  {product.title}
                </h1>
                {product.subtitle ? (
                  <p className="mt-1 text-[14px] text-zinc-400">{product.subtitle}</p>
                ) : null}
              </div>

              {isSealed ? (
                <div className="flex items-center gap-3.5 rounded-[24px] border border-[#D6A84F]/30 bg-gradient-to-br from-[#D6A84F]/14 to-[#D6A84F]/5 p-4 backdrop-blur">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D6A84F]/20 text-[#F2D88A]">
                    <SealCheck className="h-5 w-5" weight="duotone" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-[#F5DC97]">Lacrado de fábrica</p>
                    <p className="text-[12px] text-zinc-300">{product.warrantyLabel}</p>
                  </div>
                </div>
              ) : product.score != null ? (
                <div className="rounded-[24px] border border-emerald-400/25 bg-emerald-500/[0.08] p-4 backdrop-blur">
                  <div className="flex items-center gap-4">
                    <ProductScoreBadge score={product.score} size="lg" />
                    <div className="leading-tight">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
                        Score
                      </p>
                      <p className="mt-1 text-[20px] font-semibold text-white">
                        {formatScore10(product.score)}
                        <span className="ml-0.5 text-[12px] font-medium opacity-80">/10</span>
                      </p>
                      <p className="text-[12.5px] text-emerald-200">{product.scoreLabel}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11.5px] text-zinc-400">
                    Uma nota simples para você entender o estado geral do aparelho.
                  </p>
                </div>
              ) : null}

              <div className={`rounded-[24px] border p-5 backdrop-blur ${
                hasPromo
                  ? "border-[#D6A84F]/35 bg-gradient-to-br from-[#D6A84F]/14 to-white/[0.035] shadow-[0_18px_54px_rgba(214,168,79,0.16)]"
                  : "border-white/[0.08] bg-white/[0.035]"
              }`}>
                {hasPromo ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#D6A84F] px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.18em] text-[#160f05]">
                      <SealPercent className="h-3 w-3" weight="bold" />
                      Oferta
                    </span>
                    {savings ? (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                        Economize {formatBRL(savings)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {hasPromo ? (
                  <p className="text-[13px] text-zinc-500 line-through">De {formatBRL(product.price)}</p>
                ) : null}
                <p className={`font-semibold leading-none ${hasPromo ? "mt-1 text-[34px] text-[#F5DC97] sm:text-[40px]" : "text-[32px] text-white sm:text-[36px]"}`}>
                  {hasPromo ? "Por " : ""}
                  {formatBRL(displayPrice)}
                </p>
                <ProductInstallmentOptions
                  options={product.installmentOptions}
                  fallbackText={product.installmentText}
                  fallbackTotalText={product.installmentTotalText}
                  fallbackNote={product.installmentNote}
                />
                <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">{supportLine}</p>
                <div className="mt-4">
                  <ProductWhatsAppCta
                    product={product}
                    whatsappEndpoint={identity.whatsapp}
                    brandShortName={identity.shortName}
                  />
                </div>
                <div className="mt-3">
                  <ProductShareActions
                    productTitle={product.title}
                    productUrl={productUrl}
                    brandShortName={identity.shortName}
                  />
                </div>
              </div>

              <ul className="grid min-w-0 grid-cols-3 gap-2">
                <TrustItem icon={<ShieldCheck className="h-4 w-4" weight="duotone" />} label={product.warrantyLabel} />
                <TrustItem icon={<Truck className="h-4 w-4" weight="duotone" />} label={product.availabilityLabel} />
                <TrustItem icon={<SealCheck className="h-4 w-4" weight="duotone" />} label="Procedência verificada" />
              </ul>
            </div>
          </div>

          <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="min-w-0 space-y-7">
              <section>
                <h2 className="font-[family-name:var(--font-syne)] text-[18px] font-semibold">Sobre o aparelho</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">{product.description}</p>
              </section>

              <section>
                <h2 className="font-[family-name:var(--font-syne)] text-[18px] font-semibold">
                  {isSealed ? "Condição" : "Condição do aparelho"}
                </h2>
                {!isSealed ? (
                  <p className="mt-1 text-[12px] text-zinc-400">
                    Avaliação simples para você ver o estado de cada parte.
                  </p>
                ) : null}
                <div className="mt-3">
                  <ProductConditionList
                    items={product.conditionReview}
                    variant={isSealed ? "sealed" : "seminovo"}
                  />
                </div>
              </section>
            </div>

            <div className="min-w-0 space-y-5">
              {product.includedItems.length > 0 ? (
                <section className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur">
                  <h2 className="font-[family-name:var(--font-syne)] text-[16px] font-semibold">
                    Itens inclusos
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {product.includedItems.map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center gap-2.5 text-[13.5px] text-zinc-100"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            item.included
                              ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/35"
                              : "bg-white/[0.05] text-zinc-500 ring-1 ring-white/10"
                          }`}
                        >
                          <Check className="h-3 w-3" weight="bold" />
                        </span>
                        <span className={item.included ? "" : "text-zinc-500 line-through"}>
                          {item.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur">
                <h2 className="font-[family-name:var(--font-syne)] text-[16px] font-semibold">
                  Informações adicionais
                </h2>
                <dl className="mt-3 min-w-0 divide-y divide-white/[0.05]">
                  {product.specs.map((spec) => (
                    <div key={spec.label} className="flex min-w-0 items-center justify-between gap-3 py-2">
                      <dt className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{spec.label}</dt>
                      <dd className="min-w-0 text-right text-[13px] font-medium text-white">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                {product.maskedImei ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <Info className="h-3 w-3" />
                    IMEI parcialmente mascarado para proteger o aparelho.
                  </p>
                ) : null}
              </section>

              <section className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5 text-center backdrop-blur">
                <h2 className="font-[family-name:var(--font-syne)] text-[16px] font-semibold">
                  Quer este aparelho?
                </h2>
                <p className="mt-1 text-[12px] text-zinc-400">{callToFinalize}</p>
                <div className="mt-4">
                  <ProductWhatsAppCta
                    product={product}
                    whatsappEndpoint={identity.whatsapp}
                    brandShortName={identity.shortName}
                  />
                </div>
                <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
                  <ChatCircle className="h-3 w-3" />
                  Atendimento direto via WhatsApp
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 max-w-full border-t border-white/[0.07] bg-[#050607]/92 px-4 pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-2.5 backdrop-blur-xl sm:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {isSealed ? "Lacrado" : product.scoreLabel || product.conditionLabel}
            </p>
            {hasPromo ? (
              <p className="text-[10.5px] text-zinc-500 line-through">{formatBRL(product.price)}</p>
            ) : null}
            <p className="text-[15px] font-semibold text-white">{formatBRL(displayPrice)}</p>
            {product.installmentOptions.length > 0 || product.installmentText ? (
              <p className="mt-0.5 max-w-[190px] text-[10.5px] leading-tight text-zinc-400">
                {product.installmentOptions.length > 0
                  ? "Parcelamento no cartão disponível"
                  : product.installmentText}
              </p>
            ) : null}
          </div>
          <div className="ml-auto shrink-0">
            <ProductWhatsAppCta
              product={product}
              whatsappEndpoint={identity.whatsapp}
              brandShortName={identity.shortName}
              variant="sticky"
            />
          </div>
        </div>
      </div>
    </CatalogShell>
  )
}

function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-2 py-3 text-center">
      <span className="text-[#F2D88A]">{icon}</span>
      <span className="text-[11px] font-medium leading-tight text-zinc-200">{label}</span>
    </li>
  )
}
