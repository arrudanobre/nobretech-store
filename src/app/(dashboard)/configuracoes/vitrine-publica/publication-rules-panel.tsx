"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Ban, CheckCircle2, Info, Lock, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  CatalogPublicationDiagnosticsItem,
  CatalogPublicationRulesPanelData,
} from "@/lib/catalog/publication-rules-diagnostics"

type Props = {
  data: CatalogPublicationRulesPanelData | null
  loadError: string | null
}

type Filter = "all" | "published" | "blocked" | "warnings" | "ready"

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "published", label: "Publicados" },
  { key: "blocked", label: "Bloqueados" },
  { key: "warnings", label: "Com alertas" },
  { key: "ready", label: "Prontos" },
]

function statusBadge(item: CatalogPublicationDiagnosticsItem) {
  if (item.readinessStatus === "published") return <Badge variant="green">Publicado</Badge>
  if (item.readinessStatus === "ready") return <Badge variant="blue">Pronto para publicar</Badge>
  if (item.readinessStatus === "blocked") return <Badge variant="red">Bloqueado</Badge>
  if (item.readinessStatus === "warning") return <Badge variant="yellow">Com alerta</Badge>
  return <Badge variant="gray">Não publicado</Badge>
}

function ruleBadge(severity: "block" | "warning") {
  return severity === "block" ? <Badge variant="red">Bloqueio</Badge> : <Badge variant="yellow">Alerta</Badge>
}

function matchesFilter(item: CatalogPublicationDiagnosticsItem, filter: Filter) {
  if (filter === "all") return true
  if (filter === "published") return item.publicationLabel === "Publicado"
  if (filter === "blocked") return item.readinessStatus === "blocked"
  if (filter === "warnings") return item.readinessStatus === "warning" || item.warnings.length > 0
  if (filter === "ready") return item.readinessStatus === "ready"
  return true
}

