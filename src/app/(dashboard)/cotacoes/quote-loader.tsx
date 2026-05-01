"use client"

import dynamic from "next/dynamic"

const QuotesClient = dynamic(() => import("./quote-client"), {
  ssr: false,
  loading: () => (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-2xl font-display font-bold text-navy-900 font-syne">Orcamento</h2>
        <p className="text-sm text-gray-500">Preparando ferramenta de cotacao...</p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
        Carregando orcamento...
      </div>
    </div>
  ),
})

export function QuoteLoader() {
  return <QuotesClient />
}