export function PublicationRulesPanel({ data, loadError }: Props) {
  const [filter, setFilter] = useState<Filter>("all")

  const filteredDiagnostics = useMemo(() => {
    return data?.diagnostics.filter((item) => matchesFilter(item, filter)) ?? []
  }, [data?.diagnostics, filter])

  if (loadError) {
    return (
      <section className="rounded-2xl border border-danger-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-500" />
          <div>
            <h2 className="font-bold text-navy-900">Regras de publicação indisponíveis</h2>
            <p className="mt-1 text-sm text-gray-500">{loadError}</p>
          </div>
        </div>
      </section>
    )
  }

  if (!data) return null

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-navy-900">Regras de publicação</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Entenda quais produtos podem aparecer na vitrine pública e quais pendências impedem a publicação.
                </p>
              </div>
            </div>
          </div>
          <Badge variant="gray" className="w-fit">
            <Lock className="h-3.5 w-3.5" />
            Somente leitura
          </Badge>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-sm leading-6 text-slate-600">
            Essas regras controlam se um produto pode aparecer na vitrine pública. Esta tela é apenas informativa. Para
            alterar regras de publicação, será necessário um bloco separado com validação e auditoria.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryTile label="Regras ativas" value={`${data.summary.activePolicies}/${data.summary.totalPolicies}`} />
          <SummaryTile label="Produtos avaliados" value={String(data.summary.products)} />
          <SummaryTile label="Publicados" value={String(data.summary.published)} />
          <SummaryTile label="Bloqueados" value={String(data.summary.blocked)} />
          <SummaryTile label="Com alertas" value={String(data.summary.warnings)} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-5">
              <h3 className="font-bold text-navy-900">Regras atuais</h3>
              <p className="mt-1 text-xs text-gray-500">Leitura operacional das regras cadastradas para a vitrine.</p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {data.policies.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma policy cadastrada para esta empresa.</p>
              ) : (
                data.policies.map((policy) => (
                  <article key={policy.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-navy-900">{policy.label}</h4>
                        <p className="mt-1 text-xs leading-5 text-gray-500">{policy.scopeDescription}</p>
                      </div>
                      <Badge variant={policy.active ? "green" : "gray"}>{policy.activeLabel}</Badge>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <PolicyLine label="Pode aparecer quando estiver em" value={policy.statusLabels.join(", ") || "Nenhum status configurado"} />
                      <PolicyLine label="Limite de produtos" value={policy.maxProductsLabel} />
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={policy.requiresRealPhotoLabel.startsWith("Exige") ? "yellow" : "gray"}>{policy.requiresRealPhotoLabel}</Badge>
                        <Badge variant={policy.requiresReviewLabel.startsWith("Exige") ? "yellow" : "gray"}>{policy.requiresReviewLabel}</Badge>
                        <Badge variant={policy.requiresIncludedItemsLabel.startsWith("Exige") ? "yellow" : "gray"}>{policy.requiresIncludedItemsLabel}</Badge>
                        <Badge variant={policy.requiresPublicPriceLabel.startsWith("Exige") ? "yellow" : "gray"}>{policy.requiresPublicPriceLabel}</Badge>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-gray-100 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-bold text-navy-900">Diagnóstico de produtos</h3>
                <p className="mt-1 text-xs text-gray-500">Produtos publicados ou candidatos e o motivo do estado atual.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    size="sm"
                    variant={filter === option.key ? "secondary" : "outline"}
                    onClick={() => setFilter(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {filteredDiagnostics.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">Nenhum produto encontrado neste filtro.</div>
              ) : (
                filteredDiagnostics.map((item) => (
                  <article key={item.inventoryId} className="p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-navy-900">{item.product}</h4>
                          {statusBadge(item)}
                        </div>
                        {item.subtitle && <p className="mt-1 text-sm text-gray-500">{item.subtitle}</p>}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1">{item.inventoryStatusLabel}</span>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1">{item.conditionLabel}</span>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1">{item.publicationLabel}</span>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{item.policyLabel}</span>
                        </div>
                      </div>
                    </div>

                    {(item.reasons.length > 0 || item.warnings.length > 0) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {item.reasons.length > 0 && (
                          <ReasonList icon="block" title="Bloqueios" items={item.reasons} />
                        )}
                        {item.warnings.length > 0 && (
                          <ReasonList icon="warning" title="Alertas" items={item.warnings} />
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <RuleGroup
            title="Regras que bloqueiam"
            description="Quando uma dessas regras falha, o produto não deve aparecer como publicável."
            rules={data.blockingRules}
            severity="block"
          />
          <RuleGroup
            title="Regras que alertam"
            description="Alertas orientam revisão, mas não impedem a publicação por si só."
            rules={data.warningRules}
            severity="warning"
          />
        </aside>
      </div>
    </section>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-navy-900">{value}</p>
    </div>
  )
}

function PolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 font-semibold text-navy-900">{value}</p>
    </div>
  )
}

function RuleGroup({
  title,
  description,
  rules,
  severity,
}: {
  title: string
  description: string
  rules: CatalogPublicationRulesPanelData["blockingRules"]
  severity: "block" | "warning"
}) {
  const Icon = severity === "block" ? Ban : AlertTriangle
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${severity === "block" ? "bg-danger-100 text-danger-600" : "bg-warning-100 text-amber-700"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-navy-900">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rules.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma regra cadastrada.</p>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {ruleBadge(rule.severity)}
                {!rule.active && <Badge variant="gray">Inativa</Badge>}
              </div>
              <p className="mt-2 text-sm font-semibold text-navy-900">{rule.label}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{rule.message}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function ReasonList({ icon, title, items }: { icon: "block" | "warning"; title: string; items: string[] }) {
  const Icon = icon === "block" ? Ban : AlertTriangle
  return (
    <div className={`rounded-2xl border p-3 ${icon === "block" ? "border-danger-100 bg-danger-50" : "border-warning-100 bg-warning-50"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${icon === "block" ? "text-danger-600" : "text-amber-700"}`} />
        <p className="text-sm font-semibold text-navy-900">{title}</p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-5 text-gray-700">
            {icon === "block" ? <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
